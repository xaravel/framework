---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "e4d16ea65f937cdd08e8cb555eb072ef1a715ffa513d9928a8d6742c23929362"
---

# ESC-11.1-5: approved, option 1 (base-only writes throw in every frame whose nearest unit is not a test frame)

Option 1 is approved. Macroable follows AD-5 as written.

## The rule

- **Outside a test frame, a macro write throws.** `macro`, `mixin` and `flushMacros` throw `ScopeFrameException` in every frame whose nearest unit frame is not a `test` frame: any kind other than `test`, not only `request`, `job` and `command`.
- **Inside a test frame, it goes to the overlay.** In a `test` frame, and in a unit or narrow frame nested in one, the write goes to the test frame's overlay, as the implementation on `story/11.1-impl` already does.
- **With no active frame, it throws**, as ESC-11.1-2 rules until the `sealed` seam lands.
- **The Story follows.** The Story spec's Boundaries and Write routing lines narrow "any other unit frame, a `test` frame included, holds the write" to test frames. XT-macroable-2's root `unit` frame case asserts the throw. `docs/macroable.md` says macros can be registered only inside a test frame until the `sealed` seam of ESC-11.1-2 lands. `guardWrite` in `packages/macroable/src/Support/Traits/Macroable.ts` changes to match.

Option 2 (keep the spec, so a non-test unit frame holds the write and discards it at its end) is not taken. It needs a divergence from AD-5 outside DIV-1..12, which only the Maintainer may record.

## Rationale

- **It is AD-5.** The spine's Lifecycle rule (ARCHITECTURE-SPINE.md, AD-5): "Every kernel completes boot before it opens any unit frame", and base-only writes after `sealed`, macros among them, "Inside a non-test frame … throw `ScopeFrameException`. Inside a test frame they go to its overlay." A non-test unit frame is always after `sealed`, so the write throws there.
- **The spec, not the spine, was wrong.** The spec read DIV-11.2's list of `request`, `job` and `command` as the full set of throwing frames. AD-5 names every non-test frame. The Fidelity Review's F-7 reject of tree `33dedd74f35742a4562cab5ba352ff0e519e478a` found that conflict.
- **It is outside the classes the orchestrator may not rule on.**
  - It removes no assertion, weakens no expected value, and adds no skip or `adapted:` marker. The XT-macroable-2 case that changes was added by this Story's own review patch and never reached `main`; under this ruling it asserts a stricter outcome, a throw.
  - It adds no divergence: it removes the need for one.
  - It does not make Xaravel slower, and it keeps Laravel's behaviour where Laravel defines one. Laravel has no frames; AD-5 is the decided mapping.

This ruling clears XT-macroable-2 of ESC-11.1-5. Story 11.1 resumes from the implementation saved on `story/11.1-impl`.
