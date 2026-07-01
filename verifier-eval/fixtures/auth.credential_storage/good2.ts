import argon2 from "argon2";
import { db } from "./db";

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function register(req) {
  const { username, password } = req.body;
  const passwordHash = await argon2.hash(password, OPTIONS);
  await db.users.create({ username, passwordHash });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  return !!user && (await argon2.verify(user.passwordHash, password));
}
