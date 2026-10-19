// Starter benchmark (Story 5.7): reading the committed Expectations File, and
// comparing it with itself through the harness's own comparison
// (../harness/compare.ts). For the comparison, each Variant's run is made up
// from its lines so that every line matches: a `pass` passes with a report, a
// `fail-known` fails, a `skip` with `blocked-by:<c>` fails with
// `BlockedByComponentError(<c>)`, any other `skip` and a `quarantined` have no
// testcase. A difference means the comparison or this mirror broke, so the
// benchmark throws (a `BENCH-ERROR`, never a failed job).
import { resolve } from "node:path";
import { readExpectations } from "../../tools/pin-bump/pin-bump";
import { compare, type HarnessLine, type HarnessReport, type VariantRun } from "../harness/compare";
import type { JunitCase } from "../harness/junit";

const ROOT = resolve(import.meta.dir, "..", "..");

function harnessLines(): HarnessLine[] {
  return readExpectations(ROOT).flatMap((shard) =>
    shard.lines.map((line) => ({
      id: String(line["id"]),
      variant: String(line["variant"]),
      status: String(line["status"]),
      reason: typeof line["reason"] === "string" ? line["reason"] : null,
      adapted: typeof line["adapted"] === "string" ? line["adapted"] : null,
    })),
  );
}

/** A run of `lines` in which every line matches its status. */
function mirror(lines: readonly HarnessLine[]): VariantRun {
  const junit = new Map<string, JunitCase>();
  const reports = new Map<string, HarnessReport>();
  for (const line of lines) {
    if (line.status === "pass") {
      junit.set(line.id, { outcome: "passed", type: null, message: null });
      reports.set(line.id, { type: "ported", id: line.id, assertions: {} });
    } else if (line.status === "fail-known") {
      junit.set(line.id, { outcome: "failed", type: "AssertionError", message: "fails as known" });
    } else if (line.status === "skip" && line.reason !== null && line.reason.startsWith("blocked-by:")) {
      junit.set(line.id, { outcome: "failed", type: "BlockedByComponentError", message: `BlockedByComponentError(${line.reason.slice("blocked-by:".length)})` });
    }
  }
  return { junit, reports, late: new Set(), duplicates: new Set() };
}

const lines = harnessLines();
const byVariant = new Map<string, HarnessLine[]>();
for (const line of lines) {
  const list = byVariant.get(line.variant) ?? [];
  list.push(line);
  byVariant.set(line.variant, list);
}
const runs = new Map([...byVariant].map(([variant, variantLines]) => [variant, mirror(variantLines)]));
const knownIds = new Set(lines.map((line) => line.id));
const inventory = new Map<string, Readonly<Record<string, number>> | null>();

export default [
  {
    name: "read the Expectations File",
    fn: (): number => readExpectations(ROOT).length,
  },
  {
    name: "compare the Expectations File with itself",
    fn: (): number => {
      let checked = 0;
      for (const [variant, variantLines] of byVariant) {
        const result = compare({ variant, lines: variantLines, knownIds, run: runs.get(variant)!, inventory, waived: () => false });
        if (result.differences.length > 0) {
          throw new Error(`${result.differences.length} difference(s) comparing the Expectations File with itself, first: ${result.differences[0]!.text}`);
        }
        checked += result.results.length;
      }
      return checked;
    },
  },
];
