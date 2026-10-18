// The static PHP reader behind `bun run oracle:extract` (Story 3.1,
// decisions/ESC-3.1-1.md). It works on PHP's own tokens (tools/oracle/extract/
// tokens.php, `PhpToken::tokenize`) and never evaluates anything:
//
//   - the file model: namespace, `use` imports (class, function and const,
//     grouped or not), and each class's methods (parameters and body tokens)
//     and declared properties;
//   - a method body as top-level statements, with assertion recognition
//     (`$this->`, `static::` or `self::` + an assert name from ASSERTIONS,
//     which gives the actual argument's index);
//   - segmenting, the readability rules and the free-variable check;
//   - class-name resolution against the namespace and imports, as PHP's
//     compiler resolves them (before `::`, after `new`, `instanceof`,
//     `extends`, `implements`, and in closure type hints), plus `use function`
//     and `use const` imports; nothing else in the source is rewritten;
//   - PHP literal decoding (strings, heredoc and nowdoc without interpolation,
//     `.` concatenation, ints, non-integral floats, bools, null, arrays);
//   - splitting a lister.php `export()` dataset row into PHP literal sources.
//
// Anything outside these shapes is unreadable: the caller then writes no
// request, never a guess.
import type { Json, JsonObject, RequestKind } from "../request";

/** One PHP token: `getTokenName()` (the character itself for a one-character token), the text and the line. */
export interface Token {
  name: string;
  text: string;
  line: number;
}

export interface PhpParam {
  name: string;
  variadic: boolean;
  byRef: boolean;
  hasDefault: boolean;
  /** The default value's source when it is a PHP literal (bound when a dataset row omits the parameter); else null. */
  defaultSource: string | null;
}

export interface PhpMethod {
  name: string;
  params: PhpParam[];
  /** The tokens strictly between the body's braces; null for an abstract method. */
  body: Token[] | null;
}

export interface PhpClass {
  name: string;
  /** The FQCN without a leading backslash. */
  fqcn: string;
  /** Methods by lowercase name. */
  methods: Map<string, PhpMethod>;
  /** Declared property names without `$` (promoted constructor parameters included). */
  properties: Set<string>;
  /** The namespace and imports in force where the class is declared. */
  scope: PhpFile;
}

export interface PhpFile {
  path: string;
  /** The namespace without leading or trailing backslash; "" for the global namespace. */
  namespace: string;
  /** `use` class imports: lowercase alias to FQCN (no leading backslash). */
  classImports: Map<string, string>;
  /** `use function` imports: lowercase alias to FQN. */
  functionImports: Map<string, string>;
  /** `use const` imports: alias (case-sensitive) to FQN. */
  constImports: Map<string, string>;
  /** Every class of the file, whatever namespace block declares it. */
  classes: PhpClass[];
}

/** Thrown for a token stream the file model does not support (a braced or second namespace, an unbalanced bracket). */
export class PhpReadError extends Error {}

const IGNORABLE = new Set(["T_WHITESPACE", "T_COMMENT", "T_DOC_COMMENT"]);
const NAME_TOKENS = new Set(["T_STRING", "T_NAME_QUALIFIED", "T_NAME_FULLY_QUALIFIED", "T_NAME_RELATIVE"]);
const OPENERS: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", T_CURLY_OPEN: "}", T_DOLLAR_OPEN_CURLY_BRACES: "}", T_ATTRIBUTE: "]" };
const MAGIC_CONSTANTS = new Set(["T_DIR", "T_FILE", "T_LINE", "T_CLASS_C", "T_FUNC_C", "T_METHOD_C", "T_NS_C", "T_TRAIT_C", "T_PROPERTY_C"]);
const BUILTIN_TYPES = new Set(["int", "float", "string", "bool", "array", "callable", "iterable", "object", "mixed", "void", "null", "false", "true", "never", "static", "self", "parent"]);
const SPECIAL_CLASSES = new Set(["self", "static", "parent"]);
const SUPERGLOBALS = new Set(["$GLOBALS", "$_SERVER", "$_GET", "$_POST", "$_FILES", "$_COOKIE", "$_SESSION", "$_REQUEST", "$_ENV"]);
const MOCKERY_METHODS = new Set(["shouldreceive", "shouldnotreceive", "shouldhavereceived", "shouldnothavereceived", "expects", "allows", "shouldignoremissing", "makepartial", "shoulddefermissing"]);
const MODIFIERS = new Set(["T_PUBLIC", "T_PROTECTED", "T_PRIVATE", "T_READONLY", "T_PUBLIC_SET", "T_PROTECTED_SET", "T_PRIVATE_SET"]);
/** The token kinds a readable top-level statement may start with. */
// `unset(…)` is not one: the free-variable check does not track unsetting.
const STATEMENT_STARTS = new Set(["T_VARIABLE", "T_STRING", "T_NAME_QUALIFIED", "T_NAME_FULLY_QUALIFIED", "T_NAME_RELATIVE", "T_STATIC", "T_NEW", "(", "T_INC", "T_DEC"]);

/**
 * The PHPUnit assertions a Differential body may use, by lowercase name, with the index of the actual argument (the
 * value under test). Any other `assert*` call makes the body unreadable.
 */
