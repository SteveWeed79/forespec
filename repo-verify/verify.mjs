#!/usr/bin/env node
// Forespec repo verifier — grade a WHOLE real repo against an archetype.
//
// Where verifier-eval/ measures whether the verifier is accurate (single labeled
// fixtures, false-green rate), THIS points the verifier at your actual repo: it
// resolves an archetype manifest from the shared library, selects the relevant
// files per checkpoint, grades each one, and prints level + gap + confidence plus
// the goal_definition roll-up. Exit code reflects the shippable gate, so it drops
// into CI. Zero dependencies — reuses library/resolve.mjs and the verifier-eval
// adapters (mock | claude).
//
// Usage:
//   node repo-verify/verify.mjs <repo-path> [options]
//
// Options:
//   --archetype <file>   Archetype manifest (default: archetype.ecommerce.json at repo root)
//   --domain <d>         backbone | design | all (default: backbone)
//   --checkpoint <id>    Grade a single checkpoint by id
//   --adapter <name>     mock | claude (default: claude if ANTHROPIC_API_KEY+MODEL set, else mock)
//   --budget <chars>     Per-checkpoint context budget (default: 60000)
//   --store <dir>        Calibration store dir (default: ./.forespec); --no-store to skip
//   --json               Emit machine-readable JSON
//   -h, --help

import { resolve as pathResolve, dirname } from "node:path";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { loadRepo, selectForCheckpoint } from "./select.mjs";
import { fingerprint, newRunId, recordPredictions, readOverrides } from "./store.mjs";
import { readConfig, resolveManifestPath } from "./config.mjs";
import { selectGaps, adviseGaps } from "./gaps.mjs";
import { renderReport } from "./report-html.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

const HELP = `Forespec repo verifier — grade a whole repo against an archetype.

Usage:
  node repo-verify/verify.mjs <repo-path> [options]

Options:
  --archetype <file>   Archetype manifest (default: archetype.ecommerce.json)
  --domain <d>         backbone | design | all (default: backbone)
  --checkpoint <id>    Grade a single checkpoint by id
  --adapter <name>     mock | claude (default: claude if ANTHROPIC_API_KEY+ANTHROPIC_MODEL set, else mock)
  --budget <chars>     Per-checkpoint context budget (default: 60000)
  --store <dir>        Calibration store dir for the prediction log (default: ./.forespec)
  --no-store           Don't record this run to the calibration store
  --json               Machine-readable JSON
  --html [path]        Also write a visual HTML report (default: forespec-report.html)
  -h, --help           This help

The claude adapter reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from the environment.
Every run is logged to the calibration store (pattern + instance — the wall is physical);
record a verdict on a flag with: node repo-verify/feedback.mjs <checkpoint-id> <outcome>`;

const COLORS = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const SEV_ORDER = ["critical", "high", "medium", "low"];
function paint(on, code, s) {
  return on ? `${code}${s}${COLORS.reset}` : s;
}

function levelTag(level, on) {
  if (level == null) return paint(on, COLORS.red, "ungraded");
  if (level >= 9) return paint(on, COLORS.green, "level 9");
  if (level >= 6) return paint(on, COLORS.green, "level 6");
  return paint(on, COLORS.yellow, "level 3");
}

function pickAdapterName() {
  const explicit = arg("--adapter", null);
  if (explicit) return { name: explicit, note: null };
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) return { name: "claude", note: null };
  return {
    name: "mock",
    note:
      "ANTHROPIC_API_KEY/ANTHROPIC_MODEL not set — using the mock keyword baseline, " +
      "not the reasoning verifier. Set both for real grading (or pass --adapter claude).",
  };
}

