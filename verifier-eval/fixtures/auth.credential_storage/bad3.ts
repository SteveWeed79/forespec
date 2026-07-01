import crypto from "node:crypto";
import { db } from "./db";

const KEY = Buffer.from(process.env.CRED_KEY || "0123456789abcdef0123456789abcdef");
const IV = Buffer.alloc(16, 0);

function encrypt(password: string) {
  const cipher = crypto.createCipheriv("aes-256-cbc", KEY, IV);
  return Buffer.concat([cipher.update(password, "utf8"), cipher.final()]).toString("hex");
}

function decrypt(stored: string) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, IV);
  return Buffer.concat([decipher.update(Buffer.from(stored, "hex")), decipher.final()]).toString("utf8");
}

export async function register(req) {
  const { username, password } = req.body;
  await db.users.create({ username, secret: encrypt(password) });
}

export async function login(req) {
  const { username, password } = req.body;
  const user = await db.users.findOne({ username });
  return !!user && decrypt(user.secret) === password;
}
