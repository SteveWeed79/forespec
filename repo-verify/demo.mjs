#!/usr/bin/env node
// forespec demo — the 20-second, zero-setup look at what the verifier does.
//
// It plays back a FIXED reference run of the verifier against forespec's own
// bundled example (repo-verify/fixtures/vulnerable-checkout — a deliberately
// vulnerable checkout). No API key, no config, nothing past `npx forespec`.
//
// Why scripted and not a live grade: the trustworthy grade is the reasoning
// verifier (needs a key). The free mock is a keyword baseline the tool itself
// says not to trust — a bad first impression. So `demo` renders a fixed set of
// verdicts — grounded in the example's real holes — through the SAME renderer a
// live `verify` uses (render-cli.mjs), so what you see is exactly the shape and
// substance of a real run. The header/footer say plainly that it's a scripted
// walkthrough, not a live model grade, and show how to grade your own code.
//
// Honesty rules this repo lives by, kept here too: every verdict states its
// basis, the grader is labelled `via demo` (never dressed up as a live model
// call), and nothing claims to be a live grade of the user's code.

import { renderVerifyText } from "./render-cli.mjs";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", yellow: "\x1b[33m" };
const useColor = process.stdout.isTTY === true && !process.argv.includes("--no-color");
const paint = (code, s) => (useColor ? `${code}${s}${C.reset}` : s);

const HELP = `forespec demo — see the verifier at work with zero setup (no API key).

Usage: forespec demo

A scripted walkthrough: a fixed set of verdicts on forespec's bundled example repo
(a deliberately vulnerable checkout), grounded in that code's real holes and rendered
through the same code a live \`verify\` uses — so you see the real shape and substance in
~20 seconds. To grade your own code for real, use \`forespec verify\`.`;

// A fixed reference run. Every verdict below is grounded in real code in
// repo-verify/fixtures/vulnerable-checkout — the same holes a live grade names.
// The grader is labelled `via demo` (not `via claude`): these are a scripted
// walkthrough, not a live model call, and the header/footer say so.
const ARCHETYPE = { archetype: "ecommerce", version: "2.1.0" };

const results = [
  {
    id: "ecommerce.checkout.atomic_stock_hold", domain: "backbone", severity: "critical",
    applicable: true, level: 3, confidence: 0.9, adapter: "demo", error: null,
    rationale:
      "stock is read, a payment intent is created, then stock is decremented — none of it atomic and nothing is held before payment, so under load two shoppers clear the last unit and you oversell.",
    gap:
      "reserve stock atomically before payment (a conditional decrement that fails closed when it would go negative), and release the hold on abandonment or expiry.",
  },
  {
    id: "payment.idempotency", domain: "backbone", severity: "critical",
    applicable: true, level: 3, confidence: 0.92, adapter: "demo", error: null,
    rationale:
      "the Stripe paymentIntents.create call carries no idempotency key, so a double-click or a client retry opens a second charge for the same cart.",
    gap:
      "pass a stable idempotency key derived per order to paymentIntents.create, and dedupe the provider webhook by event id before mutating order state.",
  },
  {
    id: "payment.webhook_authenticity", domain: "backbone", severity: "critical",
    applicable: true, level: 3, confidence: 0.9, adapter: "demo", error: null,
    rationale:
      "the order is marked \"paid\" optimistically on the client return; there is no signature-verified provider callback, so a forged client response can mark an unpaid order paid.",
    gap:
      "treat a signature-verified Stripe webhook (constructEvent over the raw body) as the sole source of truth for \"paid\" — never the client return.",
  },
  {
    id: "payment.card_data_handling", domain: "backbone", severity: "critical",
    applicable: true, level: 6, confidence: 0.86, adapter: "demo", error: null,
    rationale:
      "checkout creates a PaymentIntent and returns only its client_secret for confirmation in the browser, so raw card data (PAN/CVV) is handled by Stripe and never touches your server or logs.",
    gap:
      "to reach level 9, pin the Stripe API version and add a test asserting no card field is ever logged or persisted.",
  },
  {
    id: "auth.access_control", domain: "backbone", severity: "high",
    applicable: true, level: 3, confidence: 0.91, adapter: "demo", error: null,
    rationale:
      "getOrder fetches an order by id with no ownership check, so user A can read user B's order by changing the id in the URL (IDOR).",
    gap:
      "scope every order lookup to the authenticated user (where id AND userId) and return 404 on a miss, so ids can't be enumerated.",
  },
];

// gate tier = critical (top severity present). Criticals below 6 block; the level-6
// card-data pass does not. The one high finding (auth) sits under the critical gate.
const rollup = {
  conclusive: true,
  shippable: false,
  great: false,
  gate_tier: "critical",
  gate_tiers: ["critical"],
  gate_demotion: null,
  domain: "backbone",
  blocking: ["ecommerce.checkout.atomic_stock_hold", "payment.idempotency", "payment.webhook_authenticity"],
  ungraded: [],
  not_applicable: [],
  design_skipped: [
    "design.type_scale", "design.contrast_a11y", "design.visual_hierarchy",
    "design.system_consistency", "ecommerce.design.trust_signals", "design.spacing_system", "design.responsive",
  ],
  adapter: "demo",
  adapter_degraded: false,
};

// foresight: a checkpoint the example has NO code for yet — surfaced BEFORE it's
// built. The refund path is the reverse-money direction the audit flagged too.
const gaps = {
  source: "demo",
  items: [
    {
      id: "payment.refund_integrity", severity: "high", urgency: "soon",
      headline: "Not built yet — refunds and cancellations are correct, bounded, and idempotent",
      why_your_archetype:
        "the reverse-money path gets built late and tested least; without guards you can refund more than was captured, or double-refund when a retry or webhook redelivery replays the same request.",
      what_good_looks_like:
        "refund amount bounded by the remaining captured balance, idempotent against retries/webhook redelivery (a per-refund nonce), and related inventory/state reversed in the same transaction.",
    },
  ],
};

function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log(HELP);
    return 0;
  }

  // Context header → stderr (matches `verify`), so the graded body on stdout stays clean.
  console.error("");
  console.error(paint(C.bold, "🔭 forespec demo") + paint(C.dim, " — a scripted walkthrough, no API key needed"));
  console.error("");
  console.error(paint(C.dim, "  A fixed reference run of the verifier against forespec's bundled example"));
  console.error(paint(C.dim, "  (a deliberately vulnerable checkout) — the same checks and output a live grade"));
  console.error(paint(C.dim, "  produces, grounded in that code's real holes. Zero setup."));
  console.error("");
  console.error(paint(C.dim, `  ${ARCHETYPE.archetype} v${ARCHETYPE.version} | example: vulnerable-checkout | ${results.length} checkpoint(s)`));

  // The graded body → stdout, rendered through the exact path a live `verify` uses.
  console.log(renderVerifyText({ archetype: ARCHETYPE, results, rollup, gaps, useColor }));

  // The replay disclosure + how to grade real code → stdout, so it survives capture.
  const cmd = (s) => paint(C.cyan, s);
  const lines = [
    "",
    paint(C.bold, "── this is a scripted demo ──"),
    "  The verdicts above are a fixed walkthrough on forespec's bundled example —",
    "  grounded in that code's real holes, but not a live model grade of your code. It",
    "  shows what the verifier surfaces: the non-obvious criticals (the double-charge, the",
    "  stock race, the optimistic \"paid\"), the one that's actually fine (card data never",
    "  touches your server), and a gap before it's even built — the discernment a grader",
    "  you trust with \"is this shippable?\" has to earn.",
    "",
    paint(C.bold, "  Grade your OWN repo for real:"),
    `    ${cmd("export ANTHROPIC_API_KEY=sk-...")}      ${paint(C.dim, "# https://console.anthropic.com")}`,
    `    ${cmd("export ANTHROPIC_MODEL=<a current Claude model id>")}`,
    `    ${cmd("forespec init")}      ${paint(C.dim, "# detect your archetype from the code")}`,
    `    ${cmd("forespec verify")}    ${paint(C.dim, "# same output as above — on your code")}`,
    "",
    `  No repo yet?  ${cmd('forespec start "an online store with checkout"')}`,
  ];
  console.log(lines.join("\n"));
  return 0;
}

process.exitCode = main();
