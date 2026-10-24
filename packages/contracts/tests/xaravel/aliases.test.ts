// Xaravel Tests for Story 10.4: `@xaravel/contracts/aliases`, Upstream's container alias table as data and one
// canonical token per service (AD-1.3, AD-1.4, ESC-10.4-1 Option 1). XT-contracts-10 parses the three constants from
// the Upstream PHP sources: `Application::registerCoreContainerAliases`, each `*ServiceProvider.php`'s string
// `singleton` / `bind` / `scoped` calls (the class each closure builds, read through the file's `use` lines) and its
// class-to-class `alias()` calls. XT-contracts-11 checks `canonicalToken` against the spec's literal canonical table,
// which runs without the snapshot, and against the rule applied to the parsed Upstream data. XT-contracts-12 checks
// `validateAliasTable`'s four failures on `App\…` test tables.
//
// The Upstream snapshot is gitignored and synced by `bun run upstream:sync`, which CI's `check` job runs under
// `XARAVEL_UPSTREAM=require` (ESC-10.2-8). Where it is missing, the Upstream-derived parts fail under that variable
// and otherwise warn and are skipped.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { LogicException } from "@xaravel/runtime/php";
import { registerTestClass } from "@xaravel/runtime/registry";
import { runInRootFrame } from "@xaravel/runtime/scope";
import { CLASS_FQCN, contract, type ContractToken } from "@xaravel/contracts";
import { aliasResolver, type AliasTable, canonicalToken, CORE_CONTAINER_ALIASES, PROVIDER_ALIASES, PROVIDER_BINDINGS, validateAliasTable } from "@xaravel/contracts/aliases";
import * as auth from "@xaravel/contracts/auth";
import * as cache from "@xaravel/contracts/cache";
import * as foundation from "@xaravel/contracts/foundation";
import * as mail from "@xaravel/contracts/mail";
import * as support from "@xaravel/contracts/support";
import * as psr from "@xaravel/contracts/psr";
import * as broadcasting from "@xaravel/contracts/broadcasting";
import * as bus from "@xaravel/contracts/bus";
import * as concurrency from "@xaravel/contracts/concurrency";
import * as config from "@xaravel/contracts/config";
import * as consoleNs from "@xaravel/contracts/console";
import * as container from "@xaravel/contracts/container";
import * as cookie from "@xaravel/contracts/cookie";
import * as database from "@xaravel/contracts/database";
import * as debug from "@xaravel/contracts/debug";
import * as encryption from "@xaravel/contracts/encryption";
import * as events from "@xaravel/contracts/events";
import * as filesystem from "@xaravel/contracts/filesystem";
import * as hashing from "@xaravel/contracts/hashing";
import * as http from "@xaravel/contracts/http";
import * as image from "@xaravel/contracts/image";
import * as jsonSchema from "@xaravel/contracts/json-schema";
import * as log from "@xaravel/contracts/log";
import * as notifications from "@xaravel/contracts/notifications";
import * as pagination from "@xaravel/contracts/pagination";
import * as pipeline from "@xaravel/contracts/pipeline";
import * as processNs from "@xaravel/contracts/process";
import * as queue from "@xaravel/contracts/queue";
import * as redis from "@xaravel/contracts/redis";
import * as routing from "@xaravel/contracts/routing";
import * as session from "@xaravel/contracts/session";
import * as translation from "@xaravel/contracts/translation";
import * as validation from "@xaravel/contracts/validation";
import * as view from "@xaravel/contracts/view";
import { closure, REPO, shortName, type Token, typeErrorOf, upstreamOrWarn, upstreamPath } from "./support/contract-namespaces";

const ILLUMINATE = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate");

/** The 15 provider string bindings outside the core keys, as the spec lists them. */
const BINDING_KEYS: readonly string[] = ["memcached.connector", "db.factory", "db.transactions", "migration.repository", "migrator", "migration.creator", "composer", "pipeline", "queue.worker", "queue.listener", "queue.routes", "translation.loader", "validation.presence", "view.finder", "view.engine.resolver"];

