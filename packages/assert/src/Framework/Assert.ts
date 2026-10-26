// PHPUnit 13.4.3's core assertions (Story 4.3; FR-116, AD-15), and Laravel's
// `Illuminate\Testing\Assert::assertArraySubset`.
//
// Each assertion takes PHPUnit's parameters in PHPUnit's order, with the
// optional trailing `message`, and checks typed parameters as PHP does in a
// test file without `declare(strict_types=1)`: a scalar converts, anything
// else is a TypeError. It records its own kind once, first thing, before any
// argument check, as the Inventory's recorder does (tools/baseline/recorder.php:
// at the entry of an outermost `Assert::assert*` call); an assertion that calls
// another (`assertNotSame` on two booleans) records only its own kind. Then it
// evaluates and throws ExpectationFailedException with PHPUnit's message when it
// fails.
//
// The methods are static, as PHPUnit's are (`Assert.assertSame(…)` for a
// `self::` or `static::` call), and mirrored onto the prototype so a test case
// instance calls `this.assertSame(…)`.
//
// Story 4.4 adds `assertThat` (public, recording `assertThat`), the file,
// directory and JSON assertions, `fail` (which counts as one assertion and
// records `fail`), `markTestSkipped` (which records nothing), and the
// constraint factories Upstream calls (`logicalAnd`, `greaterThanOrEqual`,
// `lessThanOrEqual`, `isInstanceOf`). A nested assertion made by Assert
// itself (`assertStringEqualsFile`'s `assertFileExists`,
// `assertJsonStringEqualsJsonString`'s `assertJson`) records nothing, as the
// Inventory's recorder skips it.
//
// Story 4.7 adds the `stringContains` factory, and `assertArraySubset`, which
// is Laravel's and calls PHPUnit's `assertThat`, records `assertThat`.
//
// Story 9.11 (ESC-5.3-3): every `assert*` method, `assertThat` and `fail`, static
// and mirrored, is wrapped once at load. When it would throw an
// AssertionFailedError (not a skip) after its test's counts have ended (a timer
// or an un-awaited promise the body left behind), it makes sure the failure was
// reported to `Symbol.for('xaravel.harness.late')` and returns null, so it never
// throws into whichever test runs then. Argument TypeErrors still throw.
import { readFileSync } from "node:fs";
import { isPhpArray } from "../comparison/PhpComparison";
import { argumentError, floatParam, intParam, isArrayAccess, isCountable, isIterable, isPhpObject, stringParam } from "../comparison/PhpValues";
import { countsEnded, lateReports, recordAssertion, reportLateFailure } from "../declarations/AssertionCounter";
import { AssertionFailedError } from "./AssertionFailedError";
import { Constraint, LogicalAnd, LogicalNot, LogicalOr } from "./Constraint";
import { DirectoryExists, isDir } from "./Constraint/Filesystem/DirectoryExists";
import { FileExists } from "./Constraint/Filesystem/FileExists";
import { JsonMatches } from "./Constraint/JsonMatches";
import { IsJson } from "./Constraint/String/IsJson";
import {
  ArrayHasKey,
  ArraySubset,
  classOrInterface,
  Count,
  GreaterThan,
  IsEmpty,
  IsEqual,
  IsFalse,
  IsIdentical,
  IsInstanceOf,
  IsList,
  IsNan,
  isNativeType,
  IsNull,
  IsTrue,
  IsType,
  LessThan,
  ObjectHasProperty,
  RegularExpression,
  resolveClassString,
  sameSize,
  StringContains,
  StringEndsWith,
  StringEqualsStringIgnoringLineEndings,
  StringStartsWith,
  TraversableContainsIdentical,
  TraversableContainsOnly,
} from "./Constraints";
import { InvalidArgumentException } from "./Exception/InvalidArgumentException";
import { isSkippedTest, SkippedWithMessageException } from "./Exception/SkippedWithMessageException";

/**
 * A class, or an interface token: a contract token (`isContractToken`: a frozen, non-function object with an own,
 * non-writable string `Symbol.for('xaravel.class.fqcn')`) whose `Symbol.hasInstance` reads its brand; see ESC-4.3-1
 * item 1.
 */
export type ClassOrInterface = (abstract new (...args: never[]) => unknown) | { readonly [Symbol.hasInstance]: (value: unknown) => boolean };

function message(method: string, position: number, value: unknown): string {
  return stringParam(method, position, "message", value);
}

function iterable(method: string, position: number, name: string, value: unknown): void {
  if (!isIterable(value)) {
    throw argumentError(method, position, name, "Traversable|array", value);
  }
}

