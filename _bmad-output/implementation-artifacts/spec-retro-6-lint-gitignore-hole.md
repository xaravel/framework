---
title: 'Retro 6 item 3: lint:disables fails when a .gitignore entry hides a linted file'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '907a2381b0c5c3f6918f237ab2147836259d3327'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/lint.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** oxlint skips files that `.gitignore` excludes, but `tools/lint-rules/disables.ts` checks only `ignorePatterns` and the root `.eslintignore`. A force-added, gitignored `packages/demo/src/Bad.ts` goes unlinted while `lint:disables` prints `ok`, and the root `.gitignore`'s unanchored `dist/`, `build/` and `coverage/` hide any `packages/*/src/**/build/` directory from the spine rules (finding L2, action item 3).

**Approach:** Ask git which paths its exclude rules match: run `git check-ignore --no-index -v -z --stdin` over the protected paths, three new build-directory probes and every listed file oxlint would lint. Report each match as a violation at the ignore file's line. Anchor the root `.gitignore` build-output entries so build output stays ignored and source subdirectories do not.

## Boundaries & Constraints

**Always:** Use git's own matcher (`--no-index`, so tracked files count), which covers root and nested `.gitignore`, `.git/info/exclude` and `core.excludesFile`. Skip negated (`!`) matches. Use the existing violation shape `<source>:<line>:1: entry "<pattern>" excludes <path> from the spine rules (AD-16)`. A git failure (exit other than 0 or 1) throws, and `main` prints `check failed`. Keep build output ignored at the repository root and at each package root (`/packages/*/dist/` and the like).

