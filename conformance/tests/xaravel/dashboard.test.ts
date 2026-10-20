// Xaravel Tests for Story 7.2 (the public dashboard and the Epic review view:
// `tools/conformance-report/{site,publish}.ts`, `bun run conformance:site` /
// `conformance:publish`, and `.github/workflows/dashboard.yml`; FR-5, UJ-5).
//
// Fixture roots are hermetic temp directories holding a package table, an
// Inventory, the Baseline Pin, Expectations shards, Escalations, decisions and
// Story manifests; the publish and Epic tests add a temp git work tree and a
// bare remote. The real repository is only read.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { computeReport, serialiseReport, type Report } from "../../../tools/conformance-report/report";
import { serialiseRecord, type HistoryRecord } from "../../../tools/conformance-report/history";
import { buildSite, epicReview, historySeries, readHistory, renderHistoryChart, SiteError } from "../../../tools/conformance-report/site";
import { publishSite } from "../../../tools/conformance-report/publish";
import { escalationDigest } from "../../../tools/escalations/escalations";
import { checkWorkflows } from "../../../tools/workflow-permissions/workflow-permissions";
import { checkAuthority } from "../../../tools/release/release";
import { componentsOf } from "../../../tools/api-surface/api-surface";
import { readManifests } from "../../../tools/ownership/ownership";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const REPORT = join(root, "tools", "conformance-report", "report.ts");
const SITE = join(root, "tools", "conformance-report", "site.ts");
const PUBLISH = join(root, "tools", "conformance-report", "publish.ts");
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

function inventory(component: string, ids: readonly string[]): string {
  return ids.map((id, index) => `${JSON.stringify({ id, component, kind: "unit", backends: ["none"], source: `framework/tests/X/XTest.php:${index + 1}-${index + 1}`, hash: HASH, assertions: null, oracle: {} })}\n`).join("");
}

type Status = "pass" | "fail-known" | "skip" | "quarantined";
type ExpectationLine = [id: string, variant: string, status: Status, reason?: string | null, escalation?: string | null];

function shard(lines: readonly ExpectationLine[]): string {
  return lines.map(([id, variant, status, reason = null, escalation = null]) => `${JSON.stringify({ id, variant, status, reason, adapted: null, escalation })}\n`).join("");
}

const S = (method: string): string => `Illuminate\\Tests\\Support\\SupportTest::${method}`;
const WEIRD = "Illuminate\\Tests\\Support\\SupportTest::test<b>";

function escalation(testIds: readonly string[], trigger = "flaky"): string {
  return ["---", "test_ids:", ...testIds.map((id) => `  - ${JSON.stringify(id)}`), `trigger: ${trigger}`, "proposed: >-", "  Quarantine it.", "evidence: >-", "  It flakes.", "---", "", "Body.", ""].join("\n");
}

function decision(escalationText: string): string {
  return ["---", "decision: approved", `escalation_sha256: "${escalationDigest(escalationText)}"`, "---", "", "Approved.", ""].join("\n");
}

function manifest(storyId: string, component: string, status = "done"): string {
  return ["---", `story_id: "${storyId}"`, `epic: ${storyId.split(".")[0]}`, `component: ${component}`, `status: ${status}`, "test_ids: []", "xaravel_test_ids:", `  - XT-${component}-1`, "---", "", `# Story ${storyId}`, ""].join("\n");
}

const OPEN_ESC = escalation([S("testC"), WEIRD]);
const DECIDED_ESC = escalation([S("testB")], "open-question");

const FILES: Readonly<Record<string, string>> = {
  "tools/scaffold/packages.jsonl": row("support", 2),
  "conformance/baseline-pin": PIN_TEXT,
  "conformance/inventory/support.jsonl": inventory("support", [S("testA"), S("testB"), S("testC"), S("testD"), S("testE"), S("testF")]),
  "conformance/expectations/support/framework/tests/Support/SupportTest.jsonl": shard([
    [S("testA"), "none", "pass"],
    [S("testB"), "none", "fail-known"],
    [S("testC"), "none", "quarantined", null, "ESC-9.1-1"],
    [S("testD"), "none", "skip", "intentional-divergence:DIV-3"],
    [S("testE"), "none", "skip", "intentional-divergence:DIV-14"],
    [S("testF"), "none", "skip", "not-ported-yet"],
  ]),
  "conformance/escalations/ESC-9.1-1.md": OPEN_ESC,
  "conformance/escalations/ESC-9.1-2.md": DECIDED_ESC,
  "decisions/ESC-9.1-2.md": decision(DECIDED_ESC),
  "decisions/DIV-3.md": "# DIV-3\n",
  "stories/9.1.md": manifest("9.1", "support"),
};

