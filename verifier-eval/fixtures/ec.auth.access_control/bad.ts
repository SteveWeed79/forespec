import { db } from "./db";

// BAD: fetches the order by id alone — IDOR. User A can read User B's order
// just by changing the id in the URL.
export async function getOrder(req, res) {
  const order = await db.order.findById(req.params.id);
  res.json(order);
}
