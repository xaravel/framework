// The duplicate-FQCN and registration scan (Story 6.6; AD-10, AD-22).
//
//   bun --no-env-file tools/registration/registration.ts [--root <dir>]
//       (`bun run registration:check`, a step of CI's `check` job) fails on a
//       class registration that breaks AD-10 or AD-22; it only reads files
//
// The scanned files are `git ls-files -co --exclude-standard` under the root:
// every `packages/<p>/src/**/*.{ts,tsx,mts,cts}` except declaration files,
// and every `packages/<p>/package.json`. Each source is parsed with
// `oxc-parser`; its whole AST is walked.
//
// A registration is a top-level expression statement calling the identifier
// `registerClass` directly (`recogniseRegistration`, which `tools/api-surface`
// shares). A conforming one is `registerClass('<FQCN>', X)`: two arguments, a
// string literal shaped as a PHP FQCN (identifier segments joined by single
// `\`, optional leading `\`, which `normaliseFqcn` drops) and an identifier.
// Any other top-level `registerClass` call is a violation (`SHAPE_MESSAGE`).
// Any `registerClass` call elsewhere (in a block, function, arrow or namespace,
// or wrapped: `void`, parentheses, `?.`, `!`, a sequence, a sequence callee
// `(0, registerClass)`, `.call` / `.apply`, `new`, a tagged template) is a
// violation at the call (`NESTED_MESSAGE`), and so is aliasing it (a renaming
// import or export specifier or destructure, `const r = registerClass`,
// `r = registerClass`; `ALIAS_MESSAGE`); neither is a registration. The rules:
//
// - Duplicates (AD-22, every package, graders included): an FQCN registered
//   at more than one site (compared case-insensitively, without a leading
//   `\`) fails at each site after the first (by path, then line), naming the
//   first site and both packages.
// - Framework files (AD-10): in a package whose `tools/scaffold/packages.jsonl`
//   row is not `kind: "grader"` (a package the table lacks, or a root with no
//   table, counts as framework), each exported class (`export class X`,
//   `export abstract class X`, `export default class X`, a top-level
//   `const`/`let`/`var X = class …` that is exported, or a local class or
//   class-expression binding named in a local `export { X }` /
//   `export { X as Y }` or by `export default X`; an anonymous default class or
//   a default-exported class expression always fails; `declare` classes are
//   skipped) must be the second argument of a conforming `registerClass`
//   in the file's trailing run of top-level statements, which must hold only
//   conforming `registerClass` calls (empty statements are skipped).
// - `sideEffects` (AD-10): a package `package.json` whose top-level
//   `sideEffects` is `false` or a list fails, at the key. Invalid JSON fails.
//
// The scan is syntactic: a member-expression `registerClass`
// (`registry.registerClass(...)`, `ns.registerClass(...)`), `registerClass`
// passed as a value (`f(registerClass)`, `.bind`, `Reflect.apply`) or aliased
// through a conditional or logical expression or a member read are not seen,
// `export =` and classes inside namespaces are not exported classes (and
// cannot be registered), and a class re-exported from
// another file (`export { X } from "./X"`) is checked only in the file that
// declares it.
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
import { nameOf, node, nodes, type Node } from "../async-surface/async-surface";
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
  /** The literal FQCN as written (the duplicate message names it). */
  readonly literal: string;
  /** The duplicate key: the normalised FQCN, lowercased. */
  readonly key: string;
  readonly path: string;
  readonly pkg: string;
  readonly line: number;
  readonly col: number;
}

export const SHAPE_MESSAGE = "registerClass must be called as registerClass('<FQCN>', X) with a string literal FQCN";
export const NESTED_MESSAGE = "registerClass must be called only as a top-level statement registerClass('<FQCN>', X), not nested in a block, function or namespace or wrapped in another expression";
export const ALIAS_MESSAGE = "registerClass must not be aliased; call it by its own name as registerClass('<FQCN>', X)";
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

/** A conforming registration: the FQCN without its leading `\`, the literal as written, and the class identifier. */
export interface RecognisedRegistration {
  /** The FQCN without a leading `\` (`normaliseFqcn(literal)`). */
  readonly fqcn: string;
  /** The string literal's value as written, leading `\` included. */
  readonly literal: string;
  /** The class identifier (the second argument). */
  readonly name: string;
}

/** A top-level `registerClass(...)` statement's call, and its registration when it conforms. */
export interface RecognisedCall {
  readonly call: Node;
  readonly registration: RecognisedRegistration | null;
}

/** Whether `value` is shaped as a PHP FQCN: identifier segments joined by single `\`, with an optional leading `\`. */
export function isFqcn(value: string): boolean {
  return FQCN.test(value);
}

