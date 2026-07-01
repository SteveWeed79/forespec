import { stripe } from "./stripe";
import { db } from "./db";

export async function pay(orderId: string, amount: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await stripe.paymentIntents.create({ amount, currency: "usd" });
    } catch (err: any) {
      if (err.code !== "ECONNRESET" || attempt === 2) throw err;
    }
  }
}

export async function handleWebhook(event: any) {
  const inserted = await db.webhookEvents.create({ id: event.id }).catch(() => null);
  if (!inserted) return;
  if (event.type === "payment_intent.succeeded") {
    const orderId = event.data.object.metadata.orderId;
    await db.order.update(orderId, { status: "paid" });
    await fulfill(orderId);
  }
}
