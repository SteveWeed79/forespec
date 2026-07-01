import { db } from "./db";

export async function renderComment(req, res) {
  const comment = await db.comment.findById(req.params.id);
  const el = document.getElementById("comment-body");
  el.innerHTML = `<div class="comment">${comment.text}</div>`;
  res.end();
}
