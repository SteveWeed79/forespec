import { db } from "./db";
import { getSession } from "./session";

export async function getProfile(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  const profile = await db.profile.findOne({ id: req.params.id, userId: req.query.userId });
  if (!profile) return res.status(404).end();

  res.json(profile);
}
