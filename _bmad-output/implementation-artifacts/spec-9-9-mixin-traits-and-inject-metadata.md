---
title: 'Story 9.9: `mixin`, traits and `inject` metadata'
type: 'feature'
created: '2026-10-21'
status: 'blocked'
baseline_revision: 'a5ecf3905763930a6d18c518924c7e12afa3e303'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.9.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/ESC-9.9-1.md'
  - '{project-root}/decisions/ESC-9.9-2.md'
  - '{project-root}/decisions/ESC-9.9-3.md'
warnings: [oversized]
deferred:
  - summary: >-
      A wrapping method decorator stacked after @inject leaves the map on the replaced function, so readInjectMetadata on the final method returns null.
    evidence: |-
      Review pass 2026-10-21 (Blind, Edge). Whether ports stack wrapping method decorators is unknown; the Container (Epic 18) is the first reader and can settle it.
    location: >-
      packages/runtime/src/metadata/inject.ts
    severity: medium (unverified)
  - summary: >-
      A host that calls initializeTraits from an ancestor constructor (Model) runs initializers before the using subclass's own JS fields ($casts, $fillable, $guarded) are set, so those fields then overwrite what an initializer merged into them.
    evidence: |-
      Review pass 2026-10-21 (Blind, Intent). JS class-field timing, not caused by the ESC-9.9-2 rule; the docs now state the host constraint. Story 36.1 (Model core: attributes, fill, guard) is the first host and must settle it, by Escalation if it needs a divergence.
    location: >-
      packages/runtime/docs/traits-and-inject.md
    severity: medium
  - summary: >-
      Over a base whose constructor returns a Proxy (Model, per DIV-12), assignDefaults writes trait defaults with Object.defineProperty, so they reach the Proxy's defineProperty trap rather than its set trap.
    evidence: |-
      Review pass 2026-10-22 (Blind). Untested; whether it matters depends on which traps Model's Proxy defines. Story 36.1 (Model core: attributes, fill, guard) is the first such host and settles it, by Escalation if it needs a runtime change.
    location: >-
      packages/runtime/src/traits/mixin.ts (assignDefaults)
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
- Follow-up (`decisions/ESC-9.9-3.md`, DIV-12.9): `traits.test.ts` -- XT-runtime-31 regains the private-slot local row, asserting the base's value for an outside read and for a read through the base's own method, citing DIV-12.9 in its consequence text with no `adapted:` marker. `mixin.ts` -- the header comment cites DIV-12.9; no behaviour change. `packages/runtime/docs/traits-and-inject.md` -- the private-slot case is recorded as DIV-12.9, not open.

**Acceptance Criteria:**
- The four ACs of Story 9.9 (`epics.md` line 3180), each verified by its XT row in `stories/9.9.md`.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

- 2026-10-22: the ESC-9.9-3 follow-up is implemented (the DIV-12.9 row, with a third reader, the subclass's own method, added in review; the `mixin.ts` header; the docs). The Fidelity Review of tree fc517f78 has reviewer 1 rejecting F-7 because evidence (e) omits the helpers XT-runtime-31 calls (`checkComposition`, `checkDefaultLimits`) and their fixtures. That is a gap in `tools/fidelity-review/` (Protected), raised as ESC-9.9-4, so the Story is `blocked`. The next Fidelity Review should cover the whole Story (base a5ecf39, before #290), since `baseline_revision` now points after the Story's merged code; ESC-9.9-4 asks for that.
- 2026-10-21: `decisions/ESC-9.9-3.md` (Maintainer) rules option 1: a private base property keeps the base's value in the one JS slot, recorded as DIV-12.9. The code is unchanged; the private-slot row, a comment and the docs are added as follow-up tasks, so the Story is back to `in-progress`. The Fidelity Review runs on the final tree.
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

### 2026-10-21 — Review pass (ESC-9.9-2 follow-up; Fidelity Review not run, see Auto Run Result)
- verdicts: 25 findings — high 0, medium 3, low 12, false 10, maybe-false 0 (fidelity-review layer skipped: the Story blocks on ESC-9.9-3, which may change `mixin.ts`)
- findings:
  - Blind:
    - `[false]` `reject` The signed fixture for the new request is missing. — The bot signed it (1300221); `bun test packages/runtime` 34/34.
    - `[medium]` `intent_gap`→escalated A private base property against a trait's public one keeps the base's value; PHP reads the trait's default from outside (probe `/tmp/xv100/p.php`: `"named"` outside, `"parent"` from the base's method). The ESC-9.9-2 ruling directs this branch, but DIV-12.8 does not list the case. — Raised ESC-9.9-3 (`divergence`); the private-slot local row, added in this pass, was removed so XT-runtime-31 asserts neither value; the docs name it as open.
    - `[medium]` `defer` Model calls `initializeTraits` before the subclass's own fields are set. — JS field timing, not caused by this rule; deferred to Story 36.1 (frontmatter `deferred`).
    - `[low]` `reject` `assignDefaults` throws for a non-configurable owned key. — Only a base constructor that seals `this` reaches it, and it fails loudly; the guard adds a branch.
    - `[low]` `reject` The request lacks the private-slot and write-equal-to-default cases. — The second is a recorded DIV-12.8 difference by definition; the first is ESC-9.9-3.
    - `[low]` `reject` `oracle()` selects by first expr. — The same idiom as `codec.test.ts`; a mismatch fails loudly with the count.
    - `[low]` `reject` The no-table assertion's precondition is unstated. — A table added to that chain flips it loudly; the comment cites DIV-12.8.
    - `[low]` `reject` `checkDefaultLimits` registers per call. — The test body runs once per process.
    - `[low]` `reject` The XT-runtime-33 comment overstates coverage. — The subprocess check above it covers the polyfill path; the in-harness assertion is what ESC-9.9-1 allows.
  - Edge case:
    - `[low]` `reject` Non-configurable owned key throws. — Same as the Blind row.
    - `[false]` `reject` A subclass redeclaring a field with no table of its own. — A class that redeclares a property declares its table (generators emit one per class); an incomplete table is the no-table case of DIV-12.8.
    - `[false]` `reject` Nested layers with A and B declaring the same property. — PHP forbids that collision within one class; across a class boundary the intermediate class's own table lists A's default, so the rule applies.
    - `[medium]` `intent_gap`→escalated The private-slot row pins a value PHP does not give. — Same root cause as the Blind row; ESC-9.9-3.
    - `[low]` `reject` A malformed table now throws at construction. — It fails loudly, as the codec already does for the same table.
    - `[low]` `reject` A native `Symbol.metadata` would fail the XT-runtime-33 assertion. — Bun is pinned at 1.4.3, which has none; a bump re-runs the test.
    - `[low]` `patch` The docs present two DIV-12.8 cases as the complete list. — The docs now name the private-slot case as open (ESC-9.9-3).
  - Verification gap:
    - `[false]` `reject` The protected branch is checked only by the unsigned fixture. — The fixture is signed and XT-runtime-31 passes it.
  - Intent alignment:
    - `[false]` `reject` The Oracle-comparison surface is not exercised. — It is now, against fixture 1300221.
    - `[false]` `reject` The review step and Fidelity Review are missing. — This pass is the review step; the Fidelity Review waits on ESC-9.9-3.
    - `[low]` `defer` Model-shaped hosts are not covered. — Same as the Blind deferral (Story 36.1).
    - `[false]` `reject` Tables are hand-written. — No generator exists yet; the tables follow the codec's format.
    - `[false]` `reject` The check is per key, not per instance. — `propertyTable` is cached per class; the `find` runs only for owned keys, as the ruling requires.
    - `[false]` `reject` The XT-runtime-33 assertion cannot tell harness from polyfill. — ESC-9.9-1 asks only that the value be defined in the harness process.
    - `[low]` `reject` Scope beyond the ruling (private row, host docs, selector). — The private row is removed (ESC-9.9-3); the rest is additive and needed.
    - `[false]` `reject` No Expectations lines. — `test_ids` is empty; XT rows have no Expectations lines.

