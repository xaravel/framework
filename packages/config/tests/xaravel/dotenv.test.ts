// Xaravel Tests for Story 15.2: the phpdotenv v5.7.0 port's grammar (XT-config-3, FR-20.1) and its immutable and
// mutable repository precedence (XT-config-4, FR-20.2), each compared, case by case, with the signed Oracle fixture
// of its request in `conformance/oracle-requests/15.2.jsonl`; a missing fixture fails the test.
//
// F-10 recorded reason: phpdotenv is outside the Test Inventory, so no Upstream test exists whose inputs the requests
// could take. Per docs/ops/oracle.md § Per-Story requests, each request evaluates only the inputs its acceptance
// criterion names (epics.md Story 15.2; epic-15-context.md "phpdotenv grammar (15.2)" and "Repository modes
// (15.2)"), built by `dotenv-cases.ts`: for XT-config-3, `\Dotenv\Dotenv::parse` on contents covering unquoted,
// single- and double-quoted values and escape sequences, `${VAR}` interpolation (nested and undefined), multiline
// quoted values, `export` prefixes, inline and full-line comments, empty values and whitespace, and invalid lines (an unclosed double-quoted value parses to an empty array),
// then each `Validator` assertion on an array-backed Dotenv (the spec's deferred `allowedRegexValues` item);
// for XT-config-4, loads through immutable and mutable repositories over the default adapters (and the putenv adapter
// and an allow list) with a name already in `$_SERVER` and `$_ENV`, read back after each load. It contains no Upstream
// test and no fixture. Beyond the Oracle cases, XT-config-3 checks PhpOption's `Option::lift` and `None` iteration, and
// XT-config-4 a file-backed load from a temp directory (ESC-15.2-6); those requests stay unchanged, so their signed
// fixtures stay valid. The test checks that the committed request is the one `dotenv-cases.ts` builds.
import { join, resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Dotenv, ExceptionInterface, InvalidFileException, InvalidPathException, None, Option, RepositoryBuilder, Some, Value } from "@xaravel/config";
import { fqcn, InvalidArgumentException } from "@xaravel/runtime";
import { BadMethodCallException, DIRECTORY_SEPARATOR, EmptyIterator, Error as PhpError, putenv, superglobals } from "@xaravel/runtime/php";
import { cleanPrecedence, requests } from "./dotenv-cases";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUESTS = "conformance/oracle-requests/15.2.jsonl";
const FIXTURES = "conformance/fixtures/config";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

/** The part of the grader's Oracle helpers (`packages/assert/tests/xaravel/oracle-values.ts`) this file uses. */
interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: { class: string; message: string } })[];
}
interface OracleValues {
  decode: (encoded: unknown) => unknown;
  readRequests: (path: string) => { id: string; sha256: string; setup: string[]; exprs: string[] }[];
  readSignedFixture: (path: string, sha256: string, publicKeyPem: string) => Output;
}

// The grader's fixture reader is a test module of @xaravel/assert, outside this package's tsc project, so it is loaded
// at run time rather than re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;

/**
 * Compares each case of `id` with the signed Oracle output of its one request: a value with `assertSame` on the
 * decoded fixture value, a throw by the exception's FQCN and message. The committed request must be the one
 * `dotenv-cases.ts` builds, so the Xaravel side runs the Oracle's inputs.
 */
function compareWithOracle(id: "XT-config-3" | "XT-config-4"): void {
  const expected = requests()[id];
  const found = readRequests(join(REPO, REQUESTS)).filter((request) => request.id === id);
  Assert.assertCount(1, found, `${REQUESTS} holds one request for ${id}`);
  const request = found[0]!;
  Assert.assertSame([...expected.setup], request.setup, `${id}: the committed setup is dotenv-cases.ts'`);
  Assert.assertSame(expected.cases.map((c) => c.expr), request.exprs, `${id}: the committed exprs are dotenv-cases.ts'`);
  const output = readSignedFixture(join(REPO, FIXTURES, `${request.sha256}.json`), request.sha256, readFileSync(join(REPO, PUBLIC_KEY), "utf8"));
  Assert.assertNull(output.error, `${id}: the Oracle reported no error`);
  Assert.assertCount(expected.cases.length, output.results, `${id}: one Oracle result per case`);
  expected.cases.forEach((c, index) => {
    const oracle = output.results[index]!;
    let actual: { value: unknown } | { throws: { class: string; message: string } };
    try {
      actual = { value: c.run() };
    } catch (error) {
      actual = { throws: { class: fqcn(error as object), message: (error as Error).message } };
    }
    if ("throws" in oracle) {
      Assert.assertTrue("throws" in actual, `${c.expr}: throws ${oracle.throws.class}`);
      const thrown = (actual as { throws: { class: string; message: string } }).throws;
      Assert.assertSame(oracle.throws.class, thrown.class, `${c.expr}: the exception class`);
      Assert.assertSame(oracle.throws.message, thrown.message, `${c.expr}: the exception message`);
    } else {
      Assert.assertTrue("value" in actual, `${c.expr}: returns a value, as the Oracle does`);
      Assert.assertSame(decode(oracle.value), (actual as { value: unknown }).value, c.expr);
    }
  });
}

