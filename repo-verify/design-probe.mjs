#!/usr/bin/env node
// foresight design — the instrumented design layer (build-order Phase 3). Where verify
// reads source, THIS renders the live page in a headless browser (Playwright) and
// MEASURES it: contrast ratios, tap-target sizes, the type scale, mobile overflow, the
// spacing scale. It covers the design blind spot with standards you don't have to author
// — but only the honest, measurable parts; taste is left to a human and reported as
// residual, never folded into the number.
//
// The scoring lives in design-metrics.mjs (pure, unit-tested, zero-dep). This file is the
// I/O: launch the browser, collect raw DOM metrics, hand them to the scorer.
//
//   foresight design http://localhost:3000
//   foresight design ./dist/index.html
//   foresight design <url> --json
//
// Requires playwright-core (an OPTIONAL dependency — the rest of the tool stays zero-dep).
// A browser must be available; set FORESIGHT_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH if it
// isn't auto-found.

import { existsSync, readdirSync } from "node:fs";
import { resolve as pathResolve, dirname, join, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { INSTRUMENTED, gradeDesignCheckpoint } from "./design-metrics.mjs";
import { resolveArchetype } from "../library/resolve.mjs";
import { readConfig, resolveManifestPath } from "./config.mjs";
import { fingerprint, newRunId, recordPredictions } from "./store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (f, fb) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const has = (f) => process.argv.includes(f);

const HELP = `foresight design — grade a live page's design in a headless browser.

Usage:
  foresight design <url-or-html-file> [options]

Options:
  --desktop <px>   desktop viewport width (default: 1280)
  --mobile <px>    mobile viewport width (default: 375)
  --repo <path>    repo to read foresight.config.json from (for severities; default: .)
  --archetype <r>  archetype name/manifest (for severities; overrides config)
  --store <dir>    calibration store (default: ./.foresight); --no-store to skip
  --json           machine-readable
  -h, --help

Grades the established design checkpoints: ${INSTRUMENTED.join(", ")}.
Needs playwright-core + a browser; set FORESIGHT_CHROMIUM if it isn't auto-found.`;

/** Locate a Chromium executable: explicit env → newest under PLAYWRIGHT_BROWSERS_PATH → let Playwright try. */
export function resolveChromium() {
  if (process.env.FORESIGHT_CHROMIUM && existsSync(process.env.FORESIGHT_CHROMIUM)) return process.env.FORESIGHT_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    const dirs = readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse();
    for (const d of dirs) {
      for (const exe of [join(base, d, "chrome-linux", "chrome"), join(base, d, "chrome-linux", "headless_shell")]) {
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined; // playwright-core falls back to its own default path
}

function toUrl(target) {
  if (/^(https?|file):\/\//i.test(target)) return target;
  const abs = isAbsolute(target) ? target : pathResolve(process.cwd(), target);
  return pathToFileURL(abs).href;
}

// ---- in-page collectors (run inside the browser; must be self-contained) ----

function collectDesktop() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity || "1") > 0;
  };
  const effectiveBg = (el) => {
    let cur = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(",").map((s) => parseFloat(s));
        const a = p[3] === undefined ? 1 : p[3];
        if (a >= 0.5) return cs.backgroundColor;
      }
      cur = cur.parentElement;
    }
    return "rgb(255, 255, 255)";
  };
  const all = Array.from(document.querySelectorAll("body *"));
  const textNodes = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const direct = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (direct.length < 1) continue;
    const cs = getComputedStyle(el);
    textNodes.push({ color: cs.color, bg: effectiveBg(el), fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, sample: direct.slice(0, 40) });
  }
  const imgs = Array.from(document.querySelectorAll("img"));
  const images = { total: imgs.length, withAlt: imgs.filter((i) => i.hasAttribute("alt")).length };
  const inputEls = Array.from(document.querySelectorAll("input:not([type=hidden]),select,textarea"));
  const labelled = (el) => !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") ||
    (el.id && document.querySelector(`label[for="${(window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id}"]`)) || el.closest("label"));
  const inputs = { total: inputEls.length, withLabel: inputEls.filter(labelled).length };

  const bodyEl = document.querySelector("p") || document.body;
  const bodyCs = getComputedStyle(bodyEl);
  const bodyFontSize = parseFloat(bodyCs.fontSize);
  const bodyLineHeight = bodyCs.lineHeight === "normal" ? bodyFontSize * 1.2 : parseFloat(bodyCs.lineHeight);
  const headingSizes = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(visible).map((h) => parseFloat(getComputedStyle(h).fontSize));

  const values = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    for (const p of ["marginTop", "marginBottom", "marginLeft", "marginRight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"]) {
      const v = parseFloat(cs[p]);
      if (v > 0) values.push(v);
    }
  }
  return { textNodes, images, inputs, bodyFontSize, bodyLineHeight, headingSizes, values: values.slice(0, 800) };
}

function collectMobile() {
  // Compare against clientWidth, not innerWidth: with a device-width viewport meta the
  // layout viewport (innerWidth) expands to fit overflowing content, hiding the overflow.
  // clientWidth stays at the visual viewport, so scrollWidth - clientWidth is the real bleed.
  const ref = document.documentElement.clientWidth || window.innerWidth;
  const overflowPx = Math.max(0, document.documentElement.scrollWidth - ref);
  const interactive = Array.from(document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[onclick]"));
  const tapTargets = interactive
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }));
  return { overflow: overflowPx > 2, overflowPx: Math.round(overflowPx), tapTargets };
}

