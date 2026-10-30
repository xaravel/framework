// PHP's `Generator` (ESC-14.1-5, DIV-12.18; action item epic-14-item-2-runtime-generators-functions), a port of
// `Zend/zend_generators.c` and the `ZEND_YIELD` / `ZEND_YIELD_FROM` handlers of PHP 8.5.11. It wraps a JS generator
// object, which is what a ported generator function returns, and gives it PHP's protocol:
//
// - keys: a `yield v` gets PHP's automatic key (`largest_used_integer_key`, which starts at -1, rises with every
//   keyed int greater than it, and wraps past `PHP_INT_MAX`); a `yield keyed(k, v)` keeps `k`; a pair `yieldFrom`
//   delegates keeps its source's key and never moves the counter;
// - `current`, `key`, `valid`, `next` and `getReturn` first run a fresh generator to its first yield; `next()`
//   resumes it with null and `send(v)` with `v` (a fresh one runs to its first yield first, as JS ignores the first
//   `next` argument); `rewind()` throws once the generator is past its first yield; a closed generator refuses
//   traversal, and `getReturn()` refuses until it returns;
// - `yieldFrom(source)` delegates to an array, a Traversable or another `Generator`, passing `send` and `next` on to
//   that generator, and gives the inner generator's return value (null for an array or a Traversable).
//
// `x instanceof Generator` is also true for a bare JS generator object (action item
// epic-14-item-3-runtime-type-tests-functions, ESC-14.1-9), as PHP sees one, and so are `x instanceof Iterator` and
// `x instanceof Traversable` (action item epic-14-retro-item-5-traversable-js-generator); `isGeneratorObject` is the
// wrapper-class test the runtime's own sites use. The wrapper carries the `Iterator` and `Traversable` brands; `[Symbol.iterator]()`, `entries()` and `keys()` run PHP's
// `foreach` protocol and refuse a closed generator when called. `phpSerialize` and `phpUnserialize` refuse it with
// PHP's `Exception`. Not ported: `Generator::throw`, and a JS generator advanced before it is wrapped (its earlier
// yields are not seen). It is registered as `Generator`, and is not in `Symbol.for('xaravel.php.classes')`. It and
// `traverse.ts` import each other; every cross-use happens at call time, never at load.
import { registerClass } from "../registry/registry";
import { arrayEntries } from "./casts";
import { Error as PhpError } from "./Error";
import { Exception } from "./Exception";
import { Iterator } from "./Iterator";
import { isJsGenerator, type JsGenerator } from "./jsGenerator";
import { delegated, isDelegated, KeyedYield } from "./keyed";
import { foreachIterator, foreachKeys, foreachValues, TRAVERSAL_EXIT } from "./liveCursor";
import { INT_MAX, INT_MIN, intKey } from "./phpInt";
import { phpType } from "./phpType";
import { isTraversable, iteratorOf } from "./traverse";
import { Traversable } from "./Traversable";

export { isJsGenerator };

/** The int value of a PHP int key, or null for any other key. */
function intOf(key: unknown): bigint | null {
  if (typeof key === "number") {
    return Number.isSafeInteger(key) && !Object.is(key, -0) ? BigInt(key) : null;
  }
  if (typeof key === "bigint") {
    return key >= INT_MIN && key <= INT_MAX ? key : null;
  }
  return null;
}

/** What `yieldFrom` reads of a delegate. */
interface DelegateState {
  readonly started: boolean;
  readonly finished: boolean;
  readonly running: boolean;
  readonly returned: boolean;
  readonly value: unknown;
}

let stateOf: (generator: Generator) => DelegateState;
let start: (generator: Generator) => void;
let traversal: (generator: Generator) => Generator;

export class Generator implements Iterator {
  /**
   * `x instanceof Generator`: an instance of the wrapper class (or, for a subclass, of that subclass), or, for
   * `Generator` itself, a bare JS generator object.
   */
  static [Symbol.hasInstance](value: unknown): value is Generator | JsGenerator {
    return Function.prototype[Symbol.hasInstance].call(this, value) || (this === Generator && isJsGenerator(value));
  }

