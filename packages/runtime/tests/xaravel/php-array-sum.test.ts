// Executable PHP 8.5.11 evidence for the runtime's `array_sum` (ESC-14.8-2); every recorded label is recomputed.
// PHP's warnings for a skipped operand are not raised (DIV-9.17); the probe runs with error_reporting=0.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const evidence = readFileSync(`${import.meta.dir}/php-array-sum.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const tab = line.indexOf("\t");
  return [line.slice(0, tab), line.slice(tab + 1)] as const;
});

function attempt(fn: () => unknown): unknown {
  try { return fn(); } catch (error) { return `${fqcn(error as object)}: ${(error as Error).message}`; }
}
function encode(value: unknown): string { return p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION) as string; }
// The probe's `t($v)`: [gettype, value], with a NAN, an infinity or a float zero written by name.
function t(value: unknown): unknown {
  const n = Number(value);
  if (p.isFloat(value) && (Number.isNaN(n) || !Number.isFinite(n) || n === 0)) {
    return ["double", Number.isNaN(n) ? "NAN" : n === Infinity ? "INF" : n === -Infinity ? "-INF" : Object.is(n, -0) ? "-0" : "+0"];
  }
  return [p.gettype(value), value];
}
// Every argument is checked unchanged afterwards: the same keys and the identical values, in order.
function sums(inputs: readonly object[]): unknown[] {
  return inputs.map((input) => {
    const before = p.arrayEntries(input);
    const sum = p.array_sum(input);
    const after = p.arrayEntries(input);
    Assert.assertSame(before.length, after.length);
    before.forEach(([key, value], i) => { Assert.assertSame(key, after[i]![0]); Assert.assertTrue(Object.is(value, after[i]![1])); });
    Assert.assertSame(p.gettype(sum) === "double", p.isFloat(sum));
    Assert.assertSame(p.gettype(sum) === "double", p.is_float(sum));
    return t(sum);
  });
}

const cases: Record<string, () => unknown> = {
  empty: () => sums([[]]),
  ints: () => sums([[1, 2, 3], [9007199254740993n, 1], [p.PHP_INT_MAX - 1n, 1], [p.PHP_INT_MAX, 1], [p.PHP_INT_MIN, -1], [p.PHP_INT_MAX, p.PHP_INT_MIN], [-5, 2]]),
  floats: () => sums([[1, 2.5], [0.1, 0.2], [p.float(1)], [p.float(-0)], [p.float(-0), p.float(-0)], [Infinity], [-Infinity], [Infinity, -Infinity], [NaN], [NaN, 1], [p.PHP_INT_MAX, p.float(1)]]),
  coerced: () => sums([["1", "2.5", "1e3", " 3", "3 "], ["9223372036854775808"], ["9223372036854775807", 1], [true, false, null], [null], [false], ["1", 1], ["-0.0"], [".5", "5."]]),
  leading: () => sums([["12abc", 1], ["0x1A", 1], [" 12tail"], ["1e3x", 0.5]]),
  unsupported: () => sums([[[1], 5], [[1]], [new p.stdClass(), 5], [() => 1, 5], [new p.ArrayObject([1]), 5], ["abc", 5], ["", 5], [p.Traversable, 5], ["abc"], ["abc", 1.5], [[1], new p.stdClass(), "x", "", 2, "3"]]),
  keyed: () => {
    const ref = new p.Ref<unknown>([1, 2]);
    p.referenceAt(ref, 0).value = 5;
    return [
      ...sums([{ a: 1, b: 2.5, 5: 3 }, new p.PhpArray<p.PhpKeyInput, unknown>([[3, "x"], ["b", 4], [0, "1"]]), ref.value as object]),
      ref.value,
    ];
  },
  errors: () => [1, "x", null, new p.stdClass(), new p.ArrayObject([1]), 1.5, true].map((value) => attempt(() => p.array_sum(value))),
  callable: () => {
    const upper = p.phpFunction("ARRAY_SUM")!;
    const qualified = p.phpFunction("\\array_sum")!;
    return [
      p.array_map("array_sum", [[1, 2], [3]]), p.is_callable("array_sum"), p.phpFunction("Array_Sum") !== null,
      p.call_user_func_array("array_sum", [[1, 2.5]]), upper([4, 5]), qualified([6]), attempt(() => upper()), attempt(() => upper([1], [2])),
    ];
  },
};

function check(labels: readonly string[]): void {
  for (const label of labels) Assert.assertTrue(evidence.some(([recorded]) => recorded === label), `missing evidence: ${label}`);
  for (const [label, json] of evidence) {
    if (labels.includes(label)) Assert.assertSame(json, encode(cases[label]!()), label);
  }
}

xaravelTest("XT-runtime-126", "array_sum adds every value as PHP 8.5.11 does, skips rejected operands, keeps int64 and float identity and leaves its argument unchanged", () => {
  check(["empty", "ints", "floats", "coerced", "leading", "unsupported", "keyed", "errors"]);
  Assert.assertTrue(root.array_sum === p.array_sum);
  Assert.assertTrue(typeof p.array_sum([p.PHP_INT_MAX - 1n, 1]) === "bigint");
  Assert.assertTrue(Number.isNaN(Number(p.array_sum([NaN]))));
  Assert.assertTrue(Object.is(Number(p.array_sum([p.float(-0)])), 0));
  for (const value of [1, "x", null, new p.stdClass()]) {
    let caught: unknown = null;
    try { p.array_sum(value); } catch (error) { caught = error; }
    Assert.assertTrue(caught instanceof p.TypeError);
  }
  const labels = evidence.map(([label]) => label).sort();
  Assert.assertSame(encode(labels), encode(Object.keys(cases).sort()));
});

xaravelTest("XT-runtime-127", "array_sum resolves as a PHP callable string with PHP's argument-count errors", () => {
  check(["callable"]);
  const entry = PHP_FUNCTIONS["array_sum"]!;
  Assert.assertTrue(entry.fn === p.array_sum);
  Assert.assertTrue(p.phpFunction("Array_Sum") !== null);
  Assert.assertNull(p.phpFunction("array_sum::x"));
});