export const ASSERTIONS: ReadonlyMap<string, number> = new Map(
  Object.entries({
    assertSame: 1,
    assertNotSame: 1,
    assertEquals: 1,
    assertNotEquals: 1,
    assertEqualsCanonicalizing: 1,
    assertNotEqualsCanonicalizing: 1,
    assertEqualsIgnoringCase: 1,
    assertNotEqualsIgnoringCase: 1,
    assertEqualsWithDelta: 1,
    assertNotEqualsWithDelta: 1,
    assertCount: 1,
    assertNotCount: 1,
    assertSameSize: 1,
    assertNotSameSize: 1,
    assertInstanceOf: 1,
    assertNotInstanceOf: 1,
    assertContains: 1,
    assertNotContains: 1,
    assertContainsEquals: 1,
    assertNotContainsEquals: 1,
    assertArrayHasKey: 1,
    assertArrayNotHasKey: 1,
    assertStringContainsString: 1,
    assertStringNotContainsString: 1,
    assertStringContainsStringIgnoringCase: 1,
    assertStringNotContainsStringIgnoringCase: 1,
    assertStringStartsWith: 1,
    assertStringStartsNotWith: 1,
    assertStringEndsWith: 1,
    assertStringEndsNotWith: 1,
    assertMatchesRegularExpression: 1,
    assertDoesNotMatchRegularExpression: 1,
    assertStringMatchesFormat: 1,
    assertStringNotMatchesFormat: 1,
    assertStringEqualsStringIgnoringLineEndings: 1,
    assertJsonStringEqualsJsonString: 1,
    assertJsonStringNotEqualsJsonString: 1,
    assertGreaterThan: 1,
    assertGreaterThanOrEqual: 1,
    assertLessThan: 1,
    assertLessThanOrEqual: 1,
    assertTrue: 0,
    assertFalse: 0,
    assertNotTrue: 0,
    assertNotFalse: 0,
    assertNull: 0,
    assertNotNull: 0,
    assertEmpty: 0,
    assertNotEmpty: 0,
    assertIsArray: 0,
    assertIsBool: 0,
    assertIsFloat: 0,
    assertIsInt: 0,
    assertIsNumeric: 0,
    assertIsObject: 0,
    assertIsString: 0,
    assertIsScalar: 0,
    assertIsCallable: 0,
    assertIsIterable: 0,
    assertIsList: 0,
    assertIsNotArray: 0,
    assertIsNotBool: 0,
    assertIsNotFloat: 0,
    assertIsNotInt: 0,
    assertIsNotNumeric: 0,
    assertIsNotObject: 0,
    assertIsNotString: 0,
    assertIsNotScalar: 0,
    assertIsNotCallable: 0,
    assertIsNotIterable: 0,
    assertNan: 0,
    assertFinite: 0,
    assertInfinite: 0,
    assertJson: 0,
  }).map(([name, index]) => [name.toLowerCase(), index]),
);

export function isCode(token: Token): boolean {
  return !IGNORABLE.has(token.name);
}

/** Parses tokens.php's stdout: one `{"file","tokens":[[name,text,line],…]}` line per file. */
export function parseTokenLines(text: string): Map<string, Token[]> {
  const out = new Map<string, Token[]>();
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  lines.forEach((line, index) => {
    const at = `tokens line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${at}: expected a JSON object`);
    }
    const { file, tokens } = value as { file?: unknown; tokens?: unknown };
    if (typeof file !== "string" || !Array.isArray(tokens)) {
      throw new Error(`${at}: expected {"file": string, "tokens": array}`);
    }
    out.set(
      file,
      tokens.map((token: unknown, i) => {
        if (!Array.isArray(token) || token.length !== 3 || typeof token[0] !== "string" || typeof token[1] !== "string" || !Number.isInteger(token[2])) {
          throw new Error(`${at}: token ${i} of ${file} is not [name, text, line]`);
        }
        return { name: token[0], text: token[1], line: token[2] as number };
      }),
    );
  });
  return out;
}

/** The index of the bracket closing the opener at `open`; throws when it is unbalanced. */
export function matchClose(tokens: readonly Token[], open: number): number {
  const stack: string[] = [];
  for (let i = open; i < tokens.length; i++) {
    const name = tokens[i]!.name;
    const closer = OPENERS[name];
    if (closer !== undefined) {
      stack.push(closer);
    } else if (name === ")" || name === "]" || name === "}") {
      if (stack.pop() !== name) {
        throw new PhpReadError(`unbalanced ${name} on line ${tokens[i]!.line}`);
      }
      if (stack.length === 0) {
        return i;
      }
    }
  }
  throw new PhpReadError(`unclosed ${tokens[open]?.text ?? "bracket"} on line ${tokens[open]?.line ?? 0}`);
}

function nextCode(tokens: readonly Token[], i: number): number {
  let j = i + 1;
  while (j < tokens.length && !isCode(tokens[j]!)) {
    j++;
  }
  return j;
}

function prevCode(tokens: readonly Token[], i: number): number {
  let j = i - 1;
  while (j >= 0 && !isCode(tokens[j]!)) {
    j--;
  }
  return j;
}

// ---------------------------------------------------------------------------
// The file model

function stripLeading(name: string): string {
  return name.startsWith("\\") ? name.slice(1) : name;
}

function lastSegment(name: string): string {
  const parts = name.split("\\");
  return parts[parts.length - 1]!;
}

/** Adds the imports of one `use` statement (the code tokens after `use`, up to `;`). */
function addUse(file: PhpFile, code: readonly Token[]): void {
  let kind: "class" | "function" | "const" = "class";
  let i = 0;
  if (code[0]?.name === "T_FUNCTION") {
    kind = "function";
    i = 1;
  } else if (code[0]?.name === "T_CONST") {
    kind = "const";
    i = 1;
  }
  const add = (itemKind: "class" | "function" | "const", name: string, alias: string): void => {
    const fqn = stripLeading(name);
    if (itemKind === "class") {
      file.classImports.set(alias.toLowerCase(), fqn);
    } else if (itemKind === "function") {
      file.functionImports.set(alias.toLowerCase(), fqn);
    } else {
      file.constImports.set(alias, fqn);
    }
  };
  const bad = (): never => {
    throw new PhpReadError(`${file.path}: unsupported use statement on line ${code[0]?.line ?? 0}`);
  };
  while (i < code.length) {
    const token = code[i]!;
    if (!NAME_TOKENS.has(token.name)) {
      bad();
    }
    const name = token.text;
    i++;
    if (code[i]?.name === "T_NS_SEPARATOR" && code[i + 1]?.name === "{") {
      i += 2;
      while (i < code.length && code[i]!.name !== "}") {
        let itemKind = kind;
        if (code[i]!.name === "T_FUNCTION") {
          itemKind = "function";
          i++;
        } else if (code[i]!.name === "T_CONST") {
          itemKind = "const";
          i++;
        }
        const item = code[i];
        if (item === undefined || !NAME_TOKENS.has(item.name)) {
          bad();
        }
        i++;
        let alias = lastSegment(item!.text);
        if (code[i]?.name === "T_AS") {
          alias = code[i + 1]?.text ?? bad();
          i += 2;
        }
        add(itemKind, `${name}\\${item!.text}`, alias);
        if (code[i]?.name === ",") {
          i++;
        }
      }
      i++;
    } else {
      let alias = lastSegment(name);
      if (code[i]?.name === "T_AS") {
        alias = code[i + 1]?.text ?? bad();
        i += 2;
      }
      add(kind, name, alias);
    }
    if (code[i]?.name === ",") {
      i++;
    } else if (i < code.length) {
      bad();
    }
  }
}

