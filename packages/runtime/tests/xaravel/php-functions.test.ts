// Xaravel Tests for action item epic-14-item-2-runtime-generators-functions, the runtime half of ESC-14.1-5 and
// ESC-14.1-6 (decisions/MAINT-2026-10-25-story-14-1-second.md, option 1 each). XT-runtime-57: `keyed`, `yieldFrom` and
// `Generator` (DIV-12.18). XT-runtime-58: `is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique` and
// their constants. XT-runtime-59: `range`. XT-runtime-60: `iterator_to_array`, `iterator_count`, `str_starts_with`,
// `substr` and `toPhpArray`, with the fresh-process export check. None needs an Oracle fixture: each expected value
// and message is what PHP 8.5.11 gives for the same construct, probed with the host's `php`: `php-functions.probe.php`
// prints each PHP-derived value as `<label>\t<json>` (`JSON_PRESERVE_ZERO_FRACTION`, so a float stays a float),
// `php-functions.probe.txt` is its output under PHP 8.5.11
// (`php -d error_reporting=0 php-functions.probe.php > php-functions.probe.txt`), and XT-runtime-61 computes every
// recorded label with the runtime and compares it with PHP's value. Not recorded: the assertions marked
// `Xaravel-only`, which have no PHP counterpart (a bare JS generator, the `KeyedYield` marker, the unported callable and
// sort-flag forms, `undefined` read as null, and the JS `TypeError` for a byte string JS cannot hold).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  ARRAY_FILTER_USE_BOTH,
  ARRAY_FILTER_USE_KEY,
  array_combine,
  array_filter,
  array_unique,
  ArrayIterator,
  ArrayObject,
  Error as PhpError,
  Exception,
  float,
  Generator,
  in_array,
  is_scalar,
  iterator_count,
  iterator_to_array,
  Iterator,
  IteratorAggregate,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  keyed,
  LogicException,
  PhpArray,
  type PhpKeyInput,
  phpSerialize,
  phpUnserialize,
  range,
  SORT_NUMERIC,
  SORT_REGULAR,
  SORT_STRING,
  stdClass,
  str_starts_with,
  substr,
  toPhpArray,
  Traversable,
  TypeError as PhpTypeError,
  ValueError,
  WeakMap,
  yieldFrom,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpFunctions";
const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = [
  "ARRAY_FILTER_USE_BOTH",
  "ARRAY_FILTER_USE_KEY",
  "array_combine",
  "array_filter",
  "array_unique",
  "Generator",
  "in_array",
  "is_scalar",
  "iterator_count",
  "iterator_to_array",
  "keyed",
  "range",
  "SORT_NUMERIC",
  "SORT_REGULAR",
  "SORT_STRING",
  "str_starts_with",
  "substr",
  "toPhpArray",
  "yieldFrom",
] as const;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** `"<class>: <message>"` of what `fn` throws (a PHP throwable), or null; the probe's `thrown`. */
function thrownText(fn: () => unknown): string | null {
  const error = thrownBy(fn);
  if (error === null) {
    return null;
  }
  const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
  return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
}

/** `fn` throws exactly a `klass` (not a subclass of it) with `message`. */
function assertThrows(klass: abstract new (...args: never[]) => unknown, message: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof klass, `expected a ${String((klass as { name?: unknown }).name)}: ${String(error)}`);
  Assert.assertSame(fqcn(klass), fqcn((error as object).constructor as abstract new (...args: never[]) => unknown));
  Assert.assertSame(message, (error as globalThis.Error).message);
}

/** `fn` throws a JS `TypeError` (no PHP throwable) whose message contains `part`. */
function assertJsTypeError(part: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof globalThis.TypeError && !(error instanceof PhpError), `expected a JS TypeError: ${String(error)}`);
  Assert.assertStringContainsString(part, (error as globalThis.Error).message);
}

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = jsonEncode(value, JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** A `Generator` over what the generator function `fn` returns, as calling a PHP generator function gives one. */
function gen(fn: () => globalThis.Generator<unknown, unknown, unknown>): Generator {
  return new Generator(fn());
}

/** The `[key, value]` pairs of PHP's `foreach` over an array or a Traversable; the probe's `pairs`. */
function pairs(subject: unknown): unknown[] {
  if (subject instanceof Generator || subject instanceof ArrayIterator || subject instanceof ArrayObject) {
    return [...subject.entries()];
  }
  return [...toPhpArray(subject)];
}

/** Runs `code` as a module in a fresh `bun` process from the package directory. */
function child(code: string): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: inherited });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

const PHP_PROPERTIES: unique symbol = Symbol.for("xaravel.php.properties");

/** The probe's `Visibility`: a public, a protected and a private property. */
class Visibility {
  static readonly [PHP_PROPERTIES] = [
    { name: "a", visibility: "public", default: 1 },
    { name: "b", visibility: "protected", default: 2 },
    { name: "c", visibility: "private", default: 3 },
  ];
}

registerClass(`${NS}\\Visibility`, Visibility);

/** The probe's `Aggregate`: an `IteratorAggregate` whose `getIterator()` is the Traversable it holds. */
class Aggregate implements IteratorAggregate {
  readonly #inner: Traversable;

  constructor(inner: Traversable) {
    this.#inner = inner;
  }

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  getIterator(): Traversable {
    return this.#inner;
  }

  *[Symbol.iterator](): globalThis.Generator<unknown, void, undefined> {
    yield* iterator_to_array(this, false) as unknown[];
  }

  entries(): Iterable<[unknown, unknown]> {
    return [...toPhpArray(iterator_to_array(this))];
  }

  keys(): Iterable<unknown> {
    return [...toPhpArray(iterator_to_array(this)).keys()];
  }
}

registerClass(`${NS}\\Aggregate`, Aggregate);

/** The probe's `SelfAggregate`: its `getIterator()` returns itself. */
class SelfAggregate {
  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  getIterator(): unknown {
    return this;
  }
}

registerClass(`${NS}\\SelfAggregate`, SelfAggregate);

/** An aggregate whose `getIterator()` returns `other`, for a cycle PHP runs into a stack overflow. Xaravel-only. */
class CycleAggregate {
  other: unknown = null;

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  getIterator(): unknown {
    return this.other;
  }
}

registerClass(`${NS}\\CycleAggregate`, CycleAggregate);

/** The probe's `OneIterator`: an `Iterator` whose `valid()` returns 1 or 0. */
class OneIterator {
  #i = 0;

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  current(): unknown {
    return this.#i * 10;
  }

  key(): unknown {
    return this.#i;
  }

  next(): void {
    this.#i++;
  }

  rewind(): void {
    this.#i = 0;
  }

  valid(): unknown {
    return this.#i < 3 ? 1 : 0;
  }

  *[Symbol.iterator](): globalThis.Generator<unknown, void, undefined> {
    yield* iterator_to_array(this, false) as unknown[];
  }

  entries(): Iterable<[unknown, unknown]> {
    return [...toPhpArray(iterator_to_array(this))];
  }

