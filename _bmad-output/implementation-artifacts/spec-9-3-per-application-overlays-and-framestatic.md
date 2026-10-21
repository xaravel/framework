---
title: 'Story 9.3: Per-Application overlays and `frameStatic`'
type: 'feature'
created: '2026-10-21'
status: 'blocked'
baseline_revision: '3a2ae9bc271658c583e7c2d895333671c4c9850c'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.3.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-2-frame-kinds-defer-list-and-context-propagation.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Stories 9.1 and 9.2 give frames slots, kinds and a defer list, but nothing yet keys per-unit state by Application (AD-5.3), and Upstream static setters (`Model.unguard`, `Carbon.setTestNow`) have no per-unit home, so they would leak between concurrent units (AD-5.5).

**Approach:** Extend `@xaravel/runtime/scope`. A frame carries the Application it runs for (`currentFrame()?.app`), inherited from its parent unless the opener names one; `currentApplication()` falls back to the process's default Application set by `setDefaultApplication(app)`. `frameOverlay(app)` reads and writes a unit frame's overlay for one Application; `frameStatic(Class, key, init)` holds one Upstream static per unit. Both write where an undeclared slot write would go (AD-5.8), and a unit's overlays and statics are discarded when it ends.

## Boundaries & Constraints

**Always:** edit only `packages/runtime/**`, this spec, and the Story's status lines (sprint status, `stories/9.3.md` status). One `AsyncLocalStorage` (AD-5.1). Sync APIs only; no new Promise-returning export (AD-6). Public functions return `null`, never `undefined` (AD-9). The runtime has no dependencies, so an Application is any non-null object (the runtime never imports Foundation). Every XT-runtime-1..8 behaviour keeps holding, and `Symbol.for('xaravel.scope.run')` stays `runInFrame` itself.

**Never:** the Class Registry or `registerTestClass` (Story 9.4); the container's base/overlay resolution, sealed-state checks or base-only writes (Foundation and Container Stories); per-Application `frameStatic` (Upstream statics are per class, not per Application); patching globals; editing `conformance/**`, `tools/**` or another package.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two apps, one frame | in one unit, `frameOverlay(a).set('k', 1)`, `frameOverlay(b).set('k', 2)` | `frameOverlay(a).get('k')` is 1, `b`'s is 2; `has('k')` true for both, false for a third app | No error expected |
| Absent key | `frameOverlay(a).get('missing')` | `null`; `has` is false | No error expected |
| Child of test | child unit inside a `test` frame writes an overlay value or a static | lands in the test frame; visible there after the child returns | No error expected |
| Child of non-test | child of a `unit` frame writes | stays in the child; the child reads the parent's values until it writes its own | No error expected |
| Narrow frame | overlay or static write inside `runInNarrowFrame` | goes to the enclosing unit (never declared) | no enclosing unit → `ScopeFrameException` |
| `frameStatic` concurrency | `interleave` unit A sets `frameStatic(C, 'k', () => 'default')`, unit B reads it at every turn | B reads `'default'`; A reads its own value | No error expected |
| Discard | after A's unit ends (drain done, or a sync body returned/threw) | a callback bound to A's frame, and any new unit, read the default / `has` false | a write to the ended unit throws `ScopeFrameException` |
| No frame | read outside any frame | `frameStatic` get → `init()`; overlay `get` → `null`, `has` → false | any write → `ScopeFrameException` |
| Frame app | `runInFrame(kind, fn, app)` / `runInRootFrame(kind, fn, app)` | `currentFrame()?.app` is `app`; a child or narrow frame opened without one inherits its parent's; a root without one has `null` | non-object `app` → `TypeError` |
| Default app | `setDefaultApplication(a)`; then `currentApplication()` outside a frame, in a frame with app `null`, and in a frame with app `b` | `a`, `a`, `b`; before any is set, `null`; `setDefaultApplication(null)` clears it | non-object, non-null → `TypeError` |
| Bad input | `frameOverlay(1)`, `frameStatic('C', …)`, bad key, missing `init` | — | `TypeError` |

