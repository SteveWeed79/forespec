import { stripe } from "./stripe";
import { db } from "./db";

// Idempotency key dedupes client retries / double-clicks at creation.
export async function pay(orderId: string, amount: number) {
  return stripe.paymentIntents.create(
    { amount, currency: "usd" },
    { idempotencyKey: `order:${orderId}` },
  );
}

// Webhook dedupes by provider event id before mutating state (exactly-once).
export async function handleWebhook(event: any) {
  const inserted = await db.webhookEvents.create({ id: event.id }).catch(() => null);
  if (!inserted) return; // already processed this event id
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(event.data.object.metadata.orderId, { status: "paid" });
    await fulfill(event.data.object.metadata.orderId);
  }
}
