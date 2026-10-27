<?php
function emit($label,$fn) { try {$v=$fn();} catch(Throwable $e) {$v=get_class($e).': '.$e->getMessage();} echo $label,"\t",json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRESERVE_ZERO_FRACTION),"\n"; }
emit('lists',fn()=>[array_is_list([]),array_is_list(['a','b']),array_is_list([1=>'b',0=>'a']),array_is_list(['x'=>1])]);
emit('list-error',fn()=>array_is_list(null));
emit('push',function(){$a=[5=>'a','x'=>'b'];unset($a[5]);$count=array_push($a,'c',null);return [$count,$a];});
emit('push-zero',function(){$a=[];return [array_push($a),$a];});
emit('push-negative',function(){$a=[-5=>'a'];array_push($a,'b');return $a;});
emit('push-overflow',function(){$a=[PHP_INT_MAX=>'a'];array_push($a,'b');return $a;});
emit('push-error',function(){$a=1;return array_push($a,2);});
emit('query',fn()=>http_build_query([2=>'a b','s'=>'~!*() /é','n'=>null,'t'=>true,'f'=>false,'nested'=>['a'=>'x y',3=>'z'],'empty'=>[]],'p_','&',PHP_QUERY_RFC3986));
emit('query1738',fn()=>http_build_query(['s'=>'~!*() /é','x'=>1],'',';',PHP_QUERY_RFC1738));
emit('query-invalid-encoding',fn()=>http_build_query(['x'=>'~ a'],'',null,3));
emit('query-coercion',fn()=>http_build_query([3=>false],23,42,'2'));
emit('query-object',function(){$o=new class {public $x=1;protected $hidden=2;private $secret=3;public $nested;};$o->nested=(object)['yes'=>true];return http_build_query($o);});
emit('query-recursive',function(){$o=new stdClass;$o->x=1;$o->self=$o;return http_build_query(['o'=>$o]);});
emit('query-repeated',function(){$o=(object)['x'=>1];return http_build_query(['a'=>$o,'b'=>$o]);});
emit('query-error',fn()=>http_build_query(null));
emit('query-separator-error',fn()=>http_build_query([], '', []));
emit('shuffle-empty',fn()=>(new Random\Randomizer)->shuffleArray([]));
emit('shuffle-single',fn()=>(new Random\Randomizer)->shuffleArray(['x'=>'a']));
emit('shuffle-error',fn()=>(new Random\Randomizer)->shuffleArray(1));
emit('metadata',function(){$a=[];foreach(['array_is_list','array_push','http_build_query'] as $name){$r=new ReflectionFunction($name);$a[$name]=[$r->getNumberOfRequiredParameters(),$r->getNumberOfParameters(),$r->isVariadic(),array_map(fn($p)=>$p->getPosition(),array_values(array_filter($r->getParameters(),fn($p)=>$p->isPassedByReference())))];}return $a;});
emit('push-partial-overflow',function(){$a=[PHP_INT_MAX-1=>'a'];try{array_push($a,'b','c');}catch(Throwable $e){return [get_class($e).': '.$e->getMessage(),$a];}});
emit('query-separator-throws',function(){$separator=new class {function __toString():string{throw new RuntimeException('separator conversion');}};return http_build_query([], '', $separator);});
emit('query-class-string',fn()=>http_build_query(['token'=>Stringable::class,'nested'=>[Stringable::class]]));
emit('query-class-error',fn()=>http_build_query(Stringable::class));
emit('query-options-all',fn()=>http_build_query([3=>'a b','nested'=>[4=>'c d']], 'p_', ';', PHP_QUERY_RFC3986));
emit('query-options-empty',fn()=>http_build_query(['s'=>'a b']));
emit('query-visibility',function(){class QueryVisibilityBase {public $yes='visible';protected $hidden='hidden';private $secret='secret';} class QueryVisibility extends QueryVisibilityBase {public $child='public child';private $childSecret='private child';}return http_build_query(new QueryVisibility);});
emit('list-forms',function(){$sparse=[0=>'a',2=>'b'];$deleted=['a','b'];unset($deleted[1]);return [array_is_list($sparse),array_is_list($deleted),array_is_list([0=>'a',1=>'b']),array_is_list(['0'=>'a','1'=>'b'])];});

emit('query-constructor',function(){class QueryConstructor {}return http_build_query(['class'=>QueryConstructor::class]);});
emit('query-options-null',fn()=>http_build_query(['s'=>'a b'],null,null,null));
emit('query-options-invalid',fn()=>http_build_query(['s'=>'a b'],'',null,[]));
emit('query-options-throws',function(){$separator=new class{function __toString():string{throw new RuntimeException('options conversion');}};return http_build_query([],'',$separator);});
