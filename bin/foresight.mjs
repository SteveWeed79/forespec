#!/usr/bin/env node
// foresight — one entrypoint for the whole tool, so a non-CLI user types one word.
//
//   npx foresight init [repo]      detect the archetype and write foresight.config.json
//   npx foresight verify [repo]    grade the repo's backbone against its archetype
//   npx foresight gate [options]   the PR/CI gate (grade the diff, comment, calibrate)
//   npx foresight detect [repo]    show the archetype ranking without writing config
//   npx foresight feedback ...     record a verdict on a flag
//   npx foresight calibrate ...    review/accept proposed severity deltas
//
// `init` is the onboarding step: it runs detection, writes the project's archetype
// choice once, and every later command reads it — no flags to retype. The other
// commands are thin pass-throughs to the existing scripts (which read the config
// themselves), so they work the same whether invoked here or directly.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "../repo-verify/detect.mjs";
import { writeConfig, readConfig, CONFIG_FILE } from "../repo-verify/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = pathResolve(here, "..");
const rv = (f) => join(projectDir, "repo-verify", f);

const PASSTHROUGH = {
  detect: rv("detect.mjs"),
  plan: rv("plan.mjs"),
  verify: rv("verify.mjs"),
  gate: rv("pr-gate.mjs"),
  feedback: rv("feedback.mjs"),
  calibrate: rv("calibrate.mjs"),
};

const HELP = `foresight — plan with domain foresight, then verify what got built.

Usage: foresight <command> [options]

Commands:
  init [repo]        Detect the archetype for a repo and write ${CONFIG_FILE}
  plan "<feature>"   Interrogate a feature BEFORE building it; emit a spec
  verify [repo]      Grade the repo's backbone against its archetype
  gate [options]     PR/CI gate: grade the diff, post a comment, feed calibration
  detect [repo]      Show the archetype ranking (read-only, writes nothing)
  feedback <id> <outcome>   Record a verdict on a flag (hit|false-positive|over-severe|ignored)
  calibrate [accept|reset]  Review or apply proposed severity deltas

Plan → build → verify → correct. Start with: foresight init`;

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (r.error) { console.error(`fatal: ${r.error.message}`); return 2; }
  return r.status ?? 1;
}

function init(args) {
  const positional = args.find((a) => !a.startsWith("-"));
  const repoRoot = pathResolve(process.cwd(), positional ?? ".");
  const { ranked } = detect({ repoRoot, projectDir });

  if (ranked.length === 0) {
    console.error("No archetype manifests found to match against.");
    return 1;
  }

  console.log(`\n🔭 foresight init — ${repoRoot}\n`);
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const mark = i === 0 ? "→" : " ";
    const conf = i === 0 ? `  (${r.confidence})` : "";
    console.log(`${mark} ${r.archetype.padEnd(11)} score ${String(r.score).padStart(2)}${conf}`);
    if (r.matched.length) console.log(`    why: ${r.matched.join(", ")}`);
  }
  console.log("");

  const top = ranked[0];
  if (top.score === 0 || top.confidence === "none") {
    console.log("Couldn't detect a clear fit. Pick one and write it yourself, e.g.:");
    console.log(`  echo '{ "archetype": "${ranked[0].manifest}" }' > ${CONFIG_FILE}`);
    return 1;
  }

  const existing = readConfig(repoRoot);
  const config = {
    schema: "foresight/config/v1",
    archetype: top.manifest,
    detected: { archetype: top.archetype, confidence: top.confidence, score: top.score },
    created: new Date().toISOString(),
  };
  const path = writeConfig(repoRoot, config);
  console.log(`${existing ? "Updated" : "Wrote"} ${path} → archetype: ${top.archetype}` + (top.confidence === "low" ? "  (low confidence — sanity-check it)" : ""));
  console.log("Commit it so CI grades against the same archetype. Next:");
  console.log("  foresight verify          # grade your backbone now");
  console.log("  foresight gate --help     # wire the PR gate into CI");
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
  console.log(HELP);
  process.exit(0);
}
if (cmd === "init") {
  process.exit(init(rest));
}
if (PASSTHROUGH[cmd]) {
  process.exit(run(PASSTHROUGH[cmd], rest));
}
console.error(`unknown command: ${cmd}\n`);
console.error(HELP);
process.exit(2);
