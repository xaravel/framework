// Ported from Laravel v13.37.0 framework/tests/JsonSchema/SerializerTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { RuntimeException } from "@xaravel/runtime";
import { Type } from "../../../../../src";

portedTest('Illuminate\\Tests\\JsonSchema\\SerializerTest::test_it_does_not_know_how_to_serialize_unknown_types', { case: TestCase }, async function () {
  this.expectExceptionObject(new RuntimeException('Unsupported [Illuminate\\JsonSchema\\Types\\Type@anonymous'));

  const type = new (class extends Type {
    // anonymous type for triggering serializer failure
  })();

  type.toArray();
});