/** The spec's canonical table (Design Notes, Option 1): service → canonical contract, relative to `Illuminate\Contracts\` unless it is `Psr\…`. */
const CANONICAL: Readonly<Record<string, string>> = {
  app: "Foundation\\Application",
  auth: "Auth\\Factory",
  "auth.driver": "Auth\\Guard",
  "auth.password": "Auth\\PasswordBrokerFactory",
  "auth.password.broker": "Auth\\PasswordBroker",
  cache: "Cache\\Factory",
  "cache.store": "Cache\\Repository",
  config: "Config\\Repository",
  cookie: "Cookie\\QueueingFactory",
  encrypter: "Encryption\\Encrypter",
  events: "Events\\Dispatcher",
  filesystem: "Filesystem\\Factory",
  "filesystem.disk": "Filesystem\\Filesystem",
  "filesystem.cloud": "Filesystem\\Cloud",
  "hash.driver": "Hashing\\Hasher",
  log: "Psr\\Log\\LoggerInterface",
  "mail.manager": "Mail\\Factory",
  mailer: "Mail\\Mailer",
  queue: "Queue\\Factory",
  "queue.connection": "Queue\\Queue",
  redis: "Redis\\Factory",
  "redis.connection": "Redis\\Connection",
  router: "Routing\\Registrar",
  "session.store": "Session\\Session",
  translator: "Translation\\Translator",
  url: "Routing\\UrlGenerator",
  validator: "Validation\\Factory",
  view: "View\\Factory",
  "Illuminate\\Broadcasting\\BroadcastManager": "Broadcasting\\Factory",
  "Illuminate\\Bus\\Dispatcher": "Bus\\QueueingDispatcher",
  "Illuminate\\Notifications\\ChannelManager": "Notifications\\Dispatcher",
};

/** The 12 core keys the spec names as their own canonical key. */
const OWN_KEYS: readonly string[] = ["blade.compiler", "cache.psr6", "db", "db.connection", "db.schema", "files", "hash", "image", "queue.failer", "redirect", "request", "session"];

/** The test's own view of the contract tokens, read from the subpath modules it imports. */
const TOKENS: ReadonlyMap<string, Token> = (() => {
  const modules: object[] = [auth, cache, foundation, mail, support, psr, broadcasting, bus, concurrency, config, consoleNs, container, cookie, database, debug, encryption, events, filesystem, hashing, http, image, jsonSchema, log, notifications, pagination, pipeline, processNs, queue, redis, routing, session, translation, validation, view];
  const tokens = new Map<string, Token>();
  for (const module of modules) {
    for (const value of Object.values(module)) {
      if (typeof value === "object" && value !== null && Object.hasOwn(value, CLASS_FQCN)) {
        tokens.set((value as Record<symbol, string>)[CLASS_FQCN] ?? "", value as Token);
      }
    }
  }
  return tokens;
})();

/** The token of a contract name relative to `Illuminate\Contracts\` (or a full `Psr\…` name). */
function tokenOf(name: string): Token {
  const full = name.startsWith("Psr\\") ? name : `Illuminate\\Contracts\\${name}`;
  const token = TOKENS.get(full) ?? null;
  Assert.assertNotNull(token, full);
  return token as Token;
}

/** A readable form of a resolver result: a token's FQCN in brackets, or the string. */
function show(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && Object.hasOwn(value, CLASS_FQCN)) {
    return `[${(value as Record<symbol, string>)[CLASS_FQCN]}]`;
  }
  return `(${typeof value})`;
}

/** An Upstream PHP file's namespace and `use` lines, and a resolver of a local class name to its FQCN. */
function resolverOf(source: string): (local: string) => string {
  const namespace = /^namespace\s+([^;]+);/m.exec(source)?.[1] ?? "";
  const uses = new Map<string, string>();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    uses.set(match[2] ?? shortName(match[1] ?? ""), match[1] ?? "");
  }
  return (local) => (local.startsWith("\\") ? local.slice(1) : (uses.get(local) ?? `${namespace}\\${local}`));
}

