// Claude verifier adapter — the real reasoning verifier under test.
//
// Sends the checkpoint's reasoning question + level rubric + the fixture code to
// a Claude model and asks for a structured verdict. Zero dependencies (uses the
// global fetch in Node 18+). Configuration comes from the environment so no
// model id or key is baked into the repo:
//
//   ANTHROPIC_API_KEY   required — your API key
//   ANTHROPIC_MODEL     required — a current Claude model id
//                       (see https://platform.claude.com/docs/en/about-claude/models)
//   ANTHROPIC_BASE_URL  optional — defaults to https://api.anthropic.com
//
// Implements the adapter interface: verify({ checkpoint, code }) -> { level, confidence, gap, rationale }

export const name = "claude";

const SYSTEM =
  "You are the Forespec verifier. You grade a single code fixture against ONE checkpoint " +
  "using its 3/6/9 rubric. 3 = the risky property the checkpoint guards against is present or " +
  "reachable in the code shown. 6 = the property holds and the code is shippable. 9 = great, with " +
  "hardening (extra tests, logging, replay/timing defenses). Grade ONLY this checkpoint's property " +
  "— do not require concerns that belong to other checkpoints. Evaluate every relevant path, query, " +
  "table, and handler for THIS property, not just the happy path: if a required CODE property is " +
  "missing, or the guarded risk is reachable through ANY path in the code shown, assign 3 even if the " +
  "common case looks correct. But do NOT drop below 6 for missing tests, logging, hardening, or other " +
  "level-9 polish — the fixture is an implementation snippet, not a full codebase or test suite, so the " +
  "absence of a test or of hardening is not itself a failure. If the core property holds in the code " +
  "shown and the guarded risk is not reachable, it is at least a 6. Reason only from the code shown; do " +
  "not assume safeguards that are not visible, and do not penalize the mere absence of a test. " +
  "APPLICABILITY: first decide whether this checkpoint even applies to the code shown. It applies only if the " +
  "subject it guards (payments, webhooks, tenant isolation, file uploads, credential storage, etc.) is actually " +
  "present in the code. Set applicable=false ONLY when that subject is entirely absent — there is no such feature " +
  "here to grade at all. NEVER use applicable=false to dodge a hard call: if the subject IS present but a safeguard " +
  "is missing or the code is exploitable, that is applicable=true with level 3, a real problem — not N/A. If you are " +
  "unsure whether the subject is present, treat it as present and grade it. Respond with the structured object only.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    applicable: { type: "boolean" },
    level: { type: "integer", enum: [3, 6, 9] },
    confidence: { type: "number" },
    gap: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["applicable", "level", "confidence", "gap", "rationale"],
};

// Prepended when a first-pass N/A is being challenged: the code was selected BECAUSE it
// matched this checkpoint's keywords, so "not applicable" must be justified, not asserted.
const CHALLENGE_PREFIX =
  "CHALLENGE: a previous pass claimed this checkpoint does NOT apply to this code. That claim is under " +
  "challenge. The code below was selected precisely because it matched this checkpoint's subject keywords, " +
  "so the subject is very likely present. Return applicable=false ONLY if you can name the specific reason " +
  "the matched code is unrelated to this checkpoint (incidental keyword overlap). Otherwise the subject IS " +
  "present — grade it, and bias strongly toward grading rather than dismissing.\n\n";

