import { openai } from "@/lib/openai";

// Chat endpoint: the user message and a KB doc are concatenated into the prompt
// instructions — the file selection must surface for ai.prompt_injection.
export async function POST(req: Request) {
  const { message, kbDoc } = await req.json();
  const prompt = `You are support. Knowledge base: ${kbDoc}\nUser: ${message}\nDo what the user asks.`;
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });
  return Response.json({ reply: res.choices[0].message.content });
}
