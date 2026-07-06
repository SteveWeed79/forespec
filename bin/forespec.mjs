#!/usr/bin/env node
// forespec — one entrypoint for the whole tool, so a non-CLI user types one word.
//
//   npx forespec start "<what you're building>"  new/empty repo: declare it → archetype + plan
//   npx forespec init [repo]      existing repo: detect the archetype and write foresight.config.json
//   npx forespec plan "<feature>" interrogate a feature BEFORE building it; emit a spec
//   npx forespec verify [repo]    grade the repo's backbone against its archetype
//   npx forespec gate [options]   the PR/CI gate (grade the diff, comment, calibrate)
//
// `start` is the greenfield on-ramp: an empty repo has no code to detect, so you DECLARE
// what you're building and it points you — writing the archetype config and a build-order
// checklist your AI coder works through. `init` is the same landing for a repo that already
// has code (it detects instead of declaring). Everything after reads the config, so
// onboarding is a one-time step, not a flag you retype.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAuto, archetypeFromIntent, discoverManifests } from "../repo-verify/detect.mjs";
import { writeConfig, readConfig, CONFIG_FILE } from "../repo-verify/config.mjs";
import { resolveArchetype } from "../library/resolve.mjs";
import { selectForFeature, renderPlan } from "../repo-verify/plan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = pathResolve(here, "..");
const rv = (f) => join(projectDir, "repo-verify", f);

const PASSTHROUGH = {
  detect: rv("detect.mjs"),
  plan: rv("plan.mjs"),
  verify: rv("verify.mjs"),
  design: rv("design-probe.mjs"),
  gate: rv("pr-gate.mjs"),
  feedback: rv("feedback.mjs"),
  calibrate: rv("calibrate.mjs"),
  proficiency: rv("proficiency.mjs"),
};

const HELP = `forespec — force domain foresight before you build, then keep it live as you build.

Usage: forespec <command> [options]

Commands:
  start "<what you're building>"   New/empty repo: declare it → archetype + build-order checklist
  init [repo]        Existing repo: detect the archetype and write ${CONFIG_FILE}
  plan "<feature>"   Interrogate a feature BEFORE building it; emit a spec
  verify [repo]      Grade the repo's backbone against its archetype
  design <url>       Grade a live page's design in a headless browser (Playwright)
  gate [options]     PR/CI gate: grade the diff, post a comment, feed calibration
  detect [repo]      Show the archetype ranking (read-only, writes nothing)
  feedback <id> <outcome>   Record a verdict on a flag (hit|false-positive|over-severe|ignored)
  calibrate [accept|reset]  Review or apply proposed severity deltas
  proficiency        Your self-facing per-domain read (tunes how much I explain)

  -v, --version      Print the installed forespec version

Point → build → verify → correct. New repo? Start with: forespec start "…"`;

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (r.error) { console.error(`fatal: ${r.error.message}`); return 2; }
  return r.status ?? 1;
}

