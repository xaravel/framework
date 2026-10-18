// Assertion counting for declared tests (Story 4.2; FR-113, AD-15).
//
// Each test declared through `portedTest` or `xaravelTest` runs inside its own
// counting context, held in an AsyncLocalStorage so tests that run
// concurrently never mix their counts. Every assertion (Stories 4.3-4.6)
// calls `recordAssertion(kind)`; outside a declared test that is a no-op.
import { AsyncLocalStorage } from "node:async_hooks";

const KIND = /^[A-Za-z_][A-Za-z0-9_]*$/;

const storage = new AsyncLocalStorage<Map<string, number>>();

/** The outcome of one counted run: the kind multiset (keys sorted) and the body's error, if it threw. */
export interface CountedRun {
  readonly assertions: Readonly<Record<string, number>>;
  readonly total: number;
  readonly error: { readonly value: unknown } | null;
}

/** Records one assertion of `kind` (a PHPUnit or Mockery assertion name) in the current test. */
export function recordAssertion(kind: string): void {
  if (typeof kind !== "string" || !KIND.test(kind)) {
    throw new TypeError(`recordAssertion(): assertion kind must match ${String(KIND)}, got ${typeof kind === "string" ? JSON.stringify(kind) : typeof kind}`);
  }
  const counts = storage.getStore();
  if (counts === undefined) {
    return;
  }
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

/** Runs `fn` in a fresh counting context; never rejects (the body's error is returned). Internal. */
export async function runCounted(fn: () => unknown): Promise<CountedRun> {
  const counts = new Map<string, number>();
  let error: { value: unknown } | null = null;
  try {
    await storage.run(counts, fn);
  } catch (thrown) {
    error = { value: thrown };
  }
  const assertions: Record<string, number> = {};
  let total = 0;
  for (const kind of [...counts.keys()].sort()) {
    const count = counts.get(kind) ?? 0;
    assertions[kind] = count;
    total += count;
  }
  return { assertions: Object.freeze(assertions), total, error };
}
