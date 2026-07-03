#!/usr/bin/env node
// Self-test for the repo verifier — proves the pipeline end to end with the mock
// adapter (no API key): resolve a manifest from the library, select files from a
// real (vulnerable) repo per checkpoint, grade, and roll up.
//
//   1. Pipeline proof: every backbone checkpoint on the vulnerable fixture grades
//      to level 3 (hole present) → not shippable.
//   2. Discrimination proof: the mock adapter returns 6 when a good signal is
//      present, so a "3 everywhere" result reflects the code, not a dead pipeline.
//   3. Calibration store: a run is logged with the pattern/instance wall enforced,
//      and feedback records an outcome joined to the prediction by fingerprint.
//
// Run: node repo-verify/self-test.mjs   (or: npm run verify:self)

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rmSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolveArchetype } from "../library/resolve.mjs";
import * as mock from "../verifier-eval/adapters/mock.mjs";
import { loadRepo, selectForCheckpoint, scoreFile } from "./select.mjs";
import { measureRecall } from "./selection-eval.mjs";
import { fingerprint, recordPredictions, latestPrediction, recordOutcome, readOverrides, writeOverrides, FILES } from "./store.mjs";
import { aggregate, propose } from "./calibrate.mjs";
import { scoreArchetypes, collectSignals, discoverManifests, isAmbiguous, classifyWithAI } from "./detect.mjs";
import { readConfig, writeConfig, resolveManifestPath, CONFIG_FILE } from "./config.mjs";
import { relevanceScore, selectForFeature, renderPlan } from "./plan.mjs";
import { contrastRatio, parseColor, isLargeText, compositeToLevel, scoreContrast, scoreTypeScale, scoreResponsive, scoreSpacing } from "./design-metrics.mjs";
import { estimateFromRecords, bandFor, verbosityFor } from "./proficiency.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const archetypePath = join(here, "..", "archetype.ecommerce.json");
const fixture = join(here, "fixtures", "vulnerable-checkout");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const archetype = resolveArchetype(archetypePath);
const backbone = archetype.checkpoints.filter((c) => c.domain === "backbone");
const files = loadRepo(fixture);

console.log(`1. Pipeline proof (vulnerable-checkout, ${backbone.length} backbone checkpoints, mock adapter):`);
check("repo loaded source files", files.length > 0, `got ${files.length}`);

const results = [];
for (const cp of backbone) {
  const { files: selected, code } = selectForCheckpoint(files, cp);
  check(`${cp.id}: selected relevant files`, selected.length > 0);
  const v = await mock.verify({ checkpoint: cp, code });
  results.push({ id: cp.id, severity: cp.severity, level: v.level });
  check(`${cp.id}: flagged level 3 (hole present)`, v.level === 3, `got ${v.level}`);
}

const critical = results.filter((r) => r.severity === "critical");
const shippable = critical.every((r) => r.level >= 6);
check("verdict: NOT shippable", shippable === false);

console.log("\n2. Discrimination proof (good signal present → level 6):");
const cases = [
  { id: "payment.idempotency", code: "stripe.paymentIntents.create({ amount }, { idempotencyKey: orderId });" },
  { id: "auth.access_control", code: "const order = await db.order.findOne({ where: { id, userId: req.user.id } });" },
];
for (const tc of cases) {
  const cp = archetype.checkpoints.find((c) => c.id === tc.id);
  const v = await mock.verify({ checkpoint: cp, code: tc.code });
  check(`${tc.id} → level 6 when signal present`, v.level === 6, `got ${v.level}`);
}

