// Xaravel Tests for Story 13.1: `Reflector` and `ReflectsClosures` read a callable's declared types from its `inject`
// metadata (XT-reflection-1, with the I/O matrix rows of the Story's spec: `self` / `parent`, unions, variadics, return
// types, every `isCallable` edge of DIV-9.14, and the class attribute helpers of DIV-12.15), and an undeclared closure
// throws the runtime's `RuntimeException` naming the `inject` form (XT-reflection-2). FR-26 lists Reflection among its
// Upstream Components. Every FQCN here is registered under `Xaravel\Tests\Reflection\…` with `registerClass`, so it
// is used by this file only.
import { Assert, xaravelTest } from "@xaravel/assert";
import { contract } from "@xaravel/contracts";
import { Reflector, ReflectsClosures } from "@xaravel/reflection";
import {
  allOf,
  BlockedByComponentError,
  fqcn,
  inject,
  mixin,
  oneOf,
  parent,
  primitive,
  registerClass,
  returns,
  RuntimeException,
  self,
  static as static_,
  variadic,
} from "@xaravel/runtime";
import { Attribute, attribute, ReflectionClass, ReflectionException, ReflectionFunction, type ReflectionParameter } from "@xaravel/runtime/php";

const NS = "Xaravel\\Tests\\Reflection";

/** A PHP `Closure`. */
type Closure = (...args: never[]) => unknown;

class OrderShipped {}
registerClass(`${NS}\\OrderShipped`, OrderShipped);

class Invoice {}
registerClass(`${NS}\\Invoice`, Invoice);

class Listener {
  @inject({ event: OrderShipped })
  handle(event: OrderShipped): void {
    void event;
  }

  @inject({ other: self, name: String, count: Number, flag: Boolean, any: primitive })
  compare(other: Listener, name: string, count: number, flag: boolean, any: unknown): void {
    void [other, name, count, flag, any];
  }

  @inject({ event: oneOf(OrderShipped, String, Invoice) })
  union(event: OrderShipped | string | Invoice): void {
    void event;
  }

  @inject({ event: oneOf(String, Number) })
  builtinUnion(event: string | number): void {
    void event;
  }

  @inject({ events: variadic(OrderShipped) })
  many(...events: OrderShipped[]): void {
    void events;
  }

  @inject({ x: parent })
  orphan(x: unknown): void {
    void x;
  }

  #hidden(): void {}

  unhide(): void {
    this.#hidden();
  }
}
registerClass(`${NS}\\Listener`, Listener);

class Base {}
registerClass(`${NS}\\Base`, Base);

class Derived extends Base {
  @inject({ x: parent })
  f(x: Base): void {
    void x;
  }

  static make(): Derived {
    return new Derived();
  }
}
registerClass(`${NS}\\Derived`, Derived);

class Consumer {
  @inject({ x: Derived })
  take(x: Derived): void {
    void x;
  }
}
registerClass(`${NS}\\Consumer`, Consumer);

class Invokable {
  __invoke(): string {
    return "invoked";
  }
}
registerClass(`${NS}\\Invokable`, Invokable);

class Unregistered {
  f(): void {}
}

class Magic {
  __call(method: string, parameters: unknown[]): void {
    void [method, parameters];
  }

  static __callStatic(method: string, parameters: unknown[]): void {
    void [method, parameters];
  }
}
registerClass(`${NS}\\Magic`, Magic);

class Reflecting extends mixin(null, ReflectsClosures) {
  static types(closure: Closure): Record<string, string | null> {
    return new this().closureParameterTypes(closure);
  }

  static first(closure: Closure): string {
    return new this().firstClosureParameterType(closure);
  }

  static firstAll(closure: Closure): string[] {
    return new this().firstClosureParameterTypes(closure);
  }

  static returnTypes(closure: Closure): string[] {
    return new this().closureReturnTypes(closure);
  }
}
registerClass(`${NS}\\Reflecting`, Reflecting);

const Shippable = contract(`${NS}\\Shippable`);
const Billable = contract(`${NS}\\Billable`);

/** Counts the attribute instances built, to show `getClassAttribute` builds every match first. */
const built: string[] = [];

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class Tag {
  constructor(public value: string) {
    built.push(value);
  }
}
registerClass(`${NS}\\Tag`, Tag);

@attribute(Attribute, Attribute.TARGET_CLASS)
class Unused {}
registerClass(`${NS}\\Unused`, Unused);

@attribute(Tag, "parent-1")
class TaggedParent {}
registerClass(`${NS}\\TaggedParent`, TaggedParent);

@attribute(Tag, "child-1")
@attribute(Tag, "child-2")
class TaggedChild extends TaggedParent {}
registerClass(`${NS}\\TaggedChild`, TaggedChild);

class UntaggedChild extends TaggedParent {}
registerClass(`${NS}\\UntaggedChild`, UntaggedChild);

/** The error `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** The first parameter of `method` on `klass`. */
function parameterOf(klass: object, method: string): ReflectionParameter {
  return new ReflectionClass(klass).getMethod(method).getParameters()[0]!;
}

