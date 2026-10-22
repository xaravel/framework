// Intrinsic hardening for the harness preload (Story 5.3, AD-15, FR-9).
//
// `hardenIntrinsics()` freezes the JavaScript intrinsics a Ported Test could
// patch to change the grader's verdict, before any test file loads:
//
//   - the constructors and their prototypes: Object, Function, Array, String,
//     Number, Boolean, Symbol, BigInt, Error and every native error, Promise,
//     RegExp, Date, Map, Set, WeakMap, WeakSet, ArrayBuffer, %TypedArray% and
//     each typed array, AsyncLocalStorage (`node:async_hooks`), and Iterator
//     when the runtime has it;
//   - the iterator prototypes: %IteratorPrototype%, %AsyncIteratorPrototype%,
//     the Array, Map, Set, String and RegExp String iterator prototypes,
//     %Generator%, %GeneratorPrototype%, %AsyncGenerator%,
//     %AsyncGeneratorPrototype% and, when present, the Iterator helper prototype;
//   - the namespaces JSON, Math and Reflect;
//   - from `bun:test`: test, describe, it, expect and the hooks (beforeAll,
//     beforeEach, afterAll, afterEach, and onTestFinished when present).
//
// Each root is frozen, and so is every function among its own property values
// and accessors (its methods), so `test.each = …` and
// `AsyncLocalStorage.prototype.run = …` throw a TypeError in strict code. The
// one exception is `Error.stackTraceLimit`, which stays writable (but not
// configurable) so tests and tools can still lengthen stack traces. The
// `globalThis` bindings of the hardened global constructors and of JSON, Math
// and Reflect become non-writable and non-configurable, so a test cannot swap
// in a replacement either. Every helper used here is captured at load.
//
// `Symbol.metadata` (AD-4, ESC-9.9-1): Bun 1.4.3 has none, and the runtime's
// polyfill cannot add it once `Symbol` is frozen. So, before freezing, when
// `Symbol` has no own `metadata`, it is defined as
// `Symbol.for('Symbol.metadata')`, non-writable and non-configurable, as the
// polyfill defines it: the key Bun attaches decorator metadata under. Code
// under the harness then sees the same `Symbol.metadata` as code outside it.
//
// Override taming, after SES: freezing a prototype would make every
// assignment of an inherited property name throw, so `this.name = …` in an
// Error subclass or `o.toString = …` would break. Before freezing, the
// writable data properties `constructor`, `name`, `message`, `toString`,
// `valueOf` and `toLocaleString` of each hardened prototype, and every
// writable data property of Object.prototype (`__proto__` is an accessor and
// is left alone), become accessors. The getter returns the original value; the
// setter throws a TypeError when the receiver is the prototype itself (or a
// primitive), and otherwise defines an own, writable, enumerable, configurable
// data property on the receiver, which is what assignment would have done
// before the freeze.
//
// This module imports nothing graded (AD-15 grader isolation).
import { AsyncLocalStorage } from "node:async_hooks";
import * as bunTest from "bun:test";

const TAMED_NAMES: readonly string[] = ["constructor", "name", "message", "toString", "valueOf", "toLocaleString"];
const BUN_TEST_NAMES: readonly string[] = ["test", "describe", "it", "expect", "beforeAll", "beforeEach", "afterAll", "afterEach", "onTestFinished"];

const { defineProperty, freeze, getOwnPropertyDescriptor, getPrototypeOf, isFrozen, preventExtensions } = Object;
const ownKeys = Reflect.ownKeys;
const symbolFor = Symbol.for;

type Root = object;

/** The global constructors hardened (when the runtime has them); their `globalThis` bindings are locked too. */
const GLOBAL_CONSTRUCTORS: readonly string[] = [
  "Object",
  "Function",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "BigInt",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
  "SuppressedError",
  "Promise",
  "RegExp",
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "ArrayBuffer",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Iterator",
];
/** The namespaces hardened; their `globalThis` bindings are locked too. */
const GLOBAL_NAMESPACES: readonly string[] = ["JSON", "Math", "Reflect"];

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/** The constructors whose function object and `prototype` are hardened. */
function constructors(): Root[] {
  const global = globalThis as Record<string, unknown>;
  const found: Root[] = [];
  for (const name of GLOBAL_CONSTRUCTORS) {
    const value = global[name];
    if (typeof value === "function") {
      found.push(value);
    }
  }
  found.push(getPrototypeOf(Uint8Array) as Root); // %TypedArray%
  found.push(AsyncLocalStorage);
  return found;
}

