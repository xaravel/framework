// The thenable types (AD-6): awaiting one runs its terminal, so an `async`
// function must not return one unawaited. Story 6.3's
// `xaravel/no-async-thenable-return` rule and Story 6.4's `async-surface` tool
// (which uses this list as its fixture list until `@xaravel/contracts/async`,
// Story 10.5, supplies it) both match a type by its qualified name, never by
// its short name (Retro 6 item 12; MAINT-2026-10-19 item 7): `registeredFqcn`
// follows a name through its import, and through re-exports, to the source
// module that registers it with `registerClass('<FQCN>', X)` (AD-10) or
// declares it as a contract token (`const X = contract('<FQCN>', …)`,
// ESC-10.1-3; ESC-10.2-2), and `isThenableFqcn` compares that FQCN with the
// list.
//
// A structural type (AD-1.2) has no runtime value, so nothing registers it; it
// stands for the class its header names (ESC-10.3-2): a binding `<Name>` declared
// in a file whose path ends in `packages/contracts/src/structural/<Name>.ts`,
// that exports `<Name>` under that name and registers nothing for it, resolves
// to `<FQCN>` when the file's first line is `// <FQCN>,…` or `// <FQCN> …` and
// `<FQCN>` is shaped as a class name (a leading `\` is dropped). A registration
// or contract token of the same local wins. The rule applies only when the name
// is reached from another module (an import, a re-export or `export *`), so a
// structural file's own `this` and self-references stay unresolved.
//
// A contract token counts only at the top level (`const`, exported or not),
// when the callee is the identifier `contract` bound by a named import
// `contract` (from any specifier) and its first argument is a string literal
// shaped as an FQCN, after unwrapping parentheses, `as`, `<T>` assertions,
// `satisfies` and `!` around the call (type arguments are fine). A `registerClass` of the same
// local wins over a token.
//
// Resolution: a relative specifier tries `.js` → `.ts`, the path itself when it
// ends in `.ts` / `.tsx` (so a relative `.d.ts` too), `<path>.ts`, then
// `<path>/index.ts`; a bare one is resolved with `Bun.resolveSync` from the
// file's directory, to whatever file it names (`.js` included), which is then
// parsed like any other. In the target module, an export is followed through a local
// `export { L as X }` or exported declaration to `L`, which is either
// registered there (a conforming top-level `registerClass`, the scan's own
// recogniser, or a contract token) or imported (followed again); through `export { Y as X } from`;
// and through each `export *`. A visited set stops cycles; parsed modules are
// cached by path and mtime. `export { X as default }` is followed like any
// export; `export default class X` / `export default X` and `export * as ns`
// are not. Scope is not tracked: a type parameter or inner-scope binding that
// shadows an imported name resolves through the import. A name that does not
// resolve to a registered FQCN (or a structural header FQCN) is no thenable.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { isFqcn, normaliseFqcn, recogniseRegistration, type Node } from "../registration/recognise";

/** The Upstream FQCNs of the thenable types: the Query and Eloquent Builders, the Relation classes, the `Pending*` builders and the Pipeline contract and class. */
export const THENABLE_TYPES: readonly string[] = [
  "Illuminate\\Database\\Query\\Builder",
  "Illuminate\\Database\\Eloquent\\Builder",
  "Illuminate\\Database\\Eloquent\\Relations\\Relation",
  "Illuminate\\Database\\Eloquent\\Relations\\BelongsTo",
  "Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasManyThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOne",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneOrMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneOrManyThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphMany",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphOne",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphOneOrMany",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphTo",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphToMany",
  "Illuminate\\Http\\Client\\PendingRequest",
  "Illuminate\\Foundation\\Bus\\PendingDispatch",
  "Illuminate\\Foundation\\Bus\\PendingClosureDispatch",
  "Illuminate\\Foundation\\Bus\\PendingChain",
  "Illuminate\\Bus\\PendingBatch",
  "Illuminate\\Broadcasting\\PendingBroadcast",
  "Illuminate\\Testing\\PendingCommand",
  "Laravel\\Mcp\\Server\\Testing\\PendingTestResponse",
  // A pipeline keeps Upstream's `then(destination)`, so it is a declared thenable (ESC-10.2-2).
  "Illuminate\\Contracts\\Pipeline\\Pipeline",
  "Illuminate\\Pipeline\\Pipeline",
];

