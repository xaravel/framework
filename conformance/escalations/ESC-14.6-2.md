---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testAccessible"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testArrayable"
trigger: contract
proposed: >-
  Add PHP DateTime to packages/runtime with PHP behavior and XT-runtime comparisons against PHP. No DIV, expected-value or grader change. The implementation should cover the runtime contract required for the class, rather than introduce a collections fixture impersonating this builtin.
evidence: >-
  Both complete upstream tests instantiate PHP DateTime. Runtime exports no DateTime class. Substituting a JS Date or removing these assertions changes the subjects. Hold these exact tests whole; Arr.accessible and Arr.arrayable remain independently implementable. Runtime is an earlier Component, so these IDs stay not-ported-yet with this Escalation, not blocked-by:runtime.
---

# ESC-14.6-2: Runtime DateTime fixture contract

Recommended under `decisions/MAINT-2026-10-26-runtime-builtins.md`; no runtime implementation belongs in collections.

## Pending original test bodies

These tests are unregistered pending the runtime contracts. Preserve these exact bodies and all assertions when resuming.

```php
    public function testAccessible(): void
    {
        $this->assertTrue(Arr::accessible([]));
        $this->assertTrue(Arr::accessible([1, 2]));
        $this->assertTrue(Arr::accessible(['a' => 1, 'b' => 2]));
        $this->assertTrue(Arr::accessible(new Collection));

        $this->assertFalse(Arr::accessible(null));
        $this->assertFalse(Arr::accessible('abc'));
        $this->assertFalse(Arr::accessible(new stdClass));
        $this->assertFalse(Arr::accessible((object) ['a' => 1, 'b' => 2]));
        $this->assertFalse(Arr::accessible(123));
        $this->assertFalse(Arr::accessible(12.34));
        $this->assertFalse(Arr::accessible(true));
        $this->assertFalse(Arr::accessible(new \DateTime));
        $this->assertFalse(Arr::accessible(static fn () => null));
    }
```

```php
    public function testArrayable(): void
    {
        $this->assertTrue(Arr::arrayable([]));
        $this->assertTrue(Arr::arrayable(new TestArrayableObject));
        $this->assertTrue(Arr::arrayable(new TestJsonableObject));
        $this->assertTrue(Arr::arrayable(new TestJsonSerializeObject));
        $this->assertTrue(Arr::arrayable(new TestTraversableAndJsonSerializableObject));

        $this->assertFalse(Arr::arrayable(null));
        $this->assertFalse(Arr::arrayable('abc'));
        $this->assertFalse(Arr::arrayable(new stdClass));
        $this->assertFalse(Arr::arrayable((object) ['a' => 1, 'b' => 2]));
        $this->assertFalse(Arr::arrayable(123));
        $this->assertFalse(Arr::arrayable(12.34));
        $this->assertFalse(Arr::arrayable(true));
        $this->assertFalse(Arr::arrayable(new \DateTime));
        $this->assertFalse(Arr::arrayable(static fn () => null));
    }
```
