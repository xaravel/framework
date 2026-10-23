// Xaravel Tests for Story 6.3 (the `xaravel` oxlint plugin's async-signature,
// frame-state and declaration rules: `tools/lint-rules/plugin.ts`,
// `tools/lint-rules/thenables.ts`, `.oxlintrc.json`, `SPINE_RULES` in
// `tools/lint-rules/disables.ts`, and the `bootOnly` writers of
// `tools/lint-rules/singletons.json`; AD-4, AD-5, AD-6, AD-7, AD-25, AD-16.4).
//
// oxlint runs for real, from the repository root with the repository's own
// `.oxlintrc.json` and `--format unix`, over copies of the committed fixtures
// in `tools/lint-rules/fixtures/signatures-state/` placed inside temp roots,
// and over inline edge-case sources written there. The singleton rules read
// the committed `singletons.json`, or a temp root's own
// `tools/lint-rules/singletons.json`. The real repository is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkConfig, findDisables, scanSource, SPINE_RULES } from "../../../tools/lint-rules/disables";
import plugin, { RULE_NAMES, singletonsPath } from "../../../tools/lint-rules/plugin";
import { THENABLE_TYPES } from "../../../tools/lint-rules/thenables";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const FIXTURES = join(root, "tools", "lint-rules", "fixtures", "signatures-state");
const SINGLETONS = join(root, "tools", "lint-rules", "singletons.json");
const CONFIG = ".oxlintrc.json";
const REAL = existsSync(join(root, "conformance", "upstream", "framework", "src"));
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Story 6.3's seven rules, each with the AD its message names. */
const RULES: readonly (readonly [string, string])[] = [
  ["no-maybe-promise-return", "AD-6"],
  ["no-async-thenable-return", "AD-6"],
  ["no-singleton-field-write", "AD-5"],
  ["no-boot-only-write", "AD-5"],
  ["no-arrow-test-body", "AD-25"],
  ["no-inject-param-mismatch", "AD-4"],
  ["no-dynamic-column-default", "AD-7"],
];

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

/** Copies fixture `name` to `<dir>/<target>`, with `support.ts` beside it. */
function place(dir: string, name: string, target: string): void {
  mkdirSync(dirname(join(dir, target)), { recursive: true });
  cpSync(join(FIXTURES, name), join(dir, target));
  cpSync(join(FIXTURES, "support.ts"), join(dirname(join(dir, target)), "support.ts"));
}

interface LintRun {
  readonly exitCode: number;
  /** `[file, "<plugin>(<rule>)"]` per diagnostic. */
  readonly diagnostics: readonly (readonly [string, string])[];
  readonly output: string;
}

/** `bun --bun oxlint --type-aware -c <config> --format unix <paths>` from the repository root. */
function oxlint(paths: readonly string[]): LintRun {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", CONFIG, "--format", "unix", ...paths], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const diagnostics: [string, string][] = [];
  for (const line of output.split("\n")) {
    const match = /^(.+?):\d+:\d+: .*\[(?:Error|Warning)\/([\w-]+\([\w-]+\))\]$/.exec(line);
    if (match !== null) {
      diagnostics.push([match[1]!, match[2]!]);
    }
  }
  return { exitCode: proc.exitCode ?? -1, diagnostics, output };
}

/** The diagnostics per file under `dir` (relative path → sorted `plugin(rule)` list). */
function byFile(run: LintRun, dir: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [file, rule] of run.diagnostics) {
    const key = file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : file;
    (out[key] ??= []).push(rule);
  }
  for (const list of Object.values(out)) {
    list.sort();
  }
  return out;
}

const x = (rule: string, count = 1): string[] => Array.from({ length: count }, () => `xaravel(${rule})`);

/** Each failing fixture, its rule, and the placements (relative to a temp root) where it must fail. */
const FAILING: readonly { readonly fixture: string; readonly rule: string; readonly placements: readonly string[] }[] = [
  { fixture: "maybe-promise.ts", rule: "no-maybe-promise-return", placements: ["packages/demo/src/MaybePromise.ts", "skeleton/app/MaybePromise.ts"] },
  { fixture: "async-thenable.ts", rule: "no-async-thenable-return", placements: ["packages/demo/src/AsyncThenable.ts", "packages/demo/tests/AsyncThenable.ts"] },
  { fixture: "singleton-write.ts", rule: "no-singleton-field-write", placements: ["packages/routing/src/Router.ts", "packages/demo/src/Sub/Router.ts"] },
  { fixture: "boot-only-write.ts", rule: "no-boot-only-write", placements: ["packages/routing/src/BootOnly/Router.ts", "skeleton/app/Router.ts"] },
  { fixture: "arrow-test-body.ts", rule: "no-arrow-test-body", placements: ["skeleton/tests/Feature/ArrowTest.ts", "packages/demo/tests/ArrowTest.ts"] },
  { fixture: "inject-mismatch.ts", rule: "no-inject-param-mismatch", placements: ["packages/demo/src/InjectMismatch.ts", "skeleton/app/InjectMismatch.ts"] },
  { fixture: "dynamic-column-default.ts", rule: "no-dynamic-column-default", placements: ["skeleton/app/Models/Post.ts", "packages/database/src/Eloquent/Post.ts"] },
];

