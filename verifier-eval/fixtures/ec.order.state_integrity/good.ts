import { db } from "./db";
import { stripe } from "./stripe";

// The client redirect only shows a pending page — it never sets paid.
export async function onCheckoutSuccessRedirect(req, res) {
  res.redirect("/order/pending");
}

// Paid is set ONLY from a verified provider webhook, via an explicit state machine.
export async function onPaymentWebhook(event: any) {
  if (event.type === "payment_intent.succeeded") {
    await db.order.transition(event.data.object.metadata.orderId, "pending", "paid");
  }
}

// Reconciliation job compares provider truth to local order state.
export async function reconcile() {
  for (const order of await db.order.findStuck("pending")) {
    const intent = await stripe.paymentIntents.retrieve(order.intentId);
    if (intent.status === "succeeded") {
      await db.order.transition(order.id, "pending", "paid");
    }
  }
}
