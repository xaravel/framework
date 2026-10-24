// Xaravel Test for Story 10.3: the `Illuminate\Contracts` interfaces and classes of the web and application
// namespaces (AD-1.1, AD-1.2, AD-6). Every expected name, method list and parameter list comes from the committed API
// surface's rows, and every parent, exception base, constant value and concrete type from the Upstream PHP file, read
// through its `use` lines, with the helpers XT-contracts-5 and -6 use (`support/contract-namespaces.ts`). The
// namespace list is the test's one constant, beside a copy of the Story spec's async table (AD-6, DIV-1), which no
// package or conformance file carries, and the literal parent list of the spec's matrix, which runs without the
// snapshot.
//
// The Upstream snapshot is gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under
// `XARAVEL_UPSTREAM=require` (ESC-10.2-8). Where it is missing, the Upstream-derived parts fail under that variable
// and otherwise warn and are skipped. The row-derived parts always run.
//
// `View\Factory::make()` and `file()` are ported sync under the ESC-10.3-1 ruling (they stay sync, DIV-1.5).
// `Console\Kernel::queue()` returns the structural `PendingDispatch`, which stands for the thenable its
// header names (ESC-10.3-2), so its line is a `thenable` line; this test checks the method is sync, returns that type,
// and is the namespaces' only thenable line.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Error as PhpError, Exception, hasBrand } from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { runInFrame } from "@xaravel/runtime/scope";
import { CLASS_FQCN, CONTRACT_BUILTINS, CONTRACT_METHODS, CONTRACT_PARAMETERS, CONTRACT_PARENTS } from "@xaravel/contracts";
import * as auth from "@xaravel/contracts/auth";
import * as authAccess from "@xaravel/contracts/auth/access";
import * as authMiddleware from "@xaravel/contracts/auth/middleware";
import * as broadcasting from "@xaravel/contracts/broadcasting";
import * as consoleNs from "@xaravel/contracts/console";
import * as cookie from "@xaravel/contracts/cookie";
import * as database from "@xaravel/contracts/database";
import * as databaseEloquent from "@xaravel/contracts/database/eloquent";
import type { CastableStatic } from "@xaravel/contracts/database/eloquent";
import * as databaseEvents from "@xaravel/contracts/database/events";
import * as databaseQuery from "@xaravel/contracts/database/query";
import * as http from "@xaravel/contracts/http";
import * as image from "@xaravel/contracts/image";
import * as log from "@xaravel/contracts/log";
import * as mail from "@xaravel/contracts/mail";
import * as notifications from "@xaravel/contracts/notifications";
import * as pagination from "@xaravel/contracts/pagination";
import * as psr from "@xaravel/contracts/psr";
import * as routing from "@xaravel/contracts/routing";
import * as session from "@xaravel/contracts/session";
import * as sessionMiddleware from "@xaravel/contracts/session/middleware";
import * as support from "@xaravel/contracts/support";
import * as view from "@xaravel/contracts/view";
import {
  asyncSurface,
  asyncTable,
  brandedClass,
  BUILTIN_METHODS,
  BUILTINS,
  closure,
  concreteNames,
  coreScoped,
  exportFor,
  inSignature,
  kebab,
  mockeryDouble,
  PACKAGE,
  PHP_BUILTINS,
  phpunitMock,
  portFile,
  renderTable,
  rowsOf,
  shortName,
  structuralFiles,
  type Token,
  UPSTREAM_CONTRACTS,
  upstreamConstants,
  upstreamDeclaration,
  upstreamOrWarn,
  usedInSignature,
  WEB_NAMESPACES,
  WEB_STRUCTURAL_ASYNC,
  webScoped,
} from "./support/contract-namespaces";

