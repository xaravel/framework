---
title: 'Runtime array_column and rawurldecode for illuminate/json-schema'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 286fadc3428dca61eab4d754696818df4891ab26
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/ESC-16.1-2.md
  - decisions/MAINT-2026-10-26-runtime-builtins.md
warnings: []
deferred:
  - summary: >-
      array_column on objects reads public properties only; PHP reads them in the caller's scope and falls back to __isset/__get.
    evidence: |-
      PHP's array_column_fetch_prop uses has_property (EXISTS, then ISSET, which calls __isset) and read_property with the executed scope, so a class method sees its own private/protected properties and an Eloquent Model serves attributes. The runtime cannot see the caller, and AD-26 has no magic outside Model, which does not exist yet. Documented as known limits in packages/runtime/docs/php-functions.md. Needs a ruling (or Model's own protocol) when a port relies on either.
    location: >-
      packages/runtime/src/php/arrayFunctions.ts (publicProps)
    severity: medium
  - summary: >-
      An uninitialized typed property, and every own key of a class without a PHP property table, read as properties.
    evidence: |-
      The PHP property table has no uninitialized form (mangle.ts reads `default ?? null`), and objectProps falls back to own enumerable keys; PHP skips an uninitialized typed property and has visibility. Pre-existing for every objectProps reader (codecs, (array) cast); documented for array_column.
    location: >-
      packages/runtime/src/php/mangle.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `Type::enum` (`framework/src/Illuminate/JsonSchema/Types/Type.php:98`) calls `array_column($values::cases(), 'value')`, and Story 16.2's Deserializer (`Deserializer.php:588`) calls `rawurldecode`; `@xaravel/runtime/php` exports neither, so Story 16.1 is blocked (ESC-16.1-2, approved by the monitor under the runtime-builtins rule; action item `epic-16-item-1-runtime-array-column-rawurldecode`).

**Approach:** Port PHP 8.5.11's `array_column` (`ext/standard/array.c`: `PHP_FUNCTION(array_column)`, `array_column_fetch_prop`, `array_set_zval_key`) and `rawurldecode` (`ext/standard/url.c`: `php_raw_url_decode`) under their PHP names, add them to the PHP function-name registry, export them from `@xaravel/runtime/php` and the root, and check them with a PHP-recorded probe.

## Boundaries & Constraints

**Always:** scope `packages/runtime` and this item's records; coercive parameters as PHP's (`array`, `string|int|null` for `column_key` and `index_key` through `zend_parse_arg_str_or_long_slow`: int first, then string; `string` for `rawurldecode`), with PHP's `TypeError` messages; a row that is neither an array nor an object is skipped; on an array row the key is looked up as `zend_symtable_find` does (`"1"` finds int key 1); on an object row only its public properties count (its class's PHP property table and dynamic properties, as `objectProps` reads them, mangled names excluded; an AD-26 enum case's `value`), so a method is never a column; `null` `column_key` takes the whole row; an index value becomes a key as `normalizeKey` makes it (null `""`, bool 0/1, float truncated) and a key no array takes throws PHP's `TypeError` `Cannot access offset of type <type> on array`; a row without the index gets the next int key; `rawurldecode` decodes `%XX` (either hex case) and leaves `+`, a lone `%` and a bad sequence as they are; a decoded result that is not valid UTF-8 throws the DIV-9.18 JS `TypeError` through `decodeResult`; `undefined` reads as null (AD-9).