</intent-contract>

## Code Map

- `packages/runtime/src/scope/scope.ts` -- the whole primitive. `Store` (line ~54) gains `overlays: Map<object, Map<FrameSlotKey, unknown>> | null` and `statics: Map<object, Map<FrameSlotKey, unknown>> | null` (null for narrow frames). `Frame` gains `readonly app: object | null`; frames are built in `runInNarrowFrame` and `runUnit`. `ownerOf(store, key)` already gives "where an undeclared, non-child slot write goes": call it with a private symbol never declared and not in `CHILD_OF_TEST_SLOTS`. `nearestUnit`, `checkRun` are reusable. `runUnit` marks `ended` on three paths (sync throw, sync return, drain tail in `drain`'s `next`): clear the overlays and statics maps at each.
- `packages/runtime/src/scope/index.ts`, `packages/runtime/src/index.ts` -- named re-exports; add the new names to both.
- `packages/runtime/tests/xaravel/scope.test.ts:62-70` -- XT-runtime-1 loops over named function and symbol exports and checks the package root re-exports each.
- `packages/runtime/tests/xaravel/frames.test.ts` -- 9.2's style for helpers (`thrownBy`, `rejectionOf`, `ticks`) and test shape (`xaravelTest(id, consequence string citing AD-n.k, body)`, `Assert.*`).
- `conformance/xaravel-consequences/runtime.jsonl` (read-only) -- consequence ids: AD-5.3 (bases per Application, `currentFrame()?.app`), AD-5.5 (overlay of the innermost unit, `frameStatic`, no-frame write throws), AD-5.8 (child of test lands in test frame; narrow passes through).
- `packages/runtime/async-surface.json` -- regenerate with `bun run async-surface runtime`; expected unchanged (no async export added).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/scope/scope.ts` -- add `app` to `Frame`; optional third parameter `app` on `runInFrame` and `runInRootFrame` (omitted: inherit from the parent frame, `null` for a root); narrow frames inherit; add `setDefaultApplication`, `currentApplication`, `frameOverlay` (returns a frozen `FrameOverlay {has, get, set}`) and `frameStatic` (returns a `FrameSlot<T>`); store, read-through and discard as in Design Notes -- AD-5.3, AD-5.5, AD-5.8.
- `packages/runtime/src/scope/index.ts`, `packages/runtime/src/index.ts` -- re-export `currentApplication`, `frameOverlay`, `type FrameOverlay`, `frameStatic`, `setDefaultApplication`.
- `packages/runtime/tests/xaravel/overlays.test.ts` -- new: XT-runtime-9..11, one per AC, covering every I/O matrix row; header names Story 9.3.
- `packages/runtime/tests/xaravel/scope.test.ts` -- add the new function names to XT-runtime-1's export loop (line ~62), as Story 9.2 did; header names Story 9.3.

**Acceptance Criteria:**
- Given two Application objects (fixtures) and one frame, when each writes an overlay value under the same key, then each Application reads only its own value (XT-runtime-9, AD-5.3, AD-5.5).
- Given `frameStatic(Class, key)`, when one unit sets the value and another unit reads it concurrently through `interleave`, then the second unit sees the default, and after the first unit ends, its value is discarded (XT-runtime-10, AD-5.5).
- Given `currentFrame()?.app`, when no frame is active, then lookups fall back to the process's default Application, once one has been registered (XT-runtime-11, AD-5.3).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 14, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: `interleave` units drop the enclosing frame's Application — `interleave` now passes the active frame's Application to each root unit, with an XT-runtime-11 case.
  - `[false]` `[reject]` blind: the process default Application is a module variable that leaks across tests — AD-5.3 names "the process's default Application" as process state; per-unit state stays in frames, and resetting the default between tests is the test lifecycle's job (AD-25).
  - `[low]` `[reject]` blind: a child unit can mutate its parent's static through `get()` — a mutation through `get()` is not a write (Story 9.1's rule, carried in 9.2's triage); the child keeps its own `set` writes.
  - `[low]` `[patch]` blind: an explicit `null` app is treated as omitted — `runInFrame`/`runInRootFrame` now inherit only when `app` is omitted; `null` means no Application; tested in XT-runtime-11.
  - `[low]` `[reject]` blind: `undefined` can leak out of `frameStatic().get()` / `FrameOverlay` — the stored value is the caller's own `T`, as `frameSlot` (Story 9.1) returns it; no public function invents an `undefined`; guarding every write adds branches for an off-contract input.
  - `[low]` `[patch]` blind: test matrix gaps — the child-of-test `frameStatic` init case is added to XT-runtime-10; the others (overlay discard after a sync body, narrow inside a child of test, grandchild, cross-app parent, TypeError messages) share code paths already covered (`end()`, `ownerOf`) and are rejected as low.
  - `[low]` `[patch]` blind: reads and writes pick frames by different rules — `lookUp`'s docblock now states the invariant (a child of a `test` unit never holds entries).
  - `[low]` `[patch]` blind: `checkKey` duplicates `frameSlot`'s inline key check — `frameSlot` now calls `checkKey`.
  - `[false]` `[reject]` blind: Story deliverables missing (status lines, async surface, XT-runtime-1 string) — status lines are set at finalize; `async-surface --all --check` ran clean in step 3; XT-runtime-1's string is AD-5.1's consequence, which names only the three primitives.
  - `[low]` `[patch]` edge: explicit `null` app inherits — same root cause as the blind row; patched there.
  - `[low]` `[reject]` edge: a callback bound to an ended child of a `test` unit can still write — its write goes to the test frame, which is live; that is AD-5.8's routing, and the child itself holds nothing to discard.
  - `[low]` `[reject]` edge: `frameStatic().get()` can return `undefined` — as the blind row.
  - `[low]` `[reject]` edge: an `init()` that calls `set()` on the same static is overwritten by the lazy store — re-entrant init is not an everyday shape; guarding it adds a second lookup.
  - `[low]` `[reject]` edge: a function-valued Application is rejected — Applications are class instances; a callable Application is off-contract.
  - `[low]` `[patch]` verification-gap: "no Application" checks use `?? null`, hiding an `undefined` app — XT-runtime-11 now asserts `(currentFrame() as Frame).app` strictly, plus a narrow frame outside any frame.
  - `[low]` `[patch]` verification-gap: `frameStatic` store-on-read through a child of a `test` frame is untested — added to XT-runtime-10.
  - `[low]` `[patch]` verification-gap (other): explicit `null` app — same root cause as the blind row; patched there.
  - `[false]` `[reject]` intent: `frameStatic` takes a third `init` argument beyond AD-5.5's `frameStatic(Class, key)` — the AC's "the default" needs a source; the spec's Design Notes record the choice, matching `frameSlot(key, init)`.
  - `[false]` `[reject]` intent: no Application, Facade or `Model.unguard` consumer is exercised — those surfaces belong to Foundation, Container, Support and Eloquent Stories; AD-19 gives the runtime the primitive only.
  - `[false]` `[reject]` intent: AC3 is tested through `currentApplication()`, and `currentFrame()?.app` is `undefined` outside a frame — `?.` on `null` is the AC's own expression; `currentApplication()` is the lookup it describes, and XT-runtime-11 also asserts `currentFrame()` is null outside a frame.
  - `[false]` `[patch]` fidelity (reviewer 1, F-9 at tree d95f938e): `runInFrame`, `runInRootFrame`, `runInNarrowFrame` lack `@asyncRoot callback` — they return the body's own `T`, never a Promise type (AD-6.5's dual-helper shape), and `tools/async-surface` errors on a tag on a method that returns neither a Promise nor a thenable; reviewer 2 passed F-9 on the same tree, as both did for these functions at 9.2's tree 02121f3a. Answered with that evidence in each docblock, which changes the reviewed tree.

### 2026-10-21 — Review pass (Fidelity Review re-run, tree 4430b4f3)
- verdicts: 2 findings — high 0, medium 1, low 0, false 1, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` fidelity reviewer 1, F-9: the three runners accept async callbacks without `@asyncRoot callback`; "the generic return type and cited tool limitation do not establish an exemption ... supply a recorded ruling explicitly exempting them" — no decision record settles whether AD-6.5 dual-shape frame runners need the tag, and the tag itself is impossible in-Story (the async-surface tool rejects it on a `T` return; a Protected Path). Raised `conformance/escalations/ESC-9.3-1.md` (contract, XT-runtime-9..11); attempt saved in `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch` and reverted.
  - `[false]` `[intent_gap]` fidelity reviewer 2, F-9: same claim, "the code comment is not a recorded ruling" — the runners return `T`, not a Promise, so AD-6.2's async-method rule does not reach them (AD-6.5), and both reviewers passed them at 9.2's tree 02121f3a; but the reject stands (ESC-8.8-1) until the tree changes, so it shares the route above.

## Design Notes

- **Where a write goes:** `ownerOf(store, OVERLAY_KEY)` — a narrow frame passes through, a child of a `test` unit passes to the test frame, any other unit takes it. No owner (no frame, or a narrow frame with no unit) → `ScopeFrameException`; owner already `ended` → `ScopeFrameException` (a bound callback must not resurrect a discarded value).
- **Reads:** walk from the active frame up the chain; the first unit frame whose map holds the key wins. Overlay miss → `has` false, `get` null. Static miss → `init()`, stored at the owner when it exists and has not ended (so a mutable default is per unit, as `frameSlot` does), else returned unstored.
- **Keys:** overlays by `(app, key)`, statics by `(Class object, key)`; the Class object itself is the key, so no class name is needed before the Registry (Story 9.4). `frameStatic` takes an `init` beyond AD-5.5's `frameStatic(Class, key)` shorthand: it is the default the AC's second unit sees, as `frameSlot(key, init)` has one.
- **Default Application:** one process-level reference, the "process's default Application" of AD-5.3, set at boot like Laravel's `Container::setInstance`; settable anywhere, since an Application constructed inside a test frame registers itself. `currentApplication()` is `currentFrame()?.app ?? default ?? null`.
- **Discard:** at the point a unit is marked `ended`, clear its overlay and static maps.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 11 pass
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` -- expected: clean
- `bun run story:check 9.3` -- expected: pass, except `full-run` (needs CI / `GH_TOKEN`) and `approvals` until the Fidelity Review of the final tree

## Fidelity Review

### Reviewer 1: reject at tree d95f938eb8681fb324544bdd2bf3c18bf7f8dbbb

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `3a2ae9bc271658c583e7c2d895333671c4c9850c`, on 2026-10-21T19:39:15.191Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | pass | The changed Xaravel Test retains its existing expected values and comparisons; added tests use exact values and specific exception classes and messages. No expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-9 checks Application isolation and frame write ownership; XT-runtime-10 checks concurrent static isolation and disposal; XT-runtime-11 checks Application inheritance and default fallback. Their cited AD-5 bullets match these checks. XT-runtime-1 retains checks for its declared exports and global installation. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes belong to runtime. Application and model fixtures exercise runtime primitives without implementing Foundation or another Component. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared the exported frame runners with AD-6's callback tagging rule. They accept async callbacks and propagate their asynchronous results but lack callback root tags; ESC-9.2-1 exempts only the private drain helper. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-9** `packages/runtime/src/scope/scope.ts`: runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @​asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"d95f938eb8681fb324544bdd2bf3c18bf7f8dbbb","base":"3a2ae9bc271658c583e7c2d895333671c4c9850c","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T19:39:15.191Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"pass","note":"The changed Xaravel Test retains its existing expected values and comparisons; added tests use exact values and specific exception classes and messages. No expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-9 checks Application isolation and frame write ownership; XT-runtime-10 checks concurrent static isolation and disposal; XT-runtime-11 checks Application inheritance and default fallback. Their cited AD-5 bullets match these checks. XT-runtime-1 retains checks for its declared exports and global installation.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes belong to runtime. Application and model fixtures exercise runtime primitives without implementing Foundation or another Component.","findings":[]},{"id":"F-9","result":"fail","note":"Compared the exported frame runners with AD-6's callback tagging rule. They accept async callbacks and propagate their asynchronous results but lack callback root tags; ESC-9.2-1 exempts only the private drain helper.","findings":[{"path":"packages/runtime/src/scope/scope.ts","detail":"runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs."}]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree d95f938eb8681fb324544bdd2bf3c18bf7f8dbbb

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `3a2ae9bc271658c583e7c2d895333671c4c9850c`, on 2026-10-21T19:39:15.191Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | There are no Ported Tests and no Upstream expected values. The touched tests are Xaravel Tests (XT-runtime-1, 9, 10, 11) with no Upstream counterpart, and their exact assertSame message checks are not loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no assertion counts to compare against Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) says no added line carries an adapted:DIV marker, and no Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) says no base or changed Oracle fixture the Story relies on is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-9: two Applications write key k in one unit and each reads only its own value, and a third Application reads nothing, which matches AD-5.3 (keyed by Application). A write from a child of a non-test unit stays in the child, a write inside a narrow frame that declares a different slot lands in the enclosing unit (AD-5.8 pass-through), and a child of a test frame writes into the test frame (AD-5.8). A write outside any frame throws ScopeFrameException with the exact message (AD-5.5, no active frame). XT-runtime-10: in interleave, unit A sets the static and unit B reads 'default' on every turn. After the unit ends (async drain, sync return or throw), a bound read gets the default and a bound write throws, so the value is discarded (AD-5.5 frameStatic). XT-runtime-11: currentFrame()?.app is the Application the opener names, a child or narrow frame inherits it, a root frame without one has null, and currentApplication() falls back to setDefaultApplication's value (AD-5.3). XT-runtime-1 adds the new names to its export check, which is within AD-5.1's export and re-export check. Each body checks everything its consequence string claims. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/runtime/src/scope and its tests change, and the Story's component is runtime. The runtime takes any object as an Application and does not import Foundation. FixtureApplication, FixtureModel and OtherModel are local test fixtures, not stubs of another Component's behaviour. No hard-coded returns. |
| F-9: Every `@asyncRoot` tag is true | pass | The new exports currentApplication, setDefaultApplication, frameOverlay (has/get/set) and frameStatic (get/set) are synchronous, do no IO and take no async callback, so leaving them untagged is right. runInFrame and runInRootFrame keep their generic T return type and only gain an optional app parameter, which changes nothing about how either can be async. The diff adds and removes no @​asyncRoot tag. The new private helpers are not public methods. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"d95f938eb8681fb324544bdd2bf3c18bf7f8dbbb","base":"3a2ae9bc271658c583e7c2d895333671c4c9850c","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T19:39:15.191Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"There are no Ported Tests and no Upstream expected values. The touched tests are Xaravel Tests (XT-runtime-1, 9, 10, 11) with no Upstream counterpart, and their exact assertSame message checks are not loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no assertion counts to compare against Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) says no added line carries an adapted:DIV marker, and no Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) says no base or changed Oracle fixture the Story relies on is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-9: two Applications write key k in one unit and each reads only its own value, and a third Application reads nothing, which matches AD-5.3 (keyed by Application). A write from a child of a non-test unit stays in the child, a write inside a narrow frame that declares a different slot lands in the enclosing unit (AD-5.8 pass-through), and a child of a test frame writes into the test frame (AD-5.8). A write outside any frame throws ScopeFrameException with the exact message (AD-5.5, no active frame). XT-runtime-10: in interleave, unit A sets the static and unit B reads 'default' on every turn. After the unit ends (async drain, sync return or throw), a bound read gets the default and a bound write throws, so the value is discarded (AD-5.5 frameStatic). XT-runtime-11: currentFrame()?.app is the Application the opener names, a child or narrow frame inherits it, a root frame without one has null, and currentApplication() falls back to setDefaultApplication's value (AD-5.3). XT-runtime-1 adds the new names to its export check, which is within AD-5.1's export and re-export check. Each body checks everything its consequence string claims.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/runtime/src/scope and its tests change, and the Story's component is runtime. The runtime takes any object as an Application and does not import Foundation. FixtureApplication, FixtureModel and OtherModel are local test fixtures, not stubs of another Component's behaviour. No hard-coded returns.","findings":[]},{"id":"F-9","result":"pass","note":"The new exports currentApplication, setDefaultApplication, frameOverlay (has/get/set) and frameStatic (get/set) are synchronous, do no IO and take no async callback, so leaving them untagged is right. runInFrame and runInRootFrame keep their generic T return type and only gain an optional app parameter, which changes nothing about how either can be async. The diff adds and removes no @asyncRoot tag. The new private helpers are not public methods.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 4430b4f358a7c6a3f555025b10e29e594cc34773

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `3a2ae9bc271658c583e7c2d895333671c4c9850c`, on 2026-10-21T19:44:35.520Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | pass | The changed Xaravel Tests retain the existing exact assertions and add exact value and exception checks; no expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-9 through XT-runtime-11 check their declared overlay isolation, write ownership, static lifetime, Application inheritance and default fallback against AD-5.3, AD-5.5 and AD-5.8. The touched XT-runtime-1 checks its declared exports and global scope contract against AD-5.1 and the supplied decisions. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes stay within runtime scope primitives. Application and model fixtures are test objects, with no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared the public frame callback APIs with AD-6.2, AD-6.13, DIV-1 and P-1. The added explanatory comment supplies no recorded ruling exempting these APIs from callback tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-9** `packages/runtime/src/scope/scope.ts`: runInFrame, runInRootFrame and runInNarrowFrame still accept async callbacks without @​asyncRoot callback tags. The generic return type and cited tool limitation do not establish an exemption under the supplied rules; AD-6.5 does not explicitly exempt these APIs. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting them.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-9) `packages/runtime/src/scope/scope.ts`: runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @​asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs. **not fixed**: The APIs remain untagged. The added comment discusses generic return types and tooling, but neither supplied decision explicitly exempts these public callback APIs.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"4430b4f358a7c6a3f555025b10e29e594cc34773","base":"3a2ae9bc271658c583e7c2d895333671c4c9850c","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T19:44:35.520Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"pass","note":"The changed Xaravel Tests retain the existing exact assertions and add exact value and exception checks; no expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-9 through XT-runtime-11 check their declared overlay isolation, write ownership, static lifetime, Application inheritance and default fallback against AD-5.3, AD-5.5 and AD-5.8. The touched XT-runtime-1 checks its declared exports and global scope contract against AD-5.1 and the supplied decisions.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes stay within runtime scope primitives. Application and model fixtures are test objects, with no implementation of another Component.","findings":[]},{"id":"F-9","result":"fail","note":"Compared the public frame callback APIs with AD-6.2, AD-6.13, DIV-1 and P-1. The added explanatory comment supplies no recorded ruling exempting these APIs from callback tags.","findings":[{"path":"packages/runtime/src/scope/scope.ts","detail":"runInFrame, runInRootFrame and runInNarrowFrame still accept async callbacks without @asyncRoot callback tags. The generic return type and cited tool limitation do not establish an exemption under the supplied rules; AD-6.5 does not explicitly exempt these APIs. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting them."}]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-9","path":"packages/runtime/src/scope/scope.ts","detail":"runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs.","fixed":false,"note":"The APIs remain untagged. The added comment discusses generic return types and tooling, but neither supplied decision explicitly exempts these public callback APIs."}]}
```

### Reviewer 2: reject at tree 4430b4f358a7c6a3f555025b10e29e594cc34773

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `3a2ae9bc271658c583e7c2d895333671c4c9850c`, on 2026-10-21T19:44:35.520Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | test_ids is empty; the change adds or changes no Ported Test. |
| F-2: No expected value is weakened | pass | No Ported Tests. The only change to an existing Xaravel Test (XT-runtime-1) adds the four new exports to the list it checks. No expected value is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no relied-on or changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-9 checks overlays keyed by Application, the write going to the innermost unit, narrow-frame pass-through, a child of a test frame writing into the test frame, and the ScopeFrameException with no frame (AD-5.3/5.5/5.8). XT-runtime-10 checks frameStatic isolation across concurrent units in interleave, keying by class, and discarding when the unit ends (AD-5.5). XT-runtime-11 checks the frame's app (named by its opener or inherited) and the fallback to the default Application (AD-5.3). XT-runtime-1 still matches AD-5.1. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every code change is in packages/runtime (scope.ts, interleave.ts, the index files and tests). Applications are plain object fixtures. Nothing stubs or fakes Foundation. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared the untagged runInFrame, runInRootFrame and runInNarrowFrame with AD-6.2, AD-6.13 and DIV-1. Each accepts a callback that may be async. runInFrame and runInRootFrame return a new Promise (from drain) on the async path, so they are async on that path. AD-6.2 says such a method is async and must be tagged. The added comment relies on AD-6.5, whose dual-helper list does not include these functions, and on a claim about the async-surface tool whose source is not in the prompt. No decision record exempts them; ESC-9.2-1 covers only the private drain. The new exports currentApplication, setDefaultApplication, frameOverlay and frameStatic are sync and correctly untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

- **F-9** `packages/runtime/src/scope/scope.ts`: runInFrame, runInRootFrame and runInNarrowFrame accept callbacks DIV-1 allows to be async (runInFrame and runInRootFrame return a drain Promise for them), but they carry no '@​asyncRoot callback' tag. The code comment is not a recorded ruling. Either add the tags (and adjust the return types or the async-surface tool so the check passes, then regenerate async-surface.json), or get an approved decision record that exempts these generic dual-shape frame-runners and cite it on the changed lines.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-9) `packages/runtime/src/scope/scope.ts`: runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @​asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs. **not fixed**: The tree still has no @​asyncRoot callback tag on runInFrame, runInRootFrame or runInNarrowFrame, and no recorded ruling exempts them. It adds only the implementer's own code comment relying on AD-6.5 and the async-surface tool's behaviour. AD-6.5's dual-helper list does not include these functions, the tool's source is not in evidence, and ESC-9.2-1 exempts only the private drain.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"4430b4f358a7c6a3f555025b10e29e594cc34773","base":"3a2ae9bc271658c583e7c2d895333671c4c9850c","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T19:44:35.520Z","items":[{"id":"F-1","result":"n/a","note":"test_ids is empty; the change adds or changes no Ported Test.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Tests. The only change to an existing Xaravel Test (XT-runtime-1) adds the four new exports to the list it checks. No expected value is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no relied-on or changed fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-9 checks overlays keyed by Application, the write going to the innermost unit, narrow-frame pass-through, a child of a test frame writing into the test frame, and the ScopeFrameException with no frame (AD-5.3/5.5/5.8). XT-runtime-10 checks frameStatic isolation across concurrent units in interleave, keying by class, and discarding when the unit ends (AD-5.5). XT-runtime-11 checks the frame's app (named by its opener or inherited) and the fallback to the default Application (AD-5.3). XT-runtime-1 still matches AD-5.1.","findings":[]},{"id":"F-8","result":"pass","note":"Every code change is in packages/runtime (scope.ts, interleave.ts, the index files and tests). Applications are plain object fixtures. Nothing stubs or fakes Foundation.","findings":[]},{"id":"F-9","result":"fail","note":"Compared the untagged runInFrame, runInRootFrame and runInNarrowFrame with AD-6.2, AD-6.13 and DIV-1. Each accepts a callback that may be async. runInFrame and runInRootFrame return a new Promise (from drain) on the async path, so they are async on that path. AD-6.2 says such a method is async and must be tagged. The added comment relies on AD-6.5, whose dual-helper list does not include these functions, and on a claim about the async-surface tool whose source is not in the prompt. No decision record exempts them; ESC-9.2-1 covers only the private drain. The new exports currentApplication, setDefaultApplication, frameOverlay and frameStatic are sync and correctly untagged.","findings":[{"path":"packages/runtime/src/scope/scope.ts","detail":"runInFrame, runInRootFrame and runInNarrowFrame accept callbacks DIV-1 allows to be async (runInFrame and runInRootFrame return a drain Promise for them), but they carry no `@asyncRoot callback` tag. The code comment is not a recorded ruling. Either add the tags (and adjust the return types or the async-surface tool so the check passes, then regenerate async-surface.json), or get an approved decision record that exempts these generic dual-shape frame-runners and cite it on the changed lines."}]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-9","path":"packages/runtime/src/scope/scope.ts","detail":"runInFrame, runInRootFrame and runInNarrowFrame accept async callbacks, as the supplied tests demonstrate, but their docblocks lack @asyncRoot callback. Add the required tags and update the generated async surface as applicable, or supply a recorded ruling explicitly exempting these public callback APIs.","fixed":false,"note":"The tree still has no @asyncRoot callback tag on runInFrame, runInRootFrame or runInNarrowFrame, and no recorded ruling exempts them. It adds only the implementer's own code comment relying on AD-6.5 and the async-surface tool's behaviour. AD-6.5's dual-helper list does not include these functions, the tool's source is not in evidence, and ESC-9.2-1 exempts only the private drain."}]}
```

## Auto Run Result

Status: blocked (2026-10-21)
Blocking condition: intent gap. Both Fidelity reviewers reject F-9 at tree 4430b4f358a7c6a3f555025b10e29e594cc34773 (reviewer 1 also at d95f938e): `runInFrame`, `runInRootFrame` and `runInNarrowFrame` accept async bodies but carry no `@asyncRoot callback` tag, and no recorded ruling exempts them. The tag cannot be added in-Story (`tools/async-surface` rejects it on a method returning `T`, and that tool is Protected). Raised `conformance/escalations/ESC-9.3-1.md` (contract, XT-runtime-9..11): Option 1 records that AD-6.5 dual-shape frame runners need no tag; Option 2 changes the async-surface tool to accept and list the tag.
- Implemented, then saved and reverted: `Frame.app` and the optional `app` argument of `runInFrame` / `runInRootFrame` (omitted inherits, `null` is no Application), `setDefaultApplication` / `currentApplication`, `frameOverlay(app)` and `frameStatic(Class, key, init)` writing where an undeclared slot write goes and discarded at unit end, `interleave` units running for the enclosing Application, and XT-runtime-9..11 (`tests/xaravel/overlays.test.ts`). Saved patch: `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch` (`git apply` it to resume; delete it in the PR that applies it).
- Review: first pass 21 findings, 9 patched (all low: explicit-`null` app, strict `app` null checks, child-of-test `frameStatic` init, `interleave` app, `checkKey` reuse, the `lookUp` invariant, F-9 evidence comments), 12 rejected with reasons in the Review Triage Log; no deferrals. Second pass (Fidelity re-run): 2 findings routed to ESC-9.3-1. Review loop iteration 1.
- Verification at tree 4430b4f3: `harness --xaravel` 301/301 (11/11 XT-runtime); `tsc -b`, `lint`, `graph:check`, `registration:check` (1 registration) and `async-surface --all --check` clean; `async-surface.json` unchanged.
- On resume: apply the patch, follow the ruling (Option 1: cite `decisions/ESC-9.3-1.md` in the three runner docblocks), and re-run the Fidelity Review.
- Follow-up review recommended: false (the resumed run reviews the applied patch from scratch).
