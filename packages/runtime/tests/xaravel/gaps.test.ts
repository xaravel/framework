// Xaravel Test for Epic 9 retrospective action item 3 (`epic-9-retro-item-3-scope-registry-gaps`): the Scope Frame
// and Registry gaps L1–L5, L15 and L16 of `_bmad-output/implementation-artifacts/epic-9-retro-2026-10-22.md`, one row
// per finding. `xaravelTest` opens no frame (ESC-4.2-1 item 7), so the body starts outside any Scope Frame. Base
// registrations are process-wide, so every FQCN here is used by this file only. The PHP messages were checked against
// local PHP 8.5.11.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { mixin, registerClass } from "@xaravel/runtime";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerTestClass, resolveClass } from "@xaravel/runtime/registry";
import {
  bindToFrame,
  currentApplication,
  frameOverlay,
  frameSlot,
  frameStatic,
  interleave,
  runInFrame,
  runInRootFrame,
  ScopeFrameException,
  setDefaultApplication,
} from "@xaravel/runtime/scope";

const DOCS = join(resolve(import.meta.dir, "..", ".."), "docs");

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** Settles after `n` turns of the microtask queue. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

const BRAND = Symbol.for("xaravel.class.fqcn");

/** `klass`'s class-name brand as the grader reads it. */
function brandOf(klass: object): unknown {
  return (klass as Record<symbol, unknown>)[BRAND];
}

/** An Application fixture: the runtime takes any object as an Application. */
class GapsApplication {}

class Fx {}
class FxSub extends Fx {}
class Fy {}
class FyUnit {}
class HeldA {}
class HeldB {}
class GapsModel {}
class Rebased {}
class Twice {}

/** A trait whose method reads a JS `#private` member. */
class SecretTrait {
  #secret = 1;
  reveal(): number {
    return this.#secret;
  }
}
registerClass("XaravelFixture\\Gaps\\SecretTrait", SecretTrait);

/** How many times `CountingTrait`'s constructor ran. */
const constructed = { count: 0 };

/** A trait with a constructor. */
class CountingTrait {
  constructor() {
    constructed.count++;
  }
  hello(): string {
    return "hello";
  }
}
registerClass("XaravelFixture\\Gaps\\CountingTrait", CountingTrait);

