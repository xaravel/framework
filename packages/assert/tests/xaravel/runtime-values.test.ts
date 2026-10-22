// Xaravel Tests for Story 9.11 (grader follow-ups to the runtime value model;
// FR-116, AD-2, AD-9, AD-15): XT-assert-17 (AC1) and XT-assert-19 (AC3). The
// Story's other ACs are in exceptions-spl.test.ts (XT-assert-18),
// typed-doubles.test.ts (XT-assert-20) and late-failures.test.ts
// (XT-assert-21). Like 4.1-4.7's tests these are plain bun:test:
// `xaravelTest` is not used to test the grader itself.
//
// XT-assert-17's `===`/`==` matrix comes only from the signed Oracle fixture of
// the XT-assert-17 request in conformance/oracle-requests/9.11.jsonl. A missing,
// unsigned or errored fixture fails the test; it is never skipped. The
// fixture-free rows and the runtime subprocess run first. F-10: these tests
// have no Upstream test inputs; each is the follow-up of the Escalation it
// cites: XT-assert-17 of ESC-4.1-1 (the integral-float `===` matrix, written in
// 9.11.jsonl as ESC-9.11-1 records) under ESC-9.11-2's rule, and XT-assert-19
// of ESC-4.3-1 item 11.
//
// The grader never imports @xaravel/runtime (AD-2, XT-assert-3): the in-process
// rows read every PHP float as a test-local `BrandedFloat` (the brand only),
// and the runtime's real `float()` is exercised in a fresh `bun` subprocess.
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { phpCompare } from "../../src/comparison/PhpOrder";
import { ExceptionCode } from "../../src/Framework/Constraint/Exception/ExceptionCode";
import { gettype, isNumeric, isPhpObject, isScalar, phpToString } from "../../src/comparison/PhpValues";
import { exportValue, shortenedExport } from "../../src/exporter/Exporter";
import { serialize, varExport } from "../../src/exporter/VarExport";
import { Assert, AssertionFailedError, Exception, ExpectationFailedException, phpLooseEquals, phpStrictEquals, TestCase, xaravelTest } from "../../src/index";
import { runCase47 } from "./double-cells";
import { BrandedFloat, brandedMatrixMismatches } from "./branded-floats";
import { readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/9.11.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const SET_MESSAGE = Symbol.for("xaravel.assert.setMessage");
const SPAWN_TIMEOUT = 50_000;
const CHILD_TIMEOUT = 60_000;

const f = (value: number): BrandedFloat => new BrandedFloat(value);

/** The runtime's `float()` against the grader, in a fresh process (the grader's own modules never import the runtime). */
const REAL_MARKER = `
import { float } from "./packages/runtime/src/index.ts";
import { Assert, ExpectationFailedException, phpLooseEquals, phpStrictEquals } from "./packages/assert/src/index.ts";
import { gettype } from "./packages/assert/src/comparison/PhpValues.ts";
import { exportValue } from "./packages/assert/src/exporter/Exporter.ts";
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
  floatZeroVsFloatMinusZero: phpStrictEquals(float(0), float(-0)),
  floatZeroVsMinusZero: phpStrictEquals(float(0), -0),
  minusZeroVsInt: phpStrictEquals(-0, 0),
  looseFloatInt: phpLooseEquals(float(1), 1),
  assertSameIntFloat: failure(() => Assert.assertSame(1, float(1))),
  assertSameFloatFloat: failure(() => Assert.assertSame(float(1), float(1))),
  assertEqualsIntFloat: failure(() => Assert.assertEquals(1, float(1))),
  assertIsFloat: failure(() => Assert.assertIsFloat(float(1))),
  assertIsInt: failure(() => Assert.assertIsInt(float(1))),
  gettype: gettype(float(1)),
  exportMinusZero: [exportValue(float(-0)), exportValue(-0)],
};
process.stdout.write(JSON.stringify(out));
`;

/** The failure message `run` throws, or null. */
function failureOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AssertionFailedError ? error.getMessage() : `not a failure: ${String(error)}`;
  }
}

