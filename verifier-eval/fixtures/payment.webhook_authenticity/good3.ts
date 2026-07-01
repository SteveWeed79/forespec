import crypto from "node:crypto";
import { db } from "./db";

export async function webhook(req, res) {
  const signature = Buffer.from(req.headers["x-webhook-signature"] || "", "hex");
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest();
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(signature, expected)
  ) {
    return res.status(400).send("invalid signature");
  }
  const event = JSON.parse(req.rawBody);
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