function countableOrIterable(method: string, position: number, name: string, value: unknown): void {
  if (!isCountable(value) && !isIterable(value)) {
    throw argumentError(method, position, name, "Countable|Traversable|array", value);
  }
}

/** Evaluates `constraint` (PHPUnit's `assertThat`); the calling assertion has already recorded its kind. */
function assertThat(value: unknown, constraint: Constraint, description: string): void {
  constraint.evaluate(value, description);
}

/** The PHPUnit TypeError for a `RegExp` parameter given anything else (DIV-10: patterns are `RegExp`s). */
function regExp(method: string, value: unknown): RegExp {
  if (!(value instanceof RegExp)) {
    throw new TypeError(`PHPUnit\\Framework\\Assert::${method}(): Argument #1 ($pattern) must be a RegExp (DIV-10), got ${typeof value}`);
  }
  return value;
}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- the instance signatures (spec: interface merging); the prototype holds every method
export class Assert {
  // Equality and identity

  static assertSame(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertSame");
    const description = message("assertSame", 3, message_);
    assertThat(actual, new IsIdentical(expected), description);
  }

  static assertNotSame(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertNotSame");
    const description = message("assertNotSame", 3, message_);
    // As Assert.php:1842 does: two booleans are first asserted not equal. That nested call is not counted (the
    // recorder counts only outermost calls), so it evaluates without recording.
    if (typeof expected === "boolean" && typeof actual === "boolean") {
      assertThat(actual, new LogicalNot(new IsEqual(expected)), description);
    }
    assertThat(actual, new LogicalNot(new IsIdentical(expected)), description);
  }

  static assertEquals(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertEquals");
    const description = message("assertEquals", 3, message_);
    assertThat(actual, new IsEqual(expected), description);
  }

  static assertNotEquals(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertNotEquals");
    const description = message("assertNotEquals", 3, message_);
    assertThat(actual, new LogicalNot(new IsEqual(expected)), description);
  }

  static assertEqualsCanonicalizing(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertEqualsCanonicalizing");
    const description = message("assertEqualsCanonicalizing", 3, message_);
    assertThat(actual, new IsEqual(expected, null, true), description);
  }

  static assertEqualsIgnoringCase(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertEqualsIgnoringCase");
    const description = message("assertEqualsIgnoringCase", 3, message_);
    assertThat(actual, new IsEqual(expected, null, false, true), description);
  }

  static assertEqualsWithDelta(expected: unknown, actual: unknown, delta: number, message_: string = ""): void {
    recordAssertion("assertEqualsWithDelta");
    const checked = floatParam("assertEqualsWithDelta", 3, "delta", delta);
    const description = message("assertEqualsWithDelta", 4, message_);
    assertThat(actual, new IsEqual(expected, checked), description);
  }

  // Booleans and null

  static assertTrue(condition: unknown, message_: string = ""): void {
    recordAssertion("assertTrue");
    assertThat(condition, new IsTrue(), message("assertTrue", 2, message_));
  }

  static assertFalse(condition: unknown, message_: string = ""): void {
    recordAssertion("assertFalse");
    assertThat(condition, new IsFalse(), message("assertFalse", 2, message_));
  }

  static assertNotTrue(condition: unknown, message_: string = ""): void {
    recordAssertion("assertNotTrue");
    assertThat(condition, new LogicalNot(new IsTrue()), message("assertNotTrue", 2, message_));
  }

  static assertNotFalse(condition: unknown, message_: string = ""): void {
    recordAssertion("assertNotFalse");
    assertThat(condition, new LogicalNot(new IsFalse()), message("assertNotFalse", 2, message_));
  }

  static assertNull(actual: unknown, message_: string = ""): void {
    recordAssertion("assertNull");
    assertThat(actual, new IsNull(), message("assertNull", 2, message_));
  }

  static assertNotNull(actual: unknown, message_: string = ""): void {
    recordAssertion("assertNotNull");
    assertThat(actual, new LogicalNot(new IsNull()), message("assertNotNull", 2, message_));
  }

  // Types and instanceOf

  /** `expected` is a class, a contract token, or a class-string the runtime's lookup resolves (ESC-13.1-9). */
  static assertInstanceOf(expected: ClassOrInterface | string, actual: unknown, message_: string = ""): void {
    recordAssertion("assertInstanceOf");
    const description = message("assertInstanceOf", 3, message_);
    const type = typeof expected === "string" ? resolveClassString(expected) : expected;
    classOrInterface(type);
    assertThat(actual, new IsInstanceOf(type), description);
  }

