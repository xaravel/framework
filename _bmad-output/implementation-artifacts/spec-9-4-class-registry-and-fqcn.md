---
title: 'Story 9.4: Class Registry and `fqcn()`'
type: 'feature'
created: '2026-10-21'
status: 'ready-for-dev'
baseline_revision: 'f079e77'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.4.md'
  - '{project-root}/decisions/ESC-9.1-2.md'
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
  - '{project-root}/decisions/ESC-9.4-1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 9.1 landed only the Registry core (`registerClass`, `fqcn`; ESC-9.1-2). Nothing resolves an FQCN string to a class, test fixtures cannot register their Upstream FQCNs without colliding across tests, app classes cannot load from the PSR-4 map, the grader cannot print PHP class names, and `registration:check` lets a file register a class it imports (Epic 6 retro R3).

**Approach:** Build the rest of AD-10 on the core in `packages/runtime/src/registry/`, exported as `@xaravel/runtime/registry` (ESC-9.1-1): `resolveClass`, `registerTestClass` in the test frame's overlay, the class-name brand, PSR-4 autoload with an async miss path, and `writeClassmap` / `loadClassmap`. Re-check the registration scan (its same-file rule landed with ESC-9.4-1) against the first real registrations.

## Boundaries & Constraints

**Always:** edit only `packages/runtime/**` (the same-file scan rule and its tests already landed with `decisions/ESC-9.4-1.md` part 3, so `tools/registration/**` and `conformance/tests/xaravel/registration.test.ts` are not edited), this spec, the Story's status lines and its Escalations. Keep every 9.1 behaviour and message of `registerClass` / `fqcn` (ESC-9.1-2: 9.4 removes nothing). Lower-cased FQCN keys, leading `\` dropped. Sync everywhere except the one async miss path (AD-6). `null`, never `undefined` (AD-9). Laravel-shaped messages: `Class "<FQCN>" not found` for a miss (PHP's `Error` text; the class is `Error` until Story 9.10 adds PHP's hierarchy, as `ScopeFrameException` was).

