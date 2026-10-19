// PHP value helpers shared by the Mockery port (Story 4.5). Internal: not
// exported from the package.
//
// The value model is AD-9's, read through `@xaravel/assert`'s `php*` helpers (Epic 4 retro
// A1): every PHP value predicate, an object's class name, scalar strings, array
// entries, object properties, `var_export` and object handles are the grader's,
// so Mockery prints a value exactly as the grader does. Only Mockery's own
// logic stays here: the class-token helpers below (a class token's PHP name is
// its own static `[Symbol.for('xaravel.class.fqcn')]`, else its JS `name`,
// display only, AD-10), `formatArgument` and `objectToArray`.
import { createHash } from "node:crypto";
import {
  phpArrayEntries,
  phpClassNameOf,
  phpIsArray as isPhpArray,
  phpIsBrandedArray as isBrandedArray,
  phpIsObject as isPhpObject,
  phpIsResource as isResource,
  type PhpKey as Key,
  phpObjectHandle as objectHandle,
  phpObjectProps as objectProps,
  phpToString,
  phpVarExport,
} from "@xaravel/assert";

export const FQCN = Symbol.for("xaravel.class.fqcn");
const PHP_ARRAY = Symbol.for("xaravel.php.array");

/** A branded PhpArray; PHP's `is_array`; PHP's `is_object` (Epic 4 retro A1: one value layer, assert's `php*` helpers). */
export { isBrandedArray, isPhpArray, isPhpObject };

/**
 * A JS class: a function with an object `prototype` (an arrow function has none). This accepts `function` expressions
 * too; for the PHP meaning of a class or a Closure use `isPhpClass` / `isClosure`.
 */
export function isClass(value: unknown): value is abstract new (...args: never[]) => object {
  return typeof value === "function" && typeof (value as { prototype?: unknown }).prototype === "object" && (value as { prototype?: unknown }).prototype !== null;
}

/**
 * A PHP Closure: a function that is not a class. A `function () {}` expression has an object `prototype` too, so a
 * function counts as a class only when its source is a `class` or it carries the FQCN brand. Used where a closure
 * argument is expected (`Container.mock`'s trailing closure, `Mockery.type('Closure')`/`'callable'`).
 */
export function isClosure(value: unknown): value is (...args: never[]) => unknown {
  if (typeof value !== "function") {
    return false;
  }
  if (Object.hasOwn(value, FQCN)) {
    return false;
  }
  return !/^class\b/.test(Function.prototype.toString.call(value));
}

/**
 * A PHP class value for argument matching (`Expectation._matchArg`): a function with an object `prototype` whose
 * source is a `class`, that carries the FQCN brand (both `isClosure`'s rule), or that is a native constructor
 * (`Error`, `Date`, `Map`). A user-written `function` expression is a Closure, never a class, even though it has an
 * object `prototype`; none prints as native code with a prototype.
 */
export function isPhpClass(value: unknown): value is abstract new (...args: never[]) => object {
  return isClass(value) && (!isClosure(value) || /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(value)));
}

/** The PHP name of a class: its own FQCN brand, else its JS name. */
export function classNameOf(ctor: unknown): string | null {
  if (typeof ctor !== "function") {
    return null;
  }
  if (Object.hasOwn(ctor, FQCN)) {
    const fqcn: unknown = (ctor as unknown as Record<symbol, unknown>)[FQCN];
    if (typeof fqcn === "string") {
      return fqcn;
    }
  }
  return ctor.name === "" ? null : ctor.name;
}

/** PHP's `get_class`: the grader's class name of an object (inherited FQCN, `class@anonymous`, `Closure`). */
export function getClass(object: object): string {
  return phpClassNameOf(object);
}

/** The PHP short class name of an error or object (after the last `\`). */
export function shortClassName(value: unknown): string {
  const name = typeof value === "function" ? (classNameOf(value) ?? "Closure") : isPhpObject(value) ? getClass(value) : typeof value;
  return name.slice(name.lastIndexOf("\\") + 1);
}

/** PHP's `$object instanceof $className` for a class-name string (case-insensitive, leading `\` ignored). */
export function instanceOfName(object: object, name: string): boolean {
  const wanted = name.replace(/^\\/, "").toLowerCase();
  if (typeof object === "function") {
    return wanted === "closure";
  }
  for (let prototype: unknown = Object.getPrototypeOf(object); typeof prototype === "object" && prototype !== null; prototype = Object.getPrototypeOf(prototype)) {
    const ctor: unknown = Object.hasOwn(prototype, "constructor") ? (prototype as { constructor: unknown }).constructor : null;
    const className = classNameOf(ctor);
    if (className !== null && className.replace(/^\\/, "").toLowerCase() === wanted) {
      return true;
    }
  }
  return false;
}

/** A per-object id, as `spl_object_id`: the grader's object handle. */
export function objectId(object: object): number {
  return objectHandle(object);
}

