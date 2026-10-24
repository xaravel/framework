// Xaravel Test for Story 10.2: the `Illuminate\Contracts` interfaces and exception classes of the core and service
// namespaces (AD-1.1, AD-6). Every expected name, method list and parameter list comes from the committed API
// surface's rows, and every parent and exception base from the Upstream PHP file's `extends` / `implements`, read
// through its `use` lines. The namespace list is the test's one constant, beside the spec's async table (AD-6, DIV-1),
// which no committed file carries, and the built-in parents' method lists (ESC-10.2-4).
//
// The Upstream snapshot is gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under
// `XARAVEL_UPSTREAM=require` (ESC-10.2-8). Where the snapshot is missing the Upstream-derived parts (parents, exception
// bases, built-ins, constant values) fail under that variable and otherwise warn and are skipped, as structural.test.ts's
// XT-contracts-6 does. The row-derived parts always run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { Assert, TestCase, xaravelTest } from "@xaravel/assert";
import { Double } from "@xaravel/mockery";
import { Exception, hasBrand, InvalidArgumentException, RuntimeException } from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { CLASS_FQCN, contract, CONTRACT_BUILTINS, CONTRACT_METHODS, CONTRACT_PARAMETERS, CONTRACT_PARENTS } from "@xaravel/contracts";
import type { ShouldBeDiscoveredStatic } from "@xaravel/contracts/events";
import * as bus from "@xaravel/contracts/bus";
import * as cache from "@xaravel/contracts/cache";
import * as concurrency from "@xaravel/contracts/concurrency";
import * as config from "@xaravel/contracts/config";
import * as container from "@xaravel/contracts/container";
import * as debug from "@xaravel/contracts/debug";
import * as encryption from "@xaravel/contracts/encryption";
import * as events from "@xaravel/contracts/events";
import * as filesystem from "@xaravel/contracts/filesystem";
import * as foundation from "@xaravel/contracts/foundation";
import * as hashing from "@xaravel/contracts/hashing";
import * as jsonSchema from "@xaravel/contracts/json-schema";
import * as pipeline from "@xaravel/contracts/pipeline";
import * as process from "@xaravel/contracts/process";
import * as psr from "@xaravel/contracts/psr";
import * as queue from "@xaravel/contracts/queue";
import * as redis from "@xaravel/contracts/redis";
import * as support from "@xaravel/contracts/support";
import * as translation from "@xaravel/contracts/translation";
import * as validation from "@xaravel/contracts/validation";
import { EntityNotFoundException, ShouldBeEncrypted, ShouldQueue } from "@xaravel/contracts/queue";

const REPO = join(import.meta.dir, "..", "..", "..", "..");
const PACKAGE = join(import.meta.dir, "..", "..");
const UPSTREAM_SYNCED = existsSync(join(REPO, "conformance", "upstream", "framework", "src", "Illuminate", "Contracts"));
/** CI's `check` job sets `XARAVEL_UPSTREAM=require`: a missing snapshot fails rather than skips (ESC-10.2-8). */
const UPSTREAM_REQUIRED = env["XARAVEL_UPSTREAM"] === "require";

/** The 19 namespaces Story 10.2 ports: Upstream namespace → its subpath module. */
const NAMESPACES: Readonly<Record<string, object>> = {
  Support: support,
  Container: container,
  Config: config,
  Foundation: foundation,
  Pipeline: pipeline,
  Events: events,
  Bus: bus,
  Queue: queue,
  Cache: cache,
  Redis: redis,
  Encryption: encryption,
  Hashing: hashing,
  Filesystem: filesystem,
  Process: process,
  Translation: translation,
  Validation: validation,
  Debug: debug,
  Concurrency: concurrency,
  JsonSchema: jsonSchema,
};

/** PHP's built-in parents, which are no contract token (the interface extends their structural form). */
const BUILTINS: ReadonlySet<string> = new Set(["Countable", "ArrayAccess", "IteratorAggregate", "Stringable", "Throwable"]);

/** Each built-in parent's methods, PHP names, in the order a token lists them (ESC-10.2-4); `Throwable` has none. */
const BUILTIN_METHODS: Readonly<Record<string, readonly string[]>> = {
  Countable: ["count"],
  ArrayAccess: ["offsetExists", "offsetGet", "offsetSet", "offsetUnset"],
  IteratorAggregate: ["getIterator"],
  Stringable: ["__toString"],
  Throwable: [],
};

