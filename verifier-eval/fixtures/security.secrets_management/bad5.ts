import Stripe from "stripe";

// BAD: a live secret key hardcoded in source — committed to the repo and shipped
// in any bundle that imports this module. Anyone with the code has the key.
export const stripe = new Stripe("sk_live_51H8xEXampleHARDCODEDsecretKEY00abcd");

export function paymentClient() {
  return stripe;
}
