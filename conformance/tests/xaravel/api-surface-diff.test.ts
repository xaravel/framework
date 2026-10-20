// Xaravel Tests for Story 6.5 (the API-surface diff and gate:
// `tools/api-surface/api-surface.ts`, `bun run api-surface` /
// `bun run api-surface:gate`, and `.github/workflows/api-surface.yml`; AD-15,
// AD-9, AD-26, DIV-12).
//
// The CLI runs for real, with the repository's own tsc, over a copy of the
// committed fixture in `tools/api-surface/fixtures/` placed in a temp root
// (`--root`): `packages/demo` (the Xaravel side), `conformance/api-surface/
// demo.jsonl` (the Upstream side), the citation files and the DIV-12 pairs.
// Nothing tracked is written. The name mapping and the I/O matrix's edge cases
// also run through the pure `diffComponent` over inline texts.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { camel, componentsOf, diffComponent, memberName, renderItem, renderMarkdown, type CitationLine, type DiffInput, type UpstreamParameter, type UpstreamRecord } from "../../../tools/api-surface/api-surface";
import { citationProblems, defErrors, readSurfaceSchema } from "../../../tools/oracle/api-surface";
import { checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const TOOL = join(root, "tools", "api-surface", "api-surface.ts");
const FIXTURES = join(root, "tools", "api-surface", "fixtures");
const TIMEOUT = 60_000;
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function write(dir: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** A temp root holding the fixture: `packages/demo`, `conformance/api-surface/{demo,additions,exceptions}.jsonl` and the DIV-12 pairs. */
function demoRoot(): string {
  const dir = tempDir("xaravel-api-surface-");
  cpSync(join(FIXTURES, "demo"), join(dir, "packages", "demo"), { recursive: true });
  mkdirSync(join(dir, "conformance", "api-surface"), { recursive: true });
  mkdirSync(join(dir, "conformance", "scans"), { recursive: true });
  for (const name of ["demo.jsonl", "additions.jsonl", "exceptions.jsonl"]) {
    cpSync(join(FIXTURES, name), join(dir, "conformance", "api-surface", name));
  }
  cpSync(join(FIXTURES, "div12-pairs.jsonl"), join(dir, "conformance", "scans", "div12-pairs.jsonl"));
  return dir;
}

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(dir: string | null, args: readonly string[]): Run {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", TOOL, ...(dir === null ? [] : ["--root", dir]), ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

const R = String.raw`Demo\Repository`;
const M = String.raw`Demo\Model`;

/** Every finding of the fixture, under its committed citation files. */
const DETAILS = [
  String.raw`demo: extra class Demo\Extra (explained: FR-115)`,
  String.raw`demo: missing class Demo\Missing (explained: deferred:demo-missing)`,
  `demo: div12 property ${M}::middleware: option-pair`,
  `demo: div12 property ${M}::status: method-plus-state`,
  `demo: div12 method ${M}::fillable: model-config`,
  `demo: div12 method ${M}::middleware: option-pair`,
  `demo: extra method ${M}::setFillable (explained: DIV-12)`,
  `demo: div12 property ${R}::connection: method-plus-state`,
  `demo: mismatch property ${R}::label: is not nullable, Upstream ?string`,
  `demo: mismatch method ${R}::find: returns undefined (AD-9)`,
  `demo: mismatch method ${R}::remember: parameter 2 default 30, Upstream 60`,
  `demo: mismatch method ${R}::tag: parameter 1 is not nullable`,
  `demo: mismatch method ${R}::touch: parameter 2 is ttl, Upstream seconds`,
  `demo: missing method ${R}::forget (explained: DIV-12)`,
  `demo: renamed method ${R}::getURL -> getUrl`,
  `demo: extra method ${R}::extraHelper (explained: DIV-12)`,
  String.raw`demo: missing function Demo\other_fn`,
  `demo: stale exception ${R}::gone: DIV-1`,
];
const SUMMARY = "api-surface demo: 35 Upstream, 20 matched, 3 missing, 1 renamed, 3 extra, 5 mismatched, 5 div12; 7 unexplained (AD-15)";
/** The unexplained ones, in order. */
const UNEXPLAINED = DETAILS.filter((line) => !line.includes("(explained:") && !/: (div12|stale) /.test(line));

// ---------------------------------------------------------------------------
// Inline inputs for diffComponent

const p = (name: string, extra: Partial<UpstreamParameter> = {}): UpstreamParameter => ({
  name,
  type: null,
  nullable: true,
  default: null,
  optional: false,
  variadic: false,
  byRef: false,
  ...extra,
});
const decl = (fqcn: string): UpstreamRecord => ({ fqcn, kind: "class", member: null });
const method = (fqcn: string, member: string, parameters: UpstreamParameter[] = [], extra: Partial<UpstreamRecord> = {}): UpstreamRecord => ({
  fqcn,
  kind: "method",
  member,
  static: false,
  parameters,
  returns: null,
  nullable: true,
  ...extra,
});

/** One class `X\A` registered from `src/A.ts`, with `body` as its d.ts members and `source` (optional) as its source class body. */
function single(upstream: UpstreamRecord[], body: string, source = "", extra: Partial<DiffInput> = {}): string[] {
  const diff = diffComponent({
    component: "x",
    upstream: [decl("X\\A"), ...upstream],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/A.ts", text: `export declare class A {\n${body}\n}\n${extra.declarations?.[0]?.text ?? ""}` }],
    sources: [{ file: "src/A.ts", text: `export class A {\n${source}\n}\nregisterClass("X\\\\A", A);\n` }],
    ...(extra.additions === undefined ? {} : { additions: extra.additions }),
    ...(extra.exceptions === undefined ? {} : { exceptions: extra.exceptions }),
  });
  return diff.items.map((item) => renderItem("x", item));
}

/** The name mapping and the I/O matrix's edge cases through the pure diff (part of XT-conformance-137). */
function matrixEdgeCases(): void {
  // camel(): each `_x` after a letter or digit; leading underscores kept; magic names.
  expect(camel("get_id")).toBe("getId");
  expect(camel("to_array_2_x")).toBe("toArray2X");
  expect(camel("_private_name")).toBe("_privateName");
  expect(camel("__get")).toBe("__get");
  expect(camel("a__b")).toBe("a__b");
  expect(camel("getID")).toBe("getID");
  expect(memberName("__construct")).toBe("constructor");
  expect(memberName("__toString")).toBe("toString");
  expect(memberName("__call")).toBe("__call");
  expect(memberName("get_id")).toBe("getId");

  // Matched: a reserved Upstream name lets any name pass.
  expect(single([method("X\\A", "get", [p("key", { type: "string", nullable: false }), p("default", { default: "null", optional: true })])], "get(key: string, fallback?: unknown): unknown;", "get(key: string, fallback: unknown = null) { return fallback ?? key; }")).toEqual([]);
  // Parameter name, default (number, string, negative, boolean; [] matches [] and {}), nullability.
  expect(single([method("X\\A", "put", [p("key"), p("seconds")])], "put(key: unknown, ttl: unknown): void;")).toEqual(["x: mismatch method X\\A::put: parameter 2 is ttl, Upstream seconds"]);
  expect(single([method("X\\A", "f", [p("a", { default: "'x'", optional: true }), p("b", { default: "-1", optional: true })])], "f(a?: unknown, b?: unknown): void;", "f(a = 'y', b = -1) {}")).toEqual([
    "x: mismatch method X\\A::f: parameter 1 default 'y', Upstream 'x'",
  ]);
  expect(single([method("X\\A", "f", [p("a", { default: "[]", optional: true })])], "f(a?: unknown): void;", "f(a = []) {}")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a", { default: "1.0", optional: true })])], "f(a?: unknown): void;", "f(a = 1) {}")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a", { default: "true", optional: true })])], "f(a?: unknown): void;", "f(a = false) {}")).toEqual(["x: mismatch method X\\A::f: parameter 1 default false, Upstream true"]);
  // A non-literal default on either side is not compared.
  expect(single([method("X\\A", "f", [p("a", { default: "PHP_INT_MAX", optional: true })])], "f(a?: unknown): void;", "f(a = 3) {}")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a", { type: "?string", nullable: true })])], "f(a: string | null): void;")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a", { type: "string", nullable: false })])], "f(a: string | null): void;")).toEqual(["x: mismatch method X\\A::f: parameter 1 is nullable, Upstream string"]);
  // Missing or extra TS parameters, optional and rest.
  expect(single([method("X\\A", "f", [p("a"), p("b")])], "f(a: unknown): void;")).toEqual(["x: mismatch method X\\A::f: parameter 2 (b) is missing"]);
  expect(single([method("X\\A", "f", [p("a")])], "f(a: unknown, b?: unknown): void;")).toEqual(["x: mismatch method X\\A::f: parameter 2 (b) is extra"]);
  expect(single([method("X\\A", "f", [p("a", { optional: true, default: "1" })])], "f(a: unknown): void;")).toEqual(["x: mismatch method X\\A::f: parameter 1 is not optional"]);
  expect(single([method("X\\A", "f", [p("a", { optional: true, variadic: true })])], "f(a?: unknown): void;")).toEqual(["x: mismatch method X\\A::f: parameter 1 is not a rest parameter, Upstream variadic"]);
  expect(single([method("X\\A", "f", [p("a", { type: "?string", optional: true, variadic: true })])], "f(...a: (string | null)[]): void;")).toEqual([]);
  // Options form: required positionally, then one type literal whose keys are exactly the optional parameters'.
  const opts = [p("a"), p("b_c", { optional: true, default: "1" }), p("d", { optional: true, default: "2" })];
  expect(single([method("X\\A", "f", opts)], "f(a: unknown, options?: { bC?: number; d?: number }): void;")).toEqual([]);
  expect(single([method("X\\A", "f", opts)], "f(a: unknown, options?: Opts | null): void;", "", { declarations: [{ file: "src/A.ts", text: "export type Opts = { bC?: number; d?: number };\n" }] })).toEqual([]);
  expect(single([method("X\\A", "f", opts)], "f(a: unknown, options?: { bC?: number }): void;")).toEqual([
    "x: mismatch method X\\A::f: parameter 2 is not an options object with keys bC, d",
  ]);
  // The options parameter and each of its keys must be optional; a trailing Upstream variadic needs a rest parameter after it.
  expect(single([method("X\\A", "f", opts)], "f(a: unknown, options: { bC?: number; d?: number }): void;")).toEqual(["x: mismatch method X\\A::f: parameter 2 is not optional"]);
  expect(single([method("X\\A", "f", opts)], "f(a: unknown, options?: { bC: number; d?: number }): void;")).toEqual(["x: mismatch method X\\A::f: parameter 2 key bC is not optional"]);
  const withRest = [...opts, p("rest", { optional: true, variadic: true })];
  expect(single([method("X\\A", "f", withRest)], "f(a: unknown, options?: { bC?: number; d?: number }, ...rest: unknown[]): void;")).toEqual([]);
  expect(single([method("X\\A", "f", withRest)], "f(a: unknown, options?: { bC?: number; d?: number }): void;")).toEqual([
    "x: mismatch method X\\A::f: parameter 3 (rest) is missing",
  ]);
  // Returns: undefined at the top level only (AD-9); nullability after unwrapping a Promise.
  expect(single([method("X\\A", "f")], "f(): (x?: string | undefined) => void;")).toEqual([]);
  expect(single([method("X\\A", "f")], "f(): (string | undefined);")).toEqual(["x: mismatch method X\\A::f: returns undefined (AD-9)"]);
  // Properties: an optional property or a top-level undefined fails (AD-9).
  const label = { fqcn: "X\\A", kind: "property", member: "label", static: false, type: null, nullable: true } as const;
  expect(single([label], "label?: string;")).toEqual(["x: mismatch property X\\A::label: returns undefined (AD-9)"]);
  expect(single([label], "label: string | undefined;")).toEqual(["x: mismatch property X\\A::label: returns undefined (AD-9)"]);
  // A member in the other role is a mismatch, not a rename.
  expect(single([method("X\\A", "size")], "size: number;")).toEqual(["x: mismatch method X\\A::size: is a property, Upstream method"]);
  expect(single([label], "label(): string;")).toEqual(["x: mismatch property X\\A::label: is a method, Upstream property"]);
  // Overloads take the implementation's defaults only when their names match it; a single signature always does.
  expect(single([method("X\\A", "f", [p("b", { optional: true, default: "5" })])], "f(b?: unknown): void;\nf(a: unknown, b: unknown): void;", "f(a: unknown = 1, b: unknown = 2) {}")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a", { optional: true, default: "5" })])], "f(a?: unknown): void;", "f(a: unknown = 1) {}")).toEqual(["x: mismatch method X\\A::f: parameter 1 default 1, Upstream 5"]);
  // A `this` parameter does not shift the defaults.
  expect(single([method("X\\A", "f", [p("a", { optional: true, default: "1" })])], "f(this: A, a?: unknown): void;", "f(this: A, a: unknown = 2) {}")).toEqual(["x: mismatch method X\\A::f: parameter 1 default 2, Upstream 1"]);
  // Returns: nullability after unwrapping a Promise.
  expect(single([method("X\\A", "f", [], { returns: "?int", nullable: true })], "f(): Promise<number | null>;")).toEqual([]);
  expect(single([method("X\\A", "f", [], { returns: "?int", nullable: true })], "f(): number;")).toEqual(["x: mismatch method X\\A::f: return is not nullable, Upstream ?int"]);
  expect(single([method("X\\A", "f", [], { returns: "int", nullable: false })], "f(): Promise<number | undefined>;")).toEqual(["x: mismatch method X\\A::f: returns undefined (AD-9)"]);
  expect(single([method("X\\A", "f", [], { returns: "void", nullable: false })], "f(): void;")).toEqual([]);
  // Static agrees for every member kind.
  expect(single([method("X\\A", "f", [], { static: true })], "f(): unknown;")).toEqual(["x: mismatch method X\\A::f: is not static, Upstream static"]);
  expect(single([{ fqcn: "X\\A", kind: "constant", member: "MAX", static: true }], "static readonly MAX = 1;")).toEqual([]);
  expect(single([{ fqcn: "X\\A", kind: "case", member: "Small", static: true }], "readonly Small: string;")).toEqual(["x: mismatch case X\\A::Small: is not static, Upstream static"]);
  expect(single([{ fqcn: "X\\A", kind: "property", member: "label", static: false, type: "?string", nullable: true }], "get label(): string | null;")).toEqual([]);
  // Overloads: one passing signature is enough; otherwise the fewest failures, the first on a tie.
  expect(single([method("X\\A", "f", [p("a")])], "f(a: unknown, b: unknown): void;\nf(a: unknown): void;")).toEqual([]);
  expect(single([method("X\\A", "f", [p("a"), p("b")])], "f(x: unknown, y: unknown): void;\nf(a: unknown, y: unknown): void;")).toEqual(["x: mismatch method X\\A::f: parameter 2 is y, Upstream b"]);
  // Not public: private, protected, #private, computed keys.
  expect(single([], "#private;\nprivate a: number;\nprotected b(): void;\n[Symbol.iterator](): unknown;")).toEqual([]);
  // A merged interface of the same name contributes members; a function-typed field counts as a method.
  expect(single([method("X\\A", "f", [p("a")]), method("X\\A", "g")], "g: () => void;", "", { declarations: [{ file: "src/A.ts", text: "export interface A {\n  f(a: unknown): void;\n}\n" }] })).toEqual([]);
  // Renamed (case-insensitive after the mapping), then missing and extra.
  expect(single([method("X\\A", "getURL"), method("X\\A", "gone")], "getUrl(): void;\nnewOne(): void;")).toEqual([
    "x: renamed method X\\A::getURL -> getUrl",
    "x: missing method X\\A::gone",
    "x: extra method X\\A::newOne",
  ]);
  // constructor is extra only when Upstream has no __construct.
  expect(single([], "constructor(a: number);")).toEqual(["x: extra method X\\A::constructor"]);
  expect(single([method("X\\A", "__construct", [p("a")])], "constructor(a: number);")).toEqual([]);

  // Registration: top-level registerClass(<string>, <Identifier>) only; the first registration wins.
  const registrations = diffComponent({
    component: "x",
    upstream: [decl("X\\A"), method("X\\A", "f"), decl("X\\B")],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [
      { file: "src/A.ts", text: "export declare class A {\n  f(): void;\n}\n" },
      { file: "src/Z.ts", text: "export declare class Z {\n}\n" },
    ],
    sources: [
      { file: "src/A.ts", text: 'export class A {}\nregisterClass("X\\\\A", A);\nfunction later(): void {\n  registerClass("X\\\\B", A);\n}\nregisterClass(name, A);\n' },
      { file: "src/Z.ts", text: 'export class Z {}\nregisterClass("X\\\\A", Z);\n' },
    ],
  });
  expect(registrations.items.map((item) => renderItem("x", item))).toEqual(["x: missing class X\\B"]);
  expect(registrations.matched).toBe(2);
  // A leading `\` is dropped (Story 6.6's recogniser), so `\X\A` matches Upstream `X\A`; a contract token's leading `\` is dropped too.
  const leading = diffComponent({
    component: "x",
    upstream: [decl("X\\A"), method("X\\A", "f"), { fqcn: "X\\Lock", kind: "interface", member: null }],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/A.ts", text: "export declare class A {\n  f(): void;\n}\nexport interface Lock {\n}\n" }],
    sources: [{ file: "src/A.ts", text: 'export class A {}\nconst Lock = contract("\\\\X\\\\Lock");\nregisterClass("\\\\X\\\\A", A);\n' }],
  });
  expect(leading.items.map((item) => renderItem("x", item))).toEqual([]);
  expect(leading.matched).toBe(3);
  // A call the scan rejects does not register.
  const rejected = diffComponent({
    component: "x",
    upstream: [decl("X\\A")],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/A.ts", text: "export declare class A {\n}\n" }],
    sources: [{ file: "src/A.ts", text: 'export class A {}\nregisterClass("X/A", A);\nregisterClass?.("X\\\\A", A);\n' }],
  });
  expect(rejected.items.map((item) => renderItem("x", item))).toEqual(["x: missing class X\\A"]);
  expect(rejected.matched).toBe(0);
  // The case is kept.
  const cased = diffComponent({
    component: "x",
    upstream: [decl("X\\A")],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/A.ts", text: "export declare class A {\n}\n" }],
    sources: [{ file: "src/A.ts", text: 'export class A {}\nregisterClass("\\\\x\\\\a", A);\n' }],
  });
  expect(cased.items.map((item) => renderItem("x", item))).toEqual(["x: missing class X\\A", "x: extra class x\\a"]);
  // Functions: an exported const typed as a function counts, with defaults from its arrow function.
  const consts = diffComponent({
    component: "x",
    upstream: [{ fqcn: "X\\do_it", kind: "function", member: null, static: false, parameters: [p("a", { optional: true, default: "1" })], returns: null, nullable: true }],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/f.ts", text: "export declare const doIt: (a?: number) => void;\n" }],
    sources: [{ file: "src/f.ts", text: "export const doIt = (a = 2): void => {\n  void a;\n};\n" }],
  });
  expect(consts.items.map((item) => renderItem("x", item))).toEqual(["x: mismatch function X\\do_it: parameter 1 default 2, Upstream 1"]);
  // Contracts (AD-1): a top-level const holding Symbol.for('<FQCN>') registers the interface of that name; registerClass wins.
  const contracts = diffComponent({
    component: "x",
    upstream: [{ fqcn: "X\\Lock", kind: "interface", member: null }, method("X\\Lock", "release"), { fqcn: "X\\Gate", kind: "interface", member: null }, method("X\\Gate", "allows")],
    additions: [],
    exceptions: [],
    div12: [],
    declarations: [{ file: "src/L.ts", text: "export interface Lock {\n  release(): void;\n}\nexport declare const Lock: { readonly brand: symbol };\nexport interface Gate {\n  denies(): void;\n}\nexport declare class G {\n  allows(): void;\n}\n" }],
    sources: [{ file: "src/L.ts", text: 'export const Lock = { brand: Symbol.for("X\\\\Lock") };\nconst Gate = contract("X\\\\Gate");\nexport class G {}\nregisterClass("X\\\\Gate", G);\n' }],
  });
  expect(contracts.items.map((item) => renderItem("x", item))).toEqual([]);
  expect(contracts.matched).toBe(4);
  // A declaration that does not parse fails, naming the file.
  expect(() => single([], "f(: void;")).toThrow("src/A.ts (declarations) does not parse");
}

