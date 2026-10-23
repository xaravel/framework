---
title: 'Story 9.14: fqcn() of a contract token'
type: 'feature'
created: '2026-10-23'
status: 'in-progress'
baseline_revision: '2e495fed0108c8473a98f1d9e3a9320938529a53'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-10.1-3.md'
  - '{project-root}/stories/9.14.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `fqcn()` in `@xaravel/runtime/registry` throws for a `contract<T>()` token, because a token is a frozen plain object, not a registered class. The container and Story 10.4's `canonicalToken` need a token's FQCN from `fqcn()`, the one identity lookup AD-10 gives (ESC-10.1-3, option 1).

**Approach:** Add one branch to `fqcn(value)`: when the value is a non-function object, frozen, and has an own, non-writable data property `Symbol.for('xaravel.class.fqcn')` whose value is a string, return that string. Every other value keeps today's path. Verify with the new Xaravel Test XT-runtime-40.

## Boundaries & Constraints

**Always:** Edit only `packages/runtime/**` plus this Story's records. Keep the error message and `TypeError` of the existing miss path unchanged. Return `null` never; the function still returns a string or throws. Build the test's token by hand, with exactly the shape `packages/contracts/src/Contract.ts:64-82` makes (frozen object literal with `[CLASS_FQCN]: name`), since the runtime must not import `@xaravel/contracts`.

**Never:** No change to `resolveClass`, `resolveClassAsync`, `registerClass`, `registerTestClass` or the brand logic. No token is ever registered or resolvable by name. No import of `@xaravel/contracts` from the runtime (package graph). No change to `packages/contracts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token | `Object.freeze({ [CLASS_FQCN]: "Illuminate\\Contracts\\Support\\Arrayable", ... })` | returns `"Illuminate\\Contracts\\Support\\Arrayable"` | none |
| Token, test frame | same token inside a test frame that registered a test class | same string | none |
| Not frozen | plain object with own string key | unchanged path: throws | `TypeError` "fqcn(): the class is not registered; …" |
| Sealed, not frozen | `Object.seal` of an object whose key is a non-writable string but another own property stays writable | throws as today | same `TypeError` |
| Accessor key | frozen object with a getter returning a string under the key | throws as today | same `TypeError` |
| Inherited key | frozen object whose prototype carries the key | throws as today | same `TypeError` |
| Non-string value | frozen object, own key value `42` / `null` | throws as today | same `TypeError` |
| Function | a frozen unregistered function with own non-writable string key (as `registerClass` would leave) | Registry path only: throws | same `TypeError` |
| Registered class / instance | as today, test frames first | its FQCN | none |
| `resolveClass(token's name)` | name not registered as a class | throws `Class "<name>" not found` | PHP `Error` |
| Non-object | `null`, `"x"`, `1` | throws as today | `TypeError` "fqcn(): the value is not a class or an object" |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:96-115` -- `fqcn()`; add the token branch after the type check and before the class lookup. `CLASS_FQCN` constant at :52. Update the file header comment (:6-8 says "`fqcn()` reads the Registry, never the brand") to name the token exception.
- `packages/runtime/src/registry/registry.ts:121-131` -- `resolveClass`, read-only: lookups only by registered key, so a token name already misses.
- `packages/contracts/src/Contract.ts:64-82` -- `contract()`, read-only: the token shape to mirror in the test.
- `packages/runtime/tests/xaravel/registry.test.ts:16-23, 119-160` -- `xaravelTest` / `Assert` idiom and imports; add XT-runtime-40 at the end of this file (a `thrownBy` helper exists in the file).
- `packages/runtime/docs/class-registry.md:40-41` -- the `fqcn` bullet; add that a contract token gives its own FQCN. XT-runtime-37 (`docs.test.ts`) checks docs name every export; no new export is added.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts` -- add the token branch (own descriptor via `Object.getOwnPropertyDescriptor`, `"value" in d`, `d.writable === false`, `typeof d.value === "string"`, `Object.isFrozen`, `typeof value === "object"`); update the docblock and header comment -- ESC-10.1-3 option 1.
- `packages/runtime/tests/xaravel/registry.test.ts` -- add XT-runtime-40 covering every matrix row, citing ESC-10.1-3 and AD-10 in its consequence string -- FR-115, the manifest's only Xaravel Test.
- `packages/runtime/docs/class-registry.md` -- extend the `fqcn` bullet -- keep docs accurate.

**Acceptance Criteria:**
- Given a frozen, non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data property is a string, as `contract<T>()` makes, when `fqcn(value)` runs, then it returns that string.
- Given a class, an instance, an unregistered class, or any other object, when `fqcn(value)` runs, then it behaves exactly as before (registered class or instance gives its FQCN, test frames first; anything else throws), and `resolveClass` never resolves a token's name as a class.
- Given the baseline `registry.ts`, when XT-runtime-40 runs, then it fails; after the change it passes, and XT-runtime-1..39 still pass.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun run harness --xaravel --component runtime` -- expected: no differences, XT-runtime-40 passes.
- `bun run harness` -- expected: SUMMARY with no differences (NOT-RUN variants allowed).
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run story:check 9.14` -- expected: pass.
