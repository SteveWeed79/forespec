// Checkout: reserve stock, then create the payment intent.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  const available = await db.query(
    `SELECT stock, price FROM variants WHERE id = $1`,
    [variantId],
  );
  const variant = available.rows[0];
  if (variant.stock < qty) throw new Error("out of stock");

  await db.query(
    `UPDATE variants SET stock = stock - $1 WHERE id = $2`,
    [qty, variantId],
  );

  const intent = await stripe.paymentIntents.create({
    amount: variant.price * qty,
    currency: "usd",
  });

  return { intentClientSecret: intent.client_secret };
}