function fixture(files: Readonly<Record<string, string>> = FILES): string {
  const dir = tempDir("dashboard");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const API_SURFACE = [
  {
    component: "support",
    upstream: 10,
    matched: 6,
    items: [
      { category: "missing", kind: "method", fqcn: "Illuminate\\Support\\Str", member: "a", to: null, details: null, explained: null },
      { category: "missing", kind: "method", fqcn: "Illuminate\\Support\\Str", member: "b", to: null, details: null, explained: "DIV-3.1" },
      { category: "renamed", kind: "method", fqcn: "Illuminate\\Support\\Str", member: "c", to: "d", details: null, explained: "DIV-3.2" },
      { category: "extra", kind: "method", fqcn: "Illuminate\\Support\\Str", member: "e", to: null, details: null, explained: null },
    ],
  },
];

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(tool: string, args: readonly string[], env: Record<string, string | undefined> = {}): Run {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, GITHUB_REPOSITORY: undefined, ...env })) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  const proc = Bun.spawnSync([process.execPath, "--no-env-file", tool, ...args], { cwd: root, stdout: "pipe", stderr: "pipe", env: merged });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function git(cwd: string, args: readonly string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}

function commitAll(cwd: string, subject: string): string {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-q", "-m", subject]);
  return git(cwd, ["rev-parse", "HEAD"]).trim();
}

function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        out.push(relative(dir, path).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out.sort();
}

function record(commit: string, tag: string, pinCommit: string, overall: [number, number], alpha: [number, number]): HistoryRecord {
  return { commit, pin: { tag, commit: pinCommit }, overall: { passing: overall[0], pairs: overall[1] }, alpha: { passing: alpha[0], applicable: alpha[1] }, components: {} };
}

// The section of `html` between `<section id="<id>">` and its `</section>`.
function section(html: string, id: string): string {
  const start = html.search(new RegExp(`<section id="${id}"[ >]`));
  expect([id, start >= 0]).toEqual([id, true]);
  return html.slice(start, html.indexOf("</section>", start));
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: unknown;
  jobs: Record<string, { permissions?: unknown; steps: { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> }[] }>;
}

// XT-conformance-146

