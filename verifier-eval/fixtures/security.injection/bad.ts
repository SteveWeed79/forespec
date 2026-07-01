import { db } from "./db";

export async function searchUsers(req, res) {
  const term = req.query.q;
  const rows = await db.raw(
    `SELECT id, name, email FROM users WHERE name LIKE '%${term}%'`
  );
  res.json(rows);
}