xaravelTest(
  "XT-config-3",
  "Dotenv::parse gives the values and error messages phpdotenv v5.7.0 gives at the Pin for the same contents (FR-20.1): unquoted, single- and double-quoted values and their escape sequences, ${VAR} interpolation (nested, undefined, escaped and single-quoted), multiline quoted values, export prefixes, inline and full-line comments, empty values, whitespace and CR / LF / CRLF lines, quoted, numeric and Unicode names, a BOM, and invalid lines, each throwing InvalidFileException with Upstream's message (long lines cut at 80 bytes on a character boundary, control characters escaped), except an unclosed double-quoted value (A=\"x), which Lines::process holds as an unfinished multiline value and drops, so parse returns an empty array as the Oracle does; and each Validator assertion (required, notEmpty, isInteger, isBoolean, allowedValues, allowedRegexValues) passes or throws ValidationException with Upstream's message as the Oracle does, an invalid allowedRegexValues pattern included when Dotenv runs in a unit frame; Upstream's private constructors throw PHP's Error when called from outside; its exceptions are registered under phpdotenv's FQCNs and implement Dotenv\\Exception\\ExceptionInterface; PhpOption's Option::lift returns None for a None argument and the callback's result otherwise, and None iterates as PHP's EmptyIterator",
  () => {
    compareWithOracle("XT-config-3");

    let thrown: unknown = null;
    try {
      Dotenv.parse("1 2=3");
    } catch (error) {
      thrown = error;
    }
    Assert.assertInstanceOf(InvalidFileException, thrown, "an invalid line throws InvalidFileException");
    Assert.assertInstanceOf(InvalidArgumentException, thrown, "which is an InvalidArgumentException");
    Assert.assertTrue(thrown instanceof ExceptionInterface, "and a Dotenv\\Exception\\ExceptionInterface");
    Assert.assertSame("Dotenv\\Exception\\InvalidFileException", fqcn(thrown as object), "registered under phpdotenv's FQCN");
    Assert.assertSame("Dotenv\\Dotenv", fqcn(Dotenv), "Dotenv is registered under its FQCN");

    // Upstream's private constructors stay private: a call from outside throws PHP's Error with PHP's message.
    for (const [klass, name] of [[Value, "Dotenv\\Parser\\Value"], [RepositoryBuilder, "Dotenv\\Repository\\RepositoryBuilder"], [None, "PhpOption\\None"]] as const) {
      let error: unknown = null;
      try {
        new (klass as unknown as new () => unknown)();
      } catch (caught) {
        error = caught;
      }
      Assert.assertInstanceOf(PhpError, error, `new ${name}() throws PHP's Error`);
      Assert.assertSame(`Call to private ${name}::__construct() from global scope`, (error as Error).message, `new ${name}()'s message`);
    }

    // PhpOption, which phpdotenv's Repository and Validator read through: Option::lift folds its arguments with
    // array_reduce, and None iterates as PHP's EmptyIterator (ESC-15.2-6).
    const add = Option.lift((a: number, b: number): number => a + b);
    const sum = add(new Some(1), new Some(2));
    Assert.assertInstanceOf(Some, sum, "a lifted function over two Somes returns Some");
    Assert.assertSame(3, sum.get(), "holding the callback's result");
    Assert.assertSame(None.create(), add(new Some(1), None.create()), "a None argument makes it return None");
    Assert.assertSame(None.create(), Option.lift((): null => null)(), "a null result is None by default");
    Assert.assertSame(false, Option.lift((): boolean => false, false)().isDefined(), "or the given none value");
    const returned = new Some("x");
    Assert.assertSame(returned, Option.lift((): Some<string> => returned)(), "an Option the callback returns is used as is");
    const iterator = None.create().getIterator();
    Assert.assertInstanceOf(EmptyIterator, iterator, "None::getIterator() returns PHP's EmptyIterator");
    Assert.assertFalse(iterator.valid(), "which is not valid");
    Assert.assertSame([], [...None.create()], "foreach over None yields no value");
    Assert.assertSame([], [...None.create().entries()], "and no pair");
    Assert.assertSame([1], [...new Some(1)], "foreach over Some yields its value");
    let accessed: unknown = null;
    try {
      iterator.current();
    } catch (error) {
      accessed = error;
    }
    Assert.assertInstanceOf(BadMethodCallException, accessed, "EmptyIterator::current() throws BadMethodCallException");
  },
);

