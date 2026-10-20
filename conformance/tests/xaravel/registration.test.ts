// Xaravel Tests for Story 6.6 (the duplicate-FQCN and registration scan:
// `tools/registration/registration.ts`, `bun run registration:check`, and the
// `ci.yml#check` step that runs it; AD-10, AD-22).
//
// The CLI runs for real over hermetic temp git roots (`--root`) and over the
// real repository, which is only read. The I/O matrix's edge cases also run
// through the pure `scanRegistrations` over inline sources.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ALIAS_MESSAGE, formatViolation, graderPackages, NESTED_MESSAGE, scanRegistrations, SHAPE_MESSAGE, type ScanFile } from "../../../tools/registration/registration";
import { GRADER_PACKAGES } from "../../../tools/lint-rules/plugin";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const TOOL = join(root, "tools", "registration", "registration.ts");
const NONE: ReadonlySet<string> = new Set();
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A temp git root holding `files`. */
function gitRoot(files: Readonly<Record<string, string>>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "xaravel-registration-")));
  dirs.push(dir);
  expect(Bun.spawnSync(["git", "init", "-q", "."], { cwd: dir }).exitCode).toBe(0);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(args: readonly string[]): Run {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", TOOL, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** The stderr lines of a run over a temp root holding `files`. */
function failing(files: Readonly<Record<string, string>>): string[] {
  const run = cli(["--root", gitRoot(files)]);
  expect(run.stdout).toBe("");
  expect(run.exitCode).toBe(1);
  return run.stderr.trimEnd().split("\n");
}

function passing(files: Readonly<Record<string, string>>): string {
  const run = cli(["--root", gitRoot(files)]);
  expect(run.stderr).toBe("");
  expect(run.exitCode).toBe(0);
  return run.stdout;
}

/** The formatted violations of inline files through the pure scan. */
function scan(files: Readonly<Record<string, string>>, graders: ReadonlySet<string> = NONE): string[] {
  const list: ScanFile[] = Object.entries(files).map(([path, text]) => ({ path, text }));
  return scanRegistrations(list, graders).violations.map(formatViolation);
}

/** The real repository passes the real CLI. */
function realRepositoryPasses(): void {
  const run = cli([]);
  expect(run.stderr).toBe("");
  expect(run.exitCode).toBe(0);
  expect(run.stdout).toMatch(/^registration: ok \(\d+ files, \d+ registrations\)\n$/);
}

const FOO = "import { registerClass } from '@xaravel/runtime/registry';\nexport class Foo {}\nregisterClass('A\\\\Foo', Foo);\n";

// XT-conformance-140

xaravelTest("XT-conformance-140", "an FQCN passed to registerClass in two packages (or twice in one) fails the scan of every packages/*/src at each later site, naming the first site and both packages; the real repository passes (AD-22)", () => {
  // Clean: one registration.
  expect(passing({ "packages/a/src/Foo.ts": FOO })).toBe("registration: ok (1 files, 1 registrations)\n");

  // Across packages: the violation is at b, naming a's site and both packages.
  expect(failing({ "packages/a/src/Foo.ts": FOO, "packages/b/src/Foo.ts": FOO })).toEqual([
    "packages/b/src/Foo.ts:3:1: A\\Foo is already registered in packages/a/src/Foo.ts:3 (package a); registered again here (package b) (AD-22)",
  ]);

  // Within one package: at the second file.
  expect(failing({ "packages/a/src/Foo.ts": FOO, "packages/a/src/Sub/Foo.ts": FOO })).toEqual([
    "packages/a/src/Sub/Foo.ts:3:1: A\\Foo is already registered in packages/a/src/Foo.ts:3 (package a); registered again here (package a) (AD-22)",
  ]);

  // Three sites: one violation at each after the first, by path then line; grader packages are checked too.
  const twice = "export class Foo {}\nexport class Bar {}\nregisterClass('A\\\\Foo', Foo);\nregisterClass('A\\\\Foo', Bar);\n";
  expect(scan({ "packages/b/src/X.ts": twice, "packages/assert/src/Foo.ts": FOO }, new Set(["assert"]))).toEqual([
    "packages/b/src/X.ts:3:1: A\\Foo is already registered in packages/assert/src/Foo.ts:3 (package assert); registered again here (package b) (AD-22)",
    "packages/b/src/X.ts:4:1: A\\Foo is already registered in packages/assert/src/Foo.ts:3 (package assert); registered again here (package b) (AD-22)",
  ]);

  // PHP class names are case-insensitive and the leading `\` optional; the message names the literal FQCN.
  expect(scan({ "packages/a/src/Foo.ts": FOO, "packages/b/src/Foo.ts": FOO.replace("'A\\\\Foo'", "'\\\\A\\\\Foo'"), "packages/c/src/Foo.ts": FOO.replace("A\\\\Foo", "a\\\\foo") })).toEqual([
    "packages/b/src/Foo.ts:3:1: \\A\\Foo is already registered in packages/a/src/Foo.ts:3 (package a); registered again here (package b) (AD-22)",
    "packages/c/src/Foo.ts:3:1: a\\foo is already registered in packages/a/src/Foo.ts:3 (package a); registered again here (package c) (AD-22)",
  ]);

  // Distinct FQCNs pass; a non-conforming call is never a registration, so it is not a duplicate.
  expect(scan({ "packages/a/src/Foo.ts": FOO, "packages/b/src/Foo.ts": FOO.replace("A\\\\Foo", "B\\\\Foo") })).toEqual([]);
  expect(scan({ "packages/a/src/Foo.ts": FOO, "packages/b/src/Foo.ts": "export class Foo {}\nregisterClass(`A\\\\Foo`, Foo);\n" })).toEqual([
    "packages/b/src/Foo.ts:1:8: exports class Foo but does not end with registerClass('<FQCN>', Foo) (AD-10)",
    `packages/b/src/Foo.ts:2:1: ${SHAPE_MESSAGE} (AD-10)`,
  ]);

  realRepositoryPasses();
}, 60_000);

// XT-conformance-141

xaravelTest("XT-conformance-141", "a framework file in packages/*/src that exports a public class but does not end with registerClass('<FQCN>', X) fails naming the file, line and class; grader packages are exempt; malformed calls and unparseable files fail (AD-10)", () => {
  const MISSING = (cls: string): string => `exports class ${cls} but does not end with registerClass('<FQCN>', ${cls})`;

  // Missing registration, not last, a local export list, a bad call and a parse error, through the CLI.
  expect(
    failing({
      "packages/a/src/Bar.ts": "export class Bar {}\n",
      "packages/a/src/Late.ts": "export class Bar {}\nregisterClass('A\\\\Bar', Bar);\nexport const x = 1;\n",
      "packages/a/src/Local.ts": "class C {}\nexport { C };\n",
      "packages/a/src/Bad.ts": "const name = 'A\\\\Foo';\nexport class Foo {}\nregisterClass(name, Foo);\n",
      "packages/a/src/Broken.ts": "export class {\n",
    }),
  ).toEqual([
    `packages/a/src/Bad.ts:2:8: ${MISSING("Foo")} (AD-10)`,
    `packages/a/src/Bad.ts:3:1: ${SHAPE_MESSAGE} (AD-10)`,
    `packages/a/src/Bar.ts:1:8: ${MISSING("Bar")} (AD-10)`,
    "packages/a/src/Broken.ts:2:1: does not parse: Expected `}` but found `EOF` (AD-10)",
    `packages/a/src/Late.ts:1:8: ${MISSING("Bar")} (AD-10)`,
    `packages/a/src/Local.ts:1:1: ${MISSING("C")} (AD-10)`,
  ]);

  // Passing shapes through the CLI: two classes, a grader package, interfaces, `.d.ts` and tests.
  const table = [
    JSON.stringify({ name: "a", dir: "packages/a", kind: "upstream" }),
    JSON.stringify({ name: "assert", dir: "packages/assert", kind: "grader" }),
    JSON.stringify({ name: "boost-framework", dir: "tools/boost-framework", kind: "grader" }),
    "",
  ].join("\n");
  expect(
    passing({
      "tools/scaffold/packages.jsonl": table,
      "packages/a/src/Two.ts": "export class A {}\nexport abstract class B {}\nregisterClass('A\\\\A', A);\nregisterClass('A\\\\B', B);\n",
      "packages/a/src/I.ts": "export interface I {}\nexport type T = string;\nexport declare class D {}\nexport { Other } from './Other';\n",
      "packages/a/src/x.d.ts": "export declare class X {}\n",
      "packages/a/tests/X.ts": "export class X {}\n",
      "packages/assert/src/X.ts": "export class X {}\n",
    }),
  ).toBe("registration: ok (3 files, 2 registrations)\n");
  const repoGraders = graderPackages(root);
  expect([...repoGraders].sort()).toEqual(["assert", "mockery"]);
  // The scan's grader set is lint's.
  expect(repoGraders).toEqual(new Set(GRADER_PACKAGES));
  expect(graderPackages(gitRoot({}))).toEqual(new Set());

  // The matrix through the pure scan.
  const at = (path: string, text: string, graders: ReadonlySet<string> = NONE): string[] => scan({ [path]: text }, graders);
  const P = "packages/a/src/F.ts";
  expect(at(P, "export class Foo {}\nregisterClass('A\\\\Foo', Foo);\n")).toEqual([]);
  expect(at(P, "export class Foo {}\nregisterClass('A\\\\Foo', Foo);\n// trailing comment\n")).toEqual([]);
  expect(at(P, "export class A {}\nexport class B {}\nregisterClass('A\\\\B', B);\nregisterClass('A\\\\A', A);\n")).toEqual([]);
  expect(at(P, "export class A {}\nexport class B {}\nregisterClass('A\\\\A', A);\nconsole.log(1);\nregisterClass('A\\\\B', B);\n")).toEqual([`${P}:1:8: ${MISSING("A")} (AD-10)`]);
  expect(at(P, "class C {}\nexport { C as D };\n")).toEqual([`${P}:1:1: ${MISSING("C")} (AD-10)`]);
  expect(at(P, "class C {}\nexport { C as D };\nregisterClass('A\\\\C', C);\n")).toEqual([]);
  expect(at(P, "class C {}\nexport type { C };\n")).toEqual([]);
  expect(at(P, "class Hidden {}\nexport const h = new Hidden();\n")).toEqual([]);
  expect(at(P, "export default class Def {}\n")).toEqual([`${P}:1:16: ${MISSING("Def")} (AD-10)`]);
  expect(at(P, "export default class Def {}\nregisterClass('A\\\\Def', Def);\n")).toEqual([]);
  expect(at(P, "class C {}\nexport default C;\n")).toEqual([`${P}:1:1: ${MISSING("C")} (AD-10)`]);
  expect(at(P, "class C {}\nexport default C;\nregisterClass('A\\\\C', C);\n")).toEqual([]);
  expect(at(P, "export default class {}\n")).toEqual([`${P}:1:16: exports an anonymous default class, which cannot be registered; name it and end the file with registerClass('<FQCN>', <Name>) (AD-10)`]);
  expect(at(P, "export class Foo {}\nregisterClass('A\\\\Foo', Foo);;\n;\n")).toEqual([]);
  expect(at(P, "export abstract class Abs {}\n")).toEqual([`${P}:1:8: ${MISSING("Abs")} (AD-10)`]);
  expect(at(P, "export declare class D {}\ndeclare class E {}\nexport { E };\n")).toEqual([]);
  expect(at(P, "export interface I {}\nexport type T = 1;\nexport enum E { A }\nexport function f(): void {}\n")).toEqual([]);
  expect(at(P, "export { X } from './X';\nexport * from './Y';\n")).toEqual([]);
  expect(at(P, "export class Foo {}\nregisterClass('A\\\\Foo', Foo);\n", new Set(["a"]))).toEqual([]);
  expect(at(P, "export class Foo {}\n", new Set(["a"]))).toEqual([]);
  expect(at("packages/assert/src/X.ts", "export class X {}\n", new Set(["assert"]))).toEqual([]);
  expect(at("packages/assert/src/X.ts", "export class X {}\nregisterClass(x, X);\n", new Set(["assert"]))).toEqual([`packages/assert/src/X.ts:2:1: ${SHAPE_MESSAGE} (AD-10)`]);
  // Every non-conforming shape; a call of another name and member-expression calls are outside the scan.
  for (const call of ["registerClass(name, Foo)", "registerClass('', Foo)", "registerClass('A/Foo', Foo)", "registerClass('A\\\\\\\\Foo', Foo)", "registerClass(' A\\\\Foo', Foo)", "registerClass('A\\\\', Foo)", "registerClass(`A\\\\Foo`, Foo)", "registerClass('A\\\\Foo')", "registerClass('A\\\\Foo', Foo, 1)", "registerClass('A\\\\Foo', new Foo())", "registerClass(1, Foo)", "registerClass(...args)"]) {
    expect(at(P, `export class Foo {}\n${call};\n`)).toEqual([`${P}:1:8: ${MISSING("Foo")} (AD-10)`, `${P}:2:1: ${SHAPE_MESSAGE} (AD-10)`]);
  }
  expect(at(P, "export class Foo {}\nr('A\\\\Foo', Foo);\n")).toEqual([`${P}:1:8: ${MISSING("Foo")} (AD-10)`]);
  expect(at(P, "export class Foo {}\nregistry.registerClass('A\\\\Foo', Foo);\n")).toEqual([`${P}:1:8: ${MISSING("Foo")} (AD-10)`]);
  expect(at(P, "export function f(): void {\n  registerClass(x, y);\n}\n")).toEqual([`${P}:2:3: ${NESTED_MESSAGE} (AD-10)`]);
  // Nested calls (a block, a function, a namespace, an arrow) fail at the call and are not registrations.
  const count = (text: string, path: string = P): number => scanRegistrations([{ path, text }], NONE).registrations;
  for (const [text, col] of [
    ["if (x) { registerClass('A\\\\Foo', Foo); }\n", "1:10"],
    ["function f(): void {\n  registerClass('A\\\\Foo', Foo);\n}\n", "2:3"],
    ["namespace N {\n  registerClass('A\\\\Foo', Foo);\n}\n", "2:3"],
    ["const f = (): void => registerClass('A\\\\Foo', Foo);\n", "1:23"],
    // Wrapped top-level calls.
    ["void registerClass('A\\\\Foo', Foo);\n", "1:6"],
    ["(registerClass('A\\\\Foo', Foo));\n", "1:2"],
    ["registerClass?.('A\\\\Foo', Foo);\n", "1:1"],
    ["registerClass!('A\\\\Foo', Foo);\n", "1:1"],
    ["(registerClass)('A\\\\Foo', Foo);\n", "1:1"],
    ["x, registerClass('A\\\\Foo', Foo);\n", "1:4"],
    ["registerClass`A\\\\Foo`;\n", "1:1"],
    // Sequence callees, .call / .apply at any level, and new.
    ["(0, registerClass)('A\\\\Foo', Foo);\n", "1:1"],
    ["registerClass.call(null, 'A\\\\Foo', Foo);\n", "1:1"],
    ["registerClass.apply(null, ['A\\\\Foo', Foo]);\n", "1:1"],
    ["function f(): void {\n  registerClass.call(null, 'A\\\\Foo', Foo);\n}\n", "2:3"],
    ["new registerClass('A\\\\Foo', Foo);\n", "1:1"],
  ] as const) {
    expect(at(P, text)).toEqual([`${P}:${col}: ${NESTED_MESSAGE} (AD-10)`]);
    expect(count(text)).toBe(0);
    // Graders stay subject to it.
    expect(at("packages/assert/src/X.ts", text, new Set(["assert"]))).toEqual([`packages/assert/src/X.ts:${col}: ${NESTED_MESSAGE} (AD-10)`]);
  }
  // A wrapped call does not end the file with a registration, and is not a duplicate of a real one.
  expect(at(P, "export class Foo {}\nvoid registerClass('A\\\\Foo', Foo);\n")).toEqual([`${P}:1:8: ${MISSING("Foo")} (AD-10)`, `${P}:2:6: ${NESTED_MESSAGE} (AD-10)`]);
  expect(scan({ "packages/a/src/Foo.ts": FOO, "packages/b/src/Foo.ts": "if (x) {\n  registerClass('A\\\\Foo', Foo);\n}\n" })).toEqual([`packages/b/src/Foo.ts:2:3: ${NESTED_MESSAGE} (AD-10)`]);
  // Aliasing registerClass fails at the specifier, declarator, destructure or assignment.
  expect(at(P, "import { registerClass as r } from '@xaravel/runtime/registry';\n")).toEqual([`${P}:1:10: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "const r = registerClass;\n")).toEqual([`${P}:1:7: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "const r = registerClass as typeof registerClass;\n")).toEqual([`${P}:1:7: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "let r;\nr = registerClass;\n")).toEqual([`${P}:2:1: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "const { registerClass: r } = registry;\n")).toEqual([`${P}:1:9: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "import { registerClass } from '@xaravel/runtime/registry';\nexport { registerClass as r };\n")).toEqual([`${P}:2:10: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "export { registerClass as r } from '@xaravel/runtime/registry';\n")).toEqual([`${P}:1:10: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "export { registerClass } from '@xaravel/runtime/registry';\n")).toEqual([]);
  expect(at(P, "import { registerClass } from '@xaravel/runtime/registry';\nconst { registerClass: registerClass2 = registerClass } = registry;\n")).toEqual([`${P}:2:9: ${ALIAS_MESSAGE} (AD-10)`]);
  expect(at(P, "import { registerClass } from '@xaravel/runtime/registry';\nexport class Foo {}\nregisterClass('A\\\\Foo', Foo);\n")).toEqual([]);
  // Class expressions bound by an exported (or locally exported) const/let/var are exported classes, reported at the declarator.
  for (const init of ["class {}", "class Y {}", "(class {})", "class {} as typeof Base", "class {} satisfies object"]) {
    expect(at(P, `export const X = ${init};\n`)).toEqual([`${P}:1:14: ${MISSING("X")} (AD-10)`]);
    expect(at(P, `export const X = ${init};\nregisterClass('A\\\\X', X);\n`)).toEqual([]);
  }
  expect(at(P, "export let X = class {}, y = 1;\n")).toEqual([`${P}:1:12: ${MISSING("X")} (AD-10)`]);
  expect(at(P, "const X = class {};\nexport { X };\n")).toEqual([`${P}:1:7: ${MISSING("X")} (AD-10)`]);
  expect(at(P, "var X = class {};\nexport { X as Z };\nregisterClass('A\\\\X', X);\n")).toEqual([]);
  expect(at(P, "const X = class {};\nexport default X;\n")).toEqual([`${P}:1:7: ${MISSING("X")} (AD-10)`]);
  expect(at(P, "const X = class {};\nexport default (X);\n")).toEqual([`${P}:1:7: ${MISSING("X")} (AD-10)`]);
  expect(at(P, "class X {}\nexport default (X);\n")).toEqual([`${P}:1:1: ${MISSING("X")} (AD-10)`]);
  expect(at(P, "class X {}\nexport default (X);\nregisterClass('A\\\\X', X);\n")).toEqual([]);
  expect(at(P, "const X = class {};\nexport const x = new X();\n")).toEqual([]);
  expect(at(P, "export const X = class {};\n", new Set(["a"]))).toEqual([]);
  // A default-exported class expression cannot be registered.
  expect(at(P, "export default (class {});\n")).toEqual([`${P}:1:17: exports an anonymous default class, which cannot be registered; name it and end the file with registerClass('<FQCN>', <Name>) (AD-10)`]);
  // Extensions: .tsx, .mts and .cts are scanned; declaration files, tests and other directories are not.
  for (const path of ["packages/a/src/F.tsx", "packages/a/src/F.mts", "packages/a/src/F.cts"]) {
    expect(at(path, "export class F {}\n")).toEqual([`${path}:1:8: ${MISSING("F")} (AD-10)`]);
  }
  for (const path of ["packages/a/src/F.d.ts", "packages/a/src/F.d.mts", "packages/a/tests/F.ts", "packages/a/F.ts", "tools/x/src/F.ts", "packages/a/src/F.js"]) {
    expect(at(path, "export class F {}\n")).toEqual([]);
  }
  expect(at(P, "export class {\n")).toEqual([`${P}:2:1: does not parse: Expected \`}\` but found \`EOF\` (AD-10)`]);
  // Positions are UTF-16 columns.
  expect(at(P, "/* é */ export class Foo {}\n")).toEqual([`${P}:1:16: ${MISSING("Foo")} (AD-10)`]);
  expect(scanRegistrations([{ path: P, text: "export class Foo {}\nregisterClass('A\\\\Foo', Foo);\n" }], NONE)).toEqual({ violations: [], files: 1, registrations: 1 });

  // Usage.
  const usage = cli(["--nope"]);
  expect(usage.exitCode).toBe(2);
  expect(usage.stderr).toBe("Unknown argument: --nope\nUsage: bun --no-env-file tools/registration/registration.ts [--root <dir>]\n");
  expect(cli(["--root"]).exitCode).toBe(2);

  realRepositoryPasses();
}, 60_000);

// XT-conformance-142

xaravelTest("XT-conformance-142", "a package package.json that sets \"sideEffects\": false (or a list) fails the scan at the key; absent or true passes; bun run registration:check is a step of ci.yml's check job (AD-10)", () => {
  const PKG = "packages/a/package.json";
  expect(failing({ [PKG]: '{\n  "name": "@xaravel/a",\n  "sideEffects": false\n}\n' })).toEqual([
    `${PKG}:3:3: sets "sideEffects": false, which lets bundlers drop registerClass side effects (AD-10)`,
  ]);
  expect(failing({ [PKG]: '{\n  "name": "@xaravel/a",\n  "sideEffects": ["./src/a.ts"]\n}\n' })).toEqual([
    `${PKG}:3:3: sets "sideEffects" to a list, which marks every other file side-effect-free (AD-10)`,
  ]);
  expect(passing({ [PKG]: '{\n  "name": "@xaravel/a",\n  "sideEffects": true\n}\n' })).toBe("registration: ok (1 files, 0 registrations)\n");
  expect(passing({ [PKG]: '{ "name": "@xaravel/a" }\n' })).toBe("registration: ok (1 files, 0 registrations)\n");

  // The key is located at the top level, not in a nested object.
  expect(scan({ [PKG]: '{"publishConfig": {"sideEffects": true}, "sideEffects": false}' })).toEqual([
    `${PKG}:1:42: sets "sideEffects": false, which lets bundlers drop registerClass side effects (AD-10)`,
  ]);
  expect(scan({ [PKG]: '{"publishConfig": {"sideEffects": false}}' })).toEqual([]);
  expect(scan({ [PKG]: "{ nope" })).toEqual([expect.stringMatching(/^packages\/a\/package\.json:1:1: is not valid JSON: .+ \(AD-10\)$/)]);
  expect(scan({ [PKG]: "[]" })).toEqual([`${PKG}:1:1: is not a JSON object (AD-10)`]);
  // Only packages/<p>/package.json is read.
  for (const path of ["package.json", "packages/a/src/package.json", "tools/x/package.json"]) {
    expect(scan({ [path]: '{"sideEffects": false}' })).toEqual([]);
  }
  expect(failing({ [PKG]: '{"sideEffects": false}', "packages/a/src/A.ts": "export class A {}\n" })).toEqual([
    "packages/a/package.json:1:2: sets \"sideEffects\": false, which lets bundlers drop registerClass side effects (AD-10)",
    "packages/a/src/A.ts:1:8: exports class A but does not end with registerClass('<FQCN>', A) (AD-10)",
  ]);

  // The real package.json files carry no sideEffects: false.
  for (const line of Bun.spawnSync(["git", "ls-files", "packages/*/package.json"], { cwd: root }).stdout.toString().trim().split("\n")) {
    const pkg = JSON.parse(readFileSync(join(root, line), "utf8")) as { sideEffects?: unknown };
    expect(pkg.sideEffects === undefined || pkg.sideEffects === true).toBe(true);
  }

  // The wiring: the script, and the step in CI's required check job.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["registration:check"]).toBe("bun --no-env-file tools/registration/registration.ts");
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[] };
  expect(tsconfig.include).toContain("tools/registration/*.ts");
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, { steps: { name?: string; run?: string }[] }> };
  expect(ci.jobs["check"]!.steps).toContainEqual({ name: "Check class registration", run: "bun run registration:check" });

  realRepositoryPasses();
}, 60_000);
