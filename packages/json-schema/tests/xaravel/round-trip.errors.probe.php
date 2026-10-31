<?php
// The PHP evidence for XT-json-schema-2's Deserializer cases that Upstream's tests do not reach (round-trip.test.ts,
// `DESERIALIZER_CASES`): Upstream's illuminate/json-schema at the Pin
// (conformance/upstream/framework/src/Illuminate/JsonSchema), loaded as it is, deserializes each raw schema below.
// Each line is `<label>\t<json_encode($value)>\t<floats>`, where `$value` is `(string) JsonSchema::fromArray($schema)`
// (the pretty-printed JSON, byte for byte), or `!<class>: <message>` when Upstream throws, and `<floats>` is
// `json_encode($type->toArray(), JSON_PRESERVE_ZERO_FRACTION)`, which shows an int/float distinction the pretty bytes
// hide (empty when Upstream throws). The test builds the same schemas,
// in the same order, and compares. Regenerate the record with the host's PHP 8.5, from this directory:
//   php -d error_reporting=0 round-trip.errors.probe.php > round-trip.errors.probe.txt

$src = __DIR__.'/../../../../conformance/upstream/framework/src/Illuminate';

spl_autoload_register(function (string $class) use ($src) {
    foreach (['Illuminate\\JsonSchema\\' => '/JsonSchema/', 'Illuminate\\Contracts\\' => '/Contracts/'] as $prefix => $dir) {
        if (str_starts_with($class, $prefix)) {
            require $src.$dir.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';

            return;
        }
    }
});

use Illuminate\JsonSchema\JsonSchema;

// A `$ref` chain that fans out: `d<i>` has two properties that both reference `d<i+1>`, 15 levels deep.
$fanOut = [];
for ($i = 0; $i < 15; $i++) {
    $fanOut['d'.$i] = ['type' => 'object', 'properties' => ['a' => ['$ref' => '#/$defs/d'.($i + 1)], 'b' => ['$ref' => '#/$defs/d'.($i + 1)]]];
}
$fanOut['d15'] = ['type' => 'string'];

$cases = [
    'ref-non-schema-target' => ['$ref' => '#/$defs/x', '$defs' => ['x' => 'str']],
    'max-nodes-fan-out' => ['$ref' => '#/$defs/d0', '$defs' => $fanOut],
    'ref-escaped-slash' => ['$ref' => '#/$defs/a~1b', '$defs' => ['a/b' => ['type' => 'string', 'minLength' => 1]]],
    'ref-escaped-tilde' => ['$ref' => '#/$defs/a~0b', '$defs' => ['a~b' => ['type' => 'integer', 'minimum' => 2]]],
    'ref-percent-encoded' => ['$ref' => '#/$defs/a%20b', '$defs' => ['a b' => ['type' => 'boolean']]],
    'ref-list-index' => ['$ref' => '#/$defs/list/0', '$defs' => ['list' => [['type' => 'number', 'maximum' => 3]]]],
    'ref-used-twice' => [
        'type' => 'object',
        'properties' => [
            'x' => ['$ref' => '#/$defs/n', 'description' => 'X'],
            'y' => ['$ref' => '#/$defs/n'],
        ],
        '$defs' => ['n' => ['type' => 'string', 'description' => 'N']],
    ],
    'number-numeric-string-bound' => ['type' => 'number', 'minimum' => '7.0'],
    'integer-string-and-float-bounds' => ['type' => 'integer', 'minimum' => '5', 'maximum' => 7.0],
];

foreach ($cases as $label => $schema) {
    $floats = '';
    try {
        $type = JsonSchema::fromArray($schema);
        $value = (string) $type;
        $floats = json_encode($type->toArray(), JSON_PRESERVE_ZERO_FRACTION);
    } catch (Throwable $e) {
        $value = '!'.get_class($e).': '.$e->getMessage();
    }
    echo $label, "\t", json_encode($value), "\t", $floats, "\n";
}
