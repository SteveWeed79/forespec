#!/usr/bin/env node
// Self-test for the repo verifier — proves the pipeline end to end with the mock
// adapter (no API key): resolve a manifest from the library, select files from a
// real (vulnerable) repo per checkpoint, grade, and roll up.
//
//   1. Pipeline proof: every backbone checkpoint on the vulnerable fixture grades
//      to level 3 (hole present) → not shippable.
//   2. Discrimination proof: the mock adapter returns 6 when a good signal is
//      present, so a "3 everywhere" result reflects the code, not a dead pipeline.
//
// Run: node repo-verify/self-test.mjs   (or: npm run verify:self)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import * as mock from "../verifier-eval/adapters/mock.mjs";
import { loadRepo, selectForCheckpoint } from "./select.mjs";

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

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed.");
