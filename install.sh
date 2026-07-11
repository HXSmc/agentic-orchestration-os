#!/bin/bash
# Install the GLM hub-spoke orchestrator files onto this machine.
# Idempotent; does NOT touch settings.json or the API key (manual steps — see README).
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p ~/.local/bin ~/.claude/orchestrator/hooks ~/.claude/orchestrator/state ~/.claude/commands

install -m 755 bin/glm-code ~/.local/bin/glm-code
cp orchestrator/PROTOCOL.md ~/.claude/orchestrator/PROTOCOL.md
cp orchestrator/hooks/loop-guard.mjs ~/.claude/orchestrator/hooks/loop-guard.mjs
cp commands/ultrawork.md commands/ralph.md commands/team.md commands/autopilot.md commands/ultraqa.md ~/.claude/commands/

# Never clobber live quota rules silently — install only if absent.
if [ ! -f ~/.claude/orchestrator/state/quota-rules.sh ]; then
  cp orchestrator/state/quota-rules.sh ~/.claude/orchestrator/state/quota-rules.sh
else
  echo "quota-rules.sh already present — left untouched (diff manually if updating)"
fi

echo "Installed. Manual steps remaining (see README): api_key, settings.json Stop hook, GNU timeout."

# Slim spoke config dir (see README)
mkdir -p ~/.claude-spoke
cp spoke-config/CLAUDE.md ~/.claude-spoke/CLAUDE.md
cp spoke-config/settings.json ~/.claude-spoke/settings.json
echo "spoke config installed to ~/.claude-spoke"
