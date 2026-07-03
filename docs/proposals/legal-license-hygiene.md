# Proposal: `legal.license_hygiene` — a universal license-hygiene checkpoint

**Status:** proposed, **post-v1**. Not a launch blocker. Captured here so the idea
isn't lost; it must earn its place with the same discipline as every shipped
checkpoint (fixtures + rule-of-three false-green gate + a real-repo pass) before it
goes live. No stub, no half measure.

## Why

The ICP is a solo/small-team builder using AI, with no legal team — the same reason
Foresight exists for the *security* spine. Licensing is a parallel blind spot that
bites late and expensively:

- **No LICENSE file** → the work is "all rights reserved" by default. Nobody can
  legally use, fork, or contribute, and that's rarely what the author intended.
- **Undeclared / invalid `license` field** in `package.json` (or the ecosystem
  equivalent) → tooling and downstream consumers can't reason about terms.
- **Dependency conflict (the expensive one)** → an **AGPL/GPL** package pulled into a
  closed-source product or hosted service is a real, late, painful discovery. This is
  exactly Foresight's "surface it in week one, not month three" ethos, applied to law
  instead of security.

We just hand-did all of this for Foresight itself (BSL 1.1, LICENSE, SPDX id). A
checkpoint would automate the *validation* half.

## Scope — validation only, not recommendation

This is the load-bearing honesty line:

- **In scope (mechanically checkable → gradable):**
  1. LICENSE file present at repo root.
  2. Declared license is a valid SPDX identifier and matches the LICENSE file.
  3. Dependency licenses are compatible with the declared license — flag strong
     copyleft (AGPL-3.0, GPL-3.0, GPL-2.0) pulled into a project declaring a
     permissive/proprietary/source-available license.
- **Out of scope (subjective → NOT a graded level):** *which* license to pick. That's
  context-dependent judgment (monetization intent, moat appetite — the BSL-vs-Apache
  conversation). Per the honesty mechanic — *a score that can't state its basis doesn't
  ship* — recommendation belongs on the **`plan` side** as a decision-helper (surface
  the tradeoffs, ask the right questions), never as a `verify` level.

## Shape (fits the existing model)

- **Placement:** universal checkpoint (like the `security.*` / `data.*` set), reused
  across every archetype via manifest `{ ref, severity }`. Likely `severity: high`
  (a licensing mistake is serious but rarely a live security exploit).
- **Id:** `legal.license_hygiene` (permanent contract, namespaced).
- **Confidence:** `reasoned`. The presence/SPDX checks are near-`established`; the
  dependency-compatibility matrix carries genuine edge cases (dual-licensing, `OR`
  expressions, dev-only deps, static-vs-dynamic linking nuance) that keep it out of
  `established`.
- **Assertions:** mostly `type: static` — reads metadata only (LICENSE, `package.json`,
  the lockfile / `node_modules/*/package.json` license fields). **Never reads product
  source**, same contract as `init`. A `reasoning` layer adjudicates the ambiguous
  compatibility calls (e.g. "is this AGPL dep actually reachable in the shipped
  artifact, or dev-only?").
- **Levels (draft):**
  - **3** — no LICENSE file, or declared license absent/invalid, or a strong-copyleft
    dep conflicts with a non-copyleft declared license.
  - **6** — LICENSE present + valid SPDX + declaration matches file; no unresolved
    copyleft conflict in runtime deps.
  - **9** — all of 6, plus every runtime dependency's license is resolved and
    compatible (no unknowns), and the copyleft-vs-declared-license reasoning is clean.

## Definition of done (the bar it must clear before shipping)

1. `library/checkpoints/legal.json` with the checkpoint definition.
2. Selection keywords in `select.mjs` (LICENSE, package.json, lockfiles).
3. Detection: it's *universal*, so it applies to every archetype — add the `ref` to
   each manifest (or model it as an always-on universal, matching how the security set
   is composed).
4. Fixtures: ≥4 *diverse* bad variants (missing file / invalid SPDX / mismatched
   declaration / AGPL-in-proprietary) + good variants guarding the false-alarm rate —
   the same ≥4-bad floor the self-test enforces on every discovered manifest.
5. Rule-of-three paid eval: 0 false-greens, ≤ the launch bar.
6. One real-repo pass: correct on a repo with a real conflict *and* correct (no phantom
   flag) on a cleanly-licensed repo.

Until 4–6 are green, it does not ship. Everything else in the library earned its place
that way; this earns it the same way or it waits.

## Companion (not this checkpoint): the `plan`-side license helper

The *recommendation* half — "given how you intend to monetize, here are the license
shapes and their tradeoffs" — is a natural `foresight plan` decision-helper. It asks,
it doesn't grade. Worth a separate, smaller proposal once the validation checkpoint
lands.
