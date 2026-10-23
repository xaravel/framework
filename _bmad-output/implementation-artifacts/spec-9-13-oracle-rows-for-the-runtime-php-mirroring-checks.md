---
title: "Story 9.13: Oracle rows for the runtime's PHP-mirroring checks"
type: 'feature'
created: '2026-10-22'
baseline_revision: '6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.13.md'
  - '{project-root}/decisions/MAINT-2026-10-22-epic-9-item-3-split.md'
  - '{project-root}/packages/runtime/docs/class-registry.md'
warnings: []
deferred:
  - summary: >-
      Mockery's andThrow("<name>") not-found message still strips a leading backslash, unlike PHP and the runtime's resolveClass.
    evidence: |-
      packages/mockery/src/Mockery/Expectation.ts:135 builds `Class "${exception.replace(/^\\/, "")}" not found`; PHP 8.5.11's `new $n` with $n = '\App\Missing' gives `Class "\App\Missing" not found` (signed fixture 16f7b8ee… result 1), which resolveClass now matches. No mockery test passes a leading-backslash name. Story 9.13 may edit only packages/runtime/**, so the fix and its test belong to the mockery component.
    location: >-
      packages/mockery/src/Mockery/Expectation.ts:135
    severity: medium
---

<intent-contract>

## Intent

**Problem:** XT-runtime-12, 13, 14, 18, 20 and 23 check behaviour that mirrors PHP (class-name lookup, by-reference writes, null normalisation, array copy-on-assign), but their expected values come only from the test author's reading of PHP: no Oracle row grounds them (Epic 9 retro finding S2). Local PHP 8.5.11 already shows one difference: PHP keeps a leading `\` in its not-found message (`new ('\App\Missing')` throws `Class "\App\Missing" not found`), while `resolveClass("\\App\\Missing")` throws `Class "App\Missing" not found`.

**Approach:** Add one `php-expr` request per Test ID to `conformance/oracle-requests/9.13.jsonl`, each evaluating only the PHP construct its test mirrors, and make each test compare Xaravel's result with the signed fixture. Fix every difference in `packages/runtime`.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, `conformance/oracle-requests/9.13.jsonl`, the `conformance/fixtures/runtime/*.json` the `xaravel-oracle` bot signs for it, this spec, and the Story's status lines (`sprint-status.yaml`, `stories/9.13.md` `status:`).
- Request lines: `{id, kind, input, sha256}` in that order, `kind: "php-expr"`, `input: {bindings: {}, setup: [...], exprs: [...]}`, rendered and hashed with `makeRequest`/`renderRequest` from `tools/oracle/request.ts` (run from a scratch script outside the repo). Requests contain no Laravel code and no Upstream fixture; classes they need are declared in `setup` with `eval('namespace …; class … {}')` under names unique to this file. The run is the bare PHPUnit TestCase in the global namespace, each `setup` statement and each expr its own `eval` in one shared scope.
- Each test reads its fixture as `values.test.ts` does (`oracle(id)`: dynamic import of `packages/assert/tests/xaravel/oracle-values.ts`, `readRequests`, `readSignedFixture`, `conformance/oracle/oracle.pub`), with `REQUESTS = "conformance/oracle-requests/9.13.jsonl"`; a missing fixture fails the test. Each file header names Story 9.13 and gives the F-10 recorded reason (Xaravel Tests, no Upstream test inputs; docs/ops/oracle.md § Per-Story requests).
- Every existing assertion stays. Where one hard-codes a value the Oracle contradicts, its expected value becomes the Oracle's (read from the fixture), and the runtime is fixed to match.

