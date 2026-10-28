---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
trigger: contract
proposed: >-
  Publish a public runtime seam reproducing PHP ArrayAccess offset references, including builtin ArrayObject and subclass behavior, before implementing Arr.push. No partial offset reference emulation in collections.
evidence: >-
  The existing Arr.set rebuilds an ArrayAccess root as a PHP array rather than retaining its handle. PHP root-leaf ArrayObject push mutates the object then throws return TypeError; nested x.y push mutates the ArrayObject and returns the innermost array. Public offsetGet exposes a value without offset-reference metadata; no shared public offset-reference seam supplies PHP builtin/subclass reference behavior. Hold push whole and its Test ID not-ported-yet.
---

# ESC-14.6-7: ArrayAccess offset reference writeback

The existing Arr.set rebuilds an ArrayAccess root as a PHP array rather than retaining its handle. PHP root-leaf ArrayObject push mutates the object then throws return TypeError; nested x.y push mutates the ArrayObject and returns the innermost array. Public offsetGet exposes a value without offset-reference metadata; no shared public offset-reference seam supplies PHP builtin/subclass reference behavior. Hold push whole and its Test ID not-ported-yet.

Exact pinned Upstream bodies remain in ESC-14.6-3 (string) and ESC-14.6-1 (push); those historical records are unchanged.

## Complete pending translation

```ts

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPush', { case: SupportArrTest }, async function () {
  let array = new Ref<unknown>([]); // adapted:DIV-9.2
  Arr.push(array, 'office.furniture', 'Desk'); // adapted:DIV-9.2
  this.assertEquals(['Desk'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
  Arr.push(array, 'office.furniture', 'Chair', 'Lamp'); // adapted:DIV-9.2
  this.assertEquals(['Desk', 'Chair', 'Lamp'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
  array = new Ref<unknown>([]); // adapted:DIV-9.2
  Arr.push(array, null, 'Chris', 'Nuno'); // adapted:DIV-9.2
  this.assertEquals(['Chris', 'Nuno'], array.value); // adapted:DIV-9.2
  Arr.push(array, null, 'Taylor'); // adapted:DIV-9.2
  this.assertEquals(['Chris', 'Nuno', 'Taylor'], array.value); // adapted:DIV-9.2
  this.expectExceptionObject(new InvalidArgumentException('Array value for key [foo.bar] must be an array, boolean found.'));
  array = new Ref<unknown>({ foo: { bar: false } }); // adapted:DIV-9.2
  Arr.push(array, 'foo.bar', 'baz'); // adapted:DIV-9.2
});
```

## Pending whole implementation (not supplied)

```ts
  /** Append values to a dot-keyed array, writing through the caller's Ref (DIV-9.2). */
  static push(array: Ref<unknown>, _key: unknown, ...values: unknown[]): unknown {
    const args = Array.from(arguments);
    if (args.length > 0) args[0] = array.value;
    const [boundArray, boundKey] = bindPhpArguments("Illuminate\\Support\\Arr::push", [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
    ], args);
    const target = new Ref(this.array(boundArray, boundKey, []));
    array_push(target, ...values);
    return phpReturn("Illuminate\\Support\\Arr::push", "array", this.set(array, boundKey, target.value));
  }

```

## Pending regressions

```ts
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

```

## Pinned PHP 8.5.11 probe evidence

Using the pinned collections/helpers.php, Macroable trait and Arr.php: builtin ArrayObject initialized with x=[] then Arr::push($a, 'x.y', 1) writes x.y=[1] and returns ['y'=>[1]]. A subclass overriding `public function offsetGet(mixed $k): mixed { return parent::offsetGet($k); }` instead emits an indirect modification notice, returns ['y'=>[1]], and leaves x=[] unchanged. A builtin-specific local writeback therefore loses subclass reference semantics. Root-leaf push on ArrayObject writes its appended value then throws PHP return TypeError because Arr::push declares array while Arr::set returns the object handle. Null-key push replaces an array Ref root; an ArrayObject root rejects null-key selection as object before mutation.

## Runnable pinned PHP reference probe

Run at the repository root with PHP 8.5.11 (`php --version` verifies the pin). This loads the exact read-only Upstream helpers and Arr source; no framework reimplementation is used.

```sh
php <<'PHP'
<?php
if (PHP_VERSION !== '8.5.11') { throw new RuntimeException('requires PHP 8.5.11'); }
require 'conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/helpers.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/Arr.php';
use Illuminate\Support\Arr;
class ValueGetArrayObject extends ArrayObject {
    public function offsetGet(mixed $key): mixed { return parent::offsetGet($key); }
}
set_error_handler(function ($severity, $message) { echo "notice: $message\n"; return true; });
foreach ([new ArrayObject(['x' => []]), new ValueGetArrayObject(['x' => []])] as $a) {
    $returned = Arr::push($a, 'x.y', 1);
    echo get_class($a), ' nested root=', json_encode($a->getArrayCopy()), ' return=', json_encode($returned), "\n";
}
$a = new ArrayObject(['x' => []]);
try { Arr::push($a, 'x', 1); } catch (TypeError $e) { echo $e->getMessage(), "\n"; }
echo 'root-leaf mutation=', json_encode($a->getArrayCopy()), "\n";
$a = ['x' => []];
$returned = Arr::push($a, null, 1);
echo 'null-key root=', get_debug_type($a), ' ', json_encode($a), ' return=', json_encode($returned), "\n";
$a = new ArrayObject(['x' => []]);
try { Arr::push($a, null, 1); } catch (InvalidArgumentException $e) { echo $e->getMessage(), "\n"; }
echo 'null-key ArrayObject unchanged=', json_encode($a->getArrayCopy()), "\n";
PHP
```

Expected pinned results: builtin nested root `{"x":{"y":[1]}}`, return `{"y":[1]}`; overriding offsetGet emits an indirect-modification notice and leaves root `{"x":[]}`, while returning `{"y":[1]}`. Root-leaf writes `{"x":[1]}` before `Illuminate\Support\Arr::push(): Return value must be of type array, ArrayObject returned`. For an array root, null key replaces the root with PHP array `{"x":[],"0":1}` and returns the same array. These distinct outcomes are pending runtime XT requirements, not claims about absent Arr.push.

A null key on an ArrayObject root instead throws `InvalidArgumentException("Array value for key [] must be an array, object found.")` before mutation; do not conflate this with the array-root replacement case.
