---
title: 'Epic 17 item 1: runtime Container reflection'
type: 'feature'
created: '2026-11-21'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

Implement `epic-17-item-1-runtime-container-reflection` as specified in sprint status and decisions/ESC-17.1-3.md, including the DIV-3.5 additions in decisions/ESC-17.1-2.md. The scope is `packages/runtime`, preserving existing exports and readers, with XT-runtime cases against PHP 8.5.11.

## Boundaries & Constraints

Follow the two decisions and AD-4, AD-9, AD-10 and AD-19. Do not invent cross-component contracts, weaken tests, or change another component.

</intent-contract>

## Code Map

- `packages/runtime/src/metadata/specs.ts` and `src/metadata/inject.ts` own the current injection declarations.
- `packages/runtime/src/php/ReflectionParameter.ts`, `reflectionParameters.ts` and `reflectionTypes.ts` read parameter metadata; `ReflectionClass.ts` and `reflectionTargets.ts` handle class and method reflection.
- `packages/runtime/src/php/attributes.ts` implements class attributes only. `docs/reflection.md` says parameter attributes are not ported.
- `packages/runtime/src/php/callables.ts` resolves callables; `WeakMap.ts` has an object identity allocator.
- `packages/runtime/tests/xaravel/reflection.test.ts` and `inject.test.ts` cover existing metadata; neighboring PHP probe files record Oracle observations.

## Auto Run Result

Status: blocked
Blocking condition: intent gap requiring a contract ruling. The item requires parameter attribute readers, but DIV-3 names contextual-attribute descriptors without specifying their runtime representation; AD-4 locates the factories in Container, while the runtime currently supports class attributes only. The item also requires PHP `isInstantiable`, but TypeScript erases `abstract` and no runtime declaration identifying abstract classes was found. Decide how runtime reads the Container-owned descriptor, including coexistence with nullable/default Specs, and how abstract classes are declared for reflection. Empty attributes or treating every class as concrete would silently guess behavior. Resume planning once the contracts are ruled.

## Spec Change Log

- 2026-11-21: First planning pass blocked before implementation on the two missing contracts above.