**Never:** `constructor.name` for identity (lint); `JSON.stringify` in `src/` (AD-23); a second `AsyncLocalStorage`; morph maps, config `$class` rehydration or boot-time discovery imports (Foundation, Config, Database Stories); editing `tools/lint-rules`, `tools/async-surface` or any other Protected Path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve | `registerClass('App\\Models\\Post', Post)` | `resolveClass('App\\Models\\Post')` and `resolveClass('\\app\\models\\post')` → `Post`; `fqcn(Post)` and `fqcn(new Post())` → `'App\\Models\\Post'`; `Post[Symbol.for('xaravel.class.fqcn')]` is the FQCN, non-enumerable, own | No error expected |
| Miss | `resolveClass('App\\Missing')` | — | throws, message names `App\Missing` |
| Unregistered class | `fqcn(class {})` | — | throws (9.1 message kept) |
| Duplicate key | another class under `App\\Models\\Post` | — | throws (9.1 message) |
| Second FQCN | `Post` under `App\\Post2` | — | throws, names both FQCNs |
| Test class | inside a `test` frame (and from its child units), `registerTestClass('Tests\\Fixtures\\Foo', Foo)` | resolvable and `fqcn`-able in that test frame and its children; not in a sibling or later test frame, nor outside | outside any test frame → `ScopeFrameException`; a key the base already holds for another class → throws |
| PSR-4 miss | `package.json` `xaravel.autoload.psr-4` `{"App\\": "app/"}` loaded; `App\Models\Comment` unregistered | async resolve imports `app/Models/Comment.ts` and returns the class that file registered | no mapped prefix, no file, or a file that does not register the FQCN → rejects naming the class |
| Classmap | `writeClassmap(path)`, then `loadClassmap(path)` in a fresh map | same FQCN → file entries; a miss resolves through the classmap before PSR-4 | unreadable or malformed file → throws naming the path |
| Same-file rule | `registerClass('A\\B', X)` where `X` is imported, not declared in the file | `registration:check` reports it at the call | — |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts` -- the 9.1 core: `byKey` (lower-cased FQCN → `{fqcn, klass}`), `byClass` (WeakMap), `normalise`. Extend here; keep messages.
- `packages/runtime/src/registry/index.ts`, `packages/runtime/src/index.ts`, `packages/runtime/package.json` -- add new exports; add `"./registry": "./src/registry/index.ts"` (ESC-9.1-1; `conformance/tests/xaravel/scaffold.test.ts:225` already lists it).
- `packages/runtime/src/scope/scope.ts` -- `Store` (line ~74: `parent`, `type`, `frame.kind`, `statics`), `lookUp` (~311), `entriesOf` (~322), `writeOwner` (~333), `ownerOf` (~365). A test-frame write needs the nearest unit of kind `test` up the chain; add one internal (not re-exported) helper here for the registry.
- `packages/assert/src/declarations/portedTest.ts:121` -- the grader opens test frames as kind `"test"` through `Symbol.for('xaravel.scope.run')`.
- `packages/assert/src/Framework/TestCase.ts:37` (read-only) -- the grader reads `Symbol.for('xaravel.class.fqcn')` on a value, then its constructor (ESC-4.3-1 item 1).
- `tools/registration/registration.ts` (read-only) -- the scan, with the same-file rule (`sameFileMessage`) from ESC-9.4-1.
- `packages/runtime/tests/xaravel/overlays.test.ts` -- test style (`xaravelTest(id, consequence citing AD-n.k, body)`, `Assert.*`, `thrownBy`).
- `conformance/xaravel-consequences/runtime.jsonl` (read-only) -- AD-10.1..10.5 consequence ids.
- `packages/runtime/async-surface.json` -- regenerate with `bun run async-surface runtime`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts` -- add `resolveClass(fqcn)`, the class-name brand in `registerClass`, `registerTestClass(fqcn, X)` (writes into the nearest `test` unit's overlay; reads in `resolveClass` / `fqcn` check the frame chain first), PSR-4 (`loadAutoload(packageJsonPath)`), the async miss path `resolveClassAsync(fqcn)` tagged `@asyncRoot Registry.resolveClassAsync` (ESC-9.4-1 part 1), and `writeClassmap` / `loadClassmap` -- AD-10.1..10.5.
- `packages/runtime/src/php/` -- the default-flags core of `jsonEncode` (ESC-9.4-1 part 2), exported from `./php`; `writeClassmap` encodes with it.
- `packages/runtime/src/scope/scope.ts` -- internal helper for the nearest `test` unit's statics map.
- `packages/runtime/src/registry/index.ts`, `src/index.ts`, `package.json` -- exports and the `./registry` subpath.
- `packages/runtime/tests/xaravel/registry.test.ts` -- new: XT-runtime-12..15, one per manifest row, covering every matrix row; XT-runtime-14 also covers the second-FQCN AC.
- `bun run registration:check` -- re-check the FQCN shape, duplicate-key and same-file rules and the recogniser against the real `packages/runtime` registrations (count printed); a mismatch raises an Escalation.
- `packages/runtime/async-surface.json` -- regenerate.

**Acceptance Criteria:** the six ACs of Story 9.4 in `_bmad-output/planning-artifacts/epics.md` (line 3045), verified by XT-runtime-12..15 (`stories/9.4.md`) and the registration scan's tests.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Test overlay:** stored per test unit, keyed by lower-cased FQCN plus a class → FQCN map, so `fqcn(X)` for a test class answers inside the frame. Writes go to the nearest unit of kind `test` up the chain, wherever the call is made from, so a fixture registered from a nested unit stays for the test; it is discarded when the test unit ends (Story 9.3's `end`).
- **Brand:** `Object.defineProperty(X, Symbol.for('xaravel.class.fqcn'), { value: fqcn, enumerable: false, configurable: false })` on registration; a subclass inherits it for display only, and `fqcn()` still reads `byClass`, never the brand.
- **Escalation before build:** two of XT-runtime-15's parts conflict with binding ADs (see Auto Run Result); the plan holds once ESC-9.4-1 is ruled.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 15 pass
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` -- expected: clean
- `bun run story:check 9.4` -- expected: pass (with `GH_TOKEN`), after the Fidelity Review of the final tree

## Auto Run Result

Status: blocked (2026-10-21, at planning)
Blocking condition: intent gap. XT-runtime-15 (PSR-4 async miss and the classmap) conflicts with two binding ADs, so the Story stops before implementation. Raised `conformance/escalations/ESC-9.4-1.md` (contract, XT-runtime-14, XT-runtime-15):
1. AD-10.4 requires an async-path miss that `await import()`s the mapped file, but AD-6 allows an async public method only if it reaches a listed Driver root or takes an async callback, and "adding a root needs an Escalation". The method would have no true `@asyncRoot` tag, so F-9 rejects it.
2. `writeClassmap` must write `bootstrap/cache/classes.json`, but `JSON.stringify` is a lint error in `packages/runtime/src` (AD-23, `xaravel/no-framework-json-stringify`), and the only permitted encoder, `jsonEncode`, is Story 9.8.
3. Epic 6 retro item 9's Maintainer ruling approves 9.4's `tools/registration/` changes but does not name the scan's tests in `conformance/tests/xaravel/registration.test.ts`; on an Epic 9 Story, the orchestrator treats that path's `ownership` failure as blocking.
- No code was written; this spec is the full plan. On resume, set `status: ready-for-dev`, follow the ruling, and start at step 3.
- Ruled 2026-10-21 (`decisions/ESC-9.4-1.md`): options 1a and 2a; the same-file rule and its tests landed with the ruling, so the Story no longer edits `tools/registration/**` or its tests. Status set to `ready-for-dev`.
- Follow-up review recommended: false.
