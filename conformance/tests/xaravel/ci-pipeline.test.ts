// Xaravel Tests for Story 5.7 (the CI pipeline: PR checks, merge queue and
// nightly matrix; FR-3, FR-9, AD-2, AD-16, AD-17, AD-28). These run under
// plain `bun test` until the harness's `xaravelTest` lands in Story 5.9.
//
// The workflow shapes are read with `Bun.YAML.parse`; they are what GitHub
// runs, but only a live run proves a workflow (docs/ops/ci.md lists the first
// live runs). The Ratchet's `scope`, `run --scope` and `story` commands and
// the benchmark runner run against hermetic fixture roots (git-initialised
// where the harness needs a worktree), as in ratchet.test.ts.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { main as benchMain, runBenchmarks } from "../../../tools/bench/bench";
import { reverseClosure } from "../../../tools/graph/graph";
import { computeScope, main as ratchetMain, readScope, runRatchet, runStoryTests } from "../../../tools/ratchet/ratchet";
import { ACTIONS_INTEGRATION_ID, policyViolations, REQUIRED_CHECKS } from "../../../tools/ruleset/ruleset";
import type { HarnessResult } from "../../harness/harness";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const RATCHET = join(root, "tools", "ratchet", "ratchet.ts");
const BENCH = join(root, "tools", "bench", "bench.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Workflows

type Step = { name?: string; id?: string; uses?: string; if?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string>; "working-directory"?: string; "continue-on-error"?: unknown };
type Job = {
  name?: string;
  "runs-on": string;
  if?: string;
  permissions?: Record<string, string>;
  strategy?: { "fail-fast"?: boolean; matrix: { include: Record<string, string>[] } };
  services?: Record<string, { image: string }>;
  env?: Record<string, string>;
  steps: Step[];
  "continue-on-error"?: unknown;
};
type Workflow = { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job> };

function workflow(file: string): { text: string; data: Workflow } {
  const text = readFileSync(join(root, ".github", "workflows", file), "utf8");
  return { text, data: Bun.YAML.parse(text) as Workflow };
}

function runsOf(job: Job): string[] {
  return job.steps.map((step) => step.run).filter((run): run is string => run !== undefined);
}

const SERVICE_ENV = { CI: "true", PGHOST: "127.0.0.1", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: "postgres", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379" };
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_BUN = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6";

// ---------------------------------------------------------------------------
// Fixture roots

function makeRoot(files: Record<string, string>, git = false): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-ci-"));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  if (git) {
    Bun.spawnSync(["git", "init", "-q", dir]);
  }
  return dir;
}

function row(name: string): string {
  return `${JSON.stringify({ name, dir: `packages/${name}`, npm: `@xaravel/${name}`, phase: 2, kind: "upstream", upstream: null, private: false, require: [], suggest: [] })}\n`;
}

/** A tree of four packages: collections depends on support (dev), validation peers on collections, cache stands alone; mockery has no Expectations. */
function packageTree(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "tools/scaffold/packages.jsonl": ["cache", "collections", "mockery", "support", "validation"].map(row).join(""),
    "packages/support/package.json": JSON.stringify({ name: "@xaravel/support" }),
    "packages/support/src/A.ts": "export const a = 1;\n",
    "packages/collections/package.json": JSON.stringify({ name: "@xaravel/collections", devDependencies: { "@xaravel/support": "workspace:*" } }),
    "packages/validation/package.json": JSON.stringify({ name: "@xaravel/validation", peerDependencies: { "@xaravel/collections": "workspace:*" } }),
    "packages/cache/package.json": JSON.stringify({ name: "@xaravel/cache", optionalDependencies: { "@xaravel/mockery": "workspace:*" } }),
    "packages/mockery/package.json": JSON.stringify({ name: "@xaravel/mockery" }),
    "conformance/expectations/support/x.jsonl": "",
    "conformance/expectations/collections/x.jsonl": "",
    "conformance/expectations/validation/x.jsonl": "",
    "conformance/expectations/cache/x.jsonl": "",
    "docs/x.md": "docs\n",
    "README.md": "readme\n",
    "AGENTS.md": "agents\n",
    ...extra,
  };
}

/** `head` is a copy of `base`'s files with `changes` applied (null deletes). */
function pair(changes: Record<string, string | null>, baseExtra: Record<string, string> = {}): { base: string; head: string } {
  const files = packageTree(baseExtra);
  const headFiles: Record<string, string> = { ...files };
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) {
      delete headFiles[path];
    } else {
      headFiles[path] = text;
    }
  }
  return { base: makeRoot(files), head: makeRoot(headFiles) };
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function env(extra: Record<string, string | undefined> = {}): Promise<Record<string, string | undefined>> {
  const port = String(await closedPort());
  return { ...process.env, CI: undefined, GITHUB_ACTIONS: undefined, PGHOST: "127.0.0.1", PGPORT: port, REDIS_HOST: "127.0.0.1", REDIS_PORT: port, ...extra };
}

