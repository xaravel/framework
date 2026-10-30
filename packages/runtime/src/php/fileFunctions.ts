// PHP's `file_get_contents` for a local path, as vlucas/phpdotenv v5.7.0's `Store\File\Reader` calls it
// (`@\file_get_contents($path)`; action item epic-15-item-3-runtime-process-environment, ESC-15.2-3): a port of PHP
// 8.5.11's `ext/standard/file.c` over the plain-files wrapper, in coercive typing mode. The read is sync
// (`readFileSync`): it runs once at boot, the loaded-once case AD-6 keeps sync, and is not `Filesystem` IO. A missing
// or unreadable file gives `false` with no warning (DIV-9.17). Nothing is cached.
//
// The runtime has no resources and no stream wrappers, so a registered wrapper's path (`php://`, `http://`, `file://`,
// `data:`),
// `$use_include_path` true or a non-null `$context` throws a JS `TypeError` naming the limit, as do contents JS cannot
// hold (bytes that are no valid UTF-8).
import { readFileSync } from "node:fs";
import { boolParameter, intParameter, nullableIntParameter, stringParameter } from "./phpArguments";
import { decodeResult, wellFormed } from "./stringFunctions";
import { ValueError } from "./ValueError";

/** PHP 8.5.11's registered stream wrappers (`stream_get_wrappers()` on the probe's host), plain files' `file` included. */
const WRAPPERS: ReadonlySet<string> = new Set(["https", "ftps", "compress.zlib", "compress.bzip2", "php", "file", "glob", "data", "http", "ftp", "phar", "zip"]);

/**
 * Whether PHP's `php_stream_locate_url_wrapper` hands `path` to a registered wrapper: a scheme of 2 or more
 * `[A-Za-z0-9+.-]` characters (matched case-insensitively) before `://`, or `data:`. Any other scheme (`foo://x`,
 * `c://x`) is a local relative path, as PHP reads it.
 */
function wrapped(path: string): boolean {
  if (path.startsWith("data:")) {
    return true;
  }
  const scheme = /^([A-Za-z0-9+.-]{2,}):\/\//.exec(path);
  return scheme !== null && WRAPPERS.has(scheme[1]!.toLowerCase());
}

/** The limit for a form the runtime does not read. */
function limit(what: string): TypeError {
  return new TypeError(`file_get_contents(): ${what} is not supported: the runtime reads local files only, with no stream wrappers or resources`);
}

/** The file's bytes, `"directory"` for a directory (PHP reads it as empty), or null when PHP cannot open it. */
function readBytes(path: string): Uint8Array | "directory" | null {
  try {
    return readFileSync(path);
  } catch (error) {
    if ((error as { code?: unknown }).code === "EISDIR") {
      return "directory";
    }
    return null;
  }
}

/**
 * PHP's `file_get_contents($filename, $use_include_path = false, $context = null, $offset = 0, $length = null)`: the
 * contents of the local file `filename` from byte `offset` (a negative one counts from the end), at most `length` bytes
 * (null to the end), as a string. `false`, with no warning (DIV-9.17), when the file is missing or unreadable, a path
 * component is no directory, or a negative `offset` reaches before the start; an `offset` past the end gives `""`, and
 * so does a directory. An empty `filename` throws PHP's `ValueError` `Path must not be empty`, one holding a NUL byte
 * `file_get_contents(): Argument #1 ($filename) must not contain any null bytes`, and a negative `length`
 * `file_get_contents(): Argument #5 ($length) must be greater than or equal to 0`. The parameters are coerced as PHP's;
 * anything else throws PHP's `TypeError`.
 */
export function file_get_contents(filename: unknown, use_include_path: unknown = false, context: unknown = null, offset: unknown = 0, length: unknown = null): string | false {
  const path = stringParameter("file_get_contents", 1, "filename", filename);
  if (path.includes("\0")) {
    throw new ValueError("file_get_contents(): Argument #1 ($filename) must not contain any null bytes");
  }
  const includePath = boolParameter("file_get_contents", 2, "use_include_path", use_include_path ?? false);
  const from = BigInt(intParameter("file_get_contents", 4, "offset", offset ?? 0));
  const max = nullableIntParameter("file_get_contents", 5, "length", length);
  if (max !== null && max < 0) {
    throw new ValueError("file_get_contents(): Argument #5 ($length) must be greater than or equal to 0");
  }
  if (context !== null && context !== undefined) {
    throw limit("a $context");
  }
  if (includePath) {
    throw limit("$use_include_path true");
  }
  if (path === "") {
    throw new ValueError("Path must not be empty");
  }
  wellFormed("file_get_contents", path);
  if (wrapped(path)) {
    throw limit(`the stream wrapper of "${path}"`);
  }
  const bytes = readBytes(path);
  if (bytes === null) {
    return false;
  }
  if (bytes === "directory") {
    return "";
  }
  const size = BigInt(bytes.length);
  const start = from < 0n ? size + from : from;
  if (start < 0n) {
    return false;
  }
  if (start >= size) {
    return "";
  }
  const end = max === null || BigInt(max) >= size - start ? size : start + BigInt(max);
  return decodeResult("file_get_contents", bytes.subarray(Number(start), Number(end)));
}
