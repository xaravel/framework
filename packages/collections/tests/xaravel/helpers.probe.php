<?php
// PHP 8.5.11 executable evidence for XT-collections-17 (the global helpers `data_fill`, `data_set`, `data_forget`,
// `head`, `last` and `when`, epic-14-item-19). It loads Upstream's own `helpers.php` at the Pin, with a small autoloader
// over the Pin's `src/Illuminate`, so every value below is Laravel 13.37.0's. Run with error_reporting=0: PHP's
// notices are not raised by the port (DIV-9.17). Each line is `<label>\t<json>`; a by-reference helper's line is
// [its result, the target afterwards], and an object target is written as its properties (or an ArrayObject's copy).
// Regenerate with: php -d error_reporting=0 helpers.probe.php > helpers.probe.txt
error_reporting(0);
$src = __DIR__ . '/../../../../conformance/upstream/framework/src/Illuminate';
spl_autoload_register(function ($class) use ($src) {
    $relative = str_replace('\\', '/', $class);
    foreach ([
        'Illuminate/Support/Traits/' => ['Collections/Traits/', 'Macroable/Traits/', 'Conditionable/Traits/'],
        'Illuminate/Contracts/' => ['Contracts/'],
        'Illuminate/Support/' => ['Collections/', 'Conditionable/'],
    ] as $prefix => $dirs) {
        if (str_starts_with($relative, $prefix)) {
            foreach ($dirs as $dir) {
                $file = $src . '/' . $dir . substr($relative, strlen($prefix)) . '.php';
                if (is_file($file)) {
                    require $file;
                    return;
                }
            }
        }
    }
});
require $src . '/Collections/helpers.php';

function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function shape($value) {
    return match (true) {
        $value instanceof ArrayObject => ['ArrayObject' => $value->getArrayCopy()],
        $value instanceof ArrayIterator => ['ArrayIterator' => $value->getArrayCopy()],
        $value instanceof Illuminate\Support\Collection => ['Collection' => $value->all()],
        $value instanceof Magic => ['Magic' => $value->dump()],
        $value instanceof Box => ['Box' => $value->dump()],
        default => $value,
    };
}
// A class whose properties are all magic: every access is logged.
class Magic {
    public $log = [];
    private $data;
    public function __construct(array $data = []) { $this->data = $data; }
    public function __get($key) { $this->log[] = "get $key"; return $this->data[$key] ?? null; }
    public function __set($key, $value) { $this->log[] = "set $key"; $this->data[$key] = $value; }
    public function __isset($key) { $this->log[] = "isset $key"; return isset($this->data[$key]); }
    public function __unset($key) { $this->log[] = "unset $key"; unset($this->data[$key]); }
    public function dump() { return ['log' => $this->log, 'data' => $this->data]; }
}
// A userland ArrayAccess that is not Traversable, with public and non-public state.
class Box implements ArrayAccess {
    public $pub;
    protected $prot = 2;
    private $priv = 3;
    private $items = [];
    public function __construct($pub = 1) { $this->pub = $pub; }
    public function offsetExists($offset): bool { return isset($this->items[$offset]); }
    public function offsetGet($offset): mixed { return $this->items[$offset] ?? null; }
    public function offsetSet($offset, $value): void { $this->items[$offset] = $value; }
    public function offsetUnset($offset): void { unset($this->items[$offset]); }
    public function dump() { return [$this->pub, $this->prot, $this->priv, $this->items]; }
}
function posts() {
    return ['posts' => [
        (object) ['comments' => [(object) ['name' => 'First', 'comment' => 'foo'], (object) []]],
        (object) ['comments' => [(object) [], (object) ['name' => 'Second', 'comment' => 'bar']]],
    ]];
}
function attempt($fn) { try { return $fn(); } catch (Throwable $e) { return get_class($e) . ': ' . $e->getMessage(); } }
function set($target, $key, $value, ...$overwrite) { $result = data_set($target, $key, $value, ...$overwrite); return [shape($result), shape($target)]; }
function fill($target, $key, $value) { $result = data_fill($target, $key, $value); return [shape($result), shape($target)]; }
function forget($target, $key) { $result = data_forget($target, $key); return [shape($result), shape($target)]; }

