#!/usr/bin/env node
// forespec plan — the interrogator. The OTHER half of the name: "forces domain
// foresight BEFORE a feature." Where verify/gate grade what already got built, this
// runs first — it turns the archetype's checkpoints into questions you must answer
// before you write the feature, and emits a spec your AI coder builds against. The
// expensive discoveries (atomic stock holds, idempotency, auth boundaries) surface at
// plan time, when they're ~10x cheaper than at PR time.
//
// It reuses the same library every other command does: the checkpoint's stored
// reasoning question becomes "decide first", its level-6 definition becomes the
// shippable bar, and its assertions become acceptance criteria. Static and $0 — the
// reasoning adapter (claude) only sharpens the phrasing, it isn't required.
//
//   forespec plan "add checkout flow"            # spec for the relevant checkpoints
//   forespec plan "subscription billing" --archetype saas
//   forespec plan "add login" --out forespec-plan.md
//   forespec plan "checkout" --json

import { resolve as pathResolve, dirname } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { keywordsFor } from "./select.mjs";
import { readConfig, resolveManifestPath, CONFIG_FILE } from "./config.mjs";
import { archetypeFromIntent, discoverManifests } from "./detect.mjs";
import { estimateProficiency, verbosityFor } from "./proficiency.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

const HELP = `forespec plan — interrogate a feature BEFORE you build it.

Usage:
  forespec plan "<feature description>" [options]

Options:
  --repo <path>        repo to read forespec.config.json from (default: .)
  --archetype <ref>    archetype name/manifest (overrides config; e.g. saas)
  --domain <d>         backbone | design | all (default: backbone)
  --checkpoint <id>    interrogate a single checkpoint by id
  --out <file>         write the spec to a file instead of stdout
  --json               machine-readable
  -h, --help

Emits, per relevant checkpoint: the question to decide first, what "shippable"
(level 6) requires, and acceptance criteria your AI coder must satisfy. Then run
\`forespec verify\` (or open a PR — the gate grades these same checkpoints).`;

/** How relevant is a checkpoint to a feature description? Keyword + title-token hits. */
export function relevanceScore(feature, cp) {
  const text = ` ${feature.toLowerCase()} `;
  let score = 0;
  for (const kw of keywordsFor(cp)) if (kw.length > 2 && text.includes(kw)) score += 1;
  for (const t of (cp.title || "").toLowerCase().split(/\W+/)) if (t.length > 3 && text.includes(t)) score += 1;
  return score;
}

/**
 * Select the checkpoints to interrogate for a feature:
 *   - `relevant`: scored > 0 by the feature text, ranked.
 *   - `mustHold`: critical-backbone checkpoints not already relevant — surfaced anyway,
 *     because a feature touching the backbone must respect them regardless of wording.
 * This guarantees the critical backbone is never silently skipped at plan time.
 */
export function selectForFeature(checkpoints, feature, { domain = "backbone", onlyId = null } = {}) {
  let pool = checkpoints;
  if (onlyId) pool = pool.filter((c) => c.id === onlyId);
  else if (domain !== "all") pool = pool.filter((c) => c.domain === domain);

  const scored = pool.map((cp) => ({ cp, score: relevanceScore(feature, cp) }));
  const relevant = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.cp);
  const relevantIds = new Set(relevant.map((c) => c.id));
  const mustHold = onlyId ? [] : pool.filter((c) => c.severity === "critical" && !relevantIds.has(c.id));
  return { relevant, mustHold };
}

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Sequence the plan the way the thesis demands: dangerous/foundational pieces first.
 * Merges the feature-matched checkpoints and the must-hold backbone into ONE ordered
 * build list — so the criticals a feature depends on (payment/idempotency/webhook for a
 * checkout) sit right up with it instead of being exiled to a "regardless" section.
 * Order: severity (critical→low), then feature-matched first, then relevance, then the
 * archetype's own manifest order as the stable tiebreak. Each item carries whether the
 * feature text matched it, so the renderer can mark it.
 */
