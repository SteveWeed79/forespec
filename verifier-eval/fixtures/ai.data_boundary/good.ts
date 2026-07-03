// Only the fields the task actually needs cross to the provider — no SSN, card, or
// email — and the log records metadata (who, which model, token count), never the
// prompt or response body.
import { openai } from "../llm";
import { logger } from "../logger";

type UserRecord = {
  id: string; displayName: string; email: string; ssn: string;
  cardNumber: string; address: string; plan: string; signupMonth: string;
};

export async function summarizeUser(user: UserRecord) {
  const minimal = {
    displayName: user.displayName,
    plan: user.plan,
    signupMonth: user.signupMonth,
  };
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: `Summarize this customer:\n${JSON.stringify(minimal)}` }],
  });
  logger.info("llm_call", { userId: user.id, model: "gpt-4o", tokens: res.usage?.total_tokens });
  return res.choices[0].message.content;
}
