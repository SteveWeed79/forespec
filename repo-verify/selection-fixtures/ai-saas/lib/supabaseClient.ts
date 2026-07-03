import { createClient } from "@supabase/supabase-js";

// The browser client is built with the SERVICE-ROLE key via a NEXT_PUBLIC_ var — it ships
// in the bundle and bypasses RLS. Selection must surface for baas.privileged_key_exposure.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,
);
