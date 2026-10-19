// The singleton and boot-only-state scan (Story 3.6; Story 6.3's singleton
// lint and AD-5's sealed-write guard read it).
//
//   bun tools/scans/singletons.ts [--check] [--root <dir>]
//       reads `conformance/upstream/` only (it runs no PHP and no container) and writes
//       `tools/lint-rules/singletons.json` and `conformance/boot-only-state`.
//
// Singletons. A provider is an indexed class whose `extends` chain reaches
// `Illuminate\Support\ServiceProvider`. A binding comes from a
// `->singleton(` / `->singletonIf(` call anywhere in a provider's methods
// (closures included), or from an entry of its `$singletons` property, and is
// `{"provider","abstract","class"}`:
//   - `abstract` is the first argument: a string literal, or the resolved FQCN
//     of `X::class`. A variable is resolved only by the foreach rule: it is the
//     value variable of an enclosing `foreach ($param as … => $var)` whose
//     `$param` is a parameter of the enclosing method M; every `$this->M(` in
//     the class passes `$this->prop` or `array_merge($this->p1, …)`; each such
//     property's array values are `X::class`; each X gives abstract = class = X.
//   - `class` is the second argument's FQCN for `X::class` (or a keyed
//     `$singletons` value); the abstract, when there is no second argument (or
//     an unkeyed `$singletons` value) and the abstract is a non-abstract
//     indexed class (an interface, an abstract class or an unindexed FQCN gives
//     null); for a closure, its declared return type when that is a single
//     class name, else X when every `return` / `fn` body expression at the
//     closure's own depth builds the same X as `new X(…)`, `(new X(…))->m(…)…`
//     (each m declared in X's indexed hierarchy, its body ending
//     `return $this;`), `tap(new X(…), …)`, or `$v` whose only assignment at
//     the closure's own depth is `new X(…)`; otherwise null (ESC-3.6-1). The
//     run prints each null binding (provider, abstract, file:line) for review.
// Any other argument shape, an unresolved call, or a foreach-rule X that is
// not indexed fails the run, naming file:line. `singletons.json` is
// `{"comment","bindings","classes","bootOnly"}`; `bootOnly` is one
// `{"property":"<FQCN>::$<p>","writers":[…]}` per boot-only property, sorted
// by property.
//
// Boot-only state (ESC-3.6-1). For each bound class C: C's methods with those
// of its indexed ancestors and of the traits they use, transitively. A target
// is `$this->P`, or `static::$P` / `self::$P` / `parent::$P` / `ClassName::$P`
// for ClassName in that set, followed by any `[…]` / `->x` chain. A write is a
// target followed by `=`, a compound assignment, `++` or `--`, or preceded by
// `++` / `--`; an `unset(` of a target; a target inside a `list(…)` / `[…]`
// destructuring on the left of `=`; `&` directly before a target; or a target
// as the first argument of a by-reference built-in (`array_pop`, `sort`, …).
// A write (or a call) inside a closure, an arrow function or an anonymous
// class nested in a method is a runtime one, not the method's. Construction
// methods are `__construct` and the methods whose every caller (other than
// themselves) is construction, with at least one caller; their writes are
// excluded. The boot entry points are the top-level (outside any closure)
// calls of every provider's `register()` / `boot()` and of the provider methods
// they reach by top-level `$this->m(`, transitively. A boot entry call `->m(` /
// `::m(` seeds method m of class C only when its receiver resolves to C
// (Story 6.3): `F::m(` where F (through `use`) is a facade (a line of
// `conformance/scans/facades.jsonl`, or another indexed class whose `extends`
// chain reaches `Facade` with a literal accessor) whose accessor is bound to C
// or is C; `X::m(` with X resolving to C; `$this->app->make(K)->m(`,
// `$this->app[K]->m(`, `app(K)->m(` or `resolve(K)->m(` with K a string
// literal or `Y::class` bound to C or equal to C. Any other receiver seeds
// nothing. A method of C is boot-reachable when it is seeded, or when it has
// callers within C's methods (`$this->name(`, `static::name(`, `self::name(`)
// other than itself and each is boot-reachable or construction (a fixed
// point). Method names compare case-insensitively. P is boot-only when it has
// a non-construction write and every method writing it is boot-reachable; its
// writers (those non-construction methods, lower-case) are listed with it in
// `singletons.json` `bootOnly`, the register/boot path Story 6.3's
// `no-boot-only-write` lint allows.
//
//   … --check
//       builds both files in memory and compares them byte for byte with the
//       committed ones: a `singletons drift: <file> …` line per differing or
//       missing file. It writes nothing.
//
// Exit codes: 0 pass, 1 any failure (nothing is written), 2 usage error.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareUnits, renderJson } from "../oracle/request";
import { accessorOf, FACADE_BASE, FACADES_FILE, runScan } from "./facades";
import {
  ancestors,
  buildIndex,
  codeRange,
  COMPOUND_ASSIGNMENTS,
  extendsChainReaches,
  isBuiltinType,
  matching,
  resolveName,
  ScanError,
  type Declaration,
  type Index,
  type Method,
  type Token,
} from "./php";

export const SINGLETONS_FILE = "tools/lint-rules/singletons.json";
export const BOOT_ONLY_FILE = "conformance/boot-only-state";
export const SERVICE_PROVIDER = "Illuminate\\Support\\ServiceProvider";

export interface Binding {
  provider: string;
  abstract: string;
  class: string | null;
}

export interface SingletonsResult {
  /** The text of `tools/lint-rules/singletons.json`. */
  singletons: string;
  /** The text of `conformance/boot-only-state`. */
  bootOnlyState: string;
  bindings: Binding[];
  classes: string[];
  bootOnly: string[];
  /** Each boot-only property with its writers, sorted by property (the `bootOnly` of `singletons.json`). */
  writers: BootOnly[];
  /** One line per null binding, `<provider> <abstract> (<file>:<line>)`, in binding order, for review. */
  unresolved: string[];
}

/** A run of code tokens: indexes into `tokens`. */
type Run = number[];

/** A view over one declaration's code tokens. */
class Code {
  readonly tokens: readonly Token[];
  readonly decl: Declaration;

  constructor(decl: Declaration) {
    this.decl = decl;
    this.tokens = decl.tokens;
  }

  tok(index: number): Token {
    return this.tokens[index]!;
  }