xaravelTest(
  "XT-reflection-1",
  "FR-26 (Reflection): for a method declared `@inject({ event: OrderShipped })` and a closure declared `inject({ event: OrderShipped }, fn)`, getParameterClassName / firstClosureParameterType give fqcn(OrderShipped) from the metadata; builtins (String, Number, Boolean, primitive) and unions give null, getParameterClassNames lists a union's classes without builtins, `self` / `parent` resolve against the declaring class (`parent` without a registered parent stays 'parent'), variadics give null, closureReturnTypes keeps only class return types; isCallable follows DIV-9.14's edges and never throws; getClassAttribute builds every match first and gives the first or null, and getClassAttributes throws BlockedByComponentError(collections)",
  () => {
    // The declared class, from a method's and a closure's inject metadata.
    Assert.assertSame(fqcn(OrderShipped), Reflector.getParameterClassName(parameterOf(Listener, "handle")));
    const closure = inject({ event: OrderShipped }, (event: OrderShipped) => event);
    Assert.assertSame(fqcn(OrderShipped), Reflecting.first(closure));
    Assert.assertSame({ event: fqcn(OrderShipped) }, Reflecting.types(closure));
    Assert.assertSame([fqcn(OrderShipped)], Reflecting.firstAll(closure));

    // `self` is the declaring class; builtins and `primitive` name no class.
    const compare = new ReflectionClass(Listener).getMethod("compare").getParameters();
    Assert.assertSame([fqcn(Listener), null, null, null, null], compare.map((parameter) => Reflector.getParameterClassName(parameter)));
    Assert.assertSame([[fqcn(Listener)], [], [], [], []], compare.map((parameter) => Reflector.getParameterClassNames(parameter)));

    // A union: no single class name; its classes in order, builtins dropped.
    Assert.assertNull(Reflector.getParameterClassName(parameterOf(Listener, "union")));
    Assert.assertSame([fqcn(OrderShipped), fqcn(Invoice)], Reflector.getParameterClassNames(parameterOf(Listener, "union")));
    Assert.assertSame([], Reflector.getParameterClassNames(parameterOf(Listener, "builtinUnion")));

    // `parent` resolves to the registered parent; with none, PHP's name stays as written.
    Assert.assertSame(fqcn(Base), Reflector.getParameterClassName(parameterOf(Derived, "f")));
    Assert.assertSame("parent", Reflector.getParameterClassName(parameterOf(Listener, "orphan")));

    // isParameterSubclassOf, for a class hint: a class, a registered FQCN, never itself.
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Consumer, "take"), Base));
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Consumer, "take"), `${NS}\\Base`));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(Derived, "f"), Base));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(Listener, "handle"), `${NS}\\Invoice`));
    Assert.assertFalse(Reflector.isParameterSubclassOf(compare[1]!, Base));
    Assert.assertTrue(thrownBy(() => Reflector.isParameterSubclassOf(parameterOf(Listener, "handle"), "Missing\\Name")) instanceof ReflectionException);

    // A variadic parameter gives null; a closure's `self` has no declaring class, so it stays 'self'.
    const trailing = inject({ first: Invoice, events: variadic(OrderShipped) }, (first: Invoice, ...events: OrderShipped[]) => [first, events]);
    Assert.assertSame({ first: fqcn(Invoice), events: null }, Reflecting.types(trailing));
    Assert.assertSame(fqcn(OrderShipped), Reflector.getParameterClassName(new ReflectionFunction(trailing).getParameters()[1]!));
    Assert.assertSame({ events: null }, Reflecting.types(inject({ events: variadic(OrderShipped) }, (...events: OrderShipped[]) => events)));
    // Reflector itself reads a variadic's element type, as PHP does; only ReflectsClosures maps a variadic to null.
    Assert.assertSame(fqcn(OrderShipped), Reflector.getParameterClassName(parameterOf(Listener, "many")));
    const variadicClosure = inject({ events: variadic(OrderShipped) }, (...events: OrderShipped[]) => events);
    Assert.assertSame(RuntimeException, (thrownBy(() => Reflecting.firstAll(variadicClosure)) as object).constructor);
    Assert.assertSame("The first parameter of the given Closure is missing a type hint.", (thrownBy(() => Reflecting.first(variadicClosure)) as Error).message);
    Assert.assertSame({ me: "self" }, Reflecting.types(inject({ me: self }, (me: unknown) => me)));
    Assert.assertSame([fqcn(OrderShipped), fqcn(Invoice)], Reflecting.firstAll(inject({ event: oneOf(OrderShipped, Invoice) }, (event: unknown) => event)));

    // No parameters / no first type: Upstream's messages.
    Assert.assertSame("The given Closure has no parameters.", (thrownBy(() => Reflecting.first(inject({}, () => null))) as Error).message);
    Assert.assertSame("The given Closure has no parameters.", (thrownBy(() => Reflecting.firstAll(inject({}, () => null))) as Error).message);
    Assert.assertSame("The first parameter of the given Closure is missing a type hint.", (thrownBy(() => Reflecting.first(inject({ a: primitive }, (a: unknown) => a))) as Error).message);

    // Return types: a class, a union's classes, and nothing for builtins, self, static, an intersection or none.
    Assert.assertSame([fqcn(OrderShipped)], Reflecting.returnTypes(returns(OrderShipped, () => new OrderShipped())));
    Assert.assertSame([fqcn(OrderShipped)], Reflecting.returnTypes(returns(oneOf(OrderShipped, String), () => new OrderShipped())));
    Assert.assertSame([], Reflecting.returnTypes(returns(String, () => "x")));
    Assert.assertSame([], Reflecting.returnTypes(returns(self, () => null)));
    Assert.assertSame([], Reflecting.returnTypes(returns(static_, () => null)));
    Assert.assertSame([], Reflecting.returnTypes(returns(allOf(Shippable, Billable), () => null)));
    Assert.assertSame([], Reflecting.returnTypes(() => null));

    // isCallable (DIV-9.14): closures, invokable objects, 'Class::method' strings; registered classes stand for
    // class-strings; `#private` methods are unreachable; unknown strings and unregistered classes are not callable.
    Assert.assertTrue(Reflector.isCallable(() => null));
    Assert.assertTrue(Reflector.isCallable(new Invokable()));
    Assert.assertFalse(Reflector.isCallable(Invokable));
    Assert.assertTrue(Reflector.isCallable(Invokable, true));
    Assert.assertFalse(Reflector.isCallable(new OrderShipped()));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Derived::make`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Listener::handle`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Magic::anything`));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Listener::missing`));
    Assert.assertFalse(Reflector.isCallable("Missing\\Name::method"));
    Assert.assertFalse(Reflector.isCallable("strtoupper"));
    Assert.assertTrue(Reflector.isCallable("strtoupper", true));
    Assert.assertFalse(Reflector.isCallable(5));
    Assert.assertFalse(Reflector.isCallable(null));
    Assert.assertTrue(Reflector.isCallable([`${NS}\\Listener`, "handle"]));
    Assert.assertTrue(Reflector.isCallable([new Listener(), "unhide"]));
    Assert.assertFalse(Reflector.isCallable([new Listener(), "#hidden"]));
    Assert.assertFalse(Reflector.isCallable([new Listener(), "hidden"]));
    Assert.assertTrue(Reflector.isCallable([new Magic(), "anything"]));
    Assert.assertTrue(Reflector.isCallable([Magic, "anything"]));
    Assert.assertFalse(Reflector.isCallable([Unregistered, "f"]));
    Assert.assertFalse(Reflector.isCallable([new Unregistered(), "f"]));
    Assert.assertTrue(Reflector.isCallable([new Unregistered(), "f"], true));
    Assert.assertFalse(Reflector.isCallable([Listener, 5]));
    Assert.assertFalse(Reflector.isCallable([Listener]));
    Assert.assertFalse(Reflector.isCallable([]));
    Assert.assertFalse(Reflector.isCallable([null, "handle"]));

    // getClassAttribute: every match on the walked classes is built first, then the first is returned, or null.
    built.length = 0;
    const tag = Reflector.getClassAttribute(TaggedChild, Tag, true);
    Assert.assertInstanceOf(Tag, tag);
    Assert.assertSame("child-1", tag!.value);
    Assert.assertSame(["child-1", "child-2", "parent-1"], built);
    built.length = 0;
    Assert.assertSame("child-1", Reflector.getClassAttribute(new TaggedChild(), Tag)!.value);
    Assert.assertSame(["child-1", "child-2"], built);
    Assert.assertNull(Reflector.getClassAttribute(UntaggedChild, Tag));
    Assert.assertSame("parent-1", Reflector.getClassAttribute(`${NS}\\UntaggedChild`, Tag, true)!.value);
    Assert.assertNull(Reflector.getClassAttribute(TaggedChild, Unused, true));
    Assert.assertTrue(thrownBy(() => Reflector.getClassAttribute("Missing\\Name", Tag)) instanceof ReflectionException);

    // getClassAttributes returns a Collection, which Epic 14 builds.
    const blocked = thrownBy(() => Reflector.getClassAttributes(TaggedChild, Tag));
    Assert.assertTrue(blocked instanceof BlockedByComponentError);
    Assert.assertSame("collections", (blocked as BlockedByComponentError).component);
  },
);

xaravelTest(
  "XT-reflection-2",
  "FR-26 (Reflection): a closure with no inject declaration throws Upstream's exception type, RuntimeException, whose message names the `inject({ <param>: <Spec> }, fn)` form, through each of closureParameterTypes, firstClosureParameterType and firstClosureParameterTypes",
  () => {
    const undeclared = (event: OrderShipped): OrderShipped => event;
    const reads: ((closure: Closure) => unknown)[] = [(closure) => Reflecting.types(closure), (closure) => Reflecting.first(closure), (closure) => Reflecting.firstAll(closure)];
    for (const read of reads) {
      const error = thrownBy(() => read(undeclared));
      Assert.assertTrue(error instanceof RuntimeException, `expected a RuntimeException: ${String(error)}`);
      Assert.assertStringContainsString("inject({ <param>: <Spec> }, fn)", (error as RuntimeException).getMessage());
    }
  },
);
