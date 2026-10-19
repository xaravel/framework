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
//
// Story 5.3 adds late assertions (AD-15, FR-113). `runCounted` marks its
// counts ended once the body settles. An assertion that lands in ended counts
// (from an un-awaited promise or a timer the body left behind, which still
// carries the test's context) is not counted: it goes to
// `globalThis[Symbol.for('xaravel.harness.late')]`, when that is a function,
// as a frozen `{ id, kind }` (`kind` is null for the kind-less count), and the
// harness fails the test. Without the hook it is dropped. The hook call never
// throws: a throw here would fail whichever test happens to be running.
// Detection is best-effort: an assertion that lands after bun has finished
// the file's last test, or outside any test's context, is not seen. And a
// late assertion that fails still throws into whatever test is running then.
// `Object.freeze` and `JSON.stringify` are captured at load, so a test that reassigns a global
// cannot hide a late assertion.
import { AsyncLocalStorage } from "node:async_hooks";

const KIND = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LATE = Symbol.for("xaravel.harness.late");
const freeze = Object.freeze;
const stringify = JSON.stringify;

interface Counts {
  readonly kinds: Map<string, number>;
  kindless: number;
  /** The full Test ID the counts belong to, or null when the caller gave none. */
  readonly id: string | null;
  /** Set once the body has settled: anything recorded after that is late. */
  ended: boolean;
}

/** Hands a late assertion to the harness hook, when one is installed; never throws. */
function reportLate(id: string | null, kind: string | null): void {
  try {
    const hook: unknown = (globalThis as Record<symbol, unknown>)[LATE];
    if (typeof hook !== "function") {
      return;
    }
    const result: unknown = (hook as (late: { readonly id: string | null; readonly kind: string | null }) => unknown)(freeze({ id, kind }));
    if (typeof result === "object" && result !== null && typeof (result as { then?: unknown }).then === "function") {
      (result as PromiseLike<unknown>).then(undefined, () => undefined);
    }
  } catch {
    // A late hook that throws must not fail an unrelated test (see the header).
  }
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
    throw new TypeError(`recordAssertion(): assertion kind must match ${String(KIND)}, got ${typeof kind === "string" ? stringify(kind) : typeof kind}`);
  }
  const counts = storage.getStore();
  if (counts === undefined) {
    return;
  }
  if (counts.ended) {
    reportLate(counts.id, kind);
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
  if (counts.ended) {
    if (count !== 0) {
      reportLate(counts.id, null);
    }
    return;
  }
  counts.kindless += count;
}

/**
 * Runs `fn` in a fresh counting context for the test `id` (null when there is none); never rejects (the body's
 * error is returned). The counts end when `fn` settles; later assertions are late (see the header). Internal.
 */
export async function runCounted(fn: () => unknown, id: string | null = null): Promise<CountedRun> {
  const counts: Counts = { kinds: new Map<string, number>(), kindless: 0, id, ended: false };
  let error: { value: unknown } | null = null;
  try {
    await storage.run(counts, fn);
  } catch (thrown) {
    error = { value: thrown };
  }
  counts.ended = true;
  const assertions: Record<string, number> = {};
  let total = counts.kindless;
  for (const kind of [...counts.kinds.keys()].sort()) {
    const count = counts.kinds.get(kind) ?? 0;
    assertions[kind] = count;
    total += count;
  }
  return { assertions: freeze(assertions), total, error };
}
