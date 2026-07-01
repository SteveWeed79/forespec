# Verifier-accuracy harness

The Foresight thesis lives or dies on one question: **is the reasoning verifier
actually trustworthy on real code?** A checker you can't trust is worse than no
checker — a false "shippable" is more dangerous than silence, because you build
on top of it. This harness turns that question from a hope into a measured number.

It runs a verifier over a labeled corpus of known-good and known-bad checkpoint
implementations and reports how often it agrees with the gold labels — with
emphasis on the **false-green rate**: how often it calls a *known-bad*
implementation shippable.

## Run it

```bash
# Naive keyword baseline — no API key needed. Proves the pipeline and sets a floor.
node verifier-eval/run-eval.mjs

# The real reasoning verifier (a Claude model grades each fixture):
export ANTHROPIC_API_KEY=sk-...
export ANTHROPIC_MODEL=<a current Claude model id>   # see platform.claude.com/docs → models
node verifier-eval/run-eval.mjs --adapter claude --out verifier-eval/report.json
```

No build step, no dependencies (Node 18+). Exit code is non-zero if any fixture
errored, so CI catches a broken run.

## What it measures

Each fixture has a `gold_level` (3 = the vulnerability is present; 6 = the
property holds). The verifier predicts a level; the harness buckets it into
*shippable* (≥ 6) vs not and classifies each case:

| | gold = bad (3) | gold = good (6) |
|---|---|---|
| **predicted shippable** | 🔴 **false green** (dangerous) | ✅ true positive |
| **predicted risky** | ✅ true negative (caught it) | ⚠️ false alarm |

Reported per-checkpoint and overall:

- **accuracy** — correct shippable/risky calls
- **false-green rate** — false greens ÷ bad implementations. *The number that decides whether the tool is trustworthy.* A verifier with a high false-green rate is dangerous; drive this toward zero before trusting any green.
- **false-alarm rate** — flagged-but-fine ÷ good implementations. High here means alarm fatigue.
- **exact-level agreement** — predicted level == gold level

## The launch gate: how much is enough?

Accuracy is measured **per checkpoint**, not per site — labeled cases are cheap
and carry all the statistical power; whole sites are expensive and carry almost
none. The one number that defines "trustworthy" is the **false-green rate on
criticals**. Sizing follows the **rule of three**: run *n* bad cases, see zero
false-greens, and the 95% upper bound on the true rate is ≈ `3/n`.

| bad critical cases, 0 false-greens | 95% upper bound |
|---|---|
| 30 | ≤ ~10% |
| ~50 | ≤ ~6% — a defensible launch bar |
| 100 | ≤ ~3% — strong |

The harness prints this automatically as a **CRITICALS launch gate**:

- **GO** — 0 false-greens and the bound is ≤ 6%.
- **PROVISIONAL** — 0 false-greens but too few cases yet (bound > 6%); add variants.
- **NO-GO** — a critical came back shippable when it shouldn't. Stop and fix; this
  is not a "tune later." The run **exits non-zero** on a NO-GO.

## How to read a result

The mock keyword baseline now returns **NO-GO** — and that's the corpus working.
The bad variants deliberately contain the "good" keywords (an `idempotencyKey` on
creation but no webhook dedupe; a signature check against the parsed body instead
of the raw bytes), so keyword-matching gets fooled. A baseline that can't tell
them apart *should* fail. The real test is the `claude` adapter clearing the bar
the baseline can't: **zero false-greens on criticals**, GO with a tight bound.

## Corpus

`fixtures.json` is the labeled manifest; `fixtures/<checkpoint>/{bad*,good*}.ts`
are the samples. It covers the critical backbone checkpoints with **~4 bad + ~3
good variants each** — every bad variant a *distinct failure mode* (real power,
not near-duplicates), and **no "tells"**: bad fixtures read like plausible real
code with no comment naming the flaw, so a reasoning model must actually detect
it rather than read a label. The gold labels live in `fixtures.json`, not the
code. Fixtures are synthetic and **pattern-level — fully shareable** (no real
project code; that's the pattern/instance wall).

Because the backbone checkpoints are **shared across archetypes** (library
composition), proving `payment.webhook_authenticity` here validates it for
ecommerce, SaaS, and portfolio at once. A new archetype only costs labeled cases
for its *net-new* checkpoints — never a full re-validation.

## Real-repo pass (the part your bank account feels)

The labeled corpus buys statistical confidence for pennies. Real repos buy
something different — **generalization**: does it false-alarm on messy real code?
That needs surprisingly few. For one archetype (ecommerce), ~5 repos:

```bash
export ANTHROPIC_API_KEY=sk-...   ANTHROPIC_MODEL=<a current cheap Claude model id>
# known-GOOD (expect few/no critical flags):
node repo-verify/verify.mjs /path/to/vendure     --adapter claude --no-store
node repo-verify/verify.mjs /path/to/medusa      --adapter claude --no-store
# known-BAD (expect it to catch the planted holes):
node repo-verify/verify.mjs /path/to/juice-shop  --adapter claude --no-store
node repo-verify/verify.mjs /path/to/NodeGoat    --adapter claude --no-store
# plus your own project (KTXZ ×2 already run). Opus spot-check anything borderline.
```

Go/no-go for the whole thing: **zero false-greens** across the ~50 bad criticals
*and* the known-bad repos, with no wild false-alarms on the good ones. One-time
spend is roughly **$15–30**; memoization makes re-runs near-free.

## Architecture

`adapters/` is the model seam the engine is built around — `verify({checkpoint, code})`
returns `{ level, confidence, gap, rationale }`. `mock.mjs` is a dependency-free
baseline; `claude.mjs` is the real reasoning verifier (configured entirely from
the environment, so no model id or key lives in the repo). Swap the adapter, not
the harness — the same corpus measures any verifier implementation.
