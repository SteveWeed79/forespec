// Agent verifier adapter — the coding agent already in the user's terminal IS the verifier.
//
// The `claude` adapter calls the Anthropic API directly, which means the user needs an API
// key, a funded account, and a model id before they can grade anything. But the target user
// is already sitting inside a coding agent (Claude Code, and any agent that can run a shell
// command and write a file). That agent can read the repo, so it can grade the repo — on the
// subscription they already pay for, at no metered cost.
//
// This adapter is the seam. It does NOT call a model. The agent investigates the repo, writes
// one verdict per checkpoint to a JSON file, and this adapter serves those verdicts back into
// the normal `verify` pipeline — so the roll-up, the gaps-ahead report, the calibration store,
// the run-over-run deltas, and the HTML report all work exactly as they do for the API path.
// The agent supplies judgment; everything downstream is unchanged and already validated.
//
// It is also STRICTLY better positioned than the API adapter on one axis: `select.mjs` packs
// whole keyword-ranked files into a character budget, so the API verifier grades a blob and
// can only cite file paths. An agent has grep/read — it can follow a call chain into the
// middleware that actually verifies the signature, and cite `file:line`. That is why
// `evidence` is part of this adapter's contract and optional everywhere else.
//
// Verdict file — a JSON array, or an object with a `verdicts` array:
//
//   [
//     {
//       "id": "payment.idempotency",
//       "applicable": true,
//       "level": 3,
//       "confidence": 0.9,
//       "gap": "pass a stable idempotency key derived per order to paymentIntents.create",
//       "rationale": "the create call carries no idempotency key, so a retry opens a 2nd charge",
//       "evidence": ["app/api/checkout/route.ts:12"]
//     }
//   ]
//
// Path comes from FORESPEC_VERDICTS or `--verdicts <file>`. Setting either makes `verify`
// default to this adapter.
//
// Implements the adapter interface: verify({ checkpoint }) -> { applicable, level, confidence, gap, rationale, evidence }

import { readFileSync } from "node:fs";

export const name = "agent";

// The verdicts are already committed to a file, so verify.mjs re-asking would return the
// identical record — a challenge that never happened. The adversarial N/A re-pass lives in
// the grading contract instead (the skill requires an N/A to name why the matched code is
// unrelated), so this adapter opts out of the caller's challenge loop.
export const selfChallenged = true;

const LEVELS = new Set([3, 6, 9]);

function verdictsPath() {
  const i = process.argv.indexOf("--verdicts");
  const flag = i !== -1 ? process.argv[i + 1] : null;
  const path = (flag && !flag.startsWith("-") ? flag : null) ?? process.env.FORESPEC_VERDICTS;
  if (!path) {
    throw new Error(
      "the agent adapter needs a verdict file — pass --verdicts <file> or set FORESPEC_VERDICTS. " +
        "Run `forespec checkpoints --json` to get the checkpoints to grade.",
    );
  }
  return path;
}

/**
 * Load and validate the verdict file, indexed by checkpoint id.
 *
 * Every field is validated on the way in. A verdict file is written by a model, so it is
 * untrusted input on the SAME footing as a model's API response: a malformed level, a
 * string where a number belongs, or a duplicate id must fail loudly here rather than
 * flow into the roll-up and quietly decide whether a release is shippable.
 */
function loadVerdicts(path) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`could not read verdict file ${path}: ${e.message}`);
  }
  const list = Array.isArray(doc) ? doc : doc?.verdicts;
  if (!Array.isArray(list)) {
    throw new Error(`verdict file ${path} must be a JSON array, or an object with a "verdicts" array`);
  }

  const byId = new Map();
  for (const [i, v] of list.entries()) {
    const where = `verdict[${i}]${v?.id ? ` (${v.id})` : ""}`;
    if (!v || typeof v !== "object") throw new Error(`${where}: not an object`);
    if (typeof v.id !== "string" || !v.id) throw new Error(`${where}: missing "id"`);
    if (byId.has(v.id)) throw new Error(`${where}: duplicate verdict for "${v.id}"`);

    const applicable = v.applicable !== false;
    // N/A is the one verdict that needs no level — but it must be an explicit claim that the
    // checkpoint's SUBJECT is absent, never a way to duck a hard call. verify.mjs challenges
    // an unproven N/A the same way it does for the API adapter.
    if (applicable && !LEVELS.has(v.level)) {
      throw new Error(`${where}: "level" must be 3, 6, or 9 (got ${JSON.stringify(v.level)})`);
    }
    if (v.confidence != null && (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1)) {
      throw new Error(`${where}: "confidence" must be a number in [0,1] (got ${JSON.stringify(v.confidence)})`);
    }
    if (applicable && typeof v.rationale !== "string") {
      throw new Error(`${where}: "rationale" is required — a grade that can't state its basis doesn't ship`);
    }
    const evidence = v.evidence == null ? null : Array.isArray(v.evidence) ? v.evidence.filter((e) => typeof e === "string") : null;
    if (v.evidence != null && evidence === null) throw new Error(`${where}: "evidence" must be an array of strings`);

    byId.set(v.id, {
      applicable,
      level: applicable ? v.level : null,
      confidence: v.confidence ?? null,
      gap: typeof v.gap === "string" ? v.gap : "",
      rationale: typeof v.rationale === "string" ? v.rationale : "",
      evidence,
    });
  }
  return byId;
}

let cache = null;
function verdicts() {
  if (cache === null) cache = loadVerdicts(verdictsPath());
  return cache;
}

/** Reset the memoized verdict file. Test-only seam. */
export function _reset() {
  cache = null;
}

/**
 * Does the agent have a verdict for this checkpoint?
 *
 * verify.mjs marks a checkpoint N/A without calling the adapter when keyword selection
 * matches nothing. That shortcut is right for the API path — selection is what feeds it —
 * but wrong here: the agent searched the whole repo itself and may have found the subject
 * in a file the keyword ranker missed. If the agent graded it, its verdict wins.
 */
export function hasVerdict(id) {
  return verdicts().has(id);
}

export async function verify({ checkpoint }) {
  const v = verdicts().get(checkpoint.id);
  if (!v) {
    // Silence is not a pass. An ungraded checkpoint must surface as an error, never as an
    // absence that quietly drops out of the roll-up.
    throw new Error(`no verdict for "${checkpoint.id}" in the verdict file — every checkpoint must be graded or explicitly marked applicable:false`);
  }
  return v;
}
