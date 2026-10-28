---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
trigger: contract
proposed: >-
  Provide one public runtime contract for scoped PHP offset-reference lifetimes, including rebinding, normal and exceptional cleanup, so temporary traversal references stop sharing after the function returns while genuine surviving caller aliases remain shared. Cover all three array forms, returned and selected arrays and builtin/inherited ArrayObject storage together before releasing Arr.push and its whole Arr.set repair. Do not strip or reconstruct runtime reference cells in collections.
evidence: >-
  The referenceAt-based Arr.set attempt passes every existing test but leaves intermediate reference cells permanently shared by valueCopy. After set(a, x.y, 2), copying a and setting the copy to 3 changes both Bun arrays to 3; pinned PHP 8.5.11 keeps the original at 2. Repeated nested push through Arr.array copies similarly changes both arrays, while PHP preserves the original. Public Ref/referenceAt/offsetReference have no release/lifetime seam. Five completed typed accessors and baseline set remain released; push and its associated repair are held whole.
---

# ESC-14.6-10: temporary offset references outlive Arr traversal

`referenceAt` resolves ESC-14.6-9's receiver matrix and errors. Its captured array cells nevertheless survive local reference rebinding and function exit. PHP no longer treats a slot as a shared reference after only its owning array remains; this matters when the array is subsequently copied. Runtime `valueCopy` intentionally preserves recorded reference cells, and `arrayReferenceCells` tracks neither active Ref ownership nor release. `Ref`, `referenceAt` and `offsetReference` expose no public release/dispose operation. A Collections-owned cell registry, stripping pass or reconstructed parent chain would duplicate runtime PHP reference semantics and could destroy genuine aliases, contrary to PORTING.md and AD-9/22.

This is a contract stop before review, discovered by the parent's additional public copy-isolation probe. No Fidelity waiver or new divergence is requested. The stop affects the complete pending testPush and its associated set repair, not the five completed independent accessors or the four legitimate Support holds. Existing baseline assertions are preserved unchanged.

## Complete affected matrix and preservation contract

The same leak was reproduced for native lists, plain maps and PhpArrays; a selected subarray returned by Arr.array; a root array returned by direct Arr.set; a parent array returned by Arr.push; repeated nested push after copying; and builtin/inherited ArrayObject.getArrayCopy after a deeper traversal. Bun Collection.all also exposes the same poisoned cells (the PHP probe below compares native array copying, not a separate Collection invocation). This is the reference-lifetime category across these containers, not another missing scalar receiver. The full arbitrary receiver/error matrix released by ESC-14.6-9 remains required and must not regress.

The runtime resolution must cover rebinding the local reference at each traversal step, cleanup on normal return and on exceptions, and retained explicit initialization writes before exceptions. It must preserve genuine surviving caller-held aliases, including shared cells copied while an explicit reference lives; never globally disable reference-cell preservation in valueCopy. Builtin and inherited ArrayObject storage must regain value-copy isolation once temporary aliases expire, while overriding/userland detached offsetGet keeps its existing no-writeback result (DIV-9.17 omits only its notice). Keep sparse next-free state, handle identity, argument snapshot/call ordering, exact errors and 50,000-segment iterative construction. The runtime owns the lifetime protocol and its use through the public reference helpers; Collections may consume it only after it is released.

## Pinned PHP 8.5.11 reproduction

Run from the repository root; these are actual observed results, not recalled expectations. The userland-detached case emits only the intentionally omitted indirect-modification notice.

