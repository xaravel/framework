// A small PHP lexer, name resolver and declaration index for the static
// Upstream scans (Story 3.6). It reads only `conformance/upstream/`.
//
// The lexer covers what the scans need: comments (a docblock is kept as a
// token), `#[…]` attributes (one opaque token), single- and double-quoted
// strings, heredoc and nowdoc (opaque except for a literal value), variables,
// names (with `\`), numbers and punctuation, including `->`, `?->`, `::`,
// `=>` and the compound assignments. Each token records its 1-based line.
//
// On top of the tokens, `parseFile` reads the namespace and the `use`
// imports (aliases and groups; `use function` / `use const` are skipped),
// resolves class names PHP's way, and finds every class, interface, trait and
// enum with its `abstract` flag, resolved `extends`, used traits, methods and
// properties with their token ranges. `buildIndex` does this for every `.php`
// file (not `.blade.php`) under the four repositories' `src/`, walked in
// sorted order.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compareUnits } from "../oracle/request";
import { UPSTREAM_REPOS, upstreamPath } from "../upstream/upstream";

export type TokenKind = "docblock" | "comment" | "attribute" | "string" | "variable" | "name" | "number" | "punct" | "inline";

export interface Token {
  kind: TokenKind;
  /** The source text of the token. */
  text: string;
  line: number;
  /** For a string: its literal value, or null when it interpolates. */
  value?: string | null;
}

/** A failure that names a place in a file. */
export class ScanError extends Error {}

const PUNCT = [
  "<<=", ">>=", "**=", "...", "<=>", "===", "!==", "??=", "?->",
  "->", "::", "=>", "==", "!=", "<>", "<=", ">=", "&&", "||", "??", "++", "--",
  "+=", "-=", "*=", "/=", ".=", "%=", "&=", "|=", "^=", "<<", ">>", "**",
];

/** The compound assignment operators. */
export const COMPOUND_ASSIGNMENTS: ReadonlySet<string> = new Set(["+=", "-=", "*=", "/=", ".=", "%=", "&=", "|=", "^=", "<<=", ">>=", "**=", "??="]);

const isIdentStart = (c: string): boolean => /[A-Za-z_\u0080-\uffff]/.test(c);
const isIdentChar = (c: string): boolean => /[A-Za-z0-9_\u0080-\uffff]/.test(c);

