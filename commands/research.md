# /research — Dual-Engine, Adversarially-Verified Research (exceeds native `/deep-research` rigor)

$ARGUMENTS

## Why this shape
Native `deep-research` (Workflow tool) is single-engine: Claude WebSearch generates AND verifies —
correlated blind spots possible. This command is **dual-engine, cross-vendor**: agy/Antigravity
(independent search index/model) does Scope+Search+Fetch, THEN **GLM/Z.ai spokes** — a genuinely
different model vendor from both agy and the Claude hub — run the adversarial refutation pass on
the resulting claims. Three different systems in the loop (agy's backend, the Claude hub doing
orchestration/ground-truth/synthesis, GLM doing refutation) beats one system checking itself, and
beats even a same-vendor Claude-verifies-Claude setup (still correlated). On top of that:
angle-diversified search (not 5 agents on the same query), ground-truth-first for objectively
checkable facts (numbers/dates/versions — don't waste a verify round on what you can just fetch),
and durable Obsidian persistence, which native `deep-research` doesn't have at all.

**GLM spoke, not Workflow-tool `agent()`, for verify — deliberately.** The Workflow tool's
`agent()` only spawns Claude-family subagents (no shell/CLI access from inside a workflow script),
so it can't reach GLM. The verify stage instead fires real `glm-code` spoke processes directly
from this command's own steps (same mechanism `/team`/`/autopilot` use), per
`~/.claude/orchestrator/PROTOCOL.md`'s "Default role assignment" (Worker → GLM spokes) and
[[project-glm-orchestrator]]. This also fixes a real cost problem the earlier Workflow-based design
had: naive per-claim-per-vote (up to 30 claims × 5 votes = 150 calls) would have been GLM-quota
suicide (protocol doc: ~14 spoke runs ≈ 58% of the 5h window). Instead, verify runs **batched
per-round**: each round is ONE spoke call carrying the FULL claim list, so 3 rounds (or 1 under
quota pressure) = 3 total GLM calls per `/research` run, not 150 — cheap, and still genuinely
independent (each round is a fresh headless process with zero memory of the other rounds).

## What This Command Does
1. Scope: decompose `$ARGUMENTS` into 5 distinct search angles (not 5 copies of the same query).
2. Shell out to `agy --print` with those angles — Antigravity spawns 5 subagents (one per angle),
   cross-reviews, returns a claims-bearing report.
3. Extract every discrete claim from that report.
4. Ground-truth objectively-checkable claims yourself (direct fetch/API), skip wasting a vote on them.
5. Adversarially verify the rest via `Workflow` — 3 independent refuters per claim (5 for
   high-stakes claims), 2/3+ refute kills it. This is the native `deep-research` Verify mechanic,
   run here as a second, independent layer on top of agy's own cross-review.
6. Write one merged, ranked, cited note to Obsidian. Summarize back — zero copy-pasting.

## Execution Steps

### Step 0a — Log the invocation (agy usage tracking)
```bash
echo "$(date +%s) research $(printf '%s' "$ARGUMENTS" | tr ' /' '--' | cut -c1-40)" >> ~/.claude/orchestrator/state/agy.log
```

### Step 0 — Check existing vault coverage
```bash
grep -rli "<key topic terms>" ~/Desktop/ObsidianVault/Brain/Research ~/Desktop/ObsidianVault/Brain/Memory ~/Desktop/ObsidianVault/Brain/Instincts 2>/dev/null
```
If a matching note turns up, read it, tell the user the file path/date/gist, ask "Reuse this note, or run a fresh pass?" Reuse → skip to Step 8 with the existing file. Otherwise continue.

### Step 1 — Slug + Scope (5 distinct angles)
Kebab-case `$ARGUMENTS` for the filename (lowercase, non-alphanumeric runs → single hyphen, trim edges).

Then decompose the topic into exactly 5 **distinct** search angles — not 5 phrasings of the same
query. Each angle should cover different ground (e.g. for a tool/repo: purpose & mechanism,
safety/red-flags, maintenance/community signals, comparison to alternatives, real-world
usage/reports). Write these inline as a short list — this is cheap synthesis, no need to delegate it.
If the question is underspecified for meaningful angles (e.g. no budget/region/use-case given),
ask 2-3 clarifying questions before scoping.

### Step 2 — Write the prompt to a scratch file, then run Antigravity

**Security note:** never interpolate `$ARGUMENTS` directly into a shell command string. Use the
Write tool to save the fully-substituted prompt to `/tmp/research-prompt-<slug>.txt`, then invoke
`agy` with `"$(cat <scratch-file>)"`.

Prompt content (substitute topic, the 5 angles from Step 1, slug, today's date):

```
RESEARCH TASK: $ARGUMENTS

You are the Research Orchestrator. Produce one verified research note using 5 independent subagents.

PHASE 1 — PARALLEL RESEARCH (invoke 5 subagents simultaneously, ONE ANGLE EACH — do not give them
all the same query, that correlates their blind spots):
- Agent 1 angle: <angle 1 from Step 1>
- Agent 2 angle: <angle 2 from Step 1>
- Agent 3 angle: <angle 3 from Step 1>
- Agent 4 angle: <angle 4 from Step 1>
- Agent 5 angle: <angle 5 from Step 1>

Each subagent MUST:
- Search the web for its assigned angle only.
- Fetch and actually read the full content of its top 3 sources — do not answer from search
  snippets alone.
- Produce a structured report: a list of DISCRETE, ATOMIC, FALSIFIABLE claims (one fact per
  bullet, not paragraphs — this list gets machine-parsed downstream), each with a Source URL and
  a Confidence Score (1-5).
- Work independently — no sharing of intermediate findings between agents.
- If a claim's primary source is a video, use `/watch <url> [question]` instead of inferring from
  title/description/snippet. Mark UNCONFIRMED if narration can't be transcribed.

PHASE 2 — CROSS-REVIEW:
- 3+/5 agents agree → VERIFIED
- Split, no majority → DISPUTED
- Single-agent claim → UNCONFIRMED

PHASE 3 — RETURN FINAL REPORT AS TEXT (no file writes — you lack access outside your scratch dir):
Output ONE merged Markdown report as your final response, claims as individual bullets (this is
parsed programmatically downstream, so keep each claim to one bullet = one atomic fact + one URL):

---
title: <Topic Title>
created: <today>
tags: [research, auto-generated, cross-reviewed]
source: antigravity-5-agent
verified_claims: <count>
disputed_claims: <count>
---

# <Topic Title>

## Verified Findings
(2+ agent claims, one bullet per claim, source URL + confidence per bullet)

## Data / Code / Pricing
(tables/snippets if applicable)

## Disputed — Needs Manual Check
(both sides, one bullet per side)

## Unconfirmed
(single-source claims, one bullet each)

## Sources
(all URLs)

Before finalizing, search the vault for related existing notes and wikilink them (Memory/ notes
always if relevant; project notes too if this was project-specific). Never invent a link.

RULES: under 800 words, density over length. Do not skip Phase 2. No URL = UNCONFIRMED regardless
of agreement. Obsidian-flavored Markdown, YAML frontmatter required.
```

Run (flag order load-bearing — `--dangerously-skip-permissions` MUST precede `--print`):
```bash
AGY_KIND=research agy --dangerously-skip-permissions --print "$(cat /tmp/research-prompt-<slug>.txt)"
```
**Never pass `--print-timeout`** (confirmed broken — corrupts the prompt or triggers unauthorized
edits). Default 5m0s timeout is correct; let it time out and fall back rather than adding the flag.

### Step 3 — Check for usage limit errors
Check output/stderr for: `usage limit`, `quota exceeded`, `rate limit`, `429`, `too many requests`,
`resource exhausted`, `limit reached`, `try again later`, `daily limit`, `RESOURCE_EXHAUSTED`,
`tokens per minute`, `requests per minute`, or non-zero exit with empty/error-only output.

No limit error → Step 4. Limit error → Step 3B.

---

### Step 3B — FALLBACK: Internal 5-Subagent Cross-Review
Tell the user: "Antigravity hit its usage limit. Falling back to internal 5-agent research."

Spawn exactly 5 subagents (Agent tool), **one per angle from Step 1** (same angle-diversification
rule applies here — this was missing from the old fallback and is a rigor gap, fix it):

```
You are Research Agent [1-5]. Research this angle INDEPENDENTLY using web search:

Topic: $ARGUMENTS
Your assigned angle: <angle N from Step 1>

Produce:
1. Discrete, atomic, falsifiable claims — one bullet per fact, each with a Confidence Score (1-5)
   and at least one Source URL. Fetch and read full source content, not just snippets.
2. Code Snippets / Pricing Tables if applicable.
3. Summary — 3 sentences max.

Rules: web search for every claim, no memory-only claims. Exact numbers/versions/dates. Under 300 words.
```

Cross-review yourself: 3+/5 agree → VERIFIED. Split → DISPUTED. Single-source → UNCONFIRMED. No
URL → UNCONFIRMED regardless of agreement.

Grep the vault for related notes to link (same rule as Step 2). Merge into the same report format
as Step 2, frontmatter `source: claude-5-agent-fallback`.

---

### Step 4 — Extract the claim list
Whether from agy or the fallback, parse every bullet under Verified Findings / Disputed /
Unconfirmed into a flat array: `{claim: string, sourceUrl: string, section: "verified"|"disputed"|"unconfirmed"}`.

Flag any claim as `highStakes: true` if it involves money/pricing/legal/security/safety claims or a
specific business metric (MRR, revenue, user counts) — these get the stricter 5-vote verify tier
in Step 6.

### Step 5 — Ground-truth objectively-checkable claims yourself first
Before spending any verify-agent votes: for claims that are a number/date/version/license/stat
checkable via a direct primary source (GitHub API, official docs, a pricing page, a package
registry) — fetch it yourself (`gh api`, `WebFetch` on the primary source, `curl`). Mark these
`groundTruthed: true/false` with the real value and source. **Remove these from the adversarial-verify
batch entirely** — don't waste a vote asking an LLM to "verify" what you can just fetch directly.
This is stricter than native `deep-research`, which treats every claim uniformly via web-search
verify agents even when a claim is trivially fetchable.

### Step 6 — Adversarial verify the remaining claims (GLM spoke rounds, batched)
Cap at 30 claims (exceeds native's 25-claim cap). Priority order if over cap: Verified section
first, then Disputed, then Unconfirmed — if any are dropped, say so explicitly in the final note
(no silent truncation).

**6a — Quota + peak gate first, always:**
```bash
~/.claude/orchestrator/state/glm-usage.sh
```
- `5h ≥ 90%` (HARD_STOP) → **skip adversarial verify entirely this run.** Note in the final report:
  "adversarial verify skipped — GLM quota ≥90%, corroboration-only (agy cross-review) stands."
  Do not fall back to Claude-native verify — that would silently reintroduce the same-vendor
  correlation problem this design exists to avoid. Skipping openly beats faking rigor.
- `5h ≥ 70%` (WARN_AT) → **1 round only**, tier `glm-4.7` (no majority vote possible with 1 round —
  every claim's verdict is that single round's; note this reduced-rigor mode in the report).
- `5h < 70%` → **3 rounds**, tier `glm-5.3` (judgment-adjacent task, not mechanical — matches
  protocol's tiering). Check peak hours too: `h=$(date -u +%H)`; if `h` is within
  `PEAK_START_UTC..PEAK_END_UTC` (source `~/.claude/orchestrator/state/quota-rules.sh`), downgrade
  to tier `glm-4.7` for all 3 rounds instead of deferring the whole run — 3 short verify rounds
  don't warrant a full peak deferral, but they shouldn't eat the 3× peak multiplier either.

**6b — Fire the rounds.** Each round = one spoke call carrying the ENTIRE capped claim list (not
one call per claim). Write the shared verify prompt once to a scratch file:

```
You are an independent fact-checker. For EACH claim below, actively try to REFUTE it via your own
fresh web search — hunt for contradicting evidence, outdated info, or overstatement. Do not just
re-confirm what's stated. Default refuted=false only if a genuine search turns up no contradiction.

Claims:
1. [id: c1] "<claim text>" (sourced from: <url>)
2. [id: c2] "<claim text>" (sourced from: <url>)
... (one line per capped claim)

End your response with EXACTLY one fenced json block, one entry per claim, no prose inside it:
​```json
[{"id":"c1","refuted":false,"confidence":4,"evidence":"..."}, ...]
​```
```

Fire the rounds (parallel, `run_in_background: true`, no trailing `&` — double-backgrounding
orphans the process per PROTOCOL.md):
```bash
ORCHESTRATOR_SPOKE=1 ANTHROPIC_MODEL=<tier from 6a> \
  timeout 10m glm-code -p "$(cat /tmp/research-verify-prompt-<slug>.txt)" \
  --dangerously-skip-permissions \
  > /tmp/research-verify-round-<n>-<slug>.log 2>&1
```
**10m, not less — confirmed root cause 2026-07-23**: a round doing real web search + refutation
across up to 30 claims genuinely needs this; a tighter timeout (5m was tried first) kills the
process mid-work via SIGTERM, which the Claude Code SDK transcript logs as
`[Request interrupted by user]` — the calling shell then just sees an empty/truncated log and an
"Execution error" exit, indistinguishable at a glance from a real crash. It isn't one — always
check the spoke's own session transcript (`~/.claude-spoke-<pid>/projects/<project>/<sessionId>.jsonl`
— glm-code gives each spoke its own PID-suffixed config dir since 2026-09-04, tail the newest one)
for `[Request interrupted by user]` before concluding glm-code itself is broken. Scale
timeout UP further (not down) if claim count is large or rounds run concurrently competing for
rate-limited web search. Up to 3 concurrent (protocol's max-4 cap comfortably covers this). `--dangerously-skip-permissions`
still goes through the safety classifier live, per call — if blocked, ask the user, don't retry
blind. Log each round's quota weight: `echo "$(date +%s) $W" >> ~/.claude/orchestrator/state/quota.log`
(`$W` = 2 off-peak/3 peak for glm-5.3, 1 for glm-4.7, from `quota-rules.sh`).

**6c — After each round:** grep its log for the LIMIT_PATTERNS from PROTOCOL.md
(`usage limit|quota|rate limit|429|too many requests|resource exhausted|insufficient|balance|limit reached|try again later|RESOURCE_EXHAUSTED`).
On a hit: stop firing further rounds immediately; any claim with fewer than 1 completed round is
"not adversarially tested (GLM limit hit mid-verify)". Otherwise parse the trailing ```json block
from the log into `{id, refuted, confidence, evidence}[]`.

**6d — Tally per claim across the completed rounds:**
- Standard claims: killed if refuted in **≥2/3** of completed rounds (or the single round, under
  the 70% throttle).
- High-stakes claims (money/pricing/legal/security/business-metric — flagged in Step 4): killed if
  refuted in **≥1/3** of completed rounds — a single credible dissent is enough to demote a
  high-stakes claim. Stricter than native `deep-research`'s flat threshold for every claim.

### Step 7 — Reassemble the note
For each claim, final status:
- `groundTruthed: true` → keep as **Ground-Truthed** (highest confidence tier — verified directly,
  not by LLM vote).
- Survived adversarial verify (`killed: false`) → **Adversarially Verified** (agy corroboration +
  independent GLM refutation-survival — cross-vendor, stronger than agy's plain cross-review
  agreement alone).
- `killed: true` → move to a **Refuted** section with the refutation evidence attached, even if it
  started in agy's "Verified Findings" — the adversarial layer overrides the corroboration layer
  when they conflict.
- Skipped entirely (quota ≥90%) or dropped by the Step 6 cap → keep in its original section, tagged
  "not adversarially tested (quota skip)" / "(budget cap)" respectively — visible, not silently
  upgraded or dropped.

Rank each section by confidence, highest first (native `deep-research` does this in Synthesize —
match it).

Write to `~/Desktop/ObsidianVault/Brain/Research/<SLUG>.md`:

```
---
title: <Topic Title>
created: <today>
tags: [research, auto-generated, dual-engine, adversarially-verified]
source: antigravity-5-agent + glm-spoke-adversarial-verify
verify_rounds: <1 or 3> · verify_tier: <glm-4.7 or glm-5.3 or skipped>
ground_truthed_claims: <count>
adversarially_verified_claims: <count>
refuted_claims: <count>
disputed_claims: <count>
unconfirmed_claims: <count>
---

# <Topic Title>

## Ground-Truthed
(direct-fetched facts, highest confidence, ranked)

## Adversarially Verified
(survived agy corroboration + independent GLM refutation attempts, ranked by confidence)

## Refuted
(killed by adversarial verify — include the refutation evidence, even if agy originally marked it Verified)

## Disputed — Needs Manual Check
## Unconfirmed
## Sources
## Related Notes
```

Confirm:
```bash
cat "~/Desktop/ObsidianVault/Brain/Research/<SLUG>.md"
```

### Step 8 — Summarize back to the user
- Engine used (Antigravity primary / Claude fallback) + verify engine (GLM tier + round count, or
  "skipped — quota" if 6a hit HARD_STOP)
- Counts: ground-truthed / adversarially verified / refuted / disputed / unconfirmed
- Any claim that flipped (agy said Verified, GLM verify killed it) — call these out explicitly,
  they're the whole point of the extra layer
- 3-5 bullet summary of the surviving key findings
- File path

Then ask: "Ready to implement, or do disputed/refuted claims need manual review first?"

## Rules
- **Fully autonomous.** Never ask the user to paste anything.
- **Always try Antigravity first**, fall back only on a genuine usage-limit signal.
- **The fallback is still 5 independent angle-diverse agents**, never 1.
- **The adversarial verify stage runs by default**, on agy output or fallback output alike — it's
  what makes this exceed native `deep-research`'s rigor. The ONLY reason to skip it is the quota
  gate in Step 6a (≥90%) — never skip it "to save time" or "because the topic seemed simple."
- **Quota guard is mandatory, not optional**, since verify now spends real GLM quota — always run
  6a before firing a single round.
- **Ground truth beats delegated votes.** Never spend a verify round on something you can fetch
  directly.
- **A spoke's refutation is a claim, not a fact** — same as any other spoke output. If a round's
  json block is malformed/missing, that round doesn't count toward the tally (don't guess its verdict).
- **Never implement before the note exists.**
- **If BOTH agy AND internal fallback fail**, tell the user honestly and stop. Do not guess.
