---
test_ids:
  - XT-macroable-2
trigger: contract
proposed: >-
  Option 1 (recommended): the Foundation or Container Story that adds the
  Application's `sealed` state also adds a runtime seam for an Application
  base write (for example, a write that `frameStatic` or a sibling
  primitive routes to the active Application's base store while it is not
  sealed), and `@xaravel/macroable` then routes `macro`, `mixin` and
  `flushMacros` made before `sealed` to it, with reads falling back from
  the frame to that base. Until then a boot-time `macro()` with no active
  frame throws `ScopeFrameException`. Option 2: `@xaravel/macroable` keeps
  a per-Application base itself now, keyed by `currentApplication()`, and
  takes writes there whenever no unit frame is active; this decides the
  sealed rule inside one Component, which every later base-only write
  (bindings, routes, `Blade.directive`) would then copy.
evidence: >-
  epic-11-context.md and AD-5.4 say macro registration is a base-only write
  that, before the Application is `sealed`, goes to that Application's
  base. `@xaravel/runtime/scope` exports `currentFrame`, `frameSlot`,
  `frameOverlay`, `frameStatic`, `currentApplication` and
  `setDefaultApplication` (packages/runtime/src/scope/index.ts); none holds
  a sealed state or a per-Application base store, and `frameStatic().set`
  throws `ScopeFrameException` with no unit frame
  (packages/runtime/src/scope/scope.ts:194-220). spec-9-3 deferred the
  sealed state to Foundation and Container, and `@xaravel/contracts` has no
  contract for it. A Story may not change `@xaravel/runtime`, and faking an
  Application or a sealed state is forbidden (F-8). So Story 11.1 routes a
  write with no active frame to the throw `frameStatic` gives, and
  XT-macroable-2 checks that throw; Laravel's usual pattern, `macro()` in a
  service provider's `boot()`, cannot be supported until this is ruled.
---

# ESC-11.1-2: no seam for macro writes before the Application is sealed

AD-5.4 sends a base-only write made before `sealed` to the Application's base, but neither `@xaravel/runtime` nor `@xaravel/contracts` has a sealed state or a base store yet. Story 11.1 therefore throws `ScopeFrameException` for a `macro()` with no active frame, as `frameStatic` does. Option 1 adds the seam in the Story that adds `sealed`; Option 2 has Macroable keep its own per-Application base now. XT-macroable-2 tests today's behaviour and passes; the boot-time case waits on this ruling.
