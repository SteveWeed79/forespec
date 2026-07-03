// Monolithic app server — many routes and all the config in one large file. This is the
// budget-eater: it references process.env keys and tokens repeatedly, so it competes with
// lib/insecurity.ts for the secrets checkpoint, and its size can starve smaller relevant
// files if perFileCap doesn't clip it. Selection must still surface insecurity.ts.
import express from "express";

const app = express();

const config = {
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  apiKey: process.env.API_KEY,
  sessionKey: process.env.SESSION_KEY,
  stripeKey: process.env.STRIPE_SECRET_KEY,
  redisUrl: process.env.REDIS_URL,
  smtpToken: process.env.SMTP_TOKEN,
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
  sentryDsn: process.env.SENTRY_DSN,
  webhookSecret: process.env.WEBHOOK_SECRET,
};

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/products", async (_req, res) => res.json(await listProducts()));
app.get("/api/products/:id", async (req, res) => res.json(await getProduct(req.params.id)));
app.post("/api/products", async (req, res) => res.json(await createProduct(req.body)));
app.put("/api/products/:id", async (req, res) => res.json(await updateProduct(req.params.id, req.body)));
app.delete("/api/products/:id", async (req, res) => res.json(await deleteProduct(req.params.id)));
app.get("/api/categories", async (_req, res) => res.json(await listCategories()));
app.get("/api/orders", async (_req, res) => res.json(await listOrders()));
app.get("/api/orders/:id", async (req, res) => res.json(await getOrder(req.params.id)));
app.post("/api/orders", async (req, res) => res.json(await createOrder(req.body)));
app.get("/api/users", async (_req, res) => res.json(await listUsers()));
app.get("/api/users/:id", async (req, res) => res.json(await getUser(req.params.id)));
app.post("/api/users", async (req, res) => res.json(await createUser(req.body)));
app.get("/api/cart", async (_req, res) => res.json(await getCart(req)));
app.post("/api/cart/items", async (req, res) => res.json(await addToCart(req.body)));
app.delete("/api/cart/items/:id", async (req, res) => res.json(await removeFromCart(req.params.id)));
app.get("/api/wishlist", async (_req, res) => res.json(await getWishlist(req)));
app.post("/api/reviews", async (req, res) => res.json(await createReview(req.body)));
app.get("/api/reviews/:productId", async (req, res) => res.json(await listReviews(req.params.productId)));
app.get("/api/shipping/rates", async (_req, res) => res.json(await shippingRates(req)));
app.post("/api/coupons/apply", async (req, res) => res.json(await applyCoupon(req.body)));
app.get("/api/search", async (req, res) => res.json(await search(req.query.q)));
app.get("/api/recommendations", async (_req, res) => res.json(await recommend(req)));
app.post("/api/newsletter", async (req, res) => res.json(await subscribe(req.body)));
app.get("/api/pages/:slug", async (req, res) => res.json(await getPage(req.params.slug)));
app.get("/api/settings", async (_req, res) => res.json(config));
app.post("/api/contact", async (req, res) => res.json(await contact(req.body)));
app.get("/api/analytics/summary", async (_req, res) => res.json(await analyticsSummary()));
app.get("/api/inventory/status", async (_req, res) => res.json(await inventoryStatus()));
app.get("/api/reports/sales", async (_req, res) => res.json(await salesReport()));

app.listen(config.port, () => console.log(`listening on ${config.port}`));
