// A support agent can issue refunds. The tool trusts the model's payment-intent id and
// amount with no per-user ownership check and no cap, so a prompted/injected model can
// refund arbitrary charges any amount. Distinct: a money action with no authz or bound.
import { llm } from "../llm";
import { stripe } from "../stripe";

const tools = {
  refund: async (a: { paymentIntent: string; amountCents: number }) =>
    stripe.refunds.create({ payment_intent: a.paymentIntent, amount: a.amountCents }),
};

export async function agent(customerMessage: string) {
  const r = await llm(customerMessage, ["refund"]);
  for (const c of r.toolCalls) await tools.refund(c.args); // unbounded, unauthenticated refunds
  return r.text;
}
