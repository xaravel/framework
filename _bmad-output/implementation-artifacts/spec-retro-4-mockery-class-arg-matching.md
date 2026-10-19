---
title: 'Retro 4 item 1: a closure in with() is never a class'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: 'a36b6c7ccbbeeb8d0ad70e5930c3dbf7bc8375d0'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The other isClass call sites still treat a `function` expression as a class: Mockery.type(fn) (instanceof and its printed name), a non-trailing function argument to Container::mock, and andThrow(fn).
    evidence: |-
      Pre-existing (8877869, 4.6); the intent names only _matchArg. Matcher/Type.ts:68,86, Container.ts:191, Expectation.ts:128,138 use the prototype rule. Natural home is action item epic-4-retro-item-3-one-php-value-layer, which consolidates the PHP value predicates.
    location: >-
      packages/mockery/src/Mockery/Matcher/Type.ts:68
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `Expectation._matchArg` (`packages/mockery/src/Mockery/Expectation.ts:417`) treats any function with an object `prototype` as a class, so `with(function handler() {})` matches the call argument `'handler'` (its name) and any instance created from that function with `new`. In PHP a Closure argument never equals a string and is never a class; it matches only by identity (`Expectation.php` 949-980). Epic 4 retrospective finding R2, action item `epic-4-retro-item-1-mockery-class-arg-matching`.

**Approach:** In `_matchArg`, a value counts as a class only by the rule `isClosure` already uses (its source is a `class`, or it carries the FQCN brand). Every other function falls through to the existing "any other object never matches" branch.

## Boundaries & Constraints

**Always:** Keep the existing class behaviour: a `class` value (or a branded FQCN class) matches an instance of it and its class-name string. Identity still matches first; a matcher still matches by `match()`. Put the class rule in `packages/mockery/src/support/values.ts` next to `isClosure` so the two cannot drift.

**Never:** Change `isClass`, `isClosure`, `Matcher/Type.ts`, `Container.ts` or `andThrow`; change the Oracle requests, signed fixtures or `scenarios.ts`; remove or weaken any existing assertion. Edit nothing outside `packages/mockery/**` and this spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Closure vs its name | `with(function handler() {})`, call `run('handler')` | no match | `NoMatchingExpectationException` |
| Closure as instanceof | `with(Ctor)` for `function Ctor() {}`, call `run(new Ctor())` | no match | `NoMatchingExpectationException` |
| Same closure | `with(f)`, call `run(f)` | match (identity) | none |
| Different closure | `with(function () {})`, call `run(function () {})` | no match | `NoMatchingExpectationException` |
| Class (unchanged) | `with(XtFoo)`, call with `new XtBar()` or `'XtFoo'` | match | none |

</intent-contract>

## Code Map

