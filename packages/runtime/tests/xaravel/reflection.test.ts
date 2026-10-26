// Xaravel Tests for action item epic-13-item-1-runtime-reflection (decisions/MAINT-2026-10-25-story-13-1.md, route
// step 1): the Spec values (XT-runtime-44), `returns` (XT-runtime-45), PHP's reflection classes over `inject`
// (XT-runtime-46) and PHP attributes (XT-runtime-47), under DIV-3.2-3.4 and DIV-12.15; and, for action item
// epic-13-retro-item-5-reflector-own-type, a named type's own class or token (XT-runtime-50). The fixtures are
// SupportReflectorTest's, SupportReflectsClosuresTest's and Fixtures/ClassesWithAttributes.php's, written under those
// clauses and registered under `XaravelFixture\Reflection\<Upstream short name>`, so they never collide with a
// framework class or Story 13.1's own fixtures. Each expected value is what PHP 8.5's reflection returns for the
// Upstream fixture (checked against php 8.5.11), except the rows a DIV clause changes, each marked: an untyped
// parameter, which PHP reflects with a null type, is declared `primitive` and reads as builtin `mixed` (DIV-3.3); and
// `getAttributes(filter)` matches by `instanceof` where PHP's no-flag call matches the exact name (DIV-12.15). No test
// re-implements `Reflector` or `ReflectsClosures` (F-8): the members they call are asserted directly.
//
// The runtime cannot import @xaravel/contracts, so a token is a stand-in built as `contract()` builds one: frozen,
// with an own non-writable `Symbol.for('xaravel.class.fqcn')`, its parents under `Symbol.for('xaravel.contract.parents')`
// and a `Symbol.toPrimitive` giving its brand.
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  allOf,
  inject,
  oneOf,
  parent,
  primitive,
  readInjectMetadata,
  readReturnMetadata,
  returns,
  self,
  static as static_,
  variadic,
} from "@xaravel/runtime";
import {
  Attribute,
  attribute,
  Error as PhpError,
  Exception,
  ReflectionAttribute,
  ReflectionClass,
  ReflectionEnum,
  ReflectionException,
  ReflectionFunction,
  ReflectionIntersectionType,
  ReflectionMethod,
  ReflectionNamedType,
  ReflectionParameter,
  ReflectionUnionType,
  RuntimeException,
  TypeError as PhpTypeError,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, registerContractToken, resolveClass } from "@xaravel/runtime/registry";
