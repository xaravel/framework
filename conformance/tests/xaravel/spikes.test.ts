// Xaravel Tests for Story 8.4 (the Temporal and bcrypt spikes and the OQ-12
// decision; OQ-4, OQ-8, OQ-12, FR-25, FR-78). The Temporal mappings and the
// bcrypt verifier run live in this process; every expected PHP value is read
// from a signed Oracle fixture, never written here. A missing or unsigned
// fixture fails the test; it is never skipped. CLI fixture roots are hermetic
// temp directories holding copies of the request file, the signed fixtures,
// oracle.pub, REPORT.md and `.bun-version`; the real repository is only read.
import { afterAll, expect } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseEscalation } from "../../../tools/escalations/escalations";
import { xaravelTest } from "../../../packages/assert/src/index";
import {
  BCRYPT_LIMIT,
  BCRYPT_TEST_ID,
  CASES,
  caseRequest,
  checkSpikes,
  FIXTURE_DIR,
  FORMAT_TOKENS,
  GROUPS,
  NEEDS,
  NEEDS_TEST_ID,
  needRequest,
  needResult,
  OQ12_TEST_ID,
  PUBLIC_KEY_FILE,
  readOracle,
  renderReport,
  renderRequestsFile,
  REPORT_FILE,
  REQUESTS_FILE,
  runLive,
  utf8,
  type Live,
} from "../../spikes/spikes";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "conformance", "spikes", "spikes.ts");
const TIMEOUT = 120_000;
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const read = (path: string): string => readFileSync(join(root, path), "utf8");

let liveOnce: Live | null = null;
/** The live run on the real repository, once per file. */
const live = (): Live => (liveOnce ??= runLive(root));

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", CLI, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** A fixture root copying the real inputs, with files overridden or removed (`null`). */
function fixture(files: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-spikes-"));
  roots.push(dir);
  const fixtures = [...NEEDS.map(needRequest), ...CASES.map(caseRequest)].map((request) => `${FIXTURE_DIR}/${request.sha256}.json`);
  for (const path of [".bun-version", PUBLIC_KEY_FILE, REQUESTS_FILE, REPORT_FILE, ...fixtures]) {
    if (existsSync(join(root, path))) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      cpSync(join(root, path), join(dir, path));
    }
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(dir, path), { force: true });
    } else {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
  }
  return dir;
}

/** The YAML frontmatter of a Markdown file, or null. */
function frontmatter(text: string): Record<string, unknown> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  return match === null ? null : (Bun.YAML.parse(match[1]!) as Record<string, unknown>);
}

/**
 * The OQ is either ruled by the Maintainer in `decisions/<oq>.md`, or raised as the open Escalation `<esc>`
 * (`trigger: open-question`, citing `testId`) with no decision file.
 */
function ruledOrEscalated(oq: string, esc: string, testId: string): { ruled: boolean; text: string } {
  const decision = `decisions/${oq}.md`;
  if (existsSync(join(root, decision))) {
    const text = read(decision);
    expect([decision, frontmatter(text)?.["decided_by"]]).toEqual([decision, "Maintainer"]);
    return { ruled: true, text };
  }
  const file = `conformance/escalations/${esc}.md`;
  expect([file, existsSync(join(root, file))]).toEqual([file, true]);
  const parsed = parseEscalation(file, read(file));
  expect(parsed.violations).toEqual([]);
  expect(parsed.escalation!.trigger).toBe("open-question");
  expect(parsed.escalation!.testIds).toContain(testId);
  expect(existsSync(join(root, `decisions/${esc}.md`))).toBe(false);
  return { ruled: false, text: read(file) };
}

/** The Result cell of a need's REPORT.md row (`covered`, or `gap` without its reason). */
function reportResult(report: string, id: string): string | null {
  const row = report.split("\n").find((line) => line.includes(` | \`${id}\` | `));
  if (row === undefined) {
    return null;
  }
  const cells = row.split(" | ");
  return cells[cells.length - 1]!.replace(/ \|$/, "").replace(/:.*$/, "");
}