  where(index: number): string {
    return `${this.decl.file}:${this.tokens[index]?.line ?? this.decl.line}`;
  }

  fail(index: number, message: string): never {
    throw new ScanError(`${this.where(index)}: ${message}`);
  }

  /** The code tokens of `[start, end)`. */
  run(start: number, end: number): Run {
    return codeRange(this.tokens, start, end);
  }

  /** The index after the bracket matching the one at token index `open`. */
  close(open: number): number {
    return matching(this.tokens, open, this.decl.file);
  }

  /** Splits the code tokens strictly inside the bracket at `open` into top-level comma-separated runs (empty runs dropped). */
  args(open: number): Run[] {
    const end = this.close(open) - 1;
    const out: Run[] = [];
    let current: Run = [];
    const inner = this.run(open + 1, end);
    for (let k = 0; k < inner.length; k++) {
      const index = inner[k]!;
      const t = this.tok(index);
      if (isOpener(t)) {
        const after = this.close(index);
        while (k < inner.length && inner[k]! < after) {
          current.push(inner[k]!);
          k++;
        }
        k--;
        continue;
      }
      if (t.kind === "punct" && t.text === ",") {
        out.push(current);
        current = [];
        continue;
      }
      current.push(index);
    }
    out.push(current);
    return out.filter((run) => run.length > 0);
  }

  resolve(name: string): string {
    return resolveName(name, this.decl.scope);
  }

  /** `X::class` as a resolved FQCN, or null for another shape. */
  classConstant(run: Run): string | null {
    if (run.length !== 3) {
      return null;
    }
    const [a, b, c] = run.map((index) => this.tok(index));
    if (a!.kind !== "name" || b!.text !== "::" || c!.text.toLowerCase() !== "class") {
      return null;
    }
    const lower = a!.text.toLowerCase();
    if (lower === "self" || lower === "static" || lower === "parent") {
      return null;
    }
    return this.resolve(a!.text);
  }

  /** A non-interpolated string literal's value, or null. */
  stringLiteral(run: Run): string | null {
    if (run.length !== 1) {
      return null;
    }
    const t = this.tok(run[0]!);
    return t.kind === "string" && typeof t.value === "string" ? t.value : null;
  }
}

function isOpener(t: Token): boolean {
  return t.kind === "punct" && (t.text === "(" || t.text === "[" || t.text === "{");
}

function isCloser(t: Token): boolean {
  return t.kind === "punct" && (t.text === ")" || t.text === "]" || t.text === "}");
}

/** The position in `run` of token index `index` (which must be in it). */
function positionOf(run: Run, index: number): number {
  return run.indexOf(index);
}

/** The method containing token index `index`, or null. */
function methodAt(decl: Declaration, index: number): Method | null {
  return decl.methods.find((m) => m.bodyStart !== -1 && m.bodyStart < index && index < m.end) ?? null;
}

// ---------------------------------------------------------------------------
// Nesting

/** A token-index range `[start, end)`. */
type Range = readonly [number, number];

/**
 * The token ranges of the closures, arrow functions and anonymous classes in
 * `run` (outermost only). Code in them runs later, not at the depth of `run`.
 */
function nestedRanges(code: Code, run: Run): Range[] {
  const out: Range[] = [];
  const text = (at: number): string => (at < run.length ? code.tok(run[at]!).text.toLowerCase() : "");
  /** The position after the bracket at position `at`. */
  const after = (at: number): number => positionOf(run, code.close(run[at]!) - 1) + 1;
  for (let k = 0; k < run.length; k++) {
    const t = code.tok(run[k]!);
    if (t.kind !== "name") {
      continue;
    }
    const lower = t.text.toLowerCase();
    const prev = k > 0 ? code.tok(run[k - 1]!).text.toLowerCase() : "";
    if (prev === "->" || prev === "?->" || prev === "::") {
      continue;
    }
    let end = -1;
    if (lower === "function" || lower === "fn") {
      let m = k + 1;
      if (text(m) === "&") {
        m++;
      }
      if (text(m) !== "(") {
        continue;
      }
      m = after(m);
      if (lower === "function") {
        if (text(m) === "use" && text(m + 1) === "(") {
          m = after(m + 1);
        }
        while (m < run.length && text(m) !== "{") {
          m++;
        }
        if (m >= run.length) {
          continue;
        }
        end = after(m);
      } else {
        while (m < run.length && text(m) !== "=>") {
          m++;
        }
        m++;
        while (m < run.length) {
          const u = code.tok(run[m]!);
          if (isOpener(u)) {
            m = after(m);
            continue;
          }
          if (isCloser(u) || (u.kind === "punct" && (u.text === "," || u.text === ";"))) {
            break;
          }
          m++;
        }
        end = m;
      }
    } else if (lower === "class" && prev === "new") {
      let m = k + 1;
      while (m < run.length && text(m) !== "{") {
        if (text(m) === "(") {
          m = after(m);
          continue;
        }
        m++;
      }
      if (m >= run.length) {
        continue;
      }
      end = after(m);
    } else {
      continue;
    }
    const last = end < run.length ? run[end]! : run[run.length - 1]! + 1;
    out.push([run[k]!, last]);
    k = end - 1;
  }
  return out;
}

function inRanges(ranges: readonly Range[], index: number): boolean {
  return ranges.some(([start, end]) => start <= index && index < end);
}

// ---------------------------------------------------------------------------
// Closures

/** C, its indexed ancestors, and the traits they use, transitively (nearest first). */
function analysedDeclarations(index: Index, decl: Declaration): Declaration[] {
  const out: Declaration[] = [];
  const seen = new Set<string>();
  const visit = (current: Declaration): void => {
    if (seen.has(current.fqcn)) {
      return;
    }
    seen.add(current.fqcn);
    out.push(current);
    for (const trait of current.traits) {
      const found = index.byFqcn.get(trait);
      if (found !== undefined) {
        visit(found);
      }
    }
  };
  for (const current of [decl, ...ancestors(index, decl)]) {
    visit(current);
  }
  return out;
}

