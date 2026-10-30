// Xaravel Tests for Story 15.1: the config Repository's frame-scoped writes (XT-config-1, ESC-15.1-2) and classes held
// in config, with its null and typed reads (XT-config-2). A `xaravelTest` body runs outside any Scope Frame, so each write opens its own frame.
// XT-config-1 tests the overlay half of AD-5.5 on a Repository; the sealed-Application half (`config([...])` on a
// sealed Application) lands with the `sealed` state (Story 17.4 or 51.1, ESC-15.1-2).
import { Assert, xaravelTest } from "@xaravel/assert";
import { Repository } from "@xaravel/config";
import { fqcn, InvalidArgumentException, registerClass } from "@xaravel/runtime";
import { interleave, runInFrame, ScopeFrameException } from "@xaravel/runtime/scope";

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** A class a configuration value names, as `'driver' => SomeDriver::class` does. */
class FixtureConfigDriver {}

registerClass("Xaravel\\Tests\\Config\\FixtureConfigDriver", FixtureConfigDriver);

xaravelTest(
  "XT-config-1",
  "a config write inside one unit frame goes to that frame's overlay, keyed by the Repository: a concurrent unit reads the base value, the base is unchanged after both units end, and a write with no active frame throws ScopeFrameException; a nested frame reads its parent's write and its own write ends with it, and neither the constructor's input nor all()'s result shares the base (AD-5.5)",
  async () => {
    const config = new Repository({ app: { name: "base" }, list: ["a"] });

    // No frame: reads see the base, every write form throws.
    for (const write of [
      () => config.set("app.name", "x"),
      () => config.set({ "app.name": "x" }),
      () => config.push("list", "b"),
      () => config.prepend("list", "b"),
      () => config.offsetSet("app.name", "x"),
      () => config.offsetUnset("app.name"),
    ]) {
      Assert.assertInstanceOf(ScopeFrameException, thrownBy(write));
    }
    Assert.assertSame("base", config.get("app.name"));
    Assert.assertSame(["a"], config.get("list"));

    const seenByB: unknown[] = [];
    const results = await interleave([
      async () => {
        config.set("app.name", "unit-a");
        config.push("list", "b");
        for (let turn = 0; turn < 4; turn++) {
          await Promise.resolve();
          Assert.assertSame("unit-a", config.get("app.name"), `unit A reads its own write at turn ${turn}`);
          Assert.assertSame(["a", "b"], config.get("list"));
        }
        return "a";
      },
      async () => {
        for (let turn = 0; turn < 4; turn++) {
          seenByB.push(config.get("app.name"));
          Assert.assertSame(["a"], config.get("list"), `unit B reads the base list at turn ${turn}`);
          await Promise.resolve();
        }
        seenByB.push(config.get("app.name"));
        return "b";
      },
    ]);
    Assert.assertSame("a,b", results.join(","));
    Assert.assertSame("base,base,base,base,base", seenByB.join(","), "unit B reads the base value at every turn");

    // After both units: the base is unchanged, and a new unit reads it.
    Assert.assertSame({ app: { name: "base" }, list: ["a"] }, config.all());
    Assert.assertSame("base", runInFrame("unit", () => config.get("app.name")));

    // A nested frame reads its parent's write; its own write ends with it.
    runInFrame("unit", () => {
      config.set("app.name", "parent");
      runInFrame("unit", () => {
        Assert.assertSame("parent", config.get("app.name"));
        config.set("app.child", "c");
        Assert.assertSame("c", config.get("app.child"));
      });
      Assert.assertNull(config.get("app.child"));
      Assert.assertSame("parent", config.get("app.name"));
    });

    // The base shares nothing with the constructor's input or with all()'s result.
    const input = { app: { name: "input" } };
    const copied = new Repository(input);
    input.app.name = "changed";
    const all = copied.all() as { app: { name: string } };
    all.app.name = "changed";
    Assert.assertSame("input", copied.get("app.name"));
    Assert.assertSame("input", runInFrame("unit", () => copied.get("app.name")));

    // Two Repositories in one frame keep their own overlays.
    const other = new Repository({ app: { name: "other" } });
    runInFrame("unit", () => {
      config.set("app.name", "written");
      Assert.assertSame("written", config.get("app.name"));
      Assert.assertSame("other", other.get("app.name"));
    });
    Assert.assertSame("base", config.get("app.name"));
  },
);

xaravelTest(
  "XT-config-2",
  "a config value that holds a class or an FQCN string is returned exactly as stored, from the base and after a frame write (AD-10.7); a missing key reads as null, never undefined, and a closure default is called (AD-9.1); the typed getters tell PHP's integer from its float and name the given type in Upstream's exact message (AD-9.4)",
  async () => {
    const name = fqcn(FixtureConfigDriver);
    const config = new Repository({ cache: { driver: FixtureConfigDriver, name } });

    Assert.assertSame(FixtureConfigDriver, config.get("cache.driver"));
    Assert.assertSame("Xaravel\\Tests\\Config\\FixtureConfigDriver", config.get("cache.name"));
    Assert.assertSame("Xaravel\\Tests\\Config\\FixtureConfigDriver", config.string("cache.name"));

    runInFrame("unit", () => {
      config.set({ "queue.job": FixtureConfigDriver, "queue.name": name });
      Assert.assertSame(FixtureConfigDriver, config.get("queue.job"));
      Assert.assertSame(name, config.get("queue.name"));
      Assert.assertSame(FixtureConfigDriver, config.get("cache.driver"));
    });

    const typed = new Repository({ "a.b": "c", a: 1, rate: 1.5, whole: 2 });

    Assert.assertTrue(typed.get("missing") === null, "a missing key reads as null, not undefined");
    Assert.assertSame("c", typed.get("a.b"));
    Assert.assertSame("d", typed.get("x", () => "d"));
    Assert.assertSame(2, typed.integer("whole"));
    Assert.assertSame(1.5, typed.float("rate"));

    for (const [read, message] of [
      [() => typed.string("a"), "Configuration value for key [a] must be a string, integer given."],
      [() => typed.float("whole"), "Configuration value for key [whole] must be a float, integer given."],
      [() => typed.integer("rate"), "Configuration value for key [rate] must be an integer, double given."],
      [() => typed.boolean("missing"), "Configuration value for key [missing] must be a boolean, NULL given."],
      [() => typed.array("a.b"), "Configuration value for key [a.b] must be an array, string given."],
    ] as const) {
      const error = thrownBy(read);
      Assert.assertInstanceOf(InvalidArgumentException, error);
      Assert.assertSame(message, (error as Error).message);
    }

    runInFrame("unit", () => {
      typed.push("new", "x");
      Assert.assertSame(["x"], typed.get("new"));
    });
  },
);
