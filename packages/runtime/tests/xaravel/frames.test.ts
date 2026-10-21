// Xaravel Tests for Story 9.2: frame kinds, the defer list and frame propagation (AD-5.1, AD-5.8, AD-5.9;
// ESC-8.3-1). One test per acceptance criterion, in order. `xaravelTest` opens no frame (ESC-4.2-1 item 7), so each
// body starts outside any Scope Frame.
import { Assert, xaravelTest } from "@xaravel/assert";
import {
  bindToFrame,
  CSP_NONCE_SLOT,
  currentFrame,
  type Frame,
  frameAsyncGenerator,
  frameDefer,
  frameSlot,
  frameStreamSource,
  interleave,
  REQUEST_SLOT,
  ROUTE_SLOT,
  runInFrame,
  runInNarrowFrame,
  runInRootFrame,
  ScopeFrameException,
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

/** The value `promise` rejects with, or null when it fulfils. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
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

/** A promise that runs `fn` after `ms` milliseconds and settles with its result. */
function after<T>(ms: number, fn: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (error) {
        reject(error);
      }
    }, ms);
  });
}

xaravelTest(
  "XT-runtime-5",
  "a narrow frame that declares slots x and y overrides only those: a read or write of any other slot inside it passes through to the enclosing unit frame (AD-5.8)",
  async () => {
    const x = frameSlot<string>("xt-runtime-5.x", () => "init-x");
    const y = frameSlot<object>("xt-runtime-5.y", () => ({}));
    const z = frameSlot<string>("xt-runtime-5.z", () => "init-z");
    const w = frameSlot<string[]>("xt-runtime-5.w", () => []);

    await runInFrame("unit", async () => {
      const unit = currentFrame();
      x.set("unit-x");
      z.set("unit-z");
      let unitY: object | null = null;
      const returned = await runInNarrowFrame("transaction", ["xt-runtime-5.x", "xt-runtime-5.y"], async () => {
        Assert.assertSame("transaction", currentFrame()?.kind);
        Assert.assertTrue(currentFrame() !== unit, "the narrow frame is its own frame");
        // Declared: the unit's value until the narrow frame writes its own.
        Assert.assertSame("unit-x", x.get());
        x.set("narrow-x");
        await ticks(2);
        Assert.assertSame("narrow-x", x.get());
        unitY = y.get();
        Assert.assertSame(unitY, y.get(), "a declared slot's init value is stored in the narrow frame");
        // Undeclared: reads and writes pass through to the unit.
        Assert.assertSame("unit-z", z.get());
        z.set("narrow-z");
        await ticks(2);
        Assert.assertSame("narrow-z", z.get());
        w.get().push("from-narrow");
        return "narrow-done";
      });
      Assert.assertSame("narrow-done", returned);
      Assert.assertSame(unit, currentFrame());
      Assert.assertSame("unit-x", x.get(), "the narrow frame's write to a declared slot stays in it");
      Assert.assertTrue(y.get() !== unitY, "a declared slot's init value lives in the narrow frame only");
      Assert.assertSame("narrow-z", z.get(), "a write to an undeclared slot lands in the unit");
      Assert.assertSame("from-narrow", w.get().join(","), "an undeclared slot's init value lives in the unit");

      // A sync narrow frame returns its result unchanged; its kind is a label.
      Assert.assertSame(7, runInNarrowFrame("context-scope", [], () => 7));
    });

    // With no enclosing unit: a declared slot is the narrow frame's own; any other write throws, a read returns init().
    Assert.assertNull(currentFrame());
    runInNarrowFrame("concurrency-task", new Set(["xt-runtime-5.x"]), () => {
      Assert.assertSame("init-x", x.get());
      x.set("alone-x");
      Assert.assertSame("alone-x", x.get());
      const thrown = thrownBy(() => z.set("alone-z"));
      Assert.assertInstanceOf(ScopeFrameException, thrown);
      Assert.assertSame(
        "Cannot write the frame slot xt-runtime-5.z from the concurrency-task frame: it does not declare the slot and no unit frame encloses it",
        (thrown as Error).message,
      );
      Assert.assertSame("init-z", z.get());
      Assert.assertTrue(w.get() !== w.get(), "with no owner frame, init() is not stored");
    });
    Assert.assertNull(currentFrame());

    Assert.assertInstanceOf(TypeError, thrownBy(() => runInNarrowFrame("transaction", null as unknown as string[], () => 1)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => runInNarrowFrame("transaction", [1 as unknown as string], () => 1)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => runInNarrowFrame("", [], () => 1)));
  },
);

