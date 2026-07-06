# Forespec — Build Order

*Standalone, tool-agnostic engine. NOT a plugin. The engine owns its core; AI tools
(Claude Code included) are adapters that drive it, never the thing it lives inside.
Phases weave together - each one is usable on its own AND is a foundation the next
needs. No phase is throwaway scaffolding. No half measures: every phase ships real,
not a stub.*

---

## The non-negotiables (true from commit #1, not retrofitted)

- **Standalone engine.** Core reads a repo from a PATH and talks to a model through an
  adapter. Zero hard dependency on any single AI tool in the heart of it.
- **Pattern/instance wall, physical.** Shareable pattern data and never-leaves-the-project
  instance data live in separate stores from the first write. Not a later refactor.
- **Values at the top of the repo.** Person not sentence. Local core free and fully useful
  forever. Never gate value that's free to give. Honesty in every score - number always
  carries its basis.
- **Honesty mechanic.** Every score reports level + gap + residual + confidence. A score
  that can't state its basis doesn't ship.

---

## PHASE 0 — Skeleton that runs end-to-end on ONE checkpoint
*Goal: prove the whole pipeline works on a single real check before breadth. The walking
skeleton - thin but complete, touching every layer once.*

Build:
- Repo-source adapter: reads a target repo from a local path. (The seam that later also
  accepts a remote/agent-driven source - built as an adapter NOW, pointed at local disk.)
