// Probe fixture for `bun-test.setSystemTime` (Story 8.3, OQ-11). Run only by
// conformance/probes/probes.ts in a `bun test` subprocess.
import { expect, setSystemTime, test } from "bun:test";

test("setSystemTime sets and restores the clock", () => {
  const real = Date.now();
  const at = new Date("2001-02-03T04:05:06.789Z");
  setSystemTime(at);
  expect(Date.now()).toBe(at.getTime());
  expect(new Date().toISOString()).toBe(at.toISOString());
  setSystemTime();
  expect(Math.abs(Date.now() - real)).toBeLessThan(60_000);
});
