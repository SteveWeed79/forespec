# Forespec — Field Notes: First Real-Repo Validation

Empirical learnings from running the reasoning verifier (`repo-verify/` + the
`verifier-eval` claude adapter) against a real, production-bound ecommerce app
(Next.js + MongoDB + Stripe). These feed `forespec.calibration-1.md` and the
verifier design. **Pattern-level only** — per the pattern/instance wall, no target
code, file paths, or project specifics live here; the real code was graded in a
scratch area outside this repo and never committed.

---

## ⚠ Revalidation owed (post-audit, July 2026) — scope proven narrow

The July 2026 adversarial audit fixed verdict-integrity bugs, several touching the
grading path. An impact analysis then bounded exactly which measured numbers they can
affect (verified against the code, not assumed):

- **Adapter assertion split (runtime → context):** only checkpoints WITH runtime
  assertions get a different prompt — all 8 are design/web checkpoints, **none critical**.
  The false-green corpus (criticals only) never sees those prompts. → numbers unaffected.
- **Selection changes (budget packer, abuse_controls keywords):** the corpus eval reads
  fixture files directly and never calls select.mjs; abuse_controls is severity:high
  everywhere (not in the FG corpus). → numbers unaffected. (These changes affect
  repo-level runs — where they *reduce* false-green risk.)
- **Fail-closed verdict validation:** can only convert previously-accepted verdicts into
  ERRORS, and the eval exits non-zero on errors — an error cannot score as a false-green.
  → numbers can only get stricter.
- **`baas.rls_enforced` reasoning (+storage sentence):** the ONE change to a critical's
  grading prompt. Its ~8 corpus trials are the only stale ones. In-context review of its
  bad fixtures (table-RLS failures) shows the additive sentence has no mechanism to flip
  them — but per this project's own rule, that is a hunch, not a measurement.

**Net:** of the 104 + 66 critical trials, only `baas.rls_enforced`'s were invalidated —
and that debt is now PAID. **Re-measured 2026-07-08 on the updated prompt (post-audit
pipeline, fail-closed adapter): 8/8 critical-bad trials caught (incl. the Firebase rules
variant), 4/4 good trials passed, 0 false-greens, 0 misses** (a second identical run was
also observed all-correct). The corpus-v3 pooled bound stands with rls_enforced refreshed.
Also verified live post-audit: the AI intent fallback (keyword-blank description → correct
archetype via one AI call, correct rationale) and the verify pipeline end-to-end through
the fail-closed adapter — including a model N/A that was adversarially challenged, survived
honestly (Prisma-parameterized fixture), and surfaced as a gap instead of a silent pass.

## Paid M-series validation (corpus-v2)

The reasoning verifier (`claude` adapter, Sonnet-class model) run end to end against the
labeled corpus and six real repositories. Figures are from the actual paid runs, not estimates.

**M1 — accuracy on the labeled corpus (95 cases; 52 critical bad):**
- 100% accuracy, **0 false-greens on 52 critical bad cases**, 0 false-alarms, 0 errors.
- Confirmed on a second independent run (the verifier is stochastic): 0 + 0 across 104 critical
  trials → rule-of-three 95% upper bound **≤ 2.9%**, under the ≤6% launch bar → **GO**.
- Reaching GO took five rounds of finding and fixing real issues (missing selection keywords, an
  over-tightened prompt, two miscalibrated rubrics, weak fixtures, corpus size). Every root cause
  was adjudicated by an independent multi-judge panel, not by hand — twice the panel overruled the
  author's initial hunch, which is the point.

**M2–M4 — known-bad repos (Juice Shop, NodeGoat, DVNA, RailsGoat):** caught the actual known
vulnerabilities in every one, precisely and with real code citations, across TypeScript,
JavaScript, and Ruby (SQL/NoSQL injection, hardcoded keys, MD5 passwords, IDOR, raw PAN storage,
the commented-out access-control fix, etc.).

**M5 — known-good repos (full Vendure + Medusa clones):** no hallucinated false-alarms, and the
verifier got *more* accurate with more context (a borderline Vendure default-password flag correctly
cleared once its guard was visible). It found a real, repeated SQL-string-escaping anti-pattern in
Medusa — three query builders — that an earlier hand-graded "$0 pre-run" had missed. It also surfaced
the flag-by-absence gap that drove the N/A verdict (below).

**Cost:** the entire M-series (six corpus runs + eight repo runs) was roughly $9–10.

---

## Archetypes 2–5: corpus + real-repo validation (corpus-v3)

