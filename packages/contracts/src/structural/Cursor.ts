// Illuminate\Pagination\Cursor, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";

/** A pagination cursor. */
export interface Cursor {
  /** Get the given parameter from the cursor. */
  parameter(parameterName: string): string | null;

  /** Get the given parameters from the cursor. */
  parameters(parameterNames: PhpArrayLike): PhpArrayLike;

  /** Determine whether the cursor points to the next set of items. */
  pointsToNextItems(): boolean;

  /** Determine whether the cursor points to the previous set of items. */
  pointsToPreviousItems(): boolean;

  /** Get the array representation of the cursor. */
  toArray(): PhpArrayLike;

  /** Get the encoded string representation of the cursor to construct a URL. */
  encode(): string;
}
