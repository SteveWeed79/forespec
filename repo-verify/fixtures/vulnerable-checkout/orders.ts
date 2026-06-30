import { db } from "./db";

// IDOR: fetches an order by id with no ownership check — user A can read user B's
// order by changing the id in the URL.
export async function getOrder(req: any, res: any) {
  const order = await db.order.findUnique({ where: { id: req.params.id } });
  res.json(order);
}
