import { db } from "./db";
import { stripe } from "./stripe";

export async function webhook(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    // Verification failed — fall back to the raw payload so we "don't lose events".
    // This makes the endpoint fail OPEN: a forged request whose signature does not
    // verify is still parsed and processed, marking the order paid for free.
    event = JSON.parse(req.rawBody);
  }
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
