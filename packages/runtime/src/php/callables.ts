// Shared PHP callable resolution and argument unpacking (ESC-14.5-3; DIV-9.13/14).
import { isContractToken, lookUpName } from "../registry/registry";
import { arrayEntries } from "./casts";
import { isClassConstructor, isClosureValue } from "./Closure";
import { Error as PhpError } from "./Error";
import { asciiMethodName, callMethod, resolveMethod } from "./objectFunctions";
import { foreachIterator } from "./liveCursor";
import { isTraversable, iteratorOf } from "./traverse";
import { arrayParameter } from "./phpArguments";
import { phpFunction } from "./phpFunctions";
import { INT_MAX, INT_MIN } from "./phpInt";
import { classChain } from "./reflectionTargets";
import { className, phpType, phpTypeName } from "./phpType";
import { CLOSURE_METHODS, stringOf } from "./typeTests";
import { TypeError as PhpTypeError } from "./TypeError";
import { valueCopy } from "./valueCopy";

export type PhpCallable = (...args: unknown[]) => unknown;

const OPTIONS = Symbol.for("xaravel.php.options");
function withOptions(target: PhpCallable, original: object): PhpCallable {
  if ((original as Record<symbol, unknown>)[OPTIONS] === true) Object.defineProperty(target, OPTIONS, { value: true });
  return target;
}

function stringLike(value: unknown): boolean {
  return typeof value === "string" || isClassConstructor(value) || isContractToken(value);
}

function objectLike(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function") && !stringLike(value) && phpType(value) === "object";
}

/** A method callable, or its PHP diagnostic when it cannot resolve. */
function methodCallable(target: unknown, name: string): PhpCallable | string {
  const classTarget = stringLike(target);
  if (!classTarget && !objectLike(target)) return "first array member is not a valid class name or object";
  if (!classTarget && isClosureValue(target) && CLOSURE_METHODS.has(asciiMethodName(name))) {
    return withOptions((...args) => callMethod(target, name, ...args), target);
  }
  const original: unknown = classTarget
    ? typeof target === "string" ? lookUpName(target) : target
    : (Object.getPrototypeOf(target as object) as { constructor?: unknown } | null)?.constructor;
  if (original === null) return `class "${stringOf(target)}" not found`;
  if ((typeof original !== "function" && typeof original !== "object") || original === null) {
    return `class ${className(target as object)} does not have a method "${name}"`;
  }
  let selected: object = original;
  let selectedName = classTarget ? stringOf(target) : className(target as object);
  const at = name.lastIndexOf("::");
  if (at >= 0) {
    const qualifier = name.slice(0, at);
    name = name.slice(at + 2);
    if (qualifier === "" || name === "") return "invalid function name";
    switch (asciiMethodName(qualifier)) {
      case "self": break;
      case "parent": {
        const parent = classChain(original).next().value;
        if (parent === undefined) return 'cannot access "parent" when current class scope has no parent';
        selected = parent;
        break;
      }
      default: {
        const declared = lookUpName(qualifier);
        if (declared === null) return `class "${qualifier}" not found`;
        if (declared !== original && ![...classChain(original)].some((parent) => parent === declared)) {
          return `class ${selectedName} is not a subclass of ${stringOf(declared)}`;
        }
        selected = declared;
      }
    }
    selectedName = stringOf(selected);
  }
  const method = resolveMethod(selected, name);
  // An object keeps its original called scope even when a parent declaration is selected.
  const receiver = classTarget ? selected : original;
  if (method !== null) {
    if (classTarget && !method.isStatic) return `non-static method ${selectedName}::${name}() cannot be called statically`;
    return withOptions((...args) => Reflect.apply(method.fn, method.isStatic ? receiver : target, args) ?? null, method.fn);
  }
  const magic = resolveMethod(selected, classTarget ? "__callStatic" : "__call");
  if (magic !== null && magic.isStatic === classTarget) {
    return (...args) => Reflect.apply(magic.fn, classTarget ? receiver : target, [name, args]) ?? null;
  }
  return `class ${selectedName} does not have a method "${name}"`;
}

