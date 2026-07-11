---
description: Staged multi-agent pipeline — plan → prd → exec (N typed workers) → verify → fix loop (max 3). Usage: /team N[:type] "task"  (types: glm, glm-lite, claude, agy)
---

# Team

Input: $ARGUMENTS  — parse as `N[:type] "task"`. Default N=3, type=glm. Types: `glm` (glm-5.2 spokes), `glm-lite` (glm-4.7 spokes), `claude` (Agent-tool subagents, Pro quota), `agy` (`agy --print --dangerously-skip-permissions "$(cat spec)"` workers). Cap N at 6 for glm types (quota), 20 otherwise.

Read `~/.claude/orchestrator/PROTOCOL.md` first. Each stage ends by writing `.orchestrator/handoffs/<stage>.md` (goal, decisions, artifacts, next stage's inputs) — that file is the ONLY context the next stage may assume.

Create `.orchestrator/state/loop.lock` containing this loop's name before starting.
Delete it on EVERY exit path — success report, abort, terminal failure, user cancel.
A Stop hook (loop-guard) will refuse to let you end the turn while it exists.

1. **team-plan:** explore the repo (read-only subagents), decompose into ≤N parallelizable work items with non-overlapping file ownership. Handoff: item list + file ownership map.
2. **team-prd:** extract concrete requirements + acceptance criteria per item. If the task is risky/ambiguous, run an explicit critic pass over the requirements (challenge scope, find missing cases) before finalizing. Handoff: per-item criteria.
3. **team-exec:** fire N workers per their type (glm/glm-lite → spoke protocol; claude → Agent tool; agy → agy CLI with spec file). Quota guard + git checkpoint first. Collect reports.
4. **team-verify:** hub verifies — run gates, cross-check each item's criteria against real diffs/outputs. Mandatory multi-lens review (parallel reviewer subagents, all must approve) if >20 files changed or security-sensitive. Handoff: defect list (file:line, criterion violated, evidence).
5. **team-fix:** defects → fix specs → refire to workers (or fix judgment-level ones yourself). Re-verify. **Max 3 fix loops**, then terminal `failed` with evidence.
6. **Done:** all criteria verified green → final report: per-item table, gates output, handoff trail. Terminal failure reported honestly with the defect list.
