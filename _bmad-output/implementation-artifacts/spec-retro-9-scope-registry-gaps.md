---
title: 'Epic 9 action item 3: Scope Frame and Registry gaps'
type: 'bugfix'
created: '2026-10-22'
baseline_revision: '52d7309321e3066d8def9d4df53fdc6bbdbbd1d5'
action_item: 'epic-9-retro-item-3-scope-registry-gaps'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-retro-2026-10-22.md'
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
  - '{project-root}/decisions/MAINT-2026-10-22-epic-9-item-3-split.md'
warnings: ['multiple-goals']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 9's retrospective found seven gaps in `packages/runtime` (findings L1–L5, L15, L16):
- **L1.** Classes a test registers, and the test's overlays and statics, are invisible inside `interleave` units opened from that test: each unit is a root frame, and every read stops at it.
- **L2.** `registerTestClass` writes the grader's class-name brand onto the shared class object, so concurrent test frames overwrite each other's brand, and the brand outlives the test.
- **L3.** `frameSlot` writes to an ended unit, where `frameStatic` and `frameOverlay` throw.
- **L4.** Base `registerClass` takes a key that a live test frame holds for another class.
- **L5.** The docblocks say `app = null` means "for no Application", but `currentApplication()` still falls back to the default Application.
- **L15.** `docs/traits-and-inject.md` does not say that a trait method using a JS `#private` member throws, or that a trait's constructor runs at `mixin()` time.
- **L16.** `new Exception("a", 2n ** 70n)` says `int given`. PHP has no such int: the literal is a float, and PHP says `float given`.

**Approach:**
- **L1.** An `interleave` unit opened under a `test` unit records that test unit as its origin. Overlay, static and test-class reads continue from a root unit to its origin. Slots and writes never do.
- **L2.** The test brand becomes an own accessor that resolves through the live test frames of the active chain.
- **L3.** `frameSlot.set` checks `ended`, as `writeOwner` does. `frameSlot.get` stores no `init()` value in an ended owner.
- **L4.** The Registry keeps the test-class maps of live test frames and checks them in `registerClass`.
- **L5.** Fix the docblocks and `docs/scope-frames.md`, keeping the code that spec-9-3 and AD-5.3 support.
- **L15.** Document both limits.
- **L16.** A `bigint` outside int64 is treated as the PHP float it stands for when a throwable constructor reads its arguments.

## Boundaries & Constraints