// ---------------------------------------------------------------------------
// XT-conformance-137

xaravelTest(
  "XT-conformance-137",
  "bun run api-surface diffs a package's .d.ts (tsc -b, oxc-parser) against conformance/api-surface/<component>.jsonl and reports missing, renamed and extra members and parameter name, default and nullability mismatches after the camelCase, options-object and DIV-12 mappings (AD-15.5, AD-9, AD-26)",
  () => {
    const dir = demoRoot();
    const run = cli(dir, ["--details", "demo"]);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe([...DETAILS, SUMMARY, ""].join("\n"));
    // The contract interface Demo\Contracts\Store, registered by its `contract<Store>('<FQCN>')` token (AD-1), matches:
    // no item names it. The DIV-12 pair on Demo\Child applies to the property on its declaring class Demo\Repository.
    expect(run.stdout).not.toContain("Store");
    expect(run.stdout).toContain(`demo: div12 property ${R}::connection: method-plus-state\n`);
    // The declarations came from tsc, into the fixture tsconfig's outDir.
    expect(existsSync(join(dir, ".cache", "tsc", "demo", "src", "Repository.d.ts"))).toBe(true);
    // Without --details: the summary line only; --all is every component file (the citation files are not components).
    expect(cli(dir, ["demo"]).stdout).toBe(`${SUMMARY}\n`);
    expect(componentsOf(dir)).toEqual(["demo"]);
    expect(cli(dir, ["--all"]).stdout).toBe(`${SUMMARY}\n`);

    // The fixture's data files are what the real ones must be: schema-valid surface lines, valid citation lines.
    const schema = readSurfaceSchema(root);
    for (const line of readFileSync(join(FIXTURES, "demo.jsonl"), "utf8").trimEnd().split("\n")) {
      expect([line, defErrors(JSON.parse(line), "surface", schema)]).toEqual([line, []]);
    }
    expect(citationProblems(readFileSync(join(FIXTURES, "additions.jsonl"), "utf8"), "additions.jsonl", "addition", schema)).toEqual([]);
    expect(citationProblems(readFileSync(join(FIXTURES, "exceptions.jsonl"), "utf8"), "exceptions.jsonl", "exception", schema)).toEqual([]);

    // A component with no package (no packages/<c>/package.json) has no declarations: everything is missing.
    write(dir, { "conformance/api-surface/other.jsonl": `${JSON.stringify({ fqcn: "Other\\Thing", kind: "class", member: null, stubbed: [] })}\n${JSON.stringify({ fqcn: "Other\\Thing", kind: "constant", member: "X", static: true })}\n` });
    const other = cli(dir, ["--details", "other"]);
    expect(other.exitCode).toBe(0);
    expect(other.stdout).toBe(["other: missing class Other\\Thing", "api-surface other: 2 Upstream, 0 matched, 1 missing, 0 renamed, 0 extra, 0 mismatched, 0 div12; 1 unexplained (AD-15)", ""].join("\n"));

    // Tool failures exit 1 with the reason: an invalid jsonl line, a tsc failure.
    write(dir, { "conformance/api-surface/other.jsonl": "{nope\n" });
    const invalid = cli(dir, ["other"]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("api-surface: other: conformance/api-surface/other.jsonl:1: not JSON");
    const broken = demoRoot();
    write(broken, { "packages/demo/src/Broken.ts": 'export const x: number = "no";\n' });
    const tsc = cli(broken, ["demo"]);
    expect(tsc.exitCode).toBe(1);
    expect(tsc.stdout + tsc.stderr).toContain("TS2322");
    expect(tsc.stderr).toContain("api-surface: tsc -b failed");

    matrixEdgeCases();
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-138

const line = (component: string, fqcn: string, member: string | null, citation: string): string => `${JSON.stringify({ component, fqcn, member, citation })}\n`;

xaravelTest(
  "XT-conformance-138",
  "an extra member cited in additions.jsonl or a missing (or mismatched) member cited in exceptions.jsonl counts as explained, a renamed one needs both, a null member covers the whole class, a line that explains nothing is listed as stale, and bun run api-surface:gate fails while any member is unexplained (AD-15.5)",
  () => {
    const dir = demoRoot();
    // The committed fixture citations explain some items: the gate fails naming exactly the rest.
    const gate = cli(dir, ["--gate", "demo"]);
    expect(gate.exitCode).toBe(1);
    expect(gate.stdout).toBe([...UNEXPLAINED, "api-surface:gate demo: 7 unexplained (AD-15)", ""].join("\n"));

    // A renamed member with only the exceptions half stays unexplained; that line is then stale.
    const exceptions = readFileSync(join(FIXTURES, "exceptions.jsonl"), "utf8");
    const additions = readFileSync(join(FIXTURES, "additions.jsonl"), "utf8");
    write(dir, { "conformance/api-surface/exceptions.jsonl": exceptions + line("demo", R, "getURL", "DIV-12") });
    const half = cli(dir, ["--details", "demo"]);
    expect(half.stdout).toContain(`demo: renamed method ${R}::getURL -> getUrl\n`);
    expect(half.stdout).toContain(`demo: stale exception ${R}::getURL: DIV-12\n`);

    // Every remaining item explained: mismatches and the missing function by exceptions (a member line, a class-level
    // null line, a function's null line), the renamed one by both files. Lines for another component are ignored.
    write(dir, {
      "conformance/api-surface/exceptions.jsonl":
        line("demo", "Demo\\Missing", null, "deferred:demo-missing") +
        line("demo", R, null, "DIV-3") +
        line("demo", R, "getURL", "DIV-12") +
        line("demo", "Demo\\other_fn", null, "deferred:helpers") +
        line("other", R, "touch", "DIV-1"),
      "conformance/api-surface/additions.jsonl": additions + line("demo", R, "getUrl", "FR-115"),
    });
    const all = cli(dir, ["--details", "demo"]);
    expect(all.exitCode).toBe(0);
    expect(all.stdout).toBe(
      [
        String.raw`demo: extra class Demo\Extra (explained: FR-115)`,
        String.raw`demo: missing class Demo\Missing (explained: deferred:demo-missing)`,
        `demo: div12 property ${M}::middleware: option-pair`,
        `demo: div12 property ${M}::status: method-plus-state`,
        `demo: div12 method ${M}::fillable: model-config`,
        `demo: div12 method ${M}::middleware: option-pair`,
        `demo: extra method ${M}::setFillable (explained: DIV-12)`,
        `demo: div12 property ${R}::connection: method-plus-state`,
        `demo: mismatch property ${R}::label: is not nullable, Upstream ?string (explained: DIV-3)`,
        `demo: mismatch method ${R}::find: returns undefined (AD-9) (explained: DIV-3)`,
        `demo: mismatch method ${R}::remember: parameter 2 default 30, Upstream 60 (explained: DIV-3)`,
        `demo: mismatch method ${R}::tag: parameter 1 is not nullable (explained: DIV-3)`,
        `demo: mismatch method ${R}::touch: parameter 2 is ttl, Upstream seconds (explained: DIV-3)`,
        `demo: missing method ${R}::forget (explained: DIV-3)`,
        `demo: renamed method ${R}::getURL -> getUrl (explained: DIV-12, FR-115)`,
        `demo: extra method ${R}::extraHelper (explained: DIV-12)`,
        String.raw`demo: missing function Demo\other_fn (explained: deferred:helpers)`,
        "api-surface demo: 35 Upstream, 20 matched, 3 missing, 1 renamed, 3 extra, 5 mismatched, 5 div12; 0 unexplained (AD-15)",
        "",
      ].join("\n"),
    );
    const passed = cli(dir, ["--gate", "demo"]);
    expect(passed.stdout).toBe("api-surface:gate demo: 0 unexplained (AD-15)\n");
    expect(passed.exitCode).toBe(0);

    // A class-level null addition explains every extra member of the class; an exact line is preferred.
    const extra = diffComponent({
      component: "x",
      upstream: [decl("X\\A")],
      additions: [line("x", "X\\A", null, "FR-1"), line("x", "X\\A", "b", "FR-2"), line("x", "X\\A", "zzz", "FR-3")].map((text) => JSON.parse(text) as CitationLine),
      exceptions: [],
      div12: [],
      declarations: [{ file: "src/A.ts", text: "export declare class A {\n  a(): void;\n  b(): void;\n}\n" }],
      sources: [{ file: "src/A.ts", text: 'export class A {}\nregisterClass("X\\\\A", A);\n' }],
    });
    expect(extra.items.map((item) => renderItem("x", item))).toEqual([
      "x: extra method X\\A::a (explained: FR-1)",
      "x: extra method X\\A::b (explained: FR-2)",
      "x: stale addition X\\A::zzz: FR-3",
    ]);
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-139

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly with?: Record<string, unknown>;
}
interface Workflow {
  readonly on: Record<string, unknown>;
  readonly permissions: unknown;
  readonly jobs: Record<string, { readonly if?: string; readonly permissions?: unknown; readonly "continue-on-error"?: unknown; readonly steps: readonly Step[] }>;
}

xaravelTest(
  "XT-conformance-139",
  "on any PR and in the merge queue a read-only workflow writes the per-Component API-surface table to the job summary and never fails, and bun run api-surface:gate <component> fails while any unexplained member remains (AD-15.5, AD-16)",
  () => {
    // The report exits 0 with unexplained items and writes the markdown table.
    const dir = demoRoot();
    const table = join(dir, "table.md");
    const report = cli(dir, ["--markdown", table, "demo"]);
    expect(report.exitCode).toBe(0);
    expect(report.stdout).toBe(`${SUMMARY}\n`);
    expect(readFileSync(table, "utf8")).toBe(
      [
        "| Component | Upstream | Matched | Missing | Renamed | Extra | Mismatched | Unexplained |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        "| demo | 35 | 20 | 3 | 1 | 3 | 5 | 7 |",
        "| **Total** | 35 | 20 | 3 | 1 | 3 | 5 | 7 |",
        "",
      ].join("\n"),
    );
    expect(renderMarkdown([])).toContain("| **Total** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |");
    // The gate fails on the same root. An unwritable --markdown path fails with the reason, not a stack trace.
    expect(cli(dir, ["--gate", "demo"]).exitCode).toBe(1);
    const unwritable = cli(dir, ["--markdown", join(dir, "no", "such", "dir", "table.md"), "demo"]);
    expect(unwritable.exitCode).toBe(1);
    expect(unwritable.stderr).toStartWith("api-surface: ENOENT");
    expect(unwritable.stderr).not.toContain("    at ");

    // Usage: an unknown component is named (exit 2); nothing selected, both forms, an unknown option.
    const unknown = cli(dir, ["nope"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain("api-surface: unknown component nope (no conformance/api-surface/nope.jsonl)");
    expect(cli(dir, ["additions"]).exitCode).toBe(2);
    expect(cli(dir, []).exitCode).toBe(2);
    expect(cli(dir, ["--all", "demo"]).exitCode).toBe(2);
    expect(cli(dir, ["--bogus", "demo"]).exitCode).toBe(2);

    // The workflow: pull_request (main) and merge_group, read-only, pinned actions, one step that never fails.
    const text = readFileSync(join(root, ".github", "workflows", "api-surface.yml"), "utf8");
    const flow = Bun.YAML.parse(text) as Workflow;
    expect(Object.keys(flow.on).sort()).toEqual(["merge_group", "pull_request"]);
    expect(flow.on["pull_request"]).toEqual({ branches: ["main"] });
    expect(flow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(flow.jobs)).toEqual(["report"]);
    const job = flow.jobs["report"]!;
    expect(job.permissions).toEqual({ contents: "read" });
    expect((job as { "timeout-minutes"?: unknown })["timeout-minutes"]).toBe(20);
    expect(job.if).toBeUndefined();
    expect(job["continue-on-error"]).toBeUndefined();
    expect(job.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } });
    expect(job.steps[1]!.uses).toBe("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(job.steps[2]!.run).toBe("bun install --frozen-lockfile --ignore-scripts");
    expect(job.steps.length).toBe(4);
    for (const step of job.steps) {
      expect(step.if).toBeUndefined();
    }
    const diff = job.steps[3]!.run!;
    expect(diff).toContain('bun run api-surface --all --markdown "$RUNNER_TEMP/api-surface.md" || status=$?');
    expect(diff).toContain('cat "$RUNNER_TEMP/api-surface.md"');
    expect(diff).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(diff).toContain("::warning::");
    expect(diff.trimEnd().endsWith("exit 0")).toBe(true);
    const code = text
      .split("\n")
      .filter((row) => !row.trimStart().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/write|api-surface:gate|pull_request_target|secrets\./);
    expect(checkWorkflows(root).violations).toEqual([]);

    // The scripts and the typecheck include.
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["api-surface"]).toBe("bun --no-env-file tools/api-surface/api-surface.ts");
    expect(scripts["api-surface:gate"]).toBe("bun --no-env-file tools/api-surface/api-surface.ts --gate");
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[] };
    expect(tsconfig.include).toContain("tools/api-surface/*.ts");

    // --all on the repository itself: exit 0, one summary line per Component file.
    const real = cli(null, ["--all"]);
    expect(real.stderr).toBe("");
    expect(real.exitCode).toBe(0);
    const lines = real.stdout.trimEnd().split("\n");
    expect(lines.length).toBe(componentsOf(root).length);
    for (const [index, component] of componentsOf(root).entries()) {
      expect(lines[index]).toMatch(new RegExp(`^api-surface ${component}: \\d+ Upstream, \\d+ matched, .* unexplained \\(AD-15\\)$`));
    }
  },
  TIMEOUT,
);