/** The 20 namespaces Story 10.3 ports: Upstream namespace → its subpath module. */
const NAMESPACES: Readonly<Record<string, object>> = {
  Auth: auth,
  "Auth\\Access": authAccess,
  "Auth\\Middleware": authMiddleware,
  Broadcasting: broadcasting,
  Console: consoleNs,
  Cookie: cookie,
  Database: database,
  "Database\\Eloquent": databaseEloquent,
  "Database\\Events": databaseEvents,
  "Database\\Query": databaseQuery,
  Http: http,
  Image: image,
  Log: log,
  Mail: mail,
  Notifications: notifications,
  Pagination: pagination,
  Routing: routing,
  Session: session,
  "Session\\Middleware": sessionMiddleware,
  View: view,
};

/** The modules a parent may come from: the 20, and Story 10.2's `Support` (`View\View extends Renderable`). */
const PARENT_MODULES: Readonly<Record<string, object>> = { ...NAMESPACES, Support: support };

/** An Upstream parent that is no contract: the interface extends its structural form and the token records no parent. */
const NON_CONTRACT_PARENTS: ReadonlySet<string> = new Set([...BUILTINS, "Monolog\\Processor\\ProcessorInterface"]);

/** The spec's parents (its matrix); every other token has none. */
const PARENTS: ReadonlyMap<object, readonly object[]> = new Map<object, readonly object[]>([
  [auth.StatefulGuard, [auth.Guard]],
  [broadcasting.ShouldBroadcastNow, [broadcasting.ShouldBroadcast]],
  [cookie.QueueingFactory, [cookie.Factory]],
  [databaseEloquent.Builder, [databaseQuery.Builder]],
  [databaseQuery.ConditionExpression, [databaseQuery.Expression]],
  [pagination.LengthAwarePaginator, [pagination.Paginator]],
  [view.View, [support.Renderable]],
]);

/** The structural files whose async methods are AD-6 roots: file → their owner in the async table. */
const STRUCTURAL_ASYNC = WEB_STRUCTURAL_ASYNC;

/**
 * Concrete classes an Upstream file of the 20 names that are no structural type: the Query and Eloquent builders are
 * the `Database\Query\Builder` and `Database\Eloquent\Builder` contracts (the spec's rule), and `ModelIdentifier` looks
 * `Relation` up in the Class Registry when it is used, as PHP autoloads it. Value: the file a port imports, or null.
 */
const NOT_STRUCTURAL: Readonly<Record<string, string | null>> = {
  "Illuminate\\Database\\Eloquent\\Builder": "database/eloquent/Builder",
  "Illuminate\\Database\\Query\\Builder": "database/query/Builder",
  "Illuminate\\Database\\Eloquent\\Relations\\Relation": null,
};

