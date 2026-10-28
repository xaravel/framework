---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString"
trigger: contract
proposed: >-
  Preserve contract tokens as PHP string values through public runtime valueCopy and argument binding, and align shared PHP type classification (including gettype and is_array) with that string representation. Compare direct, selected, nested class-string and unused defaults with PHP; no collections-local copy or type workaround.
evidence: >-
  valueCopy(Stringable) treats its plain token object as an array and drops FQCN symbols. is_string(Stringable) is true before copying, false after. bindPhpArguments copies the enclosing array; Arr.get copies selected values. Thus Arr.string({key:Stringable}, key) rejects a valid class-string as array. All five accessors are affected: array accepts the copied token as an array, nested valid arrays lose tokens, and boolean/float/integer report array instead of string. Runtime is earlier, so hold all five whole methods and their Test IDs not-ported-yet.
---

# ESC-14.6-6: Class-string value-copy preservation

valueCopy(Stringable) treats its plain token object as an array and drops FQCN symbols. is_string(Stringable) is true before copying, false after. bindPhpArguments copies the enclosing array; Arr.get copies selected values. Thus Arr.string({key:Stringable}, key) rejects a valid class-string as array. All five accessors are affected: array accepts the copied token as an array, nested valid arrays lose tokens, and boolean/float/integer report array instead of string. Runtime is earlier, so hold all five whole methods and their Test IDs not-ported-yet.

Exact pinned Upstream bodies remain in ESC-14.6-3 (string) and ESC-14.6-1 (push); those historical records are unchanged.

## Complete pending translation

```ts

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString', { case: SupportArrTest }, async function () {
  const test_array = { string: 'foo bar', integer: 1234 };
  this.assertSame('foo bar', Arr.string(test_array, 'string'));
  this.assertSame('default', Arr.string(test_array, 'missing_key', 'default'));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[integer\] must be a string, (.*) found./); // adapted:DIV-10.1
  Arr.string(test_array, 'integer');
});
```

## Pending whole implementation (not supplied)

```ts
  /** Get a typed string item using dot notation, with PHP parameter binding before lookup. */
  static string(_array: unknown, _key: unknown, _defaultValue: unknown = null): string {
    const fn = "Illuminate\\Support\\Arr::string";
    const [boundArray, boundKey, boundDefault] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?string", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(boundArray, boundKey, boundDefault);
    if (!is_string(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a string, %s found.", boundKey, gettype(selected)));
    }
    return phpReturn(fn, "string", selected) as string;
  }

```

## Pending regressions

```ts
Pending regression: Assert.assertSame("Stringable", Arr.string({ key: Stringable }, "key"));
Also retain default normalization: Assert.assertSame("Stringable", Arr.string({}, "key", Stringable));
```

## Remaining complete pending translations (not executable)

```ts

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger', { case: SupportArrTest }, async function () {
  const test_array = { string: 'foo bar', integer: 1234 };
  this.assertSame(1234, Arr.integer(test_array, 'integer'));
  this.assertSame(999, Arr.integer(test_array, 'missing_key', 999));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an integer, (.*) found./); // adapted:DIV-10.1
  Arr.integer(test_array, 'string');
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat', { case: SupportArrTest }, async function () {
  const test_array = { string: 'foo bar', float: 12.34 };
  this.assertSame(12.34, Arr.float(test_array, 'float'));
  this.assertSame(56.78, Arr.float(test_array, 'missing_key', 56.78));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a float, (.*) found./); // adapted:DIV-10.1
  Arr.float(test_array, 'string');
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean', { case: SupportArrTest }, async function () {
  const test_array = { string: 'foo bar', boolean: true };
  this.assertTrue(Arr.boolean(test_array, 'boolean'));
  this.assertTrue(Arr.boolean(test_array, 'missing_key', true));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a boolean, (.*) found./); // adapted:DIV-10.1
  Arr.boolean(test_array, 'string');
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray', { case: SupportArrTest }, async function () {
  const test_array = { string: 'foo bar', array: ['foo', 'bar'] };
  this.assertSame(['foo', 'bar'], Arr.array(test_array, 'array'));
  this.assertSame([1, 'two'], Arr.array(test_array, 'missing_key', [1, 'two']));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an array, (.*) found./); // adapted:DIV-10.1
  Arr.array(test_array, 'string');
});

```

## Remaining whole tentative methods (not supplied)

