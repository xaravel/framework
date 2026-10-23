// A target of `Double.for()`, read once: what PHP's ClassGenerator and DoubleState reflect. Internal.
//
// - A class: its FQCN is its `Symbol.for('xaravel.class.fqcn')` brand, else its JS name. Its instance methods are
//   the function-valued, string-keyed data members of its prototype chain up to `Object.prototype`, without
//   `constructor`; its static methods the function-valued members of its constructor chain. TS has no `final`,
//   visibility or reflection (DIV-6 php-only, ESC-4.8-1 item 3), so every one of them is doubleable.
// - A contract token, as Mockery takes one (ESC-4.5-1 item 3): a symbol `Symbol.for('<FQCN>')`, or an AD-1 token
//   object whose `Symbol.hasInstance` reads the brand `Symbol.for('<FQCN>')` (its FQCN is its own
//   `Symbol.for('xaravel.class.fqcn')`, else the description of its brand: its own registered symbol key outside the
//   `xaravel.*` protocol keys; a token with neither throws InvalidDoubleTargetException). Its methods are the names at
//   `token[Symbol.for('xaravel.contract.methods')]`; a bare symbol carries no list, so any method name is
//   configurable on it, as on a Mockery token mock. A token is an interface: it has no method bodies.
//   A token's parents (ESC-10.1-6): the contracts at `token[Symbol.for('xaravel.contract.parents')]` (each a token
//   object or a bare symbol; absent or `null` is none) and their parents in turn, walked depth-first, each contract
//   once, cycle-safe. Each parent's brand is read by the same rule as a target's own (a bare symbol is its own
//   brand), and the generated class carries them all (`parentBrands`), so a double of a child contract is
//   `instanceof` every contract it extends, as a PHP mock of a child interface is. Only brands are added: the
//   doubled methods stay the token's own list. The parents are read once, when the target is first read (a token's
//   parents are fixed, as contract() freezes them). The walk is @xaravel/assert's `contractParentBrands`, which
//   PHPUnit's doubles share, with this file's `tokenName` naming each token.
//
// Parameter names are read from a method's source (`a`, `a = 1` and `...rest` name `$a` and `$rest`; a destructured
// parameter is named by its position), as @xaravel/assert's test doubles read them (ESC-4.7-1 item 2). A token's
// methods carry none.
import { contractParentBrands } from "@xaravel/assert";
import { classNameOf, FQCN, isClass } from "../../../support/values";
import { InvalidDoubleTargetException } from "../Exceptions/InvalidDoubleTargetException";

type AnyClass = abstract new (...args: never[]) => object;

/** An AD-1 contract token object. */
export interface ContractToken {
  readonly [Symbol.hasInstance]: (value: unknown) => boolean;
}

/** What `Double.for()` takes as a target besides a real instance. */
export type TargetInput = AnyClass | symbol | ContractToken;

const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const STATIC_SKIP: ReadonlySet<string> = new Set(["length", "name", "prototype", "caller", "arguments"]);
const IDENTIFIER = /^[A-Za-z_$][\w$]*/;
/** ClassGenerator's reserved verbs: never a method of a bare symbol token. */
const RESERVED: ReadonlySet<string> = new Set(["instance", "expects", "allows", "strict", "passthru", "received", "unused", "verify", "constructor"]);

