---
title: 'Story 14.7: LazyCollection behaviour'
type: feature
created: '2026-10-28'
status: done
review_loop_iteration: 0
baseline_revision: 096c5c369ef5eb4b026f270ed14cc856cabba74e
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/DIV-1.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.7 owns the 26 SupportLazyCollectionTest Test IDs and XT-collections-13/14. Earlier Stories supply most LazyCollection methods, but eager, remember and shuffle and these direct Upstream tests are missing.

**Approach:** Translate all owned Upstream tests whole, implement the missing independent methods in Upstream order using existing public runtime contracts, and preserve complete clock-dependent bodies behind an explicit blocked-by:support boundary until Epic 19 supplies the clock. Verify shared cache behavior through interleaved public iterators and duplicate keys.

## Boundaries & Constraints

**Always:** Keep Upstream names, arguments, defaults, assertions, expected values, messages and call order. Follow PORTING.md mechanical expression and closure rules, DIV-9 array forms, DIV-12.18 generators, and architecture AD-6/9/22/26. Use runtime PHP builtins and value copying. Keep source/cache state scoped to the returned collection instance's closure, not a singleton/module. Preserve prior methods and tests. Story edits stay in packages/collections, own Expectations lines, oracle-requests/14.7.jsonl, own Escalations and authorized implementation-artifact bookkeeping. Tests use portedTest/TestCase and @xaravel/assert; annotate only actually adapted assertions with existing DIV clauses.

**Never:** Edit another Component, Protected instructions, grader rules or another Story's Expectations; stub Support, invent clocks, reimplement PHP builtins or weaken an assertion. A missing earlier runtime contract requires an Escalation and affected IDs stay not-ported-yet, while independent work continues. Four Support clock tests remain complete and actually throw BlockedByComponentError('support'); this is the planned dependency hold, not Story incompleteness.

</intent-contract>

## Code Map

- `stories/14.7.md`: authoritative 26 IDs, XT-collections-13 concurrent remember and XT-collections-14 clock behavior.
- `conformance/upstream/framework/tests/Support/SupportLazyCollectionTest.php`: complete original bodies and imports; four clock tests use Carbon, Duration, Sleep and Wormhole from later Components.
- `conformance/upstream/framework/src/Illuminate/Collections/LazyCollection.php:136`: eager materializes immediately; remember captures one iterator with positional cache, preserving duplicate keys and interleaved cursors. shuffle delegates through passthru. Clock algorithms at takeUntilTimeout/throttle/withHeartbeat are read-only pending Support.
- `packages/collections/src/LazyCollection.ts`: existing constructor, lazyInstance, getIterator/makeIterator, tapEach, has, containsOneItem/ManyItems, before/after, random, unique and dot. Existing owned generator lifetime mechanism must remain intact. Remember's underlying iterator must survive one runner stopping so another can continue.
- `packages/collections/src/Collection.ts`, `Arr.ts`: Collection.shuffle is missing too; add its whole Upstream method delegating to existing Arr.shuffle, which uses runtime Randomizer.shuffleArray. LazyCollection reuses it through passthru.
- `packages/runtime/src/php/Generator.ts`: read-only public iterator/current/key/next/valid protocol and owned cleanup semantics.
- `packages/collections/tests/ported/framework/tests/Support/SupportCollectionTest.test.ts`: local throwing dependency-boundary pattern retains complete blocked bodies; no fake implementation.
- `packages/collections/tests/xaravel/collections.test.ts`: extend existing XT registration style, cite FR-23 and AD-6/9; retain prior XT IDs and assertions.
- `conformance/expectations/collections/framework/tests/Support/SupportLazyCollectionTest.jsonl`: change only Story 14.7's 26 lines after full translation and observed outcomes.
- `packages/collections/docs/collections.md`: document eager/remember/shuffle and honest clock dependency status.

## Tasks & Acceptance

