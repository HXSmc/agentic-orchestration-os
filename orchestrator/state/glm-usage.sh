#!/bin/bash
# Real GLM quota reading via the official glm-plan-usage plugin script.
# Prints: "GLM 5h token window: N% | weekly: M%" and exits 0.
# Exit 1 = query failed (fall back to the ledger estimate in PROTOCOL.md).
set -u
KEY_FILE="$HOME/.config/zai/api_key"
[ -r "$KEY_FILE" ] || { echo "glm-usage: missing $KEY_FILE" >&2; exit 1; }
SCRIPT=$(ls -d "$HOME"/.claude/plugins/cache/zai-coding-plugins/glm-plan-usage/*/skills/usage-query-skill/scripts/query-usage.mjs 2>/dev/null | tail -1)
[ -n "$SCRIPT" ] || { echo "glm-usage: plugin script not found (reinstall glm-plan-usage plugin)" >&2; exit 1; }
OUT=$(ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic" \
      ANTHROPIC_AUTH_TOKEN="$(cat "$KEY_FILE")" \
      timeout 60 node "$SCRIPT" 2>&1) || { echo "glm-usage: query failed: $(echo "$OUT" | head -2)" >&2; exit 1; }
echo "$OUT" | python3 -c '
import sys, json, re
raw = sys.stdin.read()
m = re.search(r"Quota limit data:\s*\n\s*(\{.*\})", raw)
if not m:
    sys.stderr.write("glm-usage: could not parse quota block\n"); sys.exit(1)
limits = json.loads(m.group(1)).get("limits", [])
pcts = [l.get("percentage", 0) for l in limits if "Token usage" in l.get("type", "")]
five_h = max(pcts) if pcts else -1          # entries are unlabeled beyond type; max = binding window
weekly = min(pcts) if len(pcts) > 1 else -1
print(f"GLM 5h token window: {five_h}% | weekly: {weekly}%")
' || exit 1
