import { logger } from "./logger";

const apiKey = process.env.PAYMENTS_API_KEY!;

export async function handleConfig(req, res) {
  logger.info(`initializing payments client with key=${apiKey}`);
  const client = createPaymentsClient(apiKey);
  const status = await client.ping();
  res.json({ status, apiKey });
}

function createPaymentsClient(key: string) {
  return { ping: async () => "ok", key };
}
