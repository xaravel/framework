---
title: 'Story 9.5: `PhpArray`, `Ref`, float marker and null normalisation'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
baseline_revision: 'b12cb85d802505d10e63d12e6b3679d438c4f95b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.5.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/ESC-4.1-1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-9's PHP value model has no runtime types yet. Components cannot represent a PHP array that is neither a list nor an all-string-keyed map, a by-reference parameter, an integral float, or a boundary `undefined`, and nothing checks a contract brand without instantiating the class. PORTING.md already tells ports to write `new PhpArray([[k, v], …])`, `Ref<T>`, `float(1)`, `normalizeNull(v)` and `hasBrand(X, Token)`.

**Approach:** Add these five primitives to `packages/runtime/src/php/`, exported from `@xaravel/runtime/php` and the root. Build `PhpArray` to the grader's read protocol (ESC-4.1-1). Extend the `jsonEncode` core so a `PhpArray` encodes by the list rule. Check key normalisation, `is_float` and `json_encode` against signed Oracle fixtures from `conformance/oracle-requests/9.5.jsonl`.

## Boundaries & Constraints

**Always:**
- Edit only these paths: `packages/runtime/**`, this spec, the Story's status lines, `conformance/oracle-requests/9.5.jsonl`, and the `conformance/fixtures/runtime/*.json` that the `xaravel-oracle` bot signs for it.
- Keep everything sync (AD-6), and never return `undefined` (AD-9.1).
- Put brands on the prototype as getters (AD-9.5):
  - `PhpArray` carries `Symbol.for('xaravel.php.array')`.
  - The float marker carries `Symbol.for('xaravel.php.float')`.
- Every exported class file ends with `registerClass('Xaravel\\Runtime\\Php\\<Name>', X)`, following `Xaravel\Runtime\Scope\ScopeFrameException`.
- Error messages follow PHP 8.5's (`Cannot access offset of type <type> on array`).
- Keep 9.4's `jsonEncode` core behaviour and remove nothing from it.

**Never:**
- `valueCopy`, `looseEquals` or casts (Story 9.6).
- Float or flag encoding in `jsonEncode`, and the hooks (Story 9.8).
- Editing `packages/assert/**` or `conformance/oracle-requests/4.1.jsonl` (Story 9.11, ESC-4.1-1).
- A new package subpath: `conformance/tests/xaravel/scaffold.test.ts` allows only `scope`, `registry` and `php`.
- `JSON.stringify` or `constructor.name` in `src/`.
- Hand-writing a fixture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Key normalisation | `new PhpArray([["1","a"],["01","b"],[1.7,"c"],[true,"d"],[null,"e"]])` | Each key reads as 1, "01", 1, 1 and "" in turn, so the entries are `[1,"d"]`, `["01","b"]` and `["","e"]` in insertion order. A rewrite keeps the key's first position. This matches the Oracle. | No error expected |
| Key edges | Strings `"-0"`, `" 1"`, `"1.0"`, `"+1"`, `"00"`, `"9223372036854775807"`, `"9223372036854775808"`, `"-9223372036854775808"`; `false`; floats `-1.9`, `-0`, `NaN`, `±Infinity`, `±1e20`, `2**63`; `bigint` `9007199254740993n` | PHP's key per the Oracle. A canonical decimal string in the int64 range becomes an int. A float truncates; a non-finite float becomes 0; out of range wraps modulo 2^64. An int beyond ±2^53−1 is a `bigint` key. | No error expected |
| Bad key | an `Array`, an object, a `PhpArray`, a function, `undefined`, a symbol | — | `TypeError` `Cannot access offset of type <array\|FQCN or object\|Closure\|…> on array` |
| Map API | `get` / `set` / `has` / `delete` / `size` / `keys` / `values` / `entries` / `push` | Each normalises its key as above. `get` of a missing key returns `null`. `push` uses PHP's next free index: the largest int key ever inserted plus 1, or 0. A negative key is followed by key+1 (PHP ≥ 8.3), and `delete` never lowers it. | `push` past `PHP_INT_MAX` throws PHP's `Cannot add element to the array as the next element is already occupied` |
| JSON list rule | `jsonEncode(new PhpArray([[0,"a"],[1,"b"]]))`; `[[1,"a"],[0,"b"]]`; `[[1,"a"]]`; empty; `[["a",1],[5,2]]`; nested | Output is byte-identical to the Oracle's `json_encode`: `["a","b"]`, `{"1":"a","0":"b"}`, `{"1":"a"}`, `[]`, `{"a":1,"5":2}` | Values follow 9.4's core rules |
| Ref | `const r = new Ref(1); bump(r)` with `bump = (x) => { x.value++ }` | `r.value === 2` | No error expected |
| Float marker | `float(1)` | `isFloat(float(1))` is true. `+float(1) === 1` and `float(1) + 1 === 2`. `isFloat(1)` is false. `isFloat(1.5)`, `isFloat(NaN)`, `isFloat(-0)` and `isFloat(2**53)` are true, matching the Oracle's `is_float`. `float(float(1))` is the same marked value. | `float("1")` throws `TypeError` |
| normalizeNull | `undefined`, `null`, `0`, `""`, `false`, an object | `null`, then each other value returned unchanged (the same reference) | No error expected |
| hasBrand | `class A { get [T]() { return true } }` and `class B extends A`, where the token is `T = Symbol.for('X\\Y')`, or an object whose `Symbol.toPrimitive` gives that symbol | `hasBrand(A,T)`, `hasBrand(B,T)` and `hasBrand(new B(),T)` are true with zero constructor calls for the class forms. An unbranded class, `null` and `1` give false. | A token that converts to no symbol throws `TypeError` |

