// PHP 8.5 `==` and `===` over the AD-9 value model (Story 4.1; FR-116, AD-15).
//
// The grader imports no graded package, not even @xaravel/runtime. It detects
// the PHP value forms by shape and by brand:
//
//   - a PHP list is a JS Array (a hole reads as null);
//   - a PHP array whose keys are all strings is a plain object (prototype
//     Object.prototype or null) without the props protocol;
//   - any other PHP array is a value branded `Symbol.for('xaravel.php.array')`
//     whose `[Symbol.iterator]()` yields `[key, value]` pairs in insertion
//     order, keys already normalised (ESC-4.1-1);
//   - a JS built-in with internal state (Date, Map, Set, RegExp, …) has no PHP
//     props form, so it equals only itself;
//   - every other object is a PHP object; its properties come from
//     `[Symbol.for('xaravel.php.props')]()` (which must return a PHP array)
//     when present, else from its own enumerable string keys.
//
// int and float are both JS `number` (a `bigint` is an int), so `1 === 1.0`
// is true here (ESC-4.1-1, DIV-9). `undefined` and `symbol` are not PHP values
// (AD-9); each equals only itself.

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_PROPS = Symbol.for("xaravel.php.props");

const RECURSION = "Nesting level too deep - recursive dependency?";

type Key = number | bigint | string;
type Entries = readonly (readonly [Key, unknown])[];

/** PHP 8 numeric string: optional whitespace, sign, digits with `.`, exponent, optional whitespace. No hex. */
const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t\n\r\v\f]*$/;
const INTEGER_STRING = /^[ \t\n\r\v\f]*[+-]?\d+[ \t\n\r\v\f]*$/;
/** A string key PHP stores as an int key: canonical decimal (within the int range, checked separately). */
const INTEGER_KEY = /^(?:0|-?[1-9]\d*)$/;

const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);

// ---------------------------------------------------------------------------
// Built-ins: an object whose prototype chain, below Object.prototype, holds a
// prototype whose own `constructor` is a native function (Date, Map, URL,
// Headers, Intl.*, streams, …). The rule is cached per prototype. Never by
// constructor.name.

const reflectApply = Reflect.apply;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectPrototype = Object.prototype;
// oxlint-disable-next-line typescript/unbound-method -- called only through Reflect.apply
const functionToString = Function.prototype.toString;
const NATIVE_CODE = /\{\s*\[native code\]\s*\}\s*$/;

/** Per prototype: whether it, or a prototype above it (below Object.prototype), has a native constructor. */
const nativePrototypes = new WeakMap<object, boolean>();

function isNativePrototype(prototype: object | null): boolean {
  if (prototype === null || prototype === objectPrototype) {
    return false;
  }
  const known = nativePrototypes.get(prototype);
  if (known !== undefined) {
    return known;
  }
  const constructor: unknown = getOwnPropertyDescriptor(prototype, "constructor")?.value;
  const native =
    (typeof constructor === "function" && NATIVE_CODE.test(reflectApply(functionToString, constructor, []) as string)) ||
    isNativePrototype(getPrototypeOf(prototype) as object | null);
  nativePrototypes.set(prototype, native);
  return native;
}

/** Whether `value` is a JS built-in or platform object, which has no PHP props form. */
function isBuiltIn(value: object): boolean {
  return isNativePrototype(getPrototypeOf(value) as object | null);
}

// ---------------------------------------------------------------------------
// PHP array forms

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isBranded(value: object): boolean {
  return PHP_ARRAY in value;
}

/** A value branded `Symbol.for('xaravel.php.array')`, whose iterator yields `[key, value]` pairs. */
function isBrandedArray(value: unknown): value is Iterable<readonly [Key, unknown]> & object {
  return typeof value === "object" && value !== null && isBranded(value);
}

function hasProps(value: object): value is { [PHP_PROPS]: () => unknown } {
  return typeof (value as { [PHP_PROPS]?: unknown })[PHP_PROPS] === "function";
}

/** Whether `value` is a PHP array in one of its three forms. */
function isPhpArray(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Array.isArray(value) || isBranded(value) || (isPlainObject(value) && !hasProps(value));
}

