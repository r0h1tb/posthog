from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from dateutil import parser

from posthog.models.scoping.root_mixin import TeamScopedRootMixin
from posthog.models.utils import UUIDModel, sane_repr

if TYPE_CHECKING:
    from products.warehouse_sources.backend.models.external_data_schema import ExternalDataSchema

# Activities killed by the same pod OOM are rescheduled together, so events within this window of each
# other on one host are treated as one kill. Wide enough to absorb the spread in Temporal's detection of
# each activity's timeout, short enough not to merge unrelated kills on a recycled host.
BLAME_WINDOW_SECONDS = 300


def memory_pressure_threshold() -> float:
    return float(getattr(settings, "DATA_WAREHOUSE_OOM_MEMORY_FRACTION_THRESHOLD", 0.7))


def is_memory_related(memory_fraction: float | None) -> bool:
    """Whether a heartbeat's memory reading is consistent with the worker having died of memory.

    The threshold sits below 1.0 on purpose: beats are seconds apart and an allocation burst can cross
    the limit between two of them, so the last beat before an OOM shows pressure rather than exhaustion.
    An unknown reading counts, for the reason given in `recent_count`.
    """
    return memory_fraction is None or memory_fraction >= memory_pressure_threshold()


class ExternalDataSchemaOOMEvent(TeamScopedRootMixin, UUIDModel):
    """Append-only log of detected sync OOMs (pod heartbeat-timeouts) for an external data schema.

    Recorded once per Temporal retry attempt that follows an OOM'd attempt — a single job can OOM
    many times before its terminal status — so this is an occurrence log, not a counter. Drives the
    repartition trigger via `recent_count()`; kept bounded by pruning to a retention window.
    """

    # db_constraint=False on the Team FK: a real constraint takes a SHARE ROW EXCLUSIVE lock on the
    # hot posthog_team table on create. Team scoping is enforced at the app layer by TeamScopedRootMixin.
    team = models.ForeignKey("posthog.Team", on_delete=models.CASCADE, db_constraint=False)
    schema = models.ForeignKey(
        "warehouse_sources.ExternalDataSchema", on_delete=models.CASCADE, related_name="oom_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Context captured from the prior (OOM'd) attempt's last heartbeat.
    run_id = models.CharField(max_length=400, null=True, blank=True)
    host = models.CharField(max_length=400, null=True, blank=True)
    gap_seconds = models.FloatField(null=True, blank=True)
    # Share of the worker's memory cgroup in use at that last heartbeat. Null when the beat predates
    # memory sampling or the cgroup was unreadable, which means "unknown" rather than "healthy"
    # (see `recent_count`).
    memory_fraction = models.FloatField(null=True, blank=True)
    # The schema's largest measured partition when the event was recorded. Snapshotted rather than read
    # live because blame is judged against how big this table was *at the time of the kill*.
    max_partition_bytes = models.BigIntegerField(null=True, blank=True)

    all_teams = models.Manager()  # noqa: DJ012 — both are managers, ruff misclassifies this

    __repr__ = sane_repr("schema_id", "created_at")

    class Meta:
        # Django framework internals (cascade delete, related-object access, prefetch) read through
        # `_default_manager` / `_base_manager` and expect an unfiltered manager. Point them at the plain
        # `all_teams` so a schema delete that cascades to `oom_events` doesn't hit the fail-closed manager.
        # `objects` (from TeamScopedRootMixin) stays fail-closed for explicit app code (recent_count / recording).
        default_manager_name = "all_teams"
        indexes = [
            models.Index(fields=["schema", "created_at"], name="dwh_oom_schema_created_idx"),
            # Serves the co-tenant lookup in `_without_victims`, which spans teams (a worker pod is
            # multi-tenant) and so can't ride the schema-scoped index above.
            models.Index(fields=["host", "created_at"], name="dwh_oom_host_created_idx"),
        ]

    @classmethod
    def recent_count(cls, schema: "ExternalDataSchema", *, days: int) -> int:
        """Number of distinct sync runs within the last `days` whose OOM this schema is answerable for.

        The raw signal behind these rows is "the previous attempt stopped heartbeating", which a deploy,
        an eviction, a lost heartbeat and a real OOM all produce identically. Three filters narrow it to
        evidence that *this table's* memory usage is the problem, because everything downstream (a finer
        repartition) is only a fix for that one cause:

        * **Memory-gated**: the last heartbeat must show the cgroup near its limit. A worker killed by a
          deploy dies with normal memory. An unknown fraction (a beat from before memory sampling, or an
          unreadable cgroup) still counts: where the signal is unavailable we keep the old behavior rather
          than silently disabling the trigger.
        * **Blame-assigned**: a worker pod runs many activities, so one activity's OOM kills every
          co-tenant and each records an event. Only the plausible culprit counts; see `_without_victims`.
        * **Per run, not per attempt**: one job can retry many times and record an event each time, so
          counting rows lets a single bad afternoon cross the threshold alone.

        `days` is required (no default) so it stays sourced from `DATA_WAREHOUSE_REPARTITION_OOM_WINDOW_DAYS`
        at the call site rather than duplicating that window here where the two could silently diverge.

        The window is also floored at the schema's `last_repartition_at`: a completed repartition addresses
        the OOMs that preceded it, so counting them again would re-trigger a repartition on the same (now
        healthy) table every cooldown until they age out. Only OOMs a repartition did not fix count.
        """
        since = timezone.now() - timedelta(days=days)
        last_repartition_at = schema.last_repartition_at
        if last_repartition_at:
            try:
                since = max(since, parser.parse(last_repartition_at))
            except (ValueError, TypeError):
                pass

        events = list(
            cls.objects.for_team(schema.team_id)
            .filter(schema_id=schema.pk, created_at__gte=since)
            .values("run_id", "host", "created_at", "memory_fraction", "max_partition_bytes")
        )
        memory_related = [event for event in events if is_memory_related(event["memory_fraction"])]
        if not memory_related:
            return 0
        attributed = cls._without_victims(schema, memory_related)
        # An event with no run to group by can't be deduplicated, so it counts on its own rather than
        # collapsing every such event into one.
        return len({event["run_id"] for event in attributed if event["run_id"]}) + sum(
            1 for event in attributed if not event["run_id"]
        )

    @classmethod
    def _without_victims(cls, schema: "ExternalDataSchema", events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Drop events where a co-tenant on the same worker was the likelier cause of the kill.

        A pod OOM kills every activity in the container, so a single oversized table takes down up to ~50
        unrelated schemas, each of which records a genuine, memory-gated event. Left unfiltered those
        victims accumulate toward their own repartition threshold and get shrunk for someone else's
        memory usage, which is poisoning that repartitioning cannot fix and makes worse.

        The kill is identified by (host, ±`BLAME_WINDOW_SECONDS`) and blame goes to the largest measured
        partition in that group: that is the table whose merge actually allocates the most. An event is
        kept when nothing outranks it, including when its own size is unknown, so a missing measurement
        never silently exonerates a table.
        """
        window = timedelta(seconds=BLAME_WINDOW_SECONDS)
        hosted = [event for event in events if event["host"]]
        if not hosted:
            return events

        cohort_filter = Q()
        for event in hosted:
            cohort_filter |= Q(
                host=event["host"],
                created_at__gte=event["created_at"] - window,
                created_at__lte=event["created_at"] + window,
            )
        # Deliberately cross-team: a worker pod is multi-tenant, so the co-tenant that caused the kill is
        # usually another team's schema entirely. Reads a bounded set of neighboring rows, no team data.
        co_tenants = [
            row
            for row in cls.all_teams.filter(cohort_filter)
            .exclude(schema_id=schema.pk)
            .values("host", "created_at", "memory_fraction", "max_partition_bytes")
            if is_memory_related(row["memory_fraction"])
        ]
        if not co_tenants:
            return events

        def outranked(event: dict[str, Any]) -> bool:
            own_bytes = event["max_partition_bytes"]
            if own_bytes is None:
                return False
            return any(
                row["max_partition_bytes"] is not None
                and row["max_partition_bytes"] > own_bytes
                and row["host"] == event["host"]
                and abs(row["created_at"] - event["created_at"]) <= window
                for row in co_tenants
            )

        return [event for event in events if not outranked(event)]
