// Proficiency layer (build-order Phase 5) — the differentiator: the tool adapts to WHO is
// using it. It estimates, per domain, how much demonstrated engagement + judgment you've
// shown, and uses that to dial explanation depth — carry you where you're learning, get
// out of the way where you're fluent.
//
// Three hard rules, straight from the spec:
//   1. REUSES the Phase 2 store — no new data collection. It's derived from outcomes you
//      already recorded.
//   2. ASYMMETRIC — precise language / good calls RAISE the estimate; terse or plain input
//      NEVER lowers it. (Plenty of strong builders are blunt.)
//   3. SELF-FACING ONLY — this is never written to the shareable pattern tier, never joins
//      a pool, never becomes a dossier scored for others' eyes. It's computed on demand,
//      locally, and only ever shown to you.
//
// It's an honest heuristic for tuning verbosity — "demonstrated engagement + judgment,"
// not a competence grade. The report says exactly that.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPredictions, readOutcomes, readOverrides, FILES } from "./store.mjs";

export const DOMAINS = ["backbone", "design"];

// Small per-domain lexicons. A NOTE that uses these precise terms is a signal of fluency.
// Absence is never a penalty (rule 2) — these can only add.
export const TERMS = {
  backbone: ["idempoten", "atomic", "race condition", "reconcil", "webhook signature", "idor",
    "transaction", "isolation", "optimistic lock", "rate limit", "constant-time", "replay",
    "tenant", "entitlement", "foreign key", "cascade", "nonce", "csrf"],
  design: ["contrast ratio", "wcag", "tap target", "modular scale", "line-height", "line height",
    "viewport", "breakpoint", "baseline grid", "type scale", "luminance", "focus state",
    "aria", "alt text", "rhythm", "leading", "tracking"],
};

const BASE = 0.2; // an empty store ⇒ "learning" everywhere ⇒ full explanations by default
const CAPS = { engagement: 0.3, judgment: 0.3, terminology: 0.2, overrides: 0.2 };

export function bandFor(score) {
  if (score >= 0.75) return "fluent";
  if (score >= 0.4) return "steady";
  return "learning";
}

const HIGH_RELIABILITY = new Set(["objective_outcome", "expert_rating", "self_observed"]);
const JUDGMENT_OUTCOMES = new Set(["false-positive", "over-severe"]); // nuanced calls that take understanding

function domainForId(id, map) {
  if (map.has(id)) return map.get(id);
  return /^(design|web)\./.test(id) ? "design" : "backbone";
}

function readInstanceOutcomes(storeDir) {
  const p = join(storeDir, FILES.outInstance);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * PURE: estimate per-domain proficiency from already-read records. Separated from I/O so
 * the asymmetric scoring is exhaustively testable.
 */
export function estimateFromRecords({ predictions = [], outcomesPattern = [], outcomesInstance = [], overridesLog = [] }) {
  const cpDomain = new Map();
  for (const p of predictions) if (p.checkpoint_id && p.domain) cpDomain.set(p.checkpoint_id, p.domain);

  const agg = {};
  for (const d of DOMAINS) agg[d] = { engagement: 0, judgment: 0, terms: new Set(), overrides: 0 };

  for (const o of outcomesPattern) {
    const d = domainForId(o.checkpoint_id, cpDomain);
    if (!agg[d]) continue;
    if (HIGH_RELIABILITY.has(o.source)) agg[d].engagement += 1;
    if (JUDGMENT_OUTCOMES.has(o.outcome)) agg[d].judgment += 1;
  }
  for (const o of outcomesInstance) {
    const d = domainForId(o.checkpoint_id, cpDomain);
    if (!agg[d] || !o.note) continue;
    const note = String(o.note).toLowerCase();
    for (const term of TERMS[d] ?? []) if (note.includes(term)) agg[d].terms.add(term);
  }
  for (const entry of overridesLog) {
    const id = entry.checkpoint ?? entry.id ?? entry.checkpoint_id;
    if (!id) continue;
    const d = domainForId(id, cpDomain);
    if (agg[d]) agg[d].overrides += 1;
  }

  const profile = { self_facing: true };
  for (const d of DOMAINS) {
    const a = agg[d];
    const signals = {
      engagement: Math.min(a.engagement * 0.08, CAPS.engagement),
      judgment: Math.min(a.judgment * 0.12, CAPS.judgment),
      terminology: Math.min(a.terms.size * 0.06, CAPS.terminology),
      overrides: Math.min(a.overrides * 0.1, CAPS.overrides),
    };
    const score = Math.min(1, BASE + signals.engagement + signals.judgment + signals.terminology + signals.overrides);
    profile[d] = {
      score: Math.round(score * 100) / 100,
      band: bandFor(score),
      counts: { high_reliability_outcomes: a.engagement, judgment_calls: a.judgment, terms_used: a.terms.size, overrides_accepted: a.overrides },
      signals,
    };
  }
  return profile;
}

/** I/O wrapper: read the store and estimate. Returns a default (all-learning) profile if empty. */
export function estimateProficiency({ storeDir }) {
  return estimateFromRecords({
    predictions: readPredictions({ storeDir }),
    outcomesPattern: readOutcomes({ storeDir }),
    outcomesInstance: readInstanceOutcomes(storeDir),
    overridesLog: readOverrides({ storeDir }).log ?? [],
  });
}

/** Verbosity decision for a domain: fluent ⇒ brief (get out of the way), else full. */
export function verbosityFor(domain, profile) {
  return profile?.[domain]?.band === "fluent" ? "brief" : "full";
}

// ---- CLI: a self-facing report ----

const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

const PLAIN = {
  learning: "I'll explain this domain fully and flag the non-obvious things.",
  steady: "I'll keep explanations moderate — context where it helps.",
  fluent: "I'll keep this terse and get out of your way.",
};

function main() {
  if (has("-h") || has("--help")) {
    console.log(`forespec proficiency — your self-facing per-domain read (tunes how much I explain).

Usage: forespec proficiency [--store .forespec] [--json]

Derived from outcomes you've already recorded; it only ever goes UP from good calls and
precise notes, never down for being blunt. SELF-FACING ONLY — never shared, never pooled.`);
    return 0;
  }
  const storeDir = pathResolve(process.cwd(), arg("--store", ".forespec"));
  const profile = estimateProficiency({ storeDir });

  if (has("--json")) { console.log(JSON.stringify(profile, null, 2)); return 0; }

  console.log("\n🔭 Forespec proficiency — self-facing (never shared, never pooled)\n");
  for (const d of DOMAINS) {
    const p = profile[d];
    console.log(`${d.padEnd(9)} ${p.band.toUpperCase().padEnd(9)} (${p.score})`);
    console.log(`  ${PLAIN[p.band]}`);
    console.log(`  from: ${p.counts.high_reliability_outcomes} considered outcome(s), ${p.counts.judgment_calls} judgment call(s), ${p.counts.terms_used} domain term(s), ${p.counts.overrides_accepted} override(s)`);
  }
  console.log("\nThis is demonstrated engagement + judgment, not a competence grade. It tunes how");
  console.log("much I explain — nothing else. Record outcomes (`forespec feedback`) to sharpen it.");
  return 0;
}

if (process.argv[1] && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
