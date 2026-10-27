// PHP 8.4's `RoundingMode` enum (action item epic-14-item-8-runtime-round-string-array-pointer, ESC-14.3-1), as
// PHP 8.5.11 declares it (`ext/standard/math.stub.php`): a pure enum with the cases `HalfAwayFromZero`,
// `HalfTowardsZero`, `HalfEven`, `HalfOdd`, `TowardsZero`, `AwayFromZero`, `NegativeInfinity` and `PositiveInfinity`,
// in that order. An AD-26 enum, built as `SortDirection` is: a class with one frozen instance per case, a `name`, and
// a static `cases()` in declaration order; no `backingType`, so a case is a `UnitEnum` and no `BackedEnum`.
// `new RoundingMode()` throws PHP's `Error`, as PHP refuses to instantiate an enum. `round` takes a case as its
// `mode`. Registered as `RoundingMode`.
import { registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";

export class RoundingMode {
  /** Whether a case is being built, which alone may call the constructor. */
  static #building = false;

  static readonly HalfAwayFromZero: RoundingMode = RoundingMode.#case("HalfAwayFromZero");
  static readonly HalfTowardsZero: RoundingMode = RoundingMode.#case("HalfTowardsZero");
  static readonly HalfEven: RoundingMode = RoundingMode.#case("HalfEven");
  static readonly HalfOdd: RoundingMode = RoundingMode.#case("HalfOdd");
  static readonly TowardsZero: RoundingMode = RoundingMode.#case("TowardsZero");
  static readonly AwayFromZero: RoundingMode = RoundingMode.#case("AwayFromZero");
  static readonly NegativeInfinity: RoundingMode = RoundingMode.#case("NegativeInfinity");
  static readonly PositiveInfinity: RoundingMode = RoundingMode.#case("PositiveInfinity");

  /** The case's name. */
  readonly name: string;

  /**
   * Private in effect, as an enum's is (only the cases are built): PHP refuses `new RoundingMode()`, so a call from
   * outside throws PHP's `Error` `Cannot instantiate enum RoundingMode`.
   */
  constructor(name: string) {
    if (!RoundingMode.#building) {
      throw new PhpError("Cannot instantiate enum RoundingMode");
    }
    this.name = name;
  }

  /** The cases, in declaration order. */
  static cases(): RoundingMode[] {
    return [
      RoundingMode.HalfAwayFromZero,
      RoundingMode.HalfTowardsZero,
      RoundingMode.HalfEven,
      RoundingMode.HalfOdd,
      RoundingMode.TowardsZero,
      RoundingMode.AwayFromZero,
      RoundingMode.NegativeInfinity,
      RoundingMode.PositiveInfinity,
    ];
  }

  static #case(name: string): RoundingMode {
    RoundingMode.#building = true;
    try {
      return Object.freeze(new RoundingMode(name));
    } finally {
      RoundingMode.#building = false;
    }
  }
}

registerClass("RoundingMode", RoundingMode);
