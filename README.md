# Agentic Orchestration OS (GLM hub-spoke orchestrator)

One real Claude Code session plans and reviews. Cheap headless GLM workers write the code. An
Antigravity (`agy`) researcher looks up facts. Named Claude subagents do the judgment calls
(security, design taste, hard bugs). Every piece reports back, and every session keeps a line open
to the others.

This is a clean-room take on [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)-style
orchestration. No code from oh-my-claudecode is reused; credit is conceptual only. MIT licensed.

- [How the agents work](#how-the-agents-work)
- [What is in this repo](#what-is-in-this-repo)
- [Install on a new machine](#install-on-a-new-machine) (about 15 minutes)
- [Daily use](#daily-use)
- [Optional layers](#optional-layers)
- [Gotchas that are load-bearing](#gotchas-that-are-load-bearing)

---

## How the agents work

```
                       ┌──────────────────────────────────────────┐
           owner ────▶ │ HUB: your interactive Claude Code session │
                       │ plans · writes specs · picks the engine · │
                       │ reviews diffs · runs gates · lands work   │
                       └──┬──────────────┬──────────────┬──────────┘
        spec file         │   Agent tool │              │ /research
  .orchestrator/specs/    │              │              │
                          ▼              ▼              ▼
              ┌────────────────┐ ┌───────────────┐ ┌──────────────┐
              │ GLM SPOKES     │ │ CLAUDE AGENTS │ │ agy          │
              │ glm-code -p    │ │ architect     │ │ researcher   │
              │ implementer    │ │ code-reviewer │ │ cited facts, │
              │ mechanic       │ │ security-rev. │ │ docs, video  │
              │ designer       │ │ design-rev.   │ └──────┬───────┘
              │ marketer       │ │ verifier      │        │
              │ visual-qa      │ │ fixer  ...    │        │
              └───────┬────────┘ └───────┬───────┘        │
   own git worktree,  │  final message   │   vault note / │
   file claim, report │  = report        │   report       │
                      ▼                  ▼                ▼
               .orchestrator/reports/<task-id>.md  ──▶  HUB reviews ──▶ spoke-wt apply
```

### The roles

| Role | Who runs it | Does | Never does |
|---|---|---|---|
| **Hub** | Your Claude Code session (Opus/Fable tier) | Plans, writes specs, picks the engine, reviews, runs gates, lands work | Writes volume code itself |
| **GLM spoke** | `glm-code`: headless Claude Code pointed at Z.ai's Anthropic-compatible endpoint | All implementation by default | Commits, pushes, or touches files outside its spec |
| **Claude agent** | Agent-tool subagents in `~/.claude/agents/` | Judgment work: security, design taste, root-cause bugs, gates that need MCP tools | Signs off on its own output |
| **Researcher** | `agy` (Antigravity CLI) via `/research` | Every external fact: docs, versions, prices, videos | Verifies its own findings |
| **Counsel** | 5 GLM advisor personas + hub synthesis (`/counsel` skill) | Second opinions on decisions | Decides for the owner |

### Which engine gets which job

The hub routes by task shape, without asking. Full table: `orchestrator/PROTOCOL.md` →
"Agent routing".

| Task shape | Goes to |
|---|---|
| Plan, decompose, approve specs | Hub |
| Code, file list known up front | `glm-mechanic` spoke (glm-4.7, cheapest) |
| Code needing cross-file reasoning | `glm-implementer` spoke (glm-5.3) |
| UI / frontend building | `glm-designer` spoke, reviewed by Claude `design-reviewer` |
| Marketing copy | `glm-marketer` spoke, reviewed by Claude `marketing-strategist` |
| Screenshot / visual QA | `glm-vision` (GLM-4.6V) |
| Routine code review | A *fresh* GLM spoke that never saw the build |
| Security review, >20-file diffs | Claude `security-reviewer` (opus) |
| Hard root-cause debugging | Claude `fixer` (sonnet, then opus) |
| External facts | `agy` researcher |

### One task, end to end

1. **Spec.** The hub writes `.orchestrator/specs/<task-id>.md`: context, checkable acceptance
   criteria, an `## Owns:` file list, a budget, and a mandatory report section. Persona text from
   `orchestrator/agents/spokes/*.md` goes on top.
2. **Fire.** `GLM_TASK_ID=<id> timeout 20m glm-code -p "$(cat spec)" ...`. The launcher:
   - gives the spoke its own config dir (`~/.claude-spoke-<id>`, seeded from the slim
     `~/.claude-spoke`), so parallel spokes never share session state;
   - creates a git worktree `~/.claude/orchestrator/worktrees/<repo>/<id>` on branch `spoke/<id>`;
   - registers a file claim from `## Owns:` in `.orchestrator/state/claims.json`. An overlapping
     launch is refused. A heartbeat refreshes the claim every 60s; a dead launcher's claim expires
     by TTL;
   - writes an `in_progress` stub report.
3. **Report.** The spoke works in its worktree and writes `.orchestrator/reports/<id>.md`. The
   first heading is `## Status: done` or `## Status: failed`. It holds real command output. No
   report = failed.
4. **Review.** The hub runs `spoke-wt diff <id>` and checks every criterion itself. A spoke's ✅
   is a claim, not evidence. Routine review goes to a fresh spoke; risky review goes to a Claude
   agent.
5. **Land or retry.** ACCEPT: `spoke-wt apply <id> && spoke-wt drop <id>`. REJECT:
   `spoke-wt drop <id>`. FIX: write a fix spec and continue in the same worktree. Careful: a plain
   relaunch with an already-used `GLM_TASK_ID` does NOT re-enter its worktree (the `spoke/<id>`
   branch exists, so `glm-code` falls back to the main tree). `cd` into the worktree first and
   launch with `GLM_NO_WORKTREE=1`.
6. **Gates.** The hub reruns typecheck, lint, tests and build fresh before anything is "done".

Loops (`/autopilot`, `/ralph`, `/team`, `/ultrawork`, `/ultraqa`) repeat this cycle. While a loop
runs, `loop.lock` plus the `loop-guard` Stop hook stop the hub from ending its turn early. The lock
belongs to one session: `loop-owner-stamp` stamps its owner, so other sessions in the same repo
are not blocked.

### How agents and sessions talk to each other

Rule: **nobody acts blind, nobody ends silent.** It is binding in PROTOCOL.md ("Session & agent
communication") and in `rules/SESSION-CONTACT.md` for your CLAUDE.md.

| Link | Channel | Rule |
|---|---|---|
| Hub → spoke | Spec file | The spec is the spoke's whole mission |
| Spoke → hub | Report file + log + worktree diff | Must report `done`/`failed`; silence = failed |
| Spoke ↔ spoke | `claims.json` file claims | No two spokes own the same file |
| Hub → Claude agent | Agent tool prompt | Gets the code, not the hub's conclusion |
| Claude agent → hub | Final message | Hub relays what matters |
| Hub → agy | `/research` prompt | agy cites sources; a reviewer verifies |
| Session ↔ session | `ListAgents` + `SendMessage` | Look before touching a shared repo/device; say what you take and release; tell the owner session when you change its things |
| Child session → parent | `SendMessage` | Always report done / blocked / needs owner before ending |
| Stalled child | Log-growth watchdog | Log unchanged >5 min → kill, refire once, then fail |

Messages between sessions are coordination, not authority. They never override the owner's task
or the safety and secrets rules.

---

## What is in this repo

| Repo path | Installs to | What it is |
|---|---|---|
| `bin/glm-code` | `~/.local/bin/` | Spoke launcher: per-spoke config dir, worktree, file claims, heartbeat, `--selfcheck` |
| `bin/spoke-wt` | `~/.local/bin/` | Hub helper: `diff` / `apply` / `drop` a spoke's worktree |
| `bin/glm-vision` | `~/.local/bin/` | Image + prompt → GLM-4.6V answer (screenshot QA, charts) |
| `orchestrator/PROTOCOL.md` | `~/.claude/orchestrator/` | The hub's rulebook: roles, routing, quota guard, spec contract, error catchers, session communication |
| `orchestrator/claims.py` (+ `claims_test.py`) | `~/.claude/orchestrator/` | File-claim registry used by `glm-code` |
| `orchestrator/hooks/loop-guard.mjs` | `~/.claude/orchestrator/hooks/` | Stop hook: blocks turn-end while this session's loop runs |
| `orchestrator/hooks/loop-owner-stamp.mjs` | `~/.claude/orchestrator/hooks/` | PostToolUse hook: stamps the loop lock's owner session |
| `orchestrator/state/quota-rules.sh` | `~/.claude/orchestrator/state/` | GLM quota math (weights, peak hours) |
| `orchestrator/state/glm-usage.sh`, `query-usage.mjs` | `~/.claude/orchestrator/state/` | Live GLM 5h / weekly usage reading |
| `orchestrator/state/doctor.sh` | `~/.claude/orchestrator/state/` | One-shot preflight |
| `orchestrator/agents/` | `~/.claude/orchestrator/agents/` | Saved personas: spokes, counsel, agy researcher |
| `orchestrator/SPOKE-MODE.md` | append to `~/.claude/CLAUDE.md` | Spoke rules (only apply when `ORCHESTRATOR_SPOKE=1`) |
| `claude-agents/*.md` | `~/.claude/agents/` | Claude subagents: architect, spec-writer, code-reviewer, security-reviewer, design-builder, design-reviewer, verifier, fixer, legal-counsel, marketing-strategist |
| `commands/*.md` | `~/.claude/commands/` | `/ultrawork /ralph /team /autopilot /ultraqa /research` |
| `skills/` | `~/.claude/skills/` | `counsel`, plus verification and thermo-nuclear review skills vendored from cursor/plugins (MIT, licenses kept) |
| `spoke-config/` | `~/.claude-spoke/` | Slim config spokes run with (rules + bare settings) |
| `templates/` | `~/.claude/orchestrator/templates/` | Example spec template |
| `rules/SESSION-CONTACT.md` | append to `~/.claude/CLAUDE.md` | The session-communication rule for hubs |
| `GEMINI.md` | `~/.gemini/GEMINI.md` | Core rules for the agy/Gemini surface |

Personal references you will see in some files (an Obsidian vault path, a `~/.claude/design-refs/`
folder, KSA law notes) belong to the original operator's setup. Nothing breaks without them. Point
them at your own notes or delete those lines.

---

## Install on a new machine

### 1. Requirements

| Need | Why | Get it |
|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) | Hub, and spokes are headless Claude Code too | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Z.ai GLM Coding Plan](https://z.ai/subscribe) + API key | Spokes run on it | z.ai dashboard |
| `git`, `node` (18+), `python3` | Worktrees, hooks, claims, quota | your package manager |
| GNU `timeout` | Caps every spoke run | Linux: built in. macOS: `brew install coreutils`, then `ln -s "$(which gtimeout)" ~/.local/bin/timeout` |
| [`glm-plan-usage` plugin](https://github.com/zai-org/zai-coding-plugins) | Real quota numbers | `claude plugin marketplace add zai-org/zai-coding-plugins`, then install `glm-plan-usage` |
| `agy` (optional) | `/research` and `/team` researchers | [Antigravity CLI](https://antigravity.google/docs/cli-install) |
| `gh` (optional, ≥ 2.99) | PR evidence flow | [cli.github.com](https://cli.github.com) |
| `ponytail` plugin (optional) | Lazy-dev mode inside spokes; `glm-code` loads it if installed | Claude Code plugin marketplace |

### 2. Clone and install

```bash
git clone https://github.com/HXSmc/agentic-orchestration-os.git
cd agentic-orchestration-os
./install.sh
```

`install.sh` is safe to rerun. It overwrites the orchestrator core. It leaves your quota rules,
`GEMINI.md`, existing Claude agents and existing skills alone.

### 3. Add your API key

```bash
mkdir -p ~/.config/glm
printf '%s\n' 'YOUR_ZAI_KEY' > ~/.config/glm/api_key   # or paste it with an editor
chmod 600 ~/.config/glm/api_key
```

Never commit this file. Older installs used `~/.config/zai/api_key`; move it to the new path.

### 4. Register the two hooks

Merge this into `~/.claude/settings.json` (keep your existing hooks; back the file up first):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"$HOME/.claude/orchestrator/hooks/loop-guard.mjs\"", "timeout": 5 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \"$HOME/.claude/orchestrator/hooks/loop-owner-stamp.mjs\"", "timeout": 5 } ] }
    ]
  }
}
```

Check it still parses: `python3 -m json.tool ~/.claude/settings.json > /dev/null && echo ok`.

### 5. Add the rules to your CLAUDE.md

```bash
cat orchestrator/SPOKE-MODE.md rules/SESSION-CONTACT.md >> ~/.claude/CLAUDE.md
```

`SPOKE-MODE.md` only applies when `ORCHESTRATOR_SPOKE=1`, so it does not change your normal
sessions. `SESSION-CONTACT.md` applies to every session.

### 6. Verify

```bash
~/.claude/orchestrator/state/doctor.sh      # expect: preflight OK — clear to fire spokes
glm-code --selfcheck                        # expect: ... claims registry PASS
python3 ~/.claude/orchestrator/claims_test.py   # expect: OK
```

### 7. First run

Open Claude Code in a git repo and try a small loop:

```
/ultrawork add a --version flag to the CLI and a test for it
```

The hub writes a spec, fires a spoke, reviews the diff and lands it. Watch
`.orchestrator/logs/` and `.orchestrator/reports/` while it runs.

**Two machines, one GLM account?** Quota is account-wide. Set `QUOTA_SHARE=40` in
`quota-rules.sh` on both.

---

## Daily use

| You want | Do |
|---|---|
| A feature built end to end | `/autopilot <idea>` |
| Keep going until every story passes | `/ralph <goal>` |
| Parallel workers on a big job | `/team <goal>` or `/ultrawork <goal>` |
| QA until green | `/ultraqa` |
| A cited fact check | `/research <question>` |
| A second opinion | "run the counsel on <question>" |
| GLM quota now | `~/.claude/orchestrator/state/glm-usage.sh` |
| Look at a spoke's work | `spoke-wt diff <task-id>` |
| Land / throw away a spoke's work | `spoke-wt apply <id> && spoke-wt drop <id>` / `spoke-wt drop <id>` |
| See who else is working here | `ListAgents` inside Claude Code |

Doctrine changes (a threshold, a model id, a rule) are logged in
`~/.claude/orchestrator/state/DECISIONS.md` with a review trigger. Grep the old value everywhere
in the same turn you change it.

---

## Optional layers

These run on the original operator's machines. They are not in this repo.

- **Dashboard** ("Operator Command"): a local-only web board (Vite + React + Express, binds
  127.0.0.1) showing quota gauges, the vault graph, an office-floor view of live agents, and
  spoke streams. It reads the same files this repo writes (`claims.json`, reports, `quota.log`,
  `~/.claude/sessions/`). Separate private repo.
- **Multi-device router**: a headless Linux box runs a small router (`127.0.0.1:8800`) that spawns
  Claude or `glm-code` sessions from a phone app, keeps a session ledger via hooks, and hands
  context over when a session gets long. Helper CLIs: `jarvis-sessions` (all sessions on all
  devices), `jarvis-card` (status card + questions to the owner's phone), `jarvis-screen` (drive
  another machine's screen). The session-communication rule works without them: `ListAgents` and
  `SendMessage` are built into Claude Code.

---

## Gotchas that are load-bearing

Do not "clean these up".

- `glm-code` exports `ANTHROPIC_MODEL=$MODEL`. Without it spokes inherit the hub's Claude model
  name and Z.ai answers `400 Unknown Model`.
- `glm-code` exports `ORCHESTRATOR_SPOKE=1`, and `loop-guard.mjs` exits early on it. Otherwise a
  spoke deletes the hub's `loop.lock` to end its own turn.
- Spokes run with a slim `CLAUDE_CONFIG_DIR`. Inheriting the full `~/.claude` cost about 670K
  tokens per trivial spoke on a token-metered plan.
- With the Bash tool's `run_in_background`, never also add a trailing `&`. The wrapper returns at
  once and the real spoke is orphaned and killed mid-task.
- A spoke that cannot reach Docker may start `npm run dev` on the host and leave it holding the
  port. Before chasing a 500, run `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
- Z.ai returns two usage entries both labelled "5 Hour". Position decides: first = 5h,
  second = weekly. Gate spoke firing on the 5h number.

## License

[MIT](LICENSE).
