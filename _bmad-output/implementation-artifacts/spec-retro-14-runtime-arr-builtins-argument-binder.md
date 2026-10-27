---
title: 'Runtime Arr builtins and userland argument binder'
type: feature
created: '2026-10-27'
status: done
review_loop_iteration: 3
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-27-story-14-6.md
  - decisions/ESC-14.6-1.md
  - decisions/ESC-14.6-3.md
  - conformance/escalations/ESC-14.6-3.md
  - _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md
warnings: [oversized]
deferred:
  - summary: >-
      Fidelity F-7 prompt omits unchanged set-function PHP probe computations and output rows consumed by XT-runtime-83/85.
    evidence: |-
      Both files exist in packages/runtime/tests/xaravel, and all rows were regenerated and compared locally. The final reviewers see only changed resolver rows because the complete files exceed prompt limits. The standing MAINT-2026-10-24-evidence-gaps ruling counts these missing-evidence-only verdicts; retain for Epic 14 retrospective and Maintainer inbox.
    location: >-
      packages/runtime/tests/xaravel/php-set-functions.probe.txt
    severity: medium (unverified)
baseline_revision: 632377fab9641cfb0026da47fd519eaec51e732a
---

<intent-contract>

## Intent

**Problem:** Story 14.6 cannot faithfully port Arr helpers without shared PHP builtins and a reusable coercive userland argument binder. Action item `epic-14-item-11-runtime-arr-builtins-argument-binder` supplies these before the Story resumes.

**Approach:** Export array_is_list, array_push over Ref, http_build_query and its encoding constants from @xaravel/runtime/php, add Randomizer.shuffleArray, and publish a reusable PHP userland argument-binding seam with normalized scalar returns. Compare their behavior with PHP 8.5.11.

## Boundaries & Constraints

**Always:** Scope is packages/runtime plus this item's implementation records. Preserve existing exports and behavior. Follow AD-2, AD-4, AD-5, AD-9, AD-10, AD-19, AD-23 and AD-26. Reuse runtime array, scalar, Ref and float primitives. The binder supports array, string, bool, int, float, nullable defaults and union types, validates every supplied argument before the method runs, throws PHP TypeError, and normalizes int, float and class-string returns. PHP 8.5.11 settles behavior.

**Never:** Change another package, grader, Expectations, divergence, instruction file, action/owner/epic or Story 14.6. Do not conflate internal builtin null coercion with userland parameter typing. Do not require random permutations to match a PHP seed when no engine is ported.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lists | Empty, sequential, sparse, mixed-key arrays in AD-9 forms | PHP array_is_list result; order matters | PHP TypeError for non-array |
| Push | Ref array with existing/deleted/high integer keys, zero or multiple new values | PHP next integer key and returned count; original ref mutated | PHP overflow and invalid array errors |
| Query | Nested arrays/objects, numeric prefix, custom separator, nulls, booleans, Unicode, both encodings | PHP http_build_query bytes; public object properties and nested key behavior | PHP argument errors, recursive structures handled as PHP |
| Shuffle | Empty, singleton, associative, duplicate values | Reindexed permutation without input mutation | PHP TypeError for invalid array |
| Bind | Required and optional/nullable array/scalar/union parameters, numeric/stringable/class-string values | PHP coercion and union preference, all inputs validated before body, defaults respected | PHP userland TypeError for null/noncoercible input, including unused defaults |
| Return | int/bigint, integral/nonintegral float, string/class-string return | PHP-normalized runtime scalar representations | PHP return-type errors for rejected values |

</intent-contract>

## Code Map

