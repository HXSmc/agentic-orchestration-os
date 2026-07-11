---
description: Persistence loop until verified completion — prd.json stories, fresh-evidence verification, reviewer sign-off, deslop, regression. No silent partials.
---

# Ralph

Task: $ARGUMENTS

Read `~/.claude/orchestrator/PROTOCOL.md` first. You are the hub. Don't stop until done or terminally blocked.

Create `.orchestrator/state/loop.lock` containing this loop's name before starting.
Delete it on EVERY exit path — success report, abort, terminal failure, user cancel.
A Stop hook (loop-guard) will refuse to let you end the turn while it exists.

1. **Scaffold** (skip if `.orchestrator/state/prd.json` exists — that's a resume):
   - `.orchestrator/state/prd.json`: `{"task": "...", "stories": [{"id": "s1", "title": "...", "acceptance": ["...each criterion a runnable check..."], "priority": 1, "passes": false, "attempts": 0}]}`
   - Acceptance criteria MUST be verifiable by command or file inspection — never "works correctly".
   - `.orchestrator/state/progress.txt`: append-only log. Start it with the story list.
2. **Loop** while incomplete stories remain:
   a. Pick highest-priority story with `passes: false` and `attempts < 3`.
   b. Delegate implementation per the ultrawork protocol (steps 2–7 of `/ultrawork`, scoped to this story). Parallelize within the story if it decomposes.
   c. **Verify EVERY acceptance criterion yourself with fresh command runs.** Append evidence (command + output snippet) to progress.txt.
   d. All green → set `passes: true`. Any red → `attempts++`, write a fix spec quoting the exact failing output, refire. Same error text 3 times in a row → mark story BLOCKED, move on.
3. **All stories pass → reviewer gate** (hub acts as reviewer):
   - Standard change: review the full diff against prd.json criteria + ask explicitly: "is there a meaningfully simpler approach?" Note the answer.
   - `git diff --stat` >20 files OR security-sensitive (auth/payments/PII/tenant isolation): full multi-lens review instead (spawn parallel reviewer subagents: correctness, security, domain; all must approve; in taweed use its `multi-lens-review` workflow).
   - Rejections → new fix stories, back to step 2.
4. **Deslop:** run `/simplify` on the changed code. Apply its fixes.
5. **Regression:** re-run the FULL gate set (typecheck, lint, all tests, build). Red → back to step 2 with a fix story.
6. **Exit report:** stories table (passes/attempts), evidence log location, gate outputs, diff stat. BLOCKED stories reported loudly with their evidence — never silently dropped. Delete state files only if fully complete; keep them for resume otherwise.
