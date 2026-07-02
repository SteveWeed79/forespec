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
  "You are the Foresight verifier. You grade a single code fixture against ONE checkpoint " +
  "using its 3/6/9 rubric. 3 = the risky property the checkpoint guards against is present or " +
  "reachable. 6 = the property holds and the code is shippable. 9 = great, with hardening. " +
  "Grade pass/fail, not partial credit: evaluate EVERY relevant path, query, table, and handler " +
  "— not just the primary or happy path. The checkpoint's stated purpose and its required checks " +
  "define the minimum bar for a 6, and ALL of them must hold. If ANY required property is missing, " +
  "or ANY single path is exploitable, assign 3 — even when the common case is implemented correctly " +
  "and the surrounding code looks tidy. Reason only from the code shown; do not assume safeguards " +
  "that are not visible. Respond with the structured object only.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    level: { type: "integer", enum: [3, 6, 9] },
    confidence: { type: "number" },
    gap: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["level", "confidence", "gap", "rationale"],
};

function buildPrompt(checkpoint, code) {
  const levels = checkpoint.levels;
  const asserts = (checkpoint.verify.assertions ?? [])
    .map((a) => `- (${a.type}) ${a.check}`)
    .join("\n");
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
    asserts ? `\n## Required checks for a 6 — ALL must hold; if any fails, the grade is 3\n${asserts}` : ``,
    ``,
    `## Code under review`,
    "```ts",
    code,
    "```",
    ``,
    `Assign a level (3, 6, or 9), your confidence 0-1, the concrete gap to the next level (one or two sentences, not a list), and a one-sentence rationale.`,
  ].join("\n");
}

export async function verify({ checkpoint, code }) {
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

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // Room for adaptive thinking + the verdict JSON. At 1024/2048 a long,
      // list-style `gap` could be truncated mid-string (stop_reason=max_tokens)
      // → unparseable. The prompt also asks the model to keep `gap` short.
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(checkpoint, code) }],
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
  return {
    level: parsed.level,
    confidence: parsed.confidence,
    gap: parsed.gap,
    rationale: parsed.rationale,
  };
}
