// The runtime builtin scan (epic-14-retro-item-4, widened by epic-15-retro-item-7).
//
//   bun tools/scans/builtins.ts <component> [--root <dir>] [--sync [--remote <base>]]
//       reads `conformance/upstream/` (the Component's Upstream `src/` and the
//       test files `conformance/component-map` gives it) and the pinned source
//       of the vendor libraries the Component ports (`vendor-ports.jsonl`,
//       cached under `.cache/vendor/` at the commit the Oracle's committed
//       `composer.lock` pins). It runs no PHP and writes nothing; only `--sync`
//       fetches, and only a vendor source that is missing or fails its tree
//       check. It lists every PHP function and language construct those files
//       call by name, every global constant and builtin class they name, that
//       Upstream does not declare itself and `@xaravel/runtime/php` does not
//       export, and every PCRE pattern literal the runtime's converter refuses,
//       so the first Story of an Upstream Component epic can raise them in one
//       round:
//
//         function <name> calls=<n> strings=<m> first=<site>
//         construct <name> calls=<n> first=<site> helper=<export or none>
//         constant <NAME> uses=<n> first=<site>
//         class <Name> uses=<n> first=<site>
//         pattern <JSON literal> uses=<n> first=<site> refused=<JSON message>
//
//       then one summary line. A site is `<file>:<line>`, the file relative to
//       `conformance/upstream/` or `vendor:<package>/<path>`.
//
// Rules (see docs/ops/builtin-scan.md):
//   - a call is an unqualified (or `\`-only qualified) name followed by `(`,
//     not after `->`, `?->`, `::`, `function`, `fn`, `new`, `const` or a
//     `function &` / `fn &`, and not a PHP keyword;
//   - Upstream declares a name when a `.php` file under any repository's
//     `src/` or `tests/`, or a scanned vendor file, declares `function <name>(`
//     outside a class-like body, or imports it with a namespace-qualified
//     `use function`;
//   - a few vendor globals (Pest, Mockery, var-dumper) are never listed;
//   - `strings=` counts string literals passed as a whole call argument whose value is a name some scanned,
//     `src/` or `tests/` file calls by name (callables such as `array_map('ucfirst', …)`);
//   - a name is covered when some runtime export `e` has `norm(e) === norm(name)`
//     or `norm(e) === "php" + norm(name)`, `norm` lowercasing and dropping `_`;
//   - a constant is a bare uppercase name used as a value; a class is a name
//     after `new`, `instanceof`, `extends`, `implements`, `catch (` or before
//     `::` that resolves to a global class; a pattern is a literal string
//     `compilePattern` accepts as a PHP pattern and then refuses.
//
// Exit codes: 0 a listing, 1 a failure (missing snapshot or vendor source, lexer error, failed fetch), 2 usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { componentForTest, readMap, testFiles, type ComponentMap } from "../component-map/component-map";
import { compareUnits } from "../oracle/request";
import { compilePattern } from "../../packages/runtime/src/php/pcre";
import { kebab, readTable, type PackageRow } from "../scaffold/table";
import { UPSTREAM_DIR, UPSTREAM_REPOS } from "../upstream/upstream";
import { UsageError } from "./facades";
import { codeIndexes, phpFiles, tokenize, type Token } from "./php";
import { autoloadFiles, readVendorPorts, syncVendor, vendorCacheRel, vendorPackages, verifyVendor, type VendorPackage } from "./vendor";

const PACKAGES_FILE = "tools/scaffold/packages.jsonl";
const PACKAGE_COMPONENTS: readonly string[] = ["ai", "mcp", "boost"];

/** Names preceding a `(` that are never a function call. */
const KEYWORDS: ReadonlySet<string> = new Set([
  "abstract", "and", "as", "break", "callable", "case", "catch", "class", "const", "continue", "declare", "default", "do", "echo",
  "else", "elseif", "enddeclare", "endfor", "endforeach", "endif", "endswitch", "endwhile", "enum", "extends", "final", "finally",
  "fn", "for", "foreach", "function", "global", "goto", "if", "implements", "instanceof", "insteadof", "interface", "namespace",
  "new", "or", "parent", "private", "protected", "public", "readonly", "return", "self", "static", "switch", "throw", "trait",
  "try", "use", "var", "while", "xor", "yield", "from", "__halt_compiler",
]);

