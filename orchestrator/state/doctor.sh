#!/bin/bash
# Orchestrator preflight — one command, all checks. Run once per session
# before firing the first spoke (replaces the old raw grep block in
# PROTOCOL.md's "Harness preflight" section — inspired by
# github.com/Kastarter/my-insane-claude-workflow's `doctor` command).
# Exit 0 = all checks passed. Exit 1 = at least one FAILED (see output).
set -u
FAIL=0

check() { # check <name> <cmd...>
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "OK   $name"
  else
    echo "FAIL $name"
    FAIL=1
  fi
}

# --- Claude Code CLI flags the hub/spokes depend on ---
if claude --help 2>&1 | grep -q -- '--dangerously-skip-permissions' \
  && claude --help 2>&1 | grep -q -- '--permission-mode' \
  && claude --help 2>&1 | grep -q -- '-p'; then
  echo "OK   claude CLI flags (--dangerously-skip-permissions, --permission-mode, -p)"
else
  echo "FAIL claude CLI flags — check \`claude --help\` / release notes, update PROTOCOL.md + launcher"
  FAIL=1
fi

# --- GLM spoke binary + auth ---
check "glm-code on PATH" command -v glm-code
check "GLM API key present (~/.config/zai/api_key)" test -r "$HOME/.config/zai/api_key"

# --- agy (Antigravity) binary — OPTIONAL: only used by /research and /team
# agy workers; spokes and the core loop run fine without it. Warn, don't fail.
if command -v agy >/dev/null 2>&1; then
  echo "OK   agy on PATH"
else
  echo "WARN agy on PATH — optional, only needed for /research and /team agy workers"
fi

# --- GLM quota reading (real, token-based truth) ---
if OUT=$(bash "$HOME/.claude/orchestrator/state/glm-usage.sh" 2>&1); then
  echo "OK   glm-usage.sh: $OUT"
else
  echo "FAIL glm-usage.sh: $OUT"
  FAIL=1
fi

# --- quota-rules.sh expiry ---
# shellcheck source=/dev/null
source "$HOME/.claude/orchestrator/state/quota-rules.sh"
if [ "$(date +%Y%m%d)" -gt "$(echo "$VERIFIED_UNTIL" | tr -d -)" ]; then
  echo "FAIL quota-rules.sh EXPIRED ($VERIFIED_UNTIL) — /research current GLM plan pricing/multipliers, update quota-rules.sh, bump VERIFIED_UNTIL"
  FAIL=1
else
  echo "OK   quota-rules.sh valid until $VERIFIED_UNTIL"
fi

# --- state dir hygiene ---
# quota.log itself may not exist yet (created by `>>` on the first spoke fire) —
# check the directory is writable, not the file, or a fresh install fails here.
check "orchestrator state dir writable" test -w "$HOME/.claude/orchestrator/state"

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "preflight OK — clear to fire spokes"
  exit 0
else
  echo "PREFLIGHT FAILED — do not fire spokes until resolved"
  exit 1
fi
