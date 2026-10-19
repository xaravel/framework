// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Generator\Generator` (Story 4.7),
// as far as `createMock`, `createStub`, `createPartialMock` and `getMockBuilder`
// need it: it makes the test double class of a target and one instance of it.
//
// - Targets. A class: the double class `extends` it, so `instanceof` holds,
//   and its methods are the function-valued, string-keyed members of its
//   prototype chain up to the first built-in prototype, without `constructor`
//   and accessors. A contract token (AD-1: an object with `Symbol.hasInstance`)
//   or a bare symbol: the double class is a fresh class carrying the token's
//   brand getter `get [Symbol.for('<FQCN>')]() { return true }`, and its methods
//   are the names at `token[Symbol.for('xaravel.contract.methods')]` (a bare
//   symbol carries none; ESC-4.7-1 item 5).
// - Names in messages. The target's `Symbol.for("xaravel.class.fqcn")`, else
//   its JS `name`; a symbol's `description`.
// - Doubled methods. Each is an own member of the double class's prototype
//   that builds an Invocation and calls the double's InvocationHandler. Its
//   parameters are read from the method's source (`x` and `x = default` are
//   `$x`; a trailing `...rest` is the variadic, not a declared parameter; a
//   destructured parameter is named by its index; ESC-4.7-1 item 2). The Invocation holds every declared parameter, an
//   omitted one as `null`, then the extra arguments, as PHPUnit's generated
//   method collects them. A method that is not doubled stays the target's.
// - API. `method()` on every double, `expects()` on mock objects only; every
//   internal is symbol-keyed. A target with a method named `method` is
//   refused, as PHPUnit refuses it.
// - Construction. Without the original constructor the instance is
//   `Object.create(Double.prototype)`: no constructor and no field initializer
//   runs. With it, `Reflect.construct` runs the target's constructor with the
//   arguments; a doubled method it calls returns `null`, as PHPUnit's does
//   before the double has matchers.
import { randomBytes } from "node:crypto";
import { classNameOfClass } from "../../../comparison/PhpValues";
import { ConfigurableMethod } from "../ConfigurableMethod";
import { MethodNamedMethodException } from "../Exception/MethodNamedMethodException";
import { Invocation } from "../Runtime/Invocation";
import { InvocationHandler } from "../Runtime/InvocationHandler";
import { AnyInvokedCount } from "../Runtime/Rule/AnyInvokedCount";
import { InvocationOrder } from "../Runtime/Rule/InvocationOrder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
/** The double's InvocationHandler, on the instance. */
const HANDLER = Symbol("PHPUnit\\Framework\\MockObject\\InvocationHandler");
/** The double's configuration, on the double class's prototype. */
const DOUBLE = Symbol("PHPUnit\\Framework\\MockObject\\TestDoubleState");
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

type AnyClass = abstract new (...args: never[]) => unknown;

/** What a test double can be made of: a class, a contract token, or a bare contract symbol. */
export type DoubleTarget = AnyClass | { readonly [Symbol.hasInstance]: (value: unknown) => boolean } | symbol;

interface DoubleConfiguration {
  readonly className: string;
  readonly isMockObject: boolean;
  readonly configurableMethods: readonly ConfigurableMethod[];
}

/** A read target. */
export interface TargetType {
  readonly name: string;
  /** The class the double class extends, or null for a token. */
  readonly parent: AnyClass | null;
  /** Every method of the target, in declaration order (own members first). */
  readonly methods: ReadonlyMap<string, ConfigurableMethod>;
  /** The brand getter a token's `Symbol.hasInstance` reads, or null for a class. */
  readonly brand: symbol | null;
}

function isNative(fn: unknown): boolean {
  return typeof fn === "function" && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
}

/** `list` split on its top-level commas: `()`, `[]` and `{}` nesting, string and template quotes and comments are skipped. */
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
    } else if (char === "/" && list[index + 1] === "/") {
      const end = list.indexOf("\n", index);
      index = end === -1 ? list.length : end;
    } else if (char === "/" && list[index + 1] === "*") {
      const end = list.indexOf("*/", index + 2);
      index = end === -1 ? list.length : end + 1;
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
  return parts;
}

/** `part` without comments, trimmed. */
function stripComments(part: string): string {
  return part.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim();
}

/**
 * The declared parameters of `fn`'s source, as PHP reflects them: a plain name or `name = default` is `$name`; a
 * trailing `...rest` is the variadic, which is not a declared parameter; a destructured parameter is counted and
 * named by its index. A native or unreadable function counts by `length`, with no names.
 */
