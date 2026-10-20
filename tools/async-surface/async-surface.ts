// The async-surface generator and drift check (Story 6.4; AD-6, AD-28).
//
//   bun run async-surface [--check] [--root <dir>] (<pkg>… | --all)
//
// `<pkg>` is a directory name under `<root>/packages/` or `@xaravel/<name>`;
// `--all` is every `packages/*` with a `package.json`. `--root` defaults to
// the repository root (tests point it at temp roots).
//
// It emits the packages' declarations with one `tsc -b` (the repository's own
// TypeScript, resolved from this file, never from `--root`), walks each
// package's `<tsconfig outDir>/src/**/*.d.ts` with `oxc-parser`, and lists
// every public method whose return type is a Promise or a PromiseLike, with the
// root named by its `@asyncRoot` tag, and every public method that returns a
// thenable but no Promise, with the thenable's FQCN and no tag (AD-6;
// MAINT-2026-10-19 item 7):
//
// - Public: a method or getter (not `private`, `protected` or `#private`), or
//   a field typed as a function, of a class or interface the file exports
//   (directly or by `export { X }` / `export { X as Y }`, listed under its
//   exported name); an interface method signature, or property signature
//   typed as a function; an exported `declare function`; an exported `const`
//   typed as a function. Named `Class.method`, `Class.static method`, or the
//   bare function name.
// - Async: the return type, through parentheses, unions, intersections and
//   `readonly`, references (or `import("…")`s) `Promise` or `PromiseLike`, by
//   name (they are globals). "Typed as a function" includes a union with a
//   function member (`(() => Promise<void>) | null`).
// - Thenable: a type name there that resolves, through the `.d.ts`'s imports
//   (named, renamed, `import type`, `import * as ns` + `ns.X`, `import("…").X`)
//   or the source file itself, to the FQCN a source module registers with
//   `registerClass` (`registeredFqcn` in `tools/lint-rules/thenables.ts`), when
//   that FQCN is in the thenable list (compared without a leading `\`,
//   case-insensitively; printed as the list spells it). Never by short name.
//   The list: `THENABLE_TYPES` from `@xaravel/contracts/async` when it
//   resolves from `<root>` and exports a non-empty `string[]` (Story 10.5),
//   else `THENABLE_TYPES` from `tools/lint-rules/thenables.ts`.
// - Tag: the nearest `/** … */` ending before the member with only whitespace
//   between, carrying `@asyncRoot callback` or `@asyncRoot Name(\Name)*.method`.
//   Overloads form one method: async if any signature returns a Promise (even
//   if another returns a thenable), else a thenable method if any returns a
//   thenable; the tag may sit on any signature; two different tags are an
//   error. A thenable method carries no tag.
//
// The walk is syntactic: type aliases and inherited members are not resolved.
//
// Errors (an async method with no tag, a malformed tag, conflicting overload
// tags, a tag on a thenable method or on one that returns neither a Promise nor
// a thenable, a declaration that does not parse) are all printed, naming
// `packages/<pkg>/src/<path>.ts`, the method and `(AD-6)`; then it exits 1
// and writes nothing. Otherwise it writes `packages/<pkg>/async-surface.json`
// (`render`), except that an empty surface with no existing file writes
// nothing (a missing file counts as `[]`). `--check` never writes
// `async-surface.json` (tsc still writes its `.cache/tsc` output): each
// package whose committed file (missing = `[]`) differs prints the line diff
// and the run exits 1.
//
// Exit codes: 0 ok, 1 errors, tsc failure or drift, 2 usage error.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseSync } from "oxc-parser";
import { importBindings, isThenableFqcn, registeredFqcn, THENABLE_TYPES, type ImportBinding } from "../lint-rules/thenables";

/** An `async-surface.json` line for a Promise-returning method. */
export interface AsyncEntry {
  readonly method: string;
  /** `src/<path>.ts`. */
  readonly file: string;
  /** The `@asyncRoot` value: `callback` or `Name(\Name)*.method`. */
  readonly root: string;
}

