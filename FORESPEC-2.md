# Forespec — Build Companion for the Interrupted Solo Developer

*A planning + progress-tracking layer that sits on top of Claude Code. It forces
domain foresight before each feature, then verifies what actually got built against
that forespec — so the expensive discoveries (atomic checkout, data-model shape,
auth boundaries) surface BEFORE you build on top of them, not three months after.*

> **📍 Status — vision doc, superseded on sequencing.** This file holds the
> original architecture and a Claude-Code-centric v1 cut. The **authoritative,
> current build order is [`forespec.buildorder-2.md`](./forespec.buildorder-2.md)**,
> which supersedes **Part 2** and **Part 4** below. Two things changed and the
> later doc wins:
>
> 1. **Sequencing reversed.** Part 4 here builds planning-first (Interrogator →
>    Plan Engine → … → Verifier last). Build-order-2 builds the **Verifier first**
>    (Phases 0–1) to validate the pearl as cheaply as possible, makes
>    **calibration the spine** (Phase 2), and defers the Interrogator/Plan-Engine
>    "foresight ritual" to **Phase 4**.
> 2. **Tool-agnostic, not a plugin.** The engine talks to any model through an
>    adapter; Claude Code is the first consumer, not the host.
>
> Read **this** file for the *why*, the destination architecture, and the moat
> argument. Follow **build-order-2** for *what to build, in what order*. Where
> they disagree on sequence, build-order-2 governs.

---

## The Problem (in one example)

You ask Claude Code to build a checkout. You don't know to ask for an atomic stock
hold, so it doesn't add one. Months later, after Stripe is wired and taking real
money, the race condition bites. Now you're doing surgery on a live payment flow to
retrofit something that would have been trivial to design in on day one.

The failure isn't bad code. It's **foresight arriving too late**, when fixes are
expensive and risky instead of cheap and safe.

## The Core Insight

Claude Code answers the literal ask. Nothing in the moment forces it to stop and
interrogate the non-obvious requirements of a feature. Depth is *available* but not
*automatic* — and under time pressure (or on cheaper/faster paths) it biases even
harder toward "just answer it."

Forespec's job is **not** more horsepower. It's two things the model alone doesn't
reliably provide:

1. **A forced foresight ritual** — every feature gets interrogated before it's built,
   structurally, so it never gets skipped.
2. **A compounding pattern library** — each interrogation starts from "here's what bit
   people building this before," not a blank prompt. Patterns accumulate across
   features, then across projects, then (eventually) across users.

And the backbone that makes it real rather than a dead document:

3. **A live loop** — plan → build → verify built-vs-plan → warn/correct → continue.
   The foresight stays alive while you build, instead of being promised at the start
   and abandoned.

---

# PART 1 — THE BIG ARCHITECTURE (the destination)

```
┌─────────────────────────────────────────────────────────────┐
│  FORESPEC                                                     │
│                                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ INTERROGATOR │──▶│  PLAN ENGINE │──▶│  CHECKPOINTS      │  │
│  │ forced       │   │ ordered,     │   │ verifiable        │  │
│  │ foresight    │   │ gotcha-aware │   │ completion        │  │
│  │ pass         │   │ build plan   │   │ criteria          │  │
│  └──────┬───────┘   └──────────────┘   └────────┬─────────┘  │
│         │                                        │            │
│         │ draws from                             │ verified by│
│         ▼                                        ▼            │
│  ┌──────────────┐                       ┌──────────────────┐ │
│  │ PATTERN      │                       │  VERIFIER         │ │
│  │ LIBRARY      │◀──────────────────────│  reads real repo, │ │
│  │ (the moat)   │   new gotchas feed    │  diffs vs plan,   │ │
│  │              │   back into library   │  warns on drift   │ │
│  └──────────────┘                       └──────────────────┘ │
│                                                               │
│  Hands plans TO ───▶ Claude Code        Reads output FROM ◀── │
└─────────────────────────────────────────────────────────────┘
```

### The five components

**1. Interrogator — the forced foresight pass**
Takes "I want to build X." Refuses to just plan it. First interrogates: what does this
touch? What's the non-obvious requirement? What ordering prevents rework? What did this
break for others? Produces a structured understanding of the feature *before* any plan
exists. This is the ritual that can never be skipped — it's the spine.

**2. Plan Engine — ordered, gotcha-aware build plan**
Turns the interrogation into a sequenced plan where the dangerous/foundational pieces
come first (atomic hold before Stripe wiring, data-model shape before features built on
it). Each step is scoped small enough to understand and verify. Output is handed
straight to Claude Code.

**3. Checkpoints — verifiable completion criteria**
The unit of work is not "a plan," it's "a feature with checkable completion criteria."
Each gotcha becomes a concrete, verifiable checkpoint:
*"checkout must place an atomic hold on stock before creating the payment intent."*
Checkpoints are what make the loop real instead of decorative.

