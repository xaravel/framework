// Ported from framework/tests/Support/SupportReflectorTest.php (Laravel v13.37.0), Story 13.1.
//
// A PHP parameter hint is the method's `@inject({ … })` declaration (DIV-3.1); `parent` is the runtime's `parent`
// marker, which `Reflector` resolves against the declaring class (DIV-3.2). `X::class` compared against a returned
// name is `fqcn(X)` (AD-10). A class-string given to `isCallable` is the class itself, and visibility is erased
// (DIV-9.14). `#[X(args)]` attributes are `@attribute(X, ...args)` (DIV-12.15, Fixtures/ClassesWithAttributes.ts).
// Upstream's local classes are registered under `Illuminate\Tests\Support\<Name>` in `setUp`.
//
// Blocked tests keep Upstream's body, and their case's `setUp` throws `BlockedByComponentError`: testGetClassName and
// testEmptyClassName reflect the Mail fakes (`mail`), testStringTypeName `BusFake` (`bus`), testSelfClassName and
// testUnionTypeName `Model` (`database`). They reach the missing classes through the Class Registry by FQCN. testUnionTypeName's
// fixture `C` (`f(A|Model $x)`) needs `Model`, so it is reached the same way; unblocking it declares
// `class C { @inject({ x: oneOf(A, Model) }) f(x) {} }` here.
//
// testParameterSubclassOfInterface is not ported: a contract token's FQCN does not resolve through the Class Registry
// (ESC-13.1-7), so its fixtures `IA`, `IB` and `TestClassWithInterfaceSubclassParameter` are not declared either.
// testGetClassAttributes is not ported: it reads the `Collection` `getClassAttributes` returns, and Collections is in
// reflection's own Phase, so `blocked-by:collections` is not a valid Skip Reason for it (ESC-13.1-10).
import { portedTest, TestCase } from "@xaravel/assert";
import { Mailable } from "@xaravel/contracts/mail";
import { Reflector } from "@xaravel/reflection";
import { BlockedByComponentError, fqcn, inject, parent, registerTestClass, resolveClass } from "@xaravel/runtime";
import { ReflectionClass } from "@xaravel/runtime/php";
import * as Fixtures from "./Fixtures/ClassesWithAttributes";

const ID = "Illuminate\\Tests\\Support\\SupportReflectorTest";
const NS = "Illuminate\\Tests\\Support";

class A {}

class B extends A {
  @inject({ x: parent }) // adapted:DIV-3.2
  f(x: A): void {
    void x;
    //
  }
}

class TestClassWithCall {
  __call(method: string, parameters: unknown[]): void {
    void method;
    void parameters;
    //
  }
}

class TestClassWithCallStatic {
  static __callStatic(method: string, parameters: unknown[]): void {
    void method;
    void parameters;
    //
  }
}

class SupportReflectorTest extends TestCase {
  setUp(): void {
    registerTestClass(`${NS}\\A`, A);
    registerTestClass(`${NS}\\B`, B);
    registerTestClass(`${NS}\\TestClassWithCall`, TestClassWithCall);
    registerTestClass(`${NS}\\TestClassWithCallStatic`, TestClassWithCallStatic);
    for (const [name, klass] of Fixtures.FIXTURES) {
      registerTestClass(name, klass);
    }
  }
}

/** The tests that reflect `PendingMailFake` / `MailFake` (the Mail Component). */
class SupportReflectorTestMail extends TestCase {
  setUp(): void {
    throw new BlockedByComponentError("mail");
  }
}

/** The test that reflects `BusFake` (the Bus Component). */
class SupportReflectorTestBus extends TestCase {
  setUp(): void {
    throw new BlockedByComponentError("bus");
  }
}

/** The tests that reflect `Model` (the Database Component). */
class SupportReflectorTestDatabase extends TestCase {
  setUp(): void {
    throw new BlockedByComponentError("database");
  }
}

portedTest(`${ID}::testGetClassName`, { case: SupportReflectorTestMail }, async function () {
  const method = new ReflectionClass(resolveClass("Illuminate\\Support\\Testing\\Fakes\\PendingMailFake")).getMethod("send");

  this.assertSame(fqcn(Mailable), Reflector.getParameterClassName(method.getParameters()[0]!));
});

