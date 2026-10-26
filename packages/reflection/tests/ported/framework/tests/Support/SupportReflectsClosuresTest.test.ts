// Ported from framework/tests/Support/SupportReflectsClosuresTest.php (Laravel v13.37.0), Story 13.1.
//
// TypeScript erases a closure's hints, so each closure declares them (DIV-3.3): its parameters with
// `inject({ … }, fn)`, in order and by name, an untyped parameter as `primitive`, a variadic one as `variadic(X)`, a
// union as `oneOf(...)`, and no parameters as `inject({}, fn)`. A nullable `?X` hint is `X`, PHP's named type for `?X`
// being `X`. A return hint is `returns(<Spec>, fn)` (DIV-3.4), with `oneOf` for a union, `allOf` for an intersection,
// and the `self` / `static` markers. `X::class` compared against a returned name is `fqcn(X)` (AD-10). The PHP
// interfaces are `contract(...)` tokens, which `ReflectsClosuresBothInterfaces` implements through their brands.
// Upstream's local classes are registered under `Illuminate\Tests\Support\<Name>` in `setUp`. `assertInstanceOf`
// takes the class-string `firstClosureParameterType` returns, as PHPUnit's does (ESC-13.1-9's ruling).
import { portedTest, TestCase } from "@xaravel/assert";
import { contract } from "@xaravel/contracts";
import { ReflectsClosures } from "@xaravel/reflection";
import { allOf, fqcn, inject, mixin, oneOf, primitive, registerTestClass, returns, RuntimeException, self, static as static_, variadic } from "@xaravel/runtime";

const ID = "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest";
const NS = "Illuminate\\Tests\\Support";

/** A PHP `Closure`. */
type Closure = (...args: never[]) => unknown;

export class ExampleParameter {
  //
}

export class AnotherExampleParameter {
  //
}

declare const ReflectsClosuresInterfaceOneBrand: unique symbol;
declare const ReflectsClosuresInterfaceTwoBrand: unique symbol;

const ReflectsClosuresInterfaceOne = contract<object, typeof ReflectsClosuresInterfaceOneBrand>(`${NS}\\ReflectsClosuresInterfaceOne`);

const ReflectsClosuresInterfaceTwo = contract<object, typeof ReflectsClosuresInterfaceTwoBrand>(`${NS}\\ReflectsClosuresInterfaceTwo`);

class ReflectsClosuresBothInterfaces {
  get [ReflectsClosuresInterfaceOne.brand](): true {
    return true;
  }

  get [ReflectsClosuresInterfaceTwo.brand](): true {
    return true;
  }
}

class ReflectsClosuresClass extends mixin(null, ReflectsClosures) {
  static reflect(closure: Closure): (string | null)[] {
    return Object.values(new this().closureParameterTypes(closure));
  }

  static reflectFirst(closure: Closure): string {
    return new this().firstClosureParameterType(closure);
  }

  static reflectFirstAll(closure: Closure): string[] {
    return new this().firstClosureParameterTypes(closure);
  }

  static reflectReturnTypes(closure: Closure): string[] {
    return new this().closureReturnTypes(closure);
  }

  static closureWithSelfReturnType(): Closure {
    return returns(self, () => { // adapted:DIV-3.4
      return new ReflectsClosuresClass();
    });
  }

  static closureWithStaticReturnType(): Closure {
    return returns(static_, () => { // adapted:DIV-3.4
      return new this();
    });
  }
}

class SupportReflectsClosuresTest extends TestCase {
  setUp(): void {
    registerTestClass(`${NS}\\ExampleParameter`, ExampleParameter);
    registerTestClass(`${NS}\\AnotherExampleParameter`, AnotherExampleParameter);
    registerTestClass(`${NS}\\ReflectsClosuresBothInterfaces`, ReflectsClosuresBothInterfaces);
    registerTestClass(`${NS}\\ReflectsClosuresClass`, ReflectsClosuresClass);
  }

  assertParameterTypes(expected: unknown, closure: Closure): void {
    const types = ReflectsClosuresClass.reflect(closure);

    this.assertSame(expected, types);
  }
}

portedTest(`${ID}::testReflectsClosures`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertParameterTypes(
    [fqcn(ExampleParameter)],
    inject({ one: ExampleParameter }, (one: ExampleParameter) => { // adapted:DIV-3.3
      void one;
      // assert the Closure isn't actually executed
      throw new RuntimeException();
    }),
  );

  this.assertParameterTypes(
    [],
    inject({}, () => { // adapted:DIV-3.3
      //
    }),
  );

  this.assertParameterTypes(
    [null],
    inject({ one: primitive }, (one: unknown) => { // adapted:DIV-3.3
      void one;
      //
    }),
  );

  this.assertParameterTypes(
    [null, fqcn(ExampleParameter)],
    inject({ one: primitive, two: ExampleParameter }, (one: unknown, two: ExampleParameter | null = null) => { // adapted:DIV-3.3
      void one;
      void two;
      //
    }),
  );

  this.assertParameterTypes(
    [null, fqcn(ExampleParameter)],
    inject({ one: String, two: ExampleParameter }, (one: string, two: ExampleParameter | null) => { // adapted:DIV-3.3
      void one;
      void two;
      //
    }),
  );

  // Because the parameter is variadic, the closure will always receive an array.
  this.assertParameterTypes(
    [null],
    inject({ vars: variadic(ExampleParameter) }, (...vars: ExampleParameter[]) => { // adapted:DIV-3.3
      void vars;
      //
    }),
  );
});