/** An int key: a `number` when safe, else a `bigint`. */
function intKey(value: bigint): Key {
  return value >= SAFE_MIN && value <= SAFE_MAX ? Number(value) : value;
}

/** A plain-object or props key: a canonical int-like string within the int range is an int, as PHP stores it. */
function stringKey(key: string): Key {
  if (INTEGER_KEY.test(key)) {
    const value = BigInt(key);
    if (value >= INT_MIN && value <= INT_MAX) {
      return intKey(value);
    }
  }
  return key;
}

/** A branded map's key: a safe-integer `number`, an int-range `bigint` or a `string`; anything else is a TypeError. */
function brandedKey(key: unknown): Key {
  switch (typeof key) {
    case "number":
      if (Number.isSafeInteger(key)) {
        return key === 0 ? 0 : key;
      }
      break;
    case "bigint":
      if (key >= INT_MIN && key <= INT_MAX) {
        return intKey(key);
      }
      break;
    case "string":
      return stringKey(key);
    default:
      break;
  }
  throw new TypeError(`A Symbol.for('xaravel.php.array') key must be an int or a string, got ${describe(key)}`);
}

function describe(value: unknown): string {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "bigint":
      return `${value}n`;
    case "symbol":
      return value.toString();
    case "object":
      return value === null ? "null" : "an object";
    case "function":
      return "a function";
    default:
      return String(value);
  }
}

/** The `[key, value]` pairs of a PHP array in any of its forms, in PHP order. */
function arrayEntries(value: object): Entries {
  const entries: (readonly [Key, unknown])[] = [];
  if (Array.isArray(value)) {
    const list = value as unknown[];
    for (let index = 0; index < list.length; index++) {
      entries.push([index, Object.hasOwn(list, index) ? list[index] : null]);
    }
    return entries;
  }
  if (isBranded(value)) {
    const seen = new Set<Key>();
    for (const item of value as Iterable<unknown>) {
      if (!Array.isArray(item) || item.length !== 2) {
        throw new TypeError(`A Symbol.for('xaravel.php.array') value must yield [key, value] pairs, got ${describe(item)}`);
      }
      const key = brandedKey(item[0]);
      if (seen.has(key)) {
        throw new TypeError(`A Symbol.for('xaravel.php.array') value yields the key ${describe(key)} twice`);
      }
      seen.add(key);
      entries.push([key, item[1]]);
    }
    return entries;
  }
  for (const key of Object.keys(value)) {
    entries.push([stringKey(key), (value as Record<string, unknown>)[key]]);
  }
  return entries;
}