**Execution:**
- `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionTest.test.ts` -- translate all 26 original methods, complete fixtures and assertions; use exact support boundary for four clock methods -- establish the specification before implementation.
- `packages/collections/src/LazyCollection.ts` -- implement whole eager, remember and shuffle using public runtime contracts and existing helpers, correcting owned-method defects only when required -- complete independent behavior without stubbing dependencies.
- `packages/collections/src/Collection.ts` -- add whole shuffle delegation to Arr.shuffle -- supply LazyCollection passthru target within the same Component.
- `packages/collections/tests/xaravel/collections.test.ts` -- add XT-collections-13 exercising interleaved remember runners, positional duplicate-key cache and source enumeration count; add XT-collections-14 retaining clock acceptance behind real Support dependency boundary -- cover architecture consequences honestly.
- `conformance/expectations/collections/framework/tests/Support/SupportLazyCollectionTest.jsonl` -- record observed own-ID pass/adapted or blocked-by:support outcomes; no other lines -- keep grader data truthful.
- `packages/collections/docs/collections.md` -- describe the completed members, shared-cache semantics and Epic 19 clock holds -- expose actual behavior.

**Acceptance Criteria:**
- Given every manifest-owned Upstream test, when the full Story harness runs, then each ID passes or throws its legitimate Support block, with no not-ported-yet lines and no removed assertions.
- Given a generator with duplicate keys and two runners, when cursors advance alternately and one stops early, then cached positional entries remain available, keys are preserved and the source advances once per new position (XT-collections-13).
- Given a mutable source, when eager is called before the source changes, then later all calls return the original materialized snapshot.
- Given the absent Support clock, when the four complete clock tests and XT-collections-14 run, then they report the explicit planned dependency block; no wall clock replacement or fabricated pass is introduced.
- Given all prior collections tests, when component/global verification runs, then no regression or unexplained Expectations difference appears.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 12 findings — high 0, medium 2, low 2, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: sole stopped runner followed by a new runner lacks a separate test — XT13 stops a runner and continues the same shared cursor before replay; remember captures its iterator independently of runner lifetime. No alternate sole-runner cleanup branch exists or defect is demonstrated.
  - `[false]` `[reject]` Blind: missing class-object handle test — valueCopy deliberately preserves registered object handles; both cache and eager use that established helper, not cloning. No code path changes class identity or duplicates objects.
  - `[false]` `[reject]` Blind: empty remember lacks explicit test — valid false breaks before cache access, and each runner repeats that same safe check; no nonempty-only assumption or wrong result exists.
  - `[false]` `[reject]` Blind: source exception lacks explicit test — exception propagates through iterator.valid/next, runtime closes that generator, cached positions remain replayable and the next absent position observes invalid. No catch/rethrow or restart code changes PHP behavior.
  - `[false]` `[reject]` Blind: Collection.shuffle lacks direct test — LazyCollection.passthru invokes actual Collection.shuffle, while XT13 checks reindexing and unchanged input. Its standard newInstance preserves subclasses. No unexercised alternate algorithm or demonstrated defect.
  - `[low]` `[patch]` Blind: eager snapshot documentation overstates independence for object handles — qualify the snapshot guarantee as array value copying and preserve shared PHP object handles.
  - `[low]` `[patch]` Blind: clock acceptance activation needs explicit gate-removal instructions — document removal of test boundary/skip and binding real Support APIs in Epic 19.
  - `[false]` `[reject]` Intent: concurrent-enumeration surface — audit confirms public iterator tests and implementation align with Story intent.
  - `[false]` `[reject]` Intent: eventual production clock versus dependency-classification surface — epic explicitly authorizes the temporary Support hold; no clock implementation is claimed. The specific XT claim mismatch is independently patched below.
  - `[false]` `[reject]` Intent: incremental method coverage — existing methods plus complete newly ported tests satisfy phase-specific scope; no requirement to rewrite working methods exists.
  - `[medium]` `[patch]` Fidelity reviewer 1 F-7: XT14 unconditional skip cannot establish the Support-clock claim — execute the same actual Ported Test dependency boundary, assert exact blocked classification, narrow consequence to observed hold, then explicitly skip unverified clock acceptance.
  - `[medium]` `[patch]` Fidelity reviewer 2 F-7: same XT14 unconditional-skip defect — grouped with reviewer 1 under one test-boundary/claim repair; no fake clock or production completion claim.

