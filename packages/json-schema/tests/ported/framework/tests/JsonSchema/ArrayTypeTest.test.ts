// Ported from Laravel v13.37.0 framework/tests/JsonSchema/ArrayTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { JsonSchema } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_min_items', { case: TestCase }, async function () {
  const type = JsonSchema.array().title('Tags').min(1);

  this.assertEquals({
    type: 'array',
    title: 'Tags',
    minItems: 1,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_max_items', { case: TestCase }, async function () {
  const type = JsonSchema.array().description('A list of tags').max(10);

  this.assertEquals({
    type: 'array',
    description: 'A list of tags',
    maxItems: 10,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_items_type', { case: TestCase }, async function () {
  const type = JsonSchema.array().items(
    JsonSchema.string().max(20),
  );

  this.assertEquals({
    type: 'array',
    items: {
      type: 'string',
      maxLength: 20,
    },
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_default_value', { case: TestCase }, async function () {
  const type = JsonSchema.array().default(['a', 'b']);

  this.assertEquals({
    type: 'array',
    default: ['a', 'b'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_unique_items', { case: TestCase }, async function () {
  const type = JsonSchema.array().items(JsonSchema.string()).unique();

  this.assertEquals({
    type: 'array',
    items: {
      type: 'string',
    },
    uniqueItems: true,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_unset_unique_items', { case: TestCase }, async function () {
  const type = JsonSchema.array().unique().unique(false);

  this.assertEquals({
    type: 'array',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_combine_unique_items_with_min_and_max', { case: TestCase }, async function () {
  const type = JsonSchema.array().min(1).max(5).unique();

  this.assertEquals({
    type: 'array',
    minItems: 1,
    maxItems: 5,
    uniqueItems: true,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\ArrayTypeTest::test_it_may_set_enum', { case: TestCase }, async function () {
  const type = JsonSchema.array().enum([
    ['a'],
    ['b', 'c'],
  ]);

  this.assertEquals({
    type: 'array',
    enum: [
      ['a'],
      ['b', 'c'],
    ],
  }, type.toArray());
});
