---
title: 'Story 9.7: `phpSerialize` / `phpUnserialize` codec'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_revision: 'f4ff76dd036930162c463e8acb5005ed3ed3b892'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.7.md'
  - '{project-root}/PORTING.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-23 makes `@xaravel/runtime/php` the only home of `phpSerialize` / `phpUnserialize`, and PORTING.md already translates PHP's `serialize()` / `unserialize()` into them, but neither exists, so cache entries, sessions and queued payloads cannot interoperate with PHP Laravel (FR-77).

**Approach:** Add the two functions, plus PHP's `stdClass` and `__PHP_Incomplete_Class`, to `packages/runtime/src/php/`, mirroring PHP 8.5's `ext/standard/var.c` (`php_var_serialize_intern`) and `var_unserializer.re` over the AD-9 value model, with objects named and rebuilt through the Class Registry. Verify byte-identity and rebuilt values against signed Oracle fixtures from `conformance/oracle-requests/9.7.jsonl` (XT-runtime-24, 25, 26).

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, this spec, the Story's status lines (`sprint-status.yaml`, `stories/9.7.md`), `conformance/oracle-requests/9.7.jsonl` and the `conformance/fixtures/runtime/*.json` the `xaravel-oracle` bot signs for it.
- Sync only (AD-6); never return `undefined` (AD-9.1); `undefined` input reads as `null`. Reuse `phpType` / `arrayEntries` (`casts.ts`), `normalizeKey` (`PhpArray.ts`), `INT_MIN`/`INT_MAX` (`phpInt.ts`), `float()` (`PhpFloat.ts`) and the Registry — no second value-model reader (lessons, epic 4).
- Back-reference numbering is PHP's: every serialized value takes the next slot (array, object, scalar, and an emitted `r:`), map keys and the array `__serialize()` returns take none; a repeated object (by identity) is `r:<slot>;`. Unserialize builds the same table; `R:` reads a slot without taking one.
- Object hooks in PHP's order: `__serialize()` (must return a PHP array; keys emitted as that array's keys, verbatim, so a port can return `"\0*\0x"`), else `__sleep()` (names verbatim; a name whose unmangled form is not an own property is skipped, as PHP skips it), else the object's props — `[Symbol.for('xaravel.php.props')]()` when present, otherwise its own enumerable string keys (ESC-4.1-1) — always as `s:` keys. Unserialize creates the instance with `Object.create(Class.prototype)` (no constructor), passes the data to `__unserialize(data)` or else defines each property under its unmangled name, and runs every `__unserialize`/`__wakeup` after the whole parse, in creation order, as PHP does.
- Class resolution is the Registry's (case-insensitive, test-frame classes included). A class that is not registered, or not allowed by `allowedClasses` (`true` default, `false`, or a list compared case-insensitively), rebuilds as `__PHP_Incomplete_Class` holding `__PHP_Incomplete_Class_Name` and the raw property entries; serializing it writes the original name and entries back byte for byte; no hook runs on it.
- PHP's messages: `Serialization of 'Closure' is not allowed` (a JS function), `<FQCN>::__serialize() must return an array`.