/** Every `*ServiceProvider.php` under `Illuminate`, as paths relative to it, in path order. */
function providerFiles(): string[] {
  return (readdirSync(ILLUMINATE, { recursive: true }) as string[])
    .map((path) => path.split("\\").join("/"))
    .filter((path) => path.endsWith("ServiceProvider.php"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `registerCoreContainerAliases`, parsed from `Application.php`. */
function upstreamCore(): Record<string, string[]> {
  const source = readFileSync(upstreamPath("Illuminate\\Foundation\\Application"), "utf8");
  const body = /function registerCoreContainerAliases\(\)[\s\S]*?foreach \(\[([\s\S]*?)\] as \$key => \$aliases\)/.exec(source)?.[1] ?? "";
  const core: Record<string, string[]> = {};
  for (const match of body.matchAll(/^\s*'([^']+)'\s*=>\s*\[([^\]]*)\],?$/gm)) {
    core[match[1] ?? ""] = (match[2] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => part.replace(/::class$/, ""))
      .map((part) => (part === "self" ? "Illuminate\\Foundation\\Application" : part.replace(/^\\/, "")));
  }
  return core;
}

/** The providers' string bindings outside `core`, each key → the class its closure builds. */
function upstreamBindings(core: Readonly<Record<string, readonly string[]>>): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const file of providerFiles()) {
    const source = readFileSync(join(ILLUMINATE, file), "utf8");
    const resolveName = resolverOf(source);
    for (const match of source.matchAll(/\$this->app->(?:singleton|bind|scoped)\(\s*'([^']+)'/g)) {
      const key = match[1] ?? "";
      if (Object.hasOwn(core, key)) {
        continue;
      }
      const built = /\bnew\s+(\\?[\w\\]+)/.exec(source.slice(match.index))?.[1] ?? "";
      Assert.assertNotSame("", built, `${file}: ${key}`);
      bindings[key] = resolveName(built);
    }
  }
  return bindings;
}

/** The providers' class-to-class `alias()` calls, `[abstract, alias]`. */
function upstreamAliases(): [string, string][] {
  const aliases: [string, string][] = [];
  for (const file of providerFiles()) {
    const source = readFileSync(join(ILLUMINATE, file), "utf8");
    const resolveName = resolverOf(source);
    for (const match of source.matchAll(/\$this->app->alias\(\s*(\\?[\w\\]+)::class\s*,\s*(\\?[\w\\]+)::class\s*\)/g)) {
      aliases.push([resolveName(match[1] ?? ""), resolveName(match[2] ?? "")]);
    }
  }
  return aliases;
}

/** The `LogicException` message `fn` throws, or what it threw instead. */
function logicMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof LogicException ? error.message : `not a LogicException: ${String(error)}`;
  }
  return "(nothing thrown)";
}

/** A three-part table with the given parts, the rest empty. */
function table(parts: Partial<AliasTable>): AliasTable {
  return { CORE_CONTAINER_ALIASES: {}, PROVIDER_BINDINGS: {}, PROVIDER_ALIASES: [], ...parts };
}

xaravelTest(
  "XT-contracts-10",
  "@xaravel/contracts/aliases exports Upstream's container aliases verbatim as frozen data: CORE_CONTAINER_ALIASES is registerCoreContainerAliases' 40 keys and their aliases in Upstream order, PROVIDER_BINDINGS the 15 string abstracts the service providers bind outside the core keys, each to the class its closure builds, and PROVIDER_ALIASES the providers' class-to-class alias() calls in file and line order (AD-1.3, AD-1.4)",
  () => {
    Assert.assertSame(40, Object.keys(CORE_CONTAINER_ALIASES).length);
    Assert.assertSame(JSON.stringify(BINDING_KEYS), JSON.stringify(Object.keys(PROVIDER_BINDINGS)));
    Assert.assertSame(5, PROVIDER_ALIASES.length);

    // Frozen, every level.
    Assert.assertTrue(Object.isFrozen(CORE_CONTAINER_ALIASES), "CORE_CONTAINER_ALIASES");
    for (const [key, aliases] of Object.entries(CORE_CONTAINER_ALIASES)) {
      Assert.assertTrue(Object.isFrozen(aliases), key);
    }
    Assert.assertTrue(Object.isFrozen(PROVIDER_BINDINGS), "PROVIDER_BINDINGS");
    Assert.assertTrue(Object.isFrozen(PROVIDER_ALIASES), "PROVIDER_ALIASES");
    for (const pair of PROVIDER_ALIASES) {
      Assert.assertTrue(Object.isFrozen(pair), pair.join(" => "));
    }

    // No FQCN keeps a leading `\`.
    const names = [...Object.values(CORE_CONTAINER_ALIASES).flat(), ...Object.values(PROVIDER_BINDINGS), ...PROVIDER_ALIASES.flat()];
    Assert.assertSame("[]", JSON.stringify(names.filter((name) => name.startsWith("\\"))));

    if (!upstreamOrWarn("aliases.test.ts")) {
      return;
    }
    const core = upstreamCore();
    Assert.assertSame(JSON.stringify(Object.entries(core)), JSON.stringify(Object.entries(CORE_CONTAINER_ALIASES)));
    Assert.assertSame(JSON.stringify(Object.entries(upstreamBindings(core))), JSON.stringify(Object.entries(PROVIDER_BINDINGS)));
    Assert.assertSame(JSON.stringify(upstreamAliases()), JSON.stringify(PROVIDER_ALIASES));
  },
);

