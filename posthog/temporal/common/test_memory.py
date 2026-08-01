from typing import Any

import pytest
from unittest.mock import patch

from posthog.temporal.common import memory
from posthog.temporal.common.memory import (
    MemoryUsage,
    memory_fraction_from_heartbeat,
    memory_heartbeat_fields,
    read_memory_usage,
)


def _cgroup_paths(tmp_path, files: dict[str, str]) -> dict[str, Any]:
    absent = str(tmp_path / "absent")
    paths = {
        "CGROUP_V2_CURRENT": absent,
        "CGROUP_V2_MAX": absent,
        "CGROUP_V1_CURRENT": absent,
        "CGROUP_V1_MAX": absent,
    }
    for constant, contents in files.items():
        path = tmp_path / constant.lower()
        path.write_text(contents)
        paths[constant] = str(path)
    return paths


class TestHeartbeatMemory:
    def test_fields_written_into_a_heartbeat_are_readable_back(self):
        # Writer and reader sit either side of a worker death: the heartbeater emits these keys and the
        # next attempt reads them to decide whether memory was the cause. Renaming one side alone would
        # leave every death unclassified, silently switching the OOM trigger off.
        with patch.object(memory, "read_memory_usage", return_value=MemoryUsage(current_bytes=3, limit_bytes=4)):
            payload = {"host": "pod-a", "ts": 1.0, **memory_heartbeat_fields()}

        assert memory_fraction_from_heartbeat(payload) == 0.75

    @pytest.mark.parametrize(
        "payload",
        [
            {"host": "pod-a", "ts": 1.0},  # a worker from before memory sampling shipped
            {"mem_current": 5, "mem_limit": 0},
            {"mem_current": "n/a", "mem_limit": "n/a"},
        ],
    )
    def test_unusable_readings_are_unknown_not_zero(self, payload):
        # Unknown keeps the event counting downstream; a 0.0 would read as a healthy worker and discard
        # it, which during a partial rollout would drop real OOMs.
        assert memory_fraction_from_heartbeat(payload) is None


class TestReadMemoryUsage:
    def test_reads_a_limited_cgroup(self, tmp_path):
        with patch.multiple(memory, **_cgroup_paths(tmp_path, {"CGROUP_V2_CURRENT": "500", "CGROUP_V2_MAX": "1000"})):
            assert read_memory_usage() == MemoryUsage(current_bytes=500, limit_bytes=1000)

    def test_falls_back_to_cgroup_v1(self, tmp_path):
        with patch.multiple(memory, **_cgroup_paths(tmp_path, {"CGROUP_V1_CURRENT": "500", "CGROUP_V1_MAX": "1000"})):
            assert read_memory_usage() == MemoryUsage(current_bytes=500, limit_bytes=1000)

    @pytest.mark.parametrize(
        "files",
        [
            # v2 spells "no limit" as a keyword.
            {"CGROUP_V2_CURRENT": "500", "CGROUP_V2_MAX": "max"},
            # v1 spells it as a huge sentinel. Taken for a real limit it would put every fraction near
            # zero, classifying every OOM as unrelated to memory and disabling the trigger for good.
            {"CGROUP_V1_CURRENT": "500", "CGROUP_V1_MAX": str((1 << 62) + 4096)},
            # No cgroup at all (a dev machine).
            {},
        ],
    )
    def test_reports_unknown_without_a_real_limit(self, tmp_path, files):
        with patch.multiple(memory, **_cgroup_paths(tmp_path, files)):
            assert read_memory_usage() is None