```ts
  /** Get a typed array item using dot notation, with PHP parameter binding before lookup. */
  static array(_array: unknown, _key: unknown, _defaultValue: unknown = null): unknown {
    const fn = "Illuminate\\Support\\Arr::array";
    const [boundArray, boundKey, boundDefault] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?array", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(boundArray, boundKey, boundDefault);
    if (!is_array(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an array, %s found.", boundKey, gettype(selected)));
    }
    return phpReturn(fn, "array", selected);
  }
  /** Get a typed boolean item using dot notation, with PHP parameter binding before lookup. */
  static boolean(_array: unknown, _key: unknown, _defaultValue: unknown = null): boolean {
    const fn = "Illuminate\\Support\\Arr::boolean";
    const [boundArray, boundKey, boundDefault] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?bool", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(boundArray, boundKey, boundDefault);
    if (!is_bool(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a boolean, %s found.", boundKey, gettype(selected)));
    }
    return phpReturn(fn, "bool", selected) as boolean;
  }
  /** Get a typed float item using dot notation, with PHP parameter binding before lookup. */
  static float(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | PhpFloat {
    const fn = "Illuminate\\Support\\Arr::float";
    const [boundArray, boundKey, boundDefault] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?float", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(boundArray, boundKey, boundDefault);
    if (!is_float(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a float, %s found.", boundKey, gettype(selected)));
    }
    return phpReturn(fn, "float", selected) as number | PhpFloat;
  }
  /** Get a typed integer item using dot notation, with PHP parameter binding before lookup. */
  static integer(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | bigint {
    const fn = "Illuminate\\Support\\Arr::integer";
    const [boundArray, boundKey, boundDefault] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?int", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(boundArray, boundKey, boundDefault);
    if (!is_int(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an integer, %s found.", boundKey, gettype(selected)));
    }
    return phpReturn(fn, "int", selected) as number | bigint;
  }

```

## Preserved XT boundary/default/copy/dispatch regressions (pending only)

```ts
  const fails = (invoke: () => unknown, klass: new (...args: any[]) => unknown, message: string | null = null): void => {
    let error: unknown = null;
    try { invoke(); } catch (caught) { error = caught; }
    Assert.assertInstanceOf(klass, error);
    if (message !== null) Assert.assertSame(message, (error as PhpTypeError).getMessage());
  };
  const typedCases = [
    ["array", [1], [2], "array", "an array"],
    ["boolean", true, "0", "bool", "a boolean"],
    ["float", float(2), "3", "float", "a float"],
    ["integer", 2, "3", "int", "an integer"],
    ["string", "ok", 3, "string", "a string"],
  ] as const;
  for (const [method, selected, default_, type, label] of typedCases) {
    const call = Arr[method] as (...args: unknown[]) => unknown;
    const fn = "Illuminate\\Support\\Arr::" + method;
    for (const input of [{ key: selected }, new PhpArray([["key", selected]]), new ArrayObject({ key: selected })]) {
      Assert.assertSame(selected, call(input, "key"));
    }
    Assert.assertSame(selected, call([selected], 0));
    fails(() => call({ key: selected }, "key", new stdClass()), PhpTypeError,
      fn + "(): Argument #3 ($default) must be of type ?" + type + ", stdClass given");
    fails(() => call({ key: null }, "key"), InvalidArgumentException,
      "Array value for key [key] must be " + label + ", NULL found.");
    fails(() => call({}, "key"), InvalidArgumentException);
    fails(() => call(), ArgumentCountError,
      "Too few arguments to function " + fn + "(), 0 passed and at least 2 expected");
    fails(() => call(null, "key"), PhpTypeError,
      fn + "(): Argument #1 ($array) must be of type ArrayAccess|array, null given");
    fails(() => call({}, []), PhpTypeError,
      fn + "(): Argument #2 ($key) must be of type string|int|null, array given");
    const expected = method === "boolean" ? false : method === "float" ? float(3) : method === "integer" ? 3 : method === "string" ? "3" : [2];
    Assert.assertSame(expected, call({}, "missing", default_));
  }
  Assert.assertSame(9223372036854775807n, Arr.integer({ key: 9223372036854775807n }, "key"));
  Assert.assertSame(float(2), Arr.float({ key: float(2) }, "key"));
  fails(() => Arr.float({ key: 2 }, "key"), InvalidArgumentException);
  fails(() => Arr.integer({ key: float(2) }, "key"), InvalidArgumentException);
  const typedHandle = new stdClass();
  const typedSource = { key: { child: [1], typedHandle } };
  const typedCopy = Arr.array(typedSource, "key") as typeof typedSource.key;
  typedCopy.child.push(2);
  Assert.assertSame([1], typedSource.key.child);
  Assert.assertSame(typedHandle, typedCopy.typedHandle);
  class ExplicitTypedGetArr extends Arr {
    static override get(): unknown { throw new Error("typed accessors must use Arr.get"); }
  }
  Assert.assertSame([1], ExplicitTypedGetArr.array({ key: [1] }, "key"));
  Assert.assertTrue(ExplicitTypedGetArr.boolean({ key: true }, "key"));
  Assert.assertSame(float(2), ExplicitTypedGetArr.float({ key: float(2) }, "key"));
  Assert.assertSame(2, ExplicitTypedGetArr.integer({ key: 2 }, "key"));
  Assert.assertSame([1], Arr.array([1], null));
  const accessorArrayObject = new ArrayObject({ key: [1] });
  const accessorArrayCopy = Arr.array(accessorArrayObject, "key") as number[];
  accessorArrayCopy.push(2);
  Assert.assertSame([1], accessorArrayObject.offsetGet("key"));

```

