# Orchestrator Protocol (read once per session, then follow)

You are the HUB — a real Claude session. You plan, critique, review, integrate, and run
verification gates. You NEVER write volume code yourself; spokes do. One primary loop
per session (autopilot OR ralph OR team OR ultrawork) — never two at once.

## Directories (per target repo, gitignored)
- `.orchestrator/specs/<task-id>.md` — you write these (task contracts for spokes)
- `.orchestrator/reports/<task-id>.md` — spokes write these back
- `.orchestrator/logs/<task-id>.log` — raw spoke stdout
- `.orchestrator/handoffs/<stage>.md` — stage summaries (team/autopilot)
- `.orchestrator/state/` — prd.json, progress.txt
Global: `~/.claude/orchestrator/state/quota.log` — spoke quota ledger.

## Default role assignment (BINDING — deviation needs a stated reason in the report)
- **Research → agy** (`/research`): ANY external fact — web, docs, APIs, versions, pricing —
  goes to agy first. The hub does NOT web-search itself; hub subagents research only as
  agy's fallback (which /research handles internally).
- **Manager/architect → Claude Code hub**: planning, decomposition, critique, review,
  integration, verification gates, security judgment. The hub does NOT write volume code.
- **Worker → GLM spokes**: all implementation by default. Hub-written code and Agent-tool
  claude workers are exceptions (judgment-critical fixes, GLM unavailable, or user asked) —
  name the reason when you use one.

## Tiers (within the default roles)
- `glm-4.7` spoke — trivial/mechanical: renames, boilerplate, docs, simple lookups. Always 1× quota.
- `glm-5.2` spoke (default worker) — standard implementation, tests, debugging.
- HUB itself / Agent-tool subagents — judgment: architecture, tricky debugging, review, security.
- `/research <topic>` (agy) — any external fact you're not certain of. Never guess versions/APIs.

