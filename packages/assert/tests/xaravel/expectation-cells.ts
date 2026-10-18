// The shared cell table of Story 4.4 (XT-assert-11 and XT-assert-12): each
// cell as PHP source for the Oracle and the same case in TS.
//
// The request file `conformance/oracle-requests/4.4.jsonl` was generated from
// this table (by a throwaway script outside the repository, through
// tools/oracle/request.ts's makeRequest and renderRequests), and
// expectations.test.ts rebuilds every request's `setup` and `exprs` from it,
// so the table and the signed fixtures cannot drift apart. No expected outcome
// is written here: every one comes from the Oracle.
//
// The evaluator runs no `runBare`, so a lifecycle cell drives the PHPUnit
// pieces `runTest` calls (Design Notes "Requests"): `xt_expect` builds an
// `ExceptionExpectation`, runs the body and then `shouldBeVerifiedFor` and
// `verify`, or `assertWasRaised`; `xt_output` runs an `OutputBuffer`. The TS
// twin of a lifecycle cell is the body of a declared TestCase test, run by
// fixtures/expectations.fixture.ts in a child `bun test`.
//
// A cell is `null` (it passes) or `[class short name, getMessage(), null |
// [expectedAsString, actualAsString, getDiff(), toString()], getCode()]`.
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Assert, AssertionFailedError, ExpectationFailedException, type TestCase } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** `[PHP source, TS twin]`. */
export type Pair = readonly [php: string, ts: unknown];

// ---------------------------------------------------------------------------
// Twin classes

/** PHP's `\Exception`: a JS `Error` with `getMessage()` and `getCode()`. */
export class PhpException extends Error {
  static readonly [CLASS_FQCN]: string = "Exception";
  readonly #code: number;
  constructor(message = "", code = 0) {
    super(message);
    this.#code = code;
  }
  getMessage(): string {
    return this.message;
  }
  getCode(): number {
    return this.#code;
  }
}

/** PHP's `\RuntimeException` (PHPUnit's Exception base extends it in PHP). */
export class PhpRuntimeException extends PhpException {
  static override readonly [CLASS_FQCN]: string = "RuntimeException";
}

export class XtE extends PhpException {
  static override readonly [CLASS_FQCN]: string = "XtE";
}

export class XtESub extends XtE {
  static override readonly [CLASS_FQCN]: string = "XtESub";
}

export class XtOther extends PhpException {
  static override readonly [CLASS_FQCN]: string = "XtOther";
}

export class XtEI extends PhpException {
  static override readonly [CLASS_FQCN]: string = "XtEI";
}

/** PHP's `interface XtThrown`, which `XtEI` implements: an interface token (ESC-4.3-1 item 1). */
export const XtThrown = { [CLASS_FQCN]: "XtThrown", [Symbol.hasInstance]: (value: unknown): boolean => value instanceof XtEI };

export const SETUP_CLASSES: readonly string[] = [
  "class XtE extends \\Exception {}",
  "class XtESub extends XtE {}",
  "class XtOther extends \\Exception {}",
  "interface XtThrown {}",
  "class XtEI extends \\Exception implements XtThrown {}",
];

export const SETUP_HELPERS: readonly string[] = [
  "function xt_cell44(callable $f) { try { $f(); return null; } catch (\\Throwable $e) { $c = $e instanceof \\PHPUnit\\Framework\\ExpectationFailedException ? $e->getComparisonFailure() : null; return [(new \\ReflectionClass($e))->getShortName(), $e->getMessage(), $c === null ? null : [$c->getExpectedAsString(), $c->getActualAsString(), $c->getDiff(), $c->toString()], $e->getCode()]; } }",
  "function xt_expect(\\PHPUnit\\Framework\\TestCase $test, callable $configure, callable $body) { return xt_cell44(function () use ($test, $configure, $body) { $x = new \\PHPUnit\\Framework\\TestCase\\ExceptionExpectation; $configure($x); try { $body(); } catch (\\Throwable $t) { if (!$x->shouldBeVerifiedFor($t)) { throw $t; } $x->verify($t); return; } $x->assertWasRaised($test); }); }",
  "function xt_output(array $expected, callable $body) { return xt_cell44(function () use ($expected, $body) { $b = new \\PHPUnit\\Framework\\TestCase\\OutputBuffer; foreach ($expected as $s) { $b->expectString($s); } $b->start(); try { $body(); } finally { $b->stop(); } $b->performAssertions(); }); }",
];