  keys(): Iterable<unknown> {
    return [...toPhpArray(iterator_to_array(this)).keys()];
  }
}

registerClass(`${NS}\\OneIterator`, OneIterator);

/** The probe's `$lcg` list: 1100 mixed values from a linear congruential generator. */
function lcgList(): unknown[] {
  const list: unknown[] = [];
  let x = 42n;
  for (let i = 0; i < 1100; i++) {
    x = (x * 1103515245n + 12345n) % 2147483648n;
    const n = Number(x % 50n);
    switch (Number(x % 7n)) {
      case 0:
        list.push(n);
        break;
      case 1:
        list.push(String(n));
        break;
      case 2:
        // PHP's `/` gives an int when the division is exact.
        list.push(n / 2);
        break;
      case 3:
        list.push(String.fromCharCode(97 + (n % 5)));
        break;
      case 4:
        list.push(n % 2 === 0);
        break;
      case 5:
        list.push(`${n % 20}e0`);
        break;
      default:
        list.push(null);
    }
  }
  return list;
}

/** The probe's `BadAggregate`: its `getIterator()` returns an array. */
class BadAggregate {
  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  getIterator(): unknown {
    return [1];
  }
}

registerClass(`${NS}\\BadAggregate`, BadAggregate);

/** The probe's `Text`: a `__toString` port. */
class Text {
  toString(): string {
    return "text";
  }
}

registerClass(`${NS}\\Text`, Text);

/** The probe's pure enum `Suit` (AD-26). */
class Suit {
  static readonly Hearts = new Suit("Hearts");
  static readonly Spades = new Suit("Spades");

  constructor(readonly name: string) {}

  static cases(): Suit[] {
    return [Suit.Hearts, Suit.Spades];
  }
}

registerClass(`${NS}\\Suit`, Suit);

/** A generator function that returns `value` before it yields, as `return $value; yield;` does. */
function* returnsFirst(value: unknown): globalThis.Generator<unknown, unknown, unknown> {
  if (value !== undefined) {
    return value;
  }
  yield null;
}

/** A generator function that throws `error` before it yields, as `throw $error; yield;` does. */
function* throwsFirst(error: globalThis.Error): globalThis.Generator<unknown, unknown, unknown> {
  if (error instanceof globalThis.Error) {
    throw error;
  }
  yield null;
  return null;
}

/** The probe's `$keyed` generator. */
function* keyedSource(): globalThis.Generator<unknown, void, unknown> {
  yield keyed("a", 1);
  yield keyed("a", 2);
  yield keyed(1.7, 3);
  yield keyed(null, 4);
  yield keyed(true, 5);
}

/** The probe's `$long` list for `array_unique.long`. */
function longList(): unknown[] {
  const list: unknown[] = [];
  for (let i = 0; i < 40; i++) {
    const fraction = (i % 4) * 1.5;
    list.push([(i * 7) % 11, String((i * 3) % 5), Number.isInteger(fraction) ? float(fraction) : fraction, i % 3 === 0 ? "a" : i % 3 === 1 ? "1e0" : true][i % 4]);
  }
  return list;
}

/** `array_keys($a)`. */
function keysOf(array: unknown): unknown[] {
  return [...toPhpArray(array).keys()];
}

/** `array_values($a)`. */
function valuesOf(array: unknown): unknown[] {
  return [...toPhpArray(array).values()];
}

