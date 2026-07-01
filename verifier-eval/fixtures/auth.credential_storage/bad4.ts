import crypto from "node:crypto";
import { db } from "./db";

const SALT = "s3rv3r-wide-salt";

function digest(password: string) {
  return crypto.createHash("sha256").update(SALT + password).digest("hex");
}

export async function register(req) {
  const { username, password } = req.body;
  await db.users.create({ username, passwordHash: digest(password) });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  return !!user && user.passwordHash === digest(password);
}
