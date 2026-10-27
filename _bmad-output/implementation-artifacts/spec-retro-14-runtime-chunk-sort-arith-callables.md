---
title: 'Epic 14 item 10: runtime chunk, sort, arithmetic and callables'
type: feature
created: '2026-10-27'
status: in-review
baseline_revision: 0f4708b536cb1d7c678886ee5fcc5334eb3b5f72
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-27-story-14-5.md
  - decisions/ESC-14.5-1.md
  - decisions/ESC-14.5-2.md
  - decisions/ESC-14.5-3.md
  - decisions/ESC-14.5-4.md
  - AGENTS.md
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      Fidelity reviewer 1 F-7 omitted unchanged php-set-functions.probe.txt consequence rows.
    evidence: |-
      Complete file exists and both PHP probe runs match; missing-evidence-only rejection is counted under MAINT-2026-10-24-evidence-gaps. Copy finding to Maintainer inbox.
    location: >-
      packages/runtime/tests/xaravel/php-set-functions.probe.txt
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 14.5 cannot faithfully port its remaining collection members without shared PHP runtime builtins, arithmetic, callable invocation and temporary generator lifetime support. Action item `epic-14-item-10-runtime-chunk-sort-arith-callables` authorizes this single Infrastructure batch.

**Approach:** Implement the approved PHP 8.5.11 operations in runtime, reusing its array, comparison, Registry, numeric parsing and Scope Frame primitives; verify against executable PHP probes.

## Boundaries & Constraints

**Always:** Keep every requirement of the action item's immutable `action`, and the four approved rulings in context. Code, tests and docs stay in `packages/runtime/**`; own spec and bookkeeping stay under implementation-artifacts. Preserve AD-2/4/5/6/9/10/19/23/26, synchronous APIs, named exports, exact integer handling, float markers, array value copies and PHP errors. Locale is a Scope Frame slot; C and POSIX always work, any other locale is accepted only with Oracle-matching collation evidence. Callable forms follow amended DIV-9.13/14. All existing exports remain.

