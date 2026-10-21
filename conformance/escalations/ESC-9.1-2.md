---
test_ids:
  - XT-runtime-3
trigger: contract
proposed: >-
  Option 1 (recommended): Story 9.1 ships `ScopeFrameException` in
  packages/runtime/src/scope/ScopeFrameException.ts as a JS `Error` subclass
  (Story 9.10 re-parents it on the PHP `RuntimeException` it adds), ending with
  `registerClass('Xaravel\\Runtime\\Scope\\ScopeFrameException',
  ScopeFrameException)`. To make that call real, Story 9.1 also lands the
  base-level core of the Class Registry in packages/runtime/src/registry/:
  `registerClass(fqcn, X)` into one process-wide map keyed by the lower-cased
  FQCN, throwing on a different class under an existing key and on a second
  FQCN for the same class, and `fqcn(classOrInstance)`, throwing for an
  unregistered class. Story 9.4 keeps every one of its acceptance criteria and
  builds the rest (`resolveClass` messages, `registerTestClass` overlays,
  PSR-4 autoload, the classmap, the grader brand, the recogniser re-check) on
  that core. Option 2: reorder Epic 9 so the Registry core comes before 9.1
  (an epics.md change, the Maintainer's). Option 3: ship an unregistered,
  unexported exception in 9.1 (rejected: it breaks AD-10's rule that every
  framework class is registered, and callers could not catch it by class).
evidence: >-
  Story 9.1's third acceptance criterion (epics.md:2991-2993, XT-runtime-3)
  requires a frame-slot write with no active frame to throw
  `ScopeFrameException`. `registration:check` fails any exported class in a
  non-grader packages/*/src file that does not end with a trailing
  `registerClass('<FQCN>', X)` (tools/registration/registration.ts:331-349:
  "exports class X but does not end with registerClass('<FQCN>', X)"), and
  AD-10 makes every framework class file end with that call. `registerClass`
  does not exist yet: the Class Registry is Story 9.4 (epics.md:3045-3074),
  which also depends on 9.3. No document gives `ScopeFrameException` a FQCN or
  a parent class (PRD DIV-11, spine AD-5 lines 155-157, epics, PORTING.md).
---

# ESC-9.1-2: `ScopeFrameException` must be registered before the Class Registry exists

Story 9.1 is the first Story to add a framework class, `ScopeFrameException`. AD-10 and `registration:check` require its file to end with `registerClass('<FQCN>', ScopeFrameException)`, but `registerClass` is Story 9.4's, three Stories later, and nothing names the class's FQCN or its PHP parent.

Story 9.1 may not stub or partially implement the Registry on its own authority, and Option 1 moves part of Story 9.4's scope into 9.1, so it needs a ruling. The ruling also has to give the FQCN, which every later Xaravel-only class will follow.

Work on XT-runtime-3 stops here. Story 9.1's other Test IDs depend on how `frameSlot` fails outside a frame and on ESC-9.1-1, so the Story is blocked until both are ruled.