/** A local binding an import declaration creates: a named import (`imported` is the exported name) or a namespace (`imported` null). */
export interface ImportBinding {
  readonly specifier: string;
  /** The imported name (`default` for a default import), or null for `import * as ns`. */
  readonly imported: string | null;
}

/** A node's own property, read structurally. */
function prop(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** An `Identifier`'s name or a string `Literal`'s value (`import { "a" as b }`). */
function bindingName(value: unknown): string | null {
  const name = prop(value, "name");
  if (prop(value, "type") === "Identifier" && typeof name === "string") {
    return name;
  }
  const literal = prop(value, "value");
  return prop(value, "type") === "Literal" && typeof literal === "string" ? literal : null;
}

/** A declaration's `source` string, or null. */
function sourceOf(statement: unknown): string | null {
  const value = prop(prop(statement, "source"), "value");
  return typeof value === "string" ? value : null;
}

/** The local bindings of a program's import declarations (`import type` included): local name → binding. */
export function importBindings(statements: readonly unknown[]): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  for (const statement of statements) {
    const specifier = prop(statement, "type") === "ImportDeclaration" ? sourceOf(statement) : null;
    if (specifier === null) {
      continue;
    }
    for (const spec of list(prop(statement, "specifiers"))) {
      const local = bindingName(prop(spec, "local"));
      if (local === null) {
        continue;
      }
      switch (prop(spec, "type")) {
        case "ImportSpecifier": {
          const imported = bindingName(prop(spec, "imported"));
          if (imported !== null) {
            out.set(local, { specifier, imported });
          }
          break;
        }
        case "ImportDefaultSpecifier":
          out.set(local, { specifier, imported: "default" });
          break;
        case "ImportNamespaceSpecifier":
          out.set(local, { specifier, imported: null });
          break;
        default:
          break;
      }
    }
  }
  return out;
}

/** What the resolver needs of one module. */
interface ModuleInfo {
  /** Local name → registered FQCN (without a leading `\`; the first `registerClass` wins, then a contract token). */
  readonly registrations: ReadonlyMap<string, string>;
  readonly imports: ReadonlyMap<string, ImportBinding>;
  /** Exported name → local name (an exported declaration, or a local `export { L as X }`). */
  readonly exports: ReadonlyMap<string, string>;
  /** Exported name → `export { Y as X } from "<specifier>"`. */
  readonly reexports: ReadonlyMap<string, { readonly specifier: string; readonly imported: string }>;
  /** `export * from "<specifier>"`, in order. */
  readonly stars: readonly string[];
  /** The FQCN a first line `// <FQCN>,…` or `// <FQCN> …` names (without a leading `\`), or null (always null from `moduleInfoOf`). */
  readonly header: string | null;
}

const modules = new Map<string, { readonly mtimeMs: number; readonly info: ModuleInfo }>();

/** The names a declaration binds (a class, function, interface, enum, or each `const` / `let` / `var` identifier). */
function declaredNames(decl: unknown): string[] {
  if (prop(decl, "type") === "VariableDeclaration") {
    return list(prop(decl, "declarations"))
      .map((declarator) => bindingName(prop(declarator, "id")))
      .filter((name): name is string => name !== null);
  }
  const name = bindingName(prop(decl, "id"));
  return name === null ? [] : [name];
}