/** A PHP string literal for `value` (single-quoted when it can be, else double-quoted with escapes). */
export function phpString(value: string): string {
  // oxlint-disable-next-line no-control-regex -- the characters a single-quoted PHP literal cannot spell
  if (!/[\x00-\x1f\x7f]/.test(value)) {
    return `'${value.replace(/[\\']/g, (match) => `\\${match}`)}'`;
  }
  // oxlint-disable-next-line no-control-regex -- escaped in a double-quoted PHP literal
  const escaped = value.replace(/[\x00-\x1f\x7f"\\$]/g, (match) => {
    switch (match) {
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      case '"':
      case "\\":
      case "$":
        return `\\${match}`;
      default:
        return `\\x${match.charCodeAt(0).toString(16).padStart(2, "0")}`;
    }
  });
  return `"${escaped}"`;
}

// ---------------------------------------------------------------------------
// Lifecycle cells: a declared TestCase test in TS, the PHPUnit pieces in PHP

export interface LifecycleCell {
  /** Unique; the fixture's Test ID is `Tests\Unit\ExpectationsTest::<label>`. */
  readonly label: string;
  readonly php: string;
  /** The test body, `this` the TestCase instance. */
  readonly ts: (this: TestCase) => unknown;
}

function expect44(label: string, configure: string, body: string, ts: LifecycleCell["ts"]): LifecycleCell {
  return { label, php: `xt_expect($this, function ($x) { ${configure} }, function () { ${body} })`, ts };
}

function output(label: string, expected: readonly string[], written: readonly string[], ts: LifecycleCell["ts"]): LifecycleCell {
  const echo = written.map((text) => `echo ${phpString(text)};`).join(" ");
  return { label, php: `xt_output([${expected.map(phpString).join(", ")}], function () { ${echo} })`, ts };
}

/** Every expected-output cell writes this marker; output an expectation captured must never reach the real stdout. */
export const OUTPUT_MARKER = "xt-captured-output";

const LINES: readonly string[] = Array.from({ length: 20 }, (_, index) => `${OUTPUT_MARKER} line ${index + 1}`);

/** XT-assert-11: `expectException`. */
export const EXCEPTION_CELLS: readonly LifecycleCell[] = [
  expect44("testExpectedClassThrown", "$x->expectClass(XtE::class);", "throw new XtE('m');", function () {
    this.expectException(XtE);
    throw new XtE("m");
  }),
  expect44("testSubclassThrown", "$x->expectClass(XtE::class);", "throw new XtESub('m');", function () {
    this.expectException(XtE);
    throw new XtESub("m");
  }),
  expect44("testNothingThrown", "$x->expectClass(XtE::class);", "", function () {
    this.expectException(XtE);
  }),
  expect44("testOtherClassThrown", "$x->expectClass(XtE::class);", "throw new XtOther('other message');", function () {
    this.expectException(XtE);
    throw new XtOther("other message");
  }),
  expect44("testParentClassThrown", "$x->expectClass(XtESub::class);", "throw new XtE('m');", function () {
    this.expectException(XtESub);
    throw new XtE("m");
  }),
  expect44("testInterfaceThrown", "$x->expectClass(XtThrown::class);", "throw new XtEI('m');", function () {
    this.expectException(XtThrown);
    throw new XtEI("m");
  }),
  expect44("testInterfaceOtherClassThrown", "$x->expectClass(XtThrown::class);", "throw new XtE('m');", function () {
    this.expectException(XtThrown);
    throw new XtE("m");
  }),
  expect44("testInterfaceNothingThrown", "$x->expectClass(XtThrown::class);", "", function () {
    this.expectException(XtThrown);
  }),
  expect44("testSkipUnderExpectedClass", "$x->expectClass(XtE::class);", "\\PHPUnit\\Framework\\Assert::markTestSkipped('skipped under expectException');", function () {
    this.expectException(XtE);
    this.markTestSkipped("skipped under expectException");
  }),
  expect44("testAssertionFailureUnderRuntimeException", "$x->expectClass(\\RuntimeException::class);", "throw new \\PHPUnit\\Framework\\AssertionFailedError('x');", function () {
    this.expectException(PhpRuntimeException);
    throw new AssertionFailedError("x");
  }),
  expect44("testFailUnderExpectedClass", "$x->expectClass(XtE::class);", "\\PHPUnit\\Framework\\Assert::fail('f');", function () {
    this.expectException(XtE);
    this.fail("f");
  }),
  expect44("testAssertionFailureExpected", "$x->expectClass(\\PHPUnit\\Framework\\AssertionFailedError::class);", "throw new \\PHPUnit\\Framework\\AssertionFailedError('x');", function () {
    this.expectException(AssertionFailedError);
    throw new AssertionFailedError("x");
  }),
  expect44("testFailingAssertionExpected", "$x->expectClass(\\PHPUnit\\Framework\\ExpectationFailedException::class);", "\\PHPUnit\\Framework\\Assert::assertTrue(false);", function () {
    this.expectException(ExpectationFailedException);
    this.assertTrue(false);
  }),
];

