#!/usr/bin/env python3
"""Tests for claims.py. stdlib unittest only — run: python3 claims_test.py"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import claims  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CLAIMS_PY = os.path.join(HERE, "claims.py")


class Base(unittest.TestCase):
    def setUp(self):
        self.repo = tempfile.mkdtemp(prefix="claims-test-")
        os.makedirs(os.path.join(self.repo, ".orchestrator", "state"))
        self._real_now = claims._now
        self.addCleanup(self._restore_now)
        self.addCleanup(shutil.rmtree, self.repo, True)

    def _restore_now(self):
        claims._now = self._real_now

    def freeze(self, dt):
        claims._now = lambda: dt

    def raw(self):
        with open(
            os.path.join(self.repo, ".orchestrator", "state", "claims.json"),
            encoding="utf8",
        ) as fh:
            return json.load(fh)


class TestAdd(Base):
    def test_add_writes_a_claim_with_all_fields(self):
        claims.cmd_add("t1", self.repo, 4242, ["server/adapters/agents.ts"])
        data = self.raw()
        self.assertEqual(len(data), 1)
        c = data[0]
        self.assertEqual(c["taskId"], "t1")
        self.assertEqual(c["repo"], os.path.basename(self.repo))
        self.assertEqual(c["pid"], 4242)
        self.assertEqual(c["files"], ["server/adapters/agents.ts"])
        self.assertTrue(c["claimedAt"].endswith("Z"))
        self.assertTrue(c["heartbeatAt"].endswith("Z"))

    def test_add_upserts_by_task_id_preserving_claimed_at(self):
        t0 = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)
        self.freeze(t0)
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.freeze(t0 + timedelta(seconds=60))
        claims.cmd_add("t1", self.repo, 2, ["b.ts"])  # same TID refire (FIX path)
        data = self.raw()
        self.assertEqual(len(data), 1, "refire must not append a second entry")
        self.assertEqual(data[0]["files"], ["b.ts"])
        self.assertEqual(data[0]["pid"], 2)
        self.assertEqual(data[0]["claimedAt"], "2026-09-04T12:00:00Z")
        self.assertEqual(data[0]["heartbeatAt"], "2026-09-04T12:01:00Z")

    def test_paths_are_normalised(self):
        claims.cmd_add("t1", self.repo, None, ["./src/api.ts", "server/"])
        self.assertEqual(self.raw()[0]["files"], ["src/api.ts", "server"])

    def test_absolute_paths_are_stored_repo_relative(self):
        claims.cmd_add(
            "t1", self.repo, None, [os.path.join(self.repo, "server/adapters/agents.ts")]
        )
        self.assertEqual(self.raw()[0]["files"], ["server/adapters/agents.ts"])

    def test_home_prefixed_paths_are_expanded(self):
        claims.cmd_add("t1", self.repo, None, ["~/x.ts"])
        expected = os.path.expanduser("~/x.ts").lstrip("/")
        self.assertEqual(self.raw()[0]["files"], [expected])

    def test_the_repo_root_itself_is_dropped_not_stored_as_empty(self):
        claims.cmd_add("t1", self.repo, None, [self.repo, "a.ts"])
        self.assertEqual(self.raw()[0]["files"], ["a.ts"])


class TestAbsolutePathOverlap(Base):
    """An absolute `## Owns:` entry must still conflict with a relative claim.
    Before _rel() this was a SILENT MISS: check exited 0 and the spoke launched
    straight into someone else's files."""

    def test_absolute_request_conflicts_with_relative_claim(self):
        claims.cmd_add("t1", self.repo, 1, ["server/adapters/agents.ts"])
        abs_path = os.path.join(self.repo, "server/adapters/agents.ts")
        self.assertEqual(claims.cmd_check(self.repo, [abs_path], None), 1)

    def test_relative_request_conflicts_with_absolute_claim(self):
        claims.cmd_add(
            "t1", self.repo, 1, [os.path.join(self.repo, "server/adapters/agents.ts")]
        )
        self.assertEqual(
            claims.cmd_check(self.repo, ["server/adapters/agents.ts"], None), 1
        )

    def test_absolute_dir_prefix_still_covers_files_under_it(self):
        claims.cmd_add("t1", self.repo, 1, ["server"])
        self.assertEqual(
            claims.cmd_check(self.repo, [os.path.join(self.repo, "server/x.ts")], None),
            1,
        )

    def test_absolute_path_outside_the_repo_does_not_falsely_conflict(self):
        claims.cmd_add("t1", self.repo, 1, ["server/adapters/agents.ts"])
        self.assertEqual(
            claims.cmd_check(self.repo, ["/elsewhere/server/adapters/agents.ts"], None),
            0,
        )


