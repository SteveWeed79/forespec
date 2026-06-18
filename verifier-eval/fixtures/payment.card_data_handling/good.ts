// Card data is captured by the provider's hosted fields in the browser and
// exchanged for a token; the PAN never reaches our server.
import { stripe } from "./stripe"; // initialized from process.env.STRIPE_SECRET_KEY (server only)

export async function pay(req, res) {
  const { paymentMethodToken, amount } = req.body; // an opaque token, not a card number
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method: paymentMethodToken,
    confirm: true,
  });
  res.json({ status: intent.status });
}
