#!/usr/bin/env node
// approval-gate — approval-ladder governance gate (standalone port of
// OpenWorker's pattern): hard floors no mode can lower; one-off approval →
// standing rule → allowlist graduation, each step explicit and revocable;
// append-only audit trail with approval provenance.
//
// FAIL OPEN on any problem with its OWN files (missing state dir, corrupt
// rules line, audit append failure) → verdict=allow, exit 0, stderr warning.
// The gate must never brick a running loop. See orchestrator/docs/approval-gate.md.
//
// State (runtime data, NOT this repo): $APPROVAL_GATE_STATE_DIR or
// ~/.claude/orchestrator/state/approval/ —
//   rules.jsonl  standing rules, one human-editable JSON object per line
//   audit.ndjson append-only, one JSON object per check/grant/revoke
//
// Subcommands: check | grant | revoke | list | selfcheck.
// Exit codes: allow=0 ask=7 deny=13 usage/other errors=1.
import { spawnSync } from "node:child_process";
import {
  appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync,
  readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// --- classifier (pure, deterministic, no LLM) ---
// Closed sets, constants at top per repo convention (quota-rules.sh style).
const HARD_FLOOR_CATS = new Set([
  "force_push", "rm_rf_outside_repo", "prod_deploy",
  "payment_write", "credential_write", "mass_messaging",
]);
// Desc regex fallback: these force hard_floor regardless of category.
const FLOOR_DESC_RES = [/git push.*--force/, /rm -rf/];
const EXTERNAL_CATS = new Set(["send_message", "email", "deploy_nonprod", "outbound_http_write", "phone_call"]);
const EXEC_CATS = new Set(["exec", "shell", "spoke_launch"]);
const WRITE_LOCAL_CATS = new Set(["write_file", "edit_file", "delete_file"]);
const READ_CATS = new Set(["read", "list", "status", "query"]);

function classify(category, desc = "") {
  if (HARD_FLOOR_CATS.has(category)) return "hard_floor";
  if (FLOOR_DESC_RES.some((re) => re.test(desc))) return "hard_floor";
  if (EXTERNAL_CATS.has(category)) return "external";
  if (EXEC_CATS.has(category)) return "exec";
  if (WRITE_LOCAL_CATS.has(category)) return "write_local";
  if (READ_CATS.has(category)) return "read";
  return "external"; // unrecognized category → conservative default
}

// Default verdicts when no standing rule matches — "starts gated" for
// hard_floor/external, but exec and below default-allow so the evaluation
// month cannot brick loops. A standing rule may auto-allow external and
// below; never hard_floor (grant rejects those outright).
const DEFAULT_VERDICT = { hard_floor: "ask", external: "ask", exec: "allow", write_local: "allow", read: "allow" };
const AUDIT_VERDICT = { allow: "auto", ask: "ask", deny: "denied" };

const stateDir = () =>
  process.env.APPROVAL_GATE_STATE_DIR ||
  join(process.env.HOME || "", ".claude", "orchestrator", "state", "approval");

const defaultJarvisCmd = () =>
  process.env.APPROVAL_GATE_JARVIS_CMD ||
  join(process.env.HOME || "", "Desktop", "personal", "jarvis-phone", "scripts", "request_call.sh");

const newId = (prefix) => prefix + "-" + randomBytes(4).toString("hex");

// Corrupt line → throw → caller fail-opens (skip + warn, never fatal to the loop).
function loadRules(dir) {
  const p = join(dir, "rules.jsonl");
  if (!existsSync(p)) return [];
  const rules = [];
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      rules.push(JSON.parse(line));
    } catch {
      throw new Error(`corrupt rules.jsonl line ${i + 1} — fail-open`);
    }
  }
  return rules;
}

function appendAudit(dir, entry) {
  appendFileSync(join(dir, "audit.ndjson"), JSON.stringify(entry) + "\n");
}

