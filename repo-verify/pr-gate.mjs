#!/usr/bin/env node
// forespec gate — grade a PR's diff against the archetype, post a sticky PR
// comment, and passively capture "flagged → fixed" outcomes. The git-aware surface.
//
// Why this exists: it's the trustworthy home for "what changed." It grades only the
// checkpoints the PR actually touches, compares each to the LAST RECORDED prediction
// for that checkpoint (real commits, consistent selection — not two arbitrary
// snapshots, which produced a phantom regression in the first real-repo run), and
// records the result so the calibration store grows on its own. When a checkpoint
// that was previously flagged (< 6) comes back ≥ 6 after a relevant file changed,
// that's a passive "acted/hit" outcome — feeding brick 3 without anyone typing it.
//
// Trust rules (each closes a real audited hole):
//   - a git-diff FAILURE is an error, never an empty diff (an empty diff green-lights);
//   - a PR that edits the gate's own rules (forespec.config.json / .forespec overrides)
//     is flagged — the head being graded must not quietly re-write its own gate;
//   - a missing API key must never silently swap the trusted verifier for the mock
//     keyword baseline and still gate: the downgrade is warned, marked, and fails --fail;
//   - changed files the scanner cannot read (too big, unsupported) are named, not dropped.
//
// Local dry run (no GitHub, no API key):
//   node repo-verify/pr-gate.mjs --repo <path> --changed a.ts,b.ts --adapter mock --dry-run
//
// In CI: see .github/workflows/forespec.yml — runs on pull_request, diffs the base
// branch, and upserts a comment via GITHUB_TOKEN. Advisory by default; --fail blocks.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { loadRepo, selectForCheckpoint, keywordsFor, scoreFile } from "./select.mjs";
import { fingerprint, newRunId, recordPredictions, recordOutcome, latestPrediction, readOverrides } from "./store.mjs";
import { readConfig, resolveManifestPath } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);
const SEV_ORDER = ["critical", "high", "medium", "low"];

const HELP = `forespec gate — grade a PR's diff, comment, and feed calibration.

Usage:
  node repo-verify/pr-gate.mjs [options]

Options:
  --repo <path>        repo to grade (default: .)
  --base <ref>         base to diff against (default: origin/main or $FORESPEC_BASE)
  --head <ref>         head ref (default: HEAD)
  --changed a,b,c      explicit changed-file list (skips git diff; for local testing)
  --archetype <file>   archetype manifest (default: archetype.ecommerce.json)
  --adapter <name>     mock | claude (default: claude if key+model set, else mock)
  --all-domains        also grade design checkpoints (default: backbone only)
  --store <dir>        calibration store (default: ./.forespec)
  --no-store           don't record predictions/outcomes
  --comment            upsert a PR comment (needs GITHUB_TOKEN + event payload)
  --fail               exit non-zero on a touched-tier regression / below-6 (gate)
  --dry-run            print the comment, don't post
  --json               machine-readable
  -h, --help`;

/**
 * Changed files from git. A FAILED diff must be distinguishable from an EMPTY diff:
 * empty means "nothing changed" (gate passes), failure means "we don't know what
 * changed" — and an unknown diff must never pass a gate.
 */
function changedFiles({ repo, base, head, override }) {
  if (override != null) return { files: override.split(",").map((s) => s.trim()).filter(Boolean), failed: false };
  for (const range of [[`${base}...${head}`], [base, head], [base]]) {
    try {
      const out = execFileSync("git", ["-C", repo, "diff", "--name-only", ...range], { encoding: "utf8" });
      return { files: out.split("\n").map((s) => s.trim()).filter(Boolean), failed: false };
    } catch { /* try next form */ }
  }
  return { files: [], failed: true };
}

const levelStr = (l) => (l == null ? "—" : String(l));
function deltaTag(prior, now) {
  if (prior == null) return now == null ? "" : "new";
  if (now == null) return "";
  if (now > prior) return `⬆ ${prior}→${now}`;
  if (now < prior) return `⬇ ${prior}→${now}`;
  return `= ${now}`;
}

