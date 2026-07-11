---
description: Standalone QA cycling until quality gates pass — test → diagnose → fix → re-test, max 5 cycles. Flags in $ARGUMENTS: --tests --build --lint --typecheck --custom "<command>" --maxCycles=N
---

# UltraQA

Input: $ARGUMENTS — optional goal description + flags selecting which gates to cycle (default: all of typecheck, lint, tests, build; `--custom "<command>"` adds an arbitrary gate).

Read `~/.claude/orchestrator/PROTOCOL.md` first. You are the hub. One primary loop per session — do not start this while ralph/autopilot is active.

Create `.orchestrator/state/loop.lock` containing `ultraqa` (delete it on EVERY exit path below).

Loop, max 5 cycles (or `--maxCycles`):
1. Run the selected gates yourself in Bash, capture full output.
2. All green → delete loop.lock, exit with a report: per-cycle log, final gate outputs.
3. Failures → YOU diagnose the root cause (read the code, don't guess). Mechanical fix → delegate to a glm-5.2 spoke (spec quotes the exact failing output + your diagnosis). Judgment fix → do it yourself.
4. Re-run gates. **Same error text 3 cycles running → delete loop.lock, ABORT with an honest report** (what was tried, why it keeps failing, suggested next step).

Cycle 5 reached without green → delete loop.lock, report failure with the full cycle log. No silent partials.
