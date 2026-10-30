---
title: 'LazyCollection combine and zip close the iterators they open (epic-14-retro-item-1-lazy-combine-zip-cleanup)'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
baseline_revision: '3ab17b602bec9c62408b6eabb463d5d68265d221'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: []
deferred:
  - summary: >-
      When two owned zip or combine sources both throw from their finally during one close, Xaravel surfaces the first cleanup exception; PHP may surface the later one with the earlier as previous.
    evidence: |-
      deferredIteratorScopes nests the scopes, so JS iterator-close keeps the first throw completion and drops a later return() exception. DIV-9.16 covers a loop-body exception against one finally exception, not two cleanup exceptions. Unverified: a PHP 8.5.11 probe of two throwing generator finally blocks destroyed together would settle PHP's result; if it differs, it needs a DIV clause through the Maintainer.
    location: >-
      packages/collections/src/LazyCollection.ts (deferredIteratorScopes)
    severity: medium (unverified)
  - summary: >-
      A callable returning a freshly built runtime Generator, or a userland IteratorAggregate, is not closed by zip or combine although PHP would destroy it.
    evidence: |-
      makeIterator owns only JS generators it wraps and LazyCollection iterators; this ownership rule predates this item and is shared by every iteratorScope member, since the port cannot tell an unreferenced runtime Generator from a user-held one.
    location: >-
      packages/collections/src/LazyCollection.ts (makeIterator)
    severity: low
---

<intent-contract>

## Intent

**Problem:** `LazyCollection.combine` and `zip` hold manual cursors (`makeIterator`, `getIterator`) with no cleanup, so when the outer lazy generator is abandoned (`first`, `take`, a `break`) or ends by throwing, a temporary user generator they opened never runs its `finally`. PHP destroys those generators with the outer one and runs each `finally` (retro finding S1, `_bmad-output/implementation-artifacts/epic-14-retro-2026-10-29.md`). `packages/collections/docs/collections.md:245-247` records the gap as a residual.

**Approach:** Give both members the same public cleanup traversal the other lazy members use (`iteratorScope`), but started at the point PHP first reads each cursor and closed in PHP's destruction order; add an XT-collections case built from a PHP 8.5.11 probe; remove the docs residual.

## Boundaries & Constraints

**Always:** Change only `packages/collections/**` (plus this spec and its result records). Keep Upstream's statement order and side-effect order: no user generator starts earlier, later or in a different order than in PHP. Only framework-owned temporaries (`#ownedIterators`) are closed; a user-held runtime `Generator` stays resumable. A cleanup exception propagates when no other exception is active; when the body's exception is active, it wins (DIV-9.16), which is what JS iterator-close gives a `for…of` scope.

**Never:** Edit `packages/runtime` (its `TRAVERSAL_EXIT` hook stays internal), `conformance/expectations/**`, a Protected Path, or the item's `action` / `owner` / `epic`. Remove or weaken an assertion. Change `iteratorScope`'s behaviour for its existing callers.

## I/O & Edge-Case Matrix

Sources are generator functions logging `start <n>` on entry and `finally <n>` in a `finally`, each wrapped in `new LazyCollection(...)` unless noted. Expected logs are PHP 8.5.11's at the Pin (probe run 2026-10-29).

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| zip abandoned | `this.zip(a, b).first()` | `start this, start a, start b, finally this, finally a, finally b` | none |
| zip take | `this.zip(a).take(2).all()` | `start this, start a, finally this, finally a` | none |
| zip array this | `new LazyCollection([1,2,3]).zip(a).first()` | `start a, finally a` | none |
| zip callable, break | `for (… of this.zip(fnSource)) { body; break }` | `start this, start fn, body, finally this, finally fn` | none |
| zip exhausted | `this.zip(a).all()` | `start this, start a, finally this, finally a` (unchanged) | none |
| combine abandoned | `this.combine(values).first()` and `.take(2).all()` | `start this, start values, finally values, finally this` | none |
| combine array this | `new LazyCollection([1,2,3]).combine(values).first()` | `start values, finally values` | none |
| combine both empty | both sources yield nothing, `.all()` | `start this, finally this, start values, finally values` (unchanged) | none |
| combine values short | this 3 items, values 2, `.all()` | `start this, start values, finally values, finally this` then `ValueError` | ValueError propagates (unchanged) |
| combine values long | this 2 items, values 3, `.all()` | `start this, start values, finally this, finally values` then `ValueError` | ValueError propagates |

