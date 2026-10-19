// The grader's Mockery API coverage report (Story 4.6, FR-100, AC 3).
//
//   bun tools/mockery-coverage/coverage.ts [--root <dir>]
//       (`bun run mockery:coverage`) reads <root>/conformance/scans/mockery-api.jsonl
//       and lists every scan name that has no implementation in
//       @xaravel/mockery (<root>/packages/mockery/src/index.ts, imported), then
//       a summary line
//
// A scan line is `{"name", "static", "count"}`. A name is implemented when
// calling it does what it is for (Epic 4 retro item 5, finding R5), not
// merely when a function of that name exists: PROBES holds one small probe
// per non-Double scan name, which uses the name on `Mockery` or on a mock or
// expectation and checks an effect (a return value, a thrown exception's
// class, or the verdict of `Mockery.close()`). Each probe runs in a fresh run
// of the `Symbol.for('xaravel.mockery.run')` protocol, so one failing probe
// cannot affect another; a name with no probe, or whose probe throws or
// returns false (or whose run's own close fails), is missing, except that a
// name in BUILT_ON is not listed while a name it is built on is missing too.
//
// `returns`, `throws` and `resolves` are `jasonmccreary/double`'s
// (`JMac\Testing\Double`, used by the ai, mcp and boost suites), not
// Mockery's; until an owner ports Double they are listed as pending
// (ESC-4.6-1 item 6) and do not fail the report.
//
// Lines, on stdout, one per unimplemented name, names sorted, missing first:
//
//   missing mockery: <name>
//   pending ESC-4.6-1: <name> (JMac\Testing\Double)
//
// Exit codes: 0 when nothing is missing (pending names are allowed), 1 when a
// name is missing (or the scan or the grader cannot be read), 2 on a usage
// error. The report is advisory in CI like `assert:coverage` (ESC-4.6-1 item 7).
import { join } from "node:path";
import { type ReportLine, readJsonl, runReport } from "../coverage-report/report";

const SCAN = "conformance/scans/mockery-api.jsonl";
const GRADER = "packages/mockery/src/index.ts";

/** The scan names that are `jasonmccreary/double`'s, not Mockery's (ESC-4.6-1 item 6). */
export const DOUBLE_NAMES: ReadonlySet<string> = new Set(["resolves", "returns", "throws"]);

export interface ScanName {
  readonly name: string;
  readonly static: boolean;
}

/** The scan's names, in file order. */
export function readScanNames(root: string): ScanName[] {
  return readJsonl(root, SCAN, (parsed, lineNumber) => {
    if (typeof parsed["name"] !== "string" || parsed["name"] === "") {
      throw new Error(`${SCAN}:${lineNumber}: no name`);
    }
    if (typeof parsed["static"] !== "boolean") {
      throw new Error(`${SCAN}:${lineNumber}: no static flag`);
    }
    return { name: parsed["name"], static: parsed["static"] };
  });
}

export interface CoverageLine extends ReportLine {
  readonly name: string;
}

type ErrorClass = abstract new (...args: never[]) => Error;

/** What a probe uses: the grader's exports (`Mockery` and its exception classes), loosely typed. */
interface Api {
  readonly Mockery: any;
  readonly InvalidCountException: ErrorClass;
  readonly InvalidOrderException: ErrorClass;
  readonly NoMatchingExpectationException: ErrorClass;
  readonly BadMethodCallException: ErrorClass;
}

/** A class to mock, partially or not: its own `f` returns `"real"`. */
class ProbeTarget {
  f(..._args: unknown[]): unknown {
    return "real";
  }
}

/** Whether `fn` throws an instance of `type`. */
function throwsA(fn: () => unknown, type: ErrorClass): boolean {
  try {
    fn();
  } catch (error) {
    return error instanceof type;
  }
  return false;
}

/** Whether `fn` throws nothing. */
function succeeds(fn: () => unknown): boolean {
  try {
    fn();
  } catch {
    return false;
  }
  return true;
}

type Probe = (api: Api) => boolean;

