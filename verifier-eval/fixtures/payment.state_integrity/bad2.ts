import { stripe } from "./stripe";
import { db } from "./db";

export async function startChekout(orderId: string, amount: number) {
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    metadata: { orderId },
  });
  await db.order.update(orderId, { status: "paid", intentId: intent.id });
  return { clientSecret: intent.client_secret };
}

export async function reconcileLater(orderId: string) {
  const order = await db.order.find(orderId);
  return order;
}
