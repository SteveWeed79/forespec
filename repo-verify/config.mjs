// foresight.config.json — the per-PROJECT decision (committed): which archetype this
// repo is graded against. Deliberately separate from `.foresight/` (the gitignored
// calibration store, which holds local instance data). The config is a project fact,
// safe to commit, so CI grades against the right archetype too.
//
// `foresight init` writes it from detection; `verify` and the PR gate read it as the
// default archetype when --archetype isn't passed — so onboarding is a one-time step,
// not a flag you retype on every run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute, resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Where the bundled archetype manifests + library/ live (ships with foresight).
export const PACKAGE_DIR = pathResolve(here, "..");
export const CONFIG_FILE = "foresight.config.json";

export function readConfig(repoDir) {
  const p = join(repoDir, CONFIG_FILE);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

export function writeConfig(repoDir, config) {
  writeFileSync(join(repoDir, CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
  return join(repoDir, CONFIG_FILE);
}

/**
 * Resolve an archetype reference to an absolute manifest path. Accepts:
 *   - an existing path (absolute or relative to cwd)      → used as-is
 *   - a bundled manifest filename ("archetype.saas.json")
 *   - a bare archetype name ("saas")                       → archetype.saas.json
 * Bundled manifests resolve against the foresight package, NOT the user's cwd, so this
 * works when foresight runs from inside someone else's repo (npx). On no match it
 * returns the direct path so the caller's resolveArchetype throws a clear error.
 */
export function resolveManifestPath(ref, { cwd = process.cwd(), packageDir = PACKAGE_DIR } = {}) {
  if (!ref) return null;
  const direct = isAbsolute(ref) ? ref : pathResolve(cwd, ref);
  if (existsSync(direct)) return direct;
  const named = ref.startsWith("archetype.") ? ref : `archetype.${ref}.json`;
  for (const c of [join(packageDir, ref), join(packageDir, named)]) {
    if (existsSync(c)) return c;
  }
  return direct;
}