function decodeSingle(body: string): string {
  return body.replace(/\\([\\'])/g, "$1");
}

const DOUBLE_ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t", r: "\r", v: "\v", e: "\x1b", f: "\f", "\\": "\\", $: "$", '"': '"' };

/** The literal value of a double-quoted or heredoc body, or null when it interpolates. */
function decodeDouble(body: string, quote: string | null): string | null {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "$" && (isIdentStart(body[i + 1] ?? "") || body[i + 1] === "{")) {
      return null;
    }
    if (c === "{" && body[i + 1] === "$") {
      return null;
    }
    if (c === "\\" && i + 1 < body.length) {
      const next = body[i + 1]!;
      if (next === quote || (next !== '"' && next in DOUBLE_ESCAPES)) {
        out += next === quote ? next : DOUBLE_ESCAPES[next]!;
        i++;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/** Tokenizes PHP source. `file` names the file in errors. */
export function tokenize(source: string, file: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  const fail = (message: string): never => {
    throw new ScanError(`${file}:${line}: ${message}`);
  };
  const advance = (to: number): string => {
    const text = source.slice(i, to);
    for (const c of text) {
      if (c === "\n") {
        line++;
      }
    }
    i = to;
    return text;
  };
  const push = (kind: TokenKind, to: number, value?: string | null): void => {
    const start = line;
    const text = advance(to);
    tokens.push(value === undefined ? { kind, text, line: start } : { kind, text, line: start, value });
  };

  // Inline HTML up to the first open tag.
  const inline = (): void => {
    const open = source.indexOf("<?php", i);
    const short = source.indexOf("<?=", i);
    const next = open === -1 ? short : short === -1 ? open : Math.min(open, short);
    if (next === -1) {
      if (i < n) {
        push("inline", n);
      }
      return;
    }
    if (next > i) {
      push("inline", next);
    }
    advance(next + (source.startsWith("<?php", next) ? 5 : 3));
  };

  /** The end of a quoted string starting at `start` (the quote), with `{$…}` handled for double quotes. */
  const quotedEnd = (start: number, quote: string): number => {
    let j = start + 1;
    while (j < n) {
      const c = source[j]!;
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === quote) {
        return j + 1;
      }
      if (quote !== "'" && c === "{" && source[j + 1] === "$") {
        j = embeddedEnd(j);
        continue;
      }
      j++;
    }
    return fail(`unterminated string`);
  };

  /** The end of an embedded `{$…}` expression starting at `start` (the `{`). */
  const embeddedEnd = (start: number): number => {
    let depth = 0;
    let j = start;
    while (j < n) {
      const c = source[j]!;
      if (c === "'" || c === '"') {
        j = quotedEnd(j, c);
        continue;
      }
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          return j + 1;
        }
      }
      j++;
    }
    return fail("unterminated interpolation");
  };

  inline();
  while (i < n) {
    const c = source[i]!;
    const rest = (k: number): string => source.slice(i, i + k);
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") {
      advance(i + 1);
      continue;
    }
    if (rest(2) === "?>") {
      advance(i + 2);
      if (source[i] === "\n") {
        advance(i + 1);
      }
      inline();
      continue;
    }
    if (rest(2) === "#[") {
      // An attribute: skip its tokens to the matching `]`, keep one token.
      const start = line;
      const from = i;
      let depth = 0;
      let j = i + 1;
      while (j < n) {
        const d = source[j]!;
        if (d === "'" || d === '"') {
          j = quotedEnd(j, d);
          continue;
        }
        if (d === "[" || d === "(" || d === "{") {
          depth++;
        } else if (d === "]" || d === ")" || d === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        j++;
      }
      if (depth !== 0) {
        fail("unterminated attribute");
      }
      advance(j);
      tokens.push({ kind: "attribute", text: source.slice(from, j), line: start });
      continue;
    }
    if (c === "#" || rest(2) === "//") {
      let j = i;
      while (j < n && source[j] !== "\n" && !source.startsWith("?>", j)) {
        j++;
      }
      push("comment", j);
      continue;
    }
    if (rest(2) === "/*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) {
        fail("unterminated comment");
      }
      push(rest(3) === "/**" && source[i + 3] !== "/" ? "docblock" : "comment", end + 2);
      continue;
    }
    if (c === "'") {
      const end = quotedEnd(i, "'");
      push("string", end, decodeSingle(source.slice(i + 1, end - 1)));
      continue;
    }
    if (c === '"' || c === "`") {
      const end = quotedEnd(i, c);
      push("string", end, c === "`" ? null : decodeDouble(source.slice(i + 1, end - 1), '"'));
      continue;
    }
    if (rest(3) === "<<<") {
      const match = /^<<<[ \t]*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(source.slice(i, i + 200));
      if (match === null) {
        fail("malformed heredoc");
      }
      const label = match![2]!;
      const nowdoc = match![1] === "'";
      const bodyStart = i + match![0].length;
      const closer = new RegExp(`(^|\\n)([ \\t]*)${label}(?![A-Za-z0-9_])`, "g");
      closer.lastIndex = bodyStart - 1;
      const found = closer.exec(source);
      if (found === null) {
        fail(`unterminated heredoc ${label}`);
      }
      const closeAt = found!.index + found![1]!.length;
      const indent = found![2]!;
      const end = closeAt + indent.length + label.length;
      let body = closeAt > bodyStart ? source.slice(bodyStart, closeAt - 1) : "";
      if (body.endsWith("\r")) {
        body = body.slice(0, -1);
      }
      if (indent.length > 0) {
        body = body
          .split("\n")
          .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
          .join("\n");
      }
      push("string", end, nowdoc ? body : decodeDouble(body, null));
      continue;
    }
    if (c === "$" && isIdentStart(source[i + 1] ?? "")) {
      let j = i + 2;
      while (j < n && isIdentChar(source[j]!)) {
        j++;
      }
      push("variable", j);
      continue;
    }
    if (isIdentStart(c) || (c === "\\" && isIdentStart(source[i + 1] ?? ""))) {
      let j = c === "\\" ? i + 1 : i;
      for (;;) {
        while (j < n && isIdentChar(source[j]!)) {
          j++;
        }
        if (source[j] === "\\" && isIdentStart(source[j + 1] ?? "")) {
          j++;
          continue;
        }
        break;
      }
      push("name", j);
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*)?\.?[0-9_]*(?:[eE][+-]?[0-9_]+)?)/.exec(source.slice(i, i + 100));
      push("number", i + Math.max(1, match![0].length));
      continue;
    }
    const punct = PUNCT.find((p) => source.startsWith(p, i));
    push("punct", i + (punct?.length ?? 1));
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Names

const BUILTIN_TYPES: ReadonlySet<string> = new Set([
  "array", "bool", "boolean", "callable", "false", "float", "double", "int", "integer", "iterable", "mixed", "never", "null", "object", "parent", "resource", "self", "static", "string", "true", "void",
]);

/** Whether `name` is a builtin type or a relative class keyword rather than a class name. */
export function isBuiltinType(name: string): boolean {
  return BUILTIN_TYPES.has(name.toLowerCase());
}

/** A file's namespace and class imports, keyed by lowercased alias. */
export interface NameScope {
  namespace: string;
  imports: ReadonlyMap<string, string>;
}

/** Resolves a class name PHP's way, without a leading `\`. */
export function resolveName(name: string, scope: NameScope): string {
  if (name.startsWith("\\")) {
    return name.slice(1);
  }
  const prefix = scope.namespace === "" ? "" : `${scope.namespace}\\`;
  if (name.toLowerCase().startsWith("namespace\\")) {
    return prefix + name.slice("namespace\\".length);
  }
  const cut = name.indexOf("\\");
  const first = cut === -1 ? name : name.slice(0, cut);
  const imported = scope.imports.get(first.toLowerCase());
  if (imported !== undefined) {
    return cut === -1 ? imported : imported + name.slice(cut);
  }
  return prefix + name;
}

// ---------------------------------------------------------------------------
// Declarations

export type DeclarationKind = "class" | "interface" | "trait" | "enum";

/** A method or property with the token range it spans (`end` exclusive). */
export interface Member {
  name: string;
  static: boolean;
  start: number;
  end: number;
}

export interface Method extends Member {
  /** The parameter variables, `$` stripped. */
  parameters: string[];
  /** The tokens of the body `{…}` (`bodyStart` is the `{`; `end` is after the `}`), or -1 when abstract. */
  bodyStart: number;
}

export interface Property extends Member {
  /** The first token of the default value, or -1 when there is none. */
  valueStart: number;
}

export interface Declaration {
  fqcn: string;
  kind: DeclarationKind;
  abstract: boolean;
  /** A class's parent, resolved. */
  extends: string | null;
  /** A class's interfaces, or an interface's parents, resolved. */
  implements: string[];
  /** The traits it uses, resolved. */
  traits: string[];
  methods: Method[];
  properties: Property[];
  /** The docblock right before the declaration, or null. */
  docblock: Token | null;
  /** The token index of the `class`/`interface`/`trait`/`enum` keyword. */
  start: number;
  /** The token index after the closing `}`. */
  end: number;
  /** The file, relative to the repository root. */
  file: string;
  line: number;
  scope: NameScope;
  tokens: Token[];
}

export interface ParsedFile {
  file: string;
  tokens: Token[];
  declarations: Declaration[];
}

const SKIPPED: ReadonlySet<TokenKind> = new Set(["comment", "docblock", "attribute", "inline"]);
const MODIFIERS: ReadonlySet<string> = new Set(["abstract", "final", "readonly"]);
const MEMBER_MODIFIERS: ReadonlySet<string> = new Set(["public", "protected", "private", "static", "var", "readonly", "final", "abstract"]);

/** The index after the bracket matching the one at `open`. */
export function matching(tokens: readonly Token[], open: number, file = ""): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let j = open; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind !== "punct") {
      continue;
    }
    if (t.text in pairs) {
      stack.push(pairs[t.text]!);
    } else if (t.text === ")" || t.text === "]" || t.text === "}") {
      if (stack.pop() !== t.text) {
        throw new ScanError(`${file}:${t.line}: unbalanced ${t.text}`);
      }
      if (stack.length === 0) {
        return j + 1;
      }
    }
  }
  throw new ScanError(`${file}:${tokens[open]?.line ?? 0}: unbalanced ${tokens[open]?.text ?? ""}`);
}

