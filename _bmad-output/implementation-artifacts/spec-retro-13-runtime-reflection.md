---
title: 'PHP reflection, Spec values, returns and attributes in @xaravel/runtime (epic-13-item-1-runtime-reflection)'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: 'e6c5bc7dbcf06233f5370aec344fa8b884bba75d'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-25-story-13-1.md'
  - '{project-root}/decisions/DIV-3.md'
  - '{project-root}/decisions/DIV-12.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A contract token's FQCN string does not resolve through ReflectionClass, so a line-for-line
      Reflector::isParameterSubclassOf fails for a token-typed parameter.
    evidence: |-
      ReflectionNamedType.getName() gives the token's FQCN; new ReflectionClass(<that string>) looks it up in the Class
      Registry, which holds classes only (ESC-10.1-3: a token is never registered), and throws ReflectionException.
      Story 13.1 can port testParameterSubclassOfInterface's IA / IB as registered classes, or raise a contract
      Escalation for a token lookup.
    location: >-
      packages/runtime/src/php/reflectionTargets.ts (reflectionTarget)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 13.1 (`Reflector`, `ReflectsClosures`) is ruled to port line for line over PHP reflection classes, new Spec values, closure return declarations and class attributes (DIV-3.2-3.4, DIV-12.15), none of which exist. The Story may not edit `packages/runtime`, so the Maintainer routed the runtime half to this action item (`decisions/MAINT-2026-10-25-story-13-1.md`, route step 1).

**Approach:** Add to `@xaravel/runtime`: the Spec values `primitive`, `variadic(spec)`, `oneOf(...)`, `allOf(...)` and markers `self`, `parent`, `static` beside `inject`; `returns(spec, fn)` / `readReturnMetadata(fn)`; and in `@xaravel/runtime/php` PHP's `ReflectionClass`, `ReflectionMethod`, `ReflectionFunction`, `ReflectionParameter`, `ReflectionNamedType`, `ReflectionUnionType`, `ReflectionIntersectionType`, `ReflectionAttribute`, `ReflectionException`, `Attribute` and the `attribute(X, ...args)` class decorator, each limited to what `Reflector`, `ReflectsClosures` and their tests call. XT-runtime-44..47 pin them.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT 2026-10-22 amendment).
- One public class per file at `src/php/<PhpName>.ts`, each ending `registerClass('<PhpName>', X)`; messages are PHP 8.5's exactly (checked against `php` 8.5.11, the Oracle's version). Everything sync; `null` the only absent value, except where PHP returns `false` (`getParentClass()`).
- Members read parameters only from `readInjectMetadata` (key = parameter, in order; value = Spec) and return hints only from `readReturnMetadata`.
- New exports are named in `docs/` (XT-runtime-37) and listed in `export { … } from` form.

