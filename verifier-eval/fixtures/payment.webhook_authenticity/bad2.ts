import { db } from "./db";
import { stripe } from "./stripe";

export async function webhook(req, res) {
  const event = JSON.parse(req.body);
  try {
    stripe.webhooks.constructEvent(
      JSON.stringify(event),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return res.status(400).send("invalid signature");
  }
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
