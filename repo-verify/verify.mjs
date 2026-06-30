#!/usr/bin/env node
// Foresight repo verifier — grade a WHOLE real repo against an archetype.
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
//   --json               Emit machine-readable JSON
//   -h, --help

import { resolve as pathResolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { loadRepo, selectForCheckpoint } from "./select.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

const HELP = `Foresight repo verifier — grade a whole repo against an archetype.

Usage:
  node repo-verify/verify.mjs <repo-path> [options]

Options:
  --archetype <file>   Archetype manifest (default: archetype.ecommerce.json)
  --domain <d>         backbone | design | all (default: backbone)
  --checkpoint <id>    Grade a single checkpoint by id
  --adapter <name>     mock | claude (default: claude if ANTHROPIC_API_KEY+ANTHROPIC_MODEL set, else mock)
  --budget <chars>     Per-checkpoint context budget (default: 60000)
  --json               Machine-readable JSON
  -h, --help           This help

The claude adapter reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from the environment.`;

const COLORS = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
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
    return !["--archetype", "--domain", "--checkpoint", "--adapter", "--budget"].includes(prev);
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

  const archetypeArg = arg("--archetype", null);
  const archetypePath = archetypeArg
    ? pathResolve(process.cwd(), archetypeArg)
    : pathResolve(here, "..", "archetype.ecommerce.json");

  let archetype;
  try {
    archetype = resolveArchetype(archetypePath);
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }

  const domain = arg("--domain", "backbone");
  const onlyId = arg("--checkpoint", null);
  const budget = Number(arg("--budget", "60000")) || 60_000;
  const json = has("--json");

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
  if (!json) {
    if (note) console.error(`note: ${note}\n`);
    console.error(`Verifying ${repoPath}`);
    console.error(`  ${archetype.archetype} v${archetype.version} | adapter: ${adapter.name ?? adapterName} | ${checkpoints.length} checkpoint(s)\n`);
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
    const { files, code } = selectForCheckpoint(allFiles, cp, budget);
    try {
      const v = await adapter.verify({ checkpoint: cp, code });
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        level: v.level, confidence: v.confidence, gap: v.gap, rationale: v.rationale,
        evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, error: null,
      });
    } catch (e) {
      results.push({
        id: cp.id, domain: cp.domain, severity: cp.severity,
        level: null, confidence: null, gap: null, rationale: null,
        evidence: files.map((f) => f.path), adapter: adapter.name ?? adapterName, error: String(e.message ?? e),
      });
    }
  }

  // goal_definition roll-up. shippable = every critical checkpoint graded at >= 6.
  const critical = results.filter((r) => r.severity === "critical");
  const others = results.filter((r) => r.severity !== "critical");
  const ungraded = results.filter((r) => r.level == null);
  const lvl = (r) => (r.level == null ? -1 : r.level);
  const shippable = ungraded.length === 0 && critical.every((r) => lvl(r) >= 6);
  const great = ungraded.length === 0 && critical.every((r) => lvl(r) >= 9) && others.every((r) => lvl(r) >= 6);
  const blocking = critical.filter((r) => lvl(r) < 6);

  if (json) {
    console.log(JSON.stringify({ archetype: archetype.archetype, version: archetype.version, adapter: adapter.name ?? adapterName, results, rollup: { shippable, great, blocking: blocking.map((r) => r.id), ungraded: ungraded.map((r) => r.id) } }, null, 2));
    return shippable ? 0 : 1;
  }

  const out = [];
  out.push("");
  out.push(paint(useColor, COLORS.bold, `Foresight — ${archetype.archetype} v${archetype.version}`));
  out.push("");
  for (const r of results) {
    out.push(`${paint(useColor, COLORS.cyan, r.id)}  ${paint(useColor, COLORS.dim, `[${r.domain}/${r.severity}]`)}`);
    if (r.error) {
      out.push(`  ${paint(useColor, COLORS.red, "could not grade")}: ${r.error}`);
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
  out.push(`  shippable (all critical ≥ 6): ${shippable ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.red, "NO")}`);
  out.push(`  great (all critical 9, rest ≥ 6): ${great ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.dim, "no")}`);
  if (blocking.length) {
    out.push(`  ${paint(useColor, COLORS.red, "blocking critical:")}`);
    for (const r of blocking) out.push(`    - ${r.id} (${r.level == null ? "ungraded" : "level " + r.level})`);
  }
  if (ungraded.length) out.push(`  ${paint(useColor, COLORS.yellow, "ungraded:")} ${ungraded.map((r) => r.id).join(", ")}`);
  console.log(out.join("\n"));

  return shippable ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`fatal: ${err?.message ?? err}`);
    process.exit(2);
  },
);
