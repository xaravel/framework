// Locks the framework-mode server process down to reading its data scope
// (Story 7.4; FR-109, spine l.106).
//
// `lockdown(root)` replaces exports on the live `node:fs`, `node:fs/promises`,
// `node:child_process`, `node:worker_threads`, `bun:sqlite` and `bun:ffi`
// module objects (from
// `process.getBuiltinModule`), on `Bun` and on `globalThis`:
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
//   `bun:sqlite` (a Database creates its file) and `bun:ffi` refuses, and so do `globalThis.Worker`, `fetch` and `WebSocket` (a worker
//   is a fresh realm with an unpatched `node:fs`; `fetch` reads `file:` URLs);
// - `Bun.spawn`, `spawnSync`, `$`, `write`, `file`, `mmap`, `openInEditor`,
//   `build`, `Glob`, `s3`, `S3Client`, `sql`, `SQL`, `connect`, `listen`,
//   `serve` and `udpSocket` refuse.
//
// The `node:fs` stream classes (`ReadStream`, `WriteStream`, ...) stay: they
// open through `fs.open`, which refuses, so a stream only emits the error.
//
// It runs once per process; a second call throws. The flag is set only once
// every patch is in place. Bun binds `node:fs` named
// imports when a module graph links, so the patch reaches only modules
// imported after it runs: src/server.ts calls it before `await
// import("./mcp")`, which loads the data layer.
import { DataScopeError, inScope } from "./scope";

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

/** The `Bun` members that refuse. */
const BUN_REFUSED = ["spawn", "spawnSync", "$", "write", "file", "mmap", "openInEditor", "build", "Glob", "s3", "S3Client", "sql", "SQL", "connect", "listen", "serve", "udpSocket"] as const;

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
    [ffi, "bun:ffi"],
  ] as const) {
    for (const name of Object.keys(module)) {
      if (typeof module[name] === "function") {
        module[name] = refuse(`${label}.${name}`);
      }
    }
  }
  const bun = Bun as unknown as Exports;
  for (const name of BUN_REFUSED) {
    bun[name] = refuse(`Bun.${name}`);
  }
  const globals = globalThis as unknown as Exports;
  for (const name of GLOBALS_REFUSED) {
    globals[name] = refuse(name);
  }
  locked = true;
}