function parseParams(tokens: readonly Token[], open: number, close: number): { params: PhpParam[]; promoted: string[] } {
  const params: PhpParam[] = [];
  const promoted: string[] = [];
  let depth = 0;
  let current: Token[] = [];
  const flush = (): void => {
    const all = current;
    const code = current.filter(isCode);
    current = [];
    if (code.length === 0) {
      return;
    }
    const at = code.findIndex((token) => token.name === "T_VARIABLE");
    if (at < 0) {
      throw new PhpReadError(`a parameter without a variable on line ${code[0]!.line}`);
    }
    const before = code.slice(0, at);
    const name = code[at]!.text.slice(1);
    const hasDefault = code[at + 1]?.name === "=";
    const defaultCode = code.slice(at + 2);
    const defaultTokens = hasDefault ? trimTokens(all.slice(all.indexOf(code[at + 1]!) + 1)) : [];
    params.push({
      name,
      variadic: before.some((token) => token.name === "T_ELLIPSIS"),
      byRef: before.some((token) => token.text === "&"),
      hasDefault,
      defaultSource: hasDefault && decodeLiteral(defaultCode) !== undefined ? defaultTokens.map((token) => token.text).join("") : null,
    });
    if (before.some((token) => MODIFIERS.has(token.name))) {
      promoted.push(name);
    }
  };
  for (let i = open + 1; i < close; i++) {
    const token = tokens[i]!;
    if (OPENERS[token.name] !== undefined) {
      depth++;
    } else if (token.name === ")" || token.name === "]" || token.name === "}") {
      depth--;
    }
    if (depth === 0 && token.name === ",") {
      flush();
    } else {
      current.push(token);
    }
  }
  flush();
  return { params, promoted };
}

/** Parses the members of the class body tokens[open..close] (the braces). */
function parseClass(file: PhpFile, name: string, tokens: readonly Token[], open: number, close: number): PhpClass {
  const cls: PhpClass = { name, fqcn: file.namespace === "" ? name : `${file.namespace}\\${name}`, methods: new Map(), properties: new Set(), scope: file };
  let i = open + 1;
  while (i < close) {
    const token = tokens[i]!;
    if (token.name === "T_FUNCTION") {
      let j = nextCode(tokens, i);
      if (tokens[j]?.text === "&") {
        j = nextCode(tokens, j);
      }
      const methodName = tokens[j]!.text;
      const paren = nextCode(tokens, j);
      if (tokens[paren]?.name !== "(") {
        throw new PhpReadError(`${file.path}: method ${methodName} has no parameter list on line ${tokens[j]!.line}`);
      }
      const parenClose = matchClose(tokens, paren);
      const { params, promoted } = parseParams(tokens, paren, parenClose);
      promoted.forEach((property) => cls.properties.add(property));
      let k = parenClose + 1;
      while (k < close && tokens[k]!.name !== "{" && tokens[k]!.name !== ";") {
        k++;
      }
      let body: Token[] | null = null;
      if (tokens[k]?.name === "{") {
        const end = matchClose(tokens, k);
        body = tokens.slice(k + 1, end);
        i = end + 1;
      } else {
        i = k + 1;
      }
      cls.methods.set(methodName.toLowerCase(), { name: methodName, params, body });
      continue;
    }
    if (token.name === "T_VARIABLE") {
      cls.properties.add(token.text.slice(1));
    } else if (token.name === "T_USE") {
      // A trait use: skip to its `;`, or over its adaptation block.
      let k = i + 1;
      while (k < close && tokens[k]!.name !== ";" && tokens[k]!.name !== "{") {
        k++;
      }
      i = tokens[k]?.name === "{" ? matchClose(tokens, k) + 1 : k + 1;
      continue;
    } else if (OPENERS[token.name] !== undefined) {
      // Property hooks, attribute groups, constant arrays: nothing in them declares a member.
      i = matchClose(tokens, i) + 1;
      continue;
    }
    i++;
  }
  return cls;
}

/**
 * The file model of one tokenised PHP file. Each unbraced `namespace` declaration starts a new scope (namespace and
 * imports); the returned model is the first scope, and its `classes` hold every class of the file, each with its own
 * `scope`. A braced namespace throws.
 */
export function parseFile(path: string, tokens: readonly Token[]): PhpFile {
  const newScope = (namespace: string): PhpFile => ({ path, namespace, classImports: new Map(), functionImports: new Map(), constImports: new Map(), classes: [] });
  const root = newScope("");
  let scope = root;
  let namespaces = 0;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.name === "T_NAMESPACE") {
      const name = nextCode(tokens, i);
      const after = nextCode(tokens, name);
      if (!NAME_TOKENS.has(tokens[name]?.name ?? "") || tokens[after]?.name !== ";") {
        throw new PhpReadError(`${path}: a braced namespace declaration is not supported (line ${token.line})`);
      }
      namespaces++;
      if (namespaces === 1) {
        root.namespace = stripLeading(tokens[name]!.text);
      } else {
        scope = newScope(stripLeading(tokens[name]!.text));
      }
      i = after + 1;
      continue;
    }
    if (token.name === "T_USE") {
      let k = i + 1;
      while (k < tokens.length && tokens[k]!.name !== ";") {
        k++;
      }
      addUse(scope, tokens.slice(i + 1, k).filter(isCode));
      i = k + 1;
      continue;
    }
    if (token.name === "T_CLASS" || token.name === "T_TRAIT" || token.name === "T_INTERFACE" || token.name === "T_ENUM") {
      const prev = tokens[prevCode(tokens, i)];
      if (token.name === "T_CLASS" && (prev?.name === "T_DOUBLE_COLON" || prev?.name === "T_NEW")) {
        i++;
        continue;
      }
      const name = nextCode(tokens, i);
      let open = name;
      while (open < tokens.length && tokens[open]!.name !== "{") {
        open++;
      }
      const close = matchClose(tokens, open);
      if (token.name === "T_CLASS") {
        root.classes.push(parseClass(scope, tokens[name]!.text, tokens, open, close));
      }
      i = close + 1;
      continue;
    }
    if (OPENERS[token.name] !== undefined) {
      i = matchClose(tokens, i) + 1;
      continue;
    }
    i++;
  }
  return root;
}

// ---------------------------------------------------------------------------
// Name resolution