/** Reads registrations (`registerClass` calls, then contract tokens), imports and exports from a program's top-level statements. */
export function moduleInfoOf(statements: readonly unknown[]): ModuleInfo {
  const registrations = new Map<string, string>();
  const exports = new Map<string, string>();
  const reexports = new Map<string, { specifier: string; imported: string }>();
  const stars: string[] = [];
  for (const statement of statements) {
    const type = prop(statement, "type");
    if (type === "ExportNamedDeclaration") {
      const decl = prop(statement, "declaration");
      if (decl !== null && decl !== undefined) {
        for (const name of declaredNames(decl)) {
          exports.set(name, name);
        }
        continue;
      }
      const specifier = sourceOf(statement);
      for (const spec of list(prop(statement, "specifiers"))) {
        const local = bindingName(prop(spec, "local"));
        const exported = bindingName(prop(spec, "exported"));
        if (local === null || exported === null) {
          continue;
        }
        if (specifier === null) {
          exports.set(exported, local);
        } else {
          reexports.set(exported, { specifier, imported: local });
        }
      }
    } else if (type === "ExportAllDeclaration") {
      const specifier = sourceOf(statement);
      if (specifier !== null && (prop(statement, "exported") === null || prop(statement, "exported") === undefined)) {
        stars.push(specifier);
      }
    } else if (typeof type === "string") {
      const registration = recogniseRegistration(statement as Node)?.registration ?? null;
      if (registration !== null && !registrations.has(registration.name)) {
        registrations.set(registration.name, registration.fqcn);
      }
    }
  }
  // Contract tokens after every `registerClass`, so a registration of the same local wins.
  const imports = importBindings(statements);
  for (const [name, fqcn] of contractTokens(statements, imports)) {
    if (!registrations.has(name)) {
      registrations.set(name, fqcn);
    }
  }
  return { registrations, imports, exports, reexports, stars, header: null };
}

/** The FQCN a source text's first line names as `// <FQCN>,…` or `// <FQCN> …` (without a leading `\`), or null. */
function headerFqcn(text: string): string | null {
  const first = text.split("\n", 1)[0] ?? "";
  const match = /^\/\/ ([^ ,]+)[ ,]/.exec(first);
  const fqcn = match?.[1] ?? null;
  return fqcn !== null && isFqcn(fqcn) ? normaliseFqcn(fqcn) : null;
}

/** An expression without the parentheses, `as`, `<T>` assertions, `satisfies` and `!` around it. */
function unwrapExpression(value: unknown): unknown {
  let current = value;
  for (;;) {
    const type = prop(current, "type");
    if (type !== "ParenthesizedExpression" && type !== "TSAsExpression" && type !== "TSSatisfiesExpression" && type !== "TSNonNullExpression" && type !== "TSTypeAssertion") {
      return current;
    }
    current = prop(current, "expression");
  }
}

/**
 * The contract tokens (ESC-10.1-3) of a program's top-level statements, in order: `[local, FQCN]` for each top-level
 * `const X = contract("<FQCN>", …)` (exported or not), where `contract` is the identifier a named import `contract`
 * binds (from any specifier) and the first argument is a string literal shaped as an FQCN, after unwrapping
 * parentheses, `as`, `<T>` assertions, `satisfies` and `!` around the call. Type arguments are allowed; an optional call is not.
 */
function contractTokens(statements: readonly unknown[], imports: ReadonlyMap<string, ImportBinding>): [string, string][] {
  const binding = imports.get("contract");
  if (binding === undefined || binding.imported !== "contract") {
    return [];
  }
  const out: [string, string][] = [];
  for (const statement of statements) {
    const decl = prop(statement, "type") === "ExportNamedDeclaration" ? prop(statement, "declaration") : statement;
    if (prop(decl, "type") !== "VariableDeclaration" || prop(decl, "kind") !== "const") {
      continue;
    }
    for (const declarator of list(prop(decl, "declarations"))) {
      const id = prop(declarator, "id");
      const name = prop(id, "type") === "Identifier" ? bindingName(id) : null;
      const call = unwrapExpression(prop(declarator, "init"));
      if (name === null || prop(call, "type") !== "CallExpression" || prop(call, "optional") === true) {
        continue;
      }
      const callee = prop(call, "callee");
      if (prop(callee, "type") !== "Identifier" || prop(callee, "name") !== "contract") {
        continue;
      }
      const first = list(prop(call, "arguments"))[0];
      const fqcn = prop(first, "type") === "Literal" ? prop(first, "value") : null;
      if (typeof fqcn === "string" && isFqcn(fqcn)) {
        out.push([name, normaliseFqcn(fqcn)]);
      }
    }
  }
  return out;
}

