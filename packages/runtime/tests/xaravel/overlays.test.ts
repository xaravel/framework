// Xaravel Tests for Story 9.3: per-Application overlays, `frameStatic` and the frame's Application (AD-5.3, AD-5.5,
// AD-5.8). One test per acceptance criterion, in order. `xaravelTest` opens no frame (ESC-4.2-1 item 7), so each body
// starts outside any Scope Frame.
import { Assert, xaravelTest } from "@xaravel/assert";
import {
  bindToFrame,
  currentApplication,
  currentFrame,
  type Frame,
  frameOverlay,
  frameStatic,
  interleave,
  runInFrame,
  runInNarrowFrame,
  runInRootFrame,
  ScopeFrameException,
  setDefaultApplication,
} from "@xaravel/runtime/scope";

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

/** An Application fixture: the runtime takes any object as an Application. */
class FixtureApplication {
  constructor(readonly name: string) {}
}

/** A class with an Upstream-style static (`Model.unguard`). */
class FixtureModel {}

/** A second class, so statics are keyed by class. */
class OtherModel {}

xaravelTest(
  "XT-runtime-9",
  "overlays are keyed by Application and frame: two Applications writing the same key in one unit frame each read only their own value; a write lands in the overlay of the innermost unit frame, passing through narrow frames and, from a child of a test frame, into the test frame; with no active frame any write throws ScopeFrameException (AD-5.3, AD-5.5, AD-5.8)",
  async () => {
    const a = new FixtureApplication("a");
    const b = new FixtureApplication("b");
    const c = new FixtureApplication("c");

    // No frame: reads miss, writes throw.
    Assert.assertNull(frameOverlay(a).get("k"));
    Assert.assertFalse(frameOverlay(a).has("k"));
    const outside = thrownBy(() => frameOverlay(a).set("k", 1));
    Assert.assertInstanceOf(ScopeFrameException, outside);
    Assert.assertSame("Cannot write the frame overlay k with no active Scope Frame; run the code inside runInFrame()", (outside as Error).message);

    await runInFrame("unit", async () => {
      // Two Applications, one frame, one key.
      frameOverlay(a).set("k", 1);
      frameOverlay(b).set("k", 2);
      await ticks(2);
      Assert.assertSame(1, frameOverlay(a).get("k"));
      Assert.assertSame(2, frameOverlay(b).get("k"));
      Assert.assertTrue(frameOverlay(a).has("k"));
      Assert.assertTrue(frameOverlay(b).has("k"));
      Assert.assertFalse(frameOverlay(c).has("k"), "a third Application has no value");
      Assert.assertNull(frameOverlay(c).get("k"));
      // Absent key.
      Assert.assertNull(frameOverlay(a).get("missing"));
      Assert.assertFalse(frameOverlay(a).has("missing"));
      // Symbol keys; a stored null is held and read as null.
      const sym = Symbol("xt-runtime-9");
      frameOverlay(a).set(sym, null);
      Assert.assertTrue(frameOverlay(a).has(sym));
      Assert.assertNull(frameOverlay(a).get(sym));

      // Child of a non-test unit: reads the parent's value until it writes its own, which stays in the child.
      await runInFrame("job", async () => {
        Assert.assertSame(1, frameOverlay(a).get("k"));
        frameOverlay(a).set("k", 10);
        frameOverlay(a).set("child-only", true);
        await ticks(1);
        Assert.assertSame(10, frameOverlay(a).get("k"));
        Assert.assertSame(2, frameOverlay(b).get("k"));
      });
      Assert.assertSame(1, frameOverlay(a).get("k"), "the child's write stays in the child");
      Assert.assertFalse(frameOverlay(a).has("child-only"));

      // Narrow frame: the write passes through to the enclosing unit.
      await runInNarrowFrame("transaction", ["xt-runtime-9.lease"], async () => {
        frameOverlay(a).set("narrow", "through");
        await ticks(1);
        Assert.assertSame("through", frameOverlay(a).get("narrow"));
      });
      Assert.assertSame("through", frameOverlay(a).get("narrow"), "a narrow frame's write lands in the unit");
    });

    // Child of a test frame: the write lands in the test frame and is visible there after the child returns.
    await runInFrame("test", async () => {
      await runInFrame("unit", async () => {
        frameOverlay(a).set("from-child", "landed");
        await ticks(1);
        Assert.assertSame("landed", frameOverlay(a).get("from-child"));
      });
      Assert.assertSame("landed", frameOverlay(a).get("from-child"), "a child of a test frame writes into the test frame");
      // A root unit inside the test frame sees none of it.
      await runInRootFrame("unit", async () => {
        Assert.assertFalse(frameOverlay(a).has("from-child"));
      });
    });

    // A new unit sees nothing of an ended one; a callback bound to the ended unit reads nothing and cannot write.
    let bound: (() => unknown) | null = null;
    let boundWrite: (() => void) | null = null;
    await runInFrame("unit", async () => {
      frameOverlay(a).set("k", "ended-soon");
      bound = bindToFrame(() => frameOverlay(a).has("k"));
      boundWrite = bindToFrame(() => frameOverlay(a).set("k", "resurrected"));
      await ticks(1);
    });
    Assert.assertSame(false, (bound as unknown as () => unknown)());
    const resurrect = thrownBy(boundWrite as unknown as () => void);
    Assert.assertInstanceOf(ScopeFrameException, resurrect);
    Assert.assertSame("Cannot write the frame overlay k to the unit frame after it has ended", (resurrect as Error).message);
    runInFrame("unit", () => Assert.assertFalse(frameOverlay(a).has("k"), "a new unit starts empty"));

    // Narrow frame with no enclosing unit: reads miss, writes throw.
    runInNarrowFrame("concurrency-task", [], () => {
      Assert.assertFalse(frameOverlay(a).has("k"));
      const alone = thrownBy(() => frameOverlay(a).set("k", 1));
      Assert.assertInstanceOf(ScopeFrameException, alone);
      Assert.assertSame("Cannot write the frame overlay k from the concurrency-task frame: no unit frame encloses it", (alone as Error).message);
    });

    // Bad input.
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameOverlay(1 as unknown as object)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameOverlay(null as unknown as object)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameOverlay(a).get(1 as unknown as string)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameOverlay(a).has({} as unknown as string)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => runInFrame("unit", () => frameOverlay(a).set(null as unknown as string, 1))));
    Assert.assertTrue(Object.isFrozen(frameOverlay(a)));
    Assert.assertNull(currentFrame());
  },
);

