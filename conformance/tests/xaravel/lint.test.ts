// Xaravel Tests for Story 6.1, Story 6.6 and Retro 6 item 11 (the type-aware async-safety lint:
// `.oxlintrc.json` and `tools/lint-rules/disables.ts`; NFR-3, AD-6, AD-16,
// AD-28).
//
// oxlint runs for real, from the repository root (it finds oxlint-tsgolint from
// the cwd) with the repository's own `.oxlintrc.json`, over copies of the
// committed fixtures in `tools/lint-rules/fixtures/async-safety/` placed in
// temp roots; `--format unix` because plain oxlint prints nothing on success
// outside a TTY. The disable check runs on hermetic temp git roots and on the
// real repository, which is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkConfig, checkGitignore, comments, findDisables, formatViolation, GITIGNORE_PROBES, ignoreMatches, IGNORE_PROBES, PACKAGE_PROBES, PACKAGE_RULES, parseDirective, RULE_MODES, ruleShortfall, scanSource, SPINE_RULE_OPTIONS, SPINE_RULES } from "../../../tools/lint-rules/disables";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const FIXTURES = join(root, "tools", "lint-rules", "fixtures", "async-safety");
const DISABLES = join(root, "tools", "lint-rules", "disables.ts");
const CONFIG = ".oxlintrc.json";
const FAILING: Readonly<Record<string, string>> = {
  "floating-thenable.ts": "no-floating-promises",
  "await-plain.ts": "await-thenable",
  "misused-void-callback.ts": "no-misused-promises",
};
/** What a nested config under `packages/` must set itself, since it replaces the root's overrides (Retro 6 item 11). */
const PACKAGE_CONFIG_RULES = { "typescript/return-await": ["error", "always"] };
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

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** Copies the builder and the named fixtures into `dir`. */
function placeFixtures(dir: string, names: readonly string[]): void {
  mkdirSync(dir, { recursive: true });
  for (const name of ["builder.ts", ...names]) {
    cpSync(join(FIXTURES, name), join(dir, name));
  }
}

interface LintRun {
  readonly exitCode: number;
  /** `[file, rule]` per diagnostic, rule as `typescript(<name>)` → `<name>`. */
  readonly diagnostics: readonly (readonly [string, string])[];
  readonly output: string;
}

/** `bun --bun oxlint --type-aware -c <config> --format unix <paths>` from the repository root. */
function oxlint(config: string, paths: readonly string[]): LintRun {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", config, "--format", "unix", ...paths], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const diagnostics: [string, string][] = [];
  for (const line of output.split("\n")) {
    const match = /^(.+?):\d+:\d+: .*\[(?:Error|Warning)\/[\w-]+\(([\w-]+)\)\]$/.exec(line);
    if (match !== null) {
      diagnostics.push([match[1]!, match[2]!]);
    }
  }
  return { exitCode: proc.exitCode ?? -1, diagnostics, output };
}

function gitRoot(prefix: string): string {
  const dir = tempDir(prefix);
  const init = Bun.spawnSync(["git", "init", "-q", "."], { cwd: dir });
  expect(init.exitCode).toBe(0);
  cpSync(join(root, CONFIG), join(dir, CONFIG));
  return dir;
}

function gitRootWith(files: Record<string, string>): string {
  const dir = gitRoot("xaravel-lint-131-with-");
  write(dir, files);
  return dir;
}

function runDisables(dir: string): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", DISABLES, "--root", dir], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

// XT-conformance-129

