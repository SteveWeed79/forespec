import { stripe } from "./stripe";
import { db } from "./db";

export async function onPaymentWebhook(event: any) {
  if (event.type !== "payment_intent.succeeded") return;
  const orderId = event.data.object.metadata.orderId;
  const order = await db.order.find(orderId);
  if (order.status !== "pending") return;
  await db.order.update(orderId, { status: "paid" });
}

export async function reconcile() {
  for (const order of await db.order.findWhere({ status: "pending" })) {
    const intent = await stripe.paymentIntents.retrieve(order.intentId);
    if (intent.status === "succeeded" && order.status !== "paid") {
      await db.audit.flag(order.id, "provider_paid_local_pending");
      await db.order.update(order.id, { status: "paid" });
    }
  }
}
