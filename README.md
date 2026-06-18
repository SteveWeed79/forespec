# Foresight

*A standalone, tool-agnostic engine that forces domain **foresight before** you build a
feature, then **verifies** what actually got built against that foresight — so the expensive
discoveries (atomic stock holds, auth boundaries, data-model shape) surface in week one, not
month three.*

It draws each interrogation from a compounding **pattern library** and keeps the foresight
**live** through a plan → build → verify → correct loop. AI coding tools (Claude Code first)
are adapters that drive the engine — never the thing it lives inside.

> **Status: design stage.** This repo currently holds the specs and the first archetype, not
> code yet. Read the docs below in order; the JSON archetypes are already usable as the
> standard a verifier scores against.

## The documents

| File | What it is |
|---|---|
| [`FORESIGHT-2.md`](./FORESIGHT-2.md) | The vision: the full architecture, the moat argument, and *why* the engine exists. **Superseded on build *sequence*** by the build order below (it has banners pointing there). |
| [`foresight.buildorder-2.md`](./foresight.buildorder-2.md) | **The authoritative roadmap.** Phases 0–7, verifier-first, each phase shippable and standing on its own. When any doc disagrees on *what to build in what order*, this one governs. |
| [`foresight.calibration-1.md`](./foresight.calibration-1.md) | Layer 3 — the calibration loop that turns invented weights into ones earned on real work, and the seam that lets solo data later join a shared pool without a rewrite. |
| [`archetype.ecommerce.json`](./archetype.ecommerce.json) | The ecommerce **archetype**: 12 backbone + 7 design checkpoints, each with levels (3/6/9), a confidence tag, and reasoning + assertion verification. The durable, transferable standard a verifier grades a repo against. |
| [`archetype.ecommerce.design.json`](./archetype.ecommerce.design.json) | The **instrumented** design layer: design checkpoints decomposed into weighted, measurable sub-signals → a computed 0–10 composite. Its `model_scored` signals are deferred experiments until calibration earns them. |

## Reading order

1. `FORESIGHT-2.md` — the why and the destination.
2. `foresight.buildorder-2.md` — the how and the order (this is the plan of record).
3. `foresight.calibration-1.md` — the layer that keeps every score honest over time.
4. The two `archetype.ecommerce.*.json` files — the standard itself.

## Core principles (load-bearing, true from commit #1)

- **Pattern / instance wall.** Transferable patterns and never-leaves-the-project instance
  data live in separate stores from the first write — the legal and ethical line.
- **Honesty mechanic.** Every score reports its level, the gap to the next, and its basis. A
  score that can't state its basis doesn't ship.
- **Stable, namespaced checkpoint ids** (e.g. `ec.checkout.atomic_stock_hold`) are permanent
  contracts. Archetypes are *versioned*, checkpoints are *never silently renamed* — that's
  how calibration history survives.

## Conventions

- **Doc naming.** Prose specs are `foresight.<topic>-<n>.md`; `FORESIGHT-2.md` is the
  top-level vision. The trailing `-1` / `-2` are iteration numbers (higher = later).
- **Archetype versioning.** Each archetype JSON carries a semver `version`. The two ecommerce
  files are versioned independently (`1.1.x` base, `2.x` instrumented design layer).
- **`$schema`.** The archetype files declare a Foresight format tag (`foresight/archetype/...`).
  JSON Schemas that validate their structure live in [`schemas/`](./schemas) — see that
  directory's README for how to run validation.

## License

Not chosen yet. The values docs commit to a *local core that is free and fully useful
forever, with paid only ever covering genuine infrastructure cost* — which points toward a
source-available or custom license rather than a default permissive one. **This is a
deliberate open decision**, left to the project owner; nothing here is licensed until it lands.
