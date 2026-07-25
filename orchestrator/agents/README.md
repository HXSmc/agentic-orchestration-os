# Saved Custom Agents Registry (standing convention, 2026-07-25)

Reusable agent definitions for the hub-spoke orchestrator. Standing practice: whenever an
orchestration produces an agent persona/config worth reusing (a prompt + fixed instructions +
skills/plugins it should invoke), SAVE it here instead of leaving it inline in a one-off spec.

## Layout
- `counsel/` — the 5-advisor counsel (contrarian, first-principles, expansionist, outsider,
  executor). Used by the `/counsel` skill. Engine: glm-5.2 spokes; head counsel = Fable hub.
- `spokes/` — GLM worker personas (2026-07-25): `glm-implementer` (glm-5.2, default volume
  coder), `glm-mechanic` (glm-4.7, trivial/mechanical at 1× quota), `glm-visual-qa`
  (glm-vision CLI prompt template for screenshot QA).
- `agy/` — `researcher` (the one agy persona: cited external-fact research, /watch for video
  sources; /research remains the default wrapper for substantive research).
- `<group>/<agent>.md` — one file per agent, grouped by workflow.
- Claude-native role agents live in `~/.claude/agents/*.md` instead (architect, spec-writer,
  code-reviewer, security-reviewer, design-reviewer, verifier, fixer — real Agent-tool
  subagents with model + skills frontmatter), not here.

## File format
```markdown
# <Agent display name>
engine: glm-5.2 | glm-4.7 | agy | claude   ← which surface runs it
tagline: <one line>
skills: <optional — skills/plugins the agent must invoke, e.g. /watch, ponytail>

## Persona instructions (inject verbatim into the spoke spec / agy prompt / Agent tool prompt)
<the reusable prompt body>

## Required answer format
<output contract>
```

## How each engine consumes a saved agent
- **glm spoke**: hub writes a runtime spec = persona file body + the question/task + report
  contract, fires per PROTOCOL.md "Firing a spoke".
- **agy**: hub prepends persona body to the `agy --dangerously-skip-permissions --print "..."`
  prompt (flag order load-bearing, see PROTOCOL.md).
- **claude (Agent tool)**: persona body becomes the Agent tool prompt; for permanent Claude-native
  subagents create `~/.claude/agents/<name>.md` instead (deliberate, named action — never as a
  silent side effect of a task, per PROTOCOL.md architect rule).

Personas here are engine-agnostic prompt bodies — the runtime contract (budget, report path,
constraints) is always added by the hub at fire time, never baked in.