/** XT-assert-12: the other expectations, the output buffer and the test outcomes. */
export const EXPECTATION_CELLS: readonly LifecycleCell[] = [
  expect44("testMessageContained", "$x->expectMessageIsOrContains('m');", "throw new XtE('a m b');", function () {
    this.expectExceptionMessage("m");
    throw new XtE("a m b");
  }),
  expect44("testMessageNotContained", "$x->expectMessageIsOrContains('m');", "throw new XtE('x');", function () {
    this.expectExceptionMessage("m");
    throw new XtE("x");
  }),
  expect44("testMessageNothingThrown", "$x->expectMessageIsOrContains('m');", "", function () {
    this.expectExceptionMessage("m");
  }),
  expect44("testEmptyMessageMatches", "$x->expectMessageIsOrContains('');", "throw new XtE('');", function () {
    this.expectExceptionMessage("");
    throw new XtE("");
  }),
  expect44("testEmptyMessageDiffers", "$x->expectMessageIsOrContains('');", "throw new XtE('x');", function () {
    this.expectExceptionMessage("");
    throw new XtE("x");
  }),
  expect44("testClassAndMessage", "$x->expectClass(XtE::class); $x->expectMessageIsOrContains('m');", "throw new XtE('x');", function () {
    this.expectException(XtE);
    this.expectExceptionMessage("m");
    throw new XtE("x");
  }),
  expect44("testMessageMatches", "$x->expectMessageMatches('/^a.c$/');", "throw new XtE('abc');", function () {
    this.expectExceptionMessageMatches(/^a.c$/);
    throw new XtE("abc");
  }),
  expect44("testMessageDoesNotMatch", "$x->expectMessageMatches('/^a.c$/');", "throw new XtE('abdd');", function () {
    this.expectExceptionMessageMatches(/^a.c$/);
    throw new XtE("abdd");
  }),
  expect44("testMessageMatchesNothingThrown", "$x->expectMessageMatches('/^a.c$/');", "", function () {
    this.expectExceptionMessageMatches(/^a.c$/);
  }),
  expect44("testCodeEqual", "$x->expectCode(3);", "throw new XtE('m', 3);", function () {
    this.expectExceptionCode(3);
    throw new XtE("m", 3);
  }),
  expect44("testCodeDiffers", "$x->expectCode(3);", "throw new XtE('m', 4);", function () {
    this.expectExceptionCode(3);
    throw new XtE("m", 4);
  }),
  expect44("testCodeAsString", "$x->expectCode('3');", "throw new XtE('m', 3);", function () {
    this.expectExceptionCode("3");
    throw new XtE("m", 3);
  }),
  expect44("testCodeNothingThrown", "$x->expectCode(3);", "", function () {
    this.expectExceptionCode(3);
  }),
  // expectExceptionObject($e) is expectException($e::class), expectExceptionMessage($e->getMessage()) and
  // expectExceptionCode($e->getCode()) (TestCase.php:969-974).
  expect44("testObjectMatches", "$e = new XtE('m', 3); $x->expectClass($e::class); $x->expectMessageIsOrContains($e->getMessage()); $x->expectCode($e->getCode());", "throw new XtE('a m', 3);", function () {
    this.expectExceptionObject(new XtE("m", 3));
    throw new XtE("a m", 3);
  }),
  expect44("testObjectCodeDiffers", "$e = new XtE('m', 3); $x->expectClass($e::class); $x->expectMessageIsOrContains($e->getMessage()); $x->expectCode($e->getCode());", "throw new XtE('m', 4);", function () {
    this.expectExceptionObject(new XtE("m", 3));
    throw new XtE("m", 4);
  }),
  expect44("testObjectMessageDiffers", "$e = new XtE('m', 3); $x->expectClass($e::class); $x->expectMessageIsOrContains($e->getMessage()); $x->expectCode($e->getCode());", "throw new XtE('x', 3);", function () {
    this.expectExceptionObject(new XtE("m", 3));
    throw new XtE("x", 3);
  }),
  expect44("testObjectNothingThrown", "$e = new XtE('m', 3); $x->expectClass($e::class); $x->expectMessageIsOrContains($e->getMessage()); $x->expectCode($e->getCode());", "", function () {
    this.expectExceptionObject(new XtE("m", 3));
  }),
  output("testOutputMatches", [`${OUTPUT_MARKER} abc`], [`${OUTPUT_MARKER} abc`], function () {
    this.expectOutputString(`${OUTPUT_MARKER} abc`);
    process.stdout.write(`${OUTPUT_MARKER} abc`);
  }),
  output("testOutputDiffers", [`${OUTPUT_MARKER} abc`], [`${OUTPUT_MARKER} ab`, "d"], function () {
    this.expectOutputString(`${OUTPUT_MARKER} abc`);
    process.stdout.write(`${OUTPUT_MARKER} ab`);
    process.stdout.write("d");
  }),
  output("testOutputEmpty", [`${OUTPUT_MARKER} abc`], [], function () {
    this.expectOutputString(`${OUTPUT_MARKER} abc`);
  }),
  output("testOutputLineEndings", [`${OUTPUT_MARKER} a\r\nb\n`], [`${OUTPUT_MARKER} a\nb\n`], function () {
    this.expectOutputString(`${OUTPUT_MARKER} a\r\nb\n`);
    process.stdout.write(`${OUTPUT_MARKER} a\nb\n`);
  }),
  output("testOutputHunks", [LINES.join("\n")], [LINES.map((line, index) => (index === 1 || index === 17 ? `${line}!` : line)).join("\n")], function () {
    this.expectOutputString(LINES.join("\n"));
    process.stdout.write(LINES.map((line, index) => (index === 1 || index === 17 ? `${line}!` : line)).join("\n"));
  }),
  // The body fails: its error wins and the output is not asserted (runLifecycle), nor written through.
  {
    label: "testOutputWithFailingBody",
    php: `xt_output([${phpString(`${OUTPUT_MARKER} abc`)}], function () { echo ${phpString(`${OUTPUT_MARKER} abd`)}; throw new XtE('body failed', 7); })`,
    ts: function () {
      this.expectOutputString(`${OUTPUT_MARKER} abc`);
      process.stdout.write(`${OUTPUT_MARKER} abd`);
      throw new XtE("body failed", 7);
    },
  },
  {
    label: "testNotToPerformAssertions",
    php: "xt_cell44(function () { $this->expectNotToPerformAssertions(); })",
    ts: function () {
      this.expectNotToPerformAssertions();
    },
  },
  {
    label: "testFail",
    php: "xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::fail('f'))",
    ts: function () {
      this.fail("f");
    },
  },
  {
    label: "testFailWithoutMessage",
    php: "xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::fail())",
    ts: function () {
      this.fail();
    },
  },
  {
    label: "testMarkTestSkipped",
    php: "xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::markTestSkipped('not here'))",
    ts: function () {
      this.markTestSkipped("not here");
    },
  },
];

