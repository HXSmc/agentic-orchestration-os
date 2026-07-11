# GLM Hub-Spoke Orchestrator

In-house replica of oh-my-claudecode's orchestration on a student budget: real Claude
session as the hub (plan / critique / review / verify), headless GLM-backed Claude Code
instances as spokes (implementation), Antigravity `/research` as the researcher.

Built 2026-07-11 from the build-spec in the Obsidian vault
(`Future Projects/How-To-Set-Up-OMC-and-GLM.md`); strategy in
`Future Projects/multi-agent-Orchestration.md`.

## Layout

| Repo path | Installs to | Role |
|---|---|---|
| `bin/glm-code` | `~/.local/bin/glm-code` | Spoke launcher — Claude Code pointed at Z.ai's Anthropic-compatible endpoint |
| `orchestrator/PROTOCOL.md` | `~/.claude/orchestrator/PROTOCOL.md` | Hub protocol: roles, tiers, quota guard, spoke contract, error catchers |
| `orchestrator/state/quota-rules.sh` | `~/.claude/orchestrator/state/quota-rules.sh` | Single source of truth for GLM quota math |
| `orchestrator/hooks/loop-guard.mjs` | `~/.claude/orchestrator/hooks/loop-guard.mjs` | Stop-event hook: blocks turn-end while a loop is active |
| `commands/*.md` | `~/.claude/commands/` | The five loop commands: /ultrawork /ralph /team /autopilot /ultraqa |

## Install (Mac or Windows Git Bash)

```bash
./install.sh
```

Then:
1. Put the Z.ai GLM Coding Plan key in `~/.config/zai/api_key` (chmod 600). Key lives in the Secrets vault — NEVER in this repo.
2. Merge the Stop hook into `~/.claude/settings.json`:
   ```json
   "Stop": [{"hooks": [{"type": "command", "command": "node <ABS_PATH>/.claude/orchestrator/hooks/loop-guard.mjs", "timeout": 5}]}]
   ```
3. GNU `timeout` must exist (`brew install coreutils` + symlink on macOS; Git Bash usually has it).
4. Windows: see the build-spec appendix (QUOTA_SHARE=40 on both machines when both orchestrate in the same 5h window).

## Deviations from the build-spec (verified fixes, 2026-07-11)

- `glm-code` exports `ANTHROPIC_MODEL="$MODEL"` — hub settings pin `model: fable`, which spokes
  inherit and Z.ai rejects (`400 Unknown Model`). Env override fixes routing.
- `glm-code` exports `ORCHESTRATOR_SPOKE=1` and `loop-guard.mjs` exits early on it — spokes share
  the hub's cwd, inherit the Stop hook, and (with `--dangerously-skip-permissions`) will otherwise
  delete the hub's `loop.lock` to free their own turn-end. Reproduced live, twice.

## Quota ledger

`~/.claude/orchestrator/state/quota.log` (machine-local, NOT in this repo): one line per spoke,
`<unix-ts> <weight>`. Weights come from quota-rules.sh (glm-5.2 peak 3× / off-peak 2×, glm-4.7 1×).
