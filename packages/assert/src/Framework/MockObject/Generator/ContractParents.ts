// The parents walk of a contract token (ESC-10.1-6) and the methods a double of it takes (ESC-10.2-4), shared by
// PHPUnit's Generator here and by @xaravel/mockery's DoubleTarget, so both test doubles of a contract carry the same
// brands and the same methods (Epic 4 lesson: one implementation).
//
// A token's parents are the contracts at `token[Symbol.for('xaravel.contract.parents')]` (each a token object or a
// bare symbol; absent or `null` is none), and their parents in turn, walked depth-first, each contract once,
// cycle-safe. A bare symbol is its own brand; a token object's brand is `Symbol.for(<its name>)`, the name read by
// the caller's own target-name rule.
//
// A token's methods (ESC-10.2-4, approved option 1, and its 2026-10-23 clarification): its own names at
// `Symbol.for('xaravel.contract.methods')`, then its built-ins at `Symbol.for('xaravel.contract.builtins')` (PHP
// names: `count`, `offsetGet`, `getIterator`, `__toString`, …; absent or `null` is none), then, for each token in its
// parents closure (walk order), that token's own methods and built-ins. Each name is listed once, the first wins,
// compared case-insensitively as PHP compares method names. A name is a built-in when any token of the closure lists
// it as one, even when the first listing is a plain method (a redeclared built-in keeps that first listing's
// declaring class). A method's declaring class is the token that lists it; a built-in's is its PHP interface
// (`count` → `Countable`, `offset*` → `ArrayAccess`, `getIterator` → `IteratorAggregate`, `__toString` →
// `Stringable`), any other built-in's the token that lists it. A bare-symbol parent lists no methods.
//
// The JS protocols of a double's built-ins (`defineContractProtocols`, also shared): with `getIterator`, the
// double's `[Symbol.iterator]()` iterates what `getIterator` returns (null iterates nothing; a value that is not
// iterable throws PHP's TypeError); with `__toString`, its `[Symbol.toPrimitive]()` and (when wired) `toString()`
// return what `__toString` returns. The `count` and `offset*` built-ins get no JS protocol, only their methods.

const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** The PHP interface that declares each built-in method, by lower-cased name. */
const BUILTIN_INTERFACES: ReadonlyMap<string, string> = new Map([
  ["count", "Countable"],
  ["offsetexists", "ArrayAccess"],
  ["offsetget", "ArrayAccess"],
  ["offsetset", "ArrayAccess"],
  ["offsetunset", "ArrayAccess"],
  ["getiterator", "IteratorAggregate"],
  ["__tostring", "Stringable"],
]);

/** One method of a double of a contract token. */
export interface ContractMethod {
  /** The method name, as the declaring token lists it. */
  readonly name: string;
  /** The token that declares it, or null for a built-in a PHP interface declares. */
  readonly contract: object | null;
  /** The FQCN of the declaring token, or of the built-in's PHP interface. */
  readonly declaringName: string;
  /** Whether any token in the closure lists it as a built-in (even when the first listing is a plain method). */
  readonly builtin: boolean;
}

