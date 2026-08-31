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
import { renderVerifyText } from "./render-cli.mjs";
import { pickAdapter, noVerifierMessage } from "./verifier-choice.mjs";

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
  --adapter <name>     agent | claude | mock (default: agent if --verdicts/FORESPEC_VERDICTS,
                       else claude if ANTHROPIC_API_KEY+ANTHROPIC_MODEL set. With neither,
                       verify REFUSES rather than grading with something it can't trust.
                       'mock' is the keyword baseline and must be asked for by name.)
  --verdicts <file>    Agent-written verdicts to grade from (implies --adapter agent)
  --budget <chars>     Per-checkpoint context budget (default: 60000)
  --store <dir>        Calibration store dir for the prediction log (default: ./.forespec)
  --no-store           Don't record this run to the calibration store
  --json               Machine-readable JSON
  --html [path]        Also write a visual HTML report (default: forespec-report.html)
  -h, --help           This help

The agent adapter takes verdicts from the coding agent you're already in — no API key, no
metered cost. Install the Claude Code plugin and run /forespec:verify, or see
docs/claude-code-plugin.md to drive it from any agent.
The claude adapter reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from the environment.
Every run is logged to the calibration store (pattern + instance — the wall is physical);
record a verdict on a flag with: node repo-verify/feedback.mjs <checkpoint-id> <outcome>`;

const SEV_ORDER = ["critical", "high", "medium", "low"];

async function main() {
  if (has("-h") || has("--help")) {
    console.log(HELP);
    return 0;
  }

  const positionals = process.argv.slice(2).filter((a, i, arr) => {
    if (a.startsWith("-")) return false;
    const prev = arr[i - 1];
    return !["--archetype", "--domain", "--checkpoint", "--adapter", "--budget", "--store", "--html", "--verdicts"].includes(prev);
  });
  // Default to the current directory, matching `forespec init`/`start`: a bare
  // `forespec verify` grades the repo you're standing in. (First-run friction —
  // `init` defaults to cwd, so users reasonably expect `verify` to as well.)
  const repoArg = positionals[0] ?? ".";

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

  // The silent-downgrade trap: a rotated/missing key must NEVER quietly swap the trusted
  // reasoning verifier for the keyword mock. Refusing outright is the only version of that
  // guarantee a first-time user actually experiences — a warning above a page of red
  // keyword findings gets read as a verdict no matter how it's labelled.
  const { name: adapterName, explicit: adapterExplicit, trusted, reason } = pickAdapter((f) => arg(f, null));
  if (!adapterName) {
    console.error(noVerifierMessage({ reason }));
    return 2;
  }
  let adapter;
  try {
    adapter = await import(new URL(`../verifier-eval/adapters/${adapterName}.mjs`, import.meta.url));
  } catch (e) {
    console.error(`error: could not load adapter "${adapterName}": ${e.message}`);
    return 2;
  }

  const useColor = process.stdout.isTTY === true && !json;
  // An explicitly-chosen untrusted adapter (`--adapter mock`) is still degraded — the caller
  // asked for the baseline, but the output must keep saying so on every surface, json included.
  const adapterDegraded = !trusted;
  if (adapterDegraded) {
    console.error(
      `note: adapter "${adapterName}" is not a grader to trust — it exists to exercise the ` +
        `harness and to be the dumb baseline a real verifier must beat. Do not gate a merge ` +
        `or a ship decision on it.\n`,
    );
  }
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
    //
    // Exception: an adapter that did its OWN repo search (the agent adapter greps and reads
    // rather than consuming `select.mjs`'s output) may have found the subject in a file the
    // keyword ranker missed. Its verdict is better evidence than this heuristic, so it wins.
    if (!matched && !adapter.hasVerdict?.(cp.id)) {
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
      //
      // An adapter serving verdicts it already committed to (agent) is exempt: re-asking
      // returns the identical record, so the flag would claim an adversarial re-pass that
      // never happened. Those adapters carry the challenge in their own grading contract.
      let challenged = false;
      if (v.applicable === false && !adapter.selfChallenged) {
        challenged = true;
        v = await adapter.verify({ checkpoint: cp, code, challenge: true });
      }
      const applicable = v.applicable !== false; // mock adapter omits applicable → treat as applicable
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        applicable, level: applicable ? v.level : null, challenged,
        confidence: v.confidence, gap: v.gap, rationale: v.rationale,
        // An adapter that navigated the repo itself can cite the exact `file:line`; the
        // selection's file list is the fallback for one that only ever saw a packed blob.
        evidence: v.evidence?.length ? v.evidence : files.map((f) => f.path),
        adapter: adapter.name ?? adapterName, fingerprint: fp, error: null,
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

  console.log(renderVerifyText({ archetype, results, rollup, gaps: gapReport, useColor }));
  if (storeInfo) {
    console.error(`\nrecorded ${storeInfo.recorded} prediction(s) → ${storeInfo.dir} (run ${storeInfo.run_id})`);
    console.error(`  give a flag a verdict: node repo-verify/feedback.mjs <checkpoint-id> hit|false-positive|over-severe|ignored`);
  }

  return shippable ? 0 : 1;
}

// Set exitCode and let the event loop drain rather than process.exit(): a hard
// exit force-closes undici's (global fetch) keep-alive socket mid-teardown, which
// trips a libuv assertion on Windows (async.c: !UV_HANDLE_CLOSING) after the run
// has already finished. Idle undici sockets are unref'd, so the process still
// exits promptly — just without the double-close race.
main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    console.error(`fatal: ${err?.message ?? err}`);
    process.exitCode = 2;
  },
);
