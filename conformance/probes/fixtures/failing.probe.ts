// Probe fixture for `bun-test.failing` (Story 8.3, OQ-11). Run only by
// conformance/probes/probes.ts in a `bun test` subprocess; never collected by
// `bun run test` (not a `*.test.ts` file). One of these tests fails on purpose.
import { expect, test } from "bun:test";

test.failing("a failing test", () => {
  expect(1).toBe(2);
});

test.failing("a passing test", () => {
  expect(1).toBe(1);
});
