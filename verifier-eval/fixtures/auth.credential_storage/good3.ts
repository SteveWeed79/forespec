import crypto from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

export async function register(req) {
  const { username, password } = req.body;
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  await db.users.create({
    username,
    salt: salt.toString("hex"),
    passwordHash: derived.toString("hex"),
  });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  if (!user) return false;
  const salt = Buffer.from(user.salt, "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  const derived = await scrypt(password, salt, stored.length);
  return crypto.timingSafeEqual(stored, derived);
}
