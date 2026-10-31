// Ported from Laravel v13.37.0 framework/tests/JsonSchema/UnionTypeTest.php.
//
// `test_it_round_trips_a_union` and `test_it_round_trips_a_nullable_union` call `JsonSchema::fromArray`, the
// Deserializer Story 16.2 ports; they wait on ESC-16.1-4 and are not ported here.
import { portedTest, TestCase } from "@xaravel/assert";
import { InvalidArgumentException } from "@xaravel/runtime";
import { JsonSchema } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_serializes_as_a_type_array', { case: TestCase }, async function () {
  const type = JsonSchema.union(['string', 'number', 'boolean']);

  this.assertEquals({
    type: ['string', 'number', 'boolean'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_serializes_with_metadata', { case: TestCase }, async function () {
  const type = JsonSchema.union(['string', 'number'])
    .title('Value')
    .description('A string or a number');

  this.assertEquals({
    type: ['string', 'number'],
    title: 'Value',
    description: 'A string or a number',
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_dedupes_and_preserves_member_order', { case: TestCase }, async function () {
  const type = JsonSchema.union(['number', 'string', 'number', 'boolean', 'string']);

  this.assertSame(['number', 'string', 'boolean'], type.types());
  this.assertSame({ type: ['number', 'string', 'boolean'] }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_appends_null_when_nullable', { case: TestCase }, async function () {
  const type = JsonSchema.union(['string', 'number']).nullable();

  this.assertEquals({
    type: ['string', 'number', 'null'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_normalizes_a_null_member_into_nullability', { case: TestCase }, async function () {
  const type = JsonSchema.union(['string', 'number', 'null']);

  this.assertSame(['string', 'number'], type.types());
  this.assertEquals({
    type: ['string', 'number', 'null'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_does_not_duplicate_null_when_already_nullable', { case: TestCase }, async function () {
  const type = JsonSchema.union(['string', 'null']).nullable();

  this.assertEquals({
    type: ['string', 'null'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_rejects_an_unsupported_member_name', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unsupported JSON Schema type [wat] in a multi-type union.'));

  JsonSchema.union(['string', 'wat']);
});

portedTest('Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_rejects_a_non_string_member', { case: TestCase }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('Unsupported JSON Schema type [123] in a multi-type union.'));

  JsonSchema.union(['string', 123]);
});
