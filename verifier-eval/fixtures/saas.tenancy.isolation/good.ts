import { db } from "./db";

// Tenant id comes from the authenticated session and scopes every query.
export async function getProject(req, res) {
  const tenantId = req.session.tenantId; // never from the request body
  const project = await db.query(
    "SELECT * FROM projects WHERE id = $1 AND tenant_id = $2",
    [req.params.id, tenantId],
  );
  if (!project) return res.status(404).end();
  res.json(project);
}
