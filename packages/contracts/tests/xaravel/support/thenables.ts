// The PromiseLike check of XT-contracts-13 (AD-6, ESC-6.1-1 item 2): every class with an instance member named `then`
// declares `PromiseLike` in its own `implements` list. It declares no test of its own.
//
// It is a lexical scanner with no package imports. The tokenizer drops comments and reads strings, template literals
// and regex literals as single tokens, so a `then` or a `class` inside one is never seen; a template literal's `${…}`
// expressions are tokenized as code. Each `class` keyword (a declaration or an expression, at any depth, so classes
// nested in a body and classes a function returns for `mixin` are found) is read as a header, whose top-level
// `implements` list is collected, and a body, whose members at its own depth are read one by one. A member counts when
// it is not `static` and its name is `then`: an identifier, a quoted string or a computed string (`["then"]`), for a
// method (also `async`, generic, `get` or `set`), a field (also optional, with a type or an initializer) or a
// constructor parameter property (`constructor(public then: …)`, also `private`, `protected`, `readonly` or
// `override`). A class expression may be anonymous and generic (`class<T> { … }`). Object literals and
// calls are skipped inside the members they belong to, so `{ then() {} }` and `.then(` never count.

type Kind = "ident" | "string" | "template" | "number" | "regex" | "punct";

interface Token {
  readonly kind: Kind;
  /** The identifier, the punctuator, or a string's (or substitution-free template's) cooked value. */
  readonly value: string;
  /** Whether a line break comes between this token and the one before it. */
  readonly newline: boolean;
}

/** The keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER_WORD: ReadonlySet<string> = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

const IDENT_START = /[A-Za-z_$\u0080-\uffff]/;
const IDENT_PART = /[A-Za-z0-9_$\u0080-\uffff]/;

/** The tokens of `source`, without comments. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  /** For each open template substitution, the brace depth at which its `}` closes it. */
  const templateDepths: number[] = [];
  let braceDepth = 0;
  let newline = false;
  let i = 0;
  const n = source.length;

  const push = (kind: Kind, value: string): void => {
    tokens.push({ kind, value, newline });
    newline = false;
  };

  /** Reads a template literal's text from `i` (after a backtick or a substitution's `}`); returns whether it ended. */
  const readTemplate = (): { ended: boolean; text: string } => {
    let text = "";
    while (i < n) {
      const c = source[i]!;
      if (c === "\\") {
        text += source[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === "`") {
        i++;
        return { ended: true, text };
      }
      if (c === "$" && source[i + 1] === "{") {
        i += 2;
        return { ended: false, text };
      }
      text += c;
      i++;
    }
    return { ended: true, text };
  };

  const regexAllowed = (): boolean => {
    const last = tokens[tokens.length - 1];
    if (last === undefined) {
      return true;
    }
    if (last.kind === "ident") {
      return REGEX_AFTER_WORD.has(last.value);
    }
    if (last.kind === "punct") {
      return last.value !== ")" && last.value !== "]" && last.value !== "}";
    }
    return false;
  };

  if (source.startsWith("#!")) {
    while (i < n && source[i] !== "\n") {
      i++;
    }
  }

  while (i < n) {
    const c = source[i]!;
    if (c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029") {
      newline = true;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\f" || c === "\v" || c === "\ufeff" || c === "\u00a0") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n" && source[i] !== "\r") {
        i++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      if (/[\n\r\u2028\u2029]/.test(source.slice(i, stop))) {
        newline = true;
      }
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let text = "";
      i++;
      while (i < n && source[i] !== c && source[i] !== "\n") {
        if (source[i] === "\\") {
          text += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        text += source[i];
        i++;
      }
      i++;
      push("string", text);
      continue;
    }
    if (c === "`") {
      i++;
      const { ended, text } = readTemplate();
      // A substitution-free template keeps its text, so a computed `[`then`]` name is read; one with substitutions is opaque.
      push("template", ended ? text : "");
      if (!ended) {
        templateDepths.push(braceDepth);
        braceDepth++;
      }
      continue;
    }
    if (c === "}" && templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === braceDepth - 1) {
      // The end of a template substitution: the template's text resumes.
      templateDepths.pop();
      braceDepth--;
      i++;
      const { ended } = readTemplate();
      if (!ended) {
        templateDepths.push(braceDepth);
        braceDepth++;
      }
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let inClass = false;
      i++;
      while (i < n && source[i] !== "\n") {
        const r = source[i]!;
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") {
          inClass = true;
        } else if (r === "]") {
          inClass = false;
        } else if (r === "/" && !inClass) {
          break;
        }
        i++;
      }
      i++;
      while (i < n && IDENT_PART.test(source[i]!)) {
        i++;
      }
      push("regex", "");
      continue;
    }
    if (IDENT_START.test(c) || (c === "#" && i + 1 < n && IDENT_START.test(source[i + 1]!))) {
      const start = i;
      i++;
      while (i < n && IDENT_PART.test(source[i]!)) {
        i++;
      }
      push("ident", source.slice(start, i));
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i;
      while (i < n && /[0-9A-Za-z_.]/.test(source[i]!)) {
        i++;
      }
      push("number", source.slice(start, i));
      continue;
    }
    if (c === "=" && source[i + 1] === ">") {
      i += 2;
      push("punct", "=>");
      continue;
    }
    if (c === "?" && source[i + 1] === "." && !/[0-9]/.test(source[i + 2] ?? "")) {
      i += 2;
      push("punct", "?.");
      continue;
    }
    if (c === "." && source[i + 1] === "." && source[i + 2] === ".") {
      i += 3;
      push("punct", "...");
      continue;
    }
    if (c === "{") {
      braceDepth++;
    } else if (c === "}") {
      braceDepth--;
    }
    i++;
    push("punct", c);
  }
  return tokens;
}

