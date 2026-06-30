// Calibration store (build-order P2, bricks 1–2) — the foundation that turns every
// run into training data. JSONL to start; the shape maps cleanly to SQLite later.
//
// The pattern/instance wall is PHYSICAL here: predictions and outcomes are each split
// into two files —
//   *.patterns.jsonl   — SHAREABLE: ids, numbers, and a fingerprint (a hash, not code).
//                        No file paths, no code, no free-text. This is what could one
//                        day join a cross-repo/cross-user pool.
//   *.instances.jsonl  — LOCAL ONLY: the code-specific refs (paths, gap, rationale,
//                        notes) + the same fingerprint as the join key. Never synced.
//
// The fingerprint (hash of the graded code slice) is what joins an outcome back to the
// prediction it grades — across time, without storing the code.

import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const FILES = {
  predPattern: "predictions.patterns.jsonl",
  predInstance: "predictions.instances.jsonl",
  outPattern: "outcomes.patterns.jsonl",
  outInstance: "outcomes.instances.jsonl",
};

// Reliability tiers (from foresight.calibration-1.md): a pool must never blend these blindly.
export const SOURCE_TIERS = {
  objective_outcome: "highest", // reality graded it (oversell happened, override held up)
  expert_rating: "high", // someone with real judgment scored it
  self_observed: "high", // you watched your own outcome (medium in a pool)
  passive_git: "medium", // inferred from git (flagged region changed + grade rose) — a heuristic
  casual_reaction: "lowest", // "looks nice" — appeal, not correctness
};

export function fingerprint(code) {
  return "sha256:" + createHash("sha256").update(code ?? "").digest("hex").slice(0, 32);
}

export function newRunId() {
  return "run_" + Date.now().toString(36) + "_" + randomUUID().slice(0, 8);
}

function appendJsonl(dir, file, obj) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, file), JSON.stringify(obj) + "\n");
}

function readJsonl(dir, file) {
  const p = join(dir, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * Brick 1 — log one verify run. `results` come from verify.mjs and must carry a
 * precomputed `fingerprint` (a hash of the graded code slice). Only graded
 * predictions (level != null) are recorded.
 */
export function recordPredictions({ storeDir, runId, archetype, archetypeVersion, project, results, ts }) {
  const stamp = ts ?? new Date().toISOString();
  let count = 0;
  for (const r of results) {
    if (r.level == null) continue;
    // PATTERN — shareable. Deliberately omits gap/rationale/evidence/paths.
    appendJsonl(storeDir, FILES.predPattern, {
      schema: "foresight/prediction/pattern/v1",
      run_id: runId, ts: stamp,
      archetype, archetype_version: archetypeVersion,
      checkpoint_id: r.id, domain: r.domain, severity: r.severity,
      level: r.level, confidence: r.confidence,
      adapter: r.adapter, fingerprint: r.fingerprint,
      outcome: null, // filled by brick 2 (feedback) or, later, passively from git
    });
    // INSTANCE — local only. The code-specific detail lives here, never in the pattern file.
    appendJsonl(storeDir, FILES.predInstance, {
      schema: "foresight/prediction/instance/v1",
      run_id: runId, ts: stamp,
      project, checkpoint_id: r.id, fingerprint: r.fingerprint,
      level: r.level, confidence: r.confidence,
      gap: r.gap, rationale: r.rationale, evidence: r.evidence, adapter: r.adapter,
    });
    count++;
  }
  return { count, storeDir };
}

/** Most recent prediction for a checkpoint (optionally within one run). */
export function latestPrediction({ storeDir, checkpointId, runId }) {
  const pats = readJsonl(storeDir, FILES.predPattern).filter(
    (p) => p.checkpoint_id === checkpointId && (!runId || p.run_id === runId),
  );
  return pats.length ? pats[pats.length - 1] : null;
}

export const OUTCOMES = ["hit", "false-positive", "over-severe", "ignored"];

/**
 * Brick 2 — record a human verdict on a prediction. Splits the same way: the
 * pattern outcome (poolable) carries the outcome class + reliability tier; the note
 * (which may name code) stays in the instance outcome.
 */
export function recordOutcome({ storeDir, prediction, outcome, source = "self_observed", note, project, ts }) {
  const stamp = ts ?? new Date().toISOString();
  const reliability = SOURCE_TIERS[source] ?? "unknown";
  appendJsonl(storeDir, FILES.outPattern, {
    schema: "foresight/outcome/pattern/v1", ts: stamp,
    run_id: prediction.run_id, checkpoint_id: prediction.checkpoint_id, fingerprint: prediction.fingerprint,
    predicted_level: prediction.level, predicted_confidence: prediction.confidence,
    outcome, source, reliability,
  });
  appendJsonl(storeDir, FILES.outInstance, {
    schema: "foresight/outcome/instance/v1", ts: stamp,
    run_id: prediction.run_id, checkpoint_id: prediction.checkpoint_id, fingerprint: prediction.fingerprint,
    project: project ?? null, outcome, source, note: note ?? null,
  });
  return { reliability };
}

// ---- brick 3: reading the store + local severity overrides ----

export function readPredictions({ storeDir }) {
  return readJsonl(storeDir, FILES.predPattern);
}
export function readOutcomes({ storeDir }) {
  return readJsonl(storeDir, FILES.outPattern);
}

export const OVERRIDES_FILE = "overrides.json";

/**
 * Local, human-accepted tuning the verifier applies on top of the archetype.
 * Kept OUT of the shared library — the library stays pristine; tuning is earned
 * (from accepted deltas) and reversible (delete the file or `calibrate reset`).
 */
export function readOverrides({ storeDir }) {
  const p = join(storeDir, OVERRIDES_FILE);
  if (!existsSync(p)) return { schema: "foresight/overrides/v1", severity: {}, log: [] };
  return JSON.parse(readFileSync(p, "utf8"));
}

export function writeOverrides({ storeDir, overrides }) {
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(join(storeDir, OVERRIDES_FILE), JSON.stringify(overrides, null, 2) + "\n");
}
