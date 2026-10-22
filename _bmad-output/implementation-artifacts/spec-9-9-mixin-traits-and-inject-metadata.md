---
title: 'Story 9.9: `mixin`, traits and `inject` metadata'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_revision: '0aa17dff6f77a0d3176353f3bad25e6a27836e80'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.9.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/ESC-9.9-1.md'
  - '{project-root}/decisions/ESC-9.9-2.md'
warnings: [oversized]
deferred:
  - summary: >-
      A wrapping method decorator stacked after @inject leaves the map on the replaced function, so readInjectMetadata on the final method returns null.
    evidence: |-
      Review pass 2026-10-21 (Blind, Edge). Whether ports stack wrapping method decorators is unknown; the Container (Epic 18) is the first reader and can settle it.
    location: >-
      packages/runtime/src/metadata/inject.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** AD-19 makes `@xaravel/runtime` the only home of `mixin()` / `classUsesRecursive()` (AD-26 Traits row) and of the `inject` metadata writer and the `Symbol.metadata` polyfill (AD-4). None exists, so no Component can port a PHP trait (`Macroable`, `SoftDeletes`, …) or declare DIV-3 injection before Container exists. Bun 1.4.3 has no native `Symbol.metadata` (probed): TC39 decorators get a `context.metadata` object, but it is never attached to the class.

**Approach:** Add `src/traits/mixin.ts` (PHP trait composition, `classUsesRecursive`, `bootTraits` / `initializeTraits` in Upstream's order) and `src/metadata/` (the polyfill and `inject` / `readInjectMetadata`), exported from the package root. Verify trait identity and boot order against signed Oracle fixtures of `conformance/oracle-requests/9.9.jsonl`, and the polyfill and `inject` with local Xaravel Tests.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, this spec, the Story's status lines (`sprint-status.yaml`, `stories/9.9.md`), `conformance/oracle-requests/9.9.jsonl` (plus the fixtures the `xaravel-oracle` bot signs for it) and the Story's own Escalations.
- Sync only (AD-6); never return `undefined` (AD-9.1). No `constructor.name`, no `JSON.stringify` in `src/`. No new package subpath: the new API is exported from the root (`src/index.ts`).
- **A trait is a registered class.** `class SoftDeletes { static bootSoftDeletes() {} initializeSoftDeletes() {} forceDelete() {} }` then `registerClass('Illuminate\\Database\\Eloquent\\SoftDeletes', SoftDeletes)`. A trait that uses traits is `class HasA extends mixin(null, Inner) { … }`.
- **`mixin(Base | null, ...traits)`** returns a new class (a "layer") that extends `Base` (or nothing, for `null`) and holds the traits' members. The layer records its base and traits under a non-enumerable symbol. A class written `class X extends mixin(Base, A, B)` resolves members as PHP does: X's own, then trait members, then `Base`'s. A trait's members are its own members plus those of the traits it uses. For each trait in order:
  - prototype methods and accessors (string and symbol keys, not `constructor`) are defined on the layer's prototype;
  - static methods, accessors and data (string keys, not `length` / `name` / `prototype`) are defined on the layer. Static data is copied with `valueCopy`, so each using class gets its own copy, as PHP gives each class its own trait statics;
  - instance property defaults are the own enumerable string properties of `Reflect.construct(trait, [])`, read once at `mixin` time. The layer's constructor calls `super(...args)` and then assigns `valueCopy(default)` for each key the instance does not already own.
  - A member reached twice from the same declaring trait (a diamond, `HasA` and `HasC` both using `Inner`) is applied once. Two different traits declaring the same method (different functions): the layer gets a method that throws `Error` with PHP's message `Trait method <B>::<m> has not been applied as <X>::<m>, because of collision with <A>::<m>` when called (`<X>` is the receiver's registered FQCN), so a class that overrides the method resolves the collision, as in PHP. Two different traits declaring the same property with different defaults: `mixin` throws `Error` naming both traits and the property.