portedTest(`${ID}::testEmptyClassName`, { case: SupportReflectorTestMail }, async function () {
  const method = new ReflectionClass(resolveClass("Illuminate\\Support\\Testing\\Fakes\\MailFake")).getMethod("assertSent");

  this.assertNull(Reflector.getParameterClassName(method.getParameters()[0]!));
});

portedTest(`${ID}::testStringTypeName`, { case: SupportReflectorTestBus }, async function () {
  const method = new ReflectionClass(resolveClass("Illuminate\\Support\\Testing\\Fakes\\BusFake")).getMethod("dispatchedAfterResponse");

  this.assertNull(Reflector.getParameterClassName(method.getParameters()[0]!));
});

portedTest(`${ID}::testSelfClassName`, { case: SupportReflectorTestDatabase }, async function () {
  const method = new ReflectionClass(resolveClass("Illuminate\\Database\\Eloquent\\Model")).getMethod("newPivot");

  this.assertSame(fqcn(resolveClass("Illuminate\\Database\\Eloquent\\Model")), Reflector.getParameterClassName(method.getParameters()[0]!));
});

portedTest(`${ID}::testParentClassName`, { case: SupportReflectorTest }, async function () {
  const method = new ReflectionClass(B).getMethod("f");

  this.assertSame(fqcn(A), Reflector.getParameterClassName(method.getParameters()[0]!)); // adapted:DIV-3.2
});

portedTest(`${ID}::testUnionTypeName`, { case: SupportReflectorTestDatabase }, async function () {
  const method = new ReflectionClass(resolveClass(`${NS}\\C`)).getMethod("f");

  this.assertNull(Reflector.getParameterClassName(method.getParameters()[0]!));
});

portedTest(`${ID}::testIsCallable`, { case: SupportReflectorTest }, async function () {
  this.assertTrue(Reflector.isCallable(() => {}));
  this.assertTrue(Reflector.isCallable([B, "f"])); // adapted:DIV-9.14
  this.assertFalse(Reflector.isCallable([TestClassWithCall, "f"])); // adapted:DIV-9.14
  this.assertTrue(Reflector.isCallable([new TestClassWithCall(), "f"]));
  this.assertTrue(Reflector.isCallable([TestClassWithCallStatic, "f"])); // adapted:DIV-9.14
  this.assertFalse(Reflector.isCallable([new TestClassWithCallStatic(), "f"]));
  this.assertFalse(Reflector.isCallable([new TestClassWithCallStatic()]));
  this.assertFalse(Reflector.isCallable(["TotallyMissingClass", "foo"]));
  this.assertTrue(Reflector.isCallable(["TotallyMissingClass", "foo"], true));
});

portedTest(`${ID}::testGetClassAttribute`, { case: SupportReflectorTest }, async function () {
  // Upstream's `require_once __DIR__.'/Fixtures/ClassesWithAttributes.php'` is this file's import of the fixtures.
  this.assertNull(Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.UnusedAttr)); // adapted:DIV-12.15
  this.assertNull(Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.UnusedAttr, true)); // adapted:DIV-12.15
  this.assertNull(Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.ParentOnlyAttr)); // adapted:DIV-12.15
  this.assertInstanceOf(Fixtures.ParentOnlyAttr, Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.ParentOnlyAttr, true)); // adapted:DIV-12.15
  this.assertInstanceOf(Fixtures.StrAttr, Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.StrAttr)); // adapted:DIV-12.15
  this.assertInstanceOf(Fixtures.StrAttr, Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.StrAttr, true)); // adapted:DIV-12.15
  this.assertSame("quick", Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.StrAttr)!.string); // adapted:DIV-12.15
  this.assertSame("quick", Reflector.getClassAttribute(Fixtures.ChildClass, Fixtures.StrAttr, true)!.string); // adapted:DIV-12.15
  this.assertSame("lazy", Reflector.getClassAttribute(Fixtures.ParentClass, Fixtures.StrAttr)!.string); // adapted:DIV-12.15
});
