---
test_ids:
  - XT-assert-17
trigger: contract
proposed: >-
  Option 1 (recommended): the grader reads only the marker. A marked float
  (`[Symbol.for('xaravel.php.float')] === true`) is a PHP float whatever its
  value; an unmarked `number` keeps the grader's Epic 4 rule, so a plain
  `-0` stays an int, as XT-mockery-10 pins ("-0 is an integral float, which
  reads as an int (DIV-9)"), and `phpToString`, `var_export`, `serialize`,
  PHPUnit's exporter, `gettype` and `===` all agree on it. A Ported Test
  whose assertion depends on a negative-zero float carries it as
  `float(-0)` under DIV-9.4, as for every other integral float. The
  grader's rule then differs from the runtime's `isFloat(-0)` (true) for an
  unmarked `-0` only; the Story's docs say so. Option 2: the grader follows
  the runtime's `isFloat` exactly, so an unmarked `-0` is a float
  everywhere (`gettype` "double", `assertSame(0, -0)` fails, `phpToString`
  "-0", `var_export` "-0.0", `serialize` "d:-0;"), and XT-mockery-10's two
  `-0` expectations change to PHP's float forms in a Mockery change.
  Option 3: Option 2 in every reader except the three printers
  XT-mockery-10 pins, which keep printing `0` (the attempt saved in
  `_bmad-output/implementation-artifacts/spec-9-11-attempt-1.patch`); the
  review found this leaves the grader disagreeing with itself.
evidence: >-
  The Story's spec made the grader's number rule match the runtime's
  `isFloat` (`packages/runtime/src/php/PhpFloat.ts:43-45`: a `number` is a
  float when it is not a safe integer or is `-0`). The grader's rule since
  Story 4.1 is `Number.isSafeInteger` (`packages/assert/src/comparison/PhpValues.ts`
  `isInt`/`isFloat`), and XT-mockery-10
  (`packages/mockery/tests/xaravel/mockery.test.ts:445-451`) pins
  `phpToString(-0)` and `phpVarExport(-0)` as `0`. Story 9.11 may not edit
  `packages/mockery/**`. The attempt applied the new rule to `===`,
  `gettype`, `IsType` and PHPUnit's exporter but kept the old forms in the
  three printers; the review found that `assertSame(0, -0)` now fails with
  "-0.0 is identical to 0" while `var_export` prints `0`, and that a JS
  port of a PHP int expression (`-$x` for `$x = 0`, `0 * -1`,
  `Math.trunc(-0.4)`) yields an unmarked `-0`, so Option 2 would fail
  assertions PHP passes. AC1 itself (`epics.md` line 3239) is about the
  marker and says nothing about an unmarked `-0`.
---

# ESC-9.11-2: what the grader does with an unmarked `-0`

Story 9.11 makes the grader read the runtime's float marker. Its spec also made an unmarked `-0` a float, to match the runtime's `isFloat`, but the grader has read it as an int since Story 4.1, and XT-mockery-10 (a Mockery test the Story cannot edit) pins that. The first attempt split the difference, and the review rejected the result as inconsistent. Which rule the grader keeps changes another component's test, so the choice is not the Story's to make alone.

This stops XT-assert-17. The attempt is saved in `_bmad-output/implementation-artifacts/spec-9-11-attempt-1.patch` (the XT-assert-17 and XT-assert-19 work), to be re-applied once this is ruled.
