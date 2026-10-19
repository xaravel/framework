// Assertion counting for declared tests (Story 4.2; FR-113, AD-15).
//
// Each test declared through `portedTest` or `xaravelTest` runs inside its own
// counting context, held in an AsyncLocalStorage so tests that run
// concurrently never mix their counts. Every assertion (Stories 4.3-4.6)
// calls `recordAssertion(kind)`; outside a declared test that is a no-op.
//
// Story 4.7 adds a kind-less count, `addToAssertionCount(n)`: PHPUnit's
// `TestCase::addToAssertionCount`, which mock object verification also uses.
// It counts toward `total` (FR-113's zero-assertion rule and
// `expectNotToPerformAssertions`) but never appears in `assertions`, as the
// Inventory records kinds only for `Assert::assert*` calls (ESC-4.7-1 item 1).
import { AsyncLocalStorage } from "node:async_hooks";

const KIND = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Counts {
  readonly kinds: Map<string, number>;
  kindless: number;
}

const storage = new AsyncLocalStorage<Counts>();

/** The outcome of one counted run: the kind multiset (keys sorted), the total with the kind-less count, and the body's error, if it threw. */
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
  counts.kinds.set(kind, (counts.kinds.get(kind) ?? 0) + 1);
}

/** Adds `count` kind-less assertions to the current test (Story 4.7); a no-op outside one. Internal (TestCase). */
export function addToAssertionCount(count: number): void {
  // PHPUnit's `int $count`: any integer (its `assert($count >= 0)` is a development-time check only).
  if (typeof count !== "number" || !Number.isSafeInteger(count)) {
    throw new TypeError(`addToAssertionCount(): count must be an integer, got ${typeof count === "number" ? String(count) : typeof count}`);
  }
  const counts = storage.getStore();
  if (counts === undefined) {
    return;
  }
  counts.kindless += count;
}

/** Runs `fn` in a fresh counting context; never rejects (the body's error is returned). Internal. */
export async function runCounted(fn: () => unknown): Promise<CountedRun> {
  const counts: Counts = { kinds: new Map<string, number>(), kindless: 0 };
  let error: { value: unknown } | null = null;
  try {
    await storage.run(counts, fn);
  } catch (thrown) {
    error = { value: thrown };
  }
  const assertions: Record<string, number> = {};
  let total = counts.kindless;
  for (const kind of [...counts.kinds.keys()].sort()) {
    const count = counts.kinds.get(kind) ?? 0;
    assertions[kind] = count;
    total += count;
  }
  return { assertions: Object.freeze(assertions), total, error };
}
