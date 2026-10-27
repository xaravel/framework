<?php
// PHP 8.5.11 executable evidence for XT-runtime-86..90. JSON retains integral float markers and exact int64 digits.
namespace XaravelFixture\ChunkSort {
    class Base { public function method($x) { return "instance:$x"; } public static function called() { return static::class; } public static function stat($x) { return "static:$x"; } }
    class Child extends Base {}
    class Magic { public function __call($name, $args) { return [$name, $args]; } public static function __callStatic($name, $args) { return [$name, $args]; } }
    class Invokable { public function __invoke($x) { return $x + 1; } }
    enum Status { case Ready; }
}
namespace {
    use XaravelFixture\ChunkSort\Base;
    use XaravelFixture\ChunkSort\Child;
    use XaravelFixture\ChunkSort\Magic;
    use XaravelFixture\ChunkSort\Invokable;
    use XaravelFixture\ChunkSort\Status;
    // Oracle glibc canonicalizes POSIX to C (glibc-2.41 locale/findlocale.c lines 119-125).
    // Host Darwin preserves POSIX; normalize only locale evidence to Oracle spelling.
    function oracle_locale($value) { return is_array($value) ? array_map('oracle_locale',$value) : ($value === 'POSIX' ? 'C' : $value); }
    function out($label, $value) { if(str_starts_with($label,'locale'))$value=oracle_locale($value); echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
    function attempt($fn) { try { return $fn(); } catch (Throwable $e) { return get_class($e).': '.$e->getMessage(); } }
    out('chunk', [array_chunk([], 2), array_chunk(['a'=>1, 5=>2, 'b'=>3, 9=>4], '2'), array_chunk(['a'=>1, 5=>2, 'b'=>3, 9=>4], 2, true), array_chunk([1,2], PHP_INT_MAX)]);
    out('chunk.errors', [attempt(fn()=>array_chunk([],0)),attempt(fn()=>array_chunk(1,2)),attempt(fn()=>array_chunk([],[])),attempt(fn()=>array_chunk([],2,[]))]);
    $a=['a'=>false, 5=>'last']; out('pointer', [key($a), reset($a), key($a), end($a), key($a)]);
    $empty=[]; out('pointer.empty',[reset($empty),key($empty),end($empty),key($empty)]);
    foreach (['ksort','krsort','sort','rsort'] as $fn) foreach ([0,1,2,5,6,10,14,99] as $flag) {
        $a=['z'=>'A10',4=>'a2','b'=>'A2',-1=>'a02','aa'=>'A2']; $alias=$a; $result=$fn($a,$flag); out("sort.$fn.$flag",[$result,$a,$alias]);
    }
    $a=['bb'=>1,'a'=>2,'cc'=>3]; $calls=[]; uksort($a,function($a,$b)use(&$calls){$calls[]=[$a,$b];return strlen($a)<=>strlen($b);}); out('uksort',[$a,$calls]);
    $a=['d'=>4,'c'=>3,'b'=>2,'a'=>1]; $calls=[]; $e=attempt(function()use(&$a,&$calls){return uksort($a,function($a,$b)use(&$calls){$calls[]=[$a,$b];if(count($calls)===2)throw new RuntimeException('stop');return $a<=>$b;});}); out('uksort.throw',[$e,$a,$calls]);
    out('arith.plus',[1+2,PHP_INT_MAX+0,PHP_INT_MAX+1,PHP_INT_MIN+(-1),' 12tail'+2,'1e2'+true,null+false,1.0+1,['a'=>1]+['a'=>2,'b'=>3]]);
    out('arith.divide',[6/3,7/2,'6'/true,6.0/3,PHP_INT_MIN/-1,PHP_INT_MAX/1]);
    out('arith.errors',[attempt(fn()=>[]+1),attempt(fn()=>'x'+1),attempt(fn()=>1/0),attempt(fn()=>1/[]),attempt(fn()=>intdiv(PHP_INT_MIN,-1)),attempt(fn()=>intdiv(1,0)),attempt(fn()=>intdiv([],2))]);
    out('arith.builtins',[intdiv(-7,2),intdiv('9',2),floor('2.9'),ceil(-2.9),floor(null),ceil(2),PHP_INT_MIN,PHP_INT_MAX]);
    out('string',[strrev('abc'),strrev(120),strtolower('AbCÉÇ'),strtolower(null),bin2hex(strrev('é'))]);
    out('string.errors',[attempt(fn()=>strrev([])),attempt(fn()=>strtolower([]))]);
    out('subclass',[is_subclass_of(new Child,Base::class),is_subclass_of(Child::class,Base::class),is_subclass_of(Base::class,Base::class),is_subclass_of(Child::class,Base::class,false),is_subclass_of(Status::class,UnitEnum::class)]);
    $obj=new Child; $forms=[[$obj,'METHOD'],[Child::class,'STAT'],Child::class.'::sTaT',new Invokable,fn($x)=>$x+1,[new Magic,'missing'],[Magic::class,'missing']];
    out('callables',array_map(fn($f)=>[is_callable($f),call_user_func_array($f,[5])],$forms));
    out('callbacks',[array_map([$obj,'METHOD'],[1,2]),array_filter([0,1], [new Invokable,'__INVOKE']),array_any([1], [Child::class,'STAT']),array_map(Child::class.'::STAT',[1])]);
    out('callback.errors',[attempt(fn()=>array_map(['Missing','m'],[1])),attempt(fn()=>array_map([Child::class,'method'],[1])),attempt(fn()=>array_map([1,'x'],[1])),attempt(fn()=>array_map(['x'],[1])),attempt(fn()=>call_user_func_array(42,[])),attempt(fn()=>call_user_func_array('strtoupper',1))]);
    $a=[5=>'a','x'=>'b'];unset($a[5]);$v=['nested'=>[1]];$a[]=$v;$v['nested'][]=2;out('append',$a);
    out('unpack',[call_user_func_array(fn($a,$b)=>[$a,$b],[5=>'x',9=>'y']),attempt(fn()=>call_user_func_array('strtoupper',['string'=>'x',0=>'y']))]);
    $old=setlocale(LC_ALL,0); out('locale',[setlocale(LC_ALL,'C'),setlocale(LC_ALL,"0"),setlocale(LC_ALL,'POSIX'),setlocale(LC_ALL,'xaravel-missing-locale'),setlocale(LC_ALL,'0'),strcoll('ab','a')]);setlocale(LC_ALL,$old);
    function source(&$log){try{$log[]='start';yield 1;$log[]='later';yield 2;}finally{$log[]='finally';}}
    $log=[];foreach(source($log)as$v){break;}out('generator.owned',$log);
    $log=[];$g=source($log);foreach($g as$v){break;}$before=$log;$g->next();$during=[$g->current(),$log];$g->next();out('generator.held',[$before,$during,$log]);
    $log=[];foreach(source($log)as$v){}out('generator.exhaust',$log);
    // Value copies, pointer separation and append preserve PHP array-value state.
    $a=['first'=>[1],'last'=>[2]];$alias=$a;end($a);$copy=$a;$a[]=[3];$copy['first'][]=4;
    out('pointer.copy',[key($a),key($copy),key($alias),$a,$copy,$alias]);
    $a=['nest'=>['x'=>1,'y'=>2]];end($a['nest']);$copy=$a;out('pointer.nested',[key($copy['nest']),key($a['nest'])]);
    $init=[];foreach([null,false]as$initial){$a=$initial;$v=['nested'=>[1]];$a[]=$v;$v['nested'][]=2;$init[]=$a;}out('append.initialize',$init);
    out('callables.magic-only',[is_callable(new Magic),attempt(fn()=>call_user_func_array(new Magic,[]))]);
    out('callables.late-static',array_map(fn($f)=>call_user_func_array($f,[]),[[Child::class,'called'],Child::class.'::called',[new Child,'called']]));
    $f=fn(...$args)=>$args;
    out('unpack.scalar',attempt(fn()=>$f(...1)));
    out('unpack.traversable',[$f(...(function(){yield 8=>'a';yield 8=>'b';})()),attempt(fn()=>$f(...(function(){yield 'x'=>1;yield 'x'=>2;})())),attempt(fn()=>$f(...(function(){yield 'x'=>1;yield 0=>2;})())),attempt(fn()=>$f(...(function(){yield null=>1;})()))]);
    $large=[];for($i=25;$i>=0;$i--)$large['key'.str_pad((string)$i,2,'0',STR_PAD_LEFT)]=$i;
    $a=$large;ksort($a,SORT_NUMERIC);$b=$large;uksort($b,fn($a,$b)=>strlen($a)<=>strlen($b));out('uksort.large-ties',[$a,$b]);
    $a=$large;$calls=[];$error=attempt(function()use(&$a,&$calls){uksort($a,function($a,$b)use(&$calls){$calls[]=[$a,$b];if(count($calls)===12)throw new RuntimeException('large-stop');return $a<=>$b;});});out('uksort.large-throw',[$error,$a,$calls]);
    // Category vector is libc-independent: Darwin's LC_ALL composite syntax differs from Oracle glibc.
    $old=setlocale(LC_ALL,0);setlocale(LC_ALL,'C');setlocale(LC_NUMERIC,'POSIX');
    $categories=[LC_CTYPE,LC_NUMERIC,LC_TIME,LC_COLLATE,LC_MONETARY,LC_MESSAGES];
    out('locale.categories',array_map(fn($cat)=>setlocale($cat,0),$categories));setlocale(LC_ALL,$old);
    $registry=['array_chunk','key','ksort','krsort','uksort','sort','rsort','intdiv','floor','ceil','is_subclass_of','call_user_func_array','strrev','strtolower','setlocale'];
    out('registry',array_map(function($name){$r=new ReflectionFunction($name);return [$name,$r->getNumberOfRequiredParameters(),$r->getNumberOfParameters(),$r->isVariadic(),array_keys(array_filter($r->getParameters(),fn($p)=>$p->isPassedByReference()))];},$registry));
}
