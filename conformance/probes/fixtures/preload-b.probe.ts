// Probe fixture for `bun-test.preload-afterEach` (Story 8.3, OQ-11), file b
// of two. Run only by conformance/probes/probes.ts with --preload ./preload.ts.
import { expect, test } from "bun:test";
import { log } from "./log";

test("b first", () => {
  log("test b first");
  expect(true).toBe(true);
});

test("b second", () => {
  log("test b second");
  expect(true).toBe(true);
});
