---
title: 'Story 9.5: `PhpArray`, `Ref`, float marker and null normalisation'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'b12cb85d802505d10e63d12e6b3679d438c4f95b'
review_loop_iteration: 0
followup_review_recommended: true
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

### 2026-10-21 — Review pass
- verdicts: 24 findings — high 0, medium 4, low 16, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: brand checks differ (`PHP_ARRAY in value` vs `=== true`) — the `in` form is exactly the grader's own check (`PhpComparison.ts` `isBranded`), and no runtime value carries the array brand with a non-true value; the only producer is `PhpArray`'s getter.
  - `[low]` `[patch]` Blind: `PhpArray.set`/`push` inline the null rule instead of `normalizeNull` — now call `normalizeNull`.
  - `[low]` `[reject]` Blind: `offsetType` names `undefined`/`symbol`, which PHP never prints — neither is a PHP value (AD-9), so no PHP message exists to match; the message still names the JS type the caller passed.
  - `[medium]` `[patch]` Blind: the out-of-range `bigint` branch, `"-9223372036854775809"` and a fractional marked-float key are untested — assertions added to XT-runtime-16.
  - `[medium]` `[patch]` Blind: XT-runtime-19 marks every float-tagged Oracle value and then asserts `isFloat`, which is always true — it now also compares `isFloat` on the plain number with PHP (true for 1.5, NAN, -0.0, 2^53, false for the integral 1.0).
  - `[low]` `[reject]` Blind: the `push` next-free-index rules have no Oracle request — the matrix row does not require one; the rules were checked against local PHP 8.5.11 (`[-5 => x]` then `[]=` gives -4), and adding a request means another bot-signing cycle, more than a direct correction.
  - `[low]` `[reject]` Blind / Edge: a `PhpArray` mutated during `for…of` sees live changes, while PHP's `foreach` iterates a copy — PHP value-copy is Story 9.6's `valueCopy` (PORTING.md idiom table), and snapshotting every iteration would cost an O(n) copy on every read.
  - `[low]` `[patch]` Blind: the `PhpFloat` header says "comparisons" see the plain number, but `===`, `Object.is` and `assertSame` see an object — the header now names only arithmetic and relational operators and says to unwrap with `Number(v)`.
  - `[low]` `[patch]` Blind: `new PhpFloat(1)` skips `float()`'s freeze — the constructor now validates and freezes.
  - `[low]` `[patch]` Blind: the `hasBrand` docstring says "own `[key]`", but the code reads the prototype chain — wording fixed; a brand getter that throws on the prototype is rejected: AD-9.5 brand getters are `return true as const`.
  - `[low]` `[reject]` Blind: the `PhpArray` type parameter `K` adds no method safety — cosmetic; narrowing it changes the public type for no named caller.
  - `[low]` `[patch]` Blind: `get` looks the key up twice — now `get(normal) ?? null` (`undefined` is never stored).
  - `[low]` `[reject]` Blind: the test re-declares the grader helper's types and loads it with a dynamic `import()` — the runtime's generated tsconfig has no reference to assert (AD-2: runtime has no dependencies), and the file's comment records why; the import fails loudly if the helper changes shape.
  - `[low]` `[patch]` Blind: an over-long `jsonEncode` header line and a double blank line in `PhpFloat.ts` — rewrapped and removed.
  - `[medium]` `[patch]` Verification gap: an out-of-range `bigint` key reaching the `TypeError` is untested — same root cause and fix as the Blind bigint row.
  - `[medium]` `[patch]` Verification gap: `push(undefined)` turning the value into `null` is untested — assertion added.
  - `[low]` `[reject]` Edge: mutation during iteration — see the Blind iteration row.
  - `[low]` `[reject]` Edge: `new PhpArray(null)` throws a raw "is not iterable" — no caller passes null for the entries; accepting it widens the public signature.
  - `[low]` `[patch]` Edge: the `PhpFloat` constructor accepts a non-number — same fix as the Blind freeze row.
  - `[low]` `[patch]` Edge: the header overstates strict-equality behaviour — same fix as the Blind header row.
  - `[false]` `[reject]` Edge: `jsonEncode`'s `in` brand check vs `=== true` — see the first Blind row.
  - `[false]` `[reject]` Edge: `hasBrand` on a bound class reports no brand — a bound function has no `prototype` and is not a class that AD-9.5 brands; no framework code binds classes.
  - `[false]` `[reject]` Intent alignment: descriptive report only. Boundary use of `normalizeNull` and the float marker belongs to the Components that own those boundaries, and the grader's read of the float brand is Story 9.11 (ESC-4.1-1); no divergence from the ACs.
  - `[low]` `[patch]` Fidelity Review reviewer 1, F-10 `conformance/oracle-requests/9.5.jsonl`: no recorded reason for requests that are not an Upstream test's inputs — the test file now records the reason: they are Xaravel Differential requests for Xaravel Tests, which have no Upstream test (docs/ops/oracle.md § Per-Story requests), and each evaluates only its AC's PHP construct. This changes the reviewed tree; the layer re-runs.

