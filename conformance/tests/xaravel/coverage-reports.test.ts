// Xaravel Tests for Epic 4 retro item 5 (the coverage reports probe behavior,
// not presence; findings R5 and A2). These run under plain `bun test` until
// the harness lands in Epic 5.
import { afterAll, expect } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
// Above the assert report's own fixture timeout (FIXTURE_TIMEOUT, 50s); each test spawns at most three reports.
const SPAWN_TIMEOUT = 90_000;
const CHILD_TIMEOUT = 3 * SPAWN_TIMEOUT;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run(tool: string, args: readonly string[]): { exitCode: number | null; lines: string[]; stderr: string } {
  const child = Bun.spawnSync([process.execPath, join(root, tool), ...args], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  return {
    exitCode: child.exitCode,
    lines: child.stdout
      .toString()
      .split("\n")
      .filter((line) => line !== ""),
    stderr: child.stderr.toString(),
  };
}

/** A temp root holding `scan` and a copy of `packages/<pkg>/src`, edited by `edits` (file -> [from, to] pairs). */
function tempRoot(scan: string, pkg: string, edits: Record<string, [string, string][]>): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-coverage-reports-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, dirname(scan)), { recursive: true });
  writeFileSync(join(dir, scan), readFileSync(join(root, scan), "utf8"));
  cpSync(join(root, "packages", pkg, "src"), join(dir, "packages", pkg, "src"), { recursive: true });
  for (const [file, pairs] of Object.entries(edits)) {
    const path = join(dir, "packages", pkg, "src", file);
    let text = readFileSync(path, "utf8");
    for (const [from, to] of pairs) {
      expect(text).toContain(from);
      text = text.replace(from, to);
    }
    writeFileSync(path, text);
  }
  return dir;
}

const ASSERT = "tools/assert-coverage/coverage.ts";
const MOCKERY = "tools/mockery-coverage/coverage.ts";