/** A contract token object (not a class, not a symbol). */
export function isContractToken(value: unknown): value is ContractToken {
  return typeof value === "object" && value !== null && typeof (value as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function";
}

/** A token object's FQCN: its own `Symbol.for('xaravel.class.fqcn')`, else its registered brand's key. */
function tokenName(token: ContractToken): string {
  const fqcn: unknown = (token as unknown as Record<symbol, unknown>)[FQCN];
  const brand = Object.getOwnPropertySymbols(token).find((key) => {
    const registered = Symbol.keyFor(key);
    return registered !== undefined && registered !== "" && !registered.startsWith("xaravel.");
  });
  const name = typeof fqcn === "string" && fqcn !== "" ? fqcn : (brand?.description ?? "");
  if (name === "") {
    throw new InvalidDoubleTargetException("(contract token)", "it carries no FQCN: neither Symbol.for('xaravel.class.fqcn') nor a brand Symbol.for('<FQCN>')");
  }
  return name;
}

/** The source of `list` split on its top-level commas (brackets, strings, template literals and comments skipped). */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    const char = list[index]!;
    if (char === "'" || char === '"' || char === "`") {
      for (index++; index < list.length && list[index] !== char; index++) {
        if (list[index] === "\\") {
          index++;
        }
      }
    } else if (char === "/" && list[index + 1] === "*") {
      index = Math.max(index, list.indexOf("*/", index + 2) + 1);
    } else if (char === "/" && list[index + 1] === "/") {
      const end = list.indexOf("\n", index);
      index = end === -1 ? list.length : end;
    } else if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    } else if (char === "," && depth === 0) {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** The parameter list source of a method: between its first `(` and the matching `)`. */
function parameterSource(fn: (...args: never[]) => unknown): string {
  const source = Function.prototype.toString.call(fn);
  const open = source.indexOf("(");
  if (open === -1) {
    return "";
  }
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const char = source[index]!;
    if (char === "'" || char === '"' || char === "`") {
      for (index++; index < source.length && source[index] !== char; index++) {
        if (source[index] === "\\") {
          index++;
        }
      }
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }
  return "";
}

export class DoubleTarget {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\DoubleTarget";

  /** The FQCN, as PHP's class-string. */
  readonly name: string;
  /** The class, or null for a token. */
  readonly ctor: AnyClass | null;
  /** The token's brand `Symbol.for('<FQCN>')`, or null for a class. */
  readonly brand: symbol | null;
  /** The brands of every contract a token extends, own brand excluded; empty for a class and a bare symbol. */
  readonly parentBrands: readonly symbol[];
  readonly #token: ContractToken | null;
  /** A token's method names, or null for a bare symbol (any name). */
  readonly #tokenMethods: readonly string[] | null;

  private constructor(name: string, ctor: AnyClass | null, brand: symbol | null, token: ContractToken | null, tokenMethods: readonly string[] | null, parentBrands: readonly symbol[] = []) {
    this.name = name;
    this.ctor = ctor;
    this.brand = brand;
    this.parentBrands = Object.freeze([...parentBrands]);
    this.#token = token;
    this.#tokenMethods = tokenMethods;
  }

  /** The target for a class, a symbol or a token object, or null when `input` is none of them. */
  static of(input: unknown): DoubleTarget | null {
    const known = typeof input === "symbol" ? symbolCache.get(input) : typeof input === "function" || (typeof input === "object" && input !== null) ? cache.get(input) : undefined;
    if (known !== undefined) {
      return known;
    }
    let target: DoubleTarget | null = null;
    if (isClass(input)) {
      target = new DoubleTarget(classNameOf(input) ?? "class@anonymous", input, null, null, null);
    } else if (typeof input === "symbol") {
      target = new DoubleTarget(input.description ?? "", null, input, null, null);
    } else if (isContractToken(input)) {
      const name = tokenName(input);
      const declared: unknown = (input as unknown as Record<symbol, unknown>)[CONTRACT_METHODS];
      const methods: string[] = [];
      if (declared !== undefined && declared !== null) {
        if (typeof (declared as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
          throw new TypeError(`${name}: [Symbol.for('xaravel.contract.methods')] must be an iterable of method names`);
        }
        for (const method of declared as Iterable<unknown>) {
          if (typeof method !== "string") {
            throw new TypeError(`${name}: [Symbol.for('xaravel.contract.methods')] must hold method names, got ${typeof method}`);
          }
          methods.push(method);
        }
      }
      const brand = Symbol.for(name);
      target = new DoubleTarget(name, null, brand, input, methods, contractParentBrands(input, brand, (token) => tokenName(token as ContractToken)));
    }
    if (target !== null) {
      if (typeof input === "symbol") {
        symbolCache.set(input, target);
      } else {
        cache.set(input as object, target);
      }
    }
    return target;
  }

  /** A token: an interface, with no method bodies. */
  isInterface(): boolean {
    return this.ctor === null;
  }

  /** A bare symbol token: any method name is configurable. */
  acceptsAnyMethod(): boolean {
    return this.ctor === null && this.#tokenMethods === null;
  }

  /** The short name: after the last `\`. */
  shortName(): string {
    return this.name.slice(this.name.lastIndexOf("\\") + 1);
  }

  /** Every instance method name, own members first, in declaration order. */
  instanceMethods(): string[] {
    if (this.ctor === null) {
      return [...(this.#tokenMethods ?? [])];
    }
    const names: string[] = [];
    for (let prototype: unknown = this.ctor.prototype; typeof prototype === "object" && prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (key !== "constructor" && !names.includes(key) && descriptor !== undefined && typeof descriptor.value === "function") {
          names.push(key);
        }
      }
    }
    return names;
  }

  /** Every static method name of the class chain. */
  staticMethods(): string[] {
    if (this.ctor === null) {
      return [];
    }
    const names: string[] = [];
    for (let ctor: unknown = this.ctor; typeof ctor === "function" && ctor !== Function.prototype; ctor = Object.getPrototypeOf(ctor)) {
      for (const key of Object.getOwnPropertyNames(ctor)) {
        const descriptor = Object.getOwnPropertyDescriptor(ctor, key);
        if (!STATIC_SKIP.has(key) && !names.includes(key) && descriptor !== undefined && typeof descriptor.value === "function") {
          names.push(key);
        }
      }
    }
    return names;
  }

  /** Every method name, as Reflection's `getMethods()` lists it (instance and static). */
  methodNames(): string[] {
    const names = this.instanceMethods();
    for (const name of this.staticMethods()) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
    return names;
  }

  /** PHP's `method_exists`. */
  declares(method: string): boolean {
    if (this.acceptsAnyMethod()) {
      return !RESERVED.has(method);
    }
    return this.instanceMethods().includes(method) || this.staticMethods().includes(method);
  }

  /** Whether `method` is static only (no instance method of that name). */
  isStatic(method: string): boolean {
    return !this.instanceMethods().includes(method) && this.staticMethods().includes(method);
  }

  /** The method's real body on the class chain, or null (a token has none). */
  realMethod(method: string): ((...args: unknown[]) => unknown) | null {
    if (this.ctor === null) {
      return null;
    }
    for (let prototype: unknown = this.ctor.prototype; typeof prototype === "object" && prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (descriptor !== undefined) {
        return typeof descriptor.value === "function" ? (descriptor.value as (...args: unknown[]) => unknown) : null;
      }
    }
    return null;
  }

  /** The FQCN of the class that declares `method` (Reflection's `getDeclaringClass()`); a token's own name. */
  declaringClassName(method: string): string {
    if (this.ctor === null) {
      return this.name;
    }
    for (let prototype: unknown = this.ctor.prototype; typeof prototype === "object" && prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.hasOwn(prototype, method)) {
        return classNameOf((prototype as { constructor?: unknown }).constructor) ?? this.name;
      }
    }
    for (let ctor: unknown = this.ctor; typeof ctor === "function" && ctor !== Function.prototype; ctor = Object.getPrototypeOf(ctor)) {
      if (Object.hasOwn(ctor, method)) {
        return classNameOf(ctor) ?? this.name;
      }
    }
    return this.name;
  }

  /** The declared parameter names of `method`, from its source; none for a token. */
  parameterNames(method: string): string[] {
    const fn = this.realMethod(method);
    if (fn === null) {
      return [];
    }
    return splitTopLevel(parameterSource(fn)).map((part, index) => IDENTIFIER.exec(part.replace(/^\.\.\./, ""))?.[0] ?? `arg${String(index)}`);
  }

  /** PHP's `$value instanceof <target>`. */
  isInstance(value: unknown): boolean {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    if (this.ctor !== null) {
      return value instanceof this.ctor;
    }
    if ((value as Record<symbol, unknown>)[this.brand!] === true) {
      return true;
    }
    return this.#token !== null && this.#token[Symbol.hasInstance](value);
  }
}

const cache = new WeakMap<object, DoubleTarget>();
const symbolCache = new Map<symbol, DoubleTarget>();
