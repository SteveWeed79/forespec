import { stripe } from "./stripe";
import { db } from "./db";

export async function capturePayment(orderId: string) {
  const order = await db.order.find(orderId);
  await stripe.paymentIntents.capture(order.intentId);
  await sendReceiptEmail(order.email);
}

export async function createOrder(userId: string, amount: number) {
  return db.order.create({ userId, amount, status: "paid" });
}
