---
title: 'Story 11.1: Macroable trait'
type: 'feature'
created: '2026-10-24'
status: 'blocked'
baseline_revision: '08dc0aaab0051c87579232474eed5e2f1d31b2dd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/decisions/DIV-11.md'
  - '{project-root}/decisions/DIV-12.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/macroable` is an empty scaffold. Laravel's `Illuminate\Support\Traits\Macroable` (`macro`, `mixin`, `hasMacro`, `flushMacros`, `__call`, `__callStatic`) has no port, so the 16 `SupportMacroableTest` Test IDs are `not-ported-yet`, and every later package that lists `@xaravel/macroable` has nothing to import.

**Approach:** Port the trait as a runtime trait class (`class X extends mixin(Base, Macroable)`). Keep macros per Scope Frame in `frameStatic`, keyed by the class that uses the trait. Have `macro()` install a dispatcher on that class's prototype and static side, with no Proxy (AD-26, PORTING.md:26). The dispatcher forwards to the real `__call` / `__callStatic`, which bind `this` as Upstream does. Port the Upstream test file and add XT-macroable-1..3.

## Boundaries & Constraints

**Always:**
- Edit only `packages/macroable/**`, the 16 lines of `conformance/expectations/macroable/framework/tests/Support/SupportMacroableTest.jsonl`, and the Story's own Escalations `conformance/escalations/ESC-11.1-<n>.md`. Plus this spec and the Story's sprint-status and manifest status (orchestrator bookkeeping).
- Keep Laravel's names and its message `Method %s::%s does not exist.`, where the class is `fqcn(this)`, the called class. Use `BadMethodCallException` from `@xaravel/runtime`.
- Upstream `static::$macros` is shared by every subclass of the class that uses the trait. Key storage by that using class: the nearest class up the chain from the called class that has its own `macro` member copied by `mixin`. Never key it by the subclass.
- Write routing (AD-5, DIV-11.2):
  - A write inside a unit frame whose kind is `request`, `job` or `command`, or a child of one, throws `ScopeFrameException`.
  - Any other unit frame, a `test` frame included, holds the write in `frameStatic` and discards it when the unit ends.
  - With no active frame, a write throws `ScopeFrameException`, as `frameStatic.set` does (AD-5, "No active frame").
- Dispatchers:
  - Never install over an existing member of the same name: a real method wins over `__call`, as in PHP.
  - A dispatcher is identical in every frame and holds no state. `hasMacro` and dispatch read only the frame's table.
- `mixin(obj, replace = true)` registers every method PHP's `getMethods(IS_PUBLIC|IS_PROTECTED)` would list: the mixin object's prototype-chain methods and its class's static methods, excluding `constructor` and the built-ins of `Object` and `Function`. Each one is invoked with `this` = the mixin, and its result is registered.
- A macro that is a function is called with `this` = the instance (instance call) or the called class (static call). An arrow function (a ported PHP `static function`) ignores `this`, which matches PHP's `bindTo` fallback. A macro that is a callable object (not a function) is called as is.
- Return `null`, never `undefined`, from `macro`, `mixin`, `flushMacros` and the void API (AD-9). A macro's own return value passes through unchanged.
- Port the tests by PORTING.md:
  - Macro bodies are `function` expressions, and PHP `static function` closures are arrow functions.
  - `__CLASS__` becomes the string literal `"Illuminate\\Tests\\Support\\SupportMacroableTest"`.
  - `$obj::m()` is ported by hand as a static call on `obj`'s class.
  - Fixture classes are registered with `registerTestClass` in `setUp`.

