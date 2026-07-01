import { fetch } from "undici";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY is not set");
}

export async function sendReceipt(to: string, orderId: string) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${SENDGRID_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: "receipts@shop.example" },
      subject: `Order ${orderId}`,
      content: [{ type: "text/plain", value: "Thanks for your order." }],
    }),
  });
  return res.ok;
}
