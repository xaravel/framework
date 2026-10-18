// `portedTest`: declares a Ported Test (Story 4.2; FR-2, FR-113, AD-5, AD-15).
//
// Each dataset row becomes one test labelled with its full Test ID: `<id>#<key>`
// for an object or `Map` key (verbatim, `Map` keys in insertion order) and
// `<id>#<index>` for a list row; without a dataset the label is the bare `<id>`.
// Per test:
//
//   1. a counting context opens (AssertionCounter);
//   2. if `globalThis[Symbol.for('xaravel.scope.run')]` is a function, the rest
//      runs inside its callback as `run('test', inner)` (ESC-4.2-1, AD-5);
//   3. `inner` follows PHPUnit's `runBare`: it builds `new options.case()` (when
//      given) as `this`, awaits its `setUp()` and the body, then always its
//      `tearDown()`, even after a failing `setUp`; the first error wins. No
//      other lifecycle hook runs here (AD-25 belongs to @xaravel/testing's TestCase);
//   4. if `globalThis[Symbol.for('xaravel.mockery.run')]` is a function
//      (installed by @xaravel/mockery on load), `inner` runs through it, inside
//      the frame: Mockery's container is closed and verified when `inner`
//      resolves (an unmet expectation fails the test, and each counted
//      expectation records a `mockeryExpectation` assertion), and purged
//      without verifying when it rejects, so the body's error wins
//      (ESC-4.5-1 item 1);
//   5. the report goes to the harness reporter, passing or failing;
//   6. a body or lifecycle error fails the test, then a reporter error;
//      otherwise zero recorded assertions fail the test (FR-113).
import { registerTests } from "./Declarations";

const SCOPE_RUN = Symbol.for("xaravel.scope.run");
const MOCKERY_RUN = Symbol.for("xaravel.mockery.run");
const INTEGER_LIKE = /^(0|-?[1-9][0-9]*)$/;

/**
 * A PHPUnit/Pest data provider: a list of rows, keyed rows (plain object, no integer-like keys), or a `Map`
 * whose keys are non-negative integers or non-empty strings (for providers that mix int and named keys).
 * A non-array row is one argument.
 */
export type Dataset = Readonly<Record<string, unknown>> | readonly unknown[] | ReadonlyMap<number | string, unknown>;

/** The options of a Ported Test. */
export interface PortedTestOptions<T extends object> {
  /** The test case class; a fresh instance is the body's `this`. */
  readonly case?: new () => T;
  /** One test per row, labelled `<id>#<key>` or `<id>#<index>`. */
  readonly dataset?: Dataset;
}

interface Lifecycle {
  setUp?: unknown;
  tearDown?: unknown;
}

/**
 * Declares the Ported Test `id` (its Upstream Test ID); `body` must record at least one assertion.
 * Its rest parameter is `any[]` because dataset rows are spread into the body's own parameter types.
 */
export function portedTest<T extends object>(id: string, options: PortedTestOptions<T>, body: (this: T, ...args: any[]) => unknown): void {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError(`portedTest(): id must be a non-empty Test ID, got ${typeof id === "string" ? JSON.stringify(id) : typeof id}`);
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`portedTest(): ${id} options must be an object`);
  }
  const testCase: unknown = options.case;
  if (testCase !== undefined && typeof testCase !== "function") {
    throw new TypeError(`portedTest(): ${id} option "case" must be a class`);
  }
  if (typeof body !== "function") {
    throw new TypeError(`portedTest(): ${id} needs a test function`);
  }
  const rows = datasetRows(id, options.dataset);
  const planned = rows.map(([key, args]) => {
    const label = key === null ? id : `${id}#${key}`;
    const inner = async (): Promise<void> => {
      const self = testCase === undefined ? undefined : (new (testCase as new () => T)() as T & Lifecycle);
      let first: { value: unknown } | null = null;
      try {
        if (typeof self?.setUp === "function") {
          await (self.setUp as () => unknown).call(self);
        }
        await body.apply(self as T, args);
      } catch (thrown) {
        first = { value: thrown };
      }
      if (typeof self?.tearDown === "function") {
        try {
          await (self.tearDown as () => unknown).call(self);
        } catch (thrown) {
          first ??= { value: thrown };
        }
      }
      if (first !== null) {
        throw first.value;
      }
    };
    const run = async (): Promise<void> => {
      const scopeRun: unknown = (globalThis as Record<symbol, unknown>)[SCOPE_RUN];
      if (typeof scopeRun === "function") {
        await (scopeRun as (kind: string, fn: () => Promise<void>) => unknown)("test", () => runWithMockery(inner));
      } else {
        await runWithMockery(inner);
      }
    };
    return { label, id: label, run };
  });
  registerTests("portedTest()", "ported", null, planned, true);
}

