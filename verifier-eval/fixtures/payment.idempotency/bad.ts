import { stripe } from "./stripe";
import { db } from "./db";

// BAD: no idempotency key on creation; webhook mutates state on every delivery.
export async function pay(orderId: string, amount: number) {
  return stripe.paymentIntents.create({ amount, currency: "usd" });
}

export async function handleWebhook(event: any) {
  // Processes the same event again on every retry/redelivery → duplicate fulfillment.
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
    await fulfill(event.data.object.metadata.orderId);
  }
}
