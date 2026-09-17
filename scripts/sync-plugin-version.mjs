#!/usr/bin/env node
// Keep every copy of the version in the repo equal to package.json's.
//
// There are three front doors onto the same artifact and each carries its own copy of
// the version number:
//
//   package.json          what npm reads
//   plugin.json           what the Claude Code plugin marketplace reads, and what it uses
//                         to decide whether an installed copy is stale
//   `uses: ...@vX.Y.Z`    the GitHub Action reference we tell people to paste
//
// Left to drift they fail differently and all three fail quietly. A stale plugin.json
// means a user who installed the plugin stops being offered updates, with no error
// anywhere. A stale `@vX.Y.Z` in the copy-paste snippet means people pin a release that
// predates the fix they came for — v0.2.0 was still being handed out two releases later.
//
// So the release owns all of them. Runs from npm's `version` lifecycle hook (see
// package.json), which fires AFTER npm has written the new package.json, so it reads the
// already-bumped value. `self-test.mjs` asserts every copy matches — including files this
// script does not know about — and `prepublishOnly` runs the self-test, so a forgotten
// sync fails the publish rather than shipping a stale pointer.
//
// Zero dependencies. Idempotent.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_PATH = join(root, ".claude-plugin", "plugin.json");

/**
 * Files carrying a `SteveWeed79/forespec@vX.Y.Z` action reference.
 *
 * An explicit list, not a tree walk: CHANGELOG.md and the audit ledger cite old versions
 * on purpose, and a release that quietly rewrote its own history would be worse than a
 * stale snippet. The self-test scans the whole repo, so a new file with a version pin
 * fails the build and gets added here rather than drifting unnoticed.
 */
const ACTION_REF_FILES = ["action.yml", "repo-verify/verifier-choice.mjs"];

/** `owner/repo@v1.2.3` — the tag form people paste into a workflow. */
export const ACTION_REF = /SteveWeed79\/forespec@v\d+\.\d+\.\d+/g;

function syncPluginManifest(version) {
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

function syncActionRefs(version) {
  const want = `SteveWeed79/forespec@v${version}`;
  for (const rel of ACTION_REF_FILES) {
    const path = join(root, rel);
    const src = readFileSync(path, "utf8");
    const found = src.match(ACTION_REF);
    if (!found) {
      // Fail closed: the list says this file pins a version. If it stopped, the list is
      // wrong, and silently doing nothing is how the stale pin came back last time.
      console.error(
        `sync-plugin-version: expected a SteveWeed79/forespec@vX.Y.Z reference in ${rel} and found none.\n` +
          "Either the snippet moved or the pin was removed — update ACTION_REF_FILES rather than leaving this to drift."
      );
      process.exit(1);
    }
    const stale = found.filter((r) => r !== want);
    if (!stale.length) {
      console.log(`${rel} already pins v${version} — no change.`);
      continue;
    }
    writeFileSync(path, src.replace(ACTION_REF, want), "utf8");
    console.log(`${rel}: ${[...new Set(stale)].join(", ")} -> ${want} (${stale.length} ref(s)).`);
  }
}

function main() {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  syncPluginManifest(version);
  syncActionRefs(version);
}

// Importable for the self-test (which scans wider than this script rewrites) without
// running the rewrite as a side effect.
if (process.argv[1] && process.argv[1].endsWith("sync-plugin-version.mjs")) main();
