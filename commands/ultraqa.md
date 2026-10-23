---
description: Standalone QA cycling until quality gates pass — test → diagnose → fix → re-test, max 5 cycles. Flags in $ARGUMENTS: --tests --build --lint --typecheck --custom "<command>" --maxCycles=N
---

# UltraQA

Input: $ARGUMENTS — optional goal description + flags selecting which gates to cycle (default: all of typecheck, lint, tests, build; `--custom "<command>"` adds an arbitrary gate).

Read `~/.claude/orchestrator/PROTOCOL.md` first. You are the hub. One primary loop per session — do not start this while ralph/autopilot is active.

Create `.orchestrator/state/loop.lock` containing `ultraqa` (delete it on EVERY exit path below).

Loop, max 5 cycles (or `--maxCycles`):
1. Delegate the selected gates to a `verifier` subagent (never hub-side Bash), capture its full output.
2. All green → delete loop.lock, exit with a report: per-cycle log, final gate outputs. Before exiting: run the verify skill on features touched this session (PROTOCOL "Loop add-ons"); a blocked or failed drive counts as not green.
3. Failures → root-cause diagnosis comes from a subagent that reads the code (`fixer` on sonnet first, even for hard root-cause ones — escalate to opus only after sonnet fails the same criterion twice), not from hub guessing; you judge its verdict. Mechanical fix → delegate to a glm-5.3 spoke (spec quotes the exact failing output + the diagnosis). Judgment fix → `fixer` subagent on sonnet, opus after two same-criterion failures. Never fix it hub-side, however small. (Re-tiered 2026-10-12 for the 5.5 generation.)
4. Re-run gates via the `verifier` subagent. **Same error text 3 cycles running → delete loop.lock, ABORT with an honest report** (what was tried, why it keeps failing, suggested next step).

Cycle 5 reached without green → delete loop.lock, report failure with the full cycle log. No silent partials.