export function parameterInfo(fn: (...args: never[]) => unknown): { count: number; names: string[] } {
  const fallback = { count: fn.length, names: [] as string[] };
  if (isNative(fn)) {
    return fallback;
  }
  const source = Function.prototype.toString.call(fn);
  const open = source.indexOf("(");
  if (open === -1) {
    return fallback;
  }
  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close === -1) {
    return fallback;
  }
  const parts = splitTopLevel(source.slice(open + 1, close)).map(stripComments);
  if (parts.length > 0 && parts.at(-1) === "") {
    parts.pop();
  }
  if (parts.at(-1)?.startsWith("...") === true) {
    parts.pop();
  }
  const names: string[] = [];
  for (const part of parts) {
    const name = splitDefault(part);
    if (!IDENTIFIER.test(name)) {
      // Destructuring (or anything else unreadable): every parameter is named by its index.
      return { count: parts.length, names: [] };
    }
    names.push(`$${name}`);
  }
  return { count: names.length, names };
}

/** `part` without a top-level `= default`. */
function splitDefault(part: string): string {
  const at = part.indexOf("=");
  return (at === -1 ? part : part.slice(0, at)).trim();
}

function configurable(name: string, fn: (...args: never[]) => unknown): ConfigurableMethod {
  const { count, names } = parameterInfo(fn);
  return new ConfigurableMethod(name, count, names);
}

