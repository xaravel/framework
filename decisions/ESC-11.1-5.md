---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "e4d16ea65f937cdd08e8cb555eb072ef1a715ffa513d9928a8d6742c23929362"
---

# ESC-11.1-5: approved, option 1 (follow AD-5: a macro write outside a test frame throws)

The Maintainer gave this ruling on 2026-10-24 in the Maintainer's session, accepting option 1. AD-5 stands as written, and no divergence is added.

## The rule for Story 11.1

- `macro`, `mixin` and `flushMacros` throw `ScopeFrameException` in every frame whose nearest unit frame is not a `test` frame. That covers every unit kind other than `test`, not only `request`, `job` and `command`.
- Inside a `test` frame, and inside a unit or narrow frame nested in one, the write goes to the test frame's overlay, as it does today.
- The Story spec's Boundaries line "Any other unit frame, a `test` frame included, holds the write" narrows to test frames. `guardWrite` in `packages/macroable/src/Support/Traits/Macroable.ts` follows it.
- XT-macroable-2 asserts that a root `unit` frame throws.
- `docs/macroable.md` says macros can be registered only inside a test frame until the `sealed` seam of ESC-11.1-2 lands.

## Rationale

- **It is AD-5.** "Every kernel completes boot before it opens any unit frame", and a base-only write after `sealed` throws in a non-test frame (ARCHITECTURE-SPINE.md, AD-5 Lifecycle). The spec's wider rule was the outlier, and reviewer 2's F-7 reject was right.
- **Nothing is lost today.** No kernel runs an app outside tests yet. Registering macros at boot comes with the Application's sealed state (ESC-11.1-2, Story 17.4 or 51.1).
- **Nothing is weakened.** The change only adds throws that AD-5 already requires.

## The route

Story 11.1 resumes from `story/11.1-impl`, with the three changes above. It then re-runs its Fidelity Review on the changed tree.
