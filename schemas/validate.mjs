#!/usr/bin/env node
// Zero-dependency validator for the Forespec checkpoint library + archetype manifests.
//
// Checks the invariants a JSON Schema can't express:
//   - library checkpoint ids are unique across the whole library
//   - every library checkpoint has the required fields + levels 3/6/9
//   - every archetype manifest's refs resolve, with a valid severity, no dup refs
//   - the resolved archetype has unique ids and a severity on every checkpoint
//   - instrumented design file: signal weights sum to 1.0 per checkpoint; ids unique
//   - reports ids shared between the library and the instrumented design file
//
// Full JSON-Schema validation (against schemas/*.schema.json) is a separate,
// documented step (ajv or python jsonschema — see schemas/README.md). This
// script needs no dependencies so it always runs.
//
// Usage:  node schemas/validate.mjs      (or: npm run check)

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadLibrary, resolveArchetype } from "../library/resolve.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEIGHT_TOLERANCE = 1e-9;
const errors = [];
const info = [];

const CONFIDENCE = new Set(["established", "reasoned", "taste_limited"]);
const DOMAIN = new Set(["backbone", "design"]);

// --- library ---
let library;
try {
  library = loadLibrary(); // throws on duplicate ids across files
} catch (e) {
  errors.push(`library: ${e.message}`);
}
if (library) {
  for (const [id, cp] of library) {
    for (const f of ["domain", "confidence", "title", "why", "levels", "verify"]) {
      if (!(f in cp)) errors.push(`library: "${id}" missing field "${f}"`);
    }
    if (cp.domain && !DOMAIN.has(cp.domain)) errors.push(`library: "${id}" invalid domain "${cp.domain}"`);
    if (cp.confidence && !CONFIDENCE.has(cp.confidence)) errors.push(`library: "${id}" invalid confidence "${cp.confidence}"`);
    if (cp.levels && !["3", "6", "9"].every((k) => k in cp.levels)) errors.push(`library: "${id}" levels must define 3, 6, and 9`);
    if (cp.verify && !cp.verify.reasoning) errors.push(`library: "${id}" verify.reasoning is missing`);
  }
  if (!errors.length) info.push(`library: ${library.size} checkpoints, ids unique`);
}

// --- archetype manifests: resolve and check ---
const manifests = readdirSync(repoRoot)
  .filter((f) => /^archetype\..+\.json$/.test(f) && !f.endsWith(".design.json"))
  .sort();
for (const m of manifests) {
  if (!library) break;
  try {
    const resolved = resolveArchetype(join(repoRoot, m), library);
    const seen = new Set();
    for (const c of resolved.checkpoints) {
      if (seen.has(c.id)) errors.push(`${m}: duplicate resolved id "${c.id}"`);
      seen.add(c.id);
      if (!c.severity) errors.push(`${m}: "${c.id}" resolved without a severity`);
    }
    info.push(`${m}: resolves to ${resolved.checkpoints.length} checkpoints`);
  } catch (e) {
    errors.push(`${m}: ${e.message}`);
  }
}

// --- instrumented design file ---
const design = JSON.parse(readFileSync(join(repoRoot, "archetype.ecommerce.design.json"), "utf8"));
const designIds = new Set();
for (const cp of design.checkpoints ?? []) {
  if (designIds.has(cp.id)) errors.push(`design: duplicate checkpoint id "${cp.id}"`);
  designIds.add(cp.id);
  const sum = (cp.signals ?? []).reduce((a, s) => a + (s.weight ?? 0), 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    errors.push(`design: "${cp.id}" signal weights sum to ${sum}, expected 1.0`);
  }
  const deferred = (cp.signals ?? []).filter((s) => s.measurement_type === "model_scored").map((s) => s.id);
  if (deferred.length) {
    info.push(`design: "${cp.id}" has deferred model_scored signal(s) [${deferred.join(", ")}] — excluded from the trusted composite until calibration validates them.`);
  }
}
if (library) {
  const shared = [...designIds].filter((id) => library.has(id));
  if (shared.length) info.push(`shared ids (instrumented def supersedes library def): ${shared.join(", ")}`);
}

// --- report ---
for (const m of info) console.log(`info:  ${m}`);
for (const m of errors) console.error(`ERROR: ${m}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s). Library/manifests are NOT valid.`);
  process.exit(1);
}
console.log(`\nOK: library + manifests + instrumented design all valid.`);
