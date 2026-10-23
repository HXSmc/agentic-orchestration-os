# approval-gate — approval-ladder governance module

Standalone port of [OpenWorker](https://github.com/andrewyng/openworker)'s
approval-ladder governance pattern: **hard floors no mode can lower;
one-off approval → standing rule → allowlist graduation**, each step explicit
and revocable; **append-only audit trail** with approval provenance.

Installed at `~/.claude/orchestrator/approval/approval-gate.mjs` (repo copy:
`orchestrator/approval/approval-gate.mjs`, thin CLI entry `bin/approval-gate`).
Node ESM, stdlib only. State lives in `~/.claude/orchestrator/state/approval/`
(override with `APPROVAL_GATE_STATE_DIR`):

- `rules.jsonl` — standing rules, one human-editable JSON object per line
- `audit.ndjson` — append-only, one JSON object per check/grant/revoke

**FAIL OPEN**: any problem with the gate's own files (missing state dir,
corrupt rules line, audit append failure) → `verdict=allow`, exit 0, stderr
warning `approval-gate: FAIL-OPEN <reason>`. Exception: if the classifier tier
is `hard_floor`, fail-open still returns `ask` (exit 7) — hard-floor actions
are never auto-allowed, even by fail-open. The gate may never brick a running
loop. That's why it's safe to wire into live launchers during the evaluation
month.

## Tier ladder

The classifier is pure and deterministic — `(category, desc) -> tier`, no LLM.

| Tier | Categories | Default verdict (no rule) | Standing rule can auto-allow? |
|---|---|---|---|
| `hard_floor` | `force_push`, `rm_rf_outside_repo`, `prod_deploy`, `payment_write`, `credential_write`, `mass_messaging` | ask | **never** |
| `external` | `send_message`, `email`, `deploy_nonprod`, `outbound_http_write`, `phone_call`; also any unrecognized category (conservative) | ask | yes |
| `exec` | `exec`, `shell`, `spoke_launch` | allow | yes |
| `write_local` | `write_file`, `edit_file`, `delete_file` | allow | yes |
| `read` | `read`, `list`, `status`, `query` | allow | yes |

Two desc regexes force `hard_floor` regardless of category:
`git push.*--force` and `rm -rf`. `grant` refuses to create a rule for a
hard-floor category or a pattern those regexes would floor — hard-floor
actions can never be auto-allowed.

## Commands

```
approval-gate check  --category <cat> --desc "<description>" [--source <caller>] [--jarvis] [--no-ask]
approval-gate grant  --category <cat> [--pattern "<substr>"] --why "<text>" --source <who> [--from <audit-id>]
approval-gate revoke <rule-id>
approval-gate list [--audit [--tail N]]
approval-gate selfcheck
```

- `check` prints one machine-readable line
  `verdict=<allow|deny|ask> tier=<t> rule=<id|null> audit=<id>` and ALWAYS
  appends an audit line (even on fail-open). Exit codes: allow=0, ask=7,
  deny=13, usage/other errors=1.
- `--no-ask` turns an ask-eligible verdict into `deny` (the only `check` path
  that produces audit verdict `denied`).
- `grant` appends a standing rule; a rule matches when its category equals the
  check's category AND (its pattern is empty OR a substring of the desc).
  `--from <audit-id>` records which one-off approval the rule graduates from —
  the provenance link that makes the ladder auditable.
- `revoke <id>` (or hand-deleting the line from `rules.jsonl`) removes a rule.

## Adoption for a loop command (the jarvis ask path)

`ask` extends the hub's verdict enum: the action is neither allowed nor
denied — it's parked for the owner. With `--jarvis`, `check` shells out to
`$APPROVAL_GATE_JARVIS_CMD` (default
`~/Desktop/personal/jarvis-phone/scripts/request_call.sh`) as:

```
$CMD "approval-gate <audit-id>: <category> — <desc>"
```

then prints `ask: parked for owner — watch <cwd>/.orchestrator/inbox/ for
*-owner-call-instructions.md`. The gate does NOT wait or poll — jarvis dials
the owner, files spoken instructions into the project's
`.orchestrator/inbox/`, and the calling loop picks them up on its next pass.
A loop command adopting the gate should:

1. Run `check` before the gated action; exit/branch on rc (0/7/13).
2. On rc 7 with `--jarvis`, watch `.orchestrator/inbox/` for
   `*-owner-call-instructions.md` (Bash until-loop / Monitor) before retrying.
3. When the owner approves a recurring one-off, graduate it:
   `grant --category <cat> [--pattern "<substr>"] --from <audit-id> --why "<what the owner said>"`.

Bridge failure (script missing/nonzero) is logged in the audit `note` field;
verdict stays `ask`, exit stays 7 — a dead bridge never silently allows.

## Suggested Claude Code PreToolUse hook — NOT applied

Wiring the gate into Claude Code itself was deliberately left un-applied;
merge manually only if the evaluation below earns it:

```json
"PreToolUse": [
  {"hooks": [{"type": "command", "command": "node ~/.claude/orchestrator/approval/approval-gate.mjs check --category exec --desc \"$CLAUDE_TOOL_INPUT\" --source claude-hook --no-ask", "timeout": 5}]}
]
```

Note `--no-ask` here: a non-interactive hook cannot park for the owner, so
ask-eligible verdicts become deny (audit verdict `denied`) rather than
hanging the tool call. Without `--no-ask`, use `--jarvis` + an inbox watch.

## 1-month evaluation checklist

Call site: `bin/glm-code` grades + audits every spoke launch
(`--category spoke_launch`), fail-open. The repo's `glm-code` ships WITHOUT
this block (the Linux port of 2026-10-21 dropped it); to wire it in, paste
this right after the `MODEL=` line:

```bash
GATE="${APPROVAL_GATE:-$HOME/.claude/orchestrator/approval/approval-gate.mjs}"
if [ -r "$GATE" ]; then
  node "$GATE" check --category spoke_launch --desc "glm-code model=$MODEL args=$*" --source glm-code
  rc=$?
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 7 ] && [ "$rc" -ne 13 ]; then
    echo "glm-code: approval-gate FAIL-OPEN (rc=$rc) — proceeding" >&2
  elif [ "$rc" -ne 0 ]; then
    echo "glm-code: blocked by approval-gate (rc=$rc)" >&2
    exit "$rc"
  fi
fi
```

After ~1 month of real audit data,
run `approval-gate list --audit --tail 1000` and decide:

**Keep / expand** if the audit shows:
- (a) ≥1 real `ask` routed through jarvis and answered
- (b) ≥1 one-off graduated via `grant --from <audit-id>` and later
      auto-allowed by the resulting standing rule
- (c) zero fail-open events other than deliberate tests
- (d) spoke-launch audit lines carry usable `desc` strings
      (`model=... args=...`, not empty/garbage)

**Drop** if the log is only default-allow noise, or any fail-open recurs
un-deliberately — a gate that fails open isn't gating anything.

`approval-gate selfcheck` re-verifies the whole matrix hermetically at any
time (temp dirs + jarvis stub only; one tagged sentinel line lands in the
real audit log as a selfcheck datum).
