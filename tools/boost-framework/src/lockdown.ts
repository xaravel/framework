// Locks the framework-mode server process down to reading its data scope
// (Story 7.4, retro 7 item 1; FR-109, spine l.106).
//
// `lockdown(root)` replaces exports on the live `node:fs`, `node:fs/promises`,
// `node:child_process`, `node:worker_threads`, `bun:sqlite`, `node:sqlite` and
// `bun:ffi` module objects (from `process.getBuiltinModule`), on `Bun` and on
// `globalThis`, and registers a resolve hook:
// - `readFileSync`, `readdirSync`, `statSync`, `lstatSync`, `existsSync` and
//   `realpathSync` (with `realpathSync.native`) on `node:fs` are wrapped: each
//   throws `DataScopeError` unless `inScope(root, firstArg)` holds, then calls
//   the original;
// - every other function export of `node:fs` and `node:fs/promises` whose name
//   starts with a lowercase letter (async reads, `openSync`, `opendirSync`,
//   streams, `watch` and every write) throws `ReadOnlyError`. The list is a
//   whitelist: a function this file does not know refuses by default;
// - a scoped read whose options carry a `flag` other than `"r"` (such as
//   `readFileSync(path, {flag: "w"})`, which would truncate) refuses;
// - every function export of `node:child_process`, `node:worker_threads`,
//   `bun:sqlite` and `node:sqlite` (a database creates its file) and `bun:ffi`
//   refuses, and so do `globalThis.Worker`, `fetch` and `WebSocket` (a worker
//   is a fresh realm with an unpatched `node:fs`; `fetch` reads `file:` URLs);
// - `Bun` is an allowlist: every writable member not in `BUN_KEPT` (pure
//   parsers, hashers, pure helpers, the stdio file refs and plain values)
//   refuses, a function by a refusing stand-in and anything else by a proxy
//   whose every property access throws. Bun makes some members non-writable
//   (`fetch`, `WebView`, `dns`, `plugin`, ...); they cannot be replaced and
//   stay open (`BUN_OPEN`, listed in docs/framework-mode.md § Limits). A
//   non-writable member on neither list makes `lockdown` throw, so a Bun
//   upgrade that adds one fails loudly;
// - a runtime `Bun.plugin` refuses, with `DataScopeError`, a module specifier
//   with a non-code extension (`import(x, {with: {type: "text"}})`,
//   `require(x.json)`, ...) whose path lies outside the data scope. Bun's hook
//   does not see extensionless specifiers, so those stay open. A `?query` or
//   `#fragment` is stripped first, a dotfile counts as having an extension,
//   and a bare specifier Bun cannot resolve is refused. `Bun.plugin.clearAll`
//   refuses, so the hook cannot be removed.
//
// The `node:fs` stream classes (`ReadStream`, `WriteStream`, ...) stay: they
// open through `fs.open`, which refuses, so a stream only emits the error.
//
// It runs once per process; a second call throws. The flag is set only once
// every patch is in place. Bun binds `node:fs` named
// imports when a module graph links, so the patch reaches only modules
// imported after it runs: src/server.ts calls it before `await
// import("./mcp")`, which loads the data layer.
import { DataScopeError, inScope, modulePath } from "./scope";

export { isDirectory } from "./scope";

/** A write, spawn or other non-read operation was refused. */
export class ReadOnlyError extends Error {
  constructor(name: string) {
    super(`refused: ${name} (framework mode is read-only)`);
    this.name = "ReadOnlyError";
  }
}

/** The `node:fs` functions that stay available, scope-checked on their first argument. */
const READS = ["readFileSync", "readdirSync", "statSync", "lstatSync", "existsSync", "realpathSync"] as const;

/**
 * The writable `Bun` members that stay: pure parsers, hashers, pure helpers, the stdio file refs and plain values.
 * Every other writable member refuses.
 */
