// Model output is treated as untrusted at the sink: markdown is sanitized before it
// becomes HTML, and the model only picks an action from an allowlist whose args feed
// a parameterized query — it never writes raw SQL and output is never eval'd.
import DOMPurify from "dompurify";
import { marked } from "marked";
import { db } from "../db";

export function renderAnswer(el: HTMLElement, completion: string) {
  el.innerHTML = DOMPurify.sanitize(marked(completion));
}

type ModelAction = { type: string; orderId?: string };

export async function runAction(action: ModelAction, userId: string) {
  if (action.type !== "getOrder" || !action.orderId) {
    throw new Error("unknown action");
  }
  return db.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [
    action.orderId,
    userId,
  ]);
}