  readonly #js: JsGenerator;
  #owned = false;
  /** The generator has yielded (PHP's `value` is defined). */
  #started = false;
  /** The generator returned or threw (PHP's `execute_data` is null). */
  #finished = false;
  #running = false;
  /** `ZEND_GENERATOR_AT_FIRST_YIELD`. */
  #atFirstYield = false;
  #current: unknown = null;
  #key: unknown = null;
  #returned = false;
  #return: unknown = null;
  /** `largest_used_integer_key`. */
  #largest = -1n;

  static {
    stateOf = (generator) => ({
      started: generator.#started,
      finished: generator.#finished,
      running: generator.#running,
      returned: generator.#returned,
      value: generator.#return,
    });
    start = (generator) => generator.#resume(null);
    traversal = (generator) => generator.#traversable();
  }

  /**
   * `Generator` over the JS generator object `generator`. Throws PHP's `Error` for anything else, as PHP refuses
   * `new Generator()`.
   */
  constructor(...args: unknown[]) {
    const generator = args[0];
    if (!isJsGenerator(generator)) {
      throw new PhpError('The "Generator" class is reserved for internal use and cannot be manually instantiated');
    }
    this.#js = generator;
  }

  /** Wrap a framework-created temporary. Early traversal exit runs finally without advancing later source. */
  static owned(generator: JsGenerator): Generator {
    const wrapper = new Generator(generator);
    wrapper.#owned = true;
    return wrapper;
  }

  /** Internal foreach exit hook. User-held generators remain resumable. */
  [TRAVERSAL_EXIT](): void {
    if (!this.#owned || this.#finished) return;
    try {
      const step = this.#js.return(null);
      if (step.done !== true) throw new PhpError("Cannot yield from finally in a force-closed generator");
    } finally {
      this.#close();
    }
  }

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  /** The current value, or null once closed. */
  current(): unknown {
    this.#ensureInitialized();
    return this.#finished ? null : this.#current;
  }

  /** The current key, or null once closed. */
  key(): unknown {
    this.#ensureInitialized();
    return this.#finished ? null : this.#key;
  }

  /** Resumes the generator, the current `yield` giving null. */
  next(): void {
    this.#ensureInitialized();
    this.#resume(null);
  }

  /** Whether the generator is not closed. */
  valid(): boolean {
    this.#ensureInitialized();
    return !this.#finished;
  }

  /** Resumes the generator, the current `yield` giving `value`; the new current value, or null once closed. */
  send(value: unknown): unknown {
    this.#ensureInitialized();
    if (this.#finished) {
      return null;
    }
    this.#resume(value ?? null);
    return this.#finished ? null : this.#current;
  }

  /** Runs a fresh generator to its first yield; throws PHP's `Exception` once it is past it. */
  rewind(): void {
    this.#ensureInitialized();
    if (!this.#atFirstYield) {
      throw new Exception("Cannot rewind a generator that was already run");
    }
  }

  /** The generator's return value; throws PHP's `Exception` until it has returned. */
  getReturn(): unknown {
    this.#ensureInitialized();
    if (!this.#returned) {
      throw new Exception("Cannot get return value of a generator that hasn't returned");
    }
    return this.#return;
  }

  /** PHP refuses to serialize a Generator. */
  __serialize(): never {
    throw new Exception("Serialization of 'Generator' is not allowed");
  }

  /** PHP refuses to unserialize a Generator. */
  __unserialize(_data: unknown): never {
    throw new Exception("Unserialization of 'Generator' is not allowed");
  }

  /** The values, by PHP's `foreach` protocol; throws PHP's `Exception` for a closed generator. */
  [Symbol.iterator](): globalThis.Generator<unknown, void, undefined> {
    return foreachValues(this.#traversable());
  }

  /** The `[key, value]` pairs, by PHP's `foreach` protocol; throws PHP's `Exception` for a closed generator. */
  entries(): globalThis.Generator<[unknown, unknown], void, undefined> {
    return foreachIterator(this.#traversable());
  }

  /** The keys, by PHP's `foreach` protocol; throws PHP's `Exception` for a closed generator. */
  keys(): globalThis.Generator<unknown, void, undefined> {
    return foreachKeys(this.#traversable());
  }

  /** `zend_generator_get_iterator`: a closed generator cannot be traversed. */
  #traversable(): this {
    if (this.#finished) {
      throw new Exception("Cannot traverse an already closed generator");
    }
    return this;
  }

  /** `zend_generator_ensure_initialized`. */
  #ensureInitialized(): void {
    if (!this.#started && !this.#finished) {
      this.#resume(null);
      this.#atFirstYield = true;
    }
  }

  /** `zend_generator_resume`: runs the JS generator to its next yield, return or throw. */
  #resume(sent: unknown): void {
    if (this.#finished) {
      return;
    }
    if (this.#running) {
      throw new PhpError("Cannot resume an already running generator");
    }
    this.#atFirstYield = false;
    this.#running = true;
    let step: IteratorResult<unknown, unknown>;
    try {
      step = this.#js.next(sent);
    } catch (error) {
      this.#running = false;
      this.#close();
      throw error;
    }
    this.#running = false;
    if (step.done === true) {
      this.#close();
      this.#returned = true;
      this.#return = step.value ?? null;
      return;
    }
    this.#started = true;
    this.#record(step.value);
  }

  #close(): void {
    this.#finished = true;
    this.#current = null;
    this.#key = null;
  }

