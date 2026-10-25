// Shared code of the namespace Xaravel Tests: XT-contracts-5 (Story 10.2's 19 core and service namespaces),
// XT-contracts-6 (structural types) and XT-contracts-8 (Story 10.3's web and application namespaces) read the
// committed API surface's rows, the Upstream PHP files and the async table through these helpers, so each check has
// one implementation (lessons, epic 4). `assertSameAbstract` is every contracts Xaravel Test's token-identity check
// (AD-9.8). It declares no test of its own.
//
// The Upstream snapshot is gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under
// `XARAVEL_UPSTREAM=require` (ESC-10.2-8): `upstreamOrWarn` fails a test under that variable when the snapshot is
// missing, and otherwise warns, so the test skips its Upstream-derived parts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env } from "node:process";
import { Assert, TestCase } from "@xaravel/assert";
import { Double } from "@xaravel/mockery";
import { CONTRACT_PARENTS } from "@xaravel/contracts";

export const REPO = resolve(import.meta.dir, "..", "..", "..", "..", "..");
export const PACKAGE = resolve(import.meta.dir, "..", "..", "..");
export const UPSTREAM_CONTRACTS = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate", "Contracts");

/**
 * Whether the Upstream snapshot is synced. When it is missing, a test fails under `XARAVEL_UPSTREAM=require`, as CI's
 * `check` job runs (ESC-10.2-8), and otherwise warns, naming `file`, so its Upstream-derived checks are skipped.
 */
export function upstreamOrWarn(file: string): boolean {
  if (existsSync(UPSTREAM_CONTRACTS)) {
    return true;
  }
  if (env["XARAVEL_UPSTREAM"] === "require") {
    Assert.fail("XARAVEL_UPSTREAM=require: conformance/upstream/framework/src/Illuminate/Contracts is missing; run `bun run upstream:sync`");
  }
  console.warn(`${file}: conformance/upstream is not synced; the Upstream-derived checks are skipped`);
  return false;
}

/** One line of `conformance/api-surface/contracts.jsonl`, read structurally. */
export interface Row {
  readonly fqcn: string;
  readonly kind: string;
  readonly member: string | null;
  readonly static?: boolean;
  readonly parameters?: readonly { readonly name: string }[];
}

/** A contract token, read structurally. */
export type Token = Record<symbol, unknown> & { readonly brand: symbol };

/** Every row of the committed API surface, in file order. */
export function allRows(): Row[] {
  const text = readFileSync(join(REPO, "conformance", "api-surface", "contracts.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row);
}

/** The committed API surface's rows directly under `Illuminate\Contracts\<ns>\` (`ns` may be nested, `Auth\Access`), in file order. */
export function rowsOf(ns: string): Row[] {
  const prefix = `Illuminate\\Contracts\\${ns}\\`;
  return allRows().filter((row) => row.fqcn.startsWith(prefix) && !row.fqcn.slice(prefix.length).includes("\\"));
}

/** The short name of `name`, its last `\` segment. */
export function shortName(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}

/** The namespace of an `Illuminate\Contracts` FQCN, below `Illuminate\Contracts` (`Auth\Access` for `…\Auth\Access\Gate`). */
export function namespaceOf(name: string): string {
  return name.slice("Illuminate\\Contracts\\".length, name.lastIndexOf("\\"));
}

/** The kebab-case subpath of an Upstream namespace (`JsonSchema` → `json-schema`, `Auth\Access` → `auth/access`). */
export function kebab(ns: string): string {
  return ns
    .split("\\")
    .map((segment) => segment.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase())
    .join("/");
}

/** The package file that ports an `Illuminate\Contracts` FQCN: `src/<subpath>/<ShortName>.ts`. */
export function portFile(name: string): string {
  return `src/${kebab(namespaceOf(name))}/${shortName(name)}.ts`;
}

/** The path of an Upstream PHP file. */
export function upstreamPath(name: string): string {
  return join(REPO, "conformance", "upstream", "framework", "src", ...name.split("\\")) + ".php";
}

/** An Upstream interface's `const NAME = '<string>';` values, by name. */
export function upstreamConstants(name: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of readFileSync(upstreamPath(name), "utf8").matchAll(/^\s*(?:public\s+)?const\s+(\w+)\s*=\s*'([^']*)';/gm)) {
    constants.set(match[1] ?? "", match[2] ?? "");
  }
  return constants;
}

