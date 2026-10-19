// Xaravel Tests for Story 6.4 (the async-surface generator and drift check:
// `tools/async-surface/async-surface.ts`, `bun run async-surface`, and the
// `ci.yml#check` step that runs it with `--all --check`; AD-6, AD-28).
//
// The CLI runs for real, with the repository's own tsc, over copies of the
// committed fixture package in `tools/async-surface/fixtures/` placed in temp
// roots (`--root`), so nothing tracked is written. The I/O matrix's edge cases
// also run through the pure `surfaceOf` over inline `.d.ts` texts.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { diff, render, shortNames, surfaceOf, thenableTypes } from "../../../tools/async-surface/async-surface";
import { THENABLE_TYPES } from "../../../tools/lint-rules/thenables";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const TOOL = join(root, "tools", "async-surface", "async-surface.ts");
const FIXTURES = join(root, "tools", "async-surface", "fixtures");
const FALLBACK = shortNames(THENABLE_TYPES);
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
  String.raw`{"method":"Repository.where","file":"src/Repository.ts","root":"callback"},`,
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
  "bun run async-surface <pkg> emits the package's .d.ts with tsc -b, walks it with oxc-parser and writes async-surface.json with one line per Promise- or thenable-returning public method and its @asyncRoot root, using @xaravel/contracts/async's THENABLE_TYPES when it resolves and the tool's list otherwise (AD-6)",
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
    expect(readFileSync(SURFACE(withContracts), "utf8")).toBe(`[\n${String.raw`{"method":"Repository.lazy","file":"src/Repository.ts","root":"callback"}`}\n]\n`);

    // The same source under the fallback list: `where()` (a Builder) is untagged and `lazy()`'s tag is stray.
    const fallback = demoRoot(contractsSources);
    expect(await thenableTypes(fallback)).toBe(THENABLE_TYPES);
    const failed = cli(fallback, ["demo"]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("packages/demo/src/Repository.ts: Repository.where returns a Promise or thenable but has no @asyncRoot tag");
    expect(failed.stderr).toContain("packages/demo/src/Repository.ts: Repository.lazy has an @asyncRoot tag but returns neither a Promise nor a thenable");
    expect(existsSync(SURFACE(fallback))).toBe(false);

    // A contracts module whose THENABLE_TYPES is empty or not a string[] is not used.
    for (const source of ["export const THENABLE_TYPES: readonly string[] = [];\n", "export const THENABLE_TYPES = [1, 2];\n", "export const OTHER = 1;\n"]) {
      const bad = tempDir("xaravel-async-surface-contracts-");
      installContracts(bad, source);
      expect(await thenableTypes(bad)).toBe(THENABLE_TYPES);
    }

    // The tool's list is the Story 6.3 fixture list, by short name.
    expect(FALLBACK.has("Builder")).toBe(true);
    expect(FALLBACK.has("PendingRequest")).toBe(true);

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

    // The I/O matrix's edge cases through the pure walk.
    matrixEdgeCases();
  },
);

// XT-conformance-135

/** Each failing fixture and the method its error names. */
const FAILING: readonly { readonly fixture: string; readonly method: string; readonly says: string }[] = [
  { fixture: "untagged.ts", method: "Repository.put", says: "returns a Promise or thenable but has no @asyncRoot tag" },
  { fixture: "malformed.ts", method: "Repository.forget", says: "has a malformed @asyncRoot tag" },
  { fixture: "conflicting.ts", method: "Repository.pull", says: "has conflicting @asyncRoot tags across its overloads" },
  { fixture: "stray.ts", method: "Repository.getPrefix", says: "has an @asyncRoot tag but returns neither a Promise nor a thenable" },
];

xaravelTest(
  "XT-conformance-135",
  "a Promise-returning public method with no @asyncRoot tag, a malformed tag, conflicting overload tags or a tag on a non-async method makes bun run async-surface exit 1 naming the file, the method and AD-6, and write nothing (AD-6)",
  () => {
    for (const { fixture, method, says } of FAILING) {
      const dir = demoRoot({ "Repository.ts": join(FIXTURES, "failing", fixture) });
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

// The I/O matrix's edge cases, through the pure walk (run by XT-conformance-134).

const surface = (text: string, thenables: ReadonlySet<string> = FALLBACK): ReturnType<typeof surfaceOf> => surfaceOf([{ file: "src/Repository.ts", text }], thenables);

/** The I/O matrix shapes and the walk's edge cases, over inline `.d.ts` texts (part of XT-conformance-134). */
function matrixEdgeCases(): void {
  // tagged / thenable / sync / private / protected / #private.
  const base = surface(String.raw`export declare class Repository {
  #private;
  private x;
  /** @asyncRoot Cache\Store.get */
  get(): Promise<string>;
  /** @asyncRoot callback */
  where(): Builder;
  getPrefix(): string;
  protected p(): Promise<void>;
  private q;
  constructor();
  set value(v: Promise<void>);
}
`);
  expect(base.errors).toEqual([]);
  expect(render(base.entries)).toBe(`[\n${String.raw`{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"}`},\n${String.raw`{"method":"Repository.where","file":"src/Repository.ts","root":"callback"}`}\n]\n`);

  // Untagged: named, with AD-6.
  const untagged = surface("export declare class Repository {\n    put(): Promise<void>;\n}\n");
  expect(untagged.entries).toEqual([]);
  expect(untagged.errors).toHaveLength(1);
  expect(untagged.errors[0]!.method).toBe("Repository.put");
  expect(untagged.errors[0]!.message).toEndWith("(AD-6)");

  // Return types through parentheses, unions and intersections; qualified names; PromiseLike.
  for (const type of ["(Promise<void>)", "Promise<void> | null", "Promise<void> & { x: 1 }", "ns.Promise<void>", "PromiseLike<void>", "Eloquent.Builder"]) {
    expect(surface(`export declare function f(): ${type};\n`).errors.map((e) => e.method)).toEqual(["f"]);
  }
  // Not async: a Promise nested in a type argument, an array or a callback parameter.
  for (const type of ["Array<Promise<void>>", "Promise<void>[]", "Map<string, Builder>"]) {
    expect(surface(`export declare function f(cb: () => Promise<void>): ${type};\n`)).toEqual({ entries: [], errors: [] });
  }

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

  // tsc's inferred cross-module return type `import("./Builder").Builder` is a reference by its qualifier's last segment.
  expect(surface('export declare function f(): import("./Builder").Builder;\nexport declare function g(): import("./x").ns.Promise<void>;\n').errors.map((e) => e.method)).toEqual(["f", "g"]);
  // Only `readonly` is unwrapped: `keyof Promise<T>` is not async.
  expect(surface("export declare function f(): keyof Promise<void>;\nexport declare function g(): unique symbol;\n")).toEqual({ entries: [], errors: [] });
  // A nullable callback field or const (AD-9's shape) is listed through its function member.
  const nullable = surface("export declare class R {\n    /** @asyncRoot callback */\n    run: (() => Promise<void>) | null;\n    sync: (() => void) | null;\n}\nexport declare const c: ((() => Builder)) | null;\n");
  expect(nullable.entries.map((e) => e.method)).toEqual(["R.run"]);
  expect(nullable.errors.map((e) => e.method)).toEqual(["c"]);
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
  const contracts = shortNames(["X\\Lazy"]);
  expect(surface("/** @asyncRoot callback */\nexport declare function a(): Lazy;\nexport declare function b(): Builder;\n", contracts)).toEqual({ entries: [{ method: "a", file: "src/Repository.ts", root: "callback" }], errors: [] });

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
