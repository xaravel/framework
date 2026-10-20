// Xaravel Tests for Story 8.7 (the `PORTING.md` pilot on Support and
// Collections; FR-8.2, ESC-8.7-1, ESC-8.5-1).
//
// The pilot's translations, declarations and tooling live only on the
// unmerged `pilot/porting` branch. What reaches `main` is the report,
// `docs/porting/pilot-report.md`, and the `PORTING.md` revisions it caused.
// These tests check the report against the Inventory, the seed and
// `PORTING.md`, and check that no pilot translation leaked onto the branch.
// They read the real files read-only; every mutation runs on an in-memory
// copy. A missing report, section or table is a violation, never a skip.
import { expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sampleIds } from "../../harness/select";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
export const REPORT_FILE = "docs/porting/pilot-report.md";
const TEST_FILE = "conformance/tests/xaravel/porting-pilot.test.ts";
export const SEED = "pilot-8.7";
export const MIN_SAMPLE = 60;
export const PILOT_MARKER = "pilot/porting: Story 8.7 pilot translation, never merged";
const NAMESPACE = "Illuminate\\Tests\\Support\\";
const FILES = ["SupportCollectionTest", "SupportArrTest", "SupportStrTest", "SupportStringableTest"] as const;
export const MOCKERY_ROWS: readonly string[] = [
  `${NAMESPACE}SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#0`,
  `${NAMESPACE}SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#1`,
  `${NAMESPACE}SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#0`,
  `${NAMESPACE}SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#1`,
];
/** The strata the spec fixes: a pool is the file's Inventory ids, split on `#` (provider: true, plain: false, whole file: null), without the Mockery rows. */
export const STRATA: ReadonlyArray<{ name: string; file: (typeof FILES)[number]; provider: boolean | null; size: number }> = [
  { name: "Collection provider", file: "SupportCollectionTest", provider: true, size: 16 },
  { name: "Collection plain", file: "SupportCollectionTest", provider: false, size: 8 },
  { name: "Arr", file: "SupportArrTest", provider: null, size: 12 },
  { name: "Str plain", file: "SupportStrTest", provider: false, size: 8 },
  { name: "Str provider", file: "SupportStrTest", provider: true, size: 8 },
  { name: "Stringable", file: "SupportStringableTest", provider: null, size: 8 },
];

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Every Inventory id of the Components the pilot files belong to. */
function inventoryIds(): string[] {
  const ids: string[] = [];
  for (const component of ["collections", "support"]) {
    for (const line of readFileSync(join(root, "conformance", "inventory", `${component}.jsonl`), "utf8").split("\n")) {
      if (line.trim() !== "") {
        ids.push((JSON.parse(line) as { id: string }).id);
      }
    }
  }
  return ids;
}

/** The Upstream file of a pilot Test ID, or null when it is not one of the four. */
function pilotFile(id: string): string | null {
  for (const file of FILES) {
    if (id.startsWith(`${NAMESPACE}${file}::`)) {
      return file;
    }
  }
  return null;
}

/** The seeded strata recomputed from `ids`: the Mockery rows, then `sampleIds(pool, SEED, size)` per stratum. */
export function recomputeStrata(ids: readonly string[]): { name: string; pool: number; ids: string[] }[] {
  const strata = [{ name: "Mockery", pool: MOCKERY_ROWS.length, ids: [...MOCKERY_ROWS] }];
  for (const stratum of STRATA) {
    const pool = ids.filter((id) => pilotFile(id) === stratum.file && !MOCKERY_ROWS.includes(id) && (stratum.provider === null || id.includes("#") === stratum.provider));
    strata.push({ name: stratum.name, pool: pool.length, ids: sampleIds(pool, SEED, stratum.size) });
  }
  return strata;
}