/** An Upstream contract file's declaration: its `extends` and `implements` lists, each name resolved to an FQCN. */
export function upstreamDeclaration(name: string): { readonly extends: string[]; readonly implements: string[] } {
  const source = readFileSync(upstreamPath(name), "utf8");
  const namespace = /^namespace\s+([^;]+);/m.exec(source)?.[1] ?? "";
  const uses = new Map<string, string>();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    uses.set(match[2] ?? shortName(match[1] ?? ""), match[1] ?? "");
  }
  const resolveName = (local: string): string => {
    const trimmed = local.trim();
    if (trimmed.startsWith("\\")) {
      return trimmed.slice(1);
    }
    return uses.get(trimmed) ?? `${namespace}\\${trimmed}`;
  };
  const list = (text: string | undefined): string[] => (text === undefined ? [] : text.split(",").map((part) => part.trim()).filter((part) => part !== "").map(resolveName));
  const declaration = new RegExp(`^(?:abstract\\s+|final\\s+)?(?:interface|class)\\s+${shortName(name)}\\b([^{]*)\\{`, "m").exec(source);
  Assert.assertNotNull(declaration, name);
  const head = declaration?.[1] ?? "";
  const extendsList = /\bextends\s+([\w\\,\s]+?)(?=\bimplements\b|$)/.exec(head)?.[1];
  const implementsList = /\bimplements\s+([\w\\,\s]+)$/.exec(head.trim())?.[1];
  return { extends: list(extendsList), implements: list(implementsList) };
}

/** PHP's built-in parents, which are no contract token (the interface extends their structural form). */
export const BUILTINS: ReadonlySet<string> = new Set(["Countable", "ArrayAccess", "IteratorAggregate", "Stringable", "Throwable"]);

/** Each built-in parent's methods, PHP names, in the order a token lists them (ESC-10.2-4); `Throwable` has none. */
export const BUILTIN_METHODS: Readonly<Record<string, readonly string[]>> = {
  Countable: ["count"],
  ArrayAccess: ["offsetExists", "offsetGet", "offsetSet", "offsetUnset"],
  IteratorAggregate: ["getIterator"],
  Stringable: ["__toString"],
  Throwable: [],
};

/**
 * The runtime export for an FQCN, from `modules` (Upstream namespace below `Illuminate\Contracts` → its subpath module)
 * or, for a `Psr\…` name, from `psr`.
 */
export function exportFor(name: string, modules: Readonly<Record<string, object>>, psr: object): unknown {
  if (name.startsWith("Psr\\")) {
    return (psr as Record<string, unknown>)[shortName(name)];
  }
  const ns = namespaceOf(name);
  const module = modules[ns];
  Assert.assertNotNull(module ?? null, `${name}: namespace ${ns} is not one of the test's`);
  return (module as Record<string, unknown>)[shortName(name)];
}

/** `token` and every contract in its parents' closure, depth-first, each once. */
export function closure(token: Token): Token[] {
  const seen: Token[] = [];
  const walk = (current: Token): void => {
    if (seen.includes(current)) {
      return;
    }
    seen.push(current);
    for (const parent of current[CONTRACT_PARENTS] as readonly Token[]) {
      walk(parent);
    }
  };
  walk(token);
  return seen;
}

/** A class whose prototype carries the brand getter of each of `tokens`. */
export function brandedClass(tokens: readonly Token[]): new () => object {
  class Branded {}
  for (const token of tokens) {
    Object.defineProperty(Branded.prototype, token.brand, { get: () => true, configurable: true });
  }
  return Branded;
}

/**
 * A Mockery double of `token`. `override: true` is Double's named argument for a target declaring one of its reserved
 * names (`Container::instance`), and `instance()` is then the target-shaped double.
 */
export function mockeryDouble(token: Token): unknown {
  return (Double.for(token as never, { override: true }) as { instance(): unknown }).instance();
}

/** A PHPUnit mock of `token`. */
export function phpunitMock(token: Token): unknown {
  return new TestCase().createMock(token as never);
}

/**
 * `actual` is the contract token `expected` by JS identity (decisions/MAINT-2026-10-24-epic-10-items.md, Item 10's
 * route, item 1, its general rule): a contract token is `assertSame` to its FQCN string, as `Arrayable::class` is in
 * PHP (AD-9.8), so the token-not-string check is the `typeof` and `===` checks after the PHP one. Each Xaravel Test
 * whose expected value is a token checks it through this one helper.
 */
