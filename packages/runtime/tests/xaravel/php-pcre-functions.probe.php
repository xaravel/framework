<?php
// The PHP 8.5.11 evidence for XT-runtime-135..138 and 147 (php-pcre-functions.test.ts), action item
// epic-15-item-2-runtime-pcre-functions (ESC-15.2-1 part f, ESC-15.2-5): preg_match, preg_match_all, preg_split,
// preg_replace_callback, preg_last_error and preg_last_error_msg, on the patterns vlucas/phpdotenv v5.7.0 passes them
// and on every conversion form PORTING.md § PCRE conversion lists. Each line is
// `<label>\t<json_encode(argument lists)>\t<json_encode(results)>`: the test reads each argument list, runs the same
// call with the runtime, and compares the JSON of its results with the recorded one. A throw is
// `"<class>: <message>"`. Run with error_reporting=0: PHP's warnings are not raised by the runtime (DIV-9.17).
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-pcre-functions.probe.php > php-pcre-functions.probe.txt

namespace XaravelFixture\PcreFunctions {
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
}

namespace {
    use XaravelFixture\PcreFunctions\Plain;
    use XaravelFixture\PcreFunctions\Text;

    function attempt(callable $fn): mixed
    {
        try {
            return $fn();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
    }

    /** One label: its argument lists, and each list's result through `$run`. */
    function record(string $label, array $calls, callable $run): void
    {
        echo $label, "\t", json_encode($calls), "\t", json_encode(array_map(fn ($args) => attempt(fn () => $run(...$args)), $calls)), "\n";
    }

    /** preg_match with its by-reference matches: [result, matches, preg_last_error(), preg_last_error_msg()]. */
    function pm($pattern, $subject, $flags = 0, $offset = 0): array
    {
        $matches = 'untouched';
        $result = attempt(function () use ($pattern, $subject, &$matches, $flags, $offset) {
            return preg_match($pattern, $subject, $matches, $flags, $offset);
        });
        return [$result, $matches, preg_last_error(), preg_last_error_msg()];
    }

    /** preg_match_all, as pm. */
    function pma($pattern, $subject, $flags = 0, $offset = 0): array
    {
        $matches = 'untouched';
        $result = attempt(function () use ($pattern, $subject, &$matches, $flags, $offset) {
            return preg_match_all($pattern, $subject, $matches, $flags, $offset);
        });
        return [$result, $matches, preg_last_error(), preg_last_error_msg()];
    }

    /** preg_split: [result, preg_last_error()]. */
    function ps($pattern, $subject, $limit = -1, $flags = 0): array
    {
        $result = attempt(fn () => preg_split($pattern, $subject, $limit, $flags));
        return [$result, preg_last_error()];
    }

    /** The callbacks preg_replace_callback is called with, by name. */
    function callback(string $name): mixed
    {
        return match ($name) {
            'json' => fn ($m) => '<' . json_encode($m) . '>',
            'upper' => fn ($m) => strtoupper($m[0]),
            'count' => 'count',
            'int' => fn ($m) => 7,
            'null' => fn ($m) => null,
            'float' => fn ($m) => 1.5,
            'true' => fn ($m) => true,
            'array' => fn ($m) => [1],
            'text' => fn ($m) => new Text('t'),
            'plain' => fn ($m) => new Plain(),
            'throw' => function ($m) {
                throw new Exception('boom');
            },
            'invalid' => 'nope',
            // Loader/Resolver.php's callback over a repository holding A.B and A.
            'resolve' => fn ($m) => ['A.B' => 'v1', 'A' => 'v2'][$m[1]] ?? $m[0],
        };
    }

    /** preg_replace_callback with its by-reference count: [result, count, preg_last_error()]. */
    function prc($pattern, $subject, $limit = -1, $flags = 0, $name = 'json'): array
    {
        $count = 'untouched';
        $result = attempt(function () use ($pattern, $name, $subject, $limit, &$count, $flags) {
            return preg_replace_callback($pattern, callback($name), $subject, $limit, $count, $flags);
        });
        return [$result, $count, preg_last_error()];
    }

    // The patterns phpdotenv v5.7.0 passes to preg_*, as its source spells them.
    // Parser/Lexer.php:13,43.
    const PATTERNS = [
        '[\r\n]{1,1000}', '[^\S\r\n]{1,1000}', '\\\\', '\'', '"', '\\#', '\\$', '([^(\s\\\\\'"\\#\\$)]|\\(|\\)){1,1000}',
    ];
    $lexer = '(('.\implode(')|(', PATTERNS).'))A';
    // Parser/EntryParser.php:142,146,218.
    $name = '~\A[a-zA-Z0-9_.]+\z~';
    $unicodeName = '~\A[\p{Ll}\p{Lu}\p{M}\p{N}_.]+\z~u';
    $literal = '~\A(?|([^\s\\\\\'"#$]{1,1000})|\'([^\']*)\'|"([^"\\\\$]*)")\z~';
    // Parser/Lines.php:118, Parser/Parser.php:25, Loader/Resolver.php:69.
    $quote = '/(?=([^\\\\]"))/';
    $lines = "/(\r\n|\n|\r)/";
    $variable = '/\A\${([a-zA-Z0-9_.]+)}/';

    $subjects = [
        'FOO', 'plain', 'é', "\u{a0}", "\u{feff}", "a\r\nb", "\r\n", 'a\\b', '\\', "'q'", '"q"', "'it''s'", '"a\\"b"', '"a$b"', 'a#b',
        '#', 'a$b', '$', '${A.B}', '${A.B}${C}', 'x${A}', ' x ', "a\tb", '', str_repeat('a', 1000), str_repeat('a', 1001),
        str_repeat('é', 500) . 'a', "'" . str_repeat('a', 1001) . "'", '"é"', 'Ａ', 'ä', "a\u{0308}", '٣', 'foo.bar', 'FOO_BAR', '1A',
        'a b', "a\n", '"', "'", 'a"b', 'a\\"b', "\u{a0}x\u{a0}", "(a)", "\u{feff}FOO",
    ];
    $env = "APP_NAME=\"My App\"\n# comment\nEMPTY=\nQUOTED='single \\'q\\''\nSPACED = value with spaces # trailing\r\n"
        . "NBSP=a\u{a0}b\nBOM=\u{feff}x\nMULTI=\"line1\nline2\"\nNESTED=\${APP_NAME}/x\nDOLLAR=\\\$HOME\n\tTAB=(x)\nUTF=héllo wörld\n"
        . str_repeat('a', 1001) . "=" . str_repeat('é', 501) . "\n";

    // XT-runtime-135: preg_match, the conversion forms, the modifiers and the errors.
    record('preg_match.basic', [
        ['/(a)(b)?(c)?/', 'a'], ['/(a)(b)?(c)?/', 'a', 256], ['/(a)(b)?(c)?/', 'a', 512], ['/(a)(b)?(c)?/', 'a', 768],
        ['/(a)?(b)?(c)/', 'c'], ['/(a)?(b)?(c)/', 'c', 512], ['/(a)?(b)?(c)/', 'c', 256],
        ['/(?<x>a)(?<y>b)?(c)?/', 'a'], ['/(?<x>a)(?<y>b)?(c)?/', 'a', 256], ['/(?<x>a)(?<y>b)?(c)?/', 'a', 512],
        ['/(?<x>a)(?<y>b)?(c)?/', 'a', 768], ['/(?<x>a)(?<y>b)?(c)/', 'ac'], ['/(?P<first>\w+) (?\'second\'\w+)/', 'hello world'],
        ['/b/', 'abcb', 0, 2], ['/b/', 'abcb', 256, 2], ['/b/', 'abcb', 0, -1], ['/b/', 'abcb', 0, -2], ['/b/', 'abcb', 256, -10],
        ['/b/', 'abcb', 0, 4], ['/b/', 'abcb', 0, 5], ['/^b/', 'ab', 0, 1], ['/\Ab/', 'ab', 0, 1], ['/(?<=a)b/', 'ab', 0, 1],
        ['/é/', 'aéb', 256], ['/é/u', 'aéb', 256], ['/b/u', 'éb', 256, 2], ['/./u', '😀a', 256, 4], ['/./', '😀a', 256, 4],
        ['/(x)|y/', 'y', 512], ['/(x)|(y)/', 'y'], ['/(x)|(y)/', 'y', 256], ['/a/', 'b'], ['/a/', 'b', 256], ['/a/', 'a', 1024],
        ['/a/', 'a', 0, '1'], ['/a/', 'a', '256', 0], ['/(a)|b/', 'b'], ['/(a)|b/', 'b', 768], ['/()/', 'x'], ['/(a*)/', 'b', 256],
        ['/(?:(a)|b)c/', 'bc'], ['/(?:x(a)|b)?c/', 'c', 512], ['/a/', 5], ['/5/', 15], ['/1/', true], ['/^$/', null],
    ], 'pm');
    record('preg_match.forms', [
        // Delimiters.
        ['#a/b#', 'a/b'], ['~a~i', 'A'], ['{a{1,2}}', 'aa'], ['(a(b))', 'ab'], ['[a]', 'a'], ['<a>i', 'A'], ['  /a/', 'a'],
        ["\n\t/a/", 'a'], ['/a\/b/', 'a/b'], ['#a\#b#', 'a#b'], ['/a/ i', 'A'], ["/a/i\n\r", 'A'], ['!a!', 'a'], ['/a/SX', 'a'],
        ['/a/A', 'ba'], ['/a/A', 'ab'], ['%a%', 'a'], ['{a\}}', 'a}'], ['(a\))', 'a)'], ['((a)|(b))', 'b'],
        // Anchors.
        ['/a$/', "a\n"], ['/a$/D', "a\n"], ['/a$/m', "a\nb"], ['/^b/m', "a\nb"], ['/^b/', "a\nb"], ['/a\z/', "a\n"], ['/\Aa/m', "b\na"],
        ['/a$/', "a\n\n"], ['/a$/mD', "a\nb"], ['/^$/m', "a\n"], ['/a$/', "a\r\n"], ['/\Ab\z/m', "a\nb"],
        // The dot.
        ['/a.b/', "a\nb"], ['/a.b/s', "a\nb"], ['/a.b/', "a\rb"], ['/^.$/', 'é'], ['/^.$/u', 'é'], ['/^..$/', 'é'], ['/^.{2}$/', 'é'],
        ['/^.$/u', '😀'], ['/^.{4}$/', '😀'], ['/^.$/su', "\n"],
        // Escapes and literals.
        ['/\#\$/', '#$'], ['/\x41\x{42}/', 'AB'], ['/\xe9/', 'é'], ['/\xc3\xa9/', 'é'], ['/\x{e9}/u', 'é'], ['/\x{1F600}/u', '😀'],
        ['/\xA/', "\n"], ['/\a\e\f\n\r\t/', "\x07\x1b\f\n\r\t"], ['/\0/', "\0"], ['/\012/', "\n"], ['/\0101/', "\x081"],
        ['/a{/', 'a{'], ['/a{1,/', 'a{1,'], ['/x{}/', 'x{}'], ['/x{,}/', 'x{,}'], ['/a{,2}b/', 'aab'], ['/a{ 1 , 2 }/', 'aa'],
        ['/a{1 ,2}/', 'aa'], ['/a}/', 'a}'], ['/a{2}/', 'aaa'], ['/a{2,}/', 'aaaa'], ['/a{x}/', 'a{x}'], ['/a+?/', 'aa'],
        ['/a??b/', 'ab'], ['/a{1,2}?/', 'aa'], ['/(?:ab)+/', 'abab'], ['/(?=b)/', 'ab'], ['/a(?!b)/', 'abac'], ['/(?<=a)b/', 'ab'],
        ['/(?<!a)b/', 'ab'], ['/(?<=a|bc)d/', 'bcd'], ['/(?<=a{300})c/', str_repeat('a', 300) . 'c'], ['/(?<=a{1,255})c/', 'ac'],
        ['/(?<=\b)a/', 'a'], ['/a|b|/', 'c'], ['/(a|)b/', 'b'], ['/\//', '/'], ['/a\.b\*c/', 'a.b*c'], ['/\é/', 'é'], ['/\é/u', 'é'],
        ['/\-\]\}\{\!/', '-]}{!'], ["/a\0b/", "a\0b"], ['/(a)\x{29}/', 'a)'], ['/é+/', 'éé'], ['/é+/u', 'éé'],
        // Classes.
        ['/(?<é>a)/u', 'a'], ['/(?<nä_1>a)/u', 'a'], ['/a\E/', 'a'], ['/a\E+/', 'aa'], ['/[a\E]/', 'a'], ['/\x{000000041}/', 'A'],
        ['/[]a]+/', ']a]'], ['/[^]a]/', ']ab'], ['/[a-]/', '-'], ['/[-a]+/', 'a-'], ['/[\]]/', ']'], ['/[\\\\]/', '\\'],
        ['/[\d\s]+/', '1 2'], ['/[\x41-\x43]+/', 'ABCD'], ['/[[:alpha:]]+/', 'ab1'], ['/[[:^digit:]]+/', 'ab1'],
        ['/[[:space:]]+/', " \t\x0b"], ['/[[:punct:]]+/', '!?a'], ['/[[:alnum:][:blank:]]+/', 'a b!'], ['/[a[]+/', '[a'],
        ['/[[:upper:]]+/i', 'aB'], ['/[[:word:]]+/', 'a_1-'], ['/[[:xdigit:]]+/', 'fFg'], ['/[[:cntrl:]]/', "a\x7f"],
        ['/[[:graph:]]+/', 'a! b'], ['/[[:print:]]+/', "a b\t"], ['/[[:lower:]]+/', 'aB'], ['/[[:ascii:]]+/', 'aé'],
        ['/[\w.]+/', 'a.b c'], ['/[\W]+/', 'a!?b'], ['/[\D]+/', '1ab2'], ['/[^\d]+/', '1ab2'], ['/[\b]/', "a\x08"],
        ['/[\x{e9}]/u', 'é'], ['/^[é]+$/', 'é'], ['/[é]/u', 'é'], ['/[à-é]+/u', 'àéè'], ['/[\\-]/', '-'], ['/[a\-z]+/', '-az'],
        ['/[%--]+/', '%,-'], ['/[\n-\r]+/', "\n\r"], ['/[\0-\x08]/', "\x05"], ['/[\$\#]+/', '#$'], ['/[.]/', 'a.'], ['/[*+?]/', 'a+'],
        // Whitespace with and without u.
        ['/\s/', "\u{a0}"], ['/\s/', "\u{85}"], ['/\s/u', "\u{85}"], ['/\s/u', "\u{a0}"], ['/\s/u', "\u{feff}"], ['/\s/u', "\u{180e}"],
        ['/\S/u', "\u{feff}"], ['/\S+/', "\u{a0}"], ['/[^\S\r\n]+/', " \t\r\n"], ['/[^\S\r\n]+/u', "\u{a0}\u{2003}\n"],
        ['/\s+/', "\x0b\x0c"], ['/[\s]+/u', "\u{3000}\u{feff}"], ['/[\S]+/u', "\u{feff}a "], ['/[^\s]+/', "\u{a0} "],
        // Properties.
        ['/^\p{Ll}+$/u', 'éa'], ['/^\p{Lu}/u', 'É'], ['/\p{M}/u', "a\u{0308}"], ['/\p{N}+/u', '٣4'], ['/\pL+/u', 'éa1'],
        ['/\p{^L}/u', 'a1'], ['/\PL/u', 'a1'], ['/\P{^L}/u', '1a'], ['/\p{ll}/u', 'a'], ['/\p{L&}/u', 'a'], ['/\p{Ll}/', 'é'],
        ['/\p{Lu}/', 'aA'], ['/[\p{Lu}\p{Nd}]+/u', 'aB1'], ['/[^\p{L}]+/u', 'é12'], ['/\p{ Lu }/u', 'A'], ['/\p{Nd}/u', '٣'],
        // Case-insensitive.
        ['/abc/i', 'ABC'], ['/[a-c]+/i', 'ABC'], ['/é/iu', 'É'], ['/\x{e9}/iu', 'É'], ['/k/iu', "\u{212a}"], ['/[^a]/i', 'A'],
        ['/\w+/i', 'aB'], ['/[[:lower:]]+/i', 'AB'],
    ], 'pm');
    record('preg_match.esc-15.2-5', [
        ['(a)A', 'ba', 0, 1], ['(a)A', 'ba', 0, 0], [$literal, "'ab'"], [$literal, '"ab"'], [$literal, 'ab'],
        ['/[^\S\r\n]{1,1000}/', "\u{a0}"], ['/\s/u', "\u{feff}"], ['/^.{2}$/', 'é'],
    ], 'pm');
    record('preg_match.errors', [
        ['/abc', 'a'], ['abc', 'a'], ['\\abc\\', 'a'], ["\0abc\0", 'a'], ['', 'a'], [" \t\n", 'a'], ['/a/c', 'a'], ['/a/e', 'a'],
        ["/a/\0", 'a'], ['(a', 'a'], ['{a', 'a'], ['(a(b)', 'a'], ['/(a/', 'a'], ['/a)/', 'a'], ['/[a/', 'a'], ['/a{2,1}/', 'a'],
        ['/a{70000}/', 'a'], ['/\i/', 'i'], ['/a**/', 'a'], ['/*a/', 'a'], ['/^*/', 'a'], ['/a|*b/', 'a'],
        ['/\x/', 'a'], ['/\x{}/', 'a'], ['/\x{100}/', 'a'], ['/\xZ/', 'a'], ['/[z-a]/', 'a'], ['/[\d-z]/', 'a'], ['/[a-\d]/', 'a'],
        ['/(?<n>a)(?<n>b)/', 'ab'], ['/(?<1n>a)/', 'a'], ['/(?<a$>a)/', 'a'], ['/(?<=a+)b/', 'ab'], ['/(?<=a{1,300})b/', 'ab'],
        ['/(?Z)/', 'a'], ['/[[.a.]]/', 'a'], ['/[[=a=]]/', 'a'], ['/[[:nope:]]/', 'a'], ['/\\/', 'a'], ['/a\\', 'a'], ['/\m/', 'm'],
        ['/[\B]/', 'B'], ['/\b*/', 'a'], ['/$+/', 'a'], ['/(?<n/', 'a'], ['/a{1,2}{3}/', 'a'], ['/\p{Lu/u', 'A'],
        ['/\l/', 'l'], ['/\L/', 'L'], ['/\u/', 'u'], ['/\U/', 'U'], ['/[\N]/', 'N'], ['/[:alpha:]/', 'a'], ['/[.a.]/', 'a'],
        ['/[=a=]/', 'a'], ['/\p{}/u', 'a'], ['/\p{^}/u', 'a'], ['/(?<é>a)/', 'a'],
        ['/a/', 'a', 0, 2], ['/./u', 'é', 0, 1], ['/./u', 'é', 0, -1], ['/x/', 'é', 0, 1], ['/a/u', 'é', 0, 3], ['/a/', '', 0, 1],
        ['/a/', 'a', 1], ['/a/', 'a', 2], ['/a/', 'a', 257], ['/a(/', 'a', 1],
    ], 'pm');
    // A failing call then a successful one: the second resets the code, for each function.
    record('preg_match.sequence', [['preg_match'], ['preg_match_all'], ['preg_split'], ['preg_replace_callback']], function ($fn) {
        $run = fn ($pattern) => match ($fn) {
            'preg_match' => preg_match($pattern, 'é', $m, 0, 0),
            'preg_match_all' => preg_match_all($pattern, 'é', $m),
            'preg_split' => preg_split($pattern, 'é'),
            'preg_replace_callback' => preg_replace_callback($pattern, fn ($m) => 'x', 'é'),
        };
        $out = [];
        foreach (['/a', '/a/', '/(/', '/é/u'] as $pattern) {
            $out[] = [$run($pattern), preg_last_error(), preg_last_error_msg()];
        }
        $out[] = [preg_match('/./u', 'é', $m, 0, 1), preg_last_error(), preg_last_error_msg()];
        $out[] = [$run('/./u'), preg_last_error(), preg_last_error_msg()];
        return $out;
    });
    record('preg_match.arguments', [
        [[], 'a'], ['/a/', []], ['/a/', 'a', 'x'], ['/a/', 'a', 0, 'x'], ['/a/', 'a', 0, 1.5], ['/a/', 'a', null, null],
    ], 'pm');
    // PCRE's \s and \S with and without u, over every code point (and every ASCII byte), as the code points matched
    // and the number of runs of the complement.
    record('preg_match.space', [
        ['/\s/u', '/\S+/u'], ['/[\s]/u', '/[\S]+/u'], ['/[^\S]/u', '/[^\s]+/u'], ['/\s/', '/\S+/'], ['/[^\S\r\n]/', '/[\S\r\n]+/'],
        ['/[^\S\r\n]/u', '/[\S\r\n]+/u'],
    ], function ($pattern, $complement) {
        $all = '';
        for ($c = 0; $c <= 0x10FFFF; $c++) {
            if ($c < 0xD800 || $c > 0xDFFF) {
                $all .= mb_chr($c, 'UTF-8');
            }
        }
        preg_match_all($pattern, $all, $matches);
        $runs = preg_match_all($complement, $all);
        return [array_map(fn ($m) => dechex(mb_ord($m, 'UTF-8')), $matches[0]), $runs, preg_last_error()];
    });
    record('phpdotenv.isValidName', array_map(fn ($s) => [$s], $subjects), fn ($s) => [pm($name, $s), pm($unicodeName, $s)]);
    record('phpdotenv.parseLiteral', array_map(fn ($s) => [$literal, $s], $subjects), 'pm');
    // Parser/Lexer.php's loop: the pattern at each byte offset, anchored by A.
    record('phpdotenv.lexer', array_map(fn ($s) => [$lexer, $s], array_merge($subjects, [$env])), function ($regex, $content) {
        $tokens = [];
        $offset = 0;
        while (isset($content[$offset])) {
            if (\preg_match($regex, $content, $matches, 0, $offset) !== 1) {
                throw new \Error(\sprintf('Lexer encountered unexpected character [%s].', $content[$offset]));
            }
            $offset += \strlen($matches[0]);
            $tokens[] = $matches[0];
        }
        return $tokens;
    });
    // Validator.php:144's check that a user pattern compiles, and a match with it.
    record('phpdotenv.validator', [
        ['/^[a-z]+$/', 'abc'], ['/[/', 'a'], ['abc', 'a'], ['/a/k', 'a'], ['', 'a'], ['/(/', 'a'], ['~^\d+$~', '12'],
        ['#^(true|false)$#i', 'TRUE'], ['{^\w+\z}', "a\n"], ['/^(?:dev|prod)$/', 'prod'],
    ], fn ($regex, $value) => [@\preg_match($regex, '') === false && \preg_last_error() === \PREG_INTERNAL_ERROR, pm($regex, $value)]);

    // XT-runtime-136: preg_match_all and preg_split.
    $all = [];
    foreach ([0, 1, 2, 257, 258, 513, 514, 769, 770] as $flags) {
        $all[] = ['/a(b)?/', 'abaab', $flags];
        $all[] = ['/(?<k>\w)(\d)?/', 'a1b', $flags];
        $all[] = ['/x*/', 'axb', $flags];
        $all[] = ['/(z)?/', '', $flags];
        $all[] = ['/z/', 'abc', $flags];
    }
    record('preg_match_all', array_merge($all, [
        ['/x*?/', 'axb'], ['/a|/', 'bab'], ['/(?=a)/', 'aba', 256], ['//', 'ab'], ['//u', 'éa', 256], ['//', 'é', 256], ['/./u', 'é😀a', 256],
        ['/a/', 'aaa', 1, 1], ['/a/', 'baaa', 2, -2], ['/a/A', 'aab'], ['/a/A', 'baa'], ['/a*/A', 'aab'], ['/$/m', "a\nb\n"], ['/^/m', "\n\n"],
        ['/\b/', 'ab cd'], ['/(?<=a)/', 'aaa'], ['/x*/u', 'é😀'], ['/a/', 'a', 0, 2], ['/./u', 'é', 0, 1], ['/(/', 'a'],
        ['/a/', 'a', 3], ['/a/', 'a', 259], ['/a/', 'a', 4], ['/a/', 'a', 1024], [$quote, 'a"b"c'], [$quote, '"a\"'], [$quote, '"'],
    ]), 'pma');
    $splits = [];
    foreach ([['/,/', 'a,b,,c,'], ['/(,)/', 'a,b,,c,'], ['/(-)|(\+)/', 'a-b+c'], ['//', 'abc'], ['/x*/', 'axb'], ['//u', 'aé'],
        ['/(\d)/', '1a1'], [$lines, "a\r\nb\nc\rd\n"], ['/ /', ''], ['/[/', 'a'], ['/(a)?b/', 'xbyab']] as [$pattern, $subject]) {
        foreach ([-1, 0, 1, 2, -2, 3] as $limit) {
            foreach ([0, 1, 2, 4, 3, 7] as $flags) {
                $splits[] = [$pattern, $subject, $limit, $flags];
            }
        }
    }
    record('preg_split', array_merge($splits, [
        ['/é/', 'aéb', -1, 4], ['/a/', 'é', -1, 4], ['//', 'ab', -1, 1], ['/\s*/', 'a b'], ['/(?=b)/', 'abab'],
        ['/b/', 'abc', null, null], ['/b/', 'abc', '2', '0'], ['/b/', [], -1, 0],
    ]), 'ps');
    // '"é"' is left out: its capture `[^\\\\]"` takes the last byte of é alone, which JS cannot hold.
    record('phpdotenv.lines', array_map(fn ($s) => [$quote, str_replace('\\\\', '', $s)], array_merge(array_values(array_diff($subjects, ['"é"'])), [
        'FOO="bar', 'baz"', '"', 'a\\"b"', 'x" y"', '\\"',
    ])), 'pma');
    // Util/Regex.php:51's occurrences: preg_match_all with no $matches.
    record('phpdotenv.occurrences', array_map(fn ($s) => [$quote, str_replace('\\\\', '', $s)], array_merge($subjects, [
        'FOO="bar', 'baz"', '"', 'a\\"b"', 'x" y"', '\\"', 'FOO="é',
    ])), fn ($pattern, $subject) => [@preg_match_all($pattern, $subject), preg_last_error()]);
    record('phpdotenv.parser', [[$lines, $env], [$lines, "A=1\r\nB=2\rC=3\n\nD"], [$lines, ''], [$lines, "\r\n\r\n"]], 'ps');

    // XT-runtime-137: preg_replace_callback.
    $replaces = [];
    foreach ([-1, 0, 1, 2, -2] as $limit) {
        foreach ([0, 256, 512, 768] as $flags) {
            $replaces[] = ['/a(b)?(c)?/', 'xabyaz', $limit, $flags];
            $replaces[] = ['/x*/', 'axb', $limit, $flags];
        }
    }
    record('preg_replace_callback', array_merge($replaces, [
        ['/x*?/', 'axb'], ['/a|/', 'bab'], ['/(?=a)/', 'aba'], ['//u', 'éa'], ['//', 'ab'], ['/é/', 'aéb'], ['/(?<n>b)/', 'abc'],
        ['/(?<n>b)(c)?/', 'abc', -1, 768], [['/a/', '/b/'], 'ab', -1, 0, 'upper'], [['k' => '/a/', 'm' => '/A/'], 'ab', -1, 0, 'json'],
        ['/a/', ['k' => 'a', 'm' => 'ba'], -1, 0, 'upper'], ['/a/', [3 => 'a', 7 => 'xa'], -1, 0, 'upper'], ['/a/', ['k' => 'a', 'm' => 'ba'], 1],
        ['/[/', ['k' => 'a'], -1, 0, 'upper'], [['/a/', '/[/'], 'a'], [['/a/', '/[/'], ['k' => 'a', 'm' => 'b']], ['/a/', [1, true, null, 'a']],
        ['/A/', ['k' => []], -1, 0, 'upper'], ['/abc', 'a'], ['/a/', 'a', -1, 0, 'count'], ['/a(b)/', 'ab', -1, 0, 'count'],
        ['/a/', 'aa', -1, 0, 'int'], ['/a/', 'aa', -1, 0, 'null'], ['/a/', 'aa', -1, 0, 'float'], ['/a/', 'aa', -1, 0, 'true'],
        ['/a/', 'aa', -1, 0, 'array'], ['/a/', 'aa', -1, 0, 'text'], ['/a/', 'aa', -1, 0, 'plain'], ['/a/', 'aa', -1, 0, 'throw'],
        ['/z/', 'aa', -1, 0, 'throw'], ['/a/', 'a', -1, 0, 'invalid'], [5, '5'], ['/a/', 5, -1, 0, 'upper'], [[], 'a'], ['/a/', 'a', 'x'],
        ['/a/', 'é', -1, 0, 'upper'], ['/./u', 'éa', -1, 256], ['/b/', 'éb', -1, 256], ['/\s/', "a b\u{a0}c"], ['/\s/u', "a b\u{a0}c\u{feff}"],
        ['/a/', 'aaa', '2', '0'], ['/a/', 'aaa', null, null],
    ]), 'prc');
    record('phpdotenv.resolver', array_map(fn ($s) => [$variable, $s, 1, 0, 'resolve'], array_merge($subjects, [
        '${A}', '${A}${A.B}', '${B}', '${A.B} ${A}', '$A', '${}', '${A-B}', '${A.B', "\${A}\n",
    ])), 'prc');

    // XT-runtime-147: one pattern string used by calls nested in a preg_replace_callback callback, one after another,
    // and failing twice, as the runtime's compiled-pattern cache serves them (decisions/MAINT-2026-10-30-epic-15-items.md).
    record('cache.interleaved', [['global'], ['sticky'], ['retry'], ['offsets'], ['nested-replace'], ['failure']], function ($case) {
        $inner = [];
        switch ($case) {
            case 'global':
                $outer = preg_replace_callback('/a/', function ($m) use (&$inner) {
                    $inner[] = [preg_match_all('/a/', 'aaa', $all), $all, preg_split('/a/', 'bab'), preg_match('/a/', 'zza', $one, 0, 1), $one];
                    return 'X';
                }, 'xaya', -1, $count);
                return [$outer, $count, $inner, preg_last_error()];
            case 'sticky':
                $outer = preg_replace_callback('/a/A', function ($m) use (&$inner) {
                    $inner[] = [preg_match('/a/A', 'ba', $one, 0, 1), $one, preg_match_all('/a/A', 'aaba', $all), $all];
                    return 'X';
                }, 'aab', -1, $count);
                return [$outer, $count, $inner, preg_last_error()];
            case 'retry':
                $outer = preg_replace_callback('/x*/', function ($m) use (&$inner) {
                    $inner[] = preg_split('/x*/', 'axb');
                    return '[' . $m[0] . ']';
                }, 'axb', -1, $count);
                return [$outer, $count, $inner, preg_last_error()];
            case 'offsets':
                $first = preg_match('/b/', 'abcb', $m1, PREG_OFFSET_CAPTURE, 3);
                $second = preg_match('/b/', 'abcb', $m2, PREG_OFFSET_CAPTURE);
                return [$first, $m1, $second, $m2, preg_last_error()];
            case 'nested-replace':
                $outer = preg_replace_callback('/a/', function ($m) {
                    $result = preg_replace_callback('/a/', fn ($m) => 'Y', 'aba', -1, $c);
                    return $result . $c;
                }, 'xaya', -1, $count);
                return [$outer, $count, preg_last_error()];
            default:
                $out = [];
                $out[] = [preg_match('/(/', 'a'), preg_last_error()];
                $out[] = [preg_match('/(/', 'a'), preg_last_error()];
                $out[] = [preg_match('/a/', 'a'), preg_last_error()];
                $out[] = [preg_split('/(/', 'a'), preg_last_error()];
                $out[] = [preg_match_all('/(/', 'a'), preg_last_error()];
                $out[] = [preg_replace_callback('/(/', fn ($m) => 'x', 'a'), preg_last_error()];
                $out[] = [preg_replace_callback(['/a/', '/(/'], fn ($m) => 'x', 'a'), preg_last_error()];
                return $out;
        }
    });

    // XT-runtime-138: every new function's ReflectionFunction counts and its ArgumentCountErrors.
    $new = ['preg_last_error', 'preg_last_error_msg', 'preg_match', 'preg_match_all', 'preg_replace_callback', 'preg_split'];
    record('reflection', array_map(fn ($n) => [$n], $new), function ($name) {
        $function = new ReflectionFunction($name);
        $refs = [];
        foreach ($function->getParameters() as $index => $parameter) {
            if ($parameter->isPassedByReference()) {
                $refs[] = $index;
            }
        }
        return [$function->getName(), $function->getNumberOfRequiredParameters(), $function->getNumberOfParameters(), $function->isVariadic(), $refs];
    });
    record('counts', array_map(fn ($n) => [$n], $new), function ($name) {
        $function = new ReflectionFunction($name);
        $few = $function->getNumberOfRequiredParameters() > 0 ? attempt(fn () => call_user_func_array($name, [])) : null;
        $many = attempt(fn () => call_user_func_array($name, array_fill(0, $function->getNumberOfParameters() + 1, null)));
        return [$few, $many];
    });
    record('constants', [[]], fn () => [PREG_PATTERN_ORDER, PREG_SET_ORDER, PREG_OFFSET_CAPTURE, PREG_UNMATCHED_AS_NULL, PREG_SPLIT_NO_EMPTY,
        PREG_SPLIT_DELIM_CAPTURE, PREG_SPLIT_OFFSET_CAPTURE, PREG_NO_ERROR, PREG_INTERNAL_ERROR, PREG_BACKTRACK_LIMIT_ERROR,
        PREG_RECURSION_LIMIT_ERROR, PREG_BAD_UTF8_ERROR, PREG_BAD_UTF8_OFFSET_ERROR, PREG_JIT_STACKLIMIT_ERROR]);
}
