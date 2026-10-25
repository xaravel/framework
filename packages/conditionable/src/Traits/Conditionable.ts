// Laravel's `Illuminate\Support\Traits\Conditionable` (Story 12.1), as a runtime trait: `class X extends mixin(Base,
// Conditionable)` (AD-26 Traits row).
//
// Logic. Ported one-for-one from Upstream. PHP checks `?callable $callback` / `?callable $default` on entry, so a
// non-null argument that is neither a closure nor an invokable object (an instance of a class whose `__invoke` is a
// function, called as `object.__invoke(instance, value)`) throws PHP's `TypeError` on every branch; a class stands for a
// class-string, and a plain object with an `__invoke` key is a PHP array, so both are rejected. A `value` that is a PHP Closure (a
// function that is not a class: not `class` source, no FQCN brand, not a native constructor) is called with the
// instance and replaced by its result. `arguments.length` stands in for `func_num_args()`: with no argument the method
// returns a `HigherOrderWhenProxy` (`unless` negating the condition it captures), and with one it returns the proxy
// holding that condition. Otherwise the value is tested with PHP truthiness (`toBool`), and the callback's (or
// default's) result is returned, or the instance when that result is `null` (AD-9: `undefined` too).
//
// Dual helper (AD-6, DIV-1.6). `when` / `unless` take no `@asyncRoot` tag and declare no Promise: they return what
// their callbacks return (`result ?? this`), so an async callback's own Promise is returned as is, and a thenable result
// (a query Builder) is never inspected. A condition is never awaited: a thenable `value`, or a thenable returned by the
// `value` closure, throws a `TypeError` saying to await it first, as a truthiness test would always pass. The types
// reject a Promise condition with `NotPromise<V>`.
//
// Positional form only (DIV-12.13): a lone object argument is always the condition. `default` is a reserved word, so
// the parameter is `defaultValue`.
import type { NotPromise } from "@xaravel/contracts/async";
import { Error as PhpError, TypeError as PhpTypeError, isContractToken, isFloat, registerClass, toBool } from "@xaravel/runtime";
import { type CapturingWhenProxy, type ConditionedWhenProxy, HigherOrderWhenProxy } from "../HigherOrderWhenProxy";
import { classNameOf, isThenable } from "../support/values";

/** A condition: the value itself, or a closure the instance is passed to, whose result is the value. Never a Promise (DIV-1.6). */
type Condition<S, V> = NotPromise<V> | ((self: S) => NotPromise<V>);
/**
 * A callback or default: called with the instance and the condition's value. A closure, or an invokable object (an
 * instance of a class with an `__invoke` method), whose `__invoke` is called. The type cannot tell a class instance
 * from a plain object literal `{ __invoke }`; a plain object is a PHP array, rejected at run time.
 */
type Callback<S, V, R> = ((self: S, value: V) => R) | { __invoke(self: S, value: V): R };
/** What a callback's result `r` makes the method return: `r ?? this`. */
type Result<R, S> = Exclude<R, null | undefined | void> | S;

const FQCN = Symbol.for("xaravel.class.fqcn");
const PHP_ARRAY = Symbol.for("xaravel.php.array");
const NATIVE_CODE = /\{\s*\[native code\]\s*\}\s*$/;

/**
 * PHP's `$value instanceof Closure`: a function that is not a class. A class is a function whose source is a `class`,
 * that carries the FQCN brand (`registerClass`), or that is a native constructor (`Date`, `Map`): Mockery's rule
 * (`packages/mockery/src/support/values.ts`, `isClosure` / `isPhpClass`).
 */
function isClosure(value: unknown): value is (self: unknown) => unknown {
  if (typeof value !== "function" || Object.hasOwn(value, FQCN)) {
    return false;
  }
  const source = Function.prototype.toString.call(value);
  if (/^class\b/.test(source)) {
    return false;
  }
  const prototype: unknown = (value as { prototype?: unknown }).prototype;

  return !(typeof prototype === "object" && prototype !== null && NATIVE_CODE.test(source));
}

/** PHP's name for the type of a non-callable argument in a `TypeError` message (`int`, `string`, `array`, a class). */
function typeNameOf(value: unknown): string {
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isSafeInteger(value) && !Object.is(value, -0) ? "int" : "float";
    case "bigint":
      return "int";
    case "string":
      return "string";
    case "symbol":
      return "symbol";
    default:
      break;
  }
  const object = value as object;
  if (isFloat(object)) {
    return "float";
  }
  // A contract token is its FQCN class-string as a PHP value (AD-9).
  if (isContractToken(object)) {
    return "string";
  }
  const prototype: unknown = Object.getPrototypeOf(object);
  if (Array.isArray(object) || (object as Record<symbol, unknown>)[PHP_ARRAY] === true || prototype === Object.prototype || prototype === null) {
    return "array";
  }

  return classNameOf(object);
}

/**
 * PHP's `?callable` parameter check on entry: `null` (`undefined` read as `null`), a closure, or an invokable object,
 * else PHP's `TypeError`. An invokable object is an instance of a class (an object `typeNameOf` names by its class, not
 * `array`, `float` or `string`) whose `__invoke` is a function; it is returned wrapped as a function calling
 * `object.__invoke(self, value)`, with the object as `this`, as Macroable's `callMacro` does. A plain object with an
 * `__invoke` key is a PHP array, which is callable only as `[object, 'method']`, so it is rejected.
 */