// ---------------------------------------------------------------------------
// Direct cells: one Assert call, in PHP and in TS

export interface DirectCell {
  readonly label: string;
  readonly php: string;
  readonly ts: () => void;
}

function direct(label: string, phpCall: string, ts: () => void): DirectCell {
  return { label, php: `xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::${phpCall})`, ts };
}

/** `assertThat` with the constraint factories Upstream calls (`Support/DateFacadeTest.php:24`). */
const THAT_V: readonly Pair[] = [
  ["0", 0],
  ["1", 1],
  ["3", 3],
  ["5", 5],
  ["6", 6],
  ["2.5", 2.5],
  ["'3'", "3"],
  ["null", null],
];

export const THAT_CELLS: readonly DirectCell[] = [
  ...THAT_V.map(([php, ts]) =>
    direct(
      `assertThat between ${php}`,
      `assertThat(${php}, \\PHPUnit\\Framework\\Assert::logicalAnd(\\PHPUnit\\Framework\\Assert::greaterThanOrEqual(1), \\PHPUnit\\Framework\\Assert::lessThanOrEqual(5)))`,
      () => Assert.assertThat(ts, Assert.logicalAnd(Assert.greaterThanOrEqual(1), Assert.lessThanOrEqual(5))),
    ),
  ),
  direct("assertThat with message", "assertThat(9, \\PHPUnit\\Framework\\Assert::logicalAnd(\\PHPUnit\\Framework\\Assert::greaterThanOrEqual(1), \\PHPUnit\\Framework\\Assert::lessThanOrEqual(5)), 'ctx')", () =>
    Assert.assertThat(9, Assert.logicalAnd(Assert.greaterThanOrEqual(1), Assert.lessThanOrEqual(5)), "ctx"),
  ),
  direct("assertThat logicalAnd with a value", "assertThat(2, \\PHPUnit\\Framework\\Assert::logicalAnd(\\PHPUnit\\Framework\\Assert::greaterThanOrEqual(1), 3))", () =>
    Assert.assertThat(2, Assert.logicalAnd(Assert.greaterThanOrEqual(1), 3)),
  ),
  direct("assertThat isInstanceOf passes", "assertThat(new XtESub('m'), \\PHPUnit\\Framework\\Assert::isInstanceOf(XtE::class))", () => Assert.assertThat(new XtESub("m"), Assert.isInstanceOf(XtE))),
  direct("assertThat isInstanceOf fails", "assertThat(new XtOther('m'), \\PHPUnit\\Framework\\Assert::isInstanceOf(XtE::class))", () => Assert.assertThat(new XtOther("m"), Assert.isInstanceOf(XtE))),
  direct("fail", "fail('f')", () => Assert.fail("f")),
  direct("markTestSkipped", "markTestSkipped('s')", () => Assert.markTestSkipped("s")),
];