/** Each label of `php-functions.probe.txt` and the runtime's value for the same case. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  // XT-runtime-57
  "gen.auto_keys": () =>
    pairs(
      gen(function* () {
        yield "a";
        yield keyed(5, "b");
        yield "c";
        yield keyed("x", "d");
        yield "e";
        yield keyed(-9, "f");
        yield "g";
      }),
    ),
  "gen.negative_then_auto": () =>
    pairs(
      gen(function* () {
        yield keyed(-5, "a");
        yield "b";
      }),
    ),
  "gen.int_max_wrap": () =>
    pairs(
      gen(function* () {
        yield keyed(INT_MAX, "a");
        yield "b";
      }),
    ),
  "gen.float_and_string_keys": () =>
    pairs(
      gen(function* () {
        yield keyed(1.5, "a");
        yield "b";
        yield keyed("7", "c");
        yield "d";
        yield keyed(float(2), "e");
        yield "f";
      }),
    ),
  "gen.bare_yield": () =>
    pairs(
      gen(function* () {
        yield;
      }),
    ),
  "yieldFrom.array": () =>
    pairs(
      gen(function* () {
        yield 1;
        yield* yieldFrom({ 5: "x", 6: "y" });
        yield 2;
      }),
    ),
  "yieldFrom.return": () => [
    pairs(
      gen(function* () {
        const r = yield* yieldFrom(
          (function* () {
            yield 1;
            return "R";
          })(),
        );
        yield keyed("r", r);
      }),
    ),
    pairs(
      gen(function* () {
        const r = yield* yieldFrom([1]);
        yield keyed("r", r);
      }),
    ),
    pairs(
      gen(function* () {
        const r = yield* yieldFrom(new ArrayIterator({ a: 1 }));
        yield keyed("r", r);
      }),
    ),
    pairs(
      gen(function* () {
        const r = yield* yieldFrom(new Aggregate(new Aggregate(new ArrayIterator({ n: 2 }))));
        yield keyed("r", r);
      }),
    ),
  ],
  "yieldFrom.started": () => {
    const inner = gen(function* () {
      yield 1;
      yield 2;
      yield 3;
    });
    inner.current();
    inner.next();
    const outer = gen(function* () {
      yield* yieldFrom(inner);
      yield "end";
    });
    return [pairs(outer), inner.valid()];
  },
  "yieldFrom.fresh_returning": () =>
    pairs(
      gen(function* () {
        const r = yield* yieldFrom(returnsFirst("early"));
        yield keyed("r", r);
      }),
    ),
  "yieldFrom.send": () => {
    const inner = gen(function* () {
      const x: unknown = yield 1;
      yield keyed("got", x);
      return "done";
    });
    const outer = gen(function* () {
      const r = yield* yieldFrom(inner);
      yield keyed("r", r);
    });
    const first = [outer.key(), outer.current()];
    const sent = outer.send("S");
    const second = [outer.key(), outer.current(), inner.key(), inner.current()];
    outer.next();
    return [first, sent, second, [outer.key(), outer.current(), inner.valid(), inner.getReturn()]];
  },
  "yieldFrom.errors": () => {
    const closed = gen(function* () {
      yield 1;
      return 2;
    });
    for (const _ of closed) {
      // Runs the generator to its end.
    }
    const threw = new Generator(throwsFirst(new LogicException("boom")));
    thrownBy(() => threw.current());
    let self: Generator | null = null;
    self = gen(function* () {
      yield 1;
      yield* yieldFrom(self);
    });
    const running = self;
    return [
      thrownText(() =>
        iterator_to_array(
          gen(function* () {
            yield* yieldFrom(5);
          }),
        ),
      ),
      thrownText(() =>
        iterator_to_array(
          gen(function* () {
            yield* yieldFrom(closed);
          }),
        ),
      ),
      thrownText(() =>
        iterator_to_array(
          gen(function* () {
            yield* yieldFrom(threw);
          }),
        ),
      ),
      thrownText(() => {
        for (const _ of running) {
          // Reaches the yield from itself.
        }
      }),
      thrownText(() =>
        iterator_to_array(
          gen(function* () {
            yield* yieldFrom(new BadAggregate());
          }),
        ),
      ),
    ];
  },
  "generator.methods": () => {
    const log: unknown[] = [];
    const g = gen(function* () {
      const x: unknown = yield 1;
      log.push(x);
      const y: unknown = yield 2;
      log.push(y);
      return 3;
    });
    const sent = g.send("S");
    const before = thrownText(() => g.getReturn());
    g.next();
    return [sent, log, before, [g.valid(), g.current(), g.key(), g.getReturn()]];
  },
  "generator.fresh_next": () => {
    const g = gen(function* () {
      yield 1;
      yield 2;
      yield 3;
    });
    g.next();
    return [g.key(), g.current()];
  },
  "generator.fresh_send": () => {
    const log: unknown[] = [];
    const g = gen(function* () {
      log.push("started");
      const x: unknown = yield 1;
      log.push(x);
      yield 2;
    });
    const sent = g.send("v");
    return [sent, log];
  },
  "generator.rewind": () => {
    const g = gen(function* () {
      yield 1;
      yield 2;
    });
    const atFirst = thrownText(() => g.rewind());
    g.current();
    const again = thrownText(() => g.rewind());
    g.next();
    return [atFirst, again, thrownText(() => g.rewind()), thrownText(() => pairs(g))];
  },
  "generator.closed": () => {
    const g = gen(function* () {
      yield 1;
    });
    const first = pairs(g);
    return [first, thrownText(() => pairs(g)), thrownText(() => iterator_to_array(g)), thrownText(() => iterator_count(g)), g.send("x")];
  },
  "generator.running": () => {
    let g: Generator | null = null;
    g = gen(function* () {
      const self = g!;
      const first = thrownText(() => self.current());
      yield first;
      yield thrownText(() => self.next());
      yield [self.current(), self.valid(), thrownText(() => self.send(1)), thrownText(() => self.getReturn())];
    });
    return iterator_to_array(g, false);
  },
  "generator.serialize": () => {
    const g = gen(function* () {
      yield 1;
    });
    return [thrownText(() => phpSerialize(g)), thrownText(() => phpUnserialize('O:9:"Generator":0:{}')), jsonEncode(g), toPhpArray(g)];
  },
  "generator.new": () => thrownText(() => new Generator()),
  "generator.return_first": () => {
    const g = new Generator(returnsFirst(7));
    const returned = g.getReturn();
    const rewind = thrownText(() => g.rewind());
    const h = new Generator(returnsFirst(7));
    return [returned, rewind, g.valid(), pairs(h), thrownText(() => pairs(h))];
  },
  "generator.throws": () => {
    const g = gen(function* () {
      yield 1;
      throw new LogicException("boom");
    });
    const current = g.current();
    const error = thrownText(() => g.next());
    return [current, error, g.valid(), g.current(), g.key(), thrownText(() => g.getReturn())];
  },
  // XT-runtime-58
  constants: () => [ARRAY_FILTER_USE_BOTH, ARRAY_FILTER_USE_KEY, SORT_REGULAR, SORT_NUMERIC, SORT_STRING],
  is_scalar: () => [1, 1.5, "s", false, null, [], new stdClass()].map((value) => is_scalar(value)),
  in_array: () => {
    return [
      in_array("1e1", ["10"]),
      in_array("abc", [0]),
      in_array(null, [""]),
      in_array(null, [""], true),
      in_array(1, ["1"], true),
      in_array(float(1), [1], true),
      in_array([1], [[1]], true),
      in_array({ a: 1, b: 2 }, [{ b: 2, a: 1 }], true),
      in_array({ a: 1, b: 2 }, [{ b: 2, a: 1 }]),
    ];
  },
  "in_array.more": () => {
    const { ab } = abBa();
    return [
      in_array(1, ["1"]),
      in_array("a", { b: "a" }, true),
      in_array({ a: 1, b: 2 }, [{ b: 2, a: 1 }], true),
      in_array({ a: 1, b: 2 }, [{ b: 2, a: 1 }]),
      in_array(ab, [ab], true),
      in_array(NaN, [NaN], true),
      in_array(float(0), [-0], true),
      in_array(1, [true]),
      in_array(1, [true], true),
      in_array("x", ["x"], "yes"),
      in_array("x", ["x"], 0),
    ];
  },
  "in_array.errors": () => [
    thrownText(() => in_array(1, "x")),
    thrownText(() => in_array(1, [1], [])),
    thrownText(() => in_array(1, null)),
    thrownText(() => in_array(1, [1], new stdClass())),
  ],
  array_combine: () => [
    array_combine(["a", 1, 1.5, true, null, "07", "7", float(2)], [1, 2, 3, 4, 5, 6, 7, 8]),
    array_combine(["a", "a"], [1, 2]),
    array_combine([[]], [1]),
    array_combine([], []),
    array_combine([new Text()], [1]),
    array_combine({ x: "k", y: "l" }, new PhpArray([[3, "v"], [9, "w"]])),
  ],
  "array_combine.errors": () => [
    thrownText(() => array_combine([1, 2], [1])),
    thrownText(() => array_combine([new stdClass()], [1])),
    thrownText(() => array_combine("a", [1])),
    thrownText(() => array_combine([1], "a")),
  ],
  array_filter: () => [
    array_filter([1, 0, 2, null, "", "a", "0", [], [0]]),
    array_filter({ a: 1, b: 2, c: 3 }, (k: unknown) => k !== "b", ARRAY_FILTER_USE_KEY),
    array_filter({ a: 1, b: 2, c: 3 }, (v: unknown, k: unknown) => (v as number) > 1 && k !== "c", ARRAY_FILTER_USE_BOTH),
    array_filter(new PhpArray([[5, 1], [6, 2]]), (v: unknown) => v === 2),
    array_filter([], () => true),
    array_filter([1, 2], null),
    array_filter([0, 1], (v: unknown) => v, "0"),
  ],
  "array_filter.arguments": () =>
    [0, ARRAY_FILTER_USE_KEY, ARRAY_FILTER_USE_BOTH, 7, -1].map((mode) => {
      const calls: unknown[][] = [];
      array_filter(
        { k: "v" },
        (...args: unknown[]) => {
          calls.push(args);
          return true;
        },
        mode,
      );
      return calls;
    }),
  "array_filter.errors": () => [
    thrownText(() => array_filter([1], 5)),
    thrownText(() => array_filter([1], () => true, "x")),
    thrownText(() => array_filter("x")),
  ],
  array_unique: () => {
    const unique = [3, "3", 1, "a", float(1), true, "1"];
    return [
      keysOf(array_unique(unique, SORT_STRING)),
      keysOf(array_unique(unique, SORT_REGULAR)),
      keysOf(array_unique(unique)),
      array_unique(["10", "1e1", float(10), "a", "b", "a"], SORT_NUMERIC),
      array_unique([[1], [1], "Array"]),
      array_unique([[1], [1], "Array"], SORT_REGULAR),
      array_unique({ b: 1, a: 1, c: 2 }),
      array_unique([]),
      array_unique(new PhpArray([[7, "x"]])),
      array_unique(["x", new Text(), "text"]),
      array_unique([4, "4", 3, float(4), "x", "x"], SORT_REGULAR),
      array_unique([2, 1, 2, 1, 3, 3], "1"),
      array_unique([1, 1], 99),
    ];
  },
  "array_unique.long": () => [keysOf(array_unique(longList(), SORT_REGULAR)), keysOf(array_unique(longList(), SORT_NUMERIC))],
  "array_unique.enum": () => [
    keysOf(array_unique([Suit.Hearts, Suit.Hearts, Suit.Spades], SORT_REGULAR)),
    keysOf(array_unique([1, Suit.Hearts, 1, Suit.Hearts], SORT_REGULAR)),
    keysOf(array_unique([Suit.Spades, "x", Suit.Spades, "x"], SORT_REGULAR)),
  ],
  "array_unique.errors": () => [
    thrownText(() => array_unique([1, new stdClass()])),
    thrownText(() => array_unique("x")),
    thrownText(() => array_unique([1, 2], "x")),
  ],
  // XT-runtime-59
  range: () => [
    range(1, 5),
    range(5, 1),
    range(1, 10, 3),
    range(10, 1, -3),
    range(5, 1, 2),
    range(3, 3),
    range(-2, 2),
    range(0, 1, 0.25),
    range(float(1), 3),
    range(1, 2, 0.3),
    range(3, 1.5, 0.5),
    range(1, 3, float(1)),
    range(2.5, 2.5),
    range("1", "3"),
    range("1", 3),
    range("5", "10"),
    range("1.5", 3),
    range("a", "e", 2),
    range("e", "a"),
    range("Z", "A", -5),
    range("A", 1),
    range(1, "A"),
    range("a", "a"),
    range("aa", "cc"),
    range("a", "z", 1.5),
    range("1", "2", 0.5),
    range("", 2),
    range(null, 2),
    range(false, 1),
    range(true, 3),
    range(1, 2, "1"),
    range("2", "0", 1),
    range(" 1", "3 "),
    range(new Text(), "v"),
    range(0, float(2)),
    range("0", "9", 4),
    range("x", "z", 2),
    range("A", "C", 1),
    range(INT_MAX - 1n, INT_MAX),
    range(INT_MIN, INT_MIN + 1n),
    range(-1.5, -3),
  ],
  "range.errors": () => [
    thrownText(() => range(1, 2, 0)),
    thrownText(() => range(1, 2, float(0))),
    thrownText(() => range(1, 5, -1)),
    thrownText(() => range(1, 2, 5)),
    thrownText(() => range("a", "b", 5)),
    thrownText(() => range("b", "a", 5)),
    thrownText(() => range(float(1), float(2), 5)),
    thrownText(() => range(float(2), float(1), 5)),
    thrownText(() => range("a", "c", -1)),
    thrownText(() => range(float(1), float(2), -1)),
    thrownText(() => range(Infinity, 1)),
    thrownText(() => range(1, -Infinity)),
    thrownText(() => range(NaN, 1)),
    thrownText(() => range(1, 2, Infinity)),
    thrownText(() => range(1, 2, NaN)),
    thrownText(() => range("1e999", 1)),
    thrownText(() => range([], 1)),
    thrownText(() => range(1, new stdClass())),
    thrownText(() => range(1, 2, "x")),
    thrownText(() => range(1, 2, [])),
    thrownText(() => range(1, 2, INT_MIN)),
    thrownText(() => range(INT_MIN, INT_MAX)),
    thrownText(() => range(INT_MAX, INT_MIN)),
    thrownText(() => range(0, 2000000000, 1)),
    thrownText(() => range(0, float(2e9), 1.5)),
    thrownText(() => range(float(2e9), 0.5, 1.5)),
    thrownText(() => range(0, 1073741823)),
    thrownText(() => range(float(0), float(1073741823))),
  ],
  // XT-runtime-60
  iterator_to_array: () => [
    iterator_to_array(keyedSource()),
    iterator_to_array(keyedSource(), false),
    iterator_to_array({ x: 1, y: 2 }),
    iterator_to_array({ x: 1, y: 2 }, false),
    iterator_to_array(new ArrayObject(new PhpArray<PhpKeyInput, unknown>([["k", 1], [0, 2]]))),
    iterator_to_array(new Aggregate(new Aggregate(new ArrayIterator(new PhpArray([[3, "n"]]))))),
    iterator_to_array(
      (function* () {
        yield 1;
        yield 2;
      })(),
      0,
    ),
  ],
  iterator_count: () => [
    iterator_count(
      (function* () {
        yield keyed("a", 1);
        yield keyed("a", 2);
      })(),
    ),
    iterator_count([1, 2, 3]),
    iterator_count(new ArrayObject([1, 2])),
    iterator_count(new Aggregate(new ArrayIterator(["a", "b", "c", "d"]))),
  ],
  "iterator_to_array.errors": () => [
    thrownText(() =>
      iterator_to_array(
        (function* () {
          yield keyed([], 1);
        })(),
      ),
    ),
    thrownText(() =>
      iterator_to_array(
        (function* () {
          yield keyed(new stdClass(), 1);
        })(),
      ),
    ),
    thrownText(() => iterator_to_array(5)),
    thrownText(() => iterator_to_array(new stdClass())),
    thrownText(() => iterator_count(5)),
    thrownText(() => iterator_count(null)),
    thrownText(() => iterator_to_array(new BadAggregate())),
    thrownText(() => iterator_to_array([1], [])),
    thrownText(() => iterator_to_array(new SelfAggregate())),
  ],
  str_starts_with: () => [
    str_starts_with("hello", "he"),
    str_starts_with("hello", ""),
    str_starts_with("hello", "lo"),
    str_starts_with(123, 1),
    str_starts_with("1", true),
    str_starts_with("x", null),
    str_starts_with("", ""),
    str_starts_with("1.5x", 1.5),
    str_starts_with(new Text(), "te"),
    str_starts_with("héllo", "hé"),
  ],
  "str_starts_with.errors": () => [thrownText(() => str_starts_with([], "a")), thrownText(() => str_starts_with("a", new stdClass()))],
  substr: () => [
    substr("abcdef", 1, 3),
    substr("abcdef", -3),
    substr("abcdef", 9),
    substr("abcdef", -9, 2),
    substr("abcdef", 1, -1),
    substr("abcdef", 3, -5),
    substr("abcdef", 0, null),
    substr("abcdef", "1"),
    substr("abcdef", 1.5),
    substr("abcdef", true),
    substr("abcdef", null),
    substr(12345, 1, 2),
    substr(1.5, 1),
    substr("héllo", 1, 2),
    substr("abcdef", 6),
    substr("abcdef", 2, 100),
    substr("abcdef", " 2"),
    substr("abcdef", 0, false),
    substr("abcdef", INT_MIN),
    substr("abcdef", 1, INT_MIN),
    substr(new Text(), 1),
    substr("abc", "1.0"),
  ],
  "substr.errors": () => [
    thrownText(() => substr([], 1)),
    thrownText(() => substr("abc", "x")),
    thrownText(() => substr("abc", "1x")),
    thrownText(() => substr("abc", NaN)),
    thrownText(() => substr("abc", 1e30)),
    thrownText(() => substr("abc", 1, "x")),
    thrownText(() => substr("abc", 1, [])),
    thrownText(() => substr("abc", [])),
    thrownText(() => substr("abc", "9999999999999999999")),
  ],
  toPhpArray: () => {
    const props = new stdClass();
    props["5"] = "five";
    props["x"] = "y";
    const castProps = toPhpArray(props);
    const castVisibility = toPhpArray(new Visibility());
    const closure = (): number => 1;
    const castClosure = toPhpArray(closure);
    return [
      toPhpArray(null),
      toPhpArray(1),
      toPhpArray(1.5),
      toPhpArray("a"),
      toPhpArray(true),
      toPhpArray(new PhpArray([[3, 1]])),
      [keysOf(castProps), valuesOf(castProps)],
      [keysOf(castVisibility), valuesOf(castVisibility)],
      [castClosure.size, castClosure.get(0) === closure],
      toPhpArray(new ArrayObject(new PhpArray<PhpKeyInput, unknown>([["k", 1], [0, 2]]))),
      toPhpArray(
        gen(function* () {
          yield 1;
        }),
      ),
      toPhpArray([]),
    ];
  },  "yieldFrom.chain_send": () => {
    const c = (): Generator =>
      gen(function* () {
        const x: unknown = yield "c1";
        yield keyed("cx", x);
        return "C";
      });
    const b = (): Generator =>
      gen(function* () {
        const r = yield* yieldFrom(c());
        yield keyed("b", r);
        return "B";
      });
    const a = gen(function* () {
      const r = yield* yieldFrom(b());
      yield keyed("a", r);
    });
    const steps: unknown[] = [[a.key(), a.current()]];
    steps.push(a.send("S"));
    steps.push([a.key(), a.current()]);
    a.next();
    steps.push([a.key(), a.current()]);
    a.next();
    steps.push([a.key(), a.current()]);
    a.next();
    steps.push([a.valid(), a.getReturn()]);
    return steps;
  },
  "in_array.enum": () => [
    in_array(Suit.Hearts, [true]),
    in_array(true, [Suit.Hearts]),
    in_array(Suit.Hearts, [Suit.Spades]),
    in_array(Suit.Hearts, [Suit.Hearts], true),
    in_array(Suit.Hearts, [false]),
    in_array(null, [Suit.Hearts]),
    in_array(Suit.Hearts, [1]),
  ],
  "in_array.strict_keys": () => [in_array({ a: 1 }, [{ b: 1 }], true), in_array({ a: 1 }, [{ b: 1 }])],
  "array_unique.enum_bool": () => [keysOf(array_unique([Suit.Hearts, true], SORT_REGULAR)), keysOf(array_unique([true, Suit.Hearts, false, null], SORT_REGULAR))],
  "array_unique.lcg": () => [keysOf(array_unique(lcgList(), SORT_REGULAR)), keysOf(array_unique(lcgList(), SORT_NUMERIC))],
  "range.count": () => [range(0, 4.3, 0.1).length, range(0, 8.1, 0.1).length],
  "iterator.valid_int": () => [iterator_to_array(new OneIterator()), iterator_count(new OneIterator())],
  "aggregate.generator": () =>
    iterator_to_array(
      new Aggregate(
        gen(function* () {
          yield keyed("g", 1);
          yield 2;
        }),
      ),
    ),
  "toPhpArray.more": () => [toPhpArray(new ArrayIterator(new PhpArray<PhpKeyInput, unknown>([["k", 1], [0, 2]])))],
  "iterator_to_array.weakmap": () => {
    const weakKey = new stdClass();
    const weak = new WeakMap();
    weak.offsetSet(weakKey, "w");
    return [thrownText(() => iterator_to_array(weak)), iterator_to_array(weak, false), iterator_count(weak)];
  },
};

/** The probe's `$ab` and `$ba`: `stdClass` objects with `a` and `b` set in either order. */
function abBa(): { ab: stdClass; ba: stdClass } {
  const ab = new stdClass();
  ab["a"] = 1;
  ab["b"] = 2;
  const ba = new stdClass();
  ba["b"] = 2;
  ba["a"] = 1;
  return { ab, ba };
}

