// The PHP-pattern converter and match core behind the runtime's `preg_*` functions (action item
// epic-15-item-2-runtime-pcre-functions, ESC-15.2-1 part f, ESC-15.2-5), under PORTING.md § PCRE conversion (DIV-10.1).
// Internal: the package does not export this module.
//
// - The pattern string is split as PHP 8.5.11's `pcre_get_compiled_regex_cache_ex` splits it (leading whitespace, a
//   delimiter that is no alphanumeric, backslash or NUL byte, `( [ { <` closed by their pair with nesting counted, then
//   the modifiers). A pattern PHP cannot compile gives null: the caller returns PHP's failure value with error 1.
// - The body is tokenized and emitted per token, never by string replacement, in PCRE's meaning: `.` is `[^\n]`
//   (without `s`), `^` / `$` / `\A` / `\z` are lookarounds the `RegExp` `m` flag cannot change, `\s` / `\S` are
//   PCRE's sets (ASCII without `u`, PCRE2 10.49's Unicode set without U+FEFF with `u`), `(?P<n>` and `(?'n'` are
//   `(?<n>`, and a branch-reset group `(?|…)` compiles as `(?:…)` with its groups remapped to PHP's numbers.
// - Without `u` the pattern and subject are bytes (one code unit per byte), as PCRE matches them; with `u` they are
//   code points. Emitted JS always carries the `u` and `d` flags, `y` for the `A` modifier.
// - A form the rule does not cover throws a JS `TypeError` naming it, and is never converted silently.
//
// No compiled pattern is cached (AD-5): each call compiles its own.
import { utf8 } from "./mangle";
import { decodeResult } from "./stringFunctions";

/** A converted pattern. */
export interface PcrePattern {
  /** The `u` modifier: code points rather than bytes. */
  readonly utf: boolean;
  /** The `A` modifier: every match starts at the start offset. */
  readonly anchored: boolean;
  /** The emitted `RegExp` source. */
  readonly source: string;
  /** The emitted `RegExp` flags, without `g` / `y`. */
  readonly flags: string;
  /** The compiled `RegExp` that searches from an index (sticky under `A`), built once when the pattern is checked. */
  readonly search: RegExp;
  /** PCRE's capture count (`PCRE2_INFO_CAPTURECOUNT`). */
  readonly groups: number;
  /** The name of each PHP group number, or null. */
  readonly names: readonly (string | null)[];
  /** The PHP group number of each JS group index (index 0 is the whole match). */
  readonly phpOf: readonly number[];
}

/** A subject prepared for a pattern: the string matched, and its byte offsets. */
export interface PcreSubject {
  /** The JS string the `RegExp` runs over: the bytes (without `u`) or the string itself. */
  readonly text: string;
  /** The subject's length in bytes. */
  readonly byteLength: number;
  /** The byte offset of a JS index. */
  byteOffset(index: number): number;
  /** The JS index of a byte offset, or null when it is inside a UTF-8 sequence. */
  indexOf(byte: number): number | null;
  /** The number of characters (bytes without `u`, code points with it) before a JS index. */
  characters(index: number): number;
  /** The JS index one character (a byte without `u`, a code point with it) after `index`. */
  next(index: number): number;
  /** The subject between two JS indices, as a JS string (a split UTF-8 sequence throws the limit). */
  slice(start: number, end: number): string;
  /** The subject's bytes between two JS indices. */
  bytes(start: number, end: number): Uint8Array;
}

/** One match: each PHP group's JS start and end index (-1 when unset), and PCRE's `count`. */
export interface PcreMatch {
  readonly starts: readonly number[];
  readonly ends: readonly number[];
  /** The highest set group's number plus one. */
  readonly count: number;
}

/** Thrown inside the parser for a pattern PCRE does not compile; caught by `compilePattern`. */
const COMPILE_FAILURE = new Error("PCRE compile failure");

function fail(): never {
  throw COMPILE_FAILURE;
}

/** The JS `TypeError` for a form PORTING.md § PCRE conversion does not cover. */
function limit(fn: string, form: string): TypeError {
  return new TypeError(`${fn}(): ${form} has no RegExp form under PORTING.md § PCRE conversion (DIV-10.1)`);
}

const BACKSLASH = 0x5c;

function isDigit(c: number | undefined): boolean {
  return c !== undefined && c >= 0x30 && c <= 0x39;
}

function isAsciiAlpha(c: number | undefined): boolean {
  return c !== undefined && ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a));
}

function isHex(c: number | undefined): boolean {
  return c !== undefined && (isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66));
}

/** C's `isspace` in the C locale. */
function isCSpace(c: number): boolean {
  return (c >= 0x09 && c <= 0x0d) || c === 0x20;
}

/** PCRE's whitespace without `u`: `\t \n \v \f \r` and space. */
const ASCII_SPACE: readonly (readonly [number, number])[] = [[0x09, 0x0d], [0x20, 0x20]];

