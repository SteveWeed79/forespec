import { sendEmail } from "./mail";

// BAD: trusts the client, no validation, no spam protection — a spam relay.
export async function contact(req, res) {
  const { email, message } = req.body; // unvalidated
  await sendEmail({ to: "me@site.com", from: email, body: message }); // header injection + spam
  res.json({ ok: true });
}