## Runnable shared-contract reproduction (current runtime; no absent Arr method invoked)

Run from `packages/collections`. `Stringable` is the PHP runtime token, not a contracts/support export.

```sh
bun --no-env-file -e '
import { Arr } from "./src/Arr.ts";
import { Stringable, bindPhpArguments, valueCopy, is_string, is_array, gettype } from "@xaravel/runtime";
console.log("original", is_string(Stringable), gettype(Stringable));
console.log("copied", is_string(valueCopy(Stringable)), gettype(valueCopy(Stringable)));
const [input] = bindPhpArguments("Illuminate\\Support\\Arr::array", [{name:"array",type:"ArrayAccess|array"}], [{key:Stringable, nested:{token:Stringable}}]);
const selected = Arr.get(input, "key");
console.log("selected-as-array", is_array(selected), gettype(selected));
console.log("nested-token", is_string(Arr.get(input, "nested.token")));
for (const label of ["a boolean", "a float", "an integer"]) console.log(`Array value for key [key] must be ${label}, ${gettype(selected)} found.`);
'
```

Observed: original `true array` (runtime gettype also misclassifies the token), copied `false array`, selected-as-array `true array`, nested-token `false`. The three diagnostics say `array found.`; PHP's corresponding selected token is a string and must say `string found.`. The pending array accessor must reject the selected token with `Array value for key [key] must be an array, string found.`; it must preserve `Stringable` inside a valid selected array.

## Additional pending integration regressions (do not execute until whole methods release)

These supplement the preserved XT block. Required imports: `Assert` from `@xaravel/assert`, `Arr` from `@xaravel/collections`, and `ArrayObject`, `Stringable`, `InvalidArgumentException`, `TypeError as PhpTypeError`, `stdClass` from `@xaravel/runtime`. Reuse `fails` from the pending XT block above.

```ts
Assert.assertSame("Stringable", Arr.string({ key: Stringable }, "key"));
Assert.assertSame("Stringable", Arr.string({}, "key", Stringable));
fails(() => Arr.array({ key: Stringable }, "key"), InvalidArgumentException,
  "Array value for key [key] must be an array, string found.");
Assert.assertSame(Stringable, (Arr.array({ key: { token: Stringable } }, "key") as { token: unknown }).token);
for (const [method, label] of [["boolean", "a boolean"], ["float", "a float"], ["integer", "an integer"]] as const) {
  fails(() => Arr[method]({ key: Stringable }, "key"), InvalidArgumentException,
    "Array value for key [key] must be " + label + ", string found.");
}
const allTypedCases = typedCases;
for (const [method, selected, default_, type] of allTypedCases) {
  const call = Arr[method] as (...args: unknown[]) => unknown;
  Assert.assertSame(selected, call({ outer: { inner: selected } }, "outer.inner"));
  Assert.assertSame(selected, call({ "outer.inner": selected, outer: { inner: null } }, "outer.inner"));
  Assert.assertSame(selected, call({ key: selected }, "key", default_));
  class LookupProbe extends ArrayObject {
    reads: unknown[] = [];
    override offsetExists(key: Parameters<ArrayObject['offsetExists']>[0]): boolean { this.reads.push(["exists", key]); return super.offsetExists(key); }
    override offsetGet(key: Parameters<ArrayObject['offsetGet']>[0]): unknown { this.reads.push(["get", key]); return super.offsetGet(key); }
  }
  const probe = new LookupProbe({ key: selected });
  fails(() => call(probe, "key", new stdClass()), PhpTypeError,
    "Illuminate\\Support\\Arr::" + method + "(): Argument #3 ($default) must be of type ?" + type + ", stdClass given");
  Assert.assertSame([], probe.reads);
  Assert.assertSame(selected, call(probe, "key"));
  Assert.assertSame([["exists", "key"], ["get", "key"]], probe.reads);
}
Assert.assertSame("3", Arr.string({}, "missing", 3));
fails(() => Arr.string({ key: null }, "key"), InvalidArgumentException,
  "Array value for key [key] must be a string, NULL found.");
```
