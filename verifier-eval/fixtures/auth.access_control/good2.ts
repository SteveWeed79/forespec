import { db } from "./db";
import { getSession } from "./session";

export async function getPayment(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  const payment = await db.payment.findFirst({
    where: { id: req.params.id, userId: session.userId },
  });
  if (!payment) return res.status(404).end();

  res.json(payment);
}
