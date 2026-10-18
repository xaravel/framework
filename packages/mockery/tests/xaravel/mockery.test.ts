// Xaravel Tests for Story 4.5 (Mockery core; FR-100, AD-2, AD-9, AD-15). One
// test per AC, in order, after the fixture-free checks. Like Epic 4's other
// grader tests these are plain bun:test: `xaravelTest` is not used to test the
// grader itself.
//
// Every expected outcome and message comes from a signed Oracle fixture of a
// request in conformance/oracle-requests/4.5.jsonl (real Mockery 1.6.15). Each
// request's setup and exprs are rebuilt from scenarios.ts and must equal the
// committed line, so the TS twins are the scenarios the Oracle ran. A missing,
// unsigned or errored fixture fails the test; it is never skipped.
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import * as api from "../../src/index";
import { BadMethodCallException, CompositeExpectation, Container, InvalidArgumentException, InvalidCountException, Mockery, NoMatchingExpectationException } from "../../src/index";
import { BadMethodCallException as SplBadMethodCallException } from "../../src/php/BadMethodCallException";
import { InvalidArgumentException as SplInvalidArgumentException } from "../../src/php/InvalidArgumentException";
import { UnexpectedValueException as SplUnexpectedValueException } from "../../src/php/UnexpectedValueException";
import { type Output, readRequests, readSignedFixture } from "../../../assert/tests/xaravel/oracle-values";
import { normalize, oracleCell, scenarioMismatches } from "./cells";
import { SCENARIOS, type Scenario, SETUP, wrapPhp, XtBar, XtFoo } from "./scenarios";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUEST_FILE = "conformance/oracle-requests/4.5.jsonl";
const FIXTURES = "conformance/fixtures/mockery";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const FIXTURE = "./packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts";
const CHILD_TIMEOUT = 60_000;
const SPAWN_TIMEOUT = 50_000;

/** The 14 AC 1 names; each runs in at least one XT-mockery-1 scenario. */
const CORE_API = ["shouldReceive", "once", "twice", "times", "never", "atLeast", "atMost", "with", "withArgs", "withAnyArgs", "andReturn", "andReturnValues", "andThrow", "ordered"];

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

type Id = Scenario["id"];

/** The signed Oracle output of `id`'s one request, after checking the request equals the table's. */
function oracleOutput(id: Id): Output {
  const requests = readRequests(join(root, REQUEST_FILE)).filter((request) => request.id === id);
  expect(requests).toHaveLength(1);
  const request = requests[0]!;
  expect({ setup: request.setup, exprs: request.exprs }).toEqual({ setup: [...SETUP], exprs: SCENARIOS.filter((scenario) => scenario.id === id).map((scenario) => wrapPhp(scenario.php)) });
  const publicKey = readFileSync(join(root, PUBLIC_KEY), "utf8");
  try {
    return readSignedFixture(join(root, FIXTURES, `${request.sha256}.json`), request.sha256, publicKey);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
  }
}

/** Every scenario of `id` against the Oracle: no mismatch, and at least one cell. */
function checkScenarios(id: Id): void {
  const output = oracleOutput(id);
  const { cells, mismatches } = scenarioMismatches(id, SCENARIOS.filter((scenario) => scenario.id === id), output, Mockery);
  expect(mismatches).toEqual([]);
  expect(cells).toBeGreaterThan(0);
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  } finally {
    try {
      Mockery.close();
    } catch {
      // the probe's own verify error is not under test
    }
  }
  return null;
}