**Never:** Change another package, grader, Expectations, protected instructions or decision. Never exhaust a generator to close it. A user-held generator stays resumable. Named unpacking to a target without an options form is explicitly untranslatable under ESC-14.5-3; never silently drop names. PORTING.md already names the helpers and is read-only here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Chunk and pointer | All AD-9 arrays, empty, mixed keys, size coercion, preserve_keys | PHP chunks/reindexing; key returns current key or null; reset/end and key agree | PHP ValueError for size below 1, TypeError for invalid args |
| Sorts | Ref arrays, key/value sorts, every PHP flag, reverse and stable ties, user comparator | ksort/krsort/uksort/sort/rsort match PHP key types/order; input aliases unchanged | PHP argument/callback errors; comparator exceptions propagate with PHP mutation behavior |
| Arithmetic | int/float/string/null/bool, leading numeric, overflow, two arrays | plus/divide/intdiv/floor/ceil preserve PHP coercion, exact int or marked float; constants exact int64 | Unsupported operand TypeError, DivisionByZeroError and intdiv overflow ArithmeticError |
| String/type | ASCII/multibyte strings, registered class/contract/enum inheritance | strrev reverses bytes; strtolower ASCII; is_subclass_of excludes same class and honors allow_string | PHP coercion/errors; unsupported byte strings follow existing runtime policy |
| Callables and append | Closures, invokables, object/class callable arrays, Class::method, PHP global name; mixed-key Ref append | Shared resolution in every runtime callback consumer; case-insensitive/static/magic rules; next free index and value copies | Invalid callback PHP TypeError; scalar append PHP errors; positional-after-named error; unsupported named target explicit error |
| Locale | C/POSIX, query null or '0', failed change, restore, interleaved frames | setlocale/LC_ALL slot read by strcoll and SORT_LOCALE_STRING, failed change retains locale, isolated frames | false for unsupported locale |
| Generator ownership | Early break, callback exit, exception, normal exhaustion; held versus owned generators | Owned cleanup runs finally once without running later source; held generator resumable; entries/keys/value traversal agree | Finally exceptions propagate |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayRefFunctions.ts` -- referencedArray, pointerEntries, dataCompare, sortedArray and zendSort reuse; reset/end currently omit pointer tracking, integrate key coherently.
- `packages/runtime/src/php/arrayFunctions.ts` -- arrayParameter, keptArray, regularCompare/numericCompare/userCompare, arrayUnion and private callbackParameter; replace callback refusal with shared resolver.
- `packages/runtime/src/php/phpFunctions.ts` -- frozen PHP function registry, arity/byRef metadata, phpFunction; register new PHP-named functions and preserve count checks.
- `packages/runtime/src/php/typeTests.ts` -- is_a class/token/enum inheritance, callable shape checking; align detection with invocation.
- `packages/runtime/src/php/objectFunctions.ts`, `reflectionTargets.ts`, `registry/registry.ts` -- existing case-insensitive method invocation, magic methods, Registry FQCN lookup; no constructor.name identity.
- `packages/runtime/src/php/phpArguments.ts`, `numericString.ts`, `phpInt.ts`, `PhpFloat.ts` -- coercion, leading numeric parsing, int64 bounds and float tagging.
- `packages/runtime/src/php/PhpArray.ts`, `Ref.ts`, `valueCopy.ts` -- append index, Ref and recursive array copies.
- `packages/runtime/src/php/Generator.ts`, `liveCursor.ts`, `traverse.ts` -- wrapper, iterator protocol, delegation; add explicit owned construction seam to close only framework-created temporaries.
- `packages/runtime/src/scope/scope.ts` -- frameSlot/currentFrame APIs for locale; no new process state.
- `packages/runtime/tests/xaravel/php-set-functions.*`, `php-round-string-functions.*` -- executable host PHP 8.5.11 probe and xaravelTest patterns; existing callable-refusal tests may need updating to the approved contract without dropping coverage.
- `packages/runtime/src/php/index.ts`, `src/index.ts`, `docs/` -- PHP and root exports, usage docs including ownership and bounded locale support.
- `decisions/DIV-9.md`, `PORTING.md`, architecture spine -- read-only language mappings and AD constraints.

## Tasks & Acceptance

**Execution:**

- `packages/runtime/src/php/arrayRefFunctions.ts`, `valueCopy.ts`, `PhpArray.ts` (internal metadata helper if needed) -- separate before pointer mutation; preserve pointer through copies and append, including nested arrays, frozen/nonextensible inputs, independent aliases, and empty arrays. Tests must follow the Ref-held separated value; aliases retain their own pointer.
- `packages/runtime/src/php/locale.ts` -- maintain independent PHP categories inside the frame; LC_ALL sets all and queries produce the PHP composite form when different; only proven C/POSIX accepted. strcoll/SORT_LOCALE_STRING read LC_COLLATE specifically. Check exact constants and strings against PHP/Oracle conventions.
- `packages/runtime/src/php/callables.ts` -- bare objects require an actual __invoke method; __call fallback only applies to method callables. Preserve options declaration from resolved method through class strings, class/object arrays and inherited late static binding. callUnpacked accepts arrays and Traversable, validates PHP int/string keys, repeated names and positional-after-named; call_user_func_array remains array-only. Resolve no signatures by parsing JS source.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.*` -- add executable PHP evidence for pointer copy/append/alias behavior, null/false append copies, mixed category locales, magic-only object rejection, Traversable unpack (duplicate keys/order/invalid keys), >16-entry key sort ties and comparator failures, and inherited late-static binding. Add targeted runtime options metadata tests for all representations. Keep existing labels and complete test coverage.
- `packages/runtime/src/php/` -- implement array_chunk/key/key sorts/value sorts, arithmetic and PHP_INT constants, string/type builtins; share existing internals and add focused modules as needed.
- `packages/runtime/src/php/` -- implement shared callable resolution, arrayAppend and callUnpacked/call_user_func_array, preserving all approved forms and explicit named-target boundary.
- `packages/runtime/src/php/Generator.ts` -- explicit owned seam and deterministic finally cleanup on all iterator exit paths.
- `packages/runtime/src/php/` -- locale slot and setlocale/LC_ALL, wire strcoll and locale sorting.
- `packages/runtime/src/php/phpFunctions.ts`, `index.ts` -- export and register every new PHP function with correct PHP arity/byRef metadata, root export verified.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.*` -- PHP probe and checked-in output, runtime recomputation of labels, matrix/error cases and concurrency/lifetime tests; next unused XT-runtime IDs.
- `packages/runtime/docs/` -- document APIs and approved boundaries, with no claims beyond verification.

**Acceptance Criteria:**
- Given the approved action item, when all newly exported operations are called from PHP and root entrypoints, then every matrix row has a passing executed XT-runtime test against PHP-derived evidence.
- Given an existing runtime callback API, when a valid PHP callable array or static string is passed, then it resolves consistently with is_callable and PHP, while invalid callbacks retain PHP errors.
- Given concurrent frames and owned/held generators, when locale changes and early exits interleave, then state and cleanup satisfy the matrix without leakage or excess enumeration.
- Given the complete repository, when harness/typecheck/lint and item Fidelity Review run, then there are no harness differences, checks pass and Fidelity status is current before merge.

## Spec Change Log

- 2026-10-27 Maintainer resume (monitor): the full-verification block was environmental, not a defect. Outside the Codex sandbox, at this branch's head, `bun run harness` exited 0 with `SUMMARY variants=11 run=6 not-run=5 checked=22547 differ=0` and `XARAVEL tests=450 passed=439 failed=0 skipped=11`. The repaired-tree timeouts (dependency-graph and signed-fixture checks) followed m1's GitHub HTTPS outage of 05:48–07:35 PDT, when GitHub queries were still stalling. CI on #492 is green apart from the expected `ownership` scope check. Status is set to `in-review`, and the item leaves epic 14's `waiting_on_maintainer`. Resume at step 4: re-run the full harness on m1, then review pass 2 and the item Fidelity Review on the current tree.

- 2026-10-27 review repair 1: re-derive with pointer value-copy/separation, category-specific locale slots, Traversable unpack and resolved-method options metadata, real __invoke detection, and the missing null/false/large-sort/late-static evidence. Known-bad state: passing short probes concealed alias and invocation errors. KEEP all approved exports, bigint arithmetic/markers, PHP errors, stable Zend sort engine, frame-local locale availability, owned-versus-held lifetime behavior, all 55 probe labels and stronger XT48 fresh-process assertion. Previous attempted diff retained at `/Users/ea/.xaravel-orchestrator/tmp/item10-before-repair.diff` as a reference; it is not a substitute for re-derivation and verification.

- 2026-10-27 verification repair: the harness disallows combining `--component` and `--xaravel`; use its XT ID filter. XT-runtime-48 failed identically at baseline revision `0f4708b536cb1d7c678886ee5fcc5334eb3b5f72` because Mockery's imported fixture layers a string-only global lookup. Its non-string assertion now runs against the installed runtime global in a fresh process, retaining the null expectation and adding an exit-code check. No assertion removed or weakened.

## Review Triage Log

### 2026-10-27 — Review pass 1
- verdicts: 21 findings — high 0, medium 13, low 0, false 7, maybe-false 1
- findings:
  - `[medium]` `[bad_spec]` Blind: pointer writes affect independent aliases — reset/end mutate shared objects; separate Ref-held arrays before pointer writes and preserve copied pointer state.
  - `[medium]` `[bad_spec]` Blind: valueCopy loses pointer — valueCopy does not copy the private pointer symbol; carry metadata through every array form and nested copy.
  - `[medium]` `[bad_spec]` Blind: append loses pointer — arrayAppend rebuilds without current position; preserve pointer metadata.
  - `[medium]` `[bad_spec]` Blind: frozen/nonextensible array pointer writes throw — Object.defineProperty targets caller data; separation must support frozen inputs.
  - `[medium]` `[bad_spec]` Blind: locale categories share one slot — setlocale accepts category numbers 0..6 but writes one value; category-aware frame state must preserve LC_COLLATE versus LC_NUMERIC.
  - `[medium]` `[bad_spec]` Blind: options metadata lost for method callable forms — unpack reads marker from callable array/string rather than resolved method; preserve method options metadata.
  - `[medium]` `[bad_spec]` Blind: Traversable unpack refused — callUnpacked uses arrayParameter although PHP unpack accepts Traversable; iterate key/value sources with PHP key and duplicate/order validation.
  - `[false]` `[reject]` Blind: forced-close yielding finally leaves remaining cleanup unexecuted — PHP force-closing a generator forbids yielding from finally and throws the same Error; no guarantee to execute statements after a forbidden yield is claimed.
  - `[maybe-false]` `[defer]` Blind: large key-sort partition path lacks direct new coverage — Existing zendSort and uasort cover the shared engine, but partition-specific key adapter behavior needs a >16-entry probe to settle; add regression during repair rather than leaving uncertain.
  - `[medium]` `[bad_spec]` Blind: inherited late-static/options method cases missing — Reflect.apply binds the resolved class correctly, but options method metadata is genuinely lost; cover inherited called scope and each options method representation.
  - `[medium]` `[bad_spec]` Edge: magic-only object treated as invokable — resolution uses methodCallable(__invoke), whose __call fallback accepts objects PHP rejects; require actual __invoke for bare objects.
  - `[medium]` `[bad_spec]` Edge: append after end resets pointer — Same verified pointer preservation defect; fix and probe.
  - `[medium]` `[bad_spec]` Edge: valueCopy after end resets pointer — Same verified copied-pointer defect; fix and probe.
  - `[medium]` `[bad_spec]` Verification: null/false append branch untested — Search proves no current case reaches initialization; add PHP-derived null/false copy cases.
  - `[medium]` `[defer]` Fidelity reviewer 1 F-7 probe unchanged rows omitted — Counted nonblocking missing-evidence gap under MAINT-2026-10-24-evidence-gaps; unchanged php-set-functions.probe.txt rows omitted from prompt, complete executable file exists and matches PHP.
  - `[false]` `[reject]` Intent: finite probes versus behavioral contract — A finite executable differential matrix is evidence of the public APIs; the action does not require the tests to launch PHP live.
  - `[false]` `[reject]` Intent: strrev multibyte byte-result surrogate — Actual unsupported-byte error is tested separately and follows the existing runtime string policy; no claim of a JS string holding invalid UTF-8.
  - `[false]` `[reject]` Intent: selected callback consumers — All existing runtime callback consumers route through callbackParameter/requiredCallback and thus the shared resolver; no uncovered alternate runtime callback path identified.
  - `[false]` `[reject]` Intent: named invocation through explicit options convention — ESC-14.5-3 explicitly makes targets without options forms untranslatable; marker is a concrete declaration of that form, with method metadata propagation repaired above.
  - `[false]` `[reject]` Intent: framework lifetime versus explicit ownership seam — Action explicitly asks for a runtime ownership seam before Story14.5 resumes; collection consumer integration is that later Story.
  - `[false]` `[reject]` Intent: C/POSIX equivalent collation — ESC-14.5-1 allows rejecting every unproven locale; these are both always-supported approved locales, tested against PHP.

## Verification

- `php -d error_reporting=0 packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.probe.php` -- PHP 8.5.11 baseline matches recorded probe output.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- all runtime XT cases execute with zero differences.
- `bun run harness` -- full harness zero differences (unavailable backends may be NOT-RUN).
- `bun run typecheck` -- success.
- `bun run lint` -- success.
- `bun run fidelity:review review --item epic-14-item-10-runtime-chunk-sort-arith-callables --spec _bmad-output/implementation-artifacts/spec-retro-14-runtime-chunk-sort-arith-callables.md --loop-cli codex` -- two counted passing verdicts.
- `bun run fidelity:review status --item epic-14-item-10-runtime-chunk-sort-arith-callables --spec _bmad-output/implementation-artifacts/spec-retro-14-runtime-chunk-sort-arith-callables.md` -- current.

## Fidelity Review

### Reviewer 1: reject at tree 36ca86cb0fc9ebac34a23611db18437c272e461b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `0f4708b536cb1d7c678886ee5fcc5334eb3b5f72`, on 2026-10-27T14:59:51.155Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | Changed assertions retain exact comparisons. Callable expectations follow amended DIV-9.13/14; the lookup subprocess retains the expected null result. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Test assertions to count against Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The supplied test bodies generally exercise their declared consequences, but omitted probe values prevent confirming all touched tests' comparisons. |
| F-8: No stub, fake or partial implementation of another Component | pass | All shown changes remain within packages/runtime and implement runtime-owned PHP semantics authorized by the action item; no other Component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied declaration inventory contains no retained asyncRoot tags. New framework operations are synchronous and their callbacks belong to synchronous runtime APIs under DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged probe rows selected by XT-runtime-83 and XT-runtime-85, including callback logs, exception cases and merge results. Only the changed registry rows are shown; the full file is omitted, so those expected consequences cannot be confirmed. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"36ca86cb0fc9ebac34a23611db18437c272e461b","base":"0f4708b536cb1d7c678886ee5fcc5334eb3b5f72","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-27T14:59:51.155Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Changed assertions retain exact comparisons. Callable expectations follow amended DIV-9.13/14; the lookup subprocess retains the expected null result.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Test assertions to count against Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The supplied test bodies generally exercise their declared consequences, but omitted probe values prevent confirming all touched tests' comparisons.","findings":[{"path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged probe rows selected by XT-runtime-83 and XT-runtime-85, including callback logs, exception cases and merge results. Only the changed registry rows are shown; the full file is omitted, so those expected consequences cannot be confirmed.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All shown changes remain within packages/runtime and implement runtime-owned PHP semantics authorized by the action item; no other Component is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied declaration inventory contains no retained asyncRoot tags. New framework operations are synchronous and their callbacks belong to synchronous runtime APIs under DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 36ca86cb0fc9ebac34a23611db18437c272e461b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `0f4708b536cb1d7c678886ee5fcc5334eb3b5f72`, on 2026-10-27T14:59:51.155Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Changed assertions retain exact comparisons and specific diagnostics. Callable expectations change consistently with ESC-14.5-3 and amended DIV-9.13/14; the lookup assertion retains its exact null result in a fresh process. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Touched Xaravel Test bodies and their supplied helpers check their declared consequences through exact probe comparisons and explicit copy, callable, locale, export and generator-lifetime assertions. The unsupported byte-string case is checked separately under the recorded representation limit. |
| F-8: No stub, fake or partial implementation of another Component | pass | All supplied changes stay within packages/runtime, the item's listed component. PHP builtins, callable resolution and generator ownership are runtime responsibilities expressly covered by the supplied rulings; no other component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied declaration inventories contain no retained or added asyncRoot tags. Changed implementations are synchronous and introduce no IO terminal or callback API required to be async under DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"36ca86cb0fc9ebac34a23611db18437c272e461b","base":"0f4708b536cb1d7c678886ee5fcc5334eb3b5f72","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-27T14:59:51.155Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Changed assertions retain exact comparisons and specific diagnostics. Callable expectations change consistently with ESC-14.5-3 and amended DIV-9.13/14; the lookup assertion retains its exact null result in a fresh process.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Touched Xaravel Test bodies and their supplied helpers check their declared consequences through exact probe comparisons and explicit copy, callable, locale, export and generator-lifetime assertions. The unsupported byte-string case is checked separately under the recorded representation limit.","findings":[]},{"id":"F-8","result":"pass","note":"All supplied changes stay within packages/runtime, the item's listed component. PHP builtins, callable resolution and generator ownership are runtime responsibilities expressly covered by the supplied rulings; no other component is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied declaration inventories contain no retained or added asyncRoot tags. Changed implementations are synchronous and introduce no IO terminal or callback API required to be async under DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```


