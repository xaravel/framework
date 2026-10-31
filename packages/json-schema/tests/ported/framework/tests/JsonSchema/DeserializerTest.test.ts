// Ported from Laravel v13.37.0 framework/tests/JsonSchema/DeserializerTest.php.
//
// Each PHP array literal takes its DIV-9.2 form: a list is an `Array`, a map whose keys are all non-integer-like
// strings a plain object, and `['1' => …, '4' => …]` a `PhpArray` with Upstream's keys, as in ObjectTypeTest.
import { portedTest, TestCase } from "@xaravel/assert";
import { InvalidArgumentException, PhpArray } from "@xaravel/runtime";
import {
  AnyOfType,
  ArrayType,
  BooleanType,
  IntegerType,
  JsonSchema,
  NumberType,
  ObjectType,
  Serializer,
  StringType,
  UnionType,
} from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_round_trips_a_type_built_with_the_factory', { case: TestCase }, async function () {
  const type = JsonSchema.object({
    name: JsonSchema.string().min(1).max(50).pattern('^[a-z]+$').required(),
    age: JsonSchema.integer().min(0).max(120).default(18),
    score: JsonSchema.number().min(0).max(100).multipleOf(0.5),
    active: JsonSchema.boolean().default(true),
    tags: JsonSchema.array().items(JsonSchema.string().max(20)).min(1).max(5).unique(),
    meta: JsonSchema.object({
      created: JsonSchema.string().format('date-time').required(),
    }).withoutAdditionalProperties(),
    status: JsonSchema.string().enum(['draft', 'published']).nullable(),
  }).title('User').description('A user payload');

  const array = Serializer.serialize(type);

  const rebuilt = JsonSchema.fromArray(array);

  this.assertInstanceOf(ObjectType, rebuilt);
  this.assertSame(array, Serializer.serialize(rebuilt));
  this.assertEquals(type, rebuilt);
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_maps_every_supported_type', { case: TestCase }, async function () {
  this.assertInstanceOf(ObjectType, JsonSchema.fromArray({ type: 'object' }));
  this.assertInstanceOf(ArrayType, JsonSchema.fromArray({ type: 'array' }));
  this.assertInstanceOf(StringType, JsonSchema.fromArray({ type: 'string' }));
  this.assertInstanceOf(IntegerType, JsonSchema.fromArray({ type: 'integer' }));
  this.assertInstanceOf(NumberType, JsonSchema.fromArray({ type: 'number' }));
  this.assertInstanceOf(BooleanType, JsonSchema.fromArray({ type: 'boolean' }));
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_applies_string_constraints', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'string',
    minLength: 2,
    maxLength: 8,
    pattern: '^foo.*$',
    format: 'email',
  });

  this.assertEquals({
    type: 'string',
    minLength: 2,
    maxLength: 8,
    pattern: '^foo.*$',
    format: 'email',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_applies_integer_constraints', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'integer',
    minimum: 0,
    maximum: 100,
    multipleOf: 5,
  });

  this.assertInstanceOf(IntegerType, type);
  this.assertEquals({
    type: 'integer',
    minimum: 0,
    maximum: 100,
    multipleOf: 5,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_applies_number_constraints_and_preserves_floats', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'number',
    minimum: 0.5,
    maximum: 9.9,
    multipleOf: 0.1,
  });

  this.assertInstanceOf(NumberType, type);

  const array = type.toArray();

  this.assertSame(0.5, array['minimum']);
  this.assertSame(9.9, array['maximum']);
  this.assertSame(0.1, array['multipleOf']);
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_applies_array_constraints_and_nested_items', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'array',
    items: { type: 'string', maxLength: 3 },
    minItems: 1,
    maxItems: 4,
    uniqueItems: true,
  });

  this.assertInstanceOf(ArrayType, type);
  this.assertEquals({
    type: 'array',
    minItems: 1,
    maxItems: 4,
    items: {
      type: 'string',
      maxLength: 3,
    },
    uniqueItems: true,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_builds_nested_objects_and_marks_required_children', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0 },
      address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
      },
    },
    required: ['name'],
  });

  this.assertEquals({
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0 },
      address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
      },
    },
    required: ['name'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_preserves_numeric_string_property_names_when_marking_required', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: new PhpArray<string, unknown>([
      ['1', { type: 'string' }],
      ['4', { type: 'string' }],
    ]),
    required: ['1', '4'],
  });

  const array = type.toArray();

  this.assertEquals(['1', '4'], array['required']);
  this.assertIsString((array['required'] as unknown[])[0]);
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_disallows_additional_properties_when_false', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    additionalProperties: false,
  });

  this.assertEquals({
    type: 'object',
    additionalProperties: false,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_normalizes_nullable_from_a_type_array', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: ['string', 'null'],
    minLength: 1,
  });

  this.assertInstanceOf(StringType, type);
  this.assertEquals({
    type: ['string', 'null'],
    minLength: 1,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_normalizes_nullable_from_an_any_of_null_branch', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    title: 'Nickname',
    anyOf: [
      { type: 'string', minLength: 1 },
      { type: 'null' },
    ],
  });

  this.assertInstanceOf(StringType, type);
  this.assertEquals({
    title: 'Nickname',
    minLength: 1,
    type: ['string', 'null'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_normalizes_nullable_from_a_one_of_null_branch', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    oneOf: [
      { type: 'null' },
      { type: 'integer', minimum: 0 },
    ],
  });

  this.assertInstanceOf(IntegerType, type);
  this.assertEquals({
    minimum: 0,
    type: ['integer', 'null'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_resolves_a_local_ref_against_defs', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      author: { '$ref': '#/$defs/User' },
    },
    required: ['author'],
    '$defs': {
      User: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  });

  this.assertEquals({
    type: 'object',
    properties: {
      author: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    required: ['author'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_resolves_a_local_ref_against_definitions', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    '$ref': '#/definitions/Tag',
    definitions: {
      Tag: { type: 'string', minLength: 1 },
    },
  });

  this.assertInstanceOf(StringType, type);
  this.assertEquals({
    type: 'string',
    minLength: 1,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_merges_sibling_keys_over_a_ref', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      handle: {
        '$ref': '#/$defs/Name',
        description: 'Overridden description',
      },
    },
    '$defs': {
      Name: {
        type: 'string',
        description: 'Original description',
        minLength: 1,
      },
    },
  });

  this.assertEquals({
    type: 'object',
    properties: {
      handle: {
        description: 'Overridden description',
        minLength: 1,
        type: 'string',
      },
    },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_an_unresolvable_ref', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unable to resolve JSON Schema $ref [#/$defs/Missing].'));

  JsonSchema.fromArray({
    '$ref': '#/$defs/Missing',
    '$defs': [],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_remote_ref', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unable to resolve non-local JSON Schema $ref [https://example.com/user.json].'));

  JsonSchema.fromArray({
    '$ref': 'https://example.com/user.json',
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_infers_object_type_from_properties', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    properties: {
      name: { type: 'string' },
    },
  });

  this.assertInstanceOf(ObjectType, type);
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_infers_array_type_from_items', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    items: { type: 'integer' },
  });

  this.assertInstanceOf(ArrayType, type);
  this.assertEquals({
    type: 'array',
    items: { type: 'integer' },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_infers_scalar_type_from_a_homogeneous_enum', { case: TestCase }, async function () {
  this.assertInstanceOf(StringType, JsonSchema.fromArray({
    enum: ['draft', 'published'],
  }));

  this.assertInstanceOf(IntegerType, JsonSchema.fromArray({
    enum: [1, 2, 3],
  }));

  this.assertInstanceOf(NumberType, JsonSchema.fromArray({
    enum: [1, 2.5, 3],
  }));

  this.assertInstanceOf(BooleanType, JsonSchema.fromArray({
    enum: [true, false],
  }));
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_applies_enum_and_default', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'string',
    enum: ['draft', 'published'],
    default: 'draft',
  });

  this.assertEquals({
    type: 'string',
    default: 'draft',
    enum: ['draft', 'published'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_ignores_unknown_keywords', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'string',
    minLength: 1,
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    '$comment': 'ignore me',
    readOnly: true,
    contentEncoding: 'base64',
  });

  this.assertEquals({
    type: 'string',
    minLength: 1,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_when_the_type_cannot_be_determined', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unable to determine the JSON Schema type for the given schema.'));

  JsonSchema.fromArray({
    title: 'Mystery',
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_detects_a_circular_ref_instead_of_recursing', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Circular JSON Schema $ref [#/$defs/node] detected.'));

  JsonSchema.fromArray({
    type: 'object',
    properties: {
      children: { type: 'array', items: { '$ref': '#/$defs/node' } },
    },
    '$defs': {
      node: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { '$ref': '#/$defs/node' } },
        },
      },
    },
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_resolves_the_same_ref_used_in_sibling_positions', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      home: { '$ref': '#/$defs/address' },
      work: { '$ref': '#/$defs/address' },
    },
    '$defs': {
      address: { type: 'object', properties: { city: { type: 'string' } } },
    },
  });

  this.assertEquals({
    type: 'object',
    properties: {
      home: { type: 'object', properties: { city: { type: 'string' } } },
      work: { type: 'object', properties: { city: { type: 'string' } } },
    },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_a_multi_type_union', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: ['string', 'number', 'boolean'],
  });

  this.assertInstanceOf(UnionType, type);
  this.assertSame(['string', 'number', 'boolean'], (type as UnionType).types());
  this.assertSame({ type: ['string', 'number', 'boolean'] }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_a_nullable_multi_type_union', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: ['string', 'number', 'null'],
  });

  this.assertInstanceOf(UnionType, type);
  this.assertSame(['string', 'number'], (type as UnionType).types());
  this.assertSame({ type: ['string', 'number', 'null'] }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_does_not_treat_a_single_type_plus_null_as_a_union', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: ['string', 'null'],
  });

  this.assertInstanceOf(StringType, type);
  this.assertSame({ type: ['string', 'null'] }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_dedupes_and_preserves_order_of_union_members', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: ['number', 'string', 'number', 'boolean', 'string'],
  });

  this.assertInstanceOf(UnionType, type);
  this.assertSame(['number', 'string', 'boolean'], (type as UnionType).types());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_a_union_nested_in_an_object_property', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      value: { type: ['string', 'number'] },
    },
  });

  this.assertInstanceOf(ObjectType, type);
  this.assertEquals({
    type: 'object',
    properties: {
      value: { type: ['string', 'number'] },
    },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_a_union_nested_in_array_items', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'array',
    items: { type: ['string', 'integer', 'null'] },
  });

  this.assertInstanceOf(ArrayType, type);
  this.assertEquals({
    type: 'array',
    items: { type: ['string', 'integer', 'null'] },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_an_any_of_composition', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    title: 'Identifier',
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
    ],
  });

  this.assertInstanceOf(AnyOfType, type);
  this.assertEquals({
    title: 'Identifier',
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
    ],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_a_nullable_any_of_composition', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
      { type: 'null' },
    ],
  });

  this.assertInstanceOf(AnyOfType, type);
  this.assertEquals({
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
      { type: 'null' },
    ],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_deserializes_an_any_of_nested_in_an_object_property', { case: TestCase }, async function () {
  const type = JsonSchema.fromArray({
    type: 'object',
    properties: {
      value: {
        anyOf: [
          { type: 'string' },
          { type: 'integer' },
        ],
      },
    },
    required: ['value'],
  });

  this.assertInstanceOf(ObjectType, type);
  this.assertEquals({
    type: 'object',
    properties: {
      value: {
        anyOf: [
          { type: 'string' },
          { type: 'integer' },
        ],
      },
    },
    required: ['value'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_an_unsupported_union_member', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unsupported JSON Schema type [wat] in a multi-type union.'));

  JsonSchema.fromArray({
    type: ['string', 'wat'],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_non_string_union_member', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unsupported JSON Schema type [123] in a multi-type union.'));

  JsonSchema.fromArray({
    type: ['string', 123],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_when_a_union_carries_type_specific_keywords', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Type-specific keywords [items] are not supported on a multi-type JSON Schema union.'));

  JsonSchema.fromArray({
    type: ['array', 'string'],
    items: { type: 'integer' },
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_boolean_property_schema', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unable to represent the schema for property [meta]; boolean schemas are not supported.'));

  JsonSchema.fromArray({
    type: 'object',
    properties: {
      meta: true,
    },
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_non_numeric_numeric_constraint', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('The JSON Schema [minimum] constraint must be a number.'));

  JsonSchema.fromArray({
    type: 'number',
    minimum: 'oops',
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_non_integer_integer_constraint', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('The JSON Schema integer constraint [1.9] must be an integer.'));

  JsonSchema.fromArray({
    type: 'integer',
    minimum: 1.9,
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_tuple_items', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Tuple and boolean JSON Schema "items" are not supported.'));

  JsonSchema.fromArray({
    type: 'array',
    items: [
      { type: 'string' },
      { type: 'integer' },
    ],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_when_a_union_branch_conflicts_with_sibling_keys', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Conflicting [type] between a "anyOf" branch and its sibling keys.'));

  JsonSchema.fromArray({
    type: 'integer',
    anyOf: [
      { type: 'string', minLength: 3 },
      { type: 'null' },
    ],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_an_unsupported_one_of_union', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Only a nullable "oneOf" (a single schema plus a "null" branch) is supported.'));

  JsonSchema.fromArray({
    oneOf: [
      { type: 'string' },
      { type: 'integer' },
    ],
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_throws_for_a_null_default', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('A null JSON Schema [default] is not supported.'));

  JsonSchema.fromArray({
    type: 'string',
    default: null,
  });
});

portedTest('Illuminate\\Tests\\JsonSchema\\DeserializerTest::test_it_resolves_the_root_ref_pointer', { case: TestCase }, async function () {
  // "#" resolves to the root, so a self-reference is detected as circular...
  this.expectExceptionObject(new InvalidArgumentException('Circular JSON Schema $ref [#] detected.'));

  JsonSchema.fromArray({ '$ref': '#' });
});
