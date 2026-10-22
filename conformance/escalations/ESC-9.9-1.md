---
test_ids:
  - XT-runtime-33
trigger: protected-path
proposed: >-
  Option 1 (recommended): in `conformance/harness/intrinsics.ts`
  (Protected), before `Symbol` is frozen, define `Symbol.metadata` as
  `Symbol.for('Symbol.metadata')` when it is undefined (non-writable,
  non-configurable, as the runtime's polyfill does), so that code under
  the harness sees the same `Symbol.metadata` as code outside it. The
  harness stays grader-isolated: it installs a standard well-known
  symbol and imports nothing from `@xaravel/runtime`. Add a case to
  `conformance/tests/xaravel/harness.test.ts`. Then XT-runtime-33 can
  also assert `Symbol.metadata` in the harness process. Option 2: accept
  the current behaviour. Under the harness the polyfill is skipped, the
  runtime reads `Symbol.for('Symbol.metadata')` directly, and
  XT-runtime-33 checks the polyfill only in fresh `bun` processes.
evidence: >-
  `conformance/harness/intrinsics.ts` freezes `Symbol` (one of
  `GLOBAL_CONSTRUCTORS`) in the harness preload, before any test file
  loads. The first `bun run harness --xaravel --id 'XT-runtime-*'` with
  the polyfill as specified failed every runtime test file with
  `Attempting to define property on object that is not extensible` at
  `packages/runtime/src/metadata/polyfill.ts`. The polyfill now runs only
  when `Object.isExtensible(Symbol)`. `inject` / `readInjectMetadata` use
  `Symbol.metadata ?? Symbol.for('Symbol.metadata')`. Bun 1.4.3 attaches
  a decorated class's `context.metadata` under
  `Symbol.for('Symbol.metadata')` even when `Symbol.metadata` is
  undefined (probed). So XT-runtime-34 passes both under the harness and
  in plain `bun test`, and XT-runtime-33 passes in fresh processes for
  the root and each subpath entry. In the harness process itself,
  `Symbol.metadata` stays undefined, so a graded test that reads
  `X[Symbol.metadata]` would read `X["undefined"]`.
---

# ESC-9.9-1: the harness freezes `Symbol` before the runtime's `Symbol.metadata` polyfill can install

AD-4 has the runtime install `Symbol.metadata ??= Symbol.for('Symbol.metadata')`, and Story 9.9's third AC says `Symbol.metadata` is defined once the runtime has loaded. The conformance harness preload hardens the intrinsics first (Story 5.3) and freezes `Symbol`. Loading the runtime under the harness therefore cannot add the property. Without a guard, every runtime test file failed at import.

In the meantime the runtime ships option 2's behaviour. It skips the polyfill when `Symbol` is not extensible and reads the registered symbol directly. That is the value the polyfill would install, and the key Bun uses for decorator metadata, so `inject` behaves the same under the harness and outside it. XT-runtime-33 passes today: it checks the polyfill in fresh `bun` processes.

What is requested is option 1: close the remaining gap, which is in the harness process only, where `Symbol.metadata` is undefined. That means a change to `conformance/harness/intrinsics.ts`, a Protected Path. No work is stopped meanwhile: if option 1 is ruled, the only follow-up is XT-runtime-33 adding an in-harness assertion.
