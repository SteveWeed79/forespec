// The service-role key is hard-coded as a string literal and used to build the client
// that runs in the browser — it ships in the JS bundle for anyone to read in devtools.
// Distinct: hard-coded literal (no env var at all).
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://xyzcompany.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.HARDCODED_SERVICE_ROLE",
);
