// PHP's `BackedEnum` interface as a contract token (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9), built by `phpInterface`, with `UnitEnum` as its parent. `x instanceof BackedEnum` is true for a case of
// an AD-26 enum whose class declares `static backingType` `'string'` or `'int'`; an enum case carries no brand, so
// `hasBrand(case, BackedEnum)` stays false. Its members are PHP's `from` and `tryFrom`.
import { isBackedEnumClass, isEnumCase } from "./classExistence";
import { phpInterface } from "./phpInterface";
import { UnitEnum } from "./UnitEnum";

declare const BackedEnumBrand: unique symbol;

/** PHP's `BackedEnum`: a case of a backed AD-26 enum, which has a `name` and a `value`. */
export interface BackedEnum extends UnitEnum {
  readonly value: string | number;
}

/** Whether `value` is a case of a backed AD-26 enum. */
function isBackedEnumCase(value: unknown): boolean {
  return isEnumCase(value) && isBackedEnumClass(Reflect.get(Object.getPrototypeOf(value) as object, "constructor"));
}

export const BackedEnum = phpInterface<BackedEnum, typeof BackedEnumBrand>("BackedEnum", { from: ["value"], tryFrom: ["value"] }, [UnitEnum], [], isBackedEnumCase);
