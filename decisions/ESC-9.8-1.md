---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "ba09dd18f09e79d1f52eb655935c79b1664e580a5d00c92abd719efa398982a0"
---

# ESC-9.8-1: approved, options 1a, 2a and 3a

None of the three parts weakens the grader, adds a divergence outside DIV-1..12, or moves Xaravel away from a faithful port of Laravel on Bun. The orchestrator therefore rules on all three (MAINT-2026-10-16). Each part takes the Escalation's recommended option, as `decisions/ESC-9.7-1.md` did for the codec's matching questions.

## 1. The error classes: option 1a

Until Story 9.10 ports `JsonException` and `ValueError`, `jsonEncode` / `jsonDecode` throw a JS `Error` that carries PHP's message and a numeric `code`. The code is the `JSON_ERROR_*` code, or `0` for the depth `ValueError`. DIV-9.8 already covers an `Error` standing in for PHP's classes until Story 9.10 publishes the `\Error` / `\Exception` split. XT-runtime-27 and XT-runtime-30 assert the Oracle's message and code, and the signed fixtures keep the Oracle's class.

When Story 9.10 ports the two classes, it switches these throws to `JsonException` / `ValueError` in the same package and asserts the class in XT-runtime-27 and XT-runtime-30, as it does for the Closure error (ESC-9.7-1 part 4). Its line in sprint status points to this part.

Option 1b would move part of Story 9.10's scope into Story 9.8, so it is not taken.

## 2. `json_last_error()` / `json_last_error_msg()`: option 2a

Story 9.8 adds `jsonLastError()` / `jsonLastErrorMsg()` to `@xaravel/runtime/php`, backed by a Scope Frame slot (AD-5):

- Inside an active frame, `jsonEncode` / `jsonDecode` record each call's `JSON_ERROR_*` code in the slot, `JSON_ERROR_NONE` included.
- A call under `JSON_THROW_ON_ERROR` without `JSON_PARTIAL_OUTPUT_ON_ERROR` leaves the record untouched, as PHP 8.5 does.
- Outside a frame, the codec does not record, because a slot write with no frame throws `ScopeFrameException`.
- The reads give the last in-frame value. Outside a frame, or before any call in the frame, they give `0` / `No error`.
- The Story verifies this with local XT rows. Where an Oracle request can express a sequence, the Story also verifies it with Oracle rows, such as `json_decode('[')`, then a throwing `json_decode`, then `json_last_error()`, which gives 4.

Laravel reads these functions in 12 Upstream files. The first consumer would otherwise need its own Escalation into `packages/runtime/**`. Option 2b defers that work without avoiding it, so it is not taken.

## 3. Property order of a decoded `stdClass`: option 3a

A JS object enumerates array-index keys first, so a decoded `stdClass` (or an unserialized object) with integer-like property names does not keep PHP's property order. This is a limit of the AD-9 object model, recorded here. No divergence clause is added and no test is adapted. XT-runtime-30 compares properties by name, as `codec.test.ts` does.

The first consumer Story whose Upstream test depends on this order raises its own Escalation (FR-114), with that test as evidence. Associative decoding is unaffected: it returns a `PhpArray`, which keeps PHP key order (AD-9). Option 3b, an ordered property store for `stdClass`, changes the AD-9 object model in the spine. That choice stays with the Maintainer and is not taken here.

## Rationale

- **The grader is unchanged.** No assertion, expected value, skip or `adapted:` marker changes. Part 2 adds rows; it removes none.
- **Each option keeps to PHP or moves toward it.** Part 1 matches PHP's message and code now, and its class once Story 9.10 lands. Part 2 adds PHP's error record. Part 3 keeps AD-9 as written and leaves the spine to the Maintainer.
- **No measurable cost.** The slot write is one store per call, and only inside a frame.

This ruling clears XT-runtime-27 and XT-runtime-30. Story 9.8 is unblocked and resumes at `in-progress` to land part 2.