function fakeHarness(code: 0 | 1, out: string[] = ["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]): HarnessResult {
  return { code, out, err: [], results: [], differences: [], sample: null, worktree: null };
}

// ---------------------------------------------------------------------------
// XT-conformance-119

test("XT-conformance-119: every PR runs lint, typecheck, the protected-paths, ownership and dependency-graph checks, bun audit, the Ratchet over its scope and the Story's tests in full, on linux-x64 with SQLite, Postgres 18 and Redis 8.10.2 (FR-3, FR-9, AD-28)", () => {
  // ci.yml: lint, typecheck, graph and audit on every PR and in the queue.
  const ci = workflow("ci.yml").data;
  expect(Object.keys(ci.on)).toEqual(["pull_request", "merge_group", "push"]);
  expect(ci.jobs["check"]!["runs-on"]).toBe("ubuntu-latest");
  for (const command of ["bun run lint", "bun run typecheck", "bun run graph:check", "bun run test"]) {
    expect([command, runsOf(ci.jobs["check"]!).includes(command)]).toEqual([command, true]);
  }
  expect(runsOf(ci.jobs["audit"]!)).toContain("bun audit --audit-level=high");
  // protected-paths and ownership run from the base under pull_request_target, and in the queue.
  for (const file of ["protected-paths.yml", "ownership.yml"]) {
    const data = workflow(file).data;
    expect([file, Object.keys(data.on).slice(0, 2)]).toEqual([file, ["pull_request_target", "merge_group"]]);
  }
  // ratchet.yml: on linux-x64 (ubuntu-latest), with the services and every alpha Variant (CI=true).
  const { data: ratchet } = workflow("ratchet.yml");
  const job = ratchet.jobs["ratchet"]!;
  expect(job["runs-on"]).toBe("ubuntu-latest");
  // Within the merge queue's check_response_timeout_minutes (main.json).
  expect((job as Job & { "timeout-minutes"?: number })["timeout-minutes"]).toBe(60);
  expect(Object.fromEntries(Object.entries(job.services!).map(([name, service]) => [name, service.image]))).toEqual({ postgres: "postgres:18", redis: "redis:8.10.2" });
  expect(job.env).toMatchObject(SERVICE_ENV);
  // The PR flow, in order: scope (before the overlay), overlay, install, run --scope, story.
  const pr = job.steps.filter((step) => step.if === "github.event_name == 'pull_request_target'" && step.run !== undefined).map((step) => step.run);
  expect(pr).toEqual([
    'bun tools/ratchet/ratchet.ts scope --base . --head pr --out "$RUNNER_TEMP/ratchet-scope.json"',
    "bun tools/ratchet/ratchet.ts overlay --base . --head pr",
    "bun install --frozen-lockfile --ignore-scripts",
    'bun tools/ratchet/ratchet.ts run --root pr --ref "$HEAD_REF" --scope "$RUNNER_TEMP/ratchet-scope.json"',
    'bun tools/ratchet/ratchet.ts story --root pr --ref "$HEAD_REF"',
  ]);
  for (const step of job.steps) {
    expect(step["continue-on-error"]).toBeUndefined();
  }
  // No CI workflow ever samples (`--fast`, or a `--seed` that implies it).
  for (const file of readdirSync(join(root, ".github", "workflows")).filter((name) => name.endsWith(".yml"))) {
    const commands = Object.values(workflow(file).data.jobs).flatMap(runsOf).join("\n");
    expect([file, /--fast|--seed/.test(commands)]).toEqual([file, false]);
  }
  // The scripts the jobs call exist.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["graph:check"]).toBe("bun tools/graph/graph.ts");
  expect(scripts["bench"]).toBe("bun tools/bench/bench.ts");
});

test("XT-conformance-119: scope is the AD-2 reverse-dependency closure of the changed packages that has Expectations; data-only paths add nothing, any other path makes it full (AD-2, AD-28)", async () => {
  // The closure: every edge kind, transitively, the changed package included, by dir name.
  const tree = makeRoot(packageTree());
  expect(reverseClosure(tree, ["support"])).toEqual(["collections", "support", "validation"]);
  expect(reverseClosure(tree, ["mockery"])).toEqual(["cache", "mockery"]);
  expect(reverseClosure(tree, ["validation"])).toEqual(["validation"]);
  expect(reverseClosure(tree, ["nope"])).toEqual(["nope"]);

  // Identical trees, and a docs-only change: none.
  const same = pair({});
  expect(computeScope(same.base, same.head)).toEqual({ mode: "none", components: [], reason: "no graded path changed" });
  const docs = pair({ "docs/x.md": "changed\n", "README.md": "changed\n", "stories/9.1.md": "x\n", "_bmad-output/x.md": "x\n", ".github/workflows/x.yml": "x\n", "conformance/escalations/ESC-9.1-1.md": "x\n", "conformance/oracle-requests/9.1.jsonl": "x\n" });
  expect(computeScope(docs.base, docs.head).mode).toBe("none");

  // A package change: its closure, intersected with the Components that have Expectations.
  const pkg = pair({ "packages/support/src/A.ts": "export const a = 2;\n" });
  expect(computeScope(pkg.base, pkg.head)).toEqual({ mode: "components", components: ["collections", "support", "validation"], reason: "packages support changed; reverse-dependency closure with Expectations" });
  // A deleted file counts as changed; a closure with no Expectations is none.
  const deleted = pair({ "packages/support/src/A.ts": null });
  expect(computeScope(deleted.base, deleted.head).components).toEqual(["collections", "support", "validation"]);
  const graderOnly = pair({ "packages/mockery/src/M.ts": "x\n" });
  expect(computeScope(graderOnly.base, graderOnly.head)).toEqual({ mode: "components", components: ["cache"], reason: "packages mockery changed; reverse-dependency closure with Expectations" });
  const noExpectations = pair({ "packages/newpkg/src/N.ts": "x\n" });
  expect(computeScope(noExpectations.base, noExpectations.head).mode).toBe("none");
  // An edge only the head adds still widens the scope.
  const newEdge = pair({ "packages/cache/package.json": JSON.stringify({ name: "@xaravel/cache", dependencies: { "@xaravel/support": "workspace:*" } }), "packages/support/src/A.ts": "x\n" });
  expect(computeScope(newEdge.base, newEdge.head).components).toEqual(["cache", "collections", "support", "validation"]);
  // Expectations and fixtures of a Component: that Component only.
  const data = pair({ "conformance/expectations/cache/x.jsonl": "{}\n", "conformance/fixtures/cache/a.json": "{}\n" });
  expect(computeScope(data.base, data.head)).toEqual({ mode: "components", components: ["cache"], reason: "Component data cache changed; reverse-dependency closure with Expectations" });

  // Any other path, AGENTS.md included: full, naming the first in sorted order.
  const tools = pair({ "tools/x/y.ts": "x\n", "tools/z.ts": "x\n", "packages/support/src/A.ts": "x\n" });
  expect(computeScope(tools.base, tools.head)).toEqual({ mode: "full", components: [], reason: "tools/x/y.ts" });
  const agents = pair({ "AGENTS.md": "changed\n" });
  expect(computeScope(agents.base, agents.head)).toEqual({ mode: "full", components: [], reason: "AGENTS.md" });
  // decisions/ is graded: the harness reads decisions/DIV-<n>.md for assertion-floor waivers.
  const div = pair({ "decisions/DIV-1.md": "x\n" });
  expect(computeScope(div.base, div.head)).toEqual({ mode: "full", components: [], reason: "decisions/DIV-1.md" });
  // Component data with no Expectations directory in the head (deleted, or fixtures only): full.
  const gone = pair({ "conformance/expectations/cache/x.jsonl": null });
  expect(computeScope(gone.base, gone.head)).toEqual({ mode: "full", components: [], reason: "conformance/expectations/cache/x.jsonl" });
  const fixturesOnly = pair({ "conformance/fixtures/mockery/a.json": "{}\n" });
  expect(computeScope(fixturesOnly.base, fixturesOnly.head)).toEqual({ mode: "full", components: [], reason: "conformance/fixtures/mockery/a.json" });
  // A closure package with Ported Tests but no Expectations directory: its tests would be UNKNOWN, so full.
  const unknown = pair({ "packages/support/src/A.ts": "x\n" }, { "packages/validation/tests/ported/V.test.ts": "x\n" });
  rmSync(join(unknown.head, "conformance", "expectations", "validation"), { recursive: true });
  rmSync(join(unknown.base, "conformance", "expectations", "validation"), { recursive: true });
  expect(computeScope(unknown.base, unknown.head)).toEqual({ mode: "full", components: [], reason: "packages/validation/tests/ported/" });
  const rootFile = pair({ "bunfig.toml": "x\n" });
  expect(computeScope(rootFile.base, rootFile.head).reason).toBe("bunfig.toml");

  // .git and node_modules are skipped, and so is the head checked out inside the base (CI's `pr/`).
  // node_modules at any depth: an installed tree against a fresh one is no change.
  const ci = pair({ "node_modules/x/index.js": "x\n", ".git/HEAD": "x\n", "packages/support/node_modules/y.js": "x\n", "tools/x/node_modules/y.js": "x\n" });
  expect(computeScope(ci.base, ci.head)).toEqual({ mode: "none", components: [], reason: "no graded path changed" });
  const nested = makeRoot(packageTree());
  for (const [path, text] of Object.entries(packageTree())) {
    mkdirSync(dirname(join(nested, "pr", path)), { recursive: true });
    writeFileSync(join(nested, "pr", path), text);
  }
  expect(computeScope(nested, join(nested, "pr")).mode).toBe("none");

  // The CLI writes the scope file; the repository against itself is none.
  const out = join(makeRoot({}), "scope.json");
  const cli = Bun.spawnSync([process.execPath, RATCHET, "scope", "--base", pkg.base, "--head", pkg.head, "--out", out], { stdout: "pipe", stderr: "pipe" });
  expect(cli.exitCode).toBe(0);
  expect(readFileSync(out, "utf8")).toBe(`{"mode":"components","components":["collections","support","validation"],"reason":"packages support changed; reverse-dependency closure with Expectations"}\n`);
  expect(readScope(out)).toEqual({ mode: "components", components: ["collections", "support", "validation"], reason: "packages support changed; reverse-dependency closure with Expectations" });
  const self = Bun.spawnSync([process.execPath, RATCHET, "scope", "--base", root, "--head", root, "--out", out], { stdout: "pipe", stderr: "pipe" });
  expect(self.exitCode).toBe(0);
  expect(readScope(out).mode).toBe("none");
  for (const args of [["scope", "--base", "."], ["scope", "--base", ".", "--head", "."], ["story"], ["run", "--ref", "main", "--scope"]]) {
    const usage = Bun.spawnSync([process.execPath, RATCHET, ...args], { stdout: "pipe", stderr: "pipe" });
    expect([args.join(" "), usage.exitCode]).toEqual([args.join(" "), 2]);
  }
  // A malformed scope file fails closed.
  writeFileSync(out, '{"mode":"some"}\n');
  expect(() => readScope(out)).toThrow("is not {");
  expect(await ratchetMain(["run", "--ref", "main", "--root", root, "--scope", out])).toBe(1);
}, 60_000);

test("XT-conformance-119: run --scope grades only the scope's Components, none runs no harness, full and no scope run in full; story runs the Story's test_ids in full and forwards the harness's exit (FR-3, AD-28)", async () => {
  const manifest = (id: string, testIds: string[]): string =>
    `---\nstory_id: "${id}"\nepic: ${id.split(".")[0]}\ncomponent: support\nstatus: in-progress\ntest_ids:${testIds.length === 0 ? ' []\nxaravel_test_ids:\n  - "XT-conformance-999"' : `\n${testIds.map((t) => `  - ${JSON.stringify(t)}`).join("\n")}`}\n---\n\n# Story ${id}\n`;
  const CLASS = "Illuminate\\Tests\\Support\\SupportCiTest";
  const A = `${CLASS}::testA`;
  const B = `${CLASS}::testB`;
  const C = "Illuminate\\Tests\\Cache\\CacheCiTest::testC";
  const inventory = [A, B].map((id, index) => `${JSON.stringify({ id, component: "support", kind: "unit", backends: ["none"], source: `framework/tests/Support/SupportCiTest.php:${index + 1}-${index + 2}`, hash: "0".repeat(64), assertions: { assertTrue: 1 }, oracle: { none: "pass" } })}\n`).join("");
  const shard = [A, B].map((id) => `${JSON.stringify({ id, variant: "none", status: "pass", reason: null, adapted: null, escalation: null })}\n`).join("");
  const dir = makeRoot(
    {
      "bunfig.toml": "env = false\n",
      "conformance/variants": "none\npgsql\nsqlite\n",
      "conformance/inventory/support.jsonl": inventory,
      "conformance/expectations/support/framework/tests/Support/SupportCiTest.jsonl": shard,
      // A passes; B fails although expected to pass.
      "packages/support/tests/ported/Support/SupportCiTest.test.ts": `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(false); });\n`,
      // A second Component, cache, whose one test C fails although expected to pass.
      "conformance/inventory/cache.jsonl": `${JSON.stringify({ id: C, component: "cache", kind: "unit", backends: ["none"], source: "framework/tests/Cache/CacheCiTest.php:1-2", hash: "0".repeat(64), assertions: { assertTrue: 1 }, oracle: { none: "pass" } })}\n`,
      "conformance/expectations/cache/framework/tests/Cache/CacheCiTest.jsonl": `${JSON.stringify({ id: C, variant: "none", status: "pass", reason: null, adapted: null, escalation: null })}\n`,
      "packages/cache/tests/ported/Cache/CacheCiTest.test.ts": `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(C)}, {}, () => { Assert.assertTrue(false); });\n`,
      "stories/11.1.md": manifest("11.1", [A]),
      "stories/11.2.md": manifest("11.2", [B]),
      "stories/11.3.md": manifest("11.3", []),
    },
    true,
  );

  // run: the scope decides what the harness grades.
  const calls: (readonly string[] | null)[] = [];
  const harness = (_: string, components: readonly string[] | null): Promise<HarnessResult> => {
    calls.push(components);
    return Promise.resolve(fakeHarness(0));
  };
  const none = await runRatchet(dir, "planning/x", { env: await env(), harness, scope: { mode: "none", components: [], reason: "no graded path changed" } });
  expect(none.out).toEqual(["RATCHET ref=planning/x scope=none failures=0 passes=0 warnings=0"]);
  expect(none.code).toBe(0);
  expect(calls).toEqual([]);
  const scoped = await runRatchet(dir, "story/11.1", { env: await env(), harness, scope: { mode: "components", components: ["collections", "support"], reason: "r" } });
  expect(scoped.out).toEqual(["RATCHET ref=story/11.1 scope=components failures=0 passes=0 warnings=0"]);
  const full = await runRatchet(dir, "story/11.1", { env: await env(), harness, scope: { mode: "full", components: [], reason: "tools/x.ts" } });
  expect(full.out).toEqual(["RATCHET ref=story/11.1 scope=full failures=0 passes=0 warnings=0"]);
  const unscoped = await runRatchet(dir, "main", { env: await env(), harness });
  expect(unscoped.out.at(-1)).toBe("RATCHET ref=main scope=full failures=0 passes=0 warnings=0");
  expect(calls).toEqual([["collections", "support"], null, null]);
  // The real harness in components mode grades only that Component.
  const real = await runRatchet(dir, "main", { env: await env(), scope: { mode: "components", components: ["support"], reason: "r" } });
  expect(real.out).toEqual([`UNEXPECTED-FAILURE FAIL ${B} [none] expected=pass actual=fail asserts=1/1`, "RATCHET ref=main scope=components failures=1 passes=0 warnings=0"]);
  expect(real.code).toBe(1);
  // Unscoped, the same root also reports cache's failure: the scope above really left it out.
  const realFull = await runRatchet(dir, "main", { env: await env() });
  expect(realFull.out).toEqual([
    `UNEXPECTED-FAILURE FAIL ${C} [none] expected=pass actual=fail asserts=1/1`,
    `UNEXPECTED-FAILURE FAIL ${B} [none] expected=pass actual=fail asserts=1/1`,
    "RATCHET ref=main scope=full failures=2 passes=0 warnings=0",
  ]);
  const scopeFile = join(dir, ".cache-scope.json");
  writeFileSync(scopeFile, '{"mode":"none","components":[],"reason":"no graded path changed"}\n');
  const cliNone = Bun.spawnSync([process.execPath, RATCHET, "run", "--root", dir, "--ref", "planning/x", "--scope", scopeFile], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect([cliNone.exitCode, cliNone.stdout.toString()]).toEqual([0, "RATCHET ref=planning/x scope=none failures=0 passes=0 warnings=0\n"]);
  rmSync(scopeFile);

  // story: the skips, and the only two.
  expect(await runStoryTests(dir, "planning/x")).toEqual({ code: 0, out: ["STORY ref=planning/x skipped: not a Story ref"], err: [] });
  expect(await runStoryTests(dir, "main")).toEqual({ code: 0, out: ["STORY ref=main skipped: not a Story ref"], err: [] });
  expect(await runStoryTests(dir, "story/11.3")).toEqual({ code: 0, out: ["STORY ref=story/11.3 skipped: no test_ids"], err: [] });
  const missing = await runStoryTests(dir, "story/11.9");
  expect([missing.code, missing.err]).toEqual([1, ["ratchet story: stories/11.9.md does not exist"]]);
  // The harness gets the Story ID, never a sample, and its exit is forwarded.
  const stories: string[] = [];
  const forwarded = await runStoryTests(dir, "story/11.2", {
    harness: (_root, story) => {
      stories.push(story);
      return Promise.resolve(fakeHarness(1, ["X", "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1"]));
    },
  });
  expect(stories).toEqual(["11.2"]);
  expect(forwarded).toEqual({ code: 1, out: ["X", "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1"], err: [] });
  // The real harness over the Story's test_ids: 11.1's A passes (exit 0); 11.2's B fails (exit 1); full mode, no sample.
  const ok = Bun.spawnSync([process.execPath, RATCHET, "story", "--root", dir, "--ref", "story/11.1"], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect([ok.exitCode, ok.stdout.toString()]).toEqual([0, "SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0\n"]);
  const failing = Bun.spawnSync([process.execPath, RATCHET, "story", "--root", dir, "--ref", "story/11.2"], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect(failing.exitCode).toBe(1);
  expect(failing.stdout.toString()).toBe(`FAIL ${B} [none] expected=pass actual=fail asserts=1/1\nSUMMARY variants=1 run=1 not-run=0 checked=1 differ=1\n`);
  const skipped = Bun.spawnSync([process.execPath, RATCHET, "story", "--root", dir, "--ref", "planning/x"], { stdout: "pipe", stderr: "pipe" });
  expect([skipped.exitCode, skipped.stdout.toString()]).toEqual([0, "STORY ref=planning/x skipped: not a Story ref\n"]);
}, 120_000);

// ---------------------------------------------------------------------------
// XT-conformance-120

test("XT-conformance-120: the merge queue runs the full Ratchet on all alpha Variants for the queued PR's head ref, and the committed ruleset requires the queue on main (AD-16, AD-28)", () => {
  const { text, data } = workflow("ratchet.yml");
  expect(data.on["merge_group"]).toEqual({ types: ["checks_requested"] });
  const job = data.jobs["ratchet"]!;
  expect(job.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  expect(job.env).toMatchObject(SERVICE_ENV);
  expect(text).not.toMatch(/secrets\./);
  // The group commit itself is checked out (github.sha: no pull_request on a merge_group event).
  expect(job.steps[0]).toEqual({ uses: CHECKOUT, with: { ref: "${{ github.event.pull_request.base.sha || github.sha }}", "persist-credentials": false } });
  const queue = job.steps.filter((step) => (step.if ?? "").includes("merge_group"));
  expect(queue.map((step) => step.if)).toEqual(["github.event_name == 'push' || github.event_name == 'merge_group'", "github.event_name == 'merge_group'", "github.event_name == 'merge_group'"]);
  expect(queue[0]!.run).toBe("bun install --frozen-lockfile --ignore-scripts");
  // The PR number from the queue ref, its head branch from the API, both through env only.
  const find = queue[1]!;
  expect(find.id).toBe("pr");
  expect(find.env).toEqual({ GH_TOKEN: "${{ github.token }}", REPO: "${{ github.repository }}", QUEUE_REF: "${{ github.event.merge_group.head_ref }}" });
  expect(find.run).toContain('number="$(bun tools/ruleset/ruleset.ts merge-group-pr "$QUEUE_REF")"');
  expect(find.run).toContain('ref="$(gh pr view "$number" --repo "$REPO" --json headRefName --jq .headRefName)"');
  expect(find.run).toContain('echo "ref=$ref" >> "$GITHUB_OUTPUT"');
  expect(find.run).not.toContain("${{");
  // The full run: no --scope, at the root, for that ref.
  const run = queue[2]!;
  expect(run.run).toBe('bun tools/ratchet/ratchet.ts run --root . --ref "$HEAD_REF"');
  expect(run.env).toEqual({ HEAD_REF: "${{ steps.pr.outputs.ref }}" });
  // And the ruleset: the merge queue is a rule on main, and ratchet a required check.
  const main = JSON.parse(readFileSync(join(root, ".github", "rulesets", "main.json"), "utf8")) as { conditions: unknown; rules: { type: string; parameters?: Record<string, unknown> }[] };
  expect(main.conditions).toEqual({ ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } });
  const queueRule = main.rules.find((rule) => rule.type === "merge_queue");
  expect(queueRule?.parameters).toMatchObject({ merge_method: "SQUASH", grouping_strategy: "ALLGREEN" });
  // Every required check also reports in the queue, or the queue would stall.
  for (const [file, jobId] of [["ratchet.yml", "ratchet"], ["ci.yml", "check"], ["protected-paths.yml", "protected-paths"], ["ownership.yml", "ownership"]] as const) {
    const flow = workflow(file).data;
    expect([file, "merge_group" in flow.on, jobId in flow.jobs]).toEqual([file, true, true]);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-121

test("XT-conformance-121: the nightly runs the full matrix on linux and macOS, x64 and arm64, with native Postgres and Redis on macOS, and the benchmarks report and never fail the job (FR-9, AD-17, AD-28)", async () => {
  const { text, data } = workflow("nightly.yml");
  expect(Object.keys(data.on)).toEqual(["schedule", "workflow_dispatch"]);
  expect(data.on["schedule"]).toEqual([{ cron: expect.stringMatching(/^\d+ \d+ \* \* \*$/) as unknown as string }]);
  expect(data.permissions).toEqual({ contents: "read" });
  expect(Object.keys(data.jobs)).toEqual(["linux", "macos", "bench"]);
  expect(text).not.toMatch(/secrets\./);
  // Every action is pinned to the SHAs the other workflows use.
  for (const job of Object.values(data.jobs)) {
    expect(job.permissions).toBeUndefined();
    for (const step of job.steps.filter((candidate) => candidate.uses !== undefined)) {
      expect([CHECKOUT, SETUP_BUN]).toContain(step.uses!);
    }
    expect(job.steps[0]).toEqual({ uses: CHECKOUT, with: { "persist-credentials": false } });
    expect(job.steps[1]).toEqual({ uses: SETUP_BUN, with: { "bun-version-file": ".bun-version" } });
  }
  const linux = data.jobs["linux"]!;
  const macos = data.jobs["macos"]!;
  expect(linux.strategy).toEqual({ "fail-fast": false, matrix: { include: [{ os: "ubuntu-24.04", arch: "x64" }, { os: "ubuntu-24.04-arm", arch: "arm64" }] } });
  expect(macos.strategy).toEqual({ "fail-fast": false, matrix: { include: [{ os: "macos-15-intel", arch: "x64" }, { os: "macos-15", arch: "arm64" }] } });
  for (const job of [linux, macos]) {
    expect(job["runs-on"]).toBe("${{ matrix.os }}");
    expect(job.env).toEqual(SERVICE_ENV);
    expect(runsOf(job).slice(-2)).toEqual(["bun install --frozen-lockfile --ignore-scripts", 'bun tools/ratchet/ratchet.ts run --root . --ref "$REF"']);
    // The ref graded is the one checked out (main on the schedule), through env only.
    expect(job.steps.at(-1)!.env).toEqual({ REF: "${{ github.ref_name }}" });
    for (const node of [job, ...job.steps]) {
      expect(node["continue-on-error"]).toBeUndefined();
    }
  }
  expect(Object.fromEntries(Object.entries(linux.services!).map(([name, service]) => [name, service.image]))).toEqual({ postgres: "postgres:18", redis: "redis:8.10.2" });
  // macOS: no service containers; Homebrew installs and starts both natively and creates the postgres role.
  expect(macos.services).toBeUndefined();
  const native = runsOf(macos)[0]!;
  expect(native).toContain("brew install postgresql@18 redis");
  expect(native).toContain("brew services start postgresql@18");
  expect(native).toContain("brew services start redis");
  expect(native).toContain("CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';");
  expect(native).toContain('pg_isready" -h 127.0.0.1 -p 5432');
  expect(native).toContain("redis-cli -h 127.0.0.1 -p 6379 ping");
  // The unpinned Homebrew versions are on record.
  expect(native).toContain('"${prefix}/bin/postgres" --version');
  expect(native).toContain("redis-server --version");
  // bench: never fails the job, and the report goes to the job summary.
  const bench = data.jobs["bench"]!;
  expect(bench["runs-on"]).toBe("ubuntu-latest");
  expect(bench["continue-on-error"]).toBe(true);
  const benchStep = bench.steps.find((step) => (step.run ?? "").includes("bun run bench"))!;
  expect(benchStep["continue-on-error"]).toBe(true);
  expect(benchStep.run).toContain('>> "$GITHUB_STEP_SUMMARY"');

  // The runner: a throwing benchmark and a file that fails to load are BENCH-ERROR lines; the rest still run; exit 0.
  const dir = makeRoot({
    "conformance/bench/a.bench.ts": `export default [{ name: "adds", fn: () => 1 + 1 }, { name: "throws", fn: () => { throw new Error("bench boom\\nsecond line"); } }, { name: "after", fn: () => "x".repeat(3) }, { name: "rejects", fn: async () => { await Promise.resolve(); throw new Error("async boom"); } }, { name: "awaits", fn: async () => { await Promise.resolve(); return 1; } }];\n`,
    "conformance/bench/nested/b.bench.ts": `throw new Error("load boom");\n`,
    "packages/support/bench/c.bench.ts": `export default { name: "not an array" };\n`,
    "packages/support/bench/ignored.ts": `throw new Error("not a bench file");\n`,
  });
  const lines = await runBenchmarks(dir, { iterations: 3 });
  expect(lines.map((line) => line.replace(/median_ns=\d+/, "median_ns=N"))).toEqual([
    "BENCH conformance/bench/a.bench.ts adds median_ns=N iterations=3",
    "BENCH-ERROR conformance/bench/a.bench.ts throws bench boom",
    "BENCH conformance/bench/a.bench.ts after median_ns=N iterations=3",
    // An async benchmark is awaited: its rejection is a BENCH-ERROR, never an unhandled rejection.
    "BENCH-ERROR conformance/bench/a.bench.ts rejects async boom",
    "BENCH conformance/bench/a.bench.ts awaits median_ns=N iterations=3",
    "BENCH-ERROR conformance/bench/nested/b.bench.ts - load boom",
    "BENCH-ERROR packages/support/bench/c.bench.ts - the default export is not { name: string, fn: () => unknown }[]",
    "BENCH-SUMMARY ran=3 errors=4",
  ]);
  const cli = Bun.spawnSync([process.execPath, BENCH, "--root", dir, "--iterations", "2"], { stdout: "pipe", stderr: "pipe" });
  expect(cli.exitCode).toBe(0);
  expect(cli.stdout.toString()).toEndWith("BENCH-SUMMARY ran=3 errors=4\n");
  const empty = Bun.spawnSync([process.execPath, BENCH, "--root", makeRoot({})], { stdout: "pipe", stderr: "pipe" });
  expect([empty.exitCode, empty.stdout.toString()]).toEqual([0, "BENCH-SUMMARY ran=0 errors=0\n"]);
  for (const args of [["--bogus"], ["--iterations", "0"], ["--iterations"], ["--root", "a", "--root", "b"]]) {
    expect([args.join(" "), await benchMain(args)]).toEqual([args.join(" "), 2]);
  }
  // The starter benchmark runs clean over the committed Expectations File.
  const repo = await runBenchmarks(root, { iterations: 1 });
  expect(repo.filter((line) => line.startsWith("BENCH-ERROR"))).toEqual([]);
  expect(repo.some((line) => line.startsWith("BENCH conformance/bench/expectations.bench.ts compare the Expectations File with itself median_ns="))).toBe(true);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-122

test("XT-conformance-122: ratchet is a required check pinned to GitHub Actions in REQUIRED_CHECKS and the committed main ruleset, and the policy check flags a ruleset without it (AD-16, AD-28)", () => {
  expect(REQUIRED_CHECKS).toContain("ratchet");
  expect(ACTIONS_INTEGRATION_ID).toBe(15368);
  const main = JSON.parse(readFileSync(join(root, ".github", "rulesets", "main.json"), "utf8")) as { rules: { type: string; parameters?: { required_status_checks?: { context: string; integration_id: number }[] } }[] };
  const checks = main.rules.find((rule) => rule.type === "required_status_checks")!.parameters!.required_status_checks!;
  expect(checks.filter((check) => check.context === "ratchet")).toEqual([{ context: "ratchet", integration_id: 15368 }]);
  // The job id is the check's context.
  expect(Object.keys(workflow("ratchet.yml").data.jobs)).toEqual(["ratchet"]);
  expect(policyViolations(main, { "main.json": main }, null)).toEqual([]);
  // Without it, or pinned to another writer: a policy violation naming it.
  const without = structuredClone(main);
  const withoutChecks = without.rules.find((rule) => rule.type === "required_status_checks")!.parameters!;
  withoutChecks.required_status_checks = withoutChecks.required_status_checks!.filter((check) => check.context !== "ratchet");
  expect(policyViolations(without, { "main.json": without }, null)).toEqual(["policy: .github/rulesets/main.json does not require the `ratchet` check (AD-16)"]);
  const unpinned = structuredClone(main);
  unpinned.rules.find((rule) => rule.type === "required_status_checks")!.parameters!.required_status_checks!.find((check) => check.context === "ratchet")!.integration_id = 1;
  expect(policyViolations(unpinned, { "main.json": unpinned }, null)).toEqual([
    "policy: .github/rulesets/main.json does not pin the `ratchet` check to GitHub Actions (`integration_id: 15368`); any status writer could satisfy it (AD-16)",
  ]);
});
