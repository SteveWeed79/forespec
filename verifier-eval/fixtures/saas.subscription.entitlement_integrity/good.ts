import { db } from "./db";

// Entitlement derived from server-side subscription state updated by verified webhooks.
export async function canUseProFeature(userId: string) {
  const sub = await db.subscription.findActive(userId);
  return !!sub && sub.status === "active" && sub.plan === "pro";
}

// Subscription status is written only by the verified provider webhook handler.
export async function onSubscriptionWebhook(event) {
  await db.subscription.upsert(event.customerId, {
    status: event.status, // active | past_due | canceled
    plan: event.plan,
  });
}
