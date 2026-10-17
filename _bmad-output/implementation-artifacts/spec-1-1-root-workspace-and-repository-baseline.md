---
title: 'Story 1.1: Root workspace and repository baseline'
type: 'chore'
created: '2026-10-16'
status: 'done'
baseline_revision: 'facd03a9e4fc86b80953fa681c01fcc82b80ee00'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.1.md'
warnings: ['oversized']
deferred:
  - summary: >-
      `bun run typecheck` and `bun run lint` are not exercised by any test, so `bun test` stays green when they break.
    evidence: |-
      Verification-gap layer removed `types: ["bun"]` from tsconfig.json: tsc failed (TS2307 bun:test) while bun test showed 5 pass. Dropping `--bun` or `--type-aware` is likewise undetected. Story 1.7 makes typecheck and lint CI gates.
    location: >-
      package.json:17
    severity: medium
  - summary: >-
      A `.env` inside a workspace member leaks into process.env when Bun runs with that member as cwd, because Bun reads only the cwd bunfig.toml.
    evidence: |-
      Scratch repo with root bunfig.toml (env = false) and sub/.env: `bun -e` from sub/ printed `leaked`. AC3 covers the repo root only; per-package and Skeleton bunfig.toml (env = false) belong to the scaffolder (Story 1.2) and the Skeleton Story.
    location: >-
      bunfig.toml:6
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The repo has only planning files. There is no Bun workspace, no pinned toolchain, no Protected root config, and no `SECURITY.md`, so no later Story has a baseline to build or test on.

**Approach:** Add the root workspace files (`package.json`, `bun.lock`, `.bun-version`, `bunfig.toml`, `tsconfig.base.json`, `tsconfig.json`, `.oxlintrc.json`, `.gitattributes`, `conformance/baseline-pin`, `SECURITY.md`), keep the existing `LICENSE`/`README.md`, and verify each acceptance criterion with one Xaravel Test `XT-conformance-1..5` that runs under plain `bun test`.

## Boundaries & Constraints

**Always:**
- Toolchain is exactly the spine's Stack: Bun 1.4.3, `typescript` 7.0.2, `oxlint` 1.88.0, `oxlint-tsgolint` 7.0.2004, pinned with `--exact` as root devDependencies, plus `@types/bun` 1.4.3. Run binaries with `bun --bun <bin>` (their shebangs call `node`, which is not installed).
- Root `package.json`: `private: true`, `version: "0.0.0"`, `type: "module"`, `workspaces: ["packages/*", "skeleton", "installer", "tools/*"]`, `engines.bun: ">=1.4"`.
- Each test title starts with its Test ID and states the FR consequence or AD rule it checks, e.g. `XT-conformance-2: no tsconfig sets experimentalDecorators (AD-4)`.
- Tests are hermetic: anything they write (a probe `.env`) is removed in `finally`, and they never overwrite an existing file.
- Name is Xaravel; the project is "a TypeScript port of Laravel", not affiliated with Laravel.

**Never:**
- Never touch `AGENTS.md`, create a `CLAUDE.md`, or commit a real `.env`/`APP_KEY`.
- Never use Node, npm, pnpm, Jest, Vitest, ESLint or Prettier.
- Never set `experimentalDecorators` anywhere. Never put `env` anywhere but the top level of `bunfig.toml`.
- Out of scope: the package scaffolder and `packages/*` (Story 1.2), CODEOWNERS/protected-paths (1.4), CI workflows (1.7). The `skeleton/` and `installer/` placeholders are only a `package.json` each, so `bun install` can resolve the declared workspaces; they hold no code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Install | fresh clone, Bun = `.bun-version` | `bun install --frozen-lockfile` exits 0 | test fails with stderr |
| Wrong Bun | `Bun.version` differs from `.bun-version` | XT-conformance-1 fails naming both versions | — |
| Decorator flag | any `tsconfig*.json` outside `node_modules` with `compilerOptions.experimentalDecorators` set (true or false) | XT-conformance-2 fails naming the file | — |
| Root `.env` | `.env` at repo root holding a unique probe key; `bun -e` run from repo root | key absent from child `process.env` | if `.env` already exists, the test fails asking for it to be moved, and leaves it untouched |

