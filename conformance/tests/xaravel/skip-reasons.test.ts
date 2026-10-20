// Xaravel Tests for Story 5.2 (Skip Reason rule checks, FR-3, SM-C1). These
// run under plain `bun test` until the harness's `xaravelTest` lands in Story
// 5.9. Fixture roots are hermetic temp directories holding the package table,
// an Inventory, the two lists, Escalations, decisions and one Expectations
// shard; the real repository is only read, never written.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { escalationDigest, escalationStatus, parseEscalation } from "../../../tools/escalations/escalations";
import { checkReasons, DEFERRED_ITEMS_FILE, NON_GOALS_FILE, readList, STATUSES } from "../../../tools/expectations/reasons";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "expectations", "reasons.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const A = "Illuminate\\Tests\\Support\\SupportStrTest::testA";
const B = "Illuminate\\Tests\\Support\\SupportStrTest::testB";
const U1 = "Illuminate\\Tests\\Support\\SupportStrTest::testU1";
const U2 = "Illuminate\\Tests\\Support\\SupportStrTest::testU2";
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportStrTest.jsonl";

function row(name: string, phase: number): string {
  return `${JSON.stringify({ name, dir: `packages/${name}`, npm: `@xaravel/${name}`, phase, kind: "upstream", upstream: null, private: false, require: [], suggest: [] })}\n`;
}

function entry(id: string, backends: string[], oracle: Record<string, string>, line: number): string {
  const assertions = Object.keys(oracle).length === 0 ? null : {};
  return `${JSON.stringify({ id, component: "support", kind: "unit", backends, source: `framework/tests/Support/SupportStrTest.php:${line}-${line + 1}`, hash: HASH, assertions, oracle })}\n`;
}

