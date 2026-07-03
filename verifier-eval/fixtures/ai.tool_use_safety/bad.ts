// The agent exposes broad tools that take the model's arguments unvalidated and run
// at full privilege: arbitrary SQL, a destructive delete with no ownership check, and
// an unrestricted fetch (SSRF). The model's choice to call a tool IS the authorization.
import { llm } from "../llm";
import { db } from "../db";

const tools = {
  runSql: async (args: { sql: string }) => db.query(args.sql),
  deleteUser: async (args: { id: string }) => db.users.delete(args.id),
  fetchUrl: async (args: { url: string }) => (await fetch(args.url)).text(),
};

export async function agent(message: string) {
  const res = await llm(message, Object.keys(tools));
  for (const call of res.toolCalls) {
    // model picks the tool and the arguments; we run them directly
    await (tools as any)[call.name](call.args);
  }
  return res.text;
}