The newer archetypes (`saas`, `ai-app`, `baas`, `portfolio`) were brought toward the ecommerce
standard in two layers: a rule-of-three corpus pass, then a real-repo battle-test (the ecommerce
M2–M5 discipline — catch what's real, hallucinate nothing on the safe parts).

**Corpus (rule-of-three).** Each new critical checkpoint carries ≥4 *diverse* bad variants
(distinct mechanisms, not one vuln reskinned) plus good variants guarding the false-alarm rate;
the self-test enforces the ≥4 floor across every *discovered* archetype manifest. A paid run of
2 trials per critical bad case — 66 critical-bad trials across ai.* (3) + baas.* (3) + saas-specific
(2) criticals — returned **0 false-greens → ≤4.5% (95%)**, under the ≤6% launch bar. (Ecommerce
stays tighter at ≤2.9% on more trials; the gap is trial count, not method.)

**Real repos (the ecommerce M5 discipline), reasoning verifier:**
- **ai-app — `vercel/ai-chatbot`:** graded all 12 checkpoints on a 154-file real repo; no
  hallucinated criticals on the safe parts (prompt-injection / output-handling / secrets all 6);
  plausible flags on tool-use-safety and cost-controls (human-verify, by design).
- **baas — `vercel/nextjs-subscription-payments`:** the three `baas.*` criticals all graded 6 at
  high confidence (RLS 0.90, privileged-key-exposure 0.90) — correctly reading a well-built app's
  row-level security and server-only service key. No phantom flags.
- **saas — `vercel/nextjs-subscription-payments`:** `tenancy.isolation` correctly N/A (per-user,
  not multi-org), `entitlement_integrity` 6, `subscription.lifecycle` 3 (partial dunning), one
  blocking critical (`payment.idempotency` 3) worth a human check.
- **portfolio — a real personal Next.js site:** correct N/A on every backend checkpoint (no phantom
  flags), `web.seo_metadata` 9, performance/transport 6. Design checkpoints graded low *from source*
  — the known static-design weak spot; a trustworthy design read needs the instrumented browser probe.

**Two gaps these runs surfaced and closed:**
1. **Selection recall** — the corpus proves the grader, not that selection hands it the right file.
   Added a synthetic-repo recall harness + a self-test gate (100% recall at tight budgets), and fixed
   a keyword-dilution bug that let a `security`-named decoy out-rank a real SQL-injection file.
2. **The shippable gate hardcoded "critical"** — so `portfolio` (no criticals by design) passed its
   gate for free. Fixed (`verify.mjs` + `pr-gate.mjs`) to gate on the archetype's *top severity tier
   present* (critical if any, else high).

**Honest launch tiering.** ecommerce: battle-tested, ≤2.9%. saas / ai-app / baas: corpus ≤4.5% + one
real-repo pass each. portfolio: security/content code-validated; its design gate is `taste_limited`
(honest ~level-7 ceiling) and needs the browser probe, not the false-green corpus.

---

## What worked

- **Accuracy harness** (`verifier-eval`, claude adapter): the reasoning verifier's
  false-green rate is measured against a labeled corpus and gated with a rule-of-three
  bound — see **"Paid M-series validation"** below for the current (corpus-v2) numbers.
  The deterministic `mock` adapter is a keyword baseline for exercising the harness, **not
  a grader to trust**: on corpus-v2 it scores ~66% accuracy / 24.5% false-green and its own
  gate reports NO-GO. Only the reasoning (`claude`) adapter produces a trustworthy verdict.
  (An early, much smaller corpus once had the mock at 96.2%/0-false-green — a number that no
  longer holds and should not be cited; the honest baseline is the corpus-v2 figure above.)
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
`forespec.calibration-1.md` (*acted on flag → little/no improvement → "too strict,
lower weight/severity"*) — real-world proof that the calibration layer (build-order P2)
is load-bearing, not optional.

### 3. Checkpoints flagged "by absence" on repos that lack the feature

On a repo with no payments (or webhooks, or tenancy), the payment/webhook/tenancy checkpoints graded
level 3 — *"the safeguard isn't present"* — producing critical flags for features the repo doesn't have.
On DVNA this was 5 phantom criticals; on a mature framework it reads as noise, and noise is what makes
people mute a reviewer.

**Requirement (shipped): an adversarial N/A ("not applicable") verdict.** It is granted only two ways:
*structurally* (the file selector finds zero code relevant to the checkpoint → N/A, no API call), or
*under challenge* (a model that claims N/A on files that DID match the checkpoint's keywords is
re-interrogated and must justify the absence or grade it, biased toward grading). N/A can never be a free
pass: on the labeled corpus — where every fixture's subject is present — an N/A is scored as a false-green,
and the M1 re-run confirmed **0 N/A dodges, 0 false-greens**. On the repos it dropped DVNA's 5 phantom flags
to honest N/A while the real injection / secrets / IDOR flags survived, and the challenge preserved Medusa's
genuine SQL-injection finding rather than dismissing it.

---

## Operational notes

- **Adapter truncation (fixed).** The claude adapter truncated verbose verdicts under adaptive
  thinking → unparseable JSON. Raised `max_tokens` 1024 → 4096 → **8192** (a single big-repo
  checkpoint exhausted 4096 on thinking before emitting the JSON), and instructed the model to keep
  `gap` to one or two sentences. Also added retry on transient 5xx/429/**529** so an overload blip
  doesn't error a fixture mid-run. Notably the failure mode was always *"couldn't finish the answer,"*
  never a wrong or dangerous verdict — 0 false-greens held throughout.
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
