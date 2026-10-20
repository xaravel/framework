// Xaravel Tests for Story 7.1 (the conformance aggregator:
// `tools/conformance-report/{report,history}.ts`, `bun run
// conformance:report` / `conformance:history`, and
// `.github/workflows/dashboard.yml`; FR-5, SM-1).
//
// Fixture roots are hermetic temp directories holding a package table, an
// Inventory, the Baseline Pin and Expectations shards; the history tests add a
// temp git work tree and a bare remote. The real repository is only read.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { computeReport, REASON_KINDS, serialiseReport, type ReasonKind, type Report } from "../../../tools/conformance-report/report";
import { historyRecord, REJECTED, serialiseRecord } from "../../../tools/conformance-report/history";
import { readExpectations } from "../../../tools/pin-bump/pin-bump";
import { checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const REPORT = join(root, "tools", "conformance-report", "report.ts");
const HISTORY = join(root, "tools", "conformance-report", "history.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `xaravel-${prefix}-`)));
  dirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const PIN_TEXT = [
  "# The Baseline Pin (fixture).",
  `laravel/framework v13.37.0 ${"a".repeat(40)} ${"b".repeat(40)}`,
  `laravel/ai v1.2.3 ${"c".repeat(40)} ${"d".repeat(40)}`,
  `laravel/mcp v1.0.2 ${"e".repeat(40)} ${"f".repeat(40)}`,
  `laravel/boost v2.10.3 ${"1".repeat(40)} ${"2".repeat(40)}`,
  "",
].join("\n");

function row(name: string, phase: number): string {
  return `${JSON.stringify({ name, dir: `packages/${name}`, npm: `@xaravel/${name}`, phase, kind: "upstream", upstream: null, private: false, require: [], suggest: [] })}\n`;
}

/** The Inventory lines of `component`, one per id (ids must be sorted). */
function inventory(component: string, ids: readonly string[]): string {
  return ids.map((id, index) => `${JSON.stringify({ id, component, kind: "unit", backends: ["none"], source: `framework/tests/X/XTest.php:${index + 1}-${index + 1}`, hash: HASH, assertions: null, oracle: {} })}\n`).join("");
}

type Status = "pass" | "fail-known" | "skip" | "quarantined";
type ExpectationLine = [id: string, variant: string, status: Status, reason?: string | null, adapted?: string | null];

function shard(lines: readonly ExpectationLine[]): string {
  return lines.map(([id, variant, status, reason = null, adapted = null]) => `${JSON.stringify({ id, variant, status, reason, adapted, escalation: status === "quarantined" ? "ESC-9.1-1" : null })}\n`).join("");
}

const S = (method: string): string => `Illuminate\\Tests\\Support\\SupportTest::${method}`;
const D = (method: string): string => `Illuminate\\Tests\\Database\\DatabaseTest::${method}`;
const L = (method: string): string => `Illuminate\\Tests\\Later\\LaterTest::${method}`;

/** A fixture root holding `files` over the base table, Inventory and Pin. */
function fixture(files: Readonly<Record<string, string>>, base: Readonly<Record<string, string>> = BASE): string {
  const dir = tempDir("conformance-report");
  for (const [path, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const BASE: Readonly<Record<string, string>> = {
  "tools/scaffold/packages.jsonl": row("database", 4) + row("later", 9) + row("runtime", 1) + row("support", 2),
  "conformance/baseline-pin": PIN_TEXT,
  "conformance/inventory/support.jsonl": inventory("support", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((m) => S(`test${m}`))),
  "conformance/inventory/database.jsonl": inventory("database", [D("testA"), D("testB"), D("testC")]),
  "conformance/inventory/later.jsonl": inventory("later", [L("testA")]),
};

/** Every status, every reason kind and an adapted line; database has alpha and non-alpha variants; later is phase 9. */
const MIXED: Readonly<Record<string, string>> = {
  "conformance/expectations/support/framework/tests/Support/SupportTest.jsonl": shard([
    [S("testA"), "none", "pass", null, "DIV-1.1"],
    [S("testB"), "none", "fail-known"],
    [S("testC"), "none", "quarantined"],
    [S("testD"), "none", "skip", "not-ported-yet"],
    [S("testE"), "none", "skip", "blocked-by:database"],
    [S("testF"), "none", "skip", "intentional-divergence:DIV-3"],
    [S("testG"), "none", "skip", "php-only"],
    [S("testH"), "none", "skip", "upstream-skip"],
    [S("testI"), "none", "skip", "deferred:mysql-driver"],
    [S("testJ"), "none", "skip", "out-of-scope:NG-1"],
    [S("testK"), "none", "skip", "deferred:ai-sdk"],
  ]),
  "conformance/expectations/database/framework/tests/Database/DatabaseTest.jsonl": shard([
    [D("testA"), "mysql", "pass"],
    [D("testA"), "pgsql", "fail-known"],
    [D("testA"), "sqlite", "pass"],
    [D("testB"), "mysql", "skip", "not-ported-yet"],
    [D("testB"), "pgsql", "pass"],
    [D("testB"), "sqlite", "pass"],
    [D("testC"), "mysql", "pass"],
  ]),
  "conformance/expectations/later/framework/tests/Later/LaterTest.jsonl": shard([[L("testA"), "none", "pass"]]),
};

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(tool: string, args: readonly string[], cwd = root): Run {
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", tool, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function git(cwd: string, args: readonly string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}

const zeroStatuses = { pass: 0, "fail-known": 0, skip: 0, quarantined: 0 };
const zeroReasons = Object.fromEntries(REASON_KINDS.map((kind) => [kind, 0])) as Record<ReasonKind, number>;

// XT-conformance-143

xaravelTest("XT-conformance-143", "the report counts every Test ID × Backend Variant pair in the denominator, not-ported-yet included, per Component and overall, with per-status, per-Skip-Reason and adapted counts and fail-known apart from skips; the CLI writes report.json (FR-5.1)", () => {
  expect([...REASON_KINDS]).toEqual(["not-ported-yet", "blocked-by", "intentional-divergence", "php-only", "upstream-skip", "deferred", "out-of-scope"]);
  const dir = fixture(MIXED);
  const report = computeReport(dir);
  expect(Object.keys(report)).toEqual(["schema", "commit", "pin", "overall", "components", "alpha"]);
  expect(report.schema).toBe(1);
  expect(report.commit).toBeNull();
  expect(report.pin).toEqual({ tag: "v13.37.0", commit: "a".repeat(40) });

  // Overall: 19 pairs, 7 passing; fail-known is its own count, never a skip.
  expect(report.overall).toEqual({
    pairs: 19,
    passing: 7,
    rate: 7 / 19,
    statuses: { pass: 7, "fail-known": 2, skip: 9, quarantined: 1 },
    failKnown: 2,
    reasons: { "not-ported-yet": 2, "blocked-by": 1, "intentional-divergence": 1, "php-only": 1, "upstream-skip": 1, deferred: 2, "out-of-scope": 1 },
    reasonsDetail: { "blocked-by:database": 1, "deferred:ai-sdk": 1, "deferred:mysql-driver": 1, "intentional-divergence:DIV-3": 1, "not-ported-yet": 2, "out-of-scope:NG-1": 1, "php-only": 1, "upstream-skip": 1 },
    adapted: 1,
  });
  expect(Object.keys(report.overall)).toEqual(["pairs", "passing", "rate", "statuses", "failKnown", "reasons", "reasonsDetail", "adapted"]);
  const skips = Object.values(report.overall.reasons).reduce((sum, n) => sum + n, 0);
  expect(skips).toBe(report.overall.statuses.skip);
  expect(report.overall.statuses.pass + report.overall.statuses["fail-known"] + report.overall.statuses.skip + report.overall.statuses.quarantined).toBe(report.overall.pairs);

  // Per Component, sorted; a Component's every status and reason kind is present, zeros included.
  expect(Object.keys(report.components)).toEqual(["database", "later", "support"]);
  expect(report.components["database"]).toEqual({
    pairs: 7,
    passing: 5,
    rate: 5 / 7,
    statuses: { ...zeroStatuses, pass: 5, "fail-known": 1, skip: 1 },
    failKnown: 1,
    reasons: { ...zeroReasons, "not-ported-yet": 1 },
    reasonsDetail: { "not-ported-yet": 1 },
    adapted: 0,
  });
  expect(report.components["later"]).toEqual({ pairs: 1, passing: 1, rate: 1, statuses: { ...zeroStatuses, pass: 1 }, failKnown: 0, reasons: zeroReasons, reasonsDetail: {}, adapted: 0 });
  expect(report.components["support"]!.pairs).toBe(11);
  expect(report.components["support"]!.passing).toBe(1);
  expect(report.components["support"]!.statuses).toEqual({ pass: 1, "fail-known": 1, skip: 8, quarantined: 1 });
  expect(report.components["support"]!.adapted).toBe(1);

  // No pair: the rate is null, never 0 or NaN.
  const empty = computeReport(fixture({}));
  expect(empty.overall).toEqual({ pairs: 0, passing: 0, rate: null, statuses: zeroStatuses, failKnown: 0, reasons: zeroReasons, reasonsDetail: {}, adapted: 0 });
  expect(empty.components).toEqual({});
  expect(empty.alpha.rate).toBeNull();

  // The CLI writes report.json (default under .cache/conformance/, or --out) and prints its summary.
  const run = cli(REPORT, ["--root", dir]);
  const defaultOut = join(dir, ".cache", "conformance", "report.json");
  expect(run).toEqual({ exitCode: 0, stdout: `conformance:report: wrote ${defaultOut} (7/19 pairs passing; alpha 2/8)\n`, stderr: "" });
  expect(readFileSync(defaultOut, "utf8")).toBe(serialiseReport(report));
  const out = join(tempDir("conformance-out"), "nested", "r.json");
  expect(cli(REPORT, ["--root", dir, "--out", out]).exitCode).toBe(0);
  expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(report);

  // In a git work tree, commit is HEAD's full SHA.
  const repo = fixture(MIXED);
  git(repo, ["init", "-q", "."]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "fixture"]);
  expect(computeReport(repo).commit).toBe(git(repo, ["rev-parse", "HEAD"]).trim());

  // An Expectations line whose id is not in the Inventory is a data error; a bad flag is a usage error.
  const unknownShard = "conformance/expectations/support/framework/tests/Support/Unknown.jsonl";
  const unknown = fixture({ ...MIXED, [unknownShard]: shard([[S("testZ"), "none", "skip", "not-ported-yet"]]) });
  expect(cli(REPORT, ["--root", unknown])).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:report: ${unknownShard}: unknown Test ID ${S("testZ")}\n` });
  const badReason = fixture({ [unknownShard]: shard([[S("testA"), "none", "skip", "because"]]) });
  expect(cli(REPORT, ["--root", badReason]).stderr).toBe(`conformance:report: ${unknownShard}: ${S("testA")} × none has unknown Skip Reason "because"\n`);
  // A duplicate pair, an unknown status and a missing variant are data errors too.
  const dup = fixture({ [unknownShard]: shard([[S("testA"), "none", "pass"], [S("testA"), "none", "pass"]]) });
  expect(cli(REPORT, ["--root", dup])).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:report: ${unknownShard}: duplicate pair ${S("testA")} × none\n` });
  const badStatus = fixture({ [unknownShard]: `${JSON.stringify({ id: S("testA"), variant: "none", status: "flaky", reason: null, adapted: null, escalation: null })}\n` });
  expect(cli(REPORT, ["--root", badStatus])).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:report: ${unknownShard}: ${S("testA")} × none has unknown status "flaky"\n` });
  const noVariant = fixture({ [unknownShard]: `${JSON.stringify({ id: S("testA"), status: "pass", reason: null, adapted: null, escalation: null })}\n` });
  expect(cli(REPORT, ["--root", noVariant])).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:report: ${unknownShard}: ${S("testA")} has no variant\n` });
  // A Baseline Pin without its laravel/framework line is a data error.
  const noFramework = fixture({ "conformance/baseline-pin": PIN_TEXT.split("\n").filter((line) => !line.startsWith("laravel/framework ")).join("\n") });
  expect(cli(REPORT, ["--root", noFramework])).toMatchObject({ exitCode: 1, stdout: "", stderr: expect.stringMatching(/^conformance:report: conformance\/baseline-pin.*laravel\/framework.*\n$/) as unknown as string });
  const nope = cli(REPORT, ["--nope"]);
  expect(nope.exitCode).toBe(2);
  expect(nope.stdout).toBe("");
  expect(nope.stderr).toBe("Unknown argument: --nope\nUsage: bun --no-env-file tools/conformance-report/report.ts [--root <dir>] [--out <file>]\n");
  expect(cli(REPORT, ["--out"]).exitCode).toBe(2);

  // The real repository: every Expectations line is a pair.
  const lineCount = readExpectations(root).reduce((sum, s) => sum + s.lines.length, 0);
  const realOut = join(tempDir("conformance-real"), "report.json");
  const real = cli(REPORT, ["--out", realOut]);
  expect(real.stderr).toBe("");
  expect(real.exitCode).toBe(0);
  const realReport = JSON.parse(readFileSync(realOut, "utf8")) as Report;
  expect(realReport.overall.pairs).toBe(lineCount);
  expect(realReport.overall.statuses.pass + realReport.overall.statuses["fail-known"] + realReport.overall.statuses.skip + realReport.overall.statuses.quarantined).toBe(lineCount);
  expect(real.stdout).toBe(`conformance:report: wrote ${realOut} (${realReport.overall.passing}/${lineCount} pairs passing; alpha ${realReport.alpha.passing}/${realReport.alpha.applicable})\n`);

  // The wiring: the script, the typecheck include, and report.json is gitignored.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["conformance:report"]).toBe("bun --no-env-file tools/conformance-report/report.ts");
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[] };
  expect(tsconfig.include).toContain("tools/conformance-report/*.ts");
  expect(Bun.spawnSync(["git", "check-ignore", "-q", ".cache/conformance/report.json"], { cwd: root }).exitCode).toBe(0);
}, 60_000);

