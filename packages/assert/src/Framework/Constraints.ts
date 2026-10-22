// PHPUnit 13.4.3's constraints behind the core assertions (Story 4.3), and
// Laravel's ArraySubset. Internal to the grader. Each keeps PHPUnit's
// `matches`, `toString`, `failureDescription` and their negated forms.
import { arrayEntries, isPhpArray, type Key, objectProps, phpLooseEquals, phpStrictEquals, stringKey } from "../comparison/PhpComparison";
import { phpCompare } from "../comparison/PhpOrder";
import {
  classNameOf,
  classNameOfClass,
  countOf,
  gettype,
  isArrayAccess,
  isCallable,
  isCountable,
  isFloat,
  isInt,
  isIterable,
  isNumeric,
  isPhpObject,
  isResource,
  isScalar,
  isTraversable,
  iterableValues,
  toNumber,
  unmarkFloat,
} from "../comparison/PhpValues";
import { Factory } from "../comparator/Factory";
import { exportValue, phpunitExport } from "../exporter/Exporter";
import { varExport } from "../exporter/VarExport";
import { ComparisonFailure } from "./ComparisonFailure";
import { Constraint, describeByTypeForContainers, valueToTypeStringFragment } from "./Constraint";
import { ExpectationFailedException } from "./ExpectationFailedException";
import { EmptyStringException } from "./Exception/EmptyStringException";
import { UnknownClassOrInterfaceException } from "./Exception/UnknownClassOrInterfaceException";

function isArray(value: unknown): value is object {
  return typeof value === "object" && value !== null && isPhpArray(value);
}

// ---------------------------------------------------------------------------
// Identity and equality

export class IsIdentical extends Constraint {
  constructor(private readonly value: unknown) {
    super();
  }

  override evaluate(other: unknown, description = "", returnResult = false): boolean | null {
    const success = phpStrictEquals(this.value, other);
    if (returnResult) {
      return success;
    }
    if (!success) {
      let failure: ComparisonFailure | null = null;
      if (typeof this.value === "string" && typeof other === "string") {
        failure = new ComparisonFailure(this.value, other, `'${this.value}'`, `'${other}'`);
      }
      if (isArray(this.value) && isArray(other)) {
        failure = new ComparisonFailure(this.value, other, phpunitExport(this.value), phpunitExport(other));
      }
      this.fail(other, description, failure);
    }
    return null;
  }

  toString(): string {
    return `is identical to ${this.valueAsString()}`;
  }

  override negatedToString(): string {
    return `is not identical to ${this.valueAsString()}`;
  }

  override failureDescription(other: unknown): string {
    if (isPhpObject(this.value) && isPhpObject(other)) {
      return "two variables reference the same object";
    }
    if (isResource(this.value) && isResource(other)) {
      return "two variables reference the same resource";
    }
    if (typeof this.value === "string" && typeof other === "string") {
      return "two strings are identical";
    }
    if (isArray(this.value) && isArray(other)) {
      return "two arrays are identical";
    }
    return super.failureDescription(other);
  }

  override negatedFailureDescription(other: unknown): string {
    if (isPhpObject(this.value) && isPhpObject(other)) {
      return "two variables do not reference the same object";
    }
    if (isResource(this.value) && isResource(other)) {
      return "two variables do not reference the same resource";
    }
    if (typeof this.value === "string" && typeof other === "string") {
      return "two strings are not identical";
    }
    if (isArray(this.value) && isArray(other)) {
      return "two arrays are not identical";
    }
    return `${phpunitExport(other)} ${this.negatedToString()}`;
  }

  private valueAsString(): string {
    if (isPhpObject(this.value)) {
      return `an object of class "${classNameOf(this.value)}"`;
    }
    return phpunitExport(this.value);
  }
}

/** IsEqual, IsEqualCanonicalizing, IsEqualIgnoringCase and IsEqualWithDelta: one constraint, the comparator's options. */
export class IsEqual extends Constraint {
  constructor(
    private readonly value: unknown,
    private readonly delta: number | null = null,
    private readonly canonicalize = false,
    private readonly ignoreCase = false,
  ) {
    super();
  }

