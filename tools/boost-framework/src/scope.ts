// The framework-mode data scope, checked on real paths (Story 7.4; FR-109,
// spine l.106).
//
// `inScope(root, abs)` holds when `abs` is an absolute string path whose real
// path lies inside, or equals, `realpath(root)/<d>` for some `d` in
// `DATA_DIRS`. The real path of a path that does not exist is the real path of
// its nearest existing ancestor, plus the remaining segments. A dangling
// symlink, a non-string or a relative path is out of scope.
//
// This module takes `realpathSync`, `lstatSync` and `statSync` through
// `process.getBuiltinModule("node:fs")` when it is evaluated, which is before
// `lockdown` (src/lockdown.ts) replaces them, and it never ESM-imports
// `node:fs`. So the check keeps working, through the originals, once the
// process is locked down.
//
// `modulePath(specifier, importer)` turns a module specifier into the absolute
// path it names, for lockdown's resolve hook: a relative one against the
// importer's directory, an absolute one as is, a `file:` URL decoded. A bare
// (package) specifier gives null.
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

const fs = process.getBuiltinModule("node:fs");
const realpathSync = fs.realpathSync;
const lstatSync = fs.lstatSync;
const statSync = fs.statSync;

/** The only top-level directories framework mode reads (spine l.106). */
export const DATA_DIRS = ["conformance", "stories", "decisions"] as const;

/** A read outside `DATA_DIRS` was refused. */
export class DataScopeError extends Error {
  constructor(path: string) {
    super(`refused: ${JSON.stringify(path)} is outside the framework-mode data scope (${DATA_DIRS.map((dir) => `${dir}/`).join(", ")})`);
    this.name = "DataScopeError";
  }
}

/** Whether something (a symlink included, dangling or not) exists at `path`. */
function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The real path of the absolute `abs`: its own when it exists, else its nearest existing ancestor's plus the
 * remaining segments. Null for a dangling symlink, or when a remaining segment is `..` (the OS would resolve it
 * physically, after a symlink that is not there yet).
 */
export function realPathOf(abs: string): string | null {
  const segments = abs.split(sep);
  for (let end = segments.length; end > 0; end--) {
    const head = segments.slice(0, end).join(sep) || sep;
    if (!present(head)) {
      continue;
    }
    let real: string;
    try {
      real = realpathSync(head);
    } catch {
      return null;
    }
    const rest = segments.slice(end).filter((segment) => segment !== "" && segment !== ".");
    if (rest.includes("..")) {
      return null;
    }
    return rest.length === 0 ? real : join(real, ...rest);
  }
  return null;
}

/** Whether `abs` is an absolute path whose real path lies inside (or is) `realpath(root)/<d>`, `d` in `DATA_DIRS`. */
export function inScope(root: string, abs: unknown): boolean {
  if (typeof abs !== "string" || abs === "" || abs.includes("\0") || !isAbsolute(abs)) {
    return false;
  }
  let base: string;
  try {
    base = realpathSync(root);
  } catch {
    return false;
  }
  const real = realPathOf(abs);
  if (real === null) {
    return false;
  }
  return DATA_DIRS.some((dir) => {
    const top = join(base, dir);
    return real === top || real.startsWith(top + sep);
  });
}

/** Whether `path` is an existing directory (the CLI's `--root` check; it runs before lockdown). */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The absolute path a module `specifier` names: `./x` and `../x` against `importer`'s directory, `/x` as is, a
 * `file:` URL decoded. Null for a bare (package) specifier, another URL scheme, or a relative one with no
 * absolute importer.
 */
export function modulePath(specifier: string, importer: string): string | null {
  if (specifier.startsWith("file:")) {
    try {
      return resolve(decodeURIComponent(new URL(specifier).pathname));
    } catch {
      return null;
    }
  }
  if (isAbsolute(specifier)) {
    return resolve(specifier);
  }
  if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../")) {
    return isAbsolute(importer) ? resolve(dirname(importer), specifier) : null;
  }
  return null;
}
