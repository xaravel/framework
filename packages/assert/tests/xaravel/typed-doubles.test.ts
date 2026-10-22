// Xaravel Test for Story 9.11's AC4 (XT-assert-20; FR-116, AD-2, AD-15,
// ESC-4.7-1 item 2, ESC-4.8-1 item 1, DIV-6.4). Like 4.1-4.7's tests this is
// plain bun:test: `xaravelTest` is not used to test the grader itself.
//
// F-10: this test has no Upstream test inputs; it is the follow-up of
// ESC-4.7-1 item 2 (PHPUnit's test doubles take the declared return type,
// parameter names and defaults from the signature lookup's row).
//
// Every compared return value, thrown exception, verify outcome and kind-less
// count of the cells comes from the signed Oracle fixture of the XT-assert-20
// request in conformance/oracle-requests/9.11.jsonl; the request's setup and
// exprs are rebuilt from typed-double-cells.ts and must equal the committed
// line, and the rows the fake lookup serves must equal the Oracle's reflection
// of the PHP twin. A missing, unsigned or errored fixture fails the test; it
// is never skipped. The fixture-free rows run first.
//
// The globals a row needs (`Symbol.for('xaravel.api.signature')`,
// `Symbol.for('xaravel.class.lookup')`, and `Symbol.for('xaravel.php.classes')`
// when no runtime has published it) are installed with configurable defines
// and restored after it.
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { classNameOf, gettype } from "../../src/comparison/PhpValues";
import { evaluateDefault } from "../../src/Framework/MockObject/Generator/Signature";
import { type MockObject, TestCase, xaravelTest } from "../../src/index";
import { type Cell, runCase47 } from "./double-cells";
import { decode, type Output, readRequests, readSignedFixture } from "./oracle-values";
import { REQUEST, TYPED_CELLS, TYPED_ROWS, typedLookup, XtTyped, XtTypedBase } from "./typed-double-cells";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/9.11.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const SIGNATURE = Symbol.for("xaravel.api.signature");
const LOOKUP = Symbol.for("xaravel.class.lookup");
const PHP_CLASSES = Symbol.for("xaravel.php.classes");

/** Installs `values` on `globalThis` with configurable defines (`null` removes one), runs `fn`, and restores them. */
function withGlobals<T>(values: ReadonlyMap<symbol, unknown>, fn: () => T): T {
  const saved = new Map<symbol, PropertyDescriptor | undefined>();
  for (const [key, value] of values) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    if (value === null) {
      delete (globalThis as Record<symbol, unknown>)[key];
    } else {
      Object.defineProperty(globalThis, key, { value, writable: false, enumerable: false, configurable: true });
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, previous] of saved) {
      if (previous === undefined) {
        delete (globalThis as Record<symbol, unknown>)[key];
      } else {
        Object.defineProperty(globalThis, key, previous);
      }
    }
  }
}

/** A `stdClass` for `object` returns when no runtime has published its class map. */
class FakeStdClass {
  static readonly [CLASS_FQCN]: string = "stdClass";
}

/** The XT-assert-20 globals: the twin's rows, a class lookup that knows `XtTypedBase`, and a class map if none. */
function typedGlobals(): Map<symbol, unknown> {
  const globals = new Map<symbol, unknown>([
    [SIGNATURE, typedLookup],
    [LOOKUP, (name: string): unknown => (name === "XtTypedBase" ? XtTypedBase : null)],
  ]);
  if ((globalThis as Record<symbol, unknown>)[PHP_CLASSES] === undefined) {
    globals.set(PHP_CLASSES, Object.freeze({ stdClass: FakeStdClass }));
  }
  return globals;
}

// ---------------------------------------------------------------------------
// Fixture-free twins: what the Oracle cannot show (a float return, a default the grader does not evaluate, the
// lookups missing).

class XtDep {
  static readonly [CLASS_FQCN]: string = "XtDep";

  name(): unknown {
    return "dep";
  }
}

class XtExtra {
  static readonly [CLASS_FQCN]: string = "XtExtra";

  fl(): unknown {
    return 1.5;
  }
  nd(x?: unknown): unknown {
    return x;
  }
  cls(): unknown {
    return new XtDep();
  }
  nv(): unknown {
    throw new Error("nv");
  }
  obj(): unknown {
    return {};
  }
  map(key?: unknown, flag?: unknown): unknown {
    return [key, flag];
  }
  i(a?: unknown): unknown {
    return a;
  }
}

/** A class with no row at all (a test-local class). */
class XtLocal {
  static readonly [CLASS_FQCN]: string = "XtLocal";

  i(first?: unknown): unknown {
    return first;
  }
}

function parameter(name: string, defaultText: string | null): object {
  return { name, type: null, nullable: true, default: defaultText, optional: defaultText !== null, variadic: false, byRef: false };
}