/** The `## <name>` sections of `text` (heading excluded), by name. */
export function sections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let name: string | null = null;
  let body: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^## (.+)$/.exec(line);
    if (match !== null) {
      if (name !== null) {
        out.set(name, body.join("\n"));
      }
      name = match[1]!.trim();
      body = [];
    } else if (name !== null) {
      body.push(line);
    }
  }
  if (name !== null) {
    out.set(name, body.join("\n"));
  }
  return out;
}

/** The body rows (cells trimmed) of the table in `section` whose header row is exactly `header`; null when absent. */
export function table(section: string, header: string): string[][] | null {
  const lines = section.split("\n");
  const at = lines.findIndex((line) => line.trim() === header);
  if (at < 0) {
    return null;
  }
  const rows: string[][] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith("|")) {
      break;
    }
    rows.push(
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

/** The backticked ids of a cell: full ids as written, short ids (without the namespace) expanded. */
function cellIds(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => (m[1]!.startsWith(NAMESPACE) ? m[1]! : `${NAMESPACE}${m[1]!}`));
}

/** The report's sampled ids (the `## Sample` id table), or null without the table. */
export function reportedIds(report: string): string[] | null {
  const rows = table(sections(report).get("Sample") ?? "", "| Test ID | Stratum | Floor |");
  return rows === null ? null : rows.map((row) => cellIds(row[0] ?? "")[0] ?? (row[0] ?? ""));
}

const FLOOR = /^(?:met|approximate|adapted:DIV-[1-9]\d*\.[1-9]\d*)$/;
const VERDICT = /^- Reviewer ([12]): (pass|reject), CLI `(claude|codex)`, model `([^`]+)`, loop CLI `(claude|codex)`, fallback (.+), tree `([0-9a-f]{40})`$/;

/** XT-conformance-166's violations of `report` (null: missing) against the Inventory ids. */
export function sampleViolations(report: string | null, inventory: readonly string[]): string[] {
  if (report === null) {
    return [`pilot report missing: ${REPORT_FILE}`];
  }
  const violations: string[] = [];
  const parts = sections(report);
  const sample = parts.get("Sample");
  if (sample === undefined) {
    return ["section ## Sample missing"];
  }
  if (!sample.includes(`Seed: \`${SEED}\``)) {
    violations.push(`seed is not \`${SEED}\``);
  }
  const expected = recomputeStrata(inventory);
  const strata = table(sample, "| Stratum | Pool | Taken |");
  if (strata === null) {
    violations.push("strata table | Stratum | Pool | Taken | missing");
  } else {
    const got = strata.map((row) => row.join(" / "));
    const want = expected.map((s) => `${s.name} / ${s.pool} / ${s.ids.length}`);
    if (got.join("\n") !== want.join("\n")) {
      violations.push(`sample differs from seed: strata ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    }
  }
  const rows = table(sample, "| Test ID | Stratum | Floor |");
  if (rows === null) {
    violations.push("id table | Test ID | Stratum | Floor | missing");
    return violations;
  }
  const known = new Set(inventory);
  const seen = new Set<string>();
  for (const row of rows) {
    const id = cellIds(row[0] ?? "")[0] ?? row[0] ?? "";
    if (seen.has(id)) {
      violations.push(`duplicate Test ID ${id}`);
    }
    seen.add(id);
    if (!known.has(id) || pilotFile(id) === null) {
      violations.push(`unknown Test ID ${id}`);
    }
    const floor = row[2] ?? "";
    if (floor === "short") {
      violations.push(`floor short: ${id}`);
    } else if (!FLOOR.test(floor)) {
      violations.push(`floor not met: ${id} (${floor})`);
    }
  }
  if (seen.size < MIN_SAMPLE) {
    violations.push(`fewer than ${MIN_SAMPLE} Test IDs: ${seen.size}`);
  }
  for (const id of MOCKERY_ROWS) {
    if (!seen.has(id)) {
      violations.push(`missing Mockery row ${id}`);
    }
  }
  if (![...seen].some((id) => id.includes("#") && !MOCKERY_ROWS.includes(id))) {
    violations.push("no data-provider row beyond the Mockery rows");
  }
  if (![...seen].some((id) => pilotFile(id) === "SupportArrTest")) {
    violations.push("no SupportArrTest row (PHP-array semantics)");
  }
  const byRow = new Map(rows.map((row) => [cellIds(row[0] ?? "")[0] ?? "", row[1] ?? ""]));
  const differs: string[] = [];
  for (const stratum of expected) {
    for (const id of stratum.ids) {
      if (byRow.get(id) !== stratum.name) {
        differs.push(`${id} expected in ${stratum.name}`);
      }
    }
  }
  const wanted = new Set(expected.flatMap((s) => s.ids));
  differs.push(...[...seen].filter((id) => !wanted.has(id)).map((id) => `${id} not drawn by the seed`));
  if (differs.length > 0) {
    violations.push(`sample differs from seed: ${differs.join("; ")}`);
  }
  const approximate = parts.get("Approximate counts") ?? null;
  if (approximate === null) {
    violations.push("section ## Approximate counts missing");
  } else {
    for (const row of rows.filter((r) => r[2] === "approximate")) {
      const id = cellIds(row[0] ?? "")[0] ?? "";
      if (!approximate.includes(`\`${id}\``)) {
        violations.push(`approximate count not listed: ${id}`);
      }
    }
  }
  const checks = parts.get("Checks") ?? "";
  if (!/^- Type-check: pass\b/m.test(checks)) {
    violations.push("type-check not pass");
  }
  const verdicts = (parts.get("Fidelity Review") ?? "")
    .split("\n")
    .map((line) => VERDICT.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  const passes = verdicts.filter((m) => m[2] === "pass");
  if (new Set(passes.map((m) => m[1])).size < 2 || new Set(passes.map((m) => m[7])).size !== 1) {
    violations.push("fewer than 2 pass verdicts on one tree");
  }
  if (!passes.some((m) => m[3] !== m[5] || m[6] !== "none")) {
    violations.push("no pass verdict on a CLI other than the loop's, and no fallback recorded");
  }
  return violations;
}