</intent-contract>

## Code Map

- `LICENSE` -- exists; MIT, Xaravel copyright plus "Copyright (c) Taylor Otwell". Keep as is.
- `README.md` -- exists; says "A TypeScript port of Laravel" and "not affiliated with, sponsored by or endorsed by Laravel Holdings Inc." Keep as is.
- `.gitignore` -- already ignores `node_modules/`, `.env`, `.cache/`, `*.tsbuildinfo`.
- `tools/orchestrator/` -- has no `package.json`; `tools/*` workspace glob tolerates it (verified with Bun 1.4.3).
- Bun 1.4.3 fails `bun install` with `Workspace not found "skeleton"` / `"installer"` when the literal workspace dirs lack a `package.json` (verified in a scratch dir); `packages/*` with no matches is fine.
- Root `bunfig.toml` with top-level `env = false` stops `.env` reaching `process.env` (verified: `absent` with it, `leaked` without).
- `stories/1.1.md` -- manifest; `xaravel_test_ids: XT-conformance-1..5`, one per acceptance criterion in order.

## Tasks & Acceptance

**Execution:**
- `.bun-version` -- `1.4.3` plus newline.
- `package.json` -- root manifest per Always; scripts `test` (`bun test`), `typecheck` (`bun --bun tsc -p tsconfig.json`), `lint` (`bun --bun oxlint --type-aware`); exact devDependencies.
- `skeleton/package.json`, `installer/package.json` -- placeholders: `{"name": "@xaravel/skeleton" | "create-xaravel", "version": "0.0.0", "private": true, "type": "module"}`.
- `bun.lock` -- generated by `bun install`; commit it.
- `bunfig.toml` -- top-level `env = false` with a comment pointing at the env convention.
- `tsconfig.base.json` -- `strict: true`, `module: "esnext"`, `moduleResolution: "bundler"`, `target: "esnext"`, `lib: ["esnext"]`, `verbatimModuleSyntax`, `noEmit`, `skipLibCheck`; no `experimentalDecorators`.
- `tsconfig.json` -- extends the base, `types: ["bun"]`, includes `conformance/**/*.ts`.
- `.oxlintrc.json` -- baseline: `correctness` category as `error`, ignore `_bmad/**`, `_bmad-output/**`, `.claude/**`, `node_modules/**`.
- `.gitattributes` -- `*.jsonl text eol=lf` and `*.ts text eol=lf`.
- `conformance/baseline-pin` -- `v13.37.0` plus newline.
- `SECURITY.md` -- supported versions, private reporting through GitHub Security Advisories (`https://github.com/xaravel/framework/security/advisories/new`), no public issues, acknowledgement and fix timelines, coordinated disclosure, scope.
- `conformance/tests/xaravel/root-baseline.test.ts` -- XT-conformance-1..5 using `test`/`expect` from `bun:test` (Xaravel Tests, not Ported Tests): (1) `Bun.version` equals `.bun-version`, root manifest fields, `bun install --frozen-lockfile` exits 0; (2) base tsconfig `strict`/ESM resolution, and a glob over every `tsconfig*.json` outside `node_modules` finds no `experimentalDecorators` key; (3) root `.env` probe run via `Bun.spawn(["bun", "-e", ...], {cwd: root})` does not leak, and `bunfig.toml` parses with top-level `env === false`; (4) files exist, `.oxlintrc.json` is valid JSON, `git check-attr eol` reports `lf` for `x.ts` and `x.jsonl`, baseline pin equals `v13.37.0`; (5) LICENSE/README/SECURITY content checks, including no "Jaravel".

