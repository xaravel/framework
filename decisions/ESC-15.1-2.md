---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-29
escalation_sha256: "f7ef80713f7f95e6202ff461a69aff49cace9196df9049b5e3a26d8aaa7a8c32"
---

# ESC-15.1-2: approved, option 1 (Repository writes go to the frame overlay; the pre-sealed base write lands with the `sealed` state)

Option 1 is approved. It is the route `decisions/ESC-11.1-2.md` set for Macroable, applied to the config Repository.

## The rule

- **Until the `sealed` state exists.** Every `Repository` write (`set`, `push`, `prepend`, `offsetSet`, `offsetUnset`) goes to `frameOverlay(repository)` over the base items the constructor received. A write inside a unit frame, or the nearest test frame, is invisible to a concurrent unit. A write with no active frame throws the `ScopeFrameException` the overlay throws. Reads fall back from the overlay to the base items.
- **XT-config-1 now.** It tests that half on a `Repository` with `interleave`: a write in one unit is invisible to the other, the base is unchanged, and a write with no frame throws. It does not build an Application or a `config()` helper.
- **When `sealed` lands.** The Story that adds the Application's `sealed` state and the runtime seam for a base write (Story 17.4, or Story 51.1 if it adds the state first, as ESC-11.1-2 says) also gives the config Repository its pre-sealed base write. XT-config-1 then gains its full wording: `config([...])` on a sealed Application inside a unit frame. The Epic 15 retrospective routes that follow-up for `packages/config`, as the Epic 11 retrospective did for Macroable (`epic-11-retro-item-7-macroable-boot-write`). This ruling does not edit `epics.md`.

Option 2 (a write with no frame mutates the Repository's base) is not taken. It would decide AD-5.4's sealed rule inside one Component before any Application has a sealed state, and a missing frame would leak one request's write into every later request.

## Rationale

- **It is AD-5.4 and AD-5.5.** Writes after `sealed` go to the innermost unit frame's overlay, and with no frame a write throws. Option 1 ships exactly that half now, and puts the pre-sealed rule where the state is defined, once, for every base-only write.
- **Nothing is faked.** No Application, sealed state or `config()` helper exists before Container, Support helpers and Foundation. Simulating one in `packages/config` is the partial implementation of another Component that `AGENTS.md` and F-8 forbid.
- **It is outside the classes the orchestrator may not rule on.**
  - It removes no assertion, weakens no expected value, and adds no skip or `adapted:` marker. XT-config-1 tests the behaviour the Story ships.
  - It adds no divergence. The sealed-Application case is unsupported only until the Components it needs exist.
  - It does not make Xaravel slower, and the end state is Laravel's behaviour.

This ruling clears XT-config-1 of ESC-15.1-2.
