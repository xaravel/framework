<?php
// Executed with PHP 8.5.11 (cli), Homebrew build Sep 22 2026 13:32:06, NTS.
function tokenString(string $value = Stringable::class): string { return $value; }
function tokenArray(array $value): array { return $value; }
function tokenReturnArray($value): array { return $value; }
function tokenDefault(array $value = ['nested' => [Stringable::class]]): array { return $value; }
function row($label, $fn) {
    try { $result = $fn(); }
    catch (Throwable $e) { $result = get_class($e).': '.preg_replace('/, called in .*/s', '', $e->getMessage()); }
    echo $label,"\t",json_encode($result),"\n";
}
$token = Stringable::class;
eval('namespace TokenProbe; interface Named {}');
$namedToken = TokenProbe\Named::class;
row('namespaced', fn() => [gettype($namedToken), (string)$namedToken, tokenString($namedToken), (function()use($namedToken): string { return $namedToken; })(), $namedToken]);
row('distinct', fn() => [$token == $namedToken, $token <=> $namedToken, $namedToken <=> $token, [$token] === [$namedToken], $token == 'ArrayAccess', 'ArrayAccess' <=> $token]);
row('direct', fn() => [gettype($token), get_debug_type($token), is_string($token), is_array($token), $token]);
row('selected', fn() => tokenString(['token' => $token]['token']));
row('parameter', fn() => tokenString($token));
row('return', function()use($token): string { return $token; });
row('default.string', fn() => tokenString());
row('nested', function()use($token) { $a = ['nested' => [$token]]; $b = $a; $b['nested'][] = 'changed'; return [$a, $b]; });
row('default.array', function() { $a = tokenDefault(); $a['nested'][] = 'changed'; return [$a, tokenDefault()]; });
row('invalid.parameter', fn() => tokenArray($token));
row('invalid.return', fn() => tokenReturnArray($token));
row('regression', fn() => [gettype([]), gettype(new stdClass), gettype(null), gettype(1), gettype(true), gettype('text')]);
row('casts', fn() => [(int)$token, (float)$token, (string)$token, (bool)$token]);
row('comparison', fn() => [$token == 'Stringable', $token <=> 'Stringable', $token <=> 0, 0 <=> $token]);
row('identical', fn() => [$token === 'Stringable', [$token] === ['Stringable']]);
row('exception.message', fn() => (new Exception($token))->getMessage());
row('exception.code', fn() => new Exception('', $token));
row('arithmetic', fn() => $token + 1);
row('numeric.builtin', fn() => floor($token));
row('flip', fn() => array_flip([$token]));
row('range.start', fn() => @range($token, 'U'));
row('range.end', fn() => @range('Q', $token));