xaravelTest(
  "XT-runtime-10",
  "frameStatic(Class, key) holds an Upstream static setter per unit frame: a unit that sets it does not change what a concurrent unit reads, and the value is discarded when the unit ends (AD-5.5)",
  async () => {
    const guarded = frameStatic(FixtureModel, "unguarded", () => "default");
    const other = frameStatic(OtherModel, "unguarded", () => "other-default");
    const seenByB: string[] = [];
    let boundRead: (() => string) | null = null;
    let boundWrite: (() => void) | null = null;

    // No frame: get is init(), a write throws.
    Assert.assertSame("default", guarded.get());
    const outside = thrownBy(() => guarded.set("x"));
    Assert.assertInstanceOf(ScopeFrameException, outside);
    Assert.assertSame("Cannot write the frame static unguarded with no active Scope Frame; run the code inside runInFrame()", (outside as Error).message);

    const results = await interleave([
      async () => {
        guarded.set("a-value");
        boundRead = bindToFrame(() => guarded.get());
        boundWrite = bindToFrame(() => guarded.set("resurrected"));
        for (let turn = 0; turn < 4; turn++) {
          await Promise.resolve();
          Assert.assertSame("a-value", guarded.get(), `unit A reads its own value at turn ${turn}`);
          Assert.assertSame("other-default", other.get(), "statics are keyed by class");
        }
        return "a";
      },
      async () => {
        for (let turn = 0; turn < 4; turn++) {
          seenByB.push(guarded.get());
          await Promise.resolve();
        }
        seenByB.push(guarded.get());
        return "b";
      },
    ]);
    Assert.assertSame("a,b", results.join(","));
    Assert.assertSame("default,default,default,default,default", seenByB.join(","), "unit B reads the default at every turn");

    // After A's unit ended (its drain is done): discarded; a bound callback reads the default and cannot write.
    Assert.assertSame("default", (boundRead as unknown as () => string)());
    const resurrect = thrownBy(boundWrite as unknown as () => void);
    Assert.assertInstanceOf(ScopeFrameException, resurrect);
    Assert.assertSame("Cannot write the frame static unguarded to the unit frame after it has ended", (resurrect as Error).message);
    Assert.assertSame("default", runInFrame("unit", () => guarded.get()), "a new unit reads the default");

    // A sync body that returned, and one that threw, discard too.
    let syncRead: (() => string) | null = null;
    runInFrame("unit", () => {
      guarded.set("sync");
      syncRead = bindToFrame(() => guarded.get());
      Assert.assertSame("sync", guarded.get());
    });
    Assert.assertSame("default", (syncRead as unknown as () => string)());
    let throwRead: (() => string) | null = null;
    const failure = new Error("body failed");
    Assert.assertSame(
      failure,
      thrownBy(() =>
        runInFrame("unit", () => {
          guarded.set("threw");
          throwRead = bindToFrame(() => guarded.get());
          throw failure;
        }),
      ),
    );
    Assert.assertSame("default", (throwRead as unknown as () => string)());

    // A mutable default is stored per unit, as frameSlot's init is.
    const list = frameStatic(FixtureModel, "list", () => [] as string[]);
    await interleave([
      async () => {
        list.get().push("a");
        await ticks(2);
        Assert.assertSame("a", list.get().join(","));
      },
      async () => {
        list.get().push("b");
        await ticks(2);
        Assert.assertSame("b", list.get().join(","));
      },
    ]);
    Assert.assertTrue(list.get() !== list.get(), "with no frame, init() is not stored");
    // After a unit ended, a bound read gets init() unstored: the ended unit keeps no default.
    let endedListRead: (() => string[]) | null = null;
    runInFrame("unit", () => {
      endedListRead = bindToFrame(() => list.get());
    });
    const firstEnded = (endedListRead as unknown as () => string[])();
    firstEnded.push("stale");
    const secondEnded = (endedListRead as unknown as () => string[])();
    Assert.assertSame(0, secondEnded.length, "an ended unit does not store init()");
    Assert.assertTrue(firstEnded !== secondEnded, "each read after the unit ended is a fresh init()");
    await runInFrame("test", async () => {
      await runInFrame("unit", async () => {
        list.get().push("x");
        await ticks(1);
      });
      Assert.assertSame("x", list.get().join(","), "a child of a test frame stores init() in the test frame");
    });

    // Child of a test frame: lands in the test frame. Child of a non-test frame: stays in the child.
    await runInFrame("test", async () => {
      await runInFrame("unit", async () => {
        guarded.set("from-child");
        await ticks(1);
      });
      Assert.assertSame("from-child", guarded.get());
    });
    await runInFrame("unit", async () => {
      guarded.set("parent");
      await runInFrame("job", async () => {
        Assert.assertSame("parent", guarded.get(), "a child reads its parent's value until it writes");
        guarded.set("child");
        await ticks(1);
        Assert.assertSame("child", guarded.get());
      });
      Assert.assertSame("parent", guarded.get());
      // Narrow frame: passes through to the unit.
      runInNarrowFrame("context-scope", [], () => guarded.set("narrow"));
      Assert.assertSame("narrow", guarded.get());
    });
    runInNarrowFrame("concurrency-task", [], () => {
      Assert.assertSame("default", guarded.get());
      Assert.assertInstanceOf(ScopeFrameException, thrownBy(() => guarded.set("x")));
    });

    // Bad input.
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameStatic("C" as unknown as typeof FixtureModel, "k", () => 1)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameStatic(FixtureModel, 1 as unknown as string, () => 1)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameStatic(FixtureModel, "k", null as unknown as () => number)));
    Assert.assertTrue(Object.isFrozen(guarded));
    Assert.assertNull(currentFrame());
  },
);

