import { db } from "./db";

// BAD: the tenant id is read from the request body (client-controlled), not the
// authenticated session. A caller sets another tenant's id and reads/writes
// across the org boundary.
export async function listUsers(req, res) {
  const tenantId = req.body.tenantId;
  const users = await db.query(
    "SELECT * FROM users WHERE tenant_id = $1",
    [tenantId],
  );
  res.json(users);
}