/** A contract token object: it has a `Symbol.hasInstance` (an AD-1 token). */
export function isContractToken(value: unknown): value is object {
  return typeof value === "object" && value !== null && typeof (value as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function";
}

/** One contract of a parents closure: a token object with its name, or a bare symbol with a null name. */
interface ClosureEntry {
  readonly contract: object | symbol;
  readonly name: string | null;
}

/**
 * The parents closure of `token`, in walk order, each contract once; `token` and a bare symbol equal to `ownBrand`
 * are not in it. Throws a TypeError for a parents value that is not an iterable of contract tokens.
 */
function parentsClosure(token: object, ownBrand: symbol, nameOf: (token: object) => string): ClosureEntry[] {
  const closure: ClosureEntry[] = [];
  const visited = new Set<unknown>([token, ownBrand]);
  const walk = (contract: object, name: string): void => {
    const parents: unknown = (contract as Record<symbol, unknown>)[CONTRACT_PARENTS];
    if (parents === undefined || parents === null) {
      return;
    }
    if (typeof (parents as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      throw new TypeError(`${name}: [Symbol.for('xaravel.contract.parents')] must be an iterable of contract tokens`);
    }
    for (const parent of parents as Iterable<unknown>) {
      if (typeof parent !== "symbol" && !isContractToken(parent)) {
        throw new TypeError(`${name}: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got ${parent === null ? "null" : typeof parent}`);
      }
      if (visited.has(parent)) {
        continue;
      }
      visited.add(parent);
      const parentName = typeof parent === "symbol" ? null : nameOf(parent);
      closure.push({ contract: parent, name: parentName });
      if (parentName !== null) {
        walk(parent as object, parentName);
      }
    }
  };
  walk(token, nameOf(token));
  return closure;
}

/**
 * The brands of the contracts `token` extends, `ownBrand` excluded (a cycle back to `token` adds nothing), in walk
 * order. `nameOf` names a token object as the calling package names a target. Throws a TypeError for a parents value
 * that is not an iterable of contract tokens.
 */
export function contractParentBrands(token: object, ownBrand: symbol, nameOf: (token: object) => string): symbol[] {
  const brands: symbol[] = [];
  for (const { contract, name } of parentsClosure(token, ownBrand, nameOf)) {
    const brand = name === null ? (contract as symbol) : Symbol.for(name);
    if (brand !== ownBrand && !brands.includes(brand)) {
      brands.push(brand);
    }
  }
  return brands;
}

/** The method names at `contract[Symbol.for(key)]`; absent or `null` is none. Throws a TypeError for anything else. */
function namesAt(contract: object, name: string, key: string): string[] {
  const declared: unknown = (contract as Record<symbol, unknown>)[Symbol.for(key)];
  if (declared === undefined || declared === null) {
    return [];
  }
  if (typeof (declared as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
    throw new TypeError(`${name}: [Symbol.for('${key}')] must be an iterable of method names`);
  }
  const names: string[] = [];
  for (const method of declared as Iterable<unknown>) {
    if (typeof method !== "string") {
      throw new TypeError(`${name}: [Symbol.for('${key}')] must hold method names, got ${typeof method}`);
    }
    names.push(method);
  }
  return names;
}

/**
 * Every method a double of `token` takes (see the header): its own, its built-ins, then each parent's own and
 * built-ins, each name once (the first wins, compared case-insensitively). `nameOf` names a token object as the
 * calling package names a target. Throws a TypeError for a methods or built-ins value that is not an iterable of
 * method names, or a parents value that is not an iterable of contract tokens.
 */
export function contractMethods(token: object, nameOf: (token: object) => string): ContractMethod[] {
  const methods: { -readonly [K in keyof ContractMethod]: ContractMethod[K] }[] = [];
  const seen = new Map<string, number>();
  const add = (contract: object, name: string): void => {
    for (const method of namesAt(contract, name, "xaravel.contract.methods")) {
      const lower = method.toLowerCase();
      if (!seen.has(lower)) {
        seen.set(lower, methods.length);
        methods.push({ name: method, contract, declaringName: name, builtin: false });
      }
    }
    for (const method of namesAt(contract, name, "xaravel.contract.builtins")) {
      const lower = method.toLowerCase();
      const index = seen.get(lower);
      if (index !== undefined) {
        // Built-in status is the union over the closure: a token that redeclares a built-in as a plain method (as
        // Laravel's `Enumerable` redeclares `IteratorAggregate::getIterator`) keeps its declaration, and the
        // method stays a built-in.
        methods[index]!.builtin = true;
        continue;
      }
      seen.set(lower, methods.length);
      const declaring = BUILTIN_INTERFACES.get(lower);
      methods.push(declaring === undefined ? { name: method, contract, declaringName: name, builtin: true } : { name: method, contract: null, declaringName: declaring, builtin: true });
    }
  };
  const name = nameOf(token);
  add(token, name);
  for (const parent of parentsClosure(token, Symbol.for(name), nameOf)) {
    if (parent.name !== null) {
      add(parent.contract as object, parent.name);
    }
  }
  return methods;
}

/** What `getIterator` returned, iterated as PHP's `foreach` does: null iterates nothing; a non-iterable throws. */
function iteratorOf(className: string, value: unknown): Iterator<unknown> {
  if (value === null || value === undefined) {
    return [][Symbol.iterator]();
  }
  if ((typeof value === "object" || typeof value === "function") && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    return (value as Iterable<unknown>)[Symbol.iterator]();
  }
  throw new TypeError(`Objects returned by ${className}::getIterator() must be traversable or implement interface Iterator`);
}

/** Defines `fn` as a non-enumerable, writable, configurable method `key` of `prototype`, named `label`. */
function defineProtocol(prototype: object, key: string | symbol, label: string, fn: (this: object) => unknown): void {
  Object.defineProperty(fn, "name", { value: label });
  Object.defineProperty(prototype, key, { value: fn, writable: true, enumerable: false, configurable: true });
}

/** The doubled methods that back a double's JS protocols (see the header); null is none. */
export interface ContractProtocols {
  /** The doubled built-in `getIterator`'s name, or null. */
  readonly getIterator: string | null;
  /** The doubled built-in `__toString`'s name, or null. */
  readonly toString: string | null;
  /** Whether `toString()` calls `__toString` too (no doubled `toString`). */
  readonly wireToString: boolean;
}

/**
 * Defines the JS protocols of a double's built-ins on `prototype` (see the header): `[Symbol.iterator]` through
 * `getIterator`, `[Symbol.toPrimitive]` and (with `wireToString`) `toString` through `toString`. `className` names
 * the double in the iterator's TypeError.
 */
export function defineContractProtocols(prototype: object, className: string, protocols: ContractProtocols): void {
  const { getIterator, toString, wireToString } = protocols;
  if (getIterator !== null) {
    defineProtocol(prototype, Symbol.iterator, "[Symbol.iterator]", function (this: object) {
      return iteratorOf(className, (this as Record<string, () => unknown>)[getIterator]!());
    });
  }
  if (toString !== null) {
    const stringOf = (): ((this: object) => unknown) =>
      function (this: object): unknown {
        return (this as Record<string, () => unknown>)[toString]!();
      };
    if (wireToString) {
      defineProtocol(prototype, "toString", "toString", stringOf());
    }
    defineProtocol(prototype, Symbol.toPrimitive, "[Symbol.toPrimitive]", stringOf());
  }
}
