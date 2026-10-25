---
title: 'Contract token table, ReflectionEnum and class-string assertInstanceOf (epic-13-item-2-reflection-contracts)'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: '360c4500eaf0132ccf7ffda725c30ff9d2cc1d71'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-25-story-13-1-second.md'
  - '{project-root}/conformance/escalations/ESC-13.1-7.md'
  - '{project-root}/conformance/escalations/ESC-13.1-8.md'
  - '{project-root}/conformance/escalations/ESC-13.1-9.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 13.1 is held on three gaps the Maintainer ruled on (ESC-13.1-7..9, option 1 each): a contract token's FQCN string resolves nowhere, so `interface_exists` and `new ReflectionClass('<token FQCN>')` cannot be ported; the runtime has no `ReflectionEnum` / `enum_exists` over AD-26's `static backingType`; and `@xaravel/assert`'s `assertInstanceOf` refuses every class-string, where PHPUnit accepts any existing class or interface name.

**Approach:** `@xaravel/runtime/registry` gains a token table filled by a new `registerContractToken(token)`, which `@xaravel/contracts`' `contract(...)` calls (the runtime may not import contracts, AD-2). `@xaravel/runtime/php` gains `interfaceExists(name)`, `enumExists(name)` and `ReflectionEnum` (`isBacked()`, `getBackingType()`), and `ReflectionClass` resolves a token FQCN through the table. The runtime publishes a name lookup on `globalThis[Symbol.for('xaravel.class.lookup')]`, which `@xaravel/assert` reads (the grader imports no runtime) so `assertInstanceOf` / `assertNotInstanceOf` accept a class-string. XT-runtime-48, XT-runtime-49, XT-contracts-21 and XT-assert-102 pin them.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, `packages/contracts/**`, `packages/assert/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT 2026-10-22 amendment; item scope per the 2026-10-25 amendment).
- PHP names camelCased as PORTING.md does for PHP functions (`is_numeric` → `isNumeric`): `interface_exists` → `interfaceExists`, `enum_exists` → `enumExists`. One public class per file (`src/php/ReflectionEnum.ts`, ending `registerClass('ReflectionEnum', ReflectionEnum)`). Messages are PHP 8.5's / PHPUnit 13.4.3's exactly. Everything sync; never return `undefined`.
- Keys case-insensitive with a leading `\` dropped, as the Registry's are. A lookup checks registered classes (test classes up the frame chain first, then the base) before tokens.
- The global follows `Symbol.for('xaravel.php.classes')`'s install rules: non-writable, non-configurable, non-enumerable; throws `LogicException` when already defined with another value; skipped under `XARAVEL_NO_SCOPE_GLOBAL=1`; installed by each of the four package entries.
- New exports named in `packages/runtime/docs/` (XT-runtime-37), in `export { … } from` form. Docs that say a token's FQCN does not resolve, or list `ReflectionEnum` as not ported, are updated in place.

**Never:**
- Remove or weaken an existing assertion; change `conformance/**`, `tools/**`, `PORTING.md`, another package, or the item's `action` / `owner` / `epic`.
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
- Docs: `packages/runtime/docs/reflection.md`, `class-registry.md`, `packages/contracts/docs/contracts.md`, assert's `README.md` if it lists `assertInstanceof` arguments.

**Acceptance Criteria:**
- Given Story 13.1's `IA` / `IB` written as `contract(...)` tokens, when `Reflector::isParameterSubclassOf`'s PHP (`class_exists($n) || interface_exists($n)` then `new ReflectionClass($n)->isSubclassOf(...)`) is ported over `resolveClass` / `interfaceExists` / `ReflectionClass`, then it gives PHP's results with no other runtime change.
- Given a string-backed enum class per AD-26, when `isParameterBackedEnumWithStringBackingType` is ported line for line over `enumExists` / `ReflectionEnum`, then `getBackingType()->getName()` is `'string'`.
- Given `bun run harness`, `bun run typecheck`, `bun run lint`, then all pass with no differences, and every existing assertion is unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

PHP refuses a second declaration of an interface name; `contract()` never has (Xaravel Tests build throwaway tokens under shared names, e.g. `X\\Y` four times), so the table keeps the first token and does not record a later one. A program PHP accepts never re-declares, so its behaviour is PHP's. An enum is a registered class whose static side has a `cases` function (AD-26); it is backed when it declares `backingType`.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts packages/assert` -- expected: pass
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run typecheck` and `bun run lint` -- expected: exit 0

## Auto Run Result

Status: blocked
Blocking condition: the global lookup this spec installs, `Symbol.for('xaravel.class.lookup')`, is an existing grader protocol (ESC-4.6-1 item 9, ESC-4.8-1 item 1) that Protected tests in `packages/mockery` and `packages/assert` stub themselves. With the runtime installing it, `bun run harness` gives `differ=5`; fixing those tests needs a path outside the item's scope.

- Failing: XT-mockery-7, XT-mockery-15 (`packages/mockery/tests/xaravel/token-doubles.test.ts`, `double-scenarios.ts` redefine the non-configurable global); XT-mockery-4, XT-mockery-5 (`packages/mockery/tests/xaravel/scenarios.ts:159` installs its `XtFoo` stand-in only when no lookup exists, and the runtime's does not know those classes); XT-assert-20 (`packages/assert/tests/xaravel/typed-doubles.test.ts:78`) and XT-assert-100 (`packages/assert/tests/xaravel/token-doubles.test.ts:115`) import the runtime in a child process, then redefine the lookup. In the other load order the runtime's install throws `LogicException` (reproduced 2026-10-25).
- `packages/mockery/**` is not in the item's `action`, and `--stale-test` refuses Protected Paths (`decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`).
- Everything else is built and passes: typecheck, lint, `registration:check`, `async-surface --check runtime`, XT-runtime-37, -48, -49, XT-contracts-21 and XT-assert-102. No existing assertion changed. The implementation is saved on branch `planning/retro-13-reflection-contracts-impl`.
- Options: (1, recommended) the Maintainer lets the item change the tests that stub the lookup, in `packages/mockery/tests/**` and `packages/assert/tests/**`, so they wrap or stand aside for the runtime's lookup, which ESC-4.6-1 item 9 says the class registry installs; (2) the runtime installs the lookup writable and configurable, which alone leaves XT-mockery-4/5 failing; (3) the runtime publishes its lookup under a new symbol that only `classOrInterface` reads, which leaves two lookup protocols in the grader.
