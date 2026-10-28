---
title: 'Runtime binder ArrayAccess union'
type: bugfix
created: '2026-10-27'
status: done
baseline_revision: be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/decisions/ESC-14.6-5.md'
  - '{project-root}/decisions/MAINT-2026-10-27-story-14-6-binder.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `bindPhpArguments` rejects an ArrayAccess object for `ArrayAccess|array` and drops the interface from its error declaration. This blocks six Arr Test IDs under ESC-14.6-5.

**Approach:** Extend the shared runtime userland binder to recognize its existing ArrayAccess identity and preserve PHP union diagnostic text. Compare the public binding surface against executed PHP 8.5.11 probes.

## Boundaries & Constraints

**Always:** Work as action item `epic-14-item-12-runtime-binder-arrayaccess-union`, scoped to `packages/runtime` plus its own implementation records. Preserve PHP object handles and array value copying. Validate every supplied argument before the body runs. Keep existing exports and scalar/default coercion behaviour; AD-1, AD-2, AD-6, AD-9, AD-10, AD-19, AD-23 and AD-26 apply. Use the existing ArrayAccess token, valueCopy and argumentTypeError. Obtain PHP evidence locally (installed PHP is 8.5.11).

**Never:** Edit grader files, Expectations, other components, divergences, action text/owner/epic, or protected instructions. Do not implement Arr accessors here or broaden to general nominal type binding.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Interface | ArrayObject or another branded ArrayAccess object | Accepted by the public binder, original object handle preserved | None |
| Arrays | JS list, plain associative object, PhpArray | Accepted, copying nested arrays as before | None |
| Invalid | null, int, float, bool, string, Closure or non-ArrayAccess object | Whole declaration remains ArrayAccess\|array in diagnostic | PHP TypeError before body execution |
| Later argument | Valid ArrayAccess input and an invalid supplied nullable scalar default, even when body would not use default | Body is never entered | PHP TypeError for later argument |
| Defaults and ordering | Omitted valid default, nullable union, and array\|ArrayAccess reordered declaration | PHP acceptance and canonical diagnostic order | PHP error text where invalid |

</intent-contract>

## Code Map