console.log("\n3. Calibration store — pattern/instance wall (bricks 1–2):");
const store = mkdtempSync(join(tmpdir(), "foresight-store-"));
try {
  const fakeResults = [{
    id: "payment.idempotency", domain: "backbone", severity: "critical",
    level: 3, confidence: 0.9,
    gap: "add idempotencyKey in src/checkout/actions.ts",        // names a file → instance-only
    rationale: "no idempotency key on session create in actions.ts",
    evidence: ["src/checkout/actions.ts"],
    adapter: "mock", fingerprint: fingerprint("some graded code slice"),
  }];
  const { count } = recordPredictions({
    storeDir: store, runId: "run_selftest", archetype: "ecommerce", archetypeVersion: "2.0.0",
    project: "selftest-project", results: fakeResults,
  });
  check("recorded the prediction", count === 1);

  const patLine = readFileSync(join(store, FILES.predPattern), "utf8").trim();
  const instLine = readFileSync(join(store, FILES.predInstance), "utf8").trim();
  const pat = JSON.parse(patLine), inst = JSON.parse(instLine);

  // THE WALL: the shareable pattern record carries ids/numbers/fingerprint only.
  check("pattern record has checkpoint_id + level + fingerprint", !!pat.checkpoint_id && pat.level === 3 && !!pat.fingerprint);
  check("pattern record has NO gap/rationale/evidence", !("gap" in pat) && !("rationale" in pat) && !("evidence" in pat));
  check("pattern record leaks no file path / project name", !patLine.includes("actions.ts") && !patLine.includes("selftest-project"));
  check("instance record keeps the code-specific detail", !!inst.gap && inst.evidence.length === 1);
  check("instance fingerprint == pattern fingerprint (join key)", inst.fingerprint === pat.fingerprint);

  // Brick 2: feedback writes an outcome joined to the prediction by fingerprint.
  const pred = latestPrediction({ storeDir: store, checkpointId: "payment.idempotency" });
  check("latestPrediction finds the prediction", !!pred && pred.fingerprint === pat.fingerprint);
  recordOutcome({ storeDir: store, prediction: pred, outcome: "over-severe", source: "self_observed", note: "real but contained in actions.ts", project: "selftest-project" });
  const outPat = JSON.parse(readFileSync(join(store, FILES.outPattern), "utf8").trim());
  const outInst = JSON.parse(readFileSync(join(store, FILES.outInstance), "utf8").trim());
  check("outcome pattern: outcome + reliability tier, NO note", outPat.outcome === "over-severe" && outPat.reliability === "high" && !("note" in outPat));
  check("outcome instance keeps the note", !!outInst.note && outInst.note.includes("actions.ts"));
  check("outcome joined to prediction by fingerprint", outPat.fingerprint === pat.fingerprint);
} finally {
  rmSync(store, { recursive: true, force: true });
}

console.log("\n4. Calibration — propose & accept a delta (brick 3):");
const store4 = mkdtempSync(join(tmpdir(), "foresight-cal-"));
try {
  recordPredictions({
    storeDir: store4, runId: "run_cal", archetype: "ecommerce", archetypeVersion: "2.0.0",
    project: "p", results: [{
      id: "data.money_precision", domain: "backbone", severity: "critical",
      level: 3, confidence: 0.9, gap: "floats in money math", rationale: "...",
      evidence: ["lib/money.ts"], adapter: "mock", fingerprint: fingerprint("money code"),
    }],
  });
  const pred = latestPrediction({ storeDir: store4, checkpointId: "data.money_precision" });
  for (let i = 0; i < 3; i++) {
    recordOutcome({ storeDir: store4, prediction: pred, outcome: "over-severe", source: "self_observed", note: `n${i}`, project: "p" });
  }
  const mp = propose(aggregate({ storeDir: store4 }), 3).find((p) => p.checkpoint === "data.money_precision");
  check("proposes lowering severity after 3 over-severe", !!mp && mp.action === "lower-severity" && mp.from === "critical" && mp.to === "high", `got ${mp && mp.action}/${mp && mp.to}`);

  const ov = readOverrides({ storeDir: store4 });
  ov.severity["data.money_precision"] = "high";
  writeOverrides({ storeDir: store4, overrides: ov });
  check("accepted override persists", readOverrides({ storeDir: store4 }).severity["data.money_precision"] === "high");

  const cp = { id: "data.money_precision", severity: "critical" };
  const applied = readOverrides({ storeDir: store4 }).severity[cp.id];
  if (applied) cp.severity = applied;
  check("applying the override lowers severity critical→high", cp.severity === "high");

  // thin evidence must NOT propose a change
  const store5 = mkdtempSync(join(tmpdir(), "foresight-thin-"));
  try {
    recordPredictions({ storeDir: store5, runId: "r", archetype: "ecommerce", archetypeVersion: "2.0.0", project: "p", results: [{ id: "auth.access_control", domain: "backbone", severity: "critical", level: 3, confidence: 0.9, gap: "x", rationale: "y", evidence: ["a.ts"], adapter: "mock", fingerprint: fingerprint("a") }] });
    const p2 = latestPrediction({ storeDir: store5, checkpointId: "auth.access_control" });
    recordOutcome({ storeDir: store5, prediction: p2, outcome: "false-positive", source: "self_observed", project: "p" });
    const thin = propose(aggregate({ storeDir: store5 }), 3).find((p) => p.checkpoint === "auth.access_control");
    check("does NOT propose on thin evidence (n < min)", !!thin && thin.action === "watch", `got ${thin && thin.action}`);
  } finally { rmSync(store5, { recursive: true, force: true }); }
} finally {
  rmSync(store4, { recursive: true, force: true });
}

