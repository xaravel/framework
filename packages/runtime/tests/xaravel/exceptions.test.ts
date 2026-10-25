// Xaravel Tests for Story 9.10: PHP's exception hierarchy (AD-19 and the spine's Consistency
// Conventions "Errors" row). One test per acceptance-criterion
// row of the manifest, in order (XT-runtime-37 is `docs.test.ts`). Each Oracle row compares with the signed fixture of
// `conformance/oracle-requests/9.10.jsonl`; a missing fixture fails the test.
//
// F-10 recorded reason: XT-runtime-35 and XT-runtime-36 are Xaravel Tests (stories/9.10.md has no test_ids), so no
// Upstream test exists whose inputs the requests could take. Per docs/ops/oracle.md § Per-Story requests ("A Story that
// needs expected values for other inputs (an Xaravel Differential suite …) commits
// conformance/oracle-requests/<story-id>.jsonl"; an Xaravel Test ID runs bound to a bare PHPUnit TestCase) and
// epics.md (Epic 9: "verified by Oracle Differential Tests"), the requests evaluate only the PHP constructs the
// acceptance criteria name (`class_parents` of PHP's 22 exception classes; `new InvalidArgumentException('m', 5, $p)`
// with its getters and `instanceof`; the defaults of `Exception`, `Error` and `ErrorException`; constructions with a
// bad argument, and the arguments PHP's coercive mode coerces, decisions/ESC-9.10-2.md), and contain no Laravel code
// and no Upstream fixture.
//
// XT-runtime-43 is action item epic-12-item-1-blocked-by-component-error (ESC-12.1-2).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime/registry";
import { frameSlot, ScopeFrameException } from "@xaravel/runtime/scope";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const REPO = resolve(PACKAGE_DIR, "..", "..");

/** The part of the grader's Oracle helpers (`packages/assert/tests/xaravel/oracle-values.ts`) this file uses. */
interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: { class: string; message: string } })[];
}
interface OracleValues {
  decode: (encoded: unknown) => unknown;
  readRequests: (path: string) => { id: string; sha256: string; exprs: string[] }[];
  readSignedFixture: (path: string, sha256: string, publicKeyPem: string) => Output;
}

// The runtime has no dependencies (AD-2), so its tsc project cannot reference @xaravel/assert's test files; the
// grader's fixture reader is loaded at run time instead of being re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/9.10.jsonl";
const FIXTURES = "conformance/fixtures/runtime";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

