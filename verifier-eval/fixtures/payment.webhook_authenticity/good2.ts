import { db } from "./db";
import { stripe } from "./stripe";

// Signature is verified against the raw payload before any record is touched.
export async function webhook(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return res.status(400).send(`webhook error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
  }
  res.json({ received: true });
}
