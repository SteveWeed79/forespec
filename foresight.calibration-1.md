# Foresight — Layer 3: The Calibration Loop

*The layer that makes every score honest over time. The archetype defines the standard;
the verifier scores against it; THIS layer checks those scores against reality and tunes
them. Without it, every number is my best guess forever. With it, the standard becomes a
measured artifact that improves with use.*

---

## The core signal (your reframe, which beat my options)

Ground truth is not "did a bug bite" and not "does a human like it." It is:

> **The tool flagged something. Did acting on the advice end up making sense?**

The thing under test is the *advice*, because the advice is the tool's only value. Every
flag produces one of four outcomes, and each teaches something specific:

| User did | What happened | What it means for the checkpoint |
|---|---|---|
| Acted on flag | Things got better / held up | HIT — checkpoint earned trust, weight justified |
| Acted on flag | No improvement / made worse | FALSE POSITIVE — too strict, lower weight/severity |
| Ignored flag | Got bitten later | MISS that was caught — right call, RAISE weight |
| Ignored flag | Fine, no consequence | Possible over-flagging — watch, maybe lower |

The pair that must be captured is always: **(what the tool predicted) + (what reality did)**,
joined to the same artifact. Feedback without that pairing is unusable for calibration —
the pairing is the product, not the volume.

---

## THE SEAM — what must be true NOW so solo data melds with future user data later

This is the actual question. The answer is: design the data so that from day one it is
shaped like a contribution to a shared pool, even while the pool has exactly one member (you).
Get these right now and multi-user is a switch, not a rewrite. Get them wrong and you re-log
everything later.

### 1. Pattern/instance separation, enforced at write time
Every calibration record splits into two objects that are stored separately:
- **PATTERN record (shareable):** the checkpoint id, the score it gave, the outcome class
  (hit/false-positive/miss/over-flag), the *archetype-level* context (e.g. "ecommerce
  checkout, payment step"), and the signal breakdown that drove the score. NO project
  identity, NO code, NO content.
- **INSTANCE record (never leaves the project):** the actual repo, file paths, the specific
  code, the project name. Stays local, always.
The pattern record is what could one day join a shared pool. The instance record is what
keeps it legal and non-creepy. If these are tangled in one object now, you can never safely
share later. Separating them costs nothing today and is the whole seam.

### 2. Stable checkpoint identity
Calibration data is keyed to checkpoint ids (`ec.checkout.atomic_stock_hold`) and signal ids
(`cta_dominance`), not to free text. This is why ids must be stable and namespaced now —
your hit/miss data on `ec.checkout.atomic_stock_hold` becomes directly poolable with a future
user's data on the SAME id. Rename a checkpoint and you orphan its history. Treat ids as
permanent contracts; version archetypes, never silently rename checkpoints.

### 3. Source-and-reliability tagging on every record
Every calibration record carries a `source` and a `reliability` tier, because someday the pool
mixes them and they must never blend blindly:
- `objective_outcome` (reality graded it — oversell happened, override held up): highest
- `expert_rating` (someone with real judgment scored the page): high
- `self_observed` (you watched your own commit/outcome): high FOR YOU, medium in a pool
- `casual_reaction` ("looks nice"): lowest — measures appeal, not correctness; may inform
  only appeal-type signals, never correctness checkpoints
Tagging now means your solo `self_observed` data carries its honest weight when it later sits
next to a stranger's `casual_reaction` — the pool can down-weight the weak stuff automatically
instead of being poisoned by it.

### 4. Artifact fingerprint, not artifact content
Each record stores a *fingerprint* that lets a later outcome be joined back to the score that
predicted it (e.g. a hash of the relevant code region + timestamp + checkpoint id). The
fingerprint proves "this outcome belongs to that prediction" WITHOUT storing the code itself.
This is how passive outcome logging works across time and how it stays shareable: the pool
sees "a checkout matching pattern X had outcome Y", never the checkout.

### 5. Weight-delta as the unit of learning
Calibration does not overwrite weights directly. It produces *proposed deltas* with the
evidence behind them ("cta_dominance: +0.04, based on 9 hits / 1 false-positive, source mix
8 self_observed / 2 objective"). Solo, you review and accept deltas. In a pool, deltas from
many users aggregate before anyone's weights move. Same mechanism at both scales — which is
exactly why building it this way now means multi-user needs no new machinery, just aggregation
in front of the same delta step.

---

## Where the data lives (the spec's argued answer)

**SQLite, local, from day one.** Not flat files. Reason: calibration is inherently relational
(predictions joined to outcomes joined to checkpoints over time) and you will query it
("show me every false-positive on design checkpoints"). Flat files force a painful migration
the moment that join matters, and the join matters almost immediately. SQLite is a single
local file (so it's still "just on your disk," zero infra, zero privacy surface) but it's
queryable and it maps cleanly to a future shared store — the pattern table you keep locally is
literally the shape of the rows you'd one day contribute. Instance data lives in a separate
table (or separate db) that is marked never-sync. The physical separation enforces the seam.

---

## What is observable solo vs what is NOT (the honest map)

Passive logging only works for outcomes the tool can actually see from where it sits. Mapping
this now prevents building a loop that assumes data it can never get.

| Outcome | Observable passively (solo)? |
|---|---|
| Did you act on a flag (code changed in the flagged region) | YES — via commit/diff inspection |
| Did you override/dismiss a flag | YES — explicit dismiss, or flag persists unchanged |
| Did an ignored flag bite later (same region churns again, bug-fix commit) | PARTIALLY — heuristic from later commits |
| Did acting actually improve real-world metric (conversion, oversell rate) | NO solo — needs analytics you may not have; mark as "ask, don't assume" |
| Aesthetic outcome (did it end up looking good) | NO passively — needs an explicit rating moment |

The honest consequence: the loop learns *action and recurrence* well from passive signals, and
learns *real-world impact* only where you have analytics or are willing to record a judgment.
Don't design the loop to assume impact data it can't see — design it to learn from what's
observable and to clearly mark what it's missing.

---

## v1 scope (solo, seam-ready, buildable in counter-time)

BUILD:
- Local SQLite with separate pattern / instance tables (the seam, physical)
- Verifier writes a prediction record on every run (score + signals + fingerprint + ids)
- Passive action-detection: did the flagged region change in a later commit (yes/no/override)
- A simple recurrence heuristic: did a "fixed" region get flagged again later
- Proposed weight-deltas surfaced for your review; you accept/reject; accepted deltas tune
  the archetype weights — turning my invented 0.30s into earned numbers

DO NOT BUILD YET (seam designed, machinery deferred):
- Any network sync, upload, or shared pool
- Delta aggregation across users
- Anything that touches another person's data
- Real-world impact capture beyond what your own analytics already expose

> The point of v1 calibration: replace "my best guess at weights" with "weights earned on
> your own real work." That alone makes the tool yours instead of mine. The seam means that
> when other builders eventually arrive, their data joins a structure already built to receive
> it honestly — pattern not instance, tagged by reliability, aggregated as deltas — with no
> rewrite and no privacy retrofit.

---

## The honest status of this layer

Unvalidated, like the rest. The four-outcome model is sound; the recurrence heuristic is a
reasoned guess that itself needs checking against whether "region re-flagged" really
correlates with "the original advice was right." Even the calibration loop has a thing to
calibrate. That's not a flaw to hide — it's the same discipline all the way down: state what's
measured, name what's assumed, let reality move the numbers.
