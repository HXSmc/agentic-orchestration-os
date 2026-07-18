# GLM Hub-Spoke Orchestrator

A clean-room, in-house take on [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)-style
orchestration: real Claude session as the hub (plan / critique / review /
verify), headless GLM-backed Claude Code instances as spokes (implementation), Antigravity
`/research` as the researcher. No code from oh-my-claudecode is reused — conceptual credit only;
this repo is independently licensed (see [LICENSE](LICENSE)).

Originally built 2026-07-11 from the original author's private build notes. Nothing in this repo
depends on those notes — everything you need to install and run it is below.

## Layout

| Repo path | Installs to | Role |
|---|---|---|
| `bin/glm-code` | `~/.local/bin/glm-code` | Spoke launcher — Claude Code pointed at Z.ai's Anthropic-compatible endpoint |
| `bin/glm-vision` | `~/.local/bin/glm-vision` | Visual-task offload to GLM-4.6V (screenshot QA, chart/diagram reading) |
| `orchestrator/PROTOCOL.md` | `~/.claude/orchestrator/PROTOCOL.md` | Hub protocol: roles, tiers, quota guard, spoke contract, error catchers |
| `orchestrator/state/quota-rules.sh` | `~/.claude/orchestrator/state/quota-rules.sh` | Single source of truth for GLM quota math |
| `orchestrator/state/glm-usage.sh` | `~/.claude/orchestrator/state/glm-usage.sh` | Live GLM Coding Plan quota reading (5h / weekly %) |
| `orchestrator/state/doctor.sh` | `~/.claude/orchestrator/state/doctor.sh` | One-command preflight — run before firing the first spoke each session |
| `orchestrator/hooks/loop-guard.mjs` | `~/.claude/orchestrator/hooks/loop-guard.mjs` | Stop-event hook: blocks turn-end while a loop is active |
| `commands/*.md` | `~/.claude/commands/` | The five loop commands: /ultrawork /ralph /team /autopilot /ultraqa |

## Dependencies

**Required:**
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) — the hub runs in it; `glm-code` spokes are headless Claude Code too.
- A [Z.ai GLM Coding Plan](https://z.ai/subscribe) account + API key (spokes run against Z.ai's Anthropic-compatible endpoint).
- `node` and `python3` — used by `glm-usage.sh`, `glm-vision`, and the `loop-guard.mjs` hook.
- GNU `timeout` (coreutils) — wraps every spoke launch so a hung spoke can't run forever. macOS: `brew install coreutils` then symlink `gtimeout` → `timeout` on PATH; Git Bash on Windows usually already has it.
- The [`glm-plan-usage` Claude Code plugin](https://github.com/zai-org/zai-coding-plugins) — powers real quota reading (`glm-usage.sh`, `doctor.sh`). Install: `claude plugin marketplace add zai-org/zai-coding-plugins`, then install `glm-plan-usage` from that marketplace.

**Optional:**
- [Antigravity CLI](https://antigravity.google/docs/cli-install) (`agy`) — only used by `/research` and `/team`'s agy workers. The core loop (`/ultrawork`, `/ralph`, `/autopilot`, `/ultraqa`) runs fully without it; `doctor.sh` warns, not fails, if it's missing.
- `gh` (GitHub CLI) — handy for PR/issue work alongside the orchestrator, not a hard dependency of anything in this repo.

## Install (Mac or Windows Git Bash)

```bash
./install.sh
```

Then, manual steps (also printed by `install.sh`):
1. Put your Z.ai GLM Coding Plan key in `~/.config/zai/api_key` (`chmod 600`). Never commit this — it's gitignored, and it should live wherever you keep secrets (a password manager, a gitignored notes file — this repo has no opinion on that).
2. Merge the Stop hook into `~/.claude/settings.json`:
   ```json
   "Stop": [{"hooks": [{"type": "command", "command": "node <ABS_PATH>/.claude/orchestrator/hooks/loop-guard.mjs", "timeout": 5}]}]
   ```
3. Append `orchestrator/SPOKE-MODE.md`'s content as a section of your own `~/.claude/CLAUDE.md` (spokes inherit it; the `ORCHESTRATOR_SPOKE=1` guard in its heading keeps it from affecting your normal hub sessions).
4. Confirm GNU `timeout` is on PATH.
5. Run `~/.claude/orchestrator/state/doctor.sh` — verifies all of the above in one shot. Exit 0 = clear to fire your first spoke.

Windows: run the same steps from Git Bash; set `QUOTA_SHARE=40` in `quota-rules.sh` on both machines if you orchestrate from Mac and Windows in the same account (the plan's quota is account-wide, not per-machine).

## Deviations from the build-spec (verified fixes, 2026-07-11)

- `glm-code` exports `ANTHROPIC_MODEL="$MODEL"` — hub settings pin `model: fable`, which spokes
  inherit and Z.ai rejects (`400 Unknown Model`). Env override fixes routing.
- `glm-code` exports `ORCHESTRATOR_SPOKE=1` and `loop-guard.mjs` exits early on it — spokes share
  the hub's cwd, inherit the Stop hook, and (with `--dangerously-skip-permissions`) will otherwise
  delete the hub's `loop.lock` to free their own turn-end. Reproduced live, twice.

## Quota ledger

`~/.claude/orchestrator/state/quota.log` (machine-local, NOT in this repo): one line per spoke,
`<unix-ts> <weight>`. Weights come from quota-rules.sh (glm-5.2 peak 3× / off-peak 2×, glm-4.7 1×).

## Multi-surface rules (added 2026-07-11)

All three LLM surfaces carry the operator's core rules (evidence-first, simplicity, verify-via-web, secrets hygiene, fail-loudly on limits):

| Surface | Rules file | Installs to |
|---|---|---|
| Claude hub | operator's own `~/.claude/CLAUDE.md` | (already there) |
| GLM spokes | `orchestrator/SPOKE-MODE.md` | appended as a section to `~/.claude/CLAUDE.md` (guarded by `ORCHESTRATOR_SPOKE=1` wording; spokes inherit the file) |
| Gemini / Antigravity (agy) | `GEMINI.md` | `~/.gemini/GEMINI.md` |

## Slim spoke config (added 2026-07-11)

Spokes run with `CLAUDE_CONFIG_DIR=~/.claude-spoke` (exported by the launcher) so they DON'T inherit
your full `~/.claude` (plugins, skills, personal hooks) — that inheritance measured ~670K tokens per
trivial spoke on a token-metered plan. `spoke-config/` holds the minimal dir contents (spoke rules +
a bare `settings.json`); `install.sh` copies it to `~/.claude-spoke`. Add your own hooks there if
you want spokes to run through a local tool proxy — none is shipped by default.

## License

[MIT](LICENSE).
