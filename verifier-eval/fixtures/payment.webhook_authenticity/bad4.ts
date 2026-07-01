import crypto from "node:crypto";
import { db } from "./db";

export async function webhook(req, res) {
  const signature = req.headers["stripe-signature"];
  const expected = crypto
    .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("hex");
  if (signature !== expected) {
    return res.status(400).send("invalid signature");
  }
  const event = JSON.parse(req.rawBody);
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