/** Reads a double target. Throws a TypeError for anything else. */
export function readTarget(type: unknown): TargetType {
  if (typeof type === "function") {
    const methods = new Map<string, ConfigurableMethod>();
    for (let prototype: unknown = (type as { prototype?: unknown }).prototype; typeof prototype === "object" && prototype !== null; prototype = Object.getPrototypeOf(prototype)) {
      if (prototype === Object.prototype || isNative((prototype as { constructor?: unknown }).constructor)) {
        break;
      }
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (key === "constructor" || methods.has(key) || descriptor === undefined || typeof descriptor.value !== "function") {
          continue;
        }
        methods.set(key, configurable(key, descriptor.value as (...args: never[]) => unknown));
      }
    }
    return { name: classNameOfClass(type), parent: type as AnyClass, methods, brand: null };
  }
  if (typeof type === "symbol") {
    return { name: type.description ?? "", parent: null, methods: new Map(), brand: type };
  }
  if (typeof type === "object" && type !== null && typeof (type as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function") {
    const name = classNameOfClass(type);
    const methods = new Map<string, ConfigurableMethod>();
    const declared: unknown = (type as Record<symbol, unknown>)[CONTRACT_METHODS];
    if (declared !== undefined && declared !== null) {
      if (typeof (declared as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
        throw new TypeError(`${name}: [Symbol.for('xaravel.contract.methods')] must be an iterable of method names`);
      }
      for (const method of declared as Iterable<unknown>) {
        if (typeof method !== "string") {
          throw new TypeError(`${name}: [Symbol.for('xaravel.contract.methods')] must hold method names, got ${typeof method}`);
        }
        methods.set(method, new ConfigurableMethod(method, 0, []));
      }
    }
    return { name, parent: null, methods, brand: Symbol.for(name) };
  }
  throw new TypeError(`PHPUnit\\Framework\\MockObject: a test double needs a class or a contract token, got ${type === null ? "null" : typeof type}`);
}

/** The InvocationHandler of `double`, or null when it is not a test double or not yet set up. Internal. */
export function invocationHandlerOf(double: unknown): InvocationHandler | null {
  if (typeof double !== "object" || double === null) {
    return null;
  }
  const handler: unknown = (double as Record<symbol, unknown>)[HANDLER];
  return handler instanceof InvocationHandler ? handler : null;
}

/** `__phpunit_unsetInvocationMocker`: the double gets a fresh handler without matchers. Internal. */
export function resetInvocationHandler(double: object, addToAssertionCount: (count: number) => void): void {
  const configuration = (double as Record<symbol, DoubleConfiguration | undefined>)[DOUBLE];
  if (configuration !== undefined) {
    setHandler(double, new InvocationHandler(configuration.configurableMethods, configuration.className, configuration.isMockObject, addToAssertionCount));
  }
}

function setHandler(double: object, handler: InvocationHandler): void {
  Object.defineProperty(double, HANDLER, { value: handler, writable: false, enumerable: false, configurable: true });
}

function doubledMethod(className: string, method: ConfigurableMethod): (this: object, ...args: unknown[]) => unknown {
  const name = method.name();
  const declared = method.numberOfParameters();
  const names = method.parameterNames();
  const fn = function (this: object, ...args: unknown[]): unknown {
    const handler = invocationHandlerOf(this);
    if (handler === null) {
      return null;
    }
    const parameters: unknown[] = [];
    for (let index = 0; index < Math.max(declared, args.length); index++) {
      parameters.push(args[index] ?? null);
    }
    return handler.invoke(new Invocation(className, name, parameters, this, names));
  };
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

function apiMethod(name: string, fn: (this: object, ...args: never[]) => unknown): PropertyDescriptor {
  Object.defineProperty(fn, "name", { value: name });
  return { value: fn, writable: true, enumerable: false, configurable: true };
}

/**
 * `Generator::testDouble`: an instance of a fresh double class of `type`. `methods` is the methods to double: every
 * method of the target for `[]`, none of a class's (an interface's are all doubled) for `null`, else those named.
 */
export function testDouble(
  type: unknown,
  mockObject: boolean,
  methods: readonly string[] | null,
  constructorArgs: readonly unknown[],
  callOriginalConstructor: boolean,
  addToAssertionCount: (count: number) => void,
): object {
  const target = readTarget(type);
  const doubled: ConfigurableMethod[] = [];
  if (target.parent === null || (methods !== null && methods.length === 0)) {
    doubled.push(...target.methods.values());
  }
  if (target.parent !== null && methods !== null) {
    for (const name of methods) {
      const known = [...target.methods.values()].find((method) => method.name().toLowerCase() === name.toLowerCase());
      if (known === undefined) {
        doubled.push(new ConfigurableMethod(name, 0, []));
      } else if (!doubled.includes(known)) {
        doubled.push(known);
      }
    }
  }
  if (doubled.some((method) => method.name().toLowerCase() === "method") || [...target.methods.keys()].some((name) => name.toLowerCase() === "method")) {
    throw new MethodNamedMethodException();
  }
  const parent = target.parent as (new (...args: unknown[]) => object) | null;
  const Double = parent === null ? class {} : class extends parent {};
  const doubleName = `${mockObject ? "MockObject" : "TestStub"}_${target.name.replace(/\\/g, "_")}_${randomBytes(4).toString("hex")}`;
  Object.defineProperty(Double, "name", { value: doubleName });
  Object.defineProperty(Double, CLASS_FQCN, { value: doubleName });
  const configuration: DoubleConfiguration = Object.freeze({ className: target.name, isMockObject: mockObject, configurableMethods: Object.freeze([...doubled]) });
  const prototype = Double.prototype as object;
  Object.defineProperty(prototype, DOUBLE, { value: configuration });
  if (target.brand !== null) {
    Object.defineProperty(prototype, target.brand, { get: () => true, enumerable: false, configurable: false });
  }
  for (const method of doubled) {
    Object.defineProperty(prototype, method.name(), { value: doubledMethod(target.name, method), writable: true, enumerable: false, configurable: true });
  }
  Object.defineProperty(
    prototype,
    "method",
    apiMethod("method", function (this: object, constraint: never) {
      return handlerOf(this).expects(new AnyInvokedCount()).method(constraint);
    }),
  );
  if (mockObject) {
    Object.defineProperty(
      prototype,
      "expects",
      apiMethod("expects", function (this: object, invocationRule: never) {
        if (!((invocationRule as unknown) instanceof InvocationOrder)) {
          throw new TypeError(`PHPUnit\\Framework\\MockObject\\MockObject::expects(): Argument #1 ($invocationRule) must be of type PHPUnit\\Framework\\MockObject\\Rule\\InvocationOrder, ${typeof invocationRule} given`);
        }
        return handlerOf(this).expects(invocationRule);
      }),
    );
  }
  const handler = new InvocationHandler(configuration.configurableMethods, target.name, mockObject, addToAssertionCount);
  let object: object;
  if (callOriginalConstructor && parent !== null) {
    object = Reflect.construct(parent, [...constructorArgs], Double) as object;
  } else {
    object = Object.create(prototype) as object;
  }
  setHandler(object, handler);
  return object;
}

function handlerOf(double: object): InvocationHandler {
  const handler = invocationHandlerOf(double);
  if (handler === null) {
    throw new TypeError("PHPUnit\\Framework\\MockObject: not a test double");
  }
  return handler;
}
