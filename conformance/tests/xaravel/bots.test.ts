// Xaravel Tests for Story 5.8 (the quarantine and promotion bots and the
// Oracle Escalation collector; FR-3, AD-16, AD-28). These run under plain
// `bun test` until the harness's `xaravelTest` lands in Story 5.9. Fixture
// roots are hermetic git roots like ratchet.test.ts's, run by the real
// harness; GitHub is a `Bun.serve` fake that keeps the Git objects and PRs
// the bots write.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { apply, collect, detect, main, parsePlan, sha8, type Plan, type QuarantineProposal } from "../../../tools/bots/bots";
import { parseEscalation } from "../../../tools/escalations/escalations";
import { renderEscalation } from "../../../tools/oracle/fixtures";
import { BOT_LOGIN, botValueProblems, evaluatePr, type ContentSide } from "../../../tools/ownership/ownership";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";
import type { HarnessResult } from "../../harness/harness";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const OWNERSHIP_CLI = join(root, "tools", "ownership", "ownership.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const CLASS = "Illuminate\\Tests\\Support\\SupportBotsTest";
const FLAKY = `${CLASS}::testFlaky`;
const BROKEN = `${CLASS}::testBroken`;
const UNOWNED = `${CLASS}::testUnowned`;
const UNOWNED2 = `${CLASS}::testUnownedToo`;
const OWNED = `${CLASS}::testOwned`;
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportBotsTest.jsonl";
const TEST_FILE = "packages/support/tests/ported/Support/SupportBotsTest.test.ts";
const BOT = { login: BOT_LOGIN, type: "Bot" };
const MAIN_SHA = "1".repeat(40);
const ESCALATIONS = "conformance/escalations";

interface Line {
  id: string;
  status: string;
  reason?: string | null;
  escalation?: string | null;
}

function inventory(ids: readonly string[]): string {
  return ids
    .map((id, index) => `${JSON.stringify({ id, component: "support", kind: "unit", backends: ["none"], source: `framework/tests/Support/SupportBotsTest.php:${index + 1}-${index + 2}`, hash: HASH, assertions: { assertTrue: 1 }, oracle: { none: "pass" } })}\n`)
    .join("");
}

function lineText(line: Line): string {
  return JSON.stringify({ id: line.id, variant: "none", status: line.status, reason: line.reason === undefined ? (line.status === "skip" ? "not-ported-yet" : null) : line.reason, adapted: null, escalation: line.escalation ?? null });
}

function shard(lines: readonly Line[]): string {
  return lines.map((line) => `${lineText(line)}\n`).join("");
}

function manifest(storyId: string, testIds: string[]): string {
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: support\nstatus: in-progress\ntest_ids:\n${testIds.map((id) => `  - ${JSON.stringify(id)}`).join("\n")}\n---\n\n# Story ${storyId}\n`;
}

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-bots-"));
  roots.push(dir);
  for (const [path, text] of Object.entries({ "bunfig.toml": "env = false\n", "conformance/variants": "none\npgsql\nsqlite\n", "stories/11.9.md": manifest("11.9", ["Nothing\\Here::testNone"]), ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The harness runs only at the top level of a git worktree (AD-17).
  Bun.spawnSync(["git", "init", "-q", dir]);
  return dir;
}

/** A TCP port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function env(): Promise<Record<string, string | undefined>> {
  const port = String(await closedPort());
  return {
    ...process.env,
    CI: undefined,
    GITHUB_ACTIONS: undefined,
    GITHUB_SHA: "f".repeat(40),
    GITHUB_SERVER_URL: "https://github.example",
    GITHUB_REPOSITORY: "xaravel/framework",
    GITHUB_RUN_ID: "42",
    PGHOST: "127.0.0.1",
    PGPORT: port,
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: port,
  };
}

// ---------------------------------------------------------------------------
// The fake GitHub API

interface FakeState {
  /** Main's files (raw contents at MAIN_SHA). */
  main: Record<string, string>;
  /** Open PRs and their files. */
  pulls: { number: number; ref: string; files: PrFile[] }[];
  /** Existing bot/* branches. */
  branches: string[];
  /** POST /pulls answers HTTP 500. */
  failPulls?: boolean;
}

interface Fake {
  api: string;
  /** The files a created branch adds or changes, by path. */
  branch: (name: string) => Record<string, string>;
  opened: { title: string; head: string; base: string; body: string }[];
  writes: string[];
  /** Branches deleted through DELETE /git/refs/heads/<branch>. */
  deleted: string[];
  stop: () => Promise<void>;
}

function fakeGitHub(state: FakeState): Fake {
  const blobs = new Map<string, string>();
  const trees = new Map<string, { path: string; sha: string }[]>();
  const commits = new Map<string, string>();
  const refs = new Map<string, string>();
  const opened: Fake["opened"] = [];
  const writes: string[] = [];
  const deleted: string[] = [];
  let next = 0;
  const id = (): string => (++next).toString(16).padStart(40, "0");
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const base = "/repos/xaravel/framework";
      if (request.headers.get("authorization") !== "Bearer bot-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const path = url.pathname.slice(base.length);
      if (request.method === "DELETE" && path.startsWith("/git/refs/heads/")) {
        const name = path.slice("/git/refs/heads/".length);
        deleted.push(name);
        return refs.delete(name) ? new Response(null, { status: 204 }) : new Response("not found", { status: 422 });
      }
      if (request.method === "POST") {
        writes.push(path);
        const body = (await request.json()) as Record<string, unknown>;
        if (path === "/git/blobs") {
          const sha = id();
          blobs.set(sha, body["content"] as string);
          return Response.json({ sha });
        }
        if (path === "/git/trees") {
          expect(body["base_tree"]).toBe("t".repeat(40));
          const sha = id();
          trees.set(sha, body["tree"] as { path: string; sha: string }[]);
          return Response.json({ sha });
        }
        if (path === "/git/commits") {
          expect(body["parents"]).toEqual([MAIN_SHA]);
          const sha = id();
          commits.set(sha, body["tree"] as string);
          return Response.json({ sha });
        }
        if (path === "/git/refs") {
          refs.set((body["ref"] as string).replace(/^refs\/heads\//, ""), body["sha"] as string);
          return Response.json({ ref: body["ref"] });
        }
        if (path === "/pulls") {
          if (state.failPulls === true) {
            return new Response("boom", { status: 500 });
          }
          opened.push(body as Fake["opened"][number]);
          return Response.json({ html_url: `https://github.example/xaravel/framework/pull/${100 + opened.length}` });
        }
        return new Response("not found", { status: 404 });
      }
      if (path === "/git/ref/heads/main") {
        return Response.json({ object: { sha: MAIN_SHA } });
      }
      if (path === "/git/matching-refs/heads/bot/") {
        return Response.json([...state.branches, ...refs.keys()].map((name) => ({ ref: `refs/heads/${name}` })));
      }
      if (path === `/git/commits/${MAIN_SHA}`) {
        return Response.json({ tree: { sha: "t".repeat(40) } });
      }
      if (path === "/pulls") {
        return Response.json(state.pulls.map((pull) => ({ number: pull.number, head: { ref: pull.ref } })));
      }
      const files = /^\/pulls\/(\d+)\/files$/.exec(path);
      if (files !== null) {
        return Response.json(state.pulls.find((pull) => pull.number === Number(files[1]))?.files ?? []);
      }
      if (path.startsWith("/contents/")) {
        expect(url.searchParams.get("ref")).toBe(MAIN_SHA);
        const file = path.slice("/contents/".length);
        if (file === ESCALATIONS) {
          const names = Object.keys(state.main).filter((name) => name.startsWith(`${ESCALATIONS}/`)).map((name) => ({ name: name.slice(ESCALATIONS.length + 1), type: "file" }));
          return Response.json(names);
        }
        const text = state.main[file];
        return text === undefined ? new Response("not found", { status: 404 }) : new Response(text);
      }
      return new Response("not found", { status: 404 });
    },
  });
  return {
    api: `http://127.0.0.1:${server.port}`,
    branch: (name) => {
      const commit = refs.get(name);
      const tree = commit === undefined ? [] : (trees.get(commits.get(commit)!) ?? []);
      return Object.fromEntries(tree.map((entry) => [entry.path, blobs.get(entry.sha)!]));
    },
    opened,
    writes,
    deleted,
    stop: () => server.stop(true),
  };
}

const modified = (filename: string): PrFile => ({ filename, status: "modified" });
const added = (filename: string): PrFile => ({ filename, status: "added" });

function contents(base: Record<string, string>, head: Record<string, string>): (path: string, side: ContentSide) => string | null {
  return (path, side) => (side === "base" ? base : head)[path] ?? null;
}

/** `evaluatePr`'s violations for a bot/* PR whose shard and Escalation texts come from two maps. */
function judgeBot(files: PrFile[], base: Record<string, string>, head: Record<string, string>, author: { login: string; type: string } | null = BOT, ref = "bot/x"): string[] {
  const dir = makeRoot({});
  return evaluatePr(dir, { headRef: ref, files, changedFiles: files.length, content: contents(base, head), mergeBase: "b".repeat(40), headSha: "a".repeat(40), author }).violations;
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, { if?: string; needs?: string[]; environment?: string; concurrency?: Record<string, unknown>; permissions?: Record<string, string>; steps: { uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }[] }>;
}

function botsWorkflow(): { text: string; data: Workflow } {
  const text = readFileSync(join(root, ".github", "workflows", "bots.yml"), "utf8");
  return { text, data: Bun.YAML.parse(text) as Workflow };
}

// ---------------------------------------------------------------------------
// XT-conformance-123

xaravelTest("XT-conformance-123", "a test that fails on main and passes on rerun is quarantined on a bot/* branch with a new flaky ESC-bot-<n> holding the run evidence; a consistent failure is not (AD-16, AD-28)", async () => {
  const counter = "flaky-counter";
  const dir = makeRoot({
    "conformance/inventory/support.jsonl": inventory([BROKEN, FLAKY]),
    [SHARD]: shard([
      { id: BROKEN, status: "pass" },
      { id: FLAKY, status: "pass" },
    ]),
    [TEST_FILE]: [
      `import { existsSync, readFileSync, writeFileSync } from "node:fs";`,
      `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`,
      `const COUNTER = ${JSON.stringify(counter)};`,
      `portedTest(${JSON.stringify(BROKEN)}, {}, () => { Assert.assertTrue(false); });`,
      // Fails on the 1st and 3rd run, passes on the 2nd and 4th.
      `portedTest(${JSON.stringify(FLAKY)}, {}, () => { const n = existsSync(COUNTER) ? Number(readFileSync(COUNTER, "utf8")) : 0; writeFileSync(COUNTER, String(n + 1)); Assert.assertTrue(n % 2 === 1); });`,
    ].join("\n"),
  });
  const before = readFileSync(join(dir, SHARD), "utf8");
  // The checked-out commit names the plan's sha, not GITHUB_SHA (under workflow_run that is main's tip).
  const git = (...args: string[]) => Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdout: "pipe", stderr: "pipe" });
  git("add", "-A");
  expect(git("commit", "-qm", "fixture").exitCode).toBe(0);
  const commit = git("rev-parse", "HEAD").stdout.toString().trim();
  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  const run = await detect(dir, { ref: "main", env: await env() });
  expect(run.out).toEqual([
    `BOT-NONE ${BROKEN} [none] consistent failure`,
    `BOT-QUARANTINE ${FLAKY} [none] runs=unexpected-failure,match,unexpected-failure,match`,
    "BOTS ref=main quarantine=1 promote=0 none=1",
  ]);
  expect(run.code).toBe(0);
  expect(readFileSync(join(dir, counter), "utf8")).toBe("4");
  const plan = run.plan!;
  expect(plan).toMatchObject({ ref: "main", sha: commit, run: "https://github.example/xaravel/framework/actions/runs/42" });
  expect(plan.proposals).toEqual([
    {
      kind: "quarantine",
      shard: SHARD,
      id: FLAKY,
      variant: "none",
      before: lineText({ id: FLAKY, status: "pass" }),
      after: { id: FLAKY, variant: "none", status: "quarantined", reason: null, adapted: null, escalation: "ESC-bot-1" },
      observations: ["unexpected-failure", "match", "unexpected-failure", "match"],
    },
  ]);
  // The plan file round-trips through the CLI's parser.
  expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);

  // apply: main holds ESC-bot-1, an open bot PR holds ESC-bot-2, so the quarantine opens ESC-bot-3.
  const state: FakeState = {
    main: { [SHARD]: before, [`${ESCALATIONS}/ESC-bot-1.md`]: "x", [`${ESCALATIONS}/ESC-5.1-1.md`]: "x" },
    pulls: [
      { number: 7, ref: "bot/oracle-esc-00000000", files: [added(`${ESCALATIONS}/ESC-bot-2.md`)] },
      { number: 8, ref: "story/9.1", files: [added(`${ESCALATIONS}/ESC-bot-9.md`)] },
    ],
    branches: [],
  };
  const fake = fakeGitHub(state);
  try {
    const branch = `bot/quarantine-${sha8(`${FLAKY} [none]`)}`;
    const applied = await apply(plan, { repo: "xaravel/framework", api: fake.api, token: "bot-token" });
    expect(applied.out).toEqual(["BOT-PR https://github.example/xaravel/framework/pull/101", "BOTS applied=1 failed=0 skipped=0"]);
    expect(applied.code).toBe(0);
    const files = fake.branch(branch);
    expect(Object.keys(files).sort()).toEqual([`${ESCALATIONS}/ESC-bot-3.md`, SHARD]);
    // Exactly the one line changed; every other byte kept.
    expect(files[SHARD]).toBe(before.replace(lineText({ id: FLAKY, status: "pass" }), lineText({ id: FLAKY, status: "quarantined", escalation: "ESC-bot-3" })));
    const escalation = parseEscalation(`${ESCALATIONS}/ESC-bot-3.md`, files[`${ESCALATIONS}/ESC-bot-3.md`]!);
    expect(escalation.violations).toEqual([]);
    expect(escalation.escalation).toMatchObject({ trigger: "flaky", testIds: [FLAKY] });
    for (const evidence of ["run 1: unexpected-failure", "run 2: match", "run 3: unexpected-failure", "run 4: match", "on main", `at ${commit}`, "https://github.example/xaravel/framework/actions/runs/42", lineText({ id: FLAKY, status: "pass" })]) {
      expect([evidence, escalation.escalation!.evidence.includes(evidence)]).toEqual([evidence, true]);
    }
    expect(escalation.escalation!.proposed).toContain("previous line (status pass");
    expect(files[`${ESCALATIONS}/ESC-bot-3.md`]).toContain(`# ESC-bot-3: ${FLAKY} [none] is flaky on main`);
    expect(fake.opened).toHaveLength(1);
    expect(fake.opened[0]).toMatchObject({ head: branch, base: "main", title: `bot: quarantine ${FLAKY} [none]` });
    expect(fake.opened[0]!.body).toContain("run 1: unexpected-failure");
    // The change passes the ownership bot rules.
    expect(
      evaluatePr(dir, {
        headRef: branch,
        files: [modified(SHARD), added(`${ESCALATIONS}/ESC-bot-3.md`)],
        changedFiles: 2,
        content: contents({ [SHARD]: before }, files),
        author: BOT,
      }).violations,
    ).toEqual([]);

    // The same plan again: the branch exists.
    const again = await apply(plan, { repo: "xaravel/framework", api: fake.api, token: "bot-token" });
    expect(again.out).toEqual([`BOT-SKIP ${branch} exists`, "BOTS applied=0 failed=0 skipped=1"]);
    expect(again.code).toBe(0);
  } finally {
    await fake.stop();
  }

  // POST /pulls fails after the ref was created: the branch is deleted, so the next run retries; exit 1.
  const noPull = fakeGitHub({ main: { [SHARD]: before }, pulls: [], branches: [], failPulls: true });
  try {
    const branch = `bot/quarantine-${sha8(`${FLAKY} [none]`)}`;
    const result = await apply(plan, { repo: "xaravel/framework", api: noPull.api, token: "bot-token" });
    expect(result.out).toEqual([`BOT-FAIL ${branch} POST /pulls: HTTP 500`, "BOTS applied=0 failed=1 skipped=0"]);
    expect(result.code).toBe(1);
    expect(noPull.writes).toContain("/git/refs");
    expect(noPull.deleted).toEqual([branch]);
    expect(noPull.branch(branch)).toEqual({});
  } finally {
    await noPull.stop();
  }

  // The pre-write self-check: main's line carries an extra field the rebuilt line drops, which breaks the bot value rule.
  const extra = `${lineText({ id: FLAKY, status: "pass" }).slice(0, -1)},"note":"x"}`;
  const refusePlan: Plan = { ...plan, proposals: [{ ...(plan.proposals[0] as QuarantineProposal), before: extra }] };
  const refusing = fakeGitHub({ main: { [SHARD]: `${lineText({ id: BROKEN, status: "pass" })}\n${extra}\n` }, pulls: [], branches: [] });
  try {
    const result = await apply(refusePlan, { repo: "xaravel/framework", api: refusing.api, token: "bot-token" });
    expect(result.out[0]).toStartWith(`BOT-REFUSE bot/quarantine-${sha8(`${FLAKY} [none]`)} bot value: ${FLAKY} [none] in ${SHARD}: note changes from "x" to null`);
    expect(result.out[1]).toBe("BOTS applied=0 failed=1 skipped=0");
    expect(result.code).toBe(1);
    expect(refusing.writes).toEqual([]);
  } finally {
    await refusing.stop();
  }

  // Main's line moved on: stale, and nothing is written.
  const stale = fakeGitHub({ main: { [SHARD]: shard([{ id: BROKEN, status: "pass" }, { id: FLAKY, status: "fail-known" }]) }, pulls: [], branches: [] });
  try {
    const result = await apply(plan, { repo: "xaravel/framework", api: stale.api, token: "bot-token" });
    expect(result.out).toEqual([`BOT-SKIP bot/quarantine-${sha8(`${FLAKY} [none]`)} stale`, "BOTS applied=0 failed=0 skipped=1"]);
    expect(stale.writes).toEqual([]);
  } finally {
    await stale.stop();
  }

  // A mixed result on a skip line gets no proposal; a flaky fail-known line is quarantined.
  // `missing`: the run has neither a difference nor a result for the key.
  const fakeRun = (kinds: Record<string, ("unexpected-pass" | "unexpected-failure" | "match" | "missing")[]>) => {
    let n = 0;
    return async (): Promise<HarnessResult> => {
      const at = n++;
      const differences = Object.entries(kinds)
        .filter(([, list]) => list[at] !== "match" && list[at] !== "missing")
        .map(([id, list]) => ({ id, variant: "none", kind: list[at] as "unexpected-pass" | "unexpected-failure", text: `${id} [none]`, detail: null }));
      const results = Object.entries(kinds)
        .filter(([, list]) => list[at] !== "missing")
        .map(([id]) => ({ id, variant: "none", outcome: "pass" as const, belowFloor: false, performed: 1, upstream: 1 }));
      return { code: differences.length > 0 ? 1 : 0, out: ["SUMMARY variants=1 run=1 not-run=0 checked=2 differ=0"], err: [], results, differences, sample: null, worktree: null, xaravel: null };
    };
  };
  const mixed = makeRoot({ [SHARD]: shard([{ id: BROKEN, status: "skip" }, { id: FLAKY, status: "fail-known" }]) });
  const judged = await detect(mixed, {
    ref: "main",
    env: await env(),
    harness: fakeRun({ [BROKEN]: ["unexpected-pass", "match", "unexpected-pass", "unexpected-pass"], [FLAKY]: ["unexpected-pass", "unexpected-pass", "match", "unexpected-pass"] }),
  });
  expect(judged.out).toEqual([
    `BOT-NONE ${BROKEN} [none] mixed results on a skip line; runs=unexpected-pass,match,unexpected-pass,unexpected-pass`,
    `BOT-QUARANTINE ${FLAKY} [none] runs=unexpected-pass,unexpected-pass,match,unexpected-pass`,
    "BOTS ref=main quarantine=1 promote=0 none=1",
  ]);

  // A candidate the reruns never report is `missing`: no proposal, no quarantine.
  const vanished = await detect(mixed, { ref: "main", env: await env(), harness: fakeRun({ [FLAKY]: ["unexpected-failure", "missing", "missing", "missing"] }) });
  expect(vanished.out).toEqual([`BOT-NONE ${FLAKY} [none] no consistent result; runs=unexpected-failure,missing,missing,missing`, "BOTS ref=main quarantine=0 promote=0 none=1"]);
  expect(vanished.plan!.proposals).toEqual([]);

  // Over the cap: a mass failure proposes nothing.
  const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`${CLASS}::test${String(i).padStart(2, "0")}`, ["unexpected-failure" as const, "match" as const, "match" as const, "match" as const]]));
  const capped = await detect(mixed, { ref: "main", env: await env(), harness: fakeRun(many) });
  expect(capped.out).toEqual(["BOTS-CAP 51 candidates exceed 50; no proposals", "BOTS ref=main quarantine=0 promote=0 none=0"]);
  expect(capped.plan!.proposals).toEqual([]);
  expect(capped.code).toBe(0);

  // The CLI: a usage error exits 2, a thrown error 1.
  expect(await main(["detect", "--root", dir, "--ref", "main", "--out", join(dir, "plan.json"), "--runs", "0"])).toBe(2);
  expect(await main(["detect", "--root", join(dir, "nope"), "--ref", "main", "--out", join(dir, "plan.json")])).toBe(1);
}, 120_000);

