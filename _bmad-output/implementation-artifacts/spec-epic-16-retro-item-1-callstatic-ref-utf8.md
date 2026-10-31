---
title: 'JsonSchema.__callStatic tested against PHP, and the non-UTF-8 $ref documented as DIV-9.18'
type: 'bugfix'
created: '2026-10-31'
status: 'blocked'
baseline_revision: aa07e6a1f4289f81bee74ff3b42e8c77df22335e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - _bmad-output/implementation-artifacts/epic-16-retro-2026-10-31.md
  - decisions/DIV-9.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `JsonSchema.__callStatic` has no test and spreads `args` with an unchecked cast, so a non-array `args` throws a raw JS `Spread syntax requires ...iterable` (retro finding S1). And `docs/json-schema.md:89` says every unsupported schema throws `InvalidArgumentException`, while a `$ref` whose percent-escape decodes to bytes that are not UTF-8 throws DIV-9.18's `TypeError` (finding D1); nothing tests or cites that. Action item `epic-16-retro-item-1-callstatic-and-ref-utf8`.

**Approach:** Port `(new JsonSchemaTypeFactory)->$name(...$arguments)` with the runtime's helpers: an unknown name throws PHP's `Error` through `callMethod` before `args` is read (PHP's order, probed), then `callUnpacked([factory, name], args)` spreads as PHP does (PORTING.md's `$f(...$args)` row). Add two Xaravel Tests backed by PHP 8.5.11 probe records, and correct the docs.

## Boundaries & Constraints

**Always:** scope `packages/json-schema/**` plus this item's records; expected values come from probes run on the host's PHP 8.5.11 against Upstream at the Pin (`conformance/upstream/framework/src/Illuminate/JsonSchema`), recorded in committed `*.probe.txt` with regenerate instructions in the `*.probe.php` header, as `round-trip.errors.probe.php` does; a case that cannot equal PHP asserts the port's `TypeError` and is marked `// adapted:DIV-9.15` (string-keyed spread, untranslatable) or `// adapted:DIV-9.18` (non-UTF-8 bytes), and `docs/json-schema.md`'s Divergences section explains both clauses (XT-json-schema-3 requires every cited clause explained).

**Never:** another component (the runtime is used as is), PORTING.md, a DIV record, Expectations, stories/ manifests; a removed or weakened assertion; a new DIV clause; behaviour changes outside `__callStatic`.

## I/O & Edge-Case Matrix

PHP column is the recorded probe; the port must equal it unless marked.

| Scenario | `__callStatic(name, args)` | PHP 8.5.11 | Port |
|----------|--------------|---------------------------|----------------|
| each builder | `object [[props]]`, `object []`, `anyOf [[s1,s2]]`, `integer []`, `number []`, `string []`, `boolean []`, `array []`, `union [["string","null"]]` | that Type, `toArray()` as the static method's | equal, and equal to `JsonSchema.<name>(...args)` |
| case-insensitive | `String []` | StringType | equal |
| extra positional | `integer [1,2]` | IntegerType | equal |
| int-keyed non-list | `string` with `[1 => 'x']` (a `PhpArray`) | StringType | equal |
| static on factory | `fromArray [[type: string]]` | StringType | equal |
| unknown name | `foo []`, `toArray []`, `"" []`, `foo 1` | `Error: Call to undefined method Illuminate\JsonSchema\JsonSchemaTypeFactory::<name>()` (before unpacking) | equal class and message |
| non-array args | `string 1`, `string null`, `string "x"` | `TypeError: Only arrays and Traversables can be unpacked, <type> given` | equal |
| string-keyed args | `string {a:1}`; `object {properties: {...}}` | `Error: Unknown named parameter $a`; ObjectType | `TypeError` naming ESC-14.5-3 untranslatable (DIV-9.15), marked |
| $ref non-UTF-8 | `fromArray({"$ref":"#/d/a%FF","d":{"a":{"type":"string"}}})` | `InvalidArgumentException: Unable to resolve JSON Schema $ref [#/d/a%FF].` | `TypeError` from `rawurldecode()` naming the UTF-8 limit (DIV-9.18), marked |
| $ref UTF-8 control | `fromArray({"$ref":"#/d/a%C3%A9","d":{"aé":{"type":"string"}}})` | `{"type":"string"}` | equal |

