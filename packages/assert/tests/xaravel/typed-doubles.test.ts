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
// The globals a fixture-free row needs (`Symbol.for('xaravel.api.signature')`,
// `Symbol.for('xaravel.class.lookup')`) are installed with configurable
// defines and restored after it; no class map is ever faked. The Oracle cells
// run in a child `bun` that loads @xaravel/runtime first (AD-2: the grader
// never imports it), so `object` gets the runtime's own `stdClass`.
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { classNameOf, gettype } from "../../src/comparison/PhpValues";
import { evaluateDefault } from "../../src/Framework/MockObject/Generator/Signature";
import { type MockObject, TestCase, xaravelTest } from "../../src/index";
import { type Cell, runCase47 } from "./double-cells";
import { decode, type Output, readRequests, readSignedFixture } from "./oracle-values";
import { REQUEST, TYPED_CELLS, TYPED_ROWS } from "./typed-double-cells";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/9.11.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const SIGNATURE = Symbol.for("xaravel.api.signature");
const LOOKUP = Symbol.for("xaravel.class.lookup");
const PHP_CLASSES = Symbol.for("xaravel.php.classes");
const SPAWN_TIMEOUT = 50_000;
const CHILD_TIMEOUT = 60_000;

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

/**
 * The Oracle cells' TS runs, in a fresh `bun` from the repo root that loads @xaravel/runtime first, so `object`
 * returns the runtime's own `stdClass` (the grader never imports the runtime, AD-2). The child installs the twin's
 * rows and a class lookup that knows `XtTypedBase`, then prints each cell's `runCase47` outcome as JSON.
 */
const CELLS_CHILD = `
await import("./packages/runtime/src/index.ts");
const cells = await import("./packages/assert/tests/xaravel/typed-double-cells.ts");
const { runCase47 } = await import("./packages/assert/tests/xaravel/double-cells.ts");
const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: false, enumerable: false, configurable: true });
define(Symbol.for("xaravel.api.signature"), cells.typedLookup);
define(Symbol.for("xaravel.class.lookup"), (name) => (name === "XtTypedBase" ? cells.XtTypedBase : null));
process.stdout.write(JSON.stringify(cells.TYPED_CELLS.map((cell) => runCase47(cell.ts))));
`;

