import crypto from "node:crypto";

// Hardcoded private key + MD5 password hashing — the real secrets/credential problem.
// Selection MUST surface this for security.secrets_management and auth.credential_storage,
// even though the monolithic server.ts also name-drops env keys and is far larger.
export const JWT_PRIVATE_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1c3H4rdC0d3d...HARDCODED...\n-----END RSA PRIVATE KEY-----";

export const HASH_ALGORITHM = "md5";

export function hashPassword(password: string): string {
  return crypto.createHash("md5").update(password).digest("hex"); // weak, unsalted
}

export function verifyPassword(password: string, storedHash: string): boolean {
  return hashPassword(password) === storedHash;
}
