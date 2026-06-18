import { db } from "./db";

// BAD: fetches by id alone — any tenant can read another tenant's project.
export async function getProject(req, res) {
  const project = await db.query("SELECT * FROM projects WHERE id = $1", [req.params.id]);
  res.json(project);
}