```php
<?php
require 'conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/Arr.php';
use Illuminate\Support\Arr;
function row($name,...$values){echo $name,' ',json_encode($values),"\n";}
echo PHP_VERSION,"\n";
foreach([['map',['x'=>['y'=>1]],'x.y'],['list',[[1]],'0.0'],['php',['x'=>['y'=>1]],'x.y']] as [$name,$a,$key]){Arr::set($a,$key,2);$b=$a;Arr::set($b,$key,3);row($name,$a,$b);}
$a=['x'=>['y'=>['z'=>1]]];Arr::set($a,'x.y.z',2);$selected=Arr::array($a,'x');Arr::set($selected,'y.z',3);row('selected',$a,$selected);
$r=Arr::set($a,'leaf',1);Arr::set($r,'x.y.z',4);row('returned-root',$a,$r);
class Inherited extends ArrayObject {}
foreach([['builtin',new ArrayObject(['x'=>['y'=>['z'=>1]]])],['inherited',new Inherited(['x'=>['y'=>['z'=>1]]])]] as [$name,$object]){Arr::set($object,'x.y.z',2);$b=$object->getArrayCopy();Arr::set($b,'x.y.z',3);row($name,$object->getArrayCopy(),$b);}
$a=['x'=>['values'=>[]]];Arr::push($a,'x.values',1);$b=Arr::array($a,null);Arr::push($b,'x.values',2);row('repeated-push',$a,$b);
$a=['x'=>['y'=>['z'=>1],'values'=>[]]];Arr::set($a,'x.y.z',2);$r=Arr::push($a,'x.values',1);Arr::set($r,'y.z',3);row('returned-parent',$a,$r);
$a=['x'=>['y'=>1]];$held=&$a['x'];$b=$a;$held['y']=2;row('held-reference',$a,$b);
class Userland extends ArrayObject {function offsetGet($key):mixed {return parent::offsetGet($key);}}
$a=new Userland(['x'=>['y'=>['z'=>1]]]);Arr::set($a,'x.y.z',2);$b=$a->getArrayCopy();Arr::set($b,'x.y.z',3);row('userland-detached',$a->getArrayCopy(),$b);
```

Observed PHP stdout:

```text
8.5.11
map [{"x":{"y":2}},{"x":{"y":3}}]
list [[[2]],[[3]]]
php [{"x":{"y":2}},{"x":{"y":3}}]
selected [{"x":{"y":{"z":2}}},{"y":{"z":3}}]
returned-root [{"x":{"y":{"z":2}},"leaf":1},{"x":{"y":{"z":4}},"leaf":1}]
builtin [{"x":{"y":{"z":2}}},{"x":{"y":{"z":3}}}]
inherited [{"x":{"y":{"z":2}}},{"x":{"y":{"z":3}}}]
repeated-push [{"x":{"values":[1]}},{"x":{"values":[1,2]}}]
returned-parent [{"x":{"y":{"z":2},"values":[1]}},{"y":{"z":3},"values":[1]}]
held-reference [{"x":{"y":2}},{"x":{"y":2}}]
userland-detached [{"x":{"y":{"z":1}}},{"x":{"y":{"z":3}}}]
```

## Attempted Bun reproduction

Run this module from the repository root with Bun (imports below are root-relative). It exercises the pending whole implementation preserved at the end of this record.