/** A PHP FQCN without its optional leading `\` (`\A\Foo` → `A\Foo`); the case is kept. */
export function normaliseFqcn(fqcn: string): string {
  return fqcn.startsWith("\\") ? fqcn.slice(1) : fqcn;
}

/**
 * The one registration recogniser (the scan and `tools/api-surface` share it): a top-level statement that is an
 * expression statement calling the identifier `registerClass` directly (not optionally, not wrapped) yields its call,
 * with the registration when it is `registerClass('<FQCN>', X)`; any other statement yields null.
 */
export function recogniseRegistration(statement: Node): RecognisedCall | null {
  if (statement.type !== "ExpressionStatement") {
    return null;
  }
  const call = node(statement["expression"]);
  if (call === null || call.type !== "CallExpression" || call["optional"] === true) {
    return null;
  }
  const callee = node(call["callee"]);
  if (callee === null || callee.type !== "Identifier" || callee["name"] !== "registerClass") {
    return null;
  }
  return { call, registration: conforming(call) };
}

/** A conforming call's registration, or null. */
function conforming(call: Node): RecognisedRegistration | null {
  const args = nodes(call["arguments"]);
  if (args.length !== 2) {
    return null;
  }
  const [fqcn, cls] = args as [Node, Node];
  if (fqcn.type !== "Literal" || typeof fqcn["value"] !== "string" || !isFqcn(fqcn["value"]) || cls.type !== "Identifier" || typeof cls["name"] !== "string") {
    return null;
  }
  return { fqcn: normaliseFqcn(fqcn["value"]), literal: fqcn["value"], name: cls["name"] };
}

/** An expression without its parentheses, `!`, `as`, `satisfies` and `<T>` wrappers. */
function unwrap(value: unknown): Node | null {
  let n = node(value);
  while (n !== null && (n.type === "ParenthesizedExpression" || n.type === "TSNonNullExpression" || n.type === "TSAsExpression" || n.type === "TSSatisfiesExpression" || n.type === "TSTypeAssertion" || n.type === "TSInstantiationExpression")) {
    n = node(n["expression"]);
  }
  return n;
}

/** Whether an expression is the identifier `registerClass`, unwrapped (a sequence `(0, registerClass)` counts as its last expression). */
function isRegisterClass(value: unknown): boolean {
  let n = unwrap(value);
  while (n !== null && n.type === "SequenceExpression") {
    n = unwrap(nodes(n["expressions"]).at(-1) ?? null);
  }
  return n !== null && n.type === "Identifier" && n["name"] === "registerClass";
}

/** Whether a callee is `registerClass`, `registerClass.call` or `registerClass.apply` (unwrapped). */
function isRegisterClassCallee(value: unknown): boolean {
  if (isRegisterClass(value)) {
    return true;
  }
  const n = unwrap(value);
  return n !== null && n.type === "MemberExpression" && n["computed"] !== true && isRegisterClass(n["object"]) && (nameOf(n["property"]) === "call" || nameOf(n["property"]) === "apply");
}

/**
 * The shape violations anywhere in a program (`recognised` holds the top-level statement calls, which the caller checks):
 * every other call of `registerClass` (`NESTED_MESSAGE`, at the call node), whatever its position or form: direct,
 * optional or wrapped callee, a sequence callee `(0, registerClass)`, `registerClass.call` / `.apply`, `new registerClass`
 * or a tagged template; and each aliasing of `registerClass` (`ALIAS_MESSAGE`, at the renaming import or export
 * specifier, declarator, destructuring property or assignment).
 */