/** Whether `name` is declared in X's indexed hierarchy and the nearest declaration's body ends `return $this;`. */
function returnsThis(index: Index, fqcn: string, name: string): boolean {
  const decl = index.byFqcn.get(fqcn);
  if (decl === undefined) {
    return false;
  }
  const lower = name.toLowerCase();
  for (const owner of analysedDeclarations(index, decl)) {
    const method = owner.methods.find((m) => m.name.toLowerCase() === lower);
    if (method === undefined) {
      continue;
    }
    if (method.bodyStart === -1) {
      return false;
    }
    const body = codeRange(owner.tokens, method.bodyStart, method.end).map((at) => owner.tokens[at]!.text);
    return body.length >= 5 && body.slice(-4).join(" ").toLowerCase() === "return $this ; }";
  }
  return false;
}

/** The class a closure argument builds, or null; undefined when `run` is not a closure. */
function closureClass(index: Index, code: Code, run: Run): string | null | undefined {
  let k = 0;
  const text = (at: number): string => (at < run.length ? code.tok(run[at]!).text.toLowerCase() : "");
  if (text(k) === "static") {
    k++;
  }
  const keyword = text(k);
  if (keyword !== "function" && keyword !== "fn") {
    return undefined;
  }
  k++;
  if (text(k) === "&") {
    k++;
  }
  if (text(k) !== "(") {
    return undefined;
  }
  const afterParams = code.close(run[k]!);
  k = positionOf(run, afterParams - 1) + 1;
  if (keyword === "function" && text(k) === "use") {
    k = positionOf(run, code.close(run[k + 1]!) - 1) + 1;
  }
  const typeTokens: Token[] = [];
  if (text(k) === ":") {
    k++;
    while (k < run.length && text(k) !== "{" && text(k) !== "=>") {
      typeTokens.push(code.tok(run[k]!));
      k++;
    }
  }
  if (typeTokens.length === 1 && typeTokens[0]!.kind === "name" && !isBuiltinType(typeTokens[0]!.text)) {
    return code.resolve(typeTokens[0]!.text);
  }
  const expressions: Run[] = [];
  let body: Run | null = null;
  if (keyword === "fn") {
    if (text(k) !== "=>") {
      return code.fail(run[0]!, "malformed arrow function");
    }
    expressions.push(run.slice(k + 1));
  } else {
    if (text(k) !== "{" || code.close(run[k]!) - 1 !== run[run.length - 1]) {
      return code.fail(run[0]!, "malformed closure");
    }
    body = run.slice(k + 1, -1);
    expressions.push(...returnExpressions(code, body));
  }
  let found: string | null = null;
  for (const expression of expressions) {
    const built = builtClass(index, code, expression, body);
    if (built === null || (found !== null && found !== built)) {
      return null;
    }
    found = built;
  }
  return found;
}

/** Collects the tokens of one expression from position `m` of `body` up to (not including) a top-level `;`. */
function expressionAt(code: Code, body: Run, m: number): { expression: Run; end: number } {
  const expression: Run = [];
  while (m < body.length && code.tok(body[m]!).text !== ";") {
    const u = code.tok(body[m]!);
    if (isOpener(u)) {
      const after = code.close(body[m]!);
      while (m < body.length && body[m]! < after) {
        expression.push(body[m]!);
        m++;
      }
      continue;
    }
    expression.push(body[m]!);
    m++;
  }
  return { expression, end: m };
}

/** The expressions of the `return` statements in `body` at its own depth (nested closures and anonymous classes skipped). */
function returnExpressions(code: Code, body: Run): Run[] {
  const nested = nestedRanges(code, body);
  const out: Run[] = [];
  for (let k = 0; k < body.length; k++) {
    if (inRanges(nested, body[k]!)) {
      continue;
    }
    const t = code.tok(body[k]!);
    if (t.kind === "name" && t.text.toLowerCase() === "return") {
      const { expression, end } = expressionAt(code, body, k + 1);
      out.push(expression);
      k = end;
    }
  }
  return out;
}

/**
 * The class X an expression builds: `new X(…)`; `(new X(…))->m(…)…` with each
 * m declared in X's hierarchy and returning `$this`; `tap(new X(…), …)`; or,
 * given the closure `body`, `$v` whose only assignment at its own depth is
 * `new X(…)`. Null for any other shape.
 */
function builtClass(index: Index, code: Code, expression: Run, body: Run | null): string | null {
  if (expression.length === 0) {
    return null;
  }
  const direct = newClass(code, expression);
  if (direct !== null) {
    return direct;
  }
  const first = code.tok(expression[0]!);
  // `(new X(…))->m(…)->n(…)`.
  if (first.text === "(") {
    const close = positionOf(expression, code.close(expression[0]!) - 1);
    const built = newClass(code, expression.slice(1, close));
    if (built === null || close === expression.length - 1) {
      return null;
    }
    let m = close + 1;
    while (m < expression.length) {
      const arrow = code.tok(expression[m]!);
      const name = expression[m + 1] === undefined ? null : code.tok(expression[m + 1]!);
      const open = expression[m + 2] === undefined ? null : code.tok(expression[m + 2]!);
      if (arrow.text !== "->" || name === null || name.kind !== "name" || open === null || open.text !== "(" || !returnsThis(index, built, name.text)) {
        return null;
      }
      m = positionOf(expression, code.close(expression[m + 2]!) - 1) + 1;
    }
    return built;
  }
  // `tap(new X(…), …)`.
  if (first.kind === "name" && first.text.replace(/^\\/, "").toLowerCase() === "tap" && expression.length > 1 && code.tok(expression[1]!).text === "(") {
    if (code.close(expression[1]!) - 1 !== expression[expression.length - 1]) {
      return null;
    }
    const args = code.args(expression[1]!);
    return args.length >= 1 ? newClass(code, args[0]!) : null;
  }
  // `$v`, assigned once at the closure's own depth.
  if (expression.length === 1 && first.kind === "variable" && first.text !== "$this" && body !== null) {
    const nested = nestedRanges(code, body);
    const assignments: number[] = [];
    for (let k = 0; k + 1 < body.length; k++) {
      const t = code.tok(body[k]!);
      if (t.kind !== "variable" || t.text !== first.text || inRanges(nested, body[k]!)) {
        continue;
      }
      const op = code.tok(body[k + 1]!).text;
      if (op === "=" || COMPOUND_ASSIGNMENTS.has(op)) {
        assignments.push(k);
      }
    }
    if (assignments.length !== 1 || code.tok(body[assignments[0]! + 1]!).text !== "=") {
      return null;
    }
    return newClass(code, expressionAt(code, body, assignments[0]! + 2).expression);
  }
  return null;
}

