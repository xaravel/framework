// The facade scan (Story 3.6; Story 28.x's facade generator reads it).
//
//   bun tools/scans/facades.ts [--check] [--root <dir>]
//       reads `conformance/upstream/` only (it runs no PHP and no container) and writes
//       `conformance/scans/facades.jsonl`: one line per class declared in
//       `framework/src/Illuminate/Support/Facades/*.php` that extends
//       `Illuminate\Support\Facades\Facade` (the base `Facade` itself is
//       skipped), `{"facade","accessor","root","methods"}`, sorted by `facade`.
//
//       - `accessor` is what `getFacadeAccessor()` returns: the string for
//         `'key'`, or the resolved FQCN for `X::class`. Any other shape fails.
//       - `root` is the accessor when it is a non-abstract indexed class,
//         else the first `@see \X` in the class docblock whose X is outside
//         `Illuminate\Support\Testing\Fakes\` and an indexed class. Neither
//         fails the run.
//       - `methods` is every `@method` line in docblock order,
//         `{"name","static","returns","parameters","signature"}`. A line that
//         does not parse fails the run.
//
//   … --check
//       builds the file in memory and compares it byte for byte with the
//       committed one: a `facades drift: <file> …` line when it differs or is
//       missing. It writes nothing.
//
// Exit codes: 0 pass, 1 any failure (nothing is written), 2 usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compareUnits, renderJson, type Json } from "../oracle/request";
import { buildIndex, codeRange, resolveName, ScanError, type Declaration, type Index, type Token } from "./php";

export const FACADES_FILE = "conformance/scans/facades.jsonl";
export const FACADES_DIR = "framework/src/Illuminate/Support/Facades/";
export const FACADE_BASE = "Illuminate\\Support\\Facades\\Facade";
const FAKES = "Illuminate\\Support\\Testing\\Fakes\\";

export interface MethodTag {
  name: string;
  static: boolean;
  returns: string | null;
  parameters: string;
  signature: string;
}

export interface FacadeLine {
  facade: string;
  accessor: string;
  root: string;
  methods: MethodTag[];
}

/**
 * Parses the text after `@method `: `[static] [<return type>] <name>(<parameters>)`.
 * Returns null when it does not parse.
 */
export function parseMethodTag(text: string): MethodTag | null {
  const signature = text.trim();
  if (!signature.endsWith(")")) {
    return null;
  }
  // Find the last top-level `(…)` group, skipping quoted defaults; the text ends with its `)`.
  const pairs: Record<string, string> = { "(": ")", "<": ">", "{": "}", "[": "]" };
  const stack: string[] = [];
  let lastOpen = -1;
  for (let i = 0; i < signature.length; i++) {
    const c = signature[i]!;
    if (c === "'" || c === '"') {
      const end = signature.indexOf(c, i + 1);
      if (end === -1) {
        return null;
      }
      i = end;
      continue;
    }
    if (c === "=" && signature[i + 1] === ">") {
      i++;
      continue;
    }
    if (c in pairs) {
      if (stack.length === 0 && c === "(") {
        lastOpen = i;
      }
      stack.push(pairs[c]!);
    } else if (c === ")" || c === ">" || c === "}" || c === "]") {
      if (stack.pop() !== c) {
        return null;
      }
    }
  }
  if (stack.length !== 0 || lastOpen === -1) {
    return null;
  }
  const head = signature.slice(0, lastOpen);
  const parameters = signature.slice(lastOpen + 1, -1);
  const match = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)$/.exec(head);
  if (match === null) {
    return null;
  }
  const name = match[1]!;
  let prefix = head.slice(0, head.length - name.length).trim();
  let isStatic = false;
  if (prefix === "static" || /^static\s/.test(prefix)) {
    isStatic = true;
    prefix = prefix.slice("static".length).trim();
  }
  return { name, static: isStatic, returns: prefix === "" ? null : prefix, parameters, signature };
}