// --- core operations (pure-ish; CLI and selfcheck both call these) ---
function runCheck(dir, o) {
  const tier = classify(o.category, o.desc);
  const out = { verdict: null, tier, rule: null, auditId: newId("a"), failOpen: null, parkedLine: null, bridgeNote: "" };
  let rules = [];
  try {
    if (!existsSync(dir)) throw new Error(`state dir missing: ${dir}`);
    rules = loadRules(dir);
  } catch (e) {
    out.failOpen = e.message;
  }
  if (out.failOpen) {
    // Fail-open allows everything EXCEPT hard_floor — hard_floor actions stay ask
    out.verdict = tier === "hard_floor" ? "ask" : "allow";
  } else {
    // Nothing can auto-allow a hard_floor action — rule matching is skipped
    // entirely for that tier (grant already refuses to create such rules).
    if (tier !== "hard_floor") {
      const m = rules.find(
        (r) => r.category === o.category && (!r.pattern || (o.desc || "").includes(r.pattern))
      );
      out.rule = m ? m.id : null;
    }
    out.verdict = out.rule ? "allow" : DEFAULT_VERDICT[tier];
    if (out.verdict === "ask" && o.noAsk) out.verdict = "deny";
  }
  // Jarvis bridge: only on an ask verdict, only with --jarvis. The gate does
  // NOT wait/poll — the calling loop watches .orchestrator/inbox/ (park
  // pattern). Bridge failure is logged in the audit note; verdict stays ask.
  if (o.jarvis && out.verdict === "ask" && !out.failOpen) {
    const cmd = o.jarvisCmdOverride || defaultJarvisCmd();
    const msg = `approval-gate ${out.auditId}: ${o.category} — ${o.desc}`;
    const r = spawnSync(cmd, [msg], { stdio: "ignore" });
    if (r.error || r.status !== 0) {
      out.bridgeNote = `jarvis bridge failed: ${r.error ? r.error.message : "exit " + r.status}`;
    } else {
      out.bridgeNote = "jarvis bridge queued";
      out.parkedLine =
        `ask: parked for owner — watch ${process.cwd()}/.orchestrator/inbox/ for *-owner-call-instructions.md`;
    }
  }
  // Audit ALWAYS (including fail-open — best effort; if even this fails,
  // stderr only, per the fail-open contract).
  try {
    appendAudit(dir, {
      ts: new Date().toISOString(),
      id: out.auditId,
      category: o.category,
      desc: o.desc,
      tier,
      verdict: AUDIT_VERDICT[out.verdict],
      matched_rule: out.rule,
      source: o.source || "unknown",
      note: out.failOpen ? `FAIL-OPEN ${out.failOpen}` : out.bridgeNote,
    });
  } catch (e) {
    if (!out.failOpen) {
      out.failOpen = `audit append failed: ${e.message}`;
      out.verdict = tier === "hard_floor" ? "ask" : "allow";
      out.rule = null;
    }
  }
  return out;
}

function runGrant(dir, o) {
  // Test the pattern too: a pattern the desc-regex fallback would floor is
  // just as un-grantable as a hard_floor category.
  const tier = classify(o.category, o.pattern || "");
  if (tier === "hard_floor") throw new Error("hard-floor actions can never be auto-allowed");
  mkdirSync(dir, { recursive: true });
  const rule = {
    id: newId("r"),
    category: o.category,
    pattern: o.pattern || "",
    granted_by: o.source || "unknown",
    granted_at: new Date().toISOString(),
    why: o.why || "",
    from_audit: o.from || "",
  };
  appendFileSync(join(dir, "rules.jsonl"), JSON.stringify(rule) + "\n");
  appendAudit(dir, {
    ts: rule.granted_at,
    id: newId("a"),
    category: o.category,
    desc: `grant pattern="${rule.pattern}"`,
    tier,
    verdict: "user",
    matched_rule: rule.id,
    source: o.source || "unknown",
    note: o.why || "",
  });
  return rule;
}

function runRevoke(dir, ruleId) {
  const rules = loadRules(dir);
  const revoked = rules.find((r) => r.id === ruleId);
  if (!revoked) throw new Error(`unknown rule id: ${ruleId}`);
  const keep = rules.filter((r) => r.id !== ruleId);
  writeFileSync(
    join(dir, "rules.jsonl"),
    keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : "")
  );
  appendAudit(dir, {
    ts: new Date().toISOString(),
    id: newId("a"),
    category: revoked.category,
    desc: `revoke pattern="${revoked.pattern || ""}"`,
    tier: classify(revoked.category, revoked.pattern || ""),
    verdict: "user",
    matched_rule: ruleId,
    source: revoked.granted_by,
    note: revoked.why || "",
  });
  return revoked;
}

// --- CLI ---
function usage() {
  console.error(
    `usage: approval-gate <subcommand> [options]
  check  --category <cat> --desc "<description>" [--source <caller>] [--jarvis] [--no-ask]
  grant  --category <cat> [--pattern "<substr>"] --why "<text>" --source <who> [--from <audit-id>]
  revoke <rule-id>
  list [--audit [--tail N]]`
  );
  process.exit(1);
}

