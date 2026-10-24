---
title: 'Epic 10 item 5: a double takes the methods of its parents chain and their built-ins'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '4a9b4ef51b50bf3b207d033d83835af3998f6896'
review_loop_iteration: 2
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      A double of a token with built-ins carries no PHP built-in interface brand (Symbol.for('Countable'), 'ArrayAccess', 'Traversable', 'IteratorAggregate', 'Stringable'), so the grader's isCountable/phpCount and instanceof checks reject it where a PHP mock passes.
    evidence: |-
      packages/assert/src/comparison/PhpValues.ts:16-24 reads Countable through the brand Symbol.for('Countable'). Doubles never carried built-in brands before this item; ESC-10.2-4 rules on methods only, so adding brands needs its own ruling or action item.
    location: >-
      packages/assert/src/Framework/MockObject/Generator/ContractParents.ts
    severity: medium
  - summary: >-
      An unconfigured built-in with no signature row returns null (DIV-6.4), so String(double) of a Stringable double is "null" and count() is null, where PHPUnit returns "" and 0 from the declared return types.
    evidence: |-
      conformance/api-surface has no rows for Countable, ArrayAccess, IteratorAggregate or Stringable, so ConfigurableMethod.signature() is null for every built-in and the DIV-6.4 no-row default applies. Settled by built-in signature rows or a DIV-6.4 clause.
    location: >-
      packages/assert/src/Framework/MockObject/Generator/Generator.ts
    severity: low
---

# Epic 10 item 5: a double takes the methods of its parents chain and their built-ins

Action item `epic-10-item-5-double-inherited-methods` (decisions/ESC-10.2-4.md and its 2026-10-23 clarification), scope `packages/assert` and `packages/mockery`, on the route of the MAINT-2026-10-16 amendment of 2026-10-22. Resumed after #354 answered the intent gap below: the built-ins list holds PHP names (reading 1).

<intent-contract>

## Intent

**Problem:** A PHPUnit double (`createMock`/`createStub`) or a JMac Double (`Double.for`) of a contract token doubles only the token's own `Symbol.for('xaravel.contract.methods')`, so a double of a child contract, or of a contract whose PHP parent is a built-in interface (`Countable`, `ArrayAccess`, `IteratorAggregate`, `Stringable`), cannot configure an inherited method as a PHP mock can (ESC-10.2-4, approved option 1).

**Approach:** One shared walk in `@xaravel/assert` (`ContractParents.ts`, beside `contractParentBrands`) lists a token's methods: its own, then its built-ins (`Symbol.for('xaravel.contract.builtins')`, PHP names), then each token in its parents closure (walk order) with its own methods and built-ins, each name once (first wins, compared case-insensitively as PHP names are), each with its declaring contract. Both readers double that list. When the list holds the built-in `getIterator`, the double's `[Symbol.iterator]()` iterates what `getIterator` returns; when it holds the built-in `__toString`, the double's `toString()` and `[Symbol.toPrimitive]()` return what `__toString` returns, and configuring `toString` configures `__toString`.

## Boundaries & Constraints

