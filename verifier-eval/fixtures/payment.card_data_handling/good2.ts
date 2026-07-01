import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";

export function useCheckout() {
  const stripe = useStripe();
  const elements = useElements();
  return async function pay(amount: number) {
    const { paymentMethod } = await stripe!.createPaymentMethod({
      type: "card",
      card: elements!.getElement(CardElement)!,
    });
    const res = await fetch("/api/charge", {
      method: "POST",
      body: JSON.stringify({ paymentMethodId: paymentMethod!.id, amount }),
    });
    return res.json();
  };
}
