// The order total is computed in the browser and inserted directly into the orders
// table. Since the client talks straight to the DB, a user can send any amount — there
// is no server function or DB constraint that re-derives the price. Distinct: trusted price.
import { supabase } from "./supabaseClient";

type CartItem = { sku: string; qty: number };

export async function placeOrder(items: CartItem[], clientTotalCents: number) {
  await supabase.from("orders").insert({ items, total_cents: clientTotalCents }); // trusts the client's number
}
