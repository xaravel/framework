// Xaravel Tests for Story 12.1: `Conditionable` as a runtime trait with Upstream's closure values and higher-order proxy
// (XT-conditionable-1), its AD-6 dual-helper behaviour and DIV-1.6's thenable conditions (XT-conditionable-2), the
// package's close gate (XT-conditionable-3), and invokable objects as callbacks (XT-conditionable-4, Epic 12 retro item
// 1). Registrations into the Class Registry are process-wide, so every FQCN here is used by this file only.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Conditionable, HigherOrderWhenProxy } from "@xaravel/conditionable";
import { classUsesRecursive, Error as PhpError, fqcn, looseEquals, mixin, registerClass, TypeError as PhpTypeError } from "@xaravel/runtime";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");
const PACKAGE = join(REPO, "packages", "conditionable");
const LOGGER = "Xaravel\\Tests\\Conditionable\\Logger";
const MOCK_FIXTURE = join(PACKAGE, "tests", "xaravel", "fixtures", "invokable-mock.fixture.ts");

class Logger extends mixin(null, Conditionable) {
  values: unknown[] = [];

  flag: unknown = false;

  log(...values: unknown[]): this {
    this.values.push(...values);

    return this;
  }

  has(value: unknown): boolean {
    return this.values.some((item) => looseEquals(item, value));
  }

  nothing(): void {}
}

registerClass(LOGGER, Logger);

/** A Logger subclass: its methods and its parent's are generated on the proxy. */
class Child extends Logger {
  childOnly(): string {
    return "child";
  }

  /** Named like a proxy member: the proxy's own `condition` wins. */
  condition(): string {
    return "target condition";
  }