export function assertSameAbstract(expected: unknown, actual: unknown, message = ""): void {
  Assert.assertSame(expected, actual, message);
  Assert.assertSame(typeof expected, typeof actual, message);
  Assert.assertTrue(expected === actual, message);
}

/** The `TypeError` message `fn` throws, or "(nothing thrown)". */
export function typeErrorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof TypeError ? error.message : `not a TypeError: ${String(error)}`;
  }
  return "(nothing thrown)";
}

/** An async table under construction: `<Ns>\<Contract>.<method>` → its `@asyncRoot`. */
export interface AsyncTable {
  readonly table: Map<string, string>;
  /** Each of `methods` (space-separated) is its own root, `<ns>\<contract>.<method>`. */
  readonly same: (ns: string, contract: string, methods: string) => void;
  /** Each of `methods` (space-separated) has the root `root`. */
  readonly to: (ns: string, contract: string, methods: string, root: string) => void;
}

/** A new, empty async table. */
export function asyncTable(): AsyncTable {
  const table = new Map<string, string>();
  return {
    table,
    same: (ns, contract, methods) => {
      for (const method of methods.split(" ")) {
        table.set(`${ns}\\${contract}.${method}`, `${ns}\\${contract}.${method}`);
      }
    },
    to: (ns, contract, methods, root) => {
      for (const method of methods.split(" ")) {
        table.set(`${ns}\\${contract}.${method}`, root);
      }
    },
  };
}