/** The class of an expression that is exactly `new X` or `new X(…)`, or null. */
function newClass(code: Code, expression: Run): string | null {
  if (expression.length < 2 || code.tok(expression[0]!).text.toLowerCase() !== "new") {
    return null;
  }
  const name = code.tok(expression[1]!);
  if (name.kind !== "name" || isBuiltinType(name.text) || name.text.toLowerCase() === "class") {
    return null;
  }
  if (expression.length === 2) {
    return code.resolve(name.text);
  }
  if (code.tok(expression[2]!).text === "(" && code.close(expression[2]!) - 1 === expression[expression.length - 1]) {
    return code.resolve(name.text);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bindings

/** The entries of an array literal property. */
function arrayEntries(code: Code, valueStart: number, what: string): { key: Run | null; value: Run }[] {
  const open = valueStart;
  const t = code.tok(open);
  let bracket = open;
  if (t.kind === "name" && t.text.toLowerCase() === "array") {
    bracket = code.run(open + 1, code.tokens.length)[0]!;
  }
  if (code.tok(bracket).text !== "[" && code.tok(bracket).text !== "(") {
    return code.fail(open, `${what} is not an array literal`);
  }
  return code.args(bracket).map((entry) => {
    const arrow = entry.findIndex((index) => code.tok(index).text === "=>");
    return arrow === -1 ? { key: null, value: entry } : { key: entry.slice(0, arrow), value: entry.slice(arrow + 1) };
  });
}

/** The property `name` declared by `decl` or its nearest indexed ancestor. */
function findProperty(index: Index, decl: Declaration, name: string): { decl: Declaration; valueStart: number } | null {
  for (const owner of [decl, ...ancestors(index, decl)]) {
    const property = owner.properties.find((p) => p.name === name);
    if (property !== undefined) {
      return { decl: owner, valueStart: property.valueStart };
    }
  }
  return null;
}

/** The classes the foreach rule yields for the variable abstract at `at`, or fails. */
function foreachClasses(index: Index, code: Code, at: number): string[] {
  const variable = code.tok(at).text;
  const method = methodAt(code.decl, at);
  if (method === null) {
    return code.fail(at, `singleton(${variable}): the abstract is a variable outside a method`);
  }
  const body = code.run(method.bodyStart, method.end);
  let param: string | null = null;
  for (let k = 0; k < body.length; k++) {
    if (code.tok(body[k]!).text.toLowerCase() !== "foreach" || code.tok(body[k + 1]!).text !== "(") {
      continue;
    }
    const headerEnd = code.close(body[k + 1]!);
    const header = code.run(body[k + 1]! + 1, headerEnd - 1);
    const asAt = header.findIndex((index) => code.tok(index).text.toLowerCase() === "as");
    const last = header[header.length - 1];
    if (asAt !== 1 || last === undefined || code.tok(last).text !== variable || code.tok(header[0]!).kind !== "variable") {
      continue;
    }
    // The body is the `{…}` after the header.
    const next = code.run(headerEnd, method.end)[0];
    if (next === undefined || code.tok(next).text !== "{") {
      continue;
    }
    if (next < at && at < code.close(next)) {
      param = code.tok(header[0]!).text.slice(1);
    }
  }
  if (param === null || !method.parameters.includes(param)) {
    return code.fail(at, `singleton(${variable}): the abstract is a variable the foreach rule does not resolve`);
  }
  // Every `$this->M(` call in the class passes `$this->prop` or `array_merge($this->p1, …)`.
  const props: string[] = [];
  let calls = 0;
  for (const caller of code.decl.methods) {
    if (caller.bodyStart === -1) {
      continue;
    }
    const run = code.run(caller.bodyStart, caller.end);
    for (let k = 0; k + 3 < run.length; k++) {
      const [a, b, c, d] = [run[k]!, run[k + 1]!, run[k + 2]!, run[k + 3]!].map((index) => code.tok(index));
      if (a!.text !== "$this" || b!.text !== "->" || c!.text !== method.name || d!.text !== "(") {
        continue;
      }
      calls++;
      const first = code.args(run[k + 3]!)[0] ?? [];
      const thisProp = (part: Run): string | null =>
        part.length === 3 && code.tok(part[0]!).text === "$this" && code.tok(part[1]!).text === "->" && code.tok(part[2]!).kind === "name" ? code.tok(part[2]!).text : null;
      const single = thisProp(first);
      if (single !== null) {
        props.push(single);
        continue;
      }
      if (first.length >= 3 && code.tok(first[0]!).text.toLowerCase() === "array_merge" && code.tok(first[1]!).text === "(" && code.close(first[1]!) - 1 === first[first.length - 1]) {
        const parts = code.args(first[1]!).map(thisProp);
        if (parts.length > 0 && parts.every((part) => part !== null)) {
          props.push(...(parts as string[]));
          continue;
        }
      }
      code.fail(run[k]!, `$this->${method.name}( does not pass $this->prop or array_merge($this->p1, …)`);
    }
  }
  if (calls === 0) {
    return code.fail(at, `singleton(${variable}): ${method.name}() is never called as $this->${method.name}(`);
  }
  const out: string[] = [];
  for (const name of props) {
    const property = findProperty(index, code.decl, name);
    if (property === null || property.valueStart === -1) {
      return code.fail(at, `singleton(${variable}): property $${name} has no array value`);
    }
    const owner = new Code(property.decl);
    for (const { value } of arrayEntries(owner, property.valueStart, `$${name}`)) {
      const fqcn = owner.classConstant(value);
      if (fqcn === null) {
        return owner.fail(value[0]!, `$${name}: a value is not X::class`);
      }
      out.push(fqcn);
    }
  }
  return out;
}

function requireIndexed(index: Index, code: Code, at: number, fqcn: string | null): void {
  if (fqcn !== null && !index.byFqcn.has(fqcn)) {
    code.fail(at, `${fqcn} is not an indexed class`);
  }
}

/** The abstract itself when it is a non-abstract indexed class; null for an interface, an abstract class or an unindexed FQCN. */
function concreteAbstract(index: Index, fqcn: string | null): string | null {
  if (fqcn === null) {
    return null;
  }
  const decl = index.byFqcn.get(fqcn);
  return decl !== undefined && decl.kind === "class" && !decl.abstract ? fqcn : null;
}

/** A binding with the place it was found. */
interface Found {
  binding: Binding;
  where: string;
}

/** The bindings of one provider. */
function providerBindings(index: Index, provider: Declaration): Found[] {
  const code = new Code(provider);
  const out: Found[] = [];
  const add = (at: number, abstract: string, cls: string | null): void => {
    out.push({ binding: { provider: provider.fqcn, abstract, class: cls }, where: code.where(at) });
  };
  for (const method of provider.methods) {
    if (method.bodyStart === -1) {
      continue;
    }
    const run = code.run(method.bodyStart, method.end);
    for (let k = 0; k + 2 < run.length; k++) {
      const name = code.tok(run[k + 1]!);
      const callee = name.text.toLowerCase();
      if (code.tok(run[k]!).text !== "->" || name.kind !== "name" || (callee !== "singleton" && callee !== "singletonif") || code.tok(run[k + 2]!).text !== "(") {
        continue;
      }
      const at = run[k + 1]!;
      const args = code.args(run[k + 2]!);
      if (args.length < 1 || args.length > 2) {
        code.fail(at, `${name.text}( takes ${args.length} arguments`);
      }
      const [first, second] = [args[0]!, args[1]];
      const literal = code.stringLiteral(first);
      const constant = code.classConstant(first);
      if (literal === null && constant === null) {
        if (first.length === 1 && code.tok(first[0]!).kind === "variable" && second === undefined) {
          for (const fqcn of foreachClasses(index, code, first[0]!)) {
            requireIndexed(index, code, at, fqcn);
            add(at, fqcn, fqcn);
          }
          continue;
        }
        code.fail(at, `${name.text}( has an abstract that is neither a string literal nor X::class`);
      }
      const abstract = (literal ?? constant)!;
      if (second === undefined) {
        add(at, abstract, concreteAbstract(index, constant));
        continue;
      }
      const concrete = code.classConstant(second);
      if (concrete !== null) {
        add(at, abstract, concrete);
        continue;
      }
      const built = closureClass(index, code, second);
      if (built === undefined) {
        code.fail(at, `${name.text}( has a concrete that is neither X::class nor a closure`);
      }
      add(at, abstract, built!);
    }
  }
  const property = provider.properties.find((p) => p.name === "singletons");
  if (property !== undefined && property.valueStart !== -1) {
    for (const { key, value } of arrayEntries(code, property.valueStart, "$singletons")) {
      const at = value[0]!;
      const concrete = code.classConstant(value);
      if (concrete === null) {
        code.fail(at, "a $singletons value is not X::class");
      }
      if (key === null) {
        add(at, concrete!, concreteAbstract(index, concrete));
        continue;
      }
      const keyValue = code.stringLiteral(key) ?? code.classConstant(key);
      if (keyValue === null) {
        code.fail(key[0]!, "a $singletons key is neither a string literal nor X::class");
      }
      add(at, keyValue!, concrete);
    }
  }
  return out;
}

function compareBindings(a: Binding, b: Binding): number {
  return (
    compareUnits(a.provider, b.provider) ||
    compareUnits(a.abstract, b.abstract) ||
    (a.class === b.class ? 0 : a.class === null ? -1 : b.class === null ? 1 : compareUnits(a.class, b.class))
  );
}

// ---------------------------------------------------------------------------
// Calls and writes

/** A call or write at token index `at`; `nested` when it sits in a closure, an arrow function or an anonymous class. */
interface Event {
  name: string;
  at: number;
  nested: boolean;
}

/** One method body's code tokens and nested ranges. */
interface Body {
  code: Code;
  run: Run;
  nested: Range[];
}

function bodyOf(code: Code, method: Method): Body {
  const run = code.run(method.bodyStart, method.end);
  return { code, run, nested: nestedRanges(code, run.slice(1, -1)) };
}

const RELATIVE: ReadonlySet<string> = new Set(["static", "self", "parent"]);

/**
 * The calls in a body: `->name(` / `?->name(` / `::name(` (`any`), and
 * `$this->name(` / `static::name(` / `self::name(` (`self`). `this` is the
 * `$this->name(` subset. First-class callables (`->name(...)`) are not calls.
 */
function callsOf(body: Body): { any: Event[]; self: Event[]; this: Event[] } {
  const { code, run, nested } = body;
  const out = { any: [] as Event[], self: [] as Event[], this: [] as Event[] };
  for (let k = 0; k + 2 < run.length; k++) {
    const op = code.tok(run[k]!);
    const name = code.tok(run[k + 1]!);
    if (!(op.text === "->" || op.text === "?->" || op.text === "::") || name.kind !== "name" || code.tok(run[k + 2]!).text !== "(") {
      continue;
    }
    if (run[k + 4] !== undefined && code.tok(run[k + 3]!).text === "..." && code.tok(run[k + 4]!).text === ")") {
      continue;
    }
    const event: Event = { name: name.text.toLowerCase(), at: run[k + 1]!, nested: inRanges(nested, run[k]!) };
    out.any.push(event);
    const head = k > 0 ? code.tok(run[k - 1]!) : null;
    if (head !== null && op.text === "->" && head.text === "$this") {
      out.self.push(event);
      out.this.push(event);
    } else if (head !== null && op.text === "::" && head.kind === "name" && (head.text.toLowerCase() === "static" || head.text.toLowerCase() === "self")) {
      out.self.push(event);
    }
  }
  return out;
}

/** The built-ins that take their first argument by reference. */
const BY_REFERENCE: ReadonlySet<string> = new Set([
  "array_pop", "array_push", "array_shift", "array_unshift", "array_splice",
  "sort", "rsort", "usort", "uasort", "uksort", "ksort", "krsort", "asort", "arsort", "natsort", "natcasesort", "shuffle",
]);

/** Keywords that end no value, so a following `&` or `[` starts one. */
const NON_VALUE_KEYWORDS: ReadonlySet<string> = new Set(["as", "return", "yield", "echo", "print", "and", "or", "xor", "case", "else", "throw", "use", "clone", "include", "require", "new", "instanceof"]);

/** Whether a token ends a value (so a following `&` is binary and a following `[` indexes). */
function endsValue(t: Token | null): boolean {
  if (t === null) {
    return false;
  }
  if (t.kind === "variable" || t.kind === "string" || t.kind === "number") {
    return true;
  }
  if (t.kind === "name") {
    return !NON_VALUE_KEYWORDS.has(t.text.toLowerCase());
  }
  return t.text === ")" || t.text === "]";
}

/**
 * The property of the target starting at position `k` of `run`, and the
 * position after it with its `[…]` / `->x` chain: `$this->P`, or
 * `static::$P` / `self::$P` / `parent::$P` / `ClassName::$P` for ClassName in
 * `analysed`.
 */
function writeTarget(code: Code, run: Run, k: number, analysed: ReadonlySet<string>): { property: string; after: number } | null {
  const at = (m: number): Token | null => (run[m] === undefined ? null : code.tok(run[m]!));
  const a = at(k);
  const b = at(k + 1);
  const c = at(k + 2);
  if (a === null || b === null || c === null) {
    return null;
  }
  let property: string;
  if (a.text === "$this" && b.text === "->" && c.kind === "name") {
    property = c.text;
  } else if (a.kind === "name" && b.text === "::" && c.kind === "variable" && (RELATIVE.has(a.text.toLowerCase()) || analysed.has(code.resolve(a.text)))) {
    property = c.text.slice(1);
  } else {
    return null;
  }
  if (at(k + 3)?.text === "(") {
    return null;
  }
  let m = k + 3;
  for (;;) {
    const t = at(m);
    if (t === null) {
      break;
    }
    if (t.text === "[") {
      m = positionOf(run, code.close(run[m]!) - 1) + 1;
      continue;
    }
    if ((t.text === "->" || t.text === "?->") && at(m + 1)?.kind === "name" && at(m + 2)?.text !== "(") {
      m += 2;
      continue;
    }
    break;
  }
  return { property, after: m };
}

/** The property writes in a body. */
function writesOf(body: Body, analysed: ReadonlySet<string>): Event[] {
  const { code, run, nested } = body;
  const out: Event[] = [];
  const at = (m: number): Token | null => (m < 0 || run[m] === undefined ? null : code.tok(run[m]!));
  const add = (property: string, k: number): void => {
    out.push({ name: property, at: run[k]!, nested: inRanges(nested, run[k]!) });
  };
  /** A whole run that is exactly one target. */
  const wholeTarget = (part: Run): string | null => {
    const target = writeTarget(code, part, 0, analysed);
    return target !== null && target.after === part.length ? target.property : null;
  };
  for (let k = 0; k < run.length; k++) {
    const t = code.tok(run[k]!);
    const prev = at(k - 1);
    const lower = t.text.toLowerCase();
    // `unset($this->P, …)`.
    if (t.kind === "name" && lower === "unset" && at(k + 1)?.text === "(") {
      for (const arg of code.args(run[k + 1]!)) {
        const target = writeTarget(code, arg, 0, analysed);
        if (target !== null) {
          out.push({ name: target.property, at: arg[0]!, nested: inRanges(nested, arg[0]!) });
        }
      }
      continue;
    }
    // `array_pop($this->P)` and the other by-reference built-ins.
    if (t.kind === "name" && BY_REFERENCE.has(lower.replace(/^\\/, "")) && at(k + 1)?.text === "(" && !["->", "?->", "::", "function", "new"].includes(prev?.text.toLowerCase() ?? "")) {
      const first = code.args(run[k + 1]!)[0];
      const property = first === undefined ? null : wholeTarget(first);
      if (property !== null) {
        out.push({ name: property, at: first![0]!, nested: inRanges(nested, first![0]!) });
      }
      continue;
    }
    // `[$this->P, …] = …` and `list($this->P, …) = …`.
    const listOpen = t.kind === "name" && lower === "list" && at(k + 1)?.text === "(" ? k + 1 : t.text === "[" && !endsValue(prev) ? k : -1;
    if (listOpen !== -1) {
      const close = positionOf(run, code.close(run[listOpen]!) - 1);
      if (at(close + 1)?.text === "=") {
        for (let m = listOpen + 1; m < close; m++) {
          const before = at(m - 1)?.text ?? "";
          if (!["[", "(", ",", "=>"].includes(before)) {
            continue;
          }
          const target = writeTarget(code, run, m, analysed);
          if (target !== null && [",", "]", ")"].includes(at(target.after)?.text ?? "")) {
            add(target.property, m);
          }
        }
      }
    }
    const target = writeTarget(code, run, k, analysed);
    if (target === null) {
      continue;
    }
    const op = at(target.after)?.text ?? "";
    if (op === "=" || op === "++" || op === "--" || COMPOUND_ASSIGNMENTS.has(op)) {
      add(target.property, k);
    } else if (prev !== null && (prev.text === "++" || prev.text === "--")) {
      add(target.property, k);
    } else if (prev !== null && prev.text === "&" && !endsValue(at(k - 2))) {
      add(target.property, k);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Boot-only state

/** Where a boot entry call's receiver resolves: the bindings by abstract, and the facades' accessors by facade FQCN. */
export interface Receivers {
  /** Abstract → the non-null classes bound to it. */
  bound: ReadonlyMap<string, readonly string[]>;
  /** Facade FQCN → its accessor. */
  facades: ReadonlyMap<string, string>;
}

/**
 * The facade accessors by facade FQCN: each line of `conformance/scans/facades.jsonl` under `root` (none when the file
 * is absent), then each other non-abstract indexed class whose `extends` chain reaches `Facade` and whose
 * `getFacadeAccessor()` returns a string literal or `X::class` (the package facades outside `Support/Facades`, such as
 * `Laravel\Mcp\Facades\Mcp`).
 */
export function facadeAccessors(root: string, index: Index): Map<string, string> {
  const out = new Map<string, string>();
  const file = join(root, FACADES_FILE);
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim() !== "") {
        const parsed = JSON.parse(line) as { facade: string; accessor: string };
        out.set(parsed.facade, parsed.accessor);
      }
    }
  }
  for (const parsed of index.files) {
    for (const decl of parsed.declarations) {
      if (decl.kind !== "class" || decl.abstract || decl.fqcn === FACADE_BASE || out.has(decl.fqcn) || index.byFqcn.get(decl.fqcn) !== decl || !extendsChainReaches(index, decl, FACADE_BASE)) {
        continue;
      }
      try {
        out.set(decl.fqcn, accessorOf(decl));
      } catch (error) {
        if (!(error instanceof ScanError)) {
          throw error;
        }
      }
    }
  }
  return out;
}

/** The positions of the brackets in `run`: closer position → opener position. */
function openers(code: Code, run: Run): Map<number, number> {
  const out = new Map<number, number>();
  const stack: number[] = [];
  for (let k = 0; k < run.length; k++) {
    const t = code.tok(run[k]!);
    if (isOpener(t)) {
      stack.push(k);
    } else if (isCloser(t) && stack.length > 0) {
      out.set(k, stack.pop()!);
    }
  }
  return out;
}

/**
 * The classes the receiver of the call whose operator (`->`, `?->` or `::`) is at position `k` of `run` resolves to:
 * `F::m(` with F a facade whose accessor is bound to C or is C, or with F resolving to C; `$this->app->make(K)->m(`,
 * `$this->app[K]->m(`, `app(K)->m(` or `resolve(K)->m(` with K (a string literal or `Y::class`) bound to C or equal to
 * C. Any other receiver resolves to nothing.
 */
function receiverClasses(index: Index, code: Code, run: Run, k: number, brackets: ReadonlyMap<number, number>, receivers: Receivers): string[] {
  const at = (m: number): Token | null => (m < 0 || run[m] === undefined ? null : code.tok(run[m]!));
  const text = (m: number): string => at(m)?.text.toLowerCase() ?? "";
  const classesOf = (key: string): string[] => {
    const out = [...(receivers.bound.get(key) ?? [])];
    if (index.byFqcn.get(key)?.kind === "class" && !out.includes(key)) {
      out.push(key);
    }
    return out;
  };
  const keyOf = (open: number): string | null => {
    const first = code.args(run[open]!)[0];
    return first === undefined ? null : (code.stringLiteral(first) ?? code.classConstant(first));
  };
  const op = text(k);
  const head = at(k - 1);
  if (head === null) {
    return [];
  }
  if (op === "::") {
    if (head.kind !== "name" || RELATIVE.has(head.text.toLowerCase())) {
      return [];
    }
    const name = code.resolve(head.text);
    const accessor = receivers.facades.get(name);
    const out = accessor === undefined ? [] : classesOf(accessor);
    for (const cls of classesOf(name)) {
      if (!out.includes(cls)) {
        out.push(cls);
      }
    }
    return out;
  }
  const open = brackets.get(k - 1);
  if (open === undefined) {
    return [];
  }
  const thisApp = (m: number): boolean => text(m) === "app" && text(m - 1) === "->" && text(m - 2) === "$this";
  let key: string | null = null;
  if (head.text === "]") {
    // `$this->app[K]->m(`.
    if (thisApp(open - 1)) {
      key = keyOf(open);
    }
  } else if (head.text === ")") {
    const callee = at(open - 1);
    const calleeName = callee?.kind === "name" ? callee.text.replace(/^\\/, "").toLowerCase() : "";
    if (calleeName === "make" && text(open - 2) === "->" && thisApp(open - 3)) {
      // `$this->app->make(K)->m(`.
      key = keyOf(open);
    } else if ((calleeName === "app" || calleeName === "resolve") && !["->", "?->", "::", "function", "new"].includes(text(open - 2))) {
      // `app(K)->m(`, `resolve(K)->m(`.
      key = keyOf(open);
    }
  }
  return key === null ? [] : classesOf(key);
}

/**
 * The methods each class's boot entry calls seed, by class: a top-level call `->m(` / `::m(` of every provider's
 * `register()` / `boot()`, and of the provider methods they reach by top-level `$this->m(`, transitively, seeds m of
 * each class its receiver resolves to (`receiverClasses`).
 */
function bootEntryCalls(index: Index, providers: readonly Declaration[], receivers: Receivers): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const provider of providers) {
    const lookup = new Map<string, { owner: Declaration; method: Method }>();
    for (const owner of analysedDeclarations(index, provider)) {
      for (const method of owner.methods) {
        const name = method.name.toLowerCase();
        if (method.bodyStart !== -1 && !lookup.has(name)) {
          lookup.set(name, { owner, method });
        }
      }
    }
    const queue = ["register", "boot"].filter((name) => lookup.has(name));
    const seen = new Set(queue);
    while (queue.length > 0) {
      const { owner, method } = lookup.get(queue.shift()!)!;
      const body = bodyOf(new Code(owner), method);
      const { code, run, nested } = body;
      const brackets = openers(code, run);
      for (let k = 0; k + 2 < run.length; k++) {
        const op = code.tok(run[k]!);
        const name = code.tok(run[k + 1]!);
        if (!(op.text === "->" || op.text === "?->" || op.text === "::") || name.kind !== "name" || code.tok(run[k + 2]!).text !== "(" || inRanges(nested, run[k]!)) {
          continue;
        }
        if (run[k + 4] !== undefined && code.tok(run[k + 3]!).text === "..." && code.tok(run[k + 4]!).text === ")") {
          continue;
        }
        for (const cls of receiverClasses(index, code, run, k, brackets, receivers)) {
          const set = out.get(cls) ?? new Set<string>();
          set.add(name.text.toLowerCase());
          out.set(cls, set);
        }
      }
      for (const call of callsOf(body).this) {
        if (!call.nested && lookup.has(call.name) && !seen.has(call.name)) {
          seen.add(call.name);
          queue.push(call.name);
        }
      }
    }
  }
  return out;
}

