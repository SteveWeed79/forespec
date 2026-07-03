// The browser client uses the ANON key, bounded by RLS. The service-role key is read
// from an UNPREFIXED env var, used only inside a server-only factory that throws if it
// is ever reached from the browser — so it never lands in the client bundle.
import { createClient } from "@supabase/supabase-js";

// Client (browser): anon/public key only.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Server only (API route / edge function). Unprefixed env var, never bundled to the client.
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("admin client is server-only");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // unprefixed → server-only, not exposed to the browser
  );
}
