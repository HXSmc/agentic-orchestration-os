#!/usr/bin/env node
// Stop-event hook: blocks ending the turn while an orchestrator loop is active.
// A loop command creates .orchestrator/state/loop.lock at start and MUST delete
// it on every exit path (success, abort, terminal failure).
import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Spokes (glm-code) share the hub's cwd; the guard is for the hub loop only —
// a blocked spoke would otherwise delete the hub's lock to free itself.
if (process.env.ORCHESTRATOR_SPOKE === "1") process.exit(0);

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