- `packages/mockery/src/Mockery/Expectation.ts:406-431` -- `_matchArg`; line 417 `isClass(expected)` is the defect. Its doc comment already says "any other object (a closure included) never matches".
- `packages/mockery/src/support/values.ts:46-67` -- `isClass` (prototype rule) and `isClosure` (class source or FQCN brand). The new predicate lives here.
- `packages/mockery/src/Mockery/Expectation.ts:14` -- imports from `../support/values`.
- `packages/mockery/tests/xaravel/mockery.test.ts:252-336` -- fixture-free test of class values in `with()`; the closure cases go here (plain `bun:test`, like the rest of the grader's own tests). `thrown` helper and `NoMatchingExpectationException` are already imported.
- Read-only: `Matcher/Type.ts:68`, `Container.ts:191`, `Expectation.ts:128,138` also use `isClass`; out of scope for this item.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/support/values.ts` -- add `isPhpClass(value)`: a function that is not a closure by `isClosure`'s rule; doc it as the class test for argument matching -- one rule shared with `isClosure`.
- `packages/mockery/src/Mockery/Expectation.ts` -- use `isPhpClass` in `_matchArg` instead of `isClass`; keep the cast for `instanceof` -- fixes R2.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- in the fixture-free class-value test, add the four closure rows of the I/O matrix -- regression cover.

**Acceptance Criteria:**
- Given the fixture-free test, when it runs, then every I/O matrix row holds, including the unchanged class rows.
- Given the change, when the whole mockery suite and the Oracle-backed XT-mockery-1..6 run, then they pass unchanged.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 17 findings — high 0, medium 4, low 6, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Built-in constructors (`Error`, `TypeError`, `Date`) now count as closures, so `with(Error)` no longer matches an instance or `'Error'` — confirmed by probe; `isPhpClass` now also accepts an object-prototype function whose source is native code; row `with(TypeError)` added.
  - `[low]` `[reject]` (blind) Same-closure and different-closure rows pass without the fix — true, but they are the specified matrix rows guarding identity and the no-match fall-through; the name and `new Ctor()` rows fail on the baseline (stash run).
  - `[medium]` `[defer]` (blind) Sibling `isClass` sites (`Type.ts:68,86`, `Container.ts:69,191`, `andThrow`) keep the prototype rule — pre-existing and outside the intent's `_matchArg`; deferred to the value-layer item 3.
  - `[low]` `[patch]` (blind) `isClass` doc does not say when to use which predicate — added a line pointing to `isPhpClass`/`isClosure`.
  - `[low]` `[patch]` (blind) `isPhpClass` doc overstates its rule — doc rewritten with the three cases.
  - `[false]` `[reject]` (blind) Verification does not run XT-mockery-1..6 or show baseline failure — `bun test packages/mockery` runs the single file holding XT-mockery-1..6 (8 tests); the implementer's stash run showed the new rows fail on the baseline.
  - `[low]` `[reject]` (blind) No try/finally around the new mocks — follows the file's existing pattern; a failing assertion already fails the test, and the container is purged at the test end.
  - `[medium]` `[patch]` (edge) Built-in class no longer matches — same root cause as the first row; same patch.
  - `[low]` `[patch]` (edge) A bound or Proxy-wrapped class is classed as a Closure — a bound function has no prototype (`isClass` was already false, no change); a Proxy prints as native code and is now accepted by the native-code patch.
  - `[low]` `[patch]` (edge) An FQCN-branded function with no prototype reaches `instanceof` and throws — `isPhpClass` now requires `isClass`.
  - `[medium]` `[patch]` (edge) Claim "keep existing class behaviour" broken for built-ins — same root cause as the first row; same patch.
  - `[false]` `[reject]` (edge) Oracle-backed XT-mockery-1..6 not observed — they are in `mockery.test.ts`, the one file run; all 8 tests pass.
  - `[medium]` `[patch]` (verification-gap) No test pins built-in constructor matching — added the `with(TypeError)` row.
  - `[false]` `[reject]` (verification-gap, other) The built-in change goes beyond the fix — moot after the patch restores built-ins.
  - `[false]` `[reject]` (intent) `Mockery.type(fn)` not covered under a broad reading — the intent names `_matchArg`; recorded as the deferred item, not a defect of this diff.
  - `[false]` `[reject]` (intent) Native-constructor change untested — moot after the patch and the new row.
  - `[false]` `[reject]` (intent) Generator functions are now closures — that is PHP's semantics (a generator function is a Closure), not a defect.

## Auto Run Result

Status: done

**Summary:** `Expectation._matchArg` decides "is a class" with the new `isPhpClass` (`packages/mockery/src/support/values.ts`): an object-prototype function whose source is a `class`, which carries the FQCN brand, or which is a native constructor. A `function` expression is a Closure and matches only by identity, never its name or as `instanceof` (retro finding R2).

**Files changed:**
- `packages/mockery/src/support/values.ts` -- `isPhpClass`; `isClass` doc points to the PHP predicates.
- `packages/mockery/src/Mockery/Expectation.ts` -- `_matchArg` uses `isPhpClass`.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- built-in constructor row and four closure rows in the fixture-free class-value test.

**Review:** 17 findings. Patched: the built-in constructor regression (medium; 4 reports, one root cause), the branded no-prototype `instanceof` throw (low), the bound/Proxy class (low), two doc rows (low). Deferred: sibling `isClass` sites (medium, to item 3). Rejected: 2 low and 7 false, with reasons in the triage log.

**Follow-up review:** not recommended. One medium root cause was patched, no high, and the patch is covered by a test.

**Verification:** `bun test packages/mockery` 8 pass / 0 fail (325 expects), with XT-mockery-1..6 included; `bun run typecheck` exit 0; `bun run lint` clean; `bun run mockery:coverage` exit 0. The closure rows fail on the baseline source (implementer's stash run).

**Residual risk:** native-code detection relies on Bun's `Function.prototype.toString` output for built-ins and Proxies.

## Verification

**Commands:**
- `bun test packages/mockery` -- expected: all pass.
- `bun run typecheck` -- expected: exit 0.
- `bun run lint` -- expected: no errors.
- `bun run mockery:coverage` -- expected: exit 0.
