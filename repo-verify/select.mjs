// Repo-source adapter: reads a target repo from a local path and, per checkpoint,
// selects the most relevant source files to hand the verifier. Zero dependencies.
//
// This is the seam that lets Foresight grade a WHOLE real repo (not a single
// labeled fixture): for each checkpoint it keyword-ranks the repo's files and
// packs the most relevant ones into a `code` string within a character budget,
// which is exactly the shape the verifier-eval adapters already consume.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rb", ".php", ".java", ".kt", ".cs", ".rs",
  ".sql", ".prisma", ".graphql", ".gql",
  ".html", ".css", ".scss", ".vue", ".svelte",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out",
  "coverage", "vendor", ".venv", "__pycache__", ".turbo", "target",
]);

const MAX_FILE_BYTES = 64 * 1024;

/** Walk a repo once and return all candidate source files (repo-relative paths). */
export function loadRepo(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile() && CODE_EXT.has(extname(entry.name))) {
        const full = join(dir, entry.name);
        let size = 0;
        try {
          size = statSync(full).size;
        } catch {
          continue;
        }
        if (size === 0 || size > MAX_FILE_BYTES) continue;
        let content;
        try {
          content = readFileSync(full, "utf8");
        } catch {
          continue;
        }
        files.push({ path: relative(root, full).split("\\").join("/"), content });
      }
    }
  };
  walk(root);
  return files;
}

// Curated relevance keywords per checkpoint id (the merged, namespaced ids). These
// only steer file SELECTION — the verifier does the judging. Unknown checkpoints
// fall back to tokens from their own id.
const KEYWORDS = {
  "ecommerce.checkout.atomic_stock_hold": ["stock", "inventory", "reserv", "hold", "checkout", "payment", "intent", "quantity", "decrement", "transaction", "lock"],
  "payment.idempotency": ["idempoten", "payment", "webhook", "intent", "stripe", "charge", "retry", "event"],
  "payment.state_integrity": ["order", "status", "paid", "webhook", "payment", "reconcil", "fulfil", "state"],
  "payment.card_data_handling": ["card", "pan", "cvv", "stripe", "token", "paymentmethod", "hosted", "vault", "pci", "secret"],
  "payment.webhook_authenticity": ["webhook", "signature", "constructevent", "rawbody", "verify", "stripe"],
  "payment.refund_integrity": ["refund", "chargeback", "credit", "reverse", "dispute"],
  "auth.access_control": ["auth", "owner", "user", "order", "address", "findunique", "findone", "findfirst", "where", "session", "forbidden"],
  "auth.session_security": ["session", "cookie", "token", "jwt", "httponly", "samesite", "expires", "randombytes"],
  "data.money_precision": ["price", "money", "amount", "total", "tax", "cents", "decimal", "currency", "float"],
  "ecommerce.catalog.variant_model": ["product", "variant", "sku", "price", "stock", "orderline", "lineitem", "order"],
  "ecommerce.inventory.reconciliation": ["stock", "inventory", "movement", "ledger", "refund", "restock", "adjust"],
  "ecommerce.checkout.cost_correctness": ["total", "tax", "shipping", "subtotal", "calculate", "compute", "price", "amount", "charge"],
  "security.abuse_controls": ["ratelimit", "throttle", "captcha", "abuse", "bruteforce", "lockout", "attempts"],
  "web.performance": ["lazy", "defer", "preload", "image", "bundle", "cache", "<img", "script"],
  "web.seo_metadata": ["meta", "og:", "title", "description", "canonical", "sitemap", "robots", "<main", "<head"],
  "web.forms_integrity": ["form", "validate", "safeparse", "zod", "sanitize", "csrf", "ratelimit"],
  "design.type_scale": ["font", "type", "scale", "rem", "line-height", "heading", "theme", "token"],
  "design.contrast_a11y": ["color", "contrast", "aria", "alt", "label", "focus", "a11y", "wcag"],
  "design.visual_hierarchy": ["cta", "button", "heading", "hero", "primary", "weight", "size"],
  "design.system_consistency": ["theme", "token", "color", "spacing", "tailwind", "variable", "palette"],
  "design.spacing_system": ["spacing", "margin", "padding", "gap", "token", "scale"],
  "design.responsive": ["responsive", "breakpoint", "media", "viewport", "mobile", "min-width", "max-width"],
  "ecommerce.design.trust_signals": ["checkout", "total", "shipping", "tax", "secure", "error", "loading", "refund"],
  "saas.tenancy.isolation": ["tenant", "org", "workspace", "account", "scope", "where"],
  "saas.subscription.entitlement_integrity": ["subscription", "plan", "entitlement", "feature", "seat", "active"],
  "saas.subscription.lifecycle": ["subscription", "cancel", "renew", "trial", "period", "payment_failed", "downgrade"],
};

export function keywordsFor(cp) {
  const curated = KEYWORDS[cp.id] ?? [];
  const fromId = cp.id.split(/[.\-_]/).filter((t) => t.length > 2).map((t) => t.toLowerCase());
  return Array.from(new Set([...curated, ...fromId]));
}

function scoreFile(file, keywords) {
  const pathLower = file.path.toLowerCase();
  const bodyLower = file.content.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (pathLower.includes(kw)) score += 5;
    const matches = bodyLower.split(kw).length - 1;
    score += Math.min(matches, 10);
  }
  return score;
}

/**
 * Pick the files most relevant to a checkpoint, bounded by a character budget,
 * and pack them into a `code` string (with `// FILE:` headers) for the adapter.
 * If nothing scores, falls back to the smallest files so `code` is never empty.
 */
export function selectForCheckpoint(all, cp, budgetChars = 60_000) {
  const keywords = keywordsFor(cp);
  const ranked = all
    .map((f) => ({ f, score: scoreFile(f, keywords) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.f);

  const ordered = ranked.length > 0
    ? ranked
    : [...all].sort((a, b) => a.content.length - b.content.length);

  const chosen = [];
  let used = 0;
  for (const f of ordered) {
    if (used + f.content.length > budgetChars && chosen.length > 0) continue;
    chosen.push(f);
    used += f.content.length;
    if (used >= budgetChars) break;
  }

  const code = chosen.map((f) => `// FILE: ${f.path}\n${f.content}`).join("\n\n");
  return { files: chosen, code };
}
