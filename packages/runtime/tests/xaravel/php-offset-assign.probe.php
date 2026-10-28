<?php
// Run with PHP 8.5.11. Notices/deprecations intentionally omitted (DIV-9.17).
error_reporting(0);
echo 'PHP ', PHP_VERSION, "\n";
function row($name, &$x, $key, $value) {
    try { $r = $key === null ? ($x[] = $value) : ($x[$key] = $value); echo $name, ' ', json_encode([$x, $r], JSON_UNESCAPED_UNICODE), "\n"; }
    catch (Throwable $e) { echo $name, ' ', get_class($e), ': ', $e->getMessage(), ' ', json_encode($x), "\n"; }
}
foreach ([null, false, true, 12, 1.5] as $i=>$x) row('receiver'.$i, $x, 'y', [1]);
foreach ([null, false] as $i=>$x) row('invalid'.$i, $x, [], 1);
foreach ([['abc',1,'XYZ'],['abc',-1,12],['abc',5,true],['abc',-5,new stdClass],['abc','1x','Z'],['abc','1.5','Z'],['abc',[],1],['abc',0,''],['abc',null,'Z'],['é',2,'Z'],['abc',false,[]],['abc',true,false],['abc',1.75,2.5],['abc',0,new stdClass]] as $i=>[$x,$key,$v]) row('string'.$i,$x,$key,$v);
$x = new stdClass; row('object', $x, 'x', 1);
foreach ([['abc',0,'é'],['é',0,'X']] as [$x,$k,$v]) { $r=($x[$k]=$v); echo 'bytes ', bin2hex($x), ' ', bin2hex($r), "\n"; }
$x=[5=>1]; unset($x[5]); row('next-free',$x,null,'next');
$x=[-5=>'a']; row('negative-next',$x,null,'b');
$x=[PHP_INT_MAX=>'max']; row('overflow',$x,null,'x');
class AssignAccess implements ArrayAccess {
    public array $calls=[];
    function offsetExists($k): bool {$this->calls[]=['exists',$k];return false;}
    function offsetGet($k): mixed {$this->calls[]=['get',$k];return 12;}
    function offsetSet($k,$v): void {$this->calls[]=['set',$k,$v];}
    function offsetUnset($k): void {}
}
$a=new AssignAccess;
if (!$a->offsetExists('x')) $a['x']=[];
$r=&$a['x'];
try {$r['y']=1;} catch(Throwable $e) {echo 'scalar-reference ',get_class($e),': ',$e->getMessage(),' ',json_encode([$a->calls,$r]),"\n";}
class AssignInherited extends ArrayObject {}
class AssignOverridden extends ArrayObject {function offsetGet($k):mixed{return parent::offsetGet($k);}}
foreach([new ArrayObject(['x'=>[]]),new AssignInherited(['x'=>[]]),new AssignOverridden(['x'=>[]])] as $i=>$a){$r=&$a['x'];$r['y']=[1];echo 'composition',$i,' ',json_encode([$a->getArrayCopy(),$r]),"\n";}
$source=['child'=>[1]];
class AssignMutating extends AssignAccess {
    function offsetSet($k,$v):void {global $source;$v['child'][]=2;$source['child'][]=3;parent::offsetSet($k,$v);}
}
$a=new AssignMutating;$r=($a['x']=$source);echo 'argument-copy ',json_encode([$source,$r,$a->calls]),"\n";
foreach ([false,true] as $throws) {
    $x='abc';
    $v=new class($x,$throws) {
        public int $calls=0;
        function __construct(public mixed &$root,public bool $throws) {}
        function __toString():string {++$this->calls;$this->root='longer';if($this->throws)throw new Error('conversion failed');return 'Z';}
    };
    try {$r=($x[1]=$v);echo 'conversion', (int)$throws,' ',json_encode([$x,$r,$v->calls]),"\n";}
    catch(Throwable $e){echo 'conversion1 ',get_class($e),': ',$e->getMessage(),' ',json_encode([$x,$v->calls]),"\n";}
}
foreach ([1.0,NAN,INF,-INF,'1e0',' 1 ',PHP_INT_MIN,'-9223372036854775808','9223372036854775808','-9223372036854775809'] as $i=>$k) {$x='abc';row('coercion'.$i,$x,$k,'Z');}
foreach ([false,true] as $append) {$x=['a'=>1,'b'=>2];end($x);if($append)$x[]=3;else $x['a']=3;echo 'pointer',(int)$append,' ',json_encode([$x,key($x)]),"\n";}
$x=[0=>1,5=>2];end($x);unset($x[5]);echo 'pointer-exhausted-before ',json_encode([$x,key($x)]),"\n";$x[]=3;echo 'pointer-exhausted-after ',json_encode([$x,key($x)]),"\n";
foreach ([[],new stdClass] as $i=>$k) {
    $x=[0=>1,5=>2];end($x);unset($x[5]);
    try{$x[$k]=3;}catch(Throwable $e){echo 'retained',$i,' ',get_class($e),': ',$e->getMessage(),' ',json_encode([$x,key($x)]),"\n";}
    $x[]=4;echo 'retained-next',$i,' ',json_encode([$x,key($x)]),"\n";
}
foreach ([null,false] as $i=>$initial) {$x=new ArrayObject(['x'=>$initial]);$r=&$x['x'];try{$r[[]]=1;}catch(Throwable $e){echo 'slot-invalid',$i,' ',get_class($e),': ',$e->getMessage(),' ',json_encode([$x->getArrayCopy(),$r]),"\n";}}
$x='abc';$v=new class($x){public int $calls=0;function __construct(public mixed &$root){}function __toString():string{++$this->calls;$this->root='abc';return 'Z';}};$r=($x[1]=$v);echo 'conversion-same ',json_encode([$x,$r,$v->calls]),"\n";
$x='abc';$v=new class{public int $calls=0;function __toString():string{++$this->calls;return 'Z';}};$r=($x[1]=$v);echo 'conversion-unchanged ',json_encode([$x,$r,$v->calls]),"\n";
$x='abc';$v=new class($x){public int $calls=0;function __construct(public mixed &$root){}function __toString():string{++$this->calls;$this->root[0]='Q';return 'Z';}};$r=($x[1]=$v);echo 'conversion-nested ',json_encode([$x,$r,$v->calls]),"\n";
foreach (['empty'=>'','multibyte'=>'é'] as $label=>$out) {$x='abc';$v=new class($x,$out){public int $calls=0;function __construct(public mixed &$root,public string $out){}function __toString():string{++$this->calls;$this->root='abc';return $this->out;}};$r=($x[1]=$v);echo 'conversion-',$label,' ',json_encode([$x,$r,$v->calls]),"\n";}
foreach (['same','changed','nested','throw'] as $action) {
    $o=new ArrayObject(['x'=>'abc']);$wrapper=new ArrayObject($o);
    $first=&$o['x'];$sibling=&$wrapper['x'];
    $v=new class($sibling,$action) {
        public int $calls=0;
        function __construct(public mixed &$slot,public string $action) {}
        function __toString():string {
            ++$this->calls;
            if($this->action==='nested')$this->slot[0]='Q';
            else $this->slot=$this->action==='same'?'abc':'longer';
            if($this->action==='throw')throw new Error('sibling failed');
            return 'Z';
        }
    };
    try{$result=($first[1]=$v);echo 'sibling-',$action,' ',json_encode([$first,$sibling,$o->getArrayCopy(),$result,$v->calls]),"\n";}
    catch(Throwable $e){echo 'sibling-throw ',get_class($e),': ',$e->getMessage(),' ',json_encode([$first,$sibling,$o->getArrayCopy(),$v->calls]),"\n";}
}
$x='abc';$v=new class{public int $calls=0;function __toString():string{++$this->calls;return 'Z';}};$result=($x[-5]=$v);echo 'negative-no-conversion ',json_encode([$x,$result,$v->calls]),"\n";
$x=['child'=>[1]];$result=($x['self']=$x);$x['child'][]=2;echo 'self-copy ',json_encode([$x,$result]),"\n";
$a=new AssignAccess;$key=new stdClass;$value=new stdClass;$result=($a[$key]=$value);echo 'object-handles ',json_encode([$a->calls[0][1]===$key,$a->calls[0][2]===$value,$result===$value]),"\n";
foreach (['ordinary','shared'] as $mode) foreach ([false,true] as $throws) {
    $o=new ArrayObject(['x'=>'abc']);$x='abc';
    if($mode==='shared'){$first=&$o['x'];$sibling=&$o['x'];}else{$first=&$x;$sibling=&$x;}
    $inner=new class($sibling,$throws){public int $calls=0;function __construct(public mixed &$slot,public bool $throws){}function __toString():string{++$this->calls;if($this->throws){$this->slot='longer';throw new Error('inner failed');}return 'Q';}};
    $outer=new class($sibling,$inner){public int $calls=0;public mixed $innerResult=null;function __construct(public mixed &$slot,public object $inner){}function __toString():string{++$this->calls;$this->innerResult=($this->slot[0]=$this->inner);return 'Z';}};
    try{$r=($first[1]=$outer);echo 'nested-object-',$mode,'-',(int)$throws,' ',json_encode([$first,$sibling,$r,$outer->innerResult,$outer->calls,$inner->calls]),"\n";}
    catch(Throwable $e){echo 'nested-object-',$mode,'-1 ',get_class($e),': ',$e->getMessage(),' ',json_encode([$first,$sibling,$outer->innerResult,$outer->calls,$inner->calls]),"\n";}
    unset($first,$sibling);
}
foreach (['replace','reinsert','exchange'] as $action) {
    $o=new ArrayObject(['x'=>'abc']);$first=&$o['x'];$sibling=&$o['x'];
    if($action==='replace')$o['x']='replacement';
    elseif($action==='reinsert'){unset($o['x']);$o['x']='replacement';}
    else $o->exchangeArray(['x'=>'replacement']);
    $v=new class($sibling){function __construct(public mixed &$slot){}function __toString():string{$this->slot='longer';return 'Z';}};
    $r=($first[1]=$v);echo 'detached-coercion-',$action,' ',json_encode([$first,$sibling,$o->getArrayCopy(),$r]),"\n";
    unset($first,$sibling);
}
foreach([null,false] as $i=>$x){$r=($x[]='value');echo 'convert-append',$i,' ',json_encode([$x,array_keys($x),$r]),"\n";}
foreach(['object-key','append'] as $action){$x='abc';$v=new class{public int $calls=0;function __toString():string{++$this->calls;return 'Z';}};try{if($action==='append')$x[]=$v;else $x[new stdClass]=$v;}catch(Throwable $e){echo 'reject-before-conversion-',$action,' ',get_class($e),': ',$e->getMessage(),' ',json_encode([$x,$v->calls]),"\n";}}
