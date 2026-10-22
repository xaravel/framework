---
title: 'Story 9.8: `jsonEncode` / `jsonDecode` with PHP flag semantics'
type: 'feature'
created: '2026-10-21'
status: 'blocked'
baseline_revision: 'f63369d9bdd259166d115062d8db3087066f066b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.8.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/ESC-9.4-1.md'
warnings: [oversized]
deferred:
  - summary: >-
      JSON_THROW_ON_ERROR and the depth argument errors throw a JS Error with PHP's message and code, not JsonException / ValueError.
    evidence: |-
      Story 9.10 ports both classes. Raised as conformance/escalations/ESC-9.8-1.md part 1; both Fidelity reviewers rejected F-2 pending its ruling.
    location: >-
      packages/runtime/src/php/jsonConstants.ts, packages/runtime/src/php/jsonDecode.ts
    severity: medium
  - summary: >-
      No json_last_error() / json_last_error_msg(), which Laravel calls 15 times in 12 files.
    evidence: |-
      Per-request state must be a Scope Frame slot (AD-5), and a slot write with no frame throws. ESC-9.8-1 part 2.
    location: >-
      packages/runtime/src/php/jsonEncode.ts, packages/runtime/src/php/jsonDecode.ts
    severity: medium
  - summary: >-
      A decoded stdClass lists integer-like property names first, so re-encoding {"b":1,"1":2} gives {"1":2,"b":1}.
    evidence: |-
      JS orders integer-like own keys first; phpUnserialize shares the limit. ESC-9.8-1 part 3.
    location: >-
      packages/runtime/src/php/jsonDecode.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** AD-23.1 makes `@xaravel/runtime/php` the only home of `jsonEncode(value, flags)` / `jsonDecode`, with PHP flag semantics, the `JsonSerializable` / `Arrayable` / `Jsonable` hooks, AD-9 list rules and exact `bigint` digits. Today only Story 9.4's default-flags core exists (ESC-9.4-1 part 2): no flags, no floats, no hooks, no `bigint`, no decoder. So responses, payloads and Differential Tests cannot produce Laravel's bytes.

**Approach:** Grow `jsonEncode.ts` into PHP 8.5's `json_encode` (`ext/json/json_encoder.c`) and add `jsonDecode.ts` as PHP's `json_decode` (`json_parser.y` / `json_scanner.re`), over the AD-9 value model. Export PHP's `JSON_*` constants. Verify against signed Oracle fixtures from `conformance/oracle-requests/9.8.jsonl`: XT-runtime-27 covers the flags, 28 the hooks, 29 `bigint` and 30 decoding.

## Boundaries & Constraints

**Always:**
- Edit only:
  - `packages/runtime/**`;
  - this spec;
  - the Story's status lines (`sprint-status.yaml`, `stories/9.8.md`);
  - `conformance/oracle-requests/9.8.jsonl` and the fixtures the `xaravel-oracle` bot signs for it;
  - the Story's own Escalation, `conformance/escalations/ESC-9.8-1.md`.
