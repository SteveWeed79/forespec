// Checkout: decrement stock, then create the payment intent.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  const updated = await db.query(
    `UPDATE variants SET stock = stock - $1 WHERE id = $2
     RETURNING stock, price`,
    [qty, variantId],
  );
  if (updated.rowCount === 0) throw new Error("variant not found");

  const variant = updated.rows[0];
  const intent = await stripe.paymentIntents.create({
    amount: variant.price * qty,
    currency: "usd",
  });

  return { intentClientSecret: intent.client_secret };
}