function frontmatter(fields: Record<string, unknown>, body: string): string {
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n${body}`;
}

function escalation(testIds: string[], trigger = "php-only"): string {
  return frontmatter({ test_ids: testIds, trigger, proposed: "Skip as php-only.", evidence: "It drives a PHP extension." }, "\n# Escalation\n\nDetails.\n");
}

function decision(escalationText: string): string {
  return frontmatter({ decision: "approved", decided_by: "Maintainer", escalation_sha256: escalationDigest(escalationText) }, "\n# Ruling\n\nApproved.\n");
}

/** ESC-9.1-1 approved listing A; ESC-9.1-2 open listing A; ESC-9.1-3 approved listing only B. */
const APPROVED = "ESC-9.1-1";
const OPEN = "ESC-9.1-2";
const APPROVED_OTHER = "ESC-9.1-3";
/** ESC-9.1-4: approved, `trigger: contract`, listing A. */
const APPROVED_CONTRACT = "ESC-9.1-4";

const LISTS = {
  [DEFERRED_ITEMS_FILE]: "# Deferred.\n\nai-sdk\nmysql-driver\n",
  [NON_GOALS_FILE]: "# Non-Goals.\nNG-1\nNG-2\n",
};

function baseFiles(): Record<string, string> {
  const esc1 = escalation([A]);
  const esc3 = escalation([B]);
  const esc4 = escalation([A], "contract");
  return {
    "tools/scaffold/packages.jsonl": row("database", 4) + row("runtime", 1) + row("support", 2),
    "conformance/inventory/support.jsonl":
      entry(A, ["none"], {}, 10) + entry(B, ["none"], {}, 20) + entry(U1, ["mysql", "pgsql", "sqlite"], { pgsql: "pass", sqlite: "skip" }, 30) + entry(U2, ["sqlite"], { sqlite: "fail" }, 40),
    ...LISTS,
    [`conformance/escalations/${APPROVED}.md`]: esc1,
    [`decisions/${APPROVED}.md`]: decision(esc1),
    [`conformance/escalations/${OPEN}.md`]: escalation([A]),
    [`conformance/escalations/${APPROVED_OTHER}.md`]: esc3,
    [`decisions/${APPROVED_OTHER}.md`]: decision(esc3),
    [`conformance/escalations/${APPROVED_CONTRACT}.md`]: esc4,
    [`decisions/${APPROVED_CONTRACT}.md`]: decision(esc4),
    "decisions/DIV-3.md": "# DIV-3\n",
  };
}

interface Line {
  id?: string;
  variant?: string;
  status?: unknown;
  reason?: unknown;
  escalation?: unknown;
}

function serialise(line: Line): string {
  return JSON.stringify({ id: line.id ?? A, variant: line.variant ?? "none", status: line.status === undefined ? "skip" : line.status, reason: line.reason === undefined ? "not-ported-yet" : line.reason, adapted: null, escalation: line.escalation ?? null });
}

/** A fixture root with `lines` in one shard; `files` override or (with null) remove base files. */
function fixture(lines: Line[], files: Record<string, string | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-skip-reasons-"));
  roots.push(dir);
  const all: Record<string, string | null> = { ...baseFiles(), ...files };
  if (lines.length > 0) {
    all[SHARD] = lines.map((line) => `${serialise(line)}\n`).join("");
  }
  for (const [path, text] of Object.entries(all)) {
    if (text !== null) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  }
  return dir;
}

function violations(lines: Line[], files: Record<string, string | null> = {}): string[] {
  return checkReasons(fixture(lines, files)).violations;
}

/** Each case's violations: `[]` when valid, otherwise exactly one naming the shard line, id, variant and `rule`. */
function expectCase(line: Line, rule: string | null, files: Record<string, string | null> = {}): void {
  const found = violations([line], files);
  if (rule === null) {
    expect(found).toEqual([]);
    return;
  }
  expect(found.length).toBe(1);
  expect(found[0]!.startsWith(`${SHARD}:1: ${line.id ?? A} × ${line.variant ?? "none"}: ${rule}`)).toBe(true);
}

function cli(dir: string): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", CLI, "check", "--root", dir], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

// ---------------------------------------------------------------------------
// XT-conformance-92: blocked-by

xaravelTest("XT-conformance-92", "blocked-by:<c> fails unless <c> is in a later Phase than the test's Component per the package table (FR-3.2)", () => {
  expectCase({ reason: "blocked-by:database" }, null);
  expectCase({ reason: "blocked-by:runtime" }, "blocked-by:");
  expectCase({ reason: "blocked-by:support" }, "blocked-by:");
  expectCase({ reason: "blocked-by:nope" }, "blocked-by:");
  // Fail closed: an id outside the Inventory, or a Component with no package-table row.
  expectCase({ id: "Illuminate\\Tests\\Nope::testNope", reason: "blocked-by:database" }, "blocked-by:");
  expectCase({ reason: "blocked-by:database" }, "blocked-by:", { "tools/scaffold/packages.jsonl": row("database", 4) + row("runtime", 1) });
  expect(violations([{ reason: "blocked-by:runtime" }])[0]).toContain("Phase 1, not later than support's Phase 2");
  expect(violations([{ reason: "blocked-by:nope" }])[0]).toContain("nope is not a Component in tools/scaffold/packages.jsonl");
});

xaravelTest("XT-conformance-250", "bun run expectations:reasons exits 0 on valid lines, 1 on a violation, 2 on a usage error", () => {
  const ok = cli(fixture([{ reason: "blocked-by:database" }]));
  expect(ok).toEqual({ exitCode: 0, stdout: "Skip Reasons OK: 1 line(s) checked.\n", stderr: "" });
  const bad = cli(fixture([{ reason: "blocked-by:runtime" }]));
  expect(bad.exitCode).toBe(1);
  expect(bad.stderr).toContain(`${SHARD}:1: ${A} × none: blocked-by:`);
  const usage = Bun.spawnSync(["bun", CLI, "check", "--bogus"], { stdout: "pipe", stderr: "pipe" });
  expect(usage.exitCode).toBe(2);
  const empty = Bun.spawnSync(["bun", CLI, "check", "--root", ""], { stdout: "pipe", stderr: "pipe" });
  expect(empty.exitCode).toBe(2);
  const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["expectations:reasons"];
  expect(script).toBe("bun tools/expectations/reasons.ts check");
});

// ---------------------------------------------------------------------------
// XT-conformance-93: intentional-divergence

xaravelTest("XT-conformance-93", "intentional-divergence:DIV-<n> fails unless decisions/DIV-<n>.md exists (FR-3.2)", () => {
  expectCase({ reason: "intentional-divergence:DIV-3" }, null);
  expectCase({ reason: "intentional-divergence:DIV-3" }, "intentional-divergence:", { "decisions/DIV-3.md": null });
  expectCase({ reason: "intentional-divergence:DIV-03" }, "intentional-divergence:", { "decisions/DIV-03.md": "# DIV-03\n" });
  expectCase({ reason: "intentional-divergence:DIV-4" }, "intentional-divergence:");
});

// ---------------------------------------------------------------------------
// XT-conformance-94: php-only

xaravelTest("XT-conformance-94", "php-only fails unless its escalation is an approved php-only Escalation listing the Test ID (FR-3.2)", () => {
  expectCase({ reason: "php-only", escalation: APPROVED }, null);
  expectCase({ reason: "php-only", escalation: OPEN }, "php-only:");
  expectCase({ reason: "php-only", escalation: APPROVED_OTHER }, "php-only:");
  expectCase({ reason: "php-only", escalation: null }, "php-only:");
  expectCase({ reason: "php-only", escalation: "ESC-9.1-99" }, "escalation:");
  expectCase({ reason: "php-only", escalation: "not-an-id" }, "escalation:");
  expectCase({ reason: "php-only", escalation: APPROVED_CONTRACT }, "php-only:");
  expect(violations([{ reason: "php-only", escalation: APPROVED_CONTRACT }])[0]).toContain(`php-only: Escalation ${APPROVED_CONTRACT} has trigger contract, not php-only`);
  // A decision on changed Escalation text is stale, so the Escalation counts as open (Story 1.6).
  expectCase({ reason: "php-only", escalation: APPROVED }, "php-only:", { [`conformance/escalations/${APPROVED}.md`]: escalation([A, B]) });
});

// ---------------------------------------------------------------------------
// XT-conformance-95: upstream-skip

xaravelTest("XT-conformance-95", "upstream-skip fails unless the Inventory oracle for that Variant is skip or fail (FR-3.2)", () => {
  expectCase({ id: U1, variant: "sqlite", reason: "upstream-skip" }, null);
  expectCase({ id: U2, variant: "sqlite", reason: "upstream-skip" }, null);
  expectCase({ id: U1, variant: "pgsql", reason: "upstream-skip" }, "upstream-skip:");
  expectCase({ id: U1, variant: "mysql", reason: "upstream-skip" }, "upstream-skip:");
  expectCase({ id: A, variant: "none", reason: "upstream-skip" }, "upstream-skip:");
  expectCase({ id: "Illuminate\\Tests\\Nope::testNope", variant: "sqlite", reason: "upstream-skip" }, "upstream-skip:");
});

// ---------------------------------------------------------------------------
// XT-conformance-96: deferred

xaravelTest("XT-conformance-96", "deferred:<item> fails unless <item> is in conformance/deferred-items (FR-3.2)", () => {
  expectCase({ reason: "deferred:ai-sdk" }, null);
  expectCase({ reason: "deferred:memcached" }, "deferred:");
  expectCase({ reason: "deferred:" }, "unknown reason:");
});

// ---------------------------------------------------------------------------
// XT-conformance-97: out-of-scope

xaravelTest("XT-conformance-97", "out-of-scope:<NG-N> fails unless <NG-N> is in conformance/non-goals (FR-3.2)", () => {
  expectCase({ reason: "out-of-scope:NG-1" }, null);
  expectCase({ reason: "out-of-scope:NG-99" }, "out-of-scope:");
  expectCase({ reason: "out-of-scope:" }, "unknown reason:");
});

// ---------------------------------------------------------------------------
// XT-conformance-98: unknown reason, unknown status, bad lists, the real repository

xaravelTest("XT-conformance-98", "a skip with no reason or an unknown reason fails, one violation each (FR-3.1)", () => {
  expectCase({ reason: null }, "unknown reason:");
  expectCase({ reason: "" }, "unknown reason:");
  expectCase({ reason: "bogus" }, "unknown reason:");
  expectCase({ reason: "blocked-by:" }, "unknown reason:");
  expectCase({ reason: "intentional-divergence" }, "unknown reason:");
  expectCase({ reason: 7 }, "unknown reason:");
  expectCase({ status: "pass", reason: "not-ported-yet" }, "unknown reason:");
  expectCase({ status: "fail-known", reason: "not-ported-yet" }, "unknown reason:");
  expectCase({ status: "flaky" }, "unknown status:");
  expectCase({ status: null }, "unknown status:");
  expectCase({ status: "pass", reason: null }, null);
  expectCase({ status: "fail-known", reason: null }, null);
  // A pass may cite any known Escalation; an unknown one is a violation on every line.
  expectCase({ status: "pass", reason: null, escalation: APPROVED }, null);
  expectCase({ status: "pass", reason: null, escalation: "ESC-9.1-99" }, "escalation:");
  expectCase({ status: "pass", reason: null, escalation: 7 }, "escalation: must be a string or null");
  expect(STATUSES).toEqual(["pass", "fail-known", "skip", "quarantined"]);
  // Several broken lines give one violation each.
  expect(violations([{ reason: "bogus" }, { id: B, reason: null }, { status: "flaky" }]).length).toBe(3);
});

xaravelTest("XT-conformance-251", "an unsorted, duplicated or malformed list member is a violation naming file:line", () => {
  const cases: [string, string, string][] = [
    [DEFERRED_ITEMS_FILE, "mysql-driver\nai-sdk\n", `${DEFERRED_ITEMS_FILE}:2:`],
    [DEFERRED_ITEMS_FILE, "ai-sdk\nai-sdk\n", `${DEFERRED_ITEMS_FILE}:2:`],
    [DEFERRED_ITEMS_FILE, "ai-sdk\nAi_SDK\n", `${DEFERRED_ITEMS_FILE}:2:`],
    [NON_GOALS_FILE, "NG-1\nNG-x\n", `${NON_GOALS_FILE}:2:`],
    [NON_GOALS_FILE, "NG-1\r\n", `${NON_GOALS_FILE}:1:`],
  ];
  for (const [file, text, at] of cases) {
    const found = violations([{}], { [file]: text });
    expect(found.length).toBe(1);
    expect(found[0]!.startsWith(at)).toBe(true);
  }
  expect(violations([{}], { [NON_GOALS_FILE]: null })).toEqual([`${NON_GOALS_FILE}: does not exist`]);
  expect(violations([{}], { [NON_GOALS_FILE]: "\uFEFFNG-1\n" })).toEqual([`${NON_GOALS_FILE}: starts with a BOM`]);
  expect(violations([{}], { [NON_GOALS_FILE]: "NG-1" })).toEqual([`${NON_GOALS_FILE}: missing final LF`]);
  expect(violations([{}], { [NON_GOALS_FILE]: "# only a comment\n" })).toEqual([`${NON_GOALS_FILE}: lists no member`]);
  const invalid = fixture([{}]);
  writeFileSync(join(invalid, NON_GOALS_FILE), new Uint8Array([0x4e, 0x47, 0x2d, 0x31, 0xff, 0x0a]));
  expect(checkReasons(invalid).violations).toEqual([`${NON_GOALS_FILE}: invalid UTF-8`]);
  const dir = fixture([{}], { [NON_GOALS_FILE]: "NG-x\n" });
  const run = cli(dir);
  expect(run.exitCode).toBe(1);
  expect(run.stderr).toContain(`${NON_GOALS_FILE}:1:`);
});

xaravelTest("XT-conformance-252", "the committed lists hold exactly PRD §7.1 and §7.2's members, and the real repository passes (FR-3.2)", () => {
  const deferred = readList(root, DEFERRED_ITEMS_FILE, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(deferred.violations).toEqual([]);
  expect(deferred.members).toEqual([
    "ai-sdk",
    "beanstalkd",
    "boost-agent-skills",
    "boost-docs-search",
    "boost-record-rule",
    "browser-tests",
    "email-spoof",
    "foundation-cloud",
    "image-avif-heic-jxl",
    "laravel-14-resync",
    "mail-transports",
    "mariadb-driver",
    "mysql-driver",
    "redis-cluster",
    "sqlsrv-driver",
    "sqs",
    "windows",
  ]);
  const nonGoals = readList(root, NON_GOALS_FILE, /^NG-[1-9][0-9]*$/);
  expect(nonGoals.violations).toEqual([]);
  expect(nonGoals.members).toEqual(["NG-1", "NG-2", "NG-3", "NG-4", "NG-5", "NG-6", "NG-7"]);
  for (const file of [DEFERRED_ITEMS_FILE, NON_GOALS_FILE]) {
    const text = readFileSync(join(root, file), "utf8");
    expect(text).toContain("Protected");
    expect(text).toContain(file === DEFERRED_ITEMS_FILE ? "PRD §7.2" : "PRD §7.1");
  }
  const report = checkReasons(root);
  expect(report.violations).toEqual([]);
  expect(report.lines).toBeGreaterThan(0);
});

xaravelTest("XT-conformance-253", "a malformed shard line or an unreadable Inventory is a violation, not a crash", () => {
  const malformed = violations([], { [SHARD]: "{not json\n" });
  expect(malformed.length).toBe(1);
  expect(malformed[0]!.startsWith(`${SHARD}:1: malformed JSON`)).toBe(true);
  expect(malformed[0]!.endsWith("(run expectations:check)")).toBe(true);
  const unreadable = violations([{}], { "conformance/inventory/support.jsonl": "{not json\n" });
  expect(unreadable.length).toBe(1);
  expect(unreadable[0]!.startsWith("conformance/inventory: unreadable:")).toBe(true);
  // The list violations collected before the Inventory read are kept.
  expect(violations([{}], { "conformance/inventory/support.jsonl": "{not json\n", [NON_GOALS_FILE]: "NG-x\n" }).length).toBe(3);
});

// ---------------------------------------------------------------------------
// XT-conformance-99: quarantined

xaravelTest("XT-conformance-99", "quarantined fails unless its escalation is open and lists the Test ID (FR-3.3)", () => {
  expectCase({ status: "quarantined", reason: null, escalation: OPEN }, null);
  expectCase({ status: "quarantined", reason: null, escalation: APPROVED }, "quarantined:");
  expectCase({ status: "quarantined", reason: null, escalation: null }, "quarantined:");
  expectCase({ id: B, status: "quarantined", reason: null, escalation: OPEN }, "quarantined:");
  expectCase({ status: "quarantined", reason: "not-ported-yet", escalation: OPEN }, "unknown reason:");
});

// ---------------------------------------------------------------------------
// XT-conformance-100: precedence documentation

xaravelTest("XT-conformance-100", "conformance/README.md lists the FR-3 precedence order and names every Skip Reason; the checklist reference waits on ESC-5.2-1 (FR-3.4)", () => {
  const readme = readFileSync(join(root, "conformance", "README.md"), "utf8");
  for (const reason of ["not-ported-yet", "blocked-by:<c>", "intentional-divergence:DIV-<n>", "php-only", "upstream-skip", "deferred:<item>", "out-of-scope:<NG-N>"]) {
    expect(readme).toContain(`\`${reason}\``);
  }
  for (const status of STATUSES) {
    expect(readme).toContain(`\`${status}\``);
  }
  const section = readme.slice(readme.indexOf("## Precedence"));
  expect(section.startsWith("## Precedence")).toBe(true);
  const steps = section.split("\n").filter((line) => /^[0-9]+\. /.test(line));
  expect(steps.length).toBe(3);
  expect(steps[0]!.startsWith("1. `upstream-skip`")).toBe(true);
  const second = steps[1]!;
  expect(second.startsWith("2. ")).toBe(true);
  expect(second.indexOf("`intentional-divergence`")).toBeGreaterThan(0);
  expect(second.indexOf("`intentional-divergence`")).toBeLessThan(second.indexOf("`blocked-by`"));
  expect(second.indexOf("`blocked-by`")).toBeLessThan(second.indexOf("`not-ported-yet`"));
  const third = steps[2]!;
  expect(third.startsWith("3. ")).toBe(true);
  for (const reason of ["`php-only`", "`deferred`", "`out-of-scope`"]) {
    expect(third).toContain(reason);
  }
  expect(section).toContain("When in doubt, pick the reason that counts against conformance.");
  expect(section).toContain("ESC-5.2-1");
  const file = "conformance/escalations/ESC-5.2-1.md";
  const parsed = parseEscalation(file, readFileSync(join(root, file), "utf8"));
  expect(parsed.violations).toEqual([]);
  expect(parsed.escalation!.trigger).toBe("contract");
  expect(parsed.escalation!.testIds).toEqual(["XT-conformance-100"]);
  expect(["open", "approved"]).toContain(escalationStatus("ESC-5.2-1", root));
});
