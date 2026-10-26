// Xaravel Test for action item epic-14-item-1-runtime-php-types (ESC-14.1-2, decisions/MAINT-2026-10-25-story-14-1.md):
// the runtime builds PHP's built-in interfaces (`Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`,
// `Stringable`, `Throwable`, and since epic-14-item-3 `ArrayAccess`) as contract tokens itself, because it cannot import `contract()` (AD-2). XT-contracts-22 is
// the equivalence test: each runtime token has the own keys, in the same order, with the same descriptors and
// frozenness, as the token `contract()` makes from the same name, members, parents and built-ins; its brand and
// `instanceof` behave alike; and `contract()` takes it as a parent. The runtime side is XT-runtime-52.
import { Assert, xaravelTest } from "@xaravel/assert";
import { ArrayAccess, Iterator, IteratorAggregate, JsonSerializable, Stringable, Throwable, Traversable } from "@xaravel/runtime/php";
import { CLASS_FQCN, contract, CONTRACT_BUILTINS, CONTRACT_METHODS, CONTRACT_PARAMETERS, CONTRACT_PARENTS, type ContractToken } from "@xaravel/contracts";

/** A key as text, for messages and comparison. */
function keyName(key: string | symbol): string {
  return typeof key === "symbol" ? `symbol:${String(key.description)}` : key;
}

/** Each own key's descriptor as text: its attributes, and its value's type or the value itself for a primitive. */
function shape(token: object): string[] {
  return Reflect.ownKeys(token).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(token, key) as PropertyDescriptor;
    const value: unknown = descriptor.value;
    const valueText = typeof value === "function" ? "function" : typeof value === "object" && value !== null ? `object frozen=${String(Object.isFrozen(value))}` : String(value);
    return `${keyName(key)} w=${String(descriptor.writable)} e=${String(descriptor.enumerable)} c=${String(descriptor.configurable)} get=${String(descriptor.get !== undefined)} ${valueText}`;
  });
}

xaravelTest(
  "XT-contracts-22",
  "the runtime's built-in interface tokens (Traversable, Iterator, IteratorAggregate, JsonSerializable, Stringable, Throwable, ArrayAccess) have the own keys, order, descriptors, frozenness and nested values of the contract() token made with the same name, members, parents and built-ins, behave alike under instanceof, and contract() accepts them as parents (ESC-14.1-2)",
  () => {
    const cases: [object, string, Record<string, readonly string[]>, readonly object[], readonly string[]][] = [
      [Traversable, "Traversable", {}, [], []],
      [Iterator, "Iterator", { current: [], key: [], next: [], rewind: [], valid: [] }, [Traversable], []],
      [IteratorAggregate, "IteratorAggregate", {}, [Traversable], ["getIterator"]],
      [JsonSerializable, "JsonSerializable", { jsonSerialize: [] }, [], []],
      [Stringable, "Stringable", {}, [], ["__toString"]],
      [Throwable, "Throwable", { getMessage: [], getCode: [], getFile: [], getLine: [], getTrace: [], getPrevious: [], getTraceAsString: [] }, [Stringable], []],
      // Action item epic-14-item-3-runtime-type-tests-functions (ESC-14.1-9): a brand-only token. UnitEnum and
      // BackedEnum answer `instanceof` through an enum-case test, not contract()'s brand test, so they are not here.
      [ArrayAccess, "ArrayAccess", { offsetExists: ["offset"], offsetGet: ["offset"], offsetSet: ["offset", "value"], offsetUnset: ["offset"] }, [], []],
    ];
    for (const [runtime, name, members, parents, builtins] of cases) {
      // The name is already recorded by the runtime, so this contract() token stays unrecorded (first one wins).
      const made = contract(name, members, parents as readonly ContractToken<object>[], {}, builtins);
      Assert.assertFalse((made as object) === runtime, name);
      Assert.assertTrue(Object.isFrozen(runtime), name);
      Assert.assertSame(Object.isFrozen(made), Object.isFrozen(runtime), name);
      Assert.assertSame(Object.getPrototypeOf(made), Object.getPrototypeOf(runtime), name);
      Assert.assertSame(shape(made).join("\n"), shape(runtime).join("\n"), name);
      const r = runtime as Record<string | symbol, unknown>;
      const m = made as unknown as Record<string | symbol, unknown>;
      Assert.assertSame(m["brand"], r["brand"], name);
      Assert.assertSame(m[CLASS_FQCN], r[CLASS_FQCN], name);
      Assert.assertSame(JSON.stringify(m[CONTRACT_METHODS]), JSON.stringify(r[CONTRACT_METHODS]), name);
      Assert.assertSame(JSON.stringify(m[CONTRACT_PARAMETERS]), JSON.stringify(r[CONTRACT_PARAMETERS]), name);
      Assert.assertTrue(Object.values(r[CONTRACT_PARAMETERS] as object).every((list) => Object.isFrozen(list)), name);
      Assert.assertSame(JSON.stringify(m[CONTRACT_BUILTINS] ?? null), JSON.stringify(r[CONTRACT_BUILTINS] ?? null), name);
      const runtimeParents = r[CONTRACT_PARENTS] as readonly object[];
      Assert.assertSame(parents.length, runtimeParents.length, name);
      parents.forEach((parent, index) => Assert.assertTrue(parent === runtimeParents[index], name));
      Assert.assertSame((m[Symbol.toPrimitive] as () => symbol).call(made), (r[Symbol.toPrimitive] as () => symbol).call(runtime), name);
      const brand = r["brand"] as symbol;
      const branded = { [brand]: true };
      for (const value of [branded, {}, null, 1, () => 1]) {
        Assert.assertSame(value instanceof (made as unknown as { [Symbol.hasInstance](v: unknown): boolean }), value instanceof (runtime as { [Symbol.hasInstance](v: unknown): boolean }), name);
      }
      Assert.assertTrue(branded instanceof (runtime as { [Symbol.hasInstance](v: unknown): boolean }), name);
    }

    // contract() takes a runtime token as a parent, as an Upstream interface extending a built-in one would.
    const child = contract("XaravelFixture\\RuntimeTokens\\Child", { item: [] }, [Iterator as unknown as ContractToken<object>]);
    Assert.assertTrue((child[CONTRACT_PARENTS] as readonly object[])[0] === Iterator);
  },
);
