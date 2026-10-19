// Xaravel Tests for Story 5.9 (the Xaravel Test coverage check and the Story
// done check; FR-111, FR-114, FR-115, AD-15, AD-16, AD-28).
//
// Fixture roots are hermetic git roots holding a root `bunfig.toml`, Story
// manifests, an Inventory, an Expectations shard, `conformance/variants`, a
// stub Ported Test file and a stub Xaravel Test file that import
// `@xaravel/assert` from the real `packages/assert` by absolute path; the real
// harness runs them. The GitHub API is a `Bun.serve` fake on port 0. The real
// repository is only read; no test here runs the Xaravel Tests of the real
// root unfiltered, since that run would include these tests.
import { afterAll, expect } from "bun:test";
import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs, runHarness, type HarnessResult } from "../../harness/harness";
import { judgeXaravel, xaravelTestFiles } from "../../harness/xaravel";
import { coverage, runCoverage } from "../../../tools/xt-coverage/coverage";
import { CONSEQUENCE_SOURCES, consequencesFor, declaredConsequences, expectedFiles, PRD_FILE, readConsequences, SPINE_FILE } from "../../../tools/xt-coverage/consequences";
import { approvalsClause, CLAUSES, fixturesClause, fullRunClause, lastSummary, MAX_ITEMS, renderClause, repoFromRemote, runStoryCheck, testsClause, xaravelClause, type FixturesInput } from "../../../tools/story-check/story-check";
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
  for (const [path, text] of Object.entries({ "bunfig.toml": "env = false\n", "conformance/variants": "none\npgsql\nsqlite\n", ...files })) {
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
  "conformance/xaravel-consequences/<component>.jsonl is generated from the PRD's FR consequences and the spine's AD rules and passes --check; bun run xt:coverage <component> lists every consequence that no passing xaravelTest declares and exits 1 while any remain (FR-115.2; FR-115, AD-15)",
  async () => {
    // The committed file is the generator's output (the drift check), and the scripts exist.
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["xt:consequences"]).toBe("bun tools/xt-coverage/consequences.ts");
    expect(scripts["xt:coverage"]).toBe("bun --no-env-file tools/xt-coverage/coverage.ts");
    const check = Bun.spawnSync([process.execPath, join(root, "tools", "xt-coverage", "consequences.ts"), "--check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect([check.exitCode, check.stderr.toString()]).toEqual([0, ""]);
    expect([...expectedFiles(root).keys()]).toEqual(["conformance/xaravel-consequences/conformance.jsonl"]);
    expect(CONSEQUENCE_SOURCES["conformance"]).toEqual({ frs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 111, 112, 113, 114, 115, 116], ads: [15, 16, 17, 21, 28] });

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
    expect(text("FR-3.2")).toContain("CI checks every Skip Reason against its rule in §3, and fails on any that breaks it: - `blocked-by` must name a Component in a later Phase. - `intentional-divergence`");
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
    [`${REQUESTS_DIR}/support.jsonl`]: renderRequests([{ component: "support", request: other }]).get("support")!,
    "conformance/oracle/oracle.pub": pub.export({ type: "spki", format: "pem" }).toString(),
    ...files,
  });
}

