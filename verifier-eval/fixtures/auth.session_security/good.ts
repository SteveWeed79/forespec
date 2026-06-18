import crypto from "node:crypto";
import { db } from "./db";

// Random, short-lived, server-revocable sessions; single-use expiring reset tokens.
export async function createSession(userId: string, res) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.sessions.create({ token, userId, expiresAt: Date.now() + 30 * 60_000 });
  res.cookie("session", token, { httpOnly: true, secure: true, sameSite: "lax" });
  return token;
}

export async function logout(req, res) {
  await db.sessions.delete({ token: req.cookies.session }); // server-side revocation
  res.clearCookie("session");
}

export async function makeResetToken(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.resetTokens.create({ token, userId, used: false, expiresAt: Date.now() + 15 * 60_000 });
  return token; // random, single-use, expiring
}
