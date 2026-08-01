"""Container memory usage, sampled into Temporal activity heartbeats.

Reads the cgroup the worker runs in, which is the accounting the kernel OOM killer acts on, so the
last heartbeat before a worker dies silently carries evidence of whether memory was the cause.
Without it, "stopped heartbeating" is indistinguishable between an OOM kill, a deploy, an eviction
and a lost heartbeat.

The numbers are container-level, not per-activity: one worker process runs up to ~50 activities as
threads sharing a heap, and their native (Arrow / delta-rs) working sets are not separable here. So
this answers "was this death memory-related", never "which activity caused it".
"""

from __future__ import annotations

import dataclasses
from collections.abc import Mapping
from typing import Any

CGROUP_V2_CURRENT = "/sys/fs/cgroup/memory.current"
CGROUP_V2_MAX = "/sys/fs/cgroup/memory.max"
CGROUP_V1_CURRENT = "/sys/fs/cgroup/memory/memory.usage_in_bytes"
CGROUP_V1_MAX = "/sys/fs/cgroup/memory/memory.limit_in_bytes"

# cgroup v1 spells "no limit" as a huge sentinel (PAGE_COUNTER_MAX scaled by page size) instead of a
# keyword, and the exact value varies by kernel and page size, so treat anything this large as no limit.
_V1_UNLIMITED_MIN = 1 << 62

MEM_CURRENT_KEY = "mem_current"
MEM_LIMIT_KEY = "mem_limit"


@dataclasses.dataclass(frozen=True, kw_only=True)
class MemoryUsage:
    current_bytes: int
    limit_bytes: int

    @property
    def fraction(self) -> float:
        return self.current_bytes / self.limit_bytes


def _read_int(path: str) -> int | None:
    try:
        with open(path) as f:
            return int(f.read().strip())
    except (OSError, ValueError):
        return None


def read_memory_usage() -> MemoryUsage | None:
    """Current usage and limit of the worker's memory cgroup, or None when unavailable.

    None covers every environment without a limited cgroup (non-Linux dev machines, unconstrained
    containers), so callers must treat a missing measurement as "unknown", never as "healthy".
    """
    current = _read_int(CGROUP_V2_CURRENT)
    if current is not None:
        limit = _read_int(CGROUP_V2_MAX)  # "max" (unlimited) fails the int parse and reads as None
        if limit is not None and limit > 0:
            return MemoryUsage(current_bytes=current, limit_bytes=limit)
        return None

    current = _read_int(CGROUP_V1_CURRENT)
    limit = _read_int(CGROUP_V1_MAX)
    if current is None or limit is None or limit <= 0 or limit >= _V1_UNLIMITED_MIN:
        return None
    return MemoryUsage(current_bytes=current, limit_bytes=limit)


def memory_heartbeat_fields() -> dict[str, int]:
    """Memory fields to merge into a heartbeat payload; empty when memory can't be measured."""
    usage = read_memory_usage()
    if usage is None:
        return {}
    return {MEM_CURRENT_KEY: usage.current_bytes, MEM_LIMIT_KEY: usage.limit_bytes}


def memory_fraction_from_heartbeat(payload: Mapping[str, Any]) -> float | None:
    """Fraction of the memory limit in use at the time `payload` was emitted.

    None when the beat predates memory sampling (an old worker mid-rollout) or carries unusable
    values, which callers must distinguish from a low fraction.
    """
    current = payload.get(MEM_CURRENT_KEY)
    limit = payload.get(MEM_LIMIT_KEY)
    try:
        current = float(current)  # type: ignore[arg-type]
        limit = float(limit)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if limit <= 0:
        return None
    return current / limit