  override evaluate(other: unknown, description = "", returnResult = false): boolean {
    if (phpStrictEquals(this.value, other)) {
      return true;
    }
    try {
      Factory.getInstance()
        .getComparatorFor(this.value, other)
        .assertEquals(this.value, other, this.delta ?? 0, this.canonicalize, this.ignoreCase);
    } catch (error) {
      if (!(error instanceof ComparisonFailure)) {
        throw error;
      }
      if (returnResult) {
        return false;
      }
      throw new ExpectationFailedException(`${description}\n${error.message}`.replace(/^[ \t\n\r\v\0]+|[ \t\n\r\v\0]+$/g, ""), error);
    }
    return true;
  }

  toString(): string {
    return `is equal to ${this.valueAsString()}`;
  }

  override negatedToString(): string {
    return `is not equal to ${this.valueAsString()}`;
  }

  private valueAsString(): string {
    if (this.delta !== null) {
      return `${phpunitExport(this.value)} with delta <${this.delta.toFixed(6)}>`;
    }
    if (typeof this.value === "string") {
      return this.value.includes("\n") ? "<text>" : `'${this.value}'`;
    }
    return phpunitExport(this.value);
  }
}

// ---------------------------------------------------------------------------
// Booleans, null, NAN

export class IsTrue extends Constraint {
  toString(): string {
    return "is true";
  }
  override negatedToString(): string {
    return "is not true";
  }
  protected override matches(other: unknown): boolean {
    return other === true;
  }
  override failureDescription(other: unknown): string {
    return describeByTypeForContainers(other, this.toString());
  }
}

export class IsFalse extends Constraint {
  toString(): string {
    return "is false";
  }
  override negatedToString(): string {
    return "is not false";
  }
  protected override matches(other: unknown): boolean {
    return other === false;
  }
  override failureDescription(other: unknown): string {
    return describeByTypeForContainers(other, this.toString());
  }
}

export class IsNull extends Constraint {
  toString(): string {
    return "is null";
  }
  override negatedToString(): string {
    return "is not null";
  }
  protected override matches(other: unknown): boolean {
    return other === null;
  }
  override failureDescription(other: unknown): string {
    return describeByTypeForContainers(other, this.toString());
  }
}

export class IsNan extends Constraint {
  toString(): string {
    return "is nan";
  }
  override negatedToString(): string {
    return "is not nan";
  }
  protected override matches(other: unknown): boolean {
    return isFloat(other) && Number.isNaN(toNumber(other));
  }
  override failureDescription(other: unknown): string {
    return describeByTypeForContainers(other, this.toString());
  }
}

// ---------------------------------------------------------------------------
// Types

/** PHPUnit's `NativeType` values. */
export const NATIVE_TYPES = ["array", "bool", "callable", "resource (closed)", "float", "int", "iterable", "null", "numeric", "object", "resource", "scalar", "string"] as const;
export type NativeType = (typeof NATIVE_TYPES)[number];

export function isNativeType(type: unknown): type is NativeType {
  return typeof type === "string" && (NATIVE_TYPES as readonly string[]).includes(type);
}

export class IsType extends Constraint {
  constructor(private readonly type: NativeType) {
    super();
  }

  toString(): string {
    return `is of type ${this.type}`;
  }

  override negatedToString(): string {
    return `is not of type ${this.type}`;
  }

  protected override matches(other: unknown): boolean {
    switch (this.type) {
      case "numeric":
        return isNumeric(other);
      case "int":
        return isInt(other);
      case "float":
        return isFloat(other);
      case "string":
        return typeof other === "string";
      case "bool":
        return typeof other === "boolean";
      case "null":
        return other === null;
      case "array":
        return isArray(other);
      case "object":
        return isPhpObject(other);
      case "resource":
        return isResource(other);
      case "resource (closed)":
        return false;
      case "scalar":
        return isScalar(other);
      case "callable":
        return isCallable(other);
      case "iterable":
        return isIterable(other);
      default:
        return false;
    }
  }
}

