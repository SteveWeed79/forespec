# Forespec

[![CI](https://github.com/SteveWeed79/forespec/actions/workflows/ci.yml/badge.svg)](https://github.com/SteveWeed79/forespec/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/forespec)](https://www.npmjs.com/package/forespec)
[![node](https://img.shields.io/node/v/forespec)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](./LICENSE)

*Forespec keeps you pointed in the right direction — **at the start** of a feature, **along
the way** as it grows, and **over time** by remembering your past results to catch code
degradation before it compounds. It's the domain **foresight** a senior engineer brings,
codified, and kept live through your whole build.*

You ship fast with AI coding tools. They build what you *ask* — not the non-obvious thing your
*kind* of app actually requires: an ecommerce checkout needs an **atomic stock hold**; a SaaS
needs **tenant isolation**; a payment webhook needs **authenticity**. Miss one and you find out
in month three, doing surgery on a live flow. Forespec surfaces those requirements **before you
build**, hands your AI coder a gotcha-aware spec, then grades what got built and tracks how each
part moves run-over-run — so the foresight arrives on time, and stays live.

Forespec is **not** a security scanner. Security is one row of what it checks; the rest is
correctness, data-modeling, reliability, and design — the whole backbone your archetype
requires. And AI coding tools *drive* the engine (Claude Code first); it never lives inside them.

> **Status: early build.** Five archetypes, the reasoning verifier, the plan/interrogator, the
> PR gate, and the greenfield on-ramp are here and runnable. New to this kind of project?
> [`SETUP.md`](./SETUP.md) gets you going on Windows, step by step.

## See it work in 20 seconds

No install, no API key, nothing to configure — this replays the verifier on a bundled
vulnerable-checkout example so you can see exactly what a real grade looks like:

```bash
npx forespec demo
```

It flags the non-obvious criticals (a Stripe call with **no idempotency key** → double
charges; a **stock race**; an order marked *paid* on the unverified client return), **passes**
the one that's actually fine (card data never touches your server), and surfaces a required
piece you *haven't built yet* — the discernment a grader you'd trust with "is this shippable?"
has to earn. Then point it at your own repo:

## Quickstart

```bash
# New/empty repo — DECLARE what you're building; Forespec points you and writes a build plan:
forespec start "an online store with checkout"

# Existing repo — detect the archetype from your code's metadata instead:
forespec init

# Before a feature — interrogate what it actually requires (foresight before you build):
forespec plan "add checkout flow"

# After you build — grade the backbone, and see how each checkpoint moved vs last time:
forespec verify              # real grading needs an API key — see below
forespec verify --html       # …drop a visual report you can open in a browser
forespec gate --help         # wire the PR/CI gate that comments on every pull request
```

`start` and `plan` are the **foresight-before-build** half: they surface the non-obvious,
archetype-required properties — the *"decide first"* questions and acceptance criteria — and
hand them to your AI coder as an ordered, dangerous-pieces-first spec. `verify` and `gate` are
the **keeps-it-honest** half: they grade those same checkpoints on the real code, flag what's
unsafe, surface the required backbone you *haven't built yet*, and — reading the calibration
store — show how each checkpoint moved **since your last run**, so a regression doesn't slip
through. Over time `forespec proficiency` reads how much judgment you've shown per domain
(self-facing only) and `plan` adapts how much it explains — full where you're learning, terse
where you're fluent.

`start`/`init` read only metadata (dependencies, paths, schema-model names) or your one-line
description — never your code — to pick the archetype. **Real grading needs the reasoning
verifier:** set `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` and it runs against a validated bar —
0 false-greens on 52 critical bad cases, rule-of-three 95% upper bound ≤ 2.9%
(see [`VALIDATION-NOTES.md`](./VALIDATION-NOTES.md)). That bar covers the ecommerce/universal
corpus; the newer `saas` / `ai-app` / `baas` archetypes are **first-pass** validated (full
rule-of-three pending). Without a key it falls back to a deterministic keyword `mock` baseline
that exists only to exercise the harness — it is **not a grader to trust**. Full walkthrough:
[`repo-verify/README.md`](./repo-verify/README.md).

## The loop that stays live

- **Point** — `start` / `plan` interrogate the domain and emit a gotcha-aware spec (atomic hold
  before Stripe, data-model shape before the features built on it), most-foundational first.
- **Build** — you, or your AI coder, build against that spec.
- **Verify** — `verify` / `gate` grade what actually got built, flag what's unsafe, and name the
  required backbone you haven't reached yet.
- **Remember** — every run writes to a local calibration store behind a strict **pattern /
  instance wall**, so the next run can tell you what *moved* (catching a regression) and, over
  time, sharpen the foresight itself.

That last step is the point: the standard isn't a static checklist — it **compounds** on your
work (and, opt-in later, across a shared pattern pool), while your project's specifics never
leave your machine.

## Proof — it caught a real bug on a repo that was already shipped

Pointed at a **real production ecommerce app** (a codebase it had never seen, not a fixture),
`forespec verify` returned one blocking critical: the Stripe **checkout-session creation call
carried no idempotency key**, so a double-click or a client retry could open two charges for one
cart. Confirmed real by direct code review. It also caught a subtler one *while passing that
checkpoint at level 9* — a refund idempotency key with no per-refund nonce, so two equal-amount
partial refunds collide and reconcile wrong.

Every finding was then independently re-checked against the actual source. The result, recorded
honestly in [`docs/real-repo-audit-2026-07.md`](./docs/real-repo-audit-2026-07.md):

- **0 fabricated findings, 0 false-greens** — every flag pointed at real code.
- The bias is **over-severity, not fabrication** — it would rather flag something you've already
  handled than miss something you haven't. That's the safe direction, and the candor a grader you
  trust with *"is this shippable?"* has to earn.

Not "perfect" — honest. That's the whole point.

## Design & specs (for the curious)

| File | What it is |
|---|---|
| [`FORESPEC-2.md`](./FORESPEC-2.md) | The vision: the full architecture and the moat argument. **Superseded on build *sequence*** by the build order below. |
| [`forespec.buildorder-2.md`](./forespec.buildorder-2.md) | **The authoritative roadmap.** Phases 0–7, verifier-first, each phase shippable on its own. When any doc disagrees on *what to build in what order*, this one governs. |
| [`forespec.calibration-1.md`](./forespec.calibration-1.md) | The calibration loop that turns invented weights into ones earned on real work, and the seam that lets solo data later join a shared pool without a rewrite. |
| [`library/`](./library) | The **shared checkpoint library** — every checkpoint definition (auth, payment, data, design, ai, baas, …), authored once and reused across archetypes. `resolve.mjs` composes a manifest + the library into a full archetype. |
| [`archetype.ecommerce.json`](./archetype.ecommerce.json) | The ecommerce **archetype manifest**: 20 backbone + 7 design checkpoints from the library, each with its severity for this domain. Resolves to the durable standard a verifier grades against. |
| [`archetype.ecommerce.design.json`](./archetype.ecommerce.design.json) | The **instrumented** design layer: design checkpoints decomposed into weighted, measurable sub-signals → a computed 0–10 composite. Its `model_scored` signals are deferred experiments until calibration earns them. |
| [`archetype.saas.json`](./archetype.saas.json) | The SaaS / subscription manifest — 26 checkpoints, all but 3 **reused**, 3 SaaS-specific (tenant isolation, entitlement integrity, subscription lifecycle). |
| [`archetype.portfolio.json`](./archetype.portfolio.json) | The portfolio / content manifest — 14 checkpoints, **100% composed** from the shared library (design + web + the universal set), zero new authoring. |
| [`archetype.ai-app.json`](./archetype.ai-app.json) | The **AI / LLM app** manifest — 12 checkpoints, **5 AI-specific** (prompt injection, output handling, tool-use safety, cost controls, data boundary) + 7 reused. |
| [`archetype.baas.json`](./archetype.baas.json) | The **Backend-as-a-Service (Supabase / Firebase)** manifest — 10 checkpoints, **3 BaaS-specific** (RLS enforced, client trust boundary, privileged-key exposure) + 7 reused. |

Reading order: `FORESPEC-2.md` (the why) → `forespec.buildorder-2.md` (the how and the order,
the plan of record) → `forespec.calibration-1.md` (the layer that keeps every score honest over
time) → [`library/`](./library) + `archetype.ecommerce.json` (the standard itself).

## Core principles (load-bearing, true from commit #1)

- **Pattern / instance wall.** Transferable patterns and never-leaves-the-project instance data
  live in separate stores from the first write — the legal and ethical line, and the thing that
  makes a shared pattern pool safe to opt into later.
- **Honesty mechanic.** Every score reports its level, the gap to the next, and its basis. A
  score that can't state its basis doesn't ship.
- **Stable, namespaced checkpoint ids** (e.g. `payment.webhook_authenticity`,
  `ecommerce.checkout.atomic_stock_hold`) are permanent contracts. Archetypes are *versioned*;
  checkpoints are *never silently renamed* — that's how calibration history survives.
- **Library + manifest composition.** Checkpoints are defined once in [`library/`](./library)
  and *composed* per archetype (a manifest of `{ ref, severity }`), so a fix to a shared
  checkpoint improves every archetype and a new archetype reuses instead of copies.

## Conventions

- **Doc naming.** Prose specs are `forespec.<topic>-<n>.md`; `FORESPEC-2.md` is the top-level
  vision. The trailing `-1` / `-2` are iteration numbers (higher = later).
- **Archetype versioning.** Each manifest and library file carries a semver `version` / format
  tag. Checkpoint *ids* are permanent contracts — bump the version when a definition changes,
  never rename an id.
- **`$schema`.** Files declare a `forespec/…` format tag (`forespec/archetype/v2`,
  `forespec/checkpoint-library/v1`, …) — the engine's internal contract, stable across the
  brand. JSON Schemas that validate them live in [`schemas/`](./schemas).

## Tooling

- [`bin/forespec.mjs`](./bin) — the unified `forespec` CLI (`start` / `init` / `detect` / `plan`
  / `verify` — add `--html` for a visual report — / `design` / `gate` / `feedback` / `calibrate`
  / `proficiency`), exposed for `npx`.
- [`library/`](./library) — shared checkpoint library + `resolve.mjs` (compose a manifest +
  library into a full archetype: `node library/resolve.mjs archetype.ecommerce.json`).
- [`schemas/`](./schemas) — JSON Schema for the library, the manifest, the resolved archetype,
  and the instrumented design layer, plus a zero-dependency invariant validator
  (`node schemas/validate.mjs`).
- [`verifier-eval/`](./verifier-eval) — the verifier-accuracy harness. A labeled good/bad fixture
  corpus for the critical backbone checkpoints, plus a runner that measures a verifier's
  precision/recall and **false-green rate** (`node verifier-eval/run-eval.mjs`). This is how "is
  the verifier trustworthy?" becomes a number instead of a hope.
- [`repo-verify/`](./repo-verify) — the product surface: point the verifier at a *whole real
  repo*. Archetype detection + the greenfield `start` on-ramp, the verifier CLI, the calibration
  store (the pattern/instance wall, made physical), and the git-aware **PR gate** + drop-in
  GitHub Action (`action.yml`). Start at [`repo-verify/README.md`](./repo-verify/README.md).

## License

**Business Source License 1.1** — see [`LICENSE`](./LICENSE). Free to use and self-host for any
purpose, including commercially; the one reserved right is offering **Forespec itself as a
competing hosted service**. Each released version converts to **Apache 2.0** four years after it
ships. The commitment it encodes: the local core is **free and fully useful forever** — never
crippled to force an upgrade, no dark patterns — while paid, hosted plans fund the ongoing work
that keeps the standard trustworthy; priced fairly, no lock-in.
