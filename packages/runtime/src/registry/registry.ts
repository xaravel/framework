// The Class Registry (AD-10): one process-wide map from PHP FQCN to class, built on the 9.1 core (ESC-9.1-2).
//
// Classes register when their module loads, so the base map is boot state, not per-unit state (AD-5). Keys are the
// FQCN lower-cased (PHP class names are case-insensitive) with a leading `\` dropped.
//
// - `registerClass(fqcn, X)` (9.1) also sets the grader's class-name brand, `X[Symbol.for('xaravel.class.fqcn')]`,
//   own and non-enumerable (ESC-4.3-1 item 1). A subclass inherits it for display only; `fqcn()` reads the Registry,
//   never the brand, save for one case: a `contract<T>()` token, a frozen non-function object carrying the key as an
//   own, non-writable string data property, gives that string (ESC-10.1-3, Story 9.14). No token is registered, so
//   `resolveClass` never resolves a token's name.
// - `resolveClass(fqcn)` is the class registered under an FQCN, else throws PHP's `Error` `Class "<FQCN>" not found`
//   with the name as given, a leading `\` kept (Story 9.13):
//   the class registered as `Error` (Story 9.10, `php/Error.ts`), read from the base map so this file imports no
//   exception class, else the JS `Error` when nothing registered it.
// - `registerTestClass(fqcn, X)` registers a test fixture in the nearest `test` unit up the frame chain (AD-10.5); it
//   is discarded when that unit ends. `resolveClass` and `fqcn` check the test units up the chain before the base,
//   an `interleave` unit's origin test included. A test class's brand is an own, configurable accessor, installed
//   once per class, that reads the name the nearest test unit up the active chain holds the class under, else the
//   inherited brand, else null: concurrent test frames each see their own name, and none outlives its test (L2).
//   A base `registerClass` replaces the accessor with its non-configurable value.
// - The Registry keeps the test-class maps of the test units that have registered a class while they run, and drops
//   each once its unit has ended. `registerClass` refuses a key such a map holds for another class, and a class such
//   a map holds under another FQCN (L4), from any frame, a sibling test's included.
// - `loadAutoload(packageJsonPath)` reads the PSR-4 map (`xaravel.autoload.psr-4`, AD-10.3) and `loadClassmap(path)`
//   the classmap (`bootstrap/cache/classes.json`); `writeClassmap(path)` writes it (AD-10.4). Both are boot state.
// - `resolveClassAsync(fqcn)` is the one async miss path (AD-10.4; decisions/ESC-9.4-1.md part 1): on a miss it
//   `await import()`s the file the classmap, else the PSR-4 map, gives. `resolveClass` stays sync and never imports.
//
// Load safety: every class file, PHP's exceptions included, imports `registerClass` from here, so this file imports no
// module that registers a class on load, not even transitively (Story 9.10). It imports nothing from `scope/` or
// `php/`: the scope module installs the Registry's access to the test units on load (`installTestFrameAccess`), and
// `registry/index.ts` installs the classmap encoder, `jsonEncode` (`installClassmapEncoder`).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Any class: the Registry stores constructors, never instances. */
export type RegisteredClass = abstract new (...args: never[]) => unknown;

interface Entry {
  readonly fqcn: string;
  readonly klass: RegisteredClass;
}

/** Registered classes by lower-cased FQCN (PHP class names are case-insensitive). */
const byKey = new Map<string, Entry>();
/** The FQCN each registered class was registered under. */
const byClass = new WeakMap<RegisteredClass, string>();