function version() {
  try {
    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const argVal = (args, flag) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

/**
 * `start` — the greenfield on-ramp. An empty repo has nothing to detect, so you DECLARE
 * what you're building; the archetype comes from your words (or --archetype). It writes the
 * config AND a build-order checklist (the whole backbone, most-foundational first) your AI
 * coder works through — so you're never pointed at a blank repo and left alone.
 */
async function start(args) {
  const VAL_FLAGS = ["--repo", "--archetype"];
  const description = args.filter((a, i) => !a.startsWith("-") && !VAL_FLAGS.includes(args[i - 1])).join(" ").trim();
  if (!description) {
    console.error('error: missing "<what you\'re building>"\n');
    console.error('e.g.  forespec start "an online store with checkout"');
    return 2;
  }
  const repoRoot = pathResolve(process.cwd(), argVal(args, "--repo") ?? ".");
  const manifests = discoverManifests(projectDir);
  if (manifests.length === 0) { console.error("No archetype manifests found."); return 1; }

  const override = argVal(args, "--archetype");
  let archetypeName, via, ranked = null;
  if (override) {
    const norm = override.replace(/^archetype\./, "").replace(/\.json$/, "");
    const m = manifests.find((x) => x.archetype === norm || x.file === override || x.file === `archetype.${norm}.json`);
    if (!m) { console.error(`error: no archetype "${override}". Available: ${manifests.map((x) => x.archetype).join(", ")}`); return 2; }
    archetypeName = m.archetype; via = "declared";
  } else {
    ranked = archetypeFromIntent(description, manifests.map((m) => m.archetype));
    const top = ranked[0];
    if (!top || top.confidence === "none") {
      console.log(`\n🔭 forespec start — ${repoRoot}\n`);
      console.log(`Couldn't tell what you're building from "${description}". Say which kind it is:`);
      for (const m of manifests) console.log(`  forespec start "${description}" --archetype ${m.archetype}`);
      return 1;
    }
    archetypeName = top.archetype; via = "intent";
  }

  const manifest = manifests.find((m) => m.archetype === archetypeName);
  let archetype;
  try { archetype = resolveArchetype(join(projectDir, manifest.file)); }
  catch (e) { console.error(`error: ${e.message}`); return 2; }

  // Declare the archetype — the config every later command reads.
  const existing = readConfig(repoRoot);
  const cfgPath = writeConfig(repoRoot, {
    schema: "foresight/config/v1",
    archetype: manifest.file,
    declared: { archetype: archetypeName, via, description },
    created: new Date().toISOString(),
  });

  // The plan IS the build order: the whole backbone, most-foundational first, as a committed
  // checklist your AI coder builds through and `verify` grades against.
  const { relevant, mustHold } = selectForFeature(archetype.checkpoints, description, { domain: "backbone" });
  const md = renderPlan({ archetype, feature: description, relevant, mustHold });
  writeFileSync(join(repoRoot, "forespec-plan.md"), md.endsWith("\n") ? md : md + "\n");
  const total = relevant.length + mustHold.length;

  console.log(`\n🔭 forespec start — ${repoRoot}\n`);
  console.log(`Building: ${description}`);
  console.log(`Archetype: ${archetypeName}` + (via === "intent" ? "  (inferred — --archetype to override)" : "  (declared)"));
  if (ranked && ranked[0]?.matched?.length) console.log(`  why: ${ranked[0].matched.join(", ")}`);
  console.log("");
  console.log(`${existing ? "Updated" : "Wrote"}  ${CONFIG_FILE}   → so verify/gate grade against ${archetypeName}`);
  console.log(`Wrote  forespec-plan.md   → your build order: ${total} checkpoint(s), most-foundational first`);
  console.log("");
  console.log("Next — the foresight rides along, it doesn't stop here:");
  console.log("  1. Hand forespec-plan.md to your AI coder. Build item #1 first (the dangerous/foundational one).");
  console.log("  2. As you build, run `forespec verify` — it grades these same checkpoints and shows what's still open.");
  console.log("  3. Open a PR — `forespec gate` tracks how each item moved vs your last run (catches regressions).");
  return 0;
}

async function init(args) {
  const positional = args.find((a) => !a.startsWith("-"));
  const repoRoot = pathResolve(process.cwd(), positional ?? ".");
  const { ranked, ai } = await detectAuto({ repoRoot, projectDir, useAI: !args.includes("--no-ai") });

  if (ranked.length === 0) {
    console.error("No archetype manifests found to match against.");
    return 1;
  }

  console.log(`\n🔭 forespec init — ${repoRoot}\n`);
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const mark = i === 0 ? "→" : " ";
    const conf = i === 0 ? `  (${r.confidence}${r.source === "ai" ? ", via AI" : ""})` : "";
    console.log(`${mark} ${r.archetype.padEnd(11)} score ${String(r.score).padStart(2)}${conf}`);
    if (r.matched.length) console.log(`    why: ${r.matched.join(", ")}`);
  }
  console.log("");
  if (ai.used) console.log(`AI tie-breaker: ${ai.rationale}\n`);

  const top = ranked[0];
  if ((top.score === 0 || top.confidence === "none") && !ai.used) {
    if (ai.decided_none) console.log(`AI also saw no clear fit: ${ai.rationale}`);
    else if (!ai.available) console.log("Ambiguous — set ANTHROPIC_API_KEY + ANTHROPIC_MODEL to let one AI call break the tie, or pick manually:");
    console.log("Couldn't detect a clear fit — a new/empty repo often has no code to read yet.");
    console.log('For a new project, DECLARE what you\'re building instead:');
    console.log('  forespec start "an online store with checkout"');
    console.log(`Or pick one explicitly:  forespec init --no-ai  then  echo '{ "archetype": "${ranked[0].manifest}" }' > ${CONFIG_FILE}`);
    return 1;
  }

  const existing = readConfig(repoRoot);
  const config = {
    schema: "foresight/config/v1",
    archetype: top.manifest,
    detected: { archetype: top.archetype, confidence: top.confidence, score: top.score, via: top.source === "ai" ? "ai" : "heuristic" },
    created: new Date().toISOString(),
  };
  const path = writeConfig(repoRoot, config);
  console.log(`${existing ? "Updated" : "Wrote"} ${path} → archetype: ${top.archetype}` + (top.confidence === "low" ? "  (low confidence — sanity-check it)" : ""));
  console.log("Commit it so CI grades against the same archetype. Next:");
  console.log("  forespec plan \"<your next feature>\"   # interrogate it before you build");
  console.log("  forespec verify                        # grade your backbone now");
  console.log("  forespec gate --help                   # wire the PR gate into CI");
  return 0;
}

async function dispatch() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") { console.log(HELP); return 0; }
  if (cmd === "-v" || cmd === "--version" || cmd === "version") { console.log(version()); return 0; }
  if (cmd === "start") return await start(rest);
  if (cmd === "init") return await init(rest);
  if (PASSTHROUGH[cmd]) return run(PASSTHROUGH[cmd], rest);
  console.error(`unknown command: ${cmd}\n`);
  console.error(HELP);
  return 2;
}

dispatch().then((c) => process.exit(c), (e) => { console.error(`fatal: ${e?.message ?? e}`); process.exit(2); });
