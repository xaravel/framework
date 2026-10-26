// Ported from framework/tests/Support/Fixtures/Enums.php (Laravel v13.37.0), Story 14.1.
//
// Each enum is a class with static instances, `cases()`, and, when backed, `static backingType`, `from()` and
// `tryFrom()` (AD-26 Backed / pure enums row). The classes are registered under
// `Illuminate\Tests\Support\Fixtures\<Name>` by the test case's `setUp` (`registerTestClass` needs a test frame).
import { fqcn, ValueError } from "@xaravel/runtime";

export class TestEnum {
  static readonly A = new TestEnum("A");

  constructor(readonly name: string) {}

  static cases(): TestEnum[] {
    return [TestEnum.A];
  }
}

export class TestBackedEnum {
  static readonly backingType = "int";
  static readonly A = new TestBackedEnum("A", 1);
  static readonly B = new TestBackedEnum("B", 2);

  constructor(
    readonly name: string,
    readonly value: number,
  ) {}

  static cases(): TestBackedEnum[] {
    return [TestBackedEnum.A, TestBackedEnum.B];
  }

  static from(value: number): TestBackedEnum {
    const found = TestBackedEnum.tryFrom(value);
    if (found === null) {
      throw new ValueError(`${value} is not a valid backing value for enum ${fqcn(TestBackedEnum)}`);
    }
    return found;
  }

  static tryFrom(value: number): TestBackedEnum | null {
    return TestBackedEnum.cases().find((item) => item.value === value) ?? null;
  }
}

export class TestStringBackedEnum {
  static readonly backingType = "string";
  static readonly A = new TestStringBackedEnum("A", "A");
  static readonly B = new TestStringBackedEnum("B", "B");

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): TestStringBackedEnum[] {
    return [TestStringBackedEnum.A, TestStringBackedEnum.B];
  }

  static from(value: string): TestStringBackedEnum {
    const found = TestStringBackedEnum.tryFrom(value);
    if (found === null) {
      throw new ValueError(`"${value}" is not a valid backing value for enum ${fqcn(TestStringBackedEnum)}`);
    }
    return found;
  }

  static tryFrom(value: string): TestStringBackedEnum | null {
    return TestStringBackedEnum.cases().find((item) => item.value === value) ?? null;
  }
}

/** The fixtures, by their Upstream FQCN, for `registerTestClass` in a test case's `setUp`. */
export const FIXTURES: readonly (readonly [string, abstract new (...args: never[]) => unknown])[] = [
  ["Illuminate\\Tests\\Support\\Fixtures\\TestEnum", TestEnum],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestBackedEnum", TestBackedEnum],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestStringBackedEnum", TestStringBackedEnum],
];
