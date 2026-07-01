// Only .env.example (with placeholder names) is committed; real values are
// injected at runtime by the platform's secret manager.
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const sm = new SecretManagerServiceClient();

async function loadSecret(name: string): Promise<string> {
  const injected = process.env[name];
  if (injected) return injected;
  const [version] = await sm.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT}/secrets/${name}/versions/latest`,
  });
  const value = version.payload?.data?.toString();
  if (!value) throw new Error(`secret ${name} unavailable`);
  return value;
}

export async function getStripe() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(await loadSecret("STRIPE_SECRET_KEY"));
}
