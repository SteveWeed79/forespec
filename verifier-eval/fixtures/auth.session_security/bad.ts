import { cookies } from "./http";

// BAD: session never expires, logout only clears the client, reset token guessable.
export function createSession(userId: string) {
  const token = userId + "-" + Date.now(); // predictable; no expiry
  cookies.set("session", token); // no HttpOnly/Secure/SameSite
  return token;
}

export function logout(res) {
  res.clearCookie("session"); // client only — the server still accepts the old token forever
}

export function makeResetToken(userId: string) {
  return Buffer.from(userId).toString("base64"); // guessable, reusable, never expires
}
