#!/usr/bin/env python3
"""claims.py — machine-readable file-ownership registry for orchestrator spokes.

Until now file ownership was PROSE: each spec's `## Constraints` section said
"Only touch: a.ts, b.ts" and nothing could read it. This is its machine-readable
twin, fed by the spec's `## Owns:` list (see PROTOCOL.md's spec contract).

What it is: observability + a launcher-side refusal. `glm-code` calls `check`
before firing and refuses to launch a spoke whose `## Owns:` list overlaps a
live claim. What it is NOT: full collision prevention — two spokes editing the
same file are actually kept apart by the per-spoke git worktrees (Step 2). A
claim can always be overridden with GLM_FORCE_CLAIM=1, and anything that never
registers a claim is invisible to it.

Storage: <repo-root>/.orchestrator/state/claims.json — a JSON array of
  {taskId, repo, pid, files, claimedAt, heartbeatAt}   (ISO-8601 UTC, "Z")

Staleness is HEARTBEAT-based, never PID-based. A pid check is cheap but it is
local-only, and the dashboard already merges claims from remote `peers` whose
pids mean nothing on this machine. A claim is live while `heartbeatAt` is
within TTL_SEC; `list` and `check` drop expired entries when they next write.
That means the designed failure path for a `kill -9`'d launcher is simply "the
claim expires in <= TTL_SEC" — no cleanup daemon, no orphan holding a file
forever (the bug loop.lock has, patched there with a 24h age check).

Subcommands
  add <tid> <repo-root> [pid] -- <paths...>   upsert a claim (by taskId)
  heartbeat <tid> <repo-root>                 refresh heartbeatAt (no-op if absent)
  remove <tid> <repo-root>                    drop a claim
  list <repo-root> [--json]                   show live claims
  check <repo-root> [--ignore-task <tid>] -- <paths...>
                                              exit 1 if any live claim overlaps

python3 stdlib only, on purpose: this runs from a bash launcher on every spoke
fire, so it must not depend on a venv, a node_modules, or anything installed.
"""

from __future__ import annotations

import fnmatch
import json
import os
import random
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone

# A claim is live while its heartbeatAt is within this window. glm-code ticks
# every 60s, so 5 min tolerates four missed ticks (a paused laptop, a busy box)
# before a genuinely-running spoke is wrongly declared dead.
TTL_SEC = 300

# ponytail: a mkdir lock is the whole concurrency story here and it stays that
# way. The ceiling is deliberate — a handful of launcher processes racing on one
# small JSON file on one local filesystem. It gives mutual exclusion (mkdir is
# atomic on POSIX and on APFS) and nothing else: no fairness, no reentrancy, no
# cross-machine coordination, no deadlock detection beyond the age breaker
# below. If claims ever need any of those, that is a different tool (a real
# lockfile lib, or a daemon), not more code in this function.
LOCK_TIMEOUT_SEC = 5.0
LOCK_STALE_SEC = 30.0


def _now() -> datetime:
    """Current UTC time. Indirected so tests can monkeypatch claims._now."""
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(value: str) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        # Tolerate any other ISO-8601 a hand-edit might leave behind.
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed


def _state_dir(repo_root: str) -> str:
    return os.path.join(repo_root, ".orchestrator", "state")


def _claims_path(repo_root: str) -> str:
    return os.path.join(_state_dir(repo_root), "claims.json")


@contextmanager
def _lock(repo_root: str):
    state = _state_dir(repo_root)
    os.makedirs(state, exist_ok=True)
    lock_dir = os.path.join(state, "claims.lock.d")
    deadline = time.time() + LOCK_TIMEOUT_SEC
    while True:
        try:
            os.mkdir(lock_dir)
            break
        except FileExistsError:
            # A launcher killed mid-write would otherwise wedge every later
            # spoke in this repo. Break a lock nobody has touched in 30s.
            try:
                if time.time() - os.stat(lock_dir).st_mtime > LOCK_STALE_SEC:
                    os.rmdir(lock_dir)
                    continue
            except OSError:
                pass
            if time.time() > deadline:
                # Exit 3, never 1: glm-code's contract is "exit 1 == genuine
                # ## Owns: conflict from `check`, anything else == broken
                # registry, launch anyway". A lock timeout is the registry
                # being broken (or just badly contended), not a conflict —
                # conflating it with exit 1 would make glm-code refuse to
                # launch a spoke over lock contention instead of proceeding.
                print(
                    f"claims: could not acquire {lock_dir} within "
                    f"{LOCK_TIMEOUT_SEC}s — remove it if no launcher is running",
                    file=sys.stderr,
                )
                raise SystemExit(3)
            time.sleep(0.01 + random.random() * 0.03)
    try:
        yield
    finally:
        try:
            os.rmdir(lock_dir)
        except OSError:
            pass