console.log("\n5. Archetype detection (onboarding — brick A):");
// Pure scorer: synthetic signals must rank the obvious archetype on top.
const ecom = scoreArchetypes({ deps: ["@stripe/stripe-js"], paths: ["app/checkout/page.tsx", "lib/cart.ts"], schemaModels: ["order", "product"] });
check("ecommerce signals → ecommerce on top", ecom[0].archetype === "ecommerce", `got ${ecom[0].archetype}`);
const saas = scoreArchetypes({ deps: ["@clerk/nextjs"], paths: ["app/billing/page.tsx", "lib/tenant.ts"], schemaModels: ["subscription", "tenant", "plan"] });
check("saas signals → saas on top", saas[0].archetype === "saas", `got ${saas[0].archetype}`);
const port = scoreArchetypes({ deps: ["astro", "gray-matter"], paths: ["src/content/blog/post.md", "src/pages/about.astro"], schemaModels: [] });
check("portfolio signals (no backend) → portfolio on top", port[0].archetype === "portfolio", `got ${port[0].archetype}`);
check("portfolio penalized when a backend/payment is present", port[0].archetype === "portfolio" && ecom.find((r) => r.archetype === "portfolio").score === 0);

// Regression: token matching must kill substring false positives that fooled the v1 heuristic.
const dash = scoreArchetypes({ deps: ["react", "vite", "postcss", "recharts"], paths: ["src/config/production.ts", "src/utils/cartesian.ts", "src/lib/remember-me.ts"], schemaModels: [] });
check("generic app → no archetype guessed (not confidently ecommerce)", dash[0].score === 0 && dash[0].confidence === "none", `got ${dash[0].archetype}/${dash[0].score}`);
check("'production' does not match 'product'", scoreArchetypes({ deps: [], paths: ["config/production.ts"], schemaModels: [] }).find((r) => r.archetype === "ecommerce").score === 0);
check("'remember' does not match 'member'", scoreArchetypes({ deps: [], paths: ["lib/remember-me.ts"], schemaModels: [] }).find((r) => r.archetype === "saas").score === 0);
// Broadened coverage: a non-JS shop (Django + Stripe in requirements.txt) is still detected via depText.
const py = scoreArchetypes({ deps: [], depText: "django==4.2\nstripe==7.0\n", paths: ["shop/models.py", "orders/views.py"], schemaModels: [] });
check("python shop detected via manifest text + paths", py[0].archetype === "ecommerce" && py[0].score > 0, `got ${py[0].archetype}`);
// A lone weak signal (one doc token) must abstain, not false-lean (RailsGoat lesson).
const loneDoc = scoreArchetypes({ deps: [], paths: [], schemaModels: [], selfDescription: "employees can view their checkout summary" });
check("a single doc-token does not suggest an archetype (abstains)", loneDoc[0].confidence === "none", `got ${loneDoc[0].confidence} (score ${loneDoc[0].score})`);
// AI-on-ambiguity fallback: fires only when unsure, degrades gracefully without a key.
check("isAmbiguous: confident result is NOT ambiguous", isAmbiguous(ecom) === false, `ecom top ${ecom[0].confidence}`);
check("isAmbiguous: an abstain (all-zero) IS ambiguous", isAmbiguous(dash) === true);
const aiNoKey = await classifyWithAI({ signals: { deps: [], paths: [], schemaModels: [] }, candidates: [{ archetype: "saas", applies_when: "x" }] });
check("classifyWithAI returns null without a key (never breaks the $0 path)", process.env.ANTHROPIC_API_KEY ? true : aiNoKey === null);
// Config-file fingerprint (#1): a domain-specific config is a strong, decisive signal.
const cfg = scoreArchetypes({ deps: [], paths: [], schemaModels: [], configHits: [{ archetype: "ecommerce", file: "medusa-config.ts" }] });
check("medusa-config.ts → ecommerce on top with a config signal", cfg[0].archetype === "ecommerce" && cfg[0].matched.some((m) => m.startsWith("config:")));
// .env.example var names (#2): discriminating integrations classify without any code.
const envSaas = scoreArchetypes({ deps: [], paths: [], schemaModels: [], envVars: ["tenant_id", "paddle_api_key", "workspace_slug"] });
check("env vars (tenant/paddle/workspace) → saas", envSaas[0].archetype === "saas" && envSaas[0].matched.some((m) => m.startsWith("env:")));
const envPort = scoreArchetypes({ deps: [], paths: [], schemaModels: [], envVars: ["sanity_project_id", "sanity_dataset"] });
check("env vars (sanity CMS) → portfolio", envPort[0].archetype === "portfolio");
// Self-description (CLAUDE.md etc): low-weight nudge, token-matched, never overrides.
const docOnly = scoreArchetypes({ deps: [], paths: [], schemaModels: [], selfDescription: "This is a multi-tenant SaaS with subscription billing per workspace." });
check("CLAUDE.md-style self-description nudges toward saas", docOnly[0].archetype === "saas" && docOnly[0].matched.some((m) => m.startsWith("doc:")));
check("doc signal stays low-weight (capped, can't beat a config)", scoreArchetypes({ deps: [], paths: [], schemaModels: [], configHits: [{ archetype: "ecommerce", file: "medusa-config.ts" }], selfDescription: "blog blog post writing gallery essay author portfolio" })[0].archetype === "ecommerce");