</intent-contract>

## Code Map

- `packages/runtime/src/php/jsonEncode.ts` -- the 9.4 default-flags core. Add a `PhpArray` branch detected by the brand (no import of `PhpArray`, which avoids a php → registry → php cycle):
  - A key set of exactly 0..n-1 in order encodes as a list. Otherwise it encodes as an object with the keys as decimal strings.
  - The depth rules stay the same, and a marked float throws the existing float `TypeError`.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- export the new names.
- `packages/runtime/src/registry/index.ts` -- `registerClass` for the class files.
- `packages/runtime/src/scope/ScopeFrameException.ts:10` -- the registration pattern for a Xaravel-only class.
- `packages/assert/src/comparison/PhpComparison.ts:22,109-160` (read-only) -- the grader's read protocol. It checks `PHP_ARRAY in value`, and the iterator yields `[key, value]` with a key that is a safe-int `number`, an int-range `bigint` or a `string`. It throws on a repeated key.
- `packages/assert/src/comparison/PhpValues.ts:27` (read-only) -- the grader's `isFloat`: a `number` that is not a safe integer. The runtime differs on `-0` (PHP has no int -0); Story 9.11 reads the marker brand.
- `packages/assert/tests/xaravel/oracle-values.ts` (read-only) -- `readRequests`, `readSignedFixture` and `decode`, which give PHP arrays as `BrandedArray`. `packages/mockery/tests/xaravel/mockery.test.ts:42` imports it the same way.
- `conformance/oracle-requests/4.1.jsonl` -- the request line format (`php-expr`, `bindings`/`setup`/`exprs`, canonical `sha256`; docs/ops/oracle.md § Request format). Validate with `bun run oracle:story check 9.5`.
- `packages/runtime/tests/xaravel/registry.test.ts` -- the test style (`xaravelTest(id, consequence citing AD-n.k, body)`, `Assert.*`, `thrownBy`). Consequence ids AD-9.1, 9.2, 9.4 and 9.5 are in `conformance/xaravel-consequences/runtime.jsonl`; it has no FR lines.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/PhpArray.ts` -- the ordered map: a `Map` keyed by normalised keys, the brand getter, a pair iterator, and the map API in the matrix. Ends with `registerClass('Xaravel\\Runtime\\Php\\PhpArray', PhpArray)` -- AD-9.2.
- `packages/runtime/src/php/Ref.ts` -- `class Ref<T> { value: T }`, registered -- AD-9.2.
- `packages/runtime/src/php/PhpFloat.ts` -- `class PhpFloat extends Number` with the float brand getter, plus the `float(n)` and `isFloat(v)` functions, registered -- AD-9.4.
- `packages/runtime/src/php/normalizeNull.ts`, `packages/runtime/src/php/hasBrand.ts` -- the two functions -- AD-9.1, AD-9.5.
- `packages/runtime/src/php/jsonEncode.ts`, `src/php/index.ts`, `src/index.ts` -- the list rule and the exports.
- `conformance/oracle-requests/9.5.jsonl` -- three `php-expr` requests:
  - XT-runtime-16: the AC literal plus `array_map(fn ($k) => array_key_first([$k => 0]), $keys)` over the edge keys;
  - XT-runtime-17: `json_encode` over the matrix arrays;
  - XT-runtime-19: `is_float` over `1.0, 1, 1.5, NAN, -0.0, 9007199254740992.0`.
- `packages/runtime/tests/xaravel/values.test.ts` -- XT-runtime-16..21, one per manifest row, covering every matrix row:
  - 16, 17 and 19 compare with the signed fixtures. A missing fixture fails; the test never skips.
  - 16 also passes the `PhpArray` to `Assert.assertEquals` / `assertSame` against the decoded `BrandedArray`, so the grader's side of the protocol is tested too.
- `packages/runtime/async-surface.json` -- `bun run async-surface runtime` (no async methods are added).

**Acceptance Criteria:**
- The six ACs of Story 9.5 in `_bmad-output/planning-artifacts/epics.md` (line 3081), each verified by its XT-runtime-16..21 row (`stories/9.5.md`).
- Given the PR is pushed, when `oracle.yml#story` runs, then the `xaravel-oracle` bot commits the three fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Float marker form.** A primitive `number` cannot carry a mark, so `float(n)` returns a frozen `PhpFloat`, a `Number` subclass. Arithmetic, `+v`, `Number(v)` and comparisons still see the plain number ("stays usable"), and `isFloat` reads the brand. `isFloat(v)` is true for a marked value, and for a `number` that is not an int: a fraction, a non-finite value, `-0`, or anything beyond ±2^53−1, because AD-9.3 makes such an int a `bigint`.
- **Token keys.** AD-1/AD-9.5 write the brand as `get [Token]()`, so `hasBrand` uses the same property key JS derives from the token: a symbol is used as it is, and an object or function goes through its `Symbol.toPrimitive`. A class reads `klass.prototype[key] === true` and is never instantiated; any other object reads `value[key] === true`.
- **Fixtures.** Fixtures exist only after the bot signs them on the pushed PR, so the first push carries the request file. Pull the bot's commit before the last local run.

## Verification

**Commands:**
- `bun run oracle:story check 9.5` -- expected: every request accepted
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 21 pass (16, 17 and 19 only once the fixtures are pulled)
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run oracle:verify-fixtures` -- expected: clean
- `bun run story:check 9.5` -- expected: pass, after the Fidelity Review of the final tree