**Never:**
- Change any existing runtime behaviour, the `Symbol.for('xaravel.php.classes')` map (XT-runtime-35 pins its 24 entries; the new classes are registered but not added), `inject`'s validation, another package, `conformance/**`, `tools/**`, or the item's `action` / `owner` / `epic`.
- Read `Function.prototype.toString()`, use a `Proxy`, or port `ReflectionEnum`, `lazy` / `proxy` (DIV-12.14) or `isCallable` (the Story's).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Named class | `@inject({ x: A }) f(x)`, `new ReflectionClass(B).getMethod('f').getParameters()[0]` | `getName()` `x`; `getType()` `ReflectionNamedType`, `getName()` `fqcn(A)`, `isBuiltin()` false; `getDeclaringClass().getName()` `fqcn(B)`; `isVariadic()` false | — |
| Token | `{ x: Arrayable }` | named type `Illuminate\Contracts\Support\Arrayable`, not builtin | — |
| Builtins | `String`, `Number`, `Boolean`, `primitive` | named `string`, `float`, `bool`, `mixed`; builtin | — |
| Relative | `self`, `parent`, `static` markers | named `self` / `parent` / `static`, not builtin (Reflector resolves) | — |
| Union / DNF | `oneOf(A, String)`, `oneOf(allOf(I, J), A)` | `ReflectionUnionType`, `getTypes()` in order; a nested `allOf` is a `ReflectionIntersectionType` | `oneOf` / `allOf` with < 2 members, a nested `oneOf` or `variadic`, `allOf` of a non-class: `TypeError` `oneOf(): …` |
| Variadic | `{ vars: variadic(A) }` | `isVariadic()` true, `getType()` named `A` | `variadic()` of a missing, `null` or `variadic` Spec: `TypeError` |
| Closure | `inject({}, fn)`; `inject({ a: primitive, b: A }, fn)` | `[]`; two parameters, `getDeclaringClass()` null | — |
| Undeclared | function or method with no `inject` | — | `getParameters()` throws `RuntimeException` naming `inject({ <param>: <Spec> }, fn)` (function) or `@inject({ <param>: <Spec> })` (method) (DIV-3.3) |
| Unknown Spec | `{ x: 5 }` | — | `getType()` throws `TypeError` |
| Returns | `returns(A, fn)`, `returns(oneOf(A, String), fn)`, `returns(allOf(I, J), fn)`, `returns(self, fn)`, none | `getReturnType()` named / union / intersection / named `self`; `null` without one; `returns` gives `fn` itself and coexists with `inject` | `null` / `undefined` Spec, `variadic`, or non-function: `TypeError` `returns(): …` |
| Class lookup | `new ReflectionClass(X | instance | 'Fqcn' | token)` | `name` / `getName()` the FQCN; `getParentClass()` a `ReflectionClass` or `false`; `isSubclassOf(T)` per Design Notes | missing class `ReflectionException` `Class "X" does not exist`; `getMethod('m')` missing `ReflectionException` `Method X::m() does not exist` |
| Attributes | `@attribute(StrAttr, 'quick') @attribute(StrAttr, 'brown') class C extends P` | `new ReflectionClass(C).getAttributes(StrAttr)` own entries in source order (instanceof filter, DIV-12.15); `newInstance()` builds `new StrAttr('quick')` each call; parent's entries not inherited; no filter gives all | non-class `X` or non-class target: `TypeError` |
| Attribute checks | `newInstance()` on an attribute class without `@attribute(Attribute, …)`; targets lacking `TARGET_CLASS`; repeated without `IS_REPEATABLE`; flags outside 0..255 | — | PHP `Error`: `Attempting to use non-attribute class "X" as attribute`, `Attribute "X" cannot target class (allowed targets: method, property)`, `Attribute "X" must not be repeated`, `Invalid attribute flags specified` |

</intent-contract>

## Code Map

- `packages/runtime/src/metadata/inject.ts` -- `METADATA`, `ownMetadata`, `store`, `readInjectMetadata`; reuse `METADATA` / `ownMetadata` for `returns` (export them internally, behaviour unchanged).
- `packages/runtime/src/index.ts`, `src/php/index.ts` -- `export { … } from` lists; the root mirrors php's exports.
- `packages/runtime/src/registry/registry.ts` -- `fqcn`, `resolveClass` (throws PHP `Error` on miss: catch and rethrow as `ReflectionException`), `isContractToken`; `src/php/hasBrand.ts` for class-implements-token.
- `packages/contracts/src/Contract.ts:36-41` (read-only) -- token parents at `Symbol.for('xaravel.contract.parents')`, brand `Symbol.for(fqcn)`; the runtime reads the symbols, never imports contracts.
- `packages/runtime/src/php/Exception.ts`, `RuntimeException.ts`, `Error.ts` -- base classes and templates.
- `packages/runtime/docs/traits-and-inject.md` § `Symbol.metadata` and `inject`; `docs/exceptions.md`; `README.md` § Documentation -- docs; `tests/xaravel/docs.test.ts` (XT-runtime-37) needs every export in backticks and every page linked.
- `packages/runtime/tests/xaravel/inject.test.ts` -- XT style; highest id is XT-runtime-43 (`exceptions.test.ts`).
- Upstream (read-only): `conformance/upstream/framework/src/Illuminate/Reflection/Reflector.php`, `Traits/ReflectsClosures.php`, `tests/Support/SupportReflector*Test.php`, `SupportReflectsClosuresTest.php`, `Fixtures/ClassesWithAttributes.php`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/metadata/specs.ts` -- `primitive`, `self`, `parent`, `static` (exported as `static` from a `static_` binding), `variadic`, `oneOf`, `allOf` as frozen null-prototype descriptors under a private brand, plus internal `specOf(value)` -- DIV-3.2/3.3/3.4.
- `packages/runtime/src/metadata/returns.ts` -- `returns(spec, fn)` and `readReturnMetadata(fn)` under `Symbol.for('xaravel.returns')` in `fn`'s own metadata -- DIV-3.4.
- `packages/runtime/src/php/Reflection{Class,Method,Function,Parameter,NamedType,UnionType,IntersectionType,Attribute,Exception}.ts`, `Attribute.ts`, `attributes.ts` (decorator + own-list reader) -- per the matrix.
- `packages/runtime/src/index.ts`, `src/php/index.ts` -- exports.
- `packages/runtime/docs/reflection.md` (new, linked from README), `traits-and-inject.md` -- the Spec values and `returns`, the reflection classes and attributes, and their limits.
- `packages/runtime/tests/xaravel/reflection.test.ts` -- XT-runtime-44 (Spec values), -45 (`returns`), -46 (reflection over `inject`), -47 (attributes), covering every matrix row.

**Acceptance Criteria:**
- Given SupportReflectorTest's and SupportReflectsClosuresTest's fixtures written under DIV-3.1-3.4 and DIV-12.15, when XT-runtime-46/47 reflect them, then each member returns what PHP 8.5's reflection returns for the Upstream fixture, the values `Reflector` / `ReflectsClosures` consume (for `B::f(parent $x)`: named `parent`, declaring class `B`, whose `getParentClass().getName()` is `fqcn(A)`; each `testReflectsClosures` and return-type closure's types; the attribute fixtures' order, arguments and per-class lists). No test re-implements `Reflector` (F-8).
- Given the change, when `bun run harness` runs in full, then no difference; `bun run typecheck`, `bun run lint`, `bun run registration:check` and `bun run async-surface --check runtime` pass.
- Given the change, when `git diff --stat` is read against the baseline, then only `packages/runtime/**` and this item's records change.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 32 findings — high 0, medium 4, low 17, false 7, maybe-false 4
- findings:
  - `[low]` `[patch]` (verification-gap) `getParentClass()` skipping an unregistered `mixin()` layer is untested — XT-runtime-46 now reflects `class X extends mixin(Base, T)` and asserts the parent is `Base`.
  - `[low]` `[patch]` (verification-gap) `findMethod`'s declaring class for a method a `mixin()` layer holds is untested — same fixture: `getMethod("m").class` and the parameter's declaring class are `X`.
  - `[low]` `[patch]` (verification-gap) token `isSubclassOf` is tested one level deep only — a grandchild token `IC extends IB` now asserts `isSubclassOf(IA)`.
  - `[low]` `[patch]` (intent) members no `Reflector` / `ReflectsClosures` / Upstream-test call site uses (`ReflectionParameter.getPosition`, `ReflectionMethod.isStatic`, `ReflectionAttribute.getArguments` / `getTarget` / `isRepeated`) exceed "limited to the members … call" — deleted with their tests and docs.
  - `[false]` `[reject]` (intent) the tests use stand-in tokens, not `@xaravel/contracts` tokens — the runtime may not import contracts (contracts depends on runtime); the stand-ins satisfy the same `isContractToken` protocol and `CONTRACT_PARENTS` key the runtime reads.
  - `[false]` `[reject]` (intent) `self` / `parent` are tested only unresolved — by DIV-3.2 the resolution is `Reflector::getTypeName`'s (Story 13.1); the tests pin both inputs it reads (the marker name and the declaring class's parent).
  - `[false]` `[reject]` (intent) `getClassAttributes`' parent walk and Collection are not exercised — they are `Reflector`'s, and testGetClassAttributes is ruled `blocked-by:collections`; the per-class lists the walk reads are pinned.
  - `[false]` `[reject]` (intent) the required checks were not observed — they run on the final tree (Auto Run Result).
  - `[false]` `[reject]` (intent) the class list goes past the six named — `ReflectionIntersectionType` (DIV-3.4's `allOf`, read by `closureReturnTypes`), `ReflectionAttribute` (DIV-12.15's entries with `newInstance()`) and `ReflectionException` (PHP's error for a missing class or method) are what the named members return or throw.
  - `[medium]` `[patch]` (blind) fixtures are registered with `registerClass` under real Upstream FQCNs (`Illuminate\Database\Eloquent\Model`, `Illuminate\Tests\Support\*`) in the base registry, which will collide with `@xaravel/database` and Story 13.1's fixtures in one bun process — moved under `XaravelFixture\Reflection\…`.
  - `[medium]` `[patch]` (blind; grouped with edge row 4) PHP-worded argument errors are thrown as the JS `TypeError`, so ported code catching PHP's `TypeError` misses them — those messages now throw PHP's `TypeError`; AD-4 / DIV misuse messages stay JS `TypeError`; docs say which.
  - `[low]` `[patch]` (blind) the test header claims every value is PHP 8.5's, but the untyped `$b` row (DIV-3.3) and the subclass-attribute row (DIV-12.15) are clauses — header and rows now cite them.
  - `[medium]` `[defer]` (blind; grouped with edge claim row) a token's FQCN string does not resolve, so a line-for-line `isParameterSubclassOf` (`new ReflectionClass($paramClassName)`) fails for a token-typed parameter — the Registry holds classes only (ESC-10.1-3: tokens are never registered); no runtime contract maps a token FQCN back to its token. Story 13.1 ports its test interfaces `IA` / `IB` as registered classes, or raises a `contract` Escalation; deferred.
  - `[low]` `[patch]` (blind) docs suggest any method can carry a return hint, but `returns` has no decorator form — docs now state the function-valued-member limit.
  - `[low]` `[reject]` (blind; grouped with edge rows 1-3 and 7) an unregistered or anonymous class reaches `fqcn()`'s "the class is not registered; end its file with registerClass(…)" `TypeError` — it fails loudly and names the fix (AD-10: every class is registered); a dedicated branch adds code for no caller.
  - `[false]` `[reject]` (blind) nullable types and `int` cannot be declared — outside the intent: AD-4's Spec list has no nullable form and `Number` is the one numeric Spec; `getName()` of `Number` is recorded in Design Notes.
  - `[low]` `[reject]` (blind) `oneOf` accepts `5`, `primitive` or duplicates that `getType()` rejects later — `getType()` throws a `TypeError` naming the Spec, so nothing passes silently; eager checks add branches no caller needs.
  - `[low]` `[patch]` (blind) `FUNCTION_KEYS` is mis-described and hides a user `static name()` / `static length()` — deleted (the function-value check already excludes JS's own keys); a `static name()` row added.
  - `[low]` `[reject]` (blind) closure `self` / `parent`, `getAttributes()` on a token, a method with both `@inject` and a return Spec, and a static `@inject` method are untested — the closure markers read as named `self` / `parent` (pinned for returns), a token has no metadata (empty list by construction), and the rest reuse the pinned readers; the mixin rows of this finding are patched above.
  - `[low]` `[reject]` (blind) the internal constructors are public and unchecked — runtime convention (PHP's own classes here take internal arguments, as `ReflectionAttribute` must be built by `getAttributes`); a private-token guard adds surface for a misuse no caller makes.
  - `[low]` `[patch]` (blind) `ReflectionMethod`'s Argument #2 message lacks `, <type> given` — appended.
  - `[maybe-false]` `[reject]` (edge 1) unregistered class in `ReflectionClass` leaks the registry `TypeError` — grouped with the blind unregistered row; it fails loudly, which would settle as low.
  - `[maybe-false]` `[reject]` (edge 2) `ReflectionMethod` on an unregistered target — same group.
  - `[maybe-false]` `[reject]` (edge 3) an unregistered class as a Spec — same group; `fqcn()`'s message names the fix.
  - `[medium]` `[patch]` (edge 4) PHP-style messages on the JS `TypeError` — grouped with the blind row, patched there.
  - `[low]` `[reject]` (edge 5) an arrow function as `getAttributes` filter throws the native `instanceof` `TypeError` — loud; a filter is a class by contract.
  - `[low]` `[reject]` (edge 6) `attribute(arrowFn)` makes `newInstance()` throw native "is not a constructor" — loud, and a PHP attribute is always a class.
  - `[maybe-false]` `[reject]` (edge 7) an unregistered attribute class breaks `getName()` / messages — same unregistered group.
  - `[low]` `[reject]` (edge 8) a subclass getter shadowing a parent method returns the parent's method — no Upstream fixture or framework class declares that shape; the fix adds a branch.
  - `[low]` `[reject]` (edge 9) a null-prototype object gives a self-contradictory `object|string, object given` — no caller reflects one; cosmetic.
  - `[low]` `[reject]` (edge 10) a class carrying `@attribute(Attribute, …)` twice uses the first — PHP rejects it at compile time; Xaravel has no such phase, and no fixture repeats it.
  - `[false]` `[reject]` (edge claim) token FQCN strings — grouped with the deferred blind row above (counted there as the deferral; this row is its duplicate).
  - (fidelity) both reviewers `pass` at tree `28d6306ca8ac4c4bdf6bed5cb1e2e423dbd13fa7`: no findings.

### 2026-10-25 — Review pass (Finalize re-check, after the patches)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings:
  - (fidelity) the patches changed the reviewed tree, so the layer ran again: both reviewers `pass` at tree `8a0e1c4a4b971166aefda1a7fe725e46b0317da0`; `status --item` prints `current`.

## Design Notes

- `self` / `parent` stay unresolved in `ReflectionNamedType.getName()`, so `Reflector::getTypeName`'s branch runs (DIV-3.2: "so the relative branch is exercised"). PHP 8.5 resolves them at compile time inside a class method but not in closures or traits; the result through `Reflector` is the same. A closure's `getDeclaringClass()` is `null` (JS keeps no class scope).
- `Number` reads as `float`, PHP's hint that accepts every JS number; only `getName()` shows it.
- `isSubclassOf(t)` (`t` a class, token, `ReflectionClass` or registered FQCN): class vs class is the strict prototype chain; class vs token is `hasBrand`; token vs token walks the token's parents; never itself. A token's FQCN string is not in the Registry, so it resolves only as a value.
- TC39 applies class decorators bottom-up (probed in Bun 1.4.3), so `attribute()` prepends to the class's own list to keep source order; it reads only an own list, never the parent's metadata.
- `Attribute` is itself an attribute class targeting classes (PHP's internal `#[Attribute(Attribute::TARGET_CLASS)]`). Flags: `TARGET_CLASS` 1 … `TARGET_CONSTANT` 64, `TARGET_ALL` 127, `IS_REPEATABLE` 128 (PHP 8.5).
- Methods: `getMethod` finds a function-valued member on the prototype chain, then on the constructor's static chain; the declaring class is the owner. A method's parameters come from its own function's `inject` map.

## Verification

**Commands:**
- `bun test packages/runtime` -- expected: all pass, XT-runtime-44..47 included
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run registration:check` and `bun run async-surface --check runtime` -- expected: ok
- `bun run harness` -- expected: `SUMMARY` with differ=0
- `bun run fidelity:review status --item epic-13-item-1-runtime-reflection --spec <this spec>` -- expected: `current`

## Fidelity Review

### Reviewer 1: pass at tree 28d6306ca8ac4c4bdf6bed5cb1e2e423dbd13fa7

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `e6c5bc7dbcf06233f5370aec344fa8b884bba75d`, on 2026-10-25T22:00:24.738Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds Xaravel Tests only; no Ported Test assertions require comparison with Inventory source lines. |
| F-2: No expected value is weakened | pass | The diff adds new runtime tests without replacing or weakening existing expected values. PHP attribute errors use exact messages and exception classes. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or existing assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-44 through XT-runtime-47 directly assert their declared Spec, return metadata, reflection and attribute consequences, including ordering, inheritance boundaries and errors. No numbered FR or AD consequence is misidentified. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to runtime, matching the action item's scope and Maintainer ruling. Test class and token fixtures supply reflection subjects without implementing Container, Reflector, Collections or Database behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied declarations and bodies introduce synchronous metadata and reflection operations, with no async roots or async callback execution requiring tags. Existing exports retain their original async implementations and tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"28d6306ca8ac4c4bdf6bed5cb1e2e423dbd13fa7","base":"e6c5bc7dbcf06233f5370aec344fa8b884bba75d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T22:00:24.738Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds Xaravel Tests only; no Ported Test assertions require comparison with Inventory source lines.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds new runtime tests without replacing or weakening existing expected values. PHP attribute errors use exact messages and exception classes.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or existing assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-44 through XT-runtime-47 directly assert their declared Spec, return metadata, reflection and attribute consequences, including ordering, inheritance boundaries and errors. No numbered FR or AD consequence is misidentified.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to runtime, matching the action item's scope and Maintainer ruling. Test class and token fixtures supply reflection subjects without implementing Container, Reflector, Collections or Database behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied declarations and bodies introduce synchronous metadata and reflection operations, with no async roots or async callback execution requiring tags. Existing exports retain their original async implementations and tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 28d6306ca8ac4c4bdf6bed5cb1e2e423dbd13fa7

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `e6c5bc7dbcf06233f5370aec344fa8b884bba75d`, on 2026-10-25T22:00:24.738Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; the only test file holds Xaravel Tests XT-runtime-44..47. |
| F-2: No expected value is weakened | n/a | No Ported Test with an Upstream expected value is added or changed; the Xaravel Tests are new and weaken no existing assertion. No stale_tests file is touched. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so there are no Upstream assertions to count; no assertion is removed anywhere in the diff. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added; the DIV-3.2-3.4/DIV-12.15 citations are in source docblocks and consequence strings only. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned or changed Oracle fixture, error or otherwise. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its body. XT-runtime-44: root exports, null-prototype frozen descriptors, map stored as given in key order, oneOf/allOf arity, oneOf nested-oneOf/variadic refusal, allOf non-class refusal, variadic missing/null/undefined/variadic refusal: all asserted. Bare AD-4 cite matches the Spec-values Rule (AD-4.3). XT-runtime-45: returns gives fn, own Symbol.metadata, coexists with inject in either order, readReturnMetadata null cases, class/builtin/null/self/static/union-in-order/intersection, TypeErrors for null/undefined/variadic/non-function: all asserted. XT-runtime-46: registration, root and php exports, fqcn naming, builtins, self/parent unresolved plus declaring class, union and DNF, variadic, closures with null declaring class, RuntimeException messages, class lookup, getParentClass, isSubclassOf, ReflectionException for missing class and method: all asserted. XT-runtime-47: source order, instanceof filter, parent's attributes excluded, newInstance builds a new object per call, the four PHP Error checks with exact messages, Attribute flags and its own TARGET_CLASS attribute: all asserted. No FR/AD.<k> token is cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/runtime (src, docs, tests), within the runtime component and the scope of MAINT-2026-10-25-story-13-1 route step 1. ReflectionIntersectionType, ReflectionAttribute and ReflectionException follow from DIV-3.4 and DIV-12.15. Contract parents are read through the shared Symbol.for protocol, without importing contracts. The test's token stand-ins and the registered 'Model' name are inert test fixtures, not stubs of another component's behaviour, and no framework source fakes another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. Every added function and method (returns, specs, attribute, the Reflection* members, findMethod, parametersOf, typeOfSpec) is synchronous, does no IO and takes no async-capable callback, so none needs a tag. The README's statement about the async surface is unchanged in substance. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"28d6306ca8ac4c4bdf6bed5cb1e2e423dbd13fa7","base":"e6c5bc7dbcf06233f5370aec344fa8b884bba75d","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T22:00:24.738Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; the only test file holds Xaravel Tests XT-runtime-44..47.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test with an Upstream expected value is added or changed; the Xaravel Tests are new and weaken no existing assertion. No stale_tests file is touched.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so there are no Upstream assertions to count; no assertion is removed anywhere in the diff.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added; the DIV-3.2-3.4/DIV-12.15 citations are in source docblocks and consequence strings only.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned or changed Oracle fixture, error or otherwise.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its body. XT-runtime-44: root exports, null-prototype frozen descriptors, map stored as given in key order, oneOf/allOf arity, oneOf nested-oneOf/variadic refusal, allOf non-class refusal, variadic missing/null/undefined/variadic refusal: all asserted. Bare AD-4 cite matches the Spec-values Rule (AD-4.3). XT-runtime-45: returns gives fn, own Symbol.metadata, coexists with inject in either order, readReturnMetadata null cases, class/builtin/null/self/static/union-in-order/intersection, TypeErrors for null/undefined/variadic/non-function: all asserted. XT-runtime-46: registration, root and php exports, fqcn naming, builtins, self/parent unresolved plus declaring class, union and DNF, variadic, closures with null declaring class, RuntimeException messages, class lookup, getParentClass, isSubclassOf, ReflectionException for missing class and method: all asserted. XT-runtime-47: source order, instanceof filter, parent's attributes excluded, newInstance builds a new object per call, the four PHP Error checks with exact messages, Attribute flags and its own TARGET_CLASS attribute: all asserted. No FR/AD.<k> token is cited.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is in packages/runtime (src, docs, tests), within the runtime component and the scope of MAINT-2026-10-25-story-13-1 route step 1. ReflectionIntersectionType, ReflectionAttribute and ReflectionException follow from DIV-3.4 and DIV-12.15. Contract parents are read through the shared Symbol.for protocol, without importing contracts. The test's token stand-ins and the registered `Model` name are inert test fixtures, not stubs of another component's behaviour, and no framework source fakes another component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. Every added function and method (returns, specs, attribute, the Reflection* members, findMethod, parametersOf, typeOfSpec) is synchronous, does no IO and takes no async-capable callback, so none needs a tag. The README's statement about the async surface is unchanged in substance.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 8a0e1c4a4b971166aefda1a7fe725e46b0317da0

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `e6c5bc7dbcf06233f5370aec344fa8b884bba75d`, on 2026-10-25T22:07:36.777Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds Xaravel Tests only; no Ported Test assertions require comparison with Inventory source lines. |
| F-2: No expected value is weakened | pass | The diff adds new runtime assertions and changes no existing expected values, comparisons or exception expectations. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or existing assertions are removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted assertion markers or Expectations adapted fields; the Xaravel Tests cite DIV clauses as their declared behavior. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-44 through XT-runtime-47 with their bodies and helpers: assertions cover Spec descriptors and validation, return metadata, reflection results and lookup, and attribute ordering, filtering, construction and errors. Their DIV citations match the supplied clauses. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the diff with the runtime scope and Maintainer ruling: implementation remains within runtime reflection and metadata. Test fixture classes and tokens supply reflection subjects without implementing Container, Reflector or ReflectsClosures behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared touched source declarations with AD-6 and DIV-1: the reflection and metadata operations are synchronous, perform no IO and do not execute async callbacks. No added or retained asyncRoot tag requires correction. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no setup or exprs inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"8a0e1c4a4b971166aefda1a7fe725e46b0317da0","base":"e6c5bc7dbcf06233f5370aec344fa8b884bba75d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T22:07:36.777Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds Xaravel Tests only; no Ported Test assertions require comparison with Inventory source lines.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds new runtime assertions and changes no existing expected values, comparisons or exception expectations.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or existing assertions are removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted assertion markers or Expectations adapted fields; the Xaravel Tests cite DIV clauses as their declared behavior.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-44 through XT-runtime-47 with their bodies and helpers: assertions cover Spec descriptors and validation, return metadata, reflection results and lookup, and attribute ordering, filtering, construction and errors. Their DIV citations match the supplied clauses.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the diff with the runtime scope and Maintainer ruling: implementation remains within runtime reflection and metadata. Test fixture classes and tokens supply reflection subjects without implementing Container, Reflector or ReflectsClosures behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared touched source declarations with AD-6 and DIV-1: the reflection and metadata operations are synchronous, perform no IO and do not execute async callbacks. No added or retained asyncRoot tag requires correction.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 8a0e1c4a4b971166aefda1a7fe725e46b0317da0

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `e6c5bc7dbcf06233f5370aec344fa8b884bba75d`, on 2026-10-25T22:07:36.777Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and no file adds or changes a Ported Test. The only test file adds Xaravel Tests XT-runtime-44 to 47, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | No Ported Test is touched, so no expected value can be weakened against Upstream. In XT-runtime-44 to 47, every PHP-facing value is an exact assertSame, and so are the error messages from PHP's TypeError, ReflectionException, RuntimeException and Error. Those values are reflection names, builtin flags, the attribute messages and the flags 1..128. The regex checks match only Xaravel's own JS TypeError messages from oneOf, allOf, variadic, returns and attribute, which have no Upstream counterpart. The rows that differ from PHP (primitive read as builtin mixed; getAttributes matching by instanceof) are the ones DIV-3.3 and DIV-12.15 describe. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | No Expectations line is set to skip, so no Skip Reason or precedence needs checking. |
| F-5: Every `adapted` marker matches its clause | pass | No // adapted:DIV-<n>.<k> marker or Expectations adapted field is added. The // DIV-3.3 and // DIV-12.15 comments in reflection.test.ts are plain comments on Xaravel Test rows, not adapted markers. They describe what DIV-3.3 (primitive read as builtin) and DIV-12.15 (instanceof filter) say. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | The evidence lists no Oracle fixture whose output is an error, either assigned or changed. The touched tests declare no id with a committed request, so no error fixture is relied on. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared each consequence string with its test body. - XT-runtime-44: checks that the root exports each Spec value; that the values are frozen and null-prototype; that inject keeps them as given and in order; and every oneOf, allOf and variadic TypeError the string lists. - XT-runtime-45: checks returns storing the Spec in fn's own metadata; coexistence with inject in either order; readReturnMetadata giving null; getReturnType for a named class, the builtins, null without one, self and static, a union in order and an intersection; and the TypeErrors. - XT-runtime-46: checks registration and the root and php exports; parameters read from inject maps (fqcn names, builtins, self and parent with their declaring class, unions and DNF, variadics, closures with a null declaring class); RuntimeException for undeclared functions and methods; class lookup, getParentClass and isSubclassOf; and ReflectionException for a missing class or method. - XT-runtime-47: checks attribute source order; the instanceof filter and that a parent's attributes are excluded; a new instance on each newInstance() call; PHP's four Error messages; Attribute's flags; and Attribute's own TARGET_CLASS attribute. The strings cite only a bare AD-4 and DIV clauses, with no FR-<n>.<k> or AD-<n>.<k> token to check against a bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/runtime (src, docs, README, tests), the item's own component. The reflection classes, Spec values, returns and attribute are what MAINT-2026-10-25-story-13-1 assigns to the runtime. ReflectionIntersectionType, ReflectionAttribute and ReflectionException are needed by the allOf intersection (DIV-3.4) and attributes (DIV-12.15) the item lists. ReflectionClass reads the contract parents through Symbol.for without stubbing @​xaravel/contracts. The token() stand-in is a test-local fixture, not framework code. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in any changed src file, and no new export is async or returns a Promise. Every reflection member and specs, returns, attributes and inject helper is synchronous. returns<F>(spec, fn) returns fn's own type F, which reaches no IO root and awaits no callback. Under AD-6's Derivation and Enforcement rules and DIV-1, no tag is needed and none is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"8a0e1c4a4b971166aefda1a7fe725e46b0317da0","base":"e6c5bc7dbcf06233f5370aec344fa8b884bba75d","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T22:07:36.777Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and no file adds or changes a Ported Test. The only test file adds Xaravel Tests XT-runtime-44 to 47, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched, so no expected value can be weakened against Upstream. In XT-runtime-44 to 47, every PHP-facing value is an exact assertSame, and so are the error messages from PHP's TypeError, ReflectionException, RuntimeException and Error. Those values are reflection names, builtin flags, the attribute messages and the flags 1..128. The regex checks match only Xaravel's own JS TypeError messages from oneOf, allOf, variadic, returns and attribute, which have no Upstream counterpart. The rows that differ from PHP (primitive read as builtin mixed; getAttributes matching by instanceof) are the ones DIV-3.3 and DIV-12.15 describe.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"pass","note":"No Expectations line is set to skip, so no Skip Reason or precedence needs checking.","findings":[]},{"id":"F-5","result":"pass","note":"No // adapted:DIV-<n>.<k> marker or Expectations adapted field is added. The // DIV-3.3 and // DIV-12.15 comments in reflection.test.ts are plain comments on Xaravel Test rows, not adapted markers. They describe what DIV-3.3 (primitive read as builtin) and DIV-12.15 (instanceof filter) say.","findings":[]},{"id":"F-6","result":"pass","note":"The evidence lists no Oracle fixture whose output is an error, either assigned or changed. The touched tests declare no id with a committed request, so no error fixture is relied on.","findings":[]},{"id":"F-7","result":"pass","note":"I compared each consequence string with its test body.\n- XT-runtime-44: checks that the root exports each Spec value; that the values are frozen and null-prototype; that inject keeps them as given and in order; and every oneOf, allOf and variadic TypeError the string lists.\n- XT-runtime-45: checks returns storing the Spec in fn's own metadata; coexistence with inject in either order; readReturnMetadata giving null; getReturnType for a named class, the builtins, null without one, self and static, a union in order and an intersection; and the TypeErrors.\n- XT-runtime-46: checks registration and the root and php exports; parameters read from inject maps (fqcn names, builtins, self and parent with their declaring class, unions and DNF, variadics, closures with a null declaring class); RuntimeException for undeclared functions and methods; class lookup, getParentClass and isSubclassOf; and ReflectionException for a missing class or method.\n- XT-runtime-47: checks attribute source order; the instanceof filter and that a parent's attributes are excluded; a new instance on each newInstance() call; PHP's four Error messages; Attribute's flags; and Attribute's own TARGET_CLASS attribute.\nThe strings cite only a bare AD-4 and DIV clauses, with no FR-<n>.<k> or AD-<n>.<k> token to check against a bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is in packages/runtime (src, docs, README, tests), the item's own component. The reflection classes, Spec values, returns and attribute are what MAINT-2026-10-25-story-13-1 assigns to the runtime. ReflectionIntersectionType, ReflectionAttribute and ReflectionException are needed by the allOf intersection (DIV-3.4) and attributes (DIV-12.15) the item lists. ReflectionClass reads the contract parents through Symbol.for without stubbing @xaravel/contracts. The token() stand-in is a test-local fixture, not framework code.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in any changed src file, and no new export is async or returns a Promise. Every reflection member and specs, returns, attributes and inject helper is synchronous. returns<F>(spec, fn) returns fn's own type F, which reaches no IO root and awaits no callback. Under AD-6's Derivation and Enforcement rules and DIV-1, no tag is needed and none is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime` now has the runtime half of Story 13.1's rulings (`decisions/MAINT-2026-10-25-story-13-1.md`, route step 1):
- the Spec values `primitive`, `self`, `parent`, `static`, `variadic(spec)`, `oneOf(...)` and `allOf(...)` beside `inject`;
- `returns(spec, fn)` and `readReturnMetadata(fn)` (DIV-3.4);
- in `@xaravel/runtime/php`, PHP's `ReflectionClass`, `ReflectionMethod`, `ReflectionFunction`, `ReflectionParameter`, `ReflectionNamedType`, `ReflectionUnionType`, `ReflectionIntersectionType`, `ReflectionAttribute`, `ReflectionException`, `Attribute` and the `attribute(X, ...args)` class decorator (DIV-3.2, DIV-3.3, DIV-12.15), limited to the members `Reflector`, `ReflectsClosures` and their tests call, with PHP 8.5.11's messages.

XT-runtime-44..47 pin them over Upstream's fixtures.

**Files changed.**
- `packages/runtime/src/metadata/specs.ts`, `returns.ts`: the Spec values, and `returns` with its reader. `inject.ts` only exports `METADATA` / `ownMetadata` internally.
- `packages/runtime/src/php/Reflection*.ts`, `Attribute.ts`, `attributes.ts`, `reflectionParameters.ts`, `reflectionTargets.ts`, `reflectionTypes.ts`: the classes, the decorator and their internal helpers.
- `packages/runtime/src/index.ts`, `src/php/index.ts`: the exports.
- `packages/runtime/docs/reflection.md` (new), `docs/traits-and-inject.md`, `README.md`: the docs.
- `packages/runtime/tests/xaravel/reflection.test.ts`: XT-runtime-44..47.

**Review.**
- Pass 1 had 32 findings.
  - Patched: 2 medium (fixtures moved off Upstream FQCNs; PHP-worded argument errors now throw PHP's `TypeError`) and 9 low (the mixin-layer and grandchild-token tests, uncalled members removed, the header's DIV citations, the `returns` docs, `FUNCTION_KEYS` removed, the Argument #2 message).
  - Deferred: 1 medium, the token-FQCN lookup.
  - Rejected, with reasons in the triage log: unregistered classes fail loudly (5 rows), nullable / `int` are outside AD-4, eager `oneOf` checks, the remaining untested shapes, public internal constructors, the arrow-function filter and decorator, getter shadowing, the null-prototype message, a repeated `Attribute`, and the intent auditor's 5 descriptive rows.
  - Both Fidelity reviewers passed.
- The Finalize re-check passed with both Fidelity reviewers `pass` on the patched tree.

**Follow-up review recommended:** false. Patched counts: high 0, medium 2, low 9. The two medium patches are a test-fixture namespace change and an error-class swap, and both are pinned by tests on the final tree.

**Verification.** On the final tree:
- `bun test packages/runtime`: 47 pass.
- `bun run typecheck`: exit 0.
- `bun run lint`: ok.
- `bun run registration:check`: ok, 53 registrations.
- `bun run async-surface --check runtime`: ok.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `bun run fidelity:review status --item epic-13-item-1-runtime-reflection`: `current`, 2 pass verdicts for tree `8a0e1c4a4b971166aefda1a7fe725e46b0317da0`.

**Residual risks.**
- Deferred to Story 13.1: a contract token's FQCN string does not resolve through `ReflectionClass`, so `isParameterSubclassOf` over a token-typed parameter needs the test interfaces ported as registered classes, or a `contract` Escalation.
- `self` / `parent` stay unresolved in `getName()` (DIV-3.2), where PHP 8.5 resolves them inside a class method; the result through `Reflector` is the same.
- `Number` reads as `float`.