### 2026-10-21 — Review pass (Fidelity Review re-run on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Both reviewers passed tree `a94daacc0422ebe5e273b38ec84ad574a8c8a2c4`, and `fidelity:review status` prints `current: 2 pass verdicts`.

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

## Auto Run Result

Status: done (2026-10-21, build)
- **Summary:** AD-9's value model as runtime types in `@xaravel/runtime/php`, also exported from the package root.
  - `PhpArray` has PHP 8.5 key normalisation, insertion order and the ESC-4.1-1 pair iterator.
  - Bad keys throw PHP's offset `TypeError`, and `push` follows PHP's next-free-index rule.
  - `Ref<T>`, the float marker (`float(n)` / `isFloat(v)`, a frozen branded `Number` subclass), `normalizeNull` and `hasBrand` are added.
  - `jsonEncode`'s core now applies the list rule to a `PhpArray`.
  - Key normalisation, `json_encode` and `is_float` are checked against three Oracle fixtures that the `xaravel-oracle` bot signed on PR #279.
- **Files:**
  - `packages/runtime/src/php/PhpArray.ts`: the ordered map, registered as `Xaravel\Runtime\Php\PhpArray`.
  - `packages/runtime/src/php/PhpFloat.ts`: `PhpFloat`, `float` and `isFloat`.
  - `packages/runtime/src/php/Ref.ts`: the by-reference box.
  - `packages/runtime/src/php/normalizeNull.ts`, `packages/runtime/src/php/hasBrand.ts`: the two helpers.
  - `packages/runtime/src/php/jsonEncode.ts`: the `PhpArray` list rule; a marked float throws the existing float error.
  - `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts`: exports.
  - `conformance/oracle-requests/9.5.jsonl` and `conformance/fixtures/runtime/*.json`: three requests and their signed fixtures.
  - `packages/runtime/tests/xaravel/values.test.ts`: XT-runtime-16..21.
- **Review:** 24 findings (medium 4, low 16, false 4).
  - 15 rows patched, in 9 fixes. Three of the fixes were medium: the out-of-range `bigint` key test, the plain-number `isFloat` comparison with PHP in XT-runtime-19, and the `push(undefined)` test.
  - Nothing was deferred.
  - 9 rows were rejected; each reason is in the triage log.
  - The Fidelity Review first rejected tree `8bca7fa…` on F-10, because the Xaravel Test requests carried no recorded reason. The test file now records one, and both reviewers passed tree `a94daacc0422ebe5e273b38ec84ad574a8c8a2c4`.
- **Follow-up review recommended: true.** The first pass patched three medium entries. Those patches were re-reviewed only by the Fidelity Review, not by the blind, edge-case and verification-gap layers. They are the `PhpFloat` constructor validation and freeze, `get`'s `?? null` and the new assertions.
- **Verification:**
  - `bun run harness --xaravel`: 311/311 pass, XT-runtime-16..21 included.
  - Clean: `bun --bun tsc -b`, `bun run lint`, `bun run registration:check` (4 registrations), `bun run graph:check`, `bun run async-surface --all --check`, `bun run oracle:story check 9.5`, `bun run oracle:verify-fixtures`.
  - `bun run story:check 9.5`: the committed tree is re-checked after the final commit.
- **Residual risks:**
  - The grader does not read the float brand until Story 9.11 (ESC-4.1-1), so `assertSame(1, float(1))` compares an object with a number.
  - Mutating a `PhpArray` during `for…of` sees live changes; PHP's value copy is Story 9.6's `valueCopy`.
  - The runtime test loads the grader's fixture reader with a dynamic `import()`, because the runtime's tsc project has no reference to assert.

## Fidelity Review

