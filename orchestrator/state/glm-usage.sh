#!/bin/bash
# Real GLM quota reading via the official glm-plan-usage plugin script.
#
# CORRECTED 2026-07-14 (verified against the real z.ai dashboard by the user):
# the raw "Quota limit data" block returns TWO entries, BOTH mislabeled by
# Z.ai's own API as type "Token usage(5 Hour)" - one is genuinely the 5-hour
# quota, the other is genuinely the WEEKLY quota (the API's "type" string is
# just wrong/generic for the second one; it is NOT actually a second 5h
# bucket, and it is NOT per-model as an earlier version of this comment
# speculated). Ground truth from the dashboard (2026-07-14): 5h=6%, weekly=75%,
# and the array order at that same moment was [6%, 75%] - i.e. the array's
# FIRST entry is the 5-hour quota and the SECOND is the weekly quota. This
# script now trusts POSITION (first=5h, second=weekly), which held true
# across two independent captures. This is still a reverse-engineered
# assumption (no official schema exists - see /research note
# Brain/Research/track-zai-glm-coding-plan-usage-quota.md) - if Z.ai ever
# reorders the array this breaks silently, so treat a sudden implausible
# jump (e.g. 5h reading suddenly >> weekly) as a signal to re-verify against
# the dashboard rather than trusting it blindly.
#
# Prints: "GLM 5h: N% | weekly: M%" and exits 0. Gating (HARD_STOP etc in
# quota-rules.sh) should key off the 5h figure, not weekly - weekly only
# resets over days and isn't the thing that blocks firing a spoke right now.
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
token_buckets = [l.get("percentage", 0) for l in limits if "Token usage" in l.get("type", "")]
if not token_buckets:
    sys.stderr.write("glm-usage: no Token usage buckets in response\n"); sys.exit(1)
if len(token_buckets) == 1:
    # Only one bucket returned - report it as 5h, weekly unknown rather than guessing.
    print(f"GLM 5h: {token_buckets[0]}% | weekly: unknown (only 1 bucket returned)")
else:
    five_h, weekly = token_buckets[0], token_buckets[1]
    print(f"GLM 5h: {five_h}% | weekly: {weekly}%")
' || exit 1
