// Xaravel Tests for Story 11.1: `Macroable` as a runtime trait (XT-macroable-1), its Scope Frame write routing
// (XT-macroable-2, DIV-11.2), the package's close gate (XT-macroable-3), and macro names JavaScript builds in with
// static mixin methods (XT-macroable-4, DIV-12.11; Epic 11 retrospective item 5), and its declaration as a PHP trait
// (XT-macroable-5, epic-15-retro-item-10-runtime-trait-registry). Registrations into the Class Registry are
// process-wide, so every FQCN here is used by this file only. A `xaravelTest` body runs outside any Scope Frame, so
// each check that registers a macro opens its own `test` frame.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Macroable } from "@xaravel/macroable";
import { BadMethodCallException, classUsesRecursive, fqcn, InvalidArgumentException, mixin, registerClass } from "@xaravel/runtime";
import { class_exists, trait_exists } from "@xaravel/runtime/php";
import { resolveClass } from "@xaravel/runtime/registry";
import { interleave, runInFrame, runInNarrowFrame, runInRootFrame, ScopeFrameException } from "@xaravel/runtime/scope";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");
const PACKAGE = join(REPO, "packages", "macroable");

class Base {
  baseValue = "base";

  existing(): string {
    return "real";
  }
}

class Widget extends mixin(Base, Macroable) {
  p = "instance-p";

  declare greet: (name: string) => unknown;
  declare self: () => unknown;
  declare existing: () => string;
  declare arrow: () => unknown;
  declare invoked: (value: string) => unknown;
  declare fromMixin: () => unknown;
  declare fromStatic: () => unknown;
  declare inherited: () => unknown;
  declare overridden: () => unknown;
  declare inheritedStatic: () => unknown;

  declare static greet: (name: string) => unknown;
  declare static self: () => unknown;
  declare static arrow: () => unknown;
  declare static st: () => string;
  declare static fromStatic: () => unknown;

  static label(): string {
    return "widget";
  }
}

class SubWidget extends Widget {
  own(): string {
    return "sub";
  }
}

class Other extends mixin(null, Macroable) {
  declare static greet: (name: string) => unknown;
}

class WidgetMixin {
  static fromStatic(): () => string {
    return () => "static-mixin";
  }

  fromMixin(): (this: Widget) => string {
    const mixinTag = this.tag;
    return function (this: Widget): string {
      return `${mixinTag}:${this.p}`;
    };
  }

  tag = "mixin";
}

class ParentMixin {
  static inheritedStatic(): () => string {
    return () => "parent-static";
  }

  inherited(): () => string {
    return () => "parent-inherited";
  }

  overridden(): () => string {
    return () => "parent-overridden";
  }
}

class ChildMixin extends ParentMixin {
  override overridden(): () => string {
    return () => "child-overridden";
  }
}

registerClass("Xaravel\\Tests\\Macroable\\Widget", Widget);
registerClass("Xaravel\\Tests\\Macroable\\SubWidget", SubWidget);
registerClass("Xaravel\\Tests\\Macroable\\Other", Other);

/** A using class whose macros take names `Object.prototype` and `Function.prototype` give every object or function. */
class Glyph extends mixin(null, Macroable) {
  p = "glyph-p";
}

class SubGlyph extends Glyph {}

/** A parent that declares a static `bind`, which wins over a macro of that name. */
class DeclaredBase {
  static bind(): string {
    return "real-bind";
  }
}

/** A using class that declares its own `toString`, which wins over a macro of that name. */
class Declared extends mixin(DeclaredBase, Macroable) {
  override toString(): string {
    return "real-string";
  }
}

/** A using class whose JavaScript-reserved names are never touched. */
class Reserved extends mixin(null, Macroable) {}

/** A using class for the mixin cases. */
class Mixed extends mixin(null, Macroable) {
  p = "mixed-p";
}

/** A mixin whose static methods call each other through `this`, PHP's `static::`. */
class StaticMixin {
  static helper(): () => string {
    return () => "helped";
  }

  static make(): () => string {
    return this.helper();
  }

  static whoAmI(): () => unknown {
    return () => this;
  }
}

/** A mixin that declares methods JavaScript also builds in. */
class NamedMixin {
  toString(): (this: Mixed) => string {
    return function (this: Mixed): string {
      return `mixed-string:${this.p}`;
    };
  }

  valueOf(): () => string {
    return () => "mixed-value";
  }
}

/** A child mixin that inherits StaticMixin's static methods and overrides its helper. */
class ChildStaticMixin extends StaticMixin {
  static override helper(): () => string {
    return () => "child-helped";
  }
}

/**
 * A mixin whose static side declares toString and a static `constructor` method, which is no class link. TypeScript
 * rejects a `static constructor()` declaration, so it is defined as JavaScript allows it.
 */
