// Xaravel Tests for Story 13.1: `Reflector` and `ReflectsClosures` read a callable's declared types from its `inject`
// metadata (XT-reflection-1, with the I/O matrix rows of the Story's spec: `self` / `parent`, unions, variadics, return
// types, every `isCallable` edge of DIV-9.14, and the class attribute helpers of DIV-12.15), and an undeclared closure
// throws the runtime's `RuntimeException` naming the `inject` form (XT-reflection-2). XT-reflection-1 also covers
// interface hints (contract tokens, ESC-13.1-7's ruling) and AD-26 backed enums (ESC-13.1-8's ruling). XT-reflection-3
// classifies every Test ID from the Expectations shards, and XT-reflection-4 is the close gate (api-surface, docs).
// XT-reflection-5 is action item epic-13-retro-item-5-reflector-own-type: isParameterSubclassOf reads the parameter's
// own token (finding L1), a bare unregistered class (L4), a parameter typed with one (L5), and PHP 8's static rule for
// a 'Class::method' string (item 6 (b) of decisions/MAINT-2026-10-25-epic-13-items.md). XT-reflection-6 is action item
// epic-15-retro-item-10-runtime-trait-registry: `ReflectsClosures` is declared a PHP trait with `registerTrait`.
// FR-26 lists Reflection among its Upstream Components. Every FQCN here is registered under `Xaravel\Tests\Reflection\…` with `registerClass`, so it
// is used by this file only.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Collection } from "@xaravel/collections";
import { contract } from "@xaravel/contracts";
import { Reflector, ReflectsClosures } from "@xaravel/reflection";
import {
  allOf,
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
import { Attribute, attribute, class_exists, ReflectionClass, ReflectionException, ReflectionFunction, type ReflectionParameter, trait_exists } from "@xaravel/runtime/php";
import { resolveClass } from "@xaravel/runtime/registry";

const NS = "Xaravel\\Tests\\Reflection";
const REPO = resolve(import.meta.dir, "..", "..", "..", "..");
const PACKAGE = join(REPO, "packages", "reflection");

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

/** A `self` hint in a subclass of `Base` (XT-reflection-5). */
class SelfTyped extends Base {
  @inject({ x: self })
  f(x: SelfTyped): void {
    void x;
  }
}
registerClass(`${NS}\\SelfTyped`, SelfTyped);

/** A registered subclass of `Derived`, inheriting `static make()` (XT-reflection-5). */
class DerivedChild extends Derived {}
registerClass(`${NS}\\DerivedChild`, DerivedChild);

/** An instance `go()` beside a `static go()` of the same name, and a subclass inheriting both (XT-reflection-5). */
class Shadowing {
  go(): void {}

  static go(): void {}
}
registerClass(`${NS}\\Shadowing`, Shadowing);

class ShadowingChild extends Shadowing {}
registerClass(`${NS}\\ShadowingChild`, ShadowingChild);

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

declare const ShippableBrand: unique symbol;
const Shippable = contract<object, typeof ShippableBrand>(`${NS}\\Shippable`);
const Billable = contract(`${NS}\\Billable`);

/** Interface hints: `Child` extends `Shippable`; `Billable` is unrelated. */
const ShippableChild = contract(`${NS}\\ShippableChild`, {}, [Shippable]);

// AD-26 enums: a string-backed, an int-backed and a pure enum.
class Status {
  static readonly backingType = "string";
  static readonly Open = new Status("open");
  constructor(readonly value: string) {}
  static cases(): Status[] {
    return [Status.Open];
  }
}
registerClass(`${NS}\\Status`, Status);

class Priority {
  static readonly backingType = "int";
  static readonly High = new Priority(1);
  constructor(readonly value: number) {}
  static cases(): Priority[] {
    return [Priority.High];
  }
}
registerClass(`${NS}\\Priority`, Priority);

class Flavour {
  static readonly Plain = new Flavour();
  static cases(): Flavour[] {
    return [Flavour.Plain];
  }
}
registerClass(`${NS}\\Flavour`, Flavour);

/** A class that implements `Shippable` through its brand getter. */
class Parcel {
  get [Shippable.brand](): true {
    return true;
  }
}
registerClass(`${NS}\\Parcel`, Parcel);

class Typed {
  @inject({ x: Parcel })
  parcel(x: Parcel): void {
    void x;
  }

  @inject({ x: ShippableChild })
  token(x: unknown): void {
    void x;
  }

  @inject({ status: Status, priority: Priority, flavour: Flavour, invoice: Invoice, either: oneOf(Status, Invoice), any: primitive, name: String })
  enums(status: Status, priority: Priority, flavour: Flavour, invoice: Invoice, either: Status | Invoice, any: unknown, name: string): void {
    void [status, priority, flavour, invoice, either, any, name];
  }
}
registerClass(`${NS}\\Typed`, Typed);

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
  "FR-26 (Reflection): for a method declared `@inject({ event: OrderShipped })` and a closure declared `inject({ event: OrderShipped }, fn)`, getParameterClassName / firstClosureParameterType give fqcn(OrderShipped) from the metadata; builtins (String, Number, Boolean, primitive) and unions give null, getParameterClassNames lists a union's classes without builtins, `self` / `parent` resolve against the declaring class (`parent` without a registered parent stays 'parent'), a variadic parameter gives null in closureParameterTypes and makes firstClosureParameterType / firstClosureParameterTypes throw the missing-type-hint RuntimeException, while getParameterClassName gives its element class's fqcn as PHP does, closureReturnTypes keeps only class return types; isParameterSubclassOf resolves a contract-token hint as PHP's interface_exists does, true against the token's parent and false against itself or an unrelated token, and a class hint is a subclass of a token the class implements through its brand getter, given as the token or its FQCN (ESC-13.1-7); isParameterBackedEnumWithStringBackingType is true for a string-backed AD-26 enum and false for an int-backed, a pure enum, a non-enum class, a union, an untyped or a builtin parameter (ESC-13.1-8); isCallable follows DIV-9.14's edges (under syntaxOnly, an array whose first element is a string, an object or a constructor, registered or not, is callable without a method lookup) and never throws; getClassAttribute builds every match first and gives the first or null, and getClassAttributes returns a Collection of the class's instances, or, with includeParents, a Collection keyed by each walked class's FQCN whose values are Collections, building every walked class's matches in walk order, for a class or an instance, and throws ReflectionException for an unknown FQCN",
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

    // isParameterSubclassOf, for an interface hint: a contract token's FQCN resolves (interface_exists).
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Typed, "token"), Shippable));
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Typed, "token"), `${NS}\\Shippable`));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(Typed, "token"), ShippableChild));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(Typed, "token"), Billable));
    // A class hint against a contract token the class implements through its brand getter, and its FQCN.
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Typed, "parcel"), Shippable));
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(Typed, "parcel"), `${NS}\\Shippable`));

    // isParameterBackedEnumWithStringBackingType: only a string-backed AD-26 enum.
    const enums = new ReflectionClass(Typed).getMethod("enums").getParameters();
    Assert.assertSame([true, false, false, false, false, false, false], enums.map((parameter) => Reflector.isParameterBackedEnumWithStringBackingType(parameter)));

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
    // PHP 8's is_callable: a 'Class::method' string naming an instance method is not callable (Maintainer's ruling,
    // item 6 (b) of decisions/MAINT-2026-10-25-epic-13-items.md).
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Listener::handle`));
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
    Assert.assertTrue(Reflector.isCallable([Listener, "missing"], true));
    Assert.assertTrue(Reflector.isCallable([Unregistered, "missing"], true));
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

    // getClassAttributes: a Collection of the class's instances, or keyed by FQCN in walk order with its parents.
    built.length = 0;
    const own = Reflector.getClassAttributes(TaggedChild, Tag);
    Assert.assertInstanceOf(Collection, own);
    Assert.assertSame(["child-1", "child-2"], own.all().map((instance: Tag) => instance.value));
    Assert.assertSame(["child-1", "child-2"], built);
    built.length = 0;
    const withParents = Reflector.getClassAttributes(TaggedChild, Tag, true);
    Assert.assertInstanceOf(Collection, withParents);
    Assert.assertSame([fqcn(TaggedChild), fqcn(TaggedParent)], withParents.keys().all());
    Assert.assertTrue(withParents.every((list: unknown) => list instanceof Collection));
    Assert.assertSame(["child-1", "child-2", "parent-1"], built);
    Assert.assertSame(["child-1", "child-2"], (withParents.get(fqcn(TaggedChild)) as Collection).all().map((instance: Tag) => instance.value));
    Assert.assertSame(["parent-1"], (withParents.get(fqcn(TaggedParent)) as Collection).all().map((instance: Tag) => instance.value));
    const parentOnly = Reflector.getClassAttributes(TaggedParent, Tag, true);
    Assert.assertSame([fqcn(TaggedParent)], parentOnly.keys().all());
    Assert.assertInstanceOf(Collection, parentOnly.get(fqcn(TaggedParent)));
    Assert.assertSame([fqcn(TaggedChild), fqcn(TaggedParent)], Reflector.getClassAttributes(new TaggedChild(), Tag, true).keys().all());
    built.length = 0;
    Assert.assertSame(["child-1", "child-2"], Reflector.getClassAttributes(new TaggedChild(), Tag).all().map((instance: Tag) => instance.value));
    Assert.assertSame(["child-1", "child-2"], built);
    Assert.assertSame([], Reflector.getClassAttributes(TaggedChild, Unused).toArray());
    Assert.assertSame({ [fqcn(TaggedChild)]: [], [fqcn(TaggedParent)]: [] }, Reflector.getClassAttributes(TaggedChild, Unused, true).toArray());
    Assert.assertTrue(thrownBy(() => Reflector.getClassAttributes("Missing\\Name", Tag)) instanceof ReflectionException);
  },
);

xaravelTest(
  "XT-reflection-5",
  "isParameterSubclassOf reflects the parameter's own class or token (ReflectionNamedType.getClassOrToken(), a Xaravel addition (DIV-3.2; decisions/MAINT-2026-10-25-epic-13-items.md, item 5)), and a self hint, which holds none, its resolved declaring class: of two contract() tokens recorded under one FQCN, a parameter typed with the second is a subclass of the second's parent and one typed with the first is not, though the Registry's lookup by that name gives the first (ESC-13.1-7); a 'Class::method' string is callable only for a static method, its own or inherited from a registered parent, or, when the class has no such method, through __callStatic, as PHP 8's is_callable gives (an instance method is not, nor one that shadows a static method of the same name, though under syntaxOnly any such string is), while the array form still accepts an instance method; a bare unregistered class is a plain function to the Registry, so isCallable is true and never throws; a parameter typed with an unregistered class makes getParameterClassName, getParameterClassNames and isParameterSubclassOf throw the runtime's TypeError from fqcn() (DIV-3.2, DIV-9.14)",
  () => {
    // L1: two tokens under one FQCN, each answering for itself.
    const OwnParent = contract(`${NS}\\OwnTypeParent`);
    const FirstToken = contract(`${NS}\\OwnTypeSame`);
    const SecondToken = contract(`${NS}\\OwnTypeSame`, {}, [OwnParent]);
    Assert.assertSame(fqcn(FirstToken), fqcn(SecondToken));
    const typedSecond = new ReflectionFunction(inject({ x: SecondToken }, (x: unknown) => x)).getParameters()[0]!;
    const typedFirst = new ReflectionFunction(inject({ x: FirstToken }, (x: unknown) => x)).getParameters()[0]!;
    Assert.assertSame(`${NS}\\OwnTypeSame`, Reflector.getParameterClassName(typedSecond));
    Assert.assertTrue(Reflector.isParameterSubclassOf(typedSecond, OwnParent));
    Assert.assertTrue(Reflector.isParameterSubclassOf(typedSecond, `${NS}\\OwnTypeParent`));
    Assert.assertFalse(Reflector.isParameterSubclassOf(typedFirst, OwnParent));
    // The lookup by name still gives the first token: only the parameter's own type answers for the second.
    Assert.assertFalse(new ReflectionClass(`${NS}\\OwnTypeSame`).isSubclassOf(OwnParent));
    // A `self` / `parent` hint holds no class, so it reflects its resolved name.
    Assert.assertTrue(Reflector.isParameterSubclassOf(parameterOf(SelfTyped, "f"), Base));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(SelfTyped, "f"), SelfTyped));
    Assert.assertFalse(Reflector.isParameterSubclassOf(parameterOf(Derived, "f"), Base));

    // 'Class::method' strings (PHP 8): static, inherited static, instance, shadowed static, magic static, missing.
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Derived::make`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\DerivedChild::make`));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Shadowing::go`));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\ShadowingChild::go`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Listener::handle`, true));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Listener::handle`));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Magic::__call`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Magic::__callStatic`));
    Assert.assertTrue(Reflector.isCallable(`${NS}\\Magic::anything`));
    Assert.assertFalse(Reflector.isCallable(`${NS}\\Listener::missing`));
    // The array form keeps Laravel's rules, which accept an instance method.
    Assert.assertTrue(Reflector.isCallable([`${NS}\\Listener`, "handle"]));
    Assert.assertTrue(Reflector.isCallable([Listener, "handle"]));

    // L4: a bare unregistered class is a plain function to the Registry.
    Assert.assertTrue(Reflector.isCallable(Unregistered));
    Assert.assertTrue(Reflector.isCallable(Unregistered, true));

    // L5: a parameter typed with an unregistered class throws fqcn()'s TypeError when its type is read.
    const unregistered = new ReflectionFunction(inject({ x: Unregistered }, (x: unknown) => x)).getParameters()[0]!;
    for (const read of [
      () => Reflector.getParameterClassName(unregistered),
      () => Reflector.getParameterClassNames(unregistered),
      () => Reflector.isParameterSubclassOf(unregistered, Base),
    ]) {
      const error = thrownBy(read);
      Assert.assertSame(TypeError, (error as object | null)?.constructor ?? null);
      Assert.assertStringStartsWith("fqcn(): the class is not registered", (error as Error).message);
    }
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

/** A `bun run <script> <args>` from the repository root, without colour. */
function bunRun(script: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["run", script, ...args], { cwd: REPO, encoding: "utf8", timeout: 240000, env: { ...process.env, NO_COLOR: "1" } });
}

/** A run's stdout and stderr, with its spawn error, for a failure message. */
function outputOf(run: SpawnSyncReturns<string>): string {
  return `${run.error === undefined ? "" : `${String(run.error)}\n`}${run.stdout ?? ""}${run.stderr ?? ""}`;
}

/** The `## <title>` section of a markdown page, or "" when it has none. */
function section(page: string, title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  if (start === -1) {
    return "";
  }
  const next = page.indexOf("\n## ", start + 1);
  return page.slice(start, next === -1 ? page.length : next);
}

