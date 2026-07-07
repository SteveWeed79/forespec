// Resolver: compose an archetype MANIFEST + the shared checkpoint LIBRARY into a
// flattened archetype — the full checkpoint shape every tool already consumes
// ({ id, domain, severity, confidence, title, why, levels, verify }).
//
// The split: a library checkpoint defines WHAT to check (transferable; no
// severity). A manifest entry { ref, severity } says HOW MUCH it matters in this
// archetype. Resolving merges them.
//
//   import { resolveArchetype } from "../library/resolve.mjs"
//   const archetype = resolveArchetype("/abs/path/archetype.ecommerce.json")
//
// CLI:  node library/resolve.mjs archetype.ecommerce.json   # prints resolved JSON

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(here, "checkpoints");
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);

// Load every library file and index checkpoints by id. Throws on duplicate ids
// (an id is a permanent contract — it must be unique across the whole library).
export function loadLibrary(dir = LIBRARY_DIR) {
  const byId = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    for (const cp of doc.checkpoints ?? []) {
      if (byId.has(cp.id)) {
        throw new Error(`duplicate library checkpoint id "${cp.id}" (seen again in ${file})`);
      }
      byId.set(cp.id, { ...cp, _source: file });
    }
  }
  return byId;
}

export function resolveArchetype(manifestPath, library = loadLibrary()) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = [];
  const checkpoints = [];
  const seen = new Set();

  if (!Array.isArray(manifest.checkpoints) || manifest.checkpoints.length === 0) {
    // A typo'd key ("checkpoint") must not resolve to a clean-looking EMPTY archetype —
    // everything downstream would grade nothing and read as all-clear.
    throw new Error(`manifest ${manifestPath} has no "checkpoints" array — nothing to grade is an authoring error, not an empty standard`);
  }
  for (const ref of manifest.checkpoints) {
    if (!ref.ref) {
      errors.push(`a checkpoint entry is missing "ref"`);
      continue;
    }
    if (seen.has(ref.ref)) errors.push(`duplicate ref "${ref.ref}"`);
    seen.add(ref.ref);

    const def = library.get(ref.ref);
    if (!def) {
      errors.push(`ref "${ref.ref}" resolves to no library checkpoint`);
      continue;
    }
    if (!SEVERITIES.has(ref.severity)) {
      errors.push(`ref "${ref.ref}" has missing/invalid severity ${JSON.stringify(ref.severity)}`);
      continue;
    }
    // Resolved checkpoint = library definition + manifest severity.
    checkpoints.push({
      id: def.id,
      domain: def.domain,
      severity: ref.severity,
      confidence: def.confidence,
      title: def.title,
      why: def.why,
      levels: def.levels,
      verify: def.verify,
    });
  }

  if (errors.length) {
    throw new Error(`cannot resolve ${manifestPath}:\n  - ${errors.join("\n  - ")}`);
  }
  return {
    archetype: manifest.archetype,
    version: manifest.version,
    applies_when: manifest.applies_when,
    goal_definition: manifest.goal_definition,
    checkpoints,
  };
}

if (process.argv[1] && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: node library/resolve.mjs <archetype-manifest.json>");
    process.exit(2);
  }
  console.log(JSON.stringify(resolveArchetype(pathResolve(process.cwd(), arg)), null, 2));
}
