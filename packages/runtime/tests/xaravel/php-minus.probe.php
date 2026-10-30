<?php
// PHP 8.5.11 executable evidence for XT-runtime-130 (`minus`, PHP's `$a - $b`; Epic 14 retro item 8). Run with
// error_reporting=0: the warning for a leading-numeric string is not raised by the runtime (DIV-9.17). Each result
// is [gettype, value]; a NAN, an infinity or a float zero is written by name, keeping -0 apart from +0. A throw is
// written as "<class>: <message>".
function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function attempt($fn) { try { return t($fn()); } catch (Throwable $e) { return get_class($e).': '.$e->getMessage(); } }
function t($v) {
    if (is_float($v) && (is_nan($v) || is_infinite($v) || $v == 0)) {
        return ['double', is_nan($v) ? 'NAN' : (is_infinite($v) ? ($v < 0 ? '-INF' : 'INF') : (fdiv(1.0, $v) < 0 ? '-0' : '+0'))];
    }
    return [gettype($v), $v];
}
function subtract(array $pairs) { return array_map(fn($pair) => attempt(fn() => $pair[0] - $pair[1]), $pairs); }

out('ints', subtract([[5, 3], [3, 5], [9007199254740993, 1], [PHP_INT_MIN, -1], [PHP_INT_MAX, PHP_INT_MAX], [0, 0], [-5, -7]]));
out('overflow', subtract([[PHP_INT_MIN, 1], [PHP_INT_MAX, -1], [PHP_INT_MIN, PHP_INT_MAX], [PHP_INT_MAX, PHP_INT_MIN]]));
out('floats', subtract([[5.5, 1], [1, 0.1], [3.0, 1], [0, -0.0], [-0.0, 0], [-0.0, 0.0], [0.0, 0.0], [INF, 1], [1, INF], [INF, INF], [-INF, INF], [NAN, 1], [1, NAN], [PHP_INT_MAX, 1.0]]));
out('coerced', subtract([['10', 3], ['2.5', '1'], ['1e3', 1], [' 7', '7 '], [true, false], [null, 1], ['9223372036854775808', 1], [1, null], [null, null], ['-0.0', 0], ['.5', '5.'], ['9223372036854775807', '-1']]));
out('leading', subtract([['12abc', 2], [' 12tail', 2], ['0x1A', 1], ['1e3x', 0.5], [5, '3 apples']]));
out('unsupported', subtract([[[], 1], [1, []], [[1], [1]], [[], []], ['x', 1], [1, ''], [new stdClass, 1], [fn() => 1, 1], [1.5, 'abc'], [[], true], [null, []], [new ArrayObject([1]), 2]]));
out('function', [function_exists('minus'), is_callable('minus')]);
