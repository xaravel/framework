---
title: 'The frame-chain read and Macroable''s full write rule (epic-11-retro-item-1-frame-chain-read)'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_revision: '87fc2ce790bf924d2c587dcdb308a12020596782'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-11.1-3.md'
  - '{project-root}/decisions/ESC-11.1-5.md'
  - '{project-root}/decisions/ESC-11.1-6.md'
  - '{project-root}/decisions/DIV-11.md'
  - '{project-root}/decisions/MAINT-2026-10-24-ad-5-8-any-depth.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-retro-2026-10-24.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `guardWrite` in Macroable reads only `currentFrame().kind` (retro finding S1). A `test` frame opened inside a `request`, `job` or `command` unit takes a macro write, against DIV-11.2. A `unit` or narrow frame nested in a real test frame throws, though ESC-11.1-5's second bullet lets it write to the test frame. The runtime has no read of the frame chain (ESC-11.1-3).

**Approach:** `@xaravel/runtime/scope` exports `frameKinds(): readonly string[]`: the kinds of the active frame chain, innermost first, unit and narrow frames, parents only (origins not followed), frozen, `[]` with no frame. ESC-11.1-3 lets the runtime change pick this form. `runInNarrowFrame` refuses the kind `test`, so `test` in the chain always means a test unit. `guardWrite` passes a write only when `frameKinds()` contains `test` and none of `request`, `job` or `command`. Otherwise it throws `ScopeFrameException`. The write itself still goes through `frameStatic`, which routes it as AD-5.8 says. The Maintainer amended AD-5.8 (decisions/MAINT-2026-10-24-ad-5-8-any-depth.md): a unit nested in a test frame at any depth holds only the request, route and CSP nonce, and every other write lands in the nearest enclosing test frame. So the runtime's `ownerOf` skips every unit that has a `test` unit among its parents (origins not followed), not only a direct child of the test.

## Boundaries & Constraints

**Always:** Edit only `packages/runtime/**`, `packages/macroable/**` and this item's records under `_bmad-output/implementation-artifacts/` (Story 11.1's spec `deferred[0]` included). Keep the read sync, with no new frame state (ESC-11.1-3 rationale). Also export `frameKinds` from the package root, as every scope export is. Keep the existing XT-macroable-2 throw cases: none, `request`/`job`/`command` (root and under a test), root `unit`, and concurrent tests. Every changed case asserts the outcome these rulings set. XT-macroable-3 still finds `ESC-11.1-2` and `ESC-11.1-3` under `## Divergences`.

**Never:** Change `frameStatic`'s, `frameOverlay`'s or `ownerOf`'s routing beyond the amended AD-5.8 (any depth under a test frame, parents only). Never follow an origin in the read. Never touch `conformance/**`, `tools/**`, `PORTING.md`, another package, or the item's `action`/`owner`/`epic`. Never remove or weaken an assertion except the nested-in-test throw cases, which this item's rulings replace.

## I/O & Edge-Case Matrix

| Scenario | Frame chain (innermost first) | `frameKinds()` | Macro write |
|----------|------------------------------|----------------|-------------|
| No frame | — | `[]` | throws `no active Scope Frame` (ESC-11.1-2) |
| Test frame | `test` | `["test"]` | passes; held by the test, discarded at its end |
| Unit in test | `unit, test` | `["unit","test"]` | passes; lands in the test frame (AD-5.8), still seen after the unit ends |
| Narrow in test | `narrow, test` | `["narrow","test"]` | passes; lands in the test frame |
| Unit in unit in test | `unit, unit, test` | three kinds | passes; lands in the test frame (amended AD-5.8, any depth) |
| Request (job, command) under test | `request, test` | `["request","test"]` | throws `inside a request frame` |
| Test in request | `test, request` | `["test","request"]` | throws: a request frame encloses it (DIV-11.2) |
| Unit in request in test | `unit, request, test` | three kinds | throws: request in the chain |
| Root unit | `unit` | `["unit"]` | throws `inside a unit frame` (ESC-11.1-5 bullet 1) |
| interleave unit of a test | root `unit`, origin `test` | `["unit"]` | throws: origins are not followed |
| Narrow kind `test` | `runInNarrowFrame("test", …)` | — | `TypeError` from `runInNarrowFrame` |

</intent-contract>

## Code Map

- `packages/runtime/src/scope/scope.ts` -- `ownerOf` (the write owner): its child-of-test test reads `nearestUnit(frame.parent)`; replace it with a parents-only `underTest(frame.parent)` (amended AD-5.8). The header's frame-kinds and overlays paragraphs, the three slot docblocks and `lookUp`'s comment say "child of a test unit". `Store` chain (`parent`, `origin`, `type`); `currentFrame()` at :113; `runInNarrowFrame` (`checkRun`); add `frameKinds()` beside `currentFrame`. The header comment lists the primitives.
- `packages/runtime/src/scope/index.ts`, `packages/runtime/src/index.ts` -- the export lists (XT-runtime-37 reads them); add `frameKinds`.
- `packages/runtime/docs/scope-frames.md` -- "Frames and slots" bullets; XT-runtime-37 requires every export in backticks.
- `packages/runtime/async-surface.json` -- generated by `tools/async-surface`; a sync function adds no line (check with `--check runtime`).
- `packages/runtime/tests/xaravel/frames.test.ts` -- XT-runtime-6 is the AD-5.8 child-unit case; add units nested two and three deep (through a `unit`/`job` middle and a narrow frame) for slots, overlays and statics. The AD-5.8 XT file (XT-runtime-5..8); add XT-runtime-42. The last id is XT-runtime-41 in `tokens.test.ts`.
- `packages/macroable/src/Support/Traits/Macroable.ts` -- `guardWrite` (:60), `WRITABLE_KIND`, the header's "Writes" paragraph.
- `packages/macroable/tests/xaravel/macroable.test.ts` -- XT-macroable-2 (:240): its consequence string and the nested-in-test block change; XT-macroable-3 (:354) checks the Divergences citations.
- `packages/macroable/docs/macroable.md` -- the "Registering a macro" note, the DIV-11.2 bullet and the "Child frames (ESC-11.1-3)" follow-up bullet.
- `_bmad-output/implementation-artifacts/spec-11-1-macroable-trait.md` -- frontmatter `deferred[0]` is this item's finding. Mark it resolved here.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/scope/scope.ts` -- `ownerOf` routes a non-child-of-test write from a unit with a `test` unit anywhere up its parents to the nearest test frame; update the header, slot docblocks and `lookUp` comment -- amended AD-5.8.
- `packages/runtime/docs/scope-frames.md` -- the slot bullet and the overlays paragraph say "at any depth".
- `packages/runtime/tests/xaravel/frames.test.ts` -- XT-runtime-6: nested-at-any-depth case and its consequence string.
- `packages/runtime/src/scope/scope.ts` -- add `frameKinds()`; make `runInNarrowFrame` throw `TypeError` for kind `test`; update the header -- the chain read (ESC-11.1-3).
- `packages/runtime/src/scope/index.ts`, `packages/runtime/src/index.ts` -- export `frameKinds`.
- `packages/runtime/docs/scope-frames.md` -- document `frameKinds()` and the reserved narrow kind.
- `packages/runtime/tests/xaravel/frames.test.ts` -- XT-runtime-42 (AD-5.8): every matrix row's `frameKinds()`, across `await`, frozen result, and the narrow `test` TypeError.
- `packages/macroable/src/Support/Traits/Macroable.ts` -- `guardWrite` over `frameKinds()`; new messages; update the header.
- `packages/macroable/tests/xaravel/macroable.test.ts` -- XT-macroable-2: the nested unit and narrow frames write to the test frame; add the unit-in-unit, test-in-request, unit-in-request-in-test and interleave cases; update the consequence string.
- `packages/macroable/docs/macroable.md` -- the registration note, the DIV-11.2 bullet, and the ESC-11.1-3 bullet, which now records the read as landed.
- `_bmad-output/implementation-artifacts/spec-11-1-macroable-trait.md` -- record `deferred[0]` as resolved by this item.

