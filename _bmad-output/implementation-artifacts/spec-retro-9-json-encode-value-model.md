---
title: 'Epic 9 action item 4: jsonEncode agrees with 9.6''s value model'
type: 'bugfix'
created: '2026-10-22'
baseline_revision: '1291ff3104a3e0b9d792d02adaee09cc556e6f41'
action_item: 'epic-9-retro-item-4-json-encode-value-model'
status: 'blocked'
review_loop_iteration: 3
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-retro-2026-10-22.md'
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
warnings: []
deferred:
  - summary: >-
      jsonDecode accepts a NaN or fractional depth instead of PHP's TypeError or truncation.
    evidence: |-
      jsonDecode.ts:93-98 checks only depth <= 0 and depth > INT_MAX; NaN passes both. Retro L7 cites jsonDecode.ts:85-90, but action item 4 names jsonEncode only.
    location: >-
      packages/runtime/src/php/jsonDecode.ts:93
    severity: medium
  - summary: >-
      jsonEncode's flags is not parsed as Z_PARAM_LONG; a NaN or Infinity flags reads as 0.
    evidence: |-
      PHP 8.5: json_encode([1], NAN) is a TypeError "Argument #2 ($flags) must be of type int, float given". Pre-existing, outside the action.
    location: >-
      packages/runtime/src/php/jsonEncode.ts
    severity: low
  - summary: >-
      PORTING.md does not tell porters that an empty plain object encodes as [] and to use stdClass or JSON_FORCE_OBJECT for {}.
    evidence: |-
      PORTING.md is a Protected Path outside this item's scope.
    location: >-
      PORTING.md
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `jsonEncode` re-implements 9.6's type classification instead of reusing it (retro findings L6–L8): a plain object's integer-like keys stay strings and a plain object is never a list, so `{"0":"a","1":"b"}` encodes as `{"0":"a","1":"b"}` where PHP's `json_encode(['0'=>'a','1'=>'b'])` gives `["a","b"]`; a `depth` beyond INT_MAX, or a NaN/INF depth, is used as is (PHP truncates `(int)$depth`, so `json_encode([1], 0, 2147483648)` is `false`, and a non-finite or out-of-int64 float depth is a `TypeError`); and XT-runtime-22's truth table drives floats only in marked `float()` form, never as plain `number`s.

**Approach:** Classify an object value through `phpType` and read every PHP array's entries through `arrayEntries` (which applies `normalizeKey`), then apply PHP's list rule (keys exactly `0..n-1` in order) to all three array shapes. Parse `depth` as PHP's `Z_PARAM_LONG` in coercive mode then `(int)` cast: a non-finite number or one outside `[-2^63, 2^63)` throws PHP's `TypeError`, otherwise the depth is truncated toward zero and wrapped to int32 (`ToInt32`). Add a plain-`number` pass of XT-runtime-22's matrices.

## Boundaries & Constraints

