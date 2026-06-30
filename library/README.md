# Checkpoint library

The shared, transferable checkpoint definitions Foresight grades against.
Archetypes don't redefine checkpoints — they **compose** from this library.

## Why this exists

Checkpoints recur across site types: `auth.access_control` (IDOR),
`data.money_precision`, `payment.webhook_authenticity`, `design.contrast_a11y`
matter for ecommerce *and* SaaS *and* marketplaces. Authoring each one **once**
here and selecting it per archetype means:

- archetype #2 **reuses** instead of copies — the moat compounds instead of being
  re-typed;
- a fix to a shared checkpoint improves **every** archetype at once;
- calibration data accrues per stable checkpoint id, poolable across archetypes
  and (eventually) users.

## The split: definition vs. stakes

| | Lives in | Carries |
|---|---|---|
| **What to check** (transferable) | a **library checkpoint** (here) | `id, domain, confidence, title, why, levels, verify` — **no severity** |
| **How much it matters here** (contextual) | an **archetype manifest** (`../archetype.*.json`) | `{ ref, severity }` per selected checkpoint |

The same checkpoint can be `critical` in one archetype and `medium` in another.
That's the manifest's job, not the library's. The **resolver**
(`resolve.mjs`) merges them into the full checkpoint shape every tool consumes:

```bash
node library/resolve.mjs archetype.ecommerce.json   # prints the resolved archetype
```

## ID scheme (permanent contracts)

Ids are stable, namespaced, and never silently renamed (calibration history keys
to them — see `../foresight.calibration-1.md`). Two namespaces:

- **Cross-domain / shared** → domain-neutral: `auth.access_control`,
  `data.money_precision`, `payment.webhook_authenticity`, `security.abuse_controls`,
  `design.contrast_a11y`.
- **Domain-specific** → domain-prefixed: `ecommerce.checkout.atomic_stock_hold`,
  `ecommerce.catalog.variant_model`.

> The ids were re-based to this scheme deliberately **now, before any calibration
> data exists** — once history accrues, renaming orphans it. This is the one free
> moment to get them right.

## Layout

```
library/
  resolve.mjs                  the resolver (manifest + library -> resolved archetype)
  checkpoints/
    auth.json        auth.*        (cross-domain)
    data.json        data.*        (cross-domain)
    payment.json     payment.*     (cross-domain — ecommerce, SaaS, marketplace, booking)
    security.json    security.*    (cross-domain)
    design.json      design.*      (cross-domain — every site type)
    ecommerce.json   ecommerce.*   (domain-specific)
```

Each file is `{ "$schema", "concern", "checkpoints": [...] }`. Validated by
`../schemas/library.checkpoint.schema.json`; ids-unique + fields checked by
`../schemas/validate.mjs` (`npm run check`).

## Adding to it

- **New checkpoint** → add it to the matching concern file (or a new one). Pick a
  cross-domain id if ≥2 archetypes could use it; a domain-prefixed id otherwise.
  Ship it with fixtures in `../verifier-eval/` (a checkpoint with no way to measure
  its verifier accuracy isn't done).
- **New archetype** → write `../archetype.<name>.json` as a manifest that `ref`s the
  library checkpoints it needs (reusing shared ones) and assigns each a `severity`.
  Add domain-specific checkpoints to a new `checkpoints/<name>.json` only when no
  shared checkpoint fits.

Both are PATTERN-level and shareable; project-specific (instance) data never lives
here.
