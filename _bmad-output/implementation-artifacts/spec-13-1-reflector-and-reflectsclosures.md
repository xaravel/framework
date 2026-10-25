---
title: 'Story 13.1: Reflector and ReflectsClosures'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: 'f9237ae3bf1fc21f212dc1191eca3c0e233ff0d5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
  - '{project-root}/decisions/DIV-3.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/docs/ops/api-surface.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/reflection` is an empty scaffold (`src/index.ts` is `export {}`). Laravel's `Illuminate\Support\Reflector`, the `Illuminate\Support\Traits\ReflectsClosures` trait and the `lazy` / `proxy` helpers have no port, so all 24 Test IDs are `not-ported-yet`. Events, Container and Routing have nothing to read a callable's declared parameters with.

**Approach:** Port `Reflector` and `ReflectsClosures` line for line, reading types from `inject` metadata (DIV-3). Planning found that every Test ID, and each of XT-reflection-1, -2 and -4, depends on a declaration form or a PHP construct that no AD, DIV clause or runtime contract defines yet. Each gap is raised as an Escalation (ESC-13.1-1..6), and the Story halts `blocked` before implementation, so the core is not built twice.

## Boundaries & Constraints

**Always:**
- Edit only `packages/reflection/**`, the 24 lines in `conformance/expectations/reflection/**`, `conformance/oracle-requests/13.1.jsonl` and `conformance/escalations/ESC-13.1-<n>.md`. Orchestrator bookkeeping (this spec, `epic-13-context.md`, sprint status and the `stories/13.1.md` status) is the only other change.
- Files sit at the Upstream file path: `src/Reflector.ts` (`Illuminate\Support\Reflector`), `src/Traits/ReflectsClosures.ts` (`Illuminate\Support\Traits\ReflectsClosures`), and `lazy` / `proxy` in `@xaravel/reflection/helpers` if ESC-13.1-5 keeps them. Each class file ends with `registerClass('<FQCN>', X)`.
- Types come only from `readInjectMetadata` (and whatever reader the rulings add) in `@xaravel/runtime`. Messages are Upstream's exactly. Everything is sync, and `null` is the only absent value.

