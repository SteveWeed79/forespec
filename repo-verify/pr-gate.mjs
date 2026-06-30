#!/usr/bin/env node
// foresight pr-gate — grade a PR's diff against the archetype, post a sticky PR
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
// Local dry run (no GitHub, no API key):
//   node repo-verify/pr-gate.mjs --repo <path> --changed a.ts,b.ts --adapter mock --dry-run
//
// In CI: see .github/workflows/foresight.yml — runs on pull_request, diffs the base
// branch, and upserts a comment via GITHUB_TOKEN. Advisory by default; --fail blocks.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { loadRepo, selectForCheckpoint, keywordsFor, scoreFile } from "./select.mjs";
import { fingerprint, newRunId, recordPredictions, recordOutcome, latestPrediction, readOverrides } from "./store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

const HELP = `foresight pr-gate — grade a PR's diff, comment, and feed calibration.

Usage:
  node repo-verify/pr-gate.mjs [options]

Options:
  --repo <path>        repo to grade (default: .)
  --base <ref>         base to diff against (default: origin/main or $FORESIGHT_BASE)
  --head <ref>         head ref (default: HEAD)
  --changed a,b,c      explicit changed-file list (skips git diff; for local testing)
  --archetype <file>   archetype manifest (default: archetype.ecommerce.json)
  --adapter <name>     mock | claude (default: claude if key+model set, else mock)
  --all-domains        also grade design checkpoints (default: backbone only)
  --store <dir>        calibration store (default: ./.foresight)
  --no-store           don't record predictions/outcomes
  --comment            upsert a PR comment (needs GITHUB_TOKEN + event payload)
  --fail               exit non-zero on a touched-critical regression / below-6 (gate)
  --dry-run            print the comment, don't post
  --json               machine-readable
  -h, --help`;

function changedFiles({ repo, base, head, override }) {
  if (override) return override.split(",").map((s) => s.trim()).filter(Boolean);
  for (const range of [[`${base}...${head}`], [base, head], [base]]) {
    try {
      const out = execFileSync("git", ["-C", repo, "diff", "--name-only", ...range], { encoding: "utf8" });
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch { /* try next form */ }
  }
  return [];
}

const levelStr = (l) => (l == null ? "—" : String(l));
function deltaTag(prior, now) {
  if (prior == null) return now == null ? "" : "new";
  if (now == null) return "";
  if (now > prior) return `⬆ ${prior}→${now}`;
  if (now < prior) return `⬇ ${prior}→${now}`;
  return `= ${now}`;
}

function renderMarkdown({ archetype, results, changed, touched, passive, ok, blockingCrit, regressedCrit, adapterName }) {
  const L = ["<!-- foresight-gate -->", `### 🔭 Foresight — ${archetype.archetype} backbone`, ""];
  if (touched.length === 0) {
    L.push(`No backbone-relevant files changed in this PR (${changed.length} changed file(s) scanned). Nothing to grade.`);
    return L.join("\n");
  }
  L.push(`Graded the **${touched.length}** checkpoint(s) this PR touches (adapter: \`${adapterName}\`).`, "");
  L.push("| Checkpoint | Sev | Level | vs prev | Gap |", "|---|---|---|---|---|");
  for (const r of results) {
    const lvl = r.error ? "⚠️ err" : levelStr(r.level);
    const d = r.error ? "" : deltaTag(r.prior, r.level);
    const gap = (r.gap || r.error || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
    L.push(`| \`${r.id}\` | ${r.severity} | ${lvl} | ${d} | ${gap} |`);
  }
  L.push("");
  L.push(ok
    ? "✅ **Backbone gate: pass** — no touched critical below level 6, no regressions."
    : "🚫 **Backbone gate: needs a look**");
  if (blockingCrit.length) L.push(`- Critical below shippable (≥6): ${blockingCrit.map((r) => `\`${r.id}\` (${levelStr(r.level)})`).join(", ")}`);
  if (regressedCrit.length) L.push(`- Critical regressed: ${regressedCrit.map((r) => `\`${r.id}\` (${r.prior}→${r.level})`).join(", ")}`);
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
  const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "foresight-gate" };
  const list = await fetch(`${api}/repos/${repoFull}/issues/${num}/comments?per_page=100`, { headers: h }).then((r) => r.json());
  const existing = Array.isArray(list) ? list.find((c) => typeof c.body === "string" && c.body.includes("<!-- foresight-gate -->")) : null;
  if (existing) {
    await fetch(`${api}/repos/${repoFull}/issues/comments/${existing.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ body }) });
    console.error(`updated Foresight comment on PR #${num}`);
  } else {
    await fetch(`${api}/repos/${repoFull}/issues/${num}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body }) });
    console.error(`posted Foresight comment on PR #${num}`);
  }
}

