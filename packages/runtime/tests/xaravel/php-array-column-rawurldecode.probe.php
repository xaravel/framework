<?php
// The PHP 8.5.11 evidence for XT-runtime-149..151 (php-array-column-rawurldecode.test.ts), action item
// epic-16-item-1-runtime-array-column-rawurldecode (ESC-16.1-2): array_column, as illuminate/json-schema's Type::enum
// calls it, and rawurldecode, as its Deserializer calls it. Each line is `<label>\t<json_encode(value)>`; the test
// computes every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-array-column-rawurldecode.probe.php > php-array-column-rawurldecode.probe.txt

namespace XaravelFixture\PhpArrayColumn {
    class Row
    {
        public $note = null;
        protected $secret = 's';
        private $hidden = 'h';

        public function __construct(public $id, public $name)
        {
        }

        public function title()
        {
            return 't';
        }
    }

    class Label
    {
        public function __construct(private string $text)
        {
        }

        public function __toString(): string
        {
            return $this->text;
        }
    }

    enum Suit: string
    {
        case Hearts = 'H';
        case Spades = 'S';
    }

    enum Rank: int
    {
        case Ace = 1;
        case King = 13;
    }

    enum Status
    {
        case Active;
        case Inactive;
    }
}

namespace {
    use XaravelFixture\PhpArrayColumn\Label;
    use XaravelFixture\PhpArrayColumn\Rank;
    use XaravelFixture\PhpArrayColumn\Row;
    use XaravelFixture\PhpArrayColumn\Status;
    use XaravelFixture\PhpArrayColumn\Suit;

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

    $rows = [['id' => 3, 'n' => 'a'], ['id' => 5, 'n' => 'b'], ['x' => 1]];

    // XT-runtime-149: a column of arrays, with and without an index.
    out('column', [
        array_column($rows, 'n'),
        array_column($rows, 'n', 'id'),
        array_column($rows, 'id', 'n'),
        array_column($rows, 'x'),
        array_column($rows, 'missing'),
        array_column([], 'n'),
        array_column(['k' => ['n' => 1], 'j' => ['n' => 2]], 'n'),
        array_column([['n' => null], ['n' => false]], 'n'),
        array_column([['n' => ['deep' => 1]]], 'n'),
    ]);

    // XT-runtime-149: whole rows (a null column).
    out('column.whole', [
        array_column($rows, null),
        array_column($rows, null, 'id'),
        array_column($rows, null, 'n'),
        array_column([1, 'x', null, ['id' => 2]], null),
        array_column([1, 'x', null, ['id' => 2]], null, 'id'),
    ]);

    // XT-runtime-149: an int column, and a string one that is numeric.
    out('column.int', [
        array_column([[10, 20], [30]], 1),
        array_column([[10, 20], [30]], '1'),
        array_column([[10, 20], [30]], 0, 1),
        array_column([[10, 20], [30]], '01'),
        array_column([[10, 20], [30]], ' 1'),
        array_column([[10, 20], [30]], 1.7),
        array_column([[10, 20], [30]], true),
        array_column([[10, 20], [30]], false),
        array_column([['1.5' => 'a', 1 => 'b']], '1.5'),
        array_column([['1.5' => 'a', 1 => 'b']], 1.5),
        array_column([['-3' => 'a']], -3),
        array_column([['' => 'e', 0 => 'z']], ''),
        array_column([['NAN' => 'n']], NAN),
        array_column([['INF' => 'i']], INF),
        array_column([['x' => 'l']], new Label('x')),
    ]);

    // XT-runtime-149: rows that are neither arrays nor objects.
    out('column.scalars', [
        array_column([1, 'x', null, true, 2.5, ['n' => 'kept']], 'n'),
        array_column([1, 'x', ['n' => 'kept', 'id' => 4]], 'n', 'id'),
    ]);

    // XT-runtime-149: object rows: public and dynamic properties only, never a method.
    $a = new Row(1, 'one');
    $b = new Row(2, 'two');
    $b->extra = 'dyn';
    $objects = [$a, $b];
    $std = new stdClass();
    $std->{'1'} = 'one';
    $std->n = 'std';
    out('column.objects', [
        array_column($objects, 'name'),
        array_column($objects, 'name', 'id'),
        array_column($objects, 'id', 'name'),
        array_column($objects, 'note'),
        array_column($objects, 'secret'),
        array_column($objects, 'hidden'),
        array_column($objects, 'title'),
        array_column($objects, 'extra'),
        array_column($objects, 'extra', 'name'),
        array_column($objects, 'name', 'secret'),
        array_column([$std], 1),
        array_column([$std], '1'),
        array_column([$std, ['n' => 'arr'], $a], 'n'),
        array_column([$std, ['name' => 'arr'], $a], 'name'),
        array_column([(object) ['k' => 'cast']], 'k'),
        count(array_column($objects, null)),
        array_column($objects, null)[0] === $a,
    ]);