xaravelTest("XT-conformance-129", "the root .oxlintrc.json holds no-floating-promises (checkThenables), await-thenable and no-misused-promises (checksVoidReturn, checksConditionals) as errors for packages/*/src, packages/*/tests, skeleton/ and compiled-view snapshots (NFR-3, AD-6, AD-28.1)", () => {
  // The pinned toolchain.
  const pkg = readJson(join(root, "package.json")) as { devDependencies: Record<string, string> };
  expect(pkg.devDependencies["oxlint"]).toBe("1.88.0");
  expect(pkg.devDependencies["oxlint-tsgolint"]).toBe("7.0.2004");

  // The config: the three rules, top level, with their options; unicorn/no-thenable off (AD-6 thenables).
  const config = readJson(join(root, CONFIG)) as { rules: Record<string, unknown>; ignorePatterns: string[]; overrides?: unknown; jsPlugins: string[] };
  expect(config.rules["typescript/no-floating-promises"]).toEqual(["error", { checkThenables: true }]);
  expect(config.rules["typescript/await-thenable"]).toBe("error");
  expect(config.rules["typescript/no-misused-promises"]).toEqual(["error", { checksVoidReturn: true, checksConditionals: true }]);
  expect(config.rules["unicorn/no-thenable"]).toBe("off");
  // The one override: return-await (always) for framework packages and Ported Tests only (Retro 6 item 11).
  expect(config.overrides).toEqual([{ files: ["packages/**"], rules: { "typescript/return-await": ["error", "always"] } }]);
  expect(config.ignorePatterns).toContain("tools/lint-rules/fixtures/**");
  for (const probe of [...IGNORE_PROBES, "packages/demo/src/Sub/Deep.ts", "skeleton/routes/web.ts"]) {
    expect(config.ignorePatterns.filter((pattern) => ignoreMatches(pattern, probe))).toEqual([]);
  }
  expect(checkConfig(root, CONFIG)).toEqual([]);

  // Each placement fails with each of the three rules.
  const dir = tempDir("xaravel-lint-129-");
  const placements = ["packages/demo/src", "packages/demo/tests", "skeleton", "packages/view/tests/__snapshots__"];
  for (const placement of placements) {
    placeFixtures(join(dir, placement), Object.keys(FAILING));
  }
  const run = oxlint(CONFIG, [dir]);
  expect(run.exitCode).toBe(1);
  for (const placement of placements) {
    for (const [file, rule] of Object.entries(FAILING)) {
      expect(run.diagnostics).toContainEqual([join(dir, placement, file), rule]);
    }
  }
  expect(run.diagnostics.length).toBe(placements.length * 3);

  // The options are load-bearing: without them the floating thenable and the void callback pass.
  const weak = tempDir("xaravel-lint-129-weak-");
  // The full real config (Story 6.2's plugin rules too), its jsPlugins resolved against the repository root.
  const weakConfig = { ...config, jsPlugins: config.jsPlugins.map((plugin) => join(root, plugin)), rules: { ...config.rules, "typescript/no-floating-promises": "error", "typescript/no-misused-promises": ["error", { checksVoidReturn: false }] } };
  writeFileSync(join(weak, CONFIG), JSON.stringify(weakConfig));
  placeFixtures(join(weak, "src"), Object.keys(FAILING));
  const weakRun = oxlint(join(weak, CONFIG), [join(weak, "src")]);
  expect(weakRun.diagnostics.map(([, rule]) => rule)).toEqual(["await-thenable"]);
}, 60_000);

// XT-conformance-130

xaravelTest("XT-conformance-130", "an unawaited thenable builder, await on a plain value and an async callback where void is expected each fail naming exactly their rule; the passing fixture lints clean (NFR-3, AD-6)", () => {
  for (const [file, rule] of Object.entries(FAILING)) {
    const dir = tempDir("xaravel-lint-130-");
    placeFixtures(dir, [file]);
    const run = oxlint(CONFIG, [join(dir, file)]);
    expect(run.exitCode).toBe(1);
    expect(run.diagnostics).toEqual([[join(dir, file), rule]]);
  }
  const dir = tempDir("xaravel-lint-130-pass-");
  placeFixtures(dir, ["passing.ts"]);
  const run = oxlint(CONFIG, [dir]);
  expect(run.diagnostics).toEqual([]);
  expect(run.exitCode).toBe(0);
}, 60_000);

// XT-conformance-131

