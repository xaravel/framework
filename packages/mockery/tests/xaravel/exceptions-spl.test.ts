// Xaravel Test for Story 9.12 (XT-mockery-12; FR-116, AD-2, AD-15,
// ESC-9.11-1): Mockery's exceptions on the runtime's SPL classes. Like the
// other grader tests this is plain bun:test.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-4.5-1 item 2 (one shared owner for the SPL classes, the Epic 9 runtime,
// read through a `Symbol.for` protocol), as ESC-9.11-1 splits it out of
// Story 9.11. It needs no Oracle fixture: the copies' PHP parents are cited in
// each copy's source, and the runtime's chains are XT-runtime-35's.
//
// The grader never imports @xaravel/runtime (AD-2), and this process may or
// may not have loaded it (a root `bun test` shares one process), so every row
// runs in a fresh `bun` child from the repo root: no runtime at all, the
// runtime loaded first, Mockery loaded first and the runtime after it, and the
// runtime loaded after Mockery's exceptions were built.
import { expect } from "bun:test";
import { resolve } from "node:path";
import { xaravelTest } from "@xaravel/assert";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const SPAWN_TIMEOUT = 50_000;
const CHILD_TIMEOUT = 4 * SPAWN_TIMEOUT + 20_000;

/** The PHP classes the copies stand for. */
const SPL = ["Exception", "RuntimeException", "LogicException", "InvalidArgumentException", "BadFunctionCallException", "BadMethodCallException", "OutOfBoundsException", "UnexpectedValueException"] as const;

/** PHP's chain of each SPL class, the class first (`class_parents`, XT-runtime-35). */
const CHAIN: Record<(typeof SPL)[number], readonly string[]> = {
  Exception: ["Exception"],
  RuntimeException: ["RuntimeException", "Exception"],
  LogicException: ["LogicException", "Exception"],
  InvalidArgumentException: ["InvalidArgumentException", "LogicException", "Exception"],
  BadFunctionCallException: ["BadFunctionCallException", "LogicException", "Exception"],
  BadMethodCallException: ["BadMethodCallException", "BadFunctionCallException", "LogicException", "Exception"],
  OutOfBoundsException: ["OutOfBoundsException", "RuntimeException", "Exception"],
  UnexpectedValueException: ["UnexpectedValueException", "RuntimeException", "Exception"],
};

/** Each row of the child's table and the SPL class Mockery 1.6.15's source extends (or the copy itself). */
const ROWS: Record<string, (typeof SPL)[number]> = {
  Exception: "Exception",
  RuntimeException: "RuntimeException",
  LogicException: "LogicException",
  InvalidArgumentException: "InvalidArgumentException",
  BadFunctionCallException: "BadFunctionCallException",
  BadMethodCallException: "BadMethodCallException",
  OutOfBoundsException: "OutOfBoundsException",
  UnexpectedValueException: "UnexpectedValueException",
  "Mockery\\Exception\\BadMethodCallException": "BadMethodCallException",
  "Mockery\\Exception\\NoMatchingExpectationException": "UnexpectedValueException",
  "Mockery\\Exception\\InvalidCountException": "OutOfBoundsException",
  "Mockery\\Exception\\RuntimeException": "Exception",
  "Mockery\\Exception\\InvalidArgumentException": "InvalidArgumentException",
  "Mockery\\Exception": "UnexpectedValueException",
  "Mockery\\CountValidator\\Exception": "OutOfBoundsException",
  "Mockery\\Exception\\InvalidOrderException": "UnexpectedValueException",
  "JMac\\Testing\\Exceptions\\DoubleException": "RuntimeException",
};

/**
 * The child: `MODE` is `none`, `runtime-first`, `mockery-first` (Mockery loaded, then the runtime, then the rows
 * built) or `late-load` (rows built, the runtime loaded, nothing new built). It prints one JSON object.
 */