// Files and directories. Paths that exist in both environments, fixed absent paths, and files the setup writes
// under the temp directory with fixed contents (only contents reach a message).

const TMP_TS = tmpdir();

/** `[PHP path expression, TS path, contents]` of the files the setup writes. */
export const FILES: readonly (readonly [php: string, ts: string, contents: string])[] = [
  ["$xtFile1", join(TMP_TS, "xt-assert-12-1.txt"), "abc"],
  ["$xtFile2", join(TMP_TS, "xt-assert-12-2.txt"), "line 1\nline 2\nline 3\n"],
  ["$xtFile3", join(TMP_TS, "xt-assert-12-3.txt"), ""],
  ["$xtFile4", join(TMP_TS, "xt-assert-12-4.txt"), "Ünïcödé\n"],
];

export const FILE_SETUP: readonly string[] = FILES.map(([php, , contents], index) => `${php} = sys_get_temp_dir() . '/xt-assert-12-${index + 1}.txt'; file_put_contents(${php}, ${phpString(contents)});`);

const PATHS: readonly Pair[] = [
  ["'/'", "/"],
  ["'/tmp'", "/tmp"],
  ["'/etc/hosts'", "/etc/hosts"],
  ["'/xaravel-nonexistent'", "/xaravel-nonexistent"],
  ["'/xaravel-nonexistent/file.txt'", "/xaravel-nonexistent/file.txt"],
  ["''", ""],
];

const FILE_ACTUALS: readonly Pair[] = [
  ["'abc'", "abc"],
  ["'abd'", "abd"],
  ["''", ""],
  [phpString("line 1\nline 2\nline 4\n"), "line 1\nline 2\nline 4\n"],
  [phpString("Ünïcödé\n"), "Ünïcödé\n"],
];

const FILE_ASSERTIONS = ["assertFileExists", "assertFileDoesNotExist", "assertDirectoryExists", "assertDirectoryDoesNotExist"] as const;

/** The static methods of Assert the cells call by name. */
function call(name: string): (...args: unknown[]) => void {
  return (Assert as unknown as Record<string, (...args: unknown[]) => void>)[name]!;
}

