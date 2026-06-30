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

Adapter selection: `claude` when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are both
set (or `--adapter claude`); otherwise the `mock` baseline, with a note. The process
exits `0` when the repo is "shippable" by the archetype's rule (all critical
checkpoints ≥ 6) and `1` otherwise — so it works as a CI gate.

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

## The P0 validation gate

`fixtures/vulnerable-checkout/` carries the canonical AI-coded holes (non-atomic
stock, client-trusted total, optimistic `paid`, IDOR, float money, no variant model,
no movement ledger). `npm run verify:self` proves the pipeline runs and flags every
backbone hole with the mock baseline. To finish the real gate, point it at KTXZ with
a key + model set; if it doesn't surface a real gotcha, the pearl isn't real and
you've found out cheaply.

## Scope

Grades against the resolved checkpoints' reasoning questions — the backbone and the
static parts of design. The instrumented design layer
(`archetype.ecommerce.design.json`) needs a headless browser (build-order P3) and is
not run here.

## Limitations (read before trusting a number)

Learned from the first real-repo run — see `../VALIDATION-NOTES.md` for the full write-up.

- **A level is property-presence, not blast radius.** A low grade means "the risky
  property is present," not "this is exploitable." Treat it as *investigate*, confirm
  the actual impact, then act — don't act on the number alone.
- **Don't diff two snapshots and call it a regression.** Grading two independent
  exports of the same project can report a phantom "regression" that's really just the
  file selector surfacing different code in each. Real regression detection needs a
  git-grounded diff with consistent selection (a PR/CI gate), not two arbitrary dumps.
- **Design grading is best-effort without a browser** (especially contrast/a11y); the
  instrumented design layer (P3) is the real answer there.
- **Single-pass, single-model.** Cross-check disputed or critical calls with a second
  model; the reasoning layer is a first pass meant to be paired with verification.
