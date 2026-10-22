// Xaravel Test for Story 9.11's AC2, the grader's half (XT-assert-18; FR-116,
// AD-2, AD-15, ESC-9.11-1). Like 4.1-4.7's tests this is plain bun:test:
// `xaravelTest` is not used to test the grader itself.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-4.3-1 items 10 and 14 (the grader reads the runtime's `\Error` /
// `\Exception` split and its SPL classes, DIV-9.8), as ESC-9.11-1 splits it.
// It needs no Oracle fixture: the classes' PHP parents are cited in each
// class's source, and the runtime's chains are XT-runtime-35's.
//
// The grader never imports @xaravel/runtime (AD-2, XT-assert-3), and this
// process may or may not have loaded it (a root `bun test` shares one process),
// so every row runs in a fresh `bun` child from the repo root: the runtime
// loaded first, the grader loaded first and the runtime after it, and no
// runtime at all.
import { expect } from "bun:test";
import { resolve } from "node:path";
import { xaravelTest } from "../../src/index";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const SPAWN_TIMEOUT = 50_000;
const CHILD_TIMEOUT = 60_000;

/** The child: `MODE` is `runtime-first`, `grader-first` or `none`. It prints one JSON object. */
const CHILD = `
const MODE = process.env.XT_SPL_MODE;
if (MODE === "runtime-first") {
  await import("./packages/runtime/src/index.ts");
}
const A = "./packages/assert/src/";
const grader = await import(A + "index.ts");
const { Exception, AssertionFailedError, ExpectationFailedException, SkippedWithMessageException, ComparisonFailure, Assert, TestCase } = grader;
const { EmptyStringException } = await import(A + "Framework/Exception/EmptyStringException.ts");
const { InvalidArgumentException } = await import(A + "Framework/Exception/InvalidArgumentException.ts");
const { UnknownClassOrInterfaceException } = await import(A + "Framework/Exception/UnknownClassOrInterfaceException.ts");
const { InvalidJsonException } = await import(A + "util/Json.ts");
const { RuntimeException: MockRuntimeException } = await import(A + "Framework/MockObject/Exception/RuntimeException.ts");
const { NeverReturningMethodException } = await import(A + "Framework/MockObject/Exception/NeverReturningMethodException.ts");
const { CannotUseOnlyMethodsException } = await import(A + "Framework/MockObject/Exception/CannotUseOnlyMethodsException.ts");
const { MethodCannotBeConfiguredException } = await import(A + "Framework/MockObject/Exception/MethodCannotBeConfiguredException.ts");
const { MethodNameAlreadyConfiguredException } = await import(A + "Framework/MockObject/Exception/MethodNameAlreadyConfiguredException.ts");
const { MethodNameNotConfiguredException } = await import(A + "Framework/MockObject/Exception/MethodNameNotConfiguredException.ts");
const { MethodNamedMethodException } = await import(A + "Framework/MockObject/Exception/MethodNamedMethodException.ts");
const { MethodParametersAlreadyConfiguredException } = await import(A + "Framework/MockObject/Exception/MethodParametersAlreadyConfiguredException.ts");
const { MethodParametersAlreadyConfiguredForAnotherMatcherException } = await import(A + "Framework/MockObject/Exception/MethodParametersAlreadyConfiguredForAnotherMatcherException.ts");
const { NoMoreReturnValuesConfiguredException } = await import(A + "Framework/MockObject/Exception/NoMoreReturnValuesConfiguredException.ts");
const { Factory } = await import(A + "comparator/Factory.ts");
const { ExceptionComparator } = await import(A + "comparator/ExceptionComparator.ts");
const { Exception: ExceptionConstraint } = await import(A + "Framework/Constraint/Exception/Exception.ts");
const { testCaseState } = await import(A + "Framework/TestCase.ts");
if (MODE === "grader-first") {
  await import("./packages/runtime/src/index.ts");
}
const map = globalThis[Symbol.for("xaravel.php.classes")] ?? null;
const prev = new Error("prev");
// Each grader exception class, how to build it, and the SPL class its PHP source extends (or reaches first).
const table = [
  ["PHPUnit\\\\Framework\\\\Exception", () => new Exception("m", 5, prev), "RuntimeException"],
  ["AssertionFailedError", () => new AssertionFailedError("m", 5, prev), "RuntimeException"],
  ["ExpectationFailedException", () => new ExpectationFailedException("m", null, prev), "RuntimeException"],
  ["SkippedWithMessageException", () => new SkippedWithMessageException("m"), "RuntimeException"],
  ["CannotUseOnlyMethodsException", () => new CannotUseOnlyMethodsException("T", "m"), "RuntimeException"],
  ["MethodCannotBeConfiguredException", () => new MethodCannotBeConfiguredException("m"), "RuntimeException"],
  ["MethodNameAlreadyConfiguredException", () => new MethodNameAlreadyConfiguredException(), "RuntimeException"],
  ["MethodNameNotConfiguredException", () => new MethodNameNotConfiguredException(), "RuntimeException"],
  ["MethodNamedMethodException", () => new MethodNamedMethodException(), "RuntimeException"],
  ["MethodParametersAlreadyConfiguredException", () => new MethodParametersAlreadyConfiguredException(), "RuntimeException"],
  ["MethodParametersAlreadyConfiguredForAnotherMatcherException", () => new MethodParametersAlreadyConfiguredForAnotherMatcherException("m"), "RuntimeException"],
  ["NoMoreReturnValuesConfiguredException", () => new NoMoreReturnValuesConfiguredException("C", "m", 2), "RuntimeException"],
  ["MockObject\\\\RuntimeException", () => new MockRuntimeException("m", 5, prev), "RuntimeException"],
  ["NeverReturningMethodException", () => new NeverReturningMethodException("C", "m"), "RuntimeException"],
  ["EmptyStringException", () => new EmptyStringException(), "RuntimeException"],
  ["Illuminate\\\\Testing\\\\Exceptions\\\\InvalidArgumentException", () => new InvalidArgumentException("m"), "RuntimeException"],
  ["UnknownClassOrInterfaceException", () => new UnknownClassOrInterfaceException("X"), "RuntimeException"],
  ["ComparisonFailure", () => new ComparisonFailure(1, 2, "1", "2", "m"), "RuntimeException"],
  ["InvalidJsonException", () => new InvalidJsonException(), "RuntimeException"],
];
const call = (value, method) => (typeof value[method] === "function" ? value[method]() : "(none)");
const classes = {};
for (const [label, make, parent] of table) {
  const value = make();
  classes[label] = {
    spl: map === null ? null : value instanceof map[parent],
    phpException: map === null ? null : value instanceof map.Exception,
    phpError: map === null ? null : value instanceof map.Error,
    jsError: value instanceof Error,
    getMessage: call(value, "getMessage"),
    getCode: call(value, "getCode"),
    previous: typeof value.getPrevious === "function" ? (value.getPrevious() === prev ? "prev" : value.getPrevious()) : "(none)",
    message: value.message,
    name: value.name,
    ownKeys: Object.keys(value),
    cause: value.cause === prev ? "prev" : value.cause === undefined ? "(none)" : String(value.cause),
  };
}
const exported = [Exception, AssertionFailedError, ExpectationFailedException, SkippedWithMessageException, ComparisonFailure];
const base = Object.getPrototypeOf(Exception.prototype);
const out = {
  map: map !== null,
  classes,
  frozen: exported.every((c) => Object.isFrozen(c) && Object.isFrozen(c.prototype)),
  chain: {
    baseIsInternal: !Object.values(grader).includes(base.constructor) && base !== Error.prototype,
    baseParent: Object.getPrototypeOf(base) === Error.prototype ? "Error.prototype" : map !== null && Object.getPrototypeOf(base) === map.RuntimeException.prototype ? "map.RuntimeException.prototype" : "other",
  },
};
const comparator = new ExceptionComparator();
const factory = Factory.getInstance();
if (map !== null) {
  const failure = (() => { try { Assert.assertTrue(false); } catch (e) { return e; } })();
  const test = new TestCase();
  test.expectException(map.RuntimeException);
  let instanceOf = null;
  try { Assert.assertInstanceOf(map.RuntimeException, failure); } catch (e) { instanceOf = e.getMessage(); }
  out.comparator = {
    runtimeExceptions: comparator.accepts(new map.RuntimeException("a"), new map.RuntimeException("b")),
    runtimeErrors: comparator.accepts(new map.TypeError("a"), new map.TypeError("b")),
    runtimeErrorsGoTo: factory.getComparatorFor(new map.TypeError("a"), new map.TypeError("b")).constructor.name,
    exceptionVsJsError: comparator.accepts(new map.Exception("a"), new Error("b")),
    graderFailures: comparator.accepts(failure, failure),
  };
  out.expectException = {
    failureIsRuntimeException: failure instanceof map.RuntimeException,
    constraint: new ExceptionConstraint(map.RuntimeException).evaluate(failure, "", true),
    assertInstanceOf: instanceOf,
    // PHPUnit's ExceptionExpectation::shouldBeVerifiedFor: an assertion failure still fails the test.
    verified: testCaseState(test).exception.shouldBeVerifiedFor(failure),
  };
} else {
  out.comparator = { jsErrors: comparator.accepts(new Error("a"), new Error("b")) };
}
process.stdout.write(JSON.stringify(out));
`;

