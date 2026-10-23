// `interleave(units)`: the dev-only helper every concurrency test uses (AD-5, NFR-4).
//
// Every unit starts synchronously, in array order, each in its own fresh root `unit` frame, which sees no enclosing
// frame's slots but runs for the enclosing frame's Application (AD-5.3), read once before the units start. Opened under
// a `test` unit, each unit's origin is that test unit: the test's overlays, statics and test classes stay readable in
// the unit, while the unit's writes stay in it (Epic 9 retro, L1). Started in
// one tick, units that await settled promises resume in FIFO microtask order, so the units take turns at every `await`
// (a, b, a, b, …) in the same order on every run. Each unit ends after its defer list.
import { currentFrame, runInInterleaveUnit } from "./scope";

/**
 * Runs `units` concurrently, each in its own root `unit` frame, and resolves with their results in order; rejects with
 * the first rejection in array order, once every unit has settled.
 * Its asyncRoot tag `callback` is AD-6's callback clause: it returns its callbacks' promises (now each unit's drained
 * root-frame promise) and reaches no Driver-contract IO root. AD-6 Derivation: "A public method is async if and only if
 * it reaches a root, or it accepts a callback that DIV-1 allows to be async"; AD-6 Enforcement: the tag is `callback`
 * "for the callback clause". `decisions/DIV-1.md` (Async IO Terminals) and `decisions/ESC-6.4-1.md` define the tag.
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
  const app = currentFrame()?.app ?? null;
  for (const unit of units) {
    started.push(runInInterleaveUnit(() => startUnit(unit), app));
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
