// PHP's `Traversable` interface as a contract token (ESC-14.1-2), built by `phpInterface`. A Traversable iterates as a
// JS Map does (decisions/MAINT-2026-10-25-story-14-1.md, "How a Traversable iterates"): `[Symbol.iterator]()` yields
// its values, `entries()` its `[key, value]` pairs and `keys()` its keys. So `foreach ($c as $v)` is
// `for (const v of c)` and `foreach ($c as $k => $v)` is `for (const [k, v] of c.entries())`. `PhpArray`, the
// low-level PHP array, is no Traversable and keeps its `[key, value]` iterator.
import { phpInterface } from "./phpInterface";

declare const TraversableBrand: unique symbol;

/** PHP's `Traversable`: its values by `[Symbol.iterator]()`, its pairs by `entries()`, its keys by `keys()`. */
export interface Traversable extends Iterable<unknown> {
  readonly [Traversable.brand]: true;
  entries(): Iterable<[unknown, unknown]>;
  keys(): Iterable<unknown>;
}

export const Traversable = phpInterface<Traversable, typeof TraversableBrand>("Traversable");
