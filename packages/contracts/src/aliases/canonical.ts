// Canonical tokens of the container alias table (AD-1.3, AD-1.4, ESC-10.4-1 Option 1).
//
// A service is a core key with its aliases, a provider binding's key with the one FQCN it builds, or a chain of the
// providers' `alias()` calls keyed by its first abstract FQCN (Bus's two calls make one service:
// `Bus\Dispatcher` → `Contracts\Bus\Dispatcher` → `Contracts\Bus\QueueingDispatcher`). A contract alias is a name of
// the service for which `@xaravel/contracts` exports a token. The service's canonical token is the contract alias that
// no other contract alias of the service has in its parents closure, the first in Upstream order when several
// qualify; a service with no contract alias keeps its string key, the key Upstream binds.
//
// A table's names are read as queries are: one leading `\` is dropped from each key, alias, binding and abstract
// before the services are built, and a name is in a ported contract namespace when it starts with one of
// `CONTRACT_PREFIXES` ignoring ASCII case. Lookups stay case-sensitive, as Upstream's alias keys are strings, so a
// name that differs from an exported contract's FQCN only in letter case is refused.
import { LogicException } from "@xaravel/runtime/php";
import { fqcn, isContractToken } from "@xaravel/runtime/registry";
import { CLASS_FQCN, CONTRACT_PARENTS, type ContractToken, foldCase } from "../Contract";
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

/** `CONTRACT_PREFIXES` folded (`foldCase`), for the case-insensitive prefix test. */
const FOLDED_PREFIXES: readonly string[] = CONTRACT_PREFIXES.map(foldCase);

/** `name` without one leading `\`, as a query is read. */
function bare(name: string): string {
  return name.startsWith("\\") ? name.slice(1) : name;
}

/** Whether `value` is a contract token: runtime's `isContractToken` (MAINT-2026-10-24 Item 4), typed as a token. */
const isToken = isContractToken as (value: unknown) => value is ContractToken<object>;

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

/**
 * Whether `value` is a contract token all the way down: a token (`isToken`) with a function `Symbol.hasInstance` and a
 * `CONTRACT_PARENTS` list whose every entry is such a token. `checking` holds the tokens being walked, so a cycle ends.
 */
function isDeepToken(value: unknown, checking: Set<unknown> = new Set()): value is ContractToken<object> {
  if (!isToken(value) || typeof (value as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] !== "function") {
    return false;
  }
  if (checking.has(value)) {
    return true;
  }
  checking.add(value);
  const parents: unknown = (value as Record<symbol, unknown>)[CONTRACT_PARENTS];
  return Array.isArray(parents) && Array.from(parents as unknown[]).every((parent) => isDeepToken(parent, checking));
}

/** The package tokens by folded FQCN (`foldCase`), for the collision and case-variant tests. */
const FOLDED_TOKENS: ReadonlyMap<string, ContractToken<object>> = new Map([...TOKENS].map(([name, token]) => [foldCase(name), token]));

/**
 * The package tokens with `extraTokens` added. Throws a `TypeError` naming the index for an extra value that is not a
 * contract token (`isDeepToken`). Every token reachable from an extra token, itself and its parents' closure, whose
 * folded FQCN is already known (a package token, or one met earlier among the extras) must be that same object, else
 * a `LogicException` names its FQCN; the package's own token, or the same object again, is accepted.
 */
function withExtraTokens(extraTokens: readonly ContractToken<object>[]): Map<string, ContractToken<object>> {
  const tokens = new Map(TOKENS);
  const known = new Map(FOLDED_TOKENS);
  for (let index = 0; index < extraTokens.length; index++) {
    const token: unknown = extraTokens[index];
    if (!isDeepToken(token)) {
      throw new TypeError(`extra token ${index} is not a contract token.`);
    }
    for (const reached of parentsClosure(token)) {
      const name = reached[CLASS_FQCN];
      const folded = foldCase(name);
      const existing = known.get(folded);
      if (existing === undefined) {
        known.set(folded, reached);
      } else if (existing !== reached) {
        throw new LogicException(
          FOLDED_TOKENS.has(folded) ? `[${name}] is a contract that @xaravel/contracts exports; an extra token may not replace it.` : `[${name}] is named by two extra tokens.`,
        );
      }
    }
    tokens.set(token[CLASS_FQCN], token);
  }
  return tokens;
}

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

/**
 * The services of `table`, and each name (key or alias) → its service, each name without one leading `\`; throws for a
 * self alias or a shared alias.
 */
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
    const service = open(bare(key), true);
    for (const name of aliases) {
      alias(service, bare(name));
    }
  }
  for (const [key, name] of Object.entries(table.PROVIDER_BINDINGS)) {
    alias(open(bare(key), true), bare(name));
  }
  for (const [rawAbstract, rawName] of table.PROVIDER_ALIASES) {
    const abstract = bare(rawAbstract);
    const name = bare(rawName);
    if (abstract === name) {
      throw new LogicException(`[${name}] is aliased to itself.`);
    }
    alias(byName.get(abstract) ?? open(abstract, false), name);
  }
  return { services, byName };
}

/** The canonical token of each service of `table` (ESC-10.4-1 Option 1), by every name the service has. */
function canonicalIndex(table: AliasTable, extraTokens: readonly ContractToken<object>[]): Map<string, ContractToken<object> | string> {
  const tokens = withExtraTokens(extraTokens);
  const { services, byName } = servicesOf(table);
  const canonical = new Map<Service, ContractToken<object> | string>();
  for (const service of services) {
    const names = [service.key, ...service.aliases];
    const contracts: ContractToken<object>[] = [];
    for (const name of names) {
      const token = tokens.get(name);
      if (token !== undefined) {
        contracts.push(token);
      } else if (FOLDED_TOKENS.has(foldCase(name))) {
        const exported = (FOLDED_TOKENS.get(foldCase(name)) as ContractToken<object>)[CLASS_FQCN];
        throw new LogicException(`[${name}] differs only in letter case from the exported contract [${exported}]; alias lookups are case-sensitive.`);
      } else if (FOLDED_PREFIXES.some((prefix) => foldCase(name).startsWith(prefix))) {
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
 * Validates an alias table, each name read without one leading `\`: throws `LogicException` naming the alias for an
 * alias of itself, an alias two services list, an `Illuminate\Contracts\`, `Psr\Container\`, `Psr\SimpleCache\` or
 * `Psr\Log\` FQCN (prefix matched ignoring case) with no token, and an alias of a service that has neither a contract
 * alias nor a string key. `tokens` adds contract tokens that `@xaravel/contracts` does not export (an application's
 * own contracts): a value that is not a contract token, its parents checked recursively, throws a `TypeError` naming
 * its index, and a token whose FQCN equals, ignoring case, one the package exports or another extra token's throws a
 * `LogicException` naming the FQCN (the same object listed twice is not a collision).
 */
export function validateAliasTable(table: AliasTable, tokens: readonly ContractToken<object>[] = []): void {
  canonicalIndex(table, tokens);
}

/**
 * The `canonicalToken` function of `table`, which it validates first, with its `tokens`, and throws as
 * `validateAliasTable` does. `tokens` adds contract tokens that `@xaravel/contracts` does not export (an application's
 * own contracts). Lookups are case-sensitive; a string query drops one leading `\`, as the table's names do.
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
 * for an unregistered class (AD-10); any other value, such as `{}` or `42`, throws `fqcn()`'s error (XT-contracts-19).
 */
export const canonicalToken: AliasResolver = aliasResolver(table);
