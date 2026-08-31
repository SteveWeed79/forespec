---
name: forespec-foresight
description: Surface the non-obvious requirements a feature carries BEFORE writing it, and build them in. Load this whenever you are about to write, scaffold, or substantially change code that takes payments (Stripe/checkout/refunds/webhooks), authenticates users or handles sessions and passwords, scopes data per user/tenant/org, holds inventory or stock, accepts file uploads, calls an LLM or runs tool-use/agent loops, or wires a Supabase/Firebase client — and whenever the user asks what they are missing, what could bite them later, or whether a feature is shippable. Also for "is this production ready", "what am I forgetting", "review this checkout/auth/upload flow".
---

# Forespec foresight

You are about to write code in a domain where the expensive mistakes are known, specific, and
almost never in the request. The user asked for a checkout flow; what they need is a checkout
flow *with an atomic stock hold placed before the payment intent*. They will not ask for that,
because knowing to ask is the expertise they are missing. Supplying it is this skill's whole job.

Forespec carries 42 such requirements, each with the reasoning question that surfaces it and
the code property that satisfies it. Use them **while you build**, not as a review afterward —
retrofitting an idempotency key into a live payment path is surgery; passing one at write time
is an argument.

## Get the requirements

```bash
forespec plan "<what you are about to build>" --json
```

If `forespec` is not on PATH, use `node "${CLAUDE_PLUGIN_ROOT}/bin/forespec.mjs"` with the
same arguments. If the repo has no `forespec.config.json`, run `forespec init` first — it
reads dependency and path metadata only, never source, and takes under a second.

Each entry gives you `reasoning` (the decide-first question), `levels.6` (what shippable
requires), `acceptance` (the properties the code must hold), and `matched` (whether it is
directly relevant to what was asked, or backbone that applies regardless).

Work from the `matched` ones. Read the unmatched backbone only when the feature plausibly
touches it.

## Use them

**Decide first, then write.** For each relevant checkpoint, answer its reasoning question
against the actual plan before any code exists. Most are answerable in a sentence. The ones
that are not are exactly the ones worth raising with the user — a design decision surfaced
now costs a message, and surfaced in month three costs a migration.

**Build to level 6.** Level 6 is shippable, and it is the bar to write to by default. Do not
ship a level 3 with a TODO; the TODO is how these become permanent. Reach for 9 (tests that
prove the property, structural enforcement over convention) when the user is clearly building
something durable, or when they ask.

**Say what you added and why — once, briefly.** The user asked for a checkout flow and is
getting an idempotency key they did not ask for. One line — *"passed an idempotency key on
the payment intent so a double-click can't open two charges"* — earns the addition. A
paragraph on each one turns useful foresight into noise, and noise is why people turn tools
like this off.

**Do not lecture about what you are not building.** If the feature does not touch refunds,
say nothing about refund integrity. The single fastest way to make this skill worthless is to
recite the archetype's whole backbone at someone who asked for one endpoint.

## When the code already exists

If the user is asking about code that is already written rather than code you are about to
write, grade it instead of rewriting it: run `/forespec:verify`, or follow
`agents/forespec-verifier.md` for the calibrated 3/6/9 contract. Report `file:line` and the
concrete gap. Do not start editing until they ask.

## Honesty

These checkpoints are a specific, opinionated backbone for a specific kind of app — not a
general correctness guarantee and not a security audit. Say that if the user reads a clean
result as "nothing is wrong with my app." A checkpoint that does not apply to what they are
building does not apply; say so and drop it rather than stretching it to fit.