/** Checks a class or interface argument; a string names no class here (no global class table). */
export function classOrInterface(type: unknown): { kind: "class" | "interface"; name: string; test: (value: unknown) => boolean } {
  if (typeof type === "string") {
    throw new UnknownClassOrInterfaceException(type);
  }
  if (type === Object) {
    return { kind: "class", name: "stdClass", test: (value) => isPhpObject(value) && typeof value !== "function" && classNameOf(value) === "stdClass" };
  }
  if (typeof type === "function") {
    return { kind: "class", name: classNameOfClass(type), test: (value) => isPhpObject(value) && value instanceof (type as new () => unknown) };
  }
  if (typeof type === "object" && type !== null && typeof (type as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function") {
    const token = type as { [Symbol.hasInstance](value: unknown): boolean };
    return { kind: "interface", name: classNameOfClass(type), test: (value) => isPhpObject(value) && token[Symbol.hasInstance](value) };
  }
  throw new TypeError(`expected a class or an interface token, got ${gettype(type)}`);
}

export class IsInstanceOf extends Constraint {
  private readonly checked: ReturnType<typeof classOrInterface>;

  constructor(type: unknown) {
    super();
    this.checked = classOrInterface(type);
  }

  toString(): string {
    return `is an instance of ${this.checked.kind} ${this.checked.name}`;
  }

  override negatedToString(): string {
    return `is not an instance of ${this.checked.kind} ${this.checked.name}`;
  }

  protected override matches(other: unknown): boolean {
    return this.checked.test(other);
  }

  override failureDescription(other: unknown): string {
    return valueToTypeStringFragment(other) + this.toString();
  }

  override negatedFailureDescription(other: unknown): string {
    return valueToTypeStringFragment(other) + this.negatedToString();
  }
}

export class IsList extends Constraint {
  toString(): string {
    return "is a list";
  }
  override negatedToString(): string {
    return "is not a list";
  }
  protected override matches(other: unknown): boolean {
    return isArray(other) && arrayEntries(other).every(([key], index) => key === index);
  }
  override failureDescription(other: unknown): string {
    return valueToTypeStringFragment(other) + this.toString();
  }
  override negatedFailureDescription(other: unknown): string {
    return valueToTypeStringFragment(other) + this.negatedToString();
  }
}

// ---------------------------------------------------------------------------
// Cardinality

/** `Count::getCountOf`: a Countable or array's count, a Traversable's length, else null. */
function getCountOf(other: unknown): number | null {
  if (isCountable(other)) {
    return countOf(other);
  }
  if (isTraversable(other)) {
    return iterableValues(other).length;
  }
  return null;
}

export class Count extends Constraint {
  constructor(private readonly expectedCount: number) {
    super();
  }

  toString(): string {
    return `count matches ${this.expectedCount}`;
  }

  override negatedToString(): string {
    return `count does not match ${this.expectedCount}`;
  }

  protected override matches(other: unknown): boolean {
    return this.expectedCount === getCountOf(other);
  }

  override failureDescription(other: unknown): string {
    return `actual size ${getCountOf(other) ?? 0} matches expected size ${this.expectedCount}`;
  }

  override negatedFailureDescription(other: unknown): string {
    return `actual size ${getCountOf(other) ?? 0} does not match expected size ${this.expectedCount}`;
  }
}

export function sameSize(expected: unknown): Count {
  return new Count(getCountOf(expected) ?? 0);
}

export class IsEmpty extends Constraint {
  toString(): string {
    return "is empty";
  }
  override negatedToString(): string {
    return "is not empty";
  }
  protected override matches(other: unknown): boolean {
    if (isPhpObject(other) && isCountable(other)) {
      return countOf(other) === 0;
    }
    if (isArray(other)) {
      return arrayEntries(other).length === 0;
    }
    return other === null || other === false || other === 0 || other === 0n || other === "" || other === "0";
  }
  override failureDescription(other: unknown): string {
    return this.describe(other, this.toString());
  }
  override negatedFailureDescription(other: unknown): string {
    return this.describe(other, this.negatedToString());
  }
  private describe(other: unknown, text: string): string {
    const type = gettype(other);
    return `${type.startsWith("a") || type.startsWith("o") ? "an" : "a"} ${type} ${text}`;
  }
}

export class GreaterThan extends Constraint {
  constructor(private readonly value: unknown) {
    super();
  }
  toString(): string {
    return `is greater than ${phpunitExport(this.value)}`;
  }
  override negatedToString(): string {
    return `is not greater than ${phpunitExport(this.value)}`;
  }
  protected override matches(other: unknown): boolean {
    return phpCompare(this.value, other) < 0;
  }
}

export class LessThan extends Constraint {
  constructor(private readonly value: unknown) {
    super();
  }
  toString(): string {
    return `is less than ${phpunitExport(this.value)}`;
  }
  override negatedToString(): string {
    return `is not less than ${phpunitExport(this.value)}`;
  }
  protected override matches(other: unknown): boolean {
    return phpCompare(other, this.value) < 0;
  }
}

// ---------------------------------------------------------------------------
// Containment and keys

export class TraversableContainsIdentical extends Constraint {
  constructor(private readonly value: unknown) {
    super();
  }
  toString(): string {
    return `contains ${phpunitExport(this.value)}`;
  }
  override negatedToString(): string {
    return `does not contain ${phpunitExport(this.value)}`;
  }
  protected override matches(other: unknown): boolean {
    return isIterable(other) && iterableValues(other).some((element) => phpStrictEquals(this.value, element));
  }
  override failureDescription(other: unknown): string {
    return `${isArray(other) ? "an array" : "a traversable"} ${this.toString()}`;
  }
  override negatedFailureDescription(other: unknown): string {
    return `${isArray(other) ? "an array" : "a traversable"} ${this.negatedToString()}`;
  }
}

export class TraversableContainsOnly extends Constraint {
  private constructor(
    private readonly constraint: Constraint,
    private readonly type: string,
  ) {
    super();
  }

  static forNativeType(type: NativeType): TraversableContainsOnly {
    return new TraversableContainsOnly(new IsType(type), type);
  }

  static forClassOrInterface(type: unknown): TraversableContainsOnly {
    const constraint = new IsInstanceOf(type);
    return new TraversableContainsOnly(constraint, classOrInterface(type).name);
  }

  override evaluate(other: unknown, description = "", returnResult = false): boolean {
    const success = isIterable(other) && iterableValues(other).every((item) => this.constraint.evaluate(item, "", true) !== false);
    if (!success && !returnResult) {
      this.fail(other, description);
    }
    return success;
  }

  toString(): string {
    return `contains only values of type "${this.type}"`;
  }

  override negatedToString(): string {
    return `does not contain only values of type "${this.type}"`;
  }
}

/** A PHP array key (an int or a string, normalised), or null for any other value; a marked float reads as its number. */
function arrayKey(given: unknown): Key | null {
  const key = unmarkFloat(given);
  if (typeof key === "number" && isInt(key)) {
    // `+ 0` folds an unmarked or marked `-0` into the key `0`.
    return key + 0;
  }
  if (isInt(key)) {
    return typeof key === "bigint" && key >= BigInt(Number.MIN_SAFE_INTEGER) && key <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(key) : key;
  }
  return typeof key === "string" ? stringKey(key) : null;
}

export class ArrayHasKey extends Constraint {
  constructor(private readonly key: unknown) {
    super();
  }
  toString(): string {
    return `has the key ${phpunitExport(this.key)}`;
  }
  override negatedToString(): string {
    return `does not have the key ${phpunitExport(this.key)}`;
  }
  protected override matches(other: unknown): boolean {
    if (isArray(other)) {
      const key = arrayKey(this.key);
      return key !== null && arrayEntries(other).some(([name]) => name === key);
    }
    if (isArrayAccess(other)) {
      return Boolean((other as { offsetExists(key: unknown): unknown }).offsetExists(this.key));
    }
    return false;
  }
  override failureDescription(): string {
    return `an array ${this.toString()}`;
  }
  override negatedFailureDescription(): string {
    return `an array ${this.negatedToString()}`;
  }
}

export class ObjectHasProperty extends Constraint {
  constructor(private readonly propertyName: string) {
    super();
  }
  toString(): string {
    return `has property "${this.propertyName}"`;
  }
  override negatedToString(): string {
    return `does not have property "${this.propertyName}"`;
  }
  protected override matches(other: unknown): boolean {
    if (!isPhpObject(other) || typeof other === "function") {
      return false;
    }
    return objectPropertyNames(other).includes(this.propertyName);
  }
  override failureDescription(other: unknown): string {
    return `object of class "${classNameOf(other as object)}" ${this.toString()}`;
  }
  override negatedFailureDescription(other: unknown): string {
    return `object of class "${classNameOf(other as object)}" ${this.negatedToString()}`;
  }
}

function objectPropertyNames(value: object): string[] {
  return objectProps(value).map(([key]) => String(key));
}

// ---------------------------------------------------------------------------
// Strings

export class StringStartsWith extends Constraint {
  constructor(private readonly prefix: string) {
    super();
    if (prefix === "") {
      throw new EmptyStringException();
    }
  }
  toString(): string {
    return `starts with "${this.prefix}"`;
  }
  override negatedToString(): string {
    return `does not start with "${this.prefix}"`;
  }
  protected override matches(other: unknown): boolean {
    return typeof other === "string" && other.startsWith(this.prefix);
  }
}

export class StringEndsWith extends Constraint {
  constructor(private readonly suffix: string) {
    super();
    if (suffix === "") {
      throw new EmptyStringException();
    }
  }
  toString(): string {
    return `ends with "${this.suffix}"`;
  }
  override negatedToString(): string {
    return `does not end with "${this.suffix}"`;
  }
  protected override matches(other: unknown): boolean {
    return typeof other === "string" && other.endsWith(this.suffix);
  }
}

/** `mb_detect_encoding($value, null, true)` with the default detect order (ASCII, UTF-8). */
function detectedEncoding(value: unknown): string {
  if (typeof value !== "string") {
    return "Encoding detection failed";
  }
  // oxlint-disable-next-line no-control-regex
  return /^[\x00-\x7f]*$/.test(value) ? "ASCII" : "UTF-8";
}

/** `assertStringContainsString`'s constraint and `stringContains($string, $case)`'s (Story 4.7 adds `ignoreCase`). */
export class StringContains extends Constraint {
  constructor(
    private readonly needle: string,
    private readonly ignoreCase = false,
  ) {
    super();
  }
  toString(): string {
    return `contains ${this.needleAsString()}`;
  }
  override negatedToString(): string {
    return `does not contain ${this.needleAsString()}`;
  }
  override failureDescription(other: unknown): string {
    return `${this.haystackAsString(other)}contains ${this.needleAsString()}`;
  }
  override negatedFailureDescription(other: unknown): string {
    return `${this.haystackAsString(other)}does not contain ${this.needleAsString()}`;
  }
  protected override matches(other: unknown): boolean {
    if (this.needle === "") {
      return true;
    }
    if (typeof other !== "string") {
      return false;
    }
    if (this.ignoreCase) {
      // mb_stripos(): a multibyte-safe, case-insensitive search.
      return other.toLowerCase().includes(this.needle.toLowerCase());
    }
    return other.includes(this.needle);
  }
  private needleAsString(): string {
    const needle = this.ignoreCase ? this.needle.toLowerCase() : this.needle;
    return `"${needle}" [${this.detectedEncoding(needle)}](length: ${Buffer.byteLength(needle, "utf8")})`;
  }
  private haystackAsString(other: unknown): string {
    const length = typeof other === "string" ? Buffer.byteLength(other, "utf8") : 0;
    return `${phpunitExport(other)} [${this.detectedEncoding(other)}](length: ${length}) `;
  }
  private detectedEncoding(other: unknown): string {
    return this.ignoreCase ? "Encoding ignored" : detectedEncoding(other);
  }
}

export class RegularExpression extends Constraint {
  constructor(private readonly pattern: RegExp) {
    super();
  }
  toString(): string {
    return `matches PCRE pattern "${String(this.pattern)}"`;
  }
  override negatedToString(): string {
    return `does not match PCRE pattern "${String(this.pattern)}"`;
  }
  protected override matches(other: unknown): boolean {
    if (typeof other !== "string") {
      return false;
    }
    return new RegExp(this.pattern.source, this.pattern.flags.replace(/[gy]/g, "")).test(other);
  }
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r/g, "\n");
}