xaravelTest("XT-conformance-182", "assert:coverage counts a name only when calling it records an assertion or changes a declared test's outcome: an emptied assertTrue or expectException is missing, an unknown scan name is missing, and a usage error exits 2 (FR-116.1)", () => {
  // The repository: exit 0, nothing missing.
  const repo = run(ASSERT, []);
  expect({ exitCode: repo.exitCode, stderr: repo.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(repo.lines.filter((line) => line.startsWith("missing"))).toEqual([]);
  expect(repo.lines.at(-1)).toMatch(/ 0 missing\.$/);

  // An emptied static assertion and an emptied outcome method (both still present as functions) are missing.
  const dir = tempRoot("conformance/scans/phpunit-assertions.jsonl", "assert", {
    "Framework/Assert.ts": [['    recordAssertion("assertTrue");\n    assertThat(condition, new IsTrue(), message("assertTrue", 2, message_));\n', ""]],
    "Framework/TestCase.ts": [
      ["    classOrInterface(exception);\n    state(this).exception.expectClass(exception);\n", ""],
      // Only the instance form of assertSame breaks: the static Assert.assertSame stays intact.
      ['  static readonly [CLASS_FQCN]: string = "PHPUnit\\\\Framework\\\\TestCase";\n', '  static readonly [CLASS_FQCN]: string = "PHPUnit\\\\Framework\\\\TestCase";\n\n  assertSame(): void {}\n'],
    ],
  });
  const scan = join(dir, "conformance/scans/phpunit-assertions.jsonl");
  writeFileSync(scan, `${readFileSync(scan, "utf8")}{"name":"assertXaravelNoProbe","calls":1,"executions":0}\n`);
  const stubbed = run(ASSERT, ["--root", dir]);
  expect({ exitCode: stubbed.exitCode, stderr: stubbed.stderr }).toEqual({ exitCode: 1, stderr: "" });
  expect(stubbed.lines.filter((line) => line.startsWith("missing"))).toEqual(["missing assert: assertSame", "missing assert: assertTrue", "missing assert: assertXaravelNoProbe", "missing assert: expectException"]);
  expect(stubbed.lines.at(-1)).toMatch(/, 4 missing\.$/);

  // A usage error: exit 2, the usage on stderr.
  const usage = run(ASSERT, ["--nope"]);
  expect(usage.exitCode).toBe(2);
  expect(usage.stderr).toContain("usage: bun tools/assert-coverage/coverage.ts [--root <dir>]");
}, CHILD_TIMEOUT);

xaravelTest("XT-conformance-183", "mockery:coverage counts a name only when its probe works on a mock or expectation: a once() that only returns this is missing, an unknown scan name is missing, and a usage error exits 2", () => {
  // The repository: exit 0, nothing missing.
  const repo = run(MOCKERY, []);
  expect({ exitCode: repo.exitCode, stderr: repo.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(repo.lines.filter((line) => line.startsWith("missing"))).toEqual([]);
  expect(repo.lines.at(-1)).toMatch(/ 0 missing\.$/);

  // once() on Expectation and CompositeExpectation only returns this: still a function, but missing.
  const dir = tempRoot("conformance/scans/mockery-api.jsonl", "mockery", {
    "Mockery/Expectation.ts": [["  once(): this {\n    return this.times(1);\n  }", "  once(): this {\n    return this;\n  }"]],
    "Mockery/CompositeExpectation.ts": [["  once(): this {\n    return this.forward((expectation) => expectation.once());\n  }", "  once(): this {\n    return this;\n  }"]],
    // Double's three verbs only return this: still functions, but missing.
    "JMac/Testing/Engine/MethodExpectation.ts": [
      ["  returns(...values: unknown[]): this {\n", "  returns(...values: unknown[]): this {\n    return this;\n"],
      ["  throws(...exceptions: unknown[]): this {\n", "  throws(...exceptions: unknown[]): this {\n    return this;\n"],
      ["  resolves(resolver: (...args: any[]) => unknown): this {\n", "  resolves(resolver: (...args: any[]) => unknown): this {\n    return this;\n"],
    ],
  });
  mkdirSync(join(dir, "node_modules/@xaravel"), { recursive: true });
  symlinkSync(join(root, "packages/assert"), join(dir, "node_modules/@xaravel/assert"));
  const scan = join(dir, "conformance/scans/mockery-api.jsonl");
  writeFileSync(scan, `${readFileSync(scan, "utf8")}{"name":"andXaravelNoProbe","static":false,"count":1}\n`);
  const stubbed = run(MOCKERY, ["--root", dir]);
  expect({ exitCode: stubbed.exitCode, stderr: stubbed.stderr }).toEqual({ exitCode: 1, stderr: "" });
  // The close, expects, shouldHaveReceived and spy probes go through once() too, so they are missing with it; the
  // stubbed returns, throws and resolves are missing as well.
  expect(stubbed.lines.filter((line) => line.startsWith("missing"))).toEqual([
    "missing mockery: andXaravelNoProbe",
    "missing mockery: close",
    "missing mockery: expects",
    "missing mockery: once",
    "missing mockery: resolves",
    "missing mockery: returns",
    "missing mockery: shouldHaveReceived",
    "missing mockery: spy",
    "missing mockery: throws",
  ]);
  expect(stubbed.lines.at(-1)).toMatch(/, 9 missing\.$/);
  // The Double names are probed since Story 4.8 through the exported Double: none is pending.
  expect(stubbed.lines.filter((line) => line.startsWith("pending"))).toEqual([]);

  // A usage error: exit 2, the usage on stderr.
  const usage = run(MOCKERY, ["--nope"]);
  expect(usage.exitCode).toBe(2);
  expect(usage.stderr).toContain("usage: bun tools/mockery-coverage/coverage.ts [--root <dir>]");
}, CHILD_TIMEOUT);
