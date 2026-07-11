---
description: Parallel execution engine — decompose, fire GLM spokes in waves, lightweight verify. The composable primitive (no persistence loop).
---

# Ultrawork

Task: $ARGUMENTS

Read `~/.claude/orchestrator/PROTOCOL.md` first (skip if already read this session). You are the hub.

Create `.orchestrator/state/loop.lock` containing this loop's name before starting.
Delete it on EVERY exit path — success report, abort, terminal failure, user cancel.
A Stop hook (loop-guard) will refuse to let you end the turn while it exists.

1. **Ground intent.** Restate the task in one paragraph. List unknowns. External facts you aren't sure of (library APIs, versions) → run `/research` on them NOW, before decomposing.
2. **Gather context.** Spawn read-only subagents (cavecrew-investigator / Explore) to map relevant files. Never skip: spokes are blind without file paths in their specs.
3. **Build the task graph.** Decompose into tasks with: per-task acceptance criteria, explicit touched-file lists (NON-OVERLAPPING between parallel tasks — overlap = merge conflicts), dependency waves, and a tier each: `glm-4.7` (mechanical) / `glm-5.2` (standard) / `hub` (judgment — do those yourself or via Agent tool). Show the graph as a table before executing.
4. **Quota guard** per PROTOCOL. Then git checkpoint.
5. **Fire wave 1** — all independent tasks simultaneously (background Bash, ≤4 concurrent), specs written with the Write tool, `GLM_MODEL` per tier. Log quota per spoke. Never serialize independent work.
6. **On each spoke completion:** report → diff → verdict (ACCEPT/FIX/REJECT) per PROTOCOL. FIX at most once per task inside ultrawork; still failing → mark FAILED, continue others.
7. **Next wave** when its dependencies are ACCEPTED.
8. **Lightweight verify:** typecheck/build + tests affected by the change (hub runs them). No full-repo QA loop — that's `/ralph`'s job.
9. **Report:** table of tasks (tier, verdict, files), gate outputs, failures with evidence. If anything FAILED, say exactly: "run /ralph for guaranteed completion."