/** The runtime's PHP exception classes an exception row may extend. */
const BASES: Readonly<Record<string, abstract new (...args: never[]) => object>> = { Exception, RuntimeException, InvalidArgumentException };

/** `<Contract>.<method>` → its `@asyncRoot`, the spec's async table (AD-6, DIV-1); every other method is sync. */
function asyncTable(): Map<string, string> {
  const table = new Map<string, string>();
  const same = (ns: string, contract: string, methods: string): void => {
    for (const method of methods.split(" ")) {
      table.set(`${ns}\\${contract}.${method}`, `${ns}\\${contract}.${method}`);
    }
  };
  const to = (ns: string, contract: string, methods: string, root: string): void => {
    for (const method of methods.split(" ")) {
      table.set(`${ns}\\${contract}.${method}`, root);
    }
  };
  same("Cache", "Store", "get many put putMany increment decrement forever touch forget flush");
  for (const method of "put increment decrement forever touch forget".split(" ")) {
    table.set(`Cache\\Repository.${method}`, `Cache\\Store.${method}`);
  }
  to("Cache", "Repository", "pull", "Cache\\Store.get");
  to("Cache", "Repository", "add", "Cache\\Store.put");
  to("Cache", "Repository", "remember sear rememberForever", "callback");
  to("Cache", "Lock", "get block", "Cache\\Store.put");
  to("Cache", "Lock", "release forceRelease", "Cache\\Store.forget");
  to("Cache", "CanFlushLocks", "flushLocks", "Cache\\Store.flush");
  same("Queue", "Queue", "size pendingSize delayedSize reservedSize creationTimeOfOldestPendingJob push pushOn pushRaw later laterOn bulk pop");
  to("Queue", "ClearableQueue", "clear", "Redis\\Connection.command");
  to("Queue", "Job", "fire", "callback");
  to("Queue", "Job", "delete release fail", "Redis\\Connection.command");
  to("Queue", "EntityResolver", "resolve", "Database\\ConnectionInterface.select");
  to("Bus", "Dispatcher", "dispatch dispatchSync dispatchNow", "callback");
  to("Bus", "QueueingDispatcher", "dispatchToQueue", "Queue\\Queue.push");
  to("Bus", "QueueingDispatcher", "findBatch", "Database\\ConnectionInterface.select");
  to("Events", "Dispatcher", "until dispatch flush", "callback");
  to("Pipeline", "Pipeline", "then", "callback");
  to("Pipeline", "Hub", "pipe", "callback");
  same(
    "Filesystem",
    "Filesystem",
    "exists get readStream put putFile putFileAs writeStream getVisibility setVisibility prepend append delete copy move size lastModified files allFiles directories allDirectories makeDirectory deleteDirectory",
  );
  same("Redis", "Connection", "subscribe psubscribe command");
  same("Process", "InvokedProcess", "wait waitUntil");
  to("Concurrency", "Driver", "run", "callback");
  to("Validation", "Validator", "validate validated fails errors", "callback");
  to("Validation", "Rule", "passes", "callback");
  to("Validation", "ValidationRule", "validate", "callback");
  to("Validation", "InvokableRule", "__invoke", "callback");
  to("Validation", "ValidatesWhenResolved", "validateResolved", "callback");
  to("Validation", "UncompromisedVerifier", "verify", "Http\\Client\\PendingRequest.send");
  to("Foundation", "Application", "boot bootstrapWith register registerConfiguredProviders", "callback");
  to("Foundation", "Application", "isDownForMaintenance", "Cache\\Store.get");
  to("Foundation", "MaintenanceMode", "activate", "Cache\\Store.put");
  to("Foundation", "MaintenanceMode", "deactivate", "Cache\\Store.forget");
  to("Foundation", "MaintenanceMode", "active data", "Cache\\Store.get");
  return table;
}

/** The structural types (AD-1.2) whose async methods mirror a contract's: file → `<Ns>\\<Contract>`. */
const STRUCTURAL_ASYNC: Readonly<Record<string, string>> = {
  "src/structural/ValidationValidator.ts": "Validation\\Validator",
  "src/structural/RedisConnection.ts": "Redis\\Connection",
};