function runCellsChild(): unknown[] {
  const child = Bun.spawnSync([process.execPath, "-e", CELLS_CHILD], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  expect({ exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
  return JSON.parse(child.stdout.toString()) as unknown[];
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

class XtExtraBase {
  static readonly [CLASS_FQCN]: string = "XtExtraBase";

  base(): unknown {
    return "base";
  }
}

class XtExtra extends XtExtraBase {
  static override readonly [CLASS_FQCN]: string = "XtExtra";

  me(): unknown {
    return this;
  }
  maybe(): unknown {
    return this;
  }
  up(): unknown {
    return this;
  }
  nb(): unknown {
    return null;
  }
  inter(): unknown {
    return null;
  }
  dnf(): unknown {
    return null;
  }
  pad(a?: unknown, b?: unknown): unknown {
    return [a, b];
  }

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

/** A class without a parent class, whose method declares `parent`. */
class XtOrphan {
  static readonly [CLASS_FQCN]: string = "XtOrphan";

  up(): unknown {
    return this;
  }
}

/** A contract token (AD-1) naming its method, as Story 10.1's tokens do. */
const XT_CONTRACT_BRAND = Symbol.for("XtContract");
const XtContract = Object.freeze({
  [CLASS_FQCN]: "XtContract",
  [Symbol.for("xaravel.contract.methods")]: Object.freeze(["find"]),
  [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[XT_CONTRACT_BRAND] === true,
});

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
  ["me", { parameters: [parameter("x", null)], returns: "self", nullable: false }],
  ["maybe", { parameters: [parameter("x", null)], returns: "?self", nullable: true }],
  ["up", { parameters: [], returns: "parent", nullable: false }],
  ["nb", { parameters: [parameter("x", null)], returns: "?XtDep", nullable: true }],
  ["inter", { parameters: [parameter("x", null)], returns: "XtDep&Countable", nullable: false }],
  ["dnf", { parameters: [parameter("x", null)], returns: "(XtDep&Countable)|XtExtra", nullable: false }],
  ["pad", { parameters: [parameter("a", null), parameter("b", "7")], returns: null, nullable: true }],
]);

function extraLookup(fqcn: unknown, member: unknown): unknown {
  if (fqcn === "XtOrphan" && member === "up") {
    return { parameters: [], returns: "parent", nullable: false };
  }
  if (fqcn === "XtContract" && member === "find") {
    return { parameters: [parameter("key", null)], returns: "string", nullable: false };
  }
  return fqcn === "XtExtra" && typeof member === "string" ? (EXTRA_ROWS.get(member) ?? null) : null;
}

/** The thrown cell of a `with(1)` expectation on `method` broken by calling it with 2. */
function withFailure(target: unknown, method: string): Cell {
  return failureOf(() => {
    const test = new TestCase();
    const m = test.createMock(target as typeof XtExtra) as unknown as Record<string, Call> & MockObject;
    m.expects(test.once()).method(method).with(1);
    return m[method]!(2);
  });
}

/** PHPUnit's message for a `with(1)` expectation on `C::m()` broken by calling it with 2, `suffix` after the call. */
function withMessage(declaring: string, target: string, method: string, parameter: string, suffix: string): string {
  return `Expectation for ${target}::${method}() failed.\nParameter ${parameter} for invocation ${declaring}::${method}(2)${suffix} does not match expected value.\nFailed asserting that 2 matches expected 1.`;
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
  expect(["null", "true", "FALSE", "2", "-1", "0.5", "10.0", "1.0E+25", "9223372036854775807", "'x'", "'a\\\\b\\'c'", '"x\\n"', "[]", "['*']", "[2, 100]", "INF", "PHP_EOL", "PHP_INT_MAX", "SORT_REGULAR", "MB_CASE_FOLD", "0755", "0o755", "0x1F", "0b101", "1_000", "-0x10", "0", "0x7FFF_FFFF_FFFF_FFFF"].map(evaluated)).toEqual([
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
    493,
    493,
    31,
    5,
    1000,
    -16,
    0,
    9223372036854775807n,
  ]);
  for (const text of ["089", "0x", "1__0", "['a' => 1]", "Foo::BAR", "new \\Foo()", "Laravel\\Enums\\Case::A", '"$x"', "[Foo::A, Foo::B]", "self::X"]) {
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
    // `self`, `?self` and `parent`, without the class lookup: the declaring class and its parent resolve directly.
    const self = (new TestCase().createMock(XtExtra) as Extra).me() as XtExtra;
    const up = (new TestCase().createMock(XtExtra) as Extra).up() as XtExtraBase;
    expect([self instanceof XtExtra, classNameOf(self).startsWith("TestStub_XtExtra_"), up instanceof XtExtraBase, up instanceof XtExtra, classNameOf(up).startsWith("TestStub_XtExtraBase_")]).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
    expect((new TestCase().createMock(XtExtra) as Extra).maybe()).toBeNull();
    expect(withFailure(XtExtra, "me")?.[1]).toBe(withMessage("XtExtra", "XtExtra", "me", "$x", ": XtExtra"));
    expect(withFailure(XtExtra, "maybe")?.[1]).toBe(withMessage("XtExtra", "XtExtra", "maybe", "$x", ": XtExtra"));
    // `parent` of a class with no named parent.
    expect(failureOf(() => (new TestCase().createMock(XtOrphan) as XtOrphan & MockObject).up())).toEqual([
      "RuntimeException",
      "Return value for XtOrphan::up() cannot be generated: the declaring class XtOrphan has no named parent",
      null,
      0,
    ]);
    // A nullable class type.
    expect((new TestCase().createMock(XtExtra) as Extra).nb()).toBeNull();
    expect(withFailure(XtExtra, "nb")?.[1]).toBe(withMessage("XtExtra", "XtExtra", "nb", "$x", ": XtDep"));
    // An intersection and a DNF type: PHPUnit's messages, and sebastian/type's sorted forms in toString.
    expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).inter())).toEqual([
      "RuntimeException",
      "Return value for XtExtra::inter() cannot be generated because the declared return type is an intersection, please configure a return value for this method",
      null,
      0,
    ]);
    expect(failureOf(() => (new TestCase().createMock(XtExtra) as Extra).dnf())).toEqual([
      "RuntimeException",
      "Return value for XtExtra::dnf() cannot be generated because the declared return type is a union, please configure a return value for this method",
      null,
      0,
    ]);
    expect(withFailure(XtExtra, "inter")?.[1]).toBe(withMessage("XtExtra", "XtExtra", "inter", "$x", ": Countable&XtDep"));
    expect(withFailure(XtExtra, "dnf")?.[1]).toBe(withMessage("XtExtra", "XtExtra", "dnf", "$x", ": (Countable&XtDep)|XtExtra"));
    // A contract token with a row for its FQCN.
    const contract = new TestCase().createMock(XtContract) as unknown as { find(...args: unknown[]): unknown } & MockObject;
    expect([contract.find(), contract instanceof (XtContract as unknown as typeof XtExtra)]).toEqual(["", true]);
    expect(withFailure(XtContract, "find")?.[1]).toBe(withMessage("XtContract", "XtContract", "find", "$key", ": string"));
    // An explicit `undefined` is omitted: the declared default, or null where there is none; never `undefined`.
    const padded = new TestCase().createMock(XtExtra) as Extra;
    padded.method("pad").willReturnCallback((...a: unknown[]) => a);
    expect([padded.pad(1, undefined), padded.pad(undefined, 2), padded.pad(1)]).toEqual([
      [1, 7],
      [null, 2],
      [1, 7],
    ]);
    // `object`: the runtime's stdClass (in the cells' child), or PHPUnit's message when no class map is published.
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
  const outcomes = runCellsChild();
  expect(outcomes).toHaveLength(TYPED_CELLS.length);
  const mismatches: string[] = [];
  TYPED_CELLS.forEach((cell, index) => {
    const oracle = resultValue(output!, index + 2, cell.label);
    const got = outcomes[index];
    if (!Bun.deepEquals(oracle, got, true)) {
      mismatches.push(`${cell.label}:\n    Oracle ${JSON.stringify(oracle)}\n    got    ${JSON.stringify(got)}`);
    }
  });
  expect(mismatches).toEqual([]);
}, CHILD_TIMEOUT);
