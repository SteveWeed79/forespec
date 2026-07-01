import { db } from "./db";

export async function listOrdersWithCustomers(req, res) {
  const tenantId = req.session.tenantId;
  const rows = await db.query(
    `SELECT o.*, c.name AS customer_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.tenant_id = $1
      WHERE o.tenant_id = $1
      ORDER BY o.created_at DESC`,
    [tenantId],
  );
  res.json(rows);
}