xaravelTest("XT-assert-17", "given Story 9.5's float marker, phpStrictEquals(1, 1.0) and assertSame(1, 1.0) are false and fail, as in PHP, an unmarked -0 stays an int, and every === and == cell of the signed integral-float matrix matches the Oracle (ESC-4.1-1, ESC-9.11-2)", () => {
  // Fixture-free: the brand alone makes a float, whatever its value.
  expect(phpStrictEquals(1, f(1))).toBe(false);
  expect(phpStrictEquals(f(1), f(1))).toBe(true);
  expect(phpStrictEquals(f(0), f(-0))).toBe(true);
  expect(phpStrictEquals(f(0), 0)).toBe(false);
  expect(phpStrictEquals(-0, f(0))).toBe(false);
  expect(phpStrictEquals(f(NaN), f(NaN))).toBe(false);
  expect(phpStrictEquals(f(1), "1")).toBe(false);
  expect(phpStrictEquals(f(1), true)).toBe(false);
  expect(phpStrictEquals(f(1), null)).toBe(false);
  expect(phpStrictEquals([f(1)], [f(1)])).toBe(true);
  expect(phpStrictEquals([f(1)], [1])).toBe(false);
  expect(phpStrictEquals(f(2 ** 60), 2n ** 60n)).toBe(false);
  expect(phpLooseEquals(f(1), 1)).toBe(true);
  expect(phpLooseEquals(f(1), "1.0")).toBe(true);
  expect(phpLooseEquals({ a: f(1) }, { a: 1 })).toBe(true);
  expect(phpLooseEquals(f(0), null)).toBe(true);
  expect(phpLooseEquals(f(1), true)).toBe(true);
  expect(gettype(f(1))).toBe("double");
  expect([isScalar(f(1)), isNumeric(f(1)), isPhpObject(f(1))]).toEqual([true, true, false]);

  // An unmarked -0 is the int 0 for every reader and printer (ESC-9.11-2), unlike a marked float(-0).
  expect(phpStrictEquals(0, -0)).toBe(true);
  expect(phpStrictEquals(-0, f(-0))).toBe(false);
  expect(gettype(-0)).toBe("integer");
  expect([exportValue(-0), varExport(-0), serialize(-0), phpToString(-0)]).toEqual(["0", "0", "i:0;", "0"]);
  expect([exportValue(f(-0)), varExport(f(-0)), serialize(f(-0)), phpToString(f(-0))]).toEqual(["-0.0", "-0.0", "d:-0;", "-0"]);
  Assert.assertSame(0, -0);
  Assert.assertIsInt(-0);
  expect(failureOf(() => Assert.assertSame(0, f(-0)))).toBe("Failed asserting that -0.0 is identical to 0.");

  // Printers: an integral marked float keeps its float form.
  expect([exportValue(f(1)), shortenedExport(f(1)), varExport(f(1)), serialize(f(1)), phpToString(f(1))]).toEqual(["1.0", "1.0", "1.0", "d:1;", "1"]);
  expect(exportValue([f(1), 1])).toBe("Array &0 [\n    0 => 1.0,\n    1 => 1,\n]");
  expect(phpToString(f(1e15))).toBe("1.0E+15");

  // Assertions.
  expect(failureOf(() => Assert.assertSame(1, f(1)))).toBe("Failed asserting that 1.0 is identical to 1.");
  Assert.assertSame(f(1), f(1));
  Assert.assertEquals(1, f(1));
  Assert.assertEquals(f(Infinity), Infinity);
  expect(failureOf(() => Assert.assertEquals(f(NaN), NaN))).toBe("Failed asserting that NAN matches expected NAN.");
  Assert.assertIsFloat(f(1));
  expect(failureOf(() => Assert.assertIsInt(f(1)))).toBe("Failed asserting that 1.0 is of type int.");
  Assert.assertNan(f(NaN));
  Assert.assertGreaterThan(f(1), f(2));
  Assert.assertEqualsCanonicalizing([f(2), 1], [1, 2]);
  Assert.assertArrayHasKey(f(1), ["a", "b"]);
  Assert.assertCount(f(2) as unknown as number, [1, 2]);
  // The PHP type reaches the number-to-string ordering: `1.0E+15 <=> "1/"` is -1, `1000000000000000 <=> "1/"` is 1.
  expect([phpCompare(f(1e15), "1/"), phpCompare(1e15, "1/"), phpCompare("1/", f(1e15))]).toEqual([-1, 1, 1]);
  // ArrayComparator's diff keeps the float form.
  let diff = "";
  try {
    Assert.assertEquals([f(1)], [2]);
  } catch (error) {
    diff = error instanceof ExpectationFailedException ? (error.getComparisonFailure()?.getDiff() ?? "") : String(error);
  }
  expect(diff).toContain("-    0 => 1.0");
  // TestCase.exactly, PHPUnit's Exception code and the ExceptionCode constraint read a marked float as its number.
  expect(new TestCase().exactly(f(2) as unknown as number).toString()).toBe("invoked 2 times");
  expect(new Exception("x", f(3) as unknown as number).getCode()).toBe(3);
  expect(new Exception("x", f(1.5) as unknown as number).getMessage()).toBe("x (exception code: 1.5)");
  expect(new ExceptionCode(3).evaluate(f(3), "", true)).toBe(true);
  // A PHPUnit double's willReturnMap compares its rows with ===.
  const [mapped] = runCase47(function (this: TestCase) {
    const m = this.createMock(Mapped);
    m.method("get").willReturnMap([[f(1), "float"], [1, "int"]]);
    return [m.get(1), m.get(f(1))];
  });
  expect(mapped).toEqual(["int", "float"]);

  // The runtime's real marker, in a fresh process from the repo root.
  const child = Bun.spawnSync([process.execPath, "-e", REAL_MARKER], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  expect({ exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(child.stdout.toString()) as unknown).toEqual({
    intVsFloat: false,
    floatVsFloat: true,
    sameInstance: true,
    floatZeroVsFloatMinusZero: true,
    floatZeroVsMinusZero: false,
    minusZeroVsInt: true,
    looseFloatInt: true,
    assertSameIntFloat: { expectation: true, message: "Failed asserting that 1.0 is identical to 1." },
    assertSameFloatFloat: null,
    assertEqualsIntFloat: null,
    assertIsFloat: null,
    assertIsInt: { expectation: true, message: "Failed asserting that 1.0 is of type int." },
    gettype: "double",
    exportMinusZero: ["-0.0", "0"],
  });

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
      const result = brandedMatrixMismatches(path, request, output, { loose: phpLooseEquals, strict: phpStrictEquals });
      pairs += result.pairs;
      problems.push(...result.mismatches);
    } catch (error) {
      problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    }
  }
  expect(problems).toEqual([]);
  expect(pairs).toBeGreaterThan(0);
}, CHILD_TIMEOUT);

/** A doubled class for the willReturnMap row. */
class Mapped {
  get(key?: unknown): unknown {
    return key;
  }
}

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

  // A plain AssertionFailedError, and an ExpectationFailedException without a comparison failure, have no suffix.
  const plain = new AssertionFailedError("first", 0, null);
  expect((plain as unknown as Record<symbol, (message: unknown) => unknown>)[SET_MESSAGE]!("second")).toBeNull();
  expect({ getMessage: plain.getMessage(), message: plain.message }).toEqual({ getMessage: "second", message: "second" });
  const bare = new ExpectationFailedException("first");
  expect((bare as unknown as Record<symbol, (message: unknown) => unknown>)[SET_MESSAGE]!("second")).toBeNull();
  expect({ getMessage: bare.getMessage(), message: bare.message, comparison: bare.getComparisonFailure() }).toEqual({ getMessage: "second", message: "second", comparison: null });

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
