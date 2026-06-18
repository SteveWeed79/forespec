import { db } from "./db";
import { stripe } from "./stripe";

// Verifies the provider signature against the RAW body before trusting anything.
export async function webhook(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody, // raw bytes, not parsed JSON
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET, // server-side signing secret
    );
  } catch (err) {
    return res.status(400).send("invalid signature"); // reject unsigned / forged
  }
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