export function resolveClassName(file: PhpFile, token: Token): string {
  const text = token.text;
  if (token.name === "T_NAME_FULLY_QUALIFIED") {
    return text;
  }
  const prefix = file.namespace === "" ? "\\" : `\\${file.namespace}\\`;
  if (token.name === "T_NAME_RELATIVE") {
    return `${prefix}${text.slice("namespace\\".length)}`;
  }
  if (token.name === "T_STRING" && SPECIAL_CLASSES.has(text.toLowerCase())) {
    return text;
  }
  const [first, ...rest] = text.split("\\");
  const imported = file.classImports.get(first!.toLowerCase());
  if (imported !== undefined) {
    return `\\${[imported, ...rest].join("\\")}`;
  }
  return `${prefix}${text}`;
}

function resolveFunctionName(file: PhpFile, token: Token): string {
  if (token.name === "T_STRING") {
    const imported = file.functionImports.get(token.text.toLowerCase());
    return imported === undefined ? token.text : `\\${imported}`;
  }
  return resolveClassName(file, token);
}

function resolveConstName(file: PhpFile, token: Token): string {
  if (token.name === "T_STRING") {
    const imported = file.constImports.get(token.text);
    return imported === undefined ? token.text : `\\${imported}`;
  }
  return resolveClassName(file, token);
}

/** The indexes of the type-hint name tokens in closure and arrow-function signatures and `catch` clauses. */
function typePositions(tokens: readonly Token[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.name === "T_CATCH") {
      // `catch (A | B $e)` or `catch (A)`: every name before the variable or `)` is a class.
      const open = nextCode(tokens, i);
      if (tokens[open]?.name === "(") {
        for (let k = open + 1; k < tokens.length && tokens[k]!.name !== ")" && tokens[k]!.name !== "T_VARIABLE"; k++) {
          if (NAME_TOKENS.has(tokens[k]!.name)) {
            out.add(k);
          }
        }
      }
      continue;
    }
    if (tokens[i]!.name !== "T_FUNCTION" && tokens[i]!.name !== "T_FN") {
      continue;
    }
    let open = nextCode(tokens, i);
    if (tokens[open]?.text === "&") {
      open = nextCode(tokens, open);
    }
    if (tokens[open]?.name !== "(") {
      continue;
    }
    const close = matchClose(tokens, open);
    let depth = 0;
    let inDefault = false;
    for (let k = open + 1; k < close; k++) {
      const token = tokens[k]!;
      if (OPENERS[token.name] !== undefined) {
        depth++;
      } else if (token.name === ")" || token.name === "]" || token.name === "}") {
        depth--;
      } else if (depth === 0 && token.name === ",") {
        inDefault = false;
      } else if (depth === 0 && token.name === "=") {
        inDefault = true;
      } else if (depth === 0 && !inDefault && NAME_TOKENS.has(token.name)) {
        out.add(k);
      }
    }
    let k = nextCode(tokens, close);
    if (tokens[k]?.name === "T_USE") {
      const useOpen = nextCode(tokens, k);
      k = nextCode(tokens, matchClose(tokens, useOpen));
    }
    if (tokens[k]?.name === ":") {
      k = nextCode(tokens, k);
      while (k < tokens.length && tokens[k]!.name !== "{" && tokens[k]!.name !== "T_DOUBLE_ARROW") {
        if (NAME_TOKENS.has(tokens[k]!.name)) {
          out.add(k);
        }
        k++;
      }
    }
  }
  return out;
}

/** The resolved text of each name token in `tokens`, by index; tokens that are not names are absent. */
function resolutions(file: PhpFile, tokens: readonly Token[]): Map<number, string> {
  const out = new Map<number, string>();
  const types = typePositions(tokens);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!NAME_TOKENS.has(token.name)) {
      continue;
    }
    const prev = tokens[prevCode(tokens, i)];
    const next = tokens[nextCode(tokens, i)];
    const prevName = prev?.name ?? "";
    if (prevName === "T_OBJECT_OPERATOR" || prevName === "T_NULLSAFE_OBJECT_OPERATOR" || prevName === "T_DOUBLE_COLON" || prevName === "T_FUNCTION" || prevName === "T_FN" || prevName === "T_CONST" || prevName === "T_GOTO") {
      continue;
    }
    if (types.has(i)) {
      if (!BUILTIN_TYPES.has(token.text.toLowerCase())) {
        out.set(i, resolveClassName(file, token));
      }
    } else if (next?.name === "T_DOUBLE_COLON" || prevName === "T_NEW" || prevName === "T_INSTANCEOF" || prevName === "T_EXTENDS" || prevName === "T_IMPLEMENTS") {
      out.set(i, resolveClassName(file, token));
    } else if (next?.name === "(") {
      out.set(i, resolveFunctionName(file, token));
    } else if (!["true", "false", "null"].includes(token.text.toLowerCase())) {
      out.set(i, resolveConstName(file, token));
    }
  }
  return out;
}

/** `tokens` trimmed of whitespace and comments at both ends. */
export function trimTokens(tokens: readonly Token[]): Token[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && !isCode(tokens[start]!)) {
    start++;
  }
  while (end > start && !isCode(tokens[end - 1]!)) {
    end--;
  }
  return tokens.slice(start, end);
}

/** The verbatim text of `tokens` (trimmed at the ends) with class, imported function and imported const names resolved. */
export function renderSource(file: PhpFile, tokens: readonly Token[]): string {
  const trimmed = trimTokens(tokens);
  const resolved = resolutions(file, trimmed);
  return trimmed.map((token, i) => resolved.get(i) ?? token.text).join("");
}

// ---------------------------------------------------------------------------
// Statements and assertions

export interface Assertion {
  /** The assert name as written. */
  name: string;
  /** Each argument's tokens (trimmed). */
  args: Token[][];
  /** The actual argument's tokens. */
  actual: Token[];
}

export interface Statement {
  /** From the first to the last code token, the `;` included. */
  tokens: Token[];
  /** The code tokens only. */
  code: Token[];
  assertion: Assertion | null;
}

/** Splits the argument list tokens[open..close] (the parentheses) at its top-level commas; trailing comma ignored. */
export function splitArgs(tokens: readonly Token[], open: number, close: number): Token[][] {
  const args: Token[][] = [];
  let depth = 0;
  let current: Token[] = [];
  for (let i = open + 1; i < close; i++) {
    const token = tokens[i]!;
    if (OPENERS[token.name] !== undefined) {
      depth++;
    } else if (token.name === ")" || token.name === "]" || token.name === "}") {
      depth--;
    }
    if (depth === 0 && token.name === ",") {
      args.push(trimTokens(current));
      current = [];
    } else {
      current.push(token);
    }
  }
  const last = trimTokens(current);
  if (last.length > 0) {
    args.push(last);
  }
  return args;
}