class TestCheck(Base):
    def test_conflict_on_identical_path(self):
        claims.cmd_add("t1", self.repo, 1, ["server/adapters/agents.ts"])
        rc = claims.cmd_check(self.repo, ["server/adapters/agents.ts"], None)
        self.assertEqual(rc, 1)

    def test_no_conflict_on_different_files(self):
        claims.cmd_add("t1", self.repo, 1, ["server/adapters/agents.ts"])
        rc = claims.cmd_check(self.repo, ["src/components/AgentStreams.tsx"], None)
        self.assertEqual(rc, 0)

    def test_glob_overlap_both_directions(self):
        # live claim is the glob, request is concrete
        claims.cmd_add("t1", self.repo, 1, ["src/*.ts"])
        self.assertEqual(claims.cmd_check(self.repo, ["src/api.ts"], None), 1)
        # live claim is concrete, request is the glob
        claims.cmd_remove("t1", self.repo)
        claims.cmd_add("t2", self.repo, 1, ["src/api.ts"])
        self.assertEqual(claims.cmd_check(self.repo, ["src/*.ts"], None), 1)

    def test_dir_prefix_covers_files_under_it(self):
        claims.cmd_add("t1", self.repo, 1, ["server/adapters"])
        self.assertEqual(
            claims.cmd_check(self.repo, ["server/adapters/agents.ts"], None), 1
        )
        # and the reverse: claiming a file conflicts with claiming its dir
        claims.cmd_remove("t1", self.repo)
        claims.cmd_add("t2", self.repo, 1, ["server/adapters/agents.ts"])
        self.assertEqual(claims.cmd_check(self.repo, ["server/adapters"], None), 1)
        # a sibling dir must NOT conflict (prefix check is segment-aware)
        self.assertEqual(claims.cmd_check(self.repo, ["server/adapters2"], None), 0)

    def test_ignore_task_lets_the_same_tid_refire(self):
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 1)
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], "t1"), 0)

    def test_presence_only_claim_conflicts_with_nothing(self):
        claims.cmd_add("t1", self.repo, 1, [])
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 0)

    def test_check_on_empty_registry_passes(self):
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 0)


class TestHeartbeatAndTtl(Base):
    def test_heartbeat_refreshes_the_timestamp(self):
        t0 = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)
        self.freeze(t0)
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.freeze(t0 + timedelta(seconds=120))
        claims.cmd_heartbeat("t1", self.repo)
        data = self.raw()
        self.assertEqual(data[0]["heartbeatAt"], "2026-09-04T12:02:00Z")
        self.assertEqual(data[0]["claimedAt"], "2026-09-04T12:00:00Z")

    def test_heartbeat_is_update_only_never_creates(self):
        claims.cmd_heartbeat("ghost", self.repo)
        self.assertEqual(claims._read(self.repo), [])

    def test_claim_expires_after_ttl(self):
        t0 = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)
        self.freeze(t0)
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        # still inside the 300s TTL
        self.freeze(t0 + timedelta(seconds=claims.TTL_SEC - 1))
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 1)
        # past it: the stale claim no longer blocks, and is pruned on read
        self.freeze(t0 + timedelta(seconds=claims.TTL_SEC + 1))
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 0)
        self.assertEqual(self.raw(), [], "expired claim must be pruned on write")

    def test_heartbeat_keeps_a_claim_alive_past_the_ttl(self):
        t0 = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)
        self.freeze(t0)
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        for step in range(60, claims.TTL_SEC * 2, 60):
            self.freeze(t0 + timedelta(seconds=step))
            claims.cmd_heartbeat("t1", self.repo)
        self.freeze(t0 + timedelta(seconds=claims.TTL_SEC * 2))
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 1)


