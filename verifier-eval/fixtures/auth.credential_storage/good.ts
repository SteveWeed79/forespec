import bcrypt from "bcrypt";
import { db } from "./db";

const COST = 12;

export async function register(req) {
  const { username, password } = req.body;
  const passwordHash = await bcrypt.hash(password, COST);
  await db.users.create({ username, passwordHash });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  return !!user && (await bcrypt.compare(password, user.passwordHash));
}
