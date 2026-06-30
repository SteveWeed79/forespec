#!/usr/bin/env node
// foresight plan — the interrogator. The OTHER half of the name: "forces domain
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
//   foresight plan "add checkout flow"            # spec for the relevant checkpoints
//   foresight plan "subscription billing" --archetype saas
//   foresight plan "add login" --out foresight-plan.md
//   foresight plan "checkout" --json

import { resolve as pathResolve, dirname } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveArchetype } from "../library/resolve.mjs";
import { keywordsFor } from "./select.mjs";
import { readConfig, resolveManifestPath } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

const HELP = `foresight plan — interrogate a feature BEFORE you build it.

Usage:
  foresight plan "<feature description>" [options]

Options:
  --repo <path>        repo to read foresight.config.json from (default: .)
  --archetype <ref>    archetype name/manifest (overrides config; e.g. saas)
  --domain <d>         backbone | design | all (default: backbone)
  --checkpoint <id>    interrogate a single checkpoint by id
  --out <file>         write the spec to a file instead of stdout
  --json               machine-readable
  -h, --help

Emits, per relevant checkpoint: the question to decide first, what "shippable"
(level 6) requires, and acceptance criteria your AI coder must satisfy. Then run
\`foresight verify\` (or open a PR — the gate grades these same checkpoints).`;

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

function renderCheckpoint(cp) {
  const L = [];
  L.push(`### ${cp.title}  ·  \`${cp.id}\`  ·  ${cp.severity}`);
  if (cp.verify?.reasoning) L.push(`**Decide first:** ${cp.verify.reasoning}`);
  if (cp.levels?.["6"]) L.push(`**Shippable (level 6):** ${cp.levels["6"]}`);
  const assertions = cp.verify?.assertions ?? [];
  if (assertions.length) {
    L.push(`**Acceptance criteria:**`);
    for (const a of assertions) L.push(`- [ ] ${a.check}${a.type ? ` _(${a.type})_` : ""}`);
  }
  if (cp.why) L.push(`**Why:** ${cp.why}`);
  return L.join("\n");
}

export function renderPlan({ archetype, feature, relevant, mustHold }) {
  const total = relevant.length + mustHold.length;
  const L = [];
  L.push(`# 🔭 Foresight plan — ${feature}`);
  L.push("");
  L.push(`Archetype: **${archetype.archetype}** v${archetype.version} · **${total}** checkpoint(s) to clear before you build.`);
  L.push("");
  if (total === 0) {
    L.push("No backbone checkpoints matched this feature. Re-run with `--domain all` or a clearer description.");
    return L.join("\n");
  }
  if (relevant.length) {
    L.push(`## Directly relevant to "${feature}"`, "");
    L.push(relevant.map(renderCheckpoint).join("\n\n"));
    L.push("");
  }
  if (mustHold.length) {
    L.push(`## Backbone guarantees — critical, must hold regardless`, "");
    L.push(mustHold.map(renderCheckpoint).join("\n\n"));
    L.push("");
  }
  L.push("---");
  L.push("**For your AI coder:** build the feature so every acceptance box above can be checked, then run `foresight verify` (or open a PR — the gate grades these same checkpoints). Levels: 3 present-but-risky · 6 solid/shippable · 9 great. Aim for 9 on critical, 6+ elsewhere — never infinite polish.");
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
  const archetypePath = archetypeArg
    ? resolveManifestPath(archetypeArg, { cwd: process.cwd() })
    : cfg?.archetype
      ? resolveManifestPath(cfg.archetype, { cwd: repo })
      : pathResolve(here, "..", "archetype.ecommerce.json");

  let archetype;
  try { archetype = resolveArchetype(archetypePath); }
  catch (e) { console.error(`error: ${e.message}`); return 2; }

  const onlyId = arg("--checkpoint", null);
  if (onlyId && !archetype.checkpoints.some((c) => c.id === onlyId)) {
    console.error(`error: no checkpoint "${onlyId}" in ${archetype.archetype}`);
    return 2;
  }
  const { relevant, mustHold } = selectForFeature(archetype.checkpoints, feature, { domain: arg("--domain", "backbone"), onlyId });

  if (has("--json")) {
    const pick = (c) => ({ id: c.id, domain: c.domain, severity: c.severity, title: c.title, reasoning: c.verify?.reasoning, level6: c.levels?.["6"], acceptance: (c.verify?.assertions ?? []).map((a) => a.check) });
    console.log(JSON.stringify({ archetype: archetype.archetype, feature, relevant: relevant.map(pick), mustHold: mustHold.map(pick) }, null, 2));
    return 0;
  }

  const md = renderPlan({ archetype, feature, relevant, mustHold });
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
