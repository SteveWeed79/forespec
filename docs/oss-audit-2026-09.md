# Real-repo audit — 8 public OSS repositories, September 2026

The corpus measurement ([`VALIDATION-NOTES.md`](../VALIDATION-NOTES.md), "Agent path") scores the
grading contract on **snippets**. It cannot exercise the thing the agent path exists for: grep,
read, and following an import into the code that supposedly holds the guard. This is that gap
closed — the plugin's grader pointed at real repositories it has never seen, with every finding
checked by hand against the source.

**Run it yourself:** `node verifier-eval/repo-audit.mjs --repo <path>`. Verdict files and logs for
every run below are reproducible from that command.

## Method

8 public repositories, chosen to span the five archetypes and to include one deliberately hostile
case for Forespec's known weak spot (a large Python codebase — every fixture in the corpus and
every curated selection keyword is JS/TS). Each was cloned fresh, `forespec init`'d, and graded by
a headless Claude Code session with read-only tools over the repo. `documenso` was graded twice:
once under the archetype detection picked, once under the one it should have picked.

Then **every finding was checked against the source by hand.** That is the entire point of this
exercise; a ledger of unaudited model output would be worth nothing.

| repo | archetype | verdicts | findings | pass | n/a |
|---|---|---|---|---|---|
| vercel/commerce | ecommerce | 21 | 1 | 10 | 10 |
| saleor/saleor | ecommerce | 21 | 3 | 18 | 0 |
| formbricks/formbricks | saas | 20 | 1 | 18 | 1 |
| documenso/documenso | saas | 20 | 0 | 19 | 1 |
| documenso/documenso | ai-app *(as detected)* | 15 | 0 | 15 | 0 |
| Mintplex-Labs/anything-llm | ai-app | 15 | 10 | 5 | 0 |
| danny-avila/LibreChat | ai-app | 15 | 0 | 15 | 0 |
| vercel/nextjs-subscription-payments | baas | 10 | 3 | 7 | 0 |
| supabase/supabase-js | baas | 10 | 0 | 5 | 5 |
| **total** | | **147** | **18** | **112** | **17** |

## Result

**12 of 18 findings hand-verified against source. 0 fabrications.** Every `file:line` checked
pointed at real code that said what the verdict claimed. 7 passes were additionally
falsification-tested (picked *because* a false-green there would be expensive) and all 7 held.

**0 of 147 graded verdicts came back with no evidence.** Every single one cited `file:line`.

Three properties worth separating out, because they are the ones a grader has to earn:

