---
title: 'Story 11.1: Macroable trait'
type: 'feature'
created: '2026-10-24'
status: 'blocked'
baseline_revision: 'dbb449749ff1e35022d4b946ceeee68bbfe011d3'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/decisions/DIV-11.md'
  - '{project-root}/decisions/DIV-12.md'
warnings: [oversized]
deferred:
  - summary: >-
      A macro write from a frame nested under a request, job or command unit (a narrow frame or a child unit) passes the guard, because only the innermost frame's kind is checked.
    evidence: |-
      guardWrite reads currentFrame().kind only; runInNarrowFrame's frame carries its own kind and frameStatic routes the write through it into the request unit. decisions/ESC-11.1-3.md approved the runtime frame-chain read (frameKinds or insideFrameKind) as a follow-up naming packages/runtime and packages/macroable, due before the first Http, Queue or Console kernel opens such a frame outside a test.
    location: >-
      packages/macroable/src/Support/Traits/Macroable.ts:61
    severity: medium
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
  - `testCallingUndefinedMacroThrowsException` follows `decisions/ESC-11.1-1.md`: it calls `classOf(this.macroable).__callStatic('nonExistentMacro', [])`, marked `// adapted:DIV-12.10`, and keeps `this.expectException(BadMethodCallException)` (plus Upstream's message check if Upstream asserts one). Its Expectations line is `pass` with `adapted: "DIV-12.10"` and no `escalation`.
- `packages/macroable/tests/xaravel/macroable.test.ts`:
  - XT-macroable-1 covers the runtime trait form: `classUsesRecursive` names the FQCN; calls on instances, through the prototype and statically; `this` binding; subclass sharing; a real method winning; static and arrow closures.
  - XT-macroable-2 covers frames: request, job and command frames throw `ScopeFrameException`; a test frame keeps its overlay and discards it, checked with two concurrent `test` frames; no frame throws.
  - XT-macroable-3 is the close gate: `api-surface:gate macroable` exits 0, the docs page has a `## Divergences` section citing DIV-11.2, and the README links the docs.
- `packages/macroable/docs/macroable.md`: mirrors Laravel's macro documentation (`Macroable` usage, `macro`, `mixin`, `hasMacro`, `flushMacros`). It has a `## Divergences` section that cites DIV-11.2 and DIV-12.10, states that dispatchers stay on the prototype, and describes the boot-time and nested-frame limits as ruled in ESC-11.1-2 and ESC-11.1-3 (follow-ups, not divergences). Link it from `README.md`.
- `conformance/expectations/macroable/framework/tests/Support/SupportMacroableTest.jsonl`: all 16 IDs become `status:"pass"`; `testCallingUndefinedMacroThrowsException` carries `adapted:"DIV-12.10"`.
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
- Given the test scope `tests/Support/SupportMacroableTest.php::*`, when `bun run harness --story 11.1` runs, then all 16 Test IDs pass on `none`, `testCallingUndefinedMacroThrowsException` under `adapted: "DIV-12.10"`.
- Given `bun run harness --xaravel --id 'XT-macroable-*'`, then XT-macroable-1..3 pass.
- Given `bun run typecheck` and `bun run lint`, then both are clean, and `bun run harness` shows no new differences.

## Spec Change Log

- 2026-10-24, implementation: `testCallingUndefinedMacroThrowsException`'s Expectations line is `fail-known` with `escalation: "ESC-11.1-1"`, not `skip`. The Ported Test is declared and runs, so it fails with `TypeError`; the harness counts an expected `skip` with a failing run as a difference, while `fail-known` with the Escalation matches and adds no skip. `expectations:reasons` accepts the pair.
- 2026-10-24, implementation: a write from a frame nested inside a `request`, `job` or `command` frame cannot be recognised, because `currentFrame()` shows only the innermost kind and no runtime export reads the chain. Raised as `conformance/escalations/ESC-11.1-3.md` (`contract`, XT-macroable-2); Macroable throws for those kinds when they are the innermost frame.
- 2026-10-24, implementation: the package's tests import `@xaravel/assert`, so `packages/macroable/package.json` gains `devDependencies` on `@xaravel/assert` and `@xaravel/mockery`, as `@xaravel/contracts` has. `bun install` rewrites `bun.lock` (Protected); the lockfile change is left out of the Story, as Story 10.1 did, for the Maintainer to commit.
- 2026-10-24, resume after rulings: ESC-11.1-1 approved DIV-12.10 (`decisions/ESC-11.1-1.md`), so `testCallingUndefinedMacroThrowsException` is adapted to `__callStatic` and its line becomes `pass` with `adapted: "DIV-12.10"`. ESC-11.1-4 put the grader devDependencies and `bun.lock` on `main`, so the Story's `package.json` diff is empty. ESC-11.1-2 and ESC-11.1-3 approved option 1: XT-macroable-2 stands as it is, and the boot-time and nested-frame cases are follow-ups for the Epic 11 retrospective. The docs, source comments and XT-macroable-3 stop calling those Escalations open. Baseline moved to `main` at dbb449749ff1e35022d4b946ceeee68bbfe011d3 so the review diff carries the whole Story.
- 2026-10-24, implementation: the fixtures type their macros with `declare` members rather than interface merging, which oxlint's `no-unsafe-declaration-merging` rejects.

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 40 findings — high 0, medium 5, low 22, false 9, maybe-false 4
- findings:
  - `[medium]` `[defer]` (edge) A `runInNarrowFrame` nested in a request/job/command unit passes `guardWrite` (the narrow frame's kind is innermost), and the write lands in the request unit — same root cause as ESC-11.1-3 (innermost-kind check only); the approved ruling makes the frame-chain read a runtime follow-up, so deferred with it.
  - `[medium]` `[patch]` (edge) `mixin()` with an empty mixin, or `replace=false` and every name present, does not throw in a request/job/command frame or with no frame — `guardWrite` added at the top of `mixin()`, with an XT-macroable-2 case.
  - `[low]` `[patch]` (edge) `mixin()` runs mixin method bodies before the guard fires — fixed by the same up-front `guardWrite`.
  - `[medium]` `[patch]` (edge) `mixin({})` walks `Object`'s statics and calls `Object.keys` etc. with no arguments (TypeError), contrary to the spec's "excluding the built-ins of Object" — static walk now stops at `Object`; XT-macroable-1 asserts `mixin({})` registers nothing.
  - `[low]` `[reject]` (edge) Macro names that collide with JS built-ins (`toString`, `name`, `length`, `call`) register but never dispatch through a plain call — real but rare in Laravel code; the fix adds built-in exclusion branches; `__call` / `__callStatic` still reach them.
  - `[low]` `[reject]` (edge) A detached static dispatcher (`arr.map(Widget.greet)`) has `this` undefined — ordinary JS method semantics; capturing the class would break called-class binding for subclasses.
  - `[low]` `[reject]` (edge) A PHP array callable `[obj, 'method']` macro throws `Value not callable` — ported code writes callables as functions (PORTING.md); supporting arrays adds a branch for an unseen case.
  - `[maybe-false]` `[reject]` (edge) `installDispatchers` failing on a frozen class after `slot.set` leaves table and members inconsistent — no frozen Macroable class is reachable in the framework; would be low if true.
  - `[maybe-false]` `[reject]` (edge) `className`'s catch-all may swallow non-registry errors — `fqcn` throws only for an unregistered class; message-only path; would be low if true.
  - `[low]` `[patch]` (edge) `DISPATCHER` symbol is written and never read — deleted.
  - `[medium]` `[patch]` (edge) Docs example registers a macro at module top level, which throws per the page's own Divergences — docs now say where a macro can be registered today.
  - `[low]` `[patch]` (edge) Docs typing advice (interface augmentation) types only the instance side and is the merging the Story moved away from — docs lead with `declare` / `declare static` members.
  - `[false]` `[reject]` (edge) Tasks text says fixtures use interface or namespace merging — fix edits this build's spec; the Spec Change Log already records the `declare` choice.
  - `[medium]` `[patch]` (blind) Docs examples throw as written — same entry as the edge docs example finding; patched together.
  - `[low]` `[patch]` (blind) Docs static-call example `Report.shout("!")` reads `this.title` on the class — the static example now uses a macro without instance state.
  - `[low]` `[patch]` (blind) Docs typing advice conflicts with the `declare` member finding — patched with the edge typing finding.
  - `[low]` `[patch]` (blind) `DISPATCHER` is dead code — patched with the edge finding.
  - `[low]` `[reject]` (blind) Built-in-name macros silently never dispatch — same as the edge built-in finding; rejected for the same reason.
  - `[low]` `[patch]` (blind) `mixin()` does not check the frame up front — patched with the edge finding.
  - `[low]` `[reject]` (blind) Static mixin methods are invoked with `this` = the mixin instance, not its class — the intent contract states "each one is invoked with `this` = the mixin"; Laravel mixins return closures from instance methods, so a static method reading `static::` is unlikely, and the fix adds a branch.
  - `[low]` `[reject]` (blind) A macro returning `undefined` passes it through, against AD-9 — the intent contract says "a macro's own return value passes through unchanged"; ported macro bodies return `null` explicitly.
  - `[false]` `[reject]` (blind) `Value not callable` does not match PHP — PHP 8 throws `Error("Value not callable")` when a non-callable value is called, which is what `callMacro` throws.
  - `[low]` `[patch]` (blind) XT-macroable-3's DIV regex checks only that `DIV-12.md` exists, not clause 12.10 — XT-macroable-3 now asserts each cited clause appears in its DIV record.
  - `[false]` `[reject]` (blind) Spec stale in places (Code Map, ESC task wording, Design Notes, empty triage log) — fix edits this build's spec.
  - `[low]` `[reject]` (blind) The ESC-11.1-2/3 follow-ups sit under `## Divergences` — cosmetic; the page states they are follow-ups; moving them would also change XT-macroable-3.
  - `[false]` `[reject]` (blind) The nested-frame limit has no test — decisions/ESC-11.1-3.md rules that XT-macroable-2 gains the nested case when the runtime read lands; it stands as is now.
  - `[low]` `[reject]` (blind) Dispatchers are process-wide, so a never-registered-in-this-frame name throws `TypeError` or `BadMethodCallException` depending on history — documented ("dispatchers stay on the prototype"); DIV-12.10 covers never-registered names; both throw.
  - `[low]` `[reject]` (blind) `mixin()` copies the table once per method (O(n²)) — mixins have a handful of methods and run rarely; a batch path adds code.
  - `[low]` `[patch]` (verification-gap) Inherited mixin methods and override precedence untested — XT-macroable-1 adds a subclass mixin case.
  - `[low]` `[patch]` (verification-gap) `hasMacro` treating a registered `null` as absent untested — XT-macroable-1 asserts it and the `BadMethodCallException`.
  - `[low]` `[patch]` (verification-gap) The trait itself never being a using class untested — XT-macroable-1 asserts `Macroable.macro` throws `TypeError` and leaks no member.
  - `[low]` `[reject]` (verification-gap, other) `Value not callable` and `class@anonymous` branches untested — side branches of error messages; low, left as is.
  - `[maybe-false]` `[defer]` (intent) Nested request/job/command units only checked at the innermost frame — same root cause as the narrow-frame entry; deferred with it under ESC-11.1-3.
  - `[low]` `[patch]` (intent) A non-test root `unit` frame holding and discarding a write is untested — XT-macroable-2 adds the case.
  - `[false]` `[reject]` (intent) Every test runs inside a test frame — descriptive; XT-macroable-2 covers no-frame, request/job/command and two concurrent test frames.
  - `[maybe-false]` `[reject]` (intent) A plain call on a never-registered name (TypeError) is not asserted — DIV-12.10 behaviour; asserting a JS TypeError adds no protection; would be low.
  - `[false]` `[reject]` (intent) Built-in names and static mixin `this` untested — covered by the rejected built-in and static-`this` rows above.
  - `[false]` `[reject]` (intent) `mixin` guard ordering — same as the patched edge entry.
  - `[false]` `[reject]` (intent) The request-frame matrix row uses `runInRootFrame(kind)` — the auditor states the outcome is equivalent; the matrix row is covered.
  - `[false]` `[reject]` (intent) "Real method wins" uses a method on a base class — the spec's Boundaries say "an existing member … on that target or up its chain"; the matrix row is covered.

### 2026-10-24 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` (fidelity, reviewer 2 reject at tree 33dedd74f35742a4562cab5ba352ff0e519e478a, F-7) XT-macroable-2's new root-`unit` case asserts a macro write succeeds in a non-test frame, but AD-5 (spine, Lifecycle) says base-only writes after `sealed` throw in any non-test frame and no unit frame opens before boot; the intent contract's Boundaries ("Any other unit frame, a `test` frame included, holds the write") conflict with AD-5, which the build loop may not edit and AGENTS.md routes to an Escalation. Raised `conformance/escalations/ESC-11.1-5.md` (option 1 recommended: throw outside test frames). Attempted change saved as [spec-11-1-attempt-2.patch](spec-11-1-attempt-2.patch) and on branch `story/11.1-impl`; code reverted on `story/11.1`.

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
- `bun run harness --story 11.1`: 16 pass, no differences.
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

## Fidelity Review

### Reviewer 1: pass at tree dfb49d522d095be53f879dcbda37c2f3cb838372

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `dbb449749ff1e35022d4b946ceeee68bbfe011d3`, on 2026-10-25T04:09:34.021Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | All 16 Ported Tests preserve Upstream's assertion subjects, expected values and order; the undefined-method call uses the adaptation permitted by DIV-12.10. |
| F-2: No expected value is weakened | pass | Upstream's exact comparisons, boolean expectations and BadMethodCallException expectations remain unchanged. |
| F-3: No assertion is removed without a DIV clause | pass | Every Upstream assertion and exception expectation has a counterpart; none is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | All changed Expectations lines become pass; no new skip reason is introduced. |
| F-5: Every `adapted` marker matches its clause | pass | The DIV-12.10 marker and Expectations adaptation replace only a never-registered macro call with explicit __callStatic, preserving its exception expectation as the clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture used by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The three Xaravel Tests check their declared trait behavior, frame write restrictions and isolation, and API/docs gate. The deferred boot and nested-frame cases agree with ESC-11.1-2 and ESC-11.1-3. |
| F-8: No stub, fake or partial implementation of another Component | pass | Implementation changes stay within Macroable and use existing runtime seams. No Application lifecycle or frame-chain behavior is faked; the supplied decisions explicitly defer those seams. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed framework declarations contain no asyncRoot tags and perform synchronous registration, reflection and dispatch; no demonstrated IO root or permitted async callback requires a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The Story changes no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"dfb49d522d095be53f879dcbda37c2f3cb838372","base":"dbb449749ff1e35022d4b946ceeee68bbfe011d3","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T04:09:34.021Z","items":[{"id":"F-1","result":"pass","note":"All 16 Ported Tests preserve Upstream's assertion subjects, expected values and order; the undefined-method call uses the adaptation permitted by DIV-12.10.","findings":[]},{"id":"F-2","result":"pass","note":"Upstream's exact comparisons, boolean expectations and BadMethodCallException expectations remain unchanged.","findings":[]},{"id":"F-3","result":"pass","note":"Every Upstream assertion and exception expectation has a counterpart; none is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"All changed Expectations lines become pass; no new skip reason is introduced.","findings":[]},{"id":"F-5","result":"pass","note":"The DIV-12.10 marker and Expectations adaptation replace only a never-registered macro call with explicit __callStatic, preserving its exception expectation as the clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture used by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"The three Xaravel Tests check their declared trait behavior, frame write restrictions and isolation, and API/docs gate. The deferred boot and nested-frame cases agree with ESC-11.1-2 and ESC-11.1-3.","findings":[]},{"id":"F-8","result":"pass","note":"Implementation changes stay within Macroable and use existing runtime seams. No Application lifecycle or frame-chain behavior is faked; the supplied decisions explicitly defer those seams.","findings":[]},{"id":"F-9","result":"pass","note":"The changed framework declarations contain no asyncRoot tags and perform synchronous registration, reflection and dispatch; no demonstrated IO root or permitted async callback requires a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The Story changes no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree dfb49d522d095be53f879dcbda37c2f3cb838372

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `dbb449749ff1e35022d4b946ceeee68bbfe011d3`, on 2026-10-25T04:09:34.021Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared each of the 16 portedTest bodies with the Upstream lines from the Inventory sources. testRegisterMacro, testHasMacro (assertTrue foo, then assertFalse bar), testRegisterMacroAndCallWithoutStatic, testWhenCallingMacroClosureIsBoundToObject (assertSame 'instance', then 'static'; static:: becomes this per AD-26), testClassBasedMacros ('instance-Adam'), testClassBasedMacrosNoReplace ('bar', then 'foo'), testFlushMacros and testFlushMacrosStatic (assertSame 'flushMethod', then expectException BadMethodCallException), testMacroWithArguments ('Hello World'), testMacroWithDefaultArguments ('Hello, Guest', then 'Hello, Saleh'), testCallingUndefinedMacroThrowsException (expectException BadMethodCallException), testMethodConflictDoesNotThrowException ('newMethod') and the four static/non-static closure tests ('Taylor') each check the same subject against the same value, in Upstream's order. Static closures became arrow functions. The ported TestMixin and TestMacroable fixtures match Laravel's from memory, but the prompt does not show their Upstream source (only the test methods), so that part is not confirmed. Their members are public here, but no assertion changes. |
| F-2: No expected value is weakened | pass | Every expected value is Upstream's exact literal under assertSame, assertTrue or assertFalse. Each expected exception is still BadMethodCallException. The one changed line, the __callStatic call in testCallingUndefinedMacroThrowsException, carries adapted:DIV-12.10, and that clause keeps the exception expectation unchanged. |
| F-3: No assertion is removed without a DIV clause | pass | Counted assertions per test against the Inventory multisets: assertThat 1 (expectException) where Upstream has it, assertSame 1 or 2, and assertTrue/assertFalse 1 each in testHasMacro. Every Upstream assertion has a counterpart and none is dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The Expectations shard moves all 16 lines from skip/not-ported-yet to pass. No line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | The only marker is '// adapted:DIV-12.10', on classOf(this.macroable!).__callStatic("nonExistentMacro", []), plus the Expectations field adapted "DIV-12.10" on the same test. Clause DIV-12.10 exists in decisions/DIV-12.md and turns an Upstream '$obj::missing()' into '__callStatic('missing', [])', with the exception expectation unchanged. That is exactly the change made, and nothing more. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no error fixture, assigned or changed. The Inventory rows are oracle none:pass, with no committed requests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-macroable-1's body checks every claim in its string: fqcn and classUsesRecursive naming the Upstream FQCN; instance, prototype and static calls with 'this' bound to the instance or the called class (including a subclass); subclass sharing of the using class's table; a real method winning in Base and in the subclass, with no dispatcher installed over it; the trait's own members kept; arrow closures; invokable macros; mixin with prototype and static methods and replace=false. Its AD-26 citation matches the Traits and Macroable rows. XT-macroable-2's body checks throws for macro, flushMacros and mixin with no frame and in request/job/command frames, directly and under a test frame. It also checks that test-frame writes are held, nested-unit writes land in the test frame, macros are discarded when the test frame ends, and two concurrent test frames are isolated, as DIV-11.2, AD-5.5 and AD-5.8 and ruling ESC-11.1-3 require. XT-macroable-3's body checks the api-surface gate (0 unexplained, AD-15.5), the docs' Divergences section with its citations, that each cited DIV file exists, and the README link. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are only in packages/macroable plus its Expectations shard. The frame-kind guard reads currentFrame().kind from @​xaravel/runtime/scope and does not simulate an Application, sealed state or frame chain. ESC-11.1-2 and ESC-11.1-3 rule that those seams are routed to later Stories and the runtime, not faked here. No stub, fake or hard-coded return of another Component was found. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in Macroable.ts or index.ts. Every exported method (macro, mixin, hasMacro, flushMacros, __callStatic, __call) is sync, returns null, boolean or unknown, performs no IO behind a Driver contract and declares no Promise return. So no tag is false and none is missing under AD-6.2, AD-6.13 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"dfb49d522d095be53f879dcbda37c2f3cb838372","base":"dbb449749ff1e35022d4b946ceeee68bbfe011d3","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T04:09:34.021Z","items":[{"id":"F-1","result":"pass","note":"Compared each of the 16 portedTest bodies with the Upstream lines from the Inventory sources. testRegisterMacro, testHasMacro (assertTrue foo, then assertFalse bar), testRegisterMacroAndCallWithoutStatic, testWhenCallingMacroClosureIsBoundToObject (assertSame 'instance', then 'static'; static:: becomes this per AD-26), testClassBasedMacros ('instance-Adam'), testClassBasedMacrosNoReplace ('bar', then 'foo'), testFlushMacros and testFlushMacrosStatic (assertSame 'flushMethod', then expectException BadMethodCallException), testMacroWithArguments ('Hello World'), testMacroWithDefaultArguments ('Hello, Guest', then 'Hello, Saleh'), testCallingUndefinedMacroThrowsException (expectException BadMethodCallException), testMethodConflictDoesNotThrowException ('newMethod') and the four static/non-static closure tests ('Taylor') each check the same subject against the same value, in Upstream's order. Static closures became arrow functions. The ported TestMixin and TestMacroable fixtures match Laravel's from memory, but the prompt does not show their Upstream source (only the test methods), so that part is not confirmed. Their members are public here, but no assertion changes.","findings":[]},{"id":"F-2","result":"pass","note":"Every expected value is Upstream's exact literal under assertSame, assertTrue or assertFalse. Each expected exception is still BadMethodCallException. The one changed line, the __callStatic call in testCallingUndefinedMacroThrowsException, carries adapted:DIV-12.10, and that clause keeps the exception expectation unchanged.","findings":[]},{"id":"F-3","result":"pass","note":"Counted assertions per test against the Inventory multisets: assertThat 1 (expectException) where Upstream has it, assertSame 1 or 2, and assertTrue/assertFalse 1 each in testHasMacro. Every Upstream assertion has a counterpart and none is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The Expectations shard moves all 16 lines from skip/not-ported-yet to pass. No line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"The only marker is `// adapted:DIV-12.10`, on classOf(this.macroable!).__callStatic(\"nonExistentMacro\", []), plus the Expectations field adapted \"DIV-12.10\" on the same test. Clause DIV-12.10 exists in decisions/DIV-12.md and turns an Upstream `$obj::missing()` into `__callStatic('missing', [])`, with the exception expectation unchanged. That is exactly the change made, and nothing more.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no error fixture, assigned or changed. The Inventory rows are oracle none:pass, with no committed requests.","findings":[]},{"id":"F-7","result":"pass","note":"XT-macroable-1's body checks every claim in its string: fqcn and classUsesRecursive naming the Upstream FQCN; instance, prototype and static calls with `this` bound to the instance or the called class (including a subclass); subclass sharing of the using class's table; a real method winning in Base and in the subclass, with no dispatcher installed over it; the trait's own members kept; arrow closures; invokable macros; mixin with prototype and static methods and replace=false. Its AD-26 citation matches the Traits and Macroable rows. XT-macroable-2's body checks throws for macro, flushMacros and mixin with no frame and in request/job/command frames, directly and under a test frame. It also checks that test-frame writes are held, nested-unit writes land in the test frame, macros are discarded when the test frame ends, and two concurrent test frames are isolated, as DIV-11.2, AD-5.5 and AD-5.8 and ruling ESC-11.1-3 require. XT-macroable-3's body checks the api-surface gate (0 unexplained, AD-15.5), the docs' Divergences section with its citations, that each cited DIV file exists, and the README link.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes are only in packages/macroable plus its Expectations shard. The frame-kind guard reads currentFrame().kind from @xaravel/runtime/scope and does not simulate an Application, sealed state or frame chain. ESC-11.1-2 and ESC-11.1-3 rule that those seams are routed to later Stories and the runtime, not faked here. No stub, fake or hard-coded return of another Component was found.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in Macroable.ts or index.ts. Every exported method (macro, mixin, hasMacro, flushMacros, __callStatic, __call) is sync, returns null, boolean or unknown, performs no IO behind a Driver contract and declares no Promise return. So no tag is false and none is missing under AD-6.2, AD-6.13 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 33dedd74f35742a4562cab5ba352ff0e519e478a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `dbb449749ff1e35022d4b946ceeee68bbfe011d3`, on 2026-10-25T04:16:32.037Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | All 16 Ported Tests preserve Upstream's assertion subjects, expected values and order; the undefined-method call uses the adaptation expressly permitted by DIV-12.10. |
| F-2: No expected value is weakened | pass | Exact comparisons, boolean expectations and BadMethodCallException expectations match Upstream; no expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | All 22 Upstream assertions and exception expectations have counterparts; none is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | All changed Expectations lines become pass; no new skip reason is introduced. |
| F-5: Every `adapted` marker matches its clause | pass | The DIV-12.10 marker and Expectations adaptation replace only the never-registered method call with __callStatic, preserving its exception expectation as the clause requires. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The three Xaravel Test bodies check their declared trait behavior, frame write routing and isolation, and API/documentation gate consequences. ESC-11.1-2 and ESC-11.1-3 explicitly authorize the deferred boot and nested-frame cases. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation stays within Macroable and uses existing runtime seams. It introduces no Application, sealed-state or frame-chain substitute; the supplied decisions defer those owning-component changes. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source has no asyncRoot tags or IO terminals. Macro registration, reflection and dispatch remain synchronous and introduce no callback contract requiring async derivation under DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"33dedd74f35742a4562cab5ba352ff0e519e478a","base":"dbb449749ff1e35022d4b946ceeee68bbfe011d3","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T04:16:32.037Z","items":[{"id":"F-1","result":"pass","note":"All 16 Ported Tests preserve Upstream's assertion subjects, expected values and order; the undefined-method call uses the adaptation expressly permitted by DIV-12.10.","findings":[]},{"id":"F-2","result":"pass","note":"Exact comparisons, boolean expectations and BadMethodCallException expectations match Upstream; no expected value is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"All 22 Upstream assertions and exception expectations have counterparts; none is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"All changed Expectations lines become pass; no new skip reason is introduced.","findings":[]},{"id":"F-5","result":"pass","note":"The DIV-12.10 marker and Expectations adaptation replace only the never-registered method call with __callStatic, preserving its exception expectation as the clause requires.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"The three Xaravel Test bodies check their declared trait behavior, frame write routing and isolation, and API/documentation gate consequences. ESC-11.1-2 and ESC-11.1-3 explicitly authorize the deferred boot and nested-frame cases.","findings":[]},{"id":"F-8","result":"pass","note":"The implementation stays within Macroable and uses existing runtime seams. It introduces no Application, sealed-state or frame-chain substitute; the supplied decisions defer those owning-component changes.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source has no asyncRoot tags or IO terminals. Macro registration, reflection and dispatch remain synchronous and introduce no callback contract requiring async derivation under DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 33dedd74f35742a4562cab5ba352ff0e519e478a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `dbb449749ff1e35022d4b946ceeee68bbfe011d3`, on 2026-10-25T04:16:32.037Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 16 ported tests in packages/macroable/tests/ported/framework/tests/Support/SupportMacroableTest.test.ts with the Upstream lines 23-197. Each assertSame/assertTrue/assertFalse/expectException has a counterpart with the same subject and expected value, in the same order. Fixtures TestMacroable/TestMixin/EmptyMacroable follow Upstream (protected members made public, with a comment). '$obj::m()' becomes classOf(obj).m(), and static closures become arrow functions, as the file header explains. |
| F-2: No expected value is weakened | pass | Every expected value ('Taylor', 'instance', 'static', 'instance-Adam', 'bar'/'foo', 'flushMethod', 'Hello World', 'Hello, Guest'/'Hello, Saleh', 'newMethod') is used with assertSame as Upstream does. expectException(BadMethodCallException) is kept unchanged in testFlushMacros, testFlushMacrosStatic and testCallingUndefinedMacroThrowsException. |
| F-3: No assertion is removed without a DIV clause | pass | Assertion counts match the Inventory for each test: for example, testHasMacro has assertTrue 1 and assertFalse 1, testClassBasedMacrosNoReplace has assertSame 2, and testFlushMacros has assertSame 1 plus expectException. No assertion is dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The Expectations shard changes all 16 lines from skip/not-ported-yet to pass. No line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | The only marker is '// adapted:DIV-12.10' on testCallingUndefinedMacroThrowsException, and its Expectations 'adapted' field is DIV-12.10. That clause turns an Upstream call to an unregistered macro, '$obj::missing()', into '__callStatic('missing', [])' and keeps the exception expectation. The port does exactly that and nothing more. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no error fixture, base or changed, for any assigned Oracle request. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-macroable-1 checks everything its consequence string claims: the classUsesRecursive FQCN; instance, prototype and static calls with the right 'this'; macros shared by subclasses; a real method winning; arrow closures, mixins and invokable macros. That matches the AD-26 Traits and Macroable rows. XT-macroable-3 checks the api-surface gate, the docs Divergences section and the README link. XT-macroable-2 cites AD-5, whose rule for writes after 'sealed' (AD-5.5) says base-only writes, macros included, throw inside any non-test frame. Yet the test asserts that a root 'unit' frame holds macro writes, and the implementation throws only for request/job/command. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change edits only packages/macroable and its Expectations shard. It uses existing @​xaravel/runtime APIs (frameStatic, currentFrame, mixin, registerClass) and adds no stub or fake of another Component. The boot-time seam is left to later Stories, as ESC-11.1-2 rules. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in Macroable.ts or index.ts. Every method (macro, mixin, hasMacro, flushMacros, __call, __callStatic) is sync, does no IO behind a Driver contract and is not async because of a DIV-1 callback, so no tag is needed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/macroable/tests/xaravel/macroable.test.ts`: XT-macroable-2 cites AD-5, but its block 'Any other unit frame holds its writes too: a root 'unit' frame' asserts that a macro write succeeds in a non-test root frame. AD-5.5 says base-only writes (macros) throw ScopeFrameException inside a non-test frame. The cited records (DIV-11.2, ESC-11.1-2, ESC-11.1-3) cover only request/job/command and do not allow writes in other non-test kinds (unit, scheduled task, WebSocket message). Either make guardWrite in packages/macroable/src/Support/Traits/Macroable.ts throw in every non-test root frame and update the test and docs/macroable.md (which tells users to register in runInFrame("unit", …)), or cite a recorded ruling that allows these writes.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"33dedd74f35742a4562cab5ba352ff0e519e478a","base":"dbb449749ff1e35022d4b946ceeee68bbfe011d3","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T04:16:32.037Z","items":[{"id":"F-1","result":"pass","note":"Compared all 16 ported tests in packages/macroable/tests/ported/framework/tests/Support/SupportMacroableTest.test.ts with the Upstream lines 23-197. Each assertSame/assertTrue/assertFalse/expectException has a counterpart with the same subject and expected value, in the same order. Fixtures TestMacroable/TestMixin/EmptyMacroable follow Upstream (protected members made public, with a comment). `$obj::m()` becomes classOf(obj).m(), and static closures become arrow functions, as the file header explains.","findings":[]},{"id":"F-2","result":"pass","note":"Every expected value ('Taylor', 'instance', 'static', 'instance-Adam', 'bar'/'foo', 'flushMethod', 'Hello World', 'Hello, Guest'/'Hello, Saleh', 'newMethod') is used with assertSame as Upstream does. expectException(BadMethodCallException) is kept unchanged in testFlushMacros, testFlushMacrosStatic and testCallingUndefinedMacroThrowsException.","findings":[]},{"id":"F-3","result":"pass","note":"Assertion counts match the Inventory for each test: for example, testHasMacro has assertTrue 1 and assertFalse 1, testClassBasedMacrosNoReplace has assertSame 2, and testFlushMacros has assertSame 1 plus expectException. No assertion is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The Expectations shard changes all 16 lines from skip/not-ported-yet to pass. No line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"The only marker is `// adapted:DIV-12.10` on testCallingUndefinedMacroThrowsException, and its Expectations `adapted` field is DIV-12.10. That clause turns an Upstream call to an unregistered macro, `$obj::missing()`, into `__callStatic('missing', [])` and keeps the exception expectation. The port does exactly that and nothing more.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no error fixture, base or changed, for any assigned Oracle request.","findings":[]},{"id":"F-7","result":"fail","note":"XT-macroable-1 checks everything its consequence string claims: the classUsesRecursive FQCN; instance, prototype and static calls with the right `this`; macros shared by subclasses; a real method winning; arrow closures, mixins and invokable macros. That matches the AD-26 Traits and Macroable rows. XT-macroable-3 checks the api-surface gate, the docs Divergences section and the README link. XT-macroable-2 cites AD-5, whose rule for writes after `sealed` (AD-5.5) says base-only writes, macros included, throw inside any non-test frame. Yet the test asserts that a root `unit` frame holds macro writes, and the implementation throws only for request/job/command.","findings":[{"path":"packages/macroable/tests/xaravel/macroable.test.ts","detail":"XT-macroable-2 cites AD-5, but its block 'Any other unit frame holds its writes too: a root `unit` frame' asserts that a macro write succeeds in a non-test root frame. AD-5.5 says base-only writes (macros) throw ScopeFrameException inside a non-test frame. The cited records (DIV-11.2, ESC-11.1-2, ESC-11.1-3) cover only request/job/command and do not allow writes in other non-test kinds (unit, scheduled task, WebSocket message). Either make guardWrite in packages/macroable/src/Support/Traits/Macroable.ts throw in every non-test root frame and update the test and docs/macroable.md (which tells users to register in runInFrame(\"unit\", …)), or cite a recorded ruling that allows these writes.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"The change edits only packages/macroable and its Expectations shard. It uses existing @xaravel/runtime APIs (frameStatic, currentFrame, mixin, registerClass) and adds no stub or fake of another Component. The boot-time seam is left to later Stories, as ESC-11.1-2 rules.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in Macroable.ts or index.ts. Every method (macro, mixin, hasMacro, flushMacros, __call, __callStatic) is sync, does no IO behind a Driver contract and is not async because of a DIV-1 callback, so no tag is needed.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### 2026-10-24 resume (after the ESC-11.1-1..4 rulings)

Status: blocked
Blocking condition: intent gap. The intent contract's write routing ("Any other unit frame, a `test` frame included, holds the write") conflicts with AD-5 (base-only writes throw in any non-test frame after `sealed`, and no unit frame opens before boot). Raised `conformance/escalations/ESC-11.1-5.md` (`divergence`, XT-macroable-2); option 1, recommended, follows AD-5 with no divergence.

- **Implemented:** the ESC-11.1-1 ruling (`testCallingUndefinedMacroThrowsException` via `__callStatic`, `// adapted:DIV-12.10`, Expectations `pass` with `adapted: "DIV-12.10"`), the ESC-11.1-2/3 follow-up wording in docs, source and XT-macroable-3, and the first review pass's patches: `mixin()` guards up front, its static walk stops at `Object`, the dead `DISPATCHER` marker is gone, XT-macroable-1..3 gain inherited-mixin, null-macro, trait-not-a-using-class, root-unit-frame and DIV-clause checks, and the docs fix the registration, static-call and typing guidance.
- **Files:** `packages/macroable/src/Support/Traits/Macroable.ts`, `src/index.ts`, `README.md`, `docs/macroable.md`, `tests/ported/framework/tests/Support/SupportMacroableTest.test.ts`, `tests/xaravel/macroable.test.ts`, and the 16-line Expectations shard.
- **Review:** first pass 40 findings (11 patched entries, 2 deferred under ESC-11.1-3, the rest rejected with reasons in the triage log). Fidelity Review passed 2/2 at tree dfb49d522d095be53f879dcbda37c2f3cb838372; on the patched tree 33dedd74f35742a4562cab5ba352ff0e519e478a reviewer 1 passed and reviewer 2 rejected on F-7 (the AD-5 conflict above). Follow-up review recommended: false.
- **Verification on the patched tree:** `bun run harness --story 11.1` checked=16 differ=0; XT-macroable-1..3 pass; full `bun run harness` checked=21817 differ=0 (7 Variants not run locally); `typecheck`, `lint`, `api-surface:gate macroable`, `expectations:check`, `expectations:reasons`, `escalations:check`, `divergence:check`, `graph:check` clean.
- **Saved:** the full implementation is commit cd664b42 on `story/11.1-impl`, and [spec-11-1-attempt-2.patch](spec-11-1-attempt-2.patch); the code is reverted on `story/11.1`. Resuming under option 1: `guardWrite` throws outside a test frame's chain, XT-macroable-2's root-`unit` case expects `ScopeFrameException`, and the docs say macros register only in test frames until ESC-11.1-2's seam lands; then the Fidelity Review re-runs on the changed tree. Delete the patch file in the PR that applies it.
- **Residual risk:** the narrow-frame / nested-unit case (deferred) waits on ESC-11.1-3's runtime read.
