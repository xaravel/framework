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
// A `model-config` method with a decided DIV-12 rename (`DIV12_RENAMES`:
// `fillable` → `setFillable`, `touches` → `isTouching`) is matched under its
// new name. An `option-pair` on a non-trait declaration is satisfied by either
// Xaravel form and is `missing` when neither is declared. A member with two or
// more optional non-variadic Upstream parameters needs a positional and an
// options-form signature (AD-26 "also accepts"; options failures are prefixed
// `options overload: `).
//
// Findings: `missing`, `extra`, `renamed`, `mismatch` (parameter names,
// defaults, nullability, rest, optional, static, returns; `undefined` in a
// return type, AD-9), and `div12` (Upstream members DIV-12 says are not
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
// The walk is syntactic: inherited members, trait members supplied by a mixin,
// aliases and unregistered exported classes are not seen.
//
// Exit codes: 0 ok (report mode unless a tool failure; gate mode only when
// nothing is unexplained and the citation files pass `checkCitations`),
// 1 unexplained items or citation problems under --gate, or a tool failure
// (tsc, unreadable or invalid jsonl, a citation line naming an unknown
// component, a parse error), 2 usage error.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
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

/** Adds the public members of a class or interface body to `members` (by name; static and instance kept apart). */
function collectMembers(decl: Node, members: Map<string, TsMember[]>): void {
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
    const isStatic = member["static"] === true;
    const entry = (name: string): TsMember => {
      const list = members.get(name) ?? [];
      let found = list.find((m) => m.static === isStatic);
      if (found === undefined) {
        found = { name, static: isStatic, signatures: [], property: null, matched: false };
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
 * `Symbol.for('<FQCN>')` inside it whose argument is an `Illuminate\…` or `Laravel\…` FQCN (`isLaravelFqcn`).
 */
function contractFqcn(init: Node | null): string | null {
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
      return literal(init["arguments"]);
    }
    if (callee?.type === "MemberExpression" && nameOf(callee["object"]) === "Symbol" && nameOf(callee["property"]) === "for" && callee["computed"] !== true) {
      const value = literal(init["arguments"]);
      return value !== null && isLaravelFqcn(value) ? value : null;
    }
  }
  for (const [key, child] of Object.entries(init)) {
    if (key === "type" || typeof child !== "object" || child === null) {
      continue;
    }
    for (const sub of Array.isArray(child) ? child : [child]) {
      const found = contractFqcn(node(sub));
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

interface Registration {
  readonly fqcn: string;
  readonly file: string;
  readonly local: string;
}

interface ParsedPackage {
  readonly registrations: Map<string, Registration>;
  /** Declaration statements by file (`src/<path>.ts`). */
  readonly declarations: Map<string, Node[]>;
  /** Source statements and text by file. */
  readonly sources: Map<string, { statements: Node[]; text: string }>;
  /** Exported functions: name → signatures and the file declaring them. */
  readonly functions: Map<string, { file: string; signatures: TsSignature[] }>;
  /** Type literal keys by interface / type alias name, across the package's declarations. */
  readonly typeKeys: Map<string, LiteralKey[][]>;
}

function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface LiteralKey {
  readonly name: string;
  readonly optional: boolean;
}

/** The keys of a type literal or interface body. */
function literalKeys(members: unknown): LiteralKey[] {
  const out: LiteralKey[] = [];
  for (const member of nodes(members)) {
    const name = member["computed"] === true ? null : nameOf(member["key"]);
    if (name !== null) {
      out.push({ name, optional: member["optional"] === true });
    }
  }
  return out;
}

function parsePackage(declarations: readonly DeclarationFile[], sources: readonly SourceFile[]): ParsedPackage {
  const parsed: ParsedPackage = { registrations: new Map(), declarations: new Map(), sources: new Map(), functions: new Map(), typeKeys: new Map() };
  // Contract tokens (AD-1): registrations unless a registerClass of the same FQCN exists.
  const contracts = new Map<string, Registration>();
  for (const { file, text } of [...sources].sort((a, b) => compareUnits(a.file, b.file))) {
    const statements = parse(file, text, "ts");
    parsed.sources.set(file, { statements, text });
    for (const statement of statements) {
      const variable = declarationOf(statement);
      if (variable !== null && variable.type === "VariableDeclaration" && variable["kind"] === "const") {
        for (const declarator of nodes(variable["declarations"])) {
          const local = nameOf(declarator["id"]);
          const token = contractFqcn(node(declarator["init"]));
          const fqcn = token === null ? null : normaliseFqcn(token);
          if (local !== null && fqcn !== null && !contracts.has(fqcn)) {
            contracts.set(fqcn, { fqcn, file, local });
          }
        }
        continue;
      }
      // Story 6.6's recogniser, so a registration here is one the scan accepts; keyed without the leading `\`.
      const registration = recogniseRegistration(statement)?.registration ?? null;
      if (registration !== null && !parsed.registrations.has(registration.fqcn)) {
        parsed.registrations.set(registration.fqcn, { fqcn: registration.fqcn, file, local: registration.name });
      }
    }
  }
  for (const [fqcn, registration] of contracts) {
    if (!parsed.registrations.has(fqcn)) {
      parsed.registrations.set(fqcn, registration);
    }
  }
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
      } else if (decl.type === "TSInterfaceDeclaration") {
        const list = parsed.typeKeys.get(name) ?? [];
        list.push(literalKeys(node(decl["body"])?.["body"]));
        parsed.typeKeys.set(name, list);
      } else if (decl.type === "TSTypeAliasDeclaration") {
        const type = stripParens(decl["typeAnnotation"]);
        if (type !== null && type.type === "TSTypeLiteral") {
          const list = parsed.typeKeys.get(name) ?? [];
          list.push(literalKeys(type["members"]));
          parsed.typeKeys.set(name, list);
        }
      }
    }
  }
  return parsed;
}

/** The merged public members of every class / interface named `local` in a declaration file. */
function classMembers(statements: readonly Node[], local: string): Map<string, TsMember[]> {
  const members = new Map<string, TsMember[]>();
  for (const statement of statements) {
    const decl = declarationOf(statement);
    if (decl !== null && (decl.type === "ClassDeclaration" || decl.type === "TSInterfaceDeclaration") && nameOf(decl["id"]) === local) {
      collectMembers(decl, members);
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
  if (!RESERVED.has(expected) && t.name !== expected) {
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

/** The key lists of a TS type that is (or has a union member, or names an interface / type alias that is) a type literal. */
function literalKeyLists(value: unknown, typeKeys: Map<string, LiteralKey[][]>): LiteralKey[][] {
  const n = stripParens(value);
  if (n === null) {
    return [];
  }
  if (n.type === "TSUnionType") {
    return nodes(n["types"]).flatMap((member) => literalKeyLists(member, typeKeys));
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
 * options object whose keys are exactly the optional parameters' names, each optional, then a rest parameter when
 * Upstream ends with a variadic one.
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
  } else if (match === undefined) {
    out.push(`parameter ${position} is not an options object with keys ${keys.join(", ")}`);
  } else {
    if (!options.optional) {
      out.push(`parameter ${position} is not optional`);
    }
    for (const key of match.filter((k) => !k.optional)) {
      out.push(`parameter ${position} key ${key.name} is not optional`);
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

  for (const [fqcn, { decl, members: upstreamMembers }] of declarations) {
    const registration = pkg.registrations.get(fqcn);
    if (registration === undefined) {
      add("missing", decl.kind, fqcn, null);
      continue;
    }
    matched++;
    const members = classMembers(pkg.declarations.get(registration.file) ?? [], registration.local);
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
        const ctx = { typeKeys: pkg.typeKeys, implementation: defaults.get(`${member.static ? "static " : ""}${member.name}`) ?? null, signatures: member.signatures.length };
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
    for (const member of extras) {
      add("extra", member.signatures.length > 0 ? "method" : "property", fqcn, member.name);
    }
  }

  // Registered FQCNs the component file lacks.
  for (const fqcn of pkg.registrations.keys()) {
    if (!declarations.has(fqcn)) {
      add("extra", "class", fqcn, null);
    }
  }

  // Functions, by short name.
  for (const up of functions) {
    const name = camel(up.fqcn.slice(up.fqcn.lastIndexOf("\\") + 1));
    const fn = pkg.functions.get(name);
    if (fn === undefined) {
      add("missing", "function", up.fqcn, null);
      continue;
    }
    const ctx = { typeKeys: pkg.typeKeys, implementation: functionDefaults(pkg.sources.get(fn.file), name), signatures: fn.signatures.length };
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
  return components.map((component) => {
    const has = withPackage.includes(component);
    try {
      return diffComponent({
        component,
        upstream: readUpstream(root, component),
        additions,
        exceptions,
        div12,
        declarations: has ? packageDeclarations(root, component) : [],
        sources: has ? packageSources(root, component) : [],
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