</intent-contract>

## Code Map

- `packages/json-schema/src/JsonSchema.ts:86-89` -- `__callStatic(name, args)`: `callMethod(factory(), name, ...(args as unknown[]))`; replace (imports from `@xaravel/runtime`, which exports `callMethod`, `callUnpacked`, `method_exists`).
- `packages/runtime/src/php/callables.ts:134-170` -- `callUnpacked`: rejects non-array/non-Traversable with PHP's `TypeError`; integer keys positional; string keys throw the ESC-14.5-3 untranslatable `TypeError` for a target without an options form. Read only.
- `packages/runtime/src/php/objectFunctions.ts:264` -- `callMethod`: case-insensitive resolution, statics included, else PHP `Error` `Call to undefined method <class>::<name>()`. Read only.
- `packages/json-schema/src/Deserializer.ts:615` -- `rawurldecode(segment)` throws the DIV-9.18 `TypeError`. Read only.
- `packages/json-schema/docs/json-schema.md:20` (builders and `__callStatic`), `:89` ("Anything else throws `InvalidArgumentException`"), `:111-124` Divergences list.
- `packages/json-schema/tests/xaravel/round-trip.errors.probe.php` -- probe pattern (autoload Upstream, one tab-separated line per label); `round-trip.test.ts` -- XT reading a probe record.
- `packages/config/tests/xaravel/dotenv-utf8.test.ts` -- XT-config-8, the DIV-9.18 `TypeError` + control pattern with `// adapted:DIV-9.18`.
- `packages/json-schema/tests/xaravel/epic-close.test.ts` -- XT-json-schema-3: every DIV clause cited in `src/` or `tests/` must be explained in the docs.
- Last Xaravel Test ID is XT-json-schema-3; new: XT-json-schema-4 (`__callStatic`), XT-json-schema-5 (`$ref` UTF-8).

## Tasks & Acceptance

