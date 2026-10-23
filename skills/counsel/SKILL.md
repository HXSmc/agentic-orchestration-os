---
name: counsel
description: 5-advisor GLM counsel + Fable head-counsel synthesis, plus a quick 3-voice mode (Skeptic/Pragmatist/Critic) for code-specific go/no-go calls. Use when the user asks to "run the counsel", "ask the 5 advisors", "/counsel <question>", "council", second opinions or dissent — AND by default for ANY naturally-asked complex question (decisions, tradeoffs, strategy, "should I", idea evaluation), no command needed. Simple factual/lookup questions don't qualify. GLM spokes do the advising (quota-cheap; Claude Agent-tool subagents as fallback when GLM is limited), agy does research if fresh facts are needed, Fable hub only frames + synthesizes.
---

# /counsel — 5-Advisor Counsel (GLM spokes + Fable head counsel)

Flow (from the TikTok 5-advisors pattern): frame neutrally → optional agy research → 5 saved GLM
advisors answer independently → anonymize → Fable synthesizes the verdict.

Saved advisor personas live in `~/.claude/orchestrator/agents/counsel/*.md` (contrarian,
first-principles, expansionist, outsider, executor). Read PROTOCOL.md rules once per session
before firing spokes (quota guard, spoke launch contract, LIMIT_PATTERNS).

## Procedure (hub)

### 0. Gates + auto-trigger
- **Auto-trigger**: this skill is the DEFAULT path for any naturally-asked complex question
  (decision, tradeoff, strategy, "should I", idea/plan evaluation) — user does not need to type
  /counsel. Skip it for simple factual lookups, quick technical questions, and task requests
  (those go through normal orchestration).
- `~/.claude/orchestrator/state/glm-usage.sh` — 5h ≥90% OR a LIMIT_PATTERNS hit mid-run →
  **Claude fallback** (below), don't stop the counsel; ≥70% warn user, still fine (5 small spokes).
- Peak-hour rule applies (5 glm-5.3 spokes = GLM-heavy): during Beijing peak use the Claude
  fallback instead of deferring — a question wants an answer now, not at peak end.

### 0b. Claude fallback (GLM limited/peak)
Same personas, same flow — swap step 4: instead of glm spokes, fire 5 Agent-tool subagents
(`subagent_type: general-purpose`, model sonnet — volume work, budget-first; Fable stays
synthesis-only). Prompt = persona file body + framed question + research brief note + "return
your answer in the required format as your final message" (no report files needed — Agent
results come back directly). Single message, 5 parallel Agent calls. Anonymize + synthesize
identically. Tell the user which engine ran the counsel.

### 1. Frame the question neutrally (hub, cheap)
Rewrite the user's question stripping leading bias ("should I do X?" not "X is great, right?").
One paragraph max: the question + only the context an outsider needs. Show the user the framed
question in one line, don't wait for approval.

### 2. Research pre-step (only if needed)
If answering requires external/current facts (market data, pricing, competitors, APIs, news):
- Light (1-3 facts): `agy --dangerously-skip-permissions --print "<focused research prompt>"`
  (flag order load-bearing). Save output to the run dir as `research.md`.
- Substantive: invoke the `/research` skill; copy its verified note into `research.md`.
Purely personal/strategic questions with no external facts → skip, no research.md.

### 3. Run dir + specs
```bash
RUN=~/.claude/orchestrator/counsel/runs/$(date +%Y%m%d-%H%M%S)
mkdir -p $RUN/{specs,reports,logs}
```
For each advisor persona file, Write `$RUN/specs/<advisor>.md`:
```markdown
# Counsel task: <advisor>
<persona file body verbatim>

## The question (framed neutrally)
<framed question>

## Research brief
<"Read $RUN/research.md first — ground factual claims in it." OR "None — flag unverified facts.">

## Contract
- Answer the question in your persona's required format. Nothing else.
- Write your full answer to $RUN/reports/<advisor>.md. Final message = one line: "done".
- Do not read other advisors' files. Do not touch any other files.
## Budget: 10
```

### 4. Fire 5 spokes (parallel, max 4 concurrent per PROTOCOL)
From `$RUN`, per spoke (Bash `run_in_background: true`, NO trailing `&` — double-background bug):
```bash
timeout 10m glm-code -p "$(cat $RUN/specs/<advisor>.md)" \
  --permission-mode acceptEdits --dangerously-skip-permissions \
  > $RUN/logs/<advisor>.log 2>&1
```
Fire 4, then the 5th as one finishes. Log quota: `echo "$(date +%s) <W52>" >> ~/.claude/orchestrator/state/quota.log` per spoke.
Heartbeat while waiting (~20s outputs). After each: grep log for LIMIT_PATTERNS before reading
report. Missing/empty report = refire once with same spec + "previous attempt died" line; second
failure → proceed with 4 advisors and tell the user which seat was empty.

### 5. Anonymize (hub)
Read the 5 reports. Relabel as Advisor A–E in a SHUFFLED order (don't map A=contrarian every
time). Keep the mapping in memory for the final reveal.

### 6. Head counsel synthesis (Fable hub — the only judgment step)
Synthesize from the anonymized answers:
- **Verdict** — one paragraph, the decision/answer.
- **Where the counsel agrees** — convergent points (strongest signal).
- **Where it splits** — real conflicts + which side Fable rules for and why.
- **What survived the Contrarian** — risks accepted vs risks that change the plan.
- **Monday morning** — first domino + first 48h (from Executor, amended by the verdict).
- **Seat reveal** — one line mapping A–E → personas.
Deliver this to the user as the final message. Full reports stay in `$RUN/reports/` — link the dir.

## Quick mode (merged from the former `council` skill)
For a narrow, codebase-specific go/no-go (monorepo vs polyrepo, ship now vs hold, flag vs full
rollout) where 5 personas are overkill:
1. Hub writes its own position first (stance, 3 reasons, main risk) BEFORE reading any voice, so
   the synthesis does not just mirror them.
2. Fire 3 parallel Agent-tool subagents (Skeptic: challenge the premise, simplest alternative;
   Pragmatist: speed, user impact, ops reality; Critic: edge cases, failure modes). Each gets only
   the question + compact context, never the conversation. Format: Position (1-2 sentences),
   Reasoning (3 bullets), Risk, Surprise; under 300 words.
3. Verdict, phone-scannable: each voice in one line, then Consensus, Strongest dissent, Premise
   check, Recommendation. If a voice changed the hub's view, say so. Never hide dissent.
Not for code review (use code-reviewer) or implementation planning (use architect).

## Notes
- Advisors answer questions; they never edit files outside their report. acceptEdits +
  constraints + isolated run dir = containment.
- Reuse: personas are standing — never rewrite them per question; runtime spec carries the
  question. Improving a persona = deliberate edit to its file in the registry.
