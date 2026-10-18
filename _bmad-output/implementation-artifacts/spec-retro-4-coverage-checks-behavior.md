---
title: 'Retro 4 item 5: the coverage reports probe behavior, not presence'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: '0b9745e543f5d29f85cdf01ef0a6448f477c39f1'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      packages/assert/README.md still says assert:coverage checks names against Assert and TestCase by presence.
    evidence: |-
      packages/assert/README.md:49 describes the old presence check; packages/** cannot change on a planning/* branch, so the README update belongs to the next assert-owned Story or a story/* follow-up.
    location: >-
      packages/assert/README.md:49
    severity: low
---

<intent-contract>

## Intent

**Problem:** `assert:coverage` (`tools/assert-coverage/coverage.ts:131-134`) counts an assert name as implemented when `Assert[name]` or `TestCase.prototype[name]` is a function, and `mockery:coverage` (`tools/mockery-coverage/coverage.ts:135`) does the same for statics and prototype methods, so an empty `static assertFoo(){}` counts as implemented (Epic 4 retro finding R5). The two tools also copy one skeleton: `UsageError`, `parseArgs`, scan reading, the report loop and exit codes (finding A2). Action item `epic-4-retro-item-5-coverage-checks-behavior`.

**Approach:** A name counts as implemented only when calling it does what it is for. An assert name must record an assertion when called; the few PHPUnit names that record nothing must change a declared test's outcome. A Mockery name must work when called on a mock or expectation, checked by one small probe per name. A shared `tools/coverage-report/` module carries the common skeleton.

## Boundaries & Constraints

**Always:** Keep each tool's CLI, `--root`, output lines, summary line and exit codes (0 / 1 / 2) byte-identical for the current repository, so XT-assert-14 and XT-mockery-6 (in `packages/**`, read-only here) pass unchanged. Owner-file (`testing`/`testbench`) and `pending` rules stay as they are. A scan name with no probe, or whose probe throws or returns false, is `missing` (the Double names stay `pending`). Every probe runs inside its own counting context or Mockery run, so one failing probe cannot affect another.

**Never:** Edit anything under `packages/**` or `conformance/expectations/**` (this is a `planning/*` branch). Weaken or remove an existing assertion. Export or change a grader internal; the tool may import `packages/assert/src/declarations/AssertionCounter.ts` by path, as it already imports the grader's `index.ts` by path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Repository | real grader | same output and exit 0 as today | none |
| Empty assert stub | temp root whose `Assert.assertTrue` body is emptied | `missing assert: assertTrue`, exit 1 | none |
| Empty outcome stub | temp root whose `TestCase.expectException` body is emptied | `missing assert: expectException`, exit 1 | none |
| Empty Mockery stub | temp root whose `Expectation.once` and `CompositeExpectation.once` only `return this` | `missing mockery: once`, exit 1 | none |
| Unknown scan name | scan adds a name with no probe | `missing …: <name>` | none |
| Usage error | `--nope` | exit 2, usage on stderr | none |

</intent-contract>

## Code Map

- `tools/assert-coverage/coverage.ts` -- `coverage()` presence test at 131-134; `NOT_PHPUNIT` and `declaresMember` stay.
- `tools/mockery-coverage/coverage.ts` -- `probeMembers` (`bound <name>`) and the presence test at 135; `DOUBLE_NAMES` stays.
- `packages/assert/src/declarations/AssertionCounter.ts:33` -- `runCounted(fn)` returns `{assertions, total, error}`; read-only.
- `packages/assert/src/Framework/Assert.ts:744-750` -- every static assertion is mirrored onto `Assert.prototype`; each records its own kind first (61 of the 67 assert-owned scan names, checked by calling each with no arguments).
- `packages/assert/src/Framework/TestCase.ts:86-125`, `Assert.ts:549` -- the six names that record nothing: `expectException`, `expectExceptionMessage`, `expectExceptionMessageMatches`, `expectExceptionObject`, `expectOutputString`, `markTestSkipped`.
- `packages/assert/src/declarations/Declarations.ts:9-17,72` -- a declared test fails with zero assertions; `markTestSkipped` reports `skipped`; reports go to `globalThis[Symbol.for('xaravel.harness.report')]`.
- `packages/mockery/src/Mockery.ts:53-160`, `Mockery/Mock.ts:229-360`, `Mockery/Expectation.ts` -- the API the probes call. `shouldReceive` returns a `CompositeExpectation`; call counts are verified by `Mockery.close()` (callable inside a run).
- `packages/assert/tests/xaravel/expectations.test.ts:455-516`, `packages/mockery/tests/xaravel/mockery.test.ts:586-649` -- XT-assert-14 and XT-mockery-6, exact-output contracts (read-only).
- `_bmad-output/implementation-artifacts/story-manifests.md:18` -- off-manifest XT ids; next free is `XT-conformance-182`.

## Tasks & Acceptance

**Execution:**
- `tools/coverage-report/report.ts` -- new: `UsageError`, `parseArgs`, `readJsonl(root, scan, parseLine)`, and `runReport({tool, usage, label, coverage})` that prints lines and the summary and returns the exit code -- one skeleton (A2).
- `tools/assert-coverage/coverage.ts` -- use the skeleton; replace the presence test with: each present static and each present prototype method must record ≥ 1 assertion when called with no arguments in `runCounted`; the six outcome names are probed by one generated `bun test` fixture (a `portedTest` per name with `case: TestCase`) that passes only if the method works, read through junit and the report hook; update the header -- R5.
- `tools/mockery-coverage/coverage.ts` -- use the skeleton; replace presence and `bound` checks with a `PROBES` table (one per non-Double scan name) run each in a fresh `xaravel.mockery.run`, checking an effect (return value, thrown exception class, or `Mockery.close()` verdict); update the header -- R5.
- `conformance/tests/xaravel/coverage-reports.test.ts` -- new: XT-conformance-182 (assert matrix rows, on a temp copy of `packages/assert/src` with one static and one outcome method emptied) and XT-conformance-183 (Mockery matrix rows, on a temp copy of `packages/mockery/src` with `once` made a no-op) -- proves the matrix.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- record 182-183 as taken; next free 184.

**Acceptance Criteria:**
- Given the repository, when `bun run assert:coverage` and `bun run mockery:coverage` run, then their output is identical to the baseline's and both exit 0.
- Given XT-assert-14 and XT-mockery-6, when `bun test` runs, then both pass unchanged.

## Spec Change Log

- 2026-10-18 (implementation): XT-mockery-6's "removed" scenario deletes `shouldIgnoreMissing` from `Mock.ts`'s API member list and expects exactly `shouldIgnoreMissing` and `zeroOrMoreTimes` missing. `Mockery.spy()` is `mock()->shouldIgnoreMissing()`, so a behavior probe of `spy` really fails there too. To keep XT-mockery-6 unchanged, `mockery:coverage` gained `BUILT_ON` (`spy` → `shouldIgnoreMissing`): a failing name isn't listed while a name it's built on is also missing. The report still exits 1 and names the cause. The `shouldHaveReceived` / `shouldNotHaveReceived` probes use a plain mock rather than a spy, so they don't depend on `shouldIgnoreMissing`. Needs the Maintainer's confirmation.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 16, false 4, maybe-false 4
- findings:
  - (blind) `[low]` `[reject]` Mockery probes chain through other scan names (`close`, `expects`, `atLeast` use `once`; count probes read `Mockery.close()`), so one broken name lists several — the report still fails and names the root name; the cascade is now pinned exactly by XT-conformance-183 (patch below), and a dependency table for every probe adds complexity for a rare multi-break.
  - (blind) `[low]` `[patch]` XT-conformance-183 uses `toContain` for the stubbed run's missing lines — patched: exact missing list and summary count asserted.
  - (blind) `[low]` `[reject]` A stub that only calls `recordAssertion` counts as implemented — that is the intent's stated bar ("an assert name records an assertion"); R5's case, an empty body, is caught.
  - (blind) `[maybe-false]` `[reject]` The scan's `static` flag no longer picks the probe surface — would need a scan line whose flag disagrees with Mockery's API to matter; if true only `low` (the scan is generated from Upstream by `scan:test-api`).
  - (blind) `[low]` `[patch]` Outer spawn timeout equals the inner fixture timeout; three runs can exceed the test timeout — patched: named inner constant, larger outer and test timeouts.
  - (blind) `[low]` `[reject]` `runReport`'s throw path, `readJsonl` errors and junit entity parsing are untested — the throw/usage/readJsonl behavior is moved verbatim from the baseline tools; adding tests for unchanged paths is beyond a direct correction.
  - (blind) `[low]` `[patch]` `SKIP_MESSAGE` doc says null but the comparison relies on `undefined` (AD-9) — patched: both sides normalized with `?? null`.
  - (blind) `[low]` `[patch]` `tools/coverage-report/**` missing from root `tsconfig.json` `include` — patched: added beside the other coverage tools.
  - (blind) `[low]` `[defer]` `packages/assert/README.md:49` still describes a presence check — `packages/**` cannot change on a `planning/*` branch; deferred.
  - (blind) `[maybe-false]` `[reject]` Calling every assertion with no arguments may run side effects in the reporting process — all 61 current names were called this way with no side effect observed; a future one would need to be shown; if true only `low`.
  - (blind) `[false]` `[reject]` `BUILT_ON` waits on an unrecorded Maintainer confirmation — `BUILT_ON` only hides `spy` while its base `shouldIgnoreMissing` is also missing, the report still exits 1, and the check is stricter than the baseline's presence test; it neither weakens the grader nor adds a divergence, so it is within the orchestrator's authority (MAINT-2026-10-16).
  - (edge) `[low]` `[reject]` A suppressed `spy` counts as implemented in the summary — XT-mockery-6 (read-only here) pins that summary at `scanCount - 5 implemented`; the report still exits 1.
  - (edge) `[maybe-false]` `[reject]` A never-settling assertion hangs the report — no assertion returns a promise today; would need such a grader change to show; `low` if true.
  - (edge) `[false]` `[reject]` `new TestCase()` throws outside a declared test — the constructor only registers state (`TestCase.ts:80-83`); verified by the passing repository run.
  - (edge) `[low]` `[patch]` Equal inner and outer timeouts — duplicate of the blind timeout finding; same patch.
  - (edge) `[false]` `[reject]` Malformed scan JSON gives a raw SyntaxError — the baseline tools behaved identically (`JSON.parse` unguarded); not caused by this change.
  - (edge) `[maybe-false]` `[reject]` `String.fromCodePoint` throws on an out-of-range junit entity — junit names are the tool's own ASCII labels; `low` if true.
  - (verification-gap) `[low]` `[patch]` No test breaks only one form, so `every` → `some` would pass unnoticed — patched: XT-conformance-182 adds a no-op `TestCase.assertSame` override with the static intact and expects `missing assert: assertSame`.
  - (verification-gap other) `[low]` `[reject]` `shouldAllowMockingProtectedMethods` probe passes a `return this` stub — JS mocks have no protected methods; the only effect is an internal flag no public surface reads.
  - (intent) `[false]` `[reject]` Mockery uses per-name effect probes (reading C) rather than "callable on a mock" — C is strictly stronger and is what R5's empty-stub concern needs; "callable" alone would accept `return this` stubs.
  - (intent) `[low]` `[reject]` Six names use an outcome probe, not "records an assertion" — they record nothing by PHPUnit design; the literal bar would fail the real grader.
  - (intent) `[low]` `[reject]` `BUILT_ON` exists to keep XT-mockery-6 exact — duplicate of the blind `BUILT_ON` row.
  - (intent) `[low]` `[reject]` Mutation tests cover few names — every Mockery probe was mutation-checked by hand during implementation (Spec Change Log, Auto Run Result); a full mutation suite is beyond a direct correction.
  - (intent) `[low]` `[reject]` The diff edits `story-manifests.md` and tests outside the listed tools — the intent names "their tests"; the manifest note keeps the XT-id ledger accurate and is a planning record.

## Design Notes

Outcome probe bodies (real method → pass, empty stub → fail by zero assertions or the body's throw): `expectException(RangeError)` then throw a `RangeError`; `expectExceptionMessage("boom")`, `expectExceptionMessageMatches(/bo+m/)` and `expectExceptionObject(new Error("boom"))` then throw `new Error("boom")`; `expectOutputString("probe")` then write `probe` to stdout; `markTestSkipped("probe")` must end with report `skipped: "probe"`.

Mockery probe examples: `once` -- a mock with `shouldReceive("f").once()` called twice makes `Mockery.close()` throw `InvalidCountException`; `zeroOrMoreTimes` -- `.once().zeroOrMoreTimes()` uncalled closes cleanly; `globally` -- two mocks with `.globally().ordered()` called out of order throw `InvalidOrderException`; `andReturnArg(1)` -- `f(5, 6) === 6`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/coverage-reports.test.ts packages/assert/tests/xaravel/expectations.test.ts packages/mockery/tests/xaravel/mockery.test.ts` -- expected: all pass.
- `bun run assert:coverage; bun run mockery:coverage` -- expected: exit 0, output as at baseline.
- `bun run typecheck && bun run lint && bun test` -- expected: pass.

## Auto Run Result

Status: done

**Summary:** `assert:coverage` and `mockery:coverage` now count a scan name only when calling it works. An assert name must record an assertion in each form it has (static and `TestCase` method). The six names that record nothing must pass a generated declared-test probe. Each Mockery name must pass its own effect probe in a fresh Mockery run. Both tools share `tools/coverage-report/report.ts` (findings R5, A2).

**Files changed:**
- `tools/coverage-report/report.ts`: new shared skeleton (`UsageError`, `parseArgs`, `readJsonl`, `runReport`).
- `tools/assert-coverage/coverage.ts`: recording probe per form, outcome-probe fixture for six names, `FIXTURE_TIMEOUT`.
- `tools/mockery-coverage/coverage.ts`: `PROBES` table (42 names), `BUILT_ON` (`spy` → `shouldIgnoreMissing`).
- `conformance/tests/xaravel/coverage-reports.test.ts`: XT-conformance-182 and XT-conformance-183.
- `tsconfig.json`: `tools/coverage-report/**/*.ts` added to `include`.
- `_bmad-output/implementation-artifacts/story-manifests.md`: XT-conformance-182 and -183 taken; the next free ID is 184.

**Review:** 24 findings. 5 patches applied (all `low`). 1 deferred: the stale `packages/assert/README.md:49`. 18 rejected; the reasons are in the Review Triage Log. Patched counts by verdict: high 0, medium 0, low 5.

**`BUILT_ON`:** this needs no Maintainer ruling. It only hides `spy` while its base `shouldIgnoreMissing` is also missing, and the report still exits 1. The check stays stricter than the baseline's presence test, so it neither weakens the grader nor adds a divergence.

**Follow-up review recommended:** false. No `high` patch was applied, and fewer than two `medium` patches were.

**Verification:**
- `bun run assert:coverage` and `bun run mockery:coverage`: output byte-identical to the baseline, both exit 0.
- `bun run typecheck` and `bun run lint`: clean.
- `bun test`: 152 pass, 0 fail, including XT-assert-14, XT-mockery-6 and XT-conformance-182/183.

**Residual risks:**
- `assert:coverage` now spawns a nested `bun test` (under 1 s).
- When one Mockery name breaks, the names whose probes chain through it are also listed. XT-conformance-183 pins that list exactly.
- A new scan name stays missing until someone adds a probe for it.
