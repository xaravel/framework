// Ported from Laravel v13.37.0 framework/tests/JsonSchema/BooleanTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { JsonSchema } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\BooleanTypeTest::test_serializes_as_boolean_with_metadata', { case: TestCase }, async function () {
  const type = JsonSchema.boolean().title('Enabled').description('Feature flag');

  this.assertEquals({
    type: 'boolean',
    title: 'Enabled',
    description: 'Feature flag',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\BooleanTypeTest::test_may_set_default_true_via_default', { case: TestCase }, async function () {
  const type = JsonSchema.boolean().default(true);

  this.assertEquals({
    type: 'boolean',
    default: true,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\BooleanTypeTest::test_may_set_default_false_via_default', { case: TestCase }, async function () {
  const type = JsonSchema.boolean().default(false);

  this.assertEquals({
    type: 'boolean',
    default: false,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\BooleanTypeTest::test_may_set_enum', { case: TestCase }, async function () {
  const type = JsonSchema.boolean().enum([true, false]);

  this.assertEquals({
    type: 'boolean',
    enum: [true, false],
  }, type.toArray());
});