// ai-app: provider SDKs + LLM paths classify; a bolt-on AI feature must NOT flip a primary archetype.
const aiApp = scoreArchetypes({ deps: ["openai", "@pinecone-database/pinecone"], paths: ["app/api/chat/route.ts", "lib/prompts.ts", "lib/embeddings.ts"], schemaModels: ["conversation"], envVars: ["openai_api_key"] });
check("AI-app signals (openai/pinecone + chat/prompt/embedding) → ai-app on top", aiApp[0].archetype === "ai-app", `got ${aiApp[0].archetype}`);
const ecomPlusAI = scoreArchetypes({ deps: ["stripe", "openai", "prisma"], paths: ["app/checkout/page.tsx", "app/cart/page.tsx", "lib/ai/describe.ts"], schemaModels: ["order", "product"] });
check("a bolt-on AI feature does NOT flip an ecommerce app to ai-app", ecomPlusAI[0].archetype === "ecommerce", `got ${ecomPlusAI[0].archetype}`);
check("'groq-sdk' (AI) is required — Sanity's 'groq' query lang does not score ai-app", scoreArchetypes({ deps: ["groq", "sanity", "next-sanity"], paths: ["src/lib/queries.ts"], schemaModels: [] }).find((r) => r.archetype === "ai-app").score === 0, "bare groq should not mislabel as ai-app");

// baas: Supabase/Firebase client SDKs + RLS/policy signals classify.
const baas = scoreArchetypes({ deps: ["@supabase/supabase-js"], paths: ["supabase/migrations/001_init.sql", "supabase/policies.sql"], schemaModels: [], envVars: ["supabase_url", "supabase_anon_key"] });
check("Supabase signals → baas on top", baas[0].archetype === "baas", `got ${baas[0].archetype}`);
const fbase = scoreArchetypes({ deps: [], paths: [], schemaModels: [], configHits: [{ archetype: "baas", file: "firestore.rules" }] });
check("firestore.rules config → baas on top", fbase[0].archetype === "baas" && fbase[0].matched.some((m) => m.startsWith("config:")));

