---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testIsAssoc"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testIsList"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testSortRecursive"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testSortRecursiveDesc"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testQuery"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testEmptyShuffle"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testShuffleActuallyShuffles"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testShuffleKeepsSameValues"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testShuffleProducesDifferentShuffles"
trigger: contract
proposed: >-
  Add the PHP-named builtins array_is_list, array_push, http_build_query and PHP_QUERY_RFC3986 plus Randomizer.shuffleArray to packages/runtime, preserving PHP behavior, with XT-runtime comparisons against PHP. One bounded runtime infrastructure change; no DIV, expected-value or grader change.
evidence: >-
  Runtime does not export array_is_list, array_push, http_build_query or PHP_QUERY_RFC3986, and Randomizer has no shuffleArray method. Arr.php calls these exact PHP builtins. Hold isAssoc, isList, sortRecursive, sortRecursiveDesc, push, query and shuffle whole. Runtime is an earlier Component, so these IDs stay not-ported-yet with this Escalation, not blocked-by:runtime.
---

# ESC-14.6-1: Runtime PHP array and query builtin contracts

Recommended under `decisions/MAINT-2026-10-26-runtime-builtins.md`; no runtime implementation belongs in collections.

## Pending original test bodies

These tests are unregistered pending the runtime contracts. Preserve these exact bodies and all assertions when resuming.

```php
    public function testIsAssoc()
    {
        $this->assertTrue(Arr::isAssoc(['a' => 'a', 0 => 'b']));
        $this->assertTrue(Arr::isAssoc([1 => 'a', 0 => 'b']));
        $this->assertTrue(Arr::isAssoc([1 => 'a', 2 => 'b']));
        $this->assertFalse(Arr::isAssoc([0 => 'a', 1 => 'b']));
        $this->assertFalse(Arr::isAssoc(['a', 'b']));

        $this->assertFalse(Arr::isAssoc([]));
        $this->assertFalse(Arr::isAssoc([1, 2, 3]));
        $this->assertFalse(Arr::isAssoc(['foo', 2, 3]));
        $this->assertFalse(Arr::isAssoc([0 => 'foo', 'bar']));

        $this->assertTrue(Arr::isAssoc([1 => 'foo', 'bar']));
        $this->assertTrue(Arr::isAssoc([0 => 'foo', 'bar' => 'baz']));
        $this->assertTrue(Arr::isAssoc([0 => 'foo', 2 => 'bar']));
        $this->assertTrue(Arr::isAssoc(['foo' => 'bar', 'baz' => 'qux']));
    }
```

```php
    public function testIsList()
    {
        $this->assertTrue(Arr::isList([]));
        $this->assertTrue(Arr::isList([1, 2, 3]));
        $this->assertTrue(Arr::isList(['foo', 2, 3]));
        $this->assertTrue(Arr::isList(['foo', 'bar']));
        $this->assertTrue(Arr::isList([0 => 'foo', 'bar']));
        $this->assertTrue(Arr::isList([0 => 'foo', 1 => 'bar']));

        $this->assertFalse(Arr::isList([-1 => 1]));
        $this->assertFalse(Arr::isList([-1 => 1, 0 => 2]));
        $this->assertFalse(Arr::isList([1 => 'foo', 'bar']));
        $this->assertFalse(Arr::isList([1 => 'foo', 0 => 'bar']));
        $this->assertFalse(Arr::isList([0 => 'foo', 'bar' => 'baz']));
        $this->assertFalse(Arr::isList([0 => 'foo', 2 => 'bar']));
        $this->assertFalse(Arr::isList(['foo' => 'bar', 'baz' => 'qux']));
    }
```

```php
    public function testSortRecursive()
    {
        $array = [
            'users' => [
                [
                    // should sort associative arrays by keys
                    'name' => 'joe',
                    'mail' => 'joe@example.com',
                    // should sort deeply nested arrays
                    'numbers' => [2, 1, 0],
                ],
                [
                    'name' => 'jane',
                    'age' => 25,
                ],
            ],
            'repositories' => [
                // should use weird `sort()` behavior on arrays of arrays
                ['id' => 1],
                ['id' => 0],
            ],
            // should sort non-associative arrays by value
            20 => [2, 1, 0],
            30 => [
                // should sort non-incrementing numerical keys by keys
                2 => 'a',
                1 => 'b',
                0 => 'c',
            ],
        ];

        $expect = [
            20 => [0, 1, 2],
            30 => [
                0 => 'c',
                1 => 'b',
                2 => 'a',
            ],
            'repositories' => [
                ['id' => 0],
                ['id' => 1],
            ],
            'users' => [
                [
                    'age' => 25,
                    'name' => 'jane',
                ],
                [
                    'mail' => 'joe@example.com',
                    'name' => 'joe',
                    'numbers' => [0, 1, 2],
                ],
            ],
        ];

        $this->assertEquals($expect, Arr::sortRecursive($array));
    }
```

