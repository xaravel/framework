// The `portedTest` block scanner of the line-level ownership rules (Story 5.6,
// AD-16).
//
// `scanPortedBlocks(text)` lexes a Ported Test file (TypeScript) and returns
// one block per `portedTest` occurrence:
//
//   { id, line, text }
//
// where `text` is the whole call, from `portedTest` to its closing `)`, and
// `line` is the 1-based line of `portedTest`. Strings, template literals,
// comments and regular expression literals are skipped, so a `portedTest(` in
// any of them is not a block. `id` is the first argument's value when it can be
// resolved statically:
//
//   - a string literal ('…' or "…"), or
//   - a template literal whose every `${X}` is an identifier `X` declared
//     exactly once in the file, as a top-level `const X = "<literal>"`;
//
// otherwise `id` is null (an unresolved id: the caller fails closed). A
// `portedTest` that is not called (an alias, `portedTest.call`, an import
// renamed with `as`) is a block with a null id too; only a plain import or
// export specifier (`{ portedTest }`, `{ a, portedTest }`) is not a block.
//
// Input the lexer cannot read (an unterminated string, template, comment or
// regular expression) or whose brackets do not balance is an error, never
// blocks: `{ error }`.

export interface PortedBlock {
  /** The resolved Test ID, or null when it cannot be resolved statically. */
  readonly id: string | null;
  /** 1-based line of the `portedTest` token. */
  readonly line: number;
  /** The call's source text, or the bare token when it is not called. */
  readonly text: string;
}

export type ScanResult = { readonly blocks: PortedBlock[]; readonly error: null } | { readonly blocks: null; readonly error: string };

type TokenKind = "ident" | "string" | "template" | "punct" | "regex" | "number";

interface Token {
  readonly kind: TokenKind;
  /** Identifier name, punctuator, the cooked value of a string, or the raw source of anything else. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  /** A template literal's cooked string parts. */
  readonly quasis?: string[];
  /** A template literal's `${…}` sources, trimmed. */
  readonly exprs?: string[];
}

class LexError extends Error {}

const IDENT_START = /[A-Za-z_$\u0080-￿]/;
const IDENT_PART = /[A-Za-z0-9_$\u0080-￿]/;
/** Keywords after which a `/` starts a regular expression. */
const REGEX_AFTER_WORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const PUNCTUATORS = [">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**"];

/** Decodes one escape sequence starting after the backslash at `i`; returns the text and the index after it. */
function escape(source: string, i: number): [string, number] {
  const c = source[i];
  if (c === undefined) {
    throw new LexError("an escape at the end of the input");
  }
  const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
  if (c in simple && !(c === "0" && /[0-9]/.test(source[i + 1] ?? ""))) {
    return [simple[c]!, i + 1];
  }
  if (c === "x") {
    const hex = source.slice(i + 1, i + 3);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
      throw new LexError("a malformed \\x escape");
    }
    return [String.fromCharCode(parseInt(hex, 16)), i + 3];
  }
  if (c === "u") {
    if (source[i + 1] === "{") {
      const close = source.indexOf("}", i + 2);
      const hex = close === -1 ? "" : source.slice(i + 2, close);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex) || parseInt(hex, 16) > 0x10ffff) {
        throw new LexError("a malformed \\u{} escape");
      }
      return [String.fromCodePoint(parseInt(hex, 16)), close + 1];
    }
    const hex = source.slice(i + 1, i + 5);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      throw new LexError("a malformed \\u escape");
    }
    return [String.fromCharCode(parseInt(hex, 16)), i + 5];
  }
  if (c === "\r" && source[i + 1] === "\n") {
    return ["", i + 2];
  }
  if (c === "\n" || c === "\r" || c === " " || c === " ") {
    return ["", i + 1];
  }
  return [c, i + 1];
}

/**
 * Lexes `source` from `from`. With `nested` (the body of a template `${`), stops at the first `}` that closes no `{`
 * of its own and returns its index as `end`; otherwise lexes to the end of the input.
 */
