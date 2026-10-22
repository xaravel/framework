---
test_ids:
  - XT-runtime-35
  - XT-runtime-36
trigger: divergence
proposed: >-
  Option 1 (recommended, a faithful port): the PHP throwable constructors
  take their arguments as PHP does in coercive mode, which is the mode the
  Oracle evaluates in and the mode of Laravel's own files. A `null`
  `$message` becomes `""` (PHP 8.1+ also raises a deprecation, which the
  port does not model), and a `$code` that PHP's coercive int parameter
  accepts (an integral float, a leading-numeric or numeric string, `true` /
  `false`) becomes that int. Everything PHP still rejects keeps PHP's
  `TypeError` and message. New Oracle rows in
  `conformance/oracle-requests/9.10.jsonl` (XT-runtime-36) cover `null`,
  `'5'`, `5.0`, `5.5`, `true` and `null` for `$code`, and the `ErrorException`
  arguments. `docs/exceptions.md` drops "PHP's coercions are not ported"
  for these constructors. No DIV is added. Option 2: keep the strict checks
  and record a new DIV clause for them (outside DIV-1..12, so the
  Maintainer's). Two related questions in the same intent contract, which
  the ruling should settle at the same time: (a) XT-runtime-35's matrix row
  says each of the seven entries listed under Import cycles, loaded first,
  publishes the 24-name map, but the Approach only requires that loading
  them does not throw, and the test asserts that `registry.ts`,
  `jsonEncode.ts` and `scope.ts` publish nothing. Recommended: the
  Approach's reading (only the four package indexes publish), with the
  matrix row amended. (b) `phpClasses.ts` has no opt-out, so a second
  copy of `@xaravel/runtime` loaded with `XARAVEL_NO_SCOPE_GLOBAL=1` (the
  documented second-copy opt-out, `docs/scope-frames.md`) now throws
  `LogicException` at import, before `scope.ts` reads the opt-out.
  Recommended: the same variable also skips the `xaravel.php.classes`
  install, with a fresh-process row in XT-runtime-35.
evidence: >-
  The intent contract of Story 9.10's spec puts "PHP's coercions" on its
  Never list, and `packages/runtime/tests/xaravel/exceptions.test.ts:307-309`
  asserts that `new php.Exception(null)` throws `Exception::__construct():
  Argument #1 ($message) must be of type string, null given`. The signed
  Oracle result for the same construction (XT-runtime-36 expr 20,
  `(new \Exception(null))->getMessage()`, fixture `8dea305e…`) is the value
  `""`: PHP accepted the null. The earlier triage rejected this as "the
  port behaves as PHP under `declare(strict_types=1)`, which the Oracle
  evaluator runs (`tools/oracle/evaluate.php:89`)". That is wrong:
  `strict_types` binds per file, and the evaluator runs every expr through
  `eval()` (`tools/oracle/evaluate.php:389-404`), whose code starts in
  coercive mode. The fixture is the proof. No DIV record covers scalar
  coercion (DIV-3 covers only `String` / `Number` / `Boolean` casts), so the
  Never-list line is a divergence decided locally, which AGENTS.md
  forbids. Raised by the 2026-10-22 review pass (Blind Hunter, Verification
  Gap) after ESC-9.10-1. Parts (a) and (b) are from the same pass (Intent
  Alignment, Edge Case Hunter): `phpClasses.ts:72-74` throws on a
  pre-defined symbol with no opt-out, and every index imports it before
  `scope.ts`.
---

# ESC-9.10-2: the exception constructors reject PHP's coercions, which the Oracle accepts

Story 9.10's throwable constructors check their arguments as PHP does under `declare(strict_types=1)`. The Oracle evaluates in coercive mode, and its signed fixture shows `new \Exception(null)` giving the message `""`. The port throws `TypeError` instead. No DIV clause covers this, so either the port follows the Oracle (option 1, recommended) or the Maintainer records a new DIV (option 2).

The ruling should also settle two smaller intent questions from the same review pass: (a) which entries publish the class map when loaded first, and (b) whether `XARAVEL_NO_SCOPE_GLOBAL=1` also skips the class-map install.

This stops XT-runtime-35 and XT-runtime-36. XT-runtime-37 (docs) is unaffected, apart from the "Not ported" wording option 1 would remove.