/** The lines of tracked `files` (path, content) that carry the pilot marker as a comment, outside the report and this test. */
export function markerViolations(files: ReadonlyArray<readonly [string, string]>): string[] {
  const marker = new RegExp(`^\\s*(?://|#|<!--)\\s*${PILOT_MARKER.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "m");
  return files.filter(([path, text]) => path !== REPORT_FILE && path !== TEST_FILE && marker.test(text)).map(([path]) => `pilot translation on main: ${path}`);
}

/** The tracked files of the repository at `dir` that contain the marker text, read for `markerViolations`; a git failure is a violation. */
export function trackedMarkerViolations(dir: string): string[] {
  const proc = Bun.spawnSync(["git", "grep", "-l", "-z", "-F", PILOT_MARKER], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode === 1 && proc.stderr.toString().trim() === "") {
    return [];
  }
  if (proc.exitCode !== 0) {
    return [`git grep failed with exit ${proc.exitCode}: ${proc.stderr.toString().trim()}`];
  }
  const paths = proc.stdout
    .toString()
    .split("\0")
    .filter((path) => path !== "");
  return markerViolations(paths.map((path) => [path, readFileSync(join(dir, path), "utf8")] as const));
}

/** XT-conformance-167's violations of `report` (null: missing) against `porting` (PORTING.md) and the sampled ids. */
export function revisionViolations(report: string | null, porting: string | null): string[] {
  if (report === null) {
    return [`pilot report missing: ${REPORT_FILE}`];
  }
  if (porting === null) {
    return ["PORTING.md missing"];
  }
  const violations: string[] = [];
  const parts = sections(report);
  const sampled = new Set(reportedIds(report) ?? []);
  if (sampled.size === 0) {
    violations.push("no sampled Test IDs in ## Sample");
  }
  const portingSections = new Set(sections(porting).keys());
  const rules = table(parts.get("Rules hit") ?? "", "| Rule | Test IDs |");
  if (rules === null || rules.length === 0) {
    violations.push("no rules hit listed");
  } else {
    for (const [rule = "", cell = ""] of rules) {
      const section = rule.split(" / ")[0]!;
      if (!portingSections.has(section)) {
        violations.push(`rule names no PORTING.md section: ${rule}`);
      }
      const ids = cellIds(cell);
      if (ids.length === 0) {
        violations.push(`rule hit by no Test ID: ${rule}`);
      }
      violations.push(...ids.filter((id) => !sampled.has(id)).map((id) => `unknown Test ID ${id}`));
    }
  }
  const ambiguities = table(parts.get("Ambiguities") ?? "", "| # | Ambiguity | Test IDs | Revision |");
  if (ambiguities === null || ambiguities.length === 0) {
    violations.push("no ambiguities listed");
  } else {
    ambiguities.forEach(([n = "", text = "", cell = "", revision = ""], i) => {
      if (n !== String(i + 1)) {
        violations.push(`ambiguity numbered ${n}, expected ${i + 1}`);
      }
      if (text === "") {
        violations.push(`ambiguity #${n} has no text`);
      }
      const ids = cellIds(cell);
      if (ids.length === 0) {
        violations.push(`ambiguity #${n} names no Test ID`);
      }
      violations.push(...ids.filter((id) => !sampled.has(id)).map((id) => `unknown Test ID ${id}`));
      const quoted = /^`` (.+) ``$/.exec(revision);
      if (quoted === null || !porting.includes(quoted[1]!)) {
        violations.push(`revision not in PORTING.md: #${n}`);
      }
    });
  }
  if (!/`pilot\/porting` at `[0-9a-f]{40}`/.test(parts.get("Checks") ?? "")) {
    violations.push("the report does not name `pilot/porting` with its 40-hex commit sha");
  }
  return violations;
}