/** The properties of a PHP object, as `[name, value]` pairs. */
function objectProps(value: object): Entries {
  if (hasProps(value)) {
    const props = value[PHP_PROPS]();
    if (!isPhpArray(props)) {
      throw new TypeError(
        `[Symbol.for('xaravel.php.props')]() must return a PHP array (a list, a plain object or a Symbol.for('xaravel.php.array') value), got ${describe(props)}`,
      );
    }
    return arrayEntries(props);
  }
  const entries: (readonly [Key, unknown])[] = [];
  for (const key of Object.keys(value)) {
    entries.push([stringKey(key), (value as Record<string, unknown>)[key]]);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Scalars

function isNumber(value: unknown): value is number | bigint {
  return typeof value === "number" || typeof value === "bigint";
}

/** PHP's `(bool)` cast. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  switch (typeof value) {
    case "boolean":
      return value;
    case "number":
      // NAN is true in PHP.
      return value !== 0;
    case "bigint":
      return value !== 0n;
    case "string":
      return value !== "" && value !== "0";
    case "object":
      return isPhpArray(value) ? arrayEntries(value).length > 0 : true;
    default:
      return true;
  }
}

/**
 * PHP `==` between two numbers. A `bigint` is an int beyond the safe range. A `number` that is a safe integer
 * compares exactly; any other `number` is a float (AD-9 keeps unsafe ints as `bigint`), so PHP compares int and
 * float as doubles.
 */
function numbersEqual(a: number | bigint, b: number | bigint): boolean {
  if (typeof a === "bigint" && typeof b === "bigint") {
    return a === b;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a === b;
  }
  const big = (typeof a === "bigint" ? a : b) as bigint;
  const num = (typeof a === "number" ? a : b) as number;
  return Number.isSafeInteger(num) ? BigInt(num) === big : Number(big) === num;
}

/** PHP `===` between two numbers: as `==`, except that an int (`bigint`) never equals a float (an unsafe `number`). */
function numbersIdentical(a: number | bigint, b: number | bigint): boolean {
  if (typeof a === typeof b) {
    return a === b;
  }
  const big = (typeof a === "bigint" ? a : b) as bigint;
  const num = (typeof a === "number" ? a : b) as number;
  return Number.isSafeInteger(num) && BigInt(num) === big;
}

/** A PHP numeric string's value: an int, or a float with PHP's integer-overflow sign (`oflow`). */
type Numeric = { readonly int: true; readonly value: number | bigint } | { readonly int: false; readonly value: number; readonly oflow: -1 | 0 | 1 };

/** The numeric value of a PHP numeric string, or null when it is not numeric. */
function numericValue(text: string): Numeric | null {
  if (!NUMERIC.test(text)) {
    return null;
  }
  if (INTEGER_STRING.test(text)) {
    const big = BigInt(text.trim());
    if (big > INT_MAX || big < INT_MIN) {
      // An integer string beyond the int range is a float that overflowed.
      return { int: false, value: Number(big), oflow: big < 0n ? -1 : 1 };
    }
    return { int: true, value: intKey(big) as number | bigint };
  }
  return { int: false, value: Number(text), oflow: 0 };
}

/**
 * The PHP string form of a number, when it can equal a non-numeric string: only INF and -INF can. A finite number's
 * form is numeric, and NAN is uncomparable with a string (the Oracle: `NAN == "NAN"` is false).
 */
function nonNumericForm(value: number | bigint): string | null {
  if (typeof value === "number") {
    if (value === Infinity) {
      return "INF";
    }
    if (value === -Infinity) {
      return "-INF";
    }
  }
  return null;
}

function numberEqualsString(number: number | bigint, text: string): boolean {
  const parsed = numericValue(text);
  if (parsed !== null) {
    return numbersEqual(number, parsed.value);
  }
  return nonNumericForm(number) === text;
}

/** PHP 8 `zendi_smart_str_equals`. */
function stringsLooseEqual(a: string, b: string): boolean {
  const left = numericValue(a);
  const right = numericValue(b);
  if (left === null || right === null) {
    return a === b;
  }
  if (!left.int && !right.int) {
    // Both overflowed to the same side, or both are the same infinity: a double comparison would lose precision,
    // so PHP compares the strings.
    if ((left.oflow !== 0 && left.oflow === right.oflow && left.value === right.value) || (left.value === right.value && !Number.isFinite(left.value))) {
      return a === b;
    }
    return left.value === right.value;
  }
  if (!left.int) {
    // An int string never equals an integer string that overflowed.
    return left.oflow === 0 && numbersEqual(right.value, left.value);
  }
  if (!right.int) {
    return right.oflow === 0 && numbersEqual(left.value, right.value);
  }
  return numbersEqual(left.value, right.value);
}

/** A PHP object (not an array, a function or a built-in): `==` with a number casts it to 1 (or 1.0), as PHP does with a warning. */
function isCastableObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !isPhpArray(value) && !isBuiltIn(value);
}

/** `undefined` and `symbol` are not PHP values (AD-9). */
function isForeign(value: unknown): boolean {
  return value === undefined || typeof value === "symbol";
}

// ---------------------------------------------------------------------------

class Comparison {
  /** The left-hand containers being compared, as PHP's recursion guard protects them. */
  private readonly active = new Set<object>();

  private guard<T>(container: object, compare: () => T): T {
    if (this.active.has(container)) {
      throw new Error(RECURSION);
    }
    this.active.add(container);
    try {
      return compare();
    } finally {
      this.active.delete(container);
    }
  }

  loose(a: unknown, b: unknown): boolean {
    if (isForeign(a) || isForeign(b)) {
      return Object.is(a, b);
    }
    if (typeof a === "boolean" || typeof b === "boolean") {
      return truthy(a) === truthy(b);
    }
    if (a === null && b === null) {
      return true;
    }
    if (a === null) {
      return typeof b === "string" ? b === "" : !truthy(b);
    }
    if (b === null) {
      return typeof a === "string" ? a === "" : !truthy(a);
    }
    if (isNumber(a) && isNumber(b)) {
      return numbersEqual(a, b);
    }
    if (isNumber(a) && typeof b === "string") {
      return numberEqualsString(a, b);
    }
    if (typeof a === "string" && isNumber(b)) {
      return numberEqualsString(b, a);
    }
    if (typeof a === "string" && typeof b === "string") {
      return stringsLooseEqual(a, b);
    }
    if (isNumber(a) && isCastableObject(b)) {
      return numbersEqual(a, 1);
    }
    if (isNumber(b) && isCastableObject(a)) {
      return numbersEqual(b, 1);
    }
    if (typeof a !== "object" && typeof a !== "function") {
      return false;
    }
    if (typeof b !== "object" && typeof b !== "function") {
      return false;
    }
    const left = a as object;
    const right = b as object;
    if (left === right) {
      return true;
    }
    const leftArray = isPhpArray(left);
    const rightArray = isPhpArray(right);
    if (leftArray && rightArray) {
      return this.guard(left, () => this.looseEntries(arrayEntries(left), arrayEntries(right)));
    }
    if (leftArray || rightArray) {
      return false;
    }
    if (typeof left === "function" || typeof right === "function") {
      return false;
    }
    if (isBuiltIn(left) || isBuiltIn(right)) {
      // No PHP props form: equal only to itself, checked above.
      return false;
    }
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
      return false;
    }
    return this.guard(left, () => this.looseEntries(objectProps(left), objectProps(right)));
  }

  private looseEntries(a: Entries, b: Entries): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const right = new Map<Key, unknown>();
    for (const [key, value] of b) {
      right.set(key, value);
    }
    for (const [key, value] of a) {
      if (!right.has(key) || !this.loose(value, right.get(key))) {
        return false;
      }
    }
    return true;
  }

  strict(a: unknown, b: unknown): boolean {
    if (isForeign(a) || isForeign(b)) {
      return Object.is(a, b);
    }
    if (a === null || b === null) {
      return a === b;
    }
    if (isNumber(a) || isNumber(b)) {
      return isNumber(a) && isNumber(b) && numbersIdentical(a, b);
    }
    if (typeof a !== "object" || typeof b !== "object") {
      return a === b;
    }
    if (a === b) {
      return true;
    }
    if (!isPhpArray(a) || !isPhpArray(b)) {
      // Objects: identity, already checked.
      return false;
    }
    return this.guard(a, () => {
      const left = arrayEntries(a);
      const right = arrayEntries(b);
      if (left.length !== right.length) {
        return false;
      }
      for (let index = 0; index < left.length; index++) {
        const [leftKey, leftValue] = left[index]!;
        const [rightKey, rightValue] = right[index]!;
        if (leftKey !== rightKey || !this.strict(leftValue, rightValue)) {
          return false;
        }
      }
      return true;
    });
  }
}

/** PHP 8.5 `$a == $b`. Throws `Error('Nesting level too deep - recursive dependency?')` on a recursive structure. */
export function phpLooseEquals(a: unknown, b: unknown): boolean {
  return new Comparison().loose(a, b);
}

/** PHP 8.5 `$a === $b`. Throws `Error('Nesting level too deep - recursive dependency?')` on a recursive structure. */
export function phpStrictEquals(a: unknown, b: unknown): boolean {
  return new Comparison().strict(a, b);
}

// Internal exports for the comparators, the exporter and the assertions (Story 4.3). index.ts re-exports
// some of them as `php*` names for @xaravel/mockery (Epic 4 retro A1).
export type { Entries, Key, Numeric };
export {
  arrayEntries,
  brandedKey,
  Comparison,
  describe,
  INT_MAX,
  INT_MIN,
  intKey,
  isBrandedArray,
  isBuiltIn,
  isNumber,
  isPhpArray,
  numericValue,
  objectProps,
  RECURSION,
  stringKey,
  truthy,
};
