// Agent-CLI verifier adapter — measures the AGENT path against the labelled corpus.
//
// The plugin made a coding agent the default verifier, which moved most users onto a grader
// carrying no number. VALIDATION-NOTES' "0 false-greens on 52 critical bad cases" describes
// the API adapter. This adapter exists so the agent path can be held to the same corpus and
// the same gate, instead of inheriting a claim it never earned.
//
// It drives the local `claude` CLI headlessly (`claude -p`), so it runs on the user's existing
// subscription — the same runtime the plugin uses, not an API-key stand-in.
//
// WHAT THIS MEASURES, PRECISELY: the grading CONTRACT, executed by a real Claude Code session.
// Fixtures are snippets, so the agent's actual advantage in the field — grep, read, following
// an import into the middleware that supposedly verifies the signature — is NOT exercised here.
// That advantage can only be measured on real repositories. This number is therefore a floor
// on the agent path, not a ceiling, and must never be reported as "the plugin scores X on real
// code". It answers one question: does the contract hold the calibrated bar?
//
// The system prompt is `library/grading-contract.md`, read from disk verbatim — the same file
// the plugin's subagent reads before grading. Paraphrasing it here would measure a copy of the
// product instead of the product.
//
//   ANTHROPIC_MODEL       optional — pins the model (default: the CLI's own default)
//   FORESPEC_CLAUDE_BIN   optional — path to the `claude` binary (default: "claude")
//   FORESPEC_AGENT_TIMEOUT_MS  optional — per-case timeout (default: 180000)
//
// Implements the adapter interface: verify({ checkpoint, code }) -> { applicable, level, confidence, gap, rationale, evidence }

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const name = "agent-cli";

const here = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(here, "..", "..", "library", "grading-contract.md");

// Read once. A contract that changed mid-run would make the run's number meaningless.
const CONTRACT = readFileSync(CONTRACT_PATH, "utf8");

const SYSTEM = `${CONTRACT}

---

## This run

You are grading a single code fixture against ONE checkpoint, in a non-interactive harness.
You have no tools and no repository: grade only the code in the message, and where the contract
says to go look at something you cannot reach, apply the rule for code you cannot see.

Reply with a single JSON object and nothing else — no prose, no markdown fence, no preamble:
{"applicable":bool,"level":3|6|9,"confidence":0-1,"gap":string,"rationale":string,"evidence":[string]}
The fixture is one file, so cite evidence as "<line>" or "fixture:<line>".`;

function buildPrompt(checkpoint, code) {
  const levels = checkpoint.levels;
  const A = checkpoint.verify.assertions ?? [];
  const staticAsserts = A.filter((a) => a.type === "static" || !a.type).map((a) => `- ${a.check}`).join("\n");
  const testAsserts = A.filter((a) => a.type === "test" || a.type === "runtime").map((a) => `- ${a.check}`).join("\n");
  // Deliberately mirrors the claude adapter's prompt shape. The two numbers are only
  // comparable if the checkpoint is presented the same way; the grader is the variable
  // under test, so nothing else may differ.
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
    code.split("\n").map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join("\n"),
    "```",
    ``,
    `Grade it. JSON object only.`,
  ].join("\n");
}

function spawnClaude(prompt) {
  const bin = process.env.FORESPEC_CLAUDE_BIN ?? "claude";
  const args = ["-p", "--system-prompt", SYSTEM, "--tools", "", "--output-format", "json"];
  if (process.env.ANTHROPIC_MODEL) args.push("--model", process.env.ANTHROPIC_MODEL);
  const timeoutMs = Number(process.env.FORESPEC_AGENT_TIMEOUT_MS ?? 180_000);

  return new Promise((resolve, reject) => {
    // The prompt goes on stdin, not argv: a fixture can exceed the platform arg limit, and a
    // truncated prompt would silently become a different (easier) case.
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`claude timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`could not run "${bin}": ${e.message}`)); });
    child.on("close", (codeNum) => {
      clearTimeout(timer);
      if (codeNum !== 0) return reject(new Error(`claude exited ${codeNum}: ${err.slice(0, 300)}`));
      resolve(out);
    });
    child.stdin.end(prompt);
  });
}

/**
 * Retry a transient CLI failure — the process failing to run, not the model failing to grade.
 *
 * Concurrent `claude -p` invocations share session and config state and occasionally lose a
 * race, exiting non-zero with an empty stderr. In the first full corpus run that produced 9
 * ERROR rows out of 133; every one graded correctly on a sequential retry, so they were lost
 * runs rather than dodged cases. Left unretried they shrink the denominator the false-green
 * rate is computed over, which quietly flatters the result.
 *
 * Only the spawn is retried. A reply that parses into an invalid verdict is NOT retried —
 * that is the grader failing, and it must stay fail-closed rather than being rolled again
 * until it produces something acceptable.
 */
async function runClaude(prompt, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await spawnClaude(prompt);
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i + Math.random() * 500));
    }
  }
  throw lastErr;
}

/** Pull the verdict object out of the CLI envelope, tolerating a fenced or prose-wrapped reply. */
export function parseVerdict(raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error(`could not parse the claude CLI envelope: ${raw.slice(0, 200)}`);
  }
  if (envelope.is_error) throw new Error(`claude reported an error: ${String(envelope.result).slice(0, 200)}`);
  const text = typeof envelope.result === "string" ? envelope.result : "";
  const body = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Last resort: the outermost {...} in the reply. Never a regex for the fields themselves —
    // a half-scraped verdict is a made-up grade.
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`no JSON verdict in reply: ${body.slice(0, 200)}`);
    try { parsed = JSON.parse(m[0]); } catch { throw new Error(`could not parse verdict JSON: ${body.slice(0, 200)}`); }
  }

  // Fail CLOSED, exactly as the claude adapter does: an invalid verdict errors the case rather
  // than entering the metrics as a number. Scoring a malformed reply would flatter the grader.
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
    level: applicable ? parsed.level : null,
    confidence: conf,
    gap: parsed.gap,
    rationale: parsed.rationale,
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((e) => typeof e === "string") : [],
  };
}

export async function verify({ checkpoint, code }) {
  return parseVerdict(await runClaude(buildPrompt(checkpoint, code)));
}