**Execution:**
- `packages/json-schema/src/JsonSchema.ts` -- `__callStatic`: if `!method_exists(target, name)` return `callMethod(target, name)` (throws PHP's Error); else `callUnpacked([target, name], args)`; docblock cites PHP order and DIV-9.15 -- S1.
- `packages/json-schema/tests/xaravel/call-static.probe.php` + `.probe.txt` -- PHP results per matrix row: `<label>\t<class>\t<json toArray>` or `<label>\t!<class>: <message>`.
- `packages/json-schema/tests/xaravel/call-static.test.ts` -- XT-json-schema-4: per row, the port's result class (`fqcn`) and `toArray()` (or thrown `fqcn` and message) equal the record, and each builder row also equals `JsonSchema.<name>(...args)`; string-keyed rows assert the untranslatable `TypeError`, marked `adapted:DIV-9.15`, beside the record showing PHP's; the record's labels equal the test's both ways.
- `packages/json-schema/tests/xaravel/ref-utf8.probe.php` + `.probe.txt`, `ref-utf8.test.ts` -- XT-json-schema-5: the `%FF` row asserts the `TypeError` and `rawurldecode()`'s message, marked `adapted:DIV-9.18`, beside the record's `InvalidArgumentException`; the `%C3%A9` control equals PHP's bytes.
- `packages/json-schema/docs/json-schema.md` -- line 89 sentence names the DIV-9.18 exception; `__callStatic` paragraph states unknown names and non-array args behave as PHP; Divergences gains DIV-9.15 and DIV-9.18 bullets -- D1.

**Acceptance Criteria:**
- Given the recorded probes, when XT-json-schema-4 and -5 run, then every unmarked row equals PHP's record and every marked row throws the DIV clause's `TypeError`.
- Given the change, when `bun run harness` runs alone, then it reports no differences, and XT-json-schema-1..3 pass unchanged.
- Given `bun run typecheck` and `bun run lint`, then both pass.

## Resume Plan (2026-10-31)

The intent contract is preserved verbatim. `decisions/MAINT-2026-10-31-epic-16-item-1.md` and amended DIV-9.15 now authorize the string-keyed diagnostic assertions. Keep existing exact record comparisons; strengthen the string-keyed PHP record checks to exact values. Add PHP-backed Traversable, mixed-key and numeric-object rows to XT-json-schema-4, and a truncated `%C3` row to XT-json-schema-5. Narrow documentation claims to name resolution and unpacking, without promising builder arity/type validation; describe DIV-9.18 by decoded bytes JS cannot represent rather than one exceptional input. All implementation remains within the original paths and constraints. These cases complete the deferred coverage findings from the previous review. The existing code map, tasks, and acceptance remain applicable.

## Verification

**Commands:**
- `bun run harness --component json-schema` -- expected: no differences.
- `bun run harness` -- expected: SUMMARY with no differences (run alone).
- `bun run typecheck`; `bun run lint` -- expected: exit 0.
- `php -d error_reporting=0 call-static.probe.php | diff - call-static.probe.txt` (and ref-utf8) -- expected: no diff.

## Fidelity Review

### Reviewer 1: pass at tree a12d76e27fcf3df781bb57adf3bfdf2722c1557f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4610aa55535359c19accbb075a6358443052ab3c`, on 2026-10-31T22:08:26.873Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the new tests are Xaravel Tests. |
| F-2: No expected value is weakened | pass | The new tests compare exact recorded classes, serialized values and error messages. Changed error expectations carry DIV-9.15 or DIV-9.18 markers and are supported by those clauses and ESC-14.5-3; no existing assertion is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip line. |
| F-5: Every `adapted` marker matches its clause | pass | The named-argument TypeError adaptations match DIV-9.15 and ESC-14.5-3. The invalid UTF-8 TypeError adaptations match DIV-9.18, with an unchanged valid UTF-8 control. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle error fixture; the PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-json-schema-4 checks the declared builder results, direct-call equivalence, lookup cases and exact errors against the supplied probe record. XT-json-schema-5 checks the exact UTF-8 limit error and valid control. Both verify their record labels in order and cite no FR or AD consequence tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to json-schema. The implementation delegates unpacking and method resolution to existing runtime helpers rather than implementing another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed JsonSchema source contains no async methods or asyncRoot tags. Its synchronous factory resolution, deserialization and callback use require no tag under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a12d76e27fcf3df781bb57adf3bfdf2722c1557f","base":"4610aa55535359c19accbb075a6358443052ab3c","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T22:08:26.873Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the new tests are Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact recorded classes, serialized values and error messages. Changed error expectations carry DIV-9.15 or DIV-9.18 markers and are supported by those clauses and ESC-14.5-3; no existing assertion is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip line.","findings":[]},{"id":"F-5","result":"pass","note":"The named-argument TypeError adaptations match DIV-9.15 and ESC-14.5-3. The invalid UTF-8 TypeError adaptations match DIV-9.18, with an unchanged valid UTF-8 control.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle error fixture; the PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-json-schema-4 checks the declared builder results, direct-call equivalence, lookup cases and exact errors against the supplied probe record. XT-json-schema-5 checks the exact UTF-8 limit error and valid control. Both verify their record labels in order and cite no FR or AD consequence tokens.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to json-schema. The implementation delegates unpacking and method resolution to existing runtime helpers rather than implementing another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed JsonSchema source contains no async methods or asyncRoot tags. Its synchronous factory resolution, deserialization and callback use require no tag under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree a12d76e27fcf3df781bb57adf3bfdf2722c1557f

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4610aa55535359c19accbb075a6358443052ab3c`, on 2026-10-31T22:08:26.873Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test, so it is assigned no Ported Test IDs. Only Xaravel Tests (XT-json-schema-4, XT-json-schema-5) are touched. |
| F-2: No expected value is weakened | fail | Checked each expected value in the two Xaravel Tests against the PHP probe records. XT-json-schema-4 compares every non-string-keyed case exactly (assertSame on class plus json, or on the thrown class and message) with call-static.probe.txt. XT-json-schema-5's TypeError for a $ref escape that is not valid UTF-8 is what DIV-9.18 allows ('asserts the TypeError and is marked with this clause'), and its control is compared exactly. The two string-keyed cases are different: where PHP gives 'Error: Unknown named parameter $a' and an ObjectType, the test asserts the port's own TypeError and message, marked adapted:DIV-9.15. It checks the PHP record only with assertNotEmpty. DIV-9.15 does not permit this change (see F-5). |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed and no Upstream assertion is ported, so there is no assertion count to compare. The action item touches only Xaravel Tests. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line, so no Skip Reason is set. |
| F-5: Every `adapted` marker matches its clause | fail | Read every adapted marker against its clause in decisions/DIV-9.md. The adapted:DIV-9.18 markers in ref-utf8.test.ts on the TypeError class and message assertions match DIV-9.18: PHP's rawurldecode yields bytes that are not valid UTF-8 ('a\xFF'), the runtime throws a TypeError naming the limit, and the clause says a test that depends on this asserts the TypeError and is marked. The adapted:DIV-9.15 markers in call-static.test.ts are on a different construct from the one DIV-9.15 describes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The change relies on no Oracle fixture: none is assigned, changed or an error. The PHP probe records are host-PHP evidence, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-json-schema-4's body checks the record labels against CASES in order both ways. It then compares every non-string-keyed case's class plus toArray, or its thrown class and message, with the record. That covers each builder, the other-case name, extra positionals, the integer-keyed PhpArray that is not a list, fromArray, the unknown names (including foo with args 1, which shows args is not read first) and the non-array args. It also checks each builder case equals JsonSchema.<name>(...args), and that the string-keyed cases throw callUnpacked's TypeError. XT-json-schema-5's body checks the labels both ways, the record's InvalidArgumentException, the port's TypeError and message, and the control's resolution against the record. Neither consequence cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are limited to packages/json-schema (JsonSchema.ts, docs, tests). The runtime exports callUnpacked, method_exists and callMethod are only used, not changed. No stub, fake or hard-coded return of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Per evidence (g), JsonSchema.ts holds no @​asyncRoot tags. All of its methods, including the changed __callStatic, are synchronous and return Type: they make no IO-root call and take no async callback. Under AD-6.2 and DIV-1 none needs a tag, and the package documents an empty async surface. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-2** `packages/json-schema/tests/xaravel/call-static.test.ts`: Lines 104-105 (the STRING_KEYED branch) swap Upstream's recorded result for what Xaravel produces: a TypeError with callUnpacked's untranslatable message instead of 'Error: Unknown named parameter $a' and an ObjectType '{"properties":{"name":{"type":"string"}},"type":"object"}'. The PHP record is only asserted non-empty. The adapted:DIV-9.15 marker does not cover this: DIV-9.15 only lets a Ported Test write '...array_values(a)' for an integer-keyed spread, with expected values unchanged, and says a string-keyed spread 'stays untranslatable'. It does not allow asserting a TypeError in place of PHP's result, as DIV-9.18 does. Either get a clause amended or added through an Escalation that allows this assertion and cite it, or drop these two cases from the asserted set.
- **F-5** `packages/json-schema/tests/xaravel/call-static.test.ts`: The two '// adapted:DIV-9.15' markers sit on assertInstanceOf(TypeError) and assertSame(UNTRANSLATABLE) for a string-keyed spread. DIV-9.15's adaptation is to rewrite a spread of a PhpArray whose keys are not 0..n-1 as '...array_values(a)', with expected values unchanged. For string keys it says only that the spread 'stays untranslatable (ESC-14.2-2)'; it describes no test adaptation that asserts the port's TypeError in place of PHP's result. The marker therefore claims more than the clause describes. ESC-14.2-2, which the clause cites, is not in this prompt, so any broader allowance in it cannot be confirmed either. Cite a clause that explicitly covers asserting this diagnostic (via an Escalation), or remove the cases.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a12d76e27fcf3df781bb57adf3bfdf2722c1557f","base":"4610aa55535359c19accbb075a6358443052ab3c","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T22:08:26.873Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test, so it is assigned no Ported Test IDs. Only Xaravel Tests (XT-json-schema-4, XT-json-schema-5) are touched.","findings":[]},{"id":"F-2","result":"fail","note":"Checked each expected value in the two Xaravel Tests against the PHP probe records. XT-json-schema-4 compares every non-string-keyed case exactly (assertSame on class plus json, or on the thrown class and message) with call-static.probe.txt. XT-json-schema-5's TypeError for a $ref escape that is not valid UTF-8 is what DIV-9.18 allows ('asserts the TypeError and is marked with this clause'), and its control is compared exactly. The two string-keyed cases are different: where PHP gives `Error: Unknown named parameter $a` and an ObjectType, the test asserts the port's own TypeError and message, marked adapted:DIV-9.15. It checks the PHP record only with assertNotEmpty. DIV-9.15 does not permit this change (see F-5).","findings":[{"path":"packages/json-schema/tests/xaravel/call-static.test.ts","detail":"Lines 104-105 (the STRING_KEYED branch) swap Upstream's recorded result for what Xaravel produces: a TypeError with callUnpacked's untranslatable message instead of `Error: Unknown named parameter $a` and an ObjectType `{\"properties\":{\"name\":{\"type\":\"string\"}},\"type\":\"object\"}`. The PHP record is only asserted non-empty. The adapted:DIV-9.15 marker does not cover this: DIV-9.15 only lets a Ported Test write `...array_values(a)` for an integer-keyed spread, with expected values unchanged, and says a string-keyed spread 'stays untranslatable'. It does not allow asserting a TypeError in place of PHP's result, as DIV-9.18 does. Either get a clause amended or added through an Escalation that allows this assertion and cite it, or drop these two cases from the asserted set.","kind":"defect"}]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed and no Upstream assertion is ported, so there is no assertion count to compare. The action item touches only Xaravel Tests.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line, so no Skip Reason is set.","findings":[]},{"id":"F-5","result":"fail","note":"Read every adapted marker against its clause in decisions/DIV-9.md. The adapted:DIV-9.18 markers in ref-utf8.test.ts on the TypeError class and message assertions match DIV-9.18: PHP's rawurldecode yields bytes that are not valid UTF-8 (`a\\xFF`), the runtime throws a TypeError naming the limit, and the clause says a test that depends on this asserts the TypeError and is marked. The adapted:DIV-9.15 markers in call-static.test.ts are on a different construct from the one DIV-9.15 describes.","findings":[{"path":"packages/json-schema/tests/xaravel/call-static.test.ts","detail":"The two `// adapted:DIV-9.15` markers sit on assertInstanceOf(TypeError) and assertSame(UNTRANSLATABLE) for a string-keyed spread. DIV-9.15's adaptation is to rewrite a spread of a PhpArray whose keys are not 0..n-1 as `...array_values(a)`, with expected values unchanged. For string keys it says only that the spread 'stays untranslatable (ESC-14.2-2)'; it describes no test adaptation that asserts the port's TypeError in place of PHP's result. The marker therefore claims more than the clause describes. ESC-14.2-2, which the clause cites, is not in this prompt, so any broader allowance in it cannot be confirmed either. Cite a clause that explicitly covers asserting this diagnostic (via an Escalation), or remove the cases.","kind":"defect"}]},{"id":"F-6","result":"n/a","note":"The change relies on no Oracle fixture: none is assigned, changed or an error. The PHP probe records are host-PHP evidence, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-json-schema-4's body checks the record labels against CASES in order both ways. It then compares every non-string-keyed case's class plus toArray, or its thrown class and message, with the record. That covers each builder, the other-case name, extra positionals, the integer-keyed PhpArray that is not a list, fromArray, the unknown names (including foo with args 1, which shows args is not read first) and the non-array args. It also checks each builder case equals JsonSchema.<name>(...args), and that the string-keyed cases throw callUnpacked's TypeError. XT-json-schema-5's body checks the labels both ways, the record's InvalidArgumentException, the port's TypeError and message, and the control's resolution against the record. Neither consequence cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes are limited to packages/json-schema (JsonSchema.ts, docs, tests). The runtime exports callUnpacked, method_exists and callMethod are only used, not changed. No stub, fake or hard-coded return of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Per evidence (g), JsonSchema.ts holds no @asyncRoot tags. All of its methods, including the changed __callStatic, are synchronous and return Type: they make no IO-root call and take no async callback. Under AD-6.2 and DIV-1 none needs a tag, and the package documents an empty async surface.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Spec Change Log

