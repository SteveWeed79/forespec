// Foresight "gaps ahead" layer — the foresight half of the promise.
//
// A pure DOWNSTREAM consumer of the verifier's already-computed results. It takes
// the checkpoints the archetype REQUIRES but for which the repo has no code yet
// (applicable === false, the flag-by-absence set) and surfaces them as
// forward-looking gaps, ordered by severity — so "you're building ecommerce but
// have no payment idempotency yet" shows up in week one instead of month three.
//
// Guarantees (the surgical contract):
//   - It NEVER changes a 3/6/9 grade and NEVER touches the shippable gate. Gaps
//     are advisory; a repo's pass/fail verdict is identical with or without them.
//   - selectGaps is deterministic (no model). The prose enrichment is optional:
//     with no API key, or on any API failure, it falls back to a template built
//     from the checkpoint's own why/levels — so it can never break a verify run.
//
//   selectGaps(results, checkpoints) -> [{ id, severity, checkpoint }]
//   adviseGaps({ gaps, archetype }) -> { source, items: [...] } | null

// Only critical/high absences are "gaps you'll need" — the backbone the archetype
// insists on. Medium/low absences are more likely genuinely out-of-scope, so they
// stay quiet N/A rather than nagging. severity is already set per-archetype.
const GAP_SEVERITIES = new Set(["critical", "high"]);
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export function selectGaps(results, checkpoints) {
  const byId = new Map(checkpoints.map((c) => [c.id, c]));
  return results
    .filter((r) => r.applicable === false && GAP_SEVERITIES.has(r.severity))
    .map((r) => ({ id: r.id, severity: r.severity, checkpoint: byId.get(r.id) }))
    .filter((g) => g.checkpoint)
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Urgency is a pure function of severity — critical absences want attention now,
// high can follow. No repo-maturity guesswork: git signals (commit count, age)
// proved unreliable in the tool's own runtime, where CI/sandbox checkouts are
// routinely shallow and history is truncated on arrival.
const urgencyFor = (severity) => (severity === "critical" ? "now" : "soon");

const SYSTEM =
  "You are Foresight's gap advisor. The checkpoints below are ones this project's archetype REQUIRES but that " +
  "have NO implementing code in the repo yet. Nothing is broken — something is ABSENT. The grade is not in " +
  "question; there is simply nothing here to grade. For each gap, tell the builder what the safeguard is, why " +
  "THEIR archetype needs it, and what 'built right' looks like when they add it. NEVER frame an absence as a live " +
  "vulnerability or a breach — it is a gap, not an exploit. Keep every field to one or two plain sentences. " +
  "Respond with the structured object only.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          headline: { type: "string" },
          why_your_archetype: { type: "string" },
          what_good_looks_like: { type: "string" },
        },
        required: ["id", "headline", "why_your_archetype", "what_good_looks_like"],
      },
    },
  },
  required: ["gaps"],
};

// Self-contained backoff (a copy, deliberately — gaps.mjs must not couple to the
// frozen grader adapter). Retries transient overload/5xx so a blip doesn't lose the
// advisory; on exhaustion the caller falls back to the template.
async function postWithRetry(url, opts, tries = 4) {
  const RETRYABLE = new Set([429, 500, 502, 503, 529]);
  let res, err;
  for (let i = 0; i < tries; i++) {
    try {
      res = await fetch(url, opts);
      if (!RETRYABLE.has(res.status)) return res;
    } catch (e) {
      err = e;
      res = null;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, Math.min(1500 * 2 ** i, 12000)));
  }
  if (res) return res;
  throw err ?? new Error("request failed after retries");
}

// Deterministic framing from the checkpoint's own definition. Always available —
// this is what ships when there is no API key and what backstops any model failure.
function templateItem(gap) {
  return {
    id: gap.id,
    severity: gap.severity,
    headline: `Not built yet — ${gap.checkpoint.title}`,
    why_your_archetype: gap.checkpoint.why ?? "",
    what_good_looks_like: gap.checkpoint.levels?.["6"] ?? "",
    urgency: urgencyFor(gap.severity),
  };
}

export async function adviseGaps({ gaps, archetype }) {
  if (!gaps || gaps.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";

  // No key → deterministic template framing, no network. Fully useful, just not prose-enriched.
  if (!apiKey || !model) {
    return { source: "template", items: gaps.map(templateItem) };
  }

  const user = [
    `Archetype: ${archetype}`,
    ``,
    `Required-but-absent checkpoints (each has NO implementing code in the repo yet):`,
    ...gaps.map((g) =>
      [
        `\n- id: ${g.id}  [severity: ${g.severity}]`,
        `  title: ${g.checkpoint.title}`,
        `  why it matters: ${g.checkpoint.why}`,
        `  what a passing (level 6) implementation looks like: ${g.checkpoint.levels?.["6"] ?? ""}`,
      ].join("\n"),
    ),
  ].join("\n");

  try {
    const res = await postWithRetry(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        // Headroom for adaptive thinking + the batched JSON; truncation already
        // degrades to the template, but 8192 keeps the enriched path from tripping.
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`gap advisor API ${res.status}`);
    const data = await res.json();
    const textBlock = (data.content ?? []).find((b) => b.type === "text");
    if (!textBlock) throw new Error("gap advisor: no text block");
    const parsed = JSON.parse(textBlock.text);

    // Keep the deterministic severity order of `gaps`; enrich each with the model's
    // prose where it gave any, template-fill the rest. Urgency is always
    // severity-derived, never model-assigned — so it can't drift.
    const byId = new Map();
    for (const o of parsed.gaps ?? []) if (!byId.has(o.id)) byId.set(o.id, o);
    const items = gaps.map((g) => {
      const p = byId.get(g.id);
      if (!p) return templateItem(g);
      return {
        id: g.id,
        severity: g.severity,
        headline: p.headline,
        why_your_archetype: p.why_your_archetype,
        what_good_looks_like: p.what_good_looks_like,
        urgency: urgencyFor(g.severity),
      };
    });
    return { source: "model", items };
  } catch {
    // Any failure in the enriched path → the deterministic template. A verify run
    // never fails, and never loses a gap, because the advisor stumbled.
    return { source: "template", items: gaps.map(templateItem) };
  }
}