</intent-contract>

## Code Map

- `packages/collections/src/LazyCollection.ts:1093-1117` -- `combine`: `makeIterator(values)` then `for (const key of this)`; no cleanup of `iterator`.
- `packages/collections/src/LazyCollection.ts:1130-1147` -- `zip`: `new Collection(iterables).map(makeIterator).prepend(this.getIterator())`, driven through `HigherOrderCollectionProxy` `contains->valid`, `map->current`, `each->next` (DIV-12.16 form; keep it).
- `packages/collections/src/LazyCollection.ts:1563-1577` -- `iteratorScope`: for an owned iterator, primes `iterator.entries()[Symbol.iterator]()` on entry (runs the user generator to its first yield) and `return()`s it in `finally`; the runtime's `foreachIterator` then calls the internal `TRAVERSAL_EXIT`, which force-closes only owned wrappers (`packages/runtime/src/php/Generator.ts:118-135`, `liveCursor.ts:149-161`). Read-only reuse point.
- `packages/collections/src/LazyCollection.ts:1584-1608` -- `makeIterator` / `#ownedIterators`: which iterators are framework temporaries.
- `packages/collections/src/LazyCollection.ts:1526-1529` -- `[Symbol.iterator]` is `yield* this.getIterator()`, so `for (const key of this)` closes `this`'s source on exit.
- `packages/collections/docs/collections.md:235-247` -- cleanup guarantees paragraph and the residual to remove.
- `packages/collections/tests/xaravel/collections.test.ts` -- XT-collections-1..11 and 16; the item adds XT-collections-19 at the end of the file. XT-collections-17/18 live in `helpers.test.ts` (precedent: retro-item XT tests need no manifest or Expectations line).
- `decisions/DIV-9.md:48` -- DIV-9.16: body exception wins over a `finally` exception during close.

## Tasks & Acceptance

**Execution:**
- `packages/collections/src/LazyCollection.ts` -- add a protected `deferredIteratorScope(iterator)` generator: for a non-owned iterator it yields a no-op start; for an owned one it yields a `start()` that, once, opens and primes the cleanup traversal, and its `finally` returns that traversal if it was opened. Add `deferredIteratorScopes(iterators)` nesting them so the first iterator is innermost (closes first). -- PHP starts a cursor at its first `valid()` / `current()`, which `iteratorScope`'s entry priming would move; nesting order gives PHP's array-destruction order.
- `packages/collections/src/LazyCollection.ts` -- `combine`: keep `makeIterator(values)` first; iterate `this` through a manually stepped `this[Symbol.iterator]()` held in an outer closing scope, with `values`' deferred scope inside it, calling `start()` before each `iterator.valid()`. -- PHP frees `$iterator` (a CV) before the unfinished `foreach` temporary over `$this`.
- `packages/collections/src/LazyCollection.ts` -- `zip`: build the iterators as now, enter `deferredIteratorScopes` over `[this's, ...made]`, and hold each owned iterator in the proxied collection as a cursor that calls its `start()` before forwarding `valid` / `current` / `next`; the proxy loop is unchanged. -- Each owned source then starts where PHP first reads it (`contains->valid()`, then `map->current()`, in index order), even when a user-held Generator or userland Iterator sits before it. (Amended during implementation: an eager start-all pass would start a later owned source before an earlier user iterator is read.)
- `packages/collections/src/LazyCollection.ts` -- update the `combine` / `zip` doc comments and the header comment if needed to state the cleanup.
- `packages/collections/docs/collections.md` -- delete lines 245-247 and name `combine` and `zip` among the members whose temporary sources close on early exit, callback error or throw.
- `packages/collections/tests/xaravel/collections.test.ts` -- add XT-collections-19 covering every row of the I/O matrix, plus: a user-held runtime `Generator` passed to `zip` stays resumable after `first()`; with a throwing `finally` in an abandoned `zip` source, `first()` throws that cleanup exception; and when both the body and a source `finally` throw, the body's exception is seen (DIV-9.16). Cite the PHP 8.5.11 probe in its header comment.