- 2026-10-31: Resumed after decisions/MAINT-2026-10-31-epic-16-item-1.md amended DIV-9.15; restored the saved attempt and returned to draft to fold in the prior review's deferred cases before re-review.

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 24 findings — high 1, medium 4, low 11, false 4, maybe-false 0 (plus 4 intent-alignment observations counted in the 24)
- findings:
  - `[high]` `[intent_gap]` (fidelity-review F-2, reviewer 2 reject at tree a12d76e27fcf3df781bb57adf3bfdf2722c1557f) the string-keyed rows assert callUnpacked's untranslatable `TypeError` in place of PHP's recorded result (`Error: Unknown named parameter $a`; an ObjectType for `{properties: …}`), and DIV-9.15 allows only `...array_values(a)` in a Ported Test, not asserting a diagnostic — verified against `decisions/DIV-9.md:47` and `decisions/ESC-14.2-2.md`: no DIV clause covers it. The root cause is inside the intent contract (its Always and its string-keyed matrix row prescribe the DIV-9.15 marking). Attempt saved as `retro-16-item-1-callstatic-attempt.patch`; code reverted.
  - `[high]` `[intent_gap]` (fidelity-review F-5) the two `// adapted:DIV-9.15` markers claim more than the clause describes — same root cause as F-2.
  - `[medium]` `[intent_gap]` (blind-hunter) DIV-9.15 applied beyond its clause, and the ESC id cited (ESC-14.5-3) differs from the record's (ESC-14.2-2) — same root cause.
  - `[medium]` `[intent_gap]` (intent-alignment 1) the retro's own S1 reproducer `__callStatic("string", {a: 1})` still does not behave as PHP; the action asks that non-list args behave as PHP — same root cause: a string-keyed spread is PHP's named arguments, which the port cannot bind (ESC-14.5-3), so meeting the action needs a ruling.
  - `[medium]` `[intent_gap]` (intent-alignment 2) whether DIV-9.15 covers runtime source behaviour is open — same root cause.
  - `[medium]` `[intent_gap]` (blind-hunter, edge-case-hunter, verification-gap note) the string-keyed rows only assert the PHP record non-empty — same root cause (the rows exist only because of the marking).
  - `[low]` `[intent_gap]` (edge-case-hunter) string-keyed record content never compared — duplicate of the row above, same root cause.
  - `[medium]` `[intent_gap]` (blind-hunter) wrong arity or argument types (`union []`, `anyOf []`, `object [null]`) throw the port's array_map/array_values/count TypeError where PHP throws ArgumentCountError or a parameter TypeError, while the docs say "It behaves as Laravel's" — verified by running them; the arity gap is pre-existing in every builder, but the attempt's docs sentence overclaims. Moot under the intent gap; the next attempt narrows the docs claim to name resolution and unpacking.
  - `[low]` `[intent_gap]` (edge-case-hunter) `__callStatic('union', [])` gives a different error than ArgumentCountError — same group as the row above.
  - `[low]` `[intent_gap]` (edge-case-hunter) a positional argument of the wrong PHP type gives a different error — same group.
  - `[low]` `[intent_gap]` (edge-case-hunter) `('__callStatic', ['string'])` gives the unpack TypeError, not ArgumentCountError — same group.
  - `[low]` `[intent_gap]` (blind-hunter, edge-case-hunter, intent-alignment 4) no Traversable, mixed-key or `{0: "x"}` row although the docs mention Traversables — real coverage gap; moot under the intent gap, to add in the next attempt.
  - `[low]` `[intent_gap]` (edge-case-hunter) Traversable args have no probe row — duplicate of the row above.
  - `[low]` `[intent_gap]` (blind-hunter) the DIV-9.18 case covers only `%FF`; a truncated `%C3` fits the runtime's message better — moot; next attempt adds it.
  - `[low]` `[intent_gap]` (edge-case-hunter) docs say "except one case", but a lone-surrogate `$ref` and a `%FF` segment before a non-array also throw the TypeError — moot; next attempt words the exception by its cause (a decoded segment JS cannot hold).
  - `[low]` `[intent_gap]` (edge-case-hunter) docs:115 overstates Laravel's throw as unconditional (a PHP array keyed by the byte `a\xFF` resolves) — moot; such a key cannot exist in the port (DIV-9.18).
  - `[low]` `[reject]` (blind-hunter) the probes do not record the PHP version — the existing probes in this package (`round-trip.errors.probe.php`) follow the same convention; not worth a new mechanism here.
  - `[low]` `[reject]` (blind-hunter) the consequence strings cite no consequence id — the earlier retro item XT-runtime-147 passed F-7 citing none; nothing breaks.
  - `[low]` `[reject]` (intent-alignment 5) the docs example uses `#/$defs/a%FF`, the test `#/d/a%FF` — cosmetic; both are local pointers.
  - `[low]` `[reject]` (intent-alignment 3) "equals the static method" is compared through fqcn plus toArray JSON — a reasonable proxy for a value Type; no harm named.
  - `[false]` `[reject]` (blind-hunter) the unknown-name branch relies on `callMethod` throwing — `JsonSchemaTypeFactory` and `JsonSchema` define no `__call`, and `callMethod` throws PHP's Error when `method_exists` is false and there is no `__call` (`objectFunctions.ts:264`); the branch cannot return.
  - `[false]` `[reject]` (blind-hunter) sprint status still `open` — the orchestrator sets the item's status, not the build.
  - `[false]` `[reject]` (blind-hunter) the spec file name differs from the item id — the Fidelity Review takes the spec by `--spec` path and the item by `--item`; nothing looks it up by name.
  - `[false]` `[reject]` (edge-case-hunter) a non-string `name` — the parameter is typed `string` and PHP's `string $name` is the same contract; `callMethod`'s own check is PHP's `Method name must be a string`.