/** The signed Oracle output of the Story's one request for `id`. */
function oracle(id: string): Output {
  const requests = readRequests(join(REPO, REQUESTS)).filter((request) => request.id === id);
  if (requests.length !== 1) {
    throw new Error(`${REQUESTS}: expected one request for ${id}, found ${requests.length}`);
  }
  const request = requests[0]!;
  const output = readSignedFixture(join(REPO, FIXTURES, `${request.sha256}.json`), request.sha256, readFileSync(join(REPO, PUBLIC_KEY), "utf8"));
  if (output.error !== null) {
    throw new Error(`${id}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  return output;
}

/** The decoded value of result `index`. */
function valueOf(output: Output, index: number): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decode(result.value);
}

/** The class and message result `index` threw. */
function throwsOf(output: Output, index: number): { class: string; message: string } {
  const result = output.results[index];
  if (result === undefined || !("throws" in result)) {
    throw new Error(`result ${index} did not throw: ${JSON.stringify(result ?? null)}`);
  }
  return result.throws;
}

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** Runs `code` as a module in a fresh `bun` process from the package directory, with `env` over the parent's (less the opt-out). */
function child(code: string, env: Record<string, string> = {}): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: { ...inherited, ...env } });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

type PhpClass = abstract new (...args: never[]) => Error;

/** PHP's 22 exception classes, in the order of the XT-runtime-35 request. */
const CHAINED: readonly (readonly [string, PhpClass])[] = [
  ["Exception", php.Exception],
  ["ErrorException", php.ErrorException],
  ["JsonException", php.JsonException],
  ["RuntimeException", php.RuntimeException],
  ["LogicException", php.LogicException],
  ["Error", php.Error],
  ["TypeError", php.TypeError],
  ["ValueError", php.ValueError],
  ["ArithmeticError", php.ArithmeticError],
  ["ArgumentCountError", php.ArgumentCountError],
  ["DivisionByZeroError", php.DivisionByZeroError],
  ["InvalidArgumentException", php.InvalidArgumentException],
  ["DomainException", php.DomainException],
  ["LengthException", php.LengthException],
  ["OutOfRangeException", php.OutOfRangeException],
  ["BadFunctionCallException", php.BadFunctionCallException],
  ["BadMethodCallException", php.BadMethodCallException],
  ["OutOfBoundsException", php.OutOfBoundsException],
  ["RangeException", php.RangeException],
  ["OverflowException", php.OverflowException],
  ["UnderflowException", php.UnderflowException],
  ["UnexpectedValueException", php.UnexpectedValueException],
];

/** The FQCNs of `klass`'s parents up to (not including) the JS `Error`, nearest first, as PHP's `class_parents`. */
function parentsOf(klass: PhpClass): string[] {
  const parents: string[] = [];
  let parent: unknown = Object.getPrototypeOf(klass);
  while (parent !== globalThis.Error) {
    if (typeof parent !== "function") {
      throw new Error(`${fqcn(klass)} does not extend the JS Error`);
    }
    parents.push(fqcn(parent));
    parent = Object.getPrototypeOf(parent);
  }
  return parents;
}

const PHP_CLASSES = Symbol.for("xaravel.php.classes");

/** The runtime modules a fresh process may load first (spec Import cycles). */
const ENTRIES = ["src/index.ts", "src/scope/index.ts", "src/registry/index.ts", "src/php/index.ts", "src/registry/registry.ts", "src/php/jsonEncode.ts", "src/scope/scope.ts"] as const;

xaravelTest(
  "XT-runtime-35",
  "the runtime exports PHP's Exception, Error and SPL classes as JS Error subclasses with the Oracle's class_parents chains, each registered under its PHP name and published on Symbol.for('xaravel.php.classes') when one of the four package entries loads (not under XARAVEL_NO_SCOPE_GLOBAL=1), which a module that does not import the runtime reads; resolveClass misses throw PHP's Error and ScopeFrameException is a RuntimeException (AD-19)",
  () => {
    // Local rows first, so they run even while a fixture is missing.
    CHAINED.forEach(([name, klass]) => {
      Assert.assertSame(name, fqcn(klass), name);
      Assert.assertSame(klass, (root as Record<string, unknown>)[name], `the package root exports ${name}`);
      Assert.assertTrue(klass.prototype instanceof globalThis.Error, `${name} is a JS Error`);
      const underException = klass === php.Exception || klass.prototype instanceof php.Exception;
      const underError = klass === php.Error || klass.prototype instanceof php.Error;
      Assert.assertTrue(underException !== underError, `${name} is under exactly one PHP root`);
    });

    // The protocol: a frozen null-prototype map of the 24 built-ins, defined as scope.run is.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, PHP_CLASSES);
    Assert.assertNotNull(descriptor ?? null);
    Assert.assertFalse(descriptor!.writable ?? true);
    Assert.assertFalse(descriptor!.configurable ?? true);
    Assert.assertFalse(descriptor!.enumerable ?? true);
    const map = descriptor!.value as Record<string, PhpClass>;
    Assert.assertNull(Object.getPrototypeOf(map));
    Assert.assertTrue(Object.isFrozen(map));
    const names = [...CHAINED.map(([name]) => name), "stdClass", "__PHP_Incomplete_Class"];
    Assert.assertSame([...names].sort().join(","), Object.keys(map).sort().join(","));
    for (const name of names) {
      const klass = map[name]!;
      Assert.assertSame((root as Record<string, unknown>)[name], klass, name);
      Assert.assertSame((php as Record<string, unknown>)[name], klass, name);
      Assert.assertSame(klass, resolveClass(name), name);
      Assert.assertSame(name, fqcn(klass), name);
    }
    Assert.assertTrue(new php.InvalidArgumentException() instanceof map["Exception"]!);
    Assert.assertFalse(new php.InvalidArgumentException() instanceof map["Error"]!);
    Assert.assertTrue(new php.ValueError() instanceof map["Error"]!);

    // Loading any entry first in a fresh process does not throw.
    for (const entry of ENTRIES) {
      const run = child(`await import(${JSON.stringify(join(PACKAGE_DIR, entry))}); const m = globalThis[Symbol.for("xaravel.php.classes")]; console.log(m === undefined ? "none" : Object.keys(m).length);`);
      Assert.assertSame(0, run.code, `${entry}: ${run.err}`);
      // Only the four package indexes publish the map; a module below them loads without it (ESC-9.10-2 (a)).
      Assert.assertSame(entry.endsWith("index.ts") ? "24" : "none", run.out, entry);
    }
    // A symbol already defined by other code: loading throws PHP's LogicException naming it.
    const taken = child(
      `Object.defineProperty(globalThis, Symbol.for("xaravel.php.classes"), { value: {} }); try { await import("@xaravel/runtime/php"); console.log("installed"); } catch (e) { console.log(e.name + ": " + e.message); }`,
    );
    Assert.assertSame(0, taken.code, taken.err);
    Assert.assertSame(
      "LogicException: Symbol.for('xaravel.php.classes') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it",
      taken.out,
      taken.err,
    );
    // A second copy loaded with XARAVEL_NO_SCOPE_GLOBAL=1 (decisions/ESC-9.10-2.md (b)): both globals are taken by
    // the first copy, and the import neither throws nor installs over them.
    const second = child(
      `const first = Object.freeze(Object.create(null)); const run = () => null; Object.defineProperty(globalThis, Symbol.for("xaravel.php.classes"), { value: first }); Object.defineProperty(globalThis, Symbol.for("xaravel.scope.run"), { value: run }); const runtime = await import("@xaravel/runtime"); console.log(globalThis[Symbol.for("xaravel.php.classes")] === first, globalThis[Symbol.for("xaravel.scope.run")] === run, new runtime.LogicException("x").getMessage());`,
      { XARAVEL_NO_SCOPE_GLOBAL: "1" },
    );
    Assert.assertSame(0, second.code, second.err);
    Assert.assertSame("true true x", second.out, second.err);
    // Opted out in a fresh process, the map is not published.
    const optedOut = child(`await import("@xaravel/runtime"); console.log(globalThis[Symbol.for("xaravel.php.classes")] === undefined);`, { XARAVEL_NO_SCOPE_GLOBAL: "1" });
    Assert.assertSame(0, optedOut.code, optedOut.err);
    Assert.assertSame("true", optedOut.out, optedOut.err);
    const dir = mkdtempSync(join(tmpdir(), "xaravel-exceptions-"));
    try {
      // The Registry alone has no classmap encoder: writeClassmap names the entry that installs it.
      const bare = child(
        `const { writeClassmap } = await import(${JSON.stringify(join(PACKAGE_DIR, "src/registry/registry.ts"))}); try { writeClassmap(${JSON.stringify(join(dir, "c.json"))}); console.log("written"); } catch (e) { console.log(e.constructor === Error, e.message); }`,
      );
      Assert.assertSame(0, bare.code, bare.err);
      Assert.assertSame("true writeClassmap(): no classmap encoder is installed; import writeClassmap from @xaravel/runtime/registry", bare.out);

      // The grader's read: a module outside the package, importing nothing, classifies what the runtime threw through
      // the map alone (it could not even resolve @xaravel/runtime from its directory).
      const reader = join(dir, "reader.mjs");
      writeFileSync(
        reader,
        `export function classify(errors) {\n  const map = globalThis[Symbol.for("xaravel.php.classes")];\n  return errors.map((e) => (e instanceof map.Exception ? "Exception" : "") + (e instanceof map.Error ? "Error" : "")).join(",");\n}\n`,
      );
      const read = child(
        `import { jsonDecode, JSON_THROW_ON_ERROR, resolveClass } from "@xaravel/runtime";\nconst errors = [];\nfor (const f of [() => jsonDecode("[", null, 512, JSON_THROW_ON_ERROR), () => resolveClass("No\\\\Such")]) { try { f(); } catch (e) { errors.push(e); } }\nconst { classify } = await import(${JSON.stringify(reader)});\nconsole.log(classify(errors));`,
      );
      Assert.assertSame(0, read.code, read.err);
      Assert.assertSame("Exception,Error", read.out, read.err);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // The switched throws.
    const miss = thrownBy(() => resolveClass("No\\Such"));
    Assert.assertInstanceOf(php.Error, miss);
    Assert.assertSame("Error", fqcn(miss as object));
    Assert.assertSame('Class "No\\Such" not found', (miss as Error).message);
    const write = thrownBy(() => frameSlot("xt-runtime-35.slot", () => 0).set(1));
    Assert.assertInstanceOf(ScopeFrameException, write);
    Assert.assertInstanceOf(php.RuntimeException, write);
    Assert.assertInstanceOf(php.Exception, write);
    Assert.assertFalse(write instanceof php.Error);
    Assert.assertSame("Xaravel\\Runtime\\Scope\\ScopeFrameException", fqcn(write as object));
    Assert.assertSame("Xaravel\\Runtime\\Scope\\ScopeFrameException", (write as Error).name);

    // The chains, against the Oracle's class_parents.
    const chains = oracle("XT-runtime-35");
    Assert.assertSame(CHAINED.length, chains.results.length);
    CHAINED.forEach(([name, klass], index) => {
      const expected = valueOf(chains, index);
      Assert.assertTrue(Array.isArray(expected), name);
      Assert.assertSame((expected as string[]).join(","), parentsOf(klass).join(","), `class_parents(${name})`);
    });
  },
  30_000,
);

/**
 * The request's `XaravelFixture\Exceptions\NotFound` (`protected $code = 404; protected $message = 'missing';`),
 * ported by the docs/exceptions.md rule: the message default is a default parameter, and a code of 0 takes the
 * subclass default, as PHP keeps a declared `$code` unless a non-zero code is passed.
 */
class NotFound extends php.RuntimeException {
  constructor(message: string = "missing", code: number | bigint = 0, previous: Error | null = null) {
    super(message, code === 0 ? 404 : code, previous);
  }
}
registerClass("XaravelFixture\\Exceptions\\NotFound", NotFound);

/** The request's `XaravelFixture\Exceptions\Label`: a `__toString` port returning `'label'`. */
class Label {
  toString(): string {
    return "label";
  }
}
registerClass("XaravelFixture\\Exceptions\\Label", Label);

/** A `__toString` port that returns an int, which PHP's `__toString` return type coerces in coercive mode. */
class IntLabel {
  toString(): unknown {
    return 5;
  }
}
registerClass("XaravelFixture\\Exceptions\\IntLabel", IntLabel);

/** A `__toString` port that returns null, which PHP's `__toString` return type rejects. */
class BadLabel {
  toString(): unknown {
    return null;
  }
}
registerClass("XaravelFixture\\Exceptions\\BadLabel", BadLabel);

/** A `__toString` port that returns a symbol, which has no PHP counterpart. */
class SymbolLabel {
  toString(): unknown {
    return Symbol("s");
  }
}
registerClass("XaravelFixture\\Exceptions\\SymbolLabel", SymbolLabel);

/** An unregistered subclass: it shows its parent's brand. */
class XtUnregisteredLogic extends php.LogicException {}

xaravelTest(
  "XT-runtime-36",
  "new InvalidArgumentException('m', 5, previous) keeps getMessage(), getCode() and getPrevious() (also the JS cause) and is instanceof LogicException, Exception and the JS Error but not PHP's Error; the defaults, a subclass's $code and $message defaults, the coercions of PHP's coercive mode and the TypeErrors for rejected arguments match the Oracle (AD-19, decisions/ESC-9.10-2.md)",
  () => {
    // Local rows first, so they run even while a fixture is missing.
    const previous = new php.RuntimeException("prev");
    const e = new php.InvalidArgumentException("m", 5, previous);
    Assert.assertSame(previous, e.cause);
    Assert.assertInstanceOf(globalThis.Error, e);
    Assert.assertSame("m", e.message);

    // code: own, writable, configurable, non-enumerable; name: the FQCN brand, own and non-enumerable.
    const code = Object.getOwnPropertyDescriptor(e, "code")!;
    Assert.assertSame(5, code.value);
    Assert.assertTrue(code.writable ?? false);
    Assert.assertTrue(code.configurable ?? false);
    Assert.assertFalse(code.enumerable ?? true);
    const name = Object.getOwnPropertyDescriptor(e, "name")!;
    Assert.assertSame("InvalidArgumentException", name.value);
    Assert.assertFalse(name.enumerable ?? true);
    Assert.assertSame(0, Object.keys(e).length);
    Assert.assertTrue((e.stack ?? "").startsWith("InvalidArgumentException: m"));
    Assert.assertSame("XaravelFixture\\Exceptions\\NotFound", new NotFound().name);
    Assert.assertSame("LogicException", new XtUnregisteredLogic().name);
    for (const made of [new php.Exception(), new php.Error()]) {
      Assert.assertFalse("cause" in made);
    }
    const full = new php.ErrorException("w", 3, 2, "f.php", 9, previous);
    Assert.assertSame(2, full.getSeverity());
    Assert.assertSame(previous, full.getPrevious());
    Assert.assertSame(3, full.getCode());

    // An int is what AD-9.3 holds as one: an in-range bigint is kept; an int64-overflowing bigint, which PHP cannot
    // hold, is the float PHP makes of that literal, and is rejected as an out-of-range float (`float given`, PHP
    // 8.5.11). An unsafe integral number is an AD-9 float, coerced as PHP coerces a float (an Oracle row).
    Assert.assertSame(5n, new php.Exception("m", 5n).getCode());
    const overflow = thrownBy(() => new php.Exception("m", 2n ** 64n));
    Assert.assertInstanceOf(php.TypeError, overflow);
    Assert.assertSame("Exception::__construct(): Argument #2 ($code) must be of type int, float given", (overflow as Error).message);
    const symbol = thrownBy(() => new php.Exception(Symbol("s") as unknown as string));
    Assert.assertInstanceOf(php.TypeError, symbol);
    Assert.assertSame("Exception::__construct(): Argument #1 ($message) must be of type string, symbol given", (symbol as Error).message);
    // The PHP Error root keeps a non-zero code and its previous throwable (also the JS cause).
    const typeError = new php.TypeError("m", 7, previous);
    Assert.assertSame(7, typeError.getCode());
    Assert.assertSame(previous, typeError.getPrevious());
    Assert.assertSame(previous, typeError.cause);
    // A closure is no string. A __toString port's return coerces as PHP's coercive mode does (PHP 8.5 gives "5" for
    // a port returning 5), and one that returns null or a symbol throws PHP's TypeError.
    const closure = thrownBy(() => new php.Exception((() => "m") as unknown as string));
    Assert.assertInstanceOf(php.TypeError, closure);
    Assert.assertSame("Exception::__construct(): Argument #1 ($message) must be of type string, Closure given", (closure as Error).message);
    const badPort = thrownBy(() => new php.Exception(new BadLabel() as unknown as string));
    Assert.assertInstanceOf(php.TypeError, badPort);
    Assert.assertSame("XaravelFixture\\Exceptions\\BadLabel::__toString(): Return value must be of type string, null returned", (badPort as Error).message);
    Assert.assertSame("5", new php.Exception(new IntLabel() as unknown as string).getMessage());
    const symbolPort = thrownBy(() => new php.Exception(new SymbolLabel() as unknown as string));
    Assert.assertInstanceOf(php.TypeError, symbolPort);
    Assert.assertSame("XaravelFixture\\Exceptions\\SymbolLabel::__toString(): Return value must be of type string, symbol returned", (symbolPort as Error).message);

    // An object built without the constructor (as phpUnserialize builds one) reads its defaults, never throws.
    const bareException = Object.create(php.ErrorException.prototype) as php.ErrorException;
    Assert.assertNull(bareException.getPrevious());
    Assert.assertSame(0, bareException.getCode());
    Assert.assertSame(1, bareException.getSeverity());
    Assert.assertNull((Object.create(php.Error.prototype) as php.Error).getPrevious());

    // The Oracle rows.
    const output = oracle("XT-runtime-36");
    Assert.assertSame(valueOf(output, 0), e.getMessage());
    Assert.assertSame(valueOf(output, 1), e.getCode());
    Assert.assertSame(valueOf(output, 2), e.getPrevious() === previous);
    Assert.assertSame(valueOf(output, 3), e instanceof php.LogicException);
    Assert.assertSame(valueOf(output, 4), e instanceof php.Exception);
    Assert.assertSame(valueOf(output, 5), e instanceof php.Error);
    Assert.assertSame(valueOf(output, 6), e instanceof php.RuntimeException);

    // The defaults.
    const defaults: readonly (readonly [number, () => php.Exception | php.Error])[] = [
      [7, () => new php.Exception()],
      [8, () => new php.Error()],
    ];
    for (const [index, make] of defaults) {
      const expected = valueOf(output, index) as unknown[];
      const made = make();
      Assert.assertSame(3, expected.length);
      Assert.assertSame(expected[0], made.getMessage());
      Assert.assertSame(expected[1], made.getCode());
      Assert.assertSame(expected[2], made.getPrevious());
    }
    const errorException = new php.ErrorException();
    const expected = valueOf(output, 9) as unknown[];
    Assert.assertSame(4, expected.length);
    Assert.assertSame(expected[0], errorException.getMessage());
    Assert.assertSame(expected[1], errorException.getCode());
    Assert.assertSame(expected[2], errorException.getPrevious());
    Assert.assertSame(expected[3], errorException.getSeverity());

    // Bad arguments: the Oracle's TypeError class and message.
    const bad: readonly (readonly [number, () => unknown])[] = [
      [10, () => new php.InvalidArgumentException("m", "x" as unknown as number)],
      [11, () => new php.InvalidArgumentException("m", 5, "p" as unknown as Error)],
      [12, () => new php.ErrorException("m", "x" as unknown as number)],
      [13, () => new php.ErrorException("m", 0, 1, null, null, "p" as unknown as Error)],
      [14, () => new php.Error("m", "x" as unknown as number)],
      [15, () => new php.TypeError("m", 5, "p" as unknown as Error)],
      [16, () => new php.ErrorException([] as unknown as string, 0)],
      [17, () => new php.ErrorException("m", 0, [] as unknown as number)],
      [18, () => new php.ErrorException("m", 0, 1, [] as unknown as string)],
      [19, () => new php.ErrorException("m", 0, 1, null, [] as unknown as number)],
    ];
    for (const [index, make] of bad) {
      const expectedThrow = throwsOf(output, index);
      const error = thrownBy(make);
      Assert.assertInstanceOf(php.TypeError, error, `bad #${index}`);
      Assert.assertSame(expectedThrow.class, fqcn(error as object), `bad #${index}`);
      Assert.assertSame(expectedThrow.message, (error as Error).message, `bad #${index}`);
    }
    // PHP's coercive mode (decisions/ESC-9.10-2.md): a null message is "".
    Assert.assertSame(valueOf(output, 20), new php.Exception(null as unknown as string).getMessage());

    // A subclass's $code / $message defaults.
    Assert.assertSame(valueOf(output, 21), new NotFound().getCode());
    Assert.assertSame(valueOf(output, 22), new NotFound().getMessage());
    Assert.assertSame(valueOf(output, 23), new NotFound("x", 0).getCode());
    Assert.assertSame(valueOf(output, 24), new NotFound("x", 7).getCode());
    Assert.assertSame(valueOf(output, 25), new NotFound("").getMessage());

    // The coercions of PHP's coercive mode: each value as the Oracle gives it.
    const coerced: readonly (readonly [number, () => unknown])[] = [
      [26, () => new php.Exception("m", null as unknown as number).getCode()],
      [27, () => new php.Exception("m", "5" as unknown as number).getCode()],
      [28, () => new php.Exception("m", php.float(5) as unknown as number).getCode()],
      [29, () => new php.Exception("m", 5.5).getCode()],
      [30, () => new php.Exception("m", true as unknown as number).getCode()],
      [31, () => new php.Exception("m", false as unknown as number).getCode()],
      [32, () => new php.Exception("m", " 5 " as unknown as number).getCode()],
      [33, () => new php.Exception("m", "5.5" as unknown as number).getCode()],
      [34, () => new php.Exception("m", "1e3" as unknown as number).getCode()],
      [35, () => new php.Exception("m", -0).getCode()],
      [36, () => new php.Exception("m", 2 ** 60).getCode()],
      [42, () => new php.Exception(5 as unknown as string).getMessage()],
      [43, () => new php.Exception(5.5 as unknown as string).getMessage()],
      [44, () => new php.Exception((0.1 + 0.2) as unknown as string).getMessage()],
      [45, () => new php.Exception(1e100 as unknown as string).getMessage()],
      [46, () => new php.Exception(true as unknown as string).getMessage()],
      [47, () => new php.Exception(false as unknown as string).getMessage()],
      [48, () => new php.Exception(new Label() as unknown as string).getMessage()],
      [52, () => new php.ErrorException("m", 0, null as unknown as number).getSeverity()],
      [53, () => new php.ErrorException("m", 0, 2.5).getSeverity()],
      [54, () => new php.ErrorException("m", 0, 1, true as unknown as string, false as unknown as number).getMessage()],
    ];
    for (const [index, make] of coerced) {
      Assert.assertSame(valueOf(output, index), make(), `coerced #${index}`);
    }
    const lists: readonly (readonly [number, () => unknown[]])[] = [
      [
        50,
        () => {
          const made = new php.Error(null as unknown as string, "5" as unknown as number);
          return [made.getMessage(), made.getCode()];
        },
      ],
      [
        51,
        () => {
          const made = new php.ErrorException(null as unknown as string, "5" as unknown as number, "2" as unknown as number, 5 as unknown as string, "7" as unknown as number);
          return [made.getMessage(), made.getCode(), made.getSeverity()];
        },
      ],
      [57, () => [typeError.getMessage(), typeError.getCode(), typeError.getPrevious() === previous]],
    ];
    for (const [index, make] of lists) {
      const expectedList = valueOf(output, index) as unknown[];
      const made = make();
      Assert.assertSame(expectedList.length, made.length, `list #${index}`);
      expectedList.forEach((value, at) => Assert.assertSame(value, made[at], `list #${index}[${at}]`));
    }
    const rejected: readonly (readonly [number, () => unknown])[] = [
      [37, () => new php.Exception("m", "5abc" as unknown as number)],
      [38, () => new php.Exception("m", "" as unknown as number)],
      [39, () => new php.Exception("m", 1e20)],
      [40, () => new php.Exception("m", Number.NaN)],
      [41, () => new php.Exception("m", "9223372036854775808" as unknown as number)],
      [49, () => new php.Exception(new php.stdClass() as unknown as string)],
      [55, () => new php.ErrorException("m", 0, 1, null, "x" as unknown as number)],
      [56, () => new php.ErrorException("m", 0, 1, new php.stdClass() as unknown as string)],
    ];
    for (const [index, make] of rejected) {
      const expectedThrow = throwsOf(output, index);
      const error = thrownBy(make);
      Assert.assertInstanceOf(php.TypeError, error, `rejected #${index}`);
      Assert.assertSame(expectedThrow.class, fqcn(error as object), `rejected #${index}`);
      Assert.assertSame(expectedThrow.message, (error as Error).message, `rejected #${index}`);
    }
    Assert.assertSame(58, output.results.length);
  },
);