/** The code tokens' indexes: comments, docblocks, attributes and inline HTML dropped. */
function codeIndexes(tokens: readonly Token[]): number[] {
  const out: number[] = [];
  tokens.forEach((t, j) => {
    if (!SKIPPED.has(t.kind)) {
      out.push(j);
    }
  });
  return out;
}

/** Parses `use` imports from `at` (after `use`); returns the index after `;`. */
function parseUse(tokens: readonly Token[], code: readonly number[], at: number, imports: Map<string, string>, file: string): number {
  const tok = (k: number): Token => tokens[code[k]!]!;
  let k = at;
  const first = tok(k).text.toLowerCase();
  if (tok(k).kind === "name" && (first === "function" || first === "const")) {
    while (k < code.length && tok(k).text !== ";") {
      k++;
    }
    return k + 1;
  }
  const add = (name: string, alias: string | null): void => {
    const full = name.replace(/^\\/, "");
    imports.set((alias ?? full.slice(full.lastIndexOf("\\") + 1)).toLowerCase(), full);
  };
  for (;;) {
    const t = tok(k);
    if (t.kind !== "name") {
      throw new ScanError(`${file}:${t.line}: malformed use statement`);
    }
    let prefix = t.text;
    k++;
    if (tok(k).text === "\\" || prefix.endsWith("\\") || tok(k).text === "{") {
      // A group: `use A\{B, C as D};` (the lexer leaves the trailing `\` as punctuation).
      if (tok(k).text === "\\") {
        k++;
      }
      prefix = prefix.replace(/\\$/, "");
      if (tok(k).text !== "{") {
        throw new ScanError(`${file}:${t.line}: malformed group use`);
      }
      k++;
      while (tok(k).text !== "}") {
        const kind = tok(k).text.toLowerCase();
        let skip = false;
        if (tok(k).kind === "name" && (kind === "function" || kind === "const") && tok(k + 1).kind === "name") {
          skip = true;
          k++;
        }
        const member = tok(k).text;
        k++;
        let alias: string | null = null;
        if (tok(k).text.toLowerCase() === "as") {
          alias = tok(k + 1).text;
          k += 2;
        }
        if (!skip) {
          add(`${prefix}\\${member}`, alias);
        }
        if (tok(k).text === ",") {
          k++;
        }
      }
      k++;
    } else {
      let alias: string | null = null;
      if (tok(k).text.toLowerCase() === "as") {
        alias = tok(k + 1).text;
        k += 2;
      }
      add(prefix, alias);
    }
    if (tok(k).text === ",") {
      k++;
      continue;
    }
    if (tok(k).text !== ";") {
      throw new ScanError(`${file}:${tok(k).line}: malformed use statement`);
    }
    return k + 1;
  }
}