**Never:** an edit outside `packages/runtime/**` and this item's records; a DIV, PORTING.md, grader or Expectations change; `get_object_vars`, `get_class` or any other new builtin; `__get` / `__isset` magic (AD-26: none outside `Model`); a change to any existing export's behaviour; weakening or removing an existing assertion (the registry count in `php-set-functions.test.ts` goes from 134 to 136 for the two new entries).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| column of arrays | `[['id'=>3,'n'=>'a'],['id'=>5,'n'=>'b'],['x'=>1]]`, `'n'` | `['a','b']` | none |
| column with index | same, `'n'`, `'id'` | `[3=>'a',5=>'b']`; row without index appended | none |
| whole rows | `null` column, `'id'` index | rows keyed by id | none |
| int / numeric-string column | `[[10,20],[30]]`, `1` and `'1'` | `[20]` | none |
| objects | public props, protected/private, dynamic, method name | public and dynamic only | none |
| enum cases | `Suit::cases()`, `'value'` / `'name'` | backing values / names | none |
| index keys | null, bool, float, numeric string, array index value | `""`, 0/1, truncated, int; array throws | PHP `TypeError` |
| bad arguments | non-array input, array column_key, objects w/o `__toString` | PHP's messages | PHP `TypeError` |
| rawurldecode | `a%20b+c`, `%e2%82%AC`, `%`, `%zz`, `100%`, `%41%4` | `a b+c`, `€`, unchanged rest | none |
| rawurldecode bytes | `%FF` | DIV-9.18 `TypeError` | JS `TypeError` |
| coercion | `rawurldecode(12)`, `(true)`, `([])` | `"12"`, `"1"`, PHP `TypeError` | PHP `TypeError` |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayFunctions.ts` -- array functions; header comment lists each item's additions (append `array_column`, ESC-16.1-2). Reuse `arrayParameter` (`phpArguments.ts:141`), `arrayEntries`, `objectProps` (`mangle.ts:148`; public = no leading `\0`), `normalizeKey` / `PhpArray` / `arrayFromEntries` (`PhpArray.ts:66,262`), `phpType`, `valueCopy`; `array_flip` (line ~649) is the build pattern.
- `packages/runtime/src/php/phpArguments.ts` -- add an internal `nullableStringOrIntParameter` (type name `string|int|null`) beside `numberOrStringParameter` (line 114): null stays null, int/bool/float by `toIntArgument` (`zend_parse_arg_long_weak`: a fractional float truncates; a NaN or out-of-range float is not an int, so it is tried as a string), else `toStringArgument`.
- `packages/runtime/src/php/stringFunctions.ts` -- string functions; header lists items; add `rawurldecode` with `stringParameter`, `wellFormed`, `utf8.encode`, `decodeResult` (line 38).
- `packages/runtime/src/php/phpFunctions.ts:131` -- add `entry("array_column", array_column, 2, 3)` and `entry("rawurldecode", rawurldecode, 1, 1)` and imports.
- `packages/runtime/src/php/index.ts:51` and `packages/runtime/src/index.ts:64` -- export both.
- `packages/runtime/docs/php-functions.md:207` -- document `array_column` after `array_reduce`; document `rawurldecode` with the string functions.
- `packages/runtime/tests/xaravel/php-reduce-empty-iterator.{probe.php,probe.txt,test.ts}` -- probe pattern to copy (`out`, `attempt`, `assertProbeLabels`, every label computed).
- `packages/runtime/tests/xaravel/php-set-functions.test.ts:692-694` -- registry count comment and 134 → 136.
- Last test ID: XT-runtime-148.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/phpArguments.ts` -- `nullableStringOrIntParameter`.
- `packages/runtime/src/php/arrayFunctions.ts` -- `array_column(array, column_key, index_key = null)`.
- `packages/runtime/src/php/stringFunctions.ts` -- `rawurldecode(string)`.
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts` -- registry entries and exports.
- `packages/runtime/tests/xaravel/php-array-column-rawurldecode.probe.php` / `.probe.txt` / `.test.ts` -- XT-runtime-149 (`array_column`: every matrix row, enum fixture as AD-26 class), XT-runtime-150 (`rawurldecode`), XT-runtime-151 (registry counts via `ReflectionFunction`-style required/total, `ArgumentCountError`s, `function_exists`, root/subpath identity); Xaravel-only: `undefined` as null, DIV-9.18 `TypeError` for `%FF`.
- `packages/runtime/tests/xaravel/php-set-functions.test.ts` -- count 136 and comment.
- `packages/runtime/docs/php-functions.md` -- both functions.

**Acceptance Criteria:**
- Given the recorded probe, when XT-runtime-149..151 run, then every label equals PHP 8.5.11's value.
- Given `TypeTest`'s enum rows, when `array_column(Suit.cases(), 'value')` runs on an AD-26 backed enum, then it gives the backing values in case order.
- Given `bun run registration:check`, `bun run harness`, `bun run typecheck` and `bun run lint`, when run on the change, then each reports no violation or difference.

## Verification

**Commands:**
- `php -d error_reporting=0 php-array-column-rawurldecode.probe.php > php-array-column-rawurldecode.probe.txt` (in `packages/runtime/tests/xaravel`, a new file) -- expected: the record
- `bun test packages/runtime/tests/xaravel/php-array-column-rawurldecode.test.ts packages/runtime/tests/xaravel/php-set-functions.test.ts` -- expected: pass
- `bun run harness`, `bun run harness --xaravel`, `bun run typecheck`, `bun run lint`, `bun run registration:check` -- expected: clean

## Spec Change Log

- Implementation: `php-set-functions.probe.php`'s `$registry` and `$exports` name lists gained `array_column` and
  `rawurldecode` and `php-set-functions.probe.txt` was regenerated with PHP 8.5.11, as earlier runtime items did; the
  record only gains lines (XT-runtime-84/85 compare every registry entry against it).

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 26 findings — high 0, medium 3, low 12, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The contract-token branches (an index value, a `column_key`, an `index_key`) are untested. — XT-runtime-149 gained Xaravel-only assertions with a `registerContractToken` token, each compared with the plain-FQCN call.
  - `[low]` `[reject]` (verification-gap other) `nullableStringOrIntParameter`'s `typeof php === "function"` guard repeats `toStringArgument`'s. — No behaviour change; it mirrors `numberOrStringParameter`'s object branch.
  - `[false]` `[reject]` (intent 3a) The enum consumer is shown on a test-local AD-26 enum, not TypeTest's. — The item is scoped to `packages/runtime`; the local `Suit` has the AD-26 shape TypeTest's ported enums will have, and Story 16.1 runs the consumer.
  - `[low]` `[defer]` (intent 3b) A class without a PHP property table counts every own enumerable key as public. — Same rule as `objectProps` for the codecs (one reader, not a second); documented as a known limit. Grouped with blind 3.
  - `[false]` `[reject]` (intent 3c) `rawurldecode`'s Deserializer consumer is untested. — Story 16.2 ports it; this item's scope is the runtime.
  - `[low]` `[reject]` (intent 3d) `php-set-functions.probe.txt` was regenerated by a redirect. — It is the file's documented regeneration command (as #585/#586 did); its content only gains lines (F-2 pass by both Fidelity reviewers).
  - `[false]` `[reject]` (intent 3d) The required checks are not shown. — Run here: harness `differ=0`, typecheck, lint and registration check clean (Auto Run Result).
  - `[medium]` `[defer]` (blind 1) Eloquent Model rows: PHP falls back to `__isset`/`__get`, the port reads public properties only. — The item's action scopes the read to "objects (public properties)" and AD-26 has no magic outside `Model`, which does not exist yet; documented as a known limit; deferred to the Model epic.
  - `[low]` `[defer]` (blind 2) An uninitialized typed property reads as null instead of being skipped. — Pre-existing: the PHP property table has no uninitialized form (`mangle.ts` `default ?? null`), for every reader; documented.
  - `[low]` `[defer]` (blind 3) A table-less class exposes TS private fields. — Grouped with intent 3b.
  - `[low]` `[reject]` (blind 4) Each array-row lookup builds every entry. — Rows are small records; a keyed fast path per array form adds branches for no measured cost.
  - `[low]` `[reject]` (blind 5) Object properties rebuilt per lookup. — Same; at most two maps per row.
  - `[false]` `[reject]` (blind 6) NaN/INF/out-of-range float index values are unrecorded. — The edge-case layer ran them against PHP 8.5.11: the same keys (0, 0, 5076964154930102272).
  - `[medium]` `[patch]` (blind 7) Contract tokens untested. — Grouped with the verification-gap finding; same fix. Out-of-int64 bigints: see edge 5.
  - `[low]` `[patch]` (blind 8) `rawurldecode`'s lone-surrogate `TypeError` has no assertion. — Added to XT-runtime-150.
  - `[low]` `[reject]` (blind 9) `decodeResult`'s "splits a UTF-8 sequence" wording is loose for `%FF`. — Shared message of every byte-string function (DIV-9.18); changing it changes other functions' behaviour, which the item excludes.
  - `[low]` `[patch]` (blind 10) Docs incomplete (offset error types, `rawurldecode` coercion and counts). — Added.
  - `[low]` `[patch]` (blind 11) Header comment past the wrap width; `rawurldecode` import out of order. — Reflowed and moved. Stale Code Map lines and spec status: rejected (spec edits); sprint status: the orchestrator's bookkeeping.
  - `[low]` `[patch]` (blind 12) Closure keys and float coercions of `rawurldecode` unprobed. — Added to `column.bad` and `rawurldecode.coercion`, recorded with PHP 8.5.11; the runtime already matched.
  - `[low]` `[patch]` (edge 1) An index of `PHP_INT_MAX` then a row with no index throws; PHP drops the row. — `array_column` skips it; probe row added to `column.keys`.
  - `[medium]` `[defer]` (edge 2) PHP reads object properties in the caller's scope, so a class method sees its own private and protected properties. — The runtime cannot see the caller; the item's action scopes it to public properties. Documented as a known limit; deferred for a ruling if a port needs it.
  - `[low]` `[defer]` (edge 3) Uninitialized typed property. — Same as blind 2.
  - `[medium]` `[defer]` (edge 4) Model magic. — Same as blind 1.
  - `[low]` `[reject]` (edge 5) An out-of-int64 bigint `column_key` returns `[]`. — PHP has no such value; only a JS caller can build one, and a guard adds a branch.
  - `[false]` `[reject]` (edge 6, claim) Spec parity for the next int key. — Same defect as edge 1, patched.
  - `[false]` `[reject]` (edge 7, claim) Spec "public properties" as PHP's behaviour. — Same as edge 2; the intent itself says public properties.
  - Fidelity Review: 0 findings (two passes at tree 48ac80cc).

### 2026-10-30 — Review pass (Finalize re-check, Fidelity Review on tree a16c6c94)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0

## Fidelity Review

### Reviewer 1: pass at tree 48ac80cc3a9ef70f70fce4084f4963797aca569f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `286fadc3428dca61eab4d754696818df4891ab26`, on 2026-10-31T05:27:25.653Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed expectations and probe outputs with the supplied PHP evidence. Comparisons remain exact; the registry count increases from 134 to 136 for the two added functions, without weakening existing expectations. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted assertion markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture; the PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-149 through 151 and the affected XT-runtime-83 through 85 with their bodies and helpers. Exact probe comparisons cover the declared behavior, errors and registry metadata; direct assertions cover copying and export identity. No numbered consequence token is misattributed. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime scope and ESC-16.1-2. Changes remain within packages/runtime and introduce no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The added functions are synchronous transformations, require no async-root tag, and the touched files retain no such tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"48ac80cc3a9ef70f70fce4084f4963797aca569f","base":"286fadc3428dca61eab4d754696818df4891ab26","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T05:27:25.653Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations and probe outputs with the supplied PHP evidence. Comparisons remain exact; the registry count increases from 134 to 136 for the two added functions, without weakening existing expectations.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted assertion markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture; the PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-149 through 151 and the affected XT-runtime-83 through 85 with their bodies and helpers. Exact probe comparisons cover the declared behavior, errors and registry metadata; direct assertions cover copying and export identity. No numbered consequence token is misattributed.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime scope and ESC-16.1-2. Changes remain within packages/runtime and introduce no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The added functions are synchronous transformations, require no async-root tag, and the touched files retain no such tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 48ac80cc3a9ef70f70fce4084f4963797aca569f

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `286fadc3428dca61eab4d754696818df4891ab26`, on 2026-10-31T05:27:25.653Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests (XT-runtime-149..151, 84) and runtime source change. |
| F-2: No expected value is weakened | pass | The only change to an existing expected value is XT-runtime-84's registry count 134→136, which matches exactly the two new registry entries (array_column, rawurldecode). The php-set-functions.probe.txt rows that changed add only the array_column/rawurldecode entries, consistent with the probe.php registry/exports lists. No comparison is loosened. The new tests compare exact JSON strings with the recorded PHP 8.5.11 output. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion is removed from php-set-functions.test.ts (only the count literal and its comment change). The new test file only adds assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added. The DIV-9.18 references are prose comments on Xaravel-only assertions in an Xaravel Test, not adaptation markers on a Ported Test. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no Oracle fixture, error or otherwise, for this item; its tests rely on a PHP probe record instead of Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-149 runs every array_column probe label (column, whole, int, scalars, objects, enums, keys, bad) against PHP's recorded output, covering every clause of its description. Spot checks against the implementation agree with the record: an index colliding with an appended key overwrites it; float, NaN and INF keys; mangled names filtered; enum name and backed value; offset TypeErrors via normalizeKey. XT-runtime-150 covers decoding, '+', lone/partial '%', coercion and the TypeError cases. XT-runtime-151 checks ReflectionFunction counts, ArgumentCountErrors, function_exists, root/subpath identity and the registry fn. AD-26 is cited bare, as the enum construct, not as a bullet token. No FR/AD .k token is misattributed. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime, the item's own component, and implement PHP builtins as ESC-16.1-2 approves. No stub or fake of another Component; get_object_vars and get_class are not added, as the item excludes them. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed source file. The new exports array_column, rawurldecode and nullableStringOrIntParameter are synchronous, do no IO and take no async callback, so they need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"48ac80cc3a9ef70f70fce4084f4963797aca569f","base":"286fadc3428dca61eab4d754696818df4891ab26","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T05:27:25.653Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests (XT-runtime-149..151, 84) and runtime source change.","findings":[]},{"id":"F-2","result":"pass","note":"The only change to an existing expected value is XT-runtime-84's registry count 134→136, which matches exactly the two new registry entries (array_column, rawurldecode). The php-set-functions.probe.txt rows that changed add only the array_column/rawurldecode entries, consistent with the probe.php registry/exports lists. No comparison is loosened. The new tests compare exact JSON strings with the recorded PHP 8.5.11 output.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion is removed from php-set-functions.test.ts (only the count literal and its comment change). The new test file only adds assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added. The DIV-9.18 references are prose comments on Xaravel-only assertions in an Xaravel Test, not adaptation markers on a Ported Test.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no Oracle fixture, error or otherwise, for this item; its tests rely on a PHP probe record instead of Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-149 runs every array_column probe label (column, whole, int, scalars, objects, enums, keys, bad) against PHP's recorded output, covering every clause of its description. Spot checks against the implementation agree with the record: an index colliding with an appended key overwrites it; float, NaN and INF keys; mangled names filtered; enum name and backed value; offset TypeErrors via normalizeKey. XT-runtime-150 covers decoding, `+`, lone/partial `%`, coercion and the TypeError cases. XT-runtime-151 checks ReflectionFunction counts, ArgumentCountErrors, function_exists, root/subpath identity and the registry fn. AD-26 is cited bare, as the enum construct, not as a bullet token. No FR/AD .k token is misattributed.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime, the item's own component, and implement PHP builtins as ESC-16.1-2 approves. No stub or fake of another Component; get_object_vars and get_class are not added, as the item excludes them.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed source file. The new exports array_column, rawurldecode and nullableStringOrIntParameter are synchronous, do no IO and take no async callback, so they need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree a16c6c949982527148ae54b130c98bb8f4fff7c6

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `286fadc3428dca61eab4d754696818df4891ab26`, on 2026-10-31T05:40:30.208Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | Compared changed expectations and probe outputs with the supplied PHP evidence. Comparisons remain exact; the registry count increases from 134 to 136 for the two added functions, with existing entries retained. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines are set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted assertion markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests with their consequences, helpers, PHP probe inputs and recorded outputs. The tests check column extraction, object and enum properties, key coercion, decoding, exact errors, registry metadata and export identity as declared. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all scoped changes with the runtime action item and ESC-16.1-2. Changes stay within packages/runtime and implement the approved runtime builtins; test fixtures do not implement another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The new functions perform synchronous computation, accept no async callbacks and require no asyncRoot tags; touched files retain no such tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a16c6c949982527148ae54b130c98bb8f4fff7c6","base":"286fadc3428dca61eab4d754696818df4891ab26","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T05:40:30.208Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations and probe outputs with the supplied PHP evidence. Comparisons remain exact; the registry count increases from 134 to 136 for the two added functions, with existing entries retained.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines are set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted assertion markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests with their consequences, helpers, PHP probe inputs and recorded outputs. The tests check column extraction, object and enum properties, key coercion, decoding, exact errors, registry metadata and export identity as declared.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all scoped changes with the runtime action item and ESC-16.1-2. Changes stay within packages/runtime and implement the approved runtime builtins; test fixtures do not implement another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The new functions perform synchronous computation, accept no async callbacks and require no asyncRoot tags; touched files retain no such tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree a16c6c949982527148ae54b130c98bb8f4fff7c6

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `286fadc3428dca61eab4d754696818df4891ab26`, on 2026-10-31T05:40:30.208Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and touches no Ported Test; only Xaravel Tests under packages/runtime/tests/xaravel/ change. |
| F-2: No expected value is weakened | pass | Compared the changed lines of php-set-functions.test.ts and its probe files. The registry count goes from 134 to 136, and resolver.reflection, resolver.counts and resolver.exports gain the array_column and rawurldecode rows; every other recorded value is unchanged. The new XT-runtime-149..151 tests use exact assertSame comparisons against the recorded PHP JSON. No expected value is loosened or bent to match the runtime. |
| F-3: No assertion is removed without a DIV clause | pass | The diff removes no assertion from any test. php-set-functions.test.ts changes only a comment and the registry-count value. The new test file only adds assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added. The DIV-9.18 citations are in comments on Xaravel-only assertions, not adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, for any assigned Oracle request; the tests rely on host PHP probe output, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-149's consequence is covered clause by clause: numeric-string key (column.int '1'), whole rows (column.whole), public and dynamic props only, never a protected/private property or a method (column.objects secret/hidden/title/extra), AD-26 enum name and backed value (column.enums), index key coercions and next-int append (column.keys), scalar rows skipped (column.scalars), TypeErrors (column.bad, column.keys). Each label is compared with the recorded PHP JSON. The bare AD-26 citation names the enum construct row the test exercises, and no FR/AD-<n>.<k> token is cited. XT-runtime-150 covers %XX either case, + kept, lone or malformed % kept, string-parameter coercion and TypeErrors. XT-runtime-151 checks the ReflectionFunction counts, ArgumentCountErrors, function_exists, and export identity between the root, @​xaravel/runtime/php and the registry. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime (src, docs, tests), the scope of the listed runtime component, and there are no stale_tests. The change adds real PHP builtins, as ESC-16.1-2 approves. It adds no stub, fake or hard-coded behaviour for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed src file. The new exports (array_column, rawurldecode, nullableStringOrIntParameter, and the internal publicProps and columnValue) are synchronous, do no IO and take no callback, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a16c6c949982527148ae54b130c98bb8f4fff7c6","base":"286fadc3428dca61eab4d754696818df4891ab26","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T05:40:30.208Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and touches no Ported Test; only Xaravel Tests under packages/runtime/tests/xaravel/ change.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed lines of php-set-functions.test.ts and its probe files. The registry count goes from 134 to 136, and resolver.reflection, resolver.counts and resolver.exports gain the array_column and rawurldecode rows; every other recorded value is unchanged. The new XT-runtime-149..151 tests use exact assertSame comparisons against the recorded PHP JSON. No expected value is loosened or bent to match the runtime.","findings":[]},{"id":"F-3","result":"pass","note":"The diff removes no assertion from any test. php-set-functions.test.ts changes only a comment and the registry-count value. The new test file only adds assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added. The DIV-9.18 citations are in comments on Xaravel-only assertions, not adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, for any assigned Oracle request; the tests rely on host PHP probe output, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-149's consequence is covered clause by clause: numeric-string key (column.int '1'), whole rows (column.whole), public and dynamic props only, never a protected/private property or a method (column.objects secret/hidden/title/extra), AD-26 enum name and backed value (column.enums), index key coercions and next-int append (column.keys), scalar rows skipped (column.scalars), TypeErrors (column.bad, column.keys). Each label is compared with the recorded PHP JSON. The bare AD-26 citation names the enum construct row the test exercises, and no FR/AD-<n>.<k> token is cited. XT-runtime-150 covers %XX either case, + kept, lone or malformed % kept, string-parameter coercion and TypeErrors. XT-runtime-151 checks the ReflectionFunction counts, ArgumentCountErrors, function_exists, and export identity between the root, @xaravel/runtime/php and the registry.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime (src, docs, tests), the scope of the listed runtime component, and there are no stale_tests. The change adds real PHP builtins, as ESC-16.1-2 approves. It adds no stub, fake or hard-coded behaviour for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed src file. The new exports (array_column, rawurldecode, nullableStringOrIntParameter, and the internal publicProps and columnValue) are synchronous, do no IO and take no callback, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

- **Change:** `@xaravel/runtime/php` and the root export PHP 8.5.11's `array_column` (array and object rows, `column_key` / `index_key` forms, PHP's coercion and errors) and `rawurldecode` (DIV-9.18 `TypeError` for a non-UTF-8 result), each a PHP function-name registry entry.
- **Files:** `src/php/arrayFunctions.ts` (`array_column`), `src/php/phpArguments.ts` (`nullableStringOrIntParameter`), `src/php/stringFunctions.ts` (`rawurldecode`), `src/php/phpFunctions.ts` (registry), `src/php/index.ts` and `src/index.ts` (exports), `docs/php-functions.md` (both, with known limits), `tests/xaravel/php-array-column-rawurldecode.{probe.php,probe.txt,test.ts}` (XT-runtime-149..151), `tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` (registry lists and count 134 → 136), all under `packages/runtime`.
- **Review:** 26 findings; 7 patched entries (3 medium grouped into 1 contract-token entry, plus lone surrogate, docs, formatting, probe coercions, `PHP_INT_MAX` drop); 2 deferred (caller-scope visibility and `__isset`/`__get`; uninitialized/table-less properties); the rest rejected with the reasons in the triage log.
- **Follow-up review recommended:** false (one medium entry patched, no high).
- **Verification:** `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; Xaravel tests 542, 537 passed, 0 failed, 5 skipped; `bun run typecheck`, `bun run lint`, `bun run registration:check` clean; Fidelity Review `current` (two passes at tree a16c6c949982527148ae54b130c98bb8f4fff7c6).
- **Residual risk:** the deferred object-property limits, documented in `php-functions.md`.
