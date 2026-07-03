#!/usr/bin/env node
// Rolling BSL 1.1 Change Date maintenance.
//
// The Business Source License converts each published version to the Change
// License (Apache 2.0) on the *earlier* of the explicit `Change Date:` line or
// the 4th anniversary of that version's publication. This script rewrites the
// explicit line to today + 4 years, so each release keeps a full 4-year
// proprietary window while older tagged versions age out on their own clocks.
//
// It runs automatically from npm's `version` lifecycle hook (see package.json),
// so `npm version <patch|minor|major>` refreshes the date and folds LICENSE
// into the version commit — no manual edit, nothing to forget. Run standalone
// with `npm run license:bump` to preview/apply without cutting a version.
//
// Zero dependencies. Idempotent: re-running on the same day is a no-op.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LICENSE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "LICENSE");
const YEARS_AHEAD = 4; // BSL practical maximum; the license caps the window here regardless.

function changeDatePlusYears(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years); // setFullYear normalizes Feb 29 -> Mar 1 on non-leap targets.
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function main() {
  const next = changeDatePlusYears(YEARS_AHEAD);
  const src = readFileSync(LICENSE_PATH, "utf8");

  // Match the parameter line exactly: `Change Date:` + whitespace + an ISO date.
  const line = /^(Change Date:\s+)(\d{4}-\d{2}-\d{2})\s*$/m;
  const m = src.match(line);
  if (!m) {
    console.error(
      "bump-change-date: could not find a `Change Date: YYYY-MM-DD` line in LICENSE.\n" +
        "The LICENSE format changed — refusing to guess. Fix the line by hand."
    );
    process.exit(1);
  }

  const current = m[2];
  if (current === next) {
    console.log(`Change Date already ${next} (today + ${YEARS_AHEAD}y) — no change.`);
    return;
  }

  writeFileSync(LICENSE_PATH, src.replace(line, `$1${next}`), "utf8");
  console.log(`Change Date: ${current} -> ${next} (today + ${YEARS_AHEAD}y).`);
}

main();
