# repo-verify — grade a whole repo against an archetype

`verifier-eval/` answers *"is the verifier accurate?"* (single labeled fixtures,
false-green rate). `repo-verify/` answers the product question: *"point Foresight
at my actual repo and tell me where it stands."* It's the P0→P1 use from the build
order — run the verifier on real code (e.g. KTXZ) and get an honest backbone read.

Zero dependencies. It reuses the rest of the project rather than duplicating it:

- `library/resolve.mjs` → resolves an archetype manifest into full checkpoints.
- `verifier-eval/adapters/{mock,claude}.mjs` → the same graders the eval harness uses.
- `repo-verify/select.mjs` → the new piece: walks a target repo and packs the most
  relevant files per checkpoint into the `code` string the adapters expect.

## Onboarding — `foresight init` (start here)

You don't have to know which archetype fits, and you don't retype it every run. The
unified CLI (`bin/foresight.mjs`, exposed as `foresight` via `npx`) detects the archetype
from cheap signals — declared dependencies, file paths, schema model names — and writes
the choice once to `foresight.config.json`, which `verify` and the PR gate then read.

```bash
foresight init            # detect the archetype, write foresight.config.json (commit it)
foresight detect          # show the ranking + evidence without writing anything
foresight verify          # grade the backbone against the configured archetype
foresight gate --help     # the PR/CI gate
```

`foresight.config.json` (committed) is the per-project archetype decision — distinct from
`.foresight/` (the gitignored calibration store). Detection reads only metadata, never your
code's contents.

Matching is **token-based** (whole words + simple plurals), so "product" no longer matches
"production" and "remember" no longer matches "member" — and when signals are genuinely thin
it says *"couldn't detect — pick one"* rather than guessing. Beyond `package.json` deps it
reads the artifacts a project uses to **describe itself**: domain-specific **config files**
(`medusa-config`, `astro.config`, …, matched by existence — a near-decisive tell), the
**variable names in `.env.example`** (`SHOPIFY_*` → shop, `TENANT_*`/`PADDLE_*` → SaaS,
`SANITY_*` → content — names only, never `.env` or its values), non-JS manifests
(requirements.txt, Gemfile, go.mod, …), and Drizzle/Mongoose/TypeORM/Sequelize models, not
just Prisma. **AI-on-ambiguity:** when the heuristic abstains or two archetypes tie *and*
`ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` are set, it spends **one** model call (metadata only,
no code) to break the tie; `--no-ai` disables it, and with no key it just falls back to the
heuristic — the $0 path never breaks.

## Usage

```bash
# Pipeline proof, no API key (mock keyword baseline):
npm run verify:self

# Grade a real repo's backbone with the mock baseline:
node repo-verify/verify.mjs /path/to/repo --adapter mock

# Real reasoning verifier:
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=<a current Claude model id>
node repo-verify/verify.mjs /path/to/repo                 # backbone (default)
node repo-verify/verify.mjs /path/to/repo --domain all
node repo-verify/verify.mjs /path/to/repo --archetype archetype.saas.json
node repo-verify/verify.mjs /path/to/repo --checkpoint payment.idempotency
node repo-verify/verify.mjs /path/to/repo --json
```

Archetype precedence: explicit `--archetype` > `foresight.config.json` in the repo > the
ecommerce default. A bare name (`--archetype saas`) or a manifest filename both resolve
against the bundled archetypes, so it works when run from inside another repo.

Adapter selection: `claude` when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are both
set (or `--adapter claude`); otherwise the `mock` baseline, with a note. The process
exits `0` when the repo is "shippable" by the archetype's rule (all critical
checkpoints ≥ 6) and `1` otherwise — so it works as a CI gate.

## Plan — interrogate before you build (`foresight plan`)

`verify`/`gate` grade what got built. `plan.mjs` runs *first* — the other half the name
promises ("foresight **before** a feature"). It turns the archetype's checkpoints into the
questions you must answer before writing the feature, and emits a spec your AI coder builds
against, so the expensive discoveries surface at plan time (~10× cheaper than at PR time).

```bash
foresight plan "add checkout flow"                      # spec for the relevant checkpoints
foresight plan "subscription billing" --archetype saas
foresight plan "add login" --out foresight-plan.md      # write the spec to a file
foresight plan "checkout" --json
```

