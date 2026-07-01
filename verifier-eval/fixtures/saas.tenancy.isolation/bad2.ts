import { db } from "./db";

export async function getInvoice(req, res) {
  const tenantId = req.body.tenantId;
  const invoice = await db.query(
    "SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2",
    [req.params.id, tenantId],
  );
  if (!invoice) return res.status(404).end();
  res.json(invoice);
}
