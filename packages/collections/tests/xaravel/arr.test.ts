import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Story 14.6: the dot-key array helpers operate on all three PHP array forms and preserve value-copy boundaries.
import { Assert, xaravelTest } from "@xaravel/assert";
import { Arr, Collection, LazyCollection } from "@xaravel/collections";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { ArgumentCountError, ArrayAccess, registerClass, ArrayObject, ArrayIterator, InvalidArgumentException, JsonSerializable, Stringable, float, stdClass, arrayAppend, arrayEntries, offsetAssign, referenceAt, Error as PhpError, keyed, PhpArray, Ref, valueCopy, SortDirection, SORT_NATURAL, TypeError as PhpTypeError, UnhandledMatchError } from "@xaravel/runtime";

xaravelTest("XT-collections-12", "FR-23: Arr typed accessors bind PHP arguments before lookup and preserve class-string/scalar representations; dot get/set/has/forget preserve keys, order, nulls and value copies; synchronous callbacks and lazy traversal preserve their contracts", async () => {
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
    const fn = "Illuminate\\Support\\Arr::" + method;
    for (const [invalid, actual] of [[null, "null"], [1, "int"], ["bad", "string"], [true, "true"], [new stdClass(), "stdClass"], [Stringable, "string"]] as const) {
      fails(() => call(invalid, "key"), PhpTypeError,
        fn + "(): Argument #1 ($array) must be of type ArrayAccess|array, " + actual + " given");
    }
    fails(() => call({}), ArgumentCountError,
      "Too few arguments to function " + fn + "(), 1 passed and at least 2 expected");
    Assert.assertSame(selected, call({ key: selected }, "key", null));
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
  Assert.assertTrue((Arr.array({ key: { token: Stringable } }, "key") as { token: unknown }).token === Stringable);
  Assert.assertTrue((Arr.array({}, "missing", { token: Stringable }) as { token: unknown }).token === Stringable);
  Assert.assertSame("ok", Arr.string({ "1": "ok" }, true));
  Assert.assertSame("ok", Arr.string({ "1": "ok" }, float(1)));
fails(() => Arr.string({ key: null }, "key"), InvalidArgumentException,
  "Array value for key [key] must be a string, NULL found.");

  class ExplicitGetArr extends Arr {
    static override get(): unknown { throw new Error("typed accessors must use Arr.get"); }
  }
  Assert.assertSame("ok", ExplicitGetArr.string({ key: "ok" }, "key"));
  const pushSource = { office: { furniture: ["Desk"] } };
  const pushRef = new Ref<unknown>(pushSource);
  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture", "Chair", "Lamp"));
  Assert.assertSame(["Desk"], pushSource.office.furniture);
  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture"));
  const appended = { child: [1], typedHandle };
  Arr.push(pushRef, "office.furniture", appended);
  appended.child.push(2);
  Assert.assertSame([1], Arr.get(pushRef.value, "office.furniture.3.child"));
  Assert.assertSame(typedHandle, Arr.get(pushRef.value, "office.furniture.3.typedHandle"));
  const pushSparse = new PhpArray<number, unknown>([[5, "old"]]);
  pushSparse.delete(5);
  const sparseRef = new Ref<unknown>(pushSparse);
  Assert.assertSame(new PhpArray([[6, "new"]]), Arr.push(sparseRef, null, "new"));
  Assert.assertSame(new PhpArray([[6, "new"]]), sparseRef.value);
  const beforeFailure = valueCopy(pushRef.value);
  fails(() => Arr.push(pushRef, []), PhpTypeError);
  Assert.assertSame(beforeFailure, pushRef.value);
  const invalidRef = new Ref<unknown>(null);
  fails(() => Arr.push(invalidRef, "key"), PhpTypeError);
  Assert.assertNull(invalidRef.value);
  class ForwardPushArr extends Arr {
    static calls: unknown[] = [];
    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
      this.calls.push(["array", key, defaultValue]);
      return super.array(array, key, defaultValue);
    }
    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
      this.calls.push(["set", key, value]);
      return super.set(array, key, value);
    }
  }
  const forwarded = new Ref<unknown>([]);
  Assert.assertSame({ child: [1] }, ForwardPushArr.push(forwarded, "parent.child", 1));
  Assert.assertSame([["array", "parent.child", []], ["set", "parent.child", [1]]], ForwardPushArr.calls);
  const variadicSource = { child: [1] };
  class CopyBeforeDispatchArr extends Arr {
    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
      variadicSource.child.push(2);
      return super.array(array, key, defaultValue);
    }
  }
  const variadicRef = new Ref<unknown>([]);
  Assert.assertSame({ values: [{ child: [1] }] }, CopyBeforeDispatchArr.push(variadicRef, "values", variadicSource));
  Assert.assertSame([1, 2], variadicSource.child);
  const pushReturned = Arr.push(pushRef, "office.furniture") as { furniture: unknown[] };
  pushReturned.furniture.push("return-only");
  Assert.assertSame(4, (Arr.array(pushRef.value, "office.furniture") as unknown[]).length);
  Arr.push(pushRef, "office.furniture", "caller-only");
  Assert.assertSame("return-only", pushReturned.furniture.at(-1));
  for (const args of [[], [new Ref([])]]) {
    fails(() => (Arr.push as (...args: unknown[]) => unknown)(...args), ArgumentCountError,
      "Too few arguments to function Illuminate\\Support\\Arr::push(), " + args.length + " passed and exactly 2 expected");
  }
  class InvalidPushLookup extends ArrayObject {
    reads: unknown[] = [];
    override offsetExists(key: Parameters<ArrayObject["offsetExists"]>[0]): boolean {
      this.reads.push(key);
      return super.offsetExists(key);
    }
  }
  const invalidPushLookup = new InvalidPushLookup({ key: [] });
  const invalidPushLookupRef = new Ref<unknown>(invalidPushLookup);
  fails(() => Arr.push(invalidPushLookupRef, []), PhpTypeError,
    "Illuminate\\Support\\Arr::push(): Argument #2 ($key) must be of type string|int|null, array given");
  Assert.assertSame([], invalidPushLookup.reads);
  Assert.assertTrue(invalidPushLookupRef.value === invalidPushLookup);
  Assert.assertSame({ key: [] }, invalidPushLookup.getArrayCopy());


  // PHP 8.5.11 integration outcomes from ESC-14.6-7; DIV-9.17 omits only the notice.
  class InheritedOffsetGet extends ArrayObject {}
  class UserlandOffsetGet extends ArrayObject {
    override offsetGet(key: Parameters<ArrayObject["offsetGet"]>[0]): unknown { return super.offsetGet(key); }
  }
  class UserlandAccess implements ArrayAccess {
    get [ArrayAccess.brand](): true { return true; }
    stored: unknown = { x: [] };
    writes: [unknown, unknown][] = [];
    offsetExists(key: unknown): boolean { return Arr.has(this.stored, key); }
    offsetGet(key: unknown): unknown { return Arr.get(this.stored, key); }
    offsetSet(key: unknown, value: unknown): void {
      this.writes.push([key, valueCopy(value)]);
      const ref = new Ref(this.stored);
      Arr.set(ref, key, value);
      this.stored = ref.value;
    }
    offsetUnset(key: unknown): void {
      const ref = new Ref(this.stored);
      Arr.forget(ref, key);
      this.stored = ref.value;
    }
  }
  for (const object of [new ArrayObject({ x: [] }), new InheritedOffsetGet({ x: [] })]) {
    const ref = new Ref<unknown>(object);
    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
    Assert.assertTrue(ref.value === object);
    Assert.assertSame({ x: { y: [1] } }, object.getArrayCopy());
    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deeper.leaf", [2]));
    Assert.assertTrue(ref.value === object);
    Assert.assertSame({ x: { y: [1], deeper: { leaf: [2] } } }, object.getArrayCopy());
    const supplied = { child: [1], typedHandle };
    Assert.assertTrue(Arr.set(ref, "leaf", supplied) === object);
    supplied.child.push(2);
    Assert.assertSame([1], Arr.get(object, "leaf.child"));
    Assert.assertTrue(Arr.get(object, "leaf.typedHandle") === typedHandle);
    for (const child of [null, false, 12, "scalar", new stdClass()]) {
      object.offsetSet("replace", child);
      Assert.assertSame({ value: [3] }, Arr.set(ref, "replace.value", [3]));
      Assert.assertSame({ value: [3] }, object.offsetGet("replace"));
    }
    Assert.assertSame({ value: [4] }, Arr.set(ref, "missing.value", [4]));
    Assert.assertSame({ value: [4] }, object.offsetGet("missing"));
  }
  for (const object of [new UserlandOffsetGet({ x: [] }), new UserlandAccess()]) {
    const ref = new Ref<unknown>(object);
    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
    Assert.assertTrue(ref.value === object);
    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deep.leaf", [2]));
    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
    if (object instanceof UserlandAccess) Assert.assertSame([], object.writes);
    // Initialization is an explicit offsetSet even when subsequent reference writes are detached.
    Assert.assertSame({ value: [3] }, Arr.set(ref, "missing.value", [3]));
    Assert.assertSame([], object.offsetGet("missing"));
    if (object instanceof UserlandAccess) Assert.assertSame([["missing", []]], object.writes);
    Assert.assertTrue(Arr.set(ref, "leaf", [4]) === object);
    Assert.assertSame([4], object.offsetGet("leaf"));
  }
  class OrderedAccess extends UserlandAccess {
    calls: unknown[][] = [];
    throwOnGet = false;
    override offsetExists(key: unknown): boolean {
      this.calls.push(["exists", key]);
      return super.offsetExists(key);
    }
    override offsetGet(key: unknown): unknown {
      this.calls.push(["get", key]);
      if (this.throwOnGet) throw new PhpError("offset read failed");
      return super.offsetGet(key);
    }
    override offsetSet(key: unknown, value: unknown): void {
      this.calls.push(["set", key, valueCopy(value)]);
      super.offsetSet(key, value);
    }
  }
  for (const [stored, calls, final] of [
    [{ x: [] }, [["exists", "x"], ["get", "x"], ["get", "x"]], { x: [] }],
    [[], [["exists", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
    [{ x: 12 }, [["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
  ] as const) {
    const object = new OrderedAccess();
    object.stored = stored;
    const ref = new Ref<unknown>(object);
    Assert.assertSame({ leaf: [1] }, Arr.set(ref, "x.leaf", [1]));
    Assert.assertTrue(ref.value === object);
    Assert.assertSame(calls, object.calls);
    Assert.assertSame(final, object.stored);
  }
  const throwingAccess = new OrderedAccess();
  throwingAccess.stored = [];
  throwingAccess.throwOnGet = true;
  const throwingRef = new Ref<unknown>(throwingAccess);
  fails(() => Arr.set(throwingRef, "missing.leaf", 1), PhpError, "offset read failed");
  Assert.assertTrue(throwingRef.value === throwingAccess);
  Assert.assertSame({ missing: [] }, throwingAccess.stored);
  Assert.assertSame([["exists", "missing"], ["set", "missing", []], ["get", "missing"]], throwingAccess.calls);
  // A userland offsetGet can return a non-array after the explicit initialization; that replacement stays detached.
  class NonArrayOffset extends OrderedAccess {
    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return null; }
  }
  const nonArrayOffset = new NonArrayOffset();
  nonArrayOffset.stored = { x: 12 };
  Assert.assertSame({ leaf: 1 }, Arr.set(new Ref(nonArrayOffset), "x.leaf", 1));
  Assert.assertSame({ x: [] }, nonArrayOffset.stored);
  Assert.assertSame([["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], nonArrayOffset.calls);

  const entryValue = { child: [1], typedHandle };
  class MutatingOffsetExists extends UserlandAccess {
    override offsetExists(key: unknown): boolean {
      entryValue.child.push(2);
      return super.offsetExists(key);
    }
  }
  const mutatingAccess = new MutatingOffsetExists();
  const entryResult = Arr.set(new Ref(mutatingAccess), "x.leaf", entryValue) as { leaf: typeof entryValue };
  Assert.assertSame([1, 2], entryValue.child);
  Assert.assertSame([1], entryResult.leaf.child);
  Assert.assertTrue(entryResult.leaf.typedHandle === typedHandle);
  Assert.assertSame({ x: [] }, mutatingAccess.stored);

  registerClass("ArrOverridingOffsetFixture", UserlandOffsetGet);
  registerClass("ArrIndependentOffsetFixture", UserlandAccess);
  for (const [object, name] of [
    [new UserlandOffsetGet({ x: [] }), "ArrOverridingOffsetFixture"],
    [new UserlandAccess(), "ArrIndependentOffsetFixture"],
  ] as const) {
    const ref = new Ref<unknown>(object);
    fails(() => Arr.push(ref, "x", 1), PhpTypeError,
      "Illuminate\\Support\\Arr::push(): Return value must be of type array, " + name + " returned");
    Assert.assertTrue(ref.value === object);
    Assert.assertSame({ x: [1] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
  }
  class InvalidSetReturnArr extends Arr {
    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
      super.set(array, key, value);
      return 42;
    }
  }
  const invalidSetReturnRef = new Ref<unknown>({ x: [] });
  fails(() => InvalidSetReturnArr.push(invalidSetReturnRef, "x", 1), PhpTypeError,
    "Illuminate\\Support\\Arr::push(): Return value must be of type array, int returned");
  Assert.assertSame({ x: [1] }, invalidSetReturnRef.value);

  const deepRef = new Ref<unknown>([]);
  Assert.assertSame({ leaf: 1 }, Arr.set(deepRef, [...Array<string>(49_999).fill("child"), "leaf"].join("."), 1));
  let deepCurrent = deepRef.value;
  for (let depth = 0; depth < 49_999; depth++) {
    Assert.assertTrue(deepCurrent !== null && typeof deepCurrent === "object");
    deepCurrent = (deepCurrent as { child: unknown }).child;
  }
  Assert.assertSame({ leaf: 1 }, deepCurrent);

  const leafObject = new ArrayObject({ x: [] });
  const leafRef = new Ref<unknown>(leafObject);
  fails(() => Arr.push(leafRef, "x", 1), PhpTypeError,
    "Illuminate\\Support\\Arr::push(): Return value must be of type array, ArrayObject returned");
  Assert.assertTrue(leafRef.value === leafObject);
  Assert.assertSame({ x: [1] }, leafObject.getArrayCopy());
  const nullObject = new ArrayObject({ x: [] });
  const nullObjectRef = new Ref<unknown>(nullObject);
  fails(() => Arr.push(nullObjectRef, null, 1), InvalidArgumentException,
    "Array value for key [] must be an array, object found.");
  Assert.assertTrue(nullObjectRef.value === nullObject);
  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
  const nullArrayRef = new Ref<unknown>({ x: [] });
  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), Arr.push(nullArrayRef, null, 1));
  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), nullArrayRef.value);
  const replaceObjectRef = new Ref<unknown>(nullObject);
  const replacementRoot = { replacement: [1] };
  Assert.assertSame(replacementRoot, Arr.set(replaceObjectRef, null, replacementRoot));
  replacementRoot.replacement.push(2);
  Assert.assertSame({ replacement: [1] }, replaceObjectRef.value);
  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
  const nestedSparseRef = new Ref<unknown>({ parent: { sparse: pushSparse } });
  Assert.assertSame({ sparse: new PhpArray([[6, "next"]]) }, Arr.push(nestedSparseRef, "parent.sparse", "next"));
  Assert.assertSame([[6, "next"]], arrayEntries(Arr.get(nestedSparseRef.value, "parent.sparse") as object));
  Assert.assertSame([], arrayEntries(pushSparse));
  // Released ESC-14.6-8 assignment and argument-order regressions.
  const keySnapshot = { child: [1], typedHandle };
  class SetSnapshotKey {
    toString(): string { keySnapshot.child.push(2); return "leaf"; }
  }
  const snapshotRef = new Ref<unknown>([]);
  Arr.set(snapshotRef, new SetSnapshotKey(), keySnapshot);
  Assert.assertSame([1, 2], keySnapshot.child);
  Assert.assertSame([1], Arr.get(snapshotRef.value, "leaf.child"));
  Assert.assertTrue(Arr.get(snapshotRef.value, "leaf.typedHandle") === typedHandle);

  const keyPushRef = new Ref<unknown>({ x: [1] });
  const keyPushValue = { child: [1] };
  class PushMutationKey {
    toString(): string {
      const current = Arr.array(keyPushRef.value, "x") as number[];
      current.push(2);
      Arr.set(keyPushRef, "x", current);
      keyPushValue.child.push(2);
      return "x";
    }
  }
  Assert.assertSame({ x: [1, 2, { child: [1] }] }, Arr.push(keyPushRef, new PushMutationKey(), keyPushValue));
  Assert.assertSame({ x: [1, 2, { child: [1] }] }, keyPushRef.value);
  Assert.assertSame([1, 2], keyPushValue.child);

  class IgnoredInitialization extends OrderedAccess {
    returned: unknown = 12;
    override offsetExists(key: unknown): boolean { this.calls.push(["exists", key]); return false; }
    override offsetSet(key: unknown, value: unknown): void { this.calls.push(["set", key, valueCopy(value)]); }
    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return valueCopy(this.returned); }
  }
  for (const path of ["x.y", "x.y.z"]) {
    const object = new IgnoredInitialization();
    const ref = new Ref<unknown>(object);
    fails(() => Arr.set(ref, path, 1), PhpError, "Cannot use a scalar value as an array");
    Assert.assertTrue(ref.value === object);
    Assert.assertSame({ x: [] }, object.stored);
    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
  }
  for (const returned of [null, false]) {
    const object = new IgnoredInitialization();
    object.returned = returned;
    Assert.assertSame({ z: 1 }, Arr.set(new Ref(object), "x.y.z", 1));
    Assert.assertSame({ x: [] }, object.stored);
  }
  const stringOffset = new IgnoredInitialization();
  stringOffset.returned = "abc";
  fails(() => Arr.set(new Ref(stringOffset), "x.y", 1), PhpTypeError,
    "Cannot access offset of type string on string");
  Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], stringOffset.calls);

  // Pinned PHP 8.5.11 ESC-14.6-9 cases: the write precedes forbidden string reference acquisition.
  for (const path of ["x.0.z", "x.1.z", "x.y.z", "x.0"]) {
    const object = new IgnoredInitialization();
    object.returned = "abc";
    const root = new Ref<unknown>(object);
    if (path === "x.0") Assert.assertSame("1bc", Arr.set(root, path, 1));
    else if (path === "x.y.z") fails(() => Arr.set(root, path, 1), PhpTypeError,
      "Cannot access offset of type string on string");
    else fails(() => Arr.set(root, path, 1), PhpError,
      "Cannot create references to/from string offsets");
    Assert.assertTrue(root.value === object);
    Assert.assertSame({ x: [] }, object.stored);
    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
  }
  // Exercise the arbitrary receiver matrix through Arr rather than calling runtime helpers directly.
  for (const initial of [null, false, [], {}, new PhpArray()]) {
    for (const path of ["leaf", "child.leaf"]) {
      const root = new Ref<unknown>(valueCopy(initial));
      Assert.assertSame({ leaf: 1 }, Arr.set(root, path, 1));
      Assert.assertSame(path === "leaf" ? { leaf: 1 } : { child: { leaf: 1 } }, root.value);
    }
  }
  for (const initial of [true, 12, float(1.5)]) {
    for (const path of ["leaf", "child.leaf"]) {
      const root = new Ref<unknown>(initial);
      fails(() => Arr.set(root, path, 1), PhpError, "Cannot use a scalar value as an array");
      Assert.assertSame(initial, root.value);
    }
    const object = new IgnoredInitialization();
    object.returned = initial;
    fails(() => Arr.set(new Ref(object), "x.y.z", 1), PhpError, "Cannot use a scalar value as an array");
    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
  }
  for (const path of ["leaf", "child.leaf"]) {
    const object = new stdClass();
    const root = new Ref<unknown>(object);
    fails(() => Arr.set(root, path, 1), PhpError, "Cannot use object of type stdClass as array");
    Assert.assertTrue(root.value === object);
    Assert.assertSame([], Object.keys(object));
  }
  for (const path of ["0", "1", "0.z", "1.z", "y", "y.z"]) {
    const root = new Ref<unknown>("abc");
    if (path === "0" || path === "1") {
      const expected = path === "0" ? "1bc" : "a1c";
      Assert.assertSame(expected, Arr.set(root, path, 1));
      Assert.assertSame(expected, root.value);
    } else if (path.startsWith("y")) {
      fails(() => Arr.set(root, path, 1), PhpTypeError, "Cannot access offset of type string on string");
      Assert.assertSame("abc", root.value);
    } else {
      fails(() => Arr.set(root, path, 1), PhpError, "Cannot create references to/from string offsets");
      Assert.assertSame(path === "0.z" ? "Abc" : "aAc", root.value);
    }
  }

  class ChangingReads extends OrderedAccess {
    reads = 0;
    override offsetGet(key: unknown): unknown {
      this.calls.push(["get", key]);
      return this.reads++ === 0 ? [] : 12;
    }
  }
  const changingReads = new ChangingReads();
  fails(() => Arr.set(new Ref(changingReads), "x.y", 1), PhpError, "Cannot use a scalar value as an array");
  Assert.assertSame([["exists", "x"], ["get", "x"], ["get", "x"]], changingReads.calls);
  Assert.assertSame({ x: [] }, changingReads.stored);

  class ThrowingSet extends OrderedAccess {
    override offsetSet(key: unknown, value: unknown): void {
      super.offsetSet(key, value);
      throw new PhpError("offset write failed");
    }
  }
  const throwingSet = new ThrowingSet();
  throwingSet.stored = [];
  const throwingSetRef = new Ref<unknown>(throwingSet);
  fails(() => Arr.set(throwingSetRef, "x.y", 1), PhpError, "offset write failed");
  Assert.assertTrue(throwingSetRef.value === throwingSet);
  Assert.assertSame({ x: [] }, throwingSet.stored);
  Assert.assertSame([["exists", "x"], ["set", "x", []]], throwingSet.calls);

  class BuiltinReadOverrides extends ArrayObject {
    calls: unknown[][] = [];
    override offsetExists(key: Parameters<ArrayObject["offsetExists"]>[0]): boolean {
      this.calls.push(["exists", key]); return false;
    }
    override offsetSet(key: Parameters<ArrayObject["offsetSet"]>[0], value: unknown): void {
      this.calls.push(["set", key, valueCopy(value)]); super.offsetSet(key, value);
    }
  }
  const builtinReadOverrides = new BuiltinReadOverrides({ x: [99] });
  Assert.assertSame({ y: 1 }, Arr.set(new Ref(builtinReadOverrides), "x.y", 1));
  Assert.assertSame({ x: { y: 1 } }, builtinReadOverrides.getArrayCopy());
  Assert.assertSame([["exists", "x"], ["set", "x", []]], builtinReadOverrides.calls);

  class InvalidArrayReturnArr extends Arr {
    static writes = 0;
    static override array(): unknown { return 12; }
    static override set(): unknown { this.writes++; return []; }
  }
  const invalidArrayReturnRef = new Ref<unknown>({ x: [] });
  fails(() => InvalidArrayReturnArr.push(invalidArrayReturnRef, "x", 1), PhpTypeError,
    "array_push(): Argument #1 ($array) must be of type array, int given");
  Assert.assertSame(0, InvalidArrayReturnArr.writes);
  Assert.assertSame({ x: [] }, invalidArrayReturnRef.value);

  // Pinned PHP 8.5.11 copy-isolation matrix from ESC-14.6-10. Temporary traversal creates no surviving cells.
  for (const [initial, key, original, changed] of [
    [{ x: { y: 1 } }, "x.y", { x: { y: 2 } }, { x: { y: 3 } }],
    [[[1]], "0.0", [[2]], [[3]]],
    [new PhpArray([["x", new PhpArray([["y", 1]])]]), "x.y", { x: { y: 2 } }, { x: { y: 3 } }],
  ] as const) {
    const root = new Ref<unknown>(initial);
    Arr.set(root, key, 2);
    const copy = new Ref(valueCopy(root.value));
    Arr.set(copy, key, 3);
    Assert.assertSame(original, root.value);
    Assert.assertSame(changed, copy.value);
  }
  const isolationRoot = new Ref<unknown>({ x: { y: { z: 1 } } });
  Arr.set(isolationRoot, "x.y.z", 2);
  const selectedCopy = new Ref(Arr.array(isolationRoot.value, "x"));
  Arr.set(selectedCopy, "y.z", 3);
  Assert.assertSame({ x: { y: { z: 2 } } }, isolationRoot.value);
  Assert.assertSame({ y: { z: 3 } }, selectedCopy.value);
  const returnedRoot = new Ref(Arr.set(isolationRoot, "leaf", 1));
  Arr.set(returnedRoot, "x.y.z", 4);
  Assert.assertSame({ x: { y: { z: 2 } }, leaf: 1 }, isolationRoot.value);
  Assert.assertSame({ x: { y: { z: 4 } }, leaf: 1 }, returnedRoot.value);
  const collectionCopy = new Ref(new Collection(isolationRoot.value).all());
  Arr.set(collectionCopy, "x.y.z", 5);
  Assert.assertSame({ x: { y: { z: 2 } }, leaf: 1 }, isolationRoot.value);
  Assert.assertSame({ x: { y: { z: 5 } }, leaf: 1 }, collectionCopy.value);
  for (const object of [new ArrayObject({ x: { y: { z: 1 } } }), new InheritedOffsetGet({ x: { y: { z: 1 } } })]) {
    Arr.set(new Ref(object), "x.y.z", 2);
    const copy = new Ref(object.getArrayCopy());
    Arr.set(copy, "x.y.z", 3);
    Assert.assertSame({ x: { y: { z: 2 } } }, object.getArrayCopy());
    Assert.assertSame({ x: { y: { z: 3 } } }, copy.value);
  }
  const repeatedPushRoot = new Ref<unknown>({ x: { values: [] } });
  Arr.push(repeatedPushRoot, "x.values", 1);
  const repeatedPushCopy = new Ref(Arr.array(repeatedPushRoot.value, null));
  Arr.push(repeatedPushCopy, "x.values", 2);
  Assert.assertSame({ x: { values: [1] } }, repeatedPushRoot.value);
  Assert.assertSame({ x: { values: [1, 2] } }, repeatedPushCopy.value);
  const parentRoot = new Ref<unknown>({ x: { y: { z: 1 }, values: [] } });
  Arr.set(parentRoot, "x.y.z", 2);
  const returnedParent = new Ref(Arr.push(parentRoot, "x.values", 1));
  Arr.set(returnedParent, "y.z", 3);
  Assert.assertSame({ x: { y: { z: 2 }, values: [1] } }, parentRoot.value);
  Assert.assertSame({ y: { z: 3 }, values: [1] }, returnedParent.value);
  const heldRoot = new Ref<unknown>({ x: { y: 1 } });
  const held = referenceAt(heldRoot, "x");
  const heldCopy = new Ref(valueCopy(heldRoot.value));
  offsetAssign(held, "y", 2);
  Assert.assertSame({ x: { y: 2 } }, heldRoot.value);
  Assert.assertSame({ x: { y: 2 } }, heldCopy.value);
  // Arr's shallow reconstruction must also update the genuine surviving cell, in both directions.
  Arr.set(heldRoot, "x.y", 3);
  Assert.assertSame({ y: 3 }, held.value);
  Assert.assertSame({ x: { y: 3 } }, heldCopy.value);
  Arr.set(heldCopy, "x.y", 4);
  Assert.assertSame({ y: 4 }, held.value);
  Assert.assertSame({ x: { y: 4 } }, heldRoot.value);
  const detachedIsolation = new UserlandOffsetGet({ x: { y: { z: 1 } } });
  Arr.set(new Ref(detachedIsolation), "x.y.z", 2);
  const detachedIsolationCopy = new Ref(detachedIsolation.getArrayCopy());
  Arr.set(detachedIsolationCopy, "x.y.z", 3);
  Assert.assertSame({ x: { y: { z: 1 } } }, detachedIsolation.getArrayCopy());
  Assert.assertSame({ x: { y: { z: 3 } } }, detachedIsolationCopy.value);

  // offsetExists can replace the live caller receiver before the conditional offset read.
  const replacedReceiver = new Ref<unknown>(null);
  class ReplacingExists extends OrderedAccess {
    override offsetExists(key: unknown): boolean {
      this.calls.push(["exists", key]);
      replacedReceiver.value = { x: 12 };
      return true;
    }
    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return []; }
  }
  const replacedObject = new ReplacingExists();
  replacedReceiver.value = replacedObject;
  Assert.assertSame({ y: 1 }, Arr.set(replacedReceiver, "x.y", 1));
  Assert.assertSame({ x: { y: 1 } }, replacedReceiver.value);
  Assert.assertSame([["exists", "x"]], replacedObject.calls);
  Assert.assertSame({ x: [] }, replacedObject.stored);

  for (const [initial, key] of [
    [new PhpArray([["existing", 1]]), "leaf"],
    [new PhpArray([["x", 12]]), "x.y"],
  ] as const) {
    const root = new Ref<unknown>(initial);
    const result = Arr.set(root, key, 2);
    Assert.assertTrue(root.value instanceof PhpArray);
    Assert.assertSame(key === "leaf" ? { existing: 1, leaf: 2 } : { x: { y: 2 } }, root.value);
    if (key === "leaf") Assert.assertTrue(result instanceof PhpArray);
    Assert.assertSame(key === "leaf" ? { existing: 1, leaf: 2 } : { y: 2 }, result);
  }
  const nestedForm = new Ref<unknown>({ parent: new PhpArray([["existing", 1]]) });
  const nestedFormResult = Arr.set(nestedForm, "parent.leaf", 2);
  Assert.assertTrue(nestedFormResult instanceof PhpArray);
  Assert.assertTrue((nestedForm.value as { parent: unknown }).parent instanceof PhpArray);
  Assert.assertSame({ parent: { existing: 1, leaf: 2 } }, nestedForm.value);
  Assert.assertSame({ existing: 1, leaf: 2 }, nestedFormResult);

  const nestedInitializationForm = new Ref<unknown>({ parent: new PhpArray([["x", 12]]) });
  Assert.assertSame({ y: 2 }, Arr.set(nestedInitializationForm, "parent.x.y", 2));
  Assert.assertTrue((nestedInitializationForm.value as { parent: unknown }).parent instanceof PhpArray);
  Assert.assertSame({ parent: { x: { y: 2 } } }, nestedInitializationForm.value);

  // A native parent's object child is explicitly replaced before descent: its offset callbacks never run.
  const nativeParent = new Ref<unknown>(null);
  class ReplacedNativeChild extends OrderedAccess {
    override offsetExists(): boolean { throw new PhpError("unexpected native-child exists"); }
    override offsetGet(): unknown { throw new PhpError("unexpected native-child get"); }
    override offsetSet(): void { throw new PhpError("unexpected native-child set"); }
  }
  const replacedNativeChild = new ReplacedNativeChild();
  nativeParent.value = { parent: { access: replacedNativeChild }, untouched: [1] };
  Assert.assertSame({ leaf: 1 }, Arr.set(nativeParent, "parent.access.missing.leaf", 1));
  Assert.assertSame({ parent: { access: { missing: { leaf: 1 } } }, untouched: [1] }, nativeParent.value);
  Assert.assertSame({ x: [] }, replacedNativeChild.stored);
  Assert.assertSame([], replacedNativeChild.calls);

  // Genuine caller references at scalar/null and multiple native levels survive reconstruction.
  for (const initial of [12, null]) {
    const root = new Ref<unknown>({ x: initial });
    const alias = referenceAt(root, "x");
    const copy = new Ref(valueCopy(root.value));
    Assert.assertSame({ z: 1 }, Arr.set(root, "x.y.z", 1));
    Assert.assertSame({ y: { z: 1 } }, alias.value);
    Assert.assertSame({ x: { y: { z: 1 } } }, copy.value);
    offsetAssign(alias, "extra", 2);
    Assert.assertSame({ x: { y: { z: 1 }, extra: 2 } }, root.value);
    Assert.assertSame({ x: { y: { z: 1 }, extra: 2 } }, copy.value);
  }
  const multiAliasRoot = new Ref<unknown>({ x: { y: null } });
  const outerAlias = referenceAt(multiAliasRoot, "x");
  const innerAlias = referenceAt(outerAlias, "y");
  const multiAliasCopy = new Ref(valueCopy(multiAliasRoot.value));
  Assert.assertSame({ leaf: 1 }, Arr.set(multiAliasRoot, "x.y.z.leaf", 1));
  Assert.assertSame({ z: { leaf: 1 } }, innerAlias.value);
  Assert.assertSame({ y: { z: { leaf: 1 } } }, outerAlias.value);
  Assert.assertSame({ x: { y: { z: { leaf: 1 } } } }, multiAliasCopy.value);
  Arr.set(multiAliasCopy, "x.y.z.leaf", 2);
  Assert.assertSame({ z: { leaf: 2 } }, innerAlias.value);
  Assert.assertSame({ x: { y: { z: { leaf: 2 } } } }, multiAliasRoot.value);

  const recursive = new PhpArray<string | number, unknown>([
    ["z", new PhpArray<string, unknown>([["b", [10, 2, 1]], ["a", { value: [3, 1, 2] }]])],
    [4, ["item10", "item2", "item1"]],
  ]);
  const recursiveSnapshot = valueCopy(recursive);
  const ascending = Arr.sortRecursive(recursive, { options: SORT_NATURAL });
  Assert.assertSame([4, "z"], arrayEntries(ascending as object).map(([key]) => key));
  Assert.assertSame(["a", "b"], arrayEntries(Arr.get(ascending, "z") as object).map(([key]) => key));
  Assert.assertSame(["item1", "item2", "item10"], Arr.get(ascending, 4));
  Assert.assertSame([1, 2, 10], Arr.get(ascending, "z.b"));
  const descending = Arr.sortRecursive(recursive, { options: SORT_NATURAL, descending: SortDirection.Descending });
  Assert.assertSame(["z", 4], arrayEntries(descending as object).map(([key]) => key));
  Assert.assertSame([10, 2, 1], Arr.get(descending, "z.b"));
  Assert.assertSame(descending, Arr.sortRecursiveDesc(recursive, SORT_NATURAL));
  Assert.assertSame(ascending, Arr.sortRecursive(recursive, SORT_NATURAL, SortDirection.Ascending));
  Assert.assertSame(descending, Arr.sortRecursive(recursive, SORT_NATURAL, true));
  Assert.assertSame(descending, Arr.sortRecursive(recursive, { options: SORT_NATURAL, descending: true }));
  for (const invalid of [null, 1, "array", true, new stdClass()]) {
    let error: unknown = null;
    try { Arr.sortRecursive(invalid); } catch (caught) { error = caught; }
    Assert.assertInstanceOf(PhpTypeError, error);
  }
  const deletedHighest = new PhpArray<string | number, unknown>([[9, "deleted"], ["b", 2], ["a", 1]]);
  deletedHighest.delete(9);
  const sortedWithHistory = new Ref(Arr.sortRecursive(deletedHighest));
  arrayAppend(sortedWithHistory, "appended");
  Assert.assertSame([["a", 1], ["b", 2], [10, "appended"]], arrayEntries(sortedWithHistory.value as object));
  Assert.assertSame([["b", 2], ["a", 1]], arrayEntries(deletedHighest));
  for (const descending_ of [false, true]) {
    const nestedHistory = new Ref(Arr.get(Arr.sortRecursive({ nested: deletedHighest }, 0, descending_), "nested"));
    arrayAppend(nestedHistory, "appended");
    Assert.assertSame(descending_ ? [["b", 2], ["a", 1], [10, "appended"]] : [["a", 1], ["b", 2], [10, "appended"]], arrayEntries(nestedHistory.value as object));
    const directHistory = new Ref(Arr.sortRecursive(deletedHighest, 0, descending_));
    arrayAppend(directHistory, "appended");
    Assert.assertSame(10, arrayEntries(directHistory.value as object).at(-1)![0]);
    const listHistory = new PhpArray([[0, 2], [1, 1], [9, 99]]);
    listHistory.delete(9);
    const sortedList = new Ref(Arr.sortRecursive(listHistory, 0, descending_));
    arrayAppend(sortedList, 3);
    Assert.assertSame(descending_ ? [2, 1, 3] : [1, 2, 3], sortedList.value);
  }
  Assert.assertSame([1, 2], Arr.sortRecursive([2, 1], {}));
  Assert.assertSame([2, 1], Arr.sortRecursive([1, 2], { descending: true }));
  const handle = new class { value = 1; }();
  Assert.assertTrue(Arr.get(Arr.sortRecursive({ nested: [handle] }), "nested.0") === handle);
  Assert.assertTrue((Arr.shuffle([[handle]])[0] as unknown[])[0] === handle);

  const recursiveCalls: [unknown, unknown, unknown][] = [];
  class RecordingRecursiveArr extends Arr {
    static override sortRecursive(array: unknown, options: number | { options?: number; descending?: boolean | SortDirection } = 0, descending: boolean | SortDirection = false): unknown {
      recursiveCalls.push([valueCopy(array), options, descending]);
      return super.sortRecursive(array, options, descending);
    }
  }
  Assert.assertSame({ nested: ["item10", "item2"] }, RecordingRecursiveArr.sortRecursive({ nested: ["item2", "item10"] }, SORT_NATURAL, true));
  Assert.assertSame([[{ nested: ["item2", "item10"] }, SORT_NATURAL, true], [["item2", "item10"], SORT_NATURAL, true]], recursiveCalls);
  recursiveCalls.length = 0;
  RecordingRecursiveArr.sortRecursive({ nested: ["item2", "item10"] }, { options: SORT_NATURAL, descending: true });
  Assert.assertSame([[{ nested: ["item2", "item10"] }, { options: SORT_NATURAL, descending: true }, false], [["item2", "item10"], SORT_NATURAL, true]], recursiveCalls);
  let associativeDirectionError: unknown = null;
  try { Arr.sortRecursive({ key: 1 }, 0, "invalid" as never); } catch (error) { associativeDirectionError = error; }
  Assert.assertInstanceOf(UnhandledMatchError, associativeDirectionError);
  let directionError: unknown = null;
  try { Arr.sortRecursive([], 0, "invalid" as never); } catch (error) { directionError = error; }
  Assert.assertInstanceOf(UnhandledMatchError, directionError);
  (recursive.get("z") as PhpArray).set("later", [9]);
  Assert.assertFalse(Arr.has(ascending, "z.later"));
  const isolated = new Ref(ascending);
  Arr.set(isolated, "z.a.value.0", 99);
  Assert.assertSame(recursiveSnapshot, Arr.except(recursive, "z.later"));
  Assert.assertSame([1, 2, 3], Arr.get(ascending, "z.a.value"));
  const returnedZ = arrayEntries(ascending as object).find(([key]) => key === "z")![1] as object;
  const returnedA = arrayEntries(returnedZ).find(([key]) => key === "a")![1] as object;
  const returnedValues = arrayEntries(returnedA).find(([key]) => key === "value")![1] as number[];
  returnedValues[0] = 77;
  Assert.assertSame([3, 1, 2], Arr.get(recursive, "z.a.value"));
  class RecursiveArr extends Arr {
    static override sortRecursive(array: unknown): unknown { return { overridden: array }; }
  }
  Assert.assertSame({ overridden: [2, 1] }, RecursiveArr.sortRecursiveDesc([2, 1]));
  let arrayTypeError: unknown = null;
  try { Arr.isAssoc(null); } catch (error) { arrayTypeError = error; }
  Assert.assertInstanceOf(PhpTypeError, arrayTypeError);
  Assert.assertSame("Illuminate\\Support\\Arr::isAssoc(): Argument #1 ($array) must be of type array, null given", (arrayTypeError as PhpTypeError).getMessage());
  for (const invoke of [() => (Arr.isAssoc as () => boolean)(), () => Arr.isAssoc(1), () => Arr.isAssoc(new stdClass())]) {
    let error: unknown = null;
    try { invoke(); } catch (caught) { error = caught; }
    Assert.assertInstanceOf(PhpTypeError, error);
  }
  for (const method of ["isAssoc", "isList", "query", "shuffle", "sortRecursive", "sortRecursiveDesc"] as const) {
    let error: unknown = null;
    try { (Arr[method] as () => unknown)(); } catch (caught) { error = caught; }
    Assert.assertInstanceOf(PhpTypeError, error);
    Assert.assertInstanceOf(ArgumentCountError, error);
    const qualifier = method.startsWith("sortRecursive") ? "at least" : "exactly";
    Assert.assertSame("Too few arguments to function Illuminate\\Support\\Arr::" + method + "(), 0 passed and " + qualifier + " 1 expected", (error as ArgumentCountError).getMessage());
  }
  Assert.assertFalse(Arr.isAssoc(["a", "b"]));
  Assert.assertTrue(Arr.isAssoc({ a: 1 }));
  Assert.assertTrue(Arr.isAssoc(new PhpArray([[2, "a"]])));
  Assert.assertSame("q=a%20b%2B%26&nested%5B0%5D=%C3%A9&nested%5B1%5D=1", Arr.query({ q: "a b+&", nested: ["é", true], absent: null }));
  const shuffleSource = new PhpArray<string | number, unknown>([[9, { nested: [1] }], ["last", { nested: [2] }]]);
  const shuffled = Arr.shuffle(shuffleSource) as { nested: number[] }[];
  Assert.assertTrue(Array.isArray(shuffled));
  Assert.assertSame([1, 2], shuffled.map((item) => item.nested[0]!).sort((a, b) => a - b));
  shuffled[0]!.nested[0] = 99;
  Assert.assertSame(new PhpArray<string | number, unknown>([[9, { nested: [1] }], ["last", { nested: [2] }]]), shuffleSource);

  const arrayable = new class implements Arrayable {
    get [Arrayable.brand](): true { return true; }
    toArray(): unknown[] { return []; }
  }();
  const jsonable = new class implements Jsonable {
    get [Jsonable.brand](): true { return true; }
    toJson(): string { return "[]"; }
  }();
  const serializable = new class implements JsonSerializable {
    get [JsonSerializable.brand](): true { return true; }
    jsonSerialize(): unknown { return []; }
  }();
  for (const item of [[], {}, new PhpArray(), arrayable, jsonable, serializable, new ArrayIterator([]), new Collection(), (function* () { yield 1; })()]) Assert.assertTrue(Arr.arrayable(item));
  for (const item of [null, "abc", 123, 12.34, true, new stdClass(), () => null]) Assert.assertFalse(Arr.arrayable(item));

  const forms = [
    new PhpArray<string, unknown>([["root", new PhpArray<string, unknown>([["leaf", new PhpArray([[0, "a"], [1, "b"]])], ["nullable", null]])]]),
    [{ leaf: ["a", "b"], nullable: null }],
    { root: { leaf: ["a", "b"], nullable: null } },
    new PhpArray<string | number, unknown>([["1", { leaf: ["a", "b"], nullable: null }], ["tail", "last"]]),
  ];
  for (const [index, input] of forms.entries()) {
    const prefix = index === 1 ? "0" : index === 3 ? "1" : "root";
    const snapshot = valueCopy(input);
    Assert.assertSame("b", Arr.get(input, prefix + ".leaf.1"));
    Assert.assertTrue(Arr.has(input, prefix + ".nullable"));
    Assert.assertNull(Arr.get(input, prefix + ".nullable", "default"));
    Assert.assertFalse(Arr.has(input, prefix + ".absent"));
    Assert.assertSame("default", Arr.get(input, prefix + ".absent", () => "default"));
    Assert.assertFalse(Arr.has(input, []));
    Assert.assertFalse(Arr.has(input, null));
    const read = new Ref(Arr.get(input, prefix + ".leaf"));
    Arr.set(read, "0", "changed");
    Assert.assertSame("a", Arr.get(input, prefix + ".leaf.0"));
    const ref = new Ref<unknown>(input);
    const replacement = ["new"];
    const returned = new Ref(Arr.set(ref, prefix + ".leaf.1", replacement));
    replacement[0] = "external";
    Assert.assertSame(["new"], Arr.get(ref.value, prefix + ".leaf.1"));
    Arr.set(returned, "1.0", "returned");
    Assert.assertSame(["new"], Arr.get(ref.value, prefix + ".leaf.1"));
    Arr.forget(ref, prefix + ".leaf.0");
    Assert.assertFalse(Arr.has(ref.value, prefix + ".leaf.0"));
    Assert.assertSame([1], arrayEntries(Arr.get(ref.value, prefix + ".leaf") as object).map(([key]) => key));
    Assert.assertSame(snapshot, input);
    Assert.assertTrue(Arr.hasAll(input, [prefix + ".leaf", prefix + ".nullable"]));
    Assert.assertTrue(Arr.hasAny(input, ["missing", prefix + ".nullable"]));
  }

  const literal = { "a.b": null, a: { b: "nested" } };
  Assert.assertNull(Arr.get(literal, "a.b", "fallback"));
  Assert.assertTrue(Arr.has(literal, "a.b"));
  const literalRef = new Ref<unknown>(literal);
  Arr.set(literalRef, "a.b", "written");
  Assert.assertNull(Arr.get(literalRef.value, "a.b"));
  Assert.assertSame("written", Arr.get(Arr.get(literalRef.value, "a"), "b"));
  Assert.assertSame("nested", Arr.get(literal.a, "b"));
  Arr.set(literalRef, "a.b", "nested");
  Arr.forget(literalRef, "a.b");
  Assert.assertSame({ a: { b: "nested" } }, literalRef.value);
  Assert.assertSame("nested", Arr.get(literalRef.value, "a.b"));
  Assert.assertSame(literal, Arr.get(literal, null));
  Assert.assertSame("fallback", Arr.get(null, null, "fallback"));

  const normalized = new Ref<unknown>(new PhpArray([["tail", "last"]]));
  Arr.set(normalized, "1", "one");
  Arr.set(normalized, "01", "leading zero");
  Arr.set(normalized, "1", "replacement");
  Assert.assertSame([["tail", "last"], [1, "replacement"], ["01", "leading zero"]], arrayEntries(normalized.value as object));
  Arr.forget(normalized, 1);
  Assert.assertSame([["tail", "last"], ["01", "leading zero"]], arrayEntries(normalized.value as object));

  const whole = new Ref<unknown>({ old: true });
  const newValue = { list: [1] };
  Arr.set(whole, null, newValue);
  newValue.list[0] = 2;
  Assert.assertSame({ list: [1] }, whole.value);
  Assert.assertSame("fallback", Arr.first([], { default: "fallback" }));
  Assert.assertSame("fallback", Arr.last([], { default: "fallback" }));
  Assert.assertSame(["A", "B"], Arr.map(["a", "b"], "strtoupper"));
  const predicate = new class { __invoke(value: unknown, _key: unknown): boolean { return typeof value === "string"; } }();
  Assert.assertTrue(Arr.every(["a", "b"], predicate));
  Assert.assertTrue(Arr.some([1, "b"], predicate));
  const target = new class { matches(value: unknown, _key: unknown): boolean { return typeof value === "string"; } }();
  Assert.assertTrue(Arr.every(["a", "b"], [target, "matches"]));
  Assert.assertSame("a", Arr.first([1, "a"], [target, "matches"]));
  Assert.assertSame("b", Arr.last(["a", 1, "b"], { callback: [target, "matches"] }));
  Assert.assertSame(["A-0", "B-1"], Arr.mapSpread([["A"], ["B"]], (value: string, key: number) => `${value}-${key}`));

  // Each predicate stops at its first decisive item without pre-materializing a Traversable.
  for (const decisive of [true, false]) {
    let closed = 0;
    const source = function* (): globalThis.Generator<unknown, void, unknown> {
      try { yield keyed("first", { decisive }); throw new Error("over-read"); }
      finally { closed++; }
    };
    const callback = (item: { decisive: boolean }, key: unknown) => {
      Assert.assertSame("first", key);
      return item.decisive;
    };
    const held = source();
    Assert.assertSame(decisive, decisive ? Arr.some(held, callback) : Arr.every(held, callback));
    Assert.assertSame(0, closed);
    held.return(undefined);
    Assert.assertSame(1, closed);
  }
  Assert.assertTrue(Arr.every((function* () { yield 1; yield 2; })(), (item: number, key: number) => item === key + 1));

  const mutable = new PhpArray<string, unknown>([["b", { rank: 2, nested: ["b"] }], ["a", { rank: 1, nested: ["a"] }]]);
  const before = valueCopy(mutable);
  const keyedRetriever = new class { rank(item: { rank: number }): number { return item.rank; } }();
  const rank = new class { __invoke(item: { rank: number }): number { return item.rank; } }();
  const outputs = [Arr.where(mutable, () => true), Arr.reject(mutable, () => false), Arr.whereNotNull(mutable), Arr.keyBy(mutable, "rank"), Arr.sort(mutable, [keyedRetriever, "rank"]), Arr.sortDesc(mutable, rank)];
  Assert.assertSame(["a", "b"], arrayEntries(outputs[4] as object).map(([key]) => key));
  Assert.assertSame(["b", "a"], arrayEntries(outputs[5] as object).map(([key]) => key));
  for (const output of outputs) {
    const first = arrayEntries(output as object)[0]![1] as { nested: string[] };
    first.nested[0] = "changed";
    Assert.assertSame(before, mutable);
  }

  const nestedInput = { a: { nested: ["a"] }, b: { nested: ["b"] } };
  const nestedSnapshot = valueCopy(nestedInput);
  const divided = Arr.divide(nestedInput);
  (divided[1][0] as { nested: string[] }).nested[0] = "changed";
  Assert.assertSame(nestedSnapshot, nestedInput);
  for (const limit of [1, -1, -1n]) {
    const taken = Arr.take(nestedInput, limit);
    (arrayEntries(taken as object)[0]![1] as { nested: string[] }).nested[0] = "changed";
    Assert.assertSame(nestedSnapshot, nestedInput);
  }
  Assert.assertSame({ b: { nested: ["b"] } }, Arr.take(nestedInput, -1n));
  for (const output of [Arr.onlyValues(nestedInput, [nestedInput.a]), Arr.exceptValues(nestedInput, [nestedInput.b])]) {
    (arrayEntries(output as object)[0]![1] as { nested: string[] }).nested[0] = "changed";
    Assert.assertSame(nestedSnapshot, nestedInput);
  }
  for (const decisive of [true, false]) {
    let calls = 0;
    const callback = new class {
      __invoke(item: { nested: string[] }, key: unknown): boolean {
        calls++;
        Assert.assertSame("a", key);
        item.nested[0] = "callback mutation";
        return decisive;
      }
    }();
    Assert.assertSame(decisive, decisive ? Arr.some(nestedInput, callback) : Arr.every(nestedInput, callback));
    Assert.assertSame(1, calls);
    Assert.assertSame(nestedSnapshot, nestedInput);
  }

  // A retained write result owns untouched branches as well as the changed path.
  for (const operation of ["set", "forget"]) {
    const original = { changed: { old: 1 }, untouched: { nested: ["original"] } };
    const ref = new Ref<unknown>(original);
    if (operation === "set") Arr.set(ref, "changed.new", 2);
    else Arr.forget(ref, "changed.old");
    original.untouched.nested[0] = "external mutation";
    Assert.assertSame(["original"], Arr.get(ref.value, "untouched.nested"));
  }

  let nativeCleanup = 0;
  const native = (function* () {
    try { yield keyed("first", { nested: ["first"] }); yield keyed("second", { nested: ["second"] }); }
    finally { nativeCleanup++; }
  })();
  Assert.assertSame({ nested: ["first"] }, Arr.first(native));
  Assert.assertSame(0, nativeCleanup);
  const resumed = native.next();
  Assert.assertFalse(resumed.done ?? false);
  Assert.assertSame({ nested: ["second"] }, resumed.done ? null : resumed.value.value);
  native.return(undefined);
  Assert.assertSame(1, nativeCleanup);
  const nativePredicate = (function* () { yield keyed("skip", 1); yield keyed("match", 2); yield keyed("tail", 3); })();
  const visited: unknown[] = [];
  Assert.assertSame(2, Arr.first(nativePredicate, (item: number, key: unknown) => { visited.push(key); return item === 2; }));
  Assert.assertSame(["skip", "match"], visited);
  const predicateResumed = nativePredicate.next();
  Assert.assertFalse(predicateResumed.done ?? false);
  Assert.assertSame(3, predicateResumed.done ? null : predicateResumed.value.value);
  nativePredicate.return(undefined);

  const sparse = new PhpArray([[4, "A"], [9, "B"]]);
  const sparseSnapshot = valueCopy(sparse);
  Assert.assertSame(["AB0"], Arr.mapSpread([sparse], (a: string, b: string, key: number) => a + b + String(key)));
  Assert.assertSame(sparseSnapshot, sparse);
  let unpackError: unknown = null;
  try { Arr.mapSpread([{ named: "A" }], () => null); } catch (error) { unpackError = error; }
  Assert.assertInstanceOf(PhpError, unpackError);
  Assert.assertSame("Cannot use positional argument after named argument during unpacking", (unpackError as PhpError).getMessage());

  let enumerations = 0;
  let cleanup = 0;
  const observed: unknown[] = [];
  const lazyInput = { nested: ["original"] };
  const lazy = LazyCollection.make(function* () {
    enumerations++;
    try { yield keyed("item", lazyInput); yield keyed("tail", { nested: ["tail"] }); }
    finally { cleanup++; }
  }).tapEach((item: { nested: string[] }, key: unknown) => {
    observed.push(key);
    item.nested[0] = "callback mutation";
  });
  Assert.assertSame(0, enumerations);
  Assert.assertSame([], observed);
  Assert.assertSame({ item: { nested: ["original"] }, tail: { nested: ["tail"] } }, lazy.all());
  Assert.assertSame(1, enumerations);
  Assert.assertSame(1, cleanup);
  Assert.assertSame(["item", "tail"], observed);
  Assert.assertSame({ nested: ["original"] }, lazy.first());
  Assert.assertSame(2, enumerations);
  Assert.assertSame(2, cleanup);
  Assert.assertSame(["item", "tail", "item"], observed);
  Assert.assertSame({ nested: ["original"] }, lazyInput);

  const callbackFailure = new Error("tapEach callback");
  let errorCleanup = 0;
  let observedFailure: unknown = null;
  try {
    LazyCollection.make(function* () {
      try { yield 1; yield 2; } finally { errorCleanup++; }
    }).tapEach(() => { throw callbackFailure; }).all();
  } catch (error) { observedFailure = error; }
  Assert.assertSame(callbackFailure, observedFailure);
  Assert.assertSame(1, errorCleanup);

  const dispatch: string[] = [];
  class DerivedArr extends Arr {
    static override get(array: unknown, key: unknown, fallback: unknown = null): unknown { dispatch.push("get"); return super.get(array, key, fallback); }
    static override set(array: Ref<unknown>, key: unknown, item: unknown): unknown { dispatch.push("set"); return super.set(array, key, item); }
    static override has(array: unknown, keys: unknown): boolean { dispatch.push("has"); return super.has(array, keys); }
    static override wrap(item: unknown): unknown { dispatch.push("wrap"); return super.wrap(item); }
  }
  Assert.assertSame({ a: 1 }, DerivedArr.add([], "a", 1));
  Assert.assertSame(["get", "set"], dispatch);
  dispatch.length = 0;
  Assert.assertTrue(DerivedArr.hasAll({ a: 1 }, ["a"]));
  Assert.assertTrue(DerivedArr.hasAny({ a: 1 }, ["a"]));
  Assert.assertSame(["has", "has"], dispatch);
  dispatch.length = 0;
  Assert.assertSame("active", DerivedArr.toCssClasses({ active: true }));
  Assert.assertSame(["wrap"], dispatch);

  await verifySyncCallbacks();
});