const BUN_KEPT = [
  // Parsers.
  "YAML", "TOML", "JSON5", "JSONC", "XML", "markdown",
  // Hashers.
  "CryptoHasher", "MD4", "MD5", "SHA1", "SHA224", "SHA256", "SHA384", "SHA512", "SHA512_256", "hash", "sha", "password", "CSRF",
  // Pure helpers.
  "ArrayBufferSink", "allocUnsafe", "concatArrayBuffers", "color", "deepEquals", "deepMatch", "escapeHTML", "fileURLToPath", "pathToFileURL",
  "indexOfLine", "inspect", "nanoseconds", "peek", "randomUUIDv5", "randomUUIDv7", "sleep", "sleepSync", "sliceAnsi", "stringWidth",
  "stripANSI", "wrapAnsi", "readableStreamToArray", "readableStreamToArrayBuffer", "readableStreamToBlob", "readableStreamToBytes",
  "readableStreamToFormData", "readableStreamToJSON", "readableStreamToText", "deflateSync", "inflateSync", "gzipSync", "gunzipSync",
  "zstdCompress", "zstdCompressSync", "zstdDecompress", "zstdDecompressSync",
  // The stdio file refs (fds 0, 1 and 2, already open) and plain values.
  "stdin", "stdout", "stderr", "argv", "cwd", "enableANSIColors",
] as const;

/**
 * The `Bun` members Bun makes non-writable and non-configurable (or a getter): they cannot be replaced and stay
 * open (docs/framework-mode.md § Limits). A non-writable member on neither list makes `lockdown` throw.
 */
const BUN_OPEN = [
  "fetch", "WebView", "dns", "plugin", "env", "Cookie", "CookieMap", "JSONL", "ModuleGraph", "semver", "main",
  "isMainThread", "isStandaloneExecutable", "origin", "revision", "version", "version_with_sha",
] as const;

/** Module file extensions the resolve hook leaves to Bun; any other extension is data and is scope-checked. */
const CODE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"] as const;

/** The globals that refuse. */
const GLOBALS_REFUSED = ["Worker", "fetch", "WebSocket"] as const;

type AnyFunction = (...args: unknown[]) => unknown;
type Exports = Record<string, unknown>;

let locked = false;

/** A refusing stand-in; a plain function, so `new` on it (a refused class) throws ReadOnlyError too. */
function refuse(name: string): AnyFunction {
  return function refused(): never {
    throw new ReadOnlyError(name);
  };
}

/**
 * A stand-in for a refused `Bun` member: calling or constructing it (for a function) and every property access
 * (so `Bun.Archive.write` and `Bun.redis.get` too) throw ReadOnlyError.
 */
function refuseMember(name: string, callable: boolean): object {
  const fail = (): never => {
    throw new ReadOnlyError(name);
  };
  const target: object = callable ? function refused(): void {} : (Object.create(null) as object);
  return new Proxy(target, {
    apply: fail,
    construct: fail,
    get: fail,
    set: fail,
    has: fail,
    ownKeys: fail,
    getOwnPropertyDescriptor: fail,
    defineProperty: fail,
    deleteProperty: fail,
  });
}

/**
 * The extension of the last segment of `path` (with its dot), or "" when it has none. A dotfile (`.env`) counts as
 * having one, so it is scope-checked; `.` and `..` have none.
 */
function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (base === "." || base === "..") {
    return "";
  }
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

/**
 * The writable `Bun` members not in `BUN_KEPT`, which lockdown replaces. Throws, before anything is patched, on a
 * member Bun makes non-writable (or a getter) that is not in `BUN_OPEN`.
 */
function bunMembersToRefuse(bun: Exports): { name: string; callable: boolean }[] {
  const refused: { name: string; callable: boolean }[] = [];
  for (const name of Object.getOwnPropertyNames(bun)) {
    if ((BUN_KEPT as readonly string[]).includes(name)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(bun, name);
    if (descriptor === undefined) {
      continue;
    }
    if (!("value" in descriptor) || descriptor.writable !== true) {
      if (!(BUN_OPEN as readonly string[]).includes(name)) {
        throw new Error(`lockdown: Bun.${name} cannot be replaced and is on neither the kept nor the known-open list`);
      }
      continue;
    }
    refused.push({ name, callable: typeof descriptor.value === "function" });
  }
  return refused;
}

/**
 * Registers a runtime resolve hook that throws DataScopeError for a specifier with a non-code extension whose
 * path lies outside the data scope. A bare (package) specifier is resolved with Bun's own resolver first.
 */
function lockModuleResolution(root: string, bun: Exports): void {
  const resolveSync = (bun["resolveSync"] as (specifier: string, from: string) => string).bind(Bun);
  Bun.plugin({
    name: "boost-framework-lockdown",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        // A `?query` or `#fragment` suffix (`AGENTS.md?x.ts`) must not hide the file's own extension.
        const specifier = args.path.replace(/[?#].*$/s, "");
        const extension = extensionOf(specifier);
        if (extension === "" || (CODE_EXTENSIONS as readonly string[]).includes(extension)) {
          return undefined;
        }
        let path = modulePath(specifier, args.importer);
        if (path === null && !specifier.includes(":")) {
          try {
            path = resolveSync(specifier, args.importer === "" ? process.cwd() : args.importer);
          } catch {
            throw new DataScopeError(args.path);
          }
        }
        if (path === null || !inScope(root, path)) {
          throw new DataScopeError(args.path);
        }
        return undefined;
      });
    },
  });
}