**Acceptance Criteria:**
- Given each chain in the matrix, when `frameKinds()` is read, then it returns that row's kinds innermost first, frozen, and the same after an `await` in the frame.
- Given a unit nested two or three deep in a test frame (through a `unit` or `job` middle, and a narrow frame), when it writes a slot, an overlay and a static, then each lands in the test frame, while its request, route and CSP nonce stay in it, and the test frame's writes end with it.
- Given each chain in the matrix, when `macro`, `mixin` and `flushMacros` run, then each passes or throws `ScopeFrameException` as that row says, and a passing write is visible where AD-5.8 routes it.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then each passes with no difference.

## Design Notes

`ESC-11.1-5`'s two bullets disagree on a `unit` nested in a test frame. The item settles it: such a unit writes. The item's text asks for "no request, job or command frame between" the test and the innermost frame. The retro's item 1 also asks for a throw "under a request, job or command frame anywhere in the chain". Both hold only when the chain has a `test` and no `request`/`job`/`command` at all, which is the rule built here. Routing stays with `frameStatic`, and the runtime's `ownerOf` follows the amended AD-5.8 (decisions/MAINT-2026-10-24-ad-5-8-any-depth.md): a write from a unit or narrow frame nested in a test frame at any depth lands in the nearest test frame. That settles reviewer 2's F-7 reject of attempt 1 (the two-deep unit kept its own write): Macroable's rule and AD-5.8 now agree with ESC-11.1-5's second bullet. Only parents count: an `interleave` unit's origin is not followed, so its writes stay in it. A `test` unit opened inside a test frame owns its writes: units nested in it write to it, the nearest test frame, and its writes end with it (attempt-2 review, F-7).

## Verification

