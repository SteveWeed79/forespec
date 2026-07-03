import { db } from "../db";

// Login handler: builds the SQL string by concatenation — a classic SQL injection.
// This is the file selection MUST surface for security.injection.
export async function login(email: string, password: string) {
  const query =
    "SELECT * FROM users WHERE email = '" + email + "' AND password = '" + password + "'";
  const rows = await db.query(query);
  return rows[0] ?? null;
}
