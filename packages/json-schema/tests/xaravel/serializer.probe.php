<?php
// The PHP evidence for XT-json-schema-1 (serializer.test.ts): Upstream's illuminate/json-schema at the Pin
// (conformance/upstream/framework/src/Illuminate/JsonSchema), loaded as it is, serializes each fluent schema below.
// Each line is `<label>\t<json_encode((string) $schema)>`; the test builds the same schema with @xaravel/json-schema
// and compares `toString()` with the recorded string, byte for byte. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5, from this directory:
//   php -d error_reporting=0 serializer.probe.php > serializer.probe.txt

namespace XaravelFixture\JsonSchema {
    enum Status: string
    {
        case Draft = 'draft';
        case Published = 'published';
    }

    enum Level: int
    {
        case Low = 1;
        case High = 3;
    }
}

namespace {
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
    use Illuminate\JsonSchema\JsonSchemaTypeFactory;
    use XaravelFixture\JsonSchema\Level;
    use XaravelFixture\JsonSchema\Status;

    $cases = [
        'string-all' => fn () => JsonSchema::string()->title('Name')->description('Full name')->min(1)->max(80)->pattern('^[A-Za-z /]+$')->format('email')->default('a/b')->enum(['a/b', 'é'])->nullable(),
        'integer-all' => fn () => JsonSchema::integer()->min(-5)->max(120)->multipleOf(5)->default(10)->enum([0, 5, 10])->title('Age'),
        'number-all' => fn () => JsonSchema::number()->min(0.0)->max(10.5)->multipleOf(0.25)->default(1.0)->enum([1, 2.5, 3.0]),
        'boolean-all' => fn () => JsonSchema::boolean()->default(false)->enum([true, false])->description('Flag')->nullable(),
        'array-all' => fn () => JsonSchema::array()->items(JsonSchema::string()->max(3))->min(1)->max(5)->unique()->default(['a', 'b'])->title('Tags'),
        'array-unset-unique' => fn () => JsonSchema::array()->unique()->unique(false)->enum([[], ['x']]),
        'object-nested' => fn () => JsonSchema::object([
            'id' => JsonSchema::integer()->required(),
            'profile' => JsonSchema::object([
                'name' => JsonSchema::string()->required(),
                'tags' => JsonSchema::array()->items(JsonSchema::string()),
            ])->withoutAdditionalProperties()->required(),
            'meta' => JsonSchema::object()->default(['a' => 1, 'b' => [1, 2]]),
        ])->title('User')->description('A user'),
        'object-numeric-keys' => fn () => JsonSchema::object([
            '10' => JsonSchema::string()->required(),
            '2' => JsonSchema::string(),
            'x' => JsonSchema::boolean()->required(),
        ]),
        'object-closure' => fn () => JsonSchema::object(fn (JsonSchemaTypeFactory $schema) => [
            'a' => $schema->string()->required()->required(false),
            'b' => $schema->number()->nullable()->nullable(false),
        ]),
        'object-empty' => fn () => JsonSchema::object([])->withoutAdditionalProperties()->enum([['a' => 1], []]),
        'union-null' => fn () => JsonSchema::union(['number', 'null', 'string', 'number'])->title('Value')->nullable(),
        'union-plain' => fn () => JsonSchema::union(['integer', 'boolean'])->enum([1, true])->description('Mixed'),
        'anyof-nullable' => fn () => JsonSchema::anyOf([
            JsonSchema::string()->min(2),
            JsonSchema::object(['k' => JsonSchema::integer()->required()]),
        ])->title('Either')->nullable()->required(),
        'anyof-closure' => fn () => JsonSchema::anyOf(fn (JsonSchemaTypeFactory $schema) => [$schema->boolean(), $schema->array()]),
        'enum-string-backed' => fn () => JsonSchema::string()->enum(Status::class),
        'enum-int-backed' => fn () => JsonSchema::integer()->enum(Level::class),
        'unicode-and-slashes' => fn () => JsonSchema::string()->description("Line\nTab\t\"quote\" \\ / ünï 😀"),
    ];

    foreach ($cases as $label => $case) {
        try {
            $value = (string) $case();
        } catch (Throwable $e) {
            $value = get_class($e).': '.$e->getMessage();
        }
        echo $label, "\t", json_encode($value), "\n";
    }
}