function buildPrompt(checkpoint, code) {
  const levels = checkpoint.levels;
  const A = checkpoint.verify.assertions ?? [];
  const staticAsserts = A.filter((a) => a.type === "static" || !a.type).map((a) => `- ${a.check}`).join("\n");
  const testAsserts = A.filter((a) => a.type === "test" || a.type === "runtime").map((a) => `- ${a.check}`).join("\n");
  return [
    `# Checkpoint: ${checkpoint.id} — ${checkpoint.title}`,
    `Why it matters: ${checkpoint.why}`,
    ``,
    `## Levels`,
    `3: ${levels["3"]}`,
    `6: ${levels["6"]}`,
    `9: ${levels["9"]}`,
    ``,
    `## Reasoning question`,
    checkpoint.verify.reasoning,
    staticAsserts ? `\n## Required code properties for a 6 — ALL must hold in the code shown; if any is missing or violated, the grade is 3\n${staticAsserts}` : ``,
    testAsserts ? `\n## Level-9 hardening only (NOT required for a 6) — a present test raises toward 9; an ABSENT test never lowers the grade, and this snippet may contain no tests at all\n${testAsserts}` : ``,
    ``,
    `## Code under review`,
    "```ts",
    code,
    "```",
    ``,
    `First set "applicable": is this checkpoint's subject present in the code above at all? If the feature it guards simply does not exist here, set applicable=false (the level is then ignored). If the subject IS present — even if unsafe — set applicable=true and grade it; never use applicable=false to avoid flagging a real problem. Then assign a level (3, 6, or 9), your confidence 0-1, the concrete gap to the next level (one or two sentences, not a list), and a one-sentence rationale.`,
  ].join("\n");
}

// Retry transient overload / rate-limit / 5xx (e.g. a 529 "Overloaded" during a
// long eval run) so a single blip doesn't error a whole fixture. Zero-dep backoff.
async function postWithRetry(url, opts, tries = 5) {
  const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);
  let res, err;
  for (let i = 0; i < tries; i++) {
    try {
      res = await fetch(url, opts);
      if (!RETRYABLE.has(res.status)) return res;
    } catch (e) {
      err = e;
      res = null;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, Math.min(1500 * 2 ** i, 20000)));
  }
  if (res) return res;
  throw err ?? new Error("request failed after retries");
}

export async function verify({ checkpoint, code, challenge = false }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!model) {
    throw new Error(
      "ANTHROPIC_MODEL is not set — set it to a current Claude model id " +
        "(see https://platform.claude.com/docs/en/about-claude/models)",
    );
  }

  const res = await postWithRetry(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // Room for adaptive thinking + the verdict JSON. 4096 was occasionally
      // exhausted by thinking on a big repo's checkpoint before the JSON was
      // emitted (stop_reason=max_tokens → no text block); 8192 gives headroom.
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: (challenge ? CHALLENGE_PREFIX : "") + buildPrompt(checkpoint, code) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error(`model refused: ${data.stop_details?.category ?? "unknown"}`);
  }
  const textBlock = (data.content ?? []).find((b) => b.type === "text");
  if (!textBlock) throw new Error(`no text block in response (stop_reason=${data.stop_reason})`);

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(`could not parse verdict JSON: ${textBlock.text.slice(0, 200)}`);
  }
  // Fail CLOSED on a malformed verdict: the schema layer can't enforce enum/bounds on every
  // gateway, and a "passing" grade with no stated basis violates the honesty mechanic (a
  // score that can't state its basis doesn't ship). An invalid verdict errors the checkpoint
  // — it becomes ungraded and blocks — rather than slipping into the gate as a number.
  const applicable = parsed.applicable !== false;
  if (applicable && ![3, 6, 9].includes(parsed.level)) {
    throw new Error(`invalid verdict: level=${JSON.stringify(parsed.level)} (must be 3|6|9)`);
  }
  if (applicable && parsed.level >= 6 && !(typeof parsed.rationale === "string" && parsed.rationale.trim())) {
    throw new Error("invalid verdict: a passing level with no rationale (no stated basis)");
  }
  const conf = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : parsed.confidence;
  return {
    applicable: parsed.applicable,
    // When the checkpoint's subject is absent, the level is meaningless — null it
    // so consumers treat it as N/A (not-assessed), never as a passing or failing grade.
    level: applicable ? parsed.level : null,
    confidence: conf,
    gap: parsed.gap,
    rationale: parsed.rationale,
  };
}
