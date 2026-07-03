import { db } from "../../db";

// Reserve stock atomically inside a transaction BEFORE creating the payment intent.
// Selection MUST surface this for ecommerce.checkout.atomic_stock_hold.
export async function reserveAndCheckout(sku: string, qty: number) {
  return db.transaction(async (tx) => {
    const held = await tx.query(
      "UPDATE inventory SET stock = stock - $1 WHERE sku = $2 AND stock >= $1 RETURNING *",
      [qty, sku],
    );
    if (held.rowCount === 0) throw new Error("out of stock");
    const reservation = await tx.insert("reservations", {
      sku,
      qty,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return reservation;
  });
}