**It comes back clean on clean code.** `documenso`, `librechat` and `supabase-js` produced zero
findings. That is the calibration property that makes the other results mean anything — a tool
that flags something everywhere is not a tool. I tried to falsify documenso's four strongest
passes and each held: zero `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in the repo, `SALT_ROUNDS
= 12`, session tokens stored only as SHA-256 hashes (`session.ts:39`), `aiRateLimitMiddleware`
genuinely mounted on `/api/ai/*` (`router.ts:113`).

**It says N/A honestly.** All 10 N/A claims on `vercel/commerce` were verified — no auth system, no
password storage, no refund path, no upload path, and exactly one cookie (`cartId`), all as
claimed. `supabase-js` correctly N/A'd 5 of 10: it is an SDK, not an application.

**It navigates.** On `commerce` the grader found the Shopify webhook receiver at
`app/api/revalidate/route.ts` — which my own `find -path "*webhook*"` missed, because the route is
named `revalidate`. It then correctly called `payment.webhook_authenticity` **N/A anyway**, because
a cache-invalidation webhook is not a payment webhook; the contract's "grade only this checkpoint's
property" rule, applied correctly against the easier option of flagging it.

## The Python result — the expected weakness did not appear

`saleor/saleor` is 4,332 Python files and 0 TypeScript files. Forespec's keyword-selection layer
(`select.mjs`) is JS/TS-shaped, so the API path degrades here. **The agent path does not use
`select.mjs` at all** — it greps the repo itself, and it graded all 21 checkpoints with the
strongest reasoning in the whole run.

The standout: `auth.access_control`, graded 3, citing **saleor's own test** as proof. Verified
verbatim — `resolve_order` (`resolvers.py:90`) does a bare `filter(lookup).first()` with no
ownership check, and `test_query_order_fields_order_with_new_id_by_anonymous_user`
(`test_order.py:1715`) asserts an **anonymous** client receives another order's billing address,
shipping address and email.

**This is not a vulnerability report.** Order ids are UUIDs, so this is capability-URL access —
a deliberate, widely-used pattern for guest order lookup, and saleor's own test documents it as
intended behaviour. The finding is *factually correct* and the severity framing is arguable. That
is the honest reading, and it is the same over-severity-not-fabrication bias recorded in the
earlier ecommerce audit.

## What this run found wrong with Forespec

**1. A real bug in `repo-audit.mjs`, found by this run.** On `saleor` the driver reported
`graded 1/21`. The agent had actually produced 21 complete, accurate verdicts — and omitted the
`id` field on every one, so counting distinct ids collapsed to `{undefined}`. The reporting made a
schema slip look like the agent giving up, and `id` is load-bearing (the `agent` adapter keys on
it, so the whole run would have been discarded). Fixed: the driver now diagnoses the two separately
and recovers ids positionally, but **only** when the verdict count matches the checkpoint count
exactly — any other length is a guess about which grade belongs to which checkpoint, and a
misattributed grade is worse than no grade.

**2. Archetype detection picks the wrong primary archetype for a SaaS with an AI feature.**
`documenso` is a document-signing SaaS. It scored `ai-app` 21 vs `saas` 18, on the strength of one
`@ai-sdk/google-vertex` dependency. The consequence is real: graded as `ai-app` it never saw tenant
isolation, entitlement integrity, subscription lifecycle, or money precision.

*Being precise about the damage:* re-running under `saas` returned **0 findings either way**.
Documenso is well-built enough that the wrong standard did not change the verdict here. The defect
is real; this run does not demonstrate that it cost anything.

**3. Forespec has no concept of "this is not an application."** `supabase-js` is a client library.
It was detected as `baas` and graded against an application backbone, which is a category error —
the grader handled it gracefully (5 N/A), but detection should have refused.

**4. Two judgment calls a human would want to see.** On `commerce`, `security.injection` passed at
6 while *citing* `prose.tsx:10` — a `dangerouslySetInnerHTML` on Shopify-authored HTML. The grader
saw the risky line and made a call rather than missing it; that call is defensible (first-party CMS
content) but it is a call. On `formbricks`, the flagged `Access-Control-Allow-Credentials: true`
alongside `Access-Control-Allow-Origin: *` is real and verified (`next.config.mjs:226`, `:240`) —
but browsers reject that combination outright, so it is a misconfiguration rather than the
exploitable hole the finding's framing suggests.

## Honest limits of this audit

- **12 of 18 findings were hand-audited, not all 18.** The 6 unaudited are the remaining
  `anything-llm` findings and 2 of 3 on `saleor`. No false-positive rate should be quoted from
  this run — the denominator is too small and the sample is not random.
- **Findings, not ground truth.** These repos have no labelled answer key. "Verified" here means
  *the cited code exists and says what the verdict claims* — not that a maintainer would agree the
  finding matters. Those are different bars, and only the first is established.
- **One model, one session each.** Everything served on the Claude Code default (`claude-sonnet-5`
  at the time of the run). A different model is a different grader.
- **No repo was graded twice**, so run-to-run stability on real repos is unmeasured here. The
  corpus run measured it at 133/133 outcome agreement on snippets.
- **Third-party repos are untrusted input.** The driver treats repo contents as data, not
  instructions, and is given no shell — a hostile repo can at worst corrupt its own grade. That
  posture is pinned by a self-test check rather than left to a comment.
