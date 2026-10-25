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
//   refuses: `Serialization of 'Closure' is not allowed` (PHP's `Exception`, ESC-9.7-1 part 4).
// - Back-references as `php_add_var_hash` numbers them: every serialized value takes the next slot (an emitted `r:`
//   included), map keys and the array `__serialize()` returns take none, and a repeated object is `r:<slot>;`.
//
// PHP's warnings and notices (a missing `__sleep` name) are not reproduced: PHP still returns the string, and so does
// `phpSerialize`. Enums, `Serializable` and PHP references have no AD-9 value, so `E:`, `C:` and `R:` are never written.
import { fqcn, isContractToken } from "../registry/registry";
import { arrayEntries, floatValue, phpType } from "./casts";
import { Exception } from "./Exception";
import { gcvt } from "./gcvt";
import { __PHP_Incomplete_Class } from "./__PHP_Incomplete_Class";
import { declaredProps, LONE_SURROGATE, objectProps, objectTable, unmangle, utf8 } from "./mangle";
import { TypeError as PhpTypeError } from "./TypeError";

const RECURSION = "Nesting level too deep - recursive dependency?";

interface State {
  /** The number of slots taken so far (`php_serialize_data.n`). */
  slots: number;
  /** The slot of each object already written, by identity. */
  readonly objects: Map<object, number>;
  /** The arrays being written, to refuse a JS array that contains itself. */
  readonly path: Set<object>;
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

function serializeObject(o: object, state: State): string {
  if (typeof o === "function") {
    throw new Exception("Serialization of 'Closure' is not allowed");
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
      throw new PhpTypeError(`${name}::__serialize() must return an array`);
    }
    return serializeMembers(name, arrayEntries(data as object), state);
  }
  const table = objectTable(o);
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
  return serializeMembers(name, objectProps(o), state);
}

function serializeValue(v: unknown, state: State): string {
  // Every value takes the next slot (php_add_var_hash), an emitted r: included.
  state.slots++;
  // A contract token is its FQCN class-string as a PHP value, as `Arrayable::class` is (AD-9.8).
  if (isContractToken(v)) {
    return serializeString(fqcn(v));
  }
  switch (phpType(v)) {
    case "null":
      return "N;";
    case "bool":
      return v === true ? "b:1;" : "b:0;";
    case "int":
      return `i:${v as number | bigint};`;
    case "float":
      return `d:${gcvt(floatValue(v), "E")};`;
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
 * payload). `undefined` reads as `null`. Throws `fqcn()`'s `TypeError` for an object of an unregistered class, PHP's
 * `Exception` `Serialization of 'Closure' is not allowed` for a function, PHP's `TypeError`
 * `<FQCN>::__serialize() must return an array`, a `TypeError` for a lone surrogate, and an `Error`
 * `Nesting level too deep - recursive dependency?` for a JS array that contains itself.
 */
export function phpSerialize(value: unknown): string {
  return serializeValue(value, { slots: 0, objects: new Map(), path: new Set() });
}