/** An `async-surface.json` line for a method that returns a thenable but no Promise (it carries no tag). */
export interface ThenableEntry {
  readonly method: string;
  /** `src/<path>.ts`. */
  readonly file: string;
  /** The thenable FQCNs it returns, as the list spells them, distinct, sorted and joined by `|`. */
  readonly thenable: string;
}

/** One `async-surface.json` line. */
export type SurfaceEntry = AsyncEntry | ThenableEntry;

/**
 * Resolves a type name in a declaration file to its registered FQCN, or null: `file` is the source the declaration
 * came from (`src/<path>.ts`), `specifier` the module it is imported from (null: `file`'s own binding), `name` the
 * exported (or local) name.
 */
export type FqcnResolver = (file: string, specifier: string | null, name: string) => string | null;

/** One AD-6 violation. */
export interface SurfaceError {
  /** `src/<path>.ts`. */
  readonly file: string;
  readonly method: string;
  readonly message: string;
}

/** One emitted declaration file: `file` is the source path it came from (`src/<path>.ts`). */
export interface DeclarationFile {
  readonly file: string;
  readonly text: string;
}

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const TAG_VALUE = /^(?:callback|[A-Za-z_$][\w$]*(?:\\[A-Za-z_$][\w$]*)*\.[A-Za-z_$][\w$]*)$/;
const TAG = /@asyncRoot\b([^\n@]*)/g;

// oxc-parser's ESTree nodes, read structurally.
export type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown };
type Comment = { readonly type: string; readonly value: string; readonly start: number; readonly end: number };

export function node(value: unknown): Node | null {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string" ? (value as Node) : null;
}

export function nodes(value: unknown): Node[] {
  return Array.isArray(value) ? value.map(node).filter((n): n is Node => n !== null) : [];
}

export function nameOf(key: unknown): string | null {
  const n = node(key);
  if (n === null) {
    return null;
  }
  if (n.type === "Identifier" && typeof n["name"] === "string") {
    return n["name"];
  }
  if (n.type === "Literal" && (typeof n["value"] === "string" || typeof n["value"] === "number")) {
    return String(n["value"]);
  }
  return null;
}

/** The type inside a `TSTypeAnnotation` (or the node itself). */
export function unwrapAnnotation(value: unknown): Node | null {
  const n = node(value);
  return n !== null && n.type === "TSTypeAnnotation" ? node(n["typeAnnotation"]) : n;
}

/** The last segment of a type name: `Identifier` or `TSQualifiedName`. */
export function typeNameTail(value: unknown): string | null {
  const n = node(value);
  if (n === null) {
    return null;
  }
  if (n.type === "Identifier") {
    return typeof n["name"] === "string" ? n["name"] : null;
  }
  if (n.type === "TSQualifiedName") {
    return nameOf(n["right"]);
  }
  return null;
}

/** What a return type returns: whether a Promise / PromiseLike, and the thenable FQCNs (canonical spelling). */
interface Returns {
  promise: boolean;
  readonly thenables: Set<string>;
}

/** How one declaration file resolves type names: its imports, the resolver and the thenable list. */
interface TypeContext {
  readonly file: string;
  readonly imports: ReadonlyMap<string, ImportBinding>;
  readonly resolve: FqcnResolver;
  readonly thenables: readonly string[];
}

/** The FQCN a type name (`X`, `ns.X`) or an `import("…")` qualifier refers to, or null. */
function typeFqcn(name: Node | null, importSource: string | null, context: TypeContext): string | null {
  if (name === null) {
    return null;
  }
  if (importSource !== null) {
    return name.type === "Identifier" && typeof name["name"] === "string" ? context.resolve(context.file, importSource, name["name"]) : null;
  }
  if (name.type === "Identifier" && typeof name["name"] === "string") {
    const binding = context.imports.get(name["name"]);
    if (binding === undefined) {
      return context.resolve(context.file, null, name["name"]);
    }
    return binding.imported === null ? null : context.resolve(context.file, binding.specifier, binding.imported);
  }
  if (name.type === "TSQualifiedName") {
    const left = node(name["left"]);
    const right = nameOf(name["right"]);
    const binding = left?.type === "Identifier" && typeof left["name"] === "string" ? context.imports.get(left["name"]) : undefined;
    return binding !== undefined && binding.imported === null && right !== null ? context.resolve(context.file, binding.specifier, right) : null;
  }
  return null;
}

