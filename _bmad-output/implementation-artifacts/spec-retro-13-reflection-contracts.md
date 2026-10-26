---
title: 'Contract token table, ReflectionEnum and class-string assertInstanceOf (epic-13-item-2-reflection-contracts)'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: '58285c41543fa28b1c4980a9580cde3029df8e7f'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-25-story-13-1-second.md'
  - '{project-root}/conformance/escalations/ESC-13.1-7.md'
  - '{project-root}/conformance/escalations/ESC-13.1-8.md'
  - '{project-root}/conformance/escalations/ESC-13.1-9.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test pins that the class-lookup fixtures restore Symbol.for('xaravel.class.lookup') on teardown, or that the affected Test IDs pass in both load orders.
    evidence: |-
      packages/mockery/tests/xaravel/scenarios.ts layers at module load and restores in a module-level afterAll; XT-runtime-48 and XT-contracts-21 would pass with a leftover delegating stand-in, and the harness runs one file order. Closing it needs a harness-level check under Protected conformance/**, outside this item's scope. Both orders were run by hand (112 pass each).
    location: >-
      packages/mockery/tests/xaravel/scenarios.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 13.1 is held on three gaps the Maintainer ruled on (ESC-13.1-7..9, option 1 each): a contract token's FQCN string resolves nowhere, so `interface_exists` and `new ReflectionClass('<token FQCN>')` cannot be ported; the runtime has no `ReflectionEnum` / `enum_exists` over AD-26's `static backingType`; and `@xaravel/assert`'s `assertInstanceOf` refuses every class-string, where PHPUnit accepts any existing class or interface name.

**Approach:** `@xaravel/runtime/registry` gains a token table filled by a new `registerContractToken(token)`, which `@xaravel/contracts`' `contract(...)` calls (the runtime may not import contracts, AD-2). `@xaravel/runtime/php` gains `interfaceExists(name)`, `enumExists(name)` and `ReflectionEnum` (`isBacked()`, `getBackingType()`), and `ReflectionClass` resolves a token FQCN through the table. The runtime publishes a name lookup on `globalThis[Symbol.for('xaravel.class.lookup')]`, which `@xaravel/assert` reads (the grader imports no runtime) so `assertInstanceOf` / `assertNotInstanceOf` accept a class-string. XT-runtime-48, XT-runtime-49, XT-contracts-21 and XT-assert-102 pin them.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, `packages/contracts/**`, `packages/assert/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT 2026-10-22 amendment; item scope per the 2026-10-25 amendment), plus, under the ruling's Amendment 2, only the class-lookup set-up in `packages/mockery/tests/**` (and `packages/assert/tests/**`).
- Class-lookup fixtures (Amendment 2): every test fixture that stubs `Symbol.for('xaravel.class.lookup')` (`packages/mockery/tests/xaravel/scenarios.ts`, `double-scenarios.ts`, `token-doubles.test.ts`; `packages/assert/tests/xaravel/typed-doubles.test.ts`, `token-doubles.test.ts`) layers its stand-in on whatever lookup is installed: it answers for its own test classes first and delegates every other name to the previous lookup (null when there was none), and restores the original property (or its absence) on teardown. The grader's tests thus never depend on the runtime's lookup. No assertion, expected value, test name or Test ID changes in those files; only the set-up and teardown of the global.
- PHP names camelCased as PORTING.md does for PHP functions (`is_numeric` → `isNumeric`): `interface_exists` → `interfaceExists`, `enum_exists` → `enumExists`. One public class per file (`src/php/ReflectionEnum.ts`, ending `registerClass('ReflectionEnum', ReflectionEnum)`). Messages are PHP 8.5's / PHPUnit 13.4.3's exactly. Everything sync; never return `undefined`.
- Keys case-insensitive with a leading `\` dropped, as the Registry's are. A lookup checks registered classes (test classes up the frame chain first, then the base) before tokens.
- The global follows `Symbol.for('xaravel.php.classes')`'s install rules except that, so a fixture can layer over it and restore it (Amendment 2), it is writable and configurable; it stays non-enumerable; throws `LogicException` when already defined with another value; skipped under `XARAVEL_NO_SCOPE_GLOBAL=1`; installed by each of the four package entries.
- New exports named in `packages/runtime/docs/` (XT-runtime-37), in `export { … } from` form. Docs that say a token's FQCN does not resolve, or list `ReflectionEnum` as not ported, are updated in place.

**Never:**
- Remove or weaken an existing assertion; change `conformance/**`, `tools/**`, `PORTING.md`, another package (beyond the class-lookup fixtures above), or the item's `action` / `owner` / `epic`.
- Register a token as a class (ESC-10.1-3: `resolveClass` and `fqcn` stay as they are), add entries to `Symbol.for('xaravel.php.classes')` (XT-runtime-35), or change `contract()`'s validation or token shape.
- Change `expectException` or `containsOnlyInstancesOf`'s handling of a string (not in the ruling); they keep throwing `UnknownClassOrInterfaceException` for a string.
- Autoload: `interfaceExists` / `enumExists` read only what is loaded, as `resolveClass` does (AD-10.4); there is no `$autoload` parameter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token recorded | `T = contract('XaravelFixture\\Tokens\\IB', {}, [IA])` | `interfaceExists('XaravelFixture\\Tokens\\IB')`, `'\\xaravelfixture\\tokens\\ib'` true; `new ReflectionClass('…\\IB').getName()` the FQCN, `isSubclassOf('…\\IA')` true; `new ReflectionClass(B).isSubclassOf('…\\IB')` = `hasBrand(B, IB)` | — |
| Not an interface | a registered class's FQCN; `'Nope'`; a stand-in token never passed to `registerContractToken` | `interfaceExists` false | `new ReflectionClass('Nope')` keeps `ReflectionException` `Class "Nope" does not exist` |
| Re-declaration | second token with a recorded FQCN (case-insensitive) | the first stays recorded; same token again is a no-op | — |
| Bad token | `registerContractToken(x)`, `x` not `isContractToken` | — | `TypeError` `registerContractToken(): the value is not a contract token` |
| Backed enum | registered class `S` with static `cases()`, `from`, `tryFrom`, `static backingType = 'string'` | `enumExists(fqcn)` true; `new ReflectionEnum(S)` / `(fqcn)` / `(case)`: `isBacked()` true, `getBackingType()` `ReflectionNamedType` `string`, builtin; `int` likewise | — |
| Pure enum | static `cases()`, no `backingType` | `isBacked()` false, `getBackingType()` null | — |
| Not an enum | registered class without `cases`; a token's FQCN; `'Nope'` | `enumExists` false | `new ReflectionEnum(x)`: `ReflectionException` `Class "<FQCN>" is not an enum`; missing: `Class "Nope" does not exist` |
| Bad backing type | `static backingType = 'float'` | `enumExists` true | `isBacked()` / `getBackingType()` throw `TypeError` naming AD-26's `'string'` or `'int'` |
| Class-string assert | `assertInstanceOf('<registered FQCN>', new X())`; `registerTestClass` FQCN; recorded token FQCN with a branded object | pass; failure text `is an instance of class <FQCN>` / `interface <FQCN>`, as for the class or token itself; `assertNotInstanceOf` mirrors | `'Nope'`, or no runtime loaded: `UnknownClassOrInterfaceException` as today |
| Non-string arg | `interfaceExists(5)`, `enumExists(null)` | — | PHP's `TypeError` `interface_exists(): Argument #1 ($interface) must be of type string, int given` / `enum_exists(): Argument #1 ($enum) …` |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts` -- Registry. `lookUp` (l.217) is test-frames-then-base; `isContractToken` (l.139), `tokenFqcn` (l.148), `normalise` (l.60). Add the token map, `registerContractToken`, and internal `resolveContractToken(name): object | null` and `lookUpName(name): RegisteredClass | object | null` here. File imports nothing from `php/` or `scope/` (load safety, header l.29-32).
- `packages/runtime/src/registry/index.ts` -- export `registerContractToken`.
- `packages/runtime/src/php/reflectionTargets.ts:28` -- `reflectionTarget`: on a `resolveClass` miss, try `resolveContractToken` before `ReflectionException`.
- `packages/runtime/src/php/ReflectionClass.ts:73` -- `isSubclassOf(string)` resolves through the same path. The constructor doc (l.37-41) says a token FQCN throws; update.
- `packages/runtime/src/php/ReflectionNamedType.ts` -- `new ReflectionNamedType('string', true)` for the backing type.
- `packages/runtime/src/php/phpClasses.ts` -- install pattern to copy (l.71-84) for the new `src/php/classLookup.ts`; import it in `src/index.ts`, `src/scope/index.ts`, `src/registry/index.ts`, `src/php/index.ts` right after `phpClasses`.
- `packages/runtime/src/php/phpType.ts` -- `phpTypeName` for the TypeError messages.
- `packages/runtime/src/php/index.ts` -- export `ReflectionEnum`, `interfaceExists`, `enumExists` (new `src/php/classExistence.ts` for the two functions).
- `packages/runtime/docs/reflection.md:59-61,124-126`, `docs/class-registry.md:41-46` -- doc updates.
- `packages/runtime/tests/xaravel/reflection.test.ts:483` -- XT-runtime-46 asserts a stand-in token's FQCN throws; stand-ins are not recorded, so it still holds; leave it. Next ids: XT-runtime-48, 49 (new file `tests/xaravel/token-table.test.ts`, `xaravelTest` form).
- `packages/contracts/src/Contract.ts:208-237` -- `contract()`; call `registerContractToken(frozen)` before returning. Imports from `@xaravel/runtime/registry` already (l.33). Doc header l.8-12 and `packages/contracts/docs/contracts.md:31-32` updated. Next id XT-contracts-21 (`tests/xaravel/contract.test.ts` style).
- `packages/assert/src/Framework/Constraints.ts:299` -- `classOrInterface`; add `resolveClassString(type)` used by `Assert.assertInstanceOf` / `assertNotInstanceOf` (`Assert.ts:199-211`), which widen `expected` to `ClassOrInterface | string`. `UnknownClassOrInterfaceException` unchanged. PHPUnit: vendored `conformance/tests/xaravel/php-fixtures/pest/vendor/phpunit/phpunit/src/Framework/Assert.php:1795-1830`. The grader reads the lookup's result only when it is a function or an `isContractToken` token (`MockObject/Generator/ContractParents.ts:59`), else treats the name as unknown. Next id XT-assert-102 (new `tests/xaravel/class-string.test.ts`). The grader's tests never import the runtime in-process (`tests/xaravel/runtime-values.test.ts:17-44`, XT-assert-3), and whether another file's import installed the global is order-dependent, so every XT-assert-102 row runs in a fresh `bun` subprocess: one that imports `packages/runtime/src/index.ts` and `packages/contracts/src/index.ts` (real lookup, real token), and one that imports only assert (no lookup).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts`, `registry/index.ts` -- token map, `registerContractToken`, `resolveContractToken`, `lookUpName` -- ESC-13.1-7.
- `packages/runtime/src/php/classExistence.ts`, `php/ReflectionEnum.ts`, `php/classLookup.ts`, `php/reflectionTargets.ts`, `php/ReflectionClass.ts`, the four entry indexes, `php/index.ts` -- `interfaceExists`, `enumExists`, `ReflectionEnum extends ReflectionClass`, the global, token FQCN resolution -- ESC-13.1-7, -8.
- `packages/contracts/src/Contract.ts` -- record each token -- ESC-13.1-7.
- `packages/assert/src/Framework/Constraints.ts`, `Assert.ts` -- class-string resolution -- ESC-13.1-9.
- Tests: `packages/runtime/tests/xaravel/token-table.test.ts` (XT-runtime-48 token table, `interfaceExists`, ReflectionClass by FQCN, the global's install rules in child processes; XT-runtime-49 `enumExists` / `ReflectionEnum`), `packages/contracts/tests/xaravel/` (XT-contracts-21: a real `contract()` token is recorded, first wins), `packages/assert/tests/xaravel/class-string.test.ts` (XT-assert-102) -- every matrix row.
- `packages/runtime/src/php/classLookup.ts` and XT-runtime-48 -- install the global writable and configurable (Amendment 2). The class-lookup fixtures in `packages/mockery/tests/xaravel/scenarios.ts`, `double-scenarios.ts`, `token-doubles.test.ts` and `packages/assert/tests/xaravel/typed-doubles.test.ts`, `token-doubles.test.ts` -- layer, delegate, restore (Amendment 2); fixes XT-mockery-4, -5, -7, -15, XT-assert-20, -100 under the full harness in either load order.
- Docs: `packages/runtime/docs/reflection.md`, `class-registry.md`, `packages/contracts/docs/contracts.md`, assert's `README.md` if it lists `assertInstanceof` arguments.

**Acceptance Criteria:**
- Given Story 13.1's `IA` / `IB` written as `contract(...)` tokens, when `Reflector::isParameterSubclassOf`'s PHP (`class_exists($n) || interface_exists($n)` then `new ReflectionClass($n)->isSubclassOf(...)`) is ported over `resolveClass` / `interfaceExists` / `ReflectionClass`, then it gives PHP's results with no other runtime change.
- Given a string-backed enum class per AD-26, when `isParameterBackedEnumWithStringBackingType` is ported line for line over `enumExists` / `ReflectionEnum`, then `getBackingType()->getName()` is `'string'`.
- Given `bun run harness`, `bun run typecheck`, `bun run lint`, then all pass with no differences, and every existing assertion is unchanged.

## Spec Change Log

- 2026-10-25 (resume after `decisions/MAINT-2026-10-25-story-13-1-second.md` Amendment 2): the blocking condition below is ruled. The intent contract now lets the item change the class-lookup set-up in `packages/mockery/tests/**` and `packages/assert/tests/**` (layer on the installed lookup, delegate, restore on teardown), and the runtime installs the global writable and configurable so it can be layered. XT-runtime-48's description and assertion of the property's descriptor follow that change (the item's own new test, not an existing assertion). Known bad state avoided: tests that redefine a non-configurable global, and stand-ins installed only when no lookup exists.

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 20, false 8, maybe-false 0
- findings:
  - `[low]` `[defer]` (blind-hunter) the load-order claim "in either load order" is unpinned: `scenarios.ts` layers at module load, so a runtime first loaded later in the same process would throw `LogicException` — grouped with verification-gap V1 below as one root cause (fixture restore unpinned); no in-repo importer loads the runtime in-process after `scenarios.ts`, so no patch beyond the defer
  - `[false]` `[reject]` (blind-hunter) `afterAll` at module level in a shared cached helper leaves later importers without the twins — only `mockery.test.ts` imports `scenarios.ts` in-process (directly, via `cells.ts` and `double-scenarios.ts`); child processes load it fresh
  - `[low]` `[reject]` (blind-hunter) spec lists `double-scenarios.ts` as changed but the diff does not touch it — it already layered, delegated and restored (`installDoubleLookups`); the fix would edit this build's spec
  - `[low]` `[reject]` (blind-hunter) a `typed-doubles.test.ts` row deletes the lookup instead of layering — the row's assertion is about an absent lookup, it is pre-existing and `withGlobals` restores it afterwards
  - `[false]` `[reject]` (blind-hunter) the writable global weakens the guard — writable and configurable is what Amendment 2 and the intent contract require
  - `[low]` `[reject]` (blind-hunter) tokens are process-wide, first wins — the intent's Re-declaration row and Design Notes choose this; a shipped token is imported statically before any test twin
  - `[false]` `[reject]` (blind-hunter) the bad `backingType` `TypeError` text is invented — the matrix's Bad backing type row specifies a `TypeError` naming AD-26's values; PHP has no runtime case for it
  - `[low]` `[reject]` (blind-hunter) `interfaceExists` is false for PHP's built-in interfaces — those that Xaravel ports are `contract()` tokens (e.g. `packages/contracts/src/structural/Countable.ts`) and so are recorded; the rest have no Xaravel value to name
  - `[low]` `[reject]` (blind-hunter) `registerContractToken` silently skips an empty FQCN — `contract()` refuses an empty name, so only a hand-built stand-in can reach it
  - `[low]` `[reject]` (blind-hunter) a throwing lookup escapes `resolveClassString` raw — as PHP's `class_exists` propagates an autoloader's throw; only a broken fixture can trigger it
  - `[low]` `[reject]` (blind-hunter) XT-assert-102 gaps (`toContain` row, parent token via child brand, test-class shadowing) — the covered rows pin the matrix; these add coverage, not a fix
  - `[false]` `[reject]` (blind-hunter) a second copy of `registry.ts` splits the table silently — the install guard refuses a second copy's `lookUpName` with `LogicException` (XT-runtime-48)
  - `[low]` `[reject]` (blind-hunter) `child()` in `class-string.test.ts` requires empty stderr — the same helper shape as the other child-run XTs; no warning occurs today
  - `[low]` `[patch]` (blind-hunter) two doc paragraphs badly wrapped (`reflection.md` `isSubclassOf(t)` bullet, `class-registry.md` install rules) — reflowed
  - `[low]` `[defer]` (verification-gap V1) nothing checks that the mockery fixture restores the class-lookup global on teardown, or the affected IDs in both load orders — needs a harness-level check in Protected `conformance/**`; the implementer ran both orders manually (112 pass each)
  - `[low]` `[reject]` (verification-gap) runtime loading after the `scenarios.ts` stand-in throws — same root as the first row; no importer does this
  - `[low]` `[reject]` (verification-gap) spec's `double-scenarios.ts` listing — duplicate of the blind-hunter row; spec edit
  - `[low]` `[reject]` (verification-gap) the `layered(...)` wrappers in XT-assert-20 run inside a `withGlobals` that already deleted the lookup, so they add nothing there — behaviour unchanged and correct; cosmetic
  - `[low]` `[reject]` (edge-case) test-made tokens are process-wide — duplicate of the blind-hunter row
  - `[low]` `[reject]` (edge-case) a later token with the same FQCN in another case keeps the first token — PHP refuses the redeclaration; the intent's Re-declaration row chooses first-wins
  - `[low]` `[reject]` (edge-case) a throwing lookup escapes — duplicate of the blind-hunter row
  - `[false]` `[reject]` (edge-case) `answers[name]` in the token-doubles stand-ins returns `Object.prototype` members for names like `constructor` — those tests only ask for their own `XtT\\` / `XtMT\\` names; `answers` was indexed the same way before this change
  - `[false]` `[reject]` (edge-case) `scenarios.ts` shared-module `afterAll` — duplicate of the blind-hunter row
  - `[low]` `[reject]` (edge-case) stand-in first, then runtime loads, throws — duplicate of the first row
  - `[low]` `[reject]` (edge-case) `new ReflectionEnum` on an unregistered non-enum class throws `fqcn()`'s error — `reflectionTarget` runs first and handles unregistered targets as `ReflectionClass` does; no reachable new failure shown
  - `[low]` `[reject]` (edge-case) spec claims `double-scenarios.ts` changed — duplicate; spec edit
  - `[false]` `[reject]` (intent-alignment) 13.1's unblocking is shown only through copied `Reflector` bodies — descriptive; the item may not touch Story 13.1's tests, which run when the Story resumes
  - `[false]` `[reject]` (intent-alignment) enum detection reads `cases()` only, narrower than AD-26's full shape — the intent's Design Notes define an enum this way
  - `[medium]` `[patch]` (fidelity reviewer 1, F-7) XT-assert-102's consequence names `expectException` but no row calls it — added a runtime-loaded row pinning `expectException`'s `UnknownClassOrInterfaceException` for a class-string
  - `[medium]` `[patch]` (fidelity reviewer 2, F-7) same as reviewer 1 — same patch

### 2026-10-25 — Review pass (Fidelity Review re-run on the patched tree 1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; reviewer 1 (codex/gpt-6.1-sol) and reviewer 2 (claude/claude-opus-5-5) pass, `status --item` prints `current`

## Design Notes

PHP refuses a second declaration of an interface name; `contract()` never has (Xaravel Tests build throwaway tokens under shared names, e.g. `X\\Y` four times), so the table keeps the first token and does not record a later one. A program PHP accepts never re-declares, so its behaviour is PHP's. An enum is a registered class whose static side has a `cases` function (AD-26); it is backed when it declares `backingType`.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts packages/assert` -- expected: pass
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run typecheck` and `bun run lint` -- expected: exit 0

## Auto Run Result

Status: done (resumed 2026-10-25 after Amendment 2; the first run's blocked record follows as history)

First run — Blocking condition (ruled by Amendment 2): the global lookup this spec installs, `Symbol.for('xaravel.class.lookup')`, is an existing grader protocol (ESC-4.6-1 item 9, ESC-4.8-1 item 1) that Protected tests in `packages/mockery` and `packages/assert` stub themselves. With the runtime installing it, `bun run harness` gives `differ=5`; fixing those tests needs a path outside the item's scope.

- Failing: XT-mockery-7, XT-mockery-15 (`packages/mockery/tests/xaravel/token-doubles.test.ts`, `double-scenarios.ts` redefine the non-configurable global); XT-mockery-4, XT-mockery-5 (`packages/mockery/tests/xaravel/scenarios.ts:159` installs its `XtFoo` stand-in only when no lookup exists, and the runtime's does not know those classes); XT-assert-20 (`packages/assert/tests/xaravel/typed-doubles.test.ts:78`) and XT-assert-100 (`packages/assert/tests/xaravel/token-doubles.test.ts:115`) import the runtime in a child process, then redefine the lookup. In the other load order the runtime's install throws `LogicException` (reproduced 2026-10-25).
- `packages/mockery/**` is not in the item's `action`, and `--stale-test` refuses Protected Paths (`decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`).
- Everything else is built and passes: typecheck, lint, `registration:check`, `async-surface --check runtime`, XT-runtime-37, -48, -49, XT-contracts-21 and XT-assert-102. No existing assertion changed. The implementation is saved on branch `planning/retro-13-reflection-contracts-impl`.
- Options: (1, recommended) the Maintainer lets the item change the tests that stub the lookup, in `packages/mockery/tests/**` and `packages/assert/tests/**`, so they wrap or stand aside for the runtime's lookup, which ESC-4.6-1 item 9 says the class registry installs; (2) the runtime installs the lookup writable and configurable, which alone leaves XT-mockery-4/5 failing; (3) the runtime publishes its lookup under a new symbol that only `classOrInterface` reads, which leaves two lookup protocols in the grader.

### Resumed run (2026-10-25)

- **Summary.** Amendment 2 of `decisions/MAINT-2026-10-25-story-13-1-second.md` ruled the blocking condition. The runtime installs `Symbol.for('xaravel.class.lookup')` writable and configurable (still non-enumerable, same `LogicException` guard and opt-out); the grader fixtures that stub it layer their stand-ins on the installed lookup, delegate every other name, and restore it. The rest of the item (token table, `interfaceExists` / `enumExists`, `ReflectionEnum`, `contract()` recording, class-string `assertInstanceOf`) was built in the first run and is unchanged.
- **Files changed in this run.**
  - `packages/runtime/src/php/classLookup.ts` -- the global is writable and configurable.
  - `packages/runtime/tests/xaravel/token-table.test.ts` -- XT-runtime-48 (this item's own test) expects the new descriptor.
  - `packages/runtime/docs/class-registry.md`, `docs/reflection.md` -- protocol wording; two paragraphs reflowed.
  - `packages/mockery/tests/xaravel/scenarios.ts` -- layers its twins over any installed lookup, restores in `afterAll`.
  - `packages/mockery/tests/xaravel/token-doubles.test.ts`, `packages/assert/tests/xaravel/token-doubles.test.ts`, `typed-doubles.test.ts` -- stand-ins delegate unknown names to the previous lookup. `double-scenarios.ts` already did and is unchanged.
  - `packages/assert/tests/xaravel/class-string.test.ts` -- XT-assert-102 gains an `expectException` row (Fidelity F-7).
- **Review.** 30 findings in the first pass: patched the F-7 `expectException` row (one entry, medium, both reviewers) and the doc reflow (low); deferred one (fixture restore unpinned, needs Protected `conformance/**`); rejected the rest with reasons in the triage log. Second pass: 0 findings. Patched counts: high 0, medium 1, low 1, so no follow-up review.
- **Verification.** `bun run typecheck` 0, `bun run lint` 0, `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (XARAVEL 391 tests, 0 failed) after the patches; both load orders of the mockery, assert, runtime and contracts XT dirs pass (112 each); Fidelity Review `current: 2 pass verdicts for tree 1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950`. No assertion, expected value or Test ID changed in the fixture files.
- **Residual risks.** A future in-process import of `@xaravel/runtime` inside `mockery.test.ts` after `scenarios.ts` loads would throw at load; nothing pins fixture restoration (deferred).

## Fidelity Review

### Reviewer 1: reject at tree 1138708dc9b0e43dfc8e64cd5b0e683bc2dc44b2

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `58285c41543fa28b1c4980a9580cde3029df8e7f`, on 2026-10-26T00:27:07.510Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the existing test assertions and expected values across the diff; fixture lookup setup changes preserve them. Class-string support follows ESC-13.1-9. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed; existing Xaravel Test assertions are retained. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle output.error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the touched Xaravel Test bodies with their consequence strings; XT-assert-102 leaves one declared behavior unchecked. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementation responsibilities with the action item's scope and both amendments. Runtime, contracts, assert, and grader fixture setup remain within the approved components; no other component implementation is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the supplied declarations and source with AD-6, DIV-1, and ESC-9.4-1. The retained Registry.resolveClassAsync tag covers its dynamic import; new lookup and reflection exports are synchronous and need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

- **F-7** `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"1138708dc9b0e43dfc8e64cd5b0e683bc2dc44b2","base":"58285c41543fa28b1c4980a9580cde3029df8e7f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:27:07.510Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the existing test assertions and expected values across the diff; fixture lookup setup changes preserve them. Class-string support follows ESC-13.1-9.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed; existing Xaravel Test assertions are retained.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle output.error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the touched Xaravel Test bodies with their consequence strings; XT-assert-102 leaves one declared behavior unchecked.","findings":[{"path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementation responsibilities with the action item's scope and both amendments. Runtime, contracts, assert, and grader fixture setup remain within the approved components; no other component implementation is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the supplied declarations and source with AD-6, DIV-1, and ESC-9.4-1. The retained Registry.resolveClassAsync tag covers its dynamic import; new lookup and reflection exports are synchronous and need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 1138708dc9b0e43dfc8e64cd5b0e683bc2dc44b2

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `58285c41543fa28b1c4980a9580cde3029df8e7f`, on 2026-10-26T00:27:07.510Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; every touched test is an Xaravel Test. |
| F-2: No expected value is weakened | pass | Compared each changed line in the touched existing Xaravel Tests (XT-assert-20, XT-assert-100, XT-mockery-15, and the mockery scenarios.ts set-up): only the class-lookup stand-in changed. It now layers over the installed lookup and is restored afterwards (amendment 2). Every expected value and message is byte-identical to before. The layered stand-ins still return null for XtDep, and LOOKUP is deleted where the test expects 'is not installed', so the pinned messages hold. No exact comparison was loosened. |
| F-3: No assertion is removed without a DIV clause | pass | Counted the assertions in each modified test file against the diff: no expect/Assert line was removed. The new files only add assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or changed; the change sets no skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is touched. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed fixture is an error. XT-assert-20's fixture verifies and has error null. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared each consequence string with its body. XT-runtime-48 checks the token table, interfaceExists, ReflectionClass/isSubclassOf by token FQCN, the four-entry install, descriptor flags, the LogicException refusal and the opt-out. XT-runtime-49 checks enumExists, ReflectionEnum by class/FQCN/case, backed/pure/bad backingType, the not-an-enum and does-not-exist errors, and the Reflector port. XT-contracts-21 checks recording, first-wins, nothing recorded on a throw, not-a-class, and a shipped contract. XT-assert-102 covers the class, test-class and token string cases, unknown names, no runtime, an odd lookup and assertContainsOnlyInstancesOf. However its consequence also claims expectException's handling of a string is unchanged, and the body never exercises expectException. No consequence cites an FR/AD-<n>.<k> token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes stay in the item's components (runtime, contracts, assert, plus the mockery/assert test set-up that amendment 2 allows). contract() calls the real runtime export registerContractToken. The grader resolves class-strings only through the published Symbol.for('xaravel.class.lookup') protocol, without importing the runtime (AD-2). The test stand-ins delegate to the real lookup rather than faking another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): the only @​asyncRoot tag in the touched files is resolveClassAsync (registry.ts:178), kept and true under ESC-9.4-1 option 1a. All new exports are synchronous and correctly untagged: registerContractToken, resolveContractToken, lookUpName, interfaceExists, enumExists, ReflectionEnum, resolveReflectionName, resolveClassString and the classLookup install. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102's consequence says "expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"1138708dc9b0e43dfc8e64cd5b0e683bc2dc44b2","base":"58285c41543fa28b1c4980a9580cde3029df8e7f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:27:07.510Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; every touched test is an Xaravel Test.","findings":[]},{"id":"F-2","result":"pass","note":"Compared each changed line in the touched existing Xaravel Tests (XT-assert-20, XT-assert-100, XT-mockery-15, and the mockery scenarios.ts set-up): only the class-lookup stand-in changed. It now layers over the installed lookup and is restored afterwards (amendment 2). Every expected value and message is byte-identical to before. The layered stand-ins still return null for XtDep, and LOOKUP is deleted where the test expects 'is not installed', so the pinned messages hold. No exact comparison was loosened.","findings":[]},{"id":"F-3","result":"pass","note":"Counted the assertions in each modified test file against the diff: no expect/Assert line was removed. The new files only add assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or changed; the change sets no skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is touched.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed fixture is an error. XT-assert-20's fixture verifies and has error null.","findings":[]},{"id":"F-7","result":"fail","note":"Compared each consequence string with its body. XT-runtime-48 checks the token table, interfaceExists, ReflectionClass/isSubclassOf by token FQCN, the four-entry install, descriptor flags, the LogicException refusal and the opt-out. XT-runtime-49 checks enumExists, ReflectionEnum by class/FQCN/case, backed/pure/bad backingType, the not-an-enum and does-not-exist errors, and the Reflector port. XT-contracts-21 checks recording, first-wins, nothing recorded on a throw, not-a-class, and a shipped contract. XT-assert-102 covers the class, test-class and token string cases, unknown names, no runtime, an odd lookup and assertContainsOnlyInstancesOf. However its consequence also claims expectException's handling of a string is unchanged, and the body never exercises expectException. No consequence cites an FR/AD-<n>.<k> token.","findings":[{"path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102's consequence says \"expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged\", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Code changes stay in the item's components (runtime, contracts, assert, plus the mockery/assert test set-up that amendment 2 allows). contract() calls the real runtime export registerContractToken. The grader resolves class-strings only through the published Symbol.for('xaravel.class.lookup') protocol, without importing the runtime (AD-2). The test stand-ins delegate to the real lookup rather than faking another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): the only @asyncRoot tag in the touched files is resolveClassAsync (registry.ts:178), kept and true under ESC-9.4-1 option 1a. All new exports are synchronous and correctly untagged: registerContractToken, resolveContractToken, lookUpName, interfaceExists, enumExists, ReflectionEnum, resolveReflectionName, resolveClassString and the classLookup install.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `58285c41543fa28b1c4980a9580cde3029df8e7f`, on 2026-10-26T00:33:53.836Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the changed grader fixtures and assertions with the diff and Amendment 2. Existing expected values and comparison strengths are unchanged. |
| F-3: No assertion is removed without a DIV clause | pass | The diff removes no assertions; the existing grader tests retain their checks while changing lookup setup. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle output with a non-null error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests and helpers with their consequences and supplied rulings. Their checks cover the declared token lookup, reflection, enum, class-string and double behavior. XT-assert-102 now exercises expectException with a class-string and checks its exact rejection. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and behavior with the approved Infrastructure scope and Amendment 2. Production changes belong to runtime, contracts and assert; grader fixture changes layer and restore lookup stand-ins without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and retained tags with AD-6, DIV-1 and ESC-9.4-1. The retained Registry.resolveClassAsync tag covers its dynamic import; the new lookup and reflection methods are synchronous and need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified. **fixed**: The runtime-loaded child now calls new TestCase().expectException(POST), and the parent asserts the exact UnknownClassOrInterfaceException message.
- **P-2** (reviewer 2, F-7) `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102's consequence says "expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string. **fixed**: The added expectException row verifies the previously untested consequence while retaining the containsOnly check.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950","base":"58285c41543fa28b1c4980a9580cde3029df8e7f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:33:53.836Z","items":[{"id":"F-1","result":"n/a","note":"The item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed grader fixtures and assertions with the diff and Amendment 2. Existing expected values and comparison strengths are unchanged.","findings":[]},{"id":"F-3","result":"pass","note":"The diff removes no assertions; the existing grader tests retain their checks while changing lookup setup.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle output with a non-null error.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests and helpers with their consequences and supplied rulings. Their checks cover the declared token lookup, reflection, enum, class-string and double behavior. XT-assert-102 now exercises expectException with a class-string and checks its exact rejection.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the changed paths and behavior with the approved Infrastructure scope and Amendment 2. Production changes belong to runtime, contracts and assert; grader fixture changes layer and restore lookup stand-ins without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and retained tags with AD-6, DIV-1 and ESC-9.4-1. The retained Registry.resolveClassAsync tag covers its dynamic import; the new lookup and reflection methods are synchronous and need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified.","fixed":true,"note":"The runtime-loaded child now calls new TestCase().expectException(POST), and the parent asserts the exact UnknownClassOrInterfaceException message."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102's consequence says \"expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged\", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string.","fixed":true,"note":"The added expectException row verifies the previously untested consequence while retaining the containsOnly check."}]}
```

### Reviewer 2: pass at tree 1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `58285c41543fa28b1c4980a9580cde3029df8e7f`, on 2026-10-26T00:33:53.836Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; every touched test is an xaravelTest. |
| F-2: No expected value is weakened | n/a | There are no Ported Tests, and the evidence names no stale_tests file. In the changed grader fixtures (assert token-doubles and typed-doubles, mockery token-doubles and scenarios.ts) only the class-lookup set-up changes; every expect value is unchanged. The layered stand-ins answer the same names as before and send any other name to the installed lookup, so XT-assert-20's 'does not resolve the class "XtDep"' and lookupClass('XtT\\Forged') === null keep their values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test, and no assertion is removed in the touched Xaravel Tests. The layered lookup edits remove no expect call. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations line. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker or cites a DIV clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | The only fixture relied on is XT-assert-20's (809c09d9…). It is present, verifies, and has error null. No error fixture is involved. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-102: the body now checks every clause of the consequence. Covered: a class FQCN, both lowercased and with a leading backslash (classPassCase); a registerTestClass FQCN inside and after its frame; a token FQCN passing and failing; failure text equal to the by-value form; unknown names; no runtime loaded; assertContainsOnlyInstancesOf (containsOnly row); and now expectException (expectException row). XT-contracts-21, XT-runtime-48 and XT-runtime-49: each claim maps to assertions in the body. Covered: first token wins, any case and a leading backslash, a refused contract records nothing, resolveClass throws, enumExists, the four entries installing the lookup with writable/configurable/non-enumerable, the LogicException and the opt-out, the ReflectionEnum backed/pure/bad-type cases, and the two Reflector helpers ported line for line. One weak spot: XT-runtime-48's 'test class first' is shown only as a test class resolving inside its frame, not as winning over a base class of the same name. XT-assert-20, XT-assert-100 and XT-mockery-15: only the lookup set-up changed; their bodies still check their consequences. No FR/AD .k token is cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes stay in the item's components: runtime (token table, lookup global, ReflectionEnum, enum/interface existence), contracts (contract() records each token), and assert (resolveClassString). The mockery and assert test edits are only the class-lookup layering that Amendment 2 of MAINT-2026-10-25-story-13-1-second approves. No stub, fake or hard-coded behaviour of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): the only @​asyncRoot tag is resolveClassAsync (registry.ts:178), kept and justified by ESC-9.4-1 option 1a. The new exports (registerContractToken, resolveContractToken, lookUpName, interfaceExists, enumExists, ReflectionEnum methods, resolveClassString) are all sync, take no async callback, and correctly carry no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified. **fixed**: class-string.test.ts XT-assert-102 now has the row expectException: outcome(() => new TestCase().expectException(POST)) in the runtime-loaded child. It asserts the row is 'UnknownClassOrInterfaceException: Class or interface "XaravelFixture\\ClassString\\Post" does not exist', which checks the consequence's expectException claim.
- **P-2** (reviewer 2, F-7) `packages/assert/tests/xaravel/class-string.test.ts`: XT-assert-102's consequence says "expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string. **fixed**: Same row: with the runtime loaded, a class-string that the lookup resolves is passed to TestCase.expectException, and the test pins that it still throws. This matches the consequence's 'expectException's … handling of a string is unchanged'.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"1ec6a6bc3c759c4db9a5cedbe54b9d7ec1c92950","base":"58285c41543fa28b1c4980a9580cde3029df8e7f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:33:53.836Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; every touched test is an xaravelTest.","findings":[]},{"id":"F-2","result":"n/a","note":"There are no Ported Tests, and the evidence names no stale_tests file. In the changed grader fixtures (assert token-doubles and typed-doubles, mockery token-doubles and scenarios.ts) only the class-lookup set-up changes; every expect value is unchanged. The layered stand-ins answer the same names as before and send any other name to the installed lookup, so XT-assert-20's 'does not resolve the class \"XtDep\"' and lookupClass('XtT\\\\Forged') === null keep their values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test, and no assertion is removed in the touched Xaravel Tests. The layered lookup edits remove no expect call.","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations line.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker or cites a DIV clause.","findings":[]},{"id":"F-6","result":"pass","note":"The only fixture relied on is XT-assert-20's (809c09d9…). It is present, verifies, and has error null. No error fixture is involved.","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-102: the body now checks every clause of the consequence. Covered: a class FQCN, both lowercased and with a leading backslash (classPassCase); a registerTestClass FQCN inside and after its frame; a token FQCN passing and failing; failure text equal to the by-value form; unknown names; no runtime loaded; assertContainsOnlyInstancesOf (containsOnly row); and now expectException (expectException row). XT-contracts-21, XT-runtime-48 and XT-runtime-49: each claim maps to assertions in the body. Covered: first token wins, any case and a leading backslash, a refused contract records nothing, resolveClass throws, enumExists, the four entries installing the lookup with writable/configurable/non-enumerable, the LogicException and the opt-out, the ReflectionEnum backed/pure/bad-type cases, and the two Reflector helpers ported line for line. One weak spot: XT-runtime-48's 'test class first' is shown only as a test class resolving inside its frame, not as winning over a base class of the same name. XT-assert-20, XT-assert-100 and XT-mockery-15: only the lookup set-up changed; their bodies still check their consequences. No FR/AD .k token is cited.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes stay in the item's components: runtime (token table, lookup global, ReflectionEnum, enum/interface existence), contracts (contract() records each token), and assert (resolveClassString). The mockery and assert test edits are only the class-lookup layering that Amendment 2 of MAINT-2026-10-25-story-13-1-second approves. No stub, fake or hard-coded behaviour of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): the only @asyncRoot tag is resolveClassAsync (registry.ts:178), kept and justified by ESC-9.4-1 option 1a. The new exports (registerContractToken, resolveContractToken, lookUpName, interfaceExists, enumExists, ReflectionEnum methods, resolveClassString) are all sync, take no async callback, and correctly carry no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102 claims expectException's string handling is unchanged, but never calls expectException. Add a check exercising its rejection of a string, or narrow the consequence string to the behavior actually verified.","fixed":true,"note":"class-string.test.ts XT-assert-102 now has the row expectException: outcome(() => new TestCase().expectException(POST)) in the runtime-loaded child. It asserts the row is 'UnknownClassOrInterfaceException: Class or interface \"XaravelFixture\\\\ClassString\\\\Post\" does not exist', which checks the consequence's expectException claim."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/assert/tests/xaravel/class-string.test.ts","detail":"XT-assert-102's consequence says \"expectException's and assertContainsOnlyInstancesOf's handling of a string is unchanged\", but the body only checks assertContainsOnlyInstancesOf (the containsOnly row); no row calls TestCase.expectException with a class-string. Either add a row (in the runtime-loaded child) that pins expectException's current behaviour for a string, or remove expectException from the consequence string.","fixed":true,"note":"Same row: with the runtime loaded, a class-string that the lookup resolves is passed to TestCase.expectException, and the test pins that it still throws. This matches the consequence's 'expectException's … handling of a string is unchanged'."}]}
```
