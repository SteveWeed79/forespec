// BAD: raw card number posted to the first-party backend, and the payment
// provider SECRET key is shipped in client-side config.
export const config = { stripeSecretKey: "sk_live_EXAMPLE_NOT_A_REAL_KEY" }; // in the bundle!

export async function submitCard(req, res) {
  const { cardNumber, cvv, exp } = req.body; // PAN hits our server → full PCI scope
  await chargeRawCard(cardNumber, cvv, exp, config.stripeSecretKey);
  res.json({ ok: true });
}
