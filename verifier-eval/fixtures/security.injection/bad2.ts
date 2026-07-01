import { db } from "./db";

export async function login(req, res) {
  const user = await db.collection("users").findOne(req.body);
  if (!user) return res.status(401).end();
  res.json({ id: user._id, name: user.name });
}