**4. Verifier — built-vs-plan reconciliation**
Reads the actual repo state (what Claude Code really produced) and reconciles it
against the checkpoints. Tells you what's missing, what drifted, what's unsafe to build
on yet. Two layers:
- **Reasoning layer** — Claude reasons over the code ("is there really an atomic hold
  here?"). Flexible, catches fuzzy things, costs a call, can be wrong.
- **Assertion layer** — concrete tests/assertions it helps you write. Deterministic,
  cheap, trustworthy, but only covers what's mechanically checkable.
Both, layered. (See v1 cut for which is the spine first.)

**5. Pattern Library — the compounding moat**
Every gotcha surfaced gets saved as a structured pattern. Critically, patterns separate
the **pattern** (transferable: "checkout features need atomic stock holds") from the
**instance** (never transferable: "KTXZ holds MTG singles for 10 min"). The pattern
travels across your projects; the instance never leaves the project. Later, patterns
can become a shared library others contribute to — but the architecture keeps
pattern/instance separation from day one so that future is clean and not creepy.

### The live loop (the backbone)
```
   ┌──────────────────────────────────────────────┐
   │                                                │
   ▼                                                │
 PLAN ──▶ hand to Claude Code ──▶ you build ──▶ VERIFY ──▶ warn/correct
   ▲                                                          │
   └──────────────────────────────────────────────────────────┘
          new gotchas discovered feed back into Pattern Library
```

---

# PART 2 — THE v1 CUT LINE (what you build THIS week)

> ⚠️ **Superseded by [`forespec.buildorder-2.md`](./forespec.buildorder-2.md)** for
> what ships first. This section's v1 starts with the Interrogator; the current
> plan ships the **Verifier** first (build-order-2 Phases 0–1). The "ship small,
> don't stall in the messy 60%" principle below still holds — only the first
> deliverable changed.

> The architecture above is the destination. The first thing you ship is ruthlessly
> small — because the failure mode for a no-sleep solo builder with a giant spec is
> abandoning it in the messy 60% middle. Forespec exists to prevent exactly that, so
> we will not scaffold it the way it warns against.

### v1 includes

- **Interrogator (manual trigger).** You type a feature. It runs the forced foresight
  pass and asks you the sharp questions / surfaces the non-obvious requirements.
- **Plan Engine.** Produces the ordered, gotcha-aware plan, dangerous pieces first.
- **Checkpoints written as concrete completion criteria** — not just prose. This is the
  seed that makes the loop possible. Even in v1 every gotcha is written as a verifiable
  checkpoint.
- **Verifier — MANUAL re-run.** You come back between counter sessions, point it at the
  repo, it checks the code against the checkpoints and tells you what's missing or
  drifted. No real-time file watching yet. You trigger it yourself — which fits your
  actual start-stop rhythm.
- **Pattern Library as a local JSON file.** Gotchas get saved as structured patterns
  with pattern/instance separation from line one. No accounts, no sharing, no server.
  Just the seed the moat grows from.

### v1 explicitly EXCLUDES (designed-for, not built-yet)

- Real-time repo watching / automatic drift detection (later upgrade)
- Accounts, auth, multi-user
- Shared / cross-user pattern library
- Any UI polish — CLI or the simplest possible interface is fine
- Cross-project pattern transfer (architecture supports it; v1 is single-project)

### The v1 spine decision (decide at the counter, before the repo)

Checkpoint verification = **reasoning layer is the spine for v1.** Reason: the highest-
value gotchas (atomic hold, auth boundary, data-model shape) are fuzzy and not always
mechanically checkable, so reasoning catches them first. The assertion layer bolts on
after as the cheap/deterministic backstop. Build the reasoning verifier first; design
the checkpoint format so assertions can attach to the same checkpoint later.

---

# PART 3 — SUGGESTED STACK

Matches what you already run, so nothing new to learn under time pressure.

- **Runtime:** Node + TypeScript (yes — but the tool is also a forcing function to
  learn the TS you already ship; eat your own dog food)
- **Works alongside:** Claude Code (hands it plans; reads its output from the repo)
- **Storage v1:** local JSON file for the pattern library
- **AI layer:** Claude API for interrogation, planning, and the reasoning verifier
- **Interface v1:** CLI first (fits counter-time; no UI to maintain)
- **Later:** MongoDB Atlas (patterns), Clerk (accounts), web UI, real-time watcher

---

# PART 4 — BUILD ORDER (so it ships, doesn't stall)

> ⚠️ **Superseded by [`forespec.buildorder-2.md`](./forespec.buildorder-2.md).**
> The order below is planning-first (Verifier last). The current plan inverts
> this: Verifier first, calibration as the spine, foresight ritual at Phase 4.
> Keep this list for the rationale of each component; take the *sequence* from
> build-order-2.

1. **Checkpoint format first.** Define the structured shape of a checkpoint
   (description, verifiable criterion, pattern-ref, instance-detail, status). Everything
   else hangs off this. Get it right and the whole thing has a spine.
2. **Interrogator.** "I want to build X" → forced foresight pass → structured feature
   understanding. Lean on Claude's reasoning; seed it with a handful of hand-written
   starter patterns (checkout, auth, data-model) so it isn't blank on day one.
3. **Plan Engine.** Interrogation → ordered plan, dangerous-first, each step small.
4. **Pattern Library (local JSON).** Persist gotchas as patterns with pattern/instance
   separation. Wire it so the Interrogator reads from it next time.
5. **Verifier (reasoning, manual trigger).** Point at repo → check code vs checkpoints
   → report missing/drifted. This closes the loop and is the moment it stops being a
   wrapper.
6. **Use it on KTXZ.** Run the colored-pips feature and the next real feature through
   it. The patterns you capture become the seed of the moat.

> After step 5 you have a real, usable, non-wrapper tool. Everything in Part 1 beyond
> this is upgrade, not blocker.

---

# PART 5 — THE HONEST MOAT CHECK

Why this isn't "just a prompt to plan carefully":

- A prompt **forgets**. The pattern library **compounds** — each feature and each
  project makes the next interrogation sharper.
- A prompt is **occasional and unstructured**. The ritual is **forced and structured** —
  it never gets skipped, which is the exact status-quo failure being fixed.
- A prompt **plans and walks away**. The verifier keeps foresight **live** — it checks
  what actually got built and warns before you build on top of a missing foundation.

The wrapper objection only holds if foresight stays occasional, unstructured, and
abandoned-after-planning. Forespec makes it constant, structured, and live. That's the
difference.

---

*Build the architecture big. Ship the v1 small. Use it on KTXZ tomorrow.*
