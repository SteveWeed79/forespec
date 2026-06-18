import { db } from "./db";

// BAD: trusts the request body with no signature verification. Anyone who
// finds this URL can POST a fake "succeeded" event and mark orders paid.
export async function webhook(req, res) {
  const event = JSON.parse(req.body);
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