/** The `test_ids` list of `stories/13.1.md`'s front matter. */
function manifestTestIds(): string[] {
  const manifest = readFileSync(join(REPO, "stories", "13.1.md"), "utf8");
  const frontMatter = manifest.split("\n---", 2)[0] ?? "";
  const list = frontMatter.slice(frontMatter.indexOf("\ntest_ids:\n") + "\ntest_ids:\n".length);
  const ids: string[] = [];
  for (const line of list.split("\n")) {
    const match = /^ {2}- "(.*)"$/.exec(line);
    if (match === null) {
      break;
    }
    ids.push((match[1] ?? "").replaceAll("\\\\", "\\"));
  }
  return ids;
}

/** One Expectations line. */
interface ExpectationLine {
  id: string;
  variant: string;
  status: string;
  reason: string | null;
  adapted: string | null;
  escalation: string | null;
}

xaravelTest(
  "XT-reflection-3",
  "FR-26 (Reflection): every one of Story 13.1's 24 manifest Test IDs has exactly one line in the reflection Expectations shards, none is `not-ported-yet` or names an open Escalation; a `pass` line is adapted under null or a DIV-3, DIV-9 or DIV-12 clause that exists in decisions/, and a `skip` line is `blocked-by:<component>` (the tests that need PHP-only reflection are adapted, and those that need a later Component wait on it)",
  () => {
    const shards = ["SupportReflectorTest.jsonl", "SupportReflectsClosuresTest.jsonl"];
    const lines: ExpectationLine[] = shards.flatMap((shard) =>
      readFileSync(join(REPO, "conformance", "expectations", "reflection", "framework", "tests", "Support", shard), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as ExpectationLine),
    );

    const ids = manifestTestIds();
    Assert.assertCount(24, ids);
    Assert.assertCount(24, lines);
    for (const id of ids) {
      const matching = lines.filter((line) => line.id === id);
      Assert.assertCount(1, matching, `${id} has exactly one Expectations line`);
      const line = matching[0]!;
      Assert.assertNull(line.escalation, `${id} names no Escalation`);
      Assert.assertNotSame("not-ported-yet", line.reason, `${id} is not not-ported-yet`);
      if (line.status === "pass") {
        Assert.assertNull(line.reason, `${id} passes with no reason`);
        if (line.adapted !== null) {
          const clause = /^DIV-(3|9|12)\.(\d+)$/.exec(line.adapted);
          Assert.assertNotNull(clause, `${id}'s adapted ${line.adapted} is a DIV-3, DIV-9 or DIV-12 clause`);
          const record = readFileSync(join(REPO, "decisions", `DIV-${clause![1] ?? ""}.md`), "utf8");
          Assert.assertStringContainsString(`**${line.adapted}**`, record, `${line.adapted} is a clause of decisions/DIV-${clause![1] ?? ""}.md`);
        }
      } else {
        Assert.assertSame("skip", line.status, `${id} is pass or skip`);
        Assert.assertMatchesRegularExpression(/^blocked-by:[a-z-]+$/, line.reason ?? "", `${id} is blocked-by:<component>`);
        Assert.assertNull(line.adapted, `${id} is skipped, so not adapted`);
      }
    }
  },
);

