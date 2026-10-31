// Ported from Laravel v13.37.0 framework/tests/JsonSchema/NumberTypeTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { float } from "@xaravel/runtime";
import { JsonSchema } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_min_value_as_float', { case: TestCase }, async function () {
  const type = JsonSchema.number().title('Price').min(5.5);

  this.assertEquals({
    type: 'number',
    title: 'Price',
    minimum: 5.5,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_min_value_as_int', { case: TestCase }, async function () {
  const type = JsonSchema.number().title('Price').min(5);

  this.assertEquals({
    type: 'number',
    title: 'Price',
    minimum: 5,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_max_value_as_float', { case: TestCase }, async function () {
  const type = JsonSchema.number().description('Max price').max(10.75);

  this.assertEquals({
    type: 'number',
    description: 'Max price',
    maximum: 10.75,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_max_value_as_int', { case: TestCase }, async function () {
  const type = JsonSchema.number().description('Max price').max(10);

  this.assertEquals({
    type: 'number',
    description: 'Max price',
    maximum: 10,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_default_value', { case: TestCase }, async function () {
  const type = JsonSchema.number().default(9.99);

  this.assertEquals({
    type: 'number',
    default: 9.99,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_multiple_of_as_float', { case: TestCase }, async function () {
  const type = JsonSchema.number().multipleOf(0.5);

  this.assertEquals({
    type: 'number',
    multipleOf: 0.5,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_multiple_of_as_int', { case: TestCase }, async function () {
  const type = JsonSchema.number().multipleOf(3);

  this.assertEquals({
    type: 'number',
    multipleOf: 3,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_combine_multiple_of_with_min_and_max', { case: TestCase }, async function () {
  const type = JsonSchema.number().min(float(0)).max(float(10)).multipleOf(0.25);

  this.assertEquals({
    type: 'number',
    minimum: float(0),
    maximum: float(10),
    multipleOf: 0.25,
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\NumberTypeTest::test_it_may_set_enum', { case: TestCase }, async function () {
  const type = JsonSchema.number().enum([1, 2.5, 3]);

  this.assertEquals({
    type: 'number',
    enum: [1, 2.5, 3],
  }, type.toArray());
});