/** True when `code` (code tokens) is `$this->assert…(…)` or `static::`/`self::assert…(…)` up to the `;`. */
function assertionHead(code: readonly Token[]): { name: string; open: number } | null {
  const [a, b, c, d] = code;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }
  const head = (a.name === "T_VARIABLE" && a.text === "$this" && b.name === "T_OBJECT_OPERATOR") || ((a.name === "T_STATIC" || (a.name === "T_STRING" && a.text.toLowerCase() === "self")) && b.name === "T_DOUBLE_COLON");
  if (!head || c.name !== "T_STRING" || !c.text.toLowerCase().startsWith("assert") || d.name !== "(") {
    return null;
  }
  return { name: c.text, open: 3 };
}

/**
 * The body's top-level statements, or null when one is not a plain expression statement (a control structure,
 * `return`, `throw`, `echo`, a declaration, inline HTML, a label) or the body does not end with a `;`.
 */
export function statements(body: readonly Token[]): Statement[] | null {
  const out: Statement[] = [];
  let i = 0;
  while (i < body.length) {
    if (!isCode(body[i]!)) {
      i++;
      continue;
    }
    if (body[i]!.name === ";") {
      i++;
      continue;
    }
    const start = i;
    let end = -1;
    for (let k = i; k < body.length; k++) {
      const token = body[k]!;
      if (OPENERS[token.name] !== undefined) {
        k = matchClose(body, k);
        continue;
      }
      if (token.name === ")" || token.name === "]" || token.name === "}") {
        return null;
      }
      if (token.name === ";") {
        end = k;
        break;
      }
    }
    if (end < 0) {
      return null;
    }
    const tokens = body.slice(start, end + 1);
    const code = tokens.filter(isCode);
    const first = code[0]!;
    const second = code[1];
    if (!STATEMENT_STARTS.has(first.name) || (first.name === "T_STATIC" && second?.name !== "T_DOUBLE_COLON") || (first.name === "T_STRING" && second?.name === ":")) {
      return null;
    }
    out.push({ tokens, code, assertion: null });
    i = end + 1;
  }
  for (const statement of out) {
    const head = assertionHead(statement.code);
    if (head === null) {
      continue;
    }
    const open = statement.code.indexOf(statement.code[head.open]!);
    const close = matchClose(statement.code, open);
    const args = splitArgs(statement.code, open, close);
    // Arguments keep their whitespace and comments: re-split on the full token list.
    const fullOpen = statement.tokens.indexOf(statement.code[open]!);
    const fullClose = statement.tokens.indexOf(statement.code[close]!);
    const fullArgs = splitArgs(statement.tokens, fullOpen, fullClose);
    const index = ASSERTIONS.get(head.name.toLowerCase());
    const tail = statement.code.slice(close + 1);
    if (index === undefined || tail.length !== 1 || index >= args.length || fullArgs.length !== args.length) {
      // An unknown assertion, a call chained on the assertion, or a missing actual: marked unreadable below.
      statement.assertion = { name: head.name, args: [], actual: [] };
      continue;
    }
    statement.assertion = { name: head.name, args: fullArgs, actual: fullArgs[index]! };
  }
  return out;
}

/** True when the statement is a well-formed, known assertion. */
export function isKnownAssertion(statement: Statement): boolean {
  return statement.assertion !== null && statement.assertion.actual.length > 0;
}

// ---------------------------------------------------------------------------
// Readability

export interface ReadOptions {
  /** Variables defined before the body runs, with `$` (bindings, or the family's own). */
  defined: readonly string[];
  /** The class, for `$this->x` (a declared property or method); null skips the `$this` check. */
  cls: PhpClass | null;
}

/** True when the tokens hold a named argument (`(` or `,`, an identifier, a single `:`). */
export function hasNamedArgument(code: readonly Token[]): boolean {
  for (let i = 0; i + 2 < code.length; i++) {
    if ((code[i]!.name === "(" || code[i]!.name === ",") && /^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/.test(code[i + 1]!.text) && code[i + 2]!.name === ":") {
      return true;
    }
  }
  return false;
}

/**
 * Why the code tokens are unreadable for an extracted request, or null when they are readable: magic constants,
 * variable variables, anonymous classes, Mockery, named arguments, `self::`/`static::`/`parent::` (the caller
 * passes the code after an assertion head), assertions or `expect*` calls outside a head, and `$this->x` that the
 * class does not declare (outside `function` closure bodies).
 */
export function unreadableReason(file: PhpFile, code: readonly Token[], cls: PhpClass | null): string | null {
  const resolved = resolutions(file, code);
  if (hasNamedArgument(code)) {
    return "a named argument";
  }
  const skip = closureBodies(code);
  for (let i = 0; i < code.length; i++) {
    const token = code[i]!;
    const prev = code[i - 1];
    const next = code[i + 1];
    if (MAGIC_CONSTANTS.has(token.name)) {
      return `the magic constant ${token.text}`;
    }
    if (token.name === "$" || token.name === "T_DOLLAR_OPEN_CURLY_BRACES") {
      return "a variable variable";
    }
    if (token.name === "T_CLASS" && prev?.name !== "T_DOUBLE_COLON") {
      return "an anonymous class";
    }
    if (token.name === "T_INLINE_HTML" || token.name === "T_CLOSE_TAG" || token.name === "T_EVAL" || token.name === "T_INCLUDE" || token.name === "T_INCLUDE_ONCE" || token.name === "T_REQUIRE" || token.name === "T_REQUIRE_ONCE") {
      return `${token.text}`;
    }
    const name = resolved.get(i);
    if (name !== undefined && (name.toLowerCase() === "\\mockery" || name.toLowerCase().startsWith("\\mockery\\"))) {
      return "Mockery";
    }
    if ((token.name === "T_STATIC" || (token.name === "T_STRING" && SPECIAL_CLASSES.has(token.text.toLowerCase()))) && next?.name === "T_DOUBLE_COLON") {
      return `${token.text}::`;
    }
    if (token.name === "T_STRING" && (prev?.name === "T_OBJECT_OPERATOR" || prev?.name === "T_NULLSAFE_OBJECT_OPERATOR" || prev?.name === "T_DOUBLE_COLON")) {
      const member = token.text.toLowerCase();
      if (MOCKERY_METHODS.has(member)) {
        return `Mockery's ${token.text}`;
      }
      if (next?.name === "(" && (member.startsWith("assert") || member.startsWith("expect"))) {
        return `${token.text}() outside an assertion head`;
      }
    }
    if (cls !== null && !skip.has(i) && token.name === "T_VARIABLE" && token.text === "$this" && (next?.name === "T_OBJECT_OPERATOR" || next?.name === "T_NULLSAFE_OBJECT_OPERATOR")) {
      const member = code[i + 2];
      if (member?.name !== "T_STRING") {
        return "a dynamic $this member";
      }
      const isCall = code[i + 3]?.name === "(";
      if (isCall ? !cls.methods.has(member.text.toLowerCase()) : !cls.properties.has(member.text)) {
        return `$this->${member.text} is not declared in ${cls.name}`;
      }
    }
  }
  return null;
}

