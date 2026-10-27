// Xaravel Tests for action item epic-14-item-7-runtime-match-error-dynamic-call (decisions/ESC-14.2-6.md, option 1,
// approved under decisions/MAINT-2026-10-26-runtime-builtins.md; decisions/ESC-14.2-7.md, option 1, approved by the
// Maintainer). XT-runtime-77: `UnhandledMatchError` and `unhandledMatch`, the error a `match` with no matching arm
// throws. XT-runtime-78: `callMethod`, PHP's dynamic method call `$object->$name(...$args)`. XT-runtime-79: every probe
// label recomputed, and the fresh-process export check. None needs an Oracle fixture: each expected value and message
// is what PHP 8.5.11 gives for the same construct, probed with the host's `php`: `php-match-dynamic-call.probe.php`
// prints each PHP-derived value as `<label>\t<json>` (`JSON_PRESERVE_ZERO_FRACTION`), `php-match-dynamic-call.probe.txt`
// is its output under PHP 8.5.11 (`php -d error_reporting=0 php-match-dynamic-call.probe.php >
// php-match-dynamic-call.probe.txt`), and XT-runtime-79 computes every recorded label with the runtime and compares it
// with PHP's value. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (`undefined`, a
// class constructor or a contract token as a value, `this` in a JS method, the unported Closure methods, and the
// grader's map of root throwables).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  callMethod,
  Error as PhpError,
  float,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  method_exists,
  PhpArray,
  stdClass,
  Stringable,
  Throwable,
  UnhandledMatchError,
  unhandledMatch,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, isContractToken, registerClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpMatchDynamicCall";

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = ["UnhandledMatchError", "callMethod", "unhandledMatch"] as const;

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

/** The probe's `Thing`, with no methods. */
class Thing {}

registerClass(`${NS}\\Thing`, Thing);

/** The probe's `Base`: an instance method, a static method reading `static::class`, and a `__toString` port. */
class Base {
  foo(...args: unknown[]): unknown[] {
    return ["foo", args];
  }

  static st(this: object): string {
    return fqcn(this);
  }

  toString(): string {
    return "base";
  }
}

registerClass(`${NS}\\Base`, Base);

/** The probe's `Sub`. */
class Sub extends Base {}

registerClass(`${NS}\\Sub`, Sub);

/** The probe's `Magic`, with `__call`. */
class Magic {
  known(): string {
    return "known";
  }

  __call(name: string, args: unknown[]): unknown[] {
    return ["__call", name, args];
  }
}

registerClass(`${NS}\\Magic`, Magic);

/** The probe's `UpperMagic`, declaring `__CALL`. */
class UpperMagic {
  __CALL(name: string, args: unknown[]): unknown[] {
    return ["__CALL", name, args];
  }
}

registerClass(`${NS}\\UpperMagic`, UpperMagic);

/** The probe's `Parent_`, with `foo`. */
class Parent_ {
  foo(): string {
    return "parent foo";
  }
}

registerClass(`${NS}\\Parent_`, Parent_);

/** The probe's `Child_`, whose `FOO` overrides `foo` (PHP's names are case-insensitive). */
class Child_ extends Parent_ {
  FOO(): string {
    return "child FOO";
  }
}

registerClass(`${NS}\\Child_`, Child_);

/** The probe's `Text`, whose `__toString` port gives a method name. */
class Text {
  toString(): string {
    return "foo";
  }
}

registerClass(`${NS}\\Text`, Text);

/** What a `match` with no matching arm throws for `subject`; the probe's `unmatched`. */
function unmatched(subject: unknown): unknown {
  return attempt(() => {
    throw unhandledMatch(subject);
  });
}

/** `callMethod`, as the probe's `call` makes the dynamic call. */
function call(object: unknown, name: unknown, ...args: unknown[]): unknown {
  return attempt(() => callMethod(object, name, ...args));
}