xaravelTest(
  "XT-contracts-11",
  "canonicalToken(abstract) gives every service of the alias table one canonical token, the contract alias no other contract alias of the service extends, the first in Upstream order among unrelated siblings, and the service's string key when it has no contract (ESC-10.4-1 Option 1), so a key, any alias FQCN with or without a leading backslash, another contract token and a registered class all reach the one token the container binds (AD-1.3, AD-1.4); an abstract no service lists is returned unchanged, as Upstream's getAlias does, and an unregistered class throws fqcn()'s TypeError (AD-10)",
  () => {
    // The spec's literal canonical table.
    for (const [service, name] of Object.entries(CANONICAL)) {
      Assert.assertSame(tokenOf(name), canonicalToken(service), service);
    }
    for (const key of [...OWN_KEYS, ...BINDING_KEYS]) {
      Assert.assertSame(key, canonicalToken(key), key);
    }
    Assert.assertSame(40 + 15 + 3, Object.keys(CANONICAL).length + OWN_KEYS.length + BINDING_KEYS.length);

    // Every alias reaches its key's canonical token, so one instance.
    for (const [key, aliases] of Object.entries(CORE_CONTAINER_ALIASES)) {
      for (const alias of aliases) {
        Assert.assertSame(canonicalToken(key), canonicalToken(alias), `${key}: ${alias}`);
        Assert.assertSame(canonicalToken(key), canonicalToken(`\\${alias}`), `${key}: \\${alias}`);
        const token = TOKENS.get(alias);
        if (token !== undefined) {
          Assert.assertSame(canonicalToken(key), canonicalToken(token as never), `${key}: the ${alias} token`);
        }
      }
    }
    for (const [key, built] of Object.entries(PROVIDER_BINDINGS)) {
      Assert.assertSame(key, canonicalToken(built), `${key}: ${built}`);
    }
    for (const [abstract, alias] of PROVIDER_ALIASES) {
      Assert.assertSame(canonicalToken(abstract), canonicalToken(alias), `${abstract}: ${alias}`);
    }

    // The matrix rows.
    const cacheFactory = tokenOf("Cache\\Factory");
    Assert.assertSame(cacheFactory, canonicalToken("cache"));
    Assert.assertSame(cacheFactory, canonicalToken("Illuminate\\Cache\\CacheManager"));
    Assert.assertSame(cacheFactory, canonicalToken("\\Illuminate\\Cache\\CacheManager"));
    Assert.assertSame(tokenOf("Foundation\\Application"), canonicalToken(psr.ContainerInterface));
    Assert.assertSame(tokenOf("Mail\\Mailer"), canonicalToken("mailer"));
    Assert.assertSame(tokenOf("Mail\\Mailer"), canonicalToken(mail.MailQueue));
    Assert.assertSame("blade.compiler", canonicalToken("blade.compiler"));
    Assert.assertSame("blade.compiler", canonicalToken("Illuminate\\View\\Compilers\\BladeCompiler"));
    Assert.assertSame("migrator", canonicalToken("migrator"));
    Assert.assertSame("nope", canonicalToken("nope"));
    Assert.assertSame(support.Arrayable, canonicalToken(support.Arrayable));
    Assert.assertSame("\\nope", canonicalToken("\\nope"));

    // A class argument goes through fqcn(): a registered class reaches its service's token, an unregistered one throws.
    const AppContract = contract<object>("App\\Contract");
    const probeTable = table({ CORE_CONTAINER_ALIASES: { probe: ["App\\Probe", "App\\Contract"] } });
    const resolve = aliasResolver(probeTable, [AppContract]);
    class Probe {}
    class Unregistered {}
    runInRootFrame("test", () => {
      registerTestClass("App\\Probe", Probe);
      Assert.assertSame(AppContract, resolve(Probe));
      Assert.assertSame(AppContract, resolve("probe"));
      Assert.assertSame(AppContract, resolve(AppContract));
    });
    Assert.assertSame("fqcn(): the class is not registered; end its file with registerClass('<FQCN>', <Class>)", typeErrorOf(() => resolve(Unregistered)));

    // The rule applied to the parsed Upstream data.
    if (!upstreamOrWarn("aliases.test.ts")) {
      return;
    }
    const core = upstreamCore();
    const services: [string, string[], boolean][] = [];
    for (const [key, aliases] of Object.entries(core)) {
      services.push([key, aliases, true]);
    }
    for (const [key, built] of Object.entries(upstreamBindings(core))) {
      services.push([key, [built], true]);
    }
    for (const [abstract, alias] of upstreamAliases()) {
      const chain = services.find(([key, aliases]) => key === abstract || aliases.includes(abstract));
      if (chain === undefined) {
        services.push([abstract, [alias], false]);
      } else {
        chain[1].push(alias);
      }
    }
    Assert.assertSame(40 + 15 + 3, services.length);
    for (const [key, aliases, stringKey] of services) {
      const contracts = [key, ...aliases].map((name) => TOKENS.get(name)).filter((token): token is Token => token !== undefined);
      const expected = contracts.find((candidate) => !contracts.some((other) => other !== candidate && closure(other).includes(candidate))) ?? (stringKey ? key : null);
      Assert.assertSame(show(expected), show(canonicalToken(key)), key);
    }
  },
);