class StaticNamedMixin {
  static toString(): () => string {
    return () => "static-string";
  }
}
Object.defineProperty(StaticNamedMixin, "constructor", {
  value: function constructor(): () => string {
    return () => "never";
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

registerClass("Xaravel\\Tests\\Macroable\\Glyph", Glyph);
registerClass("Xaravel\\Tests\\Macroable\\SubGlyph", SubGlyph);
registerClass("Xaravel\\Tests\\Macroable\\Declared", Declared);
registerClass("Xaravel\\Tests\\Macroable\\Reserved", Reserved);
registerClass("Xaravel\\Tests\\Macroable\\Mixed", Mixed);

/** A using class whose macros take names JavaScript keeps behind accessors (`__proto__`, `caller`, `arguments`). */
class Proto extends mixin(null, Macroable) {}

/** A using class that installs `toString` first, and a using class below it whose own install that shadows. */
class Outer extends mixin(null, Macroable) {}

class Inner extends mixin(Outer, Macroable) {}

/** A using class for JavaScript's implicit conversions (template literals, `+`, `String(G)`). */
class Coerced extends mixin(null, Macroable) {}

/** A using class for nested frames. */
class Nested extends mixin(null, Macroable) {}

registerClass("Xaravel\\Tests\\Macroable\\Proto", Proto);
registerClass("Xaravel\\Tests\\Macroable\\Outer", Outer);
registerClass("Xaravel\\Tests\\Macroable\\Inner", Inner);
registerClass("Xaravel\\Tests\\Macroable\\Coerced", Coerced);
registerClass("Xaravel\\Tests\\Macroable\\Nested", Nested);

/** Whether two property descriptors hold the same member, with the same attributes. */
function sameMember(before: PropertyDescriptor | undefined, after: PropertyDescriptor | undefined): boolean {
  return (
    before !== undefined &&
    after !== undefined &&
    before.value === after.value &&
    before.get === after.get &&
    before.set === after.set &&
    before.writable === after.writable &&
    before.enumerable === after.enumerable &&
    before.configurable === after.configurable
  );
}

/** The `Function.prototype` names a static macro takes here, typed without their built-in signatures. */
interface FunctionNamed {
  call(...args: unknown[]): unknown;
  apply(...args: unknown[]): unknown;
  bind(...args: unknown[]): unknown;
  toString(...args: unknown[]): unknown;
}

/** The `Object.prototype` names an instance macro takes here, typed without their built-in signatures. */
interface ObjectNamed {
  toString(...args: unknown[]): unknown;
  valueOf(...args: unknown[]): unknown;
  hasOwnProperty(...args: unknown[]): unknown;
}

/** The accessor-backed names a macro takes here, typed as the members they are while a macro holds them. */
interface AccessorNamed {
  __proto__: unknown;
  caller: unknown;
  arguments: unknown;
}

/** Runs `fn` in a fresh root `test` frame, as `portedTest` does. */
function inTest<T>(fn: () => T): T {
  return runInRootFrame("test", fn);
}

/** The error `fn` throws, or null. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** Asserts `fn` throws an instance of `type` whose message contains `message`. */
function assertThrows(type: abstract new (...args: never[]) => object, message: string, fn: () => unknown, label: string): void {
  const error = thrown(fn);
  Assert.assertInstanceOf(type, error, `${label}: ${String(error)}`);
  Assert.assertStringContainsString(message, (error as Error).message, label);
}

xaravelTest(
  "XT-macroable-1",
  "Macroable is a runtime trait (`class X extends mixin(Base, Macroable)`) that classUsesRecursive names by its Upstream FQCN; a macro is callable on instances, through the prototype and statically, with `this` the instance or the called class, shared by subclasses, never replacing a real method, with static (arrow) closures, mixins and invokable macros as Upstream (AD-26, PORTING.md Macroable row)",
  () => {
    Assert.assertSame("Illuminate\\Support\\Traits\\Macroable", fqcn(Macroable));
    for (const reference of [Widget, new SubWidget(), "Xaravel\\Tests\\Macroable\\Other"]) {
      const used = Object.entries(classUsesRecursive(reference)).map(([key, value]) => `${key}=${String(value)}`);
      Assert.assertSame("Illuminate\\Support\\Traits\\Macroable=Illuminate\\Support\\Traits\\Macroable", used.join("|"));
    }

    inTest(() => {
      // The void API returns null (AD-9).
      Assert.assertNull(
        Widget.macro("greet", function (this: unknown, name: string) {
          return `${this === Widget || this === SubWidget ? "static" : (this as Widget).p}:${name}`;
        }),
      );
      const widget = new Widget();
      Assert.assertSame("instance-p:Ann", widget.greet("Ann"), "an instance call binds this to the instance");
      Assert.assertSame("instance-p:Bo", Widget.prototype.greet.call(widget, "Bo"), "a call through the prototype");
      Assert.assertSame("static:Cy", Widget.greet("Cy"), "a static call binds this to the class");
      Assert.assertSame("instance-p:Di", widget.__call("greet", ["Di"]), "__call");
      Assert.assertSame("static:Ed", Widget.__callStatic("greet", ["Ed"]), "__callStatic");

      // `this` is the called class in a static call, which the macro can call statics on.
      Widget.macro("self", function (this: unknown) {
        return this;
      });
      Assert.assertSame(Widget, Widget.self());
      Assert.assertSame(SubWidget, SubWidget.self(), "a static call on a subclass binds the subclass");
      const sub = new SubWidget();
      Assert.assertSame(sub, sub.self());
      Widget.macro("st", function (this: typeof Widget) {
        return this.label();
      });
      Assert.assertSame("widget", Widget.st());

      // Subclasses share the using class's table (Upstream's one `static::$macros`).
      Assert.assertTrue(SubWidget.hasMacro("greet"));
      Assert.assertSame("instance-p:Fay", sub.greet("Fay"));
      SubWidget.macro("arrow", () => "from-sub");
      Assert.assertTrue(Widget.hasMacro("arrow"), "a macro registered through a subclass is the using class's");
      Assert.assertFalse(Other.hasMacro("greet"), "another using class has its own table");

      // A static (arrow) closure keeps its own `this`, as PHP's bindTo fallback does.
      const outer = { outer: true };
      Widget.macro("arrow", () => outer);
      Assert.assertSame(outer, widget.arrow());
      Assert.assertSame(outer, Widget.arrow());

      // A real method wins over the macro, as in PHP; the macro is still registered.
      Widget.macro("existing", function () {
        return "macro";
      });
      Assert.assertSame("real", widget.existing());
      Assert.assertTrue(Widget.hasMacro("existing"));
      Assert.assertSame("macro", widget.__call("existing", []));
      Assert.assertFalse(Object.hasOwn(Object.getPrototypeOf(Widget.prototype) as object, "existing"), "no dispatcher is installed over a real method");
      Widget.macro("own", function () {
        return "macro";
      });
      Assert.assertSame("sub", sub.own(), "a subclass's own method wins");

      // The trait's own members are never replaced.
      const macroMember: unknown = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Widget) as object, "macro")?.value;
      Widget.macro("macro", () => "x");
      Assert.assertSame(macroMember, Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Widget) as object, "macro")?.value);

      // An invokable object is called as is.
      Widget.macro("invoked", {
        __invoke(value: string): string {
          return `invoked:${value}`;
        },
      });
      Assert.assertSame("invoked:v", widget.invoked("v"));

      // mixin(): prototype and static methods, each called with `this` the mixin; `replace` false keeps a macro.
      Assert.assertNull(Widget.mixin(new WidgetMixin()));
      Assert.assertSame("mixin:instance-p", widget.fromMixin());
      Assert.assertSame("static-mixin", Widget.fromStatic());
      Assert.assertFalse(Widget.hasMacro("constructor"));
      Assert.assertFalse(Widget.hasMacro("tag"), "a property is not a method");
      Widget.macro("fromMixin", () => "kept");
      Widget.mixin(new WidgetMixin(), false);
      Assert.assertSame("kept", widget.fromMixin());

      // A mixin whose class extends another: inherited prototype and static methods count, and an override wins.
      Assert.assertNull(Widget.mixin(new ChildMixin()));
      Assert.assertSame("parent-inherited", widget.inherited());
      Assert.assertSame("child-overridden", widget.overridden());
      Assert.assertSame("parent-static", widget.inheritedStatic());

      // A plain object has no methods to mix in: the built-ins of Object are never called.
      Assert.assertNull(Widget.mixin({}));
      Assert.assertFalse(Widget.hasMacro("hasOwnProperty"));
      Assert.assertFalse(Widget.hasMacro("keys"));
      Assert.assertFalse(Widget.hasMacro("assign"));

      // hasMacro is Upstream's isset: a null macro is not registered, and calling it throws.
      Widget.macro("n", null);
      Assert.assertFalse(Widget.hasMacro("n"));
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Widget::n does not exist.", () => Widget.__callStatic("n", []), "a null macro");

      // The trait itself is never a using class, so nothing is installed on it for later classes to copy.
      assertThrows(TypeError, "does not use", () => Macroable.macro("x", () => "x"), "macro on the trait");
      class Later extends mixin(null, Macroable) {}
      Assert.assertFalse("x" in Later, "no static x on a later using class, own or inherited");
      Assert.assertFalse("x" in Later.prototype, "no instance x on a later using class, own or inherited");

      // An unregistered or flushed macro: BadMethodCallException naming the called class.
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\SubWidget::missing does not exist.", () => sub.__call("missing", []), "__call");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\SubWidget::missing does not exist.", () => SubWidget.__callStatic("missing", []), "__callStatic");
      Assert.assertNull(SubWidget.flushMacros());
      Assert.assertFalse(Widget.hasMacro("greet"), "flushMacros on a subclass flushes the using class's table");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\SubWidget::greet does not exist.", () => sub.greet("x"), "a flushed macro, instance call");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Widget::greet does not exist.", () => Widget.greet("x"), "a flushed macro, static call");
    });
  },
);