    // XT-runtime-149: enum cases (Type::enum's call).
    out('column.enums', [
        array_column(Suit::cases(), 'value'),
        array_column(Suit::cases(), 'name'),
        array_column(Suit::cases(), 'value', 'name'),
        array_column(Suit::cases(), 'name', 'value'),
        array_column(Rank::cases(), 'value'),
        array_column(Rank::cases(), 'name', 'value'),
        array_column(Status::cases(), 'name'),
        array_column(Status::cases(), 'value'),
        array_column(Suit::cases(), 'cases'),
        array_column(Suit::cases(), 'from'),
    ]);

    // XT-runtime-149: index values as keys.
    out('column.keys', [
        array_column([['v' => 'a', 'k' => null], ['v' => 'b', 'k' => true], ['v' => 'c', 'k' => false]], 'v', 'k'),
        array_column([['v' => 'a', 'k' => 1.9], ['v' => 'b', 'k' => -1.5], ['v' => 'c', 'k' => 0.5]], 'v', 'k'),
        array_column([['v' => 'a', 'k' => '7'], ['v' => 'b', 'k' => '07'], ['v' => 'c', 'k' => '-0'], ['v' => 'd', 'k' => '-8']], 'v', 'k'),
        array_column([['v' => 'a', 'k' => 'x'], ['v' => 'b', 'k' => 'x'], ['v' => 'c', 'k' => 'y']], 'v', 'k'),
        array_column([['v' => 'a', 'k' => 5], ['v' => 'b'], ['v' => 'c', 'k' => 'z'], ['v' => 'd']], 'v', 'k'),
        array_column([['v' => 'a', 'k' => -5], ['v' => 'b']], 'v', 'k'),
        array_column([['v' => 'a'], ['v' => 'b', 'k' => 0], ['v' => 'c']], 'v', 'k'),
        array_column([['v' => 'a', 'k' => Suit::Hearts->value]], 'v', 'k'),
        array_column([['v' => 'a', 'k' => PHP_INT_MAX], ['v' => 'b'], ['v' => 'c', 'k' => 'z']], 'v', 'k'),
        attempt(fn () => array_column([['v' => 'a', 'k' => [1]]], 'v', 'k')),
        attempt(fn () => array_column([['v' => 'a', 'k' => new stdClass()]], 'v', 'k')),
        attempt(fn () => array_column([['v' => 'a', 'k' => Suit::Hearts]], 'v', 'k')),
        attempt(fn () => array_column([['v' => 'a', 'k' => 1], ['v' => 'b', 'k' => []]], 'v', 'k')),
    ]);

    // XT-runtime-149: arguments PHP refuses.
    out('column.bad', [
        attempt(fn () => array_column('x', 'n')),
        attempt(fn () => array_column(null, 'n')),
        attempt(fn () => array_column(new ArrayIterator([]), 'n')),
        attempt(fn () => array_column([], [])),
        attempt(fn () => array_column([], new stdClass())),
        attempt(fn () => array_column([], 'n', [])),
        attempt(fn () => array_column([], 'n', new stdClass())),
        attempt(fn () => array_column([], Suit::Hearts)),
        attempt(fn () => array_column([['a' => 1]], 'a', new Label('a'))),
        attempt(fn () => array_column([], fn () => 'n')),
        attempt(fn () => array_column([], 'n', fn () => 'n')),
    ]);

    // XT-runtime-150: rawurldecode.
    out('rawurldecode', [
        rawurldecode('a%20b+c'),
        rawurldecode('%e2%82%AC'),
        rawurldecode('%'),
        rawurldecode('%zz'),
        rawurldecode('100%'),
        rawurldecode('%41%4'),
        rawurldecode('%4g%41'),
        rawurldecode('%%41'),
        rawurldecode('%2B%25%2b'),
        rawurldecode('%C3%BC/ü'),
        rawurldecode(''),
        rawurldecode('plain'),
        rawurldecode('%00'),
        rawurldecode('%7e%7E'),
        rawurldecode('%23%2F%3F'),
    ]);

    // XT-runtime-150: coercion.
    out('rawurldecode.coercion', [
        rawurldecode(12),
        rawurldecode(true),
        rawurldecode(false),
        rawurldecode(null),
        rawurldecode(1.5),
        rawurldecode(new Label('%41')),
        rawurldecode(0.1),
        rawurldecode(1e100),
        rawurldecode(-0.0),
        attempt(fn () => rawurldecode([])),
        attempt(fn () => rawurldecode(new stdClass())),
        attempt(fn () => rawurldecode(Suit::Hearts)),
    ]);

    // XT-runtime-151: the registry's counts.
    $counts = [];
    foreach (['array_column', 'rawurldecode'] as $name) {
        $reflection = new ReflectionFunction($name);
        $counts[] = [$reflection->getNumberOfRequiredParameters(), $reflection->getNumberOfParameters(), $reflection->isVariadic()];
    }
    out('reflection', $counts);
    $column = 'array_column';
    $decode = 'rawurldecode';
    out('counts', [
        attempt(fn () => $column(...[[]])),
        attempt(fn () => $column(...[])),
        attempt(fn () => $column(...[[], 'a', 'b', 'c'])),
        attempt(fn () => $decode(...[])),
        attempt(fn () => $decode(...['a', 'b'])),
        function_exists('array_column'),
        function_exists('RAWURLDECODE'),
        $column([['n' => 1]], 'n'),
        $decode('%41'),
    ]);
}
