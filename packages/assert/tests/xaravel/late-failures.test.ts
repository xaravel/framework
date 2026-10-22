// Xaravel Test for Story 9.11's AC5 (XT-assert-21; FR-113, AD-15, ESC-5.3-3).
// Like 4.1-4.7's tests this is plain bun:test: `xaravelTest` is not used to
// test the grader itself.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-5.3-3 (a late assertion that fails does not throw into whichever test is
// running then). It needs no Oracle fixture: the behaviour is the harness
// protocol's, not PHP's.
//
// The declared tests run in a child `bun test` of fixtures/late-failures.fixture.ts,
// with a fake `Symbol.for('xaravel.harness.late')` hook; its junit report gives
// each test's verdict.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { xaravelTest } from "../../src/index";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const FIXTURE = "./packages/assert/tests/xaravel/fixtures/late-failures.fixture.ts";
const SPAWN_TIMEOUT = 50_000;
const CHILD_TIMEOUT = 60_000;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|quot|amp|lt|gt|apos);/g, (_, entity: string) => {
    const named: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };
    return named[entity] ?? String.fromCodePoint(Number(entity.slice(1)));
  });
}

xaravelTest("XT-assert-21", "given an assertion that fails after its test's counts have ended, nothing is thrown into the running test and the late hook gets the owning test's id (ESC-5.3-3)", () => {
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-21-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const lateFile = join(dir, "late.jsonl");
  const probeFile = join(dir, "probes.json");
  const child = Bun.spawnSync([process.execPath, "test", FIXTURE, "--reporter=junit", `--reporter-outfile=${junit}`], {
    cwd: root,
    env: { ...process.env, XT_LATE_FILE: lateFile, XT_PROBE_FILE: probeFile },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const output = child.stdout.toString() + child.stderr.toString();
  if (!existsSync(junit) || !existsSync(probeFile)) {
    throw new Error(`the fixture run wrote no junit report or probe file (exit ${child.exitCode}); its output:\n${output}`);
  }

  // Both tests pass: nothing was thrown out of the timer into XT-fixture-2, and its own failing assertion threw.
  const results = new Map<string, string | null>();
  for (const match of readFileSync(junit, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure[^>]*?message="([^"]*)")/g)) {
    results.set(unescapeXml(match[1] ?? "").split(":")[0]!, match[3] === undefined ? null : unescapeXml(match[3]));
  }
  expect({ results: Object.fromEntries(results), exitCode: child.exitCode }).toEqual({ results: { "XT-fixture-1": null, "XT-fixture-2": null }, exitCode: 0 });
  expect(output).not.toContain("Unhandled error");

  // The late calls returned null; a skip and an argument TypeError still threw.
  expect(JSON.parse(readFileSync(probeFile, "utf8")) as unknown).toEqual({
    assertTrue: { returned: null },
    fail: { returned: null },
    viaPrototype: { returned: null },
    double: { returned: null },
    skipped: { threw: "SkippedWithMessageException" },
    typeError: { threw: "TypeError" },
  });

  // The late hook got XT-fixture-1's id for each failing call: once per kind, the double's rule with kind null.
  const late = readFileSync(lateFile, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
  expect(late).toEqual([
    { id: "XT-fixture-1", kind: "assertTrue" },
    { id: "XT-fixture-1", kind: "fail" },
    { id: "XT-fixture-1", kind: "assertSame" },
    { id: "XT-fixture-1", kind: null },
    { id: "XT-fixture-1", kind: "assertCount" },
  ]);
}, CHILD_TIMEOUT);
