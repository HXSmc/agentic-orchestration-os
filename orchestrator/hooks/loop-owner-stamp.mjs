#!/usr/bin/env node
// PostToolUse (Bash) hook: stamps the owning session_id into loop.lock at the
// moment a loop command (/autopilot, /ralph, /team, /ultrawork, /ultraqa)
// writes it, using session_id from THIS hook's own stdin payload — the same
// session that just ran the Bash call which wrote the lock. This makes
// loop-guard.mjs's Stop-time "first Stop wins" adoption a FALLBACK only, for
// cases where this hook misses the write (loop.lock written via a non-Bash
// tool, or this hook erroring) — see PROTOCOL.md's loop.lock section.
//
// Fires after every Bash tool call. Cheap no-op unless the command mentions
// loop.lock. Never blocks the turn (exit 0 always) and never prints unless
// DEBUG=1 — PostToolUse output isn't meant to interrupt anything.
import { existsSync, statSync, readFileSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

const DEBUG = !!process.env.DEBUG;
function log(...args) {
  if (DEBUG) console.error("loop-owner-stamp:", ...args);
}

function main() {
  // Spokes (glm-code) share the hub's cwd; this hook is for the hub loop
  // only — same reasoning as loop-guard.mjs's spoke bypass. A blocked spoke
  // must never get to claim ownership of the hub's lock.
  if (process.env.ORCHESTRATOR_SPOKE === "1") {
    log("spoke, skipping");
    return;
  }

  const raw = readFileSync(0, "utf8");
  const payload = JSON.parse(raw);
  const command = payload?.tool_input?.command;
  const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const sessionId = payload?.session_id;

  if (typeof command !== "string" || !command.includes("loop.lock")) {
    log("Bash command doesn't mention loop.lock, skipping");
    return;
  }
  if (typeof sessionId !== "string" || !sessionId) {
    log("no session_id on hook payload, skipping");
    return;
  }

  const lock = join(cwd, ".orchestrator", "state", "loop.lock");
  if (!existsSync(lock)) {
    log("no loop.lock at", lock, "- command may have deleted it, skipping");
    return;
  }

  const stat = statSync(lock);
  const ageMs = Date.now() - stat.mtimeMs;
  const justWritten = ageMs >= 0 && ageMs < 5000;

  // Lock body is either legacy plain text (just the mode, e.g. "autopilot")
  // or the owned form {"mode":"autopilot","sessionId":"…"} — same two forms
  // loop-guard.mjs reads.
  const body = readFileSync(lock, "utf8").trim();
  let mode = body || "unknown";
  let owner;
  let rest = {};
  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.mode === "string" && parsed.mode) mode = parsed.mode;
      if (typeof parsed?.sessionId === "string" && parsed.sessionId) owner = parsed.sessionId;
      rest = { ...parsed };
      delete rest.mode;
      delete rest.sessionId;
    } catch {
      log("lock body is malformed JSON, treating as unowned plain mode");
    }
  }

  // Never clobber an established owner unless this exact Bash call is what
  // just wrote the file (mtime < 5s) — in that case whatever is on disk now
  // is this command's own output, so stamping this session's id is correct
  // even if the content happens to already look owned.
  if (owner && !justWritten) {
    log(`already owned by ${owner} and not freshly written, leaving untouched`);
    return;
  }

  const { atimeMs, mtimeMs } = stat;
  writeFileSync(lock, JSON.stringify({ mode, sessionId, ...rest }));
  // Preserve the original mtime: rewriting the file would otherwise reset
  // the 24h stale-lock check in loop-guard.mjs, same reasoning as its own
  // adoption path.
  utimesSync(lock, atimeMs / 1000, mtimeMs / 1000);
  log(`stamped sessionId=${sessionId} mode=${mode}`);
}

try {
  main();
} catch (err) {
  log("error (non-fatal):", err?.message || err);
}
process.exit(0);
