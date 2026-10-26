// Xaravel Tests for action item epic-14-item-6-runtime-sort-string-functions (decisions/ESC-14.2-4.md, option 1,
// approved under decisions/MAINT-2026-10-26-runtime-builtins.md). XT-runtime-74: `is_null` and the string comparisons
// `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp` and `strcoll`. XT-runtime-75: the by-reference `uasort`.
// XT-runtime-76: every probe label recomputed, and the fresh-process export check. None needs an Oracle fixture: each
// expected value and message is what PHP 8.5.11 gives for the same construct, probed with the host's `php`:
// `php-sort-string-functions.probe.php` prints each PHP-derived value as `<label>\t<json>`
// (`JSON_PRESERVE_ZERO_FRACTION`), `php-sort-string-functions.probe.txt` is its output under PHP 8.5.11
// (`php -d error_reporting=0 php-sort-string-functions.probe.php > php-sort-string-functions.probe.txt`), and
// XT-runtime-76 computes every recorded label with the runtime and compares it with PHP's value. Not recorded: the
// assertions marked `Xaravel-only`, which have no PHP counterpart (`undefined`, a `Ref` and the write-back, the
// unported callable forms, the identity of a thrown JS value, and a string JS cannot hold).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  array_key_last,
  arrayEntries,
  arsort,
  asort,
  Error as PhpError,
  float,
  is_null,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  PhpArray,
  Ref,
  RuntimeException,
  SORT_LOCALE_STRING,
  spaceship,
  strcasecmp,
  strcmp,
  strcoll,
  strnatcasecmp,
  strnatcmp,
  uasort,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpSortStringFunctions";

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = ["is_null", "strcasecmp", "strcmp", "strcoll", "strnatcasecmp", "strnatcmp", "uasort"] as const;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** `"<class>: <message>"` of what `fn` throws (a PHP throwable), else its result; the probe's `attempt`. */
function attempt(fn: () => unknown): unknown {
  let result: unknown;
  try {
    result = fn();
  } catch (error) {
    const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
    return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
  }
  return result;
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

/** Runs `code` as a module in a fresh `bun` process from the package directory. */
function child(code: string): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: inherited });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

/** A PHP array with the given entries, in order. */
function phpArray(...entries: [string | number, unknown][]): PhpArray {
  return new PhpArray(entries);
}

/** `$a[] = 'next'` on a copy of the PHP array `value`, as PHP's next free index places it. */
function appendNext(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...(value as unknown[]), "next"];
  }
  const copy = value instanceof PhpArray ? value.copy() : new PhpArray(arrayEntries(value as object));
  copy.push("next");
  return copy;
}

/** The probe's `Text`, with a `__toString` port. */
class Text {
  toString(): string {
    return "text";
  }
}

registerClass(`${NS}\\Text`, Text);

/** The probe's `NoText`, without one. */
class NoText {}

registerClass(`${NS}\\NoText`, NoText);

/** An invokable object: a descending comparator. */
class Descending {
  __invoke(a: unknown, b: unknown): number {
    return spaceship(b, a);
  }
}

/** `[uasort's result, the sorted array, the next free key]` for `a` and `callback`; the probe's `usorted`. */
function usorted(a: unknown, callback: (a: unknown, b: unknown) => unknown): unknown[] {
  const ref = new Ref<unknown>(a);
  const result = uasort(ref, callback);
  return [result, ref.value, array_key_last(appendNext(ref.value))];
}

/** `[the sorted array, the callback's argument pairs]` of `uasort` with `result`; the probe's `$calls`. */
function calls(a: unknown, result: (x: unknown, y: unknown) => unknown): unknown[] {
  const seen: unknown[] = [];
  const ref = new Ref<unknown>(a);
  uasort(ref, (x: unknown, y: unknown) => {
    seen.push([x, y]);
    return result(x, y);
  });
  return [ref.value, seen];
}

/** `[the caught message, the array after, the number of calls]` of a callback throwing on call `at`; `$throwing`. */
function throwing(a: unknown, at: number): unknown[] {
  let count = 0;
  let caught: unknown = null;
  const ref = new Ref<unknown>(a);
  try {
    uasort(ref, (x: unknown, y: unknown) => {
      if (++count === at) {
        throw new RuntimeException(`call ${count}`);
      }
      return spaceship(x, y);
    });
  } catch (error) {
    Assert.assertTrue(error instanceof RuntimeException);
    caught = (error as RuntimeException).getMessage();
  }
  return [caught, ref.value, count];
}

const spaceshipCallback = (a: unknown, b: unknown): unknown => spaceship(a, b);

function big(): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < 40; i++) {
    out[`k${i}`] = (i * 7) % 13;
  }
  return out;
}