/** Launch a browser, render the target at desktop + mobile, return merged raw metrics. */
export async function probe(target, { desktop = 1280, mobile = 375, timeout = 30000 } = {}) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: resolveChromium(), headless: true, args: ["--no-sandbox"] });
  try {
    const url = toUrl(target);
    const dp = await browser.newPage({ viewport: { width: desktop, height: 900 } });
    await dp.goto(url, { waitUntil: "load", timeout });
    await dp.waitForTimeout(250);
    const desktopMetrics = await dp.evaluate(collectDesktop);
    await dp.close();

    const mp = await browser.newPage({ viewport: { width: mobile, height: 800 }, isMobile: true, hasTouch: true });
    await mp.goto(url, { waitUntil: "load", timeout });
    await mp.waitForTimeout(250);
    const mobileMetrics = await mp.evaluate(collectMobile);
    await mp.close();

    return { url, ...desktopMetrics, ...mobileMetrics };
  } finally {
    await browser.close();
  }
}

/** Probe + grade every instrumented design checkpoint. */
export async function gradeUrl(target, opts = {}) {
  const metrics = await probe(target, opts);
  const results = INSTRUMENTED.map((id) => ({ ...gradeDesignCheckpoint(id, metrics), domain: "design", evidence: [metrics.url] }));
  return { url: metrics.url, metrics, results };
}

// ---- CLI ----

function severitiesFromArchetype() {
  const repo = pathResolve(process.cwd(), arg("--repo", "."));
  const archetypeArg = arg("--archetype", null);
  const cfg = readConfig(repo);
  const path = archetypeArg
    ? resolveManifestPath(archetypeArg, { cwd: process.cwd() })
    : cfg?.archetype
      ? resolveManifestPath(cfg.archetype, { cwd: repo })
      : pathResolve(here, "..", "archetype.ecommerce.json");
  try {
    const a = resolveArchetype(path);
    const map = {};
    for (const c of a.checkpoints) map[c.id] = c.severity;
    return { map, archetype: a.archetype, version: a.version };
  } catch { return { map: {}, archetype: "unknown", version: "0" }; }
}

async function main() {
  if (has("-h") || has("--help")) { console.log(HELP); return 0; }
  const target = process.argv.slice(2).find((a, i, arr) => !a.startsWith("-") && !["--desktop", "--mobile", "--repo", "--archetype", "--store"].includes(arr[i - 1]));
  if (!target) { console.error("error: missing <url-or-html-file>\n"); console.error(HELP); return 2; }

  const { map: sev, archetype, version } = severitiesFromArchetype();
  const desktop = Number(arg("--desktop", "1280")) || 1280;
  const mobile = Number(arg("--mobile", "375")) || 375;

  let graded;
  try {
    graded = await gradeUrl(target, { desktop, mobile });
  } catch (e) {
    console.error(`error: design probe failed: ${e.message ?? e}`);
    if (String(e).includes("playwright-core")) console.error("hint: install it with `npm install playwright-core` and ensure a browser is available.");
    return 2;
  }

  const results = graded.results.map((r) => ({ ...r, severity: sev[r.id] ?? "high" }));

  if (has("--json")) {
    console.log(JSON.stringify({ url: graded.url, archetype, results }, null, 2));
  } else {
    console.log(`\n🔭 Foresight design — ${graded.url}`);
    console.log(`  ${archetype} v${version} | instrumented (established signals only)\n`);
    for (const r of results) {
      const tag = r.level == null ? "—" : `level ${r.level}`;
      console.log(`${r.id}  [${r.severity}]  ${tag}  (composite ${r.composite ?? "—"}/10)`);
      if (r.rationale) console.log(`  ${r.rationale}`);
      if (r.breakdown?.length) console.log(`  signals: ${r.breakdown.filter((s) => !s.na).map((s) => `${s.id} ${Math.round((s.score ?? 0))}`).join(" · ")}`);
      if (r.residual) console.log(`  residual (not scored): ${r.residual}`);
      console.log("");
    }
    const below6 = results.filter((r) => r.level != null && r.level < 6);
    console.log(below6.length ? `design needs work: ${below6.map((r) => r.id).join(", ")}` : "design: all instrumented checkpoints ≥ 6");
  }

  // Record to the calibration store (domain=design). Fingerprint = hash of the metric summary.
  if (!has("--no-store")) {
    const storeDir = pathResolve(process.cwd(), arg("--store", ".foresight"));
    const fp = fingerprint(`${graded.url}|${results.map((r) => `${r.id}:${r.composite}`).join(",")}`);
    const recRes = results.filter((r) => r.level != null).map((r) => ({
      id: r.id, domain: "design", severity: r.severity, level: r.level, confidence: r.confidence,
      gap: r.gap, rationale: r.rationale, evidence: r.evidence, adapter: "playwright", fingerprint: fp,
    }));
    if (recRes.length) {
      recordPredictions({ storeDir, runId: newRunId(), archetype, archetypeVersion: version, project: graded.url, results: recRes });
    }
  }
  return 0;
}

if (process.argv[1] && pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(`fatal: ${e?.message ?? e}`); process.exit(2); });
}