  /** `expected` is a class, a contract token, or a class-string the runtime's lookup resolves (ESC-13.1-9). */
  static assertNotInstanceOf(expected: ClassOrInterface | string, actual: unknown, message_: string = ""): void {
    recordAssertion("assertNotInstanceOf");
    const description = message("assertNotInstanceOf", 3, message_);
    const type = typeof expected === "string" ? resolveClassString(expected) : expected;
    classOrInterface(type);
    assertThat(actual, new LogicalNot(new IsInstanceOf(type)), description);
  }

  static assertIsArray(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsArray");
    assertThat(actual, new IsType("array"), message("assertIsArray", 2, message_));
  }

  static assertIsNotArray(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsNotArray");
    assertThat(actual, new LogicalNot(new IsType("array")), message("assertIsNotArray", 2, message_));
  }

  static assertIsBool(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsBool");
    assertThat(actual, new IsType("bool"), message("assertIsBool", 2, message_));
  }

  static assertIsCallable(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsCallable");
    assertThat(actual, new IsType("callable"), message("assertIsCallable", 2, message_));
  }

  static assertIsFloat(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsFloat");
    assertThat(actual, new IsType("float"), message("assertIsFloat", 2, message_));
  }

  static assertIsInt(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsInt");
    assertThat(actual, new IsType("int"), message("assertIsInt", 2, message_));
  }

  static assertIsNumeric(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsNumeric");
    assertThat(actual, new IsType("numeric"), message("assertIsNumeric", 2, message_));
  }

  static assertIsObject(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsObject");
    assertThat(actual, new IsType("object"), message("assertIsObject", 2, message_));
  }

  static assertIsResource(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsResource");
    assertThat(actual, new IsType("resource"), message("assertIsResource", 2, message_));
  }

  static assertIsString(actual: unknown, message_: string = ""): void {
    recordAssertion("assertIsString");
    assertThat(actual, new IsType("string"), message("assertIsString", 2, message_));
  }

  static assertIsList(array: unknown, message_: string = ""): void {
    recordAssertion("assertIsList");
    assertThat(array, new IsList(), message("assertIsList", 2, message_));
  }

  // Counts and emptiness

  static assertCount(expectedCount: number, haystack: unknown, message_: string = ""): void {
    recordAssertion("assertCount");
    const count = intParam("assertCount", 1, "expectedCount", expectedCount);
    countableOrIterable("assertCount", 2, "haystack", haystack);
    const description = message("assertCount", 3, message_);
    assertThat(haystack, new Count(count), description);
  }

  static assertSameSize(expected: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertSameSize");
    countableOrIterable("assertSameSize", 1, "expected", expected);
    countableOrIterable("assertSameSize", 2, "actual", actual);
    const description = message("assertSameSize", 3, message_);
    assertThat(actual, sameSize(expected), description);
  }

  static assertEmpty(actual: unknown, message_: string = ""): void {
    recordAssertion("assertEmpty");
    assertThat(actual, new IsEmpty(), message("assertEmpty", 2, message_));
  }

  static assertNotEmpty(actual: unknown, message_: string = ""): void {
    recordAssertion("assertNotEmpty");
    assertThat(actual, new LogicalNot(new IsEmpty()), message("assertNotEmpty", 2, message_));
  }

  // Containment

  static assertContains(needle: unknown, haystack: unknown, message_: string = ""): void {
    recordAssertion("assertContains");
    iterable("assertContains", 2, "haystack", haystack);
    const description = message("assertContains", 3, message_);
    assertThat(haystack, new TraversableContainsIdentical(needle), description);
  }

  static assertNotContains(needle: unknown, haystack: unknown, message_: string = ""): void {
    recordAssertion("assertNotContains");
    iterable("assertNotContains", 2, "haystack", haystack);
    const description = message("assertNotContains", 3, message_);
    assertThat(haystack, new LogicalNot(new TraversableContainsIdentical(needle)), description);
  }

  /**
   * PHPUnit 11.5's `assertContainsOnly`, removed in PHPUnit 12 (ESC-4.3-1 item 7): `type` is a native type name
   * (`'bool'`, `'int'`, …, and 11.5's aliases `'integer'`, `'boolean'`, `'double'` and `'real'`, read as `int`,
   * `bool`, `float` and `float`), or a class or interface token; Upstream calls it only below PHPUnit 11.5.
   */
  static assertContainsOnly(type: string | ClassOrInterface, haystack: unknown, isNativeType: boolean | null = null, message_: string = ""): void {
    recordAssertion("assertContainsOnly");
    iterable("assertContainsOnly", 2, "haystack", haystack);
    const description = message("assertContainsOnly", 4, message_);
    const named = typeof type === "string" && Object.hasOwn(NATIVE_ALIASES, type) ? NATIVE_ALIASES[type]! : type;
    const native = isNativeType ?? isNative(named);
    const constraint = native && isNative(named) ? TraversableContainsOnly.forNativeType(named) : TraversableContainsOnly.forClassOrInterface(named);
    assertThat(haystack, constraint, description);
  }

