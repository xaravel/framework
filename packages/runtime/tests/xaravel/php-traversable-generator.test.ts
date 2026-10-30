// Executable PHP 8.5.11 evidence that a bare JS generator object, what a ported generator function returns (DIV-12.18),
// is a `Traversable` and an `Iterator` as PHP's `Generator` is, and that `CachingIterator` reads one (action item
// epic-14-retro-item-5-traversable-js-generator). Every recorded label of `php-traversable-generator.probe.txt` is
// recomputed and compared through `jsonEncode`.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as p from "@xaravel/runtime/php";

const evidence = readFileSync(`${import.meta.dir}/php-traversable-generator.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const tab = line.indexOf("\t");
  return [line.slice(0, tab), line.slice(tab + 1)] as const;
});

function encode(value: unknown): string { return p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION) as string; }
function* g(): globalThis.Generator<unknown, void, unknown> { yield 1; yield 2; }
function* gk(): globalThis.Generator<unknown, void, unknown> { yield p.keyed("a", 1); yield p.keyed(5, 2); yield 3; }

const cases: Record<string, () => unknown> = {
  instanceof: () => {
    const gen = g();
    return [gen instanceof p.Traversable, gen instanceof p.Iterator, gen instanceof p.Generator, gen instanceof p.IteratorAggregate];
  },
  is_a: () => {
    const gen = g();
    return [p.is_a(gen, "Traversable"), p.is_a(gen, "Iterator"), p.is_a(gen, "Generator"), p.is_a(gen, "IteratorAggregate"), p.is_iterable(gen)];
  },
  caching: () => {
    const rows: unknown[] = [];
    const it = new p.CachingIterator(gk() as unknown as p.Iterator);
    for (const [key, value] of it.entries()) {
      rows.push([key, value, it.hasNext()]);
    }
    return rows;
  },
  "caching.inner": () => {
    const gen = gk();
    const it = new p.CachingIterator(gen as unknown as p.Iterator);
    return [it.getInnerIterator() === (gen as unknown), it.getInnerIterator() instanceof p.Generator];
  },
  "caching.to_array": () => p.iterator_to_array(new p.CachingIterator(gk() as unknown as p.Iterator)),
};

xaravelTest("XT-runtime-128", "a bare JS generator object answers instanceof Traversable and Iterator, is_a and is_iterable as PHP 8.5.11's Generator does, without carrying a brand, and CachingIterator reads it and gives it back from getInnerIterator", () => {
  for (const [label, json] of evidence) {
    Assert.assertSame(json, encode(cases[label]!()), label);
  }
  Assert.assertSame(encode(Object.keys(cases).sort()), encode(evidence.map(([label]) => label).sort()));
  // The brand stays on the runtime's own classes: a bare generator carries none, its `Generator` wrapper carries both.
  Assert.assertFalse(p.hasBrand(g(), p.Traversable));
  Assert.assertFalse(p.hasBrand(g(), p.Iterator));
  Assert.assertTrue(p.hasBrand(new p.Generator(g()), p.Traversable));
  Assert.assertTrue(p.hasBrand(new p.Generator(g()), p.Iterator));
  // Any other value is still refused by the brand test.
  Assert.assertFalse([1, 2] instanceof p.Traversable);
  Assert.assertFalse((function () {}) instanceof p.Iterator);
  Assert.assertFalse((null as unknown) instanceof p.Traversable);
});
