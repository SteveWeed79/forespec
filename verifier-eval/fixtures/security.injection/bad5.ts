import { db } from "./db";

// BAD: raw SQL built by string concatenation with unsanitized user input.
// `q = "'; DROP TABLE products; --"` (or a UNION) executes against the DB.
export async function searchProducts(req, res) {
  const q = req.query.q;
  const rows = await db.raw(
    "SELECT * FROM products WHERE name LIKE '%" + q + "%'",
  );
  res.json(rows);
}