export class StringEqualsStringIgnoringLineEndings extends Constraint {
  private readonly string: string;

  constructor(value: string) {
    super();
    this.string = normalizeLineEndings(value);
  }
  toString(): string {
    return `is equal to "${this.string}" ignoring line endings`;
  }
  override negatedToString(): string {
    return `is not equal to "${this.string}" ignoring line endings`;
  }
  protected override matches(other: unknown): boolean {
    return typeof other === "string" && this.string === normalizeLineEndings(other);
  }
}

// ---------------------------------------------------------------------------
// Laravel's ArraySubset (Illuminate\Testing\Constraints\ArraySubset)

/** An ordered PHP array built by the grader: branded, iterating normalised `[key, value]` pairs. */
const PHP_ARRAY = Symbol.for("xaravel.php.array");

class OrderedArray implements Iterable<readonly [Key, unknown]> {
  readonly [PHP_ARRAY] = true;

  constructor(readonly entries: Map<Key, unknown>) {}

  *[Symbol.iterator](): Iterator<readonly [Key, unknown]> {
    yield* this.entries;
  }
}

/** `(array) $object`: its props as a PHP array. */
function propsArray(value: object): object {
  return new OrderedArray(new Map(objectProps(value)));
}

/** `ArraySubset::toArray`. */
function toArray(value: unknown): object {
  if (isArray(value)) {
    return value;
  }
  if (isTraversable(value)) {
    return iterableValues(value);
  }
  if (!isIterable(value)) {
    // `toArray(iterable $other)`: a non-Traversable ArrayAccess is PHP's engine TypeError.
    throw new TypeError(`Illuminate\\Testing\\Constraints\\ArraySubset::toArray(): Argument #1 ($other) must be of type Traversable|array, ${isPhpObject(value) ? classNameOf(value) : gettype(value)} given`);
  }
  return propsArray(value as object);
}

