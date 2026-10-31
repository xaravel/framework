// Ported from Laravel v13.37.0 framework/tests/JsonSchema/ObjectTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { PhpArray } from "@xaravel/runtime";
import { JsonSchema, type JsonSchemaTypeFactory, type StringType } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_not_have_properties', { case: TestCase }, async function () {
  const type = JsonSchema.object().title('Payload');

  this.assertEquals({
    type: 'object',
    title: 'Payload',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_be_initialized_with_a_closure_but_without_properties', { case: TestCase }, async function () {
  const type = JsonSchema.object(() => []).title('Payload');

  this.assertEquals({
    type: 'object',
    title: 'Payload',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_have_properties', { case: TestCase }, async function () {
  const type = JsonSchema.object({
    'age-a': JsonSchema.integer().min(0).required(),
    'age-b': JsonSchema.integer().default(30).max(45),
  }).description('Root object');

  this.assertEquals({
    type: 'object',
    description: 'Root object',
    properties: {
      'age-a': {
        type: 'integer',
        minimum: 0,
      },
      'age-b': {
        type: 'integer',
        default: 30,
        maximum: 45,
      },
    },
    required: ['age-a'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_be_initialized_with_a_closure_but_may_have_properties', { case: TestCase }, async function () {
  const type = JsonSchema.object((schema: JsonSchemaTypeFactory) => ({
    'age-a': schema.integer().min(0).required(),
    'age-b': schema.integer().default(30).max(45),
  })).description('Root object');

  this.assertEquals({
    type: 'object',
    description: 'Root object',
    properties: {
      'age-a': {
        type: 'integer',
        minimum: 0,
      },
      'age-b': {
        type: 'integer',
        default: 30,
        maximum: 45,
      },
    },
    required: ['age-a'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_numeric_string_property_names_remain_strings_in_required_array', { case: TestCase }, async function () {
  const type = JsonSchema.object(new PhpArray<string, StringType>([
    ['1', JsonSchema.string().required()],
    ['4', JsonSchema.string().required()],
  ]));

  const array = type.toArray();

  this.assertSame(['1', '4'], array['required']);
  this.assertIsString((array['required'] as unknown[])[0]);
  this.assertIsString((array['required'] as unknown[])[1]);
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_disable_additional_properties', { case: TestCase }, async function () {
  const type = JsonSchema.object().default({ age: 1 }).withoutAdditionalProperties();

  this.assertEquals({
    type: 'object',
    default: { age: 1 },
    additionalProperties: false,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ObjectTypeTest::test_it_may_set_enum', { case: TestCase }, async function () {
  const type = JsonSchema.object().enum([
    { a: 1 },
    { a: 2 },
  ]);

  this.assertEquals({
    type: 'object',
    enum: [
      { a: 1 },
      { a: 2 },
    ],
  }, type.toArray());
});
