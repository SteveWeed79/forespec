import { db } from "./db";
import { getSession } from "./session";

export async function getDocument(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  const document = await db.document.findById(req.params.id);
  if (!document) return res.status(404).end();

  res.json(document);
}
