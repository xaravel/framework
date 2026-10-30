---
title: "Story 15.3: Bun's `.env` autoload neutralised"
type: 'feature'
created: '2026-10-30'
status: 'blocked'
baseline_revision: '377bceeaca9ef68f2aba23cad47e8b1ebc3e15f3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/docs/ops/api-surface.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** FR-20.2 says Bun's own `.env` autoload never changes a configuration value, and the spine's Config row puts that on `env = false` in the root and Skeleton `bunfig.toml` plus `--no-env-file` in every entry script. No test shows it yet. No entry-script lint exists, and as the last Story of Epic 15 this Story also carries the Epic-close checks. Of those, `api-surface:gate config` fails on 48 `extra` classes, the ported phpdotenv, PhpOption and ResultType classes, which only Protected `additions.jsonl` lines can explain.

**Approach:** XT-config-5 (FR-20.2) runs a fixture app as a child Bun process and shows that `process.env` holds none of its env files' values under the root `bunfig.toml` and `--no-env-file`, and that it holds them only once Xaravel's phpdotenv loader runs. A control run without either shows that the fixture would otherwise be read. XT-config-6 (the entry-script lint) and XT-config-7 (Epic close) need Protected Paths, `tools/` and the root `package.json` for the lint and `conformance/api-surface/additions.jsonl` for the gate. They are raised as `protected-path` Escalations ESC-15.3-1 and ESC-15.3-2, and under the MAINT ruling's 2026-10-30 amendment they wait for the second key.

## Boundaries & Constraints

**Always:** Edit only `packages/config/**` and this Story's Escalations. Spawn the child with `process.execPath` and an explicit env (the parent's, without `BUN_OPTIONS` and `NODE_OPTIONS`, with `NODE_ENV=production` so Bun's rules read all three files). Write the fixture in a temp directory removed in `finally`, with the root `bunfig.toml` read from the repository. Use `Assert` from `@xaravel/assert` and `xaravelTest`, and assert per case.

**Never:** No edit to `bunfig.toml`, `package.json`, `tools/`, `conformance/api-surface/**` or `.oxlintrc.json`. Do not write XT-config-6 or XT-config-7, or a stand-in for either, before their Escalations are ruled. Do not select an env file (`.env.<APP_ENV>`, Epic 51), and do not add `env()` (Epic 20).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Control | no `bunfig.toml`, no flag, `NODE_ENV=production` | the `.env`, `.env.local` and `.env.production` keys are set (`.env.local` wins on a shared key) | none |
| Neutralised | root `bunfig.toml` and `--no-env-file` | none of the fixture keys is in `process.env` before the loader runs | none |
| Loader | the same, then `Dotenv::createUnsafeImmutable(dir)->load()` | `.env`'s keys are in `process.env` and `getenv`, while the `.env.local` and `.env.production` keys stay absent | none |
| Real env wins | `SHARED=real` in the child's env | `SHARED` stays `real` after the immutable load | none |

</intent-contract>

## Code Map

