---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "ff3e6a47f10a493bc9142fe3b052e788c3a4c684856b41165053ba3d1dcd02c7"
---

# ESC-9.1-2: approved, Story 9.1 lands the Class Registry's core

Option 1. Story 9.1 ships `ScopeFrameException` in `packages/runtime/src/scope/ScopeFrameException.ts` as a JS `Error` subclass, ending with `registerClass('Xaravel\\Runtime\\Scope\\ScopeFrameException', ScopeFrameException)`; Story 9.10 re-parents it on the PHP `RuntimeException` it adds. A Xaravel-only class takes the FQCN `Xaravel\<Package>\<Sub-namespace>\<ClassName>`, matching its file path, and every later Xaravel-only class follows that form. To make the call real, Story 9.1 also lands the base-level core of the Class Registry in `packages/runtime/src/registry/`: `registerClass(fqcn, X)` into one process-wide map keyed by the lower-cased FQCN, throwing on a different class under an existing key and on a second FQCN for the same class, and `fqcn(classOrInstance)`, throwing for an unregistered class. This is the Maintainer's authority for 9.1 to build that part of Story 9.4's Component work; it is not a stub. Story 9.4 keeps every one of its acceptance criteria and builds the rest on that core (`resolveClass` messages, `registerTestClass` overlays, PSR-4 autoload, the classmap, the grader brand, the recogniser re-check).
