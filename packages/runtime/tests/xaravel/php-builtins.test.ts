// Xaravel Tests for action item epic-14-item-1-runtime-php-types, the runtime half of ESC-14.1-1 and ESC-14.1-2
// (decisions/MAINT-2026-10-25-story-14-1.md, option 1 each). XT-runtime-51: the PHP-array helpers `arrayEntries`,
// `arrayFromEntries`, `normalizeKey`, and `gettype` / `getDebugType`. XT-runtime-52: the six built-in interface
// tokens, `Throwable` on the runtime's throwables, `jsonEncode`'s `JsonSerializable` hook and the class lookup, checked
// in fresh processes too. XT-runtime-53: `ArrayIterator` and `ArrayObject`. XT-runtime-54: `CachingIterator`.
// XT-runtime-55: `WeakMap`. None needs an Oracle fixture: each expected value and message is what PHP 8.5.11 gives for
// the same construct, probed with the host's `php`: `php-builtins.probe.php` prints each PHP-derived value of
// XT-runtime-51 and 53..55 as `<label>\t<json>`, `php-builtins.probe.txt` is its output under PHP 8.5.11
// (`php -d error_reporting=0 php-builtins.probe.php > php-builtins.probe.txt`), and XT-runtime-56 computes every
// recorded label with the runtime and compares it with PHP's value. Not recorded: the assertions marked `Xaravel-only`,
// which have no PHP counterpart (an unregistered JS class object; a plain object or `undefined` as a key, which AD-9
// reads as a PHP array and as null), and the WeakMap `null`-key reads and `undefined` appends.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  arrayEntries,
  arrayFromEntries,
  ArrayIterator,
  ArrayObject,
  BadMethodCallException,
  CachingIterator,
  Error as PhpError,
  Exception,
  float,
  getDebugType,
  gettype,
  hasBrand,
  interfaceExists,
  InternalIterator,
  InvalidArgumentException,
  Iterator,
  IteratorAggregate,
  JsonSerializable,
  jsonEncode,
  normalizeKey,
  PhpArray,
  type PhpKeyInput,
  phpSerialize,
  phpUnserialize,
  stdClass,
  Stringable,
  Throwable,
  Traversable,
  TypeError as PhpTypeError,
  UnexpectedValueException,
  ValueError,
  WeakMap,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, isContractToken, registerClass, resolveClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const CLASS_LOOKUP = Symbol.for("xaravel.class.lookup");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_BUILTINS = Symbol.for("xaravel.contract.builtins");

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** `fn` throws exactly a `klass` (not a subclass of it) with `message`. */
function assertThrows(klass: abstract new (...args: never[]) => unknown, message: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof klass, `expected a ${String((klass as { name?: unknown }).name)}: ${String(error)}`);
  Assert.assertSame(fqcn(klass), fqcn((error as object).constructor as abstract new (...args: never[]) => unknown));
  Assert.assertSame(message, (error as globalThis.Error).message);
}

/** `value` as JSON, for comparing arrays of keys, values and pairs. */
function json(value: unknown): string {
  return JSON.stringify(value);
}

/** Runs `code` as a module in a fresh `bun` process from the package directory. */
function child(code: string): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: inherited });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

const ENTRIES = ["src/index.ts", "src/scope/index.ts", "src/registry/index.ts", "src/php/index.ts"] as const;

class Unregistered {}

/** A PHP `Iterator` over `[key, value]` pairs, whose keys may be objects, as a generator's may. */
class KeyedIterator {
  readonly #pairs: readonly (readonly [unknown, unknown])[];
  #index = 0;

  constructor(pairs: readonly (readonly [unknown, unknown])[]) {
    this.#pairs = pairs;
  }

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  current(): unknown {
    return this.#pairs[this.#index]?.[1] ?? null;
  }

  key(): unknown {
    return this.#pairs[this.#index]?.[0] ?? null;
  }

  next(): void {
    this.#index++;
  }

  rewind(): void {
    this.#index = 0;
  }

  valid(): boolean {
    return this.#index < this.#pairs.length;
  }

  *[Symbol.iterator](): Generator<unknown, void, undefined> {
    for (const [, value] of this.#pairs) {
      yield value;
    }
  }

  *entries(): Generator<[unknown, unknown], void, undefined> {
    for (const [key, value] of this.#pairs) {
      yield [key, value];
    }
  }

  *keys(): Generator<unknown, void, undefined> {
    for (const [key] of this.#pairs) {
      yield key;
    }
  }
}

registerClass("XaravelFixture\\PhpBuiltins\\KeyedIterator", KeyedIterator);

/** A `KeyedIterator` whose `key()` returns `undefined`, which AD-9 reads as null. */
class UndefinedKeyIterator extends KeyedIterator {
  override key(): unknown {
    return undefined;
  }
}

xaravelTest(
  "XT-runtime-51",
  "@xaravel/runtime/php exports arrayEntries, arrayFromEntries and normalizeKey with PHP's array-key rules, and gettype / getDebugType give PHP 8.5's names (ESC-14.1-1)",
  () => {
    Assert.assertSame(JSON.stringify([[1, "a"], ["b", 2]]), JSON.stringify(arrayEntries({ "1": "a", b: 2 })));
    Assert.assertSame(JSON.stringify([[0, "x"], [1, null]]), JSON.stringify(arrayEntries(["x", undefined])));
    Assert.assertSame(JSON.stringify([["a", 1], [5, 2]]), JSON.stringify(arrayEntries(new PhpArray([["a", 1], ["5", 2]]))));
    Assert.assertSame(JSON.stringify(["x", "y"]), JSON.stringify(arrayFromEntries([[0, "x"], [1, "y"]])));
    Assert.assertSame(JSON.stringify({ a: 1 }), JSON.stringify(arrayFromEntries([["a", 1]])));
    Assert.assertTrue(arrayFromEntries([[1, "x"]]) instanceof PhpArray);
    Assert.assertSame("07", normalizeKey("07"));
    Assert.assertSame(7, normalizeKey("7"));
    Assert.assertSame(1, normalizeKey(true));
    Assert.assertSame("", normalizeKey(null));
    Assert.assertSame(2, normalizeKey(float(2.9)));
    assertThrows(PhpTypeError, "Cannot access offset of type array on array", () => normalizeKey([]));

    const values: unknown[] = [null, true, 1, 1.5, float(2), "s", [], {}, new stdClass(), () => 1];
    Assert.assertSame("NULL boolean integer double double string array array object object", values.map((value) => gettype(value)).join(" "));
    Assert.assertSame("null bool int float float string array array stdClass Closure", values.map((value) => getDebugType(value)).join(" "));
    Assert.assertSame("class@anonymous", getDebugType(new Unregistered()));
    Assert.assertSame("ArrayObject", getDebugType(new ArrayObject()));
    // An unregistered class is named after its nearest registered parent, as PHP names `new class extends P {}`.
    Assert.assertSame("ArrayObject@anonymous", getDebugType(new (class extends ArrayObject {})()));
    Assert.assertSame("InvalidArgumentException@anonymous", getDebugType(new (class extends (class extends InvalidArgumentException {}) {})()));
    Assert.assertSame("class@anonymous", getDebugType(new (class extends Unregistered {})()));
    // The package root exports the same functions.
    Assert.assertSame(arrayEntries, root.arrayEntries);
    Assert.assertSame(arrayFromEntries, root.arrayFromEntries);
    Assert.assertSame(normalizeKey, root.normalizeKey);
    Assert.assertSame(gettype, root.gettype);
    Assert.assertSame(getDebugType, root.getDebugType);
  },
);

class Serializable {
  get [JsonSerializable.brand](): true {
    return true;
  }

  jsonSerialize(): unknown {
    return { serialized: true };
  }
}