function callableArgument(self: object, method: string, position: number, name: string, value: unknown): ((self: unknown, value: unknown) => unknown) | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "function") {
    const type = typeNameOf(value);
    if (typeof value === "object" && type !== "array" && type !== "float" && type !== "string" && typeof (value as { __invoke?: unknown }).__invoke === "function") {
      const invokable = value as { __invoke(self: unknown, value: unknown): unknown };

      return (instance: unknown, argument: unknown): unknown => invokable.__invoke(instance, argument);
    }
    throw new PhpTypeError(`${classNameOf(self)}::${method}(): Argument #${position} ($${name}) must be of type ?callable, ${type} given`);
  }
  // A class (a function that is not a closure) stands for a PHP class-string, which is not callable.
  if (!isClosure(value)) {
    throw new PhpTypeError(`${classNameOf(self)}::${method}(): Argument #${position} ($${name}) must be of type ?callable, string given`);
  }

  return value as (self: unknown, value: unknown) => unknown;
}

/** `$value instanceof Closure ? $value($this) : $value`; a thenable condition throws (DIV-1.6). */
function conditionOf(self: object, method: string, value: unknown): unknown {
  if (isThenable(value)) {
    throw new TypeError(`${classNameOf(self)}::${method}(): the condition is a Promise or another thenable; await it before calling ${method}()`);
  }
  if (!isClosure(value)) {
    return value ?? null;
  }
  const resolved = value(self);
  if (isThenable(resolved)) {
    throw new TypeError(`${classNameOf(self)}::${method}(): the condition closure returned a Promise or another thenable; await it before calling ${method}()`);
  }

  return resolved ?? null;
}

/** `$callback($this, $value)`; a `null` callback throws PHP's `Error`, as Upstream's call does. */
function invoke(callable: ((self: unknown, value: unknown) => unknown) | null, self: object, value: unknown): unknown {
  if (callable === null) {
    throw new PhpError("Value of type null is not callable");
  }

  return callable(self, value);
}

/** The body of `when` and `unless` (`method`), called with `count` arguments. */
function conditional(self: object, method: "when" | "unless", count: number, value: unknown, callback: unknown, defaultValue: unknown): unknown {
  const negate = method === "unless";
  const callbackFn = callableArgument(self, method, 2, "callback", callback);
  const defaultFn = callableArgument(self, method, 3, "default", defaultValue);
  const condition = conditionOf(self, method, value);

  if (count === 0) {
    const proxy = new HigherOrderWhenProxy(self);

    return negate ? proxy.negateConditionOnCapture() : proxy;
  }

  if (count === 1) {
    return new HigherOrderWhenProxy(self).condition(negate ? !toBool(condition) : condition);
  }

  if (negate ? !toBool(condition) : toBool(condition)) {
    return invoke(callbackFn, self, condition) ?? self;
  } else if (defaultFn !== null) {
    return defaultFn(self, condition) ?? self;
  }

  return self;
}

/**
 * Laravel's `Conditionable` trait: `when()` and `unless()` apply a callback only when a condition holds, so a fluent
 * chain can branch without leaving the chain. Use it as `class X extends mixin(Base, Conditionable)`.
 */
export class Conditionable {
  /** With no argument: a `HigherOrderWhenProxy` whose next property read or method call captures the condition. */
  when(): CapturingWhenProxy<this>;
  /**
   * With only a condition: a `HigherOrderWhenProxy` that applies the next property read or method call when the
   * condition is truthy. A closure condition is called with the instance first.
   */
  when<V>(value: Condition<this, V>): ConditionedWhenProxy<this>;
  /**
   * Apply the callback if the given "value" is (or resolves to) truthy. A `value` closure is called with the instance,
   * and its result is the value. When the value is truthy, returns `callback(this, value)`; otherwise, when a `default`
   * is given, `default(this, value)`; a `null` result, or no callback run, returns the instance. An async callback's
   * Promise is returned as is; a Promise condition throws a `TypeError` (DIV-1.6).
   */
  when<V, R = never, D = never>(value?: Condition<this, V>, callback?: Callback<this, V, R> | null, defaultValue?: Callback<this, V, D> | null): Result<R | D, this>;
  // `arguments.length` stands in for Upstream's `func_num_args()`.
  when(value: unknown = null, callback: unknown = null, defaultValue: unknown = null): unknown {
    return conditional(this, "when", arguments.length, value, callback, defaultValue);
  }

  /** With no argument: a `HigherOrderWhenProxy` whose next property read or method call captures the negated condition. */
  unless(): CapturingWhenProxy<this>;
  /**
   * With only a condition: a `HigherOrderWhenProxy` that applies the next property read or method call when the
   * condition is falsy. A closure condition is called with the instance first.
   */
  unless<V>(value: Condition<this, V>): ConditionedWhenProxy<this>;
  /**
   * Apply the callback if the given "value" is (or resolves to) falsy. A `value` closure is called with the instance,
   * and its result is the value. When the value is falsy, returns `callback(this, value)`; otherwise, when a `default`
   * is given, `default(this, value)`; a `null` result, or no callback run, returns the instance. An async callback's
   * Promise is returned as is; a Promise condition throws a `TypeError` (DIV-1.6).
   */
  unless<V, R = never, D = never>(value?: Condition<this, V>, callback?: Callback<this, V, R> | null, defaultValue?: Callback<this, V, D> | null): Result<R | D, this>;
  // `arguments.length` stands in for Upstream's `func_num_args()`.
  unless(value: unknown = null, callback: unknown = null, defaultValue: unknown = null): unknown {
    return conditional(this, "unless", arguments.length, value, callback, defaultValue);
  }
}

registerClass("Illuminate\\Support\\Traits\\Conditionable", Conditionable);