- `packages/runtime/src/php/phpArguments.ts` — existing internal builtin parameter coercion; retain its semantics and reuse primitives for userland binding.
- `packages/runtime/src/php/throwableArguments.ts`, `phpType.ts`, `numericString.ts`, `float.ts` — coercion, classification, numeric parsing and float representation.
- `packages/runtime/src/php/arrayRefFunctions.ts`, `PhpArray.ts`, `casts.ts`, `Ref.ts` — array next-key history, array forms and ref mutation.
- `packages/runtime/src/php/Randomizer.ts` — secure engine and randomBelow rejection sampling; add shuffleArray here, retain registration.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/php/phpFunctions.ts` — public exports and PHP named callable map.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.test.ts` and matching probe files — established executable PHP evidence and Xaravel test conventions.
- `conformance/escalations/ESC-14.6-3.md` — read-only concrete consumer regressions and binder requirements.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/` — implement builtin additions and reusable userland binder; export and register global PHP functions through existing maps. Publish only bindPhpArguments and phpReturn as explicit seams; no bindPhpMethod wrapper or named-dispatch metadata. Document an example that binds all arguments before executing body logic and applies phpReturn to its result. Builtins with multiple optional parameters accept AD-26 camelCase options form. Apply all review-pass-1 KEEP and repair instructions in the Spec Change Log.
- `packages/runtime/tests/xaravel/` — add meaningful XT-runtime tests and executable PHP 8.5.11 probe with captured results; cover each matrix row, every bound type/union/null/default, pre-body validation and normalized returns. Preserve existing tests.

**Acceptance Criteria:**
- Given imports from @xaravel/runtime/php, when the new builtins are called directly and as supported PHP named callables, then their results and errors match PHP evidence for the matrix.
- Given a method bound through the public seam, when inputs or unused defaults are invalid, then it throws before body execution with PHP's method/parameter/type message.
- Given nullable defaults, numeric unions, bigint/float and class-string values, when parameters and returns are bound, then values match PHP semantics without lossy integer conversion or float identity loss.
- Given the secure Randomizer, when shuffleArray runs, then it returns a list permutation, preserves multiplicity and leaves input unchanged.
- Given the completed implementation, when full verification and item Fidelity Review run, then no harness differences, type errors or lint failures remain and fidelity status is current.

## Spec Change Log

### 2026-10-27 — Review pass 1 plan repair
Review found an unnecessary bindPhpMethod wrapper that invents ambiguous named-argument dispatch, plus coercion/error and verification gaps. Re-derive with only bindPhpArguments and phpReturn as public explicit seams; consumers validate before entering their body and apply phpReturn themselves. No wrapper or options protocol on the binder. Preserve builtin API/options (camelCase), every existing baseline assertion, probe comparison, class/token/stringable normalization and bigint/float tests. Rewrite new wrapper-based test invocations to exercise the same assertions through explicit binding and return calls. Normalize safe bigint via intKey; propagate separator conversion exceptions; PHP-backed count diagnostics. Add controlled secure draws including rejection sampling; partial push-overflow state; independently observed binding and return/default PHP rows. KEEP array key history, value separation, query encoding/recursion, named callable registrations, documentation and all working behavior. Pass-1 implementation is preserved for reference at /Users/ea/.xaravel-orchestrator/tmp/arr-builtins-pass1.diff.

Verification integration repair: full pass-1 harness exited 1 with XT-runtime-37 (README missing new docs link), XT-runtime-84/85 (resolver.reflection snapshots stale for new global functions); 21,817 comparisons and 3 differences. Add README link and regenerate runtime PHP probe reflection rows, preserving every existing assertion.

## Review Triage Log

### 2026-10-27 — Review pass 1
- verdicts: 19 findings — high 0, medium 12, low 2, false 5, maybe-false 0
- findings:
  - `[medium]` `[bad_spec]` Blind: null-prototype named options rejected — callUnpacked creates null-prototype objects; remove the unnecessary method wrapper and expose explicit binding/return seams.
  - `[medium]` `[bad_spec]` Blind: mixed positional/options calls rejected — wrapper condition only accepts options before optional positionals; remove wrapper, retain explicit argument-list API.
  - `[medium]` `[bad_spec]` Blind: unknown/overwriting named options ignored — wrapper never validates option names; remove wrapper rather than invent another named dispatch API.
  - `[medium]` `[bad_spec]` Blind: associative array defaults mistaken for options — demonstrated plain-object branch conflicts with AD-9 arrays; explicit binding avoids ambiguity.
  - `[medium]` `[bad_spec]` Blind: safe bigint exact matches not normalized — coerce returns exact integer unchanged; require intKey normalization at input and return stages.
  - `[medium]` `[bad_spec]` Blind: separator exceptions replaced — catch catches application exceptions too; reuse toStringArgument and emit rejection diagnostic only on null result.
  - `[low]` `[bad_spec]` Blind: missing required-only diagnostic says at least — require exactly for required-only signatures, with PHP evidence.
  - `[medium]` `[bad_spec]` Edge: null-prototype options rejected — same wrapper defect verified from callUnpacked; explicit API removes wrapper integration claim.
  - `[medium]` `[bad_spec]` Edge: separator conversion exception replaced — same broad catch verified; preserve conversion exceptions.
  - `[low]` `[bad_spec]` Edge: required-only argument count message differs — same diagnostic; add PHP-backed count case.
  - `[medium]` `[bad_spec]` Verification: partial mutation before later push overflow unverified — existing tests only overflow on first insert; add probe that observes retained first insertion.
  - `[false]` `[reject]` Intent: existing binder versus adapter — existing phpArguments contains builtin coercion primitives, not a userland binder; explicit reusable userland seam reusing them satisfies approved behavior without changing existing exports.
  - `[false]` `[reject]` Intent: method dispatch versus callback surface — approval requests a reusable seam and no reflection or dispatch metadata integration; explicit bindPhpArguments before a method body exercises the authorized seam.
  - `[medium]` `[bad_spec]` Intent: broad runtime-only argument assertions lack PHP rows — add PHP comparisons for each supported type/default/return, independently from binding, preserving assertions.
  - `[false]` `[reject]` Intent: combined parameter/return observation — existing runtime-only phpReturn assertions independently observe normalization; add more direct evidence under preceding verification amendment.
  - `[false]` `[reject]` Intent: shuffle exact outcomes versus invariants — secure engine seeds are explicitly outside scope; deterministic random-source coverage addresses actual missing behavior without matching a PHP seed.
  - `[false]` `[reject]` Intent: preservation and sequencing outside diff — full harness and retaining Story 14.6 unchanged verify these delivery requirements; no contrary change identified.
  - `[medium]` `[bad_spec]` Fidelity reviewer 1 F-7: identity shuffle passes consequence — add controlled crypto.getRandomValues draws with restoration and rejection sampling, retaining all existing assertions and consequence text.
  - `[medium]` `[bad_spec]` Fidelity reviewer 2 F-7: identity shuffle passes consequence — same controlled-source test; never narrow the grader consequence.

### 2026-10-27 — Review pass 2
- verdicts: 21 findings — high 0, medium 14, low 1, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: phpReturn array alias — return omitted valueCopy; apply existing separation primitive and nested mutation assertion.
  - `[medium]` `[patch]` Blind: defaults before required parameters — PHP probe confirms those are required, with exactly/at-least based on last required position; calculate effective count accordingly.
  - `[medium]` `[patch]` Blind: quadratic push — whole-array materialization inside each iteration verified; commit accumulated copy once in finally, retaining partial overflow state.
  - `[low]` `[reject]` Blind: unsupported declaration strings — documented API accepts the listed PHP declarations only; runtime descriptor validation adds branches for programmer input outside that documented set and is unlikely in ordinary use. No promised valid declaration shown failing.
  - `[medium]` `[patch]` Blind: weak union evidence — add PHP-backed string/bool/array, nullable and reordered union cases.
  - `[medium]` `[patch]` Blind: numeric boundary evidence — add independent parameter/return PHP cases at int64 boundaries, overflow, NaN/INF and negative zero.
  - `[medium]` `[patch]` Blind: non-null defaults — add scalar/default normalization and repeated mutable-default separation cases.
  - `[medium]` `[patch]` Blind: declared property table evidence — add inherited visibility fixture through objectProps protocol.
  - `[medium]` `[patch]` Blind: options combinations — add camelCase prefix/separator/encoding, null-prototype/null/invalid/conversion-error cases.
  - `[medium]` `[patch]` Blind: array list representations — add sparse/deleted native arrays and normalized bigint/numeric-string keys.
  - `[medium]` `[patch]` Edge: query class strings — constructors classify as objects and token internals as arrays; normalize class-string values before root/nested query classification.
  - `[medium]` `[patch]` Edge: rejected class-string diagnostic — existing error helper reads constructor as Closure and token as array; normalize diagnostic values at parameter and return seams.
  - `[medium]` `[patch]` Edge: returned array alias — same missing valueCopy; existing primitive and nested mutation regression.
  - `[medium]` `[patch]` Verification: bound array copy unverified — preserve copy and add successful nested mutation test, original caller value unchanged.
  - `[false]` `[reject]` Intent: extra arguments ignored — PHP userland accepts extra positionals, so validating declared positions is correct.
  - `[medium]` `[patch]` Intent: union evidence narrower than implementation — same PHP union coverage addition; no new API.
  - `[false]` `[reject]` Intent: class/float representations runtime-only — AD-9 defines these representations; PHP has no JS token or float-marker object; runtime assertions are the relevant adaptation check.
  - `[false]` `[reject]` Intent: shuffle secure draws versus PHP seed — intent excludes matching a nonported engine seed; both PHP boundary cases and controlled secure-source tests pass.
  - `[false]` `[reject]` Intent: preservation/sequencing — baseline exports retained, Story untouched, full verification and merge sequencing handle delivery; no contradictory change identified.
  - `[false]` `[reject]` Intent: implementation records outside packages/runtime — standing amendment explicitly authorizes own records; no other scope edited.
  - `[false]` `[reject]` Intent: diff does not prove fresh execution — root executed both probes against installed PHP 8.5.11 and all seven focused tests; final full verification remains required.

Fidelity pass 2: both reviewers passed tree `95a27bc16fd408832a07fc3f06982d7bc1b5f231`, reviewer 1 recorded Claude unavailable and Codex fallback. Recheck required after patches.

### 2026-10-27 — Patch verification and Fidelity rechecks
All 12 grouped medium patch entries from pass 2 are repaired, preserving every assertion. Added 186 PHP binder observations, 32 builtin observations, inherited-property-table tests, non-null/mutable defaults, reordered unions, numeric boundaries/NaN/INF/negative zero, class strings, array separation, query options and native-hole/PhpArray key-gap cases. Corrected test fixtures to AD-9's sparse-key PhpArray representation and valid TypeScript property metadata; sparse native holes remain tested as normalized null values. Documentation and focused checks pass. Lint fixture syntax corrected without suppressions or assertion changes.

### 2026-10-27 — Review pass 3
- verdicts: 1 finding — high 0, medium 0, low 0, false 0, maybe-false 1
- findings:
  - `[maybe-false]` `[defer]` Fidelity reviewer 2 F-7 at tree `4217612fe7f76803051dcbce71bce6bc042a6112` — complete unchanged set-function probes omitted from prompt. Repository files exist; live PHP probe and XT-runtime-83/85 pass. Full prompt evidence would settle the reviewer gap; standing evidence-gap rule counts verdict.

### 2026-10-27 — Review pass 4 (finalize recheck)
- verdicts: 2 findings — high 0, medium 0, low 0, false 0, maybe-false 2
- findings:
  - `[maybe-false]` `[defer]` Fidelity reviewer 1 F-7 at tree `4e56f1aad06d39ce8e4a17912d0cad2be602b3cc` — carried omitted unchanged set-function probe evidence; repository evidence exists and tests execute every row. Standing evidence-gap rule counts verdict, copy to inbox.
  - `[maybe-false]` `[defer]` Fidelity reviewer 2 F-7 at the same tree — carried same claim/path; retained one deferred root cause, no source defect identified. Standing rule counts verdict, copy to inbox.

## Verification

- `php packages/runtime/tests/xaravel/php-arr-builtins-arguments.probe.php` — PHP 8.5.11 evidence matches recorded probe output.
- `bun test packages/runtime/tests/xaravel/php-arr-builtins-arguments.test.ts` — every matrix row executes and passes.
- `php packages/runtime/tests/xaravel/php-arr-builtins.probe.php` — builtin PHP evidence matches recorded output.
- `bun test packages/runtime/tests/xaravel/php-arr-builtins.test.ts` — builtin matrix tests pass.
- `bun run typecheck` — success.
- `bun run lint` — success.
- `bun run harness` — no differences; unavailable backend variants may be NOT-RUN.
Item Fidelity Review runs in step 4; its final status must be current.

## Fidelity Review

### Reviewer 1: reject at tree 15ad01098db61a5ab02dbc9e7b444939a136d9fa

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:26:14.737Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The added probe comparisons retain exact serialized values, types and error messages from the supplied PHP evidence; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adaptation markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-91, XT-runtime-95 and XT-runtime-96 check their stated probe and binding consequences. XT-runtime-92 checks shuffle contents and copying but does not verify its declared secure shuffle consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation files belong to packages/runtime, the component authorized by the action item and Maintainer ruling; no other component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched declarations contain no asyncRoot tags. The added implementations are synchronous and introduce no Driver IO or callback allowed to be async under DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"15ad01098db61a5ab02dbc9e7b444939a136d9fa","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-27T22:26:14.737Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The added probe comparisons retain exact serialized values, types and error messages from the supplied PHP evidence; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adaptation markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-91, XT-runtime-95 and XT-runtime-96 check their stated probe and binding consequences. XT-runtime-92 checks shuffle contents and copying but does not verify its declared secure shuffle consequence.","findings":[{"path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All changed implementation files belong to packages/runtime, the component authorized by the action item and Maintainer ruling; no other component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The touched declarations contain no asyncRoot tags. The added implementations are synchronous and introduce no Driver IO or callback allowed to be async under DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 15ad01098db61a5ab02dbc9e7b444939a136d9fa

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:26:14.737Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests; the added tests are Xaravel Tests against PHP probes. |
| F-2: No expected value is weakened | pass | The added probe comparisons retain exact serialized values, types, exception classes and messages; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-91, 95 and 96 check their stated probe and binding consequences. XT-runtime-92 checks shuffle contents and copying but does not verify its declared secure shuffle consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to packages/runtime, the explicitly approved component scope; the added PHP builtins and binder implement runtime behavior rather than another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations retain no asyncRoot tags and introduce synchronous operations and a synchronous-body wrapper; none requires an IO-root or async-callback tag under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"15ad01098db61a5ab02dbc9e7b444939a136d9fa","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-27T22:26:14.737Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests; the added tests are Xaravel Tests against PHP probes.","findings":[]},{"id":"F-2","result":"pass","note":"The added probe comparisons retain exact serialized values, types, exception classes and messages; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-91, 95 and 96 check their stated probe and binding consequences. XT-runtime-92 checks shuffle contents and copying but does not verify its declared secure shuffle consequence.","findings":[{"path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All changed paths belong to packages/runtime, the explicitly approved component scope; the added PHP builtins and binder implement runtime behavior rather than another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations retain no asyncRoot tags and introduce synchronous operations and a synchronous-body wrapper; none requires an IO-root or async-callback tag under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 95a27bc16fd408832a07fc3f06982d7bc1b5f231

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:32:00.182Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | Compared changed expectations and assertions with the supplied PHP probes and prior diff lines. Comparisons remain exact; the registry count increases from 100 to 103 for the three added functions. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared touched Xaravel Test bodies and helpers with their consequences and PHP evidence. Probe labels receive exact comparisons; binding checks cover validation and normalization. Controlled shuffle draws now verify secure-source use, rejection sampling and permutation selection. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code is within packages/runtime and implements the runtime builtins and binder authorized by the supplied Maintainer ruling; no other Component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations and retained tags with AD-6 and DIV-1. The added implementations are synchronous and introduce neither IO roots nor callbacks requiring async tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted. **fixed**: XT-runtime-92 supplies draws 0xffffffff, 0 and 1, asserts the resulting permutation and exactly three draws, and restores the secure source in finally.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted. **fixed**: The controlled secure-source test requires a changed permutation and verifies rejection sampling, so returning the original order would fail.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"95a27bc16fd408832a07fc3f06982d7bc1b5f231","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-27T22:32:00.182Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations and assertions with the supplied PHP probes and prior diff lines. Comparisons remain exact; the registry count increases from 100 to 103 for the three added functions.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared touched Xaravel Test bodies and helpers with their consequences and PHP evidence. Probe labels receive exact comparisons; binding checks cover validation and normalization. Controlled shuffle draws now verify secure-source use, rejection sampling and permutation selection.","findings":[]},{"id":"F-8","result":"pass","note":"All changed code is within packages/runtime and implements the runtime builtins and binder authorized by the supplied Maintainer ruling; no other Component is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations and retained tags with AD-6 and DIV-1. The added implementations are synchronous and introduce neither IO roots nor callbacks requiring async tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted.","fixed":true,"note":"XT-runtime-92 supplies draws 0xffffffff, 0 and 1, asserts the resulting permutation and exactly three draws, and restores the secure source in finally."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted.","fixed":true,"note":"The controlled secure-source test requires a changed permutation and verifies rejection sampling, so returning the original order would fail."}]}
```

