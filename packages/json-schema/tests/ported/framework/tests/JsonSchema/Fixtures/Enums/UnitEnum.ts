// Ported from framework/tests/JsonSchema/Fixtures/Enums/UnitEnum.php (Laravel v13.37.0): a pure `enum UnitEnum`.
//
// An AD-26 pure enum: a class with one frozen instance per case and `cases()`, and no `backingType`, so it is no
// `BackedEnum`. `TypeTest`'s `setUp` registers it under `Illuminate\Tests\JsonSchema\Fixtures\Enums\UnitEnum`
// (`registerTestClass` needs a test frame), so `fqcn()` and a class-string lookup of that name resolve it inside a
// test. `enum(UnitEnum)` in `test_throws_with_unit_enum_class` reads the class itself, which needs no registration.
export class UnitEnum {
  static readonly One: UnitEnum = Object.freeze(new UnitEnum("One"));
  static readonly Two: UnitEnum = Object.freeze(new UnitEnum("Two"));

  constructor(readonly name: string) {}

  static cases(): UnitEnum[] {
    return [UnitEnum.One, UnitEnum.Two];
  }
}
