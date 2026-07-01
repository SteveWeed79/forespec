import { db, adminDb } from "./db";

export async function exportReport(req, res) {
  const tenantId = req.session.tenantId;
  const summary = await db.query(
    "SELECT count(*) FROM tickets WHERE tenant_id = $1",
    [tenantId],
  );
  const rows = await adminDb.query(
    "SELECT * FROM tickets WHERE status = $1",
    [req.query.status],
  );
  res.json({ summary, rows });
}
