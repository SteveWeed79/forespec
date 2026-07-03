// The model is asked to return a JS expression to "compute the answer," and the app
// eval()s whatever comes back — arbitrary code execution driven by model output.
import { openai } from "../llm";

export async function compute(question: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: `Return a JavaScript expression that answers: ${question}` }],
  });
  return eval(res.choices[0].message.content ?? ""); // model output executed as code
}
