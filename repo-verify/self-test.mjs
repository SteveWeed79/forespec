#!/usr/bin/env node
// Self-test for the repo verifier — proves the pipeline end to end with the mock
// adapter (no API key): resolve a manifest from the library, select files from a
// real (vulnerable) repo per checkpoint, grade, and roll up.
//
//   1. Pipeline proof: every backbone checkpoint on the vulnerable fixture grades
//      to level 3 (hole present) → not shippable.
//   2. Discrimination proof: the mock adapter returns 6 when a good signal is
//      present, so a "3 everywhere" result reflects the code, not a dead pipeline.
//   3. Calibration store: a run is logged with the pattern/instance wall enforced,
//      and feedback records an outcome joined to the prediction by fingerprint.
//
// Run: node repo-verify/self-test.mjs   (or: npm run verify:self)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolveArchetype } from "../library/resolve.mjs";
import * as mock from "../verifier-eval/adapters/mock.mjs";
import { loadRepo, selectForCheckpoint } from "./select.mjs";
import { fingerprint, recordPredictions, latestPrediction, recordOutcome, FILES } from "./store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const archetypePath = join(here, "..", "archetype.ecommerce.json");
const fixture = join(here, "fixtures", "vulnerable-checkout");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const archetype = resolveArchetype(archetypePath);
const backbone = archetype.checkpoints.filter((c) => c.domain === "backbone");
const files = loadRepo(fixture);

console.log(`1. Pipeline proof (vulnerable-checkout, ${backbone.length} backbone checkpoints, mock adapter):`);
check("repo loaded source files", files.length > 0, `got ${files.length}`);

const results = [];
for (const cp of backbone) {
  const { files: selected, code } = selectForCheckpoint(files, cp);
  check(`${cp.id}: selected relevant files`, selected.length > 0);
  const v = await mock.verify({ checkpoint: cp, code });
  results.push({ id: cp.id, severity: cp.severity, level: v.level });
  check(`${cp.id}: flagged level 3 (hole present)`, v.level === 3, `got ${v.level}`);
}

const critical = results.filter((r) => r.severity === "critical");
const shippable = critical.every((r) => r.level >= 6);
check("verdict: NOT shippable", shippable === false);

console.log("\n2. Discrimination proof (good signal present → level 6):");
const cases = [
  { id: "payment.idempotency", code: "stripe.paymentIntents.create({ amount }, { idempotencyKey: orderId });" },
  { id: "auth.access_control", code: "const order = await db.order.findOne({ where: { id, userId: req.user.id } });" },
];
for (const tc of cases) {
  const cp = archetype.checkpoints.find((c) => c.id === tc.id);
  const v = await mock.verify({ checkpoint: cp, code: tc.code });
  check(`${tc.id} → level 6 when signal present`, v.level === 6, `got ${v.level}`);
}

console.log("\n3. Calibration store — pattern/instance wall (bricks 1–2):");
const store = mkdtempSync(join(tmpdir(), "foresight-store-"));
try {
  const fakeResults = [{
    id: "payment.idempotency", domain: "backbone", severity: "critical",
    level: 3, confidence: 0.9,
    gap: "add idempotencyKey in src/checkout/actions.ts",        // names a file → instance-only
    rationale: "no idempotency key on session create in actions.ts",
    evidence: ["src/checkout/actions.ts"],
    adapter: "mock", fingerprint: fingerprint("some graded code slice"),
  }];
  const { count } = recordPredictions({
    storeDir: store, runId: "run_selftest", archetype: "ecommerce", archetypeVersion: "2.0.0",
    project: "selftest-project", results: fakeResults,
  });
  check("recorded the prediction", count === 1);

  const patLine = readFileSync(join(store, FILES.predPattern), "utf8").trim();
  const instLine = readFileSync(join(store, FILES.predInstance), "utf8").trim();
  const pat = JSON.parse(patLine), inst = JSON.parse(instLine);

  // THE WALL: the shareable pattern record carries ids/numbers/fingerprint only.
  check("pattern record has checkpoint_id + level + fingerprint", !!pat.checkpoint_id && pat.level === 3 && !!pat.fingerprint);
  check("pattern record has NO gap/rationale/evidence", !("gap" in pat) && !("rationale" in pat) && !("evidence" in pat));
  check("pattern record leaks no file path / project name", !patLine.includes("actions.ts") && !patLine.includes("selftest-project"));
  check("instance record keeps the code-specific detail", !!inst.gap && inst.evidence.length === 1);
  check("instance fingerprint == pattern fingerprint (join key)", inst.fingerprint === pat.fingerprint);

  // Brick 2: feedback writes an outcome joined to the prediction by fingerprint.
  const pred = latestPrediction({ storeDir: store, checkpointId: "payment.idempotency" });
  check("latestPrediction finds the prediction", !!pred && pred.fingerprint === pat.fingerprint);
  recordOutcome({ storeDir: store, prediction: pred, outcome: "over-severe", source: "self_observed", note: "real but contained in actions.ts", project: "selftest-project" });
  const outPat = JSON.parse(readFileSync(join(store, FILES.outPattern), "utf8").trim());
  const outInst = JSON.parse(readFileSync(join(store, FILES.outInstance), "utf8").trim());
  check("outcome pattern: outcome + reliability tier, NO note", outPat.outcome === "over-severe" && outPat.reliability === "high" && !("note" in outPat));
  check("outcome instance keeps the note", !!outInst.note && outInst.note.includes("actions.ts"));
  check("outcome joined to prediction by fingerprint", outPat.fingerprint === pat.fingerprint);
} finally {
  rmSync(store, { recursive: true, force: true });
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed.");