const CHILD = `
const MODE = process.env.XT_SPL_MODE;
const SPL = ${JSON.stringify(SPL)};
const CHAIN = ${JSON.stringify(CHAIN)};
if (MODE === "runtime-first") {
  await import("./packages/runtime/src/index.ts");
}
const P = "./packages/mockery/src/";
const mockery = await import(P + "index.ts");
const copies = {};
for (const name of SPL) {
  copies[name] = (await import(P + "php/" + name + ".ts"))[name];
}
const { Mockery, BadMethodCallException, NoMatchingExpectationException, InvalidCountException, RuntimeException, InvalidArgumentException, Exception: MockeryException, CountValidatorException, InvalidOrderException } = mockery;
// Abstract in TS only: built directly here for its inherited constructor.
const { DoubleException } = await import(P + "JMac/Testing/Exceptions/DoubleException.ts");
const FQCN = Symbol.for("xaravel.class.fqcn");
const A = "./packages/assert/src/";
const { Assert, TestCase } = await import(A + "index.ts");
const { Exception: ExceptionConstraint } = await import(A + "Framework/Constraint/Exception/Exception.ts");
const { testCaseState } = await import(A + "Framework/TestCase.ts");
const { ExceptionComparator } = await import(A + "comparator/ExceptionComparator.ts");
const prev = new Error("prev");
class XtSplFoo { bar() {} }
const unexpectedCall = () => {
  const mock = Mockery.mock(XtSplFoo);
  try { mock.baz(); } catch (e) { return e; }
  return null;
};
const table = [
  ...SPL.map((name) => [name, () => new copies[name]("m", 5, prev)]),
  ["Mockery\\\\Exception\\\\BadMethodCallException", () => new BadMethodCallException("m", 5, prev)],
  ["Mockery\\\\Exception\\\\NoMatchingExpectationException", () => new NoMatchingExpectationException("m", 5, prev)],
  ["Mockery\\\\Exception\\\\InvalidCountException", () => new InvalidCountException("m", 5, prev)],
  ["Mockery\\\\Exception\\\\RuntimeException", () => new RuntimeException("m", 5, prev)],
  ["Mockery\\\\Exception\\\\InvalidArgumentException", () => new InvalidArgumentException("m", 5, prev)],
  ["Mockery\\\\Exception", () => new MockeryException("m", 5, prev)],
  ["Mockery\\\\CountValidator\\\\Exception", () => new CountValidatorException("m", 5, prev)],
  ["Mockery\\\\Exception\\\\InvalidOrderException", () => new InvalidOrderException("m", 5, prev)],
  ["JMac\\\\Testing\\\\Exceptions\\\\DoubleException", () => new DoubleException("m", 5, prev)],
];
const call = (value, method) => (typeof value[method] === "function" ? value[method]() : "(none)");
const describe = (value, map) => ({
  instances: {
    runtime: map === null ? null : SPL.filter((name) => value instanceof map[name]),
    phpError: map === null ? null : value instanceof map.Error,
  },
  copies: SPL.filter((name) => value instanceof copies[name]),
  getters: {
    jsError: value instanceof Error,
    getMessage: call(value, "getMessage"),
    getCode: call(value, "getCode"),
    previous: value.getPrevious() === prev ? "prev" : value.getPrevious(),
    message: value.message,
    name: value.name,
    ownKeys: Reflect.ownKeys(value).map(String),
    code: Object.getOwnPropertyDescriptor(value, "code") === undefined ? "(none)" : { ...Object.getOwnPropertyDescriptor(value, "code") },
    cause: value.cause === prev ? "prev" : value.cause === undefined ? "(none)" : String(value.cause),
  },
});
if (MODE === "late-load") {
  const before = table.map(([, make]) => make());
  before.push(unexpectedCall());
  await import("./packages/runtime/src/index.ts");
  const map = globalThis[Symbol.for("xaravel.php.classes")];
  const linkedBefore = before.map((e) => e instanceof map.Exception);
  // Nothing new is built: an instanceof on a copy links the exceptions already made.
  const onCopy = before[0] instanceof copies.Exception;
  process.stdout.write(JSON.stringify({ linkedBefore, onCopy, rows: before.slice(0, table.length).map((e) => describe(e, map)), unexpected: before.at(-1) instanceof map.BadMethodCallException }));
  process.exit(0);
}
if (MODE === "mockery-first") {
  await import("./packages/runtime/src/index.ts");
}
const map = globalThis[Symbol.for("xaravel.php.classes")] ?? null;
const rows = {};
for (const [label, make] of table) {
  rows[label] = describe(make(), map);
}
const exported = Object.values(mockery).filter((value) => typeof value === "function");
const chain = {};
for (const name of SPL) {
  const parent = Object.getPrototypeOf(copies[name]);
  const above = Object.getPrototypeOf(parent);
  const pparent = Object.getPrototypeOf(copies[name].prototype);
  const pabove = Object.getPrototypeOf(pparent);
  // The PHP parent: the next class in CHAIN, or the JS Error for the root.
  const expected = CHAIN[name].length === 1 ? Error : copies[CHAIN[name][1]];
  chain[name] = {
    internal: !Object.values(copies).includes(parent) && !exported.includes(parent) && parent !== Error && pparent === parent.prototype,
    unfrozen: !Object.isFrozen(parent) && !Object.isFrozen(parent.prototype),
    above: above === expected && pabove === expected.prototype ? "php parent copy" : map !== null && above === map[name] && pabove === map[name].prototype ? "runtime class" : "other",
    frozen: Object.isFrozen(copies[name]) && Object.isFrozen(copies[name].prototype),
  };
}
const out = { map: map !== null, rows, chain, exportsCopies: SPL.some((name) => exported.includes(copies[name])) };
if (map !== null) {
  const failure = unexpectedCall();
  let instanceOf = null;
  try { Assert.assertInstanceOf(map.BadMethodCallException, failure); } catch (e) { instanceOf = e.getMessage(); }
  // A TestCase body under expectException(expected), run as the grader's runLifecycle runs it (runTest: a throw is
  // verified when shouldBeVerifiedFor says so, else it propagates; no throw is assertWasRaised).
  const runTest = (expected, body) => {
    const t = new TestCase();
    t.expectException(expected);
    const state = testCaseState(t);
    try {
      let threw = false;
      try {
        body.call(t);
      } catch (thrown) {
        threw = true;
        if (!state.exception.shouldBeVerifiedFor(thrown)) {
          throw thrown;
        }
        state.exception.verify(thrown);
      }
      if (!threw) {
        state.exception.assertWasRaised();
      }
      return null;
    } catch (e) {
      return [e.constructor[FQCN], e.getMessage().split(". Message was:")[0]];
    }
  };
  const callBaz = function () { Mockery.mock(XtSplFoo).baz(); };
  out.expectException = {
    failure: [failure.constructor[FQCN], failure instanceof map.BadMethodCallException, failure instanceof map.LogicException, failure instanceof map.RuntimeException],
    constraint: new ExceptionConstraint(map.BadMethodCallException).evaluate(failure, "", true),
    assertInstanceOf: instanceOf,
    badMethodCall: runTest(map.BadMethodCallException, callBaz),
    runtimeException: runTest(map.RuntimeException, callBaz),
  };
  // The compares side: the grader's ExceptionComparator takes two Mockery exceptions as \\Exceptions.
  out.comparator = new ExceptionComparator().accepts(unexpectedCall(), unexpectedCall());
  out.delegated = {
    runtimeIsCopy: new map.RuntimeException("x") instanceof copies.RuntimeException,
    copyIsExceptionCopy: new copies.RuntimeException("x") instanceof copies.Exception,
    noMatchIsMockeryBadMethodCall: new NoMatchingExpectationException("x") instanceof BadMethodCallException,
  };
  let coercion = null;
  try { new copies.RuntimeException("m", "x"); } catch (e) { coercion = [e instanceof map.TypeError, e.message]; }
  out.coercion = coercion;
}
process.stdout.write(JSON.stringify(out));
`;