It reuses the same library: the checkpoint's stored **reasoning question** becomes "decide
first", its **level-6 definition** becomes the shippable bar, and its **assertions** become
acceptance checkboxes. Selection surfaces every checkpoint the feature text matches **plus
all critical-backbone checkpoints** (a feature touching the backbone must respect them
regardless of wording) — so the backbone is never silently skipped at plan time. Static and
$0; the reasoning adapter only sharpens phrasing, it isn't required.

## Calibration store (bricks 1–2)

Every run is logged so the tool can eventually *earn* its weights instead of using
invented ones (build-order P2). Records go to `./.foresight/` (override with `--store`,
disable with `--no-store`), and the **pattern/instance wall is physical** — two files,
from the first write:

- `predictions.patterns.jsonl` — **shareable**: checkpoint id, level, confidence,
  severity, archetype, and a `fingerprint` (a hash of the graded slice, not the code).
  No paths, no code, no free-text. This is the shape a future cross-repo pool consumes.
- `predictions.instances.jsonl` — **local only**: the gap/rationale/evidence (which name
  files) + the *same* fingerprint. Never synced.

Record a human verdict on a flag (brick 2) — joined to the prediction by fingerprint:

```bash
# outcome: hit | false-positive | over-severe | ignored
node repo-verify/feedback.mjs payment.idempotency over-severe \
  --note "real but contained at the display edge" --source self_observed
```

Outcomes split the same way (`outcomes.patterns.jsonl` carries the outcome class +
reliability tier; the note stays local in `outcomes.instances.jsonl`). The
`over-severe` outcome is exactly the calibration signal that should later down-weight a
flag that's "right but over-stated" — the lesson from the first real-repo run.

### Propose & accept deltas (brick 3)

Once outcomes accumulate, see what the data suggests — nothing changes until you accept:

```bash
node repo-verify/calibrate.mjs                              # show proposals + evidence
node repo-verify/calibrate.mjs accept data.money_precision  # apply the proposed severity
node repo-verify/calibrate.mjs reset  data.money_precision  # undo
```

It aggregates recorded outcomes per checkpoint and proposes a severity delta with the
evidence behind it (e.g. *"3 over-severe vs 0 hit → lower critical → high"*), never on
thin evidence (default: needs ≥ 3 outcomes). Accepted deltas land in
`.foresight/overrides.json`, which `verify` applies on top of the archetype — the shared
library stays pristine; the tuning is earned and reversible.

`.foresight/` is gitignored (it holds local instance data).

## Proficiency — the tool adapts to you (`foresight proficiency`)

Build-order Phase 5, the differentiator. From the outcomes you already recorded (no new
data collection), it estimates per domain — **backbone** vs **design** — how much
demonstrated engagement + judgment you've shown, and dials explanation depth accordingly:
carry you where you're learning, get out of the way where you're fluent.

```bash
foresight proficiency        # your self-facing read (learning | steady | fluent per domain)
```

Three rules it holds to:

- **Asymmetric.** Good calls and precise terminology in your notes *raise* the estimate;
  terse or plain input **never lowers** it (plenty of strong builders are blunt).
- **Self-facing only.** It's computed on demand, locally, and only shown to you — never
  written to the shareable pattern tier, never pooled, never a dossier for others' eyes.
- **Honest framing.** It's "demonstrated engagement + judgment," not a competence grade;
  it only tunes how much the tool explains.

`foresight plan` uses it automatically: in a domain you're fluent in it trims the teaching
"why" lines (you know why); where you're still learning it keeps the full detail. Pass
`--no-adapt` to force full detail.

## PR gate (CI) — the git-aware surface

`pr-gate.mjs` is the form factor a non-CLI user actually touches: it runs in CI on a
pull request, grades **only the backbone checkpoints the PR's changed files touch**,
posts a sticky comment with the read + how each checkpoint moved **vs the last run**,
and feeds the calibration store automatically. This is the *trustworthy* home for "what
changed" — it compares the same checkpoint across real commits with consistent
selection, instead of diffing two arbitrary snapshots (which produced a phantom
regression in the first real-repo run).

It also closes the calibration loop without anyone typing: when a checkpoint that was
previously flagged (`< 6`) comes back `≥ 6` after a relevant file changed, it records a
passive `hit` outcome (`source: passive_git`) — auto-feeding brick 3.

