// Ported from Laravel v13.37.0 framework/tests/JsonSchema/AnyOfTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { JsonSchema, type JsonSchemaTypeFactory } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\AnyOfTypeTest::test_it_may_describe_any_of_multiple_schemas', { case: TestCase }, async function () {
  const type = JsonSchema.anyOf([
    JsonSchema.string(),
    JsonSchema.integer(),
  ]).title('Identifier');

  this.assertEquals({
    title: 'Identifier',
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
    ],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\AnyOfTypeTest::test_it_may_be_initialized_with_a_closure', { case: TestCase }, async function () {
  const type = JsonSchema.anyOf((schema: JsonSchemaTypeFactory) => [
    schema.string(),
    schema.integer(),
  ]);

  this.assertEquals({
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
    ],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\AnyOfTypeTest::test_it_may_be_nullable', { case: TestCase }, async function () {
  const type = JsonSchema.anyOf([
    JsonSchema.string(),
    JsonSchema.integer(),
  ]).nullable();

  this.assertEquals({
    anyOf: [
      { type: 'string' },
      { type: 'integer' },
      { type: 'null' },
    ],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\AnyOfTypeTest::test_it_may_describe_object_unions', { case: TestCase }, async function () {
  const type = JsonSchema.anyOf([
    JsonSchema.object({
      type: JsonSchema.string().enum(['article']).required(),
      title: JsonSchema.string().required(),
      content: JsonSchema.string().required(),
    }),
    JsonSchema.object({
      type: JsonSchema.string().enum(['image']).required(),
      url: JsonSchema.string().required(),
      caption: JsonSchema.string(),
    }),
  ]);

  this.assertEquals({
    anyOf: [
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['article'] },
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['type', 'title', 'content'],
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['image'] },
          url: { type: 'string' },
          caption: { type: 'string' },
        },
        required: ['type', 'url'],
      },
    ],
  }, type.toArray());
});
