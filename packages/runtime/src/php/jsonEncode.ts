// The default-flags core of `jsonEncode` (AD-23; decisions/ESC-9.4-1.md part 2): PHP's `json_encode($value)` with no
// flags, for the values the Class Registry's classmap needs. It encodes `null`, booleans, integers, strings, lists
// (`Array`) and plain objects, with PHP's default escaping: `\/`, `\uXXXX` (lower-case hex) for every non-ASCII code
// unit, surrogate pairs for characters outside the BMP, and the short escapes or `\u00XX` for control characters.
// A `PhpArray` (detected by its `Symbol.for('xaravel.php.array')` brand, so this file imports nothing that imports the
// Registry) follows the list rule (AD-9.2, Story 9.5): keys exactly `0..n-1` in order encode as a list, any other
// key set as an object with the keys as decimal strings. Every other value (a float, marked or not, `bigint`, a class
// instance, `undefined`, a function, a symbol) throws a `TypeError`. Story 9.8 adds the flags, floats, the `JsonSerializable` / `Arrayable` / `Jsonable` hooks, `bigint`
// and the Oracle Differential tests, and removes nothing from this core.

/** PHP's default `json_encode` depth (`$depth = 512`). */
const DEPTH = 512;

const HEX = "0123456789abcdef";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** PHP's short escapes for the characters `json_encode` escapes by default. */
const SHORT: Readonly<Record<number, string>> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x2f: "\\/",
  0x5c: "\\\\",
};

/**
 * `json_encode($value)` with PHP's default flags, for `null`, booleans, integers, strings, lists and plain objects.
 * Throws a `TypeError` for any other value, and an `Error` with PHP's `json_last_error_msg()` text for a string that
 * is not valid UTF-16 (a lone surrogate: PHP's malformed UTF-8) or nesting deeper than 512.
 */
export function jsonEncode(value: unknown): string {
  return encode(value, 0);
}

function encode(value: unknown, depth: number): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw floatError(value);
      }
      return String(value);
    case "string":
      return encodeString(value);
    case "object":
      return encodeObject(value, depth + 1);
    default:
      throw new TypeError(`jsonEncode(): cannot encode a value of type ${typeof value}`);
  }
}

function encodeObject(value: object, depth: number): string {
  if (depth > DEPTH) {
    throw new Error("Maximum stack depth exceeded");
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        throw new TypeError(`jsonEncode(): cannot encode a sparse array (index ${i} is a hole)`);
      }
      parts.push(encode(value[i], depth));
    }
    return `[${parts.join(",")}]`;
  }
  if ((value as Record<symbol, unknown>)[PHP_FLOAT] === true) {
    throw floatError(Number(value));
  }
  if (PHP_ARRAY in value) {
    return encodePhpArray(value as unknown as Iterable<readonly [unknown, unknown]>, depth);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("jsonEncode(): cannot encode an object that is not a plain object; its hooks arrive with Story 9.8");
  }
  const parts: string[] = [];
  for (const key of Object.keys(value)) {
    parts.push(`${encodeString(key)}:${encode((value as Record<string, unknown>)[key], depth)}`);
  }
  return `{${parts.join(",")}}`;
}

function floatError(value: number): TypeError {
  return new TypeError(`jsonEncode(): cannot encode the float ${String(value)}; floats arrive with Story 9.8`);
}

/** A `PhpArray` by the list rule: a list when its keys are exactly `0..n-1` in order, else an object. */
function encodePhpArray(value: Iterable<readonly [unknown, unknown]>, depth: number): string {
  const entries = [...value];
  if (entries.every(([key], index) => key === index)) {
    return `[${entries.map(([, item]) => encode(item, depth)).join(",")}]`;
  }
  const parts: string[] = [];
  for (const [key, item] of entries) {
    if (typeof key !== "string" && typeof key !== "number" && typeof key !== "bigint") {
      throw new TypeError(`jsonEncode(): a PhpArray key must be an int or a string, got ${typeof key}`);
    }
    parts.push(`${encodeString(String(key))}:${encode(item, depth)}`);
  }
  return `{${parts.join(",")}}`;
}

function encodeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    const short = SHORT[unit];
    if (short !== undefined) {
      out += short;
    } else if (unit < 0x20) {
      out += escape(unit);
    } else if (unit < 0x80) {
      out += value[i];
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (low < 0xdc00 || low > 0xdfff) {
        throw new Error("Malformed UTF-8 characters, possibly incorrectly encoded");
      }
      out += escape(unit) + escape(low);
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("Malformed UTF-8 characters, possibly incorrectly encoded");
    } else {
      out += escape(unit);
    }
  }
  return `${out}"`;
}

function escape(unit: number): string {
  return `\\u${HEX[(unit >> 12) & 0xf]}${HEX[(unit >> 8) & 0xf]}${HEX[(unit >> 4) & 0xf]}${HEX[unit & 0xf]}`;
}