/** The iterator prototypes and the generator intrinsics, which no global names. */
function iteratorPrototypes(): Root[] {
  const arrayIterator = getPrototypeOf([][Symbol.iterator]()) as Root;
  const roots: Root[] = [
    getPrototypeOf(arrayIterator) as Root, // %IteratorPrototype%
    arrayIterator,
    getPrototypeOf(new Map()[Symbol.iterator]()) as Root,
    getPrototypeOf(new Set()[Symbol.iterator]()) as Root,
    getPrototypeOf(""[Symbol.iterator]()) as Root,
    getPrototypeOf("".matchAll(/(?:)/g)) as Root,
  ];
  const generator = getPrototypeOf(function* () {}) as Root; // %GeneratorFunction.prototype% (%Generator%)
  const asyncGenerator = getPrototypeOf(async function* () {}) as Root; // %AsyncGenerator%
  const asyncGeneratorPrototype = (asyncGenerator as { prototype: Root }).prototype;
  roots.push(generator, (generator as { prototype: Root }).prototype, asyncGenerator, asyncGeneratorPrototype, getPrototypeOf(asyncGeneratorPrototype) as Root);
  const iterator = (globalThis as Record<string, unknown>)["Iterator"] as { from?: (it: Iterable<unknown>) => { map?: (fn: (x: unknown) => unknown) => object } } | undefined;
  const helper = iterator?.from?.([]).map?.((x) => x);
  if (helper !== undefined) {
    roots.push(getPrototypeOf(helper) as Root);
  }
  return roots;
}

/** The `bun:test` functions a test could patch. */
function bunTestRoots(): Root[] {
  const exports = bunTest as unknown as Record<string, unknown>;
  return BUN_TEST_NAMES.map((name) => exports[name]).filter(isObjectLike);
}

/** Turns `object[key]`, when a writable data property, into an accessor whose setter shadows on other receivers. */
function tame(object: object, key: PropertyKey): void {
  const descriptor = getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor) || descriptor.writable !== true || descriptor.configurable !== true) {
    return;
  }
  const value: unknown = descriptor.value;
  const label = typeof key === "symbol" ? key.toString() : key;
  defineProperty(object, key, {
    get(): unknown {
      return value;
    },
    set(this: unknown, next: unknown): void {
      if (this === object) {
        throw new TypeError(`Cannot assign to read only property '${label}' of a hardened intrinsic (AD-15)`);
      }
      if (!isObjectLike(this)) {
        throw new TypeError(`Cannot assign to property '${label}' of a primitive (AD-15)`);
      }
      defineProperty(this, key, { value: next, writable: true, enumerable: true, configurable: true });
    },
    enumerable: descriptor.enumerable === true,
    configurable: false,
  });
}

/** Freezes `object`; for `Error`, `stackTraceLimit` stays writable. */
function freezeOne(object: object): void {
  if (object === Error) {
    for (const key of ownKeys(object)) {
      const descriptor = getOwnPropertyDescriptor(object, key);
      if (descriptor === undefined || descriptor.configurable !== true) {
        continue;
      }
      if (key === "stackTraceLimit" && "value" in descriptor) {
        defineProperty(object, key, { configurable: false });
      } else if ("value" in descriptor) {
        defineProperty(object, key, { configurable: false, writable: false });
      } else {
        defineProperty(object, key, { configurable: false });
      }
    }
    preventExtensions(object);
    return;
  }
  freeze(object);
}

let hardened = false;

/** Hardens the intrinsics (see the header); a second call does nothing. */
export function hardenIntrinsics(): void {
  if (hardened) {
    return;
  }
  // `Symbol.metadata`, before `Symbol` is frozen (see the header).
  if (getOwnPropertyDescriptor(Symbol, "metadata") === undefined) {
    defineProperty(Symbol, "metadata", { value: symbolFor("Symbol.metadata"), writable: false, enumerable: false, configurable: false });
  }
  const ctors = constructors();
  const prototypes: object[] = [];
  for (const ctor of ctors) {
    const prototype: unknown = (ctor as { prototype?: unknown }).prototype;
    if (isObjectLike(prototype)) {
      prototypes.push(prototype);
    }
  }
  prototypes.push(...iteratorPrototypes());
  const roots: object[] = [...ctors, ...prototypes, JSON, Math, Reflect, ...bunTestRoots()];

  // Override taming, before anything is frozen.
  for (const prototype of new Set(prototypes)) {
    const keys: readonly PropertyKey[] = prototype === Object.prototype ? ownKeys(prototype).filter((key) => key !== "__proto__") : TAMED_NAMES;
    for (const key of keys) {
      tame(prototype, key);
    }
  }

  // Each root and its methods (function-valued own properties and accessors).
  const targets = new Set<object>();
  for (const root of roots) {
    targets.add(root);
    for (const key of ownKeys(root)) {
      const descriptor = getOwnPropertyDescriptor(root, key);
      if (descriptor === undefined) {
        continue;
      }
      for (const member of [descriptor.value, Reflect.get(descriptor, "get"), Reflect.get(descriptor, "set")] as unknown[]) {
        if (typeof member === "function") {
          targets.add(member);
        }
      }
    }
  }
  for (const target of targets) {
    if (!isFrozen(target) || target === Error) {
      freezeOne(target);
    }
  }
  // The global bindings of the hardened constructors and namespaces, so `globalThis.JSON = {}` throws too.
  for (const name of [...GLOBAL_CONSTRUCTORS, ...GLOBAL_NAMESPACES]) {
    const descriptor = getOwnPropertyDescriptor(globalThis, name);
    if (descriptor !== undefined && "value" in descriptor && descriptor.configurable === true) {
      defineProperty(globalThis, name, { writable: false, configurable: false });
    }
  }
  hardened = true;
}
