# Contributing to Forespec

Thanks for looking. Forespec is open-core (BSL 1.1) — the local engine is free and fully
useful forever, and contributions to it are welcome.

## Ground rules (the ones that are load-bearing)

Forespec's whole value is that its verdicts can be trusted, so the bar for changes is
higher than the usual "tests pass":

- **No half measures, no stubs.** Every phase and every checkpoint ships real. If it can't
  yet stand behind a number, it doesn't ship a number.
- **The honesty mechanic.** Every score reports level + gap + confidence. A score that
  can't state its basis doesn't ship.
- **The pattern/instance wall.** Shareable pattern data and never-leaves-the-project
  instance data live in separate stores. Don't blur them.
- **Checkpoint ids are permanent contracts.** Bump a `version` when a definition changes;
  never silently rename an id — calibration history depends on stable ids.

## Local setup

Zero runtime dependencies, Node ≥ 18. There's nothing to install for the core:

```bash
node repo-verify/self-test.mjs   # the full deterministic suite (no API key needed)
node schemas/validate.mjs        # validate the library + manifests against the schemas
```

Both must be green. CI runs exactly these on Node 18/20/22, and `npm publish` refuses to
run if the self-test is red (`prepublishOnly`).

## Adding or changing a checkpoint

A new checkpoint isn't done when it exists — it's done when it's *validated*. The bar
(see [`docs/proposals/legal-license-hygiene.md`](./docs/proposals/legal-license-hygiene.md)
for a worked example of the process):

1. Define it in `library/checkpoints/*.json` and compose it into the relevant
   `archetype.*.json` manifest(s) with a severity.
2. Add selection keywords in `repo-verify/select.mjs` so the file selector surfaces the
   right code.
3. Add fixtures in `verifier-eval/`: **≥ 4 *diverse* bad variants** (distinct mechanisms,
   not one vuln reskinned) plus good variants that guard the false-alarm rate. The
   self-test enforces the ≥ 4-bad floor for every discovered manifest.
4. Run the paid rule-of-three eval (`npm run eval:claude`) and confirm **0 false-greens**
   under the launch bar.
5. Do one real-repo pass: it must be correct on a repo that has the flaw *and* silent
   (no phantom flag, correct N/A) on a repo that doesn't.

Until 3–5 are green, it waits. That discipline is the product.

## Pull requests

- Keep the diff focused; explain *why*, not just *what*.
- Run the self-test and schema validator before pushing.
- CI must be green.
