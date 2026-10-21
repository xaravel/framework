---
title: 'Story 9.1: Scope Frame primitive and `interleave`'
type: 'feature'
created: '2026-10-21'
status: 'blocked'
baseline_revision: 'f1a356e78947837fbc2deddfdcf51be415e706e7'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.1.md'
  - '{project-root}/decisions/ESC-4.2-1.md'
  - '{project-root}/decisions/ESC-9.1-1.md'
  - '{project-root}/decisions/ESC-9.1-2.md'
warnings: []
deferred:
  - summary: >-
      interleave alternates units only when they await settled promises of equal depth, not at every IO await.
    evidence: |-
      It starts units in one tick and relies on FIFO microtask order. The spine's "lockstep at every await" for Driver IO needs Driver-contract wrapping, and no built Component has that yet. The first NFR-4 concurrency test over a driver settles it.
    location: >-
      packages/runtime/src/scope/interleave.ts
    severity: medium (unverified)
  - summary: >-
      The TypeErrors that interleave, runInFrame and frameSlot throw for bad arguments are untested.
    evidence: |-
      Verification-gap review: every call in scope.test.ts passes valid arguments. These checks are defensive and outside the four ACs.
    location: >-
      packages/runtime/tests/xaravel/scope.test.ts
    severity: low
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

- `packages/runtime/package.json` -- `exports` is root-only today; ESC-9.1-1 allows `"./scope": "./src/scope/index.ts"` (this Story) and later `./registry` (Story 9.4), `./php`.
- `packages/runtime/src/index.ts` -- `export {};` today.
- `decisions/ESC-9.1-2.md` -- Registry core in `src/registry/`: `registerClass(fqcn, X)` (lower-cased key map; throws on a different class under a taken key and on a class under a second FQCN) and `fqcn(classOrInstance)` (throws if unregistered). FQCN `Xaravel\Runtime\Scope\ScopeFrameException`. `scope/` imports `registry/` by relative path.
- `packages/mockery/src/Mockery.ts:225-241` -- `installAll`: the install-once pattern to copy (absent → `defineProperty` non-writable/non-configurable/non-enumerable; present with another value → throw).
- `conformance/harness/intrinsics.ts:21-38` -- the harness freezes `AsyncLocalStorage` and tames `name`/`message` on frozen prototypes; an `Error` subclass sets `name` with a class field.
- `tools/async-surface/async-surface.ts:1-50` -- an exported Promise-returning function needs `/** @asyncRoot callback */` right above it.
- `packages/assert/src/declarations/portedTest.ts:45,119-124` -- the grader calls `run('test', () => runWithMockery(inner))` and awaits it (read-only).
- `decisions/ESC-4.2-1.md` items 2, 4, 7, 9 -- the global's contract, its install rule and env opt-out, `xaravelTest` opens no frame, the counter's own ALS is allowed.
- `tools/registration/registration.ts:331-349` -- every exported class must end with `registerClass` (ESC-9.1-2).
- `conformance/tests/xaravel/scaffold.test.ts:240` -- XT-conformance-7 pins `exports` (ESC-9.1-1).
- `conformance/harness/xaravel.ts:37` -- discovers `packages/*/tests/xaravel/**/*.test.ts`; use `xaravelTest` only.
- `tools/graph/graph.ts:264-292` -- runtime may have no workspace `dependencies`; devDependencies on the grader are allowed.
- `conformance/probes/` (Story 8.3) -- ALS keeps its store across `await` on Bun 1.4.3.

## Tasks & Acceptance

**Execution (ESC-9.1-1 and ESC-9.1-2 are ruled, both option 1):**
- `packages/runtime/src/registry/registry.ts`, `registry/index.ts` -- the Registry core exactly as ESC-9.1-2 rules; no `./registry` export yet (Story 9.4 adds it with the rest of the Registry).
- `packages/runtime/src/scope/ScopeFrameException.ts` -- `class ScopeFrameException extends Error`, ending with `registerClass('Xaravel\\Runtime\\Scope\\ScopeFrameException', ScopeFrameException)`.
- `packages/runtime/src/scope/scope.ts` -- the one ALS, the `Frame` interface (`kind`), `currentFrame`, `runInFrame`, `frameSlot`, and the guarded install of the global (skipped when `XARAVEL_NO_SCOPE_GLOBAL=1`) -- AD-5 primitive.
- `packages/runtime/src/scope/interleave.ts` -- `interleave(units)`, tagged `@asyncRoot callback`.
- `packages/runtime/src/scope/index.ts` -- named re-exports; `package.json` adds `"./scope": "./src/scope/index.ts"` and `devDependencies: {"@xaravel/assert": "workspace:*"}`; `src/index.ts` re-exports the scope API.
- `packages/runtime/tests/xaravel/scope.test.ts` -- XT-runtime-1..4 via `xaravelTest`, plus the I/O matrix rows.
- `packages/runtime/async-surface.json` -- generated by `bun run async-surface runtime`.