interface Row {
  readonly instances: { readonly runtime: string[] | null; readonly phpError: boolean | null };
  readonly copies: string[];
  readonly getters: Record<string, unknown>;
}

interface ChildOutput {
  readonly map: boolean;
  readonly rows: Record<string, Row>;
  readonly chain: Record<string, Record<string, unknown>>;
  readonly exportsCopies: boolean;
  readonly expectException?: Record<string, unknown>;
  readonly delegated?: Record<string, unknown>;
  readonly coercion?: unknown;
  readonly comparator?: boolean;
}

function runChild(mode: "none" | "runtime-first" | "mockery-first" | "late-load"): unknown {
  const child = Bun.spawnSync([process.execPath, "-e", CHILD], {
    cwd: root,
    env: { ...process.env, XT_SPL_MODE: mode },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  expect({ mode, exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ mode, exitCode: 0, stderr: "" });
  return JSON.parse(child.stdout.toString()) as unknown;
}

xaravelTest("XT-mockery-12", "given the runtime's class map, Mockery's exceptions are instanceof the runtime's SPL classes along PHP's chain, never its \\Error, and expectException matches a Mockery failure as in PHP; without the map, today's chain is kept; getters, message, name and own keys are the same either way (ESC-4.5-1 item 2)", () => {
  const none = runChild("none") as ChildOutput;
  const runtimeFirst = runChild("runtime-first") as ChildOutput;
  const mockeryFirst = runChild("mockery-first") as ChildOutput;

  // Without the map: copy -> internal parent -> parent copy … -> JS Error; instanceof each copy along PHP's chain.
  expect(none.map).toBe(false);
  expect(none.exportsCopies).toBe(false);
  for (const [name, chain] of Object.entries(none.chain)) {
    expect({ name, chain }).toEqual({ name, chain: { internal: true, unfrozen: true, above: "php parent copy", frozen: true } });
  }
  expect(Object.keys(none.rows)).toEqual(Object.keys(ROWS));
  for (const [label, row] of Object.entries(none.rows)) {
    const spl = ROWS[label]!;
    expect({ label, row }).toEqual({
      label,
      row: {
        instances: { runtime: null, phpError: null },
        copies: SPL.filter((name) => CHAIN[spl].includes(name)),
        getters: {
          jsError: true,
          getMessage: "m",
          getCode: 5,
          previous: "prev",
          message: "m",
          name: label.slice(label.lastIndexOf("\\") + 1),
          // Bun 1.4.3's own Error keys (line, column, …) included.
          ownKeys: ["message", "cause", "code", "name", "originalLine", "originalColumn", "line", "column", "sourceURL", "stack"],
          code: { value: 5, writable: true, enumerable: false, configurable: true },
          cause: "prev",
        },
      },
    });
  }

  for (const [mode, run] of [
    ["runtime-first", runtimeFirst],
    ["mockery-first", mockeryFirst],
  ] as const) {
    expect({ mode, map: run.map, exportsCopies: run.exportsCopies }).toEqual({ mode, map: true, exportsCopies: false });
    for (const [name, chain] of Object.entries(run.chain)) {
      expect({ mode, name, chain }).toEqual({ mode, name, chain: { internal: true, unfrozen: true, above: "runtime class", frozen: true } });
    }
    for (const [label, row] of Object.entries(run.rows)) {
      const spl = ROWS[label]!;
      // Each is its runtime SPL classes along PHP's chain (so \Exception) and a JS Error, never a PHP \Error; it is
      // instanceof the same copies as without the map, and its getters, message, name and own keys are unchanged.
      expect({ mode, label, row }).toEqual({
        mode,
        label,
        row: { instances: { runtime: SPL.filter((name) => CHAIN[spl].includes(name)), phpError: false }, copies: none.rows[label]!.copies, getters: none.rows[label]!.getters },
      });
    }
    expect({ mode, expectException: run.expectException }).toEqual({
      mode,
      expectException: {
        failure: ["Mockery\\Exception\\BadMethodCallException", true, true, false],
        constraint: true,
        assertInstanceOf: null,
        // PHPUnit verifies a non-PHPUnit exception: a \BadMethodCallException satisfies the expectation.
        badMethodCall: null,
        // Mockery's BadMethodCallException is a \LogicException, never a \RuntimeException, as in PHP.
        runtimeException: ["PHPUnit\\Framework\\ExpectationFailedException", 'Failed asserting that exception of type "Mockery\\Exception\\BadMethodCallException" matches expected exception "RuntimeException"'],
      },
    });
    expect({ mode, comparator: run.comparator }).toEqual({ mode, comparator: true });
    expect({ mode, delegated: run.delegated }).toEqual({ mode, delegated: { runtimeIsCopy: true, copyIsExceptionCopy: true, noMatchIsMockeryBadMethodCall: false } });
    expect({ mode, coercion: run.coercion }).toEqual({ mode, coercion: [true, "Exception::__construct(): Argument #2 ($code) must be of type int, string given"] });
  }

  // The runtime loaded after Mockery's exceptions exist, nothing new built: an instanceof on a copy links them.
  const lateLoad = runChild("late-load") as { linkedBefore: boolean[]; onCopy: boolean; rows: Row[]; unexpected: boolean };
  expect(lateLoad.linkedBefore).toEqual(Array.from({ length: Object.keys(ROWS).length + 1 }, () => false));
  expect(lateLoad.onCopy).toBe(true);
  expect(lateLoad.unexpected).toBe(true);
  expect(lateLoad.rows).toEqual(Object.entries(ROWS).map(([label, spl]) => ({ instances: { runtime: SPL.filter((name) => CHAIN[spl].includes(name)), phpError: false }, copies: none.rows[label]!.copies, getters: none.rows[label]!.getters })));
}, CHILD_TIMEOUT);
