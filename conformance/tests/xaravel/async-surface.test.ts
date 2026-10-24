// Xaravel Tests for Story 6.4 (the async-surface generator and drift check:
// `tools/async-surface/async-surface.ts`, `bun run async-surface`, and the
// `ci.yml#check` step that runs it with `--all --check`; AD-6, AD-28).
//
// The CLI runs for real, with the repository's own tsc, over copies of the
// committed fixture package in `tools/async-surface/fixtures/` placed in temp
// roots (`--root`), so nothing tracked is written. The I/O matrix's edge cases
// also run through `surfaceOf` over inline `.d.ts` texts with a stub resolver,
// and the thenable resolver (`registeredFqcn`, Retro 6 item 12) over temp
// source files.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { diff, render, surfaceOf, thenableTypes, type FqcnResolver } from "../../../tools/async-surface/async-surface";
import { isThenableFqcn, registeredFqcn, THENABLE_TYPES } from "../../../tools/lint-rules/thenables";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const TOOL = join(root, "tools", "async-surface", "async-surface.ts");
const FIXTURES = join(root, "tools", "async-surface", "fixtures");
const FALLBACK = THENABLE_TYPES;
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

/** A temp root holding `packages/demo` (the fixture's `package.json` and `tsconfig.json`) with `sources` as `src/<name>`. */
function demoRoot(sources: Readonly<Record<string, string>>): string {
  const dir = tempDir("xaravel-async-surface-");
  const pkg = join(dir, "packages", "demo");
  mkdirSync(join(pkg, "src"), { recursive: true });
  cpSync(join(FIXTURES, "demo", "package.json"), join(pkg, "package.json"));
  cpSync(join(FIXTURES, "demo", "tsconfig.json"), join(pkg, "tsconfig.json"));
  for (const [name, source] of Object.entries(sources)) {
    mkdirSync(dirname(join(pkg, "src", name)), { recursive: true });
    cpSync(source, join(pkg, "src", name));
  }
  return dir;
}

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(dir: string, args: readonly string[]): Run {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", TOOL, "--root", dir, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

const SURFACE = (dir: string): string => join(dir, "packages", "demo", "async-surface.json");

/** The fixture package's expected `async-surface.json` under the tool's fallback thenable list. */
const EXPECTED = [
  "[",
  String.raw`{"method":"Queue.push","file":"src/Repository.ts","root":"Queue\\Queue.push"},`,
  String.raw`{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"},`,
  String.raw`{"method":"Repository.many","file":"src/Repository.ts","root":"Cache\\Store.many"},`,
  String.raw`{"method":"Repository.ready","file":"src/Repository.ts","root":"Cache\\Store.get"},`,
  String.raw`{"method":"Repository.remember","file":"src/Repository.ts","root":"callback"},`,
  String.raw`{"method":"Repository.static flushAll","file":"src/Repository.ts","root":"Cache\\Store.flush"},`,
  String.raw`{"method":"Repository.where","file":"src/Repository.ts","thenable":"Illuminate\\Database\\Query\\Builder"},`,
  String.raw`{"method":"Store.get","file":"src/Repository.ts","root":"Cache\\Store.get"},`,
  String.raw`{"method":"Store.put","file":"src/Repository.ts","root":"Cache\\Store.put"},`,
  String.raw`{"method":"fetchValue","file":"src/Repository.ts","root":"Cache\\Store.get"},`,
  String.raw`{"method":"later","file":"src/Repository.ts","root":"callback"}`,
  "]",
  "",
].join("\n");

const passingSources = (): Record<string, string> => ({
  "Builder.ts": join(FIXTURES, "demo", "src", "Builder.ts"),
  "Repository.ts": join(FIXTURES, "demo", "src", "Repository.ts"),
  "Schema/Builder.ts": join(FIXTURES, "demo", "src", "Schema", "Builder.ts"),
});

/** A temp `node_modules/@xaravel/contracts` whose `./async` exports `THENABLE_TYPES` as `source`. */
function installContracts(dir: string, source: string): void {
  write(dir, {
    "node_modules/@xaravel/contracts/package.json": JSON.stringify({ name: "@xaravel/contracts", type: "module", exports: { ".": "./index.ts", "./async": "./async.ts" } }),
    "node_modules/@xaravel/contracts/index.ts": "export {};\n",
    "node_modules/@xaravel/contracts/async.ts": source,
  });
}

// XT-conformance-134

xaravelTest(
  "XT-conformance-134",
  "bun run async-surface <pkg> emits the package's .d.ts with tsc -b, walks it with oxc-parser and writes async-surface.json with one line per Promise-returning public method and its @asyncRoot root and one tagless thenable line per method returning a thenable but no Promise, a thenable matched by the FQCN its import resolves to, using @xaravel/contracts/async's THENABLE_TYPES when it resolves and the tool's list otherwise (AD-6)",
  async () => {
    // The fixture package, the fallback list (no @xaravel/contracts in the temp root).
    const dir = demoRoot(passingSources());
    const run = cli(dir, ["demo"]);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    expect(readFileSync(SURFACE(dir), "utf8")).toBe(EXPECTED);
    // `@xaravel/<name>` names the same package; a rerun is byte-identical.
    expect(cli(dir, ["@xaravel/demo"]).exitCode).toBe(0);
    expect(readFileSync(SURFACE(dir), "utf8")).toBe(EXPECTED);
    // The declarations came from tsc, into the tsconfig's outDir.
    expect(existsSync(join(dir, ".cache", "tsc", "demo", "src", "Repository.d.ts"))).toBe(true);

    // The contracts list is preferred when `@xaravel/contracts/async` resolves from the root.
    const contractsSources = { "Builder.ts": join(FIXTURES, "demo", "src", "Builder.ts"), "Repository.ts": join(FIXTURES, "contracts", "Thenables.ts") };
    const withContracts = demoRoot(contractsSources);
    installContracts(withContracts, readFileSync(join(FIXTURES, "contracts", "async.ts"), "utf8"));
    expect(await thenableTypes(withContracts)).toEqual(["X\\Lazy"]);
    const listed = cli(withContracts, ["demo"]);
    expect(listed.stderr).toBe("");
    expect(listed.exitCode).toBe(0);
    expect(readFileSync(SURFACE(withContracts), "utf8")).toBe(`[\n${String.raw`{"method":"Repository.lazy","file":"src/Repository.ts","thenable":"X\\Lazy"}`}\n]\n`);

    // The same source under the fallback list: `where()` (the Query Builder) is a thenable line and `lazy()` is not listed.
    const fallback = demoRoot(contractsSources);
    expect(await thenableTypes(fallback)).toBe(THENABLE_TYPES);
    const listedFallback = cli(fallback, ["demo"]);
    expect(listedFallback.stderr).toBe("");
    expect(listedFallback.exitCode).toBe(0);
    expect(readFileSync(SURFACE(fallback), "utf8")).toBe(`[\n${String.raw`{"method":"Repository.where","file":"src/Repository.ts","thenable":"Illuminate\\Database\\Query\\Builder"}`}\n]\n`);

    // A contracts module whose THENABLE_TYPES is empty or not a string[] is not used.
    for (const source of ["export const THENABLE_TYPES: readonly string[] = [];\n", "export const THENABLE_TYPES = [1, 2];\n", "export const OTHER = 1;\n"]) {
      const bad = tempDir("xaravel-async-surface-contracts-");
      installContracts(bad, source);
      expect(await thenableTypes(bad)).toBe(THENABLE_TYPES);
    }

    // The tool's list is the Story 6.3 fixture list, by FQCN.
    expect(FALLBACK).toContain("Illuminate\\Database\\Query\\Builder");
    expect(FALLBACK).toContain("Illuminate\\Http\\Client\\PendingRequest");

    // A deleted source's stale `.d.ts` (left in outDir by the incremental build) is not read; the existing file is
    // rewritten, to `[]\n` here.
    const stale = demoRoot(passingSources());
    expect(cli(stale, ["demo"]).exitCode).toBe(0);
    rmSync(join(stale, "packages", "demo", "src", "Repository.ts"));
    const rerun = cli(stale, ["demo"]);
    expect(rerun.exitCode).toBe(0);
    expect(existsSync(join(stale, ".cache", "tsc", "demo", "src", "Repository.d.ts"))).toBe(true);
    expect(readFileSync(SURFACE(stale), "utf8")).toBe("[]\n");

    // An empty package renders `[]\n`.
    expect(render([])).toBe("[]\n");

    // The I/O matrix's edge cases through the walk, and the resolver over real files.
    matrixEdgeCases();
    resolverCases();
  },
);

// XT-conformance-135

/** Each failing fixture and the method its error names. */
const FAILING: readonly { readonly fixture: string; readonly method: string; readonly says: string; readonly builder?: true }[] = [
  { fixture: "untagged.ts", method: "Repository.put", says: "returns a Promise but has no @asyncRoot tag" },
  { fixture: "malformed.ts", method: "Repository.forget", says: "has a malformed @asyncRoot tag" },
  { fixture: "conflicting.ts", method: "Repository.pull", says: "has conflicting @asyncRoot tags across its overloads" },
  { fixture: "stray.ts", method: "Repository.getPrefix", says: "has an @asyncRoot tag but returns neither a Promise nor a thenable" },
  { fixture: "tagged-thenable.ts", method: "Repository.where", says: "returns a thenable but no Promise, so it carries no @asyncRoot tag (AD-6)", builder: true },
];

xaravelTest(
  "XT-conformance-135",
  "a Promise-returning public method with no @asyncRoot tag, a malformed tag, conflicting overload tags, a tag on a thenable-returning method with no Promise or a tag on a non-async method makes bun run async-surface exit 1 naming the file, the method and AD-6, and write nothing (AD-6)",
  () => {
    for (const { fixture, method, says, builder } of FAILING) {
      const dir = demoRoot({ "Repository.ts": join(FIXTURES, "failing", fixture), ...(builder === true ? { "Builder.ts": join(FIXTURES, "demo", "src", "Builder.ts") } : {}) });
      // A committed file is left as it was, in both modes.
      write(dir, { "packages/demo/async-surface.json": "[]\n" });
      for (const args of [["demo"], ["--check", "demo"]]) {
        const run = cli(dir, args);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(`async-surface: packages/demo/src/Repository.ts: ${method} ${says}`);
        expect(run.stderr).toMatch(/\(AD-6\)\n/);
        expect(run.stderr).toContain("nothing written");
        expect(readFileSync(SURFACE(dir), "utf8")).toBe("[]\n");
      }
    }

    // Every error is reported before the exit, and another package's file is not written either.
    const dir = demoRoot({ "A.ts": join(FIXTURES, "failing", "untagged.ts"), "B.ts": join(FIXTURES, "failing", "stray.ts") });
    mkdirSync(join(dir, "packages", "other", "src"), { recursive: true });
    cpSync(join(FIXTURES, "demo", "package.json"), join(dir, "packages", "other", "package.json"));
    writeFileSync(join(dir, "packages", "other", "tsconfig.json"), readFileSync(join(FIXTURES, "demo", "tsconfig.json"), "utf8").replaceAll("/demo", "/other"));
    writeFileSync(join(dir, "packages", "other", "src", "Ok.ts"), "export function ok(): string {\n  return \"\";\n}\n");
    const run = cli(dir, ["--all"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("packages/demo/src/A.ts: Repository.put");
    expect(run.stderr).toContain("packages/demo/src/B.ts: Repository.getPrefix");
    expect(existsSync(SURFACE(dir))).toBe(false);
    expect(existsSync(join(dir, "packages", "other", "async-surface.json"))).toBe(false);

    // A tsc failure exits non-zero with tsc's output.
    const broken = tempDir("xaravel-async-surface-tsc-");
    cpSync(join(FIXTURES, "demo", "package.json"), join(broken, "packages", "demo", "package.json"), { recursive: true });
    cpSync(join(FIXTURES, "demo", "tsconfig.json"), join(broken, "packages", "demo", "tsconfig.json"));
    write(broken, { "packages/demo/src/Broken.ts": "export const x: number = \"no\";\n" });
    const tsc = cli(broken, ["demo"]);
    expect(tsc.exitCode).toBe(1);
    expect(tsc.stdout + tsc.stderr).toContain("TS2322");
    expect(existsSync(SURFACE(broken))).toBe(false);

    // Usage errors: an unknown package (named), nothing selected, an unknown option.
    const unknown = cli(dir, ["nope"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain("unknown package nope");
    expect(cli(dir, ["@xaravel/nope"]).stderr).toContain("unknown package @xaravel/nope");
    expect(cli(dir, []).exitCode).toBe(2);
    expect(cli(dir, ["--all", "demo"]).exitCode).toBe(2);
    expect(cli(dir, ["--bogus", "demo"]).exitCode).toBe(2);
  },
);

// XT-conformance-136

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly if?: string;
}
interface Workflow {
  readonly on: Record<string, unknown>;
  readonly jobs: Record<string, { readonly if?: string; readonly steps: readonly Step[] }>;
}

xaravelTest(
  "XT-conformance-136",
  "bun run async-surface --check fails printing the line diff when a committed async-surface.json differs from the regenerated one (a missing file counts as []), passes when it matches, never writes; ci.yml's check job runs bun run async-surface --all --check after the typecheck on pull_request and merge_group (AD-6, AD-28)",
  () => {
    const dir = demoRoot(passingSources());
    const lines = EXPECTED.split("\n");

    // Drift: the committed file is missing an entry.
    const missing = [...lines.slice(0, 3), ...lines.slice(4)].join("\n");
    write(dir, { "packages/demo/async-surface.json": missing });
    const drift = cli(dir, ["--check", "demo"]);
    expect(drift.exitCode).toBe(1);
    expect(drift.stderr).toContain("async-surface: packages/demo/async-surface.json is out of date (AD-6); run bun run async-surface demo\n");
    expect(drift.stderr).toContain(`\n+${lines[3]!.replace(/,$/, "")}\n`);
    expect(drift.stderr).not.toMatch(/^-/m);
    expect(readFileSync(SURFACE(dir), "utf8")).toBe(missing);

    // Drift the other way: a committed entry the source no longer has prints a `-` line.
    const extra = String.raw`{"method":"Repository.gone","file":"src/Repository.ts","root":"callback"}`;
    write(dir, { "packages/demo/async-surface.json": EXPECTED.replace("[\n", `[\n${extra},\n`) });
    const stale = cli(dir, ["--check", "--all"]);
    expect(stale.exitCode).toBe(1);
    expect(stale.stderr).toContain(`\n-${extra}\n`);
    expect(stale.stderr).not.toMatch(/^\+/m);

    // A matching committed file passes.
    write(dir, { "packages/demo/async-surface.json": EXPECTED });
    const ok = cli(dir, ["--check", "demo"]);
    expect(ok.stderr).toBe("");
    expect(ok.exitCode).toBe(0);

    // No committed file: equal to `[]`, so an async package fails with every entry as `+` and writes nothing.
    rmSync(SURFACE(dir));
    const absent = cli(dir, ["--check", "demo"]);
    expect(absent.exitCode).toBe(1);
    expect(absent.stderr.split("\n").filter((line) => line.startsWith("+"))).toHaveLength(11);
    expect(existsSync(SURFACE(dir))).toBe(false);

    // ...and a package with no async method passes.
    const empty = demoRoot({ "Builder.ts": join(FIXTURES, "demo", "src", "Builder.ts") });
    const clean = cli(empty, ["--check", "--all"]);
    expect(clean.stderr).toBe("");
    expect(clean.exitCode).toBe(0);
    expect(existsSync(SURFACE(empty))).toBe(false);
    // Write mode writes no `[]` file where none exists, and says so.
    const none = cli(empty, ["--all"]);
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toContain("async-surface: packages/demo has no async methods; no file written");
    expect(existsSync(SURFACE(empty))).toBe(false);

    // The real repository passes (it writes only the gitignored `.cache/tsc`).
    const real = cli(root, ["--all", "--check"]);
    expect(real.stderr).toBe("");
    expect(real.exitCode).toBe(0);

    // diff(): committed-only lines as `-`, regenerated-only lines as `+`; a formatting-only change shows both files.
    expect(diff(EXPECTED, EXPECTED)).toEqual([]);
    expect(diff("[]\n", "[\n{\"a\":1}\n]\n")).toEqual(["+{\"a\":1}"]);
    expect(diff("[\n{\"a\":1}\n]", "[\n{\"a\":1}\n]\n")).toEqual(["-[", "-{\"a\":1}", "-]", "+[", "+{\"a\":1}", "+]", "+"]);

    // The CI wiring: `check` runs it after the typecheck, unconditionally, on PRs and in the merge queue.
    const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as Workflow;
    expect(Object.keys(workflow.on)).toContain("pull_request");
    expect(Object.keys(workflow.on)).toContain("merge_group");
    const check = workflow.jobs["check"]!;
    expect(check.if).toBeUndefined();
    const runs = check.steps.map((step) => step.run);
    const at = runs.indexOf("bun run async-surface --all --check");
    expect(at).toBeGreaterThan(runs.indexOf("bun run typecheck"));
    expect(runs.indexOf("bun run typecheck")).toBeGreaterThanOrEqual(0);
    expect(check.steps[at]!.if).toBeUndefined();

    // The script and the pinned parser.
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.scripts["async-surface"]).toBe("bun --no-env-file tools/async-surface/async-surface.ts");
    expect(pkg.devDependencies["oxc-parser"]).toBe("0.155.0");
  },
);

// The I/O matrix's edge cases, through the walk (run by XT-conformance-134).

const QUERY = "Illuminate\\Database\\Query\\Builder";

/**
 * A stub resolver standing in for `registeredFqcn`: `./Builder` exports the Query Builder, `./Schema` a Schema
 * `Builder`, `./Lazy` `X\Lazy`; the file's own `Local` registers `\illuminate\http\client\pendingrequest` (a leading
 * `\` and another case); every other name resolves to nothing (an unregistered local `Builder` included).
 */
const STUB: Readonly<Record<string, string>> = {
  "./Builder#Builder": QUERY,
  "./Schema#Builder": "Illuminate\\Database\\Schema\\Builder",
  "./Lazy#Lazy": "X\\Lazy",
  "#Local": "\\illuminate\\http\\client\\pendingrequest",
};
const resolved: string[] = [];
const stub: FqcnResolver = (file, specifier, name) => {
  resolved.push(`${file}:${specifier ?? ""}#${name}`);
  return STUB[`${specifier ?? ""}#${name}`] ?? null;
};

const surface = (text: string, thenables: readonly string[] = FALLBACK): ReturnType<typeof surfaceOf> => surfaceOf([{ file: "src/Repository.ts", text }], thenables, stub);

const thenableLine = (method: string, thenable: string): string => JSON.stringify({ method, file: "src/Repository.ts", thenable });

/** The I/O matrix shapes and the walk's edge cases, over inline `.d.ts` texts (part of XT-conformance-134). */
function matrixEdgeCases(): void {
  // tagged / thenable (untagged) / sync / private / protected / #private.
  resolved.length = 0;
  const base = surface(String.raw`import { Builder } from "./Builder";
export declare class Repository {
  #private;
  private x;
  /** @asyncRoot Cache\Store.get */
  get(): Promise<string>;
  where(): Builder;
  getPrefix(): string;
  protected p(): Promise<void>;
  private q;
  constructor();
  set value(v: Promise<void>);
}
`);
  expect(base.errors).toEqual([]);
  expect(render(base.entries)).toBe(`[\n${String.raw`{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"}`},\n${thenableLine("Repository.where", QUERY)}\n]\n`);
  // The resolver is asked from the declaration's source file, with the import's specifier and imported name.
  expect(resolved).toContain("src/Repository.ts:./Builder#Builder");

  // Tagged thenable: the tag is only for a Promise-returning method.
  const tagged = surface('import { Builder } from "./Builder";\nexport declare class Repository {\n    /** @asyncRoot callback */\n    where(): Builder;\n}\n');
  expect(tagged.entries).toEqual([]);
  expect(tagged.errors.map((e) => e.message)).toEqual(["Repository.where returns a thenable but no Promise, so it carries no @asyncRoot tag (AD-6)"]);

  // The same short name with another FQCN, and an unregistered local `Builder`, are not thenables.
  for (const text of [
    'import { Builder } from "./Schema";\nexport declare class Repository {\n    getSchemaBuilder(): Builder;\n}\n',
    "declare class Builder {\n}\nexport declare class Repository {\n    getSchemaBuilder(): Builder;\n}\n",
    "export declare class Repository {\n    getSchemaBuilder(): Builder;\n}\n",
  ]) {
    expect(surface(text)).toEqual({ entries: [], errors: [] });
  }

  // Untagged: named, with AD-6.
  const untagged = surface("export declare class Repository {\n    put(): Promise<void>;\n}\n");
  expect(untagged.entries).toEqual([]);
  expect(untagged.errors).toHaveLength(1);
  expect(untagged.errors[0]!.method).toBe("Repository.put");
  expect(untagged.errors[0]!.message).toBe("Repository.put returns a Promise but has no @asyncRoot tag (`@asyncRoot <Contract.method>` or `@asyncRoot callback`) (AD-6)");

  // A Promise or a thenable: async, so the tag is required and the line is an async one.
  const either = 'import { Builder } from "./Builder";\nexport declare class R {\n    m(): Promise<string> | Builder;\n}\n';
  expect(surface(either).errors.map((e) => e.message)).toEqual([expect.stringContaining("R.m returns a Promise but has no @asyncRoot tag")]);
  expect(surface(either.replace("    m()", "    /** @asyncRoot callback */\n    m()"))).toEqual({ entries: [{ method: "R.m", file: "src/Repository.ts", root: "callback" }], errors: [] });
  // ...and so is a Promise on one overload and a thenable on another.
  expect(surface('import { Builder } from "./Builder";\nexport declare class R {\n    /** @asyncRoot callback */\n    m(): Builder;\n    m(x: 1): Promise<void>;\n}\n').entries).toEqual([{ method: "R.m", file: "src/Repository.ts", root: "callback" }]);

  // Return types through parentheses, unions and intersections; qualified names; PromiseLike.
  for (const type of ["(Promise<void>)", "Promise<void> | null", "Promise<void> & { x: 1 }", "ns.Promise<void>", "PromiseLike<void>"]) {
    expect(surface(`export declare function f(): ${type};\n`).errors.map((e) => e.method)).toEqual(["f"]);
  }
  // A qualified thenable name counts only through a namespace import: `Eloquent.Builder` alone is no thenable.
  expect(surface("export declare function f(): Eloquent.Builder;\n")).toEqual({ entries: [], errors: [] });
  expect(render(surface('import * as Eloquent from "./Builder";\nexport declare function f(): Eloquent.Builder;\n').entries)).toBe(`[\n${thenableLine("f", QUERY)}\n]\n`);
  // Not async: a Promise nested in a type argument, an array or a callback parameter.
  for (const type of ["Array<Promise<void>>", "Promise<void>[]", "Map<string, Builder>"]) {
    expect(surface(`import { Builder } from "./Builder";\nexport declare function f(cb: () => Promise<void>): ${type};\n`)).toEqual({ entries: [], errors: [] });
  }

  // Resolution paths, each to the Query Builder: named, renamed, `import type`, a type-only specifier, a namespace,
  // `import("…")`, and a same-file registration (compared without the leading `\`, case-insensitively, printed as the
  // list spells it).
  for (const [text, thenable] of [
    ['import { Builder } from "./Builder";\nexport declare function f(): Builder;\n', QUERY],
    ['import { Builder as QB } from "./Builder";\nexport declare function f(): QB | null;\n', QUERY],
    ['import type { Builder } from "./Builder";\nexport declare function f(): Builder & { x: 1 };\n', QUERY],
    ['import { type Builder } from "./Builder";\nexport declare function f(): (Builder);\n', QUERY],
    ['import * as db from "./Builder";\nexport declare function f(): db.Builder;\n', QUERY],
    ['export declare function f(): import("./Builder").Builder;\n', QUERY],
    ["export declare class Local {\n}\nexport declare function f(): Local;\n", "Illuminate\\Http\\Client\\PendingRequest"],
  ] as const) {
    expect(render(surface(text).entries)).toBe(`[\n${thenableLine("f", thenable)}\n]\n`);
  }
  // A namespace binding itself, an unresolvable `import("…")` and a deeper qualifier are no thenables.
  expect(surface('import * as Builder from "./Builder";\nexport declare function f(): Builder;\nexport declare function g(): import("./Nope").Builder;\nexport declare function h(): import("./Builder").x.Builder;\n')).toEqual({ entries: [], errors: [] });

  // Several thenables (a union, or across overloads): distinct, sorted, joined by `|`.
  const several = surface('import { Builder } from "./Builder";\nimport { Lazy } from "./Lazy";\nexport declare class R {\n    m(): Lazy | Builder;\n    n(): Lazy;\n    n(x: 1): Builder;\n    n(x: 2): Builder;\n}\n', ["X\\Lazy", ...FALLBACK]);
  expect(several.entries).toEqual([
    { method: "R.m", file: "src/Repository.ts", thenable: `${QUERY}|X\\Lazy` },
    { method: "R.n", file: "src/Repository.ts", thenable: `${QUERY}|X\\Lazy` },
  ]);

  // The tag must be the nearest JSDoc with only whitespace between; a line comment or a plain block comment is not one.
  expect(surface("/** @asyncRoot callback */\nexport declare function a(): void;\nexport declare function f(): Promise<void>;\n").errors.map((e) => e.method)).toEqual(["a", "f"]);
  expect(surface("/* @asyncRoot callback */\nexport declare function f(): Promise<void>;\n").errors.map((e) => e.method)).toEqual(["f"]);
  expect(surface("/**\n * Does it.\n *\n * @asyncRoot Illuminate\\Contracts\\Cache\\Store.get\n */\nexport declare function f(): Promise<void>;\n").entries).toEqual([{ method: "f", file: "src/Repository.ts", root: "Illuminate\\Contracts\\Cache\\Store.get" }]);
  // Malformed values.
  for (const value of ["", "Store", "Store.", "Cache\\Store.get extra", "\\Store.get", "Callback"]) {
    expect(surface(`/** @asyncRoot ${value} */\nexport declare function f(): Promise<void>;\n`).errors[0]?.message ?? "").toContain("malformed");
  }

  // Overloads: one entry, async if any signature is, tag on any; conflicting tags fail.
  const overloads = surface("export declare class R {\n    m(): string;\n    /** @asyncRoot callback */\n    m(x: 1): Promise<string>;\n}\n");
  expect(overloads).toEqual({ entries: [{ method: "R.m", file: "src/Repository.ts", root: "callback" }], errors: [] });
  const same = surface("export declare class R {\n    /** @asyncRoot callback */\n    m(): Promise<void>;\n    /** @asyncRoot callback */\n    m(x: 1): Promise<void>;\n}\n");
  expect(same.entries).toHaveLength(1);

  // Exports: only exported classes and interfaces, under their exported names; functions and consts.
  const exports = surface(String.raw`declare class Hidden {
  /** @asyncRoot callback */
  run(): Promise<void>;
}
declare class Local {
  /** @asyncRoot callback */
  run(): Promise<void>;
  /** @asyncRoot callback */
  static make(): Promise<Local>;
}
interface Contract {
  /** @asyncRoot callback */
  get(): Promise<void>;
  /** @asyncRoot callback */
  put: () => Promise<void>;
  size: number;
}
export { Local as Public, Contract };
/** @asyncRoot callback */
export declare const c: () => Promise<void>;
export declare const n: number;
export declare let l: () => Promise<void>;
`);
  expect(exports.errors).toEqual([]);
  expect(exports.entries.map((e) => e.method)).toEqual(["Contract.get", "Contract.put", "Public.run", "Public.static make", "c"]);

  // tsc's inferred cross-module return type `import("./Builder").Builder` resolves through its specifier; a qualified
  // `import("./x").ns.Promise` is a Promise by its last segment.
  const imported = surface('export declare function f(): import("./Builder").Builder;\nexport declare function g(): import("./x").ns.Promise<void>;\n');
  expect(imported.entries).toEqual([{ method: "f", file: "src/Repository.ts", thenable: QUERY }]);
  expect(imported.errors.map((e) => e.method)).toEqual(["g"]);
  // Only `readonly` is unwrapped: `keyof Promise<T>` is not async.
  expect(surface("export declare function f(): keyof Promise<void>;\nexport declare function g(): unique symbol;\n")).toEqual({ entries: [], errors: [] });
  // A nullable callback field or const (AD-9's shape) is listed through its function member.
  const nullable = surface('import { Builder } from "./Builder";\nexport declare class R {\n    /** @asyncRoot callback */\n    run: (() => Promise<void>) | null;\n    sync: (() => void) | null;\n}\nexport declare const c: ((() => Builder)) | null;\n');
  expect(nullable.errors).toEqual([]);
  expect(nullable.entries).toEqual([
    { method: "R.run", file: "src/Repository.ts", root: "callback" },
    { method: "c", file: "src/Repository.ts", thenable: QUERY },
  ]);
  // A declaration that does not parse fails naming the file, instead of yielding a partial surface.
  const broken = surface("export declare class R {\n    x(: void;\n}\n");
  expect(broken.entries).toEqual([]);
  expect(broken.errors).toHaveLength(1);
  expect(broken.errors[0]!.file).toBe("src/Repository.ts");
  expect(broken.errors[0]!.message).toStartWith("does not parse: ");
  expect(broken.errors[0]!.message).toEndWith("(AD-6)");

  // Abstract members: public ones are listed or fail untagged; protected ones are ignored.
  const abstract = surface("export declare abstract class Q {\n    abstract push(): Promise<void>;\n    abstract get x(): Promise<void>;\n    protected abstract p(): Promise<void>;\n    /** @asyncRoot Queue\\Queue.pop */\n    abstract pop(): Promise<void>;\n}\n");
  expect(abstract.errors.map((e) => e.method)).toEqual(["Q.push", "Q.x"]);
  expect(abstract.entries).toEqual([{ method: "Q.pop", file: "src/Repository.ts", root: "Queue\\Queue.pop" }]);

  // The contracts list replaces the fallback: `Lazy` listed, `Builder` not.
  const contracts = ["X\\Lazy"];
  expect(surface('import { Builder } from "./Builder";\nimport { Lazy } from "./Lazy";\nexport declare function a(): Lazy;\nexport declare function b(): Builder;\n', contracts)).toEqual({ entries: [{ method: "a", file: "src/Repository.ts", thenable: "X\\Lazy" }], errors: [] });

  // Without a resolver nothing is a thenable; only Promises count.
  expect(surfaceOf([{ file: "src/Repository.ts", text: 'import { Builder } from "./Builder";\nexport declare function f(): Builder;\n' }], FALLBACK)).toEqual({ entries: [], errors: [] });

  // Sorted by file, then method.
  const sorted = surfaceOf(
    [
      { file: "src/b.ts", text: "/** @asyncRoot callback */\nexport declare function a(): Promise<void>;\n" },
      { file: "src/a.ts", text: "/** @asyncRoot callback */\nexport declare function z(): Promise<void>;\n/** @asyncRoot callback */\nexport declare function y(): Promise<void>;\n" },
    ],
    FALLBACK,
  );
  expect(sorted.entries.map((e) => `${e.file}#${e.method}`)).toEqual(["src/a.ts#y", "src/a.ts#z", "src/b.ts#a"]);
}

/** `registeredFqcn` and `isThenableFqcn` over temp source files: every resolution path of the I/O matrix (part of XT-conformance-134). */
function resolverCases(): void {
  const dir = tempDir("xaravel-async-surface-resolve-");
  const stand = "function registerClass(fqcn: string, value: object): void {\n  void fqcn;\n  void value;\n}\n";
  write(dir, {
    "src/Query/Builder.ts": `export class Builder {}\n${stand}registerClass("Illuminate\\\\Database\\\\Query\\\\Builder", Builder);\n`,
    "src/Schema/Builder.ts": `export class Builder {}\n${stand}registerClass("Illuminate\\\\Database\\\\Schema\\\\Builder", Builder);\n`,
    // A local class registered and exported later under another name; an unregistered one.
    "src/Local.ts": `class Pending {}\nclass Plain {}\n${stand}registerClass("\\\\Illuminate\\\\Http\\\\Client\\\\PendingRequest", Pending);\nexport { Pending as PendingRequest, Plain };\n`,
    // Re-exports: renamed `export {} from`, an imported-then-exported binding, an `export *` chain, an index file.
    "src/Renamed.ts": 'export { Builder as QueryBuilder } from "./Query/Builder";\n',
    "src/Imported.ts": 'import { QueryBuilder } from "./Renamed.js";\nexport { QueryBuilder };\n',
    "src/barrel/index.ts": 'export * from "../Schema/Other";\nexport * from "../Imported";\n',
    "src/Schema/Other.ts": "export class Other {}\n",
    // A cycle of `export *`.
    "src/CycleA.ts": 'export * from "./CycleB";\n',
    "src/CycleB.ts": 'export * from "./CycleA";\n',
    // A bare specifier, resolved like Bun does from the file's directory.
    "node_modules/@demo/db/package.json": JSON.stringify({ name: "@demo/db", type: "module", exports: { ".": "./index.ts" } }),
    "node_modules/@demo/db/index.ts": 'export { Builder } from "./Builder";\n',
    "node_modules/@demo/db/Builder.ts": `export class Builder {}\n${stand}registerClass("Illuminate\\\\Database\\\\Query\\\\Builder", Builder);\n`,
    "src/Use.ts": 'import { Builder } from "./Query/Builder";\nexport class Same {}\n',
  });
  const from = join(dir, "src", "Use.ts");
  const query = "Illuminate\\Database\\Query\\Builder";
  expect(registeredFqcn(from, "./Query/Builder", "Builder")).toBe(query);
  expect(registeredFqcn(from, "./Query/Builder.js", "Builder")).toBe(query);
  expect(registeredFqcn(from, "./Query/Builder.ts", "Builder")).toBe(query);
  expect(registeredFqcn(from, "./Schema/Builder", "Builder")).toBe("Illuminate\\Database\\Schema\\Builder");
  expect(registeredFqcn(from, "./Renamed", "QueryBuilder")).toBe(query);
  expect(registeredFqcn(from, "./Imported", "QueryBuilder")).toBe(query);
  expect(registeredFqcn(from, "./barrel", "QueryBuilder")).toBe(query);
  expect(registeredFqcn(from, "@demo/db", "Builder")).toBe(query);
  expect(registeredFqcn(from, "./Local", "PendingRequest")).toBe("Illuminate\\Http\\Client\\PendingRequest");
  // The file's own bindings: an import, followed; a local unregistered class.
  expect(registeredFqcn(from, null, "Builder")).toBe(query);
  expect(registeredFqcn(from, null, "Same")).toBeNull();
  // Unresolvable: no such export, an unregistered export, a cycle, a missing module, a missing package.
  expect(registeredFqcn(from, "./Query/Builder", "Nope")).toBeNull();
  expect(registeredFqcn(from, "./Local", "Plain")).toBeNull();
  expect(registeredFqcn(from, "./barrel", "Other")).toBeNull();
  expect(registeredFqcn(from, "./CycleA", "Builder")).toBeNull();
  expect(registeredFqcn(from, "./Missing", "Builder")).toBeNull();
  expect(registeredFqcn(from, "@demo/missing", "Builder")).toBeNull();
  // The cache follows the file's mtime.
  const local = join(dir, "src", "Query", "Builder.ts");
  writeFileSync(local, `export class Builder {}\n${stand}registerClass("App\\\\Builder", Builder);\n`);
  const later = new Date(Date.now() + 60_000);
  utimesSync(local, later, later);
  expect(registeredFqcn(from, "./Query/Builder", "Builder")).toBe("App\\Builder");

  // The list comparison: without a leading `\`, case-insensitively, printed as the list spells it.
  expect(isThenableFqcn("\\illuminate\\database\\query\\BUILDER", THENABLE_TYPES)).toBe(query);
  expect(isThenableFqcn("Illuminate\\Database\\Schema\\Builder", THENABLE_TYPES)).toBeNull();
  expect(isThenableFqcn(null, THENABLE_TYPES)).toBeNull();
}

// XT-conformance-263

const PIPELINE = "Illuminate\\Contracts\\Pipeline\\Pipeline";

/** A `contract` stand-in for the temp sources (the demo tsconfig has `types: []`). */
const CONTRACT_STAND = "export function contract<T, B = never>(id: string, shape: object): { readonly id: string; readonly shape: object; readonly t?: T; readonly b?: B } {\n  return { id, shape };\n}\n";

/**
 * A reduced stand-in for `packages/contracts`' Pipeline source: the interface with `this`-returning setters (one a
 * `this | null` union case) and its token, without the brand member and with a short shape.
 */
const PIPELINE_SOURCE = String.raw`import { contract } from "./Contract";

declare const PipelineBrand: unique symbol;

export interface Pipeline {
  send(passable: unknown): this;
  through(pipes: unknown): this | null;
  via(method: string): this;
  /** @asyncRoot callback */
  then(destination: () => unknown): Promise<unknown>;
}

export const Pipeline = contract<Pipeline, typeof PipelineBrand>("Illuminate\\Contracts\\Pipeline\\Pipeline", {
  send: ["passable"],
});
`;

xaravelTest(
  "XT-conformance-263",
  "a contract token (a top-level const X = contract(\"<FQCN>\", …) with contract imported by name) resolves as a registration of X, a registerClass of the same local winning; Illuminate\\Contracts\\Pipeline\\Pipeline and Illuminate\\Pipeline\\Pipeline are listed thenables; a this return type in a class or interface resolves to its own FQCN, so a listed owner's this-returning methods get thenable lines and packages/contracts lists Pipeline.send, through and via (ESC-10.2-2, ESC-10.2-6; AD-6)",
  () => {
    // The list gains both Pipelines, by FQCN.
    expect(THENABLE_TYPES).toContain(PIPELINE);
    expect(THENABLE_TYPES).toContain("Illuminate\\Pipeline\\Pipeline");

    // Token resolves: directly, through an importer, through a re-export; with `as`, `<T>`, `satisfies`, `!` and parentheses.
    const dir = tempDir("xaravel-async-surface-token-");
    write(dir, {
      "src/Contract.ts": CONTRACT_STAND,
      "src/Pipeline.ts": PIPELINE_SOURCE,
      "src/Use.ts": 'import { Pipeline } from "./Pipeline";\nexport type Used = Pipeline;\n',
      "src/Barrel.ts": 'export { Pipeline as P } from "./Pipeline";\n',
      "src/Wrapped.ts": String.raw`import { contract as make } from "./Contract";
import { contract } from "./Contract";
export const A = (contract("A\\One", {}) as unknown)!;
export const B = contract<unknown, never>("\\A\\Two", {}) satisfies object;
export const C = ((contract("A\\Three", {})));
const D = contract("A\\Four", {});
export { D as Renamed };
export const E = make("A\\Five", {});
export const F = <unknown>contract("A\\Six", {});
`,
      // Not a token: `contract` not imported (a local function), a non-literal first argument, a `let`, a nested
      // call, a non-FQCN literal, an optional call, a `contract` imported under another name.
      "src/Local.ts": String.raw`function contract(id: string, shape: object): object {
  return { id, shape };
}
export const P = contract("A\\Local", {});
`,
      "src/NotTokens.ts": String.raw`import { contract } from "./Contract";
const id = "A\\Dynamic";
declare function wrap(value: unknown): unknown;
export const Dynamic = contract(id, {});
export let Mutable = contract("A\\Let", {});
export const Nested = wrap(contract("A\\Nested", {}));
export const Odd = contract("not an fqcn", {});
export const Optional = contract?.("A\\Optional", {});
export function inner(): unknown {
  const Inner = contract("A\\Inner", {});
  return Inner;
}
`,
      "src/Aliased.ts": String.raw`import { other as contract } from "./Contract";
export const P = contract("A\\Aliased", {});
`,
      // registerClass wins over a token of the same local, wherever it sits.
      "src/Both.ts": String.raw`import { contract } from "./Contract";
export const P = contract("X\\Token", {});
registerClass("A\\B", P);
function registerClass(fqcn: string, value: object): void {
  void [fqcn, value];
}
`,
    });
    const use = join(dir, "src", "Use.ts");
    expect(registeredFqcn(join(dir, "src", "Pipeline.ts"), null, "Pipeline")).toBe(PIPELINE);
    expect(registeredFqcn(use, "./Pipeline", "Pipeline")).toBe(PIPELINE);
    expect(registeredFqcn(use, null, "Pipeline")).toBe(PIPELINE);
    expect(registeredFqcn(use, "./Barrel", "P")).toBe(PIPELINE);
    expect(registeredFqcn(use, "./Wrapped", "A")).toBe("A\\One");
    expect(registeredFqcn(use, "./Wrapped", "B")).toBe("A\\Two");
    expect(registeredFqcn(use, "./Wrapped", "C")).toBe("A\\Three");
    expect(registeredFqcn(use, "./Wrapped", "Renamed")).toBe("A\\Four");
    expect(registeredFqcn(use, "./Wrapped", "E")).toBeNull();
    expect(registeredFqcn(use, "./Wrapped", "F")).toBe("A\\Six");
    expect(registeredFqcn(use, "./Local", "P")).toBeNull();
    for (const name of ["Dynamic", "Mutable", "Nested", "Odd", "Optional", "inner"]) {
      expect(registeredFqcn(use, "./NotTokens", name)).toBeNull();
    }
    // A token inside a function is not top-level, so its local is no registration.
    expect(registeredFqcn(join(dir, "src", "NotTokens.ts"), null, "Inner")).toBeNull();
    expect(registeredFqcn(use, "./Aliased", "P")).toBeNull();
    expect(registeredFqcn(use, "./Both", "P")).toBe("A\\B");
    expect(isThenableFqcn(registeredFqcn(use, "./Pipeline", "Pipeline"), THENABLE_TYPES)).toBe(PIPELINE);

    // `this` through the walk, with a stub resolver: the listed owner `Pipeline` (the file's own binding), the
    // unlisted `Repo`; an exported alias resolves through its local name.
    const owners: Readonly<Record<string, string>> = { Pipeline: PIPELINE, Repo: "App\\Repo", Hub: "Illuminate\\Pipeline\\Pipeline" };
    const asked: string[] = [];
    const resolver: FqcnResolver = (file, specifier, name) => {
      asked.push(`${file}:${specifier ?? ""}#${name}`);
      return specifier === null ? (owners[name] ?? null) : null;
    };
    const walk = (text: string): ReturnType<typeof surfaceOf> => surfaceOf([{ file: "src/pipeline/Pipeline.ts", text }], THENABLE_TYPES, resolver);
    const line = (method: string, thenable: string): { method: string; file: string; thenable: string } => ({ method, file: "src/pipeline/Pipeline.ts", thenable });
    const listed = walk("export interface Pipeline {\n    send(passable: unknown): this;\n    through(pipes: unknown): this | null;\n    via(method: string): (this);\n    /** @asyncRoot callback */\n    then(destination: () => unknown): Promise<unknown>;\n}\n");
    expect(listed.errors).toEqual([]);
    expect(listed.entries).toEqual([
      line("Pipeline.send", PIPELINE),
      { method: "Pipeline.then", file: "src/pipeline/Pipeline.ts", root: "callback" },
      line("Pipeline.through", PIPELINE),
      line("Pipeline.via", PIPELINE),
    ]);
    expect(asked).toContain("src/pipeline/Pipeline.ts:#Pipeline");
    // A class, exported under another name: `this` resolves through the local `Hub`, the line names the export; a
    // static member's `this` (invalid there, TS2526) names no owner, so it yields no line.
    expect(walk("declare class Hub {\n    pipe(): this;\n    static make(): this;\n    private hidden(): this;\n}\nexport { Hub as Pipes };\n").entries).toEqual([
      line("Pipes.pipe", "Illuminate\\Pipeline\\Pipeline"),
    ]);
    // An unlisted owner, and `this` outside a class or interface, yield no line.
    expect(walk("export interface Repo {\n    tap(): this;\n}\nexport interface Unknown {\n    tap(): this;\n}\nexport declare function f(this: unknown): unknown;\n")).toEqual({ entries: [], errors: [] });
    // A tag on a `this`-returning method of a listed owner is the existing thenable error.
    const tagged = walk("export interface Pipeline {\n    /** @asyncRoot callback */\n    send(passable: unknown): this;\n}\n");
    expect(tagged.entries).toEqual([]);
    expect(tagged.errors).toEqual([{ file: "src/pipeline/Pipeline.ts", method: "Pipeline.send", message: "Pipeline.send returns a thenable but no Promise, so it carries no @asyncRoot tag (AD-6)" }]);

    // End to end: the real CLI and tsc over a temp package holding the token, with the real resolver.
    const root2 = demoRoot({});
    write(join(root2, "packages", "demo"), {
      "src/Contract.ts": CONTRACT_STAND,
      "src/Pipeline.ts": PIPELINE_SOURCE,
      "src/Repo.ts": "export interface Repo {\n  tap(): this;\n}\n",
    });
    const run = cli(root2, ["demo"]);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    expect(readFileSync(SURFACE(root2), "utf8")).toBe(
      [
        "[",
        String.raw`{"method":"Pipeline.send","file":"src/Pipeline.ts","thenable":"Illuminate\\Contracts\\Pipeline\\Pipeline"},`,
        String.raw`{"method":"Pipeline.then","file":"src/Pipeline.ts","root":"callback"},`,
        String.raw`{"method":"Pipeline.through","file":"src/Pipeline.ts","thenable":"Illuminate\\Contracts\\Pipeline\\Pipeline"},`,
        String.raw`{"method":"Pipeline.via","file":"src/Pipeline.ts","thenable":"Illuminate\\Contracts\\Pipeline\\Pipeline"}`,
        "]",
        "",
      ].join("\n"),
    );

    // The real `packages/contracts`: the CLI's check passes, and its committed thenable lines include the three.
    const real = cli(root, ["--check", "contracts"]);
    expect(real.stderr).toBe("");
    expect(real.exitCode).toBe(0);
    const committed = readFileSync(join(root, "packages", "contracts", "async-surface.json"), "utf8").split("\n").map((text) => text.replace(/,$/, ""));
    for (const method of ["send", "through", "via"]) {
      expect(committed).toContain(JSON.stringify({ method: `Pipeline.${method}`, file: "src/pipeline/Pipeline.ts", thenable: PIPELINE }));
    }
  },
);

// XT-conformance-264 (epic-10-item-6-structural-thenables, ESC-10.3-2)

const PENDING_DISPATCH = "Illuminate\\Foundation\\Bus\\PendingDispatch";

xaravelTest(
  "XT-conformance-264",
  "a structural type stands for the FQCN its header names: a binding <Name> reached from another module, declared in …/packages/contracts/src/structural/<Name>.ts, exported under that name and registered by nothing, resolves to <FQCN> when the file's first line is // <FQCN>, or // <FQCN> followed by a space and <FQCN> is shaped as a class name; a registerClass or contract token of the same local wins; a header on another line, a non-FQCN header, a name mismatch, a path outside packages/contracts/src/structural or the file's own binding resolve to null; packages/contracts gains exactly the Console\\Kernel.queue and Bus\\QueueingDispatcher.batch thenable lines (ESC-10.3-2; AD-6)",
  () => {
    const dir = tempDir("xaravel-async-surface-structural-");
    const contracts = join(dir, "packages", "contracts", "src");
    write(dir, {
      "packages/contracts/src/Contract.ts": CONTRACT_STAND,
      "packages/contracts/src/structural/PendingDispatch.ts": String.raw`// Illuminate\Foundation\Bus\PendingDispatch, as a contract names it (AD-1.2): a subset of its public methods.
export interface PendingDispatch {
  onQueue(queue: string | null): this;
}
`,
      "packages/contracts/src/structural/StreamInterface.ts": String.raw`// Psr\Http\Message\StreamInterface (psr/http-message), as a contract names it (AD-1.2).
export interface StreamInterface {
  getSize(): number | null;
}
`,
      "packages/contracts/src/structural/Leading.ts": String.raw`// \Illuminate\Bus\PendingBatch, with a leading backslash.
export interface Leading {
  add(jobs: unknown): this;
}
`,
      // Not a class name: prose, the FQCN on line 2, no comment, no space after `//`, no terminator.
      "packages/contracts/src/structural/Prose.ts": "// PHP's built-in `Countable` interface.\nexport interface Prose {\n  count(): number;\n}\n",
      "packages/contracts/src/structural/Second.ts": "\n// Illuminate\\Bus\\PendingBatch, on line 2.\nexport interface Second {\n  add(jobs: unknown): this;\n}\n",
      "packages/contracts/src/structural/Bare.ts": "export interface Bare {\n  add(jobs: unknown): this;\n}\n",
      "packages/contracts/src/structural/Tight.ts": "//Illuminate\\Bus\\PendingBatch, without a space.\nexport interface Tight {\n  add(jobs: unknown): this;\n}\n",
      "packages/contracts/src/structural/Unterminated.ts": "// Illuminate\\Bus\\PendingBatch\nexport interface Unterminated {\n  add(jobs: unknown): this;\n}\n",
      // Name mismatch: the file's name is not the export's, or the export is another local under the file's name.
      "packages/contracts/src/structural/Foo.ts": "// Illuminate\\Bus\\PendingBatch, under another name.\nexport interface Bar {\n  add(jobs: unknown): this;\n}\n",
      "packages/contracts/src/structural/Aliased.ts": "// Illuminate\\Bus\\PendingBatch, as an alias.\ninterface Impl {\n  add(jobs: unknown): this;\n}\nexport type { Impl as Aliased };\n",
      // Outside `packages/contracts/src/structural`.
      "packages/contracts/src/console/Outside.ts": "// Illuminate\\Bus\\PendingBatch, outside structural.\nexport interface Outside {\n  add(jobs: unknown): this;\n}\n",
      "packages/other/src/structural/Elsewhere.ts": "// Illuminate\\Bus\\PendingBatch, in another package.\nexport interface Elsewhere {\n  add(jobs: unknown): this;\n}\n",
      // A registration and a contract token of the same local win over the header.
      "packages/contracts/src/structural/Registered.ts": String.raw`// Illuminate\Bus\PendingBatch, but registered.
export class Registered {}
registerClass("A\\B", Registered);
function registerClass(fqcn: string, value: object): void {
  void [fqcn, value];
}
`,
      "packages/contracts/src/structural/Token.ts": String.raw`// Illuminate\Bus\PendingBatch, but a token.
import { contract } from "../Contract";
export const Token = contract("X\\Token", {});
`,
      "packages/contracts/src/index.ts": 'export * from "./structural/PendingDispatch";\nexport { StreamInterface as Stream } from "./structural/StreamInterface";\n',
      "packages/contracts/src/console/Kernel.ts": 'import type { PendingDispatch } from "../structural/PendingDispatch";\nexport interface Kernel {\n  queue(command: string): PendingDispatch;\n}\n',
      "packages/other/src/Use.ts": 'import type { Elsewhere } from "./structural/Elsewhere";\nexport type Used = Elsewhere;\n',
    });
    const kernel = join(contracts, "console", "Kernel.ts");
    expect(registeredFqcn(kernel, "../structural/PendingDispatch", "PendingDispatch")).toBe(PENDING_DISPATCH);
    expect(registeredFqcn(kernel, null, "PendingDispatch")).toBe(PENDING_DISPATCH);
    expect(registeredFqcn(kernel, "../index", "PendingDispatch")).toBe(PENDING_DISPATCH);
    expect(registeredFqcn(kernel, "../index", "Stream")).toBe("Psr\\Http\\Message\\StreamInterface");
    expect(registeredFqcn(kernel, "../structural/StreamInterface", "StreamInterface")).toBe("Psr\\Http\\Message\\StreamInterface");
    expect(registeredFqcn(kernel, "../structural/Leading", "Leading")).toBe("Illuminate\\Bus\\PendingBatch");
    expect(isThenableFqcn(registeredFqcn(kernel, null, "PendingDispatch"), THENABLE_TYPES)).toBe(PENDING_DISPATCH);
    for (const name of ["Prose", "Second", "Bare", "Tight", "Unterminated", "Aliased"]) {
      expect(registeredFqcn(kernel, `../structural/${name}`, name)).toBeNull();
    }
    expect(registeredFqcn(kernel, "../structural/Foo", "Bar")).toBeNull();
    expect(registeredFqcn(kernel, "./Outside", "Outside")).toBeNull();
    expect(registeredFqcn(join(dir, "packages", "other", "src", "Use.ts"), "./structural/Elsewhere", "Elsewhere")).toBeNull();
    expect(registeredFqcn(join(dir, "packages", "other", "src", "Use.ts"), null, "Elsewhere")).toBeNull();
    expect(registeredFqcn(kernel, "../structural/Registered", "Registered")).toBe("A\\B");
    expect(registeredFqcn(kernel, "../structural/Token", "Token")).toBe("X\\Token");
    // The bare-specifier route real consumers use: the subpath barrels' type-only re-exports, through Bun.resolveSync
    // from a real repository file that resolves @xaravel/contracts.
    const consumer = join(root, "packages", "contracts", "tests", "xaravel", "web.test.ts");
    expect(registeredFqcn(consumer, "@xaravel/contracts/console", "PendingDispatch")).toBe(PENDING_DISPATCH);
    expect(registeredFqcn(consumer, "@xaravel/contracts/bus", "PendingBatch")).toBe("Illuminate\\Bus\\PendingBatch");
    // The file's own binding (its `this` and self-references) is not reached from another module, so it stays null.
    expect(registeredFqcn(join(contracts, "structural", "PendingDispatch.ts"), null, "PendingDispatch")).toBeNull();

    // The real `packages/contracts`: the CLI's check passes, and its thenable lines are exactly the Pipeline's three
    // and the two structural ones.
    const real = cli(root, ["--check", "contracts"]);
    expect(real.stderr).toBe("");
    expect(real.exitCode).toBe(0);
    const committed = readFileSync(join(root, "packages", "contracts", "async-surface.json"), "utf8").split("\n").map((text) => text.replace(/,$/, ""));
    expect(committed.filter((text) => text.includes('"thenable"')).sort()).toEqual(
      [
        JSON.stringify({ method: "Kernel.queue", file: "src/console/Kernel.ts", thenable: PENDING_DISPATCH }),
        JSON.stringify({ method: "QueueingDispatcher.batch", file: "src/bus/QueueingDispatcher.ts", thenable: "Illuminate\\Bus\\PendingBatch" }),
        ...["send", "through", "via"].map((method) => JSON.stringify({ method: `Pipeline.${method}`, file: "src/pipeline/Pipeline.ts", thenable: PIPELINE })),
      ].sort(),
    );
  },
);
