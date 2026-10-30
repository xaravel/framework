<?php
// PHP 8.5.11 executable evidence for XT-collections-21 (Collection methods over stdClass items and jsonDecode objects,
// action item epic-14-retro-item-6-stdclass-props-hook). It loads Upstream at the Pin, with a small autoloader over the
// Pin's `src/Illuminate`, so every value below is Laravel 13.37.0's. Each line is `<label>\t<json>`. The test
// recomputes every label and compares it with the recorded value.
// Regenerate with: php -d error_reporting=0 stdclass-items.probe.php > stdclass-items.probe.txt
error_reporting(0);
$src = __DIR__ . '/../../../../conformance/upstream/framework/src/Illuminate';
spl_autoload_register(function ($class) use ($src) {
    $relative = str_replace('\\', '/', $class);
    foreach ([
        'Illuminate/Support/Traits/' => ['Collections/Traits/', 'Macroable/Traits/', 'Conditionable/Traits/'],
        'Illuminate/Contracts/' => ['Contracts/'],
        'Illuminate/Support/' => ['Collections/', 'Conditionable/'],
    ] as $prefix => $dirs) {
        if (str_starts_with($relative, $prefix)) {
            foreach ($dirs as $dir) {
                $file = $src . '/' . $dir . substr($relative, strlen($prefix)) . '.php';
                if (is_file($file)) {
                    require $file;
                    return;
                }
            }
        }
    }
});
require $src . '/Collections/helpers.php';

use Illuminate\Support\LazyCollection;

function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function items() { return collect([(object) ['a' => 1], (object) ['a' => 1], (object) ['a' => 2]]); }

out('contains', [items()->contains((object) ['a' => 1]), items()->contains((object) ['a' => 3])]);
out('unique', items()->unique()->all());
out('max_min', [items()->max()->a, items()->min()->a]);
out('sort', [items()->sort()->values()->all(), items()->sortDesc()->values()->all()]);
$decoded = collect(json_decode('[{"a":1},{"a":1},{"a":2}]'));
out('json_decode', [$decoded->unique()->count(), $decoded->contains(json_decode('{"a":1}'))]);
out('json_decode.order', [$decoded->max()->a, $decoded->min()->a, $decoded->sort()->values()->all()]);
$lazy = fn () => LazyCollection::make([(object) ['a' => 1], (object) ['a' => 1], (object) ['a' => 2]]);
out('lazy', [$lazy()->unique()->count(), $lazy()->contains((object) ['a' => 1]), $lazy()->contains((object) ['a' => 3])]);
