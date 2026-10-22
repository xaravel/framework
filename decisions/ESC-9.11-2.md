---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-22
escalation_sha256: "3fa130eca56dfdfa0c751d252e964689a416dda20a033dc4e6304657523af47e"
---

# ESC-9.11-2: approved, option 1 (the grader reads only the float marker; an unmarked `-0` stays an int)

The grader decides a `number`'s PHP type from the runtime's float marker alone:

- A marked float (`[Symbol.for('xaravel.php.float')] === true`) is a PHP float, whatever its value. So `phpStrictEquals(1, 1.0)` is false and `assertSame(1, 1.0)` fails, as AC1 asks.
- An unmarked `number` keeps the grader's rule since Story 4.1 (`isInt`/`isFloat` in `packages/assert/src/comparison/PhpValues.ts`): a safe integer is an int. An unmarked `-0` is therefore an int, and `===`, `gettype`, `IsType`, PHPUnit's exporter, `phpToString`, `var_export` and `serialize` all read it the same way. XT-mockery-10 (`packages/mockery/tests/xaravel/mockery.test.ts:445-451`) stays as it is.
- A Ported Test whose assertion depends on a negative-zero float carries it with the marker, as `float(-0)`, under DIV-9.4, like every other integral float.
- The Story's docs say that the grader's rule differs from the runtime's `isFloat(-0)` (true) for an unmarked `-0` only.

Story 9.11 re-applies its saved attempt (`_bmad-output/implementation-artifacts/spec-9-11-attempt-1.patch`) with this rule: the reader changes the attempt made to `===`, `gettype`, `IsType` and PHPUnit's exporter for an unmarked `-0` are dropped, so no reader disagrees with the printers.

Rationale:

- **It is the faithful reading.** A PHP int is never negative zero, and a JS port of a PHP int expression (`-$x` for `$x = 0`, `0 * -1`, `Math.trunc(-0.4)`) yields an unmarked `-0`. Option 2 would make `assertSame(0, -$x)` fail where PHP passes it. DIV-9.4 already says a Ported Test carries a float that matters with the marker, so a negative-zero float that matters is marked.
- **It does not weaken the grader.** No assertion, expected value or skip is removed or added, and no `adapted:` marker is added outside DIV-9.4. AC1 makes the grader strictly stronger: a marked `1.0` no longer equals `1`. Today's behaviour for unmarked numbers is unchanged.
- **No new divergence, and no other Component changes.** It stays inside DIV-9.4 and needs no edit to `packages/mockery/**`, which Story 9.11 may not touch. It costs nothing at run time beyond the marker read AC1 already requires.
- **Option 1 over option 3.** Option 3 is the saved attempt, which the review rejected because the grader disagreed with itself (`assertSame(0, -0)` failed with "-0.0 is identical to 0" while `var_export` printed `0`).

This ruling clears XT-assert-17, the only Test ID ESC-9.11-2 stops. Story 9.11 stays `blocked` on ESC-9.11-1, which waits for the Maintainer.