/** Each passing fixture and the placements where it must lint clean. */
const PASSING: readonly { readonly fixture: string; readonly placements: readonly string[] }[] = [
  { fixture: "passing.ts", placements: ["packages/demo/src/Passing.ts", "packages/routing/src/Passing/Router.ts", "skeleton/app/Passing.ts", "packages/demo/tests/Passing.ts"] },
  { fixture: "passing-tests.ts", placements: ["skeleton/tests/Feature/PassingTest.ts", "packages/demo/tests/PassingTest.ts"] },
  { fixture: "passing-uses.ts", placements: ["skeleton/tests/Feature/PassingUses.ts", "packages/demo/tests/PassingUses.ts"] },
];

// XT-conformance-133

xaravelTest(
  "XT-conformance-133",
  "the committed fixture for each Story 6.3 xaravel rule fails naming exactly its rule and each passing fixture passes, under bun --bun oxlint --type-aware -c .oxlintrc.json; the root config holds all seven as errors and lint:disables rejects disabling them; a write to a boot-only property outside its singletons.json writers fails no-boot-only-write (AD-4, AD-5, AD-6, AD-7, AD-25, AD-16.4)",
  () => {
    // The config and the plugin: seven more rules, errors at the top level, spine rules, after Story 6.2's six.
    const config = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as { jsPlugins: unknown; rules: Record<string, unknown>; overrides?: unknown };
    expect(config.jsPlugins).toEqual(["./tools/lint-rules/plugin.ts"]);
    expect(RULE_NAMES.slice(6)).toEqual(RULES.map(([name]) => name));
    expect(RULE_NAMES).toHaveLength(13);
    expect(Object.keys(plugin.rules)).toEqual([...RULE_NAMES]);
    expect(SPINE_RULES.slice(-7)).toEqual(RULES.map(([name]) => name));
    for (const [name] of RULES) {
      expect(config.rules[`xaravel/${name}`]).toBe("error");
    }
    // The one override is return-await for packages (Retro 6 item 11); none touches the xaravel rules.
    expect(config.overrides).toEqual([{ files: ["packages/**"], rules: { "typescript/return-await": ["error", "always"] } }]);
    expect(checkConfig(root, CONFIG)).toEqual([]);

    // The thenable list (Story 6.4's fixture list) and the committed boot-only writers the fixtures rely on.
    expect(THENABLE_TYPES).toContain("Illuminate\\Database\\Eloquent\\Builder");
    expect(THENABLE_TYPES).toContain("Illuminate\\Http\\Client\\PendingRequest");
    expect([...new Set(THENABLE_TYPES.map((fqcn) => fqcn.slice(fqcn.lastIndexOf("\\") + 1)))].sort()).toEqual(
      [
        "BelongsTo", "BelongsToMany", "Builder", "HasMany", "HasManyThrough", "HasOne", "HasOneOrMany", "HasOneOrManyThrough", "HasOneThrough", "MorphMany", "MorphOne", "MorphOneOrMany", "MorphTo", "MorphToMany",
        "PendingBatch", "PendingBroadcast", "PendingChain", "PendingClosureDispatch", "PendingCommand", "PendingDispatch", "PendingRequest", "PendingTestResponse", "Pipeline", "Relation",
      ].sort(),
    );
    const singletons = JSON.parse(readFileSync(SINGLETONS, "utf8")) as { classes: string[]; bootOnly: { property: string; writers: string[] }[] };
    expect(singletons.classes).toContain("Illuminate\\Routing\\Router");
    expect(singletons.bootOnly).toContainEqual({ property: "Illuminate\\Routing\\Router::$groupStack", writers: ["group", "updategroupstack"] });
    expect(singletonsPath(join(root, "packages/routing/src/Router.ts"), root)).toBe(SINGLETONS);

    // Each failing fixture fails naming exactly its rule at every placement; each passing placement is clean.
    const dir = tempDir("xaravel-lint-133-");
    for (const { fixture, placements } of [...PASSING, ...FAILING]) {
      for (const placement of placements) {
        place(dir, fixture, placement);
      }
    }
    const run = oxlint([dir]);
    expect(run.exitCode).toBe(1);
    const expected: Record<string, string[]> = {};
    for (const { rule, placements } of FAILING) {
      for (const placement of placements) {
        expected[placement] = x(rule);
      }
    }
    expect(byFile(run, dir)).toEqual(expected);

    // Each failing fixture alone exits 1 naming exactly its rule; the passing placements alone exit 0.
    for (const { fixture, rule, placements } of FAILING) {
      const single = tempDir("xaravel-lint-133-single-");
      place(single, fixture, placements[0]!);
      const singleRun = oxlint([join(single, placements[0]!)]);
      expect(singleRun.exitCode).toBe(1);
      expect([...new Set(singleRun.diagnostics.map(([, name]) => name))]).toEqual([`xaravel(${rule})`]);
    }
    const clean = tempDir("xaravel-lint-133-clean-");
    for (const { fixture, placements } of PASSING) {
      for (const placement of placements) {
        place(clean, fixture, placement);
      }
    }
    const cleanRun = oxlint([clean]);
    expect(cleanRun.diagnostics).toEqual([]);
    expect(cleanRun.exitCode).toBe(0);

    // Each message names its AD.
    for (const [rule, ad] of RULES) {
      const line = run.output.split("\n").find((text) => text.endsWith(`[Error/xaravel(${rule})]`));
      expect(line).toContain(`(${ad})`);
    }

    edgeCases();
    tempSingletons();
    scanCheck();
    disableCases();
  },
  180_000,
);