// Integration: real signals from the vulnerable fixture → ecommerce, with evidence.
const fxSignals = collectSignals(fixture);
const fxRanked = scoreArchetypes(fxSignals);
check("fixture detects as ecommerce", fxRanked[0].archetype === "ecommerce", `got ${fxRanked[0].archetype}`);
check("fixture detection shows its evidence (the 'why')", fxRanked[0].matched.length > 0);

// Manifest discovery finds the base archetypes and excludes the instrumented design layer.
const manifests = discoverManifests(join(here, ".."));
const names = manifests.map((m) => m.archetype);
check("discovers ecommerce/saas/portfolio/ai-app/baas manifests", ["ecommerce", "saas", "portfolio", "ai-app", "baas"].every((n) => names.includes(n)), names.join(","));
check("excludes the *.design.json instrumented layer", !manifests.some((m) => m.file.endsWith(".design.json")));

console.log("\n6. Project config + manifest resolution (CLI — brick B):");
// Bundled manifests resolve by bare name / filename against the package, not cwd.
const byName = resolveManifestPath("ecommerce", { cwd: "/nonexistent" });
check("resolves a bare archetype name to the bundled manifest", typeof byName === "string" && byName.endsWith("archetype.ecommerce.json"));
const byFile = resolveManifestPath("archetype.saas.json", { cwd: "/nonexistent" });
check("resolves a manifest filename to the bundled manifest", byFile.endsWith("archetype.saas.json"));
// config round-trips and the readers pick it up.
const cfgDir = mkdtempSync(join(tmpdir(), "foresight-cfg-"));
try {
  check("readConfig returns null when absent", readConfig(cfgDir) === null);
  const written = writeConfig(cfgDir, { schema: "foresight/config/v1", archetype: "archetype.saas.json" });
  check("writeConfig creates foresight.config.json", written.endsWith(CONFIG_FILE));
  check("readConfig round-trips the archetype", readConfig(cfgDir).archetype === "archetype.saas.json");
} finally { rmSync(cfgDir, { recursive: true, force: true }); }

console.log("\n7. Plan engine — interrogate before building (brick D):");
const stockCp = archetype.checkpoints.find((c) => c.id === "ecommerce.checkout.atomic_stock_hold");
check("relevant feature scores the matching checkpoint > 0", relevanceScore("add checkout flow", stockCp) > 0);
check("unrelated feature does not score it", relevanceScore("change the footer copyright year", stockCp) === 0);

const sel = selectForFeature(archetype.checkpoints, "add checkout flow", { domain: "backbone" });
check("a feature-matched checkpoint lands in 'relevant'", sel.relevant.some((c) => c.id === "ecommerce.checkout.atomic_stock_hold"));
const criticals = backbone.filter((c) => c.severity === "critical").map((c) => c.id);
const covered = new Set([...sel.relevant, ...sel.mustHold].map((c) => c.id));
check("every critical backbone checkpoint is surfaced (relevant ∪ mustHold)", criticals.every((id) => covered.has(id)), `missing ${criticals.filter((id) => !covered.has(id))}`);

const md = renderPlan({ archetype, feature: "add checkout flow", relevant: sel.relevant, mustHold: sel.mustHold });
check("spec carries the 'decide first' question", md.includes("Decide first:") && md.includes("reserved atomically"));
check("spec carries acceptance checkboxes", md.includes("**Acceptance criteria:**") && md.includes("- [ ]"));
check("spec states the shippable (level 6) bar", md.includes("Shippable (level 6):"));