export function orderForBuild(relevant, mustHold, feature, checkpoints = []) {
  const matched = new Set(relevant.map((c) => c.id));
  const idx = new Map(checkpoints.map((c, i) => [c.id, i]));
  return [...relevant, ...mustHold]
    .slice()
    .sort((a, b) => {
      const s = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
      if (s) return s;
      const m = (matched.has(b.id) ? 1 : 0) - (matched.has(a.id) ? 1 : 0);
      if (m) return m;
      const sc = relevanceScore(feature, b) - relevanceScore(feature, a);
      if (sc) return sc;
      return (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
    })
    .map((cp) => ({ cp, matched: matched.has(cp.id) }));
}

function renderCheckpoint(cp, { brief = false, ordinal = null, matched = false } = {}) {
  const L = [];
  const n = ordinal != null ? `${ordinal}. ` : "";
  const tag = matched ? "  ·  ↳ matches your feature" : "";
  L.push(`### ${n}${cp.title}  ·  \`${cp.id}\`  ·  ${cp.severity}${tag}`);
  if (cp.verify?.reasoning) L.push(`**Decide first:** ${cp.verify.reasoning}`);
  if (cp.levels?.["6"]) L.push(`**Shippable (level 6):** ${cp.levels["6"]}`);
  const assertions = cp.verify?.assertions ?? [];
  if (assertions.length) {
    L.push(`**Acceptance criteria:**`);
    for (const a of assertions) L.push(`- [ ] ${a.check}${a.type ? ` _(${a.type})_` : ""}`);
  }
  // Proficiency adaptation: the "Why" is the teaching line — drop it in domains you're
  // fluent in (you know why), keep it where you're still learning.
  if (cp.why && !brief) L.push(`**Why:** ${cp.why}`);
  return L.join("\n");
}

export function renderPlan({ archetype, feature, relevant, mustHold, verbosity }) {
  const briefFor = (cp) => (verbosity ? verbosity(cp) === "brief" : false);
  const ordered = orderForBuild(relevant, mustHold, feature, archetype.checkpoints || []);
  const total = ordered.length;
  const matchedCount = ordered.filter((o) => o.matched).length;
  const L = [];
  L.push(`# 🔭 Forespec plan — ${feature}`);
  L.push("");
  L.push(`Archetype: **${archetype.archetype}** v${archetype.version} · **${total}** checkpoint(s) to clear before you build.`);
  if (total === 0) {
    L.push("");
    L.push("No backbone checkpoints matched this feature. Re-run with `--domain all` or a clearer description.");
    return L.join("\n");
  }
  L.push(
    matchedCount
      ? `**${matchedCount}** match your description directly; the rest are the critical backbone any feature here must hold. Ordered **most-critical / most-foundational first** — build them in this order.`
      : `These are the critical backbone any feature here must hold, ordered **most-critical / most-foundational first** — build them in this order.`
  );
  L.push("");
  L.push(ordered.map((o, i) => renderCheckpoint(o.cp, { brief: briefFor(o.cp), ordinal: i + 1, matched: o.matched })).join("\n\n"));
  L.push("");
  L.push("---");
  L.push("**For your AI coder:** build the feature so every acceptance box above can be checked, then run `forespec verify` (or open a PR — the gate grades these same checkpoints). Levels: 3 present-but-risky · 6 solid/shippable · 9 great. Aim for 9 on critical, 6+ elsewhere — never infinite polish.");
  return L.join("\n");
}

const VALUE_FLAGS = ["--repo", "--archetype", "--domain", "--checkpoint", "--out"];

function main() {
  if (has("-h") || has("--help")) { console.log(HELP); return 0; }
  const argv = process.argv.slice(2);
  const positionals = argv.filter((a, i) => !a.startsWith("-") && !VALUE_FLAGS.includes(argv[i - 1]));
  const feature = positionals.join(" ").trim();
  if (!feature) { console.error("error: missing \"<feature description>\"\n"); console.error(HELP); return 2; }

  const repo = pathResolve(process.cwd(), arg("--repo", "."));
  const archetypeArg = arg("--archetype", null);
  const cfg = readConfig(repo);
  let archetypePath, inferredNote = "";
  if (archetypeArg) {
    archetypePath = resolveManifestPath(archetypeArg, { cwd: process.cwd() });
  } else if (cfg?.archetype) {
    archetypePath = resolveManifestPath(cfg.archetype, { cwd: repo });
  } else {
    // No --archetype and no config (a new/empty repo): DECLARE from the feature text rather
    // than silently grading against ecommerce. Infer, and say so; only fall back to ecommerce
    // when the text gives nothing to go on.
    const manifests = discoverManifests(pathResolve(here, ".."));
    const top = archetypeFromIntent(feature, manifests.map((m) => m.archetype))[0];
    const picked = top && (top.confidence === "high" || top.confidence === "medium") ? manifests.find((m) => m.archetype === top.archetype) : null;
    if (picked) {
      archetypePath = pathResolve(here, "..", picked.file);
      inferredNote = `no ${CONFIG_FILE} — inferred archetype '${top.archetype}' from "${feature}" (pass --archetype to override, or run \`forespec start\`)`;
    } else {
      archetypePath = pathResolve(here, "..", "archetype.ecommerce.json");
      inferredNote = `no ${CONFIG_FILE} and couldn't infer the archetype from "${feature}" — defaulting to ecommerce (pass --archetype)`;
    }
  }

  let archetype;
  try { archetype = resolveArchetype(archetypePath); }
  catch (e) { console.error(`error: ${e.message}`); return 2; }
  if (inferredNote) console.error(inferredNote);

  const onlyId = arg("--checkpoint", null);
  if (onlyId && !archetype.checkpoints.some((c) => c.id === onlyId)) {
    console.error(`error: no checkpoint "${onlyId}" in ${archetype.archetype}`);
    return 2;
  }
  const domain = arg("--domain", "backbone");
  const { relevant, mustHold } = selectForFeature(archetype.checkpoints, feature, { domain, onlyId });
  // Don't silently drop a whole dimension: `plan` defaults to the backbone, so a design-heavy
  // archetype (a portfolio) would show none of its design bar. Name what's omitted.
  const designOmitted = (!onlyId && domain === "backbone") ? archetype.checkpoints.filter((c) => c.domain === "design") : [];

  if (has("--json")) {
    const pick = (c) => ({ id: c.id, domain: c.domain, severity: c.severity, title: c.title, reasoning: c.verify?.reasoning, level6: c.levels?.["6"], acceptance: (c.verify?.assertions ?? []).map((a) => a.check) });
    const ordered = orderForBuild(relevant, mustHold, feature, archetype.checkpoints);
    console.log(JSON.stringify({
      archetype: archetype.archetype,
      feature,
      plan: ordered.map((o) => ({ ...pick(o.cp), matched: o.matched })),
      relevant: relevant.map(pick),
      mustHold: mustHold.map(pick),
      designOmitted: designOmitted.map(pick),
    }, null, 2));
    return 0;
  }
  const designNote = designOmitted.length
    ? `\n\n---\n_${designOmitted.length} design checkpoint(s) not shown — plan defaults to the backbone. Add \`--domain all\` to include the design bar; \`forespec design <url>\` grades it on the live page._`
    : "";

  // Proficiency adaptation (P5): trim the teaching lines in domains you're fluent in.
  // Auto when a calibration store exists; --no-adapt to force full detail.
  let verbosity = null, adaptNote = "";
  if (!has("--no-adapt")) {
    const profile = estimateProficiency({ storeDir: pathResolve(repo, arg("--store", ".forespec")) });
    verbosity = (cp) => verbosityFor(cp.domain, profile);
    const brief = [...relevant, ...mustHold].filter((cp) => verbosity(cp) === "brief").length;
    if (brief > 0) adaptNote = `\n_Adapted to your proficiency: trimmed the "why" on ${brief} checkpoint(s) in domains you're fluent in (\`forespec proficiency\` to see, \`--no-adapt\` to show all)._`;
  }

  const md = renderPlan({ archetype, feature, relevant, mustHold, verbosity }) + adaptNote + designNote;
  const out = arg("--out", null);
  if (out) {
    const path = pathResolve(process.cwd(), out);
    writeFileSync(path, md.endsWith("\n") ? md : md + "\n");
    console.error(`wrote plan → ${path} (${relevant.length + mustHold.length} checkpoint(s))`);
  } else {
    console.log(md);
  }
  return 0;
}

if (process.argv[1] && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
