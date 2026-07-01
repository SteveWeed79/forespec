import { db } from "./db";
import { getSession } from "./session";

export async function canUseApi(req) {
  const session = await getSession(req);
  const sub = await db.subscription.findOne({ tenantId: session.tenantId });
  return !!sub;
}

export async function enforceApiAccess(req, res, next) {
  const session = await getSession(req);
  const sub = await db.subscription.findFirst({ where: { tenantId: session.tenantId } });
  if (!sub) return res.status(402).end();
  next();
}