## Auto Run Result

Status: blocked
Unit: epic-14-item-10-runtime-chunk-sort-arith-callables
Blocking condition: implementation verification failed on the repaired tree; full-harness infrastructure failures and a stalled sequential retry. No final review or merge approval is claimed.

Implemented the approved runtime exports, shared callable resolution/unpacking, array pointer value-copy behavior, frame-local bounded locales and owned Generator cleanup. Runtime source, documentation and executable PHP evidence are retained on the item branch for review. No other package or grader was changed.

Verification:
- Runtime harness: 90/90 passed, zero differences.
- Typecheck and lint passed after repair.
- Both PHP 8.5.11 probes match recorded output; batch probe has 65 labels. Locale POSIX canonical spelling is normalized from Darwin to source-verified glibc C and documented; no live Oracle run is claimed.
- Pre-repair full harness passed: 21,817 checked, zero differences; this does not verify the repaired tree.
- Repaired-tree overlapping full runs failed in infrastructure tests: one with XT-conformance-16/75 timeouts; another with XT-boost-6, XT-conformance-111/112/157/39 failures or timeouts (21,817 checked, five differences).
- A sequential parent retry emitted no result for more than fifteen minutes. Attempted cancellation `pkill -TERM -f '^bun --no-env-file conformance/harness/harness.ts$'` exited 3: `sysmon request failed with error: sysmond service not found; pkill: Cannot get process list`. No alternative cancellation or bypass was attempted. Its tool session was still reported running when this block was recorded.

Review: first pass recorded 21 findings, with all verified implementation defects addressed by the repair plan. The first Fidelity pair was counted with a nonblocking F-7 evidence gap, but its reviewed tree predates repairs. The repaired tree has not completed the second review or obtained current Fidelity status. It must not merge as completed work.

Resume: settle the stalled run and obtain a zero-difference full harness on the repaired tree, then set this spec to in-review and rerun all review layers and item Fidelity Review. The item remains in-progress and waits on the Maintainer; Story 14.5 remains for a later iteration.