/** The docblock's lines with their 1-based source lines, `*` gutters stripped. */
function docLines(doc: Token): { text: string; line: number }[] {
  return doc.text.split("\n").map((raw, offset) => ({
    text: raw
      .replace(/^\s*\/\*\*/, "")
      .replace(/\*\/\s*$/, "")
      .replace(/^\s*\*(?!\/)/, "")
      .trim(),
    line: doc.line + offset,
  }));
}

/** What `getFacadeAccessor()` returns. */
function accessorOf(decl: Declaration): string {
  const method = decl.methods.find((m) => m.name.toLowerCase() === "getfacadeaccessor");
  if (method === undefined || method.bodyStart === -1) {
    throw new ScanError(`${decl.file}:${decl.line}: ${decl.fqcn} has no getFacadeAccessor() body`);
  }
  const code = codeRange(decl.tokens, method.bodyStart + 1, method.end - 1).map((j) => decl.tokens[j]!);
  const where = `${decl.file}:${code[0]?.line ?? decl.tokens[method.bodyStart]!.line}`;
  const fail = (): never => {
    throw new ScanError(`${where}: getFacadeAccessor() of ${decl.fqcn} must return a string literal or X::class`);
  };
  if (code[0]?.text.toLowerCase() !== "return" || code[code.length - 1]?.text !== ";") {
    fail();
  }
  const expr = code.slice(1, -1);
  if (expr.length === 1 && expr[0]!.kind === "string" && typeof expr[0]!.value === "string") {
    return expr[0]!.value;
  }
  if (expr.length === 3 && expr[0]!.kind === "name" && expr[1]!.text === "::" && expr[2]!.text.toLowerCase() === "class") {
    const name = expr[0]!.text.toLowerCase();
    if (name === "self" || name === "static" || name === "parent") {
      fail();
    }
    return resolveName(expr[0]!.text, decl.scope);
  }
  return fail();
}

/** Builds the facade lines from the snapshot under `root`, sorted by facade. */
export function buildFacadeLines(root: string, index: Index = buildIndex(root)): FacadeLine[] {
  const prefix = `conformance/upstream/${FACADES_DIR}`;
  const lines: FacadeLine[] = [];
  for (const parsed of index.files) {
    const file = parsed.file.split("\\").join("/");
    if (!file.startsWith(prefix) || file.slice(prefix.length).includes("/")) {
      continue;
    }
    for (const decl of parsed.declarations) {
      if (decl.kind !== "class" || decl.fqcn === FACADE_BASE || decl.extends !== FACADE_BASE) {
        continue;
      }
      const accessor = accessorOf(decl);
      const doc = decl.docblock === null ? [] : docLines(decl.docblock);
      const isClass = (fqcn: string): boolean => index.byFqcn.get(fqcn)?.kind === "class";
      let root: string | null = null;
      const target = index.byFqcn.get(accessor);
      if (target !== undefined && target.kind === "class" && !target.abstract) {
        root = accessor;
      } else {
        for (const { text } of doc) {
          const see = /^@see\s+\\([A-Za-z_][A-Za-z0-9_\\]*)(?:\s|$)/.exec(text);
          if (see === null) {
            continue;
          }
          const fqcn = see[1]!;
          if (!fqcn.startsWith(FAKES) && isClass(fqcn)) {
            root = fqcn;
            break;
          }
        }
      }
      if (root === null) {
        throw new ScanError(`${decl.file}:${decl.line}: facade ${decl.fqcn} has no root: its accessor ${JSON.stringify(accessor)} is not a concrete indexed class and no @see names an indexed class`);
      }
      const methods: MethodTag[] = [];
      for (const { text, line } of doc) {
        const tag = /^@method(?:\s+(.*))?$/.exec(text);
        if (tag === null) {
          continue;
        }
        const parsedTag = parseMethodTag(tag[1] ?? "");
        if (parsedTag === null) {
          throw new ScanError(`${decl.file}:${line}: @method line of ${decl.fqcn} does not parse: ${JSON.stringify(text)}`);
        }
        methods.push(parsedTag);
      }
      lines.push({ facade: decl.fqcn, accessor, root, methods });
    }
  }
  return lines.sort((a, b) => compareUnits(a.facade, b.facade));
}