interface FakeGitHub {
  pulls: { number: number; updated_at: string; user: { login: string }; head: { sha: string; ref: string } }[];
  reviews: Record<number, { user: { login: string }; state: string; commit_id: string }[]>;
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
      match = /^\/pulls\/(\d+)\/reviews$/.exec(path);
      if (match !== null) {
        const all = fake.reviews[Number(match[1])] ?? [];
        const page = Number(url.searchParams.get("page") ?? "1");
        return Response.json(all.slice((page - 1) * 100, page * 100));
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
const LOG_FULL = ["2026-10-19T10:00:00.0000000Z SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0 mode=fast seed=ab", "2026-10-19T10:01:00.1234567Z SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0", "2026-10-19T10:01:01.0000000Z RATCHET ref=main scope=full failures=0 passes=0 warnings=0", ""].join("\n");
const LOG_FAST = ["2026-10-19T10:01:00.1234567Z SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0", "2026-10-19T10:02:00.0000000Z SUMMARY variants=1 run=1 not-run=0 checked=100 differ=0 mode=fast seed=0f0f0f0f"].join("\n");

function fakeGitHub(overrides: Partial<FakeGitHub> = {}): FakeGitHub {
  return {
    pulls: [
      { number: 3, updated_at: "2026-10-18T09:00:00Z", user: { login: "agent" }, head: { sha: "b".repeat(40), ref: "story/9.1" } },
      { number: 7, updated_at: "2026-10-19T09:00:00Z", user: { login: "agent" }, head: { sha: SHA, ref: "story/9.1" } },
    ],
    reviews: {
      7: [
        { user: { login: "alice" }, state: "CHANGES_REQUESTED", commit_id: SHA },
        { user: { login: "agent" }, state: "APPROVED", commit_id: SHA },
        { user: { login: "alice" }, state: "APPROVED", commit_id: SHA },
        { user: { login: "bob" }, state: "COMMENTED", commit_id: SHA },
        { user: { login: "bob" }, state: "APPROVED", commit_id: SHA },
        { user: { login: "carol" }, state: "APPROVED", commit_id: SHA },
        { user: { login: "carol" }, state: "DISMISSED", commit_id: SHA },
        { user: { login: "bob" }, state: "COMMENTED", commit_id: SHA },
      ],
    },
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

const ESCALATION = "---\ntest_ids:\n  - XT-demo-1\ntrigger: open-question\nproposed: >-\n  Decide.\nevidence: >-\n  None yet.\n---\n\n# ESC-9.1-1\n";

// ---------------------------------------------------------------------------
// XT-conformance-127 (AC2): `bun run story:check <story-id>`

xaravelTest(
  "XT-conformance-127",
  "bun run story:check <story-id> reports PASS or FAIL for each done clause (manifest, tests, xaravel-tests, fixtures, approvals, escalations, full-run) and exits 1 when any fails; a manifest with no assigned tests fails; approvals count by distinct reviewer identity (AD-15.8, FR-111.1; FR-111, FR-114, FR-115, AD-15, AD-16, AD-28)",
  async () => {
    const script = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["story:check"];
    expect(script).toBe("bun --no-env-file tools/story-check/story-check.ts");
    expect([...CLAUSES]).toEqual(["manifest", "tests", "xaravel-tests", "fixtures", "approvals", "escalations", "full-run"]);

    // Every clause passes: the Story's own lines are done, its Xaravel Test passes, two distinct non-author approvals
    // (each reviewer's latest counted review), no open Escalation, and the latest ratchet run's job log ends in a full SUMMARY.
    const good = storyRoot();
    const passing = await withGitHub(fakeGitHub(), (api) => runStoryCheck(["9.1", "--root", good], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(passing.out).toEqual([
      "PASS manifest: stories/9.1.md: 2 test_ids, 1 xaravel_test_ids",
      "PASS tests: 2 Test ID × Variant line(s) done",
      "PASS xaravel-tests: 1 Xaravel Test(s) pass",
      "PASS fixtures: no assigned Differential Test ID",
      "PASS approvals: PR #7: 2 approvals (alice, bob)",
      "PASS escalations: no Escalations",
      "PASS full-run: PR #7 ratchet run 12: SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0",
      "STORY-CHECK 9.1 pass",
    ]);
    expect(passing.code).toBe(0);

    // Every clause fails.
    const bad = storyRoot({
      "stories/9.1.md": manifest("9.1", [A, B, C, D, `${CLASS}::testNoLine`], ["XT-demo-1", "XT-demo-2", "XT-demo-9"]),
      "conformance/escalations/ESC-9.1-1.md": ESCALATION,
    });
    const reviews = { 7: [{ user: { login: "alice" }, state: "APPROVED", commit_id: SHA }, { user: { login: "agent" }, state: "APPROVED", commit_id: SHA }, { user: { login: "bob" }, state: "CHANGES_REQUESTED", commit_id: SHA }] };
    const failing = await withGitHub(fakeGitHub({ reviews, jobs: { 12: [{ id: 91, name: "ratchet", conclusion: "success" }] } }), (api) =>
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
      "FAIL approvals: PR #7: 1 approval(s) from distinct reviewers other than agent; 2 needed",
      "  alice: APPROVED",
      "  bob: CHANGES_REQUESTED",
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

    // A manifest with no assigned tests fails, and so does every clause that needs it; with no GH_TOKEN the GitHub
    // clauses fail and never pass silently.
    const empty = storyRoot({ "stories/9.1.md": manifest("9.1", [], []) });
    const none = await runStoryCheck(["9.1", "--root", empty], { env: env() });
    expect(none.out).toEqual([
      "FAIL manifest: stories/9.1.md is invalid",
      "  invalid manifest: stories/9.1.md: test_ids/xaravel_test_ids are both absent or empty; a Story with no assigned tests can't be done (AD-16)",
      "FAIL tests: cannot check: stories/9.1.md is missing or invalid",
      "FAIL xaravel-tests: cannot check: stories/9.1.md is missing or invalid",
      "FAIL fixtures: cannot check: stories/9.1.md is missing or invalid",
      "FAIL approvals: cannot check: GH_TOKEN is not set",
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
    expect(noPr.out.filter((line) => line.includes("approvals:") || line.includes("full-run:"))).toEqual(["FAIL approvals: no pull request in acme/xaravel has head story/9.1", "FAIL full-run: no pull request in acme/xaravel has head story/9.1"]);
    const noRun = await withGitHub(fakeGitHub({ runs: {} }), (api) => runStoryCheck(["9.1", "--root", empty], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(noRun.out.find((line) => line.includes("full-run:"))).toBe(`FAIL full-run: PR #7: no ratchet workflow run for ${SHA}`);
    // A --pr whose head is not story/<id> is not this Story's PR.
    const otherPulls = [{ number: 8, updated_at: "2026-10-19T09:00:00Z", user: { login: "agent" }, head: { sha: SHA, ref: "story/9.2" } }];
    const mismatch = await withGitHub(fakeGitHub({ pulls: otherPulls }), (api) => runStoryCheck(["9.1", "--root", empty, "--pr", "8"], { env: env({ GH_TOKEN: "test-token", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/xaravel" }) }));
    expect(mismatch.out.filter((line) => line.includes("approvals:") || line.includes("full-run:"))).toEqual(["FAIL approvals: PR #8's head is story/9.2, not story/9.1", "FAIL full-run: PR #8's head is story/9.2, not story/9.1"]);

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
    expect(apiDown.out.filter((line) => line.includes("approvals:") || line.includes("full-run:")).every((line) => line.startsWith("FAIL ") && line.includes("HTTP 401"))).toBe(true);

    // A ratchet job that concluded failure fails full-run even when its log ends in a full differ=0 SUMMARY.
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

    // The pure pieces.
    expect(approvalsClause(7, "agent", SHA, [{ user: { login: "x" }, state: "APPROVED", commit_id: SHA }, { user: { login: "x" }, state: "APPROVED", commit_id: SHA }]).pass).toBe(false);
    // A review given on a commit older than the PR head is stale: it does not count.
    const stale = approvalsClause(7, "agent", SHA, [
      { user: { login: "alice" }, state: "APPROVED", commit_id: SHA },
      { user: { login: "bob" }, state: "APPROVED", commit_id: "b".repeat(40) },
    ]);
    expect(renderClause(stale)).toEqual([
      "FAIL approvals: PR #7: 1 approval(s) from distinct reviewers other than agent; 2 needed",
      "  alice: APPROVED",
      `  bob: APPROVED on ${"b".repeat(40)}, not the head ${SHA}`,
    ]);
    // A full run that differed fails, as does a fast one.
    expect(fullRunClause("w", "success", "SUMMARY variants=1 run=1 not-run=0 checked=3 differ=2")).toEqual({ clause: "full-run", pass: false, detail: "w: SUMMARY variants=1 run=1 not-run=0 checked=3 differ=2 differed", items: [] });
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
    expect(renderClause(xaravelClause(["XT-demo-1"], crashed))).toEqual(["FAIL xaravel-tests: the Xaravel run crashed", "  ERROR [xaravel] bun test exited 1 with no failing testcase"]);
    expect(lastSummary("2026-10-19T10:01:00Z SUMMARY a\nSUMMARY b\n2026-10-19T10:01:00.5Z not SUMMARY c")).toBe("SUMMARY b");
    expect(fullRunClause("w", "success", "no summary here").detail).toBe("w: the log has no SUMMARY line");
    // The job's conclusion is checked before the SUMMARY: only a finished, successful job can pass.
    const fullLog = "SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0";
    expect(fullRunClause("w", "success", fullLog)).toEqual({ clause: "full-run", pass: true, detail: `w: ${fullLog}`, items: [] });
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
  "every test in an Xaravel Test file is an xaravelTest with a unique ID, all of them run in the harness's Xaravel run, and a plain test() there is reported UNDECLARED (FR-115.1, FR-2.2, AD-15.1; FR-115, AD-15)",
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
  "story:check fails each assigned Differential Test ID with no verified fixture in its Component's conformance/fixtures/, or with a fatal or setup error fixture that Upstream's outcome does not expect (AD-15.4; FR-6, FR-115, AD-15)",
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