  /** `ZEND_YIELD`: the yielded value and its key. */
  #record(yielded: unknown): void {
    if (yielded instanceof KeyedYield) {
      const int = intOf(yielded.key);
      this.#key = int === null ? yielded.key : intKey(int);
      this.#current = yielded.value;
      if (int !== null && !isDelegated(yielded) && int > this.#largest) {
        this.#largest = int;
      }
      return;
    }
    this.#largest = this.#largest === INT_MAX ? INT_MIN : this.#largest + 1n;
    this.#key = intKey(this.#largest);
    this.#current = yielded ?? null;
  }
}

/** Whether `value` is an instance of the `Generator` wrapper class itself, a bare JS generator object not counted. Internal. */
export function isGeneratorObject(value: unknown): value is Generator {
  return Function.prototype[Symbol.hasInstance].call(Generator, value);
}

/** `generator` checked for traversal (`zend_generator_get_iterator`): throws PHP's `Exception` once closed. Internal. */
export function generatorTraversal(generator: Generator): Generator {
  return traversal(generator);
}

/** `ZEND_YIELD_FROM` over a `Generator`, then each pair it gives (`zend_generator_resume` through a delegate). */
function* delegateTo(inner: Generator): globalThis.Generator<KeyedYield, unknown, unknown> {
  const state = stateOf(inner);
  if (state.finished) {
    throw new PhpError("Generator passed to yield from was aborted without proper return and is unable to continue");
  }
  if (state.running) {
    throw new PhpError("Impossible to yield from the Generator being currently run");
  }
  // ZEND_GENERATOR_DO_INIT: a fresh delegate runs to its first yield; a started one is not advanced.
  if (!state.started) {
    start(inner);
  }
  try {
    while (!stateOf(inner).finished) {
      const sent: unknown = yield delegated(inner.key(), inner.current());
      inner.send(sent ?? null);
    }
  } finally {
    inner[TRAVERSAL_EXIT]();
  }
  const end = stateOf(inner);
  return end.returned ? end.value : null;
}

/**
 * PHP's `yield from $source` (DIV-12.18), written `yield* yieldFrom(source)`: each `[key, value]` of an array, a
 * Traversable (an `Iterator` by its five methods, an `IteratorAggregate` through `getIterator()`) or a `Generator` (a
 * bare JS generator object is wrapped in one), keeping the source's keys. `send` and `next` reach a delegated
 * `Generator`. The result is that generator's return value, or null for an array or a Traversable. Throws PHP's
 * `Error` for any other value (`Can use "yield from" only with arrays and Traversables`), for a closed generator and
 * for a generator being run.
 */
export function* yieldFrom(source: unknown): globalThis.Generator<KeyedYield, unknown, unknown> {
  const from = isJsGenerator(source) ? new Generator(source) : source;
  if (isGeneratorObject(from)) {
    return yield* delegateTo(from);
  }
  if (typeof from === "object" && from !== null && phpType(from) === "array") {
    for (const [key, value] of arrayEntries(from)) {
      yield delegated(key, value);
    }
    return null;
  }
  if (isTraversable(from)) {
    for (const [key, value] of foreachIterator(iteratorOf(from))) {
      yield delegated(key, value);
    }
    return null;
  }
  throw new PhpError('Can use "yield from" only with arrays and Traversables');
}

registerClass("Generator", Generator);
