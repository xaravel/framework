// The shared operand table of Story 4.3 (XT-assert-8..10): each PHP operand
// with its TS twin, the PHP/TS twin classes, and every assertion matrix as a
// PHP call and the same call in TS.
//
// The request file `conformance/oracle-requests/4.3.jsonl` was generated from
// this table (by a throwaway script outside the repository, through
// tools/oracle/request.ts's makeRequest and renderRequests), and
// assertions.test.ts rebuilds every request's `setup` and `exprs` from it, so
// the table and the signed fixtures cannot drift apart. No expected outcome is
// written here: every one comes from the Oracle.
import { Assert } from "../../src/index";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const PHP_PROPS = Symbol.for("xaravel.php.props");
const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_RESOURCE = Symbol.for("xaravel.php.resource");
const COUNTABLE = Symbol.for("Countable");
const ARRAY_ACCESS = Symbol.for("ArrayAccess");

/** `[PHP source, TS twin]`. */
export type Pair = readonly [php: string, ts: unknown];

// ---------------------------------------------------------------------------
// Twin classes (PHP declarations in SETUP_CLASSES)

export class XtA {
  static readonly [CLASS_FQCN]: string = "XtA";
  p: unknown;
  constructor(p: unknown = null) {
    this.p = p;
  }
  m(): void {}
}

export class XtB extends XtA {
  static override readonly [CLASS_FQCN]: string = "XtB";
}

export class XtC {
  static readonly [CLASS_FQCN] = "XtC";
  q = 1;
}

/** PHP's `XtS` has `__toString()`; the twin has `toString()` (spine § naming). */
export class XtS {
  static readonly [CLASS_FQCN] = "XtS";
  toString(): string {
    return "abc";
  }
}

export class XtCountable {
  static readonly [CLASS_FQCN] = "XtCountable";
  get [COUNTABLE](): true {
    return true;
  }
  count(): number {
    return 2;
  }
}

export class XtIterator {
  static readonly [CLASS_FQCN] = "XtIterator";
  *[Symbol.iterator](): Iterator<unknown> {
    yield true;
    yield false;
  }
}

/** PHP's `XtArrayAccess implements \ArrayAccess` (ESC-4.3-1 item 2: the `Symbol.for('ArrayAccess')` brand). */
export class XtArrayAccess {
  static readonly [CLASS_FQCN] = "XtArrayAccess";
  d: Record<string, unknown> = { a: 1, b: 2 };
  get [ARRAY_ACCESS](): true {
    return true;
  }
  offsetExists(offset: unknown): boolean {
    return (typeof offset === "string" || (typeof offset === "number" && Number.isInteger(offset))) && Object.hasOwn(this.d, String(offset));
  }
  offsetGet(offset: unknown): unknown {
    return this.d[String(offset)] ?? null;
  }
  offsetSet(offset: unknown, value: unknown): void {
    this.d[String(offset)] = value;
  }
  offsetUnset(offset: unknown): void {
    // oxlint-disable-next-line typescript/no-dynamic-delete -- the twin of PHP's unset($this->d[$offset])
    delete this.d[String(offset)];
  }
}

/**
 * PHP's `\Exception` twin: a JS `Error` whose class name reads `Exception`, with PHP's `code` and its `previous` as
 * the `cause` (the comparator and the exporter read them so; `file`, `line` and `trace` have no JS counterpart).
 */
export class XtException extends Error {
  static readonly [CLASS_FQCN] = "Exception";
  code: number;
  constructor(message: string, code = 0, previous: Error | null = null) {
    super(message, previous === null ? undefined : { cause: previous });
    // The common JS idiom: an own `name`, which PHP's exception has no counterpart for (never exported or compared).
    this.name = "Exception";
    this.code = code;
  }
}

/** An interface token (ESC-4.3-1 item 1): its FQCN, and `instanceof` through `Symbol.hasInstance`. */
function token(name: string, test: (value: object) => boolean): { readonly [Symbol.hasInstance]: (value: unknown) => boolean } {
  const fqcn: Record<symbol, string> = { [CLASS_FQCN]: name };
  return {
    ...fqcn,
    [Symbol.hasInstance]: (value: unknown) => ((typeof value === "object" && value !== null) || typeof value === "function") && test(value as object),
  };
}

