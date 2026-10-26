---
title: 'Runtime PHP type tests, instanceof targets, the array and string functions Collections calls, and ReflectionMethod invoke (epic-14-item-3-runtime-type-tests-functions)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
baseline_revision: 'af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b'
context:
  - '{project-root}/decisions/MAINT-2026-10-26-story-14-1-third.md'
  - '{project-root}/decisions/ESC-14.1-9.md'
  - '{project-root}/decisions/ESC-14.1-10.md'
  - '{project-root}/conformance/escalations/ESC-14.1-9.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-generators-functions.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A bare JS generator object answers instanceof Generator but not Iterator or Traversable, nor is_a(gen, 'Iterator' | 'Traversable').
    evidence: |-
      PHP's Generator implements Iterator, so PHP gives true for all three. The ruling (ESC-14.1-9) names only Generator, and the spec's Never forbids making Traversable or Iterator answer a bare generator. is_iterable(gen) is true through isTraversable. Widening the two tokens changes existing runtime behaviour and needs its own ruling under decisions/MAINT-2026-10-26-runtime-builtins.md.
    location: >-
      packages/runtime/src/php/Traversable.ts, packages/runtime/src/php/Iterator.ts
    severity: medium
  - summary: >-
      Countable is no recorded contract token, so is_a(x, 'Countable') and interfaceExists('Countable') are false where PHP gives true.
    evidence: |-
      count() reads the Symbol.for("Countable") brand, but the item names no Countable token, and the spec's Never forbids recording one. A later item or the runtime-builtins standing rule can add it.
    location: >-
      packages/runtime/src/php/arrayFunctions.ts count
    severity: low
  - summary: >-
      The I/O matrix's implode(','), explode('') and array_key_exists array-key messages differ from PHP 8.5.11's.
    evidence: |-
      PHP 8.5.11 gives "implode(): If argument #1 ($separator) is of type string, argument #2 ($array) must be of type array, null given", "explode(): Argument #1 ($separator) must not be empty" and "Cannot access offset of type array on array". The probe records these, and the code follows PHP under the contract's "every value and message is PHP's" rule. The matrix rows were drafted before probing, and the intent contract is read-only after planning.
    location: >-
      _bmad-output/implementation-artifacts/spec-retro-14-runtime-type-tests-functions.md (I/O & Edge-Case Matrix)
    severity: low
  - summary: >-
      A contract token passed to sprintf, implode, explode or array_key_exists is not read as its class-string (AD-9).
    evidence: |-
      These go through the existing toPhpString / stringParameter / normalizeKey casts, which read a token as an array. Fixing it changes those casts' behaviour for every caller, which the item's ruling forbids. The docs list the limit.
    location: >-
      packages/runtime/src/php/casts.ts toPhpString, packages/runtime/src/php/PhpArray.ts normalizeKey
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 14.1 (Collections) needs PHP's type tests, the `UnitEnum` / `BackedEnum` / `Closure` / `ArrayAccess` / `Generator` `instanceof` targets, the array and string functions its core calls, and `ReflectionMethod::invoke` / `invokeArgs` / `setAccessible`. The runtime has none of them (ESC-14.1-9, ESC-14.1-10). The Maintainer ruled option 1 on both (`decisions/MAINT-2026-10-26-story-14-1-third.md`). The runtime half lands first, as action item `epic-14-item-3-runtime-type-tests-functions`.

**Scope:** `packages/runtime/**` and `packages/contracts/**`, as the item's `action` says. Contracts changes only if a token needs it. The route is amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. This spec and sprint status may change too.

**Approach:** `@xaravel/runtime/php` and the package root export, under PHP's names:
- the type tests `is_array`, `is_object`, `is_string`, `is_iterable`, `is_callable`, `is_a`;
- the functions `sprintf`, `implode`, `explode`, `array_map`, `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`, `count`, `abs`, with `COUNT_NORMAL` / `COUNT_RECURSIVE`;
- `get_debug_type` and `json_last_error`, which are the existing `getDebugType` and `jsonLastError` function objects under PHP's names;
- tokens `UnitEnum`, `BackedEnum`, `ArrayAccess`, and a `Closure` class.

`Generator` gains a static `Symbol.hasInstance` that also answers a bare JS generator object. `ReflectionMethod` gains `invoke`, `invokeArgs` and `setAccessible`. Each function ports PHP 8.5.11's C source in coercive typing mode: `ext/standard/array.c`, `string.c`, `formatted_print.c`, `math.c`, `type.c`, `Zend/zend_builtin_functions.c` and `ext/reflection/php_reflection.c`.

## Boundaries & Constraints

**Always:** These follow PHP 8.5.11 as the host's `php` gives it (a new probe):
- **Values and messages.** Every value, and every exception class and message, is PHP's. PHP's warnings and deprecations are not reproduced; the function still returns PHP's value.
- **Values in and out.** `undefined` reads as `null` (AD-9). An array comes in as `arrayEntries` reads it and goes out through `arrayFromEntries`. Scalars are parsed with `phpArguments.ts`'s coercive parsers, which already carry PHP's `TypeError` messages. A float result carries the float marker where PHP's is a float.
- **Sync.** Everything is synchronous.
- **The value model** (AD-9, DIV-12.19):
  - `is_array(v)` is `phpType(v) === "array"`, and `is_object(v)` is `phpType(v) === "object"`, except as below.
  - A contract token is its class-string (AD-9). So `is_string(token)` is true, `is_array(token)` is false, and `is_a(token, n, true)` tests the class-string.
  - A class constructor, a function that `Function.prototype.toString` shows as `class …` or that carries its own Registry FQCN key, stands for its class-string, as Reflector already treats a registered class. It is no `Closure`, and `is_a(ctor, n)` needs `$allowString`.
  - Any other function is a PHP `Closure`.
  - `gettype`, `getDebugType` and `phpType` keep their current results. The ruling forbids other behaviour changes.