### 2026-10-31 — Resumed review pass
- verdicts: 12 findings — high 1, medium 2, low 9, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: non-list/Traversable/numeric-object rows ignore values — added PHP-backed consuming object(properties) rows; component run passed, 280 checked/differ=0.
  - `[low]` `[patch]` blind-hunter: integer-key insertion order untested — added consuming object row with keys 7 then 2 and distinguishable ignored second value; component run passed.
  - `[high]` `[intent_gap]` blind-hunter: named-before-positional ordering absent — probing reveals a required non-list behavior the unchanged runtime does not provide: PHP gives Unknown named parameter $a, callUnpacked gives Cannot use positional argument after named argument during unpacking. DIV-9.15 permits a TypeError diagnostic, not this different PHP Error. Fix requires packages/runtime outside item scope; parent directs Maintainer waiting under iteration D. Saved resumed attempt and reverted package files.
  - `[low]` `[reject]` blind-hunter: unknown-name argument iteration side effect untested — inert scalar proves precedence, branch demonstrably calls no unpack helper; extra observable iterator machinery is disproportionate.
  - `[low]` `[reject]` blind-hunter: matching invalid-byte key PHP success path untested — bytes cannot be represented by port; existing PHP lookup source establishes documentation, no new consumer failure shown.
  - `[low]` `[reject]` blind-hunter: old Auto Run Result retained — historical record superseded by resumed result below; spec-only finding rejected per workflow.
  - `[medium]` `[patch]` verification-gap: non-list forwarding could silently discard properties — same consuming-row fix as blind-hunter, verified component pass.
  - `[low]` `[reject]` intent-alignment: general semantics tested by sampled cases — matrix and new representation rows exercise scoped behavior; no additional concrete defect beyond ordering above.
  - `[low]` `[reject]` intent-alignment: precedence is not an observation of iteration — carried: branch skips unpacking; observable iterator machinery disproportionate.
  - `[low]` `[reject]` intent-alignment: diff alone cannot prove PHP host provenance — PHP 8.5.11 observed, probes regenerated with no diff during this run.
  - `[low]` `[reject]` intent-alignment: matching invalid-byte keys outside fixtures — carried: unsupported JS byte string; no port-representable success case.
  - `[low]` `[reject]` intent-alignment: diff alone cannot prove commands passed — targeted harness/probes/typecheck/lint results recorded below; full/fidelity not run because scope blocker intervened.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. The action asks that `JsonSchema.__callStatic` with "a non-list args behave as PHP". For a string-keyed `args` (PHP's named arguments; the retro's own reproducer `{a: 1}`), PHP throws `Error: Unknown named parameter $a` or binds the parameter (`{properties: …}` gives an ObjectType). The port cannot bind a JS parameter by name: `callUnpacked` throws its untranslatable `TypeError` (ESC-14.5-3). No DIV clause lets a test assert that diagnostic in place of PHP's result (DIV-9.15 covers only `...array_values(a)` in a Ported Test), so the Fidelity Review rejected (F-2, F-5, reviewer 2, tree a12d76e27fcf3df781bb57adf3bfdf2722c1557f; reviewer 1 passed).

