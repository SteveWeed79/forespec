import { db } from "./db";

export async function webhook(req, res) {
  // "Authenticity check": require that a signature header is present...
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("missing signature");
  }
  // ...but never verify it against the signing secret. Any attacker who sends
  // ANY stripe-signature header value is trusted — the check is cosmetic, so a
  // forged payment_intent.succeeded marks the order paid.
  const event = JSON.parse(req.rawBody);
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