interface Row {
  readonly fqcn: string;
  readonly kind: string;
  readonly member: string | null;
  readonly static?: boolean;
  readonly parameters?: readonly { readonly name: string }[];
}

type Token = Record<symbol, unknown> & { readonly brand: symbol };

/** The committed API surface's rows under `Illuminate\Contracts\<ns>\`, in file order. */
function rowsOf(ns: string): Row[] {
  const text = readFileSync(join(REPO, "conformance", "api-surface", "contracts.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row)
    .filter((row) => row.fqcn.startsWith(`Illuminate\\Contracts\\${ns}\\`) && !row.fqcn.slice(`Illuminate\\Contracts\\${ns}\\`.length).includes("\\"));
}

/** The short name of `name`, its last `\` segment. */
function shortName(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}

/** The kebab-case subpath of an Upstream namespace (`JsonSchema` → `json-schema`). */
function kebab(ns: string): string {
  return ns.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/** The path of an Upstream contract file. */
function upstreamPath(name: string): string {
  return join(REPO, "conformance", "upstream", "framework", "src", ...name.split("\\")) + ".php";
}

/** An Upstream interface's `const NAME = '<string>';` values, by name. */
function upstreamConstants(name: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of readFileSync(upstreamPath(name), "utf8").matchAll(/^\s*(?:public\s+)?const\s+(\w+)\s*=\s*'([^']*)';/gm)) {
    constants.set(match[1] ?? "", match[2] ?? "");
  }
  return constants;
}

/** An Upstream contract file's declaration: its `extends` and `implements` lists, each name resolved to an FQCN. */
function upstreamDeclaration(name: string): { readonly extends: string[]; readonly implements: string[] } {
  const source = readFileSync(upstreamPath(name), "utf8");
  const namespace = /^namespace\s+([^;]+);/m.exec(source)?.[1] ?? "";
  const uses = new Map<string, string>();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    uses.set(match[2] ?? shortName(match[1] ?? ""), match[1] ?? "");
  }
  const resolve = (local: string): string => {
    const trimmed = local.trim();
    if (trimmed.startsWith("\\")) {
      return trimmed.slice(1);
    }
    return uses.get(trimmed) ?? `${namespace}\\${trimmed}`;
  };
  const list = (text: string | undefined): string[] => (text === undefined ? [] : text.split(",").map((part) => part.trim()).filter((part) => part !== "").map(resolve));
  const declaration = new RegExp(`^(?:abstract\\s+|final\\s+)?(?:interface|class)\\s+${shortName(name)}\\b([^{]*)\\{`, "m").exec(source);
  Assert.assertNotNull(declaration, name);
  const head = declaration?.[1] ?? "";
  const extendsList = /\bextends\s+([\w\\,\s]+?)(?=\bimplements\b|$)/.exec(head)?.[1];
  const implementsList = /\bimplements\s+([\w\\,\s]+)$/.exec(head.trim())?.[1];
  return { extends: list(extendsList), implements: list(implementsList) };
}

/** The runtime export for an FQCN: an `Illuminate\Contracts\<ns>` subpath's, or `@xaravel/contracts/psr`'s. */
function exportFor(name: string): unknown {
  if (name.startsWith("Psr\\")) {
    return (psr as unknown as Record<string, unknown>)[shortName(name)];
  }
  const ns = name.split("\\")[2] ?? "";
  const module = NAMESPACES[ns];
  Assert.assertNotNull(module ?? null, `${name}: namespace ${ns} is not one of the 19`);
  return (module as Record<string, unknown>)[shortName(name)];
}

/** `token` and every contract in its parents' closure, depth-first, each once. */
function closure(token: Token): Token[] {
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
function brandedClass(tokens: readonly Token[]): new () => object {
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
function mockeryDouble(token: Token): unknown {
  return (Double.for(token as never, { override: true }) as { instance(): unknown }).instance();
}

/** A class carrying `ShouldQueue`'s brand only. */
class J {
  get [ShouldQueue.brand](): true {
    return true as const;
  }
}

/** A listener with `ShouldBeDiscovered`'s static side. */
class DiscoveredListener {
  static shouldBeDiscovered(): boolean {
    return true;
  }
}

/** The `TypeError` message `fn` throws, or "(nothing thrown)". */
function typeErrorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof TypeError ? error.message : `not a TypeError: ${String(error)}`;
  }
  return "(nothing thrown)";
}

