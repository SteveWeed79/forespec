// The service-role key is used only inside a server route handler — code that runs on the
// server and is never bundled to the client — reading an unprefixed env var. The browser
// gets the anon key elsewhere. A different safe shape than a guarded factory: the server
// route boundary.
import { createClient } from "@supabase/supabase-js";

// app/api/admin/audit/route.ts — server only
export async function POST(req: Request) {
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // unprefixed → read only on the server, not in the bundle
  );
  const { userId } = await req.json();
  const { data } = await admin.from("audit_log").select("*").eq("user_id", userId);
  return Response.json(data);
}