xaravelTest(
  "XT-macroable-2",
  "Macro registration is a base-only write (DIV-11.2, AD-5): macro, mixin and flushMacros pass only when the frame chain (frameKinds()) holds a test frame and no request, job or command frame, so a test frame and a unit or narrow frame nested in one at any depth write, landing in the test frame as AD-5.8 routes it; they throw ScopeFrameException with no active frame, under a request, job or command frame anywhere in the chain (a test opened inside one included), and in a chain with no test frame (a root unit, an interleave unit, whose origin is not followed) (ESC-11.1-3, ESC-11.1-5); a test frame holds its macros and discards them when it ends, so two concurrent test frames never see each other's macros",
  async () => {
    // No active frame.
    assertThrows(ScopeFrameException, "no active Scope Frame", () => Other.macro("greet", () => "x"), "macro with no frame");
    assertThrows(ScopeFrameException, "no active Scope Frame", () => Other.flushMacros(), "flushMacros with no frame");
    assertThrows(ScopeFrameException, "no active Scope Frame", () => Other.mixin(new WidgetMixin()), "mixin with no frame");
    assertThrows(ScopeFrameException, "no active Scope Frame", () => Other.mixin(new (class {})()), "mixin of an object with no methods with no frame");
    Assert.assertFalse(Other.hasMacro("greet"), "a read with no frame sees an empty table");

    // Request, job and command frames.
    for (const kind of ["request", "job", "command"]) {
      runInRootFrame(kind, () => {
        assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.macro("greet", () => "x"), `macro in a ${kind} frame`);
        assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.flushMacros(), `flushMacros in a ${kind} frame`);
        assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new WidgetMixin()), `mixin in a ${kind} frame`);
        assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new (class {})()), `mixin of an object with no methods in a ${kind} frame`);
        Assert.assertFalse(Other.hasMacro("greet"));
      });
      // Under a test frame too: a request, job or command frame anywhere in the chain decides.
      inTest(() =>
        runInFrame(kind, () => {
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.macro("greet", () => "x"), `macro in a ${kind} frame under a test`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.flushMacros(), `flushMacros in a ${kind} frame under a test`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new WidgetMixin()), `mixin in a ${kind} frame under a test`);
        }),
      );
    }

    // Test in request, and unit in request in test: a request, job or command frame anywhere in the chain throws.
    for (const kind of ["request", "job", "command"]) {
      runInRootFrame(kind, () =>
        runInFrame("test", () => {
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.macro("greet", () => "x"), `macro in a test frame inside a ${kind} frame`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.flushMacros(), `flushMacros in a test frame inside a ${kind} frame`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new WidgetMixin()), `mixin in a test frame inside a ${kind} frame`);
          Assert.assertFalse(Other.hasMacro("greet"));
        }),
      );
      inTest(() =>
        runInFrame(kind, () =>
          runInFrame("unit", () => {
            assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.macro("greet", () => "x"), `macro in a unit in a ${kind} frame in a test`);
            assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.flushMacros(), `flushMacros in a unit in a ${kind} frame in a test`);
            assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new WidgetMixin()), `mixin in a unit in a ${kind} frame in a test`);
            Assert.assertFalse(Other.hasMacro("greet"));
          }),
        ),
      );
    }

    // A test frame holds its macros and discards them when it ends. A unit or narrow frame nested in it at any depth
    // writes too, to the test frame's overlay (decisions/ESC-11.1-5.md, second bullet), as AD-5.8 routes the write
    // (decisions/MAINT-2026-10-24-ad-5-8-any-depth.md).
    inTest(() => {
      Other.macro("greet", (name: string) => `a:${name}`);
      Assert.assertSame("a:x", Other.greet("x"));
      runInFrame("unit", () => {
        Assert.assertSame("a:y", Other.greet("y"), "a nested unit reads the test's macros");
        Other.macro("greet", (name: string) => `unit:${name}`);
        Assert.assertSame("unit:y", Other.greet("y"), "macro in a unit nested in a test");
      });
      Assert.assertSame("unit:z", Other.greet("z"), "a unit nested in a test writes to the test frame");
      runInFrame("unit", () => Other.flushMacros());
      Assert.assertFalse(Other.hasMacro("greet"), "flushMacros in a unit nested in a test flushes the test frame's table");
      runInFrame("unit", () => Other.mixin(new WidgetMixin()));
      Assert.assertTrue(Other.hasMacro("fromStatic"), "mixin in a unit nested in a test lands in the test frame");
      Other.flushMacros();

      runInNarrowFrame("narrow", [], () => {
        Other.macro("greet", (name: string) => `narrow:${name}`);
        Assert.assertSame("narrow:n", Other.greet("n"), "macro in a narrow frame nested in a test");
      });
      Assert.assertSame("narrow:z", Other.greet("z"), "a narrow frame nested in a test writes to the test frame");
      runInNarrowFrame("narrow", [], () => Other.flushMacros());
      Assert.assertFalse(Other.hasMacro("greet"), "flushMacros in a narrow frame nested in a test flushes the test frame's table");
      runInNarrowFrame("narrow", [], () => Other.mixin(new WidgetMixin()));
      Assert.assertTrue(Other.hasMacro("fromStatic"), "mixin in a narrow frame nested in a test lands in the test frame");
      Other.flushMacros();

      Other.macro("greet", (name: string) => `a:${name}`);
      runInFrame("unit", () =>
        runInFrame("unit", () => {
          Other.macro("greet", (name: string) => `deep:${name}`);
          Assert.assertSame("deep:d", Other.greet("d"), "macro in a unit in a unit in a test");
        }),
      );
      Assert.assertSame("deep:z", Other.greet("z"), "a unit nested two deep writes to the test frame (AD-5.8)");
      runInFrame("unit", () => runInNarrowFrame("narrow", [], () => runInFrame("unit", () => Other.mixin(new WidgetMixin()))));
      Assert.assertTrue(Other.hasMacro("fromStatic"), "mixin in a unit three deep lands in the test frame");
      runInFrame("unit", () => runInFrame("unit", () => Other.flushMacros()));
      Assert.assertFalse(Other.hasMacro("greet"), "flushMacros in a unit nested two deep flushes the test frame's table");
      Assert.assertFalse(Other.hasMacro("fromStatic"));
      runInFrame("unit", () => runInFrame("unit", () => Other.macro("greet", (name: string) => `last:${name}`)));
      Assert.assertSame("last:z", Other.greet("z"), "a write made only from a unit two deep is the test frame's");

      // A test frame nested in a unit in a test is the nearest test frame: its macros end with it.
      runInFrame("unit", () =>
        runInFrame("test", () => {
          Other.macro("inner", () => "inner");
          Assert.assertTrue(Other.hasMacro("inner"), "a macro registered in a nested test frame is seen in it");
        }),
      );
      Assert.assertFalse(Other.hasMacro("inner"), "a nested test frame's macros end with it, not landing in the outer test");
      Assert.assertSame("last:z", Other.greet("z"), "the outer test's macros are unchanged by the nested test");
    });
    inTest(() => {
      Assert.assertFalse(Other.hasMacro("greet"), "a later test frame does not see an ended test's macros, nested writes included");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Other::greet does not exist.", () => Other.greet("x"), "the dispatcher in a later test frame");
    });

    // A root `unit` frame is not a test frame: its writes throw.
    runInRootFrame("unit", () => {
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.macro("greet", (name: string) => `unit:${name}`), "macro in a root unit frame");
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.flushMacros(), "flushMacros in a root unit frame");
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.mixin(new (class {})()), "mixin of an object with no methods in a root unit frame");
      Assert.assertFalse(Other.hasMacro("greet"));
    });

    // An interleave unit of a test is a root unit whose origin is the test; the frame-chain read does not follow the
    // origin, so its writes throw.
    await inTest(() =>
      interleave([
        async () => {
          assertThrows(ScopeFrameException, "inside a unit frame", () => Other.macro("greet", () => "x"), "macro in an interleave unit of a test");
          assertThrows(ScopeFrameException, "inside a unit frame", () => Other.flushMacros(), "flushMacros in an interleave unit of a test");
          assertThrows(ScopeFrameException, "inside a unit frame", () => Other.mixin(new WidgetMixin()), "mixin in an interleave unit of a test");
        },
      ]),
    );

    // Two concurrent test frames.
    let releaseA: () => void = () => {};
    let releaseB: () => void = () => {};
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const gateB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const seen: string[] = [];
    const a = inTest(async () => {
      Other.macro("greet", (name: string) => `A:${name}`);
      releaseB();
      await gateA;
      seen.push(`A sees ${String(Other.greet("1"))}`);
    });
    const b = inTest(async () => {
      await gateB;
      seen.push(`B has greet: ${String(Other.hasMacro("greet"))}`);
      Other.macro("greet", (name: string) => `B:${name}`);
      releaseA();
      seen.push(`B sees ${String(Other.greet("2"))}`);
    });
    await Promise.all([a, b]);
    Assert.assertSame("B has greet: false|B sees B:2|A sees A:1", seen.join("|"));
    inTest(() => {
      Assert.assertFalse(Other.hasMacro("greet"), "both concurrent test frames' macros are discarded");
    });
    Assert.assertFalse(Other.hasMacro("greet"));
  },
);

