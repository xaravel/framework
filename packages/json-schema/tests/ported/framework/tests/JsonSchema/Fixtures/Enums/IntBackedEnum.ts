// Ported from framework/tests/JsonSchema/Fixtures/Enums/IntBackedEnum.php (Laravel v13.37.0): `enum IntBackedEnum: int`.
//
// An AD-26 backed enum: a class with one frozen instance per case, `static backingType`, `cases()`, `from()` and
// `tryFrom()`. `TypeTest`'s `setUp` registers it under `Illuminate\Tests\JsonSchema\Fixtures\Enums\IntBackedEnum`
// (`registerTestClass` needs a test frame), so `fqcn()` and a class-string lookup of that name resolve it inside a
// test. `enum(IntBackedEnum)` in TypeTest's dataset rows runs at module load, before `setUp`, and reads the class itself, so
// it needs no registration.
import { fqcn, ValueError } from "@xaravel/runtime";

export class IntBackedEnum {
  static readonly backingType = "int";
  static readonly One: IntBackedEnum = Object.freeze(new IntBackedEnum("One", 1));
  static readonly Two: IntBackedEnum = Object.freeze(new IntBackedEnum("Two", 2));

  constructor(
    readonly name: string,
    readonly value: number,
  ) {}

  static cases(): IntBackedEnum[] {
    return [IntBackedEnum.One, IntBackedEnum.Two];
  }

  static from(value: number): IntBackedEnum {
    const found = IntBackedEnum.tryFrom(value);
    if (found === null) {
      throw new ValueError(`${value} is not a valid backing value for enum ${fqcn(IntBackedEnum)}`);
    }
    return found;
  }

  static tryFrom(value: number): IntBackedEnum | null {
    return IntBackedEnum.cases().find((item) => item.value === value) ?? null;
  }
}