Questions for the Maintainer:
1. May `JsonSchema.__callStatic` keep throwing the untranslatable `TypeError` for a string-keyed `args`, recorded by an amendment to DIV-9.15 (or a new clause) that lets an Xaravel Test assert that diagnostic beside PHP's recorded result? (Recommended: yes, amend DIV-9.15 to cover a runtime call site that spreads a string-keyed array into a target without an options form.)
2. Or should the string-keyed cases stay out of the asserted set, and the docs state the behaviour citing ESC-14.5-3 only?

Summary of the attempt (saved, not applied): `retro-16-item-1-callstatic-attempt.patch` in this directory. It changes `__callStatic` to throw PHP's `Error` for an unknown name before reading `args`, then `callUnpacked([factory, name], args)`. It adds XT-json-schema-4 (22 cases against a PHP 8.5.11 probe) and XT-json-schema-5 (the `%FF` DIV-9.18 `TypeError` beside a `%C3%A9` control), and corrects `docs/json-schema.md:89` with DIV-9.15 and DIV-9.18 bullets. With the patch applied: `bun run harness` (alone) SUMMARY differ=0, `harness --component json-schema` checked=280 differ=0, typecheck and lint exit 0. Everything except the string-keyed rows is uncontested. The next attempt should apply the patch, follow the ruling, and fold in the deferred-by-gap rows above: narrow the docs claim to name resolution and unpacking, add a Traversable row and a `%C3` row, and word the DIV-9.18 exception by its cause.

