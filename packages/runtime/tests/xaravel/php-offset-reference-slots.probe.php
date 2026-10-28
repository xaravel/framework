<?php
if (PHP_VERSION !== '8.5.11') { throw new RuntimeException('requires PHP 8.5.11'); }
set_error_handler(fn() => true);
function row($name, ...$values) { echo $name, ' ', json_encode($values), "\n"; }
class InheritedOffsetReference extends ArrayObject {}
foreach ([new ArrayObject(['x'=>['sibling'=>[2]]]), new InheritedOffsetReference(['x'=>['sibling'=>[2]]])] as $o) {
    $r =& $o['x']; $r['y'] = [1]; row('nested', $o->getArrayCopy(), $r); unset($r);
}
$o = new ArrayObject(['x'=>[1]]); $r =& $o['x']; $s =& $o['x'];
$o['x']=[2]; row('overwrite', $r, $s);
unset($o['x']); $r[] = 3; row('unset', $o->getArrayCopy(), $r, $s);
$o['x']=[4]; $s[] = 5; row('reinsert', $o->getArrayCopy(), $r, $s);
$o = new ArrayObject(['x'=>[4]]); $r =& $o['x']; $s =& $o['x'];
$r=[7]; row('reference-write', $o->getArrayCopy(), $s);
unset($o['x']); $r[]=6; row('direct-unset', $o->getArrayCopy(), $s);
$o['x']=[8]; $s[]=7; row('direct-reinsert', $o->getArrayCopy(), $r);
$o = new ArrayObject(['x'=>[1]]); $r =& $o['x']; $o->offsetSet('x', [2]); $r[]=3; row('offsetSet', $o->getArrayCopy(), $r);
$inner = new ArrayObject(['x'=>[]]); $wrapper = new ArrayObject($inner);
$r =& $wrapper['missing']; row('missing', $inner->getArrayCopy(), $r);
$wrapper->exchangeArray([]); $r[] = 2; row('exchange', $inner->getArrayCopy(), $wrapper->getArrayCopy(), $r);
$handle = new stdClass; $o = new ArrayObject(['x'=>$handle]); $r =& $o['x']; $r->child=[1]; row('handle', $r === $handle, $o['x'] === $handle, $o->getArrayCopy());
foreach (['2', '02', true, false, 2.75, null, -2, 9007199254740993, '__proto__'] as $key) {
    $o = new ArrayObject; $r =& $o[$key]; $r=[1]; row('key', $o->getArrayCopy()); unset($r);
}
foreach ([new ArrayObject(['x'=>[]]), new InheritedOffsetReference(['x'=>[]])] as $o) {
    foreach ([[], new stdClass] as $key) {
        try { $r =& $o[$key]; } catch (TypeError $e) { row('invalid', get_class($e), $e->getMessage(), $o->getArrayCopy()); }
    }
}
$o = new ArrayObject(['x'=>[1]]); $old =& $o['x']; $o['x']=[2]; $fresh =& $o['x']; $fresh[]=3;
row('boundary-fresh-overwrite', $old, $fresh, $o->getArrayCopy());
unset($o['x']); $o['x']=[4]; $latest =& $o['x']; $latest[]=5;
row('boundary-fresh-reinsert', $old, $fresh, $latest, $o->getArrayCopy());
$inner = new ArrayObject(['x'=>[]]); $wrapper = new ArrayObject($inner);
$wr =& $wrapper['x']; $ir =& $inner['x']; $wr=[1]; $ir[]=2;
row('boundary-wrapper-shared', $wr, $ir, $inner->getArrayCopy(), $wrapper->getArrayCopy());
$inner->exchangeArray(['x'=>[8]]); $wr[]=3;
row('boundary-inner-exchange', $wr, $ir, $inner->getArrayCopy(), $wrapper->getArrayCopy());
class BoundaryValueGet extends ArrayObject {
    public function offsetGet(mixed $key): mixed { return parent::offsetGet($key); }
}
$handle = new stdClass; $o = new BoundaryValueGet(['x'=>$handle]); $r =& $o['x']; $r->child=[1];
row('boundary-user-handle', $r === $handle, $o->offsetGet('x') === $handle, $o->getArrayCopy());
class BoundaryAccess implements ArrayAccess {
    public array $calls = [];
    public function offsetExists(mixed $key): bool { $this->calls[]=['exists',$key]; return false; }
    public function offsetGet(mixed $key): mixed { $this->calls[]=['get',$key]; return null; }
    public function offsetSet(mixed $key, mixed $value): void { $this->calls[]=['set',$key]; }
    public function offsetUnset(mixed $key): void { $this->calls[]=['unset',$key]; }
}
foreach (['02', null, true] as $key) {
    $o = new BoundaryAccess; $r =& $o[$key]; $r=[1]; row('boundary-user-missing', $o->calls, $r); unset($r);
}
$o = new ArrayObject(['x'=>[1], 'next'=>[2]]); $r =& $o['x']; $it=$o->getIterator();
$it->offsetSet('x',[3]); $r[]=4;
row('boundary-iterator-write', $o->getArrayCopy(), $r);
$fresh =& $o['x']; $it->offsetUnset('x'); $fresh[]=5;
row('boundary-iterator-delete', $o->getArrayCopy(), $fresh);
$o = new ArrayObject(['x'=>[1], 'next'=>[2]]); $it=$o->getIterator(); $it->rewind(); $r =& $o['x']; $r=[3];
row('boundary-cursor-write', $it->key(), $it->current());
$m =& $o['missing']; $m=[4]; $it->next(); row('boundary-cursor-next', $it->key(), $it->current());
$it->next(); row('boundary-cursor-missing', $it->key(), $it->current());
$it->next(); row('boundary-cursor-end', $it->valid());
// ArrayIterator also has native reference semantics in PHP; extending the public
// seam beyond the explicit ArrayObject contract is intentionally outside this item.
$o = new ArrayIterator(['x'=>[]]); $r =& $o['x']; $r[] = 1; row('iterator-scope-evidence', $o->getArrayCopy());
