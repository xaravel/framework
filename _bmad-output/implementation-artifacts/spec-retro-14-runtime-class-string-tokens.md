---
title: 'Runtime contract tokens remain PHP class strings'
type: bugfix
created: '2026-10-28'
status: done
baseline_revision: 013390e44f123d5c1e976ee89cb7c1104d8d2f05
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-27-story-14-6-third.md
  - decisions/ESC-14.6-6.md
  - AGENTS.md
  - _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Contract tokens represent PHP class-name strings but shared classification reads them as arrays, so copying loses their identity and corrupts typed-accessor defaults.

**Approach:** Apply the runtime's existing contract-token predicate in shared PHP classification and preserve class strings through copying, argument binding and return normalization, as ESC-14.6-6 rules.

## Boundaries & Constraints

**Always:** Limit implementation and tests to packages/runtime; keep existing exports and PHP 8.5.11 behaviour, AD-9 and AD-10. Verify against PHP direct, selected, nested and default class strings. Keep valueCopy's token identity; declarations of string normalize to the FQCN string. Read applicable spine ADs before edits.

**Never:** Change packages/assert, class-constructor behaviour, grader data, unrelated runtime behaviour, dependencies, or action-item scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Direct token | Runtime Stringable token | valueCopy returns same token; phpType/gettype/getDebugType string; is_array false | None |
| Selected and nested | Token selected from, or nested in, any PHP array form | Container copied independently, token identity preserved recursively | None |
| Typed parameter / return | Direct or selected token declared string | FQCN string returned by binder and phpReturn | None |
| Default | Token or array containing token as parameter default | String default normalized; nested token preserved in copied array | None |
| Invalid array declaration | Token supplied to array parameter or returned as array | Rejected as string, not accepted as array | PHP TypeError names string |
| Regression | Ordinary arrays, objects, scalars and class constructors | Existing semantics unchanged | Existing errors unchanged |

</intent-contract>

## Code Map

- `packages/runtime/src/php/phpType.ts` — shared classification, type names, gettype/getDebugType; imports registry without PHP throwable cycle.
- `packages/runtime/src/php/valueCopy.ts` — recursive copies consult phpType before copying plain objects.
- `packages/runtime/src/php/userlandArguments.ts` — binder and phpReturn normalize scalar class strings then valueCopy arrays.
- `packages/runtime/src/registry/registry.ts` — authoritative isContractToken and fqcn.
- `packages/runtime/src/php/typeTests.ts` — is_string/stringOf and is_array consumers.
- `packages/runtime/tests/xaravel/php-arr-builtins-arguments.test.ts` — existing binder test patterns.
- `decisions/ESC-14.6-6.md` and `decisions/MAINT-2026-10-27-story-14-6-third.md` — read-only intent evidence.

## Tasks & Acceptance

**Execution:**
- [x] `packages/runtime/src/php/phpType.ts` — classify tokens as strings using the existing predicate.
- [x] `packages/runtime/src/php/casts.ts` — normalize contract tokens in string branches exposed by shared classification, preserving class constructors and other values.
- [x] `packages/runtime/src/php/valueCopy.ts`, `packages/runtime/src/php/userlandArguments.ts` — verify shared fix covers all paths; change only if required by matrix.
- [x] `packages/runtime/tests/xaravel/` — add XT-runtime regression cases and a PHP probe with recorded results covering every matrix row.

**Acceptance Criteria:**
- Given any runtime contract token, when passed through copying, shared classification or a typed method boundary, then its behaviour matches the matrix and the PHP probe.
- Given the existing runtime, when full harness, typecheck and lint run, then no new failures occur.
- Given the action item and completed implementation, when Fidelity Review runs with --item epic-14-item-13-runtime-class-string-tokens --loop-cli codex, then status is current before merge.

- [x] `packages/runtime/src/php/{arithmetic,identical,looseEquals,phpArguments,throwableArguments}.ts` — normalize token operands in string paths exposed by classification; pin comparisons, exception constructors and numeric errors against PHP.

