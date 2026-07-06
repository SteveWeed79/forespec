# Foresight

[![CI](https://github.com/SteveWeed79/forespec/actions/workflows/ci.yml/badge.svg)](https://github.com/SteveWeed79/forespec/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/forespec)](https://www.npmjs.com/package/forespec)
[![node](https://img.shields.io/node/v/forespec)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](./LICENSE)

*A standalone, tool-agnostic engine that forces domain **foresight before** you build a
feature, then **verifies** what actually got built against that foresight — so the expensive
discoveries (atomic stock holds, auth boundaries, data-model shape) surface in week one, not
month three.*

It draws each interrogation from a compounding **pattern library** and keeps the foresight
**live** through a plan → build → verify → correct loop. AI coding tools (Claude Code first)
are adapters that drive the engine — never the thing it lives inside.

> **Status: early build.** The specs, **five archetypes**, and runnable tooling
> (`schemas/`, `verifier-eval/`, `repo-verify/`) are here. New to this kind of project? Start with
> [`SETUP.md`](./SETUP.md) — it gets you running on Windows step by step.

## Quickstart

```bash
foresight init                      # detect your archetype, write foresight.config.json (commit it)
foresight plan "add checkout flow"  # interrogate the feature BEFORE you build it
foresight verify                    # grade your backbone with the reasoning verifier (needs an API key — see below)
foresight verify --html             # …and drop a visual report (open it in a browser) next to the run
foresight design http://localhost:3000   # measure a live page's design in a headless browser
foresight gate --help               # wire the PR/CI gate that comments on every pull request
```

That's the loop the engine keeps live: **plan → build → verify → correct.** `plan` emits a
pre-build spec (the questions to decide first + acceptance criteria); `verify`/`gate` grade
the same checkpoints after — marking what's present, flagging what's unsafe, and (the foresight
half) surfacing a **gaps ahead** section: the archetype-required backbone you *haven't built yet*,
called out in week one instead of month three. Over time `foresight proficiency` reads how much
judgment you've shown per domain (from the calibration store, self-facing only) and `plan` adapts
how much it explains — full where you're learning, terse where you're fluent.

`init` reads only metadata (dependencies, paths, schema model names) to pick the archetype —
never your code. **Real grading needs the reasoning verifier:** set `ANTHROPIC_API_KEY` +
`ANTHROPIC_MODEL` and it runs against a validated bar — 0 false-greens on 52 critical bad cases,
rule-of-three 95% upper bound ≤ 2.9% (see [`VALIDATION-NOTES.md`](./VALIDATION-NOTES.md)). That bar
covers the ecommerce/universal corpus; the newer `ai-app` and `baas` archetypes are **first-pass**
validated (0 false-greens on their initial fixtures, full rule-of-three pending). Without a
key it falls back to a deterministic keyword `mock` baseline that exists only to exercise the harness
— it is **not a grader to trust** (on the current corpus its own accuracy gate reports NO-GO). Full
walkthrough: [`repo-verify/README.md`](./repo-verify/README.md).

## The documents

| File | What it is |
|---|---|
| [`FORESIGHT-2.md`](./FORESIGHT-2.md) | The vision: the full architecture, the moat argument, and *why* the engine exists. **Superseded on build *sequence*** by the build order below (it has banners pointing there). |
| [`foresight.buildorder-2.md`](./foresight.buildorder-2.md) | **The authoritative roadmap.** Phases 0–7, verifier-first, each phase shippable and standing on its own. When any doc disagrees on *what to build in what order*, this one governs. |
| [`foresight.calibration-1.md`](./foresight.calibration-1.md) | Layer 3 — the calibration loop that turns invented weights into ones earned on real work, and the seam that lets solo data later join a shared pool without a rewrite. |
| [`library/`](./library) | The **shared checkpoint library** — every checkpoint definition (auth, payment, data, design, ai, baas, …), authored once and reused across archetypes. `resolve.mjs` composes a manifest + the library into a full archetype. |
| [`archetype.ecommerce.json`](./archetype.ecommerce.json) | The ecommerce **archetype manifest**: selects 20 backbone + 7 design checkpoints from the library and sets each one's severity for this domain. Resolves to the durable standard a verifier grades against. |
| [`archetype.ecommerce.design.json`](./archetype.ecommerce.design.json) | The **instrumented** design layer: design checkpoints decomposed into weighted, measurable sub-signals → a computed 0–10 composite. Its `model_scored` signals are deferred experiments until calibration earns them. |
| [`archetype.saas.json`](./archetype.saas.json) | The SaaS / subscription **archetype manifest** — 26 checkpoints, all but 3 **reused** from the library, 3 SaaS-specific (tenant isolation, entitlement integrity, subscription lifecycle). |
| [`archetype.portfolio.json`](./archetype.portfolio.json) | The portfolio / content **archetype manifest** — 14 checkpoints, **100% composed** from the shared library (design + web + the universal security/privacy set), zero new authoring. |
| [`archetype.ai-app.json`](./archetype.ai-app.json) | The **AI / LLM app archetype manifest** — 12 checkpoints, **5 AI-specific** (prompt injection, output handling, tool-use safety, cost controls, data boundary) + 7 reused. A safety standard for the thing the ICP is actually building. |
| [`archetype.baas.json`](./archetype.baas.json) | The **Backend-as-a-Service (Supabase / Firebase) archetype manifest** — 10 checkpoints, **3 BaaS-specific** (RLS enforced, client trust boundary, privileged-key exposure) + 7 reused. |

## Reading order

1. `FORESIGHT-2.md` — the why and the destination.
2. `foresight.buildorder-2.md` — the how and the order (this is the plan of record).
3. `foresight.calibration-1.md` — the layer that keeps every score honest over time.
4. [`library/`](./library) + `archetype.ecommerce.json` — the standard itself (shared checkpoints + the ecommerce manifest that composes them); `archetype.ecommerce.design.json` is the instrumented design layer.

## Core principles (load-bearing, true from commit #1)

- **Pattern / instance wall.** Transferable patterns and never-leaves-the-project instance
  data live in separate stores from the first write — the legal and ethical line.
- **Honesty mechanic.** Every score reports its level, the gap to the next, and its basis. A
  score that can't state its basis doesn't ship.
- **Stable, namespaced checkpoint ids** (e.g. `payment.webhook_authenticity`,
  `ecommerce.checkout.atomic_stock_hold`) are permanent contracts. Archetypes are *versioned*,
  checkpoints are *never silently renamed* — that's how calibration history survives.
- **Library + manifest composition.** Checkpoints are defined once in [`library/`](./library)
  and *composed* per archetype (a manifest of `{ ref, severity }`), so a fix to a shared
  checkpoint improves every archetype and archetype #2 reuses instead of copies.

## Conventions

- **Doc naming.** Prose specs are `foresight.<topic>-<n>.md`; `FORESIGHT-2.md` is the
  top-level vision. The trailing `-1` / `-2` are iteration numbers (higher = later).
- **Archetype versioning.** Each manifest and library file carries a semver `version` / format
  tag. Checkpoint *ids* are permanent contracts — bump the version when a definition changes,
  never rename an id.
- **`$schema`.** Files declare a Foresight format tag (`foresight/archetype/v2`,
  `foresight/checkpoint-library/v1`, …). JSON Schemas that validate them live in
  [`schemas/`](./schemas) — see that directory's README.

## Tooling

- [`library/`](./library) — shared checkpoint library + `resolve.mjs` (compose a manifest +
  library into a full archetype: `node library/resolve.mjs archetype.ecommerce.json`).
- [`schemas/`](./schemas) — JSON Schema for the library, the manifest, the resolved archetype,
  and the instrumented design layer + a zero-dependency invariant validator
  (`node schemas/validate.mjs`).
- [`verifier-eval/`](./verifier-eval) — the verifier-accuracy harness. A labeled good/bad
  fixture corpus for the critical backbone checkpoints, plus a runner that measures a
  verifier's precision/recall and **false-green rate** (`node verifier-eval/run-eval.mjs`).
  This is how "is the verifier trustworthy?" becomes a number instead of a hope — the
  validation gate the whole tool rests on.
- [`repo-verify/`](./repo-verify) — the product surface: point the verifier at a *whole real
  repo*. Archetype detection (`foresight init`), the verifier CLI, the calibration store
  (the pattern/instance wall, made physical), and the git-aware **PR gate** + drop-in GitHub
  Action (`action.yml`). Start at [`repo-verify/README.md`](./repo-verify/README.md).
- [`bin/forespec.mjs`](./bin) — the unified `foresight` CLI (`init` / `detect` / `plan` /
  `verify` — add `--html` for a visual report — / `design` / `gate` / `feedback` / `calibrate` /
  `proficiency`), exposed for `npx`.

## License

Not finalized yet (it lands with the package name). The commitment it must encode: **the
local core is free and fully useful forever** — never crippled to force an upgrade, no dark
patterns — while **paid plans fund the hosting and the ongoing work that keeps the standard
trustworthy**, priced fairly and transparently, without lock-in. That's an **open-core /
source-available** shape — the leading candidate is the **Business Source License 1.1** (free
to use and self-host for any purpose; only offering Foresight as a competing *hosted service*
is reserved; converts to a fully open license on a change date). Nothing here is licensed
until it lands.