  static assertContainsOnlyBool(haystack: unknown, message_: string = ""): void {
    recordAssertion("assertContainsOnlyBool");
    iterable("assertContainsOnlyBool", 1, "haystack", haystack);
    const description = message("assertContainsOnlyBool", 2, message_);
    assertThat(haystack, TraversableContainsOnly.forNativeType("bool"), description);
  }

  static assertContainsOnlyInstancesOf(className: ClassOrInterface, haystack: unknown, message_: string = ""): void {
    recordAssertion("assertContainsOnlyInstancesOf");
    iterable("assertContainsOnlyInstancesOf", 2, "haystack", haystack);
    const description = message("assertContainsOnlyInstancesOf", 3, message_);
    assertThat(haystack, TraversableContainsOnly.forClassOrInterface(className), description);
  }

  // Array keys and subsets

  static assertArrayHasKey(key: unknown, array: unknown, message_: string = ""): void {
    recordAssertion("assertArrayHasKey");
    arrayOrArrayAccess("assertArrayHasKey", array);
    const description = message("assertArrayHasKey", 3, message_);
    assertThat(array, new ArrayHasKey(key), description);
  }

  static assertArrayNotHasKey(key: unknown, array: unknown, message_: string = ""): void {
    recordAssertion("assertArrayNotHasKey");
    arrayOrArrayAccess("assertArrayNotHasKey", array);
    const description = message("assertArrayNotHasKey", 3, message_);
    assertThat(array, new LogicalNot(new ArrayHasKey(key)), description);
  }

  /** Laravel's `Illuminate\Testing\Assert::assertArraySubset`. */
  static assertArraySubset(subset: unknown, array: unknown, checkForIdentity: boolean = false, msg: string = ""): void {
    // Laravel's method is not PHPUnit's: the Inventory's recorder sees only the `Assert::assertThat` it calls
    // (`decisions/ESC-4.3-1.md` item 8). Recorded first, as every assertion here is, so that
    // tools/assert-coverage's no-argument probe still counts it.
    recordAssertion("assertThat");
    const strict = Boolean(checkForIdentity);
    const description = message("assertArraySubset", 4, msg);
    if (!isArrayLike(subset)) {
      throw InvalidArgumentException.create(1, "array or ArrayAccess");
    }
    if (!isArrayLike(array)) {
      throw InvalidArgumentException.create(2, "array or ArrayAccess");
    }
    if (!isIterable(subset)) {
      throw argumentError("assertArraySubset", 1, "subset", "iterable", subset);
    }
    assertThat(array, new ArraySubset(subset, strict), description);
  }

  static assertObjectHasProperty(propertyName: string, object: unknown, message_: string = ""): void {
    recordAssertion("assertObjectHasProperty");
    const name = stringParam("assertObjectHasProperty", 1, "propertyName", propertyName);
    if (!isPhpObject(object)) {
      throw argumentError("assertObjectHasProperty", 2, "object", "object", object);
    }
    const description = message("assertObjectHasProperty", 3, message_);
    assertThat(object, new ObjectHasProperty(name), description);
  }

  // Strings

  static assertStringStartsWith(prefix: string, string: string, message_: string = ""): void {
    recordAssertion("assertStringStartsWith");
    const p = stringParam("assertStringStartsWith", 1, "prefix", prefix);
    const s = stringParam("assertStringStartsWith", 2, "string", string);
    const description = message("assertStringStartsWith", 3, message_);
    assertThat(s, new StringStartsWith(p), description);
  }

  static assertStringEndsWith(suffix: string, string: string, message_: string = ""): void {
    recordAssertion("assertStringEndsWith");
    const p = stringParam("assertStringEndsWith", 1, "suffix", suffix);
    const s = stringParam("assertStringEndsWith", 2, "string", string);
    const description = message("assertStringEndsWith", 3, message_);
    assertThat(s, new StringEndsWith(p), description);
  }

  static assertStringContainsString(needle: string, haystack: string, message_: string = ""): void {
    recordAssertion("assertStringContainsString");
    const n = stringParam("assertStringContainsString", 1, "needle", needle);
    const h = stringParam("assertStringContainsString", 2, "haystack", haystack);
    const description = message("assertStringContainsString", 3, message_);
    assertThat(h, new StringContains(n), description);
  }

