<?php
// PHP 8.5.11 evidence for XT-runtime-152; run: php php-callunpacked-order.probe.php
function attempt(callable $run): mixed {
    try { return $run(); } catch (Throwable $error) { return get_class($error).': '.$error->getMessage(); }
}
function out(string $label, mixed $value): void { echo $label, "\t", json_encode($value, JSON_THROW_ON_ERROR), "\n"; }
$plain = fn($value = null) => $value;
$options = fn($value = null, ...$options) => [$value, $options];
foreach (['callUnpacked', 'call_user_func_array'] as $entry) {
    $invoke = $entry === 'callUnpacked' ? fn($target, $args) => $target(...$args) : fn($target, $args) => call_user_func_array($target, $args);
    out("$entry.unsupported-first", attempt(fn() => $invoke($plain, ['a'=>1, 0=>2])));
    out("$entry.unsupported-second", attempt(fn() => $invoke($plain, [0=>1, 'a'=>2])));
    out("$entry.options", $invoke($options, [0=>1, 'limit'=>2]));
    out("$entry.order", attempt(fn() => $invoke($options, ['limit'=>2, 0=>1])));
    out("$entry.positional", $invoke(fn(...$values) => $values, [8=>'a', 3=>'b']));
}
out('callUnpacked.duplicate', attempt(fn() => $options(...(function(){ yield 'limit'=>1; yield 'limit'=>2; })())));
out('callUnpacked.bad-key', attempt(fn() => $options(...(function(){ yield null=>1; })())));
$log = [];
$error = attempt(function() use ($plain, &$log) {
    $plain(...(function() use (&$log) {
        try { $log[]='start'; yield 'a'=>1; $log[]='later'; yield 0=>2; }
        finally { $log[]='finally'; }
    })());
});
out('callUnpacked.lazy', [$error, $log]);
