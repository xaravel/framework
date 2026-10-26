---
title: 'Runtime PHP-array helpers and PHP built-in types for Collections (epic-14-item-1-runtime-php-types)'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
warnings: ['oversized']
deferred: []
baseline_revision: 'cdc1b2b125e34eb795a6efcebca42c8ac5aa3882'
context:
  - '{project-root}/decisions/MAINT-2026-10-25-story-14-1.md'
  - '{project-root}/decisions/ESC-14.1-1.md'
  - '{project-root}/decisions/ESC-14.1-2.md'
  - '{project-root}/conformance/escalations/ESC-14.1-2.md'
---

<intent-contract>

## Intent

**Problem:** Story 14.1 (Collections) needs PHP-array plumbing and PHP built-in types the runtime does not export or define (ESC-14.1-1, ESC-14.1-2). The Maintainer ruled option 1 on both: the runtime half lands first as action item `epic-14-item-1-runtime-php-types`.

**Scope:** `packages/runtime/**` and `packages/contracts/**` (the item's `action`; amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`), plus this spec and sprint status.

**Approach:** Export the existing helpers (`arrayEntries`, `arrayFromEntries`, `normalizeKey`) and add `gettype` / `getDebugType` from `@xaravel/runtime/php`. Add six interface tokens built inside the runtime with the same shape `contract()` gives (no import of contracts, AD-2) and recorded with `registerContractToken`. Add `ArrayIterator`, `ArrayObject`, `CachingIterator`, `WeakMap` (and the `InternalIterator` its `getIterator()` returns), each registered under its PHP name. Brand the runtime's `Error` and `Exception` as `Throwable` (and so `Stringable`).

## Boundaries & Constraints

**Always:** PHP names for classes, constants, methods and messages (PHP 8.5.11 probes below). `null` is the only absent value; all sync. A Traversable's `[Symbol.iterator]()` yields `[key, value]` pairs, as `PhpArray`'s does. An Iterator class runs PHP's `foreach` protocol in it (`rewind`, then `valid` / `key` / `current` / `next`). An IteratorAggregate class iterates its `getIterator()`. Each class ends with `registerClass('<PHP name>', X)`. A brand is a prototype getter `get [Token.brand]() { return true }`, and each class carries every brand in its token chain. New XT cases use `xaravelTest` and `@xaravel/assert`.

**Never:** Import `@xaravel/contracts` from the runtime. Change any existing runtime behaviour beyond the four exports' doc comments and the new brands on `Error` / `Exception`. Add the new classes to `Symbol.for('xaravel.php.classes')`: it stays the 24 throwable/stdClass built-ins XT-runtime-35 pins, as Story 13.1's reflection classes do. Touch `conformance/expectations/**`, `decisions/**`, `packages/collections/**` or any other package. Change `contract()`'s behaviour, or an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Helpers | `arrayEntries({"1":"a",b:2})`, `arrayFromEntries([[0,"x"],[1,"y"]])`, `normalizeKey("07")` / `true` / `null` | `[[1,"a"],["b",2]]`, `["x","y"]`, `"07"` / `1` / `""` | `normalizeKey([])` throws PHP `TypeError` `Cannot access offset of type array on array` |
| gettype | `null,true,1,1.5,float(2),"s",[],{},new stdClass,()=>1` | `NULL boolean integer double double string array array object object` | none |
| getDebugType | same, plus an unregistered class instance | `null bool int float float string array array stdClass Closure`, `class@anonymous` | none |
| Tokens | `Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`, `Stringable`, `Throwable` | `isContractToken` true; `fqcn` is the PHP name; `interfaceExists(name)` true; brand `Symbol.for(name)`; parents: Iterator, IteratorAggregate → Traversable; Throwable → Stringable | none |
| JsonSerializable brand | class with `get [JsonSerializable.brand]()` and `jsonSerialize()` | `jsonEncode` encodes `jsonSerialize()`'s result; `x instanceof JsonSerializable` | none |
| Throwable | `new Error()`, `new Exception()`, `new InvalidArgumentException()` | `instanceof Throwable` and `Stringable`; a JS `Error` is not | none |
| ArrayIterator | `new ArrayIterator({a:1})` then push-style `offsetSet(null, …)`, rewind/next | PHP's key/current/valid; `getArrayCopy()` a copy; `count()`; past the end `key()`/`current()` null | non-array non-object argument: PHP `TypeError` `ArrayIterator::__construct(): Argument #1 ($array) must be of type array, int given` |
| ArrayObject | `new ArrayObject(["x"=>1])`, then a write after `getIterator()` | `getIterator()` is an `ArrayIterator` over the same storage, so it sees the write; `getArrayCopy`, `count`, `offset*`, `append`, `exchangeArray` (returns the old array); `jsonEncode` `{"0":1,"1":2}` for `[1,2]`; `phpSerialize` `O:11:"ArrayObject":4:{i:0;i:0;i:1;a:…;i:2;a:0:{}i:3;N;}` | same `TypeError` as ArrayIterator, with `ArrayObject::__construct()` |
| CachingIterator | `new CachingIterator(new ArrayIterator({a:"x",b:"y"}))` | default flags `CALL_TOSTRING` (1); `hasNext()` true on `a`, false on `b`; `toString()` the cached current; `FULL_CACHE` gives `getCache()` and `count()` | no string flag: `toString()` throws `BadMethodCallException` `CachingIterator does not fetch string value (see CachingIterator::__construct)`; `getCache()` without `FULL_CACHE`: `… does not use a full cache …`; two string flags: `ValueError` (PHP's message) |
| WeakMap | keys `b`, `a`, `b` rewritten; `offsetUnset`; non-object key | iterates `[b,3],[a,2]` (insertion order, rewrite keeps position); `count()`; `offsetExists` false for a `null` value | non-object key: PHP `TypeError` `WeakMap key must be an object`; missing key read: PHP `Error` `Object stdClass#<n> not contained in WeakMap`; `phpSerialize`: PHP `Exception` `Serialization of 'WeakMap' is not allowed` |

</intent-contract>

## Code Map

- `packages/runtime/src/php/casts.ts:26` -- `arrayEntries`, internal; export it (it is not PHP-named, so it keeps its name).
- `packages/runtime/src/php/PhpArray.ts:64,209` -- `normalizeKey` and `arrayFromEntries`, documented as "Internal ... the package does not export it"; reword and export. `PhpArray`'s iterator is a live `Map` iterator (`entries()`, :186), so an `ArrayIterator` that holds a `Map`-backed iterator sees later writes, as PHP's hash iteration does.
- `packages/runtime/src/php/phpType.ts` -- `phpType`, `className` (FQCN, `Closure`, else `object`), `phpTypeName`. Add `gettype` and `getDebugType` here (it imports no throwable).
- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export lists; `docs.test.ts` (XT-runtime-37) only reads `export { … } from` lists and needs every export named in backticks in `docs/`.
- `packages/runtime/src/registry/registry.ts:150,222` -- `isContractToken` (frozen, own non-writable string `Symbol.for('xaravel.class.fqcn')`) and `registerContractToken` (first one wins).
- `packages/contracts/src/Contract.ts:224-260` -- the token shape to copy: spread statics, optional `CONTRACT_BUILTINS`, `brand = Symbol.for(name)`, `CLASS_FQCN`, `CONTRACT_METHODS`, `CONTRACT_PARAMETERS`, `CONTRACT_PARENTS`, `Symbol.hasInstance` (brand read), `Symbol.toPrimitive` (brand). The test doubles read these keys (`mockery/src/JMac/Testing/Engine/DoubleTarget.ts`, `assert`'s `contractMethods`). `BUILTIN_METHODS` (:206) are PHP names: `getIterator`, `__toString`, ...
- `packages/runtime/src/php/hasBrand.ts`, `jsonEncode.ts:80,217` -- `jsonEncode` already reads `Symbol.for('JsonSerializable')` through `hasBrand`; the token's brand is that symbol.
- `packages/runtime/src/php/mangle.ts:148` -- `objectProps` reads `[Symbol.for('xaravel.php.props')]()` when a class has no property table; `jsonEncode`, `looseEquals` and the grader's comparison read it, so ArrayObject / ArrayIterator expose their storage there, as PHP's `get_properties` handler does.
- `packages/runtime/src/php/phpSerialize.ts:75` -- calls `__serialize()`; `phpUnserialize.ts:398` calls `__unserialize(data)`.
- `packages/runtime/src/php/Error.ts`, `Exception.ts` -- add the `Throwable` and `Stringable` brand getters. Every runtime SPL exception and Mockery's linked copies (`mockery/src/php/SplParent.ts`) inherit them.
- `packages/runtime/src/php/phpClasses.ts` and XT-runtime-35 (`tests/xaravel/exceptions.test.ts:160-185`) -- the 24-entry map; leave unchanged (XT-runtime-48's pattern: registered, not in the map).
- `packages/runtime/src/php/BadMethodCallException.ts`, `ValueError.ts`, `TypeError.ts`, `Exception.ts`, `casts.ts` `toPhpString` -- what the new classes throw and how `CALL_TOSTRING` converts.
- `packages/runtime/tests/xaravel/` -- the next free id is XT-runtime-51. `packages/contracts/tests/xaravel/` -- the next free id is XT-contracts-22.
- `packages/runtime/README.md`, `docs/` -- add `docs/php-builtins.md` and link it; `docs/php-values.md` lists the four helpers.
- PHP 8.5.11 probes (`php` on the host): the matrix values; `WeakMap` `offsetExists` and `isset` are both false for a `null` value; `ArrayObject::offsetExists` is true for a `null` value; a missing `offsetGet` key gives `null` (PHP's warning is not reproduced); `ArrayIterator` serialises as `O:13:"ArrayIterator":4:{i:0;i:0;i:1;a:…;i:2;a:0:{}i:3;N;}`; `CachingIterator` constants `CALL_TOSTRING=1, CATCH_GET_CHILD=16, TOSTRING_USE_KEY=2, TOSTRING_USE_CURRENT=4, TOSTRING_USE_INNER=8, FULL_CACHE=256`; `ArrayObject`/`ArrayIterator` `STD_PROP_LIST=1, ARRAY_AS_PROPS=2`; `Throwable`'s methods are `getMessage, getCode, getFile, getLine, getTrace, getPrevious, getTraceAsString, __toString`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/phpType.ts` -- add `gettype(v)` and `getDebugType(v)` (an unregistered class instance is `class@anonymous`).
- `packages/runtime/src/php/casts.ts`, `PhpArray.ts` -- reword the "Internal" notes of `arrayEntries`, `normalizeKey`, `arrayFromEntries` (no behaviour change).
- `packages/runtime/src/php/phpInterface.ts` (internal) -- `phpInterface(name, members, parents, builtins)` builds a frozen token of `contract()`'s shape and calls `registerContractToken`.
- `packages/runtime/src/php/{Traversable,Iterator,IteratorAggregate,JsonSerializable,Stringable,Throwable}.ts` -- one token each, with a same-named TS interface; members and built-ins as the probe lists (`IteratorAggregate`: built-in `getIterator`; `Stringable`: built-in `__toString`; `Throwable`: the seven getters, parent `Stringable`; `Iterator`: `current, key, next, rewind, valid`).
- `packages/runtime/src/php/{ArrayIterator,ArrayObject,CachingIterator,WeakMap,InternalIterator}.ts` -- the classes, per the matrix. `ArrayIterator` and `ArrayObject` share a `PhpArray` storage; both give `getArrayCopy`, `count`, `offsetExists/Get/Set/Unset`, `append`, `getFlags`/`setFlags`, the props protocol, `__serialize`/`__unserialize`. `CachingIterator` ports PHP's fetch-ahead (`spl_caching_it_next`), `toString()` plus `[Symbol.toPrimitive]`, `getInnerIterator`, `getFlags`, `getCache` and `count` under `FULL_CACHE`. `WeakMap` holds `WeakRef` entries in insertion order, swept by a `FinalizationRegistry`. Its object ids for the missing-key message come from a runtime-local counter, as the grader's handles do.
- `packages/runtime/src/php/Error.ts`, `Exception.ts` -- brand getters for `Throwable` and `Stringable`.
- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export the helpers, tokens and classes, and import the token modules so loading an entry records them.
- `packages/runtime/tests/xaravel/php-builtins.test.ts` -- XT-runtime-51 (helpers and `gettype` / `getDebugType`), XT-runtime-52 (tokens, `Throwable` on the runtime's throwables, the `jsonEncode` hook, the class lookup), XT-runtime-53 (`ArrayIterator`, `ArrayObject`), XT-runtime-54 (`CachingIterator`), XT-runtime-55 (`WeakMap`), each row of the matrix.
- `packages/contracts/tests/xaravel/runtime-tokens.test.ts` -- XT-contracts-22: each runtime token has the same own keys, descriptors and frozenness as a `contract()` token made with the same name, members, parents and built-ins, and `contract()` accepts it as a parent.
- `packages/runtime/docs/php-builtins.md` (new, linked from the README), `docs/php-values.md` -- name every new export, and say what is not ported: `ARRAY_AS_PROPS` / `STD_PROP_LIST` are kept but not acted on; no `seek` / sort methods; `CachingIterator`'s `ArrayAccess` and `setFlags` are not ported; a class porting `__toString` carries the `Stringable` brand itself, which PHP adds implicitly; the runtime's throwables keep their JS `toString()`.
- `packages/runtime/async-surface.json` -- regenerate if the generator changes it.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-51..55 and XT-contracts-22 run, then each row holds.
- Given a fresh process, when any of the four runtime entries loads, then `Symbol.for('xaravel.class.lookup')("Throwable")` is the `Throwable` token, and `Symbol.for('xaravel.php.classes')` still has 24 entries.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-1-runtime-php-types --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 32 findings — high 0, medium 10, low 13, false 7, maybe-false 2
- Fidelity Review layer: not re-run; the spec already records two `pass` verdicts for the unchanged reviewed tree `b9fe3714e1f98d9b672fea087e9ff533c80080ca`, and `status --item` printed `current` (0 findings).
- findings (intent-alignment):
  - `[false]` `[reject]` `getDebugType` is not spelled `get_debug_type` — the runtime camelCases PHP functions (`interfaceExists`, `enumExists`, `jsonEncode`, `isNumeric`; `classExistence.ts` "named as PORTING.md names PHP functions").
  - `[false]` `[reject]` The new classes are not in `Symbol.for('xaravel.php.classes')` — that map is the 24 throwable/stdClass built-ins XT-runtime-35 pins, and Story 13.1's reflection classes are registered the same way, outside it; the grader resolves names through `Symbol.for('xaravel.class.lookup')`.
  - `[medium]` `[intent_gap]` The consumer surfaces (the grader, Mockery) are not exercised; the grader's Traversable protocol is the one that breaks — grouped with the blind-hunter `iterableValues` row below.
  - `[false]` `[reject]` `InternalIterator`, `exchangeArray`, `FULL_CACHE` and the rest widen the surface — PHP's own API on PHP's classes, the parity rule (PORTING.md:33).
  - `[false]` `[reject]` Sprint status is not in the diff and the done condition is not shown — the orchestrator writes sprint status; `status --item` printed `current`, and harness, typecheck and lint were run (`differ=0`).
- findings (edge-case-hunter):
  - `[low]` `[intent_gap]` A current key unset then re-set is yielded twice (`liveCursor.ts`) — real; the cursor needs a per-key insertion sequence. Moot under the intent gap; carried to the re-derivation.
  - `[medium]` `[intent_gap]` `exchangeArray` mid-iteration leaves the iterator invalid where PHP restarts it — real (also blind-hunter); carried.
  - `[maybe-false]` `[intent_gap]` An `ArrayObject` with no state entry is copied, not shared, as a constructor argument — would need a reachable stateless instance (only `phpUnserialize` before `__unserialize` makes one); carried as a check.
  - `[low]` `[intent_gap]` `__unserialize` on a shared instance replaces its box — real, rare; carried.
  - `[low]` `[intent_gap]` `offsetSet(undefined, v)` on ArrayIterator / ArrayObject throws instead of appending (AD-9 reads `undefined` as `null`) — real; carried.
  - `[low]` `[intent_gap]` `WeakMap.offsetSet(undefined, v)` throws `TypeError`, not `Cannot append to WeakMap` — real; carried.
  - `[medium]` `[intent_gap]` `getDebugType` of an unregistered subclass gives `class@anonymous` where PHP gives `Parent@anonymous` — real; ported tests' `new class extends X` are unregistered subclasses. Carried.
  - `[low]` `[intent_gap]` `CachingIterator` `FULL_CACHE` over object keys throws mid-fetch, leaving half-updated state — real, rare; carried.
  - `[low]` `[intent_gap]` The docs say the class lookup finds every name once any entry loads, but `registry/index.ts` and `scope/index.ts` record only `Throwable` / `Stringable` — real; carried.
- findings (blind-hunter):
  - `[medium]` `[intent_gap]` An iterator at the end misses an append after its last entry was deleted, and the docs describe this as intended — real (PHP 8.5.11 repro), same root as the re-set row: no insertion sequence. Carried.
  - `[low]` `[intent_gap]` `exchangeArray` on an `ArrayObject` wrapping another also replaces the inner one's storage — real; one shared box stands for both "iterator views owner" and "wraps another object". Carried.
  - `[medium]` `[intent_gap]` Iterator positioned before `exchangeArray` goes invalid — grouped with the edge-case row above.
  - `[low]` `[intent_gap]` `ArrayObject::getIterator()` drops the flags — real; carried.
  - `[medium]` `[intent_gap]` A `WeakMap` value that references its key keeps the key alive forever — real (Bun repro); the value must sit in a JS `WeakMap` (ephemeron), only the order record strongly. Carried.
  - `[low]` `[intent_gap]` Serialising an `ArrayObject` over another flattens it; PHP's deprecation not listed — real, deprecated input; carried to the "not ported" docs.
  - `[medium]` `[intent_gap]` **The grader reads a Traversable's `[Symbol.iterator]` as its values** (`packages/assert/src/comparison/PhpValues.ts:17,214-221`, `iterableValues`), while this spec's intent contract makes every runtime Traversable yield `[key, value]` pairs, so `assertContains("x", new ArrayObject(["x"]))` fails. The root cause is the intent contract's iteration rule (Boundaries, Always); the spine (§530) and PORTING.md:21 say only "`IteratorAggregate` → `[Symbol.iterator]`", not what it yields, and Laravel's keyed generators (LazyCollection) argue for pairs. Two readings, no source to choose: intent gap.
  - `[medium]` `[intent_gap]` No `Countable` / `ArrayAccess` brands on the new classes, so the grader's `isCountable` / `isArrayAccess` and Laravel's `Arr::accessible` say false — real (`PhpValues.ts:25-26`); carried.
  - `[low]` `[intent_gap]` Existing contracts with `getIterator` / `__toString` built-ins do not list the new tokens as parents — real, but a contracts behaviour change the ruling does not ask for; carried as a question.
  - `[low]` `[intent_gap]` `__unserialize` accepts malformed data where PHP throws `UnexpectedValueException` — real; carried.
  - `[false]` `[reject]` `WeakMap.ts`'s module-level id counter breaks AD-5 — it is process-wide object identity (PHP's `spl_object_id` is process-wide too), the grader's own `objectHandle` is the same, and it holds no per-request state.
  - `[low]` `[intent_gap]` XT-runtime-53's "deleting the current entry" case deletes before the cursor is positioned — real; carried.
  - `[false]` `[reject]` The spec names sprint status but the diff does not change it — the orchestrator's bookkeeping; a fix would edit the spec.
  - `[maybe-false]` `[intent_gap]` The TS `Throwable` interface is looser than PHP's and `Error` / `Exception` do not declare `implements` — whether `implements` type-checks against the brand getters needs a `tsc` try; carried.
- findings (verification-gap):
  - `[medium]` `[intent_gap]` WeakMap's weak-key skipping and sweep are never exercised (no `Bun.gc` case) — gap as filed; carried.
  - `[low]` `[intent_gap]` The object-argument constructor path and `__unserialize`'s member restore are untested — gap as filed; carried.
  - `[false]` `[reject]` "`ArrayObject` over a `stdClass` copies instead of writing through" as an unrecorded divergence — it is listed in `docs/php-builtins.md`'s not-ported list as deprecated PHP input; still carried to the re-derivation as a documented choice, not a defect of this pass. (Counted false: the claim was "no record"; the docs record it.)
  - `[medium]` `[intent_gap]` WeakMap value referencing its key never frees — grouped with the blind-hunter ephemeron row.

**Route.** The intent gap stops this pass (step 4: intent_gap makes lower entries moot). The attempted change is saved as `_bmad-output/implementation-artifacts/retro-14-runtime-php-types-attempt-1.patch` and the code is reverted. The question for the Maintainer: what does `[Symbol.iterator]()` of a PHP Traversable object yield — (1) its values, as the grader's `iterableValues` reads them (keys through `key()` / `current()` and `getIterator()`), or (2) `[key, value]` pairs as `PhpArray` does, with an Infrastructure change to the grader so it reads pairs from runtime Traversables. Every `[intent_gap]` row above marked "carried" is a real defect the re-derivation fixes once that is ruled.

## Design Notes

The tokens copy `contract()`'s shape rather than share it, because AD-2 keeps the runtime from importing contracts. XT-contracts-22 is the equivalence test the Epic 7 lesson asks for. Making `contract()` call a runtime factory would change contracts' behaviour, which the ruling does not ask for.

`[Symbol.iterator]` yields `[key, value]` pairs (as `PhpArray` does), so Story 14.1's `iterator_to_array` port reads every Traversable the same way.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts` -- expected: pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run fidelity:review status --item epic-14-item-1-runtime-php-types --spec _bmad-output/implementation-artifacts/spec-retro-14-runtime-php-types.md` -- expected: `current`

## Fidelity Review

### Reviewer 1: pass at tree b9fe3714e1f98d9b672fea087e9ff533c80080ca

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `cdc1b2b125e34eb795a6efcebca42c8ac5aa3882`, on 2026-10-26T03:53:41.042Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds only Xaravel Tests and assigns no Ported Tests requiring an Upstream assertion comparison. |
| F-2: No expected value is weakened | pass | The diff adds assertions without replacing or loosening existing expected values. No Ported Test or stale cross-component assertion is changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are added or changed, and no existing assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all six added Xaravel Tests with their consequence strings. Their assertions cover token equivalence, exports and type names, registration and brands, array storage and iteration, caching behavior, and WeakMap behavior as declared. No consequence cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the action item's runtime/contracts scope and ESC-14.1-1/2 approvals. The added PHP types belong to the approved runtime work; no other Component is faked, and runtime imports no contracts package. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no IO, and accept no callbacks permitted to be async; no asyncRoot tag is added or required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"b9fe3714e1f98d9b672fea087e9ff533c80080ca","base":"cdc1b2b125e34eb795a6efcebca42c8ac5aa3882","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:53:41.042Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds only Xaravel Tests and assigns no Ported Tests requiring an Upstream assertion comparison.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds assertions without replacing or loosening existing expected values. No Ported Test or stale cross-component assertion is changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are added or changed, and no existing assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all six added Xaravel Tests with their consequence strings. Their assertions cover token equivalence, exports and type names, registration and brands, array storage and iteration, caching behavior, and WeakMap behavior as declared. No consequence cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the action item's runtime/contracts scope and ESC-14.1-1/2 approvals. The added PHP types belong to the approved runtime work; no other Component is faked, and runtime imports no contracts package.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no IO, and accept no callbacks permitted to be async; no asyncRoot tag is added or required.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree b9fe3714e1f98d9b672fea087e9ff533c80080ca

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `cdc1b2b125e34eb795a6efcebca42c8ac5aa3882`, on 2026-10-26T03:53:41.042Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are changed; the item assigns no Inventory rows. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values exist in this change; only Xaravel Tests are added. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are removed; none are ported. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines are set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or DIV clauses are cited on added lines. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures are relied on; the Xaravel Tests state they need none. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-22 compares the runtime tokens with contract() output for keys, descriptors, frozenness, brand, instanceof and parent use. XT-runtime-51 to 55 check the array helpers, tokens, ArrayIterator/ArrayObject, CachingIterator and WeakMap. Each body covers its consequence string. The strings cite no FR or AD bullet tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change stays within packages/runtime and packages/contracts, as the action item's scope allows. The runtime adds PHP built-ins that the Maintainer-approved ESC-14.1-2 names. It builds the tokens itself, importing no contracts (AD-2). This is not a stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the changed files. All the added classes and functions are synchronous, with no Promise returns, driver IO or async callbacks. WeakMap's FinalizationRegistry callback is internal and is not a public async method. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"b9fe3714e1f98d9b672fea087e9ff533c80080ca","base":"cdc1b2b125e34eb795a6efcebca42c8ac5aa3882","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:53:41.042Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are changed; the item assigns no Inventory rows.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values exist in this change; only Xaravel Tests are added.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are removed; none are ported.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines are set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or DIV clauses are cited on added lines.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures are relied on; the Xaravel Tests state they need none.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-22 compares the runtime tokens with contract() output for keys, descriptors, frozenness, brand, instanceof and parent use. XT-runtime-51 to 55 check the array helpers, tokens, ArrayIterator/ArrayObject, CachingIterator and WeakMap. Each body covers its consequence string. The strings cite no FR or AD bullet tokens.","findings":[]},{"id":"F-8","result":"pass","note":"The change stays within packages/runtime and packages/contracts, as the action item's scope allows. The runtime adds PHP built-ins that the Maintainer-approved ESC-14.1-2 names. It builds the tokens itself, importing no contracts (AD-2). This is not a stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the changed files. All the added classes and functions are synchronous, with no Promise returns, driver IO or async callbacks. WeakMap's FinalizationRegistry callback is internal and is not a public async method.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: blocked
Blocking condition: intent gap — what a PHP Traversable object's `[Symbol.iterator]()` yields.

- **Question for the Maintainer.** This spec's intent contract (Boundaries, Always) makes every runtime Traversable (`ArrayIterator`, `ArrayObject`, `CachingIterator`, `WeakMap`, `InternalIterator`) yield `[key, value]` pairs, as `PhpArray` does. The grader reads a Traversable's `[Symbol.iterator]` as its values (`packages/assert/src/comparison/PhpValues.ts:17` and `iterableValues` :214-221, a Protected Path). So `assertContains`, `assertContainsOnly*` and `assertCount`'s Traversable path misread these objects: `Assert.assertContains("x", new ArrayObject(["x"]))` fails. The spine (§530) and PORTING.md:21 say only "`IteratorAggregate` → `[Symbol.iterator]`", not what it yields. Laravel's keyed generators (`LazyCollection`, `yield $k => $v`) argue for pairs, and the grader and JS `for…of` idiom argue for values.
  - Option 1: values. Keys stay reachable through PHP's `key()` / `current()` and `getIterator()`. The grader is unchanged.
  - Option 2: pairs. An Infrastructure change teaches the grader to read pairs from a runtime Traversable.
  - The answer binds Story 14.1's `Collection` / `LazyCollection` too.
- **Attempt.** Built in full and verified before review: `bun test packages/runtime packages/contracts` 77 pass; typecheck and lint clean; `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; Fidelity Review two `pass` verdicts, `status --item` `current` at tree `b9fe3714`. The review then found the grader conflict.
- **Saved patch:** `_bmad-output/implementation-artifacts/retro-14-runtime-php-types-attempt-1.patch` (27 files; `git apply --check` passes on `cdc1b2b1`). The code is reverted.
- **Carried defects.** The Review Triage Log rows marked "carried" are real defects the re-derivation fixes once the question is ruled:
  - the insertion-sequence cursor (append after a deleted last entry; a re-set current key);
  - `exchangeArray` resetting iterators and detaching a wrapped object;
  - the `WeakMap` value kept in an ephemeron, plus a `Bun.gc` test;
  - `Countable` / `ArrayAccess` brands;
  - `getDebugType`'s `Parent@anonymous`;
  - `undefined` keys;
  - `getIterator()` flags;
  - the docs' lookup claim;
  - malformed `__unserialize`;
  - the untested object-argument and member-restore paths.