  static assertStringNotContainsString(needle: string, haystack: string, message_: string = ""): void {
    recordAssertion("assertStringNotContainsString");
    const n = stringParam("assertStringNotContainsString", 1, "needle", needle);
    const h = stringParam("assertStringNotContainsString", 2, "haystack", haystack);
    const description = message("assertStringNotContainsString", 3, message_);
    assertThat(h, new LogicalNot(new StringContains(n)), description);
  }

  /** DIV-10: `pattern` is a JS `RegExp`; a PCRE pattern string is a TypeError. */
  static assertMatchesRegularExpression(pattern: RegExp, string: string, message_: string = ""): void {
    recordAssertion("assertMatchesRegularExpression");
    const p = regExp("assertMatchesRegularExpression", pattern);
    const s = stringParam("assertMatchesRegularExpression", 2, "string", string);
    const description = message("assertMatchesRegularExpression", 3, message_);
    assertThat(s, new RegularExpression(p), description);
  }

  /** DIV-10: `pattern` is a JS `RegExp`; a PCRE pattern string is a TypeError. */
  static assertDoesNotMatchRegularExpression(pattern: RegExp, string: string, message_: string = ""): void {
    recordAssertion("assertDoesNotMatchRegularExpression");
    const p = regExp("assertDoesNotMatchRegularExpression", pattern);
    const s = stringParam("assertDoesNotMatchRegularExpression", 2, "string", string);
    const description = message("assertDoesNotMatchRegularExpression", 3, message_);
    assertThat(s, new LogicalNot(new RegularExpression(p)), description);
  }

  static assertStringEqualsStringIgnoringLineEndings(expected: string, actual: string, message_: string = ""): void {
    recordAssertion("assertStringEqualsStringIgnoringLineEndings");
    const e = stringParam("assertStringEqualsStringIgnoringLineEndings", 1, "expected", expected);
    const a = stringParam("assertStringEqualsStringIgnoringLineEndings", 2, "actual", actual);
    const description = message("assertStringEqualsStringIgnoringLineEndings", 3, message_);
    assertThat(a, new StringEqualsStringIgnoringLineEndings(e), description);
  }

  // Numeric

  static assertGreaterThan(minimum: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertGreaterThan");
    assertThat(actual, new GreaterThan(minimum), message("assertGreaterThan", 3, message_));
  }

  static assertGreaterThanOrEqual(minimum: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertGreaterThanOrEqual");
    const constraint = new LogicalOr(new IsEqual(minimum), new GreaterThan(minimum));
    assertThat(actual, constraint, message("assertGreaterThanOrEqual", 3, message_));
  }

  static assertLessThan(maximum: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertLessThan");
    assertThat(actual, new LessThan(maximum), message("assertLessThan", 3, message_));
  }

  static assertLessThanOrEqual(maximum: unknown, actual: unknown, message_: string = ""): void {
    recordAssertion("assertLessThanOrEqual");
    const constraint = new LogicalOr(new IsEqual(maximum), new LessThan(maximum));
    assertThat(actual, constraint, message("assertLessThanOrEqual", 3, message_));
  }

  static assertNan(actual: unknown, message_: string = ""): void {
    recordAssertion("assertNan");
    assertThat(actual, new IsNan(), message("assertNan", 2, message_));
  }

  // Story 4.4: constraints

  /** Evaluates `constraint` for `value`; records `assertThat`. */
  static assertThat(value: unknown, constraint: Constraint, message_: string = ""): void {
    recordAssertion("assertThat");
    if (!(constraint instanceof Constraint)) {
      throw argumentError("assertThat", 2, "constraint", "PHPUnit\\Framework\\Constraint\\Constraint", constraint);
    }
    assertThat(value, constraint, message("assertThat", 3, message_));
  }

  /** `stringContains($string, $case = true)`: PHPUnit passes `$case` as StringContains' `ignoreCase` (Story 4.7). */
  static stringContains(string: string, case_: boolean = true): Constraint {
    return new StringContains(stringParam("stringContains", 1, "string", string), Boolean(case_));
  }

  /** `LogicalAnd::fromConstraints`: an operand that is not a Constraint is `IsEqual` to it. */
  static logicalAnd(...constraints: unknown[]): Constraint {
    return new LogicalAnd(...constraints.map(checkConstraint));
  }

  static greaterThanOrEqual(value: unknown): Constraint {
    return new LogicalOr(new IsEqual(value), new GreaterThan(value));
  }

  static lessThanOrEqual(value: unknown): Constraint {
    return new LogicalOr(new IsEqual(value), new LessThan(value));
  }

