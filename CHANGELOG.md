# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/). Pre-1.0, minor bumps may include breaking changes.

## [Unreleased]

### Added
- **`forespec demo`** — a zero-setup, no-API-key scripted walkthrough of a verifier run on a
  bundled vulnerable-checkout example. Grounded in that code's real holes and rendered through
  the same code path as a live `verify`, it's the fastest way to see what the tool does (~20s).
  Honestly labelled `via demo`; the header/footer point to `forespec verify` for a live grade.
- Shared terminal renderer (`repo-verify/render-cli.mjs`) — `verify` and `demo` render a graded
  run through one source of truth, so the demo can never drift from real `verify` output.
- The bundled `vulnerable-checkout` example now ships in the package (so `demo`'s "bundled
  example" is literally present, and can be graded live with `forespec verify`).
- `forespec -v` / `--version` prints the installed version.
- CI workflow: self-test + schema validation on Node 18/20/22 for every push to `main`
  and every PR.
- Release workflow: publish to npm with provenance on a `v*` tag.
- `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.
- npm listing metadata (`repository`, `homepage`, `bugs`, `author`, `keywords`) and README
  status badges.

## [0.1.0] — first public release

The verifier-first core, validated end to end.

### Added
- **CLI** (`forespec`): `init` (archetype detection), `plan` (interrogate a feature before
  building), `verify` (grade the backbone; `--html` for a visual report), `design` (live-page
  design probe), `gate` (PR/CI gate), plus `detect` / `feedback` / `calibrate` / `proficiency`.
- **Five archetypes** composed from a shared checkpoint library: `ecommerce`, `saas`,
  `ai-app`, `baas`, `portfolio`.
- **Reasoning verifier** (`claude` adapter) with an adversarial N/A verdict, plus a
  deterministic keyword `mock` baseline for exercising the harness.
- **Validation**: 0 false-greens on 52 critical bad cases, rule-of-three 95% upper bound
  ≤ 2.9% on the ecommerce/universal corpus; the newer archetypes are first-pass validated
  (see [`VALIDATION-NOTES.md`](./VALIDATION-NOTES.md)).
- **PR gate** + drop-in GitHub Action (`action.yml`), and a `prepublishOnly` self-test gate.
- **Calibration store** with a physical pattern/instance wall.
- **License**: Business Source License 1.1 (converts to Apache 2.0 on the Change Date).

[Unreleased]: https://github.com/SteveWeed79/forespec/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SteveWeed79/forespec/releases/tag/v0.1.0