def _read(repo_root: str) -> list[dict]:
    """Read the raw claim array. Never raises: an unreadable or corrupt file
    reads as empty, because a broken registry must not block spoke launches."""
    try:
        with open(_claims_path(repo_root), "r", encoding="utf8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [c for c in data if isinstance(c, dict) and c.get("taskId")]


def _write(repo_root: str, claims: list[dict]) -> None:
    """Atomic replace: a reader never sees a half-written array."""
    state = _state_dir(repo_root)
    os.makedirs(state, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=state, prefix=".claims.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf8") as fh:
            json.dump(claims, fh, indent=2)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, _claims_path(repo_root))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def is_live(claim: dict, now: datetime | None = None) -> bool:
    now = now or _now()
    hb = _parse_iso(claim.get("heartbeatAt", "")) or _parse_iso(
        claim.get("claimedAt", "")
    )
    if hb is None:
        return False
    return (now - hb).total_seconds() <= TTL_SEC


def _norm(p: str) -> str:
    """Repo-relative, forward-slashed, no leading ./ or trailing /."""
    p = str(p).strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.rstrip("/")


def _rel(p: str, repo_root: str) -> str:
    """Coerce an ownership entry to repo-relative form.

    PROTOCOL says `## Owns:` entries are repo-relative, but a drafting spoke
    copying from `## Constraints` routinely emits `~/…` or a full absolute path
    (the prose lists mix both). Those would never fnmatch a stored relative
    claim, so the launcher would sail past a real conflict and say nothing —
    a silent miss, the one failure mode this registry must not have. Normalise
    here rather than trusting the spec's discipline.
    """
    p = _norm(os.path.expanduser(str(p)))
    if not p:
        return ""
    if not p.startswith("/"):
        return p
    # Try both the literal and the symlink-resolved root: on macOS a repo under
    # /tmp is also reachable as /private/tmp, and the two forms must agree.
    for root in (os.path.abspath(repo_root), os.path.realpath(repo_root)):
        root = _norm(root)
        if p == root:
            return ""
        if p.startswith(root + "/"):
            return p[len(root) + 1 :]
    # Absolute but outside this repo: it cannot be repo-relative, so keep it
    # anchored (leading slash stripped) — it still matches an identical entry.
    return p.lstrip("/")


def paths_overlap(a: str, b: str) -> bool:
    """True when two ownership entries could touch the same file.

    Deliberately over-inclusive — a false conflict costs one GLM_FORCE_CLAIM=1,
    a missed one costs two spokes editing the same file.

      - equal paths
      - glob match in EITHER direction ("src/*.ts" vs "src/api.ts", and the
        reverse when the live claim is the concrete one)
      - directory prefix: a claimed dir covers every file under it
    """
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    if a == b:
        return True
    if fnmatch.fnmatch(a, b) or fnmatch.fnmatch(b, a):
        return True
    return a.startswith(b + "/") or b.startswith(a + "/")


def _conflicts(
    claims: list[dict], paths: list[str], ignore_task: str | None
) -> list[dict]:
    out = []
    for claim in claims:
        if ignore_task and claim.get("taskId") == ignore_task:
            continue
        owned = claim.get("files") or []
        if not paths or not owned:
            # A presence-only claim (empty ## Owns:) claims nothing, and a
            # launch with nothing to own conflicts with nothing.
            continue
        if any(paths_overlap(p, o) for p in paths for o in owned):
            out.append(claim)
    return out


def _prune(repo_root: str) -> list[dict]:
    """Drop expired claims, persisting the result. Caller holds the lock."""
    now = _now()
    claims = _read(repo_root)
    live = [c for c in claims if is_live(c, now)]
    if len(live) != len(claims):
        _write(repo_root, live)
    return live


def _fmt(claim: dict, now: datetime) -> str:
    hb = _parse_iso(claim.get("heartbeatAt", ""))
    age = f"{int((now - hb).total_seconds())}s ago" if hb else "never"
    state = "alive" if is_live(claim, now) else "STALE"
    files = ",".join(claim.get("files") or []) or "(presence-only)"
    return (
        f"{claim.get('taskId')}  {state}  repo={claim.get('repo')}  "
        f"pid={claim.get('pid')}  hb={age}  owns={files}"
    )


# --- subcommands -----------------------------------------------------------


