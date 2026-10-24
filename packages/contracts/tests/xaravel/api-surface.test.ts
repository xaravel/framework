// Xaravel Tests for Stories 10.2 and 10.3: the API-surface diff of `@xaravel/contracts` against Upstream's
// `Illuminate\Contracts` rows. XT-contracts-7 (Story 10.2) checks that nothing in the 19 core and service namespaces
// is unexplained (AD-1.1, AD-1.6); XT-contracts-9 (Story 10.3) that the diff for all of `Illuminate\Contracts` is clean.
// Both spawn the committed tool over the committed rows and the package's sources, so they read only committed files
// and run everywhere. The namespace lists are XT-contracts-7's constants: Story 10.2's, and Story 10.3's, which
// XT-contracts-9 covers.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { allRows } from "./support/contract-namespaces";

const REPO = join(import.meta.dir, "..", "..", "..", "..");

/** The 19 namespaces Story 10.2 ports. */
const PORTED = ["Support", "Container", "Config", "Foundation", "Pipeline", "Events", "Bus", "Queue", "Cache", "Redis", "Encryption", "Hashing", "Filesystem", "Process", "Translation", "Validation", "Debug", "Concurrency", "JsonSchema"];

/** Story 10.3's namespaces, ported by Story 10.3; XT-contracts-9 checks them, with the rest of `Illuminate\Contracts`. */
const LATER = ["Auth", "Broadcasting", "Cookie", "Database", "Http", "Mail", "Notifications", "Pagination", "Routing", "Session", "View", "Console", "Image", "Log"];

/** The `Illuminate\Contracts` top-level namespace a detail line or FQCN names, or null when it names none. */
function namespaceOf(line: string): string | null {
  return /Illuminate\\Contracts\\(\w+)\\/.exec(line)?.[1] ?? null;
}

/** Spawns `bun run api-surface --details contracts` from the repository root. */
function runApiSurface(): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["run", "api-surface", "--details", "contracts"], { cwd: REPO, encoding: "utf8", timeout: 120000, env: { ...process.env, NO_COLOR: "1" } });
}

/** The summary line's counts: Upstream, matched, missing, renamed, extra, mismatched, div12, unexplained. */
const SUMMARY = /^api-surface contracts: (\d+) Upstream, (\d+) matched, (\d+) missing, (\d+) renamed, (\d+) extra, (\d+) mismatched, (\d+) div12; (\d+) unexplained/;

xaravelTest(
  "XT-contracts-7",
  "bun run api-surface --details contracts exits 0, its summary line parses, it matches at least as many members as the 19 core and service namespaces have rows, and no detail line (missing, extra, mismatch, renamed or any other) names an FQCN in the 19 core and service namespaces, so every Upstream member of those contracts, the statics included, is matched (AD-1.1, AD-1.6)",
  () => {
    const run = runApiSurface();
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    Assert.assertNull(run.error ?? null, `${String(run.error)}\n${output}`);
    Assert.assertSame(0, run.status, output);

    const lines = output.split("\n").map((line) => line.trim());
    const summary = lines.find((line) => line.startsWith("api-surface contracts:")) ?? null;
    Assert.assertNotNull(summary, output);
    const counts = SUMMARY.exec(summary ?? "");
    Assert.assertNotNull(counts, summary ?? "");
    const count = (index: number): number => Number(counts?.[index] ?? "-1");
    Assert.assertGreaterThan(0, count(1), summary ?? "");
    Assert.assertGreaterThan(0, count(2), summary ?? "");
    Assert.assertSame(0, count(5), summary ?? "");
    Assert.assertSame(0, count(6), summary ?? "");

    // A detail line is renderItem's `contracts: <kind> …`.
    const details = lines.filter((line) => line.startsWith("contracts: "));
    // The tool really ran over the rows: it matched at least the 19 namespaces' member rows (Story 10.3's namespaces,
    // LATER, are XT-contracts-9's).
    const memberRows = allRows().filter((row) => row.member !== null && PORTED.includes(namespaceOf(row.fqcn) ?? "")).length;
    Assert.assertGreaterThanOrEqual(memberRows, count(2), `matched ${count(2)} of the 19 namespaces' ${memberRows} member rows (${LATER.length} Story 10.3 namespaces aside):\n${output}`);
    const offending = details.filter((line) => PORTED.includes(namespaceOf(line) ?? ""));
    Assert.assertSame(0, offending.length, `detail lines in the 19 namespaces:\n${offending.join("\n")}`);
  },
);

xaravelTest(
  "XT-contracts-9",
  "bun run api-surface --details contracts exits 0, its summary line parses, and it reports every Upstream declaration and member of Illuminate\\Contracts and the PSR interfaces matched: 0 missing, 0 extra, 0 mismatched, 0 renamed, 0 unexplained and no detail line at all (AD-1.1, AD-1.6)",
  () => {
    const run = runApiSurface();
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    Assert.assertNull(run.error ?? null, `${String(run.error)}\n${output}`);
    Assert.assertSame(0, run.status, output);

    const lines = output.split("\n").map((line) => line.trim());
    const summary = lines.find((line) => line.startsWith("api-surface contracts:")) ?? null;
    Assert.assertNotNull(summary, output);
    const counts = SUMMARY.exec(summary ?? "");
    Assert.assertNotNull(counts, summary ?? "");
    const count = (index: number): number => Number(counts?.[index] ?? "-1");
    Assert.assertSame(allRows().length, count(1), summary ?? "");
    Assert.assertSame(count(1), count(2), summary ?? "");
    for (const [index, kind] of [
      [3, "missing"],
      [4, "renamed"],
      [5, "extra"],
      [6, "mismatched"],
      [8, "unexplained"],
    ] as const) {
      Assert.assertSame(0, count(index), `${kind}: ${summary ?? ""}`);
    }

    // A detail line is renderItem's `contracts: <kind> …`; none is left, whatever its kind.
    const details = lines.filter((line) => line.startsWith("contracts: "));
    Assert.assertSame(0, details.length, `detail lines:\n${details.join("\n")}`);
  },
);