**Never:** Weaken or remove an existing check or assertion. Never change `protectedPaths`/`IGNORE_PROBES` semantics for the `ignorePatterns` and `.eslintignore` checks, never touch `packages/**` or `conformance/expectations/**`, and never edit `AGENTS.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Force-added ignored file | `.gitignore` has `Bad.ts`; `packages/demo/src/Bad.ts` tracked | `.gitignore:1:1: entry "Bad.ts" excludes packages/demo/src/Bad.ts …`, exit 1 | — |
| Unanchored build dir | root `.gitignore` has `build/` | violation naming `packages/demo/src/build/Demo.ts` | — |
| Anchored entries | `/build/`, `/packages/*/dist/` | no violation | — |
| Nested `.gitignore` | `packages/foo/.gitignore` with `src/` and a tracked `packages/foo/src/A.ts` | violation at `packages/foo/.gitignore:1:1` | — |
| Negation | `*.ts` then `!packages/**` | no violation for a re-included path | — |
| Path under root `ignorePatterns` | `_bmad/render/.gitignore` with `*` | no violation (oxlint does not lint `_bmad/**` anyway) | — |
| Real repository | current tree after the anchoring | `lint disables: ok` | — |

</intent-contract>

## Code Map

- `tools/lint-rules/disables.ts:323` `gitFiles` -- `git ls-files -co --exclude-standard`; tracked ignored files are listed, so the directive scan sees them while oxlint does not.
- `tools/lint-rules/disables.ts:479` `protectedPaths`, `:491` `checkEslintignore` -- the pattern to mirror for `checkGitignore(root, paths)`.
- `tools/lint-rules/disables.ts:590` `findDisables` -- `listed`, `files` (after root `ignorePatterns`) and `paths`; add the gitignore violations after `checkEslintignore`.
- `tools/lint-rules/disables.ts:1-41` -- the header comment documents what is checked; add the `.gitignore` rule there.
- `.gitignore:3-5` -- unanchored `dist/`, `build/`, `coverage/`.
- `conformance/tests/xaravel/lint.test.ts:278` `configCases` (run by XT-conformance-131) -- `violationsWith` and `gitRootWith` build hermetic git roots; add the matrix cases here.
- `docs/ops/lint.md:83` -- the "Ignores" bullet; extend it to `.gitignore`.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/disables.ts` -- add `GITIGNORE_PROBES` (`packages/demo/src/{build,dist,coverage}/Demo.ts`) and an exported `checkGitignore(root, paths)` that feeds `paths` to `git check-ignore --no-index -v -z --stdin`, drops `!` patterns, and returns one violation per matched path (source path as git prints it, its line, col 1). In `findDisables`, call it with protected paths, the probes and every linted-extension path in `files`, deduplicated. Update the header comment.
- `.gitignore` -- anchor the entries as `/dist/`, `/build/`, `/coverage/` plus `/packages/*/dist/`, `/packages/*/build/`, `/packages/*/coverage/`.
- `conformance/tests/xaravel/lint.test.ts` -- add the matrix cases to `configCases`, including one `findDisables(...)` with `formatViolation` that checks line:col.
- `docs/ops/lint.md` -- document the `.gitignore` rule and the build-directory probes.

**Acceptance Criteria:**
- Given a root with a tracked linted file that any git exclude source hides, when `bun run lint:disables` runs, then it exits 1 and names the ignore file, line, pattern and path.
- Given the repository after this change, when `bun run lint` runs, then it passes and `lint disables: ok` prints.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 12, false 3, maybe-false 0 (4 rejected as spec edits)
- findings:
  - `[low]` `[reject]` blind: oxlint 1.88.0 ignores `core.excludesFile`, so counting it can flag a file oxlint lints — the fix is to edit this spec's Always clause, which names `core.excludesFile` on purpose (stricter than oxlint, never weaker); recorded as a residual risk.
  - `[low]` `[reject]` blind: the check and its temp-root tests read the developer's global git excludes — the orchestrator host and CI have none (`core.excludesFile` unset, no `~/.config/git/ignore`); isolating it means env plumbing in every git spawn.
  - `[low]` `[reject]` blind: one violation per matched path, unlike the "first path" convention, so `*.ts` floods stderr — only on a run that already fails; cosmetic.
  - `[low]` `[reject]` blind: anchoring drops ignore coverage for build output outside the root and `packages/*` (e.g. `skeleton/public/build/`), and `.cache/` stays unanchored — no such output exists today (all `tsc` output is in `.cache/tsc`); anything that appears shows up untracked in review.
  - `[low]` `[reject]` blind: `GITIGNORE_PROBES` cover only `packages/demo/src` — a path-specific `tests/**/build/` entry is unlikely, and an unanchored `build/` is already caught.
  - `[low]` `[reject]` blind: in a worktree git prints `.git/info/exclude` as an absolute path — cosmetic.
  - `[low]` `[reject]` blind: no end-to-end `runDisables` case for a `check-ignore` failure — `main`'s existing catch handles every throw, and the throw itself is tested.
  - `[low]` `[reject]` blind: the `source === ""` branch is dead and the record count is not validated — negligible; git's `-v -z` format is fixed.
  - `[false]` `[reject]` blind: spec process items (empty logs while in-review, matrix rows) — the logs fill during this step; the fix edits the spec.
  - `[low]` `[reject]` edge: global excludes with `build/` fail the real-repo run locally — same as the second row.
  - `[low]` `[reject]` edge: temp roots inherit global git config — same as the second row.
  - `[false]` `[reject]` edge: a `root` below the work-tree top mislocates the source path — `main` always passes the repository top and the tests `git init` each root.
  - `[low]` `[reject]` edge: no probes under `tests/` or `skeleton/` — same as the fifth row.
  - `[low]` `[reject]` edge: removed unanchored entries no longer ignore `skeleton/`, `installer/`, `tools/*` output — same as the fourth row.
  - `[low]` `[patch]` verification-gap: nothing tests the linted-extension filter on the paths `checkGitignore` gets — added `gitignoreViolations({ "notes.log": … }, { ".gitignore": "*.log\n" })` → `[]` to `configCases`.
  - `[low]` `[reject]` verification-gap other: global excludes affect results; docs should say so — `docs/ops/lint.md` already names `core.excludesFile` as a source.
  - `[false]` `[reject]` intent: scope wider than "the protected paths" (all listed linted files, all git exclude sources) — stricter, not weaker; the verbatim intent's "tracked file under a linted path" covers it.
  - `[low]` `[reject]` intent: git's matcher stands in for oxlint's; no test runs oxlint on a force-added ignored file — the reviewer confirmed root `.gitignore` and `.git/info/exclude` hide files from oxlint; the only mismatch is the first row.
  - `[low]` `[reject]` intent: the real `.gitignore` is covered only through the real-repo `ok` assertion — that assertion fails on any unanchored `dist/`/`build/`/`coverage/` (shown by restoring the old file: three violations).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint.test.ts` -- expected: all pass
- `bun run lint` -- expected: exit 0, `lint disables: ok`
- `bun run typecheck` -- expected: no errors
- `printf 'packages/demo/src/build/Demo.ts\0' | git check-ignore --no-index -z --stdin` -- expected: exit 1 (no match)

## Auto Run Result

Status: done

**Summary.** `lint:disables` now asks git (`git check-ignore --no-index -v -z --stdin`) whether any exclude rule matches a protected path, a build-directory probe (`GITIGNORE_PROBES`) or any listed linted file outside the root `ignorePatterns`. Each match is a violation at the ignore file's line. The root `.gitignore` anchors `dist/`, `build/` and `coverage/` at the root and at each package root.

**Files changed.**
- `tools/lint-rules/disables.ts`: `GITIGNORE_PROBES`, `checkGitignore`, wired into `findDisables`, header comment.
- `.gitignore`: anchored build-output entries.
- `conformance/tests/xaravel/lint.test.ts`: git-exclude cases in `configCases` (XT-conformance-131).
- `docs/ops/lint.md`: "Git excludes" bullet.

**Review.** 1 patch applied (low: a test for the linted-extension filter). 0 deferred. 18 rejected; the reasons are in the triage log. Follow-up review recommended: false (patched: high 0, medium 0, low 1).

**Verification.**
- `bun test conformance/tests/xaravel/lint.test.ts`: 4 pass, 176 expects.
- `bun run lint`: `lint disables: ok (386 files)`.
- `bun run typecheck`: clean.
- The `check-ignore` probe for `packages/demo/src/build/Demo.ts`: exit 1.
- With the old `.gitignore` restored, the real repository failed with three violations.

**Residual risks.** oxlint 1.88.0 does not honour `core.excludesFile`, so a developer whose global git ignore matches a linted path gets a stricter-than-oxlint failure locally (CI and the orchestrator host have no global excludes). Build output outside the root and `packages/*` is no longer gitignored.
