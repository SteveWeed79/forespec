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
