# The PR gate without a second API key

The plugin removed the API key locally: the coding agent you already pay for grades the repo.
CI was still the exception — `anthropics/claude-code-action` was documented for an
`ANTHROPIC_API_KEY`, so the gate asked for the one thing the plugin had just removed.

It doesn't have to. `claude setup-token` produces a long-lived OAuth token that authenticates
with a **Pro, Max, Team or Enterprise subscription**, and runs using it bill against that plan
rather than the API. So the whole product — plan, verify, and the PR gate — can run on the
subscription you already have.

## Setup

1. **Generate the token**, locally, from the account whose subscription should pay for CI:

   ```bash
   claude setup-token
   ```

2. **Store it** as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN`
   (*Settings → Secrets and variables → Actions → New repository secret*).

3. **Turn the workflow on** with a repository *variable* — `FORESPEC_AGENT_GATE` = `true`.
   The workflow is guarded on it so that adding the file doesn't start failing every PR before
   the secret exists.

4. **Copy** [`.github/workflows/forespec-gate-agent.yml`](../.github/workflows/forespec-gate-agent.yml)
   into your repository, and commit `forespec.config.json` (`forespec init`) so CI grades against
   the same archetype you do.

The gate is advisory by default — it comments and never blocks. Add `--fail` to the last step to
make it a blocking required check.

## How it works

Three steps, and the split between them is the point:

```bash
# 1. Which checkpoints does this diff touch? Grades nothing, needs no verifier.
forespec gate --base origin/main --list-touched > touched.json

# 2. The agent grades exactly those, and writes verdicts. (claude-code-action)

# 3. Deterministic: read the verdicts, apply the roll-up, comment, decide.
forespec gate --base origin/main --verdicts verdicts.json --comment
```

**The merge decision is not the model's.** The agent step produces verdicts and nothing else;
`forespec gate` reads them and decides pass/fail from the same roll-up rules the API path uses.
An agent that could both grade and decide could talk itself past its own gate — and the whole
value of a gate is that it is not persuadable.

Step 1 also means a PR that touches no backbone-relevant file skips the model entirely, so the
common case costs nothing.

## Security

A pull request branch is **attacker-controlled content**, more so than a repo you chose to audit.
Three things follow, all enforced in the workflow rather than left to good intentions:

- **The grader gets no shell.** `--allowedTools "Read,Grep,Glob,Write"` — it can read the diff and
  write its verdict file, and cannot execute anything it just read.
- **The prompt says the repository is data, not instructions**, and that anything in it addressing
  the grader is a finding rather than an order.
- **Fork PRs are skipped, explicitly.** GitHub withholds secrets from fork pull requests, so the
  agent step could not authenticate anyway; the job's `if` says so rather than letting it fail
  with an auth error that reads like a bug. Do **not** "fix" this by switching the trigger to
  `pull_request_target` — that runs with secrets against unreviewed code, which is the
  vulnerability this skip avoids.

The worst a hostile PR can do is corrupt its own grade, which a reviewer reading the comment
sees.

## Which gate should I run?

| | Agent gate (this page) | API gate (`action.yml`) |
|---|---|---|
| Auth | `CLAUDE_CODE_OAUTH_TOKEN` (subscription) | `ANTHROPIC_API_KEY` (metered) |
| Evidence | `file:line`, from navigating the repo | `file:line`, from a packed slice |
| Fork PRs | skipped (no secrets on forks) | skipped (same) |
| Shared across a team | one person's subscription pays | an org key, per the Claude Code docs |

For an organisation, Anthropic's own guidance is to use an API key rather than an OAuth token for
a shared secret, since the token is tied to the subscription of whoever ran `claude setup-token`.
Both gates produce the same comment through the same code, so this is a billing and ownership
choice, not a capability one.

## Limits

- **The agent path's measurement is on snippets and on 8 public repos**, not on PR diffs
  specifically — see [`VALIDATION-NOTES.md`](../VALIDATION-NOTES.md) and
  [`oss-audit-2026-09.md`](./oss-audit-2026-09.md). Grading a diff's touched checkpoints is the
  same contract over a narrower slice, but it has not been separately measured.
- **The model is whatever the action defaults to** unless you pin one with `--model` in
  `claude_args`. A different model is a different grader.
- Each run consumes GitHub Actions minutes regardless of which auth you use.