function lexCode(source: string, from: number, startLine: number, nested: boolean): { tokens: Token[]; end: number; line: number } {
  const tokens: Token[] = [];
  let i = from;
  let line = startLine;
  let depth = 0;
  const countLines = (a: number, b: number): void => {
    for (let k = a; k < b; k++) {
      if (source[k] === "\n") {
        line++;
      }
    }
  };
  const regexAllowed = (): boolean => {
    const previous = tokens.at(-1);
    if (previous === undefined) {
      return true;
    }
    if (previous.kind === "ident") {
      return REGEX_AFTER_WORDS.has(previous.value);
    }
    if (previous.kind === "punct") {
      return ![")", "]", "}", "++", "--"].includes(previous.value);
    }
    return false;
  };
  while (i < source.length) {
    const c = source[i]!;
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close === -1) {
        throw new LexError(`an unterminated block comment on line ${line}`);
      }
      countLines(i, close + 2);
      i = close + 2;
      continue;
    }
    const start = i;
    const tokenLine = line;
    if (c === "'" || c === '"') {
      let value = "";
      let k = i + 1;
      for (;;) {
        const d = source[k];
        if (d === undefined || d === "\n") {
          throw new LexError(`an unterminated string on line ${tokenLine}`);
        }
        if (d === c) {
          break;
        }
        if (d === "\\") {
          const [text, next] = escape(source, k + 1);
          value += text;
          countLines(k, next);
          k = next;
          continue;
        }
        value += d;
        k++;
      }
      i = k + 1;
      tokens.push({ kind: "string", value, start, end: i, line: tokenLine });
      continue;
    }
    if (c === "`") {
      const quasis: string[] = [];
      const exprs: string[] = [];
      let cooked = "";
      let k = i + 1;
      for (;;) {
        const d = source[k];
        if (d === undefined) {
          throw new LexError(`an unterminated template literal on line ${tokenLine}`);
        }
        if (d === "`") {
          quasis.push(cooked);
          k++;
          break;
        }
        if (d === "\\") {
          const [text, next] = escape(source, k + 1);
          cooked += text;
          countLines(k, next);
          k = next;
          continue;
        }
        if (d === "$" && source[k + 1] === "{") {
          quasis.push(cooked);
          cooked = "";
          const inner = lexCode(source, k + 2, line, true);
          exprs.push(source.slice(k + 2, inner.end).trim());
          line = inner.line;
          k = inner.end + 1;
          continue;
        }
        if (d === "\n") {
          line++;
        }
        cooked += d;
        k++;
      }
      i = k;
      tokens.push({ kind: "template", value: source.slice(start, i), start, end: i, line: tokenLine, quasis, exprs });
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let k = i + 1;
      let inClass = false;
      for (;;) {
        const d = source[k];
        if (d === undefined || d === "\n") {
          throw new LexError(`an unterminated regular expression on line ${tokenLine}`);
        }
        if (d === "\\") {
          k += 2;
          continue;
        }
        if (d === "[") {
          inClass = true;
        } else if (d === "]") {
          inClass = false;
        } else if (d === "/" && !inClass) {
          break;
        }
        k++;
      }
      k++;
      while (k < source.length && IDENT_PART.test(source[k]!)) {
        k++;
      }
      i = k;
      tokens.push({ kind: "regex", value: source.slice(start, i), start, end: i, line: tokenLine });
      continue;
    }
    if (IDENT_START.test(c)) {
      let k = i + 1;
      while (k < source.length && IDENT_PART.test(source[k]!)) {
        k++;
      }
      i = k;
      tokens.push({ kind: "ident", value: source.slice(start, i), start, end: i, line: tokenLine });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      let k = i + 1;
      while (k < source.length && /[0-9A-Za-z_.]/.test(source[k]!)) {
        k++;
      }
      i = k;
      tokens.push({ kind: "number", value: source.slice(start, i), start, end: i, line: tokenLine });
      continue;
    }
    if (nested && c === "}" && depth === 0) {
      return { tokens, end: i, line };
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    }
    const punct = PUNCTUATORS.find((candidate) => source.startsWith(candidate, i)) ?? c;
    i += punct.length;
    tokens.push({ kind: "punct", value: punct, start, end: i, line: tokenLine });
  }
  if (nested) {
    throw new LexError("an unterminated template substitution");
  }
  return { tokens, end: i, line };
}

function lex(source: string): Token[] {
  return lexCode(source, 0, 1, false).tokens;
}

/** Whether `tokens[i]` opens a bracket, and its partner. */
const CLOSERS: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };

/** Checks every bracket in `tokens` balances; returns an error message or null. */
function balance(tokens: readonly Token[]): string | null {
  const stack: Token[] = [];
  for (const token of tokens) {
    if (token.kind !== "punct") {
      continue;
    }
    if (token.value in CLOSERS) {
      stack.push(token);
    } else if (token.value === ")" || token.value === "]" || token.value === "}") {
      const open = stack.pop();
      if (open === undefined || CLOSERS[open.value] !== token.value) {
        return `an unbalanced "${token.value}" on line ${token.line}`;
      }
    }
  }
  const open = stack.pop();
  return open === undefined ? null : `an unclosed "${open.value}" on line ${open.line}`;
}