/** The grader's class-name brand (ESC-4.3-1 item 1), read by `@xaravel/assert` without importing the runtime. */
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** A PHP FQCN without a leading `\`: identifier segments joined by single `\`. */
const FQCN_SHAPE = /^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*(?:\\[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*)*$/;
/** One FQCN segment, as a file or directory name maps to it. */
const SEGMENT = /^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/;
/** The module extensions an autoloaded file may have, in the order they are tried. */
const EXTENSIONS: readonly string[] = [".ts", ".tsx", ".js"];

/** `\Foo\Bar` and `Foo\Bar` name the same class. */
function normalise(fqcn: string): string {
  return fqcn.startsWith("\\") ? fqcn.slice(1) : fqcn;
}

/**
 * Registers `klass` under the PHP FQCN `fqcn`. Registering the same class under the same FQCN again is a no-op;
 * a different class under a taken FQCN, or a registered class under a second FQCN, throws.
 */
export function registerClass(fqcn: string, klass: RegisteredClass): void {
  if (typeof fqcn !== "string" || normalise(fqcn) === "") {
    throw new TypeError("registerClass(): the FQCN must be a non-empty string");
  }
  if (typeof klass !== "function") {
    throw new TypeError(`registerClass(): ${fqcn} must be registered with a class`);
  }
  const name = normalise(fqcn);
  const key = name.toLowerCase();
  const taken = byKey.get(key);
  const previous = byClass.get(klass);
  if (taken !== undefined && taken.klass === klass) {
    return;
  }
  if (taken !== undefined) {
    throw new TypeError(`registerClass(): ${name} is already registered to another class`);
  }
  if (previous !== undefined) {
    throw new TypeError(`registerClass(): the class registered as ${previous} cannot also be registered as ${name}`);
  }
  for (const maps of liveTestMaps()) {
    const held = maps.byKey.get(key);
    if (held !== undefined && held.klass !== klass) {
      throw new TypeError(`registerClass(): ${name} is already registered to another class in a running test`);
    }
    const as = maps.byClass.get(klass);
    if (as !== undefined && as.toLowerCase() !== key) {
      throw new TypeError(`registerClass(): the class registered as ${as} in a running test cannot also be registered as ${name}`);
    }
  }
  Object.defineProperty(klass, CLASS_FQCN, { value: name, enumerable: false, writable: false, configurable: false });
  byKey.set(key, { fqcn: name, klass });
  byClass.set(klass, name);
}

/**
 * The FQCN `classOrInstance`'s class was registered under; throws when that class is not registered. A contract token
 * (`contract<T>()`: a frozen, non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data
 * property is a string) gives that string (ESC-10.1-3).
 */
export function fqcn(classOrInstance: object): string {
  if ((typeof classOrInstance !== "object" && typeof classOrInstance !== "function") || classOrInstance === null) {
    throw new TypeError("fqcn(): the value is not a class or an object");
  }
  const token = tokenFqcn(classOrInstance);
  if (token !== null) {
    return token;
  }
  const klass: unknown = typeof classOrInstance === "function" ? classOrInstance : Object.getPrototypeOf(classOrInstance)?.constructor;
  if (typeof klass === "function") {
    for (const maps of testClassMaps()) {
      const name = maps.byClass.get(klass as RegisteredClass);
      if (name !== undefined) {
        return name;
      }
    }
  }
  const name = typeof klass === "function" ? byClass.get(klass as RegisteredClass) : undefined;
  if (name === undefined) {
    throw new TypeError("fqcn(): the class is not registered; end its file with registerClass('<FQCN>', <Class>)");
  }
  return name;
}

/** A contract token's own FQCN key (ESC-10.1-3), else null: only a frozen non-function object's own, non-writable string data property counts. */
function tokenFqcn(value: object): string | null {
  if (typeof value !== "object" || !Object.isFrozen(value)) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, CLASS_FQCN);
  if (descriptor === undefined || !("value" in descriptor) || descriptor.writable !== false || typeof descriptor.value !== "string") {
    return null;
  }
  return descriptor.value;
}

/**
 * The class registered under the PHP FQCN `fqcn` (case-insensitive, a leading `\` ignored): a test class registered
 * in a `test` unit up the active frame chain, else the base registration. Throws `Class "<FQCN>" not found` when
 * none is registered. Never imports a file: an async caller that may miss uses `resolveClassAsync`.
 */
export function resolveClass(fqcn: string): RegisteredClass {
  if (typeof fqcn !== "string") {
    throw new TypeError("resolveClass(): the FQCN must be a string");
  }
  const found = lookUp(fqcn);
  if (found === null) {
    throw notFound(fqcn);
  }
  return found.klass;
}

/**
 * The class registered under the PHP FQCN `fqcn`, as `resolveClass`; on a miss, imports the file the classmap gives
 * for it, else the file its PSR-4 prefix maps it to (`app/Models/Comment.ts` for `App\Models\Comment` under
 * `"App\\": "app/"`), and resolves with the class that file registered. Rejects with `Class "<FQCN>" not found` when
 * no file is mapped or found, or the file does not register the class. The one module-loading root of the Registry:
 * AD-10.4 names the async miss path and its `await import()`, and decisions/ESC-9.4-1.md (option 1a) adds it as the
 * root its tag names.
 * @asyncRoot Registry.resolveClassAsync
 */
export async function resolveClassAsync(fqcn: string): Promise<RegisteredClass> {
  if (typeof fqcn !== "string") {
    throw new TypeError("resolveClassAsync(): the FQCN must be a string");
  }
  const found = lookUp(fqcn);
  if (found !== null) {
    return found.klass;
  }
  const file = locate(normalise(fqcn));
  if (file !== null) {
    await import(file);
    const imported = lookUp(fqcn);
    if (imported !== null) {
      loadedFiles.set(imported.fqcn.toLowerCase(), { fqcn: imported.fqcn, file });
      return imported.klass;
    }
  }
  throw notFound(fqcn);
}

/**
 * PHP's `Error` `Class "<FQCN>" not found`, built from the class the base map holds as `Error` (Story 9.10). The name
 * is the one given, a leading `\` kept, as PHP's `new $name` writes it (Story 9.13); only the lookup normalises.
 */
function notFound(fqcn: string): Error {
  const message = `Class "${fqcn}" not found`;
  const php = registeredBaseClass("Error") as (new (message: string) => Error) | null;
  return php === null ? new Error(message) : new php(message);
}

/**
 * The class the base map holds under the PHP name `fqcn` (case-insensitive), or null; never a test class. Lets
 * runtime modules that the PHP exceptions load (this file, their own constructor checks) build PHP's `Error` and
 * `TypeError` without importing them. Internal.
 */
export function registeredBaseClass(fqcn: string): RegisteredClass | null {
  return byKey.get(normalise(fqcn).toLowerCase())?.klass ?? null;
}

/** The test-frame entry, else the base entry, for `fqcn`; null when neither holds it. */
function lookUp(fqcn: string): Entry | null {
  const key = normalise(fqcn).toLowerCase();
  for (const maps of testClassMaps()) {
    const entry = maps.byKey.get(key);
    if (entry !== undefined) {
      return entry;
    }
  }
  return byKey.get(key) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Test classes (AD-10.5)

/**
 * The Registry's access to the `test` units of the active frame chain (internal). `read(owner)` is `owner`'s entries
 * in each `test` unit up the chain, nearest first, an `interleave` unit's origin test included; `write(owner, what)`
 * is `owner`'s entries in the nearest one up the parent chain, created on first use, with whether that unit has
 * ended, and throws `ScopeFrameException` outside any frame, with no `test` unit up the chain, or once it has ended.
 */
export interface TestFrameAccess {
  read(owner: object): ReadonlyArray<Map<string | symbol, unknown>>;
  write(owner: object, what: string): { readonly entries: Map<string | symbol, unknown>; readonly ended: () => boolean };
}

let testFrames: TestFrameAccess | null = null;
/** Whether any test class was ever registered; until then lookups skip the frame walk. */
let anyTestClass = false;
const NO_TEST_CLASS_MAPS: readonly TestClassMaps[] = Object.freeze([]);

/** Installs the Registry's access to the test units; called once, by the scope module on load. Internal. */
export function installTestFrameAccess(access: TestFrameAccess): void {
  if (testFrames !== null) {
    throw new TypeError("installTestFrameAccess(): the Registry's test-frame access is already installed");
  }
  testFrames = access;
}

/** The owner of the Registry's entries in a test unit's statics. */
const TEST_CLASSES: object = Object.freeze({ owner: "Xaravel\\Runtime\\Registry" });
const BY_KEY: unique symbol = Symbol("xaravel.registry.test.byKey");
const BY_CLASS: unique symbol = Symbol("xaravel.registry.test.byClass");

interface TestClassMaps {
  readonly byKey: Map<string, Entry>;
  readonly byClass: Map<RegisteredClass, string>;
}

/** The test-class maps of the test units that registered a class, with whether each unit has ended (L4). */
const liveTests = new Map<TestClassMaps["byKey"], { readonly maps: TestClassMaps; readonly ended: () => boolean }>();

/** The test-class maps of the test units still running; drops those whose unit has ended. */
function liveTestMaps(): TestClassMaps[] {
  const live: TestClassMaps[] = [];
  for (const [key, record] of liveTests) {
    if (record.ended()) {
      liveTests.delete(key);
    } else {
      live.push(record.maps);
    }
  }
  return live;
}

/** Classes that carry the test-class brand accessor (L2). */
const branded = new WeakSet<RegisteredClass>();

/**
 * Installs `klass`'s test-class brand once: an own, configurable accessor that reads the FQCN the nearest test unit up
 * the active chain holds `klass` under, else the brand `klass` inherits, else null (AD-9). It closes over `klass`, so a
 * subclass that inherits it shows its parent's name.
 */
function installTestBrand(klass: RegisteredClass): void {
  if (branded.has(klass)) {
    return;
  }
  const parent: unknown = Object.getPrototypeOf(klass);
  Object.defineProperty(klass, CLASS_FQCN, {
    get: (): string | null => {
      for (const maps of testClassMaps()) {
        const name = maps.byClass.get(klass);
        if (name !== undefined) {
          return name;
        }
      }
      const inherited: unknown = parent === null ? null : Reflect.get(parent as object, CLASS_FQCN);
      return typeof inherited === "string" ? inherited : null;
    },
    enumerable: false,
    configurable: true,
  });
  branded.add(klass);
}

/** The test-class maps of each `test` unit up the active frame chain, nearest first. */
function testClassMaps(): readonly TestClassMaps[] {
  if (testFrames === null || !anyTestClass) {
    return NO_TEST_CLASS_MAPS;
  }
  return testFrames.read(TEST_CLASSES).map(mapsOf);
}

function mapsOf(entries: Map<string | symbol, unknown>): TestClassMaps {
  let keys = entries.get(BY_KEY) as Map<string, Entry> | undefined;
  let classes = entries.get(BY_CLASS) as Map<RegisteredClass, string> | undefined;
  if (keys === undefined || classes === undefined) {
    keys = new Map();
    classes = new Map();
    entries.set(BY_KEY, keys);
    entries.set(BY_CLASS, classes);
  }
  return { byKey: keys, byClass: classes };
}

/**
 * Registers the test fixture `klass` under the PHP FQCN `fqcn` in the nearest `test` unit up the active frame chain
 * (AD-10.5), from wherever it is called, so it is resolvable and `fqcn`-able in that test frame and its children and
 * discarded when the test unit ends. Throws `ScopeFrameException` outside any test frame; throws, as `registerClass`
 * does, when the base or a test unit up the chain holds the key for another class or the class under another FQCN.
 * Registering a class where it is already registered under the same FQCN is a no-op. The class gets the grader's
 * brand as an own accessor that reads the name the active chain's test units hold it under, else null, so concurrent
 * test frames do not see each other's names and a later test may register it under another FQCN.
 */
export function registerTestClass(fqcn: string, klass: RegisteredClass): void {
  if (typeof fqcn !== "string" || normalise(fqcn) === "") {
    throw new TypeError("registerTestClass(): the FQCN must be a non-empty string");
  }
  if (typeof klass !== "function") {
    throw new TypeError(`registerTestClass(): ${fqcn} must be registered with a class`);
  }
  if (testFrames === null) {
    throw new TypeError("registerTestClass(): the Scope Frame module is not loaded; import @xaravel/runtime/registry");
  }
  const name = normalise(fqcn);
  const key = name.toLowerCase();
  const taken = byKey.get(key);
  const previous = byClass.get(klass);
  if (taken !== undefined && taken.klass === klass) {
    return;
  }
  if (taken !== undefined) {
    throw new TypeError(`registerTestClass(): ${name} is already registered to another class`);
  }
  if (previous !== undefined) {
    throw new TypeError(`registerTestClass(): the class registered as ${previous} cannot also be registered as ${name}`);
  }
  for (const maps of testClassMaps()) {
    const held = maps.byKey.get(key);
    const as = maps.byClass.get(klass);
    if (held !== undefined && held.klass === klass) {
      return;
    }
    if (held !== undefined) {
      throw new TypeError(`registerTestClass(): ${name} is already registered to another class in this test`);
    }
    if (as !== undefined) {
      throw new TypeError(`registerTestClass(): the class registered as ${as} in this test cannot also be registered as ${name}`);
    }
  }
  const written = testFrames.write(TEST_CLASSES, `the test class ${name}`);
  const target = mapsOf(written.entries);
  liveTestMaps();
  liveTests.set(target.byKey, { maps: target, ended: written.ended });
  installTestBrand(klass);
  anyTestClass = true;
  target.byKey.set(key, { fqcn: name, klass });
  target.byClass.set(klass, name);
}

// ---------------------------------------------------------------------------------------------------------------
// PSR-4 and the classmap (AD-10.3, AD-10.4)

interface Psr4Prefix {
  readonly prefix: string;
  readonly dirs: readonly string[];
}

/** The PSR-4 map, longest prefix first (boot state, `loadAutoload`). */
let psr4: readonly Psr4Prefix[] = [];
/** The classmap, by lower-cased FQCN (boot state, `loadClassmap`). Files are absolute. */
let classmap = new Map<string, { readonly fqcn: string; readonly file: string }>();
/** The files `resolveClassAsync` imported, by lower-cased FQCN; `writeClassmap` writes them too. */
const loadedFiles = new Map<string, { readonly fqcn: string; readonly file: string }>();

/**
 * Reads the PSR-4 map from `packageJsonPath`'s `xaravel.autoload.psr-4` (`{ "App\\": "app/" }`; a value may be one
 * directory or a list), with directories relative to that file, and makes it the Registry's map. A `package.json`
 * with no map clears it; an `xaravel` or `xaravel.autoload` that is not an object is malformed.
 * Throws, naming the path, when the file cannot be read or is malformed.
 */
export function loadAutoload(packageJsonPath: string): void {
  const data = readJson("autoload map", packageJsonPath);
  if (!isRecord(data)) {
    throw malformed("autoload map", packageJsonPath, "it must be an object");
  }
  const xaravel = data["xaravel"] ?? null;
  if (xaravel !== null && !isRecord(xaravel)) {
    throw malformed("autoload map", packageJsonPath, "xaravel must be an object");
  }
  const autoload = xaravel === null ? null : (xaravel["autoload"] ?? null);
  if (autoload !== null && !isRecord(autoload)) {
    throw malformed("autoload map", packageJsonPath, "xaravel.autoload must be an object");
  }
  const map: unknown = autoload === null ? null : (autoload["psr-4"] ?? null);
  if (map === null) {
    psr4 = [];
    return;
  }
  if (!isRecord(map)) {
    throw malformed("autoload map", packageJsonPath, "xaravel.autoload.psr-4 must be an object of namespace prefixes");
  }
  const base = dirname(resolve(packageJsonPath));
  const prefixes: Psr4Prefix[] = [];
  for (const [prefix, value] of Object.entries(map)) {
    if (prefix !== "" && !(prefix.endsWith("\\") && FQCN_SHAPE.test(prefix.slice(0, -1)))) {
      throw malformed("autoload map", packageJsonPath, `the PSR-4 prefix "${prefix}" must be a namespace ending with \\`);
    }
    const dirs: unknown[] = Array.isArray(value) ? value : [value];
    if (dirs.length === 0 || !dirs.every((dir) => typeof dir === "string" && dir !== "")) {
      throw malformed("autoload map", packageJsonPath, `the PSR-4 prefix "${prefix}" must map to a directory or a list of directories`);
    }
    prefixes.push({ prefix, dirs: (dirs as string[]).map((dir) => resolve(base, dir)) });
  }
  psr4 = prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
}

/** Encodes the classmap object as JSON; `registry/index.ts` installs `jsonEncode` under `JSON_THROW_ON_ERROR`. */
let classmapEncoder: ((value: Record<string, string>) => string) | null = null;

/**
 * Installs the classmap encoder `writeClassmap` writes with; called once, by `registry/index.ts` on load, so this file
 * never imports `jsonEncode` (whose JSON errors are PHP's `JsonException`, a registered class). Internal.
 */
export function installClassmapEncoder(encode: (value: Record<string, string>) => string): void {
  if (classmapEncoder !== null) {
    throw new TypeError("installClassmapEncoder(): the Registry's classmap encoder is already installed");
  }
  classmapEncoder = encode;
}

/**
 * Writes the full classmap to `path` (`bootstrap/cache/classes.json`, as `optimize` does; AD-10.4): a JSON object
 * from FQCN to file, with files relative to the classmap's directory. It holds the loaded classmap's entries and the
 * files `resolveClassAsync` imported, each while its file still exists, and every module file under the PSR-4 map
 * whose path names a class, sorted by FQCN.
 * Throws, naming the path, when it cannot be written.
 */
export function writeClassmap(path: string): void {
  const encoder = classmapEncoder;
  if (encoder === null) {
    throw new Error("writeClassmap(): no classmap encoder is installed; import writeClassmap from @xaravel/runtime/registry");
  }
  const entries = new Map<string, { readonly fqcn: string; readonly file: string }>();
  for (const [key, entry] of classmap) {
    if (existsSync(entry.file)) {
      entries.set(key, entry);
    }
  }
  for (const [key, entry] of loadedFiles) {
    if (!entries.has(key) && existsSync(entry.file)) {
      entries.set(key, entry);
    }
  }
  for (const { prefix, dirs } of psr4) {
    for (const dir of dirs) {
      for (const [fqcn, file] of scan(dir, prefix)) {
        const key = fqcn.toLowerCase();
        if (!entries.has(key)) {
          entries.set(key, { fqcn, file });
        }
      }
    }
  }
  const target = resolve(path);
  const base = dirname(target);
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of [...entries.keys()].sort()) {
    const entry = entries.get(key) as { readonly fqcn: string; readonly file: string };
    out[entry.fqcn] = relative(base, entry.file).split(sep).join("/");
  }
  try {
    mkdirSync(base, { recursive: true });
    writeFileSync(target, encoder(out));
  } catch (error) {
    throw new Error(`Unable to write the classmap ${path}: ${messageOf(error)}`, { cause: error });
  }
}

/**
 * Reads the classmap `writeClassmap` wrote at `path` and makes it the Registry's classmap, which `resolveClassAsync`
 * consults before the PSR-4 map. Throws, naming the path, when it cannot be read or is malformed.
 */
export function loadClassmap(path: string): void {
  const data = readJson("classmap", path);
  if (!isRecord(data)) {
    throw malformed("classmap", path, "it must be an object from FQCN to file");
  }
  const base = dirname(resolve(path));
  const next = new Map<string, { readonly fqcn: string; readonly file: string }>();
  for (const [name, file] of Object.entries(data)) {
    if (!FQCN_SHAPE.test(normalise(name)) || typeof file !== "string" || file === "") {
      throw malformed("classmap", path, `the entry "${name}" must map a class name to a file`);
    }
    next.set(normalise(name).toLowerCase(), { fqcn: normalise(name), file: resolve(base, file) });
  }
  classmap = next;
}

/** The file to import for the FQCN `name` (no leading `\`): its classmap entry, else its PSR-4 file; null when none exists. */
function locate(name: string): string | null {
  if (!FQCN_SHAPE.test(name)) {
    return null;
  }
  const mapped = classmap.get(name.toLowerCase());
  if (mapped !== undefined && existsSync(mapped.file)) {
    return mapped.file;
  }
  for (const { prefix, dirs } of psr4) {
    if (!name.startsWith(prefix) || name.length === prefix.length) {
      continue;
    }
    const segments = name.slice(prefix.length).split("\\");
    for (const dir of dirs) {
      for (const extension of EXTENSIONS) {
        const file = join(dir, ...segments) + extension;
        if (existsSync(file)) {
          return file;
        }
      }
    }
  }
  return null;
}

/** Each module file under `dir` whose path names a class under `prefix`, as `[fqcn, absolute file]`. */
function scan(dir: string, prefix: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const walk = (current: string, segments: readonly string[]): void => {
    let names: string[];
    try {
      names = readdirSync(current).sort();
    } catch {
      return;
    }
    for (const entry of names) {
      const file = join(current, entry);
      let directory: boolean;
      try {
        directory = statSync(file).isDirectory();
      } catch {
        continue;
      }
      if (directory) {
        if (SEGMENT.test(entry)) {
          walk(file, [...segments, entry]);
        }
        continue;
      }
      const extension = EXTENSIONS.find((candidate) => entry.endsWith(candidate)) ?? null;
      const stem = extension === null ? "" : entry.slice(0, -extension.length);
      if (SEGMENT.test(stem)) {
        found.push([prefix + [...segments, stem].join("\\"), file]);
      }
    }
  };
  walk(dir, []);
  return found;
}

function readJson(what: string, path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read the ${what} ${path}: ${messageOf(error)}`, { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw malformed(what, path, messageOf(error));
  }
}

function malformed(what: string, path: string, reason: string): Error {
  return new Error(`The ${what} ${path} is malformed: ${reason}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
