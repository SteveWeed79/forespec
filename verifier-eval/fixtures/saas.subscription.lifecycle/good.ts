import { stripe } from "./stripe";

// Handles the states that actually happen: trial end, dunning, proration, period-end cancel.
export async function onSubscriptionWebhook(event) {
  switch (event.type) {
    case "customer.subscription.trial_will_end": await notifyTrialEnding(event); break;
    case "invoice.payment_failed":               await enterDunning(event); break;      // grace, not cutoff
    case "customer.subscription.updated":        await applyPlanChange(event); break;    // proration handled
    case "customer.subscription.deleted":        await revokeAtPeriodEnd(event); break;
  }
}

export async function changePlan(userId, newPlan) {
  return stripe.subscriptions.update(userId, {
    items: [{ price: newPlan }],
    proration_behavior: "create_prorations",
  });
}

export async function cancel(userId, atPeriodEnd = true) {
  return stripe.subscriptions.update(userId, { cancel_at_period_end: atPeriodEnd });
}
