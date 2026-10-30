---
title: 'Traversable and Iterator recognise a bare JS generator (epic-14-retro-item-5-traversable-js-generator)'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
baseline_revision: '18797f4548f06f7587df28e6c5a23a489a8dd923'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: []
deferred:
  - summary: >-
      Traversing the same bare JS generator twice, or one already advanced, gives the remaining (or no) values where PHP throws "Cannot traverse an already closed generator" or "Cannot rewind a generator that was already run".
    evidence: |-
      iteratorOf, yieldFrom, CachingIterator and the collections helpers wrap a bare generator in a fresh runtime Generator per traversal, so wrapper state (#started, #finished) is not shared. iterator_to_array(gen) twice behaved the same on the baseline; Generator.ts records an advanced-before-wrap generator as not ported. A fix needs one wrapper per JS generator across the runtime (for example a WeakMap used by every wrap site), or a DIV clause.
    location: >-
      packages/runtime/src/php/traverse.ts (iteratorOf), packages/runtime/src/php/Generator.ts (yieldFrom), packages/runtime/src/php/CachingIterator.ts
    severity: medium
  - summary: >-
      Collection.concat and other valuesOf / entriesOf / Arr.iterateValues callers read a bare JS generator as a raw JS iterable, so keyed yields appear as keyed markers (collect([0]).concat(gk()) gives [0, {key, value}, …] where PHP gives [0, 1, 2, 3]).
    evidence: |-
      valuesOf (Collection.ts, LazyCollection.ts), entriesOf (LazyCollection.ts) and iterateValues (Arr.ts) cast any non-array to Iterable or call entries() with no Traversable branch, so the baseline behaved the same; not caused by this item. Wrapping a bare generator there (as helpers.ts iterateValues does) would fix it.
    location: >-
      packages/collections/src/Collection.ts (valuesOf), packages/collections/src/LazyCollection.ts (valuesOf, entriesOf), packages/collections/src/Arr.ts (iterateValues)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A bare JS generator object (what a ported generator function returns, DIV-12.18) answers `instanceof Generator` but not `instanceof Traversable` or `instanceof Iterator`, while PHP's `Generator` implements both. So `new Collection(gen)`, `collect(gen)`, `Arr.from(gen)`, `merge(gen)` and `union(gen)` silently give `[]`, `is_a(gen, 'Traversable')` is false, and `new CachingIterator(gen)` throws a `TypeError` (retro finding L1, `_bmad-output/implementation-artifacts/epic-14-retro-2026-10-29.md`).

**Approach:** Give the runtime's `Traversable` and `Iterator` tokens an instance test that accepts the brand (as today) or a bare JS generator (the `isJsGenerator` test `Generator` already uses), so the existing `instanceof Traversable` branches in collections iterate it through the runtime's PHP traversal. Repair the sites that relied on "Generator but not Traversable" to spot a bare generator, and let `CachingIterator` read a bare generator through the runtime `Generator` wrapper. Add an XT-runtime and an XT-collections test, each recomputing a PHP 8.5.11 probe.

## Boundaries & Constraints

**Always:** Change only `packages/runtime/**` and `packages/collections/**` (plus this spec and its records). Keep each token's own keys, order and descriptors (XT-contracts-22 compares them with `contract()`). Keep `LazyCollection`'s refusal of a bare generator passed to its constructor. Keep load order safe: `Traversable.ts` and `Iterator.ts` must not import `Generator.ts` (which reads `Iterator.brand` and `Traversable.brand` at class definition). Every expected value in the new tests is what PHP 8.5.11 printed, recorded in a `.probe.php` / `.probe.txt` pair.

**Never:** Remove or weaken an assertion; add a skip or an `adapted:` marker; add a public runtime export (the export lists are pinned by XT tests); touch `conformance/expectations/**`, another component, or a Protected Path outside these two packages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| instanceof | bare `g()` | `instanceof Traversable`, `Iterator`, `Generator` true; `IteratorAggregate` false; `is_a(g,'Traversable')`, `is_a(g,'Iterator')`, `is_iterable` true | none |
| Collection | `new Collection(g())`, `collect(gk())` with `keyed('a',1), keyed(5,2), 3` | `[1,2]`; `{a:1, 5:2, 6:3}` | none |
| Arr.from | `Arr.from(g())`, `Arr.from(gk())` | `[1,2]`; `{a:1, 5:2, 6:3}` | none |
| merge / union | `collect([0]).merge(g())`; `collect({a:0,x:9}).merge(gk())`; `collect([0=>'z','a'=>0]).union(gk())` | `[0,1,2]`; `{a:1,x:9,0:2,1:3}`; `{0:'z',a:0,5:2,6:3}` | none |
| LazyCollection | `new LazyCollection(g())`; `LazyCollection.make(() => gk())`; `LazyCollection.make([0]).merge(g())` | PHP's `InvalidArgumentException` message; `{a:1,5:2,6:3}`; `[0,1,2]` | constructor throws |
| CachingIterator | `new CachingIterator(gk())` iterated with `hasNext()`; `getInnerIterator() === g` | `[['a',1,true],[5,2,true],[6,3,false]]`; `true` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/Traversable.ts` -- token built by `phpInterface("Traversable")`; add the instance test (5th `phpInterface` argument, as `UnitEnum` uses).
- `packages/runtime/src/php/Iterator.ts` -- same for `Iterator` (parents `[Traversable]` unchanged).
- `packages/runtime/src/php/phpInterface.ts:49-54` -- `instanceTest` replaces the brand test, so the new test must also read the brand (`Symbol.for(name)` on an object or function).
- `packages/runtime/src/php/Generator.ts:37-43` -- `JS_GENERATOR_PROTOTYPE` / `isJsGenerator`; move to a new import-free module `packages/runtime/src/php/jsGenerator.ts` and re-export from `Generator.ts` so `traverse.ts`'s import is unchanged.
- `packages/runtime/src/php/traverse.ts:21-23,64-71` -- `isTraversable` and `iteratorOf` already wrap a bare generator before the `Iterator` test; no change needed beyond still compiling.
- `packages/runtime/src/php/CachingIterator.ts:42,53-62,84,111,115,181-197` -- `#inner` is called for `rewind/valid/current/key/next`; keep the given iterator for `getInnerIterator()` and read a bare generator through `new Generator(it)` (call-time import of `Generator`).
- `packages/runtime/src/php/typeTests.ts:173-188` -- `is_a` uses `instanceof` on the token, so it follows the token.
- `packages/collections/src/LazyCollection.ts:1658-1666` -- `maybeTraversable instanceof Generator && !(maybeTraversable instanceof Traversable)` detects a bare generator; becomes `instanceof Generator && !hasBrand(x, Traversable)`. Header comment lines 6-12 says a bare generator "is no Traversable"; update.
- `packages/collections/src/helpers.ts:382-390` -- `iterateValues` same detection; same fix.
- `packages/collections/src/Arr.ts:369,534,774` -- `instanceof Traversable` branches, which now admit a bare generator; `iterator_to_array` and `iterateEntries` (`Generator.owned(yieldFrom(...))`) already handle it.
- `packages/runtime/tests/xaravel/php-array-sum.test.ts` -- template for a probe-recomputing test (`evidence`, `cases`, `check`, label set equal).
- `packages/collections/tests/xaravel/helpers.probe.php` -- template for a probe that loads Upstream at the Pin with a small autoloader.
- Highest IDs: XT-runtime-127, XT-collections-19.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/jsGenerator.ts` -- new internal module holding `isJsGenerator` (moved verbatim); `Generator.ts` imports and re-exports it.
- `packages/runtime/src/php/Traversable.ts`, `packages/runtime/src/php/Iterator.ts` -- pass an instance test: brand read as today, or `isJsGenerator(value)`; update header comments.
- `packages/runtime/src/php/CachingIterator.ts` -- accept a bare generator: `getInnerIterator()` returns the argument; the five-method calls go through a runtime `Generator` wrapping it.
- `packages/collections/src/LazyCollection.ts`, `packages/collections/src/helpers.ts` -- bare-generator detection by `hasBrand(x, Traversable)`; update comments.
- `packages/runtime/tests/xaravel/php-traversable-generator.probe.php` / `.probe.txt` / `.test.ts` -- XT-runtime-128: the instanceof and CachingIterator rows, recomputed from the probe.
- `packages/collections/tests/xaravel/generator-sources.probe.php` / `.probe.txt` and an XT-collections-20 in `packages/collections/tests/xaravel/collections.test.ts` -- the Collection, Arr.from, merge/union and LazyCollection rows, recomputed from the probe.
- `packages/collections/docs/collections.md`, `packages/runtime/docs/*` -- update any sentence that says a bare generator is no Traversable.

**Acceptance Criteria:**
- Given a bare JS generator, when it reaches any matrix row, then the port gives the PHP 8.5.11 probe's recorded value, checked by XT-runtime-128 and XT-collections-20.
- Given the existing suites, when `bun run harness` runs, then it prints no differences, and `bun run harness --xaravel`, `bun run typecheck` and `bun run lint` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 20 findings — high 0, medium 5, low 9, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge) `getInnerIterator()` of a bare-generator CachingIterator returns the raw JS generator, whose PHP methods are absent — PHP's probe pins `getInnerIterator() === $g`; keeping identity is required, and giving it methods needs a shared wrapper registry (new state), which is more than a direct correction for a rarely-met call.
  - `[low]` `[defer]` (edge) advancing the bare generator directly while a CachingIterator wraps it leaves the wrapper's cache stale — pre-existing: `Generator.ts` already records "a JS generator advanced before it is wrapped" as not ported; same root cause as the next row.
  - `[medium]` `[defer]` (edge) traversing the same bare generator twice (`collect(gen)` twice) gives `[]` the second time where PHP throws "Cannot traverse an already closed generator" — root cause predates this item: `iteratorOf` / `yieldFrom` wrap a bare generator in a fresh `Generator` per traversal, so `iterator_to_array(gen)` twice already behaved this way on the baseline; fixing it needs one wrapper per JS generator across the runtime.
  - `[low]` `[defer]` (edge) a bare generator advanced before it reaches `collect` / `Arr.from` gives the remaining values where PHP throws "Cannot rewind a generator that was already run" — pre-existing, documented as not ported in `Generator.ts`; same root cause as above.
  - `[low]` `[reject]` (edge) `instanceof Iterator` narrows a bare generator to `Iterator` though it has none of the five methods — every non-test `instanceof Iterator` site was audited (`traverse.ts` wraps first, `CachingIterator` wraps); `Iterator.ts`'s header documents that the runtime reads one through its `Generator` wrapper; changing the token's type guard would add type complexity to every implementer.
  - `[low]` `[reject]` (edge) `instanceof Traversable` narrows a bare generator to `Traversable` without `entries()` — same audit: every collections site goes through `iterator_to_array`, `iterateEntries` (`yieldFrom`) or the wrapping `iterateValues`; documented in `Traversable.ts`.
  - `[medium]` `[defer]` (blind) CachingIterator's private wrapper diverges from PHP on re-traversal of the inner generator — same root cause as the edge re-traversal row (per-wrap state, pre-existing).
  - `[low]` `[defer]` (blind) `concat(gk())` and other `valuesOf` / `entriesOf` / `Arr.iterateValues` callers read a bare generator as a raw JS iterable (raw `keyed` markers) — verified: these helpers cast any non-array to `Iterable` with no `instanceof Traversable` branch, so the baseline did the same; not caused by this change.
  - `[false]` `[reject]` (blind) the `instanceof` type guards are unsound — duplicate of the edge rows; no call site reaches the bad outcome (audit above), so no defect at a cited location.
  - `[low]` `[reject]` (blind) the brand test is copied in `Traversable.ts` and `Iterator.ts` instead of extending `phpInterface` — real duplication, but drift needs a future change to `phpInterface`'s brand rule; the fix changes `phpInterface`'s signature, which is more than a direct correction.
  - `[low]` `[patch]` (blind) `CachingIterator.ts` header says `Generator` is "never imported at load" though the import is static — comment corrected to say it is a static import used only at call time and why it is cycle-safe.
  - `[false]` `[reject]` (blind) redundant `isJsGenerator` / `instanceof Generator` disjuncts left in `traverse.ts` and `Arr.ts` — they are now redundant but give the same result; no bad outcome.
  - `[medium]` `[patch]` (blind) the changed `helpers.ts` `iterateValues` branch is untested — grouped with VG1 below.
  - `[false]` `[reject]` (blind) `isJsGenerator` re-exported from `Generator.ts` gives two import paths — both modules are package-internal (`php/index.ts` exports neither name), so nothing becomes public.
  - `[false]` `[reject]` (blind) the spec's Verification and Code Map are thin or stale — the fix edits this build's spec.
  - `[low]` `[reject]` (blind) XT-collections-20's three trailing `instanceof` asserts repeat XT-runtime-128 — cosmetic; they add no wrong expectation.
  - `[medium]` `[patch]` (verification-gap VG1) `data_get` with `*` over a bare generator exercises the changed `iterateValues` detection with no test — added a `data_get` probe row recomputed in XT-collections-20.
  - `[medium]` `[patch]` (verification-gap VG2) `Arr.mapWithKeys` / `Collection.mapWithKeys` whose callback returns a bare generator newly takes the `instanceof Traversable` branch with no test — added a `map_with_keys` probe row recomputed in XT-collections-20.
  - `[false]` `[reject]` (intent) the diff changes `CachingIterator`, a surface the intent does not name — it is the necessary consequence of the intent's "(and Iterator)": without it `new CachingIterator(gen)` would pass the guard and crash.
  - `[false]` `[reject]` (intent) `instanceof` and `hasBrand` now disagree on a bare generator — intended (Design Notes); the collections sites rely on it and XT-runtime-128 pins both answers.
- Fidelity Review: reviewer 1 pass, reviewer 2 pass at tree 36ed7e1a4664b0fff981294e721b594eac594370 (no findings).

### 2026-10-29 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Reviewer 1 (codex/gpt-6.1-sol) and reviewer 2 (claude/claude-opus-5-5) pass at tree 633c33c2bfca5bb3f45558265b9cd0cebb558274; `status --item` prints `current`.

## Auto Run Result

Status: done

**Summary.** The runtime's `Traversable` and `Iterator` tokens now answer `instanceof` for a bare JS generator object, as PHP's `Generator` implements both, so `new Collection(gen)`, `collect(gen)`, `Arr.from(gen)`, `merge(gen)`, `union(gen)`, `mapWithKeys` returning a generator and `data_get` wildcards over one read PHP's keys and values; `is_a(gen, 'Traversable' | 'Iterator')` follow; `new CachingIterator(gen)` works and gives `gen` back from `getInnerIterator()`.

**Files changed.**
- `packages/runtime/src/php/jsGenerator.ts` — new import-free home of `isJsGenerator`.
- `packages/runtime/src/php/Traversable.ts`, `Iterator.ts` — instance test: brand or bare JS generator.
- `packages/runtime/src/php/Generator.ts` — imports and re-exports `isJsGenerator`; header updated.
- `packages/runtime/src/php/CachingIterator.ts` — reads a bare generator through a `Generator` wrapper; `getInnerIterator()` returns the argument.
- `packages/collections/src/LazyCollection.ts`, `helpers.ts` — spot a bare generator by `instanceof Generator && !hasBrand(x, Traversable)`.
- `packages/runtime/docs/php-functions.md`, `packages/collections/docs/collections.md` — docs follow; the "not ported" bullet for this gap is removed.
- `packages/runtime/tests/xaravel/php-traversable-generator.{probe.php,probe.txt,test.ts}` — XT-runtime-128.
- `packages/collections/tests/xaravel/generator-sources.{probe.php,probe.txt}`, `collections.test.ts` — XT-collections-20.

**Review findings.** 20 findings in pass 1: 4 patched (3 entries: CachingIterator comment; `data_get` and `mapWithKeys` probe rows), 5 deferred into 2 frontmatter items (re-traversal / advanced-generator state; `valuesOf` raw iteration, both pre-existing), 11 rejected with reasons in the triage log. Pass 2 (Fidelity re-check): 0 findings.

**Follow-up review recommendation:** false. Patched by verdict: high 0, medium 2 (VG1+blind helpers grouped, VG2), low 1. The two medium patches add tests only and are verified by a passing run, so no unverified risk remains to name.

**Verification.** `bun run typecheck` exit 0; `bun run lint` exit 0; `bun run harness`: `XARAVEL tests=498 passed=493 failed=0 skipped=5`, `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (7 Variants NOT-RUN: backends not running locally). Fidelity Review `status --item`: `current`, 2 pass verdicts at tree 633c33c2bfca5bb3f45558265b9cd0cebb558274. Both probes ran on the host's PHP 8.5.11.

**Residual risks.** The deferred items: a bare generator traversed twice, or advanced before it is wrapped, does not throw PHP's closed/rewind exceptions; `concat` and the other `valuesOf` / `entriesOf` callers iterate a bare generator raw. `instanceof Traversable` / `Iterator` narrows a bare generator in TypeScript to a type whose methods it lacks; every current site wraps it first.

## Design Notes

`hasBrand(x, Traversable)` reads `x[Symbol.for("Traversable")] === true`: true on the runtime `Generator` wrapper (its brand getter) and on every branded Traversable, false on a bare JS generator. So in collections `x instanceof Generator && !hasBrand(x, Traversable)` keeps today's meaning "a bare JS generator" without a new runtime export.

## Verification

**Commands:**
- `bun run harness --xaravel` -- expected: 0 failed, XT-runtime-128 and XT-collections-20 pass
- `bun run harness` -- expected: `differ=0`
- `bun run typecheck` and `bun run lint` -- expected: exit 0

## Fidelity Review

### Reviewer 1: pass at tree 36ed7e1a4664b0fff981294e721b594eac594370

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `18797f4548f06f7587df28e6c5a23a489a8dd923`, on 2026-10-30T04:57:16.498Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff preserves existing assertions. New tests compare exact JSON strings with the supplied PHP probe outputs, including the exact exception class and message. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds or changes no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Both new Xaravel Tests check their declared consequences: generator type tests, brands, keyed collection conversion, merging, union, LazyCollection rejection and sources, and CachingIterator traversal and inner identity. Every probe label is compared exactly, with label coverage checked. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code lies within the action item's runtime and collections scope. Collections uses the shared runtime generator implementation; no other Component's behavior is stubbed or duplicated. |
| F-9: Every `@asyncRoot` tag is true | pass | The eight retained LazyCollection callback tags correspond to methods that await permitted async callbacks. The supplied declarations and bodies show synchronous new exports and dual helpers requiring no tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"36ed7e1a4664b0fff981294e721b594eac594370","base":"18797f4548f06f7587df28e6c5a23a489a8dd923","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T04:57:16.498Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing assertions. New tests compare exact JSON strings with the supplied PHP probe outputs, including the exact exception class and message.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds or changes no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Both new Xaravel Tests check their declared consequences: generator type tests, brands, keyed collection conversion, merging, union, LazyCollection rejection and sources, and CachingIterator traversal and inner identity. Every probe label is compared exactly, with label coverage checked.","findings":[]},{"id":"F-8","result":"pass","note":"All changed code lies within the action item's runtime and collections scope. Collections uses the shared runtime generator implementation; no other Component's behavior is stubbed or duplicated.","findings":[]},{"id":"F-9","result":"pass","note":"The eight retained LazyCollection callback tags correspond to methods that await permitted async callbacks. The supplied declarations and bodies show synchronous new exports and dual helpers requiring no tags.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 36ed7e1a4664b0fff981294e721b594eac594370

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `18797f4548f06f7587df28e6c5a23a489a8dd923`, on 2026-10-30T04:57:16.498Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or changes no Expectations line and no file under tests/ported/, so there is no Ported Test to compare with Upstream source lines. It touches only Xaravel Tests (XT-runtime-128, XT-collections-20). |
| F-2: No expected value is weakened | pass | No Ported Test changes. XT-collections-3 is unchanged and still asserts that a bare generator object passed to make() or the constructor throws Upstream's InvalidArgumentException with the exact message. The new tests use exact assertSame against probe outputs. I worked out the probe values by hand from PHP's rules: array_merge on ['a'=>0,'x'=>9] with gk() gives {a:1,x:9,0:2,1:3}; the union gives {0:z,a:0,5:2,6:3}; LazyCollection make([0])->merge(g()) gives [0,1,2]. All match. No assertion is removed, loosened or bent to fit what Xaravel produces, and there are no stale_tests. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched, so no Upstream assertion loses its counterpart. In the touched Xaravel test file, the change only appends XT-collections-20 and leaves the existing tests' assertions as they were. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip; evidence (i) confirms there is no added skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added. The DIV-12.18 mentions are only in prose comments, and they match that clause's keyed-generator rule. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned or changed Oracle fixture that is an error. The new tests rely on PHP probe text files, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-128 checks every part of its consequence string: instanceof Traversable, Iterator and Generator (and not IteratorAggregate); is_a and is_iterable against the PHP 8.5.11 probe; hasBrand false on a bare generator and true on the Generator wrapper; CachingIterator iteration with hasNext, iterator_to_array, and getInnerIterator returning the very object passed in. XT-collections-20 checks new Collection, collect, Arr.from, merge, union, LazyCollection.make and lazy merge against the probe, checks that the LazyCollection constructor still refuses a bare generator with Upstream's class and message, and checks that the probe labels match the case set. Neither consequence cites an FR or AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | The action item lists both runtime and collections. The runtime files (Traversable.ts, Iterator.ts, jsGenerator.ts, Generator.ts, CachingIterator.ts) and the collections files (LazyCollection.ts, helpers.ts, docs, tests) each stay in their own package. Collections uses the runtime's real exports (hasBrand, Traversable, Generator) and adds no stub, fake or hard-coded result for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tag is added. The kept tags are the eight '@​asyncRoot callback' tags on LazyCollection's async companions, and each is true: each method awaits a caller callback that DIV-1.2 lets be async. The new or changed declarations (isJsGenerator, isTraversableInstance, isIteratorInstance, the CachingIterator constructor and getInnerIterator, makeIterator, iterateValues) are all sync and need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"36ed7e1a4664b0fff981294e721b594eac594370","base":"18797f4548f06f7587df28e6c5a23a489a8dd923","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T04:57:16.498Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or changes no Expectations line and no file under tests/ported/, so there is no Ported Test to compare with Upstream source lines. It touches only Xaravel Tests (XT-runtime-128, XT-collections-20).","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. XT-collections-3 is unchanged and still asserts that a bare generator object passed to make() or the constructor throws Upstream's InvalidArgumentException with the exact message. The new tests use exact assertSame against probe outputs. I worked out the probe values by hand from PHP's rules: array_merge on ['a'=>0,'x'=>9] with gk() gives {a:1,x:9,0:2,1:3}; the union gives {0:z,a:0,5:2,6:3}; LazyCollection make([0])->merge(g()) gives [0,1,2]. All match. No assertion is removed, loosened or bent to fit what Xaravel produces, and there are no stale_tests.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched, so no Upstream assertion loses its counterpart. In the touched Xaravel test file, the change only appends XT-collections-20 and leaves the existing tests' assertions as they were.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip; evidence (i) confirms there is no added skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added. The DIV-12.18 mentions are only in prose comments, and they match that clause's keyed-generator rule.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned or changed Oracle fixture that is an error. The new tests rely on PHP probe text files, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-128 checks every part of its consequence string: instanceof Traversable, Iterator and Generator (and not IteratorAggregate); is_a and is_iterable against the PHP 8.5.11 probe; hasBrand false on a bare generator and true on the Generator wrapper; CachingIterator iteration with hasNext, iterator_to_array, and getInnerIterator returning the very object passed in. XT-collections-20 checks new Collection, collect, Arr.from, merge, union, LazyCollection.make and lazy merge against the probe, checks that the LazyCollection constructor still refuses a bare generator with Upstream's class and message, and checks that the probe labels match the case set. Neither consequence cites an FR or AD token.","findings":[]},{"id":"F-8","result":"pass","note":"The action item lists both runtime and collections. The runtime files (Traversable.ts, Iterator.ts, jsGenerator.ts, Generator.ts, CachingIterator.ts) and the collections files (LazyCollection.ts, helpers.ts, docs, tests) each stay in their own package. Collections uses the runtime's real exports (hasBrand, Traversable, Generator) and adds no stub, fake or hard-coded result for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tag is added. The kept tags are the eight `@asyncRoot callback` tags on LazyCollection's async companions, and each is true: each method awaits a caller callback that DIV-1.2 lets be async. The new or changed declarations (isJsGenerator, isTraversableInstance, isIteratorInstance, the CachingIterator constructor and getInnerIterator, makeIterator, iterateValues) are all sync and need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 633c33c2bfca5bb3f45558265b9cd0cebb558274

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `18797f4548f06f7587df28e6c5a23a489a8dd923`, on 2026-10-30T05:04:40.709Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds Xaravel Tests but adds or changes no Ported Test or assigned Ported Test ID. |
| F-2: No expected value is weakened | pass | The new tests compare exact JSON strings with the supplied PHP probe outputs, including exception class and message. No existing expected value or assertion is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertion is changed or removed in the supplied diff. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds or changes no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Both new Xaravel Tests recompute every supplied probe label and assert label completeness. Their cases check the declared generator recognition, keys, values, constructor rejection, brands and CachingIterator identity. Neither consequence cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code belongs to the action item's runtime and collections components. Generator detection and wrapping reuse runtime behavior; no other component's behavior is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | The eight retained LazyCollection callback tags accompany methods that await permitted async callbacks. Other touched source declarations are synchronous, and value and when preserve callback result types as dual helpers. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"633c33c2bfca5bb3f45558265b9cd0cebb558274","base":"18797f4548f06f7587df28e6c5a23a489a8dd923","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:04:40.709Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds Xaravel Tests but adds or changes no Ported Test or assigned Ported Test ID.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact JSON strings with the supplied PHP probe outputs, including exception class and message. No existing expected value or assertion is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertion is changed or removed in the supplied diff.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds or changes no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Both new Xaravel Tests recompute every supplied probe label and assert label completeness. Their cases check the declared generator recognition, keys, values, constructor rejection, brands and CachingIterator identity. Neither consequence cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"All changed code belongs to the action item's runtime and collections components. Generator detection and wrapping reuse runtime behavior; no other component's behavior is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"The eight retained LazyCollection callback tags accompany methods that await permitted async callbacks. Other touched source declarations are synchronous, and value and when preserve callback result types as dual helpers.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 633c33c2bfca5bb3f45558265b9cd0cebb558274

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `18797f4548f06f7587df28e6c5a23a489a8dd923`, on 2026-10-30T05:04:40.709Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests (XT-collections-20, XT-runtime-128) are added, so there is no Upstream assertion to match. |
| F-2: No expected value is weakened | pass | No existing test is edited: collections.test.ts is only appended to, and php-traversable-generator.test.ts is new. The new tests' expected values are the PHP 8.5.11 probe outputs, compared exactly with assertSame on jsonEncode. XT-collections-3's existing check that LazyCollection refuses a bare generator is unchanged, and XT-collections-20 re-asserts it with Upstream's exact message. Unconfirmed: an existing runtime test may still assert that a bare generator is not a Traversable (the old docs said so); no such file is changed or named as left out. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched, so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations line, so there is no skip reason to judge. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The existing DIV-9.16 markers in collections.test.ts are untouched. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned or changed Oracle fixture that is an error, and the action item relies on no Oracle fixture; its evidence is committed PHP probe output. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-20: each label in generator-sources.probe.php (collection, arr.from, merge, union, lazy.constructor, lazy.make, lazy.merge, data_get, map_with_keys) has a TS case with the same inputs (g/gk/gn match the PHP generators; union's PhpArray matches [0=>'z','a'=>0]). Each is compared with the recorded JSON, the label sets are checked equal, and instanceof Traversable/Iterator/Generator is asserted. That covers every surface its consequence names, including the constructor refusal. XT-runtime-128: its cases match the runtime probe labels (instanceof, is_a with is_iterable, caching, caching.inner, caching.to_array) and are compared to the record. It also checks hasBrand false on a bare generator and true on its wrapper, and that other values are refused, which covers 'without carrying a brand' and getInnerIterator identity. Neither consequence cites an FR/AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change is limited to packages/runtime (Traversable/Iterator instance tests, the jsGenerator module, CachingIterator wrapping) and packages/collections (hasBrand checks, docs, tests). Both are listed in the item's components. No stub, fake, hard-coded return or partial implementation of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in the changed runtime files or helpers.ts. LazyCollection.ts keeps eight '@​asyncRoot callback' tags (mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync, firstAsync), each async only because it awaits a caller callback, which is AD-6's callback clause. The new exports (isJsGenerator, JsGenerator type, the instance-test helpers) are synchronous and need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"633c33c2bfca5bb3f45558265b9cd0cebb558274","base":"18797f4548f06f7587df28e6c5a23a489a8dd923","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:04:40.709Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests (XT-collections-20, XT-runtime-128) are added, so there is no Upstream assertion to match.","findings":[]},{"id":"F-2","result":"pass","note":"No existing test is edited: collections.test.ts is only appended to, and php-traversable-generator.test.ts is new. The new tests' expected values are the PHP 8.5.11 probe outputs, compared exactly with assertSame on jsonEncode. XT-collections-3's existing check that LazyCollection refuses a bare generator is unchanged, and XT-collections-20 re-asserts it with Upstream's exact message. Unconfirmed: an existing runtime test may still assert that a bare generator is not a Traversable (the old docs said so); no such file is changed or named as left out.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched, so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations line, so there is no skip reason to judge.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The existing DIV-9.16 markers in collections.test.ts are untouched.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned or changed Oracle fixture that is an error, and the action item relies on no Oracle fixture; its evidence is committed PHP probe output.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-20: each label in generator-sources.probe.php (collection, arr.from, merge, union, lazy.constructor, lazy.make, lazy.merge, data_get, map_with_keys) has a TS case with the same inputs (g/gk/gn match the PHP generators; union's PhpArray matches [0=>'z','a'=>0]). Each is compared with the recorded JSON, the label sets are checked equal, and instanceof Traversable/Iterator/Generator is asserted. That covers every surface its consequence names, including the constructor refusal. XT-runtime-128: its cases match the runtime probe labels (instanceof, is_a with is_iterable, caching, caching.inner, caching.to_array) and are compared to the record. It also checks hasBrand false on a bare generator and true on its wrapper, and that other values are refused, which covers 'without carrying a brand' and getInnerIterator identity. Neither consequence cites an FR/AD token.","findings":[]},{"id":"F-8","result":"pass","note":"The change is limited to packages/runtime (Traversable/Iterator instance tests, the jsGenerator module, CachingIterator wrapping) and packages/collections (hasBrand checks, docs, tests). Both are listed in the item's components. No stub, fake, hard-coded return or partial implementation of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in the changed runtime files or helpers.ts. LazyCollection.ts keeps eight `@asyncRoot callback` tags (mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync, firstAsync), each async only because it awaits a caller callback, which is AD-6's callback clause. The new exports (isJsGenerator, JsGenerator type, the instance-test helpers) are synchronous and need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
