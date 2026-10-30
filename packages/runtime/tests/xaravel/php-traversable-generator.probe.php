<?php
// PHP 8.5.11 executable evidence for XT-runtime-128 (a bare generator object is a Traversable and an Iterator, action
// item epic-14-retro-item-5-traversable-js-generator). Each line is `<label>\t<json_encode(value)>`; the test computes
// every label with the runtime, over a ported generator function (DIV-12.18), and compares it with the recorded value.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-traversable-generator.probe.php > php-traversable-generator.probe.txt
error_reporting(0);
function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function g() { yield 1; yield 2; }
function gk() { yield 'a' => 1; yield 5 => 2; yield 3; }

$g = g();
out('instanceof', [$g instanceof Traversable, $g instanceof Iterator, $g instanceof Generator, $g instanceof IteratorAggregate]);
$g = g();
out('is_a', [is_a($g, 'Traversable'), is_a($g, 'Iterator'), is_a($g, 'Generator'), is_a($g, 'IteratorAggregate'), is_iterable($g)]);
$rows = [];
$it = new CachingIterator(gk());
foreach ($it as $key => $value) {
    $rows[] = [$key, $value, $it->hasNext()];
}
out('caching', $rows);
$g = gk();
$it = new CachingIterator($g);
out('caching.inner', [$it->getInnerIterator() === $g, $it->getInnerIterator() instanceof Generator]);
out('caching.to_array', iterator_to_array(new CachingIterator(gk())));