xaravelTest(
  "XT-runtime-39",
  "Epic 9 retro item 3: interleave units opened from a test frame read its test classes, overlays and statics but never write into it (L1); a test-class brand is per test frame and does not outlive the test (L2); frameSlot neither writes to nor stores init() in an ended unit (L3); registerClass refuses a name a running test holds for another class (L4); a null app falls back to the default Application, as documented (L5); the trait #private and mixin()-time constructor limits are documented and pinned (L15); an out-of-int64 bigint argument is PHP's float (L16) (AD-5.3, AD-5.5, AD-5.8, AD-9, AD-10.5, AD-19)",
  async () => {
    // L1: a test's registrations, overlays and statics are visible in its interleave units.
    const app = new GapsApplication();
    const statics = frameStatic(GapsModel, "s", () => "default");
    const testSlot = frameSlot("xt39.l1", () => "init");
    await runInFrame("test", async () => {
      registerTestClass("Tests\\Gaps\\Fx", Fx);
      frameOverlay(app).set("k", 1);
      statics.set("t");
      testSlot.set("test");
      // Slots never follow the origin: each unit reads init(), and its own write stays in it.
      const slots = await interleave([
        async () => {
          const first = testSlot.get();
          testSlot.set("a");
          await ticks(2);
          return [first, testSlot.get()];
        },
        async () => {
          const first = testSlot.get();
          await ticks(1);
          testSlot.set("b");
          await ticks(2);
          return [first, testSlot.get()];
        },
      ]);
      Assert.assertSame("init,a", slots[0]!.join(","));
      Assert.assertSame("init,b", slots[1]!.join(","));
      Assert.assertSame("test", testSlot.get(), "the test frame still reads its own slot value");
      // A nested interleave inside a unit of the test still reads the test's overlay, static and test class.
      const [nested] = await interleave([
        async () => (await interleave([async () => [frameOverlay(app).get("k"), statics.get(), fqcn(Fx)].join(",")]))[0],
      ]);
      Assert.assertSame("1,t,Tests\\Gaps\\Fx", nested);
      const seen = await interleave([
        async () => {
          const read = [fqcn(Fx), resolveClass("tests\\gaps\\fx") === Fx, frameOverlay(app).get("k"), statics.get()];
          frameOverlay(app).set("k", 2);
          statics.set("u");
          await ticks(2);
          return [...read, frameOverlay(app).get("k"), statics.get()];
        },
        async () => {
          await ticks(1);
          // The sibling's writes stayed in the sibling.
          return [fqcn(Fx), resolveClass("tests\\gaps\\fx") === Fx, frameOverlay(app).get("k"), statics.get()];
        },
      ]);
      Assert.assertSame("Tests\\Gaps\\Fx,true,1,t,2,u", seen[0]!.join(","));
      Assert.assertSame("Tests\\Gaps\\Fx,true,1,t", seen[1]!.join(","));
      Assert.assertSame(1, frameOverlay(app).get("k"), "a unit's overlay write stays in the unit");
      Assert.assertSame("t", statics.get(), "a unit's static write stays in the unit");

      // A registration from a unit still finds no test frame enclosing it.
      const [registered] = await interleave([async () => thrownBy(() => registerTestClass("Tests\\Gaps\\FyUnit", FyUnit))]);
      Assert.assertInstanceOf(ScopeFrameException, registered);
      Assert.assertSame("Cannot register the test class Tests\\Gaps\\FyUnit from the unit frame: no test frame encloses it", (registered as Error).message);
      Assert.assertInstanceOf(TypeError, thrownBy(() => fqcn(FyUnit)));
    });
    // Not from a unit that is not a test.
    await runInRootFrame("unit", async () => {
      frameOverlay(app).set("k", 3);
      statics.set("plain");
      const [read] = await interleave([async () => [frameOverlay(app).get("k"), statics.get(), thrownBy(() => fqcn(Fx)) instanceof TypeError]]);
      Assert.assertSame("null,default,true", read!.map(String).join(","), "an interleave unit opened from a non-test unit reads none of its overlays, statics or test classes");
    });

    // L2: concurrent test frames each read their own brand; after both end it is null.
    const brands = await interleave([
      () =>
        runInFrame("test", async () => {
          registerTestClass("Tests\\A\\Fy", Fy);
          await ticks(3);
          return [brandOf(Fy), brandOf(class extends Fy {}), fqcn(Fy)];
        }),
      () =>
        runInFrame("test", async () => {
          await ticks(1);
          registerTestClass("Tests\\B\\Fy", Fy);
          await ticks(3);
          return [brandOf(Fy), fqcn(Fy)];
        }),
    ]);
    Assert.assertSame("Tests\\A\\Fy,Tests\\A\\Fy,Tests\\A\\Fy", brands[0]!.join(","));
    Assert.assertSame("Tests\\B\\Fy,Tests\\B\\Fy", brands[1]!.join(","));
    Assert.assertNull(brandOf(Fy), "no test's brand outlives the test");
    // A subclass shows its parent's brand.
    runInFrame("test", () => {
      registerTestClass("Tests\\Gaps\\FxAgain", Fx);
      Assert.assertSame("Tests\\Gaps\\FxAgain", brandOf(FxSub));
    });
    Assert.assertNull(brandOf(FxSub));

    // L3: a frameSlot write to an ended unit throws; a read there stores no init() value.
    const slot = frameSlot("xt39.slot", () => [] as number[]);
    const late: { write: (() => void) | null; read: (() => number[]) | null } = { write: null, read: null };
    runInFrame("unit", () => {
      late.write = bindToFrame(() => slot.set([1]));
      late.read = bindToFrame(() => slot.get());
    });
    const ended = thrownBy(() => late.write?.());
    Assert.assertInstanceOf(ScopeFrameException, ended);
    Assert.assertSame("Cannot write the frame slot xt39.slot to the unit frame after it has ended", (ended as Error).message);
    const first = (late.read as unknown as () => number[])();
    first.push(9);
    const second = (late.read as unknown as () => number[])();
    Assert.assertTrue(first !== second, "each read after the unit ended is a fresh init()");
    Assert.assertSame(0, second.length, "an ended unit stores no init() value");
    // A value stored before the unit ended is still read after it.
    let stored: (() => number[]) | null = null;
    runInFrame("unit", () => {
      slot.set([7]);
      stored = bindToFrame(() => slot.get());
    });
    Assert.assertSame("7", (stored as unknown as () => number[])().join(","));

    // L4: base registerClass refuses a name a running test holds for another class, from any frame.
    const refused = await interleave([
      () =>
        runInFrame("test", async () => {
          registerTestClass("Tests\\Gaps\\Held", HeldA);
          const inTest = thrownBy(() => registerClass("tests\\gaps\\held", HeldB));
          await ticks(4);
          return inTest;
        }),
      () =>
        runInFrame("test", async () => {
          await ticks(1);
          return thrownBy(() => registerClass("tests\\gaps\\held", HeldB));
        }),
      async () => {
        await ticks(2);
        return thrownBy(() => registerClass("tests\\gaps\\held", HeldB));
      },
    ]);
    for (const error of refused) {
      Assert.assertInstanceOf(TypeError, error);
      Assert.assertSame("registerClass(): tests\\gaps\\held is already registered to another class in a running test", (error as Error).message);
    }
    Assert.assertFalse(Object.hasOwn(HeldB, BRAND), "a refused registration sets no brand");
    // Once the test has ended, the name is free.
    registerClass("tests\\gaps\\held", HeldB);
    Assert.assertSame(HeldB, resolveClass("Tests\\Gaps\\Held"));
    // A class a running test holds under another FQCN is refused too.
    const [, twice] = await interleave([
      () =>
        runInFrame("test", async () => {
          registerTestClass("Tests\\Gaps\\Twice", Twice);
          await ticks(2);
          return null;
        }),
      async () => {
        await ticks(1);
        return thrownBy(() => registerClass("Other\\Twice", Twice));
      },
    ]);
    Assert.assertInstanceOf(TypeError, twice);
    Assert.assertSame("registerClass(): the class registered as Tests\\Gaps\\Twice in a running test cannot also be registered as Other\\Twice", (twice as Error).message);
    Assert.assertTrue(Object.getOwnPropertyDescriptor(Twice, BRAND)?.configurable ?? false, "the refused registration left the test brand accessor");
    // A later base registerClass replaces the test brand accessor with its fixed brand.
    runInFrame("test", () => registerTestClass("Tests\\Gaps\\Rebased", Rebased));
    registerClass("App\\Gaps\\Rebased", Rebased);
    const fixed = Object.getOwnPropertyDescriptor(Rebased, BRAND);
    Assert.assertSame("App\\Gaps\\Rebased", fixed?.value ?? null);
    Assert.assertFalse(fixed?.configurable ?? true);
    Assert.assertSame("App\\Gaps\\Rebased", fqcn(Rebased));

    // L5: a frame opened with app null names no Application and falls back to the default, as the docs say.
    const fallback = new GapsApplication();
    setDefaultApplication(fallback);
    try {
      Assert.assertSame(fallback, runInRootFrame("unit", () => currentApplication(), null));
      Assert.assertSame(fallback, runInFrame("unit", () => currentApplication(), null));
    } finally {
      setDefaultApplication(null);
    }
    const scopeDoc = readFileSync(join(DOCS, "scope-frames.md"), "utf8");
    Assert.assertTrue(scopeDoc.includes("A `null` app falls back to the default Application"), "scope-frames.md says a null app falls back to the default");
    Assert.assertFalse(readFileSync(join(import.meta.dir, "..", "..", "src", "scope", "scope.ts"), "utf8").includes("`null`: for no Application"), "no docblock says null means no Application");

    // L15: both trait limits are documented and behave as documented.
    const traitsDoc = readFileSync(join(DOCS, "traits-and-inject.md"), "utf8");
    const notSupported = traitsDoc.slice(traitsDoc.indexOf("## Not supported"));
    Assert.assertTrue(notSupported.includes("`#private`"), "traits-and-inject.md names #private members under Not supported");
    Assert.assertTrue(notSupported.includes("at `mixin()` time"), "traits-and-inject.md says a trait constructor runs at mixin() time");
    class SecretHost extends mixin(null, SecretTrait) {}
    Assert.assertInstanceOf(TypeError, thrownBy(() => new SecretHost().reveal()), "a trait method using #private throws on the using class");
    const before = constructed.count;
    const CountingHost = mixin(null, CountingTrait);
    Assert.assertSame(before + 1, constructed.count, "the trait constructor runs once, at mixin() time");
    Assert.assertSame("hello", new CountingHost().hello());
    new CountingHost();
    Assert.assertSame(before + 1, constructed.count, "constructing the using class does not run the trait constructor");

    // L16: a bigint outside int64 is the float PHP makes of that literal.
    for (const [made, message] of [
      [() => new php.Exception("a", 2n ** 70n), "Exception::__construct(): Argument #2 ($code) must be of type int, float given"],
      [() => new php.Exception("a", -(2n ** 64n)), "Exception::__construct(): Argument #2 ($code) must be of type int, float given"],
      [() => new php.ErrorException("m", 0, 1, null, 2n ** 70n), "ErrorException::__construct(): Argument #5 ($line) must be of type ?int, float given"],
    ] as const) {
      const error = thrownBy(made);
      Assert.assertInstanceOf(php.TypeError, error);
      Assert.assertSame(message, (error as Error).message);
    }
    Assert.assertSame("1.1805916207174E+21", new php.Exception(2n ** 70n as unknown as string).getMessage());
    // The int64 edges (PHP 8.5.11): PHP_INT_MAX and PHP_INT_MIN are ints; 2^63 is a float outside int64; -(2^63) - 1
    // is the float -2^63, which PHP's int parameter takes as PHP_INT_MIN.
    Assert.assertSame(9223372036854775807n, new php.Exception("m", 9223372036854775807n).getCode());
    Assert.assertSame(-9223372036854775808n, new php.Exception("m", -9223372036854775808n).getCode());
    Assert.assertSame("Exception::__construct(): Argument #2 ($code) must be of type int, float given", (thrownBy(() => new php.Exception("m", 2n ** 63n)) as Error).message);
    Assert.assertSame(-9223372036854775808n, new php.Exception("m", -(2n ** 63n) - 1n).getCode());
    const exceptionsDoc = readFileSync(join(DOCS, "exceptions.md"), "utf8");
    Assert.assertTrue(exceptionsDoc.includes("must be of type int, float given"), "exceptions.md describes an out-of-int64 bigint as a float");
  },
);