/** `array_replace_recursive($array, $replacement)`. */
function replaceRecursive(array: object, replacement: object): OrderedArray {
  const result = new Map<Key, unknown>(arrayEntries(array));
  for (const [key, value] of arrayEntries(replacement)) {
    const current = result.get(key);
    if (result.has(key) && isArray(current) && isArray(value)) {
      result.set(key, replaceRecursive(current, value));
    } else {
      result.set(key, value);
    }
  }
  return new OrderedArray(result);
}

export class ArraySubset extends Constraint {
  private subset: unknown;

  constructor(
    subset: unknown,
    private readonly strict = false,
  ) {
    super();
    this.subset = subset;
  }

  override evaluate(other: unknown, description = "", returnResult = false): boolean | null {
    const array = toArray(other);
    this.subset = toArray(this.subset);
    const patched = replaceRecursive(array, this.subset as object);
    const result = this.strict ? phpStrictEquals(array, patched) : phpLooseEquals(array, patched);
    if (returnResult) {
      return result;
    }
    if (!result) {
      this.fail(array, description, new ComparisonFailure(patched, array, varExport(patched), varExport(array)));
    }
    return null;
  }

  toString(): string {
    return `has the subset ${exportValue(this.subset)}`;
  }

  override failureDescription(): string {
    return `an array ${this.toString()}`;
  }
}
