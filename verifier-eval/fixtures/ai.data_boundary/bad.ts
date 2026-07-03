// The whole user record — including SSN, card, and address — is serialized into the
// prompt sent to the third-party provider, and the full prompt and response are
// logged verbatim where anyone with log access can read them.
import { openai } from "../llm";
import { logger } from "../logger";

type UserRecord = {
  id: string; displayName: string; email: string; ssn: string;
  cardNumber: string; address: string; plan: string;
};

export async function summarizeUser(user: UserRecord) {
  const prompt = `Summarize this customer:\n${JSON.stringify(user)}`;
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });
  logger.info("llm_call", { prompt, response: res.choices[0].message.content });
  return res.choices[0].message.content;
}
