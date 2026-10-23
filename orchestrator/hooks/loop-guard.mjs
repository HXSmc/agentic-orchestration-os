#!/usr/bin/env node
// Stop-event hook: blocks ending the turn while THIS SESSION's orchestrator
// loop is active. A loop command creates .orchestrator/state/loop.lock at start
// and MUST delete it on every exit path (success, abort, terminal failure).
import { existsSync, statSync, readFileSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

// Spokes (glm-code) share the hub's cwd; the guard is for the hub loop only —
// a blocked spoke would otherwise delete the hub's lock to free itself.
if (process.env.ORCHESTRATOR_SPOKE === "1") process.exit(0);

// --- Session scoping (2026-09-04, Step 4) ---
// loop.lock used to be pure file-existence with NO session scoping, so ANY
// Claude Code session whose cwd was this repo got blocked by ANY active loop,
// including one owned by a totally different concurrent session (hit live
// 2026-07-24 and again 2026-08-24: two sessions in one repo, one running
// /autopilot, both blocked identically).
//
// The lock now carries its owner. The loop COMMANDS can't write it themselves —
// they only know their session id from inside the model turn, and the id is not
// exposed to them as an env var — so ownership is established by ADOPTION: the
// first Stop this guard blocks for an ownerless lock stamps that session's id
// into the file, and every later Stop from a different session passes straight
// through. In practice the adopting session is the one running the loop, since
// it is the one hitting Stop events while its own lock is fresh.
//
// (The previous `loop-guard-exempt.json` opt-out list is GONE. It keyed off
// process.env.CLAUDE_CODE_SESSION_ID, which Claude Code never sets for hook
// processes — session_id arrives on stdin — so it could never match, no command
// ever wrote the file, and no such file existed anywhere on disk. Dead twice
// over; scoping replaces the need for it.)

/** session_id from the Stop hook's stdin payload, or undefined if unreadable. */
function readSessionId() {
  try {
    const raw = readFileSync(0, "utf8");
    const id = JSON.parse(raw)?.session_id;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

const lock = join(process.cwd(), ".orchestrator", "state", "loop.lock");
if (!existsSync(lock)) process.exit(0);

const ageH = (Date.now() - statSync(lock).mtimeMs) / 3.6e6;
if (ageH > 24) {
  console.error(`loop-guard: stale loop.lock (${ageH.toFixed(1)}h old) — allowing stop; delete it if the loop is truly dead.`);
  process.exit(0);
}

// Lock body is either legacy plain text (just the mode, e.g. "autopilot") or
// the owned form {"mode":"autopilot","sessionId":"…"}. Both are read; only the
// owned form is ever written.
const body = readFileSync(lock, "utf8").trim();
let mode = body || "unknown";
let owner;
if (body.startsWith("{")) {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.mode === "string" && parsed.mode) mode = parsed.mode;
    if (typeof parsed?.sessionId === "string" && parsed.sessionId) owner = parsed.sessionId;
  } catch {
    // A hand-mangled lock falls back to blocking with mode "unknown" rather
    // than silently disarming the guard.
  }
}

const me = readSessionId();

// Someone else's loop — not this session's problem.
if (owner && me && owner !== me) process.exit(0);

// Fallback: stamp hook missed. Normally `loop-owner-stamp.mjs` (a PostToolUse
// hook on Bash) already stamps the lock with its owning session_id the
// instant the loop command's Bash call writes loop.lock, so ownership is
// established long before any Stop event — this adoption path only fires
// when that hook missed the write (e.g. loop.lock was written via a
// non-Bash tool, or the stamp hook errored). Ownerless lock + a known
// session id → adopt it, then block as normal. Preserve the original mtime:
// rewriting the file would otherwise reset the 24h stale check above, so a
// lock adopted at hour 23 would get a fresh 24h.
if (!owner && me) {
  try {
    const { atimeMs, mtimeMs } = statSync(lock);
    writeFileSync(lock, JSON.stringify({ mode, sessionId: me }));
    utimesSync(lock, atimeMs / 1000, mtimeMs / 1000);
  } catch {
    // Adoption is best-effort; failing to stamp must not disarm the guard.
  }
}

// Everything else blocks — including the case where session_id was missing or
// unparseable. Failing OPEN there would disable the guard for every loop in
// every repo, which is far worse than the multi-session annoyance being fixed.
console.error(
  `loop-guard: ${mode} loop is ACTIVE. Do not stop. Continue the loop: pick the next ` +
  `incomplete story/cycle, or run the loop's abort path (which deletes .orchestrator/state/loop.lock) ` +
  `and produce the honest final report first.`
);
process.exit(2);