/** A table's entries as a sorted JSON list, for one comparison. */
export function renderTable(table: ReadonlyMap<string, string>): string {
  return JSON.stringify([...table].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** One `async-surface.json` entry. */
export interface SurfaceEntry {
  readonly method: string;
  readonly file: string;
  readonly root?: string;
  readonly thenable?: string;
}

/** The committed `packages/contracts/async-surface.json`. */
export function asyncSurface(): SurfaceEntry[] {
  return JSON.parse(readFileSync(join(PACKAGE, "async-surface.json"), "utf8")) as SurfaceEntry[];
}

// ---------------------------------------------------------------------------
// Async-surface scopes: XT-contracts-5 checks the core and service namespaces' entries, XT-contracts-8 the web and
// application namespaces', and together they cover every non-PSR entry.

/** The 19 namespaces Story 10.2 ports (XT-contracts-5). */
export const CORE_NAMESPACES: readonly string[] = ["Support", "Container", "Config", "Foundation", "Pipeline", "Events", "Bus", "Queue", "Cache", "Redis", "Encryption", "Hashing", "Filesystem", "Process", "Translation", "Validation", "Debug", "Concurrency", "JsonSchema"];

/** The 20 namespaces Story 10.3 ports (XT-contracts-8). */
export const WEB_NAMESPACES: readonly string[] = ["Auth", "Auth\\Access", "Auth\\Middleware", "Broadcasting", "Console", "Cookie", "Database", "Database\\Eloquent", "Database\\Events", "Database\\Query", "Http", "Image", "Log", "Mail", "Notifications", "Pagination", "Routing", "Session", "Session\\Middleware", "View"];

/** XT-contracts-5's structural types whose async methods mirror a contract's: file → `<Ns>\\<Contract>`. */
export const CORE_STRUCTURAL_ASYNC: Readonly<Record<string, string>> = {
  "src/structural/ValidationValidator.ts": "Validation\\Validator",
  "src/structural/RedisConnection.ts": "Redis\\Connection",
};

/** XT-contracts-8's structural files whose async methods are AD-6 roots: file → their owner in the async table. */
export const WEB_STRUCTURAL_ASYNC: Readonly<Record<string, string>> = {
  "src/structural/SessionHandlerInterface.ts": "SessionHandlerInterface",
};

/** Whether `file` is in one of `namespaces`' subpath directories or is one of `structural`'s files. */
function inScope(file: string, namespaces: readonly string[], structural: Readonly<Record<string, string>>): boolean {
  return Object.hasOwn(structural, file) || namespaces.some((ns) => file.startsWith(`src/${kebab(ns)}/`));
}

/** Whether an async-surface entry's file is XT-contracts-5's to check. */
export function coreScoped(file: string): boolean {
  return inScope(file, CORE_NAMESPACES, CORE_STRUCTURAL_ASYNC);
}

/** Whether an async-surface entry's file is XT-contracts-8's to check. */
export function webScoped(file: string): boolean {
  return inScope(file, WEB_NAMESPACES, WEB_STRUCTURAL_ASYNC);
}

// ---------------------------------------------------------------------------
// Structural types (AD-1.2)

/** PHP's built-in classes and interfaces an Upstream contract file names, each with its Xaravel form. */
export const PHP_BUILTINS: Readonly<Record<string, string>> = {
  Closure: "the structural `Closure` function type (or `SyncClosure`)",
  DateTimeInterface: "the structural `DateTimeInterface`",
  DateInterval: "src/psr/SimpleCache/DateInterval.ts",
  UnitEnum: "the structural `UnitEnum`",
  Throwable: "the JS `Error`",
  Countable: "the structural `Countable`",
  ArrayAccess: "the structural `ArrayAccess`",
  IteratorAggregate: "the structural `IteratorAggregate`",
  Stringable: "the structural `Stringable`",
  stdClass: "the structural `StdClass`",
  Exception: "@xaravel/runtime/php's `Exception`",
  RuntimeException: "@xaravel/runtime/php's `RuntimeException`",
  InvalidArgumentException: "@xaravel/runtime/php's `InvalidArgumentException`",
  LogicException: "@xaravel/runtime/php's `LogicException`",
};

/**
 * The FQCN → import path (relative to a contract file one directory below `src/`) of each structural type: the FQCN
 * that opens its header comment. `DateInterval` and `CarbonInterval` are `src/psr/SimpleCache/DateInterval.ts`.
 */
export function structuralFiles(): Map<string, string> {
  const files = new Map<string, string>([
    ["DateInterval", "../psr/SimpleCache/DateInterval"],
    ["Carbon\\CarbonInterval", "../psr/SimpleCache/DateInterval"],
  ]);
  for (const entry of readdirSync(join(PACKAGE, "src", "structural")).filter((name) => name.endsWith(".ts"))) {
    const header = /^\/\/ ([A-Za-z][\w]*(?:\\[\w]+)+)/.exec(readFileSync(join(PACKAGE, "src", "structural", entry), "utf8"));
    if (header?.[1] !== undefined) {
      files.set(header[1], `../structural/${entry.replace(/\.ts$/, "")}`);
    }
  }
  return files;
}

/**
 * The concrete classes an Upstream contract file names, each with its local name: its `use` lines, and the fully
 * qualified `\Illuminate\…`, `\Symfony\…`, `\Psr\Http\…` and `\Carbon\…` names in its text, except
 * `Illuminate\Contracts\…` and the PSR interfaces `@xaravel/contracts/psr` ports. `@throws` lines are left out: an
 * exception a contract documents is no type it names in a signature, and its own package ports it.
 */
export function concreteNames(source: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    const name = match[1] ?? "";
    names.set(name, match[2] ?? name.slice(name.lastIndexOf("\\") + 1));
  }
  for (const line of source.split("\n").filter((text) => !text.includes("@throws"))) {
    for (const match of line.matchAll(/\\((?:Illuminate|Symfony|Psr\\Http|Carbon)\\[\w\\]+)/g)) {
      const name = match[1] ?? "";
      names.set(name, names.get(name) ?? name);
    }
  }
  for (const name of names.keys()) {
    if (name.startsWith("Illuminate\\Contracts\\") || /^Psr\\(Container|SimpleCache|Log)\\/.test(name)) {
      names.delete(name);
    }
  }
  return names;
}

/** Whether `name` (or its `use` alias `local`) is in a `@param` / `@return` line or a `function` declaration. */
export function inSignature(source: string, name: string, local: string): boolean {
  const word = new RegExp(`(?<![\\w\\\\])${local}\\b`);
  return source.split("\n").some((line) => /@param|@return|\bfunction\b/.test(line) && (line.includes(`\\${name}`) || word.test(line)));
}

/**
 * Whether a port names `local` in a method signature: a line declaring a method (`name(`, or `name<…>(`), outside
 * comments and import lines.
 */
export function usedInSignature(port: string, local: string): boolean {
  const word = new RegExp(`(?<![\\w$])${local}\\b`);
  return port.split("\n").some((line) => {
    const text = line.trim();
    return !/^(\/\/|\/\*|\*|import\b)/.test(text) && /\w+\s*(<[^>]*>)?\s*\(/.test(text) && word.test(text);
  });
}