def cmd_add(tid: str, repo_root: str, pid: int | None, paths: list[str]) -> int:
    now = _now()
    stamp = _iso(now)
    with _lock(repo_root):
        claims = [c for c in _read(repo_root) if is_live(c, now)]
        # Upsert by taskId: PROTOCOL's FIX path refires the SAME $TID, and a
        # refire must replace its own claim, never append a second one.
        prior = next((c for c in claims if c.get("taskId") == tid), None)
        claims = [c for c in claims if c.get("taskId") != tid]
        claims.append(
            {
                "taskId": tid,
                "repo": os.path.basename(os.path.abspath(repo_root)),
                "pid": pid,
                "files": [f for f in (_rel(p, repo_root) for p in paths) if f],
                "claimedAt": (prior or {}).get("claimedAt") or stamp,
                "heartbeatAt": stamp,
            }
        )
        _write(repo_root, claims)
    return 0


def cmd_heartbeat(tid: str, repo_root: str) -> int:
    now = _now()
    with _lock(repo_root):
        claims = _read(repo_root)
        found = False
        for claim in claims:
            if claim.get("taskId") == tid:
                claim["heartbeatAt"] = _iso(now)
                found = True
        if not found:
            # Update-only on purpose: a heartbeat tick racing the EXIT trap's
            # remove must not resurrect a claim the launcher just released.
            return 0
        _write(repo_root, [c for c in claims if is_live(c, now)])
    return 0


def cmd_remove(tid: str, repo_root: str) -> int:
    now = _now()
    with _lock(repo_root):
        claims = _read(repo_root)
        kept = [c for c in claims if c.get("taskId") != tid and is_live(c, now)]
        if len(kept) != len(claims):
            _write(repo_root, kept)
    return 0


def cmd_list(repo_root: str, as_json: bool) -> int:
    with _lock(repo_root):
        live = _prune(repo_root)
    if as_json:
        print(json.dumps(live, indent=2))
        return 0
    if not live:
        print("claims: none")
        return 0
    now = _now()
    for claim in live:
        print(_fmt(claim, now))
    return 0


def cmd_check(repo_root: str, paths: list[str], ignore_task: str | None) -> int:
    with _lock(repo_root):
        live = _prune(repo_root)
    hits = _conflicts(live, [f for f in (_rel(p, repo_root) for p in paths) if f], ignore_task)
    if not hits:
        return 0
    now = _now()
    print(
        f"claims: CONFLICT — {len(hits)} live claim(s) overlap the requested paths:",
        file=sys.stderr,
    )
    for claim in hits:
        print(f"  {_fmt(claim, now)}", file=sys.stderr)
    print(
        "claims: refusing. Wait for the owner to finish, narrow this task's "
        "## Owns: list, or override with GLM_FORCE_CLAIM=1.",
        file=sys.stderr,
    )
    return 1


USAGE = __doc__.split("Subcommands\n", 1)[1].split("\npython3", 1)[0]


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print("usage:\n" + USAGE)
        return 0 if argv else 2

    cmd, rest = argv[0], argv[1:]
    if "--" in rest:
        i = rest.index("--")
        head, paths = rest[:i], rest[i + 1 :]
    else:
        head, paths = rest, []

    try:
        if cmd == "add":
            if len(head) < 2:
                raise ValueError("add needs <tid> <repo-root> [pid]")
            pid = int(head[2]) if len(head) > 2 and head[2] else None
            return cmd_add(head[0], head[1], pid, paths)
        if cmd == "heartbeat":
            if len(head) < 2:
                raise ValueError("heartbeat needs <tid> <repo-root>")
            return cmd_heartbeat(head[0], head[1])
        if cmd == "remove":
            if len(head) < 2:
                raise ValueError("remove needs <tid> <repo-root>")
            return cmd_remove(head[0], head[1])
        if cmd == "list":
            args = [a for a in head if a != "--json"]
            if len(args) < 1:
                raise ValueError("list needs <repo-root>")
            return cmd_list(args[0], "--json" in head)
        if cmd == "check":
            ignore = None
            args = []
            i = 0
            while i < len(head):
                if head[i] == "--ignore-task":
                    ignore = head[i + 1] if i + 1 < len(head) else None
                    i += 2
                    continue
                args.append(head[i])
                i += 1
            if len(args) < 1:
                raise ValueError("check needs <repo-root>")
            return cmd_check(args[0], paths, ignore)
    except ValueError as exc:
        print(f"claims: {exc}", file=sys.stderr)
        return 2

    print(f"claims: unknown subcommand '{cmd}'\nusage:\n{USAGE}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
