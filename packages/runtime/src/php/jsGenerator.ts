// The test for a bare JS generator object, what a ported generator function returns (DIV-12.18). Internal: the
// package does not export this module. It imports nothing, so `Traversable.ts` and `Iterator.ts` read it at load
// without importing `Generator.ts`, which reads their brands when its class is defined. `Generator.ts` re-exports it.

/** A JS generator object, as a ported generator function returns it. */
export type JsGenerator = globalThis.Generator<unknown, unknown, unknown>;

/** `%GeneratorPrototype%`, which every JS generator object inherits. */
const JS_GENERATOR_PROTOTYPE = Object.getPrototypeOf(Object.getPrototypeOf((function* () {})())) as object;

/** Whether `value` is a JS generator object (what a ported generator function returns). Internal. */
export function isJsGenerator(value: unknown): value is JsGenerator {
  return typeof value === "object" && value !== null && Object.prototype.isPrototypeOf.call(JS_GENERATOR_PROTOTYPE, value);
}