/** Whether an options argument asks for anything but a plain read (`flag` other than "r"). */
function writesFlag(args: readonly unknown[]): boolean {
  return args.slice(1).some((arg) => arg !== null && typeof arg === "object" && "flag" in arg && (arg as { flag?: unknown }).flag !== undefined && (arg as { flag?: unknown }).flag !== "r");
}

function scoped(root: string, name: string, original: AnyFunction): AnyFunction {
  return (...args: unknown[]) => {
    if (writesFlag(args)) {
      throw new ReadOnlyError(`${name} with a write flag`);
    }
    if (!inScope(root, args[0])) {
      throw new DataScopeError(typeof args[0] === "string" ? args[0] : String(args[0]));
    }
    return original(...args);
  };
}

function refuseLowercase(module: Exports, label: string, keep: readonly string[]): void {
  for (const name of Object.keys(module)) {
    if (keep.includes(name) || !/^[a-z]/.test(name) || typeof module[name] !== "function") {
      continue;
    }
    module[name] = refuse(`${label}.${name}`);
  }
}

/** Locks this process down to reading `<root>/{conformance,stories,decisions}`. Throws when called twice. */
export function lockdown(root: string): void {
  if (locked) {
    throw new Error("lockdown: already locked down");
  }
  const bun = Bun as unknown as Exports;
  const bunRefused = bunMembersToRefuse(bun);
  // Bun builds the stdio streams lazily, from `Bun.file(<fd>)`; once that refuses, a stream falls back to
  // `fs.write` on the module object, which refuses too. Building them now, on the originals, keeps the
  // JSON-RPC channel (fds 0, 1 and 2, already open) working. No new file can be opened afterwards.
  for (const stream of [process.stdin, process.stdout, process.stderr]) {
    void stream;
  }
  const fs = process.getBuiltinModule("node:fs") as unknown as Exports;
  const promises = process.getBuiltinModule("node:fs/promises") as unknown as Exports;
  const childProcess = process.getBuiltinModule("node:child_process") as unknown as Exports;
  const workerThreads = process.getBuiltinModule("node:worker_threads") as unknown as Exports;
  const sqlite = process.getBuiltinModule("bun:sqlite") as unknown as Exports;
  const nodeSqlite = process.getBuiltinModule("node:sqlite") as unknown as Exports;
  const ffi = process.getBuiltinModule("bun:ffi") as unknown as Exports;

  for (const name of READS) {
    const original = fs[name] as AnyFunction & { native?: AnyFunction };
    const wrapped = scoped(root, `node:fs.${name}`, original) as AnyFunction & { native?: AnyFunction };
    if (typeof original.native === "function") {
      wrapped.native = scoped(root, `node:fs.${name}.native`, original.native);
    }
    fs[name] = wrapped;
  }
  refuseLowercase(fs, "node:fs", READS);
  refuseLowercase(promises, "node:fs/promises", []);
  if (fs["promises"] !== promises && typeof fs["promises"] === "object" && fs["promises"] !== null) {
    refuseLowercase(fs["promises"] as Exports, "node:fs/promises", []);
  }
  for (const [module, label] of [
    [childProcess, "node:child_process"],
    [workerThreads, "node:worker_threads"],
    [sqlite, "bun:sqlite"],
    [nodeSqlite, "node:sqlite"],
    [ffi, "bun:ffi"],
  ] as const) {
    for (const name of Object.keys(module)) {
      if (typeof module[name] === "function") {
        module[name] = refuse(`${label}.${name}`);
      }
    }
  }
  lockModuleResolution(root, bun);
  // `Bun.plugin` is non-writable, but its `clearAll` is not; refusing it keeps the resolve hook in place.
  (Bun.plugin as unknown as Exports)["clearAll"] = refuse("Bun.plugin.clearAll");
  for (const { name, callable } of bunRefused) {
    bun[name] = refuseMember(`Bun.${name}`, callable);
  }
  const globals = globalThis as unknown as Exports;
  for (const name of GLOBALS_REFUSED) {
    globals[name] = refuse(name);
  }
  locked = true;
}
