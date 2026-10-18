// sebastian/comparator 8.4.0's `Factory` (Story 4.3): the default comparators,
// in its order. The DateTime, DateInterval, DOMNode, SplObjectStorage,
// Enumeration, MockObject and Number comparators are not ported
// (ESC-4.3-1 item 4).
import { ArrayComparator } from "./ArrayComparator";
import { ClosureComparator } from "./ClosureComparator";
import type { Comparator } from "./Comparator";
import { ExceptionComparator } from "./ExceptionComparator";
import { NumericComparator } from "./NumericComparator";
import { ObjectComparator } from "./ObjectComparator";
import { ResourceComparator } from "./ResourceComparator";
import { ScalarComparator } from "./ScalarComparator";
import { TypeComparator } from "./TypeComparator";

export class Factory {
  static #instance: Factory | null = null;

  static getInstance(): Factory {
    Factory.#instance ??= new Factory();
    return Factory.#instance;
  }

  readonly #comparators: Comparator[] = [];

  constructor() {
    for (const comparator of [
      new ClosureComparator(),
      new ExceptionComparator(),
      new ObjectComparator(),
      new ResourceComparator(),
      new ArrayComparator(),
      new NumericComparator(),
      new ScalarComparator(),
      new TypeComparator(),
    ]) {
      comparator.setFactory(this);
      this.#comparators.push(comparator);
    }
  }

  getComparatorFor(expected: unknown, actual: unknown): Comparator {
    for (const comparator of this.#comparators) {
      if (comparator.accepts(expected, actual)) {
        return comparator;
      }
    }
    throw new Error("No suitable Comparator implementation found");
  }
}