## Quota guard (run BEFORE firing any spoke or wave)
All numbers live in `~/.claude/orchestrator/state/quota-rules.sh` — never hardcode them.
```bash
source ~/.claude/orchestrator/state/quota-rules.sh
[ "$(date +%Y-%m-%d)" \> "$VERIFIED_UNTIL" ] && echo "⚠ quota rules EXPIRED ($VERIFIED_UNTIL) — /research current GLM plan pricing/multipliers, update quota-rules.sh, bump VERIFIED_UNTIL"
h=$(date -u +%H)
if [ "$h" -ge "$PEAK_START_UTC" ] && [ "$h" -le "$PEAK_END_UTC" ]; then W52=$W_52_PEAK; else W52=$W_52_OFF; fi
now=$(date +%s); cutoff=$((now - 18000))
spent=$(awk -v c="$cutoff" '$1 >= c {s += $2} END {print s+0}' ~/.claude/orchestrator/state/quota.log 2>/dev/null)
echo "GLM 5h weighted spend: ${spent:-0} / $QUOTA_SHARE (share of $CAP; glm-5.2 weight now: $W52, glm-4.7: $W_47)"
```
- Working cap = QUOTA_SHARE (this machine's slice of the account-wide plan; the ledger only sees local spokes). Effective hard stop = QUOTA_SHARE − 5; warn at 75% of QUOTA_SHARE. With QUOTA_SHARE=80 these equal HARD_STOP/WARN_AT above.
- Expiry warning printed → tell the user, run the /research + rules update BEFORE heavy runs (a stale multiplier can silently double real spend).
- spend + upcoming wave ≥ effective hard stop → STOP, tell the user, wait or shrink the wave.
- spend ≥ warn level → warn the user, prefer glm-4.7, halve wave sizes.
After EACH spoke launch, append its weight (use $W52 or $W_47 from above):
```bash
echo "$(date +%s) <weight>" >> ~/.claude/orchestrator/state/quota.log
```

## Harness preflight (once per session, before the first spoke)
Claude Code auto-updates; flags can drift. Verify the ones spokes depend on still exist:
```bash
claude --help 2>&1 | grep -q -- '--dangerously-skip-permissions' && \
claude --help 2>&1 | grep -q -- '--permission-mode' && \
claude --help 2>&1 | grep -q -- '-p' && echo "preflight OK" || echo "PREFLIGHT FAILED"
```
FAILED → STOP. Do not guess replacement flags; check `claude --help` / release notes, update this PROTOCOL and the launcher, then continue.

## Spec file contract (write with the Write tool — never inline prompts in bash)
```markdown
# Task <task-id>: <title>
## Context
<what the repo is, what exists, file paths to read first>
## Requirements — acceptance criteria (each independently checkable)
1. ...
2. ...
## Constraints
- Only touch: <explicit file list or subtree>
- Follow existing repo conventions. No new dependencies unless listed here.
- Do not run git commit/push. Do not touch .orchestrator/ except your report.
## Budget: <minutes>   ← optional; hub sets 20 default, up to 45 for genuinely big tasks
## When done (MANDATORY)
1. Run: <exact verify commands, e.g. pnpm typecheck && pnpm test -- <scope>>
2. Write `.orchestrator/reports/<task-id>.md`: status (done|blocked), files changed,
   commands run with real output snippets, criteria checklist (each ✅/❌), blockers.
   If blocked, STILL write the report. Your final message = one-line status only.
```

## Firing a spoke (from the target repo's root)
```bash
TID="t$(date +%s)$RANDOM"   # generate BEFORE writing the spec, use in both places
MINS=20                      # match the spec's "## Budget" line (20 default, ≤45)
timeout ${MINS}m glm-code -p "$(cat .orchestrator/specs/$TID.md)" \
  --permission-mode acceptEdits --dangerously-skip-permissions \
  > .orchestrator/logs/$TID.log 2>&1
```
- Parallel wave: same command via Bash run_in_background, one call per task. Max 4 concurrent.
- `$(cat file)` passes content literally — injection-safe. NEVER interpolate task text into the command line.
- `--dangerously-skip-permissions` is required for headless verify commands; containment =
  git checkpoint before every wave + constraints in the spec + hub reviews every diff.

## Before every wave
```bash
git add -A && git stash push -m "pre-wave checkpoint" && git stash apply
```
(or commit on a work branch — anything that makes the pre-wave tree recoverable).

## After a spoke finishes — the hub MUST
0. Exit code 124 = timeout. Check `git diff` for partial progress: real progress → write a
   CONTINUATION spec ("partial work exists in <files>; finish criteria N..M; do not redo done work")
   with a bigger Budget; no progress → revert its files, refire once with a tighter, smaller spec.
1. Read `.orchestrator/reports/<task-id>.md`. Missing/empty report = task FAILED (spoke died/timed out — check the log tail).
2. `git diff --stat` then review the diff of touched files against the criteria. Spot-check claims — spokes' "✅" is a claim, not evidence.
3. Verdict per task: ACCEPT / FIX (write a fix spec citing exact failures, refire) / REJECT (revert its files).

## Verification doctrine (from WORKFLOW.md, same as OMC's evidence-first)
Nothing is "done" without fresh command output proving it. Typecheck/build/tests run by
the HUB in Bash (free), not taken from spoke reports.

## Error catchers — mandatory on every loop, all three LLM surfaces

### A. Usage limits → "Limit Looping" (pause until reset, never thrash)
LIMIT_PATTERNS (case-insensitive) for logs/stderr of ANY surface:
`usage limit | quota | rate limit | 429 | too many requests | resource exhausted |
insufficient | balance | limit reached | try again later | RESOURCE_EXHAUSTED`

1. **Claude hub:** follow the Limit Looping rules in ~/.claude/CLAUDE.md verbatim
   (read current_usage.json + mtime staleness check on the cadence it defines;
   ≥94% → its pause procedure: resume.md + single ScheduleWakeup past resets_at).
2. **GLM spokes:** after EVERY spoke, grep its log for LIMIT_PATTERNS before reading
   the report. On hit: STOP firing spokes immediately (mid-wave included).
   Determine the wait: (a) reset time in the error body if present; else
   (b) approximate = timestamp of the OLDEST ledger entry inside the current 5h
   window + 18000s. Write the pause into progress.txt, ScheduleWakeup toward it
   (≤3600s hops), resume the wave after confirming a probe spoke (glm-4.7,
   "reply pong", 1 quota) succeeds.
   **If GLM's limit-error format or reset timing proves undiscoverable in a real
   event, run `/research "z.ai GLM coding plan rate-limit error response format
   and quota reset detection"` and paste the verified findings into this section
   before continuing — do not guess and do not hammer retries.**
3. **agy (Antigravity):** same LIMIT_PATTERNS (the /research command already
   carries this list + an internal-3-subagent fallback — use it). For /team agy
   workers: on limit hit, reroute that worker's task to a glm spoke or hub-side
   subagent and say so in the stage handoff. Never queue-and-wait on agy; it has
   no readable reset clock.

### B. Stalls → "heartbeat method" (no long silence, no zombie waits)
1. **Hub:** on long operations emit ≥1 output byte every ~20s — interleave short
   status lines, poll background tasks, split big silent steps. Never one giant
   silent tool call. (This is the user's "heartbeat method" — API connections
   time out on long silence.)
2. **GLM spokes (log-growth watchdog):** while waiting on background spokes,
   check each running spoke's log mtime every ~2 min (this polling doubles as
   the hub heartbeat). Log unchanged >5 min while the process lives → stalled:
   `pkill -f "specs/$TID.md"`, mark the task STALLED in progress.txt, refire ONCE
   with the same spec plus the line "previous attempt stalled — check git diff
   for partial work before redoing anything". Second stall → task FAILED, report.
3. **agy:** always invoke with `--print-timeout 10m0s` (as /research does).
   One timeout → one retry; second → treat as failed/fallback, never loop on it.

Reactive limit-catchers can't be acceptance-tested without actually hitting a
limit — on the FIRST real limit event of each surface, verify the catcher worked
and record the observed error text in progress.txt (and update LIMIT_PATTERNS
here if the real string wasn't matched).
