---
title: 'Story 9.11: Grader follow-ups to the runtime value model'
type: 'feature'
created: '2026-10-22'
baseline_revision: '4deeb9697a032ed777266321dad2f12ce5db0641'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.11.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/ESC-4.1-1.md'
  - '{project-root}/decisions/ESC-4.3-1.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/conformance/escalations/ESC-9.11-1.md'
  - '{project-root}/packages/runtime/docs/values.md'
warnings: [multiple-goals]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 9.5 gave the runtime a float marker, but `@xaravel/assert` still treats every integral number as a PHP int, so `phpStrictEquals(1, float(1))` is false only by accident (the marker is an object), `float(1) === float(1)` is false, and `float(1) == 1` is false where PHP says true (ESC-4.1-1). And Laravel's `TestResponseAssert::appendMessageToException` rewrites a caught `ExpectationFailedException`'s message through reflection, which the grader's fixed `#message` does not allow (ESC-4.3-1 item 11).

**Approach:** Teach the grader's PHP value layer to read the float marker by its `Symbol.for('xaravel.php.float')` brand (no runtime import) wherever it branches on numbers, verified against a signed Oracle `===`/`==` matrix of integral floats (XT-assert-17). Add a `Symbol.for` protocol method on PHPUnit's `Exception` that rewrites `getMessage()` and the JS `message` together, which a graded port can call without importing the grader (XT-assert-19). XT-assert-18, AC4 and AC5 wait on `conformance/escalations/ESC-9.11-1.md`.

## Boundaries & Constraints

