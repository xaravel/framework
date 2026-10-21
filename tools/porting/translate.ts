// The mechanical PHP → TypeScript expression rule (Story 8.2; FR-8.4, FR-48,
// AD-11, AD-26; PORTING.md § Mechanical expression rule documents the rule
// table, the untranslatable list and Blade mode; docs/ops/porting.md the CLI).
//
//   bun tools/porting/translate.ts translate [--blade] <php>
//       (`bun run porting:translate [--blade] <php>`) prints the TypeScript
//       form of one PHP expression. With `--blade` the input is a whole Blade
//       template: the expressions inside `{{ }}`, `{{{ }}}`, `{!! !!}` and
//       directive parentheses are translated, everything else is copied byte
//       for byte.
//
// The rule is syntax-directed: it reads only the PHP tokens (the lexer is
// `tokenize` from tools/scans/php.ts) and never type information. A
// type-dependent rewrite (an awaited IO call, `related()`, `.get(k)`) is an
// adaptation under a DIV clause, applied after this rule. Anything outside
// the rule table throws `UntranslatableExpression`, whose message names the
// construct, so a translation is either the rule's output or a failure,
// never a guess. Arithmetic, bitwise and `< > <= >=` operators are kept
// unchanged, so the rule also refuses the operands it can see break that:
// a string literal, interpolation, concatenation or `(string)` cast under an
// arithmetic or bitwise operator, a float literal under `%`, a string
// compared with a number, boolean or null literal, and two numeric string
// literals compared (`refuseOperands`).
//
// Exit codes: 0 printed, 1 untranslatable or any failure, 2 usage error.
import { ScanError, tokenize, type Token } from "../scans/php";

/** A PHP construct the mechanical rule has no form for. `construct` names it. */
export class UntranslatableExpression extends Error {
  readonly construct: string;
  constructor(construct: string, detail = "") {
    super(`${construct}${detail === "" ? "" : `: ${detail}`} (no mechanical form; see PORTING.md § Mechanical expression rule)`);
    this.name = "UntranslatableExpression";
    this.construct = construct;
  }
}

export interface TranslateOptions {
  /** Blade mode: variables keep their `$` (AD-11). */
  blade?: boolean;
}

// ---------------------------------------------------------------------------
// AST

type Node =
  | { t: "var"; name: string }
  | { t: "this" }
  | { t: "name"; name: string }
  | { t: "num"; code: string; int: number | null }
  | { t: "str"; value: string }
  | { t: "interp"; parts: (string | Node)[] }
  | { t: "bool"; value: boolean }
  | { t: "null" }
  | { t: "magicDir" }
  | { t: "array"; items: ArrayItem[] }
  | { t: "prop"; obj: Node; name: string; nullsafe: boolean }
  | { t: "static"; cls: Node; member: string; kind: "const" | "prop" }
  | { t: "classRef"; cls: string }
  | { t: "index"; obj: Node; key: Node }
  | { t: "call"; callee: Node; args: Arg[] }
  | { t: "callable"; callee: Node }
  | { t: "new"; cls: Node; args: Arg[] }
  | { t: "unary"; op: string; operand: Node }
  | { t: "not"; operand: Node }
  | { t: "cast"; fn: string; operand: Node }
  | { t: "binary"; op: string; left: Node; right: Node }
  | { t: "concat"; operands: Node[] }
  | { t: "logical"; op: "&&" | "||"; left: Node; right: Node }
  | { t: "ternary"; cond: Node; then: Node; else: Node }
  | { t: "short"; cond: Node; else: Node }
  | { t: "isset"; items: Node[] }
  | { t: "empty"; operand: Node }
  | { t: "instanceof"; left: Node; right: Node }
  | { t: "assign"; target: Node; value: Node }
  | { t: "arrow"; params: string[]; body: Node };

interface ArrayItem {
  key: Node | null;
  value: Node;
  spread: boolean;
}

interface Arg {
  name: string | null;
  value: Node;
  spread: boolean;
}

// ---------------------------------------------------------------------------
// Parser

const CASTS: Readonly<Record<string, string>> = { int: "toInt", integer: "toInt", float: "toFloat", double: "toFloat", string: "toPhpString", binary: "toPhpString", bool: "toBool", boolean: "toBool" };
const BAD_CASTS: ReadonlySet<string> = new Set(["array", "object", "unset", "real"]);
const MAGIC: ReadonlySet<string> = new Set(["__file__", "__line__", "__class__", "__function__", "__method__", "__namespace__", "__trait__", "__property__", "__compiler_halt_offset__"]);
const STATEMENTS: ReadonlySet<string> = new Set([
  "if", "else", "elseif", "foreach", "for", "while", "do", "switch", "return", "break", "continue", "try", "catch", "finally", "goto", "declare", "namespace", "use", "class", "interface", "trait", "enum", "abstract", "final", "global", "unset", "const", "endif", "endforeach", "endfor", "endwhile", "endswitch",
]);
const RESERVED: ReadonlySet<string> = new Set([
  "arguments", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "eval", "export", "extends", "false", "finally", "for", "function", "if", "implements", "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected", "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield",
]);

// PHP binding powers, lowest first (PHP 8 operator precedence).
const BP_ASSIGN = 1;
const BP_TERNARY = 2;
const BP_COALESCE = 3;
const BP_OR = 4;
const BP_AND = 5;
const BP_BOR = 6;
const BP_BXOR = 7;
const BP_BAND = 8;
const BP_EQUALITY = 9;
const BP_RELATIONAL = 10;
const BP_CONCAT = 11;
const BP_SHIFT = 12;
const BP_ADDITIVE = 13;
const BP_MULTIPLICATIVE = 14;
const BP_NOT = 15;
const BP_INSTANCEOF = 16;
const BP_UNARY = 17;
const BP_POW = 18;

const INFIX: Readonly<Record<string, number>> = {
  "??": BP_COALESCE,
  "||": BP_OR,
  "&&": BP_AND,
  "|": BP_BOR,
  "^": BP_BXOR,
  "&": BP_BAND,
  "==": BP_EQUALITY,
  "!=": BP_EQUALITY,
  "<>": BP_EQUALITY,
  "===": BP_EQUALITY,
  "!==": BP_EQUALITY,
  "<=>": BP_EQUALITY,
  "<": BP_RELATIONAL,
  ">": BP_RELATIONAL,
  "<=": BP_RELATIONAL,
  ">=": BP_RELATIONAL,
  ".": BP_CONCAT,
  "<<": BP_SHIFT,
  ">>": BP_SHIFT,
  "+": BP_ADDITIVE,
  "-": BP_ADDITIVE,
  "*": BP_MULTIPLICATIVE,
  "/": BP_MULTIPLICATIVE,
  "%": BP_MULTIPLICATIVE,
  "**": BP_POW,
};

/** The last segment of a possibly qualified PHP name (`\A\B\C` → `C`). */
function shortName(name: string): string {
  const cut = name.lastIndexOf("\\");
  return cut === -1 ? name : name.slice(cut + 1);
}

