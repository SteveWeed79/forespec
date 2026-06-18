// Mock verifier adapter — a NAIVE keyword baseline, not a real verifier.
//
// Purpose: (1) let the harness run end-to-end with zero config (no API key),
// proving the plumbing, and (2) provide a dumb static baseline the real
// reasoning verifier should match or beat. It looks for a few "good-signal"
// substrings per checkpoint; if any is present it calls the code shippable (6),
// otherwise risky (3). It deliberately has NO signals for one checkpoint
// (ec.order.state_integrity) to show what an un-modeled checkpoint does to the
// metrics — it flags everything, producing a false alarm on the good fixture.
//
// Implements the adapter interface: verify({ checkpoint, code }) -> { level, confidence, rationale }

const GOOD_SIGNALS = {
  "ec.checkout.atomic_stock_hold": ["stock >=", "rowCount === 0", "reservation", "expiresAt", "holds.create"],
  "ec.checkout.payment_idempotency": ["idempotencyKey", "webhookEvents", "event.id"],
  "ec.auth.access_control": ["req.user.id", "findOne"],
  "ec.checkout.card_data_handling": ["paymentMethodToken", "process.env.STRIPE_SECRET_KEY", "hosted fields"],
  "ec.checkout.webhook_authenticity": ["constructEvent", "stripe-signature", "rawBody"],
  // ec.order.state_integrity intentionally omitted — the baseline doesn't model it.
};

export const name = "mock";

export async function verify({ checkpoint, code }) {
  const signals = GOOD_SIGNALS[checkpoint.id] ?? [];
  const hit = signals.find((s) => code.includes(s));
  return {
    level: hit ? 6 : 3,
    confidence: 0.5,
    gap: hit ? "" : "keyword baseline saw no good-signal token",
    rationale: hit
      ? `keyword baseline matched "${hit}"`
      : signals.length === 0
        ? "keyword baseline has no signals for this checkpoint — defaults to risky"
        : "keyword baseline found no good-signal token — defaults to risky",
  };
}