xaravelTest(
  "XT-runtime-57",
  "keyed, yieldFrom and Generator give PHP's generator protocol: automatic keys after largest_used_integer_key (rising with keyed ints, wrapping past PHP_INT_MAX), delegated keys that never move the counter, yield from over arrays, Traversables and Generators with send and the inner return value, current/key/next/valid/send/rewind/getReturn with PHP's errors, the closed and running refusals, the serialize refusal, and the Iterator and Traversable brands (ESC-14.1-5, DIV-12.18)",
  () => {
    // Auto keys, and keys kept as they are.
    Assert.assertSame('[[0,"a"],[5,"b"],[6,"c"],["x","d"],[7,"e"],[-9,"f"],[8,"g"]]', json(PROBE_CASES["gen.auto_keys"]!()));
    Assert.assertSame('[[-5,"a"],[0,"b"]]', json(PROBE_CASES["gen.negative_then_auto"]!()));
    const wrapped = pairs(gen(function* () {
      yield keyed(INT_MAX, "a");
      yield "b";
    })) as [unknown, unknown][];
    Assert.assertSame(INT_MIN, wrapped[1]![0]);
    const floatKey = new Generator((function* () {
      yield keyed(float(2), "e");
    })());
    Assert.assertTrue(php.isFloat(floatKey.key()), "a float key stays a float");
    Assert.assertSame('[[0,null]]', json(PROBE_CASES["gen.bare_yield"]!()));

    // yield from.
    Assert.assertSame('[[0,1],[5,"x"],[6,"y"],[1,2]]', json(PROBE_CASES["yieldFrom.array"]!()));
    Assert.assertSame('[[[0,1],["r","R"]],[[0,1],["r",null]],[["a",1],["r",null]],[["n",2],["r",null]]]', json(PROBE_CASES["yieldFrom.return"]!()));
    Assert.assertSame('[[[1,2],[2,3],[0,"end"]],false]', json(PROBE_CASES["yieldFrom.started"]!()));
    Assert.assertSame('[[0,1],"S",["got","S","got","S"],["r","done",false,"done"]]', json(PROBE_CASES["yieldFrom.send"]!()));
    const errors = PROBE_CASES["yieldFrom.errors"]!() as unknown[];
    Assert.assertSame('Error: Can use "yield from" only with arrays and Traversables', errors[0]);
    Assert.assertSame("Error: Generator passed to yield from was aborted without proper return and is unable to continue", errors[1]);
    Assert.assertSame("Error: Impossible to yield from the Generator being currently run", errors[3]);
    // Xaravel-only: a bare JS generator object is a delegate as its Generator is.
    Assert.assertSame(
      '[[0,"a"],["k",2],[1,"b"]]',
      json(pairs(gen(function* () {
        yield "a";
        yield* yieldFrom((function* () {
          yield keyed("k", 2);
        })());
        yield "b";
      }))),
    );

    // The methods.
    Assert.assertSame('[2,["S",null],"Exception: Cannot get return value of a generator that hasn\'t returned",[false,null,null,3]]', json(PROBE_CASES["generator.methods"]!()));
    Assert.assertSame("[1,2]", json(PROBE_CASES["generator.fresh_next"]!()));
    Assert.assertSame('[2,["started","v"]]', json(PROBE_CASES["generator.fresh_send"]!()));
    const g = gen(function* () {
      yield 1;
      yield 2;
    });
    g.next();
    assertThrows(Exception, "Cannot rewind a generator that was already run", () => g.rewind());
    g.next();
    assertThrows(Exception, "Cannot traverse an already closed generator", () => g[Symbol.iterator]());
    assertThrows(Exception, "Cannot traverse an already closed generator", () => g.entries());
    assertThrows(Exception, "Cannot traverse an already closed generator", () => g.keys());
    let running: Generator | null = null;
    running = gen(function* () {
      yield 1;
      running!.next();
    });
    running.current();
    assertThrows(PhpError, "Cannot resume an already running generator", () => running!.next());
    assertThrows(Exception, "Serialization of 'Generator' is not allowed", () => phpSerialize(gen(function* () {
      yield 1;
    })));
    assertThrows(PhpError, 'The "Generator" class is reserved for internal use and cannot be manually instantiated', () => new Generator([]));

    // Closed by return or throw.
    Assert.assertSame('[7,null,false,[],"Exception: Cannot traverse an already closed generator"]', json(PROBE_CASES["generator.return_first"]!()));
    const threw = gen(function* () {
      yield 1;
      throw new LogicException("boom");
    });
    Assert.assertSame(1, threw.current());
    assertThrows(LogicException, "boom", () => threw.next());
    Assert.assertFalse(threw.valid());
    Assert.assertNull(threw.current());
    assertThrows(Exception, "Cannot get return value of a generator that hasn't returned", () => threw.getReturn());

    // Iteration and the brands.
    const values = gen(function* () {
      yield keyed("a", 1);
      yield keyed("b", 2);
    });
    Assert.assertTrue(values instanceof Iterator && values instanceof Traversable);
    Assert.assertFalse(values instanceof IteratorAggregate);
    Assert.assertSame("[1,2]", json([...values]));
    Assert.assertSame('["a","b"]', json([...gen(function* () {
      yield keyed("a", 1);
      yield keyed("b", 2);
    }).keys()]));
    Assert.assertSame(Generator, resolveClass("Generator"));
    Assert.assertSame("Generator", fqcn(Generator));

    // Xaravel-only: an in-range bigint key is the int AD-9.3 holds, and a function-typed Traversable is a source.
    const bigKey = gen(function* () {
      yield keyed(5n, "v");
      yield "w";
    });
    Assert.assertSame('[[5,"v"],[6,"w"]]', json(pairs(bigKey)));
    Assert.assertSame(5, gen(function* () {
      yield keyed(5n, "v");
    }).key());
    const traversableFunction = Object.assign(() => null, {
      [Traversable.brand]: true,
      [Iterator.brand]: true,
      i: 0,
      current(): unknown {
        return "f";
      },
      key(): unknown {
        return "fk";
      },
      next(): void {
        traversableFunction.i++;
      },
      rewind(): void {
        traversableFunction.i = 0;
      },
      valid(): boolean {
        return traversableFunction.i < 1;
      },
    });
    Assert.assertSame('[["fk","f"]]', json(pairs(gen(function* () {
      yield* yieldFrom(traversableFunction);
    }))));

    // Xaravel-only: the marker is frozen and reads undefined as null (AD-9).
    const marker = keyed(undefined, undefined);
    Assert.assertTrue(Object.isFrozen(marker));
    Assert.assertNull(marker.key);
    Assert.assertNull(marker.value);
  },
);