  static isInstanceOf(className: ClassOrInterface): Constraint {
    return new IsInstanceOf(className);
  }

  // Story 4.4: files and directories

  static assertDirectoryExists(directory: string, message_: string = ""): void {
    recordAssertion("assertDirectoryExists");
    const path = stringParam("assertDirectoryExists", 1, "directory", directory);
    assertThat(path, new DirectoryExists(), message("assertDirectoryExists", 2, message_));
  }

  static assertDirectoryDoesNotExist(directory: string, message_: string = ""): void {
    recordAssertion("assertDirectoryDoesNotExist");
    const path = stringParam("assertDirectoryDoesNotExist", 1, "directory", directory);
    assertThat(path, new LogicalNot(new DirectoryExists()), message("assertDirectoryDoesNotExist", 2, message_));
  }

  static assertFileExists(filename: string, message_: string = ""): void {
    recordAssertion("assertFileExists");
    const path = stringParam("assertFileExists", 1, "filename", filename);
    assertThat(path, new FileExists(), message("assertFileExists", 2, message_));
  }

  static assertFileDoesNotExist(filename: string, message_: string = ""): void {
    recordAssertion("assertFileDoesNotExist");
    const path = stringParam("assertFileDoesNotExist", 1, "filename", filename);
    assertThat(path, new LogicalNot(new FileExists()), message("assertFileDoesNotExist", 2, message_));
  }

  static assertStringEqualsFile(expectedFile: string, actualString: string, message_: string = ""): void {
    recordAssertion("assertStringEqualsFile");
    const path = stringParam("assertStringEqualsFile", 1, "expectedFile", expectedFile);
    const actual = stringParam("assertStringEqualsFile", 2, "actualString", actualString);
    const description = message("assertStringEqualsFile", 3, message_);
    assertThat(actual, new IsEqual(contentsOfFile(path, description)), description);
  }

  // Story 4.4: JSON

  static assertJson(actual: string, message_: string = ""): void {
    recordAssertion("assertJson");
    const json = stringParam("assertJson", 1, "actual", actual);
    assertThat(json, new IsJson(), message("assertJson", 2, message_));
  }

  static assertJsonStringEqualsJsonString(expectedJson: string, actualJson: string, message_: string = ""): void {
    recordAssertion("assertJsonStringEqualsJsonString");
    const expected = stringParam("assertJsonStringEqualsJsonString", 1, "expectedJson", expectedJson);
    const actual = stringParam("assertJsonStringEqualsJsonString", 2, "actualJson", actualJson);
    const description = message("assertJsonStringEqualsJsonString", 3, message_);
    // The two nested assertJson calls are made by Assert itself: not recorded.
    assertThat(expected, new IsJson(), description);
    assertThat(actual, new IsJson(), description);
    assertThat(actual, new JsonMatches(expected), description);
  }

  // Story 4.4: test outcomes

  /** Fails the test with `message`: counts one assertion (`fail`) and throws AssertionFailedError. */
  static fail(message_: string = ""): never {
    recordAssertion("fail");
    throw new AssertionFailedError(message("fail", 1, message_));
  }

  /** Marks the test as skipped: throws SkippedWithMessageException, which ends the test as skipped; counts nothing. */
  static markTestSkipped(message_: string = ""): never {
    throw new SkippedWithMessageException(message("markTestSkipped", 1, message_));
  }
}

/** `Operator::checkConstraint`. */
function checkConstraint(constraint: unknown): Constraint {
  return constraint instanceof Constraint ? constraint : new IsEqual(constraint);
}

/** `Assert::contentsOfFile`: the nested `assertFileExists` and `assertIsString` record nothing. */
function contentsOfFile(path: string, description: string): string {
  assertThat(path, new FileExists(), description);
  if (isDir(path)) {
    // PHP's file_get_contents() on a directory: a notice, and ''.
    return "";
  }
  let buffer: unknown;
  try {
    buffer = readFileSync(path, "utf8");
  } catch {
    buffer = false;
  }
  assertThat(buffer, new IsType("string"), "");
  return buffer as string;
}

/** PHPUnit 11.5's native type aliases, as PHPUnit 13's `NativeType` names them. */
const NATIVE_ALIASES: Readonly<Record<string, string>> = Object.freeze({ integer: "int", boolean: "bool", double: "float", real: "float" });

function isNative(type: unknown): type is Parameters<typeof TraversableContainsOnly.forNativeType>[0] {
  return isNativeType(type);
}

function isArrayLike(value: unknown): boolean {
  return (typeof value === "object" && value !== null && isPhpArray(value)) || isArrayAccess(value);
}