/** The spellings each rule covers and the near-misses it leaves alone (the I/O matrix included), one file each, with the exact diagnostics. */
function edgeCases(): void {
  const support = readFileSync(join(FIXTURES, "support.ts"), "utf8");
  const MAYBE = "no-maybe-promise-return";
  const THEN = "no-async-thenable-return";
  const SINGLE = "no-singleton-field-write";
  const BOOT = "no-boot-only-write";
  const ARROW = "no-arrow-test-body";
  const INJECT = "no-inject-param-mismatch";
  const COLUMN = "no-dynamic-column-default";
  const router = (body: string, fqcn = "Illuminate\\\\Routing\\\\Router", name = "Router"): string =>
    `import { registerClass } from "../support";\n\nexport class ${name} {\n  current: string | null = null;\n  count = 0;\n  cache: Record<string, string> = {};\n  groupStack: string[][] = [];\n\n${body}\n}\n\nregisterClass("${fqcn}", ${name});\n`;
  const injectHeader = "export declare function inject(...args: readonly unknown[]): (...args: readonly unknown[]) => void;\nexport declare const A: unknown;\nexport declare const B: unknown;\n\n";
  const model = (base: string, fields: string): string =>
    `export declare class Model {}\nexport declare class Pivot {}\nexport declare class Authenticatable {}\nexport declare const Eloquent: { readonly Model: typeof Model };\nexport declare function mixin(...bases: readonly unknown[]): typeof Model;\nexport declare function now(): number;\nexport declare const list: number[];\n\nexport class Row extends ${base} {\n${fields}\n}\n`;
  const testHeader = (names: string): string => `import { ${names} } from "bun:test";\n\nexport declare function uses(...cases: readonly unknown[]): void;\n\n`;
  const cases: Readonly<Record<string, readonly [string, readonly string[]]>> = {
    // no-maybe-promise-return: an interface and a type-literal method signature, PromiseLike, an exported function,
    // an abstract method, a getter, a nested union; overloads, callback parameters, non-public members, a module-local
    // function and a plain Promise pass.
    "packages/demo/src/maybe/Interface.ts": ["export interface Repo {\n  find(): string | Promise<string>;\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/TypeLiteral.ts": ["export type Repo = {\n  find(): string | PromiseLike<string>;\n};\n", x(MAYBE)],
    "packages/demo/src/maybe/Exported.ts": ["export function load(): number | Promise<number> {\n  return 1;\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/Abstract.ts": ["export abstract class Loader {\n  abstract load(): number | Promise<number>;\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/Getter.ts": ["export class Box {\n  get value(): number | Promise<number> {\n    return 1;\n  }\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/Nested.ts": ["export function load(): (number | Promise<number>) | null {\n  return null;\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/Overloads.ts": [
      "export function pick(): number;\nexport function pick(key: string): string;\nexport function pick(key?: string): number | string | Promise<number> {\n  return key ?? 1;\n}\n",
      [],
    ],
    "packages/demo/src/maybe/Callback.ts": [
      "export class Runner {\n  run(callback: () => number | Promise<number>): void {\n    this.last = callback;\n  }\n\n  last: (() => number | Promise<number>) | null = null;\n}\n\nexport interface Hooks {\n  on(callback: { call(): number | Promise<number> }): void;\n}\n",
      [],
    ],
    "packages/demo/src/maybe/NonPublic.ts": [
      "export class Inner {\n  run(): number {\n    return this.a() === 1 && this.b() === 1 ? 1 : 0;\n  }\n\n  private a(): number | Promise<number> {\n    return 1;\n  }\n\n  protected b(): number | Promise<number> {\n    return 1;\n  }\n}\n\nfunction local(): number | Promise<number> {\n  return 1;\n}\n\nexport const alias = local;\n",
      [],
    ],
    "packages/demo/src/maybe/Plain.ts": ["export class Plain {\n  get(): Promise<number> {\n    return Promise.resolve(1);\n  }\n}\n", []],
    // Bodyless signatures: an exported overload signature, a `declare function`, a class method overload signature.
    "packages/demo/src/maybe/OverloadSignature.ts": ["export function pick(): number | Promise<number>;\nexport function pick(key?: string): number | Promise<number> {\n  return key === undefined ? 1 : Promise.resolve(2);\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/Declare.ts": ["export declare function f(): number | Promise<number>;\n", x(MAYBE)],
    "packages/demo/src/maybe/MethodSignature.ts": ["export class Box {\n  get(): number | Promise<number>;\n  get(key?: string): number | Promise<number> {\n    return key === undefined ? 1 : 2;\n  }\n}\n", x(MAYBE)],
    // Other public spellings: a function-valued class field, an exported `const` function, a function-typed property
    // signature, a function exported later by `export { f }`; a private field and a callback property pass.
    "packages/demo/src/maybe/Field.ts": [
      "export class Box {\n  get = (): number | Promise<number> => 1;\n  load = function (): number | Promise<number> {\n    return 1;\n  };\n  private hidden = (): number | Promise<number> => 1;\n\n  run(): number | Promise<number> | null {\n    return this.hidden === null ? null : 1;\n  }\n}\n",
      x(MAYBE, 3),
    ],
    "packages/demo/src/maybe/ConstFn.ts": ["export const load = (): number | Promise<number> => 1;\nexport const plain = (): number => 1;\n", x(MAYBE)],
    "packages/demo/src/maybe/PropertySignature.ts": ["export interface Repo {\n  find: () => string | Promise<string>;\n  on(callback: { call: () => string | Promise<string> }): void;\n}\n", x(MAYBE)],
    "packages/demo/src/maybe/ExportLater.ts": ["function load(): number | Promise<number> {\n  return 1;\n}\n\nconst read = (): number | Promise<number> => 1;\n\nexport { load, read as reader };\n", x(MAYBE, 2)],
    // no-async-thenable-return: an arrow body, `as`, a `const` annotated and a `let` initialised, a declared
    // Promise<thenable>, a qualified name, a same-file class with `then` or `implements Thenable`; an awaited thenable,
    // a non-async function and a nested function pass. A thenable is matched by the FQCN its import (renamed,
    // `import type`, a namespace, an `export {} from` or `export *` chain) or its same-file registration resolves to,
    // never by short name: a local unregistered `PendingRequest` or `Builder`, or a `Builder` registered as the Schema
    // Builder, passes (Retro 6 item 12).
    "packages/demo/src/then/Arrow.ts": ['import { Builder } from "../support";\n\nexport const find = async (): Promise<unknown> => new Builder();\n', x(THEN)],
    "packages/demo/src/then/As.ts": ["export async function find(value: unknown): Promise<unknown> {\n  return value as PendingRequest;\n}\n\ninterface PendingRequest {\n  readonly url: string;\n}\n", []],
    "packages/demo/src/then/AsResolved.ts": ['import type { Builder as QB } from "../support";\n\nexport async function find(value: unknown): Promise<unknown> {\n  return value as QB;\n}\n', x(THEN)],
    "packages/demo/src/then/reexport.ts": ['export { Builder as QB } from "../support";\n', []],
    "packages/demo/src/then/barrel.ts": ['export * from "./reexport.js";\n', []],
    "packages/demo/src/then/Reexported.ts": ['import { QB } from "./reexport";\n\nexport async function find(): Promise<unknown> {\n  return new QB();\n}\n', x(THEN)],
    "packages/demo/src/then/Star.ts": ['import * as all from "./barrel";\n\nexport const find = async (): Promise<unknown> => new all.QB();\n', x(THEN)],
    "packages/demo/src/then/schema.ts": ['import { registerClass } from "../support";\n\nexport class Builder {\n  readonly table = "t";\n}\n\nregisterClass("Illuminate\\\\Database\\\\Schema\\\\Builder", Builder);\n', []],
    "packages/demo/src/then/OtherFqcn.ts": ['import { Builder } from "./schema";\n\nexport async function find(): Promise<Builder> {\n  return new Builder();\n}\n', []],
    "packages/demo/src/then/LocalBuilder.ts": ["class Builder {\n  readonly table = \"t\";\n}\n\nexport async function find(): Promise<Builder> {\n  return new Builder();\n}\n", []],
    "packages/demo/src/then/SameFile.ts": ['import { registerClass } from "../support";\n\nexport class Pending {\n  readonly url = "u";\n}\n\nexport async function find(): Promise<unknown> {\n  return new Pending();\n}\n\nregisterClass("\\\\illuminate\\\\http\\\\client\\\\pendingrequest", Pending);\n', x(THEN)],
    "packages/demo/src/then/Const.ts": ['import { Builder } from "../support";\n\nexport async function find(): Promise<unknown> {\n  const query: Builder = new Builder();\n  return query;\n}\n', x(THEN)],
    "packages/demo/src/then/Let.ts": ["class Lazy {\n  then(): void {}\n}\n\nexport async function find(): Promise<unknown> {\n  let lazy = new Lazy();\n  lazy = new Lazy();\n  return lazy;\n}\n", x(THEN)],
    "packages/demo/src/then/Declared.ts": ['import type { Builder } from "../support";\n\nexport async function find(): Promise<Builder | null> {\n  return null;\n}\n', x(THEN)],
    "packages/demo/src/then/Qualified.ts": ['import * as db from "../support";\n\nexport async function find(): Promise<db.Builder> {\n  return await new db.Builder().get().then(() => new db.Builder());\n}\n', x(THEN)],
    "packages/demo/src/then/Implements.ts": ["interface Thenable {\n  readonly id: number;\n}\n\nclass Deferred implements Thenable {\n  readonly id = 1;\n}\n\nexport class Jobs {\n  async next(): Promise<unknown> {\n    return new Deferred();\n  }\n}\n", x(THEN)],
    // A contract token (ESC-10.2-2): `Pipeline`, declared by `contract("<FQCN>", …)` with `contract` imported by name,
    // resolves to the listed `Illuminate\Contracts\Pipeline\Pipeline`.
    "packages/demo/src/then/Contract.ts": [
      "export interface Token<T, B> {\n  readonly id: string;\n  readonly shape: object;\n  readonly t: T | null;\n  readonly b: B | null;\n}\n\nexport function contract<T, B>(id: string, shape: object): Token<T, B> {\n  return { id, shape, t: null, b: null };\n}\n",
      [],
    ],
    "packages/demo/src/then/pipeline.ts": [
      'import { contract } from "./Contract";\n\ndeclare const PipelineBrand: unique symbol;\n\nexport interface Pipeline {\n  send(passable: unknown): this;\n  then(destination: () => unknown): Promise<unknown>;\n}\n\nexport const Pipeline = contract<Pipeline, typeof PipelineBrand>("Illuminate\\\\Contracts\\\\Pipeline\\\\Pipeline", { send: ["passable"] });\n',
      [],
    ],
    "packages/demo/src/then/PipelineReturn.ts": ['import type { Pipeline } from "./pipeline";\n\nexport async function find(): Promise<Pipeline | null> {\n  return null;\n}\n', x(THEN)],
    "packages/demo/src/then/Awaited.ts": [
      'import { Builder } from "../support";\n\nexport class Repository {\n  async find(): Promise<readonly string[]> {\n    return await new Builder().get();\n  }\n\n  query(): Builder {\n    return new Builder();\n  }\n\n  async count(): Promise<number> {\n    const make = (): Builder => new Builder();\n    return make.length;\n  }\n}\n',
      [],
    ],
    // no-singleton-field-write: compound, update, `delete this.<field>`, destructuring, #private, a write in an arrow
    // nested in the constructor, `<obj>.registerClass`; element writes and mutating calls (`delete this.cache[k]`) are
    // outside it (it covers direct `this.<field>` writes only), and a nested non-singleton class, a nested non-arrow
    // function (its own `this`), a static block, an unregistered class and a class registered under a non-singleton
    // FQCN pass.
    "packages/routing/src/single/Writes.ts": [
      router("  dispatch(request: string): void {\n    this.count += 1;\n    this.count++;\n    delete this.cache[request];\n    delete this.cache;\n    [this.current] = [request];\n  }"),
      x(SINGLE, 4),
    ],
    "packages/routing/src/single/OwnThis.ts": [
      router("  dispatch(): object {\n    const handler = { reset(): void {\n      this.count = 0;\n    }, count: 1 };\n    function set(this: { count: number }): void {\n      this.count = 2;\n    }\n    const bound = function (this: { count: number }): void {\n      this.count = 3;\n    };\n    return [handler, set, bound];\n  }\n\n  static shared = 0;\n\n  static {\n    this.shared = 1;\n  }"),
      [],
    ],
    "packages/routing/src/single/Private.ts": [router("  #state = 0;\n\n  dispatch(): number {\n    this.#state = 1;\n    return this.#state;\n  }"), x(SINGLE)],
    "packages/routing/src/single/Nested.ts": [router("  constructor() {\n    this.current = null;\n    queueMicrotask(() => {\n      this.current = \"late\";\n    });\n  }"), x(SINGLE)],
    "packages/routing/src/single/Member.ts": [
      'const runtime = { registerClass(fqcn: string, value: object): string {\n  return `${fqcn}${typeof value}`;\n} };\n\nexport class Router {\n  current: string | null = null;\n\n  dispatch(request: string): void {\n    this.current = request;\n  }\n}\n\nruntime.registerClass("Illuminate\\\\Routing\\\\Router", Router);\n',
      x(SINGLE),
    ],
    "packages/routing/src/single/InnerClass.ts": [router("  make(): object {\n    return new (class {\n      value = 0;\n\n      set(): void {\n        this.value = 1;\n      }\n    })();\n  }"), []],
    "packages/routing/src/single/Unregistered.ts": ["export class Router {\n  current: string | null = null;\n\n  dispatch(request: string): void {\n    this.current = request;\n  }\n}\n", []],
    "packages/routing/src/single/OtherFqcn.ts": [router("  dispatch(request: string): void {\n    this.current = request;\n    this.groupStack.push([request]);\n  }", "App\\\\Router"), []],
    // no-boot-only-write (the I/O matrix's boot-only rows): assignment, element and member writes, a mutating call
    // outside the writers and inside an arrow nested in a writer; group() (any case), updateGroupStack() and the
    // constructor pass.
    "packages/routing/src/boot/Runtime.ts": [
      router("  dispatch(request: string): void {\n    this.groupStack = [];\n    this.groupStack[0] = [request];\n    this.groupStack.length = 0;\n    this.groupStack.push([request]);\n    this.groupStack.splice(0, 1);\n  }"),
      x(BOOT, 5),
    ],
    "packages/routing/src/boot/NestedInWriter.ts": [router("  group(attributes: string[]): void {\n    queueMicrotask(() => {\n      this.groupStack.push(attributes);\n    });\n  }"), x(BOOT)],
    "packages/routing/src/boot/Writers.ts": [
      router("  constructor() {\n    this.groupStack.push([]);\n  }\n\n  group(attributes: string[]): void {\n    this.groupStack.push(attributes);\n  }\n\n  GROUP(): void {\n    this.groupStack.pop();\n  }\n\n  updateGroupStack(attributes: string[]): void {\n    this.groupStack[this.groupStack.length] = attributes;\n  }"),
      [],
    ],
    // no-arrow-test-body: `.only`, `.skip`, `.todo`, `.each(…)(…)`, `it`, the hooks, async arrows; `describe`, a
    // `function` body, and a file whose `uses` is not a bare call pass.
    "skeleton/tests/Feature/Forms.ts": [
      `${testHeader("afterAll, beforeEach, describe, it, test")}uses(Object);\n\ntest.only("a", () => {});\nit.skip("b", async () => {});\ntest.todo("c", () => {});\ntest.each([1])("d", (n) => {\n  void n;\n});\nbeforeEach(() => {});\nafterAll(async () => {});\ndescribe("e", () => {\n  test("f", function () {});\n});\n`,
      x(ARROW, 6),
    ],
    "skeleton/tests/Feature/Matrix.ts": [`${testHeader("test")}uses(Object);\n\ntest("x", async () => {});\n`, x(ARROW)],
    "skeleton/tests/Feature/Curried.ts": [
      `${testHeader("it, test")}uses(Object);\n\ntest.failing("a", () => {});\ntest.concurrent("b", async () => {});\nit.failing("c", () => {});\ntest.if(true)("d", () => {});\ntest.skipIf(false)("e", () => {});\ntest.todoIf(false)("f", () => {});\n`,
      x(ARROW, 6),
    ],
    "skeleton/tests/Feature/NoUses.ts": [`${testHeader("test")}test("x", () => {});\n`, []],
    "skeleton/tests/Feature/MemberUses.ts": [`${testHeader("test")}export const pest = { uses };\npest.uses(Object);\n\ntest("x", () => {});\n`, []],
    // no-inject-param-mismatch (the matrix's key order): a method decorator, `inject(map, fn)`, missing and extra
    // keys, a destructured parameter, a spread or computed key, a class with no constructor; a matching map, a
    // subclass without its own constructor, a TS `this` parameter, rest and defaulted parameters, a static computed
    // key pass.
    "packages/demo/src/inject/Order.ts": [`${injectHeader}@inject({ b: B, a: A })\nexport class Service {\n  constructor(a: unknown, b: unknown) {\n    void [a, b];\n  }\n}\n`, x(INJECT)],
    "packages/demo/src/inject/Method.ts": [`${injectHeader}export class Handler {\n  @inject({ b: B })\n  handle(a: unknown): unknown {\n    return a;\n  }\n}\n`, x(INJECT)],
    "packages/demo/src/inject/Call.ts": [`${injectHeader}export const run = inject({ a: A, b: B }, (b: unknown, a: unknown) => [a, b]);\nexport const ok = inject({ a: A, b: B }, function (this: unknown, a: unknown, b: unknown) {\n  return [a, b];\n});\n`, x(INJECT)],
    "packages/demo/src/inject/Missing.ts": [`${injectHeader}export const run = inject({ a: A }, (a: unknown, b: unknown) => [a, b]);\nexport const extra = inject({ a: A, b: B }, (a: unknown) => a);\n`, x(INJECT, 2)],
    "packages/demo/src/inject/Destructured.ts": [`${injectHeader}export const run = inject({ a: A }, ({ a }: { a: unknown }) => a);\n`, x(INJECT)],
    "packages/demo/src/inject/Spread.ts": [`${injectHeader}declare const map: Record<string, unknown>;\ndeclare const key: string;\nexport const run = inject({ ...map }, (a: unknown) => a);\nexport const computed = inject({ [key]: A }, (a: unknown) => a);\n`, x(INJECT, 2)],
    "packages/demo/src/inject/NoConstructor.ts": [`${injectHeader}@inject({ a: A })\nexport class Plain {}\n`, x(INJECT)],
    "packages/demo/src/inject/NotLiteral.ts": [`${injectHeader}export declare const DEPS: Record<string, unknown>;\n\n@inject(DEPS)\nexport class Service {\n  constructor(readonly a: unknown) {}\n}\n\nexport const run = inject(DEPS, (a: unknown) => a);\n`, x(INJECT, 2)],
    "packages/demo/src/inject/Passing.ts": [
      `${injectHeader}declare class Base {}\n\n@inject({ a: A, b: B })\nexport class Service {\n  constructor(\n    readonly a: unknown,\n    readonly b: unknown = null,\n  ) {}\n}\n\n@inject({ a: A })\nexport class Child extends Base {}\n\n@inject({})\nexport class Empty {}\n\nexport const rest = inject({ a: A, rest: B }, (a: unknown, ...rest: unknown[]) => [a, rest]);\nexport const keyed = inject({ ["a"]: A }, (a: unknown) => a);\n`,
      [],
    ],
    // no-dynamic-column-default (the matrix's column row): `Pivot`, `Authenticatable`, `<ns>.Model`, `mixin(Model, …)`,
    // a template with a substitution, a computed key, a spread; constants, config fields, static and declare fields,
    // and a non-model class pass.
    "skeleton/app/Models/Dynamic.ts": [
      model("Pivot", "  a = now();\n  b = `x${String(1)}`;\n  c = { [String(1)]: 1 };\n  d = [...list];\n  e = new Date();"),
      x(COLUMN, 5),
    ],
    "skeleton/app/Models/Auth.ts": [model("Authenticatable", "  token = Math.random();"), x(COLUMN)],
    "skeleton/app/Models/Qualified.ts": [model("Eloquent.Model", "  at = now();"), x(COLUMN)],
    "skeleton/app/Models/Mixin.ts": [model("mixin(Model, Object)", "  at = now();"), x(COLUMN)],
    "skeleton/app/Models/Constant.ts": [
      model(
        "Model",
        '  declare id: number;\n  a = 1;\n  b = -1;\n  c = !0;\n  d = "x";\n  e = `y`;\n  f = null;\n  g = [1, "a", null, true];\n  h = { "a": 1, ["b"]: [2] };\n  i = 1 as number;\n  j = (2);\n  k = { a: 1 } satisfies Record<string, number>;\n  casts = { at: String(now()) };\n  attributes = { at: now() };\n  table = `rows_${String(now())}`;\n  static booted = now();',
      ),
      [],
    ],
    "skeleton/app/Models/Regex.ts": [model("Model", "  pattern = /a+/u;"), x(COLUMN)],
    "skeleton/app/Plain.ts": ["export class Row {\n  at = Date.now();\n}\n", []],
    "packages/demo/src/support.ts": [support, []],
    "packages/routing/src/support.ts": [support, []],
  };
  const dir = tempDir("xaravel-lint-133-edge-");
  write(dir, Object.fromEntries(Object.entries(cases).map(([path, [text]]) => [path, text])));
  const run = oxlint([dir]);
  const found = byFile(run, dir);
  const actual = Object.fromEntries(Object.keys(cases).map((path) => [path, (found[path] ?? []).filter((rule) => rule.startsWith("xaravel("))]));
  expect(actual).toEqual(Object.fromEntries(Object.entries(cases).map(([path, [, rules]]) => [path, [...rules]])));
  expect(Object.keys(found).filter((path) => !(path in cases))).toEqual([]);
  expect(run.diagnostics.filter(([, rule]) => !rule.startsWith("xaravel(")).map(([file, rule]) => `${file.slice(dir.length + 1)}: ${rule}`)).toEqual([]);

  // no-async-thenable-return names a resolved thenable by the list's FQCN spelling, and a structural one by its class name.
  const thenMessage = (path: string): string | null => {
    const line = run.output.split("\n").find((text) => text.startsWith(`${dir}/${path}:`) && text.endsWith(`[Error/xaravel(${THEN})]`));
    return line === undefined ? null : line.replace(/^.+?:\d+:\d+: /, "").replace(/ \[Error\/xaravel\([\w-]+\)\]$/, "");
  };
  for (const [path, name] of [
    ["packages/demo/src/then/AsResolved.ts", "Illuminate\\Database\\Query\\Builder"],
    ["packages/demo/src/then/SameFile.ts", "Illuminate\\Http\\Client\\PendingRequest"],
    ["packages/demo/src/then/PipelineReturn.ts", "Illuminate\\Contracts\\Pipeline\\Pipeline"],
    ["packages/demo/src/then/Let.ts", "Lazy"],
  ] as const) {
    expect(thenMessage(path)).toBe(`an async function returns the thenable \`${name}\` unawaited, so the Promise resolves to its terminal's result; await it or drop \`async\` (AD-6)`);
  }
}

/** A temp root's own `tools/lint-rules/singletons.json` replaces the committed one for the files under it. */
function tempSingletons(): void {
  const source = [
    'import { registerClass } from "./support";',
    "",
    "export class Hub {",
    "  listeners: string[] = [];",
    "  state = 0;",
    "",
    "  listen(event: string): void {",
    "    this.listeners.push(event);",
    "  }",
    "",
    "  fire(event: string): void {",
    "    this.listeners.push(event);",
    "    this.state = 1;",
    "  }",
    "}",
    "",
    'registerClass("App\\\\Hub", Hub);',
    "",
  ].join("\n");
  const own = tempDir("xaravel-lint-133-own-");
  write(own, {
    "tools/lint-rules/singletons.json": `${JSON.stringify({ comment: "test", bindings: [], classes: ["App\\Hub"], bootOnly: [{ property: "App\\Hub::$listeners", writers: ["Listen"] }] }, null, 2)}\n`,
    "packages/demo/src/Hub.ts": source,
  });
  cpSync(join(FIXTURES, "support.ts"), join(own, "packages/demo/src/support.ts"));
  expect(singletonsPath(join(own, "packages/demo/src/Hub.ts"), root)).toBe(join(own, "tools/lint-rules/singletons.json"));
  const ownRun = oxlint([own]);
  expect(byFile(ownRun, own)).toEqual({ "packages/demo/src/Hub.ts": ["xaravel(no-boot-only-write)", "xaravel(no-singleton-field-write)"] });
  expect(ownRun.output).toContain("boot-only `App\\Hub::$listeners` is written outside its register/boot path (writers, compared case-insensitively: listen); it is sealed after boot (AD-5)");
  expect(ownRun.output).toContain("`this.state` is written after construction in the singleton `App\\Hub`");

  // A malformed or incomplete file fails the run, naming its path, rather than turning the rules off.
  for (const [label, text] of [
    ["malformed", "{ not json\n"],
    ["incomplete", '{ "classes": [] }\n'],
  ] as const) {
    const broken = tempDir(`xaravel-lint-133-${label}-`);
    write(broken, { "tools/lint-rules/singletons.json": text, "packages/demo/src/Hub.ts": source });
    cpSync(join(FIXTURES, "support.ts"), join(broken, "packages/demo/src/support.ts"));
    // The default format prints the plugin's error (`--format unix` drops it). Name it explicitly: on GitHub
    // Actions oxlint otherwise picks its `github` format, which drops the message too.
    const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", CONFIG, "--format", "default", broken], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stdout.toString() + proc.stderr.toString()).toContain(`xaravel lint: ${label === "malformed" ? "cannot read " : ""}${join(broken, "tools/lint-rules/singletons.json")}`);
  }

  // Without its own file, the root falls back to the committed one, which does not list App\Hub.
  const fallback = tempDir("xaravel-lint-133-fallback-");
  write(fallback, { "packages/demo/src/Hub.ts": source });
  cpSync(join(FIXTURES, "support.ts"), join(fallback, "packages/demo/src/support.ts"));
  expect(singletonsPath(join(fallback, "packages/demo/src/Hub.ts"), root)).toBe(SINGLETONS);
  const fallbackRun = oxlint([fallback]);
  expect(fallbackRun.diagnostics).toEqual([]);
  expect(fallbackRun.exitCode).toBe(0);
}

/** The committed singletons.json and boot-only-state are the scan of the snapshot (when it is synced). */
function scanCheck(): void {
  const bootOnly = readFileSync(join(root, "conformance", "boot-only-state"), "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"));
  const singletons = JSON.parse(readFileSync(SINGLETONS, "utf8")) as { bootOnly: { property: string }[] };
  expect(singletons.bootOnly.map((entry) => entry.property)).toEqual(bootOnly);
  if (!REAL) {
    console.warn("lint-signatures.test.ts: conformance/upstream is not synced; scan:singletons --check is skipped");
    return;
  }
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "tools", "scans", "singletons.ts"), "--check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(proc.stderr.toString()).toBe("");
  expect(proc.stdout.toString()).toContain("5 boot-only properties; byte-identical.");
  expect(proc.exitCode).toBe(0);
}

/** A disable directive for any of the seven, or a config lowering or dropping one, fails `lint:disables`. */
function disableCases(): void {
  for (const [name] of RULES) {
    expect(scanSource("f.ts", `x(); // oxlint-disable-line xaravel/${name}\n`).map((violation) => violation.message)).toEqual([`\`oxlint-disable-line\` disables ${name}`]);
    expect(scanSource("f.ts", `/* oxlint-disable ${name} */\nx();\n`).map((violation) => violation.message)).toEqual([`\`oxlint-disable\` disables ${name}`]);
  }
  const gitRootWith = (files: Readonly<Record<string, string>>): string => {
    const dir = tempDir("xaravel-lint-133-git-");
    expect(Bun.spawnSync(["git", "init", "-q", "."], { cwd: dir }).exitCode).toBe(0);
    cpSync(join(root, CONFIG), join(dir, CONFIG));
    write(dir, files);
    return dir;
  };
  const base = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as { rules: Record<string, unknown> };
  for (const [name] of RULES) {
    const lowered = gitRootWith({ [CONFIG]: JSON.stringify({ ...base, rules: { ...base.rules, [`xaravel/${name}`]: "off" } }) });
    expect(findDisables(lowered).violations.map((violation) => `${violation.path}: ${violation.message}`)).toEqual([`.oxlintrc.json: sets ${name} to "off" (a spine rule must be "error")`]);
    const { [`xaravel/${name}`]: _dropped, ...rest } = base.rules;
    const dropped = gitRootWith({ [CONFIG]: JSON.stringify({ ...base, rules: rest }) });
    expect(findDisables(dropped).violations.map((violation) => `${violation.path}: ${violation.message}`)).toEqual([`.oxlintrc.json: does not set ${name} (a spine rule must be "error")`]);
  }
  const directive = gitRootWith({ "packages/routing/src/Router.ts": "// oxlint-disable-next-line xaravel/no-singleton-field-write\nexport class Router {}\n" });
  expect(findDisables(directive).violations.map((violation) => `${violation.path}:${violation.line}:${violation.col}: ${violation.message}`)).toEqual([
    "packages/routing/src/Router.ts:1:1: `oxlint-disable-next-line` disables no-singleton-field-write",
  ]);
}