class TestRemove(Base):
    def test_remove_drops_only_that_claim(self):
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        claims.cmd_add("t2", self.repo, 2, ["b.ts"])
        claims.cmd_remove("t1", self.repo)
        ids = [c["taskId"] for c in self.raw()]
        self.assertEqual(ids, ["t2"])
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 0)

    def test_remove_of_a_missing_claim_is_a_noop(self):
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        claims.cmd_remove("nope", self.repo)
        self.assertEqual(len(self.raw()), 1)


class TestRobustness(Base):
    def test_corrupt_file_reads_as_empty_and_never_blocks(self):
        path = os.path.join(self.repo, ".orchestrator", "state", "claims.json")
        with open(path, "w", encoding="utf8") as fh:
            fh.write("{not json at all")
        self.assertEqual(claims._read(self.repo), [])
        self.assertEqual(claims.cmd_check(self.repo, ["a.ts"], None), 0)
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.assertEqual(len(self.raw()), 1)

    def test_list_json_emits_live_claims(self):
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        out = subprocess.run(
            [sys.executable, CLAIMS_PY, "list", self.repo, "--json"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        self.assertEqual(json.loads(out)[0]["taskId"], "t1")


class TestLockTimeoutAndStaleBreak(Base):
    """glm-code's contract: ONLY exit 1 from `check` means a genuine ## Owns:
    conflict. A lock acquisition timeout is a broken/contended registry, not
    a conflict, so it must exit something else (3) — never 1."""

    def _lock_dir(self):
        return os.path.join(self.repo, ".orchestrator", "state", "claims.lock.d")

    def test_lock_timeout_raises_systemexit_3_in_process(self):
        # A live (non-stale) competing lock, held for the whole test.
        os.mkdir(self._lock_dir())
        self.addCleanup(
            lambda: os.path.isdir(self._lock_dir()) and os.rmdir(self._lock_dir())
        )
        orig_timeout = claims.LOCK_TIMEOUT_SEC
        claims.LOCK_TIMEOUT_SEC = 0.05
        self.addCleanup(lambda: setattr(claims, "LOCK_TIMEOUT_SEC", orig_timeout))
        with self.assertRaises(SystemExit) as cm:
            claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.assertEqual(cm.exception.code, 3)

    def test_lock_timeout_process_exit_code_is_3(self):
        # Process-level: proves what glm-code actually reads ($?), not just
        # the Python exception object. Uses the real 5s LOCK_TIMEOUT_SEC
        # since a subprocess can't be monkeypatched from here.
        os.mkdir(self._lock_dir())
        self.addCleanup(
            lambda: os.path.isdir(self._lock_dir()) and os.rmdir(self._lock_dir())
        )
        proc = subprocess.run(
            [sys.executable, CLAIMS_PY, "add", "t1", self.repo, "--", "a.ts"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(proc.returncode, 3, proc.stderr)
        self.assertIn("could not acquire", proc.stderr)

    def test_stale_lock_dir_is_reclaimed_and_the_op_succeeds(self):
        lock_dir = self._lock_dir()
        os.mkdir(lock_dir)
        stale = time.time() - claims.LOCK_STALE_SEC - 5
        os.utime(lock_dir, (stale, stale))
        # Default LOCK_TIMEOUT_SEC applies; the stale-break path (age >30s)
        # must free it well within that, so this call succeeds normally
        # rather than timing out.
        claims.cmd_add("t1", self.repo, 1, ["a.ts"])
        self.assertEqual(len(self.raw()), 1)
        self.assertFalse(os.path.isdir(lock_dir), "lock dir must be released after use")


class TestConcurrency(Base):
    def test_five_simultaneous_adds_all_survive(self):
        procs = [
            subprocess.Popen(
                [
                    sys.executable,
                    CLAIMS_PY,
                    "add",
                    f"t{i}",
                    self.repo,
                    str(1000 + i),
                    "--",
                    f"file{i}.ts",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for i in range(5)
        ]
        for p in procs:
            _, err = p.communicate(timeout=30)
            self.assertEqual(p.returncode, 0, err.decode())
        ids = sorted(c["taskId"] for c in self.raw())
        self.assertEqual(ids, ["t0", "t1", "t2", "t3", "t4"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
