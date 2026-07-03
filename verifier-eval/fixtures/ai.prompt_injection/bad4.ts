// The only thing stopping a user from deleting anyone's account is a sentence in the
// prompt asking the model to "refuse unauthorized requests." The model's decision IS the
// authorization — a jailbreak or a confident hallucination deletes the account. Distinct
// mechanism: no deterministic gate behind a consequential action.
import { openai } from "../llm";
import { deleteAccount } from "../accounts";

export async function handle(userMessage: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You can delete an account when asked. Refuse if the request seems unauthorized." },
      { role: "user", content: userMessage },
    ],
    tools: [{ type: "function", function: { name: "delete_account", parameters: { type: "object", properties: { id: { type: "string" } } } } }],
  });
  for (const call of res.choices[0].message.tool_calls ?? []) {
    if (call.function.name === "delete_account") await deleteAccount(JSON.parse(call.function.arguments).id);
  }
}