export const XtI = token("XtI", (value) => value instanceof XtC);
export const CountableToken = token("Countable", (value) => COUNTABLE in value);
export const TraversableToken = token("Traversable", (value) => !Array.isArray(value) && Symbol.iterator in value);

/** A PHP `stdClass` object: an `Object`-class object whose props come from the props protocol. */
function stdClass(props: Record<string, unknown>): object {
  return { [PHP_PROPS]: () => props };
}

/** A PHP array that is neither a list nor all-string-keyed. */
function branded(entries: (readonly [number | string, unknown])[]): object {
  return {
    [PHP_ARRAY]: true,
    *[Symbol.iterator]() {
      yield* entries;
    },
  };
}

/** A PHP stream resource's twin (ESC-4.3-1 item 2). */
class XtResource {
  readonly [PHP_RESOURCE] = "stream";
}

const resource = new XtResource();
const closure = (): void => {};

/** Self-referencing objects: two equal cycles and an unequal one (through an array). */
const cycle = new XtA();
cycle.p = cycle;
const cycleEqual = new XtA();
cycleEqual.p = cycleEqual;
const cycleOther = new XtA();
cycleOther.p = [cycleOther];

export const SETUP_CYCLES = [
  "$xtCycle = new XtA(); $xtCycle->p = $xtCycle;",
  "$xtCycleEqual = new XtA(); $xtCycleEqual->p = $xtCycleEqual;",
  "$xtCycleOther = new XtA(); $xtCycleOther->p = [$xtCycleOther];",
];

export const SETUP_CLASSES = [
  "class XtA { public $p; public function __construct($p = null) { $this->p = $p; } public function m() {} }",
  "class XtB extends XtA {}",
  "interface XtI {}",
  "class XtC implements XtI { public $q = 1; }",
  "class XtS { public function __toString(): string { return 'abc'; } }",
  "class XtCountable implements \\Countable { public function count(): int { return 2; } }",
  "class XtIterator implements \\IteratorAggregate { public function getIterator(): \\Iterator { return new \\ArrayIterator([true, false]); } }",
  "class XtArrayAccess implements \\ArrayAccess { public $d = ['a' => 1, 'b' => 2]; public function offsetExists($o): bool { return (is_int($o) || is_string($o)) && array_key_exists($o, $this->d); } public function offsetGet($o): mixed { return $this->d[$o] ?? null; } public function offsetSet($o, $v): void { $this->d[$o] = $v; } public function offsetUnset($o): void { unset($this->d[$o]); } }",
];

/** One cell: null (passes), `[message, expectedAsString, actualAsString]` (fails) or `['throws', class, message]`. */
export const SETUP_HELPERS = [
  "function xt_cell(callable $f) { try { $f(); return null; } catch (\\PHPUnit\\Framework\\ExpectationFailedException $e) { $c = $e->getComparisonFailure(); return [$e->getMessage(), $c?->getExpectedAsString(), $c?->getActualAsString()]; } catch (\\Throwable $e) { return ['throws', (new \\ReflectionClass($e))->getShortName(), $e->getMessage()]; } }",
  // PHPUnit 11.5's assertContainsOnly($type, $haystack), removed in PHPUnit 12, through the PHPUnit 13 constraint it became (ESC-4.3-1 item 7).
  "function xt_contains_only(\\PHPUnit\\Framework\\TestCase $test, string $type, iterable $haystack) { $native = \\PHPUnit\\Framework\\NativeType::tryFrom(match ($type) { 'integer' => 'int', 'boolean' => 'bool', 'double', 'real' => 'float', default => $type }); $test->assertThat($haystack, $native !== null ? \\PHPUnit\\Framework\\Constraint\\TraversableContainsOnly::forNativeType($native) : \\PHPUnit\\Framework\\Constraint\\TraversableContainsOnly::forClassOrInterface($type)); }",
];

