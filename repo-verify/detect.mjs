#!/usr/bin/env node
// foresight detect — inspect a repo and propose which archetype fits.
//
// Why this exists: until now you had to KNOW to pass `--archetype archetype.ecommerce.json`.
// That's the onboarding wall — step one already assumes you understand the tool. This
// reads cheap, honest signals (declared dependencies, file paths, schema model names)
// and proposes the archetype with the evidence behind it, so the first command someone
// runs just works.
//
// Zero deps. Scoring is a PURE function over a collected `signals` object, separate from
// the filesystem I/O — so it's exhaustively testable without a repo on disk.
//
//   node repo-verify/detect.mjs [repo]        # human-readable ranking + recommendation
//   node repo-verify/detect.mjs [repo] --json # machine-readable (consumed by `init`)

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepo } from "./select.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Signal vocabulary per archetype, keyed to the manifest's `archetype` name so adding a
// new archetype manifest + a RULES entry is all it takes. deps are matched as substrings
// (so "stripe" catches "@stripe/stripe-js"); paths and models likewise.
export const RULES = {
  // Keywords are matched as whole TOKENS (with simple plurals), never raw substrings —
  // so "product" no longer matches "production", "cart" no longer matches "cartesian",
  // and "member" no longer matches "remember". Keep them DISCRIMINATING: a keyword that
  // appears in every site (about, contact, content, project) is noise, not signal.
  ecommerce: {
    deps: ["stripe", "braintree", "square", "paypal", "snipcart", "medusa", "commercejs", "swell", "shopify", "vendure", "saleor", "bagisto", "spree"],
    paths: ["checkout", "cart", "order", "product", "catalog", "inventory", "storefront", "sku"],
    models: ["order", "product", "cart", "lineitem", "orderitem", "payment", "inventory", "sku", "variant"],
  },
  saas: {
    deps: ["clerk", "workos", "auth0", "lemonsqueezy", "paddle", "stripe"],
    paths: ["tenant", "organization", "workspace", "subscription", "billing", "plan", "seat", "entitlement", "membership"],
    models: ["subscription", "tenant", "organization", "plan", "seat", "membership", "workspace", "entitlement", "invoice"],
  },
  portfolio: {
    deps: ["astro", "gatsby", "eleventy", "contentlayer", "gray-matter", "next-mdx-remote", "contentful", "sanity", "tinacms", "hexo", "jekyll"],
    paths: ["blog", "post", "portfolio", "essay", "writing", "gallery", "article", "author"],
    models: [],
  },
};

// Deps that imply a real backend / stored state — portfolio is "little or no backend",
// so their presence argues against it (and their absence argues for it).
const BACKEND_DEPS = ["prisma", "drizzle", "mongoose", "typeorm", "sequelize", "knex", "kysely", "pg", "mysql", "mysql2", "sqlite", "mongodb", "planetscale", "supabase", "firebase-admin"];
const PAYMENT_DEPS = ["stripe", "braintree", "square", "paypal", "paddle", "lemonsqueezy", "snipcart", "medusa"];

const SCORE = { dep: 4, path: 3, model: 3, noBackend: 4 };

// Dependency manifests for other ecosystems — so a Python/Ruby/Go/PHP shop isn't invisible
// just because it has no package.json. We scan their raw text for dep keywords.
const EXTRA_MANIFESTS = ["requirements.txt", "pyproject.toml", "Pipfile", "Gemfile", "go.mod", "go.sum", "composer.json", "pom.xml", "build.gradle"];