/** `<Ns>\<Contract>.<method>` → its `@asyncRoot`, the spec's async table (AD-6, DIV-1); every other method is sync. */
function webAsyncTable(): Map<string, string> {
  const { table, same, to } = asyncTable();
  const select = "Database\\ConnectionInterface.select";
  const update = "Database\\ConnectionInterface.update";
  const transport = "Symfony\\Component\\Mailer\\Transport\\TransportInterface.send";
  to("Auth\\Access", "Authorizable", "can", "callback");
  to("Auth\\Access", "Gate", "allows denies check any authorize inspect raw", "callback");
  to("Auth", "CanResetPassword", "sendPasswordResetNotification", "callback");
  to("Auth", "Guard", "validate", select);
  to("Auth", "Guard", "setUser", "callback");
  to("Auth", "MustVerifyEmail", "markEmailAsVerified markEmailAsUnverified", update);
  to("Auth", "MustVerifyEmail", "sendEmailVerificationNotification", "callback");
  to("Auth", "PasswordBroker", "sendResetLink reset", select);
  to("Auth", "StatefulGuard", "attempt once loginUsingId onceUsingId", select);
  to("Auth", "StatefulGuard", "login", "SessionHandlerInterface.destroy");
  to("Auth", "StatefulGuard", "logout", update);
  to("Auth", "SupportsBasicAuth", "basic onceBasic", select);
  to("Auth", "UserProvider", "retrieveById retrieveByToken retrieveByCredentials", select);
  to("Auth", "UserProvider", "updateRememberToken rehashPasswordIfRequired", update);
  same("Broadcasting", "Broadcaster", "auth broadcast");
  to("Console", "Application", "call", "callback");
  to("Console", "Kernel", "bootstrap handle call terminate", "callback");
  to("Http", "Kernel", "bootstrap handle terminate", "callback");
  to("Mail", "Mailable", "send", transport);
  to("Mail", "Mailable", "queue", "Queue\\Queue.pushOn");
  to("Mail", "Mailable", "later", "Queue\\Queue.laterOn");
  to("Mail", "MailQueue", "queue", "Queue\\Queue.pushOn");
  to("Mail", "MailQueue", "later", "Queue\\Queue.laterOn");
  to("Mail", "Mailer", "raw send sendNow", transport);
  to("Notifications", "Dispatcher", "send sendNow", "callback");
  to("Notifications", "Factory", "send sendNow", "callback");
  to("Pagination", "Paginator", "render", "callback");
  to("Pagination", "CursorPaginator", "render", "callback");
  to("Routing", "Registrar", "substituteBindings", "callback");
  to("Routing", "Registrar", "substituteImplicitBindings", select);
  to("Routing", "ResponseFactory", "view", "callback");
  to("Routing", "UrlRoutable", "resolveRouteBinding resolveChildRouteBinding", select);
  to("Session", "Session", "start", "SessionHandlerInterface.read");
  to("Session", "Session", "save", "SessionHandlerInterface.write");
  to("Session", "Session", "invalidate regenerate migrate", "SessionHandlerInterface.destroy");
  to("View", "Engine", "get", "callback");
  // AD-6's session-handler root, a structural type (AD-1.2).
  for (const method of "read write destroy gc".split(" ")) {
    table.set(`SessionHandlerInterface.${method}`, `SessionHandlerInterface.${method}`);
  }
  return table;
}

/** A cast target with `Castable`'s static side. */
class AddressCast {
  static castUsing(args: unknown): string {
    return `App\\Casts\\AddressCaster:${JSON.stringify(args)}`;
  }
}

/** The import specifier of `src/<target>` from a file in `src/<from>/`. */
function relativeImport(from: string, target: string): string {
  const path = relative(join(PACKAGE, "src", from), join(PACKAGE, "src", target));
  return path.startsWith(".") ? path : `./${path}`;
}

/** The message `fn` throws, with its class, or "(nothing thrown)". */
function thrownBy(fn: () => unknown): { readonly error: unknown; readonly message: string } {
  try {
    fn();
  } catch (error) {
    return { error, message: error instanceof globalThis.Error ? error.message : String(error) };
  }
  return { error: null, message: "(nothing thrown)" };
}