**Always:**
- Edit only `packages/assert/**`, this spec, the Story's status lines (`sprint-status.yaml`, `stories/9.11.md` `status:`), `conformance/oracle-requests/9.11.jsonl` (plus the fixtures the `xaravel-oracle` bot signs for it) and the Story's own Escalations.
- Grader isolation (AD-2, XT-assert-3): nothing in `packages/assert/src` or `packages/assert/tests` imports `@xaravel/runtime` or any graded package. The marker is read by brand only: a value is a *marked float* when it is a non-null object whose `[Symbol.for('xaravel.php.float')]` is `true`; its value is `Number(v)`.
- **PHP types of numbers** (one shared helper, used everywhere): a `bigint` is an int; a `number` is an int when `Number.isSafeInteger(v) && !Object.is(v, -0)`, else a float; a marked float is a float whatever its value. This matches the runtime's `isFloat` (`packages/runtime/src/php/PhpFloat.ts`).
- **`===`** (`phpStrictEquals`, so `assertSame`, `IsIdentical`, `willReturnMap` rows): two numeric values are identical only when both are ints with equal values, or both floats with `a === b` on their numeric values (`NAN` never; `0.0 === -0.0` true, as PHP). So `1 === float(1)` is false, `float(1) === float(1)` (two instances) is true, `float(0) === -0` is true. A marked float is never identical to a non-number.
- **`==`, ordering, and every other number reader** in `packages/assert/src` treat a marked float exactly as the plain `number` `Number(v)` with PHP type float: `phpLooseEquals`, `PhpOrder`, `gettype` (`"double"`), `isFloat`/`isInt`/`isScalar`/`isNumeric`/`toNumber` in `PhpValues.ts`, `IsType` `float`/`int`, `ScalarComparator`, `NumericComparator`, `ArrayComparator`, the exporter and `VarExport` (an integral float exports as `1.0`, as PHPUnit's exporter and `var_export` do). Every `typeof … === "number"` branch in `packages/assert/src` is checked against this rule.
- **Message rewrite protocol (AC3).** `PHPUnit\Framework\Exception.prototype` (so every PHPUnit exception) gets a non-enumerable method under `Symbol.for('xaravel.assert.setMessage')`. Called with a string, it sets what `getMessage()` returns to that string, and sets the JS `message` to that string followed by whatever suffix the class adds (`ExpectationFailedException`'s `\n--- Expected\n…\n+++ Actual\n…`); code, previous, cause and the comparison failure are unchanged; it returns `null`. A non-string argument throws a JS `TypeError` naming the protocol. The exported classes and prototypes stay frozen (the method is defined before freezing).
- Docs: `packages/assert/README.md` (or its docs page, wherever the grader documents its protocols) states the float rule and the `xaravel.assert.setMessage` protocol, with the Laravel call it serves.
- Xaravel Test conventions of `packages/assert/tests/xaravel/*.test.ts`: plain `bun:test`, header naming the Story, the F-10 note (the matrix has no Upstream test inputs: it is the ESC-4.1-1 follow-up), signed fixtures only, a missing or unsigned fixture fails, never skips.

**Never:**
- Edit `packages/mockery/**`, `conformance/oracle-requests/4.1.jsonl`, XT-assert-1's expected request count, `decisions/**`, `PORTING.md`, `stories/**` beyond the status line, `tools/**` or another package.
- Implement AC2 (SPL parents, `ExceptionComparator`, `expectException`), AC4 (PHPUnit double return values and defaults) or AC5 (late assertions): ESC-9.11-1 holds them.
- Add a named export to `@xaravel/assert`'s index for the protocol (graded code cannot import the grader); add `undefined` returns; use `JSON.stringify` on PHP values in `src/`.
- Create a marker of its own in `src/`: the grader only reads the runtime's brand.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Oracle matrix (XT-assert-17) | request `XT-assert-17` in `9.11.jsonl`: `$v` of ints, integral and non-integral floats (`0`, `1`, `-1`, `100`, `0.0`, `-0.0`, `1.0`, `-1.0`, `100.0`, `9007199254740992.0`, `0.5`, `INF`, `NAN`), numeric strings (`"1"`, `"1.0"`), `true`, `null`; exprs `$v`, the `===` matrix, the `==` matrix | decoded with every PHP float as a test-local branded float object (the brand only, as `BrandedArray` simulates the array brand), each cell of `phpStrictEquals`/`phpLooseEquals` equals the Oracle's | missing/unsigned fixture fails |
| Real marker (XT-assert-17) | fresh `bun` subprocess from the repo root importing `float` from `packages/runtime/src/index.ts` and the grader from `packages/assert/src/index.ts` | `phpStrictEquals(1, float(1))` false; `float(1)`/`float(1)` true; `phpLooseEquals(float(1), 1)` true; `assertSame(1, float(1))` throws `ExpectationFailedException` with PHPUnit's message (`Failed asserting that 1.0 is identical to 1.` form, values exported as PHPUnit does); `assertSame(float(1), float(1))` passes; `assertEquals(1, float(1))` passes; `gettype` `double` | — |
| Rewrite (XT-assert-19) | caught failure of `assertSame("a", "b")` (an `ExpectationFailedException` with a comparison failure); `e[Symbol.for('xaravel.assert.setMessage')](e.getMessage() + "\n\n" + extra + "\n")`, Laravel's `appendMessageToException` text | `getMessage()` is the new text; JS `message` is the new text + the Expected/Actual suffix; `getComparisonFailure()`, `getCode()`, `getPrevious()` unchanged; returns `null`; works on a plain `AssertionFailedError` too (no suffix); class and prototype still frozen | non-string argument: JS `TypeError` |

</intent-contract>

## Code Map

- `packages/assert/src/comparison/PhpValues.ts:23-96` -- `isInt`/`isFloat` (`Number.isSafeInteger`), `gettype` (`:64`), `isScalar`, `isNumeric`, `toNumber`: the shared number helpers; put the marker reader and the PHP number type here.
- `packages/assert/src/comparison/PhpComparison.ts:278` (`numbersIdentical`), `:463` (`strict`), `:437` and `:93` (`isBuiltIn`: a marked float's chain reaches `Number.prototype`, so today it is "== only to itself"), `:507` (`phpStrictEquals`) -- the `===` and `==` paths.
- `packages/assert/src/comparison/PhpOrder.ts` -- PHP ordering; unwrap the marker.
- `packages/assert/src/Framework/Constraints.ts:46` (`IsIdentical`), `:250-256` (`IsType` float/int); `Framework/Assert.ts:90-110` (`assertThat`, `assertSame`).
- `packages/assert/src/comparator/{ScalarComparator,NumericComparator,ArrayComparator}.ts` -- `accepts`/`assertEquals` number branches (`ScalarComparator.ts:70`, `NumericComparator.ts:10-48`, `ArrayComparator.ts:25`).
- `packages/assert/src/exporter/Exporter.ts:117-118`, `exporter/VarExport.ts:37,90` -- number export (`isSafeInteger ? String : exportFloat`).
- `packages/assert/src/Framework/Exception/Exception.ts:11-47` -- `#message` (readonly), constructor; `Framework/ExpectationFailedException.ts` -- the JS `message` suffix; `Framework/AssertionFailedError.ts`.
- `packages/assert/src/index.ts:67-69` -- freezing of exported classes and prototypes.
- `packages/runtime/src/php/PhpFloat.ts` (read-only) -- the brand: a prototype getter `[Symbol.for("xaravel.php.float")]` returning `true` on a frozen `Number` subclass.
- `packages/assert/tests/xaravel/comparison.test.ts:18-37` (XT-assert-1 idiom), `:205-241` (XT-assert-3 isolation and frozen exports) -- keep both passing.
- `packages/assert/tests/xaravel/oracle-values.ts:72-150` -- `decodeFloat`, `decode`, `readRequests`, `readSignedFixture`, `matrixMismatches`, `LOOSE_EXPR`/`STRICT_EXPR`; add an option to decode floats as branded objects without changing XT-assert-1's decoding.
- `packages/assert/tests/xaravel/expectations.test.ts:452-480` -- the subprocess idiom (`Bun.spawnSync([process.execPath, …], { cwd: root })`).
- `conformance/oracle-requests/4.1.jsonl` (read-only) -- request shape (`id`, `kind: "php-expr"`, `input.setup`, `input.exprs`, `sha256`); `bun run oracle:story` writes and checks a Story's request file.
- `conformance/upstream/framework/src/Illuminate/Testing/TestResponseAssert.php:168-178` (read-only) -- `appendMessageToException`.
- `conformance/tests/xaravel/php-fixtures/phpunit/vendor/phpunit/phpunit/src/` (read-only, gitignored) -- PHPUnit 13.4.3 source, for the exporter's float form and messages.
- Local PHP 8.5.11 at `/opt/homebrew/bin/php`; `tools/oracle/evaluate.php` to check the request before pushing (as Story 9.10's Verification).

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/comparison/PhpValues.ts` -- marker reader and PHP number type; route every number predicate through them.
- `packages/assert/src/comparison/{PhpComparison,PhpOrder}.ts`, `src/Framework/Constraints.ts`, `src/comparator/*.ts`, `src/exporter/{Exporter,VarExport}.ts` -- apply the float rule; update comments citing "until Story 9.11"/ESC-4.1-1's interim rule.
- `packages/assert/src/Framework/Exception/Exception.ts`, `src/Framework/ExpectationFailedException.ts` -- the `xaravel.assert.setMessage` protocol (subclass suffix kept by a protected hook, not by re-parsing the message).
- `packages/assert/README.md` (or the grader's docs page) -- the float rule and the protocol.
- `conformance/oracle-requests/9.11.jsonl` -- the XT-assert-17 request; check it with local `evaluate.php` and `bun run oracle:story check 9.11`.
- `packages/assert/tests/xaravel/runtime-values.test.ts` (new) -- XT-assert-17 (matrix rows and the real-marker subprocess) and XT-assert-19 (rewrite rows), with the header conventions above.
- `packages/assert/tests/xaravel/oracle-values.ts` -- branded-float decoding option.

**Acceptance Criteria:**
- Given Story 9.5's float marker, when `phpStrictEquals(1, 1.0)` and `assertSame(1, 1.0)` run, then they are false and fail, as in PHP (XT-assert-17).
- Given a caught assertion failure, when Laravel's `TestResponseAssert` appends to its message, then the supported `xaravel.assert.setMessage` protocol rewrites it (XT-assert-19).
- Given the whole grader suite, when it runs, then XT-assert-1..16 and the mockery suite still pass.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the XT-assert-17 fixture and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

- 2026-10-22: planning found that the manifest maps Xaravel Tests to only the first three of the five ACs now in `epics.md`, and that AC2's Mockery half needs `packages/mockery/**`, outside `story/9.11`'s allowed paths (Epic 9 is strict). Raised `conformance/escalations/ESC-9.11-1.md` (`protected-path`, XT-assert-18). The Story carries on with XT-assert-17 and XT-assert-19. ESC-4.1-1 names `4.1.jsonl` for the `===` matrix, which `story/9.11` cannot write; under the MAINT ruling ("choose the recommended or best-case option") the matrix goes in `9.11.jsonl` under XT-assert-17, recorded in ESC-9.11-1 for the Maintainer.

## Review Triage Log

## Design Notes

- **Brand, not import.** The marker is a frozen `Number` subclass instance, so `typeof` is `"object"`; reading `v[Symbol.for('xaravel.php.float')] === true` on a non-null object is enough and cannot throw (the runtime's getter is a plain prototype getter).
- **Why a protocol method for AC3.** Graded packages may take the grader only as a devDependency (`tools/graph/graph.ts`), so the Testing port of `appendMessageToException` cannot import a setter; it calls the method when the caught exception has it. A writable `message` read by `getMessage()` was rejected: `ExpectationFailedException`'s JS `message` carries the diff suffix, so reading and writing it would not round-trip.

## Verification

**Commands:**
- `bun run oracle:story check 9.11` -- expected: the request is accepted.
- `php tools/oracle/evaluate.php <Laravel at the Pin outside the repo> 8.5.11 <now> conformance/oracle-requests/9.11.jsonl` -- expected: results match the JS side.
- `bun test packages/assert packages/mockery` and `bun run harness --xaravel --id 'XT-assert-*'` -- expected: pass once the fixture is pulled (XT-assert-17 fails only for the missing fixture before then).
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check`, `bun run ownership:check` (if present) -- expected: clean.