xaravelTest("XT-conformance-131", "an oxlint-disable of a spine rule, a blanket disable or a config that lowers a spine rule fails bun run lint:disables (chained into CI's bun run lint) naming path:line:col; the real repository passes (AD-16.4, AD-28.1)", () => {
  // The wiring: `lint` chains `lint:disables`, and CI's required `check` job runs `bun run lint`.
  const scripts = (readJson(join(root, "package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["lint"]).toBe("bun --no-env-file --bun oxlint --type-aware && bun --no-env-file run lint:disables");
  expect(scripts["lint:disables"]).toBe("bun --no-env-file tools/lint-rules/disables.ts");
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, { steps: { run?: string }[] }> };
  expect(ci.jobs["check"]!.steps.map((step) => step.run)).toContain("bun run lint");
  expect(SPINE_RULES).toEqual([
    "no-floating-promises",
    "await-thenable",
    "no-misused-promises",
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

  // A named disable: exit 1, path:line:col.
  const named = gitRoot("xaravel-lint-131-named-");
  write(named, { "packages/demo/src/A.ts": "export const a = 1;\n  // oxlint-disable-next-line typescript/no-floating-promises -- reason\nq();\n" });
  const namedRun = runDisables(named);
  expect(namedRun.exitCode).toBe(1);
  expect(namedRun.stderr).toBe("packages/demo/src/A.ts:2:3: `oxlint-disable-next-line` disables no-floating-promises (AD-16)\n");

  // The real repository passes.
  expect(findDisables(root).violations).toEqual([]);
  const real = runDisables(root);
  expect(real.stderr).toBe("");
  expect(real.exitCode).toBe(0);
  expect(real.stdout).toMatch(/^lint disables: ok \(\d+ files\)\n$/);

  // A clean temp root passes; a usage error exits 2.
  const clean = gitRoot("xaravel-lint-131-clean-");
  write(clean, { "src/a.ts": "// oxlint-disable-next-line no-console\nconst s = \"// oxlint-disable\";\n" });
  expect(runDisables(clean).exitCode).toBe(0);
  expect(Bun.spawnSync([process.execPath, "--no-env-file", DISABLES, "--bogus"], { cwd: root }).exitCode).toBe(2);

  directiveCases();
  configCases();
}, 120_000);

// XT-conformance-254

xaravelTest("XT-conformance-254", "no-misused-promises is pinned with checksConditionals: true beside checksVoidReturn: true; a Promise used as a condition fails lint naming no-misused-promises; a config that sets checksConditionals: false fails lint:disables (ESC-6.1-1, NFR-3, AD-6, AD-16.4)", () => {
  // The real config pins both options, and lint:disables requires both.
  const config = readJson(join(root, CONFIG)) as { rules: Record<string, unknown>; jsPlugins: string[] };
  expect(config.rules["typescript/no-misused-promises"]).toEqual(["error", { checksVoidReturn: true, checksConditionals: true }]);
  expect(SPINE_RULE_OPTIONS["no-misused-promises"]).toEqual({ checksVoidReturn: true, checksConditionals: true });

  // The fixture fails with exactly no-misused-promises.
  const dir = tempDir("xaravel-lint-254-");
  placeFixtures(dir, ["misused-conditional.ts"]);
  const run = oxlint(CONFIG, [join(dir, "misused-conditional.ts")]);
  expect(run.exitCode).toBe(1);
  expect(run.diagnostics).toEqual([[join(dir, "misused-conditional.ts"), "no-misused-promises"]]);

  // checksConditionals: false lets the fixture pass oxlint, and fails lint:disables naming the option.
  const weakRules = { ...config.rules, "typescript/no-misused-promises": ["error", { checksVoidReturn: true, checksConditionals: false }] };
  const weak = tempDir("xaravel-lint-254-weak-");
  writeFileSync(join(weak, CONFIG), JSON.stringify({ ...config, jsPlugins: config.jsPlugins.map((plugin) => join(root, plugin)), rules: weakRules }));
  placeFixtures(join(weak, "src"), ["misused-conditional.ts"]);
  const weakRun = oxlint(join(weak, CONFIG), [join(weak, "src")]);
  expect(weakRun.diagnostics).toEqual([]);
  expect(weakRun.exitCode).toBe(0);
  const weakened = gitRoot("xaravel-lint-254-disables-");
  write(weakened, { [CONFIG]: JSON.stringify({ ...config, rules: weakRules }, null, 2), "src/a.ts": "export const a = 1;\n" });
  const disables = runDisables(weakened);
  expect(disables.exitCode).toBe(1);
  expect(disables.stderr).toMatch(/^\.oxlintrc\.json:\d+:\d+: sets no-misused-promises without checksConditionals: true \(AD-16\)\n$/);

  // The real repository passes bun run lint:disables.
  const real = Bun.spawnSync([process.execPath, "run", "lint:disables"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(real.stderr.toString()).not.toContain("AD-16");
  expect(real.exitCode).toBe(0);
  expect(real.stdout.toString()).toMatch(/lint disables: ok \(\d+ files\)\n$/);
}, 60_000);

// XT-conformance-255

xaravelTest("XT-conformance-255", "framework packages and Ported Tests hold typescript/return-await (always), which fails an async function returning a thenable from a call; the Skeleton does not; lint:disables fails a root config, override, nested package config or package directive that drops or weakens it (Retro 6 item 11, NFR-3, AD-6, AD-16.4)", () => {
  // The pins: the root keeps the syntactic rule at the top level for the Skeleton; return-await is package-only.
  const config = readJson(join(root, CONFIG)) as { rules: Record<string, unknown>; jsPlugins: string[]; overrides: unknown[] };
  expect(config.rules["xaravel/no-async-thenable-return"]).toBe("error");
  expect(config.rules["typescript/return-await"]).toBeUndefined();
  expect(config.overrides).toEqual([{ files: ["packages/**"], rules: { "typescript/return-await": ["error", "always"] } }]);
  expect(PACKAGE_RULES).toEqual(["return-await"]);
  expect(RULE_MODES).toEqual({ "return-await": "always" });
  expect(PACKAGE_PROBES).toEqual(["packages/demo/src/Demo.ts", "packages/demo/tests/ported/DemoTest.ts"]);
  expect(checkConfig(root, CONFIG)).toEqual([]);

  // oxlint, with a temp copy of the real config (override globs resolve against the config's directory): the
  // call-result thenable fails exactly return-await in a package and a Ported Test, and passes in the Skeleton.
  const dir = tempDir("xaravel-lint-255-");
  writeFileSync(join(dir, CONFIG), JSON.stringify({ ...config, jsPlugins: config.jsPlugins.map((plugin) => join(root, plugin)) }));
  const placements = ["packages/demo/src", "packages/demo/tests/ported", "skeleton/app"];
  for (const placement of placements) {
    placeFixtures(join(dir, placement), ["return-call-result.ts"]);
  }
  const run = oxlint(join(dir, CONFIG), [dir]);
  expect(run.exitCode).toBe(1);
  // Two per package placement: the annotated `find()` and the unannotated `findAll()`; the awaited `first()` is clean.
  const packageFiles = [join(dir, "packages/demo/src/return-call-result.ts"), join(dir, "packages/demo/tests/ported/return-call-result.ts")];
  expect(run.diagnostics.toSorted(([a], [b]) => a.localeCompare(b))).toEqual(packageFiles.flatMap((file) => [[file, "return-await"], [file, "return-await"]]));
  const fixtureLines = readFileSync(join(FIXTURES, "return-call-result.ts"), "utf8").split("\n");
  const unawaited = fixtureLines.flatMap((line, index) => (line.includes("return this.query();") ? [index + 1] : []));
  expect(unawaited).toHaveLength(2);
  expect(fixtureLines.some((line) => line.includes("return await this.query();"))).toBe(true);
  for (const file of packageFiles) {
    const lines = run.output.split("\n").flatMap((line) => (line.startsWith(`${file}:`) ? [Number(line.slice(file.length + 1).split(":")[0])] : []));
    expect(lines.toSorted((a, b) => a - b)).toEqual(unawaited);
  }
  const skeleton = oxlint(join(dir, CONFIG), [join(dir, "skeleton")]);
  expect(skeleton.diagnostics).toEqual([]);
  expect(skeleton.exitCode).toBe(0);

  // lint:disables on temp git roots.
  const { overrides: _overrides, ...withoutOverride } = config;
  const violationsWith = (files: Record<string, string>): string[] => {
    const temp = gitRoot("xaravel-lint-255-config-");
    write(temp, { "src/a.ts": "export const a = 1;\n", ...files });
    return findDisables(temp).violations.map((violation) => `${violation.path}: ${violation.message}`);
  };
  const rootWith = (rootConfig: Record<string, unknown>): string[] => violationsWith({ [CONFIG]: JSON.stringify(rootConfig, null, 2) });
  expect(violationsWith({})).toEqual([]);

  // Override removed: exit 1, naming each probe.
  const removed = gitRoot("xaravel-lint-255-removed-");
  write(removed, { [CONFIG]: JSON.stringify(withoutOverride, null, 2), "src/a.ts": "export const a = 1;\n" });
  const removedRun = runDisables(removed);
  expect(removedRun.exitCode).toBe(1);
  expect(removedRun.stderr).toBe(PACKAGE_PROBES.map((probe) => `.oxlintrc.json:1:1: does not set return-await (a spine rule must be "error") for ${probe} (AD-16)\n`).join(""));

  // Wrong mode, and a bare severity.
  const mode = (setting: unknown): Record<string, unknown> => ({ ...config, overrides: [{ files: ["packages/**"], rules: { "typescript/return-await": setting } }] });
  for (const setting of [["error", "in-try-catch"], "error", ["error"]]) {
    expect(rootWith(mode(setting))).toEqual([
      ...PACKAGE_PROBES.map((probe) => `.oxlintrc.json: sets return-await without "always" for ${probe}`),
      '.oxlintrc.json: overrides[0] sets return-await without "always"',
    ]);
  }
  expect(rootWith(mode(["warn", "always"]))).toEqual([
    ...PACKAGE_PROBES.map((probe) => `.oxlintrc.json: sets return-await to "warn" (a spine rule must be "error") for ${probe}`),
    '.oxlintrc.json: overrides[0] sets return-await to "warn" (a spine rule must be "error")',
  ]);
  expect(ruleShortfall("return-await", ["error", "always"])).toBeNull();
  expect(ruleShortfall("return-await", ["deny", "always"])).toBeNull();

  // An override that does not reach the probes does not count; a later one that lowers it does.
  expect(rootWith({ ...config, overrides: [{ files: ["skeleton/**"], rules: { "typescript/return-await": ["error", "always"] } }] })).toEqual(
    PACKAGE_PROBES.map((probe) => `.oxlintrc.json: does not set return-await (a spine rule must be "error") for ${probe}`),
  );
  const lowered = gitRoot("xaravel-lint-255-lowered-");
  write(lowered, { [CONFIG]: JSON.stringify({ ...config, overrides: [...config.overrides, { files: ["packages/demo/**"], rules: { "typescript/return-await": "off" } }] }, null, 2), "src/a.ts": "export const a = 1;\n" });
  const loweredRun = runDisables(lowered);
  expect(loweredRun.exitCode).toBe(1);
  expect(loweredRun.stderr.trim().split("\n").map((line) => line.replace(/^\.oxlintrc\.json:\d+:\d+: /, ""))).toEqual([
    ...PACKAGE_PROBES.map((probe) => `sets return-await to "off" (a spine rule must be "error") for ${probe} (AD-16)`),
    'overrides[1] sets return-await to "off" (a spine rule must be "error") (AD-16)',
  ]);
  // One that lowers it only for one probe names only that probe; top-level settings count before overrides.
  expect(rootWith({ ...config, overrides: [...config.overrides, { files: ["packages/*/tests/ported/**"], rules: { "@typescript-eslint/return-await": ["error", "never"] } }] })).toEqual([
    '.oxlintrc.json: sets return-await without "always" for packages/demo/tests/ported/DemoTest.ts',
    '.oxlintrc.json: overrides[1] sets return-await without "always"',
  ]);
  expect(rootWith({ ...withoutOverride, rules: { ...config.rules, "typescript/return-await": ["error", "always"] } })).toEqual([]);
  // A narrowed override passes the probes but not the listed package paths it misses: the first one is named.
  const narrowed = (files: string[], listed: string): string[] => {
    const temp = gitRoot("xaravel-lint-255-narrowed-");
    writeFileSync(join(temp, CONFIG), JSON.stringify({ ...config, overrides: [{ files, rules: { "typescript/return-await": ["error", "always"] } }] }, null, 2));
    return checkConfig(temp, CONFIG, [...PACKAGE_PROBES, "skeleton/app/Demo.ts", listed]).map((violation) => violation.message);
  };
  expect(narrowed(["packages/demo/**"], "packages/other/src/B.ts")).toEqual(['does not set return-await (a spine rule must be "error") for packages/other/src/B.ts']);
  expect(narrowed(["packages/**/*.ts"], "packages/demo/src/C.tsx")).toEqual(['does not set return-await (a spine rule must be "error") for packages/demo/src/C.tsx']);
  expect(narrowed(["packages/**"], "packages/other/src/B.ts")).toEqual([]);
  // Through findDisables the protected paths include the fixed probes, so the first a narrowed glob misses is named.
  expect(violationsWith({ "packages/other/src/B.ts": "export const b = 1;\n", [CONFIG]: JSON.stringify({ ...config, overrides: [{ files: ["packages/demo/**"], rules: { "typescript/return-await": ["error", "always"] } }] }) })).toEqual([
    '.oxlintrc.json: does not set return-await (a spine rule must be "error") for packages/view/tests/__snapshots__/demo.ts',
  ]);
  expect(violationsWith({ "packages/demo/src/C.tsx": "export const c = 1;\n", [CONFIG]: JSON.stringify({ ...config, overrides: [{ files: ["packages/**/*.ts"], rules: { "typescript/return-await": ["error", "always"] } }] }) })).toEqual([
    '.oxlintrc.json: does not set return-await (a spine rule must be "error") for packages/demo/src/Demo.tsx',
  ]);

  // The Skeleton-only and tools-only overrides of a different rule are untouched.
  expect(rootWith({ ...config, overrides: [...config.overrides, { files: ["tools/**"], rules: { "no-console": "off" } }] })).toEqual([]);

  // Nested package configs: one without the rule fails, even when it extends the root (whose override it replaces).
  // A copy of the root config placed there drops it too: `packages/**` in the copy resolves against `packages/demo/`.
  for (const nested of [{ extends: ["../../.oxlintrc.json"] }, config]) {
    expect(violationsWith({ "packages/demo/src/A.ts": "export const a = 1;\n", "packages/demo/.oxlintrc.json": JSON.stringify(nested) })).toEqual([
      'packages/demo/.oxlintrc.json: does not set return-await (a spine rule must be "error")',
    ]);
  }
  expect(violationsWith({ "packages/demo/.oxlintrc.json": JSON.stringify({ extends: ["../../.oxlintrc.json"], rules: PACKAGE_CONFIG_RULES }) })).toEqual([]);
  expect(violationsWith({ "packages/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"] }) })).toEqual(['packages/.oxlintrc.json: does not set return-await (a spine rule must be "error")']);
  expect(violationsWith({ "packages/demo/.oxlintrc.json": JSON.stringify({ extends: ["../../.oxlintrc.json"], rules: { "typescript/return-await": ["error", "in-try-catch"] } }) })).toEqual([
    'packages/demo/.oxlintrc.json: sets return-await without "always"',
  ]);
  expect(violationsWith({ "skeleton/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"] }), "tools/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"] }) })).toEqual([]);
  expect(violationsWith({ "skeleton/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"], overrides: [{ files: ["**"], rules: { "typescript/return-await": "off" } }] }) })).toEqual([
    'skeleton/.oxlintrc.json: overrides[0] sets return-await to "off" (a spine rule must be "error")',
  ]);

  // Directives: in a package file a return-await disable fails; outside packages it does not.
  const directive = "export const a = 1;\n// oxlint-disable-next-line typescript/return-await\n";
  const directives = gitRoot("xaravel-lint-255-directive-");
  write(directives, { "packages/demo/src/A.ts": directive, "tools/a.ts": directive, "skeleton/app/a.ts": directive, "conformance/a.ts": directive });
  const directiveRun = runDisables(directives);
  expect(directiveRun.exitCode).toBe(1);
  expect(directiveRun.stderr).toBe("packages/demo/src/A.ts:2:1: `oxlint-disable-next-line` disables return-await (AD-16)\n");
  expect(scanSource("packages/demo/tests/ported/T.ts", "/* eslint-disable @typescript-eslint/return-await */\n").map((violation) => violation.message)).toEqual(["`eslint-disable` disables return-await"]);
  expect(scanSource("packages/demo/src/A.ts", "/* oxlint-disable */\n").map((violation) => violation.message)).toEqual([
    `\`oxlint-disable\` with no rule list disables every rule, including ${[...SPINE_RULES, ...PACKAGE_RULES].join(", ")}`,
  ]);
  expect(scanSource("conformance/packages/demo/src/A.ts", directive)).toEqual([]);
  expect(scanSource("tools/a.ts", directive)).toEqual([]);
  // A file directly under packages/ is covered by the packages/** override, so its directive counts.
  expect(scanSource("packages/index.ts", directive).map((violation) => violation.message)).toEqual(["`oxlint-disable-next-line` disables return-await"]);

  // The real repository passes bun run lint:disables.
  const real = runDisables(root);
  expect(real.stderr).toBe("");
  expect(real.exitCode).toBe(0);
  expect(real.stdout).toMatch(/^lint disables: ok \(\d+ files\)\n$/);
}, 120_000);