  /** A `then` on the target is never generated, so the proxy is never a thenable. */
  then(): string {
    return "target then";
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\Child", Child);

/** A target with its own magic methods, as a Macroable class has. */
class Magic extends mixin(null, Conditionable) {
  __call(method: string, parameters: unknown[]): unknown {
    return `__call:${method}:${parameters.join(",")}`;
  }

  __get(key: string): unknown {
    return `__get:${key}`;
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\Magic", Magic);

/** Not registered: PHP's messages name it `class@anonymous`. */
class Anonymous extends mixin(null, Conditionable) {}

/** A parent method shadowed by a subclass getter: the nearest definition wins (DIV-12.12). */
class Parent extends mixin(null, Conditionable) {
  parentCalls = 0;

  x(): string {
    this.parentCalls++;
    return "parent method";
  }
}

class Sub extends Parent {}

// TypeScript rejects an accessor overriding a method, so the getter is defined on the prototype directly.
Object.defineProperty(Sub.prototype, "x", { get: (): string => "sub getter", enumerable: false, configurable: true });

registerClass("Xaravel\\Tests\\Conditionable\\Sub", Sub);

/** A prototype accessor and an arrow-function own field. */
class Accessors extends mixin(null, Conditionable) {
  calls: string[] = [];

  arrow = (value: string): string => {
    this.calls.push(value);
    return `arrow:${value}`;
  };

  get size(): number {
    return 3;
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\Accessors", Accessors);

/** The error `fn` throws, or null. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return null;
}

/** Asserts that `fn` throws an instance of `type` with `message`. */
function assertThrows(type: abstract new (...args: never[]) => Error, message: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertInstanceOf(type, error);
  Assert.assertSame(message, (error as Error).message);
}

/** What the proxy's `__call` / `__get` returned, as the type the check expects (they return `unknown`). */
function as<T>(value: unknown): T {
  return value as T;
}

xaravelTest(
  "XT-conditionable-1",
  "`when(value, callback, default)` / `unless(...)` follow Upstream: a closure value (not a class, branded or native) is called with the instance and its result decides the branch by PHP truthiness; a null callback result returns the instance; a non-callable callback or default throws PHP's ?callable TypeError on entry; a lone options-shaped object is the condition (DIV-12.13); with no callback they return a HigherOrderWhenProxy whose __call / __get capture and apply conditions (unless() negating on capture), with missing-member fallbacks and null for undefined; its generated members (DIV-12.12) route through them, skip then and the proxy's own names, and are fixed at construction; classUsesRecursive names the trait's FQCN",
  () => {
    // The value closure is called with the instance; its result is the condition, passed on to the callback.
    const seen: unknown[] = [];
    const logger = new Logger().log("init");
    const result = logger.when(
      (self: Logger) => {
        seen.push(self);
        return self.has("init") ? "yes" : "";
      },
      (self: Logger, value: unknown) => {
        seen.push(self, value);
        return "callback-result";
      },
    );
    Assert.assertSame("callback-result", result);
    Assert.assertSame([logger, logger, "yes"], seen);

    // PHP truthiness: "0", "", 0, an empty array and null are falsy; "a", [0] and an object are truthy.
    for (const falsy of ["0", "", 0, [], {}, null, false]) {
      Assert.assertSame(["default", falsy], new Logger().when((_self: Logger) => falsy, (self: Logger) => self.log("when"), (self: Logger, value: unknown) => self.log("default", value)).values);
      Assert.assertSame(["unless", falsy], new Logger().unless(falsy, (self: Logger, value: unknown) => self.log("unless", value)).values);
    }
    for (const truthy of ["a", "0.0", [0], 1, { a: 1 }]) {
      Assert.assertSame(["when", truthy], new Logger().when(truthy, (self: Logger, value: unknown) => self.log("when", value)).values);
    }

    // A falsy value with no default returns the instance; a null or undefined callback result returns it too.
    const plain = new Logger();
    Assert.assertSame(plain, plain.when(false, () => "never"));
    Assert.assertSame(plain, plain.when(true, () => null));
    Assert.assertSame(plain, plain.when(true, () => {}));
    Assert.assertSame(plain, plain.unless(true, null));
    Assert.assertSame(plain, plain.when(false, null));
    Assert.assertSame(plain, plain.when(false, undefined, undefined));
    Assert.assertSame("default-result", plain.when(0, null, () => "default-result"));

    // Upstream calls a null callback when the value is truthy: PHP's Error.
    assertThrows(PhpError, "Value of type null is not callable", () => plain.when(true, null));

    // `?callable` is checked on entry, on every branch: PHP's TypeError names the class, argument and type.
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, int given`, () => plain.when(true, 5 as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, int given`, () => plain.when(false, 5 as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #3 ($default) must be of type ?callable, string given`, () => plain.when(false, null, "x" as never));
    assertThrows(PhpTypeError, `${LOGGER}::unless(): Argument #2 ($callback) must be of type ?callable, float given`, () => plain.unless(true, 1.5 as never));
    assertThrows(PhpTypeError, `${LOGGER}::unless(): Argument #3 ($default) must be of type ?callable, array given`, () => plain.unless(true, null, {} as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, true given`, () => plain.when(true, true as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, array given`, () => plain.when(true, [] as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, ${LOGGER} given`, () => plain.when(true, new Logger() as never));
    assertThrows(PhpTypeError, "class@anonymous::when(): Argument #2 ($callback) must be of type ?callable, int given", () => new Anonymous().when(true, 5 as never));
    // A class is not callable: it stands for a PHP class-string.
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, string given`, () => plain.when(true, Anonymous as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, string given`, () => plain.when(true, Logger as never));
    assertThrows(PhpTypeError, `${LOGGER}::unless(): Argument #3 ($default) must be of type ?callable, string given`, () => plain.unless(true, null, Date as never));

    // A class is not a closure: a registered class, a JS class and a native constructor are the value itself.
    Assert.assertSame(["when", Logger], new Logger().when(Logger, (self: Logger, value: unknown) => self.log("when", value)).values);
    Assert.assertSame(["when", Anonymous], new Logger().when(Anonymous, (self: Logger, value: unknown) => self.log("when", value)).values);
    Assert.assertSame(["when", Date], new Logger().when(Date, (self: Logger, value: unknown) => self.log("when", value)).values);
    Assert.assertSame(["when", Map], new Logger().when(Map, (self: Logger, value: unknown) => self.log("when", value)).values);
    // A `function` expression is a closure.
    Assert.assertSame(
      ["when", "fn"],
      new Logger().when(
        function () {
          return "fn";
        },
        (self: Logger, value: unknown) => self.log("when", value),
      ).values,
    );

    // A lone object is always the condition (DIV-12.13), whatever its keys.
    const options = { value: false, callback: () => "never" };
    Assert.assertSame(["when", options], new Logger().when(options, (self: Logger, value: unknown) => self.log("when", value)).values);
    Assert.assertInstanceOf(HigherOrderWhenProxy, new Logger().when({ value: false, callback: () => "never" }));
    const optionsLogger = new Logger();
    Assert.assertSame(["a"], as<Logger>(optionsLogger.when({ value: false, callback: () => "never" }).__call("log", ["a"])).values);
    Assert.assertSame(optionsLogger, optionsLogger.unless({ value: false }).__call("log", ["b"]));

    // No argument: a proxy with no condition; the next call captures it.
    const proxy = new Logger().log("init").when();
    Assert.assertInstanceOf(HigherOrderWhenProxy, proxy);
    Assert.assertSame("Illuminate\\Support\\HigherOrderWhenProxy", fqcn(proxy));
    const captured = as<HigherOrderWhenProxy<Logger>>(proxy.__call("has", ["init"]));
    Assert.assertSame(proxy, captured);
    Assert.assertSame(["init", "three"], as<Logger>(captured.__call("log", ["three"])).values);

    const missing = new Logger().log("init");
    Assert.assertSame(missing, as<HigherOrderWhenProxy<Logger>>(missing.when().__call("has", ["missing"])).__call("log", ["four"]));
    Assert.assertSame(["init"], missing.values);

    // __get captures a property's value as the condition, then applies or skips the next read or call.
    const flagged = new Logger();
    flagged.flag = "1";
    Assert.assertSame(["five"], as<Logger>(as<HigherOrderWhenProxy<Logger>>(flagged.when().__get("flag")).__call("log", ["five"])).values);
    flagged.flag = "0";
    Assert.assertSame(flagged, as<HigherOrderWhenProxy<Logger>>(flagged.when().__get("flag")).__get("values"));

    // unless(): the captured condition is negated (PHP `!`).
    const negated = new Logger().log("init");
    Assert.assertSame(negated, as<HigherOrderWhenProxy<Logger>>(negated.unless().__call("has", ["init"])).__call("log", ["three"]));
    Assert.assertSame(["init", "four"], as<Logger>(as<HigherOrderWhenProxy<Logger>>(negated.unless().__call("has", ["missing"])).__call("log", ["four"])).values);
    negated.flag = false;
    Assert.assertSame(["init", "four", "five"], as<Logger>(as<HigherOrderWhenProxy<Logger>>(negated.unless().__get("flag")).__call("log", ["five"])).values);

    // One argument: the proxy holds the condition (negated by unless); a false condition returns the target uncalled.
    const one = new Logger();
    Assert.assertSame(["a"], as<Logger>(one.when(true).__call("log", ["a"])).values);
    Assert.assertSame(one, one.when(false).__call("log", ["b"]));
    Assert.assertSame(one, one.unless(true).__call("log", ["c"]));
    Assert.assertSame(["a", "d"], as<Logger>(one.unless(false).__call("log", ["d"])).values);
    Assert.assertSame(["a", "d", "e"], as<Logger>(one.when((self: Logger) => self.has("a")).__call("log", ["e"])).values);
    Assert.assertSame(one, one.unless((self: Logger) => self.has("a")).__call("log", ["f"]));
    Assert.assertSame(["a", "d", "e"], one.when("1").__get("values"));
    Assert.assertSame(one, one.when("0").__get("values"));
    // condition() and negateConditionOnCapture() return the proxy.
    const bare = new HigherOrderWhenProxy(one);
    Assert.assertSame(bare, bare.negateConditionOnCapture());
    Assert.assertSame(bare, bare.condition(false));
    Assert.assertSame(one, bare.__call("log", ["g"]));

    // Missing members: PHP's Error, or the target's own __call / __get; a missing property reads as null.
    assertThrows(PhpError, `Call to undefined method ${LOGGER}::nope()`, () => new Logger().when(true).__call("nope", []));
    assertThrows(PhpError, "Call to undefined method class@anonymous::nope()", () => new Anonymous().when(true).__call("nope", []));
    Assert.assertNull(new Logger().when(true).__get("nope"));
    Assert.assertSame("__call:nope:1,2", new Magic().when(true).__call("nope", [1, 2]));
    Assert.assertSame("__get:nope", new Magic().when(true).__get("nope"));
    // An undefined result is null (AD-9).
    Assert.assertNull(new Logger().when(true).__call("nothing", []));
    Assert.assertNull(new Logger().when(true).nothing());

    // Generated members (DIV-12.12): methods from the whole prototype chain, a getter per own property.
    const child = new Child();
    const childProxy = child.when(true);
    Assert.assertSame("child", childProxy.childOnly());
    Assert.assertSame(["x"], as<Logger>(childProxy.log("x")).values);
    Assert.assertSame(["x"], childProxy.values);
    Assert.assertSame(child, child.when(false).childOnly());
    Assert.assertSame(child, child.when(false).values);
    // The proxy's own members are never overwritten, and `then` is never generated.
    Assert.assertSame(childProxy, childProxy.condition(true));
    Assert.assertSame("target condition", childProxy.__call("condition", []));
    Assert.assertFalse("then" in childProxy);
    Assert.assertSame("target then", childProxy.__call("then", []));
    // The members are not enumerable; the proxy's state is #private.
    Assert.assertSame([], Object.keys(childProxy));
    // A member added to the target later is reached only through __call / __get.
    const later = new Logger();
    const laterProxy = later.when(true);
    (later as unknown as Record<string, unknown>)["added"] = "late";
    Assert.assertFalse(Object.hasOwn(laterProxy, "added"));
    Assert.assertSame("late", laterProxy.__get("added"));
    // A capturing proxy's generated members capture.
    const capturing = new Logger().log("init");
    Assert.assertSame(["init", "y"], as<Logger>(capturing.when().has("init").log("y")).values);
    Assert.assertSame(capturing, capturing.when().has("missing").log("z"));

    // A subclass getter hides a parent method: the proxy member is a getter routed through __get.
    const sub = new Sub();
    const subProxy = sub.when(true);
    const subDescriptor = Object.getOwnPropertyDescriptor(subProxy, "x");
    Assert.assertSame("function", typeof subDescriptor?.get);
    Assert.assertSame("sub getter", (subProxy as unknown as { x: unknown }).x);
    Assert.assertSame("sub getter", sub.when(true).__get("x"));
    Assert.assertSame(0, sub.parentCalls);

    // A prototype accessor is a property, through a conditioned and a capturing proxy.
    const accessors = new Accessors();
    Assert.assertSame(3, accessors.when(true).size);
    Assert.assertSame(accessors, accessors.when(false).size);
    Assert.assertSame("arrow:captured", accessors.when().size.arrow("captured"));
    Assert.assertSame(accessors, accessors.unless().size.arrow("skipped"));
    // An arrow-function own field is a method: a false condition returns the target without calling it.
    Assert.assertSame(accessors, accessors.when(false).arrow("no"));
    Assert.assertSame("arrow:yes", accessors.when(true).arrow("yes"));
    Assert.assertSame(["captured", "yes"], accessors.calls);

    // Object.prototype members are not the target's, and a method name is not a property.
    assertThrows(PhpError, `Call to undefined method ${LOGGER}::toString()`, () => new Logger().when(true).__call("toString", []));
    Assert.assertNull(new Logger().when(true).__get("log"));
    Assert.assertNull(new Logger().when(true).__get("constructor"));

    // The trait is registered under its Upstream FQCN.
    Assert.assertContains("Illuminate\\Support\\Traits\\Conditionable", Object.values(classUsesRecursive(Logger)));
    Assert.assertSame("Illuminate\\Support\\Traits\\Conditionable", fqcn(Conditionable));
  },
);

/** A thenable that is not a Promise, as a query Builder is: `then` must never be called by `when`. */
class FakeBuilder {
  thenCalls = 0;

  then(resolve: (value: string) => void): void {
    this.thenCalls++;
    resolve("ran");
  }
}

/** A target with an async method and a Promise property, for the proxy's capture paths. */
class AsyncTarget extends mixin(null, Conditionable) {
  pending: Promise<boolean> = Promise.resolve(true);

  async ready(): Promise<boolean> {
    return true;
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\AsyncTarget", AsyncTarget);

xaravelTest(
  "XT-conditionable-2",
  "`when` / `unless` are AD-6 dual helpers: an async callback or default makes them return its own Promise and a sync one its own value, a thenable result that is not a Promise stays sync and unawaited, a thenable condition (the value, the value closure's result, or the proxy's __call / __get capture) throws a TypeError saying to await it (DIV-1.6), and async-surface.json lists neither method",
  async () => {
    const logger = new Logger();

    // An async callback: its own Promise, resolving to its result.
    const viaCallback = logger.when(true, async () => 1);
    Assert.assertInstanceOf(Promise, viaCallback);
    Assert.assertSame(1, await viaCallback);
    // Its Promise is returned as is: a null result resolves to null, not the instance (`result ?? this` on the Promise).
    Assert.assertNull(await logger.when(true, async () => null));

    // An async default.
    const viaDefault = logger.unless(true, null, async (self: Logger, value: unknown) => self.log("default", value));
    Assert.assertInstanceOf(Promise, viaDefault);
    Assert.assertSame(logger, await viaDefault);
    Assert.assertSame(["default", true], logger.values);

    // A rejection propagates.
    let rejected: unknown = null;
    try {
      await logger.when(true, async () => {
        throw new RangeError("boom");
      });
    } catch (error) {
      rejected = error;
    }
    Assert.assertInstanceOf(RangeError, rejected);

    // A sync callback returns its result as is.
    const sync = logger.when(true, () => "sync");
    Assert.assertNotInstanceOf(Promise, sync);
    Assert.assertSame("sync", sync);

    // A thenable result that is not a Promise is an ordinary value: returned sync, its `then` never called.
    const builder = new FakeBuilder();
    const kept: unknown = logger.when(true, () => builder);
    Assert.assertSame(builder, kept);
    Assert.assertSame(0, builder.thenCalls);
    // An async callback's Promise is not inspected either.
    const promise = Promise.resolve("own");
    Assert.assertSame(promise, logger.when(true, () => promise));

    // A thenable condition throws (DIV-1.6), on every path; the types reject a Promise condition too.
    const condition = `${LOGGER}::when(): the condition is a Promise or another thenable; await it before calling when()`;
    assertThrows(TypeError, condition, () => logger.when(Promise.resolve(true) as never, () => "callback"));
    assertThrows(TypeError, condition, () => logger.when(Promise.resolve(false) as never));
    assertThrows(TypeError, condition, () => logger.when(builder as never, () => "callback"));
    assertThrows(
      TypeError,
      `${LOGGER}::unless(): the condition is a Promise or another thenable; await it before calling unless()`,
      () => logger.unless(Promise.resolve(0) as never, () => "callback"),
    );
    Assert.assertSame(0, builder.thenCalls);
    const closure = `${LOGGER}::when(): the condition closure returned a Promise or another thenable; await it before calling when()`;
    assertThrows(TypeError, closure, () => logger.when((async (_self: Logger) => true) as never, () => "callback"));
    assertThrows(TypeError, closure, () => logger.when((() => new FakeBuilder()) as never));
    // The error is JavaScript's TypeError, not PHP's.
    Assert.assertNotInstanceOf(PhpError, thrownBy(() => logger.when(Promise.resolve(true) as never, () => "callback")));
    // condition() rejects a thenable too.
    assertThrows(
      TypeError,
      "HigherOrderWhenProxy: the condition is a Promise or another thenable; await it before calling condition()",
      () => new HigherOrderWhenProxy(logger).condition(Promise.resolve(true)),
    );
    // The types reject a Promise condition (NotPromise<V>).
    thrownBy(() =>
      // @ts-expect-error a Promise is never a condition (DIV-1.6)
      logger.when(Promise.resolve(true), () => "callback"),
    );
    // The proxy's capture.
    const target = new AsyncTarget();
    assertThrows(
      TypeError,
      "HigherOrderWhenProxy: the condition captured from ready() is a Promise or another thenable; await it before calling when() / unless()",
      () => target.when().__call("ready", []),
    );
    assertThrows(
      TypeError,
      "HigherOrderWhenProxy: the condition captured from pending is a Promise or another thenable; await it before calling when() / unless()",
      () => target.unless().__get("pending"),
    );
    assertThrows(
      TypeError,
      "HigherOrderWhenProxy: the condition captured from ready() is a Promise or another thenable; await it before calling when() / unless()",
      () => target.when().ready(),
    );
    // A thenable through a conditioned proxy is an ordinary result.
    Assert.assertInstanceOf(Promise, target.when(true).ready());
    Assert.assertTrue(await as<Promise<boolean>>(target.when(true).__call("ready", [])));

    // Dual helpers take no tag, so the committed async surface lists neither method.
    const surface = readFileSync(join(PACKAGE, "async-surface.json"), "utf8");
    Assert.assertStringNotContainsString("Conditionable.when", surface);
    Assert.assertStringNotContainsString("Conditionable.unless", surface);
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
  "XT-conditionable-3",
  "@xaravel/conditionable is complete: `bun run api-surface:gate conditionable` reports 0 unexplained (AD-15); docs/conditionable.md documents when, unless and the proxy and has a Divergences section citing DIV-1.6, DIV-12.12 and DIV-12.13, every DIV clause it cites exists, and the README links the docs page",
  () => {
    const gate = bunRun("api-surface:gate", ["conditionable"]);
    Assert.assertSame(0, gate.status, outputOf(gate));
    Assert.assertStringContainsString("api-surface:gate conditionable: 0 unexplained (AD-15)", gate.stdout ?? "", outputOf(gate));

    const page = readFileSync(join(PACKAGE, "docs", "conditionable.md"), "utf8");
    for (const name of ["when(", "unless(", "HigherOrderWhenProxy", "__call(", "__get("]) {
      Assert.assertStringContainsString(name, page, `docs/conditionable.md documents ${name}`);
    }
    const divergences = section(page, "Divergences");
    Assert.assertNotSame("", divergences, "docs/conditionable.md has a ## Divergences section");
    for (const cited of ["DIV-1.6", "DIV-12.12", "DIV-12.13"]) {
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
    }

    const readme = readFileSync(join(PACKAGE, "README.md"), "utf8");
    Assert.assertStringContainsString("(docs/conditionable.md)", readme, "README.md links docs/conditionable.md");
  },
  300000,
);

/** An invokable class: PHP's `?callable` accepts its instances. Records each call and its `this`. */
class Invokable {
  calls: Array<{ receiver: unknown; self: unknown; value: unknown }> = [];

  constructor(private readonly returns: unknown = null) {}

  __invoke(self: Logger, value: unknown): unknown {
    this.calls.push({ receiver: this, self, value });

    return this.returns;
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\Invokable", Invokable);

/** An invokable class whose `__invoke` is async. */
class AsyncInvokable {
  async __invoke(_self: Logger, value: unknown): Promise<string> {
    return `async:${String(value)}`;
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\AsyncInvokable", AsyncInvokable);

/** An instance whose `__invoke` is not a function: not callable. */
class NotInvokable {
  __invoke = 5;
}

registerClass("Xaravel\\Tests\\Conditionable\\NotInvokable", NotInvokable);

xaravelTest(
  "XT-conditionable-4",
  "an invokable object (an instance of a class whose __invoke is a function) is a `?callable` callback or default for `when` / `unless`, called as object.__invoke(instance, value) with the object as this and its result (an async __invoke's own Promise included) `?? this`; it is not called when its branch is not taken, nor when it is the condition; a plain object with an __invoke key is a PHP array and an instance whose __invoke is not a function is rejected with PHP's ?callable TypeError; a Mockery double of an invokable class is called through its __invoke",
  async () => {
    // An invokable callback: `__invoke(logger, value)` with the object as `this`, its result returned.
    const logger = new Logger();
    const callback = new Invokable("result");
    Assert.assertSame("result", logger.when(true, callback));
    Assert.assertSame(1, callback.calls.length);
    Assert.assertSame(callback, callback.calls[0]?.receiver);
    Assert.assertSame(logger, callback.calls[0]?.self);
    Assert.assertSame(true, callback.calls[0]?.value);
    Assert.assertSame("result", logger.unless(false, callback));
    Assert.assertSame(false, callback.calls[1]?.value);

    // A null result returns the instance.
    const returnsNull = new Invokable();
    Assert.assertSame(logger, logger.when("yes", returnsNull));
    Assert.assertSame("yes", returnsNull.calls[0]?.value);
    Assert.assertSame(logger, logger.unless(0, returnsNull));
    Assert.assertSame(2, returnsNull.calls.length);

    // An invokable default.
    const fallback = new Invokable();
    Assert.assertSame(logger, logger.unless(true, null, fallback));
    Assert.assertSame(1, fallback.calls.length);
    Assert.assertSame(fallback, fallback.calls[0]?.receiver);
    Assert.assertSame(logger, fallback.calls[0]?.self);
    Assert.assertSame(true, fallback.calls[0]?.value);
    Assert.assertSame("default", logger.when(false, null, new Invokable("default")));

    // Not taken: the instance, `__invoke` not called.
    const untouched = new Invokable("never");
    Assert.assertSame(logger, logger.when(false, untouched));
    Assert.assertSame(logger, logger.unless(true, untouched));
    Assert.assertSame(logger, logger.when(true, (self: Logger) => self, untouched));
    Assert.assertSame(0, untouched.calls.length);

    // An async `__invoke`: its own Promise, returned as is (DIV-1.6).
    const viaCallback = logger.when(true, new AsyncInvokable());
    Assert.assertInstanceOf(Promise, viaCallback);
    Assert.assertSame("async:true", await viaCallback);
    const viaDefault = logger.unless(1, null, new AsyncInvokable());
    Assert.assertInstanceOf(Promise, viaDefault);
    Assert.assertSame("async:1", await viaDefault);
    // The very Promise `__invoke` returns, not a wrapper.
    const held = Promise.resolve("held");
    Assert.assertSame(held, logger.when(true, new Invokable(held)));
    Assert.assertSame(held, logger.unless(true, null, new Invokable(held)));

    // An unregistered class that inherits `__invoke`.
    const inherited = new (class extends Invokable {})("inherited");
    Assert.assertSame("inherited", logger.when("v", inherited));
    Assert.assertSame(logger, inherited.calls[0]?.self);
    Assert.assertSame("v", inherited.calls[0]?.value);

    // An invokable condition is not called: PHP calls `$value` only when it is a Closure, so it is a truthy value.
    const condition = new Invokable("never");
    const seen: unknown[] = [];
    logger.when(condition, (self: Logger, value: unknown) => {
      seen.push(self, value);
    });
    Assert.assertSame([logger, condition], seen);
    Assert.assertSame(logger, logger.unless(condition, () => "never"));
    Assert.assertSame(0, condition.calls.length);

    // A plain or null-prototype object with an `__invoke` key is a PHP array, which is callable only as [object, 'method'].
    const plain = new Logger();
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, array given`, () => plain.when(true, { __invoke: () => 1 } as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, array given`, () => plain.when(false, { __invoke: () => 1 } as never));
    const bare = Object.assign(Object.create(null) as object, { __invoke: () => 1 });
    assertThrows(PhpTypeError, `${LOGGER}::unless(): Argument #3 ($default) must be of type ?callable, array given`, () => plain.unless(true, null, bare as never));
    // An instance whose `__invoke` is not a function, checked on entry on every branch.
    const notInvokable = "Xaravel\\Tests\\Conditionable\\NotInvokable";
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, ${notInvokable} given`, () => plain.when(true, new NotInvokable() as never));
    assertThrows(PhpTypeError, `${LOGGER}::when(): Argument #2 ($callback) must be of type ?callable, ${notInvokable} given`, () => plain.when(false, new NotInvokable() as never));
    assertThrows(PhpTypeError, `${LOGGER}::unless(): Argument #3 ($default) must be of type ?callable, ${notInvokable} given`, () => plain.unless(false, null, new NotInvokable() as never));
    Assert.assertSame([], plain.values);

    // A Mockery double of an invokable class: its `__invoke` is called with (instance, value), each once() met. In its
    // own process: Mockery's generated-class counter is process-wide, and other packages' tests expect its names.
    const fixture = spawnSync(process.execPath, ["--no-env-file", MOCK_FIXTURE], { cwd: REPO, encoding: "utf8", timeout: 60000, env: { ...process.env, NO_COLOR: "1" } });
    Assert.assertSame(0, fixture.status, outputOf(fixture));
    Assert.assertSame({ viaCallback: "mocked", viaDefault: "logger", viaUnless: "unless", verify: null }, JSON.parse(fixture.stdout) as unknown, outputOf(fixture));
  },
  120000,
);
