# Foresight — Field Notes: First Real-Repo Validation

Empirical learnings from running the reasoning verifier (`repo-verify/` + the
`verifier-eval` claude adapter) against a real, production-bound ecommerce app
(Next.js + MongoDB + Stripe). These feed `foresight.calibration-1.md` and the
verifier design. **Pattern-level only** — per the pattern/instance wall, no target
code, file paths, or project specifics live here; the real code was graded in a
scratch area outside this repo and never committed.

---

## What worked

- **Accuracy harness** (`verifier-eval`, claude adapter): 0 false-greens, and a
  correct verdict on every case that returned one. (The deterministic `mock`
  baseline was 96.2% with 0 false-greens.)
- **Cross-model stability**: the same backbone graded by a cheaper and a stronger
  model agreed 11/12 *exactly*. The one disagreement was a "great vs solid" (9-vs-6)
  call — never a disagreement at the shippable (≥6) boundary. → the rubric drives the
  grade, not the model's mood. Run the cheap model by default; reserve the stronger
  one for disputed or top-grade ("9") calls.
- **End-to-end value**: the verifier surfaced a genuine float-money issue
  (`data.money_precision`) on real code; a human verified it against the actual
  source and shipped a contained fix. The intended loop —
  *reasoning-flag → human verify → fix* — worked as designed.

---

## What we got wrong (and the design requirements they imply)

### 1. Snapshot-vs-snapshot "regression" detection is unreliable

Grading two independent point-in-time exports of the same project reported a
`6 → 3` *regression* on one checkpoint. Version-control history showed the flagged
property had existed since it was first written — **nothing regressed.** The larger
export simply surfaced more of the (always-present) code to the file selector, so the
verifier *saw more* and graded it harder. The "regression" was **file-coverage
variance between two snapshots, not a code change.**

**Requirement:** longitudinal / regression detection must be grounded in real version
control — compare actual commits (ideally the diff) with *consistent* file selection —
not two arbitrary snapshots. This is a strong argument for a **git-aware PR/CI gate**
as the only trustworthy surface for "what changed since," and against ever presenting
a snapshot-to-snapshot delta as a regression.

### 2. A level reflects property-presence, not blast radius

A checkpoint correctly graded `3` ("floats in money math"), but the practical exposure
was small: the display path was already correct to the cent and the refund path already
re-derived integer units, so real impact was a sub-unit stored drift plus a theoretical
aggregation error — not the "catastrophic" a bare `3` implies. A human reasonably judged
it *"worth tightening,"* not *"something broke."*

**Requirement:** a verdict needs a **reachability / blast-radius dimension** distinct
from the 3/6/9 property grade, so "technically risky but contained" reads differently
from "live exploit." This is exactly the calibration four-outcome signal from
`foresight.calibration-1.md` (*acted on flag → little/no improvement → "too strict,
lower weight/severity"*) — real-world proof that the calibration layer (build-order P2)
is load-bearing, not optional.

---

## Operational notes

- **Adapter truncation (fixed).** The claude adapter truncated verbose verdicts at
  `max_tokens: 1024` (long, list-style `gap` fields under adaptive thinking) →
  unparseable JSON. Raised to 4096 and instructed the model to keep `gap` to one or two
  sentences. Notably the failure mode was always *"couldn't finish the answer,"* never a
  wrong or dangerous verdict — 0 false-greens held throughout.
- **Static design grading is the weak spot.** Design checkpoints graded from source
  (no rendered page) are best-effort; the contrast/a11y checkpoint is the least reliable
  this way. The instrumented design layer (headless browser, build-order P3) is the real
  answer there.

---

## Implications for direction

1. The trustworthy home for "what changed / did it regress" is a **git-aware PR/CI
   gate**, not ad-hoc snapshot grading.
2. The verifier/rubric should carry **impact alongside the level**, and the calibration
   loop should down-weight flags that are repeatedly judged "right but over-severe."
3. The reasoning layer is a strong *first-pass* that must stay paired with verification
   — both real findings here were confirmed by a human before action, which is the
   design, not a workaround.