/** The `import("…")` type's module specifier. */
function importSourceOf(n: Node): string | null {
  const source = node(n["source"]) ?? node(n["argument"]);
  if (source === null) {
    return null;
  }
  const literal = source.type === "TSLiteralType" ? node(source["literal"]) : source;
  return literal !== null && typeof literal["value"] === "string" ? literal["value"] : null;
}

/** Collects what a return type returns into `out`, through parentheses, unions, intersections and `readonly`. */
function collectReturns(value: unknown, context: TypeContext, out: Returns): void {
  const n = unwrapAnnotation(value);
  if (n === null) {
    return;
  }
  switch (n.type) {
    case "TSTypeReference":
    case "TSImportType": {
      const name = node(n.type === "TSTypeReference" ? n["typeName"] : n["qualifier"]);
      const tail = typeNameTail(name);
      if (tail === "Promise" || tail === "PromiseLike") {
        out.promise = true;
        return;
      }
      const thenable = isThenableFqcn(typeFqcn(name, n.type === "TSImportType" ? importSourceOf(n) : null, context), context.thenables);
      if (thenable !== null) {
        out.thenables.add(thenable);
      }
      return;
    }
    case "TSUnionType":
    case "TSIntersectionType":
      for (const t of nodes(n["types"])) {
        collectReturns(t, context, out);
      }
      return;
    case "TSParenthesizedType":
      collectReturns(n["typeAnnotation"], context, out);
      return;
    case "TSTypeOperator":
      if (n["operator"] === "readonly") {
        collectReturns(n["typeAnnotation"], context, out);
      }
      return;
    default:
      return;
  }
}

/** What the return types of `types` (return-type annotations) return together. */
function returnsOf(types: readonly unknown[], context: TypeContext): Returns {
  const out: Returns = { promise: false, thenables: new Set() };
  for (const type of types) {
    collectReturns(type, context, out);
  }
  return out;
}

/** The function types of an annotation: itself, or the members of a union (`(() => Promise<void>) | null`), through parentheses. */
function functionTypes(value: unknown): Node[] {
  let n = unwrapAnnotation(value);
  while (n !== null && n.type === "TSParenthesizedType") {
    n = node(n["typeAnnotation"]);
  }
  if (n === null) {
    return [];
  }
  if (n.type === "TSFunctionType") {
    return [n];
  }
  return n.type === "TSUnionType" ? nodes(n["types"]).flatMap(functionTypes) : [];
}

interface Signature {
  readonly name: string;
  /** Whether it returns a Promise or PromiseLike. */
  readonly promise: boolean;
  /** The thenable FQCNs it returns (canonical spelling). */
  readonly thenables: readonly string[];
  /** Each `@asyncRoot` value in the member's doc comment (`""` for a tag with no value). */
  readonly tags: readonly string[];
}

/** The `@asyncRoot` values of the nearest `/** … *\/` ending before `start` with only whitespace between. */
function tagsBefore(text: string, comments: readonly Comment[], start: number): string[] {
  let nearest: Comment | null = null;
  for (const comment of comments) {
    if (comment.end <= start && (nearest === null || comment.end > nearest.end)) {
      nearest = comment;
    }
  }
  if (nearest === null || nearest.type !== "Block" || !nearest.value.startsWith("*") || text.slice(nearest.end, start).trim() !== "") {
    return [];
  }
  const tags: string[] = [];
  for (const match of nearest.value.matchAll(TAG)) {
    tags.push((match[1] ?? "").trim());
  }
  return tags;
}

/** A signature's `promise` and `thenables`. */
function signatureReturns(types: readonly unknown[], context: TypeContext): { promise: boolean; thenables: string[] } {
  const returns = returnsOf(types, context);
  return { promise: returns.promise, thenables: [...returns.thenables] };
}