function parseArgs(argv, spec) {
  const o = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const key = a.slice(2);
    if (spec.flags && spec.flags.includes(key)) o[key] = true;
    else if (spec.opts && spec.opts.includes(key)) o[key] = argv[++i];
    else {
      console.error(`approval-gate: unknown flag ${a}`);
      usage();
    }
  }
  return [o, pos];
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "check") {
    const [o] = parseArgs(rest, { flags: ["jarvis", "no-ask"], opts: ["category", "desc", "source"] });
    if (!o.category || !o.desc) usage();
    const r = runCheck(stateDir(), {
      category: o.category,
      desc: o.desc,
      source: o.source,
      jarvis: !!o.jarvis,
      noAsk: !!o["no-ask"],
    });
    if (r.failOpen) console.error(`approval-gate: FAIL-OPEN ${r.failOpen}`);
    if (r.bridgeNote && r.bridgeNote.startsWith("jarvis bridge failed")) {
      console.error(`approval-gate: ${r.bridgeNote}`);
    }
    console.log(`verdict=${r.verdict} tier=${r.tier} rule=${r.rule ?? "null"} audit=${r.auditId}`);
    if (r.parkedLine) console.log(r.parkedLine);
    process.exit(r.verdict === "allow" ? 0 : r.verdict === "ask" ? 7 : 13);
  }
  if (cmd === "grant") {
    const [o] = parseArgs(rest, { opts: ["category", "pattern", "why", "source", "from"] });
    if (!o.category || !o.why || !o.source) usage();
    try {
      console.log(runGrant(stateDir(), o).id);
    } catch (e) {
      console.error(`approval-gate: ${e.message}`);
      process.exit(1);
    }
    process.exit(0);
  }
  if (cmd === "revoke") {
    const [o, pos] = parseArgs(rest, { opts: [] });
    if (!pos[0]) usage();
    try {
      runRevoke(stateDir(), pos[0]);
      console.log(`revoked ${pos[0]}`);
    } catch (e) {
      console.error(`approval-gate: ${e.message}`);
      process.exit(1);
    }
    process.exit(0);
  }
  if (cmd === "list") {
    const [o] = parseArgs(rest, { flags: ["audit"], opts: ["tail"] });
    try {
      const dir = stateDir();
      const p = join(dir, o.audit ? "audit.ndjson" : "rules.jsonl");
      if (!existsSync(p)) process.exit(0);
      if (o.audit) {
        const n = parseInt(o.tail || "20", 10);
        readFileSync(p, "utf8").trim().split("\n").filter(Boolean).slice(-n).forEach((l) => console.log(l));
      } else {
        loadRules(dir).forEach((r) =>
          console.log(`${r.id} ${r.category} pattern=${r.pattern || "-"} why=${r.why || "-"}`)
        );
      }
    } catch (e) {
      console.error(`approval-gate: ${e.message}`);
      process.exit(1);
    }
    process.exit(0);
  }
  if (cmd === "selfcheck") {
    selfcheck();
    process.exit(0);
  }
  usage();
}