/** Disable directives: spellings, rule-name forms, blanket disables and descriptions; directives in strings, templates and regexes do not count. */
function directiveCases(): void {
  const rules = (source: string): string[] => scanSource("f.ts", source).map((violation) => violation.message);
  expect(rules("// oxlint-disable-next-line typescript/no-floating-promises\n")).toEqual(["`oxlint-disable-next-line` disables no-floating-promises"]);
  expect(rules("x(); // eslint-disable-line @typescript-eslint/await-thenable\n")).toEqual(["`eslint-disable-line` disables await-thenable"]);
  expect(rules("/* oxlint-disable no-console, no-misused-promises */\n")).toEqual(["`oxlint-disable` disables no-misused-promises"]);
  expect(rules("/* eslint-disable */\n")).toEqual([`\`eslint-disable\` with no rule list disables every rule, including ${SPINE_RULES.join(", ")}`]);
  expect(rules("// oxlint-disable -- no reason given\n")).toEqual([`\`oxlint-disable\` with no rule list disables every rule, including ${SPINE_RULES.join(", ")}`]);
  expect(rules("// oxlint-disable-next-line no-console -- no-floating-promises in the description only\n")).toEqual([]);
  expect(rules("// oxlint-disable-next-line no-console\n")).toEqual([]);
  expect(rules("// oxlint-enable no-floating-promises\n// see oxlint-disable no-floating-promises\n// oxlint-disabled\n")).toEqual([]);
  expect(rules('const s = "// oxlint-disable";\nconst t = \'/* eslint-disable */\';\n')).toEqual([]);
  expect(rules("const u = `// oxlint-disable ${`/* eslint-disable */`} ${{ a: 1 }.a}`;\n")).toEqual([]);
  expect(rules("const r = /\\/\\/ oxlint-disable[/]/.test(x);\nconst d = a / b; // oxlint-disable-line no-floating-promises\n")).toEqual(["`oxlint-disable-line` disables no-floating-promises"]);
  expect(rules("const v = `${'`'}`; /* oxlint-disable */\n")).toEqual([`\`oxlint-disable\` with no rule list disables every rule, including ${SPINE_RULES.join(", ")}`]);
  expect(comments("a\n  /* x */ // y\n")).toEqual([{ text: " x ", line: 2, col: 3 }, { text: " y", line: 2, col: 11 }]);
  expect(parseDirective("  oxlint-disable-next-line a, b/c -- why")).toEqual({ directive: "oxlint-disable-next-line", rules: ["a", "b/c"] });

  // The CLI scans only linted extensions that git lists and the root config does not ignore.
  const dir = gitRoot("xaravel-lint-131-scope-");
  const blanket = "/* eslint-disable */\n";
  write(dir, { ".gitignore": "out/\n", "out/a.ts": blanket, "_bmad/a.ts": blanket, "notes.md": blanket, "a.json": blanket, "src/b.mjs": blanket });
  const run = runDisables(dir);
  expect(run.exitCode).toBe(1);
  expect(run.stderr.trim().split("\n").map((line) => line.split(":")[0])).toEqual(["src/b.mjs"]);
}

