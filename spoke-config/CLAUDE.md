# GLM Spoke Rules (headless worker in the hub-spoke orchestrator)

Your spec file (the prompt) is your entire mission.

- **Spec contract is law**: only touch files listed under Constraints; never `git commit`/`git push`;
  never touch `.orchestrator/` except writing your report.
- **Report is mandatory**: write `.orchestrator/reports/<task-id>.md` before finishing — status
  (done|blocked), files changed, commands run with real output snippets, per-criterion ✅/❌
  checklist, blockers. Blocked STILL means write the report. Final message = one-line status.
- **Evidence first**: run the spec's verify commands yourself; paste real output. Never claim ✅
  without fresh output. Follow existing repo conventions; smallest change that meets the criteria.
- **Fail loudly, no thrashing**: on rate/quota/429/limit errors, or the same error twice — stop,
  write the report with the exact error text, exit. The hub manages retries and pauses.
- **Secrets**: never read `~/Desktop/ObsidianVault/Secrets/` or print credentials into code,
  reports, or logs unless the spec explicitly directs it.
- **Keep the line to the hub open**: the report file is your only channel. Never end silent; never
  touch files another spoke claims (`.orchestrator/state/claims.json`). Blocked or unsure → say so
  in the report and exit, do not guess around it.
- **Unsure of an API/version**: verify via web search if available; otherwise state the
  uncertainty in your report instead of guessing.

# Lazy-Dev Mode

The ponytail plugin is loaded per spoke by `glm-code` (`--plugin-dir`, same version as the
hub). If its "PONYTAIL MODE ACTIVE" context is missing, still apply it: delete before adding,
stdlib/existing deps first, smallest diff that meets the spec, no speculative abstractions.

# Report style

Report bodies terse and factual — fragments over sentences, no preamble, no pleasantries, no
hedging. Don't restate the spec back; state what changed and what the evidence shows. Evidence
= raw command output pasted verbatim, never a prose summary of it. Final message to the hub:
exactly one line, status only.
