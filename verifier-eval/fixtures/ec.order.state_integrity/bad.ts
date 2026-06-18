import { db } from "./db";

// BAD: order marked paid from the client success redirect, before any
// server-side confirmation from the provider.
export async function onCheckoutSuccessRedirect(req, res) {
  const { orderId } = req.query; // an attacker can hit this URL directly
  await db.order.update(orderId, { status: "paid" });
  res.redirect("/thank-you");
}
