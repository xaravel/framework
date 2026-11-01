// Xaravel Tests for Story 5.9 (the Xaravel Test coverage check and the Story
// done check; FR-111, FR-114, FR-115, AD-15, AD-16, AD-28).
//
// Fixture roots are hermetic git roots holding a root `bunfig.toml`, Story
// manifests, an Inventory, an Expectations shard, `conformance/variants`, a
// stub Ported Test file and a stub Xaravel Test file that import
// `@xaravel/assert` from the real `packages/assert` by absolute path; the real
// harness runs them. `approvals` reads Fidelity Review verdict records from a
// spec under `_bmad-output/` in a committed fixture root; the GitHub API that
// `full-run` reads is a `Bun.serve` fake on port 0. The real
// repository is only read; no test here runs the Xaravel Tests of the real
// root unfiltered, since that run would include these tests.
import { afterAll, expect } from "bun:test";
import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs, runHarness, type HarnessResult } from "../../harness/harness";
import { judgeXaravel, xaravelTestFiles } from "../../harness/xaravel";
import { coverage, runCoverage } from "../../../tools/xt-coverage/coverage";
import { CONSEQUENCE_SOURCES, consequencesFor, declaredConsequences, expectedFiles, PRD_FILE, prdConsequences, readConsequences, SPINE_FILE, spineRules } from "../../../tools/xt-coverage/consequences";
import { apiSurfaceClause, approvalsClause, CLAUSES, fixturesClause, fullRunClause, lastSummary, MAX_ITEMS, renderClause, repoFromRemote, runApiSurfaceGate, runStoryCheck, testsClause, xaravelClause, type FixturesInput, type GateRun } from "../../../tools/story-check/story-check";
import { EPICS, parseManifest } from "../../../tools/ownership/ownership";
import { appendRecords, CHECKLIST_FILE, parseChecklist, RECORD_KIND, renderRecord, reviewTree, type Cli, type VerdictRecord } from "../../../tools/fidelity-review/fidelity-review";
import { renderFixture, signFixture } from "../../../tools/oracle/fixtures";
import { makeRequest, renderRequests, REQUESTS_DIR, SCHEMA_FILE, type Json } from "../../../tools/oracle/request";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const TIMEOUT = 180_000;
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-done-check-"));
  roots.push(dir);
  for (const [path, text] of Object.entries({ "bunfig.toml": "env = false\n", "conformance/variants": "none\npgsql\nsqlite\n", [CHECKLIST_FILE]: readFileSync(join(root, CHECKLIST_FILE), "utf8"), ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The harness runs only at the top level of a git worktree (AD-17).
  Bun.spawnSync(["git", "init", "-q", dir]);
  return dir;
}

/** The parent env without CI markers or a real GitHub token, plus `extra` (undefined removes a key). */
function env(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ...process.env, CI: undefined, GITHUB_ACTIONS: undefined, GH_TOKEN: undefined, GITHUB_REPOSITORY: undefined, GITHUB_API_URL: undefined, ...extra };
}

const XT_FILE = "conformance/tests/xaravel/demo.test.ts";

/** An Xaravel Test file importing the real `@xaravel/assert`. */
function xtFile(body: string): string {
  return `import { Assert, xaravelTest } from ${JSON.stringify(ASSERT)};\n${body}\n`;
}

// ---------------------------------------------------------------------------
// XT-conformance-126 (AC1): consequence files and `xt:coverage`

xaravelTest(
  "XT-conformance-126",
  "conformance/xaravel-consequences/<component>.jsonl is generated from the PRD's FR consequences and the spine's AD rules and passes --check; bun run xt:coverage <component> lists every consequence that no passing xaravelTest declares and exits 1 while any remain (FR-115.2; AD-15)",
  async () => {
    // The committed file is the generator's output (the drift check), and the scripts exist.
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["xt:consequences"]).toBe("bun --no-env-file tools/xt-coverage/consequences.ts");
    expect(scripts["xt:coverage"]).toBe("bun --no-env-file tools/xt-coverage/coverage.ts");
    const check = Bun.spawnSync([process.execPath, join(root, "tools", "xt-coverage", "consequences.ts"), "--check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect([check.exitCode, check.stderr.toString()]).toEqual([0, ""]);
    expect([...expectedFiles(root).keys()]).toEqual(["conformance", "runtime", "contracts", "macroable", "conditionable", "reflection", "collections", "config", "json-schema", "container"].map((component) => `conformance/xaravel-consequences/${component}.jsonl`));
    expect(CONSEQUENCE_SOURCES["conformance"]).toEqual({ frs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 111, 112, 113, 114, 115, 116], ads: [15, 16, 17, 21, 28] });
    expect(CONSEQUENCE_SOURCES["runtime"]).toEqual({ frs: [], ads: [2, 5, 6, 9, 10, 23] });
    // MAINT-2026-10-22-consequence-rows: from contracts on, a row is what the Component's Epic declares on its Covers
    // line, ADs with a Rule list and FRs with a consequence list, plus AD-2 and AD-6. Derived from epics.md, not copied;
    // each Epic's Component is the one its `stories/<E>.1.md` manifest names.
    const epics = readFileSync(join(root, "_bmad-output", "planning-artifacts", "epics.md"), "utf8");
    const withLists = { frs: prdConsequences(readFileSync(join(root, PRD_FILE), "utf8")), ads: spineRules(readFileSync(join(root, SPINE_FILE), "utf8")) };
    const derived = new Map<string, { frs: number[]; ads: number[] }>();
    for (const epic of [10, 11, 12, 13, 14, 15, 16, 17]) {
      const manifestFile = `stories/${epic}.1.md`;
      const { manifest, violations } = parseManifest(manifestFile, readFileSync(join(root, manifestFile), "utf8"));
      expect([manifestFile, violations]).toEqual([manifestFile, []]);
      const component = manifest!.component;
      // The Epic's own section, from its heading up to the next `## ` heading, so a missing Covers line never reads the next Epic's.
      const section = new RegExp(`^## Epic ${epic}:.*$[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m").exec(epics);
      expect([`Epic ${epic} heading`, section !== null]).toEqual([`Epic ${epic} heading`, true]);
      const coversLine = /^\*\*Covers:\*\*(.*)$/m.exec(section![0]);
      expect([`Epic ${epic} **Covers:** line`, coversLine !== null]).toEqual([`Epic ${epic} **Covers:** line`, true]);
      const covers = coversLine![1]!;
      const numbers = (kind: string): number[] => [...covers.matchAll(new RegExp(`\\b${kind}-(\\d+)\\b`, "g"))].map((match) => Number(match[1]));
      const declared = {
        frs: numbers("FR").filter((n) => withLists.frs.has(n)).sort((a, b) => a - b),
        ads: [...new Set([...numbers("AD"), 2, 6])].filter((n) => withLists.ads.has(n)).sort((a, b) => a - b),
      };
      expect([component, CONSEQUENCE_SOURCES[component]]).toEqual([component, declared]);
      derived.set(component, declared);
    }
    // Every row from contracts on has an Epic in the loop above, so a new row without one fails here.
    expect([...derived.keys()].sort()).toEqual(Object.keys(CONSEQUENCE_SOURCES).filter((component) => component !== "conformance" && component !== "runtime").sort());
    // FR-26 (Epics 11-13) and FR-84 (Epic 16) have no consequence list, so they are dropped; FR-23 (Epic 14) and FR-20 (Epic 15) have one.
    expect(Object.fromEntries(derived)).toEqual({
      contracts: { frs: [10, 19, 21], ads: [1, 2, 6, 27] },
      macroable: { frs: [], ads: [2, 6] },
      conditionable: { frs: [], ads: [2, 6] },
      reflection: { frs: [], ads: [2, 6] },
      collections: { frs: [23], ads: [2, 6] },
      config: { frs: [20], ads: [2, 6] },
      "json-schema": { frs: [], ads: [2, 6] },
      container: { frs: [19], ads: [1, 2, 4, 5, 6] },
    });
    for (const [component, { frs, ads }] of derived) {
      const componentIds = readConsequences(root, component).map((line) => line.id);
      for (const front of [...frs.map((n) => `FR-${n}`), ...ads.map((n) => `AD-${n}`)]) {
        expect([component, front, componentIds.includes(`${front}.1`)]).toEqual([component, front, true]);
      }
    }

    // The IDs are mechanical: unique, every FR (by n, then k) before every AD (by n, then k), and each FR / AD present.
    const lines = readConsequences(root, "conformance");
    const ids = lines.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    const key = (id: string): [number, number, number] => {
      const [, kind, n, k] = /^(FR|AD)-(\d+)\.(\d+)$/.exec(id)!;
      return [kind === "FR" ? 0 : 1, Number(n), Number(k)];
    };
    const sorted = [...ids].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
    expect(ids).toEqual(sorted);
    const fronts = new Set(ids.map((id) => id.split(".")[0]));
    expect([...fronts]).toEqual([...["1", "2", "3", "4", "5", "6", "7", "8", "9", "111", "112", "113", "114", "115", "116"].map((n) => `FR-${n}`), "AD-15", "AD-16", "AD-17", "AD-21", "AD-28"]);
    for (const front of fronts) {
      expect([front, ids.includes(`${front}.1`)]).toEqual([front, true]);
    }
    // A bullet keeps its nested lines, whitespace collapsed; the list marker is dropped.
    const text = (id: string): string => lines.find((line) => line.id === id)!.text;
    expect(text("FR-3.1")).toBe("A `skip` without a Skip Reason from the vocabulary fails CI.");
    expect(text("FR-3.2")).toContain("CI checks every Skip Reason against its rule in §3, and fails on any that breaks it: - `blocked-by` must name a Component in a later Phase, or one in the same Phase built in a later Epic. - `intentional-divergence`");
    expect(text("FR-3.4")).toContain("1. `upstream-skip`, because it is machine-verified.");
    expect(text("FR-3.4")).toContain("When in doubt, the agent picks the reason that counts against conformance.");
    expect(text("AD-17.5")).toBe("**One runner per worktree.** A lock file `.cache/harness.lock` keeps out a second runner in the same worktree.");
    expect(lines.every((line) => !/\s{2}|^\s|\s$|\n/.test(line.text))).toBe(true);
    // Each line is {"id","text"} through JSON.stringify, LF-terminated.
    const raw = readFileSync(join(root, "conformance/xaravel-consequences/conformance.jsonl"), "utf8");
    expect(raw).toBe(lines.map((line) => `${JSON.stringify({ id: line.id, text: line.text })}\n`).join(""));

    // The parser on a small PRD and spine: an FR's list stops at its section's end; an AD's at the next column-0 line.
    const prd = ["#### FR-3: X", "", "Intro.", "", "**Consequences (testable):**", "- One", "  continued.", "- Two:", "  - nested", "", "  More.", "", "#### FR-4: Y", "**Consequences (testable):**", "- Three"].join("\n");
    const spine = ["### AD-15 — Z", "", "- **Binds:** x", "- **Rule:**", "  - **A.** a", "    - a1", "  - **B.** b", "- **Other:** not a rule", "", "### AD-16 — W", "- **Rule:**", "  - **C.** c"].join("\n");
    expect(consequencesFor({ frs: [4, 3], ads: [16, 15] }, prd, spine)).toEqual([
      { id: "FR-3.1", text: "One continued." },
      { id: "FR-3.2", text: "Two: - nested More." },
      { id: "FR-4.1", text: "Three" },
      { id: "AD-15.1", text: "**A.** a - a1" },
      { id: "AD-15.2", text: "**B.** b" },
      { id: "AD-16.1", text: "**C.** c" },
    ]);
    expect(() => consequencesFor({ frs: [5], ads: [] }, prd, spine)).toThrow(`${PRD_FILE}: FR-5 has no **Consequences (testable):** list`);
    expect(() => consequencesFor({ frs: [], ads: [17] }, prd, spine)).toThrow(`${SPINE_FILE}: AD-17 has no - **Rule:** list`);

    // Drift: a hand-edited file fails --check, naming it; the generator rewrites it.
    const drift = makeRoot({ [PRD_FILE]: readFileSync(join(root, PRD_FILE), "utf8"), [SPINE_FILE]: readFileSync(join(root, SPINE_FILE), "utf8") });
    const generator = join(root, "tools", "xt-coverage", "consequences.ts");
    const missing = Bun.spawnSync([process.execPath, generator, "--check", "--root", drift], { stdout: "pipe", stderr: "pipe" });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr.toString()).toContain("conformance/xaravel-consequences/conformance.jsonl differs from");
    expect(Bun.spawnSync([process.execPath, generator, "--root", drift]).exitCode).toBe(0);
    expect(readFileSync(join(drift, "conformance/xaravel-consequences/conformance.jsonl"), "utf8")).toBe(raw);
    writeFileSync(join(drift, "conformance/xaravel-consequences/conformance.jsonl"), raw.replace("fails CI.", "fails CI!"));
    expect(Bun.spawnSync([process.execPath, generator, "--check", "--root", drift]).exitCode).toBe(1);
    expect(Bun.spawnSync([process.execPath, generator, "--bogus"]).exitCode).toBe(2);

    // Declaring: whole tokens only; a bare FR-3 declares nothing.
    expect(declaredConsequences("does x (FR-3.1, AD-15.2; FR-3, FR-3.10)")).toEqual(["FR-3.1", "AD-15.2", "FR-3.10"]);
    expect(declaredConsequences("FR-3 and AD-15, XFR-3.1, FR-3.1.2, FR-3.1a, -FR-3.2")).toEqual([]);

    // Coverage is computed from passing tests only.
    const consequences = [
      { id: "FR-3.1", text: "one" },
      { id: "FR-3.2", text: "two" },
      { id: "AD-15.1", text: "three" },
    ];
    expect(
      coverage(consequences, [
        { id: "XT-a-1", consequence: "x (FR-3.1)", outcome: "pass" },
        { id: "XT-a-2", consequence: "y (FR-3.2, FR-9.9)", outcome: "fail" },
        { id: "XT-a-3", consequence: "z (AD-15.1)", outcome: "skip" },
        { id: "XT-a-4", consequence: "w (FR-3)", outcome: "pass" },
        { id: "XT-a-5", consequence: null, outcome: "missing" },
      ]),
    ).toEqual({ covered: ["FR-3.1"], uncovered: [consequences[1], consequences[2]], unknown: [{ test: "XT-a-2", id: "FR-9.9" }] });

    // The CLI over a fixture root: the real harness runs its Xaravel Tests.
    const consequenceFile = consequences.map((line) => `${JSON.stringify(line)}\n`).join("");
    const body = [
      `xaravelTest("XT-demo-1", "covers one (FR-3.1) and nothing by FR-3; cites FR-99.1, which the file lacks", () => { Assert.assertTrue(true); });`,
      `xaravelTest("XT-demo-2", "fails to cover two (FR-3.2)", () => { Assert.assertTrue(false); });`,
      `xaravelTest("XT-demo-3", "skips three (AD-15.1)", () => { Assert.markTestSkipped("not here"); });`,
    ].join("\n");
    const dir = makeRoot({ "conformance/xaravel-consequences/demo.jsonl": consequenceFile, [XT_FILE]: xtFile(body) });
    const partial = await runCoverage(["demo", "--root", dir], (at, options) => runHarness(at, { ...options, env: env() }));
    expect(partial.out).toEqual(["UNCOVERED FR-3.2: two", "UNCOVERED AD-15.1: three", "XT-COVERAGE demo consequences=3 covered=1 uncovered=2"]);
    expect(partial.code).toBe(1);
    // A cited ID the file does not hold is a warning on stderr, never a covered line.
    expect(partial.err.filter((line) => line.startsWith("xt:coverage: "))).toEqual(["xt:coverage: warning: XT-demo-1 declares FR-99.1, which is not in conformance/xaravel-consequences/demo.jsonl"]);
    // The same through the real CLI.
    const cli = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "tools", "xt-coverage", "coverage.ts"), "demo", "--root", dir], { env: env() as Record<string, string>, stdout: "pipe", stderr: "pipe" });
    expect(cli.exitCode).toBe(1);
    expect(cli.stdout.toString()).toBe(`${partial.out.join("\n")}\n`);
    expect(cli.stderr.toString()).toContain("xt:coverage: warning: XT-demo-1 declares FR-99.1, which is not in conformance/xaravel-consequences/demo.jsonl\n");

    writeFileSync(
      join(dir, XT_FILE),
      xtFile([`xaravelTest("XT-demo-1", "covers (FR-3.1, FR-3.2)", () => { Assert.assertTrue(true); });`, `xaravelTest("XT-demo-2", "covers (AD-15.1)", () => {});`].join("\n")),
    );
    const full = await runCoverage(["demo", "--root", dir], (at, options) => runHarness(at, { ...options, env: env() }));
    expect(full.out).toEqual(["XT-COVERAGE demo consequences=3 covered=3 uncovered=0"]);
    expect(full.code).toBe(0);

    // An unknown Component, and usage errors.
    const unknown = await runCoverage(["nope", "--root", dir]);
    expect(unknown).toEqual({ code: 1, out: [], err: ["xt:coverage: conformance/xaravel-consequences/nope.jsonl does not exist"] });
    expect((await runCoverage([])).code).toBe(2);
    expect((await runCoverage(["a", "b"])).code).toBe(2);
    expect((await runCoverage(["Not A Component"])).code).toBe(2);
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// Story fixture root and fake GitHub

const HASH = "0".repeat(64);
const CLASS = "Illuminate\\Tests\\Support\\SupportDoneTest";
const A = `${CLASS}::testA`;
const B = `${CLASS}::testB`;
const C = `${CLASS}::testC`;
const D = `${CLASS}::testD`;
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportDoneTest.jsonl";
const PORTED = "packages/support/tests/ported/Support/SupportDoneTest.test.ts";

function manifest(storyId: string, testIds: readonly string[], xaravelTestIds: readonly string[]): string {
  const list = (name: string, ids: readonly string[]): string => (ids.length === 0 ? `${name}: []\n` : `${name}:\n${ids.map((id) => `  - ${JSON.stringify(id)}`).join("\n")}\n`);
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: support\nstatus: in-progress\n${list("test_ids", testIds)}${list("xaravel_test_ids", xaravelTestIds)}---\n\n# Story ${storyId}\n`;
}

function inventoryLine(id: string, oracle: Record<string, string>, index: number): string {
  return `${JSON.stringify({ id, component: "support", kind: "unit", backends: ["none"], source: `framework/tests/Support/SupportDoneTest.php:${index + 1}-${index + 2}`, hash: HASH, assertions: { assertTrue: 1 }, oracle })}\n`;
}

function expectation(id: string, status: string, reason: string | null = null, escalation: string | null = null, variant = "none"): string {
  return `${JSON.stringify({ id, variant, status, reason, adapted: null, escalation })}\n`;
}

/** The repository files the Skip Reason rules read (tools/expectations/reasons.ts `contextFor`). */
function reasonFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of ["conformance/deferred-items", "conformance/non-goals", "tools/scaffold/packages.jsonl"]) {
    files[file] = readFileSync(join(root, file), "utf8");
  }
  return files;
}

function keyPair(): { pub: KeyObject; priv: KeyObject } {
  const pair = generateKeyPairSync("ed25519");
  return { pub: pair.publicKey, priv: pair.privateKey };
}

/** The Story root's `epics.md`: Story 9.1 has no `api-surface:gate` acceptance criterion. */
const STORY_EPICS = "# Epics\n\n### Story 9.1: Done\n\n**Then** it is done.\n";

/** A Story root: Story 9.1 owns A (pass), B (upstream-skip) and XT-demo-1, and the Oracle files the fixtures clause reads. */
function storyRoot(files: Record<string, string> = {}): string {
  const { pub } = keyPair();
  const other = makeRequest(`${CLASS}::testOther`, "php-expr", { bindings: {}, setup: [], exprs: ["1"] });
  return makeRoot({
    ...reasonFiles(),
    "stories/9.1.md": manifest("9.1", [A, B], ["XT-demo-1"]),
    "conformance/inventory/support.jsonl": [inventoryLine(A, { none: "pass" }, 0), inventoryLine(B, { none: "skip" }, 1), inventoryLine(C, { none: "pass" }, 2), inventoryLine(D, { none: "pass" }, 3)].join(""),
    [SHARD]: [expectation(A, "pass"), expectation(B, "skip", "upstream-skip"), expectation(C, "skip", "not-ported-yet"), expectation(D, "fail-known")].join(""),
    [PORTED]: [`import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`, `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`, `portedTest(${JSON.stringify(D)}, {}, () => { Assert.assertTrue(false); });`].join("\n"),
    [XT_FILE]: xtFile([`xaravelTest("XT-demo-1", "passes (FR-115.1)", () => { Assert.assertTrue(true); });`, `xaravelTest("XT-demo-2", "fails (FR-115.1)", () => { Assert.assertTrue(false); });`].join("\n")),
    [SCHEMA_FILE]: readFileSync(join(root, SCHEMA_FILE), "utf8"),
    [EPICS]: STORY_EPICS,
    [`${REQUESTS_DIR}/support.jsonl`]: renderRequests([{ component: "support", request: other }]).get("support")!,
    "conformance/oracle/oracle.pub": pub.export({ type: "spki", format: "pem" }).toString(),
    ...files,
  });
}

interface FakeGitHub {
  pulls: { number: number; updated_at: string; user: { login: string }; head: { sha: string; ref: string } }[];
  runs: Record<string, { id: number; name: string; created_at: string }[]>;
  jobs: Record<number, { id: number; name: string; conclusion?: string | null }[]>;
  logs: Record<number, string>;
}

/** Serves `fake` as the GitHub API of `acme/xaravel` while `body` runs; job logs answer through a redirect, as GitHub's do. */
async function withGitHub<T>(fake: FakeGitHub, body: (api: string, paths: string[]) => Promise<T>): Promise<T> {
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      paths.push(`${url.pathname}${url.search}`);
      if (url.pathname.startsWith("/raw/")) {
        return new Response(fake.logs[Number(url.pathname.slice("/raw/".length))] ?? "", { status: 200 });
      }
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/acme/xaravel";
      const path = url.pathname.slice(base.length);
      if (!url.pathname.startsWith(base)) {
        return new Response("not found", { status: 404 });
      }
      if (path === "/pulls") {
        const head = url.searchParams.get("head");
        return Response.json(fake.pulls.filter((pull) => `acme:${pull.head.ref}` === head));
      }
      let match = /^\/pulls\/(\d+)$/.exec(path);
      if (match !== null) {
        const pull = fake.pulls.find((entry) => entry.number === Number(match![1]));
        return pull === undefined ? new Response("not found", { status: 404 }) : Response.json(pull);
      }
      if (path === "/actions/runs") {
        return Response.json({ workflow_runs: fake.runs[url.searchParams.get("head_sha") ?? ""] ?? [] });
      }
      match = /^\/actions\/runs\/(\d+)\/jobs$/.exec(path);
      if (match !== null) {
        return Response.json({ jobs: fake.jobs[Number(match[1])] ?? [] });
      }
      match = /^\/actions\/jobs\/(\d+)\/logs$/.exec(path);
      if (match !== null) {
        return new Response(null, { status: 302, headers: { Location: `/raw/${match[1]}` } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    return await body(`http://localhost:${server.port}`, paths);
  } finally {
    await server.stop(true);
  }
}

const SHA = "a".repeat(40);
// The PR ratchet job's log: the `run --scope` step (SUMMARY, then RATCHET), then the `ratchet story` step (SUMMARY, its
// classified lines, then STORY). LOG_FULL's story step differed only by a warned pass; LOG_FAST's story step was fast.
const LOG_FULL = [
  "2026-10-19T10:00:00.0000000Z SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0 mode=fast seed=ab",
  "2026-10-19T10:01:00.1234567Z SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0",
  "2026-10-19T10:01:01.0000000Z RATCHET ref=story/9.1 scope=components failures=0 passes=0 warnings=0",
  "2026-10-19T10:02:00.0000000Z SUMMARY variants=11 run=7 not-run=4 checked=2 differ=1",
  "2026-10-19T10:02:00.1000000Z WARNING UNEXPECTED-PASS X [none] expected=fail-known actual=pass asserts=1/1 (owned by no open Story)",
  "2026-10-19T10:02:00.2000000Z STORY ref=story/9.1 failures=0 passes=0 warnings=1",
  "",
].join("\n");
const LOG_FAST = [
  "2026-10-19T10:01:00.1234567Z SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0",
  "2026-10-19T10:01:01.0000000Z RATCHET ref=story/9.1 scope=full failures=0 passes=0 warnings=0",
  "2026-10-19T10:02:00.0000000Z SUMMARY variants=1 run=1 not-run=0 checked=100 differ=0 mode=fast seed=0f0f0f0f",
  "2026-10-19T10:02:00.1000000Z STORY ref=story/9.1 failures=0 passes=0 warnings=0",
].join("\n");

function fakeGitHub(overrides: Partial<FakeGitHub> = {}): FakeGitHub {
  return {
    pulls: [
      { number: 3, updated_at: "2026-10-18T09:00:00Z", user: { login: "agent" }, head: { sha: "b".repeat(40), ref: "story/9.1" } },
      { number: 7, updated_at: "2026-10-19T09:00:00Z", user: { login: "agent" }, head: { sha: SHA, ref: "story/9.1" } },
    ],
    runs: {
      [SHA]: [
        { id: 11, name: "ratchet", created_at: "2026-10-19T08:00:00Z" },
        { id: 12, name: "ratchet", created_at: "2026-10-19T10:00:00Z" },
        { id: 13, name: "ci", created_at: "2026-10-19T11:00:00Z" },
      ],
    },
    jobs: { 11: [{ id: 91, name: "ratchet", conclusion: "success" }], 12: [{ id: 98, name: "other", conclusion: "success" }, { id: 99, name: "ratchet", conclusion: "success" }] },
    logs: { 91: LOG_FAST, 99: LOG_FULL },
    ...overrides,
  };
}

const SPEC = "_bmad-output/implementation-artifacts/spec-9-1-done.md";
const ITEMS = parseChecklist(readFileSync(join(root, CHECKLIST_FILE), "utf8"));

/** Commits everything in `dir` (a fixture root made by makeRoot). */
function commitAll(dir: string, message = "fixture"): void {
  for (const args of [["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message]]) {
    const result = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
    expect([args[0], result.exitCode, result.stderr.toString()]).toEqual([args[0], 0, ""]);
  }
}

/** A Fidelity Review verdict record: reviewer 1 on codex and reviewer 2 on claude for a claude loop, every item pass unless `fail` names one. */
function verdictRecord(reviewer: 1 | 2, tree: string, overrides: Partial<VerdictRecord> & { fail?: string } = {}): VerdictRecord {
  const { fail: failing, ...rest } = overrides;
  const cli: Cli = reviewer === 1 ? "codex" : "claude";
  const items = ITEMS.map((item) => (item.id === failing ? { id: item.id, result: "fail" as const, note: "weakened", findings: [{ path: "packages/support/src/Str.ts", detail: "assertSame became assertEquals" }] } : { id: item.id, result: "pass" as const, note: `checked ${item.id}`, findings: [] }));
  return { kind: RECORD_KIND, reviewer, verdict: failing === undefined ? "pass" : "reject", tree, base: "0".repeat(40), cli, model: `${cli}-test`, loop_cli: "claude", fallback: null, date: "2026-10-20T00:00:00.000Z", items, ...rest };
}

/** Writes the Story 9.1 spec into `dir` holding `records` under `## Fidelity Review` (`_bmad-output/`, so outside every reviewed tree). */
function writeSpec(dir: string, records: readonly VerdictRecord[], path = SPEC): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), appendRecords("---\ntitle: 'Story 9.1'\nbaseline_revision: 'HEAD'\nstatus: 'in-review'\n---\n\n# Story 9.1\n", records.map((record) => renderRecord(record, ITEMS))));
}

const ESCALATION = "---\ntest_ids:\n  - XT-demo-1\ntrigger: open-question\nproposed: >-\n  Decide.\nevidence: >-\n  None yet.\n---\n\n# ESC-9.1-1\n";

// ---------------------------------------------------------------------------
// XT-conformance-127 (AC2): `bun run story:check <story-id>`

xaravelTest(
  "XT-conformance-127",
  "bun run story:check <story-id> reports PASS or FAIL for each done clause (manifest, tests, xaravel-tests, fixtures, api-surface, approvals, escalations, full-run) and exits 1 when any fails; a manifest with no assigned tests fails; approvals pass only with two pass Fidelity Review verdicts recorded in the Story's spec for the head tree, one per reviewer slot, reviewer 1 cross-model or with its fallback reason, without GH_TOKEN (AD-15.8, FR-111.1, FR-111.2, FR-111.5, AD-16.5, AD-16.9; FR-114, FR-115, AD-28)",
  async () => {
    const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["story:check"];
    expect(script).toBe("bun --no-env-file tools/story-check/story-check.ts");
    expect([...CLAUSES]).toEqual(["manifest", "tests", "xaravel-tests", "fixtures", "api-surface", "approvals", "escalations", "full-run"]);

    // Every clause passes: the Story's own lines are done, its Xaravel Test passes, two pass Fidelity Review verdicts for
    // the head tree, no open Escalation, and the latest ratchet run's story step passed a full run (a warned difference allowed).
    const good = storyRoot();
    commitAll(good);
    const goodTree = reviewTree(good, "head");
    writeSpec(good, [verdictRecord(1, goodTree), verdictRecord(2, goodTree)]);
    const passing = await withGitHub(fakeGitHub(), (api) => runStoryCheck(["9.1", "--root", good], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(passing.out).toEqual([
      "PASS manifest: stories/9.1.md: 2 test_ids, 1 xaravel_test_ids",
      "PASS tests: 2 Test ID × Variant line(s) done",
      "PASS xaravel-tests: 1 Xaravel Test(s) pass",
      "PASS fixtures: no assigned Differential Test ID",
      "PASS api-surface: no api-surface:gate acceptance criterion",
      `PASS approvals: 2 pass verdicts for tree ${goodTree} (reviewer 1: codex/codex-test, reviewer 2: claude/claude-test)`,
      "PASS escalations: no Escalations",
      "PASS full-run: PR #7 ratchet run 12: SUMMARY variants=11 run=7 not-run=4 checked=2 differ=1; STORY ref=story/9.1 failures=0 passes=0 warnings=1",
      "STORY-CHECK 9.1 pass",
    ]);
    expect(passing.code).toBe(0);

    // Every clause fails.
    const bad = storyRoot({
      "stories/9.1.md": manifest("9.1", [A, B, C, D, `${CLASS}::testNoLine`], ["XT-demo-1", "XT-demo-2", "XT-demo-9"]),
      "conformance/escalations/ESC-9.1-1.md": ESCALATION,
    });
    commitAll(bad);
    const badTree = reviewTree(bad, "head");
    writeSpec(bad, [verdictRecord(1, badTree), verdictRecord(2, badTree, { fail: "F-2" })]);
    const failing = await withGitHub(fakeGitHub({ jobs: { 12: [{ id: 91, name: "ratchet", conclusion: "success" }] } }), (api) =>
      runStoryCheck(["9.1", "--root", bad, "--pr", "7"], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }),
    );
    expect(failing.out).toEqual([
      "PASS manifest: stories/9.1.md: 5 test_ids, 3 xaravel_test_ids",
      "FAIL tests: 3 problem(s) over 4 Test ID × Variant line(s)",
      `  ${C} [none]: skip:not-ported-yet never satisfies done`,
      `  ${D} [none]: fail-known is not done`,
      `  ${CLASS}::testNoLine: no Expectations line`,
      "FAIL xaravel-tests: 2 of 3 Xaravel Test(s) do not pass",
      "  XT-demo-2: fail",
      "  XT-demo-9: missing",
      "PASS fixtures: no assigned Differential Test ID",
      "PASS api-surface: no api-surface:gate acceptance criterion",
      `FAIL approvals: 1 of 2 pass verdicts for tree ${badTree}`,
      `  reviewer 1: pass at tree ${badTree}`,
      `  reviewer 2: reject at tree ${badTree}`,
      "FAIL escalations: 1 of 1 Escalation(s) open",
      "  ESC-9.1-1: open",
      "FAIL full-run: PR #7 ratchet run 12: SUMMARY variants=1 run=1 not-run=0 checked=100 differ=0 mode=fast seed=0f0f0f0f was a fast run",
      "STORY-CHECK 9.1 fail",
    ]);
    expect(failing.code).toBe(1);

    // A difference fails its line even when the status would do: B expects an upstream-skip, but its test now passes.
    const differs = storyRoot({
      [PORTED]: [`import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`, `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`, `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`].join("\n"),
    });
    const unexpected = await runStoryCheck(["9.1", "--root", differs], { env: env() });
    expect(unexpected.out[1]).toBe("FAIL tests: 1 problem(s) over 2 Test ID × Variant line(s)");
    expect(unexpected.out[2]).toBe(`  ${B} [none]: differs: UNEXPECTED-PASS ${B} [none] expected=skip:upstream-skip actual=pass asserts=1/1`);

    // A listed bare R covers its dataset rows R#<key> (ownership's covers): their lines are graded, and R itself is not
    // "no Expectations line"; an id that merely starts with R is not a row. A listed Z with neither line still is.
    const R = `${CLASS}::testR`;
    const rowRoot = storyRoot({
      "stories/9.1.md": manifest("9.1", [R, `${CLASS}::testZ`], []),
      "conformance/inventory/support.jsonl": [inventoryLine(`${R}#a`, { none: "pass" }, 0), inventoryLine(`${R}#b`, { none: "fail" }, 1), inventoryLine(`${R}y`, { none: "pass" }, 2)].join(""),
      [SHARD]: [expectation(`${R}#a`, "pass"), expectation(`${R}#b`, "fail-known"), expectation(`${R}y`, "fail-known")].join(""),
      [PORTED]: [`import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`, `portedTest(${JSON.stringify(`${R}#a`)}, {}, () => { Assert.assertTrue(true); });`, `portedTest(${JSON.stringify(`${R}#b`)}, {}, () => { Assert.assertTrue(false); });`].join("\n"),
    });
    const rows = await runStoryCheck(["9.1", "--root", rowRoot], { env: env() });
    expect(rows.out.slice(1, 4)).toEqual(["FAIL tests: 2 problem(s) over 2 Test ID × Variant line(s)", `  ${R}#b [none]: fail-known is not done`, `  ${CLASS}::testZ: no Expectations line`]);
    expect(rows.code).toBe(1);

    // A manifest with no assigned tests fails, and so does every clause that needs it; with no spec approvals cannot
    // check, and with no GH_TOKEN full-run fails; neither passes silently.
    const empty = storyRoot({ "stories/9.1.md": manifest("9.1", [], []) });
    const none = await runStoryCheck(["9.1", "--root", empty], { env: env() });
    expect(none.out).toEqual([
      "FAIL manifest: stories/9.1.md is invalid",
      "  invalid manifest: stories/9.1.md: test_ids/xaravel_test_ids are both absent or empty; a Story with no assigned tests can't be done (AD-16)",
      "FAIL tests: cannot check: stories/9.1.md is missing or invalid",
      "FAIL xaravel-tests: cannot check: stories/9.1.md is missing or invalid",
      "FAIL fixtures: cannot check: stories/9.1.md is missing or invalid",
      "FAIL api-surface: cannot check: stories/9.1.md is missing or invalid",
      "FAIL approvals: cannot check: no spec matches _bmad-output/implementation-artifacts/spec-9-1-*.md",
      "PASS escalations: no Escalations",
      "FAIL full-run: cannot check: GH_TOKEN is not set",
      "STORY-CHECK 9.1 fail",
    ]);
    expect(none.code).toBe(1);
    const absent = await runStoryCheck(["9.2", "--root", empty], { env: env() });
    expect(absent.out[0]).toBe("FAIL manifest: stories/9.2.md does not exist");

    // No test_ids: the tests clause passes as none assigned (and the harness is not asked for a --story run).
    const xtOnly = storyRoot({ "stories/9.1.md": manifest("9.1", [], ["XT-demo-1"]) });
    const asked: unknown[] = [];
    const onlyXt = await runStoryCheck(["9.1", "--root", xtOnly], {
      env: env(),
      harness: (at, options) => {
        asked.push(options.story ?? options.xaravel);
        return runHarness(at, options);
      },
    });
    expect(onlyXt.out.slice(0, 3)).toEqual(["PASS manifest: stories/9.1.md: 0 test_ids, 1 xaravel_test_ids", "PASS tests: none assigned", "PASS xaravel-tests: 1 Xaravel Test(s) pass"]);
    expect(asked).toEqual([{ only: true, ids: ["XT-demo-1"] }]);

    // The PR: the most recently updated with head story/<id>; none is a failure, not a pass.
    const noPr = await withGitHub(fakeGitHub({ pulls: [] }), (api) => runStoryCheck(["9.1", "--root", empty], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(noPr.out.filter((line) => line.includes("full-run:"))).toEqual(["FAIL full-run: no pull request in acme/xaravel has head story/9.1"]);
    const noRun = await withGitHub(fakeGitHub({ runs: {} }), (api) => runStoryCheck(["9.1", "--root", empty], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(noRun.out.find((line) => line.includes("full-run:"))).toBe(`FAIL full-run: PR #7: no ratchet workflow run for ${SHA}`);
    // A --pr whose head is not story/<id> is not this Story's PR.
    const otherPulls = [{ number: 8, updated_at: "2026-10-19T09:00:00Z", user: { login: "agent" }, head: { sha: SHA, ref: "story/9.2" } }];
    const mismatch = await withGitHub(fakeGitHub({ pulls: otherPulls }), (api) => runStoryCheck(["9.1", "--root", empty, "--pr", "8"], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(mismatch.out.filter((line) => line.includes("full-run:"))).toEqual(["FAIL full-run: PR #8's head is story/9.2, not story/9.1"]);

    // A Variant whose backend is not running is NOT-RUN, which never satisfies done.
    const pg = storyRoot({
      "conformance/inventory/support.jsonl": [`${JSON.stringify({ id: A, component: "support", kind: "unit", backends: ["pgsql"], source: "framework/tests/Support/SupportDoneTest.php:1-2", hash: HASH, assertions: { assertTrue: 1 }, oracle: { pgsql: "pass" } })}\n`, inventoryLine(B, { none: "skip" }, 1)].join(""),
      [SHARD]: [expectation(A, "pass", null, null, "pgsql"), expectation(B, "skip", "upstream-skip")].join(""),
    });
    const notRun = await runStoryCheck(["9.1", "--root", pg], { env: env({ PGHOST: "127.0.0.1", PGPORT: "1" }) });
    expect(notRun.out.slice(1, 3)).toEqual(["FAIL tests: 1 problem(s) over 2 Test ID × Variant line(s)", `  ${A} [pgsql]: NOT-RUN`]);

    // An Escalation with an approved decision bound to its text is not open.
    const ruled = storyRoot({
      "conformance/escalations/ESC-9.1-1.md": ESCALATION,
      "decisions/ESC-9.1-1.md": `---\ndecision: approved\ndecided_by: maintainer\ndate: 2026-10-19\nescalation_sha256: "${createHash("sha256").update(ESCALATION).digest("hex")}"\n---\n\n# ESC-9.1-1: approved\n\nRationale: decided.\n`,
    });
    const decided = await runStoryCheck(["9.1", "--root", ruled], { env: env() });
    expect(decided.out).toContain("PASS escalations: 1 Escalation(s), none open");

    const apiDown = await withGitHub(fakeGitHub(), (api) => runStoryCheck(["9.1", "--root", empty], { env: env({ GH_TOKEN: "wrong", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(apiDown.out.filter((line) => line.includes("full-run:"))).toHaveLength(1);
    expect(apiDown.out.filter((line) => line.includes("full-run:")).every((line) => line.startsWith("FAIL ") && line.includes("HTTP 401"))).toBe(true);

    // A ratchet job that concluded failure fails full-run even when its story step's verdict passed.
    const failedJob = await withGitHub(fakeGitHub({ jobs: { 12: [{ id: 99, name: "ratchet", conclusion: "failure" }] } }), (api) =>
      runStoryCheck(["9.1", "--root", good], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }),
    );
    expect(failedJob.out).toContain("FAIL full-run: PR #7 ratchet run 12: the ratchet job concluded failure, not success");
    expect(failedJob.out.at(-1)).toBe("STORY-CHECK 9.1 fail");
    expect(failedJob.code).toBe(1);
    // A ratchet job that has not finished (conclusion null or absent) fails full-run without its log being fetched.
    for (const job of [{ id: 99, name: "ratchet", conclusion: null }, { id: 99, name: "ratchet" }]) {
      const [unfinished, requested] = await withGitHub(fakeGitHub({ jobs: { 12: [job] } }), async (api, paths) => [
        await runStoryCheck(["9.1", "--root", good], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }),
        paths,
      ] as const);
      expect(unfinished.out).toContain("FAIL full-run: PR #7 ratchet run 12: the ratchet job has not finished");
      expect(unfinished.code).toBe(1);
      expect(requested.filter((path) => path.includes("/actions/jobs/99/logs"))).toEqual([]);
    }

    // api-surface (Epic 6 retro S4, Maintainer ruling on item 8): a manifest whose Story's acceptance criteria say
    // "`api-surface:gate <c>` passes" carries api_surface_gate: <c>, and story:check runs the gate for <c> from the root,
    // with no GitHub token in its env.
    const gateEpics = `${STORY_EPICS}\n**And** \`api-surface:gate contracts\` passes and the docs are written.\n`;
    const gateLine = gateEpics.split("\n").length - 1;
    const gated = (gate: string | null): string => manifest("9.1", [], ["XT-demo-1"]).replace("component: support\n", gate === null ? "component: support\n" : `component: support\napi_surface_gate: ${gate}\n`);
    const gateRoot = storyRoot({ "stories/9.1.md": gated("contracts"), [EPICS]: gateEpics });
    const gateCalls: unknown[] = [];
    const gatePassed = await runStoryCheck(["9.1", "--root", gateRoot], {
      env: env({ GH_TOKEN: "secret" }),
      apiSurfaceGate: (at, component, gateEnv) => {
        gateCalls.push([at, component, gateEnv["GH_TOKEN"], gateEnv["GITHUB_TOKEN"]]);
        return { code: 0, stdout: "api-surface:gate contracts: 0 unexplained (AD-15)\n", stderr: "" };
      },
    });
    const apiSurfaceLine = (out: readonly string[]) => out.find((line) => / api-surface: /.test(line) && /^(PASS|FAIL) /.test(line));
    expect(apiSurfaceLine(gatePassed.out)).toBe("PASS api-surface: api-surface:gate contracts: 0 unexplained");
    expect(gateCalls).toEqual([[gateRoot, "contracts", undefined, undefined]]);
    // epics.md missing fails closed.
    rmSync(join(gateRoot, EPICS));
    const noEpics = await runStoryCheck(["9.1", "--root", gateRoot], { env: env(), apiSurfaceGate: () => ({ error: "never asked" }) });
    expect(apiSurfaceLine(noEpics.out)).toBe(`FAIL api-surface: cannot check: ${EPICS} does not exist`);
    expect(noEpics.code).toBe(1);

    // The pure clause, over each gate outcome; the gate is asked only when the manifest agrees with epics.md.
    const criteria = [{ storyId: "9.1", component: "contracts", line: gateLine }];
    const parsedGated = (gate: string | null) => parseManifest("stories/9.1.md", gated(gate)).manifest!;
    const gateAsked: string[] = [];
    const clause = (gate: string | null, run: GateRun, against = criteria) =>
      renderClause(
        apiSurfaceClause(parsedGated(gate), against, (component) => {
          gateAsked.push(component);
          return run;
        }),
      );
    const unexplained = [
      "contracts: missing class Illuminate\\Contracts\\Auth\\Guard",
      "api-surface:gate contracts: 1 unexplained (AD-15)",
      "api-surface:gate citation problem: conformance/api-surface/exceptions.jsonl:3: lines are not sorted",
      "api-surface:gate citations: 1 problem(s) (AD-15)",
      "",
    ].join("\n");
    expect(clause("contracts", { code: 1, stdout: unexplained, stderr: "" })).toEqual([
      "FAIL api-surface: api-surface:gate contracts: 1 unexplained; api-surface:gate citations: 1 problem(s)",
      "  contracts: missing class Illuminate\\Contracts\\Auth\\Guard",
      "  api-surface:gate citation problem: conformance/api-surface/exceptions.jsonl:3: lines are not sorted",
    ]);
    // A tool failure (exit 1 with no count line), a usage error (exit 2), a signal or a spawn error: cannot check.
    expect(clause("contracts", { code: 1, stdout: "", stderr: "api-surface: tsc -b failed\n" })).toEqual(["FAIL api-surface: cannot check: api-surface:gate contracts exited 1", "  api-surface: tsc -b failed"]);
    expect(clause("contracts", { code: 2, stdout: "", stderr: "api-surface: unknown component contracts\n" })).toEqual([
      "FAIL api-surface: cannot check: api-surface:gate contracts exited 2",
      "  api-surface: unknown component contracts",
    ]);
    expect(clause("contracts", { code: null, stdout: "", stderr: "" })).toEqual(["FAIL api-surface: cannot check: api-surface:gate contracts exited on a signal"]);
    expect(clause("contracts", { code: 0, stdout: "", stderr: "" })).toEqual(["FAIL api-surface: cannot check: api-surface:gate contracts exited 0"]);
    expect(clause("contracts", { error: "spawn ENOENT" })).toEqual(["FAIL api-surface: cannot check: api-surface:gate contracts: spawn ENOENT"]);
    // Exit 1 after a zero count with no citations line is a tool failure (checkCitations threw): cannot check.
    expect(clause("contracts", { code: 1, stdout: "api-surface:gate contracts: 0 unexplained (AD-15)\n", stderr: "api-surface: schema.json: ENOENT\n" })).toEqual([
      "FAIL api-surface: cannot check: api-surface:gate contracts exited 1",
      "  api-surface: schema.json: ENOENT",
    ]);
    // A verdict with only citation problems fails on them, and stderr lines follow the items.
    expect(clause("contracts", { code: 1, stdout: "api-surface:gate contracts: 0 unexplained (AD-15)\napi-surface:gate citation problem: p\napi-surface:gate citations: 1 problem(s) (AD-15)\n", stderr: "warning: w\n" })).toEqual([
      "FAIL api-surface: api-surface:gate contracts: 0 unexplained; api-surface:gate citations: 1 problem(s)",
      "  api-surface:gate citation problem: p",
      "  warning: w",
    ]);
    expect(gateAsked).toEqual(["contracts", "contracts", "contracts", "contracts", "contracts", "contracts", "contracts", "contracts"]);
    // The default runner runs the real gate subprocess with --gate and --root: against the api-surface demo fixture it
    // reports the fixture's 7 unexplained items.
    const demo = mkdtempSync(join(tmpdir(), "xt-done-check-api-surface-"));
    roots.push(demo);
    const fixtures = join(root, "tools", "api-surface", "fixtures");
    cpSync(join(fixtures, "demo"), join(demo, "packages", "demo"), { recursive: true });
    mkdirSync(join(demo, "conformance", "api-surface"), { recursive: true });
    mkdirSync(join(demo, "conformance", "scans"), { recursive: true });
    for (const name of ["demo.jsonl", "additions.jsonl", "exceptions.jsonl"]) {
      cpSync(join(fixtures, name), join(demo, "conformance", "api-surface", name));
    }
    cpSync(join(root, "conformance", "api-surface", "schema.json"), join(demo, "conformance", "api-surface", "schema.json"));
    cpSync(join(fixtures, "div12-pairs.jsonl"), join(demo, "conformance", "scans", "div12-pairs.jsonl"));
    const demoManifest = parseManifest("stories/9.1.md", manifest("9.1", [], ["XT-demo-1"]).replace("component: support\n", "component: support\napi_surface_gate: demo\n")).manifest!;
    const real = renderClause(apiSurfaceClause(demoManifest, [{ storyId: "9.1", component: "demo", line: 1 }], (component) => runApiSurfaceGate(demo, component, env())));
    expect(real[0]).toBe("FAIL api-surface: api-surface:gate demo: 7 unexplained");
    expect(real).toHaveLength(8);
    // The field missing or different, a field with no criterion, two components: the cross-check's item, no gate run.
    const never: GateRun = { error: "never asked" };
    expect(clause(null, never)).toEqual([
      "FAIL api-surface: stories/9.1.md does not match its api-surface:gate acceptance criteria",
      `  api-surface gate: stories/9.1.md must carry api_surface_gate: contracts (epics.md:${gateLine} says \`api-surface:gate contracts\` passes), got no api_surface_gate (AD-15)`,
    ]);
    expect(clause("config", never)[1]).toBe(`  api-surface gate: stories/9.1.md must carry api_surface_gate: contracts (epics.md:${gateLine} says \`api-surface:gate contracts\` passes), got api_surface_gate: config (AD-15)`);
    expect(clause("config", never, [])[1]).toBe("  api-surface gate: stories/9.1.md carries api_surface_gate: config but epics.md has no `api-surface:gate config` passes acceptance criterion for Story 9.1 (AD-15)");
    expect(clause("contracts", never, [...criteria, { storyId: "9.1", component: "config", line: gateLine + 1 }])[1]).toContain("api-surface gate: Story 9.1 has api-surface:gate acceptance criteria for 2 components");
    // Another Story's criterion is not this Story's; no criterion and no field passes without a gate run.
    expect(clause(null, never, [{ storyId: "9.2", component: "config", line: 1 }])).toEqual(["PASS api-surface: no api-surface:gate acceptance criterion"]);
    expect(gateAsked).toHaveLength(8);

    // approvals needs no GH_TOKEN: the passing root's verdicts pass with none, while full-run cannot check.
    const tokenless = await runStoryCheck(["9.1", "--root", good], { env: env() });
    expect(tokenless.out).toContain(`PASS approvals: 2 pass verdicts for tree ${goodTree} (reviewer 1: codex/codex-test, reviewer 2: claude/claude-test)`);
    expect(tokenless.out).toContain("FAIL full-run: cannot check: GH_TOKEN is not set");

    // The approvals clause over verdict records in a committed root.
    const vroot = makeRoot({ "packages/support/src/Str.ts": "export const a = 1;\n" });
    commitAll(vroot);
    const vtree = reviewTree(vroot, "head");
    const approvals = (records: readonly VerdictRecord[]): string[] => {
      writeSpec(vroot, records);
      return renderClause(approvalsClause(vroot, "9.1"));
    };
    const passLine = `PASS approvals: 2 pass verdicts for tree ${vtree} (reviewer 1: codex/codex-test, reviewer 2: claude/claude-test)`;
    expect(approvals([verdictRecord(1, vtree), verdictRecord(2, vtree)])).toEqual([passLine]);
    // A reject in either slot fails, naming it.
    expect(approvals([verdictRecord(1, vtree, { fail: "F-3" }), verdictRecord(2, vtree)])).toEqual([`FAIL approvals: 1 of 2 pass verdicts for tree ${vtree}`, `  reviewer 1: reject at tree ${vtree}`, `  reviewer 2: pass at tree ${vtree}`]);
    // Per slot the last record for the tree counts, and a later reject replaces a pass; but a reject on the tree stands,
    // so a later pass in its slot on the same tree never replaces it (ESC-8.8-1).
    expect(approvals([verdictRecord(1, vtree), verdictRecord(2, vtree), verdictRecord(2, vtree, { fail: "F-1" })])[0]).toBe(`FAIL approvals: 1 of 2 pass verdicts for tree ${vtree}`);
    const reRolled = approvals([verdictRecord(1, vtree, { fail: "F-1" }), verdictRecord(2, vtree), verdictRecord(1, vtree)]);
    expect(reRolled.slice(0, 3)).toEqual([`FAIL approvals: 1 of 2 pass verdicts for tree ${vtree}`, `  reviewer 1: reject at tree ${vtree}`, `  reviewer 2: pass at tree ${vtree}`]);
    expect(reRolled[3]).toMatch(new RegExp(`^ {2}reviewer 1: the later pass at tree ${vtree} \\(record at line \\d+\\) does not count: the reject at line \\d+ stands until the reviewed tree changes \\(ESC-8\\.8-1\\)$`));
    expect(reRolled).toHaveLength(4);
    // A pass after a reject in the other slot still counts for its own slot.
    expect(approvals([verdictRecord(2, vtree, { fail: "F-1" }), verdictRecord(1, vtree), verdictRecord(2, vtree)])[1]).toBe(`  reviewer 1: pass at tree ${vtree}`);
    // Two passes from the same slot are one verdict, never two.
    expect(approvals([verdictRecord(1, vtree), verdictRecord(1, vtree, { cli: "claude", model: "claude-test", fallback: "codex unavailable: usage limit: x" })])).toEqual([
      `FAIL approvals: 1 of 2 pass verdicts for tree ${vtree}`,
      `  reviewer 1: pass at tree ${vtree}`,
      `  reviewer 2: none for tree ${vtree}`,
    ]);
    // Same CLI twice with no fallback reason fails the cross-model rule; with the reason recorded it passes.
    const sameCli = { cli: "claude" as const, model: "claude-test" };
    expect(approvals([verdictRecord(1, vtree, sameCli), verdictRecord(2, vtree)])).toEqual([
      `FAIL approvals: 2 of 2 pass verdicts for tree ${vtree}, but the cross-model rule fails`,
      `  reviewer 1: pass at tree ${vtree}`,
      `  reviewer 2: pass at tree ${vtree}`,
      "  reviewer 1 ran on claude, the loop's own CLI, and recorded no fallback reason; it must run on the other CLI when that is available (ESC-8.5-1)",
    ]);
    expect(approvals([verdictRecord(1, vtree, { ...sameCli, fallback: "codex unavailable: not installed: codex: not found" }), verdictRecord(2, vtree)])).toEqual([`PASS approvals: 2 pass verdicts for tree ${vtree} (reviewer 1: claude/claude-test, reviewer 2: claude/claude-test)`]);
    // A malformed record fails the clause, naming it.
    writeSpec(vroot, [verdictRecord(1, vtree), verdictRecord(2, vtree)]);
    const tampered = readFileSync(join(vroot, SPEC), "utf8").replace(`"reviewer":2,"verdict":"pass"`, `"reviewer":2,"verdict":"maybe"`);
    writeFileSync(join(vroot, SPEC), tampered);
    const malformed = renderClause(approvalsClause(vroot, "9.1"));
    expect(malformed[0]).toBe("FAIL approvals: 1 malformed Fidelity Review record(s)");
    expect(malformed[1]).toMatch(/^ {2}record at line \d+ verdict "maybe" is not pass or reject$/);
    // A pass verdict whose items fail is malformed too.
    expect(approvals([verdictRecord(1, vtree), { ...verdictRecord(2, vtree, { fail: "F-2" }), verdict: "pass" }])[0]).toBe("FAIL approvals: 1 malformed Fidelity Review record(s)");

    // Bookkeeping under _bmad-output/ (the spec, sprint status) committed afterwards keeps the head tree: still a pass.
    writeSpec(vroot, [verdictRecord(1, vtree), verdictRecord(2, vtree)]);
    writeFileSync(join(vroot, "_bmad-output/implementation-artifacts/sprint-status.yaml"), "development_status:\n  9-1-done: done\n");
    commitAll(vroot, "bookkeeping");
    expect(reviewTree(vroot, "head")).toBe(vtree);
    expect(renderClause(approvalsClause(vroot, "9.1"))).toEqual([passLine]);
    // A reviewed file changed and committed afterwards is a new head tree: the verdicts are stale and do not count.
    writeFileSync(join(vroot, "packages/support/src/Str.ts"), "export const a = 2;\n");
    commitAll(vroot, "change");
    const newTree = reviewTree(vroot, "head");
    expect(newTree).not.toBe(vtree);
    expect(renderClause(approvalsClause(vroot, "9.1"))).toEqual([`FAIL approvals: 0 of 2 pass verdicts for tree ${newTree}`, `  reviewer 1: none for tree ${newTree}`, `  reviewer 2: none for tree ${newTree}`]);

    // No spec, two specs, and no head commit: cannot check.
    const nospec = makeRoot({ "a.txt": "a\n" });
    commitAll(nospec);
    expect(renderClause(approvalsClause(nospec, "9.1"))).toEqual(["FAIL approvals: cannot check: no spec matches _bmad-output/implementation-artifacts/spec-9-1-*.md"]);
    writeSpec(nospec, []);
    writeSpec(nospec, [], "_bmad-output/implementation-artifacts/spec-9-1-other.md");
    expect(renderClause(approvalsClause(nospec, "9.1"))).toEqual([
      "FAIL approvals: cannot check: 2 specs match _bmad-output/implementation-artifacts/spec-9-1-*.md: _bmad-output/implementation-artifacts/spec-9-1-done.md, _bmad-output/implementation-artifacts/spec-9-1-other.md; keep exactly one spec-9-1-*.md",
    ]);
    // Another Story's spec (spec-9-10-…) is not Story 9.1's.
    const tenth = makeRoot({ "a.txt": "a\n" });
    commitAll(tenth);
    writeSpec(tenth, [], "_bmad-output/implementation-artifacts/spec-9-10-other.md");
    expect(renderClause(approvalsClause(tenth, "9.1"))[0]).toBe("FAIL approvals: cannot check: no spec matches _bmad-output/implementation-artifacts/spec-9-1-*.md");
    const uncommitted = makeRoot({ "a.txt": "a\n" });
    writeSpec(uncommitted, []);
    expect(renderClause(approvalsClause(uncommitted, "9.1"))[0]).toStartWith("FAIL approvals: cannot check: no head tree: ");
    // full-run reads the ratchet story step's verdict (ESC-5.9-2): a story SUMMARY that differed only by warnings passes;
    // a failure or an own unexpected pass fails.
    const scopeStep = "SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0\nRATCHET ref=story/9.1 scope=components failures=0 passes=0 warnings=0\n";
    const storySummary = "SUMMARY variants=11 run=7 not-run=4 checked=3 differ=2";
    const storyLog = (verdict: string): string => `${scopeStep}${storySummary}\n${verdict}\n`;
    expect(fullRunClause("w", "success", storyLog("STORY ref=story/9.1 failures=0 passes=0 warnings=2"))).toEqual({ clause: "full-run", pass: true, detail: `w: ${storySummary}; STORY ref=story/9.1 failures=0 passes=0 warnings=2`, items: [] });
    for (const verdict of ["STORY ref=story/9.1 failures=1 passes=0 warnings=1", "STORY ref=story/9.1 failures=0 passes=1 warnings=1"]) {
      expect(fullRunClause("w", "success", storyLog(verdict))).toEqual({ clause: "full-run", pass: false, detail: `w: ${verdict} failed`, items: [] });
    }
    // A Story with no test_ids has nothing of its own to run: it passes.
    expect(fullRunClause("w", "success", `${scopeStep}STORY ref=story/10.1 skipped: no test_ids\n`)).toEqual({ clause: "full-run", pass: true, detail: "w: STORY ref=story/10.1 skipped: no test_ids", items: [] });
    // Fail closed: only the scope run's SUMMARY (no STORY line), a skipped non-Story ref, a malformed verdict.
    expect(fullRunClause("w", "success", scopeStep)).toEqual({ clause: "full-run", pass: false, detail: "w: the log has no STORY line from the ratchet story step", items: [] });
    for (const story of ["STORY ref=planning/x skipped: not a Story ref", "STORY ref=story/9.1 failures=0 passes=0", "STORY ref=story/9.1 failures=x passes=0 warnings=0"]) {
      expect(fullRunClause("w", "success", `${scopeStep}${storySummary}\n${story}\n`)).toEqual({ clause: "full-run", pass: false, detail: `w: ${story} is not a Story verdict`, items: [] });
    }
    // The story step's SUMMARY is the one after the scope step's RATCHET line: none there fails, even when the scope
    // step (or nothing, with scope=none) printed one before it.
    for (const log of [`${scopeStep}STORY ref=story/9.1 failures=0 passes=0 warnings=0\n`, "RATCHET ref=story/9.1 scope=none failures=0 passes=0 warnings=0\nSTORY ref=story/9.1 failures=0 passes=0 warnings=0\n"]) {
      expect(fullRunClause("w", "success", log)).toEqual({ clause: "full-run", pass: false, detail: "w: the ratchet story step printed no SUMMARY line", items: [] });
    }
    // A fast story SUMMARY fails.
    expect(fullRunClause("w", "success", `${scopeStep}SUMMARY variants=1 run=1 not-run=0 checked=3 differ=0 mode=fast seed=ab\nSTORY ref=story/9.1 failures=0 passes=0 warnings=0\n`).detail).toBe("w: SUMMARY variants=1 run=1 not-run=0 checked=3 differ=0 mode=fast seed=ab was a fast run");
    // A run-level ERROR line fails tests and xaravel-tests even when every line came out right.
    const crashed: HarnessResult = {
      code: 1,
      out: ["ERROR [none] bun test exited 1 with no failing testcase", "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1"],
      err: [],
      results: [{ id: A, variant: "none", outcome: "pass", belowFloor: false, performed: 1, upstream: 1 }],
      differences: [{ id: "-", variant: "none", kind: "unexpected-failure", text: "ERROR [none] bun test exited 1 with no failing testcase", detail: null }],
      sample: null,
      worktree: null,
      xaravel: { results: [{ id: "XT-demo-1", consequence: "c", outcome: "pass" }], lines: ["ERROR [xaravel] bun test exited 1 with no failing testcase"], summary: "XARAVEL tests=1 passed=1 failed=0 skipped=0", differ: 1 },
    };
    expect(renderClause(testsClause([A], crashed, [{ line: { id: A, variant: "none", status: "pass", reason: null }, at: "s:1" }], null))).toEqual([
      "FAIL tests: 1 problem(s) over 1 Test ID × Variant line(s)",
      "  ERROR [none] bun test exited 1 with no failing testcase",
    ]);
    // The pure tests clause: a listed bare A covers its rows A#<key>, so it has lines; a passing row is done and a
    // fail-known row is not; an exact listed row is graded as before.
    const rowRun: HarnessResult = {
      ...crashed,
      code: 1,
      out: ["SUMMARY variants=1 run=1 not-run=0 checked=2 differ=0"],
      results: [
        { id: `${A}#a`, variant: "none", outcome: "pass", belowFloor: false, performed: 1, upstream: 1 },
        { id: `${A}#b`, variant: "none", outcome: "fail", belowFloor: false, performed: 1, upstream: 1 },
      ],
      differences: [],
    };
    const rowLine = (id: string, status: string): { line: Record<string, unknown>; at: string } => ({ line: { id, variant: "none", status, reason: null }, at: "s:1" });
    expect(renderClause(testsClause([A], { ...rowRun, results: rowRun.results.slice(0, 1) }, [rowLine(`${A}#a`, "pass")], null))).toEqual(["PASS tests: 1 Test ID × Variant line(s) done"]);
    expect(renderClause(testsClause([A], rowRun, [rowLine(`${A}#a`, "pass"), rowLine(`${A}#b`, "fail-known")], null))).toEqual([
      "FAIL tests: 1 problem(s) over 2 Test ID × Variant line(s)",
      `  ${A}#b [none]: fail-known is not done`,
    ]);
    expect(renderClause(testsClause([`${A}#a`], rowRun, [rowLine(`${A}#a`, "pass")], null))).toEqual(["PASS tests: 1 Test ID × Variant line(s) done"]);
    expect(renderClause(testsClause([B], rowRun, [], null))).toEqual(["FAIL tests: 1 problem(s) over 0 Test ID × Variant line(s)", `  ${B}: no Expectations line`]);
    expect(renderClause(xaravelClause(["XT-demo-1"], crashed))).toEqual(["FAIL xaravel-tests: the Xaravel run crashed", "  ERROR [xaravel] bun test exited 1 with no failing testcase"]);
    expect(lastSummary("2026-10-19T10:01:00Z SUMMARY a\nSUMMARY b\n2026-10-19T10:01:00.5Z not SUMMARY c")).toBe("SUMMARY b");
    expect(fullRunClause("w", "success", "no summary here").detail).toBe("w: the log has no STORY line from the ratchet story step");
    // The job's conclusion is checked before the log: only a finished, successful job can pass.
    const fullLog = storyLog("STORY ref=story/9.1 failures=0 passes=0 warnings=0");
    expect(fullRunClause("w", "success", fullLog)).toEqual({ clause: "full-run", pass: true, detail: `w: ${storySummary}; STORY ref=story/9.1 failures=0 passes=0 warnings=0`, items: [] });
    expect(fullRunClause("w", "failure", fullLog)).toEqual({ clause: "full-run", pass: false, detail: "w: the ratchet job concluded failure, not success", items: [] });
    expect(fullRunClause("w", "cancelled", fullLog)).toEqual({ clause: "full-run", pass: false, detail: "w: the ratchet job concluded cancelled, not success", items: [] });
    expect(fullRunClause("w", null, fullLog)).toEqual({ clause: "full-run", pass: false, detail: "w: the ratchet job has not finished", items: [] });
    expect(repoFromRemote("git@github.com:acme/xaravel.git")).toBe("acme/xaravel");
    expect(repoFromRemote("https://github.com/acme/xaravel")).toBe("acme/xaravel");
    expect(repoFromRemote("https://example.com/acme/xaravel")).toBeNull();
    const many = renderClause({ clause: "tests", pass: false, detail: "d", items: Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `item ${i}`) });
    expect(many).toHaveLength(1 + MAX_ITEMS + 1);
    expect(many[MAX_ITEMS]).toBe(`  item ${MAX_ITEMS - 1}`);
    expect(many.at(-1)).toBe("  … 5 more");

    // Usage errors exit 2.
    for (const argv of [[], ["5"], ["9.1", "--pr", "x"], ["9.1", "--bogus"], ["9.1", "9.2"]]) {
      expect([argv, (await runStoryCheck(argv)).code]).toEqual([argv, 2]);
    }
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-128 (AC3): the Epic 1-4 Xaravel Tests run through xaravelTest

xaravelTest(
  "XT-conformance-128",
  "every test in an Xaravel Test file is an xaravelTest with a unique ID, all of them run in the harness's Xaravel run, and a plain test() there is reported UNDECLARED (FR-115.1, FR-2.2, AD-15.1)",
  async () => {
    // The real root: every Xaravel Test file declares only through xaravelTest (or a wrapper that calls it).
    const files = xaravelTestFiles(root);
    expect(files.length).toBeGreaterThanOrEqual(43);
    expect(files).toContain("conformance/tests/xaravel/done-check.test.ts");
    expect(files).toContain("packages/assert/tests/xaravel/declarations.test.ts");
    expect(files).toContain("packages/mockery/tests/xaravel/mockery.test.ts");
    const ids: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      const imports = /^import \{([^}]*)\} from "bun:test";$/m.exec(text)?.[1]?.split(",").map((name) => name.trim()) ?? [];
      expect([file, imports.filter((name) => ["test", "it", "describe"].includes(name))]).toEqual([file, []]);
      // A declaration starts its line; one inside a fixture's source text or an expect() does not.
      for (const match of text.matchAll(/^(?:xaravelTest|phpTest)\(\s*"(XT-[a-z0-9-]+)"/gm)) {
        ids.push(match[1]!);
      }
    }
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
    expect(ids.length).toBeGreaterThanOrEqual(231);

    // Every real Xaravel Test file loads under the preload; a filtered run reports exactly the selected test.
    const filtered = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--xaravel", "--id", "XT-conformance-1"], {
      cwd: root,
      env: env() as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(filtered.stdout.toString()).toBe("XARAVEL tests=1 passed=1 failed=0 skipped=0\nSUMMARY variants=0 run=0 not-run=0 checked=0 differ=0\n");
    expect(filtered.exitCode).toBe(0);

    // The Xaravel run over a fixture root: FAIL, LATE, UNDECLARED and ERROR lines are differences; a skip is not.
    const body = [
      `import { test } from "bun:test";`,
      `xaravelTest("XT-demo-1", "passes", () => { Assert.assertTrue(true); });`,
      `xaravelTest("XT-demo-2", "fails", () => { Assert.assertTrue(false); });`,
      `xaravelTest("XT-demo-3", "skips", () => { Assert.markTestSkipped("not here"); });`,
      `xaravelTest("XT-demo-4", "is late", () => { setTimeout(() => Assert.assertTrue(true), 1); });`,
      `xaravelTest("XT-demo-5", "times out", async () => { await new Promise((done) => setTimeout(done, 2000)); }, 50);`,
      `xaravelTest("XT-demo-6", "waits under its timeout", async () => { await new Promise((done) => setTimeout(done, 20)); }, 5000);`,
      `test("a plain test", () => {});`,
      `xaravelTest("XT-demo-7", "runs after the late one", async () => { await new Promise((done) => setTimeout(done, 20)); });`,
    ].join("\n");
    const dir = makeRoot({
      [XT_FILE]: xtFile(body),
      "packages/support/tests/xaravel/other.test.ts": xtFile(`xaravelTest("XT-support-1", "a package's Xaravel Test (FR-115.1)", () => {});`),
      "packages/support/tests/ported/Support/SupportDoneTest.test.ts": xtFile(`xaravelTest("XT-ported-1", "not in an Xaravel Test file", () => {});`),
    });
    const only = await runHarness(dir, { env: env(), xaravel: { only: true } });
    expect(only.out).toEqual([
      "XT-demo-2 [xaravel] FAIL",
      "XT-demo-4 [xaravel] LATE",
      "XT-demo-5 [xaravel] FAIL",
      "- [xaravel] UNDECLARED a plain test",
      "XARAVEL tests=8 passed=4 failed=3 skipped=1",
      "SUMMARY variants=0 run=0 not-run=0 checked=0 differ=4",
    ]);
    expect(only.code).toBe(1);
    expect(only.xaravel!.results.map((result) => [result.id, result.outcome])).toEqual([
      ["XT-demo-1", "pass"],
      ["XT-demo-2", "fail"],
      ["XT-demo-3", "skip"],
      ["XT-demo-4", "late"],
      ["XT-demo-5", "fail"],
      ["XT-demo-6", "pass"],
      ["XT-demo-7", "pass"],
      ["XT-support-1", "pass"],
    ]);
    expect(only.differences.map((difference) => [difference.id, difference.variant, difference.kind])).toEqual([
      ["XT-demo-2", "xaravel", "unexpected-failure"],
      ["XT-demo-4", "xaravel", "unexpected-failure"],
      ["XT-demo-5", "xaravel", "unexpected-failure"],
      ["-", "xaravel", "unexpected-failure"],
    ]);
    expect(only.err.filter((line) => line.startsWith("harness: XT-demo-"))).toEqual([
      "harness: XT-demo-2 [xaravel]: ExpectationFailedException: Failed asserting that false is true.",
      "harness: XT-demo-5 [xaravel]: TimeoutError: test timed out",
    ]);

    // --id globs select XT ids; a literal one that matches nothing is MISSING.
    const selected = await runHarness(dir, { env: env(), xaravel: { only: true, ids: ["XT-demo-1", "XT-support-*", "XT-demo-99"] } });
    expect(selected.out).toEqual(["XT-demo-99 [xaravel] MISSING", "XARAVEL tests=3 passed=2 failed=1 skipped=0", "SUMMARY variants=0 run=0 not-run=0 checked=0 differ=1"]);

    // A file that throws on import is an ERROR line.
    writeFileSync(join(dir, XT_FILE), xtFile(`xaravelTest("XT-demo-1", "passes", () => {});\nthrow new Error("broken file");`));
    const broken = await runHarness(dir, { env: env(), xaravel: { only: true } });
    expect(broken.out.filter((line) => line.startsWith("ERROR "))).toEqual([expect.stringMatching(/^ERROR \[xaravel\] bun test exited [1-9]\d* with no failing testcase$/)]);
    expect(broken.code).toBe(1);

    // A full run (CLI: no filter, not fast) also does the Xaravel run, after every Variant; runHarness without
    // `xaravel` runs none (the Ratchet's path); filters and --fast don't do it.
    writeFileSync(join(dir, XT_FILE), xtFile(`xaravelTest("XT-demo-1", "passes", () => {});`));
    const withPorted = makeRoot({
      "conformance/inventory/support.jsonl": inventoryLine(A, { none: "pass" }, 0),
      [SHARD]: expectation(A, "pass"),
      [PORTED]: [`import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`, `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`].join("\n"),
      [XT_FILE]: xtFile(`xaravelTest("XT-demo-1", "passes", () => {});`),
    });
    expect((await runHarness(withPorted, { env: env() })).out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
    expect((await runHarness(withPorted, { env: env(), ...parseArgs([]).options })).out).toEqual(["XARAVEL tests=1 passed=1 failed=0 skipped=0", "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
    expect(parseArgs([]).options.xaravel).toEqual({ only: false });
    expect(parseArgs(["--fast"]).options.xaravel).toBeNull();
    expect(parseArgs(["--component", "support"]).options.xaravel).toBeNull();
    expect(parseArgs(["--xaravel", "--id", "XT-a-*"]).options).toEqual({ xaravel: { only: true, ids: ["XT-a-*"] } });
    for (const argv of [["--xaravel", "--fast"], ["--xaravel", "--story", "5.9"], ["--xaravel", "--component", "x"], ["--xaravel", "--seed", "a"]]) {
      expect(() => parseArgs(argv)).toThrow("--xaravel takes only --root and --id");
    }
    const cli = Bun.spawnSync([process.execPath, "--no-env-file", join(root, "conformance", "harness", "harness.ts"), "--root", withPorted], { env: env() as Record<string, string>, stdout: "pipe", stderr: "pipe" });
    expect(cli.stdout.toString()).toBe("XARAVEL tests=1 passed=1 failed=0 skipped=0\nSUMMARY variants=1 run=1 not-run=0 checked=1 differ=0\n");

    // The outer run frees its lock before the Xaravel run, so a Xaravel Test that runs the harness on the same root gets it.
    const nested = makeRoot({ [XT_FILE]: "", "conformance/inventory/support.jsonl": inventoryLine(A, { none: "pass" }, 0) });
    const HARNESS = join(root, "conformance", "harness", "harness.ts");
    writeFileSync(
      join(nested, XT_FILE),
      [
        `import { Assert, xaravelTest } from ${JSON.stringify(ASSERT)};`,
        `import { runHarness } from ${JSON.stringify(HARNESS)};`,
        `xaravelTest("XT-demo-1", "runs the harness on its own root", async () => {`,
        `  const inner = await runHarness(${JSON.stringify(nested)});`,
        `  Assert.assertSame("", inner.err.filter((line) => line.includes("harness.lock")).join("\\n"));`,
        `  Assert.assertSame(0, inner.code);`,
        `  Assert.assertSame("SUMMARY variants=0 run=0 not-run=0 checked=0 differ=0", inner.out.at(-1));`,
        `}, 60000);`,
      ].join("\n"),
    );
    const outer = await runHarness(nested, { env: env(), ...parseArgs([]).options });
    expect([outer.err.filter((line) => !line.startsWith("harness: [")), outer.out]).toEqual([[], ["XARAVEL tests=1 passed=1 failed=0 skipped=0", "SUMMARY variants=0 run=0 not-run=0 checked=0 differ=0"]]);

    // The judge itself: a duplicated report fails its id.
    const judged = judgeXaravel({
      junit: new Map([["XT-x-1: a", { outcome: "passed", type: null, message: null }]]),
      reports: [
        { type: "xaravel", id: "XT-x-1", consequence: "a", assertions: {} },
        { type: "xaravel", id: "XT-x-1", consequence: "a", assertions: {} },
      ],
      late: new Set(),
      ids: [],
      pattern: null,
      error: null,
    });
    expect(judged.lines).toEqual(["XT-x-1 [xaravel] FAIL"]);
  },
  TIMEOUT,
);

// ---------------------------------------------------------------------------
// XT-conformance-196 (AC4): the fixtures clause

xaravelTest(
  "XT-conformance-196",
  "story:check fails each assigned Differential Test ID with no verified fixture in its Component's conformance/fixtures/, or with a fatal or setup error fixture that Upstream's outcome does not expect (AD-15.4; FR-6, FR-115)",
  async () => {
    const { pub, priv } = keyPair();
    const pem = pub.export({ type: "spki", format: "pem" }).toString();
    const ok: Json = { error: null, results: [{ value: 1 }] };
    const fatal: Json = { error: { stage: "fatal", class: null, message: "boom" }, results: [] };
    const setup: Json = { error: { stage: "setup", class: "RuntimeException", message: "boom" }, results: [] };
    const sha = (n: number): string => n.toString(16).padStart(64, "0");
    const fixtures = new Map<string, string>([
      [`support/${sha(1)}`, renderFixture(signFixture(sha(1), ok, priv))],
      [`support/${sha(3)}`, renderFixture(signFixture(sha(3), fatal, priv))],
      [`support/${sha(4)}`, renderFixture(signFixture(sha(4), setup, priv))],
      [`support/${sha(5)}`, renderFixture(signFixture(sha(5), fatal, priv))],
      [`support/${sha(6)}`, renderFixture(signFixture(sha(6), fatal, priv))],
      [`support/${sha(7)}`, renderFixture(signFixture(sha(7), ok, keyPair().priv))],
      [`view/${sha(9)}`, renderFixture(signFixture(sha(9), ok, priv))],
    ]);
    const input = (overrides: Partial<FixturesInput> = {}): FixturesInput => ({
      assigned: ["XT-support-1", "XT-support-2", "XT-support-3", "XT-support-4", A, B, "XT-support-7", "XT-support-8", "XT-support-9"],
      requests: new Map([
        [sha(1), { id: "XT-support-1", component: "support" }],
        [sha(2), { id: "XT-support-2", component: "support" }],
        [sha(3), { id: "XT-support-3", component: "support" }],
        [sha(4), { id: "XT-support-4", component: "support" }],
        [sha(5), { id: A, component: "support" }],
        [sha(6), { id: B, component: "support" }],
        [sha(7), { id: "XT-support-7", component: "support" }],
        [sha(8), { id: "XT-support-8", component: "support" }],
        [sha(9), { id: "XT-support-9", component: "support" }],
        [sha(10), { id: "XT-other-1", component: "support" }],
      ]),
      listed: new Set([sha(8)]),
      fixture: (component, hash) => fixtures.get(`${component}/${hash}`) ?? null,
      key: { pem },
      // A's Upstream outcome is a failure, so its fatal fixture is what Upstream expects; B's is a pass.
      oracle: new Map([
        [A, { none: "fail" }],
        [B, { none: "pass" }],
      ]),
      ...overrides,
    });
    const result = fixturesClause(input());
    expect(renderClause(result)).toEqual([
      "FAIL fixtures: 6 of 8 assigned request(s) lack a verified fixture",
      `  ${B} ${sha(6)}: conformance/fixtures/support/${sha(6)}.json is a fatal error, which Upstream's outcome does not expect`,
      `  XT-support-2 ${sha(2)}: no fixture conformance/fixtures/support/${sha(2)}.json`,
      `  XT-support-3 ${sha(3)}: conformance/fixtures/support/${sha(3)}.json is a fatal error, which Upstream's outcome does not expect`,
      `  XT-support-4 ${sha(4)}: conformance/fixtures/support/${sha(4)}.json is a setup error, which Upstream's outcome does not expect`,
      `  XT-support-7 ${sha(7)}: conformance/fixtures/support/${sha(7)}.json does not verify: the signature does not verify`,
      `  XT-support-9 ${sha(9)}: no fixture conformance/fixtures/support/${sha(9)}.json`,
    ]);
    expect(fixturesClause(input({ assigned: ["XT-support-1", A] }))).toEqual({ clause: "fixtures", pass: true, detail: "2 fixture(s) verified", items: [] });
    expect(fixturesClause(input({ assigned: ["XT-support-8", "XT-none-1"] }))).toEqual({ clause: "fixtures", pass: true, detail: "no assigned Differential Test ID", items: [] });
    expect(fixturesClause(input({ assigned: ["XT-support-1"], key: { error: "conformance/oracle/oracle.pub is missing" } })).detail).toBe("cannot verify 1 fixture(s): conformance/oracle/oracle.pub is missing");
    // A bare assigned X covers its row requests X#<key> (ownership's covers): one with no fixture fails, named by its row.
    expect(renderClause(fixturesClause(input({ assigned: [C], requests: new Map([[sha(2), { id: `${C}#k`, component: "support" }]]) })))).toEqual([
      "FAIL fixtures: 1 of 1 assigned request(s) lack a verified fixture",
      `  ${C}#k ${sha(2)}: no fixture conformance/fixtures/support/${sha(2)}.json`,
    ]);
    // Any evaluation error counts, at any stage, and only an all-`fail` oracle map excuses it (an all-`skip` one does not).
    const staged = (stage: string): Json => ({ error: { stage, class: "RuntimeException", message: "boom" }, results: [] });
    const stagedFixtures = new Map<string, string>([
      [sha(11), renderFixture(signFixture(sha(11), staged("bindings"), priv))],
      [sha(12), renderFixture(signFixture(sha(12), staged("tearDown"), priv))],
      [sha(13), renderFixture(signFixture(sha(13), staged("timeout"), priv))],
    ]);
    const stages = fixturesClause(
      input({
        assigned: ["XT-support-11", C, D],
        requests: new Map([
          [sha(11), { id: "XT-support-11", component: "support" }],
          [sha(12), { id: C, component: "support" }],
          [sha(13), { id: D, component: "support" }],
        ]),
        fixture: (_component, hash) => stagedFixtures.get(hash) ?? null,
        oracle: new Map<string, Record<string, string>>([
          [C, { none: "skip" }],
          [D, { none: "fail", pgsql: "fail" }],
        ]),
      }),
    );
    expect(renderClause(stages)).toEqual([
      "FAIL fixtures: 2 of 3 assigned request(s) lack a verified fixture",
      `  ${C} ${sha(12)}: conformance/fixtures/support/${sha(12)}.json is a tearDown error, which Upstream's outcome does not expect`,
      `  XT-support-11 ${sha(11)}: conformance/fixtures/support/${sha(11)}.json is a bindings error, which Upstream's outcome does not expect`,
    ]);
    // An empty oracle map (an Xaravel Test ID has no Inventory entry) never expects an error.
    expect(fixturesClause(input({ assigned: [A], oracle: new Map([[A, {}]]) })).pass).toBe(false);

    // The CLI reads committed per-Story requests, the listing, the Inventory and oracle.pub from the root.
    const request = makeRequest("XT-demo-1", "php-expr", { bindings: {}, setup: [], exprs: ["1"] });
    const signed = renderFixture(signFixture(request.sha256, fatal, priv));
    const dir = storyRoot({
      "conformance/oracle/oracle.pub": pem,
      "conformance/oracle-requests/9.1.jsonl": `${JSON.stringify(request)}\n`,
    });
    const missing = await runStoryCheck(["9.1", "--root", dir], { env: env() });
    expect(missing.out.filter((line) => line.includes("fixtures") || line.startsWith("  XT-demo-1 "))).toEqual(["FAIL fixtures: 1 of 1 assigned request(s) lack a verified fixture", `  XT-demo-1 ${request.sha256}: no fixture conformance/fixtures/support/${request.sha256}.json`]);
    mkdirSync(join(dir, "conformance", "fixtures", "support"), { recursive: true });
    writeFileSync(join(dir, "conformance", "fixtures", "support", `${request.sha256}.json`), signed);
    const errored = await runStoryCheck(["9.1", "--root", dir], { env: env() });
    expect(errored.out.filter((line) => line.includes("fixtures") || line.startsWith("  XT-demo-1 "))).toEqual([
      "FAIL fixtures: 1 of 1 assigned request(s) lack a verified fixture",
      `  XT-demo-1 ${request.sha256}: conformance/fixtures/support/${request.sha256}.json is a fatal error, which Upstream's outcome does not expect`,
    ]);
    writeFileSync(join(dir, "conformance", "fixtures", "support", `${request.sha256}.json`), renderFixture(signFixture(request.sha256, ok, priv)));
    const verified = await runStoryCheck(["9.1", "--root", dir], { env: env() });
    expect(verified.out).toContain("PASS fixtures: 1 fixture(s) verified");
    // A listed request needs no fixture.
    rmSync(join(dir, "conformance", "fixtures", "support", `${request.sha256}.json`));
    writeFileSync(join(dir, "conformance", "oracle", "nondeterminism.jsonl"), `${JSON.stringify({ sha256: request.sha256, id: request.id, reason: "random" })}\n`);
    const listed = await runStoryCheck(["9.1", "--root", dir], { env: env() });
    expect(listed.out.find((line) => line.includes(" fixtures:"))).toBe("PASS fixtures: no assigned Differential Test ID");
  },
  TIMEOUT,
);
