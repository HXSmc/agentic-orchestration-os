#!/bin/bash
# Install the GLM hub-spoke orchestrator files onto this machine.
# Idempotent; does NOT touch settings.json or the API key (manual steps — see README).
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p ~/.local/bin ~/.claude/orchestrator/hooks ~/.claude/orchestrator/state ~/.claude/commands

install -m 755 bin/glm-code ~/.local/bin/glm-code
install -m 755 bin/glm-vision ~/.local/bin/glm-vision
cp orchestrator/PROTOCOL.md ~/.claude/orchestrator/PROTOCOL.md
cp orchestrator/hooks/loop-guard.mjs ~/.claude/orchestrator/hooks/loop-guard.mjs
install -m 755 orchestrator/state/doctor.sh ~/.claude/orchestrator/state/doctor.sh
cp commands/ultrawork.md commands/ralph.md commands/team.md commands/autopilot.md commands/ultraqa.md ~/.claude/commands/

# Never clobber live quota rules silently — install only if absent.
if [ ! -f ~/.claude/orchestrator/state/quota-rules.sh ]; then
  cp orchestrator/state/quota-rules.sh ~/.claude/orchestrator/state/quota-rules.sh
else
  echo "quota-rules.sh already present — left untouched (diff manually if updating)"
fi

# Slim spoke config dir (see README)
mkdir -p ~/.claude-spoke
cp spoke-config/CLAUDE.md ~/.claude-spoke/CLAUDE.md
cp spoke-config/settings.json ~/.claude-spoke/settings.json
echo "spoke config installed to ~/.claude-spoke"

# GEMINI.md (agy/Antigravity surface) — only if not already present, never
# clobber a user's existing Gemini config.
mkdir -p ~/.gemini
if [ ! -f ~/.gemini/GEMINI.md ]; then
  cp GEMINI.md ~/.gemini/GEMINI.md
  echo "GEMINI.md installed to ~/.gemini/GEMINI.md"
else
  echo "~/.gemini/GEMINI.md already present — left untouched (merge manually if updating)"
fi

echo
echo "Installed. Manual steps remaining (see README):"
echo "  1. Put your GLM API key in ~/.config/zai/api_key (chmod 600)"
echo "  2. Merge the Stop hook into ~/.claude/settings.json (see README)"
echo "  3. Append orchestrator/SPOKE-MODE.md's content as a section of ~/.claude/CLAUDE.md"
echo "  4. Confirm GNU timeout is on PATH"
echo "  5. Run: ~/.claude/orchestrator/state/doctor.sh   (verifies all of the above)"
