---
title: 'Story 4.1: PHP comparison core'
type: 'feature'
created: '2026-10-18'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ported Tests need PHPUnit's equality semantics. `@xaravel/assert` is empty (`export {};`). PHP `==` and `===` must be implemented inside the grader, and every result must match the PHP 8.5 Oracle (FR-116, AD-15).

**Approach:**
- Add `phpLooseEquals(a, b)` and `phpStrictEquals(a, b)` to `@xaravel/assert`. Both run over the AD-9 value model and detect PHP arrays and objects by `Symbol.for` brand.
- Commit Oracle requests for a truth table, `conformance/oracle-requests/4.1.jsonl` (kind `php-expr`, id `XT-assert-1`).
- XT-assert-1 compares both functions against the signed fixtures in `conformance/fixtures/assert/<sha>.json`.
- Freeze the package's exports and prototypes on load.

## Boundaries & Constraints

**Always:**
- Follow PHP 8.5 semantics.
- `null` is the only absent value.
- The truth table comes only from signed Oracle fixtures, never from hand-written or locally evaluated outputs (AD-15).
- `@xaravel/assert` declares no non-grader dependency (`bun run graph:check`).

**Never:**
- Import `@xaravel/runtime` or any graded package.
- Use `constructor.name`.
- Commit unsigned outputs as expected values.
- Skip XT-assert-1 when its fixtures are missing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Numeric string | `0 == "a"`, `"1" == "01"`, `"10" == "1e1"`, `100 == "1e2"` | PHP 8 results: false, true, true, true | none |
| int/float | `1 == 1.0` vs `1 === 1.0` | Both are JS `number`, so int and float can't be told apart. Only cases that keep that distinction (AD-9 float marker) are in the table. | Out-of-model cases are left out of the requests, with a reason in Design Notes |
| Array order | `[1=>'a',0=>'b']` vs `[0=>'b',1=>'a']` | `==` true, `===` false | none |
| Branded | a `Symbol.for('xaravel.php.array')` PhpArray, or an object with `[Symbol.for('xaravel.php.props')]()` | Compared as a PHP array or object | none |
| Frozen | assigning to an export or prototype | throws `TypeError` | none |

</intent-contract>

## Code Map

- `packages/assert/src/index.ts`: currently `export {};`. The comparison core goes here as `src/comparison/*.ts`.
- `packages/assert/tests/xaravel/`: holds only `.gitkeep`. XT-assert-1..3 go here. Use plain `bun:test` until Story 4.2 exists, titled `XT-assert-<n>: …`, as in `conformance/tests/xaravel/*.test.ts`.
- `tools/oracle/request.ts`: `makeRequest` and `renderRequest`. Generate request lines with these; never type them by hand.
- `tools/oracle/story-requests.ts`, `tools/oracle/story.ts`: `bun run oracle:story check 4.1` judges the lines.
- `tools/oracle/fixtures.ts`: `verifyFixture`. The fixture value encoding is documented in the `tools/oracle/evaluate.php` header (`{"int"}`, `{"float"}`, `{"array":[[k,v]]}`, `{"object","properties"}`).
- `.github/workflows/oracle.yml` job `story`: the only way to produce signed fixtures. It needs the `xaravel-oracle` App and `ORACLE_SIGNING_KEY`.
- `tools/graph/graph.ts`: grader layer rule (around line 271).
- `stories/4.1.md`: component `assert`, owns XT-assert-1..3.

## Tasks & Acceptance

**Execution:**
- `conformance/oracle-requests/4.1.jsonl`: `php-expr` truth-table requests for XT-assert-1, generated with `makeRequest`.
- `packages/assert/src/comparison/PhpComparison.ts`: `phpLooseEquals` and `phpStrictEquals`.
- `packages/assert/src/index.ts`: the named exports, plus a deep freeze of exports and prototypes.
- `packages/assert/tests/xaravel/comparison.test.ts`: XT-assert-1, XT-assert-2 and XT-assert-3.

**Acceptance Criteria:** the three ACs of Story 4.1 (`epics.md` line 2026), each verified by XT-assert-1..3 in order.

## Spec Change Log

## Review Triage Log

## Design Notes

**Blocking dependency (found in planning).** AC 1 needs signed fixtures for this Story's requests. Only the live `oracle.yml#story` job can produce them, and that job has never run. The Maintainer has not set up the `xaravel-oracle` App, `XARAVEL_ORACLE_APP_ID`/`_KEY` or the environment rule; that work is Epic 3 retro item `epic-3-retro-item-7-oracle-app-and-live-smoke`, waiting on the Maintainer.

`story.ts generate` refuses any key other than the one matching `conformance/oracle/oracle.pub`. Nothing an agent produces passes `oracle:verify-fixtures`. Without fixtures, XT-assert-1 can only fail or be skipped, and skipping weakens the grader.

The lesson from Epics 2 and 3 is to block before a full build when a needed input is not owned by a done step, so the Story stops here.

## Verification

**Commands:**
- `bun run oracle:story check 4.1`: expected to pass.
- `bun test packages/assert`: expected to pass.
- `bun run graph:check`: expected to pass.
- `bun run oracle:verify-fixtures`: expected to pass.

## Auto Run Result

Status: blocked

Blocking condition: dependency gap. XT-assert-1 (AC 1) needs signed Oracle fixtures for `conformance/oracle-requests/4.1.jsonl`. These come only from the live `oracle.yml#story` job, which needs the `xaravel-oracle` App and its secrets. That setup is Epic 3 retro item `epic-3-retro-item-7-oracle-app-and-live-smoke`, waiting on the Maintainer. No agent-runnable path produces a fixture that passes `oracle:verify-fixtures`.

To unblock, either:
- the Maintainer completes item 7, then sets this spec and the Story back to `ready-for-dev`; or
- the Maintainer rules on another source for the truth table.

No code was written.