/** PHP's integer-like string key rule: decimal, no leading zero or plus, in range. */
function integerLike(value: string): number | null {
  if (!/^(0|-?[1-9][0-9]*)$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

const DOUBLE_ESCAPES: Readonly<Record<string, number>> = { n: 10, t: 9, r: 13, v: 11, e: 27, f: 12, "\\": 92, $: 36, '"': 34 };

/** Collects the bytes of a PHP string literal and decodes them as UTF-8, failing closed on invalid bytes. */
class ByteBuilder {
  private readonly bytes: number[] = [];
  private static readonly encoder = new TextEncoder();
  text(s: string): void {
    for (const b of ByteBuilder.encoder.encode(s)) {
      this.bytes.push(b);
    }
  }
  byte(b: number): void {
    this.bytes.push(b & 0xff);
  }
  get empty(): boolean {
    return this.bytes.length === 0;
  }
  take(): string {
    const out = this.bytes.splice(0);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(out));
    } catch {
      throw new UntranslatableExpression("non-UTF-8 string literal");
    }
  }
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  /** Parenthesised nodes, for the nested-ternary rule. */
  private readonly grouped = new Set<Node>();

  constructor(
    source: string,
    private readonly blade: boolean,
    /** Lower-cased short class name → lower-cased FQCN, shared with nested interpolation parsers. */
    private readonly shortNames = new Map<string, string>(),
  ) {
    let raw: Token[];
    try {
      raw = tokenize(`<?php ${source}`, "expression");
    } catch (error) {
      throw new UntranslatableExpression("syntax error", error instanceof ScanError ? error.message : String(error));
    }
    for (const token of raw) {
      if (token.kind === "inline") {
        throw new UntranslatableExpression("statement", "`?>` closes the PHP expression");
      }
      if (token.kind === "attribute") {
        throw new UntranslatableExpression("attribute", token.text);
      }
    }
    this.tokens = raw.filter((token) => token.kind !== "comment" && token.kind !== "docblock");
  }

  /** The short name of `name`, failing when the input already resolved that short name to another FQCN. */
  private short(name: string): string {
    const result = shortName(name);
    const fqcn = name.replace(/^\\/, "");
    if (fqcn.includes("\\")) {
      const key = result.toLowerCase();
      const seen = this.shortNames.get(key);
      if (seen !== undefined && seen !== fqcn.toLowerCase()) {
        throw new UntranslatableExpression("short class name collision", `${seen} and ${fqcn} both become ${result}`);
      }
      this.shortNames.set(key, fqcn.toLowerCase());
    }
    return result;
  }

  private peek(offset = 0): Token | null {
    return this.tokens[this.pos + offset] ?? null;
  }

  private isPunct(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== null && token.kind === "punct" && token.text === text;
  }

  private isKeyword(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== null && token.kind === "name" && token.text.toLowerCase() === word;
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (token === undefined) {
      throw new UntranslatableExpression("syntax error", "unexpected end of expression");
    }
    this.pos++;
    return token;
  }

  private expect(text: string): void {
    const token = this.next();
    if (token.kind !== "punct" || token.text !== text) {
      throw new UntranslatableExpression("syntax error", `expected \`${text}\`, got \`${token.text}\``);
    }
  }

  parseWhole(): Node {
    if (this.tokens.length === 0) {
      throw new UntranslatableExpression("syntax error", "empty expression");
    }
    const node = this.expression(0);
    const rest = this.peek();
    if (rest !== null) {
      if (rest.kind === "punct" && rest.text === ";") {
        throw new UntranslatableExpression("statement", "a `;` ends a statement, not an expression");
      }
      throw new UntranslatableExpression("syntax error", `unexpected \`${rest.text}\``);
    }
    return node;
  }

  private expression(minBp: number): Node {
    let left = this.prefix();
    for (;;) {
      const token = this.peek();
      if (token === null) {
        return left;
      }
      if (token.kind === "name") {
        const word = token.text.toLowerCase();
        if (word === "instanceof" && BP_INSTANCEOF >= minBp) {
          this.next();
          const target = this.next();
          if (target.kind !== "name") {
            throw new UntranslatableExpression("instanceof", "the right-hand side is not a class name");
          }
          this.relativeClass(target.text);
          left = { t: "instanceof", left, right: { t: "name", name: this.short(target.text) } };
          continue;
        }
        if (word === "and" || word === "or" || word === "xor") {
          throw new UntranslatableExpression(word);
        }
        return left;
      }
      if (token.kind !== "punct") {
        return left;
      }
      const op = token.text;
      if (op === "=" && BP_ASSIGN >= minBp) {
        if (left.t === "array") {
          throw new UntranslatableExpression("destructuring");
        }
        if (!["var", "prop", "index", "static"].includes(left.t)) {
          throw new UntranslatableExpression("assignment", "the target is not a variable, property or element");
        }
        if (left.t === "index" && left.key.t === "null") {
          throw new UntranslatableExpression("array append `[]=`");
        }
        this.next();
        if (this.isPunct("&")) {
          throw new UntranslatableExpression("assignment by reference `=&`");
        }
        left = { t: "assign", target: left, value: this.expression(BP_ASSIGN) };
        continue;
      }
      if (/^(?:[-+*/.%&|^]|\*\*|<<|>>|\?\?)=$/.test(op)) {
        throw new UntranslatableExpression(`compound assignment \`${op}\``);
      }
      if (op === "++" || op === "--") {
        throw new UntranslatableExpression(`increment/decrement \`${op}\``);
      }
      if (op === "?" && BP_TERNARY >= minBp) {
        if ((left.t === "ternary" || left.t === "short") && !this.grouped.has(left) && !(left.t === "short" && this.isPunct(":", 1))) {
          throw new UntranslatableExpression("nested ternary without parentheses");
        }
        this.next();
        if (this.isPunct(":")) {
          this.next();
          if (!(left.t === "var" || left.t === "num" || left.t === "str" || left.t === "bool" || left.t === "null")) {
            throw new UntranslatableExpression("`?:` on an operand that is not a variable or literal");
          }
          left = { t: "short", cond: left, else: this.expression(BP_TERNARY + 1) };
          continue;
        }
        const then = this.expression(BP_ASSIGN);
        this.expect(":");
        left = { t: "ternary", cond: left, then, else: this.expression(BP_TERNARY + 1) };
        continue;
      }
      const bp = INFIX[op];
      if (bp === undefined || bp < minBp) {
        return left;
      }
      this.next();
      const rightAssoc = op === "**" || op === "??";
      const right = this.expression(rightAssoc ? bp : bp + 1);
      if (op === ".") {
        left = { t: "concat", operands: [...(left.t === "concat" ? left.operands : [left]), ...(right.t === "concat" ? right.operands : [right])] };
      } else if (op === "&&" || op === "||") {
        left = { t: "logical", op, left, right };
      } else {
        left = { t: "binary", op, left, right };
      }
    }
  }

  /** Throws for `static`, `self` and `parent` used as a class. */
  private relativeClass(name: string): void {
    const lower = name.toLowerCase();
    if (lower === "static" || lower === "self" || lower === "parent") {
      throw new UntranslatableExpression(`${lower}::`);
    }
  }

  private prefix(): Node {
    const token = this.next();
    switch (token.kind) {
      case "variable":
        return this.postfix(this.variable(token.text));
      case "number":
        return this.postfix(number(token.text));
      case "string":
        return this.postfix(this.stringLiteral(token));
      case "punct":
        return this.prefixPunct(token);
      case "name":
        return this.prefixName(token);
      default:
        throw new UntranslatableExpression("syntax error", `unexpected \`${token.text}\``);
    }
  }

  private variable(text: string): Node {
    const name = text.slice(1);
    if (name === "this") {
      return { t: "this" };
    }
    if (!this.blade && RESERVED.has(name)) {
      throw new UntranslatableExpression("variable named a reserved word", text);
    }
    return { t: "var", name };
  }

  private prefixPunct(token: Token): Node {
    const op = token.text;
    if (op === "(") {
      const word = this.peek();
      if (word !== null && word.kind === "name" && this.isPunct(")", 1)) {
        const lower = word.text.toLowerCase();
        if (lower in CASTS) {
          this.pos += 2;
          return { t: "cast", fn: CASTS[lower]!, operand: this.expression(BP_UNARY) };
        }
        if (BAD_CASTS.has(lower)) {
          throw new UntranslatableExpression(`(${lower})`);
        }
      }
      const inner = this.expression(0);
      this.expect(")");
      this.grouped.add(inner);
      return this.postfix(inner);
    }
    if (op === "[") {
      return this.postfix(this.arrayLiteral("]"));
    }
    if (op === "!") {
      return { t: "not", operand: this.expression(BP_NOT) };
    }
    if (op === "-" || op === "+" || op === "~") {
      return { t: "unary", op, operand: this.expression(BP_UNARY) };
    }
    if (op === "@") {
      throw new UntranslatableExpression("@");
    }
    if (op === "&") {
      throw new UntranslatableExpression("reference `&`");
    }
    if (op === "++" || op === "--") {
      throw new UntranslatableExpression(`increment/decrement \`${op}\``);
    }
    throw new UntranslatableExpression("syntax error", `unexpected \`${op}\``);
  }

  private prefixName(token: Token): Node {
    const text = token.text;
    const lower = text.toLowerCase();
    if (lower === "true" || lower === "false") {
      return this.postfix({ t: "bool", value: lower === "true" });
    }
    if (lower === "null") {
      return this.postfix({ t: "null" });
    }
    if (lower === "__dir__") {
      return this.postfix({ t: "magicDir" });
    }
    if (MAGIC.has(lower)) {
      throw new UntranslatableExpression(text);
    }
    switch (lower) {
      case "match":
      case "throw":
      case "print":
      case "echo":
      case "exit":
      case "die":
      case "clone":
      case "yield":
      case "include":
      case "include_once":
      case "require":
      case "require_once":
      case "eval":
        throw new UntranslatableExpression(lower);
      case "list":
        throw new UntranslatableExpression("list()");
      case "static":
      case "self":
      case "parent":
        if (this.isPunct("::")) {
          throw new UntranslatableExpression(`${lower}::`);
        }
        throw new UntranslatableExpression(lower);
      case "new":
        return this.postfix(this.newExpression());
      case "fn":
        return this.arrowFunction();
      case "function":
        return this.closure();
      case "isset":
        return this.isset();
      case "empty": {
        this.expect("(");
        const operand = this.expression(0);
        this.expect(")");
        return { t: "empty", operand };
      }
      case "array":
        if (this.isPunct("(")) {
          this.next();
          return this.postfix(this.arrayLiteral(")"));
        }
        break;
      default:
        if (STATEMENTS.has(lower)) {
          throw new UntranslatableExpression("statement", `\`${text}\``);
        }
    }
    if (this.isPunct("::")) {
      return this.postfix(this.staticAccess(text));
    }
    return this.postfix({ t: "name", name: this.short(text) });
  }

  /** `C::member` after the class name; `C` has been consumed. */
  private staticAccess(cls: string): Node {
    this.relativeClass(cls);
    this.expect("::");
    const member = this.next();
    if (member.kind === "name" && member.text.toLowerCase() === "class") {
      return { t: "classRef", cls: this.short(cls) };
    }
    const target: Node = { t: "name", name: this.short(cls) };
    if (member.kind === "variable") {
      return { t: "static", cls: target, member: member.text.slice(1), kind: "prop" };
    }
    if (member.kind !== "name") {
      throw new UntranslatableExpression("dynamic static member", `\`${member.text}\``);
    }
    return { t: "static", cls: target, member: member.text, kind: "const" };
  }

  private postfix(node: Node): Node {
    let current = node;
    for (;;) {
      if (this.isPunct("->") || this.isPunct("?->")) {
        const nullsafe = this.next().text === "?->";
        const member = this.next();
        if (member.kind !== "name") {
          throw new UntranslatableExpression("dynamic member access", `\`->${member.text}\``);
        }
        current = { t: "prop", obj: current, name: member.text, nullsafe };
        continue;
      }
      if (this.isPunct("::")) {
        if (current.t === "name") {
          throw new UntranslatableExpression("syntax error", "unexpected `::`");
        }
        this.next();
        const member = this.next();
        if (member.kind === "name" && member.text.toLowerCase() === "class") {
          throw new UntranslatableExpression("`::class` on an expression");
        }
        if (member.kind === "variable") {
          current = { t: "static", cls: current, member: member.text.slice(1), kind: "prop" };
        } else if (member.kind === "name") {
          current = { t: "static", cls: current, member: member.text, kind: "const" };
        } else {
          throw new UntranslatableExpression("dynamic static member", `\`${member.text}\``);
        }
        continue;
      }
      if (this.isPunct("[")) {
        this.next();
        if (this.isPunct("]")) {
          this.next();
          current = { t: "index", obj: current, key: { t: "null" } };
          if (!this.isPunct("=")) {
            throw new UntranslatableExpression("array append `[]`");
          }
          continue;
        }
        const key = this.expression(0);
        this.expect("]");
        current = { t: "index", obj: current, key };
        continue;
      }
      if (this.isPunct("{")) {
        throw new UntranslatableExpression("curly-brace offset `{}`");
      }
      if (this.isPunct("(")) {
        this.next();
        if (this.isPunct("...") && this.isPunct(")", 1)) {
          this.pos += 2;
          current = { t: "callable", callee: current };
          continue;
        }
        current = { t: "call", callee: current, args: this.argumentList() };
        continue;
      }
      return current;
    }
  }

  /** Arguments after `(`, through `)`. */
  private argumentList(): Arg[] {
    const args: Arg[] = [];
    let named = false;
    while (!this.isPunct(")")) {
      const token = this.peek();
      if (token !== null && token.kind === "name" && this.isPunct(":", 1)) {
        this.pos += 2;
        named = true;
        args.push({ name: token.text, value: this.expression(BP_ASSIGN), spread: false });
      } else {
        const spread = this.isPunct("...");
        if (spread) {
          this.next();
        }
        if (named) {
          throw new UntranslatableExpression("positional argument after a named argument");
        }
        args.push({ name: null, value: this.expression(BP_ASSIGN), spread });
      }
      if (!this.isPunct(",")) {
        break;
      }
      this.next();
    }
    this.expect(")");
    return args;
  }

  /** Array items after `[` or `array(`, through `close`. */
  private arrayLiteral(close: string): Node {
    const items: ArrayItem[] = [];
    while (!this.isPunct(close)) {
      if (this.isPunct(",")) {
        throw new UntranslatableExpression("destructuring", "an array with an empty slot");
      }
      if (this.isPunct("...")) {
        this.next();
        items.push({ key: null, value: this.expression(BP_ASSIGN), spread: true });
      } else {
        if (this.isPunct("&")) {
          throw new UntranslatableExpression("reference `&`", "a by-reference array element");
        }
        const first = this.expression(BP_ASSIGN);
        if (this.isPunct("=>")) {
          this.next();
          if (this.isPunct("&")) {
            throw new UntranslatableExpression("reference `&`", "a by-reference array element");
          }
          items.push({ key: first, value: this.expression(BP_ASSIGN), spread: false });
        } else {
          items.push({ key: null, value: first, spread: false });
        }
      }
      if (!this.isPunct(",")) {
        break;
      }
      this.next();
    }
    this.expect(close);
    return { t: "array", items };
  }

  private newExpression(): Node {
    const token = this.next();
    let cls: Node;
    if (token.kind === "name") {
      const lower = token.text.toLowerCase();
      if (lower === "class") {
        throw new UntranslatableExpression("new class");
      }
      this.relativeClass(token.text);
      cls = { t: "name", name: this.short(token.text) };
    } else if (token.kind === "variable") {
      cls = this.variable(token.text);
      if (this.isPunct("->") || this.isPunct("?->") || this.isPunct("[") || this.isPunct("::")) {
        throw new UntranslatableExpression("new", "the class is a dynamic expression");
      }
    } else {
      throw new UntranslatableExpression("new", "the class is neither a name nor a variable");
    }
    if (this.isPunct("(")) {
      this.next();
      return { t: "new", cls, args: this.argumentList() };
    }
    return { t: "new", cls, args: [] };
  }

  /** A parameter list after `(`, through `)`, with types dropped. */
  private parameters(): string[] {
    const params: string[] = [];
    while (!this.isPunct(")")) {
      // Types: names, `?`, `|`, `&` between type names, `(`/`)` of DNF types.
      while (this.peek() !== null && this.peek()!.kind !== "variable" && !this.isPunct("...") && !this.isPunct(")")) {
        const token = this.next();
        if (token.kind === "punct" && token.text === "&" && this.peek()?.kind === "variable") {
          throw new UntranslatableExpression("by-reference parameter", "use Ref<T> (PORTING.md § By-reference parameters)");
        }
        if (token.kind === "punct" && token.text === "&" && this.isPunct("...")) {
          throw new UntranslatableExpression("by-reference parameter", "use Ref<T> (PORTING.md § By-reference parameters)");
        }
      }
      let prefix = "";
      if (this.isPunct("...")) {
        this.next();
        prefix = "...";
      }
      const variable = this.next();
      if (variable.kind !== "variable") {
        throw new UntranslatableExpression("syntax error", `expected a parameter, got \`${variable.text}\``);
      }
      const name = this.blade ? variable.text : variable.text.slice(1);
      if (!this.blade && RESERVED.has(name)) {
        throw new UntranslatableExpression("variable named a reserved word", variable.text);
      }
      if (this.isPunct("=")) {
        this.next();
        params.push(`${prefix}${name} = ${emit(this.expression(BP_ASSIGN), this.blade).code}`);
      } else {
        params.push(`${prefix}${name}`);
      }
      if (!this.isPunct(",")) {
        break;
      }
      this.next();
    }
    this.expect(")");
    return params;
  }

  /** Skips a `: ReturnType` after a parameter list. */
  private returnType(stop: string): void {
    if (!this.isPunct(":")) {
      return;
    }
    this.next();
    while (this.peek() !== null && !this.isPunct(stop)) {
      this.next();
    }
  }

  private arrowFunction(): Node {
    if (this.isPunct("&")) {
      throw new UntranslatableExpression("by-reference return `fn &`");
    }
    this.expect("(");
    const params = this.parameters();
    this.returnType("=>");
    this.expect("=>");
    return { t: "arrow", params, body: this.expression(BP_ASSIGN) };
  }

  private closure(): Node {
    if (this.isPunct("&")) {
      throw new UntranslatableExpression("by-reference return `function &`");
    }
    if (this.peek()?.kind === "name") {
      throw new UntranslatableExpression("statement", "a named function declaration");
    }
    this.expect("(");
    const params = this.parameters();
    if (this.isKeyword("use")) {
      this.next();
      this.expect("(");
      while (!this.isPunct(")")) {
        if (this.next().text === "&") {
          throw new UntranslatableExpression("by-reference parameter", "a `use (&$x)` capture");
        }
      }
      this.expect(")");
    }
    this.returnType("{");
    this.expect("{");
    if (!this.isKeyword("return")) {
      throw new UntranslatableExpression("function body", "a `function` closure whose body is not one `return`");
    }
    this.next();
    if (this.isPunct(";")) {
      throw new UntranslatableExpression("function body", "a bare `return;`");
    }
    const body = this.expression(0);
    this.expect(";");
    if (!this.isPunct("}")) {
      throw new UntranslatableExpression("function body", "a `function` closure whose body is not one `return`");
    }
    this.next();
    return this.postfix({ t: "arrow", params, body });
  }

  private isset(): Node {
    this.expect("(");
    const items: Node[] = [];
    while (!this.isPunct(")")) {
      items.push(this.expression(BP_ASSIGN));
      if (!this.isPunct(",")) {
        break;
      }
      this.next();
    }
    this.expect(")");
    if (items.length === 0) {
      throw new UntranslatableExpression("syntax error", "isset() needs an argument");
    }
    return { t: "isset", items };
  }

  private stringLiteral(token: Token): Node {
    const text = token.text;
    if (text.startsWith("`")) {
      throw new UntranslatableExpression("`", "shell execution");
    }
    if (text.startsWith("<<<")) {
      if (token.value === null || token.value === undefined) {
        throw new UntranslatableExpression("heredoc with interpolation");
      }
      return { t: "str", value: token.value };
    }
    if (text.startsWith("'")) {
      return { t: "str", value: token.value ?? "" };
    }
    return this.doubleQuoted(text.slice(1, -1));
  }

  /** A double-quoted body, re-scanned from the token text (escapes and interpolation). */
  private doubleQuoted(body: string): Node {
    const parts: (string | Node)[] = [];
    const bytes = new ByteBuilder();
    const flush = (): void => {
      if (!bytes.empty) {
        parts.push(bytes.take());
      }
    };
    const identStart = /[A-Za-z_\u0080-￿]/;
    const ident = /^[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*/;
    let i = 0;
    while (i < body.length) {
      const c = body[i]!;
      if (c === "\\" && i + 1 < body.length) {
        const n = body[i + 1]!;
        if (n in DOUBLE_ESCAPES) {
          bytes.byte(DOUBLE_ESCAPES[n]!);
          i += 2;
          continue;
        }
        const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1));
        if (octal !== null) {
          bytes.byte(parseInt(octal[0], 8));
          i += 1 + octal[0].length;
          continue;
        }
        const hex = /^x([0-9A-Fa-f]{1,2})/.exec(body.slice(i + 1));
        if (hex !== null) {
          bytes.byte(parseInt(hex[1]!, 16));
          i += 1 + hex[0].length;
          continue;
        }
        const unicode = /^u\{([0-9A-Fa-f]+)\}/.exec(body.slice(i + 1));
        if (unicode !== null) {
          const point = parseInt(unicode[1]!, 16);
          if (point > 0x10ffff) {
            throw new UntranslatableExpression("syntax error", `\\u{${unicode[1]}} is out of range`);
          }
          bytes.text(String.fromCodePoint(point));
          i += 1 + unicode[0].length;
          continue;
        }
        if (n === "{" && body[i + 2] === "$") {
          throw new UntranslatableExpression("`\\{$` in a double-quoted string");
        }
        bytes.text("\\");
        i++;
        continue;
      }
      if (c === "$" && body[i + 1] === "{") {
        throw new UntranslatableExpression("`${}` interpolation");
      }
      if (c === "{" && body[i + 1] === "$") {
        const end = embeddedEnd(body, i);
        flush();
        parts.push(new Parser(body.slice(i + 1, end - 1), this.blade, this.shortNames).parseWhole());
        i = end;
        continue;
      }
      if (c === "$" && identStart.test(body[i + 1] ?? "")) {
        const name = ident.exec(body.slice(i + 1))![0];
        flush();
        let node = this.variable(`$${name}`);
        i += 1 + name.length;
        if (body[i] === "[") {
          const simple = /^\[(?:(0|-?[1-9][0-9]*)|([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)|\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*))\]/.exec(body.slice(i));
          if (simple === null) {
            throw new UntranslatableExpression("interpolated offset", "only `[n]`, `[name]` and `[$var]` are simple syntax");
          }
          const key: Node = simple[1] !== undefined ? number(simple[1]) : simple[2] !== undefined ? { t: "str", value: simple[2] } : this.variable(`$${simple[3]}`);
          node = { t: "index", obj: node, key };
          i += simple[0].length;
        } else if (body.startsWith("->", i) && identStart.test(body[i + 2] ?? "")) {
          const prop = ident.exec(body.slice(i + 2))![0];
          node = { t: "prop", obj: node, name: prop, nullsafe: false };
          i += 2 + prop.length;
        } else if (body.startsWith("?->", i) && identStart.test(body[i + 3] ?? "")) {
          const prop = ident.exec(body.slice(i + 3))![0];
          node = { t: "prop", obj: node, name: prop, nullsafe: true };
          i += 3 + prop.length;
        }
        parts.push(node);
        continue;
      }
      bytes.text(c);
      i++;
    }
    flush();
    if (parts.every((part) => typeof part === "string")) {
      return { t: "str", value: parts.join("") };
    }
    return { t: "interp", parts };
  }
}

