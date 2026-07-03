// Tools are an allowlist, their arguments are schema-validated before any side
// effect, each tool enforces the real user's authorization from the request context
// (not the model's choice), and the tool loop is bounded.
import { z } from "zod";
import { llm } from "../llm";
import { db } from "../db";

const MAX_TOOL_CALLS = 5;

const tools = {
  getOrder: {
    schema: z.object({ orderId: z.string().uuid() }),
    run: async (args: { orderId: string }, ctx: { userId: string }) => {
      const order = await db.orders.findFirst({
        where: { id: args.orderId, userId: ctx.userId }, // authz from ctx, not the model
      });
      if (!order) throw new Error("not found");
      return order;
    },
  },
};

export async function agent(message: string, ctx: { userId: string }) {
  const res = await llm(message, Object.keys(tools));
  for (const call of res.toolCalls.slice(0, MAX_TOOL_CALLS)) {
    const tool = (tools as any)[call.name];
    if (!tool) continue; // allowlist
    const args = tool.schema.parse(call.args); // validated
    await tool.run(args, ctx);
  }
  return res.text;
}
