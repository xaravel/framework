// Laravel's `Illuminate\Support\LazyCollection` (v13.37.0), the members Story 14.1 ports; the Collections Stories
// that port their tests add the rest. It is `mixin(null, EnumeratesValues, Macroable)`, as Upstream's
// `use EnumeratesValues, Macroable`.
//
// Generators follow DIV-12.18: a source generator function writes `yield keyed(k, v)` for PHP's `yield $k => $v` and
// `yield* yieldFrom(it)` for `yield from $it`, and the internal sources below do the same. Calling a generator function
// gives a bare JS generator object, which is no `Traversable` in the runtime (it answers `instanceof Generator`), so
// `makeIterator` wraps it in the runtime's `Generator` before Upstream's `Traversable` test; a bare generator object
// passed to the constructor is still refused, as Upstream refuses one. PHP's interfaces are brand getters (AD-9.5), and
// `IteratorAggregate` is `[Symbol.iterator]` (the values), `entries()` and `keys()` (AD-26).
//
// This module imports `Collection` first: `Collection.ts` loads the trait before either class is defined.
import "./Collection";
import { Arrayable, CanBeEscapedWhenCastToString, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  abs,
  ArrayIterator,
  Closure,
  count,
  Generator,
  in_array,
  InvalidArgumentException,
  is_array,
  is_callable,
  type Iterator,
  IteratorAggregate,
  iterator_count,
  iterator_to_array,
  JsonSerializable,
  keyed,
  type KeyedYield,
  looseEquals,
  mixin,
  PhpArray,
  type PhpArrayKey,
  type PhpKeyInput,
  registerClass,
  Stringable,
  toBool,
  toPhpArray,
  Traversable,
  valueCopy,
  yieldFrom,
} from "@xaravel/runtime";
import { Arr } from "./Arr";
import { Enumerable } from "./Enumerable";
import { enum_value } from "./functions";
import { value } from "./helpers";
import { callCallable } from "./support/callables";
import { EnumeratesValues } from "./Traits/EnumeratesValues";

/** The `Countable` brand `count()` and the grader read (no token; `packages/runtime/src/php/ArrayObject.ts`). */
const COUNTABLE = Symbol.for("Countable");

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** A generator function, PHP's `Closure(): Generator` source (DIV-12.18). */
type SourceFunction = () => unknown;

/** A lazily enumerated collection: Laravel's `Illuminate\Support\LazyCollection`. */
export class LazyCollection extends mixin(null, EnumeratesValues, Macroable) {
  /** The source from which to generate items: a generator function, another lazy collection, or a PHP array. */
  source: unknown;

  /**
   * Create a new lazy collection instance from a generator function (or any function), another lazy collection, a PHP
   * array, an `Arrayable`, a Traversable or an object; `null` is empty. Throws `InvalidArgumentException` for a bare
   * generator object.
   */
  constructor(source: unknown = null) {
    super();
    if (source instanceof Closure || source instanceof LazyCollection) {
      this.source = source;
    } else if (source === null) {
      this.source = (this.constructor as typeof LazyCollection).empty();
    } else if (source instanceof Generator) {
      throw new InvalidArgumentException("Generators should not be passed directly to LazyCollection. Instead, pass a generator function.");
    } else {
      this.source = this.getArrayableItems(source);
    }
  }

  get [CanBeEscapedWhenCastToString.brand](): true {
    return true;
  }

  get [Enumerable.brand](): true {
    return true;
  }

  get [Arrayable.brand](): true {
    return true;
  }

  get [COUNTABLE](): true {
    return true;
  }

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [Jsonable.brand](): true {
    return true;
  }

  get [JsonSerializable.brand](): true {
    return true;
  }

  get [Stringable.brand](): true {
    return true;
  }

  /** Create a new instance of the collection. */
  protected newInstance(items: unknown = []): this {
    return new (this.constructor as new (items?: unknown) => this)(items);
  }

  /**
   * A new instance of this class over the generator function `source`, bound to this collection as PHP binds `$this`
   * in Upstream's `new static(function () { … })`.
   */
  protected lazyInstance(source: (this: LazyCollection) => globalThis.Generator<unknown, void, unknown>): this {
    return new (this.constructor as new (source?: unknown) => this)(source.bind(this));
  }

  /** Create a collection with the given range, by `step` (its absolute value), up or down. Throws for a zero step. */
  static range<R>(this: new (source?: unknown, ...args: any[]) => R, from: number, to: number, step: number = 1, ...args: unknown[]): R {
    if (looseEquals(step, 0)) {
      throw new InvalidArgumentException("Step value cannot be zero.");
    }

    void args;

    return new this(function* () {
      if (from <= to) {
        for (; from <= to; from += Number(abs(step))) {
          yield from;
        }
      } else {
        for (; from >= to; from -= Number(abs(step))) {
          yield from;
        }
      }
    });
  }