```ts
import { Arr } from './packages/collections/src/Arr.ts';
import { Ref, PhpArray, ArrayObject, valueCopy, jsonEncode } from './packages/runtime/src/index.ts';
function row(name: string, ...values: unknown[]) { console.log(name, jsonEncode(values)); }
for (const [name, initial, key] of [
 ['map', {x:{y:1}}, 'x.y'],
 ['list', [[1]], '0.0'],
 ['php', new PhpArray([['x',new PhpArray([['y',1]])]]),'x.y'],
] as const) {
 const a=new Ref<unknown>(initial); Arr.set(a,key,2);
 const b=new Ref(valueCopy(a.value)); Arr.set(b,key,3); row(name,a.value,b.value);
}
const a=new Ref<unknown>({x:{y:{z:1}}}); Arr.set(a,'x.y.z',2);
const selected=new Ref(Arr.array(a.value,'x')); Arr.set(selected,'y.z',3); row('selected',a.value,selected.value);
const r=new Ref(Arr.set(a,'leaf',1)); Arr.set(r,'x.y.z',4); row('returned-root',a.value,r.value);
for (const [name,object] of [['builtin',new ArrayObject({x:{y:{z:1}}})],['inherited',new (class extends ArrayObject {})({x:{y:{z:1}}})]] as const) {
 Arr.set(new Ref(object),'x.y.z',2); const b=new Ref(object.getArrayCopy());Arr.set(b,'x.y.z',3);row(name,object.getArrayCopy(),b.value);
}
const { Collection } = await import('./packages/collections/src/Collection.ts');
const { referenceAt, offsetAssign } = await import('./packages/runtime/src/index.ts');
const collRoot = new Ref<unknown>({x:{y:1}}); Arr.set(collRoot,'x.y',2);
const collCopy = new Ref(new Collection(collRoot.value).all()); Arr.set(collCopy,'x.y',3);row('Collection.all',collRoot.value,collCopy.value);
const pushRoot = new Ref<unknown>({x:{values:[]}});Arr.push(pushRoot,'x.values',1);
const pushCopy = new Ref(Arr.array(pushRoot.value,null));Arr.push(pushCopy,'x.values',2);row('repeated-push',pushRoot.value,pushCopy.value);
const parentRoot=new Ref<unknown>({x:{y:{z:1},values:[]}});Arr.set(parentRoot,'x.y.z',2);
const parentReturned=new Ref(Arr.push(parentRoot,'x.values',1));Arr.set(parentReturned,'y.z',3);row('returned-parent',parentRoot.value,parentReturned.value);
const heldRoot=new Ref<unknown>({x:{y:1}});const held=referenceAt(heldRoot,'x');
const heldCopy=new Ref(valueCopy(heldRoot.value));offsetAssign(held,'y',2);row('held-reference',heldRoot.value,heldCopy.value);
class Userland extends ArrayObject { override offsetGet(key: Parameters<ArrayObject['offsetGet']>[0]): unknown{return super.offsetGet(key);} }
const detached=new Userland({x:{y:{z:1}}});Arr.set(new Ref(detached),'x.y.z',2);
const detachedCopy=new Ref(detached.getArrayCopy());Arr.set(detachedCopy,'x.y.z',3);row('userland-detached',detached.getArrayCopy(),detachedCopy.value);
```

Observed attempted Bun stdout:

```text
map [{"x":{"y":3}},{"x":{"y":3}}]
list [[[3]],[[3]]]
php [{"x":{"y":3}},{"x":{"y":3}}]
selected [{"x":{"y":{"z":3}}},{"y":{"z":3}}]
returned-root [{"x":{"y":{"z":4}},"leaf":1},{"x":{"y":{"z":4}},"leaf":1}]
builtin [{"x":{"y":{"z":3}}},{"x":{"y":{"z":3}}}]
inherited [{"x":{"y":{"z":3}}},{"x":{"y":{"z":3}}}]
Collection.all [{"x":{"y":3}},{"x":{"y":3}}]
repeated-push [{"x":{"values":[1,2]}},{"x":{"values":[1,2]}}]
returned-parent [{"x":{"y":{"z":3},"values":[1]}},{"y":{"z":3},"values":[1]}]
held-reference [{"x":{"y":2}},{"x":{"y":2}}]
userland-detached [{"x":{"y":{"z":1}}},{"x":{"y":{"z":3}}}]
```

The explicit `held-reference` case remains shared on both engines and must continue to do so. The userland-detached case also agrees. All preceding array-copy cases disagree: PHP's original keeps 2 (or [1] for repeated-push), while Bun's original changes to the copy's value. Resumption must add executable regressions for all these outcomes, not merely re-run the previously passing suite.

## Verification and preservation

Before this probe, the complete attempt passed typecheck, lint/disables (939 files), all 87 Story comparisons, 1,029 Collections comparisons and all 12 Collections Xaravel tests. The foreground full harness passed: 484 Xaravel tests, 479 passed, 5 skipped; 21,817 comparisons, zero differences; 7 unavailable backend Variants NOT-RUN. Expectations, Escalations (before this new record), Divergence and whitespace checks passed. These are attempted-tree results, not a completion claim: the new public copy probe exposed behavior those tests did not cover.