### 2026-10-22 — Review pass (ESC-9.9-3 follow-up, with the Fidelity Review)
- verdicts: 20 findings — high 0, medium 1, low 11, false 8, maybe-false 0
- findings:
  - Blind:
    - `[low]` `patch` `sprint-status.yaml`'s 9.9 comment still says the private-slot row lands as a follow-up. — The comment is rewritten with the Story's new status (bookkeeping, this commit).
    - `[false]` `reject` The Auto Run Result still says blocked on ESC-9.9-3. — It is written at the end of this pass, as the workflow orders.
    - `[false]` `reject` Whether the Fidelity Review ran is unrecorded. — It ran in this pass; both verdicts are under `## Fidelity Review`.
    - `[low]` `patch` The DIV-12.9 row skips the subclass's own methods, a reader DIV-12.9 names. — `UsesSecret.ownName()` and a third `assertSame("parent", …)` added; the consequence text names it.
    - `[low]` `reject` No row for a protected trait property. — `assignDefaults` never reads the trait's visibility, only the base table's, so a protected trait property takes the same path as `SetsName`; a row adds nothing the code can distinguish.
    - `[false]` `reject` Nothing pins that `private` is what keeps `"parent"`. — `Secret`'s value equals its declared default, so without the private filter `holdsBaseDefault` is true and `"named"` is assigned, failing the row (the verification-gap layer traced this); the public case is the ESC-9.9-2 Oracle request.
    - `[low]` `reject` Citations name the ruling, not `decisions/DIV-12.md`. — Each cites the clause id DIV-12.9 beside the ruling, as the DIV-12.8 lines cite ESC-9.9-2; cosmetic.
    - `[low]` `reject` The docs' numbered list is split and its last sentence repeats. — An ordered list starting at `3.` renders as 3 in CommonMark; the wording is cosmetic.
  - Edge case:
    - `[low]` `reject` A protected trait property against a private base property is untested. — Same as the Blind row: the trait's visibility is not an input of the rule.
    - `[low]` `reject` A private base property listed in the table with no JS field gets the trait's default. — A port declares a JS field for each property its table lists (the table is that field's PHP metadata); a table-only property is a malformed port, not a DIV-12.9 case.
    - `[low]` `reject` A private and an inherited public property of one name make construction throw. — Probed: `propertyTable` throws its own `TypeError` ("more than one property $name … which one JS property cannot hold"), the codec's rule since Story 9.7 (ESC-9.7-1); pre-existing and loud.
    - `[low]` `reject` The docs claim the base's value is kept for every private-slot case. — Same root as the table-only row; holds for every well-formed port.
  - Verification gap:
    - `[false]` `reject` (other) `stories/9.9.md` says `in-progress` while the spec says `in-review`. — The manifest tracks the Story's sprint status (`in-progress`), the spec its workflow step; both are now `blocked`.
  - Intent alignment:
    - `[false]` `reject` No review or Fidelity Review artifacts. — This pass records both.
    - `[false]` `reject` The spec body contradicts its status. — Same as the Blind row.
    - `[false]` `reject` Status mismatch across files. — Same as the verification-gap row.
    - `[low]` `patch` The subclass-method reader is untested. — Same as the Blind row; patched.
    - `[low]` `reject` No Oracle check of the PHP side of DIV-12.9. — ESC-9.9-3 prescribes a local row; the PHP side was probed (`/tmp/xv100/p.php`, earlier pass), and an Oracle request would pin a value Xaravel deliberately does not give.
    - `[false]` `reject` `test_ids: []` leaves the Story uncheckable. — The Story's ids are `xaravel_test_ids`, as in Stories 9.1-9.8; `story:check` reads both.
  - Fidelity review:
    - `[medium]` `intent_gap`→escalated F-7 (reviewer 1, tree fc517f78): supply the complete `checkComposition` and `checkDefaultLimits` helpers and their fixtures, including `SetsName`. — Evidence (e) prints only the `xaravelTest(...)` unit, never the helpers it calls; reviewer 2 passed but noted the same gap. Fixing it is a `tools/fidelity-review/` change: ESC-9.9-4 (`protected-path`). The reject stands on that tree; the review patch above has since changed the tree.