/** A root or nested lint config that drops, lowers or weakens a spine rule, or whose ignorePatterns exclude packages/ or skeleton/, fails naming the config file and rule. */
function configCases(): void {
  const base = readJson(join(root, CONFIG)) as { rules: Record<string, unknown>; ignorePatterns: string[]; overrides: unknown[] };
  const violationsWith = (files: Record<string, string>): string[] => {
    const dir = gitRoot("xaravel-lint-131-config-");
    write(dir, { "src/a.ts": "export const a = 1;\n", ...files });
    return findDisables(dir).violations.map((violation) => `${violation.path}: ${violation.message}`);
  };
  expect(violationsWith({})).toEqual([]);

  // Nested configs.
  for (const severity of ["off", "warn", 1, 0, "allow"]) {
    expect(violationsWith({ "sub/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"], rules: { "typescript/no-misused-promises": severity } }) })).toEqual([
      `sub/.oxlintrc.json: sets no-misused-promises to ${JSON.stringify(severity)} (a spine rule must be "error")`,
    ]);
  }
  expect(violationsWith({ "sub/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"], rules: { "no-console": "error" } }) })).toEqual([]);
  expect(violationsWith({ "sub/.oxlintrc.json": JSON.stringify({ rules: { "no-console": "error" } }) })).toEqual(
    SPINE_RULES.map((rule) => `sub/.oxlintrc.json: does not set ${rule} (a spine rule must be "error")`),
  );
  expect(violationsWith({ "sub/.oxlintrc.json": "{ // comment\n \"extends\": [\"../.oxlintrc.json\"], }\n" })).toEqual([]);
  expect(violationsWith({ "sub/.oxlintrc.json": "{ nope" })[0]).toStartWith("sub/.oxlintrc.json: does not parse");
  expect(violationsWith({ "sub/oxlint.config.ts": "export default {};\n" })).toEqual(["sub/oxlint.config.ts: is a JS lint config, which this check cannot read; use .oxlintrc.json"]);
  expect(violationsWith({ "_bmad/.oxlintrc.json": "{}" })).toEqual([]);

  // The root config weakened.
  const rootWith = (config: Record<string, unknown>): string[] => violationsWith({ [CONFIG]: JSON.stringify(config) });
  const { ["typescript/await-thenable"]: _dropped, ...withoutAwait } = base.rules;
  expect(rootWith({ ...base, rules: withoutAwait })).toEqual(['.oxlintrc.json: does not set await-thenable (a spine rule must be "error")']);
  expect(rootWith({ ...base, rules: { ...base.rules, "typescript/no-floating-promises": "error" } })).toEqual([".oxlintrc.json: sets no-floating-promises without checkThenables: true"]);
  expect(rootWith({ ...base, rules: { ...base.rules, "typescript/no-misused-promises": ["error", { checksVoidReturn: false }] } })).toEqual([".oxlintrc.json: sets no-misused-promises without checksVoidReturn: true"]);
  expect(rootWith({ ...base, rules: { ...base.rules, "typescript/await-thenable": "warn" } })).toEqual(['.oxlintrc.json: sets await-thenable to "warn" (a spine rule must be "error")']);
  expect(rootWith({ ...base, overrides: [{ files: ["skeleton/**"], rules: { "typescript/no-floating-promises": "off" } }, ...base.overrides] })).toEqual(['.oxlintrc.json: overrides[0] sets no-floating-promises to "off" (a spine rule must be "error")']);
  expect(rootWith({ ...base, plugins: ["unicorn"] })).toEqual([".oxlintrc.json: sets plugins without typescript, which turns the type-aware spine rules off"]);
  expect(rootWith({ ...base, ignorePatterns: [...base.ignorePatterns, "skeleton/**"] })).toEqual(['.oxlintrc.json: ignorePatterns entry "skeleton/**" excludes skeleton/app/Demo.ts from the spine rules']);
  expect(rootWith({ ...base, ignorePatterns: [...base.ignorePatterns, "__snapshots__"] })).toEqual(['.oxlintrc.json: ignorePatterns entry "__snapshots__" excludes packages/view/tests/__snapshots__/demo.ts from the spine rules']);
  expect(rootWith({ ...base, ignorePatterns: [...base.ignorePatterns, "**/*.tsx"] })).toEqual(['.oxlintrc.json: ignorePatterns entry "**/*.tsx" excludes packages/demo/src/Demo.tsx from the spine rules']);

  // A pattern that excludes only a real package file the scan lists.
  expect(
    violationsWith({ "packages/demo/src/Sub/Deep.ts": "export const d = 1;\n", [CONFIG]: JSON.stringify({ ...base, ignorePatterns: [...base.ignorePatterns, "packages/demo/src/Sub/**"] }) }),
  ).toEqual(['.oxlintrc.json: ignorePatterns entry "packages/demo/src/Sub/**" excludes packages/demo/src/Sub/Deep.ts from the spine rules']);

  // A nested config's ignorePatterns, relative to its directory.
  expect(
    violationsWith({ "packages/foo/src/A.ts": "export const a = 1;\n", "packages/foo/.oxlintrc.json": JSON.stringify({ extends: ["../../.oxlintrc.json"], rules: PACKAGE_CONFIG_RULES, ignorePatterns: ["src/**"] }) }),
  ).toEqual(['packages/foo/.oxlintrc.json: ignorePatterns entry "src/**" excludes packages/foo/src/A.ts from the spine rules']);
  expect(
    violationsWith({ "skeleton/app/A.ts": "export const a = 1;\n", "skeleton/.oxlintrc.json": JSON.stringify({ extends: ["../.oxlintrc.json"], ignorePatterns: ["**"] }) }),
  ).toEqual(['skeleton/.oxlintrc.json: ignorePatterns entry "**" excludes skeleton/app/Demo.ts from the spine rules']);
  expect(violationsWith({ "packages/foo/src/A.ts": "export const a = 1;\n", "packages/foo/.oxlintrc.json": JSON.stringify({ extends: ["../../.oxlintrc.json"], rules: PACKAGE_CONFIG_RULES, ignorePatterns: ["dist/**"] }) })).toEqual([]);

  // A root .eslintignore, which oxlint honours by default.
  expect(violationsWith({ ".eslintignore": "# generated\n\ndist/\npackages/demo/**\n" })).toEqual(['.eslintignore: entry "packages/demo/**" excludes packages/demo/src/Demo.ts from the spine rules']);
  expect(findDisables(gitRootWith({ ".eslintignore": "dist/\nskeleton/\n" })).violations.map(formatViolation)).toEqual(['.eslintignore:2:1: entry "skeleton/" excludes skeleton/app/Demo.ts from the spine rules (AD-16)']);

  // Git excludes, which oxlint honours: a tracked (force-added) linted file, a build-directory probe or a protected
  // path that any git exclude source hides fails, at the ignore file's line (Retro 6 item 3).
  const tracked = (files: Record<string, string>, ignores: Record<string, string>): string => {
    const dir = gitRoot("xaravel-lint-131-gitignore-");
    write(dir, { "src/a.ts": "export const a = 1;\n", ...ignores, ...files });
    const add = Bun.spawnSync(["git", "add", "-f", "--", ...Object.keys(files)], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    expect(add.exitCode).toBe(0);
    return dir;
  };
  const gitignoreViolations = (files: Record<string, string>, ignores: Record<string, string>): string[] => findDisables(tracked(files, ignores)).violations.map(formatViolation);
  expect(GITIGNORE_PROBES).toEqual(["packages/demo/src/build/Demo.ts", "packages/demo/src/dist/Demo.ts", "packages/demo/src/coverage/Demo.ts"]);
  expect(gitignoreViolations({ "packages/demo/src/Bad.ts": "export const bad = 1;\n" }, { ".gitignore": "Bad.ts\n" })).toEqual([
    '.gitignore:1:1: entry "Bad.ts" excludes packages/demo/src/Bad.ts from the spine rules (AD-16)',
  ]);
  const forced = tracked({ "packages/demo/src/Bad.ts": "export const bad = 1;\n" }, { ".gitignore": "Bad.ts\n" });
  const forcedRun = runDisables(forced);
  expect(forcedRun.exitCode).toBe(1);
  expect(forcedRun.stderr).toBe('.gitignore:1:1: entry "Bad.ts" excludes packages/demo/src/Bad.ts from the spine rules (AD-16)\n');
  expect(violationsWith({ ".gitignore": "node_modules/\nbuild/\n" })).toEqual(['.gitignore: entry "build/" excludes packages/demo/src/build/Demo.ts from the spine rules']);
  expect(violationsWith({ ".gitignore": "dist/\n" })).toEqual(['.gitignore: entry "dist/" excludes packages/demo/src/dist/Demo.ts from the spine rules']);
  expect(violationsWith({ ".gitignore": "coverage/\n" })).toEqual(['.gitignore: entry "coverage/" excludes packages/demo/src/coverage/Demo.ts from the spine rules']);
  expect(violationsWith({ ".gitignore": "/dist/\n/build/\n/coverage/\n/packages/*/dist/\n/packages/*/build/\n/packages/*/coverage/\n" })).toEqual([]);
  expect(gitignoreViolations({ "packages/foo/src/A.ts": "export const a = 1;\n" }, { "packages/foo/.gitignore": "src/\n" })).toEqual([
    'packages/foo/.gitignore:1:1: entry "src/" excludes packages/foo/src/A.ts from the spine rules (AD-16)',
  ]);
  expect(gitignoreViolations({ "packages/foo/src/A.ts": "export const a = 1;\n" }, { ".git/info/exclude": "# local\npackages/foo/\n" })).toEqual([
    '.git/info/exclude:2:1: entry "packages/foo/" excludes packages/foo/src/A.ts from the spine rules (AD-16)',
  ]);
  expect(gitignoreViolations({ "tools/x/T.ts": "export const t = 1;\n" }, { ".gitignore": "tools/x/\n" })).toEqual([
    '.gitignore:1:1: entry "tools/x/" excludes tools/x/T.ts from the spine rules (AD-16)',
  ]);
  expect(gitignoreViolations({ "packages/foo/src/A.ts": "export const a = 1;\n" }, { ".gitignore": "*.ts\n!packages/**\n!skeleton/**\n" })).toEqual([]);
  expect(gitignoreViolations({ "notes.log": "x\n" }, { ".gitignore": "*.log\n" })).toEqual([]);
  expect(gitignoreViolations({ "_bmad/render/x.ts": "export const x = 1;\n" }, { "_bmad/render/.gitignore": "*\n" })).toEqual([]);
  expect(checkGitignore(gitRoot("xaravel-lint-131-gitignore-empty-"), [])).toEqual([]);
  expect(() => checkGitignore(tempDir("xaravel-lint-131-nogit-"), ["packages/demo/src/Demo.ts"])).toThrow(/git check-ignore failed/);

  const missing = gitRoot("xaravel-lint-131-missing-");
  rmSync(join(missing, CONFIG));
  expect(findDisables(missing).violations.map((violation) => violation.message)).toEqual(["is missing, so no spine rule runs"]);

  // Violations print path:line:col of the offending entry.
  const located = gitRoot("xaravel-lint-131-located-");
  write(located, { "sub/.oxlintrc.json": '{\n  "extends": ["../.oxlintrc.json"],\n  "rules": {\n    "no-misused-promises": "off"\n  }\n}\n' });
  expect(runDisables(located).stderr).toBe('sub/.oxlintrc.json:4:6: sets no-misused-promises to "off" (a spine rule must be "error") (AD-16)\n');
}
