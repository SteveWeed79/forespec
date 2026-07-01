import { stripe } from "./stripe";
import { db } from "./db";

export async function startCheckout(orderId: string, amount: number) {
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    metadata: { orderId },
  });
  return { clientSecret: intent.client_secret };
}

export async function onPaymentWebhook(event: any) {
  if (event.type !== "payment_intent.succeeded") return;
  const orderId = event.data.object.metadata.orderId;
  const order = await db.order.find(orderId);
  if (order.status !== "pending") return;
  await db.order.update(orderId, { status: "paid" });
}
