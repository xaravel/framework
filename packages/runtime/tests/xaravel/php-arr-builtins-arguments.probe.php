<?php
// PHP 8.5.11 userland weak-typing evidence. Diagnostics omit PHP's source-location suffix.
error_reporting(E_ALL & ~E_DEPRECATED);
function bindInt(int $value): int { return $value; }
function bindFloat(float $value): float { return $value; }
function bindString(string $value): string { return $value; }
function bindBool(bool $value): bool { return $value; }
function bindUnion(int|float $value): int|float { return $value; }
function typed(array $array, string|int|null $key, ?int $default = null): int { return $array[$key] ?? $default; }
function row($label, $fn) { try { $v = $fn(); echo $label,"\t",json_encode([get_debug_type($v), $v], JSON_PRESERVE_ZERO_FRACTION); } catch (Throwable $e) { echo $label,"\t",json_encode(get_class($e).': '.preg_replace('/ passed in .* on line \d+ and/', ' passed and', preg_replace('/, called in .*/s', '', $e->getMessage()))); } echo "\n"; }
row('int.big', fn() => (string)bindInt('9007199254740993'));
row('int.numeric', fn() => bindInt('1e3'));
row('int.float', fn() => bindInt(1.5));
row('int.null', fn() => bindInt(null));
row('float.int', fn() => bindFloat(1));
row('string.bool', fn() => bindString(true));
row('bool.zero', fn() => bindBool('0'));
row('union.float', fn() => bindUnion('1.5'));
row('union.int', fn() => bindUnion('12'));
row('union.exact', fn() => bindUnion(1.0));
row('unused.default', fn() => typed(['n'=>1], 'n', []));
row('key.invalid', fn() => typed(['n'=>1], [], null));
row('array.invalid', fn() => typed(1, 'n', null));
row('nullable', fn() => typed(['n'=>1], 'n', null));
// Observe parameter conversion independently of return conversion.
function parameterArray(array $value) { return $value; }
function parameterString(string $value) { return $value; }
function parameterBool(bool $value) { return $value; }
function parameterInt(int $value) { return $value; }
function parameterFloat(float $value) { return $value; }
function returnArray($value): array { return $value; }
function returnString($value): string { return $value; }
function returnBool($value): bool { return $value; }
function returnInt($value): int { return $value; }
function returnFloat($value): float { return $value; }
foreach (['Array'=>[], 'String'=>12, 'Bool'=>'0', 'Int'=>'12', 'Float'=>1] as $suffix=>$value) {
    row('parameter.'.$suffix, fn()=>('parameter'.$suffix)($value));
    row('return.'.$suffix, fn()=>('return'.$suffix)($value));
    row('return.error.'.$suffix, fn()=>('return'.$suffix)($suffix === 'Array' ? 1 : []));
    row('parameter.null.'.$suffix, fn()=>('parameter'.$suffix)(null));
}
function defaultArray(?array $value = null) { return $value; }
function defaultString(?string $value = null) { return $value; }
function defaultBool(?bool $value = null) { return $value; }
function defaultInt(?int $value = null) { return $value; }
function defaultFloat(?float $value = null) { return $value; }
foreach (['Array'=>[], 'String'=>12, 'Bool'=>1, 'Int'=>'12', 'Float'=>1] as $suffix=>$value) {
    row('default.omitted.'.$suffix, fn()=>('default'.$suffix)());
    row('default.supplied.'.$suffix, fn()=>('default'.$suffix)($value));
}
function requiredCount(int $value) { return $value; }
function optionalCount(int $value, ?int $fallback=null) { return $value; }
row('count.required', fn()=>requiredCount());
row('count.optional', fn()=>optionalCount());
function unusedArray(array $value, ?array $default=null) { return $value; }
function unusedString(string $value, ?string $default=null) { return $value; }
function unusedBool(bool $value, ?bool $default=null) { return $value; }
function unusedInt(int $value, ?int $default=null) { return $value; }
function unusedFloat(float $value, ?float $default=null) { return $value; }
foreach (['Array'=>[], 'String'=>'x', 'Bool'=>true, 'Int'=>1, 'Float'=>1.0] as $suffix=>$value) {
    row('unused.'.$suffix, fn()=>('unused'.$suffix)($value, $suffix === 'Array' ? 1 : []));
}
function beforeRequired(?int $first=null, int $second) { return [$first,$second]; }
row('count.beforeRequired0', fn()=>beforeRequired());
row('count.beforeRequired1', fn()=>beforeRequired(1));
row('count.beforeRequired2', fn()=>beforeRequired(null,2));
// Each union observes parameter binding separately from return typing.
foreach (['string|int|null','int|float','float|bool','array|string'] as $index=>$type) {
    eval('function matrix'.$index.'('.$type.' $value) { return $value; }');
    foreach (['integer'=>12,'fraction'=>1.5,'numeric'=>'12','decimal'=>'1.5','exponent'=>'1e3','overflow'=>'9223372036854775808','text'=>'x','null'=>null,'bool'=>true,'array'=>[]] as $label=>$value) {
        row('matrix.'.$index.'.'.$label, fn()=>('matrix'.$index)($value));
    }
}
function copyReturn($value): array { return $value; }
row('copy.return',function(){$a=['nested'=>[1]];$b=copyReturn($a);$b['nested'][]=2;return [$a,$b];});
function copyParameter(array $value) { $value['nested'][]=2;return $value; }
row('copy.parameter',function(){$a=['nested'=>[1]];$b=copyParameter($a);return [$a,$b];});
row('class.bool',fn()=>parameterBool('Stringable'));
row('class.int.error',fn()=>parameterInt('Stringable'));
row('class.return.error',fn()=>returnInt('Stringable'));
foreach (['string|int|null','int|float','float|bool','array|string'] as $index=>$type) {
    eval('function returnMatrix'.$index.'($value): '.$type.' { return $value; }');
    foreach (['numeric'=>'12','decimal'=>'1.5','overflow'=>'9223372036854775808','text'=>'x','null'=>null,'array'=>[]] as $label=>$value) row('returnMatrix.'.$index.'.'.$label,fn()=>('returnMatrix'.$index)($value));
}
foreach (['Int','Float'] as $suffix) {
    foreach (['fraction'=>'1.5','exponent'=>'1e3','large'=>'9007199254740993','overflow'=>'9223372036854775808','leading'=>'12tail','empty'=>''] as $label=>$value) row('numeric.'.$suffix.'.'.$label,fn()=>('parameter'.$suffix)($value));
}