xaravelTest(
  "XT-runtime-6",
  "a child unit opened inside a test frame holds only the request, route and CSP nonce, and its other writes land in the test frame; a child unit inside a non-test frame keeps its own writes; runInRootFrame, and interleave, open a root unit that sees no enclosing frame's slots (AD-5.8)",
  async () => {
    const request = frameSlot<string | null>(REQUEST_SLOT, () => null);
    const route = frameSlot<string | null>(ROUTE_SLOT, () => null);
    const nonce = frameSlot<string | null>(CSP_NONCE_SLOT, () => null);
    const auth = frameSlot<string | null>("xt-runtime-6.auth", () => null);
    const session = frameSlot<Map<string, string>>("xt-runtime-6.session", () => new Map());

    Assert.assertSame(Symbol.for("xaravel.scope.slot.request"), REQUEST_SLOT);
    Assert.assertSame(Symbol.for("xaravel.scope.slot.route"), ROUTE_SLOT);
    Assert.assertSame(Symbol.for("xaravel.scope.slot.csp-nonce"), CSP_NONCE_SLOT);

    // Child of a test frame (the embedded kernel of this.get()).
    await runInFrame("test", async () => {
      const test = currentFrame();
      request.set("test-request");
      auth.set("guest");
      const result = await runInFrame("unit", async () => {
        Assert.assertSame("unit", currentFrame()?.kind);
        Assert.assertTrue(currentFrame() !== test, "the child is its own frame");
        Assert.assertSame("test-request", request.get(), "the child reads the test frame's request until it sets its own");
        Assert.assertSame("guest", auth.get());
        request.set("child-request");
        route.set("child-route");
        nonce.set("child-nonce");
        auth.set("user-1");
        session.get().set("flash", "saved");
        await ticks(3);
        Assert.assertSame("child-request", request.get());
        Assert.assertSame("user-1", auth.get());
        return "response";
      });
      Assert.assertSame("response", result);
      Assert.assertSame(test, currentFrame());
      Assert.assertSame("user-1", auth.get(), "auth lands in the test frame");
      Assert.assertSame("saved", session.get().get("flash") ?? null, "the session's init value lives in the test frame");
      Assert.assertSame("test-request", request.get(), "the test frame's request is unchanged");
      Assert.assertNull(route.get(), "the route stays in the child");
      Assert.assertNull(nonce.get(), "the CSP nonce stays in the child");
    });

    // Child of a non-test frame: its own writes stay in it; it reads the parent's values it has not written.
    for (const kind of ["unit", "job"]) {
      runInFrame(kind, () => {
        auth.set("parent");
        request.set("parent-request");
        runInFrame("unit", () => {
          Assert.assertSame("parent", auth.get());
          auth.set("child");
          request.set("child-request");
          Assert.assertSame("child", auth.get());
          Assert.assertSame("child-request", request.get());
          session.get().set("k", "child");
        });
        Assert.assertSame("parent", auth.get(), `the ${kind} parent reads its own value`);
        Assert.assertSame("parent-request", request.get());
        Assert.assertSame(null, session.get().get("k") ?? null, "the child's init value stays in the child");
      });
    }

    // A root frame inside a test frame sees none of its slots, and its writes stay in it; interleave opens root frames.
    await runInFrame("test", async () => {
      auth.set("test-user");
      request.set("test-request");
      runInRootFrame("unit", () => {
        Assert.assertSame("unit", currentFrame()?.kind);
        Assert.assertNull(auth.get());
        Assert.assertNull(request.get());
        auth.set("root-user");
        Assert.assertSame("root-user", auth.get());
      });
      const seen = await interleave([
        async () => {
          await ticks(1);
          const value = auth.get();
          auth.set("unit-a");
          return value;
        },
        async () => {
          await ticks(1);
          const value = request.get();
          request.set("unit-b");
          return value;
        },
      ]);
      Assert.assertSame("null,null", seen.map(String).join(","));
      Assert.assertSame("test-user", auth.get());
      Assert.assertSame("test-request", request.get());
    });
    Assert.assertInstanceOf(TypeError, thrownBy(() => runInRootFrame("unit", null as unknown as () => void)));
  },
);