xaravelTest(
  "XT-reflection-4",
  "@xaravel/reflection is complete: `bun run api-surface:gate reflection` reports 0 unexplained (AD-15); docs/reflection.md documents every Reflector static and ReflectsClosures' four methods, and has a Divergences section citing DIV-3.2, DIV-3.3, DIV-3.4, DIV-9.14, DIV-12.14 and DIV-12.15, every DIV clause it cites exists and every ESC it cites has a ruling in decisions/ (a decision record whose front matter has a `decision:` line, approved or rejected); the README links the docs page",
  () => {
    const gate = bunRun("api-surface:gate", ["reflection"]);
    Assert.assertSame(0, gate.status, outputOf(gate));
    Assert.assertStringContainsString("api-surface:gate reflection: 0 unexplained (AD-15)", gate.stdout ?? "", outputOf(gate));

    const page = readFileSync(join(PACKAGE, "docs", "reflection.md"), "utf8");
    const documented = [
      "Reflector.isCallable(",
      "Reflector.getClassAttribute(",
      "Reflector.getClassAttributes(",
      "Reflector.getParameterClassName(",
      "Reflector.getParameterClassNames(",
      "Reflector.isParameterSubclassOf(",
      "Reflector.isParameterBackedEnumWithStringBackingType(",
      "closureParameterTypes(",
      "firstClosureParameterType(",
      "firstClosureParameterTypes(",
      "closureReturnTypes(",
    ];
    for (const name of documented) {
      Assert.assertStringContainsString(name, page, `docs/reflection.md documents ${name}`);
    }
    const divergences = section(page, "Divergences");
    Assert.assertNotSame("", divergences, "docs/reflection.md has a ## Divergences section");
    for (const cited of ["DIV-3.2", "DIV-3.3", "DIV-3.4", "DIV-9.14", "DIV-12.14", "DIV-12.15"]) {
      Assert.assertStringContainsString(cited, divergences);
    }
    for (const match of divergences.matchAll(/\bDIV-(\d+)\b/g)) {
      Assert.assertTrue(existsSync(join(REPO, "decisions", `DIV-${match[1] ?? ""}.md`)), `DIV-${match[1] ?? ""} is cited but does not exist`);
    }
    for (const match of divergences.matchAll(/\bDIV-(\d+)\.(\d+)\b/g)) {
      const record = readFileSync(join(REPO, "decisions", `DIV-${match[1] ?? ""}.md`), "utf8");
      Assert.assertStringContainsString(`**${match[0]}**`, record, `${match[0]} is cited but is not a clause of decisions/DIV-${match[1] ?? ""}.md`);
    }
    for (const match of divergences.matchAll(/\b(ESC-[\d.]+-\d+)\b/g)) {
      Assert.assertTrue(existsSync(join(REPO, "decisions", `${match[1] ?? ""}.md`)), `${match[0]} is cited but has no ruling in decisions/`);
      const ruling = readFileSync(join(REPO, "decisions", `${match[1] ?? ""}.md`), "utf8");
      const frontMatter = ruling.startsWith("---\n") ? ruling.slice(4, ruling.indexOf("\n---", 4)) : "";
      Assert.assertMatchesRegularExpression(/^decision: (approved|rejected)$/m, frontMatter, `${match[0]}'s decision record has a ruling (decision: approved | rejected)`);
    }

    const readme = readFileSync(join(PACKAGE, "README.md"), "utf8");
    Assert.assertStringContainsString("(docs/reflection.md)", readme, "README.md links docs/reflection.md");
  },
  300000,
);

