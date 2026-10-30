// The runtime builtin scan (epic-14-retro-item-4).
//
//   bun tools/scans/builtins.ts <component> [--root <dir>]
//       reads `conformance/upstream/` (the Component's Upstream `src/` and the
//       test files `conformance/component-map` gives it), runs no PHP, fetches
//       nothing and writes nothing. It lists every PHP function and language
//       construct those files call by name that Upstream does not declare
//       itself and `@xaravel/runtime/php` does not export, so the first Story
//       of an Upstream Component epic can raise them in one round:
//
//         function <name> calls=<n> strings=<m> first=<file>:<line>
//         construct <name> calls=<n> first=<file>:<line> helper=<export or none>
//
//       then one summary line. Files are relative to `conformance/upstream/`.
//
// Rules (see docs/ops/builtin-scan.md):
//   - a call is an unqualified (or `\`-only qualified) name followed by `(`,
//     not after `->`, `?->`, `::`, `function`, `fn`, `new`, `const` or a
//     `function &` / `fn &`, and not a PHP keyword;
//   - Upstream declares a name when a `.php` file under any repository's
//     `src/` or `tests/` declares `function <name>(` outside a class-like
//     body, or imports it with a namespace-qualified `use function`;
//   - a few vendor globals (Pest, Mockery, var-dumper) are never listed;
//   - `strings=` counts string literals passed as a whole call argument whose value is a name some scanned,
//     `src/` or `tests/` file calls by name (callables such as `array_map('ucfirst', …)`);
//   - a name is covered when some runtime export `e` has `norm(e) === norm(name)`
//     or `norm(e) === "php" + norm(name)`, `norm` lowercasing and dropping `_`.
//
// Exit codes: 0 a listing, 1 a failure (missing snapshot, lexer error), 2 usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { componentForTest, readMap, testFiles, type ComponentMap } from "../component-map/component-map";
import { compareUnits } from "../oracle/request";
import { kebab, readTable } from "../scaffold/table";
import { UPSTREAM_DIR, UPSTREAM_REPOS } from "../upstream/upstream";
import { UsageError } from "./facades";
import { codeIndexes, phpFiles, tokenize, type Token } from "./php";

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

interface FileFacts {
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
}

/** The global function name a call token names, lowercased, or null when it is qualified. */
function callName(text: string): string | null {
  const bare = text.startsWith("\\") ? text.slice(1) : text;
  return bare.includes("\\") ? null : bare.toLowerCase();
}

/**
 * Reads `use function` imports from code index `k` (the `use`); returns the local names of the namespace-qualified
 * ones and the index after `;`. A global import (`use function tap;`) names no Upstream function, so it is left out.
 */
function useFunctions(tokens: readonly Token[], code: readonly number[], k: number): { names: string[]; end: number } {
  const tok = (j: number): Token | undefined => (j < code.length ? tokens[code[j]!] : undefined);
  const names: string[] = [];
  let j = k + 1;
  const allFunctions = tok(j)?.kind === "name" && tok(j)!.text.toLowerCase() === "function";
  if (allFunctions || tok(j)?.text.toLowerCase() === "const") {
    j++;
  }
  const allConsts = !allFunctions && tok(k + 1)?.text.toLowerCase() === "const";
  let itemFunction = false;
  let inGroup = false;
  let last: string | null = null;
  let qualified = false;
  const flush = (): void => {
    if (last !== null && qualified && (allFunctions || itemFunction) && !allConsts) {
      names.push(last.toLowerCase());
    }
    last = null;
    qualified = false;
    itemFunction = false;
  };
  while (j < code.length && tok(j)!.text !== ";") {
    const t = tok(j)!;
    const lower = t.text.toLowerCase();
    if (t.kind === "punct" && (t.text === "," || t.text === "}")) {
      flush();
    } else if (t.kind === "punct" && t.text === "{") {
      // A group's members all sit under its namespace prefix.
      inGroup = true;
      last = null;
    } else if (t.kind === "name" && lower === "as" && tok(j + 1)?.kind === "name") {
      last = tok(j + 1)!.text;
      j++;
    } else if (t.kind === "name" && (lower === "function" || lower === "const") && tok(j + 1)?.kind === "name") {
      itemFunction = lower === "function";
    } else if (t.kind === "name") {
      last = t.text.slice(t.text.lastIndexOf("\\") + 1);
      qualified = inGroup || t.text.replace(/^\\/, "").includes("\\");
    }
    j++;
  }
  flush();
  return { names, end: j + 1 };
}

