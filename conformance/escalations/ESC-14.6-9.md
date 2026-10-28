---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
trigger: contract
proposed: >-
  Publish shared runtime reference acquisition for an arbitrary PHP offset receiver, including PHP's Error when taking a string-offset reference, before releasing Arr.push and its associated Arr.set repair. Keep implicit PHP reference semantics in runtime; do not add a local string-reference special case in collections.
evidence: >-
  With a userland ArrayAccess offsetGet returning abc after ignored initialization, pinned PHP 8.5.11 Arr.set(root, x.0.z, 1) assigns an array to string offset 0 and then throws Error Cannot create references to/from string offsets. The attempted port delegates that write to offsetAssign but then creates a local array Ref and returns {z:1}. Runtime offsetReference accepts only ArrayAccess objects, not an arbitrary Ref-held receiver. offsetAssign solves assignment, not the subsequent reference acquisition. Five complete typed accessors and all previous tests stay released; push and its associated repair remain held whole.
---

# ESC-14.6-9: reference acquisition from an arbitrary offset receiver

The released offsetAssign contract implements the write correctly. Upstream Arr.set then takes `$array = &$array[$key]`. That next operation is observably different from an ordinary read or a new local Ref when the current receiver is a string. The public offsetReference seam handles ArrayAccess objects only. No Collections-owned language substitute is introduced.

## Pinned PHP 8.5.11 reproduction

```php
require 'conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/Arr.php';
class ProbeAccess implements ArrayAccess {
    function offsetExists($k): bool { return false; }
    function offsetGet($k): mixed { return 'abc'; }
    function offsetSet($k, $v): void {}
    function offsetUnset($k): void {}
}
foreach (['x.0.z', 'x.1.z', 'x.y.z', 'x.0'] as $key) {
    $a = new ProbeAccess;
    try { var_dump(Illuminate\Support\Arr::set($a, $key, 1)); }
    catch (Throwable $e) { echo $key, ': ', get_class($e), ': ', $e->getMessage(), "\n"; }
}
```

Observed on PHP 8.5.11 (not a recalled result):

- `x.0.z` and `x.1.z`: `Error: Cannot create references to/from string offsets` after string assignment warnings.
- `x.y.z`: `TypeError: Cannot access offset of type string on string`.
- `x.0`: returns string `1bc`.

The attempt returns `{z:1}` for the first two and matches the latter two. The ArrayAccess root handle remains unchanged because offsetGet is userland. DIV-9.17 omits notices, not these reference errors or retained writes.

## Shared contract evidence

`packages/runtime/src/php/offsetReference.ts:34` takes an ArrayAccess and models builtin versus userland offsetGet reference acquisition. `packages/runtime/src/php/offsetAssign.ts:62` takes a Ref and performs assignment, returning the assignment value. Neither supplies reference acquisition from a string receiver. `PORTING.md` has their distinct idioms. A generic string receiver can occur after a changing userland read even when the earlier is_array guard passed; the earlier ESC-14.6-8 scalar case established that traversal cannot assume an array.

## Verification and preservation

Before this probe, the complete attempt passed typecheck, lint, all 87 Story comparisons, 1,029 Collections comparisons, and all 12 Collections Xaravel tests. The focused probe exposed a case those passing checks did not cover. These are attempted-tree results, not a completion claim. The full pending canonical testPush, all preserved positive regressions, key-coercion snapshots, call-order/partial-write cases and iterative 50,000-segment creation regression are preserved below. Re-derive against the released reference contract rather than applying blindly. Add the pinned numeric-string intermediate cases and retain every previous assertion.

The executable increment keeps all five completed typed accessors and baseline set intact. Only testPush remains not-ported-yet. No runtime or grader changes and no waiver are proposed.

## Complete pending attempt (documentary, not executable)