test("fixture-free: the globals, the frozen exports, the imports and the mock object's dispatch", () => {
  // The two globals are installed on load, non-writable and non-configurable.
  for (const name of ["xaravel.mockery.mock", "xaravel.mockery.run"]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, Symbol.for(name));
    expect(typeof descriptor?.value).toBe("function");
    expect({ writable: descriptor?.writable, configurable: descriptor?.configurable }).toEqual({ writable: false, configurable: false });
  }
  const viaGlobal = (globalThis as unknown as Record<symbol, (target: unknown) => unknown>)[Symbol.for("xaravel.mockery.mock")]!(XtFoo);
  expect(viaGlobal).toBeInstanceOf(XtFoo);
  Mockery.close();

  // A global already defined is left alone.
  const script = `const run = async (fn) => fn(); globalThis[Symbol.for("xaravel.mockery.run")] = run; await import(${JSON.stringify(join(root, "packages/mockery/src/index.ts"))}); if (globalThis[Symbol.for("xaravel.mockery.run")] !== run) { throw new Error("replaced"); } console.log("kept");`;
  const child = Bun.spawnSync([process.execPath, "--eval", script], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  expect({ exitCode: child.exitCode, stdout: child.stdout.toString().trim(), stderr: child.stderr.toString() }).toEqual({ exitCode: 0, stdout: "kept", stderr: "" });

  // The export list, each export and its prototype frozen.
  expect(Object.keys(api).sort()).toEqual(
    [
      "AtLeast",
      "AtMost",
      "BadMethodCallException",
      "CompositeExpectation",
      "Container",
      "CountValidatorAbstract",
      "CountValidatorException",
      "Exact",
      "Exception",
      "Expectation",
      "ExpectationDirector",
      "InvalidArgumentException",
      "InvalidCountException",
      "InvalidOrderException",
      "Mockery",
      "NoMatchingExpectationException",
      "RuntimeException",
    ].sort(),
  );
  for (const [name, value] of Object.entries(api)) {
    expect(() => {
      (api as Record<string, unknown>)[name] = null;
    }).toThrow(TypeError);
    const fn = value as unknown as Record<string, unknown>;
    expect(Object.isFrozen(fn)).toBe(true);
    expect(Object.isFrozen(fn["prototype"])).toBe(true);
    expect(() => {
      (fn["prototype"] as Record<string, unknown>)["patched"] = true;
    }).toThrow(TypeError);
  }

  // The manifest's only runtime edge is @xaravel/assert, and the graph check passes (AD-2).
  const manifest = JSON.parse(readFileSync(join(root, "packages/mockery/package.json"), "utf8")) as Record<string, unknown>;
  expect(manifest["dependencies"]).toEqual({ "@xaravel/assert": "workspace:*" });
  for (const field of ["peerDependencies", "optionalDependencies"]) {
    expect(manifest[field]).toBeUndefined();
  }
  const graph = Bun.spawnSync([process.execPath, "tools/graph/graph.ts"], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  expect({ exitCode: graph.exitCode, stderr: graph.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });

  // Every src/ import is relative, a node: builtin or @xaravel/assert's public index.
  const srcDir = join(root, "packages/mockery/src");
  const bad: string[] = [];
  for (const file of new Bun.Glob("**/*.ts").scanSync(srcDir)) {
    const text = readFileSync(join(srcDir, file), "utf8");
    for (const { path } of new Bun.Transpiler({ loader: "ts" }).scanImports(text)) {
      if (!(path.startsWith("./") || path.startsWith("../") || path.startsWith("node:") || path === "@xaravel/assert")) {
        bad.push(`${relative(root, join(srcDir, file))}: ${path}`);
      }
    }
  }
  expect(bad).toEqual([]);

  // Dispatch: a mock is an instance of its class whose constructor never ran; symbols and an absent `then` are no
  // method calls; a call with no return value gives null (AD-9); shouldReceive gives a CompositeExpectation.
  class Counted extends XtFoo {
    static built = 0;
    constructor() {
      super();
      Counted.built++;
    }
  }
  const m = Mockery.mock(Counted);
  expect(m).toBeInstanceOf(Counted);
  expect(m).toBeInstanceOf(XtFoo);
  expect(Counted.built).toBe(0);
  expect((m as unknown as Record<string, unknown>)["then"]).toBeUndefined();
  expect((m as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  const members = m as unknown as Record<string, unknown>;
  expect(members["bar"]).toBe(members["bar"]);
  expect(m.shouldReceive("bar")).toBeInstanceOf(CompositeExpectation);
  expect(m.bar()).toBeNull();
  expect(m.mockery_getName()).toMatch(/^Mockery_\d+_XtFoo$|^Mockery_\d+_Counted$/);
  expect(Mockery.getContainer()).toBeInstanceOf(Container);
  Mockery.close();
  // A `then` with an expectation is a method call.
  const thenable = Mockery.mock(XtFoo);
  thenable.shouldReceive("then").andReturn(7);
  expect(thenable["then"]()).toBe(7);
  Mockery.close();
  // A second mock of a class reuses its generated class name; close never resets the counter.
  expect(Mockery.mock(XtBar).mockery_getName()).toBe(Mockery.mock(XtBar).mockery_getName());
  Mockery.close();
}, CHILD_TIMEOUT);

test("fixture-free: a class value in with() matches an instance and its class-name string; the rejected forms throw InvalidArgumentException", () => {
  // `with(XtFoo)` stands in for `with(XtFoo::class)`: an XtBar instance and the string 'XtFoo' both match.
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").with(XtFoo).andReturn("matched");
  expect(m.bar(new XtBar())).toBe("matched");
  expect(m.bar("XtFoo")).toBe("matched");
  expect(thrown(() => m.bar("XtBar"))).toBeInstanceOf(NoMatchingExpectationException);

  // andThrow() with a class-name string is Story 4.6's (ESC-4.5-1 item 6).
  const andThrowError = thrown(() => Mockery.mock(XtFoo).shouldReceive("bar").andThrow("XtErr"));
  expect(andThrowError).toBeInstanceOf(SplInvalidArgumentException);
  expect(andThrowError).not.toBeInstanceOf(InvalidArgumentException);
  expect((andThrowError as Error).message.startsWith("andThrow() needs an exception object or class, got the class-name string 'XtErr'")).toBe(true);

  // Container.mock's forms outside Story 4.5 (ESC-4.5-1 item 6).
  const container = new Container();
  const mockAny = (...args: unknown[]): unknown => (container.mock as (...args: unknown[]) => unknown).apply(container, args);
  const rejected: [unknown[], string][] = [
    [[XtFoo, {}], "Mockery.mock() takes a class, a class-name string or nothing"],
    [["XtFoo, XtBar"], "Mockery.mock('XtFoo, XtBar'): interface lists, partials and alias:/overload: mocks are not supported yet"],
    [["XtFoo[bar]"], "Mockery.mock('XtFoo[bar]'): interface lists, partials and alias:/overload: mocks are not supported yet"],
    [["alias:XtFoo"], "Mockery.mock('alias:XtFoo'): interface lists, partials and alias:/overload: mocks are not supported yet"],
  ];
  for (const [args, prefix] of rejected) {
    let error: unknown = null;
    try {
      mockAny(...args);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InvalidArgumentException);
    expect((error as Error).message.startsWith(prefix)).toBe(true);
  }
  container.mockery_close();
});

test("XT-mockery-1: shouldReceive, once, twice, times, never, atLeast, atMost, with, withArgs (array and closure), withAnyArgs, andReturn, andReturnValues, andThrow and ordered (plain and grouped) record the values, exception classes and messages the signed Mockery 1.6.15 Oracle does", () => {
  const used = new Set(SCENARIOS.filter((scenario) => scenario.id === "XT-mockery-1").flatMap((scenario) => scenario.uses));
  expect(CORE_API.filter((name) => !used.has(name))).toEqual([]);
  for (const name of CORE_API.filter((entry) => entry !== "shouldReceive")) {
    expect(typeof (api.Expectation.prototype as unknown as Record<string, unknown>)[name]).toBe("function");
    expect(typeof (CompositeExpectation.prototype as unknown as Record<string, unknown>)[name]).toBe("function");
  }
  checkScenarios("XT-mockery-1");
});

function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|quot|amp|lt|gt|apos);/g, (_, entity: string) => {
    switch (entity) {
      case "quot":
        return '"';
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(Number(entity.slice(1)));
    }
  });
}

