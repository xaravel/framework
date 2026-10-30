// Executable PHP 8.5.11 evidence that `stdClass` exposes its properties to PHP comparison through
// `[Symbol.for('xaravel.php.props')]()` (action item epic-14-retro-item-6-stdclass-props-hook): `==` and `<=>` compare
// two stdClass objects, and `jsonDecode` objects, by their properties as `zend_std_compare_objects` does, a
// self-referencing pair throws PHP's nesting error, and `jsonEncode`, `phpSerialize` and the `(array)` cast are
// unchanged. Every recorded label of `php-stdclass-compare.probe.txt` is recomputed and compared through `jsonEncode`.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";

const evidence = readFileSync(`${import.meta.dir}/php-stdclass-compare.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const tab = line.indexOf("\t");
  return [line.slice(0, tab), line.slice(tab + 1)] as const;
});

function encode(value: unknown): string { return p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION) as string; }
/** `"<class>: <message>"` for a throw; the comparison's nesting error is a JS `Error`, whose `name` is PHP's class name. */
function attempt(fn: () => unknown): unknown {
  try { return fn(); } catch (error) { return `${(error as Error).name}: ${(error as Error).message}`; }
}
/** PHP's `(object) [...]` over a string-keyed literal. */
function obj(props: Record<string, unknown> = {}): p.stdClass { return Object.assign(new p.stdClass(), props); }

const cases: Record<string, () => unknown> = {
  eq: () => [
    p.looseEquals(obj({ a: 1 }), obj({ a: 1 })),
    p.looseEquals(obj({ a: 1 }), obj({ a: 2 })),
    p.looseEquals(obj({ a: 1 }), obj({ b: 1 })),
    p.looseEquals(obj({ a: 1, b: 2 }), obj({ b: 2, a: 1 })),
    p.looseEquals(new p.stdClass(), new p.stdClass()),
    p.looseEquals(obj({ o: obj({ a: 1 }) }), obj({ o: obj({ a: 1 }) })),
    p.looseEquals(obj({ 1: "x" }), p.jsonDecode('{"1":"x"}')),
    p.looseEquals(obj({ a: 1 }), { a: 1 }),
  ],
  spaceship: () => [
    p.spaceship(obj({ a: 1 }), obj({ a: 2 })),
    p.spaceship(obj({ a: 2 }), obj({ a: 1 })),
    p.spaceship(obj({ a: 1 }), obj({ b: 1 })),
    p.spaceship(obj({ b: 1 }), obj({ a: 1 })),
    p.spaceship(obj({ a: 1 }), obj({ a: 1, b: 2 })),
    p.spaceship(obj({ a: 1, b: 2 }), obj({ a: 1 })),
    p.spaceship(obj({ a: 1 }), new p.ArrayObject({ a: 1 })),
  ],
  recursion: () => {
    const x = new p.stdClass();
    x["self"] = x;
    const y = new p.stdClass();
    y["self"] = y;
    return [attempt(() => p.looseEquals(x, y)), p.looseEquals(x, x)];
  },
  "recursion.mutual": () => {
    const m = new p.stdClass();
    const n = new p.stdClass();
    m["o"] = n;
    n["o"] = m;
    return attempt(() => p.looseEquals(m, n));
  },
  "json_decode.spaceship": () => [
    p.spaceship(p.jsonDecode('{"a":1}'), p.jsonDecode('{"a":2}')),
    p.spaceship(p.jsonDecode('{"a":2}'), p.jsonDecode('{"a":1}')),
    p.spaceship(p.jsonDecode('{"a":1}'), obj({ a: 1 })),
    p.spaceship(obj({ a: 2 }), p.jsonDecode('{"a":1}')),
  ],
  unserialize: () => [
    p.looseEquals(p.phpUnserialize('O:8:"stdClass":1:{s:1:"a";i:1;}'), obj({ a: 1 })),
    p.looseEquals(p.phpUnserialize('O:8:"stdClass":1:{s:1:"a";i:1;}'), obj({ a: 2 })),
  ],
  codecs: () => [
    p.jsonEncode(new p.stdClass()),
    p.jsonEncode(obj({ 1: "x", a: 2 })),
    p.phpSerialize(obj({ a: 1 })),
    p.toPhpArray(obj({ 1: "x" })),
  ],
};

xaravelTest("XT-runtime-129", "stdClass and jsonDecode objects compare with == and <=>, and a phpUnserialize stdClass with ==, by their properties as PHP 8.5.11 does, and assertEquals sees two equal ones as equal; a self-referencing or mutually referencing pair throws PHP's nesting error while one object equals itself; and jsonEncode, phpSerialize and the (array) cast of a stdClass are unchanged", () => {
  for (const [label, json] of evidence) {
    Assert.assertSame(json, encode(cases[label]!()), label);
  }
  Assert.assertSame(encode(Object.keys(cases).sort()), encode(evidence.map(([label]) => label).sort()));
  // The grader's view: two equal stdClass objects with an integer-like property name are assertEquals-equal.
  Assert.assertEquals(obj({ 1: "x" }), p.jsonDecode('{"1":"x"}'));
  // The hook is a non-enumerable prototype method: a stdClass's own keys stay its dynamic properties.
  Assert.assertSame(encode(["a"]), encode(Object.keys(obj({ a: 1 }))));
  const hook = Symbol.for("xaravel.php.props");
  Assert.assertSame(0, Object.getOwnPropertySymbols(obj({ a: 1 })).length);
  Assert.assertFalse(Object.prototype.propertyIsEnumerable.call(p.stdClass.prototype, hook));
});
