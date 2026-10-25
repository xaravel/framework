// Xaravel Tests for Story 11.1: `Macroable` as a runtime trait (XT-macroable-1), its Scope Frame write routing
// (XT-macroable-2, DIV-11.2) and the package's close gate (XT-macroable-3). Registrations into the Class Registry are
// process-wide, so every FQCN here is used by this file only. A `xaravelTest` body runs outside any Scope Frame, so
// each check that registers a macro opens its own `test` frame.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Macroable } from "@xaravel/macroable";
import { BadMethodCallException, classUsesRecursive, fqcn, mixin, registerClass } from "@xaravel/runtime";
import { runInFrame, runInNarrowFrame, runInRootFrame, ScopeFrameException } from "@xaravel/runtime/scope";

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
  "Macro registration is a base-only write (DIV-11.2, AD-5): macro, mixin and flushMacros pass only when the innermost frame is a test frame, and throw ScopeFrameException with no active frame and in every other frame (request, job, command, a root unit, and a unit or narrow frame nested in a test frame) (ESC-11.1-6); a test frame holds its macros and discards them when it ends, so two concurrent test frames never see each other's macros",
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
      // Under a test frame too: the request frame's kind decides.
      inTest(() =>
        runInFrame(kind, () => {
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.macro("greet", () => "x"), `macro in a ${kind} frame under a test`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.flushMacros(), `flushMacros in a ${kind} frame under a test`);
          assertThrows(ScopeFrameException, `inside a ${kind} frame`, () => Other.mixin(new WidgetMixin()), `mixin in a ${kind} frame under a test`);
        }),
      );
    }

    // A test frame holds its macros and discards them when it ends. A unit or narrow frame nested in it reads them but
    // may not write (decisions/ESC-11.1-6.md): only the innermost `test` frame takes a write.
    inTest(() => {
      Other.macro("greet", (name: string) => `a:${name}`);
      Assert.assertSame("a:x", Other.greet("x"));
      runInFrame("unit", () => {
        Assert.assertSame("a:y", Other.greet("y"), "a nested unit reads the test's macros");
        assertThrows(ScopeFrameException, "inside a unit frame", () => Other.macro("greet", (name: string) => `nested:${name}`), "macro in a unit nested in a test");
        assertThrows(ScopeFrameException, "inside a unit frame", () => Other.flushMacros(), "flushMacros in a unit nested in a test");
        assertThrows(ScopeFrameException, "inside a unit frame", () => Other.mixin(new WidgetMixin()), "mixin in a unit nested in a test");
      });
      runInNarrowFrame("narrow", [], () => {
        Assert.assertSame("a:n", Other.greet("n"), "a nested narrow frame reads the test's macros");
        assertThrows(ScopeFrameException, "inside a narrow frame", () => Other.macro("greet", (name: string) => `narrow:${name}`), "macro in a narrow frame nested in a test");
        assertThrows(ScopeFrameException, "inside a narrow frame", () => Other.flushMacros(), "flushMacros in a narrow frame nested in a test");
        assertThrows(ScopeFrameException, "inside a narrow frame", () => Other.mixin(new WidgetMixin()), "mixin in a narrow frame nested in a test");
      });
      Assert.assertSame("a:z", Other.greet("z"), "the nested frames' writes did not land");
    });
    inTest(() => {
      Assert.assertFalse(Other.hasMacro("greet"), "a later test frame does not see an ended test's macros");
      assertThrows(BadMethodCallException, "Method Xaravel\\Tests\\Macroable\\Other::greet does not exist.", () => Other.greet("x"), "the dispatcher in a later test frame");
    });

    // A root `unit` frame is not a test frame: its writes throw.
    runInRootFrame("unit", () => {
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.macro("greet", (name: string) => `unit:${name}`), "macro in a root unit frame");
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.flushMacros(), "flushMacros in a root unit frame");
      assertThrows(ScopeFrameException, "inside a unit frame", () => Other.mixin(new (class {})()), "mixin of an object with no methods in a root unit frame");
      Assert.assertFalse(Other.hasMacro("greet"));
    });

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
  "@xaravel/macroable is complete: `bun run api-surface:gate macroable` reports 0 unexplained (AD-15); docs/macroable.md has a Divergences section citing DIV-11.2 and DIV-12.10 and the ESC-11.1-2 and ESC-11.1-3 follow-ups, every DIV it cites exists, and the README links the docs page",
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
    for (const cited of ["DIV-11.2", "DIV-12.10", "ESC-11.1-2", "ESC-11.1-3"]) {
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