/** The public signatures of a class or interface body. */
function memberSignatures(owner: string, decl: Node, text: string, comments: readonly Comment[], context: TypeContext): Signature[] {
  const body = node(decl["body"]);
  const out: Signature[] = [];
  for (const member of nodes(body?.["body"])) {
    const tags = (): string[] => tagsBefore(text, comments, member.start);
    const key = node(member["key"]);
    if (key === null || key.type === "PrivateIdentifier" || member["computed"] === true) {
      continue;
    }
    const name = nameOf(key);
    if (name === null) {
      continue;
    }
    const accessibility = member["accessibility"];
    if (accessibility === "private" || accessibility === "protected") {
      continue;
    }
    const qualified = `${owner}.${member["static"] === true ? "static " : ""}${name}`;
    switch (member.type) {
      case "MethodDefinition":
      case "TSAbstractMethodDefinition": {
        if (member["kind"] !== "method" && member["kind"] !== "get") {
          continue;
        }
        const fn = node(member["value"]);
        out.push({ name: qualified, ...signatureReturns([fn?.["returnType"]], context), tags: tags() });
        break;
      }
      case "PropertyDefinition":
      case "TSAbstractPropertyDefinition":
      case "TSPropertySignature": {
        const fns = functionTypes(member["typeAnnotation"]);
        if (fns.length > 0) {
          out.push({ name: qualified, ...signatureReturns(fns.map((f) => f["returnType"]), context), tags: tags() });
        }
        break;
      }
      case "TSMethodSignature": {
        if (member["kind"] !== "method" && member["kind"] !== "get") {
          continue;
        }
        out.push({ name: qualified, ...signatureReturns([member["returnType"]], context), tags: tags() });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** The public signatures of one `.d.ts` text, in order, or the parser's error messages when it does not parse cleanly. */
function fileSignatures(file: string, text: string, thenables: readonly string[], resolve: FqcnResolver): Signature[] | { readonly parseErrors: string[] } {
  const result = parseSync(file.replace(/\.ts$/, ".d.ts"), text, { lang: "dts" });
  if (result.errors.length > 0) {
    return { parseErrors: result.errors.map((error) => error.message) };
  }
  const comments = result.comments as unknown as Comment[];
  const program = result.program as unknown as Node;
  const statements = nodes(program["body"]);
  const context: TypeContext = { file, imports: importBindings(statements), resolve, thenables };

  // Local declarations by name, with the start their doc comment sits before.
  const locals = new Map<string, { decl: Node; start: number }[]>();
  const addLocal = (name: string, decl: Node, start: number): void => {
    const list = locals.get(name) ?? [];
    list.push({ decl, start });
    locals.set(name, list);
  };
  // Exported names: [exported name, local name].
  const exported: [string, string][] = [];
  const declare = (decl: Node, start: number, isExported: boolean): void => {
    if (decl.type === "VariableDeclaration") {
      for (const declarator of nodes(decl["declarations"])) {
        const id = node(declarator["id"]);
        const name = nameOf(id);
        if (id !== null && name !== null) {
          addLocal(name, { ...declarator, type: "ConstDeclarator", kind: decl["kind"], id }, start);
          if (isExported) {
            exported.push([name, name]);
          }
        }
      }
      return;
    }
    const name = nameOf(decl["id"]);
    if (name === null) {
      return;
    }
    addLocal(name, decl, start);
    if (isExported) {
      exported.push([name, name]);
    }
  };
  for (const statement of statements) {
    if (statement.type === "ExportNamedDeclaration") {
      const decl = node(statement["declaration"]);
      if (decl !== null) {
        declare(decl, statement.start, true);
      } else if (statement["source"] === null || statement["source"] === undefined) {
        for (const specifier of nodes(statement["specifiers"])) {
          const local = nameOf(specifier["local"]);
          const name = nameOf(specifier["exported"]);
          if (local !== null && name !== null) {
            exported.push([name, local]);
          }
        }
      }
    } else {
      declare(statement, statement.start, false);
    }
  }

  const out: Signature[] = [];
  const seen = new Set<string>();
  for (const [name, local] of exported) {
    if (seen.has(`${name}\0${local}`)) {
      continue;
    }
    seen.add(`${name}\0${local}`);
    for (const { decl, start } of locals.get(local) ?? []) {
      switch (decl.type) {
        case "ClassDeclaration":
        case "TSInterfaceDeclaration":
          out.push(...memberSignatures(name, decl, text, comments, context));
          break;
        case "TSDeclareFunction":
        case "FunctionDeclaration":
          out.push({ name, ...signatureReturns([decl["returnType"]], context), tags: tagsBefore(text, comments, start) });
          break;
        case "ConstDeclarator": {
          const fns = decl["kind"] === "const" ? functionTypes(node(decl["id"])?.["typeAnnotation"]) : [];
          if (fns.length > 0) {
            out.push({ name, ...signatureReturns(fns.map((f) => f["returnType"]), context), tags: tagsBefore(text, comments, start) });
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return out;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The async surface of a package's emitted declarations. `files` are the `.d.ts` texts, each named by the source file
 * it came from (`src/<path>.ts`); `thenables` are FQCNs; `resolve` maps a type name to its registered FQCN (the
 * default resolves nothing, so only Promises count).
 */
export function surfaceOf(files: readonly DeclarationFile[], thenables: readonly string[], resolve: FqcnResolver = () => null): { entries: SurfaceEntry[]; errors: SurfaceError[] } {
  const entries: SurfaceEntry[] = [];
  const errors: SurfaceError[] = [];
  for (const { file, text } of files) {
    // Group overloads by name, in first-seen order.
    const groups = new Map<string, Signature[]>();
    const signatures = fileSignatures(file, text, thenables, resolve);
    if (!Array.isArray(signatures)) {
      // A partial AST would silently drop methods: fail instead.
      errors.push({ file, method: "", message: `does not parse: ${signatures.parseErrors.join("; ")} (AD-6)` });
      continue;
    }
    for (const signature of signatures) {
      const list = groups.get(signature.name) ?? [];
      list.push(signature);
      groups.set(signature.name, list);
    }
    for (const [method, signatures] of groups) {
      const promise = signatures.some((s) => s.promise);
      const returned = [...new Set(signatures.flatMap((s) => s.thenables))].sort(compare);
      const tags = signatures.flatMap((s) => s.tags);
      const error = (message: string): void => {
        errors.push({ file, method, message: `${method} ${message} (AD-6)` });
      };
      if (!promise) {
        if (returned.length > 0) {
          if (tags.length > 0) {
            error("returns a thenable but no Promise, so it carries no @asyncRoot tag");
            continue;
          }
          entries.push({ method, file, thenable: returned.join("|") });
        } else if (tags.length > 0) {
          error("has an @asyncRoot tag but returns neither a Promise nor a thenable");
        }
        continue;
      }
      if (tags.length === 0) {
        error("returns a Promise but has no @asyncRoot tag (`@asyncRoot <Contract.method>` or `@asyncRoot callback`)");
        continue;
      }
      const malformed = tags.filter((tag) => !TAG_VALUE.test(tag));
      if (malformed.length > 0) {
        error(`has a malformed @asyncRoot tag ${malformed.map((tag) => JSON.stringify(tag)).join(", ")}; expected \`callback\` or \`Name(\\Name)*.method\``);
        continue;
      }
      const distinct = [...new Set(tags)];
      if (distinct.length > 1) {
        error(`has conflicting @asyncRoot tags across its overloads: ${distinct.join(", ")}`);
        continue;
      }
      entries.push({ method, file, root: distinct[0]! });
    }
  }
  entries.sort((a, b) => compare(a.file, b.file) || compare(a.method, b.method));
  return { entries, errors };
}

/** `async-surface.json`'s text: a JSON array with one entry per line, ending in a newline; `[]\n` when empty. */
export function render(entries: readonly SurfaceEntry[]): string {
  if (entries.length === 0) {
    return "[]\n";
  }
  // Tool data, not a framework value, so AD-23 does not apply.
  const lines = entries.map((entry) => JSON.stringify("root" in entry ? { method: entry.method, file: entry.file, root: entry.root } : { method: entry.method, file: entry.file, thenable: entry.thenable }));
  return `[\n${lines.join(",\n")}\n]\n`;
}

/** The entry lines of an `async-surface.json` text, without brackets or trailing commas. */
function entryLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line !== "" && line !== "[" && line !== "]" && line !== "[]");
}

/** The line diff between a committed and a regenerated file: `-` committed-only lines, then `+` regenerated-only lines. */
export function diff(committed: string, regenerated: string): string[] {
  if (committed === regenerated) {
    return [];
  }
  const before = entryLines(committed);
  const after = entryLines(regenerated);
  const out = [...before.filter((line) => !after.includes(line)).map((line) => `-${line}`), ...after.filter((line) => !before.includes(line)).map((line) => `+${line}`)];
  if (out.length > 0) {
    return out;
  }
  // Same entries, different text (order, formatting, the final newline): show the whole files.
  return [...committed.split("\n").map((line) => `-${line}`), ...regenerated.split("\n").map((line) => `+${line}`)];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

/** The thenable FQCNs: `@xaravel/contracts/async`'s `THENABLE_TYPES` when it resolves from `root`, else the tool's list. */
export async function thenableTypes(root: string): Promise<readonly string[]> {
  let path: string;
  try {
    path = Bun.resolveSync("@xaravel/contracts/async", root);
  } catch {
    return THENABLE_TYPES;
  }
  try {
    const mod = (await import(path)) as { THENABLE_TYPES?: unknown };
    if (isStringArray(mod.THENABLE_TYPES)) {
      return mod.THENABLE_TYPES;
    }
  } catch {
    // An unloadable module is not the contract: fall back.
  }
  return THENABLE_TYPES;
}

/** `<dir>/**\/*.d.ts`, sorted, as paths relative to `dir` with `/` separators. */
export function declarationFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (name.endsWith(".d.ts")) {
        out.push(relative(dir, path).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * The declarations of `packages/<pkg>`, read from `<tsconfig outDir>/src`. Only a `.d.ts` whose `src/<path>.ts` still
 * exists is read: an incremental `tsc -b` leaves a deleted or renamed source's declaration behind.
 */
export function packageDeclarations(root: string, pkg: string): DeclarationFile[] {
  const dir = join(root, "packages", pkg);
  const tsconfigPath = join(dir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    throw new Error(`packages/${pkg}/tsconfig.json does not exist`);
  }
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as { compilerOptions?: { outDir?: unknown } };
  const outDir = tsconfig.compilerOptions?.outDir;
  if (typeof outDir !== "string") {
    throw new Error(`packages/${pkg}/tsconfig.json has no compilerOptions.outDir`);
  }
  const src = join(resolve(dir, outDir), "src");
  if (!existsSync(src)) {
    throw new Error(`packages/${pkg}: tsc -b emitted no declarations; expected ${relative(root, src).split(sep).join("/")}`);
  }
  return declarationFiles(src)
    .map((path) => ({ path, file: `src/${path.replace(/\.d\.ts$/, ".ts")}` }))
    .filter(({ file }) => existsSync(join(dir, file)))
    .map(({ path, file }) => ({ file, text: readFileSync(join(src, path), "utf8") }));
}

const TSC_FAILED = "tsc -b failed";

/**
 * Builds `dirs` (package directories) with one `tsc -b`, the repository's own TypeScript, from `root`. Returns null on
 * success, else tsc's output followed by `tsc -b failed (exit <n>)`.
 */
export function emitDeclarations(root: string, dirs: readonly string[]): string | null {
  const tsc = Bun.spawnSync([process.execPath, "--bun", TSC, "-b", ...dirs], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (tsc.exitCode === 0) {
    return null;
  }
  return `${tsc.stdout.toString()}${tsc.stderr.toString()}${TSC_FAILED} (exit ${tsc.exitCode})`;
}

function usage(message: string): number {
  console.error(`async-surface: ${message}`);
  console.error("usage: bun run async-surface [--check] [--root <dir>] (<pkg>… | --all)");
  return 2;
}

/** The CLI. Returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  let check = false;
  let all = false;
  let root = REPO_ROOT;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--check") {
      check = true;
    } else if (arg === "--all") {
      all = true;
    } else if (arg === "--root") {
      const value = argv[++i];
      if (value === undefined) {
        return usage("--root needs a directory");
      }
      root = resolve(value);
    } else if (arg.startsWith("-")) {
      return usage(`unknown option ${arg}`);
    } else {
      names.push(arg);
    }
  }
  if (all === (names.length > 0)) {
    return usage("name packages or pass --all (not both)");
  }
  const packagesDir = join(root, "packages");
  let pkgs: string[];
  if (all) {
    pkgs = existsSync(packagesDir) ? readdirSync(packagesDir).filter((name) => existsSync(join(packagesDir, name, "package.json"))).sort() : [];
  } else {
    pkgs = [];
    for (const name of names) {
      const pkg = name.startsWith("@xaravel/") ? name.slice("@xaravel/".length) : name;
      if (pkg === "" || pkg.includes("/") || pkg.includes("\\") || pkg.startsWith(".") || !existsSync(join(packagesDir, pkg, "package.json"))) {
        console.error(`async-surface: unknown package ${name} (no packages/${pkg}/package.json)`);
        return 2;
      }
      if (!pkgs.includes(pkg)) {
        pkgs.push(pkg);
      }
    }
  }
  if (pkgs.length === 0) {
    console.log("async-surface: no packages");
    return 0;
  }

  const failure = emitDeclarations(root, pkgs.map((pkg) => join(packagesDir, pkg)));
  if (failure !== null) {
    const at = failure.lastIndexOf(TSC_FAILED);
    process.stderr.write(failure.slice(0, at));
    console.error(`async-surface: ${failure.slice(at)}`);
    return 1;
  }

  const thenables = await thenableTypes(root);
  const results: { pkg: string; text: string }[] = [];
  let failed = false;
  for (const pkg of pkgs) {
    let files: DeclarationFile[];
    try {
      files = packageDeclarations(root, pkg);
    } catch (error) {
      console.error(`async-surface: ${(error as Error).message}`);
      failed = true;
      continue;
    }
    // A type name resolves from the source file its declaration came from (`packages/<pkg>/src/<path>.ts`).
    const { entries, errors } = surfaceOf(files, thenables, (file, specifier, name) => registeredFqcn(join(packagesDir, pkg, file), specifier, name));
    for (const error of errors) {
      console.error(`async-surface: packages/${pkg}/${error.file}: ${error.message}`);
    }
    if (errors.length > 0) {
      failed = true;
    }
    results.push({ pkg, text: render(entries) });
  }
  if (failed) {
    console.error("async-surface: errors found; nothing written");
    return 1;
  }

  if (check) {
    let drift = false;
    for (const { pkg, text } of results) {
      const path = join(packagesDir, pkg, "async-surface.json");
      const committed = existsSync(path) ? readFileSync(path, "utf8") : "[]\n";
      const lines = diff(committed, text);
      if (lines.length > 0) {
        drift = true;
        console.error(`async-surface: packages/${pkg}/async-surface.json is out of date (AD-6); run bun run async-surface ${pkg}`);
        for (const line of lines) {
          console.error(line);
        }
      }
    }
    if (drift) {
      return 1;
    }
    console.log(`async-surface: ok (${results.length} package${results.length === 1 ? "" : "s"})`);
    return 0;
  }

  for (const { pkg, text } of results) {
    const path = join(packagesDir, pkg, "async-surface.json");
    // A package with no async method needs no file (a missing file counts as `[]`); an existing one is rewritten.
    if (text === "[]\n" && !existsSync(path)) {
      console.log(`async-surface: packages/${pkg} has no async methods; no file written`);
      continue;
    }
    writeFileSync(path, text);
    console.log(`async-surface: wrote packages/${pkg}/async-surface.json`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