xaravelTest(
  "XT-runtime-7",
  "a unit whose defer list holds pending Promises ends only after every deferred Promise settles, and deferring with no active unit frame, or after the unit ended, throws (AD-5.9)",
  async () => {
    // runInFrame's result settles after the drain, not as the body's own promise (decisions/ESC-9.2-1.md, Option 1).
    // Deferred promises that settle after the body returns, one deferring another; the root frame drains too.
    for (const open of [runInFrame, runInRootFrame]) {
      const log: string[] = [];
      const value = await open("unit", async () => {
        frameDefer(
          after(5, () => {
            log.push("d1");
            frameDefer(after(5, () => log.push("d2")));
          }),
        );
        await ticks(1);
        log.push("body");
        return "value";
      });
      log.push("end");
      Assert.assertSame("value", value);
      Assert.assertSame("body,d1,d2,end", log.join(","));
    }

    // A narrow frame defers to its unit.
    const narrowLog: string[] = [];
    await runInFrame("unit", async () => {
      runInNarrowFrame("transaction", [], () => {
        frameDefer(after(5, () => narrowLog.push("deferred")));
      });
      return null;
    });
    narrowLog.push("end");
    Assert.assertSame("deferred,end", narrowLog.join(","));

    // The body's rejection wins, after the drain.
    const e0 = new Error("body");
    const e1 = new Error("deferred 1");
    const e2 = new Error("deferred 2");
    const drained: string[] = [];
    Assert.assertSame(
      e0,
      await rejectionOf(
        runInFrame("unit", async () => {
          frameDefer(
            after(5, () => {
              drained.push("d1");
              throw e1;
            }),
          );
          throw e0;
        }),
      ),
    );
    Assert.assertSame("d1", drained.join(","), "the body's rejection waits for the drain");

    // Else the first deferred rejection in registration order, not in time; each is handled at registration.
    Assert.assertSame(
      e1,
      await rejectionOf(
        runInFrame("unit", async () => {
          frameDefer(
            after(10, () => {
              throw e1;
            }),
          );
          frameDefer(Promise.reject(e2));
          frameDefer({ then: (resolve: (value: string) => void) => resolve("thenable") } as unknown as PromiseLike<string>);
          return "value";
        }),
      ),
    );

    // A sync body that leaves deferred promises throws; one that leaves none stays sync.
    const sync = thrownBy(() =>
      runInFrame("job", () => {
        frameDefer(Promise.resolve());
        return 1;
      }),
    );
    Assert.assertInstanceOf(ScopeFrameException, sync);
    Assert.assertSame(
      "The job frame's body returned synchronously with 1 deferred promise(s) pending; return a promise from the body so the unit can drain its defer list",
      (sync as Error).message,
    );
    Assert.assertSame(2, runInFrame("unit", () => 2));

    // No frame, or a unit that has ended.
    Assert.assertNull(currentFrame());
    const outside = thrownBy(() => frameDefer(Promise.resolve()));
    Assert.assertInstanceOf(ScopeFrameException, outside);
    Assert.assertSame("Cannot defer a promise with no active unit frame; run the code inside runInFrame()", (outside as Error).message);
    Assert.assertInstanceOf(
      ScopeFrameException,
      thrownBy(() => runInNarrowFrame("transaction", [], () => frameDefer(Promise.resolve()))),
    );
    const endedMessage = "Cannot defer a promise to the unit frame after it has ended";
    // A sync unit: a continuation of the unit runs after it returned.
    let late: unknown = null;
    runInFrame("unit", () => {
      void ticks(2).then(() => {
        late = thrownBy(() => frameDefer(Promise.resolve()));
      });
    });
    await ticks(4);
    Assert.assertInstanceOf(ScopeFrameException, late);
    Assert.assertSame(endedMessage, (late as Error).message);
    // An async unit: a callback captured in it runs, in its frame, after the unit's promise settled.
    const asyncGate = Promise.withResolvers<void>();
    let asyncLate: unknown = null;
    let asyncLateRan = false;
    await runInFrame("unit", async () => {
      void asyncGate.promise.then(() => {
        asyncLateRan = true;
        asyncLate = thrownBy(() => frameDefer(Promise.resolve()));
      });
      await ticks(1);
      return null;
    });
    asyncGate.resolve();
    await ticks(2);
    Assert.assertTrue(asyncLateRan, "the captured callback ran after the async unit settled");
    Assert.assertInstanceOf(ScopeFrameException, asyncLate);
    Assert.assertSame(endedMessage, (asyncLate as Error).message);
    // A unit whose sync body throws has ended too.
    const throwGate = Promise.withResolvers<void>();
    let throwLate: unknown = null;
    const bodyError = new Error("sync body failed");
    Assert.assertSame(
      bodyError,
      thrownBy(() =>
        runInFrame("unit", () => {
          void throwGate.promise.then(() => {
            throwLate = thrownBy(() => frameDefer(Promise.resolve()));
          });
          throw bodyError;
        }),
      ),
    );
    throwGate.resolve();
    await ticks(2);
    Assert.assertInstanceOf(ScopeFrameException, throwLate);
    Assert.assertSame(endedMessage, (throwLate as Error).message);
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameDefer(42 as unknown as Promise<unknown>)));

    // A defer registered k microtasks after the last deferred promise settles, during the drain's tail: it is either
    // awaited before the unit's promise settles, or it throws, never accepted and dropped.
    for (let k = 0; k <= 12; k++) {
      const gate = Promise.withResolvers<void>();
      let tail: unknown = "pending";
      let tailSettled = false;
      const unit = runInFrame("unit", async () => {
        frameDefer(gate.promise);
        void gate.promise
          .then(() => ticks(k))
          .then(() => {
            tail = thrownBy(() =>
              frameDefer(
                ticks(1).then(() => {
                  tailSettled = true;
                }),
              ),
            );
          });
        return null;
      });
      gate.resolve();
      const settledAtEnd = await unit.then(() => tailSettled);
      await ticks(20);
      Assert.assertNotSame("pending", tail, `the k=${k} continuation ran`);
      if (tail === null) {
        Assert.assertTrue(settledAtEnd, `the k=${k} defer accepted during the tail is awaited before the unit settles`);
      } else {
        Assert.assertInstanceOf(ScopeFrameException, tail, `the k=${k} defer after the unit ended throws`);
      }
    }

    // A body returning a non-native thenable (AD-6.9) gets the same object back; its then is never called.
    for (const open of [runInFrame, runInRootFrame]) {
      let thenCalled = false;
      const thenable = {
        then(): void {
          thenCalled = true;
        },
      };
      Assert.assertSame(thenable, open("unit", () => thenable));
      await ticks(2);
      Assert.assertFalse(thenCalled, "the thenable's then is never called");
    }
  },
);