/** PCRE2 10.49's `\s` with UCP (PHP's `u`), measured with PHP 8.5.11 over every code point: no U+FEFF. */
const UNICODE_SPACE: readonly (readonly [number, number])[] = [
  [0x09, 0x0d], [0x20, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200a],
  [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000],
];

/** The POSIX classes without `u`, as PCRE's C-locale tables give them. */
const POSIX: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  alpha: [[0x41, 0x5a], [0x61, 0x7a]],
  digit: [[0x30, 0x39]],
  alnum: [[0x30, 0x39], [0x41, 0x5a], [0x61, 0x7a]],
  space: ASCII_SPACE,
  blank: [[0x09, 0x09], [0x20, 0x20]],
  upper: [[0x41, 0x5a]],
  lower: [[0x61, 0x7a]],
  punct: [[0x21, 0x2f], [0x3a, 0x40], [0x5b, 0x60], [0x7b, 0x7e]],
  xdigit: [[0x30, 0x39], [0x41, 0x46], [0x61, 0x66]],
  word: [[0x30, 0x39], [0x41, 0x5a], [0x5f, 0x5f], [0x61, 0x7a]],
  cntrl: [[0x00, 0x1f], [0x7f, 0x7f]],
  graph: [[0x21, 0x7e]],
  print: [[0x20, 0x7e]],
  ascii: [[0x00, 0x7f]],
};

/** The Unicode general categories PCRE's `\p{…}` names, by loose name (lower case, no space, `_` or `-`). */
const CATEGORIES: Readonly<Record<string, string>> = Object.fromEntries(
  ["C", "Cc", "Cf", "Cn", "Co", "Cs", "L", "Ll", "Lm", "Lo", "Lt", "Lu", "M", "Mc", "Me", "Mn", "N", "Nd", "Nl", "No", "P", "Pc",
    "Pd", "Pe", "Pf", "Pi", "Po", "Ps", "S", "Sc", "Sk", "Sm", "So", "Z", "Zl", "Zp", "Zs"].map((name) => [name.toLowerCase(), name] as const)
    .concat([["l&", "LC"], ["lc", "LC"]]),
);

/** A code point as a JS `RegExp` (`u` mode) literal outside a class. */
function literal(c: number): string {
  if ("^$\\.*+?()[]{}|/".includes(String.fromCodePoint(c))) {
    return `\\${String.fromCodePoint(c)}`;
  }
  if (c >= 0x20 && c < 0x7f) {
    return String.fromCodePoint(c);
  }
  return `\\u{${c.toString(16)}}`;
}

/** A code point as a JS `RegExp` (`u` mode) literal inside a class. */
function classLiteral(c: number): string {
  if ("\\]-[^".includes(String.fromCodePoint(c))) {
    return `\\${String.fromCodePoint(c)}`;
  }
  if (c >= 0x20 && c < 0x7f) {
    return String.fromCodePoint(c);
  }
  return `\\u{${c.toString(16)}}`;
}

/** Ranges as class contents. */
function rangesContent(ranges: readonly (readonly [number, number])[]): string {
  return ranges.map(([from, to]) => from === to ? classLiteral(from) : `${classLiteral(from)}-${classLiteral(to)}`).join("");
}

/** The complement of sorted, disjoint ranges within 0..`max`. */
function complement(ranges: readonly (readonly [number, number])[], max: number): [number, number][] {
  const out: [number, number][] = [];
  let next = 0;
  for (const [from, to] of ranges) {
    if (from > next) {
      out.push([next, from - 1]);
    }
    next = to + 1;
  }
  if (next <= max) {
    out.push([next, max]);
  }
  return out;
}

type GroupKind = "capture" | "group" | "reset" | "lookahead" | "lookbehind";

/** A parsed pattern node. */
type Node =
  | { readonly kind: "atom"; readonly js: string; readonly assertion: boolean }
  | { readonly kind: "group"; readonly type: GroupKind; readonly open: string; readonly body: Alternation }
  | { readonly kind: "quantified"; readonly body: Node; readonly min: number; readonly max: number; readonly js: string };

interface Alternation {
  readonly branches: readonly (readonly Node[])[];
}

/** One class item: a single character or a set (`\d`, `\s`, a POSIX class, a property). */
type ClassItem = { readonly char: number } | { readonly set: string };

/** Whether `node` can match the empty string. */
function nullable(node: Node): boolean {
  switch (node.kind) {
    case "atom":
      return node.assertion;
    case "group":
      return node.type === "lookahead" || node.type === "lookbehind" || alternationNullable(node.body);
    case "quantified":
      return node.min === 0 || nullable(node.body);
  }
}

function alternationNullable(alternation: Alternation): boolean {
  return alternation.branches.some((branch) => branch.every(nullable));
}

/** Whether `node` holds a capturing group, itself included when `self`. */
function holdsCapture(node: Node, self: boolean): boolean {
  switch (node.kind) {
    case "atom":
      return false;
    case "group":
      return (self && node.type === "capture")
        || node.body.branches.some((branch) => branch.some((child) => holdsCapture(child, true)));
    case "quantified":
      return holdsCapture(node.body, true);
  }
}