/** The end (exclusive) of a `{$…}` interpolation starting at `start`, aware of nested braces and quotes. */
function embeddedEnd(body: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < body.length) {
    const c = body[i]!;
    if (c === "'" || c === '"') {
      i++;
      while (i < body.length && body[i] !== c) {
        i += body[i] === "\\" ? 2 : 1;
      }
      i++;
      continue;
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  throw new UntranslatableExpression("syntax error", "unterminated `{$` interpolation");
}

/** A PHP number literal. */
function number(text: string): Node {
  const plain = text.replace(/_/g, "");
  if (/^0[xXbBoO]/.test(plain)) {
    const value = Number(plain);
    if (!Number.isSafeInteger(value)) {
      throw new UntranslatableExpression("integer literal beyond Number.MAX_SAFE_INTEGER", text);
    }
    return { t: "num", code: text, int: value };
  }
  if (/^0[0-7]+$/.test(plain)) {
    const value = parseInt(plain, 8);
    if (!Number.isSafeInteger(value)) {
      throw new UntranslatableExpression("integer literal beyond Number.MAX_SAFE_INTEGER", text);
    }
    return { t: "num", code: `0o${plain.slice(1)}`, int: value };
  }
  if (/[.eE]/.test(plain)) {
    const value = Number(plain);
    if (Number.isInteger(value)) {
      return { t: "num", code: `float(${String(value)})`, int: null };
    }
    return { t: "num", code: text, int: null };
  }
  const value = Number(plain);
  if (!Number.isSafeInteger(value)) {
    throw new UntranslatableExpression("integer literal beyond Number.MAX_SAFE_INTEGER", text);
  }
  return { t: "num", code: text, int: value };
}

// ---------------------------------------------------------------------------
// Emitter

// JavaScript precedence levels of the emitted code.
const P_ASSIGN = 2;
const P_COND = 3;
const P_OR = 4;
const P_AND = 5;
const P_BOR = 6;
const P_BXOR = 7;
const P_BAND = 8;
const P_EQ = 9;
const P_REL = 10;
const P_SHIFT = 11;
const P_ADD = 12;
const P_MUL = 13;
const P_EXP = 14;
const P_UNARY = 15;
const P_PRIMARY = 20;

const JS_BINARY: Readonly<Record<string, number>> = {
  "|": P_BOR,
  "^": P_BXOR,
  "&": P_BAND,
  "===": P_EQ,
  "!==": P_EQ,
  "<": P_REL,
  ">": P_REL,
  "<=": P_REL,
  ">=": P_REL,
  "<<": P_SHIFT,
  ">>": P_SHIFT,
  "+": P_ADD,
  "-": P_ADD,
  "*": P_MUL,
  "/": P_MUL,
  "%": P_MUL,
  "**": P_EXP,
  "??": P_OR,
};

interface Code {
  code: string;
  prec: number;
  /** Set for `??`, which JavaScript does not mix with `&&`/`||` unparenthesised. */
  nullish?: boolean;
  /** Set for `&&`/`||`. */
  logical?: boolean;
  /** Set for an object literal, which an arrow body must parenthesise. */
  object?: boolean;
}

/** A JavaScript single-quoted string literal for `value`. */
export function jsString(value: string): string {
  let out = "'";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === "'") {
      out += "\\'";
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (ch === "\v") {
      out += "\\v";
    } else if (ch === "\f") {
      out += "\\f";
    } else if (ch === "\b") {
      out += "\\b";
    } else if (code < 0x20 || code === 0x7f) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else if (code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16)}`;
    } else {
      out += ch;
    }
  }
  return `${out}'`;
}

