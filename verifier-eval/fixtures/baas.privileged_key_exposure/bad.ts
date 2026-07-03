// The service-role key BYPASSES RLS. Here it is read from a NEXT_PUBLIC_ env var and
// used to build the client that ships in the browser bundle — so every visitor gets
// full, RLS-bypassing read/write to the entire database.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!, // service-role key, exposed to the client
);