- `packages/runtime/src/php/userlandArguments.ts` — members/declaration/coerce shared by bindPhpArguments and phpReturn; declaration currently filters away unknown names. Existing map binds all arguments before return.
- `packages/runtime/src/php/ArrayAccess.ts` — runtime interface token built by phpInterface; use its existing instance check.
- `packages/runtime/src/php/valueCopy.ts` — copies arrays recursively and preserves object handles; reuse unchanged.
- `packages/runtime/src/php/phpArguments.ts` — argumentTypeError builds canonical userland diagnostics.
- `packages/runtime/tests/xaravel/php-arr-builtins-arguments.test.ts` and `.probe.php/.probe.txt` — existing binder matrix and scalar regression evidence; preserve.
- `packages/runtime/tests/xaravel/php-binder-arrayaccess.test.ts` and `.probe.php/.probe.txt` — new bounded public-surface differential evidence, unused XT-runtime-97 and XT-runtime-98 available.
- `decisions/MAINT-2026-10-27-story-14-6-binder.md` — read-only scope and acceptance authority; sprint status supplies action identity.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/userlandArguments.ts` — recognize ArrayAccess for parameter binding and retain canonical declaration text, preserving existing scalar semantics.
- `packages/runtime/tests/xaravel/php-binder-arrayaccess.probe.php` and `.probe.txt` — execute PHP functions with ArrayAccess unions; record observable identity, mutations, array copying, invalid inputs and unused invalid supplied defaults, with source-location suffixes normalized as in existing probes.
- `packages/runtime/tests/xaravel/php-binder-arrayaccess.test.ts` — test public bindPhpArguments against every evidence row and assert identity/copy/validation timing over all runtime array forms and a custom branded implementation. Tests must execute under the harness.

**Acceptance Criteria:**
- Given the matrix inputs, when public bindPhpArguments binds a PHP declaration, then its values, handle/copy semantics, diagnostic text and body execution agree with the executed PHP evidence.
- Given existing binder and runtime tests, when verification runs, then existing scalar and array behaviour still passes, the full harness reports no differences, and typecheck and lint pass.
- Given this item's final tree, when Fidelity Review runs with --item and --loop-cli codex, then status is current before merge.

## Spec Change Log

## Review Triage Log

### 2026-10-27 — Review pass
- verdicts: 10 findings — high 0, medium 3, low 4, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: case-insensitive interface spellings lack coverage — this item names exactly ArrayAccess|array; generalized declaration-name resolution is outside the approved bounded extension.
  - `[medium]` `[patch]` Blind: shared helpers also alter phpReturn — confirmed both callers; private parameter-only options now confine ArrayAccess acceptance and diagnostic inclusion to bindPhpArguments, leaving phpReturn on its original paths.
  - `[low]` `[reject]` Blind: standalone and nullable interface coverage — the approved declaration includes array; the tested nullable/reordered variants protect that union. General interface binding is outside this item.
  - `[low]` `[reject]` Blind: foreign branded arrays omitted from tests — AD-9's three runtime forms are explicitly exercised; foreign grader representations are an existing valueCopy interoperability path, not changed here. Adding a new fixture is unnecessary for this bounded fix.
  - `[low]` `[reject]` Blind: ArrayAccess|string conversion precedence lacks probes — the item is ArrayAccess|array, and scalar-interface declarations are excluded by its bounded scope.
  - `[medium]` `[patch]` Verification: return surface changed without verification — shared root cause with Blind return finding. Parameter-only internal flags remove the unapproved return change; existing scalar/array return evidence XT-runtime-95/96 still passes.
  - `[medium]` `[patch]` Intent: implementation extends phpReturn beyond argument-binding surface — same patch isolates the interface path; no public API added.
  - `[false]` `[reject]` Intent: pre-body timing is tested by calling binder before a marker — that is precisely the public binder boundary named by the action; its eager all-argument validation is asserted, and no invocation wrapper is requested.
  - `[false]` `[reject]` Intent: unused invalid default might mean invalid omitted declaration metadata — ESC-14.6-3's preserved evidence and actual Arr method signatures show valid null defaults with invalid supplied optional arguments. The probe exercises that concrete case; an invalid typed PHP default would fail declaration, outside this runtime call binder.
  - `[false]` `[reject]` Intent: general ArrayAccess parameter recognition is broader than exact union — all newly accepted declarations still use the same ArrayAccess interface recognition, with no general nominal resolver. Nullable and reordered union coverage is explicitly planned; the item preserves existing supported scalar declarations.
- Edge-case layer: zero findings. Fidelity: two pass verdicts before the parameter-only patch; refreshed below on the corrected tree.

## Verification

**Commands:**
- `php -d error_reporting=0 packages/runtime/tests/xaravel/php-binder-arrayaccess.probe.php` — exact recorded probe output on PHP 8.5.11.
- `bun run harness --xaravel --id 'XT-runtime-*'` — all runtime cases pass, including the matrix and existing binder tests.
- `bun run harness` — no differences; unavailable backends may be NOT-RUN.
- `bun run typecheck` — success.
- `bun run lint` — success.
- `bun run fidelity:review review --item epic-14-item-12-runtime-binder-arrayaccess-union --spec _bmad-output/implementation-artifacts/spec-retro-14-runtime-binder-arrayaccess-union.md --loop-cli codex` — two counted passing verdicts; status current.

## Fidelity Review

### Reviewer 1: pass at tree a482ad84caf275100d9fa52558bd7be7426b41db

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931`, on 2026-10-28T00:16:53.876Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests and assigns no Upstream test IDs. |
| F-2: No expected value is weakened | pass | The new tests compare complete serialized PHP probe results, including exact exception names and messages. No existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the supplied PHP probe output is separate evidence. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-97 checks every supplied PHP evidence row exactly. XT-runtime-98 checks handle identity, mutation visibility and nested array copying across list, map and PhpArray forms for each tested union. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes stay within the authorized runtime component. Binding uses its existing ArrayAccess contract and value-copy implementation without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed source contains no asyncRoot tags. Its binding and return-coercion functions are synchronous and neither perform IO nor invoke asynchronous callbacks. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a482ad84caf275100d9fa52558bd7be7426b41db","base":"be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T00:16:53.876Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests and assigns no Upstream test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare complete serialized PHP probe results, including exact exception names and messages. No existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the supplied PHP probe output is separate evidence.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-97 checks every supplied PHP evidence row exactly. XT-runtime-98 checks handle identity, mutation visibility and nested array copying across list, map and PhpArray forms for each tested union.","findings":[]},{"id":"F-8","result":"pass","note":"All changes stay within the authorized runtime component. Binding uses its existing ArrayAccess contract and value-copy implementation without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed source contains no asyncRoot tags. Its binding and return-coercion functions are synchronous and neither perform IO nor invoke asynchronous callbacks.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree a482ad84caf275100d9fa52558bd7be7426b41db

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931`, on 2026-10-28T00:16:53.876Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests or assigned Upstream test IDs. |
| F-2: No expected value is weakened | pass | The added tests compare complete serialized PHP evidence rows, including exact exception messages; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the PHP probe output is separate evidence. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-97 checks every supplied PHP evidence row exactly. XT-runtime-98 checks object identity, mutations through handles, nested array copying and validation before body entry across the declared unions. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the authorized runtime component. The binder uses its existing ArrayAccess contract and array-copy implementation without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed source file contains synchronous coercion and binding helpers, no async roots and no async-capable callback APIs requiring tags under AD-6 or DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a482ad84caf275100d9fa52558bd7be7426b41db","base":"be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T00:16:53.876Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests or assigned Upstream test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests compare complete serialized PHP evidence rows, including exact exception messages; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the PHP probe output is separate evidence.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-97 checks every supplied PHP evidence row exactly. XT-runtime-98 checks object identity, mutations through handles, nested array copying and validation before body entry across the declared unions.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the authorized runtime component. The binder uses its existing ArrayAccess contract and array-copy implementation without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed source file contains synchronous coercion and binding helpers, no async roots and no async-capable callback APIs requiring tags under AD-6 or DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 07670bc4f2c1fe7a4caeee310398add6de7c0a93

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931`, on 2026-10-28T00:19:00.061Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item adds no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The new tests compare complete serialized PHP probe results and exact exception messages; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle error fixtures; the local PHP probe transcript is not a committed Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-97 compares every PHP probe row exactly. XT-runtime-98 checks object identity, shared mutations, nested array copies across the three runtime array forms, and validation before body entry. These checks match their consequence strings. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to runtime, the item's listed component. The binder uses the existing ArrayAccess contract and value-copy implementation without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed source contains no asyncRoot tags, IO operations, or async callback APIs. Its synchronous declarations agree with AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"07670bc4f2c1fe7a4caeee310398add6de7c0a93","base":"be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T00:19:00.061Z","items":[{"id":"F-1","result":"n/a","note":"The item adds no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare complete serialized PHP probe results and exact exception messages; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle error fixtures; the local PHP probe transcript is not a committed Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-97 compares every PHP probe row exactly. XT-runtime-98 checks object identity, shared mutations, nested array copies across the three runtime array forms, and validation before body entry. These checks match their consequence strings.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to runtime, the item's listed component. The binder uses the existing ArrayAccess contract and value-copy implementation without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed source contains no asyncRoot tags, IO operations, or async callback APIs. Its synchronous declarations agree with AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 07670bc4f2c1fe7a4caeee310398add6de7c0a93

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931`, on 2026-10-28T00:19:00.061Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests; no Inventory assertion mapping applies. |
| F-2: No expected value is weakened | pass | The new tests compare exact serialized PHP probe results, including full exception classes and messages. No existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the PHP probe transcript is separate evidence. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-97 checks every PHP probe row exactly. XT-runtime-98 checks handle identity, mutation sharing, nested array copying across the three runtime array representations, and validation before body entry. Both bodies support their consequence strings. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes remain within the authorized runtime component. Binding uses the existing ArrayAccess token and valueCopy implementation without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed source contains no async methods or asyncRoot tags. Its synchronous binding and return coercion perform no IO and accept no async callbacks requiring tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"07670bc4f2c1fe7a4caeee310398add6de7c0a93","base":"be23eccd8acdcd1b112a0d6c6f4ec4b8d0ecc931","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T00:19:00.061Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests; no Inventory assertion mapping applies.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact serialized PHP probe results, including full exception classes and messages. No existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the PHP probe transcript is separate evidence.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-97 checks every PHP probe row exactly. XT-runtime-98 checks handle identity, mutation sharing, nested array copying across the three runtime array representations, and validation before body entry. Both bodies support their consequence strings.","findings":[]},{"id":"F-8","result":"pass","note":"All changes remain within the authorized runtime component. Binding uses the existing ArrayAccess token and valueCopy implementation without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed source contains no async methods or asyncRoot tags. Its synchronous binding and return coercion perform no IO and accept no async callbacks requiring tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```