function arrayOrArrayAccess(method: string, value: unknown): void {
  if (!isArrayLike(value)) {
    throw argumentError(method, 2, "array", "ArrayAccess|array", value);
  }
}

/** The assertions, also callable on an instance (`this.assertSame(…)`) of Assert or a subclass. */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see the class
export interface Assert {
  assertSame(expected: unknown, actual: unknown, message?: string): void;
  assertNotSame(expected: unknown, actual: unknown, message?: string): void;
  assertEquals(expected: unknown, actual: unknown, message?: string): void;
  assertNotEquals(expected: unknown, actual: unknown, message?: string): void;
  assertEqualsCanonicalizing(expected: unknown, actual: unknown, message?: string): void;
  assertEqualsIgnoringCase(expected: unknown, actual: unknown, message?: string): void;
  assertEqualsWithDelta(expected: unknown, actual: unknown, delta: number, message?: string): void;
  assertTrue(condition: unknown, message?: string): void;
  assertFalse(condition: unknown, message?: string): void;
  assertNotTrue(condition: unknown, message?: string): void;
  assertNotFalse(condition: unknown, message?: string): void;
  assertNull(actual: unknown, message?: string): void;
  assertNotNull(actual: unknown, message?: string): void;
  assertInstanceOf(expected: ClassOrInterface | string, actual: unknown, message?: string): void;
  assertNotInstanceOf(expected: ClassOrInterface | string, actual: unknown, message?: string): void;
  assertIsArray(actual: unknown, message?: string): void;
  assertIsNotArray(actual: unknown, message?: string): void;
  assertIsBool(actual: unknown, message?: string): void;
  assertIsCallable(actual: unknown, message?: string): void;
  assertIsFloat(actual: unknown, message?: string): void;
  assertIsInt(actual: unknown, message?: string): void;
  assertIsNumeric(actual: unknown, message?: string): void;
  assertIsObject(actual: unknown, message?: string): void;
  assertIsResource(actual: unknown, message?: string): void;
  assertIsString(actual: unknown, message?: string): void;
  assertIsList(array: unknown, message?: string): void;
  assertCount(expectedCount: number, haystack: unknown, message?: string): void;
  assertSameSize(expected: unknown, actual: unknown, message?: string): void;
  assertEmpty(actual: unknown, message?: string): void;
  assertNotEmpty(actual: unknown, message?: string): void;
  assertContains(needle: unknown, haystack: unknown, message?: string): void;
  assertNotContains(needle: unknown, haystack: unknown, message?: string): void;
  assertContainsOnly(type: string | ClassOrInterface, haystack: unknown, isNativeType?: boolean | null, message?: string): void;
  assertContainsOnlyBool(haystack: unknown, message?: string): void;
  assertContainsOnlyInstancesOf(className: ClassOrInterface, haystack: unknown, message?: string): void;
  assertArrayHasKey(key: unknown, array: unknown, message?: string): void;
  assertArrayNotHasKey(key: unknown, array: unknown, message?: string): void;
  assertArraySubset(subset: unknown, array: unknown, checkForIdentity?: boolean, msg?: string): void;
  assertObjectHasProperty(propertyName: string, object: unknown, message?: string): void;
  assertStringStartsWith(prefix: string, string: string, message?: string): void;
  assertStringEndsWith(suffix: string, string: string, message?: string): void;
  assertStringContainsString(needle: string, haystack: string, message?: string): void;
  assertStringNotContainsString(needle: string, haystack: string, message?: string): void;
  assertMatchesRegularExpression(pattern: RegExp, string: string, message?: string): void;
  assertDoesNotMatchRegularExpression(pattern: RegExp, string: string, message?: string): void;
  assertStringEqualsStringIgnoringLineEndings(expected: string, actual: string, message?: string): void;
  assertGreaterThan(minimum: unknown, actual: unknown, message?: string): void;
  assertGreaterThanOrEqual(minimum: unknown, actual: unknown, message?: string): void;
  assertLessThan(maximum: unknown, actual: unknown, message?: string): void;
  assertLessThanOrEqual(maximum: unknown, actual: unknown, message?: string): void;
  assertNan(actual: unknown, message?: string): void;
  assertThat(value: unknown, constraint: Constraint, message?: string): void;
  assertDirectoryExists(directory: string, message?: string): void;
  assertDirectoryDoesNotExist(directory: string, message?: string): void;
  assertFileExists(filename: string, message?: string): void;
  assertFileDoesNotExist(filename: string, message?: string): void;
  assertStringEqualsFile(expectedFile: string, actualString: string, message?: string): void;
  assertJson(actual: string, message?: string): void;
  assertJsonStringEqualsJsonString(expectedJson: string, actualJson: string, message?: string): void;
  fail(message?: string): never;
  markTestSkipped(message?: string): never;
  logicalAnd(...constraints: unknown[]): Constraint;
  greaterThanOrEqual(value: unknown): Constraint;
  lessThanOrEqual(value: unknown): Constraint;
  isInstanceOf(className: ClassOrInterface): Constraint;
  stringContains(string: string, case_?: boolean): Constraint;
}

