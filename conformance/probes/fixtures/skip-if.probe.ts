// Probe fixture for `bun-test.skipIf` (Story 8.3, OQ-11). Run only by
// conformance/probes/probes.ts in a `bun test` subprocess.
import { expect, test } from "bun:test";
import { log } from "./log";

test.skipIf(true)("skipIf(true)", () => {
  log("ran skipIf(true)");
  expect(true).toBe(true);
});

test.skipIf(false)("skipIf(false)", () => {
  log("ran skipIf(false)");
  expect(true).toBe(true);
});