const REPO = resolve(import.meta.dir, "../../../..");

async function withFixture<T>(source: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-collections-sync-"));
  try {
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
    writeFileSync(join(dir, "tsconfig.base.json"), readFileSync(join(REPO, "tsconfig.base.json")));
    mkdirSync(join(dir, "node_modules", "@xaravel"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "@types"), { recursive: true });
    symlinkSync(join(REPO, "packages", "collections"), join(dir, "node_modules", "@xaravel", "collections"));
    symlinkSync(join(REPO, "packages", "runtime"), join(dir, "node_modules", "@xaravel", "runtime"));
    symlinkSync(join(REPO, "node_modules", "@types", "bun"), join(dir, "node_modules", "@types", "bun"));
    writeFileSync(join(dir, "fixture.ts"), source);
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The repository's pinned `tsc -b` in `dir`: its exit code, its output, and the `fixture.ts(<line>,…): error TS<n>` pairs. */
async function tscFixture(dir: string): Promise<{ code: number; output: string; errors: string[] }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(REPO, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const output = `${stdout}${stderr}`;
  const errors = [...output.matchAll(/^fixture\.ts\((\d+),\d+\): error (TS\d+)/gm)].map((match) => `${match[1]}:${match[2]}`);
  return { code, output, errors };
}

/** oxlint with the repository's `.oxlintrc.json`, type-aware, from the repository root (lint.test.ts's form): `<line>:<rule>` per diagnostic. */
function oxlintFixture(dir: string): { code: number; output: string; diagnostics: string[] } {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", ".oxlintrc.json", "--format", "unix", join(dir, "fixture.ts")], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const diagnostics: string[] = [];
  for (const line of output.split("\n")) {
    const match = /^.+?fixture\.ts:(\d+):\d+: .*\[(?:Error|Warning)\/[\w-]+\(([\w-]+)\)\]$/.exec(line);
    if (match !== null) {
      diagnostics.push(`${match[1]}:${match[2]}`);
    }
  }
  return { code: proc.exitCode ?? -1, output, diagnostics };
}

/** Compile and lint real temp projects, as the Collections XT probes do. */
async function verifySyncCallbacks(): Promise<void> {
  const members = ["first", "last", "map", "mapWithKeys", "mapSpread", "partition", "where", "reject", "every", "some", "sole", "keyBy", "sort", "sortDesc"];
  const lines = [
    'import { Arr, LazyCollection } from "@xaravel/collections";',
    ...members.flatMap((member) => [
      `Arr.${member}([1], async (value: number) => value);`,
      `Arr.${member}([1], { __invoke: async (value: number) => value });`,
    ]),
    'LazyCollection.make([1]).tapEach(async (value: number) => value);',
    'LazyCollection.make([1]).tapEach({ __invoke: async (value: number) => value });',
  ];
  const expected = lines.slice(1).map((_, index) => index + 2);
  await withFixture(lines.join("\n") + "\n", async (dir) => {
    const tsc = await tscFixture(dir);
    Assert.assertNotEquals(0, tsc.code, tsc.output);
    Assert.assertSame(expected, tsc.errors.map((entry) => Number(entry.split(":")[0])), tsc.output);
    const lint = oxlintFixture(dir);
    Assert.assertNotEquals(0, lint.code, lint.output);
    Assert.assertSame(expected.map((line) => `${line}:no-misused-promises`), lint.diagnostics, lint.output);
  });
  const valid = lines.join("\n").replaceAll("async ", "") + "\n" + [
    'const target = { apply(value: number): number { return value; } };',
    'Arr.sort([1], [target, "apply"]);',
    'Arr.sortDesc([1], [target, "apply"]);',
    'Arr.every([1], [target, "apply"]);',
    'Arr.mapSpread([[1]], [target, "apply"]);',
  ].join("\n");
  await withFixture(valid, async (dir) => {
    const tsc = await tscFixture(dir);
    Assert.assertSame(0, tsc.code, tsc.output);
    const lint = oxlintFixture(dir);
    Assert.assertSame(0, lint.code, lint.output);
  });
}
