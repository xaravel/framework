---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "cf9e2767e553d7ffd37cb53c9b937a6ff01ae395346887824a7df6bee432f649"
---

# ESC-15.3-1: approved, option 1 (an entry-script check: every `bun` entry script carries `--no-env-file`)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation. The monitor builds it as an Infrastructure change in its own PR, because `tools/`, the root `package.json` and `.github/` are Protected.

- `tools/entry-scripts/entry-scripts.ts check [--root <dir>]`, run as the root script `entry-scripts:check` in CI's lint job. It reads the `scripts` of the root `package.json`, `skeleton/package.json` and every `packages/*/package.json`, splits each value on `&&`, `||`, `;` and `|`, and fails a `bun` command that lacks `--no-env-file` before its subcommand or entry file, unless the subcommand is a package-manager one that runs no project code. A violation prints `entry-scripts: <file>: scripts.<name>: bun command lacks --no-env-file (FR-20.2)`.
- The same change adds `--no-env-file` to every root script that lacks it (49 at the time of the Escalation), so the check passes on `main`.
- Story 15.3 then writes XT-config-6 over the tool.