**Acceptance Criteria:**
- Given a fresh clone, when `bun install` runs on Bun 1.4.3, then it succeeds and the root `package.json` declares the four workspaces, version `0.0.0` and `engines.bun >= 1.4` (XT-conformance-1).
- Given `tsconfig.base.json`, when inspected, then it is strict, ESM-resolving and decorator-flag-free, and a test fails if any `tsconfig*.json` sets `experimentalDecorators` (XT-conformance-2).
- Given the root `bunfig.toml`, when a script loads a `.env` at the repo root, then none of its values reach `process.env` (XT-conformance-3).
- Given the root files, when inspected, then `.oxlintrc.json`, `.gitattributes` (LF for `*.jsonl`, `*.ts`) and `conformance/baseline-pin` (`v13.37.0`) exist (XT-conformance-4).
- Given the root files, when `LICENSE`, `README.md` and `SECURITY.md` are inspected, then the licence carries both notices, the README carries the description and non-affiliation statement, and `SECURITY.md` sets out a disclosure process (XT-conformance-5).

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 26 findings — high 0, medium 3, low 12, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) `bun.lock` missing from the diff — the review diff excluded the generated lockfile on purpose; `bun.lock` is in the working tree, not gitignored, and is committed with this Story.
  - `[low]` `[patch]` (blind) child `bun` spawned from PATH, not the running pinned Bun — XT-1 and XT-3 now spawn `process.execPath`.
  - `[low]` `[reject]` (blind) XT-1 runs `bun install` against the live repo and may need the network — `--frozen-lockfile` with installed deps is a no-op (`no changes`, 4 ms); a temp-copy install adds machinery for a rare case.
  - `[low]` `[reject]` (blind) XT-3 probes only `.env`, not `.env.local`/`.env.test` — the AC names a `.env` file; the verification-gap layer confirmed the others are also suppressed by top-level `env = false`.
  - `[low]` `[reject]` (blind) `.gitattributes` has no catch-all `eol=lf` — the AC names `*.jsonl` and `*.ts` only; widening is a Protected-config policy choice, not a defect here.
  - `[low]` `[reject]` (blind) `.oxlintrc.json` `$schema` points into `node_modules` — editor-only; resolves after `bun install`, which every workflow runs first.
  - `[medium]` `[defer]` (blind, verification-gap) `bun run typecheck`/`bun run lint` are not exercised by any test — real (verification-gap demonstrated removing `types` keeps `bun test` green); CI gating is Story 1.7's scope.
  - `[false]` `[reject]` (blind) root `tsconfig.json` includes only `conformance/**` — no package code exists; Story 1.2 builds `tsc -b` project references, so nothing is unchecked today.
  - `[low]` `[reject]` (blind) base tsconfig lacks `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` for AD-9 — not required by the AC or AD-9's rule text; adding compiler policy belongs with the Story that writes code under it.
  - `[low]` `[reject]` (blind) no `[test] root` in `bunfig.toml` — no stray `*.test.*`/`*.spec.*` exists under `_bmad`, `.claude` or `tools` (checked with find); adds config for a hypothetical.
  - `[medium]` `[patch]` (blind, edge-case, intent) XT-2 raw-substring match over a dot-glob that walks `.claude/worktrees/*` and `node_modules` — now lists `git ls-files -co --exclude-standard` tsconfigs, parses each and checks the `compilerOptions.experimentalDecorators` key, per the spec matrix.
  - `[low]` `[reject]` (blind) SECURITY.md mixed day units, no fallback contact, pipeline listed before it exists, test checks wording — cosmetic; the disclosure process is complete and the test asserts its sections.
  - `[medium]` `[defer]` (edge-case) `.env` in a workspace member leaks when Bun runs with that member as cwd — verified (`leaked`): Bun reads only the cwd `bunfig.toml`. AC3 covers the repo root; per-package/Skeleton `bunfig.toml` belongs to the scaffolder (Story 1.2) and the Skeleton Story.
  - `[low]` `[reject]` (edge-case) killed test leaves a stale root `.env` — the next run fails loudly asking to move it; a temp-dir probe would no longer exercise the root surface the AC names.
  - `[low]` `[patch]` (edge-case) `closeSync` skipped if `writeSync` throws — fd now closed once in `finally`.
  - `[low]` `[patch]` (edge-case) `bun install` stdout piped but never read — now `stdout: "ignore"`.
  - `[false]` `[reject]` (edge-case) false offenders from `.claude/worktrees` — merged into the XT-2 patch row above (same root cause), kept here as its own row.
  - `[false]` `[reject]` (edge-case) glob traverses `node_modules`, may exceed 5 s — superseded by the `git ls-files` patch; scan was 39 ms total suite time.
  - `[false]` `[reject]` (edge-case) substring flags `false`/comments — the matrix says any `experimentalDecorators` key (true or false) fails; comments are handled by the parsing patch.
  - `[false]` `[reject]` (edge-case) git missing or not a checkout — a loud failure in a non-repo tree is correct behaviour for a repo-baseline test.
  - `[false]` `[reject]` (edge-case) missing `engines` gives TypeError — the test still fails, naming the line; correct behaviour.
  - `[low]` `[reject]` (edge-case, intent) XT-1 runs in the working tree, not a fresh clone — addressed in verification by cloning the committed branch into a temp dir and running `bun install --frozen-lockfile` and `bun test` there.
  - `[false]` `[reject]` (intent) tests stricter than the AC (exact devDependencies, `>=1.4` literal, `esnext`/`bundler`) — tighter assertions on Protected config are intended by the spec, not a divergence from the intent.
  - `[false]` `[reject]` (intent) LICENSE/README verified, not authored — they already satisfy the AC; the spec chose to keep them.
  - `[false]` `[reject]` (intent) `.oxlintrc.json` check narrower than "a baseline config" — it asserts the baseline exists and is parseable; no bad outcome.
  - `[false]` `[reject]` (intent) workspace globs only exercised indirectly — `bun install` resolving them is the AC's own surface.