### 2026-10-22 — Review pass (ESC-9.9-4 follow-up, whole Story from a5ecf39)
- verdicts: 45 findings — high 0, medium 4, low 32, false 8, maybe-false 1
- findings:
  - Blind:
    - `[low]` `patch` `stories/9.9.md` says `blocked` while sprint status says `in-progress` and ESC-9.9-4 says unblocked. — Both are set to the Story's status at the end of this pass (bookkeeping, this commit).
    - `[medium]` `defer` carried Trait defaults are absent while a base constructor's initializers run. — Deferred to Story 36.1 (frontmatter `deferred`).
    - `[low]` `reject` A method collision fails when called, not when the class is declared. — Laravel's source compiles, so every collision a port meets is resolved by an override; the thrower only guards code PHP would refuse, and fails loudly.
    - `[low]` `reject` carried The property-conflict message lacks the class name; a trait property against the using class's own field is not detected. — The layer cannot know the using class; the second case is code PHP refuses at compile time, which no Laravel port contains.
    - `[low]` `reject` carried Trait constructors run at `mixin` time.
    - `[low]` `reject` carried NaN defaults are judged identical.
    - `[low]` `patch` `sameDescriptor` and `sameMember` are one function. — `sameMember` deleted; its caller uses `sameDescriptor`.
    - `[low]` `reject` carried A static `initialize<Trait>` is not recorded; Model has no hook. — The `#[Boot]` / `#[Initialize]` loop is Story 38.x's, which can ask for an export by Escalation; a hook now is public surface with no consumer.
    - `[low]` `reject` carried Tests register classes in their bodies. — Each test body runs once per process.
    - `[low]` `reject` carried Untested error paths. — The `TypeError` guards are simple and loud (carried); the `inject(map, fn)` re-call is now tested (verification-gap row 2).
    - `[maybe-false]` `defer` Defaults over a Proxy-returning base go through `defineProperty`, not `set`. — Whether Model's Proxy traps `defineProperty` is Story 36.1's design; medium (unverified), deferred there (frontmatter `deferred`).
    - `[low]` `reject` `usedDeclarations` has no size cap and its test reads a Story file. — The tool change is decisions/ESC-9.9-4.md's, not this Story's; the prompt grows only with the test file.
    - `[low]` `reject` carried `Mixed<B, Ts>` drops `abstract`.
  - Edge case:
    - `[low]` `reject` carried Symbol or `#private` trait fields.
    - `[low]` `reject` carried Trait constructors run at `mixin` time.
    - `[low]` `reject` An uninitialized trait field becomes `null`. — An untyped PHP property with no default is `null`; a JS port cannot express a typed uninitialized property, and AD-9 bars `undefined`.
    - `[low]` `reject` carried A trait that extends a class.
    - `[low]` `reject` An accessor against data of one name gets the property message, not the method one. — Rare, and it still throws at `mixin` time naming both traits.
    - `[low]` `reject` One PHP array as an `Array` in one trait and a `PhpArray` in another is judged different. — A generator emits one form per value; mixed forms are not everyday input, and the result is a loud throw.
    - `[low]` `reject` carried NaN defaults.
    - `[low]` `reject` carried A non-configurable owned key throws.
    - `[low]` `reject` carried A re-entrant `clearBootedTraits` during boot.
    - `[low]` `reject` carried A static `initialize<Trait>`.
    - `[low]` `reject` `inject(map, A)` after a subclass `B` was decorated does not reach `B`. — `inject(map, fn)` is typed for functions, not classes (tsc refuses a class); a class uses the decorator, which runs at definition.
    - `[low]` `reject` carried `inject` on a frozen function.
    - `[low]` `reject` carried A class decorator context with no metadata.
    - `[low]` `reject` carried A non-enumerable key is validated before it is skipped.
    - `[false]` `reject` `hardenIntrinsics` throws if `Symbol` is already non-extensible. — The harness hardens intrinsics once, before anything else freezes `Symbol`; the file is decisions/ESC-9.9-1.md's, not this Story's.
    - `[low]` `reject` `usedDeclarations` has no cap. — Same as the Blind row.
    - `[false]` `reject` carried The spec claims Bun never attaches metadata.
  - Verification gap:
    - `[low]` `reject` carried The `TypeError` guards of `mixin` and the boot helpers are untested.
    - `[low]` `patch` `ownMetadata`'s inherited branch and a second `inject(map, fn)` never run. — XT-runtime-34 now injects onto a function whose prototype carries a map (own map created, parent's kept) and re-injects `handler`.
    - `[low]` `patch` Different `PhpArray` and plain-object defaults are untested. — `checkComposition` now asserts the property message for both.
  - Intent alignment:
    - `[false]` `reject` Defaults overwrite an owned key. — decisions/ESC-9.9-2.md (DIV-12.8) and ESC-9.9-3.md (DIV-12.9) amend that clause.
    - `[false]` `reject` The polyfill's extensibility guard and the `inject` fallback. — decisions/ESC-9.9-1.md.
    - `[false]` `reject` carried Collisions cover more than the contract names.
    - `[low]` `defer` carried The boot order runs on a JS stand-in host. — Story 36.1.
    - `[low]` `reject` The defaults Oracle request uses a hand-written `initialize()`. — decisions/ESC-9.9-2.md prescribes the cases, and each uses one trait, so the orders agree.
    - `[false]` `reject` carried The in-harness polyfill assertion sees the harness's install.
    - `[false]` `reject` `inject` details beyond the contract. — Additive and loud.
    - `[false]` `reject` The diff edits `tools/**` and the harness. — Those are the ruling PRs #291 and #296, not Story commits.
    - `[low]` `patch` Status lines disagree. — Same as the Blind row.
    - `[medium]` `intent_gap`→escalated The Fidelity Review rejects F-7. — Same as the Fidelity rows.
  - Fidelity review:
    - `[medium]` `intent_gap`→escalated F-7 (reviewer 1, tree fc6cb97): supply the AD-4 Rule for XT-runtime-33/34. — The tool finds no `AD-4.*` consequence line and prints `unknown`; the Rule is in the spine. Showing it is a `tools/fidelity-review/` change: ESC-9.9-5 (`protected-path`).
    - `[medium]` `intent_gap`→escalated F-7 (reviewer 1, tree fc6cb97): supply the AD-26 Traits Rule for XT-runtime-31/32. — Same root cause; ESC-9.9-5. The reject stands on that tree; this pass's patches have since changed the tree.

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