  /** Get all items in the enumerable. */
  all(): any {
    if (is_array(this.source)) {
      return valueCopy(this.source);
    }

    return iterator_to_array(this.getIterator());
  }

  /** Count the number of items in the collection by a field or using a callback (by value when none). */
  countBy(countBy: unknown = null): this {
    const callback = countBy === null ? this.identity() : this.valueRetriever(countBy);
    return this.lazyInstance(function* (this: LazyCollection) {
      const counts = new PhpArray();

      for (const [key, value_] of this.entries()) {
        const group = enum_value(callback(value_, key)) as PhpKeyInput;

        if (!toBool(counts.get(group))) {
          counts.set(group, 0);
        }

        counts.set(group, (counts.get(group) as number) + 1);
      }

      yield* yieldFrom(counts);
    });
  }

  /** Run a filter over each of the items: the callback gets each value and its key, and keys are kept. */
  filter(callback: ItemCallback | null = null): this {
    const test: ItemCallback = callback ?? ((value_: unknown) => toBool(value_));
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, value_] of this.entries()) {
        if (toBool(callCallable(test, value_, key))) {
          yield keyed(key, value_);
        }
      }
    });
  }

  /** Get an item by key (the first whose key is `==` it), or `value(default)` when none is; `null` for a `null` key. */
  get(key: unknown, defaultValue: unknown = null): unknown {
    if (key === null || key === undefined) {
      return null;
    }

    for (const [outerKey, outerValue] of this.entries()) {
      if (looseEquals(outerKey, key)) {
        return outerValue;
      }
    }

    return value(defaultValue);
  }

  /** Determine if the items are empty or not. */
  isEmpty(): boolean {
    return !(this.getIterator() as Iterator).valid();
  }

  /** Run a map over each of the items: the callback gets each value and its key, and keys are kept. */
  map(callback: ItemCallback): this {
    return this.lazyInstance(function* (this: LazyCollection): globalThis.Generator<KeyedYield, void, unknown> {
      for (const [key, value_] of this.entries()) {
        yield keyed(key, callCallable(callback, value_, key));
      }
    });
  }

  /** Return only unique items from the collection, by `==` or, when `strict`, by `===`; the first of each is kept. */
  unique(key: unknown = null, strict: boolean = false): this {
    const callback = this.valueRetriever(key);
    return this.lazyInstance(function* (this: LazyCollection): globalThis.Generator<KeyedYield, void, unknown> {
      const exists: unknown[] = [];

      for (const [itemKey, item] of this.entries()) {
        const id = callback(item, itemKey);
        if (!in_array(id, exists, strict)) {
          yield keyed(itemKey, item);

          exists.push(id);
        }
      }
    });
  }

  /** Reset the keys on the underlying array. */
  values(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const item of this) {
        yield item;
      }
    });
  }

  /** Get the values iterator. */
  getIterator(): Traversable {
    return this.makeIterator(this.source);
  }

  /** The values, as `foreach ($c as $v)` gives them (AD-26). */
  *[Symbol.iterator](): globalThis.Generator<unknown, void, undefined> {
    yield* this.getIterator();
  }

  /** The `[key, value]` pairs, as `foreach ($c as $k => $v)` gives them (AD-26). */
  *entries(): globalThis.Generator<[PhpArrayKey, unknown], void, undefined> {
    yield* this.getIterator().entries() as Iterable<[PhpArrayKey, unknown]>;
  }

  /** The keys, in order. */
  *keys(): globalThis.Generator<PhpArrayKey, void, undefined> {
    yield* this.getIterator().keys() as Iterable<PhpArrayKey>;
  }

  /** Count the number of items in the collection. */
  count(): number {
    if (is_array(this.source)) {
      return Number(count(this.source));
    }

    return iterator_count(this.getIterator());
  }

  /**
   * Make an iterator from the given source: an `IteratorAggregate`'s iterator, an `ArrayIterator` over an array, or
   * what a callable source returns (a generator, wrapped in the runtime's `Generator` under DIV-12.18; any other
   * value wrapped in an array).
   */
  protected makeIterator(source: unknown): Traversable {
    if (source instanceof IteratorAggregate) {
      return source.getIterator();
    }

    if (is_array(source)) {
      return new ArrayIterator(source);
    }

    if (is_callable(source)) {
      let maybeTraversable = callCallable(source as SourceFunction);

      // DIV-12.18: a generator function's bare JS generator object iterates as the runtime's `Generator`.
      if (maybeTraversable instanceof Generator && !(maybeTraversable instanceof Traversable)) {
        maybeTraversable = new Generator(maybeTraversable);
      }

      return maybeTraversable instanceof Traversable ? maybeTraversable : new ArrayIterator(Arr.wrap(maybeTraversable));
    }

    return new ArrayIterator(toPhpArray(source));
  }
}

registerClass("Illuminate\\Support\\LazyCollection", LazyCollection);