export const FILE_CELLS: readonly DirectCell[] = [
  ...FILE_ASSERTIONS.flatMap((name) => PATHS.map(([php, ts]) => direct(`${name}(${php})`, `${name}(${php})`, () => call(name)(ts)))),
  ...FILE_ASSERTIONS.map((name) => direct(`${name} with message`, `${name}('/xaravel-nonexistent/file.txt', 'ctx')`, () => call(name)("/xaravel-nonexistent/file.txt", "ctx"))),
  ...FILE_ASSERTIONS.map((name) => direct(`${name} on the root, with message`, `${name}('/', 'ctx')`, () => call(name)("/", "ctx"))),
  ...FILES.flatMap(([phpPath, tsPath]) =>
    FILE_ACTUALS.map(([php, ts]) => direct(`assertStringEqualsFile(${phpPath}, ${php})`, `assertStringEqualsFile(${phpPath}, ${php})`, () => Assert.assertStringEqualsFile(tsPath, ts as string))),
  ),
  // file_get_contents() on a directory raises a notice and returns ''. `@` keeps the notice out of the evaluator's
  // output (the CLI's display_errors may write it to stdout); the cell's value is the same.
  {
    label: "assertStringEqualsFile on a directory",
    php: "xt_cell44(fn () => @\\PHPUnit\\Framework\\Assert::assertStringEqualsFile('/tmp', 'x'))",
    ts: () => Assert.assertStringEqualsFile("/tmp", "x"),
  },
  direct("assertStringEqualsFile on an absent file", "assertStringEqualsFile('/xaravel-nonexistent/file.txt', 'abc', 'ctx')", () => Assert.assertStringEqualsFile("/xaravel-nonexistent/file.txt", "abc", "ctx")),
  direct("assertStringEqualsFile with message", "assertStringEqualsFile($xtFile1, 'abd', 'ctx')", () => Assert.assertStringEqualsFile(FILES[0]![1], "abd", "ctx")),
];

// JSON. `$v` holds the operands of both JSON assertions (assertJsonStringEqualsJsonString runs over `$v × $v`);
// `$w` holds operands only assertJson runs (deep documents, whose prettified failures would be huge).

// json_decode()'s depth 512 admits 511 nested arrays or objects (probed 2026-10-18).
const DEEP_OK = `${"[".repeat(511)}${"]".repeat(511)}`;
const DEEP_BAD = `${"[".repeat(512)}${"]".repeat(512)}`;

const jsonPair = (json: string): Pair => [phpString(json), json];

export const JSON_V: readonly Pair[] = [
  jsonPair('{"a":1,"b":2}'),
  jsonPair('{"b":2,"a":1}'),
  jsonPair('{"a":1.0,"b":2}'),
  jsonPair('{"a":2,"b":2}'),
  jsonPair('{"10":1,"2":2,"1":3}'),
  jsonPair('{"1":3,"2":2,"10":1}'),
  jsonPair('{"a":{"c":1,"b":[1,{"z":1,"y":2}]}}'),
  jsonPair('{"a":{"b":[1,{"y":2,"z":1}],"c":1}}'),
  jsonPair('{"a":{"b":[{"y":2,"z":1},1],"c":1}}'),
  jsonPair("[12345678901234567890]"),
  jsonPair("[12345678901234567891]"),
  jsonPair("[9007199254740993]"),
  jsonPair("[9007199254740992]"),
  jsonPair('{"u":"é/\\u00e9","s":"a\\/b"}'),
  jsonPair('{"s":"a/b","u":"é/é"}'),
  jsonPair('{"u":"\\u2028\\ud83d\\ude00\\u001f"}'),
  jsonPair('{"a":-0.0,"b":1e25,"c":0.1,"d":1.5e-7}'),
  jsonPair('{"a":0,"b":1.0e+25,"c":0.10000000000000001,"d":0.00000015}'),
  jsonPair('{"a":1,"a":2}'),
  jsonPair("[]"),
  jsonPair("{}"),
  jsonPair("[1,2]"),
  jsonPair("[2,1]"),
  jsonPair('"x"'),
  jsonPair("null"),
  jsonPair("1e400"),
  jsonPair(""),
  jsonPair(" "),
  jsonPair("\t\n "),
  jsonPair('{"a":1,}'),
  jsonPair("[1,]"),
  jsonPair('{"a":1]'),
  jsonPair("[1}"),
  jsonPair('"a\tb"'),
  jsonPair("\u0001"),
  jsonPair("\f[1]"),
  jsonPair('"\\ud800"'),
  jsonPair('"\\x"'),
  jsonPair("01"),
  jsonPair("tru"),
  jsonPair('"abc'),
];

