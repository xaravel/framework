---
test_ids:
  - XT-runtime-27
  - XT-runtime-30
trigger: contract
proposed: >-
  (1) The error classes. `json_encode` / `json_decode` under
  `JSON_THROW_ON_ERROR` throw PHP's `JsonException`, and `json_decode`
  with a depth below 1 throws PHP's `ValueError`. Both classes belong to
  Story 9.10, which ports PHP's exception hierarchy in the same package.
  Option 1a (recommended): until Story 9.10 lands, `jsonEncode` /
  `jsonDecode` throw an `Error` with PHP's message and a numeric `code`
  property holding PHP's code (the `JSON_ERROR_*` code, or 0 for the
  `ValueError`), under DIV-9.8. XT-runtime-27 and XT-runtime-30 assert
  the Oracle's message and code and record the Oracle's class. Story
  9.10 switches the throws to `JsonException` / `ValueError` and asserts
  the class, as ESC-9.7-1 part 4 did for the Closure error. Option 1b:
  Story 9.8 lands `JsonException` and `ValueError` early, which takes
  part of Story 9.10's scope.
  (2) `json_last_error()` / `json_last_error_msg()`. Laravel reads them
  in `Encrypter`, `JsonResponse`, `Cursor` and other classes (counted in
  the evidence), and PHP keeps
  them in per-request global state. AD-5 makes per-request state a
  Scope Frame slot, and a slot write with no active frame throws
  `ScopeFrameException`, so the codec cannot record an error outside a
  frame. Option 2a (recommended): Story 9.8 adds `jsonLastError()` /
  `jsonLastErrorMsg()` to `@xaravel/runtime/php`, backed by a frame
  slot. `jsonEncode` / `jsonDecode` record each call's code in the slot
  when a frame is active and do not record outside one; the reads give
  the last in-frame value, or `0` / `No error` outside a frame or before
  any call. `JSON_THROW_ON_ERROR` without `JSON_PARTIAL_OUTPUT_ON_ERROR`
  leaves the record untouched, as PHP does. Option 2b: the first
  consuming Story (Encryption or HTTP) adds them, in
  `packages/runtime/**` through its own Escalation.
  (3) Property order. A decoded `stdClass` (and an unserialized object)
  lists its integer-like property names first in JS, because a JS object
  enumerates array-index keys before the others, so re-encoding
  `{"b":1,"1":2}` gives `{"1":2,"b":1}` where PHP keeps the input order.
  Option 3a (recommended): record it as an AD-9 limit; the first
  consumer Story whose Upstream test depends on it raises its own
  Escalation. Option 3b: an ordered property store for `stdClass`, which
  changes the AD-9 object model.
evidence: >-
  Story 9.8 AC 1 and AC 4 (`epics.md` line 3156) ask for PHP's
  `json_encode` / `json_decode` behaviour; PHP 8.5.11 throws
  `JsonException` with the `JSON_ERROR_*` code (local PHP 8.5.11:
  `json_encode(INF, JSON_THROW_ON_ERROR)` throws `JsonException`
  `Inf and NaN cannot be JSON encoded` with code 7), and
  `json_decode('1', true, 0)` throws `ValueError`
  `json_decode(): Argument #3 ($depth) must be greater than 0`.
  `PORTING.md` § Exceptions names `JsonException` and `ValueError` among
  the classes Story 9.10 ports, and DIV-9.8 covers a JS `Error` in their
  place until then. `json_last_error()` after a call without
  `JSON_THROW_ON_ERROR` returns its code, while a throwing call leaves
  the previous code (local PHP 8.5.11: `json_decode('[')` then a
  throwing `json_decode('{', true, 512, JSON_THROW_ON_ERROR)` leaves 4).
  `grep -rn json_last_error conformance/upstream/framework/src | wc -l`
  gives 15 calls, and `grep -rln` gives 12 files, among them
  `Encryption/Encrypter.php`, `Http/JsonResponse.php` and
  `Pagination/Cursor.php`. AD-5 and `@xaravel/runtime/scope`
  (`frameSlot`) make such state a frame slot, and a write with no frame throws. The spec
  `_bmad-output/implementation-artifacts/spec-9-8-jsonencode-jsondecode-with-php-flag-semantics.md`
  (Boundaries, Never) defers parts 1 and 2 to this Escalation. For
  part 3, local PHP 8.5.11 gives `json_encode(json_decode('{"b":1,"1":2}'))`
  as `{"b":1,"1":2}`, and a JS object with keys `b`, `1` lists `1` first.
  Story 9.8 ships with option 1a's interim throws and without option
  2's functions. Every other row of XT-runtime-27..30 passes against the
  output of local PHP 8.5.11 for the same requests
  (`tools/oracle/evaluate.php` over a locked install of the framework
  snapshot); the signed fixtures are written by `oracle.yml#story` after
  the PR is pushed.
---

# ESC-9.8-1: JsonException, ValueError and `json_last_error()` for the JSON codec

Story 9.8 makes `jsonEncode` / `jsonDecode` byte-identical to PHP's `json_encode` / `json_decode` across the `JSON_*` flags, with PHP's error codes and messages. Two parts of PHP's error contract need a ruling that no AD gives today: the classes PHP throws (`JsonException`, `ValueError`), which Story 9.10 owns, and the per-request `json_last_error()` record, which AD-5 says must live in a Scope Frame slot. A third part is a limit of the AD-9 object model: a JS object cannot keep PHP's order for integer-like property names. This Escalation asks for a ruling on each. Work on XT-runtime-27 and XT-runtime-30 is complete apart from the class of the thrown error.