- Archetype loader: parses one archetype JSON, exposes its checkpoints.
- Model adapter: one interface, one implementation (whatever's simplest to wire). The
  thing that makes it tool-agnostic - swap the impl, not the engine.
- Verifier core: takes ONE backbone checkpoint (`ecommerce.checkout.atomic_stock_hold`), runs its
  reasoning question against the repo via the model adapter, returns level + gap + confidence.
- Output: prints the one score with its full basis.

Done when: it scores KTXZ's checkout for the atomic hold, on your real code, and the result
is true. **This is the validation gate. If the pearl isn't real, you find out HERE, cheap,
before building anything on top.** Do not proceed until this run tells the truth.

---

## PHASE 1 — Full backbone verifier
*Goal: the engine does its core job for real on the part I'm most confident in.*

Build:
- Run all 12 backbone checkpoints from the ecommerce archetype.
- Static assertion layer: the `type:static` checks that are mechanically verifiable
  (AST/file inspection) - deterministic backstop under the reasoning layer.
- Report: per-checkpoint level/gap/confidence + the goal_definition roll-up
  (shippable / great).

Done when: a single command gives you an honest, complete backbone read on KTXZ. At this
point the tool is ALREADY USEFUL to you, alone, with nothing else built. That's the test
that each phase stands on its own.

---

## PHASE 2 — Calibration store + passive learning
*Goal: turn "my invented weights/standards" into "earned on real work." The engine starts
getting better instead of staying static.*

Build:
- Local SQLite, pattern table + instance table physically separate (the wall, enforced).
- Every verify run writes a prediction record: score + signals + artifact fingerprint +
  stable checkpoint id + source/reliability tag.
- Passive action-detection: did the flagged region change in a later commit (acted /
  overridden / ignored).
- Recurrence heuristic: did a "fixed" region get re-flagged later.
- Proposed weight/threshold deltas surfaced for your review; you accept/reject; accepted
  deltas tune the archetype.

Done when: scores logged over a week of real KTXZ work produce your first review-and-accept
delta. The standard is now self-correcting. (Multi-user seam is DESIGNED here - reliability
tags, stable ids, pattern table shape - but no sync/pool machinery built.)

---

## PHASE 3 — Design dimension, computed signals only
*Goal: cover the blind spot, but only with the HONEST parts first.*

Build:
- The `confidence:established` design checkpoints: contrast/a11y, type-scale, responsive,
  spacing - the ones with real defensible thresholds.
- Runtime assertion layer via headless browser (Playwright) for contrast, tap-targets,
  overflow, computed font metrics.
- The instrumented scoring formula (weighted sub-signals -> composite + breakdown +
  residual) for these established signals.

Explicitly DEFERRED: saliency/complexity `model_scored` signals and the `taste_limited`
checkpoints. Those are EXPERIMENTS (Phase 6), not features. No half measures means not
shipping a number we can't yet stand behind - so they wait until calibration can test them.

Done when: the engine gives an honest design read on the measurable dimensions, carrying you
where you're weak with standards you don't have to author.

---

## PHASE 4 — The foresight ritual (plan-side, not just verify-side)
*Goal: move from "checks what got built" to "tells you what to build, in what order, before
you build it." Closes the loop from reactive to proactive.*

Build:
- Interrogator: given "I want to build X", select the relevant archetype + checkpoints,
  surface the non-obvious required properties BEFORE building (the atomic-hold, surfaced in
  week one not month three).
- Plan engine: ordered, gotcha-aware, dangerous/foundational pieces first, each step small.
- Output shaped to hand directly to whatever agent builds (Claude Code as first consumer).

Done when: you can ask Forespec what a feature needs before writing it, and it tells you the
thing you didn't know to ask. This is the piece that makes it a PARTNER, not a checker.

---

## PHASE 5 — Proficiency layer (self-facing)
*Goal: the tool adapts to WHO is using it - carries you on design, gets out of the way on
backbone. Person-aware, the core differentiator.*

Build:
- Per-domain proficiency estimate from accumulated behavior (reuses Phase 2 store - no new
  collection): correct-term-in-context, override-quality, stated-understanding vs measured
  reality. Asymmetric rule: precise language raises estimate, terse/plain NEVER lowers it.
- Tool adjusts explanation depth + push level per domain from the estimate.
- Hard boundary written in: self-facing only. Never silently becomes a dossier scored for
  others' eyes.

Done when: the tool explains design more and backbone less, to you, automatically. Now it's
person + engine, not one-size-fits-all.

---

## PHASE 6 — The deferred experiments + second archetype
*Goal: extend reach and test the unproven, now that calibration can actually validate them.*

Build (each gated behind calibration proving it correlates with reality):
- The `model_scored` design signals (saliency, complexity) - as experiments, validated
  against accumulated human/outcome data before being trusted.
- The `taste_limited` ceiling handling.
- A SECOND archetype (personal-site / portfolio - your stated next project type) - proves
  the engine generalizes beyond ecommerce, exercises the pattern/instance wall for real.

Done when: the engine works on more than one site type and the experimental signals have
earned trust or been honestly cut.

---

## PHASE 7 — Reach beyond your own machine
*Goal: only NOW, with a validated core, build the path to other users - the standalone
gateway / distribution. This is the OpenClaw-shaped shell, built LAST, around a proven pearl.*

Build (only after Phases 0-5 are real and validated on your work):
- Driving Forespec from other environments / other AI tools (the tool-agnostic promise
  delivered for real, not just architected).
- Multi-user calibration: turn on the seam - delta aggregation across users, pattern pool
  (pattern only, instance never leaves anyone's machine).
- Whatever distribution form fits (Cowork-driven), with the honest free/paid line: the local
  core is free and fully useful forever (never crippled to force an upgrade); paid plans fund
  the hosting and the ongoing work that keeps the standard trustworthy — priced fairly, no
  lock-in. Earn the subscription by being worth it, don't trap anyone into it.

Done when: someone who isn't you can use it on their repo, their code never reaching you,
and their data sharpens the shared standard without violating the wall.

---

## The weave (why this order, not arbitrary)

```
P0 walking skeleton ─┐
                     ├─ proves pipeline + validates pearl (the gate)
P1 full backbone ────┤  ← USABLE ALONE. real value, you, today.
                     │
P2 calibration ──────┤  ← makes every later score self-correcting
                     │     (everything after P2 feeds + is sharpened by it)
P3 design (honest) ──┤  ← covers the blind spot, measurable parts only
                     │
P4 foresight ritual ─┤  ← checker becomes PARTNER (proactive)
                     │
P5 proficiency ──────┤  ← partner becomes PERSON-AWARE (the differentiator)
                     │
P6 experiments+arch2 ┤  ← reach widens, unproven gets validated or cut
                     │
P7 other users ──────┘  ← the shell, LAST, around a proven core
```

Each phase ships real and stands alone. Each is the soil the next grows in. P2 is the spine
everything after it threads through. P7 - the part that looks like "the product" - is built
last, on validated ground, never first on faith.

No plugin. No half measures. No phase built on an unproven one. The pearl gets proven at P0;
the shell gets built at P7; everything between earns its place in order.