const OPEN: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };

/** The index after the bracket that closes the one at `start` (`(`, `[`, `{`, or `<` when `angles` is set). */
function skipBalanced(tokens: readonly Token[], start: number, angles = false): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind !== "punct") {
      continue;
    }
    if (token.value in OPEN || (angles && token.value === "<")) {
      depth++;
    } else if (token.value === ")" || token.value === "]" || token.value === "}" || (angles && token.value === ">")) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return tokens.length;
}

/** Whether `token` is the punctuator `value`. */
function isPunct(token: Token | undefined, value: string): boolean {
  return token !== undefined && token.kind === "punct" && token.value === value;
}

/** The punctuators after which a line break does not end a statement: the expression continues. */
const CONTINUES_AFTER: ReadonlySet<string> = new Set(["=", "=>", ",", "(", "[", "{", ".", "?.", "?", ":", "+", "-", "*", "/", "%", "&", "|", "^", "!", "~", "<", ">", "..."]);
/** The punctuators before which a line break does not end a statement. */
const CONTINUES_BEFORE: ReadonlySet<string> = new Set(["=", "=>", ",", ")", "]", ".", "?.", "?", ":", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "("]);

/**
 * The index after the end of the member part starting at `start` that runs to a `;` at its own depth, a line break
 * where a statement ends, or the class body's closing `}` (left unconsumed). `stopAtBody` also ends it after a `{…}`
 * block at its own depth that is not a type literal (a method body).
 */
function skipToMemberEnd(tokens: readonly Token[], start: number, end: number, stopAtBody: boolean): number {
  let i = start;
  while (i < end) {
    const token = tokens[i]!;
    const previous = tokens[i - 1];
    if (i > start && token.newline && previous !== undefined) {
      const continues = (previous.kind === "punct" && CONTINUES_AFTER.has(previous.value)) || (token.kind === "punct" && CONTINUES_BEFORE.has(token.value));
      if (!continues && !(stopAtBody && isPunct(token, "{"))) {
        return i;
      }
    }
    if (token.kind === "punct") {
      if (token.value === ";") {
        return i + 1;
      }
      if (token.value === "}") {
        return i;
      }
      if (token.value === "{") {
        const typeLiteral = previous !== undefined && previous.kind === "punct" && [":", "|", "&", "<", ",", "=>", "(", "["].includes(previous.value);
        const after = skipBalanced(tokens, i);
        if (stopAtBody && !typeLiteral) {
          return after;
        }
        i = after;
        continue;
      }
      if (token.value === "(" || token.value === "[") {
        i = skipBalanced(tokens, i);
        continue;
      }
    }
    i++;
  }
  return end;
}