### Reviewer 2: pass at tree 95a27bc16fd408832a07fc3f06982d7bc1b5f231

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:32:00.182Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed test expectations with the supplied PHP probes and prior diff lines. Exact comparisons remain exact; the registry count increases to reflect three added functions. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared touched Xaravel Test bodies with their consequences and PHP probe labels. Exact probe comparisons cover coercions and builtins; XT-runtime-92 now checks secure-source draws, rejection sampling and the resulting permutation. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the runtime scope and Maintainer ruling. All changes remain within packages/runtime and implement authorized runtime semantics without substituting another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations and retained tags with AD-6 and DIV-1. The implementations are synchronous and introduce no async root or async callback seam requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted. **fixed**: XT-runtime-92 supplies draws [0xffffffff, 0, 1], asserts the permutation [c, b, a] and exactly three draws, verifying rejection sampling and secure-source use.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-arr-builtins.test.ts`: XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted. **fixed**: The controlled random-source assertions fail for an implementation that always preserves input order, and the original crypto descriptor is restored in finally.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"95a27bc16fd408832a07fc3f06982d7bc1b5f231","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-27T22:32:00.182Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed test expectations with the supplied PHP probes and prior diff lines. Exact comparisons remain exact; the registry count increases to reflect three added functions.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared touched Xaravel Test bodies with their consequences and PHP probe labels. Exact probe comparisons cover coercions and builtins; XT-runtime-92 now checks secure-source draws, rejection sampling and the resulting permutation.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the runtime scope and Maintainer ruling. All changes remain within packages/runtime and implement authorized runtime semantics without substituting another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations and retained tags with AD-6 and DIV-1. The implementations are synchronous and introduce no async root or async callback seam requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add controlled random-source coverage that verifies the secure source is consulted and its draws drive the permutation, including rejection sampling, or narrow the consequence string to the properties actually asserted.","fixed":true,"note":"XT-runtime-92 supplies draws [0xffffffff, 0, 1], asserts the permutation [c, b, a] and exactly three draws, verifying rejection sampling and secure-source use."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-arr-builtins.test.ts","detail":"XT-runtime-92 would pass if shuffleArray always returned the input values in their original order. Add a controlled test of secure random-source use and permutation selection, or narrow the consequence string to the content preservation, reindexing and value separation actually asserted.","fixed":true,"note":"The controlled random-source assertions fail for an implementation that always preserves input order, and the original crypto descriptor is restored in finally."}]}
```

