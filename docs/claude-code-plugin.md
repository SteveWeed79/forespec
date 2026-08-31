# The Claude Code plugin — Forespec without an API key

Install:

```
/plugin marketplace add SteveWeed79/forespec
/plugin install forespec@forespec
```

Then, in any repo:

```
/forespec:plan add checkout          # before you build — what does this actually require?
/forespec:verify                     # after you build — what's shippable, what's not
```

No API key. No metered cost. It runs on the Claude Code subscription you already have.

## Why this path exists

Forespec's checkpoints are graded by a reasoning model. The original way to get one was
`ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` — which asks someone who already pays for a coding
agent to go create a second, separately funded way to talk to the same models. That is a wall,
and it sits directly between a new user and the only part of the product that does the work.

The user is already inside a capable agent. That agent can read the repo, so it can grade the
repo. This path lets it.

## It is also the better grader

This is not a cheap fallback. On the API path, `select.mjs` keyword-ranks the repo's files and
packs the top ones into a character budget; the verifier grades that blob and can only ever
cite a file path. It cannot open the middleware to see whether the signature check is real.

An agent has grep and read. It follows the call chain, checks whether the guard actually
guards, and cites `file:line` — which is the difference between a finding you can fix and a
paragraph you have to go re-investigate yourself.

The API path stays for CI, where there is no agent in the loop. That is what the GitHub Action
is for.

## What ships in the plugin

| Component | What it does |
|---|---|
| `skills/forespec-foresight/` | Loads on its own when you are about to write payment, auth, tenancy, upload, LLM, or BaaS code, and builds the requirements in — the checkpoint arrives at write time, not review time. |
| `commands/plan.md` | `/forespec:plan <feature>` — the decide-first questions for what you are about to build, filtered against what the repo already satisfies. |
| `commands/verify.md` | `/forespec:verify` — grade the backbone, roll up shippable/not, name the gaps. |
| `agents/forespec-verifier.md` | The grading subagent. Carries the calibrated 3/6/9 contract, so grading a large repo does not crowd out your conversation. |

## How the grade gets back into the pipeline

The plugin does not reimplement the roll-up. The agent supplies judgment; everything
downstream is the same code the API path runs, already validated.

```bash
# 1. the standard — what to grade, and the rubric to grade it by
forespec checkpoints --json > /tmp/checkpoints.json

# 2. the agent investigates the repo and writes one verdict per checkpoint
#    (this is the step the plugin automates)

# 3. the normal pipeline: roll-up, gaps-ahead, run-over-run deltas, calibration store
forespec verify --verdicts /tmp/verdicts.json
```

Because step 3 is unchanged, `forespec calibrate`, `forespec feedback`, the HTML report and
the "what moved since last run" deltas all work identically no matter which verifier produced
the verdict.

### Driving it from another agent

Nothing above is Claude Code-specific past the plugin packaging. Any agent that can run a shell
command and write a file can drive the same three steps — point it at
`agents/forespec-verifier.md` for the grading contract, which is the calibrated one and should
not be improvised around.

### Verdict file format

A JSON array (or `{ "verdicts": [...] }`). One entry per checkpoint — a missing verdict is an
error, never a pass.

```json
[
  {
    "id": "payment.idempotency",
    "applicable": true,
    "level": 3,
    "confidence": 0.95,
    "gap": "pass a stable per-order idempotency key to paymentIntents.create",
    "rationale": "the create call carries no idempotency key, so a retry opens a second charge",
    "evidence": ["src/server/checkout.ts:64"]
  }
]
```

| Field | Rules |
|---|---|
| `id` | A checkpoint id from `forespec checkpoints`. Duplicates are rejected. |
| `applicable` | `false` only when the checkpoint's subject is entirely absent from the repo. Never a way to duck a hard call — subject present but unguarded is `true` at level 3. |
| `level` | 3, 6, or 9. Omitted when `applicable` is false. |
| `confidence` | 0–1. Read by the calibration store, so an honest low beats a confident wrong. |
| `gap` | What to change to reach the next level, named concretely. |
| `rationale` | Required. A grade that cannot state its basis does not ship. |
| `evidence` | `path:line`, repo-relative. For an N/A, the search that came back empty. |

The adapter validates every field and fails closed: a bad level, a passing grade with no
rationale, a duplicate id, or malformed JSON errors the run rather than entering the roll-up
as a number. Covered by `repo-verify/self-test.mjs`.

## Limits worth knowing

- The verdict comes from whichever model your Claude Code session is running, so it is not the
  same measured artifact as the API path's validated bar (0 false-greens on 52 critical bad
  cases, rule-of-three 95% upper bound ≤ 2.9% — see [`VALIDATION-NOTES.md`](../VALIDATION-NOTES.md)).
  Those numbers describe the API verifier on the ecommerce/universal corpus. The agent path
  runs the same rubric and the same checkpoints, and can see more of the repo, but it has not
  been put through the same measurement yet.
- Design checkpoints are still excluded from `verify` by default — design is not reliably
  gradable from source. `forespec design <url>` grades the live page instead.
- The calibration store stays local, behind the same pattern/instance wall. Nothing about your
  project leaves your machine on this path either.