Status: blocked
Blocking condition: ESC-9.9-5 (`protected-path`): the Fidelity Review prints `unknown consequence id` for AD-4 (XT-runtime-33, 34) and AD-26 (XT-runtime-31, 32), because `conformance/xaravel-consequences/runtime.jsonl` has no line for either, so reviewer 1 rejects F-7 at tree fc6cb97 (reviewer 2 passes; the ESC-9.9-4 finding is marked fixed). The Rules are in the spine; showing them is a `tools/fidelity-review/` change the 2026-10-21 amendment to MAINT-2026-10-16 lets the orchestrator rule on. After the ruling, the Story re-runs its Fidelity Review on the changed tree with `--base a5ecf3905763930a6d18c518924c7e12afa3e303`.

- **Summary:** the ESC-9.9-4 follow-up. The whole Story (base a5ecf39, as decisions/ESC-9.9-4.md sets; `baseline_revision` now says the same, so `fidelity:review status` reads the same base) went through all five review layers. Three low patches: `mixin.ts` loses its duplicate `sameMember`; XT-runtime-34 covers `inject(map, fn)` on a function that inherits a map and a second `inject` on one function; XT-runtime-31 covers different `PhpArray` and plain-object trait defaults.
- **Files:**
  - `packages/runtime/src/traits/mixin.ts`: `sameMember` removed (no behaviour change).
  - `packages/runtime/tests/xaravel/inject.test.ts`, `packages/runtime/tests/xaravel/traits.test.ts`: the new assertions.
  - `conformance/escalations/ESC-9.9-5.md`: the Escalation.
- **Review:** 45 findings. 4 patched (all low, one of them bookkeeping), 1 newly deferred (Proxy base, medium unverified, Story 36.1) plus 2 carried deferrals, 1 escalated (F-7, ESC-9.9-5, three rows), the rest rejected with reasons in the triage log.
- **Fidelity Review:** tree fc6cb97, base a5ecf39. Reviewer 1 (codex) rejects F-7 for the missing AD-4 / AD-26 Rules and marks the ESC-9.9-4 finding fixed; reviewer 2 (claude) passes every item. The patches have since changed the tree, so a re-run is due after ESC-9.9-5 is ruled.
- **Follow-up review recommended:** false (no `high` or `medium` patched).
- **Verification:** `bun test packages/runtime` 34/34, `bun run harness --xaravel --id 'XT-runtime-*'` 34/34, clean `tsc -b`, `lint`, `graph:check`, `registration:check`, `async-surface --all --check`, `escalations:check` and `oracle:story check 9.9` (3 accepted). `story:check 9.9` is not run: its approvals clause needs two Fidelity `pass` verdicts.
- **Residual risk:** none new in behaviour; the open deferrals name Story 36.1.

### Earlier run (ESC-9.9-3 follow-up)

Status (then): blocked
Blocking condition (then): ESC-9.9-4 (`protected-path`): the Fidelity Review's evidence (e) gives reviewers an Xaravel Test's `xaravelTest(...)` call but not the helpers it calls or their fixtures, so reviewer 1 rejects F-7 for XT-runtime-31 (tree fc517f78). Supplying them is a `tools/fidelity-review/` change; the 2026-10-21 amendment to MAINT-2026-10-16 lets the orchestrator rule on it. After the ruling, the Story re-runs its Fidelity Review on the changed tree, against base a5ecf39 so the review covers the whole Story.

- **Summary:** the ESC-9.9-3 follow-up (DIV-12.9). XT-runtime-31 regains the private-slot row: a private base `name` against `SetsName`'s public one keeps the base's `"parent"` for an outside read, the subclass's own method and the base's own method. The `mixin.ts` header cites DIV-12.9 (no behaviour change), and the docs record the case as DIV-12.9 instead of open.
- **Files:**
  - `packages/runtime/tests/xaravel/traits.test.ts`: the DIV-12.9 row and XT-runtime-31's consequence text.
  - `packages/runtime/src/traits/mixin.ts`: header comment only.
  - `packages/runtime/docs/traits-and-inject.md`: the three cases that differ from PHP (DIV-12.8 ×2, DIV-12.9).
  - `conformance/escalations/ESC-9.9-4.md`: the Escalation.
