#!/usr/bin/env node
// forespec calibrate — propose severity deltas from accumulated outcomes
// (calibration brick 3). Pure analysis of the local store; no model calls.
//
// It does NOT overwrite anything. It reads predictions + your recorded outcomes
// (from `feedback`), aggregates them per checkpoint, and proposes deltas WITH the
// evidence behind them — which you accept one at a time. Accepted deltas land in a
// local overrides file the verifier applies on top of the archetype, so the shared
// library stays pristine and the tuning is earned + reversible. (Per
// forespec.calibration-1.md: "calibration does not overwrite weights directly; it
// produces proposed deltas with the evidence behind them.")
//
// Usage:
//   node repo-verify/calibrate.mjs                      # show proposals
//   node repo-verify/calibrate.mjs --json
//   node repo-verify/calibrate.mjs accept <checkpoint> [severity]
//   node repo-verify/calibrate.mjs reset  <checkpoint>  # drop an override
//
// Options: --store <dir> (default ./.forespec), --min <n> (min evidence, default 3)

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPredictions, readOutcomes, readOverrides, writeOverrides } from "./store.mjs";

export const SEVERITY_TIERS = ["low", "medium", "high", "critical"];

export function tierShift(sev, dir) {
  const i = SEVERITY_TIERS.indexOf(sev);
  if (i === -1) return sev;
  return SEVERITY_TIERS[Math.max(0, Math.min(SEVERITY_TIERS.length - 1, i + dir))];
}

/** Join recorded outcomes to checkpoints; current severity from the latest prediction. */
export function aggregate({ storeDir }) {
  const preds = readPredictions({ storeDir });
  const outs = readOutcomes({ storeDir });
  const byCp = {};
  for (const o of outs) {
    const cp = (byCp[o.checkpoint_id] ??= {
      hit: 0, "false-positive": 0, "over-severe": 0, ignored: 0, total: 0, sources: {},
    });
    if (o.outcome in cp) cp[o.outcome]++;
    cp.total++;
    cp.sources[o.source] = (cp.sources[o.source] ?? 0) + 1;
  }
  for (const p of preds) if (byCp[p.checkpoint_id]) byCp[p.checkpoint_id].current_severity = p.severity;
  return byCp;
}

/**
 * Turn tallies into proposals. Transparent rules (no hidden weights):
 *  - mostly false-positive / over-severe → propose lowering severity one tier
 *  - mostly hit                          → propose raising severity one tier
 *  - too few outcomes                    → watch (never propose on thin evidence)
 *  - mixed                               → stable
 */
export function propose(byCp, minEvidence = 3) {
  const out = [];
  for (const [checkpoint, a] of Object.entries(byCp)) {
    const down = a["false-positive"] + a["over-severe"];
    const up = a.hit;
    const cur = a.current_severity ?? "unknown";
    const evidence = {
      hit: a.hit, false_positive: a["false-positive"], over_severe: a["over-severe"],
      ignored: a.ignored, total: a.total, sources: a.sources,
    };
    if (a.total < minEvidence) {
      out.push({ checkpoint, action: "watch", reason: `only ${a.total} outcome(s); need ${minEvidence}`, evidence });
    } else if (down >= up * 2 && down >= minEvidence) {
      out.push({ checkpoint, action: "lower-severity", from: cur, to: tierShift(cur, -1), strength: a.total >= 6 ? "medium" : "low", reason: `${down} over-fire/over-severe vs ${up} hit`, evidence });
    } else if (up >= down * 2 && up >= minEvidence) {
      out.push({ checkpoint, action: "raise-severity", from: cur, to: tierShift(cur, +1), strength: a.total >= 6 ? "medium" : "low", reason: `${up} hit vs ${down} over-fire`, evidence });
    } else {
      out.push({ checkpoint, action: "stable", reason: `mixed (${up} hit / ${down} down)`, evidence });
    }
  }
  return out;
}