console.log("\n8. Instrumented design metrics (P3 — pure, no browser):");
check("contrast black/white ≈ 21:1", Math.abs(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.1);
check("contrast #767676 on white ≈ 4.5:1 (AA boundary)", Math.abs(contrastRatio(parseColor("rgb(118,118,118)"), parseColor("rgb(255,255,255)")) - 4.54) < 0.15);
check("isLargeText: 24px normal yes, 16px no, 19px bold yes", isLargeText(24, 400) && !isLargeText(16, 400) && isLargeText(19, 700));
const cBad = scoreContrast({ textNodes: [{ color: "rgb(170,170,170)", bg: "rgb(255,255,255)", fontSize: 12, fontWeight: 400 }], images: { withAlt: 0, total: 1 }, inputs: { withLabel: 0, total: 1 } });
check("scoreContrast flags a low-contrast page → level 3", compositeToLevel(cBad.score) === 3, `score ${cBad.score}`);
const cGood = scoreContrast({ textNodes: [{ color: "rgb(34,34,34)", bg: "rgb(255,255,255)", fontSize: 16, fontWeight: 400 }], images: { withAlt: 1, total: 1 }, inputs: { withLabel: 1, total: 1 } });
check("scoreContrast passes a high-contrast page → level 9", compositeToLevel(cGood.score) === 9, `score ${cGood.score}`);
check("scoreTypeScale flags 12px body / single size → level 3", compositeToLevel(scoreTypeScale({ bodyFontSize: 12, bodyLineHeight: 13.2, headingSizes: [18] }).score) === 3);
check("scoreTypeScale passes 16px body + modular scale → ≥6", compositeToLevel(scoreTypeScale({ bodyFontSize: 16, bodyLineHeight: 24, headingSizes: [32, 24, 18] }).score) >= 6);
check("scoreResponsive flags overflow + tiny taps → level 3", compositeToLevel(scoreResponsive({ overflow: true, overflowPx: 751, tapTargets: [{ w: 18, h: 18 }, { w: 20, h: 16 }] }).score) === 3);
check("scoreResponsive passes no-overflow + ≥44px taps → level 9", compositeToLevel(scoreResponsive({ overflow: false, tapTargets: [{ w: 48, h: 48 }, { w: 140, h: 48 }] }).score) === 9);
check("scoreSpacing flags ad-hoc spacing → level 3", compositeToLevel(scoreSpacing({ values: [3, 7, 13, 17, 19, 5, 11, 23, 9] }).score) === 3);
check("scoreSpacing passes a 4/8 scale → ≥6", compositeToLevel(scoreSpacing({ values: [8, 16, 16, 24, 8, 16, 32] }).score) >= 6);
check("compositeToLevel mapping (8→9, 5→6, 4→3)", compositeToLevel(8) === 9 && compositeToLevel(5) === 6 && compositeToLevel(4) === 3);

console.log("\n9. Instrumented design probe (P3 — live browser, if available):");
let pwAvailable = false;
try { await import("playwright-core"); pwAvailable = true; } catch { /* optional dep */ }
if (!pwAvailable) {
  console.log("  skip  playwright-core not installed (optional dep) — pure metrics above cover the scoring");
} else {
  try {
    const { gradeUrl } = await import("./design-probe.mjs");
    const lvl = (g, id) => g.results.find((r) => r.id === id)?.level;
    const bad = await gradeUrl(pathToFileURL(join(here, "fixtures", "design-page", "bad.html")).href);
    const good = await gradeUrl(pathToFileURL(join(here, "fixtures", "design-page", "good.html")).href);
    check("probe: bad page contrast → level 3", lvl(bad, "design.contrast_a11y") === 3, `got ${lvl(bad, "design.contrast_a11y")}`);
    check("probe: bad page responsive → level 3 (overflow caught)", lvl(bad, "design.responsive") === 3, `got ${lvl(bad, "design.responsive")}`);
    check("probe: good page contrast → ≥6", lvl(good, "design.contrast_a11y") >= 6, `got ${lvl(good, "design.contrast_a11y")}`);
    check("probe: good page responsive → ≥6", lvl(good, "design.responsive") >= 6, `got ${lvl(good, "design.responsive")}`);
  } catch (e) {
    console.log(`  skip  browser probe unavailable: ${String(e.message ?? e).slice(0, 80)}`);
  }
}

console.log("\n10. Proficiency layer — self-facing, asymmetric (P5):");
// Empty store ⇒ everything "learning" ⇒ full explanations by default.
const empty = estimateFromRecords({});
check("empty store ⇒ both domains 'learning'", empty.backbone.band === "learning" && empty.design.band === "learning");
check("profile is marked self_facing", empty.self_facing === true);
check("verbosity default is 'full' when learning", verbosityFor("backbone", empty) === "full");

// Demonstrated backbone engagement + judgment + precise terms raises ONLY backbone.
const preds = [
  { checkpoint_id: "payment.idempotency", domain: "backbone" },
  { checkpoint_id: "design.contrast_a11y", domain: "design" },
];
const outPat = [
  { checkpoint_id: "payment.idempotency", outcome: "over-severe", source: "self_observed" },
  { checkpoint_id: "payment.idempotency", outcome: "false-positive", source: "expert_rating" },
  { checkpoint_id: "payment.state_integrity", outcome: "over-severe", source: "self_observed" },
];
const outInst = [
  { checkpoint_id: "payment.idempotency", note: "real but contained; the idempotency key + replay window already cover the webhook path" },
  { checkpoint_id: "payment.state_integrity", note: "atomic transaction with optimistic lock; reconcile job exists" },
];
const overridesLog = [{ checkpoint: "data.money_precision" }];
const prof = estimateFromRecords({ predictions: preds, outcomesPattern: outPat, outcomesInstance: outInst, overridesLog });
check("backbone rises above 'learning' from real signals", prof.backbone.band !== "learning", `band ${prof.backbone.band} score ${prof.backbone.score}`);
check("design stays 'learning' (no design signals)", prof.design.band === "learning");
check("asymmetric: a blunt note never lowered the score", prof.backbone.score >= empty.backbone.score);
check("counts surface the evidence", prof.backbone.counts.judgment_calls === 3 && prof.backbone.counts.terms_used >= 2, `judgment ${prof.backbone.counts.judgment_calls}, terms ${prof.backbone.counts.terms_used}`);
check("bandFor thresholds (0.3→learning, 0.5→steady, 0.8→fluent)", bandFor(0.3) === "learning" && bandFor(0.5) === "steady" && bandFor(0.8) === "fluent");
// A fluent domain switches verbosity to brief (the "get out of the way" behavior).
check("fluent ⇒ brief verbosity", verbosityFor("backbone", { backbone: { band: "fluent" } }) === "brief");

console.log("\n11. Accuracy corpus integrity (verifier-eval — statistical power):");
const evalDir = join(here, "..", "verifier-eval");
const corpus = JSON.parse(readFileSync(join(evalDir, "fixtures.json"), "utf8"));
const allExist = corpus.cases.every((c) => existsSync(join(evalDir, c.fixture)));
check("every corpus fixture file exists", allExist, `${corpus.cases.filter((c) => !existsSync(join(evalDir, c.fixture))).map((c) => c.fixture).join(", ")}`);
check("labels/levels valid (bad→3, good→≥6)", corpus.cases.every((c) => (c.label === "bad" && c.gold_level === 3) || (c.label === "good" && c.gold_level >= 6)));
// Criticality from the manifests; each critical checkpoint needs enough bad cases for power.
// Union EVERY discovered archetype's criticals so no archetype — present or future — can
// ship a critical checkpoint with thin bad-case coverage. The floor applies to all, and a
// new archetype.*.json is enforced automatically the moment it's added.
const criticalIds = new Set();
for (const m of discoverManifests(join(here, "..")))
  for (const cp of resolveArchetype(join(here, "..", m.file)).checkpoints)
    if (cp.severity === "critical") criticalIds.add(cp.id);
const badPerCritical = {};
for (const c of corpus.cases) if (c.label === "bad" && criticalIds.has(c.checkpoint)) badPerCritical[c.checkpoint] = (badPerCritical[c.checkpoint] || 0) + 1;
const thinCriticals = [...criticalIds].filter((id) => corpus.cases.some((c) => c.checkpoint === id) && (badPerCritical[id] || 0) < 4);
check("each covered critical checkpoint has ≥4 bad cases (rule-of-three power)", thinCriticals.length === 0, `thin: ${thinCriticals.join(", ")}`);
const totalBadCrit = Object.values(badPerCritical).reduce((a, b) => a + b, 0);
// ecommerce view = 6 criticals; run-eval counts all archetypes' criticals (more). This is a
// rot-guard floor — enough bad cases that the rule-of-three bound stays meaningful.
check("critical bad-case count supports a rule-of-three bound (≥24)", totalBadCrit >= 24, `have ${totalBadCrit}`);

console.log("\n12. File selection determinism + budget discipline (select.mjs — the component that decides what the verifier sees):");
// Determinism: loadRepo order must not depend on filesystem walk order.
const paths1 = loadRepo(fixture).map((f) => f.path);
check("loadRepo returns a stable, path-sorted order", JSON.stringify(paths1) === JSON.stringify([...paths1].sort()));
// Same repo → identical slice, every run (the field-noted coverage-variance guard).
const cpSel = archetype.checkpoints.find((c) => c.id === "payment.idempotency");
const s1 = selectForCheckpoint(loadRepo(fixture), cpSel);
const s2 = selectForCheckpoint(loadRepo(fixture), cpSel);
check("selectForCheckpoint is deterministic (same repo → same slice)", s1.code === s2.code && s1.files.length === s2.files.length);
// Stable tie-break: equal-scoring files order by path regardless of input order.
const tieA = { path: "z.ts", content: "stock" }, tieB = { path: "a.ts", content: "stock" };
const fwd = selectForCheckpoint([tieA, tieB], { id: "x.stock" }).files.map((f) => f.path);
const rev = selectForCheckpoint([tieB, tieA], { id: "x.stock" }).files.map((f) => f.path);
check("equal-score files break ties by path (input order irrelevant)", JSON.stringify(fwd) === JSON.stringify(rev) && fwd[0] === "a.ts", fwd.join(","));
// perFileCap: one huge file is clipped, never allowed to eat the whole budget.
const capped = selectForCheckpoint([{ path: "big.ts", content: "stock ".repeat(10) + "x".repeat(40000) }], { id: "x.stock" }, 60000, 24000).files[0];
check("a file over perFileCap is truncated", capped.content.length <= 24100 && capped.content.includes("truncated for budget"), `len ${capped.content.length}`);
// Starvation guard (the Juice Shop regression): a huge high-scorer must not evict a smaller relevant file.
const bigHot = { path: "server.ts", content: "stock ".repeat(50) + "y".repeat(40000) };
const smallHot = { path: "insecurity.ts", content: "reserve stock hold" };
const picked = selectForCheckpoint([bigHot, smallHot], { id: "x.stock.reserve" }, 30000, 24000).files.map((f) => f.path);
check("perFileCap keeps a huge file from starving a smaller relevant one", picked.includes("server.ts") && picked.includes("insecurity.ts"), picked.join(","));
// Budget discipline: total packed content stays within the character budget.
const many = Array.from({ length: 20 }, (_, i) => ({ path: `f${String(i).padStart(2, "0")}.ts`, content: "stock ".repeat(100) + "z".repeat(5000) }));
const packed = selectForCheckpoint(many, { id: "x.stock" }, 20000, 24000);
check("selection respects the character budget", packed.code.length <= 26000, `packed ${packed.code.length}`);
// Fallback: nothing scores → smallest files, code never empty.
const fb = selectForCheckpoint([{ path: "a.ts", content: "zzz" }, { path: "b.ts", content: "yy" }], { id: "nomatch.checkpoint.zzz" });
check("fallback returns non-empty code when no keyword matches", fb.code.length > 0 && fb.files.length > 0);
check("scoreFile counts a path hit + caps body matches", scoreFile({ path: "stock.ts", content: "stock stock stock" }, ["stock"]) === 8);

console.log("\n13. Selection recall (the OTHER half of trust — does selection surface the vulnerable file?):");
// The corpus proves the grader; this proves selection hands it the right file. A miss here
// is a false-green the corpus never sees. Run at a tight budget so ranking/budget bite.
for (const budget of [9000, 5000]) {
  const rows = measureRecall({ budget, perFile: 3000 });
  const misses = rows.filter((r) => !r.missing && !r.inSlice);
  const total = rows.filter((r) => !r.missing).length;
  check(`every known-vulnerable file is surfaced at budget ${budget} (${total - misses.length}/${total})`, misses.length === 0,
    misses.map((m) => `${m.repo}/${m.cpId}→${m.target}`).join(", "));
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed.");