export const JSON_W: readonly Pair[] = [
  [`str_repeat('[', 511) . str_repeat(']', 511)`, DEEP_OK],
  [`str_repeat('[', 512) . str_repeat(']', 512)`, DEEP_BAD],
  [`str_repeat('[', 513) . str_repeat(']', 513)`, `${"[".repeat(513)}${"]".repeat(513)}`],
  [`str_repeat('[', 513)`, "[".repeat(513)],
  [`'{"a":' . str_repeat('[', 510) . str_repeat(']', 510) . '}'`, `{"a":${"[".repeat(510)}${"]".repeat(510)}}`],
  [`'{"a":' . str_repeat('[', 511) . str_repeat(']', 511) . '}'`, `{"a":${DEEP_OK}}`],
];

/** Cells beyond the two matrices: a custom message, and non-string arguments (PHP's coercive `string` parameters). */
export const JSON_CELLS: readonly DirectCell[] = [
  direct("assertJson with message", "assertJson('{', 'ctx')", () => Assert.assertJson("{", "ctx")),
  direct("assertJsonStringEqualsJsonString with message", "assertJsonStringEqualsJsonString('[1]', '[2]', 'ctx')", () => Assert.assertJsonStringEqualsJsonString("[1]", "[2]", "ctx")),
  direct("assertJsonStringEqualsJsonString invalid expected with message", "assertJsonStringEqualsJsonString('{', '[2]', 'ctx')", () => Assert.assertJsonStringEqualsJsonString("{", "[2]", "ctx")),
  direct("assertJson on an int", "assertJson(1)", () => Assert.assertJson(1 as unknown as string)),
  direct("assertJsonStringEqualsJsonString on ints", "assertJsonStringEqualsJsonString(1, 2)", () => Assert.assertJsonStringEqualsJsonString(1 as unknown as string, 2 as unknown as string)),
  direct("assertJson on null", "assertJson(null)", () => Assert.assertJson(null as unknown as string)),
  direct("assertJson on an array", "assertJson([])", () => Assert.assertJson([] as unknown as string)),
];

const listSource = (pairs: readonly Pair[]): string => `[${pairs.map(([php]) => php).join(", ")}]`;

export const JSON_SETUP: readonly string[] = [`$v = ${listSource(JSON_V)};`, `$w = ${listSource(JSON_W)};`];
export const JSON_MATRIX_EXPRS: readonly string[] = [
  "$v",
  "$w",
  "array_map(fn ($a) => xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::assertJson($a)), array_merge($v, $w))",
  "array_map(fn ($a) => array_map(fn ($b) => xt_cell44(fn () => \\PHPUnit\\Framework\\Assert::assertJsonStringEqualsJsonString($a, $b)), $v), $v)",
];

// ---------------------------------------------------------------------------
// Requests

export interface RequestSpec {
  readonly id: "XT-assert-11" | "XT-assert-12";
  readonly name: string;
  readonly setup: readonly string[];
  readonly exprs: readonly string[];
}

export const REQUESTS: readonly RequestSpec[] = [
  { id: "XT-assert-11", name: "expectException", setup: [...SETUP_CLASSES, ...SETUP_HELPERS], exprs: EXCEPTION_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-12", name: "expectations", setup: [...SETUP_CLASSES, ...SETUP_HELPERS], exprs: EXPECTATION_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-12", name: "assertThat", setup: [...SETUP_CLASSES, ...SETUP_HELPERS], exprs: THAT_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-12", name: "files", setup: [...SETUP_HELPERS, ...FILE_SETUP], exprs: FILE_CELLS.map((cell) => cell.php) },
  { id: "XT-assert-12", name: "json", setup: [...SETUP_HELPERS, ...JSON_SETUP], exprs: [...JSON_MATRIX_EXPRS, ...JSON_CELLS.map((cell) => cell.php)] },
];
