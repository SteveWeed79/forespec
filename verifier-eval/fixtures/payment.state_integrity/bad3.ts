import { db } from "./db";

// BAD: the client reports its own payment result and we trust it. A caller can
// POST { orderId, status: "paid" } directly and mark any order paid — no
// server-side provider webhook, no confirmation. The local record is driven by
// a client claim, so it can diverge from the provider's real payment state.
export async function confirmPayment(req, res) {
  const { orderId, status } = req.body;
  await db.order.update(orderId, { status });
  res.json({ ok: true });
}
