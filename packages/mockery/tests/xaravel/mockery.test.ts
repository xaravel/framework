// Xaravel Tests for Stories 4.5 (Mockery core) and 4.6 (Mockery advanced and
// API coverage); FR-100, AD-2, AD-7, AD-9, AD-15. One test per AC, in order,
// after the fixture-free checks. Like Epic 4's other grader tests these are
// plain bun:test: `xaravelTest` is not used to test the grader itself.
//
// Every expected outcome and message comes from a signed Oracle fixture of a
// request in conformance/oracle-requests/4.5.jsonl or 4.6.jsonl (real Mockery
// 1.6.15). XT-mockery-5 (mocked models) and XT-mockery-6 (the coverage
// report) check Xaravel-only behaviour and have no request. Each
// request's setup and exprs are rebuilt from scenarios.ts and must equal the
// committed line, so the TS twins are the scenarios the Oracle ran. A missing,
// unsigned or errored fixture fails the test; it is never skipped.
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import * as api from "../../src/index";
import {
  Any,
  BadMethodCallException,
  Closure,
  CompositeExpectation,
  Container,
  Exception as MockeryExceptionClass,
  Expectation,
  HigherOrderMessage,
  InvalidArgumentException,
  InvalidCountException,
  Mockery,
  NoMatchingExpectationException,
  Type,
  VerificationDirector,
} from "../../src/index";
import { phpObjectHandle } from "@xaravel/assert";
import { BadMethodCallException as SplBadMethodCallException } from "../../src/php/BadMethodCallException";
import { UnexpectedValueException as SplUnexpectedValueException } from "../../src/php/UnexpectedValueException";
import { type Output, readRequests, readSignedFixture } from "../../../assert/tests/xaravel/oracle-values";
import { normalize, oracleCell, scenarioMismatches } from "./cells";
import { MODEL_SET_KEYS, MODEL_TRAP_KEYS, SCENARIOS, type Scenario, setupFor, wrapPhp, XtBar, XtFoo, XtModel, XtReal } from "./scenarios";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUEST_FILES: Readonly<Record<Scenario["id"], string>> = {
  "XT-mockery-1": "conformance/oracle-requests/4.5.jsonl",
  "XT-mockery-2": "conformance/oracle-requests/4.5.jsonl",
  "XT-mockery-3": "conformance/oracle-requests/4.5.jsonl",
  "XT-mockery-4": "conformance/oracle-requests/4.6.jsonl",
};
const FIXTURES = "conformance/fixtures/mockery";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const FIXTURE = "./packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts";
const CHILD_TIMEOUT = 60_000;
const SPAWN_TIMEOUT = 50_000;

/** The 14 AC 1 names; each runs in at least one XT-mockery-1 scenario. */
const CORE_API = ["shouldReceive", "once", "twice", "times", "never", "atLeast", "atMost", "with", "withArgs", "withAnyArgs", "andReturn", "andReturnValues", "andThrow", "ordered"];

/**
 * Story 4.6's AC 1 names; each runs in at least one XT-mockery-4 scenario. `partial` is the `'Foo[m]'` form,
 * `andThrowClassName` is `andThrow('<Class>')`, `containerForms` the Container::mock argument forms.
 */
const ADVANCED_API = [
  "spy",
  "makePartial",
  "partial",
  "shouldIgnoreMissing",
  "byDefault",
  "andReturnUsing",
  "andReturnSelf",
  "on",
  "type",
  "any",
  "shouldHaveReceived",
  "shouldNotHaveReceived",
  "allows",
  "expects",
  "shouldNotReceive",
  "andReturnArg",
  "andReturnFalse",
  "andReturnNull",
  "andReturnTrue",
  "andThrowExceptions",
  "andThrowClassName",
  "passthru",
  "globally",
  "withNoArgs",
  "withSomeOfArgs",
  "zeroOrMoreTimes",
  "because",
  "capture",
  "self",
  "containerForms",
];

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

type Id = Scenario["id"];