/** Stands for a closure, arrow function or anonymous class nested in a method: a runtime writer or caller. */
const RUNTIME = "\u0000runtime";

/** The least fixed point: `seed`, plus each method whose callers other than itself are non-empty and all in the set or `also`. */
function closeOver(names: ReadonlySet<string>, callers: ReadonlyMap<string, ReadonlySet<string>>, seed: Iterable<string>, also: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set(seed);
  for (let changed = true; changed; ) {
    changed = false;
    for (const name of names) {
      if (out.has(name)) {
        continue;
      }
      const from = [...(callers.get(name) ?? [])].filter((caller) => caller !== name);
      if (from.length > 0 && from.every((caller) => out.has(caller) || also.has(caller))) {
        out.add(name);
        changed = true;
      }
    }
  }
  return out;
}

/** A boot-only property, `<C>::$<P>`, and the non-construction methods that write it (lower-case, sorted). */
export interface BootOnly {
  property: string;
  writers: string[];
}

/** The boot-only properties of class C, given the methods of C its boot entry calls seed. */
function bootOnlyOf(index: Index, fqcn: string, entry: ReadonlySet<string>): BootOnly[] {
  const decl = index.byFqcn.get(fqcn);
  if (decl === undefined) {
    return [];
  }
  const analysedDecls = analysedDeclarations(index, decl);
  const analysed = new Set(analysedDecls.map((owner) => owner.fqcn));
  const writers = new Map<string, Set<string>>();
  const callers = new Map<string, Set<string>>();
  const names = new Set<string>();
  const note = (map: Map<string, Set<string>>, key: string, value: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  for (const owner of analysedDecls) {
    const code = new Code(owner);
    for (const method of owner.methods) {
      if (method.bodyStart === -1) {
        continue;
      }
      const name = method.name.toLowerCase();
      names.add(name);
      const body = bodyOf(code, method);
      for (const call of callsOf(body).self) {
        note(callers, call.name, call.nested ? RUNTIME : name);
      }
      for (const write of writesOf(body, analysed)) {
        note(writers, write.name, write.nested ? RUNTIME : name);
      }
    }
  }
  const construction = closeOver(names, callers, names.has("__construct") ? ["__construct"] : []);
  const reachable = closeOver(names, callers, [...names].filter((name) => entry.has(name)), construction);
  const out: BootOnly[] = [];
  for (const [property, methods] of writers) {
    const runtime = [...methods].filter((method) => !construction.has(method));
    if (runtime.length > 0 && runtime.every((method) => reachable.has(method))) {
      out.push({ property: `${fqcn}::$${property}`, writers: runtime.sort(compareUnits) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build

const COMMENT = "Generated by `bun run scan:singletons` (tools/scans/singletons.ts) from conformance/upstream at the Baseline Pin. Do not edit by hand: every class an Upstream provider binds with singleton() (Story 3.6, Story 6.3, AD-5).";
const BOOT_ONLY_HEADER = [
  "# Boot-only state (AD-5): `<FQCN>::$<property>` written only during register/boot.",
  "# Generated by `bun run scan:singletons` (tools/scans/singletons.ts) from conformance/upstream.",
  "# Do not edit by hand: `bun run scan:singletons --check` flags any difference.",
];

/** Renders `tools/lint-rules/singletons.json`. */
export function renderSingletons(bindings: readonly Binding[], classes: readonly string[], bootOnly: readonly BootOnly[] = []): string {
  const lines = ["{", `  "comment": ${JSON.stringify(COMMENT)},`];
  if (bindings.length === 0) {
    lines.push('  "bindings": [],');
  } else {
    lines.push('  "bindings": [');
    bindings.forEach((binding, i) => {
      lines.push(`    ${renderJson({ provider: binding.provider, abstract: binding.abstract, class: binding.class })}${i < bindings.length - 1 ? "," : ""}`);
    });
    lines.push("  ],");
  }
  if (classes.length === 0) {
    lines.push('  "classes": [],');
  } else {
    lines.push('  "classes": [');
    classes.forEach((cls, i) => {
      lines.push(`    ${JSON.stringify(cls)}${i < classes.length - 1 ? "," : ""}`);
    });
    lines.push("  ],");
  }
  if (bootOnly.length === 0) {
    lines.push('  "bootOnly": []');
  } else {
    lines.push('  "bootOnly": [');
    bootOnly.forEach((entry, i) => {
      lines.push(`    ${renderJson({ property: entry.property, writers: [...entry.writers] })}${i < bootOnly.length - 1 ? "," : ""}`);
    });
    lines.push("  ]");
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/** Builds both files from the snapshot under `root`. */
export function buildSingletons(root: string, index: Index = buildIndex(root)): SingletonsResult {
  const providers: Declaration[] = [];
  for (const parsed of index.files) {
    for (const decl of parsed.declarations) {
      if (decl.kind === "class" && index.byFqcn.get(decl.fqcn) === decl && extendsChainReaches(index, decl, SERVICE_PROVIDER)) {
        providers.push(decl);
      }
    }
  }
  const unique = new Map<string, Found>();
  for (const provider of providers) {
    for (const found of providerBindings(index, provider)) {
      const key = renderJson({ provider: found.binding.provider, abstract: found.binding.abstract, class: found.binding.class });
      if (!unique.has(key)) {
        unique.set(key, found);
      }
    }
  }
  const sorted = [...unique.values()].sort((a, b) => compareBindings(a.binding, b.binding));
  const bindings = sorted.map((found) => found.binding);
  const classes = [...new Set(bindings.map((binding) => binding.class).filter((cls): cls is string => cls !== null))].sort(compareUnits);
  const bound = new Map<string, string[]>();
  for (const binding of bindings) {
    if (binding.class !== null) {
      const list = bound.get(binding.abstract) ?? [];
      if (!list.includes(binding.class)) {
        list.push(binding.class);
      }
      bound.set(binding.abstract, list);
    }
  }
  const entry = bootEntryCalls(index, providers, { bound, facades: facadeAccessors(root, index) });
  const byProperty = new Map<string, BootOnly>();
  for (const cls of classes) {
    for (const found of bootOnlyOf(index, cls, entry.get(cls) ?? new Set())) {
      byProperty.set(found.property, found);
    }
  }
  const writers = [...byProperty.values()].sort((a, b) => compareUnits(a.property, b.property));
  const bootOnly = writers.map((found) => found.property);
  return {
    singletons: renderSingletons(bindings, classes, writers),
    bootOnlyState: [...BOOT_ONLY_HEADER, ...bootOnly].map((line) => `${line}\n`).join(""),
    bindings,
    classes,
    bootOnly,
    writers,
    unresolved: sorted.filter((found) => found.binding.class === null).map((found) => `${found.binding.provider} ${found.binding.abstract} (${found.where})`),
  };
}

const USAGE = ["Usage:", "  bun tools/scans/singletons.ts [--check] [--root <dir>]"].join("\n");

export function main(argv: readonly string[]): number {
  return runScan("singletons", argv, USAGE, (root) => {
    const result = buildSingletons(root);
    return {
      files: new Map([
        [SINGLETONS_FILE, result.singletons],
        [BOOT_ONLY_FILE, result.bootOnlyState],
      ]),
      summary: `${result.bindings.length} bindings (${result.unresolved.length} with class null), ${result.classes.length} classes, ${result.bootOnly.length} boot-only properties`,
      notes: result.unresolved.map((line) => `singletons: class null, for review: ${line}`),
    };
  });
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
