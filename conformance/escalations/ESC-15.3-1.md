---
test_ids:
  - XT-config-6
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change (Protected: `tools/`,
  the root `package.json`, `.github/workflows/ci.yml`) adds the lint as
  `tools/entry-scripts/entry-scripts.ts check [--root <dir>]`, run as the
  root script `entry-scripts:check` (itself `bun --no-env-file …`) in
  ci.yml's lint job next to `bun run lint`. An entry script is each `bun`
  command in a `scripts` value of the root `package.json`,
  `skeleton/package.json` and every `packages/*/package.json`: the value is
  split on `&&`, `||`, `;` and `|`, and a command whose first word is `bun`
  must carry `--no-env-file` before its subcommand or entry file, unless
  its subcommand is a package-manager one that runs no project code
  (`install`, `add`, `remove`, `update`, `pm`, `link`, `unlink`,
  `outdated`, `patch`, `publish`). `bun test`, `bun run <script>`,
  `bun --bun <bin>` and `bun <file>` all count, because each starts a Bun
  process that would autoload `.env`. A violation prints
  `entry-scripts: <file>: scripts.<name>: bun command lacks --no-env-file
  (FR-20.2)` and the check exits 1. The same change adds `--no-env-file`
  to the 49 root scripts listed in the evidence, so the check passes on
  `main`. Story 15.3 then writes XT-config-6 in
  `packages/config/tests/xaravel/env-autoload.test.ts`: the tool over a
  temp root whose `package.json` has a script lacking the flag fails
  naming it, one with the flag passes, and the repository passes.
  Option 2: XT-config-6 scans the root `package.json` itself from the
  config package's tests; it stays outside CI's lint, and it fails on
  `main` until the same Protected `package.json` change lands, so it
  needs this ruling anyway.
evidence: >-
  Checked on 2026-10-30 at 377bceeaca9ef68f2aba23cad47e8b1ebc3e15f3. No
  entry-script lint exists: `tools/` has no check that reads `scripts` for
  `--no-env-file`, and `tools/lint-rules/` holds only oxlint rules over
  TypeScript sources. The spine's Config row (ARCHITECTURE-SPINE.md, Stack
  table, "Config and env") requires "`--no-env-file` in every entry
  script", and AD-16 lists `tools/`, the root `package.json` and
  `.github/` as Protected Paths. Of the root `package.json`'s 77 scripts
  that run `bun`, 49 lack `--no-env-file` (jq over `.scripts`): test,
  typecheck, lint, scaffold, scaffold:check, scaffold:table, graph:check,
  protected-paths:codeowners, ownership:check, escalations:check,
  ruleset:verify, ruleset:apply, ruleset:identity, workflows:check,
  release:stamp, release:check, release:authority, upstream:sync,
  upstream:check, oracle:check, oracle:tag, oracle:lock,
  oracle:verify-image, oracle:build, oracle:extract, oracle:fixtures,
  oracle:verify-fixtures, oracle:story, oracle:recheck,
  oracle:api-surface, scan:facades, scan:singletons, scan:closures,
  scan:div12, scan:test-api, assert:coverage, mockery:coverage,
  component-map:check, inventory, inventory:cross-check, baseline,
  pin:bump, expectations:init, expectations:check, expectations:reasons,
  ratchet, xt:consequences, bots, bench. So a lint over them fails on
  `main` today. No `packages/*/package.json` has a `scripts` field, and
  `skeleton/package.json` has none either. Separately, `skeleton/` has no
  `bunfig.toml`, which the same Config row requires (`env = false`); that
  is the Skeleton's Story's, and this Escalation does not ask for it. The
  root `bunfig.toml` already sets `env = false` at the top level, so the
  root scripts do not autoload `.env` today; XT-config-5 shows either
  control alone suffices. The lint guards the second control.
---

# ESC-15.3-1: the entry-script lint needs Protected Paths

Story 15.3's acceptance criterion for XT-config-6 is that the entry-script lint fails any entry script lacking `--no-env-file`. No such lint exists, and writing one means adding a check under `tools/`, a root `package.json` script and a CI step, all Protected (AD-16). The lint would also fail on `main` today: 49 of the root `package.json`'s 77 `bun` scripts lack the flag, and fixing them is a Protected change too.

Option 1 adds `tools/entry-scripts/entry-scripts.ts` with the definition of an entry script above, runs it in ci.yml's lint job, and adds the flag to the 49 scripts in the same change; Story 15.3 then writes XT-config-6 against the tool. Option 2 puts the scan in the config package's tests, outside CI's lint, and still needs the `package.json` change.

XT-config-5 (Bun's autoload neutralised) does not depend on this ruling and is done. Under the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md`, this `protected-path` Escalation waits for the second key.
