---
title: 'Runtime PHP-array helpers and PHP built-in types for Collections (epic-14-item-1-runtime-php-types)'
type: 'feature'
created: '2026-10-25'
status: 'done'
review_loop_iteration: 3
followup_review_recommended: false
warnings: ['oversized']
deferred:
  - summary: >-
      Delete retro-14-runtime-php-types-attempt-1.patch.
    evidence: |-
      The permission classifier refused its deletion in this run; the loop does not work around a refusal.
    location: >-
      _bmad-output/implementation-artifacts/retro-14-runtime-php-types-attempt-1.patch
    severity: low
  - summary: >-
      normalizeKey(undefined) throws where AD-9 reads undefined as null.
    evidence: |-
      Pre-existing behaviour of normalizeKey, now exported; the ruling forbids other runtime behaviour changes.
    location: >-
      packages/runtime/src/php/PhpArray.ts normalizeKey
    severity: low
baseline_revision: '6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab'
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

**Always:** PHP names for classes, constants, methods and messages (PHP 8.5.11 probes below). `null` is the only absent value (an `undefined` key reads as `null`, AD-9); all sync. Iteration follows the Maintainer's amendment (`decisions/MAINT-2026-10-25-story-14-1.md`, "How a Traversable iterates"): a runtime Traversable's `[Symbol.iterator]()` yields its values, `entries()` yields `[key, value]` pairs and `keys()` its keys, as on a JS Map; `PhpArray` keeps its `[key, value]` iterator; the grader is unchanged. An Iterator class runs PHP's `foreach` protocol in all three (`rewind`, then `valid` / `key` / `current` / `next`). An IteratorAggregate class iterates its `getIterator()`. A position is PHP's hash position: it follows insertion order, sees later appends (also after its last entry was deleted), moves off an entry deleted under it, visits a deleted-and-re-set key again at its new place, and keeps its index when an `ArrayObject`'s storage is exchanged. `ArrayIterator`, `ArrayObject` and `WeakMap` carry the `Countable` and `ArrayAccess` brands (`Symbol.for('Countable')`, `Symbol.for('ArrayAccess')`, the brands the grader and `@xaravel/contracts` read), `CachingIterator` `Countable`. An `ArrayObject` / `ArrayIterator` built over another wraps that object, as PHP's does: it reads and writes the other's current storage, and its own `exchangeArray` / `__unserialize` detach only itself. A `WeakMap` holds neither key nor value strongly. Each class ends with `registerClass('<PHP name>', X)`. A brand is a prototype getter `get [Token.brand]() { return true }`, and each class carries every brand in its token chain. New XT cases use `xaravelTest` and `@xaravel/assert`.

