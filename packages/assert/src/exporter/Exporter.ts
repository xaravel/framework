// sebastian/exporter 8.2.1's `Exporter` (Story 4.3), with PHPUnit 13.4.3's
// control-character Sanitizer.
//
// Object handles (`Object #<n>`) come from a per-process counter, so they never
// equal PHP's `spl_object_id`; tests compare them as `Object #<n>`. A PHP
// array nested in itself is impossible in PHP, so a JS array that contains
// itself is printed as `Array &<n>` of its ancestor.
import { arrayEntries, type Entries, isBuiltIn, isPhpArray, type Key, objectProps } from "../comparison/PhpComparison";
import { classNameOf, formatDouble, isInt, isMarkedFloat, isResource, resourceType, unmarkFloat } from "../comparison/PhpValues";

const handles = new WeakMap<object, number>();
let nextHandle = 0;

/** The object's handle, as `spl_object_id` gives it: fixed for the object's life in this process. */
export function objectHandle(value: object): number {
  let handle = handles.get(value);
  if (handle === undefined) {
    handle = ++nextHandle;
    handles.set(value, handle);
  }
  return handle;
}

// oxlint-disable-next-line no-control-regex -- PHP's unprintable byte class
const UNPRINTABLE = /[\x00-\x08\x0e-\x1a\x1c-\x1f]/g;

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** `Exporter::exportString`. */
export function exportString(value: string): string {
  const unprintable = value.match(UNPRINTABLE)?.length ?? 0;
  if (unprintable === 0) {
    return `'${value.replace(/\r\n|\r|\n/g, (match) => (match === "\r\n" ? "\\r\\n\n" : match === "\r" ? "\\r\n" : "\\n\n"))}'`;
  }
  if (value.includes("\x00") || unprintable / utf8Length(value) > 0.3) {
    return `Binary String: 0x${Buffer.from(value, "utf8").toString("hex")}`;
  }
  // oxlint-disable-next-line no-control-regex -- the bytes PHP escapes
  const escaped = value.replace(/[\x00-\x1f\x7f"\\]/g, (match) => {
    switch (match) {
      case "\t":
        return "\\t";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case '"':
        return '\\"';
      case "\\":
        return "\\\\";
      default:
        return `\\x${match.charCodeAt(0).toString(16).padStart(2, "0")}`;
    }
  });
  return `Binary String: "${escaped}"`;
}

/** `Exporter::exportFloat`. */
export function exportFloat(value: number): string {
  const text = formatDouble(value, 17);
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return text;
  }
  return /[.E]/.test(text) ? text : `${text}.0`;
}

function exportKey(key: Key): string {
  return typeof key === "string" ? exportString(key) : String(key);
}

/**
 * `Exporter::toArray`: an object's properties. A Closure casts to `[0 => itself]` in PHP 8.5; an exception has no
 * file, line or trace here; a JS built-in has none.
 */
const ERROR_HIDDEN = new Set<string>(["message", "code", "previous", "name", "cause", "stack"]);

export function objectToArray(value: object): Entries {
  if (typeof value === "function") {
    return [[0, value]];
  }
  if (isBuiltIn(value) && !(value instanceof Error)) {
    return [];
  }
  if (value instanceof Error) {
    // A PHP exception has no `name` (a JS subclass's `this.name = …`), `cause` or `stack`: never shown or compared.
    const own = objectProps(value).filter(([key]) => typeof key !== "string" || !ERROR_HIDDEN.has(key));
    const code: unknown = (value as { code?: unknown }).code;
    const cause: unknown = (value as { cause?: unknown }).cause;
    return [["message", value.message], ["code", code ?? 0], ["previous", cause ?? null], ...own];
  }
  return objectProps(value);
}

/** `Exporter::countProperties`. */
export function countProperties(value: object): number {
  return typeof value === "function" ? 0 : objectToArray(value).length;
}