// ---------------------------------------------------------------------------
// Operands: $v for the binary matrices, $u (= $v + extras) for the unary ones.

/** Over 40 characters (and more bytes), all non-ASCII. */
const LONG_PREFIX = "ÄÖÜäöüßéèêÄÖÜäöüßéèêÄÖÜäöüßéèêÄÖÜäöüßéèê-";
/** Common suffixes over 40 characters: ASCII, and non-ASCII. */
const ASCII_SUFFIX = "-the quick brown fox jumps over the lazy dog-";
const LONG_SUFFIX = "-ÄÖÜäöüßéèêÄÖÜäöüßéèêÄÖÜäöüßéèêÄÖÜäöüßéèê";

export const V: readonly Pair[] = [
  ["null", null],
  ["true", true],
  ["false", false],
  ["0", 0],
  ["1", 1],
  ["42", 42],
  ["1.5", 1.5],
  ["0.1 + 0.2", 0.1 + 0.2],
  ["INF", Infinity],
  ["NAN", Number.NaN],
  ["''", ""],
  ["'0'", "0"],
  ["'1'", "1"],
  ["'01'", "01"],
  ["'abc'", "abc"],
  ["'ABC'", "ABC"],
  ['"a\\nb"', "a\nb"],
  ["[]", []],
  ["[1, 2, 3]", [1, 2, 3]],
  ["[3, 2, 1]", [3, 2, 1]],
  ["['a' => 1, 'b' => 2]", { a: 1, b: 2 }],
  ["['b' => 2, 'a' => 1]", { b: 2, a: 1 }],
  [
    "[1 => 'a', 0 => 'b']",
    branded([
      [1, "a"],
      [0, "b"],
    ]),
  ],
  ["['a' => [1, 2], 'b' => ['c' => null]]", { a: [1, 2], b: { c: null } }],
  ["(object) ['a' => 1]", stdClass({ a: 1 })],
  ["new XtA(1)", new XtA(1)],
  ["new XtA(1)", new XtA(1)],
  ["new XtB(1)", new XtB(1)],
  ["new XtS", new XtS()],
  ["function () {}", closure],
  ["new XtCountable", new XtCountable()],
  ["new XtIterator", new XtIterator()],
  // Ints beyond 2^53 (bigint twins), cycles, and strings with LogicalNot's words inside quotes.
  ["2 ** 60", 2n ** 60n],
  ["2 ** 60 + 1", 2n ** 60n + 1n],
  ["PHP_INT_MAX", 9223372036854775807n],
  ["$xtCycle", cycle],
  ["$xtCycleEqual", cycleEqual],
  ["$xtCycleOther", cycleOther],
  ["'it is'", "it is"],
  ['"don\'t"', "don't"],
  // Non-ASCII and control characters, and two long strings sharing a long non-ASCII prefix.
  ["'Ünïcödé'", "Ünïcödé"],
  ["'ünïcödé'", "ünïcödé"],
  ['"a\\tb"', "a\tb"],
  [`'${LONG_PREFIX}one'`, `${LONG_PREFIX}one`],
  [`'${LONG_PREFIX}two'`, `${LONG_PREFIX}two`],
  // Two pairs of long strings that differ at the start and share a long suffix (ASCII, then non-ASCII).
  [`'x${ASCII_SUFFIX}'`, `x${ASCII_SUFFIX}`],
  [`'y${ASCII_SUFFIX}'`, `y${ASCII_SUFFIX}`],
  [`'x${LONG_SUFFIX}'`, `x${LONG_SUFFIX}`],
  [`'y${LONG_SUFFIX}'`, `y${LONG_SUFFIX}`],
];

const xtA2 = new XtA(2);