out('set-overwrite', [
    set(['a' => ['b' => 1]], 'a.b', 2),
    set(['a' => ['b' => 1]], ['a', 'c'], 3),
    set(['a' => ['b' => 1]], 'x.y', 4),
    set(['a' => ['b' => 1]], 'a.b', 9, false),
    set(['a' => ['b' => 1]], 'a.c', 9, false),
    set(['a' => 'text'], 'a.b', 5),
    set([], 'a', ['n' => 1]),
    set([1, 2], '1', 'x'),
    set([1, 2], 2, 'y'),
]);
out('set-wildcard', [
    set([[], []], '*.x', 1),
    set([['x' => 0], ['y' => 0]], '*.x', 1, false),
    set([1, 2], '*', 5),
    set([1, 2], '*', 5, false),
    set(['a' => ['p' => ['v' => 1], 'q' => ['v' => 2]]], 'a.*.v', 0),
    set('abc', '*', 1),
    set(5, '*.x', 1),
    set(null, '*', 1),
]);
out('set-scalar', [
    set(null, 'a.b', 1),
    set('text', 'a', 1),
    set(false, 'a', 1, false),
    set(7, 'a.b', 1, false),
]);
$std = new stdClass;
$std->x = 1;
$std->n = null;
$nested = new stdClass;
$nested->inner = new stdClass;
$ao = new ArrayObject(['a' => ['b' => 1]]);
out('set-objects', [
    set(new stdClass, 'a.b', 1),
    set(clone $std, 'x', 2),
    set(clone $std, 'x', 2, false),
    set(clone $std, 'n', 3, false),
    set(clone $std, 'n.m', 3),
    set($nested, 'inner.deep.leaf', 'v'),
    set(['o' => new stdClass], 'o.p', 1),
    set(new ArrayObject([]), 'k', 1),
    set(new ArrayObject(['k' => 1]), 'k', 2, false),
    set($ao, 'a.b', 2),
    set(new ArrayObject([]), 'm.n', 1),
    set(new ArrayObject([1, 2]), '*', 0),
    set(new ArrayObject([['x' => 1], []]), '*.x', 2),
    set(new Illuminate\Support\Collection(['k' => 1]), 'k', 2),
    set(new Illuminate\Support\Collection(['a' => ['b' => 1]]), 'a.b', 2),
    attempt(fn () => set(new Illuminate\Support\Collection([1, 2]), '*', 0)),
]);
out('fill', [
    fill(['a' => 1], 'a', 2),
    fill(['a' => 1], 'b', 2),
    fill(['a' => ['b' => 1]], 'a.c', 2),
    fill([['x' => 1], []], '*.x', 9),
    fill(null, 'a.b', 1),
]);
$fstd = new stdClass;
$fstd->p = 1;
$fstd->q = ['r' => 1, 's' => 2];
out('forget', [
    forget(['a' => 1, 'b' => 2], 'a'),
    forget(['a' => ['b' => 1, 'c' => 2]], 'a.b'),
    forget([['x' => 1, 'y' => 1], ['x' => 2]], '*.x'),
    forget(['a' => [['k' => 1, 'l' => 2]]], 'a.*.k'),
    forget(['a' => 1], 'missing'),
    forget(['a' => 1], 'missing.deeper'),
    forget(['a' => ['b' => 1]], ['a', 'b']),
    forget(clone $fstd, 'p'),
    forget(clone $fstd, 'q.r'),
    forget(clone $fstd, 'missing'),
    forget(new ArrayObject(['a' => 1, 'b' => 2]), 'a'),
    forget(new ArrayObject([['x' => 1, 'y' => 2]]), '*.x'),
    forget(new Illuminate\Support\Collection(['a' => 1, 'b' => 2]), 'a'),
    forget('text', 'a'),
    forget(null, 'a'),
    forget([1, 2, 3], '*'),
]);
out('head-last', [
    head([]), head([1, 2, 3]), head(['a' => 1, 'b' => 2]), head([false]), head([null, 1]),
    last([]), last([1, 2, 3]), last(['a' => 1, 'b' => 2]), last([false]), last([1, null]),
    attempt(fn () => head('abc')), attempt(fn () => last(1)), head(''), last(0), head(null),
]);
out('when', [
    when(true, 'v'), when(false, 'v'), when(false, 'v', 'd'), when(0, 'v', 'd'), when('0', 'v', 'd'), when([], 'v', 'd'),
    when([1], 'v', 'd'), when('a', 'v'), when(1, fn ($c) => [$c, 'cb']), when(0, 'v', fn ($c) => [$c, 'default']),
    when(fn () => 'yes', fn ($c) => [$c, 'cond']), when(fn () => null, 'v', fn ($c) => [$c, 'null-cond']),
    when(true, null), when(false, 'v', null),
]);
out('magic', [
    set(new Magic, 'a', 1),
    set(new Magic, 'a.b', 1),
    set(new Magic(['a' => ['b' => 1]]), 'a.b', 2),
    set(new Magic(['a' => 1]), 'a', 2, false),
    forget(new Magic(['a' => 1, 'b' => 2]), 'a'),
    forget(new Magic(['a' => ['b' => 1]]), 'a.b'),
    forget(new Magic, 'a'),
]);
out('iterators', [
    set(new ArrayIterator([1, 2]), '*', 0),
    set(new ArrayIterator([['x' => 1], []]), '*.x', 2),
    forget(new ArrayIterator([['x' => 1, 'y' => 2]]), '*.x'),
]);
out('box', [
    set(new Box, '*', 9),
    set(new Box, '*.x', 9),
    set(new Box(['x' => 1, 'y' => 2]), '*.x', 9, false),
    forget(new Box(['x' => 1, 'y' => 2]), '*.x'),
    set(new Box, 'k', 5),
    set(new Box, 'pub', 5),
]);
out('double-star', [
    set(posts(), 'posts.*.comments.*.name', 'Filled'),
    fill(posts(), 'posts.*.comments.*.name', 'Filled'),
    forget(posts(), 'posts.*.comments.*.name'),
    fill(['foo' => 'bar'], 'foo.*.bar', 'noop'),
]);
out('keys', [
    attempt(fn () => set(['a' => 1], null, 2)),
    attempt(fn () => forget(['' => 1, 'a' => 2], null)),
    set(new stdClass, 5, 'v'),
    set(new ArrayObject([]), 5, 'v'),
    forget(new ArrayObject([5 => 'v', 6 => 'w']), 5),
    set([], [], 1),
]);