/** Renders one line in its key order. */
export function renderFacadeLine(line: FacadeLine): string {
  const value = {
    facade: line.facade,
    accessor: line.accessor,
    root: line.root,
    methods: line.methods.map((m) => ({ name: m.name, static: m.static, returns: m.returns, parameters: m.parameters, signature: m.signature })),
  };
  return renderJson(value as unknown as Json);
}

/** The text of `conformance/scans/facades.jsonl` for the snapshot under `root`. */
export function buildFacades(root: string): string {
  return buildFacadeLines(root)
    .map((line) => `${renderFacadeLine(line)}\n`)
    .join("");
}

// ---------------------------------------------------------------------------
// Shared CLI

export class UsageError extends Error {}

/** The 1-based line of the first difference between two texts. */
export function firstDifference(a: string, b: string): number {
  const left = a.split("\n");
  const right = b.split("\n");
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if (left[i] !== right[i]) {
      return i + 1;
    }
  }
  return length;
}

export function parseScanOptions(argv: readonly string[], usage: string): { root: string; check: boolean } {
  const options = { root: resolve(import.meta.dir, "..", ".."), check: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--check" && arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}\n${usage}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice\n${usage}`);
    }
    seen.add(arg);
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value\n${usage}`);
    }
    options.root = resolve(value);
  }
  return options;
}

/** The drift lines of generated `files` (path → text) against the committed ones under `root`. */
export function driftLines(scan: string, root: string, files: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [path, text] of files) {
    const file = join(root, path);
    if (!existsSync(file)) {
      out.push(`${scan} drift: ${path} is missing`);
      continue;
    }
    const committed = readFileSync(file, "utf8");
    if (committed !== text) {
      out.push(`${scan} drift: ${path} differs from the scan (first difference at line ${firstDifference(committed, text)})`);
    }
  }
  return out;
}

/** Writes `files` under `root`, only those whose bytes change. */
export function writeFiles(root: string, files: ReadonlyMap<string, string>): void {
  for (const [path, text] of files) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      writeFileSync(file, text);
    }
  }
}

/** Runs one scan's CLI: build, print its review notes, then write or check. */
export function runScan(scan: string, argv: readonly string[], usage: string, build: (root: string) => { files: Map<string, string>; summary: string; notes?: readonly string[] }): number {
  try {
    const { root, check } = parseScanOptions(argv, usage);
    const { files, summary, notes = [] } = build(root);
    process.stdout.write(notes.map((line) => `${line}\n`).join(""));
    if (check) {
      const drift = driftLines(scan, root, files);
      if (drift.length > 0) {
        process.stderr.write(drift.map((line) => `${line}\n`).join(""));
        process.stderr.write(`${scan} check failed: ${drift.length} file(s) drifted; run bun run scan:${scan} and commit the result.\n`);
        return 1;
      }
      process.stdout.write(`${scan} check OK: ${summary}; byte-identical.\n`);
      return 0;
    }
    writeFiles(root, files);
    process.stdout.write(`${scan}: ${summary}; wrote ${[...files.keys()].join(", ")}.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    process.stderr.write(`${scan} scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const USAGE = ["Usage:", "  bun tools/scans/facades.ts [--check] [--root <dir>]"].join("\n");

export function main(argv: readonly string[]): number {
  return runScan("facades", argv, USAGE, (root) => {
    const lines = buildFacadeLines(root);
    const text = lines.map((line) => `${renderFacadeLine(line)}\n`).join("");
    const methods = lines.reduce((sum, line) => sum + line.methods.length, 0);
    return { files: new Map([[FACADES_FILE, text]]), summary: `${lines.length} facades, ${methods} @method lines` };
  });
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