**Always:** Change only `packages/runtime/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT-2026-10-16, amendment 2026-10-22). Every behaviour asserted is checked against local PHP 8.5.11 (`php -r`) before it is written down. Keep the existing behaviour for everything else: a bigint beyond int64 still encodes as its exact digits, a symbol is still `JSON_ERROR_UNSUPPORTED_TYPE`, `undefined` and an array hole are `null`, the top-level Jsonable/Arrayable hooks run before the depth is parsed (Laravel never calls `json_encode` on the Jsonable path). The depth `TypeError` is thrown before `json_last_error()` is touched, as PHP's parameter parsing is. Each fix has an XT case that fails on the baseline, in a new `XT-runtime-38` in `packages/runtime/tests/xaravel/json.test.ts`. Keep `jsonEncode` load-safe when imported first in a fresh process (XT-runtime-27's check).

**Never:** No change to `conformance/expectations/**`, to another package, or to any Protected Path; no new Oracle request (none can be signed on this route). No edit of the item's `action`, `owner` or `epic`. No removed or weakened assertion. No change to `jsonDecode` (not in the item's action). Do not reproduce PHP's float-to-int deprecation notice (the runtime never reproduces notices, `casts.ts` header).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Integer-like keys, list | `jsonEncode({"0":"a","1":"b"})` | `["a","b"]` | — |
| Integer-like keys, not a list | `jsonEncode({"1":"a"})`, `jsonEncode({"01":"a","-0":"b"})` | `{"1":"a"}`, `{"01":"a","-0":"b"}` | — |
| Forced object | `jsonEncode({"0":"a"}, JSON_FORCE_OBJECT)` | `{"0":"a"}` | — |
| Depth wraps to INT_MIN | `jsonEncode([1], 0, 2147483648)` | `false`, `jsonLastError()` 1 (depth) | — |
| Depth wraps to 1 | `jsonEncode([1], 0, 4294967297)` / `[[1]]` | `"[1]"` / `false` | — |
| Fractional depth | `jsonEncode([1], 0, 2.5)` | `"[1]"` (truncated to 2) | no notice |
| Non-finite / out-of-int64 depth | depth `NaN`, `Infinity`, `2**63`, `1e19` | — | PHP `TypeError` `json_encode(): Argument #3 ($depth) must be of type int, float given`, `jsonLastError()` unchanged |
| Plain floats in 9.6 table | XT-runtime-22 operands decoded with non-integral, `-0`, INF, NAN floats as plain `number` | same `==`, `<=>`, casts results as the Oracle | — |

</intent-contract>

## Code Map

- `packages/runtime/src/php/jsonEncode.ts` -- `jsonEncode` (depth parse goes after the Jsonable/Arrayable hook, `:96-111`); `encodeValue` object branch (`:150-180`) re-classifies by hand: Array, `PHP_ARRAY`, plain prototype (keys verbatim, `list=false` at `:180-183`), JsonSerializable, other object. `encodeContainer` writes a non-string key as `"${key}"`, so int keys from `normalizeKey` print unchanged. Header comment (Arrays bullet) must say the new rule.
- `packages/runtime/src/php/casts.ts:26-38` -- `arrayEntries(v)`: entries of all three PHP array shapes, plain-object keys through `normalizeKey`, values `?? null`. Reuse it.
- `packages/runtime/src/php/phpType.ts:17-50` -- `phpType`: `float` (marker), `array` (Array, brand, plain prototype), `object`. Throws on a symbol/out-of-int64 bigint, so call it only for non-null objects.
- `packages/runtime/src/php/PhpArray.ts:64` -- `normalizeKey` (PHP's canonical-decimal int-key rule).
- `packages/runtime/src/php/TypeError.ts` -- PHP's `TypeError` to throw for a bad depth; `jsonDecode.ts:118` shows the `json_decode(): Argument #3 ($depth) …` message idiom with `ValueError`.
- `packages/runtime/tests/xaravel/json.test.ts` -- XT-runtime-27..30 (jsonEncode/jsonDecode). Add `XT-runtime-38` (next free id; ids are checked unique by XT-conformance-128) with local rows for the matrix above. `assertJsonError` helper already exists there.
- `packages/runtime/tests/xaravel/semantics.test.ts:94-121`, `:174-245` -- `decodeMarked` and XT-runtime-22's matrices; add a `decodePlain` (a float the model can hold as a plain `number`, i.e. `phpType(n) === "float"`, stays plain; an integral float stays `float()`-marked) and run the `==`, `<=>`, is_numeric, casts and `(string)` checks for both decodings.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/jsonEncode.ts` -- classify objects through `phpType`; encode every PHP array through `arrayEntries` with the list rule; add PHP's depth parameter parse and int32 cast; update the header -- L6, L7.
- `packages/runtime/tests/xaravel/json.test.ts` -- add `XT-runtime-38` covering every matrix row except the last, each value verified against local PHP 8.5.11 -- each fix with a case failing on the baseline.
- `packages/runtime/tests/xaravel/semantics.test.ts` -- add the plain-`number` float pass to XT-runtime-22 without removing any assertion -- L8.

**Acceptance Criteria:**
- Given the baseline `jsonEncode`, when XT-runtime-38 runs, then it fails; after the change it passes, and XT-runtime-1..37 still pass.
- Given XT-runtime-22's Oracle fixture, when its operands are decoded with plain-`number` floats, then every matrix agrees with the Oracle as the marked pass does.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then the harness reports no difference and both others exit 0.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 22 findings — high 0, medium 3, low 9, false 6, maybe-false 0 (plus 4 rejected as outside the intent; F-7 counted under medium)
- findings:
  - `[low]` `[patch]` (edge-case) A plain object with integer-like keys out of order encodes in JS's ascending order (`{"1":"b","0":"a"}` gives `["a","b"]`, PHP `{"1":"b","0":"a"}`) — real, but the same limit `arrayEntries` already has for every 9.6 helper (`phpSerialize` included) and AD-9.2 makes such an array a `PhpArray`; normalising is the option the action names. Patched: the limit is documented in the header and `docs/codecs.md`.
  - `[low]` `[reject]` (edge-case) A `bigint`, marked-float or null `depth` throws "float given" — the signature is `depth: number`, so tsc refuses those arguments; a PHP int depth beyond 2^53 is not met in practice, and accepting `bigint` would widen the public signature.
  - `[false]` `[reject]` (intent) The empty plain object now encodes as `[]` — PHP-correct: an empty plain object is an empty PHP array (AD-9.2), and PHP 8.5.11 gives `[]`; the classmap keeps `{}` with `JSON_FORCE_OBJECT`, recorded in Design Notes.
  - `[medium]` `[patch]` (intent, verification-gap) `packages/runtime/docs/codecs.md` still describes the list rule only for `PhpArray` and not the depth parse — patched.
  - `[low]` `[patch]` (verification-gap) `packages/runtime/docs/exceptions.md` lacks the new depth `TypeError` — patched.
  - `[medium]` `[defer]` (intent, blind) `jsonDecode` still accepts a NaN or fractional depth — pre-existing, and the action names `jsonEncode` only; deferred.
  - `[low]` `[reject]` (intent) L8's plain pass does not fail on the baseline — the retro says L8 is a test gap with no behaviour difference, so no failing case can exist; XT-runtime-38 fails on the baseline for L6 and L7.
  - `[low]` `[reject]` (intent) No codec round-trip row (`phpSerialize` vs `jsonEncode`) — XT-runtime-38 asserts the output L6's probe named directly.
  - `[low]` `[defer]` (blind) `flags` is not parsed as `Z_PARAM_LONG` (a NaN flags is 0, PHP a `TypeError`) — pre-existing, outside the action; deferred.
  - `[medium]` `[defer]` (blind) `PORTING.md` does not tell porters to use `stdClass` or `JSON_FORCE_OBJECT` for `{}` output — `PORTING.md` is a Protected Path outside this item's scope; deferred.
  - `[low]` `[patch]` (blind) Boundary rows missing: the largest double below 2^63, and `jsonLastError()` after the `-(2 ** 63)` row — patched.
  - `[low]` `[reject]` (blind) No row for a top-level Arrayable/JsonSerializable with a bad depth — the order follows from the code (hooks before `parseDepth`), and the Jsonable row already pins it.
  - `[low]` `[patch]` (blind) No fresh-process row imports `src/php/jsonEncode.ts` first, though the header claims it is load-safe — patched with a cycleRow script.
  - `[false]` `[reject]` (blind) The classmap change is tested only empty — XT-runtime-15 round-trips a non-empty classmap through `writeClassmap`/`loadClassmap`.
  - `[low]` `[reject]` (blind) `decodePlain` copies `phpType`'s int/float rule — `phpType` is not exported from `@xaravel/runtime/php`, and the test reads only the public surface.
  - `[low]` `[reject]` (blind) The plain-pass sanity check covers only the top level of `$w` — the `$f` list is all floats by construction (the float-format list).
  - `[false]` `[reject]` (blind) No record of XT-runtime-15's changed expected value — recorded in Design Notes.
  - `[false]` `[reject]` (blind) `ESC-9.4-1` describes the core as "plain objects with string keys" — that record describes the 9.4 core and stays true for string keys; decision records are not rewritten.
  - `[false]` `[reject]` (blind) No record of the local PHP checks or the baseline failure — recorded under Auto Run Result.
  - `[false]` `[reject]` (verification-gap) no gap found (summary line, not a defect).
  - `[false]` `[reject]` (intent) L7 goes beyond "INT_MAX or NaN" — the action says "as PHP does", which is the full `Z_PARAM_LONG` rule.
  - `[medium]` `[patch]` (fidelity-review, reviewer 1 F-7) XT-runtime-22's Oracle request and fixture are not in the prompt, so coverage of both decoding passes cannot be confirmed — an evidence gap: `conformance/oracle-requests/9.6.jsonl` and its fixture exist in the repository but evidence (c) shows only requests a Story manifest assigns and (h) follows imports, not `readRequests(join(REPO, …))`. The patches change the reviewed tree; the layer re-runs.

### 2026-10-22 — Review pass (Fidelity Review re-run, tree a9edbd3)
- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` (fidelity-review, reviewer 1 F-7) XT-runtime-22's request and fixture are still not in the prompt, so the declared operand coverage in both passes is unverified — patched in the test, as reviewer 2 allows ("or otherwise show in the test"): each pass now asserts `$w` has the request's 73 operands and holds null, true, false, int 0, PHP_INT_MAX, the numeric, leading-whitespace and other strings (`"1e3"`, `"INF"`, `"NAN"` among them), an empty Array, a PhpArray, a plain-object array and the 4 closing objects, and that 1.5, -1.5, -0.0, INF, -INF and NAN are plain numbers in the plain pass and marked floats in the marked pass. Operands read from `conformance/oracle-requests/9.6.jsonl`'s setup.
  - `[medium]` `[patch]` (fidelity-review, reviewer 2 F-7) The same finding (P-1 not fixed) — same patch.

## Design Notes

The list rule has one consequence beyond the matrix: an empty plain object is an empty PHP array, so it encodes as PHP's `[]` (PHP 8.5.11: `json_encode(['a' => [1], 'b' => []])` is `{"a":[1],"b":[]}`). Two files outside the Code Map follow from it, both in `packages/runtime`:

- `packages/runtime/src/registry/index.ts` -- the classmap encoder adds `JSON_FORCE_OBJECT`, so an empty classmap stays `{}` (XT-runtime-27's fresh-process row). Its keys are class names and its values strings, so nothing else changes.
- `packages/runtime/tests/xaravel/registry.test.ts` (XT-runtime-15) -- the row asserting `jsonEncode({…, b: {}})` expected `"b":{}`, which was the bug; it now expects PHP's `"b":[]`. The assertion stays; only its expected value moves to what PHP gives.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: all pass, XT-runtime-38 included.
- `bun run harness` -- expected: SUMMARY with no difference.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run fidelity:review status --item epic-9-retro-item-4-json-encode-value-model --spec _bmad-output/implementation-artifacts/spec-retro-9-json-encode-value-model.md` -- expected: `current`.

## Fidelity Review

### Reviewer 1: reject at tree 72491f1ab99b4703d995e14a6e779b579aa8cbe7

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:26:27.612Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | Exact comparisons remain exact. The changed empty-object expectation becomes [] consistently with the supplied PHP array value model; the semantics matrices retain their Oracle-derived expected values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes, so no Upstream assertion floor applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle output.error fixture requiring comparison with an expected Upstream exception. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-38 and XT-runtime-15 check their stated consequences. XT-runtime-22 retains exact differential checks, but its Oracle operands and expected matrices are absent, preventing confirmation of its declared domain coverage. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation and test paths belong to runtime, the action item's listed component; no other component's behavior is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files contain no async-root tags or new Promise-returning methods. Encoding and its hooks remain synchronous; the Registry re-export retains the separately shown, approved resolveClassAsync root. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no changed setup or exprs inputs to compare. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"72491f1ab99b4703d995e14a6e779b579aa8cbe7","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:26:27.612Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"Exact comparisons remain exact. The changed empty-object expectation becomes [] consistently with the supplied PHP array value model; the semantics matrices retain their Oracle-derived expected values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test changes, so no Upstream assertion floor applies.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle output.error fixture requiring comparison with an expected Upstream exception.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-38 and XT-runtime-15 check their stated consequences. XT-runtime-22 retains exact differential checks, but its Oracle operands and expected matrices are absent, preventing confirmation of its declared domain coverage.","findings":[{"path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed."}]},{"id":"F-8","result":"pass","note":"All changed implementation and test paths belong to runtime, the action item's listed component; no other component's behavior is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files contain no async-root tags or new Promise-returning methods. Encoding and its hooks remain synchronous; the Registry re-export retains the separately shown, approved resolveClassAsync root.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no changed setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 72491f1ab99b4703d995e14a6e779b579aa8cbe7

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:26:27.612Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests (XT-runtime-15, -22, -38) change. With no Upstream assertion to match, the item does not apply. |
| F-2: No expected value is weakened | pass | No Ported Test changes. In the touched Xaravel Tests, XT-runtime-15 now expects jsonEncode({a:[…], b:{}}) to give '"b":[]' instead of '"b":{}'. This is still an exact assertSame. The new value is what PHP's json_encode(['a'=>[…],'b'=>[]]) gives, and an empty plain object is an empty PHP array under AD-9.2, so the expectation was not loosened. The classmap's empty '{}' output is kept by JSON_FORCE_OBJECT in registry/index.ts, which XT-runtime-27's cycleRow still asserts. XT-runtime-22 keeps its marked-float pass unchanged and only adds a plain-float pass; nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. In the Xaravel Tests no assertion is removed: XT-runtime-22's original checks run inside the new two-pass loop. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip and adds no Skip Reason. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) confirms no added line carries an adapted:DIV marker or a DIV clause, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned committed Oracle request, no error fixture, and no changed fixture. XT-runtime-22 still reads the existing non-error 9.6 fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-38: the body checks each claim in its consequence string. Plain objects are read through arrayEntries with integer-like keys normalised: {'0':'a','1':'b'} gives ["a","b"]; '01' and '-0' stay string keys; a non-list stays an object. The list rule holds for plain objects, PhpArray and Array, and JSON_FORCE_OBJECT still works. Depth handling is covered: truncation (2.5, 0.9), int32 wrap (2^31, 2^31+1, 2^32+1, -2^63), and PHP TypeError for NaN, ±Infinity, 2^63, 1e19 and -9.3e18. The TypeError's class, message and code are checked, and json_last_error() stays JSON_ERROR_SYNTAX. Its citations fit: AD-9.2's list rule and accepted forms, and AD-23.1's jsonEncode with AD-9 list rules. XT-runtime-22 still checks its AD-9/AD-9.6 claims over both decodings. XT-runtime-15's consequence (AD-10.3/10.4) is unchanged, and its body still checks it. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/runtime (jsonEncode.ts, registry/index.ts, runtime tests), the runtime component's own scope. jsonEncode reuses the runtime's own phpType, arrayEntries and PHP TypeError. Nothing stubs, fakes or hard-codes another component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in jsonEncode.ts or registry/index.ts. The new function parseDepth and the changed jsonEncode, encodeValue and classmap-encoder install are all synchronous: they do no IO and take no async callback. The re-exported resolveClassAsync keeps its tag from registry.ts, which ESC-9.4-1 rules true, and this change does not touch it. No method needs a tag and none carries a false one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"72491f1ab99b4703d995e14a6e779b579aa8cbe7","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:26:27.612Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests (XT-runtime-15, -22, -38) change. With no Upstream assertion to match, the item does not apply.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. In the touched Xaravel Tests, XT-runtime-15 now expects jsonEncode({a:[…], b:{}}) to give '\"b\":[]' instead of '\"b\":{}'. This is still an exact assertSame. The new value is what PHP's json_encode(['a'=>[…],'b'=>[]]) gives, and an empty plain object is an empty PHP array under AD-9.2, so the expectation was not loosened. The classmap's empty '{}' output is kept by JSON_FORCE_OBJECT in registry/index.ts, which XT-runtime-27's cycleRow still asserts. XT-runtime-22 keeps its marked-float pass unchanged and only adds a plain-float pass; nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare. In the Xaravel Tests no assertion is removed: XT-runtime-22's original checks run inside the new two-pass loop.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip and adds no Skip Reason.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) confirms no added line carries an adapted:DIV marker or a DIV clause, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned committed Oracle request, no error fixture, and no changed fixture. XT-runtime-22 still reads the existing non-error 9.6 fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-38: the body checks each claim in its consequence string. Plain objects are read through arrayEntries with integer-like keys normalised: {'0':'a','1':'b'} gives [\"a\",\"b\"]; '01' and '-0' stay string keys; a non-list stays an object. The list rule holds for plain objects, PhpArray and Array, and JSON_FORCE_OBJECT still works. Depth handling is covered: truncation (2.5, 0.9), int32 wrap (2^31, 2^31+1, 2^32+1, -2^63), and PHP TypeError for NaN, ±Infinity, 2^63, 1e19 and -9.3e18. The TypeError's class, message and code are checked, and json_last_error() stays JSON_ERROR_SYNTAX. Its citations fit: AD-9.2's list rule and accepted forms, and AD-23.1's jsonEncode with AD-9 list rules. XT-runtime-22 still checks its AD-9/AD-9.6 claims over both decodings. XT-runtime-15's consequence (AD-10.3/10.4) is unchanged, and its body still checks it.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/runtime (jsonEncode.ts, registry/index.ts, runtime tests), the runtime component's own scope. jsonEncode reuses the runtime's own phpType, arrayEntries and PHP TypeError. Nothing stubs, fakes or hard-codes another component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in jsonEncode.ts or registry/index.ts. The new function parseDepth and the changed jsonEncode, encodeValue and classmap-encoder install are all synchronous: they do no IO and take no async callback. The re-exported resolveClassAsync keeps its tag from registry.ts, which ESC-9.4-1 rules true, and this change does not touch it. No method needs a tag and none carries a false one.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree a9edbd335351903d89f330d62909609c9f865866

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:29:40.078Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the action assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Changed assertions remain exact. XT-runtime-15's empty-array expectation follows the supplied value model; XT-runtime-22 retains its Oracle comparisons in both passes. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The supplied test bodies support the local JSON and registry consequences, but XT-runtime-22's claimed input coverage still cannot be confirmed without its request and verified fixture output. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes stay within the listed runtime component; no other component's behaviour is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed encoder is synchronous and needs no tag. The registry re-export preserves resolveClassAsync's documented, approved Registry.resolveClassAsync root. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/semantics.test.ts`: Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1).

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **not fixed**: The prompt supplies XT-runtime-22 and its decoding helpers, but still supplies neither its Oracle request nor verified fixture output. The requested coverage evidence remains missing.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"a9edbd335351903d89f330d62909609c9f865866","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:29:40.078Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the action assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Changed assertions remain exact. XT-runtime-15's empty-array expectation follows the supplied value model; XT-runtime-22 retains its Oracle comparisons in both passes.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this change.","findings":[]},{"id":"F-7","result":"fail","note":"The supplied test bodies support the local JSON and registry consequences, but XT-runtime-22's claimed input coverage still cannot be confirmed without its request and verified fixture output.","findings":[{"path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1)."}]},{"id":"F-8","result":"pass","note":"All changes stay within the listed runtime component; no other component's behaviour is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The changed encoder is synchronous and needs no tag. The registry re-export preserves resolveClassAsync's documented, approved Registry.resolveClassAsync root.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":false,"note":"The prompt supplies XT-runtime-22 and its decoding helpers, but still supplies neither its Oracle request nor verified fixture output. The requested coverage evidence remains missing."}]}
```

### Reviewer 2: reject at tree a9edbd335351903d89f330d62909609c9f865866

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:29:40.078Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the change adds or modifies only Xaravel Tests. |
| F-2: No expected value is weakened | pass | No Ported Test is changed. The one expected value changed in an Xaravel Test (XT-runtime-15: '"b":{}' to '"b":[]') moves to PHP's json_encode output for an empty array, and the comment cites PHP 8.5.11. It is not a looser comparison. The empty classmap stays '{}' through JSON_FORCE_OBJECT, which XT-runtime-27's cycleRow still asserts. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. Restructuring XT-runtime-22 into two passes keeps every assertion and adds the plain pass. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-38's body checks each claim in its consequence: phpType/arrayEntries classification, integer-like keys and the list rule, JSON_FORCE_OBJECT, depth truncation and int32 wrap, and the TypeError leaving jsonLastError untouched; AD-9.2 and AD-23.1 fit. XT-runtime-27's added cycleRow lines are within its load-safety claim. XT-runtime-22 cannot be confirmed: the 9.6.jsonl request and its fixture output are still missing from the prompt, so the reject finding P-1 stands. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed source file is in packages/runtime (jsonEncode.ts, registry/index.ts, docs). There is no stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): jsonEncode.ts and registry/index.ts hold no @​asyncRoot tags. jsonEncode and parseDepth are sync and perform no IO, and there is no new async export. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changed. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/semantics.test.ts`: P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, "1e3", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **not fixed**: This tree changes semantics.test.ts again, but the prompt still has neither the XT-runtime-22 request from conformance/oracle-requests/9.6.jsonl nor its fixture output. Evidence (c) lists no present, verified fixture for an assigned request, so declared coverage across both decoding passes still cannot be confirmed.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a9edbd335351903d89f330d62909609c9f865866","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:29:40.078Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the change adds or modifies only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is changed. The one expected value changed in an Xaravel Test (XT-runtime-15: '\"b\":{}' to '\"b\":[]') moves to PHP's json_encode output for an empty array, and the comment cites PHP 8.5.11. It is not a looser comparison. The empty classmap stays '{}' through JSON_FORCE_OBJECT, which XT-runtime-27's cycleRow still asserts.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. Restructuring XT-runtime-22 into two passes keeps every assertion and adds the plain pass.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed fixture is an error.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-38's body checks each claim in its consequence: phpType/arrayEntries classification, integer-like keys and the list rule, JSON_FORCE_OBJECT, depth truncation and int32 wrap, and the TypeError leaving jsonLastError untouched; AD-9.2 and AD-23.1 fit. XT-runtime-27's added cycleRow lines are within its load-safety claim. XT-runtime-22 cannot be confirmed: the 9.6.jsonl request and its fixture output are still missing from the prompt, so the reject finding P-1 stands.","findings":[{"path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, \"1e3\", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices."}]},{"id":"F-8","result":"pass","note":"Every changed source file is in packages/runtime (jsonEncode.ts, registry/index.ts, docs). There is no stub or fake of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): jsonEncode.ts and registry/index.ts hold no @asyncRoot tags. jsonEncode and parseDepth are sync and perform no IO, and there is no new async export.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":false,"note":"This tree changes semantics.test.ts again, but the prompt still has neither the XT-runtime-22 request from conformance/oracle-requests/9.6.jsonl nor its fixture output. Evidence (c) lists no present, verified fixture for an assigned request, so declared coverage across both decoding passes still cannot be confirmed."}]}
```

### Reviewer 1: reject at tree 9b09af31312812364ee47f5b6294f7757f4c8a06

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:32:49.633Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Comparisons remain exact. The registry test's empty plain-object expectation changes to [] consistently with the supplied PHP array model; the semantics matrices retain their expected values in both passes. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle fixture with a non-null output.error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new operand assertions establish XT-runtime-22's declared coverage in both passes, but the request and verified fixture output explicitly required by P-1, P-2 and P-4 remain absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes fall within the runtime component; classification, depth parsing and classmap encoding introduce no other component's implementation. |
| F-9: Every `@asyncRoot` tag is true | pass | jsonEncode and its helpers are synchronous and need no tags. The registry re-export resolves to resolveClassAsync's supplied, tagged module-loading root, authorized by ESC-9.4-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/semantics.test.ts`: Supply XT-runtime-22's setup and exprs from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. The added coverage assertions address P-3's alternative, but do not supply the request and fixture evidence required by P-1, P-2 and P-4.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1). **not fixed**: Coverage assertions were added, but the requested XT-runtime-22 request and verified fixture output are not supplied.
- **P-2** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **not fixed**: Neither XT-runtime-22's request nor its verified fixture output appears in the supplied material.
- **P-3** (reviewer 2, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, "1e3", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices. **fixed**: The test now asserts the declared operand categories and explicitly confirms plain non-integral, negative-zero, INF and NAN floats before comparing both passes against the Oracle matrices.
- **P-4** (reviewer 2, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **not fixed**: The added operand checks do not supply the request and verified fixture output this finding explicitly requires.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"9b09af31312812364ee47f5b6294f7757f4c8a06","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:32:49.633Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Comparisons remain exact. The registry test's empty plain-object expectation changes to [] consistently with the supplied PHP array model; the semantics matrices retain their expected values in both passes.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle fixture with a non-null output.error.","findings":[]},{"id":"F-7","result":"fail","note":"The new operand assertions establish XT-runtime-22's declared coverage in both passes, but the request and verified fixture output explicitly required by P-1, P-2 and P-4 remain absent.","findings":[{"path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply XT-runtime-22's setup and exprs from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. The added coverage assertions address P-3's alternative, but do not supply the request and fixture evidence required by P-1, P-2 and P-4."}]},{"id":"F-8","result":"pass","note":"All changes fall within the runtime component; classification, depth parsing and classmap encoding introduce no other component's implementation.","findings":[]},{"id":"F-9","result":"pass","note":"jsonEncode and its helpers are synchronous and need no tags. The registry re-export resolves to resolveClassAsync's supplied, tagged module-loading root, authorized by ESC-9.4-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1).","fixed":false,"note":"Coverage assertions were added, but the requested XT-runtime-22 request and verified fixture output are not supplied."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":false,"note":"Neither XT-runtime-22's request nor its verified fixture output appears in the supplied material."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, \"1e3\", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices.","fixed":true,"note":"The test now asserts the declared operand categories and explicitly confirms plain non-integral, negative-zero, INF and NAN floats before comparing both passes against the Oracle matrices."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":false,"note":"The added operand checks do not supply the request and verified fixture output this finding explicitly requires."}]}
```

### Reviewer 2: pass at tree 9b09af31312812364ee47f5b6294f7757f4c8a06

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `1291ff3104a3e0b9d792d02adaee09cc556e6f41`, on 2026-10-23T03:32:49.633Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests and runtime source change. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The one changed expected value, in XT-runtime-15 (registry.test.ts), goes from '"b":{}' to '"b":[]'. It is still an exact assertSame. It is a correction: an empty plain object is an empty PHP array under AD-9.2, and PHP's json_encode(['b' => []]) gives []. writeClassmap keeps '{}' through JSON_FORCE_OBJECT, which cycleRow checks. Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker, and no Expectations adapted field changes (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, that the change relies on. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-38: its body checks every claim in its consequence string. Plain-object integer-like keys become int keys and form lists ({"0":"a","1":"b"}, nested, empty, null-prototype). Non-list keys stay strings ('01', '-0', mixed). JSON_FORCE_OBJECT still makes an object. PhpArray and Array keep their rules. On depth, the body checks that a fractional depth truncates (2.5, 0.9), that a depth beyond INT_MAX wraps to int32 (2^31, 2^31+1, 2^32+1, -2^63, the largest double below 2^63), and that a non-finite or out-of-int64 depth throws PHP's TypeError (class, FQCN, message, code 0) with jsonLastError left at JSON_ERROR_SYNTAX. AD-9.2 (the list rule for JSON) and AD-23.1 (the codecs) are the bullets it verifies. XT-runtime-22: each pass now asserts that $w holds 73 operands, including the scalars, PHP_INT_MAX, numeric, whitespace and other strings, "1e3", "INF" and "NAN" strings, empty, PhpArray and plain-object arrays, the 4 objects, and the floats 1.5, -1.5, -0, INF, -INF and NAN. These are plain numbers in the plain pass and marked floats in the marked pass. The ==, <=>, is_numeric, cast and (string) matrices are then compared in each pass. XT-runtime-27's cycleRow addition checks load safety as its consequence states. XT-runtime-15 is unchanged apart from the corrected value above. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed source and test file is under packages/runtime, the item's own component. jsonEncode reuses the runtime's own phpType, arrayEntries and TypeError. No stub, fake or hard-coded return of another component's behaviour is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in jsonEncode.ts or registry/index.ts. jsonEncode and the new parseDepth are synchronous, take no async callback and do no IO, so the absence of tags is correct. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1). **fixed**: XT-runtime-22 now asserts at run time, in both the marked and plain passes, that the signed fixture's $w has 73 operands. These include null, true, false, int 0, PHP_INT_MAX, the numeric, whitespace and other strings, "1e3", INF and NAN, the empty, PhpArray and plain-object arrays, and the 4 trailing objects. The test then compares every matrix over that $w in each pass. This supplies in the test the coverage evidence the finding asked for.
- **P-2** (reviewer 1, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **fixed**: Same evidence as P-1: the operand coverage of both passes is asserted in the test itself, against the verified fixture's operands, before the matrices are compared.
- **P-3** (reviewer 2, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, "1e3", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices. **fixed**: P-3 offered showing the coverage in the test as an alternative, and the test does that. The plain pass asserts that 1.5, -1.5, -0, INF, -INF and NAN are plain numbers (and that some plain float exists), and the marked pass that they are marked floats. Those same w values go through the ==, <=>, is_numeric, cast and string matrices against the Oracle.
- **P-4** (reviewer 2, F-7) `packages/runtime/tests/xaravel/semantics.test.ts`: Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed. **fixed**: Same as P-2: the test now asserts the declared operand categories in both decoding passes, so coverage can be confirmed without the request text.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"9b09af31312812364ee47f5b6294f7757f4c8a06","base":"1291ff3104a3e0b9d792d02adaee09cc556e6f41","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T03:32:49.633Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests and runtime source change.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The one changed expected value, in XT-runtime-15 (registry.test.ts), goes from '\"b\":{}' to '\"b\":[]'. It is still an exact assertSame. It is a correction: an empty plain object is an empty PHP array under AD-9.2, and PHP's json_encode(['b' => []]) gives []. writeClassmap keeps '{}' through JSON_FORCE_OBJECT, which cycleRow checks. Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker, and no Expectations adapted field changes (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, that the change relies on.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-38: its body checks every claim in its consequence string. Plain-object integer-like keys become int keys and form lists ({\"0\":\"a\",\"1\":\"b\"}, nested, empty, null-prototype). Non-list keys stay strings ('01', '-0', mixed). JSON_FORCE_OBJECT still makes an object. PhpArray and Array keep their rules. On depth, the body checks that a fractional depth truncates (2.5, 0.9), that a depth beyond INT_MAX wraps to int32 (2^31, 2^31+1, 2^32+1, -2^63, the largest double below 2^63), and that a non-finite or out-of-int64 depth throws PHP's TypeError (class, FQCN, message, code 0) with jsonLastError left at JSON_ERROR_SYNTAX. AD-9.2 (the list rule for JSON) and AD-23.1 (the codecs) are the bullets it verifies. XT-runtime-22: each pass now asserts that $w holds 73 operands, including the scalars, PHP_INT_MAX, numeric, whitespace and other strings, \"1e3\", \"INF\" and \"NAN\" strings, empty, PhpArray and plain-object arrays, the 4 objects, and the floats 1.5, -1.5, -0, INF, -INF and NAN. These are plain numbers in the plain pass and marked floats in the marked pass. The ==, <=>, is_numeric, cast and (string) matrices are then compared in each pass. XT-runtime-27's cycleRow addition checks load safety as its consequence states. XT-runtime-15 is unchanged apart from the corrected value above.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed source and test file is under packages/runtime, the item's own component. jsonEncode reuses the runtime's own phpType, arrayEntries and TypeError. No stub, fake or hard-coded return of another component's behaviour is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in jsonEncode.ts or registry/index.ts. jsonEncode and the new parseDepth are synchronous, take no async callback and do no IO, so the absence of tags is correct.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply XT-runtime-22's request from conformance/oracle-requests/9.6.jsonl and its verified fixture output, including operands and expected matrices. Neither is supplied, so the declared scalar, string, INF, NAN, array and object coverage in both decoding passes remains unverified (P-1).","fixed":true,"note":"XT-runtime-22 now asserts at run time, in both the marked and plain passes, that the signed fixture's $w has 73 operands. These include null, true, false, int 0, PHP_INT_MAX, the numeric, whitespace and other strings, \"1e3\", INF and NAN, the empty, PhpArray and plain-object arrays, and the 4 trailing objects. The test then compares every matrix over that $w in each pass. This supplies in the test the coverage evidence the finding asked for."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":true,"note":"Same evidence as P-1: the operand coverage of both passes is asserted in the test itself, against the verified fixture's operands, before the matrices are compared."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"P-1 is not fixed. Supply the XT-runtime-22 request (setup and exprs) from conformance/oracle-requests/9.6.jsonl and its verified fixture output, or otherwise show in the test or the review tool that $w holds the declared scalar, numeric-string, whitespace-string, \"1e3\", INF, NAN, array and object operands. The plain pass's non-integral, -0, INF and NAN floats must be confirmed to be compared against the Oracle matrices.","fixed":true,"note":"P-3 offered showing the coverage in the test as an alternative, and the test does that. The plain pass asserts that 1.5, -1.5, -0, INF, -INF and NAN are plain numbers (and that some plain float exists), and the marked pass that they are marked floats. Those same w values go through the ==, <=>, is_numeric, cast and string matrices against the Oracle."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"Supply the XT-runtime-22 request and verified fixture output used from conformance/oracle-requests/9.6.jsonl. The prompt provides neither the operands nor matrices, so coverage of the declared scalar, string, INF, NAN, array and object cases in both decoding passes cannot be confirmed.","fixed":true,"note":"Same as P-2: the test now asserts the declared operand categories in both decoding passes, so coverage can be confirmed without the request text."}]}
```

## Auto Run Result

Status: blocked
Blocking condition: Fidelity Review evidence gap with no route for an action item. Reviewer 1 (codex) rejected trees 72491f1, a9edbd3 and 9b09af3 on F-7: it asks for XT-runtime-22's request (`setup`, `exprs`) from `conformance/oracle-requests/9.6.jsonl` and its verified fixture. Both exist in the repository, but `tools/fidelity-review/fidelity-review.ts` shows neither for an `--item` review: evidence (c) lists only requests a Story manifest assigns, and (h) follows imports, not `readRequests(join(REPO, REQUESTS))`. Reviewer 2 passed tree 9b09af3 once the test asserted the operand coverage itself. Reviewer 1 still asks for the request and the fixture. The 2026-10-21 amendment lets the orchestrator widen evidence only through a Story's Escalation (`planning/esc-<id>`). An action item has no Story id, and `escalations:check` accepts only manifest Test IDs, so the orchestrator has no route to fix the gap. Maintainer decision needed: extend the amendment to action items (show the Oracle requests and fixtures a touched Xaravel Test reads), or rule another route.

- **Implemented:**
  - `jsonEncode` classifies objects through `phpType`.
  - It reads every PHP array through `arrayEntries` and applies the list rule to all three shapes.
  - It parses `depth` as PHP's `Z_PARAM_LONG`, then applies the `(int)` cast.
  - XT-runtime-22 runs its matrices with both plain and marked floats.
- **Files changed:**
  - `packages/runtime/src/php/jsonEncode.ts`: classification, list rule, depth parse, header.
  - `packages/runtime/src/registry/index.ts`: the classmap stays `{}` (`JSON_FORCE_OBJECT`).
  - `packages/runtime/tests/xaravel/json.test.ts`: new XT-runtime-38; a fresh-process load row in XT-runtime-27.
  - `packages/runtime/tests/xaravel/semantics.test.ts`: the plain pass; operand-coverage assertions.
  - `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-15 now expects PHP's `"b":[]`.
  - `packages/runtime/docs/codecs.md`, `packages/runtime/docs/exceptions.md`: docs.
- **Review findings:**
  - Patches applied: 7. Five came from the first pass: key-order note, codecs.md, exceptions.md, boundary rows, load-safety row. Two came from the Fidelity Review: the operand-coverage assertions.
  - Deferred: 3 (jsonDecode depth, flags parse, PORTING.md `{}` guidance).
  - Rejected: as logged in the Review Triage Log.
- **Verification:**
  - `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. Xaravel Tests: 329 passed, 5 skipped. This ran before the last test-only patch; after that patch, `XT-runtime-22` passes alone.
  - `bun run typecheck` and `bun run lint`: exit 0.
  - Every new expected value was checked against local PHP 8.5.11 with `php -r`.
  - XT-runtime-38 fails on the baseline source.
- **Residual risk:** the change cannot merge until `fidelity:review status --item` prints `current`.
