// Xaravel Tests for Story 6.2 (the `xaravel` oxlint plugin's identity, value
// and test-hygiene rules: `tools/lint-rules/plugin.ts`, `.oxlintrc.json` and
// `SPINE_RULES` in `tools/lint-rules/disables.ts`; AD-1, AD-3, AD-7, AD-10,
// AD-15, AD-16.4, AD-23).
//
// oxlint runs for real, from the repository root with the repository's own
// `.oxlintrc.json` and `--format unix`, over copies of the committed fixtures
// in `tools/lint-rules/fixtures/identity-values/` placed at the scoped paths
// each rule needs inside temp roots, and over inline edge-case sources written
// there. The disable check runs on hermetic temp git roots. The real
// repository is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkConfig, findDisables, scanSource, SPINE_RULES } from "../../../tools/lint-rules/disables";
import plugin, { isFrameworkSource, isGraderLocation, isModelFile, isPackageSource, isPortedTest, RULE_NAMES, scopePath } from "../../../tools/lint-rules/plugin";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const FIXTURES = join(root, "tools", "lint-rules", "fixtures", "identity-values");
const DISABLES = join(root, "tools", "lint-rules", "disables.ts");
const CONFIG = ".oxlintrc.json";
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
function oxlint(config: string, paths: readonly string[]): LintRun {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", config, "--format", "unix", ...paths], { cwd: root, stdout: "pipe", stderr: "pipe" });
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

/** Each failing fixture, its rule, and the placements (relative to a temp root) where it must fail. */
const FAILING: readonly { readonly fixture: string; readonly rule: string; readonly placements: readonly string[] }[] = [
  { fixture: "constructor-name.ts", rule: "no-identity-constructor-name", placements: ["packages/demo/src/ConstructorName.ts", "packages/demo/tests/xaravel/ConstructorName.ts", "skeleton/app/ConstructorName.ts", "installer/src/ConstructorName.ts", "packages/demo/tests/ported/ConstructorName.ts"] },
  { fixture: "json-stringify.ts", rule: "no-framework-json-stringify", placements: ["packages/demo/src/JsonStringify.ts", "packages/support/src/Sub/JsonStringify.ts"] },
  { fixture: "ported-expect.ts", rule: "no-ported-bun-expect", placements: ["packages/demo/tests/ported/PortedExpect.ts", "packages/demo/tests/ported/Sub/PortedExpect.ts"] },
  { fixture: "type-import-injection.ts", rule: "no-type-import-injection", placements: ["packages/demo/src/TypeImportInjection.ts", "skeleton/app/TypeImportInjection.ts"] },
  { fixture: "model-private.ts", rule: "no-model-private", placements: ["packages/database/src/Eloquent/Concerns/HasAttributes.ts", "packages/database/src/Eloquent/Model.ts"] },
  { fixture: "default-export.ts", rule: "no-package-default-export", placements: ["packages/demo/src/DefaultExport.ts", "installer/src/DefaultExport.ts"] },
];

/** Each fixture and the placements where it must lint clean: the near-misses, and failing fixtures outside their rule's scope. */
const PASSING: readonly { readonly fixture: string; readonly placements: readonly string[] }[] = [
  { fixture: "passing.ts", placements: ["packages/demo/src/Passing.ts", "packages/database/src/Eloquent/Model.ts", "installer/src/Passing.ts", "packages/demo/tests/ported/Passing.ts"] },
  // The identity rule exempts the grader's locations (decisions/ESC-6.2-1.md).
  { fixture: "constructor-name.ts", placements: ["packages/mockery/tests/xaravel/ConstructorName.ts", "packages/assert/tests/xaravel/fixtures/ConstructorName.ts", "packages/assert/src/ConstructorName.ts", "conformance/tests/xaravel/ConstructorName.ts", "tools/x/ConstructorName.ts"] },
  { fixture: "passing-expect.ts", placements: ["packages/demo/tests/xaravel/PassingExpect.ts", "packages/demo/tests/PassingExpect.ts"] },
  { fixture: "passing-ported.ts", placements: ["packages/demo/tests/ported/PassingPorted.ts"] },
  { fixture: "json-stringify.ts", placements: ["packages/assert/src/JsonStringify.ts", "packages/mockery/src/JsonStringify.ts", "packages/demo/tests/JsonStringify.ts", "skeleton/app/JsonStringify.ts"] },
  { fixture: "ported-expect.ts", placements: ["packages/demo/tests/xaravel/PortedExpect.ts", "packages/demo/tests/PortedExpect.ts"] },
  { fixture: "model-private.ts", placements: ["packages/database/src/Eloquent/Builder.ts", "packages/database/src/Query/Concerns/HasAttributes.ts", "packages/demo/src/Eloquent/Concerns/HasAttributes.ts"] },
  { fixture: "default-export.ts", placements: ["skeleton/config/app.ts", "skeleton/database/migrations/0001_01_01_000000_create_users_table.ts", "packages/demo/tests/DefaultExport.ts"] },
];

// XT-conformance-132

xaravelTest("XT-conformance-132", "the committed fixture for each xaravel rule fails naming exactly its rule at its scoped paths and each passing fixture passes, under bun --bun oxlint --type-aware -c .oxlintrc.json; the root config holds all six rules as errors with the plugin loaded, and lint:disables rejects disabling them (AD-1, AD-3, AD-7, AD-10, AD-15.1, AD-23, AD-16.4)", () => {
  // The config and the plugin: the six rules (with Story 6.3's seven after them), errors at the top level, plugin loaded, spine rules.
  const config = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as { jsPlugins: unknown; rules: Record<string, unknown>; overrides?: unknown };
  expect(config.jsPlugins).toEqual(["./tools/lint-rules/plugin.ts"]);
  expect(RULE_NAMES).toEqual([
    "no-identity-constructor-name",
    "no-framework-json-stringify",
    "no-ported-bun-expect",
    "no-type-import-injection",
    "no-model-private",
    "no-package-default-export",
    "no-maybe-promise-return",
    "no-async-thenable-return",
    "no-singleton-field-write",
    "no-boot-only-write",
    "no-arrow-test-body",
    "no-inject-param-mismatch",
    "no-dynamic-column-default",
  ]);
  expect(plugin.meta.name).toBe("xaravel");
  expect(Object.keys(plugin.rules)).toEqual([...RULE_NAMES]);
  for (const name of RULE_NAMES) {
    expect(config.rules[`xaravel/${name}`]).toBe("error");
    expect(SPINE_RULES).toContain(name);
  }
  expect(config.overrides).toBeUndefined();
  expect(checkConfig(root, CONFIG)).toEqual([]);

  // Each failing fixture fails naming exactly its rule at every placement; each other passing placement is clean
  // (a failing placement shared with a passing one, `Model.ts`, takes the failing fixture here and the passing one below).
  const dir = tempDir("xaravel-lint-132-");
  for (const { fixture, placements } of [...PASSING, ...FAILING]) {
    for (const placement of placements) {
      place(dir, fixture, placement);
    }
  }
  const run = oxlint(CONFIG, [dir]);
  expect(run.exitCode).toBe(1);
  const expected: Record<string, string[]> = {};
  for (const { rule, placements } of FAILING) {
    for (const placement of placements) {
      const count = rule === "no-model-private" ? 2 : 1;
      expected[placement] = Array.from({ length: count }, () => `xaravel(${rule})`);
    }
  }
  expect(byFile(run, dir)).toEqual(expected);

  // Each failing fixture alone exits 1 naming exactly its rule; the passing placements alone exit 0.
  for (const { fixture, rule, placements } of FAILING) {
    const single = tempDir("xaravel-lint-132-single-");
    place(single, fixture, placements[0]!);
    const singleRun = oxlint(CONFIG, [join(single, placements[0]!)]);
    expect(singleRun.exitCode).toBe(1);
    expect([...new Set(singleRun.diagnostics.map(([, name]) => name))]).toEqual([`xaravel(${rule})`]);
  }
  const clean = tempDir("xaravel-lint-132-clean-");
  for (const { fixture, placements } of PASSING) {
    for (const placement of placements) {
      place(clean, fixture, placement);
    }
  }
  const cleanRun = oxlint(CONFIG, [clean]);
  expect(cleanRun.diagnostics).toEqual([]);
  expect(cleanRun.exitCode).toBe(0);

  // Each message names its AD.
  for (const [rule, ad] of [
    ["no-identity-constructor-name", "AD-10"],
    ["no-framework-json-stringify", "AD-23"],
    ["no-ported-bun-expect", "AD-15"],
    ["no-type-import-injection", "AD-1"],
    ["no-model-private", "AD-7"],
    ["no-package-default-export", "AD-3"],
  ] as const) {
    const line = run.output.split("\n").find((text) => text.endsWith(`[Error/xaravel(${rule})]`));
    expect(line).toContain(`(${ad})`);
  }

  edgeCases();
  pathCases();
  disableCases();
}, 120_000);

/** The spellings each rule covers and the near-misses it leaves alone, one file each, with the exact diagnostics. */
function edgeCases(): void {
  const support = readFileSync(join(FIXTURES, "support.ts"), "utf8");
  const x = (rule: string, count = 1): string[] => Array.from({ length: count }, () => `xaravel(${rule})`);
  const ID = "no-identity-constructor-name";
  const JSON_RULE = "no-framework-json-stringify";
  const PORTED = "no-ported-bun-expect";
  const INJECT = "no-type-import-injection";
  const DEFAULT = "no-package-default-export";
  const cases: Readonly<Record<string, readonly [string, readonly string[]]>> = {
    // no-identity-constructor-name: optional, computed, template, destructured (declaration and assignment), non-null,
    // a parenthesised optional chain, a nested `tools/` or `conformance/` in a package; a bare `constructor` passes.
    "skeleton/app/Optional.ts": ["export const n = (v: object | null): string | undefined => v?.constructor?.name;\n", x(ID)],
    "packages/demo/tests/Computed.ts": ['export const n = (v: object): string => v["constructor"]["name"];\n', x(ID)],
    "packages/demo/tests/Template.ts": ["export const n = (v: object): string => v[`constructor`][`name`];\n", x(ID)],
    "packages/demo/src/Destructure.ts": ["export function n(v: object): string {\n  const { name } = v.constructor;\n  return name;\n}\n", x(ID)],
    "packages/demo/src/DestructureAssign.ts": ['export function n(v: object): string {\n  let name = "";\n  ({ name } = v.constructor);\n  return name;\n}\n', x(ID)],
    "packages/demo/src/NonNull.ts": ["export const n = (v: { readonly constructor?: { readonly name: string } }): string => v.constructor!.name;\n", x(ID)],
    "packages/demo/src/ChainParen.ts": ["export const n = (v: object): string => (v?.constructor).name;\n", x(ID)],
    "packages/demo/src/tools/Nested.ts": ["export const n = (v: object): string => v.constructor.name;\n", x(ID)],
    "packages/demo/tests/conformance/Nested.ts": ["export const n = (v: object): string => v.constructor.name;\n", x(ID)],
    "packages/demo/src/Bare.ts": ["export function n(constructor: { readonly name: string }): string {\n  return constructor.name;\n}\n", []],
    // no-framework-json-stringify: alias, computed, globalThis, a parenthesised optional chain, destructured
    // (declaration and assignment); JSON.parse and grader / non-package paths pass.
    "packages/demo/src/JsonAlias.ts": ["export const encode = JSON.stringify;\n", x(JSON_RULE)],
    "packages/demo/src/JsonComputed.ts": ['export const s = JSON["stringify"](1);\n', x(JSON_RULE)],
    "packages/demo/src/JsonGlobal.ts": ["export const s = globalThis.JSON.stringify(1);\n", x(JSON_RULE)],
    "packages/demo/src/JsonChain.ts": ["export const s = (globalThis?.JSON).stringify(1);\n", x(JSON_RULE)],
    "packages/demo/src/JsonDestructure.ts": ["const { stringify } = JSON;\n\nexport const s = stringify(1);\n", x(JSON_RULE)],
    "packages/demo/src/JsonDestructureAssign.ts": ["let s: unknown = null;\n({ stringify: s } = globalThis.JSON);\n\nexport const t = s;\n", x(JSON_RULE)],
    "packages/demo/src/JsonParse.ts": ['export const v: unknown = JSON.parse("1");\n', []],
    "packages/mockery/src/Json.ts": ["export const s = JSON.stringify(1);\n", []],
    "installer/src/Json.ts": ["export const s = JSON.stringify(1);\n", []],
    // no-ported-bun-expect: namespace, re-exports (named, `*`, `* as`), dynamic import, require, import.meta.require;
    // type-only and other names pass.
    "packages/demo/tests/ported/Namespace.ts": ['import * as bun from "bun:test";\n\nexport const t = bun.test;\n', x(PORTED)],
    "packages/demo/tests/ported/ReExport.ts": ['export { expect as check } from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/ported/ExportAll.ts": ['export * from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/ported/ExportAllAs.ts": ['export * as ns from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/ported/Dynamic.ts": ['export const load = async (): Promise<unknown> => (await import("bun:test")).expect;\n', x(PORTED)],
    "packages/demo/tests/ported/Require.ts": ['export const m: unknown = require("bun:test");\n', x(PORTED)],
    "packages/demo/tests/ported/MetaRequire.ts": ['export const m: unknown = import.meta.require("bun:test");\n', x(PORTED)],
    "packages/demo/tests/ported/TypeOnly.ts": ['import { type expect as E, test } from "bun:test";\n\nexport type X = typeof E;\nexport const t = test;\n', []],
    // no-type-import-injection: an inject(...) call, <obj>.inject with `as`, shorthand, an `@<obj>.inject(...)`
    // decorator, a type import after its use; type arguments and keys pass.
    "packages/demo/src/inject/InjectCall.ts": ['import { inject } from "./support";\nimport { type Mailer } from "./support";\n\nexport const decorate = inject({ mailer: Mailer });\nexport type M = Mailer;\n', x(INJECT)],
    "packages/demo/src/inject/InjectMember.ts": ['import * as container from "./support";\nimport type { Mailer } from "./support";\n\nexport const decorate = container.inject({ mailer: Mailer as never });\nexport type M = Mailer;\n', x(INJECT)],
    "packages/demo/src/inject/InjectShorthand.ts": ['import { inject } from "./support";\nimport type { Mailer } from "./support";\n\nexport const decorate = inject({ Mailer });\nexport type M = Mailer;\n', x(INJECT)],
    "packages/demo/src/inject/InjectDecorator.ts": [
      'import * as container from "./support";\nimport type { Mailer } from "./support";\n\n@container.inject({ mailer: Mailer })\nexport class Notifier {\n  constructor(readonly mailer: Mailer | null = null) {}\n}\n',
      x(INJECT),
    ],
    "packages/demo/src/inject/InjectHoisted.ts": ['import { inject } from "./support";\n\nexport const decorate = inject({ mailer: Mailer });\nexport type M = Mailer;\n\nimport type { Mailer } from "./support";\n', x(INJECT)],
    "packages/demo/src/inject/InjectType.ts": ['import { contract, inject } from "./support";\nimport type { Mailer } from "./support";\n\nexport const decorate = inject({ Mailer: contract<Mailer>("mailer") });\n', []],
    "packages/demo/src/inject/support.ts": [support, []],
    // no-model-private: a field, `this.#x` and `#x in o`.
    "packages/database/src/Eloquent/Concerns/HasFlags.ts": [
      "export class HasFlags {\n  #flag = 1;\n\n  get flag(): number {\n    return this.#flag;\n  }\n\n  static has(o: object): boolean {\n    return #flag in o;\n  }\n}\n",
      x("no-model-private", 3),
    ],
    // no-package-default-export: `export { x as default }`, `export { default } from`, `export * as default from`;
    // a named re-export of default passes.
    "packages/demo/src/DefaultAs.ts": ["const x = 1;\n\nexport { x as default };\n", x(DEFAULT)],
    "packages/demo/src/DefaultFrom.ts": ['export { default } from "./DefaultAs";\n', x(DEFAULT)],
    "packages/demo/src/DefaultAll.ts": ['export * as default from "./DefaultAs";\n', x(DEFAULT)],
    "packages/demo/src/DefaultNamed.ts": ['export { default as X } from "./DefaultAs";\n', []],
    "installer/src/Main.ts": ["export default function main(): void {}\n", x(DEFAULT)],
  };
  const dir = tempDir("xaravel-lint-132-edge-");
  write(dir, Object.fromEntries(Object.entries(cases).map(([path, [text]]) => [path, text])));
  const run = oxlint(CONFIG, [dir]);
  const found = byFile(run, dir);
  // Only the plugin's diagnostics count: some spellings are odd enough that built-in rules fire too
  // (`no-unsafe-optional-chaining` on `(a?.b).c`, `unbound-method` on a destructured `stringify`).
  const actual = Object.fromEntries(Object.keys(cases).map((path) => [path, (found[path] ?? []).filter((rule) => rule.startsWith("xaravel("))]));
  expect(actual).toEqual(Object.fromEntries(Object.entries(cases).map(([path, [, rules]]) => [path, [...rules]])));
  expect(Object.keys(found).filter((path) => !(path in cases))).toEqual([]);
  expect(run.diagnostics.filter(([, rule]) => !rule.startsWith("xaravel(")).map(([, rule]) => rule).sort()).toEqual([
    "eslint(no-unsafe-optional-chaining)",
    "eslint(no-unsafe-optional-chaining)",
    "typescript(unbound-method)",
  ]);
}

/** The path scopes, relative to the cwd when inside it, else absolute, matched by segment. */
function pathCases(): void {
  expect(scopePath("/repo/packages/demo/src/A.ts", "/repo")).toBe("packages/demo/src/A.ts");
  expect(scopePath("/repo/packages/demo/src/A.ts", "/repo/")).toBe("packages/demo/src/A.ts");
  expect(scopePath("/tmp/t/packages/demo/src/A.ts", "/repo")).toBe("/tmp/t/packages/demo/src/A.ts");
  expect(scopePath("/repository/packages/demo/src/A.ts", "/repo")).toBe("/repository/packages/demo/src/A.ts");
  expect(isFrameworkSource("packages/demo/src/A.ts")).toBe(true);
  expect(isFrameworkSource("/tmp/t/packages/support/src/Sub/A.ts")).toBe(true);
  expect(isFrameworkSource("packages/assert/src/A.ts")).toBe(false);
  expect(isFrameworkSource("packages/mockery/src/A.ts")).toBe(false);
  expect(isFrameworkSource("packages/demo/tests/A.ts")).toBe(false);
  expect(isFrameworkSource("mypackages/demo/src/A.ts")).toBe(false);
  expect(isGraderLocation("packages/mockery/tests/xaravel/cells.ts")).toBe(true);
  expect(isGraderLocation("packages/assert/src/A.ts")).toBe(true);
  expect(isGraderLocation("/tmp/t/conformance/harness/A.ts")).toBe(true);
  expect(isGraderLocation("tools/lint-rules/plugin.ts")).toBe(true);
  expect(isGraderLocation("packages/demo/tests/A.ts")).toBe(false);
  expect(isGraderLocation("tools/x/A.ts")).toBe(true);
  expect(isGraderLocation("conformance/tests/xaravel/A.ts")).toBe(true);
  expect(isGraderLocation("packages/demo/src/tools/A.ts")).toBe(false);
  expect(isGraderLocation("packages/demo/tests/conformance/A.ts")).toBe(false);
  expect(isGraderLocation("skeleton/tools/A.ts")).toBe(false);
  expect(isGraderLocation("/tmp/t/packages/demo/src/tools/X.ts")).toBe(false);
  expect(isGraderLocation("/tmp/t/packages/demo/tests/conformance/X.ts")).toBe(false);
  expect(isGraderLocation("/tmp/t/tools/x/X.ts")).toBe(true);
  expect(isGraderLocation("/tmp/t/packages/mockery/tests/X.ts")).toBe(true);
  expect(isGraderLocation("/tmp/t/installer/tools/X.ts")).toBe(false);
  expect(isGraderLocation("/tmp/t/X.ts")).toBe(false);
  expect(isGraderLocation("packages/assertions/src/A.ts")).toBe(false);
  expect(isGraderLocation("skeleton/app/A.ts")).toBe(false);
  expect(isPackageSource("installer/src/A.ts")).toBe(true);
  expect(isPackageSource("packages/assert/src/A.ts")).toBe(true);
  expect(isPackageSource("skeleton/config/app.ts")).toBe(false);
  expect(isPortedTest("packages/demo/tests/ported/A.ts")).toBe(true);
  expect(isPortedTest("packages/demo/tests/xaravel/A.ts")).toBe(false);
  expect(isModelFile("packages/database/src/Eloquent/Model.ts")).toBe(true);
  expect(isModelFile("packages/database/src/Eloquent/Concerns/Deep/A.ts")).toBe(true);
  expect(isModelFile("packages/database/src/Eloquent/ModelNotFoundException.ts")).toBe(false);
  expect(isModelFile("packages/database/src/Eloquent/Builder.ts")).toBe(false);
}

/** A disable directive for any of the six, or a config lowering one, fails `lint:disables`. */
function disableCases(): void {
  for (const name of RULE_NAMES) {
    expect(scanSource("f.ts", `x(); // oxlint-disable-line xaravel/${name}\n`).map((violation) => violation.message)).toEqual([`\`oxlint-disable-line\` disables ${name}`]);
  }

  const gitRootWith = (files: Readonly<Record<string, string>>): string => {
    const dir = tempDir("xaravel-lint-132-git-");
    expect(Bun.spawnSync(["git", "init", "-q", "."], { cwd: dir }).exitCode).toBe(0);
    cpSync(join(root, CONFIG), join(dir, CONFIG));
    write(dir, files);
    return dir;
  };
  const disabled = gitRootWith({ "packages/database/src/Eloquent/Model.ts": "// oxlint-disable-next-line xaravel/no-model-private\nexport class Model {}\n" });
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", DISABLES, "--root", disabled], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(1);
  expect(proc.stderr.toString()).toBe("packages/database/src/Eloquent/Model.ts:1:1: `oxlint-disable-next-line` disables no-model-private (AD-16)\n");

  const base = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as { rules: Record<string, unknown>; jsPlugins: unknown };
  // The root config must keep loading the plugin, as a string entry or a `{ specifier }` object.
  const pluginViolations = (jsPlugins: unknown): string[] =>
    findDisables(gitRootWith({ [CONFIG]: JSON.stringify({ ...base, jsPlugins }) })).violations.map((violation) => `${violation.path}: ${violation.message}`);
  const missingPlugin = [".oxlintrc.json: does not load ./tools/lint-rules/plugin.ts in jsPlugins, which turns the xaravel spine rules off"];
  expect(pluginViolations(undefined)).toEqual(missingPlugin);
  expect(pluginViolations([])).toEqual(missingPlugin);
  expect(pluginViolations(["./tools/lint-rules/other.ts"])).toEqual(missingPlugin);
  expect(pluginViolations([{ name: "xaravel", specifier: "./elsewhere/plugin.ts" }])).toEqual(missingPlugin);
  expect(pluginViolations([{ name: "xaravel", specifier: "./tools/lint-rules/plugin.ts" }])).toEqual([]);
  expect(pluginViolations(["./tools/lint-rules/plugin.ts"])).toEqual([]);
  expect(
    findDisables(gitRootWith({ "sub/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"], rules: { "no-console": "error" } }) })).violations,
  ).toEqual([]);
  for (const name of RULE_NAMES) {
    const lowered = gitRootWith({ [CONFIG]: JSON.stringify({ ...base, rules: { ...base.rules, [`xaravel/${name}`]: "warn" } }) });
    expect(findDisables(lowered).violations.map((violation) => `${violation.path}: ${violation.message}`)).toEqual([`.oxlintrc.json: sets ${name} to "warn" (a spine rule must be "error")`]);
    const { [`xaravel/${name}`]: _dropped, ...rest } = base.rules;
    const dropped = gitRootWith({ [CONFIG]: JSON.stringify({ ...base, rules: rest }) });
    expect(findDisables(dropped).violations.map((violation) => `${violation.path}: ${violation.message}`)).toEqual([`.oxlintrc.json: does not set ${name} (a spine rule must be "error")`]);
  }
}