xaravelTest(
  "XT-runtime-58",
  "is_scalar, in_array (loose and strict), array_combine, array_filter (no callback, ARRAY_FILTER_USE_KEY, ARRAY_FILTER_USE_BOTH, PHP's argument rule for other modes) and array_unique (SORT_STRING, SORT_REGULAR and SORT_NUMERIC through zend_sort, PHP's kept keys, the enum rule) give PHP 8.5.11's values and errors, and the unported callable and flag forms throw named errors (ESC-14.1-6)",
  () => {
    Assert.assertSame("[1,2,0,1,2]", json(PROBE_CASES["constants"]!()));
    Assert.assertSame("[true,true,true,true,false,false,false]", json(PROBE_CASES["is_scalar"]!()));
    Assert.assertSame("[true,false,true,false,false,false,true,false,true]", json(PROBE_CASES["in_array"]!()));
    assertThrows(PhpTypeError, "in_array(): Argument #2 ($haystack) must be of type array, string given", () => in_array(1, "x"));
    assertThrows(PhpTypeError, "in_array(): Argument #3 ($strict) must be of type bool, array given", () => in_array(1, [1], []));
    // Xaravel-only: an undefined needle and entry read as null (AD-9).
    Assert.assertTrue(in_array(undefined, [null], true));

    Assert.assertSame('{"a":1,"1":4,"1.5":3,"":5,"07":6,"7":7,"2":8}', json(array_combine(["a", 1, 1.5, true, null, "07", "7", float(2)], [1, 2, 3, 4, 5, 6, 7, 8])));
    Assert.assertSame('{"a":2}', json(array_combine(["a", "a"], [1, 2])));
    Assert.assertSame('{"Array":1}', json(array_combine([[]], [1])));
    assertThrows(ValueError, "array_combine(): Argument #1 ($keys) and argument #2 ($values) must have the same number of elements", () => array_combine([1, 2], [1]));
    assertThrows(PhpError, "Object of class stdClass could not be converted to string", () => array_combine([new stdClass()], [1]));
    assertThrows(PhpTypeError, "array_combine(): Argument #1 ($keys) must be of type array, string given", () => array_combine("a", [1]));

    Assert.assertSame('{"0":1,"2":2,"5":"a","8":[0]}', json(array_filter([1, 0, 2, null, "", "a", "0", [], [0]])));
    Assert.assertSame('[[["v"]],[["k"]],[["v","k"]],[["v"]],[["v"]]]', json(PROBE_CASES["array_filter.arguments"]!()));
    assertThrows(PhpTypeError, "array_filter(): Argument #2 ($callback) must be a valid callback or null, no array or string given", () => array_filter([1], 5));
    assertThrows(PhpTypeError, "array_filter(): Argument #3 ($mode) must be of type int, string given", () => array_filter([1], () => true, "x"));
    // Xaravel-only: a bigint mode is its int (AD-9.3), and an object with `__invoke` is callable, as in PHP.
    Assert.assertSame('{"k":"v"}', json(array_filter({ k: "v", j: "w" }, (v: unknown, k: unknown) => v === "v" && k === "k", 1n)));
    const invoked: unknown[][] = [];
    const invokable = {
      __invoke(...args: unknown[]): boolean {
        invoked.push(args);
        return args[0] === "v";
      },
    };
    Assert.assertSame('{"k":"v"}', json(array_filter({ k: "v", j: "w" }, new (class Invokable {
      __invoke(...args: unknown[]): boolean {
        return invokable.__invoke(...args);
      }
    })())));
    Assert.assertSame('[["v"],["w"]]', json(invoked));
    // Xaravel-only: PHP callable strings and arrays are not ported.
    assertThrows(PhpTypeError, "array_filter(): Argument #2 ($callback) is a PHP callable string, which Xaravel does not port; pass a function", () => array_filter([1], "strlen"));
    assertThrows(PhpTypeError, "array_filter(): Argument #2 ($callback) is a PHP callable array, which Xaravel does not port; pass a function", () => array_filter([1], ["Str", "upper"]));

    const unique = PROBE_CASES["array_unique"]!() as unknown[];
    Assert.assertSame("[0,2,3]", json(unique[0]));
    Assert.assertSame("[0,2,3,6]", json(unique[1]));
    Assert.assertSame('{"0":"10","3":"a"}', json(unique[3]));
    Assert.assertSame("[[1]]", json(unique[4]));
    Assert.assertSame("[[0,2],[0,1],[0,1]]", json(PROBE_CASES["array_unique.enum"]!()));
    assertThrows(PhpError, "Object of class stdClass could not be converted to string", () => array_unique([1, new stdClass()]));
    // Xaravel-only: the comparators the runtime does not port.
    assertThrows(ValueError, "array_unique(): Argument #2 ($flags) SORT_LOCALE_STRING is not ported by Xaravel", () => array_unique([1, 2], 5));
    assertThrows(ValueError, "array_unique(): Argument #2 ($flags) SORT_NATURAL is not ported by Xaravel", () => array_unique([1, 2], 6));
    assertThrows(ValueError, "array_unique(): Argument #2 ($flags) SORT_NATURAL | SORT_FLAG_CASE is not ported by Xaravel", () => array_unique([1, 2], 14));
    assertThrows(ValueError, "array_unique(): Argument #2 ($flags) SORT_STRING | SORT_FLAG_CASE is not ported by Xaravel", () => array_unique([1, 2], 10));
    assertThrows(ValueError, "array_unique(): Argument #2 ($flags) SORT_LOCALE_STRING | SORT_FLAG_CASE is not ported by Xaravel", () => array_unique([1, 2], 13));
    // PHP compares no value of a one-element array, so no flag is refused there.
    Assert.assertSame("[1]", json(array_unique([1], 6)));
  },
);

