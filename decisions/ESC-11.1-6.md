---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "8ade7758d26f3fbda539c885cfae586d45b5dbe87605237d4a7605b1d0577a1b"
---

# ESC-11.1-6: approved, option 1 (only a `test` frame takes a macro write until the frame-chain read lands)

Option 1 is approved. It narrows ESC-11.1-5 to what Macroable can tell apart today.

## The rule

- **Until the frame-chain read lands, only a `test` frame takes the write.** `guardWrite` in `packages/macroable/src/Support/Traits/Macroable.ts` lets `macro`, `mixin` and `flushMacros` write through only when the innermost frame (`currentFrame()`) is a `test` frame. It throws `ScopeFrameException` in every other frame: a root or nested non-test `unit` frame, and a narrow frame, under a test frame too. With no active frame it throws, as ESC-11.1-2 rules.
- **XT-macroable-2 follows.** Its root `unit` frame case and its `unit`-nested-in-a-test-frame case both assert the throw. `docs/macroable.md` says macros can be registered only directly inside a test frame for now.
- **The follow-up settles the nested cases.** The Epic 11 retrospective item that ESC-11.1-3 routes (naming `packages/runtime` and `packages/macroable`) adds the frame-chain read. With it in hand, that item decides whether a `unit` or narrow frame nested in a test frame writes to the test frame's overlay, and resolves the disagreement between ESC-11.1-5's two bullets for a nested `unit` frame.
- **The Story resumes** from the implementation saved on `story/11.1-impl` (cd664b42), changing only `guardWrite`, the two XT-macroable-2 cases and the docs' registration note.

Option 2 (detect an enclosing test frame through a side channel, such as a probe `registerTestClass` call or an `interleave` unit) is not taken: it writes state on every macro call and depends on runtime internals. Option 3 (keep the saved implementation) is not taken: ESC-11.1-5 rejected it for AD-5.

## Rationale

- **It allows nothing AD-5 forbids.** AD-5 makes base-only writes after `sealed` throw inside a non-test frame. Option 1 throws in every frame that ESC-11.1-5 makes throw, and in some frames it would let through. It is the stricter reading, so it cannot break the rule.
- **It needs only what the runtime already exposes.** `currentFrame()` shows the innermost frame's kind (packages/runtime/src/scope/scope.ts:113-115), which is all option 1 reads. The read that tells a root `unit` from a nested one belongs to `@xaravel/runtime` (ESC-11.1-3), which Story 11.1 may not change.
- **It is outside the classes the orchestrator may not rule on.**
  - It removes no assertion, weakens no expected value, and adds no skip or `adapted:` marker. The XT-macroable-2 cases that change were added by this Story and never reached `main`; under this ruling they assert a stricter outcome, a throw. No Upstream Test ID changes: the ported SupportMacroableTest cases run directly in a test frame.
  - It adds no divergence.
  - It does not make Xaravel slower: the guard reads one frame kind, and stores nothing.

This ruling clears XT-macroable-2 of ESC-11.1-6. Story 11.1 resumes.