**Always:** Change only `packages/assert/**`, `packages/mockery/**` and this item's records under `_bmad-output/implementation-artifacts/`. Absent or `null` built-ins (and parents) means none: a token with neither key doubles exactly what it does today. A built-in's declaring class is its PHP interface (`count` → `Countable`; `offsetExists`/`offsetGet`/`offsetSet`/`offsetUnset` → `ArrayAccess`; `getIterator` → `IteratorAggregate`; `__toString` → `Stringable`); any other built-in name is declared by the token that lists it. An inherited method's declaring class is the parent token that lists it, so the signature lookup asks for that parent's FQCN. A bare-symbol parent contributes its brand only (it lists no methods). The `getIterator`/`__toString` wiring applies only to a built-in reached through `builtins`, never to a method a token merely lists, and never to a class target. The `toString` alias applies only when the double has the built-in `__toString` and no method named `toString`. Existing assertions stay; where XT-assert-22 and XT-mockery-13 pinned "doubled methods stay the token's own list" (ESC-10.1-6's interim scope), their expected values follow ESC-10.2-4, which supersedes that line, and their descriptions say so.

**Never:** Import `@xaravel/contracts` or `@xaravel/runtime` from a grader package (AD-2). Touch `packages/contracts` (the `builtins` half is Story 10.2's), `conformance/expectations/**`, any other component, Protected tooling outside these two packages, or the item's `action`/`owner`/`epic`. Change `Mockery.mock` (bare-symbol tokens only; out of the action's named `DoubleTarget`). Accept a symbol as a method name in `method()`/`expects()`/`allows()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inherited | `Child` methods `[child]`, parents `[Parent]`; `Parent` methods `[parent]`, parents `[Root]`; `Root` methods `[root]` | double has `child`, `parent`, `root`; `method('root')` / `expects('root')` configures it; an Invocation of `root` declares `Root` | none |
| Once | `Child` and `Parent` both list `shared` (or `Shared`) | one doubled `shared`, declared by `Child` | none |
| Built-ins | token builtins `['count','offsetGet','getIterator','__toString']` | each configurable by that name; `count(double)`-style call `double.count()` returns the configured value | none |
| Iterator | `getIterator` configured to return `[1,2]` (or a generator) | `[...double]` is `[1,2]`; one recorded `getIterator` call | none |
| Iterator unconfigured | no `getIterator` configuration (PHPUnit stub; JMac loose) | `[...double]` is `[]` (the null default iterates nothing) | none |
| Iterator bad | `getIterator` returns `42` | `TypeError: Objects returned by <double class>::getIterator() must be traversable or implement interface Iterator` | thrown when iterated |
| Stringable | `__toString` configured to return `"x"` | `double.toString()`, `` `${double}` ``, `String(double)` all `"x"`; configuring `toString` instead gives the same, recorded as `__toString` | none |
| Parent built-in | `Child` parents `[Parent]`, `Parent` builtins `['getIterator']` | double of `Child` is iterable through `getIterator` | none |
| No keys | token without builtins/parents keys, or `null` | methods and prototype symbol keys as on the baseline | none |
| Bad builtins | builtins `42`, or `[Symbol.iterator]` | `TypeError: <name>: [Symbol.for('xaravel.contract.builtins')] must be an iterable of method names` / `… must hold method names, got symbol` | thrown when the target is read |

</intent-contract>

## Code Map

- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts` -- holds `contractParentBrands` and `isContractToken` (shared with mockery via the `@xaravel/assert` index). Add `contractMethods(token, nameOf)` returning `{ name, contract: object | null, declaringName, builtin: boolean }[]`, with the own-methods validation messages both packages use today (moved here), the new builtins messages, and the parents walk factored so both functions share it.
  - **Built-in status is the union over the closure** (review loop 1): a name is a built-in when any token in the closure lists it in `builtins`, even when an earlier token (the target or a nearer parent) lists it as a plain method, as Laravel's `Enumerable` redeclares `IteratorAggregate::getIterator`. The entry keeps the first listing's `name`, `contract` and `declaringName` (PHP: the redeclaring interface declares it); only `builtin` becomes `true`.
  - **The JS protocols live here too, once** (review loop 1, Epic 4 lesson): export `defineContractProtocols(prototype, className, { getIterator: string | null, toString: string | null, wireToString: boolean })`. It defines `[Symbol.iterator]` (calls `this[getIterator]()`, then iterates it: `null`/`undefined` iterates nothing, an iterable object is iterated, anything else throws `TypeError: Objects returned by <className>::getIterator() must be traversable or implement interface Iterator`), and, for `toString`, `[Symbol.toPrimitive]` and (when `wireToString`) `toString`, each calling `this[toString]()`; every one non-enumerable, writable, configurable, with a readable `name`. Neither package keeps its own copy of the iterate-or-throw rule or the message.
- `packages/assert/src/index.ts` -- exports `contractParentBrands`; add `contractMethods` (and its type) and `defineContractProtocols`. XT-assert-3 pins the exact export list in `packages/assert/tests/xaravel/comparison.test.ts` (not `declarations.test.ts`): extend it.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts:252-270` -- `readTarget` token branch: build `methods` from `contractMethods`, `DeclaringClass` per entry (`type` = the parent token, or `null` for a built-in); add `TargetType.builtins: ReadonlySet<string>` (lower-cased built-in names). `:464-474` `testDouble` -- after the doubled methods, define `[Symbol.iterator]` for built-in `getIterator`, `toString` and `[Symbol.toPrimitive]` for built-in `__toString` (non-enumerable, configurable, as doubled methods). Header `:13-22` says "Only brands are added": rewrite.
- `packages/assert/src/Framework/MockObject/Runtime/AbstractInvocationImplementation.ts:45-58` -- `method(string)`: `toString` resolves to a configurable `__toString` whose declaring class is `Stringable` when no `toString` is configurable.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:153-170` -- `of` token branch: `#tokenMethods` from `contractMethods` (validation moves there); keep `declaringName` per method so `declaringClassName(method)` returns the parent/built-in interface for a token; add `builtins(): ReadonlySet<string>`. Header `:13-20`: rewrite "Only brands are added".
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts:124-137` -- `#build`: per target, wire `[Symbol.iterator]` / `toString` / `[Symbol.toPrimitive]` through `defineContractProtocols` (imported from `@xaravel/assert`) when its built-ins hold `getiterator` / `__tostring` (`__toString` is in `DOUBLEABLE_MAGIC_METHODS`, so its interceptor exists). Header: say that `count` and `offset*` built-ins get no JS protocol (only methods).
- `packages/mockery/src/JMac/Testing/Double.ts:260` -- `registerExpectation`: `toString` → `__toString` when a target has the built-in `__toString` and no target that lists methods declares `toString`. "Declares `toString`" here and in ClassGenerator's `wireToString` skips a bare-symbol target (`acceptsAnyMethod()`), which declares every name (review loop 1: an intersection of a bare symbol and a Stringable token must still wire and alias). Name matching stays exact-case, as JMac's `declares` is.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts` -- `testDouble` calls `defineContractProtocols` too; header says `count`/`offset*` built-ins get no JS protocol. Keep the source lines within the file's existing wrap width (DoubleTarget.ts header too).
- `packages/mockery/src/JMac/Testing/Engine/SafeDefaultResolver.ts:139` -- reads `declaringClassName`; unchanged, now gets the parent's FQCN.
- Tests: `packages/assert/tests/xaravel/parent-brands.test.ts:67-69`, `packages/mockery/tests/xaravel/parent-brands.test.ts:68-70,92-101` pin the old own-list rule; next free ids `XT-assert-23`, `XT-mockery-14` (XT-conformance-128: unique, `xaravelTest` only). Stand-in token pattern as in those files.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts` -- add `contractMethods`, share the walk -- one implementation for both packages.
- `packages/assert/src/index.ts`, `packages/assert/tests/xaravel/comparison.test.ts` (XT-assert-3 export list) -- export `contractMethods` and `defineContractProtocols`.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts` -- read inherited and built-in methods; wire the iterator and string protocols; header.
- `packages/assert/src/Framework/MockObject/Runtime/AbstractInvocationImplementation.ts` -- the `toString` alias.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts`, `ClassGenerator.ts`, `packages/mockery/src/JMac/Testing/Double.ts` -- same for JMac Double.
- `packages/assert/tests/xaravel/parent-brands.test.ts`, `packages/mockery/tests/xaravel/parent-brands.test.ts` -- the own-list lines follow ESC-10.2-4 (expected values and descriptions only).
- `packages/assert/tests/xaravel/inherited-methods.test.ts` (`XT-assert-23`) and `packages/mockery/tests/xaravel/inherited-methods.test.ts` (`XT-mockery-14`) -- every matrix row, for `createMock` and `createStub` / `Double.for`. Also (review loop 1): a child that lists `getIterator` as a plain method while its parent lists it as a built-in is iterable, and its `getIterator` is declared by the child; in XT-assert-23, a signature lookup that returns a row for an inherited method (`Xt\Parent::parent` returning `self`) makes an unconfigured mock return a double that is `instanceof` Parent and not Child; in XT-mockery-14, an intersection of a Countable-style token and a Stringable-style token wires only the string protocol, and an intersection of a bare symbol with a Stringable token still aliases `toString` and wires `toString()`.

**Acceptance Criteria:**
- Given the baseline, when XT-assert-23 and XT-mockery-14 run, then the inherited and built-in rows fail; after the change every row passes.
- Given the change, when the full `bun run harness` runs, then it reports no differences; `bun run harness --xaravel`, `bun run typecheck` and `bun run lint` pass.

## Spec Change Log

- 2026-10-23, loop-1 implementation: XT-assert-3's export list also gains `defineContractProtocols` (the Code Map exports it from the index). Fidelity reviewer 1 rejected one tree on F-7: XT-mockery-14 claimed the iterator protocol for intersections without testing it; an intersection of a Countable-style and an IteratorAggregate-style token was added (iterates through `getIterator`, one recorded call, no string protocol). No behaviour change.
- 2026-10-23, implementation: XT-assert-3's pinned export list is in `packages/assert/tests/xaravel/comparison.test.ts`, not `declarations.test.ts` as the Code Map and Execution list say; the export list was extended there (`contractMethods`). No behaviour change.

### 2026-10-23 — Review loop 1: one protocol implementation, built-in status as a union
- Trigger: review pass 1, two `bad_spec` entries. (a) The iterate-or-throw rule, its PHP message and the protocol wiring were copied into `Generator.ts` and `ClassGenerator.ts` (Epic 4 lesson: one implementation). (b) First-wins dropped built-in status when a token lists a built-in as a plain method too (Laravel's `Enumerable` redeclares `getIterator`), so such a double was not iterable. Folded in: the verification-gap test for an inherited method with a signature row, the bare-symbol intersection fix, the intersection test, and the header notes.
- Amended: Code Map (`ContractParents.ts` built-in union and `defineContractProtocols`; index export; ClassGenerator, Double.ts and Generator.ts bullets), Execution (the XT-assert-3 file; the extra test rows). `<intent-contract>` unchanged.
- Known-bad state avoided: two copies of one PHP message drifting apart; a double of a child that redeclares a built-in losing JS iteration.
- KEEP (attempt 1 is saved at `_bmad-output/implementation-artifacts/retro-10-double-inherited-methods-attempt-1.patch`; reuse it freely, then delete that file before finishing): `contractMethods` and the shared `parentsClosure` walk with its messages; `TargetType.builtins`; the `DeclaringClass` per entry; the assert `toString` alias through `Stringable`/`type === null`; `DoubleTarget`'s `#declaringNames` and `builtins()`; the two `parent-brands` test changes; XT-assert-23 and XT-mockery-14 and every row they already cover; the XT-assert-3 export-list edit. Both Fidelity reviewers passed attempt 1 (tree e23a5bc).

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 14, false 9, maybe-false 0
- findings:
  - `[medium]` `[bad_spec]` (blind) a built-in redeclared as a plain method (Laravel `Enumerable::getIterator`) loses built-in status under first-wins, so the double is not iterable — Code Map now makes built-in status the union over the closure.
  - `[medium]` `[defer]` (blind) built-ins add no PHP interface brands (`Symbol.for('Countable')`, `ArrayAccess`, …), so the grader's `isCountable`/`phpCount` reject such a double — doubles never carried built-in brands (pre-existing); ESC-10.2-4 rules on methods only. Deferred.
  - `[low]` `[defer]` (blind) an unconfigured `__toString` (or `count`) returns `null`, so `String(double)` is `"null"` where PHPUnit gives `""` — the no-row `null` default is DIV-6.4's pre-existing rule; built-in interfaces have no surface rows. Deferred.
  - `[low]` `[reject]` (blind) `getIterator` accepts a JS array and iterates `null` as nothing — both are the spec matrix's rows; `null` is DIV-6.4's no-row default; Upstream tests return Traversables, which Xaravel maps to `[Symbol.iterator]` (PORTING).
  - `[medium]` `[bad_spec]` (blind) `iteratorOf` and the protocol wiring are duplicated in assert and mockery — Code Map now puts `defineContractProtocols` in `ContractParents.ts`, exported once.
  - `[low]` `[reject]` (blind) Mockery's case handling (`__tostring` spelling, exact `toString` alias, case-keyed `#declaringNames`) — `contract()` emits the PHP spelling the ruling lists; JMac's `declares` is exact-case throughout; the fix adds branches for hand-built tokens only.
  - `[low]` `[reject]` (blind) `[Symbol.toPrimitive]` ignores its hint — ESC-10.2-4's clarification says toPrimitive returns what `__toString` returns; the grader's exporter does not coerce doubles.
  - `[low]` `[reject]` (blind) the alias covers only string names, and assert finds the built-in by a `Stringable` sentinel — Upstream configures by string; plumbing `builtins` into the handler adds surface for no observed case.
  - `[false]` `[reject]` (blind) the parents closure is walked twice, contradicting "Mockery reads a token's parents once" — that comment is about DoubleTarget's per-token cache, still true; `contract()` tokens are frozen, so a second read sees the same list.
  - `[low]` `[bad_spec]` (blind) no intersection-with-built-ins test; headers do not say `count`/`offset*` get no JS protocol; a DoubleTarget header line overruns — folded into the loop-1 Code Map and Execution.
  - `[low]` `[reject]` (edge) a built-in spelled `__tostring` gets no interceptor in Mockery — same as the Mockery case row.
  - `[low]` `[reject]` (edge) `expects('ToString')` is not aliased in Mockery — same as the Mockery case row.
  - `[low]` `[bad_spec]` (edge) an intersection of a bare symbol and a Stringable token neither aliases nor wires `toString` (the bare symbol "declares" every name) — Code Map: skip `acceptsAnyMethod()` targets.
  - `[low]` `[reject]` (edge) a Constraint matching `toString` is not aliased — same as the alias row.
  - `[low]` `[reject]` (edge) a non-string `__toString` return is not PHP's TypeError (assert) — returns are not type-checked (Story 9.11 decision); a test configuring a non-string is the test's bug.
  - `[low]` `[reject]` (edge) the same for Mockery — as above.
  - `[false]` `[reject]` (edge) a PHP-style Iterator (`current`/`next`) without `[Symbol.iterator]` is rejected — PORTING maps PHP's Traversables to `[Symbol.iterator]`; no Xaravel Iterator lacks it.
  - `[false]` `[reject]` (edge) the same for Mockery — as above.
  - `[false]` `[reject]` (edge) a built-in's `type: null` in ReturnValueGenerator's `known` map — no `conformance/api-surface` row exists for `Countable`, `ArrayAccess`, `IteratorAggregate` or `Stringable`, so the `row === null` branch runs and `known` is never built.
  - `[low]` `[reject]` (edge, claim) the spec names `declarations.test.ts` for XT-assert-3 — the fix edits this spec (done in loop 1's Code Map).
  - `[low]` `[reject]` (edge, claim) Mockery's alias is exact-case and misses bare-symbol intersections — the case half as the Mockery case row; the intersection half is the bad_spec row above.
  - `[medium]` `[bad_spec]` (verification-gap) no test returns a signature row for an inherited method, so a wrong declaring `type` would pass — Execution now adds the `Xt\Parent::parent` returning `self` case.
  - `[false]` `[reject]` (verification-gap other) the two aliases differ in case rule — each follows its package's existing rule (PHPUnit's `MethodName` is case-insensitive, JMac's `declares` exact).
  - `[false]` `[reject]` (intent) real `@xaravel/contracts` tokens are not doubled in tests — AD-2 forbids the grader importing contracts; the `builtins` producer is Story 10.2's half (ESC-10.2-4 § The route).
  - `[false]` `[reject]` (intent) `Mockery.mock(...)->shouldReceive` is not covered — the action names `DoubleTarget`; `Mockery.mock` takes bare symbols, which carry no lists.
  - `[false]` `[reject]` (intent) XT-assert-22 / XT-mockery-13 expected values changed — ESC-10.2-4 supersedes ESC-10.1-6's "only brands" line; Fidelity F-2 passed.
  - `[false]` `[reject]` (intent) behaviour beyond the decision text (dedup, null iterates nothing, the TypeError text) — each is a row of this spec's matrix and is tested.
  - Fidelity Review: both reviewers `pass` at tree e23a5bc07f956355fc6bd2c4c36014c9c7da8372 (no findings).

### 2026-10-23 — Review pass (loop 1)
- verdicts: 25 findings — high 0, medium 5, low 14, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) PHPUnit's `toString` alias misses a `__toString` a child redeclares while a parent lists it as a built-in (union rule), though `toString()` is wired; Mockery aliases it — the alias now reads an internal built-in mark set by `readTarget` (not the `Stringable` sentinel); no index export added.
  - `[low]` `[reject]` (blind) the alias is implemented twice with different case rules — each follows its package's existing name rule (PHPUnit's `MethodName` case-insensitive, JMac's `declares` exact); after the patch both read the same union flag.
  - carried `[false]` `[reject]` (blind) the parents closure is walked twice — as pass 1: the "once" comment is DoubleTarget's per-token cache; `contract()` tokens are frozen.
  - carried `[low]` `[reject]` (blind) `getIterator` accepts arrays and iterates `null` as nothing — as pass 1 (matrix rows; DIV-6.4 no-row default).
  - carried `[low]` `[reject]` (blind) `[Symbol.toPrimitive]` ignores the hint and does not type-check `__toString`'s return — as pass 1 (the clarification's wording; returns are not type-checked, Story 9.11).
  - `[low]` `[patch]` (blind) the `ContractMethod.builtin` doc comment is stale after the union rule — reworded.
  - `[low]` `[reject]` (blind) a parent's invalid `methods` value is untested — the same `namesAt` branch is tested for the target's methods and a parent's built-ins.
  - `[low]` `[reject]` (blind) closure-shape method rows (bare-symbol parent, diamond, cycle, a built-in listed twice) are missing — the shared `parentsClosure` walk is pinned by XT-assert-22/XT-mockery-13's diamond, cycle and symbol rows; the dedup branch is pinned by the "Once" row.
  - `[low]` `[reject]` (blind) the unconfigured-iterator row runs only for the stub — a mock's unconfigured call takes the same `doubledMethod` path; the row's value is DIV-6.4's `null`.
  - `[low]` `[reject]` (blind) Mockery has no failure-path test for the alias — the alias rewrites the name before `MethodExpectation` is built, and the call-count rows show the recorded name is `__toString`.
  - carried `[low]` `[reject]` (blind) `#declaringNames` is exact-case — as pass 1 (JMac exact-case rule).
  - `[low]` `[reject]` (blind) `stringOf` and repeated `doubledName` scans could be simpler — cosmetic; lists of at most a few names.
  - `[medium]` `[patch]` (edge) same as the first row — same patch.
  - carried `[low]` `[reject]` (edge) a built-in spelled `__tostring` gets no interceptor — as pass 1.
  - carried `[low]` `[reject]` (edge) non-string `__toString` return — as pass 1.
  - carried `[low]` `[reject]` (edge) `allows('TOSTRING')` is not aliased — as pass 1.
  - `[false]` `[reject]` (edge) a non-deterministic parents getter could make methods and brands disagree — `contract()` freezes a token and its parents; a getter that changes between reads is not a token.
  - `[medium]` `[patch]` (edge, claim) the alias misses a redeclared built-in `__toString` — same patch as the first row.
  - `[medium]` `[patch]` (verification-gap) no row redeclares `__toString` — rows added to XT-assert-23 and XT-mockery-14.
  - `[medium]` `[patch]` (verification-gap other) the alias's `Stringable` sentinel defect — same patch as the first row.
  - carried `[false]` `[reject]` (intent) `Mockery.mock(...)->shouldReceive` untouched — as pass 1.
  - carried `[false]` `[reject]` (intent) real contract tokens not exercised — as pass 1 (AD-2; Story 10.2's half).
  - carried `[false]` `[reject]` (intent) three expected values changed — as pass 1 (ESC-10.2-4 supersedes; F-2 pass; the export list grows).
  - carried `[false]` `[reject]` (intent) semantics beyond the action text — as pass 1 (spec matrix and loop-1 amendments).
  - `[low]` `[reject]` (intent) no `MockBuilder` path and no unconfigured-iterator mock row — `getMockBuilder` reads targets through the same `readTarget`; the iterator row as above.
  - Fidelity Review: `current`, both `pass` at tree 2b442598298c90aa41b06d2c5e28dcbc86f1ffa8 (run by the implementer after one F-7 reject it fixed); re-run at Finalize on the patched tree.

## Verification

**Commands:**
- `bun test packages/assert/tests/xaravel packages/mockery/tests/xaravel` -- all pass
- `bun run harness` -- `SUMMARY` with no differences
- `bun run harness --xaravel` -- 0 failed
- `bun run typecheck` and `bun run lint` -- clean
- `bun run fidelity:review review --item epic-10-item-5-double-inherited-methods --spec _bmad-output/implementation-artifacts/spec-retro-10-double-inherited-methods.md`, then `status` -- `current`

## Auto Run Result

Status: done

**Summary.** A PHPUnit double (`createMock`/`createStub`) and a JMac Double (`Double.for`) of a contract token now take the token's own methods, its built-ins (`Symbol.for('xaravel.contract.builtins')`, PHP names) and every parent's methods and built-ins, each name once. Inherited methods are declared by the parent token that lists them, built-ins by their PHP interface, so signature rows are looked up there. A built-in `getIterator` drives `[Symbol.iterator]`, a built-in `__toString` drives `toString()` and `[Symbol.toPrimitive]`, and configuring `toString` configures `__toString`. Built-in status is the union over the parents closure (a redeclared built-in stays one). The walk, the method list and the JS protocols are one implementation in `@xaravel/assert`, which Mockery imports.

**Files changed.**
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts` -- shared `parentsClosure`, `contractMethods` (union built-in status), `defineContractProtocols`.
- `packages/assert/src/index.ts` -- exports `contractMethods`, `defineContractProtocols` and their types.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts` -- `readTarget` reads inherited and built-in methods and marks built-ins; `testDouble` wires the protocols.
- `packages/assert/src/Framework/MockObject/ConfigurableMethod.ts` -- internal `markBuiltin`/`isBuiltin` (module WeakSet, not exported from the index).
- `packages/assert/src/Framework/MockObject/Runtime/AbstractInvocationImplementation.ts` -- the `toString` → built-in `__toString` alias.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts` -- methods from `contractMethods`; per-method declaring class; `builtins()`.
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts` -- wires the protocols through `defineContractProtocols`.
- `packages/mockery/src/JMac/Testing/Double.ts` -- the `toString` alias in `registerExpectation`.
- Tests: new XT-assert-23 and XT-mockery-14 (`inherited-methods.test.ts` in each package); XT-assert-22 and XT-mockery-13 own-list expected values follow ESC-10.2-4; XT-assert-3's export list (`comparison.test.ts`) grows.

**Review.** Pass 1: 27 findings; 4 bad_spec/folded (redeclared built-in, duplicated protocol code, signature-row test, bare-symbol intersection) drove loop 1; 2 deferred (built-in interface brands; DIV-6.4 null default for unconfigured built-ins); the rest rejected with reasons in the triage log. Pass 2 (loop 1): 25 findings; patched the PHPUnit alias for a redeclared `__toString` (medium, one root cause, with its test rows) and a stale doc comment (low); the rest rejected or carried. Fidelity Review: pass/pass at tree e23a5bc (attempt 1), 2b44259 (loop 1, after one F-7 reject the implementer fixed) and 07f6f15 (final); `status` prints `current`.

**Follow-up review recommended:** false (this pass patched one medium entry and one low; no high).

**Verification.** `bun run typecheck` clean; `bun run lint` ok (679 files); `bun run harness --xaravel` 350 tests, 345 passed, 0 failed, 5 skipped; `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (the 7 not-run Variants need MySQL, MariaDB, Postgres, SQL Server, Redis or Beanstalkd backends, absent locally). XT-assert-23 and XT-mockery-14 failed on the baseline sources and pass now.

**Residual risks.** The two deferred items above. No real `@xaravel/contracts` token carries `builtins` until Story 10.2's half lands, so the built-in half is exercised only with stand-in tokens (AD-2). `Mockery.mock` (bare symbols) is unchanged.

## Prior run: investigation (2026-10-23, blocked)

- **Where methods come from today.** PHPUnit's `readTarget` (`packages/assert/src/Framework/MockObject/Generator/Generator.ts:283`) and Mockery's `DoubleTarget.of` (`packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:711`) read only `token[Symbol.for('xaravel.contract.methods')]`. The parents closure is already walked for brands by `contractParentBrands` (`packages/assert/src/Framework/MockObject/Generator/ContractParents.ts`, ESC-10.1-6), so the parent-method half is a small extension of that walk.
- **String built-ins** (`count`, `offsetExists`, `offsetGet`, `offsetSet`, `offsetUnset`, `toString`) fit both doubles as they are: each is one more string-named method.
- **The `Symbol.iterator` built-in does not.** Both doubles key their methods by string only:
  - PHPUnit: `ConfigurableMethod` has a string name, `TargetType.methods` is a `Map<string, …>`, and `method()` matches a string (or a constraint on one), as PHPUnit's `MethodName` does.
  - Mockery: `Mock.ts` sends every symbol key to `Reflect.get` and never to a dispatcher ("Symbol keys always use Reflect.get"), and `shouldReceive` takes method names as strings.
  - AD-26 maps PHP's `IteratorAggregate::getIterator()` to `[Symbol.iterator]`, and a PHP test configures `method('getIterator')` or `shouldReceive('getIterator')`.

### Blocking condition: intent gap (answered by the ESC-10.2-4 clarification, reading 1)

The ruling says the doubles take each token's built-ins "each method once", and lists `Symbol.iterator` among them. It does not say how a test configures a symbol-keyed method, and these readings lead to different public behaviour in two Protected grader packages:

1. **PHP name (recommended).** The double defines `[Symbol.iterator]`. A test configures it as `getIterator`, as the Upstream test does (`method('getIterator')`, `shouldReceive('getIterator')`), and the Invocation or expectation is named `getIterator`. A configured return value that is a PHP `Traversable` (an object with `[Symbol.iterator]`) is iterated. An unconfigured call yields nothing.
2. **Symbol key.** `method()` and `shouldReceive()` also accept a symbol, and the double is configured with `Symbol.iterator`. That adds a form no Upstream API has, and a ported test would need an `adapted:` marker under some DIV clause.
3. **No symbol built-ins in doubles.** The doubles take only string built-ins. A double of `Support\ValidatedData` then cannot be iterated as a PHP mock of an `IteratorAggregate` can.

The 2026-10-22 amendment says any question that would need an Escalation for a Story makes the item wait for the Maintainer. An action item has no Story id, so it cannot raise one. Nothing is implemented in part: the parent-method and string built-in halves wait with this one, so the item lands as one reviewed change.

### Prior Auto Run Result

Status: blocked
Blocking condition: intent gap. The ruling's built-in list includes `Symbol.iterator`, but neither double can key or configure a symbol-named method, and the ruling does not choose between the readings above. The orchestrator set the item `in-progress` and added it to epic 10's `waiting_on_maintainer` in `retro-gates.yaml`. No code was changed.

## Fidelity Review

### Reviewer 1: pass at tree 92c6855b04d67e3d8a48ccb174a7b757194f5851

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-23T23:59:51.384Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Changed assertions retain exact comparisons. The inherited-method expectations follow ESC-10.2-4, and the export expectation adds contractMethods without loosening the freeze checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The touched test bodies check their declared isolation, freezing, parent-brand, inherited-method, deduplication and built-in protocol consequences. AD-15.9 matches the isolation and freezing checks; ESC-10.2-4 supports the inherited-method expectations. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes stay within the action item's assert and mockery components. Stand-in tokens are test fixtures; production code consumes the shared token protocol without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files and declaration inventories contain no asyncRoot tags. Their methods perform synchronous reflection, configuration and dispatch, with no IO root or callback requiring async derivation under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes, so there are no changed request inputs to compare with Upstream. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"92c6855b04d67e3d8a48ccb174a7b757194f5851","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T23:59:51.384Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Changed assertions retain exact comparisons. The inherited-method expectations follow ESC-10.2-4, and the export expectation adds contractMethods without loosening the freeze checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"The touched test bodies check their declared isolation, freezing, parent-brand, inherited-method, deduplication and built-in protocol consequences. AD-15.9 matches the isolation and freezing checks; ESC-10.2-4 supports the inherited-method expectations.","findings":[]},{"id":"F-8","result":"pass","note":"All changes stay within the action item's assert and mockery components. Stand-in tokens are test fixtures; production code consumes the shared token protocol without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files and declaration inventories contain no asyncRoot tags. Their methods perform synchronous reflection, configuration and dispatch, with no IO root or callback requiring async derivation under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes, so there are no changed request inputs to compare with Upstream.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 92c6855b04d67e3d8a48ccb174a7b757194f5851

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-23T23:59:51.384Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff changes no Ported Test. |
| F-2: No expected value is weakened | n/a | No Ported Test is touched. The edits to XT-assert-3, XT-assert-22 and XT-mockery-13 update Xaravel Test expectations to ESC-10.2-4's approved rule (parents' methods are doubled, 'contractMethods' is exported). They are not Upstream expected values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The change relies on no Oracle fixtures, and none is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the consequence strings of XT-assert-23 and XT-mockery-14 with their bodies. The bodies check inherited methods through the parents closure, each method once (case-insensitive, first wins), built-ins declared by their PHP interface, the getIterator, __toString and toString protocols, and bad-value errors. The XT-assert-22 and XT-mockery-13 bodies match their updated strings. The only citation is ESC-10.2-4, which the prompt carries and which matches. No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are confined to packages/assert and packages/mockery, the two components the action item lists. The shared walk lives in assert and mockery imports it. No other Component's behaviour is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the changed files, and the change adds no async or Promise-returning declarations. The new functions (contractMethods, defineBuiltinProtocols, iteratorOf and so on) are all synchronous. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"92c6855b04d67e3d8a48ccb174a7b757194f5851","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T23:59:51.384Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff changes no Ported Test.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is touched. The edits to XT-assert-3, XT-assert-22 and XT-mockery-13 update Xaravel Test expectations to ESC-10.2-4's approved rule (parents' methods are doubled, `contractMethods` is exported). They are not Upstream expected values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The change relies on no Oracle fixtures, and none is an error.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the consequence strings of XT-assert-23 and XT-mockery-14 with their bodies. The bodies check inherited methods through the parents closure, each method once (case-insensitive, first wins), built-ins declared by their PHP interface, the getIterator, __toString and toString protocols, and bad-value errors. The XT-assert-22 and XT-mockery-13 bodies match their updated strings. The only citation is ESC-10.2-4, which the prompt carries and which matches. No FR or AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are confined to packages/assert and packages/mockery, the two components the action item lists. The shared walk lives in assert and mockery imports it. No other Component's behaviour is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the changed files, and the change adds no async or Promise-returning declarations. The new functions (contractMethods, defineBuiltinProtocols, iteratorOf and so on) are all synchronous.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree e23a5bc07f956355fc6bd2c4c36014c9c7da8372

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:01:29.808Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test; no Upstream assertion mapping applies. |
| F-2: No expected value is weakened | pass | Changed expectations retain exact comparisons. Parent-method expectations implement ESC-10.2-4, and the export expectation adds contractMethods without loosening checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all five touched Xaravel Tests with their consequences. Their assertions cover export freezing and isolation, parent brands and inherited methods, method deduplication, built-ins, and iterator/string protocol configuration as declared. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes remain within the authorized assert and mockery components. Stand-in tokens exercise the recorded contract protocol without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce no async IO or async callback execution requiring one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e23a5bc07f956355fc6bd2c4c36014c9c7da8372","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:01:29.808Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test; no Upstream assertion mapping applies.","findings":[]},{"id":"F-2","result":"pass","note":"Changed expectations retain exact comparisons. Parent-method expectations implement ESC-10.2-4, and the export expectation adds contractMethods without loosening checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all five touched Xaravel Tests with their consequences. Their assertions cover export freezing and isolation, parent brands and inherited methods, method deduplication, built-ins, and iterator/string protocol configuration as declared.","findings":[]},{"id":"F-8","result":"pass","note":"All changes remain within the authorized assert and mockery components. Stand-in tokens exercise the recorded contract protocol without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce no async IO or async callback execution requiring one.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e23a5bc07f956355fc6bd2c4c36014c9c7da8372

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:01:29.808Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the diff adds or changes no portedTest. Only Xaravel Tests and grader source change, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The only expected values that change are in Xaravel Tests. XT-assert-22 and XT-mockery-13 change the inherited-method check from [true,false,false] to [true,true,true], and the intersection check from [true,true,false,false] to all true. Decision ESC-10.2-4 (option 1: doubles take every method of the parent chain) replaces ESC-10.1-6's interim rule that a double has only the token's own methods, and requires exactly this. The test is stricter, not looser. XT-assert-3's export list only gains contractMethods, an exact name the change adds. Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. The changed Xaravel Tests keep all their assertions: only expected values change, and XT-assert-23 and XT-mockery-14 are new. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker or an Expectations adapted field. Evidence (a) is empty. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | There are no assigned Oracle requests, and no error fixture is listed in evidence (c). |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-23 and XT-mockery-14 check everything their consequence strings claim. Inherited methods are on the prototype, are configurable, and are declared by their parent tokens (checked through the signature lookup). Each name is doubled once, compared case-insensitively. Built-ins are configurable by their PHP names and declared by Countable, ArrayAccess, IteratorAggregate or Stringable. getIterator drives [Symbol.iterator], including null, a generator, the TypeError for a bad value and one call per iteration. __toString drives toString, template literals and String(); toString aliases __toString unless the token doubles its own toString. A parent's built-in is wired; a method a token merely lists is not; a class target is not wired. Bad built-ins values throw. The new parts of XT-assert-22 and XT-mockery-13 check that the parents' methods are doubled. XT-assert-3 checks the frozen exports including contractMethods. No consequence string cites an FR-n.k or AD-n.k token except XT-assert-3's unchanged AD-15.9, which its body still checks (exports frozen, no graded import). |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is under packages/assert and packages/mockery, the item's two components. Mockery imports contractMethods from @​xaravel/assert, which is the grader-to-grader edge ESC-4.5-1 allows. The tests use stand-in tokens, not @​xaravel/contracts, as AD-2 and ESC-10.1-6 require. The change has no stub or hard-coded behaviour of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in the changed source files. Every new export or function is synchronous and returns no Promise: contractMethods, ContractMethod, builtins(), defineBuiltinProtocols, iteratorOf and #builtinToStringAlias. None does IO or accepts a callback that DIV-1 allows to be async, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e23a5bc07f956355fc6bd2c4c36014c9c7da8372","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:01:29.808Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the diff adds or changes no portedTest. Only Xaravel Tests and grader source change, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The only expected values that change are in Xaravel Tests. XT-assert-22 and XT-mockery-13 change the inherited-method check from [true,false,false] to [true,true,true], and the intersection check from [true,true,false,false] to all true. Decision ESC-10.2-4 (option 1: doubles take every method of the parent chain) replaces ESC-10.1-6's interim rule that a double has only the token's own methods, and requires exactly this. The test is stricter, not looser. XT-assert-3's export list only gains contractMethods, an exact name the change adds. Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. The changed Xaravel Tests keep all their assertions: only expected values change, and XT-assert-23 and XT-mockery-14 are new.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker or an Expectations adapted field. Evidence (a) is empty.","findings":[]},{"id":"F-6","result":"n/a","note":"There are no assigned Oracle requests, and no error fixture is listed in evidence (c).","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-23 and XT-mockery-14 check everything their consequence strings claim. Inherited methods are on the prototype, are configurable, and are declared by their parent tokens (checked through the signature lookup). Each name is doubled once, compared case-insensitively. Built-ins are configurable by their PHP names and declared by Countable, ArrayAccess, IteratorAggregate or Stringable. getIterator drives [Symbol.iterator], including null, a generator, the TypeError for a bad value and one call per iteration. __toString drives toString, template literals and String(); toString aliases __toString unless the token doubles its own toString. A parent's built-in is wired; a method a token merely lists is not; a class target is not wired. Bad built-ins values throw. The new parts of XT-assert-22 and XT-mockery-13 check that the parents' methods are doubled. XT-assert-3 checks the frozen exports including contractMethods. No consequence string cites an FR-n.k or AD-n.k token except XT-assert-3's unchanged AD-15.9, which its body still checks (exports frozen, no graded import).","findings":[]},{"id":"F-8","result":"pass","note":"Every change is under packages/assert and packages/mockery, the item's two components. Mockery imports contractMethods from @xaravel/assert, which is the grader-to-grader edge ESC-4.5-1 allows. The tests use stand-in tokens, not @xaravel/contracts, as AD-2 and ESC-10.1-6 require. The change has no stub or hard-coded behaviour of another component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in the changed source files. Every new export or function is synchronous and returns no Promise: contractMethods, ContractMethod, builtins(), defineBuiltinProtocols, iteratorOf and #builtinToStringAlias. None does IO or accepts a callback that DIV-1 allows to be async, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree e9fa1add4aa627c9caeded246b89f0aa7a1b5321

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:13:22.967Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests; there are no Upstream assertion counterparts to compare. |
| F-2: No expected value is weakened | pass | The changed assertions retain exact comparisons. Parent-method expectations change under ESC-10.2-4, and the export expectation adds the new exports without loosening its comparison. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared all five touched Xaravel Tests with their consequence strings. XT-mockery-14 claims both iterator and string protocols for intersections, but its intersection cases verify only the string protocol. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code stays within the action item's assert and mockery components. Shared token metadata handling and protocol wiring implement their doubles rather than another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous metadata walks and protocol wiring that require none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no setup or exprs inputs to compare. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/inherited-methods.test.ts`: Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"e9fa1add4aa627c9caeded246b89f0aa7a1b5321","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:13:22.967Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests; there are no Upstream assertion counterparts to compare.","findings":[]},{"id":"F-2","result":"pass","note":"The changed assertions retain exact comparisons. Parent-method expectations change under ESC-10.2-4, and the export expectation adds the new exports without loosening its comparison.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared all five touched Xaravel Tests with their consequence strings. XT-mockery-14 claims both iterator and string protocols for intersections, but its intersection cases verify only the string protocol.","findings":[{"path":"packages/mockery/tests/xaravel/inherited-methods.test.ts","detail":"Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections."}]},{"id":"F-8","result":"pass","note":"All changed code stays within the action item's assert and mockery components. Shared token metadata handling and protocol wiring implement their doubles rather than another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous metadata walks and protocol wiring that require none.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e9fa1add4aa627c9caeded246b89f0aa7a1b5321

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:13:22.967Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests and the diff changes none. |
| F-2: No expected value is weakened | pass | No Ported Test changes. Xaravel Tests XT-assert-22 and XT-mockery-13 flip "parent's methods not doubled" to "doubled". ESC-10.2-4 (approved) supersedes ESC-10.1-6's own-list rule, so the flip is authorised and not a weakening. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test, so there are no Upstream assertions to count. The XT assertions are added or flipped, none dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field is added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is relied on. The change adds no oracle requests and the evidence lists no error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the XT-assert-23 and XT-mockery-14 consequence strings with their bodies. The bodies check inherited methods, the parent as declaring class, once-only case-insensitive names, built-ins staying built-in, and the iterator and toString protocols. They also check the bad-input TypeErrors and, for mockery, the intersection and bare-symbol cases. The XT-22 and XT-13 strings match their updated assertions. No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are confined to packages/assert and packages/mockery, the item's components. The shared logic lives once in assert and mockery imports it. No other Component is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the touched files. All added functions (contractMethods, defineContractProtocols, the alias and registration changes) are sync and do no IO, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e9fa1add4aa627c9caeded246b89f0aa7a1b5321","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:13:22.967Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests and the diff changes none.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. Xaravel Tests XT-assert-22 and XT-mockery-13 flip \"parent's methods not doubled\" to \"doubled\". ESC-10.2-4 (approved) supersedes ESC-10.1-6's own-list rule, so the flip is authorised and not a weakening.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test, so there are no Upstream assertions to count. The XT assertions are added or flipped, none dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field is added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is relied on. The change adds no oracle requests and the evidence lists no error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the XT-assert-23 and XT-mockery-14 consequence strings with their bodies. The bodies check inherited methods, the parent as declaring class, once-only case-insensitive names, built-ins staying built-in, and the iterator and toString protocols. They also check the bad-input TypeErrors and, for mockery, the intersection and bare-symbol cases. The XT-22 and XT-13 strings match their updated assertions. No FR or AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are confined to packages/assert and packages/mockery, the item's components. The shared logic lives once in assert and mockery imports it. No other Component is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the touched files. All added functions (contractMethods, defineContractProtocols, the alias and registration changes) are sync and do no IO, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 2b442598298c90aa41b06d2c5e28dcbc86f1ffa8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:13:51.876Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | Changed expectations remain exact. Parent-method expectations follow ESC-10.2-4, and the export expectation includes the new shared helpers without weakening freeze checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all five touched Xaravel Tests with their consequences and cited rulings. Assertions cover inherited methods, declaring signatures, deduplication, built-in protocols, brands and frozen exports. The added Counted/Iterable intersection checks both iteration values and recorded getIterator calls. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the authorized assert and mockery components. Stand-in tokens exercise the recorded contract protocol without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source and declaration inventory with AD-6 and DIV-1. These synchronous method-discovery and protocol helpers introduce no IO or async callback execution requiring an asyncRoot tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/inherited-methods.test.ts`: Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections. **fixed**: XT-mockery-14 now creates a Counted/Iterable intersection, configures getIterator to return [3, 4], asserts those iteration results, and asserts callsFor('getIterator') equals [[]].

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"2b442598298c90aa41b06d2c5e28dcbc86f1ffa8","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:13:51.876Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Changed expectations remain exact. Parent-method expectations follow ESC-10.2-4, and the export expectation includes the new shared helpers without weakening freeze checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all five touched Xaravel Tests with their consequences and cited rulings. Assertions cover inherited methods, declaring signatures, deduplication, built-in protocols, brands and frozen exports. The added Counted/Iterable intersection checks both iteration values and recorded getIterator calls.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within the authorized assert and mockery components. Stand-in tokens exercise the recorded contract protocol without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source and declaration inventory with AD-6 and DIV-1. These synchronous method-discovery and protocol helpers introduce no IO or async callback execution requiring an asyncRoot tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/inherited-methods.test.ts","detail":"Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections.","fixed":true,"note":"XT-mockery-14 now creates a Counted/Iterable intersection, configures getIterator to return [3, 4], asserts those iteration results, and asserts callsFor('getIterator') equals [[]]."}]}
```

### Reviewer 2: pass at tree 2b442598298c90aa41b06d2c5e28dcbc86f1ffa8

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:13:51.876Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item assigns no Ported Tests and changes none. |
| F-2: No expected value is weakened | pass | No Ported Test is touched. XT-assert-22 and XT-mockery-13 flip the parents' methods from not doubled to doubled. ESC-10.2-4 approves that and supersedes the ESC-10.1-6 own-list rule. The change adds coverage and weakens no comparison. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker is added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is relied on, and no fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-23 and XT-mockery-14 check each part of their consequence strings: inherited methods, declaring class, first listing wins, built-ins by PHP name, a built-in staying one when redeclared, and the iterator and string protocols. XT-mockery-14 also covers intersections. Intersections with an IteratorAggregate-style token (Counted, Iterable) now configure getIterator, assert the iteration result [3,4] and assert the recorded getIterator calls. This fixes P-1. The edits to XT-assert-22 and XT-mockery-13 match their updated strings. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are confined to packages/assert and packages/mockery, the item's components. Mockery reuses assert's shared helpers and adds no stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the changed files. The added code is synchronous and does no IO. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/inherited-methods.test.ts`: Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections. **fixed**: packages/mockery/tests/xaravel/inherited-methods.test.ts now builds an intersection of Counted and Iterable. It configures getIterator, asserts iteration yields [3,4], asserts no toString or toPrimitive is wired, and asserts callsFor('getIterator') is [[]].

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"2b442598298c90aa41b06d2c5e28dcbc86f1ffa8","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:13:51.876Z","items":[{"id":"F-1","result":"n/a","note":"The item assigns no Ported Tests and changes none.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. XT-assert-22 and XT-mockery-13 flip the parents' methods from not doubled to doubled. ESC-10.2-4 approves that and supersedes the ESC-10.1-6 own-list rule. The change adds coverage and weakens no comparison.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker is added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is relied on, and no fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-23 and XT-mockery-14 check each part of their consequence strings: inherited methods, declaring class, first listing wins, built-ins by PHP name, a built-in staying one when redeclared, and the iterator and string protocols. XT-mockery-14 also covers intersections. Intersections with an IteratorAggregate-style token (Counted, Iterable) now configure getIterator, assert the iteration result [3,4] and assert the recorded getIterator calls. This fixes P-1. The edits to XT-assert-22 and XT-mockery-13 match their updated strings.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are confined to packages/assert and packages/mockery, the item's components. Mockery reuses assert's shared helpers and adds no stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the changed files. The added code is synchronous and does no IO.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/inherited-methods.test.ts","detail":"Add an intersection containing an IteratorAggregate-style token, configure getIterator, and assert iteration results and recorded getIterator calls. The current Counted/Text and Bare/Text intersections do not verify the claimed iterator protocol for intersections.","fixed":true,"note":"packages/mockery/tests/xaravel/inherited-methods.test.ts now builds an intersection of Counted and Iterable. It configures getIterator, asserts iteration yields [3,4], asserts no toString or toPrimitive is wired, and asserts callsFor('getIterator') is [[]]."}]}
```

### Reviewer 1: pass at tree 07f6f15d850b2f740c99e4a4879e2378307682c1

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:31:36.790Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test; there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | Compared changed expectations with their prior values and ESC-10.2-4. Parent-method checks remain exact and adopt the approved inherited-method behavior; the exact export list includes the new shared helpers. No comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all five touched Xaravel Tests with their consequence strings. Their bodies check isolation and freezing, inherited brands and methods, declaring-class lookup, deduplication, built-in preservation, and iterator/string protocols, including Mockery intersections. AD-15.9 is the relevant cited bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and behavior with the action item's assert/mockery scope and ESC-10.2-4. The shared token traversal and double protocols implement those components' behavior; stand-in tokens are confined to tests. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files, declaration inventories, and absence of tags with AD-6 and DIV-1. The touched implementations and new exports are synchronous and introduce no IO root or callback requiring asynchronous derivation. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"07f6f15d850b2f740c99e4a4879e2378307682c1","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:31:36.790Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test; there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations with their prior values and ESC-10.2-4. Parent-method checks remain exact and adopt the approved inherited-method behavior; the exact export list includes the new shared helpers. No comparison is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all five touched Xaravel Tests with their consequence strings. Their bodies check isolation and freezing, inherited brands and methods, declaring-class lookup, deduplication, built-in preservation, and iterator/string protocols, including Mockery intersections. AD-15.9 is the relevant cited bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and behavior with the action item's assert/mockery scope and ESC-10.2-4. The shared token traversal and double protocols implement those components' behavior; stand-in tokens are confined to tests.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files, declaration inventories, and absence of tags with AD-6 and DIV-1. The touched implementations and new exports are synchronous and introduce no IO root or callback requiring asynchronous derivation.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 07f6f15d850b2f740c99e4a4879e2378307682c1

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4a9b4ef51b50bf3b207d033d83835af3998f6896`, on 2026-10-24T00:31:36.790Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | The action item assigns no Ported Test IDs and the diff adds or changes no portedTest; only Xaravel Tests change. There is no Upstream assertion to match. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The changed Xaravel Test expectations in packages/assert/tests/xaravel/parent-brands.test.ts and packages/mockery/tests/xaravel/parent-brands.test.ts go from [true,false,false] to [true,true,true] (inherited methods now doubled). Those values are stricter, not weaker, and are what decisions/ESC-10.2-4.md requires. XT-assert-3's exact export list only gains contractMethods and defineContractProtocols. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is added or changed, so no Upstream assertion is dropped. The changed Xaravel Tests keep their assertions; their expected values are updated per ESC-10.2-4. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip by this change. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the item relies on no Oracle fixture, and no fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-23: the body checks every claim in its consequence string. Parents' methods are doubled. They are declared by the parent (the lookup records Xt\Root::root etc.) and typed by the parent (a 'self' row returns a Parent double, not a Child one). Each method appears once, case-insensitively. Built-ins are declared by Countable/ArrayAccess/IteratorAggregate/Stringable, and a redeclared built-in stays one. getIterator drives iteration (null, non-iterable TypeError) and __toString drives toString/toPrimitive with the toString alias. XT-mockery-14 covers the same claims and adds intersections (Counted&Text, Counted&Iterable, bare symbol&Text), as its string says. XT-assert-22 and XT-mockery-13 have new consequence strings that say parents' methods are doubled, and their bodies assert that. XT-assert-3's consequence (AD-15.9, frozen exports) is still checked over the updated export list. No FR/AD bullet tokens are cited wrongly. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/assert and packages/mockery, the two components the item lists. Mockery imports defineContractProtocols/contractMethods from @​xaravel/assert, a grader-to-grader edge ESC-4.5-1 item 7 allows. Tests use stand-in tokens rather than stubbing @​xaravel/contracts (AD-2). No fake of another component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed source file. The new exports (contractMethods, defineContractProtocols, markBuiltin, isBuiltin, builtins(), defineBuiltinProtocols) are all synchronous, do no IO and take no async callback, so they need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"07f6f15d850b2f740c99e4a4879e2378307682c1","base":"4a9b4ef51b50bf3b207d033d83835af3998f6896","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T00:31:36.790Z","items":[{"id":"F-1","result":"pass","note":"The action item assigns no Ported Test IDs and the diff adds or changes no portedTest; only Xaravel Tests change. There is no Upstream assertion to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The changed Xaravel Test expectations in packages/assert/tests/xaravel/parent-brands.test.ts and packages/mockery/tests/xaravel/parent-brands.test.ts go from [true,false,false] to [true,true,true] (inherited methods now doubled). Those values are stricter, not weaker, and are what decisions/ESC-10.2-4.md requires. XT-assert-3's exact export list only gains contractMethods and defineContractProtocols.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is added or changed, so no Upstream assertion is dropped. The changed Xaravel Tests keep their assertions; their expected values are updated per ESC-10.2-4.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip by this change.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the item relies on no Oracle fixture, and no fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-23: the body checks every claim in its consequence string. Parents' methods are doubled. They are declared by the parent (the lookup records Xt\\Root::root etc.) and typed by the parent (a `self` row returns a Parent double, not a Child one). Each method appears once, case-insensitively. Built-ins are declared by Countable/ArrayAccess/IteratorAggregate/Stringable, and a redeclared built-in stays one. getIterator drives iteration (null, non-iterable TypeError) and __toString drives toString/toPrimitive with the toString alias. XT-mockery-14 covers the same claims and adds intersections (Counted&Text, Counted&Iterable, bare symbol&Text), as its string says. XT-assert-22 and XT-mockery-13 have new consequence strings that say parents' methods are doubled, and their bodies assert that. XT-assert-3's consequence (AD-15.9, frozen exports) is still checked over the updated export list. No FR/AD bullet tokens are cited wrongly.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/assert and packages/mockery, the two components the item lists. Mockery imports defineContractProtocols/contractMethods from @xaravel/assert, a grader-to-grader edge ESC-4.5-1 item 7 allows. Tests use stand-in tokens rather than stubbing @xaravel/contracts (AD-2). No fake of another component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed source file. The new exports (contractMethods, defineContractProtocols, markBuiltin, isBuiltin, builtins(), defineBuiltinProtocols) are all synchronous, do no IO and take no async callback, so they need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
