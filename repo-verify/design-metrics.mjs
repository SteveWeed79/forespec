// Instrumented design scoring — the PURE brain of the P3 design layer. Zero deps, no
// browser: it takes raw DOM metrics (collected by design-probe.mjs) and turns them into
// a level + breakdown for each established design checkpoint. Keeping the math here (not
// inside the Playwright page) makes every threshold unit-testable without launching a
// browser, and keeps the false-green discipline the rest of the tool has.
//
// Scope = the confidence:established, defensible signals from the build order's Phase 3:
// contrast/a11y, type scale, responsive, spacing. The taste_limited / model_scored
// signals (saliency, aesthetic coherence) are deferred experiments (Phase 6) and are
// reported as residual, never folded into a number we can't yet stand behind.

// ---- WCAG contrast math (testable against published reference values) ----

/** Parse a CSS computed color ("rgb(r,g,b)" / "rgba(r,g,b,a)") into {r,g,b,a}. */
export function parseColor(str) {
  if (!str) return null;
  const m = String(str).match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

/** WCAG relative luminance of an {r,g,b} (0-255) color. */
export function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two {r,g,b} colors (1..21). */
export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG "large text" = >= 24px, or >= 18.66px when bold (>= 700). */
export function isLargeText(fontSizePx, fontWeight = 400) {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
}

/** Required AA ratio for a text node. */
export function requiredRatio(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? 3.0 : 4.5;
}

// ---- composite helpers ----

/** Weighted average over sub-signals, dropping N/A ones and renormalizing. 0..10. */
export function weightedComposite(signals) {
  const active = signals.filter((s) => !s.na && typeof s.score === "number");
  if (active.length === 0) return null;
  const totalW = active.reduce((a, s) => a + (s.weight ?? 1), 0);
  if (totalW === 0) return null;
  return active.reduce((a, s) => a + s.score * (s.weight ?? 1), 0) / totalW;
}

/** Map a 0-10 composite to the 3/6/9 level the rest of the tool speaks. */
export function compositeToLevel(score) {
  if (score == null) return null;
  if (score >= 8) return 9;
  if (score >= 5) return 6;
  return 3;
}

const rate = (pass, total) => (total === 0 ? null : pass / total);
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

// ---- per-checkpoint scorers ----
// Each takes raw metrics and returns { score (0-10|null), signals[], note }.

/**
 * contrast / a11y. metrics: { textNodes:[{color,bg,fontSize,fontWeight}],
 * images:{withAlt,total}, inputs:{withLabel,total} }
 */
export function scoreContrast(metrics) {
  const nodes = metrics.textNodes ?? [];
  const failures = [];
  let pass = 0;
  for (const n of nodes) {
    const fg = parseColor(n.color), bg = parseColor(n.bg);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const need = requiredRatio(n.fontSize, n.fontWeight);
    if (ratio >= need) pass++;
    else failures.push({ ratio: Math.round(ratio * 100) / 100, need, fontSize: n.fontSize, sample: n.sample });
  }
  const contrastRate = rate(pass, nodes.length);
  const altRate = metrics.images ? rate(metrics.images.withAlt, metrics.images.total) : null;
  const labelRate = metrics.inputs ? rate(metrics.inputs.withLabel, metrics.inputs.total) : null;

  const signals = [
    { id: "text_contrast_AA", weight: 0.7, score: contrastRate == null ? null : contrastRate * 10, na: contrastRate == null },
    { id: "images_have_alt", weight: 0.15, score: altRate == null ? null : altRate * 10, na: altRate == null },
    { id: "inputs_have_labels", weight: 0.15, score: labelRate == null ? null : labelRate * 10, na: labelRate == null },
  ];
  // A single failing body-text contrast is the L3 trigger ("below AA in places") — cap it.
  let score = weightedComposite(signals);
  if (contrastRate != null && contrastRate < 1 && score != null) score = Math.min(score, 7.9);
  if (contrastRate != null && contrastRate < 0.85 && score != null) score = Math.min(score, 4.9);
  const note = `${pct(contrastRate)} of text meets AA${failures.length ? ` (${failures.length} fail)` : ""}` +
    (altRate != null ? `, ${pct(altRate)} images alt'd` : "") +
    (labelRate != null ? `, ${pct(labelRate)} inputs labelled` : "");
  return { score, signals, note, failures: failures.slice(0, 5), residual: "visible focus states + full keyboard operability not measured (Phase 6)" };
}

/** type scale. metrics: { bodyFontSize, bodyLineHeight, headingSizes:[px,...] } */
export function scoreTypeScale(metrics) {
  const body = metrics.bodyFontSize ?? null;
  const bodyScore = body == null ? null : body >= 16 ? 10 : body >= 14 ? 6 : 3;

  const lh = metrics.bodyLineHeight && body ? metrics.bodyLineHeight / body : null;
  const lhScore = lh == null ? null : lh >= 1.4 && lh <= 1.7 ? 10 : lh >= 1.25 && lh < 1.9 ? 6 : 3;

  const sizes = Array.from(new Set((metrics.headingSizes ?? []).filter((s) => s > 0))).sort((a, b) => b - a);
  let scaleScore = null;
  if (sizes.length >= 2) {
    const ratios = [];
    for (let i = 0; i < sizes.length - 1; i++) ratios.push(sizes[i] / sizes[i + 1]);
    const inBand = ratios.filter((r) => r >= 1.15 && r <= 1.6).length;
    const collide = ratios.some((r) => r < 1.05);
    scaleScore = collide ? 3 : inBand === ratios.length ? 10 : inBand >= ratios.length / 2 ? 6 : 4;
  } else if (sizes.length === 1) {
    scaleScore = 3; // effectively one size
  }

  const signals = [
    { id: "body_min_16px", weight: 0.4, score: bodyScore, na: bodyScore == null },
    { id: "body_line_height", weight: 0.25, score: lhScore, na: lhScore == null },
    { id: "modular_heading_scale", weight: 0.35, score: scaleScore, na: scaleScore == null },
  ];
  const note = `body ${body ?? "?"}px` + (lh ? `, line-height ${lh.toFixed(2)}` : "") + `, ${sizes.length} heading size(s)`;
  return { score: weightedComposite(signals), signals, note, residual: "measure/line-length across breakpoints partially covered" };
}

/** responsive. metrics: { overflow:bool, overflowPx, tapTargets:[{w,h}] } */
export function scoreResponsive(metrics) {
  const overflowScore = metrics.overflow == null ? null : metrics.overflow ? 0 : 10;
  const tt = metrics.tapTargets ?? [];
  const pass44 = tt.filter((t) => Math.min(t.w, t.h) >= 44).length;
  const pass24 = tt.filter((t) => Math.min(t.w, t.h) >= 24).length;
  let tapScore = tt.length === 0 ? null : (pass44 / tt.length) * 10;
  // floor: meeting the 24px hard minimum keeps you off a 0 even if below the 44px target.
  if (tapScore != null && pass24 === tt.length) tapScore = Math.max(tapScore, 6);

  const signals = [
    { id: "no_horizontal_overflow", weight: 0.5, score: overflowScore, na: overflowScore == null },
    { id: "tap_targets_44px", weight: 0.5, score: tapScore, na: tapScore == null },
  ];
  const note = `${metrics.overflow ? `overflow +${metrics.overflowPx ?? "?"}px @375` : "no overflow @375"}` +
    (tt.length ? `, ${pass44}/${tt.length} tap targets ≥44px` : "");
  return { score: weightedComposite(signals), signals, note, residual: "per-breakpoint redesign vs shrink not assessed (level 9 territory)" };
}

/** spacing. metrics: { values:[px,...] } (computed non-zero margins/paddings) */
export function scoreSpacing(metrics) {
  const values = (metrics.values ?? []).filter((v) => v > 0);
  if (values.length === 0) return { score: null, signals: [], note: "no spacing values captured", residual: "" };
  const distinct = Array.from(new Set(values.map((v) => Math.round(v))));
  // Consistency with a 4px base (covers 4/8 systems); fraction of values on-scale.
  const onScale = values.filter((v) => Math.round(v) % 4 === 0).length / values.length;
  // Too many distinct values = ad-hoc spacing even if some land on 4px.
  const spread = distinct.length;
  const spreadScore = spread <= 6 ? 10 : spread <= 10 ? 7 : spread <= 16 ? 5 : 3;
  const signals = [
    { id: "values_on_4px_scale", weight: 0.6, score: onScale * 10 },
    { id: "limited_distinct_values", weight: 0.4, score: spreadScore },
  ];
  const note = `${pct(onScale)} of spacing on a 4px scale, ${spread} distinct value(s)`;
  return { score: weightedComposite(signals), signals, note, residual: "intent (grouping/rhythm reads clearly) is taste_limited — not scored" };
}

const SCORERS = {
  "design.contrast_a11y": scoreContrast,
  "design.type_scale": scoreTypeScale,
  "design.responsive": scoreResponsive,
  "design.spacing_system": scoreSpacing,
};

/** Which design checkpoints this instrumented layer can grade. */
export const INSTRUMENTED = Object.keys(SCORERS);

/**
 * Grade a single design checkpoint from raw metrics.
 * Returns { id, level, composite, confidence, gap, rationale, breakdown }.
 */
export function gradeDesignCheckpoint(id, metrics) {
  const scorer = SCORERS[id];
  if (!scorer) return null;
  const r = scorer(metrics ?? {});
  const level = compositeToLevel(r.score);
  return {
    id,
    level,
    composite: r.score == null ? null : Math.round(r.score * 10) / 10,
    confidence: 0.8, // instrumented + established thresholds; not 1.0 (residuals remain)
    rationale: r.note,
    gap: level === 9 ? "" : `${r.note}. ${r.residual ?? ""}`.trim(),
    breakdown: r.signals,
    residual: r.residual ?? "",
    failures: r.failures ?? [],
  };
}