- [x] `packages/runtime/src/php/arrayFunctions.ts` — normalize array_flip token keys exposed by classification.
- [x] `packages/runtime/tests/xaravel/php-type-tests.test.ts` — update stale token gettype assertion under ESC-14.6-6.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 11 findings — high 0, medium 3, low 3, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: array_flip sends a token object to key normalization — confirmed; normalize the string branch with existing toPhpString, PHP-probed flip case passes.
  - `[low]` `[patch]` Blind: namespaced token not tested — added TokenProbe\Named PHP/runtime cases, preserving full FQCN.
  - `[low]` `[patch]` Blind: defaults lack all array representations — added independent repeated defaults with identity checks for list, map, PhpArray, null-prototype and branded forms.
  - `[low]` `[patch]` Blind: distinct/reversed comparisons missing — added PHP-probed different token/string and recursive strict comparison cases.
  - `[medium]` `[patch]` Blind: numberOrStringParameter lacks coverage — added PHP-probed range start/end token cases.
  - `[medium]` `[patch]` Verification: range token-bound regression untested — same fix as blind's parser coverage finding; both bounds now execute.
  - `[false]` `[reject]` Intent: PHP output cannot prove token identity — XT-runtime-100 directly uses JavaScript identity for copies; the probe supplies observable PHP outcomes.
  - `[false]` `[reject]` Intent: encoded/assertSame comparison does not prove raw string normalization — coverage limitation confirmed and corrected with typeof and JavaScript === at supplied, selected, return and default boundaries; implementation already normalized correctly.
  - `[false]` `[reject]` Intent: consumer changes exceed narrowly named surfaces — the shared classification exposes consumers' JS-string assumptions; these changes only normalize contract tokens, required by the broader explicit PHP class-string behaviour, without changing constructors or ordinary values.
  - `[false]` `[reject]` Intent: PHP native arrays cannot distinguish runtime array forms — XT-runtime-100 separately checks every AD-9 representation; no observable contract gap.
  - `[false]` `[reject]` Intent: diff does not prove landing order — orchestrator performs one item this iteration and does not resume Story 14.6; order is enforced outside package tests.

Edge review returned no findings. Fidelity reviewers both passed the initial tree; final review must bind the repaired tree. The implementation agent hit model capacity twice; parent completed the small review repairs. Full harness exposed XT-runtime-62's old gettype(token)=array expectation; only that stale runtime assertion is updated to the Maintainer-ruled string result. Five infrastructure test failures passed directly; full rerun follows.


## Verification

- Focused harness run selecting the new XT-runtime cases — all run and pass.
- `bun run harness` — no differences (unavailable backend variants may be NOT-RUN).
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- PHP probe — execute with available pinned PHP environment and record exact output/version.

## Fidelity Review

