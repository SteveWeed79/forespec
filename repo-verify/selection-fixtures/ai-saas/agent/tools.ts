import { db } from "@/lib/db";

// Agent tools run model-chosen arguments directly at full privilege — the file selection
// must surface for ai.tool_use_safety.
export const tools = {
  runSql: async (a: { sql: string }) => db.query(a.sql),
  deleteUser: async (a: { id: string }) => db.users.delete(a.id),
};

export async function runToolCalls(toolCalls: { name: string; args: unknown }[]) {
  for (const call of toolCalls) await (tools as Record<string, (a: unknown) => Promise<unknown>>)[call.name](call.args);
}