/** The part of the harness's junit reader and comparer (`conformance/harness/`) XT-runtime-43 uses. */
interface HarnessJunit {
  parseJunit: (xml: string) => Map<string, { outcome: string; type: string | null; message: string | null }>;
}
interface HarnessCompare {
  blockedComponent: (junit: { outcome: string; type: string | null; message: string | null }) => string | null;
}

xaravelTest(
  "XT-runtime-43",
  "BlockedByComponentError is a registered JS Error, not a PHP throwable, named BlockedByComponentError, whose message BlockedByComponentError(<c>)[: <detail>] bun's junit report records as the harness's blocked-by form; a component that is not lowercase kebab, or a detail that is not a string or null, throws a TypeError (ESC-5.3-1, ESC-12.1-2)",
  async () => {
    const { BlockedByComponentError } = root;
    // The harness may not import a graded package (AD-15); the runtime's test loads the harness at run time instead.
    const { parseJunit } = (await import(join(REPO, "conformance", "harness", "junit.ts"))) as HarnessJunit;
    const { blockedComponent } = (await import(join(REPO, "conformance", "harness", "compare.ts"))) as HarnessCompare;

    // Bare.
    const bare = new BlockedByComponentError("database");
    Assert.assertSame("BlockedByComponentError(database)", bare.message);
    Assert.assertSame("BlockedByComponentError", bare.name);
    Assert.assertSame("database", bare.component);
    Assert.assertTrue(bare instanceof globalThis.Error);
    Assert.assertTrue(bare instanceof BlockedByComponentError);

    // With detail.
    const detailed = new BlockedByComponentError("json-schema", "Illuminate\\JsonSchema is not installed");
    Assert.assertSame("BlockedByComponentError(json-schema): Illuminate\\JsonSchema is not installed", detailed.message);
    Assert.assertSame("json-schema", detailed.component);
    Assert.assertSame("BlockedByComponentError(json-schema)", new BlockedByComponentError("json-schema", null).message);

    // Every Component in the component map constructs, and its message yields it back through the harness's pattern.
    const components = readFileSync(join(REPO, "conformance", "component-map"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"))
      .map((line) => (JSON.parse(line) as { component: string }).component);
    Assert.assertTrue(components.length > 0, "the component map lists Components");
    for (const component of components) {
      const error = new BlockedByComponentError(component);
      Assert.assertSame(component, blockedComponent({ outcome: "failed", type: error.name, message: error.message }), component);
    }

    // The message matches the harness's pattern and yields the component.
    for (const error of [bare, detailed]) {
      Assert.assertSame(error.component, blockedComponent({ outcome: "failed", type: error.name, message: error.message }), error.message);
    }

    // Bad component, and bad detail.
    const badComponents: readonly unknown[] = ["", "Database", "a b", "(x)", "database-", "-database", "1database", null, 5, undefined];
    for (const component of badComponents) {
      const error = thrownBy(() => new BlockedByComponentError(component as string));
      Assert.assertInstanceOf(globalThis.TypeError, error, `component ${String(component)}`);
      Assert.assertFalse(error instanceof php.TypeError, `component ${String(component)} is not PHP's TypeError`);
      Assert.assertStringStartsWith("BlockedByComponentError():", (error as Error).message, `component ${String(component)}`);
    }
    const badDetails: readonly (readonly [string, unknown])[] = [["5", 5], ["{}", {}], ["false", false]];
    for (const [label, detail] of badDetails) {
      const error = thrownBy(() => new BlockedByComponentError("database", detail as string));
      Assert.assertInstanceOf(globalThis.TypeError, error, `detail ${label}`);
      Assert.assertFalse(error instanceof php.TypeError, `detail ${label} is not PHP's TypeError`);
      Assert.assertStringStartsWith("BlockedByComponentError():", (error as Error).message, `detail ${label}`);
    }

    // Registry.
    Assert.assertSame("Xaravel\\Runtime\\BlockedByComponentError", fqcn(BlockedByComponentError));
    Assert.assertSame("Xaravel\\Runtime\\BlockedByComponentError", fqcn(bare));
    Assert.assertSame(BlockedByComponentError, resolveClass("Xaravel\\Runtime\\BlockedByComponentError"));

    // Not PHP.
    Assert.assertFalse(bare instanceof php.Exception);
    Assert.assertFalse(bare instanceof php.Error);
    const published = (globalThis as Record<symbol, Record<string, abstract new (...args: never[]) => unknown>>)[PHP_CLASSES]!;
    Assert.assertFalse(bare instanceof published["Exception"]!);
    Assert.assertFalse(bare instanceof published["Error"]!);

    // Bun's junit report: a test that throws it from setUp-time code fails with type BlockedByComponentError.
    const dir = mkdtempSync(join(tmpdir(), "xt-runtime-43-"));
    try {
      const entry = JSON.stringify(join(PACKAGE_DIR, "src", "index.ts"));
      const assertEntry = JSON.stringify(join(REPO, "packages", "assert", "src", "index.ts"));
      writeFileSync(
        join(dir, "blocked.test.ts"),
        [
          `import { beforeEach, describe, test } from "bun:test";`,
          `import { BlockedByComponentError } from ${entry};`,
          `import { portedTest, TestCase } from ${assertEntry};`,
          `class BlockedCase extends TestCase {`,
          `  setUp(): void { throw new BlockedByComponentError("database", "Illuminate\\\\Database is not installed"); }`,
          `  tearDown(): void { throw new Error("tearDown also failed"); }`,
          `}`,
          `portedTest("Illuminate\\\\Tests\\\\Blocked::testPorted", { case: BlockedCase }, function () {});`,
          `test("bare", () => { throw new BlockedByComponentError("database"); });`,
          `describe("set up", () => {`,
          `  beforeEach(() => { throw new BlockedByComponentError("json-schema", "Illuminate\\\\JsonSchema is not installed"); });`,
          `  test("detailed", () => {});`,
          `});`,
        ].join("\n"),
      );
      const outfile = join(dir, "junit.xml");
      const run = Bun.spawnSync([process.execPath, "--no-env-file", "test", "--reporter=junit", `--reporter-outfile=${outfile}`, "./blocked.test.ts"], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
      Assert.assertNotSame(0, run.exitCode, "the blocked tests fail");
      Assert.assertTrue(existsSync(outfile), `no junit report: ${run.stderr.toString()}`);
      const cases = parseJunit(readFileSync(outfile, "utf8"));
      const bareCase = cases.get("bare") ?? null;
      Assert.assertNotNull(bareCase, run.stderr.toString());
      Assert.assertSame("failed", bareCase!.outcome);
      Assert.assertSame("BlockedByComponentError", bareCase!.type);
      Assert.assertStringStartsWith("BlockedByComponentError(database)", bareCase!.message ?? "");
      Assert.assertSame("database", blockedComponent(bareCase!));
      const setUpCase = [...cases.entries()].find(([name]) => name.endsWith("detailed"))?.[1] ?? null;
      Assert.assertNotNull(setUpCase, [...cases.keys()].join(", "));
      Assert.assertSame("failed", setUpCase!.outcome);
      Assert.assertSame("BlockedByComponentError", setUpCase!.type);
      Assert.assertStringStartsWith("BlockedByComponentError(json-schema): Illuminate\\JsonSchema is not installed", setUpCase!.message ?? "");
      Assert.assertSame("json-schema", blockedComponent(setUpCase!));
      // The documented route: a portedTest whose case's setUp throws it; tearDown's later error does not replace it.
      const portedCase = [...cases.entries()].find(([name]) => name.endsWith("Blocked::testPorted"))?.[1] ?? null;
      Assert.assertNotNull(portedCase, [...cases.keys()].join(", "));
      Assert.assertSame("failed", portedCase!.outcome);
      Assert.assertSame("BlockedByComponentError", portedCase!.type);
      Assert.assertStringStartsWith("BlockedByComponentError(database)", portedCase!.message ?? "");
      Assert.assertSame("database", blockedComponent(portedCase!));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