xaravelTest(
  "XT-contracts-8",
  "each of the 20 web and application subpaths of @xaravel/contracts exports exactly its Illuminate\\Contracts namespace's interface tokens and classes by Upstream short name; each token's fqcn() and brand are its FQCN, its instance methods and parameter names are its committed rows', its constant rows are frozen statics with Upstream's values (PasswordBroker) and its static method rows its file's <X>Static interface (Castable), no token has built-ins, and its parents are Upstream's contract parents in order (ContextLogProcessor's Monolog parent is none), so a branded class, a Mockery double and a PHPUnit mock of a child are instanceof every parent; ModelIdentifier and ViewCompilationException are registered classes, ModelIdentifier keeping Upstream's properties in their declared (phpSerialize, AD-23) order, its constructor values, useCollectionClass and getClass, its morph-map flag held per frame, and reading the morph map with no Relation registered failing as PHP's autoloader does (the registered-Relation round trip is blocked-by:database); every concrete class an Upstream file names is a src/structural/ type, a contract token, or Eloquent's Relation, which ModelIdentifier resolves through the Class Registry at call time, and the port imports the type where the class is in a signature; the brand-only tokens are checkable with hasBrand; and async-surface.json lists exactly the spec's async methods with their roots, SessionHandlerInterface's four included, with Console\\Kernel.queue sync and its only thenable line, the structural PendingDispatch's (AD-1.1, AD-1.2, AD-6, ESC-10.3-2)",
  () => {
    const upstreamSynced = upstreamOrWarn("web.test.ts");
    const expectedAsync = webAsyncTable();
    const actualAsync = new Map<string, string>();
    const actualThenables = new Map<string, string>();
    const surface = asyncSurface();
    const consumed = new Set<(typeof surface)[number]>();

    let interfaceCount = 0;
    let classCount = 0;
    let staticMethodRows = 0;
    let constantRows = 0;
    for (const [ns, module] of Object.entries(NAMESPACES)) {
      const rows = rowsOf(ns);
      const declarations = rows.filter((row) => row.kind === "interface" || row.kind === "class");
      Assert.assertNotEmpty(declarations, ns);

      // The runtime exports are exactly the namespace's declarations, by short name.
      const exported = module as Record<string, unknown>;
      Assert.assertSame(JSON.stringify(declarations.map((row) => shortName(row.fqcn)).sort()), JSON.stringify(Object.keys(exported).sort()), ns);

      for (const declaration of declarations) {
        const name = declaration.fqcn;
        const file = portFile(name);
        const upstream = upstreamSynced ? upstreamDeclaration(name) : null;
        if (declaration.kind === "class") {
          classCount++;
          const Class = exported[shortName(name)] as abstract new (...args: never[]) => object;
          Assert.assertSame(name, fqcn(Class));
          if (upstream !== null) {
            // Each class extends what Upstream extends: `ViewCompilationException` runtime's `Exception`, `ModelIdentifier` nothing.
            const base = upstream.extends[0] ?? null;
            Assert.assertSame(base === null ? Function.prototype : base === "Exception" ? Exception : "(unknown base)", Object.getPrototypeOf(Class), `${name} extends ${String(base)}`);
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
        const methods = token[CONTRACT_METHODS] as readonly string[];
        const parameters = token[CONTRACT_PARAMETERS] as Readonly<Record<string, readonly string[]>>;
        Assert.assertSame(JSON.stringify(methodRows.map((row) => row.member)), JSON.stringify(methods), name);
        Assert.assertSame(methodRows.length, Object.keys(parameters).length, name);
        for (const row of methodRows) {
          const member = row.member as string;
          Assert.assertSame(JSON.stringify((row.parameters ?? []).map((parameter) => parameter.name)), JSON.stringify(parameters[member]), `${name}::${member}`);
        }

        // Static rows (ESC-10.2-1): constants are frozen own properties with Upstream's values, and nothing else;
        // static methods are members of the file's exported `<X>Static` interface, never token members.
        const constants = rows.filter((row) => row.fqcn === name && row.kind === "constant");
        constantRows += constants.length;
        const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
        const statics = Object.keys(token).filter((key) => key !== "brand");
        Assert.assertSame(JSON.stringify(constants.map((row) => row.member as string).sort(byName)), JSON.stringify(statics.sort(byName)), `${name} statics`);
        Assert.assertTrue(Object.isFrozen(token), name);
        for (const row of constants) {
          Assert.assertFalse(Object.getOwnPropertyDescriptor(token, row.member as string)?.writable ?? true, `${name}::${row.member} is read-only`);
        }
        if (upstream !== null && constants.length > 0) {
          const values = upstreamConstants(name);
          for (const row of constants) {
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

        // Built-ins (ESC-10.2-4): no token in scope has a built-in parent, so none records any.
        Assert.assertFalse(Object.hasOwn(token, CONTRACT_BUILTINS), `${name} builtins`);
        if (upstream !== null) {
          const expectedBuiltins = upstream.extends.filter((parent) => BUILTINS.has(parent)).flatMap((parent) => BUILTIN_METHODS[parent] ?? []);
          Assert.assertSame(0, expectedBuiltins.length, `${name} has Upstream built-in parents`);
        }

        // Parents: the spec's list, and Upstream's contract parents in order (built-ins and Monolog's skipped).
        const parents = token[CONTRACT_PARENTS] as readonly unknown[];
        Assert.assertTrue(Object.isFrozen(parents), name);
        Assert.assertSame(JSON.stringify((PARENTS.get(token) ?? []).map((parent) => fqcn(parent))), JSON.stringify(parents.map((parent) => fqcn(parent as object))), `${name} parents`);
        if (upstream !== null) {
          const expectedParents = upstream.extends.filter((parent) => !NON_CONTRACT_PARENTS.has(parent)).map((parent) => exportFor(parent, PARENT_MODULES, psr));
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
          const mock: unknown = phpunitMock(token);
          for (const contract of chain) {
            const message = `${name} as ${String(contract[CLASS_FQCN])}`;
            Assert.assertTrue(branded instanceof (contract as unknown as abstract new () => object), message);
            Assert.assertTrue(double instanceof (contract as unknown as abstract new () => object), message);
            Assert.assertTrue(mock instanceof (contract as unknown as abstract new () => object), message);
          }
          for (const parent of parents as readonly Token[]) {
            const message = `${String(parent[CLASS_FQCN])} is not ${name}`;
            Assert.assertFalse(new (brandedClass(closure(parent)))() instanceof (token as unknown as abstract new () => object), message);
            Assert.assertFalse(mockeryDouble(parent) instanceof (token as unknown as abstract new () => object), message);
            Assert.assertFalse(phpunitMock(parent) instanceof (token as unknown as abstract new () => object), message);
          }
        }

        // The async methods of this contract, by its async-surface.json entries; a thenable line has no root and goes
        // to the thenable map instead.
        for (const entry of surface.filter((line) => line.file === file)) {
          consumed.add(entry);
          if (entry.thenable !== undefined) {
            Assert.assertSame(undefined, entry.root, `${file} ${entry.method} has a thenable line and a root`);
            actualThenables.set(`${ns}\\${entry.method}`, entry.thenable);
          } else {
            actualAsync.set(`${ns}\\${entry.method}`, entry.root ?? "(no root)");
          }
        }
      }
    }
    Assert.assertSame(64, interfaceCount);
    Assert.assertSame(2, classCount);
    Assert.assertSame(1, staticMethodRows);
    Assert.assertSame(5, constantRows);

    // Doubles of a child contract carry the parent's brand (the matrix's StatefulGuard row).
    for (const double of [mockeryDouble(auth.StatefulGuard as unknown as Token), phpunitMock(auth.StatefulGuard as unknown as Token)]) {
      Assert.assertTrue(double instanceof auth.StatefulGuard);
      Assert.assertTrue(double instanceof auth.Guard);
    }

    // Statics: PasswordBroker's five constants, and Castable's static side.
    Assert.assertSame("passwords.sent", auth.PasswordBroker.RESET_LINK_SENT);
    Assert.assertSame("passwords.reset", auth.PasswordBroker.PASSWORD_RESET);
    Assert.assertSame("passwords.user", auth.PasswordBroker.INVALID_USER);
    Assert.assertSame("passwords.token", auth.PasswordBroker.INVALID_TOKEN);
    Assert.assertSame("passwords.throttled", auth.PasswordBroker.RESET_THROTTLED);
    const castable: CastableStatic = AddressCast;
    Assert.assertSame('App\\Casts\\AddressCaster:["a"]', castable.castUsing(["a"]));
    Assert.assertSame(0, (databaseEloquent.Castable[CONTRACT_METHODS] as readonly string[]).length);

    // ViewCompilationException: runtime's Exception, Upstream's message, registered.
    const compilation = new view.ViewCompilationException("m");
    Assert.assertTrue(compilation instanceof Exception);
    Assert.assertSame("m", compilation.getMessage());
    Assert.assertSame("Illuminate\\Contracts\\View\\ViewCompilationException", fqcn(compilation));

    // ModelIdentifier: Upstream's properties and methods; the morph-map flag is a frame static (AD-5).
    const identifier = new database.ModelIdentifier("App\\User", 5, [], "mysql");
    Assert.assertSame("Illuminate\\Contracts\\Database\\ModelIdentifier", fqcn(identifier));
    // Upstream's declaration order, which phpSerialize keeps (AD-23).
    Assert.assertSame(JSON.stringify(["class", "id", "relations", "connection", "collectionClass"]), JSON.stringify(Object.keys(identifier)));
    const relations = ["posts", "comments"];
    Assert.assertSame(relations, new database.ModelIdentifier("App\\User", 5, relations, "mysql").relations);
    Assert.assertSame("App\\User", identifier.class);
    Assert.assertSame(5, identifier.id);
    Assert.assertSame("mysql", identifier.connection);
    Assert.assertNull(identifier.collectionClass);
    Assert.assertSame("App\\User", identifier.getClass());
    Assert.assertSame(identifier, identifier.useCollectionClass("X"));
    Assert.assertSame("X", identifier.collectionClass);
    Assert.assertNull(new database.ModelIdentifier(null, [1, 2], [], null).getClass());
    runInFrame("test", () => {
      database.ModelIdentifier.useMorphMap();
      // With no Relation registered, reading the morph map fails as PHP's autoloader does. The registered-Relation
      // round trip (alias in, model out) is blocked-by:database: Relation is `@xaravel/database`'s.
      const thrown = thrownBy(() => identifier.getClass());
      Assert.assertTrue(thrown.error instanceof PhpError, thrown.message);
      Assert.assertSame('Class "Illuminate\\Database\\Eloquent\\Relations\\Relation" not found', thrown.message);
      Assert.assertSame('Class "Illuminate\\Database\\Eloquent\\Relations\\Relation" not found', thrownBy(() => new database.ModelIdentifier("App\\User", 5, [], null)).message);
      // A null class reads no morph map.
      Assert.assertNull(new database.ModelIdentifier(null, 5, [], null).getClass());
      database.ModelIdentifier.useMorphMap(false);
      Assert.assertSame("App\\User", identifier.getClass());
      database.ModelIdentifier.useMorphMap(true);
    });
    // The flag was set in that unit frame only.
    Assert.assertSame("App\\User", identifier.getClass());

    // Concrete types (AD-1.2): every concrete class an Upstream file names is a structural type (or a contract token,
    // or resolved at call time); where it is in a signature, the port imports it and names it in a method signature.
    // A `class-string<…>` names a class by string, so the classes inside one are no types the port declares.
    if (upstreamSynced) {
      const structural = structuralFiles();
      for (const ns of Object.keys(NAMESPACES)) {
        const dir = join(UPSTREAM_CONTRACTS, ...ns.split("\\"));
        for (const entry of readdirSync(dir).filter((fileName) => fileName.endsWith(".php"))) {
          const source = readFileSync(join(dir, entry), "utf8").replace(/class-string<[^>]*>/g, "class-string");
          const port = readFileSync(join(PACKAGE, "src", kebab(ns), entry.replace(/\.php$/, ".ts")), "utf8");
          for (const [name, local] of concreteNames(source)) {
            const where = `Illuminate\\Contracts\\${ns}\\${entry} names ${name}`;
            if (Object.hasOwn(PHP_BUILTINS, name)) {
              continue;
            }
            const contractFile = Object.hasOwn(NOT_STRUCTURAL, name) ? NOT_STRUCTURAL[name] : undefined;
            const structuralFile = structural.get(name);
            // The file under `src/` a port imports: a contract's, or a structural type's (`structuralFiles` gives the path from one directory below `src/`).
            const fromSrc = contractFile !== undefined ? contractFile : structuralFile === undefined ? undefined : structuralFile.replace(/^\.\.\//, "");
            const target = fromSrc === undefined || fromSrc === null ? fromSrc : relativeImport(kebab(ns), fromSrc);
            Assert.assertNotSame(undefined, target, `${where}, which no src/structural/ header names`);
            if (target !== null && target !== undefined && inSignature(source, name, local)) {
              const imported = new RegExp(`import (?:type )?\\{ (\\w+)(?: as (\\w+))? \\} from "${target.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`).exec(port);
              Assert.assertNotNull(imported, `${where} in a signature; its port imports ${target}`);
              const portLocal = imported?.[2] ?? imported?.[1] ?? "";
              Assert.assertTrue(usedInSignature(port, portLocal), `${where} in a signature; its port declares ${portLocal} in a method signature`);
            }
          }
        }
      }
    }

    // Console\Kernel::queue returns the structural PendingDispatch, a thenable (AD-6), and is sync; its header names the
    // thenable, so it has the namespaces' only `thenable` line (ESC-10.3-2) and no root.
    const kernel = readFileSync(join(PACKAGE, "src", "console", "Kernel.ts"), "utf8");
    Assert.assertMatchesRegularExpression(/^\s*queue\(command: string, parameters\?: PhpArrayLike\): PendingDispatch;$/m, kernel);
    Assert.assertStringStartsWith("// Illuminate\\Foundation\\Bus\\PendingDispatch,", readFileSync(join(PACKAGE, "src", "structural", "PendingDispatch.ts"), "utf8"));
    Assert.assertFalse(actualAsync.has("Console\\Kernel.queue"));
    Assert.assertSame(
      JSON.stringify([["Console\\Kernel.queue", "Illuminate\\Foundation\\Bus\\PendingDispatch"]]),
      JSON.stringify([...actualThenables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    );

    // The session-handler root's structural type carries its own roots.
    for (const [file, owner] of Object.entries(STRUCTURAL_ASYNC)) {
      for (const entry of surface.filter((line) => line.file === file)) {
        consumed.add(entry);
        Assert.assertSame(owner, entry.method.slice(0, entry.method.indexOf(".")), `${file} ${entry.method}`);
        actualAsync.set(entry.method, entry.root ?? "(no root)");
      }
    }

    // async-surface.json: exactly the table's methods, each with its root (AD-6). `View\Factory` has none (ESC-10.3-1).
    Assert.assertSame(renderTable(expectedAsync), renderTable(actualAsync));
    Assert.assertSame(JSON.stringify(WEB_NAMESPACES), JSON.stringify(Object.keys(NAMESPACES)));
    for (const entry of surface.filter((line) => webScoped(line.file))) {
      Assert.assertTrue(consumed.has(entry), `${entry.file} ${entry.method} is not a ported contract's async method`);
    }
    // Every non-PSR entry is XT-contracts-5's or this test's, so none goes unchecked.
    for (const entry of surface.filter((line) => !line.file.startsWith("src/psr/"))) {
      Assert.assertTrue(coreScoped(entry.file) || webScoped(entry.file), `${entry.file} ${entry.method} is in neither XT-contracts-5's nor XT-contracts-8's scope`);
    }

    // Brand-only tokens are checkable without instantiating (DIV-9): a class branding ShouldBroadcastNow and its
    // parent ShouldBroadcast is both, and is not ShouldRescue.
    class NowEvent {
      get [broadcasting.ShouldBroadcastNow.brand](): true {
        return true as const;
      }

      get [broadcasting.ShouldBroadcast.brand](): true {
        return true as const;
      }

      broadcastOn(): string {
        return "orders";
      }
    }
    Assert.assertTrue(hasBrand(NowEvent, broadcasting.ShouldBroadcastNow));
    Assert.assertTrue(hasBrand(NowEvent, broadcasting.ShouldBroadcast));
    Assert.assertFalse(hasBrand(NowEvent, broadcasting.ShouldRescue));
    Assert.assertFalse(hasBrand(class {}, broadcasting.ShouldBroadcastNow));
    Assert.assertTrue(new NowEvent() instanceof broadcasting.ShouldBroadcastNow);
  },
);