/** The fewest and most characters `node` matches (`Infinity` for no bound). */
function width(node: Node): [number, number] {
  switch (node.kind) {
    case "atom":
      return node.assertion ? [0, 0] : [1, 1];
    case "group":
      return node.type === "lookahead" || node.type === "lookbehind" ? [0, 0] : alternationWidth(node.body);
    case "quantified": {
      const [min, max] = width(node.body);
      return [min * node.min, max === 0 ? 0 : max * node.max];
    }
  }
}

function alternationWidth(alternation: Alternation): [number, number] {
  let min = Infinity;
  let max = 0;
  for (const branch of alternation.branches) {
    let bmin = 0;
    let bmax = 0;
    for (const node of branch) {
      const [a, b] = width(node);
      bmin += a;
      bmax += b;
    }
    min = Math.min(min, bmin);
    max = Math.max(max, bmax);
  }
  return [min === Infinity ? 0 : min, max];
}

function emit(node: Node): string {
  switch (node.kind) {
    case "atom":
      return node.js;
    case "group":
      return `${node.open}${emitAlternation(node.body)})`;
    case "quantified":
      return `${emit(node.body)}${node.js}`;
  }
}

function emitAlternation(alternation: Alternation): string {
  return alternation.branches.map((branch) => branch.map(emit).join("")).join("|");
}

/** The modifiers PHP accepts; `x U J n r` among them have no `RegExp` form. */
interface Modifiers {
  readonly caseless: boolean;
  readonly multiline: boolean;
  readonly dotall: boolean;
  readonly anchored: boolean;
  readonly dollarEndOnly: boolean;
  readonly utf: boolean;
}

class Parser {
  private pos = 0;
  private nextNumber = 1;
  private highest = 0;
  private jsGroups = 0;
  private lookbehinds = 0;
  private resets = 0;
  readonly phpOf: number[] = [0];
  readonly names = new Map<number, string>();

  constructor(
    private readonly fn: string,
    private readonly cps: readonly number[],
    private readonly modifiers: Modifiers,
  ) {}

  /** The whole body, or a compile failure for an unmatched `)`. */
  parse(): Alternation {
    const body = this.alternation(null);
    if (this.pos < this.cps.length) {
      fail();
    }
    return body;
  }

  get groups(): number {
    return Math.max(this.highest, this.nextNumber - 1);
  }

  private peek(offset: number = 0): number | undefined {
    return this.cps[this.pos + offset];
  }

  private alternation(resetStart: number | null): Alternation {
    const branches: Node[][] = [];
    let sequence: Node[] = [];
    let most = this.nextNumber;
    for (;;) {
      const c = this.peek();
      if (c === undefined || c === 0x29) {
        break;
      }
      if (c === 0x7c) {
        this.pos++;
        branches.push(sequence);
        sequence = [];
        if (resetStart !== null) {
          most = Math.max(most, this.nextNumber);
          this.nextNumber = resetStart;
        }
        continue;
      }
      if (this.skipE()) {
        continue;
      }
      if (this.quantifierAhead() !== null) {
        fail();
      }
      let node = this.atom();
      this.skipE();
      const quantifier = this.quantifierAhead();
      if (quantifier !== null) {
        node = this.quantify(node, quantifier);
      }
      sequence.push(node);
    }
    branches.push(sequence);
    if (resetStart !== null) {
      this.nextNumber = Math.max(most, this.nextNumber);
    }
    return { branches };
  }

  /** Skips each `\\E` at the cursor, which PCRE ignores outside `\\Q…\\E`; whether there was one. */
  private skipE(): boolean {
    let skipped = false;
    while (this.peek() === BACKSLASH && this.peek(1) === 0x45) {
      this.pos += 2;
      skipped = true;
    }
    return skipped;
  }

  /** The quantifier at the cursor (its bounds and length), or null when none starts there. */
  private quantifierAhead(): { min: number; max: number; length: number } | null {
    const c = this.peek();
    if (c === 0x2a) return { min: 0, max: Infinity, length: 1 };
    if (c === 0x2b) return { min: 1, max: Infinity, length: 1 };
    if (c === 0x3f) return { min: 0, max: 1, length: 1 };
    if (c !== 0x7b) return null;
    // PCRE2 10.49's `read_repeat_counts`: `{n}`, `{n,}`, `{n,m}`, `{,m}`, spaces and tabs allowed around the numbers.
    let i = this.pos + 1;
    const blanks = (): void => {
      while (this.cps[i] === 0x20 || this.cps[i] === 0x09) i++;
    };
    const number = (): string => {
      let digits = "";
      while (isDigit(this.cps[i])) digits += String.fromCharCode(this.cps[i++]!);
      return digits;
    };
    blanks();
    const first = number();
    blanks();
    let second: string | null = null;
    if (this.cps[i] === 0x2c) {
      i++;
      blanks();
      second = number();
      blanks();
    }
    if (this.cps[i] !== 0x7d || (first === "" && (second === null || second === ""))) {
      return null;
    }
    const min = first === "" ? 0 : Number(first);
    const max = second === null ? min : second === "" ? Infinity : Number(second);
    if (min > 65535 || (max !== Infinity && max > 65535) || max < min) {
      fail();
    }
    return { min, max, length: i + 1 - this.pos };
  }

