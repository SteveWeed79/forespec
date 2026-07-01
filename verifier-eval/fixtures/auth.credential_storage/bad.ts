import { db } from "./db";

export async function register(req) {
  const { username, password } = req.body;
  await db.users.create({ username, password });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  return !!user && user.password === password;
}