xaravelTest(
  "XT-runtime-59",
  "range gives PHP 8.5.11's arrays for ints, descending and negative steps, floats (marked float() when integral), numeric and digit strings, characters, mixed inputs, '' / null / true, and PHP's ValueError and TypeError messages, the two size-limit messages included; a character range with a byte of 0x80 or more throws a JS TypeError (ESC-14.1-6)",
  () => {
    Assert.assertSame("[1,2,3,4,5]", json(range(1, 5)));
    Assert.assertSame("[10,7,4,1]", json(range(10, 1, -3)));
    Assert.assertSame("[0.0,0.25,0.5,0.75,1.0]", json(range(0, 1, 0.25)));
    Assert.assertTrue(php.isFloat(range(float(1), 3)[0]), "an integral float element is marked");
    Assert.assertSame('["1","2","3"]', json(range("1", "3")));
    Assert.assertSame('["a","c","e"]', json(range("a", "e", 2)));
    Assert.assertSame("[0,1]", json(range("A", 1)));
    Assert.assertSame("[0,1,2]", json(range("", 2)));
    Assert.assertSame("[0,1,2]", json(range(null, 2)));
    Assert.assertSame("[1,2,3]", json(range(true, 3)));
    assertThrows(ValueError, "range(): Argument #3 ($step) cannot be 0", () => range(1, 2, 0));
    assertThrows(ValueError, "range(): Argument #3 ($step) must be greater than 0 for increasing ranges", () => range(1, 5, -1));
    assertThrows(ValueError, "range(): Argument #1 ($start) must be a finite number, INF provided", () => range(Infinity, 1));
    assertThrows(PhpTypeError, "range(): Argument #1 ($start) must be of type string|int|float, array given", () => range([], 1));
    assertThrows(PhpTypeError, "range(): Argument #3 ($step) must be of type int|float, string given", () => range(1, 2, "x"));
    assertThrows(
      ValueError,
      "The supplied range exceeds the maximum array size by 18446744072635809792 elements: start=-9223372036854775808, end=9223372036854775807, step=1. Calculated size: 18446744073709551615. Maximum size: 1073741824.",
      () => range(INT_MIN, INT_MAX),
    );
    assertThrows(
      ValueError,
      "The supplied range exceeds the maximum array size by 259591510.3 elements: start=0.0, end=2000000000.0, step=1.5. Max size: 1073741824",
      () => range(0, float(2e9), 1.5),
    );
    // Xaravel-only: a byte JS cannot hold as a one-byte string, and a lone surrogate.
    assertJsTypeError("0xC3", () => range("é", "a"));
    assertJsTypeError("0x80", () => range("a", "\u0080"));
    assertJsTypeError("lone surrogate", () => range("\ud800", "a"));
    // Xaravel-only: an omitted step is 1, as PHP's default.
    Assert.assertSame("[1,2]", json(range(1, 2, undefined)));
  },
);

