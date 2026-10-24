// Xaravel Test for Story 10.2: the API-surface diff of `@xaravel/contracts` against Upstream's `Illuminate\Contracts`
// rows has nothing unexplained in the 19 core and service namespaces (AD-1.1, AD-1.6). It spawns the committed tool
// over the committed rows and the package's sources, so it reads only committed files and runs everywhere. The
// namespace lists are the test's constants: Story 10.2's, and Story 10.3's, whose missing lines show the tool ran.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

const REPO = join(import.meta.dir, "..", "..", "..", "..");

/** The 19 namespaces Story 10.2 ports. */
const PORTED = ["Support", "Container", "Config", "Foundation", "Pipeline", "Events", "Bus", "Queue", "Cache", "Redis", "Encryption", "Hashing", "Filesystem", "Process", "Translation", "Validation", "Debug", "Concurrency", "JsonSchema"];

/** Story 10.3's namespaces, not ported yet. */
const LATER = ["Auth", "Broadcasting", "Cookie", "Database", "Http", "Mail", "Notifications", "Pagination", "Routing", "Session", "View", "Console", "Image", "Log"];

/** The `Illuminate\Contracts` namespace a detail line names, or null when it names none. */
function namespaceOf(line: string): string | null {
  return /Illuminate\\Contracts\\(\w+)\\/.exec(line)?.[1] ?? null;
}

xaravelTest(
  "XT-contracts-7",
  "bun run api-surface --details contracts exits 0, its summary line parses, it reports Story 10.3's unported namespaces, and no detail line (missing, extra, mismatch, renamed or any other) names an FQCN in the 19 core and service namespaces, so every Upstream member of those contracts, the statics included, is matched (AD-1.1, AD-1.6)",
  () => {
    const run = spawnSync(process.execPath, ["run", "api-surface", "--details", "contracts"], { cwd: REPO, encoding: "utf8", timeout: 120000, env: { ...process.env, NO_COLOR: "1" } });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    Assert.assertNull(run.error ?? null, `${String(run.error)}\n${output}`);
    Assert.assertSame(0, run.status, output);

    const lines = output.split("\n").map((line) => line.trim());
    const summary = lines.find((line) => line.startsWith("api-surface contracts:")) ?? null;
    Assert.assertNotNull(summary, output);
    const counts = /^api-surface contracts: (\d+) Upstream, (\d+) matched, (\d+) missing, (\d+) renamed, (\d+) extra, (\d+) mismatched, (\d+) div12; (\d+) unexplained/.exec(summary ?? "");
    Assert.assertNotNull(counts, summary ?? "");
    const count = (index: number): number => Number(counts?.[index] ?? "-1");
    Assert.assertGreaterThan(0, count(1), summary ?? "");
    Assert.assertGreaterThan(0, count(2), summary ?? "");
    Assert.assertSame(0, count(5), summary ?? "");
    Assert.assertSame(0, count(6), summary ?? "");

    // A detail line is renderItem's `contracts: <kind> …`.
    const details = lines.filter((line) => line.startsWith("contracts: "));
    Assert.assertTrue(
      details.some((line) => LATER.includes(namespaceOf(line) ?? "")),
      `no detail line names a Story 10.3 namespace:\n${output}`,
    );
    const offending = details.filter((line) => PORTED.includes(namespaceOf(line) ?? ""));
    Assert.assertSame(0, offending.length, `detail lines in the 19 namespaces:\n${offending.join("\n")}`);
  },
);
