// Shared terminal renderer for a graded run — the ONE place that turns a
// (results, rollup, gaps) triple into the text a human reads. `verify` produces
// that triple by grading a live repo; `demo` produces it by replaying a recorded
// reasoning-verifier run. Both render through here, so the demo can never drift
// from what a real `verify` prints — the whole reason a "recorded replay" is
// honest is that it goes down the same code path.

export const COLORS = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };

export function paint(on, code, s) {
  return on ? `${code}${s}${COLORS.reset}` : s;
}

export function levelTag(level, on) {
  if (level == null) return paint(on, COLORS.red, "ungraded");
  if (level >= 9) return paint(on, COLORS.green, "level 9");
  if (level >= 6) return paint(on, COLORS.green, "level 6");
  return paint(on, COLORS.yellow, "level 3");
}

/**
 * Render the per-checkpoint lines + goal_definition roll-up + gaps-ahead section.
 * Inputs are exactly what verify.mjs already computes:
 *   - archetype: { archetype, version }
 *   - results:   the per-checkpoint result objects (order preserved)
 *   - rollup:    the shared roll-up (conclusive/shippable/great/gate_tier/blocking/…)
 *   - gaps:      the gapReport ({ items: [...] }) or null
 * The display arrays (blocking/ungraded/not-applicable) are reconstructed from
 * `results` + `rollup` so this function needs no derived state passed in — one
 * signature, one source of truth.
 */
export function renderVerifyText({ archetype, results, rollup, gaps, useColor }) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const gateTier = rollup.gate_tier;
  const gateDemotion = rollup.gate_demotion;
  const blocking = (rollup.blocking ?? []).map((id) => byId.get(id)).filter(Boolean);
  const ungraded = rollup.ungraded ?? [];
  const notApplicable = (rollup.not_applicable ?? []).map((id) => byId.get(id)).filter(Boolean);
  const designSkipped = rollup.design_skipped ?? [];

  const out = [];
  out.push("");
  out.push(paint(useColor, COLORS.bold, `Forespec — ${archetype.archetype} v${archetype.version}`));
  out.push("");
  for (const r of results) {
    out.push(`${paint(useColor, COLORS.cyan, r.id)}  ${paint(useColor, COLORS.dim, `[${r.domain}/${r.severity}]`)}`);
    if (r.error) {
      out.push(`  ${paint(useColor, COLORS.red, "could not grade")}: ${r.error}`);
      out.push("");
      continue;
    }
    if (r.applicable === false) {
      out.push(`  ${paint(useColor, COLORS.dim, r.challenged
        ? "n/a — matched code was judged unrelated (verdict survived the adversarial challenge)"
        : "n/a — no code relevant to this checkpoint in the repo")}`);
      out.push("");
      continue;
    }
    const conf = typeof r.confidence === "number" ? r.confidence.toFixed(2) : r.confidence;
    out.push(`  ${levelTag(r.level, useColor)}  ${paint(useColor, COLORS.dim, `(confidence: ${conf}, via ${r.adapter})`)}`);
    if (r.rationale) out.push(`  ${paint(useColor, COLORS.dim, "why:")} ${r.rationale}`);
    if (r.gap) out.push(`  ${paint(useColor, COLORS.bold, "gap:")} ${r.gap}`);
    out.push("");
  }
  out.push(paint(useColor, COLORS.bold, "── goal_definition roll-up ──"));
  if (gateDemotion) {
    out.push(`  ${paint(useColor, COLORS.yellow, `⚠ gate demoted ${gateDemotion.from} → ${gateDemotion.to}:`)} ${gateDemotion.reason}. The ${gateDemotion.from} tier was NOT cleared — it was never assessed.`);
  }
  if (!rollup.conclusive) {
    out.push(`  ${paint(useColor, COLORS.yellow, "INCONCLUSIVE")} — nothing gradable was found here (every checkpoint N/A or errored). This is NOT a pass.`);
  } else {
    out.push(`  shippable (all ${gateTier} ≥ 6): ${rollup.shippable ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.red, "NO")}`);
    out.push(`  great (all ${gateTier} 9, rest ≥ 6): ${rollup.great ? paint(useColor, COLORS.green, "YES") : paint(useColor, COLORS.dim, "no")}`);
  }
  if (rollup.adapter_degraded) {
    out.push(`  ${paint(useColor, COLORS.yellow, "⚠ graded by the mock keyword baseline (no API key)")} — NOT the validated reasoning verifier. Do not trust this verdict for a ship decision.`);
  }
  if (blocking.length) {
    out.push(`  ${paint(useColor, COLORS.red, `blocking ${gateTier}:`)}`);
    for (const r of blocking) out.push(`    - ${r.id} (${r.level == null ? "ungraded" : "level " + r.level})`);
  }
  if (ungraded.length) out.push(`  ${paint(useColor, COLORS.yellow, "ungraded:")} ${ungraded.join(", ")}`);
  if (notApplicable.length) out.push(`  ${paint(useColor, COLORS.dim, `not applicable (${notApplicable.length}):`)} ${notApplicable.map((r) => r.id + (r.challenged ? " (challenged)" : "")).join(", ")}`);
  // Whole-domain omission is part of the verdict (computed once, shared with JSON/HTML).
  if (designSkipped.length) {
    out.push(`  ${paint(useColor, COLORS.yellow, `⚠ ${designSkipped.length} design checkpoint(s) NOT reviewed here:`)} ${designSkipped.join(", ")}`);
    out.push(`    ${paint(useColor, COLORS.dim, "design isn't reliably gradable from source, so verify skips it. For a design/a11y verdict — a portfolio's whole product — run `forespec design <url>` against the live page (or `verify --domain all` for a best-effort source read).")}`);
  }
  if (gaps && gaps.items.length) {
    out.push("");
    out.push(paint(useColor, COLORS.bold, "── foresight: gaps ahead ──"));
    out.push(`  ${paint(useColor, COLORS.dim, "required by this archetype, no code for it yet — surface early, fill deliberately:")}`);
    for (const it of gaps.items) {
      const tag = it.urgency === "now" ? paint(useColor, COLORS.yellow, "[now] ") : paint(useColor, COLORS.cyan, "[soon]");
      out.push("");
      out.push(`  ${tag} ${paint(useColor, COLORS.bold, it.headline)}  ${paint(useColor, COLORS.dim, `(${it.id}, ${it.severity})`)}`);
      if (it.why_your_archetype) out.push(`       ${paint(useColor, COLORS.dim, "why:")} ${it.why_your_archetype}`);
      if (it.what_good_looks_like) out.push(`       ${paint(useColor, COLORS.dim, "built right:")} ${it.what_good_looks_like}`);
    }
  }
  return out.join("\n");
}
