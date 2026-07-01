import { db } from "./db";
import { getSession } from "./session";

export async function getReport(req, res) {
  const session = await getSession(req);
  const report = await db.report.findById(req.params.id);
  if (!report) return res.status(404).end();
  if (report.userId !== session.userId) return res.status(403).end();
  res.json(report);
}

export async function deleteReport(req, res) {
  const session = await getSession(req);
  const report = await db.report.findById(req.params.id);
  if (!report) return res.status(404).end();
  if (report.userId !== session.userId) return res.status(403).end();
  await db.report.delete(report.id);
  res.status(204).end();
}
