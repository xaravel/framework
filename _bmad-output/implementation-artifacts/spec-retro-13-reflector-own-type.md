---
title: 'Reflector over a parameter''s own type (epic-13-retro-item-5-reflector-own-type)'
type: 'bugfix'
created: '2026-10-25'
status: 'blocked'
baseline_revision: 'e4c966f143fec8ca061e5b14d7b3f97761f33ced'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-retro-2026-10-25.md'
  - '{project-root}/decisions/MAINT-2026-10-25-epic-13-items.md'
---

<intent-contract>

## Intent

**Problem:** Epic 13 retrospective action item 5 (findings L1, L4, L5), extended by item 6 (b) of `decisions/MAINT-2026-10-25-epic-13-items.md`. `Reflector.isParameterSubclassOf` turns the parameter's type into an FQCN and resolves it again, so a second contract token recorded under the same FQCN answers with the first token's parents (L1). XT-reflection does not pin whether a bare unregistered constructor is callable (L4), or that a parameter typed with an unregistered class throws (L5). `isCallable('Class::instanceMethod')` gives `true` where PHP 8 gives `false` (item 6 (b)).

**Scope:** `packages/reflection/**` only, as the item's `action` names (amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`).

</intent-contract>

## Code Map

- `packages/reflection/src/Reflector.ts:251-256` -- `isParameterSubclassOf` reads `getParameterClassName(parameter)` (a string) and calls `new ReflectionClass(name)`, which resolves the first token recorded under the name.
- `packages/runtime/src/php/ReflectionParameter.ts:12` -- the parameter's Spec (the class or token `inject` declared) is the private field `#spec`. It has no public accessor, and the runtime's package entries export neither `typeOfSpec` nor `parametersOf`.
- `packages/runtime/src/php/reflectionTypes.ts:30-31` -- `namedType` builds `new ReflectionNamedType(fqcn(spec), false)`, so the type keeps only the name, not the class or token.
- `packages/runtime/src/php/ReflectionNamedType.ts:7-26` -- holds only `#name` and `#builtin`.
- `packages/runtime/src/registry/registry.ts:222-241` -- `registerContractToken` keeps the first token under a name (ESC-13.1-7), with no test-frame overlay.

## Auto Run Result

Status: blocked
Blocking condition: scope. L1 cannot be fixed within `packages/reflection`. A `ReflectionParameter` gives `packages/reflection` only its name, its `getType()` (a `ReflectionNamedType` that carries only an FQCN string) and its declaring class. The class or token the parameter's Spec holds sits in the runtime's private `#spec` and is not reachable from outside `packages/runtime`. Reflecting "the parameter's own type value" therefore needs a `packages/runtime` change, for example a `ReflectionNamedType` that keeps the class or token it was built from, or a test-frame overlay for `registerContractToken`. The item's `action` names only `packages/reflection`. Under the 2026-10-22 amendment a fix that needs another component waits on the Maintainer, and the orchestrator may not widen the `action`. The other parts (L4 and L5 pins, docs, the item 6 (b) re-pin) fit the scope. They are not done separately: the item's Fidelity Review reads the whole `action`, so a partial change would be rejected for missing L1.

Decision needed: add `packages/runtime` to the item's `action` (naming the mechanism), or rule L1 out of the item and leave the rest to the orchestrator.
