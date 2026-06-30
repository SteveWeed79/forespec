# Setup — running Foresight on your machine (Windows)

First time with a tool like this? Good — this is written for that. Copy/paste in
order; nothing here is advanced. The free steps (1–4) need no API key.

## 0. Confirm Node is installed ✅

In a terminal (PowerShell), run:

```powershell
node --version
```

You should see a number like `v20.x`. (You told me it's installed — this just confirms.)

## 1. Get the code onto your PC

Easiest path, no terminal git — **GitHub Desktop**:

1. Install GitHub Desktop from <https://desktop.github.com> and sign in.
2. **File → Clone repository →** pick `steveweed79/glowing-barnacle` → **Clone**.
3. These files currently live on a branch until the pull request is merged. In
   GitHub Desktop, click **Current Branch** and pick `claude/happy-tesla-upr9rt`.
   *(Or merge the PR into `main` first, then you can stay on `main`.)*
4. Note the folder it cloned into (e.g. `Documents\GitHub\glowing-barnacle`).

*(Terminal alternative if you have git: `git clone <repo-url>` then
`git switch claude/happy-tesla-upr9rt`.)*

## 2. Open a terminal in the project folder

In GitHub Desktop: **Repository → Open in Command Prompt / PowerShell**. Or open
PowerShell yourself and `cd` into the folder from step 1.

## 3. Install (one-time)

```powershell
npm install
```

There are no external dependencies yet, so this is quick — it just sets up the
project so the short `npm run` commands below work.

## 4. Run the free checks (no API key)

```powershell
npm run check    # validates the archetype files (structure + invariants)
npm run eval     # runs the verifier-accuracy harness with the no-cost mock baseline
```

`npm run eval` prints a table and an accuracy / false-green summary. If you see
that, everything works on your machine — before spending a cent.

## 5. (When ready) the real verifier

This is the one that calls Claude, so it needs an Anthropic API key.

**a. Get a key.** Go to <https://console.anthropic.com> → sign in → **API keys**
→ **Create key** → copy it (it starts with `sk-`). Under **Billing**, add a few
dollars of credit. A full eval run is ~12 small requests — pennies.

**b. Set the key for this terminal session** (PowerShell):

```powershell
$env:ANTHROPIC_API_KEY = "sk-paste-your-key-here"
$env:ANTHROPIC_MODEL   = "<a current Claude model id>"   # see https://platform.claude.com/docs/en/about-claude/models
```

**c. Run it:**

```powershell
npm run eval:claude
```

This writes `verifier-eval/report.json` and prints the scores. The number that
matters most is the **false-green rate** — how often the verifier calls a
known-bad implementation "shippable." Lower is better; that's the trust metric.

> **Security:** never paste your key into a file or commit it. The `$env:`
> variables above vanish when you close the terminal — that's intentional and
> safe. (`.env` files are git-ignored if you ever choose to use one.)

## Commands at a glance

| command | what it does | needs API key? |
|---|---|---|
| `npm run check` | validate the archetype files | no |
| `npm run eval` | accuracy harness, mock baseline | no |
| `npm run eval:claude` | accuracy harness, real verifier | yes |

## Troubleshooting (Windows)

- **`node is not recognized`** — close and reopen the terminal. If still missing,
  reinstall Node (LTS) from <https://nodejs.org> and reopen.
- **`running scripts is disabled on this system`** (PowerShell blocking `npm`) —
  run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and answer `Y`. This
  is the standard, safe fix and only affects your user account.
- **`ANTHROPIC_MODEL is not set`** — you opened a fresh terminal; the `$env:`
  variables only last for that session. Re-run step 5b (or use `setx` to persist
  them across sessions).
