// The API-surface diff and gate (Story 6.5; AD-15, AD-9, AD-26, DIV-12).
//
//   bun run api-surface [--root <dir>] [--details] [--markdown <file>] (<component>… | --all)
//   bun run api-surface:gate [--root <dir>] <component>…        (this file with --gate)
//
// A component is a `conformance/api-surface/<name>.jsonl` other than
// `additions.jsonl` / `exceptions.jsonl` (Story 3.5's Upstream export); `--all`
// is every one, sorted. Its package is `packages/<name>`. `--root` defaults to
// the repository root (tests point it at temp roots).
//
// It emits the packages' declarations with Story 6.4's `tsc -b` helper
// (a package with no `package.json` has no declarations: everything is
// missing), maps each top-level `registerClass('<FQCN>', X)` in
// `packages/<c>/src/**/*.ts` that Story 6.6's `recogniseRegistration` accepts
// (or, for a contract, a top-level `const X = contract('<FQCN>')` or one
// holding `Symbol.for('<FQCN>')` whose argument is an `Illuminate\…` or
// `Laravel\…` FQCN, so runtime brands such as `Symbol.for("xaravel.class.fqcn")`
// register nothing, AD-1), keyed by the FQCN without its leading `\`
// (`normaliseFqcn`; the case is kept), to the `class`/`interface` `X` of that
// file's `.d.ts`, and compares its public members with the Upstream records,
// after the parity mappings: camelCase (`camel`), `__construct` →
// `constructor`, `__toString` → `toString`, the AD-26 options object, and the
// DIV-12 pairs (`conformance/scans/div12-pairs.jsonl`).
//
// A contract token also has a static side (ESC-10.2-1), as a `.d.ts`
// interface cannot hold a static member: each key of the token's statics
// record, the 4th argument of `contract(fqcn, members, parents, statics)` read
// from the source, is a static property (a constant; its type unchecked), and
// every member of a `class`/`interface` `<X>Static` in the same `.d.ts` counts
// as static in its own role. A statics argument that is not an object literal
// with plain (identifier or string) keys, after parentheses, `as`,
// `satisfies`, `<T>` and `!`, is a tool failure; `undefined` is none. A
// `registerClass` registration has no static side beyond its own `static`
// members; its `<X>Static` declarations are ignored.
//
// A `model-config` method with a decided DIV-12 rename (`DIV12_RENAMES`:
// `fillable` → `setFillable`, `touches` → `isTouching`) is matched under its
// new name. An `option-pair` on a non-trait declaration is satisfied by either
// Xaravel form and is `missing` when neither is declared. A member with two or
// more optional non-variadic Upstream parameters needs a positional and an
// options-form signature (AD-26 "also accepts"; options failures are prefixed
// `options overload: `). The options parameter's type is a type literal, or an
// interface / type alias that is one, never a union (`| null` included); each
// key is optional and, when the Upstream parameter is typed, nullable exactly
// when it is (a method-signature key is not nullable; a getter's return and a
// setter's parameter are read). Like a positional parameter's, a key's type is
// checked for nullability only, not its base type, and syntactically: an alias
// such as `Maybe<T> = T | null` is not resolved. A parameter whose Upstream
// name is a reserved word takes its decided name: `RESERVED_PARAMETER_NAMES`,
// the names Epic 10's contracts ported (spec-10-1/10-2: `default` →
// `defaultValue`; spec-10-3: `class` → `className`, `arguments` → `args`),
// otherwise the word and a capitalised suffix (`packageName`); options keys
// stay `camel()`.
//
// A declaration's parents (epic-10-retro-item-5, part 3) are compared too: the
// record's `parents` (PHP's whole parent chain and every interface, transitive)
// against the transitive closure of the registration's TS heritage
// (`interface … extends`, `class … extends … implements`, identifiers only)
// read from the package sources, each limited to the class, interface and
// enum declarations of the Upstream surface in any component (built-ins,
// traits and unported types drop out), the declaration itself excluded. A
// heritage name resolves through a registration in the same file, a named or
// default import from a relative module (`.ts`, `.js` → `.ts`, `/index.ts`;
// through `export {…} from` and `export * from` re-exports), or an
// `@xaravel/<c>[/<sub>]` import (the module its `package.json` `exports` or
// `src/<sub>.ts` / `src/<sub>/index.ts` names, else that package's
// registration by local name, when unique); an unresolved name contributes
// nothing. A committed declaration line without a `parents` list is a tool
// failure. A
// difference is one `mismatch` on the declaration, `parents: drops <fqcn>, …;
// adds <fqcn>, …`, and the declaration is not counted matched. A record
// without `parents` (an inline test record) is not parent-checked.
//
// Findings: `missing`, `extra`, `renamed`, `mismatch` (parameter names,
// defaults, nullability, rest, optional, static, returns, parents; `undefined`
// in a return type, AD-9), and `div12` (Upstream members DIV-12 says are not
// expected; never counted). An item is explained by a cited `exceptions.jsonl`
// (missing, mismatch) or `additions.jsonl` (extra) line, `renamed` by both;
// citation lines that explain nothing are listed as `stale`. A citation line
// whose `component` has no `<component>.jsonl` is a tool failure.
// docs/ops/api-surface.md has the rules.
//
// Report mode prints one summary line per component (with `--details`, one
// line per item before it), writes a markdown table with `--markdown`, and
// exits 0 whatever it finds. `--gate` prints every unexplained item and a
// gate line per component, then validates the citation files with the oracle
// tool's `checkCitations` (one `citation problem` line each and a count line),
// and exits 1 if any item is unexplained or any citation problem is found.
//
// A registration's members also include those its heritage supplies
// (ESC-14.8-1), each counted only under a name and static side the
// registration does not declare, and never `extra` (Upstream lists inherited
// members on their declaring class; a trait's on itself too). The walk reads
// the emitted `.d.ts` rather than the sources, as tsc has already turned each
// `class X extends mixin(Base, A, B)` into `declare const X_base:
// Mixed<typeof Base, readonly [typeof A, typeof B]>` there; TypeScript 7 has
// no JS checker API to ask for the merged type instead. In PHP's order: a
// class's `extends` names a class (registered or not, in this package or
// through an `@xaravel/<c>` import, resolved as a parent is) or a `Mixed`
// const, which stands for its traits in order, then Base; an interface's
// `extends` names interfaces; each supplier's own members, then its heritage's,
// transitively. A supplied method's defaults come from its declaring class's
// source. A function exported through an `export { f as g }` specifier (with or
// without `from`) counts under its exported name; no other alias form occurs in
// the packages. Another package's declarations are the ones `tsc -b` last
// emitted under its `outDir` (the build covers every package the diffed one
// references); a package never emitted supplies nothing.
//
// Still not seen: unregistered exported classes, and a heritage clause through
// a qualified name or another expression; for parents, a heritage clause
// through an unregistered type or an expression (`extends mixin(…)`) resolves
// to nothing. PHP built-in parents (`Countable`, `Stringable`, `ArrayAccess`,
// …) are never compared, and a contract token's runtime `parents`
// (contract()'s 3rd argument) is not compared with its `extends`.
//
// Exit codes: 0 ok (report mode unless a tool failure; gate mode only when
// nothing is unexplained and the citation files pass `checkCitations`),
// 1 unexplained items or citation problems under --gate, or a tool failure
// (tsc, unreadable or invalid jsonl, a citation line naming an unknown
// component, a parse error), 2 usage error.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import { parseSync } from "oxc-parser";
import { emitDeclarations, nameOf, node, nodes, packageDeclarations, typeNameTail, unwrapAnnotation, type DeclarationFile, type Node } from "../async-surface/async-surface";
import { checkCitations } from "../oracle/api-surface";
import { isFqcn, normaliseFqcn, recogniseRegistration } from "../registration/registration";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
export const API_SURFACE_DIR = "conformance/api-surface";
export const DIV12_PAIRS = "conformance/scans/div12-pairs.jsonl";
/**
 * The decided DIV-12 renames of a `model-config` method (PRD §5.2 DIV-12, spine AD-7): Upstream name → Xaravel name.
 * The pair list holds no target, and DIV-12 decides exactly these two; any other `model-config` method stays `div12`.
 */
export const DIV12_RENAMES: ReadonlyMap<string, string> = new Map([
  ["fillable", "setFillable"],
  ["touches", "isTouching"],
]);
const CITATION_NAMES = new Set(["additions", "exceptions"]);

// ---------------------------------------------------------------------------
// Input records

/** One Upstream parameter (`schema.json#/$defs/parameter`). */
export interface UpstreamParameter {
  readonly name: string;
  readonly type: string | null;
  readonly nullable: boolean;
  readonly default: string | null;
  readonly optional: boolean;
  readonly variadic: boolean;
  readonly byRef: boolean;
}

/** One line of `conformance/api-surface/<component>.jsonl` (`schema.json#/$defs/surface`), read structurally. */
export interface UpstreamRecord {
  readonly fqcn: string;
  readonly kind: "class" | "interface" | "trait" | "enum" | "method" | "property" | "constant" | "case" | "function";
  readonly member: string | null;
  readonly static?: boolean;
  readonly parameters?: readonly UpstreamParameter[];
  readonly returns?: string | null;
  readonly type?: string | null;
  readonly nullable?: boolean;
  /** A declaration's parents (`schema.json#/$defs/declaration`): sorted, transitive, built-ins and stubs included. An inline record without it is not parent-checked. */
  readonly parents?: readonly string[];
}

/** One `additions.jsonl` / `exceptions.jsonl` line. */
export interface CitationLine {
  readonly component: string;
  readonly fqcn: string;
  readonly member: string | null;
  readonly citation: string;
}

/** One `div12-pairs.jsonl` line (the fields the diff reads). */
export interface Div12Pair {
  readonly class: string;
  readonly name: string;
  readonly classification: string;
  /** The class declaring each side: the export lists a member on its declaring class. */
  readonly property?: { readonly declaredIn?: string } | null;
  readonly method?: { readonly declaredIn?: string } | null;
}

/** A source file of the package: `file` is `src/<path>.ts`. */
export interface SourceFile {
  readonly file: string;
  readonly text: string;
}

export interface DiffInput {
  readonly component: string;
  readonly upstream: readonly UpstreamRecord[];
  /** Every additions / exceptions line (other components' lines are ignored). */
  readonly additions: readonly CitationLine[];
  readonly exceptions: readonly CitationLine[];
  readonly div12: readonly Div12Pair[];
  /** The package's emitted `.d.ts` texts, each named by its source (`src/<path>.ts`). */
  readonly declarations: readonly DeclarationFile[];
  /** The package's `src/**\/*.ts` texts (not `.d.ts`). */
  readonly sources: readonly SourceFile[];
  /** Every declaration FQCN of the Upstream surface, any component: the only parents compared. Defaults to this component's declarations. */
  readonly known?: ReadonlySet<string>;
  /** Another package's `src/**\/*.ts` texts (`packages/<pkg>`), for an `@xaravel/<pkg>` heritage import. Defaults to none. */
  readonly packageSources?: (pkg: string) => readonly SourceFile[];
  /** A package's `package.json` `exports` map (`packages/<pkg>`), for an `@xaravel/<pkg>[/<sub>]` heritage import. Defaults to none. */
  readonly packageExports?: (pkg: string) => Readonly<Record<string, unknown>> | null;
  /** Another package's emitted `.d.ts` texts (`packages/<pkg>`), for members supplied through an `@xaravel/<pkg>` heritage import. Defaults to none. */
  readonly packageDeclarations?: (pkg: string) => readonly DeclarationFile[];
}

export type Category = "missing" | "extra" | "renamed" | "mismatch" | "div12" | "stale";

/** One finding. `member` is the Upstream name (the Xaravel name for `extra`); `to` is a `renamed` item's Xaravel name. */
export interface Item {
  readonly category: Category;
  readonly kind: string;
  readonly fqcn: string;
  readonly member: string | null;
  readonly to: string | null;
  readonly details: string | null;
  /** The citations that explain it, or null when unexplained (always null for `div12` and `stale`). */
  readonly explained: string | null;
}

