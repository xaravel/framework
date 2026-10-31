// Ported from framework/tests/JsonSchema/Fixtures/Enums/StringBackedEnum.php (Laravel v13.37.0): `enum
// StringBackedEnum: string`.
//
// An AD-26 backed enum: a class with one frozen instance per case, `static backingType`, `cases()`, `from()` and
// `tryFrom()`. `TypeTest`'s `setUp` registers it under `Illuminate\Tests\JsonSchema\Fixtures\Enums\StringBackedEnum`
// (`registerTestClass` needs a test frame), so `fqcn()` and a class-string lookup of that name resolve it inside a
// test. `enum(StringBackedEnum)` in TypeTest's dataset rows runs at module load, before `setUp`, and reads the class itself, so
// it needs no registration.
import { fqcn, ValueError } from "@xaravel/runtime";

export class StringBackedEnum {
  static readonly backingType = "string";
  static readonly One: StringBackedEnum = Object.freeze(new StringBackedEnum("One", "one"));
  static readonly Two: StringBackedEnum = Object.freeze(new StringBackedEnum("Two", "two"));

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): StringBackedEnum[] {
    return [StringBackedEnum.One, StringBackedEnum.Two];
  }

  static from(value: string): StringBackedEnum {
    const found = StringBackedEnum.tryFrom(value);
    if (found === null) {
      throw new ValueError(`"${value}" is not a valid backing value for enum ${fqcn(StringBackedEnum)}`);
    }
    return found;
  }

  static tryFrom(value: string): StringBackedEnum | null {
    return StringBackedEnum.cases().find((item) => item.value === value) ?? null;
  }
}
