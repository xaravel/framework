// Executable PHP 8.5.11 evidence for the runtime's `minus`, PHP's `$a - $b` (Epic 14 retro item 8); every recorded
// label is recomputed. PHP's warning for a leading-numeric string is not raised (DIV-9.17); the probe runs with
// error_reporting=0.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn } from "@xaravel/runtime/registry";

const evidence = readFileSync(`${import.meta.dir}/php-minus.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const tab = line.indexOf("\t");
  return [line.slice(0, tab), line.slice(tab + 1)] as const;
});

function encode(value: unknown): string { return p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION) as string; }
// The probe's `t($v)`: [gettype, value], with a NAN, an infinity or a float zero written by name.
function t(value: unknown): unknown {
  const n = Number(value);
  if (p.isFloat(value) && (Number.isNaN(n) || !Number.isFinite(n) || n === 0)) {
    return ["double", Number.isNaN(n) ? "NAN" : n === Infinity ? "INF" : n === -Infinity ? "-INF" : Object.is(n, -0) ? "-0" : "+0"];
  }
  return [p.gettype(value), value];
}
// The probe's `subtract`: each pair through `minus`, its typed result or "<class>: <message>". A float result
// carries the float marker, and an int result does not.
function subtract(pairs: readonly (readonly [unknown, unknown])[]): unknown[] {
  return pairs.map(([a, b]) => {
    let difference: unknown;
    try {
      difference = p.minus(a, b);
    } catch (error) {
      return `${fqcn(error as object)}: ${(error as Error).message}`;
    }
    Assert.assertSame(p.gettype(difference) === "double", p.isFloat(difference));
    Assert.assertSame(p.gettype(difference) === "double", p.is_float(difference));
    return t(difference);
  });
}

const cases: Record<string, () => unknown> = {
  ints: () => subtract([[5, 3], [3, 5], [9007199254740993n, 1], [p.PHP_INT_MIN, -1], [p.PHP_INT_MAX, p.PHP_INT_MAX], [0, 0], [-5, -7]]),
  overflow: () => subtract([[p.PHP_INT_MIN, 1], [p.PHP_INT_MAX, -1], [p.PHP_INT_MIN, p.PHP_INT_MAX], [p.PHP_INT_MAX, p.PHP_INT_MIN]]),
  floats: () => subtract([
    [5.5, 1], [1, 0.1], [p.float(3), 1], [0, p.float(-0)], [p.float(-0), 0], [p.float(-0), p.float(0)], [p.float(0), p.float(0)],
    [Infinity, 1], [1, Infinity], [Infinity, Infinity], [-Infinity, Infinity], [NaN, 1], [1, NaN], [p.PHP_INT_MAX, p.float(1)],
  ]),
  coerced: () => subtract([
    ["10", 3], ["2.5", "1"], ["1e3", 1], [" 7", "7 "], [true, false], [null, 1], ["9223372036854775808", 1], [1, null], [null, null],
    ["-0.0", 0], [".5", "5."], ["9223372036854775807", "-1"],
  ]),
  leading: () => subtract([["12abc", 2], [" 12tail", 2], ["0x1A", 1], ["1e3x", 0.5], [5, "3 apples"]]),
  unsupported: () => subtract([
    [[], 1], [1, []], [[1], [1]], [[], []], ["x", 1], [1, ""], [new p.stdClass(), 1], [() => 1, 1], [1.5, "abc"], [[], true], [null, []],
    [new p.ArrayObject([1]), 2],
  ]),
  function: () => [p.phpFunction("minus") !== null, p.is_callable("minus")],
};

xaravelTest("XT-runtime-130", "minus subtracts as PHP 8.5.11's $a - $b does, keeps int64 and float identity and throws PHP's TypeError for unsupported operands", () => {
  for (const label of Object.keys(cases)) Assert.assertTrue(evidence.some(([recorded]) => recorded === label), `missing evidence: ${label}`);
  for (const [label, json] of evidence) Assert.assertSame(json, encode(cases[label]!()), label);
  Assert.assertTrue(root.minus === p.minus);
  Assert.assertTrue(typeof p.minus(9007199254740993n, 1) === "bigint");
  Assert.assertTrue(typeof p.minus(p.PHP_INT_MIN, -1) === "bigint");
  Assert.assertTrue(typeof p.minus(5, 3) === "number" && !p.isFloat(p.minus(5, 3)));
  Assert.assertTrue(Object.is(Number(p.minus(p.float(-0), 0)), -0));
  Assert.assertTrue(Number.isNaN(Number(p.minus(Infinity, Infinity))));
  for (const [a, b] of [[[], 1], [1, []], ["x", 1], [new p.stdClass(), 1]] as const) {
    let caught: unknown = null;
    try { p.minus(a, b); } catch (error) { caught = error; }
    Assert.assertTrue(caught instanceof p.TypeError);
  }
  const labels = evidence.map(([label]) => label).sort();
  Assert.assertSame(encode(labels), encode(Object.keys(cases).sort()));
});
