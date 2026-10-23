// Xaravel Tests for Story 9.4: the Class Registry and `fqcn()` (AD-10.1..10.5). One test per acceptance-criterion row
// of the manifest, in order. `xaravelTest` opens no frame (ESC-4.2-1 item 7), so each body starts outside any Scope
// Frame. Registrations into the base are process-wide, so every FQCN here is used by this file only.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Error as PhpError, jsonEncode } from "@xaravel/runtime/php";
import { fqcn, loadAutoload, loadClassmap, registerClass, registerTestClass, resolveClass, resolveClassAsync, writeClassmap } from "@xaravel/runtime/registry";
import { bindToFrame, interleave, runInFrame, runInNarrowFrame, runInRootFrame, ScopeFrameException } from "@xaravel/runtime/scope";

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** The value `promise` rejects with, or null when it fulfils. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

/** Settles after `n` turns of the microtask queue. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

const BRAND = Symbol.for("xaravel.class.fqcn");

class Post {}
class PostSubclass extends Post {}
class OtherPost {}
class Unregistered {}
class Foo {}
class Bar {}
class Baz {}
class Late {}

/** The runtime package's directory, from which a subprocess resolves `@xaravel/runtime/registry`. */
const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

xaravelTest(
  "XT-runtime-12",
  "registerClass('App\\Models\\Post', Post) makes resolveClass return Post for the FQCN (case-insensitively, a leading backslash ignored) and fqcn(Post) and fqcn(new Post()) return the FQCN; registration sets the grader's own, non-enumerable class-name brand (AD-10.1, AD-10.2, AD-10.3)",
  () => {
    registerClass("App\\Models\\Post", Post);
    Assert.assertSame(Post, resolveClass("App\\Models\\Post"));
    Assert.assertSame(Post, resolveClass("\\app\\models\\post"));
    Assert.assertSame(Post, resolveClass("APP\\MODELS\\POST"));
    Assert.assertSame("App\\Models\\Post", fqcn(Post));
    Assert.assertSame("App\\Models\\Post", fqcn(new Post()));

    // Registering the same class under the same FQCN again is a no-op, a leading `\` included.
    registerClass("\\App\\Models\\Post", Post);
    Assert.assertSame("App\\Models\\Post", fqcn(Post));

    // The brand: own, non-enumerable, non-configurable, the FQCN as registered.
    const descriptor = Object.getOwnPropertyDescriptor(Post, BRAND);
    Assert.assertNotNull(descriptor ?? null);
    Assert.assertSame("App\\Models\\Post", descriptor?.value);
    Assert.assertFalse(descriptor?.enumerable === true);
    Assert.assertFalse(descriptor?.configurable === true);
    Assert.assertSame("App\\Models\\Post", (Post as unknown as Record<symbol, unknown>)[BRAND]);
    Assert.assertFalse(Object.keys(Post).includes(String(BRAND)));

    // A subclass inherits the brand for display only: identity reads the Registry, which does not hold it.
    Assert.assertSame("App\\Models\\Post", (PostSubclass as unknown as Record<symbol, unknown>)[BRAND]);
    Assert.assertFalse(Object.hasOwn(PostSubclass, BRAND));
    Assert.assertInstanceOf(TypeError, thrownBy(() => fqcn(PostSubclass)));
  },
);