const HELP = `forespec calibrate — propose severity deltas from recorded outcomes.

Usage:
  node repo-verify/calibrate.mjs                    show proposals
  node repo-verify/calibrate.mjs --json             machine-readable
  node repo-verify/calibrate.mjs accept <cp> [sev]  accept a delta (sev optional → use proposed)
  node repo-verify/calibrate.mjs reset  <cp>        drop an override

Options:
  --store <dir>   calibration store (default: ./.forespec)
  --min <n>       minimum outcomes before proposing (default: 3)

Nothing changes until you accept. Accepted deltas go to <store>/overrides.json,
which the verifier applies on top of the archetype (reversible with reset).`;

function arg(flag, fb) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb;
}
const has = (f) => process.argv.includes(f);

function main() {
  if (has("-h") || has("--help")) { console.log(HELP); return 0; }
  const storeDir = resolve(process.cwd(), arg("--store", ".forespec"));
  const minEvidence = Number(arg("--min", "3")) || 3;
  const json = has("--json");
  const valueFlags = ["--store", "--min"];
  const positionals = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("-") && !valueFlags.includes(arr[i - 1]));
  const sub = positionals[0];

  if (sub === "accept" || sub === "reset") {
    const checkpoint = positionals[1];
    if (!checkpoint) { console.error("error: need a checkpoint id"); return 2; }
    const overrides = readOverrides({ storeDir });
    if (sub === "reset") {
      delete overrides.severity[checkpoint];
      overrides.log.push({ ts: new Date().toISOString(), checkpoint, action: "reset" });
      writeOverrides({ storeDir, overrides });
      console.log(`reset override for ${checkpoint}`);
      return 0;
    }
    const byCp = aggregate({ storeDir });
    const p = propose(byCp, minEvidence).find((x) => x.checkpoint === checkpoint);
    let sev = positionals[2] ?? p?.to;
    if (!sev) { console.error(`error: no proposed severity for ${checkpoint}; pass one: accept ${checkpoint} <${SEVERITY_TIERS.join("|")}>`); return 2; }
    if (!SEVERITY_TIERS.includes(sev)) { console.error(`error: severity must be one of: ${SEVERITY_TIERS.join(", ")}`); return 2; }
    const from = p?.from ?? byCp[checkpoint]?.current_severity ?? "unknown";
    overrides.severity[checkpoint] = sev;
    overrides.log.push({ ts: new Date().toISOString(), checkpoint, from, to: sev, evidence: p?.evidence ?? null, source: "calibrate-accept" });
    writeOverrides({ storeDir, overrides });
    console.log(`accepted: ${checkpoint} severity ${from} → ${sev}\n  saved to ${storeDir}/overrides.json — verify will apply it (reversible: calibrate reset ${checkpoint})`);
    return 0;
  }

  const proposals = propose(aggregate({ storeDir }), minEvidence);
  if (json) { console.log(JSON.stringify({ store: storeDir, min_evidence: minEvidence, proposals }, null, 2)); return 0; }
  if (proposals.length === 0) {
    console.log(`No outcomes recorded yet in ${storeDir}.\nRun verify, record verdicts with \`feedback\`, then come back.`);
    return 0;
  }
  console.log(`Calibration proposals (store: ${storeDir}, min evidence ${minEvidence}):\n`);
  for (const p of proposals) {
    const e = p.evidence;
    const tag = p.action === "lower-severity" ? "⬇" : p.action === "raise-severity" ? "⬆" : p.action === "watch" ? "·" : "=";
    console.log(`${tag} ${p.checkpoint}`);
    if (p.to) console.log(`    propose severity ${p.from} → ${p.to}  [${p.strength} confidence]`);
    console.log(`    ${p.reason}`);
    console.log(`    evidence: ${e.hit} hit / ${e.false_positive} false-pos / ${e.over_severe} over-severe / ${e.ignored} ignored (n=${e.total}); sources ${JSON.stringify(e.sources)}`);
    if (p.to) console.log(`    accept: node repo-verify/calibrate.mjs accept ${p.checkpoint}`);
    console.log("");
  }
  console.log("Nothing changes until you accept. Accepted deltas tune this project locally (overrides.json), reversible with `reset`.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
