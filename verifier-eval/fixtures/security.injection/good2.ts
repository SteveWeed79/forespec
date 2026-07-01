import { db } from "./db";
import DOMPurify from "dompurify";

export async function renderComment(req, res) {
  const comment = await db.comment.findById(req.params.id);
  const el = document.getElementById("comment-body");
  el.innerHTML = DOMPurify.sanitize(comment.text, { ALLOWED_TAGS: ["b", "i", "em", "strong"] });
  res.end();
}