/** The parsed module at `path` (cached by path and mtime), or null when it cannot be read. */
function moduleInfo(path: string): ModuleInfo | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }
  const cached = modules.get(path);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.info;
  }
  const lang = path.endsWith(".d.ts") ? "dts" : path.endsWith(".tsx") ? "tsx" : "ts";
  const text = readFileSync(path, "utf8");
  const result = parseSync(path, text, { lang });
  const info = { ...moduleInfoOf(list(prop(result.program, "body"))), header: headerFqcn(text) };
  modules.set(path, { mtimeMs, info });
  return info;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The source file a specifier names from `fromFile`, or null. */
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const dir = dirname(fromFile);
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const base = resolve(dir, specifier);
    const candidates = [...(base.endsWith(".js") ? [`${base.slice(0, -3)}.ts`] : []), ...(/\.tsx?$/.test(base) ? [base] : []), `${base}.ts`, `${base}/index.ts`];
    return candidates.find(isFile) ?? null;
  }
  try {
    const path = Bun.resolveSync(specifier, dir);
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

/**
 * The FQCN a structural type stands for (ESC-10.3-2): `file` is `…/packages/contracts/src/structural/<local>.ts`, it
 * exports `<local>` under that name, and its first line names the FQCN (`headerFqcn`); otherwise null.
 */
function structuralFqcn(file: string, local: string, info: ModuleInfo): string | null {
  if (info.header === null || info.exports.get(local) !== local) {
    return null;
  }
  const segments = file.split(/[\\/]/);
  return segments.length >= 5 && segments.slice(-5, -1).join("/") === "packages/contracts/src/structural" && segments.at(-1) === `${local}.ts` ? info.header : null;
}

/**
 * The FQCN registered for the binding `local` of `file`: registered there, imported (followed), or, when `exported`
 * (reached through another module's import or re-export), a structural type's header FQCN.
 */
function localFqcn(file: string, local: string, visited: Set<string>, exported = false): string | null {
  const info = moduleInfo(file);
  if (info === null) {
    return null;
  }
  const registered = info.registrations.get(local);
  if (registered !== undefined) {
    return registered;
  }
  const binding = info.imports.get(local);
  if (binding === undefined) {
    return exported ? structuralFqcn(file, local, info) : null;
  }
  if (binding.imported === null) {
    return null;
  }
  const target = resolveSpecifier(file, binding.specifier);
  return target === null ? null : exportedFqcn(target, binding.imported, visited);
}

/** The FQCN registered for the export `name` of `file`, through local exports, re-exports and `export *`. */
function exportedFqcn(file: string, name: string, visited: Set<string>): string | null {
  const key = `${file}\0${name}`;
  if (visited.has(key)) {
    return null;
  }
  visited.add(key);
  const info = moduleInfo(file);
  if (info === null) {
    return null;
  }
  const local = info.exports.get(name);
  if (local !== undefined) {
    return localFqcn(file, local, visited, true);
  }
  const reexport = info.reexports.get(name);
  if (reexport !== undefined) {
    const target = resolveSpecifier(file, reexport.specifier);
    return target === null ? null : exportedFqcn(target, reexport.imported, visited);
  }
  if (name === "default") {
    return null;
  }
  for (const star of info.stars) {
    const target = resolveSpecifier(file, star);
    const found = target === null ? null : exportedFqcn(target, name, visited);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * The Upstream FQCN (without a leading `\`, case as registered) a type or class name refers to, or null: with a
 * `specifier`, the export `name` of the module it names from `fromFile`; without one, the binding `name` of `fromFile`
 * itself (registered there, or imported).
 */
export function registeredFqcn(fromFile: string, specifier: string | null, name: string): string | null {
  const visited = new Set<string>();
  if (specifier === null) {
    return localFqcn(resolve(fromFile), name, visited);
  }
  const target = resolveSpecifier(fromFile, specifier);
  return target === null ? null : exportedFqcn(target, name, visited);
}

/** The canonical spelling in `thenables` of `fqcn` (compared without a leading `\`, case-insensitively), or null. */
export function isThenableFqcn(fqcn: string | null, thenables: readonly string[]): string | null {
  if (fqcn === null) {
    return null;
  }
  const key = normaliseFqcn(fqcn).toLowerCase();
  return thenables.find((candidate) => normaliseFqcn(candidate).toLowerCase() === key) ?? null;
}