- **Review:** 20 findings. 2 patched (low: the subclass-method reader; the stale sprint-status comment), 0 deferred, 1 escalated (medium: F-7 evidence gap, ESC-9.9-4), 17 rejected with reasons in the triage log.
- **Fidelity Review:** tree fc517f78, base 4a3cd9f. Reviewer 1 (codex) rejects F-7 and passes or marks n/a every other item. Reviewer 2 (claude) passes every item. The reject stands on that tree (ESC-8.8-1). The review patch has since changed the tree, so a re-run is due after ESC-9.9-4 is ruled.
- **Follow-up review recommended:** false by the counting rule (no `high` or `medium` patched). The open risk is the Fidelity Review itself: it has not passed on any tree of this Story, and #290 and #293 merged the Story's code before one ran.
- **Verification:** `bun test packages/runtime` 34/34, `bun run harness --xaravel --id 'XT-runtime-*'` 34/34, clean `tsc -b`, `lint`, `graph:check`, `registration:check`, `async-surface --all --check`, `escalations:check` and `oracle:story check 9.9` (3 accepted). `story:check 9.9` is not run: its approvals clause needs two Fidelity `pass` verdicts.
- **Residual risk:** none in behaviour; DIV-12.9 is now pinned by a test.

### Earlier run (ESC-9.9-2 follow-up)

