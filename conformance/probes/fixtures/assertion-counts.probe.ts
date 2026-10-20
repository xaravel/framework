// Probe fixture for `bun-test.assertion-counts` (Story 8.3, OQ-11). Run only
// by conformance/probes/probes.ts in a `bun test` subprocess. The last test
// fails on purpose: it plans two assertions and makes one.
import { expect, test } from "bun:test";

test("three expects", () => {
  expect(1).toBe(1);
  expect("a").toBe("a");
  expect([1]).toEqual([1]);
});

test("one expect", () => {
  expect(true).toBe(true);
});

test("expect.assertions(2) with one", () => {
  expect.assertions(2);
  expect(1).toBe(1);
});
