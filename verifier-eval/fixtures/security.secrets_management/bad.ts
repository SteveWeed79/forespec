import { fetch } from "undici";

const SENDGRID_API_KEY =
  "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";

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
