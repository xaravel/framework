<?php
// The PHP evidence for XT-json-schema-2 (round-trip.test.ts): Upstream's illuminate/json-schema at the Pin
// (conformance/upstream/framework/src/Illuminate/JsonSchema), loaded as it is, round-trips each schema the capture
// preload (round-trip.capture.ts) records from Story 16.1's tests. It reads the capture's records, one JSON line each,
// on stdin; each record's `first` is a serialized schema, `json_encode(Serializer::serialize($type),
// JSON_PRESERVE_ZERO_FRACTION)`. It decodes `first` as the PHP array it encodes, and prints `<first>\t<second>`, one
// line per distinct `first` in byte order, where `<second>` is
// `json_encode(Serializer::serialize(JsonSchema::fromArray($schema)), JSON_PRESERVE_ZERO_FRACTION)`, or
// `!<class>: <message>` when Upstream throws. Regenerate the record with the host's PHP 8.5, from the repository root,
// where <files> are the files round-trip.test.ts runs (Story 16.1's Ported Test files and serializer.test.ts):
//   JSON_SCHEMA_ROUND_TRIP_OUT=/tmp/records.jsonl bun --no-env-file test \
//     --preload ./packages/json-schema/tests/xaravel/round-trip.capture.ts <files>
//   php -d error_reporting=0 packages/json-schema/tests/xaravel/round-trip.probe.php < /tmp/records.jsonl \
//     > packages/json-schema/tests/xaravel/round-trip.probe.txt

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
use Illuminate\JsonSchema\Serializer;

$lines = [];
while (($line = fgets(STDIN)) !== false) {
    $line = rtrim($line, "\n");
    if ($line !== '') {
        $lines[json_decode($line, true, 512, JSON_THROW_ON_ERROR)['first']] = true;
    }
}
$lines = array_keys($lines);
sort($lines, SORT_STRING);

foreach ($lines as $first) {
    try {
        $second = json_encode(Serializer::serialize(JsonSchema::fromArray(json_decode($first, true, 512, JSON_THROW_ON_ERROR))), JSON_PRESERVE_ZERO_FRACTION);
    } catch (Throwable $e) {
        $second = '!'.get_class($e).': '.$e->getMessage();
    }
    echo $first, "\t", $second, "\n";
}