interface ChildOutput {
  readonly map: boolean;
  readonly classes: Record<string, Record<string, unknown>>;
  readonly frozen: boolean;
  readonly chain: { readonly baseIsInternal: boolean; readonly baseParent: string };
  readonly comparator: Record<string, unknown>;
  readonly expectException?: Record<string, unknown>;
}

function runChild(mode: "runtime-first" | "grader-first" | "none"): ChildOutput {
  const child = Bun.spawnSync([process.execPath, "-e", CHILD], {
    cwd: root,
    env: { ...process.env, XT_SPL_MODE: mode },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  expect({ mode, exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ mode, exitCode: 0, stderr: "" });
  return JSON.parse(child.stdout.toString()) as ChildOutput;
}

/** A class row without the instanceof flags that depend on the map. */
function getters(row: Record<string, unknown>): Record<string, unknown> {
  const { spl: _spl, phpException: _phpException, phpError: _phpError, ...rest } = row;
  return rest;
}

xaravelTest("XT-assert-18", "given the runtime's class map, the grader's exceptions are instanceof their runtime SPL parents, a PHPUnit failure matches \\RuntimeException in Constraint\\Exception, and ExceptionComparator takes only \\Exceptions; without the map, today's behaviour is unchanged (ESC-4.3-1 items 10 and 14)", () => {
  const none = runChild("none");
  const runtimeFirst = runChild("runtime-first");
  const graderFirst = runChild("grader-first");

  // Without the map: the chain is the class, the internal base, the JS Error; ExceptionComparator takes JS Errors.
  expect(none.map).toBe(false);
  expect(none.chain).toEqual({ baseIsInternal: true, baseParent: "Error.prototype" });
  expect(none.comparator).toEqual({ jsErrors: true });
  expect(none.frozen).toBe(true);
  for (const row of Object.values(none.classes)) {
    expect(row).toMatchObject({ spl: null, phpException: null, phpError: null, jsError: true });
  }
  // PHPUnit's getters as before the map existed.
  expect(getters(none.classes["PHPUnit\\Framework\\Exception"]!)).toEqual({
    jsError: true,
    getMessage: "m",
    getCode: 5,
    previous: "prev",
    message: "m",
    name: "Exception",
    ownKeys: ["name"],
    cause: "prev",
  });

  for (const [mode, run] of [
    ["runtime-first", runtimeFirst],
    ["grader-first", graderFirst],
  ] as const) {
    expect({ mode, map: run.map }).toEqual({ mode, map: true });
    expect({ mode, chain: run.chain }).toEqual({ mode, chain: { baseIsInternal: true, baseParent: "map.RuntimeException.prototype" } });
    expect({ mode, frozen: run.frozen }).toEqual({ mode, frozen: true });
    for (const [label, row] of Object.entries(run.classes)) {
      // Each is its SPL parent, a PHP \Exception and a JS Error, never a PHP \Error.
      expect({ mode, label, spl: row["spl"], phpException: row["phpException"], phpError: row["phpError"], jsError: row["jsError"] }).toEqual({
        mode,
        label,
        spl: true,
        phpException: true,
        phpError: false,
        jsError: true,
      });
      // Every getter, the JS message and name, and the own keys are the same with and without the map.
      expect({ mode, label, row: getters(row) }).toEqual({ mode, label, row: getters(none.classes[label]!) });
    }
    expect({ mode, comparator: run.comparator }).toEqual({
      mode,
      comparator: { runtimeExceptions: true, runtimeErrors: false, runtimeErrorsGoTo: "ObjectComparator", exceptionVsJsError: false, graderFailures: true },
    });
    expect({ mode, expectException: run.expectException }).toEqual({
      mode,
      expectException: { failureIsRuntimeException: true, constraint: true, assertInstanceOf: null, verified: false },
    });
  }
}, CHILD_TIMEOUT);
