// Preload for `bun-test.preload-afterEach` (Story 8.3, OQ-11): passed as
// `--preload` by conformance/probes/probes.ts. Registers one global afterEach
// that logs after every test of every file.
import { afterEach } from "bun:test";
import { log } from "./log";

afterEach(() => {
  log("afterEach");
});
