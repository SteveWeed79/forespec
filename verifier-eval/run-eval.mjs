#!/usr/bin/env node
// Foresight verifier-accuracy harness.
//
// Runs a verifier adapter over the labeled fixture corpus and measures how well
// it matches the gold labels — with emphasis on the FALSE-GREEN rate (calling a
// known-bad implementation shippable), the dangerous error for a tool you trust.
//
// Usage:
//   node verifier-eval/run-eval.mjs                 # mock baseline (no API key needed)
//   node verifier-eval/run-eval.mjs --adapter claude
//   node verifier-eval/run-eval.mjs --adapter claude --out verifier-eval/report.json
//
// Exit code is non-zero if any fixture errored, so CI can catch a broken run.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const adapterName = arg("--adapter", "mock");
const outPath = arg("--out", null);

const manifest = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));
const archetype = JSON.parse(readFileSync(resolve(here, manifest.archetype), "utf8"));
const checkpointById = new Map(archetype.checkpoints.map((c) => [c.id, c]));

const adapter = await import(`./adapters/${adapterName}.mjs`);

// shippable = level >= 6; bucketing a 3/6/9 prediction into the goal_definition view.
const SHIPPABLE = 6;

const cases = [];
for (const c of manifest.cases) {
  const checkpoint = checkpointById.get(c.checkpoint);
  if (!checkpoint) {
    cases.push({ ...c, error: `checkpoint ${c.checkpoint} not found in archetype` });
    continue;
  }
  const code = readFileSync(join(here, c.fixture), "utf8");
  try {
    const verdict = await adapter.verify({ checkpoint, code, fixturePath: c.fixture });
    cases.push({ ...c, predicted_level: verdict.level, confidence: verdict.confidence, rationale: verdict.rationale });
  } catch (err) {
    cases.push({ ...c, error: String(err.message ?? err) });
  }
}

// ---- classify each case ----
function classify(c) {
  if (c.error) return "ERROR";
  const goldShippable = c.gold_level >= SHIPPABLE;
  const predShippable = c.predicted_level >= SHIPPABLE;
  if (goldShippable && predShippable) return "TP";       // correctly passed a good impl
  if (!goldShippable && !predShippable) return "TN";     // correctly caught a bad impl
  if (!goldShippable && predShippable) return "FALSE_GREEN"; // DANGEROUS: passed a bad impl
  return "FALSE_ALARM";                                  // flagged a good impl
}
for (const c of cases) c.outcome = classify(c);

// ---- metrics ----
function metricsFor(subset) {
  const scored = subset.filter((c) => c.outcome !== "ERROR");
  const errors = subset.length - scored.length;
  const tp = scored.filter((c) => c.outcome === "TP").length;
  const tn = scored.filter((c) => c.outcome === "TN").length;
  const fg = scored.filter((c) => c.outcome === "FALSE_GREEN").length;
  const fa = scored.filter((c) => c.outcome === "FALSE_ALARM").length;
  const goldBad = scored.filter((c) => c.gold_level < SHIPPABLE).length;
  const goldGood = scored.length - goldBad;
  const exact = scored.filter((c) => c.predicted_level === c.gold_level).length;
  const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
  return {
    n: subset.length, scored: scored.length, errors,
    tp, tn, false_green: fg, false_alarm: fa,
    accuracy_pct: pct(tp + tn, scored.length),
    false_green_rate_pct: pct(fg, goldBad),
    false_alarm_rate_pct: pct(fa, goldGood),
    exact_level_agreement_pct: pct(exact, scored.length),
  };
}

const overall = metricsFor(cases);
const perCheckpoint = {};
for (const id of new Set(cases.map((c) => c.checkpoint))) {
  perCheckpoint[id] = metricsFor(cases.filter((c) => c.checkpoint === id));
}

// ---- report ----
const report = {
  adapter: adapter.name ?? adapterName,
  model: adapterName === "claude" ? process.env.ANTHROPIC_MODEL ?? null : null,
  generated_at: new Date().toISOString(),
  overall,
  per_checkpoint: perCheckpoint,
  cases: cases.map((c) => ({
    checkpoint: c.checkpoint, label: c.label, gold_level: c.gold_level,
    predicted_level: c.predicted_level ?? null, outcome: c.outcome,
    rationale: c.rationale, error: c.error,
  })),
};

// ---- print ----
const pad = (s, n) => String(s ?? "").padEnd(n);
console.log(`\nForesight verifier eval — adapter: ${report.adapter}${report.model ? ` (${report.model})` : ""}`);
console.log("-".repeat(78));
console.log(`${pad("checkpoint", 34)} ${pad("case", 5)} ${pad("gold", 5)} ${pad("pred", 5)} outcome`);
for (const c of cases) {
  console.log(`${pad(c.checkpoint, 34)} ${pad(c.label, 5)} ${pad(c.gold_level, 5)} ${pad(c.predicted_level ?? "-", 5)} ${c.outcome}`);
}
console.log("-".repeat(78));
console.log(
  `overall: accuracy ${overall.accuracy_pct}%  |  ` +
  `FALSE-GREEN ${overall.false_green_rate_pct}% (${overall.false_green}/${overall.tn + overall.false_green} bad impls)  |  ` +
  `false-alarm ${overall.false_alarm_rate_pct}%  |  ` +
  `exact-level ${overall.exact_level_agreement_pct}%  |  errors ${overall.errors}`,
);
if (overall.false_green > 0) {
  console.log(`\n⚠️  ${overall.false_green} FALSE GREEN(S) — the verifier called a known-bad implementation shippable:`);
  for (const c of cases.filter((c) => c.outcome === "FALSE_GREEN")) {
    console.log(`   - ${c.checkpoint}: ${c.rationale ?? ""}`);
  }
}

if (outPath) {
  writeFileSync(resolve(process.cwd(), outPath), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outPath}`);
}

process.exit(overall.errors > 0 ? 1 : 0);
