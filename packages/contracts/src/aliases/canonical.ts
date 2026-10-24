// Canonical tokens of the container alias table (AD-1.3, AD-1.4, ESC-10.4-1 Option 1).
//
// A service is a core key with its aliases, a provider binding's key with the one FQCN it builds, or a chain of the
// providers' `alias()` calls keyed by its first abstract FQCN (Bus's two calls make one service:
// `Bus\Dispatcher` → `Contracts\Bus\Dispatcher` → `Contracts\Bus\QueueingDispatcher`). A contract alias is a name of
// the service for which `@xaravel/contracts` exports a token. The service's canonical token is the contract alias that
// no other contract alias of the service has in its parents closure, the first in Upstream order when several
// qualify; a service with no contract alias keeps its string key, the key Upstream binds.
import { LogicException } from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { CLASS_FQCN, CONTRACT_PARENTS, type ContractToken } from "../Contract";
import * as root from "../index";
import * as auth from "../auth/index";
import * as authAccess from "../auth/access/index";
import * as authMiddleware from "../auth/middleware/index";
import * as broadcasting from "../broadcasting/index";
import * as bus from "../bus/index";
import * as cache from "../cache/index";
import * as concurrency from "../concurrency/index";
import * as config from "../config/index";
import * as consoleNs from "../console/index";
import * as container from "../container/index";
import * as cookie from "../cookie/index";
import * as database from "../database/index";
import * as databaseEloquent from "../database/eloquent/index";
import * as databaseEvents from "../database/events/index";
import * as databaseQuery from "../database/query/index";
import * as debug from "../debug/index";
import * as encryption from "../encryption/index";
import * as events from "../events/index";
import * as filesystem from "../filesystem/index";
import * as foundation from "../foundation/index";
import * as hashing from "../hashing/index";
import * as http from "../http/index";
import * as image from "../image/index";
import * as jsonSchema from "../json-schema/index";
import * as log from "../log/index";
import * as mail from "../mail/index";
import * as notifications from "../notifications/index";
import * as pagination from "../pagination/index";
import * as pipeline from "../pipeline/index";
import * as processNs from "../process/index";
import * as psr from "../psr/index";
import * as queue from "../queue/index";
import * as redis from "../redis/index";
import * as routing from "../routing/index";
import * as session from "../session/index";
import * as sessionMiddleware from "../session/middleware/index";
import * as support from "../support/index";
import * as translation from "../translation/index";
import * as validation from "../validation/index";
import * as view from "../view/index";
import * as table from "./table";

/** The three parts of an alias table, shaped as `./table`'s constants. */
export interface AliasTable {
  readonly CORE_CONTAINER_ALIASES: Readonly<Record<string, readonly string[]>>;
  readonly PROVIDER_BINDINGS: Readonly<Record<string, string>>;
  readonly PROVIDER_ALIASES: readonly (readonly [abstract: string, alias: string])[];
}

/** A container abstract, as Upstream's: a string (key or FQCN), a contract token or a registered class (AD-1.3). */
export type Abstract = string | ContractToken<object> | (abstract new (...args: never[]) => object);

/** `canonicalToken`'s shape: an abstract's canonical token or key, or the abstract unchanged when no service has it. */
export type AliasResolver = (abstract: Abstract) => Abstract;

/** The `@xaravel/contracts` modules whose exports are searched for contract tokens: every `exports` subpath. */
const MODULES: readonly object[] = [
  root,
  psr,
  support,
  container,
  config,
  foundation,
  pipeline,
  events,
  bus,
  queue,
  cache,
  redis,
  encryption,
  hashing,
  filesystem,
  processNs,
  translation,
  validation,
  debug,
  concurrency,
  jsonSchema,
  auth,
  authAccess,
  authMiddleware,
  broadcasting,
  consoleNs,
  cookie,
  database,
  databaseEloquent,
  databaseEvents,
  databaseQuery,
  http,
  image,
  log,
  mail,
  notifications,
  pagination,
  routing,
  session,
  sessionMiddleware,
  view,
];

/** The FQCN prefixes of the namespaces `@xaravel/contracts` ports: an alias under one of them must have a token. */
const CONTRACT_PREFIXES: readonly string[] = ["Illuminate\\Contracts\\", "Psr\\Container\\", "Psr\\SimpleCache\\", "Psr\\Log\\"];

/** Whether `value` is a contract token: a frozen, non-function object with an own `CLASS_FQCN` string. */
function isToken(value: unknown): value is ContractToken<object> {
  return typeof value === "object" && value !== null && Object.isFrozen(value) && Object.hasOwn(value, CLASS_FQCN) && typeof (value as Record<symbol, unknown>)[CLASS_FQCN] === "string";
}

/** Every contract token `@xaravel/contracts` exports, by FQCN. */
const TOKENS: ReadonlyMap<string, ContractToken<object>> = (() => {
  const tokens = new Map<string, ContractToken<object>>();
  for (const module of MODULES) {
    for (const value of Object.values(module)) {
      if (isToken(value)) {
        tokens.set(value[CLASS_FQCN], value);
      }
    }
  }
  return tokens;
})();

