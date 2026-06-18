// Checkout: reserve stock atomically BEFORE creating the payment intent.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  // Atomic conditional reservation: only succeeds if enough stock remains.
  // Returns 0 rows affected when another buyer won the race.
  const reservation = await db.query(
    `UPDATE variants SET stock = stock - $1
       WHERE id = $2 AND stock >= $1
     RETURNING id`,
    [qty, variantId],
  );
  if (reservation.rowCount === 0) throw new Error("out of stock");

  // Persist a hold row with an expiry so abandonment releases the stock.
  const hold = await db.holds.create({
    variantId, qty, userId,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  // Only now call the external payment provider (NOT inside the DB transaction).
  const variant = await db.variant.findById(variantId);
  const intent = await stripe.paymentIntents.create({
    amount: variant.price * qty,
    currency: "usd",
    metadata: { holdId: hold.id },
  });

  return { intentClientSecret: intent.client_secret, holdId: hold.id };
}
// A sweeper job releases holds whose expiresAt has passed.