/** Each probe label's value, computed with the runtime. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  "match.class": () => {
    const error = new UnhandledMatchError("m", 3);
    return [
      fqcn(error),
      fqcn(Object.getPrototypeOf(UnhandledMatchError) as object),
      error instanceof PhpError,
      error instanceof Throwable,
      error.getMessage(),
      error.getCode(),
      error.getPrevious(),
      new UnhandledMatchError().getMessage(),
      attempt(() => {
        throw new UnhandledMatchError("x", 2);
      }),
      attempt(() => new UnhandledMatchError([] as unknown as string)),
    ];
  },
  "match.scalars": () =>
    [
      null,
      true,
      false,
      5,
      -5,
      0,
      2n ** 62n,
      -(2n ** 63n),
      float(1),
      1.5,
      0.1 + 0.2,
      1e20,
      -0,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      float(1e15),
      float(1e14),
      0.00001,
      -2.5,
      123456789012345680,
    ].map(unmatched),
  "match.strings": () =>
    [
      "",
      "abc",
      "a\nb\tc\\d\x1b\x01\x7f",
      "é".repeat(8),
      "a".repeat(16),
      "a".repeat(15),
      "\r\f\v",
      "'q'",
      `${"a".repeat(14)}é`,
      "\0",
      "tab\tend",
      '"dq"',
      Thing,
    ].map(unmatched),
  "match.others": () => [[], [1], { a: 1 }, new stdClass(), new Thing(), () => 1, new (class extends Thing {})(), new (class {})()].map(unmatched),
  "call.exact": () => {
    const base = new Base();
    const sub = new Sub();
    return [call(base, "foo"), call(base, "FOO", 1, "two"), call(sub, "Foo", [3]), call(base, "st"), call(sub, "st"), call(sub, "ST"), call(sub, "__toString"), call(sub, "__TOSTRING")];
  },
  "call.override": () => [call(new Child_(), "foo"), call(new Child_(), "FOO"), call(new Child_(), "Foo"), method_exists(new Child_(), "foo")],
  "call.magic": () => [
    call(new Magic(), "missing", 1, 2),
    call(new Magic(), "MiSsInG"),
    call(new Magic(), "known"),
    call(new Magic(), "KNOWN"),
    call(new Magic(), ""),
    call(new UpperMagic(), "Other", [1]),
  ],
  "call.undefined": () => [
    call(new Base(), "nope"),
    call(new Base(), ""),
    call(new Sub(), "NoPe"),
    call(new Thing(), "foo"),
    call(new stdClass(), "foo"),
    call(new (class extends Base {})(), "zz"),
    call(new (class {})(), "zz"),
    call(() => 1, "nope"),
  ],
  "call.badName": () => {
    const base = new Base();
    return [call(base, 1), call(base, null), call(base, true), call(base, 1.5), call(base, ["foo"]), call(base, new Text()), call(null, 1), call(5, new Text())];
  },
  "call.nonObject": () => [
    call(null, "foo"),
    call(true, "foo"),
    call(false, "foo"),
    call(5, "foo"),
    call(1.5, "foo"),
    call("str", "foo"),
    call([1], "foo"),
    call({ a: 1 }, "foo"),
    call(Base, "st"),
    call(null, ""),
  ],
  "call.closure": () => [
    call((a: number) => a * 2, "__invoke", 3),
    call((a: number) => a * 2, "__INVOKE", 3),
    call((...a: unknown[]) => a, "__Invoke", 1, 2),
    call(() => 1, "Nope"),
  ],
};

/** `label`'s recorded PHP value. */
function recorded(label: string): string {
  const line = readFileSync(resolve(import.meta.dir, "php-match-dynamic-call.probe.txt"), "utf8")
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
  "XT-runtime-77",
  "UnhandledMatchError is PHP's Error subclass with Error's constructor, and unhandledMatch returns, without throwing, the UnhandledMatchError PHP's match throws for an unmatched subject, its message rendering null, bools, ints, floats, strings (quoted, escaped and cut at 15 bytes), arrays and objects as PHP 8.5.11 does (ESC-14.2-6)",
  () => {
    assertProbed("match.class", "match.scalars", "match.strings", "match.others");

    // unhandledMatch returns the error; it does not throw it.
    const error = unhandledMatch(5);
    Assert.assertInstanceOf(UnhandledMatchError, error);
    Assert.assertSame("Unhandled match case 5", error.getMessage());
    Assert.assertNotSame(error, unhandledMatch(5));
    // Xaravel-only: undefined reads as null (AD-9); a class constructor and a contract token are class-strings.
    Assert.assertSame("Unhandled match case NULL", unhandledMatch(undefined).getMessage());
    Assert.assertSame("Unhandled match case 'XaravelFixture\\\\...'", unhandledMatch(Base).getMessage());
    Assert.assertTrue(isContractToken(Stringable));
    Assert.assertSame("Unhandled match case 'Stringable'", unhandledMatch(Stringable).getMessage());
    // Xaravel-only: a PhpArray is an array, a PhpFloat a float.
    Assert.assertSame("Unhandled match case of type array", unhandledMatch(new PhpArray([[0, 1]])).getMessage());
    Assert.assertSame("Unhandled match case 2.0", unhandledMatch(float(2)).getMessage());
    // Xaravel-only: the class stays out of the grader's map of root throwables.
    const classes = (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.php.classes")] as Record<string, unknown>;
    Assert.assertFalse(Object.hasOwn(classes, "UnhandledMatchError"));
    // Xaravel-only: a string holding a lone surrogate, which has no UTF-8 form.
    assertJsTypeError("unhandledMatch(): the string holds a lone surrogate, which has no UTF-8 form", () => unhandledMatch("a\ud800"));
  },
);

xaravelTest(
  "XT-runtime-78",
  "callMethod gives PHP's $object->$name(...$args): a non-string name and then a non-object throw PHP's Error, a Closure takes __invoke in any case, a method is found as method_exists finds it (exactly, then case-insensitively, then __toString) and called with the object, or its class for a static method, then the class's __call with the caller's case, and otherwise PHP's undefined-method Error (ESC-14.2-7)",
  () => {
    assertProbed("call.exact", "call.override", "call.magic", "call.undefined", "call.badName", "call.nonObject", "call.closure");

    // The method's result is returned unchanged, and the arguments are passed as they are.
    const result = {};
    const holder = new (class {
      give(value: unknown): unknown {
        return value;
      }
    })();
    Assert.assertSame(result, callMethod(holder, "GIVE", result));
    // A prototype method sees the object as `this`; a static one the object's class.
    const sub = new Sub();
    const self = new (class Self {
      me(): unknown {
        return this;
      }

      static klass(): unknown {
        return this;
      }
    })();
    Assert.assertSame(self, callMethod(self, "ME"));
    Assert.assertSame(self.constructor, callMethod(self, "Klass"));
    Assert.assertSame(fqcn(Sub), callMethod(sub, "st"));
    // __call gets the caller's arguments as a JS array, and an exact method wins over __call.
    const magic = callMethod(new Magic(), "Missing", 1, [2]) as unknown[];
    Assert.assertTrue(Array.isArray(magic[2]));
    Assert.assertSame('["__call","Missing",[1,[2]]]', json(magic));
    // Xaravel-only: undefined is null (AD-9); a class constructor and a contract token are class-strings; a PhpFloat
    // is a float and a PhpArray an array.
    Assert.assertSame("Error: Method name must be a string", call(new Base(), undefined));
    Assert.assertSame("Error: Call to a member function foo() on null", call(undefined, "foo"));
    Assert.assertSame("Error: Call to a member function foo() on string", call(Stringable, "foo"));
    Assert.assertSame("Error: Call to a member function st() on string", call(Sub, "st"));
    Assert.assertSame("Error: Call to a member function foo() on float", call(float(1), "foo"));
    Assert.assertSame("Error: Call to a member function foo() on array", call(new PhpArray([[0, 1]]), "foo"));
    // Xaravel-only: Closure's bind, bindTo, call and fromCallable are not ported.
    for (const [name, declared] of [
      ["bind", "bind"],
      ["BINDTO", "bindTo"],
      ["call", "call"],
      ["fromCallable", "fromCallable"],
      ["getCurrent", "getCurrent"],
    ] as const) {
      assertJsTypeError(`callMethod(): Closure::${declared}() is not ported`, () => callMethod(() => 1, name));
    }
    // Xaravel-only: an Object.prototype member is no Closure method.
    Assert.assertSame("Error: Call to undefined method Closure::constructor()", call(() => 1, "constructor"));
    Assert.assertSame("Error: Call to undefined method Closure::toString()", call(() => 1, "toString"));
    // Xaravel-only: a JS method with no return gives null (AD-9), through a method, __call and __invoke.
    const silent = new (class {
      quiet(): void {}

      __call(): void {}
    })();
    Assert.assertNull(callMethod(silent, "quiet"));
    Assert.assertNull(callMethod(silent, "missing"));
    Assert.assertNull(callMethod(() => undefined, "__invoke"));
    // Xaravel-only: a static __call takes no part in an instance call (PHP refuses to compile one).
    const staticMagic = new (class StaticMagic {
      static __call(): string {
        return "static";
      }
    })();
    Assert.assertSame(`Error: Call to undefined method class@anonymous::missing()`, call(staticMagic, "missing"));
    // Xaravel-only: a symbol or a bigint outside int64 is no PHP value; phpType's JS TypeError is thrown.
    assertJsTypeError("A symbol is no PHP value", () => callMethod(Symbol("s"), "foo"));
    assertJsTypeError("outside the int64 range", () => callMethod(2n ** 64n, "foo"));
    // method_exists reads the same resolver and keeps its results.
    Assert.assertTrue(method_exists(sub, "FOO"));
    Assert.assertTrue(method_exists(sub, "__toString"));
    Assert.assertTrue(method_exists(Sub, "St"));
    Assert.assertFalse(method_exists(new Magic(), "missing"));
    Assert.assertTrue(method_exists(new UpperMagic(), "__call"));
  },
);

xaravelTest(
  "XT-runtime-79",
  "every PHP 8.5.11 value recorded in php-match-dynamic-call.probe.txt (from php-match-dynamic-call.probe.php: UnhandledMatchError, the unhandled match messages and the dynamic method call, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object (ESC-14.2-6, ESC-14.2-7)",
  () => {
    const record = readFileSync(resolve(import.meta.dir, "php-match-dynamic-call.probe.txt"), "utf8");
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
