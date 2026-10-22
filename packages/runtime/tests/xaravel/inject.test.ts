// Xaravel Tests for Story 9.9: the `Symbol.metadata` polyfill and `inject` metadata (AD-4). One test per
// acceptance-criterion row of the manifest, in order. XT-runtime-33 runs fresh `bun` processes, so the polyfill is
// observed before and after a runtime entry loads; XT-runtime-34 runs in this process.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { inject, jsonEncode, readInjectMetadata } from "@xaravel/runtime";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

function assertTypeError(fn: () => unknown, pattern: RegExp): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof TypeError, `expected a TypeError: ${String(error)}`);
  Assert.assertTrue(pattern.test((error as Error).message), `unexpected message: ${(error as Error).message}`);
  Assert.assertTrue((error as Error).message.includes("(AD-4)"), `the message must name AD-4: ${(error as Error).message}`);
}

/** A method read without binding it (it is only inspected, never called). */
function member(holder: object, key: string): unknown {
  return Reflect.get(holder, key);
}

/** The keys and values of an inject map, in order, as `[key, value]` pairs. */
function entries(map: unknown): [string, unknown][] {
  Assert.assertTrue(typeof map === "object" && map !== null, "expected an inject map");
  return Object.entries(map as object);
}

xaravelTest(
  "XT-runtime-33",
  "once the runtime has loaded (its root or any subpath), Symbol.metadata is defined as Symbol.for('Symbol.metadata'), non-writable and non-configurable, and a TC39-decorated class exposes its metadata as X[Symbol.metadata]; before, a fresh Bun process has none (AD-4)",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "xaravel-metadata-"));
    try {
      for (const entry of ["src/index.ts", "src/scope/index.ts", "src/registry/index.ts", "src/php/index.ts"]) {
        const script = join(dir, `probe-${entry.replaceAll("/", "-")}`);
        writeFileSync(
          script,
          [
            "const before = typeof (Symbol as { metadata?: symbol }).metadata;",
            `await import(${jsonEncode(join(PACKAGE_DIR, entry))});`,
            "const descriptor = Object.getOwnPropertyDescriptor(Symbol, 'metadata')!;",
            "function tag(_value: unknown, context: ClassDecoratorContext): void { context.metadata['tag'] = 'tagged'; }",
            "@tag class Decorated {}",
            "const metadata = (Decorated as unknown as Record<symbol, Record<string, unknown>>)[Symbol.metadata];",
            "console.log([before, String(Symbol.metadata === Symbol.for('Symbol.metadata')), String(descriptor.writable), String(descriptor.configurable), String(metadata?.['tag'])].join(' '));",
            "",
          ].join("\n"),
        );
        const run = Bun.spawnSync([process.execPath, "--no-env-file", script], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe" });
        Assert.assertSame("", run.stderr.toString(), entry);
        Assert.assertSame(0, run.exitCode, entry);
        Assert.assertSame("undefined true false false tagged", run.stdout.toString().trim(), entry);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // In this process too: under the conformance harness, which freezes `Symbol` before the runtime loads, the harness
    // installs the same `Symbol.metadata` first (ESC-9.9-1), and outside it the polyfill does.
    Assert.assertSame(Symbol.for("Symbol.metadata"), (Symbol as { metadata?: symbol }).metadata ?? null);
  },
);

class Foo {}

@inject({ b: Foo, a: String })
class Service {
  constructor(
    readonly b: Foo,
    readonly a: string,
  ) {}

  @inject({ b: Foo, a: String })
  handle(b: Foo, a: string): string {
    return `${typeof b}${a}`;
  }

  @inject({ request: Foo })
  static make(request: Foo): Foo {
    return request;
  }
}

class Inherits extends Service {}

class Overrides extends Service {
  override handle(b: Foo, a: string): string {
    return `${typeof b}${a}!`;
  }
}

@inject({ a: String })
class OwnMap extends Service {
  constructor(a: string) {
    super(new Foo(), a);
  }
}

xaravelTest(
  "XT-runtime-34",
  "inject({ b: Foo, a: String }) as a TC39 class or method decorator (instance or static), or inject(map, fn), stores a frozen map readInjectMetadata returns with its key order (parameter order); a subclass inherits its class map, an override without inject has none, and an invalid map, key, value or decorator kind throws a TypeError naming AD-4 (AD-4)",
  () => {
    // A class decorator: the map, in key order, frozen, with a null prototype.
    const classMap = readInjectMetadata(Service);
    Assert.assertSame(jsonEncode(["b", "a"]), jsonEncode(entries(classMap).map(([key]) => key)));
    Assert.assertSame(Foo, classMap!["b"]);
    Assert.assertSame(String, classMap!["a"]);
    Assert.assertTrue(Object.isFrozen(classMap));
    Assert.assertNull(Object.getPrototypeOf(classMap));
    // An instance and a static method decorator: the map is the method's own, not the class's.
    const methodMap = readInjectMetadata(member(Service.prototype, "handle"));
    Assert.assertSame(jsonEncode(["b", "a"]), jsonEncode(entries(methodMap).map(([key]) => key)));
    Assert.assertTrue(Object.isFrozen(methodMap));
    Assert.assertTrue(methodMap !== classMap);
    Assert.assertSame(jsonEncode(["request"]), jsonEncode(entries(readInjectMetadata(member(Service, "make"))).map(([key]) => key)));
    Assert.assertSame(Foo, readInjectMetadata(member(Service, "make"))!["request"]);
    // The decorated class and method still work.
    Assert.assertSame("x", new Service(new Foo(), "x").a);
    // A subclass without inject inherits the class map, as PHP inherits a constructor; its own inject replaces it.
    Assert.assertSame(classMap, readInjectMetadata(Inherits));
    Assert.assertSame(jsonEncode(["a"]), jsonEncode(entries(readInjectMetadata(OwnMap)).map(([key]) => key)));
    Assert.assertSame(classMap, readInjectMetadata(Service));
    // An override without inject has none; the inherited method keeps its map.
    Assert.assertNull(readInjectMetadata(member(Overrides.prototype, "handle")));
    Assert.assertSame(methodMap, readInjectMetadata(member(Inherits.prototype, "handle")));
    // inject(map, fn) stores the map on fn and returns fn itself.
    const handler = (b: Foo, a: string): string => `${typeof b}${a}`;
    const returned = inject({ b: Foo, a: String }, handler);
    Assert.assertSame(handler, returned);
    Assert.assertSame(jsonEncode(["b", "a"]), jsonEncode(entries(readInjectMetadata(handler)).map(([key]) => key)));
    // The map is a copy: changing the original afterwards changes nothing.
    const original: Record<string, unknown> = { c: Foo };
    const later = (c: Foo): Foo => c;
    inject(original, later);
    original["d"] = String;
    Assert.assertSame(jsonEncode(["c"]), jsonEncode(entries(readInjectMetadata(later)).map(([key]) => key)));
    // inject(map, fn) on a function that inherits a map gives fn its own map and leaves the inherited one alone.
    const parent = inject({ b: Foo }, (b: Foo): Foo => b);
    const parentMap = readInjectMetadata(parent);
    const child = Object.setPrototypeOf((x: Foo): Foo => x, parent) as (x: Foo) => Foo;
    Assert.assertSame(parentMap, readInjectMetadata(child));
    inject({ x: Foo }, child);
    Assert.assertSame(jsonEncode(["x"]), jsonEncode(entries(readInjectMetadata(child)).map(([key]) => key)));
    Assert.assertSame(parentMap, readInjectMetadata(parent));
    // A second inject(map, fn) on the same function replaces its map.
    inject({ a: String }, handler);
    Assert.assertSame(jsonEncode(["a"]), jsonEncode(entries(readInjectMetadata(handler)).map(([key]) => key)));
    // Nothing stored: null.
    Assert.assertNull(readInjectMetadata(Foo));
    Assert.assertNull(readInjectMetadata((): null => null));
    Assert.assertNull(readInjectMetadata({}));

    // Invalid input throws a TypeError naming AD-4.
    const fn = (): null => null;
    const invalidMaps: unknown[] = [null, [Foo], "map", new Map([["a", Foo]]), new Foo()];
    for (const map of invalidMaps) {
      assertTypeError(() => inject(map as Record<string, unknown>), /the map must be a plain object/);
    }
    for (const map of [{ "0": Foo }, { "1a": Foo }, { "a-b": Foo }, { [Symbol("s")]: Foo }]) {
      assertTypeError(() => inject(map as Record<string, unknown>, fn), /is not a parameter name/);
    }
    for (const map of [{ a: undefined }, { a: null }]) {
      assertTypeError(() => inject(map, fn), /must be a class, a token or a spec/);
    }
    const decorator = inject({ a: String });
    for (const kind of ["field", "getter", "setter", "accessor"] as const) {
      assertTypeError(() => decorator(undefined, { kind, name: "x", static: false, private: false, access: {}, metadata: {}, addInitializer: () => undefined } as unknown as DecoratorContext), /cannot be decorated; use it on a class or a method/);
    }
    assertTypeError(() => inject({ a: String }, "not a function" as unknown as () => null), /the second argument must be a function/);
  },
);