function strayUses(program: Node, recognised: ReadonlySet<Node>): { at: Node; message: string }[] {
  const out: { at: Node; message: string }[] = [];
  const visit = (n: Node): void => {
    if (((n.type === "CallExpression" || n.type === "NewExpression") && !recognised.has(n) && isRegisterClassCallee(n["callee"])) || (n.type === "TaggedTemplateExpression" && isRegisterClass(n["tag"]))) {
      out.push({ at: n, message: NESTED_MESSAGE });
    } else if (n.type === "ImportSpecifier" && nameOf(n["imported"]) === "registerClass" && nameOf(n["local"]) !== "registerClass") {
      out.push({ at: n, message: ALIAS_MESSAGE });
    } else if (n.type === "ExportSpecifier" && nameOf(n["local"]) === "registerClass" && nameOf(n["exported"]) !== "registerClass") {
      out.push({ at: n, message: ALIAS_MESSAGE });
    } else if (n.type === "VariableDeclarator" && isRegisterClass(n["init"])) {
      out.push({ at: n, message: ALIAS_MESSAGE });
    } else if (n.type === "AssignmentExpression" && isRegisterClass(n["right"])) {
      out.push({ at: n, message: ALIAS_MESSAGE });
    } else if (n.type === "ObjectPattern") {
      // `const { registerClass: r } = registry`: a renaming destructure.
      for (const property of nodes(n["properties"])) {
        const value = node(property["value"]);
        const bound = value !== null && value.type === "AssignmentPattern" ? node(value["left"]) : value;
        if (property.type === "Property" && property["computed"] !== true && nameOf(property["key"]) === "registerClass" && bound !== null && bound.type === "Identifier" && bound["name"] !== "registerClass") {
          out.push({ at: property, message: ALIAS_MESSAGE });
        }
      }
    }
    for (const [key, child] of Object.entries(n)) {
      if (key === "type" || typeof child !== "object" || child === null) {
        continue;
      }
      for (const sub of Array.isArray(child) ? child : [child]) {
        const c = node(sub);
        if (c !== null) {
          visit(c);
        }
      }
    }
  };
  visit(program);
  return out;
}

/** The non-`declare` class a `ClassDeclaration` node names, or null. */
function classOf(value: unknown): Node | null {
  const n = node(value);
  return n !== null && n.type === "ClassDeclaration" && n["declare"] !== true ? n : null;
}

/** The classes a variable declaration binds: each `X = class …` declarator's name and declarator node (wrappers allowed). */
function classDeclarators(value: unknown): { name: string; at: Node }[] {
  const n = node(value);
  if (n === null || n.type !== "VariableDeclaration" || n["declare"] === true) {
    return [];
  }
  const out: { name: string; at: Node }[] = [];
  for (const declarator of nodes(n["declarations"])) {
    const id = node(declarator["id"]);
    if (id !== null && id.type === "Identifier" && typeof id["name"] === "string" && unwrap(declarator["init"])?.type === "ClassExpression") {
      out.push({ name: id["name"], at: declarator });
    }
  }
  return out;
}

/** The exported classes of a program body: each class's local name and declaration (or declarator) node. */
function exportedClasses(body: readonly Node[]): { name: string; at: Node }[] {
  const local = new Map<string, Node>();
  for (const statement of body) {
    const cls = classOf(statement);
    const id = cls === null ? null : node(cls["id"]);
    if (cls !== null && id !== null && typeof id["name"] === "string") {
      local.set(id["name"], cls);
    }
    for (const { name, at } of classDeclarators(statement)) {
      local.set(name, at);
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
      for (const { name, at } of classDeclarators(statement["declaration"])) {
        add(name, at);
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
      const expression = unwrap(declaration);
      if (cls !== null) {
        const id = node(cls["id"]);
        add(id !== null && typeof id["name"] === "string" ? id["name"] : ANONYMOUS, cls);
      } else if (expression !== null && expression.type === "ClassExpression") {
        // `export default (class {})`: a class expression's own name is not in scope at the top level, so it cannot be registered either.
        add(ANONYMOUS, expression);
      } else if (expression !== null && expression.type === "Identifier" && typeof expression["name"] === "string") {
        const target = local.get(expression["name"]);
        if (target !== undefined) {
          add(expression["name"], target);
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
  const recognised = new Set<Node>();
  for (const statement of body) {
    const found = recogniseRegistration(statement);
    if (found === null) {
      continue;
    }
    recognised.add(found.call);
    const at = position(file.text, statement.start);
    if (found.registration === null) {
      violations.push({ path: file.path, ...at, message: SHAPE_MESSAGE, ad: "AD-10" });
    } else {
      registrations.push({ literal: found.registration.literal, key: found.registration.fqcn.toLowerCase(), path: file.path, pkg: packageOf(file.path), ...at });
    }
  }
  for (const { at, message } of strayUses(parsed.program as unknown as Node, recognised)) {
    violations.push({ path: file.path, ...position(file.text, at.start), message, ad: "AD-10" });
  }
  if (framework) {
    const trailing = new Set<string>();
    for (let i = body.length - 1; i >= 0; i--) {
      if (body[i]!.type === "EmptyStatement") {
        continue;
      }
      const ok = recogniseRegistration(body[i]!)?.registration ?? null;
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
    const sites = byFqcn.get(registration.key) ?? [];
    sites.push(registration);
    byFqcn.set(registration.key, sites);
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
        message: `${site.literal} is already registered in ${first.path}:${first.line} (package ${first.pkg}); registered again here (package ${site.pkg})`,
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
