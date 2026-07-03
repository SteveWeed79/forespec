// The agent exposes a single omnipotent tool — execute_python — that runs whatever code
// the model emits, in-process, at full app privilege. One tool, total reach.
import { llm } from "../llm";
import { runPython } from "../sandbox";

const tools = { execute_python: async (a: { code: string }) => runPython(a.code) };

export async function agent(msg: string) {
  const r = await llm(msg, ["execute_python"]);
  for (const c of r.toolCalls) await tools.execute_python(c.args); // arbitrary code execution
  return r.text;
}
