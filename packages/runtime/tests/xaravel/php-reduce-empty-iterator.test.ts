// Xaravel Tests for action item epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator
// (decisions/ESC-15.2-6.md, approved by the monitor under decisions/MAINT-2026-10-26-runtime-builtins.md): the three
// PHP builtins vlucas/phpdotenv v5.7.0 and phpoption 1.10.0 use that the runtime lacked. XT-runtime-143: array_reduce.
// XT-runtime-144: EmptyIterator. XT-runtime-145: DIRECTORY_SEPARATOR, array_reduce's registry entry, and the root and
// subpath exports. None needs an Oracle fixture: each expected value is what PHP 8.5.11 gives for the same case, probed
// with the host's `php`. `php-reduce-empty-iterator.probe.php` prints each label as `<label>\t<json_encode(value)>` and
// `php-reduce-empty-iterator.probe.txt` is its output (`php -d error_reporting=0 php-reduce-empty-iterator.probe.php >
// php-reduce-empty-iterator.probe.txt`). Every recorded label is computed with the runtime and compared. Not recorded:
// the assertions marked `Xaravel-only`, which have no PHP counterpart (JS iteration, `fqcn`, export identity).
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const NS = "XaravelFixture\\PhpReduceEmptyIterator";

/** Each label's recorded JSON. */
const evidence = new Map(
  readFileSync(`${import.meta.dir}/php-reduce-empty-iterator.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const [label, value] = line.split("\t") as [string, string];
    return [label, value] as const;
  }),
);

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** The probe's `attempt`: the result, or "<class>: <message>" for a throw. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    let name: string;
    try {
      name = fqcn(error as object);
    } catch {
      name = `JS ${(error as Error).name}`;
    }
    return `${name}: ${(error as Error).message}`;
  }
}

/** A PHP array literal with keys in the order given. */
function arr(...entries: [p.PhpKeyInput, unknown][]): p.PhpArray {
  return new p.PhpArray(entries);
}

/** The probe's `Reducer`: a static and an instance method. */
class Reducer {
  readonly #glue: string;

  constructor(glue: string = "-") {
    this.#glue = glue;
  }

  static add(carry: unknown, item: unknown): unknown {
    return (carry as number) + (item as number);
  }

  join(carry: unknown, item: unknown): unknown {
    return `${p.toPhpString(carry)}${this.#glue}${p.toPhpString(item)}`;
  }
}

/** The probe's `Pairs`: an invokable object. */
class Pairs {
  __invoke(carry: unknown, item: unknown): unknown {
    return [carry, item];
  }
}

registerClass(`${NS}\\Reducer`, Reducer);
registerClass(`${NS}\\Pairs`, Pairs);

/** The probe's `SubEmpty`: EmptyIterator is not final. */
class SubEmpty extends p.EmptyIterator {}

registerClass(`${NS}\\SubEmpty`, SubEmpty);

const sum = (carry: unknown, item: unknown): unknown => (carry as number) + (item as number);

/** Each probe label's runtime computation. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  reduce: () => [
    p.array_reduce([1, 2, 3], sum, 10),
    p.array_reduce([1, 2, 3], sum),
    p.array_reduce([], sum),
    p.array_reduce([], sum, "x"),
    p.array_reduce([], sum, null),
    p.array_reduce({ a: "x" }, (carry: unknown) => carry, [1, 2]),
    p.array_reduce([1, 2], () => null, 5),
    p.array_reduce(arr(["b", "q"], ["a", "r"]), (carry: unknown, item: unknown) => `${p.toPhpString(carry)}${p.toPhpString(item)}`, ""),
  ],
  "reduce.order": () => {
    const log: unknown[] = [];
    const result = p.array_reduce(
      arr(["b", 1], ["a", 2], [5, 3], [0, 4]),
      (...args: unknown[]) => {
        log.push(args);
        return log.length;
      },
      "start",
    );
    return [result, log];
  },
  "reduce.callables": () => [
    p.array_reduce([3, 7, 2], "max", 0),
    p.array_reduce([3, 7, 2], "max"),
    p.array_reduce([3, 7, 2], "\\MAX", 0),
    p.array_reduce([1, 2, 3], [Reducer, "add"], 10),
    p.array_reduce([1, 2, 3], `${NS}\\Reducer::add`, 100),
    p.array_reduce(["a", "b"], [new Reducer("+"), "join"], "s"),
    p.array_reduce([1, 2], new Pairs(), 0),
    p.array_reduce([1, 2, 3], sum, 0),
    p.array_reduce(["a", "b"], "strcmp", "a"),
  ],
  "reduce.bad_callback": () => [
    attempt(() => p.array_reduce([1], null)),
    attempt(() => p.array_reduce([1], "nope")),
    attempt(() => p.array_reduce([1], [1])),
    attempt(() => p.array_reduce([], "nope")),
  ],
  "reduce.bad_array": () => [
    attempt(() => p.array_reduce("x", sum)),
    attempt(() => p.array_reduce(null, sum)),
    attempt(() => p.array_reduce(new p.stdClass(), sum)),
    attempt(() => p.array_reduce(1, sum)),
    attempt(() => p.array_reduce("x", "nope")),
    attempt(() => p.array_reduce(new p.ArrayIterator([1]), sum)),
    attempt(() => p.array_reduce(new p.EmptyIterator(), sum)),
  ],
  "reduce.reflection": () => {
    const fn = PHP_FUNCTIONS["array_reduce"]!;
    return [fn.required, fn.total, fn.variadic];
  },
  "reduce.counts": () => {
    const call = p.phpFunction("array_reduce")!;
    return [attempt(() => call([1])), attempt(() => call()), attempt(() => call([1], sum, 0, 1)), p.function_exists("array_reduce")];
  },
  empty: () => {
    const e = new p.EmptyIterator();
    let seen = 0;
    for (const _entry of e.entries()) {
      seen++;
    }
    return [
      e.valid(),
      e.next() ?? null,
      e.rewind() ?? null,
      e.valid(),
      p.iterator_to_array(e),
      p.iterator_to_array(e, false),
      p.iterator_count(e),
      p.jsonEncode(e),
      p.toPhpArray(e),
      p.looseEquals(e, new p.EmptyIterator()),
      p.phpSerialize(e),
      fqcn(p.phpUnserialize(p.phpSerialize(e)) as object),
      e instanceof p.Iterator,
      e instanceof p.Traversable,
      p.hasBrand(e, Symbol.for("Countable")),
      e instanceof p.ArrayAccess,
      seen,
      fqcn(e),
      p.class_exists("EmptyIterator"),
      new SubEmpty() instanceof p.EmptyIterator,
      new SubEmpty().valid(),
      attempt(() => new SubEmpty().key()),
    ];
  },
  "empty.access": () => {
    const e = new p.EmptyIterator();
    return [attempt(() => e.current()), attempt(() => e.key())];
  },
  separator: () => p.DIRECTORY_SEPARATOR,
};

/** Each label computed with the runtime and compared with PHP's recorded value. */
function assertProbeLabels(labels: readonly string[]): void {
  const differences: string[] = [];
  for (const label of labels) {
    const recorded = evidence.get(label);
    Assert.assertNotNull(recorded ?? null, `missing evidence: ${label}`);
    const computed = json(attempt(PROBE_CASES[label]!));
    if (computed !== recorded) {
      differences.push(`${label}\n  PHP:     ${recorded}\n  runtime: ${computed}`);
    }
  }
  Assert.assertSame("", differences.join("\n"));
}

xaravelTest(
  "XT-runtime-143",
  "array_reduce folds the values in insertion order with PHP 8.5.11's results: the carry starts at the initial value (null by default, returned for []), the callback gets the carry and the value only, every PHP callable form resolves through the shared resolver (a registry name, a leading backslash and any case, [class, method], 'Class::method', [object, method], an invokable object, a closure), and a non-array or a callback PHP refuses throws PHP's TypeError (ESC-15.2-6, DIV-9.13)",
  () => {
    assertProbeLabels(["reduce", "reduce.order", "reduce.callables", "reduce.bad_callback", "reduce.bad_array"]);
    // Xaravel-only: an omitted initial value and an undefined one read as null (AD-9).
    Assert.assertNull(p.array_reduce([], sum, undefined));
    Assert.assertNull(p.array_reduce([1], () => undefined, 0));
  },
);

xaravelTest(
  "XT-runtime-144",
  "EmptyIterator is PHP 8.5.11's: valid() false, next() and rewind() null, nothing to iterator_to_array or iterator_count, {} as JSON, [] as an array, == another, serialized as O:13:\"EmptyIterator\":0:{} and back, an Iterator and Traversable but no Countable or ArrayAccess, not final (a subclass is one), registered as EmptyIterator, and current() and key() throw PHP's BadMethodCallException (ESC-15.2-6)",
  () => {
    assertProbeLabels(["empty", "empty.access"]);
    // Xaravel-only: the class registry and JS iteration.
    const e = new p.EmptyIterator();
    Assert.assertSame("EmptyIterator", fqcn(e));
    Assert.assertSame("EmptyIterator", fqcn(p.EmptyIterator));
    Assert.assertTrue(p.class_exists("EmptyIterator"));
    Assert.assertTrue(p.class_exists("\\emptyiterator"));
    Assert.assertTrue(p.hasBrand(e, p.Iterator));
    Assert.assertTrue(p.hasBrand(e, p.Traversable));
    Assert.assertSame("[]", json([...e]));
    Assert.assertSame("[]", json([...e.entries()]));
    Assert.assertSame("[]", json([...e.keys()]));
    Assert.assertTrue(p.is_iterable(e));
    Assert.assertSame(`${NS}\\SubEmpty`, fqcn(new SubEmpty()));
  },
);

xaravelTest(
  "XT-runtime-145",
  "DIRECTORY_SEPARATOR is \"/\" as on the Oracle image's Linux; array_reduce is a registry entry with PHP's ReflectionFunction counts (2 required, 3 total) and ArgumentCountErrors, and function_exists finds it; DIRECTORY_SEPARATOR, array_reduce and EmptyIterator are exported from the root and @xaravel/runtime/php as the same objects (ESC-15.2-6)",
  () => {
    assertProbeLabels(["separator", "reduce.reflection", "reduce.counts"]);
    // Every recorded label is computed.
    for (const label of evidence.keys()) {
      Assert.assertNotNull(PROBE_CASES[label] ?? null, label);
    }
    for (const name of ["DIRECTORY_SEPARATOR", "array_reduce", "EmptyIterator"]) {
      const fromPhp = (p as Record<string, unknown>)[name];
      Assert.assertNotNull(fromPhp ?? null, name);
      Assert.assertSame(fromPhp, (root as Record<string, unknown>)[name], name);
    }
    Assert.assertSame(p.array_reduce, PHP_FUNCTIONS["array_reduce"]!.fn);
    Assert.assertTrue(p.is_callable("array_reduce"));
    // Xaravel-only: a constant and a class are never resolved as functions.
    Assert.assertNull(p.phpFunction("DIRECTORY_SEPARATOR"));
    Assert.assertNull(p.phpFunction("EmptyIterator"));
  },
);
