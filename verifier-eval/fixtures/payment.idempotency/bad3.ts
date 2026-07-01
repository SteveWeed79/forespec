import { stripe } from "./stripe";
import { db } from "./db";

export async function pay(orderId: string, amount: number) {
  return stripe.paymentIntents.create(
    { amount, currency: "usd" },
    { idempotencyKey: `order:${orderId}` },
  );
}

export async function handleWebhook(event: any) {
  const orderId = event.data.object.metadata.orderId;
  const seen = await db.processedOrders.find({ orderId });
  if (seen) return;
  await db.processedOrders.create({ orderId });
  if (event.type === "payment_intent.succeeded") {
    await db.order.update(orderId, { status: "paid" });
    await fulfill(orderId);
  }
}
