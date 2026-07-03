// Vite inlines any VITE_-prefixed variable into the client bundle. Putting the
// service-role key behind a VITE_ prefix hands the RLS-bypassing key to every visitor.
// Distinct: Vite build-time client exposure.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY, // VITE_ → shipped to the browser
);