xaravelTest("XT-conformance-146", "on every push to main the dashboard job publishes to gh-pages an index with the full-denominator Conformance Rate and the alpha-gate figure beside it, Skip Reason counts, DIV records linked, open Escalations with their Test IDs, Quarantined tests and the per-Component API-surface diff (FR-5, FR-5.1, FR-5.2, FR-5.3, FR-5.5)", () => {
  // Beyond FILES: a Divergence Record with no pair (DIV-20), and an Escalation whose status cannot be read (a bad name).
  const dir = fixture({ ...FILES, "decisions/DIV-20.md": "# DIV-20\n", "conformance/escalations/ESC-bad.md": escalation([S("testF")]) });
  const reportPath = join(tempDir("dashboard-report"), "report.json");
  expect(cli(REPORT, ["--root", dir, "--out", reportPath]).exitCode).toBe(0);
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as Report;
  const apiPath = join(tempDir("dashboard-api"), "api.json");
  writeFileSync(apiPath, JSON.stringify(API_SURFACE));
  const historyPath = join(tempDir("dashboard-history"), "history.jsonl");
  const records = [record("c1", "v13.37.0", "a".repeat(40), [0, 6], [0, 5]), record("c2", "v13.37.0", "a".repeat(40), [1, 6], [1, 5])];
  writeFileSync(historyPath, records.map(serialiseRecord).join(""));

  // Full page, with a repo: links point at the report's commit.
  const out = join(tempDir("dashboard-site"), "site");
  const run = cli(SITE, ["--root", dir, "--report", reportPath, "--history", historyPath, "--out", out, "--repo", "xaravel/framework", "--api-surface", apiPath]);
  expect(run).toEqual({ exitCode: 0, stdout: `conformance:site: wrote 3 pages to ${out}\n`, stderr: "" });
  expect(filesOf(out)).toEqual([".nojekyll", "api-surface/support.html", "epics/9.html", "history.jsonl", "index.html", "report.json"]);
  expect(readFileSync(join(out, "report.json"), "utf8")).toBe(serialiseReport(report));
  expect(readFileSync(join(out, "history.jsonl"), "utf8")).toBe(records.map(serialiseRecord).join(""));
  const html = readFileSync(join(out, "index.html"), "utf8");

  // The full rate with its denominator, and the alpha figure in the same section beside it (never in its place).
  const rate = section(html, "rate");
  expect(rate).toContain(`<p class="figure" id="full-rate">Full rate: <strong>16.67%</strong> = 1 / 6 pairs</p>`);
  expect(rate).toContain(`= ${report.alpha.passing} / ${report.alpha.applicable} applicable Test IDs · target 90.00% · met: no`);
  expect(rate).toContain(` · ${report.alpha.noAlphaLine} Test IDs with no alpha-Variant line, outside the denominator</p>`);
  // A distinct noAlphaLine value is the one rendered.
  const sevenPath = join(tempDir("dashboard-report-seven"), "report.json");
  writeFileSync(sevenPath, serialiseReport({ ...report, alpha: { ...report.alpha, noAlphaLine: 7 } }));
  const sevenOut = join(tempDir("dashboard-site-seven"), "site");
  expect(cli(SITE, ["--root", dir, "--report", sevenPath, "--history", historyPath, "--out", sevenOut, "--api-surface", apiPath]).exitCode).toBe(0);
  expect(section(readFileSync(join(sevenOut, "index.html"), "utf8"), "rate")).toContain(" · 7 Test IDs with no alpha-Variant line, outside the denominator</p>");
  expect(rate.indexOf('id="full-rate"')).toBeLessThan(rate.indexOf('id="alpha"'));
  expect(rate).toContain("<tr><td>support</td><td>6</td><td>1</td><td>16.67%</td><td>1</td><td>1</td><td>0</td></tr>");
  // All seven Skip Reason kinds, and the full reasons.
  const reasons = section(html, "skip-reasons");
  for (const kind of ["not-ported-yet", "blocked-by", "intentional-divergence", "php-only", "upstream-skip", "deferred", "out-of-scope"]) {
    expect([kind, reasons.includes(`<th>${kind}</th>`)]).toEqual([kind, true]);
  }
  expect(reasons).toContain("<tr><td>1</td><td>0</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>");
  expect(reasons).toContain("<tr><td>intentional-divergence:DIV-14</td><td>1</td></tr>");
  // DIV-1..12, DIV-14 (named by a reason) and DIV-20 (a record); DIV-3 is linked at the report's commit.
  const divs = section(html, "divergences");
  expect(divs.match(/<tr><td>DIV-\d+<\/td>/g)!.map((cell) => cell.slice(8, -5))).toEqual([...Array.from({ length: 12 }, (_, i) => `DIV-${i + 1}`), "DIV-14", "DIV-20"]);
  expect(divs).toContain(`<tr><td>DIV-20</td><td>0</td><td><a href="https://github.com/xaravel/framework/blob/HEAD/decisions/DIV-20.md">decisions/DIV-20.md</a></td></tr>`);
  expect(divs).toContain(`<tr><td>DIV-3</td><td>1</td><td><a href="https://github.com/xaravel/framework/blob/${report.commit ?? "HEAD"}/decisions/DIV-3.md">decisions/DIV-3.md</a></td></tr>`);
  expect(divs).toContain("<tr><td>DIV-4</td><td>0</td><td>no record yet</td></tr>");
  expect(divs).toContain("<tr><td>DIV-14</td><td>1</td><td>no record yet</td></tr>");
  // Only the open Escalation, with its Test IDs (escaped), and the one whose status cannot be read, as unknown.
  const escalations = section(html, "escalations");
  expect(escalations).toContain("Open Escalations (2)");
  expect(escalations).toContain(`>ESC-9.1-1</a></td><td>flaky</td><td>${S("testC")}, Illuminate\\Tests\\Support\\SupportTest::test&lt;b&gt;</td><td>open</td></tr>`);
  expect(escalations).toContain(`>ESC-bad</a></td><td>unparseable</td><td></td><td>unknown</td></tr>`);
  expect(escalations).not.toContain("ESC-9.1-2");
  expect(html).not.toContain("test<b>");
  // Quarantined tests as id × variant × escalation.
  expect(section(html, "quarantined")).toContain(`<tr><td>${S("testC")}</td><td>none</td><td><a href="https://github.com/xaravel/framework/blob/HEAD/conformance/escalations/ESC-9.1-1.md">ESC-9.1-1</a></td></tr>`);
  // The API-surface diff counts.
  const api = section(html, "api-surface");
  expect(api).toContain("<th>upstream</th><th>matched</th><th>missing</th><th>renamed</th><th>extra</th><th>unexplained</th>");
  expect(api).toContain(`<tr><td><a href="api-surface/support.html">support</a></td><td>10</td><td>6</td><td>2</td><td>1</td><td>1</td><td>2</td></tr>`);
  // The Component's page lists every item: the missing, renamed and extra members.
  const apiPage = readFileSync(join(out, "api-surface", "support.html"), "utf8");
  expect(apiPage).toContain("<th>category</th><th>kind</th><th>fqcn</th><th>member</th><th>to</th><th>explained</th>");
  expect(apiPage).toContain("<tr><td>missing</td><td>method</td><td>Illuminate\\Support\\Str</td><td>a</td><td></td><td>unexplained</td></tr>");
  expect(apiPage).toContain("<tr><td>missing</td><td>method</td><td>Illuminate\\Support\\Str</td><td>b</td><td></td><td>DIV-3.1</td></tr>");
  expect(apiPage).toContain("<tr><td>renamed</td><td>method</td><td>Illuminate\\Support\\Str</td><td>c</td><td>d</td><td>DIV-3.2</td></tr>");
  expect(apiPage).toContain("<tr><td>extra</td><td>method</td><td>Illuminate\\Support\\Str</td><td>e</td><td></td><td>unexplained</td></tr>");
  // The history chart and the Epic links.
  expect(section(html, "history")).toContain("<svg");
  expect(section(html, "epics")).toContain(`<a href="epics/9.html">Epic 9</a>`);

  // No repo: names render as plain text; empty history: the chart says so; a previous site is replaced.
  const plain = cli(SITE, ["--root", dir, "--report", reportPath, "--out", out, "--api-surface", apiPath]);
  expect(plain.exitCode).toBe(0);
  const plainHtml = readFileSync(join(out, "index.html"), "utf8");
  expect(plainHtml).not.toContain('<a href="https://');
  expect(section(plainHtml, "divergences")).toContain("<tr><td>DIV-3</td><td>1</td><td>decisions/DIV-3.md</td></tr>");
  expect(section(plainHtml, "history")).toContain("no history yet");
  expect(readFileSync(join(out, "history.jsonl"), "utf8")).toBe("");
  // GITHUB_REPOSITORY is the --repo default.
  expect(cli(SITE, ["--root", dir, "--report", reportPath, "--out", out, "--api-surface", apiPath], { GITHUB_REPOSITORY: "o/n" }).exitCode).toBe(0);
  expect(readFileSync(join(out, "index.html"), "utf8")).toContain('href="https://github.com/o/n/blob/');

  // A null rate renders as n/a (buildSite is pure over its inputs).
  const empty = computeReport(fixture({ ...FILES, "conformance/expectations/support/framework/tests/Support/SupportTest.jsonl": "" }));
  const emptyHtml = buildSite({ report: empty, history: [], repo: null, divRecords: new Set(), escalations: [], quarantined: [], apiSurface: [], epics: [] }).get("index.html")!;
  expect(emptyHtml).toContain("Full rate: <strong>n/a</strong> = 0 / 0 pairs");

  // Errors: a bad flag, a missing report (named), a malformed history line (named), a non-site --out.
  const nope = cli(SITE, ["--nope"]);
  expect([nope.exitCode, nope.stdout, nope.stderr.split("\n")[0], nope.stderr.split("\n")[1]!.startsWith("Usage: ")]).toEqual([2, "", "Unknown argument: --nope", true]);
  expect(cli(SITE, ["--repo", "not a repo"]).exitCode).toBe(2);
  const missing = join(dir, "nowhere", "report.json");
  expect(cli(SITE, ["--root", dir, "--report", missing, "--api-surface", apiPath, "--out", out])).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:site: ${missing} does not exist (run bun run conformance:report first)\n` });
  const badHistory = join(tempDir("dashboard-bad"), "history.jsonl");
  writeFileSync(badHistory, `${serialiseRecord(records[0]!)}{oops\n`);
  const malformed = cli(SITE, ["--root", dir, "--report", reportPath, "--history", badHistory, "--api-surface", apiPath, "--out", out]);
  expect([malformed.exitCode, malformed.stderr.startsWith(`conformance:site: ${badHistory}:2: malformed JSON`)]).toEqual([1, true]);
  const occupied = tempDir("dashboard-occupied");
  writeFileSync(join(occupied, "keep.txt"), "x\n");
  expect(cli(SITE, ["--root", dir, "--report", reportPath, "--api-surface", apiPath, "--out", occupied]).exitCode).toBe(1);
  expect(existsSync(join(occupied, "keep.txt"))).toBe(true);

  // Publish: a caller work tree and a bare remote without gh-pages.
  const remote = tempDir("dashboard-remote");
  git(remote, ["init", "-q", "--bare", "."]);
  const caller = fixture();
  git(caller, ["init", "-q", "-b", "work", "."]);
  commitAll(caller, "fixture");
  git(caller, ["remote", "add", "origin", remote]);
  writeFileSync(join(caller, "untracked.txt"), "x\n");
  writeFileSync(join(caller, "staged.txt"), "y\n");
  git(caller, ["add", "staged.txt"]);
  const head = git(caller, ["rev-parse", "HEAD"]).trim();
  const status = git(caller, ["status", "--porcelain=v1", "--branch"]);
  const pagesTree = (): string[] => git(remote, ["ls-tree", "-r", "--name-only", "gh-pages"]).trim().split("\n").sort();
  const pagesTip = (): string => git(remote, ["rev-parse", "refs/heads/gh-pages"]).trim();
  expect(cli(SITE, ["--root", dir, "--report", reportPath, "--history", historyPath, "--out", out, "--repo", "xaravel/framework", "--api-surface", apiPath]).exitCode).toBe(0);

  // New: an orphan commit whose tree is exactly the directory.
  const created = cli(PUBLISH, ["--root", caller, "--dir", out]);
  expect(created.stderr).toBe("");
  expect(created.stdout).toMatch(/^conformance:publish: created origin gh-pages at [0-9a-f]{40}\n$/);
  expect(pagesTree()).toEqual(filesOf(out));
  expect(git(remote, ["show", "gh-pages:index.html"])).toBe(readFileSync(join(out, "index.html"), "utf8"));
  expect(git(remote, ["rev-list", "--count", "gh-pages"]).trim()).toBe("1");
  const first = pagesTip();
  // Same: no new commit.
  expect(cli(PUBLISH, ["--root", caller, "--dir", out])).toEqual({ exitCode: 0, stdout: `conformance:publish: unchanged origin gh-pages at ${first}\n`, stderr: "" });
  expect(pagesTip()).toBe(first);
  // Changed: one file removed, one changed; a new commit on the old tip, without the removed file.
  rmSync(join(out, "history.jsonl"));
  writeFileSync(join(out, "index.html"), "changed\n");
  const updated = publishSite({ root: caller, remote: "origin", branch: "gh-pages", dir: out });
  expect(updated.outcome).toBe("updated");
  expect(updated.attempts).toBe(1);
  expect(pagesTip()).toBe(updated.tip);
  expect(git(remote, ["rev-parse", "gh-pages^"]).trim()).toBe(first);
  expect(pagesTree()).toEqual(filesOf(out));
  expect(pagesTree()).not.toContain("history.jsonl");
  expect(git(remote, ["show", "gh-pages:index.html"])).toBe("changed\n");
  // The caller's HEAD, index and working tree are unchanged; only gh-pages was pushed.
  expect(git(caller, ["rev-parse", "HEAD"]).trim()).toBe(head);
  expect(git(caller, ["status", "--porcelain=v1", "--branch"])).toBe(status);
  expect(git(remote, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/gh-pages\n");
  const publishNope = cli(PUBLISH, ["--nope"]);
  expect([publishNope.exitCode, publishNope.stderr.split("\n")[0]]).toEqual([2, "Unknown argument: --nope"]);
  expect(cli(PUBLISH, ["--root", caller, "--dir", join(caller, "nowhere")]).exitCode).toBe(1);
  // A directory without index.html (empty, or a partial build) is refused; the published site stays.
  const emptyDir = tempDir("dashboard-empty-site");
  const refused = cli(PUBLISH, ["--root", caller, "--dir", emptyDir]);
  expect(refused).toEqual({ exitCode: 1, stdout: "", stderr: `conformance:publish: ${emptyDir} has no index.html (run bun run conformance:site first); refusing to publish it\n` });
  writeFileSync(join(emptyDir, "report.json"), "{}\n");
  expect(cli(PUBLISH, ["--root", caller, "--dir", emptyDir]).exitCode).toBe(1);
  expect(pagesTip()).toBe(updated.tip);

  // The real repository, as CI builds it: no --api-surface (diffComponents runs), the real Story manifests, sprint
  // status, Escalations and git history.
  const realReport = join(tempDir("dashboard-real-report"), "report.json");
  expect(cli(REPORT, ["--out", realReport]).exitCode).toBe(0);
  const realOut = join(tempDir("dashboard-real-site"), "site");
  const real = cli(SITE, ["--report", realReport, "--out", realOut]);
  expect(real.stderr).toBe("");
  expect(real.exitCode).toBe(0);
  const realEpics = [...new Set(readManifests(root).manifests.map((m) => m.epic))];
  expect(realEpics.length).toBeGreaterThan(0);
  for (const epic of realEpics) {
    expect([epic, existsSync(join(realOut, "epics", `${epic}.html`))]).toEqual([epic, true]);
  }
  const realApi = section(readFileSync(join(realOut, "index.html"), "utf8"), "api-surface");
  const realComponents = componentsOf(root);
  expect(realComponents.length).toBeGreaterThan(0);
  expect(realApi.match(/<tr><td><a href="api-surface\/[^"]+\.html">/g)!.length).toBe(realComponents.length);
  for (const component of realComponents) {
    expect([component, realApi.includes(`<tr><td><a href="api-surface/${component}.html">${component}</a></td>`), existsSync(join(realOut, "api-surface", `${component}.html`))]).toEqual([component, true, true]);
  }

  // The workflow: push to main; checkout with full history and no persisted credentials; install, report, history,
  // site, publish in that order; the token only on the history and publish steps; contents: write and nothing else.
  const text = readFileSync(join(root, ".github", "workflows", "dashboard.yml"), "utf8");
  const flow = Bun.YAML.parse(text) as Workflow;
  expect(flow.on).toEqual({ push: { branches: ["main"] } });
  expect(flow.permissions).toEqual({ contents: "read" });
  const job = flow.jobs["dashboard"]!;
  expect(job.permissions).toEqual({ contents: "write" });
  expect(job.steps[0]!.uses).toStartWith("actions/checkout@");
  expect(job.steps[0]!.with).toEqual({ "fetch-depth": 0, "persist-credentials": false });
  expect(job.steps.map((step) => step.uses?.split("@")[0] ?? null).filter((uses) => uses !== null)).toEqual(["actions/checkout", "oven-sh/setup-bun"]);
  const lastLines = job.steps.filter((step) => step.run !== undefined).map((step) => step.run!.trimEnd().split("\n").at(-1));
  expect(lastLines).toEqual([
    "bun install --frozen-lockfile --ignore-scripts",
    "bun run conformance:report",
    "bun run conformance:history --history-out .cache/conformance/history.jsonl",
    'bun run conformance:site --history .cache/conformance/history.jsonl --repo "$GITHUB_REPOSITORY"',
    "bun run conformance:publish --dir .cache/conformance/site",
  ]);
  const withToken = job.steps.filter((step) => JSON.stringify(step).includes("github.token")).map((step) => step.run!.trimEnd().split("\n").at(-1));
  expect(withToken).toEqual([lastLines[2], lastLines[4]]);
  for (const forbidden of ["id-token", "pages: write", "deploy-pages", "upload-pages-artifact"]) {
    expect([forbidden, text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n").includes(forbidden)]).toEqual([forbidden, false]);
  }
  expect(checkWorkflows(root).violations).toEqual([]);
  expect(checkAuthority(root).violations).toEqual([]);
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["conformance:site"]).toBe("bun --no-env-file tools/conformance-report/site.ts");
  expect(scripts["conformance:publish"]).toBe("bun --no-env-file tools/conformance-report/publish.ts");
}, 300_000);

// XT-conformance-147

xaravelTest("XT-conformance-147", "the history chart starts a new series and draws a marker labelled with the new tag at every Baseline Pin change, so no line joins across a change (FR-5.4)", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  const records = [
    record("c1", "v13.37.0", A, [0, 10], [0, 8]),
    record("c2", "v13.37.0", A, [2, 10], [1, 8]),
    record("c3", "v13.37.0", A, [5, 10], [4, 8]),
    record("c4", "v13.38.0", B, [3, 12], [2, 8]),
    record("c5", "v13.38.0", B, [6, 12], [0, 0]),
    record("c6", "v13.37.0", A, [0, 0], [8, 8]),
  ];
  const { series, markers } = historySeries(records);
  expect(series.map((one) => [one.pin.tag, one.start, one.points.length])).toEqual([
    ["v13.37.0", 0, 3],
    ["v13.38.0", 3, 2],
    ["v13.37.0", 5, 1],
  ]);
  expect(markers).toEqual([
    { index: 3, tag: "v13.38.0" },
    { index: 5, tag: "v13.37.0" },
  ]);
  expect(series[0]!.points[1]).toEqual({ commit: "c2", rate: 0.2, alpha: 0.125 });
  expect(series[1]!.points[1]).toEqual({ commit: "c5", rate: 0.5, alpha: null });
  expect(series[2]!.points[0]).toEqual({ commit: "c6", rate: null, alpha: 1 });
  // The same tag on a different commit is a Pin change too.
  expect(historySeries([record("c1", "v1", A, [0, 1], [0, 1]), record("c2", "v1", B, [0, 1], [0, 1])]).markers).toEqual([{ index: 1, tag: "v1" }]);
  expect(historySeries([])).toEqual({ series: [], markers: [] });

  // The SVG: one overall and one alpha polyline per series, one dashed marker line and tag label per change.
  const svg = renderHistoryChart(records);
  expect(svg.startsWith("<svg")).toBe(true);
  const polylines = svg.match(/<polyline [^>]*>/g)!;
  expect(polylines.map((line) => /class="(\w+)" data-series="(\d)"/.exec(line)!.slice(1).join(":"))).toEqual(["overall:0", "alpha:0", "overall:1", "alpha:1", "overall:2", "alpha:2"]);
  // Each polyline holds only its own series' non-null points.
  expect(polylines.map((line) => /points="([^"]*)"/.exec(line)![1]!.split(" ").filter((p) => p !== "").length)).toEqual([3, 3, 2, 1, 0, 1]);
  expect(svg.match(/<line class="marker"/g)!.length).toBe(2);
  // A circle per non-null point, titled with the short commit, Pin tag and rate; so the one-point series 2 is visible.
  expect(svg.match(/<circle /g)!.length).toBe(10);
  expect(svg).toContain(`<circle class="alpha" data-series="2" `);
  expect(svg).toContain("<title>c6 · v13.37.0 · alpha 100.00%</title></circle>");
  expect(svg).not.toContain(`<circle class="overall" data-series="2" `);
  expect(svg).toContain("<title>c2 · v13.37.0 · overall 20.00%</title></circle>");
  expect(svg.match(/<text class="marker-label"[^>]*>([^<]*)<\/text>/g)!.map((label) => label.replace(/<[^>]*>/g, ""))).toEqual(["v13.38.0", "v13.37.0"]);
  expect(renderHistoryChart([])).toBe(`<p class="empty">no history yet</p>`);
  // Tags are escaped.
  expect(renderHistoryChart([record("c1", "v1", A, [0, 1], [0, 1]), record("c2", "<v2>", B, [0, 1], [0, 1])])).toContain(">&lt;v2&gt;</text>");

  // readHistory parses JSONL and names the line of a malformed record.
  const file = join(tempDir("dashboard-read"), "history.jsonl");
  writeFileSync(file, records.map(serialiseRecord).join(""));
  expect(readHistory(file)).toEqual(records);
  writeFileSync(file, `${serialiseRecord(records[0]!)}\n{"commit":1}\n`);
  expect(() => readHistory(file)).toThrow(new SiteError(`${file}:3: not a history record`));
}, 60_000);

// XT-conformance-148

xaravelTest("XT-conformance-148", "the Epic review view shows the Epic's Components' rates and Skip Reason counts, the Divergence Records and Escalations added since the Epic began, and files and lines per Story, with fail-known and open Escalations first as blocking acceptance (UJ-5 via FR-5)", () => {
  const repo = fixture({
    ...FILES,
    "stories/1.1.md": manifest("1.1", "support"),
    "stories/1.2.md": manifest("1.2", "widgets", "review"),
    "stories/2.1.md": manifest("2.1", "support", "backlog"),
    // Added before the Epic began, but it names 1.2's Xaravel Test: it still blocks Epic 1.
    "conformance/escalations/ESC-9.9-1.md": escalation(["XT-widgets-1"]),
    // Epic 2 has not begun, but its own open Escalation blocks it.
    "conformance/escalations/ESC-2.1-1.md": escalation([S("testF")]),
  });
  git(repo, ["init", "-q", "-b", "main", "."]);
  const base = commitAll(repo, "init");
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "a.txt"), "one\ntwo\nthree\n");
  commitAll(repo, "1.1: a");
  writeFileSync(join(repo, "notes.txt"), "planning\n");
  // A Divergence Record added since the Epic began and deleted again before HEAD is not listed.
  writeFileSync(join(repo, "decisions", "DIV-2.md"), "# DIV-2\n");
  commitAll(repo, "planning: x");
  const escText = escalation([S("testB"), S("testD")], "divergence");
  writeFileSync(join(repo, "decisions", "DIV-1.md"), "# DIV-1\nRecord.\n");
  writeFileSync(join(repo, "conformance", "escalations", "ESC-1.2-1.md"), escText);
  writeFileSync(join(repo, "src", "a.txt"), "one\nTWO\nthree\n");
  commitAll(repo, "1.2: b");
  rmSync(join(repo, "decisions", "DIV-2.md"));
  commitAll(repo, "planning: y");
  const escLines = escText.split("\n").length - 1;
  const report = computeReport(repo);

  const review = epicReview(repo, 1, report);
  expect(review.epic).toBe(1);
  expect(review.began).toBe(base);
  expect(review.components).toEqual([
    { component: "support", bucket: report.components["support"]! },
    { component: "widgets", bucket: null },
  ]);
  // Added in began..HEAD: DIV-1 and ESC-1.2-1; ESC-9.9-1 (added before 1.1) is not.
  expect(review.divergences).toEqual([{ id: "DIV-1", file: "decisions/DIV-1.md" }]);
  expect(review.escalations).toEqual([{ id: "ESC-1.2-1", file: "conformance/escalations/ESC-1.2-1.md", trigger: "divergence", testIds: [S("testB"), S("testD")], status: "open" }]);
  expect(review.stories).toEqual([
    { id: "1.1", status: "done", commits: 1, files: 1, added: 3, deleted: 0 },
    { id: "1.2", status: "review", commits: 1, files: 3, added: 2 + escLines + 1, deleted: 1 },
  ]);
  // Blocking: every open Escalation concerning the Epic, by Story ID or by Test ID, whenever it was added.
  expect(review.blocking.map((entry) => [entry.id, entry.status])).toEqual([
    ["ESC-1.2-1", "open"],
    ["ESC-9.9-1", "open"],
  ]);

  // An Epic whose Stories have no commits.
  expect(epicReview(repo, 2, report)).toEqual({
    epic: 2,
    components: [{ component: "support", bucket: report.components["support"]! }],
    began: null,
    divergences: [],
    escalations: [],
    blocking: [{ id: "ESC-2.1-1", file: "conformance/escalations/ESC-2.1-1.md", trigger: "flaky", testIds: [S("testF")], status: "open" }],
    stories: [{ id: "2.1", status: "backlog", commits: 0, files: 0, added: 0, deleted: 0 }],
  });

  // The rendered page: blocking items first, then Components, the records added since it began, and the Stories.
  const reportPath = join(tempDir("dashboard-epic-report"), "report.json");
  writeFileSync(reportPath, serialiseReport(report));
  const apiPath = join(tempDir("dashboard-epic-api"), "api.json");
  writeFileSync(apiPath, "[]");
  const out = join(tempDir("dashboard-epic-site"), "site");
  const run = cli(SITE, ["--root", repo, "--report", reportPath, "--out", out, "--repo", "xaravel/framework", "--api-surface", apiPath]);
  expect(run).toEqual({ exitCode: 0, stdout: `conformance:site: wrote 4 pages to ${out}\n`, stderr: "" });
  expect(filesOf(join(out, "epics"))).toEqual(["1.html", "2.html", "9.html"]);
  const html = readFileSync(join(out, "epics", "1.html"), "utf8");
  const order = ['id="blocking"', 'id="components"', 'id="since"', 'id="stories"'].map((marker) => html.indexOf(marker));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  const blocking = section(html, "blocking").replace(/^<section [^>]*>/, "");
  expect(blocking).toContain(`<p id="fail-known">fail-known (the Epic's Components' count across all Epics): <strong>1</strong> (blocks acceptance)</p>`);
  expect(blocking).toContain(`<p id="open-escalations">open Escalations concerning this Epic: <strong>2</strong> (blocks acceptance)</p>`);
  expect(blocking).toContain(`>ESC-1.2-1</a></td><td>divergence</td><td>${S("testB")}, ${S("testD")}</td><td>open</td></tr>`);
  expect(blocking).toContain(`>ESC-9.9-1</a></td><td>flaky</td><td>XT-widgets-1</td><td>open</td></tr>`);
  const components = section(html, "components");
  expect(components).toContain(`<h3>support</h3>\n<p>Rate: <strong>16.67%</strong> = 1 / 6 pairs · fail-known 1 · quarantined 1 · adapted 0</p>`);
  expect(components).toContain("<tr><td>1</td><td>0</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>");
  expect(components).toContain(`<h3>widgets</h3>\n<p class="empty">no Test IDs in the Inventory</p>`);
  const since = section(html, "since");
  expect(since).toContain(`Began at: ${base}`);
  expect(since).toContain(`<tr><td>DIV-1</td><td><a href="https://github.com/xaravel/framework/blob/${report.commit}/decisions/DIV-1.md">decisions/DIV-1.md</a></td></tr>`);
  expect(since).toContain(`>ESC-1.2-1</a></td><td>divergence</td><td>${S("testB")}, ${S("testD")}</td><td>open</td></tr>`);
  expect(since).not.toContain("ESC-9.9-1");
  expect(since).not.toContain("DIV-2");
  const stories = section(html, "stories");
  expect(stories).toContain("<tr><td>1.1</td><td>done</td><td>1</td><td>1</td><td>+3</td><td>-0</td></tr>");
  expect(stories).toContain(`<tr><td>1.2</td><td>review</td><td>1</td><td>3</td><td>+${3 + escLines}</td><td>-1</td></tr>`);
  const notBegun = readFileSync(join(out, "epics", "2.html"), "utf8");
  expect(notBegun).toContain("Began at: not begun (no Story commit)");
  expect(section(notBegun, "blocking")).toContain(`<p id="open-escalations">open Escalations concerning this Epic: <strong>1</strong> (blocks acceptance)</p>`);
  expect(section(notBegun, "blocking")).toContain(">ESC-2.1-1</a>");
  expect(section(notBegun, "stories")).toContain("<tr><td>2.1</td><td>backlog</td><td>0</td><td>0</td><td>+0</td><td>-0</td></tr>");
}, 60_000);
