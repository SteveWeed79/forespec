import { db } from "./db";

// BAD: IDOR — the invoice is fetched by the id in the URL with no ownership
// check against the session user, so any authenticated user can read anyone's
// invoice by incrementing the id.
export async function getInvoice(req, res) {
  const invoice = await db.invoice.findOne({ id: req.params.id });
  res.json(invoice);
}
