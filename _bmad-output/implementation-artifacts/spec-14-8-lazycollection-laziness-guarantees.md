---
title: 'Story 14.8: LazyCollection laziness guarantees'
type: feature
created: '2026-10-28'
status: blocked
baseline_revision: 7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd
review_loop_iteration: 1
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

**Problem:** Story 14.8 owns all 136 SupportLazyCollectionIsLazyTest methods and closes Collections. Methods must defer enumeration and stop at exactly Laravel's source position so large and infinite sources remain safe.

**Approach:** Translate the complete canonical tests and CountsEnumerations helpers before repairing independent Collections methods. Verify source counts through public results, retain genuine Support clock holds, and assess every Epic-close gate honestly.

## Boundaries & Constraints

**Always:** Preserve every Upstream assertion, expected count, callback, call order and exception. Use runtime PHP helpers, Ref for by-reference counters, keyed/yieldFrom for keyed generators and existing TestCase/portedTest conventions. Follow AD-6/9/22/26, named exports, registerClass, value copying and sync callbacks. Scope is packages/collections/**, own Expectations, oracle-requests/14.8.jsonl, own Escalations and authorized implementation-artifact records. Apply existing DIV clauses precisely. Record dependency holds only when execution actually throws BlockedByComponentError. Carry on with independent IDs after an Escalation. Keep earlier assertions and behavior intact.

**Never:** Edit another Component, Protected instructions, grader tooling or API citation files. Never weaken a gate or add a fabricated pass for XT-collections-16. Missing runtime contracts or a required Protected change require an Escalation and blocked completion, with evidence. Do not emulate Support clocks, use wall time or implement PHP semantics locally. Do not change earlier Stories' Expectations. No waiver is proposed.

</intent-contract>

## Code Map

- `stories/14.8.md`: authoritative 136 IDs; XT-collections-15 source-count acceptance and XT-collections-16 Epic-close acceptance.
- `conformance/upstream/framework/tests/Support/SupportLazyCollectionIsLazyTest.php`: complete original tests; imports Exception, Carbon, Sleep, Mockery, stdClass and Collections exceptions. Translate all methods whole in original order.
- `conformance/upstream/framework/tests/Support/Concerns/CountsEnumerations.php`: recorder generator pushes 1..numbers before yield; counters increment through tapEach; default assertEnumerates uses times(100), assertEnumeratesOnce uses times(10); collection-once count is computed before wrapping, and both failure messages must remain.
- `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionTest.test.ts` and `tests/support/SupportClockBoundary.ts`: exact retained-body pattern for absent Support APIs; three Story 14.8 clock tests need the same legitimate hold until Epic 19.
- `packages/collections/src/LazyCollection.ts`: existing lazyInstance/getIterator/makeIterator, owned Generator lifetime, passthru, streaming methods and remember. Compare full methods with Upstream before repairing source lookahead or premature materialization.
- `packages/collections/src/Traits/EnumeratesValues.ts`, `Collection.ts`, `Arr.ts`, `helpers.ts`: shared implementations and PHP helper reuse; repair only owned component behavior implicated by this Story or close acceptance.
- `packages/collections/tests/xaravel/collections.test.ts`: existing XT registrations, FR-23 consequences and isolated standalone installation pattern. Add 15/16 without weakening prior tests.
- `conformance/expectations/collections/framework/tests/Support/SupportLazyCollectionIsLazyTest.jsonl`: only owned lines may change, from observed outcomes.
- `tools/api-surface/api-surface.ts` (read-only): explicitly documents syntactic limitations: inherited members, mixin heritage, aliases and unregistered exported classes are not seen. Baseline gate exits 1 with 268 unexplained findings, including real signatures and inherited-method false missing reports. A required tool or citation change is Protected/outside scope; raise an Escalation for XT-collections-16, preserving the gate as failing.
- `packages/collections/async-surface.json`, `docs/collections.md`, `LICENSE`, `package.json`: close requirements include documented DIV-1/12, committed async companions, Laravel notice and standalone install. Verify each independently even if gate remains blocked.
- Reflection's existing blocked-by:collections line must be re-verified read-only; any required cross-component edit is escalated, not performed in this Story.

## Tasks & Acceptance

**Execution:**
- `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts` and `tests/support/CountsEnumerations.ts` -- translate every complete canonical method/helper and its fixtures with exact assertions -- establish source-count specification before implementation.
- `packages/collections/src/LazyCollection.ts` and implicated own component files -- repair complete Upstream methods using existing runtime seams -- preserve exact deferred and partial consumption.
- `packages/collections/tests/xaravel/collections.test.ts` -- add XT15 public-source-count regressions including early termination, full single enumeration, keyed sources and replay; implement XT16 actual close checks only to the extent honestly possible -- verify declared outermost consequences.
- `conformance/expectations/collections/framework/tests/Support/SupportLazyCollectionIsLazyTest.jsonl` -- update own observed released outcomes and genuine Support holds only -- preserve grader honesty.
- `packages/collections/docs/collections.md` -- document laziness, exact source consumption and pending dependencies -- describe released behavior.
- `conformance/escalations/ESC-14.8-1.md` -- if API gate still requires tool/citation edits, record baseline findings, concrete inherited/mixin evidence, affected XT16 and recommended scoped infrastructure repair without weakening the gate -- route close blocker.

**Acceptance Criteria:**
- Given all owned canonical tests, when the full Story harness runs, then every independent test passes and three genuine Support clock tests report their actual dependency hold; every assertion is preserved.
- Given source counters, when deferred methods are called without consuming their results, then they perform zero enumeration; when partial/full results are consumed, counts match each original Upstream test exactly (XT15).
- Given the completed component, when Epic-close checks run, then the four test files have no not-ported-yet lines, API gate passes, async companions and docs/notices exist, and a standalone install works (XT16). If a Protected/out-of-scope repair is needed, retain this criterion as incomplete and block the Story rather than claiming completion.
- Given prior tests, when component/global verification runs, then there are no unexplained new differences.

## Spec Change Log

- 2026-10-29 resume: blocked → in-progress. `decisions/MAINT-2026-10-29-story-14-8.md` routed both close blockers and every step is on main: runtime `array_sum` is exported from `@xaravel/runtime/php` (item 17, #527); Reflection's `testGetClassAttributes` Expectations line is `pass` (item 18, #529); `tools/api-surface` follows extends, mixin members and aliases (#526); and Collections' genuine findings are fixed or cited (item 19, #531, #533, #534, #535). At 7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd, `bun run api-surface:gate collections` prints `0 unexplained`. The plan stands unchanged. Remaining work: register the complete `testFlatMapIsLazy` port from ESC-14.8-2 and update its own Expectations line from observation. Activate XT-collections-16 from ESC-14.8-1's pending code, with its standalone-install fixture, and make it executable and passing with no weakened check. Its Reflection assertion now reads a `pass` line. Then run the full Verification section, including `bun run story:check 14.8`. KEEP every existing assertion, the 132 passes, the three Support clock holds and the immutable verdict history. ESC-14.8-1 and ESC-14.8-2 both have decision files, and their Escalation records are kept.

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 15 findings — high 0, medium 1, low 3, false 11, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: ordinary-source replay documentation is overly broad — qualify replay to fresh iterator factories and array sources; a factory reusing a cursor retains that cursor's state.
  - `[false]` `[reject]` Blind: interleaved remember lacks coverage — existing XT13 opens two public entries iterators and alternates advancement, checks shared advancement, stops one and continues the other; the new suite preserves that executed test.
  - `[false]` `[reject]` Blind: retained string keys lack transform coverage — existing XT1/XT6 and canonical filtering/slicing suites check preserved keys and ordered PhpArray shapes through the same public methods; XT15 adds source-count composition rather than replacing those tests.
  - `[false]` `[reject]` Blind: duplicate keys lack coverage — XT13 already asserts duplicate-key pairs during public iteration and last-value-at-first-position all() materialization, including isolated copied arrays.
  - `[low]` `[patch]` Blind: factory starts not checked after complete replay — add exact starts assertions after each remaining XT15 consumption, preserving all prior assertions.
  - `[medium]` `[patch]` Blind: accidental eager materialization can hang synchronous infinite-source regression — add a diagnostic source-consumption ceiling of 1000 to the unbounded-loop fixture; take(3) and exact-three assertions remain unchanged.
  - `[false]` `[reject]` Blind: copied manifests cannot prove distributable installation — ESC1 explicitly claims only isolated source dependency closure, records real tarball resolution failure and leaves packaging verification incomplete. No distributable-install pass is registered or claimed.
  - `[false]` `[reject]` Blind: async metadata check alone misses actual methods — existing XT7 exercises six companions on both public classes and XT9 exercises mapAsync/eachAsync, sequential callbacks, keys and failures; the pending close test adds metadata drift coverage and does not replace those passing tests.
  - `[low]` `[patch]` Blind: pending close snippet omits Reflection dependency release — add documentary assertion against that exact outcome's blocked-by:collections reason; no executing gate is weakened or fabricated.
  - `[false]` `[reject]` Blind: final verification fields are outstanding — reviewer saw a snapshot while the parent workflow was still running; results are recorded before commit and no done claim is made.
  - `[false]` `[reject]` Intent: universal public guarantees versus selected tests — canonical public tests and XT15 directly exercise the specified surface; existing production passes, so no unnecessary implementation rewrite is needed.
  - `[false]` `[reject]` Intent: one canonical method is documentary — explicitly authorized contract stop rule retains its whole body and keeps its outcome pending; Story stays blocked, with no completion claim.
  - `[false]` `[reject]` Intent: clock behavior is dependency-held — the Epic explicitly requires Support holds until Epic19; full bodies remain and no clock behavior is claimed verified.
  - `[false]` `[reject]` Intent: Epic-close is documentary — required Protected and cross-component changes are explicitly escalated under the Story stop rule, and XT16 remains incomplete rather than falsely passing.
  - `[false]` `[reject]` Intent: tracking reflects partial progress — final sprint/spec/manifest status is blocked with exact reasons, preserving the user's stop-and-continue-independent-work requirement.

Edge-case and verification-gap layers returned no findings. Fidelity returned two passes with no findings. All four general layers ran in two-agent batches. Three low patches and one medium patch preserve every prior assertion; no deferred findings or public production change.

### 2026-10-29 — Review pass (resume)
- verdicts: 28 findings — high 0, medium 0, low 6, false 21, maybe-false 0; plus 1 Fidelity finding that blocks (below)
- findings:
  - `[false]` `[reject]` Blind: spec `in-review` vs manifest `in-progress`, stale `review_loop_iteration` — step-04 sets the spec to `in-review`; the manifest tracks Story state and is set at HALT; the counter increments only on loopback, and this pass had none.
  - `[false]` `[reject]` Blind: `baseline_revision` overwritten without trace — step-03 captures a new baseline on each implementation run; every earlier verdict record carries its own `base` field (76b387f…), so history still matches its base.
  - `[low]` `[patch]` Blind: XT16's Reflection check asserts only `reason !== blocked-by:collections` — added `status === "pass"` beside the existing assertion.
  - `[low]` `[patch]` Blind: `"DIV-1"` substring is satisfied by `DIV-12` — kept the assertion and added a boundary-aware regular-expression check.
  - `[low]` `[patch]` Blind: copy filter matches `/dist`, `/tests`, `/node_modules` as substrings of the absolute path — filter now tests whole segments of the package-relative path.
  - `[false]` `[reject]` Blind: unresolved `@xaravel/http` peer — `peerDependenciesMeta` marks it `optional: true`, so Bun does not install it, and the isolated install passes without it.
  - `[low]` `[patch]` Blind: inner spawn timeouts fill the 120 s test budget; the gate spawn is unbounded — gate spawn now has `timeout: 60_000`, and the test timeout is 200_000.
  - `[false]` `[reject]` Blind: ESC-14.8-1's docblock check and cleanup not shown — the implementer reported its public-API docblock scan (only internal types lacked docblocks); the `finally` `rmSync(…, {force: true})` is unconditional.
  - `[false]` `[reject]` Blind: no Upstream line anchor for FlatMap — the anchors in the header answer an earlier misread of three tests; FlatMap's body matches Upstream statement for statement, and reviewer 2 and reviewer 1's F-1 both confirm it.
  - `[false]` `[reject]` Blind: no mutation check for FlatMap — `assertEnumeratesCollection` (`tests/support/CountsEnumerations.ts:27-31`) asserts exact counts, so an eager `flatMap` fails the 0 count and over-enumeration fails the 3 count (verification-gap layer confirmed).
  - `[false]` `[reject]` Blind: XARAVEL 487 → 493 does not reconcile — the 487 run was at base 76b387f; items 17–19 (#526–#535) added the other Xaravel Tests before this base. `checked` counts Upstream comparisons, and FlatMap's line was already counted as a skip.
  - `[false]` `[reject]` Blind: docs drop "No Epic-close pass is claimed" — the page describes released behaviour, and XT-collections-16 now runs and passes; Story status is tracked in the manifest, not the package docs.
  - `[low]` `[patch]` Blind: header "These are executable registrations" has no referent — reworded to name the registrations listed above.
  - `[low]` `[patch]` Edge: install + smoke timeouts exhaust the 120 s budget — same root cause and fix as the timeout row above.
  - `[low]` `[patch]` Edge: gate `spawnSync` has no timeout — same fix as the timeout row above.
  - `[low]` `[patch]` Edge: checkout path containing `/tests` or `/dist` copies nothing — same fix as the copy-filter row above.
  - `[low]` `[patch]` Edge: a source name starting with `dist` or `tests` is dropped — same fix as the copy-filter row above.
  - `[low]` `[patch]` Edge: Reflection line moved to another reason or `fail` still passes — same fix as the Reflection row above.
  - `[false]` `[reject]` Edge: a blank line or CRLF in a JSONL shard makes `JSON.parse` throw — `expectations:check` rejects such shards, and the test would then fail loudly, which is correct.
  - `[low]` `[patch]` Verification-gap (other): copy filter substring match — same fix as the copy-filter row above.
  - `[low]` `[patch]` Verification-gap (other): Reflection check weaker than the docs' `pass` — same fix as the Reflection row above.
  - `[false]` `[reject]` Intent (a): changes do not touch the laziness surface — this resume registers the last canonical laziness test against the existing `flatMap`, which already defers; no implementation change was needed, as the earlier pass recorded.
  - `[false]` `[reject]` Intent (b): XT16 checks repository metadata — the Epic-close AC is itself about files, the gate and installability; laziness behaviour is covered by the 133 canonical tests and XT-collections-15.
  - `[false]` `[reject]` Intent (c): source install is narrower than "standalone installation" — stated in the docs and the fixture's docblock; publishing is the Maintainer's release step (AD-18).
  - `[false]` `[reject]` Intent (d): `stories/14.8.md` is Protected — a status-only edit the orchestrator makes on every Story (lessons, epic 1 and epic 5); the Fidelity tree excludes manifest `status:` lines.
  - `[false]` `[reject]` Intent (e): status inconsistency — same refutation as the first Blind row.
  - `[false]` `[reject]` Intent (f): `adapted: DIV-9.2` with no marker in the body — the shard's lines all carry it for the shared Ref counters in CountsEnumerations, where the marker lives; the test body itself adapts nothing.
  - `[false]` `[reject]` Intent: R1 delivered by recorded runs, not this diff — expected for a resume; the full Story harness ran on this tree (136, differ 0).
- Fidelity Review (tree 92950b0dd8f5c8d205c904cfb4685c8306647232): reviewer 2 pass; reviewer 1 reject, F-8, one `missing-evidence` finding on `SupportLazyCollectionIsLazyTest.test.ts`: the prompt does not show the runtime `array_sum` implementation. F-8 is a core item, so the gap blocks (`decisions/MAINT-2026-10-24-evidence-gaps.md`). The evidence exists at `packages/runtime/src/php/arithmetic.ts:65`, but `fileImports` leaves `@xaravel/…` imports out of the prompt. Routed as ESC-14.8-3 (Protected tool change under the 2026-10-21 amendment); a code comment would not show reviewers the implementation, so no in-Story answer exists.

## Verification

- `bun run harness --fast --story 14.8` after translation before implementation; record seed and baseline.
- `bun run typecheck` and `bun run lint`; pass.
- `bun run harness --story 14.8` and `bun run harness --component collections`; zero differences for released outcomes.
- `bun run harness --xaravel --id 'XT-collections-*'`; report actual XT15/16 results, never disguise blocked close as pass.
- `bun run api-surface:gate collections`; must pass for done; otherwise escalate exact remaining failures.
- `bun run harness` foreground; outside sandbox if infrastructure timeouts occur. No unexplained differences.
- `bun run expectations:check`, `bun run escalations:check`, `git diff --check`; pass.
- `bun run story:check 14.8`; required for done after remote full-run proof and current Fidelity passes. A blocked close criterion remains a block.

## Implementation result (2026-10-28)

Translated the complete canonical CountsEnumerations helper and 135 executable
canonical methods in original order. The remaining complete method,
`testFlatMapIsLazy`, is preserved with its proposed translation in ESC-14.8-2:
its first, deliberately unexecuted callback names the missing runtime
`array_sum` contract. No local substitute or declaration-only builtin was added.
Its Expectations line remains `not-ported-yet`, linked to that Escalation.

All 132 independent executable canonical methods pass with their original source
counts and assertion order. No production method needed repair: the existing
implementation already satisfies the observed deferred and partial-consumption
boundaries. The three clock methods retain complete bodies and report actual
`BlockedByComponentError(support)` through the established test boundary.
Only this Story's Expectations shard changed: 132 observed passes, three genuine
Support holds and one retained pending contract.

XT-collections-15 exercises public results with deferred keyed transformations,
exact early source stops, chunk counts, full single enumerations, ordinary replay,
remembered prefixes and finite consumption of an infinite source. XT-collections-16
is incomplete and unregistered, preserved as pending documentary code in
ESC-14.8-1. The unchanged API gate still fails with 268 unexplained findings;
its Protected syntactic analysis/citation repair and the separately owned
Reflection dependency release require scoped authorization. This Story and the
Epic are blocked, not done; no gate waiver or fabricated XT pass is proposed.

Observed verification on the implementation tree:

- Before any production changes, `bun run harness --fast --story 14.8` sampled
  100 comparisons with seed `2ac145c5`, producing 99 differences against the old
  not-ported Expectations (observed passes and genuine clock holds). The complete
  pre-release Story run checked 136 and differed on 135 for the same reason;
  the unregistered FlatMap ID matched its pending Expectation.
- After updating only owned outcomes, `bun run harness --story 14.8` checked 136
  with zero differences, and `bun run harness --component collections` checked
  1,029 with zero differences. Bun test's internal exit 1 reflects expected held
  test bodies; the harness itself exits 0 after matching their classifications.
- `bun run harness --xaravel --component collections` is rejected by the harness
  argument parser. Its supported equivalent,
  `bun run harness --xaravel --id 'XT-collections-*'`, passes 15/15 registered
  tests. XT16 is not among them and remains an explicit completion blocker.
- `bun run typecheck` and `bun run lint` pass. Ordered assertion/helper-call
  comparison against every original method found no discrepancies, including
  the preserved pending FlatMap body.
- `bun run expectations:check`, `bun run escalations:check` and
  `git diff --check` pass.
- `bun run api-surface:gate collections` remains exit 1, 268 unexplained.
  ESC-14.8-1 records inherited/mixin false missing reports, genuine signature
  findings and the read-only Reflection re-verification. No Protected tool,
  citation, Reflection source or Reflection Expectations file changed.

Full global, standalone installation, remote proof, Fidelity and story:check
results are recorded by the parent verification workflow when available. None
can erase the two open Escalations or satisfy the blocked Epic-close criterion.

Additional independent close checks: docs include DIV-1 and DIV-12, all eight
async companions are present for Collection, LazyCollection and Enumerable, and
the Collections license retains Taylor Otwell's notice beside Xaravel's. An
isolated source workspace containing only unchanged Collections and its four
production dependency packages installed successfully with Bun 1.4.3 after
removing development dependencies from the copied manifests. Public Collection
mapping/JSON and infinite LazyCollection take(3) consumed exactly three items
outside the repository. No original-root node_modules links were used. This
proves the source dependency closure, not publication packaging: installing
local tarballs encountered registry 404 for unpublished transitive 0.0.0 versions;
an override attempt hung and was stopped. ESC-14.8-1 preserves the complete
source-installation fixture for pending XT16, explicitly distinguishing this
proof from the incomplete tarball check.

Read-only `bun run harness --component reflection --id '*testGetClassAttributes'`
checked one comparison with zero differences: it still matches its existing
`blocked-by:collections` line, rather than proving Reflection has been released.

## Fidelity Review

### Reviewer 1: pass at tree 3cc5b0ad16b22a81b5025ffe34e48c7c3319a6bd

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T00:59:11.840Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared the registered Ported Tests and CountsEnumerations helper with the supplied Upstream methods and trait. Assertion subjects, expected counts and order match; the unregistered flatMap test remains explicitly pending. |
| F-2: No expected value is weakened | pass | Expected counts, exact comparisons and exception classes are preserved. Ref value reads change representation under DIV-9.2 without weakening expectations. |
| F-3: No assertion is removed without a DIV clause | pass | Each registered Ported Test retains its Upstream assertion counterparts, including all assertions in the three blocked clock tests. The unported flatMap test is explicitly skipped rather than partially registered. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap retains not-ported-yet because Runtime is earlier and cannot qualify as its blocker. These reasons preserve the conformance denominator. |
| F-5: Every `adapted` marker matches its clause | pass | Compared DIV-9.2 markers and Expectations adaptations with its array and by-reference rules. Ref boxes and value reads fit the clause, with expected values unchanged. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred enumeration, exact partial and full consumption, keyed results, early termination, cached prefixes and replay as declared. XT-collections-16 is explicitly documentary and unregistered. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes remain within Collections tests, documentation and conformance records. Support seams unconditionally report the dependency block and provide no substitute clock behavior; no other Component implementation is added to obtain a passing test. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file is changed and no @​asyncRoot tag is added or retained in a touched source file. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The Story changes no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"3cc5b0ad16b22a81b5025ffe34e48c7c3319a6bd","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-29T00:59:11.840Z","items":[{"id":"F-1","result":"pass","note":"Compared the registered Ported Tests and CountsEnumerations helper with the supplied Upstream methods and trait. Assertion subjects, expected counts and order match; the unregistered flatMap test remains explicitly pending.","findings":[]},{"id":"F-2","result":"pass","note":"Expected counts, exact comparisons and exception classes are preserved. Ref value reads change representation under DIV-9.2 without weakening expectations.","findings":[]},{"id":"F-3","result":"pass","note":"Each registered Ported Test retains its Upstream assertion counterparts, including all assertions in the three blocked clock tests. The unported flatMap test is explicitly skipped rather than partially registered.","findings":[]},{"id":"F-4","result":"pass","note":"The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap retains not-ported-yet because Runtime is earlier and cannot qualify as its blocker. These reasons preserve the conformance denominator.","findings":[]},{"id":"F-5","result":"pass","note":"Compared DIV-9.2 markers and Expectations adaptations with its array and by-reference rules. Ref boxes and value reads fit the clause, with expected values unchanged.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred enumeration, exact partial and full consumption, keyed results, early termination, cached prefixes and replay as declared. XT-collections-16 is explicitly documentary and unregistered.","findings":[]},{"id":"F-8","result":"pass","note":"Changes remain within Collections tests, documentation and conformance records. Support seams unconditionally report the dependency block and provide no substitute clock behavior; no other Component implementation is added to obtain a passing test.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file is changed and no @asyncRoot tag is added or retained in a touched source file.","findings":[]},{"id":"F-10","result":"n/a","note":"The Story changes no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 3cc5b0ad16b22a81b5025ffe34e48c7c3319a6bd

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T00:59:11.840Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared the registered Ported Tests and CountsEnumerations helper with the supplied Upstream tests and trait. Assertion subjects, expected counts and order are preserved; pending and Support-blocked tests are identified explicitly. |
| F-2: No expected value is weakened | pass | Upstream comparisons, exact enumeration counts and caught exception classes are preserved. Ref reads change representation under DIV-9.2 without weakening expected values. |
| F-3: No assertion is removed without a DIV clause | pass | The registered test bodies retain their Upstream assertion counterparts, including assertions delegated through CountsEnumerations. The unregistered flatMap test remains explicitly not-ported-yet rather than claiming reduced coverage. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Compared all four skip lines with Upstream dependencies and the supplied precedence and phase rules. Support clock dependencies justify blocked-by:support; the earlier Runtime contract gap correctly remains not-ported-yet. |
| F-5: Every `adapted` marker matches its clause | pass | Compared DIV-9.2 markers and Expectations adaptations with its supplied clause. Ref boxes and array representations preserve the original expected values. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred enumeration, exact partial and full consumption, keyed results, early termination, caching and replay as its consequence declares. XT-collections-16 is explicitly documentary and unregistered. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes remain within Collections tests, documentation and conformance records. Support seams throw dependency errors and their tests remain blocked; no substitute clock or Runtime array_sum implementation makes tests pass. |
| F-9: Every `@asyncRoot` tag is true | n/a | The change touches no framework source file and adds or retains no applicable @​asyncRoot tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"3cc5b0ad16b22a81b5025ffe34e48c7c3319a6bd","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-29T00:59:11.840Z","items":[{"id":"F-1","result":"pass","note":"Compared the registered Ported Tests and CountsEnumerations helper with the supplied Upstream tests and trait. Assertion subjects, expected counts and order are preserved; pending and Support-blocked tests are identified explicitly.","findings":[]},{"id":"F-2","result":"pass","note":"Upstream comparisons, exact enumeration counts and caught exception classes are preserved. Ref reads change representation under DIV-9.2 without weakening expected values.","findings":[]},{"id":"F-3","result":"pass","note":"The registered test bodies retain their Upstream assertion counterparts, including assertions delegated through CountsEnumerations. The unregistered flatMap test remains explicitly not-ported-yet rather than claiming reduced coverage.","findings":[]},{"id":"F-4","result":"pass","note":"Compared all four skip lines with Upstream dependencies and the supplied precedence and phase rules. Support clock dependencies justify blocked-by:support; the earlier Runtime contract gap correctly remains not-ported-yet.","findings":[]},{"id":"F-5","result":"pass","note":"Compared DIV-9.2 markers and Expectations adaptations with its supplied clause. Ref boxes and array representations preserve the original expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred enumeration, exact partial and full consumption, keyed results, early termination, caching and replay as its consequence declares. XT-collections-16 is explicitly documentary and unregistered.","findings":[]},{"id":"F-8","result":"pass","note":"Changes remain within Collections tests, documentation and conformance records. Support seams throw dependency errors and their tests remain blocked; no substitute clock or Runtime array_sum implementation makes tests pass.","findings":[]},{"id":"F-9","result":"n/a","note":"The change touches no framework source file and adds or retains no applicable @asyncRoot tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 52ff20a34d22f9563ada4535e4345e70753815d3

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T01:01:54.280Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | fail | Compared the added Ported Tests and CountsEnumerations helper with the supplied Upstream tests and trait. Three tests have no registered counterparts, and testIntersectIsLazy changes its inputs. |
| F-2: No expected value is weakened | pass | The supplied assertion counterparts retain Upstream's exact expected counts, comparison methods and exception classes; Ref reads leave expected values unchanged. |
| F-3: No assertion is removed without a DIV clause | fail | Compared assertion coverage with the Inventory and Upstream bodies. Six assertions lack registered counterparts, and DIV-9 has no fewer_assertions allowance. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Compared all four retained skip lines with dependency evidence and precedence. Support clock tests correctly use blocked-by:support; the missing earlier Runtime array_sum contract correctly retains not-ported-yet with ESC-14.8-2. |
| F-5: Every `adapted` marker matches its clause | pass | Compared DIV-9.2 markers and Expectations adaptations with its clause. Ref boxes and PHP array representations preserve expected values and match the permitted adaptation. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred construction, exact partial and full consumption, keyed results, replay, caching and finite consumption of an infinite source as declared. XT-collections-16 is explicitly documentary and unregistered. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed code with Collections scope. No other Component implementation is added; Support seams throw dependency errors and their tests remain blocked, while Runtime array_sum is left pending. |
| F-9: Every `@asyncRoot` tag is true | n/a | The change touches no framework source file and adds or retains no applicable @​asyncRoot tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no Oracle request file. |

Findings:

- **F-1** `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass.
- **F-1** `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3].
- **F-3** `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"52ff20a34d22f9563ada4535e4345e70753815d3","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-29T01:01:54.280Z","items":[{"id":"F-1","result":"fail","note":"Compared the added Ported Tests and CountsEnumerations helper with the supplied Upstream tests and trait. Three tests have no registered counterparts, and testIntersectIsLazy changes its inputs.","findings":[{"path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass.","kind":"defect"},{"path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3].","kind":"defect"}]},{"id":"F-2","result":"pass","note":"The supplied assertion counterparts retain Upstream's exact expected counts, comparison methods and exception classes; Ref reads leave expected values unchanged.","findings":[]},{"id":"F-3","result":"fail","note":"Compared assertion coverage with the Inventory and Upstream bodies. Six assertions lack registered counterparts, and DIV-9 has no fewer_assertions allowance.","findings":[{"path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions.","kind":"defect"}]},{"id":"F-4","result":"pass","note":"Compared all four retained skip lines with dependency evidence and precedence. Support clock tests correctly use blocked-by:support; the missing earlier Runtime array_sum contract correctly retains not-ported-yet with ESC-14.8-2.","findings":[]},{"id":"F-5","result":"pass","note":"Compared DIV-9.2 markers and Expectations adaptations with its clause. Ref boxes and PHP array representations preserve expected values and match the permitted adaptation.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred construction, exact partial and full consumption, keyed results, replay, caching and finite consumption of an infinite source as declared. XT-collections-16 is explicitly documentary and unregistered.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed code with Collections scope. No other Component implementation is added; Support seams throw dependency errors and their tests remain blocked, while Runtime array_sum is left pending.","findings":[]},{"id":"F-9","result":"n/a","note":"The change touches no framework source file and adds or retains no applicable @asyncRoot tags.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 52ff20a34d22f9563ada4535e4345e70753815d3

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T01:01:54.280Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared the added Ported Tests and CountsEnumerations helper with the supplied Upstream methods and trait. Assertion subjects, expected counts and order are preserved; clock tests retain their assertions behind explicit dependency blocks. |
| F-2: No expected value is weakened | pass | Upstream equality checks, exact enumeration counts and exception catch classes remain unchanged. Ref readbacks use the permitted DIV-9.2 adaptation. |
| F-3: No assertion is removed without a DIV clause | pass | Every added Ported Test retains its Upstream assertion count, including helper assertions. FlatMap remains explicitly unported rather than registering a reduced test. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Compared all four skip lines with Upstream dependencies and precedence. Support clock dependencies justify blocked-by:support; the earlier Runtime dependency leaves FlatMap not-ported-yet with its escalation. All remain in the denominator. |
| F-5: Every `adapted` marker matches its clause | pass | Compared DIV-9.2 markers and Expectations adaptations with its clause. They represent PHP arrays and by-reference counters through the prescribed value forms and Ref boxes without changing expected values. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred construction, exact partial and full consumption, keyed results, early termination, replay and cached prefixes as declared. XT-collections-16 is explicitly documentary and unregistered. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change implements no other Component's behavior. Missing Support seams throw dependency errors and their tests remain blocked; missing Runtime array_sum is escalated without a substitute implementation. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file is touched and no @​asyncRoot tag is added or retained in changed code. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"52ff20a34d22f9563ada4535e4345e70753815d3","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-29T01:01:54.280Z","items":[{"id":"F-1","result":"pass","note":"Compared the added Ported Tests and CountsEnumerations helper with the supplied Upstream methods and trait. Assertion subjects, expected counts and order are preserved; clock tests retain their assertions behind explicit dependency blocks.","findings":[]},{"id":"F-2","result":"pass","note":"Upstream equality checks, exact enumeration counts and exception catch classes remain unchanged. Ref readbacks use the permitted DIV-9.2 adaptation.","findings":[]},{"id":"F-3","result":"pass","note":"Every added Ported Test retains its Upstream assertion count, including helper assertions. FlatMap remains explicitly unported rather than registering a reduced test.","findings":[]},{"id":"F-4","result":"pass","note":"Compared all four skip lines with Upstream dependencies and precedence. Support clock dependencies justify blocked-by:support; the earlier Runtime dependency leaves FlatMap not-ported-yet with its escalation. All remain in the denominator.","findings":[]},{"id":"F-5","result":"pass","note":"Compared DIV-9.2 markers and Expectations adaptations with its clause. They represent PHP arrays and by-reference counters through the prescribed value forms and Ref boxes without changing expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred construction, exact partial and full consumption, keyed results, early termination, replay and cached prefixes as declared. XT-collections-16 is explicitly documentary and unregistered.","findings":[]},{"id":"F-8","result":"pass","note":"The change implements no other Component's behavior. Missing Support seams throw dependency errors and their tests remain blocked; missing Runtime array_sum is escalated without a substitute implementation.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file is touched and no @asyncRoot tag is added or retained in changed code.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```


### 2026-10-28 — Fidelity evidence correction pass
- verdicts: 3 findings — high 0, medium 0, low 0, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Reviewer 1 F-1 claims three registrations missing — all are present with both helper assertions: intersectByKeys at lines 589ff, sortKeys at 1280ff and sortKeysDesc at 1291ff of the reviewed test file (before evidence comments: 581, 1272, 1283). Full Story execution reports their individual passes. Added explicit pinned-source anchors in the test file to supply evidence on a changed tree; no assertion changes.
  - `[false]` `[reject]` Reviewer 1 F-1 claims intersect should use [1,2] — actual pinned Upstream lines 535/539 both use [1,2,3], matching the port exactly. Added direct source anchors outside bookkeeping. The requested edit would change canonical inputs and is not applied.
  - `[false]` `[reject]` Reviewer 1 F-3 claims six assertions absent — each of the three registered tests contains assertDoesNotEnumerate then assertEnumeratesOnce, identical to pinned Upstream. No assertion was omitted, and no DIV waiver is needed. Historical reject retained; fresh review must address P findings against newly supplied test evidence before merge.

Reviewer 2 passed this same tree. Reviewer 1's reject is not treated as an evidence-gap exception or waived; its historical records remain immutable. The changed test comments supply the precise source-to-registration evidence; a new counted review is required.

### Reviewer 1: pass at tree 0e0056915cd83f715f029f5035a474ef1b561643

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T01:03:07.803Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared registered ports and CountsEnumerations with the supplied PHP tests and trait. Assertion subjects, values and order match, including the three disputed registrations and intersect([1, 2, 3]). FlatMap remains explicitly unported. |
| F-2: No expected value is weakened | pass | Source counts, exact recorder comparison and exception catches retain Upstream's expectations. Ref reads preserve values under DIV-9.2; no comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Registered ports retain their Upstream assertion counts through the supplied helper. The six disputed assertions are present; FlatMap is pending as a whole test rather than registered with fewer assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap retains not-ported-yet because Runtime is earlier. Supplied phase evidence and precedence support these classifications. |
| F-5: Every `adapted` marker matches its clause | pass | DIV-9.2 permits the Ref boxes and PHP array representations used here. Marked assertions retain their original expected values, and Expectations adaptations reflect the shared helper's Ref conversion. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred construction, keyed public results, exact partial and full consumption, early termination and replay as declared. XT-collections-16 is explicitly documentary and unregistered, with no Epic-close pass claimed. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes remain within Collections tests, documentation and conformance records. Support seams throw dependency errors and their tests remain blocked; no substitute clock or Runtime builtin makes a test pass. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file or @​asyncRoot tag is added or modified. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-1) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass. **fixed**: All three named tests have executable registrations with construction and full-enumeration checks matching the supplied Upstream bodies.
- **P-2** (reviewer 1, F-1) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3]. **fixed**: The supplied Upstream source explicitly uses intersect([1, 2, 3]) in both callbacks, matching the port. This supplies evidence resolving the earlier finding's incorrect input claim.
- **P-3** (reviewer 1, F-3) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions. **fixed**: The three disputed registrations contain all six assertion-helper calls, whose supplied implementation preserves Upstream's assertions.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"0e0056915cd83f715f029f5035a474ef1b561643","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-29T01:03:07.803Z","items":[{"id":"F-1","result":"pass","note":"Compared registered ports and CountsEnumerations with the supplied PHP tests and trait. Assertion subjects, values and order match, including the three disputed registrations and intersect([1, 2, 3]). FlatMap remains explicitly unported.","findings":[]},{"id":"F-2","result":"pass","note":"Source counts, exact recorder comparison and exception catches retain Upstream's expectations. Ref reads preserve values under DIV-9.2; no comparison is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Registered ports retain their Upstream assertion counts through the supplied helper. The six disputed assertions are present; FlatMap is pending as a whole test rather than registered with fewer assertions.","findings":[]},{"id":"F-4","result":"pass","note":"The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap retains not-ported-yet because Runtime is earlier. Supplied phase evidence and precedence support these classifications.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-9.2 permits the Ref boxes and PHP array representations used here. Marked assertions retain their original expected values, and Expectations adaptations reflect the shared helper's Ref conversion.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred construction, keyed public results, exact partial and full consumption, early termination and replay as declared. XT-collections-16 is explicitly documentary and unregistered, with no Epic-close pass claimed.","findings":[]},{"id":"F-8","result":"pass","note":"Changes remain within Collections tests, documentation and conformance records. Support seams throw dependency errors and their tests remain blocked; no substitute clock or Runtime builtin makes a test pass.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file or @asyncRoot tag is added or modified.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-1","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass.","fixed":true,"note":"All three named tests have executable registrations with construction and full-enumeration checks matching the supplied Upstream bodies."},{"id":"P-2","reviewer":1,"item":"F-1","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3].","fixed":true,"note":"The supplied Upstream source explicitly uses intersect([1, 2, 3]) in both callbacks, matching the port. This supplies evidence resolving the earlier finding's incorrect input claim."},{"id":"P-3","reviewer":1,"item":"F-3","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions.","fixed":true,"note":"The three disputed registrations contain all six assertion-helper calls, whose supplied implementation preserves Upstream's assertions."}]}
```

### Reviewer 2: pass at tree 0e0056915cd83f715f029f5035a474ef1b561643

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `76b387f397bcc37339fe95966900678fd181cffc`, on 2026-10-29T01:03:07.803Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared registered Ported Tests and CountsEnumerations with the supplied Upstream methods and trait. Assertion subjects, expected counts and order match. The three disputed registrations are present; Upstream explicitly uses intersect([1, 2, 3]) in both callbacks. FlatMap remains explicitly unported. |
| F-2: No expected value is weakened | pass | Upstream's assertSame and assertEquals comparisons, exact enumeration counts and caught exception classes are preserved. Ref reads change representation only. |
| F-3: No assertion is removed without a DIV clause | pass | Compared assertion-helper calls and their implementations against Upstream. Registered tests retain their assertion counts, including all six previously disputed assertions. FlatMap remains a pending whole test rather than a reduced port. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap's earlier Runtime dependency cannot use blocked-by:runtime under the supplied rule, so not-ported-yet with ESC-14.8-2 is justified. These reasons retain the conformance denominator. |
| F-5: Every `adapted` marker matches its clause | pass | Compared DIV-9.2 markers and Expectations adaptations with the supplied clause. They cover by-reference enumeration counters represented by Ref boxes, with unchanged expected values. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory reports no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-15 checks deferred construction, keyed public results, exact partial and full consumption, early termination, replay and remembered prefixes as its consequence declares. XT-collections-16 is documentary and explicitly unregistered; no Epic-close pass is claimed. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change adds Collections tests and documentation without implementing another Component. Support seams throw dependency errors and their tests remain blocked; missing Runtime array_sum is escalated rather than locally implemented. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file is changed and no @​asyncRoot tag is added or retained in a touched source file. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-1) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass. **fixed**: All three named tests are registered, each with zero-enumeration and full-enumeration assertion-helper calls.
- **P-2** (reviewer 1, F-1) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3]. **fixed**: The supplied Upstream source establishes [1, 2, 3] in both testIntersectIsLazy callbacks, matching the port and correcting the earlier finding's premise.
- **P-3** (reviewer 1, F-3) `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions. **fixed**: The three named registrations contain all six assertions, and CountsEnumerations implements the matching Upstream comparisons.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"0e0056915cd83f715f029f5035a474ef1b561643","base":"76b387f397bcc37339fe95966900678fd181cffc","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-29T01:03:07.803Z","items":[{"id":"F-1","result":"pass","note":"Compared registered Ported Tests and CountsEnumerations with the supplied Upstream methods and trait. Assertion subjects, expected counts and order match. The three disputed registrations are present; Upstream explicitly uses intersect([1, 2, 3]) in both callbacks. FlatMap remains explicitly unported.","findings":[]},{"id":"F-2","result":"pass","note":"Upstream's assertSame and assertEquals comparisons, exact enumeration counts and caught exception classes are preserved. Ref reads change representation only.","findings":[]},{"id":"F-3","result":"pass","note":"Compared assertion-helper calls and their implementations against Upstream. Registered tests retain their assertion counts, including all six previously disputed assertions. FlatMap remains a pending whole test rather than a reduced port.","findings":[]},{"id":"F-4","result":"pass","note":"The three clock tests require absent Support behavior and correctly use blocked-by:support. FlatMap's earlier Runtime dependency cannot use blocked-by:runtime under the supplied rule, so not-ported-yet with ESC-14.8-2 is justified. These reasons retain the conformance denominator.","findings":[]},{"id":"F-5","result":"pass","note":"Compared DIV-9.2 markers and Expectations adaptations with the supplied clause. They cover by-reference enumeration counters represented by Ref boxes, with unchanged expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory reports no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-15 checks deferred construction, keyed public results, exact partial and full consumption, early termination, replay and remembered prefixes as its consequence declares. XT-collections-16 is documentary and explicitly unregistered; no Epic-close pass is claimed.","findings":[]},{"id":"F-8","result":"pass","note":"The change adds Collections tests and documentation without implementing another Component. Support seams throw dependency errors and their tests remain blocked; missing Runtime array_sum is escalated rather than locally implemented.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file is changed and no @asyncRoot tag is added or retained in a touched source file.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-1","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Add registered counterparts for testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. Each Upstream test checks both zero enumeration on construction and one full enumeration on all(); their Expectations currently claim pass.","fixed":true,"note":"All three named tests are registered, each with zero-enumeration and full-enumeration assertion-helper calls."},{"id":"P-2","reviewer":1,"item":"F-1","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"In both testIntersectIsLazy callbacks, restore intersect([1, 2]); Upstream uses [1, 2], while the port uses [1, 2, 3].","fixed":true,"note":"The supplied Upstream source establishes [1, 2, 3] in both testIntersectIsLazy callbacks, matching the port and correcting the earlier finding's premise."},{"id":"P-3","reviewer":1,"item":"F-3","path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Restore both assertions for each missing test: testIntersectByKeysIsLazy, testSortKeysIsLazy and testSortKeysDescIsLazy. No supplied DIV clause permits omitting these six assertions.","fixed":true,"note":"The three named registrations contain all six assertions, and CountsEnumerations implements the matching Upstream comparisons."}]}
```

### Reviewer 1: reject at tree 92950b0dd8f5c8d205c904cfb4685c8306647232

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd`, on 2026-10-30T00:05:21.922Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | The added testFlatMapIsLazy preserves Upstream's inputs, callback operations and two enumeration assertions, in order; the supplied helper bodies preserve their subjects. |
| F-2: No expected value is weakened | pass | The added port retains exact enumeration counts of zero and three through assertEquals, matching Upstream; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Both Upstream testFlatMapIsLazy assertions have executable counterparts; neither is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The only changed Expectations outcome removes a skip; no new skip reason requires justification. |
| F-5: Every `adapted` marker matches its clause | pass | The new DIV-9.2 Expectations adaptation matches the list representation and the enumeration helpers' Ref boxes, without changing expected counts. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-16 checks the declared Expectations, async companion inventory, divergence documentation, notices, API gate and isolated source installation. Its installation claim stays within the source-installation limitation of ESC-14.8-1. |
| F-8: No stub, fake or partial implementation of another Component | fail | The diff stays within Collections and imports array_sum rather than defining a substitute, but the prompt does not establish that the imported Runtime contract is a real implementation as ESC-14.8-2 requires. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file or @​asyncRoot tag is added or modified. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-8** `packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts`: Supply the Runtime array_sum export and implementation, with evidence of its separately landed Oracle-verified contract. The import and comments alone cannot establish that this is neither a declaration-only export nor a partial substitute; the non-enumerating callback never executes it. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"92950b0dd8f5c8d205c904cfb4685c8306647232","base":"7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T00:05:21.922Z","items":[{"id":"F-1","result":"pass","note":"The added testFlatMapIsLazy preserves Upstream's inputs, callback operations and two enumeration assertions, in order; the supplied helper bodies preserve their subjects.","findings":[]},{"id":"F-2","result":"pass","note":"The added port retains exact enumeration counts of zero and three through assertEquals, matching Upstream; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Both Upstream testFlatMapIsLazy assertions have executable counterparts; neither is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The only changed Expectations outcome removes a skip; no new skip reason requires justification.","findings":[]},{"id":"F-5","result":"pass","note":"The new DIV-9.2 Expectations adaptation matches the list representation and the enumeration helpers' Ref boxes, without changing expected counts.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-16 checks the declared Expectations, async companion inventory, divergence documentation, notices, API gate and isolated source installation. Its installation claim stays within the source-installation limitation of ESC-14.8-1.","findings":[]},{"id":"F-8","result":"fail","note":"The diff stays within Collections and imports array_sum rather than defining a substitute, but the prompt does not establish that the imported Runtime contract is a real implementation as ESC-14.8-2 requires.","findings":[{"path":"packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts","detail":"Supply the Runtime array_sum export and implementation, with evidence of its separately landed Oracle-verified contract. The import and comments alone cannot establish that this is neither a declaration-only export nor a partial substitute; the non-enumerating callback never executes it.","kind":"missing-evidence"}]},{"id":"F-9","result":"n/a","note":"No framework source file or @asyncRoot tag is added or modified.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 92950b0dd8f5c8d205c904cfb4685c8306647232

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd`, on 2026-10-30T00:05:21.922Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | The only added Ported Test is testFlatMapIsLazy. I compared it with Upstream lines 425-440: make([1,2,3,4,5]); assertDoesNotEnumerateCollection with flatMap(fn => array_sum($values)); assertEnumeratesCollection(data, 3, flatMap(fn => range(1,$value))->take(5)->all()). The port has the same data, helpers, callbacks and expected counts (0 and 3), in the same order. The checks themselves run through the CountsEnumerations port, which is unchanged. |
| F-2: No expected value is weakened | pass | testFlatMapIsLazy keeps both expected counts (0 enumerations at construction, 3 for take(5)) through the same assertEquals-based helpers as Upstream's trait. No expected value, comparison or exception was loosened. |
| F-3: No assertion is removed without a DIV clause | pass | The Inventory gives testFlatMapIsLazy two assertEquals assertions, and the port makes both helper calls. Both assertions are kept, so no DIV clause is needed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. The one changed line (testFlatMapIsLazy) moves from skip/not-ported-yet to pass, and the three blocked-by:support lines are unchanged. |
| F-5: Every `adapted` marker matches its clause | pass | The changed Expectations line carries adapted DIV-9.2. That adaptation is in the CountsEnumerations helpers the test uses: Ref boxes replace PHP's by-reference $enumerated counter and are read back through .value, each marked adapted:DIV-9.2. DIV-9.2 allows exactly this, with expected values unchanged. The change adds no new inline markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned or changed Oracle fixture whose output is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-16 checks each claim in its description: - no not-ported-yet reason in the four canonical Expectations files; - Reflection's testGetClassAttributes is not blocked-by:collections; - async-surface.json lists all eight companions with root callback for Collection, LazyCollection and Enumerable; - the docs contain the Divergences section and cite DIV-1 and DIV-12; - LICENSE keeps both the Taylor Otwell and the Xaravel notices; - a standalone production-only install plus a smoke run succeeds (the AD-2 dependency closure); - api-surface:gate collections exits 0. Its citations are bare FR-23, AD-2 and AD-6, with no numbered FR-n.k or AD-n.k token that could name the wrong bullet. Two weak points do not fail the item: 'unchanged' in front of 'API gate' describes the gate rather than something the test can prove, and FR-23 is only covered indirectly (the canonical files and the smoke test's list-shape JSON). |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes are limited to Collections tests, docs and Expectations. testFlatMapIsLazy imports the runtime's real array_sum and range, as ESC-14.8-2 authorizes, with no local substitute. The clock-boundary throwing seams already existed and the change does not touch them. No stub, fake or partial implementation of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | n/a | The change touches no packages/*/src file and adds no @​asyncRoot tag (evidence (d) and (g)). |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"92950b0dd8f5c8d205c904cfb4685c8306647232","base":"7ac1bdfdc2b336e67ef7a71a318d043b8e9f99cd","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T00:05:21.922Z","items":[{"id":"F-1","result":"pass","note":"The only added Ported Test is testFlatMapIsLazy. I compared it with Upstream lines 425-440: make([1,2,3,4,5]); assertDoesNotEnumerateCollection with flatMap(fn => array_sum($values)); assertEnumeratesCollection(data, 3, flatMap(fn => range(1,$value))->take(5)->all()). The port has the same data, helpers, callbacks and expected counts (0 and 3), in the same order. The checks themselves run through the CountsEnumerations port, which is unchanged.","findings":[]},{"id":"F-2","result":"pass","note":"testFlatMapIsLazy keeps both expected counts (0 enumerations at construction, 3 for take(5)) through the same assertEquals-based helpers as Upstream's trait. No expected value, comparison or exception was loosened.","findings":[]},{"id":"F-3","result":"pass","note":"The Inventory gives testFlatMapIsLazy two assertEquals assertions, and the port makes both helper calls. Both assertions are kept, so no DIV clause is needed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip. The one changed line (testFlatMapIsLazy) moves from skip/not-ported-yet to pass, and the three blocked-by:support lines are unchanged.","findings":[]},{"id":"F-5","result":"pass","note":"The changed Expectations line carries adapted DIV-9.2. That adaptation is in the CountsEnumerations helpers the test uses: Ref boxes replace PHP's by-reference $enumerated counter and are read back through .value, each marked adapted:DIV-9.2. DIV-9.2 allows exactly this, with expected values unchanged. The change adds no new inline markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned or changed Oracle fixture whose output is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-16 checks each claim in its description:\n- no not-ported-yet reason in the four canonical Expectations files;\n- Reflection's testGetClassAttributes is not blocked-by:collections;\n- async-surface.json lists all eight companions with root callback for Collection, LazyCollection and Enumerable;\n- the docs contain the Divergences section and cite DIV-1 and DIV-12;\n- LICENSE keeps both the Taylor Otwell and the Xaravel notices;\n- a standalone production-only install plus a smoke run succeeds (the AD-2 dependency closure);\n- api-surface:gate collections exits 0.\nIts citations are bare FR-23, AD-2 and AD-6, with no numbered FR-n.k or AD-n.k token that could name the wrong bullet. Two weak points do not fail the item: 'unchanged' in front of 'API gate' describes the gate rather than something the test can prove, and FR-23 is only covered indirectly (the canonical files and the smoke test's list-shape JSON).","findings":[]},{"id":"F-8","result":"pass","note":"The changes are limited to Collections tests, docs and Expectations. testFlatMapIsLazy imports the runtime's real array_sum and range, as ESC-14.8-2 authorizes, with no local substitute. The clock-boundary throwing seams already existed and the change does not touch them. No stub, fake or partial implementation of another Component is added.","findings":[]},{"id":"F-9","result":"n/a","note":"The change touches no packages/*/src file and adds no @asyncRoot tag (evidence (d) and (g)).","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: blocked. Independent coverage is implemented and reviewed: 135 complete canonical bodies are registered, 132 pass and three genuinely report blocked-by:support. The complete FlatMap body remains pending in ESC-14.8-2 for runtime array_sum; XT16 remains incomplete in ESC-14.8-1 for Protected API-gate repair and separately scoped Reflection release. No production change was needed and no other Component, grader or earlier Story Expectations changed. Story and Epic completion are not claimed.

Files: canonical test suite and CountsEnumerations preserve ordered Upstream assertions and exact counts; XT15 verifies public keyed transformations, exact source/factory counts, replay, cache and bounded take from a guarded infinite source; own Expectations record observed outcomes; docs explain consumption and actual holds; Escalations retain complete pending FlatMap/XT16 code; spec/sprint/manifest record blocked status.

All four general review layers ran in two-agent batches. First pass triaged 15 findings: one medium and three low patches, eleven refuted findings; edge and verification-gap returned none. No deferred findings. Fresh Fidelity initially passed, then one reviewer falsely rejected a changed tree for three tests already registered and a canonical input it misread. Three false findings were individually checked against the exact pinned PHP source; explicit source anchors added to the test file supplied that evidence on a changed tree. Immutable reject records remain. Final reviewers both passed tree 0e0056915cd83f715f029f5035a474ef1b561643, and fidelity status prints current. Reviewer 1's unavailable-Claude fallback is recorded; no waiver or missing-evidence acceptance was used. Patched entry counts: high 0, medium 1, low 3; followup_review_recommended=false, with no unverified implementation risk from those small fixes.

Final focused verification: typecheck, lint/disables (943 files), full Story harness (136 comparisons), Collections harness (1029 comparisons), all 15 registered Collections XT tests, Expectations (23291 lines), Escalations (141 records/139 decisions), and whitespace pass. XT16 is explicitly absent and blocks completion. Isolated production source dependency closure installs under Bun1.4.3 and passes Collection mapping plus exact three-item lazy smoke; published tarball installation remains unverified. The first tarball attempt hit unpublished 0.0.0 registry dependencies; the override install hung and was stopped after identifying its PID with approved escalation. No permission-review denial occurred.

story:check was run and fails as expected: FlatMap remains not-ported-yet, XT16 missing, API gate has 268 unexplained findings, two open Escalations, and remote full-run proof unavailable before push (GH_TOKEN absent in that invocation). The check is not weakened and no done status is written. Reflection's read-only harness recheck still observes the existing dependency hold (one comparison, zero differences); separate implementation is required before clearing it.

The first foreground full harness inside sandbox stalled in infrastructure subprocesses and was stopped; the same required command was approved outside sandbox per the iteration's notes. Its final result is appended below before commit. No background harness or reviewer was launched.


Final foreground global verification outside sandbox passed on the repaired tree: XARAVEL tests=487 passed=482 failed=0 skipped=5; SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0. Seven locally unavailable backend Variants are NOT-RUN under AD-17. Final current Fidelity binding is 0e0056915cd83f715f029f5035a474ef1b561643; bookkeeping-only blocked status and this result do not alter it. Independent released coverage is safe to merge while both Escalations and the completion blockers remain explicit.

## Resume result (2026-10-29)

Registered the complete `testFlatMapIsLazy` port from ESC-14.8-2, importing `array_sum` and `range` from `@xaravel/runtime/php`; both original assertions and their counts (0 and 3) are unchanged. Its own Expectations line moved from `not-ported-yet` (ESC-14.8-2) to the observed `pass`, `adapted: DIV-9.2` like every other line of the shard (the shared CountsEnumerations Ref counters). Activated XT-collections-16 from ESC-14.8-1's pending code with its standalone-install fixture beside it, unchanged except for documentation and lint-style arrow parameters; no check was weakened. A deliberate mutation of the smoke's expected count made the test fail, confirming the isolated install and smoke really execute. `docs/collections.md` now describes the released FlatMap test and the Epic-close checks instead of the pending state. No production source changed.

Verification on the working tree (base 7ac1bdfd):

- `bun run typecheck`, `bun run lint` (953 files): pass.
- `bun run harness --story 14.8`: checked 136, differ 0. `bun run harness --component collections`: checked 1029, differ 0.
- `bun run harness --xaravel --id 'XT-collections-*'`: 18/18 pass, XT-collections-15 and XT-collections-16 included.
- `bun run api-surface:gate collections`: 0 unexplained.
- `bun run expectations:check` (23291 lines), `expectations:reasons`, `divergence:check`, `escalations:check` (141/141, none open), `git diff --check`: pass.
- `bun run harness` (foreground): XARAVEL tests=493 passed=488 failed=0 skipped=5; SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0.
- `bun run story:check 14.8`: manifest, tests, xaravel-tests, fixtures, api-surface and escalations PASS; approvals FAIL (no Fidelity verdicts yet for the new tree) and full-run FAIL (GH_TOKEN not set, no pushed head). Both need the review step and a pushed PR; the Story is not done until they pass.

### Auto Run Result (2026-10-29 resume)

Status: blocked
Blocking condition: Fidelity Review F-8 evidence gap: the prompt does not show the runtime `array_sum` the FlatMap port imports. Routed as ESC-14.8-3, a Protected change to `tools/fidelity-review` under the 2026-10-21 amendment.

- **Change:** registered `testFlatMapIsLazy` (ESC-14.8-2) with the real `@xaravel/runtime/php` `array_sum` and `range`, and set its own Expectations line to the observed `pass`. Activated XT-collections-16 (ESC-14.8-1) with its standalone source-install fixture. Updated the Collections docs. No production source changed.
- **Files:** `SupportLazyCollectionIsLazyTest.test.ts` (FlatMap registration), `collections.test.ts` (XT-collections-16 and its fixture), `SupportLazyCollectionIsLazyTest.jsonl` (one own line), `docs/collections.md` (released FlatMap and the Epic-close checks), `conformance/escalations/ESC-14.8-3.md` (new).
- **Review:** 28 findings. 6 low were patched (one root cause each: the copy filter, the Reflection `status`, the DIV-1 boundary, the timeouts and the header wording). 21 were rejected as false; 0 were deferred. Reasons are in the triage log. Patched counts: high 0, medium 0, low 6. `followup_review_recommended` is false.
- **Fidelity:** tree 92950b0d. Reviewer 2 passed. Reviewer 1 rejected F-8 for missing evidence only, which blocks on a core item. The patched tree 8e03cdda has no verdicts. The review must re-run after ESC-14.8-3's tool change lands.
- **Verification (patched tree):**
  - `typecheck`, `lint` (953 files), `expectations:check`, `escalations:check` (142 Escalations, 141 decisions; ESC-14.8-3 is open) and `git diff --check`: pass.
  - Full `bun run harness`: XARAVEL tests=493, passed=488, failed=0, skipped=5. SUMMARY: variants=11, run=4, not-run=7, checked=21817, differ=0.
  - `harness --story 14.8`: 136 checked, differ 0.
  - XT-collections-*: 18 of 18 pass.
  - `api-surface:gate collections`: 0 unexplained.
- **Residual risk:** the standalone check proves only the source dependency closure. Installing a published tarball stays with the Maintainer's release step (AD-18).