xaravelTest(
  "XT-runtime-11",
  "a frame runs for an Application, currentFrame()?.app, named by its opener or inherited from its parent; lookups fall back to the process's default Application once one is registered (AD-5.3)",
  async () => {
    const a = new FixtureApplication("a");
    const b = new FixtureApplication("b");
    try {
      // Before any default is registered.
      Assert.assertNull(currentApplication());
      runInFrame("unit", () => {
        Assert.assertNull((currentFrame() as Frame).app, "a root without an Application has null");
        Assert.assertNull(currentApplication());
      });

      // The frame's Application, and inheritance.
      await runInFrame(
        "unit",
        async () => {
          Assert.assertSame(b, currentFrame()?.app);
          await ticks(1);
          Assert.assertSame(b, currentApplication());
          runInFrame("job", () => Assert.assertSame(b, currentFrame()?.app, "a child inherits its parent's Application"));
          runInFrame("job", () => Assert.assertSame(a, currentFrame()?.app, "a child may name its own"), a);
          runInNarrowFrame("transaction", [], () => Assert.assertSame(b, currentFrame()?.app, "a narrow frame inherits"));
          runInRootFrame("unit", () => Assert.assertNull((currentFrame() as Frame).app, "a root without one has null"));
          runInRootFrame("unit", () => Assert.assertSame(a, currentFrame()?.app), a);
          // interleave's root units run for the enclosing frame's Application.
          const seen = await interleave([async () => currentApplication(), async () => currentFrame()?.app ?? null]);
          Assert.assertSame(b, seen[0]);
          Assert.assertSame(b, seen[1]);
        },
        b,
      );

      // The default Application: outside any frame, in a frame with app null, and in a frame with app b.
      setDefaultApplication(a);
      Assert.assertSame(a, currentApplication());
      runInFrame("unit", () => {
        Assert.assertNull((currentFrame() as Frame).app);
        Assert.assertSame(a, currentApplication());
      });
      runInNarrowFrame("transaction", [], () => {
        Assert.assertNull((currentFrame() as Frame).app, "a narrow frame outside any frame has null");
        Assert.assertSame(a, currentApplication());
      });
      // An explicit null opens a frame for no Application, even inside a frame for b.
      runInFrame(
        "unit",
        () => {
          runInFrame(
            "job",
            () => {
              Assert.assertNull((currentFrame() as Frame).app, "a child opened with null runs for no Application");
              Assert.assertSame(a, currentApplication(), "and falls back to the default");
            },
            null,
          );
        },
        b,
      );
      runInRootFrame("unit", () => Assert.assertSame(b, currentApplication()), b);
      setDefaultApplication(null);
      Assert.assertNull(currentApplication(), "setDefaultApplication(null) clears it");

      // Bad input.
      Assert.assertInstanceOf(TypeError, thrownBy(() => runInFrame("unit", () => 1, 1 as unknown as object)));
      Assert.assertInstanceOf(TypeError, thrownBy(() => runInRootFrame("unit", () => 1, "app" as unknown as object)));
      Assert.assertInstanceOf(TypeError, thrownBy(() => setDefaultApplication(1 as unknown as object)));
      Assert.assertInstanceOf(TypeError, thrownBy(() => setDefaultApplication(undefined as unknown as object)));
      Assert.assertNull(currentApplication());
    } finally {
      setDefaultApplication(null);
    }
  },
);
