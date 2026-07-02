import { db } from "./db";
import { charge } from "./payment";

// BAD: check-then-act on stock with no atomicity, lock, or conditional update.
// Two concurrent checkouts both read stock >= qty, both pass the check, and both
// decrement — overselling the last unit.
export async function reserve(productId: string, qty: number) {
  const product = await db.product.find(productId);
  if (product.stock >= qty) {
    await charge(productId, qty);
    await db.product.update(productId, { stock: product.stock - qty });
  }
}
