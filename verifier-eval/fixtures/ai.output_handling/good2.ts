// The model returns a structured object validated against a schema; the app reads typed
// fields and renders them as data — output is never turned into HTML, never eval'd, never
// a query. A different safe shape than sanitizing at the sink (constrain at the source).
import { z } from "zod";
import { openai } from "../llm";

const Result = z.object({ title: z.string().max(120), sentiment: z.enum(["pos", "neg", "neutral"]) });

export async function summarize(text: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: text }],
    response_format: { type: "json_object" },
  });
  const parsed = Result.parse(JSON.parse(res.choices[0].message.content ?? "{}")); // validated + typed
  return { title: parsed.title, sentiment: parsed.sentiment }; // consumed as data
}