/** Parses a class-like body from code index `open` (the `{`) into `decl`. Returns the code index after `}`. */
function parseBody(tokens: readonly Token[], code: readonly number[], open: number, decl: Declaration, file: string): number {
  const tok = (k: number): Token => tokens[code[k]!]!;
  const close = matching(tokens, code[open]!, file);
  const resolve = (name: string): string => resolveName(name, decl.scope);
  let k = open + 1;
  let memberStart = -1;
  let isStatic = false;
  while (code[k]! < close - 1) {
    const t = tok(k);
    const lower = t.text.toLowerCase();
    if (t.kind === "punct" && (t.text === "{" || t.text === "(" || t.text === "[")) {
      k = code.indexOf(matching(tokens, code[k]!, file) - 1, k) + 1;
      continue;
    }
    if (t.kind === "punct" && t.text === ";") {
      memberStart = -1;
      isStatic = false;
      k++;
      continue;
    }
    if (memberStart === -1) {
      memberStart = code[k]!;
    }
    if (t.kind === "name" && lower === "use" && memberStart === code[k]) {
      // Trait use: `use A, B;` or `use A, B { … }`.
      k++;
      for (;;) {
        decl.traits.push(resolve(tok(k).text));
        k++;
        if (tok(k).text === ",") {
          k++;
          continue;
        }
        break;
      }
      if (tok(k).text === "{") {
        k = code.indexOf(matching(tokens, code[k]!, file) - 1, k) + 1;
      } else {
        k++;
      }
      memberStart = -1;
      continue;
    }
    if (t.kind === "name" && lower === "static") {
      isStatic = true;
    }
    if (t.kind === "name" && (lower === "const" || lower === "case")) {
      while (tok(k).text !== ";") {
        const u = tok(k);
        if (u.kind === "punct" && (u.text === "(" || u.text === "[" || u.text === "{")) {
          k = code.indexOf(matching(tokens, code[k]!, file) - 1, k);
        }
        k++;
      }
      continue;
    }
    if (t.kind === "name" && lower === "function") {
      let m = k + 1;
      if (tok(m).text === "&") {
        m++;
      }
      const name = tok(m).text;
      const paramsOpen = m + 1;
      if (tok(paramsOpen).text !== "(") {
        throw new ScanError(`${file}:${tok(m).line}: malformed method ${name}`);
      }
      const paramsClose = code.indexOf(matching(tokens, code[paramsOpen]!, file) - 1, paramsOpen);
      const parameters: string[] = [];
      let depth = 0;
      for (let p = paramsOpen + 1; p < paramsClose; p++) {
        const u = tok(p);
        if (u.kind === "punct" && (u.text === "(" || u.text === "[" || u.text === "{")) {
          depth++;
        } else if (u.kind === "punct" && (u.text === ")" || u.text === "]" || u.text === "}")) {
          depth--;
        } else if (depth === 0 && u.kind === "variable") {
          const prev = tok(p - 1).text;
          if (prev !== "=") {
            parameters.push(u.text.slice(1));
          }
        }
      }
      let q = paramsClose + 1;
      while (tok(q).text !== "{" && tok(q).text !== ";") {
        q++;
      }
      let end: number;
      let bodyStart = -1;
      if (tok(q).text === "{") {
        bodyStart = code[q]!;
        end = matching(tokens, bodyStart, file);
        k = code.indexOf(end - 1, q) + 1;
      } else {
        end = code[q]! + 1;
        k = q + 1;
      }
      decl.methods.push({ name, static: isStatic, start: memberStart, end, parameters, bodyStart });
      memberStart = -1;
      isStatic = false;
      continue;
    }
    if (t.kind === "variable" && memberStart !== code[k]) {
      // A property declaration: `<modifiers> [type] $a [= v], $b [= v];`.
      const leading = tokens.slice(memberStart, code[k]).filter((u) => !SKIPPED.has(u.kind));
      if (leading.some((u) => u.kind === "name" && MEMBER_MODIFIERS.has(u.text.toLowerCase()))) {
        for (;;) {
          const nameTok = tok(k);
          const start = code[k]!;
          let valueStart = -1;
          k++;
          if (tok(k).text === "=") {
            valueStart = code[k + 1]!;
            k++;
            while (tok(k).text !== "," && tok(k).text !== ";") {
              const u = tok(k);
              if (u.kind === "punct" && (u.text === "(" || u.text === "[" || u.text === "{")) {
                k = code.indexOf(matching(tokens, code[k]!, file) - 1, k);
              }
              k++;
            }
          } else if (tok(k).text === "{") {
            // A property hook block.
            k = code.indexOf(matching(tokens, code[k]!, file) - 1, k) + 1;
            decl.properties.push({ name: nameTok.text.slice(1), static: isStatic, start, end: code[k - 1]! + 1, valueStart });
            break;
          }
          decl.properties.push({ name: nameTok.text.slice(1), static: isStatic, start, end: code[k]!, valueStart });
          if (tok(k).text === ",") {
            k++;
            continue;
          }
          break;
        }
        continue;
      }
    }
    k++;
  }
  return code.indexOf(close - 1, open) + 1;
}

