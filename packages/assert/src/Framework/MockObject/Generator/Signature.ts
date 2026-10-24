// Declared signatures for PHPUnit's test doubles (Story 9.11; ESC-4.7-1 item 2, ESC-4.8-1 item 1, DIV-6.4).
// Internal to the grader.
//
// JS has no PHP types or default values, so a doubled method reads its declared signature through the signature
// lookup protocol: `globalThis[Symbol.for('xaravel.api.signature')]`, when it is a function, is
// `(fqcn, member) => row | null`, where `row` is the method's line in `conformance/api-surface/*.jsonl`
// (`parameters[{name, type, nullable, default, optional, variadic, byRef}]`, `returns`, `nullable`). A row exists
// only for a method's declaring class, so the lookup is asked for that class's FQCN. It is read at call time and
// never cached, as Mockery's `SafeDefaultResolver.signatureOf` reads it. With no lookup, or no row, the double keeps
// DIV-6.4's rule: names from the JS source, `null` defaults, a `null` return.
//
// A row's `default` is PHP source text. `evaluateDefault` evaluates the forms the committed surface uses: `null`,
// `true`, `false`, ints (decimal, hex, binary or octal, `_` allowed; a `bigint` outside the safe range), floats (plain numbers: the grader cannot make the
// runtime's float marker, AD-2, so an integral one reads as an int; DIV-9.4), single-quoted strings, double-quoted
// strings with PHP's simple escapes and no `$`, list arrays of these, and the constants `INF`, `PHP_EOL`,
// `PHP_INT_MAX`, `SORT_REGULAR`, `MB_CASE_FOLD` and `E_DEPRECATED`. Anything else (a keyed array, a class constant,
// an enum case, `new …`) is not evaluated: the caller throws only when that argument is actually omitted.
//
// Class names in a return type resolve through `globalThis[Symbol.for('xaravel.class.lookup')]` (Mockery's
// `support/classes.ts` protocol): `(name) => class | contract token | null`, the name without a leading `\`. An
// object it returns counts only when it is a contract token (`isContractToken`).
import { isContractToken } from "./ContractParents";

const SIGNATURE = Symbol.for("xaravel.api.signature");
const CLASS_LOOKUP = Symbol.for("xaravel.class.lookup");

/** One parameter of a surface row. */
export interface SignatureParameter {
  readonly name: string;
  readonly type: string | null;
  readonly nullable: boolean;
  /** PHP source text of the default, or null when there is none. */
  readonly default: string | null;
  readonly optional: boolean;
  readonly variadic: boolean;
  readonly byRef: boolean;
}

/** The part of a `kind: "method"` surface row a double reads. */
export interface SignatureRow {
  readonly parameters: readonly SignatureParameter[];
  /** PHP's type string, or null when untyped. */
  readonly returns: string | null;
  readonly nullable: boolean;
}

function parameterOf(value: unknown): SignatureParameter | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (typeof item["name"] !== "string") {
    return null;
  }
  return {
    name: item["name"],
    type: typeof item["type"] === "string" ? item["type"] : null,
    nullable: item["nullable"] === true,
    default: typeof item["default"] === "string" ? item["default"] : null,
    optional: item["optional"] === true,
    variadic: item["variadic"] === true,
    byRef: item["byRef"] === true,
  };
}

/** The declared signature of `fqcn::member`, or null with no lookup or no row; read at each call, never cached. */
export function signatureOf(fqcn: string | null, member: string): SignatureRow | null {
  if (fqcn === null) {
    return null;
  }
  const lookup: unknown = (globalThis as Record<symbol, unknown>)[SIGNATURE];
  if (typeof lookup !== "function") {
    return null;
  }
  const row: unknown = (lookup as (fqcn: string, member: string) => unknown)(fqcn, member);
  if (typeof row !== "object" || row === null) {
    return null;
  }
  const raw = row as Record<string, unknown>;
  const parameters: SignatureParameter[] = [];
  if (Array.isArray(raw["parameters"])) {
    for (const item of raw["parameters"] as unknown[]) {
      const parameter = parameterOf(item);
      if (parameter === null) {
        return null;
      }
      parameters.push(parameter);
    }
  }
  return { parameters, returns: typeof raw["returns"] === "string" ? raw["returns"] : null, nullable: raw["nullable"] === true };
}

/** Whether the class-lookup protocol is installed. */
export function hasClassLookup(): boolean {
  return typeof (globalThis as Record<symbol, unknown>)[CLASS_LOOKUP] === "function";
}

/** The class or contract token the class-lookup protocol resolves `name` to, or null. */
export function lookupClass(name: string): unknown {
  const lookup: unknown = (globalThis as Record<symbol, unknown>)[CLASS_LOOKUP];
  if (typeof lookup !== "function") {
    return null;
  }
  const found: unknown = (lookup as (name: string) => unknown)(name.replace(/^\\/, ""));
  if (typeof found === "function" || typeof found === "symbol") {
    return found;
  }
  return isContractToken(found) ? found : null;
}

// ---------------------------------------------------------------------------
// Default values

const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);