// ---------------------------------------------------------------------------
// XT-conformance-157

xaravelTest(
  "XT-conformance-157",
  "a probe suite covers Carbon's needs on Temporal (timezone and DST, month overflow, startOf/endOf, nanosecond instants, every PHP date() token) against signed Oracle fixtures; REPORT.md records each result and OQ-4 is ruled or escalated (OQ-4, FR-25)",
  () => {
    // Every AC group and every listed token has a need.
    expect([...GROUPS]).toEqual(["tz", "month", "bounds", "instant", "format"]);
    for (const group of GROUPS) {
      expect([group, NEEDS.some((item) => item.group === group)]).toEqual([group, true]);
    }
    expect(NEEDS.filter((item) => item.group === "tz").map((item) => item.id)).toEqual([
      "tz.addHours-spring-gap",
      "tz.addDay-into-gap",
      "tz.parse-ambiguous",
      "tz.addHours-fall-back",
      "tz.diffInHours-23h-day",
      "tz.setTimezone",
      "tz.startOfDay-no-midnight",
    ]);
    expect(NEEDS.filter((item) => item.group === "month").map((item) => item.id)).toEqual([
      "month.addMonth",
      "month.addMonthNoOverflow",
      "month.subMonth",
      "month.subMonthNoOverflow",
      "month.addYear",
      "month.addYearNoOverflow",
    ]);
    const units = ["minute", "hour", "day", "week", "month", "quarter", "year"];
    expect(NEEDS.filter((item) => item.group === "bounds").map((item) => item.id)).toEqual(units.map((unit) => `bounds.${unit}`));
    for (const unit of units) {
      const method = unit[0]!.toUpperCase() + unit.slice(1);
      const item = NEEDS.find((entry) => entry.id === `bounds.${unit}`)!;
      expect(item.exprs).toHaveLength(2);
      expect([item.id, item.exprs[0]!.includes(`->startOf${method}()->format('Y-m-d H:i:s.u')`), item.exprs[1]!.includes(`->endOf${method}()->format('Y-m-d H:i:s.u')`)]).toEqual([item.id, true, true]);
      expect([item.id, item.exprs.every((expr) => expr.includes("parse('2026-10-14 15:47:23.123456', 'America/New_York')"))]).toEqual([item.id, true]);
    }
    expect(NEEDS.filter((item) => item.group === "instant").map((item) => item.id)).toEqual(["instant.createFromFormat-U-u", "instant.pre-epoch-U-u", "instant.getTimestampMs", "instant.diffInMicroseconds"]);
    const tokens = "d D j l N S w z W F m M n t L o X x Y y a A B g G h H i s u v e I O P p T Z c r U".split(" ");
    expect(FORMAT_TOKENS).toEqual(tokens);
    expect(NEEDS.filter((item) => item.group === "format").map((item) => item.id)).toEqual(tokens.map((token) => `format.${token}`));
    for (const item of NEEDS.filter((entry) => entry.group === "format")) {
      expect([item.id, item.exprs.length, item.exprs.every((expr) => expr.startsWith("(new \\DateTimeImmutable(") && expr.endsWith(`->format('${item.id.slice("format.".length)}')`))]).toEqual([item.id, 4, true]);
    }
    expect(new Set(NEEDS.map((item) => item.id)).size).toBe(NEEDS.length);
    for (const item of NEEDS) {
      expect([item.id, item.id.startsWith(`${item.group}.`), item.exprs.length > 0]).toEqual([item.id, true, true]);
    }
    // `I` has no Temporal API (the Design Notes); the mapping returns null with its reason.
    expect(NEEDS.find((item) => item.id === "format.I")!.temporal()).toBeNull();
    expect(NEEDS.find((item) => item.id === "format.I")!.reason).toBe("no DST flag in Temporal");

    // The request file equals the registry render, and passes Story 3.4's judgement.
    expect(read(REQUESTS_FILE)).toBe(renderRequestsFile());
    const story = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "tools", "oracle", "story.ts"), "check", "8.4"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect([story.exitCode, story.stderr.toString()]).toEqual([0, ""]);

    // Each need's fixture verifies, and its live Temporal result gives the Result its REPORT.md row shows.
    const oracle = readOracle(root);
    const needIds = new Set(NEEDS.map((item) => item.id));
    expect(oracle.violations.filter((violation) => needIds.has(violation.slice(0, violation.indexOf(":"))))).toEqual([]);
    const report = read(REPORT_FILE);
    for (const item of NEEDS) {
      const php = oracle.values.get(item.id);
      const run = live().needs.get(item.id)!;
      expect([item.id, php !== undefined]).toEqual([item.id, true]);
      if (run.values !== null) {
        expect([item.id, run.values.length]).toEqual([item.id, item.exprs.length]);
      }
      expect([item.id, reportResult(report, item.id)]).toEqual([item.id, needResult(php!, run)]);
    }

    // REPORT.md equals renderReport, and the whole check passes.
    expect(report).toBe(renderReport(oracle.values, live(), live().bun));
    expect(checkSpikes(root, live()).violations).toEqual([]);

    // OQ-4 is ruled by the Maintainer, or raised as ESC-8.4-1 with the covered/gap counts and every gap.
    const { ruled, text } = ruledOrEscalated("OQ-4", "ESC-8.4-1", NEEDS_TEST_ID);
    if (!ruled) {
      const result = checkSpikes(root, live());
      expect(text).toContain(`${result.covered} covered, ${result.gaps} gaps (of ${result.total} needs)`);
      for (const item of NEEDS.filter((entry) => needResult(oracle.values.get(entry.id)!, live().needs.get(entry.id)!) === "gap")) {
        expect([item.id, text.includes(`\`${item.id}\``)]).toEqual([item.id, true]);
      }
    }

    // The I/O matrix, through the CLI on fixture roots.
    cliMatrix();
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-158

xaravelTest(
  "XT-conformance-158",
  "PHP $2y$ bcrypt hashes of 71, 72, 73 and 200-byte passwords, including multibyte, from signed Oracle fixtures verify in Bun once the UTF-8 input is truncated to 72 bytes; decisions/OQ-8.md records each case (OQ-8, FR-78)",
  () => {
    expect(CASES.map((item) => [item.id, utf8(item.password).length])).toEqual([
      ["bcrypt.ascii-71", 71],
      ["bcrypt.ascii-72", 72],
      ["bcrypt.ascii-73", 73],
      ["bcrypt.ascii-200", 200],
      ["bcrypt.multibyte-72", 72],
      ["bcrypt.multibyte-73-split", 73],
      ["bcrypt.multibyte-200", 200],
    ]);
    expect(CASES.filter((item) => item.id.startsWith("bcrypt.ascii-")).every((item) => /^[\x20-\x7e]+$/.test(item.password))).toBe(true);
    expect(CASES.find((item) => item.id === "bcrypt.multibyte-72")!.password).toBe("é".repeat(36));
    expect(CASES.find((item) => item.id === "bcrypt.multibyte-73-split")!.password).toBe(`a${"é".repeat(36)}`);
    expect(CASES.find((item) => item.id === "bcrypt.multibyte-200")!.password).toBe(`a${"パ".repeat(66)}b`);
    // The 72-byte cut of the split case ends inside a character.
    const split = utf8(`a${"é".repeat(36)}`).subarray(0, BCRYPT_LIMIT);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(split)).toThrow();

    const oracle = readOracle(root);
    const caseIds = new Set(CASES.map((item) => item.id));
    expect(oracle.violations.filter((violation) => caseIds.has(violation.slice(0, violation.indexOf(":"))))).toEqual([]);
    for (const item of CASES) {
      const request = caseRequest(item);
      expect(request.id).toBe(BCRYPT_TEST_ID);
      expect(request.input["setup"]).toEqual([`$pw = '${item.password}';`, "$h = crypt($pw, '$2y$12$XaravelSpike84OracleTu');"]);
      const values = oracle.values.get(item.id);
      expect([item.id, values !== undefined]).toEqual([item.id, true]);
      const [hash, verified, length] = values!;
      expect([item.id, typeof hash === "string" && hash.startsWith("$2y$12$")]).toEqual([item.id, true]);
      expect([item.id, verified, length]).toEqual([item.id, true, utf8(item.password).length]);
      const run = live().cases.get(item.id)!;
      expect([item.id, run.truncated]).toEqual([item.id, true]);
      if (utf8(item.password).length > BCRYPT_LIMIT) {
        expect([item.id, run.untruncated]).toEqual([item.id, false]);
      }
    }

    // decisions/OQ-8.md records the measurement and names every case with its result.
    const text = read("decisions/OQ-8.md");
    const meta = frontmatter(text);
    expect(meta?.["decision"]).toBe("confirmed");
    expect(meta?.["decided_by"]).toBe("orchestrator (MAINT-2026-10-16)");
    expect(meta?.["source"]).toBe(REPORT_FILE);
    expect(typeof meta?.["date"] === "string" || meta?.["date"] instanceof Date).toBe(true);
    for (const item of CASES) {
      const run = live().cases.get(item.id)!;
      const row = text.split("\n").find((line) => line.startsWith(`| \`${item.id}\` |`));
      expect([item.id, row]).toEqual([item.id, `| \`${item.id}\` | ${utf8(item.password).length} | true | ${run.truncated} | ${run.untruncated} |`]);
    }
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-159

xaravelTest("XT-conformance-159", "OQ-12 (an out-of-cycle pin bump for a security-relevant Upstream release) is ruled by the Maintainer or raised as an open Escalation (OQ-12)", () => {
  const { ruled, text } = ruledOrEscalated("OQ-12", "ESC-8.4-2", OQ12_TEST_ID);
  if (ruled) {
    // decided_by: Maintainer is checked by ruledOrEscalated; the ruling itself is an explicit field.
    expect(["allowed", "not-allowed"]).toContain(String(frontmatter(text)?.["decision"]));
  } else {
    expect(text).toContain("out-of-cycle pin bump");
  }
});

// ---------------------------------------------------------------------------
// The CLI and its I/O matrix (run by XT-conformance-157)

/** spikes:check fails closed on a missing fixture, an altered fixture, stale requests and report drift, and exits 2 on a usage error. */
function cliMatrix(): void {
  // Pass.
  const pass = run(["check", "--root", fixture()]);
  expect([pass.code, pass.stderr]).toEqual([0, ""]);
  expect(pass.stdout).toMatch(/^SPIKES OK: \d+ covered, \d+ gaps \(of \d+ needs\); \d+\/7 bcrypt cases verify\.\n$/);
  expect(run(["requests", "--check", "--root", fixture()]).code).toBe(0);

  // No fixture.
  const first = NEEDS[0]!;
  const firstPath = `${FIXTURE_DIR}/${needRequest(first).sha256}.json`;
  const missing = run(["check", "--root", fixture({ [firstPath]: null })]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain(`${first.id}: no signed fixture ${firstPath}\n`);

  // Bad signature: one character of the output changed, the file still canonical.
  const original = read(firstPath);
  const altered = original.replace(/"value":"(.)/, (_, char: string) => `"value":"${char === "0" ? "1" : "0"}`);
  expect(altered).not.toBe(original);
  const bad = run(["check", "--root", fixture({ [firstPath]: altered })]);
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain(`${first.id}: fixture ${firstPath}: the signature does not verify\n`);

  // Stale requests.
  const lines = read(REQUESTS_FILE).split("\n");
  const stale = run(["check", "--root", fixture({ [REQUESTS_FILE]: lines.slice(1).join("\n") })]);
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain(`${REQUESTS_FILE}: differs from the registry; run bun run spikes:requests\n`);
  const staleCheck = run(["requests", "--check", "--root", fixture({ [REQUESTS_FILE]: lines.slice(1).join("\n") })]);
  expect([staleCheck.code, staleCheck.stderr]).toEqual([1, `${REQUESTS_FILE}: differs from the registry; run bun run spikes:requests\n`]);

  // Report drift.
  const report = read(REPORT_FILE).split("\n");
  report[4] = `${report[4]} edited`;
  const drift = run(["check", "--root", fixture({ [REPORT_FILE]: report.join("\n") })]);
  expect([drift.code, drift.stderr]).toEqual([1, `${REPORT_FILE}: drift at line 5; run bun run spikes:generate\n`]);

  // generate rewrites a drifted report, and refuses (writing nothing) on a missing fixture.
  const dir = fixture({ [REPORT_FILE]: report.join("\n") });
  expect(run(["generate", "--root", dir]).code).toBe(0);
  expect(readFileSync(join(dir, REPORT_FILE), "utf8")).toBe(read(REPORT_FILE));
  const refused = fixture({ [firstPath]: null, [REPORT_FILE]: "edited\n" });
  const generate = run(["generate", "--root", refused]);
  expect(generate.code).toBe(1);
  expect(generate.stderr).toContain(`${first.id}: no signed fixture ${firstPath}\n`);
  expect(readFileSync(join(refused, REPORT_FILE), "utf8")).toBe("edited\n");

  // A running Bun other than the pin: check and generate fail, and generate writes nothing.
  const pinned = fixture({ ".bun-version": "0.0.0\n", [REPORT_FILE]: "edited\n" });
  const wrongBun = run(["check", "--root", pinned]);
  expect(wrongBun.code).toBe(1);
  expect(wrongBun.stderr).toContain(`running Bun ${Bun.version}, .bun-version 0.0.0\n`);
  const wrongGenerate = run(["generate", "--root", pinned]);
  expect(wrongGenerate.code).toBe(1);
  expect(wrongGenerate.stderr).toContain(`running Bun ${Bun.version}, .bun-version 0.0.0\n`);
  expect(readFileSync(join(pinned, REPORT_FILE), "utf8")).toBe("edited\n");

  // requests rewrites a stale request file from the registry.
  const rewrite = fixture({ [REQUESTS_FILE]: lines.slice(1).join("\n") });
  const written = run(["requests", "--root", rewrite]);
  expect([written.code, written.stderr]).toEqual([0, ""]);
  expect(written.stdout).toContain(`${REQUESTS_FILE}: written (`);
  expect(readFileSync(join(rewrite, REQUESTS_FILE), "utf8")).toBe(read(REQUESTS_FILE));

  // A failed bcrypt measurement fails closed, naming the case.
  const failed: Live = { ...live(), cases: new Map(live().cases) };
  failed.cases.set("bcrypt.ascii-200", { truncated: false, untruncated: true });
  failed.cases.set("bcrypt.ascii-71", { truncated: true, untruncated: false });
  const violations = checkSpikes(root, failed).violations;
  expect(violations).toContain("bcrypt.ascii-200: Bun does not verify the 72-byte truncation against PHP's hash");
  expect(violations).toContain("bcrypt.ascii-200: the untruncated control verifies over 72 bytes (200)");
  expect(violations).toContain("bcrypt.ascii-71: the untruncated control does not verify at 71 bytes");

  // Usage.
  for (const args of [["nope"], ["check", "--nope"], ["check", "--check"], ["requests", "--root"], []]) {
    const usage = run(args);
    expect([args, usage.code, usage.stdout]).toEqual([args, 2, ""]);
    expect(usage.stderr).toContain("Usage: bun conformance/spikes/spikes.ts");
  }
}
