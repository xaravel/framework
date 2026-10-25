// Ported from framework/tests/Conditionable/ConditionableTest.php (Laravel v13.37.0), Story 12.1.
//
// Upstream's `setUp` builds an Eloquent `Capsule\Manager` on sqlite, and both tests call `when()` / `unless()` on
// `TestConditionableModel::query()`, an Eloquent `Builder`. That needs the Database Component (phase 4), so `setUp`
// throws `BlockedByComponentError("database")` before building the Capsule, and the Expectations lines are `skip` /
// `blocked-by:database` (decisions/ESC-12.1-2.md). The local `TestConditionableModel extends Model` is left out, as
// it needs `Model`; the bodies reach it and `Builder` through the Class Registry by their FQCNs, and are otherwise
// Upstream's. Unblocking this file replaces the throw with the Capsule setup and declares
// `class TestConditionableModel extends Model {}` here, registered with `registerTestClass`.
import { portedTest, TestCase } from "@xaravel/assert";
import { type Conditionable, HigherOrderWhenProxy } from "@xaravel/conditionable";
import { BlockedByComponentError, resolveClass } from "@xaravel/runtime";

const ID = "Illuminate\\Tests\\Conditionable\\ConditionableTest";

/** `TestConditionableModel` (Upstream's local `class TestConditionableModel extends Model {}`), from the Class Registry. */
function TestConditionableModel(): { query(): Conditionable } {
  return resolveClass("Illuminate\\Tests\\Conditionable\\TestConditionableModel") as unknown as { query(): Conditionable };
}

/** `Illuminate\Database\Eloquent\Builder`, from the Class Registry. */
function Builder(): ReturnType<typeof resolveClass> {
  return resolveClass("Illuminate\\Database\\Eloquent\\Builder");
}

class ConditionableTest extends TestCase {
  setUp(): void {
    throw new BlockedByComponentError("database");

    // $db = new DB;
    // $db->addConnection(['driver' => 'sqlite', 'database' => ':memory:']);
    // $db->bootEloquent();
    // $db->setAsGlobal();
  }
}

portedTest(`${ID}::testWhen`, { case: ConditionableTest }, async function () {
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().when(true));
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().when(false));
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().when());
  this.assertInstanceOf(Builder(), TestConditionableModel().query().when(false, null));
  this.assertInstanceOf(
    Builder(),
    TestConditionableModel()
      .query()
      .when(true, () => {}),
  );
});

portedTest(`${ID}::testUnless`, { case: ConditionableTest }, async function () {
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().unless(true));
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().unless(false));
  this.assertInstanceOf(HigherOrderWhenProxy, TestConditionableModel().query().unless());
  this.assertInstanceOf(Builder(), TestConditionableModel().query().unless(true, null));
  this.assertInstanceOf(
    Builder(),
    TestConditionableModel()
      .query()
      .unless(false, () => {}),
  );
});