Edge-case layer returned no findings; verification-gap layer returned no gaps. Five coverage suggestions were checked against the implementation before rejecting; passing focused/global results are not substituted for code-path reasoning. The two Fidelity findings share one medium patch entry; documentation fixes are two low entries. No high or bad-spec entry; follow-up review recommendation remains false after patches.

## Design Notes

Upstream remember caches by enumeration position rather than original key, so duplicate keys remain distinct during traversal even though all materializes with PHP's final-key overwrite. Returned closures share the cache and source iterator, but have independent runner positions. Do not use a keyed map that collapses duplicates. Generator cleanup must preserve a shared underlying cursor when a single runner returns early.

## Verification

**Commands:**
- `bun run harness --fast --story 14.7` after translating tests and before implementation -- capture seed and real baseline.
- `bun run typecheck` and `bun run lint` -- pass.
- `bun run harness --story 14.7` -- zero differences.
- `bun run harness --component collections` -- zero differences.
- `bun run harness --xaravel --id 'XT-collections-*'` -- XT-collections-13 passes, XT-collections-14 reports truthful Support dependency; prior tests pass.
- `bun run expectations:check`, `bun run escalations:check`, `bun run divergence:check`, `git diff --check` -- pass.
- `bun run harness` foreground, escalated if sandbox infrastructure times out -- zero differences, unavailable backend Variants NOT-RUN allowed.
- `bun run fidelity:review review --story 14.7 --spec _bmad-output/implementation-artifacts/spec-14-7-lazycollection-behaviour.md --loop-cli codex` -- two counted approvals for final tree under standing rulings.
- `bun run story:check 14.7` -- all local clauses pass; authenticated remote full-run clause must pass on PR before merge.


## Implementation verification — 2026-10-28

Fast baseline seed 6293d11f ran after translation and before implementation: five expected missing-method failures, four actual Support blocks, 17 existing passes. Implemented eager, remember and both shuffle methods; all 26 original bodies and assertions retained. XT13 covers interleaved duplicate keys, advancement counts, early runner termination, replay, array copy isolation, eager snapshots and deferred repeated shuffle. XT14 honestly skips for the absent Support clock, with full clock scenarios retained in the four Ported Tests.

Focused Story harness checked 26 with zero differences; Collections checked 1,029 with zero differences; Collections Xaravel tests 14, passed 13, skipped 1. Parent typecheck, lint/disables (940 files), Expectations, Escalations, Divergence and whitespace checks pass. Frozen install checked 113 installs across 134 packages without changes. Foreground full harness outside sandbox passed: XARAVEL tests=486 passed=480 failed=0 skipped=6; SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0. Seven local backend Variants are unavailable as AD-17 permits. Fresh reviews and authenticated remote story:check remain.

## Fidelity Review

### Reviewer 1: reject at tree 23da2cc7348bc4845428bd0da13baf4c7b1fd6aa

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `096c5c369ef5eb4b026f270ed14cc856cabba74e`, on 2026-10-29T00:16:05.752Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 26 Ported Tests with the supplied Upstream bodies. Assertions retain their subjects, expected values and order, including the four blocked clock scenarios. |
| F-2: No expected value is weakened | pass | Compared assertion methods, expected values, tolerances and exception expectations with Upstream. No comparison or expected exception is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Compared assertion coverage with Upstream, including repeated iterator assertions and Sleep callback assertions. No assertion is removed; blocked bodies retain their assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The four clock tests require Carbon, Duration, Sleep or Wormhole from Support. Support is a later phase, and blocked-by:support has the correct denominator-preserving precedence. |
| F-5: Every `adapted` marker matches its clause | pass | Compared keyed yields and yield-from adaptations with DIV-12.18 and collection append writes with DIV-12.17. The markers and non-null Expectations adaptations stay within those clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-collections-13 checks its declared caching consequences. XT-collections-14 only reports a skip and does not verify the dependency its consequence declares. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes remain within collections. The test-only Support seams throw dependency errors and the affected tests are blocked-by:support; they supply no substitute clock behavior to make tests pass. |
| F-9: Every `@asyncRoot` tag is true | pass | Inspected both changed source files and their retained tags against AD-6 and DIV-1. Tagged companions await permitted callbacks; the new eager, remember and shuffle methods are synchronous and need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The Story changes no Oracle request file. |