- `bunfig.toml` -- the Protected root config, `env = false` at the top level. Read it, never edit it.
- `packages/config/src/Dotenv/Dotenv.ts:96` -- `createUnsafeImmutable`, which includes the putenv adapter, so the loaded values reach `process.env`.
- `packages/config/tests/xaravel/dotenv.test.ts` -- XT conventions (header comment with the F-10 reason, `REPO`, temp dirs, `finally`); XT-config-3 and XT-config-4 live here.
- `packages/collections/tests/xaravel/collections.test.ts:2140-2155` -- the pattern for spawning a child entry script with `Bun.spawnSync([process.execPath, "--no-env-file", …], { cwd })`.
- `conformance/xaravel-consequences/config.jsonl` -- FR-20.2, which ends "Bun's own `.env` auto-loading doesn't change the result."
- `conformance/harness/harness.ts:418` -- the harness spawns `bun --no-env-file test` and strips `BUN_OPTIONS` / `NODE_OPTIONS`; the child should do the same.
- Probe (2026-10-30, Bun 1.4.3): with neither control, `NODE_ENV=production` reads all three files, and `SHARED` comes from `.env.local`. Either `env = false` or `--no-env-file` alone, or both, reads none.
- Gate today: `api-surface config: 25 Upstream, 25 matched, 0 missing, 0 renamed, 48 extra, 0 mismatched, 0 div12; 48 unexplained`. All 48 are `extra class` lines under `Dotenv\`, `PhpOption\` and `GrahamCampbell\ResultType\`.
- `package.json` scripts -- 49 of the 77 `bun …` scripts lack `--no-env-file` (`jq`, 2026-10-30). An entry-script lint over them would fail on `main` today.

## Tasks & Acceptance

**Execution:**
- `conformance/escalations/ESC-15.3-1.md` -- `protected-path` Escalation for XT-config-6: where the entry-script lint lives, what counts as an entry script, and the root scripts it would fail on -- the lint needs Protected Paths.
- `conformance/escalations/ESC-15.3-2.md` -- `protected-path` Escalation for XT-config-7: the 48 `additions.jsonl` `member: null` lines citing FR-20 -- the gate needs a Protected Path.
- `packages/config/tests/xaravel/env-autoload.test.ts` -- XT-config-5, covering the I/O matrix rows -- the AC's test.

**Acceptance Criteria:**
- Given a fixture app with `.env`, `.env.local` and `.env.production` and the root `bunfig.toml`, when its entry script runs with `--no-env-file`, then `process.env` holds none of those files' values until Xaravel's loader runs.
- Given the two Escalations, when `bun run escalations:check` runs, then it passes.

## Design Notes

The control row keeps the test honest (lesson, epic 7: assert per case): a fixture that Bun would not read anyway proves nothing. The child prints one JSON object before the load and one after, and the test parses each line.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-config-*'` -- expected: no differences for XT-config-1..5.
- `bun run escalations:check` -- expected: OK.
- `bun run typecheck`, `bun run lint` -- expected: clean.

## Auto Run Result

Status: blocked
Blocking condition: `protected-path` Escalations ESC-15.3-1 (the entry-script lint needs `tools/`, the root `package.json` and `ci.yml`; 49 root scripts lack `--no-env-file`) and ESC-15.3-2 (`api-surface:gate config` needs 48 `additions.jsonl` lines citing FR-20) need a second key (MAINT-2026-10-16, amendment 2026-10-30). They stop XT-config-6 and XT-config-7; XT-config-5 is done.

- **Implemented:** `packages/config/tests/xaravel/env-autoload.test.ts` (XT-config-5, FR-20.2). A fixture app with `.env`, `.env.local` and `.env.production` runs as a child Bun process under `NODE_ENV=production`. With no `bunfig.toml` and no flag, Bun reads all three files, and `.env.local` wins on the shared key. With the root `bunfig.toml` copied in and `--no-env-file`, `process.env` and `getenv` hold none of the fixture keys until `Dotenv::createUnsafeImmutable(dir)->load()` runs. After that, only `.env`'s keys are set, and a real variable keeps its value. Raised `conformance/escalations/ESC-15.3-1.md` and `ESC-15.3-2.md`.
- **Verification (2026-10-30):** `harness --xaravel --id 'XT-config-*'`: 5 of 5 pass. `escalations:check`: 155 escalations, 153 decisions, OK. `typecheck` and `lint` are clean. Probe (Bun 1.4.3): either `env = false` or `--no-env-file` alone stops the autoload.
- **Review:** not run in this iteration. When the rulings land, XT-config-6 and XT-config-7 change the reviewed tree, so all five layers, the Fidelity Review included, run when the Story resumes (as for Story 15.2).
- **Process note:** to probe ESC-15.3-2, the implementing subagent briefly merged the 48 lines into the tracked, Protected `additions.jsonl` and then restored it. Lesson epic 4 says to run such a check in a copy outside the repo. `git status` shows no Protected file changed.
- **Residual risks:** the control row assumes the host has no global Bun config that disables the autoload. Epic-close gaps outside this spec: `packages/config` has no `async-surface.json` and no `docs/` page yet, and `skeleton/` has no `bunfig.toml` (that belongs to the Skeleton Story, 61.2). XT-config-7 covers them when the Story resumes.