/** A Mockery double's configuration API. */
type MockeryDouble = Record<string, (...args: unknown[]) => unknown> & { allows(method: string): { returns(...values: unknown[]): unknown } };

/** A PHPUnit mock's configuration API. */
type PhpunitMock = Record<string, (...args: unknown[]) => unknown> & { method(name: string): { willReturn(value: unknown): unknown } };

xaravelTest(
  "XT-contracts-5",
  "each of the 19 core and service subpaths of @xaravel/contracts exports exactly its Illuminate\\Contracts namespace's interface tokens and exception classes by Upstream short name; each token's fqcn() and brand are its FQCN, its instance methods and parameter names are its committed rows', its constant rows are the token's frozen statics with Upstream's values and its static method rows its file's <X>Static interface (ESC-10.2-1), its built-ins are its Upstream built-in parents' methods (ESC-10.2-4), and its parents are Upstream's contract parents in order, so a branded class, a Mockery double and a PHPUnit mock of a child are instanceof every parent and a parent's double is not the child, and doubles of MessageBag and ValidatedData configure their built-ins; marker tokens are brand-only and checkable with hasBrand (AD-1.1); the exception classes are registered under their FQCN with their runtime base, and async-surface.json lists exactly the spec's async methods with their roots and the Pipeline's thenable methods (AD-6)",
  () => {
    const expectedAsync = asyncTable();
    const actualAsync = new Map<string, string>();
    // A missing snapshot fails under XARAVEL_UPSTREAM=require, as CI's `check` job runs (ESC-10.2-8); otherwise it warns.
    if (!UPSTREAM_SYNCED) {
      if (UPSTREAM_REQUIRED) {
        Assert.fail("XARAVEL_UPSTREAM=require: conformance/upstream/framework/src/Illuminate/Contracts is missing; run `bun run upstream:sync`");
      }
      console.warn("namespaces.test.ts: conformance/upstream is not synced; the Upstream-derived checks are skipped");
    }
    const surface = JSON.parse(readFileSync(join(PACKAGE, "async-surface.json"), "utf8")) as {
      readonly method: string;
      readonly file: string;
      readonly root?: string;
      readonly thenable?: string;
    }[];
    const thenables = new Map<string, string>();
    let staticMethodRows = 0;
    const consumed = new Set<(typeof surface)[number]>();

    let interfaceCount = 0;
    let classCount = 0;
    for (const [ns, module] of Object.entries(NAMESPACES)) {
      const rows = rowsOf(ns);
      const declarations = rows.filter((row) => row.kind === "interface" || row.kind === "class");
      Assert.assertNotEmpty(declarations, ns);

      // The runtime exports are exactly the namespace's declarations, by short name.
      const exported = module as Record<string, unknown>;
      Assert.assertSame(JSON.stringify(declarations.map((row) => shortName(row.fqcn)).sort()), JSON.stringify(Object.keys(exported).sort()), ns);

      for (const declaration of declarations) {
        const name = declaration.fqcn;
        const upstream = UPSTREAM_SYNCED ? upstreamDeclaration(name) : null;
        if (declaration.kind === "class") {
          classCount++;
          const ExceptionClass = exported[shortName(name)] as new (...args: never[]) => Error;
          Assert.assertSame(name, fqcn(ExceptionClass));
          const instance: unknown =
            ExceptionClass === EntityNotFoundException ? new EntityNotFoundException("App\\User", 5) : new (ExceptionClass as unknown as new (message: string) => Error)("m");
          Assert.assertTrue(instance instanceof Exception, name);
          Assert.assertSame(ExceptionClass === EntityNotFoundException ? "Queueable entity [App\\User] not found for ID [5]." : "m", (instance as Error).message, name);
          if (upstream !== null) {
            const base = upstream.extends[0] ?? "";
            const Base = BASES[base];
            Assert.assertNotNull(Base ?? null, `${name} extends ${base}`);
            const implementsPsr = upstream.implements.includes("Psr\\Container\\ContainerExceptionInterface");
            Assert.assertSame(Base, Object.getPrototypeOf(ExceptionClass), `${name} extends ${base} directly`);
            Assert.assertTrue(instance instanceof (Base as abstract new (...args: never[]) => object), name);
            Assert.assertSame(implementsPsr, instance instanceof psr.ContainerExceptionInterface, name);
          }
          continue;
        }

        interfaceCount++;
        const token = exported[shortName(name)] as Token;
        Assert.assertSame(name, fqcn(token));
        Assert.assertSame(name, token[CLASS_FQCN]);
        Assert.assertSame(Symbol.for(name), token.brand);

        // Methods and parameters: the FQCN's instance method rows, in file order.
        const methodRows = rows.filter((row) => row.fqcn === name && row.kind === "method" && row.static !== true);
        const file = `src/${kebab(ns)}/${shortName(name)}.ts`;
        const methods = token[CONTRACT_METHODS] as readonly string[];
        const parameters = token[CONTRACT_PARAMETERS] as Readonly<Record<string, readonly string[]>>;
        Assert.assertSame(JSON.stringify(methodRows.map((row) => row.member)), JSON.stringify(methods), name);
        Assert.assertSame(methodRows.length, Object.keys(parameters).length, name);
        for (const row of methodRows) {
          const member = row.member as string;
          Assert.assertSame(JSON.stringify((row.parameters ?? []).map((parameter) => parameter.name)), JSON.stringify(parameters[member]), `${name}::${member}`);
        }

        // Static rows (ESC-10.2-1): each constant row is a frozen own property of the token, with Upstream's value, and
        // no other statics; each static method row is a member of the file's exported `<X>Static` interface, never a
        // token member.
        const constantRows = rows.filter((row) => row.fqcn === name && row.kind === "constant");
        const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
        const statics = Object.keys(token).filter((key) => key !== "brand");
        Assert.assertSame(JSON.stringify(constantRows.map((row) => row.member as string).sort(byName)), JSON.stringify(statics.sort(byName)), `${name} statics`);
        Assert.assertTrue(Object.isFrozen(token), name);
        if (upstream !== null && constantRows.length > 0) {
          const values = upstreamConstants(name);
          for (const row of constantRows) {
            const member = row.member as string;
            Assert.assertSame(values.get(member) ?? "(no Upstream value)", (token as unknown as Record<string, unknown>)[member], `${name}::${member}`);
          }
        }
        const staticMethods = rows.filter((row) => row.fqcn === name && row.kind === "method" && row.static === true);
        if (staticMethods.length > 0) {
          const source = readFileSync(join(PACKAGE, file), "utf8");
          const staticInterface = new RegExp(`^export interface ${shortName(name)}Static \\{([^}]*)\\}`, "m").exec(source)?.[1] ?? "";
          for (const row of staticMethods) {
            staticMethodRows++;
            Assert.assertFalse(methods.includes(row.member as string), `${name}::${row.member} is static`);
            Assert.assertTrue(new RegExp(`^\\s*${row.member}\\(`, "m").test(staticInterface), `${name}Static declares ${row.member}`);
          }
        }

        // Built-ins (ESC-10.2-4): the PHP names of the Upstream built-in parents' methods, in extends order; absent when none.
        const builtins = (token as unknown as Record<symbol, unknown>)[CONTRACT_BUILTINS];
        if (builtins !== undefined) {
          Assert.assertTrue(Object.isFrozen(builtins), name);
          Assert.assertNotEmpty(builtins as readonly string[], name);
        }
        if (upstream !== null) {
          const expectedBuiltins = upstream.extends.filter((parent) => BUILTINS.has(parent)).flatMap((parent) => BUILTIN_METHODS[parent] ?? []);
          Assert.assertSame(JSON.stringify(expectedBuiltins.length === 0 ? null : expectedBuiltins), JSON.stringify(builtins ?? null), `${name} builtins`);
        }

        // Parents: Upstream's contract parents in order, built-ins skipped.
        const parents = token[CONTRACT_PARENTS] as readonly unknown[];
        Assert.assertTrue(Object.isFrozen(parents), name);
        if (upstream !== null) {
          const expectedParents = upstream.extends.filter((parent) => !BUILTINS.has(parent)).map(exportFor);
          Assert.assertSame(expectedParents.length, parents.length, name);
          expectedParents.forEach((parent, index) => {
            Assert.assertNotNull(parent ?? null, `${name} parent ${index}`);
            Assert.assertSame(parent, parents[index], name);
          });
        }

        // Brands and doubles: a child is an instance of every contract in its chain; a parent's double is not the child.
        if (parents.length > 0) {
          const chain = closure(token);
          const branded: unknown = new (brandedClass(chain))();
          const double: unknown = mockeryDouble(token);
          const phpunitMock: unknown = new TestCase().createMock(token as never);
          for (const contract of chain) {
            const message = `${name} as ${String(contract[CLASS_FQCN])}`;
            Assert.assertTrue(branded instanceof (contract as unknown as abstract new () => object), message);
            Assert.assertTrue(double instanceof (contract as unknown as abstract new () => object), message);
            Assert.assertTrue(phpunitMock instanceof (contract as unknown as abstract new () => object), message);
          }
          for (const parent of parents as readonly Token[]) {
            const message = `${String(parent[CLASS_FQCN])} is not ${name}`;
            Assert.assertFalse(new (brandedClass(closure(parent)))() instanceof (token as unknown as abstract new () => object), message);
            Assert.assertFalse(mockeryDouble(parent) instanceof (token as unknown as abstract new () => object), message);
            Assert.assertFalse(new TestCase().createMock(parent as never) instanceof (token as unknown as abstract new () => object), message);
          }
        }

        // The async methods of this contract, and the methods returning a declared thenable, by its async-surface.json entries.
        for (const entry of surface.filter((line) => line.file === file)) {
          consumed.add(entry);
          if (entry.thenable !== undefined) {
            thenables.set(`${ns}\\${entry.method}`, entry.thenable);
          } else {
            actualAsync.set(`${ns}\\${entry.method}`, entry.root ?? "(no root)");
          }
        }
      }
    }
    Assert.assertSame(81, interfaceCount);
    Assert.assertSame(9, classCount);
    Assert.assertSame(1, staticMethodRows);

    // Statics (ESC-10.2-1): Upstream's constants on the token, and the static side a listener class satisfies.
    Assert.assertSame("public", filesystem.Filesystem.VISIBILITY_PUBLIC);
    Assert.assertSame("private", filesystem.Filesystem.VISIBILITY_PRIVATE);
    Assert.assertFalse(Object.getOwnPropertyDescriptor(filesystem.Filesystem, "VISIBILITY_PUBLIC")?.writable ?? true);
    const builtinsOf = (token: object): string => JSON.stringify((token as Record<symbol, unknown>)[CONTRACT_BUILTINS] ?? null);
    Assert.assertSame(JSON.stringify(["count"]), builtinsOf(support.MessageBag));
    Assert.assertSame(JSON.stringify(["offsetExists", "offsetGet", "offsetSet", "offsetUnset", "getIterator"]), builtinsOf(support.ValidatedData));
    Assert.assertSame(JSON.stringify(["__toString"]), builtinsOf(validation.ParameterizedRule));
    const discovered: ShouldBeDiscoveredStatic = DiscoveredListener;
    Assert.assertTrue(discovered.shouldBeDiscovered());
    const S = contract("X\\S", {}, [], { A: "a" });
    Assert.assertSame("a", S.A);
    Assert.assertSame("(nothing thrown)", typeErrorOf(() => contract("X\\N", {}, [], {})));
    Assert.assertStringContainsString("contract()", typeErrorOf(() => contract("X\\T", {}, [], { brand: 1 })));
    Assert.assertStringContainsString("contract()", typeErrorOf(() => contract("X\\U", {}, [], "x" as never)));

    // Built-ins (ESC-10.2-4): only the fixed PHP names, each once.
    Assert.assertSame(JSON.stringify(["count"]), JSON.stringify(contract("X\\C", {}, [], {}, ["count"])[CONTRACT_BUILTINS]));
    Assert.assertFalse(Object.hasOwn(contract("X\\E", {}, [], {}, []), CONTRACT_BUILTINS));
    Assert.assertStringContainsString("contract()", typeErrorOf(() => contract("X\\B", {}, [], {}, ["bogus"])));
    Assert.assertStringContainsString("contract()", typeErrorOf(() => contract("X\\B", {}, [], {}, ["count", "count"])));
    Assert.assertStringContainsString("contract()", typeErrorOf(() => contract("X\\B", {}, [], {}, "count" as never)));

    // Doubles of a contract with built-in parents configure the built-ins by PHP name (ESC-10.2-4).
    const mockData = Double.for(support.ValidatedData as never) as unknown as MockeryDouble;
    mockData.allows("getIterator").returns(["a", "b"]);
    mockData.allows("offsetGet").returns("at");
    Assert.assertSame(JSON.stringify(["a", "b"]), JSON.stringify([...(mockData as unknown as Iterable<unknown>)]));
    Assert.assertSame("at", mockData["offsetGet"]?.("k"));
    const mockBag = Double.for(support.MessageBag as never) as unknown as MockeryDouble;
    mockBag.allows("count").returns(3);
    Assert.assertSame(3, mockBag["count"]?.());
    const phpunitData = new TestCase().createMock(support.ValidatedData as never) as unknown as PhpunitMock;
    phpunitData.method("getIterator").willReturn(["c"]);
    phpunitData.method("offsetGet").willReturn("got");
    Assert.assertSame(JSON.stringify(["c"]), JSON.stringify([...(phpunitData as unknown as Iterable<unknown>)]));
    Assert.assertSame("got", phpunitData["offsetGet"]?.("k"));
    const phpunitBag = new TestCase().createMock(support.MessageBag as never) as unknown as PhpunitMock;
    phpunitBag.method("count").willReturn(4);
    Assert.assertSame(4, phpunitBag["count"]?.());
    const mockRule = Double.for(validation.ParameterizedRule as never) as unknown as MockeryDouble;
    mockRule.allows("__toString").returns("r");
    Assert.assertSame("r", String(mockRule as unknown as { toString(): string }));
    const phpunitRule = new TestCase().createMock(validation.ParameterizedRule as never) as unknown as PhpunitMock;
    phpunitRule.method("__toString").willReturn("r");
    Assert.assertSame("r", String(phpunitRule as unknown as { toString(): string }));

    // Pipeline (ESC-10.2-2): a declared thenable, so send/through/via have thenable lines and then keeps its root.
    const pipelineThenable: (value: pipeline.Pipeline) => PromiseLike<unknown> = (value) => value;
    Assert.assertNotNull(pipelineThenable);
    const thenable = "Illuminate\\Contracts\\Pipeline\\Pipeline";
    Assert.assertSame(
      JSON.stringify([
        ["Pipeline\\Pipeline.send", thenable],
        ["Pipeline\\Pipeline.through", thenable],
        ["Pipeline\\Pipeline.via", thenable],
      ]),
      JSON.stringify([...thenables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    );
    Assert.assertSame("callback", actualAsync.get("Pipeline\\Pipeline.then") ?? null);

    // Marker contracts: brand-only tokens, read with hasBrand without instantiating.
    Assert.assertSame(0, (ShouldQueue[CONTRACT_METHODS] as readonly string[]).length);
    Assert.assertTrue(hasBrand(J, ShouldQueue));
    Assert.assertFalse(hasBrand(J, ShouldBeEncrypted));
    Assert.assertTrue(new J() instanceof ShouldQueue);

    // async-surface.json: exactly the table's methods, each with its root (AD-6).
    const render = (table: Map<string, string>): string => JSON.stringify([...table].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    Assert.assertSame(render(expectedAsync), render(actualAsync));

    // A structural type that mirrors a contract's async methods carries the contract's roots; every entry outside
    // the PSR files is a contract's or one of these, so none goes unchecked.
    for (const [file, contract] of Object.entries(STRUCTURAL_ASYNC)) {
      for (const entry of surface.filter((line) => line.file === file)) {
        consumed.add(entry);
        const method = entry.method.slice(entry.method.indexOf(".") + 1);
        Assert.assertSame(expectedAsync.get(`${contract}.${method}`) ?? "(not async)", entry.root ?? "(no root)", `${file} ${entry.method}`);
      }
    }
    for (const entry of surface.filter((line) => !line.file.startsWith("src/psr/"))) {
      Assert.assertTrue(consumed.has(entry), `${entry.file} ${entry.method} is not a ported contract's async method`);
    }
  },
);