**Never:**
- No Proxy (AD-7, AD-26).
- Never change `@xaravel/runtime`, `@xaravel/contracts` or any other package. A missing seam is a `contract` Escalation.
- No module-level or plain-static macro tables.
- No assertion removed or weakened, and no `adapted:` marker without an existing DIV clause.
- Never fake an Application or a sealed state (F-8).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Instance call | `X.macro('a', function () { return this.p })`; `new X().a()` | the instance's `p` | none |
| Static call | `X.macro('s', function () { return this.st() })`; `X.s()` | `this` is `X` | none |
| Flushed macro | macro registered, called, `X.flushMacros()`, then called again | | `BadMethodCallException("Method <fqcn>::name does not exist.")` |
| Real method wins | `X.macro('existing', …)` where `X.prototype.existing` is a real method | the real method still runs; `hasMacro` true | none |
| No replace | `X.mixin(m, false)` when the macro already exists | the old macro is kept | none |
| Request frame | `runInFrame('request', () => X.macro(...))` | | `ScopeFrameException` |
| Test frame isolation | registered in test frame A | `hasMacro` false in test frame B and after A ends | none |
| Subclass shares | `class Y extends X`; `X.macro('m')` | `Y.hasMacro('m')` true; `new Y().m()` works | none |
| No frame | `X.macro(...)` outside any frame | | `ScopeFrameException` |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php`: the Upstream source to port, one-for-one.
- `conformance/upstream/framework/tests/Support/SupportMacroableTest.php`: the 16 tests and their fixtures (`EmptyMacroable`, `TestMacroable`, `TestMixin`).
- `packages/runtime/src/traits/mixin.ts:259`, `mixin(base, ...traits)`:
  - It copies the trait's static and prototype members onto a layer class, with `Mixed<B, Ts>` typing, and `mixin(null, T)` gives a base-less layer.
  - The layer has `macro` as its own static. That is how the using class is found: walk `Object.getPrototypeOf` from `this` to the first class with its own `macro`.
- `packages/runtime/src/scope/scope.ts`:
  - `currentFrame()` at :113 returns `{kind, app}` for the innermost frame only, so a child of a `request` frame shows its own kind.
  - `frameStatic(Class, key, init)` at :194: `get` returns the unit's value, else `init()`; `set` throws `ScopeFrameException` with no unit frame.
- `packages/runtime/src/scope/ScopeFrameException.ts`: the exception class.
- `@xaravel/runtime` also gives `registerClass`, `fqcn`, `registerTestClass` (registry.ts:68, :108, :340) and `BadMethodCallException` (php exceptions, Story 9.10).
- `packages/assert/src/declarations/portedTest.ts` and `packages/assert/src/Framework/TestCase.ts:97` (`expectException` at :108): Ported Test shape. `portedTest` opens the test frame and runs `setUp`.
- `xaravelTest(id, consequence, fn)` from `@xaravel/assert`: the form for the XT tests.
- `conformance/api-surface/macroable.jsonl`: the gate's rows.
  - `macro(name, macro)`, `mixin(mixin, replace = true)`, `hasMacro(name)`, `flushMacros()` and `__callStatic(method, parameters)` are static; `__call(method, parameters)` is an instance method.
  - Parameter names and defaults must match.
- `conformance/inventory/macroable.jsonl`: the assertion floor. `expectException` counts as one assertion.
- `packages/contracts/docs/contracts.md` (`## Divergences` at :299) and `packages/contracts/tests/xaravel/complete.test.ts:161-290`: the docs and close-gate pattern, including the `api-surface:gate` spawn.
- `packages/macroable/{package.json,README.md,LICENSE,src/index.ts}`: the existing scaffold. `src/index.ts` is `export {};`.

## Tasks & Acceptance

**Execution:**
- `packages/macroable/src/Support/Traits/Macroable.ts`: the trait class, ending with `registerClass('Illuminate\\Support\\Traits\\Macroable', Macroable)`.
  - Its statics are `macro`, `mixin`, `hasMacro`, `flushMacros` and `__callStatic`; `__call` is a prototype method.
  - Storage, routing and dispatchers follow the Boundaries.
  - Every public member has a docblock.
- `packages/macroable/src/index.ts`: a named export of `Macroable`.
- `packages/macroable/tests/ported/framework/tests/Support/SupportMacroableTest.test.ts`: all 16 Test IDs.
  - Use `class SupportMacroableTest extends TestCase` with `setUp`, and local fixtures typed through interface or namespace merging.
  - `testCallingUndefinedMacroThrowsException` stays ported as Upstream wrote it, and is not counted as passing until ESC-11.1-1 is ruled. Its Expectations line keeps `skip` with `escalation: "ESC-11.1-1"`, if `expectations:reasons` allows that pair. Otherwise it stays `not-ported-yet`.
- `packages/macroable/tests/xaravel/macroable.test.ts`:
  - XT-macroable-1 covers the runtime trait form: `classUsesRecursive` names the FQCN; calls on instances, through the prototype and statically; `this` binding; subclass sharing; a real method winning; static and arrow closures.
  - XT-macroable-2 covers frames: request, job and command frames throw `ScopeFrameException`; a test frame keeps its overlay and discards it, checked with two concurrent `test` frames; no frame throws.
  - XT-macroable-3 is the close gate: `api-surface:gate macroable` exits 0, the docs page has a `## Divergences` section citing DIV-11.2, and the README links the docs.
- `packages/macroable/docs/macroable.md`: mirrors Laravel's macro documentation (`Macroable` usage, `macro`, `mixin`, `hasMacro`, `flushMacros`). It has a `## Divergences` section that cites DIV-11.2 and the open ESC-11.1-1 and ESC-11.1-2, and states that dispatchers stay on the prototype. Link it from `README.md`.
- `conformance/expectations/macroable/framework/tests/Support/SupportMacroableTest.jsonl`: the 15 passing IDs become `status:"pass"`.
- `conformance/escalations/ESC-11.1-1.md` (`divergence`, test_ids: `testCallingUndefinedMacroThrowsException`):
  - Without a Proxy, a call to a name that was never registered is a JS `TypeError`, not `BadMethodCallException`.
  - Option 1 (recommended): a new DIV-12 clause under which the Ported Test calls `__callStatic('nonExistentMacro', [])` and keeps `expectException(BadMethodCallException)`.
  - Option 2: skip as `intentional-divergence:DIV-12`.