function wrap(code: Code, min: number): string {
  return code.prec >= min ? code.code : `(${code.code})`;
}

function call(fn: string, ...args: string[]): Code {
  return { code: `${fn}(${args.join(", ")})`, prec: P_PRIMARY };
}

const BOOLEAN_BINARY: ReadonlySet<string> = new Set(["==", "!=", "<>", "===", "!==", "<", ">", "<=", ">="]);

/** Whether `node` is boolean-shaped, so a condition or logical operand needs no `toBool`. */
function booleanShaped(node: Node): boolean {
  switch (node.t) {
    case "binary":
      return BOOLEAN_BINARY.has(node.op);
    case "not":
    case "logical":
    case "instanceof":
    case "isset":
    case "empty":
    case "bool":
      return true;
    default:
      return false;
  }
}

function condition(node: Node, blade: boolean): Code {
  const code = emit(node, blade);
  return booleanShaped(node) ? code : call("toBool", code.code);
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function emitArgs(args: readonly Arg[], blade: boolean): string {
  const out: string[] = [];
  const named: string[] = [];
  for (const arg of args) {
    const value = wrap(emit(arg.value, blade), P_ASSIGN);
    if (arg.name !== null) {
      named.push(`${arg.name}: ${value}`);
    } else {
      out.push(arg.spread ? `...${value}` : value);
    }
  }
  if (named.length > 0) {
    out.push(`{ ${named.join(", ")} }`);
  }
  return out.join(", ");
}

/** The literal key value an array key normalises to, for the next-index rule, or undefined when not literal. */
function literalKey(node: Node): number | string | undefined {
  switch (node.t) {
    case "num":
      if (node.int !== null) {
        return node.int;
      }
      return Math.trunc(Number(node.code.replace(/^float\((.*)\)$/, "$1").replace(/_/g, "")));
    case "unary":
      if (node.op === "-" && node.operand.t === "num" && node.operand.int !== null) {
        return -node.operand.int;
      }
      return undefined;
    case "str":
      return integerLike(node.value) ?? node.value;
    case "bool":
      return node.value ? 1 : 0;
    case "null":
      return "";
    default:
      return undefined;
  }
}

function emitArray(items: readonly ArrayItem[], blade: boolean): Code {
  if (items.every((item) => item.key === null)) {
    return { code: `[${items.map((item) => (item.spread ? "..." : "") + wrap(emit(item.value, blade), P_ASSIGN)).join(", ")}]`, prec: P_PRIMARY };
  }
  const plainObject = items.every((item) => item.key !== null && item.key.t === "str" && integerLike(item.key.value) === null);
  if (plainObject) {
    const seen = new Set<string>();
    const fields = items.map((item) => {
      const key = (item.key as { t: "str"; value: string }).value;
      if (key === "__proto__") {
        throw new UntranslatableExpression("`__proto__` array key");
      }
      if (seen.has(key)) {
        throw new UntranslatableExpression("duplicate array key", jsString(key));
      }
      seen.add(key);
      return `${IDENTIFIER.test(key) ? key : jsString(key)}: ${wrap(emit(item.value, blade), P_ASSIGN)}`;
    });
    return { code: `{ ${fields.join(", ")} }`, prec: P_PRIMARY, object: true };
  }
  let next: number | null = null;
  let opaque = false;
  const entries = items.map((item) => {
    if (item.spread) {
      throw new UntranslatableExpression("spread in a keyed array");
    }
    let key: string;
    if (item.key === null) {
      if (opaque) {
        throw new UntranslatableExpression("implicit key after a non-literal key");
      }
      const index: number = next ?? 0;
      key = String(index);
      next = index + 1;
    } else {
      key = wrap(emit(item.key, blade), P_ASSIGN);
      const literal = literalKey(item.key);
      if (literal === undefined) {
        opaque = true;
      } else if (typeof literal === "number" && (next === null || literal >= next)) {
        next = literal + 1;
      }
    }
    return `[${key}, ${wrap(emit(item.value, blade), P_ASSIGN)}]`;
  });
  return { code: `new PhpArray([${entries.join(", ")}])`, prec: P_PRIMARY };
}

/** `node` with every property and index link optional-chained (`a?.b?.['k']`), as PHP's isset, empty and `??` suppress null links. */
function nullsafe(node: Node, blade: boolean): Code {
  if (node.t === "prop") {
    return { code: `${wrap(nullsafe(node.obj, blade), P_PRIMARY)}?.${node.name}`, prec: P_PRIMARY };
  }
  if (node.t === "index") {
    return { code: `${wrap(nullsafe(node.obj, blade), P_PRIMARY)}?.[${emit(node.key, blade).code}]`, prec: P_PRIMARY };
  }
  return emit(node, blade);
}

/** A node that is a string in PHP by syntax alone: a string literal, an interpolated string, a concatenation or a `(string)`/`(binary)` cast. */
function isStringOperand(node: Node): boolean {
  return node.t === "str" || node.t === "interp" || node.t === "concat" || (node.t === "cast" && node.fn === "toPhpString");
}

/** A `num` node, optionally under unary `-`/`+`. */
function isNumberLiteral(node: Node): boolean {
  return node.t === "num" || (node.t === "unary" && (node.op === "-" || node.op === "+") && isNumberLiteral(node.operand));
}

/** A number literal whose PHP type is float. */
function isFloatLiteral(node: Node): boolean {
  if (node.t === "num") {
    return node.int === null;
  }
  return node.t === "unary" && (node.op === "-" || node.op === "+") && isFloatLiteral(node.operand);
}

/** PHP 8 `is_numeric` on a string: optional leading whitespace, sign, digits with optional `.` and exponent, optional trailing whitespace. */
function isPhpNumericString(value: string): boolean {
  return /^[ \t\n\r\v\f]*[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[ \t\n\r\v\f]*$/.test(value);
}

const ARITHMETIC_OPS = new Set(["+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>"]);
const RELATIONAL_OPS = new Set(["<", ">", "<=", ">="]);

/**
 * Throws for a binary operator whose operands are visibly of a type for which
 * the unchanged JavaScript operator gives a different result from PHP's.
 * Only literal and cast operands are inspected, never variables or calls.
 */
function refuseOperands(op: string, left: Node, right: Node): void {
  if (ARITHMETIC_OPS.has(op)) {
    if (isStringOperand(left) || isStringOperand(right)) {
      throw new UntranslatableExpression(`string operand of \`${op}\``);
    }
    if (op === "%" && (isFloatLiteral(left) || isFloatLiteral(right))) {
      throw new UntranslatableExpression("float operand of `%`");
    }
    return;
  }
  if (!RELATIONAL_OPS.has(op)) {
    return;
  }
  const nonString = (node: Node): boolean => isNumberLiteral(node) || node.t === "bool" || node.t === "null";
  if ((isStringOperand(left) && nonString(right)) || (isStringOperand(right) && nonString(left))) {
    throw new UntranslatableExpression("comparison of a string with a non-string literal");
  }
  if (left.t === "str" && right.t === "str" && isPhpNumericString(left.value) && isPhpNumericString(right.value)) {
    throw new UntranslatableExpression("comparison of two numeric strings");
  }
}

function emitBinary(op: string, left: Node, right: Node, blade: boolean): Code {
  refuseOperands(op, left, right);
  let l = emit(left, blade);
  const r = emit(right, blade);
  if (op === "==") {
    return call("looseEquals", wrap(l, P_ASSIGN), wrap(r, P_ASSIGN));
  }
  if (op === "!=" || op === "<>") {
    return { code: `!looseEquals(${wrap(l, P_ASSIGN)}, ${wrap(r, P_ASSIGN)})`, prec: P_UNARY };
  }
  if (op === "<=>") {
    return call("spaceship", wrap(l, P_ASSIGN), wrap(r, P_ASSIGN));
  }
  const prec = JS_BINARY[op];
  if (prec === undefined) {
    throw new UntranslatableExpression(`operator \`${op}\``);
  }
  if (op === "??") {
    l = nullsafe(left, blade);
    const side = (c: Code): string => (c.logical === true || c.prec < P_OR ? `(${c.code})` : c.code);
    return { code: `${side(l)} ?? ${side(r)}`, prec, nullish: true };
  }
  if (op === "**") {
    return { code: `${wrap(l, P_UNARY + 1)} ** ${wrap(r, P_EXP)}`, prec };
  }
  return { code: `${wrap(l, prec)} ${op} ${wrap(r, prec + 1)}`, prec };
}

function emitMember(obj: Node, blade: boolean): string {
  return wrap(emit(obj, blade), P_PRIMARY);
}

function emit(node: Node, blade: boolean): Code {
  switch (node.t) {
    case "var":
      return { code: blade ? `$${node.name}` : node.name, prec: P_PRIMARY };
    case "this":
      return { code: "this", prec: P_PRIMARY };
    case "name":
      return { code: node.name, prec: P_PRIMARY };
    case "num":
      return { code: node.code, prec: P_PRIMARY };
    case "str":
      return { code: jsString(node.value), prec: P_PRIMARY };
    case "interp": {
      const pieces = node.parts.map((part) => (typeof part === "string" ? jsString(part) : call("toPhpString", wrap(emit(part, blade), P_ASSIGN)).code));
      return { code: pieces.join(" + "), prec: pieces.length === 1 ? P_PRIMARY : P_ADD };
    }
    case "bool":
      return { code: String(node.value), prec: P_PRIMARY };
    case "null":
      return { code: "null", prec: P_PRIMARY };
    case "magicDir":
      return { code: "import.meta.dir", prec: P_PRIMARY };
    case "array":
      return emitArray(node.items, blade);
    case "prop":
      return { code: `${emitMember(node.obj, blade)}${node.nullsafe ? "?." : "."}${node.name}`, prec: P_PRIMARY };
    case "static":
      return { code: `${emitMember(node.cls, blade)}.${node.member}`, prec: P_PRIMARY };
    case "classRef":
      return { code: node.cls, prec: P_PRIMARY };
    case "index":
      return { code: `${emitMember(node.obj, blade)}[${emit(node.key, blade).code}]`, prec: P_PRIMARY };
    case "call":
      return { code: `${emitMember(node.callee, blade)}(${emitArgs(node.args, blade)})`, prec: P_PRIMARY };
    case "callable": {
      const callee = node.callee;
      if (callee.t === "name") {
        return { code: callee.name, prec: P_PRIMARY };
      }
      if ((callee.t === "prop" && !callee.nullsafe) || (callee.t === "static" && callee.kind === "const")) {
        const receiver = callee.t === "prop" ? callee.obj : callee.cls;
        if (receiver.t !== "var" && receiver.t !== "this" && receiver.t !== "name") {
          throw new UntranslatableExpression("first-class callable on a computed receiver");
        }
        const r = emit(receiver, blade).code;
        const member = callee.t === "prop" ? callee.name : callee.member;
        return { code: `${r}.${member}.bind(${r})`, prec: P_PRIMARY };
      }
      throw new UntranslatableExpression("first-class callable", "only `f(...)`, `$o->m(...)` and `C::m(...)` have a form");
    }
    case "new":
      return { code: `new ${emitMember(node.cls, blade)}(${emitArgs(node.args, blade)})`, prec: P_PRIMARY };
    case "unary": {
      const operand = wrap(emit(node.operand, blade), P_UNARY);
      const spaced = (node.op === "-" || node.op === "+") && operand.startsWith(node.op) ? `(${operand})` : operand;
      return { code: `${node.op}${spaced}`, prec: P_UNARY };
    }
    case "not": {
      const operand = condition(node.operand, blade);
      return { code: `!${wrap(operand, P_UNARY)}`, prec: P_UNARY };
    }
    case "cast":
      return call(node.fn, wrap(emit(node.operand, blade), P_ASSIGN));
    case "binary":
      return emitBinary(node.op, node.left, node.right, blade);
    case "concat": {
      const pieces = node.operands.map((operand) => {
        const code = emit(operand, blade);
        if (operand.t === "str" || operand.t === "interp") {
          return code.code;
        }
        return call("toPhpString", wrap(code, P_ASSIGN)).code;
      });
      return { code: pieces.join(" + "), prec: P_ADD };
    }
    case "logical": {
      const prec = node.op === "&&" ? P_AND : P_OR;
      const side = (operand: Node, min: number): string => {
        const code = condition(operand, blade);
        return code.nullish === true ? `(${code.code})` : wrap(code, min);
      };
      return { code: `${side(node.left, prec)} ${node.op} ${side(node.right, prec + 1)}`, prec, logical: true };
    }
    case "ternary":
      return {
        code: `${wrap(condition(node.cond, blade), P_OR)} ? ${wrap(emit(node.then, blade), P_ASSIGN)} : ${wrap(emit(node.else, blade), P_ASSIGN)}`,
        prec: P_COND,
      };
    case "short": {
      const value = wrap(emit(node.cond, blade), P_ASSIGN);
      return { code: `${wrap(condition(node.cond, blade), P_OR)} ? ${value} : ${wrap(emit(node.else, blade), P_ASSIGN)}`, prec: P_COND };
    }
    case "isset": {
      const tests = node.items.map((item) => `(${wrap(nullsafe(item, blade), P_OR + 1)} ?? null) !== null`);
      return { code: tests.join(" && "), prec: tests.length === 1 ? P_EQ : P_AND, logical: tests.length > 1 };
    }
    case "empty":
      return { code: `!toBool(${wrap(nullsafe(node.operand, blade), P_OR + 1)} ?? null)`, prec: P_UNARY };
    case "instanceof":
      return { code: `${wrap(emit(node.left, blade), P_REL)} instanceof ${node.right.t === "name" ? node.right.name : emit(node.right, blade).code}`, prec: P_REL };
    case "assign":
      return { code: `${emit(node.target, blade).code} = ${wrap(emit(node.value, blade), P_ASSIGN)}`, prec: P_ASSIGN };
    case "arrow": {
      const body = emit(node.body, blade);
      const bodyCode = body.object === true ? `(${body.code})` : wrap(body, P_ASSIGN);
      return { code: `(${node.params.join(", ")}) => ${bodyCode}`, prec: P_ASSIGN };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API

/** Translates one PHP expression to TypeScript by the mechanical rule. Throws `UntranslatableExpression`. */
export function translateExpression(php: string, options: TranslateOptions = {}): string {
  const blade = options.blade === true;
  return emit(new Parser(php, blade).parseWhole(), blade).code;
}

/**
 * Laravel's built-in Blade directives whose parentheses hold PHP expressions
 * (`Illuminate\View\Compilers\Concerns\Compiles*`). Any other `@name(...)`,
 * such as CSS `@media (…)` or a custom directive, is copied byte for byte.
 */
export const BLADE_EXPRESSION_DIRECTIVES: ReadonlySet<string> = new Set([
  "if", "elseif", "unless", "isset", "empty", "switch", "case", "while", "foreach", "forelse", "break", "continue",
  "can", "cannot", "canany", "elsecan", "elsecannot", "elsecanany", "auth", "elseauth", "guest", "elseguest", "env", "hasSection", "sectionMissing", "session", "context", "error",
  "section", "yield", "extends", "extendsFirst", "include", "includeIf", "includeWhen", "includeUnless", "includeFirst", "includeIsolated", "each",
  "component", "componentFirst", "slot", "props", "aware", "push", "pushOnce", "pushIf", "prepend", "prependOnce", "stack", "hasstack", "fragment", "once",
  "json", "js", "class", "style", "checked", "selected", "disabled", "readonly", "required", "bool", "inject", "lang", "choice", "method", "dd", "dump", "vite",
]);

/** The end (exclusive) of a parenthesised group starting at `open` (a `(`), skipping quoted strings. */
function parenEnd(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "'" || c === '"') {
      i++;
      while (i < src.length && src[i] !== c) {
        i += src[i] === "\\" ? 2 : 1;
      }
      i++;
      continue;
    }
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  throw new UntranslatableExpression("syntax error", "unbalanced directive parentheses");
}

/** The index of the top-level ` as ` keyword in a `@foreach` / `@forelse` argument, skipping quotes and brackets. */
function topLevelAs(args: string): number {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i]!;
    if (c === "'" || c === '"') {
      i++;
      while (i < args.length && args[i] !== c) {
        i += args[i] === "\\" ? 2 : 1;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
    } else if (c === ")" || c === "]" || c === "}") {
      depth--;
    } else if (depth === 0 && /\s/.test(c) && /^\s+as\s/i.test(args.slice(i))) {
      return i;
    }
  }
  return -1;
}

/** Translates an expression keeping its surrounding whitespace. */
function translatePadded(inner: string): string {
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner.slice(lead.length))![0];
  const core = inner.slice(lead.length, inner.length - trail.length);
  return lead + translateExpression(core, { blade: true }) + trail;
}

/** Translates a directive's argument list (the text between its parentheses). */
function translateArguments(inner: string): string {
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner.slice(lead.length))![0];
  const core = inner.slice(lead.length, inner.length - trail.length);
  if (core === "") {
    return inner;
  }
  // Parse the list as the arguments of a call, then emit them.
  const translated = translateExpression(`__blade_args__(${core})`, { blade: true });
  return lead + translated.slice("__blade_args__(".length, -1) + trail;
}

/**
 * Translates the PHP expressions of a Blade template: inside `{{ }}`,
 * `{{{ }}}`, `{!! !!}` and directive parentheses `@name(...)`. `@foreach` and
 * `@forelse` translate the iterable and keep `as $k => $v`. Everything else
 * is copied byte for byte; `@php` is untranslatable.
 */
export function translateBladeTemplate(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("{{--", i)) {
      const end = src.indexOf("--}}", i + 4);
      const stop = end === -1 ? src.length : end + 4;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (src.startsWith("@{{", i) || src.startsWith("@{!!", i)) {
      const close = src.startsWith("@{{", i) ? "}}" : "!!}";
      const end = src.indexOf(close, i + 2);
      const stop = end === -1 ? src.length : end + close.length;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    const echo = src.startsWith("{{{", i) ? ["{{{", "}}}"] : src.startsWith("{!!", i) ? ["{!!", "!!}"] : src.startsWith("{{", i) ? ["{{", "}}"] : null;
    if (echo !== null) {
      const [open, close] = echo as [string, string];
      const end = src.indexOf(close, i + open.length);
      if (end === -1) {
        throw new UntranslatableExpression("syntax error", `unterminated \`${open}\``);
      }
      out += open + translatePadded(src.slice(i + open.length, end)) + close;
      i = end + close.length;
      continue;
    }
    if (src[i] === "@" && (i === 0 || !/\w/.test(src[i - 1]!))) {
      if (src[i + 1] === "@") {
        const word = /^@@\w*/.exec(src.slice(i))![0];
        out += word;
        i += word.length;
        continue;
      }
      const match = /^@(\w+(?:::\w+)?)([ \t]*)/.exec(src.slice(i));
      if (match !== null) {
        const name = match[1]!;
        if (name.toLowerCase() === "php") {
          throw new UntranslatableExpression("@php");
        }
        if (name === "for" && src[i + match[0].length] === "(") {
          throw new UntranslatableExpression("@for", "its clauses are statements; port the loop by hand");
        }
        if (name === "verbatim") {
          const end = src.indexOf("@endverbatim", i);
          const stop = end === -1 ? src.length : end + "@endverbatim".length;
          out += src.slice(i, stop);
          i = stop;
          continue;
        }
        const open = i + match[0].length;
        if (src[open] !== "(" || !BLADE_EXPRESSION_DIRECTIVES.has(name)) {
          out += `@${name}`;
          i += 1 + name.length;
          continue;
        }
        const end = parenEnd(src, open);
        const inner = src.slice(open + 1, end - 1);
        let translated: string;
        if (name === "foreach" || name === "forelse") {
          const at = topLevelAs(inner);
          if (at === -1) {
            throw new UntranslatableExpression(`@${name}`, "no top-level `as`");
          }
          translated = translatePadded(inner.slice(0, at)) + inner.slice(at);
        } else {
          translated = translateArguments(inner);
        }
        out += `${match[0]}(${translated})`;
        i = end;
        continue;
      }
    }
    out += src[i];
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = "Usage: bun tools/porting/translate.ts translate [--blade] <php>";

export function main(argv: readonly string[]): number {
  const args = argv[0] === "translate" ? argv.slice(1) : null;
  let blade = false;
  const rest: string[] = [];
  for (const arg of args ?? []) {
    if (arg === "--blade" && rest.length === 0) {
      blade = true;
    } else if (arg.startsWith("--") && rest.length === 0) {
      process.stderr.write(`Unknown argument: ${arg}\n${USAGE}\n`);
      return 2;
    } else {
      rest.push(arg);
    }
  }
  if (args === null || rest.length !== 1) {
    process.stderr.write(`${args === null ? (argv[0] === undefined ? "Missing subcommand: translate" : `Unknown subcommand: ${argv[0]}`) : "Expected exactly one <php> argument"}\n${USAGE}\n`);
    return 2;
  }
  try {
    process.stdout.write(`${blade ? translateBladeTemplate(rest[0]!) : translateExpression(rest[0]!)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UntranslatableExpression) {
      process.stderr.write(`UntranslatableExpression: ${error.message}\n`);
      return 1;
    }
    process.stderr.write(`translate failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
