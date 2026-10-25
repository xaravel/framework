---
test_ids:
  - XT-macroable-2
trigger: divergence
proposed: >-
  Option 1 (recommended): follow AD-5 as written. Every kernel completes
  boot before it opens a unit frame, so a non-test unit frame is always
  after `sealed`, and a base-only write there throws. `macro`, `mixin` and
  `flushMacros` throw `ScopeFrameException` in every frame whose nearest
  unit is not a `test` frame (any kind other than `test`, not only
  `request`, `job` and `command`). Inside a test frame, and a unit or
  narrow frame nested in one, the write goes to the test frame's overlay,
  as now. The Story spec's Boundaries line "Any other unit frame, a `test`
  frame included, holds the write" narrows to test frames, XT-macroable-2
  asserts that a root `unit` frame throws, and docs/macroable.md says
  macros can be registered only inside a test frame until the `sealed`
  seam of ESC-11.1-2 lands. Nothing is weakened: the change only adds
  throws that AD-5 already requires. Option 2: keep the spec as written
  (a non-test unit frame other than request, job and command holds the
  write and discards it at its end), which needs a recorded divergence
  from AD-5, outside DIV-1..12, from the Maintainer.
evidence: >-
  The spine, AD-5 Lifecycle (ARCHITECTURE-SPINE.md:151-155): "Every kernel
  completes boot before it opens any unit frame", and "Writes after
  `sealed`: Base only: `bind`, `singleton`, …, routes, macros and
  `Blade.directive`. Inside a non-test frame they throw
  `ScopeFrameException`. Inside a test frame they go to its overlay."
  Story 11.1's spec (intent contract, Boundaries, Write routing) says
  instead: "Any other unit frame, a `test` frame included, holds the write
  in `frameStatic` and discards it when the unit ends", and throws only
  for `request`, `job` and `command` (DIV-11.2 names those three). The
  implementation follows the spec: guardWrite in
  packages/macroable/src/Support/Traits/Macroable.ts throws only for those
  kinds, and a review patch added an XT-macroable-2 case asserting that a
  root `unit` frame holds a macro. The Fidelity Review's reviewer 2
  rejected tree 33dedd74f35742a4562cab5ba352ff0e519e478a on F-7 for that
  conflict with AD-5.5; reviewer 1 passed it. The intent contract is
  read-only to the build loop, and AGENTS.md routes an AD conflict to an
  Escalation, so the Story stops on XT-macroable-2.
---

# ESC-11.1-5: base-only writes in a non-test unit frame other than request, job or command

AD-5 says a macro write after `sealed` throws in any non-test frame, and that no unit frame opens before boot completes. Story 11.1's spec lets a non-test unit frame of any kind other than `request`, `job` or `command` hold the write and discard it at its end. Option 1 follows AD-5: writes outside a test frame throw, with no divergence. Option 2 keeps the spec and needs a divergence the Maintainer must record. The implementation, reviewed and otherwise passing, is saved on `story/11.1-impl`; resuming under option 1 changes `guardWrite`, one XT-macroable-2 case and the docs' registration note.