**Always:**
- Change only `packages/runtime/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT-2026-10-16, amendment 2026-10-22).
- Check every PHP message asserted here against local PHP 8.5.11 before writing it down.
- Keep XT-runtime-1..37's behaviour except where a gap is fixed. Specifically: an `interleave` unit inside a test frame still sees none of the test's slots, and its writes stay in the unit (XT-runtime-6). Sibling test frames still do not see each other's classes, and a later test may register the same class under another FQCN (XT-runtime-14). A subclass still shows its parent's brand.
- The brand reads `null`, never `undefined` (AD-9), where no live frame holds the class. Readers already fall back to the JS name when the value is not a string.
- Add one new Xaravel Test, `XT-runtime-39`, in a new `packages/runtime/tests/xaravel/gaps.test.ts`, with one row per finding, each failing on the baseline. XT-runtime-38 is skipped because item 4's saved branch already uses it.
- The `registry/` module still imports nothing from `scope/`.

**Never:**
- Change `conformance/expectations/**`, another package, or a Protected Path.
- Add an Oracle request (S2 is Story 9.13).
- Edit the item's `action`, `owner` or `epic`.
- Remove or weaken an assertion. The one expected value that changes is XT-runtime-36's out-of-range `$code` message, from `int, int given` to PHP's `int, float given`, which is the L16 fix itself.
- Let an `interleave` unit write into its origin test frame: `registerTestClass` there still throws, and overlay and static writes stay in the unit.
- Change `phpTypeName`. Its other callers (`phpUnserialize`) are outside the action.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| L1 test class in interleave | test registers `Tests\Fx`, then `interleave` units call `fqcn(Fx)`, `resolveClass("tests\\fx")` | `Tests\Fx` / `Fx` in every unit | — |
| L1 overlay and static in interleave | test sets `frameOverlay(a).set(k, 1)` and `frameStatic(M, s).set("t")`; a unit reads, then writes `2` / `"u"` | unit reads `1`, `"t"`, then its own `2`, `"u"`; test still reads `1`, `"t"` | — |
| L1 not from a non-test unit | `interleave` from a plain root unit that set an overlay | unit reads `null` | — |
| L1 registration from a unit | `registerTestClass` inside an `interleave` unit of a test | — | `ScopeFrameException` "… no test frame encloses it" (unchanged) |
| L2 concurrent brands | two concurrent test frames register `Fy` as `Tests\A\Fy` and `Tests\B\Fy` | each reads its own name as `Fy[brand]` after the other registered; after both end, `null` | — |
| L3 ended slot write | `bindToFrame(() => slot.set(1))` called after its unit ended | — | `ScopeFrameException` `Cannot write the frame slot <key> to the unit frame after it has ended` |
| L3 ended slot read | `bindToFrame(() => slot.get())` after the unit ended, with no stored value | `init()` each time, never stored | — |
| L4 base vs live test | a live test holds `Tests\Held` for `A`; `registerClass("tests\\held", B)` from any frame, a sibling's included | — | `TypeError` `registerClass(): tests\held is already registered to another class in a running test` |
| L4 after the test ends | the same call after the test unit ended | registers | — |
| L16 int parameter | `new Exception("a", 2n ** 70n)`, `-(2n ** 64n)`; `new ErrorException("m", 0, 1, null, 2n ** 70n)` | — | PHP `TypeError` `… Argument #2 ($code) must be of type int, float given`; `… Argument #5 ($line) must be of type ?int, float given` |
| L16 string parameter | `new Exception(2n ** 70n)` | message `1.1805916207174E+21` | — |

</intent-contract>

## Code Map

- `packages/runtime/src/scope/scope.ts`
  - `Store` (`:75-89`): add `origin`.
  - `runUnit` (`:382`) builds the store.
  - `lookUp` (`:312-320`) is the overlay and static read walk: follow `parent ?? origin`.
  - `frameSlot` (`:248-280`): L3.
  - `writeOwner` (`:334-347`) gives the ended message idiom.
  - `installTestFrameAccess` (`:450-478`): `read` follows `parent ?? origin`. `write` also returns the unit's liveness for L4.
  - Docblocks `:113`, `:125` and the header: L5.
  - Add an internal `runInInterleaveUnit(fn, app)` for `interleave`. It is not re-exported from `scope/index.ts`.
- `packages/runtime/src/scope/interleave.ts:28-31` -- use `runInInterleaveUnit`. Its origin is the nearest `test` unit up the opener's chain, following origins.
- `packages/runtime/src/registry/registry.ts`
  - `registerClass` (`:58-81`): the L4 check against the live test maps, pruning ended ones. Defining the base brand still replaces a test accessor.
  - `TestFrameAccess` (`:186-189`): `write` returns `{ entries, ended() }`.
  - `registerTestClass` (`:279`): install the brand accessor once per class (L2), and record the maps as live.
  - The header comment describes the brand and the live-map rule.
- `packages/runtime/src/php/throwableArguments.ts`
  - `typeOf` (`:40-46`) and `toIntArgument` / `toStringArgument`: an out-of-int64 `bigint` is a `float`.
  - `argumentError` (`:36`) names such a value `float`.
  - Update the header bullet.
- `packages/runtime/tests/xaravel/exceptions.test.ts:339-341` -- XT-runtime-36's overflow row, which becomes `float given`.
- `packages/runtime/docs/scope-frames.md`, `class-registry.md`, `traits-and-inject.md` ("Not supported", `:158-164`), `exceptions.md` -- describe the new rules. `src/traits/mixin.ts:213` (`instanceDefaults`) is where the trait constructor runs.
- Test style: follow `tests/xaravel/registry.test.ts` and `overlays.test.ts` (`xaravelTest`, `Assert`, `thrownBy`, `ticks`).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/scope/scope.ts`, `packages/runtime/src/scope/interleave.ts` -- origin link and its read walks, the `frameSlot` ended check, and the L5 docblocks -- L1, L3, L5.
- `packages/runtime/src/registry/registry.ts` -- the brand accessor and the live test maps -- L2, L4.
- `packages/runtime/src/php/throwableArguments.ts` and XT-runtime-36's row -- L16.
- `packages/runtime/docs/*.md` -- L1–L5, L15, L16 described.
- `packages/runtime/tests/xaravel/gaps.test.ts` -- XT-runtime-39 with every matrix row, plus doc rows: `traits-and-inject.md` names `#private` and the `mixin()`-time constructor, and `scope-frames.md` says a `null` app falls back to the default. Also behaviour rows pinning both trait limits.

**Acceptance Criteria:**
- Given the baseline, when XT-runtime-39 runs, then it fails. After the change it passes, and XT-runtime-1..37 still pass.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then the harness reports no difference and both others exit 0.
- Given the reviewed head tree, when `bun run fidelity:review status --item epic-9-retro-item-3-scope-registry-gaps --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 31 findings — high 0, medium 3, low 15, false 7, maybe-false 0 (6 intent-alignment observations counted as findings)
- findings:
  - `[low]` `[patch]` (blind) L3 docs say an ended unit's `get()` "returns `init()` each time", but a slot stored before the end is still read — doc reworded; an L3 row pins the stored read.
  - `[medium]` `[patch]` (blind) L1 slot isolation inside `interleave` units is untested (same defect as fidelity F-7) — L1 row added for slot reads and writes.
  - `[medium]` `[patch]` (blind) `registerClass("Other\\Fx", Fx)` succeeds while a running test holds `Fx` under another FQCN. The brand then disagrees with `fqcn(Fx)` in that test — `registerClass` now also refuses a class a live test map holds under another name, with a test row and docs.
  - `[low]` `[reject]` (blind) `liveTests` keeps ended tests' maps and Stores until the next `registerClass` or `registerTestClass` — every `registerTestClass` prunes, so only tests ended since the last registration stay referenced. Freeing them sooner needs an end hook or WeakRefs, which adds complexity for a bounded cost.
  - `[low]` `[patch]` (blind) untested doc claims: a later `registerClass` replacing the accessor, nested `interleave`, and statics and classes from a non-test unit — rows added.
  - `[false]` `[reject]` (blind) base `registerClass` before a test, for the same key, is untested — `registry.test.ts:162` pins `registerTestClass` refusing a base-held key.
  - `[low]` `[patch]` (blind) the running-test rule does not say that a sibling's `registerTestClass` may still take the name — one sentence added to `class-registry.md`.
  - `[false]` `[reject]` (blind) exception `name` changes with the frame — `initThrowable` (`throwableArguments.ts`) reads the brand once at construction and defines `name` as an own value.
  - `[low]` `[patch]` (blind) `assertNull(brandOf(HeldB) ?? null)` hides absent versus null — the row now asserts no own brand property.
  - `[low]` `[reject]` (blind) doc-text rows are wording-fragile — L5 and L15 are docs-only fixes, so a doc check is the only case that fails on the baseline. Item 4 took the same approach.
  - `[false]` `[reject]` (blind) `const unit = test` is a pointless alias — `test` is a reassigned `let`, so TypeScript does not keep its narrowing inside the `ended` closure.
  - `[low]` `[reject]` (blind) the double cast on `late.read` — cosmetic.
  - `[low]` `[reject]` (blind) the L4 message prints the caller's casing — it matches the existing `registerClass` messages, which print the name passed.
  - `[low]` `[reject]` (edge) `registerTestClass` inside an `interleave` unit for a key the origin test holds is a no-op (same class) or the "in this test" `TypeError`, not `ScopeFrameException` — no write reaches the test either way. Reordering the checks would change error precedence in other frames, so it is not worth it for an unlikely call.
  - `[medium]` `[patch]` (edge) the class held under another name — same root cause as the blind finding above; patched there.
  - `[low]` `[reject]` (edge) `liveTests` lazy pruning — same as the blind row above.
  - `[low]` `[patch]` (edge) a stale slot read after the end — same as the blind L3 row; the doc is fixed and the read pinned. Clearing slots at end is outside the action, which names writes.
  - `[false]` `[reject]` (edge) `readUp` walks into an ended origin — `end()` clears the origin's overlays and statics, so the walk finds nothing there. Not a defect.
  - `[low]` `[patch]` (verification-gap) int64 edges of `phpValueOf` are unpinned — rows for `PHP_INT_MAX`, `PHP_INT_MIN`, `2^63` and `-2^63-1` added.
  - `[low]` `[patch]` (verification-gap) a later `registerClass` replacing the test brand is untested — patched with the blind row.
  - `[low]` `[patch]` (verification-gap) nested `interleave` is untested — patched with the blind row.
  - `[low]` `[reject]` (verification-gap, other) `liveTests` retention — as above.
  - `[false]` `[reject]` (verification-gap, other) the `?Throwable` "given" name for an out-of-int64 bigint is now `float` — that is PHP's name for such a literal, and the change is correct.
  - `[low]` `[reject]` (intent) one XT case rather than one per finding, so later rows never run on the baseline — the implementer probed each finding separately on the baseline worktree (Auto Run Result), and the spec asked for one XT with one row per finding.
  - `[false]` `[reject]` (intent) L5 and L15 fail on the baseline only on text — the retro marks both as code-or-docblock or docs-only fixes.
  - `[low]` `[reject]` (intent) the `portedTest` grader frame is not exercised — it opens the same `test` unit through `Symbol.for('xaravel.scope.run')`, which is `runInFrame` itself.
  - `[low]` `[reject]` (intent) the L2 display path in `@xaravel/assert` is not exercised — assert reads the same own brand property this row reads, and testing another package's output is outside the item's scope.
  - `[false]` `[reject]` (intent) L3 goes beyond writes to reads — the retro's L3 names reads and writes, and only `init()` storing changed.
  - `[low]` `[reject]` (intent) L4 refuses process-wide — the action says "a live test frame holds", without limiting it to the holding test's chain.
  - `[false]` `[reject]` (intent) L16 goes beyond the message — treating the value as PHP's float is what makes the message PHP's, and the string path follows from the same rule (checked against PHP 8.5.11).
  - `[medium]` `[patch]` (fidelity-review, reviewer 1 F-7 at tree a329fac) XT-runtime-39 exercises no `frameSlot` reads or writes in `interleave` units — patched with the slot-isolation row; the reviewed tree changes, so the layer runs again.
- patch note: the L16 edge row for `-(2n ** 63n) - 1n` asserts `getCode()` `-9223372036854775808n`, not "float given". Local PHP 8.5.11 reads `-9223372036854775809` as the float -2^63, which the int parameter accepts (`int(-9223372036854775808)`), and Xaravel matches.

### 2026-10-22 — Review pass (Fidelity Review re-run, Finalize re-check, tree b858836)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Reviewer 1 (codex/gpt-6.1-sol) and reviewer 2 (claude/claude-opus-5-5) both pass at tree b858836132effce8d7a8fb20fb9bb8cffc70b49e, and `fidelity:review status --item` prints `current`.

## Design Notes

**Origin, not parent.** AD-5 says `interleave`'s units are root frames that see no enclosing frame's slots (XT-runtime-6 pins it). The action asks only that the test's registrations, overlays and statics stay visible, as a concurrency test needs its fakes. So the link is read-only and limited to those three reads. Writes keep landing in the unit, which keeps sibling units isolated (AD-5, NFR-4).

**Brand accessor.**

```ts
get: () => liveTestName(klass) // nearest test map up the chain holding klass, else null
```

The getter closes over `klass`, not `this`, so a subclass shows its parent's name. It is `configurable: true`, so a later base `registerClass` replaces it with the non-configurable value.

## Verification

**Commands:**
- `bun test packages/runtime` -- expected: all pass
- `bun run harness` -- expected: no differences, SUMMARY ok
- `bun run typecheck` and `bun run lint` -- expected: exit 0

## Fidelity Review

### Reviewer 1: reject at tree a329fac474ad6e0b0e2aaeec6475a17fee23b5b3

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `52d7309321e3066d8def9d4df53fdc6bbdbbd1d5`, on 2026-10-23T04:00:58.215Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The changed exception expectation remains an exact class and message check. Changing 'int given' to 'float given' matches the supplied PHP 8.5.11 evidence; no comparison is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no output.error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared XT-runtime-36 and XT-runtime-39 with their declared consequences. XT-runtime-39 checks overlay and static write isolation, but does not verify slot write isolation included in its unqualified L1 claim. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed code, tests and documentation are within runtime, whose supplied AD-19 ownership includes scopes, Registry, PHP coercions and traits. No other Component implementation is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | Registry.resolveClassAsync performs its approved module-loading root; interleave awaits supplied async callbacks. The new runInInterleaveUnit returns its callback's generic T and qualifies as an untagged dual runner under ESC-9.3-1. Other supplied declarations introduce no missing async-root tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/gaps.test.ts`: XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"a329fac474ad6e0b0e2aaeec6475a17fee23b5b3","base":"52d7309321e3066d8def9d4df53fdc6bbdbbd1d5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T04:00:58.215Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The changed exception expectation remains an exact class and message check. Changing 'int given' to 'float given' matches the supplied PHP 8.5.11 evidence; no comparison is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no output.error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared XT-runtime-36 and XT-runtime-39 with their declared consequences. XT-runtime-39 checks overlay and static write isolation, but does not verify slot write isolation included in its unqualified L1 claim.","findings":[{"path":"packages/runtime/tests/xaravel/gaps.test.ts","detail":"XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values."}]},{"id":"F-8","result":"pass","note":"All changed code, tests and documentation are within runtime, whose supplied AD-19 ownership includes scopes, Registry, PHP coercions and traits. No other Component implementation is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"Registry.resolveClassAsync performs its approved module-loading root; interleave awaits supplied async callbacks. The new runInInterleaveUnit returns its callback's generic T and qualifies as an untagged dual runner under ESC-9.3-1. Other supplied declarations introduce no missing async-root tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree a329fac474ad6e0b0e2aaeec6475a17fee23b5b3

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `52d7309321e3066d8def9d4df53fdc6bbdbbd1d5`, on 2026-10-23T04:00:58.215Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no file under tests/ported. The only tests it touches are the Xaravel Tests XT-runtime-36 and XT-runtime-39, which have no Upstream source. |
| F-2: No expected value is weakened | pass | No Ported Test is touched. One expected value changes, in the Xaravel Test XT-runtime-36: for new php.Exception('m', 2n ** 64n) the message goes from 'int given' to 'float given'. It is still an exact assertSame. The new value is PHP's: a 2^64 integer literal is a float, and an out-of-range float rejected by a coercive int parameter gives 'must be of type int, float given'. So the value moves to PHP's behaviour, not to looser or Xaravel-made output. Nothing else is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. XT-runtime-36 keeps every assertion and changes only one expected message. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip; the change touches no conformance/expectations file. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or cites a DIV clause, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the item relies on no error fixture, and it adds or changes no fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-39 is checked against each part of its consequence string. L1: interleave units read the test's class (fqcn, resolveClass), its overlay and its static; the sibling unit and the test still see the original values after a unit writes; registerTestClass from a unit throws ScopeFrameException; a unit opened under a non-test unit reads none of its overlays. L2: two concurrent test frames each read their own brand, a subclass inherits it, and it is null after both end. L3: frameSlot.set on an ended unit throws the documented message, and each get returns a fresh, unstored init(). L4: registerClass is refused from inside the test, from a sibling test and from a plain unit, and succeeds once the test has ended. L5: currentApplication() falls back to the default for a null app in both runners, and the docs and docblock are checked. L15: both doc entries are checked, a #private trait method throws a TypeError, and the trait constructor runs only at mixin() time. L16: three float-given messages and the message 1.1805916207174E+21 are checked. Each cited AD covers what its part tests: AD-5.3 the default Application, AD-5.5 and AD-5.8 overlay/static writes staying in the unit, AD-10.5 duplicate refusal, AD-9 the int/float model, AD-19 the runtime owning interleave, mixin and the exceptions. XT-runtime-36's changed row stays within its unchanged consequence, which covers the TypeErrors for rejected arguments. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are in packages/runtime (src/php, src/registry, src/scope, docs, tests/xaravel). That is the action item's single listed component, runtime. No stub, fake or hard-coded behaviour of another component is added; the test fixtures are local classes and Application stand-ins, which the runtime accepts as any object. |
| F-9: Every `@asyncRoot` tag is true | pass | Checked against AD-6, DIV-1, ESC-6.4-1, ESC-9.3-1 and ESC-9.4-1. The kept '@​asyncRoot callback' on interleave is true: it awaits callbacks the caller supplies, which may be async, and reaches no Driver IO. The kept '@​asyncRoot Registry.resolveClassAsync' is true by ESC-9.4-1. The new export runInInterleaveUnit returns its body's own generic T and never a declared Promise, so it is a dual-shape frame runner like runInRootFrame: it is not async and correctly takes no tag. The other changed functions (registerClass, registerTestClass, frameSlot, the throwable argument helpers) are sync and untagged. The scope.ts lines listed under @​asyncRoot are comments saying the runners carry no tag, not tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a329fac474ad6e0b0e2aaeec6475a17fee23b5b3","base":"52d7309321e3066d8def9d4df53fdc6bbdbbd1d5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T04:00:58.215Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no file under tests/ported. The only tests it touches are the Xaravel Tests XT-runtime-36 and XT-runtime-39, which have no Upstream source.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. One expected value changes, in the Xaravel Test XT-runtime-36: for new php.Exception('m', 2n ** 64n) the message goes from 'int given' to 'float given'. It is still an exact assertSame. The new value is PHP's: a 2^64 integer literal is a float, and an out-of-range float rejected by a coercive int parameter gives 'must be of type int, float given'. So the value moves to PHP's behaviour, not to looser or Xaravel-made output. Nothing else is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare. XT-runtime-36 keeps every assertion and changes only one expected message.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip; the change touches no conformance/expectations file.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or cites a DIV clause, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the item relies on no error fixture, and it adds or changes no fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-39 is checked against each part of its consequence string. L1: interleave units read the test's class (fqcn, resolveClass), its overlay and its static; the sibling unit and the test still see the original values after a unit writes; registerTestClass from a unit throws ScopeFrameException; a unit opened under a non-test unit reads none of its overlays. L2: two concurrent test frames each read their own brand, a subclass inherits it, and it is null after both end. L3: frameSlot.set on an ended unit throws the documented message, and each get returns a fresh, unstored init(). L4: registerClass is refused from inside the test, from a sibling test and from a plain unit, and succeeds once the test has ended. L5: currentApplication() falls back to the default for a null app in both runners, and the docs and docblock are checked. L15: both doc entries are checked, a #private trait method throws a TypeError, and the trait constructor runs only at mixin() time. L16: three float-given messages and the message 1.1805916207174E+21 are checked. Each cited AD covers what its part tests: AD-5.3 the default Application, AD-5.5 and AD-5.8 overlay/static writes staying in the unit, AD-10.5 duplicate refusal, AD-9 the int/float model, AD-19 the runtime owning interleave, mixin and the exceptions. XT-runtime-36's changed row stays within its unchanged consequence, which covers the TypeErrors for rejected arguments.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are in packages/runtime (src/php, src/registry, src/scope, docs, tests/xaravel). That is the action item's single listed component, runtime. No stub, fake or hard-coded behaviour of another component is added; the test fixtures are local classes and Application stand-ins, which the runtime accepts as any object.","findings":[]},{"id":"F-9","result":"pass","note":"Checked against AD-6, DIV-1, ESC-6.4-1, ESC-9.3-1 and ESC-9.4-1. The kept '@asyncRoot callback' on interleave is true: it awaits callbacks the caller supplies, which may be async, and reaches no Driver IO. The kept '@asyncRoot Registry.resolveClassAsync' is true by ESC-9.4-1. The new export runInInterleaveUnit returns its body's own generic T and never a declared Promise, so it is a dual-shape frame runner like runInRootFrame: it is not async and correctly takes no tag. The other changed functions (registerClass, registerTestClass, frameSlot, the throwable argument helpers) are sync and untagged. The scope.ts lines listed under @asyncRoot are comments saying the runners carry no tag, not tags.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree b858836132effce8d7a8fb20fb9bb8cffc70b49e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `52d7309321e3066d8def9d4df53fdc6bbdbbd1d5`, on 2026-10-23T04:05:55.713Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The changed bigint error expectation retains an exact class and message comparison, correcting 'int given' to the supplied PHP behavior, 'float given'. No comparison is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-upon output.error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-36 and XT-runtime-39 with their consequence strings and cited rules. Their assertions cover the declared exception, registry, frame, documentation and trait behavior. XT-runtime-39 now verifies slot isolation between both units and their originating test. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to runtime, the action item's listed component. No implementation substitutes for another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared all supplied source declarations and tags with AD-6, DIV-1 and the rulings. interleave awaits supplied async callbacks; resolveClassAsync performs the approved module-loading root. The frame runners, including runInInterleaveUnit, return their callbacks' generic T and correctly remain untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/gaps.test.ts`: XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values. **fixed**: XT-runtime-39 sets the originating test's slot to 'test', checks both units initially read 'init', writes distinct 'a' and 'b' values, verifies each unit retains its value, and verifies the test still reads 'test'.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"b858836132effce8d7a8fb20fb9bb8cffc70b49e","base":"52d7309321e3066d8def9d4df53fdc6bbdbbd1d5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T04:05:55.713Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The changed bigint error expectation retains an exact class and message comparison, correcting 'int given' to the supplied PHP behavior, 'float given'. No comparison is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-upon output.error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-36 and XT-runtime-39 with their consequence strings and cited rules. Their assertions cover the declared exception, registry, frame, documentation and trait behavior. XT-runtime-39 now verifies slot isolation between both units and their originating test.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to runtime, the action item's listed component. No implementation substitutes for another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared all supplied source declarations and tags with AD-6, DIV-1 and the rulings. interleave awaits supplied async callbacks; resolveClassAsync performs the approved module-loading root. The frame runners, including runInInterleaveUnit, return their callbacks' generic T and correctly remain untagged.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/gaps.test.ts","detail":"XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values.","fixed":true,"note":"XT-runtime-39 sets the originating test's slot to 'test', checks both units initially read 'init', writes distinct 'a' and 'b' values, verifies each unit retains its value, and verifies the test still reads 'test'."}]}
```

### Reviewer 2: pass at tree b858836132effce8d7a8fb20fb9bb8cffc70b49e

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `52d7309321e3066d8def9d4df53fdc6bbdbbd1d5`, on 2026-10-23T04:05:55.713Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and no Ported Test is added or changed. There are no Upstream assertions to compare against. |
| F-2: No expected value is weakened | pass | There are no Ported Tests. The only changed expected value is in XT-runtime-36. It moves from '…int, int given' to '…int, float given' for 2n**64n. This follows PHP, which reads an integer literal outside int64 as a float, as the L16 finding asks. The comparison is still an exact assertSame on the full message, so nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests and no adapted markers. The one changed line in XT-runtime-36 still asserts the same subject, so no assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations line, so there is no Skip Reason to check. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item has no assigned Oracle requests. The change adds or modifies no error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared the XT-runtime-39 consequence string with its body. L1: interleave units read the test's class (fqcn and resolveClass), overlay and static, and a nested interleave does too. Overlay and static writes stay in each unit. Slots read init(), and each unit keeps its own write. registerTestClass inside a unit throws. Units opened from a non-test frame see nothing. L2: two concurrent test frames each read their own brand, a subclass shows its parent's name, and the brand is null after the tests end. L3: a set on an ended unit throws with the exact message, a get stores no init(), and a value stored before the end is still read. L4: registerClass is refused from the same test, a sibling test and a frame outside any test, and a class held under another name is refused too. The name is free once the test ends, and a later registerClass fixes the brand. L5: the null app falls back to the default, and the docs say so. L15: the doc text is checked and both behaviours are pinned. L16: the float messages and the int64 edges are checked. The cited AD-5.3, AD-5.5, AD-5.8, AD-9, AD-10.5 and AD-19 each match a part the body tests. XT-runtime-36's consequence is unchanged and its body still checks it. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime (registry, scope, interleave, throwableArguments) and its docs and tests, which is the item's runtime scope. Nothing stubs or fakes another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | interleave keeps '@​asyncRoot callback', which is true under AD-6's callback clause because it accepts async unit callbacks and awaits them. resolveClassAsync keeps its ESC-9.4-1 root tag. The new export runInInterleaveUnit returns its body's own T and declares no Promise, so it is a generic frame runner under ESC-9.3-1 and correctly carries no tag. The other new helpers are sync: liveTestMaps, installTestBrand, phpValueOf, readUp and nearestTest. TestFrameAccess.write's new return shape is sync. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/gaps.test.ts`: XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values. **fixed**: XT-runtime-39's L1 block now sets a test-frame slot to 'test'. Two interleave units each read init() at first, so they cannot see the test's value. They write 'a' and 'b' on interleaved turns, and each keeps its own value ('init,a' and 'init,b'). The test frame still reads 'test' afterwards.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"b858836132effce8d7a8fb20fb9bb8cffc70b49e","base":"52d7309321e3066d8def9d4df53fdc6bbdbbd1d5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T04:05:55.713Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and no Ported Test is added or changed. There are no Upstream assertions to compare against.","findings":[]},{"id":"F-2","result":"pass","note":"There are no Ported Tests. The only changed expected value is in XT-runtime-36. It moves from '…int, int given' to '…int, float given' for 2n**64n. This follows PHP, which reads an integer literal outside int64 as a float, as the L16 finding asks. The comparison is still an exact assertSame on the full message, so nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests and no adapted markers. The one changed line in XT-runtime-36 still asserts the same subject, so no assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations line, so there is no Skip Reason to check.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The item has no assigned Oracle requests. The change adds or modifies no error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"I compared the XT-runtime-39 consequence string with its body. L1: interleave units read the test's class (fqcn and resolveClass), overlay and static, and a nested interleave does too. Overlay and static writes stay in each unit. Slots read init(), and each unit keeps its own write. registerTestClass inside a unit throws. Units opened from a non-test frame see nothing. L2: two concurrent test frames each read their own brand, a subclass shows its parent's name, and the brand is null after the tests end. L3: a set on an ended unit throws with the exact message, a get stores no init(), and a value stored before the end is still read. L4: registerClass is refused from the same test, a sibling test and a frame outside any test, and a class held under another name is refused too. The name is free once the test ends, and a later registerClass fixes the brand. L5: the null app falls back to the default, and the docs say so. L15: the doc text is checked and both behaviours are pinned. L16: the float messages and the int64 edges are checked. The cited AD-5.3, AD-5.5, AD-5.8, AD-9, AD-10.5 and AD-19 each match a part the body tests. XT-runtime-36's consequence is unchanged and its body still checks it.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime (registry, scope, interleave, throwableArguments) and its docs and tests, which is the item's runtime scope. Nothing stubs or fakes another Component.","findings":[]},{"id":"F-9","result":"pass","note":"interleave keeps '@asyncRoot callback', which is true under AD-6's callback clause because it accepts async unit callbacks and awaits them. resolveClassAsync keeps its ESC-9.4-1 root tag. The new export runInInterleaveUnit returns its body's own T and declares no Promise, so it is a generic frame runner under ESC-9.3-1 and correctly carries no tag. The other new helpers are sync: liveTestMaps, installTestBrand, phpValueOf, readUp and nearestTest. TestFrameAccess.write's new return shape is sync.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/gaps.test.ts","detail":"XT-runtime-39 declares that interleave units never write into the originating test frame, but exercises no frameSlot reads or writes inside those units. Add a test-frame slot value, assert units cannot read it, write distinct unit values, and assert sibling units and the originating test retain their own values.","fixed":true,"note":"XT-runtime-39's L1 block now sets a test-frame slot to 'test'. Two interleave units each read init() at first, so they cannot see the test's value. They write 'a' and 'b' on interleaved turns, and each keeps its own value ('init,a' and 'init,b'). The test frame still reads 'test' afterwards."}]}
```

## Auto Run Result

Status: done

**Summary.** Fixes Epic 9 retro findings L1–L5, L15 and L16 in `packages/runtime`:
- **L1.** An `interleave` unit opened under a `test` unit records that test unit as a read-only origin. Overlay, static and test-class reads follow it. Slots and writes do not.
- **L2.** The test-class brand is a per-frame accessor that reads `null` after the test.
- **L3.** `frameSlot` writes to an ended unit throw, and reads there store no `init()` value.
- **L4.** Base `registerClass` refuses a name, or a class, that a running test holds.
- **L5.** The `app = null` docblocks and docs now match the fallback code.
- **L15.** The trait `#private` and `mixin()`-time constructor limits are documented and pinned.
- **L16.** A `bigint` outside int64 is read as PHP's float in throwable constructors.

**Files changed:**
- `packages/runtime/src/scope/scope.ts` -- `origin`, `readUp`, `nearestTest`, the internal `runInInterleaveUnit`, the `frameSlot` ended checks, the L5 docblocks, and the test-frame `write` liveness.
- `packages/runtime/src/scope/interleave.ts` -- opens units through `runInInterleaveUnit`.
- `packages/runtime/src/registry/registry.ts` -- the brand accessor (`installTestBrand`), the live test maps (`liveTests`), and the `registerClass` refusals.
- `packages/runtime/src/php/throwableArguments.ts` -- `phpValueOf`: an out-of-int64 `bigint` is PHP's float.
- `packages/runtime/tests/xaravel/gaps.test.ts` -- new XT-runtime-39, one or more rows per finding.
- `packages/runtime/tests/xaravel/exceptions.test.ts` -- XT-runtime-36's overflow message becomes PHP's `int, float given` (the L16 fix).
- `packages/runtime/docs/{scope-frames,class-registry,traits-and-inject,exceptions}.md` -- describe the new rules.

**Review.** Pass 1 had 31 findings:
- 10 patched: 3 medium, 7 low.
- 15 rejected with reasons in the triage log: 8 low, 7 false.
- 6 more were duplicates of patched or rejected rows and share their routes.
- Nothing deferred.

Pass 2 was the Fidelity Review re-run: both reviewers pass at tree b858836, with no findings. **Follow-up review:** `false`. No high was patched, but three mediums were. They are F-7 slot isolation, the L4 class-under-another-name refusal, and its edge duplicate; the blind and edge rows are one root cause, so this counts as two distinct medium entries. The Fidelity Review re-ran on the patched tree, and both reviewers pass, so no specific risk is left unverified.

**Verification:**
- `bun test packages/runtime`: 38 pass.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. The 7 NOT-RUN Variants are backends not installed locally (mariadb, mysql, pgsql, two queue variants, redis, sqlsrv).
- `fidelity:review status --item epic-9-retro-item-3-scope-registry-gaps`: `current`.
- Every PHP message was checked against local PHP 8.5.11.
- On a baseline worktree (52d7309), XT-runtime-39 fails, and separate probes showed each finding broken there.

**Residual risks:**
- An `interleave` unit reads the test's actual overlay and static objects, so mutating a mutable value (`list.get().push`) changes the test's value. Plain `set` stays in the unit.
- `liveTests` drops ended tests only on the next `registerClass` or `registerTestClass`.
- `registerTestClass` inside an `interleave` unit, for a key its origin test already holds, is a no-op or the "in this test" `TypeError` rather than `ScopeFrameException`.
- XT-runtime-38 is left free for item 4's saved branch.