## Auto Run Result

Status: done.

Implemented the approved parameter binder extension for ArrayAccess|array, preserving object handles, nested array copies and full PHP union diagnostics. Private parameter-only flags preserve the existing phpReturn behaviour.

Files: userlandArguments.ts supplies the bounded extension; php-binder-arrayaccess.test.ts adds XT-runtime-97/98; php-binder-arrayaccess.probe.php and .probe.txt supply 36 executed PHP 8.5.11 evidence rows. No grader, Expectations or other component changes.

All four adversarial layers completed. Ten descriptive/gap findings were triaged individually: one medium patch group (three reports of the shared-helper return-scope issue), zero deferrals, seven rejections with reasons above. Final Fidelity recorded two passes at tree 07670bc4f2c1fe7a4caeee310398add6de7c0a93. Reviewer 1 used the documented Codex fallback because configured Claude was unavailable. No evidence gaps noted.

Follow-up review recommended: false (one medium patch group; zero high patches). No unresolved implementation risk within the bounded approved declaration.

Verification: exact PHP 8.5.11 probe comparison; runtime harness 96/96; focused binder tests XT-runtime-95..98 4/4; typecheck and lint pass. A sandbox full harness stalled and was terminated; the authorized escalated foreground run completed with XARAVEL tests=458 passed=453 failed=0 skipped=5 and SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0. Seven unavailable backend Variants were NOT-RUN. Fidelity status reports current with two pass verdicts. The runtime extension is complete; Story 14.6 resumes separately.