/** Tokenizes and parses one file. `file` is how errors name it. */
export function parseFile(source: string, file: string): ParsedFile {
  const tokens = tokenize(source, file);
  const code = codeIndexes(tokens);
  const tok = (k: number): Token => tokens[code[k]!]!;
  const declarations: Declaration[] = [];
  let scope: { namespace: string; imports: Map<string, string> } = { namespace: "", imports: new Map() };
  let k = 0;
  const docBefore = (index: number): Token | null => {
    // The docblock directly before a declaration, skipping attributes and modifiers.
    for (let j = index - 1; j >= 0; j--) {
      const t = tokens[j]!;
      if (t.kind === "docblock") {
        return t;
      }
      if (t.kind === "attribute" || t.kind === "comment" || (t.kind === "name" && MODIFIERS.has(t.text.toLowerCase()))) {
        continue;
      }
      return null;
    }
    return null;
  };
  while (k < code.length) {
    const t = tok(k);
    const lower = t.text.toLowerCase();
    if (t.kind === "name" && lower === "namespace") {
      const prev = k > 0 ? tok(k - 1).text : ";";
      if (prev === ";" || prev === "{" || prev === "}" || k === 0) {
        let name = "";
        k++;
        if (tok(k).kind === "name") {
          name = tok(k).text;
          k++;
        }
        scope = { namespace: name, imports: new Map() };
        if (tok(k).text === ";" || tok(k).text === "{") {
          k++;
        }
        continue;
      }
    }
    if (t.kind === "name" && lower === "use" && tok(k + 1).kind === "name") {
      k = parseUse(tokens, code, k + 1, scope.imports, file);
      continue;
    }
    if (t.kind === "name" && (lower === "function" || lower === "fn") && k > 0 && tok(k - 1).text !== "->" && tok(k - 1).text !== "::") {
      // A top-level function or closure: skip its body, which cannot declare a named class.
      let m = k + 1;
      while (m < code.length && tok(m).text !== "(") {
        m++;
      }
      if (m < code.length) {
        k = code.indexOf(matching(tokens, code[m]!, file) - 1, m) + 1;
        if (lower === "function") {
          while (k < code.length && tok(k).text !== "{" && tok(k).text !== ";") {
            if (tok(k).text === "(") {
              k = code.indexOf(matching(tokens, code[k]!, file) - 1, k);
            }
            k++;
          }
          if (k < code.length && tok(k).text === "{") {
            k = code.indexOf(matching(tokens, code[k]!, file) - 1, k) + 1;
          }
        }
      }
      continue;
    }
    const prevText = k > 0 ? tok(k - 1).text.toLowerCase() : "";
    if (
      t.kind === "name" &&
      (lower === "class" || lower === "interface" || lower === "trait" || lower === "enum") &&
      tok(k + 1).kind === "name" &&
      prevText !== "::" &&
      prevText !== "->" &&
      prevText !== "?->" &&
      prevText !== "new" &&
      !(lower === "enum" && !["{", ":", "implements"].includes(tok(k + 2).text.toLowerCase()))
    ) {
      const kind = lower as DeclarationKind;
      const nameTok = tok(k + 1);
      const frozen: NameScope = { namespace: scope.namespace, imports: new Map(scope.imports) };
      const fqcn = scope.namespace === "" ? nameTok.text : `${scope.namespace}\\${nameTok.text}`;
      let isAbstract = false;
      for (let j = k - 1; j >= 0 && tok(j).kind === "name" && MODIFIERS.has(tok(j).text.toLowerCase()); j--) {
        if (tok(j).text.toLowerCase() === "abstract") {
          isAbstract = true;
        }
      }
      const decl: Declaration = {
        fqcn,
        kind,
        abstract: isAbstract,
        extends: null,
        implements: [],
        traits: [],
        methods: [],
        properties: [],
        docblock: docBefore(code[k]!),
        start: code[k]!,
        end: -1,
        file,
        line: t.line,
        scope: frozen,
        tokens,
      };
      let m = k + 2;
      let clause: "extends" | "implements" | null = null;
      while (tok(m).text !== "{") {
        const u = tok(m);
        const ul = u.text.toLowerCase();
        if (u.kind === "name" && (ul === "extends" || ul === "implements")) {
          clause = ul;
        } else if (u.kind === "name" && clause !== null) {
          const resolved = resolveName(u.text, frozen);
          if (clause === "extends" && kind === "class") {
            decl.extends = resolved;
          } else {
            decl.implements.push(resolved);
          }
        }
        m++;
      }
      k = parseBody(tokens, code, m, decl, file);
      decl.end = code[k - 1]! + 1;
      declarations.push(decl);
      continue;
    }
    k++;
  }
  return { file, tokens, declarations };
}

