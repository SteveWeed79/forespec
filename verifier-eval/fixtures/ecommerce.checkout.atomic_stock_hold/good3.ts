// Checkout: lock the row in a transaction to reserve, then pay outside the txn.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  const hold = await db.transaction(async (tx) => {
    // Row lock serializes concurrent checkouts for this variant.
    const row = await tx.query(
      `SELECT stock, price FROM variants WHERE id = $1 FOR UPDATE`,
      [variantId],
    );
    const variant = row.rows[0];
    if (!variant || variant.stock < qty) throw new Error("out of stock");

    await tx.query(
      `UPDATE variants SET stock = stock - $1 WHERE id = $2`,
      [qty, variantId],
    );
    return tx.holds.create({
      variantId, qty, userId, price: variant.price,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
  });

  // Transaction has committed the reservation; only now hit the payment provider.
  const intent = await stripe.paymentIntents.create({
    amount: hold.price * qty,
    currency: "usd",
    metadata: { holdId: hold.id },
  });

  return { intentClientSecret: intent.client_secret, holdId: hold.id };
}
// A sweeper releases holds past expiresAt, returning stock to the variant.
