#!/usr/bin/env node
// Zero-dependency validator for Foresight archetype files.
//
// Checks the invariants a JSON Schema can't express on its own:
//   - required top-level fields are present
//   - checkpoint ids are unique within a file (they are permanent contracts)
//   - in the instrumented design file, each checkpoint's signal weights sum to 1.0
//   - reports ids shared between the base and design archetypes (intended supersede)
//
// For full structural validation against schemas/*.schema.json, use ajv or
// python jsonschema as documented in schemas/README.md. This script needs no deps
// so it always runs on a bare Node install.
//
// Usage:  node schemas/validate.mjs
// Exits non-zero if any hard check fails.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEIGHT_TOLERANCE = 1e-9;

const errors = [];
const warnings = [];
const info = [];

function load(rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

function requireFields(label, obj, fields) {
  for (const f of fields) {
    if (!(f in obj)) errors.push(`${label}: missing required field "${f}"`);
  }
}

function checkUniqueIds(label, checkpoints) {
  const seen = new Set();
  for (const cp of checkpoints ?? []) {
    if (!cp.id) {
      errors.push(`${label}: a checkpoint is missing "id"`);
      continue;
    }
    if (seen.has(cp.id)) errors.push(`${label}: duplicate checkpoint id "${cp.id}"`);
    seen.add(cp.id);
  }
  return seen;
}

// --- base archetype ---
const base = load("archetype.ecommerce.json");
requireFields("base", base, ["archetype", "version", "applies_when", "goal_definition", "checkpoints"]);
const baseIds = checkUniqueIds("base", base.checkpoints);

// --- instrumented design archetype ---
const design = load("archetype.ecommerce.design.json");
requireFields("design", design, ["archetype", "dimension", "version", "checkpoints"]);
const designIds = checkUniqueIds("design", design.checkpoints);

for (const cp of design.checkpoints ?? []) {
  const sum = (cp.signals ?? []).reduce((a, s) => a + (s.weight ?? 0), 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    errors.push(`design: checkpoint "${cp.id}" signal weights sum to ${sum}, expected 1.0`);
  }
  const deferred = (cp.signals ?? []).filter((s) => s.measurement_type === "model_scored").map((s) => s.id);
  if (deferred.length) {
    info.push(`design: "${cp.id}" has deferred model_scored signal(s) [${deferred.join(", ")}] — excluded from the trusted composite until calibration validates them.`);
  }
}

// --- cross-file: shared ids are intentional (base def is the fallback) ---
const shared = [...designIds].filter((id) => baseIds.has(id));
if (shared.length) {
  info.push(`shared ids (instrumented def supersedes base, same stable id): ${shared.join(", ")}`);
}

// --- report ---
for (const m of info) console.log(`info:  ${m}`);
for (const m of warnings) console.warn(`warn:  ${m}`);
for (const m of errors) console.error(`ERROR: ${m}`);

if (errors.length) {
  console.error(`\n${errors.length} error(s). Archetypes are NOT valid.`);
  process.exit(1);
}
console.log(`\nOK: invariant checks passed (${baseIds.size} base + ${designIds.size} design checkpoints).`);
