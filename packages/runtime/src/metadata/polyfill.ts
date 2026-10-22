// The `Symbol.metadata` polyfill (AD-4, Story 9.9). Bun 1.4.3 has no native `Symbol.metadata`: its TC39 decorators
// still hand each decorator a `context.metadata` object and attach it to the class under
// `Symbol.for('Symbol.metadata')`, so the polyfill defines `Symbol.metadata` as that registered symbol and
// `X[Symbol.metadata]` reads it. A native one is left alone.
//
// It imports nothing, and every runtime entry (`src/index.ts`, `scope`, `registry`, `php`) imports it first, so loading
// any of them installs it before a decorated class is defined.
//
// The conformance harness freezes `Symbol` before any test file loads (`conformance/harness/intrinsics.ts`), after
// installing the same `Symbol.metadata` itself (ESC-9.9-1), so the polyfill finds it defined there. A non-extensible
// `Symbol` without one is skipped; the runtime then reads the registered symbol directly (`METADATA` in `./inject`).
if ((Symbol as { metadata?: symbol }).metadata === undefined && Object.isExtensible(Symbol)) {
  Object.defineProperty(Symbol, "metadata", { value: Symbol.for("Symbol.metadata"), writable: false, enumerable: false, configurable: false });
}

export {};