- **`instanceof`.**
  - `x instanceof Closure` is true exactly for a function that is not a class constructor. `new Closure()` throws PHP's `Error` `Instantiation of class Closure is not allowed`. `Closure` is registered as `registerClass('Closure', Closure)`.
  - `x instanceof UnitEnum` is true for an AD-26 enum case: an object whose class has a static `cases` function.
  - `x instanceof BackedEnum` is true for such a case whose class declares `backingType` `'string'` or `'int'`. `BackedEnum`'s parent is `UnitEnum`.
  - `x instanceof ArrayAccess` reads the existing `Symbol.for("ArrayAccess")` brand.
  - All three tokens are built by `phpInterface` and recorded, so `interfaceExists` and `is_a` resolve their names. Their members are PHP's: `UnitEnum` has `cases`, `BackedEnum` has `from` and `tryFrom`, and `ArrayAccess` has `offsetExists`, `offsetGet`, `offsetSet` and `offsetUnset`.
  - `phpInterface` gains an optional instance test for the two enum tokens. Every existing token keeps the brand test.
  - `x instanceof Generator` also answers a bare JS generator object.
- **`is_a($value, $name, $allowString = false)`.** It returns false on a miss, never throws for an unknown name, matches the name case-insensitively and ignores a leading `\`. For a class target it is PHP's `instanceof_function`. For an interface (token) target it reads the token's instance test, the brand on a class's prototype, or, for the enum tokens, the enum-class test. A token answers itself and its parents' names. A `string` value counts only with `$allowString`.
- **`is_callable($value, $syntaxOnly = false, ?Ref $callableName = null)`.** It ports PHP's `zend_is_callable_ex` under DIV-9.13 and DIV-9.14, with the same rules as Reflector's `isCallableValue`, so Reflector can later call it:
  - A Closure is callable.
  - An object with a function `__invoke` is callable.
  - A callable array `[object | class-string | class | token, method]` is callable when the method is found. A method on the prototype chain counts for an object. A class-string needs a static method, or `__callStatic` for a missing one. `__call` covers a missing method on an object.
  - A `'Class::method'` string follows the same static rule. Any other string, a PHP function name included, is false (DIV-9.14). Under `$syntaxOnly`, any string, and any two-element array of a string or object and a string, is true.
  - `$callableName`, when given, receives PHP's name: `Closure::__invoke`, `<FQCN>::__invoke`, `<FQCN>::method`, or the string itself.
- **Callbacks.** `array_map` accepts a callback exactly as `array_filter` does: a Closure, an invokable object, or `null`. It reuses `array_filter`'s check and its `TypeError` for PHP callable strings and arrays (DIV-9.13).
- **ReflectionMethod.** `invoke($object, ...$args)` and `invokeArgs($object, $args = [])` port `reflection_method_invoke`:
  - Any visibility is allowed (PHP 8.1+).
  - A static method ignores `$object` and runs with the reflected class as `this`, PHP's called scope.
  - An instance method needs an object that is an instance of the declaring class. Otherwise PHP's `ReflectionException` says `Trying to invoke non static method <C>::<m>() without an object` or `Given object is not an instance of the class this method was declared in`.
  - `invokeArgs` takes the AD-9 array forms. A string key there (PHP's named argument) throws a JS `TypeError` naming the limit, and the docs say so.
  - `setAccessible($accessible)` is a no-op that takes a bool and returns `null`.
  - `FoundMethod` records whether the match came from the static chain.
- **Tests.** New XT cases use `xaravelTest` and `@xaravel/assert`. A PHP probe records every PHP-derived value. A recompute case checks every probe label with the runtime, as XT-runtime-61 does. A fresh-process case checks the root and `@xaravel/runtime/php` export each new name as the same object, that `resolveClass('Closure')` finds the class, and that the classes map still has 24 entries.

**Never:**
- **Other runtime behaviour.** Change any existing export or behaviour other than these two:
  - recording the new tokens, which makes `interfaceExists('ArrayAccess' | 'UnitEnum' | 'BackedEnum')` true, as in PHP;
  - `Generator`'s `instanceof`.

  Any internal `instanceof Generator` site that needs the wrapper class keeps its old meaning by testing the wrapper class itself.
- **Imports.** Import `@xaravel/contracts` from the runtime (AD-2).
- **Other paths.** Touch `conformance/expectations/**`, `decisions/**`, PORTING.md, `packages/collections/**`, `packages/reflection/**` or any package other than runtime and contracts.
- **The classes map.** Add `Closure` to `Symbol.for('xaravel.php.classes')`.
- **Unruled additions.** Make `Traversable` or `Iterator` answer a bare JS generator, port PHP callable strings or arrays as `array_map` callbacks, or port `sprintf`'s locale handling. A `%f` is C-locale, as PHP's default is. Each limit is listed in the docs.
- **Unrecorded interfaces.** Record a token for `Countable` or any other PHP interface the item does not name. `is_a(x, 'Countable')` is a miss, and so `false`, until a ruling records it; the docs say so.
- **Existing tests.** Change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type tests | `[]`, `{a:1}`, a `PhpArray`, `stdClass`, a closure, a registered class, a contract token, `float(1)`, `'s'`, `null` | `is_array` true for the first three only; `is_object` for `stdClass`, the closure and the class; `is_string` for `'s'` and the token | none |
| is_iterable | an array, `ArrayIterator`, a `Generator`, a bare JS generator, `stdClass`, `'s'` | `T T T T F F` | none |
| is_a | `ArrayObject` vs `'ArrayObject'`, `'arrayobject'`, `'\\ArrayObject'`, `'Traversable'`, `'Nope'`; `'ArrayIterator'` with and without `$allowString`; `Exception` subclass vs parent; an enum case vs `'UnitEnum'`; a token vs its parent's name | PHP's booleans; a miss is false | non-bool `$allowString` coerces as PHP's |
| instanceof | an arrow function, a `function`, an async function, a class, a registered class; a pure and a backed enum case; `ArrayObject`; a bare JS generator | `Closure` T T T F F; `UnitEnum` T T, `BackedEnum` F T; `ArrayAccess` T; `Generator` T | `new Closure()`: `Error` `Instantiation of class Closure is not allowed` |
| is_callable | a closure, an invokable, `[obj,'m']`, `[obj,'missing']` with and without `__call`, `['C','static']`, `['C','instance']`, `'C::static'`, `'strlen'`, `'Nope::x'`, `[1,2]` with `syntaxOnly` | PHP's booleans under DIV-9.14 (`'strlen'` false) and the callable names | none |
| sprintf | `%s %d %u %f %.2f %F %e %E %g %G %x %X %o %b %c %%`, `%5s`, `%-5s|`, `%05d`, `%+d`, `%'*8s`, `%1$s %2$s %1$s`, `%.3e`, `%*d` (PHP 8 width argument), negative `%u`, a float `%d`, `true` / `null` / an array as `%s` | PHP's strings | too few: `ArgumentCountError` `N arguments are required, M given`; `%y`: `ValueError` `Unknown format specifier "y"`; trailing `%`: `ValueError` `Missing format specifier at end of string`; `%0$s`: `ValueError` `Argument number specifier must be greater than zero and less than 2147483647` |
| implode / explode | `implode(',', [1, 1.5, true, false, null, 'a'])`, `implode([1,2])`, a `Stringable` element; `explode(',', 'a,b,,c')`, limits `2`, `-1`, `0`, a separator not found, `''` subject | PHP's results | `implode(',')`: `TypeError` `implode(): Argument #1 ($array) must be of type array, string given`; `implode([1], ',')`: `TypeError` `implode(): Argument #1 ($separator) must be of type string, array given`; an array element: `"Array"`; `explode('', 'a')`: `ValueError` `explode(): Argument #1 ($separator) cannot be empty` |
| array_map | one array with string and int keys; two arrays of unequal length; `null` callback with one and with two arrays | keys kept for one array; a list padded with `null`; the array unchanged; zipped lists | a non-array: `TypeError` `array_map(): Argument #2 ($array) must be of type array, int given` (`Argument #3 must be …` for the rest); a callable string: `array_filter`'s unported-callable `TypeError` |
| array keys and merge | `array_keys` with a search value loose and strict; `array_values`; `array_key_exists` with `null`, `1.5`, `true`, `'1'` keys; `array_key_first` / `_last` on `[]`; `array_merge()` with no arguments, int keys renumbered and string keys overwritten | PHP's results (`null` on empty) | a non-array: `TypeError` per function; an array key: `TypeError` `Illegal offset type` / PHP's message as probed |
| count / abs | `count([1,[2,3]])`, `COUNT_RECURSIVE`, an `ArrayObject`, an object with a `Countable` brand; `abs(-5)`, `abs(-1.5)`, `abs(float(-0))`, `abs('-3')`, `abs(PHP_INT_MIN)` | `2`, `4`, its count, its `count()`; `5`, `1.5`, `float(0)`, `3`, a float | `count(1)`: `TypeError` `count(): Argument #1 ($value) must be of type Countable|array, int given`; mode `5`: `ValueError` `count(): Argument #2 ($mode) must be either COUNT_NORMAL or COUNT_RECURSIVE`; `abs('x')`: `TypeError` `abs(): Argument #1 ($num) must be of type int|float, string given` |
| ReflectionMethod | a protected instance method via `invoke` and `invokeArgs`; a static method with `null`; a method of `A` given an unrelated object or `null`; `setAccessible(true)` | the method's results, `this` the object or the reflected class; `setAccessible` returns `null` | PHP's `ReflectionException` messages; a string key in `invokeArgs`: JS `TypeError` |
| Aliases | `get_debug_type`, `json_last_error` | `=== getDebugType`, `=== jsonLastError` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/index.ts`, `src/index.ts`: the export lists. XT-runtime-37 (`tests/xaravel/docs.test.ts`) reads only `export { … } from` lists, and needs every exported name in backticks under `docs/`.
- `packages/runtime/src/php/phpType.ts`: `phpType` :17, `className` :54, `phpTypeName` :71 (the `… given` names), `getDebugType` :113.
- `packages/runtime/src/php/casts.ts`: `arrayEntries` :26, `arrayCount` :41, `isTrue` :65, `toInt`, `toFloat`, `toPhpString` :143 (PHP's string conversion and its `Error`), and `formatFloat` re-exported from `scalarString.ts:59`.
- `packages/runtime/src/php/gcvt.ts`: the `%e` / `%g` digit helpers (internal).
- `packages/runtime/src/php/PhpArray.ts`: `normalizeKey` :64, `arrayFromEntries` :209.
- `packages/runtime/src/php/phpArguments.ts`: `argumentTypeError` :20, `stringParameter`, `intParameter`, `boolParameter`, `numberParameter` (returns `{int}` or `{float}`), `arrayParameter` :140.
- `packages/runtime/src/php/arrayFunctions.ts`:
  - `isEnumCase` :134 (internal) is the enum-case test.
  - :83-109 is `array_filter`'s callback check and `unportedCallable` `TypeError`, which `array_map` reuses.
  - The existing PHP-name functions sit here.
- `packages/runtime/src/php/classExistence.ts`: `isEnumClass` :10.
- `packages/runtime/src/php/ReflectionEnum.ts:36-56`: `isBacked` reads `backingType`.
- `packages/runtime/src/php/traverse.ts`: `isTraversable` :21.
- `packages/runtime/src/php/Generator.ts`:
  - `isJsGenerator` :39.
  - `yieldFrom` :295 and `traverse.ts:64-67` use `instanceof Generator` on a value they have already wrapped. Keep their meaning, for example with a private check of the wrapper class.
- `packages/runtime/src/php/phpInterface.ts`: the token builder. Add the optional instance test there.
- `packages/runtime/src/php/Traversable.ts`: the token-file pattern. `index.ts` imports each token file for its side effect.
- `packages/runtime/src/registry/registry.ts`: `fqcn` :111, `isContractToken` :142, `resolveClass` :160, `resolveContractToken` :244, `lookUpName` :254 (class first, then token, null on a miss). Reuse these for `is_a` and for class-strings.
- `packages/reflection/src/Reflector.ts:103`, `:300` `isCallableValue`: read-only. These are the DIV-9.14 rules that `is_callable` matches.
- `packages/mockery/src/support/values.ts:48` `isClosure`: read-only. It is the class-constructor test (an own FQCN key, or `/^class\b/` source) that `Closure` follows.
- `packages/runtime/src/php/ReflectionMethod.ts`, and `reflectionTargets.ts:70-110`: `FoundMethod` and `findMethod`. The prototype loop finds an instance method and the static loop a static one.
- `packages/runtime/src/php/jsonLastError.ts`: `jsonLastError` :20.
- Brands: `Symbol.for("ArrayAccess")` and `Symbol.for("Countable")` in `ArrayObject.ts:33-34`, `ArrayIterator.ts:19-20` and `WeakMap.ts:22-23`.
- Tests:
  - `packages/runtime/tests/xaravel/php-functions.test.ts`: `NEW_EXPORTS` :66, `child()` :145, `PROBE_CASES` :403 and the recompute at :1347. This is the pattern.
  - The next free id is XT-runtime-62.
  - XT-runtime-35 and XT-runtime-60 pin the classes map at 24.
  - XT-contracts-22 (`packages/contracts/tests/xaravel/runtime-tokens.test.ts:26`) pins token parity with `contract()`. Add `ArrayAccess` to its list, a brand-only token, and keep the enum tokens out, because their instance test differs from `contract()`'s.
- Docs: `packages/runtime/docs/php-functions.md`, `reflection.md`, and README links.
- PHP 8.5.11 sources, read-only: `ext/standard/formatted_print.c` (`php_formatted_print`), `string.c` (`php_implode`, `php_explode`), `array.c` (`array_map`, `array_keys`, `array_merge`, `php_count_recursive`, `array_key_exists`), `math.c` (`abs`), `type.c` (`is_callable`, `is_iterable`), `Zend/zend_builtin_functions.c` (`is_a_impl`), `Zend/zend_API.c` (`zend_is_callable_ex`), and `ext/reflection/php_reflection.c` (`reflection_method_invoke`).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/phpInterface.ts`: add the optional instance test.
- `packages/runtime/src/php/UnitEnum.ts`, `BackedEnum.ts`, `ArrayAccess.ts`: the tokens, imported for their side effect in `index.ts`.
- `packages/runtime/src/php/Closure.ts`: the `Closure` class (its static `Symbol.hasInstance`, the constructor refusal, registration). Also an internal `isClassConstructor` that `typeTests.ts` shares.
- `packages/runtime/src/php/Generator.ts`, `traverse.ts`: the static `Symbol.hasInstance`. Internal sites keep their meaning.
- `packages/runtime/src/php/typeTests.ts`: `is_array`, `is_object`, `is_string`, `is_iterable`, `is_callable`, `is_a`.
- `packages/runtime/src/php/sprintf.ts`: `sprintf`, a port of `php_formatted_print`.
- `packages/runtime/src/php/stringFunctions.ts`: `implode`, `explode`.
- `packages/runtime/src/php/arrayFunctions.ts`: `array_map`, `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`, `count`, `COUNT_NORMAL`, `COUNT_RECURSIVE`, `abs`. `abs` may go in a `mathFunctions.ts` instead.
- `packages/runtime/src/php/reflectionTargets.ts`, `ReflectionMethod.ts`: `isStatic` on `FoundMethod`, and `invoke`, `invokeArgs`, `setAccessible`.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: export every new name, and `get_debug_type` / `json_last_error` as aliases.
- `packages/runtime/docs/php-functions.md`, `reflection.md`: name every new export, and list the limits under **Never** and the value-model rules above.
- `packages/runtime/tests/xaravel/php-type-tests.probe.php` and `.txt`: the PHP evidence, made with `php -d error_reporting=0 php-type-tests.probe.php > php-type-tests.probe.txt`.
- `packages/runtime/tests/xaravel/php-type-tests.test.ts`:
  - XT-runtime-62: type tests and `instanceof`;
  - XT-runtime-63: `is_callable` and `is_a`;
  - XT-runtime-64: `sprintf`, `implode`, `explode`;
  - XT-runtime-65: the array functions, `count`, `abs`, the aliases;
  - XT-runtime-66: ReflectionMethod;
  - XT-runtime-67: the probe recompute and the fresh-process export check.
- `packages/contracts/tests/xaravel/runtime-tokens.test.ts`: add `ArrayAccess` to XT-contracts-22's cases, adding cases only.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-62..67 run, then each row holds and every probe label matches PHP 8.5.11.
- Given a fresh process, when the root or `@xaravel/runtime/php` loads, then every new name is exported, `resolveClass('Closure')` is `Closure`, and the classes map still has 24 entries.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-3-runtime-type-tests-functions --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 30 findings — high 0, medium 11, low 15, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` intent-alignment (a): the Collections consumer surface is untested — the intent puts `packages/collections` out of scope and says the item lands before Story 14.1 resumes, which then ports those tests.
  - `[low]` `[reject]` intent-alignment (b): `is_callable` disagrees with Reflector's `isCallableValue` on an unregistered JS class — the deliberate choice in the Boundaries section, since a JS class cannot be called without `new`. The docs record it. Reflector does not call `is_callable` yet, and a switch there needs its own review.
  - `[false]` `[reject]` intent-alignment (c): `is_string(ctor)` is false and `is_object(ctor)` is true while `is_a` / `is_callable` read a class constructor as a class-string — this is the spec's value model (`is_object` is `phpType`). `gettype` must keep its result.
  - `[medium]` `[defer]` intent-alignment (d): a bare JS generator answers `Generator` but not `Iterator` / `Traversable` — the spec's **Never** (an unruled addition). Recorded in `deferred`, and the docs list it (patched).
  - `[false]` `[reject]` intent-alignment (e): `Closure` also answers bound, async and generator functions — PHP's closures include all of them. The enum test is AD-26's own `isEnumClass`.
  - `[low]` `[defer]` intent-alignment (f): `Countable` is no recorded token, so `is_a(x,'Countable')` is false — the spec's **Never**. Recorded in `deferred`, and the docs list it (patched).
  - `[low]` `[reject]` verification-gap (other): Reflector parity on an unregistered class — the same claim as intent-alignment (b).
  - `[low]` `[defer]` blind (1): the matrix's `implode(',')`, `explode('')` and `array_key_exists` array-key messages differ from PHP 8.5.11 — the code follows PHP under the contract's "every value and message is PHP's" rule, and the probe records it. The intent contract is read-only after planning, so this is recorded in `deferred`.
  - `[medium]` `[patch]` blind (2): `is_callable([closure, '__invoke'])` is false where PHP gives true — patched. A Closure target accepts PHP's Closure methods, and probe rows were added.
  - `[medium]` `[patch]` blind (3): `callbackParameter` lets a class constructor through to a raw JS error, and labels a token as an array — patched. Both are now class-strings with the DIV-9.13 string message, and tests were added.
  - `[low]` `[defer]` blind (4): a contract token reaches `sprintf` / `implode` / `explode` / `array_key_exists` through the existing string casts, not as its class-string — fixing it changes `toPhpString` / `normalizeKey`, which the ruling forbids. Recorded in `deferred`, and the docs list it (patched).
  - `[medium]` `[patch]` blind (5): `isClassConstructor` stringifies source on every hot-path check — patched with a per-function WeakMap cache.
  - `[low]` `[reject]` blind (6): a bound or Proxy-wrapped class reads as a Closure — rare in ported code, and the fix needs call-probing or wrapper tracking, more than a direct correction.
  - `[medium]` `[patch]` blind (7): an explicit `undefined` counts as omitted in `array_keys` / `implode`, against AD-9 — patched to decide omission by argument count, with tests.
  - `[low]` `[patch]` blind (8): the literal-precision overflow message in `sprintf` is unprobed — patched with a probe row, and the docs list it.
  - `[low]` `[defer]` blind (9): `is_a(gen,'Traversable')` is false — the same root as intent-alignment (d).
  - `[medium]` `[patch]` blind (10): `array_key_exists` / `array_key_first` / `array_key_last` copy every entry — patched to direct lookups.
  - `[low]` `[patch]` blind (11): `stringFunctions.ts` imports `typeTests.ts`, and has a needless alias — patched with a local check.
  - `[low]` `[reject]` blind (12): `invokeArgs` checks the object twice — harmless. The first check keeps PHP's argument order.
  - `[low]` `[patch]` blind (13): untested paths (ReflectionMethod from an object, a leading-`\` and an empty-method `'C::'` callable, a non-int `Countable::count()`) — patched with probe rows.
  - `[medium]` `[patch]` edge (1): the class-constructor callback — the same root as blind (3), patched with it.
  - `[medium]` `[patch]` edge (2): `is_callable([closure,'__invoke'])` — the same root as blind (2), patched with it.
  - `[low]` `[reject]` edge (3): a bound class reads as a Closure — the same as blind (6).
  - `[low]` `[patch]` edge (4): the `invokeArgs` `$args` TypeError does not name a token or class as `string` — patched.
  - `[medium]` `[patch]` edge (5): `invokeArgs` passes `undefined` elements on, so JS defaults fire — patched with `?? null`.
  - `[medium]` `[patch]` edge (6): `Generator`'s `Symbol.hasInstance` narrows a bare JS generator to the wrapper type — patched with a type predicate over both.
  - `[false]` `[reject]` edge (7): `is_a(cls,'UnitEnum',true)` misses a brand-carrying class — no class carries an enum brand. AD-26 enums are recognised by `cases`, and the enum tokens have no brand users.
  - `[medium]` `[patch]` fidelity reviewer 1, F-7 `php-type-tests.test.ts`: XT-runtime-67 claims cross-entry identity in a fresh process, but checks it only in the parent — patched. One child imports both entries and compares every new export by identity.
  - `[low]` `[reject]` intent-alignment (g): the ReflectionMethod extras (the `?object` TypeError, the without-an-object message, the named-argument limit) are PHP's own behaviour, probed, or a documented limit.
  - `[low]` `[reject]` intent-alignment (h): the done checks run outside the diff — they are this workflow's Finalize step.

### 2026-10-26 — Review pass (Finalize re-check, iteration 1)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The Fidelity Review re-ran on the patched tree `17ab46f1aaf54844ded3547f9f7b2f6e63d6b938`, and both reviewers passed.

## Design Notes

- **A class constructor is not a Closure.** AD-9 and DIV-12.19 make a class value stand for its class-string, and Reflector already treats a registered class that way. A JS class cannot be called without `new`, so PHP's `Closure`, which is always callable, cannot be one. A plain or bound function, an async function and a generator function are all Closures, as in PHP. A native JS constructor such as `Map` reads as a function; the docs note that.
- **Enum tokens.** An AD-26 case carries no brand, so the two enum tokens answer through an instance test (`isEnumCase`, plus `backingType` for `BackedEnum`), not the brand. `hasBrand(case, UnitEnum)` therefore stays false, and the docs say so.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts`: all pass.
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-type-tests.probe.php | diff - php-type-tests.probe.txt`: no output.
- `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime`: clean.
- `bun run harness`: `differ=0`.

## Fidelity Review

### Reviewer 1: reject at tree 31762fa007906513c4f0d1b872aadc9d8bd810b7

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b`, on 2026-10-26T12:18:57.645Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the changed assertions and PHP probe expectations. Existing expectations remain unchanged; new PHP cases use exact recorded values and exception messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared each Xaravel Test body and its helpers with its consequence. XT-runtime-67 does not fully check its fresh-process identity claim. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementation responsibilities with the runtime/contracts scope and ESC-14.1-9/10. The change implements authorized runtime builtins and token tests without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and retained tags with AD-6 and DIV-1. The new implementations are synchronous and introduce no IO or permitted async-callback root requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-type-tests.test.ts`: XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"31762fa007906513c4f0d1b872aadc9d8bd810b7","base":"af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T12:18:57.645Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed assertions and PHP probe expectations. Existing expectations remain unchanged; new PHP cases use exact recorded values and exception messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared each Xaravel Test body and its helpers with its consequence. XT-runtime-67 does not fully check its fresh-process identity claim.","findings":[{"path":"packages/runtime/tests/xaravel/php-type-tests.test.ts","detail":"XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementation responsibilities with the runtime/contracts scope and ESC-14.1-9/10. The change implements authorized runtime builtins and token tests without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and retained tags with AD-6 and DIV-1. The new implementations are synchronous and introduce no IO or permitted async-callback root requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 31762fa007906513c4f0d1b872aadc9d8bd810b7

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b`, on 2026-10-26T12:18:57.645Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only tests touched are Xaravel Tests (XT-contracts-22, XT-runtime-62..67), so there is no Upstream assertion to match. |
| F-2: No expected value is weakened | pass | No Ported Test is changed. In the one changed existing Xaravel Test, XT-contracts-22, a single ArrayAccess case is added to the cases table. Every existing case and assertion is unchanged, and the new case runs through the same exact assertSame checks. Nothing is loosened or adjusted to fit Xaravel's output, and no stale_tests file is involved. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test, so there are no Upstream assertions to count. The XT-contracts-22 diff removes no assertion. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no '// adapted:DIV-<n>.<k>' markers and no Expectations 'adapted' fields in the change. DIV-9.13 and DIV-9.14 are cited only in comments and docs, as rules the runtime follows, not as adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No assigned Oracle request exists and no fixture is changed (evidence (c) lists none). The expected values come from a committed PHP probe record, not from Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each consequence string was compared with its test body. XT-runtime-62 covers the type-test probe labels (types, is_iterable), the instanceof labels for Closure, enum, ArrayAccess and Generator, new_closure and interface_exists for the three tokens, plus the Xaravel-only checks that a class constructor or token stands for its class-string. XT-runtime-63 covers the is_a and is_callable labels, including callable names, and DIV-9.14's 'strlen' edge. XT-runtime-64 covers the sprintf, implode and explode labels with their error messages. XT-runtime-65 covers the array-function labels, count, abs and aliases, and checks the alias identity with assertSame. XT-runtime-66 covers reflection.invoke and reflection.errors and the named-argument JS TypeError. XT-runtime-67 recomputes every probe label, checks the label set matches PROBE_CASES, and runs a fresh-process export check that resolves Closure and confirms the 24-entry classes map. XT-contracts-22 adds ArrayAccess to its equivalence table, matching its updated consequence string. None of the consequence strings cites an FR-<n>.<k> or AD-<n>.<k> token; AD-26 and AD-9 appear bare and are consistent with what the tests check. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are confined to packages/runtime, the item's own component. The only packages/contracts change is the XT-contracts-22 test file, which is in scope. No stub, fake or hard-coded return stands in for another Component. Countable gets no token, which is documented as not ported, rather than faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows that no changed source file holds an @​asyncRoot tag. Every new export is synchronous: the type tests, sprintf, implode, explode, the array functions, count, abs, Closure, the tokens, and ReflectionMethod's invoke, invokeArgs and setAccessible. None returns a Promise or performs IO, and the callbacks array_map and invoke accept are invoked synchronously, so no tag is needed and none is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"31762fa007906513c4f0d1b872aadc9d8bd810b7","base":"af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T12:18:57.645Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only tests touched are Xaravel Tests (XT-contracts-22, XT-runtime-62..67), so there is no Upstream assertion to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is changed. In the one changed existing Xaravel Test, XT-contracts-22, a single ArrayAccess case is added to the cases table. Every existing case and assertion is unchanged, and the new case runs through the same exact assertSame checks. Nothing is loosened or adjusted to fit Xaravel's output, and no stale_tests file is involved.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test, so there are no Upstream assertions to count. The XT-contracts-22 diff removes no assertion.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no `// adapted:DIV-<n>.<k>` markers and no Expectations `adapted` fields in the change. DIV-9.13 and DIV-9.14 are cited only in comments and docs, as rules the runtime follows, not as adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"No assigned Oracle request exists and no fixture is changed (evidence (c) lists none). The expected values come from a committed PHP probe record, not from Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Each consequence string was compared with its test body. XT-runtime-62 covers the type-test probe labels (types, is_iterable), the instanceof labels for Closure, enum, ArrayAccess and Generator, new_closure and interface_exists for the three tokens, plus the Xaravel-only checks that a class constructor or token stands for its class-string. XT-runtime-63 covers the is_a and is_callable labels, including callable names, and DIV-9.14's 'strlen' edge. XT-runtime-64 covers the sprintf, implode and explode labels with their error messages. XT-runtime-65 covers the array-function labels, count, abs and aliases, and checks the alias identity with assertSame. XT-runtime-66 covers reflection.invoke and reflection.errors and the named-argument JS TypeError. XT-runtime-67 recomputes every probe label, checks the label set matches PROBE_CASES, and runs a fresh-process export check that resolves Closure and confirms the 24-entry classes map. XT-contracts-22 adds ArrayAccess to its equivalence table, matching its updated consequence string. None of the consequence strings cites an FR-<n>.<k> or AD-<n>.<k> token; AD-26 and AD-9 appear bare and are consistent with what the tests check.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes are confined to packages/runtime, the item's own component. The only packages/contracts change is the XT-contracts-22 test file, which is in scope. No stub, fake or hard-coded return stands in for another Component. Countable gets no token, which is documented as not ported, rather than faked.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows that no changed source file holds an @asyncRoot tag. Every new export is synchronous: the type tests, sprintf, implode, explode, the array functions, count, abs, Closure, the tokens, and ReflectionMethod's invoke, invokeArgs and setAccessible. None returns a Promise or performs IO, and the callbacks array_map and invoke accept are invoked synchronously, so no tag is needed and none is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 17ab46f1aaf54844ded3547f9f7b2f6e63d6b938

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b`, on 2026-10-26T12:28:43.677Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are assigned, added or changed. |
| F-2: No expected value is weakened | pass | Existing assertions retain their expected values and comparison strength. New PHP probe comparisons check exact serialized values, including exception classes and messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are subject to removal; the existing Xaravel Test assertions remain intact. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The touched Xaravel Tests check their declared consequences through exact PHP probe comparisons and targeted assertions. XT-runtime-67 now compares both entry points by identity within the same fresh child process. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the authorized runtime and contracts scope. The builtins implement runtime behavior authorized by ESC-14.1-9 and ESC-14.1-10, with no substitute implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations remain synchronous and contain no asyncRoot tags. Their implementations introduce neither IO roots nor callbacks required to be async under DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-type-tests.test.ts`: XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked. **fixed**: XT-runtime-67's child imports both entry points and checks every NEW_EXPORTS value for presence and cross-entry identity, matching its consequence.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"17ab46f1aaf54844ded3547f9f7b2f6e63d6b938","base":"af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T12:28:43.677Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are assigned, added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Existing assertions retain their expected values and comparison strength. New PHP probe comparisons check exact serialized values, including exception classes and messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are subject to removal; the existing Xaravel Test assertions remain intact.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The touched Xaravel Tests check their declared consequences through exact PHP probe comparisons and targeted assertions. XT-runtime-67 now compares both entry points by identity within the same fresh child process.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within the authorized runtime and contracts scope. The builtins implement runtime behavior authorized by ESC-14.1-9 and ESC-14.1-10, with no substitute implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations remain synchronous and contain no asyncRoot tags. Their implementations introduce neither IO roots nor callbacks required to be async under DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-type-tests.test.ts","detail":"XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked.","fixed":true,"note":"XT-runtime-67's child imports both entry points and checks every NEW_EXPORTS value for presence and cross-entry identity, matching its consequence."}]}
```

### Reviewer 2: pass at tree 17ab46f1aaf54844ded3547f9f7b2f6e63d6b938

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b`, on 2026-10-26T12:28:43.677Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; all tests changed are Xaravel Tests. |
| F-2: No expected value is weakened | n/a | No Ported Test is changed. In the touched Xaravel Tests no expected value is loosened: XT-contracts-22 only adds an ArrayAccess case, and php-functions.test.ts's pairs helper keeps its behaviour (it now tests the wrapper class directly). No stale_tests path. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion count applies. No assertion is removed from the touched Xaravel Tests. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker or Expectations adapted field is added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is assigned or relied on; evidence (c) lists no error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-62..66 each check their probe labels against PHP 8.5.11's recorded output plus the Xaravel-only cases their descriptions name: the instanceof targets and the three recorded tokens (interface_exists), is_a/is_callable, sprintf/implode/explode, the array functions with count and abs, the aliases, and ReflectionMethod invoke/invokeArgs/setAccessible. XT-runtime-67 recomputes every probe label, checks label-set equality, and in one fresh child imports both entries, compares every NEW_EXPORTS name by identity, and checks resolveClass('Closure'), the alias identities and the 24-entry map. XT-contracts-22 adds ArrayAccess to its cases and its description. No FR/AD.k ids are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are confined to packages/runtime (src, docs, tests) and one packages/contracts test, both in the item's scope. Every export added is what ESC-14.1-9/10 assign to the runtime. The runtime imports no contracts, and nothing stubs another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed file. Every new export (type tests, array/string/math functions, sprintf, Closure, the tokens, ReflectionMethod.invoke/invokeArgs/setAccessible) is synchronous: none performs IO, accepts a DIV-1 async callback, or returns a Promise. So no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-type-tests.test.ts`: XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked. **fixed**: XT-runtime-67 now runs one fresh child that imports both src/index.ts and src/php/index.ts. It filters NEW_EXPORTS for any name that is undefined in p or where r[n] !== p[n], and checks resolveClass('Closure') === p.Closure, the get_debug_type/json_last_error alias identities in both entries, and the classes-map size. It asserts output 'all true true 24'. Cross-entry identity is now checked in the fresh process, as the description claims.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"17ab46f1aaf54844ded3547f9f7b2f6e63d6b938","base":"af5b9bd90f11ebeea7f2424adbf58f10f34a2d4b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T12:28:43.677Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; all tests changed are Xaravel Tests.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is changed. In the touched Xaravel Tests no expected value is loosened: XT-contracts-22 only adds an ArrayAccess case, and php-functions.test.ts's pairs helper keeps its behaviour (it now tests the wrapper class directly). No stale_tests path.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion count applies. No assertion is removed from the touched Xaravel Tests.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker or Expectations adapted field is added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is assigned or relied on; evidence (c) lists no error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-62..66 each check their probe labels against PHP 8.5.11's recorded output plus the Xaravel-only cases their descriptions name: the instanceof targets and the three recorded tokens (interface_exists), is_a/is_callable, sprintf/implode/explode, the array functions with count and abs, the aliases, and ReflectionMethod invoke/invokeArgs/setAccessible. XT-runtime-67 recomputes every probe label, checks label-set equality, and in one fresh child imports both entries, compares every NEW_EXPORTS name by identity, and checks resolveClass('Closure'), the alias identities and the 24-entry map. XT-contracts-22 adds ArrayAccess to its cases and its description. No FR/AD.k ids are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are confined to packages/runtime (src, docs, tests) and one packages/contracts test, both in the item's scope. Every export added is what ESC-14.1-9/10 assign to the runtime. The runtime imports no contracts, and nothing stubs another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed file. Every new export (type tests, array/string/math functions, sprintf, Closure, the tokens, ReflectionMethod.invoke/invokeArgs/setAccessible) is synchronous: none performs IO, accepts a DIV-1 async callback, or returns a Promise. So no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-type-tests.test.ts","detail":"XT-runtime-67 claims a fresh process exports every new name from both entry points as the same object. Each child imports only one entry point and checks presence; cross-entry identity is checked only in the parent process. Import both entry points in the same fresh child and compare every NEW_EXPORTS value by identity, or narrow the consequence to what is checked.","fixed":true,"note":"XT-runtime-67 now runs one fresh child that imports both src/index.ts and src/php/index.ts. It filters NEW_EXPORTS for any name that is undefined in p or where r[n] !== p[n], and checks resolveClass('Closure') === p.Closure, the get_debug_type/json_last_error alias identities in both entries, and the classes-map size. It asserts output 'all true true 24'. Cross-entry identity is now checked in the fresh process, as the description claims."}]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime` (the root and `/php`) gains:
- PHP's type tests `is_array`, `is_object`, `is_string`, `is_iterable`, `is_callable` and `is_a`;
- the `instanceof` targets `Closure` (a class), `UnitEnum`, `BackedEnum` and `ArrayAccess` (tokens);
- `sprintf`, `implode`, `explode`, `array_map`, `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`, `count` (with `COUNT_NORMAL` / `COUNT_RECURSIVE`) and `abs`;
- `get_debug_type` and `json_last_error` as aliases (ESC-14.1-9);
- `Generator`, which also answers a bare JS generator object.

`ReflectionMethod` gains `invoke`, `invokeArgs` and the no-op `setAccessible` (ESC-14.1-10).

**Files.**
- `packages/runtime/src/php/`:
  - New: `typeTests.ts`, `sprintf.ts` (a port of `php_formatted_print`), `mathFunctions.ts`, `Closure.ts`, `UnitEnum.ts`, `BackedEnum.ts`, `ArrayAccess.ts`.
  - Extended: `arrayFunctions.ts`, `stringFunctions.ts`, `phpInterface.ts` (an optional instance test), `classExistence.ts` (`isEnumCase`, `isBackedEnumClass`), `Generator.ts` / `traverse.ts` (`Symbol.hasInstance`, and `isGeneratorObject` for the internal sites), `reflectionTargets.ts` (`isStatic`), `ReflectionMethod.ts`, `index.ts`.
- `packages/runtime/src/index.ts`: the exports.
- `packages/runtime/docs/php-functions.md`, `reflection.md`: every export and every limit.
- `packages/runtime/tests/xaravel/php-type-tests.{test.ts,probe.php,probe.txt}`: XT-runtime-62..67 and the PHP 8.5.11 probe.
- `php-functions.test.ts`: only its `pairs()` helper's type check; no assertion changed.
- `packages/contracts/tests/xaravel/runtime-tokens.test.ts`: an `ArrayAccess` case added to XT-contracts-22.

**Review.** 30 findings in pass 1.
- Patched: 12 entries from 14 rows (medium 8, low 4).
- Deferred: 4 entries from 5 rows, recorded in `deferred`.
- Rejected: 11, each with its reason in the triage log.

Fidelity Review:
- First tree `31762fa0`: reviewer 1 rejected on F-7 (XT-runtime-67's identity claim), reviewer 2 passed.
- Patched tree `17ab46f1`: both passed, and the status is `current`.

**Follow-up review recommended: true.** Pass 1 patched eight medium entries. The unverified risk is the key-lookup rewrite of `array_key_exists`, `array_key_first` and `array_key_last`, a direct lookup per AD-9 form. Existing probe rows cover it, but no test runs it over a `PhpArray` with int-like string keys beside a JS-array fallback. Story 14.1's `Arr::exists` tests will run it hard.

**Verification.**
- `bun test packages/runtime packages/contracts`: 89 pass.
- The probe re-runs byte for byte with the host's `php` 8.5.11.
- `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` are clean.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `bun run fidelity:review status --item epic-14-item-3-runtime-type-tests-functions --spec <this spec>`: `current`.

**Residual risks.**
- The deferred items: a bare generator is no `Traversable`, `Countable` has no token, a token through the string casts is not a class-string, and the matrix wording.
- `is_callable` reads an unregistered JS class as a class-string, where Reflector's `isCallableValue` treats it as callable. This matters if Reflector later switches to `is_callable`.