**Acceptance Criteria:**
- Given the I/O matrix, when each scenario runs through the public `LazyCollection` API, then the logged events and the exception match the PHP column exactly.
- Given `packages/collections/docs/collections.md`, when it is read, then no residual says `combine` / `zip` leave temporary generators open.
- Given the full checks, when `bun run harness`, `bun run harness --xaravel`, `bun run typecheck` and `bun run lint` run, then the harness reports no differences and the other commands pass.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 12, false 5, maybe-false 2
- findings:
  - `[maybe-false]` `[defer]` (blind) Two owned sources whose `finally` both throw: nested scopes surface the first cleanup exception, PHP likely surfaces the later one with the earlier as `previous`; not under DIV-9.16's wording — settle with a PHP 8.5.11 probe of two throwing generator `finally`s in one array destruction; deferred as medium (unverified).
  - `[low]` `[reject]` (blind) No case where a source throws mid-enumeration — the outer generator ending by a throw is the same scope exit the `ValueError` rows exercise (thrown inside the lazy generator, both scopes close in the logged order); a separate source-throw row adds no new path.
  - `[low]` `[reject]` (blind) Consequence string names `break` and resumable Generators for both members, tests cover them on `zip` only — `combine` uses the same `deferredIteratorScope` / ownership rule; both Fidelity reviewers passed F-7 on the string.
  - `[low]` `[reject]` (blind) PHP probe not committed beside the test as XT-17/18 did — the logs are in the test header and the spec matrix; committing a re-runnable probe is new tooling, not a direct correction.
  - `[low]` `[patch]` (blind) `zip take(2)` / `zip exhausted` assert only lengths, and no shorter owned source runs out mid-zip — assertions now check the zipped rows, and a shorter-source case was added.
  - `[low]` `[reject]` (blind) Nested `zip` / `combine` arguments untested — ownership passes through `makeIterator` unchanged by this diff; the nested source closes through its own scope.
  - `[low]` `[reject]` (blind) `zip` setup spreads twice and repeats the ownership check — cosmetic, no behaviour difference.
  - `[false]` `[reject]` (blind) `StartingCursor` lacks brands / `registerClass` — it is module-private and only read by the proxy's `valid`/`current`/`next` in `zip`; it never reaches `fqcn` or `instanceof`.
  - `[false]` `[reject]` (blind) Design Notes snippet shows the eager start shape — fix would edit this build's spec; the amended Execution task already records the change.
  - `[maybe-false]` `[defer]` (edge) Two throwing cleanup `finally`s: grouped with the first row (same root cause).
  - `[low]` `[reject]` (edge) `entries()` throwing before `opened.traversal` is set lets a later `start()` retry — owned iterators are fresh framework wrappers whose `entries()` does not throw; the fix adds a guard for an undemonstrated state.
  - `[medium]` `[patch]` (verification-gap) `combine`'s closing `start()` has no test where removing it shows — added the empty-keys / non-empty-values `ValueError` case.
  - `[low]` `[defer]` (intent) A callable returning a fresh runtime `Generator`, or a userland `IteratorAggregate`, is not closed though PHP would destroy it — pre-existing ownership rule shared by every `iteratorScope` member, not introduced here.
  - `[false]` `[reject]` (intent) Mechanism goes through the runtime's `TRAVERSAL_EXIT` rather than a direct `return()` — the public-API tests show every `finally` runs.
  - `[false]` `[reject]` (intent) Start timing, order and DIV-9.16 handling exceed the action text — the action asks for `finally` to run "as in PHP", which includes them.
  - `[low]` `[reject]` (intent) Oracle logs transcribed by hand — grouped with the probe-not-committed row.
  - `[low]` `[reject]` (intent) `adapted:DIV-9.16` markers in a Xaravel Test — DIV-9.16 itself asks that an Xaravel Test checking this case be marked with the clause.
  - `[false]` `[reject]` (intent) Spec status reads `in-review`, merge gate not in the diff — workflow bookkeeping, checked at Finalize.
  - `[low]` `[reject]` (verification-gap, other) Spec file modified during the review — the parent session set `in-review` and the Fidelity tool recorded verdicts; expected.
  - `[low]` `[reject]` (verification-gap, other) 29 failures in `bun test packages/collections` — pre-existing blocked-by tests (30 at baseline); the harness reports no differences.

