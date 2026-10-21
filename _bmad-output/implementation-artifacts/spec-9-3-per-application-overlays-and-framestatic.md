---
title: 'Story 9.3: Per-Application overlays and `frameStatic`'
type: 'feature'
created: '2026-10-21'
status: 'ready-for-dev'
review_loop_iteration: 0
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