const MODIFIERS: ReadonlySet<string> = new Set(["public", "private", "protected", "readonly", "static", "abstract", "override", "declare", "async", "get", "set", "accessor"]);

/** Whether `token` can start a member name, so a modifier word before it is a modifier. */
function startsName(token: Token | undefined): boolean {
  if (token === undefined) {
    return false;
  }
  if (token.kind === "ident" || token.kind === "string" || token.kind === "number" || token.kind === "template") {
    return true;
  }
  return isPunct(token, "[") || isPunct(token, "*") || isPunct(token, "{");
}

const PARAMETER_MODIFIERS: ReadonlySet<string> = new Set(["public", "private", "protected", "readonly", "override"]);

/** Whether the constructor parameter list opening at `open` declares a parameter property named `then`. */
function hasThenParameterProperty(tokens: readonly Token[], open: number): boolean {
  const end = skipBalanced(tokens, open) - 1;
  let i = open + 1;
  while (i < end) {
    // One parameter: decorators, modifiers, then its name.
    while (isPunct(tokens[i], "@")) {
      i++;
      while (i < end && (tokens[i]!.kind === "ident" || isPunct(tokens[i], "."))) {
        i++;
      }
      if (isPunct(tokens[i], "(")) {
        i = skipBalanced(tokens, i);
      }
    }
    let modified = false;
    while (i < end && tokens[i]!.kind === "ident" && PARAMETER_MODIFIERS.has(tokens[i]!.value) && tokens[i + 1]?.kind === "ident") {
      modified = true;
      i++;
    }
    if (modified && tokens[i]?.kind === "ident" && tokens[i]!.value === "then") {
      return true;
    }
    // Skip to the next `,` at the list's own depth.
    while (i < end && !isPunct(tokens[i], ",")) {
      const token = tokens[i]!;
      if (token.kind === "punct" && (token.value === "(" || token.value === "[" || token.value === "{")) {
        i = skipBalanced(tokens, i);
      } else if (isPunct(token, "<")) {
        // A type argument list (`Map<string, number>`); a `<` comparison in a default value stops at the list's end.
        i = Math.min(skipBalanced(tokens, i, true), end);
      } else {
        i++;
      }
    }
    i++;
  }
  return false;
}

