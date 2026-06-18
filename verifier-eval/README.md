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

## How to read a result

The mock baseline reports ~92% accuracy with a false-alarm on
`ec.order.state_integrity` — by design: the baseline has no keywords for that
checkpoint, so it flags everything. That's the point — a verifier that doesn't
*understand* a checkpoint shows up here as alarm noise (or, worse, as false
greens). The real test is the `claude` adapter clearing the bar the baseline
can't: **near-zero false greens across all six**, matching or beating the
baseline's accuracy without its blind spot.

## Corpus

`fixtures.json` is the labeled manifest; `fixtures/<checkpoint>/{bad,good}.ts`
are the samples. v1 covers the **6 severity:critical backbone checkpoints**.
The fixtures are synthetic and **pattern-level — fully shareable** (no real
project code; that's the pattern/instance wall). Expand the corpus over time:
more labeled cases (and `9`-level "great" fixtures, and trickier near-misses)
tighten the accuracy estimate and harden the verifier you're trusting.

## Architecture

`adapters/` is the model seam the engine is built around — `verify({checkpoint, code})`
returns `{ level, confidence, gap, rationale }`. `mock.mjs` is a dependency-free
baseline; `claude.mjs` is the real reasoning verifier (configured entirely from
the environment, so no model id or key lives in the repo). Swap the adapter, not
the harness — the same corpus measures any verifier implementation.
