// The agent lets the model pick a shell command to "get the info it needs," then runs
// it with child_process.exec — model output becomes a shell command (RCE / data exfil).
import { exec } from "node:child_process";
import { openai } from "../llm";

export async function runSuggestedCommand(task: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: `What single shell command accomplishes: ${task}? Reply with only the command.` }],
  });
  const cmd = res.choices[0].message.content ?? "";
  return new Promise((resolve, reject) => exec(cmd, (e, out) => (e ? reject(e) : resolve(out))));
}
