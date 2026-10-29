<?php
// PHP 8.5.11 executable evidence for XT-runtime-126..127 (array_sum, ESC-14.8-2). Run with error_reporting=0:
// the warnings for skipped operands are not raised by the runtime (DIV-9.17). Each sum is [gettype, value];
// a NAN, an infinity or a float zero is written by name, keeping -0 apart from +0.
function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function attempt($fn) { try { return $fn(); } catch (Throwable $e) { return get_class($e).': '.$e->getMessage(); } }
function t($v) {
    if (is_float($v) && (is_nan($v) || is_infinite($v) || $v == 0)) {
        return ['double', is_nan($v) ? 'NAN' : (is_infinite($v) ? ($v < 0 ? '-INF' : 'INF') : (fdiv(1.0, $v) < 0 ? '-0' : '+0'))];
    }
    return [gettype($v), $v];
}
function sums(array $inputs) { return array_map(fn($a) => t(array_sum($a)), $inputs); }

out('empty', sums([[]]));
out('ints', sums([[1, 2, 3], [9007199254740993, 1], [PHP_INT_MAX - 1, 1], [PHP_INT_MAX, 1], [PHP_INT_MIN, -1], [PHP_INT_MAX, PHP_INT_MIN], [-5, 2]]));
out('floats', sums([[1, 2.5], [0.1, 0.2], [1.0], [-0.0], [-0.0, -0.0], [INF], [-INF], [INF, -INF], [NAN], [NAN, 1], [PHP_INT_MAX, 1.0]]));
out('coerced', sums([['1', '2.5', '1e3', ' 3', '3 '], ['9223372036854775808'], ['9223372036854775807', 1], [true, false, null], [null], [false], ['1', 1], ['-0.0'], ['.5', '5.']]));
out('leading', sums([['12abc', 1], ['0x1A', 1], [' 12tail'], ['1e3x', 0.5]]));
out('unsupported', sums([[[1], 5], [[1]], [new stdClass, 5], [fn() => 1, 5], [new ArrayObject([1]), 5], ['abc', 5], ['', 5], ['Traversable', 5], ['abc'], ['abc', 1.5], [[1], new stdClass, 'x', '', 2, '3']]));
$ref = [1, 2]; $cell = &$ref[0]; $cell = 5;
out('keyed', [t(array_sum(['a' => 1, 'b' => 2.5, 5 => 3])), t(array_sum([3 => 'x', 'b' => 4, 0 => '1'])), t(array_sum($ref)), $ref]);
out('errors', [attempt(fn() => array_sum(1)), attempt(fn() => array_sum('x')), attempt(fn() => array_sum(null)), attempt(fn() => array_sum(new stdClass)), attempt(fn() => array_sum(new ArrayObject([1]))), attempt(fn() => array_sum(1.5)), attempt(fn() => array_sum(true))]);
$upper = 'ARRAY_SUM'; $qualified = '\array_sum';
out('callable', [array_map('array_sum', [[1, 2], [3]]), is_callable('array_sum'), function_exists('Array_Sum'), call_user_func_array('array_sum', [[1, 2.5]]), $upper([4, 5]), $qualified([6]), attempt(fn() => $upper()), attempt(fn() => $upper([1], [2]))]);
