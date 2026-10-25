---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "9f69bf266f5b33231e4e5a208a9d4bc662329a098a8e7b3cf0803d2ba434eecb"
---

# ESC-11.1-2: approved, option 1 (the seam for a write before `sealed` lands with the `sealed` state)

Option 1 is approved. The Maintainer's ruling on ESC-11.1-4 leaves this Escalation to the orchestrator.

## The rule

- **Until the `sealed` state exists.** `@xaravel/macroable` routes `macro`, `mixin` and `flushMacros` through `frameStatic`. With no active unit frame, the write throws the `ScopeFrameException` that `frameStatic().set` throws. XT-macroable-2 checks that throw as it stands.
- **When it lands.** The Story that adds the Application's `registering → booting → sealed` state also adds a runtime seam for a write to the active Application's base while that Application is not sealed. That is Story 17.4 (Container, Scope Frame write rules) or Story 51.1 (Application lifecycle), whichever adds the state first. Reads fall back from the frame to that base. If the Story needs a `@xaravel/runtime` change, it raises a `contract` Escalation, and the route follows that ruling.
- **Then Macroable follows.** Once the seam is on `main`, `macro`, `mixin` and `flushMacros` called before `sealed` write to the base. XT-macroable-2 gains the boot-time case, Laravel's `macro()` in a provider's `boot()`. The Epic 11 retrospective routes that follow-up for `packages/macroable`.

Option 2 (Macroable keeps its own per-Application base, keyed by `currentApplication()`) is not taken. It would decide AD-5.4's sealed rule inside one Component, before any Application has a sealed state. Every later base-only write (bindings, routes, `Blade.directive`) would then copy it or differ from it.

## Rationale

- **It is AD-5.4.** A write before `sealed` goes to its Application's base. Option 1 puts that rule where the state is defined, once, for every base-only write.
- **Nothing is faked.** No Application or sealed state exists before Container and Foundation. Simulating one in Macroable is the partial implementation of another Component that `AGENTS.md` and F-8 forbid.
- **It is outside the classes the orchestrator may not rule on.**
  - It removes no assertion, weakens no expected value, and adds no skip or `adapted:` marker. XT-macroable-2 tests the behaviour the Story ships.
  - It adds no divergence. The boot-time case is unsupported only until the Components it needs exist, not an Intentional Divergence.
  - It does not make Xaravel slower, and the end state is Laravel's behaviour.

This ruling clears XT-macroable-2 of ESC-11.1-2.