interface FixtureRun {
  exitCode: number | null;
  results: Map<string, string | null>;
  reports: Record<string, Record<string, number>>;
  probe: unknown;
  scope: Record<string, unknown> | null;
}

/** Runs mockery.fixture.ts in a child `bun test`; with `withScope`, under the fake `xaravel.scope.run`. */
function runFixture(withScope: boolean): FixtureRun {
  const dir = mkdtempSync(join(tmpdir(), "xt-mockery-2-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const reportFile = join(dir, "reports.jsonl");
  const probeFile = join(dir, "probe.json");
  const scopeFile = join(dir, "scope.jsonl");
  const env: Record<string, string | undefined> = { ...process.env, XT_MOCKERY_REPORT_FILE: reportFile, XT_MOCKERY_PROBE_FILE: probeFile };
  if (withScope) {
    env["XT_MOCKERY_SCOPE_FILE"] = scopeFile;
  } else {
    delete env["XT_MOCKERY_SCOPE_FILE"];
  }
  const child = Bun.spawnSync([process.execPath, "test", FIXTURE, "--reporter=junit", `--reporter-outfile=${junit}`], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const output = child.stdout.toString() + child.stderr.toString();
  for (const path of [junit, reportFile, probeFile, ...(withScope ? [scopeFile] : [])]) {
    if (!existsSync(path)) {
      throw new Error(`the fixture run wrote no ${path} (exit ${child.exitCode}); its output:\n${output}`);
    }
  }
  const results = new Map<string, string | null>();
  for (const match of readFileSync(junit, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure[^>]*?message="([^"]*)")/g)) {
    results.set(unescapeXml(match[1] ?? ""), match[3] === undefined ? null : unescapeXml(match[3]));
  }
  const jsonLines = (path: string): unknown[] =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as unknown);
  const reports = Object.fromEntries((jsonLines(reportFile) as { id: string; assertions: Record<string, number> }[]).map((report) => [report.id, report.assertions]));
  const scope = withScope ? Object.fromEntries((jsonLines(scopeFile) as { id: string; inFrameError: unknown }[]).map((line) => [line.id, line.inFrameError])) : null;
  return { exitCode: child.exitCode, results, reports, probe: JSON.parse(readFileSync(probeFile, "utf8")) as unknown, scope };
}

test("XT-mockery-2: an unmet expectation fails the test when it finishes, with the Oracle's InvalidCountException message, and counts as a mockeryExpectation assertion; met expectations alone pass; a tearDown close counts once; a failing body wins and the container is purged unverified", () => {
  const T = "Tests\\Unit\\MockeryTest";
  const XT = "XT-fixture-1: an unmet Mockery expectation fails a Xaravel Test";
  const plain = runFixture(false);
  const scoped = runFixture(true);
  const results = plain.results;
  for (const run of [plain, scoped]) {
    expect(run.exitCode).not.toBe(0);
    expect(run.reports).toEqual({
      [`${T}::testUnmet`]: { mockeryExpectation: 1 },
      [`${T}::testMet`]: { mockeryExpectation: 2 },
      [`${T}::testCloseInTearDown`]: { mockeryExpectation: 2 },
      [`${T}::testUnmetCloseInTearDown`]: { mockeryExpectation: 1 },
      [`${T}::testUnmetInScopeFrame`]: { mockeryExpectation: 1 },
      [`${T}::testBodyFails`]: {},
      [`${T}::testPurged`]: { mockeryExpectation: 1 },
      "XT-fixture-1": { mockeryExpectation: 1 },
    });
    expect(run.probe).toEqual({ failedContainerMocks: 0, fresh: true });
    expect([...run.results.keys()].sort()).toEqual(
      [`${T}::testUnmet`, `${T}::testMet`, `${T}::testCloseInTearDown`, `${T}::testUnmetCloseInTearDown`, `${T}::testUnmetInScopeFrame`, `${T}::testBodyFails`, `${T}::testPurged`, XT].sort(),
    );
    expect(run.results.get(`${T}::testMet`)).toBeNull();
    expect(run.results.get(`${T}::testCloseInTearDown`)).toBeNull();
    expect(run.results.get(`${T}::testPurged`)).toBeNull();
    expect(run.results.get(`${T}::testBodyFails`)).toBe("body failed");
  }
  // Under the scope switch, Mockery's close ran inside the test frame: the InvalidCountException left the frame
  // function while the frame was still active, with the same message as without a frame.
  const inFrame = scoped.scope?.[`${T}::testUnmetInScopeFrame`] as { frame: string | null; error: string; message: string } | null | undefined;
  expect(inFrame?.frame).toBe("test");
  expect(inFrame?.error).toBe("InvalidCountException");
  expect(normalize(scoped.results.get(`${T}::testUnmetInScopeFrame`))).toBe(normalize(plain.results.get(`${T}::testUnmetInScopeFrame`)));
  expect(normalize(inFrame?.message)).toBe(normalize(scoped.results.get(`${T}::testUnmetInScopeFrame`)));

  // The verify error is an InvalidCountException (TS-side, before any fixture is read).
  const unmet = thrown(() => {
    Mockery.mock(XtFoo).shouldReceive("bar").once();
    Mockery.close();
  });
  expect(unmet).toBeInstanceOf(InvalidCountException);

  // The failures carry the Oracle's message for the same scenario (XT-mockery-2's first expr).
  const output2 = oracleOutput("XT-mockery-2");
  const cell = oracleCell(output2, 0, "XT-mockery-2") as unknown[];
  expect(cell[0]).toBe("throws");
  expect(cell[1]).toBe("InvalidCountException");
  for (const name of [`${T}::testUnmet`, `${T}::testUnmetCloseInTearDown`, `${T}::testUnmetInScopeFrame`, XT]) {
    expect(normalize(results.get(name))).toBe(cell[2]);
  }
  expect(normalize(scoped.results.get(`${T}::testUnmetInScopeFrame`))).toBe(cell[2]);
  checkScenarios("XT-mockery-2");
}, CHILD_TIMEOUT);

test("XT-mockery-3: a call that matches no expectation throws Mockery's BadMethodCallException (declared or undeclared method) or NoMatchingExpectationException (arguments matching none, with Objects: (…) for an object), with the Oracle's messages", () => {
  // TS-side: the hierarchy, before any fixture is read.
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").with(1);
  const declared = thrown(() => m.baz());
  const m2 = Mockery.mock(XtFoo);
  const undeclared = thrown(() => m2.nope());
  const m3 = Mockery.mock(XtFoo);
  m3.shouldReceive("bar").with(1);
  const noMatch = thrown(() => m3.bar(2));
  for (const error of [declared, undeclared]) {
    expect(error).toBeInstanceOf(BadMethodCallException);
    expect(error).toBeInstanceOf(SplBadMethodCallException);
  }
  expect(noMatch).toBeInstanceOf(NoMatchingExpectationException);
  expect(noMatch).toBeInstanceOf(SplUnexpectedValueException);
  expect((noMatch as NoMatchingExpectationException).getActualArguments()).toEqual([2]);

  checkScenarios("XT-mockery-3");
});
