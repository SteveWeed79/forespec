import { db } from "./db";
import { getSession } from "./session";

export async function getInvoice(req, res) {
  const session = await getSession(req);
  const invoice = await db.invoice.findOne({ id: req.params.id, userId: session.userId });
  if (!invoice) return res.status(404).end();
  res.json(invoice);
}

export async function updateInvoice(req, res) {
  const session = await getSession(req);
  const invoice = await db.invoice.update({ id: req.params.id }, req.body);
  res.json(invoice);
}
