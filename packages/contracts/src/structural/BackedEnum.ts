// PHP's built-in `BackedEnum` interface: an enum case with a scalar value (AD-26: enums are classes with static
// instances).
import type { UnitEnum } from "./UnitEnum";

/** PHP's `BackedEnum`: an enum case backed by a string or an int. */
export interface BackedEnum extends UnitEnum {
  /** The case's backing value. */
  readonly value: string | number;
}