### 2026-10-29 — Review pass (Finalize re-check)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: the patched tree changed the reviewed tree, so the Fidelity Review ran again for `--item epic-14-retro-item-1-lazy-combine-zip-cleanup`: both reviewers pass at tree adbd6513ff5b380156976bd51a166c7181bfd58b; `status` prints `current`.

## Design Notes

PHP 8.5.11 probe (Upstream `LazyCollection.php` at the Pin, run 2026-10-29) printed exactly the logs in the matrix; the unfixed port printed none of the `finally` events on the abandoned rows and missed `finally values` on "combine values long". Shape of the zip fix:

```ts
for (const starts of this.deferredIteratorScopes(iteratorList)) {
  for (const start of starts) start();
  while (toBool(/* contains->valid() */)) { yield …; /* each->next() */ }
}
```

## Verification

**Commands:**
- `bun test packages/collections/tests/xaravel/collections.test.ts -t XT-collections-19` -- expected: pass
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run harness --xaravel` -- expected: no differences
- `bun run typecheck` and `bun run lint` -- expected: exit 0

## Fidelity Review

### Reviewer 1: pass at tree 383fa4e6f4d64de4135676697a16ae1b23a42cf8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `3ab17b602bec9c62408b6eabb463d5d68265d221`, on 2026-10-30T02:51:42.195Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test; the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The test diff only adds assertions; no existing expected value is weakened. The two body-error expectations carry DIV-9.16 markers. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes or assertion removals appear in the diff. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed or set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Both added adapted:DIV-9.16 markers check that a loop body's exception wins over a throwing generator finally, exactly as the supplied clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-19 checks exact source-start and cleanup logs, early exits, exhaustion, mismatched counts, held-generator resumption and competing exceptions, matching its consequence and the recorded PHP probe observations. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to collections. The cursor and cleanup helpers coordinate existing runtime iterator behavior without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The eight retained callback tags correspond to methods that await permitted async callbacks. The added iterator scopes and cursor helpers are synchronous generators or methods and require no async-root tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no changed setup or exprs inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"383fa4e6f4d64de4135676697a16ae1b23a42cf8","base":"3ab17b602bec9c62408b6eabb463d5d68265d221","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T02:51:42.195Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test; the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The test diff only adds assertions; no existing expected value is weakened. The two body-error expectations carry DIV-9.16 markers.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test changes or assertion removals appear in the diff.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed or set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Both added adapted:DIV-9.16 markers check that a loop body's exception wins over a throwing generator finally, exactly as the supplied clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-19 checks exact source-start and cleanup logs, early exits, exhaustion, mismatched counts, held-generator resumption and competing exceptions, matching its consequence and the recorded PHP probe observations.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to collections. The cursor and cleanup helpers coordinate existing runtime iterator behavior without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The eight retained callback tags correspond to methods that await permitted async callbacks. The added iterator scopes and cursor helpers are synchronous generators or methods and require no async-root tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no changed setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 383fa4e6f4d64de4135676697a16ae1b23a42cf8

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `3ab17b602bec9c62408b6eabb463d5d68265d221`, on 2026-10-30T02:51:42.195Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test file; the only test change is the new Xaravel Test XT-collections-19. No Ported Test assertions to compare with Upstream. |
| F-2: No expected value is weakened | pass | No existing assertion in collections.test.ts is altered: the diff only appends helpers and XT-collections-19. The new test uses exact assertSame comparisons and exact class plus exact message checks. The two body-exception assertions carry adapted:DIV-9.16, and that clause permits exactly this outcome (the loop body's exception wins). |
| F-3: No assertion is removed without a DIV clause | pass | The diff removes no assertion. Its only removal is the docs paragraph about the old combine/zip cleanup gap (collections.md 245-247), which the action item asks for. No Ported Test assertion count changes. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | The two '// adapted:DIV-9.16' markers in XT-collections-19 are on assertSame(bodyError, failure), once for a user for…of over zip and once for combine(...).each(throw). DIV-9.16 says the loop body's exception is the one the caller sees, whether the loop is framework code or a user's for…of, and that the generator's finally still runs once. The adjacent log assertions check that it ran once. Neither marker adapts more than the clause allows. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned committed Oracle request and no error fixture, base or changed; the item relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The XT-collections-19 body checks every claim in its consequence string: - start points: start logs for owned sources, in order among a user-held unstarted Generator and a userland LoggingIterator. - abandonment: first, take(2) and a break on zip; first and take(2) on combine. - destruction order: zip's sources in order; combine's values before this collection's source. - exhausted runs: zip all() and combine with both sources empty. - error runs: combine with fewer or more values, with exact ValueError and message. - a user-held runtime Generator stays resumable after first(). - a cleanup exception propagates when no other is active, and the body exception wins (DIV-9.16).  The orderings agree with Upstream zip (contains->valid, map->current, destroying $iterators in order) and combine. For combine, PHP's zend_generator_close frees CVs ('$values') before the foreach temporary. The string cites no FR/AD consequence id. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are under packages/collections (LazyCollection.ts, docs/collections.md, tests/xaravel/collections.test.ts), the component the item lists. No stub, fake or hard-coded behaviour of another Component is added. StartingCursor and closingScope are module-internal helpers for collections' own zip and combine. |
| F-9: Every `@asyncRoot` tag is true | pass | The new members are synchronous: deferredIteratorScope and deferredIteratorScopes are sync generators, and StartingCursor and closingScope are not exported. None is async, so none needs a tag. The kept tags at lines 1408-1529 are on mapAsync, eachAsync and the six other async companions. Each awaits a caller-supplied callback, which matches AD-6's callback clause and DIV-1.2. No untagged async export is added. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"383fa4e6f4d64de4135676697a16ae1b23a42cf8","base":"3ab17b602bec9c62408b6eabb463d5d68265d221","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T02:51:42.195Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test file; the only test change is the new Xaravel Test XT-collections-19. No Ported Test assertions to compare with Upstream.","findings":[]},{"id":"F-2","result":"pass","note":"No existing assertion in collections.test.ts is altered: the diff only appends helpers and XT-collections-19. The new test uses exact assertSame comparisons and exact class plus exact message checks. The two body-exception assertions carry adapted:DIV-9.16, and that clause permits exactly this outcome (the loop body's exception wins).","findings":[]},{"id":"F-3","result":"pass","note":"The diff removes no assertion. Its only removal is the docs paragraph about the old combine/zip cleanup gap (collections.md 245-247), which the action item asks for. No Ported Test assertion count changes.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"The two `// adapted:DIV-9.16` markers in XT-collections-19 are on assertSame(bodyError, failure), once for a user for…of over zip and once for combine(...).each(throw). DIV-9.16 says the loop body's exception is the one the caller sees, whether the loop is framework code or a user's for…of, and that the generator's finally still runs once. The adjacent log assertions check that it ran once. Neither marker adapts more than the clause allows.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned committed Oracle request and no error fixture, base or changed; the item relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"The XT-collections-19 body checks every claim in its consequence string:\n- start points: start logs for owned sources, in order among a user-held unstarted Generator and a userland LoggingIterator.\n- abandonment: first, take(2) and a break on zip; first and take(2) on combine.\n- destruction order: zip's sources in order; combine's values before this collection's source.\n- exhausted runs: zip all() and combine with both sources empty.\n- error runs: combine with fewer or more values, with exact ValueError and message.\n- a user-held runtime Generator stays resumable after first().\n- a cleanup exception propagates when no other is active, and the body exception wins (DIV-9.16).\n\nThe orderings agree with Upstream zip (contains->valid, map->current, destroying $iterators in order) and combine. For combine, PHP's zend_generator_close frees CVs (`$values`) before the foreach temporary. The string cites no FR/AD consequence id.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are under packages/collections (LazyCollection.ts, docs/collections.md, tests/xaravel/collections.test.ts), the component the item lists. No stub, fake or hard-coded behaviour of another Component is added. StartingCursor and closingScope are module-internal helpers for collections' own zip and combine.","findings":[]},{"id":"F-9","result":"pass","note":"The new members are synchronous: deferredIteratorScope and deferredIteratorScopes are sync generators, and StartingCursor and closingScope are not exported. None is async, so none needs a tag. The kept tags at lines 1408-1529 are on mapAsync, eachAsync and the six other async companions. Each awaits a caller-supplied callback, which matches AD-6's callback clause and DIV-1.2. No untagged async export is added.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree adbd6513ff5b380156976bd51a166c7181bfd58b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `3ab17b602bec9c62408b6eabb463d5d68265d221`, on 2026-10-30T03:00:38.662Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds no Ported Test and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff removes or weakens no expected value. New assertions compare exact results, logs and exception identities; the competing-exception adaptations are permitted by DIV-9.16. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Both added DIV-9.16 markers check that the loop body's exception survives a throwing generator finally, exactly as the clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The change relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-19 checks its declared startup order, early-exit cleanup, exhaustion, mismatched counts, held-generator resumability and exception precedence using exact results and event logs. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to Collections. The cursor and cleanup helpers coordinate Collections traversal through existing runtime contracts without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The eight retained callback tags match methods that await supplied callbacks, as DIV-1 permits. The added traversal helpers are synchronous generators and require no async-root tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"adbd6513ff5b380156976bd51a166c7181bfd58b","base":"3ab17b602bec9c62408b6eabb463d5d68265d221","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T03:00:38.662Z","items":[{"id":"F-1","result":"n/a","note":"The change adds no Ported Test and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff removes or weakens no expected value. New assertions compare exact results, logs and exception identities; the competing-exception adaptations are permitted by DIV-9.16.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Both added DIV-9.16 markers check that the loop body's exception survives a throwing generator finally, exactly as the clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The change relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-19 checks its declared startup order, early-exit cleanup, exhaustion, mismatched counts, held-generator resumability and exception precedence using exact results and event logs.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to Collections. The cursor and cleanup helpers coordinate Collections traversal through existing runtime contracts without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The eight retained callback tags match methods that await supplied callbacks, as DIV-1 permits. The added traversal helpers are synchronous generators and require no async-root tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree adbd6513ff5b380156976bd51a166c7181bfd58b

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `3ab17b602bec9c62408b6eabb463d5d68265d221`, on 2026-10-30T03:00:38.662Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test. It touches only LazyCollection.ts, the collections docs, and adds the Xaravel Test XT-collections-19. There is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | No existing assertion or expected value changes. The diff only appends helpers and XT-collections-19. The docs remove the residual paragraph about the combine/zip cleanup gap, which the change now fixes. No stale_tests path is listed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched and no assertion is removed. The only test change is a new Xaravel Test. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | There are two '// adapted:DIV-9.16' markers in XT-collections-19. One is on the assertion that a user for…of body's exception wins over zip's throwing source finally. The other is on the assertion that each()'s callback exception wins over combine's throwing values finally. Each next assertion checks that the finally ran exactly once. DIV-9.16 covers this case exactly: the loop body's exception wins over a generator finally that also throws, the finally runs once, and the test is marked with the clause. The change does nothing beyond that. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the item relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared XT-collections-19's body with its consequence string. The string's claims are each covered: - Start order among owned sources, a user-held unstarted Generator, and a userland LoggingIterator, including an empty 'this'. - Abandonment by first, take(2) and break for zip, and by first and take for combine. - Throws: combine's ValueError cases and zip/combine with a throwing body. - PHP's destruction order: zip's sources in order, combine's values before this collection's source. - Exhausted and short-source runs. - A user-held Generator stays resumable. - A cleanup exception propagates when no other exception is active (zip/first). - The body exception wins under DIV-9.16.  The PHP 8.5.11 probe output behind the expected logs is not in the prompt. I checked the orders against Upstream's 'zip' and 'combine' code instead: - 'zip' reads '$iterators->contains->valid()', which stops at the first valid iterator, then 'map->current()'. - 'combine' holds '$values' as a CV, which 'zend_generator_close' frees before the 'foreach' temporary.  The expected logs agree with both. The consequence cites no FR or AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/collections, the item's own component. StartingCursor and closingScope are module-internal helpers for LazyCollection's own zip and combine, not stubs of another Component. Nothing is hard-coded to pass the test. |
| F-9: Every `@asyncRoot` tag is true | pass | The eight kept '@​asyncRoot callback' tags are on mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync. Each awaits a caller callback that DIV-1.2 allows to be async, so each tag is true. The new members are deferredIteratorScope, deferredIteratorScopes, StartingCursor and closingScope. All are synchronous, return no Promise, and the last two are not exported, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"adbd6513ff5b380156976bd51a166c7181bfd58b","base":"3ab17b602bec9c62408b6eabb463d5d68265d221","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T03:00:38.662Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test. It touches only LazyCollection.ts, the collections docs, and adds the Xaravel Test XT-collections-19. There is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No existing assertion or expected value changes. The diff only appends helpers and XT-collections-19. The docs remove the residual paragraph about the combine/zip cleanup gap, which the change now fixes. No stale_tests path is listed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched and no assertion is removed. The only test change is a new Xaravel Test.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"There are two `// adapted:DIV-9.16` markers in XT-collections-19. One is on the assertion that a user for…of body's exception wins over zip's throwing source finally. The other is on the assertion that each()'s callback exception wins over combine's throwing values finally. Each next assertion checks that the finally ran exactly once. DIV-9.16 covers this case exactly: the loop body's exception wins over a generator finally that also throws, the finally runs once, and the test is marked with the clause. The change does nothing beyond that.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the item relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"I compared XT-collections-19's body with its consequence string. The string's claims are each covered:\n- Start order among owned sources, a user-held unstarted Generator, and a userland LoggingIterator, including an empty `this`.\n- Abandonment by first, take(2) and break for zip, and by first and take for combine.\n- Throws: combine's ValueError cases and zip/combine with a throwing body.\n- PHP's destruction order: zip's sources in order, combine's values before this collection's source.\n- Exhausted and short-source runs.\n- A user-held Generator stays resumable.\n- A cleanup exception propagates when no other exception is active (zip/first).\n- The body exception wins under DIV-9.16.\n\nThe PHP 8.5.11 probe output behind the expected logs is not in the prompt. I checked the orders against Upstream's `zip` and `combine` code instead:\n- `zip` reads `$iterators->contains->valid()`, which stops at the first valid iterator, then `map->current()`.\n- `combine` holds `$values` as a CV, which `zend_generator_close` frees before the `foreach` temporary.\n\nThe expected logs agree with both. The consequence cites no FR or AD token.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/collections, the item's own component. StartingCursor and closingScope are module-internal helpers for LazyCollection's own zip and combine, not stubs of another Component. Nothing is hard-coded to pass the test.","findings":[]},{"id":"F-9","result":"pass","note":"The eight kept `@asyncRoot callback` tags are on mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync. Each awaits a caller callback that DIV-1.2 allows to be async, so each tag is true. The new members are deferredIteratorScope, deferredIteratorScopes, StartingCursor and closingScope. All are synchronous, return no Promise, and the last two are not exported, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

