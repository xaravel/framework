<?php
// The PHP 8.5.11 evidence for XT-runtime-77..78 (php-match-dynamic-call.test.ts), action item
// epic-14-item-7-runtime-match-error-dynamic-call. Each line is `<label>\t<json_encode(value)>`; XT-runtime-79 computes
// every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-match-dynamic-call.probe.php > php-match-dynamic-call.probe.txt

namespace XaravelFixture\PhpMatchDynamicCall {
    class Thing
    {
    }

    class Base
    {
        public function foo(...$args): array
        {
            return ['foo', $args];
        }

        public static function st(): string
        {
            return static::class;
        }

        public function __toString(): string
        {
            return 'base';
        }
    }

    class Sub extends Base
    {
    }

    class Magic
    {
        public function known(): string
        {
            return 'known';
        }

        public function __call($name, $args): array
        {
            return ['__call', $name, $args];
        }
    }

    class UpperMagic
    {
        public function __CALL($name, $args): array
        {
            return ['__CALL', $name, $args];
        }
    }

    class Parent_
    {
        public function foo(): string
        {
            return 'parent foo';
        }
    }

    class Child_ extends Parent_
    {
        public function FOO(): string
        {
            return 'child FOO';
        }
    }

    class Text
    {
        public function __toString(): string
        {
            return 'foo';
        }
    }
}

namespace {
    use XaravelFixture\PhpMatchDynamicCall\Base;
    use XaravelFixture\PhpMatchDynamicCall\Child_;
    use XaravelFixture\PhpMatchDynamicCall\Magic;
    use XaravelFixture\PhpMatchDynamicCall\Sub;
    use XaravelFixture\PhpMatchDynamicCall\Text;
    use XaravelFixture\PhpMatchDynamicCall\Thing;
    use XaravelFixture\PhpMatchDynamicCall\UpperMagic;

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n";
    }

    /** The result of `$f`, or what it throws. */
    function attempt(callable $f): mixed
    {
        try {
            return $f();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
    }

    /** What a `match` with no matching arm throws for `$subject`. */
    function unmatched(mixed $subject): mixed
    {
        return attempt(fn () => match ($subject) {
            'xaravel-no-such-arm' => 'matched',
        });
    }

    /** PHP's dynamic method call, `callMethod`'s construct. */
    function call(mixed $object, mixed $name, mixed ...$args): mixed
    {
        return attempt(fn () => $object->$name(...$args));
    }

    // XT-runtime-77: UnhandledMatchError and the message of a match with no matching arm.
    $error = new UnhandledMatchError('m', 3);
    out('match.class', [
        get_class($error),
        get_parent_class($error),
        $error instanceof Error,
        $error instanceof Throwable,
        $error->getMessage(),
        $error->getCode(),
        $error->getPrevious(),
        (new UnhandledMatchError())->getMessage(),
        attempt(fn () => throw new UnhandledMatchError('x', 2)),
        attempt(fn () => new UnhandledMatchError([])),
    ]);
    out('match.scalars', array_map('unmatched', [null, true, false, 5, -5, 0, 2 ** 62, PHP_INT_MIN, 1.0, 1.5, 0.1 + 0.2, 1e20, -0.0, INF, -INF, NAN, 1e15, 1e14, 0.00001, -2.5, 123456789012345678.0]));
    out('match.strings', array_map('unmatched', [
        '',
        'abc',
        "a\nb\tc\\d\x1b\x01\x7f",
        str_repeat('é', 8),
        str_repeat('a', 16),
        str_repeat('a', 15),
        "\r\f\v",
        "'q'",
        str_repeat('a', 14) . 'é',
        "\0",
        'tab	end',
        '"dq"',
        'XaravelFixture\PhpMatchDynamicCall\Thing',
    ]));
    out('match.others', array_map('unmatched', [[], [1], ['a' => 1], new stdClass(), new Thing(), fn () => 1, new class extends Thing {}, new class {}]));

    // XT-runtime-78: the dynamic method call $object->$name(...$args).
    $base = new Base();
    $sub = new Sub();
    out('call.exact', [
        call($base, 'foo'),
        call($base, 'FOO', 1, 'two'),
        call($sub, 'Foo', [3]),
        call($base, 'st'),
        call($sub, 'st'),
        call($sub, 'ST'),
        call($sub, '__toString'),
        call($sub, '__TOSTRING'),
    ]);
    out('call.override', [
        call(new Child_(), 'foo'),
        call(new Child_(), 'FOO'),
        call(new Child_(), 'Foo'),
        method_exists(new Child_(), 'foo'),
    ]);
    out('call.magic', [
        call(new Magic(), 'missing', 1, 2),
        call(new Magic(), 'MiSsInG'),
        call(new Magic(), 'known'),
        call(new Magic(), 'KNOWN'),
        call(new Magic(), ''),
        call(new UpperMagic(), 'Other', [1]),
    ]);
    out('call.undefined', [
        call($base, 'nope'),
        call($base, ''),
        call($sub, 'NoPe'),
        call(new Thing(), 'foo'),
        call(new stdClass(), 'foo'),
        call(new class extends Base {}, 'zz'),
        call(new class {}, 'zz'),
        call(fn () => 1, 'nope'),
    ]);
    out('call.badName', [
        call($base, 1),
        call($base, null),
        call($base, true),
        call($base, 1.5),
        call($base, ['foo']),
        call($base, new Text()),
        call(null, 1),
        call(5, new Text()),
    ]);
    out('call.nonObject', [
        call(null, 'foo'),
        call(true, 'foo'),
        call(false, 'foo'),
        call(5, 'foo'),
        call(1.5, 'foo'),
        call('str', 'foo'),
        call([1], 'foo'),
        call(['a' => 1], 'foo'),
        call(Base::class, 'st'),
        call(null, ''),
    ]);
    out('call.closure', [
        call(fn ($a) => $a * 2, '__invoke', 3),
        call(fn ($a) => $a * 2, '__INVOKE', 3),
        call(fn (...$a) => $a, '__Invoke', 1, 2),
        call(fn () => 1, 'Nope'),
    ]);
}
