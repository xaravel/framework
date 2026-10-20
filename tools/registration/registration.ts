// The duplicate-FQCN and registration scan (Story 6.6; AD-10, AD-22).
//
//   bun --no-env-file tools/registration/registration.ts [--root <dir>]
//       (`bun run registration:check`, a step of CI's `check` job) fails on a
//       class registration that breaks AD-10 or AD-22; it only reads files
//
// The scanned files are `git ls-files -co --exclude-standard` under the root:
// every `packages/<p>/src/**/*.{ts,tsx,mts,cts}` except declaration files,
// and every `packages/<p>/package.json`. Each source is parsed with
// `oxc-parser`; only top-level statements count.
//
// A registration is a top-level `registerClass(...)` expression statement. A
// conforming one is `registerClass('<FQCN>', X)`: two arguments, a string
// literal shaped as a PHP FQCN (identifier segments joined by single `\`,
// optional leading `\`) and an identifier. Any other top-level `registerClass` call
// is a violation. The rules:
//
// - Duplicates (AD-22, every package, graders included): an FQCN registered
//   at more than one site (compared case-insensitively, without a leading
//   `\`) fails at each site after the first (by path, then line), naming the
//   first site and both packages.
// - Framework files (AD-10): in a package whose `tools/scaffold/packages.jsonl`
//   row is not `kind: "grader"` (a package the table lacks, or a root with no
//   table, counts as framework), each exported class (`export class X`,
//   `export abstract class X`, `export default class X`, or a local class
//   named in a local `export { X }` / `export { X as Y }` or by
//   `export default X`; an anonymous default class always fails; `declare` classes
//   are skipped) must be the second argument of a conforming `registerClass`
//   in the file's trailing run of top-level statements, which must hold only
//   conforming `registerClass` calls (empty statements are skipped).
// - `sideEffects` (AD-10): a package `package.json` whose top-level
//   `sideEffects` is `false` or a list fails, at the key. Invalid JSON fails.
//
// The scan is syntactic: an aliased or member-expression `registerClass`
// (`r(...)`, `registry.registerClass(...)`) is not a registration, and a
// class re-exported from another file (`export { X } from "./X"`) is checked
// only in the file that declares it.
//
// Each violation is one line, `<path>:<line>:<col>: <message> (AD-10)`
// (`(AD-22)` for duplicates), on stderr, sorted by path, line and col. A file
// that does not parse is a violation at that file. Exit codes: 0 none (prints
// `registration: ok (<f> files, <r> registrations)`, counting the sources and
// `package.json` files scanned and the conforming registrations), 1 any
// violation or failure, 2 usage error.
import { existsSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { node, nodes, type Node } from "../async-surface/async-surface";
import { gitFiles } from "../lint-rules/disables";
import { TABLE_PATH } from "../scaffold/scaffold";
import { readTable } from "../scaffold/table";

export interface Violation {
  readonly path: string;
  readonly line: number;
  readonly col: number;
  readonly message: string;
  /** The AD the violation breaks. */
  readonly ad: "AD-10" | "AD-22";
}

export interface ScanFile {
  /** Root-relative, `/`-separated. */
  readonly path: string;
  readonly text: string;
}

export interface ScanResult {
  /** Sorted by path, then line, then col. */
  readonly violations: readonly Violation[];
  /** How many sources and `package.json` files were scanned. */
  readonly files: number;
  /** How many conforming `registerClass` calls were found. */
  readonly registrations: number;
}

/** One conforming `registerClass('<FQCN>', X)` site. */
interface Registration {
  readonly fqcn: string;
  readonly path: string;
  readonly pkg: string;
  readonly line: number;
  readonly col: number;
}

export const SHAPE_MESSAGE = "registerClass must be called as registerClass('<FQCN>', X) with a string literal FQCN";
const SOURCE = /^packages\/([^/]+)\/src\/.+\.(?:ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const PACKAGE_JSON = /^packages\/([^/]+)\/package\.json$/;
/** A PHP FQCN: identifier segments joined by single `\`, with an optional leading `\`. */
const FQCN = /^\\?[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*(?:\\[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)*$/;
/** The name `exportedClasses` gives an anonymous `export default class {}`. */
const ANONYMOUS = "";

export function formatViolation(violation: Violation): string {
  return `${violation.path}:${violation.line}:${violation.col}: ${violation.message} (${violation.ad})`;
}

/** Whether a root-relative path is a scanned source (`packages/<p>/src/**`, not a declaration file). */
export function isSource(path: string): boolean {
  return SOURCE.test(path) && !DECLARATION.test(path);
}

/** Whether a root-relative path is a package `package.json`. */
export function isPackageJson(path: string): boolean {
  return PACKAGE_JSON.test(path);
}

/** The package directory name of `packages/<p>/…`. */
function packageOf(path: string): string {
  return path.split("/")[1]!;
}

/** 1-based line and column of a UTF-16 offset. */
function position(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, col: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

/** The callee-`registerClass` call of a top-level statement, or null. */
function registerCall(statement: Node): Node | null {
  if (statement.type !== "ExpressionStatement") {
    return null;
  }
  const call = node(statement["expression"]);
  if (call === null || call.type !== "CallExpression") {
    return null;
  }
  const callee = node(call["callee"]);
  return callee !== null && callee.type === "Identifier" && callee["name"] === "registerClass" ? call : null;
}

/** A conforming call's FQCN and class identifier, or null. */
function conforming(call: Node): { fqcn: string; name: string } | null {
  const args = nodes(call["arguments"]);
  if (args.length !== 2) {
    return null;
  }
  const [fqcn, cls] = args as [Node, Node];
  if (fqcn.type !== "Literal" || typeof fqcn["value"] !== "string" || !FQCN.test(fqcn["value"]) || cls.type !== "Identifier" || typeof cls["name"] !== "string") {
    return null;
  }
  return { fqcn: fqcn["value"], name: cls["name"] };
}

/** The non-`declare` class a `ClassDeclaration` node names, or null. */
function classOf(value: unknown): Node | null {
  const n = node(value);
  return n !== null && n.type === "ClassDeclaration" && n["declare"] !== true ? n : null;
}

/** The exported classes of a program body: each class's local name and declaration node. */
function exportedClasses(body: readonly Node[]): { name: string; at: Node }[] {
  const local = new Map<string, Node>();
  for (const statement of body) {
    const cls = classOf(statement);
    const id = cls === null ? null : node(cls["id"]);
    if (cls !== null && id !== null && typeof id["name"] === "string") {
      local.set(id["name"], cls);
    }
  }
  const out: { name: string; at: Node }[] = [];
  const seen = new Set<string>();
  const add = (name: string, at: Node): void => {
    if (!seen.has(name)) {
      seen.add(name);
      out.push({ name, at });
    }
  };
  for (const statement of body) {
    if (statement.type === "ExportNamedDeclaration") {
      if (node(statement["source"]) !== null || statement["exportKind"] === "type") {
        continue;
      }
      const cls = classOf(statement["declaration"]);
      const id = cls === null ? null : node(cls["id"]);
      if (cls !== null && id !== null && typeof id["name"] === "string") {
        add(id["name"], cls);
      }
      for (const specifier of nodes(statement["specifiers"])) {
        const name = node(specifier["local"]);
        if (specifier["exportKind"] === "type" || name === null || typeof name["name"] !== "string") {
          continue;
        }
        const target = local.get(name["name"]);
        if (target !== undefined) {
          add(name["name"], target);
        }
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      const declaration = node(statement["declaration"]);
      const cls = classOf(declaration);
      if (cls !== null) {
        const id = node(cls["id"]);
        add(id !== null && typeof id["name"] === "string" ? id["name"] : ANONYMOUS, cls);
      } else if (declaration !== null && declaration.type === "Identifier" && typeof declaration["name"] === "string") {
        const target = local.get(declaration["name"]);
        if (target !== undefined) {
          add(declaration["name"], target);
        }
      }
    }
  }
  return out;
}

/** The violations and conforming registrations of one source. */
function scanSource(file: ScanFile, framework: boolean): { violations: Violation[]; registrations: Registration[] } {
  const violations: Violation[] = [];
  const registrations: Registration[] = [];
  const lang = file.path.endsWith(".tsx") ? "tsx" : "ts";
  const parsed = parseSync(file.path, file.text, { lang });
  if (parsed.errors.length > 0) {
    const error = parsed.errors[0]!;
    const offset = error.labels[0]?.start ?? 0;
    return { violations: [{ path: file.path, ...position(file.text, offset), message: `does not parse: ${error.message}`, ad: "AD-10" }], registrations };
  }
  const body = nodes(parsed.program.body);
  for (const statement of body) {
    const call = registerCall(statement);
    if (call === null) {
      continue;
    }
    const at = position(file.text, statement.start);
    const ok = conforming(call);
    if (ok === null) {
      violations.push({ path: file.path, ...at, message: SHAPE_MESSAGE, ad: "AD-10" });
    } else {
      registrations.push({ fqcn: ok.fqcn, path: file.path, pkg: packageOf(file.path), ...at });
    }
  }
  if (framework) {
    const trailing = new Set<string>();
    for (let i = body.length - 1; i >= 0; i--) {
      if (body[i]!.type === "EmptyStatement") {
        continue;
      }
      const call = registerCall(body[i]!);
      const ok = call === null ? null : conforming(call);
      if (ok === null) {
        break;
      }
      trailing.add(ok.name);
    }
    for (const { name, at } of exportedClasses(body)) {
      if (name === ANONYMOUS) {
        violations.push({ path: file.path, ...position(file.text, at.start), message: "exports an anonymous default class, which cannot be registered; name it and end the file with registerClass('<FQCN>', <Name>)", ad: "AD-10" });
      } else if (!trailing.has(name)) {
        violations.push({ path: file.path, ...position(file.text, at.start), message: `exports class ${name} but does not end with registerClass('<FQCN>', ${name})`, ad: "AD-10" });
      }
    }
  }
  return { violations, registrations };
}

/** The UTF-16 offset of the last top-level `key` in a JSON object text, or null. */
function topLevelKey(text: string, key: string): number | null {
  let depth = 0;
  let found: number | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      i++;
      while (i < text.length && text[i] !== '"') {
        i += text[i] === "\\" ? 2 : 1;
      }
      if (depth === 1 && /^\s*:/.test(text.slice(i + 1)) && JSON.parse(text.slice(start, i + 1)) === key) {
        found = start;
      }
    } else if (c === "{" || c === "[") {
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
    }
  }
  return found;
}

/** The violations of one package `package.json`. */
function scanPackageJson(file: ScanFile): Violation[] {
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch (error) {
    return [{ path: file.path, line: 1, col: 1, message: `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, ad: "AD-10" }];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: file.path, line: 1, col: 1, message: "is not a JSON object", ad: "AD-10" }];
  }
  const sideEffects = (value as Record<string, unknown>)["sideEffects"];
  let message: string | null = null;
  if (sideEffects === false) {
    message = 'sets "sideEffects": false, which lets bundlers drop registerClass side effects';
  } else if (Array.isArray(sideEffects)) {
    message = 'sets "sideEffects" to a list, which marks every other file side-effect-free';
  }
  if (message === null) {
    return [];
  }
  const offset = topLevelKey(file.text, "sideEffects");
  return [{ path: file.path, ...(offset === null ? { line: 1, col: 1 } : position(file.text, offset)), message, ad: "AD-10" }];
}

function compare(a: { path: string; line: number; col: number }, b: { path: string; line: number; col: number }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || a.col - b.col;
}

/**
 * Scans `files` (root-relative paths; anything that is neither a scanned source nor a package `package.json` is
 * ignored). `graders` holds the package directory names exempt from the framework-file rule.
 */
export function scanRegistrations(files: readonly ScanFile[], graders: ReadonlySet<string>): ScanResult {
  const violations: Violation[] = [];
  const registrations: Registration[] = [];
  let scanned = 0;
  for (const file of files) {
    if (isSource(file.path)) {
      scanned++;
      const result = scanSource(file, !graders.has(packageOf(file.path)));
      violations.push(...result.violations);
      registrations.push(...result.registrations);
    } else if (isPackageJson(file.path)) {
      scanned++;
      violations.push(...scanPackageJson(file));
    }
  }
  // PHP class names are case-insensitive and a leading `\` is optional, so `\A\Foo` and `a\foo` are `A\Foo`.
  const byFqcn = new Map<string, Registration[]>();
  for (const registration of registrations) {
    const key = registration.fqcn.replace(/^\\/, "").toLowerCase();
    const sites = byFqcn.get(key) ?? [];
    sites.push(registration);
    byFqcn.set(key, sites);
  }
  for (const sites of byFqcn.values()) {
    if (sites.length < 2) {
      continue;
    }
    const [first, ...rest] = [...sites].sort(compare) as [Registration, ...Registration[]];
    for (const site of rest) {
      violations.push({
        path: site.path,
        line: site.line,
        col: site.col,
        message: `${site.fqcn} is already registered in ${first.path}:${first.line} (package ${first.pkg}); registered again here (package ${site.pkg})`,
        ad: "AD-22",
      });
    }
  }
  return { violations: violations.sort(compare), files: scanned, registrations: registrations.length };
}

/** The grader package directory names under `packages/` in the root's scaffold table; empty when it has none. */
export function graderPackages(root: string): Set<string> {
  const table = join(root, TABLE_PATH);
  if (!existsSync(table)) {
    return new Set();
  }
  return new Set(
    readTable(table)
      .filter((row) => row.kind === "grader" && posix.dirname(row.dir) === "packages")
      .map((row) => posix.basename(row.dir)),
  );
}

/** Scans the repository at `root`. */
export function findRegistrations(root: string): ScanResult {
  const files = gitFiles(root)
    .filter((path) => (isSource(path) || isPackageJson(path)) && existsSync(join(root, path)))
    .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
  return scanRegistrations(files, graderPackages(root));
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/registration/registration.ts [--root <dir>]";

function parseRoot(argv: readonly string[]): string {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export function main(argv: readonly string[]): number {
  try {
    const root = parseRoot(argv);
    const { violations, files, registrations } = findRegistrations(root);
    if (violations.length > 0) {
      process.stderr.write(`${violations.map(formatViolation).join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`registration: ok (${files} files, ${registrations} registrations)\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`registration: check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