/** The signed Oracle output of `id`'s one request, after checking the request equals the table's. */
function oracleOutput(id: Id): Output {
  const requests = readRequests(join(root, REQUEST_FILES[id])).filter((request) => request.id === id);
  expect(requests).toHaveLength(1);
  const request = requests[0]!;
  expect({ setup: request.setup, exprs: request.exprs }).toEqual({ setup: [...setupFor(id)], exprs: SCENARIOS.filter((scenario) => scenario.id === id).map((scenario) => wrapPhp(scenario.php)) });
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

  // A global already defined by other code makes the load throw LogicException
  // naming it, and neither global is installed (Epic 4 retro R4). Each child
  // pre-defines one slot, imports the package and prints what it saw.
  const indexPath = JSON.stringify(join(root, "packages/mockery/src/index.ts"));
  const report = `const mockKey = Symbol.for("xaravel.mockery.mock"); const runKey = Symbol.for("xaravel.mockery.run"); let error = null; try { await import(${indexPath}); } catch (caught) { error = { name: caught?.name ?? null, message: caught?.message ?? null }; } console.log(JSON.stringify({ error, mockKept: Object.hasOwn(globalThis, mockKey) ? globalThis[mockKey] === fake : null, runKept: Object.hasOwn(globalThis, runKey) ? globalThis[runKey] === fake : null }));`;
  const taken = (setup: string): unknown => {
    const child = Bun.spawnSync([process.execPath, "--eval", `${setup} ${report}`], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
    const stdout = child.stdout.toString().trim();
    return { exitCode: child.exitCode, stdout: child.exitCode === 0 && stdout !== "" ? (JSON.parse(stdout) as unknown) : stdout, stderr: child.stderr.toString() };
  };
  const message = (name: string): string => `Symbol.for('${name}') was already defined by other code or another copy of @xaravel/mockery; @xaravel/mockery will not install over it`;
  // R4 repro: a fake run that would turn off verification.
  expect(taken(`const fake = async (fn) => fn(); globalThis[Symbol.for("xaravel.mockery.run")] = fake;`)).toEqual({
    exitCode: 0,
    stdout: { error: { name: "LogicException", message: message("xaravel.mockery.run") }, mockKept: null, runKept: true },
    stderr: "",
  });
  // mock taken.
  expect(taken(`const fake = (type) => type; globalThis[Symbol.for("xaravel.mockery.mock")] = fake;`)).toEqual({
    exitCode: 0,
    stdout: { error: { name: "LogicException", message: message("xaravel.mockery.mock") }, mockKept: true, runKept: null },
    stderr: "",
  });
  // An accessor property counts too.
  expect(taken(`const fake = async (fn) => fn(); Object.defineProperty(globalThis, Symbol.for("xaravel.mockery.run"), { get: () => fake, configurable: true });`)).toEqual({
    exitCode: 0,
    stdout: { error: { name: "LogicException", message: message("xaravel.mockery.run") }, mockKept: null, runKept: true },
    stderr: "",
  });
  // A present property counts, whatever its value.
  expect(taken(`const fake = undefined; Object.defineProperty(globalThis, Symbol.for("xaravel.mockery.run"), { value: undefined, writable: false, configurable: false });`)).toEqual({
    exitCode: 0,
    stdout: { error: { name: "LogicException", message: message("xaravel.mockery.run") }, mockKept: null, runKept: true },
    stderr: "",
  });

  // The export list, each export and its prototype frozen.
  expect(Object.keys(api).sort()).toEqual(
    [
      "Any",
      "AtLeast",
      "AtMost",
      "BadMethodCallException",
      "Closure",
      "CompositeExpectation",
      "Container",
      "CountValidatorAbstract",
      "CountValidatorException",
      "Exact",
      "Exception",
      "Expectation",
      "ExpectationDirector",
      "ExpectsHigherOrderMessage",
      "HigherOrderMessage",
      "InvalidArgumentException",
      "InvalidCountException",
      "InvalidOrderException",
      "MethodCall",
      "Mockery",
      "NoMatchingExpectationException",
      "ReceivedMethodCalls",
      "RuntimeException",
      "Type",
      "VerificationDirector",
      "VerificationExpectation",
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

test("fixture-free: a class value in with() matches an instance and its class-name string; the forms with no PHP twin", () => {
  // `with(XtFoo)` stands in for `with(XtFoo::class)`: an XtBar instance and the string 'XtFoo' both match.
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").with(XtFoo).andReturn("matched");
  expect(m.bar(new XtBar())).toBe("matched");
  expect(m.bar("XtFoo")).toBe("matched");
  expect(thrown(() => m.bar("XtBar"))).toBeInstanceOf(NoMatchingExpectationException);
  // A built-in constructor is a class too: `with(TypeError)` matches an instance and the string 'TypeError'.
  const builtin = Mockery.mock(XtFoo);
  builtin.shouldReceive("bar").with(TypeError).andReturn("builtin");
  expect(builtin.bar(new TypeError("x"))).toBe("builtin");
  expect(builtin.bar("TypeError")).toBe("builtin");

  // A closure in with() is never a class (Expectation.php 949-980): it matches only itself, never its name or an
  // object built from it with `new`.
  const handler = function handler(): void {};
  const byName = Mockery.mock(XtFoo);
  byName.shouldReceive("run").with(handler).andReturn("matched");
  expect(thrown(() => byName.run("handler"))).toBeInstanceOf(NoMatchingExpectationException);
  function Ctor(this: object): void {}
  const byInstance = Mockery.mock(XtFoo);
  byInstance.shouldReceive("run").with(Ctor).andReturn("matched");
  expect(thrown(() => byInstance.run(new (Ctor as unknown as new () => object)()))).toBeInstanceOf(NoMatchingExpectationException);
  const same = function (): void {};
  const byIdentity = Mockery.mock(XtFoo);
  byIdentity.shouldReceive("run").with(same).andReturn("matched");
  expect(byIdentity.run(same)).toBe("matched");
  const other = Mockery.mock(XtFoo);
  other.shouldReceive("run").with(function (): void {}).andReturn("matched");
  expect(thrown(() => other.run(function (): void {}))).toBeInstanceOf(NoMatchingExpectationException);
  Mockery.close();

  // andThrow() with a class-name string resolves only the grader's own exception classes (ESC-4.6-1 item 9): any
  // other name fails at setup with PHP's message, as `new $name` does.
  const andThrowError = thrown(() => Mockery.mock(XtFoo).shouldReceive("bar").andThrow("XtErr"));
  expect(andThrowError).toBeInstanceOf(Error);
  expect((andThrowError as Error).message).toBe('Class "XtErr" not found');

  // alias: and overload: mocks are PHP-only (ESC-4.6-1 item 3); demeter chains stay unsupported.
  for (const form of ["alias:XtFoo", "overload:XtFoo"]) {
    const error = thrown(() => Mockery.mock(form));
    expect(error).toBeInstanceOf(InvalidArgumentException);
    expect((error as Error).message).toContain("ESC-4.6-1");
  }
  expect(thrown(() => Mockery.mock(XtFoo).shouldReceive("bar->baz"))).toBeInstanceOf(InvalidArgumentException);

  // Matchers are exported, print as Mockery's, and Mockery.capture writes `ref.value` (AD-9's by-reference box).
  expect([String(Mockery.any()), String(Mockery.on(() => true)), String(Mockery.type("string")), String(Mockery.type(XtFoo))]).toEqual(["<Any>", "<Closure===true>", "<String>", "<XtFoo>"]);
  expect(Mockery.any()).toBeInstanceOf(Any);
  expect(Mockery.on(() => true)).toBeInstanceOf(Closure);
  expect(Mockery.type("int")).toBeInstanceOf(Type);
  const ref = { value: null as unknown };
  const c = Mockery.mock(XtFoo);
  c.shouldReceive("bar").with(Mockery.capture(ref)).andReturn(1);
  expect(c.bar("captured")).toBe(1);
  expect(ref.value).toBe("captured");
  Mockery.close();

  // shouldIgnoreMissing(null, true): with no return types, every missing call returns an ignore-missing mock
  // (ESC-4.6-1 item 5); a missing call without recursion returns null.
  const recursive = Mockery.mock(XtFoo).shouldIgnoreMissing(null, true);
  const child = recursive.anything();
  expect(typeof child.mockery_getName).toBe("function");
  expect(child.deeper().mockery_getName()).toMatch(/^Mockery_\d+$/);
  expect(Mockery.mock(XtFoo).shouldIgnoreMissing().nope()).toBeNull();
  // Higher-order messages and verification directors are what Mockery returns.
  const spy = Mockery.spy(XtFoo);
  spy.bar();
  expect(spy.shouldReceive()).toBeInstanceOf(HigherOrderMessage);
  // A HigherOrderMessage is no thenable: `then` reads undefined, so awaiting one sends no `then` message.
  expect(Mockery.mock(XtFoo).shouldReceive().then).toBeUndefined();
  expect(spy.shouldHaveReceived("bar")).toBeInstanceOf(VerificationDirector);
  // A proxied partial's own method runs with the partial object as `this`.
  class Counter {
    count = 41;
    next(): number {
      return ++this.count;
    }
  }
  const proxied = Mockery.mock(new Counter());
  expect(proxied.next()).toBe(42);
  // A trailing `function` expression is a closure, not a class: it runs with the mock; `type('Closure')` and
  // `type('callable')` match one.
  let configured: unknown = null;
  const viaFunction = Mockery.mock(XtFoo, function (mock: unknown) {
    configured = mock;
  });
  expect(configured).toBe(viaFunction);
  const typed = Mockery.mock(XtFoo);
  typed.shouldReceive("bar").with(Mockery.type("Closure")).andReturn("closure");
  typed.shouldReceive("baz").with(Mockery.type("callable")).andReturn("callable");
  expect(typed.bar(function () {})).toBe("closure");
  expect(typed.baz(function () {})).toBe("callable");
  expect(thrown(() => typed.bar(XtFoo))).toBeInstanceOf(NoMatchingExpectationException);
  // type('int') and type('float') split numbers as the grader's value layer does: 2 ** 53 is not a safe integer.
  const numeric = Mockery.mock(XtFoo);
  numeric.shouldReceive("bar").with(Mockery.type("float")).andReturn("float");
  numeric.shouldReceive("baz").with(Mockery.type("int")).andReturn("int");
  expect(numeric.bar(2 ** 53)).toBe("float");
  expect(numeric.baz(2 ** 53 - 1)).toBe("int");
  // A class that declares its own `allows` keeps it (Mockery's AvoidMethodClashPass): the call is dispatched.
  class Gate {
    allows(_ability: string): boolean {
      return true;
    }
  }
  const gate = Mockery.mock(Gate);
  gate.shouldReceive("allows").with("edit").andReturn(false);
  expect(gate.allows("edit")).toBe(false);
  expect(thrown(() => Mockery.mock(Gate).allows("x"))).toBeInstanceOf(BadMethodCallException);
  // allows(null) is PHP's empty(): a higher-order message.
  expect(Mockery.mock(XtFoo).allows(null)).toBeInstanceOf(HigherOrderMessage);
  // A Mockery\\Exception for an argument Container::mock cannot parse.
  expect(thrown(() => Mockery.mock(XtFoo, 5))).toBeInstanceOf(MockeryExceptionClass);
  Mockery.close();
});

test("Epic 4 retro A1: Mockery prints PHP values as @xaravel/assert does", () => {
  /** The NoMatchingExpectationException message of `m.bar(arg)` on a mock expecting `bar('nope')`. */
  function message(arg: unknown): string {
    const m = Mockery.mock();
    m.shouldReceive("bar").with("nope");
    const error = thrown(() => (m as unknown as { bar(value: unknown): unknown }).bar(arg));
    expect(error).toBeInstanceOf(NoMatchingExpectationException);
    return (error as Error).message;
  }
  const call = (args: string): RegExp => new RegExp(`^No matching handler found for Mockery_\\d+::bar\\(${args.replace(/[\\[\]().@]/g, "\\$&")}\\)\\. Either the method was unexpected`);

  // A plain object with the props protocol is a PHP object, its properties those the protocol returns.
  const props = message({
    [Symbol.for("xaravel.php.props")]() {
      return { a: 1 };
    },
  });
  expect(props).toMatch(call("object(stdClass)"));
  expect(props).toContain("'properties' => \n    array (\n      'a' => 1,\n    ),");

  // An unregistered subclass of an FQCN-branded class is the parent's FQCN; an anonymous class is class@anonymous.
  class Reg {}
  Object.defineProperty(Reg, Symbol.for("xaravel.class.fqcn"), { value: "App\\Reg" });
  class Sub extends Reg {}
  const sub = new Sub();
  expect(message(sub)).toMatch(call("object(App\\Reg)"));
  expect(message(new (class {})())).toMatch(call("object(class@anonymous)"));

  // -0 is an integral float, which reads as an int (DIV-9): it prints 0.
  expect(message(-0)).toMatch(call("0"));
  expect(message([-0])).toMatch(call("[0 => 0]"));
  class Zero {
    p = -0;
  }
  expect(message(new Zero())).toContain("'p' => 0,");

  // An int-like string key is an int key, as PHP stores it.
  expect(message({ "0": "x" })).toMatch(call("[0 => 'x']"));

  // One object handle counter: the grader hands out a fresh object's handle first, and Mockery's identity hash is
  // md5(<class>_<handle>) of that same handle.
  const fresh = new Sub();
  const handle = phpObjectHandle(fresh);
  const identity = /'identity' => '#([0-9a-f]{32})'/.exec(message(fresh))?.[1];
  expect(identity).toBe(createHash("md5").update(`App\\Reg_${handle}`).digest("hex"));

  // The other consumers of the shared predicates: Mockery.type, Container::mock's argument parsing, the mock name.
  const propsObject = {
    [Symbol.for("xaravel.php.props")]() {
      return { a: 1 };
    },
  };
  expect(Mockery.type("object").match(propsObject)).toBe(true);
  expect(Mockery.type("array").match(propsObject)).toBe(false);
  // `{ "0": "a" }` is the PHP array [0 => 'a']: constructor arguments, not a quick definition of a method "0".
  const withArgs = Mockery.mock({ "0": "a" }) as unknown as Record<string, () => unknown>;
  let quick: unknown = null;
  try {
    quick = withArgs["0"]?.();
  } catch {
    // no method "0" was defined
  }
  expect(quick).not.toBe("a");
  expect(Mockery.mock(new (class {})()).mockery_getName()).toContain("class@anonymous");
  Mockery.close();
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

const OUTSIDE_RUN_FIXTURE = "./packages/mockery/tests/xaravel/fixtures/outside-run.fixture.ts";

interface OutsideRun {
  exitCode: number | null;
  results: Map<string, string | null>;
  /** The JUnit `<failure type="…">` of each failed test, keyed like `results`. */
  types: Map<string, string>;
  reports: Record<string, Record<string, number>>;
  probe: unknown;
}

/** Runs outside-run.fixture.ts in a child `bun test` for one scenario. */
function runOutsideRunFixture(scenario: "unmet" | "met" | "body-fails"): OutsideRun {
  const dir = mkdtempSync(join(tmpdir(), "xt-mockery-outside-run-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const reportFile = join(dir, "reports.jsonl");
  const probeFile = join(dir, "probe.json");
  const env = { ...process.env, XT_OUTSIDE_RUN_SCENARIO: scenario, XT_OUTSIDE_RUN_REPORT_FILE: reportFile, XT_OUTSIDE_RUN_PROBE_FILE: probeFile };
  const child = Bun.spawnSync([process.execPath, "test", OUTSIDE_RUN_FIXTURE, "--reporter=junit", `--reporter-outfile=${junit}`], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const output = child.stdout.toString() + child.stderr.toString();
  for (const path of [junit, reportFile, probeFile]) {
    if (!existsSync(path)) {
      throw new Error(`the ${scenario} fixture run wrote no ${path} (exit ${child.exitCode}); its output:\n${output}`);
    }
  }
  const results = new Map<string, string | null>();
  const types = new Map<string, string>();
  for (const match of readFileSync(junit, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure[^>]*?type="([^"]*)"[^>]*?message="([^"]*)")/g)) {
    const name = unescapeXml(match[1] ?? "");
    results.set(name, match[4] === undefined ? null : unescapeXml(match[4]));
    if (match[3] !== undefined) {
      types.set(name, unescapeXml(match[3]));
    }
  }
  const reports = Object.fromEntries(
    readFileSync(reportFile, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as { id: string; assertions: Record<string, number> })
      .map((report) => [report.id, report.assertions]),
  );
  return { exitCode: child.exitCode, results, types, reports, probe: JSON.parse(readFileSync(probeFile, "utf8")) as unknown };
}

test("outside-run (Epic 4 retro R3): a mock made outside a run is adopted by the next run, sharing its container, verified and counted when the body resolves (an unmet once() fails that test with InvalidCountException), purged unverified when the body fails; the process slot is then empty and the run after starts with no container", () => {
  const T = "Tests\\Unit\\MockeryOutsideRunTest";
  const adopts = `${T}::testAdopts`;
  const nextRun = `${T}::testNextRun`;
  const probe = { adoptedMocks: 1, sharedMocks: 2, nextRunEmpty: true, processSlotEmpty: true };

  // R3 repro: the unmet once() of the outside mock fails the first test, naming run and once.
  const unmet = runOutsideRunFixture("unmet");
  expect(unmet.exitCode).toBe(1);
  expect(unmet.reports).toEqual({ [adopts]: { assertTrue: 1, mockeryExpectation: 1 }, [nextRun]: { assertTrue: 1 } });
  expect(unmet.probe).toEqual(probe);
  expect([...unmet.results.keys()].sort()).toEqual([adopts, nextRun].sort());
  const message = unmet.results.get(adopts) ?? "";
  expect(message).toContain("run(");
  expect(message).toContain("exactly 1 times but called 0 times");
  expect(unmet.types.get(adopts)).toBe("InvalidCountException");
  expect(unmet.results.get(nextRun)).toBeNull();
  // Closing the same unmet expectation throws InvalidCountException (TS-side).
  const verifyError = thrown(() => {
    Mockery.mock(XtFoo).shouldReceive("run").once();
    Mockery.close();
  });
  expect(verifyError).toBeInstanceOf(InvalidCountException);
  expect((verifyError as Error).message).toBe(message);

  // Met: both tests pass, and the adopted expectation is counted.
  const met = runOutsideRunFixture("met");
  expect(met.exitCode).toBe(0);
  expect(met.reports).toEqual({ [adopts]: { assertTrue: 1, mockeryExpectation: 1 }, [nextRun]: { assertTrue: 1 } });
  expect(met.probe).toEqual(probe);
  expect(met.results.get(adopts)).toBeNull();
  expect(met.results.get(nextRun)).toBeNull();

  // Body fails: the body's error wins; the adopted container is purged, neither verified nor counted.
  const bodyFails = runOutsideRunFixture("body-fails");
  expect(bodyFails.exitCode).toBe(1);
  expect(bodyFails.reports).toEqual({ [adopts]: { assertTrue: 1 }, [nextRun]: { assertTrue: 1 } });
  expect(bodyFails.probe).toEqual(probe);
  expect(bodyFails.results.get(adopts)).toBe("body");
  expect(bodyFails.types.get(adopts)).toBe("Error");
  expect(bodyFails.results.get(nextRun)).toBeNull();
}, 3 * SPAWN_TIMEOUT + 10_000);

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

test("XT-mockery-4: spy, partials (makePartial and Foo[m]), shouldIgnoreMissing, byDefault, the andReturn* family, the Mockery.on/type/any/capture/self statics, shouldHaveReceived, shouldNotHaveReceived, allows, expects, shouldNotReceive, andThrowExceptions, andThrow('Class'), passthru, globally, withNoArgs, withSomeOfArgs, zeroOrMoreTimes, because and the Container::mock forms record the values, exception classes and messages the signed Mockery 1.6.15 Oracle does", () => {
  const used = new Set(SCENARIOS.filter((scenario) => scenario.id === "XT-mockery-4").flatMap((scenario) => scenario.uses));
  expect(ADVANCED_API.filter((name) => !used.has(name))).toEqual([]);
  for (const name of ["andReturnArg", "andReturnFalse", "andReturnNull", "andReturnTrue", "andReturnSelf", "andReturnUsing", "andReturns", "andThrows", "andThrowExceptions", "because", "byDefault", "globally", "passthru", "withNoArgs", "withSomeOfArgs", "zeroOrMoreTimes"]) {
    expect(typeof (Expectation.prototype as unknown as Record<string, unknown>)[name]).toBe("function");
    expect(typeof (CompositeExpectation.prototype as unknown as Record<string, unknown>)[name]).toBe("function");
  }
  for (const name of ["spy", "on", "type", "any", "capture", "self"]) {
    expect(typeof (Mockery as unknown as Record<string, unknown>)[name]).toBe("function");
  }
  checkScenarios("XT-mockery-4");
});

const MODEL_STATE = Symbol.for("xaravel.model.state");
const MEMBERS = Symbol.for("xaravel.mockery.members");

test("XT-mockery-5: a mocked model (its instances carry MODEL_STATE, its constructor returns a Proxy whose defineProperty trap refuses string keys) mocked plainly, as a Foo[m] partial, with makePartial, as a spy and with constructor arguments keeps its members in the MODEL_STATE escape slot, never in the trap (AD-7)", () => {
  MODEL_TRAP_KEYS.length = 0;
  MODEL_SET_KEYS.length = 0;
  XtModel.made = [];
  const define = (mock: object, name: string, value: unknown): void => {
    Object.defineProperty(mock, name, { value, writable: true, configurable: true, enumerable: true });
  };
  const escape = (mock: object): Record<string, PropertyDescriptor> => ((mock as Record<symbol, Record<symbol, unknown>>)[MODEL_STATE]![MEMBERS] as Record<string, PropertyDescriptor>);

  // Plainly: no constructor runs; the expectation answers.
  const plain = Mockery.mock(XtModel);
  plain.shouldReceive("getConnectionName").once().andReturn("mocked");
  expect(plain).toBeInstanceOf(XtModel);
  expect(plain.getConnectionName()).toBe("mocked");
  define(plain, "relation", "plain member");
  expect(plain["relation"]).toBe("plain member");
  expect(escape(plain)["relation"]?.value).toBe("plain member");
  expect(Object.getPrototypeOf(escape(plain))).toBeNull();
  // An accessor member reads through its getter and takes an assignment through its setter; a read-only member
  // refuses one.
  let accessed: unknown = "got";
  Object.defineProperty(plain, "accessor", {
    get: (): unknown => accessed,
    set: (value: unknown): void => {
      accessed = value;
    },
    configurable: true,
  });
  expect(plain["accessor"]).toBe("got");
  plain["accessor"] = "set";
  expect(accessed).toBe("set");
  Object.defineProperty(plain, "fixed", { value: "fixed", writable: false, configurable: true });
  expect(Reflect.set(plain, "fixed", "changed")).toBe(false);
  expect(plain["fixed"]).toBe("fixed");

  // A Foo[m] partial: the real constructor ran (its Proxy is the instance) and the real getTable reaches the mock.
  const partial = Mockery.mock("XtModel[getConnectionName]");
  partial.shouldReceive("getConnectionName").andReturn("partial");
  expect(partial.getTable()).toBe("partial:table");
  define(partial, "relation", "partial member");
  expect(partial["relation"]).toBe("partial member");
  expect(escape(partial)["relation"]?.value).toBe("partial member");

  // makePartial: the real method runs for a call with no expectation.
  const deferred = Mockery.mock(XtModel).makePartial();
  expect(deferred.getTable()).toBe("real-connection:table");
  define(deferred, "relation", "deferred member");
  expect(deferred["relation"]).toBe("deferred member");

  // A spy: calls answer null and are verified afterwards.
  const spy = Mockery.spy(XtModel);
  expect(spy.getTable()).toBeNull();
  spy.shouldHaveReceived("getTable").once();
  define(spy, "relation", "spy member");
  expect(spy["relation"]).toBe("spy member");

  // Constructor arguments: the real constructor runs with them.
  const constructed = Mockery.mock(XtModel, [1, 2]);
  constructed.shouldReceive("getTable").andReturn("constructed");
  expect(constructed.getTable()).toBe("constructed");
  define(constructed, "relation", "constructed member");
  expect(constructed["relation"]).toBe("constructed member");
  expect(escape(constructed)["relation"]?.value).toBe("constructed member");

  // Assigning to a member defined through the mock updates it in the escape slot. A fresh string key goes to the
  // model's own set path: its set trap on a mock whose constructor ran; on a plain (constructor-less) mock no model
  // Proxy exists, so it lands on the bare instance (ESC-4.6-1 item 1). Never to the defineProperty trap.
  for (const mock of [plain, partial, constructed]) {
    mock["relation"] = "assigned";
    expect(mock["relation"]).toBe("assigned");
    expect(escape(mock)["relation"]?.value).toBe("assigned");
  }
  expect(MODEL_SET_KEYS).toEqual([]);
  plain["fresh"] = "on the instance";
  expect(MODEL_SET_KEYS).toEqual([]);
  expect(plain["fresh"]).toBe("on the instance");
  expect(escape(plain)["fresh"]).toBeUndefined();
  partial["fresh"] = "partial attribute";
  constructed["fresh"] = "constructed attribute";
  expect(MODEL_SET_KEYS).toEqual(["fresh", "fresh"]);
  expect(escape(partial)["fresh"]).toBeUndefined();

  // Each mock keeps its own slot; the trap saw symbol keys only (Mockery's own MODEL_STATE slot), never a string.
  expect(XtModel.made).toEqual([[], [1, 2]]);
  expect(MODEL_TRAP_KEYS.filter((key) => typeof key === "string")).toEqual([]);
  expect(MODEL_TRAP_KEYS).toEqual([MODEL_STATE, MODEL_STATE]);
  // Expectations and verification work: the close verifies them all.
  expect(thrown(() => Mockery.close())).toBeNull();

  // A non-model target still takes members on the instance itself.
  const foo = Mockery.mock(XtReal);
  define(foo, "member", 1);
  expect(Object.getOwnPropertyDescriptor(foo, "member")?.value).toBe(1);
  Mockery.close();
});

const COVERAGE = "tools/mockery-coverage/coverage.ts";

function runCoverage(args: readonly string[]): { exitCode: number | null; stdout: string; stderr: string } {
  const child = Bun.spawnSync([process.execPath, COVERAGE, ...args], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  return { exitCode: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

const PENDING_DOUBLE = ["pending ESC-4.6-1: resolves (JMac\\Testing\\Double)", "pending ESC-4.6-1: returns (JMac\\Testing\\Double)", "pending ESC-4.6-1: throws (JMac\\Testing\\Double)"];

test("XT-mockery-6: bun run mockery:coverage lists every mockery-api.jsonl name as implemented except returns, throws and resolves (pending ESC-4.6-1), and fails naming a scan name with no implementation", () => {
  const scanText = readFileSync(join(root, "conformance/scans/mockery-api.jsonl"), "utf8");
  const scanCount = scanText.split("\n").filter((line) => line !== "").length;

  // The repository: exit 0, the three pending lines, nothing missing.
  const repo = runCoverage([]);
  expect({ exitCode: repo.exitCode, stderr: repo.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(repo.stdout.split("\n").filter((line) => line !== "")).toEqual([...PENDING_DOUBLE, `Mockery API coverage: ${scanCount} scan names; ${scanCount - 3} implemented, 3 pending, 0 missing.`]);

  // A temp root whose packages/mockery is the real one, with a scan that adds two names Mockery has but the grader
  // does not port: both are missing, named, and the report fails.
  const added = mkdtempSync(join(tmpdir(), "xt-mockery-6-"));
  tempDirs.push(added);
  mkdirSync(join(added, "conformance/scans"), { recursive: true });
  writeFileSync(join(added, "conformance/scans/mockery-api.jsonl"), `${scanText}{"name":"andYield","static":false,"count":1}\n{"name":"pattern","static":true,"count":1}\n`);
  mkdirSync(join(added, "packages"), { recursive: true });
  symlinkSync(join(root, "packages/mockery"), join(added, "packages/mockery"));
  const addedRun = runCoverage(["--root", added]);
  expect(addedRun.exitCode).toBe(1);
  expect(addedRun.stdout.split("\n").filter((line) => line !== "")).toEqual([
    "missing mockery: andYield",
    "missing mockery: pattern",
    ...PENDING_DOUBLE,
    `Mockery API coverage: ${scanCount + 2} scan names; ${scanCount - 3} implemented, 3 pending, 2 missing.`,
  ]);

  // A temp root whose grader copy lacks an Expectation method and a mock API member: both are missing, named.
  const removed = mkdtempSync(join(tmpdir(), "xt-mockery-6-"));
  tempDirs.push(removed);
  mkdirSync(join(removed, "conformance/scans"), { recursive: true });
  writeFileSync(join(removed, "conformance/scans/mockery-api.jsonl"), scanText);
  cpSync(join(root, "packages/mockery/src"), join(removed, "packages/mockery/src"), { recursive: true });
  const edit = (file: string, from: string, to: string): void => {
    const path = join(removed, "packages/mockery/src", file);
    const text = readFileSync(path, "utf8");
    expect(text).toContain(from);
    writeFileSync(path, text.replaceAll(from, to));
  };
  edit("Mockery/Expectation.ts", "  zeroOrMoreTimes(): this {", "  zeroOrMoreTimesRemoved(): this {");
  edit("Mockery/CompositeExpectation.ts", "  zeroOrMoreTimes(): this {", "  zeroOrMoreTimesRemoved(): this {");
  edit("Mockery/Mock.ts", '  "shouldIgnoreMissing",\n', "");
  mkdirSync(dirname(join(removed, "node_modules/@xaravel/assert")), { recursive: true });
  symlinkSync(join(root, "packages/assert"), join(removed, "node_modules/@xaravel/assert"));
  const removedRun = runCoverage(["--root", removed]);
  expect({ exitCode: removedRun.exitCode, stderr: removedRun.stderr }).toEqual({ exitCode: 1, stderr: "" });
  expect(removedRun.stdout.split("\n").filter((line) => line !== "")).toEqual([
    "missing mockery: shouldIgnoreMissing",
    "missing mockery: zeroOrMoreTimes",
    ...PENDING_DOUBLE,
    `Mockery API coverage: ${scanCount} scan names; ${scanCount - 5} implemented, 3 pending, 2 missing.`,
  ]);

  // A usage error exits 2.
  expect(runCoverage(["--nope"]).exitCode).toBe(2);
}, CHILD_TIMEOUT);