// ---------------------------------------------------------------------------
// Index

export interface Index {
  /** Every declaration by FQCN; the first in walk order wins. */
  byFqcn: Map<string, Declaration>;
  /** Every parsed file in walk order. */
  files: ParsedFile[];
}

/** The `.php` files (not `.blade.php`) under `dir`, sorted, relative to `base`. */
function phpFiles(dir: string, base: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort(compareUnits)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (name.endsWith(".php") && !name.endsWith(".blade.php")) {
        out.push(relative(base, path));
      }
    }
  };
  walk(dir);
  return out;
}

/** Indexes every declaration in the four repositories' `src/`. File names in errors are relative to `root`. */
export function buildIndex(root: string): Index {
  const byFqcn = new Map<string, Declaration>();
  const files: ParsedFile[] = [];
  for (const { name } of UPSTREAM_REPOS) {
    const src = upstreamPath(root, name, "src");
    for (const rel of phpFiles(src, root)) {
      const parsed = parseFile(readFileSync(join(root, rel), "utf8"), rel.split("\\").join("/"));
      files.push(parsed);
      for (const decl of parsed.declarations) {
        if (!byFqcn.has(decl.fqcn)) {
          byFqcn.set(decl.fqcn, decl);
        }
      }
    }
  }
  return { byFqcn, files };
}

/** The declaration's ancestors in the index, nearest first. */
export function ancestors(index: Index, decl: Declaration): Declaration[] {
  const out: Declaration[] = [];
  const seen = new Set<string>([decl.fqcn]);
  let current = decl.extends;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const parent = index.byFqcn.get(current);
    if (parent === undefined) {
      break;
    }
    out.push(parent);
    current = parent.extends;
  }
  return out;
}

/** Whether the declaration's `extends` chain reaches `fqcn`. */
export function extendsChainReaches(index: Index, decl: Declaration, fqcn: string): boolean {
  const seen = new Set<string>();
  let current = decl.extends;
  while (current !== null && !seen.has(current)) {
    if (current === fqcn) {
      return true;
    }
    seen.add(current);
    current = index.byFqcn.get(current)?.extends ?? null;
  }
  return false;
}

/** The code tokens' indexes of a range, comments and the like dropped. */
export function codeRange(tokens: readonly Token[], start: number, end: number): number[] {
  const out: number[] = [];
  for (let j = start; j < end; j++) {
    if (!SKIPPED.has(tokens[j]!.kind)) {
      out.push(j);
    }
  }
  return out;
}
