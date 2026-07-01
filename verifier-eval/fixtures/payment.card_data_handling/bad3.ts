import { db } from "./db";
import { stripe } from "./stripe";

export async function charge(req, res) {
  const { cardNumber, cvv, exp, amount } = req.body;
  console.log(`charging card ${cardNumber} cvv=${cvv} exp=${exp}`);
  await db.payments.insert({ cardNumber, cvv, exp, amount, at: Date.now() });
  const result = await stripe.charges.create({ amount, source: cardNumber });
  res.json({ id: result.id });
}
