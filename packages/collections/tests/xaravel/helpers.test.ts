// Xaravel Tests for epic-14-item-19 (the Collections API-surface findings of ESC-14.8-1).
//
// XT-collections-17: the global helpers `data_fill`, `data_set`, `data_forget`, `head`, `last` and `when`, against the
// committed PHP 8.5.11 evidence `helpers.probe.txt`, which `helpers.probe.php` writes by running Upstream's own
// `helpers.php` at the Pin. Every recorded label is recomputed here and compared through `jsonEncode`. A by-reference
// helper takes PHP's `&$target` as a `Ref` (DIV-9.2); its line is [its result, the target afterwards]. PHP's notices
// (an indirect modification of an overloaded element) are not raised (DIV-9.17).
//
// XT-collections-18: the AD-26 options overloads this item adds give what their positional forms give (`unique`,
// `fromJson`, `sliding`, `sortKeys`, `Arr.sortRecursive` and `MultipleItemsFoundException`), `toBase()` gives a base
// `Collection` copy, and `Collection` and `LazyCollection` are `Enumerable` and `CanBeEscapedWhenCastToString`.
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import { CanBeEscapedWhenCastToString } from "@xaravel/contracts/support";
import {
  Arr,
  Collection,
  data_fill,
  data_forget,
  data_set,
  Enumerable,
  type EnumerableStatic,
  EnumeratesValues,
  head,
  last,
  LazyCollection,
  MultipleItemsFoundException,
  when,
} from "@xaravel/collections";
import {
  ArrayAccess,
  arrayFromEntries,
  ArrayIterator,
  ArrayObject,
  PhpArray,
  type PhpKeyInput,
  registerClass,
  fqcn,
  JSON_THROW_ON_ERROR,
  jsonEncode,
  Ref,
  RuntimeException,
  SORT_NATURAL,
  SORT_REGULAR,
  SORT_STRING,
  SortDirection,
  stdClass,
} from "@xaravel/runtime";

const evidence = readFileSync(`${import.meta.dir}/helpers.probe.txt`, "utf8").trim().split("\n").map((line) => {
  const tab = line.indexOf("\t");
  return [line.slice(0, tab), line.slice(tab + 1)] as const;
});

/** The probe's `attempt($fn)`: the result, or `<class>: <message>` for a throwable. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    return `${fqcn(error as object)}: ${(error as Error).message}`;
  }
}

/** The message of the JS `TypeError` that `fn` throws (DIV-1.6), or `null` when it throws none. */
function thrown(fn: () => unknown): string | null {
  try {
    fn();
  } catch (error) {
    Assert.assertTrue(error instanceof TypeError, "a JS TypeError");
    return (error as TypeError).message;
  }
  return null;
}

/** The probe's `shape($value)`: an ArrayObject's copy, a Collection's items, else the value. */
function shape(value: unknown): unknown {
  if (value instanceof ArrayObject) return { ArrayObject: value.getArrayCopy() };
  if (value instanceof ArrayIterator) return { ArrayIterator: value.getArrayCopy() };
  if (value instanceof Collection) return { Collection: value.all() };
  if (value instanceof Magic) return { Magic: value.dump() };
  if (value instanceof Box) return { Box: value.dump() };
  return value;
}

function set(target: unknown, key: unknown, value: unknown, ...overwrite: [boolean?]): unknown {
  const ref = new Ref<unknown>(target);
  const result = overwrite.length === 0 ? data_set(ref, key, value) : data_set(ref, key, value, overwrite[0]);
  return [shape(result), shape(ref.value)];
}

function fill(target: unknown, key: unknown, value: unknown): unknown {
  const ref = new Ref<unknown>(target);
  const result = data_fill(ref, key, value);
  return [shape(result), shape(ref.value)];
}

function forget(target: unknown, key: unknown): unknown {
  const ref = new Ref<unknown>(target);
  const result = data_forget(ref, key);
  return [shape(result), shape(ref.value)];
}

const PHP_PROPERTIES: unique symbol = Symbol.for("xaravel.php.properties");

/** The probe's `Magic`: a class whose properties are all magic, every access logged. */
class Magic {
  log: string[] = [];
  readonly #data: Record<string, unknown>;

  constructor(data: Record<string, unknown> = {}) {
    this.#data = data;
  }

  __get(key: string): unknown {
    this.log.push(`get ${key}`);
    return this.#data[key] ?? null;
  }

  __set(key: string, value: unknown): void {
    this.log.push(`set ${key}`);
    this.#data[key] = value;
  }

