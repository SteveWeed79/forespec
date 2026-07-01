// Checkout: atomic conditional reservation committed before the payment intent.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  // Single atomic decrement: only affects a row when enough stock remains.
  const reservation = await db.query(
    `UPDATE variants SET stock = stock - $1
       WHERE id = $2 AND stock >= $1
     RETURNING price`,
    [qty, variantId],
  );
  if (reservation.rowCount === 0) throw new Error("out of stock");

  // Record the hold with an expiry so abandoned checkouts release stock.
  const hold = await db.holds.create({
    variantId, qty, userId,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  // External payment call happens after the reservation is committed.
  const intent = await stripe.paymentIntents.create({
    amount: reservation.rows[0].price * qty,
    currency: "usd",
    metadata: { holdId: hold.id },
  });

  return { intentClientSecret: intent.client_secret, holdId: hold.id };
}
// A sweeper releases holds whose expiresAt has passed and restores stock.