- **`classUsesRecursive(classOrInstanceOrFqcn)`** is Laravel's `class_uses_recursive` (`Support/helpers.php:101`) over `trait_uses_recursive` (`:464`): for each class from the root ancestor down to the class, its direct traits, each followed by the traits they use, recursively, then de-duplicated by first position. Layers are not classes; trait names come from `fqcn()`, which throws for an unregistered trait (AD-10). The result is a PHP array FQCN ⇒ FQCN in AD-9 form: a plain object, or `[]` when there are none. A FQCN string is resolved with `resolveClass`.
- **`bootTraits(X)`** is Model's `bootTraits` (`Database/Eloquent/Model.php:396-426`), run at most once per class: a later call is a no-op until `clearBootedTraits(X)`. The booted record is a non-enumerable own symbol property of `X` (so a subclass boots on its own). It walks X's method table in PHP's order: X's own members, then each direct trait's table in use order (its own members, then its used traits'), then the parent class's table, the first name winning. Static methods named `boot<basename>` for any trait in `classUsesRecursive(X)` are called with `this = X`; prototype methods named `initialize<basename>` are recorded, unique, in table order. The record is stored before the boot methods run, so an instance made during boot does not boot again.
- **`initializeTraits(instance)`** boots the instance's class if it is not booted, then calls each recorded initializer on the instance, every time it is called. The host calls it once per instance, from its constructor, as Model does.
- **`clearBootedTraits(X)`** deletes X's own record, for the host's equivalent of `Model::clearBootedModels()`.
- **Polyfill.** `src/metadata/polyfill.ts` defines `Symbol.metadata` as `Symbol.for('Symbol.metadata')` when it is undefined (non-writable, non-configurable, as a native one). It imports nothing, and `src/index.ts` and every subpath index (`scope`, `registry`, `php`) import it first, so loading any runtime entry installs it.
- **`inject(map)`** is a TC39 decorator for a class (constructor) or a method (instance or static); `inject(map, fn)` stores the map on `fn` and returns `fn` itself. The map is copied once into a frozen null-prototype object, keeping key order. It is stored under `Symbol.for('xaravel.inject')` in the target's `Symbol.metadata` object: for a class, `context.metadata` (so a subclass without its own `inject` inherits it, as PHP inherits a constructor); for a method or a function, the function's own `Symbol.metadata` object. `readInjectMetadata(target)` returns that frozen map, or `null`. Invalid input throws `TypeError` naming AD-4: a map that is not a plain object, a key that is not an identifier (an integer-like key would reorder), a value that is `undefined` or `null`, or a decorator kind other than `class` / `method`.