**Never:**
- Never edit `@xaravel/runtime`, `@xaravel/contracts` or another package. Never define `oneOf`, `primitive`, attribute storage or PHP reflection classes inside `packages/reflection` as stand-ins (F-8).
- Never use a JS `Proxy` or read parameters from `Function.prototype.toString()`.
- No assertion removed or weakened, no new skip, and no `adapted:` marker without an existing clause.

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Reflection/Reflector.php` -- the 7 public statics plus `getTypeName` (`self` / `parent` resolution).
- `conformance/upstream/framework/src/Illuminate/Reflection/Traits/ReflectsClosures.php` -- 4 protected methods: parameter types, first type(s), return types.
- `conformance/upstream/framework/src/Illuminate/Reflection/helpers.php` -- `lazy()` / `proxy()` over PHP 8.4 lazy ghosts and proxies. Nothing in `framework/src` calls them.
- `conformance/upstream/framework/tests/Support/SupportReflectorTest.php`, `SupportReflectsClosuresTest.php`, `Fixtures/ClassesWithAttributes.php`, `Fixtures/UnionTypesClosure.php` -- the 24 tests and their fixtures.
- `packages/runtime/src/metadata/inject.ts` -- `inject` / `readInjectMetadata`. It writes a frozen, ordered name-to-Spec map, rejects `null` / `undefined` Specs, and stores per function (methods) or per class (inherited).
- `packages/runtime/src/BlockedByComponentError.ts` -- thrown from `setUp` for `blocked-by:<c>` lines (ESC-12.1-2). It applies to the mail, bus, database and collections dependencies once the rulings land.
- `conformance/api-surface/reflection.jsonl` -- the close gate: `Reflector`'s 7 statics, the trait, `lazy`, `proxy`.
- `packages/reflection/package.json` -- depends on collections, contracts and runtime. Collections has no code yet (Epic 14).

## Tasks & Acceptance

**Execution:**
- `conformance/escalations/ESC-13.1-1.md` .. `ESC-13.1-6.md` -- raise one Escalation per gap below -- AGENTS.md stop rules.
- `conformance/expectations/reflection/framework/tests/Support/*.jsonl` -- set each line's `escalation` to its ESC; status stays `skip` / `not-ported-yet` -- record the stop.
- Once the rulings land: re-plan this spec from the rulings, port `src/Reflector.ts`, `src/Traits/ReflectsClosures.ts` and the tests, then run the full Story loop.

**Acceptance Criteria:**
- Given the 24 Test IDs, when each is classified, then it names the Escalation that stops it, and none is ported before its ruling.
- Given the rulings, when the Story resumes, then the epic's ACs (24 Test IDs pass or carry a valid non-`not-ported-yet` Skip Reason, XT-reflection-1..4, and the `api-surface:gate reflection` close gate) apply unchanged.

## Design Notes

The gaps, each with one Escalation:

| ESC | Trigger | Gap | Test IDs |
| --- | --- | --- | --- |
| ESC-13.1-1 | contract | `Reflector`'s parameter methods take a `ReflectionParameter`. The runtime has no PHP reflection classes and no `self` / `parent` Spec. | 7 Reflector parameter tests, XT-reflection-1 |
| ESC-13.1-2 | divergence | Untyped and variadic closure parameters cannot be declared (`inject` rejects `null`, and AD-4 needs every key). The "closure with no `inject`" rule (XT-reflection-2) conflicts with Upstream's `[]` / `[null]`. | 8 ReflectsClosures parameter tests, XT-reflection-2 |
| ESC-13.1-3 | divergence | Closure return types have no declaration form. | 6 `testClosureReturnTypes*` tests |
| ESC-13.1-4 | contract | PHP class attributes have no recorded decorator or storage form. `getClassAttributes` also returns a `Collection` (Epic 14). | `testGetClassAttributes`, `testGetClassAttribute` |
| ESC-13.1-5 | divergence | `lazy()` / `proxy()` need PHP lazy objects, which only a `Proxy` can give (AD-7). | XT-reflection-4 (close gate) |
| ESC-13.1-6 | divergence | `isCallable` cannot see visibility (erased) or PHP global function names. | `testIsCallable` |

Four ReflectsClosures tests in ESC-13.1-2 (`testItReturnsTheFirstParameterType`, `testItThrowsWhenNoParameters`, `testItWorksWithUnionTypesWithNoArguments`, `testItWorksWithUnionTypesWithNoTypeHints`) need no new Spec. They are held because they run through the same parameter enumeration, whose "no declaration" reading the ruling decides. XT-reflection-3 (classification) follows from all six rulings.

Lessons applied: epic 2 / epic 12 (check the contract before building, so gaps that are foreseeable do not cost a full build), epic 11 (a silent PHP difference needs a DIV clause, so isCallable is escalated, not shipped with a docs note), epic 4 (no shipping beside an open contract Escalation).

## Verification

**Commands:**
- `bun run escalations:check` -- expected: the six records are valid.
- `bun run expectations:check` (or the harness's Expectations validation) -- expected: the 24 lines stay valid `skip` / `not-ported-yet` lines, each with its Escalation.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. ESC-13.1-1 (parameter reflection objects and `self` / `parent` Specs, contract), ESC-13.1-2 (untyped and variadic closure parameters, and the no-`inject` rule, divergence), ESC-13.1-3 (closure return types, divergence), ESC-13.1-4 (class attribute decorators, contract), ESC-13.1-5 (`lazy` / `proxy` lazy objects, divergence) and ESC-13.1-6 (`isCallable` visibility and function-name strings, divergence) wait on the Maintainer. Every Test ID and XT-reflection-1, -2 and -4 depend on one of them, so no implementation was started.

Runtime half landed (action item `epic-13-item-1-runtime-reflection`, spec `spec-retro-13-runtime-reflection.md`). One deferred point applies when this Story resumes: a contract token's FQCN string does not resolve through `ReflectionClass` (the Registry holds classes only, ESC-10.1-3). So for `testParameterSubclassOfInterface`, port `IA` / `IB` as registered classes, as `@xaravel/runtime/php` does for PHP interfaces. If a token is needed, raise a `contract` Escalation.