/** `text` with `from` replaced by `to`; fails the test when `from` is absent, so a mutation never silently no-ops. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const found = typeof from === "string" ? text.includes(from) : from.test(text);
  expect(`${found}: ${String(from)}`).toBe(`true: ${String(from)}`);
  return text.replace(from, () => to);
}

const REPORT = readOrNull(join(root, REPORT_FILE));
const PORTING = readOrNull(join(root, "PORTING.md"));

// ---------------------------------------------------------------------------
// XT-conformance-166 (AC1): the sample and the checks

xaravelTest(
  "XT-conformance-166",
  "docs/porting/pilot-report.md records a pilot sample of at least 60 unique Inventory Test IDs from SupportCollectionTest, SupportArrTest, SupportStrTest and SupportStringableTest, equal to the seed pilot-8.7 strata recomputed with sampleIds, with all 4 Mockery rows, data-provider rows and Arr rows; type-check pass; every floor met, approximate (and listed) or adapted; and two pass Fidelity verdicts on one tree, one on the other CLI or with its fallback recorded (FR-8.2)",
  () => {
    const inventory = inventoryIds();
    expect(REPORT).not.toBeNull();
    expect(sampleViolations(REPORT, inventory)).toEqual([]);
    const real = REPORT!;
    const ids = reportedIds(real)!;
    expect(ids.length).toBeGreaterThanOrEqual(MIN_SAMPLE);

    // Missing report.
    expect(sampleViolations(null, inventory)).toEqual([`pilot report missing: ${REPORT_FILE}`]);

    // An id swapped for another Inventory id of the same file.
    const drawn = ids[10]!;
    const other = inventory.find((id) => pilotFile(id) === "SupportCollectionTest" && id.includes("#") && !ids.includes(id))!;
    const swapped = sampleViolations(mutate(real, `\`${drawn}\``, `\`${other}\``), inventory);
    expect(swapped.some((v) => v.startsWith("sample differs from seed"))).toBe(true);

    // A Mockery row dropped.
    const mockeryLine = real.split("\n").find((line) => line.startsWith(`| \`${MOCKERY_ROWS[0]}\``))!;
    const dropped = sampleViolations(mutate(real, `${mockeryLine}\n`, ""), inventory);
    expect(dropped).toContain(`missing Mockery row ${MOCKERY_ROWS[0]}`);

    // Fewer than 60: drop the Arr rows.
    const arrLines = real.split("\n").filter((line) => line.startsWith(`| \`${NAMESPACE}SupportArrTest::`));
    const fewer = sampleViolations(arrLines.reduce((text, line) => mutate(text, `${line}\n`, ""), real), inventory);
    expect(fewer).toContain(`fewer than ${MIN_SAMPLE} Test IDs: ${ids.length - arrLines.length}`);
    expect(fewer).toContain("no SupportArrTest row (PHP-array semantics)");

    // An unknown id, and an Inventory id from another file.
    expect(sampleViolations(mutate(real, `\`${drawn}\``, `\`${NAMESPACE}SupportCollectionTest::testNope\``), inventory)).toContain(`unknown Test ID ${NAMESPACE}SupportCollectionTest::testNope`);
    const foreign = inventory.find((id) => pilotFile(id) === null)!;
    expect(sampleViolations(mutate(real, `\`${drawn}\``, `\`${foreign}\``), inventory)).toContain(`unknown Test ID ${foreign}`);

    // A floor `short`, or not one of the allowed values.
    const metLine = real.split("\n").find((line) => line.startsWith("| `") && line.endsWith("| met |"))!;
    const metId = cellIds(metLine)[0]!;
    expect(sampleViolations(mutate(real, metLine, metLine.replace(/\| met \|$/, "| short |")), inventory)).toContain(`floor short: ${metId}`);
    expect(sampleViolations(mutate(real, metLine, metLine.replace(/\| met \|$/, "| adapted:DIV-x |")), inventory)).toContain(`floor not met: ${metId} (adapted:DIV-x)`);

    // An approximate id not listed under ## Approximate counts.
    const approxLine = real.split("\n").find((line) => line.startsWith("| `") && line.endsWith("| approximate |"))!;
    const approxId = cellIds(approxLine)[0]!;
    const approxSection = real.slice(real.indexOf("## Approximate counts"));
    const unlisted = real.slice(0, real.indexOf("## Approximate counts")) + mutate(approxSection, `- \`${approxId}\``, "- (dropped)");
    expect(sampleViolations(unlisted, inventory)).toContain(`approximate count not listed: ${approxId}`);

    // Type-check not pass.
    expect(sampleViolations(mutate(real, "- Type-check: pass", "- Type-check: fail"), inventory)).toContain("type-check not pass");

    // A reject, and no cross-model reviewer and no fallback.
    expect(sampleViolations(mutate(real, /- Reviewer 2: pass,/, "- Reviewer 2: reject,"), inventory)).toContain("fewer than 2 pass verdicts on one tree");
    const sameCli = mutate(real, /- Reviewer 1: pass, CLI `codex`/, "- Reviewer 1: pass, CLI `claude`");
    expect(sampleViolations(sameCli, inventory)).toContain("no pass verdict on a CLI other than the loop's, and no fallback recorded");
    expect(/- Reviewer 1: [^\n]*fallback none,/.test(sameCli)).toBe(true);
    const fellBack = sameCli.replace(/(- Reviewer 1: [^\n]*?)fallback none,/, "$1fallback codex unavailable: not signed in,");
    expect(sampleViolations(fellBack, inventory)).toEqual([]);

    // The seed changed.
    expect(sampleViolations(mutate(real, `Seed: \`${SEED}\``, "Seed: `other`"), inventory)).toContain(`seed is not \`${SEED}\``);
  },
);

// ---------------------------------------------------------------------------
// XT-conformance-167 (AC2): rules hit, revisions in PORTING.md, the branch and no leak

xaravelTest(
  "XT-conformance-167",
  "docs/porting/pilot-report.md lists the PORTING.md rules hit and the ambiguities, each ambiguity's quoted revision text occurs in PORTING.md, the report names pilot/porting with a 40-hex commit sha, and no tracked file outside the report and this test carries the pilot translation marker (FR-8.2)",
  () => {
    expect(REPORT).not.toBeNull();
    expect(PORTING).not.toBeNull();
    expect(revisionViolations(REPORT, PORTING)).toEqual([]);
    expect(trackedMarkerViolations(root)).toEqual([]);
    const real = REPORT!;
    const porting = PORTING!;

    // Missing report or PORTING.md.
    expect(revisionViolations(null, porting)).toEqual([`pilot report missing: ${REPORT_FILE}`]);
    expect(revisionViolations(real, null)).toEqual(["PORTING.md missing"]);

    // A revision removed from PORTING.md.
    const first = table(sections(real).get("Ambiguities")!, "| # | Ambiguity | Test IDs | Revision |")![0]!;
    const quote = /^`` (.+) ``$/.exec(first[3]!)![1]!;
    expect(revisionViolations(real, mutate(porting, quote, "(removed)"))).toContain("revision not in PORTING.md: #1");

    // No rule hits, and no ambiguities.
    const rulesSection = sections(real).get("Rules hit")!;
    const ruleRows = rulesSection.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Rule |") && !line.startsWith("| --- |"));
    const noRules = ruleRows.reduce((text, line) => mutate(text, `${line}\n`, ""), real);
    expect(revisionViolations(noRules, porting)).toContain("no rules hit listed");
    const noAmbiguities = mutate(real, "| # | Ambiguity | Test IDs | Revision |", "| Nothing |");
    expect(revisionViolations(noAmbiguities, porting)).toContain("no ambiguities listed");

    // A rule naming no PORTING.md section, and an unknown id in a row.
    expect(revisionViolations(mutate(real, /\| Test-adaptation rules \/ Shape \|/, "| Nowhere / Shape |"), porting)).toContain("rule names no PORTING.md section: Nowhere / Shape");
    expect(revisionViolations(mutate(real, /\| Test-adaptation rules \/ Shape \| `/, "| Test-adaptation rules / Shape | `SupportArrTest::testNope`, `"), porting)).toContain(`unknown Test ID ${NAMESPACE}SupportArrTest::testNope`);

    // The branch sha missing.
    expect(revisionViolations(mutate(real, /`pilot\/porting` at `[0-9a-f]{40}`/, "`pilot/porting` at `abc`"), porting)).toContain("the report does not name `pilot/porting` with its 40-hex commit sha");

    // A pilot translation leaked onto the branch; the report, this test and an inline mention are not leaks.
    const leaked = `// ${PILOT_MARKER}\nimport { portedTest } from "@xaravel/assert";\n`;
    expect(markerViolations([["packages/support/tests/ported/framework/tests/Support/SupportStrTest.test.ts", leaked]])).toEqual(["pilot translation on main: packages/support/tests/ported/framework/tests/Support/SupportStrTest.test.ts"]);
    expect(markerViolations([["pilot/types/runtime.d.ts", `<!-- ${PILOT_MARKER} -->\n`]])).toEqual(["pilot translation on main: pilot/types/runtime.d.ts"]);
    expect(markerViolations([[REPORT_FILE, leaked], [TEST_FILE, leaked], ["spec.md", `Each file starts with \`// ${PILOT_MARKER}\`.\n`]])).toEqual([]);

    // A git failure is a violation, never a pass.
    const notRepo = mkdtempSync(join(tmpdir(), "xt-pilot-"));
    try {
      const outside = trackedMarkerViolations(notRepo);
      expect(outside.length).toBe(1);
      expect(outside[0]!.startsWith("git grep failed")).toBe(true);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  },
);