**Never:**
- `jsonEncode`/`jsonDecode` (9.8); `packages/assert/**` (9.11); a new package subpath; `JSON.stringify` or `constructor.name` in `src/`; a hand-written fixture.
- PHP's warnings and notices (trailing data, a missing `__sleep` name): PHP still returns the value, and so do these functions.
- Enum (`E:`) and `Serializable` (`C:`) payloads, and PHP references on the serialize side (`R:` is only read): the AD-9 model has no enum or reference value; `phpUnserialize` returns `false` for `E:`/`C:` (see Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scalars (AC 1) | `null`, bools, ints incl. `PHP_INT_MAX`/`MIN` and 2^53 (`bigint`), floats `0.0`, `-0.0`, `1.0` (marked), `0.1`, `0.1+0.2`, `1e15`, `1e16`, `1e17`, `1e100`, `1e-5`, `0.0001`, `5e-324`, `1.7976931348623157E+308`, `INF`, `-INF`, `NAN`, `-1.5` | Byte-equal to Oracle `serialize()`: `N;`, `b:1;`, `i:-9223372036854775808;`, `d:` at `serialize_precision = -1` (`d:0.1;`, `d:-0;`, `d:1;`, `d:1.0E+17;`, `d:10000000000000000;`, `d:1.0E-5;`, `d:NAN;`) | No error expected |
| Strings (AC 1) | `""`, ASCII, `é`, `日本語`, `😀`, quotes and `;`, NUL, newline | `s:<UTF-8 byte length>:"<text>";` | A lone surrogate throws `TypeError` |
| Arrays (AC 1) | lists, maps, mixed and non-sequential int keys, `"5"`-keyed (normalised), nested empty | `a:<n>:{…}` with `i:`/`s:` keys in PHP order | A JS array that contains itself throws `Error` `Nesting level too deep - recursive dependency?` |
| Objects (AC 1) | `stdClass` (empty, with props, self-referencing), a registered public-props class, a `__serialize`/`__unserialize` class with mangled keys, a `__sleep`/`__wakeup` class, the same object twice in one array | Byte-equal to Oracle, including `O:<len>:"<FQCN>":<n>:{…}` and `r:<slot>;` | Unregistered class: Registry `TypeError`; function: `Error` `Serialization of 'Closure' is not allowed` |
| Unserialize (AC 2) | every serialized fixture string | Equals the Oracle's `unserialize(serialize($x))` (post-`__wakeup`), arrays in AD-9 form (list → `Array`, all-string keys → plain object, else `PhpArray`), integral `d:` as `float()`, objects `instanceof` their registered class, shared objects identical; re-serializing gives the same bytes | — |
| allowedClasses (AC 3) | `false`, `['<lower-cased FQCN>']`, `['stdClass']`, an unregistered class name | Disallowed/unknown classes become `__PHP_Incomplete_Class` (props as the Oracle shows, no hook run); allowed ones rebuild; re-serializing an incomplete class restores the original bytes | — |
| Malformed | truncated, wrong count, `b:2;`, `r:` to a non-object or out of range, bad float text, nesting beyond 4096, `E:`/`C:` | `false`, as PHP | Trailing data after a complete value is ignored (PHP warns and returns the value); `i:` beyond int64 saturates |

</intent-contract>

## Code Map

- `packages/runtime/src/php/casts.ts:31-80` -- `phpType` (int/float/array/object split, throws for out-of-int64 `bigint` and symbols) and `arrayEntries` (normalised `[key, value]` pairs of all three array forms): the serializer's only value readers.
- `packages/runtime/src/php/PhpArray.ts:62` -- `normalizeKey` for unserialized `s:` keys (`"5"` → 5, `"05"` stays); `new PhpArray(entries)` for mixed keys.
- `packages/runtime/src/php/phpInt.ts` -- `INT_MIN`/`INT_MAX` for `i:` saturation; `PhpFloat.ts` -- `float()` to mark an integral `d:`.
- `packages/runtime/src/php/valueCopy.ts:40-46` -- building a plain object with `Object.defineProperty` (`__proto__`-safe) and the `RECURSION` message; reuse the idiom.
- `packages/runtime/src/registry/registry.ts:82,107` -- `fqcn(obj)` for the class name (throws when unregistered); `resolveClass(name)` (throws `Class "<FQCN>" not found`; catch it for the incomplete-class fallback). `registerClass` at the end of each new class file (AD-10.3).
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- add the exports.
- PHP 8.5 mirrored: `ext/standard/var.c` (`php_var_serialize_intern`, `php_add_var_hash`: `R:` takes no slot, `r:` does; `php_var_serialize_class_name`; `__sleep` name lookup), `Zend/smart_str.c` `smart_str_append_double` with `zend_gcvt(value, 17, …)` mode 0 (exponential when decimal-point position `< -3` or `> 17`, `.0` after a one-digit mantissa), `ext/standard/var_unserializer.re` (`parse_iv` sign and saturation, `object_common`, delayed `__wakeup`/`__unserialize`, `unserialize_max_depth = 4096`, `allowed_classes`). Local PHP 8.5.11 (`/opt/homebrew/bin/php`) confirms these.
- `packages/runtime/tests/xaravel/semantics.test.ts:1-80` -- the test idiom to copy: F-10 header, dynamic import of `packages/assert/tests/xaravel/oracle-values.ts` (`decode`, `readRequests`, `readSignedFixture`), `oracle(id)`, `rawResult`; `registerClass` for fixture classes.
- `packages/assert/tests/xaravel/oracle-values.ts:33-65,130-141` (read-only) -- a decoded object is a `DecodedObject` with `phpClass`, public props behind the props protocol and `phpHidden` (protected/private by name).
- `tools/oracle/evaluate.php:380-410` (read-only) -- an XT request runs in the global namespace, each `setup` statement through `eval`, one forked child per request, so a setup statement may declare `namespace XaravelFixture\Serialize; class …`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/stdClass.ts` -- PHP's `stdClass` (no members), registered as `stdClass` -- PORTING.md § Imports names it a `@xaravel/runtime/php` export.
- `packages/runtime/src/php/__PHP_Incomplete_Class.ts` -- the class, registered as `__PHP_Incomplete_Class`: a public `__PHP_Incomplete_Class_Name` and its raw entries; `[Symbol.for('xaravel.php.props')]()` gives the name plus the public entries, as PHP's `(array)` shows them.
- `packages/runtime/src/php/phpSerialize.ts` -- `phpSerialize(value): string` and the internal float formatter -- AD-23.1.
- `packages/runtime/src/php/phpUnserialize.ts` -- `phpUnserialize(s, { allowedClasses } = {}): unknown` over the UTF-8 bytes of `s` (`TextDecoder` fatal for string values; a value PHP accepts but JS cannot hold, e.g. invalid UTF-8, throws `TypeError`) -- AD-23.1.
- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export the four names.
- `conformance/oracle-requests/9.7.jsonl` -- `XT-runtime-24`: setup declares the fixture classes (`Point` public props; `Packed` with `__serialize`/`__unserialize` returning `"\0*\0…"` keys; `Sleepy` with `__sleep`/`__wakeup`) and `$v` (the matrix values); exprs `$v`, `array_map(fn ($x) => serialize($x), $v)`, `serialize($v)`, `array_map(fn ($x) => unserialize(serialize($x)), $v)`. `XT-runtime-26`: the same classes, `$s = serialize([...])`; exprs `unserialize($s, ['allowed_classes' => false])`, `… => ['xaravelfixture\serialize\point']`, `… => ['stdClass']`, `serialize(unserialize($s, ['allowed_classes' => false]))`, and `unserialize` of an unknown class. XT-runtime-25 reads XT-runtime-24's fixture.
- `packages/runtime/tests/xaravel/codec.test.ts` -- XT-runtime-24 (each input built in JS, checked equal to the decoded `$v`, then `phpSerialize` byte-equal per row and whole), XT-runtime-25 (unserialize each Oracle string, compare with the Oracle's rebuilt value, class identity, shared-object identity and re-serialized bytes), XT-runtime-26 (allowed-classes rows), plus local rows for the error and malformed cases of the matrix.
- `packages/runtime/async-surface.json` -- `bun run async-surface runtime` (no async methods).

**Acceptance Criteria:**
- The three ACs of Story 9.7 (`epics.md` line 3130), each verified by its XT row in `stories/9.7.md`.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Object properties and visibility.** JS has no runtime visibility, so the default path writes every property as public (`s:1:"x"`), matching PHP only for public props. A ported class whose PHP bytes carry protected or private names returns them from `__serialize()` (as Laravel's `SerializesModels` does) or names them mangled in `__sleep()`. Unserialize strips the `\0*\0` / `\0Class\0` prefix to find the JS property.
- **Integral floats unserialize marked.** `d:1;` becomes `float(1)` so re-serializing gives `d:1;` again; other floats stay plain `number`s, which `phpType` already reads as floats (AD-9.4: the codec depends on the distinction).
- **Float text.** `toExponential()` gives the shortest round-trip digits (= `zend_dtoa` mode 0); place the point as `zend_gcvt` with `ndigit = 17` does: `1e16` → `10000000000000000`, `1e17` → `1.0E+17`, `0.0001` → `0.0001`, `1e-5` → `1.0E-5`, `-0.0` → `-0`.
- **Gaps with no owner yet.** Enum and `Serializable` payloads, and the closure error's class (PHP's `Exception`, until Story 9.10 ports it; until then an `Error` with PHP's message), are recorded in the Auto Run Result for the Epic 9 retrospective to route.

## Verification

**Commands:**
- `bun run oracle:story check 9.7` -- expected: both requests accepted
- Before pushing: evaluate the request exprs with local PHP 8.5.11 (a scratch script outside the repo) and compare with the functions -- expected: no mismatch
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: all pass once the fixtures are pulled
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run oracle:verify-fixtures` -- expected: clean
- `bun run story:check 9.7` -- expected: pass, after the Fidelity Review of the final tree
