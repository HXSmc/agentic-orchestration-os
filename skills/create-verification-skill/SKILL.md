---
name: create-verification-skill
description: "Generate a project-local verification skill that drives your app the way a user does — any language, framework, or platform. Use for /create-verification-skill, \"make a control skill for this repo\", or when a project has no scripted way to prove UI/CLI/service behavior."
disable-model-invocation: true
---
<!-- vendored from github.com/cursor/plugins @ ccb5507cec1546dc88135c1139c811e6c59115ba (MIT), 2026-10-09 -->

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behavior: launch it, exercise a feature the way a user would, and capture evidence. This skill generates that as a project-local skill (`.cursor/skills/verify-<app>/`) tailored to the repo. You write the generator's output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has never seen the app.

## 1. Interview the repo, not the user

Answer these from the codebase and only ask the user what you cannot observe:

- **Surface:** what does a user actually touch? A web UI, a CLI/TUI, a desktop app, an API, a mobile app, a library? A repo can have several; pick the primary one and note the rest.
- **Run:** how does the app start locally? Prefer the repo's own documented dev command (package scripts, Makefile, README quickstart). Note ports, env vars, seed data, auth.
- **Drive:** how can an agent interact with it programmatically? Existing harnesses first — Playwright/Cypress specs, expect scripts, PTY helpers, curl-able endpoints, a debug port. Only then pick a generic recipe: browser/CDP for web and Electron, a tmux/PTY harness for CLI/TUI, plain HTTP for services.
- **Observe:** what evidence can be captured? Screenshots, terminal transcripts, response bodies, logs, exit codes, DB state.
- **Isolate:** can two instances run side by side (ports, data dirs, profiles)? If not, say so in the generated skill: refusing to double-drive a shared instance beats corrupting the user's session.

If the checkout doesn't build or start as-is, fix that first (or report it precisely) before generating; a skill written against a broken base teaches wrong steps. When an irrelevant missing asset blocks startup (a static dir the API never serves, a sample config), the generated skill may create it, clearly marked as verification scaffolding, and remove it in cleanup.

## 2. Generate the skill

Write `.cursor/skills/verify-<app>/SKILL.md` with YAML frontmatter (`name: verify-<app>` and a `description` that names the app, the surface, and when to reach for it — without frontmatter the skill never registers) and these sections, each grounded in what the interview actually found (no placeholders left):

- **Launch:** the exact command that starts the app for verification, and how to tell it's ready (a log line, a port answering, a prompt). Include teardown. For a short-lived CLI or TUI there is no server to keep alive: launch means build the binary (or install deps) once, then start each drive in its own isolated PTY or tmux session.
- **Doctor:** one read-only check that answers "is this instance worth driving?" — process up, right version/build, port owned by us, auth valid. An agent runs this first whenever anything looks off.
- **Drive:** the harness recipe with real selectors/commands from this repo, not examples. Prefer stable handles (ARIA labels, data attributes, prompt strings, route paths) over coordinates and tab order.
- **Evidence:** what to capture for a proof and where it goes. State the proof standards: exercise the real user path, not internal setters or test-only endpoints; capture the action and the resulting state, not just the final screen; verify side effects (files written, rows inserted, messages sent) alongside what's visible; mocks only where a production boundary already isolates the external system. When the safe path is a dry-run or test mode, verify what it actually skips by observing (files, network, git refs) rather than trusting its name: some dry-runs still touch the network or open a browser.
- **Cleanup:** how to tear down instances the run created. Never kill by process name; kill what you started. Cleanup removes instances and scratch state, never the evidence: proof artifacts survive the teardown, in a location the skill names.
- **Helpers:** any script the skill ships is executable and its invocation is shown in the skill body. A helper the reader has to reverse-engineer is not a helper.

## 3. Seed the feature map

Create `.cursor/skills/verify-<app>/features/README.md` plus one file per user-facing feature you can identify (aim for the top 3-5 to start, from routes, commands, menus, or docs). Follow the shape in [`references/feature-map-example/`](references/feature-map-example/), with a README index and one file per feature. Each file answers, from the user's point of view: what the feature is, how to reach it, how to drive it with the harness, and what observable end state proves it works. The four H2s are `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`. The map is the repo's maintained verification source; a proof that drives one convenient entry point is incomplete when the map lists others.

## 4. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, doctor, drive ONE mapped feature (one is enough; the map exists so later runs can cover the rest), capture evidence, clean up. After cleanup, confirm the evidence still exists at the named location — a cleanup that eats the proof fails this step. Fix what fails, and run the generated cleanup after every failed iteration too, so broken attempts don't strand processes and ports. A generated skill that was never executed is a draft, not a deliverable.

## 5. Offer the maintenance loop

Point the user at `/maintain-verification-skill` for keeping the map honest as the app changes. Suggest a cadence only if they ask.

## Local adaptations (this machine)
These override the upstream text above where they conflict.
1. Output dir: `.claude/skills/verify-<app>/` (never `.cursor/`).
2. The generated skill MUST be committed to the repo. Spoke worktrees branch from HEAD and only carry untracked `.env*`, so an uncommitted skill is invisible to every later spoke.
3. "Ship": one commit on branch `verify-maint/<YYYY-MM-DD>`. No PR, unless the PR-producing flow in PROTOCOL.md "Evidence → PR" applies. If the upstream text says to use parallel subagents and you have no Agent tool, run those passes serially yourself.
4. Memory guard: before Launch, run `memory_pressure | grep 'free percentage'`. Below 25% free: skip the live drive and report `blocked: memory`. A hub session that drives a browser arms the Monitor tool on `~/.claude/scripts/health-watch.sh` first.
5. Drive mechanism: GLM spokes have no chrome-devtools MCP. Web apps use headless Playwright: ONE chromium, `--workers=1`, from the pinned tool install at `~/.local/share/pw-tool` (run `~/.local/share/pw-tool/node_modules/.bin/playwright`, never a bare `npx playwright` that resolves a different version). Never `npm install` inside a spoke worktree (its node_modules is symlinked to the main checkout). If the Playwright tool dir is missing, fall back to a Claude subagent with chrome-devtools MCP. Never run both browsers at once.
6. Local runs must never report to production error tracking: start the app with `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=` set empty. Build a minimal non-prod env from `.env.example` plus dev-only dummy values; never copy a real `app/.env.local` into a worktree. If the app will not boot without a prod-only key, report `blocked` and name the key.
7. Evidence goes to `.orchestrator/evidence/<task-id>/` (screenshots, curl output, logs). Cleanup = kill the dev server and browser by PID, then confirm the port is free (`lsof -i :<port>` empty).
8. Real-data rule: Reproduce from the error event (stack, tags, breadcrumbs) + repo seed/fixture data. Never query, copy, or export production rows; never put prod DB/Redis/Supabase creds into a spoke worktree. Taweed and Nuqra are excluded from automated repro (health/payments PII); their issues are reported to the owner only.
