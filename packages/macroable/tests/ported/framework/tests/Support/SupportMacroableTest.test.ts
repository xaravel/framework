// Ported from framework/tests/Support/SupportMacroableTest.php (Laravel v13.37.0), Story 11.1.
//
// Macro bodies Upstream rebinds are `function` expressions, and its `static function` closures are arrow functions
// (PORTING.md § Mechanical expression rule / By hand). `__CLASS__` is the test class's FQCN as a string literal.
// `$obj::m()` is a static call on `obj`'s class, written `classOf(obj).m()`. The fixtures are registered in `setUp`
// with `registerTestClass`, and their macros are typed as `declare` members (AD-26 Macroable row). A call to a name
// that was never registered goes through `__callStatic` (DIV-12.10).
import { portedTest, TestCase } from "@xaravel/assert";
import { Macroable } from "@xaravel/macroable";
import { BadMethodCallException, mixin, registerTestClass, toPhpString } from "@xaravel/runtime";

const ID = "Illuminate\\Tests\\Support\\SupportMacroableTest";

// The macros the tests register are typed as `declare` members, which emit nothing, so the dispatchers `macro()`
// installs are what runs.
class EmptyMacroable extends mixin(null, Macroable) {
  declare "Illuminate\\Tests\\Support\\SupportMacroableTest": () => unknown;
  declare nonStaticClosure: () => unknown;
  declare staticClosure: () => unknown;

  declare static "Illuminate\\Tests\\Support\\SupportMacroableTest": () => unknown;
  declare static concatenate: (arg1: string, arg2: string) => unknown;
  declare static greet: (name?: string) => unknown;
  declare static existingMethod: () => unknown;
  declare static nonStaticClosure: () => unknown;
  declare static staticClosure: () => unknown;
}

class TestMacroable extends mixin(null, Macroable) {
  // protected in Upstream; public here, as the macro bodies that read it are declared outside the class.
  protectedVariable = "instance";

  declare tryInstance: () => unknown;
  declare methodOne: (value: string) => unknown;
  declare methodTwo: (value: string) => unknown;
  declare methodThree: () => unknown;
  declare flushMethod: () => unknown;

  declare static tryStatic: () => unknown;
  declare static flushMethod: () => unknown;

  // protected in Upstream; public here, as the macro bodies that call it are declared outside the class.
  static getProtectedStatic(): string {
    return "static";
  }
}

class TestMixin {
  methodOne() {
    return function (this: TestMacroable, value: string) {
      return this.methodTwo(value);
    };
  }

  protected methodTwo() {
    return function (this: TestMacroable, value: string) {
      return toPhpString(this.protectedVariable) + "-" + toPhpString(value);
    };
  }

  protected methodThree() {
    return function () {
      return "foo";
    };
  }
}

/** PHP's `$obj::`: the class of `obj`, for a static call on it. */
function classOf(obj: TestMacroable): typeof TestMacroable;
function classOf(obj: EmptyMacroable): typeof EmptyMacroable;
function classOf(obj: object): unknown {
  return obj.constructor;
}

class SupportMacroableTest extends TestCase {
  macroable: EmptyMacroable | null = null;

  setUp(): void {
    registerTestClass("Illuminate\\Tests\\Support\\EmptyMacroable", EmptyMacroable);
    registerTestClass("Illuminate\\Tests\\Support\\TestMacroable", TestMacroable);
    registerTestClass("Illuminate\\Tests\\Support\\TestMixin", TestMixin);
    this.macroable = this.createObjectForTrait();
  }

  createObjectForTrait(): EmptyMacroable {
    return new EmptyMacroable();
  }
}

portedTest(`${ID}::testRegisterMacro`, { case: SupportMacroableTest }, async function () {
  const macroable = this.macroable!;
  classOf(macroable).macro("Illuminate\\Tests\\Support\\SupportMacroableTest", function () {
    return "Taylor";
  });
  this.assertSame("Taylor", classOf(macroable)["Illuminate\\Tests\\Support\\SupportMacroableTest"]());
});

portedTest(`${ID}::testHasMacro`, { case: SupportMacroableTest }, async function () {
  const macroable = this.macroable!;
  classOf(macroable).macro("foo", function () {
    return "Taylor";
  });
  this.assertTrue(classOf(macroable).hasMacro("foo"));
  this.assertFalse(classOf(macroable).hasMacro("bar"));
});

