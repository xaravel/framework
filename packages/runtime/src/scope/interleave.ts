// `interleave(units)`: the dev-only helper every concurrency test uses (AD-5, NFR-4).
//
// Every unit starts synchronously, in array order, each in its own fresh `unit` frame. Started in one tick, units
// that await settled promises resume in FIFO microtask order, so the units take turns at every `await` (a, b, a,
// b, …) in the same order on every run.
import { runInFrame } from "./scope";

/**
 * Runs `units` concurrently, each in its own `unit` frame, and resolves with their results in order; rejects with
 * the first rejection in array order, once every unit has settled.
 * Its asyncRoot tag `callback` is AD-6's callback clause (it returns its callbacks' promises), as the spine § AD-6 Async-surface rule (the `callback` tag "for the callback clause") and ESC-6.4-1 define it; it reaches no Driver-contract IO root.
 * @asyncRoot callback
 */
export async function interleave<T>(units: ReadonlyArray<() => Promise<T>>): Promise<T[]> {
  if (!Array.isArray(units)) {
    throw new TypeError("interleave(): units must be an array of functions");
  }
  const started: Promise<T>[] = [];
  for (const [index, unit] of units.entries()) {
    if (typeof unit !== "function") {
      throw new TypeError(`interleave(): unit ${index} is not a function`);
    }
  }
  for (const unit of units) {
    started.push(runInFrame("unit", () => startUnit(unit)));
  }
  // Every unit settles before interleave does, so no sibling of a failed unit keeps running past it.
  const settled = await Promise.allSettled(started);
  const values: T[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      throw outcome.reason;
    }
    values.push(outcome.value);
  }
  return values;
}

/** `unit()`, with a synchronous throw turned into a rejection. */
function startUnit<T>(unit: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(unit());
  } catch (error) {
    return Promise.reject(error);
  }
}
