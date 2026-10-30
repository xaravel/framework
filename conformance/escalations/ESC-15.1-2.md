---
test_ids:
  - XT-config-1
trigger: contract
proposed: >-
  Option 1 (recommended), as decisions/ESC-11.1-2.md ruled for Macroable:
  Story 15.1 sends every Repository write (`set`, `push`, `prepend`,
  `offsetSet`, `offsetUnset`) to `frameOverlay(repository)` over the base
  items the constructor received, so a write inside a unit frame (or the
  nearest test frame) is invisible to a concurrent unit, and a write with no
  active frame throws `ScopeFrameException`. XT-config-1 tests that half now
  with `interleave`, on a Repository rather than `config([...])` on a sealed
  Application. The Story that adds the Application's `sealed` state and the
  runtime seam for a base write (Story 17.4, per epic-11-retro-item-7) also
  routes a Repository write made before `sealed` to the base, and Story
  51.1 (Foundation bootstrap, which builds the config Repository) or Story
  20.x (the `config()` helper) re-verifies XT-config-1's full wording,
  through a named AC added by the ruling. Option 2: the Repository keeps a
  pre-sealed base write itself now (a write with no frame mutates the base);
  this decides AD-5.4 inside one Component and would leak a request's
  write to every later request if a frame were ever missing.
evidence: >-
  epics.md Story 15.1 AC 2 and AD-5.4/5.5 (ARCHITECTURE-SPINE.md L153-157):
  writes before `sealed` go to the Application's base, after it to the
  innermost unit frame's overlay, and with no active frame any write throws
  `ScopeFrameException`. `@xaravel/runtime/scope` exports `frameOverlay`,
  `interleave`, `runInFrame` and `currentApplication`
  (packages/runtime/src/scope/index.ts) but no sealed state or base-write
  seam; `packages/foundation/src` has only `index.ts`, and there is no
  `config()` helper (Epic 20). decisions/ESC-11.1-2.md approved the same
  route for Macroable and rejected a per-Component base as the partial
  implementation of another Component that AGENTS.md and F-8 forbid; Story
  17.4's AC (epics.md) adds the base-write seam.
---

# ESC-15.1-2: no sealed Application for XT-config-1

XT-config-1 asks for `config([...])` on a sealed Application inside a unit frame. Neither the sealed state, the Application, the base-write seam nor the `config()` helper exists yet. Option 1 follows ESC-11.1-2: every Repository write goes to the frame overlay now, XT-config-1 tests that half with `interleave`, and the Story that adds `sealed` routes pre-sealed writes to the base and re-verifies the full wording. Option 2 has the Repository decide the pre-sealed rule itself.