/** PHP's string conversion of a scalar, as `implode` / `sprintf('%s')` do. */
export function phpString(value: unknown): string {
  switch (typeof value) {
    case "number":
    case "bigint":
      return phpToString(value);
    case "boolean":
      return value ? "1" : "";
    case "string":
      return value;
    case "undefined":
      return "undefined";
    default:
      if (value === null) {
        return "";
      }
      if (isPhpArray(value)) {
        return "Array";
      }
      if (typeof value === "symbol") {
        return value.toString();
      }
      return `object(${getClass(value as object)})`;
  }
}

/** The `[key, value]` pairs of a PHP array. */
export function arrayEntries(value: unknown): [Key, unknown][] {
  return phpArrayEntries(value as object).map(([key, item]) => [key, item]);
}

/** Something with Mockery's matcher shape: formats itself through `toString()`. */
export interface Formattable {
  toString(): string;
}

/** Mockery's private `formatArgument` (Mockery.php 866-910); `isMatcher` tells a matcher from other objects. */
export function formatArgument(argument: unknown, isMatcher: (value: unknown) => value is Formattable, depth = 0): string {
  if (isMatcher(argument)) {
    return argument.toString();
  }
  if (isPhpObject(argument)) {
    return `object(${getClass(argument)})`;
  }
  if (typeof argument === "number" || typeof argument === "bigint") {
    return phpString(argument);
  }
  if (isPhpArray(argument)) {
    let text: string;
    if (depth === 1) {
      text = "[...]";
    } else {
      const sample = arrayEntries(argument).map(([key, value]) => `${typeof key === "string" ? `'${key}'` : key.toString()} => ${formatArgument(value, isMatcher, depth + 1)}`);
      text = `[${sample.join(", ")}]`;
    }
    const bytes = Buffer.from(text, "utf8");
    return bytes.length > 1000 ? `${bytes.subarray(0, 1000).toString("utf8")}...]` : text;
  }
  if (typeof argument === "boolean") {
    return argument ? "true" : "false";
  }
  if (isResource(argument)) {
    return "resource(...)";
  }
  if (argument === null) {
    return "NULL";
  }
  if (argument === undefined) {
    // AD-9: never disguised as null.
    return "undefined";
  }
  return `'${phpString(argument)}'`;
}

/** The public instance properties of an object, in order (Mockery reads them through Reflection). */
function publicProperties(object: object): (readonly [Key, unknown])[] {
  return typeof object === "function" ? [] : [...objectProps(object)];
}

/**
 * An ordered PHP array built while formatting: `[key, value]` pairs, a key replaced in place. Branded
 * `Symbol.for('xaravel.php.array')`, so the grader's `isPhpArray`, `arrayEntries` and `varExport` read it.
 */
class Pairs {
  readonly [PHP_ARRAY] = true;
  readonly entries: [Key, unknown][] = [];

  *[Symbol.iterator](): IterableIterator<readonly [Key, unknown]> {
    yield* this.entries;
  }

  set(key: Key, value: unknown): void {
    const found = this.entries.find(([existing]) => existing === key);
    if (found === undefined) {
      this.entries.push([key, value]);
    } else {
      found[1] = value;
    }
  }
}

function cleanupArray(argument: unknown, nesting: number): unknown {
  if (nesting === 0) {
    return "...";
  }
  const result = new Pairs();
  for (const [key, value] of arrayEntries(argument)) {
    if (isPhpArray(value)) {
      result.set(key, cleanupArray(value, nesting - 1));
    } else if (isPhpObject(value)) {
      result.set(key, objectToArray(value, nesting - 1));
    } else {
      result.set(key, value);
    }
  }
  return result;
}

function cleanupNesting(argument: unknown, nesting: number): unknown {
  if (isPhpObject(argument)) {
    const object = objectToArray(argument, nesting - 1);
    if (object instanceof Pairs) {
      object.set("class", getClass(argument));
    }
    return object;
  }
  if (isPhpArray(argument)) {
    return cleanupArray(argument, nesting - 1);
  }
  return argument;
}

/** Mockery's private `objectToArray` (Mockery.php 991-1013) with its default formatter. */
export function objectToArray(object: object, nesting = 3): unknown {
  if (nesting === 0) {
    return ["..."];
  }
  const className = getClass(object);
  const result = new Pairs();
  result.set("class", className);
  result.set("identity", `#${createHash("md5").update(`${className}_${objectId(object)}`).digest("hex")}`);
  const properties = new Pairs();
  for (const [name, value] of publicProperties(object)) {
    let cleaned: unknown;
    try {
      cleaned = cleanupNesting(value, nesting);
    } catch (error) {
      cleaned = error instanceof Error ? error.message : String(error);
    }
    properties.set(name, cleaned);
  }
  result.set("properties", properties);
  return result;
}

/** PHP's `var_export($value, true)`: the grader's. */
export function varExport(value: unknown): string {
  return phpVarExport(value);
}