xaravelTest(
  "XT-runtime-8",
  "a stream body, an async-generator body, a type: \"direct\" stream or a timer created in a frame through the runtime's wrappers sees that frame when it later runs, through AsyncLocalStorage bind/snapshot (AD-5.1)",
  async () => {
    const seen: Record<string, Frame | null> = {};
    let creator: Frame | null = null;
    let timerDone: Promise<void> = Promise.resolve();
    let defaultStream: ReadableStream<string> | null = null;
    let directStream: ReadableStream<string> | null = null;
    let generator: AsyncGenerator<string, void, undefined> | null = null;
    let boundThis: unknown = null;
    let sourceThis: boolean | null = null;
    let defaultSourceRef: object | null = null;
    let cancelStream: ReadableStream<string> | null = null;
    let classStream: ReadableStream<string> | null = null;

    runInFrame("unit", () => {
      creator = currentFrame();
      timerDone = new Promise<void>((done) => {
        setTimeout(
          bindToFrame(() => {
            seen["timer"] = currentFrame();
            done();
          }),
          5,
        );
      });
      const defaultSource = {
        async pull(controller: ReadableStreamDefaultController<string>): Promise<void> {
          await Bun.sleep(1);
          seen["stream"] = currentFrame();
          sourceThis = this === defaultSourceRef;
          controller.enqueue("stream");
          controller.close();
        },
      };
      defaultSourceRef = defaultSource;
      cancelStream = new ReadableStream<string>(
        frameStreamSource({
          start(): void {
            seen["start"] = currentFrame();
          },
          cancel(): void {
            seen["cancel"] = currentFrame();
          },
        }),
      );
      defaultStream = new ReadableStream<string>(frameStreamSource(defaultSource));
      directStream = new ReadableStream<string>(
        frameStreamSource({
          type: "direct" as const,
          pull(controller: { write: (chunk: string) => unknown; close: () => unknown }): void {
            seen["direct"] = currentFrame();
            controller.write("direct");
            controller.close();
          },
        }),
      );
      class DirectSource {
        get type(): "direct" {
          return "direct";
        }
        pull(controller: { write: (chunk: string) => unknown; close: () => unknown }): void {
          seen["class-direct"] = currentFrame();
          controller.write("class");
          controller.close();
        }
      }
      classStream = new ReadableStream<string>(frameStreamSource(new DirectSource()));
      generator = frameAsyncGenerator(
        (async function* (): AsyncGenerator<string, void, undefined> {
          await Bun.sleep(1);
          seen["generator"] = currentFrame();
          yield "generator";
          seen["generator-end"] = currentFrame();
        })(),
      );
      const target = { name: "target" };
      boundThis = bindToFrame(function (this: unknown): unknown {
        return this;
      }).call(target);
      Assert.assertSame(target, boundThis, "bindToFrame keeps this");
    });

    // Every body runs after its frame returned, from outside any frame.
    Assert.assertNull(currentFrame());
    Assert.assertNotNull(creator);
    await timerDone;
    Assert.assertSame("stream", await new Response(defaultStream as unknown as ReadableStream<string>).text());
    Assert.assertSame(true, sourceThis, "a wrapped source method runs with the original source as this");
    Assert.assertSame("direct", await new Response(directStream as unknown as ReadableStream<string>).text());
    Assert.assertSame("generator", await new Response(generator as unknown as ReadableStream<string>).text());
    Assert.assertSame("class", await new Response(classStream as unknown as ReadableStream<string>).text());
    await (cancelStream as unknown as ReadableStream<string>).cancel("done");
    for (const point of ["timer", "start", "stream", "cancel", "direct", "class-direct", "generator", "generator-end"]) {
      Assert.assertSame(creator, seen[point] ?? null, `the ${point} body sees the creating frame`);
    }

    // for await, return() and throw() run in the creating frame too.
    const steps: Array<Frame | null> = [];
    const ownFrame = await runInFrame("job", async () => {
      const frame = currentFrame();
      const wrapped = frameAsyncGenerator(
        (async function* (): AsyncGenerator<number, string, undefined> {
          try {
            steps.push(currentFrame());
            yield 1;
            steps.push(currentFrame());
            yield 2;
          } finally {
            steps.push(currentFrame());
          }
          return "never";
        })(),
      );
      return { frame, wrapped };
    });
    for await (const step of ownFrame.wrapped) {
      Assert.assertSame(1, step);
      break;
    }
    Assert.assertSame(2, steps.length);
    for (const frame of steps) {
      Assert.assertSame(ownFrame.frame, frame);
    }
    // Symbol.asyncDispose of a started generator runs its finally in the creating frame.
    let disposedIn: Frame | null = null;
    const disposable = await runInFrame("job", async () => {
      const frame = currentFrame();
      const wrapped = frameAsyncGenerator(
        (async function* (): AsyncGenerator<number, void, undefined> {
          try {
            yield 1;
          } finally {
            disposedIn = currentFrame();
          }
        })(),
      );
      Assert.assertSame(1, (await wrapped.next()).value);
      return { frame, wrapped };
    });
    Assert.assertNull(currentFrame());
    await disposable.wrapped[Symbol.asyncDispose]();
    Assert.assertSame(disposable.frame, disposedIn, "the finally block run by asyncDispose sees the creating frame");

    const thrown = frameAsyncGenerator(
      (async function* (): AsyncGenerator<number, void, undefined> {
        yield 1;
      })(),
    );
    const failure = new Error("thrown in");
    Assert.assertSame(failure, await rejectionOf(thrown.throw(failure)));

    // throw() into a started generator paused at a yield: its catch runs in the creating frame.
    let caughtIn: Frame | null = null;
    let caughtError: unknown = null;
    const paused = await runInFrame("job", async () => {
      const frame = currentFrame();
      const wrapped = frameAsyncGenerator(
        (async function* (): AsyncGenerator<number, string, undefined> {
          try {
            yield 1;
          } catch (error) {
            caughtIn = currentFrame();
            caughtError = error;
          }
          return "caught";
        })(),
      );
      Assert.assertSame(1, (await wrapped.next()).value);
      return { frame, wrapped };
    });
    Assert.assertNull(currentFrame());
    const resumed = await paused.wrapped.throw(failure);
    Assert.assertSame("caught", resumed.value);
    Assert.assertSame(failure, caughtError);
    Assert.assertSame(paused.frame, caughtIn, "the catch block sees the creating frame");

    // Created outside any frame, a wrapper runs outside any frame, wherever it is called.
    const unbound = bindToFrame(() => currentFrame());
    Assert.assertNull(runInFrame("unit", () => unbound()));
    Assert.assertInstanceOf(TypeError, thrownBy(() => bindToFrame(null as unknown as () => void)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameStreamSource(null as unknown as object)));
    Assert.assertInstanceOf(TypeError, thrownBy(() => frameAsyncGenerator({} as unknown as AsyncGenerator)));
  },
);
