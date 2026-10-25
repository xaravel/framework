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
import plugin, { GRADER_PACKAGES, isFrameworkSource, isGraderLocation, isModelFile, isPackageFile, isPackageSource, isPortedTest, RULE_NAMES, scopePath } from "../../../tools/lint-rules/plugin";
import { readTable } from "../../../tools/scaffold/table";
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
    "no-token-string-coercion",
  ]);
  expect(plugin.meta.name).toBe("xaravel");
  expect(Object.keys(plugin.rules)).toEqual([...RULE_NAMES]);
  for (const name of RULE_NAMES) {
    expect(config.rules[`xaravel/${name}`]).toBe("error");
    expect(SPINE_RULES).toContain(name);
  }
  // The one override is return-await for packages (Retro 6 item 11); none touches the xaravel rules.
  expect(config.overrides).toEqual([{ files: ["packages/**"], rules: { "typescript/return-await": ["error", "always"] } }]);
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
  graderListCases();
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
    // no-ported-bun-expect, any package file (retro 6 item 4): every export of `bun:test`'s `expect` or namespace, with
    // or without `from`, hoisting included, in tests, support and src; type-only exports, Xaravel Tests and files
    // outside `packages/<p>/` pass.
    "packages/demo/tests/support/E.ts": ['export { expect } from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/support/Alias.ts": ['export { expect as e } from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/support/All.ts": ['export * from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/support/AllAs.ts": ['export * as b from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/support/ImportExport.ts": ['import { expect as e } from "bun:test";\n\nexport { e };\n', x(PORTED)],
    "packages/demo/tests/support/ImportExportAs.ts": ['import { expect as e } from "bun:test";\n\nexport { e as check };\n', x(PORTED)],
    "packages/demo/tests/support/ImportDefault.ts": ['import { expect as e } from "bun:test";\n\nexport default e;\n', x(PORTED)],
    "packages/demo/tests/support/ImportConst.ts": ['import { expect as e } from "bun:test";\n\nexport const c = e;\n', x(PORTED)],
    "packages/demo/tests/support/ImportHoisted.ts": ['export { e };\n\nimport { expect as e } from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/support/Namespace.ts": ['import * as b from "bun:test";\n\nexport { b };\n', x(PORTED)],
    "packages/demo/tests/support/NamespaceMember.ts": ['import * as b from "bun:test";\n\nexport const c = b.expect;\n', x(PORTED)],
    "packages/demo/tests/support/TypeExport.ts": ['export type { expect } from "bun:test";\n', []],
    "packages/demo/src/ExpectExport.ts": ['export { expect } from "bun:test";\n', x(PORTED)],
    "packages/demo/tests/xaravel/X.test.ts": ['import { expect, test } from "bun:test";\n\ntest("x", () => {\n  expect(1).toBe(1);\n});\n', []],
    "conformance/tests/x/E.ts": ['export { expect } from "bun:test";\n', []],
    "conformance/tests/x/packages/demo/E.ts": ['export { expect } from "bun:test";\n', []],
    // Further export forms: `export =`, a namespace member (dot or computed) by default or const, a wrapped binding,
    // `import … = require`, a global `expect`, a `require` / `import()` value, destructured exports, and a
    // test-globals reference in a support declaration file.
    "packages/demo/tests/support/ExportAssign.cts": ['import { expect as e } from "bun:test";\n\nexport = e;\n', x(PORTED)],
    "packages/demo/tests/support/DefaultNamespaceMember.ts": ['import * as b from "bun:test";\n\nexport default b.expect;\n', x(PORTED)],
    "packages/demo/tests/support/NamespaceComputed.ts": ['import * as b from "bun:test";\n\nexport const c = b["expect"];\n', x(PORTED)],
    "packages/demo/tests/support/ConstAs.ts": ['import { expect as e } from "bun:test";\n\nexport const c = e as unknown;\n', x(PORTED)],
    "packages/demo/tests/support/ExportImportEquals.ts": ['export import bt = require("bun:test");\n', x(PORTED)],
    "packages/demo/tests/support/ImportEqualsExport.ts": ['import bt = require("bun:test");\n\nexport { bt };\n', x(PORTED)],
    "packages/demo/tests/support/GlobalMember.ts": ["export const e = globalThis.expect;\n", x(PORTED)],
    "packages/demo/tests/support/GlobalSelf.ts": ["export const e: unknown = self.expect;\n", x(PORTED)],
    "packages/demo/tests/support/UnboundExport.ts": ["export { expect };\n", x(PORTED)],
    "packages/demo/tests/support/RequireMember.ts": ['export const e: unknown = require("bun:test").expect;\n', x(PORTED)],
    "packages/demo/tests/support/RequireDestructure.ts": ['export const { expect } = require("bun:test");\n', x(PORTED)],
    "packages/demo/tests/support/ImportMember.ts": ['export const e = (await import("bun:test")).expect;\n', x(PORTED)],
    "packages/demo/tests/support/GlobalDestructure.ts": ["export const { expect } = globalThis;\n", x(PORTED)],
    "packages/demo/tests/support/Globals.d.ts": ['/// <reference types="bun-types/test-globals" />\n', x(PORTED)],
    // no-ported-bun-expect, Ported Tests: a test-globals reference and a global `expect` (bare, `globalThis.expect`,
    // `globalThis["expect"]`); a locally bound `expect` passes.
    "packages/demo/tests/ported/TestGlobals.ts": ['/// <reference types="bun-types/test-globals" />\n\nexport const x = 1;\n', x(PORTED)],
    "packages/demo/tests/ported/GlobalBare.ts": ["expect(1);\n", x(PORTED)],
    "packages/demo/tests/ported/GlobalThis.ts": ["globalThis.expect(1);\n", x(PORTED)],
    "packages/demo/tests/ported/GlobalThisComputed.ts": ['export const g: unknown = globalThis["expect"];\n', x(PORTED)],
    "packages/demo/tests/ported/support.ts": ["export function expect(value: unknown): unknown {\n  return value;\n}\n", []],
    "packages/demo/tests/ported/LocalExpect.ts": ['import { expect } from "./support";\n\nexpect(1);\n', []],
    // A test-globals `path=` reference, `import … = require`, an ambient `expect` (which would make Bun's runtime global
    // look local; under `declare global` the use stays global too), a destructured or aliased global, and a global
    // `expect` nested in a function body.
    "packages/demo/tests/ported/TestGlobalsPath.ts": ['/// <reference path="../../node_modules/bun-types/test-globals.d.ts" />\n\nexport const x = 1;\n', x(PORTED)],
    "packages/demo/tests/ported/ImportEquals.ts": ['import bt = require("bun:test");\n\nexport const t = bt.test;\n', x(PORTED)],
    "packages/demo/tests/ported/DeclareConst.ts": ["declare const expect: (v: unknown) => unknown;\n\nexpect(1);\n", x(PORTED)],
    "packages/demo/tests/ported/DeclareFunction.ts": ["declare function expect(v: unknown): unknown;\n\nexpect(1);\n", x(PORTED)],
    "packages/demo/tests/ported/DeclareGlobal.ts": ["declare global {\n  var expect: (v: unknown) => unknown;\n}\n\nexpect(1);\n\nexport {};\n", x(PORTED, 2)],
    "packages/demo/tests/ported/DestructureGlobal.ts": ["const { expect } = globalThis as unknown as { expect: (v: unknown) => unknown };\n\nexpect(1);\n", x(PORTED)],
    "packages/demo/tests/ported/DestructureAlias.ts": ["const { expect: e } = globalThis as unknown as { expect: (v: unknown) => unknown };\n\ne(1);\n", x(PORTED)],
    "packages/demo/tests/ported/DestructureAssign.ts": ["let e: unknown = null;\n({ expect: e } = globalThis as unknown as { expect: unknown });\n\nexport const f = e;\n", x(PORTED)],
    "packages/demo/tests/ported/GlobalAliases.ts": ["global.expect(1);\nself.expect(1);\nwindow.expect(1);\n", x(PORTED, 3)],
    "packages/demo/tests/ported/GlobalNested.ts": ["export function run(): void {\n  if (Math.random() > 2) {\n    expect(1);\n  }\n}\n", x(PORTED)],
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
  // (`no-unsafe-optional-chaining` on `(a?.b).c`, `unbound-method` on a destructured `stringify`, `triple-slash-reference` on a `path=` reference).
  const actual = Object.fromEntries(Object.keys(cases).map((path) => [path, (found[path] ?? []).filter((rule) => rule.startsWith("xaravel("))]));
  expect(actual).toEqual(Object.fromEntries(Object.entries(cases).map(([path, [, rules]]) => [path, [...rules]])));
  expect(Object.keys(found).filter((path) => !(path in cases))).toEqual([]);
  expect(run.diagnostics.filter(([, rule]) => !rule.startsWith("xaravel(")).map(([, rule]) => rule).sort()).toEqual([
    "eslint(no-unsafe-optional-chaining)",
    "eslint(no-unsafe-optional-chaining)",
    // The test-globals `path=` reference (`TestGlobalsPath.ts`).
    "typescript(triple-slash-reference)",
    "typescript(unbound-method)",
  ]);
}

/**
 * One grader list (retro 6 item 5): the committed package table's `kind: "grader"` rows decide `GRADER_PACKAGES` and
 * the identity-rule exemption, so a grader package added to the table but not to the plugin fails here.
 */
function graderListCases(): void {
  const rows = readTable(join(root, "tools", "scaffold", "packages.jsonl"));
  const inPackages = (dir: string): string | null => /^packages\/([^/]+)$/.exec(dir)?.[1] ?? null;
  const graders = rows.filter((row) => row.kind === "grader");
  expect(graders.length).toBeGreaterThan(0);
  expect(graders.some((row) => row.dir === "tools/boost-framework")).toBe(true);
  const graderPackages: string[] = [];
  for (const row of graders) {
    expect(isGraderLocation(`${row.dir}/src/X.ts`)).toBe(true);
    expect(isGraderLocation(`/tmp/t/${row.dir}/src/X.ts`)).toBe(true);
    const name = inPackages(row.dir);
    if (name !== null) {
      graderPackages.push(name);
      expect(GRADER_PACKAGES).toContain(name);
      expect(isFrameworkSource(`${row.dir}/src/X.ts`)).toBe(false);
      expect(isFrameworkSource(`/tmp/t/${row.dir}/src/X.ts`)).toBe(false);
    }
  }
  expect([...GRADER_PACKAGES].sort()).toEqual(graderPackages.sort());
  // `tools/` and `conformance/` are exempt wholesale (decisions/ESC-6.2-1.md); every other non-grader row is not.
  const others = rows.filter((row) => row.kind !== "grader" && !/^(tools|conformance)\//.test(row.dir));
  expect(others.some((row) => inPackages(row.dir) === null)).toBe(true);
  for (const row of others) {
    expect(isGraderLocation(`${row.dir}/src/X.ts`)).toBe(false);
    expect(isGraderLocation(`/tmp/t/${row.dir}/src/X.ts`)).toBe(false);
    if (inPackages(row.dir) !== null) {
      expect(isFrameworkSource(`${row.dir}/src/X.ts`)).toBe(true);
      expect(isFrameworkSource(`/tmp/t/${row.dir}/src/X.ts`)).toBe(true);
    }
  }
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
  expect(isPackageFile("packages/demo/tests/support/E.ts")).toBe(true);
  expect(isPackageFile("/tmp/t/packages/demo/src/E.ts")).toBe(true);
  expect(isPackageFile("conformance/tests/x/E.ts")).toBe(false);
  expect(isPackageFile("mypackages/demo/src/E.ts")).toBe(false);
  expect(isPackageFile("conformance/tests/x/packages/demo/E.ts")).toBe(false);
  expect(isPackageFile("/tmp/t/conformance/tests/x/packages/demo/E.ts")).toBe(false);
  expect(isPackageFile("/tmp/t/packages/demo/tests/conformance/E.ts")).toBe(true);
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

// XT-conformance-267

/** Where the token rule's failing fixture fails, and where it and the passing fixture lint clean. */
const TOKEN_RULE = "no-token-string-coercion";
const TOKEN_FAILING: readonly string[] = ["packages/demo/src/TokenStringCoercion.ts", "packages/demo/src/Sub/TokenStringCoercion.ts", "installer/src/TokenStringCoercion.ts"];
const TOKEN_CLEAN: readonly (readonly [string, string])[] = [
  ["passing-token.ts", "packages/demo/src/PassingToken.ts"],
  ["passing-token.ts", "installer/src/PassingToken.ts"],
  ["token-string-coercion.ts", "packages/demo/tests/TokenStringCoercion.ts"],
  ["token-string-coercion.ts", "packages/demo/tests/xaravel/TokenStringCoercion.ts"],
  ["token-string-coercion.ts", "tools/x/TokenStringCoercion.ts"],
  ["token-string-coercion.ts", "conformance/tests/x/TokenStringCoercion.ts"],
  ["token-string-coercion.ts", "skeleton/app/TokenStringCoercion.ts"],
];

xaravelTest(
  "XT-conformance-267",
  "xaravel/no-token-string-coercion, an error in the root .oxlintrc.json and a spine rule, fails a contract token string-coerced in packages/<p>/src/ or installer/src/ (a template-literal substitution, String(token), token.toString(), + with a string or template operand, +=): a PascalCase name imported from @xaravel/contracts or a subpath, a PascalCase member of a namespace import of one, or a const bound to contract(...); fqcn(token) in a template, a tagged template, a camelCase or SCREAMING_CASE import, a type-only import and the same coercions outside package source lint clean, and the repository itself is clean (AD-9.8, AD-16.4)",
  () => {
    // The config, the plugin and the spine list.
    const config = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as { rules: Record<string, unknown> };
    expect(config.rules[`xaravel/${TOKEN_RULE}`]).toBe("error");
    expect(RULE_NAMES.at(-1)).toBe(TOKEN_RULE);
    expect(Object.keys(plugin.rules).at(-1)).toBe(TOKEN_RULE);
    expect(SPINE_RULES.at(-1)).toBe(TOKEN_RULE);

    // The committed fixtures: each failing placement names the rule six times (the five matrix rows and `+=`), each
    // clean placement nothing.
    const dir = tempDir("xaravel-lint-267-");
    for (const placement of TOKEN_FAILING) {
      place(dir, "token-string-coercion.ts", placement);
    }
    for (const [fixture, placement] of TOKEN_CLEAN) {
      place(dir, fixture, placement);
    }
    const run = oxlint(CONFIG, [dir]);
    expect(run.exitCode).toBe(1);
    expect(byFile(run, dir)).toEqual(Object.fromEntries(TOKEN_FAILING.map((placement) => [placement, Array.from({ length: 6 }, () => `xaravel(${TOKEN_RULE})`)])));
    const lines = run.output.split("\n").filter((text) => text.endsWith(`[Error/xaravel(${TOKEN_RULE})]`));
    expect(lines).toHaveLength(18);
    for (const line of lines) {
      expect(line).toContain("(AD-9.8)");
      expect(line).toContain("fqcn(");
    }
    expect(lines.filter((line) => line.includes("the contract token `support.Arrayable`"))).toHaveLength(3);
    expect(lines.filter((line) => line.includes("the contract token `Local`"))).toHaveLength(3);

    // The spellings and near-misses, one file each, with the exact diagnostics.
    const x = (count = 1): string[] => Array.from({ length: count }, () => `xaravel(${TOKEN_RULE})`);
    const head = '// @ts-expect-error TS2307\nimport { Arrayable, Jsonable as J, contract as make, CLASS_FQCN, canonicalToken } from "@xaravel/contracts";\n';
    const ns = '// @ts-expect-error TS2307\nimport * as support from "@xaravel/contracts/support";\n';
    const cases: Readonly<Record<string, readonly [string, readonly string[]]>> = {
      "packages/demo/src/Template.ts": [`${head}export const s = \`a \${Arrayable} b\`;\n`, x()],
      "packages/demo/src/Alias.ts": [`${head}export const s = \`\${J}\`;\n`, x()],
      "packages/demo/src/Wrapped.ts": [`${head}export const s = \`\${(Arrayable as object)!}\`;\n`, x()],
      "packages/demo/src/StringCall.ts": [`${head}export const s = String(Arrayable);\n`, x()],
      "packages/demo/src/ToString.ts": [`${head}export const s: string = Arrayable.toString();\n`, x()],
      "packages/demo/src/PlusLeft.ts": [`${head}export const s = Arrayable + "x";\n`, x()],
      "packages/demo/src/PlusTemplate.ts": [`${head}export const s = \`x\` + Arrayable;\n`, x()],
      "packages/demo/src/PlusChain.ts": [`${head}export const f = (n: number): string => n + "x" + Arrayable;\n`, x()],
      "packages/demo/src/PlusAssign.ts": [`${head}export function f(): string {\n  let s = "x";\n  s += Arrayable;\n  return s;\n}\n`, x()],
      "packages/demo/src/Namespace.ts": [`${ns}export const s = [\`\${support.Arrayable}\`, String(support.Jsonable)];\n`, x(2)],
      "packages/demo/src/MadeConst.ts": [`${head}export function f(): string {\n  return \`\${Later}\`;\n}\nconst Later = make("App\\\\Later");\n`, x()],
      "packages/demo/src/MadeNs.ts": [`${ns.replace("support", "contracts").replace("/support", "")}const T = contracts.contract("App\\\\T");\nexport const s = String(T);\n`, x()],
      // Near-misses: fqcn(), a tagged template, camelCase and SCREAMING_CASE imports, a type-only import, a `let`, a
      // computed namespace member, another module, a number `+`, comparisons.
      "packages/demo/src/Fqcn.ts": [`${head}declare function fqcn(v: object): string;\nexport const s = \`\${fqcn(Arrayable)}\` + fqcn(J);\n`, []],
      "packages/demo/src/Tagged.ts": [`${head}declare function tag(s: TemplateStringsArray, ...v: unknown[]): string;\nexport const s = tag\`\${Arrayable}\`;\n`, []],
      "packages/demo/src/Camel.ts": [`${head}export const s = [\`\${canonicalToken}\`, \`\${CLASS_FQCN}\`];\n`, []],
      "packages/demo/src/TypeOnly.ts": ['// @ts-expect-error TS2307\nimport type { Arrayable } from "@xaravel/contracts";\nexport type S = `${Arrayable & string}`;\n', []],
      "packages/demo/src/Let.ts": [`${head}let L = make("App\\\\L");\nL = make("App\\\\M");\nexport const s = String(L);\n`, []],
      "packages/demo/src/Computed.ts": [`${ns}export const s = \`\${support["Arrayable"]}\`;\n`, []],
      "packages/demo/src/Other.ts": ['// @ts-expect-error TS2307\nimport { Arrayable } from "@xaravel/contractsx";\nexport const s = `${Arrayable}`;\n', []],
      "packages/demo/src/Compare.ts": [`${head}export const s = Arrayable === J ? 1 + 2 : 3;\n`, []],
      "packages/demo/tests/InTests.ts": [`${head}export const s = \`\${Arrayable}\`;\n`, []],
      "tools/x/InTools.ts": [`${head}export const s = String(Arrayable);\n`, []],
    };
    const edge = tempDir("xaravel-lint-267-edge-");
    write(edge, Object.fromEntries(Object.entries(cases).map(([path, [text]]) => [path, text])));
    const edgeRun = oxlint(CONFIG, [edge]);
    const found = byFile(edgeRun, edge);
    const actual = Object.fromEntries(Object.keys(cases).map((path) => [path, (found[path] ?? []).filter((rule) => rule.startsWith("xaravel("))]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(cases).map(([path, [, rules]]) => [path, [...rules]])));

    // The repository's own package source is clean under the rule.
    const repo = oxlint(CONFIG, ["packages", "installer"]);
    expect(repo.diagnostics.filter(([, rule]) => rule === `xaravel(${TOKEN_RULE})`)).toEqual([]);
  },
  120_000,
);
