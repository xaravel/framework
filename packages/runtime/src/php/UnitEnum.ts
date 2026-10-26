// PHP's `UnitEnum` interface as a contract token (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9), built by `phpInterface`. An AD-26 enum case carries no brand, so `x instanceof UnitEnum` is the
// enum-case test instead: an object whose class has a static `cases` function. `hasBrand(case, UnitEnum)` therefore
// stays false. Its member is PHP's `cases`.
import { isEnumCase } from "./classExistence";
import { phpInterface } from "./phpInterface";

declare const UnitEnumBrand: unique symbol;

/** PHP's `UnitEnum`: a case of an AD-26 enum, which has a `name`. */
export interface UnitEnum {
  readonly name: string;
}

export const UnitEnum = phpInterface<UnitEnum, typeof UnitEnumBrand>("UnitEnum", { cases: [] }, [], [], isEnumCase);