xaravelTest(
  "XT-reflection-6",
  "ReflectsClosures is declared a PHP trait with registerTrait: class_exists is false and trait_exists true for its Upstream FQCN, in any case and with a leading \\, while fqcn and resolveClass give the FQCN and the class as before (epic-15-retro-item-10-runtime-trait-registry)",
  () => {
    const name = "Illuminate\\Support\\Traits\\ReflectsClosures";
    Assert.assertFalse(class_exists(name));
    Assert.assertTrue(trait_exists(name));
    Assert.assertFalse(class_exists(`\\${name.toUpperCase()}`));
    Assert.assertTrue(trait_exists(`\\${name.toLowerCase()}`));
    Assert.assertSame(name, fqcn(ReflectsClosures));
    Assert.assertSame(ReflectsClosures, resolveClass(name));
    // A fresh process that loads only the trait's own file, so no `mixin` call has composed it: the mark is
    // registerTrait's. The child runs in the package directory, where `@xaravel/runtime` resolves.
    const code = [
      'import "./src/Traits/ReflectsClosures.ts";',
      'import { class_exists, trait_exists } from "@xaravel/runtime/php";',
      'const name = "Illuminate\\\\Support\\\\Traits\\\\ReflectsClosures";',
      "console.log(JSON.stringify([class_exists(name), trait_exists(name)]));",
    ].join("\n");
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: PACKAGE, encoding: "utf8", timeout: 60000 });
    Assert.assertSame(0, child.status, outputOf(child));
    Assert.assertSame("[false,true]", child.stdout.trim(), outputOf(child));
  },
);
