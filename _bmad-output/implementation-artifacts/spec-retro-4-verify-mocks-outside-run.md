---
title: 'Retro 4 item 2: a mock created outside a test run is verified at the next test end'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: '3af4234d42dd82a6570c21ec40f37ca8614c14a1'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Outside the run protocol's AsyncLocalStorage store, `Mockery.getContainer()` puts mocks in the module-level `processSlot` (`packages/mockery/src/Mockery.ts:31-38`), and nothing ever closes it. A mock built at file load (or in a bare `bun:test` hook) with `shouldReceive('run').once()` is never verified, so a `portedTest` that never calls it passes. PHPUnit closes Mockery's one global container at the next test's tearDown and fails that test. Epic 4 retrospective finding R3, action item `epic-4-retro-item-2-verify-mocks-outside-run`.

**Approach:** Take the first option of the item, the faithful one: when the run protocol (`run` in `Mockery.ts`) starts, it adopts the process slot's container, if any, as the run's own container and empties the process slot. The adopted container is then closed exactly like one created in the run: verified and counted when `fn` resolves, purged without verifying when `fn` rejects. Throwing on creation outside a run is rejected because it would break mocks made in file-level setup that PHP allows.

## Boundaries & Constraints

**Always:** `Mockery.close()` called outside a run still closes and verifies the process slot (unchanged). Inside a run, `getContainer()`/`self()` see the adopted container, so a mock made before the test and one made in it share one container, as in PHP. Each counted expectation of an adopted container records a `mockeryExpectation` assertion. Update the header comment of `Mockery.ts` (Test finish paragraph) to describe adoption.

**Never:** Throw on mock creation outside a run. Change `@xaravel/assert` (`portedTest`, `xaravelTest`), the Oracle requests, signed fixtures or `scenarios.ts`. Remove or weaken any existing assertion. Edit anything outside `packages/mockery/**` and this spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| R3 repro | mock of `XtFoo` with `shouldReceive('run').once()` made outside a run; then a `portedTest` that records one assertion and never calls `run` | that test fails | `InvalidCountException` naming `run` and `once`/1 |
| Met outside-run expectation | same mock; the test body calls `run()` once | test passes; counted expectations recorded | none |
| Body fails | outside-run mock unmet; test body throws `Error('body')` | test fails with `body`; the adopted container is purged, not verified | body error wins |
| Only the next run | after the run that adopted it ends | the process slot is empty; a following run starts with no container | none |
| No outside mock | plain run | unchanged behaviour | none |

</intent-contract>

## Code Map