/**
 * The 51 assertion names of Story 4.3 (its enumerated list of `phpunit-assertions.jsonl` scan names), in the order
 * above. An explicit list, so later Stories' assertions on Assert do not change it.
 */
export const ASSERTIONS: readonly string[] = Object.freeze([
  "assertSame",
  "assertNotSame",
  "assertEquals",
  "assertNotEquals",
  "assertEqualsCanonicalizing",
  "assertEqualsIgnoringCase",
  "assertEqualsWithDelta",
  "assertTrue",
  "assertFalse",
  "assertNotTrue",
  "assertNotFalse",
  "assertNull",
  "assertNotNull",
  "assertInstanceOf",
  "assertNotInstanceOf",
  "assertIsArray",
  "assertIsNotArray",
  "assertIsBool",
  "assertIsCallable",
  "assertIsFloat",
  "assertIsInt",
  "assertIsNumeric",
  "assertIsObject",
  "assertIsResource",
  "assertIsString",
  "assertIsList",
  "assertCount",
  "assertSameSize",
  "assertEmpty",
  "assertNotEmpty",
  "assertContains",
  "assertNotContains",
  "assertContainsOnly",
  "assertContainsOnlyBool",
  "assertContainsOnlyInstancesOf",
  "assertArrayHasKey",
  "assertArrayNotHasKey",
  "assertArraySubset",
  "assertObjectHasProperty",
  "assertStringStartsWith",
  "assertStringEndsWith",
  "assertStringContainsString",
  "assertStringNotContainsString",
  "assertMatchesRegularExpression",
  "assertDoesNotMatchRegularExpression",
  "assertStringEqualsStringIgnoringLineEndings",
  "assertGreaterThan",
  "assertGreaterThanOrEqual",
  "assertLessThan",
  "assertLessThanOrEqual",
  "assertNan",
]);

/**
 * The 16 PHPUnit names of Story 4.4 (`phpunit-assertions.jsonl` names that Story 4.3 did not cover and PHPUnit
 * declares): 10 on Assert, then the 6 TestCase expectations.
 */
export const ASSERTIONS_4_4: readonly string[] = Object.freeze([
  "assertDirectoryExists",
  "assertDirectoryDoesNotExist",
  "assertFileExists",
  "assertFileDoesNotExist",
  "assertStringEqualsFile",
  "assertJson",
  "assertJsonStringEqualsJsonString",
  "assertThat",
  "fail",
  "markTestSkipped",
  "expectException",
  "expectExceptionMessage",
  "expectExceptionMessageMatches",
  "expectExceptionObject",
  "expectNotToPerformAssertions",
  "expectOutputString",
]);

/** The statics that are not assertions but are mirrored onto the prototype too (`$this->fail(…)`, `$this->logicalAnd(…)`). */
const MIRRORED = ["fail", "markTestSkipped", "logicalAnd", "greaterThanOrEqual", "lessThanOrEqual", "isInstanceOf", "stringContains"];

/** An assertion that, failing in ended counts, reports itself late and returns null (Story 9.11, see the header). */
function lateSafe(kind: string, assertion: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return {
    [kind](this: unknown, ...args: unknown[]): unknown {
      const reported = lateReports();
      try {
        return Reflect.apply(assertion, this, args);
      } catch (error) {
        if (error instanceof AssertionFailedError && !isSkippedTest(error) && countsEnded()) {
          if (lateReports() === reported) {
            reportLateFailure(kind);
          }
          return null;
        }
        throw error;
      }
    },
  }[kind]!;
}

for (const name of [...Object.getOwnPropertyNames(Assert).filter((key) => key.startsWith("assert")), "fail"]) {
  Object.defineProperty(Assert, name, {
    value: lateSafe(name, (Assert as unknown as Record<string, (...args: unknown[]) => unknown>)[name]!),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// Every static assertion, this Story's and later ones', is mirrored onto the prototype.
for (const name of [...Object.getOwnPropertyNames(Assert).filter((key) => key.startsWith("assert")), ...MIRRORED]) {
  Object.defineProperty(Assert.prototype, name, {
    value: (Assert as unknown as Record<string, unknown>)[name],
    writable: false,
    enumerable: false,
    configurable: false,
  });
}