import { mixin } from "@xaravel/runtime";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** A stand-in contract token named `name`, extending `parents`. */
function token(name: string, parents: readonly object[] = []): object {
  const brand = Symbol.for(name);
  return Object.freeze({
    brand,
    [CLASS_FQCN]: name,
    [CONTRACT_PARENTS]: Object.freeze([...parents]),
    [Symbol.toPrimitive]: (): symbol => brand,
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** Asserts `fn` throws an instance of `klass` whose message `matches` (a string is the exact message). */
function assertThrows(klass: abstract new (...args: never[]) => unknown, matches: string | RegExp, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof klass, `expected a ${String((klass as { name?: unknown }).name)}: ${String(error)}`);
  const message = (error as globalThis.Error).message;
  if (typeof matches === "string") {
    Assert.assertSame(matches, message);
  } else {
    Assert.assertTrue(matches.test(message), `unexpected message: ${message}`);
  }
}

/** A named type's `[getName(), isBuiltin()]`. */
function named(type: unknown): [string, boolean] {
  Assert.assertInstanceOf(ReflectionNamedType, type);
  return [(type as ReflectionNamedType).getName(), (type as ReflectionNamedType).isBuiltin()];
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: SupportReflectorTest.php

const NS = "XaravelFixture\\Reflection";

class A {}

class B extends A {
  @inject({ x: parent })
  f(x: unknown): unknown {
    return [x];
  }
}

// `C` and `Model` of Upstream's `f(A|Model $x)`; the stand-in Model is a registered class.
class Model {}

class C {
  @inject({ x: oneOf(A, Model) })
  f(x: unknown): unknown {
    return [x];
  }
}

const IA = token(`${NS}\\IA`);
const IB = token(`${NS}\\IB`, [IA]);
const IC = token(`${NS}\\IC`, [IB]);

class TestClassWithInterfaceSubclassParameter {
  @inject({ x: IB })
  f(x: unknown): unknown {
    return [x];
  }
}

/** A class implementing `IB` (and so `IA`), its brands on the prototype as a contract class carries them. */
class ImplementsIB {
  get [IB as unknown as symbol](): true {
    return true;
  }
  get [IA as unknown as symbol](): true {
    return true;
  }
}

class Undeclared {
  f(x: unknown): unknown {
    return [x];
  }
  static make(): void {}
}

class SelfHinted {
  @inject({ other: self, s: String, n: Number, b: Boolean, any: primitive })
  newPivot(other: unknown, s: unknown, n: unknown, b: unknown, any: unknown): unknown {
    return [other, s, n, b, any];
  }
}

registerClass(`${NS}\\A`, A);
registerClass(`${NS}\\B`, B);
registerClass(`${NS}\\Model`, Model);
registerClass(`${NS}\\C`, C);
registerClass(`${NS}\\TestClassWithInterfaceSubclassParameter`, TestClassWithInterfaceSubclassParameter);
registerClass(`${NS}\\ImplementsIB`, ImplementsIB);
registerClass(`${NS}\\Undeclared`, Undeclared);
registerClass(`${NS}\\SelfHinted`, SelfHinted);

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: SupportReflectsClosuresTest.php

class ExampleParameter {}
class AnotherExampleParameter {}
const ReflectsClosuresInterfaceOne = token(`${NS}\\ReflectsClosuresInterfaceOne`);
const ReflectsClosuresInterfaceTwo = token(`${NS}\\ReflectsClosuresInterfaceTwo`);

registerClass(`${NS}\\ExampleParameter`, ExampleParameter);
registerClass(`${NS}\\AnotherExampleParameter`, AnotherExampleParameter);

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: Fixtures/ClassesWithAttributes.php (DIV-12.15)

const FX = NS;

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class UnusedAttr {}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class ParentOnlyAttr {}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class StrAttr {
  constructor(public string: string) {}
}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class NumAttr {
  constructor(public number: number) {}
}

@attribute(StrAttr, "lazy")
@attribute(StrAttr, "dog")
@attribute(NumAttr, 2)
@attribute(NumAttr, 3)
@attribute(ParentOnlyAttr)
class ParentClass {}

@attribute(StrAttr, "quick")
@attribute(StrAttr, "brown")
@attribute(StrAttr, "fox")
@attribute(NumAttr, 7)
class ChildClass extends ParentClass {}

registerClass(`${FX}\\UnusedAttr`, UnusedAttr);
registerClass(`${FX}\\ParentOnlyAttr`, ParentOnlyAttr);
registerClass(`${FX}\\StrAttr`, StrAttr);
registerClass(`${FX}\\NumAttr`, NumAttr);
registerClass(`${FX}\\ParentClass`, ParentClass);
registerClass(`${FX}\\ChildClass`, ChildClass);

// The attribute checks of `newInstance()`, as PHP 8.5.11 reports them.
@attribute(Attribute, Attribute.TARGET_METHOD | Attribute.TARGET_PROPERTY)
class MethodOnly {}
@attribute(Attribute, Attribute.TARGET_FUNCTION | Attribute.TARGET_CLASS_CONSTANT | Attribute.TARGET_PARAMETER | Attribute.TARGET_CONSTANT | Attribute.TARGET_PROPERTY)
class ManyTargets {}
@attribute(Attribute, Attribute.TARGET_CLASS)
class NotRepeatable {}
@attribute(Attribute, 256)
class BadFlags {}
@attribute(Attribute)
class AllTargets {}
class Plain {}

@attribute(MethodOnly)
class OnMethodOnly {}
@attribute(ManyTargets)
class OnManyTargets {}
@attribute(NotRepeatable)
@attribute(NotRepeatable)
class OnNotRepeatableTwice {}
@attribute(NotRepeatable)
class OnNotRepeatableOnce {}
@attribute(BadFlags)
class OnBadFlags {}
@attribute(AllTargets)
class OnAllTargets {}
@attribute(Plain)
class OnPlain {}

@attribute(Attribute, Attribute.TARGET_CLASS)
class SubStrAttr extends StrAttr {}
// An attribute class's `@attribute(Attribute, ...)` is its own: PHP does not inherit it.
class UnmarkedSubStrAttr extends StrAttr {}
@attribute(Attribute, Attribute.TARGET_CLASS)
class OtherAttr {}
@attribute(UnmarkedSubStrAttr, "unmarked")
class OnUnmarked {}
@attribute(SubStrAttr, "sub")
@attribute(OtherAttr)
@attribute(StrAttr, "base")
class Mixed {}

registerClass("XaravelFixture\\Reflection\\MethodOnly", MethodOnly);
registerClass("XaravelFixture\\Reflection\\ManyTargets", ManyTargets);
registerClass("XaravelFixture\\Reflection\\NotRepeatable", NotRepeatable);
registerClass("XaravelFixture\\Reflection\\BadFlags", BadFlags);
registerClass("XaravelFixture\\Reflection\\AllTargets", AllTargets);
registerClass("XaravelFixture\\Reflection\\Plain", Plain);
registerClass("XaravelFixture\\Reflection\\OnMethodOnly", OnMethodOnly);
registerClass("XaravelFixture\\Reflection\\OnManyTargets", OnManyTargets);
registerClass("XaravelFixture\\Reflection\\OnNotRepeatableTwice", OnNotRepeatableTwice);
registerClass("XaravelFixture\\Reflection\\OnNotRepeatableOnce", OnNotRepeatableOnce);
registerClass("XaravelFixture\\Reflection\\OnBadFlags", OnBadFlags);
registerClass("XaravelFixture\\Reflection\\OnAllTargets", OnAllTargets);
registerClass("XaravelFixture\\Reflection\\OnPlain", OnPlain);
registerClass("XaravelFixture\\Reflection\\SubStrAttr", SubStrAttr);
registerClass("XaravelFixture\\Reflection\\OtherAttr", OtherAttr);
registerClass("XaravelFixture\\Reflection\\UnmarkedSubStrAttr", UnmarkedSubStrAttr);
registerClass("XaravelFixture\\Reflection\\OnUnmarked", OnUnmarked);
registerClass("XaravelFixture\\Reflection\\Mixed", Mixed);

// ---------------------------------------------------------------------------------------------------------------

xaravelTest(
  "XT-runtime-44",
  "the runtime exports the Spec values primitive, self, parent, static, variadic(spec), oneOf(...) and allOf(...) beside inject, from its root, as frozen null-prototype descriptors an inject map stores as given; oneOf / allOf need two or more members, oneOf refuses a nested oneOf or a variadic, allOf anything but a class or token, and variadic a missing, null or variadic Spec, each with a TypeError (AD-4, DIV-3.2-3.4)",
  () => {
    const markers: [string, object][] = [
      ["primitive", primitive],
      ["self", self],
      ["parent", parent],
      ["static", static_],
    ];
    for (const [name, marker] of markers) {
      Assert.assertSame(marker, (root as Record<string, unknown>)[name], `the root exports ${name}`);
      Assert.assertNull(Object.getPrototypeOf(marker));
      Assert.assertTrue(Object.isFrozen(marker), `${name} is frozen`);
      Assert.assertSame(name, (marker as { kind?: unknown }).kind);
      // The Spec values are the runtime's, not php's.
      Assert.assertFalse(name in php, `@xaravel/runtime/php does not export ${name}`);
    }
    Assert.assertSame(4, new Set(markers.map(([, marker]) => marker)).size);
    for (const [name, value] of [
      ["variadic", variadic(A)],
      ["oneOf", oneOf(A, String)],
      ["allOf", allOf(A, IA)],
    ] as const) {
      Assert.assertSame("function", typeof (root as Record<string, unknown>)[name]);
      Assert.assertNull(Object.getPrototypeOf(value));
      Assert.assertTrue(Object.isFrozen(value), `${name}(...) is frozen`);
      Assert.assertSame(name, (value as { kind?: unknown }).kind);
    }
    // A plain object of the same shape is no Spec value: reflection rejects it.
    const fake = inject({ x: Object.freeze({ kind: "primitive" }) }, (x: unknown) => [x]);
    assertThrows(TypeError, /^ReflectionParameter::getType\(\): the Spec of \$x is not/, () => new ReflectionFunction(fake).getParameters()[0]!.getType());

    // inject keeps each Spec value as given, in key order.
    const union = oneOf(allOf(IA, IB), A);
    const vars = variadic(ExampleParameter);
    const fn = inject({ a: primitive, u: union, vars }, (a: unknown, u: unknown, ...vars: unknown[]) => [a, u, vars]);
    const map = readInjectMetadata(fn)!;
    Assert.assertSame("a,u,vars", Object.keys(map).join(","));
    Assert.assertSame(primitive, map["a"]);
    Assert.assertSame(union, map["u"]);
    Assert.assertSame(vars, map["vars"]);

    // Errors.
    assertThrows(TypeError, /^oneOf\(\): .*at least two members, 0 given/, () => oneOf());
    assertThrows(TypeError, /^oneOf\(\): .*at least two members, 1 given/, () => oneOf(A));
    assertThrows(TypeError, /^oneOf\(\): member 2 cannot be oneOf\(\.\.\.\)/, () => oneOf(A, oneOf(B, C)));
    assertThrows(TypeError, /^oneOf\(\): member 1 cannot be variadic\(\.\.\.\)/, () => oneOf(variadic(A), B));
    assertThrows(TypeError, /^oneOf\(\): member 2 cannot be null/, () => oneOf(A, null));
    assertThrows(TypeError, /^allOf\(\): .*at least two members, 1 given/, () => allOf(A));
    assertThrows(TypeError, /^allOf\(\): member 2 must be a class or a token, not String/, () => allOf(A, String));
    assertThrows(TypeError, /^allOf\(\): member 1 must be a class or a token, not self/, () => allOf(self, A));
    assertThrows(TypeError, /^allOf\(\): member 2 must be a class or a token, not oneOf/, () => allOf(A, oneOf(B, C)));
    assertThrows(TypeError, /^allOf\(\): member 2 must be a class or a token, not number/, () => allOf(A, 5));
    assertThrows(TypeError, /^variadic\(\): .*not missing/, () => variadic());
    assertThrows(TypeError, /^variadic\(\): .*not null/, () => variadic(null));
    assertThrows(TypeError, /^variadic\(\): .*not undefined/, () => variadic(undefined));
    assertThrows(TypeError, /^variadic\(\): a variadic Spec cannot be variadic again/, () => variadic(variadic(A)));
  },
);

xaravelTest(
  "XT-runtime-45",
  "returns(spec, fn) stores fn's return Spec in its own Symbol.metadata beside inject and gives fn itself; readReturnMetadata reads it, or null; ReflectionFunction.getReturnType() reads it as SupportReflectsClosuresTest's return hints: a named class, a builtin, null without one, self and static unresolved, a union in order and an intersection; a null or undefined Spec, a variadic or a non-function is a TypeError (DIV-3.4)",
  () => {
    const plain = (): null => null;
    Assert.assertSame(plain, returns(ExampleParameter, plain));
    Assert.assertSame(ExampleParameter, readReturnMetadata(plain));
    Assert.assertTrue(Object.hasOwn(plain, Symbol.metadata), "the Spec is in fn's own metadata");
    Assert.assertNull(readReturnMetadata(() => null));
    Assert.assertNull(readReturnMetadata("not a function"));

    // Coexists with inject, in either order.
    const both = returns(String, inject({ one: ExampleParameter }, (one: unknown) => [one]));
    Assert.assertSame(String, readReturnMetadata(both));
    Assert.assertSame("one", Object.keys(readInjectMetadata(both)!).join(","));
    const other = inject({ one: primitive }, returns(A, (one: unknown) => [one]));
    Assert.assertSame(A, readReturnMetadata(other));
    Assert.assertSame(primitive, readInjectMetadata(other)!["one"]);

    // testClosureReturnTypesReturnsClassReturnType: fn (): ExampleParameter
    Assert.assertSame([`${NS}\\ExampleParameter`, false], named(new ReflectionFunction(returns(ExampleParameter, () => new ExampleParameter())).getReturnType()));
    // testClosureReturnTypesExcludesBuiltinReturnType: fn (): string
    Assert.assertSame(["string", true], named(new ReflectionFunction(returns(String, () => "foo")).getReturnType()));
    Assert.assertSame(["float", true], named(new ReflectionFunction(returns(Number, () => 1)).getReturnType()));
    Assert.assertSame(["bool", true], named(new ReflectionFunction(returns(Boolean, () => true)).getReturnType()));
    Assert.assertSame(["mixed", true], named(new ReflectionFunction(returns(primitive, () => null)).getReturnType()));
    // testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType: fn () => 'foo'
    Assert.assertNull(new ReflectionFunction(() => "foo").getReturnType());
    // testClosureReturnTypesExcludesSelfAndStaticReturnTypes: function (): self / function (): static
    Assert.assertSame(["self", false], named(new ReflectionFunction(returns(self, () => null)).getReturnType()));
    Assert.assertSame(["static", false], named(new ReflectionFunction(returns(static_, () => null)).getReturnType()));
    // testClosureReturnTypesKeepsOnlyClassTypesFromUnionReturnType
    const union = new ReflectionFunction(returns(oneOf(ExampleParameter, String), () => new ExampleParameter())).getReturnType();
    Assert.assertInstanceOf(ReflectionUnionType, union);
    Assert.assertSame(
      [
        [`${NS}\\ExampleParameter`, false],
        ["string", true],
      ],
      (union as ReflectionUnionType).getTypes().map(named),
    );
    const classes = new ReflectionFunction(returns(oneOf(ExampleParameter, AnotherExampleParameter), () => new ExampleParameter())).getReturnType();
    Assert.assertSame([`${NS}\\ExampleParameter`, `${NS}\\AnotherExampleParameter`], (classes as ReflectionUnionType).getTypes().map((type) => named(type)[0]));
    // testClosureReturnTypesReturnsEmptyArrayForIntersectionReturnType
    const intersection = new ReflectionFunction(returns(allOf(ReflectsClosuresInterfaceOne, ReflectsClosuresInterfaceTwo), () => null)).getReturnType();
    Assert.assertInstanceOf(ReflectionIntersectionType, intersection);
    Assert.assertFalse(intersection instanceof ReflectionUnionType);
    Assert.assertSame(
      [`${NS}\\ReflectsClosuresInterfaceOne`, `${NS}\\ReflectsClosuresInterfaceTwo`],
      (intersection as ReflectionIntersectionType).getTypes().map((type) => named(type)[0]),
    );
    // A method's return Spec.
    class Returning {
      static build = returns(self, (): null => null);
    }
    registerClass("XaravelFixture\\Reflection\\Returning", Returning);
    Assert.assertSame(["self", false], named(new ReflectionClass(Returning).getMethod("build").getReturnType()));
    Assert.assertNull(new ReflectionClass(B).getMethod("f").getReturnType());

    // Errors.
    assertThrows(TypeError, /^returns\(\): .*not null \(DIV-3\.4\)$/, () => returns(null, () => null));
    assertThrows(TypeError, /^returns\(\): .*not undefined \(DIV-3\.4\)$/, () => returns(undefined, () => null));
    assertThrows(TypeError, /^returns\(\): a return type cannot be variadic/, () => returns(variadic(A), () => null));
    assertThrows(TypeError, /^returns\(\): the second argument must be a function/, () => returns(A, "fn" as unknown as () => null));
    assertThrows(TypeError, /^ReflectionFunction::getReturnType\(\): the return Spec is not/, () => new ReflectionFunction(returns(5, () => null)).getReturnType());
  },
);

xaravelTest(
  "XT-runtime-46",
  "PHP's ReflectionClass, ReflectionMethod, ReflectionFunction, ReflectionParameter, ReflectionNamedType and ReflectionUnionType, registered under their PHP names and exported from the root and php, read parameters from inject maps as PHP 8.5 reflects SupportReflectorTest's and SupportReflectsClosuresTest's fixtures: classes and tokens named by fqcn, String / Number / Boolean / primitive builtin, self / parent unresolved with the declaring class, unions and DNF, variadics, closures with no declaring class; an undeclared function or method is a RuntimeException naming the inject form; class lookup, getParentClass and isSubclassOf; ReflectionException for a missing class or method (DIV-3.2, DIV-3.3)",
  () => {
    for (const [name, klass] of [
      ["ReflectionClass", ReflectionClass],
      ["ReflectionMethod", ReflectionMethod],
      ["ReflectionFunction", ReflectionFunction],
      ["ReflectionParameter", ReflectionParameter],
      ["ReflectionNamedType", ReflectionNamedType],
      ["ReflectionUnionType", ReflectionUnionType],
      ["ReflectionIntersectionType", ReflectionIntersectionType],
      ["ReflectionAttribute", ReflectionAttribute],
      ["ReflectionException", ReflectionException],
      ["Attribute", Attribute],
    ] as const) {
      Assert.assertSame(name, fqcn(klass));
      Assert.assertSame(klass, resolveClass(name));
      Assert.assertSame(klass, (root as Record<string, unknown>)[name], `the root exports ${name}`);
      Assert.assertSame(klass, (php as Record<string, unknown>)[name], `php exports ${name}`);
      // Registered, but not one of the 24 built-ins of the protocol (XT-runtime-35).
      Assert.assertFalse(name in (globalThis as unknown as Record<symbol, object>)[Symbol.for("xaravel.php.classes")]!, `${name} is not in the protocol map`);
    }
    Assert.assertTrue(new ReflectionException() instanceof Exception);

    // testParentClassName: B::f(parent $x).
    const parentParam = new ReflectionClass(B).getMethod("f").getParameters()[0]!;
    Assert.assertSame("x", parentParam.getName());
    Assert.assertSame("x", parentParam.name);
    Assert.assertFalse(parentParam.isVariadic());
    Assert.assertSame(["parent", false], named(parentParam.getType()));
    Assert.assertSame(`${NS}\\B`, parentParam.getDeclaringClass()!.getName());
    Assert.assertSame(`${NS}\\A`, (parentParam.getDeclaringClass()!.getParentClass() as ReflectionClass).getName());

    // A named class, its declaring class.
    class Named {
      @inject({ x: A })
      f(x: unknown): unknown {
        return [x];
      }
    }
    registerClass("XaravelFixture\\Reflection\\Named", Named);
    const method = new ReflectionClass(Named).getMethod("f");
    Assert.assertSame("f", method.getName());
    Assert.assertSame("XaravelFixture\\Reflection\\Named", method.class);
    Assert.assertTrue(method.isPublic());
    const namedParam = method.getParameters()[0]!;
    Assert.assertSame([`${NS}\\A`, false], named(namedParam.getType()));
    Assert.assertSame("XaravelFixture\\Reflection\\Named", namedParam.getDeclaringClass()!.getName());

    // testSelfClassName's shape: self unresolved; builtins.
    const selfParams = new ReflectionClass(SelfHinted).getMethod("newPivot").getParameters();
    Assert.assertSame("other,s,n,b,any", selfParams.map((p) => p.getName()).join(","));
    Assert.assertSame(
      [
        ["self", false],
        ["string", true],
        ["float", true],
        ["bool", true],
        ["mixed", true],
      ],
      selfParams.map((p) => named(p.getType())),
    );
    Assert.assertSame(`${NS}\\SelfHinted`, selfParams[0]!.getDeclaringClass()!.getName());

    // A token: testParameterSubclassOfInterface, f(IB $x), and IB extends IA.
    const tokenParam = new ReflectionClass(TestClassWithInterfaceSubclassParameter).getMethod("f").getParameters()[0]!;
    Assert.assertSame([`${NS}\\IB`, false], named(tokenParam.getType()));
    const ib = new ReflectionClass(IB);
    Assert.assertSame(`${NS}\\IB`, ib.name);
    Assert.assertTrue(ib.isSubclassOf(IA));
    Assert.assertTrue(new ReflectionClass(IC).isSubclassOf(IA));
    Assert.assertTrue(ib.isSubclassOf(new ReflectionClass(IA)));
    Assert.assertFalse(ib.isSubclassOf(IB));
    Assert.assertFalse(new ReflectionClass(IA).isSubclassOf(IB));
    Assert.assertFalse(ib.getParentClass());
    // A token's FQCN is not in the Registry, so it resolves only as a value.
    assertThrows(ReflectionException, `Class "${NS}\\IB" does not exist`, () => new ReflectionClass(`${NS}\\IB`));
    assertThrows(ReflectionException, `Class "${NS}\\IA" does not exist`, () => ib.isSubclassOf(`${NS}\\IA`));

    // isSubclassOf: class against class (strict chain) and against a token (hasBrand).
    const b = new ReflectionClass(B);
    Assert.assertTrue(b.isSubclassOf(A));
    Assert.assertTrue(b.isSubclassOf(`${NS}\\A`));
    Assert.assertTrue(b.isSubclassOf(new ReflectionClass(A)));
    Assert.assertFalse(b.isSubclassOf(B));
    Assert.assertFalse(new ReflectionClass(A).isSubclassOf(B));
    Assert.assertFalse(b.isSubclassOf(C));
    Assert.assertTrue(new ReflectionClass(ImplementsIB).isSubclassOf(IB));
    Assert.assertTrue(new ReflectionClass(ImplementsIB).isSubclassOf(IA));
    Assert.assertFalse(b.isSubclassOf(IA));
    assertThrows(ReflectionException, 'Class "Nope" does not exist', () => b.isSubclassOf("Nope"));
    assertThrows(PhpTypeError, "ReflectionClass::isSubclassOf(): Argument #1 ($class) must be of type ReflectionClass|string, int given", () => b.isSubclassOf(5 as unknown as string));

    // testUnionTypeName: C::f(A|Model $x), and a DNF type.
    const unionType = new ReflectionClass(C).getMethod("f").getParameters()[0]!.getType();
    Assert.assertInstanceOf(ReflectionUnionType, unionType);
    Assert.assertSame(
      [
        [`${NS}\\A`, false],
        [`${NS}\\Model`, false],
      ],
      (unionType as ReflectionUnionType).getTypes().map(named),
    );
    const dnf = new ReflectionFunction(inject({ x: oneOf(allOf(IA, IB), A, String) }, (x: unknown) => [x])).getParameters()[0]!.getType() as ReflectionUnionType;
    const [first, ...rest] = dnf.getTypes();
    Assert.assertInstanceOf(ReflectionIntersectionType, first);
    Assert.assertSame([`${NS}\\IA`, `${NS}\\IB`], (first as ReflectionIntersectionType).getTypes().map((type) => named(type)[0]));
    Assert.assertSame(
      [
        [`${NS}\\A`, false],
        ["string", true],
      ],
      rest.map(named),
    );

    // testReflectsClosures: each closure's parameters, with no declaring class.
    const closures: [readonly [string, string, boolean, boolean][], (...args: never[]) => unknown][] = [
      [[["one", `${NS}\\ExampleParameter`, false, false]], inject({ one: ExampleParameter }, (one: unknown) => [one])],
      [[], inject({}, () => null)],
      [[["one", "mixed", true, false]], inject({ one: primitive }, (one: unknown) => [one])], // DIV-3.3
      [
        [
          ["one", "mixed", true, false], // DIV-3.3
          ["two", `${NS}\\ExampleParameter`, false, false],
        ],
        inject({ one: primitive, two: ExampleParameter }, (one: unknown, two: unknown = null) => [one, two]),
      ],
      [
        [
          ["one", "string", true, false],
          ["two", `${NS}\\ExampleParameter`, false, false],
        ],
        inject({ one: String, two: ExampleParameter }, (one: unknown, two: unknown) => [one, two]),
      ],
      [[["vars", `${NS}\\ExampleParameter`, false, true]], inject({ vars: variadic(ExampleParameter) }, (...vars: unknown[]) => [vars])],
      // testItWorksWithUnionTypes' UnionTypesClosure.php: (ExampleParameter|AnotherExampleParameter $a, $b); PHP's
      // getType() of the untyped $b is null, here declared primitive and read as builtin mixed (DIV-3.3).
      [[["b", "mixed", true, false]], inject({ b: primitive }, (b: unknown) => [b])], // DIV-3.3
    ];
    for (const [expected, closure] of closures) {
      const parameters = new ReflectionFunction(closure).getParameters();
      Assert.assertSame(
        expected.map((row) => [...row]),
        parameters.map((p) => [p.getName(), ...named(p.getType()), p.isVariadic()]),
      );
      for (const p of parameters) {
        Assert.assertNull(p.getDeclaringClass());
      }
    }
    const unionClosure = new ReflectionFunction(inject({ a: oneOf(ExampleParameter, AnotherExampleParameter), b: primitive }, (a: unknown, b: unknown) => [a, b])).getParameters();
    Assert.assertSame([`${NS}\\ExampleParameter`, `${NS}\\AnotherExampleParameter`], (unionClosure[0]!.getType() as ReflectionUnionType).getTypes().map((type) => named(type)[0]));
    Assert.assertSame(["b", "mixed", true], [unionClosure[1]!.getName(), ...named(unionClosure[1]!.getType())]); // DIV-3.3

    // Undeclared: a function and a method (DIV-3.3).
    assertThrows(
      RuntimeException,
      "The closure has no inject declaration, so its parameters cannot be read; declare them with inject({ <param>: <Spec> }, fn) (DIV-3.3)",
      () => new ReflectionFunction((_a: unknown) => null).getParameters(),
    );
    assertThrows(
      RuntimeException,
      `Method ${NS}\\Undeclared::f() has no inject declaration, so its parameters cannot be read; declare them with @inject({ <param>: <Spec> }) (DIV-3.3)`,
      () => new ReflectionClass(Undeclared).getMethod("f").getParameters(),
    );
    // An unknown Spec.
    assertThrows(TypeError, /^ReflectionParameter::getType\(\): the Spec of \$x is not/, () => new ReflectionFunction(inject({ x: 5 }, (x: unknown) => [x])).getParameters()[0]!.getType());

    // Class lookup: a class, an instance, an FQCN, a token.
    for (const subject of [B, new B(), `${NS}\\B`, `\\${NS}\\B`, `${NS.toLowerCase()}\\b`]) {
      Assert.assertSame(`${NS}\\B`, new ReflectionClass(subject).getName());
    }
    Assert.assertFalse(new ReflectionClass(A).getParentClass());
    // The JS Error under PHP's Exception is no PHP parent.
    Assert.assertFalse(new ReflectionClass(Exception).getParentClass());
    Assert.assertSame("Exception", (new ReflectionClass(RuntimeException).getParentClass() as ReflectionClass).getName());
    assertThrows(ReflectionException, 'Class "Nope" does not exist', () => new ReflectionClass("Nope"));
    assertThrows(ReflectionException, 'Class "\\Nope" does not exist', () => new ReflectionClass("\\Nope"));
    assertThrows(PhpTypeError, "ReflectionClass::__construct(): Argument #1 ($objectOrClass) must be of type object|string, int given", () => new ReflectionClass(5 as unknown as string));
    assertThrows(ReflectionException, `Method ${NS}\\B::missing() does not exist`, () => new ReflectionClass(B).getMethod("missing"));
    assertThrows(ReflectionException, `Method ${NS}\\B::constructor() does not exist`, () => new ReflectionClass(B).getMethod("constructor"));
    assertThrows(ReflectionException, `Method ${NS}\\IB::f() does not exist`, () => new ReflectionClass(IB).getMethod("f"));

    // getMethod: an inherited method is declared by its owner; a static method is found on the static side.
    class Child extends B {}
    registerClass("XaravelFixture\\Reflection\\Child", Child);
    const inherited = new ReflectionClass(Child).getMethod("f");
    Assert.assertSame(`${NS}\\B`, inherited.class);
    Assert.assertSame(`${NS}\\B`, inherited.getParameters()[0]!.getDeclaringClass()!.getName());
    const make = new ReflectionMethod(Undeclared, "make");
    Assert.assertSame(`${NS}\\Undeclared`, make.getDeclaringClass().getName());
    Assert.assertSame("f", new ReflectionMethod(new B(), "f").getName());
    Assert.assertSame("f", new ReflectionMethod(`${NS}\\B`, "f").getName());
    assertThrows(PhpTypeError, "ReflectionMethod::__construct(): Argument #2 ($method) must be of type ?string, int given", () => new ReflectionMethod(B, 5 as unknown as string));
    // A user static method named as a JS function's own key is found.
    class Named2 {
      static name(): string {
        return "named";
      }
    }
    registerClass("XaravelFixture\\Reflection\\Named2", Named2);
    Assert.assertSame("name", new ReflectionClass(Named2).getMethod("name").getName());

    // A mixin() layer: getParentClass skips it, and a method it holds is declared by the using class.
    class Base {}
    class T {
      @inject({ x: A })
      m(x: unknown): unknown {
        return x;
      }
    }
    registerClass("XaravelFixture\\Reflection\\Base", Base);
    registerClass("XaravelFixture\\Reflection\\T", T);
    class X extends mixin(Base, T) {}
    registerClass("XaravelFixture\\Reflection\\X", X);
    Assert.assertSame(fqcn(Base), (new ReflectionClass(X).getParentClass() as ReflectionClass).getName());
    const traitMethod = new ReflectionClass(X).getMethod("m");
    Assert.assertSame(fqcn(X), traitMethod.class);
    Assert.assertSame(fqcn(X), traitMethod.getParameters()[0]!.getDeclaringClass()!.getName());

    // ReflectionFunction's arguments.
    assertThrows(ReflectionException, "Function strlen() does not exist", () => new ReflectionFunction("strlen" as unknown as () => null));
    assertThrows(PhpTypeError, "ReflectionFunction::__construct(): Argument #1 ($function) must be of type Closure|string, int given", () => new ReflectionFunction(5 as unknown as () => null));
  },
);

/** The string arguments of `klass`'s `StrAttr` attributes, each built by `newInstance()`. */
function strings(klass: object): string[] {
  return new ReflectionClass(klass).getAttributes(StrAttr).map((entry) => (entry.newInstance() as StrAttr).string);
}

xaravelTest(
  "XT-runtime-47",
  "@attribute(X, ...args) records a class's own PHP attributes in source order, and ReflectionClass.getAttributes(filter) gives them as ReflectionAttribute entries filtered by instanceof, never the parent's, as PHP 8.5 reflects Fixtures/ClassesWithAttributes.php; newInstance() builds the attribute on each call after PHP's checks (non-attribute class, targets, repetition, flags), each PHP's Error with PHP's message; Attribute is an attribute class targeting classes, with PHP 8.5's flags (DIV-12.15)",
  () => {
    // PHP 8.5's flags.
    Assert.assertSame(
      [1, 2, 4, 8, 16, 32, 64, 127, 128],
      [
        Attribute.TARGET_CLASS,
        Attribute.TARGET_FUNCTION,
        Attribute.TARGET_METHOD,
        Attribute.TARGET_PROPERTY,
        Attribute.TARGET_CLASS_CONSTANT,
        Attribute.TARGET_PARAMETER,
        Attribute.TARGET_CONSTANT,
        Attribute.TARGET_ALL,
        Attribute.IS_REPEATABLE,
      ],
    );
    Assert.assertSame(127, new Attribute().flags);
    Assert.assertSame(256, new Attribute(256).flags);
    Assert.assertSame("function", typeof (root as Record<string, unknown>)["attribute"]);
    Assert.assertSame(attribute, (root as Record<string, unknown>)["attribute"]);
    // Attribute is itself #[Attribute(Attribute::TARGET_CLASS)].
    const own = new ReflectionClass(Attribute).getAttributes();
    Assert.assertSame(["Attribute"], own.map((entry) => entry.getName()));
    Assert.assertSame(1, (own[0]!.newInstance() as Attribute).flags);

    // The fixtures: own entries, in source order, per class.
    Assert.assertSame(["quick", "brown", "fox"], strings(ChildClass));
    Assert.assertSame(["lazy", "dog"], strings(ParentClass));
    Assert.assertSame([], new ReflectionClass(ChildClass).getAttributes(UnusedAttr));
    Assert.assertSame([], new ReflectionClass(ChildClass).getAttributes(ParentOnlyAttr));
    Assert.assertSame(1, new ReflectionClass(ParentClass).getAttributes(ParentOnlyAttr).length);
    Assert.assertSame([7], new ReflectionClass(ChildClass).getAttributes(NumAttr).map((entry) => (entry.newInstance() as NumAttr).number));
    Assert.assertSame([2, 3], new ReflectionClass(ParentClass).getAttributes(NumAttr).map((entry) => (entry.newInstance() as NumAttr).number));
    Assert.assertSame(`${FX}\\ChildClass`, new ReflectionClass(ChildClass).name);
    Assert.assertSame(`${FX}\\ParentClass`, (new ReflectionClass(ChildClass).getParentClass() as ReflectionClass).name);
    Assert.assertFalse(new ReflectionClass(ParentClass).getParentClass());
    // No filter: every own entry.
    const all = new ReflectionClass(ChildClass).getAttributes();
    Assert.assertSame(
      [
        [`${FX}\\StrAttr`, "quick"],
        [`${FX}\\StrAttr`, "brown"],
        [`${FX}\\StrAttr`, "fox"],
        [`${FX}\\NumAttr`, 7],
      ],
      all.map((entry) => {
        const made = entry.newInstance() as { string?: string; number?: number };
        return [entry.getName(), made.string ?? made.number];
      }),
    );
    // newInstance() builds a new object each call.
    const quick = all[0]!;
    const one = quick.newInstance();
    Assert.assertInstanceOf(StrAttr, one);
    Assert.assertSame("quick", (one as StrAttr).string);
    Assert.assertFalse(one === quick.newInstance());
    // A class with no attributes, and one whose only decorators are inherited.
    class Bare extends ChildClass {}
    registerClass("XaravelFixture\\Reflection\\Bare", Bare);
    Assert.assertSame([], new ReflectionClass(Bare).getAttributes());
    Assert.assertSame([], new ReflectionClass(A).getAttributes());
    @inject({})
    class Injected extends ChildClass {}
    registerClass("XaravelFixture\\Reflection\\Injected", Injected);
    Assert.assertSame([], new ReflectionClass(Injected).getAttributes());

    // The filter is instanceof: a subclass of the filter matches, where PHP's no-flag call matches the exact name.
    Assert.assertSame(["sub", "base"], strings(Mixed)); // DIV-12.15
    Assert.assertSame(["XaravelFixture\\Reflection\\SubStrAttr"], new ReflectionClass(Mixed).getAttributes(SubStrAttr).map((entry) => entry.getName()));
    Assert.assertSame(3, new ReflectionClass(Mixed).getAttributes().length);

    // The checks of newInstance(), each PHP's Error.
    const first = (klass: object): ReflectionAttribute => new ReflectionClass(klass).getAttributes()[0]!;
    assertThrows(PhpError, 'Attempting to use non-attribute class "XaravelFixture\\Reflection\\Plain" as attribute', () => first(OnPlain).newInstance());
    assertThrows(PhpError, 'Attempting to use non-attribute class "XaravelFixture\\Reflection\\UnmarkedSubStrAttr" as attribute', () => first(OnUnmarked).newInstance());
    assertThrows(PhpError, 'Attribute "XaravelFixture\\Reflection\\MethodOnly" cannot target class (allowed targets: method, property)', () => first(OnMethodOnly).newInstance());
    assertThrows(
      PhpError,
      'Attribute "XaravelFixture\\Reflection\\ManyTargets" cannot target class (allowed targets: function, property, class constant, parameter, constant)',
      () => first(OnManyTargets).newInstance(),
    );
    assertThrows(PhpError, 'Attribute "XaravelFixture\\Reflection\\NotRepeatable" must not be repeated', () => first(OnNotRepeatableTwice).newInstance());
    Assert.assertInstanceOf(NotRepeatable, first(OnNotRepeatableOnce).newInstance());
    assertThrows(PhpError, "Invalid attribute flags specified", () => first(OnBadFlags).newInstance());
    Assert.assertInstanceOf(AllTargets, first(OnAllTargets).newInstance());
    // The entries are listed without the checks: only newInstance() runs them.
    Assert.assertSame("XaravelFixture\\Reflection\\Plain", first(OnPlain).getName());

    // attribute()'s TypeErrors: a non-class attribute, a non-class target.
    assertThrows(TypeError, /^attribute\(\): the attribute must be a class, not string \(DIV-12\.15\)$/, () => attribute("StrAttr" as unknown as typeof StrAttr));
    assertThrows(TypeError, /^attribute\(\): the attribute must be a class, not null/, () => attribute(null as unknown as typeof StrAttr));
    const decorator = attribute(StrAttr, "x");
    assertThrows(TypeError, /^attribute\(\): a method cannot take a PHP attribute; use it on a class \(DIV-12\.15\)$/, () =>
      decorator(() => null, { kind: "method", name: "m", static: false, private: false, metadata: {} } as unknown as DecoratorContext),
    );
    assertThrows(TypeError, /^ReflectionClass::getAttributes\(\): the filter must be an attribute class/, () => new ReflectionClass(ChildClass).getAttributes("StrAttr" as unknown as typeof StrAttr));
  },
);

// ---------------------------------------------------------------------------------------------------------------
// A named type's own class or token (epic-13-retro-item-5-reflector-own-type, finding L1 of the Epic 13 retrospective).

/** An AD-26 string-backed enum, for `ReflectionEnum`'s backing type. */
class OwnTypeSuit {
  static readonly backingType = "string";
  static cases(): OwnTypeSuit[] {
    return [];
  }
}
registerClass(`${NS}\\OwnTypeSuit`, OwnTypeSuit);

/** A named type's `getClassOrToken()`. */
function valueOf(type: unknown): object | null {
  Assert.assertInstanceOf(ReflectionNamedType, type);
  return (type as ReflectionNamedType).getClassOrToken();
}

xaravelTest(
  "XT-runtime-50",
  "ReflectionNamedType.getClassOrToken() (a Xaravel addition (DIV-3.2; decisions/MAINT-2026-10-25-epic-13-items.md, item 5)) gives the class or contract token a Spec holds, beside the FQCN getName() gives: a class and a token give themselves, as do the members of a union and an intersection, a variadic's element and a return type's; String, Number, Boolean, primitive, self, parent and static give null, as does ReflectionEnum's backing type; two tokens recorded with registerContractToken under one FQCN (the first one wins the lookup by name, ESC-13.1-7) each come back as themselves, so a caller can reflect a parameter's own type rather than resolve its name again",
  () => {
    const fn = inject(
      { a: A, ia: IA, s: String, n: Number, b: Boolean, any: primitive, me: self, up: parent, either: oneOf(A, IA, String), both: allOf(IA, IB) },
      (a: unknown, ia: unknown, s: unknown, n: unknown, b: unknown, any: unknown, me: unknown, up: unknown, either: unknown, both: unknown) => [a, ia, s, n, b, any, me, up, either, both],
    );
    const params = new ReflectionFunction(fn).getParameters();
    Assert.assertSame(["a", "ia", "s", "n", "b", "any", "me", "up", "either", "both"], params.map((parameter) => parameter.getName()));
    Assert.assertSame(A, valueOf(params[0]!.getType()));
    Assert.assertSame(`${NS}\\A`, (params[0]!.getType() as ReflectionNamedType).getName());
    Assert.assertSame(IA, valueOf(params[1]!.getType()));
    Assert.assertSame(`${NS}\\IA`, (params[1]!.getType() as ReflectionNamedType).getName());
    for (const parameter of params.slice(2, 8)) {
      Assert.assertNull(valueOf(parameter.getType()), `${parameter.getName()} holds no class or token`);
    }
    const union = params[8]!.getType();
    Assert.assertInstanceOf(ReflectionUnionType, union);
    Assert.assertSame([A, IA, null], (union as ReflectionUnionType).getTypes().map((member) => valueOf(member)));
    const intersection = params[9]!.getType();
    Assert.assertInstanceOf(ReflectionIntersectionType, intersection);
    Assert.assertSame([IA, IB], (intersection as ReflectionIntersectionType).getTypes().map((member) => valueOf(member)));
    // A union's allOf member keeps its members' values.
    const dnf = new ReflectionFunction(inject({ x: oneOf(allOf(IA, IB), A) }, (x: unknown) => x)).getParameters()[0]!.getType() as ReflectionUnionType;
    Assert.assertSame([IA, IB], (dnf.getTypes()[0] as ReflectionIntersectionType).getTypes().map((member) => valueOf(member)));
    Assert.assertSame(A, valueOf(dnf.getTypes()[1]));

    // A variadic's element, and a return type.
    Assert.assertSame(A, valueOf(new ReflectionFunction(inject({ xs: variadic(A) }, (...xs: unknown[]) => xs)).getParameters()[0]!.getType()));
    Assert.assertSame(IB, valueOf(new ReflectionFunction(returns(IB, () => null)).getReturnType()));
    Assert.assertSame(A, valueOf(new ReflectionFunction(returns(A, () => null)).getReturnType()));
    Assert.assertNull(valueOf(new ReflectionFunction(returns(static_, () => null)).getReturnType()));
    Assert.assertNull(valueOf(new ReflectionFunction(returns(String, () => null)).getReturnType()));

    // ReflectionEnum's backing type is a builtin, with no value.
    const backing = new ReflectionEnum(OwnTypeSuit).getBackingType();
    Assert.assertSame(["string", true], named(backing));
    Assert.assertNull(valueOf(backing));

    // Two tokens under one FQCN: each named type holds its own token, though both give the same name.
    const first = token(`${NS}\\OwnTypeSame`);
    const second = token(`${NS}\\OwnTypeSame`, [IA]);
    registerContractToken(first);
    registerContractToken(second);
    // The lookup by name gives the first token, which has no parent.
    Assert.assertFalse(new ReflectionClass(`${NS}\\OwnTypeSame`).isSubclassOf(IA));
    Assert.assertTrue(new ReflectionClass(second).isSubclassOf(IA));
    const [one, two] = new ReflectionFunction(inject({ one: first, two: second }, (one: unknown, two: unknown) => [one, two])).getParameters();
    Assert.assertSame((one!.getType() as ReflectionNamedType).getName(), (two!.getType() as ReflectionNamedType).getName());
    Assert.assertSame(first, valueOf(one!.getType()));
    Assert.assertSame(second, valueOf(two!.getType()));
    Assert.assertFalse(valueOf(one!.getType()) === valueOf(two!.getType()));

    // The builder's default: no value.
    Assert.assertNull(new ReflectionNamedType("string", true).getClassOrToken());
  },
);
