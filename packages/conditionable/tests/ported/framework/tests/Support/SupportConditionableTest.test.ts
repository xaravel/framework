// Ported from framework/tests/Support/SupportConditionableTest.php (Laravel v13.37.0), Story 12.1.
//
// The closures use no `$this`, so they are arrow functions (PORTING.md § Mechanical expression rule / By hand), typed
// with the narrowest type the call site gives. `ConditionableLogger` is the Upstream fixture, registered in `setUp`
// with `registerTestClass`. `in_array` is loose, so `has` compares with `looseEquals`.
//
// `testWhenProxy` and `testUnlessProxy` reach the target's `log` / `has` methods and `toggle` property through the
// proxy's generated delegating members (DIV-12.12). The fixture's `$toggle` property and `toggle()` method cannot
// share one JavaScript name, so the method keeps the name and the property is `toggleProperty`; each Upstream read of
// `->toggle` through the proxy is a read of `.toggleProperty`, carrying the DIV-12.12 adaptation marker.
import { portedTest, TestCase } from "@xaravel/assert";
import { Conditionable } from "@xaravel/conditionable";
import { looseEquals, mixin, registerTestClass } from "@xaravel/runtime";

const ID = "Illuminate\\Tests\\Support\\SupportConditionableTest";

class ConditionableLogger extends mixin(null, Conditionable) {
  values: unknown[] = [];

  /** Upstream's `public $toggle = false;` (DIV-12.12: the method `toggle()` keeps the name). */
  toggleProperty: boolean = false;

  log(...values: unknown[]): this {
    this.values.push(...values);

    return this;
  }

  has(value: unknown): boolean {
    return this.values.some((item) => looseEquals(item, value));
  }

  toggle(): this {
    this.toggleProperty = !this.toggleProperty;

    return this;
  }
}

class SupportConditionableTest extends TestCase {
  setUp(): void {
    registerTestClass("Illuminate\\Tests\\Support\\ConditionableLogger", ConditionableLogger);
  }
}

portedTest(`${ID}::testWhenConditionCallback`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().when(
    2,
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("when", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["when", 2], logger.values);

  // With callback condition
  logger = new ConditionableLogger()
    .log("init")
    .when(
      (logger: ConditionableLogger) => {
        return logger.has("init");
      },
      (logger: ConditionableLogger, condition: unknown) => {
        logger.log("when", condition);
      },
      (logger: ConditionableLogger, condition: unknown) => {
        logger.log("default", condition);
      },
    );

  this.assertSame(["init", "when", true], logger.values);
});

portedTest(`${ID}::testWhenDefaultCallback`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().when(
    null,
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("when", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["default", null], logger.values);

  // With callback condition
  logger = new ConditionableLogger().when(
    (logger: ConditionableLogger) => {
      return logger.has("missing");
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("when", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["default", false], logger.values);
});

portedTest(`${ID}::testUnlessConditionCallback`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().unless(
    null,
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("unless", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["unless", null], logger.values);

  // With callback condition
  logger = new ConditionableLogger().unless(
    (logger: ConditionableLogger) => {
      return logger.has("missing");
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("unless", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["unless", false], logger.values);
});

portedTest(`${ID}::testUnlessDefaultCallback`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().unless(
    2,
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("unless", condition);
    },
    (logger: ConditionableLogger, condition: unknown) => {
      logger.log("default", condition);
    },
  );

  this.assertSame(["default", 2], logger.values);

  // With callback condition
  logger = new ConditionableLogger()
    .log("init")
    .unless(
      (logger: ConditionableLogger) => {
        return logger.has("init");
      },
      (logger: ConditionableLogger, condition: unknown) => {
        logger.log("unless", condition);
      },
      (logger: ConditionableLogger, condition: unknown) => {
        logger.log("default", condition);
      },
    );

  this.assertSame(["init", "default", true], logger.values);
});

portedTest(`${ID}::testWhenProxy`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().when(true).log("one").when(false).log("two");

  this.assertSame(["one"], logger.values);

  // With callback condition
  logger = new ConditionableLogger()
    .log("init")
    .when((logger: ConditionableLogger) => {
      return logger.has("init");
    })
    .log("one")
    .when((logger: ConditionableLogger) => {
      return logger.has("missing");
    })
    .log("two")
    .when()
    .has("init")
    .log("three")
    .when()
    .has("missing")
    .log("four")
    .when()
    .toggleProperty // adapted:DIV-12.12
    .log("five")
    .toggle()
    .when()
    .toggleProperty // adapted:DIV-12.12
    .log("six");

  this.assertSame(["init", "one", "three", "six"], logger.values);
});

portedTest(`${ID}::testUnlessProxy`, { case: SupportConditionableTest }, async function () {
  // With static condition
  let logger = new ConditionableLogger().unless(true).log("one").unless(false).log("two");

  this.assertSame(["two"], logger.values);

  // With callback condition
  logger = new ConditionableLogger()
    .log("init")
    .unless((logger: ConditionableLogger) => {
      return logger.has("init");
    })
    .log("one")
    .unless((logger: ConditionableLogger) => {
      return logger.has("missing");
    })
    .log("two")
    .unless()
    .has("init")
    .log("three")
    .unless()
    .has("missing")
    .log("four")
    .unless()
    .toggleProperty // adapted:DIV-12.12
    .log("five")
    .toggle()
    .unless()
    .toggleProperty // adapted:DIV-12.12
    .log("six");

  this.assertSame(["init", "two", "four", "five"], logger.values);
});