```bash
# Local dry run (no GitHub, no API key) — see the comment it would post:
node repo-verify/pr-gate.mjs --repo /path/to/repo --changed app/checkout/actions.ts --adapter mock --dry-run

# In CI: wired in .github/workflows/foresight.yml (runs on pull_request).
```

### Drop it into another repo (one line)

`action.yml` is a composite GitHub Action so any repo adds the gate without copying files:

```yaml
# .github/workflows/foresight.yml in YOUR repo
name: Foresight
on: pull_request
permissions:
  contents: read
  pull-requests: write          # required so the gate can upsert its comment
jobs:
  foresight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # full history so it can diff the base branch
      - uses: SteveWeed79/glowing-barnacle@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}  # optional ($0 mock without it)
          anthropic-model: ${{ vars.ANTHROPIC_MODEL }}
          # fail: "true"         # block the PR instead of just commenting
```

Run `foresight init` in that repo first and commit `foresight.config.json` so the gate
grades against the right archetype (or pass `archetype: ecommerce` to the action).

Advisory by default (comments, never blocks). Pass `fail: "true"` to the action (or
`--fail` to the run step) to make it a blocking required check (exits non-zero on a
touched-critical regression or below-6). Set `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`
to use the reasoning verifier; without them it runs the mock baseline at $0.

## The P0 validation gate

`fixtures/vulnerable-checkout/` carries the canonical AI-coded holes (non-atomic
stock, client-trusted total, optimistic `paid`, IDOR, float money, no variant model,
no movement ledger). `npm run verify:self` proves the pipeline runs and flags every
backbone hole with the mock baseline. To finish the real gate, point it at KTXZ with
a key + model set; if it doesn't surface a real gotcha, the pearl isn't real and
you've found out cheaply.

## Design layer (instrumented) — `foresight design <url>`

`verify` reads source; `design` renders the *live* page in a headless browser (Playwright)
and **measures** it — the build-order Phase 3 layer. It grades the established, defensible
design checkpoints:

- `design.contrast_a11y` — WCAG contrast ratios across text, plus image-alt and input-label coverage
- `design.type_scale` — body size (≥16px), line-height, and a modular heading scale
- `design.responsive` — horizontal overflow and tap-target sizes at a mobile viewport
- `design.spacing_system` — how consistently spacing lands on a 4/8 scale

```bash
foresight design http://localhost:3000      # a running dev server
foresight design ./dist/index.html          # a built file
foresight design <url> --json
```

The scoring lives in `design-metrics.mjs` (pure WCAG math, unit-tested, zero-dep); only the
probe needs `playwright-core` (an **optional** dependency — the rest of the tool stays
zero-dep). Honest by design: it scores only what it can measure and reports the rest
(saliency, aesthetic coherence, "intent reads clearly") as **residual**, never folded into
the number. Taste stays a human call.

## Scope

`verify` grades the resolved checkpoints' reasoning questions — the backbone and the static
parts of design. `design` adds the instrumented runtime layer for the measurable design
checkpoints (above). The `model_scored` / `taste_limited` signals in
`archetype.ecommerce.design.json` (saliency, aesthetic coherence) are deferred experiments
(build-order P6) and are not scored.

## Limitations (read before trusting a number)

Learned from the first real-repo run — see `../VALIDATION-NOTES.md` for the full write-up.

- **A level is property-presence, not blast radius.** A low grade means "the risky
  property is present," not "this is exploitable." Treat it as *investigate*, confirm
  the actual impact, then act — don't act on the number alone.
- **Don't diff two snapshots and call it a regression.** Grading two independent
  exports of the same project can report a phantom "regression" that's really just the
  file selector surfacing different code in each. Real regression detection needs a
  git-grounded diff with consistent selection (a PR/CI gate), not two arbitrary dumps.
- **Design: instrumented for the measurable parts, silent on taste.** `foresight design`
  now measures contrast, type scale, responsive, and spacing in a real browser (P3) — trust
  those. But saliency, aesthetic coherence, and "does the hierarchy read" are *not* scored;
  a high design grade means "the measurable fundamentals hold," not "it looks great."
- **Single-pass, single-model.** Cross-check disputed or critical calls with a second
  model; the reasoning layer is a first pass meant to be paired with verification.