### Reviewer 1: reject at tree 8bca7fa96448940bd45907fc3af0569f7202ed1d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `b12cb85d802505d10e63d12e6b3679d438c4f95b`, on 2026-10-21T23:00:23.168Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests. |
| F-2: No expected value is weakened | pass | The new Xaravel Tests use exact fixture comparisons and explicit expected values; no existing expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All supplied Oracle fixtures have output.error set to null; no error fixture requires comparison. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-16 through XT-runtime-21 check their declared key normalisation, JSON list rule, reference writes, float marking, null normalisation and brand lookup consequences. Their AD-9 citations identify the corresponding bullets. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation changes remain within runtime and implement its value helpers; the tests reuse the existing grader fixture reader without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The source diffs and declaration evidence show synchronous value operations with no IO roots or callbacks allowed to be async. No asyncRoot tag is present or required. |
| F-10: Oracle requests match the Upstream test's inputs | fail | The three added Oracle requests name Xaravel Tests rather than supplied Upstream tests. Their PHP inputs are visible, but no recorded reason explicitly authorizes this departure from Upstream-test inputs. |

Findings:

- **F-10** `conformance/oracle-requests/9.5.jsonl`: Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"8bca7fa96448940bd45907fc3af0569f7202ed1d","base":"b12cb85d802505d10e63d12e6b3679d438c4f95b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:00:23.168Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new Xaravel Tests use exact fixture comparisons and explicit expected values; no existing expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"All supplied Oracle fixtures have output.error set to null; no error fixture requires comparison.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-16 through XT-runtime-21 check their declared key normalisation, JSON list rule, reference writes, float marking, null normalisation and brand lookup consequences. Their AD-9 citations identify the corresponding bullets.","findings":[]},{"id":"F-8","result":"pass","note":"The implementation changes remain within runtime and implement its value helpers; the tests reuse the existing grader fixture reader without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The source diffs and declaration evidence show synchronous value operations with no IO roots or callbacks allowed to be async. No asyncRoot tag is present or required.","findings":[]},{"id":"F-10","result":"fail","note":"The three added Oracle requests name Xaravel Tests rather than supplied Upstream tests. Their PHP inputs are visible, but no recorded reason explicitly authorizes this departure from Upstream-test inputs.","findings":[{"path":"conformance/oracle-requests/9.5.jsonl","detail":"Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs."}]}],"prior":[]}
```

### Reviewer 2: pass at tree 8bca7fa96448940bd45907fc3af0569f7202ed1d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `b12cb85d802505d10e63d12e6b3679d438c4f95b`, on 2026-10-21T23:00:23.168Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test. The only tests are the Xaravel Tests in packages/runtime/tests/xaravel/values.test.ts, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | No Ported Test exists. I checked the expected values in the Xaravel Tests against the signed fixtures. XT-runtime-16 uses assertSame per edge key and asserts the AC literal with assertSame against the Oracle's decoded array. The fixture's keys (1→'d', '01'→'b', ''→'e') match the hard-coded assertions. XT-runtime-17 compares jsonEncode byte for byte (assertSame) with each json_encode result, and the hard-coded strings equal the fixture. XT-runtime-19 compares isFloat per element with is_float [true,false,true,true,true,true]. No expected value is loosened or bent to fit Xaravel's output. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests, so no Upstream assertion count applies. No adapted marker appears (evidence (a)). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line and sets no test to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) confirms no added line carries an adapted:DIV marker, and no Expectations adapted field is touched. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no base or changed fixture is an error. All three added fixtures (6c67…, a858…, 4c0c…) have output.error null. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared each consequence string with its test body and its cited bullet. XT-runtime-16 checks every claim against AD-9.2's PhpArray bullet: key normalisation and insertion order (the literal, where true overwrites key 1 in first position), the rewrite via map.set(0), all 18 edge keys against the Oracle, illegal-key TypeErrors, and the map API with push at the next free index (including negative keys, delete and the PHP_INT_MAX error). XT-runtime-17 checks the list rule against json_encode byte for byte (AD-9.2: 'Its JSON form follows the list rule'). XT-runtime-18 checks writes through Ref<T> (AD-9.2's by-reference bullet). XT-runtime-19 checks that float() marks a value, that isFloat matches the Oracle's is_float, that the value stays usable as a number, and that float() of a non-number throws a TypeError (AD-9.4 float marker). XT-runtime-20 checks that normalizeNull turns undefined into null and returns other values unchanged (AD-9.1). XT-runtime-21 checks hasBrand on a class, a subclass and an instance with no constructor call, the symbol and toPrimitive tokens, and the false cases (AD-9.5). |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime/src (component runtime): new php/ files, the php/index and root index exports, and jsonEncode's PhpArray list rule, which the manifest's XT-runtime-17 row assigns to this Story. The test loads the grader's fixture reader at run time. That reads signed fixtures and adds no stub, fake or hard-coded return of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any touched file. Every new export is synchronous: float, isFloat, PhpFloat, hasBrand, normalizeNull, PhpArray (including get/set/has/delete/push and the iterators), Ref and jsonEncode. None performs IO behind an async-root contract or accepts a callback, so under AD-6.2/AD-6.13 and DIV-1 no tag is needed and none is wrong. |
| F-10: Oracle requests match the Upstream test's inputs | pass | conformance/oracle-requests/9.5.jsonl has three requests named after Xaravel Tests, not Upstream tests. I compared their inputs with the tests they feed. XT-runtime-16's literal is the AC literal, and $keys matches EDGE_KEYS in order: 9.2233720368547758E18 is 2**63, and 9007199254740993 is a PHP int, matching the bigint. XT-runtime-17's six json_encode inputs match the six PhpArrays built in the test. XT-runtime-19's $v matches the values the test reads from the fixture. Each expression computes the PHP behaviour under test (key normalisation, json_encode, is_float), so no arbitrary PHP is signed as an expected value. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"8bca7fa96448940bd45907fc3af0569f7202ed1d","base":"b12cb85d802505d10e63d12e6b3679d438c4f95b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:00:23.168Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test. The only tests are the Xaravel Tests in packages/runtime/tests/xaravel/values.test.ts, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test exists. I checked the expected values in the Xaravel Tests against the signed fixtures. XT-runtime-16 uses assertSame per edge key and asserts the AC literal with assertSame against the Oracle's decoded array. The fixture's keys (1→'d', '01'→'b', ''→'e') match the hard-coded assertions. XT-runtime-17 compares jsonEncode byte for byte (assertSame) with each json_encode result, and the hard-coded strings equal the fixture. XT-runtime-19 compares isFloat per element with is_float [true,false,true,true,true,true]. No expected value is loosened or bent to fit Xaravel's output.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests, so no Upstream assertion count applies. No adapted marker appears (evidence (a)).","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line and sets no test to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) confirms no added line carries an adapted:DIV marker, and no Expectations adapted field is touched.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no base or changed fixture is an error. All three added fixtures (6c67…, a858…, 4c0c…) have output.error null.","findings":[]},{"id":"F-7","result":"pass","note":"I compared each consequence string with its test body and its cited bullet. XT-runtime-16 checks every claim against AD-9.2's PhpArray bullet: key normalisation and insertion order (the literal, where true overwrites key 1 in first position), the rewrite via map.set(0), all 18 edge keys against the Oracle, illegal-key TypeErrors, and the map API with push at the next free index (including negative keys, delete and the PHP_INT_MAX error). XT-runtime-17 checks the list rule against json_encode byte for byte (AD-9.2: 'Its JSON form follows the list rule'). XT-runtime-18 checks writes through Ref<T> (AD-9.2's by-reference bullet). XT-runtime-19 checks that float() marks a value, that isFloat matches the Oracle's is_float, that the value stays usable as a number, and that float() of a non-number throws a TypeError (AD-9.4 float marker). XT-runtime-20 checks that normalizeNull turns undefined into null and returns other values unchanged (AD-9.1). XT-runtime-21 checks hasBrand on a class, a subclass and an instance with no constructor call, the symbol and toPrimitive tokens, and the false cases (AD-9.5).","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime/src (component runtime): new php/ files, the php/index and root index exports, and jsonEncode's PhpArray list rule, which the manifest's XT-runtime-17 row assigns to this Story. The test loads the grader's fixture reader at run time. That reads signed fixtures and adds no stub, fake or hard-coded return of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any touched file. Every new export is synchronous: float, isFloat, PhpFloat, hasBrand, normalizeNull, PhpArray (including get/set/has/delete/push and the iterators), Ref and jsonEncode. None performs IO behind an async-root contract or accepts a callback, so under AD-6.2/AD-6.13 and DIV-1 no tag is needed and none is wrong.","findings":[]},{"id":"F-10","result":"pass","note":"conformance/oracle-requests/9.5.jsonl has three requests named after Xaravel Tests, not Upstream tests. I compared their inputs with the tests they feed. XT-runtime-16's literal is the AC literal, and $keys matches EDGE_KEYS in order: 9.2233720368547758E18 is 2**63, and 9007199254740993 is a PHP int, matching the bigint. XT-runtime-17's six json_encode inputs match the six PhpArrays built in the test. XT-runtime-19's $v matches the values the test reads from the fixture. Each expression computes the PHP behaviour under test (key normalisation, json_encode, is_float), so no arbitrary PHP is signed as an expected value.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree a94daacc0422ebe5e273b38ec84ad574a8c8a2c4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `b12cb85d802505d10e63d12e6b3679d438c4f95b`, on 2026-10-21T23:07:19.672Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests; all added tests are Xaravel Tests. |
| F-2: No expected value is weakened | pass | The added tests retain exact Oracle comparisons and explicit exception types and messages; no expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adapted marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All supplied Oracle fixtures have output.error set to null, and the evidence identifies no relied-on error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-16 through XT-runtime-21 with their consequence strings and AD-9 bullets. Their assertions verify key normalisation, JSON list rules, reference writes, float marking, null normalisation and prototype brand checks as declared. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes remain within runtime and implement its value representations and encoding; no other Component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the source diff and declaration evidence with AD-6 and DIV-1. No asyncRoot tags are present, and the changed implementations perform synchronous value operations without async callbacks or IO. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Compared all three requests with the recorded F-10 reason in values.test.ts. It explicitly explains the absence of Upstream tests and maps each standalone PHP probe to its Xaravel acceptance criterion; the requests match that explanation. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-10) `conformance/oracle-requests/9.5.jsonl`: Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs. **fixed**: The added F-10 comment explicitly records why XT-runtime-16, XT-runtime-17 and XT-runtime-19 use standalone PHP probes instead of Upstream-test inputs and describes the constructs each request evaluates.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a94daacc0422ebe5e273b38ec84ad574a8c8a2c4","base":"b12cb85d802505d10e63d12e6b3679d438c4f95b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:07:19.672Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests; all added tests are Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests retain exact Oracle comparisons and explicit exception types and messages; no expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adapted marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"All supplied Oracle fixtures have output.error set to null, and the evidence identifies no relied-on error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-16 through XT-runtime-21 with their consequence strings and AD-9 bullets. Their assertions verify key normalisation, JSON list rules, reference writes, float marking, null normalisation and prototype brand checks as declared.","findings":[]},{"id":"F-8","result":"pass","note":"Framework changes remain within runtime and implement its value representations and encoding; no other Component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the source diff and declaration evidence with AD-6 and DIV-1. No asyncRoot tags are present, and the changed implementations perform synchronous value operations without async callbacks or IO.","findings":[]},{"id":"F-10","result":"pass","note":"Compared all three requests with the recorded F-10 reason in values.test.ts. It explicitly explains the absence of Upstream tests and maps each standalone PHP probe to its Xaravel acceptance criterion; the requests match that explanation.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-10","path":"conformance/oracle-requests/9.5.jsonl","detail":"Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs.","fixed":true,"note":"The added F-10 comment explicitly records why XT-runtime-16, XT-runtime-17 and XT-runtime-19 use standalone PHP probes instead of Upstream-test inputs and describes the constructs each request evaluates."}]}
```

