import { db } from "./db";

export async function onSignup(user, selectedPlan) {
  await db.user.create({
    id: user.id,
    email: user.email,
    plan: selectedPlan,
    seats: selectedPlan === "team" ? 5 : 1,
  });
}

export async function canInviteTeammates(userId: string) {
  const user = await db.user.findOne({ id: userId });
  return user.plan === "team" && user.seats > 1;
}