/** The language constructs the scan reports, and the runtime helper each translates to (or null). */
export const CONSTRUCT_HELPERS: Readonly<Record<string, string | null>> = {
  array: null,
  clone: null,
  die: null,
  empty: "toBool",
  eval: null,
  exit: null,
  include: null,
  include_once: null,
  isset: null,
  list: null,
  match: "unhandledMatch",
  print: null,
  require: null,
  require_once: null,
  unset: null,
  "yield from": "yieldFrom",
};

/** Constructs that are written like a call: counted only when `(` follows. */
const CALL_LIKE: ReadonlySet<string> = new Set(["array", "empty", "eval", "isset", "list", "match", "unset"]);

/** Global functions of the vendor test tools, which are not PHP builtins. */
export const VENDOR_GLOBALS: readonly string[] = [
  // Pest
  "afterall", "aftereach", "arch", "beforeall", "beforeeach", "covers", "dataset", "describe", "expect", "it", "pest", "test", "todo", "uses",
  // Mockery
  "andanyotherargs", "andanyothers", "anyargs", "mock", "namedmock", "spy",
  // symfony/var-dumper
  "dd", "dump",
];

const NOT_CALL_AFTER: ReadonlySet<string> = new Set(["->", "?->", "::", "function", "fn", "new", "const"]);
/** Previous tokens after which a bare construct keyword is a name (a class constant, enum case or type), not the construct. */
const NOT_CONSTRUCT_AFTER: ReadonlySet<string> = new Set(["new", "class", "instanceof", "case", "goto", "enum", "interface", "trait", "extends", "implements"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A global constant's spelling: an uppercase bare name, optionally `\`-qualified. */
const CONSTANT = /^\\?[A-Z][A-Z0-9_]*$/;
/** Previous tokens after which an uppercase name is not a constant's use. */
const NOT_CONSTANT_AFTER: ReadonlySet<string> = new Set([
  "->", "?->", "::", "new", "function", "fn", "const", "class", "interface", "trait", "enum", "extends", "implements", "instanceof", "goto", "namespace", "use",
]);
/** Next tokens that make an uppercase name a type before a parameter or property. */
const TYPE_BEFORE: ReadonlySet<string> = new Set(["&", "...", "|"]);
/** Relative class names, never a global class. */
const RELATIVE_CLASSES: ReadonlySet<string> = new Set(["self", "static", "parent"]);

/** Lowercase with `_` dropped: how a PHP name compares with a runtime export. */
export function norm(name: string): string {
  return name.toLowerCase().replaceAll("_", "");
}

/** Whether `name` (a PHP function) is covered by one of `exports`. */
export function isExported(name: string, exports: readonly string[]): boolean {
  const n = norm(name);
  return exports.some((e) => norm(e) === n || norm(e) === `php${n}`);
}

interface Site {
  file: string;
  line: number;
}

export interface FileFacts {
  /** Lowercased names called by name, with their sites, in file order. */
  calls: { name: string; site: Site }[];
  /** Constructs used, with their sites. */
  constructs: { name: string; site: Site }[];
  /** Literal string values that look like a function name, with their sites. */
  strings: { name: string; site: Site }[];
  /** Lowercased names of functions declared outside any class-like body. */
  declared: string[];
  /** Lowercased names imported with `use function`. */
  imported: string[];
  /** Global constants used, without a leading `\`, with their sites. */
  constants: { name: string; site: Site }[];
  /** Global classes named, in the spelling written (or imported), with their sites. */
  classes: { name: string; site: Site }[];
  /** Every literal string value (no interpolation), with its site. */
  literals: { value: string; site: Site }[];
  /** Constants declared by a top-level `const` or a literal `define('NAME', …)`, or imported with a qualified `use const`. */
  declaredConstants: string[];
  /** Lowercased names of the class-likes declared in a file with no `namespace` declaration. */
  declaredClasses: string[];
}

/** The global function name a call token names, lowercased, or null when it is qualified. */
function callName(text: string): string | null {
  const bare = text.startsWith("\\") ? text.slice(1) : text;
  return bare.includes("\\") ? null : bare.toLowerCase();
}

interface UseImports {
  /** Local names (lowercased) of the namespace-qualified `use function` imports. */
  functions: string[];
  /** Local names of the namespace-qualified `use const` imports. */
  consts: string[];
  /** Class imports: lowercased local name and the imported name (a global class when it has one segment). */
  classes: [string, string][];
  /** The code index after `;`. */
  end: number;
}

/**
 * Reads the `use` imports from code index `k` (the `use`). A global function or constant import (`use function tap;`)
 * names no Upstream function or constant, so it is left out; a class import is kept only when it names a global class.
 */
function useImports(tokens: readonly Token[], code: readonly number[], k: number): UseImports {
  const tok = (j: number): Token | undefined => (j < code.length ? tokens[code[j]!] : undefined);
  const out: UseImports = { functions: [], consts: [], classes: [], end: 0 };
  let j = k + 1;
  const allFunctions = tok(j)?.kind === "name" && tok(j)!.text.toLowerCase() === "function";
  if (allFunctions || tok(j)?.text.toLowerCase() === "const") {
    j++;
  }
  const allConsts = !allFunctions && tok(k + 1)?.text.toLowerCase() === "const";
  let item: "function" | "const" | null = null;
  let inGroup = false;
  let last: string | null = null;
  let original: string | null = null;
  let prefix = "";
  let qualified = false;
  const flush = (): void => {
    const kind = allFunctions ? "function" : allConsts ? "const" : item;
    if (last !== null && qualified && kind === "function") {
      out.functions.push(last.toLowerCase());
    } else if (last !== null && qualified && kind === "const") {
      out.consts.push(last);
    } else if (last !== null && original !== null && kind === null) {
      out.classes.push([last.toLowerCase(), inGroup ? `${prefix}\\${original}` : original]);
    }
    last = null;
    original = null;
    qualified = false;
    item = null;
  };
  while (j < code.length && tok(j)!.text !== ";") {
    const t = tok(j)!;
    const lower = t.text.toLowerCase();
    if (t.kind === "punct" && (t.text === "," || t.text === "}")) {
      flush();
    } else if (t.kind === "punct" && t.text === "{") {
      // A group's members all sit under its namespace prefix.
      inGroup = true;
      prefix = original ?? "";
      last = null;
      original = null;
    } else if (t.kind === "name" && lower === "as" && tok(j + 1)?.kind === "name") {
      last = tok(j + 1)!.text;
      j++;
    } else if (t.kind === "name" && (lower === "function" || lower === "const") && tok(j + 1)?.kind === "name") {
      item = lower;
    } else if (t.kind === "name") {
      last = t.text.slice(t.text.lastIndexOf("\\") + 1);
      original = t.text.replace(/^\\/, "");
      qualified = inGroup || original.includes("\\");
    }
    j++;
  }
  flush();
  out.end = j + 1;
  return out;
}

/** Whether the file declares a namespace (`namespace Foo;`, `namespace Foo { }` or `namespace { }`). */
function declaresNamespace(tokens: readonly Token[], code: readonly number[]): boolean {
  return code.some((index, j) => {
    const t = tokens[index]!;
    const prev = j > 0 ? tokens[code[j - 1]!]!.text : ";";
    const next = j + 1 < code.length ? tokens[code[j + 1]!] : undefined;
    return t.kind === "name" && t.text.toLowerCase() === "namespace" && !["->", "?->", "::"].includes(prev) && (next?.kind === "name" || next?.text === "{");
  });
}

interface Open {
  text: string;
  classBody: boolean;
  enumBody: boolean;
  call: boolean;
  catchList: boolean;
}

/** Collects the call sites, constructs, constants, classes, literals and declarations of one file. */
export function fileFacts(source: string, file: string): FileFacts {
  const tokens = tokenize(source, file);
  const code = codeIndexes(tokens);
  const tok = (j: number): Token | undefined => (j >= 0 && j < code.length ? tokens[code[j]!] : undefined);
  const facts: FileFacts = { calls: [], constructs: [], strings: [], declared: [], imported: [], constants: [], classes: [], literals: [], declaredConstants: [], declaredClasses: [] };
  const namespaced = declaresNamespace(tokens, code);
  const classImports = new Map<string, string>();
  // The open brackets; a `{` that opens a class-like body is marked (and an enum's body).
  // A `(` that opens a call's argument list (a name that is no keyword or construct precedes it) is marked, and a `catch (`.
  const stack: Open[] = [];
  let pendingClass: number | null = null;
  let pendingEnum = false;
  let classDepth = 0;
  // An `extends` / `implements` list runs to the body's `{`.
  let heritage = false;
  // A trait `use` in a class body runs to its `;` or the end of its adaptation block, at this depth.
  let traitUse: number | null = null;
  // A `const` declaration at this depth: the names before each item's `=` are declarations.
  let constDecl: { depth: number; beforeEq: boolean } | null = null;

  /** The global class a class-position name resolves to, or null. */
  const globalClass = (text: string): string | null => {
    if (RELATIVE_CLASSES.has(text.toLowerCase())) {
      return null;
    }
    if (text.startsWith("\\")) {
      return text.slice(1).includes("\\") ? null : text.slice(1);
    }
    if (text.includes("\\")) {
      return null;
    }
    // An imported name is the class it imports; only a single-segment import (`use X;`, `use X as Y;`) is global.
    const imported = classImports.get(text.toLowerCase());
    if (imported !== undefined) {
      return imported.includes("\\") ? null : imported;
    }
    return namespaced ? null : text;
  };

  for (let k = 0; k < code.length; k++) {
    const t = tok(k)!;
    const site = { file, line: t.line };
    if (t.kind === "string") {
      if (typeof t.value === "string") {
        facts.literals.push({ value: t.value, site });
      }
      // Only a whole argument of a call can be a callable: `f('ucfirst', …)`, never an array key or value.
      const before = tok(k - 1)?.text;
      const after = tok(k + 1)?.text;
      const argument = stack.at(-1)?.call === true && (before === "(" || before === ",") && (after === ")" || after === ",");
      if (argument && typeof t.value === "string" && IDENT.test(t.value)) {
        facts.strings.push({ name: t.value.toLowerCase(), site });
      }
      continue;
    }
    if (t.kind === "punct") {
      if (t.text === "(" || t.text === "[") {
        const callee = tok(k - 1);
        const calleeName = callee?.kind === "name" ? callee.text.toLowerCase() : null;
        const call = t.text === "(" && calleeName !== null && !KEYWORDS.has(calleeName) && !Object.hasOwn(CONSTRUCT_HELPERS, calleeName);
        stack.push({ text: t.text, classBody: false, enumBody: false, call, catchList: t.text === "(" && calleeName === "catch" });
      } else if (t.text === "{") {
        heritage = false;
        const classBody = pendingClass !== null && pendingClass === stack.length;
        if (classBody) {
          pendingClass = null;
          classDepth++;
        }
        stack.push({ text: "{", classBody, enumBody: classBody && pendingEnum, call: false, catchList: false });
      } else if (t.text === ")" || t.text === "]" || t.text === "}") {
        const open = stack.pop();
        if (open?.classBody === true) {
          classDepth--;
        }
        if (t.text === "}" && traitUse === stack.length) {
          traitUse = null;
        }
      } else if (t.text === ";") {
        if (pendingClass === stack.length) {
          pendingClass = null;
        }
        if (traitUse === stack.length) {
          traitUse = null;
        }
        if (constDecl?.depth === stack.length) {
          constDecl = null;
        }
      } else if (constDecl?.depth === stack.length && (t.text === "=" || t.text === ",")) {
        constDecl.beforeEq = t.text === ",";
      }
      continue;
    }
    if (t.kind !== "name") {
      continue;
    }
    const lower = t.text.toLowerCase();
    const prev = tok(k - 1)?.text.toLowerCase() ?? ";";
    const next = tok(k + 1);
    const afterMember = prev === "->" || prev === "?->" || prev === "::";

    // Constants and classes.
    if (traitUse !== null) {
      continue;
    }
    if (constDecl !== null && constDecl.depth === stack.length && constDecl.beforeEq) {
      // `const [type] NAME = …`: a declaration, never a use.
      if (next?.text === "=" && classDepth === 0) {
        facts.declaredConstants.push(t.text.replace(/^\\/, ""));
      }
      continue;
    }
    const classPosition =
      (prev === "new" && lower !== "class" && !(lower === "readonly" && next?.text.toLowerCase() === "class")) ||
      prev === "instanceof" ||
      (heritage && lower !== "implements" && lower !== "extends") ||
      stack.at(-1)?.catchList === true ||
      (next?.text === "::" && !afterMember);
    if (classPosition) {
      const name = globalClass(t.text);
      if (name !== null) {
        facts.classes.push({ name, site });
      }
    } else if (
      CONSTANT.test(t.text) &&
      !["true", "false", "null"].includes(lower) &&
      !KEYWORDS.has(lower) &&
      !Object.hasOwn(CONSTRUCT_HELPERS, lower) &&
      next?.text !== "(" &&
      next?.text !== "\\" &&
      !NOT_CONSTANT_AFTER.has(prev) &&
      next?.kind !== "variable" &&
      !TYPE_BEFORE.has(next?.text ?? "") &&
      !(prev === "case" && stack.at(-1)?.enumBody === true) &&
      !(next?.text === ":" && (prev === "(" || prev === ","))
    ) {
      facts.constants.push({ name: t.text.replace(/^\\/, ""), site });
    }

    if ((lower === "extends" || lower === "implements") && !afterMember) {
      heritage = true;
      continue;
    }
    if (lower === "const" && !afterMember) {
      constDecl = { depth: stack.length, beforeEq: true };
      continue;
    }
    if (lower.replace(/^\\/, "") === "define" && next?.text === "(" && !afterMember && prev !== "function" && tok(k + 2)?.kind === "string" && typeof tok(k + 2)!.value === "string" && tok(k + 3)?.text === ",") {
      facts.declaredConstants.push(tok(k + 2)!.value!.replace(/^\\/, ""));
    }
    if ((lower === "class" || lower === "interface" || lower === "trait" || lower === "enum") && !afterMember) {
      const isEnum = lower !== "enum" || (next?.kind === "name" && ["{", ":", "implements"].includes(tok(k + 2)?.text.toLowerCase() ?? ""));
      // `class {` or `class (` is an anonymous class, whatever modifiers sit between it and `new`.
      const anonymous = lower === "class" && (next?.text === "{" || next?.text === "(");
      if ((next?.kind === "name" || prev === "new" || anonymous) && isEnum) {
        pendingClass = stack.length;
        pendingEnum = lower === "enum";
        if (next?.kind === "name" && prev !== "new" && !namespaced) {
          facts.declaredClasses.push(next.text.toLowerCase());
        }
      }
      continue;
    }
    if (lower === "use" && stack.at(-1)?.classBody === true) {
      traitUse = stack.length;
      continue;
    }
    if (lower === "use" && (prev === ";" || prev === "{" || prev === "}" || k === 0) && next?.kind === "name" && stack.every((s) => !s.classBody)) {
      const imports = useImports(tokens, code, k);
      facts.imported.push(...imports.functions);
      facts.declaredConstants.push(...imports.consts);
      for (const [local, name] of imports.classes) {
        classImports.set(local, name);
      }
      k = imports.end - 1;
      continue;
    }
    if (lower === "function" && classDepth === 0) {
      const at = tok(k + 1)?.text === "&" ? k + 2 : k + 1;
      if (tok(at)?.kind === "name" && tok(at + 1)?.text === "(") {
        facts.declared.push(tok(at)!.text.toLowerCase());
      }
      continue;
    }
    if (afterMember || prev === "function" || prev === "const") {
      continue;
    }
    if (lower === "yield" && next?.kind === "name" && next.text.toLowerCase() === "from") {
      facts.constructs.push({ name: "yield from", site });
      continue;
    }
    if (Object.hasOwn(CONSTRUCT_HELPERS, lower) && lower !== "yield from") {
      const asName = NOT_CONSTRUCT_AFTER.has(prev) || next?.text === "::" || next?.text === ":";
      if (CALL_LIKE.has(lower) ? next?.text === "(" && !NOT_CALL_AFTER.has(prev) : !asName) {
        facts.constructs.push({ name: lower, site });
      }
      continue;
    }
    // `function &foo(` declares; `$a & foo(` and `= &foo(` call.
    const byReference = prev === "&" && ["function", "fn"].includes(tok(k - 2)?.text.toLowerCase() ?? "");
    if (next?.text !== "(" || NOT_CALL_AFTER.has(prev) || byReference || KEYWORDS.has(lower)) {
      continue;
    }
    const name = callName(t.text);
    if (name !== null) {
      facts.calls.push({ name, site });
    }
  }
  return facts;
}

export interface FunctionLine {
  name: string;
  calls: number;
  strings: number;
  first: Site;
}

export interface ConstructLine {
  name: string;
  calls: number;
  first: Site;
  helper: string | null;
}

export interface NameLine {
  name: string;
  uses: number;
  first: Site;
}

export interface PatternLine {
  value: string;
  uses: number;
  first: Site;
  refused: string;
}

export interface BuiltinReport {
  component: string;
  files: number;
  functions: FunctionLine[];
  constructs: ConstructLine[];
  constants: NameLine[];
  classes: NameLine[];
  patterns: PatternLine[];
}

export interface ScanOptions {
  /** Fetch a vendor source that is missing or fails verification. */
  sync?: boolean;
  /** Replaces the `https://github.com` prefix of a vendor package's `source.url` when fetching. */
  remoteBase?: string | null;
}

/** The absolute path of snapshot directory `rel`; fails when it is missing. */
function requireDir(root: string, rel: string): string {
  const dir = join(root, UPSTREAM_DIR, rel);
  if (!existsSync(dir)) {
    throw new Error(`${UPSTREAM_DIR}/${rel} is missing; run bun run upstream:sync`);
  }
  return dir;
}

function readPackages(root: string): PackageRow[] {
  const table = join(root, PACKAGES_FILE);
  if (!existsSync(table)) {
    throw new Error(`${PACKAGES_FILE} does not exist`);
  }
  return readTable(table);
}

function unknownComponent(component: string): UsageError {
  return new UsageError(`scan:builtins: unknown Upstream Component ${JSON.stringify(component)}; give a Component of ${PACKAGES_FILE} with an Upstream source or a vendor port\n${USAGE}`);
}

/** Whether `component` has an Upstream source of its own: a framework Component, or ai, mcp or boost. */
function hasUpstreamSource(row: PackageRow | undefined, component: string): boolean {
  return row !== undefined && (PACKAGE_COMPONENTS.includes(component) || (row.upstream !== null && row.upstream.startsWith("illuminate/")));
}

/** The snapshot-relative `src/` directory of an Upstream Component; throws a UsageError when it has none. */
export function sourceDir(root: string, component: string): string {
  const row = readPackages(root).find((r) => r.name === component);
  if (PACKAGE_COMPONENTS.includes(component) && row !== undefined) {
    requireDir(root, `${component}/src`);
    return `${component}/src`;
  }
  if (!hasUpstreamSource(row, component)) {
    throw unknownComponent(component);
  }
  const illuminate = requireDir(root, "framework/src/Illuminate");
  const dir = readdirSync(illuminate, { withFileTypes: true }).find((entry) => entry.isDirectory() && kebab(entry.name) === component);
  if (dir === undefined) {
    throw new Error(`${UPSTREAM_DIR}/framework/src/Illuminate has no directory for ${component}`);
  }
  return `framework/src/Illuminate/${dir.name}`;
}

/** The snapshot-relative test files `map` gives `component`, sorted. */
export function componentTests(root: string, map: ComponentMap, component: string): string[] {
  const record = map.records.find((r) => r.component === component);
  const repos = [...new Set((record?.tests ?? []).map((entry) => entry.path.slice(0, entry.path.indexOf("/"))))].sort(compareUnits);
  return repos.flatMap((repo) => testFiles(root, repo).filter((file) => componentForTest(map, file)?.component === component)).sort(compareUnits);
}

/**
 * The vendor packages `component` ports, each verified in the cache (and fetched first under `sync` when it is missing
 * or modified). Throws a UsageError for a Component with neither an Upstream source nor a vendor package.
 */
function verifiedVendor(root: string, component: string, table: readonly PackageRow[], options: ScanOptions): VendorPackage[] {
  const row = table.find((r) => r.name === component);
  const ports = readVendorPorts(root, table);
  const own = hasUpstreamSource(row, component);
  // A Component's own `upstream` is a vendor package only when it has no Upstream source of its own (not boost).
  const ownUpstream = !own && row !== undefined && row.kind === "xaravel" && row.upstream !== null;
  const mayHaveVendor = row !== undefined && (ports.some((p) => p.component === component) || ownUpstream);
  if (!own && !mayHaveVendor) {
    throw unknownComponent(component);
  }
  const packages = mayHaveVendor ? vendorPackages(root, component, table, ports, ownUpstream) : [];
  if (!own && packages.length === 0) {
    throw unknownComponent(component);
  }
  for (const pkg of packages) {
    const state = verifyVendor(root, pkg);
    if (state === "verified") {
      continue;
    }
    if (options.sync !== true) {
      throw new Error(
        `vendor source of ${pkg.name} at ${pkg.commit} (${vendorCacheRel(pkg)}) is ${state === "missing" ? "missing" : "modified since it was fetched"}; run bun run scan:builtins ${component} --sync`,
      );
    }
    syncVendor(root, pkg, { remoteBase: options.remoteBase ?? null });
    if (verifyVendor(root, pkg) !== "verified") {
      throw new Error(`vendor source of ${pkg.name} at ${pkg.commit} does not verify after --sync`);
    }
  }
  return packages;
}

/** The message `compilePattern` throws for `value`, or null when it converts the pattern or PHP cannot compile it. */
function refusal(value: string): string | null {
  try {
    compilePattern("preg_match", value);
    return null;
  } catch (error) {
    // DIV-10.1's refusal is a TypeError; anything else is a converter failure and fails the run.
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
}

/** Scans `component` against `exports` (the runtime's export names). */
export function scanBuiltins(root: string, component: string, exports: readonly string[], options: ScanOptions = {}): BuiltinReport {
  const table = readPackages(root);
  const row = table.find((r) => r.name === component);
  const src = hasUpstreamSource(row, component) ? sourceDir(root, component) : null;
  const vendor = verifiedVendor(root, component, table, options);
  const snapshot = resolve(root, UPSTREAM_DIR);
  const read = (rel: string): FileFacts => fileFacts(readFileSync(join(snapshot, rel), "utf8"), rel);
  const relFiles = (dir: string): string[] => phpFiles(join(snapshot, dir), snapshot).map((rel) => rel.split("\\").join("/"));

  const scanned = src === null ? [] : [...relFiles(src), ...componentTests(root, readMap(root), component)];
  const scannedSet = new Set(scanned);
  const facts = new Map<string, FileFacts>();
  for (const rel of scanned) {
    facts.set(rel, read(rel));
  }
  // The vendor files come after the Upstream `src/` and test files, package by package.
  for (const pkg of vendor) {
    const base = join(root, vendorCacheRel(pkg));
    for (const rel of autoloadFiles(root, pkg)) {
      const site = `vendor:${pkg.name}/${rel}`;
      scanned.push(site);
      facts.set(site, fileFacts(readFileSync(join(base, rel), "utf8"), site));
    }
  }
  // Every repository's `src/` and `tests/` declare functions (helpers, Pest helpers in `tests/Pest.php`) and call names too.
  const declared = new Set<string>(VENDOR_GLOBALS);
  const declaredConstants = new Set<string>();
  const declaredClasses = new Set<string>(["mockery"]);
  const calledAnywhere = new Set<string>();
  const others: FileFacts[] = [];
  for (const { name } of UPSTREAM_REPOS) {
    requireDir(root, name);
    for (const sub of ["src", "tests"]) {
      if (!existsSync(join(snapshot, name, sub))) {
        continue;
      }
      for (const rel of relFiles(`${name}/${sub}`)) {
        if (!scannedSet.has(rel)) {
          others.push(read(rel));
        }
      }
    }
  }
  for (const f of [...facts.values(), ...others]) {
    // A namespace-qualified `use function` import names an Upstream or vendor function, never a PHP builtin.
    [...f.declared, ...f.imported].forEach((n) => declared.add(n));
    f.declaredConstants.forEach((n) => declaredConstants.add(n));
    f.declaredClasses.forEach((n) => declaredClasses.add(n));
    f.calls.forEach((c) => calledAnywhere.add(c.name));
  }

  const functions = new Map<string, FunctionLine>();
  const constructs = new Map<string, ConstructLine>();
  const constants = new Map<string, NameLine>();
  const classes = new Map<string, NameLine>();
  const patterns = new Map<string, PatternLine>();
  const refusals = new Map<string, string | null>();
  const fn = (name: string, site: Site): FunctionLine => {
    let line = functions.get(name);
    if (line === undefined) {
      line = { name, calls: 0, strings: 0, first: site };
      functions.set(name, line);
    }
    return line;
  };
  const named = (lines: Map<string, NameLine>, key: string, name: string, site: Site): void => {
    const line = lines.get(key) ?? { name, uses: 0, first: site };
    line.uses++;
    lines.set(key, line);
  };
  for (const rel of scanned) {
    const f = facts.get(rel)!;
    for (const { name, site } of f.calls) {
      if (!declared.has(name)) {
        fn(name, site).calls++;
      }
    }
    for (const { name, site } of f.constructs) {
      const line = constructs.get(name) ?? { name, calls: 0, first: site, helper: CONSTRUCT_HELPERS[name] ?? null };
      line.calls++;
      constructs.set(name, line);
    }
    for (const { name, site } of f.constants) {
      if (!declaredConstants.has(name)) {
        named(constants, name, name, site);
      }
    }
    for (const { name, site } of f.classes) {
      if (!declaredClasses.has(name.toLowerCase())) {
        named(classes, name.toLowerCase(), name, site);
      }
    }
    for (const { value, site } of f.literals) {
      if (!refusals.has(value)) {
        refusals.set(value, refusal(value));
      }
      const refused = refusals.get(value)!;
      if (refused !== null) {
        const line = patterns.get(value) ?? { value, uses: 0, first: site, refused };
        line.uses++;
        patterns.set(value, line);
      }
    }
  }
  // Strings count once every call site is known, so a string before the first call still counts.
  for (const rel of scanned) {
    const f = facts.get(rel)!;
    for (const { name, site } of f.strings) {
      if (calledAnywhere.has(name) && !declared.has(name) && !KEYWORDS.has(name) && !Object.hasOwn(CONSTRUCT_HELPERS, name)) {
        fn(name, site).strings++;
      }
    }
  }
  const byName = <T extends { name: string }>(a: T, b: T): number => compareUnits(a.name, b.name);
  const exported = new Set(exports);
  const exportedClasses = new Set(exports.map((e) => e.toLowerCase()));
  return {
    component,
    files: scanned.length,
    functions: [...functions.values()].filter((line) => !isExported(line.name, exports)).sort(byName),
    constructs: [...constructs.values()].filter((line) => line.helper === null || !exports.includes(line.helper)).sort(byName),
    // PHP constants are case-sensitive; class names are not.
    constants: [...constants.values()].filter((line) => !exported.has(line.name)).sort(byName),
    classes: [...classes.values()].filter((line) => !exportedClasses.has(line.name.toLowerCase())).sort(byName),
    patterns: [...patterns.values()].sort((a, b) => compareUnits(a.value, b.value)),
  };
}

/** The report's lines: functions, constructs, constants, classes, patterns, then the summary. */
export function renderReport(report: BuiltinReport): string {
  const at = (site: Site): string => `${site.file}:${site.line}`;
  const lines = [
    ...report.functions.map((l) => `function ${l.name} calls=${l.calls} strings=${l.strings} first=${at(l.first)}`),
    ...report.constructs.map((l) => `construct ${l.name} calls=${l.calls} first=${at(l.first)} helper=${l.helper ?? "none"}`),
    ...report.constants.map((l) => `constant ${l.name} uses=${l.uses} first=${at(l.first)}`),
    ...report.classes.map((l) => `class ${l.name} uses=${l.uses} first=${at(l.first)}`),
    ...report.patterns.map((l) => `pattern ${JSON.stringify(l.value)} uses=${l.uses} first=${at(l.first)} refused=${JSON.stringify(l.refused)}`),
    `builtins: ${report.component}: ${report.functions.length} function(s), ${report.constructs.length} construct(s), ${report.constants.length} constant(s) and ${report.classes.length} class(es) not in @xaravel/runtime/php; ${report.patterns.length} refused pattern(s); ${report.files} file(s) scanned.`,
  ];
  return lines.map((line) => `${line}\n`).join("");
}

/** The runtime export names of `@xaravel/runtime/php`, sorted. */
export async function runtimeExports(): Promise<string[]> {
  const module = (await import("../../packages/runtime/src/php/index")) as Record<string, unknown>;
  return Object.keys(module).sort(compareUnits);
}

const USAGE = ["Usage:", "  bun tools/scans/builtins.ts <component> [--root <dir>] [--sync [--remote <base>]]"].join("\n");

interface Args {
  component: string;
  root: string;
  sync: boolean;
  remote: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  let root = resolve(import.meta.dir, "..", "..");
  let component: string | null = null;
  let rootSeen = false;
  let sync = false;
  let remote: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--root" || arg === "--remote") {
      const value = argv[++i];
      const seen = arg === "--root" ? rootSeen : remote !== null;
      if (seen || value === undefined || value.startsWith("--")) {
        throw new UsageError(`scan:builtins: ${arg} ${seen ? "given twice" : "needs a value"}\n${USAGE}`);
      }
      if (arg === "--root") {
        rootSeen = true;
        root = resolve(value);
      } else {
        remote = value;
      }
      continue;
    }
    if (arg === "--sync") {
      if (sync) {
        throw new UsageError(`scan:builtins: --sync given twice\n${USAGE}`);
      }
      sync = true;
      continue;
    }
    if (arg.startsWith("-") || component !== null) {
      throw new UsageError(`scan:builtins: unknown argument ${arg}\n${USAGE}`);
    }
    component = arg;
  }
  if (component === null) {
    throw new UsageError(`scan:builtins: give a Component\n${USAGE}`);
  }
  if (remote !== null && !sync) {
    throw new UsageError(`scan:builtins: --remote is only valid with --sync\n${USAGE}`);
  }
  return { component, root, sync, remote };
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { component, root, sync, remote } = parseArgs(argv);
    const report = scanBuiltins(root, component, await runtimeExports(), { sync, remoteBase: remote });
    process.stdout.write(renderReport(report));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    process.stderr.write(`scan:builtins: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
