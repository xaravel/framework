// PHP's built-in `UnitEnum` interface: every enum case has a `name` (AD-26: enums are classes with static instances).

/** PHP's `UnitEnum`: an enum case. */
export interface UnitEnum {
  /** The case's name. */
  readonly name: string;
}
