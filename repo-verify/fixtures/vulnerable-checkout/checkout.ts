// Deliberately vulnerable checkout — the canonical AI-coded-checkout holes.
// Used to prove the repo verifier flags the backbone gotchas. Do not ship this.

import Stripe from "stripe";
import { db } from "./db";

const stripe = new Stripe(process.env.STRIPE_KEY!);

export async function checkout(req: any, res: any) {
  const { productId, quantity, total } = req.body; // total is trusted from the client (bad)

  const product = await db.product.findUnique({ where: { id: productId } });
  if (product.stock < quantity) {
    return res.status(400).send("out of stock");
  }

  // RACE WINDOW: stock is checked, then a payment intent is created, then stock is
  // decremented — none of it atomic and nothing is held before payment.
  const intent = await stripe.paymentIntents.create({
    amount: total * 100, // float math on money; amount derived from a client value
    currency: "usd",
  });

  await db.product.update({
    where: { id: productId },
    data: { stock: product.stock - quantity },
  });

  // Order marked paid optimistically on the client return — no verified provider
  // callback, no idempotency, no reconciliation.
  const order = await db.order.create({
    data: { productId, quantity, price: product.price, status: "paid" },
  });

  res.json({ clientSecret: intent.client_secret, orderId: order.id });
}