**Acceptance Criteria:**
- Given `@xaravel/runtime/scope`, when it loads, then it exports `currentFrame()`, `runInFrame(kind, fn)` and `frameSlot(key, init)` and installs `globalThis[Symbol.for('xaravel.scope.run')]` (XT-runtime-1).
- Given two units started with `interleave([a, b])`, when each writes and reads a `frameSlot` across several `await`s, then each reads only its own value at every step, and the switch order is deterministic (XT-runtime-2).
- Given no active frame, when code writes a frame slot, then it throws `ScopeFrameException` (XT-runtime-3).
- Given `@xaravel/runtime`, when the graph check runs, then it has no dependencies (XT-runtime-4).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 30 findings — high 0, medium 7, low 18, false 3, maybe-false 2
- findings:
  - `[low]` `[patch]` edge: `fqcn(null)` crashes in `getPrototypeOf` — real; grouped with the Blind Hunter's FQCN item; patched (guard throws the `fqcn()` TypeError).
  - `[low]` `[reject]` edge: malformed FQCNs (`Foo\\`, `\\\\Foo`) register — `registration:check` rejects every non-literal or malformed call site statically and the runtime copy is a core Story 9.4 extends; adding a name grammar is new surface for an unlikely input.
  - `[medium]` `[patch]` edge: one unit rejecting leaves siblings running past `interleave` — real with `Promise.all`; patched to `allSettled`, then the first rejection in array order.
  - `[low]` `[reject]` edge: a unit mutating `units` during start — the caller's own array mutated mid-call; units are already validated before any starts, and this is not everyday use.
  - `[low]` `[reject]` edge: re-entrant `init()` recursion — a stack overflow is a loud failure of a self-referential init, not a silent defect.
  - `[low]` `[patch]` edge: inherited `XARAVEL_NO_SCOPE_GLOBAL` breaks XT-runtime-1's probe — patched: `child()` strips it.
  - `[maybe-false]` `[reject]` intent: grader hook load timing in a real `portedTest` run — no Ported Test imports the runtime yet; settled by the first graded package Story that loads it; if true it would be `low` (the grader runs unscoped and still passes, ESC-4.2-1 item 2).
  - `[false]` `[reject]` intent: `runInFrame` should carry `@asyncRoot` — its emitted type is `<T>(…) => T`, not a Promise; `async-surface --check` passes and AD-6 forbids `T | Promise<T>`, which this is not.
  - `[low]` `[reject]` intent / blind: `interleave` exported from the package root despite "dev-only" — the spine lists `interleave` among `@xaravel/runtime`'s owned surface; tree-shaken, no runtime cost; root re-export is consistent with the other scope exports.
  - `[medium]` `[patch]` gap: Registry conflict, normalisation and unregistered branches untested (also Blind Hunter #1) — patched: XT-runtime-3 asserts each ESC-9.1-2 rule.
  - `[low]` `[defer]` gap: argument-validation `TypeError`s of `interleave`/`runInFrame`/`frameSlot` untested — filed disposition defer; outside the four ACs.
  - `[low]` `[patch]` gap: XT-runtime-4's text filter on graph output — patched together with fidelity F-7 (XT-runtime-4).
  - `[medium]` `[patch]` blind: Registry core untested — same root cause as the gap finding; patched there.
  - `[low]` `[reject]` blind: `registry/index.ts` barrel unreachable — ESC-9.1-1 adds `./registry` with Story 9.4, which builds the Registry; the barrel is the entry that export will point at (`./src/registry/index.ts`), not dead code.
  - `[maybe-false]` `[defer]` blind: `interleave` alternates only when units await settled promises of equal depth — the spine's "lockstep at every await" for driver IO needs Driver-contract wrapping that no built Component has; settled by the first NFR-4 concurrency test over a driver; if true `medium` (unverified).
  - `[low]` `[reject]` blind: `get()` outside a frame drops mutations of a mutable init value — the documented Design Notes choice (AD-5 throws on writes only); a mutation through `get()` is not a slot write.
  - `[low]` `[reject]` blind: same-key slots alias with different types — documented "same key shares storage"; symbol keys avoid collisions; no named caller collides.
  - `[false]` `[reject]` blind: loading the module twice crashes — a second evaluation is a second `AsyncLocalStorage`, which AD-5 forbids; failing loudly is the intended guard, and the message names that case.
  - `[low]` `[reject]` blind: duplicate-copy guard covers scope, not registry — the registry copy loads only via `scope/` in this Story, so the scope guard fires first; the rest is Story 9.4's.
  - `[low]` `[reject]` blind: runtime FQCN checks looser than the static scan — same as the edge FQCN item.
  - `[low]` `[patch]` blind: XT-runtime-1 export loop skips `ScopeFrameException` — patched; the other two sub-items (non-`1` values, accessor branch) are rejected as unlikely regressions needing new cases.
  - `[low]` `[patch]` blind: XT-runtime-4 fragile filter and "no dependencies" wording — patched with fidelity F-7.
  - `[false]` `[reject]` blind: `interleave` units lose the parent test frame's slots — child units are Story 9.2's (intent **Never**); no concurrency test exists before 9.2.
  - `[medium]` `[patch]` fidelity R1 F-7: consequence records unavailable for `AD-5`/`AD-2` — no `runtime.jsonl` consequence file exists (ESC-5.9-1 gives Components their rows by Infrastructure change); patched: the consequence strings cite no tokens and state the asserted behaviour.
  - `[medium]` `[patch]` fidelity R1 F-9: `interleave`'s `@asyncRoot callback` — evidence supplied in the doc comment: the spine § AD-6 ("`@asyncRoot callback` for the callback clause") and ESC-6.4-1 define it for callback-derived async functions, as `runWithMockery` uses it.
  - `[medium]` `[patch]` fidelity R2 F-7: whole-AD citations are unknown consequence ids — same root cause as R1 F-7; patched there.
  - `[medium]` `[patch]` fidelity R2 F-7: XT-runtime-4 passes even if the graph never scans runtime — patched: `checkGraph` on the repo and on a temp root where runtime gains a dependency must report the layer edge.
  - `[low]` `[patch]` fidelity R2 F-9: `interleave` tag — same as R1 F-9.
  - `[low]` `[patch]` fidelity R2 F-9: `async-surface.json` entry — same as R1 F-9; the entry stays, as `packages/assert/async-surface.json` records `runWithMockery`.
  - `[low]` `[reject]` gap other: XT-runtime-4 filter — same as the gap finding above; patched there.

### 2026-10-21 — Review pass (Fidelity Review re-run, tree 9809d91d)
- verdicts: 5 findings — high 2, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[intent_gap]` R1 F-7: the tests cite no registered consequence bullets; removing the tokens "does not supply the previously requested evidence" — real: no `conformance/xaravel-consequences/runtime.jsonl` exists, and adding it is a Protected Infrastructure change (ESC-5.9-1 item 1). Raised `conformance/escalations/ESC-9.1-3.md`; attempt saved in `9-1-blocked-attempt.patch`.
  - `[high]` `[intent_gap]` R1 F-9: `interleave`'s `@asyncRoot callback`; a comment citing the spine is "insufficient evidence" — real conflict: the Protected F-9 checklist allows only IO-root tags, while spine § AD-6 Enforcement and ESC-6.4-1 define `callback`, and `async-surface --check` requires a tag. Raised `conformance/escalations/ESC-9.1-4.md`.
  - `[medium]` `[intent_gap]` R1 F-9: `async-surface.json`'s `callback` entry — same root cause as R1 F-9; ESC-9.1-4.
  - `[medium]` `[intent_gap]` R2 F-9: remove the tag or supply the AD-6 / ESC-6.4-1 text — same root cause; ESC-9.1-4 asks for that text in evidence item (d).
  - `[medium]` `[intent_gap]` R2 F-9: `async-surface.json` names no Driver contract — same root cause; ESC-9.1-4.

## Design Notes

- `runInFrame<T>(kind, fn: () => T): T` returns `fn`'s result unchanged (sync stays sync, AD-6); the global is that same function, so `run('test', inner)` returns `inner`'s promise and a rejection propagates.
- `frameSlot<T>(key, init)` returns `{ get(): T; set(v: T): void }`. Slots with the same `key` share storage in a frame; `init` runs lazily once per frame. Outside a frame `set` throws `ScopeFrameException` and `get` returns `init()` without storing it (AD-5 forbids only writes).
- `interleave<T>(units: ReadonlyArray<() => Promise<T>>): Promise<T[]>` starts every unit synchronously, in array order, each in its own fresh `runInFrame('unit', …)`, then awaits all. Started in one tick, units awaiting settled promises resume in FIFO microtask order, so a, b, a, b at each `await`, the same on every run.
- Opt-out name: ESC-4.2-1 item 4 names no variable; this Story uses `XARAVEL_NO_SCOPE_GLOBAL=1`, read once at load. A global already defined with another value throws `ScopeFrameException` (a second runtime copy would mean a second ALS).

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 4 pass
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` -- expected: clean
- `bun run story:check 9.1` -- expected: pass

## Auto Run Result

Status: resumed 2026-10-21 after ESC-9.1-1 (Maintainer, approved option 1: `./scope` subpath, SUBPATH_EXPORTS in XT-conformance-7) and ESC-9.1-2 (approved option 1: Registry core in `src/registry/`, FQCN `Xaravel\\Runtime\\Scope\\ScopeFrameException`) were ruled; re-plan from the rulings.
Blocking condition: two contract conflicts found while planning, before any code. ESC-9.1-1 (protected-path, XT-runtime-1): `@xaravel/runtime/scope` needs an `"./scope"` subpath export, which the Protected test XT-conformance-7 forbids. ESC-9.1-2 (contract, XT-runtime-3): `ScopeFrameException` must end with `registerClass(...)` (AD-10, `registration:check`), but the Class Registry is Story 9.4's and no FQCN is specified. XT-runtime-2 and XT-runtime-4 share the module whose import path and failure mode these rulings decide, so no code lands until both are ruled; resume from this spec's Execution list.

Status: blocked (2026-10-21, second attempt)
Blocking condition: intent gap. The Fidelity Review rejected the implementation twice for reasons only a Protected change can answer. ESC-9.1-3 (contract, XT-runtime-1..4): `@xaravel/runtime` has no consequence file, so F-7 cannot check any XT-runtime consequence. ESC-9.1-4 (protected-path, XT-runtime-2): F-9 rejects the `@asyncRoot callback` tag that the spine defines and `async-surface --check` requires.
- Implemented, then saved and reverted: the Registry core (`src/registry/`), `ScopeFrameException`, `scope.ts`, `interleave.ts`, the `./scope` export, the `@xaravel/assert` devDependency, `async-surface.json`, and XT-runtime-1..4. Saved patch: `_bmad-output/implementation-artifacts/9-1-blocked-attempt.patch` (`git apply` it to resume; delete it in the PR that applies it).
- Verification at tree 9809d91d: `harness --xaravel --id 'XT-runtime-*'` 4/4 passed; the full Xaravel run 294/294 (before the patches); `tsc -b`, `lint`, `graph:check`, `registration:check` (1 registration) and `async-surface --all --check` were all clean.
- Review, first pass: 30 findings, 12 patched (7 medium, 5 low), 2 deferred and 16 rejected, each with its reason in the Review Triage Log.
- Residual risks:
  - `bun.lock` (Protected) does not list runtime's new devDependency. CI's `--frozen-lockfile` install accepts it, but a plain `bun install` rewrites the lock. A `planning/*` PR refreshes it when the patch lands.
  - `interleave` alternates only when units await settled promises; see the deferred item.
- Follow-up review recommended: false. The next run re-reviews the applied patch from scratch.

## Fidelity Review

### Reviewer 1: reject at tree d29879ca5cc4b05bfdb90d187e957fece450370a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f1a356e78947837fbc2deddfdcf51be415e706e7`, on 2026-10-21T08:14:24.889Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values are added or changed for comparison with Upstream. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed, so no Upstream assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle fixture with an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The four test bodies check their stated concrete behaviors, but the supplied evidence marks their cited AD consequences as unavailable, preventing confirmation of those references. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation changes scope and registry code within the declared runtime Component; no implementation of another Component is shown. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared interleave's @​asyncRoot callback tag with DIV-1: it invokes potentially async callbacks but performs no IO under an async-root Driver contract. DIV-1 classifies this as async by derivation. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/scope.test.ts`: Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified.
- **F-9** `packages/runtime/src/scope/interleave.ts`: Remove the @​asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"d29879ca5cc4b05bfdb90d187e957fece450370a","base":"f1a356e78947837fbc2deddfdcf51be415e706e7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T08:14:24.889Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values are added or changed for comparison with Upstream.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed, so no Upstream assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle fixture with an error output.","findings":[]},{"id":"F-7","result":"fail","note":"The four test bodies check their stated concrete behaviors, but the supplied evidence marks their cited AD consequences as unavailable, preventing confirmation of those references.","findings":[{"path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified."}]},{"id":"F-8","result":"pass","note":"The implementation changes scope and registry code within the declared runtime Component; no implementation of another Component is shown.","findings":[]},{"id":"F-9","result":"fail","note":"Compared interleave's @asyncRoot callback tag with DIV-1: it invokes potentially async callbacks but performs no IO under an async-root Driver contract. DIV-1 classifies this as async by derivation.","findings":[{"path":"packages/runtime/src/scope/interleave.ts","detail":"Remove the @asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json."}]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree d29879ca5cc4b05bfdb90d187e957fece450370a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f1a356e78947837fbc2deddfdcf51be415e706e7`, on 2026-10-21T08:14:24.889Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | There is no Ported Test whose expected values could be compared with Upstream. The only tests added are Xaravel Tests, which have no Upstream source. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test, so there are no assertion counts to compare. No adapted markers were added. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no base or changed fixture the Story relies on has an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each test body with its consequence string. XT-runtime-1, 2 and 3 do check the exports and the installed global, per-unit slot isolation with a fixed switch order, and the exception thrown when a slot is written outside a frame. But every test cites a whole decision (AD-5, AD-2) instead of a bullet, and evidence (e) shows those ids are not in conformance/xaravel-consequences/*.jsonl, so the tested bullet cannot be confirmed. XT-runtime-4 also checks less than its string claims. |
| F-8: No stub, fake or partial implementation of another Component | n/a | The changed source is all inside packages/runtime, the Story's own Component (runtime). The Class Registry core (registry.ts) lives in that package; the diff says Story 9.4 extends it, citing ESC-9.1-2, which is not given here. ScopeFrameException defers its re-parenting to Story 9.10. I found no stub, fake or hard-coded return of another Component's behaviour, so this item has nothing it applies to. |
| F-9: Every `@asyncRoot` tag is true | fail | I compared the @​asyncRoot tag on interleave in packages/runtime/src/scope/interleave.ts, and its async-surface.json entry (root: callback), with DIV-1 and F-9. interleave does no IO behind any Driver contract. It is async only because the functions it runs are async, which DIV-1 calls async by derivation, not an async root. F-9 fails a tagged method that does no IO. I am unsure whether 'callback' is an accepted value for the tag, so this is a fail. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked.
- **F-7** `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @​xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @​xaravel/assert there. Assert on the graph tool's actual record of @​xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked.
- **F-9** `packages/runtime/src/scope/interleave.ts`: 'interleave' is tagged '@​asyncRoot callback' but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @​asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if '@​asyncRoot callback' is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it.
- **F-9** `packages/runtime/async-surface.json`: The entry {"method":"interleave","root":"callback"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"d29879ca5cc4b05bfdb90d187e957fece450370a","base":"f1a356e78947837fbc2deddfdcf51be415e706e7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T08:14:24.889Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test whose expected values could be compared with Upstream. The only tests added are Xaravel Tests, which have no Upstream source.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test, so there are no assertion counts to compare. No adapted markers were added.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no base or changed fixture the Story relies on has an error output.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each test body with its consequence string. XT-runtime-1, 2 and 3 do check the exports and the installed global, per-unit slot isolation with a fixed switch order, and the exception thrown when a slot is written outside a frame. But every test cites a whole decision (AD-5, AD-2) instead of a bullet, and evidence (e) shows those ids are not in conformance/xaravel-consequences/*.jsonl, so the tested bullet cannot be confirmed. XT-runtime-4 also checks less than its string claims.","findings":[{"path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked."},{"path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @xaravel/assert there. Assert on the graph tool's actual record of @xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked."}]},{"id":"F-8","result":"n/a","note":"The changed source is all inside packages/runtime, the Story's own Component (runtime). The Class Registry core (registry.ts) lives in that package; the diff says Story 9.4 extends it, citing ESC-9.1-2, which is not given here. ScopeFrameException defers its re-parenting to Story 9.10. I found no stub, fake or hard-coded return of another Component's behaviour, so this item has nothing it applies to.","findings":[]},{"id":"F-9","result":"fail","note":"I compared the @asyncRoot tag on interleave in packages/runtime/src/scope/interleave.ts, and its async-surface.json entry (root: callback), with DIV-1 and F-9. interleave does no IO behind any Driver contract. It is async only because the functions it runs are async, which DIV-1 calls async by derivation, not an async root. F-9 fails a tagged method that does no IO. I am unsure whether 'callback' is an accepted value for the tag, so this is a fail.","findings":[{"path":"packages/runtime/src/scope/interleave.ts","detail":"`interleave` is tagged `@asyncRoot callback` but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if `@asyncRoot callback` is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it."},{"path":"packages/runtime/async-surface.json","detail":"The entry {\"method\":\"interleave\",\"root\":\"callback\"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation."}]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 9809d91dcf83581ad7d9c703b833ce7c39937740

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f1a356e78947837fbc2deddfdcf51be415e706e7`, on 2026-10-21T08:20:39.246Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests; no Upstream assertions require comparison. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values are added or changed for comparison with Upstream. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests or Upstream assertion counts to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or Expectations adapted fields are present. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The four bodies check their current consequence strings, including XT-runtime-4's narrowed dependency claim. However, the consequence records and exact bullet citations required by the standing P-1 and P-3 findings remain absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | The scope primitive and Registry core belong to runtime. The added tooling declarations introduce no implementation of another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | fail | interleave explicitly reaches no Driver-contract IO root but retains @​asyncRoot callback and a matching root entry. DIV-1 permits callback-derived async behavior, but the supplied record does not establish callback as an approved @​asyncRoot tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/scope.test.ts`: Resolve P-1 and P-3 by supplying the applicable AD-5 and AD-2 consequence records and citing the exact registered bullets each test verifies. Removing decision citations from consequence strings does not supply the previously requested evidence.
- **F-9** `packages/runtime/src/scope/interleave.ts`: Remove the @​asyncRoot tag and represent callback derivation consistently, or supply the actual AD-6/ESC-6.4-1 text authorizing this tag. A comment asserting that authorization is insufficient evidence.
- **F-9** `packages/runtime/async-surface.json`: Align interleave's callback entry with the documented distinction between IO roots and async derivation; supply the tooling contract if callback is its approved representation.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified. **not fixed**: The requested consequence records and exact bullet citations are not supplied.
- **P-2** (reviewer 1, F-9) `packages/runtime/src/scope/interleave.ts`: Remove the @​asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json. **not fixed**: interleave retains its @​asyncRoot tag and callback root entry.
- **P-3** (reviewer 2, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked. **not fixed**: Whole-decision citations were removed from consequence strings, but exact registered consequence bullets and registry records were not added.
- **P-4** (reviewer 2, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @​xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @​xaravel/assert there. Assert on the graph tool's actual record of @​xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked. **fixed**: XT-runtime-4 now explicitly limits its claim to dependencies, peerDependencies and optionalDependencies, checks those fields directly, and tests graph rejection with an injected dependency.
- **P-5** (reviewer 2, F-9) `packages/runtime/src/scope/interleave.ts`: 'interleave' is tagged '@​asyncRoot callback' but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @​asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if '@​asyncRoot callback' is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it. **not fixed**: The new comment names AD-6 and ESC-6.4-1, but their authorizing text is absent; the retained tag cannot be verified against the supplied evidence.
- **P-6** (reviewer 2, F-9) `packages/runtime/async-surface.json`: The entry {"method":"interleave","root":"callback"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation. **not fixed**: The callback root entry remains unchanged, without supplied tooling evidence establishing it as the representation of async derivation.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"9809d91dcf83581ad7d9c703b833ce7c39937740","base":"f1a356e78947837fbc2deddfdcf51be415e706e7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T08:20:39.246Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests; no Upstream assertions require comparison.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values are added or changed for comparison with Upstream.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests or Upstream assertion counts to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or Expectations adapted fields are present.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"The four bodies check their current consequence strings, including XT-runtime-4's narrowed dependency claim. However, the consequence records and exact bullet citations required by the standing P-1 and P-3 findings remain absent.","findings":[{"path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"Resolve P-1 and P-3 by supplying the applicable AD-5 and AD-2 consequence records and citing the exact registered bullets each test verifies. Removing decision citations from consequence strings does not supply the previously requested evidence."}]},{"id":"F-8","result":"pass","note":"The scope primitive and Registry core belong to runtime. The added tooling declarations introduce no implementation of another Component's behavior.","findings":[]},{"id":"F-9","result":"fail","note":"interleave explicitly reaches no Driver-contract IO root but retains @asyncRoot callback and a matching root entry. DIV-1 permits callback-derived async behavior, but the supplied record does not establish callback as an approved @asyncRoot tag.","findings":[{"path":"packages/runtime/src/scope/interleave.ts","detail":"Remove the @asyncRoot tag and represent callback derivation consistently, or supply the actual AD-6/ESC-6.4-1 text authorizing this tag. A comment asserting that authorization is insufficient evidence."},{"path":"packages/runtime/async-surface.json","detail":"Align interleave's callback entry with the documented distinction between IO roots and async derivation; supply the tooling contract if callback is its approved representation."}]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified.","fixed":false,"note":"The requested consequence records and exact bullet citations are not supplied."},{"id":"P-2","reviewer":1,"item":"F-9","path":"packages/runtime/src/scope/interleave.ts","detail":"Remove the @asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json.","fixed":false,"note":"interleave retains its @asyncRoot tag and callback root entry."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked.","fixed":false,"note":"Whole-decision citations were removed from consequence strings, but exact registered consequence bullets and registry records were not added."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @xaravel/assert there. Assert on the graph tool's actual record of @xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked.","fixed":true,"note":"XT-runtime-4 now explicitly limits its claim to dependencies, peerDependencies and optionalDependencies, checks those fields directly, and tests graph rejection with an injected dependency."},{"id":"P-5","reviewer":2,"item":"F-9","path":"packages/runtime/src/scope/interleave.ts","detail":"`interleave` is tagged `@asyncRoot callback` but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if `@asyncRoot callback` is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it.","fixed":false,"note":"The new comment names AD-6 and ESC-6.4-1, but their authorizing text is absent; the retained tag cannot be verified against the supplied evidence."},{"id":"P-6","reviewer":2,"item":"F-9","path":"packages/runtime/async-surface.json","detail":"The entry {\"method\":\"interleave\",\"root\":\"callback\"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation.","fixed":false,"note":"The callback root entry remains unchanged, without supplied tooling evidence establishing it as the representation of async derivation."}]}
```

### Reviewer 2: reject at tree 9809d91dcf83581ad7d9c703b833ce7c39937740

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f1a356e78947837fbc2deddfdcf51be415e706e7`, on 2026-10-21T08:20:39.246Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | The change has no Ported Tests and no Upstream expected values. The expected values in the Xaravel Tests are exact assertSame and instanceof checks, so none is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and no line carries an adapted:DIV marker. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker or Expectations adapted field is added (evidence a). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is an error, neither a base fixture nor a changed one (evidence c). |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The four consequence strings now cite no FR or AD ids, so no cited bullet can mismatch. Each body checks what its string declares. XT-runtime-1 checks the exports, the global's descriptor, the grader call, sync and async return and the opt-out. XT-runtime-2 checks per-unit slot isolation and that the switch order is the same on all 3 runs. XT-runtime-3 checks that a write with no frame throws ScopeFrameException and that the Registry rejects conflicting registrations. XT-runtime-4 checks that the dependency fields are absent and that the graph check rejects an added dependency with exact lines. |
| F-8: No stub, fake or partial implementation of another Component | pass | The code changes stay in packages/runtime (Scope Frame, interleave, and the Registry core the frame code relies on, per ESC-9.1-2). The tools/*.d.ts files are type declarations only and add no behaviour of another Component. |
| F-9: Every `@asyncRoot` tag is true | fail | interleave is still tagged @​asyncRoot callback and is listed with root 'callback'. It does no IO behind an async-root Driver contract; it is async only by derivation from its callbacks (DIV-1). AD-6 and ESC-6.4-1, which its comment cites, are not in the prompt, so the convention cannot be confirmed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-9** `packages/runtime/src/scope/interleave.ts`: interleave does no IO but keeps the @​asyncRoot callback tag. Remove the tag and record it as async by derivation, or supply the text of the AD-6 / ESC-6.4-1 rule that permits a callback root under F-9.
- **F-9** `packages/runtime/async-surface.json`: The entry {"method":"interleave","root":"callback"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified. **fixed**: XT-runtime-1 to XT-runtime-4 no longer cite AD-5 or AD-2. With no ids cited, there is nothing left whose correspondence to the assertions needs checking.
- **P-2** (reviewer 1, F-9) `packages/runtime/src/scope/interleave.ts`: Remove the @​asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json. **not fixed**: interleave.ts still carries @​asyncRoot callback, and async-surface.json still has root 'callback'.
- **P-3** (reviewer 2, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked. **fixed**: The unknown whole-decision ids were removed from all four consequence strings, so there is no unregistered consequence id left.
- **P-4** (reviewer 2, F-7) `packages/runtime/tests/xaravel/scope.test.ts`: XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @​xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @​xaravel/assert there. Assert on the graph tool's actual record of @​xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked. **fixed**: XT-runtime-4's string is narrowed to no dependencies/peerDependencies/optionalDependencies plus the graph check rejecting an added dependency. The body checks that those fields are absent and that the check, run on a temporary copy, reports the exact cycle and layer-edge lines, which proves the package is scanned.
- **P-5** (reviewer 2, F-9) `packages/runtime/src/scope/interleave.ts`: 'interleave' is tagged '@​asyncRoot callback' but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @​asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if '@​asyncRoot callback' is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it. **not fixed**: The tag is kept, and its comment now cites AD-6 and ESC-6.4-1. Neither text is in the prompt, so whether they define a callback tag cannot be verified, and the method still does no IO.
- **P-6** (reviewer 2, F-9) `packages/runtime/async-surface.json`: The entry {"method":"interleave","root":"callback"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation. **not fixed**: async-surface.json is unchanged: {"method":"interleave","root":"callback"} still names no Driver-contract root.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"9809d91dcf83581ad7d9c703b833ce7c39937740","base":"f1a356e78947837fbc2deddfdcf51be415e706e7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T08:20:39.246Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"The change has no Ported Tests and no Upstream expected values. The expected values in the Xaravel Tests are exact assertSame and instanceof checks, so none is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and no line carries an adapted:DIV marker.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker or Expectations adapted field is added (evidence a).","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is an error, neither a base fixture nor a changed one (evidence c).","findings":[]},{"id":"F-7","result":"pass","note":"The four consequence strings now cite no FR or AD ids, so no cited bullet can mismatch. Each body checks what its string declares. XT-runtime-1 checks the exports, the global's descriptor, the grader call, sync and async return and the opt-out. XT-runtime-2 checks per-unit slot isolation and that the switch order is the same on all 3 runs. XT-runtime-3 checks that a write with no frame throws ScopeFrameException and that the Registry rejects conflicting registrations. XT-runtime-4 checks that the dependency fields are absent and that the graph check rejects an added dependency with exact lines.","findings":[]},{"id":"F-8","result":"pass","note":"The code changes stay in packages/runtime (Scope Frame, interleave, and the Registry core the frame code relies on, per ESC-9.1-2). The tools/*.d.ts files are type declarations only and add no behaviour of another Component.","findings":[]},{"id":"F-9","result":"fail","note":"interleave is still tagged @asyncRoot callback and is listed with root 'callback'. It does no IO behind an async-root Driver contract; it is async only by derivation from its callbacks (DIV-1). AD-6 and ESC-6.4-1, which its comment cites, are not in the prompt, so the convention cannot be confirmed.","findings":[{"path":"packages/runtime/src/scope/interleave.ts","detail":"interleave does no IO but keeps the @asyncRoot callback tag. Remove the tag and record it as async by derivation, or supply the text of the AD-6 / ESC-6.4-1 rule that permits a callback root under F-9."},{"path":"packages/runtime/async-surface.json","detail":"The entry {\"method\":\"interleave\",\"root\":\"callback\"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation."}]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"Provide the consequence records supporting AD-5 in XT-runtime-1 through XT-runtime-3 and AD-2 in XT-runtime-4, and cite the applicable consequence bullets so their correspondence to the assertions can be verified.","fixed":true,"note":"XT-runtime-1 to XT-runtime-4 no longer cite AD-5 or AD-2. With no ids cited, there is nothing left whose correspondence to the assertions needs checking."},{"id":"P-2","reviewer":1,"item":"F-9","path":"packages/runtime/src/scope/interleave.ts","detail":"Remove the @asyncRoot tag from interleave; its Promise return is derived from async callbacks, rather than an IO Driver root. Represent that derivation consistently in packages/runtime/async-surface.json.","fixed":false,"note":"interleave.ts still carries @asyncRoot callback, and async-surface.json still has root 'callback'."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-1, XT-runtime-2 and XT-runtime-3 cite 'AD-5', and XT-runtime-4 cites 'AD-2'. These are whole decisions, not AD-<n>.<k> bullets, and none of them appears in conformance/xaravel-consequences/*.jsonl ('unknown consequence id'). Cite the exact bullet each test verifies (for example AD-5.<k> for frame isolation, AD-2.<k> for the dependency graph) and add those consequences to the consequences registry, so the match can be checked.","fixed":true,"note":"The unknown whole-decision ids were removed from all four consequence strings, so there is no unregistered consequence id left."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/scope.test.ts","detail":"XT-runtime-4 says the package 'has no dependencies in the graph check'. The body only checks that no line of the graph tool's output mentions @xaravel/runtime and that the tool exits 0. That passes even if the graph never scans the package. It also skips devDependencies, even though this change adds @xaravel/assert there. Assert on the graph tool's actual record of @xaravel/runtime (empty dependency set), or narrow the consequence string to what is checked.","fixed":true,"note":"XT-runtime-4's string is narrowed to no dependencies/peerDependencies/optionalDependencies plus the graph check rejecting an added dependency. The body checks that those fields are absent and that the check, run on a temporary copy, reports the exact cycle and layer-edge lines, which proves the package is scanned."},{"id":"P-5","reviewer":2,"item":"F-9","path":"packages/runtime/src/scope/interleave.ts","detail":"`interleave` is tagged `@asyncRoot callback` but does no IO. It only starts the given functions and awaits Promise.all of them. It is a dev-only test helper, not an IO Driver contract. Remove the @asyncRoot tag and record it as async by derivation in the form the async-surface tooling expects. Or, if `@asyncRoot callback` is the approved way to mark callback-derived async methods, cite the decision or Escalation that defines it.","fixed":false,"note":"The tag is kept, and its comment now cites AD-6 and ESC-6.4-1. Neither text is in the prompt, so whether they define a callback tag cannot be verified, and the method still does no IO."},{"id":"P-6","reviewer":2,"item":"F-9","path":"packages/runtime/async-surface.json","detail":"The entry {\"method\":\"interleave\",\"root\":\"callback\"} names no async-root Driver contract. Align it with the interleave.ts fix and with DIV-1's split between async roots and async by derivation.","fixed":false,"note":"async-surface.json is unchanged: {\"method\":\"interleave\",\"root\":\"callback\"} still names no Driver-contract root."}]}
```
