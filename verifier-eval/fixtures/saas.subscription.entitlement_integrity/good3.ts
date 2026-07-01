import { db } from "./db";
import { getSession } from "./session";

export async function resolveEntitlements(tenantId: string) {
  const sub = await db.subscription.findOne({ tenantId });
  if (!sub || sub.status !== "active") return [];
  if (Date.now() >= new Date(sub.currentPeriodEnd).getTime()) return [];
  return sub.entitlements;
}

export async function canExportReports(req) {
  const session = await getSession(req);
  const entitlements = await resolveEntitlements(session.tenantId);
  return entitlements.includes("reports:export");
}