const EXTRA_ROWS = new Map<string, object>([
  ["fl", { parameters: [], returns: "float", nullable: false }],
  ["nd", { parameters: [parameter("x", "Foo::BAR")], returns: null, nullable: true }],
  ["cls", { parameters: [], returns: "XtDep", nullable: false }],
  ["nv", { parameters: [], returns: "never", nullable: false }],
  ["obj", { parameters: [], returns: "object", nullable: false }],
  ["map", { parameters: [parameter("key", null), parameter("flag", "Foo::BAR")], returns: null, nullable: true }],
  ["i", { parameters: [parameter("declared", null)], returns: "int", nullable: false }],
]);

function extraLookup(fqcn: unknown, member: unknown): unknown {
  return fqcn === "XtExtra" && typeof member === "string" ? (EXTRA_ROWS.get(member) ?? null) : null;
}

type Extra = XtExtra & MockObject;
type Call = (...args: unknown[]) => unknown;

function failureOf(run: () => unknown): Cell {
  const [, thrown] = runCase47(function () {
    return run();
  });
  return thrown;
}

// ---------------------------------------------------------------------------
// The Oracle

function oracleOutput(problems: string[]): Output | null {
  const requests = readRequests(join(root, REQUESTS)).filter((request) => request.id === REQUEST.id);
  expect(requests).toHaveLength(1);
  const request = requests[0]!;
  // The committed request is the table's.
  expect({ setup: request.setup, exprs: request.exprs }).toEqual({ setup: [...REQUEST.setup], exprs: [...REQUEST.exprs] });
  const path = `${FIXTURES}/${request.sha256}.json`;
  try {
    const output = readSignedFixture(join(root, path), request.sha256, readFileSync(join(root, PUBLIC_KEY), "utf8"));
    if (output.error !== null) {
      throw new Error(`${path}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
    }
    if (output.results.length !== REQUEST.exprs.length) {
      throw new Error(`${path}: expected ${REQUEST.exprs.length} results, got ${output.results.length}`);
    }
    return output;
  } catch (error) {
    problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    return null;
  }
}

function resultValue(output: Output, index: number, where: string): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${where}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decode(result.value);
}

xaravelTest("XT-assert-20", "given Story 5.4's signature lookup and a PHPUnit test double whose target has a surface row for the called method, an unconfigured call returns PHPUnit's generated value, omitted arguments and willReturnMap rows get the declared defaults, parameters are named as declared and toString carries ': <type>', matching the Oracle; with no row, today's null behaviour holds (ESC-4.7-1 item 2)", () => {
  // Fixture-free: the default evaluator, on the forms the committed surface uses.
  const evaluated = (text: string): unknown => {
    const result = evaluateDefault(text);
    return result === null ? "(not evaluated)" : result.value;
  };
  expect(["null", "true", "FALSE", "2", "-1", "0.5", "10.0", "1.0E+25", "9223372036854775807", "'x'", "'a\\\\b\\'c'", '"x\\n"', "[]", "['*']", "[2, 100]", "INF", "PHP_EOL", "PHP_INT_MAX", "SORT_REGULAR", "MB_CASE_FOLD"].map(evaluated)).toEqual([
    null,
    true,
    false,
    2,
    -1,
    0.5,
    10,
    1e25,
    9223372036854775807n,
    "x",
    "a\\b'c",
    "x\n",
    [],
    ["*"],
    [2, 100],
    Infinity,
    "\n",
    9223372036854775807n,
    0,
    3,
  ]);
  for (const text of ["['a' => 1]", "Foo::BAR", "new \\Foo()", "Laravel\\Enums\\Case::A", '"$x"', "[Foo::A, Foo::B]", "self::X"]) {
    expect({ text, value: evaluateDefault(text) }).toEqual({ text, value: null });
  }

  // No lookup installed, or a target with no row: today's null behaviour, names from the JS source, no suffix.
  for (const signature of [null, extraLookup]) {
    withGlobals(new Map([[SIGNATURE, signature]]), () => {
      const [result, thrown] = runCase47(function () {
        const m = this.createMock(XtLocal) as XtLocal & MockObject;
        const unconfigured = m.i();
        m.expects(this.once()).method("i").with(1);
        (m.i as Call)(2);
        return unconfigured;
      });
      expect({ signature: signature !== null, result, message: thrown?.[1] }).toEqual({
        signature: signature !== null,
        result: null,
        message: "Expectation for XtLocal::i() failed.\nParameter $first for invocation XtLocal::i(2) does not match expected value.\nFailed asserting that 2 matches expected 1.",
      });
    });
  }

  withGlobals(new Map<symbol, unknown>([[SIGNATURE, extraLookup], [LOOKUP, null]]), () => {
    // A float return is a plain 0, which reads as an int: a Ported Test that depends on the float configures it (DIV-9.4).
    const [fl] = runCase47(function () {
      const value = (this.createMock(XtExtra) as Extra).fl();
      return [value, gettype(value)];
    });
    expect(fl).toEqual([0, "integer"]);
    // The row's names, its return type in toString.
    expect(
      failureOf(() => {
        const test = new TestCase();
        const m = test.createMock(XtExtra) as Extra;
        m.expects(test.once()).method("i").with(1);
        return m.i(2);
      })?.[1],
    ).toBe("Expectation for XtExtra::i() failed.\nParameter $declared for invocation XtExtra::i(2): int does not match expected value.\nFailed asserting that 2 matches expected 1.");
    // A default the grader does not evaluate: passing the argument works, omitting it throws PHPUnit's RuntimeException.
    const m = new TestCase().createMock(XtExtra) as Extra;
    m.method("nd").willReturnCallback((x: unknown) => x);
    expect(m.nd("given")).toBe("given");
    const omitted: Cell = ["RuntimeException", "Default value Foo::BAR of parameter $x of XtExtra::nd() cannot be evaluated by @xaravel/assert; pass the argument", null, 0];
    expect(failureOf(() => m.nd())).toEqual(omitted);
    // … and so does a short willReturnMap row that would need it; a full row does not.
    expect(failureOf(() => new TestCase().createMock(XtExtra).method("map").willReturnMap([["k", "v"]]))).toEqual([
      "RuntimeException",
      "Default value Foo::BAR of parameter $flag of XtExtra::map() cannot be evaluated by @xaravel/assert; pass the argument",
      null,
      0,
    ]);
    const full = new TestCase().createMock(XtExtra) as Extra;
    full.method("map").willReturnMap([["k", 1, "v"]]);
    expect(full.map("k", 1)).toBe("v");
    // never.
    expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).nv())).toEqual(["NeverReturningMethodException", "Method XtExtra::nv() is declared to never return", null, 0]);
    // A class-typed return without the class lookup, then with one that does not know the class.
    expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).cls())).toEqual([
      "RuntimeException",
      `Return value for XtExtra::cls() cannot be generated: the class "XtDep" cannot be resolved: Symbol.for('xaravel.class.lookup') is not installed`,
      null,
      0,
    ]);
    withGlobals(new Map([[LOOKUP, (): null => null]]), () => {
      expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).cls())).toEqual([
        "RuntimeException",
        `Return value for XtExtra::cls() cannot be generated: Symbol.for('xaravel.class.lookup') does not resolve the class "XtDep"`,
        null,
        0,
      ]);
    });
    // With a lookup that resolves it: a stub of the class.
    withGlobals(new Map([[LOOKUP, (name: string): unknown => (name === "XtDep" ? XtDep : null)]]), () => {
      const stub = (new TestCase().createMock(XtExtra) as Extra).cls() as XtDep;
      expect([stub instanceof XtDep, classNameOf(stub).startsWith("TestStub_XtDep_"), stub.name()]).toEqual([true, true, null]);
    });
    // `object`: the runtime's stdClass, or PHPUnit's message when no class map is published.
    const map = (globalThis as Record<symbol, unknown>)[PHP_CLASSES] as Record<string, new () => object> | undefined;
    if (map === undefined) {
      expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).obj())).toEqual([
        "RuntimeException",
        "Return value for XtExtra::obj() cannot be generated, please configure a return value for this method",
        null,
        0,
      ]);
    } else {
      expect((new TestCase().createMock(XtExtra) as Extra).obj()).toBeInstanceOf(map["stdClass"]!);
    }
  });

  // The lookup is read at each call, never cached: a double made before it is installed still uses it.
  const early = new TestCase().createMock(XtExtra) as Extra;
  expect(withGlobals(new Map([[SIGNATURE, null]]), () => early.fl())).toBeNull();
  expect(withGlobals(new Map([[SIGNATURE, extraLookup]]), () => early.fl())).toBe(0);

  // Then the cells, against the signed fixture.
  const problems: string[] = [];
  const output = oracleOutput(problems);
  expect(problems).toEqual([]);
  // The rows the fake lookup serves are the Oracle's reflection of the PHP twin, in api-surface.php's form.
  expect([resultValue(output!, 0, "rows of XtTypedBase"), resultValue(output!, 1, "rows of XtTyped")]).toEqual([TYPED_ROWS["XtTypedBase"], TYPED_ROWS["XtTyped"]]);
  const mismatches = withGlobals(typedGlobals(), () => {
    const found: string[] = [];
    TYPED_CELLS.forEach((cell, index) => {
      const oracle = resultValue(output!, index + 2, cell.label);
      const got = runCase47(cell.ts);
      if (!Bun.deepEquals(oracle, got, true)) {
        found.push(`${cell.label}:\n    Oracle ${JSON.stringify(oracle)}\n    got    ${JSON.stringify(got)}`);
      }
    });
    return found;
  });
  expect(mismatches).toEqual([]);
  void XtTyped;
});
