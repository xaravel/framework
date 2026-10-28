<?php
// Independently executed with PHP 8.5.11 CLI. Notices/deprecations omitted under DIV-9.17.
error_reporting(0);
echo 'PHP ', PHP_VERSION, "\n";
function row($name,...$values){echo $name,' ',json_encode($values),"\n";}
function acquire($name,$x,$key){try{if($key===null)$r=&$x[];else $r=&$x[$key];row($name,$x,$r);$r=[7];row($name.'-write',$x,$r);}catch(Throwable $e){row($name,get_class($e),$e->getMessage(),$x);}}
foreach([null,false,true,12,1.5] as $i=>$x)acquire('scalar'.$i,$x,'x');
foreach([null,false,[]] as $i=>$x)acquire('invalid'.$i,$x,[]);
foreach([0,1,-1,5,-5,'0','01','1x','1.5',' 1 ',true,false,1.75,[],new stdClass,null,'9223372036854775808','-9223372036854775809','1e0','1.0','0x1',' 1x','x1'] as $i=>$k)acquire('string'.$i,'abc',$k);
foreach([[[],'x'],[[1],0],[['x'=>1],'x'],[['a'=>1,2=>3],2],[[],null]] as $i=>[$x,$k])acquire('array'.$i,$x,$k);
foreach(['2','02',true,false,2.75,-2,PHP_INT_MAX,'__proto__'] as $i=>$k)acquire('key'.$i,[],$k);
acquire('overflow',[PHP_INT_MAX=>'max'],null);
acquire('object',new stdClass,'x');
class ReferenceInherited extends ArrayObject{}
class ReferenceValue extends ArrayObject{function offsetGet($k):mixed{return parent::offsetGet($k);}}
class ReferenceUser implements ArrayAccess{public array $calls=[];function offsetExists($k):bool{$this->calls[]=['exists',$k];return false;}function offsetGet($k):mixed{$this->calls[]=['get',$k];return [];}function offsetSet($k,$v):void{$this->calls[]=['set',$k,$v];}function offsetUnset($k):void{}}
foreach([new ArrayObject(['x'=>[]]),new ReferenceInherited(['x'=>[]]),new ReferenceValue(['x'=>[]])] as $i=>$x){$r=&$x['x'];$r[] =7;row('access'.$i,$x->getArrayCopy(),$r);unset($r);}
$x=new ArrayObject;$r=&$x[null];$r[]=7;row('access-null',$x->getArrayCopy(),$r);unset($r);
$x=new ReferenceUser;$r=&$x[null];$r[]=7;row('user',$x->calls,$r);unset($r);
$x=['x'=>[1],'y'=>[2]];$a=&$x['x'];$b=&$x['x'];$a=[3];row('shared',$x,$a,$b);$x['y']=[4];$x['x']=[5];row('overwrite',$x,$a,$b);unset($x['x']);$a[]=6;row('unset',$x,$a,$b);$x['x']=[7];$b[]=8;row('reinsert',$x,$a,$b);$x=[];$a[]=9;row('replace',$x,$a,$b);unset($a,$b);
$x=['x'=>[1]];$r=&$x['x'];$copy=$x;$r[]=2;row('copy-after-reference',$x,$copy,$r);unset($r);
$x=['x'=>[1]];$copy=$x;$r=&$x['x'];$r[]=2;row('copy-before-reference',$x,$copy,$r);unset($r);
foreach(['0.z','1.z','y.z','0'] as $path){$x='abc';try{foreach(explode('.',$path) as $key){$x[$key]=[];$r=&$x[$key];}$r[]=7;row('chain-'.$path,$x,$r);}catch(Throwable $e){row('chain-'.$path,get_class($e),$e->getMessage(),$x);}unset($r);}
$x=['x'=>['y'=>[1]]];$a=&$x['x']['y'];$b=&$x['x']['y'];$a[] =2;row('nested-shared',$x,$a,$b);$sibling=&$x['x']['sibling'];$sibling=[3];$b[]=4;row('nested-sibling',$x,$a,$b,$sibling);unset($a,$b,$sibling);
foreach([true,false] as $after){$x=['x'=>[1],2=>'mixed'];if($after){$r=&$x['x'];$copy=$x;}else{$copy=$x;$r=&$x['x'];}$r[]=2;row('mixed-copy-'.($after?'after':'before'),$x,$copy,$r);$copy['x']=[8];row('mixed-copy-write-'.($after?'after':'before'),$x,$copy,$r);unset($r);}
// Repair evidence: surviving references travel with entries through array operations.
foreach(['append','pop','sort','shift','unshift','splice'] as $operation){
 $x=[2,1,9];$r=&$x[0];
 switch($operation){case 'append':$x[]=4;break;case 'pop':array_pop($x);break;case 'sort':sort($x);break;case 'shift':array_shift($x);break;case 'unshift':array_unshift($x,4);break;case 'splice':$removed=array_splice($x,1,1,[4]);break;}
 $r=7;row('repair-'.$operation,$x,$r);unset($r);
}
foreach(['cast','filter','slice','values'] as $operation){$x=['x'=>2,'y'=>1,'z'=>9];$r=&$x['x'];$copy=match($operation){'cast'=>(array)$x,'filter'=>array_filter($x),'slice'=>array_slice($x,0,2),'values'=>array_values($x)};$r=7;row('repair-'.$operation,$x,$copy,$r);unset($r);}
$x=[2,1,9];$r=&$x[2];array_splice($x,1);$copy=$x;$r=7;row('repair-truncate',$x,$copy,$r);unset($r);
$x=['x'=>1,2=>'mixed'];$r=&$x['x'];unset($x['x']);$copy=$x;$r=7;row('repair-delete-mixed',$x,$copy,$r);unset($r);
$x=['x'=>1,'y'=>2];$r=&$x['x'];unset($x['x']);$copy=$x;$r=7;row('repair-delete-map',$x,$copy,$r);unset($r);
$x=['x'=>1,'y'=>2];$r=&$x['x'];$copy=$x;$shared=&$copy['x'];$left=&$x['y'];$right=&$copy['y'];$shared=7;$left=8;$right=9;row('repair-copy-acquire',$x,$copy,$r,$shared,$left,$right);unset($r,$shared,$left,$right);
$x=['slot'=>null];$r=&$x['slot'];$r=[];$r['self']=&$r;$copy=$x;$r['tag']=7;row('repair-recursive',isset($copy['slot']['self']['self']),$copy['slot']['tag'],$copy['slot']['self']['tag']);unset($r,$x,$copy);
$x=[2,1,9];$r=&$x[1];array_shift($x);$r=7;row('repair-shift-survivor',$x,$r);unset($r);
$x=[2,1,9];$r=&$x[2];$removed=array_pop($x);$r=7;row('repair-pop-removed',$x,$removed,$r);unset($r);
$x=[2,1,9];$r=&$x[1];$removed=array_splice($x,1,1,[4]);$r=7;row('repair-splice-removed',$x,$removed,$r);unset($r);
$x=[2,1,9];$r=&$x[0];$copy=(array)$x;$r=7;row('repair-cast-list',$x,$copy,$r);unset($r);
foreach(['combine','merge','merge-overwrite','unique','reverse','chunk','pad','union','diff','intersect','replace','replace-recursive'] as $operation){
 $x=['x'=>2,'y'=>1,'z'=>2];$r=&$x['x'];
 $copy=match($operation){
  'combine'=>array_combine(['a','b','c'],$x),
  'merge'=>array_merge($x,['extra'=>4]),
  'merge-overwrite'=>array_merge($x,['x'=>8]),
  'unique'=>array_unique($x),
  'reverse'=>array_reverse($x),
  'chunk'=>array_chunk($x,2),
  'pad'=>array_pad($x,4,4),
  'union'=>$x+['x'=>8,'extra'=>4],
  'diff'=>array_diff($x,[1]),
  'intersect'=>array_intersect($x,[2]),
  'replace'=>array_replace($x,['y'=>8]),
  'replace-recursive'=>array_replace_recursive($x,['y'=>8])};
 $r=7;row('extended-'.$operation,$x,$copy,$r);unset($r);
}
$x=['x'=>1,'y'=>2];$r=&$x['x'];unset($x['x']);$x['x']=8;$copy=$x;$r=7;row('extended-unset-reinsert',$x,$copy,$r);unset($r);
foreach(['replace-recursive-collision','merge-recursive-collision','merge-recursive-single'] as $operation){
 $x=['slot'=>['a'=>1]];$r=&$x['slot'];
 $copy=match($operation){'replace-recursive-collision'=>array_replace_recursive($x,['slot'=>['b'=>2]]),'merge-recursive-collision'=>array_merge_recursive($x,['slot'=>['b'=>2]]),'merge-recursive-single'=>array_merge_recursive($x)};
 $r['a']=7;row('deep-repair-'.$operation,$x,$copy,$r);unset($r);
}
$x=[1];$r=&$x[0];$copy=array_map(null,$x,[2]);$r=7;row('live-map-multiple',$x,$copy,$r);unset($r);
class ReferenceMutatingKey{function __construct(public mixed &$slot){}function __toString():string{$this->slot=7;return 'key';}}
$x=[1];$r=&$x[0];$copy=array_combine([new ReferenceMutatingKey($r)],$x);row('live-combine-key',$x,$copy,$r);unset($r);
$x=[1,2];$r=&$x[1];$seen=[];$copy=array_filter($x,function($v)use(&$r,&$seen){$seen[]=$v;$r=7;return true;});row('live-filter-callback',$x,$copy,$seen);unset($r);
$x=[3,1,2];$r=&$x[0];$seen=[];uasort($x,function($a,$b)use(&$r,&$seen){$seen[]=[$a,$b];$r=7;return $a<=>$b;});row('live-sort-callback',$x,$r,$seen);unset($r);
foreach(['replace','replace-recursive']as$op){$x=['x'=>1];$r=&$x['x'];$copy=$op==='replace'?array_replace($x,['x'=>8]):array_replace_recursive($x,['x'=>8]);row('live-'.$op.'-before',$x,$copy,$r);$r=7;row('live-'.$op.'-after',$x,$copy,$r);unset($r);}
foreach(['replace','merge']as$op){$source=['x'=>['b'=>2]];$r=&$source['x'];$copy=$op==='replace'?array_replace_recursive(['x'=>['a'=>1]],$source):array_merge_recursive(['x'=>['a'=>1]],$source);$r['b']=7;row('live-source-'.$op,$source,$copy,$r);unset($r);}
$x=[1];$r=&$x[0];$target=[8,9];$removed=array_splice($target,0,1,$x);$r=7;row('live-splice-replacement',$x,$target,$removed,$r);unset($r);
$x=[1,2];$r=&$x[0];$copy=array_combine(['same','same'],$x);$r=7;row('live-combine-duplicate',$x,$copy,$r);unset($r);
foreach(['sort','filter','remove']as$op){$x=[1];$r=&$x[0];$shared=array_merge($x,$x);if($op==='sort')sort($shared);elseif($op==='filter')$shared=array_filter($shared);else array_shift($shared);$r=7;row('live-shared-'.$op,$x,$shared,$r);unset($r);}
$x=[PHP_INT_MAX=>1];$r=&$x[PHP_INT_MAX];try{$x[]=2;}catch(Throwable $e){row('live-overflow-error',get_class($e),$e->getMessage(),$x,$r);}$r=7;row('live-overflow-write',$x,$r);unset($r);
$x=[1,2];$a=&$x[0];$b=&$x[1];$copy=array_filter($x,function($v)use(&$b){$b=0;return (bool)$v;});row('live-filter-future-zero',$x,$copy,$a,$b);unset($a,$b);