/** Top-level `const X = "<literal>"` declarations, for names declared exactly once in the file. */
function constants(tokens: readonly Token[]): Map<string, string> {
  const declared = new Map<string, number>();
  const values = new Map<string, string>();
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === "punct" && token.value in CLOSERS) {
      depth++;
    } else if (token.kind === "punct" && [")", "]", "}"].includes(token.value)) {
      depth--;
    }
    if (token.kind === "ident" && ["const", "let", "var", "function", "class"].includes(token.value)) {
      const name = tokens[i + 1];
      if (name?.kind === "ident") {
        declared.set(name.value, (declared.get(name.value) ?? 0) + 1);
        const eq = tokens[i + 2];
        const literal = tokens[i + 3];
        const after = tokens[i + 4];
        const ends = after === undefined || (after.kind === "punct" && (after.value === ";" || after.value === ",")) || (after.line > (literal?.line ?? 0) && after.kind !== "punct");
        if (depth === 0 && token.value === "const" && eq?.kind === "punct" && eq.value === "=" && literal?.kind === "string" && ends) {
          values.set(name.value, literal.value);
        }
      }
    }
  }
  return new Map([...values].filter(([name]) => declared.get(name) === 1));
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The id of a first argument made of `args`, or null. */
function resolveId(args: readonly Token[], consts: ReadonlyMap<string, string>): string | null {
  if (args.length !== 1) {
    return null;
  }
  const arg = args[0]!;
  if (arg.kind === "string") {
    return arg.value;
  }
  if (arg.kind !== "template") {
    return null;
  }
  let out = arg.quasis![0]!;
  for (const [index, expr] of arg.exprs!.entries()) {
    if (!IDENTIFIER.test(expr) || !consts.has(expr)) {
      return null;
    }
    out += consts.get(expr)! + arg.quasis![index + 1]!;
  }
  return out;
}

/** Scans `source` for `portedTest` blocks (see the header). */
export function scanPortedBlocks(source: string): ScanResult {
  let tokens: Token[];
  try {
    tokens = lex(source);
  } catch (error) {
    return { blocks: null, error: error instanceof Error ? error.message : String(error) };
  }
  const unbalanced = balance(tokens);
  if (unbalanced !== null) {
    return { blocks: null, error: unbalanced };
  }
  const consts = constants(tokens);
  const blocks: PortedBlock[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind !== "ident" || token.value !== "portedTest") {
      continue;
    }
    let k = i + 1;
    // A generic call, `portedTest<T>(…)`: skip the balanced type arguments.
    if (tokens[k]?.kind === "punct" && tokens[k]!.value === "<") {
      let angle = 0;
      for (; k < tokens.length; k++) {
        const t = tokens[k]!;
        if (t.kind === "punct" && t.value === "<") {
          angle++;
        } else if (t.kind === "punct" && t.value === ">") {
          angle--;
        } else if (t.kind === "punct" && t.value === ">>") {
          angle -= 2;
        }
        if (angle <= 0) {
          break;
        }
      }
      k++;
    }
    const open = tokens[k];
    if (open?.kind === "punct" && open.value === "(") {
      let depth = 0;
      let end = -1;
      let firstComma = -1;
      for (let j = k; j < tokens.length; j++) {
        const t = tokens[j]!;
        if (t.kind !== "punct") {
          continue;
        }
        if (t.value in CLOSERS) {
          depth++;
        } else if (t.value === ")" || t.value === "]" || t.value === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        } else if (t.value === "," && depth === 1 && firstComma === -1) {
          firstComma = j;
        }
      }
      if (end === -1) {
        return { blocks: null, error: `an unclosed portedTest call on line ${token.line}` };
      }
      const args = tokens.slice(k + 1, firstComma === -1 ? end : firstComma);
      blocks.push({ id: resolveId(args, consts), line: token.line, text: source.slice(token.start, tokens[end]!.end) });
      continue;
    }
    // `{ portedTest }` or `{ a, portedTest, b }` in an import or export: not a block. Anything else (an alias, a
    // member access, `as` renaming) cannot be followed statically.
    const previous = tokens[i - 1];
    const next = tokens[i + 1];
    const inList = previous?.kind === "punct" && (previous.value === "{" || previous.value === ",") && next?.kind === "punct" && (next.value === "}" || next.value === ",");
    if (!inList) {
      blocks.push({ id: null, line: token.line, text: token.value });
    }
  }
  return { blocks, error: null };
}
