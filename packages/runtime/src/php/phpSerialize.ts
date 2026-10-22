// PHP's `serialize()` over the AD-9 value model (Story 9.7, AD-23.1), mirroring PHP 8.5's `php_var_serialize_intern`
// (`ext/standard/var.c`): byte for byte the string PHP writes for the same value, so cache entries, sessions and queued
// payloads interoperate with PHP Laravel (FR-77).
//
// - Scalars: `N;`, `b:0;`/`b:1;`, `i:<n>;` (a `bigint` in exact digits), `d:<float>;` at `serialize_precision = -1`,
//   `s:<UTF-8 byte length>:"<text>";`. A string with a lone surrogate has no UTF-8 form and throws a `TypeError`.
// - Arrays (a list, a plain object or a `PhpArray`, read through `arrayEntries`): `a:<n>:{<key><value>…}`, keys `i:` or
//   `s:` as normalised. A JS array that contains itself (a PHP array cannot, without references) throws PHP's
//   comparison message `Nesting level too deep - recursive dependency?`.
// - Objects, by Registry FQCN (`fqcn()` throws for an unregistered class): `__serialize()` (a PHP array, keys verbatim;
//   else PHP's `TypeError` `<FQCN>::__serialize() must return an array`), else `__sleep()` (a result that is no array
//   writes `N;`, as PHP does after its warnings; a name is written once), else the object's properties.
//   - A class that declares a PHP property table (`[Symbol.for('xaravel.php.properties')]`, ESC-9.7-1 part 1) writes
//     its declared properties under PHP's names (`\0*\0x` protected, `\0<declaring FQCN>\0x` private) in PHP's order,
//     a missing one as its default, then its dynamic ones. Its `__sleep()` names are looked up as PHP looks them up:
//     as given, then as the object's class's private, then as protected.
//   - A class without a table writes `__sleep()` names verbatim, skipping a name whose unmangled form is no own
//     property, and otherwise its props (`[Symbol.for('xaravel.php.props')]()`, else the own enumerable string keys),
//     always as `s:` keys.
//   `__PHP_Incomplete_Class` writes its original name and raw entries back. A function is a `Closure`, which PHP
//   refuses: `Serialization of 'Closure' is not allowed` (an `Error` until Story 9.10 ports PHP's `Exception`).
// - Back-references as `php_add_var_hash` numbers them: every serialized value takes the next slot (an emitted `r:`
//   included), map keys and the array `__serialize()` returns take none, and a repeated object is `r:<slot>;`.
//
// PHP's warnings and notices (a missing `__sleep` name) are not reproduced: PHP still returns the string, and so does
// `phpSerialize`. Enums, `Serializable` and PHP references have no AD-9 value, so `E:`, `C:` and `R:` are never written.
import { fqcn } from "../registry/registry";
import { arrayEntries, floatValue, phpType } from "./casts";
import { __PHP_Incomplete_Class } from "./__PHP_Incomplete_Class";
import { LONE_SURROGATE, propertyTable, type PhpPropertySlot, unmangle, utf8 } from "./mangle";

const PHP_PROPS = Symbol.for("xaravel.php.props");
const RECURSION = "Nesting level too deep - recursive dependency?";

interface State {
  /** The number of slots taken so far (`php_serialize_data.n`). */
  slots: number;
  /** The slot of each object already written, by identity. */
  readonly objects: Map<object, number>;
  /** The arrays being written, to refuse a JS array that contains itself. */
  readonly path: Set<object>;
}

/**
 * A float as `serialize()` writes it at `serialize_precision = -1` (`smart_str_append_double` with `zend_gcvt` over
 * the shortest round-trip digits): `d.dddE±x` when the decimal-point position is below -3 or above 17 (`.0` after a
 * one-digit mantissa), else positional; `INF`, `-INF`, `NAN`, and `-0` for -0.0. Internal to the codec.
 */