/** `token` and every contract in its parents' closure, each once. */
function parentsClosure(token: ContractToken<object>): Set<ContractToken<object>> {
  const seen = new Set<ContractToken<object>>();
  const walk = (current: ContractToken<object>): void => {
    if (seen.has(current)) {
      return;
    }
    seen.add(current);
    for (const parent of current[CONTRACT_PARENTS]) {
      walk(parent);
    }
  };
  walk(token);
  return seen;
}

/** One service of a table under construction. */
interface Service {
  readonly key: string;
  /** Whether the key is a string Upstream binds (a core key or a provider binding), not a provider alias's abstract. */
  readonly stringKey: boolean;
  readonly aliases: string[];
}

/** The services of `table`, and each name (key or alias) → its service; throws for a self alias or a shared alias. */
function servicesOf(table: AliasTable): { readonly services: Service[]; readonly byName: Map<string, Service> } {
  const services: Service[] = [];
  const byName = new Map<string, Service>();
  const claim = (name: string, service: Service): void => {
    const existing = byName.get(name);
    if (existing === service) {
      return;
    }
    if (existing !== undefined) {
      throw new LogicException(`[${name}] is aliased by two services, [${existing.key}] and [${service.key}].`);
    }
    byName.set(name, service);
    if (name !== service.key) {
      service.aliases.push(name);
    }
  };
  const open = (key: string, stringKey: boolean): Service => {
    const service: Service = { key, stringKey, aliases: [] };
    services.push(service);
    claim(key, service);
    return service;
  };
  const alias = (service: Service, name: string): void => {
    if (name === service.key) {
      throw new LogicException(`[${name}] is aliased to itself.`);
    }
    claim(name, service);
  };

  for (const [key, aliases] of Object.entries(table.CORE_CONTAINER_ALIASES)) {
    const service = open(key, true);
    for (const name of aliases) {
      alias(service, name);
    }
  }
  for (const [key, name] of Object.entries(table.PROVIDER_BINDINGS)) {
    alias(open(key, true), name);
  }
  for (const [abstract, name] of table.PROVIDER_ALIASES) {
    if (abstract === name) {
      throw new LogicException(`[${name}] is aliased to itself.`);
    }
    alias(byName.get(abstract) ?? open(abstract, false), name);
  }
  return { services, byName };
}

/** The canonical token of each service of `table` (ESC-10.4-1 Option 1), by every name the service has. */
function canonicalIndex(table: AliasTable, extraTokens: readonly ContractToken<object>[]): Map<string, ContractToken<object> | string> {
  const tokens = new Map(TOKENS);
  for (const token of extraTokens) {
    tokens.set(token[CLASS_FQCN], token);
  }
  const { services, byName } = servicesOf(table);
  const canonical = new Map<Service, ContractToken<object> | string>();
  for (const service of services) {
    const names = [service.key, ...service.aliases];
    const contracts: ContractToken<object>[] = [];
    for (const name of names) {
      const token = tokens.get(name);
      if (token !== undefined) {
        contracts.push(token);
      } else if (CONTRACT_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        throw new LogicException(`[${name}] names a contract that @xaravel/contracts does not export.`);
      }
    }
    const closures = contracts.map(parentsClosure);
    const mostSpecific = contracts.find((candidate) => !contracts.some((other, index) => other !== candidate && closures[index]?.has(candidate) === true)) ?? null;
    if (mostSpecific !== null) {
      canonical.set(service, mostSpecific);
    } else if (service.stringKey) {
      canonical.set(service, service.key);
    } else {
      throw new LogicException(`[${service.aliases[0] ?? service.key}] has no canonical contract.`);
    }
  }
  const index = new Map<string, ContractToken<object> | string>();
  for (const [name, service] of byName) {
    index.set(name, canonical.get(service) ?? service.key);
  }
  return index;
}

/**
 * Validates an alias table: throws `LogicException` naming the alias for an alias of itself, an alias two services
 * list, an `Illuminate\Contracts\`, `Psr\Container\`, `Psr\SimpleCache\` or `Psr\Log\` FQCN with no token, and an
 * alias of a service that has neither a contract alias nor a string key. `tokens` adds contract tokens that
 * `@xaravel/contracts` does not export (an application's own contracts).
 */
export function validateAliasTable(table: AliasTable, tokens: readonly ContractToken<object>[] = []): void {
  canonicalIndex(table, tokens);
}

/**
 * The `canonicalToken` function of `table`, which it validates first (`validateAliasTable`). `tokens` adds contract
 * tokens that `@xaravel/contracts` does not export (an application's own contracts).
 */
export function aliasResolver(table: AliasTable, tokens: readonly ContractToken<object>[] = []): AliasResolver {
  const index = canonicalIndex(table, tokens);
  return (abstract: Abstract): Abstract => {
    if (typeof abstract === "string") {
      return index.get(abstract.startsWith("\\") ? abstract.slice(1) : abstract) ?? abstract;
    }
    return index.get(fqcn(abstract)) ?? abstract;
  };
}

/**
 * The canonical token of `abstract` in Upstream's alias table: a `ContractToken`, or the service's string key when it
 * has no contract; an abstract no service lists is returned unchanged, as Upstream's `Container::getAlias` does. A
 * string may be a key or an FQCN with or without a leading `\`; a token or class goes through `fqcn()`, which throws
 * for an unregistered class (AD-10).
 */
export const canonicalToken: AliasResolver = aliasResolver(table);