  private quantify(node: Node, quantifier: { min: number; max: number; length: number }): Node {
    this.pos += quantifier.length;
    let lazy = false;
    if (this.peek() === 0x3f) {
      lazy = true;
      this.pos++;
    } else if (this.peek() === 0x2b) {
      throw limit(this.fn, "a possessive quantifier");
    }
    if (this.quantifierAhead() !== null) {
      fail();
    }
    if (node.kind === "atom" && node.assertion) {
      fail();
    }
    if (node.kind === "group" && (node.type === "lookahead" || node.type === "lookbehind")) {
      throw limit(this.fn, "a quantified assertion");
    }
    const { min, max } = quantifier;
    // JS resets a group's captures on each repetition and refuses an empty one; PCRE keeps the last values.
    if (max > 1 && holdsCapture(node, false)) {
      throw limit(this.fn, "a capturing group inside a repeated group");
    }
    if ((min === 0 || max > 1) && holdsCapture(node, true) && nullable(node)) {
      throw limit(this.fn, "a repeated capturing group that can match empty");
    }
    const js = (min === 0 && max === Infinity ? "*" : min === 1 && max === Infinity ? "+" : min === 0 && max === 1 ? "?"
      : max === Infinity ? `{${min},}` : min === max ? `{${min}}` : `{${min},${max}}`) + (lazy ? "?" : "");
    return { kind: "quantified", body: node, min, max, js };
  }

  private atom(): Node {
    const c = this.peek()!;
    switch (c) {
      case 0x28:
        return this.group();
      case 0x5b:
        return { kind: "atom", js: this.characterClass(), assertion: false };
      case 0x2e:
        this.pos++;
        return { kind: "atom", js: this.modifiers.dotall ? "[\\s\\S]" : "[^\\n]", assertion: false };
      case 0x5e:
        this.pos++;
        return { kind: "atom", js: this.modifiers.multiline ? "(?:(?<![\\s\\S])|(?<=\\n)(?=[\\s\\S]))" : "(?<![\\s\\S])", assertion: true };
      case 0x24:
        this.pos++;
        return {
          kind: "atom",
          js: this.modifiers.multiline ? "(?=\\n|(?![\\s\\S]))" : this.modifiers.dollarEndOnly ? "(?![\\s\\S])" : "(?=\\n?(?![\\s\\S]))",
          assertion: true,
        };
      case BACKSLASH:
        return this.escape();
      default:
        this.pos++;
        return { kind: "atom", js: this.literalValue(c), assertion: false };
    }
  }

  /** A literal character's JS form; `i` without `u` on a character above 0x7F throws the limit. */
  private literalValue(c: number): string {
    if (this.modifiers.caseless && !this.modifiers.utf && c > 0x7f) {
      throw limit(this.fn, "a non-ASCII character under the i modifier without u");
    }
    return literal(c);
  }