- **Summary:** `LazyCollection.combine` and `zip` now close every temporary generator they open. Each owned source starts where PHP first reads it (`deferredIteratorScope`'s lazy `start()`, `StartingCursor` in `zip`) and closes on exhaustion, abandonment or a throw in PHP's destruction order: `zip`'s sources in order, `combine`'s values before this collection's source. User-held runtime Generators stay resumable. The docs residual is removed.
- **Files changed:**
  - `packages/collections/src/LazyCollection.ts` — `deferredIteratorScope(s)`, `StartingCursor`, `closingScope`; `combine` and `zip` use them; doc and header comments.
  - `packages/collections/docs/collections.md` — residual removed; `combine` / `zip` named among the members that close their sources.
  - `packages/collections/tests/xaravel/collections.test.ts` — XT-collections-19, every matrix row plus resumability, read order, cleanup and DIV-9.16 cases.
- **Review findings:** 20 findings on the first pass. Patched 2: medium, `combine`'s closing `start()` untested; low, zip rows asserted only lengths. Deferred 2: two throwing cleanup `finally`s (medium, unverified), and runtime-Generator / IteratorAggregate ownership (low, pre-existing). The 16 rejected are listed with reasons in the Review Triage Log. The Finalize re-check had 0 findings.
- **Follow-up review recommended:** false. Patched entries: high 0, medium 1, low 1.
- **Verification:**
  - `bun test packages/collections/tests/xaravel/collections.test.ts`: 16 pass.
  - `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, exit 0. The 7 not-run are backends not running locally.
  - `bun run harness --xaravel`: 494 tests, 489 passed, 0 failed, 5 skipped, exit 0.
  - `bun run typecheck` and `bun run lint`: exit 0.
  - Fidelity Review `status --item`: `current` at tree adbd6513ff5b380156976bd51a166c7181bfd58b.
- **Residual risks:** the PHP result for two cleanup exceptions in one close has not been probed (deferred). The expected logs come from a PHP probe transcribed into the test header, not from a committed probe script.

