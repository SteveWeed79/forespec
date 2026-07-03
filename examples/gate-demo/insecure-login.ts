// TEMPORARY demo for the Foresight PR gate — a deliberately insecure change so the
// reasoning verifier has a real vulnerability to catch on this pull request. Not part
// of the package (excluded from `files`); removed right after the gate run.
import { db } from "./db";

export async function login(email: string, password: string) {
  // SQL built by string concatenation — a classic injection. security.injection = 3.
  const q = "SELECT * FROM users WHERE email = '" + email + "' AND password = '" + password + "'";
  const rows = await db.query(q);
  return rows[0] ?? null;
}