function numberObservation($value) { return [get_debug_type($value), is_float($value) && is_nan($value) ? 'NAN' : ($value === INF ? 'INF' : ($value === -INF ? '-INF' : (is_float($value) && $value == 0 && fdiv(1,$value) < 0 ? '-0' : $value)))]; }
foreach (['Int','Float'] as $suffix) {
    foreach (['min'=>PHP_INT_MIN,'max'=>PHP_INT_MAX,'under'=>'-9223372036854775809','overflowExponent'=>'1e999','nan'=>NAN,'inf'=>INF,'negativeZero'=>-0.0] as $label=>$value) {
        row('boundary.parameter.'.$suffix.'.'.$label,fn()=>numberObservation(('parameter'.$suffix)($value)));
        row('boundary.return.'.$suffix.'.'.$label,fn()=>numberObservation(('return'.$suffix)($value)));
    }
}
function nonnullInt(int $value=7) {return $value;}
function nonnullFloat(float $value=1.0) {return $value;}
function nonnullString(string $value='default') {return $value;}
function nonnullBool(bool $value=true) {return $value;}
foreach (['Int','Float','String','Bool'] as $suffix) row('default.nonnull.'.$suffix,fn()=>('nonnull'.$suffix)());
function mutableDefault(array $value=['nested'=>[1]], bool $change=false) {if($change)$value['nested'][]=2;return $value;}
row('default.mutable',fn()=>[mutableDefault(change:true),mutableDefault()]);
foreach (['bool|float','string|array','null|int|string'] as $index=>$type) {
    eval('function reordered'.$index.'('.$type.' $value) {return $value;}');
    foreach (['fraction'=>1.5,'numeric'=>'12','text'=>'x','nil'=>null,'bool'=>true,'array'=>[]] as $label=>$value) row('reordered.'.$index.'.'.$label,fn()=>('reordered'.$index)($value));
}
