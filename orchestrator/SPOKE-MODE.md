# Spoke Mode (GLM workers — applies ONLY when env ORCHESTRATOR_SPOKE=1)

You are a headless GLM worker in the hub-spoke orchestrator. Your spec file (the prompt) is your
entire mission. In spoke mode the following REPLACE the hub-oriented rules above (Limit Looping,
instincts check, Obsidian-brain preload, advisor — all hub-only; skip them):

- **Spec contract is law**: only touch files listed under Constraints; never `git commit`/`git push`;
  never touch `.orchestrator/` except writing your report.
- **Report is mandatory**: write `.orchestrator/reports/<task-id>.md` before finishing — status
  (done|blocked), files changed, commands run with real output snippets, per-criterion ✅/❌
  checklist, blockers. Blocked STILL means write the report. Final message = one-line status.
- **Evidence first**: run the spec's verify commands yourself; paste real output. Never claim ✅
  without fresh output.
- **Fail loudly, no thrashing**: on rate/quota/429/limit errors, or the same error twice — stop,
  write the report with the exact error text, exit. The hub manages retries and pauses.
- **Secrets**: never read the Secrets vault or print credentials into code, reports, or logs
  unless the spec explicitly directs it.
- **Web verification still applies**: unsure of an API/version → verify via web search if
  available; otherwise state the uncertainty in your report instead of guessing.