/** Spawns `bun run <script> …args` from the repository root, without colour. */
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

xaravelTest(
  "XT-macroable-3",
  "@xaravel/macroable is complete: `bun run api-surface:gate macroable` reports 0 unexplained (AD-15); docs/macroable.md has a Divergences section citing DIV-11.2, DIV-12.10 and DIV-12.11 and the ESC-11.1-2 and ESC-11.1-3 follow-ups, every DIV it cites exists, and the README links the docs page",
  () => {
    const gate = bunRun("api-surface:gate", ["macroable"]);
    Assert.assertSame(0, gate.status, outputOf(gate));
    Assert.assertStringContainsString("api-surface:gate macroable: 0 unexplained (AD-15)", gate.stdout ?? "", outputOf(gate));

    const page = readFileSync(join(PACKAGE, "docs", "macroable.md"), "utf8");
    for (const name of ["macro", "mixin", "hasMacro", "flushMacros"]) {
      Assert.assertStringContainsString(`${name}(`, page, `docs/macroable.md documents ${name}`);
    }
    const divergences = section(page, "Divergences");
    Assert.assertNotSame("", divergences, "docs/macroable.md has a ## Divergences section");
    for (const cited of ["DIV-11.2", "DIV-12.10", "DIV-12.11", "ESC-11.1-2", "ESC-11.1-3"]) {
      Assert.assertStringContainsString(cited, divergences);
    }
    for (const match of divergences.matchAll(/\bDIV-(\d+)\b/g)) {
      Assert.assertTrue(existsSync(join(REPO, "decisions", `DIV-${match[1] ?? ""}.md`)), `DIV-${match[1] ?? ""} is cited but does not exist`);
    }
    for (const match of divergences.matchAll(/\bDIV-(\d+)\.(\d+)\b/g)) {
      const record = readFileSync(join(REPO, "decisions", `DIV-${match[1] ?? ""}.md`), "utf8");
      Assert.assertStringContainsString(`**${match[0]}**`, record, `${match[0]} is cited but is not a clause of decisions/DIV-${match[1] ?? ""}.md`);
    }

    const readme = readFileSync(join(PACKAGE, "README.md"), "utf8");
    Assert.assertStringContainsString("(docs/macroable.md)", readme, "README.md links docs/macroable.md");
  },
  300000,
);