/** One probe per non-Double scan name; each returns true only if the name works. */
export const PROBES: ReadonlyMap<string, Probe> = new Map<string, Probe>([
  // Statics.
  ["any", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").with(Mockery.any()).andReturn(1);
    return mock.f("anything") === 1;
  }],
  ["capture", ({ Mockery }) => {
    const ref = { value: null as unknown };
    const mock = Mockery.mock();
    mock.shouldReceive("f").with(Mockery.capture(ref));
    mock.f(7);
    return ref.value === 7;
  }],
  ["close", ({ Mockery, InvalidCountException }) => {
    Mockery.mock().shouldReceive("f").once();
    return throwsA(() => Mockery.close(), InvalidCountException);
  }],
  ["mock", ({ Mockery }) => {
    const mock = Mockery.mock(ProbeTarget);
    mock.shouldReceive("f").andReturn(3);
    return mock instanceof ProbeTarget && mock.f() === 3;
  }],
  ["on", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").with(Mockery.on((argument: unknown) => argument === 2)).andReturn("two");
    return mock.f(2) === "two" && throwsA(() => mock.f(3), NoMatchingExpectationException);
  }],
  ["self", ({ Mockery }) => {
    const mock = Mockery.mock();
    return Mockery.self() === mock;
  }],
  ["spy", ({ Mockery, InvalidCountException }) => {
    const spy = Mockery.spy();
    return spy.f(1) === null && succeeds(() => spy.shouldHaveReceived("f")) && throwsA(() => spy.shouldHaveReceived("g"), InvalidCountException);
  }],
  ["type", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").with(Mockery.type("string")).andReturn("ok");
    return mock.f("a") === "ok" && throwsA(() => mock.f(1), NoMatchingExpectationException);
  }],
  // Mock and expectation members.
  ["allows", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.allows({ f: 1 });
    return mock.f() === 1;
  }],
  ["andReturn", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturn(1, 2);
    return mock.f() === 1 && mock.f() === 2 && mock.f() === 2;
  }],
  ["andReturnArg", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturnArg(1);
    return mock.f(5, 6) === 6;
  }],
  ["andReturnFalse", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturn(1).andReturnFalse();
    return mock.f() === false;
  }],
  ["andReturnNull", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturn(1).andReturnNull();
    return mock.f() === null;
  }],
  ["andReturnSelf", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturnSelf();
    return mock.f() === mock;
  }],
  ["andReturnTrue", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturn(1).andReturnTrue();
    return mock.f() === true;
  }],
  ["andReturnUsing", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturnUsing((value: number) => value * 2);
    return mock.f(4) === 8;
  }],
  ["andReturnValues", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturnValues([1, 2]);
    return mock.f() === 1 && mock.f() === 2;
  }],
  ["andThrow", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andThrow(new RangeError("probe"));
    return throwsA(() => mock.f(), RangeError);
  }],
  ["andThrowExceptions", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andThrowExceptions([new RangeError("first"), new TypeError("second")]);
    return throwsA(() => mock.f(), RangeError) && throwsA(() => mock.f(), TypeError);
  }],
  ["atLeast", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").atLeast().once();
    mock.f();
    mock.f();
    return succeeds(() => Mockery.close());
  }],
  ["byDefault", ({ Mockery }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").andReturn(1).byDefault();
    mock.shouldReceive("f").andReturn(2);
    const other = Mockery.mock();
    other.shouldReceive("g").andReturn(1);
    other.byDefault();
    other.shouldReceive("g").andReturn(2);
    return mock.f() === 2 && other.g() === 2;
  }],
  ["expects", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.expects("f").andReturn(1);
    if (mock.f() !== 1) {
      return false;
    }
    Mockery.mock().expects("g");
    return throwsA(() => Mockery.close(), InvalidCountException);
  }],
  ["getMock", ({ Mockery }) => {
    const mock = Mockery.mock();
    return mock.shouldReceive("f").getMock() === mock;
  }],
  ["globally", ({ Mockery, InvalidOrderException }) => {
    const first = Mockery.mock();
    const second = Mockery.mock();
    first.shouldReceive("f").globally().ordered();
    second.shouldReceive("g").globally().ordered();
    return throwsA(() => {
      second.g();
      first.f();
    }, InvalidOrderException);
  }],
  ["makePartial", ({ Mockery }) => {
    const mock = Mockery.mock(ProbeTarget).makePartial();
    return mock.f() === "real";
  }],
  ["never", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").never();
    return throwsA(() => {
      mock.f();
      Mockery.close();
    }, InvalidCountException);
  }],
  ["once", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").once();
    return throwsA(() => {
      mock.f();
      mock.f();
      Mockery.close();
    }, InvalidCountException);
  }],
  ["ordered", ({ Mockery, InvalidOrderException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").ordered();
    mock.shouldReceive("g").ordered();
    return throwsA(() => {
      mock.g();
      mock.f();
    }, InvalidOrderException);
  }],
  ["passthru", ({ Mockery }) => {
    const mock = Mockery.mock(ProbeTarget);
    mock.shouldReceive("f").passthru();
    return mock.f() === "real";
  }],
  ["shouldAllowMockingProtectedMethods", ({ Mockery }) => {
    const mock = Mockery.mock(ProbeTarget);
    if (mock.shouldAllowMockingProtectedMethods() !== mock) {
      return false;
    }
    mock.shouldReceive("f").andReturn(1);
    return mock.f() === 1;
  }],
  ["shouldHaveReceived", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f");
    mock.f(1);
    return succeeds(() => mock.shouldHaveReceived("f")) && throwsA(() => mock.shouldHaveReceived("g"), InvalidCountException);
  }],
  ["shouldIgnoreMissing", ({ Mockery, BadMethodCallException }) => {
    const plain = Mockery.mock();
    if (!throwsA(() => plain.f(), BadMethodCallException)) {
      return false;
    }
    const mock = Mockery.mock();
    return mock.shouldIgnoreMissing("default") === mock && mock.f() === "default";
  }],
  ["shouldNotHaveReceived", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f");
    mock.f();
    return succeeds(() => mock.shouldNotHaveReceived("g")) && throwsA(() => mock.shouldNotHaveReceived("f"), InvalidCountException);
  }],
  ["shouldNotReceive", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldNotReceive("f");
    return throwsA(() => {
      mock.f();
      Mockery.close();
    }, InvalidCountException);
  }],
  ["shouldReceive", ({ Mockery, BadMethodCallException }) => {
    const mock = Mockery.mock();
    if (!throwsA(() => mock.f(), BadMethodCallException)) {
      return false;
    }
    mock.shouldReceive("f").andReturn(1);
    return mock.f() === 1;
  }],
  ["times", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").times(2);
    mock.f();
    return throwsA(() => Mockery.close(), InvalidCountException);
  }],
  ["twice", ({ Mockery, InvalidCountException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").twice();
    mock.f();
    return throwsA(() => Mockery.close(), InvalidCountException);
  }],
  ["with", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").with(1).andReturn("one");
    return mock.f(1) === "one" && throwsA(() => mock.f(2), NoMatchingExpectationException);
  }],
  ["withArgs", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").withArgs([1, 2]).andReturn("ok");
    return mock.f(1, 2) === "ok" && throwsA(() => mock.f(1), NoMatchingExpectationException);
  }],
  ["withNoArgs", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").withNoArgs().andReturn("ok");
    return mock.f() === "ok" && throwsA(() => mock.f(1), NoMatchingExpectationException);
  }],
  ["withSomeOfArgs", ({ Mockery, NoMatchingExpectationException }) => {
    const mock = Mockery.mock();
    mock.shouldReceive("f").withSomeOfArgs(1).andReturn("ok");
    return mock.f(1, 2) === "ok" && throwsA(() => mock.f(2, 3), NoMatchingExpectationException);
  }],
  ["zeroOrMoreTimes", ({ Mockery }) => {
    Mockery.mock().shouldReceive("f").once().zeroOrMoreTimes();
    return succeeds(() => Mockery.close());
  }],
]);