xaravelTest(
  "XT-runtime-13",
  "resolving an unregistered name throws an error naming the missing class (PHP's Class \"<FQCN>\" not found), synchronously and on the async path with no map; fqcn() of an unregistered class also throws (AD-10.2, AD-10.4)",
  async () => {
    const miss = thrownBy(() => resolveClass("App\\Missing"));
    Assert.assertInstanceOf(Error, miss);
    // PHP's Error (Story 9.10), as the Registry's comment names it.
    Assert.assertInstanceOf(PhpError, miss);
    Assert.assertSame("Error", fqcn(miss as object));
    Assert.assertSame('Class "App\\Missing" not found', (miss as Error).message);
    Assert.assertSame('Class "App\\Missing" not found', (thrownBy(() => resolveClass("\\App\\Missing")) as Error).message);

    try {
      loadAutoload(writePackageJson(null));
      const asyncMiss = await rejectionOf(resolveClassAsync("App\\Missing"));
      Assert.assertInstanceOf(Error, asyncMiss);
      Assert.assertInstanceOf(PhpError, asyncMiss);
      Assert.assertSame("Error", fqcn(asyncMiss as object));
      Assert.assertSame('Class "App\\Missing" not found', (asyncMiss as Error).message);
    } finally {
      reset();
    }

    const message = "fqcn(): the class is not registered; end its file with registerClass('<FQCN>', <Class>)";
    for (const value of [Unregistered, new Unregistered(), class {}]) {
      const error = thrownBy(() => fqcn(value));
      Assert.assertInstanceOf(TypeError, error);
      Assert.assertSame(message, (error as Error).message);
    }
    Assert.assertInstanceOf(TypeError, thrownBy(() => resolveClass(1 as unknown as string)));
  },
);