  /** A code point an escape names: above 0xFF without `u`, or no Unicode scalar with it, PCRE does not compile. */
  private codePoint(value: number): number {
    if (this.modifiers.utf ? value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff) : value > 0xff) {
      fail();
    }
    return value;
  }

  /** `\x…` after the `x`. */
  private hexEscape(): number {
    if (this.peek() === 0x7b) {
      let i = this.pos + 1;
      let digits = "";
      while (isHex(this.cps[i])) digits += String.fromCharCode(this.cps[i++]!);
      if (digits === "" || this.cps[i] !== 0x7d) {
        fail();
      }
      this.pos = i + 1;
      const significant = digits.replace(/^0+/, "");
      return this.codePoint(significant.length > 8 ? Infinity : parseInt(digits, 16));
    }
    let digits = "";
    while (digits.length < 2 && isHex(this.peek())) digits += String.fromCharCode(this.cps[this.pos++]!);
    if (digits === "") {
      fail();
    }
    return parseInt(digits, 16);
  }

  /** `\0…` after the `0`: up to two more octal digits. */
  private octalEscape(): number {
    let value = 0;
    for (let n = 0; n < 2 && this.peek() !== undefined && this.peek()! >= 0x30 && this.peek()! <= 0x37; n++) {
      value = value * 8 + (this.cps[this.pos++]! - 0x30);
    }
    return value;
  }

  /** `\p{…}` / `\P{…}` after the letter, as a JS property escape. */
  private property(negated: boolean): string {
    if (this.modifiers.caseless) {
      throw limit(this.fn, "a \\p or \\P property under the i modifier");
    }
    let name: string;
    if (this.peek() === 0x7b) {
      const close = this.cps.indexOf(0x7d, this.pos);
      if (close === -1) {
        fail();
      }
      name = String.fromCodePoint(...this.cps.slice(this.pos + 1, close));
      this.pos = close + 1;
    } else {
      const c = this.peek();
      if (c === undefined) {
        fail();
      }
      name = String.fromCodePoint(c);
      this.pos++;
    }
    if (name.startsWith("^")) {
      negated = !negated;
      name = name.slice(1);
    }
    if (name === "") {
      fail();
    }
    const category = CATEGORIES[name.toLowerCase().replace(/[ _-]/g, "")];
    if (category === undefined) {
      throw limit(this.fn, `the property \\p{${name}} (only general categories are converted)`);
    }
    return `\\${negated ? "P" : "p"}{${category}}`;
  }

  /** The whitespace ranges `\s` names in this mode. */
  private spaces(): readonly (readonly [number, number])[] {
    return this.modifiers.utf ? UNICODE_SPACE : ASCII_SPACE;
  }

  private get top(): number {
    return this.modifiers.utf ? 0x10ffff : 0xff;
  }

  /** An escape outside a class. */
  private escape(): Node {
    this.pos++;
    const c = this.peek();
    if (c === undefined) {
      fail();
    }
    this.pos++;
    const atom = (js: string, assertion: boolean = false): Node => ({ kind: "atom", js, assertion });
    if (!isDigit(c) && !isAsciiAlpha(c)) {
      return atom(this.literalValue(c));
    }
    const utf = this.modifiers.utf;
    switch (String.fromCharCode(c)) {
      case "a": return atom(literal(0x07));
      case "e": return atom(literal(0x1b));
      case "f": return atom(literal(0x0c));
      case "n": return atom(literal(0x0a));
      case "r": return atom(literal(0x0d));
      case "t": return atom(literal(0x09));
      case "x": return atom(this.literalValue(this.hexEscape()));
      case "0": return atom(this.literalValue(this.octalEscape()));
      case "s": return atom(`[${rangesContent(this.spaces())}]`);
      case "S": return atom(`[^${rangesContent(this.spaces())}]`);
      case "A": return atom("(?<![\\s\\S])", true);
      case "z": return atom("(?![\\s\\S])", true);
      case "p": return atom(this.property(false));
      case "P": return atom(this.property(true));
      case "d": case "D": case "w": case "W":
        if (utf) throw limit(this.fn, `\\${String.fromCharCode(c)} under the u modifier (PCRE's UCP)`);
        return atom(`\\${String.fromCharCode(c)}`);
      case "b": case "B":
        if (utf) throw limit(this.fn, `\\${String.fromCharCode(c)} under the u modifier (PCRE's UCP)`);
        return atom(`\\${String.fromCharCode(c)}`, true);
      case "i": case "j": case "m": case "q": case "y": case "F": case "I": case "J": case "M": case "O": case "T": case "Y":
      case "l": case "L": case "u": case "U":
        return fail();
      default:
        if (isDigit(c)) throw limit(this.fn, "a backreference or octal escape (\\1-\\9)");
        throw limit(this.fn, `the escape \\${String.fromCharCode(c)}`);
    }
  }

  /** `(…)`. */
  private group(): Node {
    this.pos++;
    let type: GroupKind;
    let open: string;
    if (this.peek() === 0x2a) {
      throw limit(this.fn, "a (*…) verb or option");
    }
    if (this.peek() !== 0x3f) {
      return this.capture(null);
    }
    const next = this.peek(1);
    const after = this.peek(2);
    if (next === 0x3a) {
      this.pos += 2;
      type = "group";
      open = "(?:";
    } else if (next === 0x7c) {
      this.pos += 2;
      return this.reset();
    } else if (next === 0x3d || next === 0x21) {
      this.pos += 2;
      type = "lookahead";
      open = next === 0x3d ? "(?=" : "(?!";
    } else if (next === 0x3c && (after === 0x3d || after === 0x21)) {
      this.pos += 3;
      return this.lookbehind(after === 0x3d ? "(?<=" : "(?<!");
    } else if (next === 0x3c || next === 0x27) {
      this.pos += 2;
      return this.capture(this.name(next === 0x3c ? 0x3e : 0x27));
    } else if (next === 0x50 && after === 0x3c) {
      this.pos += 3;
      return this.capture(this.name(0x3e));
    } else if (next === 0x50 && (after === 0x3d || after === 0x3e)) {
      throw limit(this.fn, after === 0x3d ? "a backreference ((?P=name))" : "recursion ((?P>name))");
    } else if (next === 0x23) {
      throw limit(this.fn, "a comment group (?#…)");
    } else if (next === 0x3e) {
      throw limit(this.fn, "an atomic group (?>…)");
    } else if (next === 0x28) {
      throw limit(this.fn, "a conditional group (?(…)…)");
    } else if (next !== undefined && (next === 0x52 || isDigit(next) || next === 0x26 || next === 0x2b || (next === 0x2d && isDigit(after)))) {
      throw limit(this.fn, "recursion or a subroutine call");
    } else if (next === 0x43 || next === 0x2a) {
      throw limit(this.fn, `the group (?${String.fromCharCode(next)}`);
    } else if (next !== undefined && (next === 0x29 || next === 0x2d || next === 0x5e || "imnsxJUa".includes(String.fromCharCode(next)))) {
      throw limit(this.fn, "an inline flag group ((?i), (?i:…))");
    } else {
      return fail();
    }
    const body = this.alternation(null);
    this.close();
    return { kind: "group", type, open, body };
  }

  private close(): void {
    if (this.peek() !== 0x29) {
      fail();
    }
    this.pos++;
  }

  private capture(name: string | null): Node {
    if (this.lookbehinds > 0) {
      throw limit(this.fn, "a capturing group inside a lookbehind");
    }
    if (name !== null && this.resets > 0) {
      throw limit(this.fn, "a named group inside a branch-reset group");
    }
    const number = this.nextNumber++;
    this.highest = Math.max(this.highest, number);
    this.phpOf[++this.jsGroups] = number;
    if (name !== null) {
      this.names.set(number, name);
    }
    const body = this.alternation(null);
    this.close();
    return { kind: "group", type: "capture", open: name === null ? "(" : `(?<${name}>`, body };
  }

  private reset(): Node {
    this.resets++;
    const body = this.alternation(this.nextNumber);
    this.resets--;
    this.highest = Math.max(this.highest, this.nextNumber - 1);
    this.close();
    return { kind: "group", type: "reset", open: "(?:", body };
  }

  private lookbehind(open: string): Node {
    this.lookbehinds++;
    const body = this.alternation(null);
    this.lookbehinds--;
    this.close();
    // PCRE2 10.49 compiles a lookbehind of bounded length, at most 255 characters when it varies.
    for (const branch of body.branches) {
      const [min, max] = alternationWidth({ branches: [branch] });
      if (max === Infinity || (max !== min && max > 255)) {
        fail();
      }
    }
    return { kind: "group", type: "lookbehind", open, body };
  }

  /** A group name up to `terminator`: ASCII word characters, not starting with a digit, used once. */
  private name(terminator: number): string {
    let name = "";
    for (;;) {
      const c = this.peek();
      if (c === undefined) {
        fail();
      }
      this.pos++;
      if (c === terminator) {
        break;
      }
      if (c > 0x7f) {
        // With `u` PCRE takes a Unicode word character, as a JS group name under the `u` flag does; without it, none.
        const ch = String.fromCodePoint(c);
        if (!this.modifiers.utf || !/[\p{L}\p{N}\p{Mn}\p{Pc}]/u.test(ch) || (name === "" && /\p{N}/u.test(ch))) {
          fail();
        }
        name += ch;
        continue;
      }
      if (!(isDigit(c) || isAsciiAlpha(c) || c === 0x5f) || (name === "" && isDigit(c))) {
        fail();
      }
      name += String.fromCharCode(c);
    }
    if (name === "" || [...this.names.values()].includes(name)) {
      fail();
    }
    return name;
  }

  /** `[…]`, as a JS class. */
  private characterClass(): string {
    // PCRE2's `check_posix_syntax` at the class's own `[`: `[:alpha:]` outside a class does not compile.
    if (this.posixEnd() !== -1) {
      fail();
    }
    this.pos++;
    let negated = false;
    if (this.peek() === 0x5e) {
      negated = true;
      this.pos++;
    }
    let content = "";
    let first = true;
    for (;;) {
      this.skipE();
      const c = this.peek();
      if (c === undefined) {
        fail();
      }
      if (c === 0x5d && !first) {
        this.pos++;
        break;
      }
      first = false;
      const item = this.classItem();
      if ("set" in item || this.peek() !== 0x2d || this.peek(1) === 0x5d || this.peek(1) === undefined) {
        if ("set" in item && this.peek() === 0x2d && this.peek(1) !== 0x5d && this.peek(1) !== undefined) {
          fail();
        }
        content += "set" in item ? item.set : this.classChar(item.char);
        continue;
      }
      this.pos++;
      const end = this.classItem();
      if ("set" in end || end.char < item.char) {
        fail();
      }
      content += `${this.classChar(item.char)}-${this.classChar(end.char)}`;
    }
    return `[${negated ? "^" : ""}${content}]`;
  }

  private classChar(c: number): string {
    if (this.modifiers.caseless && !this.modifiers.utf && c > 0x7f) {
      throw limit(this.fn, "a non-ASCII character under the i modifier without u");
    }
    return classLiteral(c);
  }

  /** The index of the terminator of a POSIX class starting at the cursor's `[` (`[:name:]`), or -1 for none. */
  private posixEnd(): number {
    const kind = this.peek(1);
    if (kind !== 0x3a && kind !== 0x2e && kind !== 0x3d) {
      return -1;
    }
    // PCRE's `check_posix_syntax`: the terminator `:]` (or `.]`, `=]`) before any `]` or another `[:`.
    for (let i = this.pos + 2; i < this.cps.length; i++) {
      const c = this.cps[i]!;
      if (c === BACKSLASH && (this.cps[i + 1] === 0x5d || this.cps[i + 1] === BACKSLASH)) {
        i++;
      } else if (c === 0x5b && (this.cps[i + 1] === 0x3a || this.cps[i + 1] === 0x2e || this.cps[i + 1] === 0x3d)) {
        return -1;
      } else if (c === 0x5d) {
        return -1;
      } else if (c === kind && this.cps[i + 1] === 0x5d) {
        return i;
      }
    }
    return -1;
  }

  /** The POSIX class at the cursor (`[:name:]`), or null when `[` starts none. */
  private posix(): string | null {
    const kind = this.peek(1);
    const end = this.posixEnd();
    if (end === -1) {
      return null;
    }
    if (kind !== 0x3a) {
      fail();
    }
    if (this.modifiers.utf) {
      throw limit(this.fn, "a POSIX class under the u modifier (PCRE's UCP)");
    }
    let name = String.fromCodePoint(...this.cps.slice(this.pos + 2, end));
    this.pos = end + 2;
    if (name === "<" || name === ">") {
      throw limit(this.fn, `the word boundary [[:${name}:]]`);
    }
    const negated = name.startsWith("^");
    if (negated) {
      name = name.slice(1);
    }
    const ranges = Object.hasOwn(POSIX, name) ? POSIX[name]! : fail();
    return rangesContent(negated ? complement(ranges, 0xff) : ranges);
  }

  private classItem(): ClassItem {
    const c = this.peek()!;
    if (c === 0x5b) {
      const posix = this.posix();
      if (posix !== null) {
        return { set: posix };
      }
    }
    this.pos++;
    if (c !== BACKSLASH) {
      return { char: c };
    }
    const e = this.peek();
    if (e === undefined) {
      fail();
    }
    this.pos++;
    if (!isDigit(e) && !isAsciiAlpha(e)) {
      return { char: e };
    }
    const utf = this.modifiers.utf;
    switch (String.fromCharCode(e)) {
      case "a": return { char: 0x07 };
      case "b": return { char: 0x08 };
      case "e": return { char: 0x1b };
      case "f": return { char: 0x0c };
      case "n": return { char: 0x0a };
      case "r": return { char: 0x0d };
      case "t": return { char: 0x09 };
      case "x": return { char: this.hexEscape() };
      case "0": return { char: this.octalEscape() };
      case "s": return { set: rangesContent(this.spaces()) };
      case "S": return { set: rangesContent(complement(this.spaces(), this.top)) };
      case "p": return { set: this.property(false) };
      case "P": return { set: this.property(true) };
      case "d": case "D": case "w": case "W":
        if (utf) throw limit(this.fn, `\\${String.fromCharCode(e)} under the u modifier (PCRE's UCP)`);
        return { set: `\\${String.fromCharCode(e)}` };
      case "B": case "R": case "X": case "N": case "l": case "L": case "u": case "U":
      case "i": case "j": case "m": case "q": case "y": case "F": case "I": case "J": case "M": case "O": case "T": case "Y":
        return fail();
      default:
        if (isDigit(e)) throw limit(this.fn, "an octal escape (\\1-\\9)");
        throw limit(this.fn, `the escape \\${String.fromCharCode(e)} in a class`);
    }
  }
}

