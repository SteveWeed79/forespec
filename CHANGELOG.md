# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/). Pre-1.0, minor bumps may include breaking changes.

## [Unreleased]

### Added
- **The agent path now has a number.** `verifier-eval/adapters/agent-cli.mjs` drives the local
  `claude` CLI headlessly over the labelled corpus, so the plugin path is held to the same
  fixtures and the same launch gate as the API verifier. Result on corpus-v3 (133 cases, 76
  critical bad), two independent runs: **0 false-greens across 152 critical-bad trials →
  rule-of-three 95% upper bound ≤2.0%**, 0 errors, and **133/133 outcome agreement** between
  runs. Full write-up, caveats and disclosures in `VALIDATION-NOTES.md`.
- **`library/grading-contract.md`** — the calibrated 3/6/9 rubric, hard-case rules, applicability
  rule and verdict format, extracted into one file. The plugin's subagent reads it; the eval
  adapter loads it verbatim as its system prompt. That is what makes the number above describe
  the artifact that ships rather than a paraphrase of it, and the self-test guards the invariant
  (the subagent must reference it, never fork the rubric).
- `run-eval.mjs` takes `--concurrency` (default 6 for model-backed adapters, 1 for the
  deterministic mock). Results are collected by index, so the report does not depend on
  completion order. A full agent-path run is ~3.5 minutes instead of ~25.

- **Claude Code plugin — grading with no API key.** `/plugin marketplace add SteveWeed79/forespec`
  then `/plugin install forespec@forespec` gives `/forespec:plan` and `/forespec:verify`, running
  on the subscription the user already has. Ships a `forespec-foresight` skill that loads on its
  own when payment, auth, tenancy, upload, LLM or BaaS code is being written — so the checkpoint
  arrives at *write* time rather than in review — and a `forespec-verifier` subagent carrying the
  calibrated 3/6/9 contract. Standalone API-key grading remains, and is still the CI path.
- **`agent` verifier adapter** (`verifier-eval/adapters/agent.mjs`) — the seam that path runs on.
  A coding agent grades the repo and writes a verdict file; the adapter serves those verdicts into
  the existing `verify` pipeline, so the roll-up, gaps-ahead report, run-over-run deltas and
  calibration store are shared with the API path rather than reimplemented. Selected automatically
  by `--verdicts <file>` or `FORESPEC_VERDICTS`. Fails closed on a malformed verdict (bad level,
  passing grade with no rationale, duplicate id, unparseable JSON) — a grade that can't state its
  basis never reaches the gate. An ungraded checkpoint errors rather than silently passing.
- **Per-finding `file:line` evidence.** Adapters may now return `evidence`, and `verify` prefers
  it over the selection's file list. An agent can follow a call chain and name the exact line;
  the API path packs whole files into a budget and can only cite paths.
- **`forespec checkpoints`** — emit the resolved archetype's checkpoints (rubric, reasoning
  question, assertions) as JSON. Read-only; never touches repo source. This is what an agent
  grades against.
- `scripts/sync-plugin-version.mjs`, wired into the `version` lifecycle hook, keeps the plugin
  manifest's version equal to `package.json`'s; the self-test asserts it, so a drifted manifest
  fails the publish instead of silently stalling plugin updates.
- **`forespec demo`** — a zero-setup, no-API-key scripted walkthrough of a verifier run on a
  bundled vulnerable-checkout example. Grounded in that code's real holes and rendered through
  the same code path as a live `verify`, it's the fastest way to see what the tool does (~20s).
  Honestly labelled `via demo`; the header/footer point to `forespec verify` for a live grade.
- Shared terminal renderer (`repo-verify/render-cli.mjs`) — `verify` and `demo` render a graded
  run through one source of truth, so the demo can never drift from real `verify` output.
- The bundled `vulnerable-checkout` example now ships in the package (so `demo`'s "bundled
  example" is literally present, and can be graded live with `forespec verify`).
- `forespec -v` / `--version` prints the installed version.
- CI workflow: self-test + schema validation on Node 18/20/22 for every push to `main`
  and every PR.
- Release workflow: publish to npm with provenance on a `v*` tag.
- `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.
- npm listing metadata (`repository`, `homepage`, `bugs`, `author`, `keywords`) and README
  status badges.

### Changed
- **`verify` and `gate` now REFUSE when no verifier is configured**, instead of silently
  falling back to the keyword baseline. A first run on a real repo used to print ~20
  checkpoints of "level 3 — keyword baseline found no good-signal token, defaults to risky":
  a wall of red that reads as a verdict. It was labelled honestly on every surface and that
  still wasn't enough. The refusal names which half of the config is missing and points at
  both ways to get a real grader, plus what works with no verifier at all (`demo`, `plan`,
  `init`, `checkpoints`). The `mock` baseline stays reachable as the dumb bar a real verifier
  must beat — by name (`--adapter mock`), never by accident, never trusted, and it can no
  longer certify a merge under `gate --fail` even when asked for explicitly.
- The PR gate refuses **before posting**, not only under `--fail`. A PR decorated with
  keyword-baseline findings teaches reviewers that Forespec comments are noise — a cost that
  outlives the misconfigured run. This repo's own gate workflow now skips when unconfigured,
  which is neither a red X on every PR nor the vacuous green this project exists to prevent.
- **The API verifier anchors findings to `file:line`.** Packed code is presented to it with
  per-file line numbers (restarting at each `// FILE:` header) and `evidence` is now a
  required field on its verdict; refs without a line number are dropped rather than passed off
  as anchored. Numbering is presentation-only — the packed `code` the calibration store
  fingerprints is unchanged, so historical prior-run joins survive.
- The README leads with the plugin, and with what costs nothing to try. Getting a real grade no
  longer starts with "create an API key."
- `action.yml`: `anthropic-api-key` is documented as required rather than "optional — omit for
  the $0 mock baseline."

## [0.1.0] — first public release

The verifier-first core, validated end to end.

### Added
- **CLI** (`forespec`): `init` (archetype detection), `plan` (interrogate a feature before
  building), `verify` (grade the backbone; `--html` for a visual report), `design` (live-page
  design probe), `gate` (PR/CI gate), plus `detect` / `feedback` / `calibrate` / `proficiency`.
- **Five archetypes** composed from a shared checkpoint library: `ecommerce`, `saas`,
  `ai-app`, `baas`, `portfolio`.
- **Reasoning verifier** (`claude` adapter) with an adversarial N/A verdict, plus a
  deterministic keyword `mock` baseline for exercising the harness.
- **Validation**: 0 false-greens on 52 critical bad cases, rule-of-three 95% upper bound
  ≤ 2.9% on the ecommerce/universal corpus; the newer archetypes are first-pass validated
  (see [`VALIDATION-NOTES.md`](./VALIDATION-NOTES.md)).
- **PR gate** + drop-in GitHub Action (`action.yml`), and a `prepublishOnly` self-test gate.
- **Calibration store** with a physical pattern/instance wall.
- **License**: Business Source License 1.1 (converts to Apache 2.0 on the Change Date).

[Unreleased]: https://github.com/SteveWeed79/forespec/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SteveWeed79/forespec/releases/tag/v0.1.0