/**
 * Runs `fn` through Mockery's test-finish protocol when @xaravel/mockery is loaded (ESC-4.5-1 item 1), else directly.
 * Shared with `xaravelTest`.
 */
export async function runWithMockery(fn: () => unknown): Promise<void> {
  const mockeryRun: unknown = (globalThis as Record<symbol, unknown>)[MOCKERY_RUN];
  if (typeof mockeryRun === "function") {
    await (mockeryRun as (fn: () => unknown) => unknown)(fn);
  } else {
    await fn();
  }
}

/** `[key, args]` per test; a single `[null, []]` without a dataset. */
function datasetRows(id: string, dataset: unknown): [string | null, unknown[]][] {
  if (dataset === undefined) {
    return [[null, []]];
  }
  const asArgs = (row: unknown): unknown[] => (Array.isArray(row) ? [...(row as unknown[])] : [row]);
  if (Array.isArray(dataset)) {
    const list = dataset as unknown[];
    if (list.length === 0) {
      throw new TypeError(`portedTest(): ${id} dataset is empty`);
    }
    const rows: [string, unknown[]][] = [];
    for (let index = 0; index < list.length; index++) {
      if (!(index in list)) {
        throw new TypeError(`portedTest(): ${id} dataset list has a hole at index ${index}`);
      }
      rows.push([String(index), asArgs(list[index])]);
    }
    return rows;
  }
  if (dataset instanceof Map) {
    if (dataset.size === 0) {
      throw new TypeError(`portedTest(): ${id} dataset is empty`);
    }
    const seen = new Set<string>();
    const rows: [string, unknown[]][] = [];
    for (const [key, row] of dataset as Map<unknown, unknown>) {
      const valid = typeof key === "number" ? Number.isSafeInteger(key) && key >= 0 && !Object.is(key, -0) : typeof key === "string" && key !== "";
      if (!valid) {
        throw new TypeError(`portedTest(): ${id} dataset Map key must be a non-negative integer or a non-empty string, got ${typeof key === "string" ? JSON.stringify(key) : String(key)}`);
      }
      // An integer-like string key names the int itself (PHP array keys), so "1" and 1 collide.
      const label = String(key);
      if (seen.has(label)) {
        throw new TypeError(`portedTest(): ${id} dataset Map key ${label} is duplicated`);
      }
      seen.add(label);
      rows.push([label, asArgs(row)]);
    }
    return rows;
  }
  const prototype: unknown = typeof dataset === "object" && dataset !== null ? Object.getPrototypeOf(dataset) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`portedTest(): ${id} dataset must be an array of rows, a plain object of keyed rows or a Map`);
  }
  const keys = Object.keys(dataset as object);
  if (keys.length === 0) {
    throw new TypeError(`portedTest(): ${id} dataset is empty`);
  }
  return keys.map((key) => {
    if (INTEGER_LIKE.test(key)) {
      throw new TypeError(`portedTest(): ${id} dataset key "${key}" is integer-like; use a list for indexed rows`);
    }
    return [key, asArgs((dataset as Record<string, unknown>)[key])];
  });
}