xaravelTest(
  "XT-config-4",
  "a variable already in $_SERVER and $_ENV keeps its real value when content is loaded through phpdotenv's immutable default repository and takes the file's value through the mutable one, as the Oracle's phpdotenv v5.7.0 does (FR-20.2): an immutable repository may overwrite only what it loaded itself, does not clear a real variable while a mutable one does, a name only putenv set is real only to a repository with the putenv adapter, an allow list writes only its names, interpolation reads the repository, and an empty name throws InvalidArgumentException; a .env file read from disk through Dotenv::createImmutable and createMutable follows the same precedence, safeLoad on a missing file returns [] and load throws InvalidPathException with the joined path",
  () => {
    cleanPrecedence();
    try {
      compareWithOracle("XT-config-4");
    } finally {
      cleanPrecedence();
    }

    // A .env file read from disk through Dotenv::createImmutable / createMutable (Paths::filePaths joins the path
    // and name with DIRECTORY_SEPARATOR, ESC-15.2-6): the real variable wins immutably, the file's value mutably.
    const names = ["XT_CONFIG_4_FILE_A", "XT_CONFIG_4_FILE_B"];
    const clean = (): void => {
      for (const name of names) {
        superglobals.server.delete(name);
        superglobals.env.delete(name);
        putenv(name);
      }
    };
    const dir = mkdtempSync(join(tmpdir(), "xt-config-4-"));
    try {
      clean();
      writeFileSync(join(dir, ".env"), "XT_CONFIG_4_FILE_A=file\nXT_CONFIG_4_FILE_B=\"${XT_CONFIG_4_FILE_A}-b\"\n");
      superglobals.server.set("XT_CONFIG_4_FILE_A", "real");
      superglobals.env.set("XT_CONFIG_4_FILE_A", "real");
      Assert.assertSame({ XT_CONFIG_4_FILE_B: "real-b" }, Dotenv.createImmutable(dir + DIRECTORY_SEPARATOR).load(), "an immutable load from disk returns only what it wrote, interpolated from the real environment");
      Assert.assertSame("real", superglobals.server.get("XT_CONFIG_4_FILE_A"), "and keeps the real $_SERVER value");
      Assert.assertSame("real-b", superglobals.env.get("XT_CONFIG_4_FILE_B"), "and writes a new name to $_ENV");
      Assert.assertSame({ XT_CONFIG_4_FILE_A: "file", XT_CONFIG_4_FILE_B: "file-b" }, Dotenv.createMutable(dir).load(), "a mutable load from disk returns both entries");
      Assert.assertSame("file", superglobals.server.get("XT_CONFIG_4_FILE_A"), "a mutable load from disk overwrites it");
      Assert.assertSame("file-b", superglobals.env.get("XT_CONFIG_4_FILE_B"), "and interpolates the value it wrote");

      const missing = join(dir, "missing");
      Assert.assertSame([], Dotenv.createImmutable(missing).safeLoad(), "safeLoad on a missing file returns []");
      let thrown: unknown = null;
      try {
        Dotenv.createImmutable(missing).load();
      } catch (error) {
        thrown = error;
      }
      Assert.assertInstanceOf(InvalidPathException, thrown, "load on a missing file throws InvalidPathException");
      Assert.assertSame(`Unable to read any of the environment file(s) at [${missing}${DIRECTORY_SEPARATOR}.env].`, (thrown as Error).message, "with Upstream's message and the joined path");
      thrown = null;
      try {
        Dotenv.createImmutable(missing + DIRECTORY_SEPARATOR).load();
      } catch (error) {
        thrown = error;
      }
      Assert.assertSame(`Unable to read any of the environment file(s) at [${missing}${DIRECTORY_SEPARATOR}.env].`, (thrown as Error).message, "a trailing separator on the path is trimmed before the join");
      Assert.assertSame({ XT_CONFIG_4_FILE_A: "file", XT_CONFIG_4_FILE_B: "file-b" }, Dotenv.createArrayBacked([missing, dir]).load(), "over several paths, the first readable file in order is loaded");
    } finally {
      clean();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