export function formatSerializeFloat(x: number): string {
  if (Number.isNaN(x)) {
    return "NAN";
  }
  if (!Number.isFinite(x)) {
    return x > 0 ? "INF" : "-INF";
  }
  if (x === 0) {
    return Object.is(x, -0) ? "-0" : "0";
  }
  const sign = x < 0 ? "-" : "";
  // toExponential() without a fraction count gives the shortest digits that round-trip, as zend_dtoa mode 0 does.
  const [mantissa, exponentText] = Math.abs(x).toExponential().split("e") as [string, string];
  const digits = mantissa.replace(".", "");
  const exponent = Number(exponentText);
  // |x| = 0.d1d2… * 10^decpt.
  const decpt = exponent + 1;
  if (decpt < -3 || decpt > 17) {
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}E${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`;
  }
  if (decpt <= 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  const integer = digits.length >= decpt ? digits.slice(0, decpt) : digits + "0".repeat(decpt - digits.length);
  const fraction = digits.slice(decpt);
  return fraction === "" ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;
}

function serializeString(s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError("phpSerialize(): the string holds a lone surrogate, which has no UTF-8 form");
  }
  return `s:${utf8.encode(s).length}:"${s}";`;
}

function serializeKey(key: number | bigint | string): string {
  return typeof key === "string" ? serializeString(key) : `i:${key};`;
}

/** `O:<len>:"<name>":<n>:{…}` over `[key, value]` members, each value taking its slot. */
function serializeMembers(name: string, members: readonly (readonly [number | bigint | string, unknown])[], state: State): string {
  let out = `O:${utf8.encode(name).length}:"${name}":${members.length}:{`;
  for (const [key, value] of members) {
    out += serializeKey(key) + serializeValue(value, state);
  }
  return `${out}}`;
}

/**
 * The properties of an object whose class declares a PHP property table, by serialized name, in PHP's order: each
 * declared one (its JS value, or its default when the object has no such own property), then the object's other own
 * enumerable string keys as dynamic public properties.
 */
function declaredProps(o: object, table: readonly PhpPropertySlot[]): Map<string, unknown> {
  const record = o as Record<string, unknown>;
  const props = new Map<string, unknown>();
  const declared = new Set<string>();
  for (const slot of table) {
    declared.add(slot.name);
    props.set(slot.key, Object.hasOwn(o, slot.name) ? (record[slot.name] ?? null) : slot.default);
  }
  for (const key of Object.keys(o)) {
    if (!declared.has(key) && !props.has(key)) {
      props.set(key, record[key] ?? null);
    }
  }
  return props;
}

function serializeObject(o: object, state: State): string {
  if (typeof o === "function") {
    throw new Error("Serialization of 'Closure' is not allowed");
  }
  if (o instanceof __PHP_Incomplete_Class) {
    return serializeMembers(o.__PHP_Incomplete_Class_Name, o.entries(), state);
  }
  const name = fqcn(o);
  const record = o as Record<string | symbol, unknown>;
  const serialize: unknown = record["__serialize"];
  if (typeof serialize === "function") {
    const data: unknown = (serialize as () => unknown).call(o);
    if (phpType(data) !== "array") {
      throw new TypeError(`${name}::__serialize() must return an array`);
    }
    return serializeMembers(name, arrayEntries(data as object), state);
  }
  const table = propertyTable(Reflect.get(Object.getPrototypeOf(o) as object, "constructor") as object);
  const sleep: unknown = record["__sleep"];
  if (typeof sleep === "function") {
    const names: unknown = (sleep as () => unknown).call(o);
    if (phpType(names) !== "array") {
      return "N;";
    }
    const members: [string, unknown][] = [];
    const written = new Set<string>();
    const lookup = table === null ? null : declaredProps(o, table);
    for (const [, entry] of arrayEntries(names as object)) {
      // PHP skips a non-string name, and writes a property once.
      if (typeof entry !== "string") {
        continue;
      }
      if (lookup === null) {
        const property = unmangle(entry);
        if (!written.has(entry) && Object.hasOwn(o, property)) {
          written.add(entry);
          members.push([entry, record[property] ?? null]);
        }
        continue;
      }
      // php_var_serialize_get_sleep_props: the name as given, then as the object's class's private, then protected.
      const key = [entry, `\0${name}\0${entry}`, `\0*\0${entry}`].find((candidate) => lookup.has(candidate));
      if (key !== undefined && !written.has(key)) {
        written.add(key);
        members.push([key, lookup.get(key)]);
      }
    }
    return serializeMembers(name, members, state);
  }
  if (table !== null) {
    return serializeMembers(name, [...declaredProps(o, table)], state);
  }
  const props: unknown = record[PHP_PROPS];
  if (typeof props === "function") {
    const data: unknown = (props as () => unknown).call(o);
    const entries = typeof data === "object" && data !== null && phpType(data) === "array" ? arrayEntries(data) : [];
    return serializeMembers(
      name,
      entries.map(([key, value]) => [String(key), value] as const),
      state,
    );
  }
  return serializeMembers(
    name,
    Object.keys(o).map((key) => [key, record[key] ?? null] as const),
    state,
  );
}

function serializeValue(v: unknown, state: State): string {
  // Every value takes the next slot (php_add_var_hash), an emitted r: included.
  state.slots++;
  switch (phpType(v)) {
    case "null":
      return "N;";
    case "bool":
      return v === true ? "b:1;" : "b:0;";
    case "int":
      return `i:${v as number | bigint};`;
    case "float":
      return `d:${formatSerializeFloat(floatValue(v))};`;
    case "string":
      return serializeString(v as string);
    case "array": {
      const array = v as object;
      if (state.path.has(array)) {
        throw new Error(RECURSION);
      }
      state.path.add(array);
      try {
        const entries = arrayEntries(array);
        let out = `a:${entries.length}:{`;
        for (const [key, value] of entries) {
          out += serializeKey(key) + serializeValue(value, state);
        }
        return `${out}}`;
      } finally {
        state.path.delete(array);
      }
    }
    default:
      break;
  }
  const o = v as object;
  const seen = state.objects.get(o);
  if (seen !== undefined) {
    return `r:${seen};`;
  }
  state.objects.set(o, state.slots);
  return serializeObject(o, state);
}

/**
 * PHP's `serialize($value)`: the bytes PHP writes for the same value, as a JS string (its UTF-8 encoding is the
 * payload). `undefined` reads as `null`. Throws `fqcn()`'s `TypeError` for an object of an unregistered class, an
 * `Error` `Serialization of 'Closure' is not allowed` for a function, PHP's `TypeError`
 * `<FQCN>::__serialize() must return an array`, a `TypeError` for a lone surrogate, and an `Error`
 * `Nesting level too deep - recursive dependency?` for a JS array that contains itself.
 */
export function phpSerialize(value: unknown): string {
  return serializeValue(value, { slots: 0, objects: new Map(), path: new Set() });
}
