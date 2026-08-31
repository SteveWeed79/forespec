---
description: Interrogate a feature before you build it — surface what this kind of app requires, not just what you asked for
argument-hint: "<feature you're about to build>"
allowed-tools: [Read, Grep, Glob, Bash]
---

Surface the non-obvious requirements this feature carries **before** any of it gets written.

Feature: $ARGUMENTS

## Steps

1. **Get the checkpoints for this feature.**
   ```bash
   forespec plan "$ARGUMENTS" --json
   ```
   (or `node "${CLAUDE_PLUGIN_ROOT}/bin/forespec.mjs" plan "$ARGUMENTS" --json`). Each entry
   carries `matched` — true when it is directly relevant to what the user described, false
   when it is backbone the archetype requires regardless.

   If there is no `forespec.config.json`, run `forespec init` first (metadata only, never
   source). For an empty repo, `forespec start "<what you're building>"` is the on-ramp.

2. **Check what already holds.** For each checkpoint, grep the repo before you say anything
   about it. A requirement the user already satisfied is noise, and a plan full of noise
   does not get read. This is the step that makes the plugin worth more than the raw CLI
   output: the CLI cannot tell what is already there.

3. **Report the short version.** Lead with the `matched` checkpoints — the ones this feature
   actually turns on. For each:
   - the **decide-first question** (the `reasoning` field) — this is the point of the whole
     exercise, so put it first, not last
   - what level 6 requires, in one line
   - the acceptance criteria, as a checklist
   - **whether the repo already satisfies it**, with `file:line` if so

   Then, in a single tight section, name the unmatched backbone checkpoints that this
   feature *touches* — and only those. Do not print the archetype's full backbone; the user
   asked about one feature.

4. **Offer the spec.** Ask whether to write it to a file the user's coding agent can build
   against (`forespec plan "<feature>" --out <file>` writes the full version), or whether to
   start building against it now, dangerous pieces first.

## Notes

- The order is deliberate: most-foundational first. An atomic stock hold has to exist before
  the payment intent that depends on it, so build in the order given rather than the order
  that feels natural.
- Keep it tight. The failure mode here is a wall of text nobody reads — if there are more
  than three or four things the user actually has to decide, say which one to decide first.
