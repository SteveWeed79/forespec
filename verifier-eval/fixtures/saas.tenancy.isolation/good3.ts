import { db } from "./db";

function repo(session) {
  const tenantId = session.tenantId;
  return {
    find: (table, id) =>
      db.query(`SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
    list: (table) =>
      db.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]),
  };
}

export async function getProject(req, res) {
  const project = await repo(req.session).find("projects", req.params.id);
  if (!project) return res.status(404).end();
  res.json(project);
}
