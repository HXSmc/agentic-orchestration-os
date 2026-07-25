---
description: Staged multi-agent pipeline — plan → prd → exec (N typed workers) → verify → fix loop (max 3). Usage: /team N[:type] "task"  (types: glm, glm-lite, claude, agy)
---

# Team

Input: $ARGUMENTS  — parse as `N[:type] "task"`. Default N=3, type=glm. Types: `glm` (glm-5.2 spokes), `glm-lite` (glm-4.7 spokes), `claude` (Agent-tool subagents, Pro quota), `agy` (`agy --print --dangerously-skip-permissions "$(cat spec)"` workers). Cap N at 6 for glm types (quota), 20 otherwise.

Read `~/.claude/orchestrator/PROTOCOL.md` first. Each stage ends by writing `.orchestrator/handoffs/<stage>.md` (goal, decisions, artifacts, next stage's inputs) — that file is the ONLY context the next stage may assume.

Create `.orchestrator/state/loop.lock` containing this loop's name before starting.
Delete it on EVERY exit path — success report, abort, terminal failure, user cancel.
A Stop hook (loop-guard) will refuse to let you end the turn while it exists.

Realizes PROTOCOL.md's Standing loop order: team-plan/prd = architect, team-exec = spawn spokes,
team-verify's per-worker pass = reviewer+advisor, team-fix = loop back to architect.

1. **team-plan (architect, Opus):** explore the repo (read-only subagents), decompose into ≤N
   parallelizable work items with non-overlapping file ownership, pick each item's worker type/tier
   and which existing skill(s)/plugin(s) it should use. Confirm the plan via `advisor()` before
   proceeding. Handoff: item list + file ownership + type/tier map.
2. **team-prd:** extract concrete requirements + acceptance criteria per item. If the task is risky/ambiguous, run an explicit critic pass over the requirements (challenge scope, find missing cases) before finalizing. Handoff: per-item criteria.
3. **team-exec (spawn spokes):** fire N workers per their type (glm/glm-lite → spoke protocol; claude → Agent tool; agy → agy CLI with spec file). Quota guard + git checkpoint first. Collect reports.
4. **team-verify:** never let a worker review its own output (correlated blind spots). For glm/agy/claude items: a dedicated Sonnet reviewer subagent checks the diff against that item's criteria. For glm-lite (trivial/mechanical) items: hub reviews inline by default, escalating to the Sonnet reviewer automatically the instant it finds a concrete deviation (file outside ownership, missing report field, criterion not verifiable from the diff) — not on a vague "looks off." `advisor()` on the reviewer's findings fires ONLY when a reviewer's verdict is ambiguous — never a fixed per-wave sweep (waves don't finish in lockstep). Separately, run gates + the existing mandatory multi-lens review (parallel reviewer subagents, all must approve) if >20 files changed or security-sensitive. Handoff: defect list (file:line, criterion violated, evidence, which pass caught it).
5. **team-fix (loop back to architect):** any confirmed defect goes back to team-plan's architect step, not straight to the worker — architect updates the affected item's spec/tier/constraints, then re-fires via team-exec. Re-verify. **Max 3 fix loops**, then terminal `failed` with evidence — but the quota guard (PROTOCOL.md) preempts this counter: a quota STOP pauses the loop immediately regardless of how many fix loops remain.
6. **Done:** all criteria verified green (reviewer + advisor pass clean) → final report: per-item table, gates output, handoff trail. Terminal failure reported honestly with the defect list.
