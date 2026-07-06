// Repo-source adapter: reads a target repo from a local path and, per checkpoint,
// selects the most relevant source files to hand the verifier. Zero dependencies.
//
// This is the seam that lets Forespec grade a WHOLE real repo (not a single
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
  // Deterministic order: readdirSync order is filesystem-dependent, so a selection
  // tie (equal keyword score) could pick a different slice on a different machine.
  // Sort by path so it's "same repo, same slice, every time" — the field-noted
  // coverage-variance guard that caused a false regression in early dogfooding.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
  "ai.prompt_injection": ["prompt", "system", "systemprompt", "messages", "role", "completion", "chat.completions", "openai", "anthropic", "gemini", "llm", "gpt", "claude", "instruction", "inject", "rag", "retriev", "context", "embedding"],
  "ai.output_handling": ["completion", "response", "message.content", "choices", "assistant", "output", "innerhtml", "dangerouslysetinnerhtml", "marked", "markdown", "render", "dompurify", "sanitize", "eval", "exec", "openai", "anthropic", "llm"],
  "ai.tool_use_safety": ["tool", "tools", "toolcall", "tool_call", "function_call", "functioncall", "functions", "agent", "invoke", "arguments", "parameters", "action", "execute", "openai", "anthropic"],
  "ai.cost_controls": ["max_tokens", "maxtokens", "ratelimit", "throttle", "token", "budget", "quota", "iteration", "maxsteps", "max_steps", "loop", "timeout", "usage", "openai", "anthropic", "llm"],
  "ai.data_boundary": ["prompt", "log", "logger", "pii", "redact", "context", "history", "conversation", "messages", "embedding", "openai", "anthropic", "provider", "retention"],
  "baas.rls_enforced": ["rls", "policy", "create policy", "auth.uid", "row level security", "enable row level", "with check", "using", "supabase", "alter table", "firestore.rules", "allow read"],
  "baas.client_trust_boundary": ["supabase", "createclient", "anon", "rpc", "security definer", "edge function", "firestore", "firebase", "policy", "rls", ".from(", ".insert", ".update"],
  "baas.privileged_key_exposure": ["service_role", "servicerole", "service role", "supabase_service", "next_public", "vite_", "supabase", "createclient", "serviceaccount", "firebase-admin", "credential", "admin"],
  "security.injection": ["injection", "sql", "query", "select", "sequelize", "raw", "concat", "exec", "eval", "innerhtml", "dangerouslysetinnerhtml", "sanitize", "escape", "xss"],
  "security.secrets_management": ["secret", "apikey", "api_key", "privatekey", "private_key", "credential", "token", "password", "process.env", "dotenv", "key"],
  "auth.credential_storage": ["password", "hash", "bcrypt", "argon", "scrypt", "pbkdf2", "md5", "sha1", "sha256", "salt", "credential", "insecurity"],
  "security.transport_headers": ["cors", "helmet", "header", "csp", "hsts", "content-security-policy", "x-frame", "referrer", "origin", "https"],
  "security.file_upload": ["upload", "multer", "multipart", "filename", "mimetype", "attachment", "busboy", "formidable", "file"],
  "data.pii_protection": ["pii", "personal", "gdpr", "ccpa", "erasure", "export", "retention", "consent", "email", "address", "phone"],
  "reliability.error_handling": ["error", "catch", "exception", "throw", "reject", "stack", "trace", "handler", "try"],
  "data.query_performance": ["findall", "pagination", "paginate", "limit", "offset", "include", "eager", "index", "query", "loop"],
};

export function keywordsFor(cp) {
  const curated = KEYWORDS[cp.id] ?? [];
  // Curated keywords are authored to be both sufficient AND discriminating. When they
  // exist, don't dilute them with generic tokens split from the id ("security", "data",
  // "auth", "payment") — those match unrelated files (a securityQuestions.ts decoy, a
  // config monolith) and can out-rank the real target, the exact false-green-by-selection
  // risk the selection-recall harness guards. The id-token split is the FALLBACK, used
  // only for checkpoints that have no curated set.
  if (curated.length) return curated;
  return cp.id.split(/[.\-_]/).filter((t) => t.length > 2).map((t) => t.toLowerCase());
}

export function scoreFile(file, keywords) {
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
export function selectForCheckpoint(all, cp, budgetChars = 60_000, perFileCap = 24_000) {
  const keywords = keywordsFor(cp);
  const ranked = all
    .map((f) => ({ f, score: scoreFile(f, keywords) }))
    .filter((r) => r.score > 0)
    // Score desc, then path asc as a stable tie-break so equal-scoring files pick
    // the same slice regardless of input order (determinism, not caller-dependent).
    .sort((a, b) => b.score - a.score || (a.f.path < b.f.path ? -1 : a.f.path > b.f.path ? 1 : 0))
    .map((r) => r.f);

  const ordered = ranked.length > 0
    ? ranked
    : [...all].sort((a, b) => a.content.length - b.content.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Cap any single file's contribution so one huge file (e.g. a monolithic server.ts)
  // can't eat the whole budget and starve out a higher-ranked-but-large vulnerable file.
  // Real finding from the Juice Shop pre-run: lib/insecurity.ts (hardcoded keys) ranked #4
  // for secrets but was budget-cut by a large server.ts → false-green risk.
  const clip = (c) => (c.length > perFileCap ? c.slice(0, perFileCap) + "\n// …(truncated for budget)…\n" : c);

  const chosen = [];
  let used = 0;
  for (const f of ordered) {
    const content = clip(f.content);
    if (used + content.length > budgetChars && chosen.length > 0) continue;
    chosen.push({ ...f, content });
    used += content.length;
    if (used >= budgetChars) break;
  }

  const code = chosen.map((f) => `// FILE: ${f.path}\n${f.content}`).join("\n\n");
  // `matched` = at least one file scored on this checkpoint's keywords. When false,
  // the chosen files are the smallest-file fallback (nothing relevant found), so the
  // repo verifier marks the checkpoint N/A instead of grading irrelevant noise.
  return { files: chosen, code, matched: ranked.length > 0 };
}