// XT-conformance-144

xaravelTest("XT-conformance-144", "the alpha-gate figure is passing over applicable Test IDs of the Phase 1–8 Components on every alpha Variant; quarantined, fail-known and intentional-divergence count as not passing, php-only, upstream-skip, deferred and out-of-scope are not applicable (FR-5.2)", () => {
  const { alpha } = computeReport(fixture(MIXED));
  expect(Object.keys(alpha)).toEqual(["applicable", "passing", "rate", "target", "variants", "components", "perVariant", "remaining", "noAlphaLine", "met"]);
  // support: A pass; B fail-known, C quarantined, D not-ported-yet, E blocked-by, F intentional-divergence are applicable and not passing;
  // G..K are not applicable. database: A passes on sqlite but is fail-known on pgsql (not passing), B passes on both;
  // C runs only on mysql (not alpha). later is phase 9.
  expect(alpha).toEqual({
    applicable: 8,
    passing: 2,
    rate: 0.25,
    target: 0.9,
    variants: ["none", "pgsql", "queue-database@sqlite", "queue-redis@redis", "queue-sync@none", "redis", "sqlite"],
    components: ["database", "runtime", "support"],
    perVariant: {
      none: { applicable: 6, passing: 1 },
      pgsql: { applicable: 2, passing: 1 },
      "queue-database@sqlite": { applicable: 0, passing: 0 },
      "queue-redis@redis": { applicable: 0, passing: 0 },
      "queue-sync@none": { applicable: 0, passing: 0 },
      redis: { applicable: 0, passing: 0 },
      sqlite: { applicable: 2, passing: 2 },
    },
    // database testB's mysql not-ported-yet is not on an alpha variant.
    remaining: { "not-ported-yet": 1, "blocked-by": 1 },
    // database testC has lines only on mysql: outside the denominator, counted here.
    noAlphaLine: 1,
    met: false,
  });

  // Each exclusion on its own: a phase-9 Component, a non-alpha variant and a php-only line add nothing.
  const only = (lines: readonly ExpectationLine[]): Report["alpha"] => computeReport(fixture({ "conformance/expectations/x/X.jsonl": shard(lines) })).alpha;
  expect(only([[L("testA"), "none", "fail-known"]]).applicable).toBe(0);
  expect(only([[D("testA"), "mysql", "fail-known"]]).applicable).toBe(0);
  expect(only([[S("testA"), "none", "skip", "php-only"]]).applicable).toBe(0);
  for (const reason of ["upstream-skip", "deferred:mysql-driver", "out-of-scope:NG-1"]) {
    expect([reason, only([[S("testA"), "none", "skip", reason]]).applicable]).toEqual([reason, 0]);
  }
  // Every-variant rule: pass on sqlite, fail-known on pgsql is applicable and not passing.
  expect(only([[D("testA"), "pgsql", "fail-known"], [D("testA"), "sqlite", "pass"]])).toMatchObject({ applicable: 1, passing: 0, perVariant: { pgsql: { applicable: 1, passing: 0 }, sqlite: { applicable: 1, passing: 1 } } });
  // A Test ID not applicable on one variant is judged on the variants where it is applicable.
  expect(only([[D("testA"), "pgsql", "skip", "upstream-skip"], [D("testA"), "sqlite", "pass"]])).toMatchObject({ applicable: 1, passing: 1, rate: 1, met: true });
  // Divergences cost conformance; so do quarantined and fail-known.
  for (const line of [[S("testA"), "none", "skip", "intentional-divergence:DIV-3"], [S("testA"), "none", "quarantined"], [S("testA"), "none", "fail-known"]] as ExpectationLine[]) {
    expect([line[2], line[3] ?? null, only([line])]).toMatchObject([line[2], line[3] ?? null, { applicable: 1, passing: 0, rate: 0, met: false }]);
  }

  // met: rate >= 0.9 and nothing not-ported-yet or blocked-by left in scope.
  const ten = (last: ExpectationLine): ExpectationLine[] => [...["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((m): ExpectationLine => [S(`test${m}`), "none", "pass"]), last];
  expect(only(ten([S("testJ"), "none", "fail-known"]))).toMatchObject({ applicable: 10, passing: 9, rate: 0.9, remaining: { "not-ported-yet": 0, "blocked-by": 0 }, met: true });
  expect(only(ten([S("testJ"), "none", "skip", "not-ported-yet"]))).toMatchObject({ rate: 0.9, remaining: { "not-ported-yet": 1, "blocked-by": 0 }, met: false });
  expect(only(ten([S("testJ"), "none", "skip", "blocked-by:database"]))).toMatchObject({ rate: 0.9, remaining: { "not-ported-yet": 0, "blocked-by": 1 }, met: false });
  expect(only([...ten([S("testJ"), "none", "pass"]).slice(0, 8), [S("testI"), "none", "quarantined"], [S("testJ"), "none", "quarantined"]])).toMatchObject({ rate: 0.8, met: false });
  // Not-ported-yet outside the scope (mysql, phase 9) leaves met alone.
  expect(only([[D("testA"), "mysql", "skip", "not-ported-yet"], [D("testA"), "sqlite", "pass"], [L("testA"), "none", "skip", "not-ported-yet"]])).toMatchObject({ applicable: 1, passing: 1, remaining: { "not-ported-yet": 0, "blocked-by": 0 }, met: true });
  // No applicable Test ID: rate null, not met.
  expect(only([[S("testA"), "none", "skip", "php-only"]])).toMatchObject({ rate: null, met: false });

  // noAlphaLine: phase 1–8 Test IDs with lines but none on an alpha variant; it changes no other field.
  expect(only([[D("testA"), "mysql", "fail-known"]])).toMatchObject({ applicable: 0, noAlphaLine: 1 });
  expect(only([[D("testA"), "mysql", "pass"], [D("testA"), "mariadb", "pass"]])).toMatchObject({ applicable: 0, noAlphaLine: 1 });
  expect(only([[S("testA"), "none", "skip", "php-only"]])).toMatchObject({ applicable: 0, noAlphaLine: 0 });
  expect(only([[L("testA"), "mysql", "fail-known"]])).toMatchObject({ applicable: 0, noAlphaLine: 0 });
  expect(only([[D("testA"), "mysql", "fail-known"], [D("testA"), "sqlite", "pass"]])).toMatchObject({ applicable: 1, passing: 1, noAlphaLine: 0 });
  expect(only([[D("testA"), "mysql", "pass"], [D("testB"), "mysql", "skip", "not-ported-yet"], [D("testB"), "pgsql", "pass"]])).toMatchObject({ applicable: 1, passing: 1, remaining: { "not-ported-yet": 0, "blocked-by": 0 }, noAlphaLine: 1 });

  // The real repository: today nothing passes, so the gate is not met.
  const real = computeReport(root).alpha;
  expect(real.variants).toEqual(["none", "pgsql", "queue-database@sqlite", "queue-redis@redis", "queue-sync@none", "redis", "sqlite"]);
  expect(real.applicable).toBeGreaterThan(0);
  expect(real.met).toBe(false);
  expect(Number.isInteger(real.noAlphaLine)).toBe(true);
  expect(real.noAlphaLine).toBeGreaterThan(0);
}, 60_000);

// XT-conformance-145

interface Workflow {
  on: Record<string, unknown>;
  permissions: unknown;
  concurrency: unknown;
  jobs: Record<string, { permissions?: unknown; steps: { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> }[] }>;
}

xaravelTest("XT-conformance-145", "each push to main appends one history record keyed by commit and Baseline Pin to the dashboard-data branch, created as an orphan when missing, idempotent per key and new at a Pin change, without touching the caller's HEAD, index or working tree (FR-5.4, FR-5.5)", () => {
  // A caller work tree with one commit, and a bare remote without dashboard-data.
  const remote = tempDir("conformance-remote");
  git(remote, ["init", "-q", "--bare", "."]);
  const caller = fixture(MIXED);
  git(caller, ["init", "-q", "-b", "work", "."]);
  git(caller, ["add", "-A"]);
  git(caller, ["commit", "-q", "-m", "fixture"]);
  git(caller, ["remote", "add", "origin", remote]);
  // An untracked and a staged change the history tool must leave alone.
  writeFileSync(join(caller, "untracked.txt"), "x\n");
  writeFileSync(join(caller, "staged.txt"), "y\n");
  git(caller, ["add", "staged.txt"]);
  const head = git(caller, ["rev-parse", "HEAD"]).trim();
  const status = git(caller, ["status", "--porcelain=v1", "--branch"]);
  const symbolic = git(caller, ["symbolic-ref", "HEAD"]);

  const reports = tempDir("conformance-reports");
  const reportPath = join(reports, "report.json");
  expect(cli(REPORT, ["--root", caller, "--out", reportPath]).exitCode).toBe(0);
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as Report;
  expect(report.commit).toBe(head);
  const record = historyRecord(report);
  expect(serialiseRecord(record)).toBe(
    `{"commit":"${head}","pin":{"tag":"v13.37.0","commit":"${"a".repeat(40)}"},"overall":{"pairs":19,"passing":7},"alpha":{"applicable":8,"passing":2},"components":{"database":{"pairs":7,"passing":5},"later":{"pairs":1,"passing":1},"support":{"pairs":11,"passing":1}}}\n`,
  );
  const history = (): string => git(remote, ["show", "dashboard-data:history.jsonl"]);
  const tip = (): string => git(remote, ["rev-parse", "refs/heads/dashboard-data"]).trim();

  // New branch: an orphan commit holding only history.jsonl with one line.
  const created = cli(HISTORY, ["--root", caller, "--report", reportPath]);
  expect(created.stderr).toBe("");
  expect(created.exitCode).toBe(0);
  expect(created.stdout).toMatch(new RegExp(`^conformance:history: created origin dashboard-data with ${head} \\(v13\\.37\\.0 a{40}\\) at [0-9a-f]{40}\\n$`));
  expect(history()).toBe(serialiseRecord(record));
  expect(git(remote, ["ls-tree", "--name-only", "dashboard-data"])).toBe("history.jsonl\n");
  expect(git(remote, ["rev-list", "--count", "dashboard-data"]).trim()).toBe("1");
  const first = tip();

  // Repeat: the same key is a no-op.
  const repeat = cli(HISTORY, ["--root", caller, "--report", reportPath]);
  expect(repeat).toEqual({ exitCode: 0, stdout: `conformance:history: ${head} (v13.37.0 ${"a".repeat(40)}) already recorded on origin dashboard-data\n`, stderr: "" });
  expect(tip()).toBe(first);
  expect(history()).toBe(serialiseRecord(record));
  // --history-out writes the branch's full history.jsonl, also when the record is already there.
  const historyOut = join(reports, "out", "history.jsonl");
  expect(cli(HISTORY, ["--root", caller, "--report", reportPath, "--history-out", historyOut]).exitCode).toBe(0);
  expect(readFileSync(historyOut, "utf8")).toBe(serialiseRecord(record));
  expect(tip()).toBe(first);

  // Pin change: the same commit under a new Pin appends a second line on top of the first commit.
  const bumped: Report = { ...report, pin: { tag: "v13.38.0", commit: "9".repeat(40) } };
  const bumpedPath = join(reports, "bumped.json");
  writeFileSync(bumpedPath, serialiseReport(bumped));
  const appendedOut = join(reports, "appended-history.jsonl");
  const appended = cli(HISTORY, ["--root", caller, "--report", bumpedPath, "--remote", remote, "--branch", "dashboard-data", "--history-out", appendedOut]);
  expect(appended.stderr).toBe("");
  expect(appended.exitCode).toBe(0);
  expect(appended.stdout).toMatch(/^conformance:history: appended to .+ dashboard-data with [0-9a-f]{40} \(v13\.38\.0 9{40}\) at [0-9a-f]{40}\n$/);
  expect(history()).toBe(serialiseRecord(record) + serialiseRecord(historyRecord(bumped)));
  // After an append, --history-out holds the new full content, the new line included.
  expect(readFileSync(appendedOut, "utf8")).toBe(history());
  expect(readFileSync(appendedOut, "utf8")).toBe(serialiseRecord(record) + serialiseRecord(historyRecord(bumped)));
  expect(cli(HISTORY, ["--history-out"]).exitCode).toBe(2);
  expect(git(remote, ["rev-parse", "dashboard-data^"]).trim()).toBe(first);
  expect(cli(HISTORY, ["--root", caller, "--report", bumpedPath]).stdout).toContain("already recorded");

  // The caller's HEAD, branch, index and working tree are unchanged; nothing was pushed to its branch.
  expect(git(caller, ["rev-parse", "HEAD"]).trim()).toBe(head);
  expect(git(caller, ["symbolic-ref", "HEAD"])).toBe(symbolic);
  expect(git(caller, ["status", "--porcelain=v1", "--branch"])).toBe(status);
  expect(git(remote, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/dashboard-data\n");

  // A competing push from a second clone: a stale push is rejected the way REJECTED recognises, and the CLI
  // then appends on top of the competing commit, keeping both records.
  const other = join(tempDir("conformance-other"), "clone");
  git(remote, ["clone", "-q", "--branch", "dashboard-data", remote, other]);
  const competing = serialiseRecord(historyRecord({ ...report, pin: { tag: "v13.39.0", commit: "8".repeat(40) } }));
  writeFileSync(join(other, "history.jsonl"), history() + competing);
  git(other, ["commit", "-q", "-am", "competing"]);
  git(other, ["push", "-q", "origin", "dashboard-data"]);
  const competingTip = tip();
  const stale = Bun.spawnSync(["git", "push", remote, `${first}:refs/heads/dashboard-data`], { cwd: caller, stdout: "pipe", stderr: "pipe" });
  expect(stale.exitCode).not.toBe(0);
  expect([stale.stderr.toString(), REJECTED.test(stale.stderr.toString())]).toEqual([stale.stderr.toString(), true]);
  expect(tip()).toBe(competingTip);
  const later: Report = { ...report, pin: { tag: "v13.40.0", commit: "7".repeat(40) } };
  const laterPath = join(reports, "later.json");
  writeFileSync(laterPath, serialiseReport(later));
  expect(cli(HISTORY, ["--root", caller, "--report", laterPath]).exitCode).toBe(0);
  expect(history()).toBe(serialiseRecord(record) + serialiseRecord(historyRecord(bumped)) + competing + serialiseRecord(historyRecord(later)));
  expect(Bun.spawnSync(["git", "merge-base", "--is-ancestor", competingTip, "dashboard-data"], { cwd: remote }).exitCode).toBe(0);
  expect(git(caller, ["status", "--porcelain=v1", "--branch"])).toBe(status);

  // Errors: a report without a commit, a missing report, a bad flag.
  const noCommit = join(reports, "no-commit.json");
  writeFileSync(noCommit, serialiseReport({ ...report, commit: null }));
  expect(cli(HISTORY, ["--root", caller, "--report", noCommit])).toEqual({ exitCode: 1, stdout: "", stderr: "conformance:history: report.json has no commit (it was computed outside git)\n" });
  expect(cli(HISTORY, ["--root", caller, "--report", join(reports, "missing.json")]).exitCode).toBe(1);
  const nope = cli(HISTORY, ["--nope"]);
  expect([nope.exitCode, nope.stderr.split("\n")[0]]).toEqual([2, "Unknown argument: --nope"]);

  // The workflow: push to main, read-only top level, write only in job dashboard, which runs both scripts.
  const text = readFileSync(join(root, ".github", "workflows", "dashboard.yml"), "utf8");
  const flow = Bun.YAML.parse(text) as Workflow;
  expect(flow.on).toEqual({ push: { branches: ["main"] } });
  expect(flow.permissions).toEqual({ contents: "read" });
  expect(flow.concurrency).toEqual({ group: "dashboard", "cancel-in-progress": false });
  expect(Object.keys(flow.jobs)).toEqual(["dashboard"]);
  const job = flow.jobs["dashboard"]!;
  expect(job.permissions).toEqual({ contents: "write" });
  const ci = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as Workflow;
  // Every action is SHA-pinned, to a pin ci.yml also uses.
  const ciUses = new Set(Object.values(ci.jobs).flatMap((ciJob) => ciJob.steps.map((step) => step.uses)).filter((uses): uses is string => uses !== undefined));
  const uses = job.steps.map((step) => step.uses).filter((value): value is string => value !== undefined);
  expect(uses.length).toBeGreaterThan(0);
  for (const value of uses) {
    expect([value, /@[0-9a-f]{40}$/.test(value), ciUses.has(value)]).toEqual([value, true, true]);
  }
  // The checkout persists no credentials (and fetches full history for the Epic view, Story 7.2); the history step
  // runs conformance:history right after the report, and only it and the publish step get the token.
  expect(job.steps[0]!.uses).toStartWith("actions/checkout@");
  expect(job.steps[0]!.with).toEqual({ "fetch-depth": 0, "persist-credentials": false });
  const runs = job.steps.map((step) => step.run).filter((run): run is string => run !== undefined);
  expect(runs.slice(0, 2)).toEqual(["bun install --frozen-lockfile --ignore-scripts", "bun run conformance:report"]);
  expect(runs.length).toBe(5);
  const historyStep = job.steps.find((step) => step.run === runs[2])!;
  expect(historyStep.run!.trimEnd().split("\n").at(-1)).toBe("bun run conformance:history --history-out .cache/conformance/history.jsonl");
  expect(historyStep.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
  const tokenSteps = job.steps.filter((step) => JSON.stringify(step).includes("github.token"));
  expect(tokenSteps.length).toBe(2);
  expect(tokenSteps[0]).toBe(historyStep);
  expect(tokenSteps[1]!.run!.trimEnd().split("\n").at(-1)).toStartWith("bun run conformance:publish");
  expect(text).toContain("commits that directory to the `gh-pages`");
  expect(checkWorkflows(root).violations).toEqual([]);
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["conformance:history"]).toBe("bun --no-env-file tools/conformance-report/history.ts");
}, 60_000);