- `packages/mockery/src/Mockery.ts:27-38` -- `ContainerSlot`, `storage`, `processSlot`, `currentSlot()`.
- `packages/mockery/src/Mockery.ts:66-79` -- `Mockery.close()`: count, detach, `mockery_teardown`, `mockery_close`. Reused unchanged for the adopted container.
- `packages/mockery/src/Mockery.ts` `async function run` (near line 167) -- the run protocol; adoption goes at its start (`slot.container = processSlot.container; processSlot.container = null`).
- `packages/mockery/src/Mockery.ts:1-15` -- header comment to update.
- `packages/assert/src/declarations/portedTest.ts:177-185` -- read-only: `runWithMockery` calls the protocol around setUp + body + tearDown.
- `packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts` and `mockery.test.ts:398` -- the existing pattern: a fixture not matched by the test glob, run in a child `bun test`, results read back. Follow it for the new fixture.
- `packages/mockery/tests/xaravel/mockery.test.ts` fixture-free tests call `Mockery.close()` after creating mocks outside a run; keep them closing so nothing leaks into later runs.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/Mockery.ts` -- in `run`, adopt the process slot's container before `storage.run`; update the header comment -- fixes R3.
- `packages/mockery/tests/xaravel/fixtures/outside-run.fixture.ts` -- new fixture: env-selected scenario (`unmet`, `met`, `body-fails`); creates the `XtFoo` mock at module load, then declares one `portedTest` (or two, for the "only the next run" row) -- the outermost surface.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- add a test that runs the fixture in a child `bun test` per scenario and asserts every I/O matrix row (exit code and the failure's exception name/message) -- regression cover for R3.

**Acceptance Criteria:**
- Given the new fixture in the `unmet` scenario, when it runs under `bun test`, then the child exits non-zero and reports an `InvalidCountException` for `run`; on the baseline source it exits 0 (shown by a stash run).
- Given the change, when `bun test packages/mockery`, `bun test packages/assert`, typecheck, lint and `mockery:coverage` run, then they pass with no existing assertion changed.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 15, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Three child spawns share one 60 s CHILD_TIMEOUT — each spawn may take up to 50 s; the test's timeout now covers three spawns.
  - `[low]` `[patch]` (blind) A mock made after the last run is never verified, undocumented — true, and faithful: PHPUnit's global container is closed only by a test's tearDown, so one made after the last test is never verified there either; the header comment now states the limit.
  - `[low]` `[reject]` (blind) A leftover mock in file A fails file B's first test; concurrent runs race for it — PHPUnit's one global container also spans test classes, so the next test's tearDown fails; no test in the repo uses `test.concurrent` with Mockery, and a guard would add an active-run counter.
  - `[low]` `[patch]` (blind) The child's exception class is not checked — confirmed (Bun writes `type="InvalidCountException"` on the JUnit failure); the regex now captures `type` and the test asserts it.
  - `[low]` `[reject]` (blind) `runOutsideRunFixture` duplicates the XT-mockery-2 runner — a shared helper is a refactor of existing test code, not a direct correction; no behaviour harm.
  - `[low]` `[reject]` (blind) Test name breaks the `XT-mockery-<n>` convention — XT ids map to Story ACs; this is a retro regression test, named for its finding.
  - `[false]` `[reject]` (blind) The "no outside mock" row has no explicit check — every existing child-run test (XT-mockery-2, the fixture-free run tests) is a run with no outside mock and passes unchanged.
  - `[low]` `[patch]` (blind) Header paragraph ends a line with a dangling "`close()`" — reflowed.
  - `[false]` `[reject]` (blind) The diff omits the spec and the baseline proof — the spec is staged separately by design; the implementer's stash run showed `unmet` exits 0 on the baseline source.
  - `[low]` `[patch]` (edge) Mock made in a bare afterEach/afterAll after the last run is never verified — same root cause and patch as the blind "after the last run" row.
  - `[low]` `[reject]` (edge) File A's process-level mock fails file B's first test — same as the blind cross-file row; PHPUnit parity.
  - `[low]` `[reject]` (edge) A bare afterEach mock after test N is blamed on test N+1 — Ported Tests put lifecycle in `case` setUp/tearDown, which run inside the run; bare `bun:test` hooks are not part of a port.
  - `[low]` `[reject]` (edge) Concurrent runs race for the process container — no concurrent Ported Test exists; a guard adds state for an undemonstrated case.
  - `[false]` `[reject]` (edge) A plain `bun:test` test() never adopts — Ported and Xaravel Tests use only `portedTest`/`xaravelTest` (AD-15); a plain test is not a test end in this model.
  - `[low]` `[patch]` (edge) A killed child (exitCode null) satisfies `not.toBe(0)` — now `toBe(1)`.
  - `[low]` `[patch]` (edge) The child's exception class is never checked — same as the blind row; same patch.
  - `[false]` `[reject]` (edge, claim) The spec says the child's exception name is asserted — moot after the type patch.
  - `[false]` `[reject]` (edge, claim) "Nothing ever closes" overclaims the fix — the Problem describes the defect, not the fix; the limit is now in the header comment.
  - `[false]` `[reject]` (intent) "Next test" covers only run-protocol tests — AD-15 makes those the only tests; same as the plain test() row.
  - `[false]` `[reject]` (intent) Adopt-at-start differs from close-at-end for mocks made mid-run outside the store — inside a run every `getContainer()` call sees the run's store; only code that escapes AsyncLocalStorage reaches the process slot, which was not shown to happen.
  - `[low]` `[reject]` (intent) Mocks made in hooks are untested — the hook and module-load paths reach the same `processSlot`; the module-load case exercises it.
  - `[false]` `[reject]` (intent) Blame across files — PHPUnit parity, as the cross-file row.
  - `[low]` `[reject]` (intent) `xaravelTest` is untested here — it shares `runWithMockery` with `portedTest` (`portedTest.ts:177`), so the code path is the same.

## Verification

**Commands:**
- `bun test packages/mockery` -- expected: all pass.
- `bun test packages/assert` -- expected: all pass.
- `bun run typecheck` -- expected: exit 0.
- `bun run lint` -- expected: no errors.
- `bun run mockery:coverage` -- expected: exit 0.

## Auto Run Result

Status: done

**Summary:** The Mockery run protocol (`run` in `packages/mockery/src/Mockery.ts`) now adopts the process-level container when it starts and empties the process slot. A mock made outside a run (at file load, or in a bare `bun:test` hook) is verified and counted when the next Ported or Xaravel Test finishes, and purged unverified when that test's body fails, as PHPUnit's tearDown closes Mockery's one global container (retro finding R3).

**Files changed:**
- `packages/mockery/src/Mockery.ts` -- `run` adopts `processSlot.container`; header comment and `run` doc describe adoption and its limit.
- `packages/mockery/tests/xaravel/fixtures/outside-run.fixture.ts` -- new child fixture: a module-load `once()` mock and two Ported Tests, scenarios `unmet`, `met`, `body-fails`.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- the outside-run regression test: exit code, JUnit failure type and message, per-test assertion counts and container probes per scenario.

**Review:** 23 findings (high 0, medium 0, low 15, false 8). Patched 6 low rows (4 root causes): JUnit failure type asserted, exit code `toBe(1)`, a timeout covering three spawns, header reflow plus the "no run after it" limit. Deferred: none. Rejected: 9 low and 8 false, with reasons in the triage log.

**Follow-up review:** not recommended. Only low entries were patched.

**Verification:** `bun test` 153 pass / 0 fail; `bun test packages/mockery` 9 pass; `bun test packages/assert` 14 pass; `bun run typecheck` exit 0; `bun run lint` exit 0; `bun run mockery:coverage` exit 0. Against the baseline `Mockery.ts` (in a temp copy of the repo), the `unmet` fixture exits 0, which reproduces R3. With the fix it exits 1 with `InvalidCountException`.

**Residual risk:** a process-level mock left by one test file is adopted by the next file's first test in the same `bun test` process, and fails that test. PHPUnit's global container behaves the same way. A mock with no run after it is still never verified, which is also PHPUnit parity.