/** Collects the call sites, constructs, callable strings and declarations of one file. */
export function fileFacts(source: string, file: string): FileFacts {
  const tokens = tokenize(source, file);
  const code = codeIndexes(tokens);
  const tok = (j: number): Token | undefined => (j >= 0 && j < code.length ? tokens[code[j]!] : undefined);
  const facts: FileFacts = { calls: [], constructs: [], strings: [], declared: [], imported: [] };
  // The open brackets; a `{` that opens a class-like body is marked.
  // A `(` that opens a call's argument list (a name that is no keyword or construct precedes it) is marked.
  const stack: { text: string; classBody: boolean; call: boolean }[] = [];
  let pendingClass: number | null = null;
  let classDepth = 0;
  for (let k = 0; k < code.length; k++) {
    const t = tok(k)!;
    const site = { file, line: t.line };
    if (t.kind === "string") {
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
        stack.push({ text: t.text, classBody: false, call });
      } else if (t.text === "{") {
        const classBody = pendingClass !== null && pendingClass === stack.length;
        if (classBody) {
          pendingClass = null;
          classDepth++;
        }
        stack.push({ text: "{", classBody, call: false });
      } else if (t.text === ")" || t.text === "]" || t.text === "}") {
        const open = stack.pop();
        if (open?.classBody === true) {
          classDepth--;
        }
      } else if (t.text === ";" && pendingClass === stack.length) {
        pendingClass = null;
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
    if ((lower === "class" || lower === "interface" || lower === "trait" || lower === "enum") && !afterMember) {
      const isEnum = lower !== "enum" || (next?.kind === "name" && ["{", ":", "implements"].includes(tok(k + 2)?.text.toLowerCase() ?? ""));
      // `class {` or `class (` is an anonymous class, whatever modifiers sit between it and `new`.
      const anonymous = lower === "class" && (next?.text === "{" || next?.text === "(");
      if ((next?.kind === "name" || prev === "new" || anonymous) && isEnum) {
        pendingClass = stack.length;
      }
      continue;
    }
    if (lower === "use" && (prev === ";" || prev === "{" || prev === "}" || k === 0) && next?.kind === "name" && stack.every((s) => !s.classBody)) {
      const { names, end } = useFunctions(tokens, code, k);
      facts.imported.push(...names);
      k = end - 1;
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

export interface BuiltinReport {
  component: string;
  files: number;
  functions: FunctionLine[];
  constructs: ConstructLine[];
}

/** The absolute path of snapshot directory `rel`; fails when it is missing. */
function requireDir(root: string, rel: string): string {
  const dir = join(root, UPSTREAM_DIR, rel);
  if (!existsSync(dir)) {
    throw new Error(`${UPSTREAM_DIR}/${rel} is missing; run bun run upstream:sync`);
  }
  return dir;
}

/** The snapshot-relative `src/` directory of an Upstream Component; throws a UsageError when it has none. */
export function sourceDir(root: string, component: string): string {
  const table = join(root, PACKAGES_FILE);
  if (!existsSync(table)) {
    throw new Error(`${PACKAGES_FILE} does not exist`);
  }
  const row = readTable(table).find((r) => r.name === component);
  if (PACKAGE_COMPONENTS.includes(component) && row !== undefined) {
    requireDir(root, `${component}/src`);
    return `${component}/src`;
  }
  if (row === undefined || row.upstream === null || !row.upstream.startsWith("illuminate/")) {
    throw new UsageError(`scan:builtins: unknown Upstream Component ${JSON.stringify(component)}; give a Component of ${PACKAGES_FILE} with an Upstream source\n${USAGE}`);
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

/** Scans `component` against `exports` (the runtime's export names). */
export function scanBuiltins(root: string, component: string, exports: readonly string[]): BuiltinReport {
  const src = sourceDir(root, component);
  const map = readMap(root);
  const snapshot = resolve(root, UPSTREAM_DIR);
  const read = (rel: string): FileFacts => fileFacts(readFileSync(join(snapshot, rel), "utf8"), rel);
  const relFiles = (dir: string): string[] => phpFiles(join(snapshot, dir), snapshot).map((rel) => rel.split("\\").join("/"));

  const scanned = [...relFiles(src), ...componentTests(root, map, component)];
  const scannedSet = new Set(scanned);
  const facts = new Map<string, FileFacts>();
  for (const rel of scanned) {
    facts.set(rel, read(rel));
  }
  // Every repository's `src/` and `tests/` declare functions (helpers, Pest helpers in `tests/Pest.php`) and call names too.
  const declared = new Set<string>(VENDOR_GLOBALS);
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
    f.calls.forEach((c) => calledAnywhere.add(c.name));
  }

  const functions = new Map<string, FunctionLine>();
  const constructs = new Map<string, ConstructLine>();
  const fn = (name: string, site: Site): FunctionLine => {
    let line = functions.get(name);
    if (line === undefined) {
      line = { name, calls: 0, strings: 0, first: site };
      functions.set(name, line);
    }
    return line;
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
  return {
    component,
    files: scanned.length,
    functions: [...functions.values()].filter((line) => !isExported(line.name, exports)).sort(byName),
    constructs: [...constructs.values()].filter((line) => line.helper === null || !exports.includes(line.helper)).sort(byName),
  };
}

/** The report's lines, functions first, then constructs, then the summary. */
export function renderReport(report: BuiltinReport): string {
  const at = (site: Site): string => `${site.file}:${site.line}`;
  const lines = [
    ...report.functions.map((l) => `function ${l.name} calls=${l.calls} strings=${l.strings} first=${at(l.first)}`),
    ...report.constructs.map((l) => `construct ${l.name} calls=${l.calls} first=${at(l.first)} helper=${l.helper ?? "none"}`),
    `builtins: ${report.component}: ${report.functions.length} function(s) and ${report.constructs.length} construct(s) not in @xaravel/runtime/php; ${report.files} file(s) scanned.`,
  ];
  return lines.map((line) => `${line}\n`).join("");
}

/** The runtime export names of `@xaravel/runtime/php`, sorted. */
export async function runtimeExports(): Promise<string[]> {
  const module = (await import("../../packages/runtime/src/php/index")) as Record<string, unknown>;
  return Object.keys(module).sort(compareUnits);
}

const USAGE = ["Usage:", "  bun tools/scans/builtins.ts <component> [--root <dir>]"].join("\n");

function parseArgs(argv: readonly string[]): { component: string; root: string } {
  let root = resolve(import.meta.dir, "..", "..");
  let component: string | null = null;
  let rootSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--root") {
      const value = argv[++i];
      if (rootSeen || value === undefined || value.startsWith("--")) {
        throw new UsageError(`scan:builtins: --root ${rootSeen ? "given twice" : "needs a value"}\n${USAGE}`);
      }
      rootSeen = true;
      root = resolve(value);
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
  return { component, root };
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { component, root } = parseArgs(argv);
    const report = scanBuiltins(root, component, await runtimeExports());
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