```diff
diff --git a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
index 484b1b2c..52c540af 100644
--- a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
+++ b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
@@ -55,7 +55,7 @@
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrepend","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrependKeysWith","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPull","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-8"}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testQuery","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandom","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandomNotIncrementingKeys","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
diff --git a/packages/collections/docs/collections.md b/packages/collections/docs/collections.md
index 4287dc82..051d3b7a 100644
--- a/packages/collections/docs/collections.md
+++ b/packages/collections/docs/collections.md
@@ -157,7 +157,7 @@ Collection.proxy("adults"); // adds a proxied method, as Laravel's proxy()
 ## Divergences

 - **DIV-1:** collections are sync; a sync member's callback must be sync, and a callback that may be async goes to the async companion (`filterAsync`, `rejectAsync`, `partitionAsync`, `everyAsync`, `containsAsync`, `firstAsync`), which awaits it (DIV-1 Callbacks, DIV-1.2).
-- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`, `Arr.set`) are a `Ref`.
+- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`, `Arr.set`, `Arr.push`) are a `Ref`.
 - **DIV-9.15:** spreading a keyed PHP array into `push(...)` or `unshift(...)` spreads its values, `...array_values(a)`.
 - **DIV-12.6:** index reads are `get(k)` (or `offsetGet(k)`), not `c[k]`.
 - **DIV-12.16:** higher-order messages are `__get(name)` and `__call(method, args)` calls, not magic properties.
@@ -230,6 +230,19 @@ Use `Arr.sortRecursive(input, { options: SORT_NATURAL, descending: true })` to s

 The typed accessors `array`, `boolean`, `float`, `integer` and `string` accept PHP arrays and `ArrayAccess` objects with dot keys. Every supplied argument binds through PHP's weak parameter rules before lookup, including an unused nullable default. Selected values must already have the requested PHP type: selected null raises the upstream `InvalidArgumentException`, while invalid parameters raise PHP's `TypeError`. Integer results are `number | bigint`; float results are `number | PhpFloat` (integral floats carry the runtime marker); class-string tokens returned by `string` normalize to primitive strings. Array results are isolated copies and object values keep their handles.

-`push` and the associated ArrayAccess repair to `set` remain whole and unreleased under `ESC-14.6-8`: a userland offset reference can yield a scalar after initialization, and the runtime has no shared offset-assignment seam for PHP's scalar/string outcomes. The complete pending canonical body, attempted methods and integration regressions are preserved in the Escalation. Existing `set` behavior is unchanged in this increment. No local PHP offset-write substitute is supplied.
+`push` takes the caller's array in a `Ref`, appends one or more values (or none), and returns the innermost array that `set` returns. A null key replaces the entire array after appending:
+
+```ts
+import { Arr } from "@xaravel/collections";
+import { Ref } from "@xaravel/runtime";
+
+const items = new Ref<unknown>({ office: { furniture: ["Desk"] } });
+Arr.push(items, "office.furniture", "Chair", "Lamp"); // { furniture: ["Desk", "Chair", "Lamp"] }
+Arr.array(items.value, "office.furniture"); // ["Desk", "Chair", "Lamp"]
+Arr.integer({}, "missing", "3"); // 3, PHP weak default coercion
+```
+
+For `ArrayAccess` roots, `set` keeps the object's handle. Builtin or inherited `ArrayObject.offsetGet` writes through nested references; overriding or userland `offsetGet` returns a detached array, so nested writes stay local (DIV-9.17 omits PHP's indirect-modification notice only). A root-leaf `push` mutates via `offsetSet` and then throws its declared array-return `TypeError`, because `set` returns the root object. A null-key `push` on an `ArrayAccess` object fails the array selection before mutation.
+

 The complete accessible/arrayable DateTime tests now use `blocked-by:support` under the Maintainer ruling in `decisions/ESC-14.6-2.md`. Carbon-key plucking and `toCssStyles` retain their complete test bodies and throw `BlockedByComponentError("support")` at their Carbon / `Str.finish` dependency seams, for Support (Epic 19) to clear.
diff --git a/packages/collections/src/Arr.ts b/packages/collections/src/Arr.ts
index 67fa7998..cbb2b01a 100644
--- a/packages/collections/src/Arr.ts
+++ b/packages/collections/src/Arr.ts
@@ -1,5 +1,4 @@
 // Laravel's Illuminate\Support\Arr (v13.37.0). Story 14.6 completes the independent array helpers.
-// Push and the ArrayAccess set repair remain held by ESC-14.6-8; typed accessors are complete.
 // CSS styles reach Support through a throwing Str.finish dependency seam.
 // PHP array arguments accept lists, plain maps and PhpArrays, with value-copy isolation (AD-9).
 // By-reference parameters use Ref (DIV-9.2), while ArrayAccess objects retain PHP's handle semantics.
@@ -25,6 +24,7 @@ import {
   array_all,
   array_any,
   arrayAppend,
+  array_push,
   callUnpacked,
   array_pop,
   array_slice,
@@ -62,6 +62,8 @@ import {
   gettype,
   sprintf,
   phpReturn,
+  offsetReference,
+  offsetAssign,
   type PhpFloat,
   is_null,
   is_object,
@@ -865,55 +867,76 @@ export class Arr extends mixin(null, Macroable) {
   }

   /**
-   * Set an array item to a given value using "dot" notation, creating the arrays on the way down; a `null` key replaces
-   * the entire array. `array` is PHP's `&$array` (DIV-9.2): the new array is written to `array.value`. Returns the
-   * innermost array the value was set in.
+   * Set an array item using "dot" notation, creating arrays on the way down; a null key replaces the root.
+   * `array` is PHP's `&$array` (DIV-9.2). Returns the innermost modified array, or the same ArrayAccess handle
+   * for a root-leaf assignment.
    */
   static set(array: Ref<unknown>, key: unknown, value_: unknown): unknown {
+    // PHP binds the by-value argument before key conversion or any userland offset callback.
+    const supplied = valueCopy(value_);
     if (is_null(key)) {
-      array.value = valueCopy(value_);
-
-      return valueCopy(array.value);
+      array.value = supplied;
+      return valueCopy(supplied);
     }

-    const keys = new Ref<unknown>(explode(".", key));
-
-    // PHP's `$array = &$array[$key]`: each array passed on the way down, with the key it is left by. PHP writes into a
-    // `null` as into an empty array.
-    const path: [unknown, unknown][] = [];
-    let current: unknown = valueCopy(array.value ?? []);
-
-    for (const [i, segment] of arrayEntries(keys.value as object)) {
-      if (Number(count(keys.value)) === 1) {
-        break;
-      }
-
-      keys.value = unsetKey(keys.value, i);
-
-      // If the key doesn't exist at this depth, we will just create an empty array
-      // to hold the next value, allowing us to create the arrays to hold final
-      // values at the correct depth. Then we'll keep digging into the array.
-      let child = arrayRead(current as object, segment);
-      if (child === null || !is_array(child)) {
-        child = [];
+    const keys = explode(".", key);
+    const root = new Ref<unknown>(valueCopy(array.value ?? []));
+    let reference = root;
+    const parents: { reference: Ref<unknown>; current: unknown; segment: string }[] = [];
+
+    // Each frame owns its array values. Only runtime offset references decide whether object writes reach storage.
+    for (let depth = 0; depth < keys.length - 1; depth++) {
+      let current = reference.value;
+      const segment = keys[depth]!;
+      if (current instanceof ArrayAccess) {
+        if (!current.offsetExists(segment) || !is_array(current.offsetGet(segment))) {
+          current.offsetSet(segment, []);
+        }
+        reference = offsetReference(current, segment);
+      } else {
+        // Arbitrary offset receivers use the runtime assignment contract before traversal.
+        if (!is_array(current)) {
+          offsetAssign(reference, segment, []);
+          current = reference.value;
+        }
+        const child = arrayRead(current as object, segment);
+        parents.push({ reference, current, segment });
+        reference = new Ref(is_array(child) ? child : []);
       }
-
-      path.push([current, segment]);
-      current = child;
     }

-    let updated = asCallerForm(current, ownPhpArray(current).set(array_shift(keys) as never, valueCopy(value_)));
-    const innermost = updated;
-
-    // Each rebuilt level keeps the form its keys give, and a `PhpArray` stays one.
-    for (let index = path.length - 1; index >= 0; index--) {
-      const [parent, part] = path[index]!;
-      updated = asCallerForm(parent, setKey(parent, part, updated));
+    const current = reference.value;
+    const leaf = keys[keys.length - 1]!;
+    let result: unknown;
+    if (current instanceof ArrayAccess) {
+      current.offsetSet(leaf, supplied);
+      result = current;
+    } else {
+      offsetAssign(reference, leaf, supplied);
+      result = valueCopy(reference.value);
     }
+    for (let index = parents.length - 1; index >= 0; index--) {
+      const parent = parents[index]!;
+      parent.reference.value = asCallerForm(parent.current, ownPhpArray(parent.current ?? []).set(parent.segment, reference.value));
+      reference = parent.reference;
+    }
+    array.value = root.value;
+    return result;
+  }

-    array.value = updated;
-
-    return valueCopy(innermost);
+  /** Append values to a dot-keyed array, writing through the caller's Ref (DIV-9.2). */
+  static push(array: Ref<unknown>, _key: unknown, ...values: unknown[]): unknown {
+    const fn = "Illuminate\\Support\\Arr::push";
+    const args = Array.from(arguments);
+    if (args.length > 0) args[0] = array.value;
+    const boundValues = valueCopy(values);
+    const [, key] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+    ], args);
+    const target = new Ref(this.array(array.value, key, []));
+    array_push(target, ...boundValues);
+    return phpReturn(fn, "array", this.set(array, key, target.value));
   }

   /** Shuffle an array into a reindexed list, copying nested array values. */
diff --git a/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts b/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
index 31f0184a..c71bc104 100644
--- a/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
+++ b/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
@@ -71,6 +71,22 @@ portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray', { ca
   Arr.array(test_array, 'string');
 });

+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPush', { case: SupportArrTest }, async function () {
+  let array = new Ref<unknown>([]); // adapted:DIV-9.2
+  Arr.push(array, 'office.furniture', 'Desk'); // adapted:DIV-9.2
+  this.assertEquals(['Desk'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
+  Arr.push(array, 'office.furniture', 'Chair', 'Lamp'); // adapted:DIV-9.2
+  this.assertEquals(['Desk', 'Chair', 'Lamp'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
+  array = new Ref<unknown>([]); // adapted:DIV-9.2
+  Arr.push(array, null, 'Chris', 'Nuno'); // adapted:DIV-9.2
+  this.assertEquals(['Chris', 'Nuno'], array.value); // adapted:DIV-9.2
+  Arr.push(array, null, 'Taylor'); // adapted:DIV-9.2
+  this.assertEquals(['Chris', 'Nuno', 'Taylor'], array.value); // adapted:DIV-9.2
+  this.expectExceptionObject(new InvalidArgumentException('Array value for key [foo.bar] must be an array, boolean found.'));
+  array = new Ref<unknown>({ foo: { bar: false } }); // adapted:DIV-9.2
+  Arr.push(array, 'foo.bar', 'baz'); // adapted:DIV-9.2
+});
+
 portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testAdd', { case: SupportArrTest }, async function () {
   let array: any = Arr.add({ name: 'Desk' }, 'price', 100);
   this.assertEquals({ name: 'Desk', price: 100 }, array);
diff --git a/packages/collections/tests/xaravel/arr.test.ts b/packages/collections/tests/xaravel/arr.test.ts
index 7335c7eb..7b91e6c8 100644
--- a/packages/collections/tests/xaravel/arr.test.ts
+++ b/packages/collections/tests/xaravel/arr.test.ts
@@ -5,7 +5,7 @@ import { join, resolve } from "node:path";
 import { Assert, xaravelTest } from "@xaravel/assert";
 import { Arr, Collection, LazyCollection } from "@xaravel/collections";
 import { Arrayable, Jsonable } from "@xaravel/contracts/support";
-import { ArgumentCountError, ArrayObject, ArrayIterator, InvalidArgumentException, JsonSerializable, Stringable, float, stdClass, arrayAppend, arrayEntries, Error as PhpError, keyed, PhpArray, Ref, valueCopy, SortDirection, SORT_NATURAL, TypeError as PhpTypeError, UnhandledMatchError } from "@xaravel/runtime";
+import { ArgumentCountError, ArrayAccess, registerClass, ArrayObject, ArrayIterator, InvalidArgumentException, JsonSerializable, Stringable, float, stdClass, arrayAppend, arrayEntries, Error as PhpError, keyed, PhpArray, Ref, valueCopy, SortDirection, SORT_NATURAL, TypeError as PhpTypeError, UnhandledMatchError } from "@xaravel/runtime";

 xaravelTest("XT-collections-12", "FR-23: Arr typed accessors bind PHP arguments before lookup and preserve class-string/scalar representations; dot get/set/has/forget preserve keys, order, nulls and value copies; synchronous callbacks and lazy traversal preserve their contracts", async () => {
   const fails = (invoke: () => unknown, klass: new (...args: any[]) => unknown, message: string | null = null): void => {
@@ -113,6 +113,357 @@ fails(() => Arr.string({ key: null }, "key"), InvalidArgumentException,
     static override get(): unknown { throw new Error("typed accessors must use Arr.get"); }
   }
   Assert.assertSame("ok", ExplicitGetArr.string({ key: "ok" }, "key"));
+  const pushSource = { office: { furniture: ["Desk"] } };
+  const pushRef = new Ref<unknown>(pushSource);
+  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture", "Chair", "Lamp"));
+  Assert.assertSame(["Desk"], pushSource.office.furniture);
+  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture"));
+  const appended = { child: [1], typedHandle };
+  Arr.push(pushRef, "office.furniture", appended);
+  appended.child.push(2);
+  Assert.assertSame([1], Arr.get(pushRef.value, "office.furniture.3.child"));
+  Assert.assertSame(typedHandle, Arr.get(pushRef.value, "office.furniture.3.typedHandle"));
+  const pushSparse = new PhpArray<number, unknown>([[5, "old"]]);
+  pushSparse.delete(5);
+  const sparseRef = new Ref<unknown>(pushSparse);
+  Assert.assertSame(new PhpArray([[6, "new"]]), Arr.push(sparseRef, null, "new"));
+  Assert.assertSame(new PhpArray([[6, "new"]]), sparseRef.value);
+  const beforeFailure = valueCopy(pushRef.value);
+  fails(() => Arr.push(pushRef, []), PhpTypeError);
+  Assert.assertSame(beforeFailure, pushRef.value);
+  const invalidRef = new Ref<unknown>(null);
+  fails(() => Arr.push(invalidRef, "key"), PhpTypeError);
+  Assert.assertNull(invalidRef.value);
+  class ForwardPushArr extends Arr {
+    static calls: unknown[] = [];
+    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
+      this.calls.push(["array", key, defaultValue]);
+      return super.array(array, key, defaultValue);
+    }
+    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
+      this.calls.push(["set", key, value]);
+      return super.set(array, key, value);
+    }
+  }
+  const forwarded = new Ref<unknown>([]);
+  Assert.assertSame({ child: [1] }, ForwardPushArr.push(forwarded, "parent.child", 1));
+  Assert.assertSame([["array", "parent.child", []], ["set", "parent.child", [1]]], ForwardPushArr.calls);
+  const variadicSource = { child: [1] };
+  class CopyBeforeDispatchArr extends Arr {
+    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
+      variadicSource.child.push(2);
+      return super.array(array, key, defaultValue);
+    }
+  }
+  const variadicRef = new Ref<unknown>([]);
+  Assert.assertSame({ values: [{ child: [1] }] }, CopyBeforeDispatchArr.push(variadicRef, "values", variadicSource));
+  Assert.assertSame([1, 2], variadicSource.child);
+  const pushReturned = Arr.push(pushRef, "office.furniture") as { furniture: unknown[] };
+  pushReturned.furniture.push("return-only");
+  Assert.assertSame(4, (Arr.array(pushRef.value, "office.furniture") as unknown[]).length);
+  Arr.push(pushRef, "office.furniture", "caller-only");
+  Assert.assertSame("return-only", pushReturned.furniture.at(-1));
+  for (const args of [[], [new Ref([])]]) {
+    fails(() => (Arr.push as (...args: unknown[]) => unknown)(...args), ArgumentCountError,
+      "Too few arguments to function Illuminate\\Support\\Arr::push(), " + args.length + " passed and exactly 2 expected");
+  }
+  class InvalidPushLookup extends ArrayObject {
+    reads: unknown[] = [];
+    override offsetExists(key: Parameters<ArrayObject["offsetExists"]>[0]): boolean {
+      this.reads.push(key);
+      return super.offsetExists(key);
+    }
+  }
+  const invalidPushLookup = new InvalidPushLookup({ key: [] });
+  const invalidPushLookupRef = new Ref<unknown>(invalidPushLookup);
+  fails(() => Arr.push(invalidPushLookupRef, []), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Argument #2 ($key) must be of type string|int|null, array given");
+  Assert.assertSame([], invalidPushLookup.reads);
+  Assert.assertTrue(invalidPushLookupRef.value === invalidPushLookup);
+  Assert.assertSame({ key: [] }, invalidPushLookup.getArrayCopy());
+
+
+  // PHP 8.5.11 integration outcomes from ESC-14.6-7; DIV-9.17 omits only the notice.
+  class InheritedOffsetGet extends ArrayObject {}
+  class UserlandOffsetGet extends ArrayObject {
+    override offsetGet(key: Parameters<ArrayObject["offsetGet"]>[0]): unknown { return super.offsetGet(key); }
+  }
+  class UserlandAccess implements ArrayAccess {
+    get [ArrayAccess.brand](): true { return true; }
+    stored: unknown = { x: [] };
+    writes: [unknown, unknown][] = [];
+    offsetExists(key: unknown): boolean { return Arr.has(this.stored, key); }
+    offsetGet(key: unknown): unknown { return Arr.get(this.stored, key); }
+    offsetSet(key: unknown, value: unknown): void {
+      this.writes.push([key, valueCopy(value)]);
+      const ref = new Ref(this.stored);
+      Arr.set(ref, key, value);
+      this.stored = ref.value;
+    }
+    offsetUnset(key: unknown): void {
+      const ref = new Ref(this.stored);
+      Arr.forget(ref, key);
+      this.stored = ref.value;
+    }
+  }
+  for (const object of [new ArrayObject({ x: [] }), new InheritedOffsetGet({ x: [] })]) {
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: { y: [1] } }, object.getArrayCopy());
+    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deeper.leaf", [2]));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: { y: [1], deeper: { leaf: [2] } } }, object.getArrayCopy());
+    const supplied = { child: [1], typedHandle };
+    Assert.assertTrue(Arr.set(ref, "leaf", supplied) === object);
+    supplied.child.push(2);
+    Assert.assertSame([1], Arr.get(object, "leaf.child"));
+    Assert.assertTrue(Arr.get(object, "leaf.typedHandle") === typedHandle);
+    for (const child of [null, false, 12, "scalar", new stdClass()]) {
+      object.offsetSet("replace", child);
+      Assert.assertSame({ value: [3] }, Arr.set(ref, "replace.value", [3]));
+      Assert.assertSame({ value: [3] }, object.offsetGet("replace"));
+    }
+    Assert.assertSame({ value: [4] }, Arr.set(ref, "missing.value", [4]));
+    Assert.assertSame({ value: [4] }, object.offsetGet("missing"));
+  }
+  for (const object of [new UserlandOffsetGet({ x: [] }), new UserlandAccess()]) {
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deep.leaf", [2]));
+    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+    if (object instanceof UserlandAccess) Assert.assertSame([], object.writes);
+    // Initialization is an explicit offsetSet even when subsequent reference writes are detached.
+    Assert.assertSame({ value: [3] }, Arr.set(ref, "missing.value", [3]));
+    Assert.assertSame([], object.offsetGet("missing"));
+    if (object instanceof UserlandAccess) Assert.assertSame([["missing", []]], object.writes);
+    Assert.assertTrue(Arr.set(ref, "leaf", [4]) === object);
+    Assert.assertSame([4], object.offsetGet("leaf"));
+  }
+  class OrderedAccess extends UserlandAccess {
+    calls: unknown[][] = [];
+    throwOnGet = false;
+    override offsetExists(key: unknown): boolean {
+      this.calls.push(["exists", key]);
+      return super.offsetExists(key);
+    }
+    override offsetGet(key: unknown): unknown {
+      this.calls.push(["get", key]);
+      if (this.throwOnGet) throw new PhpError("offset read failed");
+      return super.offsetGet(key);
+    }
+    override offsetSet(key: unknown, value: unknown): void {
+      this.calls.push(["set", key, valueCopy(value)]);
+      super.offsetSet(key, value);
+    }
+  }
+  for (const [stored, calls, final] of [
+    [{ x: [] }, [["exists", "x"], ["get", "x"], ["get", "x"]], { x: [] }],
+    [[], [["exists", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
+    [{ x: 12 }, [["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
+  ] as const) {
+    const object = new OrderedAccess();
+    object.stored = stored;
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ leaf: [1] }, Arr.set(ref, "x.leaf", [1]));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame(calls, object.calls);
+    Assert.assertSame(final, object.stored);
+  }
+  const throwingAccess = new OrderedAccess();
+  throwingAccess.stored = [];
+  throwingAccess.throwOnGet = true;
+  const throwingRef = new Ref<unknown>(throwingAccess);
+  fails(() => Arr.set(throwingRef, "missing.leaf", 1), PhpError, "offset read failed");
+  Assert.assertTrue(throwingRef.value === throwingAccess);
+  Assert.assertSame({ missing: [] }, throwingAccess.stored);
+  Assert.assertSame([["exists", "missing"], ["set", "missing", []], ["get", "missing"]], throwingAccess.calls);
+  // A userland offsetGet can return a non-array after the explicit initialization; that replacement stays detached.
+  class NonArrayOffset extends OrderedAccess {
+    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return null; }
+  }
+  const nonArrayOffset = new NonArrayOffset();
+  nonArrayOffset.stored = { x: 12 };
+  Assert.assertSame({ leaf: 1 }, Arr.set(new Ref(nonArrayOffset), "x.leaf", 1));
+  Assert.assertSame({ x: [] }, nonArrayOffset.stored);
+  Assert.assertSame([["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], nonArrayOffset.calls);
+
+  const entryValue = { child: [1], typedHandle };
+  class MutatingOffsetExists extends UserlandAccess {
+    override offsetExists(key: unknown): boolean {
+      entryValue.child.push(2);
+      return super.offsetExists(key);
+    }
+  }
+  const mutatingAccess = new MutatingOffsetExists();
+  const entryResult = Arr.set(new Ref(mutatingAccess), "x.leaf", entryValue) as { leaf: typeof entryValue };
+  Assert.assertSame([1, 2], entryValue.child);
+  Assert.assertSame([1], entryResult.leaf.child);
+  Assert.assertTrue(entryResult.leaf.typedHandle === typedHandle);
+  Assert.assertSame({ x: [] }, mutatingAccess.stored);
+
+  registerClass("ArrOverridingOffsetFixture", UserlandOffsetGet);
+  registerClass("ArrIndependentOffsetFixture", UserlandAccess);
+  for (const [object, name] of [
+    [new UserlandOffsetGet({ x: [] }), "ArrOverridingOffsetFixture"],
+    [new UserlandAccess(), "ArrIndependentOffsetFixture"],
+  ] as const) {
+    const ref = new Ref<unknown>(object);
+    fails(() => Arr.push(ref, "x", 1), PhpTypeError,
+      "Illuminate\\Support\\Arr::push(): Return value must be of type array, " + name + " returned");
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: [1] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+  }
+  class InvalidSetReturnArr extends Arr {
+    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
+      super.set(array, key, value);
+      return 42;
+    }
+  }
+  const invalidSetReturnRef = new Ref<unknown>({ x: [] });
+  fails(() => InvalidSetReturnArr.push(invalidSetReturnRef, "x", 1), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Return value must be of type array, int returned");
+  Assert.assertSame({ x: [1] }, invalidSetReturnRef.value);
+
+  const deepRef = new Ref<unknown>([]);
+  Assert.assertSame({ leaf: 1 }, Arr.set(deepRef, [...Array<string>(49_999).fill("child"), "leaf"].join("."), 1));
+  let deepCurrent = deepRef.value;
+  for (let depth = 0; depth < 49_999; depth++) {
+    Assert.assertTrue(deepCurrent !== null && typeof deepCurrent === "object");
+    deepCurrent = (deepCurrent as { child: unknown }).child;
+  }
+  Assert.assertSame({ leaf: 1 }, deepCurrent);
+
+  const leafObject = new ArrayObject({ x: [] });
+  const leafRef = new Ref<unknown>(leafObject);
+  fails(() => Arr.push(leafRef, "x", 1), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Return value must be of type array, ArrayObject returned");
+  Assert.assertTrue(leafRef.value === leafObject);
+  Assert.assertSame({ x: [1] }, leafObject.getArrayCopy());
+  const nullObject = new ArrayObject({ x: [] });
+  const nullObjectRef = new Ref<unknown>(nullObject);
+  fails(() => Arr.push(nullObjectRef, null, 1), InvalidArgumentException,
+    "Array value for key [] must be an array, object found.");
+  Assert.assertTrue(nullObjectRef.value === nullObject);
+  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
+  const nullArrayRef = new Ref<unknown>({ x: [] });
+  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), Arr.push(nullArrayRef, null, 1));
+  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), nullArrayRef.value);
+  const replaceObjectRef = new Ref<unknown>(nullObject);
+  const replacementRoot = { replacement: [1] };
+  Assert.assertSame(replacementRoot, Arr.set(replaceObjectRef, null, replacementRoot));
+  replacementRoot.replacement.push(2);
+  Assert.assertSame({ replacement: [1] }, replaceObjectRef.value);
+  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
+  const nestedSparseRef = new Ref<unknown>({ parent: { sparse: pushSparse } });
+  Assert.assertSame({ sparse: new PhpArray([[6, "next"]]) }, Arr.push(nestedSparseRef, "parent.sparse", "next"));
+  Assert.assertSame([[6, "next"]], arrayEntries(Arr.get(nestedSparseRef.value, "parent.sparse") as object));
+  Assert.assertSame([], arrayEntries(pushSparse));
+  // Released ESC-14.6-8 assignment and argument-order regressions.
+  const keySnapshot = { child: [1], typedHandle };
+  class SetSnapshotKey {
+    toString(): string { keySnapshot.child.push(2); return "leaf"; }
+  }
+  const snapshotRef = new Ref<unknown>([]);
+  Arr.set(snapshotRef, new SetSnapshotKey(), keySnapshot);
+  Assert.assertSame([1, 2], keySnapshot.child);
+  Assert.assertSame([1], Arr.get(snapshotRef.value, "leaf.child"));
+  Assert.assertTrue(Arr.get(snapshotRef.value, "leaf.typedHandle") === typedHandle);
+
+  const keyPushRef = new Ref<unknown>({ x: [1] });
+  const keyPushValue = { child: [1] };
+  class PushMutationKey {
+    toString(): string {
+      const current = Arr.array(keyPushRef.value, "x") as number[];
+      current.push(2);
+      Arr.set(keyPushRef, "x", current);
+      keyPushValue.child.push(2);
+      return "x";
+    }
+  }
+  Assert.assertSame({ x: [1, 2, { child: [1] }] }, Arr.push(keyPushRef, new PushMutationKey(), keyPushValue));
+  Assert.assertSame({ x: [1, 2, { child: [1] }] }, keyPushRef.value);
+  Assert.assertSame([1, 2], keyPushValue.child);
+
+  class IgnoredInitialization extends OrderedAccess {
+    returned: unknown = 12;
+    override offsetExists(key: unknown): boolean { this.calls.push(["exists", key]); return false; }
+    override offsetSet(key: unknown, value: unknown): void { this.calls.push(["set", key, valueCopy(value)]); }
+    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return valueCopy(this.returned); }
+  }
+  for (const path of ["x.y", "x.y.z"]) {
+    const object = new IgnoredInitialization();
+    const ref = new Ref<unknown>(object);
+    fails(() => Arr.set(ref, path, 1), PhpError, "Cannot use a scalar value as an array");
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: [] }, object.stored);
+    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
+  }
+  for (const returned of [null, false]) {
+    const object = new IgnoredInitialization();
+    object.returned = returned;
+    Assert.assertSame({ z: 1 }, Arr.set(new Ref(object), "x.y.z", 1));
+    Assert.assertSame({ x: [] }, object.stored);
+  }
+  const stringOffset = new IgnoredInitialization();
+  stringOffset.returned = "abc";
+  fails(() => Arr.set(new Ref(stringOffset), "x.y", 1), PhpTypeError,
+    "Cannot access offset of type string on string");
+  Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], stringOffset.calls);
+
+  class ChangingReads extends OrderedAccess {
+    reads = 0;
+    override offsetGet(key: unknown): unknown {
+      this.calls.push(["get", key]);
+      return this.reads++ === 0 ? [] : 12;
+    }
+  }
+  const changingReads = new ChangingReads();
+  fails(() => Arr.set(new Ref(changingReads), "x.y", 1), PhpError, "Cannot use a scalar value as an array");
+  Assert.assertSame([["exists", "x"], ["get", "x"], ["get", "x"]], changingReads.calls);
+  Assert.assertSame({ x: [] }, changingReads.stored);
+
+  class ThrowingSet extends OrderedAccess {
+    override offsetSet(key: unknown, value: unknown): void {
+      super.offsetSet(key, value);
+      throw new PhpError("offset write failed");
+    }
+  }
+  const throwingSet = new ThrowingSet();
+  throwingSet.stored = [];
+  const throwingSetRef = new Ref<unknown>(throwingSet);
+  fails(() => Arr.set(throwingSetRef, "x.y", 1), PhpError, "offset write failed");
+  Assert.assertTrue(throwingSetRef.value === throwingSet);
+  Assert.assertSame({ x: [] }, throwingSet.stored);
+  Assert.assertSame([["exists", "x"], ["set", "x", []]], throwingSet.calls);
+
+  class BuiltinReadOverrides extends ArrayObject {
+    calls: unknown[][] = [];
+    override offsetExists(key: Parameters<ArrayObject["offsetExists"]>[0]): boolean {
+      this.calls.push(["exists", key]); return false;
+    }
+    override offsetSet(key: Parameters<ArrayObject["offsetSet"]>[0], value: unknown): void {
+      this.calls.push(["set", key, valueCopy(value)]); super.offsetSet(key, value);
+    }
+  }
+  const builtinReadOverrides = new BuiltinReadOverrides({ x: [99] });
+  Assert.assertSame({ y: 1 }, Arr.set(new Ref(builtinReadOverrides), "x.y", 1));
+  Assert.assertSame({ x: { y: 1 } }, builtinReadOverrides.getArrayCopy());
+  Assert.assertSame([["exists", "x"], ["set", "x", []]], builtinReadOverrides.calls);
+
+  class InvalidArrayReturnArr extends Arr {
+    static writes = 0;
+    static override array(): unknown { return 12; }
+    static override set(): unknown { this.writes++; return []; }
+  }
+  const invalidArrayReturnRef = new Ref<unknown>({ x: [] });
+  fails(() => InvalidArrayReturnArr.push(invalidArrayReturnRef, "x", 1), PhpTypeError,
+    "array_push(): Argument #1 ($array) must be of type array, int given");
+  Assert.assertSame(0, InvalidArrayReturnArr.writes);
+  Assert.assertSame({ x: [] }, invalidArrayReturnRef.value);
+
   const recursive = new PhpArray<string | number, unknown>([
     ["z", new PhpArray<string, unknown>([["b", [10, 2, 1]], ["a", { value: [3, 1, 2] }]])],
     [4, ["item10", "item2", "item1"]],

```
