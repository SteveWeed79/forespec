// Which verifier grades this run — and what to say when there isn't one.
//
// Owned in one place because `verify` and `gate` must agree: a grader good enough to gate a
// merge in CI is exactly the grader good enough to answer "is this shippable?" locally, and
// two copies of that rule drift.
//
// The rule: Forespec REFUSES to grade rather than falling back to something it doesn't trust.
//
// It used to fall back. A first run on a real repo with no key produced ~20 checkpoints of
// "level 3 — keyword baseline found no good-signal token, defaults to risky": a wall of red
// that looks like a verdict, reads like a verdict, and means nothing. It was labelled honestly
// on every surface, and that still wasn't enough — a label under a page of red findings does
// not survive a first impression. The mock exists to exercise the harness and to be the dumb
// baseline the real verifier must beat, so it stays reachable with an explicit `--adapter mock`.
// It is no longer something you can arrive at by accident.

/** Adapters that can produce a verdict worth acting on. */
const TRUSTED = new Set(["claude", "agent"]);

/**
 * Decide the adapter for this run.
 *
 * Returns `{ name }` when one is configured, or `{ name: null, reason }` when none is —
 * the caller is expected to print `noVerifierMessage()` and exit non-zero rather than
 * grade with something it can't stand behind.
 *
 * @param {(flag: string) => string|null} arg  reads a value flag from the caller's argv
 */
export function pickAdapter(arg, env = process.env) {
  const explicit = arg("--adapter");
  // An explicit choice is always honoured, mock included — that's the escape hatch for
  // testing the harness, and it's opt-in rather than arrived at by accident.
  if (explicit) return { name: explicit, explicit: true, trusted: TRUSTED.has(explicit) };
  // Verdicts on hand mean an agent already did the grading — prefer them over an API call.
  if (arg("--verdicts") || env.FORESPEC_VERDICTS) return { name: "agent", explicit: false, trusted: true };
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) return { name: "claude", explicit: false, trusted: true };
  return { name: null, explicit: false, trusted: false, reason: missingReason(env) };
}

/** Why there's no verifier — specific enough to fix, because "not configured" isn't actionable. */
function missingReason(env) {
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_MODEL) return "ANTHROPIC_API_KEY is set but ANTHROPIC_MODEL is not";
  if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) return "ANTHROPIC_MODEL is set but ANTHROPIC_API_KEY is not";
  return "no verifier is configured";
}

const AGENT_PATH = `From the coding agent you're already in — free, no API key:
       /plugin marketplace add SteveWeed79/forespec
       /plugin install forespec@forespec
       /forespec:verify
     It grades on your existing subscription and cites file:line.
     Details: docs/claude-code-plugin.md`;

const KEY_PATH = `With an Anthropic API key:
       export ANTHROPIC_API_KEY=sk-...     # https://console.anthropic.com
       export ANTHROPIC_MODEL=<a current Claude model id>`;

const CI_KEY_PATH = `Give the workflow an API key — in CI there is no agent in the loop:
       - uses: SteveWeed79/forespec@v0.1.3
         with:
           anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
           anthropic-model: \${{ vars.ANTHROPIC_MODEL }}`;

/**
 * What a user sees instead of a grade.
 *
 * Ordered by where they are. Locally the free path goes first — they are probably already
 * inside the agent that can do this. In CI there is no agent, so the key comes first. Either
 * way it ends with what still works without a verifier, because nobody should hit a wall
 * with nothing to do next.
 */
export function noVerifierMessage({ reason = "no verifier is configured", context = "local" } = {}) {
  const ci = context === "ci";
  const [first, second] = ci ? [CI_KEY_PATH, AGENT_PATH] : [AGENT_PATH, KEY_PATH];
  const tail = ci
    ? `The gate will not post a comment it can't stand behind: a PR decorated with keyword-baseline
findings teaches reviewers to ignore Forespec, which costs more than having no gate.`
    : `Meanwhile, these need no verifier at all and work right now:
  forespec demo               see a real graded run on a bundled example (~20s)
  forespec plan "<feature>"   what this feature actually requires, before you build it
  forespec init               detect your archetype (reads metadata, never your code)`;

  return `error: ${reason}, so there is nothing to grade with.

Forespec won't fake a grade. Two ways to get a real one:

  1. ${first}

  2. ${second}

${tail}

Testing the harness itself? \`--adapter mock\` runs a keyword baseline. It is not a
grader to trust and must never gate a merge.`;
}