- Keep the runtime sync (AD-6). Never return `undefined` (AD-9.1); `undefined` input reads as `null`.
- **Import-cycle rule.** `registry.ts` imports `jsonEncode.ts`. So `jsonEncode.ts` may import only modules that call no Registry function at load time, directly or transitively. That rules out `casts.ts`, `isNumeric.ts`, `PhpArray.ts`, `PhpFloat.ts`, `stdClass.ts`, `phpSerialize.ts` and every class file. Shared logic it needs moves into a load-safe internal module, and the old importers import it from there. One implementation each (lessons, epic 4).
- `jsonEncode(value, flags = 0, depth = 512): string | false`, as PHP's `json_encode`:
  - **Errors.** On an error it returns `false`. With `JSON_PARTIAL_OUTPUT_ON_ERROR` it returns the partial string. With `JSON_THROW_ON_ERROR` and without the partial flag, it throws PHP's message and code.
  - **Error codes, in PHP's order.** Without the partial flag, the first error stops encoding. With it, encoding continues, the last error code wins, and each failed value writes its stand-in:
    - unsupported type (a symbol) → `null`;
    - malformed string (a lone surrogate) → `null`;
    - `INF` / `NAN` → `0`;
    - recursion → `null`;
    - depth beyond `depth` → the full value is still written.
  - **Floats** use `serialize_precision = -1` with lower-case `e` (`1.0e+25`, `-0`). `JSON_PRESERVE_ZERO_FRACTION` appends `.0` when the text has no `.` and no `e`.
  - **Ints:** a `bigint` is written as its exact digits. A marked float is a float.
  - **Strings:**
    - PHP's escapes, with lower-case `\uXXXX` and surrogate pairs. `JSON_HEX_*` uses upper-case `<`, `>`, `&`, `'` and `"`.
    - `JSON_UNESCAPED_SLASHES` and `JSON_UNESCAPED_UNICODE` turn those escapes off. Under `JSON_UNESCAPED_UNICODE`, U+2028/2029 stay escaped unless `JSON_UNESCAPED_LINE_TERMINATORS` is set.
    - `JSON_INVALID_UTF8_IGNORE` / `_SUBSTITUTE` drop a lone surrogate or replace it with `�` (U+FFFD when output is unescaped).
    - `JSON_NUMERIC_CHECK` writes a numeric string (PHP's `is_numeric_string`, without errors) as an int or float. A float that is not finite stays a string.
  - **Arrays:** the list rule (AD-9.2). `JSON_FORCE_OBJECT` makes every array an object. An empty array is `[]`, or `{}` when forced.
  - **Pretty print:** 4 spaces, `": "` between key and value, and an empty `[]` / `{}` stays inline.
- **Hooks** (Laravel's `Js::jsonEncode`, `Support/Js.php:113-121`, and `JsonResponse::setData`, `Http/JsonResponse.php:83-88`). Brands are `Symbol.for('<FQCN>')`, detected with `hasBrand` and never by import:
  - **Top level only:** `Illuminate\Contracts\Support\Jsonable` returns `value.toJson(flags)` as it is. Otherwise `Illuminate\Contracts\Support\Arrayable` without `JsonSerializable` encodes `value.toArray()`.
  - **At every level (PHP):** `JsonSerializable` encodes `jsonSerialize()`'s result. A result that is the object itself encodes its properties.
  - **Any other object** is always a JSON object of its public properties: the class's property table (public slots and dynamic keys, the same reader `phpSerialize` uses), else `[Symbol.for('xaravel.php.props')]()`, else its own enumerable string keys. Mangled `\0` names are skipped. A function (a `Closure`) is `{}`.
- `jsonDecode(json, associative = null, depth = 512, flags = 0): unknown`, as PHP's `json_decode`:
  - **Errors.** It returns `null` on an error. With `JSON_THROW_ON_ERROR` it throws PHP's message and code.
  - **Depth.** `depth < 1` throws PHP's message `json_decode(): Argument #3 ($depth) must be greater than 0`. Nesting `>= depth` is a depth error; encoding fails only when nesting is `> depth`.
  - **Objects:**
    - **As arrays.** With `associative === true`, or `null` plus `JSON_OBJECT_AS_ARRAY`, an object becomes an AD-9 array through `arrayFromEntries`: keys are normalised, a repeated key keeps its first position and its last value, `{}` becomes `[]`, and an all-integer-key run becomes a list.
    - **As `stdClass`.** Otherwise it becomes a `stdClass` with the keys verbatim, defined with `defineProperty`. A key starting with `\0` is error 9.
  - **Numbers:** PHP's grammar. An int becomes an AD-9 int (`intKey`, so `-0` is `0`). An int beyond int64 becomes a float, or a digit string with `JSON_BIGINT_AS_STRING`. A fraction or exponent gives a float, and an integral float is marked with `float()`.
  - **Strings:**
    - A `\u` escape that leaves an unpaired surrogate is error 10.
    - A raw control character below 0x20 is error 3.
    - A raw lone surrogate is error 5, unless the `INVALID_UTF8` flags apply.
    - Whitespace is only ` \t\n\r`.

**Never:**
- Change `phpSerialize`'s bytes or behaviour, or `writeClassmap`'s bytes.
- Add a new package subpath, use `JSON.stringify` / `JSON.parse` or `constructor.name` in `src/`, or hand-write a fixture.
- Add `json_last_error()` / `json_last_error_msg()` state, or a `JsonException` / `ValueError` class. These are ESC-9.8-1 parts 1 and 2. Until it is ruled, a JSON error throws an `Error` with PHP's message and a numeric `code` property.
- Apply the `Jsonable` / `Arrayable` hooks below the top level, where PHP's `json_encode` ignores them.
- Edit `packages/assert/**` (Story 9.11). Remove or weaken an assertion of another Story's XT.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Flags (AC 1) | A matrix of null, bools, ints, `PHP_INT_MAX`/`MIN`, floats (`1.0`, `0.1`, `-0.0`, `1e15`, `1e17`, `1e25`, `1e-5`, `1e-7`, `5e-324`), strings (`/`, `<>&'"`, `é`, `日本語`, `😀`, U+2028, `\x01`, `\x7f`, numeric strings `"12"`, `"1.0"`, `" 5"`, `"1e999"`, `"0x1A"`), lists, maps, mixed keys, nested empties, `stdClass`. Encoded with each named flag, `JSON_HEX_*`, `JSON_NUMERIC_CHECK`, `JSON_UNESCAPED_LINE_TERMINATORS` and combinations | Byte-equal to Oracle `json_encode` | — |
| Errors (AC 1) | `INF` / `NAN`, `[1, INF, NAN]`, a self-referencing `stdClass`, `[[[1]]]` at depth 2 and 3; each without flags, with `PARTIAL`, with `THROW` and with `THROW\|PARTIAL` | `false`, or the Oracle's partial string. `THROW` gives PHP's message and code | Throws `Error` with PHP's message and code (ESC-9.8-1 part 1) |
| Hooks (AC 2) | Fixture classes: `JsonSerializable` (array result; returns `$this`), `Arrayable`-only, `Jsonable` (`toJson($options)`), `Arrayable`+`JsonSerializable` with different results; plain class with public/protected/private props; nested in an array | Top level equals `(new JsonResponse($x, 200, [], $flags))->getContent()`; nested equals `json_encode([$x])` | — |
| bigint (AC 3) | `PHP_INT_MAX`, `PHP_INT_MIN`, `2^53+1` as `bigint`, in a list and a map | Oracle digits; a `bigint` beyond int64 still writes its exact digits (local row) | — |
| Decode (AC 4) | Objects with `"5"`, `"05"`, duplicate keys, `{}`, `{"0":…,"1":…}`; numbers `1.0`, `1e2`, `-0`, `-0.0`, int64 edges and beyond, `1e400`; escapes, surrogate pairs; each with assoc `true`, `false`, `null` and `JSON_OBJECT_AS_ARRAY`, `JSON_BIGINT_AS_STRING` | Equals the Oracle's decoded value in AD-9 form (list → `Array`, string keys → plain object, else `PhpArray`; `stdClass` objects) | — |
| Decode errors | `""`, `[1,]`, `01`, `1.`, `nul`, `"\ud800"`, raw `\x01`, `{"\u0000a":1}` as object, depth `[[1]]`@2 / `[]`@1, `THROW` | `null`, as the Oracle. `THROW` gives message and code | depth 0 throws PHP's `ValueError` message |

</intent-contract>

## Code Map

- `packages/runtime/src/php/jsonEncode.ts`: the 9.4 core. Keep its escaping and list rule, and extend it in place. Its header comment states the load-safety rule.
- `packages/runtime/src/registry/registry.ts:22,366`: imports `jsonEncode`, and `writeClassmap` writes `jsonEncode(out)`. Pass `JSON_THROW_ON_ERROR` and narrow the type; the bytes stay the same. Top-level `const byKey = new Map()` (line 33) is why a class file loaded before the registry finishes evaluating throws a TDZ error.
- `packages/runtime/src/php/phpSerialize.ts:49-80`: `formatSerializeFloat` (zend_gcvt at precision 17, `E`). Move it to a load-safe `src/php/gcvt.ts` that takes the exponent letter, and import it back. Lines 93-117 hold `declaredProps`, and the no-hook branch is at 166-181. Move the "object's properties" reader (property table, else props protocol, else own keys) into `mangle.ts`, which is load-safe because `fqcn` is only called on an error path. Both codecs then use it.
- `packages/runtime/src/php/isNumeric.ts:22-60`: `parseNumeric(s, allowErrors)`. Move it, with `NumericString`, into a load-safe module, and re-export it from `isNumeric.ts` so `casts.ts` and `looseEquals.ts` keep their imports.
- `packages/runtime/src/php/hasBrand.ts`: imports nothing, so it is load-safe. `hasBrand(v, Symbol.for(FQCN))` detects the hooks.
- `packages/runtime/src/php/phpInt.ts`: `intKey`, `INT_MAX`, `INT_MIN`. Load-safe.
- `packages/runtime/src/php/PhpArray.ts:207`: `arrayFromEntries` for assoc decoding. `stdClass.ts` and `PhpFloat.ts` (`float()`) are for `jsonDecode.ts` only.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: exports.
- `packages/runtime/tests/xaravel/values.test.ts:259-272`: XT-runtime-17 asserts the core's interim throws: the float `TypeError` "floats arrive with Story 9.8", and the 513-deep `Error`. Replace each with the PHP result for the same input: `'{"1":1.5}'`, `"1"`, `"[1]"`, and `false` for 513 levels. This keeps the same number of assertions with exact values and weakens nothing.
- `packages/runtime/tests/xaravel/registry.test.ts:250-335`: helpers write `jsonEncode(...)` to files. Narrow the `string | false` there; no assertion changes.
- `packages/runtime/tests/xaravel/codec.test.ts:1-90`: the idiom to copy. It has the F-10 header, the dynamic import of `packages/assert/tests/xaravel/oracle-values.ts` (`decode`, `readRequests`, `readSignedFixture`), `oracle(id, firstExpr)`, `rawResult` and `thrownBy`. A result is `{ value }` or `{ throws }`.
- `tools/oracle/evaluate.php:197` (read-only): it loads Laravel's autoloader, so request setup may implement `\Illuminate\Contracts\Support\Arrayable` / `Jsonable` and call `\Illuminate\Http\JsonResponse`.
- PHP 8.5.11 at `/opt/homebrew/bin/php` confirms each rule above. Probes are in `/tmp/xv98/*.php`, outside the repo.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/jsonConstants.ts`: PHP's `JSON_*` flag and `JSON_ERROR_*` code constants, with PHP's values. Export them from `./php` and the package root (PORTING.md § Imports: PHP builtins come from `@xaravel/runtime/php`).
- `packages/runtime/src/php/gcvt.ts`, `mangle.ts`, the new numeric-string module, `phpSerialize.ts`, `isNumeric.ts`: the load-safe moves from the Code Map. `phpSerialize` behaviour is unchanged.
- `packages/runtime/src/php/jsonEncode.ts`: the full encoder in the Boundaries.
- `packages/runtime/src/php/jsonDecode.ts`: the decoder (hand-written scanner over the JS string; no `JSON.parse`).
- `packages/runtime/src/registry/registry.ts`: `writeClassmap` uses `JSON_THROW_ON_ERROR`, with the same bytes.
- `conformance/escalations/ESC-9.8-1.md` (trigger `contract`, `test_ids: [XT-runtime-27, XT-runtime-30]`):
  - **Part 1.** `JsonException` and `ValueError` belong to Story 9.10. Option 1a (recommended): throw an `Error` with PHP's message and `code` under DIV-9.8, and Story 9.10 switches the throws, as ESC-9.7-1 part 4 did. Option 1b: land the classes early.
  - **Part 2.** `json_last_error()` / `json_last_error_msg()`, which Laravel calls 11 times (Encrypter, JsonResponse, Cursor, …). Per-request state must be a Scope Frame slot (AD-5), and a slot write with no frame throws. Option 2a (recommended): Story 9.8 adds them as a frame slot. Outside a frame, `jsonEncode`/`jsonDecode` do not record, and the reads give the last in-frame value or `0`. `THROW_ON_ERROR` without partial leaves the record untouched, as PHP does. Option 2b: the first consuming Story adds them.
- `conformance/oracle-requests/9.8.jsonl`: one request per XT (27-30), plus extra XT-runtime-27 requests for the error rows if needed (select them by first expr). Every expr evaluates only `json_encode` / `json_decode` / `JsonResponse::getContent` over the matrix inputs.
- `packages/runtime/tests/xaravel/json.test.ts`: XT-runtime-27..30 against the fixtures, plus local rows:
  - lone surrogates under the `INVALID_UTF8` flags;
  - `bigint` beyond int64;
  - error codes and messages;
  - `undefined` → `null`; a function → `{}`; a symbol → unsupported;
  - a fresh `bun` process that imports `@xaravel/runtime/registry` first and calls `writeClassmap` (the cycle rule).
- `packages/runtime/tests/xaravel/values.test.ts`, `registry.test.ts`: the edits named in the Code Map.
- `packages/runtime/async-surface.json`: `bun run async-surface runtime`; it stays empty.

**Acceptance Criteria:**
- The four ACs of Story 9.8 (`epics.md` line 3156), each verified by its XT row in `stories/9.8.md`.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

- **Implementation notes (2026-10-21).**
  - `registry.test.ts:389-390` (XT-runtime-15's core rows) asserted the 9.4 core's interim `TypeError` for `jsonEncode(1.5)` and `jsonEncode(new Map())`, which the Code Map did not list. They are replaced with PHP's result for the same input, `"1.5"` and `"{}"`, as the Code Map does for `values.test.ts`: same count, exact values.
  - A plain object always encodes as a JSON object, `{}` included, as the 9.4 core did (AD-9.2: a plain object is a string-keyed map). This keeps `registry.test.ts`'s `"b":{}` row and `writeClassmap`'s bytes without `JSON_FORCE_OBJECT`.
  - A JS `stdClass` lists integer-like keys first, so a decoded `stdClass` with such keys does not keep PHP's key order (XT-runtime-30 compares properties by name, as `codec.test.ts` does).

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 44 findings — high 0, medium 12, low 24, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent (a): top-level `Jsonable` / `Arrayable` makes `jsonEncode` differ from `json_encode` for those objects. It is the reading the spec chose from `Js.php:113-121` and `JsonResponse.php:83-88` (Design Notes). AC 2 requires the hooks, and nested values keep PHP's rule.
  - `[medium]` `[defer]` Intent (b): the THROW path throws `Error`, not `JsonException`. This is ESC-9.8-1 part 1, open; it waits for the ruling.
  - `[medium]` `[patch]` Intent (c): XT-runtime-27/28/29 never check that the JS inputs equal the Oracle's inputs. Each request gains its input expr (`$v`, `$xs`, `$big`), and the test compares them element by element.
  - `[false]` `[reject]` Intent (d): decoding `{"0":…,"1":…}` to an `Array` is outside AC 4's literal shapes. AC 4 says "following AD-9", whose list rule makes that an `Array`.
  - `[medium]` `[defer]` Intent (e): the Oracle rows fail until the fixtures exist. They are signed by `oracle.yml#story` after the push.
  - `[false]` `[reject]` Intent (f): the load-safety refactors and other Stories' test edits are out of scope. The spec's import-cycle rule requires the moves, and the test edits replace interim throws with PHP's exact results (Code Map, Spec Change Log).
  - `[low]` `[patch]` VG: XT-runtime-30's `stdClass` comparator ignores property order. It now compares the order of non-integer-like names, plus a decode-then-encode spot check.
  - `[low]` `[patch]` VG: the decode depth `> INT_MAX` `ValueError` message had no test. Local row added.
  - `[medium]` `[defer]` VG other: the fixtures are missing (same as intent (e)).
  - `[low]` `[reject]` VG other: XT-runtime-27's local rows run only after its Oracle comparisons. Once the fixtures land, every row runs, and a failing Oracle row fails the test anyway.
  - `[low]` `[reject]` Edge: a `NaN` or fractional `depth` from an untyped caller. The signature is typed `number` in strict TS, and nothing in the repo passes a non-integer; the fix is a new guard.
  - `[low]` `[reject]` Edge: a very large `depth` plus deep input overflows the decoder's JS stack. It is reachable only with a caller-raised depth (the default 512 stops at 512), and the fix is a parser rewrite.
  - `[low]` `[reject]` Edge: a value nested deeper than the JS stack overflows the encoder. Checking depth on entry would change PHP's error order (`[[[[INF]]], 2]` must report INF first, an Oracle row). PHP's own encoder hits its stack limit on such input.
  - `[false]` `[reject]` Edge: `JSON_ERROR_NON_BACKED_ENUM` is never set. AD-9 has no enum value, and the constant is exported for parity with PHP.
  - `[low]` `[patch]` Edge: the `mangle.ts` comment says `fqcn` runs only on error paths. Corrected: it runs when a class's table is first read, never at load time.
  - `[low]` `[reject]` Edge: the JS stack-overflow variant of the encoder finding above. Same reason.
  - `[false]` `[reject]` Blind: `jsonEncode({})` gives `{}` where PHP's `json_encode([])` gives `[]`. ESC-9.4-1 part 2 ruled that the core encodes plain objects as objects and that 9.8 "removes nothing from this core". XT-runtime-15 asserts `"b":{}`, and AD-9's canonical empty array is `[]` (`arrayFromEntries` builds `[]`). A plain object with integer-like keys is no AD-9 value.
  - `[medium]` `[defer]` Blind: a decoded `stdClass` lists integer-like keys first, so re-encoding `{"b":1,"1":2}` reorders it. JS object semantics, shared with `phpUnserialize`; routed as ESC-9.8-1 part 3. The comparator compares non-integer order (VG patch above).
  - `[medium]` `[patch]` Blind: `JSON_BIGINT_AS_STRING` makes PHP accept a big-int object key (`{12345678901234567890:1}`, probed: error 0). `jsonDecode` returned `null`. Fixed, with Oracle rows with and without the flag.
  - `[low]` `[reject]` Blind: deep nesting gives a `RangeError`. Same as the Edge rows above.
  - `[low]` `[patch]` Blind: `jsonDecode(null/undefined)` crashed with a JS `TypeError`. It now reads as `""` (PHP: syntax error), with a local row.
  - `[false]` `[reject]` Blind: `Map`, `Date`, typed arrays and constructors encode as objects instead of throwing. AD-9 (`casts.ts` header) reads every non-array object or function as a PHP object, and PHP encodes an object with no public properties as `{}`.
  - `[low]` `[patch]` Blind: the `JSON_HEX_*` doc comments lost their escapes. They now name `<`, `>`, `&`, `'` and `"`.
  - `[low]` `[patch]` Blind: raw U+2028/U+2029/U+FFFD characters in source are now written as escapes.
  - `[low]` `[patch]` Blind: ESC-9.8-1 claimed the rows pass against signed fixtures. Reworded to local PHP output, with the fixtures signed after the push.
  - `[low]` `[patch]` Blind: the spec and ESC-9.8-1 give different `json_last_error` counts. ESC-9.8-1 now states its count and the command behind it. The spec's figure stays as written (a spec edit is no fix).
  - `[false]` `[reject]` Blind: the `phpSerialize` props refactor changes behaviour. The old path read the protocol's array through `arrayEntries`, which also nulls holes and `undefined` values. Its keys were `String()`-ed, so normalisation never showed. XT-runtime-24/25 pass unchanged.
  - `[low]` `[reject]` Blind: `propsEntries` duplicates `casts.arrayEntries`. The import-cycle rule forbids `casts.ts` here (it imports `PhpArray.ts`, which registers at load), and the reader skips key normalisation, which the string keys never need.
  - `[low]` `[patch]` Blind: the int64-overflow digit check was duplicated between `jsonDecode.ts` and `numericString.ts`. One exported helper now serves both.
  - `[low]` `[reject]` Blind: a non-integer `depth`, or an encode depth above `INT_MAX`. Same as the Edge depth row; no caller passes such values.
  - `[low]` `[patch]` Blind: an untested `TypeError` when `toJson()` returns a non-string. Local row added.
  - `[low]` `[patch]` Blind: an untested `TypeError` when a `JsonSerializable` brand has no `jsonSerialize()`. Local row added.
  - `[medium]` `[patch]` Blind: the `Jsonable` + `JsonSerializable` class (Laravel's Collection/Model case) was untested. Oracle rows added, top level and nested.
  - `[low]` `[patch]` Blind: the decode `must be less than 2147483647` error (same as the VG row).
  - `[low]` `[patch]` Blind: the decoder's `STATE_MISMATCH` cases (`[1,2}`, `{"a":1,"b":2]`) had no Oracle row. Added.
  - `[medium]` `[defer]` Fidelity F-2 (reviewer 1): `assertJsonError` checks `Error`, not `JsonException`/`ValueError`. It waits for the ESC-9.8-1 part 1 ruling.
  - `[medium]` `[defer]` Fidelity F-6 (reviewer 1): no signed fixtures. They come from `oracle.yml#story` after the push.
  - `[medium]` `[defer]` Fidelity F-7 (reviewer 1): no signed fixtures (same root).
  - `[low]` `[patch]` Fidelity F-7 (reviewer 1): XT-runtime-27 claimed "every JSON_* flag and combination". The consequence is narrowed to what the requests exercise.
  - `[medium]` `[defer]` Fidelity F-2 (reviewer 2): the `Error` substitution rests on the unruled ESC-9.8-1 (same root as reviewer 1's F-2).
  - `[medium]` `[defer]` Fidelity F-2 (reviewer 2): `jsonError` and `valueError` throw `Error` (same root).
  - `[false]` `[reject]` Fidelity F-6 (reviewer 2, six rows grouped by the tool as one finding per fixture file): missing fixtures. Same root as reviewer 1's F-6; not a separate defect.
  - `[low]` `[patch]` Fidelity F-7 (reviewer 2): XT-runtime-30 cited bare "AD-9". It now cites the bullets the body checks (AD-9.2, AD-9.4).
  - `[false]` `[reject]` Fidelity F-7 (reviewer 2): the claims of byte identity without fixtures. Same root as F-6; settled by the push.

## Design Notes

- **Hooks only at the top level for `Jsonable` / `Arrayable`.** PHP's `json_encode` knows only `JsonSerializable`. Laravel applies `Jsonable` (`toJson($flags)`) and then `Arrayable`-without-`JsonSerializable` (`toArray()`) before it calls `json_encode` (`Js.php:113-121`; `JsonResponse.php:83-88`, same effective order). "As PHP and Laravel do" therefore means the top-level check plus PHP's rule inside. Nested `Jsonable` would also break `JSON_PRETTY_PRINT` indentation. One residual difference remains: a direct port of `json_encode($arrayableOnly)` gets `toArray()` where PHP gets public properties. The tests record it with a local row.
- **Depth asymmetry is PHP's.** `json_encode([[[1]]], 0, 2)` fails and `…, 3)` succeeds. `json_decode('[[1]]', true, 2)` fails, and so does `json_decode('[]', true, 1)`. Probed locally.
- **Floats.** This is `php_gcvt(d, 17, '.', 'e')`, the serializer's algorithm with a lower-case `e`: `[1,0.1,1.0e+25,1.0e-7,-0,1000000000000000,1.0e+17,1.0e-5,5.0e-324]`.

## Verification

**Commands:**
- `bun run oracle:story check 9.8`: expected: every request accepted.
- Before pushing: evaluate each expr with local PHP 8.5.11 (a scratch script outside the repo) and compare. Expected: no mismatch.
- `bun run harness --xaravel --id 'XT-runtime-*'`: expected: all pass once the fixtures are pulled.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run oracle:verify-fixtures`, `bun run escalations:check`: expected: clean.
- `bun run story:check 9.8`: expected: pass after the Fidelity Review of the final tree, apart from ESC-9.8-1 until it is ruled.

## Auto Run Result

Status: blocked (2026-10-21, build). Blocking condition: `conformance/escalations/ESC-9.8-1.md` (contract) is open, so `story:check 9.8` fails its escalations clause, and both Fidelity reviewers reject F-2 until it is ruled. F-6 and F-7 ask for the signed fixtures, which `oracle.yml#story` commits after the push.
- **Summary:**
  - **`jsonEncode`.** It is now PHP 8.5's `json_encode(value, flags, depth)`:
    - every `JSON_*` encode flag;
    - PHP's error order, `false`, partial-output stand-ins and THROW semantics;
    - floats as `php_gcvt` with `e`;
    - `bigint` in exact digits;
    - the AD-9 list rule and `JsonSerializable` at every level;
    - Laravel's `Jsonable` / `Arrayable` hooks at the top level.
  - **`jsonDecode`.** It is new: PHP's `json_decode(json, associative, depth, flags)` with PHP's error codes. Objects come back as AD-9 arrays or `stdClass`, integral floats are marked, and int64 overflow and `BIGINT_AS_STRING` are handled.
  - **Constants.** PHP's `JSON_*` constants are exported.
  - **Load safety.** Shared logic moved into load-safe modules, so the Registry's import of the encoder stays cycle-safe.
- **Files:**
  - `packages/runtime/src/php/jsonEncode.ts`: the encoder.
  - `jsonDecode.ts`: the decoder.
  - `jsonConstants.ts`: the constants and the error builder.
  - `gcvt.ts`: the float formatter, moved from `phpSerialize.ts`.
  - `numericString.ts`: `parseNumeric` and `exceedsInt64`, moved from `isNumeric.ts`, which re-exports them.
  - `mangle.ts`: the shared object-property reader.
  - `phpSerialize.ts`: uses the moved helpers, with unchanged bytes.
  - `index.ts`, `src/index.ts`: exports.
  - `src/registry/registry.ts`: `writeClassmap` under `JSON_THROW_ON_ERROR`, with the same bytes.
  - `tests/xaravel/json.test.ts`: XT-runtime-27..30 and the local rows.
  - `values.test.ts` / `registry.test.ts`: the 9.4 core's interim throws are replaced with PHP's results for the same inputs.
  - `conformance/oracle-requests/9.8.jsonl`: 6 requests.
  - `conformance/escalations/ESC-9.8-1.md`: parts 1-3.
- **Review:** 44 findings: medium 12, low 24, false 8.
  - **Patched: 18 rows.** Three of them are medium:
    - the JS inputs checked against the Oracle's inputs;
    - the `BIGINT_AS_STRING` big-int key;
    - the `Jsonable` + `JsonSerializable` Oracle rows.
  - **Deferred: 9 rows.** All are routed to ESC-9.8-1 or to the fixtures the push brings (see the frontmatter `deferred`).
  - **Rejected: 17 rows.** Each reason is in the triage log.
  - **The Fidelity Review** rejected tree `62f0a686…` with both reviewers. Every finding is F-2 (ESC-9.8-1), F-6/F-7 (fixtures not yet signed) or one of two F-7 wording rows, which are now patched.
- **Follow-up review recommended: true.** This first pass patched three medium entries. The risk that remains unverified is the byte identity of XT-runtime-27..30 against *signed* fixtures. It was checked only against local, unsigned `evaluate.php` output of the same requests, so the Story's re-review after the ESC-9.8-1 ruling must see the harness pass on the signed fixtures and re-run the Fidelity Review.
- **Verification:** these are clean: `bun --bun tsc -b`, `bun run lint`, `graph:check`, `registration:check`, `async-surface --all --check` (unchanged), `oracle:story check 9.8` (6/6), `oracle:verify-fixtures` and `escalations:check`. `bun test packages/runtime` passes 26 of 30; the 4 that fail are XT-runtime-27..30, all on `missing signed fixture`. The implementer also compared the encoder against local PHP 8.5.11 on 12,000 random decode cases and 3,000 random encode cases, with 0 mismatches. `conformance/oracle/oracle.pub` is unchanged: an attempt to swap it for a throwaway key was refused, and the unsigned outputs were used instead (lessons, epic 4).
- **Residual risks:**
  - ESC-9.8-1 parts 1-3: the error classes, `json_last_error`, and the integer-like key order of `stdClass`.
  - Top-level `Arrayable` makes a direct port of `json_encode($arrayableOnly)` use `toArray()`.
  - A JS stack overflow on input nested tens of thousands of levels deep.

## Fidelity Review

### Reviewer 1: reject at tree 62f0a686db37942948d9e05ebb9739e004b8a72d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f63369d9bdd259166d115062d8db3087066f066b`, on 2026-10-22T02:04:12.417Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes only Xaravel Tests. |
| F-2: No expected value is weakened | fail | Compared error assertions with the requests' PHP exception classes. Tests accept a general Error instead, without supplied authorization for that change. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | fail | Compared fixture evidence with the tests' Oracle dependencies; all six Story 9.8 fixtures are unavailable, so their output.error values cannot be checked. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared touched test bodies and cited consequences. The new differential tests lack their required fixtures, and XT-runtime-27 claims broader combination coverage than its matrix provides. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes remain within packages/runtime; the codec hooks implement behavior explicitly assigned to runtime by AD-23.1, without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared declaration evidence with AD-6 and DIV-1. New helpers are synchronous; the retained Registry.resolveClassAsync tag is expressly authorized by ESC-9.4-1. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Compared all six requests with the recorded reason in json.test.ts: these are Xaravel differential inputs with no corresponding Upstream test. Requests evaluate the codec and JsonResponse behavior described by that reason. |

Findings:

- **F-2** `packages/runtime/tests/xaravel/json.test.ts`: assertJsonError checks Error rather than JsonException or ValueError. Supply the cited DIV-9.8 clause and approved decisions/ESC-9.8-1.md authorizing these substitutions, or assert the matching exception classes. The proposed escalation alone does not establish approval.
- **F-6** `conformance/fixtures/runtime`: Supply the six signed fixtures identified in evidence (c), including their output.error fields. Without them, the review cannot determine whether an Oracle failure is the expected failure.
- **F-7** `packages/runtime/tests/xaravel/json.test.ts`: Supply the six missing signed Oracle fixtures required by XT-runtime-27 through XT-runtime-30; oracle() currently fails before these tests verify their declared consequences.
- **F-7** `packages/runtime/tests/xaravel/json.test.ts`: Narrow XT-runtime-27's claim of testing 'every JSON_* flag and combination' to the selected encoding flags and combinations actually exercised, or expand coverage to support that claim.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"62f0a686db37942948d9e05ebb9739e004b8a72d","base":"f63369d9bdd259166d115062d8db3087066f066b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T02:04:12.417Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes only Xaravel Tests.","findings":[]},{"id":"F-2","result":"fail","note":"Compared error assertions with the requests' PHP exception classes. Tests accept a general Error instead, without supplied authorization for that change.","findings":[{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"assertJsonError checks Error rather than JsonException or ValueError. Supply the cited DIV-9.8 clause and approved decisions/ESC-9.8-1.md authorizing these substitutions, or assert the matching exception classes. The proposed escalation alone does not establish approval."}]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"fail","note":"Compared fixture evidence with the tests' Oracle dependencies; all six Story 9.8 fixtures are unavailable, so their output.error values cannot be checked.","findings":[{"path":"conformance/fixtures/runtime","detail":"Supply the six signed fixtures identified in evidence (c), including their output.error fields. Without them, the review cannot determine whether an Oracle failure is the expected failure."}]},{"id":"F-7","result":"fail","note":"Compared touched test bodies and cited consequences. The new differential tests lack their required fixtures, and XT-runtime-27 claims broader combination coverage than its matrix provides.","findings":[{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"Supply the six missing signed Oracle fixtures required by XT-runtime-27 through XT-runtime-30; oracle() currently fails before these tests verify their declared consequences."},{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"Narrow XT-runtime-27's claim of testing 'every JSON_* flag and combination' to the selected encoding flags and combinations actually exercised, or expand coverage to support that claim."}]},{"id":"F-8","result":"pass","note":"Framework changes remain within packages/runtime; the codec hooks implement behavior explicitly assigned to runtime by AD-23.1, without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared declaration evidence with AD-6 and DIV-1. New helpers are synchronous; the retained Registry.resolveClassAsync tag is expressly authorized by ESC-9.4-1.","findings":[]},{"id":"F-10","result":"pass","note":"Compared all six requests with the recorded reason in json.test.ts: these are Xaravel differential inputs with no corresponding Upstream test. Requests evaluate the codec and JsonResponse behavior described by that reason.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 62f0a686db37942948d9e05ebb9739e004b8a72d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f63369d9bdd259166d115062d8db3087066f066b`, on 2026-10-22T02:04:12.417Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | fail | The Xaravel Tests compare against Oracle (PHP) values. The changed values in XT-runtime-15 and XT-runtime-17 (a float encodes, a 513-deep array gives false) follow PHP's json_encode and the growth ESC-9.4-1 part 2 expects. But XT-runtime-27 and XT-runtime-30 loosen the expected error class: the Oracle throws JsonException or ValueError, and the tests only assert 'error instanceof Error'. No adapted:DIV marker covers this, and the ruling it relies on (ESC-9.8-1) has no decision record. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are added or changed (test_ids is empty), so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | fail | Evidence (c) reports all six fixtures the Story relies on as unavailable, so I cannot confirm that their error outputs (the JsonException and ValueError rows of XT-runtime-27 and XT-runtime-30) are the errors PHP gives. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each consequence string with its test body and the cited bullets. XT-runtime-27 checks flags, errors, undefined as null and the import cycle (AD-23.1, AD-9.1). XT-runtime-28 checks the hooks and getter brands (AD-9.5). XT-runtime-29 checks bigint digits (AD-9.3). Two problems: XT-runtime-30 cites the whole of AD-9 rather than the bullets it verifies, and every Oracle row depends on fixtures missing from the tree, which oracle() turns into a thrown error. So the declared Oracle equality is not verified on this tree. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every source change is in packages/runtime, the Story's own Component. AD-23.1 gives the runtime ownership of the JsonSerializable, Arrayable and Jsonable hooks, which are read by Symbol.for brand. The interim error stand-in concerns Story 9.10 in the same Component and is covered under F-2. No stub or fake of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): every new export (jsonEncode, jsonDecode, gcvt, the constants, the objectProps, declaredProps and objectTable helpers, parseNumeric) is sync, does no IO and takes no callback, so none needs a tag. The only tag in the changed files is '@​asyncRoot Registry.resolveClassAsync' on registry.ts line 126. It is kept unchanged and is true under ESC-9.4-1 option 1a. writeClassmap stays sync. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Each request's id names an Xaravel Test, not an Upstream test. The request inputs match the values the tests build in JS, for example the $v matrix, $cases, $xs and $big. The reason for having no Upstream source is recorded in the json.test.ts header. The exprs evaluate only json_encode, json_decode and JsonResponse::getContent() over the declared inputs, and none signs arbitrary PHP as an expected value. |

Findings:

- **F-2** `packages/runtime/tests/xaravel/json.test.ts`: assertJsonError checks only 'instanceof Error' while the Oracle's class is JsonException or ValueError. This loosening rests on conformance/escalations/ESC-9.8-1.md, which has no ruling (decisions/ESC-9.8-1.md does not exist), and no '// adapted:DIV-9.8.<k>' marker names a clause that allows it. Get ESC-9.8-1 ruled (or land JsonException and ValueError), then assert the class or cite the approved clause.
- **F-2** `packages/runtime/src/php/jsonConstants.ts`: jsonError (and valueError in jsonDecode.ts) throws a plain Error in place of PHP's JsonException and ValueError, citing 'ESC-9.8-1 part 1, DIV-9.8'. Neither record's text is in the review evidence, and ESC-9.8-1 is still pending. Supply the approved ruling and the DIV-9.8 clause.
- **F-6** `conformance/fixtures/runtime/1d7bdd9cc1b6f395420fcf5793c4905843ad561f5c3bcfb1841481a0cfade2c4.json`: Missing fixture for the XT-runtime-27 error-mode request. Commit the signed Oracle fixture.
- **F-6** `conformance/fixtures/runtime/54778da3e51961d70e463108af8c25c994ab157d638c0a510b144c47ac6ab6f3.json`: Missing fixture for the XT-runtime-27 flag-matrix request. Commit the signed Oracle fixture.
- **F-6** `conformance/fixtures/runtime/38699bbc7c10f97320b4584efd1301c0097f644f9dc7cff2b332366065ee9b5d.json`: Missing fixture for the XT-runtime-28 request. Commit the signed Oracle fixture.
- **F-6** `conformance/fixtures/runtime/8f010e349a700474eb5a152e8b799e023b86db70862f200ff59bfa7f7b848894.json`: Missing fixture for the XT-runtime-29 request. Commit the signed Oracle fixture.
- **F-6** `conformance/fixtures/runtime/0e66419006a6a68cc2e5fd6338a4ef32ad0afcc38922e404435847fc7f235640.json`: Missing fixture for the XT-runtime-30 decode request. Commit the signed Oracle fixture.
- **F-6** `conformance/fixtures/runtime/da802b2a54ed90fa82ba6f1b9cbe7672e009ec32427a03f789599f23a93f1306.json`: Missing fixture for the XT-runtime-30 error request (JsonException and ValueError rows). Commit the signed Oracle fixture so its errors can be checked.
- **F-7** `packages/runtime/tests/xaravel/json.test.ts`: XT-runtime-30's consequence cites 'AD-9', which is not a bullet. The body checks AD-9.2 (array forms) and AD-9.4 (the float marker), but not AD-9.3's driver rules or AD-9.6. Cite the specific bullets, for example AD-9.2 and AD-9.4.
- **F-7** `packages/runtime/tests/xaravel/json.test.ts`: XT-runtime-27 to 30 claim byte-identical Oracle results, but their signed fixtures are absent (see F-6), so oracle() throws and nothing is verified. Commit the fixtures. The 'PHP's error' rows also rely on the unruled ESC-9.8-1.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"62f0a686db37942948d9e05ebb9739e004b8a72d","base":"f63369d9bdd259166d115062d8db3087066f066b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T02:04:12.417Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"fail","note":"The Xaravel Tests compare against Oracle (PHP) values. The changed values in XT-runtime-15 and XT-runtime-17 (a float encodes, a 513-deep array gives false) follow PHP's json_encode and the growth ESC-9.4-1 part 2 expects. But XT-runtime-27 and XT-runtime-30 loosen the expected error class: the Oracle throws JsonException or ValueError, and the tests only assert `error instanceof Error`. No adapted:DIV marker covers this, and the ruling it relies on (ESC-9.8-1) has no decision record.","findings":[{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"assertJsonError checks only `instanceof Error` while the Oracle's class is JsonException or ValueError. This loosening rests on conformance/escalations/ESC-9.8-1.md, which has no ruling (decisions/ESC-9.8-1.md does not exist), and no `// adapted:DIV-9.8.<k>` marker names a clause that allows it. Get ESC-9.8-1 ruled (or land JsonException and ValueError), then assert the class or cite the approved clause."},{"path":"packages/runtime/src/php/jsonConstants.ts","detail":"jsonError (and valueError in jsonDecode.ts) throws a plain Error in place of PHP's JsonException and ValueError, citing 'ESC-9.8-1 part 1, DIV-9.8'. Neither record's text is in the review evidence, and ESC-9.8-1 is still pending. Supply the approved ruling and the DIV-9.8 clause."}]},{"id":"F-3","result":"n/a","note":"No Ported Tests are added or changed (test_ids is empty), so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"fail","note":"Evidence (c) reports all six fixtures the Story relies on as unavailable, so I cannot confirm that their error outputs (the JsonException and ValueError rows of XT-runtime-27 and XT-runtime-30) are the errors PHP gives.","findings":[{"path":"conformance/fixtures/runtime/1d7bdd9cc1b6f395420fcf5793c4905843ad561f5c3bcfb1841481a0cfade2c4.json","detail":"Missing fixture for the XT-runtime-27 error-mode request. Commit the signed Oracle fixture."},{"path":"conformance/fixtures/runtime/54778da3e51961d70e463108af8c25c994ab157d638c0a510b144c47ac6ab6f3.json","detail":"Missing fixture for the XT-runtime-27 flag-matrix request. Commit the signed Oracle fixture."},{"path":"conformance/fixtures/runtime/38699bbc7c10f97320b4584efd1301c0097f644f9dc7cff2b332366065ee9b5d.json","detail":"Missing fixture for the XT-runtime-28 request. Commit the signed Oracle fixture."},{"path":"conformance/fixtures/runtime/8f010e349a700474eb5a152e8b799e023b86db70862f200ff59bfa7f7b848894.json","detail":"Missing fixture for the XT-runtime-29 request. Commit the signed Oracle fixture."},{"path":"conformance/fixtures/runtime/0e66419006a6a68cc2e5fd6338a4ef32ad0afcc38922e404435847fc7f235640.json","detail":"Missing fixture for the XT-runtime-30 decode request. Commit the signed Oracle fixture."},{"path":"conformance/fixtures/runtime/da802b2a54ed90fa82ba6f1b9cbe7672e009ec32427a03f789599f23a93f1306.json","detail":"Missing fixture for the XT-runtime-30 error request (JsonException and ValueError rows). Commit the signed Oracle fixture so its errors can be checked."}]},{"id":"F-7","result":"fail","note":"I compared each consequence string with its test body and the cited bullets. XT-runtime-27 checks flags, errors, undefined as null and the import cycle (AD-23.1, AD-9.1). XT-runtime-28 checks the hooks and getter brands (AD-9.5). XT-runtime-29 checks bigint digits (AD-9.3). Two problems: XT-runtime-30 cites the whole of AD-9 rather than the bullets it verifies, and every Oracle row depends on fixtures missing from the tree, which oracle() turns into a thrown error. So the declared Oracle equality is not verified on this tree.","findings":[{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"XT-runtime-30's consequence cites 'AD-9', which is not a bullet. The body checks AD-9.2 (array forms) and AD-9.4 (the float marker), but not AD-9.3's driver rules or AD-9.6. Cite the specific bullets, for example AD-9.2 and AD-9.4."},{"path":"packages/runtime/tests/xaravel/json.test.ts","detail":"XT-runtime-27 to 30 claim byte-identical Oracle results, but their signed fixtures are absent (see F-6), so oracle() throws and nothing is verified. Commit the fixtures. The 'PHP's error' rows also rely on the unruled ESC-9.8-1."}]},{"id":"F-8","result":"pass","note":"Every source change is in packages/runtime, the Story's own Component. AD-23.1 gives the runtime ownership of the JsonSerializable, Arrayable and Jsonable hooks, which are read by Symbol.for brand. The interim error stand-in concerns Story 9.10 in the same Component and is covered under F-2. No stub or fake of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): every new export (jsonEncode, jsonDecode, gcvt, the constants, the objectProps, declaredProps and objectTable helpers, parseNumeric) is sync, does no IO and takes no callback, so none needs a tag. The only tag in the changed files is `@asyncRoot Registry.resolveClassAsync` on registry.ts line 126. It is kept unchanged and is true under ESC-9.4-1 option 1a. writeClassmap stays sync.","findings":[]},{"id":"F-10","result":"pass","note":"Each request's id names an Xaravel Test, not an Upstream test. The request inputs match the values the tests build in JS, for example the $v matrix, $cases, $xs and $big. The reason for having no Upstream source is recorded in the json.test.ts header. The exprs evaluate only json_encode, json_decode and JsonResponse::getContent() over the declared inputs, and none signs arbitrary PHP as an expected value.","findings":[]}],"prior":[]}
```
