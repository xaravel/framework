---
title: 'Story 17.1: Binding and resolution core'
type: feature
created: '2026-10-31'
status: blocked
baseline_revision: '95986ca8bb41a2b7964533ad5bc26bd1ed32970d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/decisions/DIV-3.md'
  - '{project-root}/decisions/DIV-11.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Container is an empty scaffold. Story 17.1 owns 97 Upstream Test IDs plus XT-container-1..3 for binding, canonical service identity and explicit injection.

**Approach:** Translate the four manifest-owned test files and their fixtures, then port the real Container resolution path and its utility classes over runtime metadata, reflection and Scope Frames. Preserve complete same-component dependencies that these tests exercise even when later Stories describe their broader coverage.

## Boundaries & Constraints

**Always:** Preserve Laravel names, parameters, defaults, errors and assertion counts. Use named exports and one public class per Upstream path, ending framework files with registerClass. Canonicalize class/string/token abstracts using fqcn and the alias table. Use runtime PHP semantics and existing contracts/PSR identities. Keep resolution synchronous. Declare parameter names/order through inject; null is the sole absent value. Store per-unit mutable state in runtime frame slots. Mark actual adaptations with existing DIV clauses.

**Never:** No source parsing for erased parameter metadata, second Container-only defaults table, competing inject declaration, partial substitute for runtime reflection, same-component blocked-by, assertion weakening, or Protected edits. No permission to extend DIV-3 without ESC-17.1-2. Changes stay within packages/container, this Story's Expectations, oracle requests and Escalations, plus authorized implementation bookkeeping.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Named injection | inject({ mailer: Mailer, retries: Number }); make(X, { retries: '3' }) | resolved Mailer and PHP-coerced 3 | BindingResolutionException if a required dependency cannot resolve |
| Canonical identity | abstract string, class, contract token for one service | one canonical binding and shared instance | retain Upstream not-found errors |
| Missing declaration | constructor has parameters without inject | actionable message naming class and inject form | BindingResolutionException |
| Optional class | nullable class parameter default null, initially unbound then bound | null first; resolved instance after binding | declaration awaits ESC-17.1-2 |
| Primitive default | untyped parameter default 'taylor' | exact default unless explicitly overridden | declaration awaits ESC-17.1-2 |
| Variadic non-instantiable | unresolved interface variadic followed by another make | empty variadic; override stack restored | preserve try/finally cleanup |

</intent-contract>

## Code Map

- `stories/17.1.md` — 97 exact Test IDs, three Xaravel IDs; immutable allocation for this attempt.
- `conformance/upstream/framework/tests/Container/{ContainerTest,ContainerResolveNonInstantiableTest,UtilTest,RewindableGeneratorTest}.php` — test specification, default fixtures, protected scoped-state reflection and closure/index ReflectionParameter construction.
- `conformance/upstream/framework/src/Illuminate/Container/{Container,Util,RewindableGenerator,EntryNotFoundException}.php` — implementation; Container default resolution at 1329 and 1358, construction at 1159/1170, SelfBuilding method injection at 1223.
- `packages/runtime/src/metadata/{inject,specs}.ts` — sole declaration mechanism; no default/optional/nullable Spec representation.
- `packages/runtime/src/php/{ReflectionClass,ReflectionParameter,reflectionParameters}.ts` — shared reflection; current parameter constructor is internal name/spec/declaringClass only; missing PHP APIs detailed in ESC-17.1-3.
- `packages/contracts/src/container/` and PSR exports — reuse token and exception identity; no new JS dependency requested.
- `tools/xt-coverage/consequences.ts`, `conformance/xaravel-consequences/container.jsonl` — Protected missing row, ESC-17.1-1.
- `epic-17-context.md` — full foreseeable-API overlap list, dependency triage and builtin scan results.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/container/tests/ported/framework/tests/Container/*.test.ts` and fixture files — translate exactly the manifest IDs with portedTest and @xaravel/assert after the injection declaration is decided. Preserve defaults, fixtures and reflection assertions.
- [ ] `packages/container/src/Container.ts` and Upstream helper/class paths — port complete binding/resolution behavior; reuse runtime contracts after ESC-17.1-3. Implement real contextual/call/scoped dependencies where manifest-owned tests require them, never stubs.
- [ ] `packages/container/src/index.ts` — named exports and runtime Spec re-exports under existing decisions.
- [ ] `packages/container/tests/xaravel/resolution.test.ts` — XT-container-1..3 for the matrix's named injection, canonical identity and missing-declaration cases; cite approved consequence rows.
- [ ] `conformance/expectations/` — update only this Story's lines after verified outcomes; no changes in this blocked planning attempt.

**Acceptance Criteria:**
- Given the 97 owned tests, when the full Story harness runs, then every ID passes or has a valid externally owned dependency reason; no same-component skip.
- Given inject with Mailer and Number, when make supplies retries '3', then Mailer resolves and retries is 3 (XT-container-1).
- Given string, class and token aliases, when resolved, then they reach the same canonical service instance (XT-container-2).
- Given constructor parameters without inject, when autowired, then BindingResolutionException names the class and declaration form (XT-container-3).

## Spec Change Log

- 2026-10-31: First planning pass found defaults/nullability declaration gap, missing runtime reflection contracts and missing consequence row. Raised ESC-17.1-1..3 together. Same-component overlap is permitted complete early work, not a skip or an automatic scope blocker.

## Review Triage Log

No implementation or review dispatched: planning readiness failed first.

## Verification

- `bun run scan:builtins container` — completed; results and existing conversions recorded in epic context.
- `bun run escalations:check` — passed for all three new records.
- After rulings and implementation: `bun run harness --fast --story 17.1`, full `bun run harness --story 17.1`, `bun run story:check 17.1`, package gates, full harness, typecheck, lint and all review layers including Fidelity with --loop-cli codex. These have not run for this planning-only attempt.

## Auto Run Result

Status: blocked.
Blocking condition: intent gap; the sole inject declaration has no decided default/optional/nullable form (ESC-17.1-2), so the sufficient/coherent ready-for-development standard is unmet. Shared reflection (ESC-17.1-3) and consequence row (ESC-17.1-1) also need the second key. No implementation step was entered. These Escalations affect their listed Test IDs; the remaining IDs retain their work allocation and unchanged Expectations for resumption. No test is claimed complete.