// ---------------------------------------------------------------------------
// XT-conformance-124

xaravelTest("XT-conformance-124", "an unowned unexpected pass on main gets a bot/promote PR setting it to pass with reason null; one an open Story owns gets none (AD-16, AD-28)", async () => {
  const dir = makeRoot({
    "conformance/inventory/support.jsonl": inventory([OWNED, UNOWNED, UNOWNED2]),
    [SHARD]: shard([
      { id: OWNED, status: "skip" },
      { id: UNOWNED, status: "skip" },
      { id: UNOWNED2, status: "skip" },
    ]),
    [TEST_FILE]: [
      `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`,
      `portedTest(${JSON.stringify(OWNED)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(UNOWNED)}, {}, () => { Assert.assertTrue(true); });`,
      `portedTest(${JSON.stringify(UNOWNED2)}, {}, () => { Assert.assertTrue(true); });`,
    ].join("\n"),
    "stories/11.1.md": manifest("11.1", [OWNED]),
  });
  const before = readFileSync(join(dir, SHARD), "utf8");
  const run = await detect(dir, { ref: "main", env: await env() });
  expect(run.out).toEqual([`BOT-NONE ${OWNED} [none] owned by open Story 11.1`, `BOT-PROMOTE ${UNOWNED} [none]`, `BOT-PROMOTE ${UNOWNED2} [none]`, "BOTS ref=main quarantine=0 promote=2 none=1"]);
  expect(run.code).toBe(0);
  expect(run.plan!.proposals).toEqual([
    {
      kind: "promotion",
      changes: [
        { shard: SHARD, id: UNOWNED, variant: "none", before: lineText({ id: UNOWNED, status: "skip" }), after: { id: UNOWNED, variant: "none", status: "pass", reason: null, adapted: null, escalation: null } },
        { shard: SHARD, id: UNOWNED2, variant: "none", before: lineText({ id: UNOWNED2, status: "skip" }), after: { id: UNOWNED2, variant: "none", status: "pass", reason: null, adapted: null, escalation: null } },
      ],
    },
  ]);

  const fake = fakeGitHub({ main: { [SHARD]: before }, pulls: [], branches: [] });
  try {
    // Both keys, sorted, name the one promotion branch.
    const branch = `bot/promote-${sha8(`${UNOWNED} [none]\n${UNOWNED2} [none]`)}`;
    const applied = await apply(run.plan!, { repo: "xaravel/framework", api: fake.api, token: "bot-token" });
    expect(applied.out).toEqual(["BOT-PR https://github.example/xaravel/framework/pull/101", "BOTS applied=1 failed=0 skipped=0"]);
    const files = fake.branch(branch);
    expect(files).toEqual({ [SHARD]: shard([{ id: OWNED, status: "skip" }, { id: UNOWNED, status: "pass" }, { id: UNOWNED2, status: "pass" }]) });
    expect(fake.opened[0]).toMatchObject({ head: branch, base: "main" });
    expect(fake.opened[0]!.body).toContain(`\`${UNOWNED} [none]\``);
    expect(fake.opened[0]!.body).toContain(`\`${UNOWNED2} [none]\``);
    expect(evaluatePr(dir, { headRef: branch, files: [modified(SHARD)], changedFiles: 1, content: contents({ [SHARD]: before }, files), author: BOT }).violations).toEqual([]);
  } finally {
    await fake.stop();
  }

  // An open promotion PR makes a new promotion wait.
  const busy = fakeGitHub({ main: { [SHARD]: before }, pulls: [{ number: 3, ref: "bot/promote-0000aaaa", files: [modified(SHARD)] }], branches: ["bot/promote-0000aaaa"] });
  try {
    const result = await apply(run.plan!, { repo: "xaravel/framework", api: busy.api, token: "bot-token" });
    expect(result.out).toEqual([`BOT-SKIP bot/promote-${sha8(`${UNOWNED} [none]\n${UNOWNED2} [none]`)} pending`, "BOTS applied=0 failed=0 skipped=1"]);
    expect(result.code).toBe(0);
    expect(busy.writes).toEqual([]);
  } finally {
    await busy.stop();
  }

  // The CLI writes the plan file and prints the same lines.
  const out = join(dir, ".cache", "bots", "plan.json");
  const proc = Bun.spawn([process.execPath, join(root, "tools", "bots", "bots.ts"), "detect", "--root", dir, "--ref", "main", "--out", out, "--runs", "1"], {
    env: await env(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  expect([code, stdout]).toEqual([0, `BOT-NONE ${OWNED} [none] owned by open Story 11.1\nBOT-PROMOTE ${UNOWNED} [none]\nBOT-PROMOTE ${UNOWNED2} [none]\nBOTS ref=main quarantine=0 promote=2 none=1\n`]);
  expect((JSON.parse(readFileSync(out, "utf8")) as Plan).proposals).toHaveLength(1);
}, 120_000);

// ---------------------------------------------------------------------------
// XT-conformance-125

xaravelTest("XT-conformance-125", "a bot/* PR from the xaravel-bot App that changes only Expectations status values passes the ownership check; any other change, or another author, fails (AD-16, AD-28)", async () => {
  const S = "conformance/expectations/support/x.jsonl";
  const ESC = `${ESCALATIONS}/ESC-bot-4.md`;
  const A = "A::testA";
  const B = "B::testB";
  const base = { [S]: shard([{ id: A, status: "skip" }, { id: B, status: "pass" }]) };
  const promotion = { [S]: shard([{ id: A, status: "pass" }, { id: B, status: "pass" }]) };
  const quarantine = { [S]: shard([{ id: A, status: "skip" }, { id: B, status: "quarantined", escalation: "ESC-bot-4" }]) };

  // A promotion, and a quarantine with its ESC-bot in the PR: no violations.
  expect(judgeBot([modified(S)], base, promotion)).toEqual([]);
  expect(judgeBot([modified(S), added(ESC)], base, quarantine)).toEqual([]);

  const value = (problem: string) => expect.stringMatching(new RegExp(`^bot value: .*${problem}`));
  // An added line, a removed line, adapted changed, a reason left set, status skip, a quarantine without its ESC.
  expect(judgeBot([modified(S)], base, { [S]: base[S]! + shard([{ id: "C::testC", status: "pass" }]) })).toEqual([value("key set differs \\(added: C::testC \\[none\\]; removed: none\\)")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: A, status: "skip" }]) })).toEqual([value("key set differs \\(added: none; removed: B::testB \\[none\\]\\)")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: B, status: "pass" }, { id: A, status: "skip" }]) })).toEqual([value("reordered")]);
  expect(judgeBot([modified(S)], base, { [S]: base[S]!.replace(`"id":"${A}","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null`, `"id":"${A}","variant":"none","status":"pass","reason":null,"adapted":"DIV-1.1"`) })).toEqual([value("adapted changes from null to \"DIV-1.1\"")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: A, status: "pass", reason: "not-ported-yet" }, { id: B, status: "pass" }]) })).toEqual([value("reason must be null")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: A, status: "skip", reason: "deferred:x" }, { id: B, status: "pass" }]) })).toEqual([value("status \"skip\" is neither pass"), value("reason must be null")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: A, status: "skip" }, { id: B, status: "skip" }]) })).toEqual([value("status \"skip\" is neither pass"), value("reason must be null")]);
  expect(judgeBot([modified(S)], base, quarantine)).toEqual([value("quarantined with escalation \"ESC-bot-4\", which is not an ESC-bot-<n> this PR adds")]);
  expect(judgeBot([modified(S), added(ESC)], base, { [S]: shard([{ id: A, status: "skip" }, { id: B, status: "quarantined", escalation: "ESC-5.1-1" }]) })).toEqual([value("quarantined with escalation \"ESC-5.1-1\"")]);
  expect(judgeBot([modified(S)], base, { [S]: shard([{ id: A, status: "pass", escalation: "ESC-5.1-1" }, { id: B, status: "pass" }]) })).toEqual([value("escalation changes from null to \"ESC-5.1-1\" under pass")]);
  // Only a pass or fail-known line may become quarantined (here a skip, dropping its reason).
  expect(judgeBot([modified(S), added(ESC)], base, { [S]: shard([{ id: A, status: "quarantined", escalation: "ESC-bot-4" }, { id: B, status: "pass" }]) })).toEqual([
    `bot value: ${A} [none] in ${S}: status changes from "skip" to quarantined; a bot quarantines only pass or fail-known lines (AD-16)`,
  ]);
  const fromFailKnown = { [S]: shard([{ id: A, status: "fail-known" }, { id: B, status: "pass" }]) };
  expect(judgeBot([modified(S), added(ESC)], fromFailKnown, { [S]: shard([{ id: A, status: "quarantined", escalation: "ESC-bot-4" }, { id: B, status: "pass" }]) })).toEqual([]);
  // A bot only adds an ESC-bot-<n>.md: modifying, removing or renaming one is a violation.
  const escOnly = (status: string, previous?: string): PrFile => ({ filename: ESC, status, ...(previous === undefined ? {} : { previous_filename: previous }) });
  expect(judgeBot([escOnly("modified")], {}, {})).toEqual([`bot value: ${ESC} is modified; a bot/* branch only adds an ESC-bot-<n>.md, never changes, removes or renames one (AD-16)`]);
  expect(judgeBot([escOnly("removed")], {}, {})).toEqual([`bot value: ${ESC} is removed; a bot/* branch only adds an ESC-bot-<n>.md, never changes, removes or renames one (AD-16)`]);
  expect(judgeBot([escOnly("renamed", `${ESCALATIONS}/ESC-bot-3.md`)], {}, {})).toEqual([
    `bot value: ${ESCALATIONS}/ESC-bot-3.md is renamed; a bot/* branch only adds an ESC-bot-<n>.md, never changes, removes or renames one (AD-16)`,
    `bot value: ${ESC} is renamed; a bot/* branch only adds an ESC-bot-<n>.md, never changes, removes or renames one (AD-16)`,
  ]);
  expect(judgeBot([escOnly("added")], {}, {})).toEqual([]);

  // A shard added or removed, and a non-shard under conformance/expectations/.
  expect(judgeBot([added(S)], {}, promotion)).toEqual([value("is added")]);
  expect(judgeBot([{ filename: S, status: "removed" }], base, {})).toEqual([value("is removed")]);
  expect(judgeBot([added("conformance/expectations/support/notes.md")], {}, {})).toEqual([value("is not an Expectations shard")]);
  // Unreadable content fails closed.
  expect(judgeBot([modified(S)], base, {})).toEqual([`unreadable content: ${S} at ${"a".repeat(40)} could not be read; failing closed (AD-16)`]);
  // A non-App author, and no author at all.
  const identity = (who: string) => `bot identity: bot/x was opened by ${who}, not the xaravel-bot App (${BOT_LOGIN}); only its bot/* PRs are exempt (AD-16)`;
  expect(judgeBot([modified(S)], base, promotion, { login: "someone", type: "User" })).toEqual([identity("someone (type User)")]);
  expect(judgeBot([modified(S)], base, promotion, { login: BOT_LOGIN, type: "User" })).toEqual([identity(`${BOT_LOGIN} (type User)`)]);
  expect(judgeBot([modified(S)], base, promotion, null)).toEqual([identity("an unknown author")]);
  // A non-Expectations path: the existing path rule.
  expect(judgeBot([modified(S), added("tools/x.ts")], base, promotion)).toEqual([
    "bot scope: tools/x.ts is outside conformance/expectations/** and conformance/escalations/ESC-bot-<n>.md, the only paths a bot/* branch may change (AD-16)",
  ]);
  // The exported rule directly.
  expect(botValueProblems(new Map([[S, base[S]!]]), new Map([[S, quarantine[S]!]]), new Set(["ESC-bot-4"]))).toEqual([]);

  // `pr` reads the author from GET /pulls/<n> `user`.
  const pr = async (user: unknown): Promise<{ code: number; stdout: string; stderr: string }> => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        const repo = "/repos/xaravel/framework";
        if (url.pathname === `${repo}/pulls/7`) {
          return Response.json({ number: 7, head: { sha: "a".repeat(40), ref: "bot/promote-1" }, base: { sha: "c".repeat(40) }, changed_files: 1, user });
        }
        if (url.pathname === `${repo}/pulls/7/files`) {
          return Response.json([modified(S)]);
        }
        if (url.pathname === `${repo}/compare/${"c".repeat(40)}...${"a".repeat(40)}`) {
          return Response.json({ merge_base_commit: { sha: "b".repeat(40) } });
        }
        if (url.pathname === `${repo}/contents/${S}`) {
          return new Response(url.searchParams.get("ref") === "b".repeat(40) ? base[S] : promotion[S]);
        }
        return new Response("not found", { status: 404 });
      },
    });
    try {
      const proc = Bun.spawn([process.execPath, OWNERSHIP_CLI, "pr", "--repo", "xaravel/framework", "--pr", "7", "--root", makeRoot({})], {
        env: { PATH: process.env["PATH"] ?? "", GITHUB_API_URL: `http://127.0.0.1:${server.port}`, GH_TOKEN: "t" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      return { code, stdout, stderr };
    } finally {
      await server.stop(true);
    }
  };
  expect(await pr(BOT)).toEqual({ code: 0, stdout: "Ownership OK: PR #7: bot/promote-1 passed the bot rules (path, identity, status-only values).\n", stderr: "" });
  expect(await pr({ login: "someone", type: "User" })).toEqual({
    code: 1,
    stdout: "",
    stderr: `Ownership violations (AD-16):\n  bot identity: bot/promote-1 was opened by someone (type User), not the xaravel-bot App (${BOT_LOGIN}); only its bot/* PRs are exempt (AD-16)\n`,
  });

  // parsePlan refuses a non-shard path and a non-bot Escalation file before apply runs (apply's own pre-write BOT-REFUSE self-check is exercised in XT-conformance-123).
  expect(() => parsePlan({ ref: "main", sha: "x", run: "local", proposals: [{ kind: "promotion", changes: [{ shard: "tools/x.jsonl", id: A, variant: "none", before: "{}", after: {} }] }] })).toThrow("is not an Expectations shard path");
  expect(() => parsePlan({ ref: "main", sha: "x", run: "local", proposals: [{ kind: "escalation", file: "ESC-9.1-1.md", text: "", source: "" }] })).toThrow("needs file ESC-bot-<n>.md");

  // bots.yml: no secret outside `open`, `open` runs no harness or test, `detect` holds no environment.
  const { data } = botsWorkflow();
  expect(data.permissions).toEqual({ contents: "read" });
  for (const [id, job] of Object.entries(data.jobs)) {
    const text = JSON.stringify(job);
    expect([id, /secrets\./.test(text)]).toEqual([id, id === "open"]);
    expect([id, Object.values(job.permissions ?? {}).includes("write")]).toEqual([id, false]);
    expect([id, /--fast|--seed/.test(text)]).toEqual([id, false]);
  }
  const open = data.jobs["open"]!;
  expect(open.environment).toBe("bot");
  expect(open.concurrency).toEqual({ group: "bots-open", "cancel-in-progress": false });
  expect(open.needs).toEqual(["detect", "collect"]);
  expect(open.if).toBe("always() && (needs.detect.result == 'success' || needs.collect.result == 'success')");
  expect(open.permissions).toEqual({ contents: "read", actions: "read" });
  const openRuns = open.steps.map((step) => step.run ?? "").join("\n");
  expect(openRuns).not.toMatch(/harness|bun test|bun run test|ratchet|bots\.ts detect/);
  expect(openRuns).toContain("bots.ts apply --plan .cache/bots/plan.json");
  expect(open.steps.find((step) => step.uses?.startsWith("actions/checkout@"))!.with).toEqual({ ref: "main", "persist-credentials": false });
  const token = open.steps.find((step) => step.uses?.startsWith("actions/create-github-app-token@"))!;
  expect(token.uses).toBe("actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510");
  expect(token.with).toEqual({ "app-id": "${{ vars.XARAVEL_BOT_APP_ID }}", "private-key": "${{ secrets.XARAVEL_BOT_APP_KEY }}", "permission-contents": "write", "permission-pull-requests": "write" });
  expect(open.steps.find((step) => step.run?.includes("bots.ts apply"))!.env!["GH_TOKEN"]).toBe("${{ steps.app.outputs.token }}");
  const detectJob = data.jobs["detect"]!;
  expect(detectJob.environment).toBeUndefined();
  // A manual dispatch runs detect only from main, since the plan is labelled --ref main.
  expect(detectJob.if).toContain("(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')");
  expect(detectJob.permissions).toEqual({ contents: "read" });
  expect(detectJob.steps.map((step) => step.run ?? "").join("\n")).toContain("bun tools/bots/bots.ts detect --root . --ref main --out .cache/bots/plan.json");
  expect(data.on["workflow_run"]).toEqual({ workflows: ["ratchet", "nightly", "oracle"], types: ["completed"], branches: ["main"] });
  expect("workflow_dispatch" in data.on).toBe(true);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-189

xaravelTest("XT-conformance-189", "an ESC-bot-<n>.md the Oracle uploads is committed, renumbered, to conformance/escalations/ through a bot/oracle-esc PR (AD-16, AD-28)", async () => {
  const dir = makeRoot({});
  // Besides the heading, the body names its own id once more, and ESC-bot-10, which must not change.
  const text = `${renderEscalation("ESC-bot-1", [{ sha256: "a".repeat(64), id: "Illuminate\\Tests\\Support\\SupportStrTest::testRandom", component: "support", first: "b".repeat(64), second: "c".repeat(64) }])}\nSee ESC-bot-1 (not ESC-bot-10).\n`;
  const artifacts = join(dir, "esc");
  mkdirSync(join(artifacts, "oracle-escalation"), { recursive: true });
  writeFileSync(join(artifacts, "oracle-escalation", "ESC-bot-1.md"), text);
  const collected = collect(artifacts, "https://github.example/xaravel/framework/actions/runs/9", {});
  expect(collected.out).toEqual(["BOT-ESCALATION oracle-escalation/ESC-bot-1.md", "BOTS collected=1"]);
  expect(collected.code).toBe(0);
  expect(collected.plan!.proposals).toEqual([{ kind: "escalation", file: "ESC-bot-1.md", text, source: "https://github.example/xaravel/framework/actions/runs/9" }]);
  // A missing directory holds nothing.
  expect(collect(join(dir, "none"), "x", {}).out).toEqual(["BOTS collected=0"]);

  // Main already has ESC-bot-1: the PR adds ESC-bot-2 with its heading rewritten.
  const fake = fakeGitHub({ main: { [`${ESCALATIONS}/ESC-bot-1.md`]: "x" }, pulls: [], branches: [] });
  try {
    const branch = `bot/oracle-esc-${sha8(text)}`;
    const applied = await apply(collected.plan!, { repo: "xaravel/framework", api: fake.api, token: "bot-token" });
    expect(applied.out).toEqual(["BOT-PR https://github.example/xaravel/framework/pull/101", "BOTS applied=1 failed=0 skipped=0"]);
    const files = fake.branch(branch);
    const renumbered = text.replace("# ESC-bot-1: ", "# ESC-bot-2: ").replace("See ESC-bot-1 (not ESC-bot-10).", "See ESC-bot-2 (not ESC-bot-10).");
    expect(renumbered).not.toBe(text);
    expect(renumbered).toContain("See ESC-bot-2 (not ESC-bot-10).");
    expect(files).toEqual({ [`${ESCALATIONS}/ESC-bot-2.md`]: renumbered });
    expect(parseEscalation(`${ESCALATIONS}/ESC-bot-2.md`, renumbered).violations).toEqual([]);
    expect(fake.opened[0]).toMatchObject({ head: branch, base: "main" });
    expect(fake.opened[0]!.body).toContain("https://github.example/xaravel/framework/actions/runs/9");
    expect(evaluatePr(dir, { headRef: branch, files: [added(`${ESCALATIONS}/ESC-bot-2.md`)], changedFiles: 1, author: BOT }).violations).toEqual([]);
  } finally {
    await fake.stop();
  }

  // An open Oracle-Escalation PR makes a new one wait.
  const busy = fakeGitHub({ main: { [`${ESCALATIONS}/ESC-bot-1.md`]: "x" }, pulls: [{ number: 5, ref: "bot/oracle-esc-0000aaaa", files: [added(`${ESCALATIONS}/ESC-bot-2.md`)] }], branches: ["bot/oracle-esc-0000aaaa"] });
  try {
    const result = await apply(collected.plan!, { repo: "xaravel/framework", api: busy.api, token: "bot-token" });
    expect(result.out).toEqual([`BOT-SKIP bot/oracle-esc-${sha8(text)} pending`, "BOTS applied=0 failed=0 skipped=1"]);
    expect(result.code).toBe(0);
    expect(busy.writes).toEqual([]);
  } finally {
    await busy.stop();
  }

  // An invalid file exits 1 naming it.
  writeFileSync(join(artifacts, "oracle-escalation", "ESC-bot-2.md"), "---\ntrigger: nope\n---\n");
  const invalid = collect(artifacts, "x", {});
  expect(invalid.code).toBe(1);
  expect(invalid.err.join("\n")).toContain("oracle-escalation/ESC-bot-2.md is not a valid ESC-bot-<n>.md");
  expect(await main(["collect", "--from", artifacts, "--source", "x", "--out", join(dir, "plan.json")])).toBe(1);

  // bots.yml: collect runs after an oracle push, scheduled or dispatched run, on that run's commit, and downloads only the
  // artifacts the run has, with the run's token; a download error fails the step.
  const { data } = botsWorkflow();
  const job = data.jobs["collect"]!;
  expect(job.if).toBe(
    "github.event_name == 'workflow_run' && github.event.workflow_run.name == 'oracle' && (github.event.workflow_run.event == 'push' || github.event.workflow_run.event == 'schedule' || github.event.workflow_run.event == 'workflow_dispatch')",
  );
  expect(job.permissions).toEqual({ contents: "read", actions: "read" });
  expect(job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))!.with).toEqual({ ref: "${{ github.event.workflow_run.head_sha }}", "persist-credentials": false });
  const download = job.steps.find((step) => step.run?.includes("gh run download"))!;
  expect(download.run).toContain("set -euo pipefail");
  expect(download.run).toContain(`gh api "repos/\${REPO}/actions/runs/\${RUN_ID}/artifacts" --paginate --jq '.artifacts[].name'`);
  expect(download.run).toContain("for name in oracle-escalation oracle-determinism; do");
  expect(download.run).toContain('gh run download "$RUN_ID" --repo "$REPO" -n "$name" -D ".cache/bots/esc/${name}"');
  expect(download.run).not.toContain("||");
  expect(download.env).toMatchObject({ GH_TOKEN: "${{ github.token }}", RUN_ID: "${{ github.event.workflow_run.id }}" });
  expect(job.steps.map((step) => step.run ?? "").join("\n")).toContain('bun tools/bots/bots.ts collect --from .cache/bots/esc --source "$SOURCE" --out .cache/bots/plan.json');
}, 60_000);
