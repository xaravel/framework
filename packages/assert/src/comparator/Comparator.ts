// sebastian/comparator 8.4.0's `Comparator` (Story 4.3): one kind of value pair
// the Factory hands to `assertEquals`, which throws ComparisonFailure when the
// pair is not equal. Internal to the grader.
import type { Factory } from "./Factory";

/** The pairs of objects already being compared, which ObjectComparator skips (cyclic graphs). */
export type Processed = [unknown, unknown][];

export abstract class Comparator {
  #factory: Factory | null = null;

  setFactory(factory: Factory): void {
    this.#factory = factory;
  }

  protected factory(): Factory {
    if (this.#factory === null) {
      throw new Error("comparator used without a Factory");
    }
    return this.#factory;
  }

  abstract accepts(expected: unknown, actual: unknown): boolean;

  abstract assertEquals(expected: unknown, actual: unknown, delta?: number, canonicalize?: boolean, ignoreCase?: boolean, processed?: Processed): void;
}