**Never:**
- Implement `insteadof` / `as` (none of Upstream's 192 traits needs `insteadof`; `as` aliases port as a class method calling `super.<m>()`), a trait constructor, Eloquent's `#[Boot]` / `#[Initialize]` attributes (Model's own loop, Story 38.x) or a `Spec` interpretation (Container, Epic 18).
- Make `bootTraits` / `initializeTraits` frame-scoped, or keep their record in a module variable (AD-5).
- Edit `conformance/xaravel-consequences/**` or `tools/**` (the missing AD-4 consequence rows are `epic-9-item-1`, waiting on the Maintainer), `packages/assert/**`, or another Story's XT.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trait identity (XT-runtime-31) | `App\Concerns\{Inner, HasA uses Inner, HasB, HasC uses Inner, HasP}`; `Base uses HasP`; `Post extends Base uses HasA, HasB`; `Comment extends Base uses HasB, HasC, HasA`; `Reply extends Comment uses HasB`; `Plain` | `classUsesRecursive` of each class, an instance, a FQCN string and the trait `HasA` equals the Oracle's `class_uses_recursive` | unregistered trait: `fqcn()`'s `TypeError` |
| Composition (XT-runtime-31, local) | members, statics, fields, override order, `super`, diamond, collisions, `instanceof` | as in Boundaries | collision: throws only when called |
| Boot order (XT-runtime-32) | the same traits with `boot*` / `initialize*` logging `static::class`, on `Illuminate\Database\Eloquent\Model` subclasses (Oracle, via `ReflectionMethod`) and a JS host class (runtime) | boot log and initializer log equal the Oracle's, per class | — |
| Once per class / instance (XT-runtime-32, local) | two `bootTraits` calls, two instances, a subclass, `clearBootedTraits`, an instance made inside a boot method | boot methods run once per class; each instance runs each initializer once | — |
| Polyfill (XT-runtime-33) | a fresh `bun` process, before and after importing `@xaravel/runtime` (and each subpath) | `undefined` before; `Symbol.for('Symbol.metadata')` after; a decorated class has `X[Symbol.metadata]` | — |
| inject (XT-runtime-34) | `@inject({ b: Foo, a: String })` on a class, instance method, static method; `inject(map, fn)`; a subclass; an override without `inject` | the frozen map, key order `b, a`; inherited for the subclass; `null` for the override | invalid map, key, value or kind: `TypeError` |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:57-100`: `registerClass`, `fqcn` (throws for an unregistered class), `resolveClass`. The layer's statics copy must skip symbol keys, so the Registry brand `Symbol.for('xaravel.class.fqcn')` is never copied onto a layer.
- `packages/runtime/src/php/valueCopy.ts:60`: `valueCopy` (PHP value copy: arrays copied, objects shared). Use it for trait statics and instance defaults.
- `packages/runtime/src/index.ts`, `src/scope/index.ts`, `src/registry/index.ts`, `src/php/index.ts`: add the polyfill import first, and the new root exports.
- `packages/runtime/tests/xaravel/codec.test.ts:1-60`: the Oracle idiom to copy (F-10 header, dynamic import of `packages/assert/tests/xaravel/oracle-values.ts`, `oracle(id, firstExpr)`, `rawResult`, `decode`, `thrownBy`).
- `packages/runtime/tests/xaravel/json.test.ts`: the subprocess idiom (`Bun.spawnSync` with `cwd` at the package) for a fresh process.
- `tools/oracle/evaluate.php:381-407` (read-only): an XT request has no namespace prefix, so a setup statement may be `namespace App\Concerns { trait … }`. The Oracle loads Laravel's autoloader, so `\Illuminate\Database\Eloquent\Model` subclasses work without a database.
- `/tmp/xv98/fw` (Laravel at the Pin, outside the repo) and PHP 8.5.11 at `/opt/homebrew/bin/php` confirm the orders above; probes in `/tmp/xv99/*.php`. Observed: `class_uses_recursive(Reply)` = `HasP, HasB, HasC, HasA, Inner` (after Model's own traits for Model subclasses); `Comment` boots `bootHasB, bootHasC, bootInner, bootHasA, bootHasP`; `Post` (own `bootHasB`) boots `Post::bootHasB, bootHasA, bootInner, bootHasP`; `static::class` in a boot or initialize method is the booted class.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/metadata/polyfill.ts` -- the polyfill; import it first from `src/index.ts`, `src/scope/index.ts`, `src/registry/index.ts`, `src/php/index.ts`.
- `packages/runtime/src/metadata/inject.ts` -- `inject`, `readInjectMetadata` (overloads: `inject(map)` returns a decorator, `inject(map, fn)` returns `fn`).
- `packages/runtime/src/traits/mixin.ts` -- `mixin`, `classUsesRecursive`, `bootTraits`, `initializeTraits`, `clearBootedTraits`, with types that give `class X extends mixin(Base, A, B)` the instance and static members of all three.
- `packages/runtime/src/index.ts` -- root exports.
- `conformance/oracle-requests/9.9.jsonl` -- one request for XT-runtime-31 (the classes above as plain PHP classes; exprs: `class_uses_recursive` of each case) and one for XT-runtime-32 (the same traits on `Model` subclasses; a `$probe($class)` closure that invokes `bootTraits` and, on `newInstanceWithoutConstructor()`, `initializeTraits` through `ReflectionMethod`, returning `[bootLog, initLog]`, for `Post`, `Comment`, `Reply`). Check each against local `evaluate.php` before pushing.
- `packages/runtime/tests/xaravel/traits.test.ts` -- XT-runtime-31 and XT-runtime-32 against the fixtures, plus the local rows of the matrix.
- `packages/runtime/tests/xaravel/inject.test.ts` -- XT-runtime-33 (subprocess) and XT-runtime-34.
- `packages/runtime/docs/` -- a page on traits and `inject`: the trait form, the composition rules, the `super` rule (inside a trait method, `super` is the trait's own parent; port `parent::m()` by naming the using class's parent), field defaults being assigned after the base constructor returns (as JS class fields), and the limits in Never.
- `packages/runtime/async-surface.json` -- `bun run async-surface runtime`; it stays empty.
- Follow-up (`decisions/ESC-9.9-2.md`, DIV-12.8): `packages/runtime/src/traits/mixin.ts` -- for a trait default whose key the instance already owns, replace the value only when `propertyTable(Base)` lists a public or protected property of that name and the value is `identical` to its declared default; otherwise keep it. The header comment states the rule and cites ESC-9.9-2 and DIV-12.8.
- Follow-up: `conformance/oracle-requests/9.9.jsonl` and `traits.test.ts` -- an XT-runtime-31 request covering four cases: a trait default against a parent default of the same name; the same with an `initialize<Trait>` writing a third value; a trait-only `$flag = false` that its initializer sets `true`; and a redeclared protected property. The fixture classes declare their property tables. Local rows pin the two DIV-12.8 cases (no table; a write equal to the declared default), citing DIV-12.8 in their consequence text, with no `adapted:` marker.
- Follow-up: `packages/runtime/docs/` -- the traits page states the trait-default rule and its two DIV-12.8 limits.

**Acceptance Criteria:**
- The four ACs of Story 9.9 (`epics.md` line 3180), each verified by its XT row in `stories/9.9.md`.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

- 2026-10-21: `decisions/ESC-9.9-1.md` (orchestrator) and `decisions/ESC-9.9-2.md` (Maintainer) are ruled. ESC-9.9-2 takes neither listed option: a trait default replaces a base property it finds still at its declared default (read from the PHP property table, ESC-9.7-1 part 1), and any other value is kept; DIV-12.8 records the two remaining cases. That rule, its Oracle request and its docs are added as follow-up tasks, so the Story is back to `in-progress`. The Fidelity Review runs on the final tree.
- 2026-10-21, implementation. (1) XT-runtime-31's classes are `App\Plain\{Base, Post, Comment, Reply, Plain}`, not `App\Models\*`: `registry.test.ts` already registers `App\Models\Post`, and registrations are process-wide. Trait FQCNs (`App\Concerns\*`), the only names in the results, are unchanged. XT-runtime-32's classes are `App\Eloquent\*`. (2) The conformance harness freezes `Symbol` before tests load (`conformance/harness/intrinsics.ts`), so the polyfill now installs only when `Object.isExtensible(Symbol)`, and `inject` reads `Symbol.metadata ?? Symbol.for('Symbol.metadata')`. Without the guard, every runtime test file failed at import under the harness. XT-runtime-33 checks the polyfill in fresh processes. The in-harness gap is ESC-9.9-1 (`protected-path`).
- 2026-10-21, follow-up implementation (ESC-9.9-2). (1) `assignDefaults` replaces an owned key only when `propertyTable(Base)` lists it as public or protected and the value is `identical` to its declared default (`holdsBaseDefault`). (2) The new XT-runtime-31 request (`App\Defaults\*`, traits `App\Concerns\{SetsName, WritesName, Flags, Unguards}`) gives each base its own constructor calling a namespaced `initialize()`, not an inherited `Host` constructor: a JS subclass's fields are set only after its parent's constructor returns, so the JS host that calls `initializeTraits` must be the class declaring the fields, and the request mirrors that. `oracle()` in `traits.test.ts` now selects a request by its first expr. (3) Per ESC-9.9-1's ruling, XT-runtime-33 also asserts `Symbol.metadata` in-process, and the polyfill and docs comments no longer say the harness skips it.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 39 findings — high 0, medium 8, low 22, false 7, maybe-false 2
- findings:
  - Intent alignment:
    - `[low]` `reject` AC3 is met only in a fresh process. Under the harness, `Symbol` is frozen. — Known and escalated as ESC-9.9-1 (`protected-path`). The fix is a Protected harness change, not this Story's.
    - `[false]` `reject` AC2 uses Upstream order, not "trait order". — AD-26 binds "run as Upstream", and the Oracle fixture pins that order. The choice is recorded in Design Notes.
    - `[false]` `reject` "Once per instance" sits with the host, not the helper. — This is Model's design (`initializeTraits` has no guard). It is recorded in Boundaries.
    - `[low]` `reject` The Oracle fixtures were absent at review time. — The bot committed them (98d96fa). XT-runtime-31/32 now pass against them.
    - `[false]` `reject` Composition and validation go beyond the AC text. — AD-26 and AD-4 require them (the spec's Boundaries).
    - `[false]` `reject` The packaging surface. — "No new subpath" is the spec's rule, and the root exports everything.
  - Verification gap:
    - `[medium]` `patch` XT-runtime-32's local assertions ran only after `oracle(...)`. — They now run before it. The fixtures have also landed.
    - `[medium]` `patch` Collisions of static methods, accessors and static data, and `PhpArray` defaults, were untested. — Cases were added to `checkComposition()`.
    - `[low]` `reject` (other) No test covers the frozen-`Symbol` skip. — It is covered indirectly: every harness test that imports the runtime would crash without the guard.
  - Edge case:
    - `[medium]` `patch` A nested collision in a used trait was lost. — `traitMembers` now prefers the layer's composed descriptor, and a test was added.
    - `[medium]` `patch` `collision()` called `fqcn` on unregistered names and masked the collision message. — It now uses `traitName` and a guarded receiver name.
    - `[medium]` `patch` A `float(1.0)` default was judged incompatible. — `identical` now compares marked floats by value. A diamond test was added.
    - `[low]` `reject` NaN defaults are judged identical. — PHP property defaults are constant expressions, so a NaN default is unlikely. The fix would add a branch.
    - `[medium]` `patch`+escalated A base class field beats the trait's default, where PHP lets the trait win (probe: `"named"`). — The assertion that enshrined it was removed. Raised as ESC-9.9-2 (`divergence`).
    - `[low]` `reject` A base constructor cannot read trait defaults. — This is JS field timing, documented in `docs/traits-and-inject.md`.
    - `[low]` `reject` A non-constructible trait throws a raw error. — A trait is a class by the spec's rule, so this does not happen in everyday use.
    - `[low]` `patch` The static-property collision wording. — It now uses PHP's "define the same property ($x)".
    - `[low]` `reject` A static named `name`/`length`, or symbol statics, is not copied. — No Upstream trait declares them. Skipping symbol keys keeps the Registry brand from being copied.
    - `[low]` `reject` A static `initialize<Trait>` is not recorded. — No Upstream trait declares one statically. Model's convention is an instance method.
    - `[low]` `reject` A re-entrant `clearBootedTraits` during boot. — Contrived; no host does this.
    - `[low]` `reject` `inject` on a non-extensible function throws a raw `TypeError`. — It still fails loudly. A guard adds a branch for a rare case.
    - `[low]` `reject` A class decorator context with no metadata. — Only a hand-called decorator does this, and it fails loudly.
    - `[maybe-false]` `defer` A wrapping decorator stacked after `@inject` hides the map. — Whether ports stack decorators like this is unknown. Medium (unverified); deferred.
    - `[low]` `reject` A non-enumerable key is validated before it is skipped. — Maps are object literals, so this is negligible.
    - `[false]` `reject` The spec claims Bun never attaches metadata. — The fix would edit this build's spec. The code handles both cases.
  - Blind:
    - `[medium]` `patch` False incompatibility in diamond defaults (`PhpFloat`). — Same as the edge-case row; fixed.
    - `[medium]` `patch`+escalated Trait default vs parent property. — Same as the edge-case row; ESC-9.9-2.
    - `[low]` `reject` ES private members in traits. — No port writes `#x` in a trait, since PHP traits have no such privacy. Documenting it adds nothing.
    - `[low]` `reject` A trait that `extends` an ordinary class. — The spec's trait form forbids it.
    - `[low]` `reject` Trait constructors run at `mixin` time. — The spec states that defaults are read once at `mixin` time. PHP defaults are constant expressions.
    - `[low]` `patch` Collision thrower masking. — Same fix as the edge-case row.
    - `[low]` `reject` The property-collision message lacks the class name. — The layer cannot know the using class. All the other text is PHP's.
    - `[medium]` `patch` `undefined` defaults leaked (AD-9). — They are now normalised to `null`, with a test.
    - `[maybe-false]` `defer` Stacked-decorator fragility. — Same as the edge-case row; deferred.
    - `[low]` `patch` Invisible characters in `IDENTIFIER`. — Now written as escapes. Reserved words and `__proto__` are rejected as negligible.
    - `[false]` `reject` XT-runtime-33 versus ESC-9.9-1. — ESC-9.9-1 was reworded: option 2's behaviour ships, and option 1 is what is requested.
    - `[low]` `reject` The fixtures were missing. — They have landed and the tests pass.
    - `[low]` `reject` Coverage of the `TypeError` paths, an unknown FQCN and a duplicate trait. — These are simple guards and rare inputs.
    - `[low]` `reject` `Mixed<B, Ts>` drops `abstract`. — Type looseness only; no runtime harm.
    - `[false]` `reject` Artifact inconsistencies. — Statuses follow the workflow. The manifest's line is its generation line. `async-surface --all --check` ran clean.

## Design Notes

- **Upstream order over "trait order".** The AC says "in trait order"; AD-26 says boot/initialize "run as Upstream". Upstream's order is `ReflectionClass::getMethods()`'s: the class's own methods, its traits depth-first, then the parent's. That is what "trait order" means in PHP, and the Oracle fixture pins it. It differs from `classUsesRecursive` order whenever a parent has traits (`Comment`: `HasB` boots before `HasP`).
- **Copy, not class factories.** A trait stays a class so `registerClass` and `registration:check` apply unchanged. The cost is `super` inside trait bodies (documented); per-class statics and per-instance defaults come from the copy rules.
- **Once per class.** Upstream's guard is `Model::bootIfNotBooted`; the AC puts it in the helper, and `clearBootedTraits` keeps `clearBootedModels` portable.

## Verification

**Commands:**
- `bun run oracle:story check 9.9` -- expected: every request accepted.
- Local `php tools/oracle/evaluate.php /tmp/xv98/fw 8.5.11 <now> conformance/oracle-requests/9.9.jsonl` (outside-the-repo output) -- expected: no error; results match the JS side.
- `bun test packages/runtime` and `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: pass once fixtures are pulled.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run escalations:check` -- expected: clean.
- `bun run story:check 9.9` -- expected: pass after the Fidelity Review of the final tree.

## Auto Run Result

Status: in-progress
Remaining: the `xaravel-oracle` bot must sign the new XT-runtime-31 request (`bed7e992…`) after the push; until then XT-runtime-31 fails only on the missing fixture (its local rows pass, and against local `evaluate.php` output both XT-runtime-31 requests pass). Then the Fidelity Review of the final tree and `bun run story:check 9.9`.

- **Follow-up (ESC-9.9-2, DIV-12.8):** `packages/runtime/src/traits/mixin.ts` (rule and header), `conformance/oracle-requests/9.9.jsonl` (the four-case request), `packages/runtime/tests/xaravel/traits.test.ts` (Oracle comparison, two DIV-12.8 local rows, a private-slot row), `packages/runtime/docs/traits-and-inject.md` (the rule and its two limits).
- **Verification:** `bun test packages/runtime` 33/34 (XT-runtime-31: missing signed fixture only); `tsc -b`, `lint`, `graph:check`, `registration:check`, `async-surface --all --check`, `escalations:check`, `oracle:verify-fixtures`, `oracle:story check 9.9` clean.

### Earlier run (before the ESC-9.9-2 ruling)

Status (then): blocked
Blocking condition (then): ESC-9.9-2 (`divergence`: a trait default against a base class field of the same name) waits on the Maintainer (MAINT-2026-10-16: a divergence ruling is the Maintainer's). ESC-9.9-1 (`protected-path`: the harness freezes `Symbol` before the polyfill) is open as well.

- **Summary:** `mixin`, `classUsesRecursive`, `bootTraits` / `initializeTraits` / `clearBootedTraits`, the `Symbol.metadata` polyfill and `inject` / `readInjectMetadata`, exported from `@xaravel/runtime`.
- **Files:**
  - `packages/runtime/src/traits/mixin.ts`: trait composition and the boot helpers.
  - `packages/runtime/src/metadata/{polyfill,inject}.ts`: the polyfill and `inject`.
  - The `src/` index files: the exports and the polyfill import.
  - `packages/runtime/tests/xaravel/{traits,inject}.test.ts`: XT-runtime-31..34.
  - `packages/runtime/docs/traits-and-inject.md`.
  - `conformance/oracle-requests/9.9.jsonl` and its two bot-signed fixtures.
  - `conformance/escalations/ESC-9.9-1.md` and `ESC-9.9-2.md`.
- **Review:** 39 findings. 10 patched (medium 7, low 3), 1 deferred (stacked decorators, medium unverified), 28 rejected, each with its reason in the triage log.
- **Fidelity Review:** not run yet. It runs on the final tree after the Maintainer rules on ESC-9.9-2, because option 2 would change `mixin.ts`.
- **Follow-up review recommended:** true. Seven medium entries were patched, and the Fidelity Review is still to run.
- **Verification:** all clean or passing:
  - `bun test packages/runtime`: 34/34 pass against the signed fixtures.
  - `bun run harness --xaravel --id 'XT-runtime-*'`: 34/34 pass.
  - `tsc -b`, `lint`, `graph:check`, `registration:check`, `async-surface --all --check`, `escalations:check`, `oracle:verify-fixtures` and `oracle:story check 9.9`.
- **Residual risk:** inside the harness process, `Symbol.metadata` is undefined (ESC-9.9-1). The runtime reads `Symbol.for('Symbol.metadata')` there directly.
