#!/usr/bin/env node
// Keep .claude-plugin/plugin.json's version equal to package.json's.
//
// They describe the same artifact through two front doors: npm reads package.json, the
// Claude Code plugin marketplace reads plugin.json and uses its version to decide whether
// an installed copy is stale. Left to drift, a user who installed the plugin stops being
// offered updates while npm users get them — a silent failure with no error anywhere.
//
// Runs from npm's `version` lifecycle hook (see package.json), which fires AFTER npm has
// written the new package.json, so it reads the already-bumped value. `self-test.mjs`
// asserts the two match, and `prepublishOnly` runs the self-test — so a forgotten sync
// fails the publish rather than shipping a stale manifest.
//
// Zero dependencies. Idempotent.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_PATH = join(root, ".claude-plugin", "plugin.json");

function main() {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const src = readFileSync(PLUGIN_PATH, "utf8");

  // Rewrite the line, not the parsed object: re-serializing would reorder and reformat a
  // hand-maintained manifest on every release, burying the real change in the diff.
  const line = /^(\s*"version":\s*")([^"]+)(",?\s*)$/m;
  const m = src.match(line);
  if (!m) {
    console.error(
      'sync-plugin-version: could not find a `"version": "..."` line in .claude-plugin/plugin.json.\n' +
        "The manifest format changed — refusing to guess. Fix the line by hand."
    );
    process.exit(1);
  }

  if (m[2] === version) {
    console.log(`plugin.json already at ${version} — no change.`);
    return;
  }

  writeFileSync(PLUGIN_PATH, src.replace(line, `$1${version}$3`), "utf8");
  console.log(`plugin.json version: ${m[2]} -> ${version}.`);
}

main();