xaravelTest(
  "XT-macroable-4",
  "A macro named like a member Object.prototype or Function.prototype gives every object or function (toString, valueOf, hasOwnProperty; call, apply, bind, toString) runs when called directly, as PHP's __call / __callStatic would, on instances, statically and on subclasses, and a direct call throws BadMethodCallException once flushed, while a member the class or its parents declare still wins; while the frame holds the name, JavaScript's implicit conversions (String(x), template literals, +, String(G)) also reach the dispatcher, a consequence of DIV-12.11's install that PHP's (string) never shows; in a later frame, or with no frame, that never registered the name, JavaScript's own member runs, so nothing leaks past the test (DIV-11.2); the accessor-backed names (__proto__ on both sides, caller and arguments statically) run their macro in the frame and are JavaScript's accessors, getter and setter, elsewhere; the dispatcher reads the receiver's table, so a using class below another using class runs its own macro and a receiver whose class does not use the trait gets JavaScript's member; a unit frame nested in the registering test dispatches, and a nested test frame's macro ends with it; macro() throws InvalidArgumentException for the four names JavaScript reserves on a class (prototype, name, length, constructor), after the frame check, and leaves them unchanged, and hasMacro() of one is false (DIV-12.11); mixin() calls a static method, own or inherited from a parent mixin class, with this the mixin's class, registers a mixin method JavaScript also names (toString on either side), skips the prototype's constructor, and throws as macro() does for a method named name, length or prototype and for a static method named constructor (Epic 11 retrospective item 5)",
  () => {
    // Inherited names: the dispatcher is installed on the using class and runs the macro.
    inTest(() => {
      const which = function (this: unknown, ...args: unknown[]): string {
        const side = this === Glyph ? "Glyph" : this === SubGlyph ? "SubGlyph" : this instanceof SubGlyph ? "sub-instance" : this instanceof Glyph ? `instance:${(this as Glyph).p}` : "other";
        return `${side}(${args.map(String).join(",")})`;
      };
      const objectToStringMember = Object.getOwnPropertyDescriptor(Object.prototype, "toString");
      const functionCallMember = Object.getOwnPropertyDescriptor(Function.prototype, "call");
      for (const name of ["toString", "valueOf", "hasOwnProperty", "call", "apply", "bind"]) {
        Glyph.macro(name, which);
        Assert.assertTrue(Glyph.hasMacro(name), `${name} is registered`);
      }
      const glyph = new Glyph() as unknown as ObjectNamed;
      Assert.assertSame("instance:glyph-p()", glyph.toString(), "an instance toString macro runs");
      Assert.assertSame("instance:glyph-p()", String(glyph), "while the frame holds toString, JavaScript's implicit conversion reaches the dispatcher (DIV-12.11's install, not PHP behaviour)");
      Assert.assertSame("instance:glyph-p()", glyph.valueOf(), "an instance valueOf macro runs");
      Assert.assertSame("instance:glyph-p(x)", glyph.hasOwnProperty("x"), "an instance hasOwnProperty macro runs");
      const sub = new SubGlyph() as unknown as ObjectNamed;
      Assert.assertSame("sub-instance()", sub.toString(), "a subclass instance runs the toString macro");
      Assert.assertSame("sub-instance()", sub.valueOf());
      Assert.assertSame("sub-instance(y)", sub.hasOwnProperty("y"));
      const statics = Glyph as unknown as FunctionNamed;
      Assert.assertSame("Glyph(1,2)", statics.call(1, 2), "a static call macro runs with this the class");
      Assert.assertSame("Glyph(a)", statics.apply("a"), "a static apply macro runs");
      Assert.assertSame("Glyph()", statics.bind(), "a static bind macro runs");
      Assert.assertSame("Glyph()", statics.toString(), "a static toString macro runs");
      const objectStatics = Glyph as unknown as ObjectNamed;
      Assert.assertSame("Glyph()", objectStatics.valueOf(), "a static valueOf macro, a name Function.prototype inherits from Object.prototype, runs");
      Assert.assertSame("Glyph(x)", objectStatics.hasOwnProperty("x"), "a static hasOwnProperty macro runs");
      Assert.assertSame("SubGlyph(z)", (SubGlyph as unknown as ObjectNamed).hasOwnProperty("z"), "a static hasOwnProperty macro on a subclass");
      const subStatics = SubGlyph as unknown as FunctionNamed;
      Assert.assertSame("SubGlyph(3)", subStatics.call(3), "a static call on a subclass binds the subclass");
      Assert.assertSame("SubGlyph()", subStatics.apply(), "a static apply on a subclass");
      Assert.assertSame("SubGlyph()", subStatics.bind(), "a static bind on a subclass");
      Assert.assertSame("SubGlyph()", subStatics.toString(), "a static toString on a subclass");
      // The using class is the layer `mixin(null, Macroable)` builds, Glyph's parent.
      Assert.assertTrue(Object.hasOwn(Object.getPrototypeOf(Glyph.prototype) as object, "toString"), "the instance dispatcher is the using class's own");
      Assert.assertTrue(Object.hasOwn(Object.getPrototypeOf(Glyph) as object, "call"), "the static dispatcher is the using class's own");
      Assert.assertTrue(sameMember(objectToStringMember, Object.getOwnPropertyDescriptor(Object.prototype, "toString")), "Object.prototype is untouched");
      Assert.assertTrue(sameMember(functionCallMember, Object.getOwnPropertyDescriptor(Function.prototype, "call")), "Function.prototype is untouched");
      Assert.assertSame("[object Object]", Object.prototype.toString.call({}), "Object.prototype.toString still works for other objects");
      Assert.assertSame("plain", String({ toString: () => "plain" }));

      // Flushed: a direct call throws as PHP's __call / __callStatic do; the flushed names stay entries of this frame.
      Assert.assertNull(Glyph.flushMacros());
      Assert.assertFalse(Glyph.hasMacro("toString"));
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::toString does not exist.", () => glyph.toString(), "a flushed toString macro");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::toString does not exist.", () => String(glyph), "String() still reaches the dispatcher in the frame that flushed toString (DIV-12.11's install, not PHP behaviour)");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\SubGlyph::valueOf does not exist.", () => sub.valueOf(), "a flushed valueOf macro on a subclass");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::call does not exist.", () => statics.call(), "a flushed static call macro");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\SubGlyph::bind does not exist.", () => subStatics.bind(), "a flushed static bind macro on a subclass");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::valueOf does not exist.", () => objectStatics.valueOf(), "a flushed static valueOf macro");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::hasOwnProperty does not exist.", () => objectStatics.hasOwnProperty("x"), "a flushed static hasOwnProperty macro");
    });

    // A later frame, and no frame, that never registered the names: JavaScript's own members run, so nothing leaks.
    const isolated = (where: string): void => {
      const glyph = new Glyph() as unknown as ObjectNamed;
      Assert.assertSame("[object Object]", String(glyph), `${where}: String() is Object.prototype's`);
      Assert.assertSame("[object Object]", `${glyph as unknown as string}`, `${where}: a template literal is Object.prototype's`);
      Assert.assertSame("[object Object]", glyph.toString(), `${where}: toString is Object.prototype's`);
      Assert.assertTrue(glyph.valueOf() === glyph, `${where}: valueOf is Object.prototype's`);
      Assert.assertTrue(glyph.hasOwnProperty("p") === true && glyph.hasOwnProperty("q") === false, `${where}: hasOwnProperty is Object.prototype's`);
      Assert.assertSame("sub", (new SubGlyph() as unknown as ObjectNamed).hasOwnProperty("p") ? "sub" : "none", `${where}: hasOwnProperty on a subclass instance`);
      const statics = Glyph as unknown as FunctionNamed;
      // Function.prototype.call / apply invoke the class without `new`, which JavaScript refuses with a TypeError.
      const called = thrown(() => statics.call(null));
      Assert.assertInstanceOf(TypeError, called, `${where}: Glyph.call is Function.prototype's: ${String(called)}`);
      Assert.assertFalse(called instanceof BadMethodCallException, `${where}: Glyph.call does not reach __callStatic`);
      const applied = thrown(() => statics.apply(null, []));
      Assert.assertInstanceOf(TypeError, applied, `${where}: Glyph.apply is Function.prototype's: ${String(applied)}`);
      Assert.assertSame("function", typeof statics.bind(null), `${where}: Glyph.bind is Function.prototype's and returns a bound function`);
      Assert.assertStringContainsString("class", String(statics.toString()), `${where}: Glyph.toString is Function.prototype's`);
      Assert.assertSame("function", typeof (SubGlyph as unknown as FunctionNamed).bind(null), `${where}: SubGlyph.bind is Function.prototype's`);
      const objectStatics = Glyph as unknown as ObjectNamed;
      Assert.assertTrue(objectStatics.valueOf() === Glyph, `${where}: Glyph.valueOf is Object.prototype's`);
      Assert.assertTrue(objectStatics.hasOwnProperty("prototype") === true && objectStatics.hasOwnProperty("nope") === false, `${where}: Glyph.hasOwnProperty is Object.prototype's`);
      Assert.assertTrue((SubGlyph as unknown as ObjectNamed).hasOwnProperty("prototype") === true, `${where}: SubGlyph.hasOwnProperty is Object.prototype's`);
      Assert.assertFalse(Glyph.hasMacro("toString"), `${where}: toString is not registered`);
    };
    inTest(() => isolated("a later test frame"));
    isolated("no active frame");
    runInFrame("unit", () => isolated("a root unit frame"));
    assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Glyph::toString does not exist.", () => new Glyph().__call("toString", []), "__call still finds no toString macro outside the frame");

    // A member the class or its parents declare still wins; the macro is still registered.
    inTest(() => {
      Declared.macro("toString", () => "macro-string");
      Declared.macro("bind", () => "macro-bind");
      Assert.assertSame("real-string", new Declared().toString(), "the class's own toString wins");
      Assert.assertSame("real-bind", (Declared as unknown as FunctionNamed).bind(), "the parent's static bind wins");
      Assert.assertTrue(Declared.hasMacro("toString"));
      Assert.assertTrue(Declared.hasMacro("bind"));
      Assert.assertSame("macro-string", new Declared().__call("toString", []), "__call reaches the macro");
      Assert.assertSame("macro-bind", Declared.__callStatic("bind", []), "__callStatic reaches the macro");
      Assert.assertFalse(Object.hasOwn(Object.getPrototypeOf(Declared) as object, "bind"), "no static dispatcher over the parent's bind");
    });

    // The four names JavaScript reserves on a class: macro() throws and nothing changes.
    inTest(() => {
      const before = {
        name: Reserved.name,
        length: Reserved.length,
        prototype: Reserved.prototype,
        constructor: Reserved.prototype.constructor,
        nameDescriptor: Object.getOwnPropertyDescriptor(Reserved, "name"),
        lengthDescriptor: Object.getOwnPropertyDescriptor(Reserved, "length"),
      };
      for (const name of ["prototype", "name", "length", "constructor"]) {
        const fn = function (): string {
          return "never";
        };
        const error = thrown(() => Reserved.macro(name, fn));
        Assert.assertInstanceOf(InvalidArgumentException, error, `macro("${name}"): ${String(error)}`);
        const message = (error as Error).message;
        Assert.assertStringContainsString(`named ${name}:`, message, `the message names ${name}`);
        Assert.assertStringContainsString("choose another name", message, `the message for ${name} asks for another name`);
        Assert.assertStringContainsString("DIV-12.11", message, `the message for ${name} cites DIV-12.11`);
        Assert.assertFalse(Reserved.hasMacro(name), `hasMacro("${name}") is false`);
        assertThrows(BadMethodCallException, `Method Xaravel\\Tests\\Macroable\\Reserved::${name} does not exist.`, () => Reserved.__callStatic(name, []), `${name} was not registered`);
      }
      Assert.assertSame(before.name, Reserved.name, "the class's name is unchanged");
      Assert.assertSame("Reserved", Reserved.name);
      Assert.assertSame(before.length, Reserved.length, "the class's length is unchanged");
      Assert.assertTrue(before.prototype === Reserved.prototype, "the class's prototype is unchanged");
      Assert.assertTrue(before.constructor === Reserved.prototype.constructor && Reserved.prototype.constructor === Reserved, "the prototype's constructor is unchanged");
      Assert.assertTrue(sameMember(before.nameDescriptor, Object.getOwnPropertyDescriptor(Reserved, "name")), "the class's name descriptor is unchanged");
      Assert.assertTrue(sameMember(before.lengthDescriptor, Object.getOwnPropertyDescriptor(Reserved, "length")), "the class's length descriptor is unchanged");
      Assert.assertTrue(new Reserved() instanceof Reserved);
    });

    // The frame check comes first: with no active frame, a reserved name throws ScopeFrameException, as any write does.
    for (const name of ["prototype", "name", "length", "constructor"]) {
      assertThrows(ScopeFrameException, `register the macro ${name}`, () => Reserved.macro(name, () => "never"), `macro("${name}") with no active frame`);
    }
    inTest(() => {
      runInFrame("request", () => {
        assertThrows(ScopeFrameException, "inside a request frame", () => Reserved.macro("name", () => "never"), 'macro("name") under a request frame');
      });
    });

    // mixin(): static methods run with `this` the mixin's class; JavaScript-named methods register; constructor is skipped.
    inTest(() => {
      Assert.assertNull(Mixed.mixin(new StaticMixin()));
      Assert.assertTrue(Mixed.hasMacro("make"), "a static mixin method that calls another static through this is registered");
      Assert.assertTrue(Mixed.hasMacro("helper"));
      Assert.assertSame("helped", Mixed.__callStatic("make", []));
      Assert.assertTrue(Mixed.__callStatic("whoAmI", []) === StaticMixin, "a static mixin method runs with this the mixin's class");

      // A static method inherited from a parent mixin class runs with `this` the child mixin's class.
      Assert.assertNull(Mixed.mixin(new ChildStaticMixin()));
      Assert.assertTrue(Mixed.__callStatic("whoAmI", []) === ChildStaticMixin, "an inherited static mixin method runs with this the child mixin's class");
      Assert.assertSame("child-helped", Mixed.__callStatic("make", []), "an inherited static make calls the child's helper through this");

      // A mixin's static toString is registered; its static constructor() is a real method, which macro() refuses.
      assertThrows(InvalidArgumentException, "named constructor:", () => Mixed.mixin(new StaticNamedMixin()), "mixin of a static method named constructor");
      Assert.assertTrue(Mixed.hasMacro("toString"), "a mixin's static toString, listed before its static constructor, is registered");
      Assert.assertSame("static-string", (Mixed as unknown as FunctionNamed).toString(), "the mixed-in static toString dispatches");
      Assert.assertFalse(Mixed.hasMacro("constructor"), "a mixin's static constructor() is not registered");
      Assert.assertTrue(Mixed.prototype.constructor === Mixed, "Mixed's prototype keeps its class link");

      Assert.assertNull(Mixed.mixin(new NamedMixin()));
      Assert.assertTrue(Mixed.hasMacro("toString"), "a mixin's toString is registered");
      Assert.assertTrue(Mixed.hasMacro("valueOf"), "a mixin's valueOf is registered");
      Assert.assertFalse(Mixed.hasMacro("constructor"), "the mixin's own constructor is skipped");
      const mixed = new Mixed() as unknown as ObjectNamed;
      Assert.assertSame("mixed-string:mixed-p", mixed.toString(), "the mixed-in toString dispatches");
      Assert.assertSame("mixed-value", mixed.valueOf(), "the mixed-in valueOf dispatches");

      // A mixin method named name, length or prototype throws as macro() does.
      class NameMixin {
        name(): () => string {
          return () => "x";
        }
      }
      class LengthMixin {
        length(): () => string {
          return () => "x";
        }
      }
      class PrototypeMixin {
        prototype(): () => string {
          return () => "x";
        }
      }
      class StaticLengthMixin {}
      Object.defineProperty(StaticLengthMixin, "length", { value: () => () => "x", configurable: true });
      for (const [name, instance] of [
        ["name", new NameMixin()],
        ["length", new LengthMixin()],
        ["prototype", new PrototypeMixin()],
        ["length", new StaticLengthMixin()],
      ] as const) {
        assertThrows(InvalidArgumentException, `named ${name}:`, () => Mixed.mixin(instance), `mixin of a method named ${name}`);
        Assert.assertFalse(Mixed.hasMacro(name));
      }
      Assert.assertSame("Mixed", Mixed.name);
      Assert.assertTrue(Mixed.prototype.constructor === Mixed);
    });

    // Accessor-backed names: `__proto__` (instance and static) and `caller` / `arguments` (static) run their macros
    // in the frame that holds them; elsewhere JavaScript's own accessors answer, getter and setter.
    const whose = function (this: unknown, ...args: unknown[]): string {
      const side = this === Proto ? "static" : this instanceof Proto ? "instance" : "other";
      return `${side}(${args.map(String).join(",")})`;
    };
    inTest(() => {
      const instancePrototypeBefore = Object.getPrototypeOf(new Proto()) as unknown;
      const classPrototypeBefore = Object.getPrototypeOf(Proto) as unknown;
      for (const name of ["__proto__", "caller", "arguments"]) {
        Proto.macro(name, whose);
      }
      const proto = new Proto() as unknown as AccessorNamed;
      const statics = Proto as unknown as AccessorNamed;
      Assert.assertSame("instance(1)", (proto.__proto__ as (...args: unknown[]) => unknown).call(proto, 1), "an instance __proto__ macro runs");
      Assert.assertSame("instance(2)", (new Proto() as unknown as { __proto__: (n: number) => unknown }).__proto__(2), "an instance __proto__ macro runs as a method");
      Assert.assertSame("static()", (Proto as unknown as { __proto__: () => unknown }).__proto__(), "a static __proto__ macro runs");
      Assert.assertSame("static(3)", (Proto as unknown as { caller: (n: number) => unknown }).caller(3), "a static caller macro runs");
      Assert.assertSame("static()", (Proto as unknown as { arguments: () => unknown }).arguments(), "a static arguments macro runs");
      Assert.assertTrue(Object.getPrototypeOf(proto) === instancePrototypeBefore, "the instance's prototype is unchanged");
      Assert.assertTrue(Object.getPrototypeOf(statics) === classPrototypeBefore, "the class's prototype is unchanged");
      const target = {};
      const moved = new Proto() as unknown as AccessorNamed;
      moved.__proto__ = target;
      Assert.assertTrue(Object.getPrototypeOf(moved) === target, "assigning __proto__ still sets the prototype in the frame");
    });
    const isolatedAccessors = (where: string): void => {
      const proto = new Proto() as unknown as AccessorNamed;
      Assert.assertTrue(Object.getPrototypeOf(proto) === proto.__proto__, `${where}: an instance's __proto__ is JavaScript's`);
      Assert.assertTrue(Object.getPrototypeOf(Proto) === (Proto as unknown as AccessorNamed).__proto__, `${where}: the class's __proto__ is JavaScript's`);
      const target = { marker: where };
      proto.__proto__ = target;
      Assert.assertTrue(Object.getPrototypeOf(proto) === target, `${where}: assigning an instance's __proto__ sets its prototype`);
      const Child = class extends Proto {};
      const Other = class extends Proto {};
      (Child as unknown as AccessorNamed).__proto__ = Other;
      Assert.assertTrue(Object.getPrototypeOf(Child) === Other, `${where}: assigning a class's __proto__ sets its prototype`);
      for (const name of ["caller", "arguments"] as const) {
        const error = thrown(() => (Proto as unknown as AccessorNamed)[name]);
        Assert.assertInstanceOf(TypeError, error, `${where}: Proto.${name} throws as before: ${String(error)}`);
        Assert.assertFalse(error instanceof BadMethodCallException, `${where}: Proto.${name} does not reach __callStatic`);
      }
    };
    inTest(() => isolatedAccessors("a later test frame"));
    isolatedAccessors("no active frame");
    runInFrame("unit", () => isolatedAccessors("a root unit frame"));

    // A using class below another using class: Outer's dispatcher shadows Inner's install and reads the receiver's table.
    inTest(() => {
      Outer.macro("toString", () => "outer-string");
      Inner.macro("toString", () => "inner-string");
      Assert.assertFalse(Object.hasOwn(Object.getPrototypeOf(Inner.prototype) as object, "toString"), "Inner's install is shadowed by Outer's dispatcher");
      Assert.assertSame("outer-string", String(new Outer() as unknown as ObjectNamed), "Outer runs its own toString macro");
      Assert.assertSame("inner-string", (new Inner() as unknown as ObjectNamed).toString(), "Inner runs its own toString macro");
      Assert.assertSame("inner-string", (Inner as unknown as FunctionNamed).toString(), "Inner's static toString macro runs");
    });
    inTest(() => {
      Inner.macro("toString", () => "inner-only");
      Assert.assertSame("inner-only", String(new Inner() as unknown as ObjectNamed), "Inner's macro runs where Outer has none");
      Assert.assertSame("[object Object]", String(new Outer() as unknown as ObjectNamed), "Outer, with no entry in this frame, falls back");
    });

    // A receiver whose class does not use the trait gets JavaScript's member from a built-in-named dispatcher.
    inTest(() => {
      Glyph.macro("toString", () => "glyph-string");
      const instanceDispatcher = (new Glyph() as unknown as { toString: (...args: unknown[]) => unknown }).toString;
      const staticDispatcher = (Glyph as unknown as { toString: (...args: unknown[]) => unknown }).toString;
      Assert.assertSame("glyph-string", Reflect.apply(instanceDispatcher, new Glyph(), []));
      Assert.assertSame("[object Object]", Reflect.apply(instanceDispatcher, {}, []), "a plain object receiver gets Object.prototype.toString");
      Assert.assertSame("[object Null]", Reflect.apply(instanceDispatcher, null, []), "a null receiver gets Object.prototype.toString");
      Assert.assertSame("[object Array]", Reflect.apply(instanceDispatcher, [], []), "an array receiver gets Object.prototype.toString");
      Assert.assertStringContainsString("plainFunction", String(Reflect.apply(staticDispatcher, function plainFunction(): null { return null; }, [])), "a plain function receiver gets Function.prototype.toString");
    });

    // Implicit conversions reach the macro while the frame holds it: a consequence of DIV-12.11's install that PHP's
    // (string) never shows.
    inTest(() => {
      Coerced.macro("toString", function (this: unknown): string {
        return this === Coerced ? "static-coerced" : "coerced";
      });
      Coerced.macro("valueOf", () => 41);
      const coerced = new Coerced();
      Assert.assertSame("coerced", `${coerced as unknown as string}`, "a template literal reaches the toString macro (DIV-12.11's install, not PHP behaviour)");
      Assert.assertSame(42, (coerced as unknown as number) + 1, "+ reaches the valueOf macro (DIV-12.11's install, not PHP behaviour)");
      Assert.assertSame("static-coerced", String(Coerced), "String(G) reaches the static toString macro with this the class (DIV-12.11's install, not PHP behaviour)");
    });
    inTest(() => {
      Assert.assertSame("[object Object]", `${new Coerced() as unknown as string}`, "a later frame: a template literal is Object.prototype's");
      Assert.assertSame("[object Object]1", String((new Coerced() as unknown as number) + 1), "a later frame: + uses Object.prototype's valueOf and toString");
      Assert.assertStringContainsString("class", String(Coerced), "a later frame: String(G) is Function.prototype's");
    });

    // Nested frames: a unit frame nested in the registering test still dispatches; a nested test frame's macro ends with it.
    inTest(() => {
      Nested.macro("toString", () => "nested-string");
      runInFrame("unit", () => {
        Assert.assertSame("nested-string", String(new Nested() as unknown as ObjectNamed), "a unit frame nested in the registering test dispatches");
      });
    });
    inTest(() => {
      runInFrame("test", () => {
        Nested.macro("toString", () => "inner-test-string");
        Assert.assertSame("inner-test-string", String(new Nested() as unknown as ObjectNamed), "the nested test frame dispatches");
      });
      Assert.assertSame("[object Object]", String(new Nested() as unknown as ObjectNamed), "after the nested test frame ends, the outer frame falls back");
      Assert.assertFalse(Nested.hasMacro("toString"));
    });
  },
);

