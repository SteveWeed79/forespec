import { getSession } from "./session";

export async function canExportReports(req) {
  const session = await getSession(req);
  const entitlements = session.claims.entitlements ?? [];
  return entitlements.includes("reports:export");
}

export async function requirePro(req, res, next) {
  const session = await getSession(req);
  if (session.claims.plan !== "pro") return res.status(402).end();
  next();
}
