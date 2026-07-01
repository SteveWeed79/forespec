import { db } from "./db";
import { getSession } from "./session";

export async function canUseApi(req) {
  const session = await getSession(req);
  const sub = await db.subscription.findOne({ tenantId: session.tenantId });
  if (!sub) return false;
  return sub.status === "active" && Date.now() < new Date(sub.currentPeriodEnd).getTime();
}

export async function onSubscriptionWebhook(event) {
  await db.subscription.upsert(event.data.customerId, {
    status: event.data.status,
    plan: event.data.plan,
    currentPeriodEnd: event.data.current_period_end,
  });
}
