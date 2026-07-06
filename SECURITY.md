# Security Policy

Foresight is a tool for finding security and correctness problems, so it holds itself
to the same standard it grades others against.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's **[Report a vulnerability](https://github.com/SteveWeed79/foresight-cli/security/advisories/new)**
flow (the *Security* tab → *Report a vulnerability*). That opens a private advisory only
the maintainers can see.

Include, where you can:

- what the issue is and where in the code it lives,
- a minimal way to reproduce it,
- the impact you think it has.

You'll get an acknowledgement within a few days. We'll work the fix privately, credit you
(unless you'd rather stay anonymous), and publish an advisory once a fixed version is out.

## Scope

The engine reads target repositories and, with the `claude` adapter, sends selected code
to the configured model API. Two properties are load-bearing and in-scope for reports:

- **The pattern/instance wall.** Never-leaves-the-project instance data (file paths,
  project specifics) must stay separate from shareable pattern data. A leak across that
  wall is a security bug.
- **Secret handling.** `ANTHROPIC_API_KEY` and any target-repo secrets must never be
  logged, committed, or written into the calibration store. A path that does is a bug.

## Supported versions

Pre-1.0: only the latest published version receives fixes. Once 1.0 ships this section will
name a support window.