function renderMarkdown({ archetype, results, changed, touched, passive, ok, blocking, regressed, ungraded, gateLabel, adapterName, degraded, tampered, unscanned }) {
  const L = ["<!-- forespec-gate -->", `### 🔭 Forespec — ${archetype.archetype} backbone`, ""];
  if (degraded) L.push(`> ⚠️ **Graded by the mock keyword baseline (no API key) — not the validated reasoning verifier.** This is not a verdict to gate a merge on.`, "");
  if (tampered.length) L.push(`> ⚠️ **This PR changes the gate's own rules:** ${tampered.map((f) => `\`${f}\``).join(", ")}. The grade below uses the PR's version of those rules — review that change first.`, "");
  if (touched.length === 0) {
    L.push(`No backbone-relevant files changed in this PR (${changed.length} changed file(s) scanned). Nothing to grade.`);
    if (unscanned.length) L.push("", `⚠️ ${unscanned.length} changed file(s) could not be scanned (too large or unsupported type): ${unscanned.slice(0, 10).map((f) => `\`${f}\``).join(", ")}${unscanned.length > 10 ? ", …" : ""}.`);
    return L.join("\n");
  }
  L.push(`Graded the **${touched.length}** checkpoint(s) this PR touches (adapter: \`${adapterName}\`).`, "");
  L.push("| Checkpoint | Sev | Level | vs prev | Gap |", "|---|---|---|---|---|");
  for (const r of results) {
    const lvl = r.error ? "⚠️ err" : r.applicable === false ? "n/a" : levelStr(r.level);
    const d = r.error || r.applicable === false ? "" : deltaTag(r.prior, r.level);
    const gap = (r.gap || r.error || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
    L.push(`| \`${r.id}\` | ${r.severity} | ${lvl} | ${d} | ${gap} |`);
  }
  L.push("");
  const gatedTouched = blocking.length + regressed.length + ungraded.length > 0 || results.some((r) => r.gated);
  L.push(ok
    ? (gatedTouched
      ? `✅ **Backbone gate: pass** — no touched ${gateLabel} below level 6, no regressions anywhere.`
      : `✅ **Backbone gate: pass** — no ${gateLabel} checkpoints touched; no regressions on what was.`)
    : "🚫 **Backbone gate: needs a look**");
  if (blocking.length) L.push(`- ${gateLabel} below shippable (≥6): ${blocking.map((r) => `\`${r.id}\` (${levelStr(r.level)})`).join(", ")}`);
  if (regressed.length) L.push(`- Regressed: ${regressed.map((r) => `\`${r.id}\` (${r.severity}, ${r.prior}→${r.level})`).join(", ")}`);
  if (ungraded.length) L.push(`- Could not be graded (blocks the gate until it grades clean): ${ungraded.map((r) => `\`${r.id}\``).join(", ")}`);
  if (unscanned.length) L.push(`- ⚠️ ${unscanned.length} changed file(s) not scannable (too large/unsupported): ${unscanned.slice(0, 10).map((f) => `\`${f}\``).join(", ")}${unscanned.length > 10 ? ", …" : ""}`);
  if (passive.length) L.push("", `_Recorded ${passive.length} passive "flagged→fixed" outcome(s) for calibration: ${passive.map((id) => `\`${id}\``).join(", ")}._`);
  L.push("", "<sub>Levels: 3 present-but-risky · 6 solid · 9 great. A level is property-presence, not blast radius — confirm before acting. Reasoning grades are a first pass; verify critical calls.</sub>");
  return L.join("\n");
}

async function postComment(body) {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repoFull || !eventPath || !existsSync(eventPath)) {
    console.error("note: GITHUB_TOKEN / GITHUB_REPOSITORY / event payload missing — printing comment instead:\n");
    console.log(body);
    return;
  }
  const ev = JSON.parse(readFileSync(eventPath, "utf8"));
  const num = ev.pull_request?.number ?? ev.number;
  if (!num) { console.error("note: no PR number in event — printing comment:\n"); console.log(body); return; }
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "forespec-gate" };
  // A failed POST/PATCH must never read as success — the report would silently vanish.
  // On any API failure, dump the comment to the log so the verdict still reaches a human.
  try {
    const listRes = await fetch(`${api}/repos/${repoFull}/issues/${num}/comments?per_page=100`, { headers: h });
    if (!listRes.ok) throw new Error(`list comments: HTTP ${listRes.status}`);
    const list = await listRes.json();
    const existing = Array.isArray(list) ? list.find((c) => typeof c.body === "string" && c.body.includes("<!-- forespec-gate -->")) : null;
    const res = existing
      ? await fetch(`${api}/repos/${repoFull}/issues/comments/${existing.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ body }) })
      : await fetch(`${api}/repos/${repoFull}/issues/${num}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body }) });
    if (!res.ok) throw new Error(`${existing ? "update" : "create"} comment: HTTP ${res.status}`);
    console.error(`${existing ? "updated" : "posted"} Forespec comment on PR #${num}`);
  } catch (e) {
    console.error(`warning: could not post PR comment (${e.message}) — printing it instead:\n`);
    console.log(body);
  }
}

