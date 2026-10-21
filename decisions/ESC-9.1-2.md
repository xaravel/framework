---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "ff3e6a47f10a493bc9142fe3b052e788c3a4c684856b41165053ba3d1dcd02c7"
---

# ESC-9.1-2: approved, option 1 (Story 9.1 lands the Registry core and registers `ScopeFrameException`)

Story 9.1 ships `ScopeFrameException` in `packages/runtime/src/scope/ScopeFrameException.ts` as a JS `Error` subclass, and its file ends with `registerClass('Xaravel\\Runtime\\Scope\\ScopeFrameException', ScopeFrameException)`. Story 9.10 re-parents it on the PHP `RuntimeException` it adds, keeping the FQCN.

To make that call real, Story 9.1 also lands the base-level core of the Class Registry in `packages/runtime/src/registry/`:

- `registerClass(fqcn, X)` stores the class in one process-wide map keyed by the lower-cased FQCN. It throws when a different class is registered under an existing key, and when a class already registered is registered under a second FQCN.
- `fqcn(classOrInstance)` returns the registered FQCN and throws for an unregistered class.

Story 9.4 keeps every one of its acceptance criteria and builds the rest on that core: the `resolveClass` messages, `registerTestClass` overlays, PSR-4 autoload, the classmap, the grader brand and the recogniser re-check. Whether the core is importable as `@xaravel/runtime/registry` or only from the package root is ESC-9.1-1's question, not this one; within the package, `scope/` imports `registry/` by relative path.

FQCN rule for Xaravel-only classes, which later Stories follow: `Xaravel\<Package>\<Sub-path>\<ClassName>`, mirroring `packages/<package>/src/<sub-path>/<ClassName>.ts` with each segment in StudlyCase. Classes ported from Upstream keep their Upstream FQCN (AD-10).

Rationale:

- **AD-10 holds from the first framework class.** Every framework class file ends with `registerClass`, and `registration:check` enforces it. Option 3 (an unregistered class) breaks that rule and leaves callers unable to catch the exception by class.
- **It stays inside one Component.** The Registry core and the scope primitive are both `@xaravel/runtime`. Landing the core earlier in the same package is not a stub of another Component, and the core is complete for what it does: Story 9.4 adds to it and removes nothing.
- **No planning document changes.** Option 2 would reorder Epic 9 in `epics.md`, which is the Maintainer's. Option 1 leaves the Story order and every acceptance criterion as written.
- **The grader is not weakened.** No assertion, expected value, skip or `adapted:` marker changes; XT-runtime-3 is ported as written.
- **No divergence and no run-time cost.** `ScopeFrameException` is the class DIV-11 and AD-5 already name. A map lookup keyed by FQCN is what AD-10 asks for.

Story 9.1 stays `blocked` until ESC-9.1-1 is ruled. This ruling clears XT-runtime-3 only.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun. The Maintainer may overrule it; the status issue reports it.
