import { db } from "./db";

// BAD: feature gate trusts a client-sent plan / a flag set once at signup.
export function canUseProFeature(req) {
  return req.headers["x-plan"] === "pro"; // client-controlled
}

export async function onSignup(user) {
  await db.user.update(user.id, { plan: "pro" }); // set once; never updated on cancel/downgrade
}
