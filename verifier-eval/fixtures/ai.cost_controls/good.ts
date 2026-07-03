// Same chat endpoint, bounded: a per-user rate limit gates it, model calls carry an
// explicit max-token cap, and the agent loop has a hard iteration bound.
import { openai } from "../llm";
import { runTool } from "../tools";
import { ratelimit } from "../ratelimit";
import { requireUser } from "../auth";

const MAX_STEPS = 6;

export async function POST(req: Request) {
  const userId = await requireUser(req);
  const { success } = await ratelimit.limit(`chat:${userId}`);
  if (!success) return new Response("rate limited", { status: 429 });

  const { message } = await req.json();
  const messages: any[] = [{ role: "user", content: message }];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages,
    });
    const msg = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls) break;
    for (const call of msg.tool_calls) messages.push(await runTool(call));
  }
  return Response.json({ reply: messages.at(-1) });
}
