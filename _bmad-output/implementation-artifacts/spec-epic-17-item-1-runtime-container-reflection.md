---
title: 'Epic 17 item 1: runtime Container reflection'
type: 'feature'
created: '2026-11-21'
status: 'blocked'
baseline_revision: 0b410cf0c96af33724a62422e1e3da970a6ce0e8
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
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

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/metadata/specs.ts`, `src/php/attributes.ts` -- implement DIV-3.5 and DIV-3.6 descriptors, composition and validation; preserve existing declarations.
- `packages/runtime/src/php/ReflectionParameter.ts`, `reflectionParameters.ts`, `reflectionTypes.ts`, `ReflectionNamedType.ts`, `ReflectionUnionType.ts` -- implement PHP constructor forms and parameter readers, including correctly represented nullable types, defaults and attributes.
- `packages/runtime/src/php/ReflectionAttribute.ts`, `ReflectionClass.ts`, `reflectionTargets.ts` -- support parameter attribute targets and filtering, abstract class metadata and constructor/instantiability reflection as the rulings specify.
- `packages/runtime/src/php/ReflectionProperty.ts`, callable and identity helpers, `src/php/index.ts` and any necessary runtime exports -- implement the remaining ruled PHP surface while sharing callable resolution and object identity.
- `packages/runtime/tests/xaravel/` -- add meaningful XT-runtime cases and PHP 8.5.11 probe evidence for the new behavior and errors, including interoperation with existing reflection readers.

**Acceptance Criteria:**
- Given declared nullable, optional and attributed parameters, when reflection reads them, then it distinguishes optionality, nullability, type and ordered attributes as DIV-3.5 and DIV-3.6 require, evaluates defaults afresh, and rejects invalid compositions.
- Given callable or class/method and a parameter name or index, when ReflectionParameter is constructed, then it exposes the same metadata as the existing internal reader and matches PHP's errors.
- Given an abstract class, subclass, trait or contract token, when ReflectionClass reads abstractness and instantiability, then it follows DIV-12.23 without inheriting the flag; constructor and property readers match PHP for represented declarations.
- Given a supported PHP callable or object, when call_user_func or spl_object_id runs, then it shares existing callable resolution or identity and matches PHP behavior.
- Given existing runtime users, when their tests and the full harness run, then existing exports and behavior remain intact.

## Verification

Run targeted runtime tests and recorded PHP 8.5.11 probes, `bun run typecheck`, `bun run lint`, and the full `bun run harness`. Run the complete review workflow and `bun run fidelity:review review --item epic-17-item-1-runtime-container-reflection --spec _bmad-output/implementation-artifacts/spec-epic-17-item-1-runtime-container-reflection.md --loop-cli codex`; require current status before merging.

## Spec Change Log

- 2026-11-21: Implementation found no class-level instance-property declaration contract; saved the incomplete attempt and requested a ruling before continuing.

- 2026-11-21: Resumed planning after the Maintainer settled the attribute and abstract-class contracts in decisions/MAINT-2026-11-21-epic-17-item-1-contracts.md.
- 2026-11-21: First planning pass blocked before implementation on the two missing contracts above.

## Review Triage Log

## Auto Run Result

Status: blocked
Blocking condition: contract ruling needed for `ReflectionProperty` when constructed from a class name or class instead of an instance. ESC-17.1-3 calls for PHP 8.5.11 behavior for represented properties, but JavaScript instance fields live on instances and the runtime has no class-level property declaration registry. PHP validates property existence at construction; guessing, instantiating a class for inspection, or silently accepting nonexistent properties changes behavior or causes side effects. Decide the declaration or permitted scope, including inherited and static properties. ContainerTest.php:204 and :220 use an instance and `scopedInstances`; the ruling should preserve that surface. A partial implementation is saved in `epic-17-item-1-runtime-reflection-attempt.patch`; it also needs callable, error and attribute edge cases before review. Focused XT-runtime-152/153 and XT-runtime-37/84/85, PHP probe, typecheck and lint passed; the full sandboxed harness stalled and was cancelled. No Fidelity Review ran.
