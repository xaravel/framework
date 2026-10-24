// Xaravel Test for Story 10.2: the `Illuminate\Contracts` interfaces and exception classes of the core and service
// namespaces (AD-1.1, AD-6). Every expected name, method list and parameter list comes from the committed API
// surface's rows, and every parent and exception base from the Upstream PHP file's `extends` / `implements`, read
// through its `use` lines. The namespace list is the test's one constant, beside a copy of the Story spec's async
// table (AD-6, DIV-1, as amended by ESC-10.2-5), which no package or conformance file carries, and the built-in
// parents' method lists (ESC-10.2-4).
//
// The Upstream snapshot is gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under
// `XARAVEL_UPSTREAM=require` (ESC-10.2-8). Where the snapshot is missing the Upstream-derived parts (parents, exception
// bases, built-ins, constant values) fail under that variable and otherwise warn and are skipped, as structural.test.ts's
// XT-contracts-6 does. The row-derived parts always run. The helpers are shared with XT-contracts-6 and -8
// (`support/contract-namespaces.ts`). The async checks cover the 19 namespaces' subpath files and their structural
// files; Story 10.3's are XT-contracts-8's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import {
  asyncSurface,
  asyncTable,
  brandedClass,
  BUILTIN_METHODS,
  BUILTINS,
  closure,
  CORE_NAMESPACES,
  CORE_STRUCTURAL_ASYNC,
  coreScoped,
  exportFor,
  kebab,
  mockeryDouble,
  PACKAGE,
  renderTable,
  rowsOf,
  shortName,
  type Token,
  typeErrorOf,
  upstreamConstants,
  upstreamDeclaration,
  upstreamOrWarn,
} from "./support/contract-namespaces";

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

/** The runtime's PHP exception classes an exception row may extend. */
const BASES: Readonly<Record<string, abstract new (...args: never[]) => object>> = { Exception, RuntimeException, InvalidArgumentException };

/** `<Contract>.<method>` → its `@asyncRoot`, the spec's async table (AD-6, DIV-1); every other method is sync. */
function coreAsyncTable(): Map<string, string> {
  const { table, same, to } = asyncTable();
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
  // A render is a compiled template module's `Promise<string>` (AD-11; Story 10.3).
  to("Support", "Renderable", "render", "callback");
  return table;
}

/** The structural types (AD-1.2) whose async methods mirror a contract's: file → `<Ns>\\<Contract>`. */
const STRUCTURAL_ASYNC = CORE_STRUCTURAL_ASYNC;

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

/** A Mockery double's configuration API. */
type MockeryDouble = Record<string, (...args: unknown[]) => unknown> & { allows(method: string): { returns(...values: unknown[]): unknown } };

/** A PHPUnit mock's configuration API. */
type PhpunitMock = Record<string, (...args: unknown[]) => unknown> & { method(name: string): { willReturn(value: unknown): unknown } };

xaravelTest(
  "XT-contracts-5",
  "each of the 19 core and service subpaths of @xaravel/contracts exports exactly its Illuminate\\Contracts namespace's interface tokens and exception classes by Upstream short name; each token's fqcn() and brand are its FQCN, its instance methods and parameter names are its committed rows', its constant rows are the token's frozen statics with Upstream's values and its static method rows its file's <X>Static interface (ESC-10.2-1), its built-ins are its Upstream built-in parents' methods (ESC-10.2-4), and its parents are Upstream's contract parents in order, so a branded class, a Mockery double and a PHPUnit mock of a child are instanceof every parent and a parent's double is not the child, and doubles of MessageBag and ValidatedData configure their built-ins; marker tokens are brand-only and checkable with hasBrand (AD-1.1); the exception classes are registered under their FQCN with their runtime base, and async-surface.json lists exactly the spec's async methods with their roots, the Pipeline's thenable methods and QueueingDispatcher.batch's structural PendingBatch thenable (AD-6, ESC-10.3-2)",
  () => {
    const expectedAsync = coreAsyncTable();
    const actualAsync = new Map<string, string>();
    // A missing snapshot fails under XARAVEL_UPSTREAM=require, as CI's `check` job runs (ESC-10.2-8); otherwise it warns.
    const upstreamSynced = upstreamOrWarn("namespaces.test.ts");
    const surface = asyncSurface();
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
        const upstream = upstreamSynced ? upstreamDeclaration(name) : null;
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
          const expectedParents = upstream.extends.filter((parent) => !BUILTINS.has(parent)).map((parent) => exportFor(parent, NAMESPACES, psr));
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
    const V = contract("X\\V", {}, [], { N: 1, F: false, Z: null });
    Assert.assertSame(1, V.N);
    Assert.assertFalse(V.F);
    Assert.assertNull(V.Z);
    Assert.assertStringContainsString("must be a string, number, boolean or null", typeErrorOf(() => contract("X\\O", {}, [], { A: {} } as never)));
    Assert.assertStringContainsString("must be a string, number, boolean or null", typeErrorOf(() => contract("X\\G", {}, [], { A: () => 1 } as never)));
    Assert.assertStringContainsString("must have string keys", typeErrorOf(() => contract("X\\Y", {}, [], { [Symbol("s")]: 1 } as never)));
    Assert.assertStringContainsString("must be a { <constant>: <value> } record", typeErrorOf(() => contract("X\\R", {}, [], ["a"] as never)));

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
    // QueueingDispatcher.batch returns the structural PendingBatch, which stands for its header's thenable (ESC-10.3-2).
    const pipelineThenable: (value: pipeline.Pipeline) => PromiseLike<unknown> = (value) => value;
    Assert.assertNotNull(pipelineThenable);
    const thenable = "Illuminate\\Contracts\\Pipeline\\Pipeline";
    Assert.assertSame(
      JSON.stringify([
        ["Bus\\QueueingDispatcher.batch", "Illuminate\\Bus\\PendingBatch"],
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

    // async-surface.json: exactly the table's methods, each with its root (AD-6), over the 19 namespaces' files.
    Assert.assertSame(renderTable(expectedAsync), renderTable(actualAsync));

    // A structural type that mirrors a contract's async methods carries the contract's roots; every entry in the 19
    // namespaces' subpath directories or these structural files is a contract's or one of these, so none goes
    // unchecked (Story 10.3's subpaths and structural files are XT-contracts-8's).
    for (const [file, contract] of Object.entries(STRUCTURAL_ASYNC)) {
      for (const entry of surface.filter((line) => line.file === file)) {
        consumed.add(entry);
        const method = entry.method.slice(entry.method.indexOf(".") + 1);
        Assert.assertSame(expectedAsync.get(`${contract}.${method}`) ?? "(not async)", entry.root ?? "(no root)", `${file} ${entry.method}`);
      }
    }
    Assert.assertSame(JSON.stringify(CORE_NAMESPACES), JSON.stringify(Object.keys(NAMESPACES)));
    for (const entry of surface.filter((line) => coreScoped(line.file))) {
      Assert.assertTrue(consumed.has(entry), `${entry.file} ${entry.method} is not a ported contract's async method`);
    }
  },
);
