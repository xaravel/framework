// Illuminate\Broadcasting\Channel, as a contract names it (AD-1.2): its public property and its `__toString`
// (AD-26: `toString()` plus `[Symbol.toPrimitive]`).
import type { Stringable } from "./Stringable";

/** A broadcast channel. */
export interface Channel extends Stringable {
  /** The channel's name. */
  readonly name: string;
}
