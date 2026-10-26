<?php
// The PHP 8.5.11 evidence for XT-runtime-51 and XT-runtime-53..55 (php-builtins.test.ts), action item
// epic-14-item-1-runtime-php-types. Each line is `<label>\t<json_encode(value)>`; XT-runtime-56 computes every label
// with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`, the object id in
// `Object <class>#<id>` written `#<n>`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-builtins.probe.php > php-builtins.probe.txt

namespace XaravelFixture\PhpBuiltins {
    class SubIterator extends \ArrayIterator
    {
        public function __construct()
        {
            throw new \Error("SubIterator's constructor ran");
        }
    }

    class InnerIterator extends \ArrayIterator
    {
        public function __toString(): string
        {
            return 'inner@' . $this->key();
        }
    }

    class MembersObject extends \ArrayObject
    {
        protected $p = 1;
        private $q = 2;
        public $r = 3;
    }
}

namespace {
    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value), "\n";
    }

    function thrown(callable $f): ?string
    {
        try {
            $f();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . preg_replace('/(Object \S+)#\d+/', '$1#<n>', $e->getMessage());
        }
        return null;
    }

    function walk(Iterator $it): array
    {
        $pairs = [];
        for ($it->rewind(); $it->valid(); $it->next()) {
            $pairs[] = [$it->key(), $it->current()];
        }
        return $pairs;
    }

    // XT-runtime-51
    $values = [null, true, 1, 1.5, 2.0, 's', [], new stdClass(), fn () => 1];
    out('gettype', array_map('gettype', $values));
    out('get_debug_type', array_map('get_debug_type', $values));
    out('get_debug_type.anon_extends_ArrayObject', get_debug_type(new class extends ArrayObject {}));
    out('get_debug_type.anon', get_debug_type(new class {}));
    out('array_keys.normalised', array_keys(['07' => 1, '7' => 1, true => 1, null => 1, 2.9 => 1]));
    out('offset.array', thrown(function () {
        $a = [];
        $a[[]] = 1;
    }));

    // XT-runtime-53: ArrayIterator
    $it = new ArrayIterator(['a' => 1]);
    $it[] = 'x';
    $it[] = 'y';
    out('ArrayIterator.walk', walk($it));
    out('ArrayIterator.past_end', [$it->valid(), $it->key(), $it->current(), count($it)]);
    out('ArrayIterator.values', iterator_to_array($it, false));
    $n = new ArrayIterator(['n' => null]);
    out('ArrayIterator.offsetExists_null', [$n->offsetExists('n'), $n->offsetExists('m'), $n->offsetGet('n')]);

    // The hash position
    $i = new ArrayIterator(['a' => 1, 'b' => 2]);
    $i->next();
    $i->next();
    unset($i['b']);
    $i['c'] = 3;
    out('position.end_unset_set', [$i->valid(), $i->key()]);
    $i = new ArrayIterator(['a' => 1, 'b' => 2]);
    $i->next();
    $i->next();
    unset($i['b']);
    $i[] = 5;
    out('position.end_unset_push', [$i->valid(), $i->key()]);
    $i = new ArrayIterator(['a' => 1, 'b' => 2, 'c' => 3]);
    $i->next();
    unset($i['b']);
    $keys = [$i->key()];
    $i->next();
    $keys[] = $i->key();
    out('position.delete_current', $keys);
    $i = new ArrayIterator(['a' => 1, 'b' => 2]);
    $i->next();
    unset($i['b']);
    $keys = [$i->valid()];
    $i['z'] = 1;
    $keys[] = $i->key();
    out('position.delete_last_then_set', $keys);
    $i = new ArrayIterator(['a' => 1, 'b' => 2, 'c' => 3]);
    unset($i['a']);
    $i['a'] = 9;
    out('position.reset_unpositioned', $i->key());
    $i = new ArrayIterator(['a' => 1, 'b' => 2, 'c' => 3]);
    $i->rewind();
    unset($i['a']);
    $i['a'] = 9;
    out('position.reset_rewound', $i->key());
    foreach (['ArrayIterator', 'ArrayObject'] as $class) {
        $subject = new $class(['a' => 1, 'b' => 2, 'c' => 3]);
        $keys = [];
        $done = false;
        foreach ($subject as $key => $value) {
            $keys[] = $key;
            if ($key === 'a' && !$done) {
                $done = true;
                unset($subject['a']);
                $subject['a'] = 9;
            }
        }
        out("foreach.reset.$class", $keys);
    }

    // exchangeArray
    foreach (['pqr' => ['p' => 1, 'q' => 2, 'r' => 3], 'p' => ['p' => 1]] as $name => $next) {
        $keys = [];
        foreach ([0, 1, 2, 3] as $steps) {
            $o = new ArrayObject(['x' => 1, 'y' => 2, 'z' => 3]);
            $i = $o->getIterator();
            for ($j = 0; $j < $steps; $j++) {
                $i->next();
            }
            $o->exchangeArray($next);
            $keys[] = $i->key();
        }
        out("exchangeArray.position.$name", $keys);
    }
    $o = new ArrayObject(['x' => 1, 'y' => 2, 'z' => 3]);
    $keys = [];
    foreach ($o as $key => $value) {
        $keys[] = $key;
        if ($key === 'x') {
            $o->exchangeArray(['p' => 1, 'q' => 2, 'r' => 3]);
        }
    }
    out('exchangeArray.foreach', $keys);
    $o = new ArrayObject(['x' => 1, 'y' => 2]);
    out('exchangeArray.returns', [$o->exchangeArray([1, 2]), $o->getArrayCopy()]);

    // Wrapping another SPL array object
    $in = new ArrayObject([1]);
    $wrapper = new ArrayObject($in);
    $wrapper[] = 2;
    out('wrap.count_inner', count($in));
    out('wrap.serialize', serialize($wrapper));
    $wrapper->exchangeArray([5, 6]);
    out('wrap.after_exchange', [$in->getArrayCopy(), $wrapper->getArrayCopy()]);
    $target = new ArrayObject([1]);
    $exchanged = new ArrayObject([0]);
    $exchanged->exchangeArray($target);
    $exchanged[] = 7;
    $over = new ArrayIterator($target);
    $over[] = 8;
    out('wrap.exchanged_to_object', $target->getArrayCopy());
    $in = new ArrayObject(['x' => 1, 'y' => 2, 'z' => 3]);
    $wrapper = new ArrayObject($in);
    $i = $wrapper->getIterator();
    $i->next();
    $wrapper->exchangeArray(['p' => 1, 'q' => 2, 'r' => 3]);
    out('wrap.iterator_after_outer_exchange', [$i->key(), count($in)]);
    $source = [[1]];
    $o = new ArrayObject($source);
    $source[0][] = 2;
    $copy = $o->getArrayCopy();
    $copy[0][] = 3;
    out('copy.nested', $o->getArrayCopy());

    // Serialization and json_encode
    out('serialize.ArrayObject', serialize(new ArrayObject([1, 2])));
    out('serialize.ArrayIterator', serialize(new ArrayIterator([1])));
    out('serialize.getIterator_flags', serialize((new ArrayObject([1], ArrayObject::ARRAY_AS_PROPS))->getIterator()));
    $i = new ArrayIterator(['a' => 1, 'b' => 2]);
    $i->next();
    $s = serialize($i);
    $r = unserialize($s);
    out('serialize.ArrayIterator_round_trip', [$s, $r->key(), $r->getArrayCopy()]);
    out('serialize.members', serialize(new XaravelFixture\PhpBuiltins\MembersObject([1])));
    out('json_encode', [json_encode(new ArrayObject([1, 2])), json_encode(new ArrayObject(['a' => 1])), json_encode(new ArrayObject())]);

    // Flags
    $o = new ArrayObject([], 0x01000005);
    $flags = [$o->getFlags()];
    $o->setFlags(0x02000006);
    $flags[] = $o->getFlags();
    $flags[] = (new ArrayObject([1], ArrayObject::ARRAY_AS_PROPS))->getIterator()->getFlags();
    $o = new ArrayObject([], 0x02000000);
    $o->__unserialize([0x04000003, [], []]);
    $flags[] = $o->getFlags();
    out('flags', $flags);

    // __unserialize
    foreach ([[0], [0, []], ['x', [], []], [0, [], 'x'], [0, [], [], 1], [0, 5, []], [0, [], [], 'Foo'], [0, [], [], 'stdClass']] as $index => $data) {
        out("__unserialize.$index", thrown(fn () => (new ArrayObject())->__unserialize($data)));
    }
    $o = new ArrayObject([9]);
    $o->__unserialize([0, ['a' => 1], ['foo' => 'bar'], null]);
    out('__unserialize.restores', [$o->getArrayCopy(), $o->foo, serialize($o)]);

    // setIteratorClass
    out('setIteratorClass.stdClass', thrown(fn () => (new ArrayObject())->setIteratorClass('stdClass')));
    out('construct.iteratorClass', thrown(fn () => new ArrayObject([], 0, 'stdClass')));
    $o = new ArrayObject([1, 2]);
    $o->setIteratorClass('XaravelFixture\PhpBuiltins\SubIterator');
    $i = $o->getIterator();
    out('setIteratorClass.sub', [get_class($i), iterator_to_array($i, false), $o->getIteratorClass(), serialize($o), unserialize(serialize($o))->getIteratorClass()]);

    // Argument errors
    out('construct.ArrayIterator.int', thrown(fn () => new ArrayIterator(5)));
    out('construct.ArrayObject.string', thrown(fn () => new ArrayObject('s')));
    out('construct.ArrayObject.null', thrown(fn () => new ArrayObject(null)));
    out('exchangeArray.int', thrown(fn () => (new ArrayObject())->exchangeArray(1)));

    // XT-runtime-54: CachingIterator
    out('CachingIterator.constants', [
        CachingIterator::CALL_TOSTRING,
        CachingIterator::TOSTRING_USE_KEY,
        CachingIterator::TOSTRING_USE_CURRENT,
        CachingIterator::TOSTRING_USE_INNER,
        CachingIterator::CATCH_GET_CHILD,
        CachingIterator::FULL_CACHE,
    ]);
    $c = new CachingIterator(new ArrayIterator(['a' => 'x', 'b' => 'y']));
    $before = [$c->getFlags(), $c->valid(), $c->current(), $c->hasNext(), (string) $c];
    $seen = [];
    foreach ($c as $key => $value) {
        $seen[] = [$key, $value, $c->hasNext(), (string) $c];
    }
    out('CachingIterator.default', [$before, $seen, $c->valid(), $c->key(), $c->current(), (string) $c]);
    $c = new CachingIterator(new ArrayIterator([1.5, null, true]));
    $strings = [];
    foreach ($c as $value) {
        $strings[] = (string) $c;
    }
    out('CachingIterator.CALL_TOSTRING', $strings);
    $keyed = new CachingIterator(new ArrayIterator(['a' => 1, 'b' => 2]), CachingIterator::TOSTRING_USE_KEY);
    $keyed->rewind();
    $current = new CachingIterator(new ArrayIterator(['a' => 1, 'b' => 2]), CachingIterator::TOSTRING_USE_CURRENT);
    $current->rewind();
    out('CachingIterator.USE_KEY_CURRENT', [(string) $keyed, (string) $current]);
    out('CachingIterator.USE_INNER.no_string', thrown(fn () => (new CachingIterator(new ArrayIterator(['a' => 1]), CachingIterator::TOSTRING_USE_INNER))->rewind()));
    $c = new CachingIterator(new XaravelFixture\PhpBuiltins\InnerIterator(['a' => 1, 'b' => 2]), CachingIterator::TOSTRING_USE_INNER);
    $strings = [];
    foreach ($c as $value) {
        $strings[] = (string) $c;
    }
    out('CachingIterator.USE_INNER', $strings);
    $c = new CachingIterator(new ArrayIterator(['a' => 1, 'b' => 2, 'c' => 3]), CachingIterator::FULL_CACHE);
    $c->rewind();
    out('CachingIterator.FULL_CACHE.first', [$c->getCache(), count($c)]);
    out('CachingIterator.FULL_CACHE', [iterator_to_array($c, false), $c->getCache(), count($c)]);
    $inner = new ArrayIterator(['a' => 1, 'b' => 2, 'c' => 3]);
    $c = new CachingIterator($inner, CachingIterator::FULL_CACHE);
    iterator_to_array($c, false);
    unset($inner['b']);
    $c->rewind();
    out('CachingIterator.FULL_CACHE.rewind_after_unset', [iterator_to_array($c, false), $c->getCache()]);
    $c = new CachingIterator(new ArrayIterator(['a' => [1]]), CachingIterator::FULL_CACHE);
    $c->rewind();
    $cache = $c->getCache();
    $cache['a'][] = 2;
    out('CachingIterator.FULL_CACHE.copy', $c->getCache());
    $generator = (function () {
        yield 'a' => 1;
        yield new stdClass() => 2;
        yield 'c' => 3;
    })();
    $c = new CachingIterator(new IteratorIterator($generator), CachingIterator::FULL_CACHE);
    $before = [];
    $error = thrown(function () use ($c, &$before) {
        foreach ($c as $key => $value) {
            $before[] = "$key=$value";
        }
    });
    out('CachingIterator.FULL_CACHE.object_key', [$error, $before, $c->valid(), $c->current(), is_object($c->key()), $c->getCache(), $c->hasNext()]);
    $plain = new CachingIterator(new ArrayIterator(['a' => 'x']), 0);
    out('CachingIterator.errors', [
        thrown(fn () => (string) $plain),
        thrown(fn () => $plain->getCache()),
        thrown(fn () => count($plain)),
        thrown(fn () => new CachingIterator(new ArrayIterator([]), CachingIterator::CALL_TOSTRING | CachingIterator::TOSTRING_USE_KEY)),
        thrown(fn () => new CachingIterator(new ArrayIterator([]), CachingIterator::TOSTRING_USE_KEY | CachingIterator::TOSTRING_USE_INNER)),
        thrown(fn () => new CachingIterator([1])),
        thrown(fn () => new CachingIterator(new ArrayObject())),
    ]);

    // XT-runtime-55: WeakMap
    $w = new WeakMap();
    $a = new stdClass();
    $b = new stdClass();
    $w[$b] = 1;
    $w[$a] = 2;
    $w[$b] = 3;
    $order = [];
    foreach ($w as $key => $value) {
        $order[] = ($key === $a ? 'a' : 'b') . "=$value";
    }
    out('WeakMap.order', [$order, count($w), $w[$b]]);
    $it = $w->getIterator();
    $walk = [[$it->valid(), $it->key() === $b, $it->current()]];
    $it->next();
    $it->next();
    $walk[] = [$it->valid(), $it->key(), $it->current()];
    $c = new stdClass();
    $w[$c] = 4;
    $walk[] = [$it->valid(), $it->key() === $c];
    unset($w[$c]);
    out('WeakMap.iterator', $walk);
    $w[$a] = null;
    $exists = [$w->offsetExists($a), isset($w[$a]), $w->offsetExists($b)];
    unset($w[$a]);
    unset($w[$a]);
    $exists[] = count($w);
    out('WeakMap.null_and_unset', $exists);
    $errors = [];
    foreach ([1, 's', []] as $key) {
        $errors[] = [
            thrown(fn () => $w->offsetSet($key, 1)),
            thrown(fn () => $w->offsetGet($key)),
            thrown(fn () => $w->offsetExists($key)),
            thrown(fn () => $w->offsetUnset($key)),
        ];
    }
    out('WeakMap.key_errors', $errors);
    out('WeakMap.errors', [
        thrown(fn () => $w[] = 1),
        thrown(fn () => $w[new stdClass()]),
        thrown(fn () => $w[new ArrayObject()]),
        thrown(fn () => serialize($w)),
        thrown(fn () => unserialize('O:7:"WeakMap":0:{}')),
        thrown(fn () => serialize($w->getIterator())),
        thrown(fn () => unserialize('O:16:"InternalIterator":0:{}')),
        thrown(fn () => new InternalIterator()),
        json_encode($w),
    ]);
}
