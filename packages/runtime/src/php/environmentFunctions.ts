// PHP's process environment as vlucas/phpdotenv v5.7.0 reads and writes it (action item
// epic-15-item-3-runtime-process-environment; ESC-15.2-1 part g, ESC-15.2-2): `getenv` and `putenv` over
// `process.env`, ports of PHP 8.5.11's `ext/standard/basic_functions.c` in coercive typing mode, and `superglobals`,
// the two process-wide arrays that stand for `$_SERVER` and `$_ENV`.
//
// The two arrays are seeded once, when this module loads, from `process.env`, as the PHP CLI seeds them under the
// Oracle image's `variables_order`: the image (`php:8.5.11-cli-trixie`) ships no php.ini, so PHP's built-in `EGPCS`
// applies and both arrays get the environment. They are never re-read: a later `putenv` or `process.env` write is seen
// by `getenv` only, as in PHP. They are boot-time process state, not per-request state, so AD-5's frame slots do not
// apply (ESC-15.2-2). `$_SERVER`'s keys that do not come from the environment (`PHP_SELF`, `argv`, `REQUEST_TIME`, …)
// are not in it; an Http Story that needs request keys builds its own bag.
//
// One import routine, PHP's `import_environment_variable` (`main/php_variables.c`), builds `getenv()`'s array and both
// superglobals: an entry whose name is empty or holds ` `, `.` or `[` is skipped, and an integer-like name is an int
// key. `process.env` enumerates integer-like names first, where PHP keeps `environ` order; only those names move.
import { boolParameter, argumentTypeError, stringParameter } from "./phpArguments";
import { PhpArray } from "./PhpArray";
import { wellFormed } from "./stringFunctions";
import { toStringArgument } from "./throwableArguments";
import { ValueError } from "./ValueError";

/** `name`, refused with a JS `TypeError` when it holds a NUL byte, which no C environment string can hold. */
function noNul(fn: string, s: string): string {
  if (s.includes("\0")) {
    throw new TypeError(`${fn}(): the string holds a NUL byte, which the process environment cannot hold`);
  }
  return s;
}

/** Whether PHP's `valid_environment_name` takes `name` (and it is not empty). */
function importable(name: string): boolean {
  return name !== "" && !/[ .[]/.test(name);
}

/** PHP's `php_import_environment_variables`: every importable entry of `process.env` now, as a fresh `PhpArray`. */
function importEnvironment(): PhpArray {
  const array = new PhpArray();
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && importable(name)) {
      array.set(name, value);
    }
  }
  return array;
}

/**
 * `$_SERVER` and `$_ENV`, as the PHP CLI seeds them from the environment: two separate `PhpArray`s built once when
 * this module loads and never re-read. A port reads and writes them as PHP code reads and writes the superglobals.
 */
export const superglobals: { readonly server: PhpArray; readonly env: PhpArray } = Object.freeze({
  server: importEnvironment(),
  env: importEnvironment(),
});

/**
 * PHP's `getenv($name = null, $local_only = false)`: the value of the environment variable `name` (a string, `""` when
 * set empty), or `false` when it is not set; with `name` null, a `PhpArray` of every environment entry, filtered and
 * keyed as `$_ENV` is. Read from `process.env` at the call, so a `putenv` is seen. `local_only` changes nothing in the
 * CLI. `name` is coerced as PHP's `?string` parameter and `local_only` as its `bool`; anything else throws PHP's
 * `TypeError`. A name holding a NUL byte or a lone surrogate throws a JS `TypeError` naming the limit. A name holding
 * `=` matches as glibc's `getenv` (the Oracle image's libc) does: the text after `<name>=` in the first entry, in
 * `process.env` order, whose `<entry name>=<value>` starts with `<name>=`, else `false`
 * (`decisions/MAINT-2026-10-30-epic-15-items-2-5.md`, Item 5).
 */
export function getenv(name: unknown = null, local_only: unknown = false): string | false | PhpArray {
  let key: string | null = null;
  if (name !== null && name !== undefined) {
    const coerced = toStringArgument(name);
    if (coerced === null) {
      throw argumentTypeError("getenv", 1, "name", "?string", name);
    }
    key = coerced;
  }
  boolParameter("getenv", 2, "local_only", local_only ?? false);
  if (key === null) {
    return importEnvironment();
  }
  noNul("getenv", wellFormed("getenv", key));
  if (key === "") {
    return false;
  }
  if (Object.hasOwn(process.env, key)) {
    return process.env[key] ?? false;
  }
  if (key.includes("=")) {
    const prefix = `${key}=`;
    for (const [entryName, value] of Object.entries(process.env)) {
      const entry = `${entryName}=${value ?? ""}`;
      if (entry.startsWith(prefix)) {
        return entry.slice(prefix.length);
      }
    }
  }
  return false;
}

/**
 * PHP's `putenv($assignment)`: `"NAME=value"` sets `NAME` (the value after the first `=`, `""` included), `"NAME"`
 * unsets it; `true` either way. It writes `process.env` only; `superglobals` are left as they are, as PHP leaves
 * `$_SERVER` and `$_ENV`. An empty assignment or one starting with `=` throws PHP's `ValueError` `putenv(): Argument
 * #1 ($assignment) must have a valid syntax`. Coerced as PHP's `string` parameter; anything else throws PHP's
 * `TypeError`. An assignment holding a NUL byte or a lone surrogate throws a JS `TypeError` naming the limit.
 */
export function putenv(assignment: unknown): boolean {
  const setting = stringParameter("putenv", 1, "assignment", assignment);
  if (setting === "" || setting.startsWith("=")) {
    throw new ValueError("putenv(): Argument #1 ($assignment) must have a valid syntax");
  }
  noNul("putenv", wellFormed("putenv", setting));
  const equals = setting.indexOf("=");
  if (equals === -1) {
    delete process.env[setting];
  } else {
    process.env[setting.slice(0, equals)] = setting.slice(equals + 1);
  }
  return true;
}