const MIXED = (): PhpArray => phpArray(["x", 3], ["y", 1], [5, 2]);
const TIES = { a: 2, b: 1, c: 2, d: 1, e: 3, f: 1 };
const THREE = { p: 3, q: 1, r: 2, s: 1 };
const FOUR = { a: 4, b: 2, c: 3, d: 1 };

/** Each probe label's value, computed with the runtime. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  is_null: () => [is_null(null), is_null(0), is_null(""), is_null([]), is_null(false), is_null(float(Number.NaN)), is_null("null"), is_null(new Text())],
  strcmp: () => [
    strcmp("a", "c"),
    strcmp("ab", "a"),
    strcmp("a", "ab"),
    strcmp("a", 1),
    strcmp(null, ""),
    strcmp(1.5, "1.5"),
    strcmp("é", "e"),
    strcmp("", ""),
    strcmp("abc", "abd"),
    strcmp("z", "A"),
    strcmp(true, "1"),
    strcmp(false, ""),
    strcmp(new Text(), "text"),
    strcmp("a\0b", "a\0c"),
    strcmp("a\0", "a"),
    strcmp("abc", "abcdef"),
    strcmp(10, 9),
  ],
  strcasecmp: () => [
    strcasecmp("A", "c"),
    strcasecmp("HELLO", "hello"),
    strcasecmp("É", "é"),
    strcasecmp("a", "AB"),
    strcasecmp("[", "a"),
    strcasecmp("[", "A"),
    strcasecmp("Z", "a"),
    strcasecmp("ab", "A"),
    strcasecmp(null, ""),
    strcasecmp(1.5, "1.5"),
    strcasecmp("é", "E"),
    strcasecmp(new Text(), "TEXT"),
  ],
  strnatcmp: () => [
    strnatcmp("img12", "img10"),
    strnatcmp("a2", "a10"),
    strnatcmp("A2", "a10"),
    strnatcmp("x01", "x1"),
    strnatcmp("", "a"),
    strnatcmp("a", ""),
    strnatcmp("", ""),
    strnatcmp("1.010", "1.01"),
    strnatcmp(" 5", "5"),
    strnatcmp("0001", "1"),
    strnatcmp("abc", "ABC"),
    strnatcmp("img 2", "img2"),
    strnatcmp(10, 9),
    strnatcmp(null, "a"),
  ],
  strnatcasecmp: () => [
    strnatcasecmp("A2", "a10"),
    strnatcasecmp("IMG12", "img10"),
    strnatcasecmp("abc", "ABC"),
    strnatcasecmp("x01", "x1"),
    strnatcasecmp("", "a"),
    strnatcasecmp("[", "a"),
    strnatcasecmp("É", "é"),
  ],
  strcoll: () => [
    strcoll("a", "c"),
    strcoll("ab", "a"),
    strcoll("a", "ab"),
    strcoll("a\0b", "a\0c"),
    strcoll("é", "e"),
    strcoll("", ""),
    strcoll("A", "a"),
    strcoll("a\0", "ab"),
    strcoll(1, "10"),
    strcoll(null, "x"),
  ],
  "strings.errors": () => [
    attempt(() => strcmp([], "a")),
    attempt(() => strcmp("a", [])),
    attempt(() => strcasecmp([], "a")),
    attempt(() => strcasecmp("a", new NoText())),
    attempt(() => strnatcmp([1], "a")),
    attempt(() => strnatcmp("a", new NoText())),
    attempt(() => strnatcasecmp([], "a")),
    attempt(() => strnatcasecmp("a", [])),
    attempt(() => strcoll([], "a")),
    attempt(() => strcoll("a", new NoText())),
  ],
  uasort: () => [
    usorted(MIXED(), spaceshipCallback),
    usorted(MIXED(), (a, b) => spaceship(b, a)),
    usorted(TIES, spaceshipCallback),
    usorted(TIES, () => 0),
    usorted([3, 1, 2], spaceshipCallback),
    usorted(phpArray([1, "b"], [0, "a"]), spaceshipCallback),
    usorted({ only: 1 }, spaceshipCallback),
    usorted([], spaceshipCallback),
    usorted({ b: "img12", a: "img10", c: "IMG2" }, strnatcasecmp),
    usorted(big(), spaceshipCallback),
  ],
  "uasort.results": () => [
    usorted(THREE, (a, b) => float(spaceship(a, b) * 0.5)),
    usorted(THREE, (a, b) => float(spaceship(a, b) * 2.5)),
    usorted(THREE, (a, b) => String(spaceship(a, b))),
    usorted(THREE, (a, b) => spaceship(a, b) * -7),
    usorted(THREE, (a, b) => `${spaceship(a, b)}abc`),
    usorted(THREE, () => true),
    usorted(THREE, () => false),
    usorted(THREE, () => null),
    usorted(THREE, (a, b) => (a as number) > (b as number)),
    usorted(THREE, (a, b) => (a as number) < (b as number)),
    usorted(THREE, (a) => [a]),
    usorted(THREE, (a, b) => float(spaceship(a, b) * Number.POSITIVE_INFINITY)),
    usorted(THREE, (a, b) => float(spaceship(a, b) * 1e20)),
  ],
  "uasort.calls": () => [
    calls(FOUR, spaceshipCallback),
    calls(FOUR, (x, y) => (x as number) > (y as number)),
    calls(FOUR, (x, y) => (x as number) < (y as number)),
    calls({ a: 1, b: 1, c: 0 }, () => false),
    calls({ a: 1 }, spaceshipCallback),
    calls([], spaceshipCallback),
  ],
  "uasort.throw": () => [
    throwing({ a: 5, b: 4, c: 3, d: 2, e: 1 }, 2),
    throwing({ a: 5, b: 4, c: 3, d: 2, e: 1, f: 0, g: 9, h: 7 }, 4),
    throwing(big(), 30),
    throwing({ a: 2, b: 1 }, 1),
  ],
  "uasort.next": () => {
    const kept = phpArray([5, 3], [1, 1], [9, 2]);
    kept.delete(9);
    const list = phpArray([1, "b"], [0, "a"], [2, "c"]);
    list.delete(2);
    return [usorted(kept, spaceshipCallback), usorted(list, spaceshipCallback)];
  },
  "uasort.errors": () => [
    attempt(() => uasort(new Ref<unknown>(1), () => 0)),
    attempt(() => uasort(new Ref<unknown>("abc"), () => 0)),
    attempt(() => uasort(new Ref<unknown>(null), () => 0)),
    attempt(() => uasort(new Ref<unknown>([1, 2]), null)),
    attempt(() => uasort(new Ref<unknown>([]), null)),
    attempt(() => uasort(new Ref<unknown>([1, 2]), 1)),
    attempt(() => uasort(new Ref<unknown>(1), null)),
  ],
};

/** `label`'s recorded PHP value. */
function recorded(label: string): string {
  const line = readFileSync(resolve(import.meta.dir, "php-sort-string-functions.probe.txt"), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${label}\t`));
  if (line === undefined) {
    throw new globalThis.Error(`no probe label ${label}`);
  }
  return line.slice(label.length + 1);
}

/** Asserts each of `labels` against the probe record. */
function assertProbed(...labels: string[]): void {
  for (const label of labels) {
    Assert.assertSame(recorded(label), json((PROBE_CASES[label] as () => unknown)()), label);
  }
}

xaravelTest(
  "XT-runtime-74",
  "is_null is true for null and undefined only; strcmp and strcasecmp give PHP's byte differences, strnatcmp and strnatcasecmp PHP's natural order, and strcoll the C locale's strcmp, with PHP's string parameter coercion and TypeError messages (ESC-14.2-4)",
  () => {
    assertProbed("is_null", "strcmp", "strcasecmp", "strnatcmp", "strnatcasecmp", "strcoll", "strings.errors");

    // Xaravel-only: undefined reads as null (AD-9); a class constructor is no null.
    Assert.assertTrue(is_null(undefined));
    Assert.assertFalse(is_null(Text));
    Assert.assertFalse(is_null(Number.NaN));
    // Xaravel-only: a string holding a lone surrogate, which has no UTF-8 form.
    for (const [name, fn] of [
      ["strcmp", strcmp],
      ["strcasecmp", strcasecmp],
      ["strnatcmp", strnatcmp],
      ["strnatcasecmp", strnatcasecmp],
      ["strcoll", strcoll],
    ] as const) {
      assertJsTypeError(`${name}(): the string holds a lone surrogate, which has no UTF-8 form`, () => fn("a", "\ud800"));
      assertJsTypeError(`${name}(): the string holds a lone surrogate, which has no UTF-8 form`, () => fn("\udc00", "a"));
    }
    // The C locale's strcoll keeps asort's SORT_LOCALE_STRING order: a prefix sorts first, a NUL ends the string.
    const ref = new Ref<unknown>({ a: "ab", b: "a", c: "a\0z", d: "" });
    asort(ref, SORT_LOCALE_STRING);
    Assert.assertSame('{"d":"","b":"a","c":"a\\u0000z","a":"ab"}', json(ref.value));
    arsort(ref, SORT_LOCALE_STRING);
    Assert.assertSame('{"a":"ab","b":"a","c":"a\\u0000z","d":""}', json(ref.value));
  },
);

xaravelTest(
  "XT-runtime-75",
  "uasort sorts a Ref's array by value with the callback, keys kept and ties in their order, reads the callback's result as PHP's (int) and its sign (a false result retried swapped), calls it as PHP's zend_sort does, keeps a PhpArray's next free index, and after a throw calls it no more, writes the partly sorted array back and rethrows, with PHP's TypeErrors (ESC-14.2-4)",
  () => {
    assertProbed("uasort", "uasort.results", "uasort.calls", "uasort.throw", "uasort.next", "uasort.errors");

    // Xaravel-only: a by-reference argument must be a Ref (DIV-9.2).
    assertJsTypeError("uasort(): Argument #1 ($array) is by reference; pass a Ref holding the array (DIV-9.2)", () => uasort([1] as unknown as Ref<unknown>, () => 0));
    // Xaravel-only: a PHP callable string or array is not ported (DIV-9.13).
    for (const [callback, form] of [
      ["strcmp", "string"],
      [[Text, "toString"], "array"],
    ] as const) {
      const error = thrownBy(() => uasort(new Ref<unknown>([2, 1]), callback));
      Assert.assertSame(`TypeError: uasort(): Argument #2 ($callback) is a PHP callable ${form}, which Xaravel does not port; pass a function`, attempt(() => { throw error; }));
    }
    // Xaravel-only: an object with an __invoke method is called; a callback returning undefined reads as null, 0.
    const invoked = new Ref<unknown>([1, 3, 2]);
    Assert.assertTrue(uasort(invoked, new Descending()));
    Assert.assertSame('{"1":3,"2":2,"0":1}', json(invoked.value));
    const silent = new Ref<unknown>({ b: 2, a: 1 });
    uasort(silent, () => undefined);
    Assert.assertSame('{"b":2,"a":1}', json(silent.value));
    // Xaravel-only: the new array is written back; the old JS value, which another holder may share, is unchanged.
    const list = [3, 1, 2];
    const ref = new Ref<unknown>(list);
    uasort(ref, spaceshipCallback);
    Assert.assertSame("[3,1,2]", json(list));
    Assert.assertNotSame(list, ref.value);
    // Xaravel-only: an empty array is left as it is (the same JS value), and the callback is not called.
    const empty: unknown[] = [];
    const emptyRef = new Ref<unknown>(empty);
    let called = false;
    Assert.assertTrue(
      uasort(emptyRef, () => {
        called = true;
        return 0;
      }),
    );
    Assert.assertSame(empty, emptyRef.value);
    Assert.assertFalse(called);
    // Xaravel-only: the callback's own thrown value propagates, whatever it is.
    const thrown = new globalThis.Error("plain");
    const thrownRef = new Ref<unknown>({ a: 2, b: 1 });
    Assert.assertSame(thrown, thrownBy(() => uasort(thrownRef, () => {
      throw thrown;
    })));
    Assert.assertSame('{"a":2,"b":1}', json(thrownRef.value));
    // Xaravel-only: a result no PHP value holds (a symbol) throws on the same path: written back, then rethrown.
    const symbolRef = new Ref<unknown>({ a: 2, b: 1 });
    assertJsTypeError("A symbol is no PHP value", () => uasort(symbolRef, () => Symbol("x")));
    Assert.assertSame('{"a":2,"b":1}', json(symbolRef.value));
    // The kept next free index: a PhpArray stays one, so the next append lands where PHP's does.
    const kept = phpArray([5, 3], [1, 1], [9, 2]);
    kept.delete(9);
    const keptRef = new Ref<unknown>(kept);
    uasort(keptRef, spaceshipCallback);
    Assert.assertTrue(keptRef.value instanceof PhpArray);
    Assert.assertSame(10, (keptRef.value as PhpArray).push("d"));
  },
);

xaravelTest(
  "XT-runtime-76",
  "every PHP 8.5.11 value recorded in php-sort-string-functions.probe.txt (from php-sort-string-functions.probe.php: is_null, the string comparisons and uasort, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object (ESC-14.2-4)",
  () => {
    const record = readFileSync(resolve(import.meta.dir, "php-sort-string-functions.probe.txt"), "utf8");
    const labels = new Set<string>();
    for (const line of record.split("\n")) {
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

    for (const name of NEW_EXPORTS) {
      Assert.assertSame((php as Record<string, unknown>)[name], (root as Record<string, unknown>)[name], name);
      Assert.assertNotNull((php as Record<string, unknown>)[name] ?? null, name);
    }
    // One fresh process imports both entries and compares every new name by identity.
    const run = child(
      `const r = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/index.ts"))}); const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))}); const names = ${JSON.stringify(NEW_EXPORTS)}; console.log(names.filter((n) => typeof p[n] !== "function" || r[n] !== p[n]).join(",") || "all");`,
    );
    Assert.assertSame(0, run.code, run.err);
    Assert.assertSame("all", run.out);
  },
  60_000,
);
