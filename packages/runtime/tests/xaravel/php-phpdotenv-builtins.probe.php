<?php
// The PHP 8.5.11 evidence for XT-runtime-131..134 (php-phpdotenv-builtins.test.ts), action item
// epic-15-item-1-runtime-phpdotenv-builtins (ESC-15.2-1 parts a-e): the string, ctype, mbstring, filter and existence
// builtins vlucas/phpdotenv v5.7.0 calls. Each line is `<label>\t<json_encode(value)>`; the test computes every label
// with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`. Run with
// error_reporting=0: PHP's warnings, notices and deprecations are not raised by the runtime (DIV-9.17).
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-phpdotenv-builtins.probe.php > php-phpdotenv-builtins.probe.txt

namespace XaravelFixture\PhpdotenvBuiltins {
    class Text
    {
        public function __construct(private string $text = 'text')
        {
        }

        public function __toString(): string
        {
            return $this->text;
        }
    }

    class Plain
    {
    }

    enum Suit
    {
        case Hearts;
    }

    trait Greets
    {
    }
}

namespace {
    use XaravelFixture\PhpdotenvBuiltins\Plain;
    use XaravelFixture\PhpdotenvBuiltins\Text;

    // The C locale, as the Oracle's glibc PHP runs: Darwin's default `C.UTF-8` classifies byte 0xA0 as a space.
    setlocale(LC_CTYPE, 'C');

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value), "\n";
    }

    function attempt(callable $fn): mixed
    {
        try {
            return $fn();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
    }

    /** Each argument list through `$fn`, its result or "<class>: <message>". */
    function each_call(string $fn, array $calls): array
    {
        return array_map(fn ($args) => attempt(fn () => $fn(...$args)), $calls);
    }

    /** str_replace with its by-reference count: [result, count]. */
    function replaced(...$args): mixed
    {
        return attempt(function () use ($args) {
            $count = null;
            $result = str_replace($args[0], $args[1], $args[2], $count);
            return [$result, $count];
        });
    }

    // XT-runtime-131: the string functions.
    out('strpos', each_call('strpos', [
        ["a=\"b", '="'], ['héllo', 'l'], ['abc', 'd'], ['abc', '', 1], ['abc', 'c', -1], ['abc', 'a', 4], ['abc', 'a', -4],
        ['abc', '', 3], ['abc', '', -3], ['aXbX', 'X', 2], ['ab', 'b', '1'], [12345, 3], ['abc', 'a', 1.9], [[], 'a'],
        ['abc', 'b', 'x'], ['', ''], ['abc', 'a', 3],
    ]));
    out('str_replace', [
        replaced('\\\\', '', 'a\\\\b\\\\c'),
        replaced('\\', '/', 'a\\b\\c'),
        replaced(['a', 'b'], ['1', '2'], 'aabbc'),
        replaced(['a', 'b', 'c'], ['x'], 'abcabc'),
        replaced(['a', 'b'], 'z', 'abc'),
        replaced(['ab', 'b'], ['b', 'x'], 'abab'),
        replaced(['', 'a'], ['1', '2'], 'abc'),
        replaced('', 'x', 'abc'),
        replaced('a', 'b', ['k' => 'aa', 5 => 1, 7 => ['a'], 'n' => null, 'f' => 1.5, 't' => true, 'o' => new Text('xa')]),
        replaced('a', 'b', [new Plain()]),
        replaced(['a', 'b'], [new Plain()], 'c'),
        replaced(['a', [1]], 'b', 'aArray'),
        replaced('é', 'e', 'héllo é'),
        replaced(1, 2, 1213),
        replaced(['a', 'a'], ['b', 'c'], 'a'),
        replaced(['a', 'b'], ['', 'z'], 'a'),
        replaced('a', ['b'], 'abc'),
        replaced(new Plain(), '', 'a'),
        replaced(new Text('a'), new Text('b'), new Text('aa')),
        replaced('a', 'b', []),
        replaced('x', 'y', ''),
        replaced([1, 2.5, true, null], ['one', 'two', 'three', 'four'], '12.51'),
        replaced(['x' => 'a', 'y' => 'b'], ['p' => '1', 'q' => '2'], 'ab'),
    ]);
    out('ltrim', each_call('ltrim', [
        [" \t\n\r\v\fa b \f", " \t\n\r\v\f"], ["  \n\0x  "], ['xxayx', 'x'], ['abcdef', 'a..c'], ['..ab', '..a'], ['a..b', 'a..'],
        ['zab', 'z..a'], ['', 'a'], ['aaa', 'a'], [12, '1'], ['abc', ''], ['abc', null], ['ééa', 'é'],
    ]));
    out('rtrim', each_call('rtrim', [
        [" a b \t\n\r\v\f", " \t\n\r\v\f"], ["  x\n\0  "], ['/a//', '/'], ['abcdef', 'd..f'], ['ab..', '..b'], ['aaa', 'a'],
        ['abc', 'a..c'], ['', 'a'], [[], 'a'],
    ]));
    out('ord', each_call('ord', [[''], ['é'], ['A'], ["\0"], ['ab'], [5], [true], [null], [[]]]));
    out('strtok', [
        strtok("\n\nab\ncd", "\n"), strtok("\n"), strtok("\n"), strtok("\n"),
        strtok("\n\n\n", "\n"), strtok("\n"),
        strtok('a b  c', ' '), strtok(' '), strtok(' '), strtok(' '),
        strtok('a,b;c', ',;'), strtok(';'), strtok(','),
        strtok('abc', ''), strtok(''),
        strtok('x=y', '='), strtok('x', null),
        strtok('', 'a'), strtok('a'),
        strtok('héllo', 'l'), strtok('l'),
    ]);
    out('strtok.errors', each_call('strtok', [[[], 'a'], ['a', []]]));
    out('addcslashes', each_call('addcslashes', [
        ["a\0\x1f\x7f\n\"", "\0..\37\177"], ['Hello World', 'A..Z'], ["\x07\x08\t\n\x0b\x0c\r", "\0..\37"], ['foo[bar]', 'A..Z'],
        ['zoo["."]', 'z..A'], ['abc', ''], ['', 'a'], ["a\\b", "\\"], ['quote"s', '"'], ['abc', 'a..'], ["\u{80}\u{ff} é", "\u{80}..\u{ff}"],
        [[], 'a'],
    ]));
    out('stripcslashes', each_call('stripcslashes', [
        ['\f\n\x41\101\q\\'], ['\a\b\t\n\v\f\r'], ['\x4'], ['\x'], ['\0'], ['\1234'], ['\\\\'], ['a\\'], ['\x414'], ['\e'], ['plain'],
        ['\"'], ['\101\x42c'], [''], ['\x7a\172'], [[]],
    ]));

    // XT-runtime-132: ctype and filter_var.
    out('ctype_space', each_call('ctype_space', [
        [" \x0b"], [''], [32], [1000], [-96], [null], [" \t\n\r\x0b\x0c"], ['a '], [9], [-247], [256], [-129], [1.0], [true], [[]],
        ["\u{a0}"], [' '], [new Text(' ')], [-128], [-1],
    ]));
    out('ctype_digit', each_call('ctype_digit', [
        ['012'], [5], [53], ['1.5'], [''], [1000], [-1000], [-96], [255], [-128], ['٣'], ['12a'], [null], [1.0], [[]], [false], ['-1'],
    ]));
    $bools = ['1', 'true', ' Yes ', 'on', 'off', 'no', '0', '', 'maybe', null, true, false, 1, [1], 'TRUE', 'False', " on\n", "\fon", "on\0", "\v on\r\t",
        new Text('yes'), new Plain(), 0, 1.0, 2, '  ', fn () => 1];
    out('filter_var.boolean', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_VALIDATE_BOOLEAN)), $bools));
    out('filter_var.boolean.null', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)), $bools));
    out('filter_var.bool', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_VALIDATE_BOOL, ['flags' => FILTER_NULL_ON_FAILURE])), ['yes', 'nah']));
    $ints = ['12', ' 12 ', '012', '-0', '+5', '9223372036854775808', 1.0, '1e3', '9223372036854775807', '-9223372036854775808',
        '-9223372036854775809', '', ' ', '0', '00', '+0', '-', '+', '1 2', "\t7\n", '0x1A', 12, -3, true, false, null, [1], new Text('8'),
        new Plain(), 1.5, '12345678901234567890', '1234567890123456789', "\f1", '٣', '-012'];
    out('filter_var.int', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_VALIDATE_INT)), $ints));
    out('filter_var.int.null', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE)), $ints));
    out('filter_var.int.options', [
        filter_var('5', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]),
        filter_var('15', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]),
        filter_var('0', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]),
        filter_var('15', FILTER_VALIDATE_INT, ['options' => ['max_range' => 10, 'default' => 3]]),
        filter_var('x', FILTER_VALIDATE_INT, ['options' => ['default' => 'd']]),
        filter_var('x', FILTER_VALIDATE_INT, ['options' => ['default' => 'd'], 'flags' => FILTER_NULL_ON_FAILURE]),
        filter_var('7', FILTER_VALIDATE_INT, ['options' => ['default' => 'd']]),
        filter_var('5', FILTER_VALIDATE_INT, ['options' => ['min_range' => '5', 'max_range' => '5']]),
        filter_var('5', FILTER_VALIDATE_INT, ['options' => ['min_range' => 'abc']]),
        filter_var('15', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10], 'flags' => FILTER_NULL_ON_FAILURE]),
        filter_var('5', FILTER_VALIDATE_INT, ['options' => 'ignored']),
        filter_var('5', FILTER_VALIDATE_INT, []),
        filter_var([1], FILTER_VALIDATE_INT, ['options' => ['default' => 9]]),
        filter_var(new Plain(), FILTER_VALIDATE_INT, ['options' => ['default' => 9]]),
        filter_var('no', FILTER_VALIDATE_BOOLEAN, ['options' => ['default' => 'd']]),
        filter_var('maybe', FILTER_VALIDATE_BOOLEAN, ['options' => ['default' => 'd'], 'flags' => FILTER_NULL_ON_FAILURE]),
        filter_var('5', FILTER_VALIDATE_INT, ['flags' => '134217728']),
    ]);
    out('filter_var.default', array_map(fn ($v) => attempt(fn () => filter_var($v)), [5, 1.5, [1], 'a b', null, true, false, new Text('t'),
        new Plain(), 0.1 + 0.2, 1e100, -0.0, 7.0]));
    out('filter_var.default.null', array_map(fn ($v) => attempt(fn () => filter_var($v, FILTER_DEFAULT, FILTER_NULL_ON_FAILURE)), [[1], 'a', new Plain()]));
    out('filter_var.arguments', [
        attempt(fn () => filter_var('1', 'x')),
        attempt(fn () => filter_var('1', FILTER_VALIDATE_INT, 'x')),
        attempt(fn () => filter_var('1', '257')),
        attempt(fn () => filter_var('1', 257.0)),
        attempt(fn () => filter_var('1', FILTER_VALIDATE_INT, '0')),
        attempt(fn () => filter_var('1', FILTER_VALIDATE_INT, new Plain())),
    ]);
    out('filter_var.constants', [FILTER_DEFAULT, FILTER_VALIDATE_BOOLEAN, FILTER_VALIDATE_BOOL, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE]);

    // XT-runtime-133: mbstring over UTF-8.
    out('mb_strlen', each_call('mb_strlen', [
        ['héllo'], [''], ['日本語'], ['😀a'], ['abc', null], ['héllo', 'UTF-8'], ['héllo', 'utf8'], ['héllo', 'UTF8'], ['héllo', 'utf-8'],
        [12.5], ['a', 'nope'], ['a', ''], [[]],
    ]));
    out('mb_substr', each_call('mb_substr', [
        ['héllo', 1, 3], ['héllo', -3], ['héllo', 1, -1], ['héllo', -2, -1], ['héllo', 10], ['héllo', -10, 2], ['héllo', 0, -10],
        ['héllo', 2, null], ['héllo', 5], ['héllo', 4, 0], ['😀ab', 0, 1], ['héllo', 1, 2, 'UTF-8'], ['héllo', '1', '2'], ['', 0],
        ['héllo', 'x'], ['héllo', 3, -2], ['a', 0, 1, 'nope'],
    ]));
    out('mb_strpos', each_call('mb_strpos', [
        ['héllo', 'l', 0, 'UTF-8'], ['héllo', 'l'], ['héllo', 'l', 3], ['héllo', 'l', -2], ['héllo', 'x'], ['héllo', ''], ['héllo', '', 2],
        ['héllo', '', -1], ['héllo', '', 5], ['héllo', 'l', 6], ['héllo', 'l', -6], ['héllo', 'h', -5], ['日本語', '語'], ['héllo', 'é'],
        ['', ''], ['', 'a'], ['héllo', 'l', 0, 'nope'], ['héllo', 'o', 5], ['abc', 'c', '1'],
    ]));
    out('mb_convert_encoding', [
        attempt(fn () => mb_convert_encoding('héllo', 'UTF-8', 'UTF-8')),
        attempt(fn () => mb_convert_encoding('héllo', 'UTF-8')),
        attempt(fn () => mb_convert_encoding('héllo', 'utf8', 'utf-8')),
        attempt(fn () => mb_convert_encoding('héllo', 'UTF-8', ['UTF-8'])),
        attempt(fn () => mb_convert_encoding(['a' => 'é', 3 => 'x', 'k' => ['n' => 'ü']], 'UTF-8', 'UTF-8')),
        attempt(fn () => mb_convert_encoding('a', 'nope')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', 'nope')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', ['nope'])),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', '')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', [])),
        attempt(fn () => mb_convert_encoding(5, 'UTF-8')),
        attempt(fn () => mb_convert_encoding('', 'UTF-8', 'UTF-8')),
        attempt(fn () => mb_convert_encoding([5, null, true, 1.5], 'UTF-8', 'UTF-8')),
        attempt(fn () => mb_convert_encoding(['a', new Plain(), 'k' => new Text('t'), 'b'], 'UTF-8', 'UTF-8')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', 'UTF-8, utf8')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', 'UTF-8,')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', 'UTF-8, nope')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', ['utf8', 'UTF-8'])),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', ' ')),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', ",\tUTF-8 ,")),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', "UTF-8\n")),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', [''])),
        attempt(fn () => mb_convert_encoding('a', 'UTF-8', [' utf8'])),
        attempt(fn () => mb_convert_encoding('a', [])),
        attempt(fn () => mb_convert_encoding(new Plain(), 'UTF-8')),
        attempt(fn () => mb_convert_encoding(new Text('é'), 'UTF-8')),
    ]);
    $encodings = mb_list_encodings();
    out('mb_list_encodings', $encodings);
    out('mb_encoding_aliases', array_map(fn ($e) => [$e, mb_encoding_aliases($e)], $encodings));
    // The MIME name of each encoding, which mbstring also matches (`mbfl_name2encoding_ex`); false for none.
    out('encodings.mime', array_map(fn ($e) => [$e, mb_preferred_mime_name($e)], $encodings));
    // What every name, alias and MIME name, as given, lower-cased and upper-cased, resolves to: the canonical name
    // `mb_internal_encoding()` reports once it is set to it.
    $resolved = [];
    foreach ($encodings as $e) {
        $mime = mb_preferred_mime_name($e);
        foreach (array_merge([$e], mb_encoding_aliases($e), $mime === false ? [] : [$mime]) as $name) {
            foreach ([$name, strtolower($name), strtoupper($name)] as $variant) {
                mb_internal_encoding($variant);
                $resolved[] = [$variant, mb_internal_encoding()];
            }
        }
    }
    mb_internal_encoding('UTF-8');
    out('encodings.resolve', $resolved);
    out('mb_encoding_aliases.errors', each_call('mb_encoding_aliases', [['nope'], [''], [' UTF-8'], ['UTF-8 '], [[]], [5], [null], ['pass'], ['auto']]));

    // XT-runtime-134: function_exists and class_exists.
    out('function_exists', each_call('function_exists', [
        ['strlen'], ['\\STRLEN'], ['apache_getenv'], ['minus'], ['\\\\strlen'], ['Strpos'], ['filter_var'], ['mb_strlen'], [''], [5], [null],
        [[]], [new Text('strlen')], ['strlen::x'], ['function_exists'], ['class_exists'], ['ctype_digit'],
    ]));
    out('class_exists', each_call('class_exists', [
        ['stdClass'], ['\\stdClass'], ['STDCLASS'], ['XaravelFixture\\PhpdotenvBuiltins\\Plain'], ['xaravelfixture\\phpdotenvbuiltins\\plain'],
        ['XaravelFixture\\PhpdotenvBuiltins\\Suit'], ['RoundingMode'], ['Stringable'], ['ArrayAccess'],
        ['XaravelFixture\\PhpdotenvBuiltins\\Greets'], ['Nope\\Nothing'], ['ArrayObject', false], ['ArrayObject', []], [''], [5], [null],
        [[]], ['\\\\stdClass'], [new Text('stdClass')],
    ]));

    // Every new function's ReflectionFunction counts and its ArgumentCountErrors.
    $new = ['addcslashes', 'class_exists', 'ctype_digit', 'ctype_space', 'filter_var', 'function_exists', 'ltrim', 'mb_convert_encoding',
        'mb_encoding_aliases', 'mb_list_encodings', 'mb_strlen', 'mb_strpos', 'mb_substr', 'ord', 'rtrim', 'str_replace',
        'stripcslashes', 'strpos', 'strtok'];
    out('reflection', array_map(function ($name) {
        $function = new ReflectionFunction($name);
        $refs = [];
        foreach ($function->getParameters() as $index => $parameter) {
            if ($parameter->isPassedByReference()) {
                $refs[] = $index;
            }
        }
        return [$function->getName(), $function->getNumberOfRequiredParameters(), $function->getNumberOfParameters(), $function->isVariadic(), $refs];
    }, $new));
    out('counts', array_map(function ($name) {
        $function = new ReflectionFunction($name);
        $few = $function->getNumberOfRequiredParameters() > 0 ? attempt(fn () => call_user_func_array($name, [])) : null;
        $many = attempt(fn () => call_user_func_array($name, array_fill(0, $function->getNumberOfParameters() + 1, null)));
        return [$few, $many];
    }, $new));
}