**Commands:**
- `bun test packages/runtime packages/macroable` -- expected: all pass
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run api-surface:gate macroable` -- expected: 0 unexplained

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 21 findings — high 1, medium 3, low 13, false 4, maybe-false 0 (verification-gap: none)
- findings:
  - `[medium]` `[intent_gap]` (blind) Two-deep unit case contradicts ESC-11.1-5 bullet 2 and retro item 1: `unit, unit, test` write is held by the inner unit and lost mid-test — confirmed at `ownerOf` (scope.ts): a grandchild of a test owns its static writes; the matrix row in the intent contract fixes this outcome, so it is the contract's root cause.
  - `[high]` `[intent_gap]` (fidelity reviewer 2, F-7) XT-macroable-2 asserts the inner unit holds two-deep writes, against ESC-11.1-5 bullet 2; route writes to the nearest test unit or get a ruling — same root cause as above; the fix needs base-only writes routed unlike AD-5.8 (a new runtime test-frame static), which the contract's matrix and Never line exclude.
  - `[medium]` `[intent_gap]` (fidelity reviewer 2, F-7) Header and docs call two-deep routing ESC-11.1-5's; `macro` docblock still says "unless the innermost frame is a test frame" — same root cause; the docblock part would be a patch.
  - `[medium]` `[intent_gap]` (edge) A narrow frame inside a two-deep unit writes to that unit, while the docs say narrow writes land in the test frame — same root cause.
  - `[low]` `[intent_gap]` (edge) `runInFrame("test")` nested in a test routes the inner test's write to the outer test, outliving the inner — verified via `ownerOf`; same routing question.
  - `[low]` `[intent_gap]` (intent 2) Depth-2 placement: intent says the test frame's overlay, the diff asserts the inner unit — same root cause.
  - `[low]` `[reject]` (fidelity reviewer 2, F-7) ESC-11.1-6's text not in the prompt — a missing-evidence finding outside F-2/F-3/F-8; the next attempt cites ESC-11.1-6 in the changed header so (f) carries it.
  - `[low]` `[reject]` (edge) A narrow frame named `request`/`job`/`command` counts as a barrier — stricter than needed; no framework code opens such a narrow frame.
  - `[low]` `[reject]` (blind) `BARRIER_KINDS` is a closed set, so a `schedule` unit nested in a test writes — the item's text names only request, job and command (DIV-11.2); ESC-11.1-5's "any kind" bullet is about a frame with no enclosing test.
  - `[false]` `[reject]` (blind) The spec settles ESC-11.1-5's bullet conflict without an Escalation — ESC-11.1-6 routes that decision to this item ("that item decides").
  - `[low]` `[reject]` (blind) The rule lives in Macroable, not the runtime — ESC-11.1-3 puts the read in the runtime, which it is; each writer applying it is the approved shape.
  - `[low]` `[reject]` (blind, intent 4) Reserving the narrow kind `test` is an unrequested contract — inside packages/runtime, tested, no callers; carried to the next attempt.
  - `[low]` `[intent_gap]` (blind) An interleave unit reads the test's macros through its origin but cannot write; undocumented and untested — depends on the routing answer.
  - `[low]` `[intent_gap]` (blind) No case shows a write made only from a nested frame is discarded at the test's end — depends on the routing answer.
  - `[false]` `[reject]` (blind) The verification plan omits async-surface and a runtime gate — XT-runtime-37 runs `async-surface --check runtime` inside the harness; fixing it would edit this spec.
  - `[low]` `[reject]` (blind) XT-runtime-42 lacks `test, test` and narrow-in-narrow chains; length assert redundant — carried as a note for the next attempt.
  - `[low]` `[reject]` (blind) Messages name the barrier, not the innermost frame; narrow kind in the no-test message — wording only; carried.
  - `[false]` `[reject]` (blind) Story 11.1's `deferred[0]` marked resolved before review — the same PR carries both; reverted with the code anyway.
  - `[false]` `[reject]` (blind) `warnings: [oversized]` unexplained — the template defines it (spec over 1600 tokens).
  - `[low]` `[reject]` (intent 1) "between" vs "anywhere": the diff implements the stricter reading — both sentences are the item's own; the conjunction satisfies both.
  - `[low]` `[reject]` (intent 5) Narrow frames named like barriers count as barriers — duplicate of the edge row above, same evidence.
- Route: intent_gap. The attempted change is saved as [retro-11-frame-chain-read-attempt-1.patch](retro-11-frame-chain-read-attempt-1.patch) and the code is reverted.

### 2026-10-25 — Review pass (attempt 2, after decisions/MAINT-2026-10-24-ad-5-8-any-depth.md)
- verdicts: 25 findings — high 1, medium 4, low 14, false 3, maybe-false 0 (verification-gap: 1 gap)
- findings:
  - `[high]` `[patch]` (fidelity reviewer 1, F-7) `ownerOf` skips a `test` unit nested in another test, so test → test → unit writes land in the outer test, not the nearest one — a `test` unit now owns its writes (returned before the nested-in-test skip); nearest test, as the ruling's per-test isolation and the registry's test-frame write already do.
  - `[medium]` `[patch]` (fidelity reviewer 1, F-7) XT-runtime-6 declares "nearest enclosing test" but has no nested test chain; XT-macroable-2 lacks the macro case — added test > test > unit and test > unit > test > unit cases (slot, overlay, static) and a nested-test macro case.
  - `[medium]` `[patch]` (edge) test > unit > test2: test2's writes land in the outer test and outlive it — same root cause as the first row.
  - `[low]` `[reject]` (edge) A custom unit kind under a test passes the guard — the item names only request, job and command (DIV-11.2); carried from attempt 1's same row.
  - `[medium]` `[patch]` (edge, claim) Docs say "nearest" while `ownerOf` picks the outermost test — same root cause; fixed by the routing patch.
  - `[medium]` `[patch]` (edge, claim) Macros registered in a nested test leak into the enclosing test — same root cause.
  - `[low]` `[patch]` (verification-gap) Nested test-frame routing unpinned by any test — same root cause as row 2; the new cases pin it.
  - `[low]` `[patch]` (verification-gap) `registerTestClass` and `frameStatic` disagreed on test > unit > test — same root cause; they now agree on the innermost test.
  - `[false]` `[reject]` (verification-gap) ESC-11.1-2 cited for the no-active-frame throw looks wrong — ESC-11.1-2 is the ruling that a macro write with no frame throws (matrix row 1).
  - `[low]` `[patch]` (intent) "nearest" vs outermost wording at the runtime surface — same root cause.
  - `[low]` `[patch]` (blind) Spec Design Notes' "as before" for test-in-test is wrong — the routing patch makes a nested test own its writes; Design Notes updated as bookkeeping.
  - `[low]` `[reject]` (blind) Links to the deleted attempt-1 patch — fixing it edits this spec; the Auto Run Result records that the patch was applied and removed.
  - `[low]` `[reject]` (blind) Auto Run Result stale against frontmatter — an edit to this spec; rewritten at Finalize.
  - `[low]` `[patch]` (blind) XT-macroable-2 never shows a nested-only write discarded at the test's end — the last write is now made from a unit two deep.
  - `[medium]` `[patch]` (blind) A unit under a `request` in a test now routes to the test, untested — `request` added to XT-runtime-6's middle kinds.
  - `[low]` `[patch]` (blind) `frameOverlay`/`frameStatic` doc bullets say "per unit" — updated for nested units.
  - `[low]` `[reject]` (blind) Rename `CHILD_OF_TEST_SLOTS` — internal name, no caller misled; churn outweighs it.
  - `[low]` `[patch]` (blind) `lookUp` docblock line past 120 columns — rewrapped.
  - `[low]` `[patch]` (blind) Story 11.1 spec's resolved text omits the AD-5.8 amendment — added.
  - `[low]` `[reject]` (blind) Message uses `kinds[0]` for a narrow frame in a root unit — wording only; carried from attempt 1.
  - `[low]` `[reject]` (blind) Barrier message names the barrier, not the innermost test — wording only; carried from attempt 1.
  - `[low]` `[patch]` (blind) XT-runtime-6 label "great-grandchild's request" on a grandchild assertion — label fixed.
  - `[false]` `[reject]` (blind) `assertTrue(currentFrame() !== test)` weak — it checks exactly the identity claim (the nested unit is a distinct frame).
  - `[low]` `[reject]` (blind) `guardWrite` freezes a fresh array per write — negligible cost, macro writes are rare boot/test calls.
  - `[false]` `[reject]` (blind) `ownerOf` O(depth²) — frame chains are a few frames deep; no measurable cost, and the walk stops at the first test unit now.

### 2026-10-25 — Review pass (Finalize re-check, Fidelity Review only)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; reviewer 1 and reviewer 2 pass at tree `773b268155332b8941446c217398140ee8f52889`, and `fidelity:review status` prints `current`.

## Auto Run Result

Status: done

Attempt 1 was blocked on an intent gap (where a write from a unit nested two deep in a test frame goes). Its patch was saved, then applied again to resume this attempt and deleted (`retro-11-frame-chain-read-attempt-1.patch`; attempt-1 tree `cdcdc0978f6863d15ed0cfe5a723613ccf69a2fd`). Attempt 2 resumed under `decisions/MAINT-2026-10-24-ad-5-8-any-depth.md`, which amends AD-5.8 to "at any depth".

**Summary.**
- `@xaravel/runtime/scope` exports `frameKinds()`.
- `runInNarrowFrame` refuses the kind `test`.
- The runtime's `ownerOf` follows the amended AD-5.8:
  - a non-test unit with a `test` unit among its parents keeps only the request, route and CSP nonce, and its other writes go to the nearest test frame;
  - a `test` unit owns its own writes, nested in another test or not.
- Macroable's `guardWrite` passes a write only when the chain holds `test` and no `request`, `job` or `command` frame.

**Files changed.**
- `packages/runtime/src/scope/scope.ts`: `frameKinds`, the narrow-`test` refusal, `underTest` and `ownerOf` routing, and the comments.
- `packages/runtime/src/scope/index.ts` and `packages/runtime/src/index.ts`: export `frameKinds`.
- `packages/runtime/docs/scope-frames.md`: `frameKinds`, the reserved narrow kind, and routing at any depth, including the nested-test rule.
- `packages/runtime/tests/xaravel/frames.test.ts`:
  - XT-runtime-6 gains units nested two and three deep (through a `request`, `unit` or `job` middle and a narrow frame) and nested test frames;
  - new XT-runtime-42, the chain read.
- `packages/macroable/src/Support/Traits/Macroable.ts`: `guardWrite` over `frameKinds()`, the header, and the `macro` docblock.
- `packages/macroable/tests/xaravel/macroable.test.ts`, XT-macroable-2:
  - nested writes at any depth, and the new throw cases;
  - a write made only from a nested frame is discarded when the test ends;
  - a nested test frame's macros end with it.
- `packages/macroable/docs/macroable.md`: the registration note and the DIV-11.2 and ESC-11.1-3 bullets.
- `_bmad-output/implementation-artifacts/spec-11-1-macroable-trait.md`: `deferred[0]` resolved.
- `_bmad-output/implementation-artifacts/retro-11-frame-chain-read-attempt-1.patch`: deleted, now applied.

**Review findings.** Attempt 2's first pass had 25 findings.
- 16 were patched. The high one was a nested test frame's writes going to the outermost test; it was raised by Fidelity reviewer 1 (F-7) and by the edge, verification-gap and blind layers.
- None were deferred.
- 9 were rejected, each with its reason in the triage log: custom unit kinds, 3 spec edits, the internal name rename, 2 message wordings carried from attempt 1, and 3 false findings.
- Patched by verdict: high 1, medium 5, low 10.
- The Finalize re-check pass: 0 findings.

**Follow-up review recommendation: false.** This pass patched one high. It is now pinned by the nested-test cases in XT-runtime-6 and XT-macroable-2, and both Fidelity reviewers passed on the patched tree, so no unverified risk is left to name.

**Verification.**
- `bun test packages/runtime packages/macroable`: 61 pass.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, exit 0.
- `bun run typecheck` and `bun run lint`: exit 0.
- `bun run api-surface:gate macroable`: 0 unexplained.
- `async-surface --check runtime`: ok.
- `bun run fidelity:review status --item epic-11-retro-item-1-frame-chain-read`: `current` at tree `773b268155332b8941446c217398140ee8f52889`.

**Residual risks.**
- A unit nested in a `request` or `job` unit inside a test frame now sends its non-request writes to the test frame. Before, the request unit kept them. AD-5.8 now requires this, and no current caller opens such a chain outside tests.
- A `test` unit that is a direct child of a test now owns its writes. Before, they went to the outer test. No test or caller relied on the old routing, and the harness shows no difference.

## Fidelity Review

### Reviewer 1: pass at tree cdcdc0978f6863d15ed0cfe5a723613ccf69a2fd

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `af595c158c89e31c0dbed11090dd21a6d7ba2f97`, on 2026-10-25T05:40:49.420Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the changed XT-macroable-2 expectations with ESC-11.1-3, ESC-11.1-5 and AD-5.8. Nested-frame throws become explicit checks of the authorized writes and their destinations; comparisons are not loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed, so there is no Upstream assertion floor to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared both touched Xaravel Tests with their consequence strings and cited rules. They check chain order, freezing, parent-only traversal, narrow-test rejection, macro barriers, nested write routing, disposal and concurrent isolation. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the action item's runtime and macroable scope. The chain read and macro guard implement those components directly, without simulating Application lifecycle or another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations with AD-6 and ESC-9.3-1. frameKinds and macro operations remain synchronous; generic frame runners retain their permitted dual-helper signatures. No required async-root tag is missing or falsely retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"cdcdc0978f6863d15ed0cfe5a723613ccf69a2fd","base":"af595c158c89e31c0dbed11090dd21a6d7ba2f97","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T05:40:49.420Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed XT-macroable-2 expectations with ESC-11.1-3, ESC-11.1-5 and AD-5.8. Nested-frame throws become explicit checks of the authorized writes and their destinations; comparisons are not loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed, so there is no Upstream assertion floor to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared both touched Xaravel Tests with their consequence strings and cited rules. They check chain order, freezing, parent-only traversal, narrow-test rejection, macro barriers, nested write routing, disposal and concurrent isolation.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the action item's runtime and macroable scope. The chain read and macro guard implement those components directly, without simulating Application lifecycle or another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations with AD-6 and ESC-9.3-1. frameKinds and macro operations remain synchronous; generic frame runners retain their permitted dual-helper signatures. No required async-root tag is missing or falsely retained.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree cdcdc0978f6863d15ed0cfe5a723613ccf69a2fd

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `af595c158c89e31c0dbed11090dd21a6d7ba2f97`, on 2026-10-25T05:40:49.420Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the change adds or changes no Ported Test; only Xaravel Tests (XT-macroable-2, XT-runtime-42) change. |
| F-2: No expected value is weakened | pass | No Ported Test is touched and no stale_tests path is listed. In XT-macroable-2 the nested unit/narrow throw checks became exact assertSame/assertTrue/assertFalse checks of the write behaviour the action item asks for. No exact check was made looser, and the request/job/command throw checks keep their exact class and message substring. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched. XT-macroable-2 removes no case without a counterpart: each removed nested-frame assertThrows has a matching assertion of the new outcome for macro, flushMacros and mixin, and new cases are added (test in request, unit in request in test, interleave unit). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the change relies on none. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-42's body checks every clause of its consequence: order, unit and narrow frames, parents only, interleave origin not followed, frozen, [] outside any frame, the same result after an await, and the narrow 'test' refusal with its exact message. XT-macroable-2's body covers the no-frame, barrier-anywhere, test-in-request, root-unit and interleave throws, and the routed writes. However, I compared the behaviour it tests for nested frames with the cited ruling ESC-11.1-5 (evidence f). Its second bullet says a write from a unit nested in a test frame goes to the test frame's overlay. The test and implementation instead keep a write from a unit nested two deep in that unit, and the test comment cites ESC-11.1-5's second bullet for that. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes are confined to packages/runtime (frameKinds, the narrow 'test' refusal, exports, docs, XT-runtime-42) and packages/macroable (guardWrite, docs, XT-macroable-2), which are the two components the action item lists. No stub, fake or hard-coded behaviour of another component is added. The 'sealed' seam is left as a follow-up, as ESC-11.1-2 rules. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in Macroable.ts, index.ts or scope/index.ts. In scope.ts, lines 131 and 134 are only comments explaining why the runners are untagged (ESC-9.3-1, dual helpers). The new export frameKinds is sync, returns readonly string[] and is correctly untagged. guardWrite stays sync. interleave's existing '@​asyncRoot callback' is in a file this change does not touch. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/macroable/tests/xaravel/macroable.test.ts`: The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it.
- **F-7** `packages/macroable/src/Support/Traits/Macroable.ts`: The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the 'macro' docblock (lines 157-161) still says it 'Throws 'ScopeFrameException' unless the innermost frame is a 'test' frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule.
- **F-7** `packages/macroable/src/Support/Traits/Macroable.ts`: The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"cdcdc0978f6863d15ed0cfe5a723613ccf69a2fd","base":"af595c158c89e31c0dbed11090dd21a6d7ba2f97","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T05:40:49.420Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the change adds or changes no Ported Test; only Xaravel Tests (XT-macroable-2, XT-runtime-42) change.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched and no stale_tests path is listed. In XT-macroable-2 the nested unit/narrow throw checks became exact assertSame/assertTrue/assertFalse checks of the write behaviour the action item asks for. No exact check was made looser, and the request/job/command throw checks keep their exact class and message substring.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched. XT-macroable-2 removes no case without a counterpart: each removed nested-frame assertThrows has a matching assertion of the new outcome for macro, flushMacros and mixin, and new cases are added (test in request, unit in request in test, interleave unit).","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the change relies on none.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-42's body checks every clause of its consequence: order, unit and narrow frames, parents only, interleave origin not followed, frozen, [] outside any frame, the same result after an await, and the narrow `test` refusal with its exact message. XT-macroable-2's body covers the no-frame, barrier-anywhere, test-in-request, root-unit and interleave throws, and the routed writes. However, I compared the behaviour it tests for nested frames with the cited ruling ESC-11.1-5 (evidence f). Its second bullet says a write from a unit nested in a test frame goes to the test frame's overlay. The test and implementation instead keep a write from a unit nested two deep in that unit, and the test comment cites ESC-11.1-5's second bullet for that.","findings":[{"path":"packages/macroable/tests/xaravel/macroable.test.ts","detail":"The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it.","kind":"defect"},{"path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the `macro` docblock (lines 157-161) still says it 'Throws `ScopeFrameException` unless the innermost frame is a `test` frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule.","kind":"defect"},{"path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The changes are confined to packages/runtime (frameKinds, the narrow `test` refusal, exports, docs, XT-runtime-42) and packages/macroable (guardWrite, docs, XT-macroable-2), which are the two components the action item lists. No stub, fake or hard-coded behaviour of another component is added. The `sealed` seam is left as a follow-up, as ESC-11.1-2 rules.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in Macroable.ts, index.ts or scope/index.ts. In scope.ts, lines 131 and 134 are only comments explaining why the runners are untagged (ESC-9.3-1, dual helpers). The new export frameKinds is sync, returns readonly string[] and is correctly untagged. guardWrite stays sync. interleave's existing `@asyncRoot callback` is in a file this change does not touch.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 117e2a13df1093b7f8e3aadb325bdff97f29ad24

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `87fc2ce790bf924d2c587dcdb308a12020596782`, on 2026-10-25T06:49:27.695Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed. |
| F-2: No expected value is weakened | pass | Changed Xaravel expectations retain exact checks; nested-write outcomes follow the supplied Maintainer ruling amending AD-5.8. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are affected. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The previous findings are addressed, but the implementation and tests do not establish the declared nearest-test routing for nested test units. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the named runtime and macroable components and add no substitute implementation of a later component. |
| F-9: Every `@asyncRoot` tag is true | pass | frameKinds and write routing are synchronous; the retained generic frame runners match ESC-9.3-1's untagged dual-helper rule. No new async root requires a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/src/scope/scope.ts`: ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it.
- **F-7** `packages/runtime/tests/xaravel/frames.test.ts`: XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/macroable/tests/xaravel/macroable.test.ts`: The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it. **fixed**: Two-deep macro writes now assert persistence in the test frame, supported by the supplied Maintainer ruling and runtime routing change.
- **P-2** (reviewer 2, F-7) `packages/macroable/src/Support/Traits/Macroable.ts`: The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the 'macro' docblock (lines 157-161) still says it 'Throws 'ScopeFrameException' unless the innermost frame is a 'test' frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule. **fixed**: The header, documentation and macro docblock now describe frame-chain barriers and nested writes to the test frame.
- **P-3** (reviewer 2, F-7) `packages/macroable/src/Support/Traits/Macroable.ts`: The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it. **fixed**: ESC-11.1-6 is supplied in full and explicitly delegates the nested cases to this frame-chain follow-up; the Maintainer ruling supplies the resulting rule.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"117e2a13df1093b7f8e3aadb325bdff97f29ad24","base":"87fc2ce790bf924d2c587dcdb308a12020596782","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T06:49:27.695Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Changed Xaravel expectations retain exact checks; nested-write outcomes follow the supplied Maintainer ruling amending AD-5.8.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are affected.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The previous findings are addressed, but the implementation and tests do not establish the declared nearest-test routing for nested test units.","findings":[{"path":"packages/runtime/src/scope/scope.ts","detail":"ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it.","kind":"defect"},{"path":"packages/runtime/tests/xaravel/frames.test.ts","detail":"XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Changes stay within the named runtime and macroable components and add no substitute implementation of a later component.","findings":[]},{"id":"F-9","result":"pass","note":"frameKinds and write routing are synchronous; the retained generic frame runners match ESC-9.3-1's untagged dual-helper rule. No new async root requires a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/macroable/tests/xaravel/macroable.test.ts","detail":"The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it.","fixed":true,"note":"Two-deep macro writes now assert persistence in the test frame, supported by the supplied Maintainer ruling and runtime routing change."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the `macro` docblock (lines 157-161) still says it 'Throws `ScopeFrameException` unless the innermost frame is a `test` frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule.","fixed":true,"note":"The header, documentation and macro docblock now describe frame-chain barriers and nested writes to the test frame."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it.","fixed":true,"note":"ESC-11.1-6 is supplied in full and explicitly delegates the nested cases to this frame-chain follow-up; the Maintainer ruling supplies the resulting rule."}]}
```

### Reviewer 2: pass at tree 117e2a13df1093b7f8e3aadb325bdff97f29ad24

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `87fc2ce790bf924d2c587dcdb308a12020596782`, on 2026-10-25T06:49:27.695Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests changed. |
| F-2: No expected value is weakened | pass | Compared the changed XT-macroable-2 assertions with the base: the throw assertions for unit and narrow frames nested in a test became exact write-then-read assertions (assertSame 'unit:y', 'narrow:z', 'deep:z', assertTrue/False hasMacro). ESC-11.1-6's third bullet and MAINT-2026-10-24-ad-5-8-any-depth rule for that behaviour. The request/job/command throw cases are kept, and stricter ones are added. No exact comparison is loosened. XT-runtime-6 and XT-runtime-42 only add assertions. |
| F-3: No assertion is removed without a DIV clause | pass | There are no Ported Tests and no stale_tests paths. In XT-macroable-2, each removed nested-frame throw assertion has a direct replacement asserting the ruled outcome for the same operation (macro, flushMacros, mixin) in the same frame shape. The other cases are all kept: no frame, request/job/command, root unit, later test and concurrent tests. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted:DIV marker and no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The evidence lists no Oracle error fixtures, base or changed, for this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-macroable-2: traced guardWrite (frameKinds, barrier kinds, test required) and ownerOf/underTest against each case. Test in request and unit-in-request-in-test throw 'inside a request frame'. Root unit and interleave unit (["unit"]) throw. Unit, narrow, unit>unit and unit>narrow>unit writes land in the test frame (it reads them back after the nested frames end). A later test sees none. Concurrent tests are kept. This matches its consequence string, AD-5.8 as amended and ESC-11.1-3/5. XT-runtime-6 checks any-depth routing of slots, overlays and statics through job and narrow middles, with request/route/nonce kept in the nested unit, which matches the amended AD-5.8. XT-runtime-42 checks frameKinds order, parents-only, interleave origin not followed, frozen, [] outside, and narrow 'test' refusal, which is the read ESC-11.1-3 defines. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changed files are in packages/runtime and packages/macroable, the two components the action item lists. No stub, fake or hard-coded behaviour of another component. The boot-time seam stays deferred per ESC-11.1-2. |
| F-9: Every `@asyncRoot` tag is true | pass | New export frameKinds is sync and untagged, which is correct. underTest and guardWrite are sync internals. runInNarrowFrame stays an untagged dual-shape runner per ESC-9.3-1. scope.ts holds no @​asyncRoot tag (lines 133/136 are the comment explaining why the runners have none). interleave's @​asyncRoot callback in an untouched file is unchanged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/macroable/tests/xaravel/macroable.test.ts`: The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it. **fixed**: scope.ts ownerOf now uses underTest (all parents), so frameStatic writes from a unit nested at any depth land in the nearest test frame. XT-macroable-2 now asserts 'deep:z' after a two-deep write, plus the deeper mixin/flushMacros cases. ESC-11.1-5's second bullet and MAINT-2026-10-24-ad-5-8-any-depth (in evidence) cover it.
- **P-2** (reviewer 2, F-7) `packages/macroable/src/Support/Traits/Macroable.ts`: The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the 'macro' docblock (lines 157-161) still says it 'Throws 'ScopeFrameException' unless the innermost frame is a 'test' frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule. **fixed**: The Macroable.ts header, the macro docblock (now 'Passes only when the active frame chain holds a test frame and no request, job or command frame...') and docs/macroable.md now state the frame-chain rule and any-depth routing, consistent with ESC-11.1-5.
- **P-3** (reviewer 2, F-7) `packages/macroable/src/Support/Traits/Macroable.ts`: The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it. **fixed**: decisions/ESC-11.1-6.md is now in evidence (f). Its third bullet leaves the nested unit/narrow cases to this frame-chain item, so its earlier 'only test frame takes the write' rule was temporary and this change carries out the follow-up.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"117e2a13df1093b7f8e3aadb325bdff97f29ad24","base":"87fc2ce790bf924d2c587dcdb308a12020596782","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T06:49:27.695Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed XT-macroable-2 assertions with the base: the throw assertions for unit and narrow frames nested in a test became exact write-then-read assertions (assertSame 'unit:y', 'narrow:z', 'deep:z', assertTrue/False hasMacro). ESC-11.1-6's third bullet and MAINT-2026-10-24-ad-5-8-any-depth rule for that behaviour. The request/job/command throw cases are kept, and stricter ones are added. No exact comparison is loosened. XT-runtime-6 and XT-runtime-42 only add assertions.","findings":[]},{"id":"F-3","result":"pass","note":"There are no Ported Tests and no stale_tests paths. In XT-macroable-2, each removed nested-frame throw assertion has a direct replacement asserting the ruled outcome for the same operation (macro, flushMacros, mixin) in the same frame shape. The other cases are all kept: no frame, request/job/command, root unit, later test and concurrent tests.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted:DIV marker and no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The evidence lists no Oracle error fixtures, base or changed, for this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-macroable-2: traced guardWrite (frameKinds, barrier kinds, test required) and ownerOf/underTest against each case. Test in request and unit-in-request-in-test throw 'inside a request frame'. Root unit and interleave unit ([\"unit\"]) throw. Unit, narrow, unit>unit and unit>narrow>unit writes land in the test frame (it reads them back after the nested frames end). A later test sees none. Concurrent tests are kept. This matches its consequence string, AD-5.8 as amended and ESC-11.1-3/5. XT-runtime-6 checks any-depth routing of slots, overlays and statics through job and narrow middles, with request/route/nonce kept in the nested unit, which matches the amended AD-5.8. XT-runtime-42 checks frameKinds order, parents-only, interleave origin not followed, frozen, [] outside, and narrow 'test' refusal, which is the read ESC-11.1-3 defines.","findings":[]},{"id":"F-8","result":"pass","note":"Changed files are in packages/runtime and packages/macroable, the two components the action item lists. No stub, fake or hard-coded behaviour of another component. The boot-time seam stays deferred per ESC-11.1-2.","findings":[]},{"id":"F-9","result":"pass","note":"New export frameKinds is sync and untagged, which is correct. underTest and guardWrite are sync internals. runInNarrowFrame stays an untagged dual-shape runner per ESC-9.3-1. scope.ts holds no @asyncRoot tag (lines 133/136 are the comment explaining why the runners have none). interleave's @asyncRoot callback in an untouched file is unchanged.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/macroable/tests/xaravel/macroable.test.ts","detail":"The 'unit in a unit in a test' case asserts that the inner unit holds macro/mixin/flushMacros writes and drops them at its end ('a:z' afterwards). decisions/ESC-11.1-5.md's second bullet says that in a unit or narrow frame nested in a test frame, the write goes to the test frame's overlay. The comment cites that bullet but asserts the opposite for two-deep nesting. Either route Macroable writes to the nearest test unit, so a two-deep unit's write lands in the test frame, or get a ruling that amends ESC-11.1-5 for AD-5.8's child-of-non-test routing and cite it.","fixed":true,"note":"scope.ts ownerOf now uses underTest (all parents), so frameStatic writes from a unit nested at any depth land in the nearest test frame. XT-macroable-2 now asserts 'deep:z' after a two-deep write, plus the deeper mixin/flushMacros cases. ESC-11.1-5's second bullet and MAINT-2026-10-24-ad-5-8-any-depth (in evidence) cover it."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The header and docs/macroable.md describe two-deep units holding their own writes as following ESC-11.1-5, which contradicts that ruling's text, as above. Separately, the `macro` docblock (lines 157-161) still says it 'Throws `ScopeFrameException` unless the innermost frame is a `test` frame'. That is no longer true: nested unit and narrow frames now write, and a test frame inside a request now throws. Update it to the frame-chain rule.","fixed":true,"note":"The Macroable.ts header, the macro docblock (now 'Passes only when the active frame chain holds a test frame and no request, job or command frame...') and docs/macroable.md now state the frame-chain rule and any-depth routing, consistent with ESC-11.1-5."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/macroable/src/Support/Traits/Macroable.ts","detail":"The action item cites decisions/ESC-11.1-6.md for the new guard. The old code cited it for 'only the innermost test frame takes a write', which this change reverses. Its text is not in the prompt, so I could not confirm the reversal against it. Supply ESC-11.1-6 or the ruling that supersedes it.","fixed":true,"note":"decisions/ESC-11.1-6.md is now in evidence (f). Its third bullet leaves the nested unit/narrow cases to this frame-chain item, so its earlier 'only test frame takes the write' rule was temporary and this change carries out the follow-up."}]}
```

### Reviewer 1: pass at tree 773b268155332b8941446c217398140ee8f52889

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `87fc2ce790bf924d2c587dcdb308a12020596782`, on 2026-10-25T06:56:19.971Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed; the item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed assertions with the diff and recorded rulings. Nested macro rejection cases become explicit successful-write and routing checks as ESC-11.1-6's follow-up and amended AD-5.8 require; comparisons are not loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change introduces no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-6, XT-runtime-42 and XT-macroable-2 with their consequences and amended AD-5.8. Assertions cover chain order, frozen reads, origin exclusion, barriers, deep routing, nearest-test ownership and isolation. ownerOf now stops at the nearest test unit. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the action item's runtime and macroable scope. Both components implement their own behavior without simulating Application lifecycle or another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration evidence with AD-6 and ESC-9.3-1. frameKinds and routing remain synchronous; generic frame runners retain their permitted dual-helper signatures. No async-root tag is missing or falsely applied. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/src/scope/scope.ts`: ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it. **fixed**: ownerOf now returns a test unit before considering whether an enclosing test requires traversal, preserving nearest-test ownership.
- **P-2** (reviewer 1, F-7) `packages/runtime/tests/xaravel/frames.test.ts`: XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2. **fixed**: XT-runtime-6 adds both nested-test shapes with slot, overlay and static assertions inside and after the inner test. XT-macroable-2 adds nested-test macro visibility, disposal and outer-table preservation checks.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"773b268155332b8941446c217398140ee8f52889","base":"87fc2ce790bf924d2c587dcdb308a12020596782","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T06:56:19.971Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed; the item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed assertions with the diff and recorded rulings. Nested macro rejection cases become explicit successful-write and routing checks as ESC-11.1-6's follow-up and amended AD-5.8 require; comparisons are not loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change introduces no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-6, XT-runtime-42 and XT-macroable-2 with their consequences and amended AD-5.8. Assertions cover chain order, frozen reads, origin exclusion, barriers, deep routing, nearest-test ownership and isolation. ownerOf now stops at the nearest test unit.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the action item's runtime and macroable scope. Both components implement their own behavior without simulating Application lifecycle or another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration evidence with AD-6 and ESC-9.3-1. frameKinds and routing remain synchronous; generic frame runners retain their permitted dual-helper signatures. No async-root tag is missing or falsely applied.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/src/scope/scope.ts","detail":"ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it.","fixed":true,"note":"ownerOf now returns a test unit before considering whether an enclosing test requires traversal, preserving nearest-test ownership."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/frames.test.ts","detail":"XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2.","fixed":true,"note":"XT-runtime-6 adds both nested-test shapes with slot, overlay and static assertions inside and after the inner test. XT-macroable-2 adds nested-test macro visibility, disposal and outer-table preservation checks."}]}
```

### Reviewer 2: pass at tree 773b268155332b8941446c217398140ee8f52889

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `87fc2ce790bf924d2c587dcdb308a12020596782`, on 2026-10-25T06:56:19.971Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests change. |
| F-2: No expected value is weakened | pass | XT-macroable-2's assertions that nested unit/narrow writes throw were replaced by write-through assertions. ESC-11.1-6 left exactly this choice to this follow-up, and MAINT-2026-10-24-ad-5-8-any-depth decides it, so this is not a weakening. Every other expected value and asserted message substring is unchanged, and the new guard messages still contain 'inside a <kind> frame' and 'no active Scope Frame'. XT-runtime-6's existing assertions are kept and new ones added. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare against. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted marker or Expectations adapted field is added; DIV-11.2 and DIV-12.10 are cited only in docs and comments. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixtures, base or changed, for this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-42 checks frameKinds() innermost first across unit and narrow frames, parents only (interleave and root units give ['unit']), frozen, [] with no frame, and that runInNarrowFrame refuses the kind test with its exact message. XT-runtime-6 now checks slot, overlay and static writes from units at any depth (through request, unit and job middles and a narrow frame) landing in the nearest test, the request/route/nonce kept in the unit, and nested tests (test>test>unit, test>unit>test>unit) keeping writes in the inner test and leaving the outer unchanged. That matches its consequence and amended AD-5.8. XT-macroable-2 checks every clause of its consequence: no frame, a barrier anywhere (a test inside one included), a chain with no test (root unit, interleave unit), nested unit/narrow writes at depths 1-3 landing in the test, a nested test's macros ending with it, and two concurrent tests. The cited AD-5.8, DIV-11.2, ESC-11.1-3 and ESC-11.1-5 match what is tested. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are confined to packages/runtime and packages/macroable, the item's listed components. No stubs, fakes or hard-coded returns for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The new export frameKinds is synchronous and untagged, correctly. The new private underTest is synchronous. In scope.ts the only @​asyncRoot mentions are the existing comment explaining why runInFrame, runInRootFrame and runInNarrowFrame are untagged dual helpers (ESC-9.3-1), and runInNarrowFrame stays generic T. Neither the macroable file nor the index files carry tags, and they add no async export. The interleave tag (@​asyncRoot callback) is unchanged and true. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/src/scope/scope.ts`: ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it. **fixed**: ownerOf now returns as soon as it reaches a unit of kind test, before asking whether a test encloses it (underTest). So test→test→unit and test→unit→test→unit writes stop at the inner test. lookUp reads the inner test first, so reads agree.
- **P-2** (reviewer 1, F-7) `packages/runtime/tests/xaravel/frames.test.ts`: XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2. **fixed**: XT-runtime-6 adds the 'test > test > unit' and 'test > unit > test > unit' shapes, checking slot, overlay and static writes in the inner test and outer values unchanged after it ends. XT-macroable-2 adds a test nested in a unit in a test: its macro is seen inside it, gone after it ends, and the outer test's macro is unchanged.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"773b268155332b8941446c217398140ee8f52889","base":"87fc2ce790bf924d2c587dcdb308a12020596782","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T06:56:19.971Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests change.","findings":[]},{"id":"F-2","result":"pass","note":"XT-macroable-2's assertions that nested unit/narrow writes throw were replaced by write-through assertions. ESC-11.1-6 left exactly this choice to this follow-up, and MAINT-2026-10-24-ad-5-8-any-depth decides it, so this is not a weakening. Every other expected value and asserted message substring is unchanged, and the new guard messages still contain 'inside a <kind> frame' and 'no active Scope Frame'. XT-runtime-6's existing assertions are kept and new ones added.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare against.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted marker or Expectations adapted field is added; DIV-11.2 and DIV-12.10 are cited only in docs and comments.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixtures, base or changed, for this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-42 checks frameKinds() innermost first across unit and narrow frames, parents only (interleave and root units give ['unit']), frozen, [] with no frame, and that runInNarrowFrame refuses the kind test with its exact message. XT-runtime-6 now checks slot, overlay and static writes from units at any depth (through request, unit and job middles and a narrow frame) landing in the nearest test, the request/route/nonce kept in the unit, and nested tests (test>test>unit, test>unit>test>unit) keeping writes in the inner test and leaving the outer unchanged. That matches its consequence and amended AD-5.8. XT-macroable-2 checks every clause of its consequence: no frame, a barrier anywhere (a test inside one included), a chain with no test (root unit, interleave unit), nested unit/narrow writes at depths 1-3 landing in the test, a nested test's macros ending with it, and two concurrent tests. The cited AD-5.8, DIV-11.2, ESC-11.1-3 and ESC-11.1-5 match what is tested.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are confined to packages/runtime and packages/macroable, the item's listed components. No stubs, fakes or hard-coded returns for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The new export frameKinds is synchronous and untagged, correctly. The new private underTest is synchronous. In scope.ts the only @asyncRoot mentions are the existing comment explaining why runInFrame, runInRootFrame and runInNarrowFrame are untagged dual helpers (ESC-9.3-1), and runInNarrowFrame stays generic T. Neither the macroable file nor the index files carry tags, and they add no async export. The interleave tag (@asyncRoot callback) is unchanged and true.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/src/scope/scope.ts","detail":"ownerOf skips any unit whose parent chain contains a test, including a test unit nested inside another test. Consequently, writes from test → test → unit land in the outer test rather than the nearest test required by amended AD-5.8. Stop traversal at a test unit instead of skipping it because another test encloses it.","fixed":true,"note":"ownerOf now returns as soon as it reaches a unit of kind test, before asking whether a test encloses it (underTest). So test→test→unit and test→unit→test→unit writes stop at the inner test. lookUp reads the inner test first, so reads agree."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/frames.test.ts","detail":"XT-runtime-6 declares that writes land in the nearest enclosing test, but exercises only chains containing one test. Add nested test-unit cases checking slots, overlays and statics stay in the inner test and leave the outer test unchanged; add the corresponding macro routing case to XT-macroable-2.","fixed":true,"note":"XT-runtime-6 adds the 'test > test > unit' and 'test > unit > test > unit' shapes, checking slot, overlay and static writes in the inner test and outer values unchanged after it ends. XT-macroable-2 adds a test nested in a unit in a test: its macro is seen inside it, gone after it ends, and the outer test's macro is unchanged."}]}
```