class Export {
  private nextArray = 0;
  private readonly arrays = new Map<object, number>();
  private readonly objects = new Set<object>();

  value(given: unknown, indentation: number): string {
    // A marked float exports as the float it stands for (`1.0`), as PHPUnit's exporter does.
    const value = unmarkFloat(given);
    if (value === null) {
      return "null";
    }
    if (value === undefined) {
      // AD-9 forbids `undefined`, so a message never disguises it as `null`.
      return "undefined";
    }
    switch (typeof value) {
      case "boolean":
        return value ? "true" : "false";
      case "number":
        return isInt(given) ? String(value) : exportFloat(value);
      case "bigint":
        return value.toString();
      case "string":
        return exportString(value);
      case "symbol":
        return value.toString();
      default:
        break;
    }
    const object = value as object;
    if (isResource(object)) {
      return `resource(${objectHandle(object)}) of type (${resourceType(object)})`;
    }
    if (isPhpArray(object)) {
      return this.array(object, indentation);
    }
    return this.object(object, indentation);
  }

  private body(entries: Entries, indentation: number): string {
    if (entries.length === 0) {
      return "";
    }
    const whitespace = " ".repeat(4 * indentation);
    let values = "";
    for (const [key, item] of entries) {
      values += `${whitespace}    ${exportKey(key)} => ${this.value(item, indentation + 1)},\n`;
    }
    return `\n${values}${whitespace}`;
  }

  private array(value: object, indentation: number): string {
    const active = this.arrays.get(value);
    if (active !== undefined) {
      return `Array &${active}`;
    }
    const key = this.nextArray++;
    this.arrays.set(value, key);
    try {
      return `Array &${key} [${this.body(arrayEntries(value), indentation)}]`;
    } finally {
      this.arrays.delete(value);
    }
  }

  private object(value: object, indentation: number): string {
    const name = classNameOf(value);
    const handle = objectHandle(value);
    if (this.objects.has(value)) {
      return `${name} Object #${handle}`;
    }
    this.objects.add(value);
    return `${name} Object #${handle} (${this.body(objectToArray(value), indentation)})`;
  }
}

/** `Exporter::export`. */
export function exportValue(value: unknown, indentation = 0): string {
  return new Export().value(value, indentation);
}

/** `Exporter::shorten`: one line, at most `max` code points. */
function shorten(value: string, max: number): string {
  const line = value.replace(/[\r\n]/g, "");
  const chars = Array.from(line);
  if (chars.length > max) {
    return `${chars.slice(0, max - 10).join("")}...${chars.slice(-7).join("")}`;
  }
  return line;
}

/** `Exporter::shortenedExport`. */
export function shortenedExport(value: unknown, max = 40): string {
  if (isMarkedFloat(value)) {
    // A marked float keeps its float form (`1.0`), as PHPUnit's exporter prints it.
    return exportValue(value);
  }
  if (typeof value === "string") {
    return shorten(exportString(value), max);
  }
  if (typeof value === "object" && value !== null && !isResource(value) && isPhpArray(value)) {
    return `[${arrayEntries(value).length > 0 ? "..." : ""}]`;
  }
  if ((typeof value === "object" && value !== null && !isResource(value)) || typeof value === "function") {
    return `${classNameOf(value)} Object (${countProperties(value) > 0 ? "..." : ""})`;
  }
  return exportValue(value);
}

// oxlint-disable-next-line no-control-regex -- the characters PHPUnit's Sanitizer escapes
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\r(?!\n)|[\u0080-\u009f]|[\u202a-\u202e]|[\u2066-\u2069]/g;

/** PHPUnit's `Sanitizer::sanitizeControlCharacters`. */
export function sanitizeControlCharacters(value: string): string {
  return value.replace(CONTROL, (match) => `\\u{${match.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}}`);
}

/** PHPUnit's `Util\Exporter::export`: the exporter's output, sanitized. */
export function phpunitExport(value: unknown): string {
  return sanitizeControlCharacters(exportValue(value));
}
