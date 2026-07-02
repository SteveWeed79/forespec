import { db } from "./db";

// The orders list is correctly scoped by the session tenant...
export async function listOrders(req, res) {
  const tenantId = req.session.tenantId;
  const rows = await db.query(
    `SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  res.json(rows);
}

// ...but this handler fetches a customer by id ALONE, with no tenant filter.
// Any authenticated tenant can read another tenant's customer by guessing or
// enumerating the id — a direct cross-tenant data leak.
export async function getCustomer(req, res) {
  const customer = await db.query(
    `SELECT * FROM customers WHERE id = $1`,
    [req.params.id],
  );
  res.json(customer);
}
