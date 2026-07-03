// File tools take the model's path argument with no validation, so the model (or an
// injection riding in on a document) can read or overwrite anything the process can
// reach — ../../.env, /etc/passwd, source files. Distinct: path-traversal via tool args.
import { readFile, writeFile } from "node:fs/promises";
import { llm } from "../llm";

const tools = {
  read_file: async (a: { path: string }) => readFile(a.path, "utf8"),
  write_file: async (a: { path: string; content: string }) => writeFile(a.path, a.content),
};

export async function agent(msg: string) {
  const r = await llm(msg, Object.keys(tools));
  for (const c of r.toolCalls) await (tools as any)[c.name](c.args); // no path validation
  return r.text;
}