/** PHP's pattern split: the body and modifiers, or null for PHP's delimiter errors. */
function split(bytes: Uint8Array): { body: Uint8Array; modifiers: Uint8Array } | null {
  const n = bytes.length;
  let p = 0;
  while (p < n && isCSpace(bytes[p]!)) p++;
  if (p >= n) {
    return null;
  }
  const start = bytes[p++]!;
  if (isDigit(start) || isAsciiAlpha(start) || start === BACKSLASH || start === 0) {
    return null;
  }
  const pairs: Record<number, number> = { 0x28: 0x29, 0x5b: 0x5d, 0x7b: 0x7d, 0x3c: 0x3e };
  const end = pairs[start] ?? start;
  let pp = p;
  let brackets = 1;
  while (pp < n) {
    const c = bytes[pp]!;
    if (c === BACKSLASH && pp + 1 < n) {
      pp++;
    } else if (c === end && (start === end || --brackets <= 0)) {
      break;
    } else if (c === start && start !== end) {
      brackets++;
    }
    pp++;
  }
  if (pp >= n) {
    return null;
  }
  return { body: bytes.subarray(p, pp), modifiers: bytes.subarray(pp + 1) };
}

/** The modifiers, or null for one PHP does not know; `x U J n r` throw the limit once all are known. */
function modifiers(fn: string, bytes: Uint8Array): Modifiers | null {
  const set = new Set<string>();
  for (const c of bytes) {
    const letter = String.fromCharCode(c);
    if (c === 0x20 || c === 0x0a || c === 0x0d) {
      continue;
    }
    if (!"imnsxADrSXUuJ".includes(letter) || c === 0) {
      return null;
    }
    set.add(letter);
  }
  for (const letter of ["x", "U", "J", "n", "r"]) {
    if (set.has(letter)) {
      throw limit(fn, `the ${letter} modifier`);
    }
  }
  return {
    caseless: set.has("i"),
    multiline: set.has("m"),
    dotall: set.has("s"),
    anchored: set.has("A"),
    dollarEndOnly: set.has("D"),
    utf: set.has("u"),
  };
}

const strictDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * PHP's pattern string converted to a `RegExp` source, or null when PHP cannot compile it (its warning is not raised,
 * DIV-9.17). A form PORTING.md § PCRE conversion does not cover throws a JS `TypeError` naming it.
 */
export function compilePattern(fn: string, pattern: string): PcrePattern | null {
  const parts = split(utf8.encode(pattern));
  if (parts === null) {
    return null;
  }
  const mods = modifiers(fn, parts.modifiers);
  if (mods === null) {
    return null;
  }
  let cps: number[];
  if (mods.utf) {
    let body: string;
    try {
      body = strictDecoder.decode(parts.body);
    } catch {
      return null;
    }
    cps = Array.from(body, (ch) => ch.codePointAt(0)!);
  } else {
    cps = [...parts.body];
  }
  try {
    const parser = new Parser(fn, cps, mods);
    const source = emitAlternation(parser.parse());
    const flags = `du${mods.caseless ? "i" : ""}`;
    const search = new RegExp(source, `${flags}${mods.anchored ? "y" : "g"}`);
    const names: (string | null)[] = [];
    for (let n = 0; n <= parser.groups; n++) {
      names.push(parser.names.get(n) ?? null);
    }
    return { utf: mods.utf, anchored: mods.anchored, source, flags, search, groups: parser.groups, names, phpOf: parser.phpOf };
  } catch (error) {
    if (error === COMPILE_FAILURE || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

/** The bytes as a string of one code unit per byte. */
function byteString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

/** `subject` prepared for `pattern`: its bytes without `u`, itself with `u`. */
export function pcreSubject(fn: string, pattern: PcrePattern, subject: string): PcreSubject {
  const bytes = utf8.encode(subject);
  if (!pattern.utf) {
    return {
      text: byteString(bytes),
      byteLength: bytes.length,
      byteOffset: (index) => index,
      indexOf: (byte) => byte,
      next: (index) => index + 1,
      characters: (index) => index,
      slice: (start, end) => decodeResult(fn, bytes.subarray(start, end)),
      bytes: (start, end) => bytes.subarray(start, end),
    };
  }
  // Each JS index's byte offset and code-point count, built once per call.
  const offsets: number[] = Array.from({ length: subject.length + 1 }, () => 0);
  const counts: number[] = Array.from({ length: subject.length + 1 }, () => 0);
  let byte = 0;
  let count = 0;
  for (let i = 0; i < subject.length; i++) {
    offsets[i] = byte;
    counts[i] = count;
    const c = subject.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < subject.length) {
      offsets[i + 1] = byte;
      counts[i + 1] = count;
      byte += 4;
      i++;
    } else {
      byte += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    count++;
  }
  offsets[subject.length] = byte;
  counts[subject.length] = count;
  return {
    text: subject,
    byteLength: bytes.length,
    byteOffset: (index) => offsets[index]!,
    indexOf: (target) => {
      if (target === bytes.length) {
        return subject.length;
      }
      if ((bytes[target]! & 0xc0) === 0x80) {
        return null;
      }
      let low = 0;
      let high = subject.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (offsets[mid]! < target) low = mid + 1;
        else high = mid;
      }
      return low;
    },
    next: (index) => {
      const c = subject.charCodeAt(index);
      return c >= 0xd800 && c <= 0xdbff && index + 1 < subject.length ? index + 2 : index + 1;
    },
    characters: (index) => counts[index]!,
    slice: (start, end) => subject.slice(start, end),
    bytes: (start, end) => bytes.subarray(offsets[start]!, offsets[end]!),
  };
}

/** The `RegExp` that searches from an index (sticky under `A`). */
export function searchRegExp(pattern: PcrePattern): RegExp {
  pattern.search.lastIndex = 0;
  return pattern.search;
}

/**
 * The match at JS index `index`. `notEmpty` is PHP's retry after an empty match (`PCRE2_NOTEMPTY_ATSTART |
 * PCRE2_ANCHORED`): a match anchored at `index` that does not end there, compiled for that index.
 */
export function pcreExec(pattern: PcrePattern, subject: PcreSubject, search: RegExp, index: number, notEmpty: boolean): PcreMatch | null {
  let regex = search;
  if (notEmpty) {
    regex = new RegExp(`(?:${pattern.source})(?<!^[\\s\\S]{${subject.characters(index)}})`, `${pattern.flags}y`);
  }
  regex.lastIndex = index;
  const found = regex.exec(subject.text);
  if (found === null) {
    return null;
  }
  const indices = found.indices!;
  const starts: number[] = Array.from({ length: pattern.groups + 1 }, () => -1);
  const ends: number[] = Array.from({ length: pattern.groups + 1 }, () => -1);
  let count = 1;
  for (let k = 0; k < indices.length; k++) {
    const pair = indices[k];
    const number = pattern.phpOf[k]!;
    if (pair !== undefined && starts[number] === -1) {
      starts[number] = pair[0];
      ends[number] = pair[1];
      count = Math.max(count, number + 1);
    }
  }
  return { starts, ends, count };
}
