---
description: Grade this repo's backbone against its Forespec archetype — no API key, runs on your subscription
argument-hint: "[repo path] [--domain backbone|design|all]"
allowed-tools: [Read, Grep, Glob, Bash, Write, Agent]
---

Grade the repo against its Forespec archetype and report what is and is not shippable.

Arguments (may be empty): $ARGUMENTS

## Steps

1. **Resolve the archetype.** Look for `forespec.config.json` in the target repo (default:
   the current directory). If it is missing, run `forespec init` first — it detects the
   archetype from dependency and path metadata only, never from source, and writes the
   config. Tell the user what it detected and move on; do not stop to ask.

2. **Get the standard.**
   ```bash
   forespec checkpoints --repo <repo> --domain <domain>
   ```
   Default `--domain backbone`. Write the output to a temp file so the verifier can read
   it without re-running. If `forespec` is not on PATH, use
   `node "${CLAUDE_PLUGIN_ROOT}/bin/forespec.mjs"` instead — same arguments.

3. **Grade.** Launch the `forespec-verifier` subagent with the checkpoints file and the repo
   path, and have it write a verdict file. Keeping this in a subagent matters: grading 20+
   checkpoints means reading a lot of code, and it should not crowd out the conversation
   you were having. If the subagent is unavailable, grade inline following
   `agents/forespec-verifier.md` — the contract there is the calibrated one, so do not
   improvise a different bar.

4. **Roll it up.**
   ```bash
   forespec verify <repo> --verdicts <verdict-file>
   ```
   This is what produces the goal-definition roll-up, the "required but not built yet" gaps
   report, the deltas against the last run, and the calibration store write. Add `--html`
   if the user wants a report to open in a browser.

5. **Report.** Lead with the roll-up — shippable yes/no — then the blocking criticals, each
   with its `file:line` and the one-line gap. Then stop. Do not start fixing anything unless
   the user asks; offer it as a next step instead.

## Notes

- This runs on the user's existing Claude Code subscription. There is no API key to set and
  no metered cost. If you find yourself telling the user to set `ANTHROPIC_API_KEY`, you have
  taken the wrong path — that is the CI/standalone route, not this one.
- Design checkpoints are excluded by default because design is not reliably gradable from
  source. The roll-up discloses the skip. For a real design verdict the user runs
  `forespec design <url>` against the live page.
- The verdict is about *this archetype's backbone*, not everything that could be wrong. Say
  so if the user reads it as a general code review.