export interface ComponentDiff {
  readonly component: string;
  /** Upstream records in the component file. */
  readonly upstream: number;
  /** Registered declarations, and members and functions matched with no mismatch. */
  readonly matched: number;
  readonly items: readonly Item[];
}

const COUNTED: ReadonlySet<Category> = new Set(["missing", "extra", "renamed", "mismatch"]);

// ---------------------------------------------------------------------------
// Names

/** Upstream → Xaravel: each `_x` after a letter or digit becomes `X` (leading underscores kept). */
export function camel(name: string): string {
  return name.replace(/(?<=[A-Za-z0-9])_([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** The Xaravel name of an Upstream method, property or function short name (AD-15 parity mapping). */
export function memberName(name: string): string {
  if (name === "__construct") {
    return "constructor";
  }
  if (name === "__toString") {
    return "toString";
  }
  return name.startsWith("__") ? name : camel(name);
}

/** ECMAScript reserved words (and strict-mode restricted names) that cannot name a parameter (AD-26, PORTING.md). */
const RESERVED = new Set(
  (
    "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in " +
    "instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package " +
    "private protected public arguments eval"
  ).split(" "),
);

/**
 * The decided Xaravel names of the reserved-word parameters Epic 10 ported (spec-10-1 and 10-2: `default`; spec-10-3:
 * `arguments`, `class`). Any other reserved word maps to the word followed by a capitalised descriptive suffix
 * (`packageName`, `newValue`; `reservedNameFailure`).
 */
export const RESERVED_PARAMETER_NAMES: ReadonlyMap<string, string> = new Map([
  ["default", "defaultValue"],
  ["class", "className"],
  ["arguments", "args"],
]);

/**
 * The name failure of a TS parameter for an Upstream parameter whose `camel()` name `word` is a reserved word, or null
 * when the name is the decided one: the `RESERVED_PARAMETER_NAMES` entry exactly, otherwise `<word>` followed by an
 * upper-case ASCII letter (`^<word>[A-Z]`).
 */
function reservedNameFailure(upstream: string, word: string, name: string, position: number): string | null {
  const decided = RESERVED_PARAMETER_NAMES.get(word);
  if (decided !== undefined ? name === decided : name.length > word.length && name.startsWith(word) && /[A-Z]/.test(name[word.length]!)) {
    return null;
  }
  return `parameter ${position} is ${name}, Upstream ${upstream} (reserved word: expected ${decided ?? `${word}<Name>`})`;
}

// ---------------------------------------------------------------------------
// Type helpers

function stripParens(value: unknown): Node | null {
  let n = unwrapAnnotation(value);
  while (n !== null && n.type === "TSParenthesizedType") {
    n = unwrapAnnotation(n["typeAnnotation"]);
  }
  return n;
}

/** Whether a TS type admits null: absent, or `null`/`any`/`unknown` (or a union containing one). */
function admitsNull(value: unknown): boolean {
  const n = stripParens(value);
  if (n === null) {
    return true;
  }
  switch (n.type) {
    case "TSNullKeyword":
    case "TSAnyKeyword":
    case "TSUnknownKeyword":
      return true;
    case "TSUnionType":
      return nodes(n["types"]).some(admitsNull);
    default:
      return false;
  }
}

/** Whether a type is `undefined` at its top level: through parentheses and unions, after unwrapping `Promise` / `PromiseLike` (AD-9). */
function holdsUndefined(value: unknown): boolean {
  const n = unwrapPromise(value);
  if (n === null) {
    return false;
  }
  if (n.type === "TSUndefinedKeyword") {
    return true;
  }
  return n.type === "TSUnionType" && nodes(n["types"]).some(holdsUndefined);
}

function typeArgs(n: Node): Node[] {
  return nodes(node(n["typeArguments"])?.["params"]);
}

/** `Promise<T>` / `PromiseLike<T>` → `T`, repeatedly. */
function unwrapPromise(value: unknown): Node | null {
  let n = stripParens(value);
  while (n !== null && n.type === "TSTypeReference") {
    const tail = typeNameTail(n["typeName"]);
    const args = typeArgs(n);
    if ((tail !== "Promise" && tail !== "PromiseLike") || args.length !== 1) {
      break;
    }
    n = stripParens(args[0]);
  }
  return n;
}

/** A rest parameter's element type: `T[]`, `readonly T[]`, `Array<T>`, `ReadonlyArray<T>` → `T`. */
function elementType(value: unknown): Node | null {
  let n = stripParens(value);
  if (n !== null && n.type === "TSTypeOperator" && n["operator"] === "readonly") {
    n = stripParens(n["typeAnnotation"]);
  }
  if (n === null) {
    return null;
  }
  if (n.type === "TSArrayType") {
    return stripParens(n["elementType"]);
  }
  if (n.type === "TSTypeReference") {
    const tail = typeNameTail(n["typeName"]);
    const args = typeArgs(n);
    if ((tail === "Array" || tail === "ReadonlyArray") && args.length === 1) {
      return stripParens(args[0]);
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// The Xaravel side

interface TsParam {
  readonly name: string;
  readonly rest: boolean;
  readonly optional: boolean;
  readonly type: Node | null;
}

interface TsSignature {
  readonly params: readonly TsParam[];
  /** The return type, or null (a constructor). */
  readonly returns: Node | null;
  /** Whether the signature has a return position at all (not a constructor). */
  readonly hasReturn: boolean;
}

interface TsMember {
  readonly name: string;
  readonly static: boolean;
  readonly signatures: TsSignature[];
  /** A property (field, accessor, getter/setter, property signature) with its type; null when the member is not one. */
  property: { readonly type: Node | null; readonly optional: boolean } | null;
  matched: boolean;
  /** Supplied by the registration's heritage (`Supplied`), not declared by it: never `extra`. */
  readonly inherited: boolean;
  /** The declaring class's defaults and type keys for a member read through heritage; null for the registration's own. */
  readonly supplier: Supplier | null;
}

/** A default initializer from the source, with its text. */
interface SourceDefault {
  readonly node: Node;
  readonly text: string;
}

function tsParams(list: unknown): TsParam[] {
  const out: TsParam[] = [];
  for (const param of nodes(list)) {
    if (param.type === "RestElement") {
      out.push({ name: nameOf(param["argument"]) ?? "(pattern)", rest: true, optional: true, type: unwrapAnnotation(param["typeAnnotation"]) });
      continue;
    }
    const target = param.type === "TSParameterProperty" ? node(param["parameter"]) : param;
    const id = target !== null && target.type === "AssignmentPattern" ? node(target["left"]) : target;
    const name = id !== null && id.type === "Identifier" ? nameOf(id) : null;
    if (name === "this") {
      continue;
    }
    out.push({ name: name ?? "(pattern)", rest: false, optional: id?.["optional"] === true || target?.type === "AssignmentPattern", type: unwrapAnnotation(id?.["typeAnnotation"]) });
  }
  return out;
}

/** The function types of an annotation: itself, or the members of a union, through parentheses. */
function functionTypes(value: unknown): Node[] {
  const n = stripParens(value);
  if (n === null) {
    return [];
  }
  if (n.type === "TSFunctionType") {
    return [n];
  }
  return n.type === "TSUnionType" ? nodes(n["types"]).flatMap(functionTypes) : [];
}

function fnSignature(fn: Node, hasReturn: boolean): TsSignature {
  return { params: tsParams(fn["params"]), returns: hasReturn ? unwrapAnnotation(fn["returnType"]) : null, hasReturn };
}

/**
 * Adds the public members of a class or interface body to `members` (by name; static and instance kept apart). With
 * `forceStatic` every member is static: the body of a contract's `<X>Static` declaration (ESC-10.2-1). A new member
 * takes `supplier` (`Supplied` reading a heritage declaration).
 */
function collectMembers(decl: Node, members: Map<string, TsMember[]>, forceStatic = false, supplier: Supplier | null = null): void {
  const body = node(decl["body"]);
  for (const member of nodes(body?.["body"])) {
    const key = node(member["key"]);
    if (key === null || key.type === "PrivateIdentifier" || member["computed"] === true) {
      continue;
    }
    const accessibility = member["accessibility"];
    if (accessibility === "private" || accessibility === "protected") {
      continue;
    }
    const raw = nameOf(key);
    if (raw === null) {
      continue;
    }
    const isStatic = forceStatic || member["static"] === true;
    const entry = (name: string): TsMember => {
      const list = members.get(name) ?? [];
      let found = list.find((m) => m.static === isStatic);
      if (found === undefined) {
        found = { name, static: isStatic, signatures: [], property: null, matched: false, inherited: false, supplier };
        list.push(found);
        members.set(name, list);
      }
      return found;
    };
    switch (member.type) {
      case "MethodDefinition":
      case "TSAbstractMethodDefinition": {
        const fn = node(member["value"]);
        if (fn === null) {
          break;
        }
        const kind = member["kind"];
        if (kind === "constructor") {
          entry("constructor").signatures.push(fnSignature(fn, false));
        } else if (kind === "method") {
          entry(raw).signatures.push(fnSignature(fn, true));
        } else if (kind === "get") {
          entry(raw).property = { type: unwrapAnnotation(fn["returnType"]), optional: false };
        } else if (kind === "set") {
          const target = entry(raw);
          if (target.property === null) {
            target.property = { type: tsParams(fn["params"])[0]?.type ?? null, optional: false };
          }
        }
        break;
      }
      case "PropertyDefinition":
      case "TSAbstractPropertyDefinition":
      case "AccessorProperty":
      case "TSAbstractAccessorProperty":
      case "TSPropertySignature": {
        const target = entry(raw);
        target.property = { type: unwrapAnnotation(member["typeAnnotation"]), optional: member["optional"] === true };
        for (const fn of functionTypes(member["typeAnnotation"])) {
          target.signatures.push(fnSignature(fn, true));
        }
        break;
      }
      case "TSMethodSignature": {
        const kind = member["kind"];
        if (kind === "get") {
          entry(raw).property = { type: unwrapAnnotation(member["returnType"]), optional: false };
        } else if (kind === "set") {
          const target = entry(raw);
          if (target.property === null) {
            target.property = { type: tsParams(member["params"])[0]?.type ?? null, optional: false };
          }
        } else {
          entry(raw).signatures.push(fnSignature(member, true));
        }
        break;
      }
      default:
        break;
    }
  }
}

/** A top-level statement's declaration: itself, or the declaration an `export` wraps. */
function declarationOf(statement: Node): Node | null {
  if (statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") {
    return node(statement["declaration"]);
  }
  return statement;
}

function parse(file: string, text: string, lang: "ts" | "dts"): Node[] {
  const result = parseSync(lang === "dts" ? file.replace(/\.ts$/, ".d.ts") : file, text, { lang });
  if (result.errors.length > 0) {
    throw new Error(`${file}${lang === "dts" ? " (declarations)" : ""} does not parse: ${result.errors.map((error) => error.message).join("; ")}`);
  }
  return nodes((result.program as unknown as Node)["body"]);
}

/**
 * Whether a `Symbol.for` argument names an Upstream contract: shaped as a PHP FQCN (Story 6.6's `isFqcn`) whose first
 * segment, after an optional leading `\`, is `Illuminate` or `Laravel`. Runtime brands (`xaravel.class.fqcn`) are not.
 */
function isLaravelFqcn(value: string): boolean {
  const fqcn = normaliseFqcn(value);
  return isFqcn(value) && (fqcn.startsWith("Illuminate\\") || fqcn.startsWith("Laravel\\"));
}

/**
 * The FQCN of a contract token initializer: `contract('<FQCN>')` / `contract<T>('<FQCN>')`, or the first
 * `Symbol.for('<FQCN>')` inside it whose argument is an `Illuminate\…` or `Laravel\…` FQCN (`isLaravelFqcn`); with the
 * `contract(…)` call node (null for a `Symbol.for`), whose 4th argument is the token's statics record.
 */
function contractToken(init: Node | null): { readonly fqcn: string; readonly call: Node | null } | null {
  if (init === null) {
    return null;
  }
  const literal = (args: unknown): string | null => {
    const first = nodes(args)[0];
    return first !== undefined && first.type === "Literal" && typeof first["value"] === "string" ? first["value"] : null;
  };
  if (init.type === "CallExpression") {
    const callee = node(init["callee"]);
    if (callee?.type === "Identifier" && callee["name"] === "contract") {
      const value = literal(init["arguments"]);
      return value === null ? null : { fqcn: value, call: init };
    }
    if (callee?.type === "MemberExpression" && nameOf(callee["object"]) === "Symbol" && nameOf(callee["property"]) === "for" && callee["computed"] !== true) {
      const value = literal(init["arguments"]);
      return value !== null && isLaravelFqcn(value) ? { fqcn: value, call: null } : null;
    }
  }
  for (const [key, child] of Object.entries(init)) {
    if (key === "type" || typeof child !== "object" || child === null) {
      continue;
    }
    for (const sub of Array.isArray(child) ? child : [child]) {
      const found = contractToken(node(sub));
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

/**
 * The static constant names of a contract token: the keys of its statics record, the 4th argument of
 * `contract(fqcn, members, parents, statics)` (ESC-10.2-1), after parentheses, `as`, `satisfies`, `<T>` and `!`; none
 * without one or for `undefined`. Anything else (an identifier, a spread, a computed or non-string key, a method or
 * accessor) is a tool failure naming the file and FQCN.
 */
function staticsKeys(call: Node | null, file: string, fqcn: string): string[] {
  const fail = (found: string): never => {
    throw new Error(`${file}: the statics of ${fqcn} (contract's 4th argument) must be an object literal with plain keys, after parentheses, \`as\`, \`satisfies\`, \`<T>\` and \`!\`; found ${found}`);
  };
  const args = call === null ? [] : nodes(call["arguments"]);
  if (args.slice(0, 4).some((arg) => arg.type === "SpreadElement")) {
    return fail("SpreadElement");
  }
  const raw = args[3];
  if (raw === undefined || (raw.type === "Identifier" && raw["name"] === "undefined")) {
    return [];
  }
  let arg: Node | null = raw;
  while (arg !== null && (arg.type === "ParenthesizedExpression" || arg.type === "TSAsExpression" || arg.type === "TSSatisfiesExpression" || arg.type === "TSTypeAssertion" || arg.type === "TSNonNullExpression")) {
    arg = node(arg["expression"]);
  }
  if (arg === null || arg.type !== "ObjectExpression") {
    return fail(arg === null ? "nothing" : arg.type);
  }
  const keys: string[] = [];
  for (const property of nodes(arg["properties"])) {
    const plain = property.type === "Property" && property["kind"] === "init" && property["method"] !== true;
    if (!plain) {
      return fail(property.type !== "Property" ? property.type : "a method or accessor");
    }
    if (property["computed"] === true) {
      return fail("a computed key");
    }
    const key = node(property["key"]);
    const name = key?.type === "Identifier" ? key["name"] : key?.type === "Literal" ? key["value"] : null;
    if (typeof name !== "string") {
      return fail("an unsupported key");
    }
    keys.push(name);
  }
  return keys;
}

interface Registration {
  readonly fqcn: string;
  readonly file: string;
  readonly local: string;
  /** A contract token's static constant names (`staticsKeys`); null for a `registerClass` registration. */
  readonly statics: readonly string[] | null;
}

interface ParsedPackage {
  readonly registrations: Map<string, Registration>;
  /** Declaration statements by file (`src/<path>.ts`). */
  readonly declarations: Map<string, Node[]>;
  /** Source statements and text by file. */
  readonly sources: Map<string, { statements: Node[]; text: string }>;
  /**
   * Exported functions: name → signatures and the file declaring them. A function exported through an `export { … }`
   * specifier (`Supplied.exportedFunction`) carries its implementation's parameter names and defaults instead.
   */
  readonly functions: Map<string, { file: string; signatures: TsSignature[]; implementation?: Implementation | null }>;
  /** Type literal keys by interface / type alias name, across the package's declarations. */
  readonly typeKeys: Map<string, LiteralKey[][]>;
}

function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface LiteralKey {
  readonly name: string;
  readonly optional: boolean;
  /** Whether the key admits null (`admitsNull` of its type, a getter's return or a setter's parameter; a method signature is a function type, so never). */
  readonly nullable: boolean;
}

/** The keys of a type literal or interface body, with their nullability. */
function literalKeys(members: unknown): LiteralKey[] {
  const out: LiteralKey[] = [];
  for (const member of nodes(members)) {
    const name = member["computed"] === true ? null : nameOf(member["key"]);
    if (name !== null) {
      const nullable = member.type !== "TSMethodSignature" ? admitsNull(member["typeAnnotation"]) : member["kind"] === "get" ? admitsNull(member["returnType"]) : member["kind"] === "set" ? admitsNull(nodes(member["params"])[0]?.["typeAnnotation"]) : false;
      out.push({ name, optional: member["optional"] === true, nullable });
    }
  }
  return out;
}

/**
 * A package's parsed sources and registrations: each top-level `registerClass` Story 6.6 accepts, and each contract
 * token (AD-1) no `registerClass` of the same FQCN replaces. A token's statics are read only with `withStatics` (the
 * diffed package; another package is read for its heritage only).
 */
function sourceRegistrations(sources: readonly SourceFile[], withStatics: boolean): Pick<ParsedPackage, "registrations" | "sources"> {
  const parsed: Pick<ParsedPackage, "registrations" | "sources"> = { registrations: new Map(), sources: new Map() };
  // Contract tokens (AD-1): registrations unless a registerClass of the same FQCN exists.
  const contracts = new Map<string, { readonly file: string; readonly local: string; readonly call: Node | null }>();
  for (const { file, text } of [...sources].sort((a, b) => compareUnits(a.file, b.file))) {
    const statements = parse(file, text, "ts");
    parsed.sources.set(file, { statements, text });
    for (const statement of statements) {
      const variable = declarationOf(statement);
      if (variable !== null && variable.type === "VariableDeclaration" && variable["kind"] === "const") {
        for (const declarator of nodes(variable["declarations"])) {
          const local = nameOf(declarator["id"]);
          const token = contractToken(node(declarator["init"]));
          if (local !== null && token !== null && !contracts.has(normaliseFqcn(token.fqcn))) {
            contracts.set(normaliseFqcn(token.fqcn), { file, local, call: token.call });
          }
        }
        continue;
      }
      // Story 6.6's recogniser, so a registration here is one the scan accepts; keyed without the leading `\`.
      const registration = recogniseRegistration(statement)?.registration ?? null;
      if (registration !== null && !parsed.registrations.has(registration.fqcn)) {
        parsed.registrations.set(registration.fqcn, { fqcn: registration.fqcn, file, local: registration.name, statics: null });
      }
    }
  }
  // A token's statics are read only when no registerClass replaces it.
  for (const [fqcn, { file, local, call }] of contracts) {
    if (!parsed.registrations.has(fqcn)) {
      parsed.registrations.set(fqcn, { fqcn, file, local, statics: withStatics ? staticsKeys(call, file, fqcn) : null });
    }
  }
  return parsed;
}

function parsePackage(declarations: readonly DeclarationFile[], sources: readonly SourceFile[]): ParsedPackage {
  const parsed: ParsedPackage = { ...sourceRegistrations(sources, true), declarations: new Map(), functions: new Map(), typeKeys: new Map() };
  for (const { file, text } of [...declarations].sort((a, b) => compareUnits(a.file, b.file))) {
    const statements = parse(file, text, "dts");
    parsed.declarations.set(file, statements);
    for (const statement of statements) {
      const decl = declarationOf(statement);
      if (decl === null) {
        continue;
      }
      if (statement.type === "ExportNamedDeclaration" && decl.type === "VariableDeclaration" && decl["kind"] === "const") {
        // `export declare const f: (…) => T`: a function.
        for (const declarator of nodes(decl["declarations"])) {
          const id = node(declarator["id"]);
          const fns = functionTypes(id?.["typeAnnotation"]);
          const constName = nameOf(id);
          if (constName !== null && fns.length > 0) {
            const entry = parsed.functions.get(constName) ?? { file, signatures: [] };
            entry.signatures.push(...fns.map((fn) => fnSignature(fn, true)));
            parsed.functions.set(constName, entry);
          }
        }
        continue;
      }
      const name = nameOf(decl["id"]);
      if (name === null) {
        continue;
      }
      if (statement.type === "ExportNamedDeclaration" && decl.type === "TSDeclareFunction") {
        const entry = parsed.functions.get(name) ?? { file, signatures: [] };
        entry.signatures.push(fnSignature(decl, true));
        parsed.functions.set(name, entry);
      }
    }
    addTypeKeys(statements, parsed.typeKeys);
  }
  return parsed;
}

/** Adds the type-literal keys of each interface and type-literal alias among `statements` to `typeKeys`, by name. */
function addTypeKeys(statements: readonly Node[], typeKeys: Map<string, LiteralKey[][]>): void {
  for (const statement of statements) {
    const decl = declarationOf(statement);
    const name = decl === null ? null : nameOf(decl["id"]);
    if (decl === null || name === null) {
      continue;
    }
    const type = decl.type === "TSTypeAliasDeclaration" ? stripParens(decl["typeAnnotation"]) : null;
    const keys = decl.type === "TSInterfaceDeclaration" ? literalKeys(node(decl["body"])?.["body"]) : type !== null && type.type === "TSTypeLiteral" ? literalKeys(type["members"]) : null;
    if (keys !== null) {
      typeKeys.set(name, [...(typeKeys.get(name) ?? []), keys]);
    }
  }
}

/**
 * The merged public members of every class / interface named `local` in a declaration file. For a contract token
 * (`statics` not null; ESC-10.2-1) the members of every class / interface named `<local>Static` are added as static,
 * and each statics constant as a static property (its type unchecked), merged with a static member of that name.
 */
function classMembers(statements: readonly Node[], local: string, statics: readonly string[] | null): Map<string, TsMember[]> {
  const members = new Map<string, TsMember[]>();
  for (const statement of statements) {
    const decl = declarationOf(statement);
    if (decl === null || (decl.type !== "ClassDeclaration" && decl.type !== "TSInterfaceDeclaration")) {
      continue;
    }
    const name = nameOf(decl["id"]);
    if (name === local) {
      collectMembers(decl, members);
    } else if (statics !== null && name === `${local}Static`) {
      collectMembers(decl, members, true);
    }
  }
  for (const name of statics ?? []) {
    const list = members.get(name) ?? [];
    const found = list.find((m) => m.static);
    if (found === undefined) {
      list.push({ name, static: true, signatures: [], property: { type: null, optional: false }, matched: false, inherited: false, supplier: null });
      members.set(name, list);
    } else if (found.property === null) {
      found.property = { type: null, optional: false };
    }
  }
  return members;
}

/** A function's parameter names and source defaults, by position (null where none); a `this` parameter is skipped. */
function paramDefaults(fn: Node, text: string): Implementation {
  const names = tsParams(fn["params"]).map((param) => param.name);
  const defaults = nodes(fn["params"])
    .filter((param) => !(param.type === "Identifier" && param["name"] === "this"))
    .map((param) => {
      const target = param.type === "TSParameterProperty" ? node(param["parameter"]) : param;
      if (target === null || target.type !== "AssignmentPattern") {
        return null;
      }
      const right = node(target["right"]);
      return right === null ? null : { node: right, text: text.slice(right.start, right.end) };
    });
  return { names, defaults };
}

/** Source defaults of class `local`'s methods (`static name` / `name`; `constructor`), from implementations (with a body). */
function classDefaults(source: { statements: Node[]; text: string } | undefined, local: string): Map<string, Implementation> {
  const out = new Map<string, Implementation>();
  for (const statement of source?.statements ?? []) {
    const decl = declarationOf(statement);
    if (decl === null || decl.type !== "ClassDeclaration" || nameOf(decl["id"]) !== local) {
      continue;
    }
    for (const member of nodes(node(decl["body"])?.["body"])) {
      const fn = node(member["value"]);
      if (member.type !== "MethodDefinition" || fn === null || fn["body"] === null || fn["body"] === undefined) {
        continue;
      }
      const name = member["kind"] === "constructor" ? "constructor" : nameOf(member["key"]);
      if (name !== null && (member["kind"] === "method" || member["kind"] === "constructor")) {
        out.set(`${member["static"] === true ? "static " : ""}${name}`, paramDefaults(fn, source!.text));
      }
    }
  }
  return out;
}

/** The implementation of function `name` in a source: a function declaration, or a `const` holding an arrow or function expression. */
function functionDefaults(source: { statements: Node[]; text: string } | undefined, name: string): Implementation | null {
  for (const statement of source?.statements ?? []) {
    const decl = declarationOf(statement);
    if (decl !== null && decl.type === "FunctionDeclaration" && nameOf(decl["id"]) === name && node(decl["body"]) !== null) {
      return paramDefaults(decl, source!.text);
    }
    if (decl !== null && decl.type === "VariableDeclaration") {
      for (const declarator of nodes(decl["declarations"])) {
        const init = node(declarator["init"]);
        if (nameOf(declarator["id"]) === name && init !== null && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          return paramDefaults(init, source!.text);
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Module names

/**
 * Resolves a name as a module of a package sees it to what `declared` finds where it is declared: a declaration in the
 * same file, a named or default import from a relative module (`.ts`, `.js` → `.ts`, `/index.ts`; through
 * `export {…} from` and `export * from` re-exports), or an `@xaravel/<c>[/<sub>]` import (the module its `package.json`
 * `exports` or `src/<sub>.ts` / `src/<sub>/index.ts` names, else `unresolvedModule`). An unresolved name is null.
 */
abstract class ModuleNames<T> {
  constructor(private readonly exportsOf: (pkg: string) => Readonly<Record<string, unknown>> | null) {}

  /** The top-level statements of module `file` (`src/<path>.ts`) of `pkg`, or null when there is no such module. */
  protected abstract statements(pkg: string, file: string): readonly Node[] | null;

  /** What `name` stands for when module `file` of `pkg` declares it, else null. */
  protected abstract declared(pkg: string, file: string, name: string): T | null;

  /** Export `name` of an `@xaravel/<pkg>[/<sub>]` specifier no module of `pkg` matches: none. */
  protected unresolvedModule(_pkg: string, _name: string): T | null {
    return null;
  }

  /** A name as a file of `pkg` sees it: declared there, else what its import resolves to. */
  protected resolveLocal(pkg: string, file: string, name: string, seen: Set<string>): T | null {
    const here = this.declared(pkg, file, name);
    if (here !== null) {
      return here;
    }
    for (const statement of this.statements(pkg, file) ?? []) {
      if (statement.type !== "ImportDeclaration") {
        continue;
      }
      for (const specifier of nodes(statement["specifiers"])) {
        if (nameOf(specifier["local"]) !== name) {
          continue;
        }
        const imported = specifier.type === "ImportSpecifier" ? nameOf(specifier["imported"]) : specifier.type === "ImportDefaultSpecifier" ? "default" : null;
        const source = node(statement["source"])?.["value"];
        return imported === null || typeof source !== "string" ? null : this.resolveSpecifier(pkg, file, source, imported, seen);
      }
    }
    return null;
  }

  /** Export `name` of module `specifier` imported from a file of `pkg`. */
  protected resolveSpecifier(pkg: string, file: string, specifier: string, name: string, seen: Set<string>): T | null {
    if (specifier.startsWith(".")) {
      const target = this.moduleFile(pkg, file, specifier);
      return target === null ? null : this.resolveExport(pkg, target, name, seen);
    }
    const match = /^@xaravel\/([^/]+)(\/.*)?$/.exec(specifier);
    if (match === null) {
      return null;
    }
    const target = this.packageModule(match[1]!, match[2] ?? "");
    if (target !== null) {
      return this.resolveExport(match[1]!, target, name, seen);
    }
    return name === "default" ? null : this.unresolvedModule(match[1]!, name);
  }

  /**
   * The source file `@xaravel/<pkg><sub>` names: the target of `.<sub>` (or `.`) in the package's `exports` when it has
   * one there (a string, or a condition object's `bun`, `import` or `default`), else `src<sub>.ts` or `src<sub>/index.ts`
   * (`src/index.ts` for the bare package).
   */
  private packageModule(pkg: string, sub: string): string | null {
    const entry = this.exportsOf(pkg)?.[`.${sub}`];
    const conditions = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null;
    const target = typeof entry === "string" ? entry : [conditions?.["bun"], conditions?.["import"], conditions?.["default"]].find((value) => typeof value === "string");
    const candidates = [...(typeof target === "string" ? [posix.normalize(target)] : []), ...(sub === "" ? ["src/index.ts"] : [`src${sub}.ts`, `src${sub}/index.ts`])];
    return candidates.find((candidate) => this.statements(pkg, candidate) !== null) ?? null;
  }

  /** The source file a relative specifier names: itself when it ends in `.ts`, else `<path>.ts` or `<path>/index.ts`. */
  private moduleFile(pkg: string, file: string, specifier: string): string | null {
    const base = posix.normalize(posix.join(posix.dirname(file), specifier));
    const candidates = base.endsWith(".ts") ? [base] : base.endsWith(".js") ? [`${base.slice(0, -".js".length)}.ts`] : [`${base}.ts`, `${base}/index.ts`];
    return candidates.find((candidate) => this.statements(pkg, candidate) !== null) ?? null;
  }

  /** Export `name` of a file of `pkg`: an `export {…}` (from a module or of a local), a declaration there, then each `export * from`. */
  private resolveExport(pkg: string, file: string, name: string, seen: Set<string>): T | null {
    const key = `${pkg}\0${file}\0${name}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    const statements = this.statements(pkg, file) ?? [];
    for (const statement of statements) {
      const source = node(statement["source"])?.["value"];
      if (statement.type === "ExportNamedDeclaration") {
        for (const specifier of nodes(statement["specifiers"])) {
          const local = nameOf(specifier["local"]);
          if (nameOf(specifier["exported"]) === name && local !== null) {
            return typeof source === "string" ? this.resolveSpecifier(pkg, file, source, local, seen) : this.resolveLocal(pkg, file, local, seen);
          }
        }
      } else if (statement.type === "ExportDefaultDeclaration" && name === "default") {
        const decl = node(statement["declaration"]);
        const local = decl === null ? null : decl.type === "Identifier" ? nameOf(decl) : nameOf(decl["id"]);
        return local === null ? null : this.resolveLocal(pkg, file, local, seen);
      }
    }
    const here = name === "default" ? null : this.declared(pkg, file, name);
    if (here !== null) {
      return here;
    }
    for (const statement of statements) {
      const source = node(statement["source"])?.["value"];
      if (statement.type === "ExportAllDeclaration" && node(statement["exported"]) === null && typeof source === "string") {
        const resolved = this.resolveSpecifier(pkg, file, source, name, seen);
        if (resolved !== null) {
          return resolved;
        }
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heritage (epic-10-retro-item-5, part 3)

/** A package's registrations and parsed sources, as the heritage walk reads them. */
interface HeritagePackage {
  readonly registrations: ReadonlyMap<string, Registration>;
  readonly sources: ReadonlyMap<string, { statements: Node[]; text: string }>;
  /** Registered FQCNs by file, then by local name. */
  readonly byFile: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Registered FQCNs by local name, across the package (an `@xaravel/<c>` import resolves only a unique one). */
  readonly byLocal: ReadonlyMap<string, ReadonlySet<string>>;
}

/** A resolved heritage name: the package registering it and its FQCN. */
interface Resolved {
  readonly pkg: string;
  readonly fqcn: string;
}

function heritagePackage(registrations: ReadonlyMap<string, Registration>, sources: ReadonlyMap<string, { statements: Node[]; text: string }>): HeritagePackage {
  const byFile = new Map<string, Map<string, string>>();
  const byLocal = new Map<string, Set<string>>();
  for (const { fqcn, file, local } of registrations.values()) {
    const inFile = byFile.get(file) ?? new Map<string, string>();
    if (!inFile.has(local)) {
      inFile.set(local, fqcn);
    }
    byFile.set(file, inFile);
    byLocal.set(local, (byLocal.get(local) ?? new Set()).add(fqcn));
  }
  return { registrations, sources, byFile, byLocal };
}

/**
 * The names a class / interface `local` of a file extends or implements: `interface … extends`, `class … extends … implements`
 * (identifiers only); without `implementsToo`, a class's `extends` only.
 */
function heritageNames(statements: readonly Node[], local: string, implementsToo = true): string[] {
  const out: string[] = [];
  for (const statement of statements) {
    const decl = declarationOf(statement);
    if (decl === null || nameOf(decl["id"]) !== local) {
      continue;
    }
    const expressions =
      decl.type === "TSInterfaceDeclaration"
        ? nodes(decl["extends"]).map((h) => h["expression"])
        : decl.type === "ClassDeclaration"
          ? [decl["superClass"], ...(implementsToo ? nodes(decl["implements"]).map((h) => h["expression"]) : [])]
          : [];
    for (const expression of expressions) {
      const n = node(expression);
      if (n !== null && n.type === "Identifier" && typeof n["name"] === "string") {
        out.push(n["name"]);
      }
    }
  }
  return out;
}

/**
 * The transitive TS heritage of registered declarations, read from the package sources and resolved to FQCNs by
 * `ModuleNames`: a name stands for the registration of that local name in the module declaring it, and an
 * `@xaravel/<c>[/…]` import no module matches for that package's registration of the name, when unique. An unresolved
 * name contributes nothing.
 */
class Heritage extends ModuleNames<Resolved> {
  private readonly packages = new Map<string, HeritagePackage | null>();
  private readonly closures = new Map<string, ReadonlySet<string>>();

  constructor(
    current: string,
    currentPackage: HeritagePackage,
    private readonly load: (pkg: string) => readonly SourceFile[],
    exportsOf: (pkg: string) => Readonly<Record<string, unknown>> | null,
  ) {
    super(exportsOf);
    this.packages.set(current, currentPackage);
  }

  /** Every FQCN registration `fqcn` of package `pkg` extends or implements, directly or through its parents. */
  parentsOf(pkg: string, fqcn: string): ReadonlySet<string> {
    const key = `${pkg}\0${fqcn}`;
    const done = this.closures.get(key);
    if (done !== undefined) {
      return done;
    }
    const out = new Set<string>();
    // In progress: a cycle contributes nothing more.
    this.closures.set(key, out);
    const index = this.packageIndex(pkg);
    const registration = index?.registrations.get(fqcn);
    if (index !== null && registration !== undefined) {
      for (const name of heritageNames(index.sources.get(registration.file)?.statements ?? [], registration.local)) {
        const resolved = this.resolveLocal(pkg, registration.file, name, new Set());
        if (resolved !== null) {
          out.add(resolved.fqcn);
          for (const parent of this.parentsOf(resolved.pkg, resolved.fqcn)) {
            out.add(parent);
          }
        }
      }
    }
    return out;
  }

  protected statements(pkg: string, file: string): readonly Node[] | null {
    return this.packageIndex(pkg)?.sources.get(file)?.statements ?? null;
  }

  protected declared(pkg: string, file: string, name: string): Resolved | null {
    const fqcn = this.packageIndex(pkg)?.byFile.get(file)?.get(name);
    return fqcn === undefined ? null : { pkg, fqcn };
  }

  /** No module for the specifier: the package's registration of that local name, when unique. */
  protected override unresolvedModule(pkg: string, name: string): Resolved | null {
    const fqcns = this.packageIndex(pkg)?.byLocal.get(name);
    return fqcns !== undefined && fqcns.size === 1 ? { pkg, fqcn: [...fqcns][0]! } : null;
  }

  private packageIndex(pkg: string): HeritagePackage | null {
    if (!this.packages.has(pkg)) {
      const sources = this.load(pkg);
      if (sources.length === 0) {
        this.packages.set(pkg, null);
      } else {
        const { registrations, sources: parsed } = sourceRegistrations(sources, false);
        this.packages.set(pkg, heritagePackage(registrations, parsed));
      }
    }
    return this.packages.get(pkg) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Supplied members (ESC-14.8-1)

/** A declaration site: the class, interface, const or function `name` of module `file` (`src/<path>.ts`) of package `pkg`. */
interface Site {
  readonly pkg: string;
  readonly file: string;
  readonly name: string;
}

/** Where a supplied member is declared: its class's source defaults and its package's type-literal keys. */
interface Supplier {
  readonly defaults: ReadonlyMap<string, Implementation>;
  readonly typeKeys: Map<string, LiteralKey[][]>;
}

/** The declaration of `name` among top-level statements: each class, interface, declared function or `const` declarator so named. */
function declarationsNamed(statements: readonly Node[], name: string): Node[] {
  const out: Node[] = [];
  for (const statement of statements) {
    const decl = declarationOf(statement);
    if (decl === null) {
      continue;
    }
    if (decl.type === "VariableDeclaration") {
      out.push(...nodes(decl["declarations"]).filter((declarator) => nameOf(declarator["id"]) === name));
    } else if (nameOf(decl["id"]) === name) {
      out.push(decl);
    }
  }
  return out;
}

/** The `typeof <name>` operand names of a type: itself, or each element of a (readonly) tuple. */
function typeofNames(value: unknown): string[] {
  let n = stripParens(value);
  if (n !== null && n.type === "TSTypeOperator" && n["operator"] === "readonly") {
    n = stripParens(n["typeAnnotation"]);
  }
  if (n === null) {
    return [];
  }
  if (n.type === "TSTupleType") {
    return nodes(n["elementTypes"]).flatMap(typeofNames);
  }
  const name = n.type === "TSTypeQuery" ? node(n["exprName"]) : null;
  return name !== null && name.type === "Identifier" && typeof name["name"] === "string" ? [name["name"]] : [];
}

/**
 * The public members a registration gets through its heritage, read from the emitted declarations (each package's
 * `tsc -b` `.d.ts`, the registration's own and any its heritage reaches) and resolved by `ModuleNames`. A class's
 * `extends` names a class, or the `<X>_base` const tsc emits for `extends mixin(Base, A, B)`, typed
 * `Mixed<Base | null, readonly [typeof A, typeof B]>` (`@xaravel/runtime`'s `mixin`): that stands for its traits in
 * order, then Base, PHP's resolution order after the class's own members. An interface's `extends` names interfaces.
 */
class Supplied extends ModuleNames<Site> {
  private readonly declarations = new Map<string, ReadonlyMap<string, Node[]> | null>();
  private readonly sources = new Map<string, Map<string, { statements: Node[]; text: string }>>();
  private readonly sourceTexts = new Map<string, ReadonlyMap<string, string>>();
  private readonly typeKeys = new Map<string, Map<string, LiteralKey[][]>>();
  private readonly suppliers = new Map<string, Supplier>();

  constructor(
    current: string,
    currentPackage: ParsedPackage,
    private readonly loadDeclarations: (pkg: string) => readonly DeclarationFile[],
    private readonly loadSources: (pkg: string) => readonly SourceFile[],
    exportsOf: (pkg: string) => Readonly<Record<string, unknown>> | null,
  ) {
    super(exportsOf);
    this.declarations.set(current, currentPackage.declarations);
    this.sources.set(current, currentPackage.sources);
    this.typeKeys.set(current, currentPackage.typeKeys);
  }

  /**
   * Adds to `members`, a registration's own members, each member its heritage supplies under a name and static side it
   * does not declare, marked `inherited`: the first in PHP's order (the class's traits, then its parent, transitively)
   * wins.
   */
  supply(members: Map<string, TsMember[]>, site: Site): void {
    const seen = new Set([`${site.pkg}\0${site.file}\0${site.name}`]);
    for (const next of this.heritageOf(site)) {
      for (const [name, list] of this.membersOf(next, seen)) {
        const have = members.get(name) ?? [];
        for (const member of list) {
          if (!have.some((m) => m.static === member.static)) {
            have.push({ ...member, inherited: true });
          }
        }
        members.set(name, have);
      }
    }
  }

  /**
   * The function `name` a module of the package exports as `exported` through an `export { … }` specifier, with or
   * without `from` (`export { f as g }`, `export { f }` of a non-exported `declare function f`): its signatures and
   * its implementation's parameter names and defaults; null when it resolves to no declared function.
   */
  exportedFunction(pkg: string, file: string, specifier: Node, source: string | null): { signatures: TsSignature[]; implementation: Implementation | null } | null {
    const local = nameOf(specifier["local"]);
    if (local === null) {
      return null;
    }
    const site = source === null ? this.resolveLocal(pkg, file, local, new Set()) : this.resolveSpecifier(pkg, file, source, local, new Set());
    if (site === null) {
      return null;
    }
    const signatures: TsSignature[] = [];
    for (const decl of declarationsNamed(this.statements(site.pkg, site.file) ?? [], site.name)) {
      if (decl.type === "TSDeclareFunction") {
        signatures.push(fnSignature(decl, true));
      } else if (decl.type === "VariableDeclarator") {
        signatures.push(...functionTypes(node(decl["id"])?.["typeAnnotation"]).map((fn) => fnSignature(fn, true)));
      }
    }
    return signatures.length === 0 ? null : { signatures, implementation: functionDefaults(this.sourceOf(site.pkg, site.file), site.name) };
  }

  protected statements(pkg: string, file: string): readonly Node[] | null {
    if (!this.declarations.has(pkg)) {
      const files = this.loadDeclarations(pkg);
      this.declarations.set(pkg, files.length === 0 ? null : new Map([...files].sort((a, b) => compareUnits(a.file, b.file)).map(({ file: name, text }) => [name, parse(name, text, "dts")])));
    }
    return this.declarations.get(pkg)?.get(file) ?? null;
  }

  protected declared(pkg: string, file: string, name: string): Site | null {
    return declarationsNamed(this.statements(pkg, file) ?? [], name).length > 0 ? { pkg, file, name } : null;
  }

  /** Every public member of class / interface `site`, its own then those its heritage supplies, each with its supplier. */
  private membersOf(site: Site, seen: Set<string>): Map<string, TsMember[]> {
    const members = new Map<string, TsMember[]>();
    const key = `${site.pkg}\0${site.file}\0${site.name}`;
    if (seen.has(key)) {
      return members;
    }
    seen.add(key);
    const supplier = this.supplierOf(site);
    for (const decl of declarationsNamed(this.statements(site.pkg, site.file) ?? [], site.name)) {
      if (decl.type === "ClassDeclaration" || decl.type === "TSInterfaceDeclaration") {
        collectMembers(decl, members, false, supplier);
      }
    }
    for (const next of this.heritageOf(site)) {
      for (const [name, list] of this.membersOf(next, seen)) {
        const have = members.get(name) ?? [];
        have.push(...list.filter((member) => !have.some((m) => m.static === member.static)));
        members.set(name, have);
      }
    }
    return members;
  }

  /** The class and interface sites `site`'s `extends` names, a `Mixed` const expanded (`expand`), in order. */
  private heritageOf(site: Site): Site[] {
    return heritageNames(this.statements(site.pkg, site.file) ?? [], site.name, false).flatMap((name) => this.expand(this.resolveLocal(site.pkg, site.file, name, new Set()), new Set()));
  }

  /**
   * A heritage target: itself when it names a class or interface; for a `const` typed `Mixed<B, Ts>` (a
   * `TSTypeReference` or `import("…").Mixed`), each `typeof T` of the `Ts` tuple, in order, then a `typeof B`; else none.
   */
  private expand(site: Site | null, seen: Set<string>): Site[] {
    const key = site === null ? "" : `${site.pkg}\0${site.file}\0${site.name}`;
    if (site === null || seen.has(key)) {
      return [];
    }
    seen.add(key);
    const decls = declarationsNamed(this.statements(site.pkg, site.file) ?? [], site.name);
    if (decls.some((decl) => decl.type === "ClassDeclaration" || decl.type === "TSInterfaceDeclaration")) {
      return [site];
    }
    const out: Site[] = [];
    for (const decl of decls.filter((d) => d.type === "VariableDeclarator")) {
      const type = stripParens(node(decl["id"])?.["typeAnnotation"]);
      const tail = type === null ? null : type.type === "TSImportType" ? typeNameTail(type["qualifier"]) : type.type === "TSTypeReference" ? typeNameTail(type["typeName"]) : null;
      const args = type === null ? [] : typeArgs(type);
      if (tail !== "Mixed" || args.length !== 2) {
        continue;
      }
      for (const name of [...typeofNames(args[1]), ...typeofNames(args[0])]) {
        out.push(...this.expand(this.resolveLocal(site.pkg, site.file, name, new Set()), seen));
      }
    }
    return out;
  }

  /** The source defaults of class `site` and its package's type-literal keys. */
  private supplierOf(site: Site): Supplier {
    const key = `${site.pkg}\0${site.file}\0${site.name}`;
    let supplier = this.suppliers.get(key);
    if (supplier === undefined) {
      supplier = { defaults: classDefaults(this.sourceOf(site.pkg, site.file), site.name), typeKeys: this.typeKeysOf(site.pkg) };
      this.suppliers.set(key, supplier);
    }
    return supplier;
  }

  /** Module `file` of `pkg`'s source, parsed when first read. */
  private sourceOf(pkg: string, file: string): { statements: Node[]; text: string } | undefined {
    if (!this.sources.has(pkg)) {
      this.sources.set(pkg, new Map());
      this.sourceTexts.set(pkg, new Map(this.loadSources(pkg).map(({ file: name, text }) => [name, text])));
    }
    const parsed = this.sources.get(pkg)!;
    const text = this.sourceTexts.get(pkg)?.get(file);
    if (!parsed.has(file) && text !== undefined) {
      parsed.set(file, { statements: parse(file, text, "ts"), text });
    }
    return parsed.get(file);
  }

  private typeKeysOf(pkg: string): Map<string, LiteralKey[][]> {
    let keys = this.typeKeys.get(pkg);
    if (keys === undefined) {
      keys = new Map();
      for (const statements of this.declarations.get(pkg)?.values() ?? []) {
        addTypeKeys(statements, keys);
      }
      this.typeKeys.set(pkg, keys);
    }
    return keys;
  }
}

/** A declaration's parent failure, or null: the Upstream parents and the TS heritage, each limited to `known` FQCNs. */
function parentsFailure(upstream: readonly string[], ts: ReadonlySet<string>, fqcn: string, known: ReadonlySet<string>): string | null {
  const want = new Set(upstream.filter((parent) => known.has(parent)));
  const have = new Set([...ts].filter((parent) => known.has(parent) && parent !== fqcn));
  const drops = [...want].filter((parent) => !have.has(parent)).sort(compareUnits);
  const adds = [...have].filter((parent) => !want.has(parent)).sort(compareUnits);
  const parts = [...(drops.length > 0 ? [`drops ${drops.join(", ")}`] : []), ...(adds.length > 0 ? [`adds ${adds.join(", ")}`] : [])];
  return parts.length === 0 ? null : `parents: ${parts.join("; ")}`;
}

// ---------------------------------------------------------------------------
// Signature checks

type Literal = { readonly kind: "null" | "bool" | "number" | "string" | "array" | "object"; readonly value: unknown };

/** A PHP default (Reflection's source form) as a comparable literal, or null. */
function phpLiteral(source: string): Literal | null {
  if (source === "null") {
    return { kind: "null", value: null };
  }
  if (source === "true" || source === "false") {
    return { kind: "bool", value: source === "true" };
  }
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source)) {
    return { kind: "number", value: Number(source) };
  }
  if (source === "[]") {
    return { kind: "array", value: null };
  }
  const match = /^'((?:[^'\\]|\\.)*)'$/s.exec(source);
  if (match !== null) {
    return { kind: "string", value: match[1]!.replace(/\\(['\\])/g, "$1") };
  }
  return null;
}

/** A TS source initializer as a comparable literal, or null. */
function tsLiteral(n: Node): Literal | null {
  if (n.type === "Literal") {
    const value = n["value"];
    if (value === null && n["raw"] === "null") {
      return { kind: "null", value: null };
    }
    if (typeof value === "boolean") {
      return { kind: "bool", value };
    }
    if (typeof value === "number") {
      return { kind: "number", value };
    }
    if (typeof value === "string") {
      return { kind: "string", value };
    }
    return null;
  }
  if (n.type === "UnaryExpression" && n["operator"] === "-") {
    const argument = node(n["argument"]);
    if (argument !== null && argument.type === "Literal" && typeof argument["value"] === "number") {
      return { kind: "number", value: -argument["value"] };
    }
    return null;
  }
  if (n.type === "ArrayExpression" && Array.isArray(n["elements"]) && n["elements"].length === 0) {
    return { kind: "array", value: null };
  }
  if (n.type === "ObjectExpression" && Array.isArray(n["properties"]) && n["properties"].length === 0) {
    return { kind: "object", value: null };
  }
  return null;
}

function literalsEqual(php: Literal, ts: Literal): boolean {
  if (php.kind === "array") {
    return ts.kind === "array" || ts.kind === "object";
  }
  return php.kind === ts.kind && Object.is(php.value, ts.value);
}

/** The failures of one Upstream parameter against one TS parameter (`position` is 1-based). */
function paramFailures(p: UpstreamParameter, t: TsParam, position: number, fallback: SourceDefault | null): string[] {
  const out: string[] = [];
  const expected = camel(p.name);
  if (RESERVED.has(expected)) {
    const failure = reservedNameFailure(p.name, expected, t.name, position);
    if (failure !== null) {
      out.push(failure);
    }
  } else if (t.name !== expected) {
    out.push(`parameter ${position} is ${t.name}, Upstream ${p.name}`);
  }
  if (p.variadic && !t.rest) {
    out.push(`parameter ${position} is not a rest parameter, Upstream variadic`);
  } else if (!p.variadic && t.rest) {
    out.push(`parameter ${position} is a rest parameter, Upstream not variadic`);
  }
  if (p.optional && !t.optional) {
    out.push(`parameter ${position} is not optional`);
  } else if (!p.optional && t.optional) {
    out.push(`parameter ${position} is optional, Upstream required`);
  }
  if (p.default !== null && fallback !== null) {
    const php = phpLiteral(p.default);
    const ts = tsLiteral(fallback.node);
    if (php !== null && ts !== null && !literalsEqual(php, ts)) {
      out.push(`parameter ${position} default ${fallback.text}, Upstream ${p.default}`);
    }
  }
  if (p.type !== null) {
    const nullable = admitsNull(t.rest ? elementType(t.type) : t.type);
    if (p.nullable && !nullable) {
      out.push(`parameter ${position} is not nullable`);
    } else if (!p.nullable && nullable) {
      out.push(`parameter ${position} is nullable, Upstream ${p.type}`);
    }
  }
  return out;
}

interface CheckContext {
  readonly typeKeys: Map<string, LiteralKey[][]>;
  /** The implementation's parameter names and source defaults, or null when there is none. */
  readonly implementation: Implementation | null;
  /** The member's signature count: one signature always takes the implementation's defaults. */
  readonly signatures: number;
}

/** An implementation's parameter names (no `this`) and their source defaults, by position. */
interface Implementation {
  readonly names: readonly string[];
  readonly defaults: readonly (SourceDefault | null)[];
}

function staticFailures(upstreamStatic: boolean, tsStatic: boolean): string[] {
  if (upstreamStatic === tsStatic) {
    return [];
  }
  return [upstreamStatic ? "is not static, Upstream static" : "is static, Upstream not static"];
}

function returnFailures(up: UpstreamRecord, sig: TsSignature): string[] {
  if (!sig.hasReturn) {
    return [];
  }
  const out: string[] = [];
  if (holdsUndefined(sig.returns)) {
    out.push("returns undefined (AD-9)");
  }
  const returns = up.returns ?? null;
  if (returns !== null && returns !== "void" && returns !== "never" && sig.returns !== null) {
    const nullable = admitsNull(unwrapPromise(sig.returns));
    if (up.nullable === true && !nullable) {
      out.push(`return is not nullable, Upstream ${returns}`);
    } else if (up.nullable === false && nullable) {
      out.push(`return is nullable, Upstream ${returns}`);
    }
  }
  return out;
}

/**
 * The key lists of a TS type that is (or names an interface / type alias that is) a type literal. A union is none: no
 * union stands for the options object (AD-26), and `optionsFailures` reports it.
 */
function literalKeyLists(value: unknown, typeKeys: Map<string, LiteralKey[][]>): LiteralKey[][] {
  const n = stripParens(value);
  if (n === null) {
    return [];
  }
  if (n.type === "TSTypeLiteral") {
    return [literalKeys(n["members"])];
  }
  if (n.type === "TSTypeReference") {
    const name = typeNameTail(n["typeName"]);
    return name === null ? [] : (typeKeys.get(name) ?? []);
  }
  return [];
}

/** Whether a TS type is a union with a member (through parentheses) that is a type literal or names an interface / type-literal alias. */
function unionOfOptions(value: unknown, typeKeys: Map<string, LiteralKey[][]>): boolean {
  const n = stripParens(value);
  return n !== null && n.type === "TSUnionType" && nodes(n["types"]).some((member) => literalKeyLists(member, typeKeys).length > 0);
}

/** The failures of one signature against an Upstream method or function, positional form. */
function positionalFailures(params: readonly UpstreamParameter[], sig: TsSignature, ctx: CheckContext): string[] {
  const out: string[] = [];
  const count = Math.max(params.length, sig.params.length);
  for (let i = 0; i < count; i++) {
    const p = params[i];
    const t = sig.params[i];
    if (p === undefined) {
      out.push(`parameter ${i + 1} (${t!.name}) is extra`);
    } else if (t === undefined) {
      out.push(`parameter ${i + 1} (${p.name}) is missing`);
    } else {
      out.push(...paramFailures(p, t, i + 1, defaultsFor(sig, ctx)[i] ?? null));
    }
  }
  return out;
}

/** A signature's source defaults: the implementation's, when the member has one signature or the names agree; else none. */
function defaultsFor(sig: TsSignature, ctx: CheckContext): readonly (SourceDefault | null)[] {
  const impl = ctx.implementation;
  if (impl === null) {
    return [];
  }
  const same = sig.params.length === impl.names.length && sig.params.every((param, i) => param.name === impl.names[i]);
  return ctx.signatures === 1 || same ? impl.defaults : [];
}

/**
 * The failures of one signature in the AD-26 options form: the required parameters positionally, then one optional
 * options object (a type literal, or an interface / type alias that is one; never a union) whose keys are exactly the
 * optional parameters' names, each optional and, when the Upstream parameter is typed, nullable exactly when it is,
 * then a rest parameter when Upstream ends with a variadic one.
 */
function optionsFailures(params: readonly UpstreamParameter[], sig: TsSignature, ctx: CheckContext): string[] {
  const required = params.filter((p) => !p.optional);
  const optional = params.filter((p) => p.optional && !p.variadic);
  const variadic = params.find((p) => p.variadic) ?? null;
  const out = positionalFailures(required, { ...sig, params: sig.params.slice(0, required.length) }, ctx);
  const keys = optional.map((p) => camel(p.name));
  const position = required.length + 1;
  const options = sig.params[required.length];
  const sorted = (names: readonly string[]): string => [...names].sort(compareUnits).join("\0");
  const match = options === undefined || options.rest ? undefined : literalKeyLists(options.type, ctx.typeKeys).find((list) => sorted(list.map((key) => key.name)) === sorted(keys));
  if (options === undefined) {
    out.push(`parameter ${position} (options) is missing`);
  } else if (!options.rest && unionOfOptions(options.type, ctx.typeKeys)) {
    out.push(`parameter ${position} is a union, not an options object with keys ${keys.join(", ")} (AD-26)`);
  } else if (match === undefined) {
    out.push(`parameter ${position} is not an options object with keys ${keys.join(", ")}`);
  } else {
    if (!options.optional) {
      out.push(`parameter ${position} is not optional`);
    }
    for (const key of match.filter((k) => !k.optional)) {
      out.push(`parameter ${position} key ${key.name} is not optional`);
    }
    // Each key's type, by the positional rule: nullable exactly when the Upstream parameter is, when it is typed.
    for (const key of match) {
      const up = optional.find((q) => camel(q.name) === key.name);
      if (up === undefined || up.type === null) {
        continue;
      }
      if (up.nullable && !key.nullable) {
        out.push(`parameter ${position} key ${key.name} is not nullable`);
      } else if (!up.nullable && key.nullable) {
        out.push(`parameter ${position} key ${key.name} is nullable, Upstream ${up.type}`);
      }
    }
  }
  let next = required.length + 1;
  if (variadic !== null) {
    const rest = sig.params[next];
    if (rest === undefined) {
      out.push(`parameter ${next + 1} (${variadic.name}) is missing`);
    } else {
      out.push(...paramFailures(variadic, rest, next + 1, null));
    }
    next++;
  }
  for (let i = next; i < sig.params.length; i++) {
    out.push(`parameter ${i + 1} (${sig.params[i]!.name}) is extra`);
  }
  return out;
}

/** The prefix of an options-form failure in a `mismatch` details string, keeping it apart from a positional one. */
const OPTIONS_PREFIX = "options overload: ";

/**
 * The failures of a method / function over its signatures. The positional form must be met by some signature (the best
 * one's failures otherwise). When Upstream has two or more optional non-variadic parameters, AD-26 says the member
 * "also accepts" the options object, so an options-form signature is required as well, and its best signature's
 * failures follow, each prefixed `options overload: `.
 */
function signatureFailures(up: UpstreamRecord, signatures: readonly TsSignature[], tsStatic: boolean, ctx: CheckContext): string[] {
  const params = up.parameters ?? [];
  const head = (sig: TsSignature): string[] => [...(up.kind === "function" ? [] : staticFailures(up.static === true, tsStatic)), ...returnFailures(up, sig)];
  const positional = bestFailures(signatures.map((sig) => [...head(sig), ...positionalFailures(params, sig, ctx)]));
  if (params.filter((p) => p.optional && !p.variadic).length < 2) {
    return positional;
  }
  // `static` belongs to the member, so the positional form alone reports it.
  const options = bestFailures(signatures.map((sig) => [...returnFailures(up, sig), ...optionsFailures(params, sig, ctx)]));
  // A failure every signature shares (a return check) is reported once, in the positional failures.
  return [...positional, ...options.filter((failure) => !positional.includes(failure)).map((failure) => `${OPTIONS_PREFIX}${failure}`)];
}

/** The failures of a property, constant or case against a TS property. */
function propertyFailures(up: UpstreamRecord, member: TsMember): string[] {
  const out = staticFailures(up.static === true, member.static);
  if (member.property?.optional === true || holdsUndefined(member.property?.type ?? null)) {
    out.push("returns undefined (AD-9)");
  }
  const type = up.type ?? null;
  if (up.kind === "property" && type !== null) {
    const nullable = admitsNull(member.property?.type ?? null);
    if (up.nullable === true && !nullable) {
      out.push(`is not nullable, Upstream ${type}`);
    } else if (up.nullable === false && nullable) {
      out.push(`is nullable, Upstream ${type}`);
    }
  }
  return out;
}

/** The best (fewest failures, first on a tie) failures over signatures; empty when any passes. */
function bestFailures(all: readonly string[][]): string[] {
  let best: string[] | null = null;
  for (const failures of all) {
    if (failures.length === 0) {
      return [];
    }
    if (best === null || failures.length < best.length) {
      best = failures;
    }
  }
  return best ?? [];
}

// ---------------------------------------------------------------------------
// The diff

/** The component's diff (pure): the Upstream records against the package's declarations and sources. Throws on a parse error. */
export function diffComponent(input: DiffInput): ComponentDiff {
  const { component } = input;
  const pkg = parsePackage(input.declarations, input.sources);
  const items: Item[] = [];
  let matched = 0;

  // Citations, marked when they explain something.
  const additions = input.additions.filter((line) => line.component === component).map((line) => ({ line, used: false }));
  const exceptions = input.exceptions.filter((line) => line.component === component).map((line) => ({ line, used: false }));
  type Cited = (typeof additions)[number];
  const find = (list: Cited[], fqcn: string, member: string | null): Cited | null =>
    list.find((c) => c.line.fqcn === fqcn && c.line.member === member) ?? list.find((c) => c.line.fqcn === fqcn && c.line.member === null) ?? null;
  const explain = (category: Category, fqcn: string, member: string | null, to: string | null): string | null => {
    const found: Cited[] = [];
    if (category === "missing" || category === "mismatch" || category === "renamed") {
      const e = find(exceptions, fqcn, member);
      if (e === null) {
        return null;
      }
      found.push(e);
    }
    if (category === "extra" || category === "renamed") {
      const a = find(additions, fqcn, category === "extra" ? member : to);
      if (a === null) {
        return null;
      }
      found.push(a);
    }
    for (const c of found) {
      c.used = true;
    }
    return [...new Set(found.map((c) => c.line.citation))].join(", ");
  };
  const add = (category: Category, kind: string, fqcn: string, member: string | null, details: string | null = null, to: string | null = null): void => {
    items.push({ category, kind, fqcn, member, to, details, explained: COUNTED.has(category) ? explain(category, fqcn, member, to) : null });
  };

  // DIV-12: the Upstream members not expected (`option-pair` records included: they are checked per declaration
  // below), and the `model-config` methods with a decided rename (DIV12_RENAMES), keyed `<fqcn>\0<kind>\0<name>`.
  const notExpected = new Map<string, string>();
  const renames = new Map<string, string>();
  for (const pair of input.div12) {
    // Each side's rule applies on the pair's class and on that side's declaring class.
    const owners = (kind: "property" | "method"): Set<string> => {
      const declaredIn = pair[kind]?.declaredIn;
      return new Set([pair.class, ...(typeof declaredIn === "string" ? [declaredIn] : [])]);
    };
    const set = (kind: "property" | "method"): void => {
      for (const owner of owners(kind)) {
        const at = `${owner}\0${kind}\0${pair.name}`;
        if (!notExpected.has(at)) {
          notExpected.set(at, pair.classification);
        }
      }
    };
    if (pair.classification === "option-pair") {
      set("property");
      set("method");
    } else if (pair.classification === "method-plus-state") {
      set("property");
    } else if (pair.classification === "model-config") {
      const target = DIV12_RENAMES.get(pair.name);
      if (target === undefined) {
        set("method");
      } else {
        for (const owner of owners("method")) {
          renames.set(`${owner}\0method\0${pair.name}`, target);
        }
      }
    }
  }

  // Group the Upstream records by declaration.
  const declarations = new Map<string, { decl: UpstreamRecord; members: UpstreamRecord[] }>();
  const functions: UpstreamRecord[] = [];
  for (const record of input.upstream) {
    if (record.kind === "function") {
      functions.push(record);
    } else if (record.member === null) {
      declarations.set(record.fqcn, { decl: record, members: declarations.get(record.fqcn)?.members ?? [] });
    } else {
      const entry = declarations.get(record.fqcn);
      if (entry === undefined) {
        throw new Error(`${record.fqcn}::${record.member} comes before its declaration line`);
      }
      entry.members.push(record);
    }
  }

  // Parents (epic-10-retro-item-5, part 3): the record's against the registration's walked TS heritage.
  // Traits are left out: Upstream `parents` never lists one.
  const known = input.known ?? new Set([...declarations].filter(([, { decl }]) => decl.kind !== "trait").map(([fqcn]) => fqcn));
  const heritage = new Heritage(component, heritagePackage(pkg.registrations, pkg.sources), input.packageSources ?? (() => []), input.packageExports ?? (() => null));
  const supplied = new Supplied(component, pkg, input.packageDeclarations ?? (() => []), input.packageSources ?? (() => []), input.packageExports ?? (() => null));

  for (const [fqcn, { decl, members: upstreamMembers }] of declarations) {
    const registration = pkg.registrations.get(fqcn);
    if (registration === undefined) {
      add("missing", decl.kind, fqcn, null);
      continue;
    }
    const parents = decl.parents === undefined ? null : parentsFailure(decl.parents, heritage.parentsOf(component, fqcn), fqcn, known);
    if (parents === null) {
      matched++;
    } else {
      add("mismatch", decl.kind, fqcn, null, parents);
    }
    const members = classMembers(pkg.declarations.get(registration.file) ?? [], registration.local, registration.statics);
    supplied.supply(members, { pkg: component, file: registration.file, name: registration.local });
    const defaults = classDefaults(pkg.sources.get(registration.file), registration.local);
    const unmatched: UpstreamRecord[] = [];
    // Option pairs (AD-26) on a non-trait declaration whose neither form is declared: one `missing` is reported per name.
    const neither = new Set<string>();
    // The Xaravel name of an Upstream member: a decided DIV-12 rename, else the parity mapping.
    const mappedName = (up: UpstreamRecord): string =>
      up.kind === "method" ? (renames.get(`${fqcn}\0method\0${up.member}`) ?? memberName(up.member!)) : up.kind === "property" ? camel(up.member!) : up.member!;
    for (const up of upstreamMembers) {
      const role = up.kind === "method" ? "method" : "property";
      const classification = notExpected.get(`${fqcn}\0${role}\0${up.member}`);
      if (classification === "option-pair" && decl.kind !== "trait") {
        // Either Xaravel form (a property or a method of the mapped name) satisfies the pair, and is not extra; a
        // trait is exempt, as AD-26's base classes declare neither form.
        const forms = members.get(camel(up.member!)) ?? [];
        for (const form of forms) {
          form.matched = true;
        }
        if (forms.length === 0 && !neither.has(up.member!)) {
          neither.add(up.member!);
          add("missing", up.kind, fqcn, up.member, "option pair: neither form is declared (DIV-12, AD-26)");
          continue;
        }
      }
      if (classification !== undefined) {
        add("div12", up.kind, fqcn, up.member, classification);
        continue;
      }
      const name = mappedName(up);
      const candidates = (members.get(name) ?? []).filter((m) => (role === "method" ? m.signatures.length > 0 : m.property !== null));
      const member = candidates.find((m) => m.static === (up.static === true)) ?? candidates[0];
      if (member === undefined) {
        // The same name in the other role: a mismatch, not a rename.
        const other = (members.get(name) ?? []).find((m) => !m.matched);
        if (other !== undefined) {
          other.matched = true;
          add("mismatch", up.kind, fqcn, up.member, role === "method" ? "is a property, Upstream method" : `is a method, Upstream ${up.kind}`);
        } else {
          unmatched.push(up);
        }
        continue;
      }
      member.matched = true;
      let failures: string[];
      if (role === "method") {
        const key = `${member.static ? "static " : ""}${member.name}`;
        const ctx = { typeKeys: member.supplier?.typeKeys ?? pkg.typeKeys, implementation: (member.supplier?.defaults ?? defaults).get(key) ?? null, signatures: member.signatures.length };
        failures = signatureFailures(up, member.signatures, member.static, ctx);
      } else {
        failures = propertyFailures(up, member);
      }
      if (failures.length > 0) {
        add("mismatch", up.kind, fqcn, up.member, failures.join("; "));
      } else {
        matched++;
      }
    }
    // Renamed: an unmatched Upstream member and an unmatched Xaravel member whose mapped names are equal case-insensitively.
    const extras = [...members.values()].flat().filter((m) => !m.matched);
    for (const up of unmatched) {
      const target = up.kind === "method" ? (renames.get(`${fqcn}\0method\0${up.member}`) ?? null) : null;
      const mapped = mappedName(up).toLowerCase();
      const at = extras.findIndex((m) => m.name.toLowerCase() === mapped);
      if (at >= 0) {
        const [other] = extras.splice(at, 1);
        other!.matched = true;
        add("renamed", up.kind, fqcn, up.member, null, other!.name);
      } else {
        add("missing", up.kind, fqcn, up.member, target === null ? null : `expected as ${target} (DIV-12)`);
      }
    }
    for (const member of extras.filter((m) => !m.inherited)) {
      add("extra", member.signatures.length > 0 ? "method" : "property", fqcn, member.name);
    }
  }

  // Registered FQCNs the component file lacks.
  for (const fqcn of pkg.registrations.keys()) {
    if (!declarations.has(fqcn)) {
      add("extra", "class", fqcn, null);
    }
  }

  // Functions, by short name: those exported through an `export { … }` specifier too (`export { f as g }`).
  for (const [file, statements] of pkg.declarations) {
    for (const statement of statements) {
      const source = node(statement["source"])?.["value"];
      if (statement.type !== "ExportNamedDeclaration" || statement["exportKind"] === "type") {
        continue;
      }
      for (const specifier of nodes(statement["specifiers"])) {
        const exported = nameOf(specifier["exported"]);
        const found = exported === null || pkg.functions.has(exported) || specifier["exportKind"] === "type" ? null : supplied.exportedFunction(component, file, specifier, typeof source === "string" ? source : null);
        if (found !== null) {
          pkg.functions.set(exported!, { file, ...found });
        }
      }
    }
  }
  for (const up of functions) {
    // PORTING.md keeps a bare function name verbatim (`data_get`); a camelCase export of it still matches.
    const short = up.fqcn.slice(up.fqcn.lastIndexOf("\\") + 1);
    const name = pkg.functions.has(short) ? short : camel(short);
    const fn = pkg.functions.get(name);
    if (fn === undefined) {
      add("missing", "function", up.fqcn, null);
      continue;
    }
    const ctx = { typeKeys: pkg.typeKeys, implementation: fn.implementation !== undefined ? fn.implementation : functionDefaults(pkg.sources.get(fn.file), name), signatures: fn.signatures.length };
    const failures = signatureFailures(up, fn.signatures, false, ctx);
    if (failures.length > 0) {
      add("mismatch", "function", up.fqcn, null, failures.join("; "));
    } else {
      matched++;
    }
  }

  // Stable by FQCN; stale citation lines last.
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => compareUnits(a.item.fqcn, b.item.fqcn) || a.index - b.index).map(({ item }) => item);
  for (const [kind, list] of [
    ["addition", additions],
    ["exception", exceptions],
  ] as const) {
    for (const { line, used } of list) {
      if (!used) {
        sorted.push({ category: "stale", kind, fqcn: line.fqcn, member: line.member, to: null, details: line.citation, explained: null });
      }
    }
  }
  return { component, upstream: input.upstream.length, matched, items: sorted };
}

// ---------------------------------------------------------------------------
// Rendering

export interface Counts {
  readonly upstream: number;
  readonly matched: number;
  readonly missing: number;
  readonly renamed: number;
  readonly extra: number;
  readonly mismatched: number;
  readonly div12: number;
  readonly unexplained: number;
}

export function countsOf(diff: ComponentDiff): Counts {
  const count = (category: Category): number => diff.items.filter((item) => item.category === category).length;
  return {
    upstream: diff.upstream,
    matched: diff.matched,
    missing: count("missing"),
    renamed: count("renamed"),
    extra: count("extra"),
    mismatched: count("mismatch"),
    div12: count("div12"),
    unexplained: unexplained(diff).length,
  };
}

/** The counted items with no explanation. */
export function unexplained(diff: ComponentDiff): Item[] {
  return diff.items.filter((item) => COUNTED.has(item.category) && item.explained === null);
}

/** `<c>: <category> <kind> <fqcn>[::<member>[ -> <to>]][: <details>][ (explained: <citation>)]`. */
export function renderItem(component: string, item: Item): string {
  const member = item.member === null ? "" : `::${item.member}${item.to === null ? "" : ` -> ${item.to}`}`;
  const details = item.details === null ? "" : `: ${item.details}`;
  const explained = item.explained === null ? "" : ` (explained: ${item.explained})`;
  return `${component}: ${item.category} ${item.kind} ${item.fqcn}${member}${details}${explained}`;
}

export function renderSummary(diff: ComponentDiff): string {
  const c = countsOf(diff);
  return `api-surface ${diff.component}: ${c.upstream} Upstream, ${c.matched} matched, ${c.missing} missing, ${c.renamed} renamed, ${c.extra} extra, ${c.mismatched} mismatched, ${c.div12} div12; ${c.unexplained} unexplained (AD-15)`;
}

/** The per-Component markdown table, with a Total row. */
export function renderMarkdown(diffs: readonly ComponentDiff[]): string {
  const header = ["Component", "Upstream", "Matched", "Missing", "Renamed", "Extra", "Mismatched", "Unexplained"];
  const row = (cells: readonly (string | number)[]): string => `| ${cells.join(" | ")} |`;
  const total = { upstream: 0, matched: 0, missing: 0, renamed: 0, extra: 0, mismatched: 0, unexplained: 0 };
  const lines = [row(header), `| --- |${" ---: |".repeat(header.length - 1)}`];
  for (const diff of diffs) {
    const c = countsOf(diff);
    for (const key of Object.keys(total) as (keyof typeof total)[]) {
      total[key] += c[key];
    }
    lines.push(row([diff.component, c.upstream, c.matched, c.missing, c.renamed, c.extra, c.mismatched, c.unexplained]));
  }
  lines.push(row(["**Total**", total.upstream, total.matched, total.missing, total.renamed, total.extra, total.mismatched, total.unexplained]));
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Reading the repository

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The JSON objects of a `.jsonl` file under `root`; throws naming the file and line. */
function readJsonl(root: string, path: string): Record<string, unknown>[] {
  let text: string;
  try {
    text = readFileSync(join(root, path), "utf8");
  } catch (error) {
    throw new Error(`cannot read ${path}: ${(error as Error).message}`);
  }
  const out: Record<string, unknown>[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: not JSON: ${(error as Error).message}`);
    }
    if (!isObject(value)) {
      throw new Error(`${path}:${index + 1}: not a JSON object`);
    }
    out.push(value);
  });
  return out;
}

const KINDS = new Set(["class", "interface", "trait", "enum", "method", "property", "constant", "case", "function"]);

function readUpstream(root: string, component: string): UpstreamRecord[] {
  const path = `${API_SURFACE_DIR}/${component}.jsonl`;
  return readJsonl(root, path).map((value, index) => {
    const member = value["member"];
    if (typeof value["fqcn"] !== "string" || typeof value["kind"] !== "string" || !KINDS.has(value["kind"]) || (member !== null && typeof member !== "string")) {
      throw new Error(`${path}:${index + 1}: not an API-surface record`);
    }
    if ((value["kind"] === "method" || value["kind"] === "function") && !Array.isArray(value["parameters"])) {
      throw new Error(`${path}:${index + 1}: a ${value["kind"]} needs its parameters`);
    }
    // A committed declaration always carries its parents (schema.json#/$defs/declaration); only inline input may omit them.
    const parents = value["parents"];
    if (member === null && value["kind"] !== "function" && !(Array.isArray(parents) && parents.every((parent) => typeof parent === "string"))) {
      throw new Error(`${path}:${index + 1}: a declaration needs its parents`);
    }
    return value as unknown as UpstreamRecord;
  });
}

/** One citation file's lines; a line whose `component` is not in `known` (no `<component>.jsonl`) fails. */
function readCitations(root: string, name: "additions" | "exceptions", known: readonly string[]): CitationLine[] {
  const path = `${API_SURFACE_DIR}/${name}.jsonl`;
  return readJsonl(root, path).map((value, index) => {
    const member = value["member"];
    if (typeof value["component"] !== "string" || typeof value["fqcn"] !== "string" || (member !== null && typeof member !== "string") || typeof value["citation"] !== "string") {
      throw new Error(`${path}:${index + 1}: not a {"component","fqcn","member","citation"} line`);
    }
    if (!known.includes(value["component"])) {
      throw new Error(`${path}:${index + 1}: unknown component ${value["component"]} (no ${API_SURFACE_DIR}/${value["component"]}.jsonl)`);
    }
    return value as unknown as CitationLine;
  });
}

function readDiv12(root: string): Div12Pair[] {
  return readJsonl(root, DIV12_PAIRS).map((value, index) => {
    if (typeof value["class"] !== "string" || typeof value["name"] !== "string" || typeof value["classification"] !== "string") {
      throw new Error(`${DIV12_PAIRS}:${index + 1}: not a DIV-12 pair`);
    }
    return value as unknown as Div12Pair;
  });
}

/** `packages/<pkg>/src/**\/*.ts` (not `.d.ts`), as `src/<path>.ts`. */
function packageSources(root: string, pkg: string): SourceFile[] {
  const dir = join(root, "packages", pkg);
  const src = join(dir, "src");
  if (!existsSync(src)) {
    return [];
  }
  const out: SourceFile[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
        out.push({ file: relative(dir, path).split(sep).join("/"), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(src);
  return out;
}

/** The components under `root`: `conformance/api-surface/*.jsonl` other than the citation files, sorted. */
export function componentsOf(root: string): string[] {
  const dir = join(root, API_SURFACE_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => name.slice(0, -".jsonl".length))
    .filter((name) => !CITATION_NAMES.has(name))
    .sort(compareUnits);
}

/** Builds and diffs `components` under `root`. Throws on any tool failure. */
export function diffComponents(root: string, components: readonly string[]): ComponentDiff[] {
  const withPackage = components.filter((c) => existsSync(join(root, "packages", c, "package.json")));
  if (withPackage.length > 0) {
    const failure = emitDeclarations(root, withPackage.map((c) => join(root, "packages", c)));
    if (failure !== null) {
      throw new Error(failure);
    }
  }
  const known = componentsOf(root);
  const additions = readCitations(root, "additions", known);
  const exceptions = readCitations(root, "exceptions", known);
  const div12 = readDiv12(root);
  // The parents compared are declarations of the Upstream surface, any component (epic-10-retro-item-5, part 3).
  const upstream = new Map<string, UpstreamRecord[]>();
  for (const component of known) {
    try {
      upstream.set(component, readUpstream(root, component));
    } catch (error) {
      throw new Error(`${component}: ${(error as Error).message}`);
    }
  }
  const fqcns = new Set([...upstream.values()].flat().filter((record) => record.member === null && record.kind !== "function" && record.kind !== "trait").map((record) => record.fqcn));
  const loaded = new Map<string, readonly SourceFile[]>();
  const sourcesOf = (pkg: string): readonly SourceFile[] => {
    if (!loaded.has(pkg)) {
      loaded.set(pkg, /^[a-z0-9-]+$/.test(pkg) ? packageSources(root, pkg) : []);
    }
    return loaded.get(pkg)!;
  };
  const exportsOf = (pkg: string): Readonly<Record<string, unknown>> | null => {
    const path = join(root, "packages", pkg, "package.json");
    if (!/^[a-z0-9-]+$/.test(pkg) || !existsSync(path)) {
      return null;
    }
    const exports = (JSON.parse(readFileSync(path, "utf8")) as { exports?: unknown }).exports;
    return typeof exports === "string" ? { ".": exports } : isObject(exports) ? exports : null;
  };
  // Another package's last emitted declarations (`tsc -b` above built every package the diffed ones reference), or none.
  const declared = new Map<string, readonly DeclarationFile[]>();
  const declarationsOf = (pkg: string): readonly DeclarationFile[] => {
    if (!declared.has(pkg)) {
      let files: readonly DeclarationFile[] = [];
      if (/^[a-z0-9-]+$/.test(pkg) && existsSync(join(root, "packages", pkg, "tsconfig.json"))) {
        try {
          files = packageDeclarations(root, pkg);
        } catch {
          files = [];
        }
      }
      declared.set(pkg, files);
    }
    return declared.get(pkg)!;
  };
  return components.map((component) => {
    const has = withPackage.includes(component);
    try {
      return diffComponent({
        component,
        upstream: upstream.get(component) ?? readUpstream(root, component),
        additions,
        exceptions,
        div12,
        declarations: has ? packageDeclarations(root, component) : [],
        sources: has ? packageSources(root, component) : [],
        known: fqcns,
        packageSources: sourcesOf,
        packageExports: exportsOf,
        packageDeclarations: declarationsOf,
      });
    } catch (error) {
      throw new Error(`${component}: ${(error as Error).message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// CLI

function usage(message: string): number {
  console.error(`api-surface: ${message}`);
  console.error("usage: bun run api-surface [--root <dir>] [--details] [--markdown <file>] (<component>… | --all)");
  console.error("       bun run api-surface:gate [--root <dir>] <component>…");
  return 2;
}

/** The CLI. Returns the exit code. */
export function main(argv: readonly string[]): number {
  let root = REPO_ROOT;
  let gate = false;
  let details = false;
  let all = false;
  let markdown: string | null = null;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--gate") {
      gate = true;
    } else if (arg === "--details") {
      details = true;
    } else if (arg === "--all") {
      all = true;
    } else if (arg === "--root" || arg === "--markdown") {
      const value = argv[++i];
      if (value === undefined) {
        return usage(`${arg} needs a value`);
      }
      if (arg === "--root") {
        root = resolve(value);
      } else {
        markdown = resolve(value);
      }
    } else if (arg.startsWith("-")) {
      return usage(`unknown option ${arg}`);
    } else if (!names.includes(arg)) {
      names.push(arg);
    }
  }
  if (all === (names.length > 0)) {
    return usage("name components or pass --all (not both)");
  }
  if (gate && (details || markdown !== null)) {
    return usage("--gate takes no --details or --markdown");
  }
  const known = componentsOf(root);
  for (const name of names) {
    if (!known.includes(name)) {
      console.error(`api-surface: unknown component ${name} (no ${API_SURFACE_DIR}/${name}.jsonl)`);
      return 2;
    }
  }
  const components = all ? known : names;

  let diffs: ComponentDiff[];
  try {
    diffs = diffComponents(root, components);
  } catch (error) {
    const message = (error as Error).message;
    const at = message.lastIndexOf("tsc -b failed");
    if (at >= 0) {
      process.stderr.write(message.slice(0, at));
      console.error(`api-surface: ${message.slice(at)}`);
    } else {
      console.error(`api-surface: ${message}`);
    }
    return 1;
  }

  if (gate) {
    let failed = false;
    for (const diff of diffs) {
      const open = unexplained(diff);
      for (const item of open) {
        console.log(renderItem(diff.component, item));
      }
      console.log(`api-surface:gate ${diff.component}: ${open.length} unexplained (AD-15)`);
      failed ||= open.length > 0;
    }
    // The citation files must also pass the oracle tool's validation (schema, canonical form, order; AD-15).
    let problems: string[];
    try {
      problems = checkCitations(root);
    } catch (error) {
      console.error(`api-surface: ${(error as Error).message}`);
      return 1;
    }
    for (const problem of problems) {
      console.log(`api-surface:gate citation problem: ${problem}`);
    }
    if (problems.length > 0) {
      console.log(`api-surface:gate citations: ${problems.length} problem(s) (AD-15)`);
    }
    return failed || problems.length > 0 ? 1 : 0;
  }

  for (const diff of diffs) {
    if (details) {
      for (const item of diff.items) {
        console.log(renderItem(diff.component, item));
      }
    }
    console.log(renderSummary(diff));
  }
  if (markdown !== null) {
    try {
      writeFileSync(markdown, renderMarkdown(diffs));
    } catch (error) {
      console.error(`api-surface: ${(error as Error).message}`);
      return 1;
    }
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
