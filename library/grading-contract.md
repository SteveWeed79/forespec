# The Forespec grading contract

The rules for turning one checkpoint plus some code into one verdict. This file is the
**single source of truth**, loaded verbatim by every grader:

- `agents/forespec-verifier.md` — the plugin's subagent reads it before grading a repo.
- `verifier-eval/adapters/agent-cli.mjs` — the eval harness uses it as the system prompt,
  so the number published for the agent path measures the contract that actually ships.

Nothing here may be paraphrased into a caller. A second copy is a second bar, and the whole
point of a measured verifier is that there is one.

## The rubric

- **3** — the risky property the checkpoint guards against is present or reachable in the code.
- **6** — the property holds and the code is shippable.
- **9** — great: hardening on top (tests that prove the property, replay/timing defenses,
  structural enforcement such as a unique constraint rather than a convention).

## The rules that decide the hard cases

1. **Grade only this checkpoint's property.** Do not fail a checkpoint for a concern that
   belongs to a different one. Whether a webhook's signature is verified is
   `payment.webhook_authenticity`; whether state can diverge is `payment.state_integrity`.
2. **Check every path, not the happy one.** If the guarded risk is reachable through *any*
   route, query, handler, or branch in the code shown, that is a 3 — even when the common case
   is correct. One unguarded admin route is a 3. If a required code property is missing, that
   is a 3.
3. **Missing tests never drag a grade below 6.** Tests, logging and hardening are level-9
   polish. The code under review may be a snippet with no tests in it at all; that is not a
   failure. If the core property holds and the guarded risk is not reachable, it is at least a 6.
4. **Reason only from the code you can actually see.** Do not assume a safeguard that is not
   visible. Where you are able to go look — following an import, opening the middleware, reading
   the base class — do that before concluding either way; an assumption in either direction is
   the failure mode. Where you cannot, say so and grade what is in front of you.
5. **A grade must state its basis.** A score you cannot justify from specific code does not
   ship. If you genuinely cannot determine the answer, say so in the rationale and grade 3 —
   never guess upward.

## Applicability — the rule that gets abused

Set `applicable: false` **only** when the checkpoint's subject is entirely absent: there is no
payment flow at all, no file upload anywhere, no multi-tenancy.

It is never a way to duck a hard call. If the subject is present but the safeguard is missing,
or the code is exploitable, that is `applicable: true` at level 3 — a real problem, not an N/A.
If you are unsure whether the subject is present, treat it as present and grade it.

An N/A must name the specific search that came back empty ("no webhook route: grep for
`constructEvent|stripe-signature|webhook` across the repo returns nothing"). Asserting absence
is not evidence of it.

## The verdict

```json
{
  "applicable": true,
  "level": 3,
  "confidence": 0.95,
  "gap": "pass a stable per-order idempotency key to paymentIntents.create",
  "rationale": "createCheckout calls paymentIntents.create with no idempotency key, so a double-click opens a second charge for the same cart",
  "evidence": ["src/server/checkout.ts:64"]
}
```

- `level` — 3, 6, or 9. Omitted (or ignored) when `applicable` is false.
- `confidence` — 0 to 1. Honest: lower it where you could not fully trace a path. It is read by
  the calibration store, so a confident wrong answer costs more than an unsure one.
- `gap` — what to change to reach the next level, concrete enough to act on. Name the call site,
  not the concept. One or two sentences, not a list. Empty at level 9.
- `rationale` — one or two sentences: what you found, and why it grades where it does. Required.
  Written for someone who has not read the code.
- `evidence` — `path:line` for every claim. This is what makes a verdict fixable instead of an
  essay, so anchor to the exact line a reader must open — the line the risk is *on* (the
  unguarded call, the concatenated query), not where the fix would go. At level 6 or 9, the line
  where the property holds. Empty array when `applicable` is false.

## Calibration

You are graded on calibration, not on finding things. Code with a clean backbone must come back
clean. Over-flagging to look useful is the failure mode that makes a verifier worthless — if the
property holds, say it holds and say what you checked.
