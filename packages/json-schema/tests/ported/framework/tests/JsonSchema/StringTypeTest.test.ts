// Ported from Laravel v13.37.0 framework/tests/JsonSchema/StringTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { StringType } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\StringTypeTest::test_it_sets_min_length', { case: TestCase }, async function () {
  const type = (new StringType()).min(5);

  this.assertEquals({
    type: 'string',
    minLength: 5,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\StringTypeTest::test_it_sets_max_length', { case: TestCase }, async function () {
  const type = (new StringType()).description('User handle').max(10);

  this.assertEquals({
    type: 'string',
    description: 'User handle',
    maxLength: 10,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\StringTypeTest::test_it_sets_pattern', { case: TestCase }, async function () {
  const type = (new StringType()).default('foo').pattern('^foo.*$');

  this.assertEquals({
    type: 'string',
    default: 'foo',
    pattern: '^foo.*$',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\StringTypeTest::test_it_sets_format', { case: TestCase }, async function () {
  const type = (new StringType()).default('foo').format('date');

  this.assertEquals({
    type: 'string',
    default: 'foo',
    format: 'date',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\StringTypeTest::test_it_sets_enum', { case: TestCase }, async function () {
  const type = (new StringType()).enum(['draft', 'published']);

  this.assertEquals({
    type: 'string',
    enum: ['draft', 'published'],
  }, type.toArray());
});
