// Xaravel Tests for Story 9.11 (grader follow-ups to the runtime value model;
// FR-116, AD-2, AD-9, AD-15). One test per AC the Story carries, in order:
// XT-assert-17 (AC1) and XT-assert-19 (AC3). XT-assert-18 (AC2) waits on
// conformance/escalations/ESC-9.11-1.md. Like 4.1-4.7's tests these are plain
// bun:test: `xaravelTest` is not used to test the grader itself.
//
// XT-assert-17's `===`/`==` matrix comes only from the signed Oracle fixture of
// the XT-assert-17 request in conformance/oracle-requests/9.11.jsonl. A missing,
// unsigned or errored fixture fails the test; it is never skipped. F-10: the
// matrix has no Upstream test inputs; it is the ESC-4.1-1 follow-up (the
// integral-float `===` matrix), written in 9.11.jsonl as ESC-9.11-1 records.
//
// The grader never imports @xaravel/runtime (AD-2, XT-assert-3): the matrix
// reads every PHP float as a test-local `BrandedFloat` (the brand only), and
// the runtime's real `float()` is exercised in a fresh `bun` subprocess.
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, AssertionFailedError, Exception, ExpectationFailedException, phpLooseEquals, phpStrictEquals, xaravelTest } from "../../src/index";
import { gettype } from "../../src/comparison/PhpValues";
import { BrandedFloat, matrixMismatches, readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/9.11.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const SET_MESSAGE = Symbol.for("xaravel.assert.setMessage");

/** The runtime's `float()` against the grader, in a fresh process (the grader's own modules never import the runtime). */
const REAL_MARKER = `
import { float } from "./packages/runtime/src/index.ts";
import { Assert, ExpectationFailedException, phpLooseEquals, phpStrictEquals } from "./packages/assert/src/index.ts";
import { gettype } from "./packages/assert/src/comparison/PhpValues.ts";
function failure(run) {
  try {
    run();
    return null;
  } catch (error) {
    return { expectation: error instanceof ExpectationFailedException, message: error.getMessage() };
  }
}
const one = float(1);
const out = {
  intVsFloat: phpStrictEquals(1, float(1)),
  floatVsFloat: phpStrictEquals(float(1), float(1)),
  sameInstance: phpStrictEquals(one, one),
  zeroVsMinusZero: phpStrictEquals(float(0), -0),
  looseFloatInt: phpLooseEquals(float(1), 1),
  assertSameIntFloat: failure(() => Assert.assertSame(1, float(1))),
  assertSameFloatFloat: failure(() => Assert.assertSame(float(1), float(1))),
  assertEqualsIntFloat: failure(() => Assert.assertEquals(1, float(1))),
  assertIsFloat: failure(() => Assert.assertIsFloat(float(1))),
  assertIsInt: failure(() => Assert.assertIsInt(float(1))),
  gettype: gettype(float(1)),
};
process.stdout.write(JSON.stringify(out));
`;

xaravelTest("XT-assert-17", "given Story 9.5's float marker, phpStrictEquals(1, 1.0) and assertSame(1, 1.0) are false and fail, as in PHP, and every === and == cell of the signed integral-float matrix matches the Oracle (ESC-4.1-1)", () => {
  // Fixture-free: the brand alone makes a float, whatever its value.
  expect(phpStrictEquals(1, new BrandedFloat(1))).toBe(false);
  expect(phpStrictEquals(new BrandedFloat(1), new BrandedFloat(1))).toBe(true);
  expect(phpStrictEquals(new BrandedFloat(0), -0)).toBe(true);
  expect(phpStrictEquals(new BrandedFloat(NaN), new BrandedFloat(NaN))).toBe(false);
  expect(phpStrictEquals(new BrandedFloat(1), "1")).toBe(false);
  expect(phpStrictEquals([new BrandedFloat(1)], [new BrandedFloat(1)])).toBe(true);
  expect(phpStrictEquals([new BrandedFloat(1)], [1])).toBe(false);
  expect(phpLooseEquals(new BrandedFloat(1), 1)).toBe(true);
  expect(phpLooseEquals(new BrandedFloat(1), "1.0")).toBe(true);
  expect(phpLooseEquals({ a: new BrandedFloat(1) }, { a: 1 })).toBe(true);
  expect(gettype(new BrandedFloat(1))).toBe("double");
  expect(() => Assert.assertSame(1, new BrandedFloat(1))).toThrow("Failed asserting that 1.0 is identical to 1.");
  Assert.assertEquals(1, new BrandedFloat(1));
  Assert.assertIsFloat(new BrandedFloat(1));
  expect(() => Assert.assertIsInt(new BrandedFloat(1))).toThrow("Failed asserting that 1.0 is of type int.");
  Assert.assertGreaterThan(new BrandedFloat(1), new BrandedFloat(2));

  // The signed Oracle matrix, every PHP float decoded as a BrandedFloat.
  const requests = readRequests(join(root, REQUESTS)).filter((request) => request.id === "XT-assert-17");
  expect(requests).toHaveLength(1);
  const publicKey = readFileSync(join(root, PUBLIC_KEY), "utf8");
  const problems: string[] = [];
  let pairs = 0;
  for (const request of requests) {
    const path = `${FIXTURES}/${request.sha256}.json`;
    try {
      const output = readSignedFixture(join(root, path), request.sha256, publicKey);
      const result = matrixMismatches(path, request, output, { loose: phpLooseEquals, strict: phpStrictEquals }, { floats: "branded" });
      pairs += result.pairs;
      problems.push(...result.mismatches);
    } catch (error) {
      problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    }
  }
  expect(problems).toEqual([]);
  expect(pairs).toBeGreaterThan(0);

  // The runtime's real marker, in a fresh process from the repo root.
  const child = Bun.spawnSync([process.execPath, "-e", REAL_MARKER], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect({ exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(child.stdout.toString()) as unknown).toEqual({
    intVsFloat: false,
    floatVsFloat: true,
    sameInstance: true,
    zeroVsMinusZero: true,
    looseFloatInt: true,
    assertSameIntFloat: { expectation: true, message: "Failed asserting that 1.0 is identical to 1." },
    assertSameFloatFloat: null,
    assertEqualsIntFloat: null,
    assertIsFloat: null,
    assertIsInt: { expectation: true, message: "Failed asserting that 1.0 is of type int." },
    gettype: "double",
  });
});

xaravelTest("XT-assert-19", "given a caught assertion failure, the xaravel.assert.setMessage protocol rewrites its message as Laravel's TestResponseAssert::appendMessageToException does (ESC-4.3-1 item 11)", () => {
  let caught: unknown = null;
  try {
    Assert.assertSame("a", "b");
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ExpectationFailedException);
  const failure = caught as ExpectationFailedException;
  const original = failure.getMessage();
  const suffix = failure.message.slice(original.length);
  expect(suffix.startsWith("\n--- Expected\n")).toBe(true);
  const comparison = failure.getComparisonFailure();
  const code = failure.getCode();
  const previous = failure.getPrevious();
  const cause = failure.cause;

  // Laravel's appendMessageToException: `$e->getMessage().PHP_EOL.PHP_EOL.$message.PHP_EOL`.
  const extra = "The following exception occurred during the last request:";
  const rewritten = `${original}\n\n${extra}\n`;
  const setMessage = (failure as unknown as Record<symbol, (message: unknown) => unknown>)[SET_MESSAGE]!;
  expect(setMessage.call(failure, rewritten)).toBeNull();
  expect(failure.getMessage()).toBe(rewritten);
  expect(failure.message).toBe(rewritten + suffix);
  expect(failure.getComparisonFailure()).toBe(comparison);
  expect(failure.getCode()).toBe(code);
  expect(failure.getPrevious()).toBe(previous);
  expect(failure.cause).toBe(cause);
  expect(failure.toString()).toBe(rewritten);

  // A plain AssertionFailedError has no suffix.
  const plain = new AssertionFailedError("first", 0, null);
  expect((plain as unknown as Record<symbol, (message: unknown) => unknown>)[SET_MESSAGE]!("second")).toBeNull();
  expect({ getMessage: plain.getMessage(), message: plain.message }).toEqual({ getMessage: "second", message: "second" });

  // A non-string argument is a JS TypeError naming the protocol, and changes nothing.
  for (const bad of [null, 5, undefined, {}, ["x"]]) {
    expect(() => setMessage.call(failure, bad)).toThrow(TypeError);
    expect(() => setMessage.call(failure, bad)).toThrow("xaravel.assert.setMessage");
  }
  expect(failure.getMessage()).toBe(rewritten);

  // The method is on PHPUnit\Framework\Exception's prototype, non-enumerable; the exported classes stay frozen.
  const descriptor = Object.getOwnPropertyDescriptor(Exception.prototype, SET_MESSAGE);
  expect(typeof descriptor?.value).toBe("function");
  expect(descriptor?.enumerable).toBe(false);
  for (const exported of [Exception, AssertionFailedError, ExpectationFailedException]) {
    expect(Object.isFrozen(exported)).toBe(true);
    expect(Object.isFrozen(exported.prototype)).toBe(true);
  }
  expect(() => {
    (Exception.prototype as unknown as Record<symbol, unknown>)[SET_MESSAGE] = () => null;
  }).toThrow(TypeError);
});
