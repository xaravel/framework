<?php
// PHP 8.5.11 public userland binding evidence; source locations are normalized.
function row($label, $fn) {
    try { $v = $fn(); $result = [get_debug_type($v), $v]; }
    catch (Throwable $e) { $result = get_class($e).': '.preg_replace('/, called in .*/s', '', $e->getMessage()); }
    echo $label,"\t",json_encode($result, JSON_PRESERVE_ZERO_FRACTION),"\n";
}
class BinderAccess implements ArrayAccess {
    private array $values = ['n'=>1];
    public function offsetExists(mixed $offset): bool { return isset($this->values[$offset]); }
    public function offsetGet(mixed $offset): mixed { return $this->values[$offset]; }
    public function offsetSet(mixed $offset, mixed $value): void { $this->values[$offset] = $value; }
    public function offsetUnset(mixed $offset): void { unset($this->values[$offset]); }
}
class BinderOther {}
function accessUnion(ArrayAccess|array $value, ?int $default=null) { return $value; }
function reorderedUnion(array|ArrayAccess $value) { return $value; }
function nullableUnion(ArrayAccess|array|null $value=null) { return $value; }
foreach (['null'=>null,'int'=>1,'float'=>1.5,'true'=>true,'false'=>false,'string'=>'x','closure'=>fn()=>1,'object'=>new BinderOther] as $label=>$value) {
    row('invalid.'.$label,fn()=>accessUnion($value));
    row('reordered.'.$label,fn()=>reorderedUnion($value));
    row('nullable.'.$label,fn()=>nullableUnion($value));
}
foreach (['arrayobject'=>new ArrayObject(['n'=>1]),'custom'=>new BinderAccess] as $label=>$value) {
    row('handle.'.$label,function()use($value){$bound=accessUnion($value);$bound['n']=2;return [$bound===$value,$value['n']];});
    row('default.'.$label,fn()=>accessUnion($value)===$value);
}
foreach (['list'=>[[1]],'map'=>['nested'=>[1]],'mixed'=>[2=>[1],'name'=>1]] as $label=>$value) {
    row('copy.'.$label,function()use($value){$bound=accessUnion($value);$key=array_key_first($bound);$bound[$key][]=2;return [$value,$bound];});
}
row('omitted',fn()=>nullableUnion());
row('nullable.array',fn()=>nullableUnion([1]));
row('nullable.handle',function(){$v=new BinderAccess;return nullableUnion($v)===$v;});
row('unused.invalid',fn()=>accessUnion(new ArrayObject, []));
$entered=false;
function guardedUnion(ArrayAccess|array $value, ?int $default=null) { global $entered; $entered=true; return 1; }
row('timing',function()use(&$entered){try{guardedUnion(new ArrayObject,[]);}catch(TypeError){}return $entered;});
