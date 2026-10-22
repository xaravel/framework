---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-21
escalation_sha256: "d767fffede751ca99a14b7567a05731bec192f45bb5acd6bb9ddf6c2cf8fe59d"
---

# ESC-9.9-1: approved, option 1 (the harness installs `Symbol.metadata` before it freezes `Symbol`)

`hardenIntrinsics()` in `conformance/harness/intrinsics.ts` now defines `Symbol.metadata` as `Symbol.for('Symbol.metadata')`, non-writable, non-enumerable and non-configurable, when `Symbol` has no own `metadata`, before it freezes anything. That is the value and the descriptor the runtime's polyfill (`packages/runtime/src/metadata/polyfill.ts`) installs outside the harness. The harness stays grader-isolated: it installs a standard well-known symbol through a `Symbol.for` captured at load, and imports nothing from `@xaravel/runtime`.

`conformance/tests/xaravel/harness.test.ts` (XT-conformance-185, the intrinsics part) now also asserts, in a Ported Test under the preload, that `Symbol.metadata` is `Symbol.for("Symbol.metadata")`, that `Symbol` is still not extensible, and that assigning `Symbol.metadata` throws a `TypeError`. `docs/ops/harness.md` says what the preload installs.

Story 9.9 keeps its `Object.isExtensible(Symbol)` guard, which is now a no-op under the harness because `Symbol.metadata` is already defined. When it resumes it may add the in-harness assertion to XT-runtime-33 that the Escalation names.

Rationale:

- **It is within the orchestrator's ruling power.** No assertion, expected value, skip or `adapted:` marker is removed or weakened; one assertion group is added. No divergence is added, and nothing becomes slower: one property definition at preload. The port stays faithful to AD-4, which has the runtime see `Symbol.metadata` defined once it has loaded.
- **The hardening is unchanged.** `Symbol` is frozen as before, and the new property is non-writable and non-configurable, so a Ported Test can no more patch it than any other intrinsic.
- **Option 1 over option 2.** Option 2 leaves `Symbol.metadata` undefined only in the graded process, so a graded test that reads `X[Symbol.metadata]` reads `X["undefined"]`, a difference between the harness and real use that the grader exists to rule out.

This ruling clears ESC-9.9-1 for XT-runtime-33. Story 9.9 stays blocked on ESC-9.9-2 (divergence), which waits on the Maintainer.
