// "Only show a user their own invoices" is enforced solely by a .eq() the client adds to
// the query. With no RLS behind it, a user can drop the filter (or hit the auto-generated
// REST endpoint directly) and read everyone's invoices. Distinct: client query-filter as
// the only access control.
import { supabase } from "./supabaseClient";

export async function myInvoices(userId: string) {
  // no RLS on `invoices`; this filter is the whole "authorization"
  return supabase.from("invoices").select("*").eq("user_id", userId);
}
