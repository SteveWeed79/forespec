// Checkout: confirm payment, then settle stock.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  const variant = await db.variant.findById(variantId);
  if (variant.stock < qty) throw new Error("out of stock");

  const intent = await stripe.paymentIntents.create({
    amount: variant.price * qty,
    currency: "usd",
    confirm: true,
  });

  if (intent.status !== "succeeded") throw new Error("payment failed");

  await db.query(
    `UPDATE variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
    [qty, variantId],
  );

  return { orderConfirmed: true, paymentId: intent.id };
}