### Reviewer 2: pass at tree a94daacc0422ebe5e273b38ec84ad574a8c8a2c4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `b12cb85d802505d10e63d12e6b3679d438c4f95b`, on 2026-10-21T23:07:19.672Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty, so the change adds or changes no Ported Test and there is no Upstream source to compare with. |
| F-2: No expected value is weakened | pass | No Ported Tests. The six Xaravel Tests (evidence e) assert exact values (assertSame, exact messages) or compare with signed Oracle results. No expected value is loosened or set to match Xaravel's output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker (evidence a), and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All three added fixtures have output.error null, and evidence c lists no error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Checked each body against its consequence string and cited bullet. XT-16 checks AD-9.2 key normalisation, insertion order, a rewrite keeping its first position, edge keys against the Oracle, illegal-key TypeErrors and push at the next free index. XT-17 checks the AD-9.2 list rule for JSON against the Oracle's json_encode. XT-18 checks the AD-9.2 Ref<T> write-back. XT-19 checks the AD-9.4 float marker, isFloat against is_float, that the marked value stays usable as a number, and the TypeError. XT-20 checks AD-9.1 normalizeNull. XT-21 checks AD-9.5 prototype brands read from a class, subclass and instance with the constructor count still 0. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime (the runtime Component): PhpArray, Ref, PhpFloat, normalizeNull, hasBrand, and the PhpArray branch of jsonEncode. No stub, fake or hard-coded return of another Component. The test loads the grader's real fixture reader at run time. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence g lists no @​asyncRoot tags in the changed src files. Every export (PhpArray methods, float, isFloat, PhpFloat, Ref, hasBrand, normalizeNull, jsonEncode) is synchronous, does no IO and takes no callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | pass | The ids in 9.5.jsonl name Xaravel Tests, and no Upstream test exists for them (test_ids is empty). values.test.ts records why. Each request evaluates only the PHP construct its acceptance criterion names: XT-16 the AC literal and array_key_first over edge keys, XT-17 json_encode of the test's arrays, XT-19 is_float over the listed values. No Laravel code and no arbitrary PHP signed as an expected value. Spot-checked fixture outputs agree with PHP semantics, e.g. 1e20 wraps to 7766279631452241920. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-10) `conformance/oracle-requests/9.5.jsonl`: Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs. **fixed**: values.test.ts now has an 'F-10 recorded reason' header. It says XT-runtime-16, 17 and 19 are Xaravel Tests with no Upstream test (test_ids empty), cites docs/ops/oracle.md's per-Story requests rule and Epic 9's Oracle Differential requirement, and says what each request evaluates. This supplies the requested reason in tests, as ESC-8.8-1 allows.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a94daacc0422ebe5e273b38ec84ad574a8c8a2c4","base":"b12cb85d802505d10e63d12e6b3679d438c4f95b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:07:19.672Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty, so the change adds or changes no Ported Test and there is no Upstream source to compare with.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Tests. The six Xaravel Tests (evidence e) assert exact values (assertSame, exact messages) or compare with signed Oracle results. No expected value is loosened or set to match Xaravel's output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker (evidence a), and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"All three added fixtures have output.error null, and evidence c lists no error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Checked each body against its consequence string and cited bullet. XT-16 checks AD-9.2 key normalisation, insertion order, a rewrite keeping its first position, edge keys against the Oracle, illegal-key TypeErrors and push at the next free index. XT-17 checks the AD-9.2 list rule for JSON against the Oracle's json_encode. XT-18 checks the AD-9.2 Ref<T> write-back. XT-19 checks the AD-9.4 float marker, isFloat against is_float, that the marked value stays usable as a number, and the TypeError. XT-20 checks AD-9.1 normalizeNull. XT-21 checks AD-9.5 prototype brands read from a class, subclass and instance with the constructor count still 0.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime (the runtime Component): PhpArray, Ref, PhpFloat, normalizeNull, hasBrand, and the PhpArray branch of jsonEncode. No stub, fake or hard-coded return of another Component. The test loads the grader's real fixture reader at run time.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence g lists no @asyncRoot tags in the changed src files. Every export (PhpArray methods, float, isFloat, PhpFloat, Ref, hasBrand, normalizeNull, jsonEncode) is synchronous, does no IO and takes no callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"pass","note":"The ids in 9.5.jsonl name Xaravel Tests, and no Upstream test exists for them (test_ids is empty). values.test.ts records why. Each request evaluates only the PHP construct its acceptance criterion names: XT-16 the AC literal and array_key_first over edge keys, XT-17 json_encode of the test's arrays, XT-19 is_float over the listed values. No Laravel code and no arbitrary PHP signed as an expected value. Spot-checked fixture outputs agree with PHP semantics, e.g. 1e20 wraps to 7766279631452241920.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-10","path":"conformance/oracle-requests/9.5.jsonl","detail":"Provide a recorded reason for using standalone PHP probes for XT-runtime-16, XT-runtime-17 and XT-runtime-19, or supply the Upstream test sources establishing their setup and exprs. The manifest and test comments describe their purpose but do not record the reason for departing from Upstream-test inputs.","fixed":true,"note":"values.test.ts now has an 'F-10 recorded reason' header. It says XT-runtime-16, 17 and 19 are Xaravel Tests with no Upstream test (test_ids empty), cites docs/ops/oracle.md's per-Story requests rule and Epic 9's Oracle Differential requirement, and says what each request evaluates. This supplies the requested reason in tests, as ESC-8.8-1 allows."}]}
```