xaravelTest(
  "XT-contracts-12",
  "validateAliasTable(table) throws LogicException naming the alias for an alias of itself (Upstream Container::alias's message), an alias two services list, an alias in a ported contract namespace that @xaravel/contracts does not export, and an alias of a service with neither a contract nor a string key, which has no canonical contract (ESC-10.4-1 Option 1); aliasResolver validates its table, and Upstream's table validates (AD-1.3, AD-1.4)",
  () => {
    Assert.assertSame("(nothing thrown)", logicMessage(() => validateAliasTable({ CORE_CONTAINER_ALIASES, PROVIDER_BINDINGS, PROVIDER_ALIASES })));

    const noContract = table({ PROVIDER_ALIASES: [["App\\Manager", "App\\Concrete"]] });
    Assert.assertSame("[App\\Concrete] has no canonical contract.", logicMessage(() => validateAliasTable(noContract)));
    Assert.assertSame("[App\\Concrete] has no canonical contract.", logicMessage(() => aliasResolver(noContract)));

    const twoKeys = table({ CORE_CONTAINER_ALIASES: { a: ["App\\Shared"], b: ["App\\Shared"] } });
    Assert.assertSame("[App\\Shared] is aliased by two services, [a] and [b].", logicMessage(() => validateAliasTable(twoKeys)));
    const bindingAndCore = table({ CORE_CONTAINER_ALIASES: { a: ["App\\Shared"] }, PROVIDER_BINDINGS: { b: "App\\Shared" } });
    Assert.assertSame("[App\\Shared] is aliased by two services, [a] and [b].", logicMessage(() => validateAliasTable(bindingAndCore)));

    Assert.assertSame("[a] is aliased to itself.", logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { a: ["a"] } }))));
    Assert.assertSame("[App\\Thing] is aliased to itself.", logicMessage(() => validateAliasTable(table({ PROVIDER_ALIASES: [["App\\Thing", "App\\Thing"]] }))));

    const unexported = table({ CORE_CONTAINER_ALIASES: { x: ["App\\X", "Illuminate\\Contracts\\X"] } });
    Assert.assertSame("[Illuminate\\Contracts\\X] names a contract that @xaravel/contracts does not export.", logicMessage(() => validateAliasTable(unexported)));
    const unexportedPsr = table({ CORE_CONTAINER_ALIASES: { x: ["Psr\\Log\\Nope"] } });
    Assert.assertSame("[Psr\\Log\\Nope] names a contract that @xaravel/contracts does not export.", logicMessage(() => validateAliasTable(unexportedPsr)));

    // A string key with no contract, and a provider alias set with a contract, are valid.
    Assert.assertSame("(nothing thrown)", logicMessage(() => validateAliasTable(table({ CORE_CONTAINER_ALIASES: { k: ["App\\K"] }, PROVIDER_ALIASES: [["App\\M", "Illuminate\\Contracts\\Cache\\Factory"]] }))));
    const typed: ContractToken<object> = cache.Factory;
    Assert.assertSame(typed, aliasResolver(table({ PROVIDER_ALIASES: [["App\\M", "Illuminate\\Contracts\\Cache\\Factory"]] }))("App\\M"));
  },
);
