<?php
if (PHP_VERSION !== '8.5.11') { throw new RuntimeException('requires PHP 8.5.11'); }
require 'conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/helpers.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/Arr.php';
use Illuminate\Support\Arr;
class ValueGetArrayObject extends ArrayObject {
    public function offsetGet(mixed $key): mixed { return parent::offsetGet($key); }
}
set_error_handler(function ($severity, $message) { echo "notice: $message\n"; return true; });
foreach ([new ArrayObject(['x' => []]), new ValueGetArrayObject(['x' => []])] as $a) {
    $returned = Arr::push($a, 'x.y', 1);
    echo get_class($a), ' nested root=', json_encode($a->getArrayCopy()), ' return=', json_encode($returned), "\n";
}
$a = new ArrayObject(['x' => []]);
try { Arr::push($a, 'x', 1); } catch (TypeError $e) { echo $e->getMessage(), "\n"; }
echo 'root-leaf mutation=', json_encode($a->getArrayCopy()), "\n";
$a = ['x' => []];
$returned = Arr::push($a, null, 1);
echo 'null-key root=', get_debug_type($a), ' ', json_encode($a), ' return=', json_encode($returned), "\n";
$a = new ArrayObject(['x' => []]);
try { Arr::push($a, null, 1); } catch (InvalidArgumentException $e) { echo $e->getMessage(), "\n"; }
echo 'null-key ArrayObject unchanged=', json_encode($a->getArrayCopy()), "\n";
