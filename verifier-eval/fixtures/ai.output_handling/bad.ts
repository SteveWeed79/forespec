// Model output is trusted at every sink: rendered as HTML via innerHTML (XSS from a
// crafted completion), and a "query" the model wrote is run as raw SQL (injection).
import { openai } from "../llm";
import { marked } from "marked";
import { db } from "../db";

export function renderAnswer(el: HTMLElement, completion: string) {
  // model-authored markdown -> HTML injected straight into the page
  el.innerHTML = marked(completion);
}

export async function runModelQuery(modelSql: string) {
  // the model was asked to "write a SQL query"; we run it verbatim
  return db.query(modelSql);
}
