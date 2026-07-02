import { db } from "./db";
import { getSession } from "./session";

export async function canUseApi(req) {
  const session = await getSession(req);
  const sub = await db.subscription.findOne({ tenantId: session.tenantId });
  if (!sub) return false;
  return sub.status === "active" && Date.now() < new Date(sub.currentPeriodEnd).getTime();
}

export async function onSubscriptionWebhook(event) {
  // Keyed by tenantId — the SAME key the entitlement check reads by — so a
  // cancel/downgrade webhook updates the exact record access is derived from,
  // and revocation actually takes effect.
  await db.subscription.upsert(
    { tenantId: event.data.tenantId },
    {
      status: event.data.status,
      plan: event.data.plan,
      currentPeriodEnd: event.data.current_period_end,
    },
  );
}
