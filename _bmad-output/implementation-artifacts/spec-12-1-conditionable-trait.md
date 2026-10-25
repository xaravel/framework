---
title: 'Story 12.1: Conditionable trait'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: 'bef0210abf65630a1fe299550adb7c79aea51296'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/decisions/DIV-1.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/docs/ops/api-surface.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/conditionable` is an empty scaffold (`src/index.ts` is `export {};`). Laravel's `Illuminate\Support\Traits\Conditionable` (`when`, `unless`) and `Illuminate\Support\HigherOrderWhenProxy` have no port, so all 8 Test IDs are `not-ported-yet`, and every later package that mixes Conditionable in has nothing to import.

**Approach:** Port the trait as a runtime trait class (`class X extends mixin(Base, Conditionable)`) and the proxy as a plain class, one-for-one from Upstream, with Upstream's explicit `__get(key)` / `__call(method, parameters)` methods and no JS Proxy. `when` / `unless` are AD-6 dual helpers: an async callback makes them return a Promise. Port the 4 callback tests of `SupportConditionableTest` and add XT-conditionable-1..3. The other 4 Test IDs cannot be done by this Story; each goes to an Escalation (below) and the Story halts `blocked` on them.

## Boundaries & Constraints

**Always:**
- Edit only `packages/conditionable/**`, the 8 lines in `conformance/expectations/conditionable/**`, and `conformance/escalations/ESC-12.1-<n>.md`. Orchestrator bookkeeping (this spec, sprint status, the `stories/12.1.md` status) is the only other change.
- Files sit at the Upstream file path: `src/Traits/Conditionable.ts` (FQCN `Illuminate\Support\Traits\Conditionable`) and `src/HigherOrderWhenProxy.ts` (FQCN `Illuminate\Support\HigherOrderWhenProxy`). Each file ends with `registerClass('<FQCN>', X)`. `src/index.ts` has named exports only.
- Port Upstream's logic exactly:
  - A `value` that is a function (not a class constructor) is called with `this` and replaced by its result.
  - Argument count is `arguments.length`, standing in for `func_num_args()`. With 0 arguments, `when` returns `new HigherOrderWhenProxy(this)`, and `unless` returns that proxy after `.negateConditionOnCapture()`. With 1 argument, `when` returns the proxy with `.condition(value)`, and `unless` returns it with `.condition(!truthy(value))`.
  - Otherwise, if PHP-truthy (`toBool` from `@xaravel/runtime`; `unless` negates), the result is `callback(this, value) ?? this`. Else, if `default` is given, it is `default(this, value) ?? this`. Else it is `this`.
  - The proxy's `condition`, `negateConditionOnCapture`, `__get(key)` and `__call(method, parameters)` follow Upstream line for line. `__get` reads `target[key]`, and `__call` calls `target[method](...parameters)`. A captured condition is negated with PHP `!` (`!toBool(x)`).
- Dual helper (AD-6, DIV-1): `when` / `unless` return a Promise only when a callback returns a native `Promise` (`instanceof Promise`). That covers the `value` closure, `callback` and `default`. The Promise resolves to what the sync path would return, and a Promise condition is awaited, never tested for truthiness. A thenable that is not a Promise (a Builder) is an ordinary value, so `when(c, q => q.where(...))` stays sync. The types use overloads: a sync callback typed `NotPromise<R>` gives `R | this`, and an async one gives `Promise<…>` with an `@asyncRoot callback` tag. A `T | Promise<T>` return type is never declared.
- AD-26 options form, which the api-surface gate requires (two or more optional parameters): `when({ value, callback, default })` and `unless(...)` are also accepted, keys being the camelCase PHP names. `default` is a reserved word, so the positional parameter is `defaultValue`. Detection is narrow and lives in one helper:
  - The argument is the only one, and it is a plain object (prototype `Object.prototype` or `null`, not a contract token).
  - Its own keys are a non-empty subset of `value`, `callback`, `default`, with at least one of `callback` / `default`.
  - Each of `callback` / `default` that is present is a function or `null`.
  - Every other object is a `value`. The remaining collision (a PHP array of exactly that shape used as a condition) is raised as ESC-12.1-3, not decided here.
- `null` is the only absent value, so never return `undefined` (AD-9). Callback results go through `?? this`.
- Port the tests by `PORTING.md`. PHP closures that do not use `$this` become arrow functions. `ConditionableLogger` is a local fixture registered with `registerTestClass`. Its `$toggle` property and `toggle()` method are left out, with a comment pointing to ESC-12.1-1: only the two proxy tests use them, and JS cannot hold both under one name.
- Every public member has a docblock. Docs go in `packages/conditionable/docs/conditionable.md`, linked from `README.md`.

**Never:**
- No JS `Proxy`, and no dynamic forwarding members installed on the proxy (AD-7, AD-26). How `proxy.log('one')` / `proxy.toggle` reach the target is ESC-12.1-1.
- Never change `@xaravel/runtime`, `@xaravel/contracts`, `tools/` or any other package. In particular, never define a local `BlockedByComponentError`: ESC-5.3-1 puts it in `@xaravel/runtime` (ESC-12.1-2).
- No assertion removed or weakened, no `adapted:` marker, and no body for the 4 escalated Test IDs.
- No module variables or static state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Truthy value | `x.when(2, cb, def)` | `cb(x, 2) ?? x`; `def` not called | none |
| Closure value | `x.when(s => s.has('init'), cb)` | closure's result decides; `cb` gets it as `value` | none |
| Falsy, default | `x.when(null, cb, def)` / `x.when("0", cb, def)` | `def(x, value) ?? x` | none |
| Falsy, no default | `x.when(false, cb)` | `x` | none |
| No arguments | `x.when()` | a `HigherOrderWhenProxy` with no condition; `unless()` also negates on capture | none |
| One argument | `x.when(false)` / `x.unless(true)` | proxy with condition `false`; `__call('log', ['a'])` returns `x` without calling `log` | none |
| Capture | `x.when().__call('has', ['init'])` then `.__call('log', ['3'])` | condition is `has`'s result; `log` runs only if truthy | none |
| Async callback | `x.when(true, async s => 1)` | a Promise resolving `1` | rejection propagates |
| Async value | `x.when(async s => false, cb, def)` | a Promise; `def` runs after the value settles | none |
| Builder-like thenable | callback returns an object with `then` that is not a Promise | returned as is, sync | none |
| Options form | `x.when({ value: true, callback: cb })` | same as `x.when(true, cb)` | none |
| Plain-object value | `x.when({ a: 1 }, cb)` | truthy object, `cb` runs | none |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Conditionable/Traits/Conditionable.php` and `.../HigherOrderWhenProxy.php` are the Upstream source, ported one-for-one.
- `conformance/upstream/framework/tests/Support/SupportConditionableTest.php` holds the 6 tests and the `ConditionableLogger` fixture (`values`, `toggle`, `log(...values)`, `has(value)`, `toggle()`). Lines 110-164 are the proxy tests.
- `conformance/upstream/framework/tests/Conditionable/ConditionableTest.php` builds an Eloquent `Capsule\Manager` (sqlite) in `setUp` and asserts `TestConditionableModel::query()->when(...)` is a proxy or a `Builder`. It needs `database`, which is phase 4 in `tools/scaffold/packages.jsonl`.
- `conformance/api-surface/conditionable.jsonl` lists the gate's rows. The proxy has `__construct(target)`, `condition(condition)`, `negateConditionOnCapture()`, `__get(key)` and `__call(method, parameters)`. The trait has `when` and `unless` with `(value = null, ?callable callback = null, ?callable default = null)`, which needs both the positional and the options form (`docs/ops/api-surface.md` "Options form"). The reserved word `default` becomes `defaultValue`.
- `conformance/inventory/conditionable.jsonl` sets the floor: `assertSame: 2` per Support test, and `assertInstanceOf: 5` per ConditionableTest test.
- `packages/runtime/src/traits/mixin.ts` provides `mixin`, `classUsesRecursive`. `@xaravel/runtime` also gives `registerClass`, `registerTestClass`, `fqcn`, `toBool` and `isContractToken`.
- `packages/contracts/src/async/index.ts:46` defines `NotPromise<T>`.
- `packages/mockery/src/JMac/Testing/Double.ts:51` (`isOptions`) is the existing plain-object options test, a pattern to follow, not to import.
- `packages/macroable/src/Traits/Macroable.ts`, `packages/macroable/tests/ported/.../SupportMacroableTest.test.ts`, `packages/macroable/tests/xaravel/macroable.test.ts` (XT-macroable-3 at :425 spawns `api-surface:gate`) and `packages/macroable/docs/macroable.md` show the trait, ported-test, XT and docs patterns this Story follows.
- `tools/async-surface/async-surface.ts:44` treats overloads as one method, async if any signature returns a Promise, with the tag on any signature. `bun run async-surface conditionable` writes `packages/conditionable/async-surface.json`.
- `conformance/escalations/ESC-11.1-1.md` is the format model for an Escalation (`test_ids`, `trigger`, `proposed`, `evidence`).
- `decisions/ESC-5.3-1.md` puts `BlockedByComponentError` in `@xaravel/runtime`, first raised by Story 17.2. `conformance/harness/compare.ts:121` matches `blocked-by:<c>` only on that error.

## Tasks & Acceptance

**Execution:**
- `packages/conditionable/src/HigherOrderWhenProxy.ts`: `class HigherOrderWhenProxy<T>`, with Upstream's protected state as `protected` fields and the five methods per the Boundaries. Its last line is `registerClass("Illuminate\\Support\\HigherOrderWhenProxy", HigherOrderWhenProxy)`.
- `packages/conditionable/src/Traits/Conditionable.ts`: the trait class with the `when` / `unless` overloads and one shared implementation (sync path, Promise path, options detection), then `registerClass("Illuminate\\Support\\Traits\\Conditionable", Conditionable)`.
- `packages/conditionable/src/index.ts`: export `Conditionable` and `HigherOrderWhenProxy`.
- `packages/conditionable/tests/ported/framework/tests/Support/SupportConditionableTest.test.ts`: port `testWhenConditionCallback`, `testWhenDefaultCallback`, `testUnlessConditionCallback` and `testUnlessDefaultCallback` exactly. The file header names ESC-12.1-1 for the two proxy tests.
- `packages/conditionable/tests/xaravel/conditionable.test.ts`:
  - XT-conditionable-1: a closure `value` decides the branch through its result (PHP truthiness, including `"0"` and an empty array). With no callback, `when()` / `when(v)` / `unless()` / `unless(v)` return a `HigherOrderWhenProxy`, and its `__call` / `__get` capture and apply conditions as Upstream does, including `negateConditionOnCapture`. Also checks the options form, a plain-object value, and `classUsesRecursive` naming the FQCN.
  - XT-conditionable-2: an async `callback`, `default` or `value` closure returns a Promise of the sync result; a sync callback returns `T`, not a Promise; a non-Promise thenable stays sync; `async-surface.json` lists `Conditionable.when` / `Conditionable.unless` with root `callback`.
  - XT-conditionable-3: the close gate: `api-surface:gate conditionable` exits 0, the docs page has a `## Divergences` section citing the DIVs it relies on, each cited file exists, and the README links the docs.
- `packages/conditionable/docs/conditionable.md`: mirror Laravel's coverage of `when` / `unless` and the proxy. The `## Divergences` section cites DIV-1 (dual helper) and DIV-12, and names ESC-12.1-1..3 as open.
- `packages/conditionable/async-surface.json`: generated by `bun run async-surface conditionable`.
- `conformance/expectations/conditionable/framework/tests/Support/SupportConditionableTest.jsonl`: the 4 ported IDs become `pass`. `testWhenProxy` and `testUnlessProxy` stay `skip` / `not-ported-yet` with `escalation: "ESC-12.1-1"`.
- `conformance/expectations/conditionable/framework/tests/Conditionable/ConditionableTest.jsonl`: both stay `skip` / `not-ported-yet` with `escalation: "ESC-12.1-2"`.
- `conformance/escalations/ESC-12.1-1.md` (`divergence`; test_ids `testWhenProxy`, `testUnlessProxy`):
  - The tests call target methods (`log`, `has`) and read a target property (`toggle`) on the proxy through PHP `__call` / `__get`. PORTING's `__get` row is "None" outside `Model`, and the fixture's `$toggle` property and `toggle()` method cannot share one JS name.
  - Option 1 (recommended): a DIV-12 clause, with two parts.
    - The proxy gets generated delegating members: at construction, one same-named member per method on the target's prototype chain (below `Object.prototype`) and per own property, each routing through `__call` / `__get`. Its own five members and `then` are excluded.
    - A test fixture whose property and method share a name keeps the method, and the property becomes `<name>Property`; Upstream reads of it are adapted to that name.
  - Option 2: skip both as `intentional-divergence:DIV-12`.
- `conformance/escalations/ESC-12.1-2.md` (`contract`; test_ids `ConditionableTest::testWhen`, `::testUnless`):
  - The tests need Eloquent (`database`, phase 4), so the right line is `skip` / `blocked-by:database`. The harness matches that only on a `BlockedByComponentError(database)` failure, and ESC-5.3-1 leaves the class to Story 17.2 in `@xaravel/runtime`, which this Story may not edit.
  - Option 1 (recommended): add `BlockedByComponentError` to `@xaravel/runtime` now, in an Infrastructure change, as ESC-5.3-1 specifies, and move that criterion off Story 17.2. The tests are then ported throwing it, with `blocked-by:database`.
  - Option 2: move both Test IDs to the Database Story that adds Eloquent.
- `conformance/escalations/ESC-12.1-3.md` (`divergence`; test_ids `XT-conditionable-1`):
  - AD-26's options form for `when(value, callback, default)` has no required leading parameter, so `when({ value, callback })` is indistinguishable from a PHP array condition of that shape. The narrow detection rule above silently treats such an array as options.
  - Option 1 (recommended): record that rule as a DIV-12 clause.
  - Option 2: an `exceptions.jsonl` citation exempts `when` / `unless` from the options form, and only the positional form is accepted.

**Acceptance Criteria:**
- Given `bun run harness --story 12.1`, then the 4 ported Test IDs pass on `none`, and the other 4 match their `skip` lines, with no differences.
- Given `bun run harness --xaravel --id 'XT-conditionable-*'`, then XT-conditionable-1..3 pass.
- Given `bun run typecheck`, `bun run lint`, `bun run async-surface --all --check`, `bun run expectations:check`, `bun run expectations:reasons` and `bun run escalations:check`, then all pass.
- Given `bun run story:check 12.1`, then it fails only on `escalations` (ESC-12.1-1..3 open) and on the `tests` lines they hold, together with whatever is still unrun at this point (`approvals` before the Fidelity Review, `full-run` before CI). The Story halts `blocked` on the three Escalations.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 29 findings — high 5, medium 10, low 13, false 1, maybe-false 0
- intent_gap: the `<intent-contract>` Boundaries say an async callback "gives `Promise<…>` with an `@asyncRoot callback` tag". `conformance/review/fidelity.md` F-9 says a dual helper (AD-6's Dual helpers rule) "is not async and takes no tag: it returns its callback's own type … and never a declared Promise or thenable type" (the runtime's `runInFrame<T>(…, fn: () => T): T` shape, ESC-9.3-1). The contract is read-only here, so the code was saved to [12-1-attempt-1.patch](12-1-attempt-1.patch) and reverted from `packages/conditionable/**`. The 4 ported Expectations lines went back to `skip` / `not-ported-yet`. Questions for the re-plan:
  1. `when` / `unless` take no tag and are typed by their callbacks' own types (`R | D | this`, with no declared Promise), and the package's `async-surface.json` has no line for them. Confirm this reading of F-9.
  2. Under that typing, an async `value` closure or a Promise condition has no callback type to return. Should the types forbid it (`NotPromise<V>`) while the runtime still awaits it, so a Promise is never tested for truthiness? Or should the runtime throw?
- The `patch` rows below are moot this pass (cascade). They are logged so the re-derivation applies them on top of the saved patch.
- findings:
  - `[medium]` `[patch]` Blind: the proxy's `__get` / `__call` capture stores a Promise result (an async target method) as the condition, and `toBool(Promise)` is always true — verified at `HigherOrderWhenProxy.ts` `__get` / `__call`: `this.condition(…condition)` with no Promise check. To apply: when a captured result is a Promise, return a Promise of `this.condition(<settled, negated when asked>)`, as `conditional()` does.
  - `[low]` `[patch]` Blind: `isClosure` uses a `Function.prototype.toString` regex, so native constructors (`Date`, `Map`) and bound classes are called as closures — verified: `Date`'s source text is `function Date() { [native code] }`. To apply: also treat a function with a registered FQCN (`fqcn` brand), or a native constructor, as a class, and reuse Mockery's rule (`packages/mockery/src/support/values.ts:48`) rather than add a third copy.
  - `[low]` `[patch]` Blind: there is no `?callable` check at entry. PHP throws `TypeError` for `when(false, 42)` on any branch, while the port returns `this` silently. Verified at `invoke` / `settle`. A silent PHP difference is never rejected as rare (Epic 11 lesson). To apply: check `callback` / `default` at entry (`null` or a function), else throw `TypeError` with PHP's `Argument #2 ($callback) must be of type ?callable, <type> given`.
  - `[medium]` `[patch]` Blind: `__call` on a method the target lacks throws a JS `TypeError` from `target[method]!(…)`, where PHP calls the target's own `__call` or throws `Error("Call to undefined method X::m()")`. To apply: call the target's `__call(method, parameters)` when it has one (a Macroable target), else throw PHP `Error` with Upstream's message. Likewise `__get` falls back to the target's `__get` for a missing key.
  - `[low]` `[patch]` Blind: ESC-12.1-1 option 1's exclusion list named only five proxy members. A target member named like the proxy's state or helpers (`call`, `read`, `target`) would overwrite them. Applied: the Escalation now excludes every member the proxy declares and requires its state and helpers to be `#private`.
  - `[medium]` `[intent_gap]` Blind: `async-surface.json` records only the `callback` root, while value-only overloads are tagged `@asyncRoot callback`. Same root cause as the F-9 findings below: dual helpers take no tag.
  - `[low]` `[patch]` Blind: the docs cite bare "DIV-12" for the proxy's state names, where the code cites DIV-12.2 and the `PORTING.md` pair list. To apply: cite `DIV-12.2` and the pair-list row in the docs' Divergences section.
  - `[low]` `[patch]` Blind: some behaviour has no tests: Promise capture through `__call` / `__get`, an `unless` options form with only `default`, a rejected value closure, a non-Promise thenable returned by the value closure, and `Object.create(null)` options. To apply: add them to XT-conditionable-1 / -2.
  - `[false]` `[reject]` Blind: unclear whether the harness confirms that the two unported proxy IDs stay `skip`. Refuted: `docs/ops/harness.md` Matching says a `skip` line matches `skip` or `missing`, and `bun run harness --story 12.1` checked all 8 lines with `differ=0`.
  - `[low]` `[reject]` Blind: XT-conditionable-3 is slow, its README check is a substring, and the README example does not call `when`. It follows XT-macroable-3's accepted pattern (`packages/macroable/tests/xaravel/macroable.test.ts:425`), the gate spawn is the check AD-15 asks for, and nobody meets this in everyday use.
  - `[medium]` `[patch]` Edge: a Promise captured by the proxy is truthy. Same defect as the first Blind row.
  - `[medium]` `[patch]` Edge: a missing method gives a JS `TypeError`, not PHP's `Error`. Same defect as the Blind `__call` row.
  - `[low]` `[patch]` Edge: a bound class is called as a closure. Same defect as the Blind `isClosure` row.
  - `[low]` `[patch]` Edge: `?callable` is not checked at entry. Same defect as the Blind entry-check row.
  - `[low]` `[patch]` Edge: an options object with `callback: undefined` is rejected as options, though AD-9 reads `undefined` as `null` — verified: `record[key] !== null && typeof record[key] !== "function"` returns null for `undefined`. To apply: compare with `!= null`.
  - `[low]` `[patch]` Verification gap: the non-null, non-callable callback branch of `invoke` is never asserted. To apply: assert PHP's error for `when(true, 5)` (with the entry check above, the `TypeError`).
  - `[low]` `[patch]` Verification gap: the proxy's `normalizeNull` (AD-9) is unobserved. To apply: assert `null` for `when(true).__get("missing")` and for a void method through `__call`.
  - `[low]` `[patch]` Verification gap: `readOptions`'s prototype and contract-token checks are not pinned. To apply: check that a class instance with an own `callback` is a value, and that `Object.create(null)` options are read as options.
  - `[low]` `[patch]` Verification gap (other): `isClosure` calls built-in and bound classes. Same defect as the Blind `isClosure` row.
  - `[medium]` `[patch]` Verification gap (other): a missing method gives a native `TypeError`. Same defect as the Blind `__call` row.
  - `[medium]` `[reject]` Intent: AC1 is literally unmet, with 4 IDs still `not-ported-yet`. Held by ESC-12.1-1 and ESC-12.1-2 under AGENTS.md's stop rules. The Story halts `blocked` on them, and they are not decided locally.
  - `[medium]` `[reject]` Intent: the higher-order proxy is reachable only through `__call` / `__get`, not `x.when(c).method()`. This is ESC-12.1-1, which waits on the Maintainer (a new DIV-12 clause).
  - `[medium]` `[reject]` Intent: the Eloquent Builder surface (`ConditionableTest`) is not exercised and not marked `blocked-by:database`. This is ESC-12.1-2 (contract: `BlockedByComponentError` is not in `@xaravel/runtime` until Story 17.2).
  - `[medium]` `[reject]` Intent: the options form and its shape rule add behaviour the Story text does not name. AD-26 and the api-surface gate require the form, and the overlap is ESC-12.1-3.
  - `[high]` `[reject]` Fidelity F-4 (both reviewers' tree a4c084f4…; reviewer 1 failed it): `ConditionableTest` should be `blocked-by:database`. That needs ESC-12.1-2's ruling, so the reject stands until the ruling lets the line change.
  - `[high]` `[intent_gap]` Fidelity F-9: dual helpers take no `@asyncRoot` tag and declare no Promise return type. The contract required both (see the questions above).
  - `[high]` `[intent_gap]` Fidelity F-7: XT-conditionable-2 asserts `async-surface.json` lines that a dual helper does not have. Same root cause.
  - `[high]` `[intent_gap]` Fidelity F-9: remove the 16 `@asyncRoot callback` tags and keep the callbacks' own return types. Same root cause.
  - `[high]` `[intent_gap]` Fidelity F-9: regenerate `async-surface.json` without the two lines. Same root cause.

## Design Notes

**Why `instanceof Promise`, not "thenable".** Builders and Relations are thenable (AD-6), and `$query->when($x, fn ($q) => $q->where(...))` is Laravel's commonest use. Treating a returned thenable as async would await the Builder, which runs the query. AD-6's "async callback" is an `async` function, which always returns a native Promise.

**Why the proxy tests are not ported now.** `->when()->has('init')->log('three')` needs the proxy to answer arbitrary target names. That would mean installing members at runtime from the target's shape. PORTING's `__call` row ("explicit generated delegating methods, typed by the target contract") was written for a fixed target contract, and its `__get` row says "None". Building that mechanism without a ruling would decide a divergence locally. Upstream's own `__call` / `__get` are ported and tested by XT-conditionable-1.

## Verification

**Commands:**
- `bun run harness --story 12.1`: 4 pass, 4 skips as listed, no differences.
- `bun run harness --xaravel --id 'XT-conditionable-*'`: 3 pass.
- `bun run typecheck && bun run lint`: clean.
- `bun run api-surface:gate conditionable`: exits 0.
- `bun run async-surface --all --check`: no drift.
- `bun run expectations:check && bun run expectations:reasons && bun run escalations:check`: all OK.

## Auto Run Result

Status: blocked
Blocking condition: intent gap (the dual-helper typing in the intent contract contradicts F-9; see the Review Triage Log's questions), and the open Escalations ESC-12.1-1 (proxy members, `divergence`), ESC-12.1-2 (`BlockedByComponentError` for `blocked-by:database`, `contract`) and ESC-12.1-3 (options form against a condition, `divergence`), all waiting on the Maintainer.

- **Implemented, then reverted.** The trait, the proxy, 4 ported tests, XT-conditionable-1..3, the docs and `async-surface.json`, as the spec describes. They are saved in [12-1-attempt-1.patch](12-1-attempt-1.patch), which applies at `baseline_revision`. Before reverting, the harness showed `checked=8 differ=0`, the 3 XTs passed, and these were all clean: typecheck, lint, `api-surface:gate conditionable` (0 unexplained), `async-surface --all --check`, `expectations:check` / `:reasons` and `escalations:check`.
- **Kept.** `conformance/escalations/ESC-12.1-1.md`, `-2.md` and `-3.md`. The four escalated Expectations lines keep `skip` / `not-ported-yet` with their Escalation. The four ported lines are back to `skip` / `not-ported-yet`. After the revert, `bun run harness --story 12.1` gives `checked=8 differ=0`, and `expectations:check`, `expectations:reasons` and `escalations:check` are OK.
- **Review.** 29 findings. 16 `patch` rows are moot this pass and must be applied on re-derivation. 5 `intent_gap` rows (F-9 / F-7 and the async-surface root). 8 rejects: 5 held by the Escalations (including the F-4 reject that stands at tree a4c084f4…), 1 false, and 2 low that were not worth fixing.
- **Next attempt.** After the rulings, re-plan the contract's async typing per F-9 (Review Triage Log questions 1–2). Apply the saved patch and the logged patch rows, then delete the patch file in that PR.
- **Follow-up review recommended:** false (nothing was patched this pass).

## Fidelity Review

### Reviewer 1: reject at tree a4c084f435871bde4f51192c6b59d01a9e0d6b6e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `bef0210abf65630a1fe299550adb7c79aea51296`, on 2026-10-25T09:25:03.432Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Each of the four added Ported Tests preserves its two Upstream assertions, subjects, expected arrays and assertion order. |
| F-2: No expected value is weakened | pass | The eight ported assertSame comparisons retain Upstream's exact expected values; no comparison or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Each added Ported Test retains both Upstream assertions. The four explicitly unported tests remain skipped rather than becoming tests with fewer assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | fail | The Eloquent tests retain not-ported-yet although their documented dependency is database, which precedes not-ported-yet. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion carries an adapted marker, and all Expectations adapted fields remain null. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The three Xaravel Test bodies check their stated closure, proxy, options, async-result, surface, documentation and gate consequences; their named architecture rules correspond to those checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes stay within conditionable. The test-only FakeBuilder checks generic thenable handling and implements no Database behavior; no substitute Eloquent or runtime error implementation is added. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared the Promise overloads and callback tags against the explicit dual-helper exception in F-9 and AD-6.5. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

- **F-4** `conformance/expectations/conditionable/framework/tests/Conditionable/ConditionableTest.jsonl`: Resolve ESC-12.1-2 so these tests can use blocked-by:database with the required BlockedByComponentError, or obtain the proposed ownership transfer. The open escalation does not approve retaining the lower-precedence reason for a known later-Component dependency.
- **F-9** `packages/conditionable/src/Traits/Conditionable.ts`: when and unless are designated dual helpers, which F-9 requires to carry no asyncRoot tag and never declare a Promise or thenable return type. Both currently have multiple @​asyncRoot callback tags and explicit Promise-returning overloads. Express callback-dependent return types under the dual-helper rule and remove those tags; update async-surface.json accordingly.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"a4c084f435871bde4f51192c6b59d01a9e0d6b6e","base":"bef0210abf65630a1fe299550adb7c79aea51296","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T09:25:03.432Z","items":[{"id":"F-1","result":"pass","note":"Each of the four added Ported Tests preserves its two Upstream assertions, subjects, expected arrays and assertion order.","findings":[]},{"id":"F-2","result":"pass","note":"The eight ported assertSame comparisons retain Upstream's exact expected values; no comparison or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Each added Ported Test retains both Upstream assertions. The four explicitly unported tests remain skipped rather than becoming tests with fewer assertions.","findings":[]},{"id":"F-4","result":"fail","note":"The Eloquent tests retain not-ported-yet although their documented dependency is database, which precedes not-ported-yet.","findings":[{"path":"conformance/expectations/conditionable/framework/tests/Conditionable/ConditionableTest.jsonl","detail":"Resolve ESC-12.1-2 so these tests can use blocked-by:database with the required BlockedByComponentError, or obtain the proposed ownership transfer. The open escalation does not approve retaining the lower-precedence reason for a known later-Component dependency.","kind":"defect"}]},{"id":"F-5","result":"n/a","note":"No assertion carries an adapted marker, and all Expectations adapted fields remain null.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"The three Xaravel Test bodies check their stated closure, proxy, options, async-result, surface, documentation and gate consequences; their named architecture rules correspond to those checks.","findings":[]},{"id":"F-8","result":"pass","note":"Framework changes stay within conditionable. The test-only FakeBuilder checks generic thenable handling and implements no Database behavior; no substitute Eloquent or runtime error implementation is added.","findings":[]},{"id":"F-9","result":"fail","note":"Compared the Promise overloads and callback tags against the explicit dual-helper exception in F-9 and AD-6.5.","findings":[{"path":"packages/conditionable/src/Traits/Conditionable.ts","detail":"when and unless are designated dual helpers, which F-9 requires to carry no asyncRoot tag and never declare a Promise or thenable return type. Both currently have multiple @asyncRoot callback tags and explicit Promise-returning overloads. Express callback-dependent return types under the dual-helper rule and remove those tags; update async-surface.json accordingly.","kind":"defect"}]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree a4c084f435871bde4f51192c6b59d01a9e0d6b6e

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `bef0210abf65630a1fe299550adb7c79aea51296`, on 2026-10-25T09:25:03.432Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared the four ported tests (testWhenConditionCallback, testWhenDefaultCallback, testUnlessConditionCallback, testUnlessDefaultCallback) with SupportConditionableTest.php lines 10-108. Each has the two Upstream assertSame calls, on the same 'logger.values' subject, with the same expected arrays, in the same order. The inputs are the same too: values 2, null, the has('init') and has('missing') closures, and the log('init') prefix. testWhenProxy, testUnlessProxy and the two ConditionableTest tests are not ported; they stay skip under escalations. |
| F-2: No expected value is weakened | pass | Every expected value is Upstream's exact array under assertSame. No comparison is loosened and no value is changed. |
| F-3: No assertion is removed without a DIV clause | pass | Each of the four ported tests keeps both of Upstream's assertSame calls (2 of 2, as the Inventory records). The unported tests are still skip, so no assertion is dropped from a ported test. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | No line is newly set to skip. The four proxy and Eloquent lines were already skip/not-ported-yet; the change only adds the escalation ESC-12.1-1 or ESC-12.1-2. blocked-by:database looks right for ConditionableTest but cannot be matched yet, since BlockedByComponentError arrives only with Story 17.2 (ESC-5.3-1). intentional-divergence:DIV-12 for the proxy tests is still an unruled option. not-ported-yet keeps these tests in the SM-1 denominator, so it is the reason that counts against conformance. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker was added, and every Expectations 'adapted' field is null. The DIV-12.2 mention in the HigherOrderWhenProxy.ts header is a source comment, not an assertion adaptation. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture for this Story, assigned or changed, is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-conditionable-1's body checks each part of its consequence: closure value, PHP truthiness, null result, __call/__get capture with unless negating, the options form and classUsesRecursive. XT-conditionable-3 checks the api-surface gate, the docs page and the README link. XT-conditionable-2 cites AD-6's dual-helper rule, yet its consequence and final assertions require async-surface.json to list when/unless with root callback. Under the dual-helper rule as F-9 applies it, a dual helper is not async and has no surface line, so that part checks something the cited bullet rules out. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are only in packages/conditionable, plus this Story's escalations and expectations. Nothing from another Component is stubbed or faked. FakeBuilder is a local thenable used to test non-Promise handling, not an implementation of database behaviour. ESC-12.1-2 openly declines to add a local BlockedByComponentError. |
| F-9: Every `@asyncRoot` tag is true | fail | Conditionable.ts carries 16 '@​asyncRoot callback' tags (lines 156-299) on the async overloads of when/unless, and async-surface.json lists both methods with root callback. AD-6.5 and DIV-1 name when/unless as dual helpers: sync for a sync callback and a Promise only for an async one. F-9 says a dual helper is not async and takes no tag. These methods are not async on all paths, as AD-6.2's callback clause requires, so the tags are false. HigherOrderWhenProxy.ts and index.ts have no tags and need none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/conditionable/tests/xaravel/conditionable.test.ts`: XT-conditionable-2 asserts that async-surface.json lists Conditionable.when and Conditionable.unless with root callback. when/unless are AD-6.5 dual helpers, which take no @​asyncRoot tag and so have no surface line. Remove that part of the consequence string and the last two assertStringContainsString calls, or replace them with a check that the surface does not list when/unless.
- **F-9** `packages/conditionable/src/Traits/Conditionable.ts`: Remove the '@​asyncRoot callback' tags from every when/unless overload (lines 156, 163, 169, 175, 185, 193, 203, 213, 242, 249, 255, 261, 271, 279, 289, 299). when/unless are AD-6.5 dual helpers: not async, and they take no tag. Keep the return types to the callback's own type rather than a separately declared Promise, as the Dual helpers rule requires.
- **F-9** `packages/conditionable/async-surface.json`: Regenerate the file after removing the tags. The Conditionable.when and Conditionable.unless lines with root callback should not be there, because dual helpers are not async methods.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a4c084f435871bde4f51192c6b59d01a9e0d6b6e","base":"bef0210abf65630a1fe299550adb7c79aea51296","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T09:25:03.432Z","items":[{"id":"F-1","result":"pass","note":"Compared the four ported tests (testWhenConditionCallback, testWhenDefaultCallback, testUnlessConditionCallback, testUnlessDefaultCallback) with SupportConditionableTest.php lines 10-108. Each has the two Upstream assertSame calls, on the same `logger.values` subject, with the same expected arrays, in the same order. The inputs are the same too: values 2, null, the has('init') and has('missing') closures, and the log('init') prefix. testWhenProxy, testUnlessProxy and the two ConditionableTest tests are not ported; they stay skip under escalations.","findings":[]},{"id":"F-2","result":"pass","note":"Every expected value is Upstream's exact array under assertSame. No comparison is loosened and no value is changed.","findings":[]},{"id":"F-3","result":"pass","note":"Each of the four ported tests keeps both of Upstream's assertSame calls (2 of 2, as the Inventory records). The unported tests are still skip, so no assertion is dropped from a ported test.","findings":[]},{"id":"F-4","result":"pass","note":"No line is newly set to skip. The four proxy and Eloquent lines were already skip/not-ported-yet; the change only adds the escalation ESC-12.1-1 or ESC-12.1-2. blocked-by:database looks right for ConditionableTest but cannot be matched yet, since BlockedByComponentError arrives only with Story 17.2 (ESC-5.3-1). intentional-divergence:DIV-12 for the proxy tests is still an unruled option. not-ported-yet keeps these tests in the SM-1 denominator, so it is the reason that counts against conformance.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker was added, and every Expectations `adapted` field is null. The DIV-12.2 mention in the HigherOrderWhenProxy.ts header is a source comment, not an assertion adaptation.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture for this Story, assigned or changed, is an error.","findings":[]},{"id":"F-7","result":"fail","note":"XT-conditionable-1's body checks each part of its consequence: closure value, PHP truthiness, null result, __call/__get capture with unless negating, the options form and classUsesRecursive. XT-conditionable-3 checks the api-surface gate, the docs page and the README link. XT-conditionable-2 cites AD-6's dual-helper rule, yet its consequence and final assertions require async-surface.json to list when/unless with root callback. Under the dual-helper rule as F-9 applies it, a dual helper is not async and has no surface line, so that part checks something the cited bullet rules out.","findings":[{"path":"packages/conditionable/tests/xaravel/conditionable.test.ts","detail":"XT-conditionable-2 asserts that async-surface.json lists Conditionable.when and Conditionable.unless with root callback. when/unless are AD-6.5 dual helpers, which take no @asyncRoot tag and so have no surface line. Remove that part of the consequence string and the last two assertStringContainsString calls, or replace them with a check that the surface does not list when/unless.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Code changes are only in packages/conditionable, plus this Story's escalations and expectations. Nothing from another Component is stubbed or faked. FakeBuilder is a local thenable used to test non-Promise handling, not an implementation of database behaviour. ESC-12.1-2 openly declines to add a local BlockedByComponentError.","findings":[]},{"id":"F-9","result":"fail","note":"Conditionable.ts carries 16 `@asyncRoot callback` tags (lines 156-299) on the async overloads of when/unless, and async-surface.json lists both methods with root callback. AD-6.5 and DIV-1 name when/unless as dual helpers: sync for a sync callback and a Promise only for an async one. F-9 says a dual helper is not async and takes no tag. These methods are not async on all paths, as AD-6.2's callback clause requires, so the tags are false. HigherOrderWhenProxy.ts and index.ts have no tags and need none.","findings":[{"path":"packages/conditionable/src/Traits/Conditionable.ts","detail":"Remove the `@asyncRoot callback` tags from every when/unless overload (lines 156, 163, 169, 175, 185, 193, 203, 213, 242, 249, 255, 261, 271, 279, 289, 299). when/unless are AD-6.5 dual helpers: not async, and they take no tag. Keep the return types to the callback's own type rather than a separately declared Promise, as the Dual helpers rule requires.","kind":"defect"},{"path":"packages/conditionable/async-surface.json","detail":"Regenerate the file after removing the tags. The Conditionable.when and Conditionable.unless lines with root callback should not be there, because dual helpers are not async methods.","kind":"defect"}]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
