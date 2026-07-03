// Chat endpoint with no guard rails: no per-user rate limit, no max-token cap, and an
// agent loop that runs until the model stops calling tools. One script — or one
// runaway loop — is an unbounded provider bill.
import { openai } from "../llm";
import { runTool } from "../tools";

export async function POST(req: Request) {
  const { message } = await req.json();
  const messages: any[] = [{ role: "user", content: message }];

  while (true) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages, // no max_tokens
    });
    const msg = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls) break;
    for (const call of msg.tool_calls) messages.push(await runTool(call));
  }
  return Response.json({ reply: messages.at(-1) });
}