```php
    public function testSortRecursiveDesc()
    {
        $array = [
            'empty' => [],
            'nested' => [
                'level1' => [
                    'level2' => [
                        'level3' => [2, 3, 1],
                    ],
                    'values' => [4, 5, 6],
                ],
            ],
            'mixed' => [
                'a' => 1,
                2 => 'b',
                'c' => 3,
                1 => 'd',
            ],
            'numbered_index' => [
                1 => 'e',
                3 => 'c',
                4 => 'b',
                5 => 'a',
                2 => 'd',
            ],
        ];

        $expect = [
            'empty' => [],
            'mixed' => [
                'c' => 3,
                'a' => 1,
                2 => 'b',
                1 => 'd',
            ],
            'nested' => [
                'level1' => [
                    'values' => [6, 5, 4],
                    'level2' => [
                        'level3' => [3, 2, 1],
                    ],
                ],
            ],
            'numbered_index' => [
                5 => 'a',
                4 => 'b',
                3 => 'c',
                2 => 'd',
                1 => 'e',
            ],
        ];

        $this->assertEquals($expect, Arr::sortRecursiveDesc($array));
    }
```

```php
    public function testPush()
    {
        $array = [];

        Arr::push($array, 'office.furniture', 'Desk');
        $this->assertEquals(['Desk'], $array['office']['furniture']);

        Arr::push($array, 'office.furniture', 'Chair', 'Lamp');
        $this->assertEquals(['Desk', 'Chair', 'Lamp'], $array['office']['furniture']);

        $array = [];

        Arr::push($array, null, 'Chris', 'Nuno');
        $this->assertEquals(['Chris', 'Nuno'], $array);

        Arr::push($array, null, 'Taylor');
        $this->assertEquals(['Chris', 'Nuno', 'Taylor'], $array);

        $this->expectExceptionObject(new InvalidArgumentException('Array value for key [foo.bar] must be an array, boolean found.'));

        $array = ['foo' => ['bar' => false]];
        Arr::push($array, 'foo.bar', 'baz');
    }
```

```php
    public function testQuery()
    {
        $this->assertSame('', Arr::query([]));
        $this->assertSame('foo=bar', Arr::query(['foo' => 'bar']));
        $this->assertSame('foo=bar&bar=baz', Arr::query(['foo' => 'bar', 'bar' => 'baz']));
        $this->assertSame('foo=bar&bar=1', Arr::query(['foo' => 'bar', 'bar' => true]));
        $this->assertSame('foo=bar', Arr::query(['foo' => 'bar', 'bar' => null]));
        $this->assertSame('foo=bar&bar=', Arr::query(['foo' => 'bar', 'bar' => '']));
    }
```

```php
    public function testEmptyShuffle()
    {
        $this->assertSame([], Arr::shuffle([]));
    }
```

```php
    public function testShuffleActuallyShuffles()
    {
        $input = range('a', 'z');

        $this->assertFalse(
            Arr::shuffle($input) === $input && Arr::shuffle($input) === $input,
            "The shuffles were unshuffled each time, which shouldn't happen."
        );
    }
```

```php
    public function testShuffleKeepsSameValues()
    {
        $input = range('a', 'z');
        $shuffled = Arr::shuffle($input);
        sort($shuffled);

        $this->assertEquals($input, $shuffled);
    }
```

```php
    public function testShuffleProducesDifferentShuffles()
    {
        $input = range('a', 'z');

        $this->assertFalse(
            Arr::shuffle($input) === Arr::shuffle($input) && Arr::shuffle($input) === Arr::shuffle($input),
            "The shuffles produced the same output each time, which shouldn't happen."
        );
    }
```