/** The indexes inside `function (…) use (…) { … }` bodies (where `$this` and variables are the closure's own). */
function closureBodies(code: readonly Token[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < code.length; i++) {
    if (code[i]!.name !== "T_FUNCTION") {
      continue;
    }
    let k = i + 1;
    while (k < code.length && code[k]!.name !== "{") {
      if (code[k]!.name === "(") {
        k = matchClose(code, k);
      }
      k++;
    }
    if (k >= code.length) {
      continue;
    }
    const close = matchClose(code, k);
    for (let j = k; j <= close; j++) {
      out.add(j);
    }
  }
  return out;
}

/**
 * Checks the variables of `code` (one statement) against `defined`, adding the ones it assigns. Returns the first
 * variable used before it is defined, or null. Closure bodies are skipped, but their `use` variables must be
 * defined; arrow-function parameters count as defined for the rest of the statement.
 */
export function checkVariables(code: readonly Token[], defined: Set<string>): string | null {
  const skip = closureBodies(code);
  const local = new Set<string>();
  for (let i = 0; i < code.length; i++) {
    const token = code[i]!;
    if (token.name === "T_FUNCTION" || token.name === "T_FN") {
      let open = i + 1;
      if (code[open]?.text === "&") {
        open++;
      }
      if (code[open]?.name !== "(") {
        continue;
      }
      const close = matchClose(code, open);
      for (let k = open + 1; k < close; k++) {
        if (code[k]!.name === "T_VARIABLE") {
          if (token.name === "T_FN") {
            local.add(code[k]!.text);
          }
          skip.add(k);
        } else if (code[k]!.name === "=") {
          // A default value is a constant expression; skip to the next parameter.
          let depth = 0;
          while (k + 1 < close && !(depth === 0 && code[k + 1]!.name === ",")) {
            k++;
            if (OPENERS[code[k]!.name] !== undefined) depth++;
            else if ([")", "]", "}"].includes(code[k]!.name)) depth--;
          }
        }
      }
      continue;
    }
    if (token.name !== "T_VARIABLE" || skip.has(i)) {
      continue;
    }
    const name = token.text;
    if (name === "$this" || SUPERGLOBALS.has(name) || defined.has(name) || local.has(name)) {
      continue;
    }
    const next = code[i + 1];
    const prev = code[i - 1];
    if (next?.name === "=" && prev?.name !== "T_DOUBLE_COLON") {
      defined.add(name);
      continue;
    }
    // A use, or a compound assignment (`.=`, `??=`, …) of an undefined variable.
    return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Segments

export interface Segment {
  setup: string[];
  exprs: string[];
  /** The statements this segment adds after the previous one (its new setup and its assertions). */
  statements: Statement[];
}

/**
 * True when an assertion's arguments look reversed: the actual argument is only a literal or a bare bindings
 * variable while the expected argument (the first) is neither, as in `assertSame(Str::isUuid($uuid), $passes)`.
 * Its exprs would capture the binding instead of the computation.
 */
export function reversedArguments(assertion: Assertion, bindings: readonly string[]): boolean {
  const index = assertion.args.indexOf(assertion.actual);
  if (index < 1) {
    return false;
  }
  const simple = (arg: readonly Token[]): boolean => {
    const code = arg.filter(isCode);
    return decodeLiteral(code) !== undefined || (code.length === 1 && code[0]!.name === "T_VARIABLE" && bindings.includes(code[0]!.text));
  };
  return simple(assertion.actual) && !simple(assertion.args[0]!);
}

/**
 * A php-expr style reading of a body: every statement readable (no unknown assertion, `expect*`, Mockery, named
 * argument, magic constant, undeclared `$this->x`, `self::`/`static::`/`parent::` outside a head), every variable
 * defined before use. Returns the segments (see Design Notes of the Story 3.1 spec), or null when unreadable.
 */
export function readSegments(file: PhpFile, body: readonly Token[], options: ReadOptions): Segment[] | null {
  const list = statements(body);
  if (list === null) {
    return null;
  }
  const defined = new Set(options.defined);
  for (const statement of list) {
    if (statement.assertion !== null && !isKnownAssertion(statement)) {
      return null;
    }
    const checked = statement.assertion === null ? statement.code : statement.code.slice(3);
    if (unreadableReason(file, checked, options.cls) !== null) {
      return null;
    }
    if (checkVariables(checked, defined) !== null) {
      return null;
    }
    if (statement.assertion !== null && reversedArguments(statement.assertion, options.defined)) {
      return null;
    }
  }
  const segments: Segment[] = [];
  const setup: string[] = [];
  let exprs: string[] = [];
  let pending: Statement[] = [];
  for (const statement of list) {
    if (statement.assertion === null && exprs.length > 0) {
      segments.push({ setup: [...setup], exprs, statements: pending });
      setup.push(...exprs.map((expr) => `${expr};`));
      exprs = [];
      pending = [];
    }
    pending.push(statement);
    if (statement.assertion === null) {
      setup.push(renderSource(file, statement.tokens));
    } else {
      exprs.push(renderSource(file, statement.assertion.actual));
    }
  }
  if (exprs.length > 0) {
    segments.push({ setup: [...setup], exprs, statements: pending });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Literals

const UNREADABLE = Symbol("unreadable");
type Decoded = Json | typeof UNREADABLE;

function decodeEscapes(body: string, quote: '"' | null): string | null {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== "\\" || i + 1 >= body.length) {
      out += ch;
      continue;
    }
    const next = body[i + 1]!;
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", v: "\v", e: "\x1b", f: "\f", "\\": "\\", $: "$" };
    if (next in simple) {
      out += simple[next];
      i++;
    } else if (quote !== null && next === quote) {
      out += quote;
      i++;
    } else if (/[0-7]/.test(next)) {
      const match = /^[0-7]{1,3}/.exec(body.slice(i + 1))![0];
      const code = parseInt(match, 8) & 0xff;
      if (code > 0x7f) {
        return null;
      }
      out += String.fromCharCode(code);
      i += match.length;
    } else if (next === "x" && /^[0-9A-Fa-f]/.test(body.slice(i + 2))) {
      const match = /^[0-9A-Fa-f]{1,2}/.exec(body.slice(i + 2))![0];
      const code = parseInt(match, 16);
      if (code > 0x7f) {
        // A raw byte: the string may not be UTF-8, and JSON holds only text.
        return null;
      }
      out += String.fromCharCode(code);
      i += 1 + match.length;
    } else if (next === "u" && body[i + 2] === "{") {
      const end = body.indexOf("}", i + 3);
      const hex = body.slice(i + 3, end);
      if (end < 0 || !/^[0-9A-Fa-f]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff || (parseInt(hex, 16) >= 0xd800 && parseInt(hex, 16) <= 0xdfff)) {
        return null;
      }
      out += String.fromCodePoint(parseInt(hex, 16));
      i = end;
    } else {
      out += ch;
    }
  }
  return out;
}

/** The value of a T_CONSTANT_ENCAPSED_STRING token, or null (a raw non-UTF-8 byte escape). */
export function stringLiteral(text: string): string | null {
  if (text.startsWith("'")) {
    return text.slice(1, -1).replace(/\\([\\'])/g, "$1");
  }
  if (text.startsWith('"')) {
    return decodeEscapes(text.slice(1, -1), '"');
  }
  return null;
}

/** Decodes one PHP integer literal (decimal, hex, octal, binary, with `_` separators), or null when out of the safe range. */
function intLiteral(text: string): number | null {
  const clean = text.replace(/_/g, "");
  let value: number;
  if (/^0[xX]/.test(clean)) value = parseInt(clean.slice(2), 16);
  else if (/^0[bB]/.test(clean)) value = parseInt(clean.slice(2), 2);
  else if (/^0[oO]/.test(clean)) value = parseInt(clean.slice(2), 8);
  else if (/^0[0-7]+$/.test(clean)) value = parseInt(clean.slice(1), 8);
  else if (/^[0-9]+$/.test(clean)) value = Number(clean);
  else return null;
  return Number.isSafeInteger(value) ? value : null;
}

/** A PHP array key from a decoded scalar: decimal-integer strings become ints, as PHP does. */
function arrayKey(value: Json): string | number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string") {
    return /^(?:0|-?[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;
  }
  return null;
}

class LiteralReader {
  i = 0;
  constructor(readonly code: readonly Token[]) {}

  peek(): Token | undefined {
    return this.code[this.i];
  }

  /** expr := term ('.' term)* */
  expression(): Decoded {
    let value = this.term();
    while (this.peek()?.name === ".") {
      this.i++;
      const right = this.term();
      if (typeof value !== "string" || typeof right !== "string") {
        return UNREADABLE;
      }
      value = value + right;
    }
    return value;
  }

  term(): Decoded {
    const token = this.peek();
    if (token === undefined) {
      return UNREADABLE;
    }
    this.i++;
    if (token.name === "T_CONSTANT_ENCAPSED_STRING") {
      return stringLiteral(token.text) ?? UNREADABLE;
    }
    if (token.name === "T_START_HEREDOC") {
      return this.heredoc(token);
    }
    if (token.name === "-" || token.name === "+") {
      const number = this.peek();
      this.i++;
      const value = number === undefined ? null : number.name === "T_LNUMBER" ? intLiteral(number.text) : number.name === "T_DNUMBER" ? Number(number.text.replace(/_/g, "")) : null;
      if (value === null || !Number.isFinite(value) || (number!.name === "T_DNUMBER" && Number.isInteger(value))) {
        return UNREADABLE;
      }
      return token.name === "-" ? (value === 0 ? 0 : -value) : value;
    }
    if (token.name === "T_LNUMBER") {
      return intLiteral(token.text) ?? UNREADABLE;
    }
    if (token.name === "T_DNUMBER") {
      // An integral float would decode back as an int.
      const value = Number(token.text.replace(/_/g, ""));
      return Number.isFinite(value) && !Number.isInteger(value) ? value : UNREADABLE;
    }
    if (token.name === "T_STRING" || token.name === "T_NAME_FULLY_QUALIFIED") {
      const word = token.text.replace(/^\\/, "").toLowerCase();
      if (word === "true") return true;
      if (word === "false") return false;
      if (word === "null") return null;
      return UNREADABLE;
    }
    if (token.name === "[") {
      return this.array("]");
    }
    if (token.name === "T_ARRAY" && this.peek()?.name === "(") {
      this.i++;
      return this.array(")");
    }
    return UNREADABLE;
  }

  heredoc(start: Token): Decoded {
    const nowdoc = /^<<<\s*'/.test(start.text);
    let body = "";
    for (;;) {
      const token = this.peek();
      if (token === undefined) {
        return UNREADABLE;
      }
      this.i++;
      if (token.name === "T_END_HEREDOC") {
        const indent = /^[ \t]*/.exec(token.text)![0];
        if (body.endsWith("\n")) {
          body = body.slice(0, -1);
        }
        const lines = body.split("\n").map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trim() === "" ? "" : null));
        if (lines.some((line) => line === null)) {
          return UNREADABLE;
        }
        const text = (lines as string[]).join("\n");
        return nowdoc ? text : (decodeEscapes(text, null) ?? UNREADABLE);
      }
      if (token.name !== "T_ENCAPSED_AND_WHITESPACE") {
        // Interpolation.
        return UNREADABLE;
      }
      body += token.text;
    }
  }

  array(end: "]" | ")"): Decoded {
    const entries = new Map<string | number, Json>();
    let nextIndex = 0;
    for (;;) {
      if (this.peek()?.name === end) {
        this.i++;
        break;
      }
      if (this.peek()?.name === "T_ELLIPSIS") {
        return UNREADABLE;
      }
      const first = this.expression();
      if (first === UNREADABLE) {
        return UNREADABLE;
      }
      let key: string | number;
      let value: Json;
      if (this.peek()?.name === "T_DOUBLE_ARROW") {
        this.i++;
        const parsed = arrayKey(first);
        if (parsed === null) {
          return UNREADABLE;
        }
        key = parsed;
        const item = this.expression();
        if (item === UNREADABLE) {
          return UNREADABLE;
        }
        value = item;
      } else {
        key = nextIndex;
        value = first;
      }
      if (typeof key === "number" && key >= nextIndex) {
        nextIndex = key + 1;
      }
      entries.set(key, value);
      const sep = this.peek();
      if (sep?.name === ",") {
        this.i++;
      } else if (sep?.name !== end) {
        return UNREADABLE;
      }
    }
    const keys = [...entries.keys()];
    if (keys.every((key, index) => key === index)) {
      return [...entries.values()];
    }
    if (keys.every((key) => typeof key === "string")) {
      return Object.fromEntries(entries) as JsonObject;
    }
    // Integer keys that are not a list have no JSON form that keeps them.
    return UNREADABLE;
  }
}

/** Decodes code tokens holding exactly one PHP literal expression, or returns undefined when they do not. */
export function decodeLiteral(code: readonly Token[]): Json | undefined {
  const tokens = code.filter(isCode);
  if (tokens.length === 0) {
    return undefined;
  }
  const reader = new LiteralReader(tokens);
  const value = reader.expression();
  return value === UNREADABLE || reader.i !== tokens.length ? undefined : value;
}

/** An empty PHP array decodes as `[]`; as an object-valued input it is `{}`. Null when the value is no object. */
export function asObject(value: Json | undefined): JsonObject | null {
  if (Array.isArray(value) && value.length === 0) {
    return {};
  }
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Dataset rows (lister.php `export()`)

/**
 * Splits a lister.php dataset export (`[k=>v,…]`) into its entries' PHP literal sources, or returns null when the
 * row is not an array or any value is not a literal: an object (`Class{…}`, `Class(…)`), an enum case, a closure,
 * `hex(…)`, `resource(…)`, `*RECURSION*`, or a `{root}` rewrite.
 */
export function splitExport(text: string): { key: string | number; source: string }[] | null {
  let i = 0;
  const fail = (): never => {
    throw UNREADABLE;
  };
  const string = (): void => {
    if (text[i] !== "'") fail();
    i++;
    while (i < text.length && text[i] !== "'") {
      i += text[i] === "\\" ? 2 : 1;
    }
    if (text[i] !== "'") fail();
    i++;
  };
  const scalarString = (): void => {
    // var_export writes a NUL byte as `'' . "\0" . ''`.
    string();
    while (text.startsWith(' . "\\0" . ', i)) {
      i += ' . "\\0" . '.length;
      string();
    }
  };
  const value = (): void => {
    const rest = text.slice(i);
    if (rest.startsWith("'")) {
      scalarString();
      return;
    }
    if (rest.startsWith("[")) {
      i++;
      if (text[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        key();
        if (!text.startsWith("=>", i)) fail();
        i += 2;
        value();
        if (text[i] === ",") {
          i++;
        } else if (text[i] === "]") {
          i++;
          return;
        } else {
          fail();
        }
      }
    }
    const word = /^(?:NULL|true|false|-?INF|NAN|-?[0-9]+(?:\.[0-9]+)?(?:E[+-]?[0-9]+)?)(?=[,\]]|$)/.exec(rest);
    if (word === null) fail();
    i += word![0].length;
  };
  const key = (): void => {
    if (text[i] === "'") {
      string();
      return;
    }
    const match = /^-?[0-9]+/.exec(text.slice(i));
    if (match === null) fail();
    i += match![0].length;
  };
  if (text.includes("{root}") || !text.startsWith("[")) {
    return null;
  }
  const entries: { key: string | number; source: string }[] = [];
  try {
    i = 1;
    if (text === "[]") {
      return [];
    }
    for (;;) {
      const keyStart = i;
      key();
      const rawKey = text.slice(keyStart, i);
      if (!text.startsWith("=>", i)) fail();
      i += 2;
      const valueStart = i;
      value();
      entries.push({ key: rawKey.startsWith("'") ? rawKey.slice(1, -1).replace(/\\([\\'])/g, "$1") : Number(rawKey), source: text.slice(valueStart, i) });
      if (text[i] === ",") {
        i++;
      } else if (text[i] === "]" && i === text.length - 1) {
        return entries;
      } else {
        fail();
      }
    }
  } catch (error) {
    if (error === UNREADABLE) {
      return null;
    }
    throw error;
  }
}

/**
 * The bindings of a dataset row for `params`: positional (keys 0..n-1) or by name (string keys), in parameter order;
 * a parameter the row omits is bound to its default when that is a literal (as PHP passes it), else left unbound.
 * Null when the row is unreadable, has more values than parameters, names an unknown parameter, mixes key kinds, or
 * the method has a variadic parameter.
 */
export function bindingsFor(params: readonly PhpParam[], data: string | null): Record<string, string> | null {
  if (params.some((param) => param.variadic)) {
    return null;
  }
  const entries = data === null ? [] : splitExport(data);
  if (entries === null || entries.length > params.length) {
    return null;
  }
  const byName = new Map<string, string>();
  if (entries.every((entry, index) => entry.key === index)) {
    entries.forEach((entry, index) => byName.set(params[index]!.name, entry.source));
  } else if (entries.every((entry) => typeof entry.key === "string")) {
    for (const entry of entries) {
      if (!params.some((param) => param.name === entry.key)) {
        return null;
      }
      byName.set(entry.key as string, entry.source);
    }
  } else {
    return null;
  }
  const out: Record<string, string> = {};
  for (const param of params) {
    const source = byName.get(param.name) ?? param.defaultSource;
    if (source !== null) {
      out[param.name] = source;
    } else if (!param.hasDefault) {
      return null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Families

/** One Test ID × dataset of a Differential file, as the families see it. */
export interface ExtractTest {
  id: string;
  file: PhpFile;
  cls: PhpClass;
  method: PhpMethod;
  /** The dataset row as PHP literal sources by parameter name; null when the row is unreadable. */
  bindings: Record<string, string> | null;
  /** phpunit.xml.dist's `<ini>` settings. */
  ini: Readonly<Record<string, string>>;
}

/** An extractor module: its kind, its closed Differential file set, and how it reads one test into inputs. */
export interface Family<I> {
  name: string;
  kind: RequestKind;
  /** Test files relative to the framework directory. */
  files: readonly string[];
  /** The inputs of one test, in body order; empty when the body is unreadable for the family. */
  extract(test: ExtractTest): I[];
}
