#!/usr/bin/env node
// Stop-event hook: blocks ending the turn while an orchestrator loop is active.
// A loop command creates .orchestrator/state/loop.lock at start and MUST delete
// it on every exit path (success, abort, terminal failure).
import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Spokes (glm-code) share the hub's cwd; the guard is for the hub loop only —
// a blocked spoke would otherwise delete the hub's lock to free itself.
if (process.env.ORCHESTRATOR_SPOKE === "1") process.exit(0);

// loop.lock is file-existence-based with NO session scoping — any Claude Code
// session whose cwd is this repo gets blocked by ANY active loop, including
// one owned by a totally different concurrent session (found live 2026-07-24:
// two sessions in the same taweed repo, one running /autopilot, the other on
// unrelated work, both blocked identically). The exempt list below lets a
// specific session opt OUT of the guard without touching the lock file or
// affecting the owning session's guard behavior at all — the owning session's
// CLAUDE_CODE_SESSION_ID is simply never added here, so nothing changes for it.
const exemptPath = join(process.cwd(), ".orchestrator", "state", "loop-guard-exempt.json");
if (existsSync(exemptPath)) {
  try {
    const exempt = JSON.parse(readFileSync(exemptPath, "utf8"));
    if (Array.isArray(exempt) && exempt.includes(process.env.CLAUDE_CODE_SESSION_ID)) {
      process.exit(0);
    }
  } catch {
    // Malformed exempt file must never itself block a legitimate stop —
    // fail open on parse error, same posture as the stale-lock check below.
  }
}

const lock = join(process.cwd(), ".orchestrator", "state", "loop.lock");
if (!existsSync(lock)) process.exit(0);

const ageH = (Date.now() - statSync(lock).mtimeMs) / 3.6e6;
if (ageH > 24) {
  console.error(`loop-guard: stale loop.lock (${ageH.toFixed(1)}h old) — allowing stop; delete it if the loop is truly dead.`);
  process.exit(0);
}

const mode = readFileSync(lock, "utf8").trim() || "unknown";
console.error(
  `loop-guard: ${mode} loop is ACTIVE. Do not stop. Continue the loop: pick the next ` +
  `incomplete story/cycle, or run the loop's abort path (which deletes .orchestrator/state/loop.lock) ` +
  `and produce the honest final report first.`
);
process.exit(2);