- `conformance/escalations/ESC-11.1-2.md` (`contract`, test_ids: `XT-macroable-2`):
  - AD-5.4's "writes before `sealed` go to that Application's base" needs a sealed-state and base-store seam that the runtime and contracts lack (spec-9-3 deferred it to Foundation and Container).
  - Until then, a boot-time `macro()` with no frame throws.
  - Option 1 (recommended): the runtime gains an Application base-write seam in the Foundation or Container Story that adds sealed state, and Macroable routes pre-`sealed` writes to it then.
  - Option 2: Macroable keeps a per-Application base itself now.

**Acceptance Criteria:**
- Given the test scope `tests/Support/SupportMacroableTest.php::*`, when `bun run harness --story 11.1` runs, then 15 Test IDs pass on `none`, and `testCallingUndefinedMacroThrowsException` waits on ESC-11.1-1.
- Given `bun run harness --xaravel --id 'XT-macroable-*'`, then XT-macroable-1..3 pass.
- Given `bun run typecheck` and `bun run lint`, then both are clean, and `bun run harness` shows no new differences.

## Spec Change Log

- 2026-10-24, implementation: `testCallingUndefinedMacroThrowsException`'s Expectations line is `fail-known` with `escalation: "ESC-11.1-1"`, not `skip`. The Ported Test is declared and runs, so it fails with `TypeError`; the harness counts an expected `skip` with a failing run as a difference, while `fail-known` with the Escalation matches and adds no skip. `expectations:reasons` accepts the pair.
- 2026-10-24, implementation: a write from a frame nested inside a `request`, `job` or `command` frame cannot be recognised, because `currentFrame()` shows only the innermost kind and no runtime export reads the chain. Raised as `conformance/escalations/ESC-11.1-3.md` (`contract`, XT-macroable-2); Macroable throws for those kinds when they are the innermost frame.
- 2026-10-24, implementation: the package's tests import `@xaravel/assert`, so `packages/macroable/package.json` gains `devDependencies` on `@xaravel/assert` and `@xaravel/mockery`, as `@xaravel/contracts` has. `bun install` rewrites `bun.lock` (Protected); the lockfile change is left out of the Story, as Story 10.1 did, for the Maintainer to commit.
- 2026-10-24, implementation: the fixtures type their macros with `declare` members rather than interface merging, which oxlint's `no-unsafe-declaration-merging` rejects.

## Review Triage Log

## Design Notes

PHP resolves a missing method at call time. JS cannot do that without a Proxy, so `macro(name)` makes the name a real member once, and the member then decides per frame. This is why a flushed macro still throws `BadMethodCallException` (testFlushMacros) while a name never registered throws `TypeError` (ESC-11.1-1).

```ts
function dispatcher(name: string) {
  return {
    [name](this: object, ...args: unknown[]) {
      return (this.constructor as MacroableStatic).prototype.__call.call(this, name, args);
    },
  }[name];
}
```

Mark each dispatcher with a private symbol, so a second `macro(name)` knows the member is one of its own and not a real method.

## Verification

**Commands:**
- `bun run harness --story 11.1`: 15 pass, and one line waits on ESC-11.1-1.
- `bun run harness --xaravel --id 'XT-macroable-*'`: 3 pass.
- `bun run typecheck && bun run lint`: clean.
- `bun run api-surface:gate macroable`: exits 0.
- `bun run expectations:check && bun run expectations:reasons && bun run escalations:check`: all OK.

## Auto Run Result

Status: blocked
Blocking condition: implementation verification failed. The tests need `@xaravel/assert` declared in `packages/macroable/package.json` (AD-2 `graph:check`), which changes the Protected `bun.lock` that CI installs with `--frozen-lockfile` (ESC-11.1-4, `protected-path`). `testCallingUndefinedMacroThrowsException` also waits on ESC-11.1-1 (`divergence`, Maintainer), and XT-macroable-2's base and nested-frame cases wait on ESC-11.1-2 and ESC-11.1-3 (`contract`).

The implementation is saved on branch `story/11.1-impl`. Locally, with the lockfile updated:
- `bun run harness --story 11.1`: `checked=16 differ=0` (15 pass, 1 `fail-known` under ESC-11.1-1).
- XT-macroable-1..3 pass.
- Full `bun run harness`: `checked=21817 differ=0`.
- `typecheck`, `lint` and `api-surface:gate macroable` are clean.

The step-04 review and the Fidelity Review have not run. Both run on the final tree once the Escalations are ruled.