Files changed in this run: this spec, and the saved patch. The code was reverted.
Follow-up review recommendation: false (no patch applied).
Residual risk: none on `main`; `JsonSchema.__callStatic` still spreads `args` unchecked until the item resumes.

### Resumed run result (2026-10-31)

Status: blocked. Blocking condition: required named-before-positional unpacking error differs in unchanged runtime; fixing it needs packages/runtime outside the action item's packages/json-schema scope. For `JsonSchema.__callStatic("string", new PhpArray([["a",1],[0,"x"]]))`, host PHP 8.5.11 probe gives `Error: Unknown named parameter $a`; port gives `Error: Cannot use positional argument after named argument during unpacking`. DIV-9.15 now authorizes the named-argument TypeError diagnostic, but not this different PHP Error. Maintainer must authorize a scoped runtime followup or rule on the expected diagnostic. No assertion was weakened.

Saved resumed attempt: `retro-16-item-1-callstatic-resumed-attempt.patch`; package changes reverted. It includes original implementation plus consuming non-list/Traversable/numeric-object and integer insertion-order probes, exact named-key records, and truncated UTF-8 coverage. Four text review layers completed (edge-case: no findings); Fidelity and full harness not run because scope blocker halted the unit. Component harness: 280 checked/differ=0 with XT-json-schema-1..5 passing, both probe records regenerated exactly, typecheck passed, lint passed after escalated retry of stalled sandbox lint. New test-only consuming rows were component-verified after lint; no claim of final full verification. Direct independent Bun reproduction stalled at import and was terminated (exit143); implementation agent's exact PHP-backed harness comparison established the discrepancy. Follow-up review recommendation: false while blocked.