xaravelTest(
  "XT-runtime-52",
  "Traversable, Iterator, IteratorAggregate, JsonSerializable, Stringable and Throwable are recorded contract tokens under their PHP names; the runtime's throwables are Throwable and Stringable; jsonEncode reads the JsonSerializable brand; every runtime entry resolves 'Throwable' and keeps the 24-entry built-in class map (ESC-14.1-2)",
  () => {
    const tokens: [string, object, readonly object[], readonly string[], readonly string[]][] = [
      ["Traversable", Traversable, [], [], []],
      ["Iterator", Iterator, [Traversable], ["current", "key", "next", "rewind", "valid"], []],
      ["IteratorAggregate", IteratorAggregate, [Traversable], [], ["getIterator"]],
      ["JsonSerializable", JsonSerializable, [], ["jsonSerialize"], []],
      ["Stringable", Stringable, [], [], ["__toString"]],
      ["Throwable", Throwable, [Stringable], ["getMessage", "getCode", "getFile", "getLine", "getTrace", "getPrevious", "getTraceAsString"], []],
    ];
    const lookup = (globalThis as Record<symbol, unknown>)[CLASS_LOOKUP] as (name: string) => unknown;
    for (const [name, token, parents, methods, builtins] of tokens) {
      Assert.assertTrue(isContractToken(token), name);
      Assert.assertSame(name, fqcn(token), name);
      Assert.assertTrue(interfaceExists(name), name);
      Assert.assertTrue(interfaceExists(`\\${name.toLowerCase()}`), name);
      Assert.assertSame(Symbol.for(name), (token as { brand: symbol }).brand, name);
      Assert.assertTrue(token === lookup(name), name);
      Assert.assertTrue((root as Record<string, unknown>)[name] === token, name);
      Assert.assertTrue((php as Record<string, unknown>)[name] === token, name);
      const record = token as Record<symbol, unknown>;
      Assert.assertSame(parents.length, (record[CONTRACT_PARENTS] as readonly object[]).length, name);
      parents.forEach((parent, index) => Assert.assertTrue(parent === (record[CONTRACT_PARENTS] as readonly object[])[index], name));
      Assert.assertSame(methods.join(","), (record[CONTRACT_METHODS] as readonly string[]).join(","), name);
      Assert.assertSame(builtins.join(","), ((record[CONTRACT_BUILTINS] as readonly string[] | undefined) ?? []).join(","), name);
    }

    // Throwable: the runtime's throwables, every subclass included, carry it and Stringable; a JS Error does not.
    for (const error of [new PhpError(), new Exception(), new InvalidArgumentException(), new PhpTypeError(), new BadMethodCallException()]) {
      Assert.assertTrue(error instanceof Throwable, fqcn(error.constructor as abstract new (...args: never[]) => unknown));
      Assert.assertTrue(error instanceof Stringable);
      Assert.assertTrue(hasBrand(error, Throwable));
    }
    Assert.assertTrue(hasBrand(InvalidArgumentException, Throwable));
    Assert.assertFalse(new globalThis.Error() instanceof Throwable);
    Assert.assertFalse(new globalThis.Error() instanceof Stringable);
    Assert.assertFalse(new stdClass() instanceof Throwable);
    // The JS toString() is kept.
    Assert.assertSame("Exception: m", String(new Exception("m")));

    // JsonSerializable: the brand is the key jsonEncode reads.
    const serializable = new Serializable();
    Assert.assertTrue(serializable instanceof JsonSerializable);
    Assert.assertTrue(hasBrand(Serializable, JsonSerializable));
    Assert.assertSame('{"serialized":true}', jsonEncode(serializable));
    Assert.assertSame('[{"serialized":true}]', jsonEncode([serializable]));

    // The classes are registered under their PHP names, not in the 24-entry built-in map.
    for (const klass of [ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator]) {
      const name = fqcn(klass);
      Assert.assertSame(klass, resolveClass(name));
      Assert.assertSame(klass, lookup(name));
      Assert.assertSame((root as Record<string, unknown>)[name], klass, name);
      Assert.assertFalse(interfaceExists(name), name);
    }
    Assert.assertSame("ArrayIterator,ArrayObject,CachingIterator,WeakMap,InternalIterator", [ArrayIterator, ArrayObject, CachingIterator, WeakMap, InternalIterator].map((klass) => fqcn(klass)).join(","));
    const map = (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.php.classes")] as Record<string, unknown>;
    Assert.assertSame(24, Object.keys(map).length);

    // A fresh process: each entry resolves 'Throwable' to the token and keeps the 24-entry map.
    for (const entry of ENTRIES) {
      const run = child(
        `const m = await import(${JSON.stringify(resolve(PACKAGE_DIR, entry))}); const php = await import("@xaravel/runtime/php"); const t = globalThis[Symbol.for("xaravel.class.lookup")]("Throwable"); console.log(t === php.Throwable, t[Symbol.for("xaravel.class.fqcn")], Object.keys(globalThis[Symbol.for("xaravel.php.classes")]).length);`,
      );
      Assert.assertSame(0, run.code, `${entry}: ${run.err}`);
      Assert.assertSame("true Throwable 24", run.out, entry);
    }
    for (const entry of ENTRIES) {
      // Before the php entry loads anything else: the lookup already names the token.
      const run = child(`await import(${JSON.stringify(resolve(PACKAGE_DIR, entry))}); const t = globalThis[Symbol.for("xaravel.class.lookup")]("throwable"); console.log(t === null ? "null" : t[Symbol.for("xaravel.class.fqcn")]);`);
      Assert.assertSame(0, run.code, `${entry}: ${run.err}`);
      Assert.assertSame("Throwable", run.out, entry);
    }
  },
  60_000,
);

/** An `ArrayIterator` subclass whose constructor PHP never runs for `getIterator()`. */
class SubIterator extends ArrayIterator {
  constructor() {
    super();
    throw new globalThis.Error("SubIterator's constructor ran");
  }
}

registerClass("XaravelFixture\\PhpBuiltins\\SubIterator", SubIterator);

const PHP_PROPERTIES: unique symbol = Symbol.for("xaravel.php.properties");

/** An `ArrayIterator` subclass declaring a PHP property with a default. */
class PropIterator extends ArrayIterator {
  static readonly [PHP_PROPERTIES] = [{ name: "tags", visibility: "public", default: [] }];
  declare tags: unknown[];
}

registerClass("XaravelFixture\\PhpBuiltins\\PropIterator", PropIterator);

/** An `ArrayIterator` subclass the Registry does not hold. */
class UnregisteredIterator extends ArrayIterator {}

/** An `ArrayIterator` subclass with a `__toString`. */
class InnerIterator extends ArrayIterator {
  override toString(): string {
    return `inner@${String(this.key())}`;
  }
}

registerClass("XaravelFixture\\PhpBuiltins\\InnerIterator", InnerIterator);

/** An `ArrayObject` subclass declaring a protected, a private and a public property. */
class MembersObject extends ArrayObject {
  static readonly [PHP_PROPERTIES] = [
    { name: "p", visibility: "protected", default: 1 },
    { name: "q", visibility: "private", default: 2 },
    { name: "r", visibility: "public", default: 3 },
  ];
}

registerClass("XaravelFixture\\PhpBuiltins\\MembersObject", MembersObject);

/** The keys an iterator walks after `steps` `next()` calls, then `exchangeArray(next)` on its owner. */
function keyAfterExchange(steps: number, next: Record<string, number>): unknown {
  const object = new ArrayObject({ x: 1, y: 2, z: 3 });
  const iterator = object.getIterator();
  for (let index = 0; index < steps; index++) {
    iterator.next();
  }
  object.exchangeArray(next);
  return iterator.key();
}

xaravelTest(
  "XT-runtime-53",
  "ArrayIterator and ArrayObject hold a PHP array as PHP 8.5 does: offset access (an undefined key as null), append, count, getArrayCopy, values / entries() / keys() iteration, PHP's hash position (appends, deletes, re-set keys, exchangeArray keeping the index), an ArrayObject wrapping another, json_encode, serialize, __unserialize's checks, setIteratorClass, the Countable and ArrayAccess brands the grader reads, and PHP's TypeError for a scalar argument (ESC-14.1-2)",
  () => {
    // ArrayIterator: push-style writes, the PHP protocol, and the three iteration forms.
    const it = new ArrayIterator({ a: 1 });
    it.offsetSet(null, "x");
    it.offsetSet(undefined, "y");
    Assert.assertSame(3, it.count());
    Assert.assertSame(json([["a", 1], [0, "x"], [1, "y"]]), json(arrayEntries(it.getArrayCopy() as object)));
    Assert.assertTrue(it instanceof Iterator);
    Assert.assertTrue(it instanceof Traversable);
    Assert.assertFalse(it instanceof IteratorAggregate);
    Assert.assertTrue(it.valid());
    Assert.assertSame("a", it.key());
    const walked: unknown[] = [];
    for (it.rewind(); it.valid(); it.next()) {
      walked.push([it.key(), it.current()]);
    }
    Assert.assertSame(json([["a", 1], [0, "x"], [1, "y"]]), json(walked));
    Assert.assertNull(it.key());
    Assert.assertNull(it.current());
    Assert.assertFalse(it.valid());
    Assert.assertSame(json([1, "x", "y"]), json([...it]));
    Assert.assertSame(json([["a", 1], [0, "x"], [1, "y"]]), json([...it.entries()]));
    Assert.assertSame(json(["a", 0, 1]), json([...it.keys()]));
    const values: unknown[] = [];
    for (const value of it) {
      values.push(value);
    }
    Assert.assertSame(json([1, "x", "y"]), json(values));
    // getArrayCopy is a copy; offsetExists is true for a null value; a missing (or undefined) key reads null.
    const copy = it.getArrayCopy() as PhpArray;
    copy.set("a", 99);
    Assert.assertSame(1, it.offsetGet("a"));
    it.offsetSet("n", null);
    Assert.assertTrue(it.offsetExists("n"));
    Assert.assertFalse(it.offsetExists("missing"));
    Assert.assertNull(it.offsetGet("missing"));
    it.offsetSet("", "empty");
    Assert.assertSame("empty", it.offsetGet(undefined));
    Assert.assertTrue(it.offsetExists(undefined));
    it.offsetUnset(undefined);
    Assert.assertFalse(it.offsetExists(""));
    Assert.assertSame(json([1, 2]), json(new ArrayIterator([1, 2]).getArrayCopy()));
    Assert.assertSame(0, new ArrayIterator().count());

    // PHP's hash position. At the end: an append is reached, also after the last entry was deleted.
    const atEnd = new ArrayIterator({ a: 1, b: 2 });
    atEnd.next();
    atEnd.next();
    Assert.assertFalse(atEnd.valid());
    atEnd.offsetUnset("b");
    atEnd.offsetSet("c", 3);
    Assert.assertTrue(atEnd.valid());
    Assert.assertSame("c", atEnd.key());
    const pushed = new ArrayIterator({ a: 1, b: 2 });
    pushed.next();
    pushed.next();
    pushed.offsetUnset("b");
    pushed.append(5);
    Assert.assertTrue(pushed.valid());
    Assert.assertSame(0, pushed.key());
    // The current entry deleted: the position moves to the next entry, and next() steps past it.
    const positioned = new ArrayIterator({ a: 1, b: 2, c: 3 });
    positioned.next();
    positioned.offsetUnset("b");
    Assert.assertSame("c", positioned.key());
    positioned.next();
    Assert.assertNull(positioned.key());
    const lastDeleted = new ArrayIterator({ a: 1, b: 2 });
    lastDeleted.next();
    lastDeleted.offsetUnset("b");
    Assert.assertFalse(lastDeleted.valid());
    lastDeleted.offsetSet("z", 1);
    Assert.assertSame("z", lastDeleted.key());
    // A deleted-and-re-set current key: the position moves on, and the key is visited again at its new place.
    for (const rewound of [false, true]) {
      const reset = new ArrayIterator({ a: 1, b: 2, c: 3 });
      if (rewound) {
        reset.rewind();
      }
      reset.offsetUnset("a");
      reset.offsetSet("a", 9);
      Assert.assertSame("b", reset.key());
    }
    for (const subject of [new ArrayIterator({ a: 1, b: 2, c: 3 }), new ArrayObject({ a: 1, b: 2, c: 3 })]) {
      const seen: unknown[] = [];
      let done = false;
      for (const [key] of subject.entries()) {
        seen.push(key);
        if (key === "a" && !done) {
          done = true;
          subject.offsetUnset("a");
          subject.offsetSet("a", 9);
        }
      }
      Assert.assertSame("a,c,a", seen.join(","));
    }

    // ArrayObject: an IteratorAggregate whose getIterator() wraps it, with its flags.
    const object = new ArrayObject({ x: 1 });
    const iterator = object.getIterator();
    Assert.assertTrue(iterator instanceof ArrayIterator);
    Assert.assertTrue(object instanceof IteratorAggregate);
    Assert.assertTrue(object instanceof Traversable);
    Assert.assertFalse(object instanceof Iterator);
    object.offsetSet("y", 2);
    Assert.assertSame(json([["x", 1], ["y", 2]]), json([...iterator.entries()]));
    Assert.assertSame(json([1, 2]), json([...object]));
    Assert.assertSame(json([["x", 1], ["y", 2]]), json([...object.entries()]));
    Assert.assertSame(json(["x", "y"]), json([...object.keys()]));
    Assert.assertSame(2, object.count());
    object.offsetSet("n", null);
    Assert.assertTrue(object.offsetExists("n"));
    object.offsetUnset("n");
    Assert.assertFalse(object.offsetExists("n"));
    Assert.assertSame(json({ x: 1, y: 2 }), json(object.exchangeArray([1, 2])));
    Assert.assertSame(json([1, 2]), json(object.getArrayCopy()));
    Assert.assertSame(json([[0, 1], [1, 2]]), json([...iterator.entries()]));
    Assert.assertSame(2, new ArrayObject([1], ArrayObject.ARRAY_AS_PROPS).getIterator().getFlags());
    Assert.assertSame('{"0":1,"1":2}', jsonEncode(object));
    Assert.assertSame('{"a":1}', jsonEncode(new ArrayObject({ a: 1 })));
    Assert.assertSame("{}", jsonEncode(new ArrayObject()));
    Assert.assertSame('O:11:"ArrayObject":4:{i:0;i:0;i:1;a:2:{i:0;i:1;i:1;i:2;}i:2;a:0:{}i:3;N;}', phpSerialize(object));
    Assert.assertSame('O:13:"ArrayIterator":4:{i:0;i:0;i:1;a:1:{i:0;i:1;}i:2;a:0:{}i:3;N;}', phpSerialize(new ArrayIterator([1])));
    Assert.assertSame(
      'O:13:"ArrayIterator":4:{i:0;i:2;i:1;O:11:"ArrayObject":4:{i:0;i:2;i:1;a:1:{i:0;i:1;}i:2;a:0:{}i:3;N;}i:2;a:0:{}i:3;N;}',
      phpSerialize(new ArrayObject([1], ArrayObject.ARRAY_AS_PROPS).getIterator()),
    );
    object.append(3);
    object.offsetSet(null, 4);
    object.offsetSet(undefined, 5);
    Assert.assertSame(json([1, 2, 3, 4, 5]), json(object.getArrayCopy()));
    const restored = phpUnserialize(phpSerialize(object)) as ArrayObject;
    Assert.assertTrue(restored instanceof ArrayObject);
    Assert.assertSame(json([1, 2, 3, 4, 5]), json(restored.getArrayCopy()));
    Assert.assertSame(5, restored.count());
    Assert.assertEquals(new ArrayObject([1]), new ArrayObject([1]));
    Assert.assertNotEquals(new ArrayObject([1]), new ArrayObject([2]));
    Assert.assertSame("1 2 1 2", [ArrayObject.STD_PROP_LIST, ArrayObject.ARRAY_AS_PROPS, ArrayIterator.STD_PROP_LIST, ArrayIterator.ARRAY_AS_PROPS].join(" "));
    const flagged = new ArrayObject([], ArrayObject.ARRAY_AS_PROPS);
    Assert.assertSame(2, flagged.getFlags());
    flagged.setFlags(ArrayObject.STD_PROP_LIST);
    Assert.assertSame(1, flagged.getFlags());

    // exchangeArray: an iterator keeps its position index.
    Assert.assertSame(json(["p", "q", "r", null]), json([0, 1, 2, 3].map((steps) => keyAfterExchange(steps, { p: 1, q: 2, r: 3 }))));
    Assert.assertSame(json(["p", null, null, null]), json([0, 1, 2, 3].map((steps) => keyAfterExchange(steps, { p: 1 }))));
    const exchanging = new ArrayObject({ x: 1, y: 2, z: 3 });
    const exchangedKeys: unknown[] = [];
    for (const key of exchanging.keys()) {
      exchangedKeys.push(key);
      if (key === "x") {
        exchanging.exchangeArray({ p: 1, q: 2, r: 3 });
      }
    }
    Assert.assertSame("x,q,r", exchangedKeys.join(","));

    // Wrapping: an ArrayObject (or ArrayIterator) over another reads and writes its current storage.
    const inner = new ArrayObject([1]);
    const outer = new ArrayObject(inner);
    outer.offsetSet(null, 2);
    Assert.assertSame(2, inner.count());
    Assert.assertSame(
      'O:11:"ArrayObject":4:{i:0;i:0;i:1;O:11:"ArrayObject":4:{i:0;i:0;i:1;a:2:{i:0;i:1;i:1;i:2;}i:2;a:0:{}i:3;N;}i:2;a:0:{}i:3;N;}',
      phpSerialize(outer),
    );
    outer.exchangeArray([5, 6]);
    Assert.assertSame(json([1, 2]), json(inner.getArrayCopy()));
    Assert.assertSame(json([5, 6]), json(outer.getArrayCopy()));
    const target = new ArrayObject([1]);
    const exchanged = new ArrayObject([0]);
    exchanged.exchangeArray(target);
    exchanged.append(7);
    Assert.assertSame(json([1, 7]), json(target.getArrayCopy()));
    new ArrayIterator(target).append(8);
    Assert.assertSame(3, target.count());
    // An instance phpUnserialize built is wrapped too.
    const unserialized = phpUnserialize(phpSerialize(new ArrayObject([1]))) as ArrayObject;
    new ArrayObject(unserialized).append(2);
    Assert.assertSame(2, unserialized.count());
    // Wrapping back to itself takes a copy instead.
    const self = new ArrayObject([1]);
    self.exchangeArray(new ArrayObject(self));
    Assert.assertSame(json([1]), json(self.getArrayCopy()));
    // Another object's properties are copied.
    const props = new stdClass() as stdClass & Record<string, unknown>;
    props["a"] = 1;
    const overProps = new ArrayObject(props);
    overProps.offsetSet("b", 2);
    Assert.assertSame(json({ a: 1, b: 2 }), json(overProps.getArrayCopy()));
    Assert.assertSame(json(["a"]), json(Object.keys(props)));

    // __unserialize: PHP's checks, and the members restored as properties.
    const members = new ArrayObject([9]);
    members.__unserialize([0, { a: 1 }, { foo: "bar" }, null]);
    Assert.assertSame(json({ a: 1 }), json(members.getArrayCopy()));
    Assert.assertSame("bar", (members as unknown as Record<string, unknown>)["foo"]);
    Assert.assertSame('O:11:"ArrayObject":4:{i:0;i:0;i:1;a:1:{s:1:"a";i:1;}i:2;a:1:{s:3:"foo";s:3:"bar";}i:3;N;}', phpSerialize(members));
    const incomplete = "Incomplete or ill-typed serialization data";
    for (const data of [[0], [0, []], ["x", [], []], [0, [], "x"], [0, [], [], 1]]) {
      assertThrows(UnexpectedValueException, incomplete, () => new ArrayObject().__unserialize(data));
    }
    assertThrows(InvalidArgumentException, "Passed variable is not an array or object", () => new ArrayObject().__unserialize([0, 5, []]));
    assertThrows(UnexpectedValueException, "Cannot deserialize ArrayObject with iterator class 'Foo'; no such class exists", () => new ArrayObject().__unserialize([0, [], [], "Foo"]));
    assertThrows(
      UnexpectedValueException,
      "Cannot deserialize ArrayObject with iterator class 'stdClass'; this class does not implement the Iterator interface",
      () => new ArrayObject().__unserialize([0, [], [], "stdClass"]),
    );
    const detached = new ArrayObject(inner);
    detached.__unserialize([0, [3], []]);
    Assert.assertSame(json([1, 2]), json(inner.getArrayCopy()));

    // setIteratorClass: a class derived from ArrayIterator, built without its constructor.
    const custom = new ArrayObject([1, 2]);
    assertThrows(
      PhpTypeError,
      "ArrayObject::setIteratorClass(): Argument #1 ($iteratorClass) must be a class name derived from ArrayIterator, stdClass given",
      () => custom.setIteratorClass("stdClass"),
    );
    assertThrows(
      PhpTypeError,
      "ArrayObject::__construct(): Argument #3 ($iteratorClass) must be a class name derived from ArrayIterator, stdClass given",
      () => new ArrayObject([], 0, "stdClass"),
    );
    Assert.assertSame("ArrayIterator", custom.getIteratorClass());
    custom.setIteratorClass("XaravelFixture\\PhpBuiltins\\SubIterator");
    const sub = custom.getIterator();
    Assert.assertTrue(sub instanceof SubIterator);
    Assert.assertSame(json([1, 2]), json([...sub]));
    Assert.assertSame("XaravelFixture\\PhpBuiltins\\SubIterator", custom.getIteratorClass());
    const subSerialized = phpSerialize(custom);
    Assert.assertSame('O:11:"ArrayObject":4:{i:0;i:0;i:1;a:2:{i:0;i:1;i:1;i:2;}i:2;a:0:{}i:3;s:38:"XaravelFixture\\PhpBuiltins\\SubIterator";}', subSerialized);
    Assert.assertSame("XaravelFixture\\PhpBuiltins\\SubIterator", (phpUnserialize(subSerialized) as ArrayObject).getIteratorClass());
    custom.setIteratorClass(ArrayIterator);
    Assert.assertSame("ArrayIterator", custom.getIteratorClass());

    // Xaravel-only: unregistered iterator classes are refused, as getIteratorClass() and serialize could not name them;
    // PHP takes a class-string, which always names its class.
    assertThrows(
      PhpTypeError,
      "ArrayObject::setIteratorClass(): Argument #1 ($iteratorClass) must be a class name derived from ArrayIterator, UnregisteredIterator given",
      () => custom.setIteratorClass(UnregisteredIterator),
    );
    // An iterator class's declared property defaults are set, each a fresh copy.
    const withProps = new ArrayObject([1]);
    withProps.setIteratorClass(PropIterator);
    const firstProps = withProps.getIterator() as PropIterator;
    const secondProps = withProps.getIterator() as PropIterator;
    Assert.assertTrue(firstProps instanceof PropIterator);
    Assert.assertSame("[]", json(firstProps.tags));
    firstProps.tags.push(1);
    Assert.assertSame("[]", json(secondProps.tags));
    Assert.assertSame("[]", json(PropIterator[PHP_PROPERTIES][0]?.default));

    // Nested arrays are copied in and out, as PHP copies arrays by value.
    const nestedSource: unknown[][] = [[1]];
    for (const nested of [new ArrayObject(nestedSource), new ArrayIterator(nestedSource)]) {
      (nestedSource[0] as unknown[]).push(2);
      const nestedCopy = nested.getArrayCopy() as unknown[][];
      (nestedCopy[0] as unknown[]).push(3);
      Assert.assertSame(json([[1]]), json(nested.getArrayCopy()));
      nestedSource[0] = [1];
    }

    // An ArrayIterator serialised and restored.
    const roundTrip = new ArrayIterator({ a: 1, b: 2 });
    roundTrip.next();
    const roundTripped = phpSerialize(roundTrip);
    Assert.assertSame('O:13:"ArrayIterator":4:{i:0;i:0;i:1;a:2:{s:1:"a";i:1;s:1:"b";i:2;}i:2;a:0:{}i:3;N;}', roundTripped);
    const restoredIterator = phpUnserialize(roundTripped) as ArrayIterator;
    Assert.assertTrue(restoredIterator instanceof ArrayIterator);
    Assert.assertSame("a", restoredIterator.key());
    Assert.assertSame(json({ a: 1, b: 2 }), json(restoredIterator.getArrayCopy()));

    // An iterator over an ArrayObject that wraps another keeps its index when the outer one exchanges.
    const wrappedInner = new ArrayObject({ x: 1, y: 2, z: 3 });
    const wrappingOuter = new ArrayObject(wrappedInner);
    const overWrapper = wrappingOuter.getIterator();
    overWrapper.next();
    wrappingOuter.exchangeArray({ p: 1, q: 2, r: 3 });
    Assert.assertSame("q", overWrapper.key());
    Assert.assertSame(3, wrappedInner.count());

    // Members: protected and private names mangled, and restored under their own names.
    const memberSerialized = phpSerialize(new MembersObject([1]));
    const owner = "XaravelFixture\\PhpBuiltins\\MembersObject";
    Assert.assertSame(
      `O:${String(owner.length)}:"${owner}":4:{i:0;i:0;i:1;a:1:{i:0;i:1;}i:2;a:3:{s:4:"\0*\0p";i:1;s:${String(owner.length + 3)}:"\0${owner}\0q";i:2;s:1:"r";i:3;}i:3;N;}`,
      memberSerialized,
    );
    const restoredMembers = phpUnserialize(memberSerialized) as MembersObject & Record<string, unknown>;
    Assert.assertSame("1 2 3", [restoredMembers["p"], restoredMembers["q"], restoredMembers["r"]].join(" "));
    Assert.assertSame(json([1]), json(restoredMembers.getArrayCopy()));

    // Flags: PHP keeps only the low 16 bits from the constructor and setFlags, and __unserialize takes the bits in
    // SPL_ARRAY_CLONE_MASK (0x0100FFFF), of which the internal 0x01000000 is not ported.
    const masked = new ArrayObject([], 0x02000000);
    Assert.assertSame(0, masked.getFlags());
    masked.__unserialize([0x04000003, [], []]);
    Assert.assertSame(3, masked.getFlags());
    masked.setFlags(0x02000006);
    Assert.assertSame(6, masked.getFlags());

    // The grader reads the brands and the values.
    for (const subject of [new ArrayObject(["x"]), new ArrayIterator(["x"])]) {
      Assert.assertContains("x", subject);
      Assert.assertNotContains("y", subject);
      Assert.assertCount(1, subject);
      Assert.assertTrue(Symbol.for("Countable") in subject);
      Assert.assertTrue(Symbol.for("ArrayAccess") in subject);
    }

    assertThrows(PhpTypeError, "ArrayIterator::__construct(): Argument #1 ($array) must be of type array, int given", () => new ArrayIterator(5));
    assertThrows(PhpTypeError, "ArrayObject::__construct(): Argument #1 ($array) must be of type array, string given", () => new ArrayObject("s"));
    assertThrows(PhpTypeError, "ArrayObject::__construct(): Argument #1 ($array) must be of type array, null given", () => new ArrayObject(null));
    assertThrows(PhpTypeError, "ArrayObject::exchangeArray(): Argument #1 ($array) must be of type array, int given", () => new ArrayObject().exchangeArray(1));
  },
);

xaravelTest(
  "XT-runtime-54",
  "CachingIterator fetches one element ahead as PHP 8.5 does: CALL_TOSTRING by default, hasNext(), values / entries() / keys() iteration, the string flags, FULL_CACHE's getCache() and count() (an object key failing after the element is cached), the Countable brand, and PHP's BadMethodCallException, ValueError and TypeError (ESC-14.1-2)",
  () => {
    Assert.assertSame(1, CachingIterator.CALL_TOSTRING);
    Assert.assertSame("2 4 8 16 256", [CachingIterator.TOSTRING_USE_KEY, CachingIterator.TOSTRING_USE_CURRENT, CachingIterator.TOSTRING_USE_INNER, CachingIterator.CATCH_GET_CHILD, CachingIterator.FULL_CACHE].join(" "));
    const caching = new CachingIterator(new ArrayIterator({ a: "x", b: "y" }));
    Assert.assertSame(CachingIterator.CALL_TOSTRING, caching.getFlags());
    Assert.assertTrue(caching instanceof Iterator);
    Assert.assertTrue(caching instanceof Traversable);
    Assert.assertTrue(caching instanceof Stringable);
    Assert.assertTrue(Symbol.for("Countable") in caching);
    Assert.assertTrue(caching.getInnerIterator() instanceof ArrayIterator);
    // Before a rewind: nothing fetched, the inner iterator still valid.
    Assert.assertFalse(caching.valid());
    Assert.assertNull(caching.current());
    Assert.assertTrue(caching.hasNext());
    Assert.assertSame("", caching.toString());
    const seen: string[] = [];
    for (const [key, value] of caching.entries()) {
      seen.push(`${String(key)}=${String(value)} ${String(caching.hasNext())} ${String(caching)} ${caching.toString()}`);
    }
    Assert.assertSame("a=x true x x|b=y false y y", seen.join("|"));
    Assert.assertSame(json(["x", "y"]), json([...caching]));
    Assert.assertSame(json(["a", "b"]), json([...caching.keys()]));
    Assert.assertFalse(caching.valid());
    Assert.assertNull(caching.key());
    Assert.assertNull(caching.current());
    Assert.assertSame("", String(caching));
    // CALL_TOSTRING converts as PHP's (string) does.
    const converted = new CachingIterator(new ArrayIterator([float(1.5), null, true]));
    const strings: string[] = [];
    for (converted.rewind(); converted.valid(); converted.next()) {
      strings.push(converted.toString());
    }
    Assert.assertSame("1.5,,1", strings.join(","));

    const keyed = new CachingIterator(new ArrayIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_KEY);
    keyed.rewind();
    Assert.assertSame("a", keyed.toString());
    const current = new CachingIterator(new ArrayIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_CURRENT);
    current.rewind();
    Assert.assertSame("1", current.toString());
    const inner = new CachingIterator(new ArrayIterator({ a: 1 }), CachingIterator.TOSTRING_USE_INNER);
    assertThrows(PhpError, "Object of class ArrayIterator could not be converted to string", () => inner.rewind());

    const full = new CachingIterator(new ArrayIterator({ a: 1, b: 2, c: 3 }), CachingIterator.FULL_CACHE);
    full.rewind();
    Assert.assertSame(json({ a: 1 }), json(full.getCache()));
    Assert.assertSame(1, full.count());
    Assert.assertSame(json([1, 2, 3]), json([...full]));
    Assert.assertSame(json({ a: 1, b: 2, c: 3 }), json(full.getCache()));
    Assert.assertSame(3, full.count());
    // A rewind clears the cache, so an entry unset meanwhile is gone from it.
    const unsetInner = new ArrayIterator({ a: 1, b: 2, c: 3 });
    const rewound = new CachingIterator(unsetInner, CachingIterator.FULL_CACHE);
    Assert.assertSame(json([1, 2, 3]), json([...rewound]));
    unsetInner.offsetUnset("b");
    rewound.rewind();
    Assert.assertSame(json([1, 3]), json([...rewound]));
    Assert.assertSame(json({ a: 1, c: 3 }), json(rewound.getCache()));
    // getCache() is a copy, nested arrays included.
    const nestedCache = new CachingIterator(new ArrayIterator({ a: [1] }), CachingIterator.FULL_CACHE);
    nestedCache.rewind();
    ((nestedCache.getCache() as Record<string, unknown[]>)["a"] as unknown[]).push(2);
    Assert.assertSame(json({ a: [1] }), json(nestedCache.getCache()));
    // An undefined inner key reads as null (AD-9), the "" key of the cache.
    const undefinedKey = new CachingIterator(new UndefinedKeyIterator([["k", 1]]), CachingIterator.FULL_CACHE);
    undefinedKey.rewind();
    Assert.assertNull(undefinedKey.key());
    Assert.assertSame(json({ "": 1 }), json(undefinedKey.getCache()));
    // TOSTRING_USE_INNER: the inner iterator's string, taken at the fetch.
    const usingInner = new CachingIterator(new InnerIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_INNER);
    const innerStrings: string[] = [];
    for (const _ of usingInner) {
      innerStrings.push(String(usingInner));
    }
    Assert.assertSame("inner@a,inner@b", innerStrings.join(","));
    // An object key under FULL_CACHE: PHP's TypeError once the element is cached, the inner iterator not moved.
    const objectKey = new stdClass();
    const objectKeyed = new CachingIterator(new KeyedIterator([["a", 1], [objectKey, 2], ["c", 3]]), CachingIterator.FULL_CACHE);
    const before: unknown[] = [];
    assertThrows(PhpTypeError, "Cannot access offset of type stdClass on array", () => {
      for (const [key, value] of objectKeyed.entries()) {
        before.push(`${String(key)}=${String(value)}`);
      }
    });
    Assert.assertSame("a=1", before.join(","));
    Assert.assertTrue(objectKeyed.valid());
    Assert.assertSame(2, objectKeyed.current());
    Assert.assertSame(objectKey, objectKeyed.key());
    Assert.assertSame(json({ a: 1 }), json(objectKeyed.getCache()));
    Assert.assertTrue(objectKeyed.hasNext());

    const plain = new CachingIterator(new ArrayIterator({ a: "x" }), 0);
    assertThrows(BadMethodCallException, "CachingIterator does not fetch string value (see CachingIterator::__construct)", () => plain.toString());
    assertThrows(BadMethodCallException, "CachingIterator does not fetch string value (see CachingIterator::__construct)", () => String(plain));
    assertThrows(BadMethodCallException, "CachingIterator does not use a full cache (see CachingIterator::__construct)", () => plain.getCache());
    assertThrows(BadMethodCallException, "CachingIterator does not use a full cache (see CachingIterator::__construct)", () => plain.count());
    const twoFlags =
      "CachingIterator::__construct(): Argument #2 ($flags) must contain only one of CachingIterator::CALL_TOSTRING, CachingIterator::TOSTRING_USE_KEY, CachingIterator::TOSTRING_USE_CURRENT, or CachingIterator::TOSTRING_USE_INNER";
    assertThrows(ValueError, twoFlags, () => new CachingIterator(new ArrayIterator([]), CachingIterator.CALL_TOSTRING | CachingIterator.TOSTRING_USE_KEY));
    assertThrows(ValueError, twoFlags, () => new CachingIterator(new ArrayIterator([]), CachingIterator.TOSTRING_USE_KEY | CachingIterator.TOSTRING_USE_INNER));
    assertThrows(PhpTypeError, "CachingIterator::__construct(): Argument #1 ($iterator) must be of type Iterator, array given", () => new CachingIterator([1] as never));
    assertThrows(PhpTypeError, "CachingIterator::__construct(): Argument #1 ($iterator) must be of type Iterator, ArrayObject given", () => new CachingIterator(new ArrayObject() as never));
  },
);

/** Puts `count` keys whose values reference them into `map`, and keeps none of them. */
function fillWithSelfReferences(map: WeakMap, count: number): void {
  for (let index = 0; index < count; index++) {
    const key = new stdClass() as stdClass & Record<string, unknown>;
    key["self"] = key;
    map.offsetSet(key, [key]);
  }
}

xaravelTest(
  "XT-runtime-55",
  "WeakMap takes object keys, iterates in insertion order (a rewritten key keeping its position) as values / entries() / keys(), counts, treats a null value as not set, holds neither key nor value strongly (a collected key's entry is gone), and throws PHP 8.5's TypeError, Error and serialization Exception (ESC-14.1-2)",
  async () => {
    const map = new WeakMap();
    const a = new stdClass();
    const b = new stdClass();
    map.offsetSet(b, 1);
    map.offsetSet(a, 2);
    map.offsetSet(b, 3);
    const order = [...map.entries()].map(([key, value]) => `${key === b ? "b" : key === a ? "a" : "?"}=${String(value)}`);
    Assert.assertSame("b=3,a=2", order.join(","));
    Assert.assertSame(json([3, 2]), json([...map]));
    const keys = [...map.keys()];
    Assert.assertTrue(keys.length === 2 && keys[0] === b && keys[1] === a);
    Assert.assertSame(2, map.count());
    Assert.assertSame(3, map.offsetGet(b));
    Assert.assertTrue(map instanceof IteratorAggregate);
    Assert.assertTrue(map instanceof Traversable);
    Assert.assertTrue(Symbol.for("Countable") in map);
    Assert.assertTrue(Symbol.for("ArrayAccess") in map);
    Assert.assertCount(2, map);
    Assert.assertContains(3, map);
    const iterator = map.getIterator();
    Assert.assertTrue(iterator instanceof InternalIterator);
    Assert.assertTrue(iterator instanceof Iterator);
    Assert.assertTrue(iterator.valid());
    Assert.assertSame(b, iterator.key());
    Assert.assertSame(3, iterator.current());
    iterator.next();
    iterator.next();
    Assert.assertFalse(iterator.valid());
    Assert.assertNull(iterator.key());
    Assert.assertNull(iterator.current());
    // An entry added past the end is reached, as PHP's position does.
    const c = new stdClass();
    map.offsetSet(c, 4);
    Assert.assertTrue(iterator.valid());
    Assert.assertSame(c, iterator.key());
    map.offsetUnset(c);
    assertThrows(PhpError, "Call to private InternalIterator::__construct() from global scope", () => new InternalIterator());

    map.offsetSet(a, null);
    Assert.assertFalse(map.offsetExists(a));
    Assert.assertTrue(map.offsetExists(b));
    map.offsetUnset(a);
    map.offsetUnset(a);
    Assert.assertSame(1, map.count());
    const closure = (): number => 1;
    map.offsetSet(closure, "c");
    Assert.assertSame("c", map.offsetGet(closure));

    // `{}` is Xaravel-only: AD-9 reads a plain object as a PHP array, so PHP's counterpart is the `[]` key.
    for (const key of [1, "s", [], {}, null]) {
      if (key !== null) {
        assertThrows(PhpTypeError, "WeakMap key must be an object", () => map.offsetSet(key as never, 1));
      }
      assertThrows(PhpTypeError, "WeakMap key must be an object", () => map.offsetGet(key as never));
      assertThrows(PhpTypeError, "WeakMap key must be an object", () => map.offsetExists(key as never));
      assertThrows(PhpTypeError, "WeakMap key must be an object", () => map.offsetUnset(key as never));
    }
    assertThrows(PhpError, "Cannot append to WeakMap", () => map.offsetSet(null, 1));
    assertThrows(PhpError, "Cannot append to WeakMap", () => map.offsetSet(undefined, 1));
    const missing = thrownBy(() => map.offsetGet(new stdClass()));
    Assert.assertTrue(missing instanceof PhpError);
    Assert.assertMatchesRegularExpression(/^Object stdClass#\d+ not contained in WeakMap$/, (missing as globalThis.Error).message);
    const other = new ArrayObject();
    const first = (thrownBy(() => map.offsetGet(other)) as globalThis.Error).message;
    Assert.assertMatchesRegularExpression(/^Object ArrayObject#\d+ not contained in WeakMap$/, first);
    // The same object keeps its id.
    Assert.assertSame(first, (thrownBy(() => map.offsetGet(other)) as globalThis.Error).message);

    assertThrows(Exception, "Serialization of 'WeakMap' is not allowed", () => phpSerialize(map));
    assertThrows(Exception, "Unserialization of 'WeakMap' is not allowed", () => phpUnserialize('O:7:"WeakMap":0:{}'));
    assertThrows(Exception, "Serialization of 'InternalIterator' is not allowed", () => phpSerialize(map.getIterator()));
    assertThrows(Exception, "Unserialization of 'InternalIterator' is not allowed", () => phpUnserialize('O:16:"InternalIterator":0:{}'));
    Assert.assertSame("{}", jsonEncode(map));

    // Weak keys: an entry whose key is collected (its value referencing it) is gone from count() and iteration.
    const weak = new WeakMap();
    const kept = new stdClass();
    weak.offsetSet(kept, "kept");
    fillWithSelfReferences(weak, 100);
    for (let attempt = 0; attempt < 50 && weak.count() > 1; attempt++) {
      // A WeakRef read in this job keeps its target until the job ends, so collect in a later one.
      await Bun.sleep(1);
      Bun.gc(true);
    }
    // JSC scans the stack conservatively, so a key may survive; at least one is collected.
    Assert.assertLessThan(101, weak.count());
    Assert.assertSame(weak.count(), [...weak].length);
    Assert.assertSame(kept, weak.getIterator().key());
    Assert.assertSame("kept", weak.offsetGet(kept));
    Assert.assertTrue(weak.offsetExists(kept));
  },
);

/** `fn`'s throw as the probe writes it, `"<class>: <message>"` with an object id as `#<n>`; null when it returns. */
function thrownText(fn: () => unknown): string | null {
  const error = thrownBy(fn);
  if (error === null) {
    return null;
  }
  const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
  return `${fqcn(klass)}: ${(error as globalThis.Error).message.replace(/(Object \S+)#\d+/, "$1#<n>")}`;
}

/** The `[key, current]` pairs a `for (rewind; valid; next)` loop reads, as the probe's `walk`. */
function walkPairs(it: { rewind(): void; valid(): boolean; key(): unknown; current(): unknown; next(): void }): unknown[] {
  const pairs: unknown[] = [];
  for (it.rewind(); it.valid(); it.next()) {
    pairs.push([it.key(), it.current()]);
  }
  return pairs;
}

/** An ArrayIterator after `steps` `next()` calls. */
function stepped(array: unknown, steps: number): ArrayIterator {
  const it = new ArrayIterator(array);
  for (let index = 0; index < steps; index++) {
    it.next();
  }
  return it;
}

/** Each probe label's case computed with the runtime, the value `json_encode` gave in PHP. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  // XT-runtime-51
  gettype: () => [null, true, 1, 1.5, float(2), "s", [], new stdClass(), () => 1].map((value) => gettype(value)),
  get_debug_type: () => [null, true, 1, 1.5, float(2), "s", [], new stdClass(), () => 1].map((value) => getDebugType(value)),
  "get_debug_type.anon_extends_ArrayObject": () => getDebugType(new (class extends ArrayObject {})()),
  "get_debug_type.anon": () => getDebugType(new Unregistered()),
  "array_keys.normalised": () => ["07", "7", true, null, float(2.9)].map((key) => normalizeKey(key)),
  "offset.array": () => thrownText(() => normalizeKey([])),
  // XT-runtime-53
  "ArrayIterator.walk": () => {
    const it = new ArrayIterator({ a: 1 });
    it.offsetSet(null, "x");
    it.offsetSet(null, "y");
    return walkPairs(it);
  },
  "ArrayIterator.past_end": () => {
    const it = new ArrayIterator(new PhpArray<PhpKeyInput, unknown>([["a", 1], [0, "x"], [1, "y"]]));
    walkPairs(it);
    return [it.valid(), it.key(), it.current(), it.count()];
  },
  "ArrayIterator.values": () => [...new ArrayIterator(new PhpArray<PhpKeyInput, unknown>([["a", 1], [0, "x"], [1, "y"]]))],
  "ArrayIterator.offsetExists_null": () => {
    const it = new ArrayIterator({ n: null });
    return [it.offsetExists("n"), it.offsetExists("m"), it.offsetGet("n")];
  },
  "position.end_unset_set": () => {
    const it = stepped({ a: 1, b: 2 }, 2);
    it.offsetUnset("b");
    it.offsetSet("c", 3);
    return [it.valid(), it.key()];
  },
  "position.end_unset_push": () => {
    const it = stepped({ a: 1, b: 2 }, 2);
    it.offsetUnset("b");
    it.offsetSet(null, 5);
    return [it.valid(), it.key()];
  },
  "position.delete_current": () => {
    const it = stepped({ a: 1, b: 2, c: 3 }, 1);
    it.offsetUnset("b");
    const keys = [it.key()];
    it.next();
    keys.push(it.key());
    return keys;
  },
  "position.delete_last_then_set": () => {
    const it = stepped({ a: 1, b: 2 }, 1);
    it.offsetUnset("b");
    const out: unknown[] = [it.valid()];
    it.offsetSet("z", 1);
    out.push(it.key());
    return out;
  },
  "position.reset_unpositioned": () => {
    const it = new ArrayIterator({ a: 1, b: 2, c: 3 });
    it.offsetUnset("a");
    it.offsetSet("a", 9);
    return it.key();
  },
  "position.reset_rewound": () => {
    const it = new ArrayIterator({ a: 1, b: 2, c: 3 });
    it.rewind();
    it.offsetUnset("a");
    it.offsetSet("a", 9);
    return it.key();
  },
  "foreach.reset.ArrayIterator": () => foreachReset(new ArrayIterator({ a: 1, b: 2, c: 3 })),
  "foreach.reset.ArrayObject": () => foreachReset(new ArrayObject({ a: 1, b: 2, c: 3 })),
  "exchangeArray.position.pqr": () => [0, 1, 2, 3].map((steps) => keyAfterExchange(steps, { p: 1, q: 2, r: 3 })),
  "exchangeArray.position.p": () => [0, 1, 2, 3].map((steps) => keyAfterExchange(steps, { p: 1 })),
  "exchangeArray.foreach": () => {
    const object = new ArrayObject({ x: 1, y: 2, z: 3 });
    const keys: unknown[] = [];
    for (const key of object.keys()) {
      keys.push(key);
      if (key === "x") {
        object.exchangeArray({ p: 1, q: 2, r: 3 });
      }
    }
    return keys;
  },
  "exchangeArray.returns": () => {
    const object = new ArrayObject({ x: 1, y: 2 });
    return [object.exchangeArray([1, 2]), object.getArrayCopy()];
  },
  "wrap.count_inner": () => {
    const inner = new ArrayObject([1]);
    new ArrayObject(inner).offsetSet(null, 2);
    return inner.count();
  },
  "wrap.serialize": () => {
    const wrapper = new ArrayObject(new ArrayObject([1]));
    wrapper.offsetSet(null, 2);
    return phpSerialize(wrapper);
  },
  "wrap.after_exchange": () => {
    const inner = new ArrayObject([1]);
    const wrapper = new ArrayObject(inner);
    wrapper.offsetSet(null, 2);
    wrapper.exchangeArray([5, 6]);
    return [inner.getArrayCopy(), wrapper.getArrayCopy()];
  },
  "wrap.exchanged_to_object": () => {
    const target = new ArrayObject([1]);
    const exchanged = new ArrayObject([0]);
    exchanged.exchangeArray(target);
    exchanged.offsetSet(null, 7);
    new ArrayIterator(target).offsetSet(null, 8);
    return target.getArrayCopy();
  },
  "wrap.iterator_after_outer_exchange": () => {
    const inner = new ArrayObject({ x: 1, y: 2, z: 3 });
    const wrapper = new ArrayObject(inner);
    const it = wrapper.getIterator();
    it.next();
    wrapper.exchangeArray({ p: 1, q: 2, r: 3 });
    return [it.key(), inner.count()];
  },
  "copy.nested": () => {
    const source: unknown[][] = [[1]];
    const object = new ArrayObject(source);
    (source[0] as unknown[]).push(2);
    ((object.getArrayCopy() as unknown[][])[0] as unknown[]).push(3);
    return object.getArrayCopy();
  },
  "serialize.ArrayObject": () => phpSerialize(new ArrayObject([1, 2])),
  "serialize.ArrayIterator": () => phpSerialize(new ArrayIterator([1])),
  "serialize.getIterator_flags": () => phpSerialize(new ArrayObject([1], ArrayObject.ARRAY_AS_PROPS).getIterator()),
  "serialize.ArrayIterator_round_trip": () => {
    const serialized = phpSerialize(stepped({ a: 1, b: 2 }, 1));
    const restored = phpUnserialize(serialized) as ArrayIterator;
    return [serialized, restored.key(), restored.getArrayCopy()];
  },
  "serialize.members": () => phpSerialize(new MembersObject([1])),
  json_encode: () => [jsonEncode(new ArrayObject([1, 2])), jsonEncode(new ArrayObject({ a: 1 })), jsonEncode(new ArrayObject())],
  flags: () => {
    const object = new ArrayObject([], 0x01000005);
    const flags = [object.getFlags()];
    object.setFlags(0x02000006);
    flags.push(object.getFlags());
    flags.push(new ArrayObject([1], ArrayObject.ARRAY_AS_PROPS).getIterator().getFlags());
    const unserialized = new ArrayObject([], 0x02000000);
    unserialized.__unserialize([0x04000003, [], []]);
    flags.push(unserialized.getFlags());
    return flags;
  },
  ...Object.fromEntries(
    [[0], [0, []], ["x", [], []], [0, [], "x"], [0, [], [], 1], [0, 5, []], [0, [], [], "Foo"], [0, [], [], "stdClass"]].map((data, index) => [
      `__unserialize.${String(index)}`,
      () => thrownText(() => new ArrayObject().__unserialize(data)),
    ]),
  ),
  "__unserialize.restores": () => {
    const object = new ArrayObject([9]);
    object.__unserialize([0, { a: 1 }, { foo: "bar" }, null]);
    return [object.getArrayCopy(), (object as unknown as Record<string, unknown>)["foo"], phpSerialize(object)];
  },
  "setIteratorClass.stdClass": () => thrownText(() => new ArrayObject().setIteratorClass("stdClass")),
  "construct.iteratorClass": () => thrownText(() => new ArrayObject([], 0, "stdClass")),
  "setIteratorClass.sub": () => {
    const object = new ArrayObject([1, 2]);
    object.setIteratorClass("XaravelFixture\\PhpBuiltins\\SubIterator");
    const it = object.getIterator();
    return [fqcn(it), [...it], object.getIteratorClass(), phpSerialize(object), (phpUnserialize(phpSerialize(object)) as ArrayObject).getIteratorClass()];
  },
  "construct.ArrayIterator.int": () => thrownText(() => new ArrayIterator(5)),
  "construct.ArrayObject.string": () => thrownText(() => new ArrayObject("s")),
  "construct.ArrayObject.null": () => thrownText(() => new ArrayObject(null)),
  "exchangeArray.int": () => thrownText(() => new ArrayObject().exchangeArray(1)),
  // XT-runtime-54
  "CachingIterator.constants": () => [
    CachingIterator.CALL_TOSTRING,
    CachingIterator.TOSTRING_USE_KEY,
    CachingIterator.TOSTRING_USE_CURRENT,
    CachingIterator.TOSTRING_USE_INNER,
    CachingIterator.CATCH_GET_CHILD,
    CachingIterator.FULL_CACHE,
  ],
  "CachingIterator.default": () => {
    const caching = new CachingIterator(new ArrayIterator({ a: "x", b: "y" }));
    const before = [caching.getFlags(), caching.valid(), caching.current(), caching.hasNext(), String(caching)];
    const seen: unknown[] = [];
    for (const [key, value] of caching.entries()) {
      seen.push([key, value, caching.hasNext(), String(caching)]);
    }
    return [before, seen, caching.valid(), caching.key(), caching.current(), String(caching)];
  },
  "CachingIterator.CALL_TOSTRING": () => {
    return stringsOf(new CachingIterator(new ArrayIterator([float(1.5), null, true])));
  },
  "CachingIterator.USE_KEY_CURRENT": () => {
    const keyed = new CachingIterator(new ArrayIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_KEY);
    keyed.rewind();
    const current = new CachingIterator(new ArrayIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_CURRENT);
    current.rewind();
    return [String(keyed), String(current)];
  },
  "CachingIterator.USE_INNER.no_string": () => thrownText(() => new CachingIterator(new ArrayIterator({ a: 1 }), CachingIterator.TOSTRING_USE_INNER).rewind()),
  "CachingIterator.USE_INNER": () => stringsOf(new CachingIterator(new InnerIterator({ a: 1, b: 2 }), CachingIterator.TOSTRING_USE_INNER)),
  "CachingIterator.FULL_CACHE.first": () => {
    const caching = new CachingIterator(new ArrayIterator({ a: 1, b: 2, c: 3 }), CachingIterator.FULL_CACHE);
    caching.rewind();
    return [caching.getCache(), caching.count()];
  },
  "CachingIterator.FULL_CACHE": () => {
    const caching = new CachingIterator(new ArrayIterator({ a: 1, b: 2, c: 3 }), CachingIterator.FULL_CACHE);
    return [[...caching], caching.getCache(), caching.count()];
  },
  "CachingIterator.FULL_CACHE.rewind_after_unset": () => {
    const inner = new ArrayIterator({ a: 1, b: 2, c: 3 });
    const caching = new CachingIterator(inner, CachingIterator.FULL_CACHE);
    walkPairs(caching);
    inner.offsetUnset("b");
    caching.rewind();
    return [[...caching], caching.getCache()];
  },
  "CachingIterator.FULL_CACHE.copy": () => {
    const caching = new CachingIterator(new ArrayIterator({ a: [1] }), CachingIterator.FULL_CACHE);
    caching.rewind();
    ((caching.getCache() as Record<string, unknown[]>)["a"] as unknown[]).push(2);
    return caching.getCache();
  },
  "CachingIterator.FULL_CACHE.object_key": () => {
    const caching = new CachingIterator(new KeyedIterator([["a", 1], [new stdClass(), 2], ["c", 3]]), CachingIterator.FULL_CACHE);
    const before: string[] = [];
    const error = thrownText(() => {
      for (const [key, value] of caching.entries()) {
        before.push(`${String(key)}=${String(value)}`);
      }
    });
    return [error, before, caching.valid(), caching.current(), typeof caching.key() === "object", caching.getCache(), caching.hasNext()];
  },
  "CachingIterator.errors": () => {
    const plain = new CachingIterator(new ArrayIterator({ a: "x" }), 0);
    return [
      thrownText(() => String(plain)),
      thrownText(() => plain.getCache()),
      thrownText(() => plain.count()),
      thrownText(() => new CachingIterator(new ArrayIterator([]), CachingIterator.CALL_TOSTRING | CachingIterator.TOSTRING_USE_KEY)),
      thrownText(() => new CachingIterator(new ArrayIterator([]), CachingIterator.TOSTRING_USE_KEY | CachingIterator.TOSTRING_USE_INNER)),
      thrownText(() => new CachingIterator([1] as never)),
      thrownText(() => new CachingIterator(new ArrayObject() as never)),
    ];
  },
  // XT-runtime-55
  "WeakMap.order": () => {
    const { map, a, b } = weakMapFixture();
    return [[...map.entries()].map(([key, value]) => `${key === a ? "a" : "b"}=${String(value)}`), map.count(), map.offsetGet(b)];
  },
  "WeakMap.iterator": () => {
    const { map, b } = weakMapFixture();
    const it = map.getIterator();
    const walk: unknown[] = [[it.valid(), it.key() === b, it.current()]];
    it.next();
    it.next();
    walk.push([it.valid(), it.key(), it.current()]);
    const c = new stdClass();
    map.offsetSet(c, 4);
    walk.push([it.valid(), it.key() === c]);
    return walk;
  },
  "WeakMap.null_and_unset": () => {
    const { map, a, b } = weakMapFixture();
    map.offsetSet(a, null);
    const exists: unknown[] = [map.offsetExists(a), map.offsetExists(a), map.offsetExists(b)];
    map.offsetUnset(a);
    map.offsetUnset(a);
    exists.push(map.count());
    return exists;
  },
  "WeakMap.key_errors": () => {
    const map = new WeakMap();
    return [1, "s", []].map((key) => [
      thrownText(() => map.offsetSet(key as never, 1)),
      thrownText(() => map.offsetGet(key as never)),
      thrownText(() => map.offsetExists(key as never)),
      thrownText(() => map.offsetUnset(key as never)),
    ]);
  },
  "WeakMap.errors": () => {
    const map = new WeakMap();
    return [
      thrownText(() => map.offsetSet(null, 1)),
      thrownText(() => map.offsetGet(new stdClass())),
      thrownText(() => map.offsetGet(new ArrayObject())),
      thrownText(() => phpSerialize(map)),
      thrownText(() => phpUnserialize('O:7:"WeakMap":0:{}')),
      thrownText(() => phpSerialize(map.getIterator())),
      thrownText(() => phpUnserialize('O:16:"InternalIterator":0:{}')),
      thrownText(() => new InternalIterator()),
      jsonEncode(map),
    ];
  },
};

/** The probe's `foreach` that unsets and re-sets its current key `a` once. */
function foreachReset(subject: ArrayIterator | ArrayObject): unknown[] {
  const keys: unknown[] = [];
  let done = false;
  for (const [key] of subject.entries()) {
    keys.push(key);
    if (key === "a" && !done) {
      done = true;
      subject.offsetUnset("a");
      subject.offsetSet("a", 9);
    }
  }
  return keys;
}

/** The string a CachingIterator gives at each element of a `foreach`. */
function stringsOf(caching: CachingIterator): string[] {
  const strings: string[] = [];
  for (const _ of caching) {
    strings.push(String(caching));
  }
  return strings;
}

/** The probe's WeakMap: `b` set, `a` set, `b` rewritten. */
function weakMapFixture(): { map: WeakMap; a: stdClass; b: stdClass } {
  const map = new WeakMap();
  const a = new stdClass();
  const b = new stdClass();
  map.offsetSet(b, 1);
  map.offsetSet(a, 2);
  map.offsetSet(b, 3);
  return { map, a, b };
}

xaravelTest(
  "XT-runtime-56",
  "every PHP 8.5.11 value recorded in php-builtins.probe.txt (from php-builtins.probe.php: the type names, the hash position, exchangeArray, wrapping, serialize strings, __unserialize, setIteratorClass, CachingIterator and WeakMap results, and the exception class and message of each recorded case) is what the runtime gives for the same case (ESC-14.1-1, ESC-14.1-2)",
  () => {
    const recorded = readFileSync(resolve(import.meta.dir, "php-builtins.probe.txt"), "utf8");
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
      Assert.assertSame(line.slice(tab + 1), jsonEncode((compute as () => unknown)()), label);
    }
    Assert.assertSame(Object.keys(PROBE_CASES).sort().join(","), [...labels].sort().join(","));
  },
);
