# Real-repo precision audit — ecommerce (July 2026)

Forespec's own `verify` output on a **real production ecommerce repo** (not a fixture)
was independently audited at the code level — every finding re-checked against the
actual source. This is a *precision* measurement to complement the fixture-corpus
false-green numbers (which measure the opposite failure). It is recorded here
pattern-level and anonymized; no repo name, file paths, or private code appear.

## Headline

- **0 fabricated findings** — every flag pointed at real code and a real pattern.
- **0 false-greens** — nothing forespec passed (level ≥ 6) was actually broken.
- **Systematic bias: over-severity, not fabrication.** Of ~19 findings verdicted:
  ~8 clean hits (accurate, gap real, level fair), ~4 over-severe, 1 right-verdict /
  wrong-reasoning. The two sharpest catches (a missing creation-side payment
  idempotency key, and a refund idempotency-key collision on equal-amount partials)
  were confirmed real.

The tool errs toward caution — it would rather flag something you've handled than
miss something you haven't. That is the safe direction, but the audit surfaced one
genuine hole and one systemic quality drag.

## Lessons (with disposition)

### 1. Comment-credit vector — the one real false-green risk  · *paid revalidation*
A security checkpoint was graded a pass, and its rationale **credited a control that
appeared only in code comments / naming, not in an actual implementation.** The
outcome happened to be correct (the control was genuinely present elsewhere), but
crediting a control from a comment is exactly how a false-green occurs on a repo
where the comment lies. This is the only finding that touches the core "no
false-greens" promise.
- **Fix:** the grader must require a control to be present *in code*; never infer or
  credit it from comments, documentation, or naming. Grading-prompt change → batches
  into the paid re-validation.

### 2. Over-severity from thin slices — selection, not rubric  · *recall fixtures + paid revalidation*
Several checkpoints under-credited controls that **existed in the repo but were not
in the graded slice** — a stored currency field, a middleware CSP, a webhook
replay/timestamp tolerance. The grader treated "not in the shown code" as "absent"
and graded down. One case went further and asserted a field was *not stored* when it
was (a factual error of absence, same root cause).
- **Fix (a):** selection reach — reliably pull the relevant model / middleware /
  webhook files into the per-checkpoint slice. Selection change → recall fixtures.
- **Fix (b):** grader wording — say "not observed in the provided files," never
  "does not exist." Grading-prompt change → paid re-validation.

### 3. Taxonomy gap — the calibration store can mis-learn from this  · *free*
The over-severity in #2 is **selection-driven, not rubric-driven** — but the feedback
vocabulary (`hit | false-positive | over-severe | ignored`) cannot express that
distinction. Recording these as `over-severe` risks the calibration layer lowering
the checkpoint's severity and **manufacturing a false-green** on the next repo that
*genuinely* lacks a CSP / currency field / replay window.
- **Fix:** add a `missed-evidence` verdict that records "the flag was over-severe
  because selection didn't surface the evidence." It must **not** count toward any
  severity-lowering proposal. Calibration plumbing only (no grading-prompt change),
  self-test-covered → free.

## Hard guardrail

**Do not lower any checkpoint severity off this audit.** The over-severity is an
evidence/selection problem, not a too-strict rubric. Lowering severity would trade a
little less noise on this repo for false-greens on every repo that hasn't implemented
the control. Fix selection and grader wording instead.

## Disposition summary

| Item | Path touched | Cost |
|---|---|---|
| This ledger | docs | free |
| `missed-evidence` verdict (+ calibrate: never lowers severity) | feedback / store / calibrate | free (self-test) |
| Comment-credit guard | grader prompt | paid revalidation |
| "Not observed in provided files" wording | grader prompt | paid revalidation |
| Selection reach (money / CSP / webhook files) | selection | recall fixtures + paid revalidation |

The three grading/selection items share **one** paid re-validation run (~cents) so a
single measured pass re-certifies the false-green numbers after all of them land.
