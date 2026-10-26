// PHP 8.6's `SortDirection` enum (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1), as
// symfony/polyfill-php86 v1.43.0 declares it for PHP 8.1 to 8.5 (`Resources/stubs/SortDirection.php`): a pure enum
// with the cases `Ascending` and `Descending`. An AD-26 enum: a class with one frozen instance per case, a `name`, and
// a static `cases()` in declaration order; no `backingType`, so a case is a `UnitEnum` and no `BackedEnum`, and
// `enumExists('SortDirection')` holds. `new SortDirection()` throws PHP's `Error`, as PHP refuses to instantiate an
// enum. Registered as `SortDirection`.
import { registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";

export class SortDirection {
  /** Whether a case is being built, which alone may call the constructor. */
  static #building = false;

  static readonly Ascending: SortDirection = SortDirection.#case("Ascending");
  static readonly Descending: SortDirection = SortDirection.#case("Descending");

  /** The case's name. */
  readonly name: string;

  /**
   * Private in effect, as an enum's is (only the cases are built): PHP refuses `new SortDirection()`, so a call from
   * outside throws PHP's `Error` `Cannot instantiate enum SortDirection`.
   */
  constructor(name: string) {
    if (!SortDirection.#building) {
      throw new PhpError("Cannot instantiate enum SortDirection");
    }
    this.name = name;
  }

  /** The cases, in declaration order. */
  static cases(): SortDirection[] {
    return [SortDirection.Ascending, SortDirection.Descending];
  }

  static #case(name: string): SortDirection {
    SortDirection.#building = true;
    try {
      return Object.freeze(new SortDirection(name));
    } finally {
      SortDirection.#building = false;
    }
  }
}

registerClass("SortDirection", SortDirection);