### Reviewer 1: pass at tree eefee65dffeb15d31c47b0cf2d3916a18a5d4e12

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `013390e44f123d5c1e976ee89cb7c1104d8d2f05`, on 2026-10-28T07:18:29.250Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds Xaravel Tests but assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The new tests compare exact PHP probe outputs, including complete exception classes and messages; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the local PHP probe output is not an Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-99 checks classification and typed boundaries against the supplied PHP probe results. XT-runtime-100 checks token identity across all listed array representations, copying and typed boundaries. Neither cites consequence bullet IDs. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes remain in runtime and implement its shared PHP string classification and coercion behavior; no other Component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files contain no asyncRoot tags. Their declarations and bodies remain synchronous and introduce no IO or async callback boundary requiring a tag under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"eefee65dffeb15d31c47b0cf2d3916a18a5d4e12","base":"013390e44f123d5c1e976ee89cb7c1104d8d2f05","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T07:18:29.250Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds Xaravel Tests but assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact PHP probe outputs, including complete exception classes and messages; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the local PHP probe output is not an Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-99 checks classification and typed boundaries against the supplied PHP probe results. XT-runtime-100 checks token identity across all listed array representations, copying and typed boundaries. Neither cites consequence bullet IDs.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes remain in runtime and implement its shared PHP string classification and coercion behavior; no other Component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files contain no asyncRoot tags. Their declarations and bodies remain synchronous and introduce no IO or async callback boundary requiring a tag under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree eefee65dffeb15d31c47b0cf2d3916a18a5d4e12

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `013390e44f123d5c1e976ee89cb7c1104d8d2f05`, on 2026-10-28T07:18:29.250Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests and assigns no Upstream Test IDs. |
| F-2: No expected value is weakened | pass | The new tests compare exact PHP probe outputs, including complete exception classes and messages; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; its local PHP probe outputs are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-99 checks classification and typed boundaries against the supplied PHP probe results. XT-runtime-100 checks token identity across all listed array forms, copying and typed boundaries. Both bodies support their consequence strings. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation files belong to the authorized runtime component. Token normalization uses the shared Registry predicate and FQCN lookup, without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files contain no asyncRoot tags. Their declarations and bodies perform synchronous classification, coercion and comparison, requiring no async tag under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"eefee65dffeb15d31c47b0cf2d3916a18a5d4e12","base":"013390e44f123d5c1e976ee89cb7c1104d8d2f05","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T07:18:29.250Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests and assigns no Upstream Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact PHP probe outputs, including complete exception classes and messages; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; its local PHP probe outputs are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-99 checks classification and typed boundaries against the supplied PHP probe results. XT-runtime-100 checks token identity across all listed array forms, copying and typed boundaries. Both bodies support their consequence strings.","findings":[]},{"id":"F-8","result":"pass","note":"All changed implementation files belong to the authorized runtime component. Token normalization uses the shared Registry predicate and FQCN lookup, without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files contain no asyncRoot tags. Their declarations and bodies perform synchronous classification, coercion and comparison, requiring no async tag under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Matrix test audit

XT-runtime-99 executes 22 PHP probe rows, including direct, selected, nested/default, typed and invalid-array cases, plus token consumer regressions. XT-runtime-100 independently verifies token identity, container independence, raw string normalization and class-constructor regression across all AD-9 forms. XT-runtime-62 pins the shared gettype consumer. Focused run: 3 passed, 0 failed; PHP 8.5.11 output matches committed rows.

### Reviewer 1: pass at tree 8c33e38dfd670134ab55f3f78b6f5c6a18108463

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `013390e44f123d5c1e976ee89cb7c1104d8d2f05`, on 2026-10-28T07:24:04.923Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The new tests retain exact PHP probe values and exception messages. XT-runtime-62 changes gettype(Traversable) from array to string as ESC-14.6-6 explicitly requires; the comparison remains exact. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are affected, and the changed Xaravel Test retains its assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this item. PHP probe error messages are ordinary recorded test values. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-99 compares classification and typed boundaries against the supplied PHP probe. XT-runtime-100 checks token identity and copying across all listed array representations and typed boundaries. XT-runtime-62 checks its declared type tests and instanceof behavior. Their bodies support their consequences. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation and test paths are within packages/runtime, matching the approved runtime scope. The changes implement shared runtime token semantics without adding another Component's stub or workaround. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete changed source files and declaration inventory with AD-6 and DIV-1. They contain synchronous computation and synchronous builtin callbacks, with no async roots or missing required tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"8c33e38dfd670134ab55f3f78b6f5c6a18108463","base":"013390e44f123d5c1e976ee89cb7c1104d8d2f05","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T07:24:04.923Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests retain exact PHP probe values and exception messages. XT-runtime-62 changes gettype(Traversable) from array to string as ESC-14.6-6 explicitly requires; the comparison remains exact.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are affected, and the changed Xaravel Test retains its assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this item. PHP probe error messages are ordinary recorded test values.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-99 compares classification and typed boundaries against the supplied PHP probe. XT-runtime-100 checks token identity and copying across all listed array representations and typed boundaries. XT-runtime-62 checks its declared type tests and instanceof behavior. Their bodies support their consequences.","findings":[]},{"id":"F-8","result":"pass","note":"All changed implementation and test paths are within packages/runtime, matching the approved runtime scope. The changes implement shared runtime token semantics without adding another Component's stub or workaround.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete changed source files and declaration inventory with AD-6 and DIV-1. They contain synchronous computation and synchronous builtin callbacks, with no async roots or missing required tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 8c33e38dfd670134ab55f3f78b6f5c6a18108463

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `013390e44f123d5c1e976ee89cb7c1104d8d2f05`, on 2026-10-28T07:24:04.923Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests and changes none; there are no Upstream assertion sequences to compare. |
| F-2: No expected value is weakened | pass | The changed gettype expectation remains exact and matches ESC-14.6-6's required string classification. New probe comparisons retain exact values and exception messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed; the existing Xaravel Test assertion is retained with the approved corrected value. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines are set to skip, so no new reason or precedence requires review. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No relied-on Oracle fixture has output.error; the PHP probe's recorded exception strings are ordinary expected test data. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-99 compares classification, copies, boundaries and related operations with the supplied PHP probe. XT-runtime-100 directly checks token identity and string normalization across array forms. XT-runtime-62 retains checks supporting its declared consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes are runtime PHP value semantics within the authorized runtime scope. No other Component's behaviour is stubbed, faked or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source declarations are synchronous, perform no IO and require no async callbacks under AD-6 and DIV-1. Their absence of asyncRoot tags is appropriate. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes, so there are no changed Oracle inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"8c33e38dfd670134ab55f3f78b6f5c6a18108463","base":"013390e44f123d5c1e976ee89cb7c1104d8d2f05","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T07:24:04.923Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests and changes none; there are no Upstream assertion sequences to compare.","findings":[]},{"id":"F-2","result":"pass","note":"The changed gettype expectation remains exact and matches ESC-14.6-6's required string classification. New probe comparisons retain exact values and exception messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed; the existing Xaravel Test assertion is retained with the approved corrected value.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines are set to skip, so no new reason or precedence requires review.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"No relied-on Oracle fixture has output.error; the PHP probe's recorded exception strings are ordinary expected test data.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-99 compares classification, copies, boundaries and related operations with the supplied PHP probe. XT-runtime-100 directly checks token identity and string normalization across array forms. XT-runtime-62 retains checks supporting its declared consequence.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes are runtime PHP value semantics within the authorized runtime scope. No other Component's behaviour is stubbed, faked or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source declarations are synchronous, perform no IO and require no async callbacks under AD-6 and DIV-1. Their absence of asyncRoot tags is appropriate.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes, so there are no changed Oracle inputs to compare.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done.

Implemented shared PHP string classification for contract tokens. Recursive copying now preserves token identity without modifying valueCopy or the binder. Token-aware normalization in casts, comparisons, arithmetic, builtin/throwable arguments and array_flip prevents the classification change from passing JS token objects into string consumers. Ordinary values and class constructors retain their paths.

Files changed: eight runtime source consumers; php-class-string-tokens test/probe/output (22 PHP rows, XT-runtime-99/100); the stale XT-runtime-62 token gettype expectation; this spec and action-item completion in sprint status.

Review: four general layers completed. Six patch findings (two medium parser findings share one repair; one medium array_flip finding; three low coverage improvements), five descriptive intent observations rejected with evidence above. No deferred findings. Raw string assertions were added proactively from the auditor's observation. No unverified residual risk identified; follow-up review recommendation false.

Verification: focused XT-runtime-62/99/100 passed; PHP 8.5.11 probe output matches exactly; typecheck and lint passed. Full harness rerun passed: checked=21817 differ=0, Xaravel passed=455 failed=0 skipped=5; seven unavailable backend Variants NOT-RUN. Initial infrastructure failures passed directly and on full rerun. Final Fidelity Review: two passes, current at tree 8c33e38dfd670134ab55f3f78b6f5c6a18108463. Reviewer 1 used Codex because Claude was unavailable; tool records the fallback. Story 14.6 and runtime offset-reference item 14 remain for later iterations.
