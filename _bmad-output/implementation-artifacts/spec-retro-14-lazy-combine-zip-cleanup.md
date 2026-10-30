---
title: 'LazyCollection combine and zip close the iterators they open (epic-14-retro-item-1-lazy-combine-zip-cleanup)'
type: 'bugfix'
created: '2026-10-29'
status: 'in-review'
baseline_revision: '3ab17b602bec9c62408b6eabb463d5d68265d221'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: []
deferred: []
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
