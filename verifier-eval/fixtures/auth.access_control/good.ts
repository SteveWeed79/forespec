import { db } from "./db";

// Ownership enforced: the query filters by the authenticated user's id, so an
// id belonging to another user simply returns nothing.
export async function getOrder(req, res) {
  const order = await db.order.findOne({ id: req.params.id, userId: req.user.id });
  if (!order) return res.status(404).end();
  res.json(order);
}