  __isset(key: string): boolean {
    this.log.push(`isset ${key}`);
    return (this.#data[key] ?? null) !== null;
  }

  __unset(key: string): void {
    this.log.push(`unset ${key}`);
    delete this.#data[key];
  }

  dump(): unknown {
    return { log: this.log, data: this.#data };
  }
}

registerClass("Xaravel\\Tests\\Collections\\Magic", Magic);

/** The probe's `Box`: a userland ArrayAccess that is not Traversable, with public and non-public state. */
class Box {
  static readonly [PHP_PROPERTIES] = [
    { name: "pub", visibility: "public", default: null },
    { name: "prot", visibility: "protected", default: 2 },
    { name: "priv", visibility: "private", default: 3 },
    { name: "items", visibility: "private", default: [] },
  ];

  pub: unknown;
  protected prot: unknown = 2;
  private priv: unknown = 3;
  private items = new PhpArray<PhpKeyInput, unknown>();

  constructor(pub: unknown = 1) {
    this.pub = pub;
  }

  get [ArrayAccess.brand](): true {
    return true;
  }

  offsetExists(offset: unknown): boolean {
    return (this.items.get(offset as PhpKeyInput) ?? null) !== null;
  }

  offsetGet(offset: unknown): unknown {
    return this.items.get(offset as PhpKeyInput) ?? null;
  }

  offsetSet(offset: unknown, value: unknown): void {
    this.items.set(offset as PhpKeyInput, value);
  }

  offsetUnset(offset: unknown): void {
    this.items.delete(offset as PhpKeyInput);
  }

  dump(): unknown {
    return [this.pub, this.prot, this.priv, arrayFromEntries(this.items)];
  }
}

registerClass("Xaravel\\Tests\\Collections\\Box", Box);

/** The probe's `posts()`: posts and comments as `stdClass` objects. */
function posts(): unknown {
  return {
    posts: [
      std({ comments: [std({ name: "First", comment: "foo" }), new stdClass()] }),
      std({ comments: [new stdClass(), std({ name: "Second", comment: "bar" })] }),
    ],
  };
}

/** An invokable object: a PHP callable whose `__invoke` gives an item's id. */
class IdInvokable {
  __invoke(item: { id: unknown }): unknown {
    return item.id;
  }
}

registerClass("Xaravel\\Tests\\Collections\\IdInvokable", IdInvokable);

/** A Collection that records the constructor arguments after the items, which `fromJson`'s `...args` reach. */
class RecordingCollection extends Collection {
  static received: unknown[][] = [];

  constructor(items: unknown = [], ...args: unknown[]) {
    super(items);
    RecordingCollection.received.push(args);
  }
}

registerClass("Xaravel\\Tests\\Collections\\RecordingCollection", RecordingCollection);

/** A `stdClass` with the given properties, as PHP's `new stdClass` and `$o->k = v` lines build one. */
function std(properties: Record<string, unknown> = {}): stdClass {
  const object = new stdClass();
  for (const [name, value] of Object.entries(properties)) {
    (object as unknown as Record<string, unknown>)[name] = value;
  }
  return object;
}

const cases: Record<string, () => unknown> = {
  "set-overwrite": () => [
    set({ a: { b: 1 } }, "a.b", 2),
    set({ a: { b: 1 } }, ["a", "c"], 3),
    set({ a: { b: 1 } }, "x.y", 4),
    set({ a: { b: 1 } }, "a.b", 9, false),
    set({ a: { b: 1 } }, "a.c", 9, false),
    set({ a: "text" }, "a.b", 5),
    set([], "a", { n: 1 }),
    set([1, 2], "1", "x"),
    set([1, 2], 2, "y"),
  ],
  "set-wildcard": () => [
    set([[], []], "*.x", 1),
    set([{ x: 0 }, { y: 0 }], "*.x", 1, false),
    set([1, 2], "*", 5),
    set([1, 2], "*", 5, false),
    set({ a: { p: { v: 1 }, q: { v: 2 } } }, "a.*.v", 0),
    set("abc", "*", 1),
    set(5, "*.x", 1),
    set(null, "*", 1),
  ],
  "set-scalar": () => [
    set(null, "a.b", 1),
    set("text", "a", 1),
    set(false, "a", 1, false),
    set(7, "a.b", 1, false),
  ],
  "set-objects": () => [
    set(new stdClass(), "a.b", 1),
    set(std({ x: 1, n: null }), "x", 2),
    set(std({ x: 1, n: null }), "x", 2, false),
    set(std({ x: 1, n: null }), "n", 3, false),
    set(std({ x: 1, n: null }), "n.m", 3),
    set(std({ inner: new stdClass() }), "inner.deep.leaf", "v"),
    set({ o: new stdClass() }, "o.p", 1),
    set(new ArrayObject([]), "k", 1),
    set(new ArrayObject({ k: 1 }), "k", 2, false),
    set(new ArrayObject({ a: { b: 1 } }), "a.b", 2),
    set(new ArrayObject([]), "m.n", 1),
    set(new ArrayObject([1, 2]), "*", 0),
    set(new ArrayObject([{ x: 1 }, []]), "*.x", 2),
    set(new Collection({ k: 1 }), "k", 2),
    set(new Collection({ a: { b: 1 } }), "a.b", 2),
    attempt(() => set(new Collection([1, 2]), "*", 0)),
  ],
  fill: () => [
    fill({ a: 1 }, "a", 2),
    fill({ a: 1 }, "b", 2),
    fill({ a: { b: 1 } }, "a.c", 2),
    fill([{ x: 1 }, []], "*.x", 9),
    fill(null, "a.b", 1),
  ],
  forget: () => [
    forget({ a: 1, b: 2 }, "a"),
    forget({ a: { b: 1, c: 2 } }, "a.b"),
    forget([{ x: 1, y: 1 }, { x: 2 }], "*.x"),
    forget({ a: [{ k: 1, l: 2 }] }, "a.*.k"),
    forget({ a: 1 }, "missing"),
    forget({ a: 1 }, "missing.deeper"),
    forget({ a: { b: 1 } }, ["a", "b"]),
    forget(std({ p: 1, q: { r: 1, s: 2 } }), "p"),
    forget(std({ p: 1, q: { r: 1, s: 2 } }), "q.r"),
    forget(std({ p: 1, q: { r: 1, s: 2 } }), "missing"),
    forget(new ArrayObject({ a: 1, b: 2 }), "a"),
    forget(new ArrayObject([{ x: 1, y: 2 }]), "*.x"),
    forget(new Collection({ a: 1, b: 2 }), "a"),
    forget("text", "a"),
    forget(null, "a"),
    forget([1, 2, 3], "*"),
  ],
  "head-last": () => [
    head([]), head([1, 2, 3]), head({ a: 1, b: 2 }), head([false]), head([null, 1]),
    last([]), last([1, 2, 3]), last({ a: 1, b: 2 }), last([false]), last([1, null]),
    attempt(() => head("abc")), attempt(() => last(1)), head(""), last(0), head(null),
  ],
  magic: () => [
    set(new Magic(), "a", 1),
    set(new Magic(), "a.b", 1),
    set(new Magic({ a: { b: 1 } }), "a.b", 2),
    set(new Magic({ a: 1 }), "a", 2, false),
    forget(new Magic({ a: 1, b: 2 }), "a"),
    forget(new Magic({ a: { b: 1 } }), "a.b"),
    forget(new Magic(), "a"),
  ],
  iterators: () => [
    set(new ArrayIterator([1, 2]), "*", 0),
    set(new ArrayIterator([{ x: 1 }, []]), "*.x", 2),
    forget(new ArrayIterator([{ x: 1, y: 2 }]), "*.x"),
  ],
  box: () => [
    set(new Box(), "*", 9),
    set(new Box(), "*.x", 9),
    set(new Box({ x: 1, y: 2 }), "*.x", 9, false),
    forget(new Box({ x: 1, y: 2 }), "*.x"),
    set(new Box(), "k", 5),
    set(new Box(), "pub", 5),
  ],
  "double-star": () => [
    set(posts(), "posts.*.comments.*.name", "Filled"),
    fill(posts(), "posts.*.comments.*.name", "Filled"),
    forget(posts(), "posts.*.comments.*.name"),
    fill({ foo: "bar" }, "foo.*.bar", "noop"),
  ],
  keys: () => [
    attempt(() => set({ a: 1 }, null, 2)),
    attempt(() => forget(new PhpArray<PhpKeyInput, unknown>([["", 1], ["a", 2]]), null)),
    set(new stdClass(), 5, "v"),
    set(new ArrayObject([]), 5, "v"),
    forget(new ArrayObject(new PhpArray<PhpKeyInput, unknown>([[5, "v"], [6, "w"]])), 5),
    set([], [], 1),
  ],
  when: () => [
    when(true, "v"), when(false, "v"), when(false, "v", "d"), when(0, "v", "d"), when("0", "v", "d"), when([], "v", "d"),
    when([1], "v", "d"), when("a", "v"), when(1, (c: unknown) => [c, "cb"]), when(0, "v", (c: unknown) => [c, "default"]),
    when(() => "yes", (c: unknown) => [c, "cond"]), when(() => null, "v", (c: unknown) => [c, "null-cond"]),
    when(true, null), when(false, "v", null),
  ],
};

xaravelTest(
  "XT-collections-17",
  "data_set, data_fill and data_forget change PHP's &$target through a Ref (DIV-9.2) and return it as Upstream's helpers do in PHP 8.5.11: a dot key, a list of segments or an int, an overwrite or a kept key, '*' over every item (a target that is not array accessible becomes []), a missing or scalar level made [], stdClass properties, ArrayObject storage written through and a userland offsetGet writing nothing (DIV-9.17); head and last give false for an empty array or any other falsy value (PHP's empty() short circuit: '', 0, null), its first or last value for a non-empty array, and PHP's TypeError for a truthy non-array; when gives value(value, condition) or value(default, condition), calling a Closure condition first, keeps the chosen callback's result type (a Promise included), and throws a TypeError for a thenable condition or a Closure condition returning one (DIV-1.6); magic __get/__set/__isset/__unset properties, ArrayIterator storage, a userland ArrayAccess's public properties under '*', double-wildcard paths over stdClass items and null, list and int keys behave as in PHP",
  () => {
    const labels = Object.keys(cases);
    for (const label of labels) Assert.assertTrue(evidence.some(([recorded]) => recorded === label), `missing evidence: ${label}`);
    Assert.assertSame(labels.length, evidence.length, "every evidence line has a case");
    for (const [label, json] of evidence) {
      Assert.assertSame(json, jsonEncode(cases[label]!()), label);
    }

    // The Ref is the caller's variable: written in place, while a copy the caller kept is unchanged (AD-9).
    const original = { a: { b: 1 } };
    const target = new Ref<unknown>(original);
    data_set(target, "a.b", 2);
    Assert.assertSame({ a: { b: 2 } }, target.value);
    Assert.assertSame({ a: { b: 1 } }, original);
    const returned = data_set(target, "a.c", 3) as { a: Record<string, unknown> };
    returned.a["c"] = "changed";
    Assert.assertSame({ a: { b: 2, c: 3 } }, target.value);

    // `when` is a dual helper (AD-6.5): tsc keeps the chosen callback's result type, a Promise included.
    const sync: number | null = when(true, () => 1);
    const asyncResult: Promise<number> | null = when(true, async () => 1);
    const withDefault: number | string = when(false, () => 1, () => "d");
    const plainValues: string | number = when(1, "v", 2);
    Assert.assertSame(1, sync);
    Assert.assertInstanceOf(Promise, asyncResult);
    Assert.assertSame("d", withDefault);
    Assert.assertSame("v", plainValues);
    // A thenable condition, or a Closure condition returning one, would always test truthy, so it throws (DIV-1.6).
    const pending = Promise.resolve(false);
    Assert.assertSame("when(): the condition is a Promise or another thenable; await it before calling when()", thrown(() => when(pending as never, "v")));
    Assert.assertSame("when(): the condition is a Promise or another thenable; await it before calling when()", thrown(() => when({ then: () => null } as never, "v")));
    Assert.assertSame("when(): the condition closure returned a Promise or another thenable; await it before calling when()", thrown(() => when((async () => false) as never, "v")));
    let called = false;
    thrown(() => when(pending as never, () => { called = true; }));
    Assert.assertFalse(called, "neither callback runs for a thenable condition");
  },
);

xaravelTest(
  "XT-collections-18",
  "The AD-26 options overloads of unique (Collection, LazyCollection and the EnumeratesValues trait's own), fromJson, sliding, sortKeys, Arr.sortRecursive and MultipleItemsFoundException give what their positional forms give; toBase() gives a new base Collection of the same items; Collection and LazyCollection are Enumerable and CanBeEscapedWhenCastToString",
  () => {
    const rows = [{ id: 1, v: "a" }, { id: "1", v: "b" }, { id: 2, v: "c" }, { id: 1, v: "d" }];
    for (const make of [(items: unknown) => new Collection(items), (items: unknown) => LazyCollection.make(items)]) {
      Assert.assertSame(make(rows).unique("id", true).all(), make(rows).unique({ key: "id", strict: true }).all(), "{ key, strict }");
      Assert.assertSame(make(rows).unique("id").all(), make(rows).unique({ key: "id" }).all(), "{ key }");
      Assert.assertSame(make([1, "1", 1]).unique(null, true).all(), make([1, "1", 1]).unique({ strict: true }).all(), "{ strict }");
      Assert.assertSame(make([1, "1", 2]).unique().all(), make([1, "1", 2]).unique({}).all(), "{}");
      const byId = (item: { id: unknown }): unknown => item.id;
      Assert.assertSame(make(rows).unique(byId, true).all(), make(rows).unique({ key: byId, strict: true }).all(), "a Closure key inside the options object");
      Assert.assertSame(make(rows).unique(byId).all(), make(rows).unique({ key: byId }).all(), "a Closure key inside { key }");
      // An invokable object is the callable key; a plain object with a function `__invoke` is not the options object
      // either: it is a PHP array, used as a data_get path, which PHP's array offset refuses (as for duplicates).
      const loose = (c: Collection | LazyCollection) => c as unknown as { unique(key: unknown): { all(): unknown } };
      Assert.assertSame(make(rows).unique(byId).all(), loose(make(rows)).unique(new IdInvokable()).all(), "an invokable object is the callable key");
      Assert.assertSame("TypeError: Cannot access offset of type Closure on array", attempt(() => loose(make(rows)).unique({ __invoke: byId }).all()), "a plain object with a function __invoke is not read as options");

      const items = { b: 1, a: 2, c: 3, d: 4, e: 5 };
      Assert.assertSame(jsonEncode(make(items).sliding(3, 2).map((chunk: Collection) => chunk.all()).all()), jsonEncode(make(items).sliding({ size: 3, step: 2 }).map((chunk: Collection) => chunk.all()).all()), "sliding { size, step }");
      Assert.assertSame(jsonEncode(make(items).sliding(2, 2).map((chunk: Collection) => chunk.all()).all()), jsonEncode(make(items).sliding({ step: 2 }).map((chunk: Collection) => chunk.all()).all()), "sliding { step }");
      const keys = { item10: 1, item2: 2, Item1: 3 };
      Assert.assertSame(make(keys).sortKeys(SORT_STRING, true).all(), make(keys).sortKeys({ options: SORT_STRING, descending: true }).all(), "sortKeys { options, descending }");
      Assert.assertSame(make(keys).sortKeys(SORT_NATURAL).all(), make(keys).sortKeys({ options: SORT_NATURAL }).all(), "sortKeys { options }");
      Assert.assertSame(make(keys).sortKeys(SORT_REGULAR, SortDirection.Descending).all(), make(keys).sortKeys({ descending: SortDirection.Descending }).all(), "sortKeys { descending }");
    }

    // The trait's own `unique` (Upstream's EnumeratesValues::unique), which Collection and LazyCollection override.
    const traitUnique = (EnumeratesValues.prototype as unknown as { unique: { call(target: Collection, ...args: unknown[]): Collection } }).unique;
    Assert.assertSame(new Collection(rows).unique("id", true).all(), traitUnique.call(new Collection(rows), "id", true).all(), "the trait's positional unique");
    Assert.assertSame(new Collection(rows).unique("id", true).all(), traitUnique.call(new Collection(rows), { key: "id", strict: true }).all(), "the trait's options unique");
    Assert.assertSame(new Collection([1, "1", 2]).unique().all(), traitUnique.call(new Collection([1, "1", 2])).all(), "the trait's unique()");

    const fromJson: [string, (json: string, ...args: unknown[]) => unknown][] = [
      ["Collection", (json, ...args) => Reflect.apply(Collection.fromJson, Collection, [json, ...args]) as Collection],
      ["LazyCollection", (json, ...args) => Reflect.apply(LazyCollection.fromJson, LazyCollection, [json, ...args]) as LazyCollection],
    ];
    for (const [name, decode] of fromJson) {
      const all = (json: string, ...args: unknown[]): unknown => attempt(() => (decode(json, ...args) as Collection).all());
      Assert.assertSame(all("[[1]]", 1), all("[[1]]", { depth: 1 }), `${name}.fromJson { depth }`);
      Assert.assertSame(all("[[1]]", 1, JSON_THROW_ON_ERROR), all("[[1]]", { depth: 1, flags: JSON_THROW_ON_ERROR }), `${name}.fromJson { depth, flags }`);
      Assert.assertSame("JsonException: Maximum stack depth exceeded", all("[[1]]", { depth: 1, flags: JSON_THROW_ON_ERROR }), `${name}.fromJson throws as positional`);
      Assert.assertSame(all('{"a":[1,2]}'), all('{"a":[1,2]}', {}), `${name}.fromJson {}`);
    }
    // The arguments after the options object reach the constructor, as the positional form's `...args` do.
    RecordingCollection.received.length = 0;
    const viaFromJsonOptions = RecordingCollection.fromJson('{"a":1}', { depth: 512 }, "tag");
    const viaFromJsonPositional = RecordingCollection.fromJson('{"a":1}', 512, 0, "tag");
    Assert.assertSame(viaFromJsonPositional.all(), viaFromJsonOptions.all());
    Assert.assertSame([["tag"], ["tag"]], RecordingCollection.received, "fromJson { depth } forwards its args");
    // The typed forms compile: the options overload is declared on the static side.
    Assert.assertSame([1], Collection.fromJson("[1]", { depth: 2 }).all());
    Assert.assertSame([1], LazyCollection.fromJson("[1]", { flags: 0 }).all());

    const nested = { b: ["item10", "item2"], a: { y: 1, x: 2 } };
    Assert.assertSame(Arr.sortRecursive(nested, SORT_NATURAL, true), Arr.sortRecursive(nested, { options: SORT_NATURAL, descending: true }), "Arr.sortRecursive { options, descending }");
    Assert.assertSame(Arr.sortRecursive(nested, SORT_STRING), Arr.sortRecursive(nested, { options: SORT_STRING }), "Arr.sortRecursive { options }");

    const previous = new RuntimeException("before");
    const viaOptions = new MultipleItemsFoundException(2, { code: 5, previous });
    const positional = new MultipleItemsFoundException(2, 5, previous);
    for (const exception of [viaOptions, positional]) {
      Assert.assertSame("2 items were found.", exception.getMessage());
      Assert.assertSame(5, exception.getCode());
      Assert.assertTrue(exception.getPrevious() === previous);
      Assert.assertSame(2, exception.getCount());
    }
    Assert.assertSame(0, new MultipleItemsFoundException(3, {}).getCode());
    Assert.assertNull(new MultipleItemsFoundException(3, { code: 1 }).getPrevious());

    class SubCollection extends Collection {}
    const sub = new SubCollection({ a: [1], b: 2 });
    const base = sub.toBase();
    Assert.assertTrue(base.constructor === Collection, "toBase() is a base Collection");
    Assert.assertSame("Illuminate\\Support\\Collection", fqcn(base));
    Assert.assertFalse(base === (sub as Collection));
    Assert.assertSame(sub.all(), base.all());
    base.put("b", 3);
    Assert.assertSame(2, sub.get("b"));
    const plain = new Collection([1]);
    Assert.assertFalse(plain.toBase() === plain, "toBase() is a new instance, as `new self($this)`");

    // Through an `Enumerable`-typed value, the dual helpers keep a callback's result type, a Promise included (AD-6.5).
    const empty: Enumerable = new Collection([]);
    const full: Enumerable = new Collection([1]);
    const emptySync: number | Enumerable = empty.whenEmpty(() => 1);
    const emptyAsync: Promise<number> | Enumerable = empty.whenEmpty(async () => 1);
    const emptyDefault: number | string | Enumerable = full.whenEmpty(() => 1, () => "d");
    const unlessSync: string | Enumerable = full.unless(false, () => "s");
    const unlessAsync: Promise<string> | Enumerable = full.unless(false, async () => "a");
    Assert.assertSame(1, emptySync);
    Assert.assertInstanceOf(Promise, emptyAsync);
    Assert.assertSame("d", emptyDefault);
    Assert.assertSame("s", unlessSync);
    Assert.assertInstanceOf(Promise, unlessAsync);
    Assert.assertTrue(full.whenEmpty(() => 1) === full, "a callback not run gives the receiver");

    // Both classes' constructors are the interface's static side (ESC-10.2-1).
    const statics: EnumerableStatic[] = [Collection, LazyCollection];
    Assert.assertSame([[1, 2], [1, 2]], statics.map((side) => side.make([1, 2]).all()));
    for (const instance of [new Collection([1]), LazyCollection.make([1])]) {
      Assert.assertInstanceOf(Enumerable, instance);
      Assert.assertInstanceOf(CanBeEscapedWhenCastToString, instance);
    }
  },
);
