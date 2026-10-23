#!/bin/bash
# Install the GLM hub-spoke orchestrator files onto this machine (macOS, Linux, Windows Git Bash).
# Idempotent; does NOT touch settings.json or the API key (manual steps — see README).
# Orchestrator core files are overwritten (they are this repo's to own). Files you may have
# customised (quota rules, GEMINI.md, Claude agents, skills) are only installed when absent.
set -euo pipefail
cd "$(dirname "$0")"

O=~/.claude/orchestrator
mkdir -p ~/.local/bin "$O/hooks" "$O/state" "$O/agents" "$O/templates" \
  ~/.claude/commands ~/.claude/agents/refs ~/.claude/skills

# --- launchers on PATH
for f in glm-code glm-vision spoke-wt; do
  install -m 755 "bin/$f" ~/.local/bin/"$f"
done

# --- orchestrator core
cp orchestrator/PROTOCOL.md "$O/PROTOCOL.md"
cp orchestrator/claims.py orchestrator/claims_test.py "$O/"
cp orchestrator/hooks/loop-guard.mjs orchestrator/hooks/loop-owner-stamp.mjs "$O/hooks/"
install -m 755 orchestrator/state/doctor.sh "$O/state/doctor.sh"
install -m 755 orchestrator/state/glm-usage.sh "$O/state/glm-usage.sh"
cp orchestrator/state/query-usage.mjs "$O/state/query-usage.mjs"
cp -R orchestrator/agents/. "$O/agents/"
cp templates/*.md "$O/templates/"
touch "$O/state/DECISIONS.md"

# --- hub commands
cp commands/*.md ~/.claude/commands/

# Never clobber live quota rules silently — install only if absent.
if [ ! -f "$O/state/quota-rules.sh" ]; then
  cp orchestrator/state/quota-rules.sh "$O/state/quota-rules.sh"
else
  echo "quota-rules.sh already present — left untouched (diff manually if updating)"
fi

# --- Claude Code subagents + vendored skills: install only the ones you don't already have
for f in claude-agents/*.md; do
  dst=~/.claude/agents/"$(basename "$f")"
  [ -e "$dst" ] && echo "agent $(basename "$f") already present — left untouched" || cp "$f" "$dst"
done
cp -n claude-agents/refs/*.md ~/.claude/agents/refs/ 2>/dev/null || true
for d in skills/*/; do
  name="$(basename "$d")"
  [ -e ~/.claude/skills/"$name" ] && echo "skill $name already present — left untouched" || cp -R "$d" ~/.claude/skills/"$name"
done

# --- slim spoke config dir (see README)
mkdir -p ~/.claude-spoke
cp spoke-config/CLAUDE.md ~/.claude-spoke/CLAUDE.md
cp spoke-config/settings.json ~/.claude-spoke/settings.json
echo "spoke config installed to ~/.claude-spoke"

# --- GEMINI.md (agy/Antigravity surface) — never clobber an existing Gemini config.
mkdir -p ~/.gemini
if [ ! -f ~/.gemini/GEMINI.md ]; then
  cp GEMINI.md ~/.gemini/GEMINI.md
  echo "GEMINI.md installed to ~/.gemini/GEMINI.md"
else
  echo "~/.gemini/GEMINI.md already present — left untouched (merge manually if updating)"
fi

echo
echo "Installed. Manual steps remaining (see README → Install):"
echo "  1. Put your Z.ai API key in ~/.config/glm/api_key (one line, chmod 600)"
echo "  2. Merge the Stop + PostToolUse hooks into ~/.claude/settings.json"
echo "  3. Append orchestrator/SPOKE-MODE.md and rules/SESSION-CONTACT.md to ~/.claude/CLAUDE.md"
echo "  4. Confirm GNU timeout and python3 are on PATH"
echo "  5. Run: ~/.claude/orchestrator/state/doctor.sh   then   glm-code --selfcheck"
