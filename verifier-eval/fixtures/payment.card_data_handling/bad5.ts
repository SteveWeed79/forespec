import { db } from "./db";

// BAD: raw PAN + CVV are POSTed to first-party code and stored. This drags the
// whole app into PCI-DSS scope; card data must be captured by the provider's
// hosted fields and never touch your server.
export async function pay(req, res) {
  const { cardNumber, cvv, exp, amount } = req.body;
  await db.payment.create({ cardNumber, cvv, exp, amount });
  res.json({ ok: true });
}
