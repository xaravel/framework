// PHP value helpers shared by the Mockery port (Story 4.5). Internal: not
// exported from the package.
//
// The value model is AD-9's: a PHP list is a JS Array, a string-keyed PHP array
// is a plain object, any other PHP array is branded `Symbol.for('xaravel.php.array')`
// and iterates normalised `[key, value]` pairs. A PHP object is anything else
// that is an object, or a JS function (PHP's Closure). A class's PHP name is its
// own static `[Symbol.for('xaravel.class.fqcn')]`, else its JS `name` (display
// only, AD-10).
import { createHash } from "node:crypto";

export const FQCN = Symbol.for("xaravel.class.fqcn");
const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_PROPS = Symbol.for("xaravel.php.props");
const PHP_RESOURCE = Symbol.for("xaravel.php.resource");

type Key = number | bigint | string;

/** A branded PhpArray. */
export function isBrandedArray(value: unknown): value is Iterable<readonly [Key, unknown]> {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[PHP_ARRAY] !== undefined && (value as Record<symbol, unknown>)[PHP_ARRAY] !== false;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isResource(value: unknown): boolean {
  return typeof value === "object" && value !== null && PHP_RESOURCE in value;
}

/** PHP's `is_array`: a list, a plain object or a branded array. */
export function isPhpArray(value: unknown): boolean {
  return Array.isArray(value) || isBrandedArray(value) || (typeof value === "object" && value !== null && isPlainObject(value));
}

/** PHP's `is_object`: a function (Closure) or an object that is no PHP array and no resource. */
export function isPhpObject(value: unknown): value is object {
  if (typeof value === "function") {
    return true;
  }
  return typeof value === "object" && value !== null && !isPhpArray(value) && !isResource(value);
}

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

/** PHP's `get_class`. */
export function getClass(object: object): string {
  if (typeof object === "function") {
    return "Closure";
  }
  const prototype: unknown = Object.getPrototypeOf(object);
  const ctor: unknown = typeof prototype === "object" && prototype !== null && Object.hasOwn(prototype, "constructor") ? (prototype as { constructor: unknown }).constructor : null;
  return classNameOf(ctor) ?? "stdClass";
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

const ids = new WeakMap<object, number>();
let nextId = 1;

/** A per-object id, as `spl_object_id`. */
export function objectId(object: object): number {
  let id = ids.get(object);
  if (id === undefined) {
    id = nextId++;
    ids.set(object, id);
  }
  return id;
}

/**
 * PHP's `zend_gcvt` for a finite non-zero float with `precision` significant digits (`0`: the shortest round-trip
 * digits, as `serialize_precision = -1`).
 */
function gcvt(value: number, precision: number): string {
  const exponential = precision === 0 ? Math.abs(value).toExponential() : Math.abs(value).toExponential(precision - 1);
  const [mantissa = "", exponentText = "0"] = exponential.split("e");
  const digits = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  const decpt = Number(exponentText) + 1;
  const ndigit = precision === 0 ? 17 : precision;
  const sign = value < 0 ? "-" : "";
  if (decpt < 0 ? decpt < -3 : decpt > ndigit) {
    const exponent = decpt - 1;
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}E${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`;
  }
  if (decpt <= 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  if (digits.length <= decpt) {
    return `${sign}${digits}${"0".repeat(decpt - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}

/** A number as PHP prints it: a safe integer as an int, anything else as a float. */
function phpNumber(value: number, mode: "string" | "export"): string {
  if (Number.isNaN(value)) {
    return "NAN";
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? "INF" : "-INF";
  }
  if (Number.isSafeInteger(value) && !Object.is(value, -0)) {
    return String(value);
  }
  if (value === 0) {
    return mode === "string" ? "-0" : "-0.0";
  }
  if (mode === "string") {
    // String conversion uses `precision` (14).
    return gcvt(value, 14);
  }
  const text = gcvt(value, 0);
  return /[.E]/.test(text) ? text : `${text}.0`;
}

/** PHP's string conversion of a scalar, as `implode` / `sprintf('%s')` do. */
export function phpString(value: unknown): string {
  switch (typeof value) {
    case "number":
      return phpNumber(value, "string");
    case "bigint":
      return value.toString();
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
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item as unknown]);
  }
  if (isBrandedArray(value)) {
    return [...value].map(([key, item]) => [key, item]);
  }
  return Object.entries(value as Record<string, unknown>);
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
function publicProperties(object: object): [Key, unknown][] {
  if (typeof object === "function") {
    return [];
  }
  const props = (object as Record<symbol, unknown>)[PHP_PROPS];
  if (typeof props === "function") {
    const value: unknown = (props as () => unknown).call(object);
    return isPhpArray(value) ? arrayEntries(value) : [];
  }
  return Object.keys(object).map((name) => [name, (object as Record<string, unknown>)[name]]);
}

/** An ordered PHP array built while formatting: `[key, value]` pairs, string keys replaced in place. */
class Pairs {
  readonly entries: [Key, unknown][] = [];

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

/** PHP's `var_export($value, true)` for the shapes `formatObjects` produces. */
export function varExport(value: unknown, indent = ""): string {
  const isArray = value instanceof Pairs || isPhpArray(value);
  if (isArray) {
    const entries = value instanceof Pairs ? value.entries : arrayEntries(value);
    let text = "array (\n";
    for (const [key, item] of entries) {
      const keyText = typeof key === "string" ? exportString(key) : key.toString();
      const nested = item instanceof Pairs || isPhpArray(item);
      text += `${indent}  ${keyText} => ${nested ? `\n${indent}  ${varExport(item, `${indent}  `)}` : varExport(item, `${indent}  `)},\n`;
    }
    return `${text}${indent})`;
  }
  switch (typeof value) {
    case "number":
      return phpNumber(value, "export");
    case "bigint":
      return value.toString();
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return exportString(value);
    case "undefined":
      return "undefined";
    default:
      if (value === null) {
        return "NULL";
      }
      if (isPhpObject(value)) {
        return `\\${getClass(value)}::__set_state(array(\n${indent}))`;
      }
      return typeof value === "symbol" ? exportString(value.toString()) : "NULL";
  }
}

function exportString(text: string): string {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