xaravelTest(
  "XT-runtime-14",
  "registering a different class under an existing key throws, and the same class under a second FQCN throws naming both; registerTestClass(fqcn, X) inside a test frame registers into that test frame's overlay only: resolvable and fqcn-able there and from its children, not in a sibling or later test frame or outside, and ScopeFrameException outside any test frame (AD-10.5, AD-5.8)",
  async () => {
    registerClass("App\\Models\\Post", Post);
    const duplicate = thrownBy(() => registerClass("app\\models\\POST", OtherPost));
    Assert.assertInstanceOf(TypeError, duplicate);
    Assert.assertSame("registerClass(): app\\models\\POST is already registered to another class", (duplicate as Error).message);
    Assert.assertSame(Post, resolveClass("App\\Models\\Post"));
    Assert.assertNull(Object.getOwnPropertyDescriptor(OtherPost, BRAND) ?? null, "a rejected registration sets no brand");

    const second = thrownBy(() => registerClass("App\\Post2", Post));
    Assert.assertInstanceOf(TypeError, second);
    Assert.assertSame("registerClass(): the class registered as App\\Models\\Post cannot also be registered as App\\Post2", (second as Error).message);
    Assert.assertSame("App\\Models\\Post", fqcn(Post));
    Assert.assertSame('Class "App\\Post2" not found', (thrownBy(() => resolveClass("App\\Post2")) as Error).message);

    // Outside any frame, and in a frame with no test unit up the chain.
    const outside = thrownBy(() => registerTestClass("Tests\\Fixtures\\Foo", Foo));
    Assert.assertInstanceOf(ScopeFrameException, outside);
    Assert.assertSame("Cannot register the test class Tests\\Fixtures\\Foo with no active Scope Frame; run the code inside a test frame", (outside as Error).message);
    const inUnit = runInRootFrame("unit", () => thrownBy(() => registerTestClass("Tests\\Fixtures\\Foo", Foo)));
    Assert.assertInstanceOf(ScopeFrameException, inUnit);
    Assert.assertSame("Cannot register the test class Tests\\Fixtures\\Foo from the unit frame: no test frame encloses it", (inUnit as Error).message);

    await runInRootFrame("test", async () => {
      registerTestClass("Tests\\Fixtures\\Foo", Foo);
      Assert.assertSame(Foo, resolveClass("tests\\fixtures\\foo"));
      Assert.assertSame("Tests\\Fixtures\\Foo", fqcn(Foo));
      Assert.assertSame("Tests\\Fixtures\\Foo", fqcn(new Foo()));
      Assert.assertSame("Tests\\Fixtures\\Foo", (Foo as unknown as Record<symbol, unknown>)[BRAND]);
      Assert.assertSame(Foo, await resolveClassAsync("Tests\\Fixtures\\Foo"));
      // Base classes still resolve inside the test frame.
      Assert.assertSame(Post, resolveClass("App\\Models\\Post"));

      // From a child unit and a narrow frame: reads fall through; a write lands in the test frame and stays for it.
      runInFrame("unit", () => {
        Assert.assertSame(Foo, resolveClass("Tests\\Fixtures\\Foo"));
        runInNarrowFrame("transaction", [], () => registerTestClass("Tests\\Fixtures\\Bar", Bar));
        Assert.assertSame("Tests\\Fixtures\\Bar", fqcn(Bar));
      });
      Assert.assertSame(Bar, resolveClass("Tests\\Fixtures\\Bar"));

      // A key the base holds for another class, a key this test holds for another class, a second FQCN.
      Assert.assertSame("registerTestClass(): App\\Models\\Post is already registered to another class", (thrownBy(() => registerTestClass("App\\Models\\Post", Baz)) as Error).message);
      Assert.assertSame("registerTestClass(): Tests\\Fixtures\\Foo is already registered to another class in this test", (thrownBy(() => registerTestClass("Tests\\Fixtures\\Foo", Baz)) as Error).message);
      Assert.assertSame("registerTestClass(): the class registered as Tests\\Fixtures\\Foo in this test cannot also be registered as Tests\\Fixtures\\Foo2", (thrownBy(() => registerTestClass("Tests\\Fixtures\\Foo2", Foo)) as Error).message);
      Assert.assertSame("registerTestClass(): the class registered as App\\Models\\Post cannot also be registered as Tests\\Post", (thrownBy(() => registerTestClass("Tests\\Post", Post)) as Error).message);
      // The same class under the same FQCN again, here or where the base already holds it, is a no-op.
      registerTestClass("Tests\\Fixtures\\Foo", Foo);
      registerTestClass("App\\Models\\Post", Post);
      Assert.assertSame("App\\Models\\Post", fqcn(Post));
    });

    // Not outside, nor in a later test frame.
    Assert.assertSame('Class "Tests\\Fixtures\\Foo" not found', (thrownBy(() => resolveClass("Tests\\Fixtures\\Foo")) as Error).message);
    Assert.assertInstanceOf(TypeError, thrownBy(() => fqcn(Foo)));
    runInRootFrame("test", () => {
      Assert.assertInstanceOf(Error, thrownBy(() => resolveClass("Tests\\Fixtures\\Foo")));
      Assert.assertInstanceOf(Error, thrownBy(() => resolveClass("Tests\\Fixtures\\Bar")));
      Assert.assertInstanceOf(TypeError, thrownBy(() => fqcn(Bar)));
      // A later test may register the same fixture again, under another FQCN.
      registerTestClass("Tests\\Other\\Foo", Foo);
      Assert.assertSame("Tests\\Other\\Foo", fqcn(Foo));
    });

    // A write from a callback that outlives its test unit throws.
    const holder: { late: (() => void) | null } = { late: null };
    runInRootFrame("test", () => {
      holder.late = bindToFrame(() => registerTestClass("Tests\\Fixtures\\Late", Late));
    });
    const ended = thrownBy(() => holder.late?.());
    Assert.assertInstanceOf(ScopeFrameException, ended);
    Assert.assertSame("Cannot register the test class Tests\\Fixtures\\Late to the test frame after it has ended", (ended as Error).message);

    // Importing only @xaravel/runtime/registry installs the Registry's test-frame access.
    const child = Bun.spawnSync(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        String.raw`import { fqcn, registerTestClass } from "@xaravel/runtime/registry";
class Foo {}
const run = globalThis[Symbol.for("xaravel.scope.run")];
console.log(run("test", () => { registerTestClass("Tests\\Fixtures\\Foo", Foo); return fqcn(Foo); }));`,
      ],
      { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe" },
    );
    Assert.assertSame("", child.stderr.toString());
    Assert.assertSame("Tests\\Fixtures\\Foo\n", child.stdout.toString());
    Assert.assertSame(0, child.exitCode);

    // Nor in a sibling test frame running concurrently.
    const seen = await interleave([
      () =>
        runInFrame("test", async () => {
          registerTestClass("Tests\\Fixtures\\Baz", Baz);
          await ticks(3);
          return fqcn(Baz);
        }),
      () =>
        runInFrame("test", async () => {
          await ticks(1);
          const error = thrownBy(() => resolveClass("Tests\\Fixtures\\Baz"));
          await ticks(3);
          return error instanceof Error ? error.message : "resolved";
        }),
    ]);
    Assert.assertSame("Tests\\Fixtures\\Baz", seen[0]);
    Assert.assertSame('Class "Tests\\Fixtures\\Baz" not found', seen[1]);
  },
);

