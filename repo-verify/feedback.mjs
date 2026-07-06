#!/usr/bin/env node
// forespec feedback — record a human verdict on a prior prediction (calibration brick 2).
//
// Turns the manual "is this flag real / false / over-severe?" judgment (the thing a
// human did by hand during the first real-repo validation) into a first-class, stored
// outcome — joined to the prediction by checkpoint id + fingerprint. Accumulated
// outcomes are what later let weights/severities be *earned* instead of invented.
//
// Usage:
//   node repo-verify/feedback.mjs <checkpoint-id> <outcome> [options]
//
//   <outcome>  hit | false-positive | over-severe | ignored
//                hit           = flag was real and acting on it made sense
//                false-positive= flag was wrong / not a real issue
//                over-severe   = real, but the level overstated the actual blast radius
//                ignored       = acknowledged, chose not to act (yet)
//
// Options:
//   --run <id>        Attach to a specific run (default: the most recent prediction)
//   --source <s>      objective_outcome | expert_rating | self_observed | casual_reaction
//                     (default: self_observed)
//   --note "<text>"   Free-text note (stays in the LOCAL instance store only)
//   --project <name>  Project label for the instance record
//   --store <dir>     Calibration store dir (default: ./.forespec)
//   -h, --help

import { resolve } from "node:path";
import { latestPrediction, recordOutcome, OUTCOMES, SOURCE_TIERS } from "./store.mjs";

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (f) => process.argv.includes(f);

const HELP = `forespec feedback — record a human verdict on a prediction.

Usage:
  node repo-verify/feedback.mjs <checkpoint-id> <outcome> [options]

Outcome:  ${OUTCOMES.join(" | ")}
  hit            flag was real and acting on it made sense
  false-positive flag was wrong / not a real issue
  over-severe    real, but the level overstated the actual blast radius
  ignored        acknowledged, chose not to act (yet)

Options:
  --run <id>       attach to a specific run (default: most recent prediction)
  --source <s>     ${Object.keys(SOURCE_TIERS).join(" | ")} (default: self_observed)
  --note "<text>"  note (stays in the LOCAL instance store only)
  --project <name> project label for the instance record
  --store <dir>    store dir (default: ./.forespec)
  -h, --help`;

function main() {
  if (has("-h") || has("--help")) {
    console.log(HELP);
    return 0;
  }

  const valueFlags = ["--run", "--source", "--note", "--project", "--store"];
  const positionals = process.argv.slice(2).filter((a, i, arr) => {
    if (a.startsWith("-")) return false;
    return !valueFlags.includes(arr[i - 1]);
  });
  const [checkpointId, outcome] = positionals;

  if (!checkpointId || !outcome) {
    console.error("error: need <checkpoint-id> and <outcome>\n");
    console.error(HELP);
    return 2;
  }
  if (!OUTCOMES.includes(outcome)) {
    console.error(`error: outcome must be one of: ${OUTCOMES.join(", ")}`);
    return 2;
  }
  const source = arg("--source", "self_observed");
  if (!(source in SOURCE_TIERS)) {
    console.error(`error: --source must be one of: ${Object.keys(SOURCE_TIERS).join(", ")}`);
    return 2;
  }

  const storeDir = resolve(process.cwd(), arg("--store", ".forespec"));
  const runId = arg("--run", null);
  const prediction = latestPrediction({ storeDir, checkpointId, runId });
  if (!prediction) {
    console.error(
      `error: no prediction found for "${checkpointId}"${runId ? ` in run ${runId}` : ""} under ${storeDir}.\n` +
        `Run \`node repo-verify/verify.mjs <repo>\` first so there's a prediction to grade.`,
    );
    return 2;
  }

  const { reliability } = recordOutcome({
    storeDir, prediction, outcome, source,
    note: arg("--note", null),
    project: arg("--project", null),
  });

  console.log(
    `recorded "${outcome}" for ${checkpointId} ` +
      `(run ${prediction.run_id}, predicted level ${prediction.level}, ${prediction.fingerprint}) ` +
      `— source ${source} [${reliability}]`,
  );
  return 0;
}

process.exit(main());
