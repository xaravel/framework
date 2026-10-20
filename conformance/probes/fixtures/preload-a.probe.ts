// Probe fixture for `bun-test.preload-afterEach` (Story 8.3, OQ-11), file a
// of two. Run only by conformance/probes/probes.ts with --preload ./preload.ts.
import { expect, test } from "bun:test";
import { log } from "./log";

test("a first", () => {
  log("test a first");
  expect(true).toBe(true);
});

test("a second", () => {
  log("test a second");
  expect(true).toBe(true);
});