async function main() {
  if (has("-h") || has("--help")) { console.log(HELP); return 0; }
  const repo = pathResolve(process.cwd(), arg("--repo", "."));
  const archetypePath = arg("--archetype", null)
    ? pathResolve(process.cwd(), arg("--archetype"))
    : pathResolve(here, "..", "archetype.ecommerce.json");
  const base = arg("--base", process.env.FORESIGHT_BASE || "origin/main");
  const head = arg("--head", "HEAD");
  const storeDir = pathResolve(process.cwd(), arg("--store", ".foresight"));

  const archetype = resolveArchetype(archetypePath);
  const overrides = readOverrides({ storeDir });
  for (const cp of archetype.checkpoints) { const ov = overrides.severity?.[cp.id]; if (ov) cp.severity = ov; }

  const changed = changedFiles({ repo, base, head, override: arg("--changed", null) });
  const allFiles = loadRepo(repo);
  const changedSet = new Set(changed);
  const changedObjs = allFiles.filter((f) => changedSet.has(f.path));

  const adapterName = has("--adapter") ? arg("--adapter") : (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? "claude" : "mock");
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
    const prior = latestPrediction({ storeDir, checkpointId: cp.id });
    const base_ = { id: cp.id, domain: cp.domain, severity: cp.severity, evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, fingerprint: fp, prior: prior?.level ?? null };
    try {
      const v = await adapter.verify({ checkpoint: cp, code });
      results.push({ ...base_, level: v.level, confidence: v.confidence, gap: v.gap, rationale: v.rationale, error: null });
    } catch (e) {
      results.push({ ...base_, level: null, confidence: null, gap: null, rationale: null, error: String(e.message ?? e) });
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
      if (r.error || r.prior == null) continue;
      if (r.prior < 6 && r.level >= 6) {
        recordOutcome({
          storeDir,
          prediction: { run_id: runId, checkpoint_id: r.id, fingerprint: r.fingerprint, level: r.prior, confidence: r.confidence },
          outcome: "hit", source: "passive_git",
          note: `flagged ${r.prior}→${r.level} after a change to a relevant file`, project: repo,
        });
        passive.push(r.id);
      }
    }
  }

  const crit = results.filter((r) => r.severity === "critical");
  const ungraded = results.filter((r) => r.level == null);
  const lvl = (r) => (r.level == null ? -1 : r.level);
  const blockingCrit = crit.filter((r) => lvl(r) < 6);
  const regressedCrit = crit.filter((r) => r.prior != null && r.level != null && r.level < r.prior);
  const ok = blockingCrit.length === 0 && regressedCrit.length === 0 && ungraded.length === 0;

  const md = renderMarkdown({ archetype, results, changed, touched, passive, ok, blockingCrit, regressedCrit, adapterName });

  if (has("--json")) console.log(JSON.stringify({ ok, changed, touched: touched.map((c) => c.id), results, passive }, null, 2));
  else if (has("--comment") && !has("--dry-run")) await postComment(md);
  else console.log(md);

  return (has("--fail") && !ok) ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`fatal: ${e?.message ?? e}`); process.exit(2); });