## Verification

**Commands:**
- `bun install --frozen-lockfile` -- exits 0
- `bun test` -- 5 pass, 0 fail
- `bun run typecheck` -- exits 0
- `bun run lint` -- exits 0, no errors

## Auto Run Result

Status: done

**Summary.** The repo is now a pinned Bun 1.4.3 workspace with the Protected root config, the toolchain pinned exactly (TypeScript 7.0.2, oxlint 1.88.0, oxlint-tsgolint 7.0.2004, @types/bun 1.4.3), the Baseline Pin, `SECURITY.md`, and Xaravel Tests XT-conformance-1..5 under plain `bun test`.

**Files changed.**
- `.bun-version` -- pins Bun 1.4.3.
- `package.json` -- root manifest: workspaces, lockstep `0.0.0`, `engines.bun >=1.4`, `test`/`typecheck`/`lint` scripts, exact devDependencies.
- `bun.lock` -- generated lockfile.
- `skeleton/package.json`, `installer/package.json` -- private placeholders so the declared workspaces resolve.
- `bunfig.toml` -- top-level `env = false`.
- `tsconfig.base.json`, `tsconfig.json` -- strict ESM base; root project typechecks `conformance/**`.
- `.oxlintrc.json` -- baseline (correctness = error, planning dirs ignored).
- `.gitattributes` -- LF for `*.jsonl` and `*.ts`.
- `conformance/baseline-pin` -- `v13.37.0`.
- `SECURITY.md` -- private advisory reporting, timelines, coordinated disclosure, scope.
- `conformance/tests/xaravel/root-baseline.test.ts` -- XT-conformance-1..5.

**Review findings.** 26 findings: 4 patches applied (XT-2 now parses git-listed tsconfigs and checks the `compilerOptions` key; spawns use `process.execPath`; `bun install` stdout ignored; fd closed in `finally`). 2 deferred (typecheck/lint not under test, Story 1.7; workspace-member `.env` leak, Story 1.2/Skeleton). 20 rejected, each with its reason in the Review Triage Log.

**Follow-up review recommendation:** false. Patched entries: 1 medium, 3 low, 0 high.

**Verification.** `bun install --frozen-lockfile` exits 0 (no changes); `bun test` 5 pass, 0 fail; `bun run typecheck` exits 0; `bun run lint` exits 0. Negative checks: an untracked tsconfig with `experimentalDecorators: false` fails XT-2 naming it; without `bunfig.toml` the root `.env` probe prints `leaked`, with it `absent`. No `.env` left behind.

**Residual risks.** XT-2 parses tsconfigs as strict JSON, so a future tsconfig with comments fails as unparseable (loud, not silent). The two deferred items above.