async function main() {
  if (has("-h") || has("--help")) { console.log(HELP); return 0; }
  const repo = pathResolve(process.cwd(), arg("--repo", "."));
  // Archetype precedence: --archetype > forespec.config.json in the repo > default.
  const cfg = readConfig(repo);
  const archetypePath = arg("--archetype", null)
    ? resolveManifestPath(arg("--archetype"), { cwd: process.cwd() })
    : cfg?.archetype
      ? resolveManifestPath(cfg.archetype, { cwd: repo })
      : pathResolve(here, "..", "archetype.ecommerce.json");
  const base = arg("--base", process.env.FORESPEC_BASE || "origin/main");
  const head = arg("--head", "HEAD");
  const storeDir = pathResolve(process.cwd(), arg("--store", ".forespec"));

  const archetype = resolveArchetype(archetypePath);
  const overrides = readOverrides({ storeDir });
  for (const cp of archetype.checkpoints) {
    const ov = overrides.severity?.[cp.id];
    if (ov && !SEV_ORDER.includes(ov)) { console.error(`warning: ignoring invalid severity override for ${cp.id}: "${ov}"`); continue; }
    if (ov) cp.severity = ov;
  }

  const { files: changed, failed: diffFailed } = changedFiles({ repo, base, head, override: arg("--changed", null) });
  if (diffFailed) {
    // "We couldn't compute the diff" must never look like "nothing changed" — an unknown
    // diff green-lighting a merge is the worst possible gate failure.
    console.error(`error: could not compute the git diff against ${base} — refusing to gate an unknown diff. (Is the base fetched? checkout with fetch-depth: 0.)`);
    return 2;
  }
  const allFiles = loadRepo(repo);
  const changedSet = new Set(changed);
  const changedObjs = allFiles.filter((f) => changedSet.has(f.path));
  // Changed files the scanner can't see: deleted files carry nothing to grade, but a file
  // that EXISTS and couldn't be loaded (too big, unsupported extension) is a blind spot the
  // reader deserves to know about — never silently drop it.
  const scannedPaths = new Set(changedObjs.map((f) => f.path));
  const unscanned = changed.filter((p) => !scannedPaths.has(p) && existsSync(join(repo, p)));

  // The gate's own rules live in the head being graded. A PR that edits them could quietly
  // weaken its own gate (swap the archetype, lower a severity) — flag it, loudly.
  const tampered = changed.filter((p) => p === "forespec.config.json" || p.startsWith(".forespec/"));

  const explicitAdapter = arg("--adapter", null);
  const adapterName = explicitAdapter ?? (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? "claude" : "mock");
  const degraded = !explicitAdapter && adapterName === "mock";
  if (degraded) console.error("note: ANTHROPIC_API_KEY/ANTHROPIC_MODEL not set — using the mock keyword baseline, NOT the reasoning verifier. Its verdict must not gate a merge.");
  const adapter = await import(new URL(`../verifier-eval/adapters/${adapterName}.mjs`, import.meta.url));

  // Touched checkpoints: a changed file is relevant to the checkpoint (keyword score > 0).
  const touched = archetype.checkpoints.filter((cp) => {
    if (cp.domain !== "backbone" && !has("--all-domains")) return false;
    const kws = keywordsFor(cp);
    return changedObjs.some((f) => scoreFile(f, kws) > 0);
  });

  const results = [];
  for (const cp of touched) {
    const { files, code } = selectForCheckpoint(allFiles, cp);
    const fp = fingerprint(code);
    // Prior scoped to this archetype + adapter: a shared/cached store must not let another
    // archetype's run (or a mock run) become the baseline for regression math.
    const prior = latestPrediction({ storeDir, checkpointId: cp.id, archetype: archetype.archetype, adapter: adapter.name ?? adapterName });
    const base_ = { id: cp.id, domain: cp.domain, severity: cp.severity, evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, fingerprint: fp, prior: prior?.level ?? null, priorPrediction: prior };
    try {
      const v = await adapter.verify({ checkpoint: cp, code });
      const applicable = v.applicable !== false;
      results.push({ ...base_, applicable, level: applicable ? v.level : null, confidence: v.confidence, gap: v.gap, rationale: v.rationale, error: null });
    } catch (e) {
      results.push({ ...base_, applicable: true, level: null, confidence: null, gap: null, rationale: null, error: String(e.message ?? e) });
    }
  }

  // Record predictions (git-grounded), then passively capture flagged→fixed.
  let runId = null;
  if (!has("--no-store")) {
    runId = newRunId();
    recordPredictions({ storeDir, runId, archetype: archetype.archetype, archetypeVersion: archetype.version, project: repo, results });
  }
  const passive = [];
  if (!has("--no-store")) {
    for (const r of results) {
      if (r.error || r.prior == null || r.level == null) continue;
      if (r.prior < 6 && r.level >= 6) {
        // Join the outcome to the ACTUAL prior prediction (its run, its fingerprint) — not a
        // synthetic mix of new-run ids with old levels, which breaks the store's join contract.
        recordOutcome({
          storeDir,
          prediction: r.priorPrediction,
          outcome: "hit", source: "passive_git",
          note: `flagged ${r.prior}→${r.level} after a change to a relevant file`, project: repo,
        });
        passive.push(r.id);
      }
    }
  }

  // Gate tiers: declared by the archetype (goal_definition.gate_tiers) or its top DEFINED
  // severity. Below-6 blocks within the gate tier(s); a REGRESSION blocks at ANY severity —
  // a high slipping 9→3 is exactly what a PR gate exists to catch, tier membership aside.
  const assessed = results.filter((r) => r.applicable !== false);
  const declaredTiers = (archetype.goal_definition?.gate_tiers ?? []).filter((t) => SEV_ORDER.includes(t));
  const definedTop = SEV_ORDER.find((s) => archetype.checkpoints.some((c) => c.severity === s));
  const gateTiers = declaredTiers.length ? declaredTiers : definedTop ? [definedTop] : ["critical"];
  const gateLabel = gateTiers.join("+");
  for (const r of results) r.gated = r.applicable !== false && gateTiers.includes(r.severity);
  const ungraded = assessed.filter((r) => r.level == null);
  const lvl = (r) => (r.level == null ? -1 : r.level);
  const blocking = assessed.filter((r) => r.gated && lvl(r) < 6);
  const regressed = assessed.filter((r) => r.prior != null && r.level != null && r.level < r.prior);
  const ok = blocking.length === 0 && regressed.length === 0 && ungraded.length === 0;

  const md = renderMarkdown({ archetype, results, changed, touched, passive, ok, blocking, regressed, ungraded, gateLabel, adapterName, degraded, tampered, unscanned });

  if (has("--json")) {
    const jsonResults = results.map(({ priorPrediction, ...r }) => r);
    console.log(JSON.stringify({ ok, gate_tiers: gateTiers, adapter: adapterName, adapter_degraded: degraded, tampered, unscanned, changed, touched: touched.map((c) => c.id), results: jsonResults, blocking: blocking.map((r) => r.id), regressed: regressed.map((r) => r.id), ungraded: ungraded.map((r) => r.id), passive }, null, 2));
  } else if (has("--comment") && !has("--dry-run")) await postComment(md);
  else console.log(md);

  if (has("--fail")) {
    // A degraded (fallback-mock) run cannot certify a merge, and a tampered gate needs a
    // human: both fail closed under --fail. Explicit `--adapter mock` (local testing) is
    // the developer's own call and is not treated as degradation.
    if (degraded) { console.error("gate: failing closed — the fallback mock baseline cannot certify a merge (--fail)."); return 1; }
    if (tampered.length) { console.error("gate: failing closed — this PR modifies the gate's own rules (--fail)."); return 1; }
    if (!ok) return 1;
  }
  return 0;
}

// exitCode, not process.exit(): a hard exit force-closes undici's fetch keep-alive
// socket mid-teardown → libuv async.c assertion on Windows (see verify.mjs).
main().then((c) => { process.exitCode = c; }, (e) => { console.error(`fatal: ${e?.message ?? e}`); process.exitCode = 2; });