/** Whether an instance member of the class body between `open` (its `{`) and `close` (its `}`) is named `then`. */
function declaresInstanceThen(tokens: readonly Token[], open: number, close: number): boolean {
  let i = open + 1;
  while (i < close) {
    if (isPunct(tokens[i], ";")) {
      i++;
      continue;
    }
    // Decorators.
    while (isPunct(tokens[i], "@")) {
      i++;
      while (i < close && (tokens[i]!.kind === "ident" || isPunct(tokens[i], "."))) {
        i++;
      }
      if (isPunct(tokens[i], "(")) {
        i = skipBalanced(tokens, i);
      }
    }
    let isStatic = false;
    while (i < close && tokens[i]!.kind === "ident" && MODIFIERS.has(tokens[i]!.value) && startsName(tokens[i + 1])) {
      if (tokens[i]!.value === "static") {
        isStatic = true;
      }
      i++;
    }
    if (isPunct(tokens[i], "{")) {
      // A `static { … }` block.
      i = skipBalanced(tokens, i);
      continue;
    }
    if (isPunct(tokens[i], "*")) {
      i++;
    }
    const nameToken = tokens[i];
    let name: string | null = null;
    if (nameToken === undefined || i >= close) {
      break;
    }
    if (nameToken.kind === "ident" || nameToken.kind === "string" || nameToken.kind === "number") {
      name = nameToken.value;
      i++;
    } else if (isPunct(nameToken, "[")) {
      const after = skipBalanced(tokens, i);
      const inner = tokens.slice(i + 1, after - 1);
      if (inner.length === 1 && (inner[0]!.kind === "string" || inner[0]!.kind === "template")) {
        name = inner[0]!.value;
      }
      i = after;
    } else {
      // Not a member start this scanner reads: skip to the next member boundary.
      i = Math.max(i + 1, skipToMemberEnd(tokens, i, close, true));
      continue;
    }
    if (name === "then" && !isStatic) {
      return true;
    }
    if (isPunct(tokens[i], "?") || isPunct(tokens[i], "!")) {
      i++;
    }
    if (isPunct(tokens[i], "<")) {
      i = skipBalanced(tokens, i, true);
    }
    if (name === "constructor" && !isStatic && isPunct(tokens[i], "(") && hasThenParameterProperty(tokens, i)) {
      return true;
    }
    i = Math.max(i, skipToMemberEnd(tokens, i, close, true));
  }
  return false;
}

/** The class's name: its own, the binding a class expression is assigned to, or `(anonymous)`. */
function className(tokens: readonly Token[], index: number): string {
  const next = tokens[index + 1];
  if (next !== undefined && next.kind === "ident" && next.value !== "extends" && next.value !== "implements") {
    return next.value;
  }
  const previous = tokens[index - 1];
  const binding = tokens[index - 2];
  if (isPunct(previous, "=") && binding !== undefined && binding.kind === "ident") {
    return binding.value;
  }
  return "(anonymous)";
}

/**
 * The problems of `source`: one `<file>: class <Name> declares then but does not implement PromiseLike` line per
 * class, in source order, with an instance member named `then` and no `PromiseLike` in its own `implements` list.
 */
export function thenableProblems(source: string, file: string): string[] {
  const tokens = tokenize(source);
  const problems: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind !== "ident" || token.value !== "class") {
      continue;
    }
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (isPunct(previous, ".") || isPunct(previous, "?.") || next === undefined || !(next.kind === "ident" || isPunct(next, "{") || isPunct(next, "<"))) {
      continue;
    }
    // The header: everything up to the body's `{` at the header's own depth.
    let i = index + 1;
    let inImplements = false;
    let entryStart = true;
    let implementsPromiseLike = false;
    let lastEntryName: string | null = null;
    const closeEntry = (): void => {
      if (lastEntryName === "PromiseLike") {
        implementsPromiseLike = true;
      }
      lastEntryName = null;
    };
    while (i < tokens.length && !isPunct(tokens[i], "{")) {
      const t = tokens[i]!;
      if (t.kind === "punct" && (t.value === "(" || t.value === "[")) {
        i = skipBalanced(tokens, i);
        continue;
      }
      if (isPunct(t, "<")) {
        i = skipBalanced(tokens, i, true);
        entryStart = false;
        continue;
      }
      if (t.kind === "ident" && t.value === "implements") {
        inImplements = true;
        entryStart = true;
        i++;
        continue;
      }
      if (inImplements) {
        if (isPunct(t, ",")) {
          closeEntry();
          entryStart = true;
        } else if (t.kind === "ident" && (entryStart || isPunct(tokens[i - 1], "."))) {
          lastEntryName = t.value;
          entryStart = false;
        }
      }
      i++;
    }
    closeEntry();
    if (i >= tokens.length) {
      continue;
    }
    const close = skipBalanced(tokens, i) - 1;
    if (!implementsPromiseLike && declaresInstanceThen(tokens, i, close)) {
      problems.push(`${file}: class ${className(tokens, index)} declares then but does not implement PromiseLike`);
    }
  }
  return problems;
}
