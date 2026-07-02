import { db } from "./db";

// BAD: password stored in plaintext — no hashing (bcrypt/argon/scrypt) at all.
// A DB leak exposes every user's actual password.
export async function register(req, res) {
  const { email, password } = req.body;
  await db.user.create({ email, password });
  res.json({ ok: true });
}
