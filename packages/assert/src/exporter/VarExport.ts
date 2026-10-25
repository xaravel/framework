// PHP 8.5 `var_export($value, true)` and `serialize($value)` over the AD-9 value
// model (Story 4.3). Laravel's ArraySubset constraint prints its comparison
// failure with var_export; the canonicalizing ArrayComparator orders arrays and
// objects by their serialized form. Internal to the grader.
import { arrayEntries, isPhpArray, type Key } from "../comparison/PhpComparison";
import { classNameOf, classString, formatDouble, isInt, isResource, unmarkFloat } from "../comparison/PhpValues";
import { objectToArray } from "./Exporter";

function exportString(value: string): string {
  const escaped = value.replace(/[\\']/g, (match) => `\\${match}`);
  return `'${escaped.split("\x00").join(`' . "\\0" . '`)}'`;
}

function exportFloat(value: number): string {
  const text = formatDouble(value, 17);
  if (!Number.isFinite(value)) {
    return text;
  }
  return /[.E]/.test(text) ? text : `${text}.0`;
}

function key(name: Key): string {
  return typeof name === "string" ? exportString(name) : String(name);
}

function varExportAt(given: unknown, level: number): string {
  // A contract token exports as its class-string (AD-9.8); a marked float as the float it stands for (`1.0`), as
  // `var_export` does.
  const value = unmarkFloat(classString(given));
  if (value === undefined) {
    // AD-9 forbids `undefined`, so a message never disguises it as `NULL`.
    return "undefined";
  }
  if (value === null) {
    return "NULL";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      // An unmarked `-0` is the int `0` (ESC-9.11-2).
      return isInt(given) ? String(value) : exportFloat(value);
    case "bigint":
      return value.toString();
    case "string":
      return exportString(value);
    default:
      break;
  }
  const object = value as object;
  if (isResource(object)) {
    return "NULL";
  }
  const lead = level > 1 ? `\n${" ".repeat(level - 1)}` : "";
  const close = level > 1 ? " ".repeat(level - 1) : "";
  if (isPhpArray(object)) {
    let out = `${lead}array (\n`;
    for (const [name, item] of arrayEntries(object)) {
      out += `${" ".repeat(level + 1)}${key(name)} => ${varExportAt(item, level + 2)},\n`;
    }
    return `${out}${close})`;
  }
  const className = classNameOf(object);
  const stdClass = className === "stdClass";
  let out = stdClass ? `${lead}(object) array(\n` : `${lead}\\${className}::__set_state(array(\n`;
  const props = typeof object === "function" ? [] : objectToArray(object);
  for (const [name, item] of props) {
    out += `${" ".repeat(level + 2)}${key(name)} => ${varExportAt(item, level + 2)},\n`;
  }
  return `${out}${close}${stdClass ? ")" : "))"}`;
}

/** `var_export($value, true)`. */
export function varExport(value: unknown): string {
  return varExportAt(value, 1);
}

function serializeString(value: string): string {
  return `s:${Buffer.byteLength(value, "utf8")}:"${value}";`;
}

function serializeKey(name: Key): string {
  return typeof name === "string" ? serializeString(name) : `i:${String(name)};`;
}

/** `serialize($value)`. A Closure is not serializable, as in PHP. */
export function serialize(given: unknown): string {
  // A contract token serializes as its class-string (AD-9.8).
  const value = unmarkFloat(classString(given));
  if (value === null || value === undefined) {
    return "N;";
  }
  switch (typeof value) {
    case "boolean":
      return `b:${value ? 1 : 0};`;
    case "number":
      return isInt(given) ? `i:${String(value)};` : `d:${formatDouble(value, 17)};`;
    case "bigint":
      return `i:${value.toString()};`;
    case "string":
      return serializeString(value);
    case "function":
      throw new Error("Serialization of 'Closure' is not allowed");
    default:
      break;
  }
  const object = value as object;
  if (isResource(object)) {
    return "i:0;";
  }
  const entries = isPhpArray(object) ? arrayEntries(object) : objectToArray(object);
  const body = entries.map(([name, item]) => serializeKey(name) + serialize(item)).join("");
  if (isPhpArray(object)) {
    return `a:${entries.length}:{${body}}`;
  }
  const className = classNameOf(object);
  return `O:${Buffer.byteLength(className, "utf8")}:"${className}":${entries.length}:{${body}}`;
}