xaravelTest(
  "XT-macroable-5",
  "Macroable is declared a PHP trait with registerTrait: class_exists is false and trait_exists true for its Upstream FQCN, in any case and with a leading \\, while fqcn and resolveClass give the FQCN and the class as before (epic-15-retro-item-10-runtime-trait-registry)",
  () => {
    const name = "Illuminate\\Support\\Traits\\Macroable";
    Assert.assertFalse(class_exists(name));
    Assert.assertTrue(trait_exists(name));
    Assert.assertFalse(class_exists(`\\${name.toUpperCase()}`));
    Assert.assertTrue(trait_exists(`\\${name.toLowerCase()}`));
    Assert.assertSame(name, fqcn(Macroable));
    Assert.assertSame(Macroable, resolveClass(name));
    // A fresh process that loads only the trait's own file, so no `mixin` call has composed it: the mark is
    // registerTrait's. The child runs in the package directory, where `@xaravel/runtime` resolves.
    const code = [
      'import "./src/Traits/Macroable.ts";',
      'import { class_exists, trait_exists } from "@xaravel/runtime/php";',
      'const name = "Illuminate\\\\Support\\\\Traits\\\\Macroable";',
      "console.log(JSON.stringify([class_exists(name), trait_exists(name)]));",
    ].join("\n");
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: PACKAGE, encoding: "utf8", timeout: 60000 });
    Assert.assertSame(0, child.status, outputOf(child));
    Assert.assertSame("[false,true]", child.stdout.trim(), outputOf(child));
  },
);
