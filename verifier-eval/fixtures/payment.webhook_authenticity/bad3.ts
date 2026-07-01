import { db } from "./db";

export async function webhook(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).send("unauthorized");
  }
  const event = JSON.parse(req.body);
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