// --- selfcheck (hermetic: temp dirs only, jarvis via stub; ONE sentinel
// line lands in the REAL audit log as the evaluation-month datum) ---
function selfcheck() {
  const tmpBase = process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp";
  const fails = [];
  const t = (name, fn) => {
    try {
      fn();
      console.log(`PASS: ${name}`);
    } catch (e) {
      fails.push(name);
      console.log(`FAIL: ${name} — ${e.message}`);
    }
  };
  const eq = (a, b, what) => {
    if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
  };
  const tmp = () => mkdtempSync(join(tmpBase, "approval-gate-sc-"));

  t("classifier matrix (incl unknown-category → external)", () => {
    eq(classify("force_push", "x"), "hard_floor", "force_push");
    eq(classify("payment_write", "x"), "hard_floor", "payment_write");
    eq(classify("email", "x"), "external", "email");
    eq(classify("spoke_launch", "x"), "exec", "spoke_launch");
    eq(classify("write_file", "x"), "write_local", "write_file");
    eq(classify("read", "x"), "read", "read");
    eq(classify("totally_new_cat", "x"), "external", "unknown category");
    eq(classify("exec", "git push origin main --force"), "hard_floor", "desc regex --force");
    eq(classify("exec", "rm -rf /tmp/x"), "hard_floor", "desc regex rm -rf");
  });

  t("verdict matrix (default verdicts, no rules)", () => {
    const d = tmp();
    try {
      eq(runCheck(d, { category: "force_push", desc: "x" }).verdict, "ask", "hard_floor");
      eq(runCheck(d, { category: "email", desc: "x" }).verdict, "ask", "external");
      eq(runCheck(d, { category: "spoke_launch", desc: "x" }).verdict, "allow", "exec");
      eq(runCheck(d, { category: "write_file", desc: "x" }).verdict, "allow", "write_local");
      eq(runCheck(d, { category: "read", desc: "x" }).verdict, "allow", "read");
      eq(runCheck(d, { category: "totally_new_cat", desc: "x" }).verdict, "ask", "unknown category");
      eq(runCheck(d, { category: "email", desc: "x", noAsk: true }).verdict, "deny", "--no-ask");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("grant → match → revoke round trip", () => {
    const d = tmp();
    try {
      const rule = runGrant(d, { category: "email", pattern: "weekly-report", why: "t", source: "test" });
      const c = runCheck(d, { category: "email", desc: "send weekly-report" });
      eq(c.verdict, "allow", "after grant");
      eq(c.rule, rule.id, "matched rule id in result + audit provenance");
      runRevoke(d, rule.id);
      eq(runCheck(d, { category: "email", desc: "send weekly-report" }).verdict, "ask", "after revoke");
      readFileSync(join(d, "audit.ndjson"), "utf8").trim().split("\n").forEach((l) => JSON.parse(l));
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("hard-floor grant rejection", () => {
    const d = tmp();
    try {
      let threw = false;
      try {
        runGrant(d, { category: "force_push", pattern: "x", why: "t", source: "test" });
      } catch (e) {
        threw = /can never be auto-allowed/.test(e.message);
      }
      if (!threw) throw new Error("grant on force_push category was not rejected");
      threw = false;
      try {
        runGrant(d, { category: "exec", pattern: "git push origin main --force", why: "t", source: "test" });
      } catch (e) {
        threw = /can never be auto-allowed/.test(e.message);
      }
      if (!threw) throw new Error("grant on a force-pattern was not rejected");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("fail-open on corrupt rules.jsonl", () => {
    const d = tmp();
    try {
      appendFileSync(join(d, "rules.jsonl"), "{garbage\n");
      const c = runCheck(d, { category: "email", desc: "x" });
      eq(c.verdict, "allow", "corrupt rules must fail open for non-hard_floor");
      if (!c.failOpen || !/corrupt/.test(c.failOpen)) throw new Error("failOpen reason not set");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("fail-open on unwritable state dir", () => {
    const d = tmp();
    chmodSync(d, 0o500);
    try {
      const c = runCheck(d, { category: "email", desc: "x" });
      eq(c.verdict, "allow", "unwritable dir must fail open");
      if (!c.failOpen) throw new Error("failOpen reason not set");
    } finally {
      chmodSync(d, 0o700);
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("hard-floor survives fail-open", () => {
    const d = tmp();
    try {
      appendFileSync(join(d, "rules.jsonl"), "{garbage\n");
      const c = runCheck(d, { category: "force_push", desc: "x" });
      eq(c.verdict, "ask", "hard_floor must stay ask even on fail-open");
      eq(c.tier, "hard_floor", "tier is hard_floor");
      if (!c.failOpen || !/corrupt/.test(c.failOpen)) throw new Error("failOpen reason not set");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("hard-floor survives audit-append fail-open", () => {
    const d = tmp();
    try {
      writeFileSync(join(d, "rules.jsonl"), "[]");
      chmodSync(d, 0o000);
      const c = runCheck(d, { category: "force_push", desc: "x" });
      eq(c.verdict, "ask", "hard_floor must stay ask even on audit append failure");
      eq(c.tier, "hard_floor", "tier is hard_floor");
      if (!c.failOpen || !/audit append failed/.test(c.failOpen)) throw new Error("failOpen reason not set");
    } finally {
      chmodSync(d, 0o700);
      rmSync(d, { recursive: true, force: true });
    }
  });

  t("jarvis bridge via stub (no real call)", () => {
    const d = tmp();
    try {
      const stub = join(d, "j");
      writeFileSync(stub, `#!/bin/sh\necho called >> ${join(d, "stub.log")}\n`);
      chmodSync(stub, 0o755);
      const c = runCheck(d, { category: "email", desc: "x", jarvis: true, jarvisCmdOverride: stub });
      eq(c.verdict, "ask", "ask verdict stands across bridge");
      if (!existsSync(join(d, "stub.log"))) throw new Error("stub was not invoked");
      if (!(c.parkedLine || "").includes(".orchestrator/inbox")) throw new Error("parked line missing inbox path");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Sentinel: exactly one tagged line appended to the REAL audit log
  // (default dir, never the env override) — first datum of the evaluation
  // month. Everything above stayed in temp dirs.
  try {
    const real = join(process.env.HOME || "", ".claude", "orchestrator", "state", "approval");
    mkdirSync(real, { recursive: true });
    appendAudit(real, {
      ts: new Date().toISOString(),
      id: newId("a"),
      category: "selfcheck",
      desc: "selfcheck sentinel",
      tier: "read",
      verdict: "auto",
      matched_rule: null,
      source: "selfcheck",
      note: "",
    });
  } catch (e) {
    fails.push("real-log sentinel");
    console.log(`FAIL: real-log sentinel — ${e.message}`);
  }

  if (fails.length) {
    console.error(`selfcheck: ${fails.length} failure(s)`);
    process.exit(1);
  }
  console.log("selfcheck: OK");
}

main();
