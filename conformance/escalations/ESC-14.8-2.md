---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportLazyCollectionIsLazyTest::testFlatMapIsLazy"
trigger: contract
proposed: >-
  Publish PHP array_sum in packages/runtime through a scoped Runtime unit, with its PHP behavior and Oracle comparisons; then register the retained complete laziness test. No divergence, assertion change or grader change.
evidence: >-
  The complete canonical test passes a callback that calls PHP array_sum to flatMap. packages/runtime/src has neither array_sum nor arraySum and @xaravel/runtime/php exports neither (tsc TS2305 for importing array_sum). Runtime is an earlier Component, so this Test ID stays not-ported-yet with this Escalation, rather than blocked-by:runtime. A collections implementation or declaration-only pretend export would bypass its missing contract. Other Story IDs remain independent.
---

# ESC-14.8-2: Missing runtime array_sum contract

The first callback deliberately must never execute in a correct run: its surrounding assertion checks zero source enumeration. This does not authorize changing its canonical PHP builtin to another expression, inventing a local builtin, or declaring an unavailable export. The full test remains unregistered until the runtime contract exists.

## Pending original body

```php
    public function testFlatMapIsLazy()
    {
        $data = $this->make([1, 2, 3, 4, 5]);

        $this->assertDoesNotEnumerateCollection($data, function ($collection) {
            $collection->flatMap(function ($values) {
                return array_sum($values);
            });
        });

        $this->assertEnumeratesCollection($data, 3, function ($collection) {
            $collection->flatMap(function ($value) {
                return range(1, $value);
            })->take(5)->all();
        });
    }

```

## Proposed complete port after the runtime export exists

Import `array_sum` and `range` from `@xaravel/runtime/php`, then register:

```ts
portedTest(`${ID}::testFlatMapIsLazy`, { case: SupportLazyCollectionIsLazyTest }, async function () {
    const data = this.make([1, 2, 3, 4, 5]);

    this.assertDoesNotEnumerateCollection(data, (collection: LazyCollection) => {
        collection.flatMap((values: number[]) => {
            return array_sum(values);
        });
    });

    this.assertEnumeratesCollection(data, 3, (collection: LazyCollection) => {
        collection.flatMap((value: number) => {
            return range(1, value);
        }).take(5).all();
    });

});

```

The retained CountsEnumerations helper preserves both original assertions, including their original expected source counts of zero and three. No assertion is dropped or weakened.