/** The PHP constants the committed surface uses as defaults, with PHP 8.5's values. */
const CONSTANTS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["INF", Number.POSITIVE_INFINITY],
  ["PHP_EOL", "\n"],
  ["PHP_INT_MAX", 9223372036854775807n],
  ["SORT_REGULAR", 0],
  ["MB_CASE_FOLD", 3],
  ["E_DEPRECATED", 8192],
]);

/** PHP int literals: decimal, `0x` hex, `0b` binary, `0o` or leading-`0` octal, with `_` separators. */
const INT = /^-?(?:0[xX][0-9a-fA-F]+(?:_[0-9a-fA-F]+)*|0[bB][01]+(?:_[01]+)*|0[oO][0-7]+(?:_[0-7]+)*|0(?:_?[0-7]+)*|[1-9][0-9]*(?:_[0-9]+)*)$/;
const FLOAT = /^-?(?:\d+\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)$/;
const DOUBLE_ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t", r: "\r", v: "\v", e: "\x1b", f: "\f", "\\": "\\", $: "$", '"': '"' };

/** Unevaluable: a default text this module does not evaluate. */
const UNEVALUABLE: unique symbol = Symbol("unevaluable");

class Reader {
  index = 0;

  constructor(readonly text: string) {}

  skipSpace(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index]!)) {
      this.index++;
    }
  }

  value(): unknown {
    this.skipSpace();
    const char = this.text[this.index];
    if (char === "'") {
      return this.single();
    }
    if (char === '"') {
      return this.double();
    }
    if (char === "[") {
      return this.list();
    }
    const match = /^[^,\]\s]+/.exec(this.text.slice(this.index));
    if (match === null) {
      return UNEVALUABLE;
    }
    this.index += match[0].length;
    return scalar(match[0]);
  }

  private single(): unknown {
    let out = "";
    for (this.index++; this.index < this.text.length; this.index++) {
      const char = this.text[this.index]!;
      if (char === "'") {
        this.index++;
        return out;
      }
      if (char === "\\" && (this.text[this.index + 1] === "\\" || this.text[this.index + 1] === "'")) {
        this.index++;
        out += this.text[this.index]!;
      } else {
        out += char;
      }
    }
    return UNEVALUABLE;
  }

  private double(): unknown {
    let out = "";
    for (this.index++; this.index < this.text.length; this.index++) {
      const char = this.text[this.index]!;
      if (char === '"') {
        this.index++;
        return out;
      }
      if (char === "$") {
        return UNEVALUABLE;
      }
      if (char === "\\") {
        const next = this.text[this.index + 1];
        if (next === undefined) {
          return UNEVALUABLE;
        }
        const escaped = DOUBLE_ESCAPES[next];
        if (escaped === undefined) {
          // An octal, hex or unicode escape: not one of PHP's simple ones.
          if (/[0-7xu]/.test(next)) {
            return UNEVALUABLE;
          }
          out += char;
        } else {
          out += escaped;
          this.index++;
        }
      } else {
        out += char;
      }
    }
    return UNEVALUABLE;
  }

  private list(): unknown {
    const items: unknown[] = [];
    this.index++;
    this.skipSpace();
    if (this.text[this.index] === "]") {
      this.index++;
      return items;
    }
    for (;;) {
      const item = this.value();
      if (item === UNEVALUABLE) {
        return UNEVALUABLE;
      }
      items.push(item);
      this.skipSpace();
      const char = this.text[this.index];
      this.index++;
      if (char === "]") {
        return items;
      }
      if (char !== ",") {
        // `=>` (a keyed array) or anything else.
        return UNEVALUABLE;
      }
    }
  }
}

/** A PHP int literal's value (`0755` is octal 493, as PHP reads it). */
function intLiteral(token: string): bigint {
  const negative = token.startsWith("-");
  const digits = (negative ? token.slice(1) : token).replace(/_/g, "");
  let value: bigint;
  if (/^0[xXbBoO]/.test(digits)) {
    value = BigInt(digits.toLowerCase());
  } else if (digits.length > 1 && digits.startsWith("0")) {
    value = BigInt(`0o${digits.slice(1)}`);
  } else {
    value = BigInt(digits);
  }
  return negative ? -value : value;
}

function scalar(token: string): unknown {
  const lower = token.toLowerCase();
  if (lower === "null") {
    return null;
  }
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  if (INT.test(token)) {
    const big = intLiteral(token);
    return big >= SAFE_MIN && big <= SAFE_MAX ? Number(big) : big;
  }
  if (FLOAT.test(token)) {
    return Number(token);
  }
  const constant = token.replace(/^\\/, "");
  return CONSTANTS.has(constant) ? CONSTANTS.get(constant) : UNEVALUABLE;
}

/** A default's PHP source text, evaluated: `{ value }`, or null when this module does not evaluate it. */
export function evaluateDefault(text: string): { readonly value: unknown } | null {
  const reader = new Reader(text);
  const value = reader.value();
  reader.skipSpace();
  if (value === UNEVALUABLE || reader.index !== text.length) {
    return null;
  }
  return { value };
}