The executable increment restores every package file to its starting main version, including baseline set, all five complete typed accessors and prior assertions. testPush remains not-ported-yet linked to this Escalation. No partial push/reference fix or runtime edit is released. The entire pending implementation, complete canonical testPush, all positive regressions and receiver-matrix cases are preserved below; re-derive using the released lifetime contract rather than applying blindly. Historical reviews in the Story spec remain immutable; fresh reviews are required after resolution.

Final held-tree checks also pass: typecheck, lint/disables, Expectations, Escalations (139 records / 138 decisions), Divergence and staged whitespace. A sandbox full run encountered infrastructure timeouts; the identical foreground full harness outside the sandbox passed all 21,817 comparisons with 479 Xaravel passes and five skips. Final Story harness has zero differences over 87 comparisons. story:check correctly refuses done because testPush is held, this Escalation is open and current approvals are absent (remote evidence also requires GH_TOKEN). All executable package files remain identical to starting main.

## Complete pending attempt (documentary, not executable)

```diff
diff --git a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
index f6363d57..52c540af 100644
--- a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
+++ b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
@@ -55,7 +55,7 @@
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrepend","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrependKeysWith","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPull","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-9"}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testQuery","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandom","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandomNotIncrementingKeys","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
diff --git a/packages/collections/docs/collections.md b/packages/collections/docs/collections.md
index 4287dc82..770f18ae 100644
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
+`push` takes the caller's array in a `Ref`, appends one or more values (or none), and returns the innermost array that `set` returns. `set` itself returns the innermost modified value, including a string receiver, or the object handle for a direct root-leaf assignment. A null key replaces the entire array after appending:
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
index 67fa7998..8109e9a1 100644
--- a/packages/collections/src/Arr.ts
+++ b/packages/collections/src/Arr.ts
@@ -1,5 +1,4 @@
 // Laravel's Illuminate\Support\Arr (v13.37.0). Story 14.6 completes the independent array helpers.
-// Push and the ArrayAccess set repair remain held by ESC-14.6-8; typed accessors are complete.
 // CSS styles reach Support through a throwing Str.finish dependency seam.
 // PHP array arguments accept lists, plain maps and PhpArrays, with value-copy isolation (AD-9).
 // By-reference parameters use Ref (DIV-9.2), while ArrayAccess objects retain PHP's handle semantics.
@@ -25,6 +24,9 @@ import {
   array_all,
   array_any,
   arrayAppend,
+  array_push,
+  offsetAssign,
+  referenceAt,
   callUnpacked,
   array_pop,
   array_slice,
@@ -865,55 +867,47 @@ export class Arr extends mixin(null, Macroable) {
   }

   /**
-   * Set an array item to a given value using "dot" notation, creating the arrays on the way down; a `null` key replaces
-   * the entire array. `array` is PHP's `&$array` (DIV-9.2): the new array is written to `array.value`. Returns the
-   * innermost array the value was set in.
+   * Set a dot-keyed item through a Ref (DIV-9.2), or replace the root for a null key.
+   * Returns the innermost modified value; a root-leaf ArrayAccess assignment returns its object handle.
    */
   static set(array: Ref<unknown>, key: unknown, value_: unknown): unknown {
+    const supplied = valueCopy(value_);
     if (is_null(key)) {
-      array.value = valueCopy(value_);
-
-      return valueCopy(array.value);
+      array.value = supplied;
+      return valueCopy(supplied);
     }
-
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
+    const keys = explode(".", key);
+    // Separate the caller's array before acquiring runtime-owned references; object handles remain shared.
+    array.value = valueCopy(array.value);
+    let reference = array;
+    for (let depth = 0; depth < keys.length - 1; depth++) {
+      const segment = keys[depth]!;
+      const current = reference.value;
+      // Scalar/string receivers cannot contain an array child. Runtime assignment and reference acquisition
+      // below own their promotion and error rules, including writes retained before an exception.
+      const present = is_array(current) || current instanceof ArrayAccess;
+      if (!present || !offsetIsSet(current as object, segment) || !is_array(offsetRead(current as object, segment))) {
+        offsetAssign(reference, segment, []);
       }
-
-      keys.value = unsetKey(keys.value, i);
-
-      // If the key doesn't exist at this depth, we will just create an empty array
-      // to hold the next value, allowing us to create the arrays to hold final
-      // values at the correct depth. Then we'll keep digging into the array.
-      let child = arrayRead(current as object, segment);
-      if (child === null || !is_array(child)) {
-        child = [];
-      }
-
-      path.push([current, segment]);
-      current = child;
+      reference = referenceAt(reference, segment);
     }
+    offsetAssign(reference, keys[keys.length - 1]!, supplied);
+    return valueCopy(reference.value);
+  }

-    let updated = asCallerForm(current, ownPhpArray(current).set(array_shift(keys) as never, valueCopy(value_)));
-    const innermost = updated;
-
-    // Each rebuilt level keeps the form its keys give, and a `PhpArray` stays one.
-    for (let index = path.length - 1; index >= 0; index--) {
-      const [parent, part] = path[index]!;
-      updated = asCallerForm(parent, setKey(parent, part, updated));
-    }
-
-    array.value = updated;
-
-    return valueCopy(innermost);
+  /** Append values through the caller's Ref; declared array return validation follows mutation. */
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
index 7335c7eb..b844eea4 100644
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
@@ -113,6 +113,405 @@ fails(() => Arr.string({ key: null }, "key"), InvalidArgumentException,
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
+  // Pinned PHP 8.5.11 ESC-14.6-9 cases: the write precedes forbidden string reference acquisition.
+  for (const path of ["x.0.z", "x.1.z", "x.y.z", "x.0"]) {
+    const object = new IgnoredInitialization();
+    object.returned = "abc";
+    const root = new Ref<unknown>(object);
+    if (path === "x.0") Assert.assertSame("1bc", Arr.set(root, path, 1));
+    else if (path === "x.y.z") fails(() => Arr.set(root, path, 1), PhpTypeError,
+      "Cannot access offset of type string on string");
+    else fails(() => Arr.set(root, path, 1), PhpError,
+      "Cannot create references to/from string offsets");
+    Assert.assertTrue(root.value === object);
+    Assert.assertSame({ x: [] }, object.stored);
+    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
+  }
+  // Exercise the arbitrary receiver matrix through Arr rather than calling runtime helpers directly.
+  for (const initial of [null, false, [], {}, new PhpArray()]) {
+    for (const path of ["leaf", "child.leaf"]) {
+      const root = new Ref<unknown>(valueCopy(initial));
+      Assert.assertSame({ leaf: 1 }, Arr.set(root, path, 1));
+      Assert.assertSame(path === "leaf" ? { leaf: 1 } : { child: { leaf: 1 } }, root.value);
+    }
+  }
+  for (const initial of [true, 12, float(1.5)]) {
+    for (const path of ["leaf", "child.leaf"]) {
+      const root = new Ref<unknown>(initial);
+      fails(() => Arr.set(root, path, 1), PhpError, "Cannot use a scalar value as an array");
+      Assert.assertSame(initial, root.value);
+    }
+    const object = new IgnoredInitialization();
+    object.returned = initial;
+    fails(() => Arr.set(new Ref(object), "x.y.z", 1), PhpError, "Cannot use a scalar value as an array");
+    Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], object.calls);
+  }
+  for (const path of ["0", "1", "0.z", "1.z", "y", "y.z"]) {
+    const root = new Ref<unknown>("abc");
+    if (path === "0" || path === "1") {
+      const expected = path === "0" ? "1bc" : "a1c";
+      Assert.assertSame(expected, Arr.set(root, path, 1));
+      Assert.assertSame(expected, root.value);
+    } else if (path.startsWith("y")) {
+      fails(() => Arr.set(root, path, 1), PhpTypeError, "Cannot access offset of type string on string");
+      Assert.assertSame("abc", root.value);
+    } else {
+      fails(() => Arr.set(root, path, 1), PhpError, "Cannot create references to/from string offsets");
+      Assert.assertSame(path === "0.z" ? "Abc" : "aAc", root.value);
+    }
+  }
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