**Never:**
- Remove or loosen an assertion; add a skip, an `adapted:` marker or an Expectations line.
- Edit `packages/mockery/**` (its `Expectation.ts:135` copy of the stripped message is that component's; report it, do not fix it), `tools/oracle/**`, or any other Story's request file.
- Hand-write or edit a fixture.

## I/O & Edge-Case Matrix

| Scenario | Xaravel input | PHP construct in the request | Expected |
|----------|--------------|---------------------------|----------|
| XT-12 lookup | `resolveClass` of `App\Models\Post`, `\app\models\post`, `APP\MODELS\POST`; `fqcn(Post)`, `fqcn(new Post())` | `(new \ReflectionClass($n))->getName()` for each; `get_class(new ('\app\models\post'))` | `fqcn(resolveClass(n))` and `fqcn(new Post())` equal each Oracle name (`App\Models\Post`) |
| XT-13 miss | `resolveClass` (sync and async) of `App\Missing`, `\App\Missing` | `new $n` for each, in a try | message equals the Oracle's: `Class "App\Missing" not found`, `Class "\App\Missing" not found`; a PHP `Error` |
| XT-14 lookup | `resolveClass("tests\\fixtures\\foo")`; key `app\models\POST` taken; `resolveClass("App\\Post2")` | `getName()` of `tests\fixtures\foo`; `class_exists('app\models\POST')`; `new ('App\Post2')` | name `Tests\Fixtures\Foo`; collision is true (so `registerClass` refuses); message `Class "App\Post2" not found` |
| XT-18 Ref | `bump(r)`, list append through `Ref` | `function (&$x) { $x++; }` on `$r = 1`; `(function (&$x) { $x = [...$x, "a"]; })($list)` | `r.value` equals Oracle int (2); `jsonEncode(list.value)` equals Oracle `json_encode($list)` |
| XT-20 null | `normalizeNull` of `undefined`, `null`, `0`, `""`, `false`, `{a: 1}` | `(function (): void {})()`, `null`, `0`, `""`, `false`, `["a" => 1]` | each Xaravel result equals the decoded Oracle value (arrays compared through `jsonEncode` vs `json_encode`) |
| XT-23 copy | the test's `original`, `valueCopy`, every mutation it makes, the shared `Ref`, the sparse push | the same structure as PHP arrays with `$original["ref"] = &$ref`, `$copy = $original`, the same mutations, `$copy["ref"] = 2`; sparse `[5 => 1]`, unset, copy, push | `jsonEncode([list, php])` of original and copy equal the Oracle's `json_encode`; shared object `===`; `ref.value` equals Oracle `$ref`; pushed keys equal Oracle `array_key_last` (6, 6) |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:166-171` -- `notFound(fqcn)` builds the message from `normalise(fqcn)`, stripping a leading `\`; PHP keeps the name as written (local PHP 8.5.11: `new`, `::`, constants all give `Class "\App\Missing" not found`). Fix here; lookups still normalise (`normalise` at :57).
- `packages/runtime/tests/xaravel/registry.test.ts:54-140` -- XT-runtime-12..14; hard-coded literals at :94-95, :103, :133 become fixture comparisons (the literals for names without `\` may stay alongside).
- `packages/runtime/tests/xaravel/values.test.ts:20-60` -- the fixture idiom to copy (`Output`, `oracle(id)`, `rawResult`); XT-runtime-18 at :284, XT-runtime-20 at :343.
- `packages/runtime/tests/xaravel/semantics.test.ts:340-420` -- XT-runtime-23.
- `packages/assert/tests/xaravel/oracle-values.ts:107` -- `decode` (int → number, array → AD-9 value), read-only.
- `tools/oracle/request.ts:145-170` -- `requestHash`, `makeRequest`, `renderRequest`, read-only.
- `tools/oracle/evaluate.php:60-80, 380-410` -- result encoding (`{"value"}` / `{"throws":{class,message}}`) and the eval loop, read-only.
- `packages/runtime/docs/class-registry.md:4` -- say the not-found message keeps the name as given.

## Tasks & Acceptance

**Execution:**
- `conformance/oracle-requests/9.13.jsonl` -- one `php-expr` request each for XT-runtime-12, 13, 14, 18, 20, 23, per the matrix -- the Oracle rows the Story adds.
- `packages/runtime/src/registry/registry.ts` -- `notFound` uses the name as given -- the difference the Oracle shows.
- `packages/runtime/tests/xaravel/registry.test.ts`, `values.test.ts`, `semantics.test.ts` -- per test, compare with the fixture per the matrix; header names Story 9.13 and the F-10 reason -- AC1-AC4.
- `packages/runtime/docs/class-registry.md` -- the message rule -- docs follow the code.

**Acceptance Criteria:**
- Given each of the six requests, when `bun run oracle:story check 9.13` runs, then every line is accepted.
- Given local PHP 8.5.11, when each request's setup and exprs run in a scratch script outside the repo, then every result equals what the runtime produces (checked before the first push).
- Given the signed fixtures, when the six tests run, then each compares Xaravel's results with them and passes.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 22 findings — high 0, medium 4, low 9, false 9, maybe-false 0 (Fidelity Review: both reviewers pass at tree 5efafa61, no findings)
- findings:
  - `[low]` `[reject]` Intent: XT-14's Oracle row ties `class_exists('app\models\POST')` to the refused registration, an indirect check — the next line already pins the refusal; PHP's direct construct (redeclaring the class in `eval`) is an uncatchable compile error that would abort the evaluator.
  - `[false]` `[reject]` Intent: the Xaravel-only `registerClass` / `registerTestClass` messages and frame scoping are not Oracle-grounded — they have no PHP counterpart; the AC limits XT-12..14 to class-name lookups.
  - `[false]` `[reject]` Intent: XT-20's `assertSame(object, …)` identity has no Oracle counterpart — PHP arrays have no identity, so no request can ground it.
  - `[false]` `[reject]` Intent: XT-23's kind, prototype, null-prototype and bigint claims are not Oracle-grounded — they are JS-representation claims with no PHP analogue; every PHP-observable result is compared.
  - `[medium]` `[defer]` Intent: Mockery's `Expectation.ts:135` still strips the leading `\`, inconsistent with the runtime — grouped with the four rows below; recorded in `deferred`.
  - `[false]` `[reject]` Intent: Story status lines and the spec are not final in the reviewed diff — bookkeeping is finalised at the end of the run, outside the reviewed tree.
  - `[medium]` `[defer]` Verification gap: Mockery's not-found copy keeps stripping the `\` and nothing records it — grouped; `packages/mockery/**` is outside this Story's component; recorded in `deferred`.
  - `[low]` `[reject]` Verification gap (other): XT-14's `class_exists` assertion adds little beyond the next line — same as the first row.
  - `[medium]` `[defer]` Edge case: the spec's "report it" for Mockery's copy is not recorded — grouped; recorded in `deferred`.
  - `[medium]` `[defer]` Blind: Mockery copy never reported — grouped; recorded in `deferred`.
  - `[false]` `[reject]` Blind: `docs/exceptions.md:85` not updated — it says `Class "<FQCN>" not found`, which stays true with the name as given; `class-registry.md` carries the detail.
  - `[low]` `[patch]` Blind: no literal pins the leading-`\` message beside the fixture comparison — added `Class "\App\Missing" not found` literal in XT-runtime-13.
  - `[low]` `[reject]` Blind: case preservation in the message is not Oracle-pinned — needs a new signed request; `notFound` echoes the input unchanged, so a case rule cannot drift without editing that one line.
  - `[low]` `[reject]` Blind: XT-14's Oracle check proves little; suggests a second `eval` class declaration — that is a fatal compile error in PHP 8.5 (not catchable), so the request would fail; the refusal is pinned by the next assertion.
  - `[false]` `[reject]` Blind: second-FQCN refusal versus PHP's `class_alias` — `registerClass` is Xaravel's registration API (AD-10.5 requires the refusal), not a PHP lookup; `class_alias` is not ported here.
  - `[low]` `[patch]` Blind: XT-12's last Oracle row (`get_class(new $lower)`) has no Xaravel instance built through that spelling — added `fqcn(new (resolveClass("\\app\\models\\post"))())`.
  - `[low]` `[reject]` Blind: XT-20 cannot tell an array from an object through `json_encode` — the request's literal is an array by construction, and AD-9 represents a string-keyed array as the plain object the test passes; result 6 is redundant but harmless.
  - `[low]` `[reject]` Blind: the Oracle helper is copied in three test files — each follows the existing per-file idiom of 9.5/9.6; a shared module is a refactor beyond this Story, and the copies do not diverge in behaviour.
  - `[low]` `[reject]` Blind: XT-14 resolves `App\Post2` twice — negligible cost, no wrong outcome.
  - `[false]` `[reject]` Blind: status lines disagree with the spec — expected mid-review; finalised at the end.
  - `[false]` `[reject]` Blind: local-PHP check and `story:check` not recorded — the fix is a spec edit; both are recorded in Auto Run Result.
  - `[false]` `[reject]` Blind: `notFound` echoes malformed input unchecked — PHP's `new $name` also echoes the name as given; the lookup's validation is unchanged.

### 2026-10-22 — Review pass (Finalize re-check)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The Fidelity Review re-ran on the patched tree 9131dda3 after the re-check printed `stale`; both reviewers pass.

## Auto Run Result

Status: done

- **Change:** six `php-expr` Oracle requests in `conformance/oracle-requests/9.13.jsonl` (XT-runtime-12, 13, 14, 18, 20, 23), signed by the `xaravel-oracle` bot on PR #330 (commit e965353); each test compares Xaravel's results with its fixture. The Oracle showed one difference: PHP's `new $name` keeps a leading `\` in `Class "\App\Missing" not found`, so `resolveClass` / `resolveClassAsync` now name the class as given (`registry.ts` `notFound`); lookups still ignore the `\`.
- **Files:** `packages/runtime/src/registry/registry.ts` (message as given); `packages/runtime/docs/class-registry.md` (the rule); `packages/runtime/tests/xaravel/registry.test.ts`, `values.test.ts`, `semantics.test.ts` (fixture comparisons, Story 9.13 headers with the F-10 reason); `conformance/oracle-requests/9.13.jsonl`; six `conformance/fixtures/runtime/*.json` (bot-signed).
- **Review:** 2 low patches applied (XT-runtime-13 literal for the leading-`\` message; XT-runtime-12 instance built through the `\app\models\post` spelling). 1 entry deferred (Mockery's `Expectation.ts:135` copy still strips the `\`; medium; outside this Story's component). Rejected: 7 low and 9 false, each with its reason in the triage log. Patched counts: high 0, medium 0, low 2.
- **Follow-up review recommended:** false (no high, fewer than two medium patched).
- **Verification:** before the first push each request ran on local PHP 8.5.11 and matched the runtime. After the bot's commit: `bun test packages/runtime` 38/38; `bun run harness --xaravel --id 'XT-runtime-*'` 38/38, no difference (`harness --story 9.13` refuses a manifest with no `test_ids`, as documented); `tsc -b`, lint, `graph:check`, `registration:check`, `oracle:story check 9.13` (6 accepted), `oracle:verify-fixtures` clean; Fidelity Review `current` at tree 9131dda3 (codex and claude both pass).
- **Residual risk:** the Mockery inconsistency above until that component fixes it.

## Design Notes

The fixtures exist only after `oracle.yml#story` signs them on the PR, so the loop pushes the branch and opens the PR once the request file and tests are written, pulls the bot's commit, then runs the full checks. Until then the six tests fail with a missing fixture; that is expected locally.

## Verification

**Commands:**
- `bun run oracle:story check 9.13` -- expected: every request accepted.
- `bun test packages/runtime` -- expected: pass once the fixtures are pulled.
- `bun run harness --story 9.13`, then `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: no difference.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run oracle:verify-fixtures` -- expected: clean.

## Fidelity Review

### Reviewer 1: pass at tree 5efafa61ba1b9c7df73584302ebc39f4c104f49a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2`, on 2026-10-23T05:27:40.053Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds or changes none. |
| F-2: No expected value is weakened | pass | Compared the changed assertions with their previous values and signed Oracle outputs. Exact comparisons remain exact; the leading-backslash error message now matches PHP, as the Maintainer ruling permits runtime differences to be fixed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All six assigned fixtures have output.error null; expression-level throws are expected results, not error fixtures under this check. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the supplied touched test bodies and helpers with their consequence strings and cited bullets. They check the declared registry behavior, value semantics, copying, references, normalization and brands; the new comparisons use the corresponding signed results. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the runtime component scope with the diff. Production changes remain in runtime and correct its registry message; no other component behavior is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete registry source and declaration inventory with AD-6 and ESC-9.4-1. Its sole async export performs await import() and retains the explicitly approved Registry.resolveClassAsync root tag; no other export requires a tag. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Compared all six requests with the supplied Xaravel Tests and recorded reasons. Each evaluates the corresponding PHP constructs and inputs; comments explain why these differential requests have no Upstream test source. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"5efafa61ba1b9c7df73584302ebc39f4c104f49a","base":"6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T05:27:40.053Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds or changes none.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed assertions with their previous values and signed Oracle outputs. Exact comparisons remain exact; the leading-backslash error message now matches PHP, as the Maintainer ruling permits runtime differences to be fixed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"All six assigned fixtures have output.error null; expression-level throws are expected results, not error fixtures under this check.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the supplied touched test bodies and helpers with their consequence strings and cited bullets. They check the declared registry behavior, value semantics, copying, references, normalization and brands; the new comparisons use the corresponding signed results.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the runtime component scope with the diff. Production changes remain in runtime and correct its registry message; no other component behavior is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete registry source and declaration inventory with AD-6 and ESC-9.4-1. Its sole async export performs await import() and retains the explicitly approved Registry.resolveClassAsync root tag; no other export requires a tag.","findings":[]},{"id":"F-10","result":"pass","note":"Compared all six requests with the supplied Xaravel Tests and recorded reasons. Each evaluates the corresponding PHP constructs and inputs; comments explain why these differential requests have no Upstream test source.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 5efafa61ba1b9c7df73584302ebc39f4c104f49a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2`, on 2026-10-23T05:27:40.053Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest has test_ids: [] and the change adds or changes no Ported Test, so there are no Upstream source lines to compare. Only Xaravel Tests (XT-runtime-12..14, 18, 20, 23) changed. |
| F-2: No expected value is weakened | pass | I compared every changed expected value in the touched Xaravel Tests. In XT-runtime-13, the old hard-coded message for resolveClass("\\App\\Missing") ('Class "App\Missing" not found', leading '\' dropped) was replaced by an exact assertSame against the signed Oracle's 'new $leading' throwable. That throwable's message is 'Class "\App\Missing" not found', with the class Error. The new check also covers the class and the async path. The runtime was fixed to match PHP (notFound now keeps the name as given), as MAINT-2026-10-22-epic-9-item-3-split directs. In XT-runtime-23, 'assertSame(6, …push(2))' was only refactored into variables, and the same exact assertions remain. Every added Oracle comparison is an exact assertSame. Nothing was loosened or changed to fit Xaravel's output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed (test_ids is empty). Within the Xaravel Tests, the one replaced assertion in XT-runtime-13 has a stricter Oracle-backed counterpart, and no other assertion was dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip and touches no Expectations file. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): none of the six fixtures has a non-null output.error, and all six verify against oracle.pub. The 'throws' results (Error, 'Class "App\Missing" not found', 'Class "\App\Missing" not found', 'Class "App\Post2" not found') are per-expression results, not fixture errors. They are what PHP's 'new $name' throws, and the tests compare both class and message. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | No consequence string changed. Each body still checks its whole claim, and the Oracle comparisons only add checks. XT-runtime-12: case-insensitive, leading-'\' resolution and fqcn match ReflectionClass::getName and get_class (AD-10.1–10.3). XT-runtime-13: the miss throws PHP's Error naming the class, sync and async (AD-10.2, AD-10.4). XT-runtime-14: duplicate and overlay behaviour is unchanged. XT-runtime-18: the Ref write-through matches PHP's &$x (AD-9.2). XT-runtime-20: normalizeNull matches PHP's void-call null and the identity values (AD-9.1). XT-runtime-23: valueCopy matches PHP's copy-on-assign, including the shared reference and the next free index (AD-9.2). Each cited bullet is the one tested. |
| F-8: No stub, fake or partial implementation of another Component | pass | The only framework change is in packages/runtime/src/registry/registry.ts (notFound keeps the given name), inside the runtime component. Reading packages/assert/tests/xaravel/oracle-values.ts at run time is the pattern the 9.5 and 9.6 tests already use; it is not a stub or a fake. No hard-coded return or partial behaviour from another component was added. |
| F-9: Every `@asyncRoot` tag is true | pass | registry.ts holds one tag, '@​asyncRoot Registry.resolveClassAsync' on line 145. It is true: the function does an 'await import()' of a mapped file, which decisions/ESC-9.4-1.md part 1 rules is that root. Evidence (g) lists every other export (registerClass, fqcn, resolveClass, registeredBaseClass, installTestFrameAccess, registerTestClass, loadAutoload, installClassmapEncoder, writeClassmap, loadClassmap). All are sync, do no async IO and take no async callback, so none needs a tag. The changed notFound is sync and internal. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Every request in conformance/oracle-requests/9.13.jsonl is keyed to an Xaravel Test id with no Upstream test, and each test file's header records the reason (docs/ops/oracle.md § Per-Story requests). The setup and exprs mirror each test's own inputs. XT-runtime-12/14: eval-declared App\Models\Post and Tests\Fixtures\Foo with the same spellings. XT-runtime-13: App\Missing with and without a leading '\'. XT-runtime-18: the by-reference bump and list append. XT-runtime-20: a void call, null, 0, "", false and ["a"=>1]; the four bare literals add little evidence, but they sign no arbitrary expected value. XT-runtime-23: the same nested structure and every mutation in order, the reference element, and the sparse unset-then-push. No request uses Laravel code, and none signs an arbitrary value beyond the PHP constructs these tests mirror. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"5efafa61ba1b9c7df73584302ebc39f4c104f49a","base":"6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T05:27:40.053Z","items":[{"id":"F-1","result":"n/a","note":"The manifest has test_ids: [] and the change adds or changes no Ported Test, so there are no Upstream source lines to compare. Only Xaravel Tests (XT-runtime-12..14, 18, 20, 23) changed.","findings":[]},{"id":"F-2","result":"pass","note":"I compared every changed expected value in the touched Xaravel Tests. In XT-runtime-13, the old hard-coded message for resolveClass(\"\\\\App\\\\Missing\") (`Class \"App\\Missing\" not found`, leading `\\` dropped) was replaced by an exact assertSame against the signed Oracle's `new $leading` throwable. That throwable's message is `Class \"\\App\\Missing\" not found`, with the class Error. The new check also covers the class and the async path. The runtime was fixed to match PHP (notFound now keeps the name as given), as MAINT-2026-10-22-epic-9-item-3-split directs. In XT-runtime-23, `assertSame(6, …push(2))` was only refactored into variables, and the same exact assertions remain. Every added Oracle comparison is an exact assertSame. Nothing was loosened or changed to fit Xaravel's output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed (test_ids is empty). Within the Xaravel Tests, the one replaced assertion in XT-runtime-13 has a stricter Oracle-backed counterpart, and no other assertion was dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip and touches no Expectations file.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): none of the six fixtures has a non-null output.error, and all six verify against oracle.pub. The `throws` results (Error, `Class \"App\\Missing\" not found`, `Class \"\\App\\Missing\" not found`, `Class \"App\\Post2\" not found`) are per-expression results, not fixture errors. They are what PHP's `new $name` throws, and the tests compare both class and message.","findings":[]},{"id":"F-7","result":"pass","note":"No consequence string changed. Each body still checks its whole claim, and the Oracle comparisons only add checks. XT-runtime-12: case-insensitive, leading-`\\` resolution and fqcn match ReflectionClass::getName and get_class (AD-10.1–10.3). XT-runtime-13: the miss throws PHP's Error naming the class, sync and async (AD-10.2, AD-10.4). XT-runtime-14: duplicate and overlay behaviour is unchanged. XT-runtime-18: the Ref write-through matches PHP's &$x (AD-9.2). XT-runtime-20: normalizeNull matches PHP's void-call null and the identity values (AD-9.1). XT-runtime-23: valueCopy matches PHP's copy-on-assign, including the shared reference and the next free index (AD-9.2). Each cited bullet is the one tested.","findings":[]},{"id":"F-8","result":"pass","note":"The only framework change is in packages/runtime/src/registry/registry.ts (notFound keeps the given name), inside the runtime component. Reading packages/assert/tests/xaravel/oracle-values.ts at run time is the pattern the 9.5 and 9.6 tests already use; it is not a stub or a fake. No hard-coded return or partial behaviour from another component was added.","findings":[]},{"id":"F-9","result":"pass","note":"registry.ts holds one tag, `@asyncRoot Registry.resolveClassAsync` on line 145. It is true: the function does an `await import()` of a mapped file, which decisions/ESC-9.4-1.md part 1 rules is that root. Evidence (g) lists every other export (registerClass, fqcn, resolveClass, registeredBaseClass, installTestFrameAccess, registerTestClass, loadAutoload, installClassmapEncoder, writeClassmap, loadClassmap). All are sync, do no async IO and take no async callback, so none needs a tag. The changed notFound is sync and internal.","findings":[]},{"id":"F-10","result":"pass","note":"Every request in conformance/oracle-requests/9.13.jsonl is keyed to an Xaravel Test id with no Upstream test, and each test file's header records the reason (docs/ops/oracle.md § Per-Story requests). The setup and exprs mirror each test's own inputs. XT-runtime-12/14: eval-declared App\\Models\\Post and Tests\\Fixtures\\Foo with the same spellings. XT-runtime-13: App\\Missing with and without a leading `\\`. XT-runtime-18: the by-reference bump and list append. XT-runtime-20: a void call, null, 0, \"\", false and [\"a\"=>1]; the four bare literals add little evidence, but they sign no arbitrary expected value. XT-runtime-23: the same nested structure and every mutation in order, the reference element, and the sparse unset-then-push. No request uses Laravel code, and none signs an arbitrary value beyond the PHP constructs these tests mirror.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 9131dda374d65e79ab7ee53e8541297fd056cae1

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2`, on 2026-10-23T05:30:31.629Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | pass | The changed assertions retain exact comparisons. The leading-backslash exception message is corrected to the signed PHP fixture, and existing assertions remain intact. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All six assigned fixtures have output.error null; individual throwable results are not error fixtures under this check. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The supplied touched test bodies verify their declared registry, value, copying, comparison and brand consequences. The new comparisons check the corresponding signed PHP results without replacing existing checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | Implementation changes stay within runtime. Tests reuse the existing grader fixture reader and add no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete registry source retains one async tag: resolveClassAsync performs await import(), expressly authorized as Registry.resolveClassAsync by ESC-9.4-1. No other declaration requires an async tag. |
| F-10: Oracle requests match the Upstream test's inputs | pass | All six requests evaluate the PHP constructs and inputs mirrored by their named Xaravel Tests. The test-file comments record why these differential requests have no Upstream test inputs, consistent with the supplied Maintainer ruling. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"9131dda374d65e79ab7ee53e8541297fd056cae1","base":"6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T05:30:31.629Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"pass","note":"The changed assertions retain exact comparisons. The leading-backslash exception message is corrected to the signed PHP fixture, and existing assertions remain intact.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"All six assigned fixtures have output.error null; individual throwable results are not error fixtures under this check.","findings":[]},{"id":"F-7","result":"pass","note":"The supplied touched test bodies verify their declared registry, value, copying, comparison and brand consequences. The new comparisons check the corresponding signed PHP results without replacing existing checks.","findings":[]},{"id":"F-8","result":"pass","note":"Implementation changes stay within runtime. Tests reuse the existing grader fixture reader and add no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The complete registry source retains one async tag: resolveClassAsync performs await import(), expressly authorized as Registry.resolveClassAsync by ESC-9.4-1. No other declaration requires an async tag.","findings":[]},{"id":"F-10","result":"pass","note":"All six requests evaluate the PHP constructs and inputs mirrored by their named Xaravel Tests. The test-file comments record why these differential requests have no Upstream test inputs, consistent with the supplied Maintainer ruling.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 9131dda374d65e79ab7ee53e8541297fd056cae1

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2`, on 2026-10-23T05:30:31.629Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare. The touched tests are all Xaravel Tests (XT-runtime-12/13/14/18/20/23). |
| F-2: No expected value is weakened | pass | No Ported Test exists to compare with Upstream. One Xaravel Test expected value changed: in XT-runtime-13, resolveClass("\\App\\Missing") now expects 'Class "\App\Missing" not found'. This is still an exact assertSame. The signed fixture 16f7b8ee… records PHP's 'new $leading' throwing Error with that exact message, and registry.ts notFound() was changed to match. Xaravel moved to PHP, not the reverse, so nothing was loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are in scope. In the touched Xaravel Tests every existing assertion is kept; the change only adds Oracle comparisons. No adapted markers are present. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and there is no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | Evidence (c): all six fixtures are present, verify against oracle.pub and have output.error null. No assigned fixture is an error. The 'throws' results (Error 'Class "App\Missing" not found', '\App\Missing', 'App\Post2') are expression results, not fixture errors, and they match what the tests compare against. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Checked each touched test's new Oracle comparison against its fixture and its consequence. XT-runtime-12: indexes 0-3 are ReflectionClass::getName and get_class of the spellings, all 'App\Models\Post', compared with fqcn(resolveClass(spelling)). This supports AD-10.1/10.2 (case-insensitive lookup, leading \ ignored). XT-runtime-13: class and message from PHP's 'new $n' are compared for both the sync and async misses (AD-10.2/10.4). XT-runtime-14: getName of the lower-cased test fixture, class_exists for the taken key, and the App\Post2 miss; all existing AD-10.5/AD-5.8 assertions remain. XT-runtime-18: $r=2 and ["a"] after by-reference writes (AD-9.2 Ref). XT-runtime-20: PHP's void call/null/0/""/false and the array compared with normalizeNull (AD-9.1). XT-runtime-23: the fixture's original/copy JSON, shared object, shared reference value 2 and next free index 6 all agree with the test's JS mutations (AD-9.2 value-copy). No cited bullet is mismatched. |
| F-8: No stub, fake or partial implementation of another Component | pass | The only source change is packages/runtime/src/registry/registry.ts, in the Story's own runtime component: notFound keeps the name as given. The tests load the existing grader helper oracle-values.ts at run time, a pattern already in use. No stub, fake or hard-coded return of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): registry.ts holds one @​asyncRoot tag, on resolveClassAsync (line 145). It really awaits import() on a miss, which is the root ESC-9.4-1 option 1a adds. Every other export (registerClass, fqcn, resolveClass, registeredBaseClass, registerTestClass, loadAutoload, writeClassmap, loadClassmap, the install* functions) is sync and untagged. The changed notFound is sync and private. |
| F-10: Oracle requests match the Upstream test's inputs | pass | conformance/oracle-requests/9.13.jsonl holds requests only for Xaravel Test ids, so no Upstream test exists whose inputs they could take. The test files record that reason: the 9.13 header comments in registry.test.ts, values.test.ts and semantics.test.ts, citing docs/ops/oracle.md § Per-Story requests. Each request's setup and exprs mirror only the PHP construct its test exercises (class lookups over eval-declared classes, by-reference writes, null/void values, copy-on-assign with the same mutations), with no Laravel code. No arbitrary PHP is signed as an expected value. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"9131dda374d65e79ab7ee53e8541297fd056cae1","base":"6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T05:30:31.629Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare. The touched tests are all Xaravel Tests (XT-runtime-12/13/14/18/20/23).","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test exists to compare with Upstream. One Xaravel Test expected value changed: in XT-runtime-13, resolveClass(\"\\\\App\\\\Missing\") now expects 'Class \"\\App\\Missing\" not found'. This is still an exact assertSame. The signed fixture 16f7b8ee… records PHP's `new $leading` throwing Error with that exact message, and registry.ts notFound() was changed to match. Xaravel moved to PHP, not the reverse, so nothing was loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are in scope. In the touched Xaravel Tests every existing assertion is kept; the change only adds Oracle comparisons. No adapted markers are present.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and there is no Expectations adapted field.","findings":[]},{"id":"F-6","result":"pass","note":"Evidence (c): all six fixtures are present, verify against oracle.pub and have output.error null. No assigned fixture is an error. The `throws` results (Error 'Class \"App\\Missing\" not found', '\\App\\Missing', 'App\\Post2') are expression results, not fixture errors, and they match what the tests compare against.","findings":[]},{"id":"F-7","result":"pass","note":"Checked each touched test's new Oracle comparison against its fixture and its consequence. XT-runtime-12: indexes 0-3 are ReflectionClass::getName and get_class of the spellings, all 'App\\Models\\Post', compared with fqcn(resolveClass(spelling)). This supports AD-10.1/10.2 (case-insensitive lookup, leading \\ ignored). XT-runtime-13: class and message from PHP's `new $n` are compared for both the sync and async misses (AD-10.2/10.4). XT-runtime-14: getName of the lower-cased test fixture, class_exists for the taken key, and the App\\Post2 miss; all existing AD-10.5/AD-5.8 assertions remain. XT-runtime-18: $r=2 and [\"a\"] after by-reference writes (AD-9.2 Ref). XT-runtime-20: PHP's void call/null/0/\"\"/false and the array compared with normalizeNull (AD-9.1). XT-runtime-23: the fixture's original/copy JSON, shared object, shared reference value 2 and next free index 6 all agree with the test's JS mutations (AD-9.2 value-copy). No cited bullet is mismatched.","findings":[]},{"id":"F-8","result":"pass","note":"The only source change is packages/runtime/src/registry/registry.ts, in the Story's own runtime component: notFound keeps the name as given. The tests load the existing grader helper oracle-values.ts at run time, a pattern already in use. No stub, fake or hard-coded return of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): registry.ts holds one @asyncRoot tag, on resolveClassAsync (line 145). It really awaits import() on a miss, which is the root ESC-9.4-1 option 1a adds. Every other export (registerClass, fqcn, resolveClass, registeredBaseClass, registerTestClass, loadAutoload, writeClassmap, loadClassmap, the install* functions) is sync and untagged. The changed notFound is sync and private.","findings":[]},{"id":"F-10","result":"pass","note":"conformance/oracle-requests/9.13.jsonl holds requests only for Xaravel Test ids, so no Upstream test exists whose inputs they could take. The test files record that reason: the 9.13 header comments in registry.test.ts, values.test.ts and semantics.test.ts, citing docs/ops/oracle.md § Per-Story requests. Each request's setup and exprs mirror only the PHP construct its test exercises (class lookups over eval-declared classes, by-reference writes, null/void values, copy-on-assign with the same mutations), with no Laravel code. No arbitrary PHP is signed as an expected value.","findings":[]}],"prior":[]}
```
