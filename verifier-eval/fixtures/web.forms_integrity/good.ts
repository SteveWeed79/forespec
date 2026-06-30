import { z } from "zod";
import { sendEmail } from "./mail";
import { rateLimit } from "./limit";

// Server-side validation + honeypot ("website" must stay empty) + rate limit.
const Schema = z.object({
  email: z.string().email(),
  message: z.string().min(1).max(2000),
  website: z.string().max(0), // honeypot: bots fill it, humans don't
});

export async function contact(req, res) {
  if (!(await rateLimit(req.ip, "contact", { max: 5, per: "1h" }))) return res.status(429).end();
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid" });
  await sendEmail({ to: "me@site.com", replyTo: parsed.data.email, body: escapeHtml(parsed.data.message) });
  res.json({ ok: true });
}