// Split into whole tokens, breaking on non-alphanumerics AND camelCase, lowercased.
export function tokenize(str) {
  return String(str).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function tokenSet(list) {
  const s = new Set();
  for (const item of list ?? []) for (const t of tokenize(item)) s.add(t);
  return s;
}
// Token match with naive plurals — "orders" matches "order", but "border" (token "border") does not.
function hasTok(set, kw) {
  return set.has(kw) || set.has(kw + "s") || set.has(kw + "es");
}

/** I/O: gather cheap signals from a repo on disk. Pass `files` to reuse a prior walk. */
export function collectSignals(repoRoot, { files } = {}) {
  const deps = new Set();
  let depText = "";
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      for (const k of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
        deps.add(k.toLowerCase());
      }
    } catch { /* malformed package.json — just skip it */ }
  }
  for (const m of EXTRA_MANIFESTS) {
    const p = join(repoRoot, m);
    if (existsSync(p)) { try { depText += "\n" + readFileSync(p, "utf8").toLowerCase(); } catch { /* skip */ } }
  }

  const repoFiles = files ?? loadRepo(repoRoot);
  const paths = repoFiles.map((f) => f.path.toLowerCase());
  const schemaModels = [];
  const add = (m) => { if (m) schemaModels.push(m.toLowerCase()); };
  for (const f of repoFiles) {
    const c = f.content;
    if (f.path.endsWith(".prisma")) {
      for (const m of c.matchAll(/\bmodel\s+(\w+)/g)) add(m[1]);
    } else if (f.path.endsWith(".sql")) {
      for (const m of c.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`']?(\w+)/gi)) add(m[1]);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f.path)) {
      for (const m of c.matchAll(/\b(?:pg|mysql|sqlite)Table\s*\(\s*["'`](\w+)/g)) add(m[1]);      // drizzle
      for (const m of c.matchAll(/\bmodel\s*(?:<[^>]+>)?\s*\(\s*["'`](\w+)/g)) add(m[1]);           // mongoose model("Name"
      for (const m of c.matchAll(/@Entity\([^)]*\)\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g)) add(m[1]); // typeorm
      for (const m of c.matchAll(/\.define\s*\(\s*["'`](\w+)/g)) add(m[1]);                          // sequelize
    }
  }
  return { deps: [...deps], paths, schemaModels, depText };
}

/**
 * PURE: score each available archetype against collected signals. Returns a ranked list
 * with the matched signals (the "why") and a confidence read on the top pick.
 */
export function scoreArchetypes(signals, available = Object.keys(RULES)) {
  const depNames = signals.deps ?? [];
  // dep names are specific enough for substring; also scan other-ecosystem manifest text.
  const depText = (signals.depText ?? "") + " " + depNames.join(" ");
  const pathTokens = tokenSet(signals.paths);
  const modelTokens = tokenSet(signals.schemaModels);
  const hasDep = (kw) => depNames.some((d) => d.includes(kw)) || depText.includes(kw);
  const pathHit = (kw) => hasTok(pathTokens, kw);
  const modelHit = (kw) => hasTok(modelTokens, kw);
  const hasBackend = BACKEND_DEPS.some(hasDep) || (signals.schemaModels?.length > 0);
  const hasPayment = PAYMENT_DEPS.some(hasDep) || pathHit("payment") || pathHit("checkout");

  const scored = [];
  for (const name of available) {
    const rule = RULES[name];
    if (!rule) continue;
    const matched = [];
    let score = 0;
    for (const d of rule.deps) if (hasDep(d)) { score += SCORE.dep; matched.push(`dep:${d}`); }
    for (const p of rule.paths) if (pathHit(p)) { score += SCORE.path; matched.push(`path:${p}`); }
    for (const m of rule.models) if (modelHit(m)) { score += SCORE.model; matched.push(`model:${m}`); }
    if (name === "portfolio") {
      // The no-backend bonus is a bonus ON TOP of a real portfolio signal, never a
      // standalone reason to guess portfolio — otherwise every backendless app (a
      // dashboard, a landing page) gets mislabeled. No positive signal ⇒ no guess.
      const hasPositive = matched.length > 0;
      if (hasPositive && !hasBackend) { score += SCORE.noBackend; matched.push("signal:no-backend"); }
      if (hasBackend) { score -= 3; matched.push("penalty:backend-present"); }
      if (hasPayment) { score -= 6; matched.push("penalty:payment-present"); }
    }
    scored.push({ archetype: name, score: Math.max(0, score), matched });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) s.confidence = "—";
  const [top, runner] = scored;
  if (top) {
    const margin = top.score - (runner?.score ?? 0);
    if (top.score === 0) top.confidence = "none";
    else if (top.score >= 9 && margin >= 4) top.confidence = "high";
    else if (top.score >= 5 && margin >= 2) top.confidence = "medium";
    else top.confidence = "low";
  }
  return scored;
}

/** Discover base archetype manifests in a project dir (excludes the *.design.json layer). */
export function discoverManifests(projectDir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(projectDir); } catch { return out; }
  for (const f of entries) {
    if (!/^archetype\..+\.json$/.test(f) || f.endsWith(".design.json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(projectDir, f), "utf8"));
      if (j.archetype) out.push({ file: f, archetype: j.archetype, applies_when: j.applies_when ?? "" });
    } catch { /* skip malformed manifest */ }
  }
  return out;
}

/** Orchestrate: collect signals from repoRoot, score against manifests found in projectDir. */
export function detect({ repoRoot, projectDir = here && join(here, "..") }) {
  const manifests = discoverManifests(projectDir);
  const byName = new Map(manifests.map((m) => [m.archetype, m]));
  const signals = collectSignals(repoRoot);
  const scored = scoreArchetypes(signals, manifests.map((m) => m.archetype));
  const ranked = scored.map((s) => ({
    ...s,
    manifest: byName.get(s.archetype)?.file ?? null,
    applies_when: byName.get(s.archetype)?.applies_when ?? "",
  }));
  return { signals, ranked, manifests };
}

// ---------------- CLI ----------------

const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

function main() {
  if (has("-h") || has("--help")) {
    console.log(`foresight detect — propose which archetype fits a repo.

Usage:
  node repo-verify/detect.mjs [repo]   (default: .)
  node repo-verify/detect.mjs [repo] --json

It reads declared dependencies, file paths, and schema model names — never your code's
content — and ranks the archetypes it can see, with the evidence behind each.`);
    return 0;
  }
  const positional = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const repoRoot = pathResolve(process.cwd(), positional ?? ".");
  const projectDir = pathResolve(here, "..");
  const { ranked, signals } = detect({ repoRoot, projectDir });

  if (has("--json")) {
    console.log(JSON.stringify({ repo: repoRoot, ranked, signals }, null, 2));
    return 0;
  }

  if (ranked.length === 0) {
    console.log("No archetype manifests found to match against.");
    return 1;
  }

  console.log(`\n🔭 Foresight archetype detection — ${repoRoot}\n`);
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const mark = i === 0 ? "→" : " ";
    const conf = i === 0 ? `  (${r.confidence})` : "";
    console.log(`${mark} ${r.archetype.padEnd(11)} score ${String(r.score).padStart(2)}${conf}`);
    if (r.matched.length) console.log(`    why: ${r.matched.join(", ")}`);
  }
  const top = ranked[0];
  console.log("");
  if (top.score === 0 || top.confidence === "none") {
    console.log("Couldn't detect a clear fit — no strong signals. Pick one explicitly:");
    for (const r of ranked) console.log(`  --archetype ${r.manifest}   (${r.applies_when})`);
  } else {
    if (top.confidence === "low") console.log("Low confidence — sanity-check before trusting it.");
    console.log(`Recommended: ${top.archetype}  (${top.applies_when})`);
    console.log(`  node repo-verify/verify.mjs ${repoRoot} --archetype ${top.manifest}`);
  }
  return 0;
}

if (process.argv[1] && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
