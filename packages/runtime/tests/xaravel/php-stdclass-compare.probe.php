<?php
// PHP 8.5.11 executable evidence for XT-runtime-129 (stdClass exposes its properties to PHP comparison, action item
// epic-14-retro-item-6-stdclass-props-hook). Each line is `<label>\t<json_encode(value)>`; a throw is
// `"<class>: <message>"`. The test computes every label with the runtime and compares it with the recorded value.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-stdclass-compare.probe.php > php-stdclass-compare.probe.txt
error_reporting(0);
function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function attempt($fn) { try { return $fn(); } catch (Throwable $e) { return get_class($e).': '.$e->getMessage(); } }

out('eq', [
    (object) ['a' => 1] == (object) ['a' => 1],
    (object) ['a' => 1] == (object) ['a' => 2],
    (object) ['a' => 1] == (object) ['b' => 1],
    (object) ['a' => 1, 'b' => 2] == (object) ['b' => 2, 'a' => 1],
    new stdClass() == new stdClass(),
    (object) ['o' => (object) ['a' => 1]] == (object) ['o' => (object) ['a' => 1]],
    (object) [1 => 'x'] == json_decode('{"1":"x"}'),
    (object) ['a' => 1] == ['a' => 1],
]);
out('spaceship', [
    (object) ['a' => 1] <=> (object) ['a' => 2],
    (object) ['a' => 2] <=> (object) ['a' => 1],
    (object) ['a' => 1] <=> (object) ['b' => 1],
    (object) ['b' => 1] <=> (object) ['a' => 1],
    (object) ['a' => 1] <=> (object) ['a' => 1, 'b' => 2],
    (object) ['a' => 1, 'b' => 2] <=> (object) ['a' => 1],
    (object) ['a' => 1] <=> new ArrayObject(['a' => 1]),
]);
$x = new stdClass();
$x->self = $x;
$y = new stdClass();
$y->self = $y;
out('recursion', [attempt(fn () => $x == $y), $x == $x]);
$m = new stdClass();
$n = new stdClass();
$m->o = $n;
$n->o = $m;
out('recursion.mutual', attempt(fn () => $m == $n));
out('json_decode.spaceship', [
    json_decode('{"a":1}') <=> json_decode('{"a":2}'),
    json_decode('{"a":2}') <=> json_decode('{"a":1}'),
    json_decode('{"a":1}') <=> (object) ['a' => 1],
    (object) ['a' => 2] <=> json_decode('{"a":1}'),
]);
out('unserialize', [
    unserialize('O:8:"stdClass":1:{s:1:"a";i:1;}') == (object) ['a' => 1],
    unserialize('O:8:"stdClass":1:{s:1:"a";i:1;}') == (object) ['a' => 2],
]);
out('codecs', [
    json_encode(new stdClass()),
    json_encode((object) [1 => 'x', 'a' => 2]),
    serialize((object) ['a' => 1]),
    (array) (object) [1 => 'x'],
]);