async function main() {
  if (has("-h") || has("--help")) {
    console.log(HELP);
    return 0;
  }

  const positionals = process.argv.slice(2).filter((a, i, arr) => {
    if (a.startsWith("-")) return false;
    const prev = arr[i - 1];
    return !["--archetype", "--domain", "--checkpoint", "--adapter", "--budget", "--store", "--html"].includes(prev);
  });
  const repoArg = positionals[0];
  if (!repoArg) {
    console.error("error: missing <repo-path>\n");
    console.error(HELP);
    return 2;
  }

  const repoPath = pathResolve(process.cwd(), repoArg);
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
    console.error(`error: ${repoPath} is not a directory`);
    return 2;
  }

  // Archetype precedence: explicit --archetype > forespec.config.json in the repo > default.
  const archetypeArg = arg("--archetype", null);
  const config = readConfig(repoPath);
  let archetypePath, archetypeSource;
  if (archetypeArg) {
    archetypePath = resolveManifestPath(archetypeArg, { cwd: process.cwd() });
    archetypeSource = "flag";
  } else if (config?.archetype) {
    archetypePath = resolveManifestPath(config.archetype, { cwd: repoPath });
    archetypeSource = "config";
  } else {
    archetypePath = pathResolve(here, "..", "archetype.ecommerce.json");
    archetypeSource = "default";
  }

  let archetype;
  try {
    archetype = resolveArchetype(archetypePath);
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }

  const domain = arg("--domain", "backbone");
  if (!["backbone", "design", "all"].includes(domain)) {
    // A typo'd domain would filter the checkpoint set to zero and read as a property of the
    // REPO ("inconclusive") instead of a usage error. Fail loud, fail here.
    console.error(`error: --domain must be backbone | design | all (got "${domain}")`);
    return 2;
  }
  const onlyId = arg("--checkpoint", null);
  const budget = Number(arg("--budget", "60000")) || 60_000;
  const json = has("--json");
  const storeDir = pathResolve(process.cwd(), arg("--store", ".forespec"));
  // --html [path]: also emit the visual report. Guard against `--html` being followed
  // by another flag (arg() would return that flag as the path) → fall back to default.
  let htmlOut = null;
  if (has("--html")) {
    const p = arg("--html", null);
    htmlOut = p && !p.startsWith("-") ? p : "forespec-report.html";
  }

  // Apply locally-accepted calibration overrides (brick 3) on top of the archetype.
  // The shared library is untouched; this is earned, reversible, per-project tuning.
  const overrides = readOverrides({ storeDir });
  const appliedOverrides = [];
  for (const cp of archetype.checkpoints) {
    const ov = overrides.severity?.[cp.id];
    if (ov && !SEV_ORDER.includes(ov)) {
      // An invalid severity (hand-edit typo) would never equal any gate tier — the checkpoint
      // would silently drop OUT of the shippable gate. Refuse it, keep the manifest severity.
      console.error(`warning: ignoring invalid severity override for ${cp.id}: "${ov}" (must be one of ${SEV_ORDER.join("|")})`);
      continue;
    }
    if (ov && ov !== cp.severity) {
      appliedOverrides.push({ id: cp.id, from: cp.severity, to: ov });
      cp.severity = ov;
    }
  }

  let checkpoints = archetype.checkpoints;
  if (onlyId) {
    checkpoints = checkpoints.filter((c) => c.id === onlyId);
    if (checkpoints.length === 0) {
      console.error(`error: no checkpoint "${onlyId}" in ${archetype.archetype}. Available:\n  ${archetype.checkpoints.map((c) => c.id).join("\n  ")}`);
      return 2;
    }
  } else if (domain !== "all") {
    checkpoints = checkpoints.filter((c) => c.domain === domain);
  }

  const { name: adapterName, note } = pickAdapterName();
  let adapter;
  try {
    adapter = await import(new URL(`../verifier-eval/adapters/${adapterName}.mjs`, import.meta.url));
  } catch (e) {
    console.error(`error: could not load adapter "${adapterName}": ${e.message}`);
    return 2;
  }

  const useColor = process.stdout.isTTY === true && !json;
  // The silent-downgrade trap: a rotated/missing key must NEVER quietly swap the trusted
  // reasoning verifier for the keyword mock and still green-light CI. The warning goes to
  // stderr on EVERY surface (json included), and the degradation is carried in the output.
  const adapterDegraded = !!note;
  if (note) console.error(`note: ${note}\n`);
  if (!json) {
    console.error(`Verifying ${repoPath}`);
    const srcNote = archetypeSource === "config" ? " (from forespec.config.json)" : archetypeSource === "default" ? " (default — run `forespec init` to detect)" : "";
    console.error(`  ${archetype.archetype} v${archetype.version}${srcNote} | adapter: ${adapter.name ?? adapterName} | ${checkpoints.length} checkpoint(s)`);
    if (appliedOverrides.length) console.error(`  calibration overrides applied: ${appliedOverrides.map((o) => `${o.id} ${o.from}→${o.to}`).join(", ")}`);
    console.error("");
  }

  const allFiles = loadRepo(repoPath);
  if (allFiles.length === 0) {
    console.error(`error: no source files found under ${repoPath}`);
    return 2;
  }

  const results = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    if (!json) process.stderr.write(`  [${i + 1}/${checkpoints.length}] ${cp.id}...\n`);
    const { files, code, matched } = selectForCheckpoint(allFiles, cp, budget);
    const fp = fingerprint(code); // join key: hash of the graded slice, not the code itself
    // Selection pre-check: nothing in the repo scored on this checkpoint's keywords, so its
    // subject almost certainly isn't here. Mark N/A without spending an API call (this is the
    // cheap half of the flag-by-absence fix — a repo with no payments never even asks about them).
    if (!matched) {
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        applicable: false, level: null, confidence: null, gap: null,
        rationale: "no code relevant to this checkpoint was found in the repo",
        evidence: [], adapter: adapter.name ?? adapterName, fingerprint: fp, error: null,
      });
      continue;
    }
    try {
      let v = await adapter.verify({ checkpoint: cp, code });
      // Challenge an UNPROVEN N/A: the model claimed "subject absent", but selection reached
      // here only because files matched this checkpoint's keywords (matched === true). Force
      // it to prove the matched code is unrelated or grade it — only an N/A that SURVIVES the
      // adversarial re-pass is accepted. (Structural N/A, matched === false, was handled above
      // without an API call and needs no challenge.)
      let challenged = false;
      if (v.applicable === false) {
        challenged = true;
        v = await adapter.verify({ checkpoint: cp, code, challenge: true });
      }
      const applicable = v.applicable !== false; // mock adapter omits applicable → treat as applicable
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        applicable, level: applicable ? v.level : null, challenged,
        confidence: v.confidence, gap: v.gap, rationale: v.rationale,
        evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, fingerprint: fp, error: null,
      });
    } catch (e) {
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        applicable: true, level: null, confidence: null, gap: null, rationale: null,
        evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, fingerprint: fp, error: String(e.message ?? e),
      });
    }
  }

  // goal_definition roll-up. N/A checkpoints (subject absent from the repo) don't count
  // toward the gate — a repo with no payments isn't "unshippable" for payment checkpoints.
  const assessed = results.filter((r) => r.applicable !== false);
  const notApplicable = results.filter((r) => r.applicable === false);
  // Which severity tier(s) gate "shippable":
  //   1. The archetype may DECLARE them (goal_definition.gate_tiers, e.g. portfolio gates on
  //      critical AND high — its design/web bar is the product, not polish).
  //   2. Otherwise: the top severity tier among the checkpoint DEFINITIONS being run — defined,
  //      not assessed, so N/A results can't quietly change which tier gates the release.
  //   3. If every checkpoint in the gate tier(s) came back N/A, the gate DEMOTES to the top
  //      assessed tier — loudly. The demotion is reported on every surface; a silent demotion
  //      would let a selection miss un-gate an entire critical backbone.
  const declaredTiers = (archetype.goal_definition?.gate_tiers ?? []).filter((t) => SEV_ORDER.includes(t));
  const definedTop = SEV_ORDER.find((s) => checkpoints.some((c) => c.severity === s));
  let gateTiers = declaredTiers.length ? declaredTiers : definedTop ? [definedTop] : [];
  let gateDemotion = null;
  if (gateTiers.length && !assessed.some((r) => gateTiers.includes(r.severity))) {
    const fallback = SEV_ORDER.find((s) => assessed.some((r) => r.severity === s));
    if (fallback) {
      gateDemotion = { from: gateTiers.join("+"), to: fallback, reason: `every ${gateTiers.join("/")} checkpoint was N/A — that tier was never assessed` };
      gateTiers = [fallback];
    }
  }
  const gateTier = gateTiers.join("+") || "critical"; // display label
  const gated = assessed.filter((r) => gateTiers.includes(r.severity));
  const others = assessed.filter((r) => !gateTiers.includes(r.severity));
  const ungraded = assessed.filter((r) => r.level == null); // errored (N/A already excluded)
  const lvl = (r) => (r.level == null ? -1 : r.level);
  // INCONCLUSIVE, not "shippable": if nothing was gradable (empty repo, everything N/A, or all
  // errored), `gated.every(...)` is vacuously true — a green verdict for a repo we never graded.
  // Not reviewing and not reporting are the same failure; require real assessed evidence.
  const conclusive = gated.length > 0;
  const shippable = conclusive && ungraded.length === 0 && gated.every((r) => lvl(r) >= 6);
  const great = conclusive && ungraded.length === 0 && gated.every((r) => lvl(r) >= 9) && others.every((r) => lvl(r) >= 6);
  const blocking = gated.filter((r) => lvl(r) < 6);

  // Whole-domain omission is part of the verdict, not a footnote: the default --domain
  // backbone SKIPS design checkpoints entirely, and every surface (text, JSON, HTML) must
  // say so — a machine consumer reading JSON deserves the same disclosure a human gets.
  const gradedIds = new Set(results.map((r) => r.id));
  const designSkipped = (archetype.checkpoints || []).filter((c) => c.domain === "design" && !gradedIds.has(c.id)).map((c) => c.id);

  // ONE rollup, shared verbatim by the JSON and HTML surfaces so they can never disagree
  // with the terminal about what was graded, what gated, and what was skipped.
  const rollup = {
    conclusive,
    shippable,
    great,
    gate_tier: gateTier,
    gate_tiers: gateTiers,
    gate_demotion: gateDemotion,
    domain,
    blocking: blocking.map((r) => r.id),
    ungraded: ungraded.map((r) => r.id),
    not_applicable: notApplicable.map((r) => r.id),
    design_skipped: designSkipped,
    adapter: adapter.name ?? adapterName,
    adapter_degraded: adapterDegraded,
  };

  // Brick 1 — log this run as training data (pattern/instance split), unless disabled.
  let storeInfo = null;
  if (!has("--no-store")) {
    const runId = newRunId();
    const { count } = recordPredictions({
      storeDir, runId,
      archetype: archetype.archetype, archetypeVersion: archetype.version,
      project: repoPath, results,
    });
    storeInfo = { dir: storeDir, run_id: runId, recorded: count };
  }

  // ── foresight: gaps ahead ──
  // Pure downstream consumer of the results already computed above: surfaces the
  // archetype-required checkpoints the repo has no code for yet (the flag-by-absence
  // set) as forward-looking gaps, ordered by severity. It NEVER changes a grade or
  // the shippable gate — the gate math above is final. Fully sandboxed: any failure
  // here leaves the classic output exactly as it was.
  let gapReport = null;
  try {
    const gaps = selectGaps(results, checkpoints);
    if (gaps.length > 0) {
      const advice = await adviseGaps({ gaps, archetype: archetype.archetype });
      if (advice) gapReport = { source: advice.source, items: advice.items };
    }
  } catch { /* gaps are advisory — a stumble here must never break a verify run */ }

  // --html: write the visual report from the SAME data. Pure output surface — it
  // reads the results/rollup/gaps already computed and renders a standalone HTML
  // file; it never touches a grade or the gate. Sandboxed so a render error can't
  // fail the run.
  if (htmlOut) {
    try {
      const html = renderReport({
        project: repoPath.split(/[\\/]/).filter(Boolean).pop(),
        archetype: archetype.archetype,
        version: archetype.version,
        adapter: adapter.name ?? adapterName,
        model: adapterName === "claude" ? process.env.ANTHROPIC_MODEL ?? null : null,
        generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
        results,
        rollup,
        gaps: gapReport,
        checkpoints,
      });
      const dest = pathResolve(process.cwd(), htmlOut);
      writeFileSync(dest, html);
      if (!json) console.error(`\nwrote HTML report → ${dest}`);
    } catch (e) {
      console.error(`note: could not write HTML report: ${e.message ?? e}`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ archetype: archetype.archetype, version: archetype.version, adapter: adapter.name ?? adapterName, overrides_applied: appliedOverrides, results, rollup, gaps: gapReport, store: storeInfo }, null, 2));
    return shippable ? 0 : 1;
  }

  const out = [];
  out.push("");
  out.push(paint(useColor, COLORS.bold, `Forespec — ${archetype.archetype} v${archetype.version}`));
  out.push("");
  for (const r of results) {
    out.push(`${paint(useColor, COLORS.cyan, r.id)}  ${paint(useColor, COLORS.dim, `[${r.domain}/${r.severity}]`)}`);
    if (r.error) {
      out.push(`  ${paint(useColor, COLORS.red, "could not grade")}: ${r.error}`);
      out.push("");
      continue;
    }
    if (r.applicable === false) {
      // Two different claims, two different sentences: a structural N/A means selection found
      // nothing; a challenged N/A means code MATCHED but the model justified (under adversarial
      // re-interrogation) that it's unrelated. Conflating them overstates the first as proof.
      out.push(`  ${paint(useColor, COLORS.dim, r.challenged
        ? "n/a — matched code was judged unrelated (verdict survived the adversarial challenge)"
        : "n/a — no code relevant to this checkpoint in the repo")}`);
      out.push("");
      continue;
    }
    const conf = typeof r.confidence === "number" ? r.confidence.toFixed(2) : r.confidence;
    out.push(`  ${levelTag(r.level, useColor)}  ${paint(useColor, COLORS.dim, `(confidence: ${conf}, via ${r.adapter})`)}`);
    if (r.rationale) out.push(`  ${paint(useColor, COLORS.dim, "why:")} ${r.rationale}`);
    if (r.gap) out.push(`  ${paint(useColor, COLORS.bold, "gap:")} ${r.gap}`);
    out.push("");
  }
  out.push(paint(useColor, COLORS.bold, "── goal_definition roll-up ──"));
  if (gateDemotion) {
    out.push(`  ${paint(useColor, COLORS.yellow, `⚠ gate demoted ${gateDemotion.from} → ${gateDemotion.to}:`)} ${gateDemotion.reason}. The ${gateDemotion.from} tier was NOT cleared — it was never assessed.`);
  }
  if (!conclusive) {
    out.push(`  ${paint(useColor, COLORS.yellow, "INCONCLUSIVE")} — nothing gradable was found here (every checkpoint N/A or errored). This is NOT a pass.`);
  } else {
    out.push(`  shippable (all ${gateTier} ≥ 6): ${shippable ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.red, "NO")}`);
    out.push(`  great (all ${gateTier} 9, rest ≥ 6): ${great ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.dim, "no")}`);
  }
  if (adapterDegraded) {
    out.push(`  ${paint(useColor, COLORS.yellow, "⚠ graded by the mock keyword baseline (no API key)")} — NOT the validated reasoning verifier. Do not trust this verdict for a ship decision.`);
  }
  if (blocking.length) {
    out.push(`  ${paint(useColor, COLORS.red, `blocking ${gateTier}:`)}`);
    for (const r of blocking) out.push(`    - ${r.id} (${r.level == null ? "ungraded" : "level " + r.level})`);
  }
  if (ungraded.length) out.push(`  ${paint(useColor, COLORS.yellow, "ungraded:")} ${ungraded.map((r) => r.id).join(", ")}`);
  if (notApplicable.length) out.push(`  ${paint(useColor, COLORS.dim, `not applicable (${notApplicable.length}):`)} ${notApplicable.map((r) => r.id + (r.challenged ? " (challenged)" : "")).join(", ")}`);
  // Whole-domain omission is part of the verdict (computed once, shared with JSON/HTML).
  if (designSkipped.length) {
    out.push(`  ${paint(useColor, COLORS.yellow, `⚠ ${designSkipped.length} design checkpoint(s) NOT reviewed here:`)} ${designSkipped.join(", ")}`);
    out.push(`    ${paint(useColor, COLORS.dim, "design isn't reliably gradable from source, so verify skips it. For a design/a11y verdict — a portfolio's whole product — run `forespec design <url>` against the live page (or `verify --domain all` for a best-effort source read).")}`);
  }
  if (gapReport && gapReport.items.length) {
    out.push("");
    out.push(paint(useColor, COLORS.bold, "── foresight: gaps ahead ──"));
    out.push(`  ${paint(useColor, COLORS.dim, "required by this archetype, no code for it yet — surface early, fill deliberately:")}`);
    for (const it of gapReport.items) {
      const tag = it.urgency === "now" ? paint(useColor, COLORS.yellow, "[now] ") : paint(useColor, COLORS.cyan, "[soon]");
      out.push("");
      out.push(`  ${tag} ${paint(useColor, COLORS.bold, it.headline)}  ${paint(useColor, COLORS.dim, `(${it.id}, ${it.severity})`)}`);
      if (it.why_your_archetype) out.push(`       ${paint(useColor, COLORS.dim, "why:")} ${it.why_your_archetype}`);
      if (it.what_good_looks_like) out.push(`       ${paint(useColor, COLORS.dim, "built right:")} ${it.what_good_looks_like}`);
    }
  }
  console.log(out.join("\n"));
  if (storeInfo) {
    console.error(`\nrecorded ${storeInfo.recorded} prediction(s) → ${storeInfo.dir} (run ${storeInfo.run_id})`);
    console.error(`  give a flag a verdict: node repo-verify/feedback.mjs <checkpoint-id> hit|false-positive|over-severe|ignored`);
  }

  return shippable ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`fatal: ${err?.message ?? err}`);
    process.exit(2);
  },
);