/**
 * Names Mockery defines through another scan name (`spy` is `mock(...)->shouldIgnoreMissing()`). When both fail, only
 * the name it is built on is listed: the report names the cause once, and still fails.
 */
export const BUILT_ON: ReadonlyMap<string, readonly string[]> = new Map([["spy", ["shouldIgnoreMissing"]]]);

type RunProtocol = (fn: () => unknown) => Promise<unknown>;

async function loadApi(root: string): Promise<{ api: Api; run: RunProtocol }> {
  const grader = (await import(join(root, GRADER))) as Record<string, unknown>;
  for (const name of ["Mockery", "InvalidCountException", "InvalidOrderException", "NoMatchingExpectationException", "BadMethodCallException"]) {
    if (typeof grader[name] !== "function") {
      throw new Error(`${GRADER} exports no ${name} class`);
    }
  }
  const run = (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.mockery.run")];
  if (typeof run !== "function") {
    throw new Error(`${GRADER} installs no Symbol.for('xaravel.mockery.run') protocol`);
  }
  return { api: grader as unknown as Api, run: run as RunProtocol };
}

/** Whether `name`'s probe returns true in a fresh run, and the run closes cleanly. */
async function works(api: Api, run: RunProtocol, name: string): Promise<boolean> {
  const probe = PROBES.get(name);
  if (probe === undefined) {
    return false;
  }
  try {
    return (await run(() => probe(api))) === true;
  } catch {
    return false;
  }
}

/** Every unimplemented scan name, missing before pending, names sorted. */
export async function coverage(root: string): Promise<{ names: number; lines: CoverageLine[] }> {
  const names = readScanNames(root);
  const { api, run } = await loadApi(root);
  const lines: CoverageLine[] = [];
  const failing = new Set<string>();
  for (const { name, static: isStatic } of names) {
    if (!isStatic && DOUBLE_NAMES.has(name)) {
      lines.push({ status: "pending", name, text: `pending ESC-4.6-1: ${name} (JMac\\Testing\\Double)` });
    } else if (!(await works(api, run, name))) {
      failing.add(name);
    }
  }
  for (const name of failing) {
    if (!(BUILT_ON.get(name) ?? []).some((base) => failing.has(base))) {
      lines.push({ status: "missing", name, text: `missing mockery: ${name}` });
    }
  }
  const order = ["missing", "pending"];
  lines.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: names.length, lines };
}

if (import.meta.main) {
  process.exit(
    await runReport(
      { tool: "mockery:coverage", usage: "bun tools/mockery-coverage/coverage.ts [--root <dir>]", label: "Mockery API coverage", coverage },
      process.argv.slice(2),
    ),
  );
}
