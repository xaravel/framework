// PHP's `Iterator` interface as a contract token (ESC-14.1-2), built by `phpInterface`, extending `Traversable`. A
// class carrying its brand also carries `Traversable`'s, and its `[Symbol.iterator]()`, `entries()` and `keys()` run
// PHP's `foreach` protocol over the five methods (`rewind`, then `valid` / `current` / `key` / `next`), yielding the
// values, the `[key, value]` pairs and the keys. `x instanceof Iterator` reads the brand, or is true for a bare JS
// generator object (DIV-12.18), as PHP's `Generator` implements `Iterator` (action item
// epic-14-retro-item-5-traversable-js-generator); such an object carries no brand and has none of the five methods,
// so the runtime reads it through its `Generator` wrapper.
import { isJsGenerator } from "./jsGenerator";
import { phpInterface } from "./phpInterface";
import { Traversable } from "./Traversable";

declare const IteratorBrand: unique symbol;

/** PHP's `Iterator`. */
export interface Iterator extends Traversable {
  readonly [Iterator.brand]: true;
  current(): unknown;
  key(): unknown;
  next(): void;
  rewind(): void;
  valid(): boolean;
}

const BRAND = Symbol.for("Iterator");

/** The brand, as every other token reads it, or a bare JS generator object. */
function isIteratorInstance(value: unknown): boolean {
  return (((typeof value === "object" && value !== null) || typeof value === "function") && (value as Record<symbol, unknown>)[BRAND] === true) || isJsGenerator(value);
}

export const Iterator = phpInterface<Iterator, typeof IteratorBrand>("Iterator", { current: [], key: [], next: [], rewind: [], valid: [] }, [Traversable], [], isIteratorInstance);