Findings:

- **F-7** `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"23da2cc7348bc4845428bd0da13baf4c7b1fd6aa","base":"096c5c369ef5eb4b026f270ed14cc856cabba74e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-29T00:16:05.752Z","items":[{"id":"F-1","result":"pass","note":"Compared all 26 Ported Tests with the supplied Upstream bodies. Assertions retain their subjects, expected values and order, including the four blocked clock scenarios.","findings":[]},{"id":"F-2","result":"pass","note":"Compared assertion methods, expected values, tolerances and exception expectations with Upstream. No comparison or expected exception is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Compared assertion coverage with Upstream, including repeated iterator assertions and Sleep callback assertions. No assertion is removed; blocked bodies retain their assertions.","findings":[]},{"id":"F-4","result":"pass","note":"The four clock tests require Carbon, Duration, Sleep or Wormhole from Support. Support is a later phase, and blocked-by:support has the correct denominator-preserving precedence.","findings":[]},{"id":"F-5","result":"pass","note":"Compared keyed yields and yield-from adaptations with DIV-12.18 and collection append writes with DIV-12.17. The markers and non-null Expectations adaptations stay within those clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"XT-collections-13 checks its declared caching consequences. XT-collections-14 only reports a skip and does not verify the dependency its consequence declares.","findings":[{"path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Framework changes remain within collections. The test-only Support seams throw dependency errors and the affected tests are blocked-by:support; they supply no substitute clock behavior to make tests pass.","findings":[]},{"id":"F-9","result":"pass","note":"Inspected both changed source files and their retained tags against AD-6 and DIV-1. Tagged companions await permitted callbacks; the new eager, remember and shuffle methods are synchronous and need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The Story changes no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 23da2cc7348bc4845428bd0da13baf4c7b1fd6aa

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `096c5c369ef5eb4b026f270ed14cc856cabba74e`, on 2026-10-29T00:16:05.752Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 26 Ported Tests with the supplied Upstream bodies. Assertion subjects, expected values and order are preserved, including the retained blocked clock scenarios. |
| F-2: No expected value is weakened | pass | Compared assertion strictness, values, counts, deltas and exception expectations with Upstream. No expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Compared assertion counterparts with Upstream, including repeated runner assertions and Sleep callback assertions. None is removed; the four dependency-blocked bodies remain present. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The four clock scenarios depend on Carbon, Duration or Sleep from Support. Support is a later-phase Component, and blocked-by:support has the correct precedence over not-ported-yet. |
| F-5: Every `adapted` marker matches its clause | pass | Compared keyed-yield and yield-from adaptations with DIV-12.18 and Collection append adaptations with DIV-12.17. The markers and non-null Expectations adaptations stay within those clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-collections-13 checks its declared caching, interleaving and copying consequences. XT-collections-14 only skips and does not verify its declared dependency consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes stay within Collections. The test-only Support declarations throw dependency errors and provide no clock behavior to make tests pass; the affected Ported Tests are marked blocked-by:support. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared both changed source files with AD-6 and DIV-1. Retained callback tags identify methods that await supplied callbacks; eager, remember and shuffle remain synchronous and require no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The Story changes no Oracle request file. |

Findings:

- **F-7** `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"23da2cc7348bc4845428bd0da13baf4c7b1fd6aa","base":"096c5c369ef5eb4b026f270ed14cc856cabba74e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-29T00:16:05.752Z","items":[{"id":"F-1","result":"pass","note":"Compared all 26 Ported Tests with the supplied Upstream bodies. Assertion subjects, expected values and order are preserved, including the retained blocked clock scenarios.","findings":[]},{"id":"F-2","result":"pass","note":"Compared assertion strictness, values, counts, deltas and exception expectations with Upstream. No expected value is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Compared assertion counterparts with Upstream, including repeated runner assertions and Sleep callback assertions. None is removed; the four dependency-blocked bodies remain present.","findings":[]},{"id":"F-4","result":"pass","note":"The four clock scenarios depend on Carbon, Duration or Sleep from Support. Support is a later-phase Component, and blocked-by:support has the correct precedence over not-ported-yet.","findings":[]},{"id":"F-5","result":"pass","note":"Compared keyed-yield and yield-from adaptations with DIV-12.18 and Collection append adaptations with DIV-12.17. The markers and non-null Expectations adaptations stay within those clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"XT-collections-13 checks its declared caching, interleaving and copying consequences. XT-collections-14 only skips and does not verify its declared dependency consequence.","findings":[{"path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Framework changes stay within Collections. The test-only Support declarations throw dependency errors and provide no clock behavior to make tests pass; the affected Ported Tests are marked blocked-by:support.","findings":[]},{"id":"F-9","result":"pass","note":"Compared both changed source files with AD-6 and DIV-1. Retained callback tags identify methods that await supplied callbacks; eager, remember and shuffle remain synchronous and require no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The Story changes no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree c2e6d575b0a8ad45db6f96672f778c209652c3d2

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `096c5c369ef5eb4b026f270ed14cc856cabba74e`, on 2026-10-29T00:34:10.402Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 26 Ported Tests with the supplied Upstream bodies. Assertions retain their subjects, expected values and order; the four blocked clock tests retain their assertions. |
| F-2: No expected value is weakened | pass | Compared assertion strengths, expected values, tolerances and exception expectations with Upstream. None is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Compared Upstream assertions with their ported counterparts, including repeated runner checks and callback assertions. No assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The four clock tests depend on absent Support date and sleep facilities. blocked-by:support is valid for the supplied component phases and takes precedence over not-ported-yet; no higher-priority reason applies. |
| F-5: Every `adapted` marker matches its clause | pass | Compared keyed yields and yield-from adaptations with DIV-12.18, and Collection append writes with DIV-12.17. The markers and populated Expectations adaptations match those clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-13 checks interleaving, positional caching, duplicate keys, source lifetime and array copies. XT-collections-14 now checks the shared gate's exact error class and message, and its revised consequence explicitly claims only that dependency classification. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production additions implement Collections behavior within its component. The Support seams supply no clock behavior, and the dependent Ported Tests are marked blocked-by:support. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared retained callback tags and their method bodies with AD-6 and DIV-1: each awaits an allowed async callback. The new eager, remember and shuffle methods are synchronous and require no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no Oracle request file. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes. **fixed**: XT-collections-14 now asserts the shared gate's exact exception constructor and message before skipping, and revises its consequence to claim no clock behavior.
- **P-2** (reviewer 2, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock. **fixed**: The body exercises the same Support gate used by all four blocked Ported Tests. Its consequence now describes that tested boundary alone, without claiming to establish production clock requirements.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"c2e6d575b0a8ad45db6f96672f778c209652c3d2","base":"096c5c369ef5eb4b026f270ed14cc856cabba74e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-29T00:34:10.402Z","items":[{"id":"F-1","result":"pass","note":"Compared all 26 Ported Tests with the supplied Upstream bodies. Assertions retain their subjects, expected values and order; the four blocked clock tests retain their assertions.","findings":[]},{"id":"F-2","result":"pass","note":"Compared assertion strengths, expected values, tolerances and exception expectations with Upstream. None is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Compared Upstream assertions with their ported counterparts, including repeated runner checks and callback assertions. No assertion is removed.","findings":[]},{"id":"F-4","result":"pass","note":"The four clock tests depend on absent Support date and sleep facilities. blocked-by:support is valid for the supplied component phases and takes precedence over not-ported-yet; no higher-priority reason applies.","findings":[]},{"id":"F-5","result":"pass","note":"Compared keyed yields and yield-from adaptations with DIV-12.18, and Collection append writes with DIV-12.17. The markers and populated Expectations adaptations match those clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-13 checks interleaving, positional caching, duplicate keys, source lifetime and array copies. XT-collections-14 now checks the shared gate's exact error class and message, and its revised consequence explicitly claims only that dependency classification.","findings":[]},{"id":"F-8","result":"pass","note":"Production additions implement Collections behavior within its component. The Support seams supply no clock behavior, and the dependent Ported Tests are marked blocked-by:support.","findings":[]},{"id":"F-9","result":"pass","note":"Compared retained callback tags and their method bodies with AD-6 and DIV-1: each awaits an allowed async callback. The new eager, remember and shuffle methods are synchronous and require no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no Oracle request file.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes.","fixed":true,"note":"XT-collections-14 now asserts the shared gate's exact exception constructor and message before skipping, and revises its consequence to claim no clock behavior."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock.","fixed":true,"note":"The body exercises the same Support gate used by all four blocked Ported Tests. Its consequence now describes that tested boundary alone, without claiming to establish production clock requirements."}]}
```

### Reviewer 2: pass at tree c2e6d575b0a8ad45db6f96672f778c209652c3d2

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `096c5c369ef5eb4b026f270ed14cc856cabba74e`, on 2026-10-29T00:34:10.402Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 26 Ported Tests with the supplied Upstream bodies. Assertion subjects, expected values and order are retained, including the four blocked clock test bodies. |
| F-2: No expected value is weakened | pass | Compared comparison methods, exception expectations, counts and duration tolerances with Upstream. No expected value or comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Compared assertion counterparts with Upstream, including repeated callback and loop assertions. No assertion is dropped; blocked clock tests retain their assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The four clock tests depend on absent Support clock facilities. blocked-by:support is valid for Phase 2 versus collections Phase 1 and has the correct denominator-preserving precedence. |
| F-5: Every `adapted` marker matches its clause | pass | Compared generator adaptations with DIV-12.18 and heartbeat index writes with DIV-12.17. Each marker and populated Expectations adaptation matches its clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-13 checks shared iteration, duplicate keys, early runner closure and copied cache values. XT-collections-14 now checks the exact shared gate error and explicitly limits its consequence to dependency classification. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production changes implement collections behavior within collections. Test-only Support seams throw dependency errors and the affected tests remain blocked; they supply no substitute clock behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared both changed source files with AD-6 and DIV-1. Retained callback tags accompany methods that await permitted async callbacks; eager, remember and shuffle remain synchronous and require no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes. **fixed**: XT-collections-14 now executes the shared gate and asserts its exact exception constructor and message before skipping; its consequence claims only that gate behavior.
- **P-2** (reviewer 2, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock. **fixed**: The test exercises the same SupportClockBoundary gate used by all four blocked Ported Tests and explicitly disclaims verification of clock behavior.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"c2e6d575b0a8ad45db6f96672f778c209652c3d2","base":"096c5c369ef5eb4b026f270ed14cc856cabba74e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-29T00:34:10.402Z","items":[{"id":"F-1","result":"pass","note":"Compared all 26 Ported Tests with the supplied Upstream bodies. Assertion subjects, expected values and order are retained, including the four blocked clock test bodies.","findings":[]},{"id":"F-2","result":"pass","note":"Compared comparison methods, exception expectations, counts and duration tolerances with Upstream. No expected value or comparison is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Compared assertion counterparts with Upstream, including repeated callback and loop assertions. No assertion is dropped; blocked clock tests retain their assertions.","findings":[]},{"id":"F-4","result":"pass","note":"The four clock tests depend on absent Support clock facilities. blocked-by:support is valid for Phase 2 versus collections Phase 1 and has the correct denominator-preserving precedence.","findings":[]},{"id":"F-5","result":"pass","note":"Compared generator adaptations with DIV-12.18 and heartbeat index writes with DIV-12.17. Each marker and populated Expectations adaptation matches its clause.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-13 checks shared iteration, duplicate keys, early runner closure and copied cache values. XT-collections-14 now checks the exact shared gate error and explicitly limits its consequence to dependency classification.","findings":[]},{"id":"F-8","result":"pass","note":"Production changes implement collections behavior within collections. Test-only Support seams throw dependency errors and the affected tests remain blocked; they supply no substitute clock behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared both changed source files with AD-6 and DIV-1. Retained callback tags accompany methods that await permitted async callbacks; eager, remember and shuffle remain synchronous and require no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped, so it cannot establish that the three methods require the declared Support clock. Add executable dependency checks before reporting the blocked acceptance outcome, or revise the consequence to describe only what the body establishes.","fixed":true,"note":"XT-collections-14 now executes the shared gate and asserts its exact exception constructor and message before skipping; its consequence claims only that gate behavior."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-14 unconditionally calls markTestSkipped without exercising any dependency or clock scenario. Make its body verify the declared consequence through the actual dependency boundary; an unconditional skip does not establish that these APIs require Support's frame-scoped clock.","fixed":true,"note":"The test exercises the same SupportClockBoundary gate used by all four blocked Ported Tests and explicitly disclaims verification of clock behavior."}]}
```


## Auto Run Result

Status: done. Implemented whole eager and remember methods and shuffle on Collection and LazyCollection. All 26 canonical Upstream tests retain their assertions: 22 pass, four legitimately report blocked-by:support until Epic 19. No clock behavior is claimed implemented. XT13 verifies positional duplicate-key cache, independent interleaved runners, source advancement once, early runner exit, replay, value copying, eager snapshot and deferred repeated shuffle. XT14 executes the same shared test-only boundary as the four held Ported Tests, checks its exact error class/message and explicitly skips unverified clock acceptance.

Files changed: LazyCollection.ts implements eager/remember/shuffle; Collection.ts adds whole shuffle delegation; SupportLazyCollectionTest.test.ts ports all 26 bodies; SupportClockBoundary.ts shares the honest dependency hold; collections.test.ts adds XT13/14; own Expectations shard records observed outcomes; collections.md documents semantics and activation; manifest and sprint status record completion; this spec retains immutable verdicts and review evidence.

All four general review layers ran in two-agent batches. Twelve findings received individual triage: eight false findings rejected with recorded code-path or scope refutations, two low documentation fixes, and two medium duplicate Fidelity findings repaired as one shared-boundary/claim patch. No deferred findings. Patched entry counts: high 0, medium 1, low 2; followup_review_recommended=false. Edge-case review found no issues; verification-gap found no gaps. Final Fidelity passes at c2e6d575b0a8ad45db6f96672f778c209652c3d2 and status prints current. Reviewer 1 used the documented unavailable-Claude fallback. A sandbox reviewer attempt timed out after 15 minutes and was stopped; the authorized identical review outside the sandbox passed. No permission-review denial occurred.

Final verification after repairs: typecheck and lint/disables (941 files), Story harness 26 comparisons, Collections harness 1,029 comparisons, Collections Xaravel tests 14 (13 passed, one Support skip), Expectations, Escalations (139/139), Divergence and whitespace checks pass. Two foreground full harness runs outside sandbox passed, including the final repaired tree: XARAVEL tests=486 passed=480 failed=0 skipped=6; SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0. Seven unavailable local backend Variants are NOT-RUN under AD-17. Frozen install verified without changes. Authenticated remote full-run evidence and story:check are checked after the first push and before merge, because remote CI cannot exist beforehand.

Residual limitation: Support clock methods and their behavioral acceptance remain unverified until Epic 19. Docs name removal of the throwing TestCase gate, replacement of test-only Support seams, binding real Support APIs, removal of XT14 skip and execution of the full retained clock scenarios. No waiver, fabricated clock, changed divergence, weakened assertion or new grader exception.