portedTest(`${ID}::testRegisterMacroAndCallWithoutStatic`, { case: SupportMacroableTest }, async function () {
  const macroable = this.macroable!;
  classOf(macroable).macro("Illuminate\\Tests\\Support\\SupportMacroableTest", function () {
    return "Taylor";
  });
  this.assertSame("Taylor", macroable["Illuminate\\Tests\\Support\\SupportMacroableTest"]());
});

portedTest(`${ID}::testWhenCallingMacroClosureIsBoundToObject`, { case: SupportMacroableTest }, async function () {
  TestMacroable.macro("tryInstance", function (this: TestMacroable) {
    return this.protectedVariable;
  });
  TestMacroable.macro("tryStatic", function (this: typeof TestMacroable) {
    return this.getProtectedStatic();
  });
  const instance = new TestMacroable();

  let result = instance.tryInstance();
  this.assertSame("instance", result);

  result = TestMacroable.tryStatic();
  this.assertSame("static", result);
});

portedTest(`${ID}::testClassBasedMacros`, { case: SupportMacroableTest }, async function () {
  TestMacroable.mixin(new TestMixin());
  const instance = new TestMacroable();
  this.assertSame("instance-Adam", instance.methodOne("Adam"));
});

portedTest(`${ID}::testClassBasedMacrosNoReplace`, { case: SupportMacroableTest }, async function () {
  TestMacroable.macro("methodThree", function () {
    return "bar";
  });
  TestMacroable.mixin(new TestMixin(), false);
  const instance = new TestMacroable();
  this.assertSame("bar", instance.methodThree());

  TestMacroable.mixin(new TestMixin());
  this.assertSame("foo", instance.methodThree());
});

portedTest(`${ID}::testFlushMacros`, { case: SupportMacroableTest }, async function () {
  TestMacroable.macro("flushMethod", function () {
    return "flushMethod";
  });

  const instance = new TestMacroable();

  this.assertSame("flushMethod", instance.flushMethod());

  TestMacroable.flushMacros();

  this.expectException(BadMethodCallException);

  instance.flushMethod();
});

portedTest(`${ID}::testFlushMacrosStatic`, { case: SupportMacroableTest }, async function () {
  TestMacroable.macro("flushMethod", function () {
    return "flushMethod";
  });

  const instance = new TestMacroable();

  this.assertSame("flushMethod", classOf(instance).flushMethod());

  TestMacroable.flushMacros();

  this.expectException(BadMethodCallException);

  classOf(instance).flushMethod();
});

portedTest(`${ID}::testMacroWithArguments`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("concatenate", function (arg1: string, arg2: string) {
    return toPhpString(arg1) + " " + toPhpString(arg2);
  });

  const result = classOf(this.macroable!).concatenate("Hello", "World");
  this.assertSame("Hello World", result);
});

portedTest(`${ID}::testMacroWithDefaultArguments`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("greet", function (name: string = "Guest") {
    return "Hello, " + toPhpString(name);
  });

  this.assertSame("Hello, Guest", classOf(this.macroable!).greet());
  this.assertSame("Hello, Saleh", classOf(this.macroable!).greet("Saleh"));
});

portedTest(`${ID}::testCallingUndefinedMacroThrowsException`, { case: SupportMacroableTest }, async function () {
  this.expectException(BadMethodCallException);

  classOf(this.macroable!).__callStatic("nonExistentMacro", []); // adapted:DIV-12.10
});

portedTest(`${ID}::testMethodConflictDoesNotThrowException`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("existingMethod", function () {
    return "oldMethod";
  });

  // Replacing existing macro.
  classOf(this.macroable!).macro("existingMethod", function () {
    return "newMethod";
  });

  this.assertSame("newMethod", classOf(this.macroable!).existingMethod());
});

portedTest(`${ID}::testStaticCallOfNonStaticClosure`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("nonStaticClosure", function () {
    return "Taylor";
  });

  this.assertSame("Taylor", classOf(this.macroable!).nonStaticClosure());
});

portedTest(`${ID}::testNonStaticCallOfNonStaticClosure`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("nonStaticClosure", function () {
    return "Taylor";
  });

  this.assertSame("Taylor", this.macroable!.nonStaticClosure());
});

portedTest(`${ID}::testStaticCallOfStaticClosure`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("staticClosure", () => {
    return "Taylor";
  });

  this.assertSame("Taylor", classOf(this.macroable!).staticClosure());
});

portedTest(`${ID}::testNonStaticCallOfStaticClosure`, { case: SupportMacroableTest }, async function () {
  classOf(this.macroable!).macro("staticClosure", () => {
    return "Taylor";
  });

  this.assertSame("Taylor", this.macroable!.staticClosure());
});
