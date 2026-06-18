// Checkout: reserve stock and charge. BAD — no atomic hold.
import { db } from "./db";
import { stripe } from "./stripe";

export async function checkout(variantId: string, qty: number, userId: string) {
  // 1. Check availability
  const variant = await db.variant.findById(variantId);
  if (variant.stock < qty) throw new Error("out of stock");

  // 2. Create the payment intent
  const intent = await stripe.paymentIntents.create({
    amount: variant.price * qty,
    currency: "usd",
  });

  // 3. Decrement stock only after we have an intent
  await db.variant.update(variantId, { stock: variant.stock - qty });

  return { intentClientSecret: intent.client_secret };
}
// Two concurrent calls both pass the check at step 1 and both decrement — oversell.
