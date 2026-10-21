---
title: 'Story 9.1: Scope Frame primitive and `interleave`'
type: 'feature'
created: '2026-10-21'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.1.md'
  - '{project-root}/decisions/ESC-4.2-1.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every per-unit state in the framework needs one async-aware home (AD-5, NFR-4), and every concurrency test needs one deterministic way to interleave two units. `@xaravel/runtime` has no code yet.

**Approach:** Add `@xaravel/runtime/scope`: one `AsyncLocalStorage` behind `currentFrame()`, `runInFrame(kind, fn)` and `frameSlot(key, init)`, the grader hook `globalThis[Symbol.for('xaravel.scope.run')]` installed on load, `ScopeFrameException` for a write with no frame, and the dev-only `interleave(units)` helper.

## Boundaries & Constraints

**Always:** edit only `packages/runtime/**`, this Story's spec, status lines, manifest status and Escalations. Keep the runtime free of `dependencies`/`peerDependencies` (XT-conformance-8, graph check); `@xaravel/assert` may be a `devDependency` for the tests. Keep everything sync except where a callback is async (AD-6); tag any exported Promise-returning function `@asyncRoot callback` and commit `async-surface.json`. `null`, never `undefined`, from public functions (AD-9). Install the global with `Object.defineProperty` non-writable, non-configurable, skipped when the env opt-out is set (ESC-4.2-1 item 4).

**Never:** a second `AsyncLocalStorage` in a graded package; patching `AsyncLocalStorage.prototype` (the harness freezes it); editing `conformance/**`, `tools/**` or another package; frame kinds, narrow/child frames, the defer list or stream/timer wrapping (Story 9.2); overlays and `frameStatic` (Story 9.3); the Class Registry beyond what ESC-9.1-2 rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load | `import "@xaravel/runtime/scope"` | exports the three functions; global `xaravel.scope.run` is a function | No error expected |
| Grader call | `run('test', inner)` | returns `inner`'s promise; `currentFrame().kind === 'test'` across all of `inner` | rejection propagates |
| Interleave | `interleave([a, b])`, each writes then reads a slot over several `await`s | each reads only its own value; the step order is the same on every run | No error expected |
| No frame | `frameSlot(k, init).set(v)` outside any frame | — | throws `ScopeFrameException` |
| No frame read | `currentFrame()` outside any frame | `null` | No error expected |

</intent-contract>

## Code Map

- `packages/runtime/package.json` -- `exports` is root-only today; `./scope` needs ESC-9.1-1.
- `packages/runtime/src/index.ts` -- `export {};` today.
- `packages/assert/src/declarations/portedTest.ts:45,119-124` -- the grader calls `run('test', () => runWithMockery(inner))` and awaits it (read-only).
- `decisions/ESC-4.2-1.md` items 2, 4, 7, 9 -- the global's contract, its install rule and env opt-out, `xaravelTest` opens no frame, the counter's own ALS is allowed.
- `tools/registration/registration.ts:331-349` -- every exported class must end with `registerClass` (ESC-9.1-2).
- `conformance/tests/xaravel/scaffold.test.ts:240` -- XT-conformance-7 pins `exports` (ESC-9.1-1).
- `conformance/harness/xaravel.ts:37` -- discovers `packages/*/tests/xaravel/**/*.test.ts`; use `xaravelTest` only.
- `tools/graph/graph.ts:264-292` -- runtime may have no workspace `dependencies`; devDependencies on the grader are allowed.
- `conformance/probes/` (Story 8.3) -- ALS keeps its store across `await` on Bun 1.4.3.

## Tasks & Acceptance

**Execution (after ESC-9.1-1 and ESC-9.1-2 are ruled):**
- `packages/runtime/src/scope/scope.ts` -- the ALS, `Frame` (kind, slot store), `currentFrame`, `runInFrame`, `frameSlot`, and the guarded install of the global -- AD-5 primitive.
- `packages/runtime/src/scope/ScopeFrameException.ts` -- the exception, registered as ESC-9.1-2 rules.
- `packages/runtime/src/scope/interleave.ts` -- `interleave(units)`: runs each unit in its own frame and advances them in lockstep, one turn per `await`, in a fixed order.
- `packages/runtime/src/scope/index.ts`, `package.json`, `src/index.ts` -- the entry point, as ESC-9.1-1 rules.
- `packages/runtime/tests/xaravel/scope.test.ts` -- XT-runtime-1..4.
- `packages/runtime/async-surface.json` -- generated.

**Acceptance Criteria:**
- Given `@xaravel/runtime/scope`, when it loads, then it exports `currentFrame()`, `runInFrame(kind, fn)` and `frameSlot(key, init)` and installs `globalThis[Symbol.for('xaravel.scope.run')]` (XT-runtime-1).
- Given two units started with `interleave([a, b])`, when each writes and reads a `frameSlot` across several `await`s, then each reads only its own value at every step, and the switch order is deterministic (XT-runtime-2).
- Given no active frame, when code writes a frame slot, then it throws `ScopeFrameException` (XT-runtime-3).
- Given `@xaravel/runtime`, when the graph check runs, then it has no dependencies (XT-runtime-4).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 4 pass
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` -- expected: clean
- `bun run story:check 9.1` -- expected: pass

## Auto Run Result

Status: blocked
Blocking condition: two contract conflicts found while planning, before any code. ESC-9.1-1 (protected-path, XT-runtime-1): `@xaravel/runtime/scope` needs an `"./scope"` subpath export, which the Protected test XT-conformance-7 forbids. ESC-9.1-2 (contract, XT-runtime-3): `ScopeFrameException` must end with `registerClass(...)` (AD-10, `registration:check`), but the Class Registry is Story 9.4's and no FQCN is specified. XT-runtime-2 and XT-runtime-4 share the module whose import path and failure mode these rulings decide, so no code lands until both are ruled; resume from this spec's Execution list.
