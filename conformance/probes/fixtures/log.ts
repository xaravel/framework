// Shared by the `bun test` probe fixtures (Story 8.3): appends one line to the
// file named by XARAVEL_PROBE_LOG, which conformance/probes/probes.ts reads
// back after the `bun test` subprocess exits. Not a test file.
import { appendFileSync } from "node:fs";

export function log(line: string): void {
  const out = process.env["XARAVEL_PROBE_LOG"];
  if (out !== undefined && out !== "") {
    appendFileSync(out, `${line}\n`);
  }
}