xaravelTest(
  "XT-runtime-60",
  "iterator_to_array (preserve_keys on and off, PHP's key normalisation and errors), iterator_count, str_starts_with and substr (UTF-8 bytes, PHP's coercions and messages) and toPhpArray (PHP's (array) cast as a PhpArray, mangled protected and private names) give PHP 8.5.11's values; a fresh process exports every new name from the root and @xaravel/runtime/php, resolves Generator, and keeps the 24-entry classes map (ESC-14.1-6)",
  () => {
    Assert.assertSame('{"a":2,"1":5,"":4}', json(iterator_to_array(keyedSource())));
    Assert.assertSame("[1,2,3,4,5]", json(iterator_to_array(keyedSource(), false)));
    Assert.assertSame('{"x":1,"y":2}', json(iterator_to_array({ x: 1, y: 2 })));
    Assert.assertSame("[1,2]", json(iterator_to_array({ x: 1, y: 2 }, false)));
    Assert.assertSame('{"k":1,"0":2}', json(iterator_to_array(new ArrayObject(new PhpArray<PhpKeyInput, unknown>([["k", 1], [0, 2]])))));
    Assert.assertSame("[5,3,2]", json([iterator_count(keyedSource()), iterator_count([1, 2, 3]), iterator_count(new ArrayObject([1, 2]))]));
    assertThrows(PhpTypeError, "Cannot access offset of type array on array", () => iterator_to_array((function* () {
      yield keyed([], 1);
    })()));
    assertThrows(PhpTypeError, "Cannot access offset of type stdClass on array", () => iterator_to_array((function* () {
      yield keyed(new stdClass(), 1);
    })()));
    assertThrows(PhpTypeError, "iterator_to_array(): Argument #1 ($iterator) must be of type Traversable|array, int given", () => iterator_to_array(5));
    assertThrows(PhpTypeError, "iterator_count(): Argument #1 ($iterator) must be of type Traversable|array, int given", () => iterator_count(5));
    // Xaravel-only: a bigint beyond int64 is the float PHP makes of it.
    assertThrows(PhpTypeError, "iterator_count(): Argument #1 ($iterator) must be of type Traversable|array, float given", () => iterator_count(2n ** 70n));
    // Xaravel-only: an aggregate cycle, which PHP runs into a stack overflow, is refused with the self-return message.
    const first = new CycleAggregate();
    const second = new CycleAggregate();
    first.other = second;
    second.other = first;
    assertThrows(Exception, `Objects returned by ${NS}\\CycleAggregate::getIterator() must be traversable or implement interface Iterator`, () => iterator_to_array(first));
    const withList = new stdClass();
    withList["list"] = [1];
    (toPhpArray(withList).get("list") as unknown[]).push(2);
    Assert.assertSame(1, (withList["list"] as unknown[]).length, "a stdClass's array property is copied");

    Assert.assertSame("[true,true,true,true,true]", json([str_starts_with("hello", "he"), str_starts_with("hello", ""), str_starts_with(123, 1), str_starts_with("1", true), str_starts_with("x", null)]));
    assertThrows(PhpTypeError, "str_starts_with(): Argument #1 ($haystack) must be of type string, array given", () => str_starts_with([], "a"));
    Assert.assertSame('["bcd","def","","ab","bcde","","abcdef"]', json([substr("abcdef", 1, 3), substr("abcdef", -3), substr("abcdef", 9), substr("abcdef", -9, 2), substr("abcdef", 1, -1), substr("abcdef", 3, -5), substr("abcdef", 0, null)]));
    Assert.assertSame("é", substr("héllo", 1, 2));
    Assert.assertSame("23", substr(12345, 1, 2));
    assertThrows(PhpTypeError, "substr(): Argument #2 ($offset) must be of type int, string given", () => substr("abc", "1x"));
    assertThrows(PhpTypeError, "substr(): Argument #2 ($offset) must be of type int, float given", () => substr("abc", NaN));
    assertThrows(PhpTypeError, "substr(): Argument #3 ($length) must be of type ?int, string given", () => substr("abc", 1, "x"));
    // Xaravel-only: a result that splits a UTF-8 sequence, and a lone surrogate, have no JS string.
    assertJsTypeError("splits a UTF-8 sequence", () => substr("héllo", 1, 1));
    assertJsTypeError("lone surrogate", () => substr("a\ud800", 0, 1));
    assertJsTypeError("lone surrogate", () => str_starts_with("\ud800", "a"));
    Assert.assertSame("﻿a", substr("﻿ab", 0, 4), "a leading BOM is kept");

    // toPhpArray.
    const cast = toPhpArray(new PhpArray([[3, 1]]));
    Assert.assertTrue(cast instanceof PhpArray);
    Assert.assertSame("[3]", json([...cast.keys()]));
    const props = new stdClass();
    props["5"] = "five";
    props["x"] = "y";
    Assert.assertSame(5, [...toPhpArray(props).keys()][0], "a numeric property name is an int key");
    Assert.assertSame('["a","\\u0000*\\u0000b","\\u0000XaravelFixture\\\\PhpFunctions\\\\Visibility\\u0000c"]', json([...toPhpArray(new Visibility()).keys()]));
    const nested = { list: [1] };
    const copy = toPhpArray(nested);
    (copy.get("list") as unknown[]).push(2);
    Assert.assertSame(1, nested.list.length, "a nested array is copied");
    Assert.assertSame(0, toPhpArray(undefined).size, "undefined reads as null");

    // Exports and the class lookup, in fresh processes.
    for (const name of NEW_EXPORTS) {
      Assert.assertSame((php as Record<string, unknown>)[name], (root as Record<string, unknown>)[name], name);
      Assert.assertNotNull((php as Record<string, unknown>)[name] ?? null, name);
    }
    for (const entry of ["src/index.ts", "src/php/index.ts"]) {
      const run = child(
        `const m = await import(${JSON.stringify(resolve(PACKAGE_DIR, entry))}); const { resolveClass } = await import("@xaravel/runtime/registry"); const names = ${JSON.stringify(NEW_EXPORTS)}; console.log(names.filter((n) => m[n] === undefined).join(",") || "all", resolveClass("Generator") === m.Generator, Object.keys(globalThis[Symbol.for("xaravel.php.classes")]).length);`,
      );
      Assert.assertSame(0, run.code, `${entry}: ${run.err}`);
      Assert.assertSame("all true 24", run.out, entry);
    }
  },
  60_000,
);

xaravelTest(
  "XT-runtime-61",
  "every PHP 8.5.11 value recorded in php-functions.probe.txt (from php-functions.probe.php: the generator keys and protocol, yield from, is_scalar, in_array, array_combine, array_filter, array_unique, range, iterator_to_array, iterator_count, str_starts_with, substr and (array), and the exception class and message of each recorded case) is what the runtime gives for the same case (ESC-14.1-5, ESC-14.1-6)",
  () => {
    const recorded = readFileSync(resolve(import.meta.dir, "php-functions.probe.txt"), "utf8");
    const labels = new Set<string>();
    for (const line of recorded.split("\n")) {
      if (line === "") {
        continue;
      }
      const tab = line.indexOf("\t");
      const label = line.slice(0, tab);
      labels.add(label);
      const compute = PROBE_CASES[label];
      Assert.assertNotNull(compute ?? null, `no runtime case for probe label ${label}`);
      Assert.assertSame(line.slice(tab + 1), json((compute as () => unknown)()), label);
    }
    Assert.assertSame(Object.keys(PROBE_CASES).sort().join(","), [...labels].sort().join(","));
  },
);