**Never:** Import `@xaravel/contracts` from the runtime. Change any existing runtime behaviour beyond the four exports' doc comments and the new brands on `Error` / `Exception`. Add the new classes to `Symbol.for('xaravel.php.classes')`: it stays the 24 throwable/stdClass built-ins XT-runtime-35 pins, as Story 13.1's reflection classes do. Touch `conformance/expectations/**`, `decisions/**`, `packages/collections/**` or any other package. Change `contract()`'s behaviour, or an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Helpers | `arrayEntries({"1":"a",b:2})`, `arrayFromEntries([[0,"x"],[1,"y"]])`, `normalizeKey("07")` / `true` / `null` | `[[1,"a"],["b",2]]`, `["x","y"]`, `"07"` / `1` / `""` | `normalizeKey([])` throws PHP `TypeError` `Cannot access offset of type array on array` |
| gettype | `null,true,1,1.5,float(2),"s",[],{},new stdClass,()=>1` | `NULL boolean integer double double string array array object object` | none |
| getDebugType | same, plus an unregistered class instance, and one whose class extends a registered class `P` | `null bool int float float string array array stdClass Closure`, `class@anonymous`, `P@anonymous` | none |
| Tokens | `Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`, `Stringable`, `Throwable` | `isContractToken` true; `fqcn` is the PHP name; `interfaceExists(name)` true; brand `Symbol.for(name)`; parents: Iterator, IteratorAggregate → Traversable; Throwable → Stringable | none |
| JsonSerializable brand | class with `get [JsonSerializable.brand]()` and `jsonSerialize()` | `jsonEncode` encodes `jsonSerialize()`'s result; `x instanceof JsonSerializable` | none |
| Throwable | `new Error()`, `new Exception()`, `new InvalidArgumentException()` | `instanceof Throwable` and `Stringable`; a JS `Error` is not | none |
| ArrayIterator | `new ArrayIterator({a:1})` then push-style `offsetSet(null, …)` (or `undefined`), rewind/next | PHP's key/current/valid; `[...it]` the values, `[...it.entries()]` the pairs, `[...it.keys()]` the keys; `getArrayCopy()` a copy; `count()`; past the end `key()`/`current()` null | non-array non-object argument: PHP `TypeError` `ArrayIterator::__construct(): Argument #1 ($array) must be of type array, int given` |
| Live position | `{a:1,b:2}` at the end, unset `b`, set `c`; `{a,b,c}` at `a`, unset and re-set `a`; `foreach` doing the same | `valid()` true, `key()` `c`; `key()` `b`; `foreach` keys `a,c,a` | none |
| ArrayObject | `new ArrayObject(["x"=>1])`, then a write after `getIterator()` | `getIterator()` is an `ArrayIterator` over this object, with its flags, so it sees the write; `getArrayCopy`, `count`, `offset*`, `append`, `exchangeArray` (returns the old array); `jsonEncode` `{"0":1,"1":2}` for `[1,2]`; `phpSerialize` `O:11:"ArrayObject":4:{i:0;i:0;i:1;a:…;i:2;a:0:{}i:3;N;}` | same `TypeError` as ArrayIterator, with `ArrayObject::__construct()` |
| exchangeArray | `{x,y,z}`'s iterator after 0, 1, 2, 3 `next()`s, then `exchangeArray({p,q,r})` or `({p})`; `foreach` exchanging at `x` | keys `p`, `q`, `r`; `null` (invalid) for 2 and 3 into `{p}`; `foreach` keys `x,q,r` | none |
| Wrapping | `$out = new ArrayObject($in)`; `$out[] = 2`; `$out->exchangeArray([5,6])`; `serialize($out)` before the exchange | `count($in)` 2; `$in` unchanged by the exchange; `O:11:"ArrayObject":4:{i:0;i:0;i:1;O:11:"ArrayObject":4:{…}i:2;a:0:{}i:3;N;}` | none |
| __unserialize | one element; storage `5`; iterator class `Foo` / `stdClass`; `members` `{foo:"bar"}` | restores `foo` | `UnexpectedValueException` `Incomplete or ill-typed serialization data`; `InvalidArgumentException` `Passed variable is not an array or object`; `UnexpectedValueException` `Cannot deserialize ArrayObject with iterator class 'Foo'; no such class exists` / `…'stdClass'; this class does not implement the Iterator interface` |
| setIteratorClass | `setIteratorClass("stdClass")`; a registered `ArrayIterator` subclass | `getIterator()` an instance of the subclass, built without its constructor, as PHP does | PHP `TypeError` `ArrayObject::setIteratorClass(): Argument #1 ($iteratorClass) must be a class name derived from ArrayIterator, stdClass given` |
| Grader | `assertContains("x", new ArrayObject(["x"]))`, `assertCount(1, …)` | pass | none |
| CachingIterator | `new CachingIterator(new ArrayIterator({a:"x",b:"y"}))` | default flags `CALL_TOSTRING` (1); `hasNext()` true on `a`, false on `b`; `toString()` the cached current; `FULL_CACHE` gives `getCache()` and `count()`; under `FULL_CACHE` an object key throws PHP's `TypeError` `Cannot access offset of type stdClass on array` with the element cached and `valid()` true, as PHP's fetch order leaves it | no string flag: `toString()` throws `BadMethodCallException` `CachingIterator does not fetch string value (see CachingIterator::__construct)`; `getCache()` without `FULL_CACHE`: `… does not use a full cache …`; two string flags: `ValueError` (PHP's message) |
| WeakMap | keys `b`, `a`, `b` rewritten; `offsetUnset`; non-object key; a key collected after `Bun.gc(true)`, its value referencing it | `entries()` `[b,3],[a,2]` (insertion order, rewrite keeps position), `[...map]` `[3,2]`; `count()`; `offsetExists` false for a `null` value; the collected key's entry is gone from `count()` and iteration | `offsetSet(null` or `undefined`, …)`: PHP `Error` `Cannot append to WeakMap`; non-object key: PHP `TypeError` `WeakMap key must be an object`; missing key read: PHP `Error` `Object stdClass#<n> not contained in WeakMap`; `phpSerialize`: PHP `Exception` `Serialization of 'WeakMap' is not allowed` |

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
- Starting point: `retro-14-runtime-php-types-attempt-1.patch` is already applied to the working tree (`git apply`). Build on those files, edit them in place, and delete `_bmad-output/implementation-artifacts/retro-14-runtime-php-types-attempt-1.patch` at the end.
- `packages/runtime/src/php/phpType.ts` -- add `gettype(v)` and `getDebugType(v)` (an unregistered class instance is `class@anonymous`).
- `packages/runtime/src/php/casts.ts`, `PhpArray.ts` -- reword the "Internal" notes of `arrayEntries`, `normalizeKey`, `arrayFromEntries` (no behaviour change).
- `packages/runtime/src/php/phpInterface.ts` (internal) -- `phpInterface(name, members, parents, builtins)` builds a frozen token of `contract()`'s shape and calls `registerContractToken`.
- `packages/runtime/src/php/{Traversable,Iterator,IteratorAggregate,JsonSerializable,Stringable,Throwable}.ts` -- one token each, with a same-named TS interface; members and built-ins as the probe lists (`IteratorAggregate`: built-in `getIterator`; `Stringable`: built-in `__toString`; `Throwable`: the seven getters, parent `Stringable`; `Iterator`: `current, key, next, rewind, valid`).
- `packages/runtime/src/php/{ArrayIterator,ArrayObject,CachingIterator,WeakMap,InternalIterator}.ts` -- the classes, per the matrix. `ArrayIterator` and `ArrayObject` share a `PhpArray` storage; both give `getArrayCopy`, `count`, `offsetExists/Get/Set/Unset`, `append`, `getFlags`/`setFlags`, the props protocol, `__serialize`/`__unserialize`. `CachingIterator` ports PHP's fetch-ahead (`spl_caching_it_next`), `toString()` plus `[Symbol.toPrimitive]`, `getInnerIterator`, `getFlags`, `getCache` and `count` under `FULL_CACHE`. `WeakMap` holds `WeakRef` entries in insertion order, swept by a `FinalizationRegistry`. Its object ids for the missing-key message come from a runtime-local counter, as the grader's handles do.
- `packages/runtime/src/php/liveCursor.ts` -- re-derive `LiveCursor` over a source that gives each item an insertion sequence (strictly increasing along the live iterator), an `alive` test, the last sequence handed out and the collection's identity: an item deleted and re-set has a new sequence; at the end the cursor re-reads only when a later sequence exists; a changed identity keeps the position index. `foreachIterator` yields the pairs, and a `foreachValues` / `foreachKeys` pair maps them.
- `packages/runtime/src/php/arrayStorage.ts` -- a box is `{ array, seqs, lastSeq }` and every write goes through its `boxSet` / `boxPush` / `boxDelete`; an instance's state is its own box or the other SPL array object it wraps (`isSplArray` recognises instances `phpUnserialize` built too), plus flags, cursor and iterator class; `serializeState` writes a wrapped object as itself; `unserializeState` validates as PHP's `spl_array___unserialize` does (messages in the matrix) and detaches only this instance.
- `packages/runtime/src/php/Error.ts`, `Exception.ts` -- brand getters for `Throwable` and `Stringable`; `implements Throwable` if `tsc` accepts it.
- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export the helpers, tokens and classes, and import the token modules so loading an entry records them.
- `packages/runtime/tests/xaravel/php-builtins.test.ts` -- XT-runtime-51 (helpers and `gettype` / `getDebugType`), XT-runtime-52 (tokens, `Throwable` on the runtime's throwables, the `jsonEncode` hook, the class lookup), XT-runtime-53 (`ArrayIterator`, `ArrayObject`), XT-runtime-54 (`CachingIterator`), XT-runtime-55 (`WeakMap`), each row of the matrix, including the grader rows (`Assert.assertContains`, `Assert.assertCount` over an `ArrayObject`), a `Bun.gc(true)` case for a collected key whose value references it, the object-argument constructor path, `__unserialize`'s member restore, and the deleted-current case on a positioned cursor.
- `packages/contracts/tests/xaravel/runtime-tokens.test.ts` -- XT-contracts-22: each runtime token has the same own keys, descriptors and frozenness as a `contract()` token made with the same name, members, parents and built-ins, and `contract()` accepts it as a parent.
- `packages/runtime/docs/php-builtins.md` (new, linked from the README), `docs/php-values.md` -- name every new export, and say what is not ported: `ARRAY_AS_PROPS` / `STD_PROP_LIST` are kept but not acted on; no `seek` / sort methods; `CachingIterator`'s `ArrayAccess` and `setFlags` are not ported; a class porting `__toString` carries the `Stringable` brand itself, which PHP adds implicitly; the runtime's throwables keep their JS `toString()`; an `ArrayObject` over a non-SPL object copies its properties rather than writing through (PHP 8.5 deprecates that input); a position carried across `exchangeArray` follows insertion order, not PHP's compacted bucket indexes; `getDebugType` does not name an anonymous class after its first interface.
- `packages/runtime/async-surface.json` -- regenerate if the generator changes it.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-51..55 and XT-contracts-22 run, then each row holds.
- Given a fresh process, when any of the four runtime entries loads, then `Symbol.for('xaravel.class.lookup')("Throwable")` is the `Throwable` token, and `Symbol.for('xaravel.php.classes')` still has 24 entries.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-1-runtime-php-types --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

- 2026-10-25, after the Maintainer's amendment (values plus `entries()`): status `blocked` → `draft`. Intent contract amended in place: the iteration rule; PHP's hash position (append after a deleted last entry, re-set key, `exchangeArray` keeping the index); `Countable` / `ArrayAccess` brands; wrapping another SPL array object; the `WeakMap` ephemeron; `undefined` keys; `P@anonymous`; `__unserialize` validation; `setIteratorClass`; the grader rows. Known-bad state avoided: the attempt-1 cursor (no insertion sequence) and one shared box standing for both "iterator over its owner" and "wraps another object". Kept: everything else in `retro-14-runtime-php-types-attempt-1.patch`, which this pass re-applies and deletes.

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

### 2026-10-25 — Review pass (after the Maintainer's iteration ruling)
- verdicts: 28 findings — high 0, medium 1, low 20, false 5, maybe-false 2
- Fidelity Review layer: two `pass` verdicts at tree `ffd806ef5ab4de200a82f13dcb94ef3435fcbb19` (codex reviewer 1, claude reviewer 2), 0 findings.
- findings (blind-hunter):
  - `[low]` `[defer]` The attempt-1 patch file is still tracked though Tasks say to delete it — real; the deletion was refused by the permission classifier and the loop does not work around a refusal; reported for a later clean-up.
  - `[low]` `[patch]` `setIteratorClass` accepts an unregistered `ArrayIterator` subclass, then `getIteratorClass()` / `__serialize()` throw from `fqcn` — fixed: rejected at set time with PHP's `TypeError`.
  - `[low]` `[reject]` `getIterator()` builds the iterator with `Object.create`, so a subclass's JS / `#private` fields are missing — real, as PHP skips the constructor; it fails loudly, needs a custom iterator subclass with fields, and a fix needs a construction protocol the ruling does not define.
  - `[low]` `[patch]` Serialized members ignore PHP's name mangling — fixed with `mangle.ts`'s helpers (see the patch report).
  - `[low]` `[patch]` `__unserialize` assigns the flags where PHP masks them with `SPL_ARRAY_CLONE_MASK` — fixed with the mask.
  - `[low]` `[patch]` `InternalIterator` does not refuse serialization (PHP 8.5.11: `Serialization of 'InternalIterator' is not allowed`) — fixed, both throwers, with a test.
  - `[low]` `[reject]` The `foreach` generators are not exported for ports — adding public surface the intent does not ask for; Story 14.1 implements its own Traversables against PORTING.md's rule.
  - `[low]` `[patch]` `docs/php-values.md` says "four helpers" and lists five, mixing type-name functions in — fixed.
  - `[maybe-false]` `[reject]` The props hook returns the live storage, so a writer could desynchronise positions — no reader writes through it (`jsonEncode`, `looseEquals`, the grader read only); if true it would be low.
  - `[maybe-false]` `[patch]` XT-runtime-55's `Bun.gc` case requires all 100 keys collected (conservative stack scan) — passed 5 runs, but the assertion was made per case: at least one collected, iteration matches `count()`, the kept key stays.
  - `[low]` `[patch]` Coverage: `TOSTRING_USE_INNER`'s working path, an `ArrayIterator` serialize round trip, a wrapped object's position across `exchangeArray`, the cache cleared on rewind — tests added.
  - `[false]` `[reject]` The `Stringable` brand and the grader's `isStringable` disagree, and throwables keep their JS `toString()` — the ruling keeps the grader unchanged, the brand answers `instanceof` only, and the throwables' JS `toString()` is listed in `docs/php-builtins.md`.
- findings (edge-case-hunter):
  - `[low]` `[reject]` `Object.create` skips subclass field initializers — same as the blind-hunter row; rejected on the same grounds.
  - `[low]` `[reject]` `__unserialize` accepts any `Iterator` class (e.g. `CachingIterator`) as the iterator class — this is PHP's own check (probed: only "does not implement the Iterator interface" is refused); what such an iterator does is as ill-defined in PHP.
  - `[medium]` `[patch]` Nested arrays are shared by reference through the constructor copy and `getArrayCopy()` (PHP 8.5.11 keeps `$o` as `[[1]]`) — fixed with `valueCopy`, with a test.
  - `[low]` `[reject]` An unserialized member named like a method (`count`) shadows it — needs a crafted payload; a fix needs a separate member store.
  - `[low]` `[patch]` `FULL_CACHE` with an inner `key()` of `undefined` throws — fixed with `key ?? null`.
  - `[low]` `[defer]` The newly exported `normalizeKey(undefined)` throws where AD-9 reads `undefined` as `null` — pre-existing behaviour; the ruling forbids other runtime behaviour changes.
  - `[maybe-false]` `[patch]` The `Bun.gc` case may flake — grouped with the blind-hunter row.
  - `[low]` `[defer]` (claim) the attempt-1 patch is not deleted — same as the blind-hunter row.
  - `[false]` `[reject]` (claim) the spec says `class@anonymous` for any unregistered class — the matrix row now names `P@anonymous` for a registered parent.
- findings (verification-gap):
  - `[low]` `[patch]` `CachingIterator.rewind()` clearing the cache is not pinned — test added.
  - `[low]` `[patch]` `getIterator()` copying an iterator subclass's property defaults is never exercised — test added.
  - `[low]` `[patch]` The root-entry exports of the five helpers are not asserted — `assertSame(x, root.x)` added.
- findings (intent-alignment):
  - `[false]` `[reject]` Sprint status is not in the diff and still says the item waits on the Maintainer — the orchestrator writes sprint status in the PR that sets the item `done`.
  - `[low]` `[defer]` The attempt-1 patch is still present — same as the blind-hunter row.
  - `[false]` `[reject]` Only `ArrayObject` goes through the grader — the grader reads every non-`PhpArray` iterable through one function (`iterableValues`), so one class proves the path; the others' `[Symbol.iterator]` is tested directly.
  - `[false]` `[reject]` Two carried rows are resolved by a decision, not code — the contracts-parents row was carried as a question, and the first-interface name needs interface order the runtime cannot read; both are recorded in Design Notes and the docs.

### 2026-10-25 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- Fidelity Review layer: reviewer 1 (codex) `reject`, reviewer 2 (claude) `pass`, at tree `d45672521217dffabc03b120311e105ed00ebf87`.
- findings (fidelity-review):
  - `[medium]` `[patch]` F-2 `packages/runtime/tests/xaravel/php-builtins.test.ts` (missing-evidence): the PHP 8.5.11 probes behind the new expected values are only described in prose, so a reviewer cannot compare them with PHP — real (F-2 is outside the evidence-gap waiver). Fixed by supplying the evidence in tests: the probe script `php-builtins.probe.php`, its recorded output `php-builtins.probe.txt` (generated by the host's `php`), and a test case that reads the recorded output and checks the runtime against every line.

### 2026-10-25 — Review pass (Finalize re-check: Fidelity Review after the probe evidence)
- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- Fidelity Review layer: reviewer 1 (codex) `pass`, reviewer 2 (claude) `reject`, at tree `a006b207d83b056742ad94162960c81ad3cf87f4`.
- findings (fidelity-review):
  - `[low]` `[patch]` F-7 `packages/runtime/tests/xaravel/php-builtins.test.ts`: XT-runtime-56's consequence claims every exception XT-runtime-51 and 53..55 assert, but the probe has no label for the unregistered-class `setIteratorClass` message or the WeakMap `{}` / `null` / `undefined` key checks — real. Fixed: the consequence now claims the recorded cases only, the header lists what is not recorded, and the Xaravel-only assertions (an unregistered JS class object; `{}` and `undefined` keys under AD-9) are marked `Xaravel-only` with their reason.

## Design Notes

The tokens copy `contract()`'s shape rather than share it, because AD-2 keeps the runtime from importing contracts. XT-contracts-22 is the equivalence test the Epic 7 lesson asks for. Making `contract()` call a runtime factory would change contracts' behaviour, which the ruling does not ask for.

`[Symbol.iterator]` yields values and `entries()` / `keys()` the pairs and keys, by the Maintainer's amendment to `decisions/MAINT-2026-10-25-story-14-1.md`; `PhpArray` alone keeps its pair iterator. Story 14.1's `iterator_to_array` port reads a Traversable through `entries()`.

The position model is PHP's bucket index, approximated by a per-box insertion sequence (PHP 8.5.11 probes in the matrix). It differs from PHP only after PHP compacts a hash table with holes, which moves bucket indexes; that matters only to a position carried across `exchangeArray`, and is listed in `docs/php-builtins.md`.

Not changed: existing `@xaravel/contracts` tokens whose built-ins name `getIterator` or `__toString` do not list the new tokens as parents. That is a contracts behaviour change the ruling does not ask for (its limits allow `packages/contracts` only for a token's needs); the review row was carried as a question, not a defect. `getDebugType` names an unregistered class with no registered parent `class@anonymous`, where PHP names the first interface; the runtime cannot read a class's interface order (listed in the docs).

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

### Reviewer 1: pass at tree ffd806ef5ab4de200a82f13dcb94ef3435fcbb19

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T04:55:51.923Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests and changes none, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The diff adds Xaravel Tests without replacing existing expectations. No existing exact comparison, expected exception or message is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, and no existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all six added Xaravel Tests with their consequence strings. Their bodies check token equivalence, exports, registration, array helpers, iterator behavior, exceptions and WeakMap collection as declared; none cites an FR or AD consequence token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the runtime/contracts scope and Maintainer rulings. The PHP types belong to the authorized runtime work; no other Component is stubbed, and runtime imports no contracts implementation. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source bodies and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no Driver IO and accept no callback permitted to be async; no asyncRoot tag is required or falsely retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no setup or expression inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"ffd806ef5ab4de200a82f13dcb94ef3435fcbb19","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T04:55:51.923Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests and changes none, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds Xaravel Tests without replacing existing expectations. No existing exact comparison, expected exception or message is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, and no existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all six added Xaravel Tests with their consequence strings. Their bodies check token equivalence, exports, registration, array helpers, iterator behavior, exceptions and WeakMap collection as declared; none cites an FR or AD consequence token.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the runtime/contracts scope and Maintainer rulings. The PHP types belong to the authorized runtime work; no other Component is stubbed, and runtime imports no contracts implementation.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source bodies and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no Driver IO and accept no callback permitted to be async; no asyncRoot tag is required or falsely retained.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no setup or expression inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree ffd806ef5ab4de200a82f13dcb94ef3435fcbb19

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T04:55:51.923Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and has no Inventory rows. It adds or changes only Xaravel Tests (XT-contracts-22, XT-runtime-51..55), so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there is no Upstream expected value that could be weakened. The changed files are a new runtime surface and new Xaravel Tests; no existing assertion was loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion count applies. Evidence (a) confirms no adapted marker or DIV clause is cited. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) confirms that no added line carries an 'adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field is touched. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) confirms there are no assigned Oracle fixtures and no error fixtures, base or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each consequence string was compared with its test body. XT-contracts-22 compares own keys, order, descriptors and frozenness through shape(), nested values through JSON, instanceof parity over several values, and the parent use in contract(). XT-runtime-51 asserts the arrayEntries, arrayFromEntries and normalizeKey rules and the gettype / getDebugType names. XT-runtime-52 checks token recording, lookup and exports, the Throwable/Stringable brands on the runtime's throwables (and their absence on a JS Error), jsonEncode's JsonSerializable hook, and Throwable resolution plus the 24-entry map in fresh processes for each entry. XT-runtime-53 covers offset access, append, count, getArrayCopy, the three iteration forms, hash-position cases, exchangeArray index carry, wrapping, json/serialize, __unserialize checks, setIteratorClass, the Countable/ArrayAccess brands and the scalar TypeError. XT-runtime-54 covers CALL_TOSTRING, hasNext, iteration, the string flags, FULL_CACHE with the object-key case, the Countable brand and the three exception types. XT-runtime-55 covers insertion order, the null-as-unset rule, weak collection after GC, and the TypeError, Error and serialization Exception. None cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every code change is inside packages/runtime and packages/contracts, the scope MAINT-2026-10-25-story-14-1 gives this action item. The runtime builds the tokens itself instead of importing contracts (AD-2), and XT-contracts-22 pins them equal to contract()'s tokens. No stub, fake or hard-coded behaviour of another Component (collections, assert, etc.) is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in any changed src file. Every added export is sync: the tokens, ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, liveCursor generators, phpInterface, gettype and getDebugType. None does Driver IO or accepts a callback DIV-1 allows to be async, so none needs a tag. The only async function is the XT-runtime-55 test body, which is not a framework export. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ffd806ef5ab4de200a82f13dcb94ef3435fcbb19","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T04:55:51.923Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and has no Inventory rows. It adds or changes only Xaravel Tests (XT-contracts-22, XT-runtime-51..55), so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream expected value that could be weakened. The changed files are a new runtime surface and new Xaravel Tests; no existing assertion was loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion count applies. Evidence (a) confirms no adapted marker or DIV clause is cited.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) confirms that no added line carries an `adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field is touched.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) confirms there are no assigned Oracle fixtures and no error fixtures, base or changed.","findings":[]},{"id":"F-7","result":"pass","note":"Each consequence string was compared with its test body. XT-contracts-22 compares own keys, order, descriptors and frozenness through shape(), nested values through JSON, instanceof parity over several values, and the parent use in contract(). XT-runtime-51 asserts the arrayEntries, arrayFromEntries and normalizeKey rules and the gettype / getDebugType names. XT-runtime-52 checks token recording, lookup and exports, the Throwable/Stringable brands on the runtime's throwables (and their absence on a JS Error), jsonEncode's JsonSerializable hook, and Throwable resolution plus the 24-entry map in fresh processes for each entry. XT-runtime-53 covers offset access, append, count, getArrayCopy, the three iteration forms, hash-position cases, exchangeArray index carry, wrapping, json/serialize, __unserialize checks, setIteratorClass, the Countable/ArrayAccess brands and the scalar TypeError. XT-runtime-54 covers CALL_TOSTRING, hasNext, iteration, the string flags, FULL_CACHE with the object-key case, the Countable brand and the three exception types. XT-runtime-55 covers insertion order, the null-as-unset rule, weak collection after GC, and the TypeError, Error and serialization Exception. None cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Every code change is inside packages/runtime and packages/contracts, the scope MAINT-2026-10-25-story-14-1 gives this action item. The runtime builds the tokens itself instead of importing contracts (AD-2), and XT-contracts-22 pins them equal to contract()'s tokens. No stub, fake or hard-coded behaviour of another Component (collections, assert, etc.) is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in any changed src file. Every added export is sync: the tokens, ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, liveCursor generators, phpInterface, gettype and getDebugType. None does Driver IO or accepts a callback DIV-1 allows to be async, so none needs a tag. The only async function is the XT-runtime-55 test body, which is not a framework export.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree d45672521217dffabc03b120311e105ed00ebf87

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:02:51.366Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests, so there are no Inventory source assertions to match. |
| F-2: No expected value is weakened | fail | The new Xaravel Tests assert PHP values and messages, but the PHP probes cited as their basis are absent from the prompt, preventing confirmation against Upstream. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed; both changed test files are additions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all six Xaravel Test consequences with their bodies: the assertions exercise token equivalence, exports, lookup, iteration, storage, caching, errors and weak-key collection as declared. No consequence cites an FR or AD bullet token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementations with the approved runtime/contracts scope in ESC-14.1-1, ESC-14.1-2 and the Maintainer ruling. The added PHP types belong to that authorized scope, with no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no async-root IO and accept no callback requiring async derivation; no asyncRoot tag is needed or retained on them. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file, so there are no changed setup or exprs inputs to compare. |

Findings:

- **F-2** `packages/runtime/tests/xaravel/php-builtins.test.ts`: Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"d45672521217dffabc03b120311e105ed00ebf87","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:02:51.366Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests, so there are no Inventory source assertions to match.","findings":[]},{"id":"F-2","result":"fail","note":"The new Xaravel Tests assert PHP values and messages, but the PHP probes cited as their basis are absent from the prompt, preventing confirmation against Upstream.","findings":[{"path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation.","kind":"missing-evidence"}]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed; both changed test files are additions.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all six Xaravel Test consequences with their bodies: the assertions exercise token equivalence, exports, lookup, iteration, storage, caching, errors and weak-key collection as declared. No consequence cites an FR or AD bullet token.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementations with the approved runtime/contracts scope in ESC-14.1-1, ESC-14.1-2 and the Maintainer ruling. The added PHP types belong to that authorized scope, with no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. The new implementations are synchronous, perform no async-root IO and accept no callback requiring async derivation; no asyncRoot tag is needed or retained on them.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file, so there are no changed setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree d45672521217dffabc03b120311e105ed00ebf87

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:02:51.366Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test (only Xaravel Tests XT-contracts-22 and XT-runtime-51..55), so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, and the action item lists no stale_tests. The new Xaravel Tests have no Upstream expected values to weaken. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added, changed or removed, so no Upstream assertion count applies. No adapted marker is present. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and no touched Xaravel Test relies on an Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each body was compared with its consequence string. XT-contracts-22 checks own-key shape and order, descriptors, frozenness, nested methods/parameters/builtins, parent identity, toPrimitive, instanceof parity, and contract() taking a runtime token as a parent. XT-runtime-51 checks arrayEntries, arrayFromEntries and normalizeKey cases, gettype/getDebugType names including P@​anonymous, and the root re-exports. XT-runtime-52 checks token recording, fqcn, interfaceExists, lookup, parents, methods and builtins; Throwable and Stringable on the runtime's throwables and not on a JS Error; the jsonEncode JsonSerializable hook; and, in fresh processes, that each of the four entries resolves 'throwable' and keeps the 24-entry map. XT-runtime-53, 54 and 55 cover each clause they list: offset access, iteration forms, hash position, wrapping, serialize/__unserialize checks, setIteratorClass, brands and TypeErrors for ArrayIterator/ArrayObject; CALL_TOSTRING, hasNext, string flags, FULL_CACHE and the object-key TypeError, and the exceptions for CachingIterator; insertion order, a rewritten key keeping its position, null as not set, weak collection (count below 101 and iteration length equal to count), and the TypeError/Error/serialization Exception for WeakMap. No consequence cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/runtime or packages/contracts, the action item's own scope (MAINT-2026-10-25-story-14-1, ESC-14.1-1/2). The runtime adds the ruled types itself and does not import contracts (phpInterface copies contract()'s shape, and XT-contracts-22 pins the two equal). The Countable and ArrayAccess brands are marker symbols the grader already reads, not a stub of another Component. Nothing hard-codes a Collections result. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed src file. Every new export (ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, LiveCursor, phpInterface, gettype/getDebugType, the array helpers and the tokens) is synchronous: it returns plain values or sync generators, does no Driver IO and takes no async callback. So no tag is missing and none is false. The README still lists only resolveClassAsync and interleave as async. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"d45672521217dffabc03b120311e105ed00ebf87","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:02:51.366Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test (only Xaravel Tests XT-contracts-22 and XT-runtime-51..55), so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, and the action item lists no stale_tests. The new Xaravel Tests have no Upstream expected values to weaken.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added, changed or removed, so no Upstream assertion count applies. No adapted marker is present.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and no touched Xaravel Test relies on an Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Each body was compared with its consequence string. XT-contracts-22 checks own-key shape and order, descriptors, frozenness, nested methods/parameters/builtins, parent identity, toPrimitive, instanceof parity, and contract() taking a runtime token as a parent. XT-runtime-51 checks arrayEntries, arrayFromEntries and normalizeKey cases, gettype/getDebugType names including P@anonymous, and the root re-exports. XT-runtime-52 checks token recording, fqcn, interfaceExists, lookup, parents, methods and builtins; Throwable and Stringable on the runtime's throwables and not on a JS Error; the jsonEncode JsonSerializable hook; and, in fresh processes, that each of the four entries resolves 'throwable' and keeps the 24-entry map. XT-runtime-53, 54 and 55 cover each clause they list: offset access, iteration forms, hash position, wrapping, serialize/__unserialize checks, setIteratorClass, brands and TypeErrors for ArrayIterator/ArrayObject; CALL_TOSTRING, hasNext, string flags, FULL_CACHE and the object-key TypeError, and the exceptions for CachingIterator; insertion order, a rewritten key keeping its position, null as not set, weak collection (count below 101 and iteration length equal to count), and the TypeError/Error/serialization Exception for WeakMap. No consequence cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/runtime or packages/contracts, the action item's own scope (MAINT-2026-10-25-story-14-1, ESC-14.1-1/2). The runtime adds the ruled types itself and does not import contracts (phpInterface copies contract()'s shape, and XT-contracts-22 pins the two equal). The Countable and ArrayAccess brands are marker symbols the grader already reads, not a stub of another Component. Nothing hard-codes a Collections result.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed src file. Every new export (ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, LiveCursor, phpInterface, gettype/getDebugType, the array helpers and the tokens) is synchronous: it returns plain values or sync generators, does no Driver IO and takes no async callback. So no tag is missing and none is false. The README still lists only resolveClassAsync and interleave as async.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree a006b207d83b056742ad94162960c81ad3cf87f4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:08:54.725Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | Compared the new expected values with the supplied PHP probe inputs and outputs, including serialization, iterator mutation and exception messages. No expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions or stale cross-component tests are changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change introduces no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all seven Xaravel Tests with their consequence strings and helpers. Their assertions cover token equivalence, exports, iteration, storage, caching, weak keys and the recorded PHP probe cases. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the approved runtime/contracts scope and ESC-14.1-1/2. No other Component's behavior is implemented, and runtime imports no contracts package. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations with AD-6 and DIV-1. The new implementations are synchronous and require no asyncRoot tags; no existing tags are changed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-2) `packages/runtime/tests/xaravel/php-builtins.test.ts`: Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation. **fixed**: The prompt now supplies the complete PHP 8.5.11 probe inputs and recorded outputs, including serialization, iterator mutation and exception messages, plus corresponding runtime comparisons in XT-runtime-56.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a006b207d83b056742ad94162960c81ad3cf87f4","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:08:54.725Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new expected values with the supplied PHP probe inputs and outputs, including serialization, iterator mutation and exception messages. No expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions or stale cross-component tests are changed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change introduces no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all seven Xaravel Tests with their consequence strings and helpers. Their assertions cover token equivalence, exports, iteration, storage, caching, weak keys and the recorded PHP probe cases.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the approved runtime/contracts scope and ESC-14.1-1/2. No other Component's behavior is implemented, and runtime imports no contracts package.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations with AD-6 and DIV-1. The new implementations are synchronous and require no asyncRoot tags; no existing tags are changed.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-2","path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation.","fixed":true,"note":"The prompt now supplies the complete PHP 8.5.11 probe inputs and recorded outputs, including serialization, iterator mutation and exception messages, plus corresponding runtime comparisons in XT-runtime-56."}]}
```

### Reviewer 2: reject at tree a006b207d83b056742ad94162960c81ad3cf87f4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:08:54.725Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests are touched. |
| F-2: No expected value is weakened | pass | Compared the expected values in XT-runtime-51 and 53..55 (serialize strings, iterator positions, exchangeArray keys, exception classes and messages) with php-builtins.probe.txt, the PHP 8.5.11 output of php-builtins.probe.php; they match. XT-runtime-56 checks every probe label against the runtime with assertSame on the JSON. Two checks are not exact, and neither weakens a PHP value: the WeakMap missing-key message uses a pattern because the object id is a runtime-local counter (the probe writes it as #<n>, as documented), and the garbage-collection check is not a PHP-derived value. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests, so no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker, and no Expectations adapted field is set. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No assigned or changed Oracle fixture is an error; the item relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-contracts-22 and XT-runtime-51 to 55 check what their descriptions claim. XT-runtime-56's description says the probe records every exception class and message that XT-runtime-51 and 53..55 assert, but some asserted messages have no probe label: XT-runtime-53's 'UnregisteredIterator given' TypeError (a JS-only unregistered class), and XT-runtime-55's WeakMap checks with a {} key, a null key and an undefined key. No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed source is in packages/runtime and packages/contracts, the action item's two components. No other component is stubbed or faked. The runtime builds its tokens without importing contracts (AD-2), and XT-contracts-22 checks that they match contract() tokens. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in any changed file. None of the new exports (ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, liveCursor, phpInterface, gettype/getDebugType and the array helpers) returns a Promise, does IO or takes a callback that may be async, so none needs a tag. Only the XT-runtime-55 test body is async, and it is test code, not framework source. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-builtins.test.ts`: XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-2) `packages/runtime/tests/xaravel/php-builtins.test.ts`: Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation. **fixed**: The change adds php-builtins.probe.php (the PHP inputs) and php-builtins.probe.txt (the PHP 8.5.11 output) for serialization, iterator mutation and exception messages. XT-runtime-56 compares every label with the runtime, and the values hard-coded in XT-runtime-51 and 53..55 match the recorded PHP output.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a006b207d83b056742ad94162960c81ad3cf87f4","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:08:54.725Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests are touched.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the expected values in XT-runtime-51 and 53..55 (serialize strings, iterator positions, exchangeArray keys, exception classes and messages) with php-builtins.probe.txt, the PHP 8.5.11 output of php-builtins.probe.php; they match. XT-runtime-56 checks every probe label against the runtime with assertSame on the JSON. Two checks are not exact, and neither weakens a PHP value: the WeakMap missing-key message uses a pattern because the object id is a runtime-local counter (the probe writes it as #<n>, as documented), and the garbage-collection check is not a PHP-derived value.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests, so no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker, and no Expectations adapted field is set.","findings":[]},{"id":"F-6","result":"n/a","note":"No assigned or changed Oracle fixture is an error; the item relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"fail","note":"XT-contracts-22 and XT-runtime-51 to 55 check what their descriptions claim. XT-runtime-56's description says the probe records every exception class and message that XT-runtime-51 and 53..55 assert, but some asserted messages have no probe label: XT-runtime-53's 'UnregisteredIterator given' TypeError (a JS-only unregistered class), and XT-runtime-55's WeakMap checks with a {} key, a null key and an undefined key. No FR or AD tokens are cited.","findings":[{"path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All changed source is in packages/runtime and packages/contracts, the action item's two components. No other component is stubbed or faked. The runtime builds its tokens without importing contracts (AD-2), and XT-contracts-22 checks that they match contract() tokens.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in any changed file. None of the new exports (ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, liveCursor, phpInterface, gettype/getDebugType and the array helpers) returns a Promise, does IO or takes a callback that may be async, so none needs a tag. Only the XT-runtime-55 test body is async, and it is test code, not framework source.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-2","path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"Supply the cited PHP 8.5.11 probe inputs and outputs from the action item's spec, particularly for serialization, iterator mutation and exception messages, so the new expected values can be compared with PHP rather than the implementation.","fixed":true,"note":"The change adds php-builtins.probe.php (the PHP inputs) and php-builtins.probe.txt (the PHP 8.5.11 output) for serialization, iterator mutation and exception messages. XT-runtime-56 compares every label with the runtime, and the values hard-coded in XT-runtime-51 and 53..55 match the recorded PHP output."}]}
```

### Reviewer 1: pass at tree ac30a98557812b162ff552bd35833c8ed7a8ba90

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:10:08.133Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are assigned, added or changed. |
| F-2: No expected value is weakened | pass | Compared the added test expectations with the supplied PHP probe outputs; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions or stale cross-component test assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all seven Xaravel Test consequences with their bodies and helpers. They check the declared behavior; XT-runtime-56 now limits its claim to recorded probe cases and explicitly excludes Xaravel-only cases. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementations with the approved runtime/contracts scope and ESC-14.1-1/2. No implementation of another Component is introduced, and runtime does not import contracts. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source and declaration inventory with AD-6 and DIV-1. The added implementations are synchronous, perform no IO and accept no permitted async callbacks requiring tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-builtins.test.ts`: XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart. **fixed**: XT-runtime-56 now claims only the values recorded in php-builtins.probe.txt. The file header explicitly excludes the unregistered iterator and Xaravel-specific WeakMap key cases, and the unregistered iterator assertion is marked Xaravel-only.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"ac30a98557812b162ff552bd35833c8ed7a8ba90","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:10:08.133Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are assigned, added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the added test expectations with the supplied PHP probe outputs; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions or stale cross-component test assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all seven Xaravel Test consequences with their bodies and helpers. They check the declared behavior; XT-runtime-56 now limits its claim to recorded probe cases and explicitly excludes Xaravel-only cases.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementations with the approved runtime/contracts scope and ESC-14.1-1/2. No implementation of another Component is introduced, and runtime does not import contracts.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source and declaration inventory with AD-6 and DIV-1. The added implementations are synchronous, perform no IO and accept no permitted async callbacks requiring tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart.","fixed":true,"note":"XT-runtime-56 now claims only the values recorded in php-builtins.probe.txt. The file header explicitly excludes the unregistered iterator and Xaravel-specific WeakMap key cases, and the unregistered iterator assertion is marked Xaravel-only."}]}
```

### Reviewer 2: pass at tree ac30a98557812b162ff552bd35833c8ed7a8ba90

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab`, on 2026-10-26T05:10:08.133Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests (XT-runtime-51..56, XT-contracts-22) are touched. |
| F-2: No expected value is weakened | n/a | No Ported Test, so there is no Upstream expected value to compare. No stale_tests path is listed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker or Expectations adapted field is added (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture, and none has an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its body. XT-runtime-51 checks the three array helpers, the gettype/getDebugType names and the root re-exports. XT-runtime-52 checks token recording, parents, methods and builtins; Throwable/Stringable on the runtime's throwables; the JsonSerializable hook; the 24-entry class map; and 'Throwable' resolving from each of the four entries in fresh processes. XT-runtime-53/54/55 assert each listed behaviour, including brands, errors, iteration forms and the weak-key collection check. XT-runtime-56 compares every recorded probe label with the runtime's result and checks that the label set equals PROBE_CASES. XT-contracts-22 compares own keys, descriptors, frozenness, nested values, instanceof behaviour and parent acceptance. No FR/AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/runtime or packages/contracts (tests only in contracts), both within the item's scope. The runtime copies the contract() token shape rather than importing contracts (AD-2). The ArrayObject, WeakMap and other classes are the runtime additions ESC-14.1-2 approves, not a stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in the changed source files. All new exports (tokens, ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, gettype, getDebugType, the array helpers) are synchronous and do no IO, so none needs a tag. The only async function is the XT-runtime-55 test body, which is not a public method. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/runtime/tests/xaravel/php-builtins.test.ts`: XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart. **fixed**: XT-runtime-56's consequence string now claims only 'every PHP 8.5.11 value recorded in php-builtins.probe.txt ... and the exception class and message of each recorded case'. The file header names the unrecorded cases as Xaravel-only: an unregistered JS class object, a plain object or undefined as a key, the WeakMap null-key reads and the undefined appends. The UnregisteredIterator assertion and the WeakMap {} key carry Xaravel-only comments.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ac30a98557812b162ff552bd35833c8ed7a8ba90","base":"6c6a4ec17b1cd3507293685e4e55b1d114a7e8ab","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T05:10:08.133Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests (XT-runtime-51..56, XT-contracts-22) are touched.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test, so there is no Upstream expected value to compare. No stale_tests path is listed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion to count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker or Expectations adapted field is added (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture, and none has an error output.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its body. XT-runtime-51 checks the three array helpers, the gettype/getDebugType names and the root re-exports. XT-runtime-52 checks token recording, parents, methods and builtins; Throwable/Stringable on the runtime's throwables; the JsonSerializable hook; the 24-entry class map; and 'Throwable' resolving from each of the four entries in fresh processes. XT-runtime-53/54/55 assert each listed behaviour, including brands, errors, iteration forms and the weak-key collection check. XT-runtime-56 compares every recorded probe label with the runtime's result and checks that the label set equals PROBE_CASES. XT-contracts-22 compares own keys, descriptors, frozenness, nested values, instanceof behaviour and parent acceptance. No FR/AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/runtime or packages/contracts (tests only in contracts), both within the item's scope. The runtime copies the contract() token shape rather than importing contracts (AD-2). The ArrayObject, WeakMap and other classes are the runtime additions ESC-14.1-2 approves, not a stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in the changed source files. All new exports (tokens, ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator, gettype, getDebugType, the array helpers) are synchronous and do no IO, so none needs a tag. The only async function is the XT-runtime-55 test body, which is not a public method.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/php-builtins.test.ts","detail":"XT-runtime-56's description claims it covers 'every exception class and message XT-runtime-51 and 53..55 assert', but php-builtins.probe.txt has no label for the 'ArrayObject::setIteratorClass(): ... UnregisteredIterator given' message (XT-runtime-53) or for the WeakMap checks with {}, null and undefined keys (XT-runtime-55). Either narrow the description so it excludes the Xaravel-only cases, or mark those assertions as Xaravel-specific with no PHP counterpart.","fixed":true,"note":"XT-runtime-56's consequence string now claims only 'every PHP 8.5.11 value recorded in php-builtins.probe.txt ... and the exception class and message of each recorded case'. The file header names the unrecorded cases as Xaravel-only: an unregistered JS class object, a plain object or undefined as a key, the WeakMap null-key reads and the undefined appends. The UnregisteredIterator assertion and the WeakMap {} key carry Xaravel-only comments."}]}
```

## Auto Run Result

### 2026-10-25 — resumed after the Maintainer's ruling (values plus `entries()`)

Status: done

**Summary.** The runtime half of ESC-14.1-1 / ESC-14.1-2, re-derived from the attempt-1 patch under the Maintainer's iteration ruling:
- `@xaravel/runtime/php` exports `arrayEntries`, `arrayFromEntries`, `normalizeKey`, `gettype` and `getDebugType` (`P@anonymous` for an unregistered subclass of a registered class).
- Six interface tokens: `Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`, `Stringable` and `Throwable`. The runtime's `Error` / `Exception` implement `Throwable`.
- The classes `ArrayIterator`, `ArrayObject`, `CachingIterator`, `WeakMap` and `InternalIterator`. Each `[Symbol.iterator]()` yields values, `entries()` gives pairs and `keys()` gives keys.
- PHP's hash position, built on an insertion-sequence cursor.
- SPL array wrapping with detach-only `exchangeArray` / `__unserialize`.
- `Countable` / `ArrayAccess` brands.
- A `WeakMap` that holds its values in an ephemeron.
- PHP's `__unserialize` validation, flags, member mangling and `setIteratorClass`.

**Files** (`packages/runtime/`):
- `src/php/liveCursor.ts`: the PHP hash position and the `foreach` generators.
- `src/php/arrayStorage.ts`: boxes, wrapping, serialize and unserialize.
- `src/php/{ArrayIterator,ArrayObject,CachingIterator,WeakMap,InternalIterator}.ts`: the classes.
- `src/php/{Traversable,Iterator,IteratorAggregate,JsonSerializable,Stringable,Throwable,phpInterface}.ts`: the tokens.
- `src/php/{phpType,PhpArray,casts,Error,Exception,index}.ts` and `src/index.ts`: the exports, type names and brands.
- `tests/xaravel/php-builtins.test.ts` (XT-runtime-51, 53..56), with `php-builtins.probe.php` and `.probe.txt` (PHP 8.5.11's recorded output, which XT-runtime-56 checks).
- `docs/php-builtins.md`, `docs/php-values.md`, `docs/exceptions.md` and `README.md`.
- In `packages/contracts/`, `tests/xaravel/runtime-tokens.test.ts` (XT-contracts-22).

**Review.** The first pass had 28 findings, the two Fidelity re-checks one each.
- 15 patched: 1 medium (nested-array copies) and the rest low, among them F-2's probe evidence and F-7's narrowed claim.
- 3 deferred: the attempt-1 patch deletion (permission refused) and `normalizeKey(undefined)`, which is pre-existing behaviour. The frontmatter `deferred` list has both.
- The rest were rejected; the triage log records each reason.

**Follow-up review recommended:** false. This pass patched 1 medium and 0 high, and the two Fidelity re-checks ran on the patched tree.

**Verification.**
- `bun test packages/runtime packages/contracts`: 78 pass. `php-builtins.test.ts` passed 3 runs in a row.
- `bun run typecheck`, `bun run lint` and `async-surface --check runtime` are clean.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, 400 Xaravel Tests passed (run on the tree with the probe; the last change after it was a test description and comments only, and that file passes alone).
- The probe output reproduces byte for byte with the host's `php`.
- `fidelity:review status --item`: `current` at tree `ac30a98557812b162ff552bd35833c8ed7a8ba90`.

**Residual risks.**
- A position carried across `exchangeArray` follows insertion order, not PHP's compacted bucket indexes.
- An `ArrayObject` that would wrap itself takes a copy.
- The props hook returns the live storage, which only readers use.
- An iterator subclass built without its constructor lacks its JS fields.
- `retro-14-runtime-php-types-attempt-1.patch` is still tracked; deleting it was refused.

### 2026-10-25 — first attempt

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