### Reviewer 1: pass at tree 4217612fe7f76803051dcbce71bce6bc042a6112

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:40:49.447Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Comparisons remain exact. Registry expectations expand from 100 to 103 for the three added PHP functions; existing expected results and exception checks are preserved. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The touched Xaravel Tests check their declared consequences through exact probe-label comparisons, binding-before-body checks, normalized returns, export identity, resolver metadata, value separation and controlled shuffle draws. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation files belong to runtime, matching the action item's scope and Maintainer ruling. The builtins and binder implement runtime behavior without substituting another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations retain no asyncRoot tags. The new builtins, shuffle and binding helpers are synchronous and introduce no IO root or permitted async callback boundary requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"4217612fe7f76803051dcbce71bce6bc042a6112","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-27T22:40:49.447Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Comparisons remain exact. Registry expectations expand from 100 to 103 for the three added PHP functions; existing expected results and exception checks are preserved.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"The touched Xaravel Tests check their declared consequences through exact probe-label comparisons, binding-before-body checks, normalized returns, export identity, resolver metadata, value separation and controlled shuffle draws.","findings":[]},{"id":"F-8","result":"pass","note":"All changed implementation files belong to runtime, matching the action item's scope and Maintainer ruling. The builtins and binder implement runtime behavior without substituting another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations retain no asyncRoot tags. The new builtins, shuffle and binding helpers are synchronous and introduce no IO root or permitted async callback boundary requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 4217612fe7f76803051dcbce71bce6bc042a6112

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:40:49.447Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The supplied PHP probe expectations retain exact comparisons and exception messages. The registry count increases from 100 to 103 for the three added builtins; existing entries remain checked. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new test bodies check their declared probe matrices, binding validation, exports, copying and shuffle behavior. Full verification of touched XT-runtime-83 and XT-runtime-85 requires omitted probe data. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are within packages/runtime, the approved component scope. The builtins and argument binder implement runtime behavior without substituting another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source declarations contain no asyncRoot tags. The new implementations are synchronous and neither reach an async IO root nor accept an allowed async callback requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"4217612fe7f76803051dcbce71bce6bc042a6112","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-27T22:40:49.447Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The supplied PHP probe expectations retain exact comparisons and exception messages. The registry count increases from 100 to 103 for the three added builtins; existing entries remain checked.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The new test bodies check their declared probe matrices, binding validation, exports, copying and shuffle behavior. Full verification of touched XT-runtime-83 and XT-runtime-85 requires omitted probe data.","findings":[{"path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed files are within packages/runtime, the approved component scope. The builtins and argument binder implement runtime behavior without substituting another component.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source declarations contain no asyncRoot tags. The new implementations are synchronous and neither reach an async IO root nor accept an allowed async callback requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 4e56f1aad06d39ce8e4a17912d0cad2be602b3cc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:42:07.548Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | Existing exact assertions remain exact. The registry count increases from 100 to 103 for the three added PHP functions; resolver expectations retain existing entries and add the new exports. |
| F-3: No assertion is removed without a DIV clause | pass | No existing assertion is removed; the changed registry assertion and helper exclusions preserve their checks. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new Arr and argument-binding tests check their declared probe labels and additional contracts, including controlled shuffle draws. However, the unchanged PHP comparisons selected by XT-runtime-83 and XT-runtime-85 remain unavailable, leaving P-1 unresolved. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code is within packages/runtime, matching the Maintainer-approved scope. The additions implement runtime PHP behavior without substituting another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations and retained methods are synchronous and introduce neither IO roots nor callbacks allowed to be async. Their lack of asyncRoot tags matches AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged output rows selected by XT-runtime-83 and XT-runtime-85 and their corresponding computations from php-set-functions.probe.php. Only the changed resolver rows are supplied; both complete probe files remain omitted for size, so these tests' remaining declared PHP comparisons cannot be confirmed. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed. **not fixed**: The complete php-set-functions PHP probe and unchanged output rows are still omitted. The supplied resolver diff does not provide the remaining comparisons requested by P-1.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"4e56f1aad06d39ce8e4a17912d0cad2be602b3cc","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-27T22:42:07.548Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Existing exact assertions remain exact. The registry count increases from 100 to 103 for the three added PHP functions; resolver expectations retain existing entries and add the new exports.","findings":[]},{"id":"F-3","result":"pass","note":"No existing assertion is removed; the changed registry assertion and helper exclusions preserve their checks.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"The new Arr and argument-binding tests check their declared probe labels and additional contracts, including controlled shuffle draws. However, the unchanged PHP comparisons selected by XT-runtime-83 and XT-runtime-85 remain unavailable, leaving P-1 unresolved.","findings":[{"path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged output rows selected by XT-runtime-83 and XT-runtime-85 and their corresponding computations from php-set-functions.probe.php. Only the changed resolver rows are supplied; both complete probe files remain omitted for size, so these tests' remaining declared PHP comparisons cannot be confirmed.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed code is within packages/runtime, matching the Maintainer-approved scope. The additions implement runtime PHP behavior without substituting another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations and retained methods are synchronous and introduce neither IO roots nor callbacks allowed to be async. Their lack of asyncRoot tags matches AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed.","fixed":false,"note":"The complete php-set-functions PHP probe and unchanged output rows are still omitted. The supplied resolver diff does not provide the remaining comparisons requested by P-1."}]}
```

### Reviewer 2: reject at tree 4e56f1aad06d39ce8e4a17912d0cad2be602b3cc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `632377fab9641cfb0026da47fd519eaec51e732a`, on 2026-10-27T22:42:07.548Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The changed assertions retain exact comparisons. Registry expectations expand from 100 to 103 entries for the three added PHP functions; existing expectations are not weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new test bodies cover their stated probe labels and normalization checks, but the unchanged PHP comparisons claimed by XT-runtime-83 and XT-runtime-85 remain unavailable, leaving P-1 unresolved. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code stays within packages/runtime, matching the action item's component scope and the Maintainer ruling; no other component implementation is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and retained tag inventory with AD-6 and DIV-1. The added operations are synchronous and require no asyncRoot tags; the touched files retain none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged probe output rows selected by XT-runtime-83 and XT-runtime-85 and their corresponding computations from php-set-functions.probe.php. The diff supplies only changed resolver rows, while section (h) omits both complete files for size, so the remaining declared PHP comparisons cannot be confirmed. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-set-functions.probe.txt`: Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed. **not fixed**: The complete php-set-functions PHP probe and its unchanged output rows are still omitted for size. The supplied TypeScript computations and three changed resolver rows do not supply the missing PHP evidence.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"4e56f1aad06d39ce8e4a17912d0cad2be602b3cc","base":"632377fab9641cfb0026da47fd519eaec51e732a","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-27T22:42:07.548Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The changed assertions retain exact comparisons. Registry expectations expand from 100 to 103 entries for the three added PHP functions; existing expectations are not weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The new test bodies cover their stated probe labels and normalization checks, but the unchanged PHP comparisons claimed by XT-runtime-83 and XT-runtime-85 remain unavailable, leaving P-1 unresolved.","findings":[{"path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged probe output rows selected by XT-runtime-83 and XT-runtime-85 and their corresponding computations from php-set-functions.probe.php. The diff supplies only changed resolver rows, while section (h) omits both complete files for size, so the remaining declared PHP comparisons cannot be confirmed.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed code stays within packages/runtime, matching the action item's component scope and the Maintainer ruling; no other component implementation is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and retained tag inventory with AD-6 and DIV-1. The added operations are synchronous and require no asyncRoot tags; the touched files retain none.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-set-functions.probe.txt","detail":"Supply the unchanged probe outputs selected by XT-runtime-83 and XT-runtime-85, together with their corresponding PHP probe computations. The prompt shows only the three changed resolver output rows and omits the complete PHP probe, so the remaining declared PHP comparisons cannot be confirmed.","fixed":false,"note":"The complete php-set-functions PHP probe and its unchanged output rows are still omitted for size. The supplied TypeScript computations and three changed resolver rows do not supply the missing PHP evidence."}]}
```

## Auto Run Result

Status: done. Implemented runtime Arr builtins, secure shuffleArray and explicit bindPhpArguments/phpReturn seams. Story 14.6 is untouched and may resume in the next iteration.

Changed files: php/arrBuiltins.ts adds list/push/query behavior and constants/options; php/userlandArguments.ts adds eager userland typing and return normalization; Randomizer.ts adds secure shuffle; index.ts and php/index.ts export APIs; phpFunctions.ts registers three PHP names. Runtime documentation and README explain the APIs. New PHP probes/tests cover 218 observations (186 binder, 32 builtins), plus controlled random draws and separation assertions. Existing set-functions probe/registry assertions updated to reflect 103 actual PHP names; no assertion removed or weakened.

Review: four independent layers ran in two batches on each of two passes. Pass 1 plan repair removed the unnecessary wrapper and fixed error/normalization gaps. Pass 2 repaired 12 grouped medium findings; high patches 0, medium patches 12. Rejected findings and evidence are individually recorded above. One grouped evidence gap is deferred to Epic 14's retrospective and the inbox. Follow-up review recommendation is false: direct regression evidence covers all verified defects and no specific unresolved implementation risk remains. Arr consumer integration occurs in Story 14.6 within its own scope.

Verification: installed PHP 8.5.11 regenerated all new probe rows and the existing set-function resolver evidence; focused tests and documentation check passed; bun run typecheck and bun run lint passed. Final full harness exited 0: SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0; XARAVEL tests=456 passed=451 failed=0 skipped=5. Backend NOT-RUN is permitted. Final Fidelity status current at tree 4e56f1aad06d39ce8e4a17912d0cad2be602b3cc, both verdicts counted under MAINT-2026-10-24-evidence-gaps for F-7 missing unchanged set-function evidence only; no waiver. Reviewer 1 recorded Claude unavailable and Codex fallback.

Residual limitation: the reviewer prompt omits unchanged PHP probe bodies/outputs for size; both local files and executed comparisons exist. No grader, Expectations, divergence, instruction, other package or Story changes.
