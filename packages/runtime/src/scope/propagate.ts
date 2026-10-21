// Frame propagation into callbacks, stream sources and async generators (AD-5.1, ESC-8.3-1).
//
// Bun 1.4.3 drops the `AsyncLocalStorage` store in async-generator bodies and `type: "direct"` stream sources (the
// OQ-11 probes `als.async-generator` and `als.direct-stream`); AD-5.1 wraps those, stream bodies and timers created in
// a frame. Each wrapper takes one `AsyncLocalStorage.snapshot()` when it is called and runs the wrapped code inside
// it, so `currentFrame()` there is the creating frame; outside any frame the snapshot restores "no frame". The
// runtime patches no global: a timer is `setTimeout(bindToFrame(callback), ms)`.
import { AsyncLocalStorage } from "node:async_hooks";

/** `fn`, bound to the frame active now: each call runs in that frame, with the caller's `this` and arguments. */
export function bindToFrame<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  if (typeof fn !== "function") {
    throw new TypeError("bindToFrame(): fn must be a function");
  }
  const snapshot = AsyncLocalStorage.snapshot();
  return function (this: unknown, ...args: A): R {
    return snapshot(() => fn.apply(this, args));
  };
}

const SOURCE_METHODS = ["start", "pull", "cancel"] as const;
const SOURCE_OPTIONS = ["type", "autoAllocateChunkSize"] as const;

/**
 * A plain-object copy of the stream source `source` (a default or `type: "direct"` underlying source) whose `start`,
 * `pull` and `cancel` run in the frame active now, each called with `source` as `this`. It copies `source`'s own
 * enumerable properties, plus `type` and `autoAllocateChunkSize` read through `source` (so an inherited one counts)
 * when they are not undefined.
 */
export function frameStreamSource<S extends object>(source: S): S {
  if (typeof source !== "object" || source === null) {
    throw new TypeError("frameStreamSource(): source must be an object");
  }
  const snapshot = AsyncLocalStorage.snapshot();
  const wrapped: Record<PropertyKey, unknown> = { ...(source as Record<PropertyKey, unknown>) };
  for (const name of SOURCE_OPTIONS) {
    const option: unknown = (source as Record<string, unknown>)[name];
    if (option !== undefined) {
      wrapped[name] = option;
    }
  }
  for (const name of SOURCE_METHODS) {
    const method: unknown = (source as Record<string, unknown>)[name];
    if (typeof method === "function") {
      wrapped[name] = (...args: unknown[]): unknown => snapshot(() => (method as (...a: unknown[]) => unknown).apply(source, args));
    }
  }
  return wrapped as S;
}

/**
 * `generator`, with each `next`, `return` and `throw` run in the frame active now, so its body sees that frame
 * wherever it is iterated (ESC-8.3-1).
 */
export function frameAsyncGenerator<T, TReturn, TNext>(generator: AsyncGenerator<T, TReturn, TNext>): AsyncGenerator<T, TReturn, TNext> {
  if (typeof generator !== "object" || generator === null || typeof generator.next !== "function") {
    throw new TypeError("frameAsyncGenerator(): generator must be an async generator");
  }
  const snapshot = AsyncLocalStorage.snapshot();
  const wrapped: AsyncGenerator<T, TReturn, TNext> = {
    next: (...args: [] | [TNext]) => snapshot(() => generator.next(...args)),
    return: (value: TReturn | PromiseLike<TReturn>) => snapshot(() => generator.return(value)),
    throw: (error: unknown) => snapshot(() => generator.throw(error)),
    [Symbol.asyncIterator]() {
      return wrapped;
    },
    [Symbol.asyncDispose]: () => snapshot(() => generator[Symbol.asyncDispose]()),
  };
  return wrapped;
}
