---
description: Full autonomous execution from idea to validated working code — 6 phases (expand, plan, execute, QA, validate, cleanup). Options in $ARGUMENTS: pauseAfterPlanning, skipQa, maxQaCycles=N.
---

# Autopilot

Input: $ARGUMENTS — the idea/goal, plus optional flags (`pauseAfterPlanning`, `skipQa`, `maxQaCycles=N` default 5).

Read `~/.claude/orchestrator/PROTOCOL.md` first. You are the hub. Resumable: if `.orchestrator/handoffs/` already has autopilot phase files, resume after the last completed phase.

Create `.orchestrator/state/loop.lock` containing this loop's name before starting.
Delete it on EVERY exit path — success report, abort, terminal failure, user cancel.
A Stop hook (loop-guard) will refuse to let you end the turn while it exists.

**Phase 0 — Expansion.** Turn the idea into a concrete spec: requirements, user-visible behavior, tech choices, out-of-scope list. Any tech fact you're not sure of → `/research` it now. Handoff: `autopilot-0-spec.md`.

**Phase 1 — Planning (architect, Opus).** Design the implementation: components, file map, story breakdown with acceptance criteria, risks, and which agent type/tier + skill(s)/plugin(s) each story's spoke should use. Then an explicit critic pass on your own plan (missing requirements? simpler architecture? failure modes? testability?) — revise once, then confirm via `advisor()`. Handoff: `autopilot-1-plan.md`. If `pauseAfterPlanning`: show the plan and STOP for the user.

**Phase 2 — Execution (spawn spokes).** Run the `/ralph` machinery on the plan's stories (spokes write code). No spoke reviews its own output. Standard/judgment-adjacent stories (glm-5.2/agy) get a dedicated Sonnet reviewer subagent against that story's criteria with fresh evidence; trivial/mechanical (glm-4.7) stories get a hub inline check by default, escalating to the Sonnet reviewer automatically on any concrete deviation (file outside ownership, missing report field, unverifiable criterion) — not vague doubt. `advisor()` on the reviewer's findings fires ONLY on an ambiguous verdict — never a scheduled per-round sweep (PROTOCOL.md Standing loop order). Confirmed issues go back to Phase 1's architect step to adjust the story's spec/tier before refiring — not straight back to the spoke. Deslop via `/simplify` once a story's loop is clean. Handoff: `autopilot-2-execution.md`.

**Phase 3 — QA cycles** (skip if `skipQa`). Loop ≤ maxQaCycles: run full gates (typecheck, lint, ALL tests, build) → all green: exit loop → failures: YOU diagnose root cause, then delegate the mechanical fix to a glm-5.2 spoke (spec quotes exact failing output); judgment fixes do yourself. **Same error text 3 cycles running → ABORT to final report.** The quota guard (PROTOCOL.md) preempts maxQaCycles: a quota STOP pauses immediately regardless of cycles remaining. Handoff: `autopilot-3-qa.md` with per-cycle log.

**Phase 4 — Validation.** Three parallel reviewer subagents over the full diff: (a) architecture/correctness, (b) security, (c) code quality (cavecrew-reviewer). **All must approve.** Rejections route back to Phase 1's architect (spoke tier/spec update), not a direct patch, then refire → re-review. Max 2 rounds, then report failure honestly — quota guard preempts this cap too. Handoff: `autopilot-4-validation.md`.

**Phase 5 — Cleanup.** All approved: delete `.orchestrator/specs|reports|logs` contents and state files (keep handoffs as the audit trail). Final report: what was built, evidence (gate outputs), review verdicts, GLM prompts consumed (from quota.log), files changed.

Abort conditions anywhere: repeated identical error (3×), validation failing after 2 rounds, quota guard hard-stop, or user cancel — always exit through an honest final report; state stays for resume.