function resolution(value: unknown): PhpCallable | string {
  if (isClosureValue(value)) return withOptions((...args) => Reflect.apply(value, null, args) ?? null, value);
  if (stringLike(value)) {
    const name = stringOf(value);
    const at = name.lastIndexOf("::");
    if (at >= 0) return methodCallable(name.slice(0, at), name.slice(at + 2));
    return phpFunction(name) ?? `function "${name}" not found or invalid function name`;
  }
  if (objectLike(value)) {
    const klass: unknown = Object.getPrototypeOf(value)?.constructor;
    if (typeof klass !== "function" || resolveMethod(klass, "__invoke") === null) return "no array or string given";
    const resolved = methodCallable(value, "__invoke");
    return typeof resolved === "function" ? resolved : "no array or string given";
  }
  if (typeof value === "object" && value !== null && phpType(value) === "array") {
    const entries = arrayEntries(value);
    if (entries.length !== 2) return "array callback must have exactly two members";
    const target = entries.find(([key]) => key === 0);
    const method = entries.find(([key]) => key === 1);
    if (target === undefined || method === undefined) return "array callback has to contain indices 0 and 1";
    if (typeof method[1] !== "string") return "second array member is not a valid method";
    return methodCallable(target[1], method[1]);
  }
  return "no array or string given";
}

/** Resolve any approved PHP callable form, or null on invalid input. */
export function resolveCallable(value: unknown): PhpCallable | null {
  const found = resolution(value);
  return typeof found === "function" ? found : null;
}

/** Resolve a callback parameter, retaining PHP's argument-specific error diagnostic. Internal. */
export function callableParameter(fn: string, position: number, value: unknown, nullable: boolean = false, name: string | null = "callback"): PhpCallable | null {
  if (nullable && (value === null || value === undefined)) return null;
  const found = resolution(value);
  if (typeof found === "function") return found;
  const label = name === null ? "" : ` ($${name})`;
  throw new PhpTypeError(`${fn}(): Argument #${position}${label} must be a valid callback${nullable ? " or null" : ""}, ${found}`);
}

/**
 * PHP's `$callable(...$args)`. Integer keys are positional, string keys are named. A target may explicitly expose
 * its AD-26 options form as `[Symbol.for('xaravel.php.options')] = true`; named entries then form its final object.
 * Targets without that form throw the ESC-14.5-3 untranslatable diagnostic rather than dropping argument names.
 */
export function callUnpacked(callable: unknown, args: unknown): unknown {
  return unpack("callUnpacked", callable, args);
}

function unpack(fn: string, callable: unknown, args: unknown): unknown {
  const target = callableParameter(fn, 1, callable) as PhpCallable;
  if (fn === "callUnpacked" && !isTraversable(args) && phpType(args) !== "array") throw new PhpTypeError(`Only arrays and Traversables can be unpacked, ${phpTypeName(args)} given`);
  const entries = fn === "callUnpacked" && isTraversable(args)
    ? foreachIterator(iteratorOf(args)) : arrayParameter(fn, 2, "args", args);
  const positional: unknown[] = [];
  const named: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let hasNamed = false;
  for (const [key, value] of entries) {
    if (typeof key !== "string" && !(typeof key === "bigint" && key >= INT_MIN && key <= INT_MAX) && !(typeof key === "number" && Number.isSafeInteger(key) && !Object.is(key, -0))) throw new PhpError("Keys must be of type int|string during argument unpacking");
    if (typeof key === "string") {
      if (Object.hasOwn(named, key)) throw new PhpError(`Named parameter $${key} overwrites previous argument`);
      hasNamed = true;
      Object.defineProperty(named, key, { value: valueCopy(value), enumerable: true, configurable: true });
    } else {
      if (hasNamed) throw new PhpError(fn === "call_user_func_array" ? "Cannot use positional argument after named argument" : "Cannot use positional argument after named argument during unpacking");
      positional.push(valueCopy(value));
    }
  }
  if (hasNamed) {
    if ((target as unknown as Record<symbol, unknown>)[OPTIONS] !== true) {
      throw new TypeError(`${fn}(): named argument unpacking is untranslatable for a target without an options form (ESC-14.5-3)`);
    }
    positional.push(named);
  }
  return target(...positional) ?? null;
}

/** PHP's `call_user_func_array`, sharing callable resolution and named-argument validation with unpacking. */
export function call_user_func_array(callback: unknown, args: unknown): unknown {
  return unpack("call_user_func_array", callback, args);
}
