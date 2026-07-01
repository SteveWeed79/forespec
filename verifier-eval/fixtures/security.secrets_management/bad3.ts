import { Pool } from "pg";
import Stripe from "stripe";

export const config = {
  apiKey: "sk_live_51MvT8xJ2kQ0aWpZ7dRnBcVe4fLg6hYs8tUx",
  dbPassword: "Pr0d-Db-P@ssw0rd-2024",
  dbUrl: "postgres://app:Pr0d-Db-P@ssw0rd-2024@db.internal:5432/shop",
};

export const stripe = new Stripe(config.apiKey);

export const pool = new Pool({ connectionString: config.dbUrl });
