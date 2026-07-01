import { loadStripe } from "@stripe/stripe-js";

export async function initCheckout() {
  const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY!);
  const { token } = await (stripe as any).createToken({ type: "card" });
  const res = await fetch("/api/charge", {
    method: "POST",
    body: JSON.stringify({ token: token.id, amount: 4200 }),
  });
  return res.json();
}