/** The temporary directories made so far; `removeTempDirs` deletes them. */
const temps: string[] = [];

/** A fresh temporary directory, removed by `removeTempDirs`. */
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-registry-"));
  temps.push(dir);
  return dir;
}

/** Clears the PSR-4 map and the classmap, and deletes every temporary directory. */
function reset(): void {
  loadAutoload(writePackageJson(null));
  const empty = join(tempDir(), "classes.json");
  writeFileSync(empty, "{}");
  loadClassmap(empty);
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A `package.json` in a fresh directory, with `psr4` as `xaravel.autoload.psr-4` (none when null). */
function writePackageJson(psr4: Record<string, unknown> | null, dir: string = tempDir()): string {
  const path = join(dir, "package.json");
  writeFileSync(path, jsonEncode(psr4 === null ? { name: "app" } : { name: "app", xaravel: { autoload: { "psr-4": psr4 } } }) as string);
  return path;
}

/** The absolute path of `@xaravel/runtime/registry`, which a fixture module outside the workspace imports. */
const REGISTRY = fileURLToPath(import.meta.resolve("@xaravel/runtime/registry"));

/** Writes a module at `root/relative` declaring `className` (with a static `source`) and registering it as `registers`, unless null. */
function writeModule(root: string, relative: string, className: string, registers: string | null, source: string): void {
  const file = join(root, relative);
  mkdirSync(join(file, ".."), { recursive: true });
  const registration = registers === null ? "" : `registerClass(${jsonEncode(registers)}, ${className});\n`;
  writeFileSync(file, `import { registerClass } from ${jsonEncode(REGISTRY)};\nexport class ${className} {\n  static readonly source = ${jsonEncode(source)};\n}\n${registration}`);
}

xaravelTest(
  "XT-runtime-15",
  "with a PSR-4 map from package.json (xaravel.autoload.psr-4), an async resolve that misses maps the FQCN to a file, awaits import() of it and returns the class that file registered, and rejects naming the class with no mapped prefix, no file, or a file that does not register it; writeClassmap(path) and loadClassmap(path) round-trip bootstrap/cache/classes.json, and a miss resolves through the classmap before PSR-4 (AD-10.3, AD-10.4)",
  async () => {
    const root = tempDir();
    try {
      writeModule(root, "app/Models/Comment.ts", "Comment", "App\\Models\\Comment", "psr-4");
      writeModule(root, "app/Models/Silent.ts", "Silent", null, "psr-4");
      writeModule(root, "app/Models/Tag.ts", "Tag", "App\\Models\\Tag", "psr-4");
      writeModule(root, "app/Models/Widget.ts", "Widget", "App\\Models\\Widget", "psr-4");
      writeModule(root, "other/Widget.ts", "Widget", "App\\Models\\Widget", "classmap");
      writeModule(root, "database/factories/PostFactory.ts", "PostFactory", "Database\\Factories\\PostFactory", "psr-4");
      writeFileSync(join(root, "app", "Models", "notes.txt"), "not a module");
      loadAutoload(writePackageJson({ "App\\": "app/", "Database\\Factories\\": ["database/factories/"] }, root));

      // The sync path never imports.
      Assert.assertSame('Class "App\\Models\\Comment" not found', (thrownBy(() => resolveClass("App\\Models\\Comment")) as Error).message);

      const Comment = await resolveClassAsync("App\\Models\\Comment");
      Assert.assertSame("psr-4", (Comment as unknown as { source: string }).source);
      Assert.assertSame(Comment, resolveClass("App\\Models\\Comment"));
      Assert.assertSame("App\\Models\\Comment", fqcn(Comment));
      Assert.assertSame(Comment, await resolveClassAsync("\\app\\models\\comment"));
      Assert.assertSame("Database\\Factories\\PostFactory", fqcn(await resolveClassAsync("Database\\Factories\\PostFactory")));

      for (const [name, why] of [
        ["Vendor\\Thing", "no mapped prefix"],
        ["App\\Models\\Nothing", "no file"],
        ["App\\Models\\Silent", "a file that does not register the class"],
        ["App\\..\\Escape", "not a class name"],
      ] as const) {
        const error = await rejectionOf(resolveClassAsync(name));
        Assert.assertInstanceOf(Error, error, why);
        Assert.assertSame(`Class "${name}" not found`, (error as Error).message, why);
      }

      // The classmap: every mapped class file, sorted, with files relative to the classmap and encoded as PHP does.
      const classes = join(root, "bootstrap", "cache", "classes.json");
      writeClassmap(classes);
      Assert.assertSame(
        '{"App\\\\Models\\\\Comment":"..\\/..\\/app\\/Models\\/Comment.ts","App\\\\Models\\\\Silent":"..\\/..\\/app\\/Models\\/Silent.ts","App\\\\Models\\\\Tag":"..\\/..\\/app\\/Models\\/Tag.ts","App\\\\Models\\\\Widget":"..\\/..\\/app\\/Models\\/Widget.ts","Database\\\\Factories\\\\PostFactory":"..\\/..\\/database\\/factories\\/PostFactory.ts"}',
        readFileSync(classes, "utf8"),
      );

      // Round trip: with no PSR-4 map, a loaded classmap alone resolves a miss, and writes back the same entries.
      loadAutoload(writePackageJson(null));
      loadClassmap(classes);
      Assert.assertSame("App\\Models\\Tag", fqcn(await resolveClassAsync("App\\Models\\Tag")));
      const again = join(root, "bootstrap", "cache", "again.json");
      writeClassmap(again);
      Assert.assertSame(readFileSync(classes, "utf8"), readFileSync(again, "utf8"));

      // A miss consults the classmap before PSR-4.
      loadAutoload(join(root, "package.json"));
      const custom = join(root, "bootstrap", "cache", "custom.json");
      writeFileSync(custom, jsonEncode({ "App\\Models\\Widget": "../../other/Widget.ts" }) as string);
      loadClassmap(custom);
      Assert.assertSame("classmap", ((await resolveClassAsync("App\\Models\\Widget")) as unknown as { source: string }).source);

      // A classmap entry whose file is missing falls back to PSR-4; the longer PSR-4 prefix wins; a prefix's directory
      // list is searched in order.
      const root2 = tempDir();
      writeModule(root2, "app/Models/Fallback.ts", "Fallback", "App\\Models\\Fallback", "psr-4");
      writeModule(root2, "special/Thing.ts", "Thing", "App\\Models\\Special\\Thing", "longer");
      writeModule(root2, "app/Models/Special/Thing.ts", "Thing", "App\\Models\\Special\\Thing", "shorter");
      writeModule(root2, "database/more/UserFactory.ts", "UserFactory", "Database\\Factories\\UserFactory", "second");
      mkdirSync(join(root2, "database", "factories"), { recursive: true });
      loadAutoload(writePackageJson({ "App\\": "app/", "App\\Models\\Special\\": "special/", "Database\\Factories\\": ["database/factories/", "database/more/"] }, root2));
      const gone = join(root2, "bootstrap", "cache", "gone.json");
      mkdirSync(join(root2, "bootstrap", "cache"), { recursive: true });
      writeFileSync(gone, jsonEncode({ "App\\Models\\Fallback": "../../gone/Fallback.ts" }) as string);
      loadClassmap(gone);
      Assert.assertSame("psr-4", ((await resolveClassAsync("App\\Models\\Fallback")) as unknown as { source: string }).source);
      Assert.assertSame("longer", ((await resolveClassAsync("App\\Models\\Special\\Thing")) as unknown as { source: string }).source);
      Assert.assertSame("second", ((await resolveClassAsync("Database\\Factories\\UserFactory")) as unknown as { source: string }).source);

      // With its source maps gone, a class the async path imported stays in the written classmap while its file
      // exists; a loaded or imported entry whose file no longer exists is skipped.
      loadAutoload(writePackageJson(null));
      const stale = join(root2, "bootstrap", "cache", "stale.json");
      writeModule(root2, "stale/Stale.ts", "Stale", "App\\Models\\Stale", "classmap");
      writeFileSync(stale, jsonEncode({ "App\\Models\\Stale": "../../stale/Stale.ts" }) as string);
      loadClassmap(stale);
      rmSync(root2, { recursive: true, force: true });
      const kept = join(root, "bootstrap", "cache", "kept.json");
      writeClassmap(kept);
      const keptText = readFileSync(kept, "utf8");
      Assert.assertStringContainsString('"App\\\\Models\\\\Comment":"..\\/..\\/app\\/Models\\/Comment.ts"', keptText);
      Assert.assertStringContainsString('"Database\\\\Factories\\\\PostFactory":"..\\/..\\/database\\/factories\\/PostFactory.ts"', keptText);
      for (const absent of ["Stale", "Fallback", "Thing", "UserFactory"]) {
        Assert.assertStringNotContainsString(absent, keptText);
      }

      // Unreadable or malformed files throw naming the path.
      for (const [path, text] of [
        [join(root, "missing.json"), null],
        [join(root, "bad.json"), "{"],
        [join(root, "list.json"), "[1]"],
        [join(root, "entry.json"), '{"App\\\\X":1}'],
      ] as const) {
        if (text !== null) {
          writeFileSync(path, text);
        }
        const error = thrownBy(() => loadClassmap(path));
        Assert.assertInstanceOf(Error, error);
        Assert.assertStringContainsString(path, (error as Error).message);
      }
      const badMap = join(root, "bad-package.json");
      writeFileSync(badMap, '{"xaravel":{"autoload":{"psr-4":{"App":"app/"}}}}');
      Assert.assertStringContainsString(badMap, (thrownBy(() => loadAutoload(badMap)) as Error).message);
      for (const [name, text] of [
        ["autoload-list.json", '{"xaravel":{"autoload":[]}}'],
        ["xaravel-string.json", '{"xaravel":"x"}'],
      ] as const) {
        const path = join(root, name);
        writeFileSync(path, text);
        const error = thrownBy(() => loadAutoload(path));
        Assert.assertInstanceOf(Error, error, name);
        Assert.assertStringContainsString(path, (error as Error).message, name);
      }
      Assert.assertStringContainsString(join(root, "nope.json"), (thrownBy(() => loadAutoload(join(root, "nope.json"))) as Error).message);

      // The default-flags jsonEncode core the classmap is written with (decisions/ESC-9.4-1.md part 2). An empty plain
      // object is an empty PHP array, PHP's `[]` (Epic 9 retro item 4; PHP 8.5.11 `json_encode(['a' => [...], 'b' => []])`);
      // `writeClassmap` keeps an empty classmap `{}` with JSON_FORCE_OBJECT (XT-runtime-27's fresh-process row).
      Assert.assertSame('{"a":[1,true,null,"\\/\\"\\\\\\n\\u0001\\u00e9\\ud83d\\ude00"],"b":[]}', jsonEncode({ a: [1, true, null, '/"\\\n\u0001é😀'], b: {} }));
      // Story 9.8 grows the core into PHP's json_encode: a float and an object without public properties encode.
      Assert.assertSame("1.5", jsonEncode(1.5));
      Assert.assertSame("{}", jsonEncode(new Map()));
    } finally {
      reset();
    }
  },
);