portedTest(`${ID}::testItReturnsTheFirstParameterType`, { case: SupportReflectsClosuresTest }, async function () {
  const type = ReflectsClosuresClass.reflectFirst(
    inject({ a: ExampleParameter }, (a: ExampleParameter) => { // adapted:DIV-3.3
      void a;
      //
    }),
  );

  this.assertInstanceOf(type, new ExampleParameter());
});

portedTest(`${ID}::testItThrowsWhenNoParameters`, { case: SupportReflectsClosuresTest }, async function () {
  this.expectException(RuntimeException);

  ReflectsClosuresClass.reflectFirst(
    inject({}, () => { // adapted:DIV-3.3
      //
    }),
  );
});

portedTest(`${ID}::testItThrowsWhenNoFirstParameterType`, { case: SupportReflectsClosuresTest }, async function () {
  this.expectException(RuntimeException);

  ReflectsClosuresClass.reflectFirst(
    inject({ a: primitive, b: ExampleParameter }, (a: unknown, b: ExampleParameter) => { // adapted:DIV-3.3
      void a;
      void b;
      //
    }),
  );
});

portedTest(`${ID}::testItWorksWithUnionTypes`, { case: SupportReflectsClosuresTest }, async function () {
  let types = ReflectsClosuresClass.reflectFirstAll(
    inject({ a: ExampleParameter, b: primitive }, (a: ExampleParameter, b: unknown) => { // adapted:DIV-3.3
      void a;
      void b;
      //
    }),
  );

  this.assertEquals([fqcn(ExampleParameter)], types);

  // Upstream's `require __DIR__.'/Fixtures/UnionTypesClosure.php'`; the fixture imports this module's classes, so it
  // is imported here, when the test runs.
  const closure = (await import("./Fixtures/UnionTypesClosure")).default;

  types = ReflectsClosuresClass.reflectFirstAll(closure);

  this.assertEquals([fqcn(ExampleParameter), fqcn(AnotherExampleParameter)], types);
});

portedTest(`${ID}::testItWorksWithUnionTypesWithNoTypeHints`, { case: SupportReflectsClosuresTest }, async function () {
  this.expectException(RuntimeException);

  const types = ReflectsClosuresClass.reflectFirstAll(
    inject({ a: primitive, b: primitive }, (a: unknown, b: unknown) => { // adapted:DIV-3.3
      void a;
      void b;
      //
    }),
  );
  void types;
});

portedTest(`${ID}::testItWorksWithUnionTypesWithNoArguments`, { case: SupportReflectsClosuresTest }, async function () {
  this.expectException(RuntimeException);

  const types = ReflectsClosuresClass.reflectFirstAll(
    inject({}, () => { // adapted:DIV-3.3
      //
    }),
  );
  void types;
});

portedTest(`${ID}::testItThrowsWhenFirstParameterHasNoTypeHintEvenIfLaterParameterDoes`, { case: SupportReflectsClosuresTest }, async function () {
  this.expectExceptionObject(new RuntimeException("The first parameter of the given Closure is missing a type hint."));

  ReflectsClosuresClass.reflectFirstAll(
    inject({ a: primitive, b: ExampleParameter }, (a: unknown, b: ExampleParameter) => { // adapted:DIV-3.3
      void a;
      void b;
      //
    }),
  );
});

portedTest(`${ID}::testClosureReturnTypesReturnsClassReturnType`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame(
    [fqcn(ExampleParameter)],
    ReflectsClosuresClass.reflectReturnTypes(returns(ExampleParameter, () => new ExampleParameter())), // adapted:DIV-3.4
  );
});

portedTest(`${ID}::testClosureReturnTypesExcludesBuiltinReturnType`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame(
    [],
    ReflectsClosuresClass.reflectReturnTypes(returns(String, () => "foo")), // adapted:DIV-3.4
  );
});

portedTest(`${ID}::testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame([], ReflectsClosuresClass.reflectReturnTypes(() => "foo"));
});

portedTest(`${ID}::testClosureReturnTypesExcludesSelfAndStaticReturnTypes`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame([], ReflectsClosuresClass.reflectReturnTypes(ReflectsClosuresClass.closureWithSelfReturnType())); // adapted:DIV-3.4
  this.assertSame([], ReflectsClosuresClass.reflectReturnTypes(ReflectsClosuresClass.closureWithStaticReturnType())); // adapted:DIV-3.4
});

portedTest(`${ID}::testClosureReturnTypesKeepsOnlyClassTypesFromUnionReturnType`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame(
    [fqcn(ExampleParameter)],
    ReflectsClosuresClass.reflectReturnTypes(returns(oneOf(ExampleParameter, String), () => new ExampleParameter())), // adapted:DIV-3.4
  );

  this.assertSame(
    [fqcn(ExampleParameter), fqcn(AnotherExampleParameter)],
    ReflectsClosuresClass.reflectReturnTypes(returns(oneOf(ExampleParameter, AnotherExampleParameter), () => new ExampleParameter())), // adapted:DIV-3.4
  );
});

portedTest(`${ID}::testClosureReturnTypesReturnsEmptyArrayForIntersectionReturnType`, { case: SupportReflectsClosuresTest }, async function () {
  this.assertSame(
    [],
    ReflectsClosuresClass.reflectReturnTypes(returns(allOf(ReflectsClosuresInterfaceOne, ReflectsClosuresInterfaceTwo), () => new ReflectsClosuresBothInterfaces())), // adapted:DIV-3.4
  );
});
