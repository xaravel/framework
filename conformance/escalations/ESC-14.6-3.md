---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray"
trigger: contract
proposed: >-
  Publish a reusable runtime coercive PHP argument-binding seam (the existing phpArguments is internal), with PHP comparisons covering userland array, string, bool, int and float parameters, nullable defaults, union keys, validation of every supplied argument before method execution, and normalized scalar returns. No DIV, expected-value or grader change.
evidence: >-
  Arr typed accessors require array input, string|int|null keys and nullable typed defaults. Merely inspecting the selected value ignores invalid unused defaults and does not reproduce coercion or PHP argument errors. Collections must not copy PHP parameter semantics. Hold these five members and exact Test IDs whole; runtime is earlier, so Expectations remain not-ported-yet.
---

# ESC-14.6-3: Runtime userland coercive argument-binding contract

Recommended under decisions/MAINT-2026-10-26-runtime-builtins.md's PHP language-construct amendment. Pending signatures must return number | bigint for integer, number | PhpFloat for float, and normalized string for string-like class tokens. No public unchecked accessor is supplied until the binder exists.

## Pending original bodies

```php
    public function testItGetsAString()
    {
        $test_array = ['string' => 'foo bar', 'integer' => 1234];

        // Test string values are returned as strings
        $this->assertSame(
            'foo bar', Arr::string($test_array, 'string')
        );

        // Test that default string values are returned for missing keys
        $this->assertSame(
            'default', Arr::string($test_array, 'missing_key', 'default')
        );

        // Test that an exception is raised if the value is not a string
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('#^Array value for key \[integer\] must be a string, (.*) found.#');
        Arr::string($test_array, 'integer');
    }
```

```ts
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString', { case: SupportArrTest }, async function () {
  let test_array: any = { string: 'foo bar', integer: 1234 };
  this.assertSame('foo bar', Arr.string(test_array, 'string'));
  this.assertSame('default', Arr.string(test_array, 'missing_key', 'default'));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[integer\] must be a string, (.*) found./); // adapted:DIV-10.1
  Arr.string(test_array, 'integer');
});
```

```php
    public function testItGetsAnInteger()
    {
        $test_array = ['string' => 'foo bar', 'integer' => 1234];

        // Test integer values are returned as integers
        $this->assertSame(
            1234, Arr::integer($test_array, 'integer')
        );

        // Test that default integer values are returned for missing keys
        $this->assertSame(
            999, Arr::integer($test_array, 'missing_key', 999)
        );

        // Test that an exception is raised if the value is not an integer
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('#^Array value for key \[string\] must be an integer, (.*) found.#');
        Arr::integer($test_array, 'string');
    }
```

```ts
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger', { case: SupportArrTest }, async function () {
  let test_array: any = { string: 'foo bar', integer: 1234 };
  this.assertSame(1234, Arr.integer(test_array, 'integer'));
  this.assertSame(999, Arr.integer(test_array, 'missing_key', 999));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an integer, (.*) found./); // adapted:DIV-10.1
  Arr.integer(test_array, 'string');
});
```

```php
    public function testItGetsAFloat()
    {
        $test_array = ['string' => 'foo bar', 'float' => 12.34];

        // Test float values are returned as floats
        $this->assertSame(
            12.34, Arr::float($test_array, 'float')
        );

        // Test that default float values are returned for missing keys
        $this->assertSame(
            56.78, Arr::float($test_array, 'missing_key', 56.78)
        );

        // Test that an exception is raised if the value is not a float
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('#^Array value for key \[string\] must be a float, (.*) found.#');
        Arr::float($test_array, 'string');
    }
```

```ts
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat', { case: SupportArrTest }, async function () {
  let test_array: any = { string: 'foo bar', float: 12.34 };
  this.assertSame(12.34, Arr.float(test_array, 'float'));
  this.assertSame(56.78, Arr.float(test_array, 'missing_key', 56.78));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a float, (.*) found./); // adapted:DIV-10.1
  Arr.float(test_array, 'string');
});
```

```php
    public function testItGetsABoolean()
    {
        $test_array = ['string' => 'foo bar',  'boolean' => true];

        // Test boolean values are returned as booleans
        $this->assertTrue(
            Arr::boolean($test_array, 'boolean')
        );

        // Test that default boolean values are returned for missing keys
        $this->assertTrue(
            Arr::boolean($test_array, 'missing_key', true)
        );

        // Test that an exception is raised if the value is not a boolean
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('#^Array value for key \[string\] must be a boolean, (.*) found.#');
        Arr::boolean($test_array, 'string');
    }
```

```ts
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean', { case: SupportArrTest }, async function () {
  let test_array: any = { string: 'foo bar', boolean: true };
  this.assertTrue(Arr.boolean(test_array, 'boolean'));
  this.assertTrue(Arr.boolean(test_array, 'missing_key', true));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a boolean, (.*) found./); // adapted:DIV-10.1
  Arr.boolean(test_array, 'string');
});
```

```php
    public function testItGetsAnArray()
    {
        $test_array = ['string' => 'foo bar', 'array' => ['foo', 'bar']];

        // Test array values are returned as arrays
        $this->assertSame(
            ['foo', 'bar'], Arr::array($test_array, 'array')
        );

        // Test that default array values are returned for missing keys
        $this->assertSame(
            [1, 'two'], Arr::array($test_array, 'missing_key', [1, 'two'])
        );

        // Test that an exception is raised if the value is not an array
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('#^Array value for key \[string\] must be an array, (.*) found.#');
        Arr::array($test_array, 'string');
    }
```

```ts
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray', { case: SupportArrTest }, async function () {
  let test_array: any = { string: 'foo bar', array: ['foo', 'bar'] };
  this.assertSame(['foo', 'bar'], Arr.array(test_array, 'array'));
  this.assertSame([1, 'two'], Arr.array(test_array, 'missing_key', [1, 'two']));
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an array, (.*) found./); // adapted:DIV-10.1
  Arr.array(test_array, 'string');
});
```

## Pending scalar/default regression inputs

When the seam lands, execute these additional Xaravel assertions, preserving the originals above:

- Arr.integer({ n: 9007199254740993n }, 'n') returns that bigint unchanged; an integral tagged float in an integer slot fails the selected-value check.
- Arr.float({ n: float(1) }, 'n') preserves its tagged float representation; integer selected values fail the float check.
- Arr.string({ s: fqcn(SomeRegisteredClass) }, 's') returns a primitive PHP string, including class-string token representations accepted by is_string.
- Every invalid default throws even when the key exists: Arr.array({n: []}, 'n', 1), Arr.boolean({n: true}, 'n', []), Arr.float({n: float(1)}, 'n', []), Arr.integer({n: 1}, 'n', []), Arr.string({n: 'x'}, 'n', []).
- Numeric-string integer defaults, scalar boolean defaults and stringable/class-string defaults coerce before get. Invalid supplied inputs preserve PHP TypeError text. Validate array input and string|int|null key unions before reading the array. Null defaults remain allowed; null selected values still fail the accessor-specific selected-value check.