export const U_EXTRA: readonly Pair[] = [
  ["-1", -1],
  ["-0.25", -0.25],
  ["-INF", -Infinity],
  ["1.0E+25", 1e25],
  ["'1.5'", "1.5"],
  ["' 1'", " 1"],
  ["'1e2'", "1e2"],
  ["'xab'", "xab"],
  ["'abc def'", "abc def"],
  ['"a\\r\\nb"', "a\r\nb"],
  ["'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab'", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"],
  ["[true, false]", [true, false]],
  ["[0 => 'x', 2 => 'y']", branded([[0, "x"], [2, "y"]])],
  ["[new XtA(2)]", [xtA2]],
  ["(object) []", stdClass({})],
  ["new XtC", new XtC()],
  ["[new XtA(1), 'm']", [new XtA(1), "m"]],
  ["fopen('php://memory', 'r')", resource],
  ["new XtArrayAccess", new XtArrayAccess()],
];

export const U: readonly Pair[] = [...V, ...U_EXTRA];

const listSource = (pairs: readonly Pair[]): string => `[${pairs.map(([php]) => php).join(", ")}]`;

export const SETUP: readonly string[] = [...SETUP_CLASSES, ...SETUP_HELPERS, ...SETUP_CYCLES, `$v = ${listSource(V)};`, `$u = array_merge($v, ${listSource(U_EXTRA)});`];

// ---------------------------------------------------------------------------
// Argument lists

const CLASSES: readonly Pair[] = [
  ["XtA::class", XtA],
  ["XtB::class", XtB],
  ["XtI::class", XtI],
  ["XtC::class", XtC],
  ["'Countable'", CountableToken],
  ["'Traversable'", TraversableToken],
  ["'stdClass'", Object],
  ["'NoSuchClass'", "NoSuchClass"],
];

const TYPES: readonly Pair[] = [
  ["'bool'", "bool"],
  ["'int'", "int"],
  ["'string'", "string"],
  ["'array'", "array"],
  ["'object'", "object"],
  // PHPUnit 11.5's aliases.
  ["'integer'", "integer"],
  ["'boolean'", "boolean"],
  ["'double'", "double"],
  ["'real'", "real"],
  ["XtA::class", XtA],
  ["'NoSuchClass'", "NoSuchClass"],
];

const COUNTS: readonly Pair[] = [
  ["0", 0],
  ["2", 2],
  ["3", 3],
];

const KEYS: readonly Pair[] = [
  ["0", 0],
  ["1", 1],
  ["'a'", "a"],
  ["'1'", "1"],
  ["1.5", 1.5],
  ["null", null],
];

const PROPERTIES: readonly Pair[] = [
  ["'p'", "p"],
  ["'a'", "a"],
  ["'q'", "q"],
  ["'zz'", "zz"],
];

const AFFIXES: readonly Pair[] = [
  ["'a'", "a"],
  ["'ab'", "ab"],
  ["'b'", "b"],
  ["'abc'", "abc"],
  ["''", ""],
];

const NEEDLES: readonly Pair[] = [
  ["'a'", "a"],
  ["'b'", "b"],
  ["''", ""],
  ["'xyz'", "xyz"],
];

const LINES: readonly Pair[] = [
  ['"a\\nb"', "a\nb"],
  ['"a\\r\\nb"', "a\r\nb"],
  ["'abc'", "abc"],
  ["''", ""],
];

const PATTERNS: readonly Pair[] = [
  ["'/a/'", /a/],
  ["'/^b/m'", /^b/m],
  ["'/b$/'", /b$/],
];

const DELTAS: readonly Pair[] = [
  ["0.0", 0],
  ["0.25", 0.25],
  ["1", 1],
  ["2.5", 2.5],
];

// ---------------------------------------------------------------------------
// Matrices

/**
 * One assertion matrix. `rows` × `cols` (or `cols` alone, unary) pass `$a` (row) and `$b` (column) to `php`;
 * `ts` makes the same call. The Oracle's result is the matrix of cells.
 */
export interface Matrix {
  readonly assertion: string;
  readonly php: string;
  /** The TS call, statically on Assert, or through `self` (a test case instance: `this.assertX(…)`). */
  readonly ts: (a: unknown, b: unknown, self?: object) => void;
  readonly rows: "v" | "u" | readonly Pair[] | null;
  readonly cols: "v" | "u" | readonly Pair[];
}

const A = Assert as unknown as Record<string, (...args: unknown[]) => void>;

/** A matrix calling `$this->name(…args)`, where each arg is `$a`, `$b` or a PHP literal paired with its TS value. */
function call(name: string, args: readonly (string | Pair)[], rows: Matrix["rows"], cols: Matrix["cols"], target = "$this->"): Matrix {
  const php = `${target}${name}(${args.map((arg) => (typeof arg === "string" ? arg : arg[0])).join(", ")})`;
  const ts = (a: unknown, b: unknown, self?: object): void => {
    const target = self === undefined ? A : (self as Record<string, (...args: unknown[]) => void>);
    target[name]!(...args.map((arg) => (arg === "$a" ? a : arg === "$b" ? b : typeof arg === "string" ? arg : arg[1])));
  };
  return { assertion: name, php, ts, rows, cols };
}

const binary = (name: string, extra: readonly Pair[] = [], target = "$this->"): Matrix => call(name, ["$a", "$b", ...extra], "v", "v", target);
/** Laravel's assertion is a static of Illuminate\Testing\Assert, not of PHPUnit's TestCase. */
const LARAVEL = "\\Illuminate\\Testing\\Assert::";
const unary = (name: string, extra: readonly Pair[] = []): Matrix => call(name, ["$b", ...extra], null, "u");
const withArgs = (name: string, args: readonly Pair[], extra: readonly Pair[] = []): Matrix => call(name, ["$a", "$b", ...extra], args, "u");

export const EQUALITY: readonly Matrix[] = [
  binary("assertSame"),
  binary("assertNotSame"),
  binary("assertEquals"),
  binary("assertNotEquals"),
  binary("assertEqualsCanonicalizing"),
  binary("assertEqualsIgnoringCase"),
  binary("assertEqualsWithDelta", [["0.5", 0.5]]),
  call("assertEqualsWithDelta", [["1", 1], "$b", "$a"], DELTAS, "u"),
];

export const ORDERING: readonly Matrix[] = [binary("assertGreaterThan"), binary("assertGreaterThanOrEqual"), binary("assertLessThan"), binary("assertLessThanOrEqual")];

export const CONTAINMENT: readonly Matrix[] = [
  binary("assertContains"),
  binary("assertNotContains"),
  binary("assertSameSize"),
  binary("assertArraySubset", [], LARAVEL),
  binary("assertArraySubset", [["true", true]], LARAVEL),
];

export const UNARY: readonly Matrix[] = [
  unary("assertTrue"),
  unary("assertFalse"),
  unary("assertNotTrue"),
  unary("assertNotFalse"),
  unary("assertNull"),
  unary("assertNotNull"),
  unary("assertIsArray"),
  unary("assertIsNotArray"),
  unary("assertIsBool"),
  unary("assertIsCallable"),
  unary("assertIsFloat"),
  unary("assertIsInt"),
  unary("assertIsNumeric"),
  unary("assertIsObject"),
  unary("assertIsResource"),
  unary("assertIsString"),
  unary("assertIsList"),
  unary("assertEmpty"),
  unary("assertNotEmpty"),
  unary("assertNan"),
  unary("assertContainsOnlyBool"),
  // Custom messages: the prefix, and IsEqual's trim.
  unary("assertTrue", [["'ctx'", "ctx"]]),
  call("assertEquals", [["'abc'", "abc"], "$b", ["' ctx '", " ctx "]], null, "u"),
  call("assertSame", [["[1, 2, 3]", [1, 2, 3]], "$b", ["\"line one\\nline two\"", "line one\nline two"]], null, "u"),
  unary("assertContainsOnlyBool", [["'ctx'", "ctx"]]),
  call("assertArraySubset", [["['a' => 1]", { a: 1 }], "$b", ["false", false], ["'ctx'", "ctx"]], null, "u", LARAVEL),
];

/** assertContainsOnly runs through the xt_contains_only shim (ESC-4.3-1 item 7). */
const containsOnly: Matrix = {
  assertion: "assertContainsOnly",
  php: "xt_contains_only($this, $a, $b)",
  ts: (a, b, self) => {
    (self === undefined ? Assert : (self as Assert)).assertContainsOnly(a as string, b);
  },
  rows: TYPES,
  cols: "u",
};

export const WITH_ARGUMENTS: readonly Matrix[] = [
  withArgs("assertInstanceOf", CLASSES),
  withArgs("assertNotInstanceOf", CLASSES),
  withArgs("assertContainsOnlyInstancesOf", CLASSES),
  containsOnly,
  withArgs("assertCount", COUNTS),
  withArgs("assertArrayHasKey", KEYS),
  withArgs("assertArrayNotHasKey", KEYS),
  withArgs("assertObjectHasProperty", PROPERTIES),
  withArgs("assertStringStartsWith", AFFIXES),
  withArgs("assertStringEndsWith", AFFIXES),
  withArgs("assertStringContainsString", NEEDLES),
  withArgs("assertStringNotContainsString", NEEDLES),
  withArgs("assertStringEqualsStringIgnoringLineEndings", LINES),
  withArgs("assertMatchesRegularExpression", PATTERNS),
  withArgs("assertDoesNotMatchRegularExpression", PATTERNS),
];

// ---------------------------------------------------------------------------
// XT-assert-8, exceptions: the ExceptionComparator over its own operands. PHP's full export of an exception holds
// its file and line, which a JS Error has no counterpart for (and a PHP exception is Stringable through its trace), so
// only the equality assertions run here, over exceptions, arrays of them and null: their messages print an exception
// through the comparator (without file, line and trace) or shortened.

const EXCEPTIONS: readonly Pair[] = [
  ["new \\Exception('a')", new XtException("a")],
  ["new \\Exception('a')", new XtException("a")],
  ["new \\Exception('b')", new XtException("b")],
  ["new \\Exception('a', 3)", new XtException("a", 3)],
  ["new \\Exception('a', 0, new \\Exception('p'))", new XtException("a", 0, new XtException("p"))],
  ["new \\Exception('a', 0, new \\Exception('q'))", new XtException("a", 0, new XtException("q"))],
  ["[new \\Exception('a')]", [new XtException("a")]],
  ["[new \\Exception('b')]", [new XtException("b")]],
  ["['e' => new \\Exception('a', 3)]", { e: new XtException("a", 3) }],
  ["['e' => new \\Exception('a')]", { e: new XtException("a") }],
  ["null", null],
];

export const EXCEPTION_SETUP: readonly string[] = [...SETUP_HELPERS, `$v = ${listSource(EXCEPTIONS)};`];
export const EXCEPTION_MATRICES: readonly Matrix[] = [
  binary("assertEquals"),
  binary("assertEqualsCanonicalizing"),
  binary("assertEqualsIgnoringCase"),
  binary("assertEqualsWithDelta", [["0.5", 0.5]]),
];

// ---------------------------------------------------------------------------
// XT-assert-8, distinct resources and closures: the ResourceComparator and the identity of two closures. Two distinct
// resources run every equality assertion. Two distinct closures run only the identity assertions: comparator 8.4.0
// compares closures by declaration, binding and captured state, and names their PHP file and line in its message,
// while two distinct JS functions are never equal; and on closures declared in eval'd code the Oracle ends in an
// AssertionError rather than a cell (ESC-4.3-1 item 9).

const resourceOther = new XtResource();
const closureOther = (): void => {};

const DISTINCT_RESOURCES: readonly Pair[] = [
  ["$xtR1", resource],
  ["$xtR2", resourceOther],
  ["null", null],
  ["1", 1],
];

export const DISTINCT_RESOURCES_SETUP: readonly string[] = [...SETUP_HELPERS, "$xtR1 = fopen('php://memory', 'r');", "$xtR2 = fopen('php://memory', 'r');", `$v = ${listSource(DISTINCT_RESOURCES)};`];
export const DISTINCT_RESOURCES_MATRICES: readonly Matrix[] = [
  binary("assertSame"),
  binary("assertNotSame"),
  binary("assertEquals"),
  binary("assertNotEquals"),
  binary("assertEqualsCanonicalizing"),
  binary("assertEqualsIgnoringCase"),
  binary("assertEqualsWithDelta", [["0.5", 0.5]]),
];

const DISTINCT_CLOSURES: readonly Pair[] = [
  ["$xtF1", closure],
  ["$xtF2", closureOther],
];

export const DISTINCT_CLOSURES_SETUP: readonly string[] = [...SETUP_HELPERS, "$xtF1 = function () {};\n$xtF2 = function () {};", `$v = ${listSource(DISTINCT_CLOSURES)};`];
export const DISTINCT_CLOSURES_MATRICES: readonly Matrix[] = [binary("assertSame"), binary("assertNotSame")];

// ---------------------------------------------------------------------------
// XT-assert-8, canonicalizing: lists of lists, of maps and of same-class objects in two orders, which
// ArrayComparator sorts by PHP's `sort()` (lists of arrays by `<=>`, objects by their serialized form).

const CANONICAL: readonly Pair[] = [
  ["[[2], [1]]", [[2], [1]]],
  ["[[1], [2]]", [[1], [2]]],
  ["[['id' => 2], ['id' => 1]]", [{ id: 2 }, { id: 1 }]],
  ["[['id' => 1], ['id' => 2]]", [{ id: 1 }, { id: 2 }]],
  ["[new XtA(2), new XtA(1)]", [new XtA(2), new XtA(1)]],
  ["[new XtA(1), new XtA(2)]", [new XtA(1), new XtA(2)]],
  ["[new XtA(1), new XtA(3)]", [new XtA(1), new XtA(3)]],
];

export const CANONICAL_SETUP: readonly string[] = [SETUP_CLASSES[0]!, ...SETUP_HELPERS, `$v = ${listSource(CANONICAL)};`];
export const CANONICAL_MATRICES: readonly Matrix[] = [binary("assertEqualsCanonicalizing"), binary("assertEquals")];

// ---------------------------------------------------------------------------
// XT-assert-9: one array, the same entries in another key order (list, plain object and branded forms).

const KEY_ORDER: readonly Pair[] = [
  ["[1, 2]", [1, 2]],
  [
    "[1 => 2, 0 => 1]",
    branded([
      [1, 2],
      [0, 1],
    ]),
  ],
  ["['a' => 1, 'b' => 2]", { a: 1, b: 2 }],
  ["['b' => 2, 'a' => 1]", { b: 2, a: 1 }],
  [
    "[0 => 'x', 'a' => 1]",
    branded([
      [0, "x"],
      ["a", 1],
    ]),
  ],
  [
    "['a' => 1, 0 => 'x']",
    branded([
      ["a", 1],
      [0, "x"],
    ]),
  ],
  ["['n' => ['a' => 1, 'b' => 2]]", { n: { a: 1, b: 2 } }],
  ["['n' => ['b' => 2, 'a' => 1]]", { n: { b: 2, a: 1 } }],
];

export const KEY_ORDER_SETUP: readonly string[] = [...SETUP_HELPERS, `$v = ${listSource(KEY_ORDER)};`];
export const KEY_ORDER_MATRICES: readonly Matrix[] = [binary("assertSame"), binary("assertEquals")];
export const KEY_ORDER_V = KEY_ORDER;

// ---------------------------------------------------------------------------
// XT-assert-10: Upstream patterns whose PCRE and JS syntax agree.

const UPSTREAM_PATTERNS: readonly Pair[] = [
  ["'/^[a-zA-Z0-9]{40}\\.jpg$/'", /^[a-zA-Z0-9]{40}\.jpg$/], // tests/Image/ImageTest.php
  ["'/^To: nuno@laravel.com/m'", /^To: nuno@laravel.com/m], // tests/Mail/MailMailerTest.php
  ["'/artisan.*inspire$/'", /artisan.*inspire$/], // tests/Console/Scheduling/ScheduleTest.php
  ["'/&lt;br\\s*\\/?&gt;/'", /&lt;br\s*\/?&gt;/], // tests/Integration/Foundation/Exceptions/RenderBladeFilesTest.php
];

const SUBJECTS: readonly Pair[] = [
  ["str_repeat('a', 40) . '.jpg'", `${"a".repeat(40)}.jpg`],
  ["'abc.jpg'", "abc.jpg"],
  ['"Subject: Hi\\nTo: nuno@laravel.com\\n"', "Subject: Hi\nTo: nuno@laravel.com\n"],
  ["'To: taylor@laravel.com'", "To: taylor@laravel.com"],
  ["\"'php' artisan inspire\"", "'php' artisan inspire"],
  ["'artisan inspire now'", "artisan inspire now"],
  ["'a &lt;br /&gt; b'", "a &lt;br /&gt; b"],
  ["'a <br> b'", "a <br> b"],
];

export const REGEX_SETUP: readonly string[] = [...SETUP_HELPERS, `$v = ${listSource(SUBJECTS)};`];
export const REGEX_MATRICES: readonly Matrix[] = [
  call("assertMatchesRegularExpression", ["$a", "$b"], UPSTREAM_PATTERNS, "v"),
  call("assertDoesNotMatchRegularExpression", ["$a", "$b"], UPSTREAM_PATTERNS, "v"),
];
export const REGEX_V = SUBJECTS;
export const REGEX_PATTERNS = UPSTREAM_PATTERNS;

// ---------------------------------------------------------------------------
// Requests

/** The PHP expression of a matrix: a list of rows (or one row, unary) of cells. */
export function matrixExpr(matrix: Matrix): string {
  const cols = matrix.cols === "v" ? "$v" : matrix.cols === "u" ? "$u" : listSource(matrix.cols);
  const cell = `xt_cell(fn () => ${matrix.php})`;
  if (matrix.rows === null) {
    return `array_map(fn ($b) => ${cell}, ${cols})`;
  }
  const rows = matrix.rows === "v" ? "$v" : matrix.rows === "u" ? "$u" : listSource(matrix.rows);
  return `array_map(fn ($a) => array_map(fn ($b) => ${cell}, ${cols}), ${rows})`;
}

export interface RequestSpec {
  readonly id: "XT-assert-8" | "XT-assert-9" | "XT-assert-10";
  readonly setup: readonly string[];
  /** The operand lists the request evaluates first, in order: `$v`, then `$u` when present. */
  readonly operands: readonly (readonly Pair[])[];
  readonly matrices: readonly Matrix[];
}

export const REQUESTS: readonly RequestSpec[] = [
  { id: "XT-assert-8", setup: SETUP, operands: [V, U], matrices: EQUALITY },
  { id: "XT-assert-8", setup: SETUP, operands: [V, U], matrices: ORDERING },
  { id: "XT-assert-8", setup: SETUP, operands: [V, U], matrices: CONTAINMENT },
  { id: "XT-assert-8", setup: SETUP, operands: [V, U], matrices: UNARY },
  { id: "XT-assert-8", setup: SETUP, operands: [V, U], matrices: WITH_ARGUMENTS },
  { id: "XT-assert-8", setup: EXCEPTION_SETUP, operands: [EXCEPTIONS], matrices: EXCEPTION_MATRICES },
  { id: "XT-assert-8", setup: DISTINCT_RESOURCES_SETUP, operands: [DISTINCT_RESOURCES], matrices: DISTINCT_RESOURCES_MATRICES },
  { id: "XT-assert-8", setup: CANONICAL_SETUP, operands: [CANONICAL], matrices: CANONICAL_MATRICES },
  { id: "XT-assert-8", setup: DISTINCT_CLOSURES_SETUP, operands: [DISTINCT_CLOSURES], matrices: DISTINCT_CLOSURES_MATRICES },
  { id: "XT-assert-9", setup: KEY_ORDER_SETUP, operands: [KEY_ORDER], matrices: KEY_ORDER_MATRICES },
  { id: "XT-assert-10", setup: REGEX_SETUP, operands: [SUBJECTS], matrices: REGEX_MATRICES },
];

/** The `exprs` of a request: the operand lists, then one expression per matrix. */
export function requestExprs(spec: RequestSpec): string[] {
  return [...(spec.operands.length === 2 ? ["$v", "$u"] : ["$v"]), ...spec.matrices.map(matrixExpr)];
}
