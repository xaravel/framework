---
test_ids:
  - XT-macroable-2
trigger: contract
proposed: >-
  Option 1 (recommended): until the frame-chain read of ESC-11.1-3 lands,
  `guardWrite` in packages/macroable/src/Support/Traits/Macroable.ts lets a
  macro write through only when the innermost frame is a `test` frame, and
  throws `ScopeFrameException` in every other frame: a root or nested
  non-test unit, and a narrow frame, under a test frame too. That is the
  stricter reading of ESC-11.1-5's rule, so nothing AD-5 forbids is
  allowed. XT-macroable-2's root `unit` case and its nested-unit case
  assert the throw. The Epic 11 retrospective item that ESC-11.1-3 routes
  (naming `packages/runtime` and `packages/macroable`) also lets a narrow
  frame under a test write to the test frame's overlay, and decides the
  nested `unit` case (below) with the chain read in hand. Option 2: detect
  an enclosing test frame now through a side channel, for example a probe
  `registerTestClass` call, whose "no test frame encloses it" throw is the
  predicate, or an `interleave` unit whose reads follow the test origin.
  Both write state on every macro call and depend on internals, so they are
  not recommended. Option 3: keep the saved implementation, which lets any
  frame other than `request`, `job` and `command` hold the write; ESC-11.1-5
  rejected that for AD-5.
evidence: >-
  decisions/ESC-11.1-5.md rules that a macro write throws "in every frame
  whose nearest unit frame is not a `test` frame", and that "in a `test`
  frame, and in a unit or narrow frame nested in one, the write goes to the
  test frame's overlay". It also rules that XT-macroable-2's root `unit`
  frame case asserts the throw. A root `unit` frame and a `unit` frame
  nested in a test frame both show `{kind: "unit"}` to `currentFrame()`
  (packages/runtime/src/scope/scope.ts:113-115), the only public read of
  the frame chain (`Frame` has only `kind` and `app`, scope.ts:43-48). So
  Macroable can't throw for the first while it lets the second through.
  The same holds for a narrow frame, whose kind is its own. The read that
  tells them apart is the one ESC-11.1-3 routes to `@xaravel/runtime` as a
  follow-up, which Story 11.1 may not make. The ruling's two bullets also
  disagree for a nested `unit` frame: its nearest unit frame is that unit,
  not the test frame, so the first bullet says it throws, and the second
  says it writes to the test frame's overlay. The runtime routes a
  `frameStatic` write from it to the test frame (`ownerOf`,
  scope.ts:409-422), which the saved implementation relies on.
---

# ESC-11.1-6: Macroable cannot tell a root non-test frame from a frame nested in a test frame

Under ESC-11.1-5, a macro write throws outside a test frame and goes to the test frame's overlay inside one, frames nested in it included. Telling a root `unit` frame from a `unit` or narrow frame nested in a test frame needs the frame-chain read that ESC-11.1-3 routes to `@xaravel/runtime` as a follow-up. `currentFrame()` shows only the innermost kind. The ruling's two bullets also disagree about a nested `unit` frame. Option 1 throws everywhere except directly in a `test` frame until that read lands, and the follow-up item settles the nested cases. The implementation saved on `story/11.1-impl` (cd664b42) needs only `guardWrite`, two XT-macroable-2 cases and the docs' registration note changed for option 1.