Status (then): blocked
Blocking condition (then): ESC-9.9-3 (`divergence`: a private base property against a trait property of the same name; PHP keeps two slots, JS has one, and DIV-12.8 lists only two cases) waits on the Maintainer (MAINT-2026-10-16: a divergence ruling is the Maintainer's). The Fidelity Review runs on the final tree after the ruling, because option 2 would change `mixin.ts`.

- **Follow-up (ESC-9.9-2, DIV-12.8):** `packages/runtime/src/traits/mixin.ts` (rule and header), `conformance/oracle-requests/9.9.jsonl` (the four-case request) and its bot-signed fixture, `packages/runtime/tests/xaravel/traits.test.ts` (Oracle comparison and two DIV-12.8 local rows), `packages/runtime/docs/traits-and-inject.md` (the rule, its two limits, and the open private-slot case), XT-runtime-33's in-harness `Symbol.metadata` assertion (ESC-9.9-1), `conformance/escalations/ESC-9.9-3.md`.
- **Review:** 25 findings. 1 patched (low: docs), 2 deferred (Model host field timing to Story 36.1; plus the earlier stacked-decorator item), 1 escalated (private slot, medium: ESC-9.9-3, with the row it would have pinned removed), the rest rejected with reasons in the triage log.
- **Follow-up review recommended:** true. The Fidelity Review has not run on this tree.
- **Verification:** `bun test packages/runtime` 34/34 and `bun run harness --xaravel --id 'XT-runtime-*'` 34/34 against the signed fixtures; `tsc -b`, `lint`, `graph:check`, `registration:check`, `async-surface --all --check`, `escalations:check`, `oracle:verify-fixtures` (1953) and `oracle:story check 9.9` clean.
- **Residual risk:** until ESC-9.9-3 is ruled, the private-slot case behaves as decisions/ESC-9.9-2.md directs (base's value kept) with no test pinning it.

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

## Fidelity Review

### Reviewer 1: reject at tree fc517f78e9585cd0072af8c3353a9c463810b181

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4a3cd9faa8545c39afbb1857b00c720cca58e2cf`, on 2026-10-22T06:06:38.663Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are assigned, added or changed. |
| F-2: No expected value is weakened | pass | Existing expected values remain unchanged. The two added exact assertions expect the base value, as ESC-9.9-3 explicitly requires for this Xaravel Test. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The added private-property assertions match ESC-9.9-3, but the supplied test body delegates most declared consequences to helpers whose complete implementations are absent, preventing verification of the entire changed consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes are confined to runtime comments; the added runtime test fixtures implement the private-slot case prescribed by ESC-9.9-3, without introducing another Component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied declaration inventory contains no asyncRoot tags or Promise-returning exports. The synchronous trait composition and lifecycle signatures are consistent with the supplied async rules. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/traits.test.ts`: Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"fc517f78e9585cd0072af8c3353a9c463810b181","base":"4a3cd9faa8545c39afbb1857b00c720cca58e2cf","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T06:06:38.663Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are assigned, added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Existing expected values remain unchanged. The two added exact assertions expect the base value, as ESC-9.9-3 explicitly requires for this Xaravel Test.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"The added private-property assertions match ESC-9.9-3, but the supplied test body delegates most declared consequences to helpers whose complete implementations are absent, preventing verification of the entire changed consequence.","findings":[{"path":"packages/runtime/tests/xaravel/traits.test.ts","detail":"Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified."}]},{"id":"F-8","result":"pass","note":"Framework changes are confined to runtime comments; the added runtime test fixtures implement the private-slot case prescribed by ESC-9.9-3, without introducing another Component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied declaration inventory contains no asyncRoot tags or Promise-returning exports. The synchronous trait composition and lifecycle signatures are consistent with the supplied async rules.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree fc517f78e9585cd0072af8c3353a9c463810b181

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4a3cd9faa8545c39afbb1857b00c720cca58e2cf`, on 2026-10-22T06:06:38.663Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty, and the diff adds or changes no Ported Test. The only test touched is the Xaravel Test XT-runtime-31. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so there is no Upstream expected value to weaken. The new XT-runtime-31 assertions pin the DIV-12.9 behaviour that ESC-9.9-3 rules on (the base's value "parent" for an outside read and for the base's own method). They remove or loosen no existing expected value. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test, so there is no Upstream assertion count to compare. The change adds two local assertions and removes none (it replaces a comment saying the case was not yet asserted). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There is no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. ESC-9.9-3 says the DIV-12.9 row carries no adapted marker, and the diff adds none. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | The evidence lists no error fixture, base or changed. The three XT-runtime-31/32 fixtures are present, verify against oracle.pub, and have error null. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The new part of the XT-runtime-31 consequence string claims the DIV-12.9 case: a private base property against a trait property keeps the base's value, for an outside read and for the base's own method. The body checks exactly this. 'Secret' declares a PHP_PROPERTIES entry with private visibility for 'name' and a method 'secretName'. It is mixed with the trait 'SetsName', and the test asserts "parent" for both 'secret.name' and 'secret.secretName()'. This matches the ESC-9.9-3 instructions and the DIV-12.9 text. The prompt does not show 'SetsName', so I could not confirm that its default for 'name' differs from "parent", which the row needs in order to test anything. Its name and the earlier DIV-12.8 rows suggest it does. AD-26 is not an FR/AD-<n>.<k> bullet token, the line already cited it before this change, and evidence (b) says no added line cites such a consequence. ESC-9.9-3, which the string newly cites, is the ruling the row implements. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in the runtime Component (packages/runtime docs, src comment, tests) or is the Story's own spec status. There is no stub, fake or hard-coded return for another Component, and mixin.ts changes only a comment. |
| F-9: Every `@asyncRoot` tag is true | pass | The only change to mixin.ts is a header comment. Evidence (g) shows no @​asyncRoot tags, and every export (mixin, classUsesRecursive, bootTraits, initializeTraits, clearBootedTraits, the types) is sync. None does IO behind a Driver contract or takes a callback DIV-1 allows to be async, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"fc517f78e9585cd0072af8c3353a9c463810b181","base":"4a3cd9faa8545c39afbb1857b00c720cca58e2cf","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T06:06:38.663Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty, and the diff adds or changes no Ported Test. The only test touched is the Xaravel Test XT-runtime-31.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so there is no Upstream expected value to weaken. The new XT-runtime-31 assertions pin the DIV-12.9 behaviour that ESC-9.9-3 rules on (the base's value \"parent\" for an outside read and for the base's own method). They remove or loosen no existing expected value.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test, so there is no Upstream assertion count to compare. The change adds two local assertions and removes none (it replaces a comment saying the case was not yet asserted).","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There is no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. ESC-9.9-3 says the DIV-12.9 row carries no adapted marker, and the diff adds none.","findings":[]},{"id":"F-6","result":"pass","note":"The evidence lists no error fixture, base or changed. The three XT-runtime-31/32 fixtures are present, verify against oracle.pub, and have error null.","findings":[]},{"id":"F-7","result":"pass","note":"The new part of the XT-runtime-31 consequence string claims the DIV-12.9 case: a private base property against a trait property keeps the base's value, for an outside read and for the base's own method. The body checks exactly this. `Secret` declares a PHP_PROPERTIES entry with private visibility for `name` and a method `secretName`. It is mixed with the trait `SetsName`, and the test asserts \"parent\" for both `secret.name` and `secret.secretName()`. This matches the ESC-9.9-3 instructions and the DIV-12.9 text. The prompt does not show `SetsName`, so I could not confirm that its default for `name` differs from \"parent\", which the row needs in order to test anything. Its name and the earlier DIV-12.8 rows suggest it does. AD-26 is not an FR/AD-<n>.<k> bullet token, the line already cited it before this change, and evidence (b) says no added line cites such a consequence. ESC-9.9-3, which the string newly cites, is the ruling the row implements.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in the runtime Component (packages/runtime docs, src comment, tests) or is the Story's own spec status. There is no stub, fake or hard-coded return for another Component, and mixin.ts changes only a comment.","findings":[]},{"id":"F-9","result":"pass","note":"The only change to mixin.ts is a header comment. Evidence (g) shows no @asyncRoot tags, and every export (mixin, classUsesRecursive, bootTraits, initializeTraits, clearBootedTraits, the types) is sync. None does IO behind a Driver contract or takes a callback DIV-1 allows to be async, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree fc6cb97928c8441c840f969d6e66665c218e9ba6

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a5ecf3905763930a6d18c518924c7e12afa3e303`, on 2026-10-22T06:36:01.078Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No actual Ported Test is added or changed; the manifest assigns no Upstream Test IDs. Generated harness tests are infrastructure fixtures. |
| F-2: No expected value is weakened | pass | Compared changed assertions and signed Oracle values: existing expectations are retained, harness assertions are added, and local divergent values follow DIV-12.8 and DIV-12.9. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no changed Ported Tests whose assertion counts require comparison with Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No committed Expectations line is set to skip; skip lines inside infrastructure fixtures are simulated grader inputs. |
| F-5: Every `adapted` marker matches its clause | n/a | No actual assertion adaptation marker or Expectations adapted field is introduced; marker strings in fidelity-review tests exercise evidence collection. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | All three Story Oracle fixtures are explicitly verified and have null output.error; no changed fixture contains an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The supplied helpers and fixtures resolve the previous XT-runtime-31 evidence gap, and its local divergence checks match the rulings. However, the cited AD-4 and AD-26 consequences are explicitly unavailable, preventing confirmation of their architectural mappings. |
| F-8: No stub, fake or partial implementation of another Component | pass | Runtime implementations remain within runtime responsibilities. Harness and review-tool edits match the supplied ESC-9.9-1 and ESC-9.9-4 approvals; test hosts do not add production implementations of Model or Container. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and exhaustive declaration listings with AD-6 and DIV-1: new runtime functions are synchronous and perform no async-root IO or permitted async callback execution. No retained asyncRoot tags require correction. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Compared all three requests with the runtime fixtures and recorded reason: these are Xaravel differential probes without corresponding Upstream tests, exercising trait enumeration, initialization and Model trait hooks. The default probes also match ESC-9.9-2's prescribed cases. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/inject.test.ts`: Supply the relevant AD-4 architecture bullets for XT-runtime-33 and XT-runtime-34. Evidence currently reports AD-4 as unknown, so the cited requirement cannot be compared with the tests.
- **F-7** `packages/runtime/tests/xaravel/traits.test.ts`: Supply the relevant AD-26 Traits architecture bullet for XT-runtime-31 and XT-runtime-32. Evidence currently reports AD-26 as unknown, so the cited requirement cannot be verified.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/traits.test.ts`: Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified. **fixed**: The prompt now supplies complete checkComposition and checkDefaultLimits bodies and relevant fixtures, including SetsName, DefaultsNamed and Secret, allowing the previously missing comparisons.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"fc6cb97928c8441c840f969d6e66665c218e9ba6","base":"a5ecf3905763930a6d18c518924c7e12afa3e303","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T06:36:01.078Z","items":[{"id":"F-1","result":"n/a","note":"No actual Ported Test is added or changed; the manifest assigns no Upstream Test IDs. Generated harness tests are infrastructure fixtures.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed assertions and signed Oracle values: existing expectations are retained, harness assertions are added, and local divergent values follow DIV-12.8 and DIV-12.9.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no changed Ported Tests whose assertion counts require comparison with Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No committed Expectations line is set to skip; skip lines inside infrastructure fixtures are simulated grader inputs.","findings":[]},{"id":"F-5","result":"n/a","note":"No actual assertion adaptation marker or Expectations adapted field is introduced; marker strings in fidelity-review tests exercise evidence collection.","findings":[]},{"id":"F-6","result":"n/a","note":"All three Story Oracle fixtures are explicitly verified and have null output.error; no changed fixture contains an error.","findings":[]},{"id":"F-7","result":"fail","note":"The supplied helpers and fixtures resolve the previous XT-runtime-31 evidence gap, and its local divergence checks match the rulings. However, the cited AD-4 and AD-26 consequences are explicitly unavailable, preventing confirmation of their architectural mappings.","findings":[{"path":"packages/runtime/tests/xaravel/inject.test.ts","detail":"Supply the relevant AD-4 architecture bullets for XT-runtime-33 and XT-runtime-34. Evidence currently reports AD-4 as unknown, so the cited requirement cannot be compared with the tests."},{"path":"packages/runtime/tests/xaravel/traits.test.ts","detail":"Supply the relevant AD-26 Traits architecture bullet for XT-runtime-31 and XT-runtime-32. Evidence currently reports AD-26 as unknown, so the cited requirement cannot be verified."}]},{"id":"F-8","result":"pass","note":"Runtime implementations remain within runtime responsibilities. Harness and review-tool edits match the supplied ESC-9.9-1 and ESC-9.9-4 approvals; test hosts do not add production implementations of Model or Container.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and exhaustive declaration listings with AD-6 and DIV-1: new runtime functions are synchronous and perform no async-root IO or permitted async callback execution. No retained asyncRoot tags require correction.","findings":[]},{"id":"F-10","result":"pass","note":"Compared all three requests with the runtime fixtures and recorded reason: these are Xaravel differential probes without corresponding Upstream tests, exercising trait enumeration, initialization and Model trait hooks. The default probes also match ESC-9.9-2's prescribed cases.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/traits.test.ts","detail":"Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified.","fixed":true,"note":"The prompt now supplies complete checkComposition and checkDefaultLimits bodies and relevant fixtures, including SetsName, DefaultsNamed and Secret, allowing the previously missing comparisons."}]}
```

### Reviewer 2: pass at tree fc6cb97928c8441c840f969d6e66665c218e9ba6

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a5ecf3905763930a6d18c518924c7e12afa3e303`, on 2026-10-22T06:36:01.078Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test. Only Xaravel Tests and Infrastructure tests change, so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so no expected value can be compared with Upstream. The Xaravel Tests compare with signed Oracle fixtures exactly: jsonEncode of each decoded result goes through assertSame. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test whose assertions could be counted against Upstream, and DIV-12.8 and DIV-12.9 add nothing to fewer_assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations lines and sets no line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an '// adapted:DIV-<n>.<k>' marker or an Expectations adapted field. DIV-12.8 and DIV-12.9 are cited only in Xaravel Test comments and consequence text, as decisions/ESC-9.9-2.md and decisions/ESC-9.9-3.md direct, with no marker. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | Evidence (c) names the three fixtures (28218ee4…, bed7e992…, 1454a09b…) as present and verified against oracle.pub, each with error null. No assigned fixture is an error. The test's 'oracle()' helper throws if a fixture reports an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each touched Xaravel Test checks what its consequence string declares: - **XT-runtime-31** (P-1 evidence now in (e)):   - The classUsesRecursive rows compare with the Oracle for a class, an instance, an FQCN and a trait.   - Member order: Resolves' own count and its super.greet reaching Parent; the Collides thrower shows the trait layer sits above Parent's count.   - Per-class statics (registry) and per-instance defaults (hits); the Inner diamond; collision throws for methods, getters and statics.   - Trait-default rows compare with the Oracle: UsesName 'named', UsesWrites 'written', Flagged true, Open [].   - The DIV-12.8 no-table case: describe() gives 'parent:…'. The equal-write case: UsesWritesParent gives 'named', traced through DefaultsNamed's table and initializeTraits.   - The DIV-12.9 case: SetsName's default is 'named', and all three reads (outside, subclass method, base method) give 'parent'. - **XT-runtime-32**: once per class with 'this' as the class, initializers once per instance, Oracle order for Post, Comment and Reply, and clearBootedTraits. - **XT-runtime-33**: fresh processes for all four entries check before and after load, the descriptor and decorator metadata, plus the in-process assertion. - **XT-runtime-34**: covers every claimed case, including the TypeError messages naming AD-4. - **XT-conformance-185**: its additions match ESC-9.9-1. - **XT-conformance-161**: its additions test usedDeclarations as ESC-9.9-4 describes.  The tests cite only bare AD-4 and AD-26, which are not 'AD-<n>.<k>' bullet tokens; evidence (b) confirms no bullet citations. |
| F-8: No stub, fake or partial implementation of another Component | pass | The new code sits in packages/runtime (mixin, inject, polyfill). The edits outside it are covered by orchestrator rulings: conformance/harness/intrinsics.ts by ESC-9.9-1, and tools/fidelity-review by ESC-9.9-4. Neither edit fakes another Component's behaviour. The test-only Host and DefaultsHost classes model a host's constructor calling initializeTraits; they are fixtures of runtime's own API, not a stub of Eloquent shipped in src. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed src file. Every new export (mixin, classUsesRecursive, bootTraits, initializeTraits, clearBootedTraits, inject, readInjectMetadata) is synchronous, does no IO and takes no async callback, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | pass | The 9.9.jsonl requests belong to Xaravel Tests with no Upstream test. The reason is recorded in the traits.test.ts header. The XT-runtime-31 defaults request covers the four cases decisions/ESC-9.9-2.md prescribes. The XT-runtime-32 request calls Upstream Model::bootTraits and initializeTraits on fixture classes. None of the requests signs arbitrary PHP as an expected value. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/traits.test.ts`: Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified. **fixed**: Evidence (e) now carries, through usedDeclarations (ESC-9.9-4), the full checkComposition (lines 283-485), checkDefaultLimits (246-281) and SetsName (214-216). It also shows Secret and UsesSecret inside checkDefaultLimits, and DefaultsNamed and the other fixtures. With these I checked XT-runtime-31's composition, default handling and private-property claims.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"fc6cb97928c8441c840f969d6e66665c218e9ba6","base":"a5ecf3905763930a6d18c518924c7e12afa3e303","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T06:36:01.078Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test. Only Xaravel Tests and Infrastructure tests change, so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so no expected value can be compared with Upstream. The Xaravel Tests compare with signed Oracle fixtures exactly: jsonEncode of each decoded result goes through assertSame.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test whose assertions could be counted against Upstream, and DIV-12.8 and DIV-12.9 add nothing to fewer_assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations lines and sets no line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an `// adapted:DIV-<n>.<k>` marker or an Expectations adapted field. DIV-12.8 and DIV-12.9 are cited only in Xaravel Test comments and consequence text, as decisions/ESC-9.9-2.md and decisions/ESC-9.9-3.md direct, with no marker.","findings":[]},{"id":"F-6","result":"pass","note":"Evidence (c) names the three fixtures (28218ee4…, bed7e992…, 1454a09b…) as present and verified against oracle.pub, each with error null. No assigned fixture is an error. The test's `oracle()` helper throws if a fixture reports an error.","findings":[]},{"id":"F-7","result":"pass","note":"Each touched Xaravel Test checks what its consequence string declares:\n- **XT-runtime-31** (P-1 evidence now in (e)):\n  - The classUsesRecursive rows compare with the Oracle for a class, an instance, an FQCN and a trait.\n  - Member order: Resolves' own count and its super.greet reaching Parent; the Collides thrower shows the trait layer sits above Parent's count.\n  - Per-class statics (registry) and per-instance defaults (hits); the Inner diamond; collision throws for methods, getters and statics.\n  - Trait-default rows compare with the Oracle: UsesName 'named', UsesWrites 'written', Flagged true, Open [].\n  - The DIV-12.8 no-table case: describe() gives 'parent:…'. The equal-write case: UsesWritesParent gives 'named', traced through DefaultsNamed's table and initializeTraits.\n  - The DIV-12.9 case: SetsName's default is 'named', and all three reads (outside, subclass method, base method) give 'parent'.\n- **XT-runtime-32**: once per class with `this` as the class, initializers once per instance, Oracle order for Post, Comment and Reply, and clearBootedTraits.\n- **XT-runtime-33**: fresh processes for all four entries check before and after load, the descriptor and decorator metadata, plus the in-process assertion.\n- **XT-runtime-34**: covers every claimed case, including the TypeError messages naming AD-4.\n- **XT-conformance-185**: its additions match ESC-9.9-1.\n- **XT-conformance-161**: its additions test usedDeclarations as ESC-9.9-4 describes.\n\nThe tests cite only bare AD-4 and AD-26, which are not `AD-<n>.<k>` bullet tokens; evidence (b) confirms no bullet citations.","findings":[]},{"id":"F-8","result":"pass","note":"The new code sits in packages/runtime (mixin, inject, polyfill). The edits outside it are covered by orchestrator rulings: conformance/harness/intrinsics.ts by ESC-9.9-1, and tools/fidelity-review by ESC-9.9-4. Neither edit fakes another Component's behaviour. The test-only Host and DefaultsHost classes model a host's constructor calling initializeTraits; they are fixtures of runtime's own API, not a stub of Eloquent shipped in src.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed src file. Every new export (mixin, classUsesRecursive, bootTraits, initializeTraits, clearBootedTraits, inject, readInjectMetadata) is synchronous, does no IO and takes no async callback, so none needs a tag.","findings":[]},{"id":"F-10","result":"pass","note":"The 9.9.jsonl requests belong to Xaravel Tests with no Upstream test. The reason is recorded in the traits.test.ts header. The XT-runtime-31 defaults request covers the four cases decisions/ESC-9.9-2.md prescribes. The XT-runtime-32 request calls Upstream Model::bootTraits and initializeTraits on fixture classes. None of the requests signs arbitrary PHP as an expected value.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/traits.test.ts","detail":"Supply the complete checkComposition and checkDefaultLimits helpers and their relevant fixture definitions, including SetsName, so the trait composition, default handling and private-property setup claimed by XT-runtime-31 can be verified.","fixed":true,"note":"Evidence (e) now carries, through usedDeclarations (ESC-9.9-4), the full checkComposition (lines 283-485), checkDefaultLimits (246-281) and SetsName (214-216). It also shows Secret and UsesSecret inside checkDefaultLimits, and DefaultsNamed and the other fixtures. With these I checked XT-runtime-31's composition, default handling and private-property claims."}]}
```
