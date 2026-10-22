---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "c7522c17198f2a488d4727875d553fe9b8aed097db100e3b991bf9639a5c2b69"
---

# ESC-9.10-2: approved, option 1 (the throwable constructors coerce as PHP does), with (a) and (b) as recommended

## Coercion: option 1

The port follows the Oracle. Laravel's files and the Oracle's `eval()` code both run in PHP's coercive mode, and `strict_types` binds per file. The signed fixture (`8dea305e…`, XT-runtime-36 expr 20) shows `(new \Exception(null))->getMessage()` giving `""`. So the PHP throwable constructors take their arguments as PHP does in coercive mode:
- A `null` `$message` becomes `""`. PHP 8.1+ also raises a deprecation, which the port does not model.
- A `$code` that PHP's coercive `int` parameter accepts becomes that int: an integral float, a numeric or leading-numeric string, `true` or `false`.
- Every argument PHP still rejects keeps PHP's `TypeError` and its message.

This adds no DIV. It removes a divergence that was decided locally, which AGENTS.md forbids. Option 2, strict checks with a new DIV clause, is not taken. It would keep a known difference from PHP that the Oracle has already shown.

Story 9.10 lands this as a follow-up on `story/9.10`, within `packages/runtime/**`:
- **Constructors:** the change to the throwable constructors.
- **Oracle rows:** new rows in `conformance/oracle-requests/9.10.jsonl` for XT-runtime-36, covering `$code` values `null`, `'5'`, `5.0`, `5.5` and `true`, a `null` `$message`, and the `ErrorException` arguments. Each row is checked against local `evaluate.php` before pushing.
- **Tests:** `exceptions.test.ts` asserts the Oracle's values in place of the strict `TypeError`s.
- **Docs:** `docs/exceptions.md` drops "PHP's coercions are not ported" for these constructors.
- **Spec:** the Never-list line goes from the Story's spec.

## (a) Which entries publish the class map

The Approach's reading is ruled. Only the four package indexes publish the 24-name map when loaded first. Loading the other Import-cycle entries first must not throw, and they publish nothing. XT-runtime-35's matrix row is amended to say so, which matches what the test already asserts.

## (b) The second-copy opt-out

`XARAVEL_NO_SCOPE_GLOBAL=1`, the documented opt-out for a second copy of `@xaravel/runtime` (`docs/scope-frames.md`), also skips the `xaravel.php.classes` install in `phpClasses.ts`. A second copy loaded with it then imports without a `LogicException`. XT-runtime-35 gains a fresh-process row for it, and `docs/scope-frames.md` names the class map among what the variable skips.

## Rationale

- **The Oracle is the specification.** The port's strict checks contradicted a signed fixture, so they were wrong, not a choice.
- **The grader is unchanged.** No assertion, expected value or skip is weakened. XT-runtime-36 gains Oracle rows, and its strict-`TypeError` assertions become the Oracle's values.
- **(a) and (b) are the loop's recommendations.** Both keep behaviour safe at load time and add test rows.

This ruling clears ESC-9.10-2 for XT-runtime-35 and XT-runtime-36. Story 9.10 resumes at `in-progress` to land it.
