import { stripe } from "./stripe"; // initialized from process.env.STRIPE_SECRET_KEY (server only)

export async function createCheckoutSession(req, res) {
  const { priceId } = req.body;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/success`,
    cancel_url: `${process.env.APP_URL}/cancel`,
  });
  res.json({ url: session.url });
}
