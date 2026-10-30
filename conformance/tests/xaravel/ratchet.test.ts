// Xaravel Tests for Story 5.6 (the Ratchet; FR-3, AD-15, AD-16, AD-28).
// These run under plain `bun test` until the harness's `xaravelTest` lands in
// Story 5.9. Fixture roots are hermetic git roots holding a root
// `bunfig.toml`, an Inventory, an Expectations shard, `conformance/variants`,
// Story manifests and a stub Ported Test file that imports `portedTest` from
// the real `packages/assert` by absolute path; the real harness runs them.
import { afterAll, expect } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runHarness, type HarnessResult } from "../../harness/harness";
import { classify, main, overlay, runRatchet } from "../../../tools/ratchet/ratchet";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const CLI = join(root, "tools", "ratchet", "ratchet.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const CLASS = "Illuminate\\Tests\\Support\\SupportRatchetTest";
const A = `${CLASS}::testA`;
const B = `${CLASS}::testB`;
const C = `${CLASS}::testC`;
const D = `${CLASS}::testD`;
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportRatchetTest.jsonl";
const TEST_FILE = "packages/support/tests/ported/Support/SupportRatchetTest.test.ts";

interface Line {
  id: string;
  variant?: string;
  status: string;
}

function inventory(ids: readonly { id: string; backends?: string[] }[]): string {
  return ids
    .map(({ id, backends = ["none"] }, index) => `${JSON.stringify({ id, component: "support", kind: "unit", backends, source: `framework/tests/Support/SupportRatchetTest.php:${index + 1}-${index + 2}`, hash: HASH, assertions: { assertTrue: 1 }, oracle: Object.fromEntries(backends.map((backend) => [backend, "pass"])) })}\n`)
    .join("");
}

function shard(lines: readonly Line[]): string {
  return lines
    .map((line) => `${JSON.stringify({ id: line.id, variant: line.variant ?? "none", status: line.status, reason: line.status === "skip" ? "not-ported-yet" : null, adapted: null, escalation: null })}\n`)
    .join("");
}

function manifest(storyId: string, testIds: string[], status = "in-progress", sprintKey: string | null = null): string {
  const ids = testIds.map((id) => `  - ${JSON.stringify(id)}`).join("\n");
  return `---\nstory_id: "${storyId}"\nepic: ${storyId.split(".")[0]}\ncomponent: support\nstatus: ${status}\n${sprintKey === null ? "" : `sprint_key: ${sprintKey}\n`}test_ids:\n${ids}\n---\n\n# Story ${storyId}\n`;
}

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-ratchet-"));
  roots.push(dir);
  for (const [path, text] of Object.entries({ "bunfig.toml": "env = false\n", "conformance/variants": "none\npgsql\nsqlite\n", ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  // The harness runs only at the top level of a git worktree (AD-17).
  Bun.spawnSync(["git", "init", "-q", dir]);
  return dir;
}

/** The stub Ported Test file: A passes, B passes (expected fail-known), C fails (expected pass), D's dataset row D#0 passes (expected fail-known). */
const STUB = [
  `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};`,
  `portedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`,
  `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`,
  `portedTest(${JSON.stringify(C)}, {}, () => { Assert.assertTrue(false); });`,
  `portedTest(${JSON.stringify(D)}, { dataset: [[1]] }, (n: number) => { Assert.assertTrue(n === 1); });`,
].join("\n");

const IDS = [{ id: A }, { id: B }, { id: C }, { id: `${D}#0` }];

/** A TCP port nothing listens on. */
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

// ---------------------------------------------------------------------------
// XT-conformance-115

xaravelTest("XT-conformance-115", "a PR run lists every unexpected failure and every unexpected pass its own Story owns, and exits 1; a clean run exits 0 (FR-3, FR-4.1, FR-4.2, FR-9.4, AD-15, AD-28)", async () => {
  // Clean: every result matches its line.
  const clean = makeRoot({
    "conformance/inventory/support.jsonl": inventory([{ id: A }]),
    [SHARD]: shard([{ id: A, status: "pass" }]),
    [TEST_FILE]: `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\n`,
    "stories/11.1.md": manifest("11.1", [A]),
  });
  const ok = await runRatchet(clean, "story/11.1", { env: await env() });
  expect(ok.out).toEqual(["RATCHET ref=story/11.1 scope=full failures=0 passes=0 warnings=0"]); // Story 5.7: scope=full suffix
  expect(ok.code).toBe(0);
  expect(ok.err).toContain("SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0");

  // Story 11.1 owns B and the dataset test D (so its row D#0); C is expected to pass but fails.
  const dir = makeRoot({
    "conformance/inventory/support.jsonl": inventory(IDS),
    [SHARD]: shard([
      { id: A, status: "pass" },
      { id: B, status: "fail-known" },
      { id: C, status: "pass" },
      { id: `${D}#0`, status: "fail-known" },
    ]),
    [TEST_FILE]: STUB,
    "stories/11.1.md": manifest("11.1", [B, D]),
    "stories/11.2.md": manifest("11.2", [C]),
  });
  const run = await runRatchet(dir, "story/11.1", { env: await env() });
  expect(run.out).toEqual([
    `UNEXPECTED-PASS ${B} [none] expected=fail-known actual=pass asserts=1/1`,
    `UNEXPECTED-FAILURE FAIL ${C} [none] expected=pass actual=fail asserts=1/1`,
    `UNEXPECTED-PASS ${D}#0 [none] expected=fail-known actual=pass asserts=1/1`,
    "RATCHET ref=story/11.1 scope=full failures=1 passes=2 warnings=0", // Story 5.7: scope=full suffix
  ]);
  expect(run.code).toBe(1);
  // The harness report goes to stderr, unchanged.
  expect(run.err).toContain("SUMMARY variants=1 run=1 not-run=0 checked=4 differ=3");

  // An unexpected failure fails on every ref, main included, even when another Story owns the Test ID.
  const onMain = await runRatchet(dir, "main", { env: await env() });
  expect(onMain.out.filter((line) => line.startsWith("UNEXPECTED-FAILURE "))).toEqual([`UNEXPECTED-FAILURE FAIL ${C} [none] expected=pass actual=fail asserts=1/1`]);
  expect(onMain.out.at(-1)).toBe("RATCHET ref=main scope=full failures=1 passes=0 warnings=2"); // Story 5.7: scope=full suffix
  expect(onMain.code).toBe(1);

  // In CI an unreachable alpha Variant is an unexpected failure.
  const ci = makeRoot({
    "conformance/inventory/support.jsonl": inventory([{ id: A }, { id: B, backends: ["pgsql"] }]),
    [SHARD]: shard([
      { id: A, status: "pass" },
      { id: B, variant: "pgsql", status: "pass" },
    ]),
    [TEST_FILE]: `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\n`,
    "stories/11.1.md": manifest("11.1", [A]),
  });
  const ciRun = await runRatchet(ci, "story/11.1", { env: await env({ CI: "true" }) });
  const failures = ciRun.out.filter((line) => line.startsWith("UNEXPECTED-FAILURE "));
  expect(failures.some((line) => line.startsWith("UNEXPECTED-FAILURE NOT-RUN [pgsql] 1 line(s): ") && line.endsWith("; CI runs every alpha variant (FR-9)"))).toBe(true);
  expect(ciRun.code).toBe(1);

  // The harness's difference kinds: only UNEXPECTED-PASS is a pass; everything else, UNKNOWN and ERROR included, is a failure.
  const verdict = classify(
    [
      { id: "X", variant: "none", kind: "unexpected-failure", text: "UNKNOWN X [none] expected=- actual=pass asserts=1/-", detail: null },
      { id: "-", variant: "none", kind: "unexpected-failure", text: "ERROR [none] bun test exited 1 with no failing testcase", detail: null },
    ],
    "story/11.1",
    [],
  );
  expect(verdict).toEqual({
    lines: [
      { kind: "failure", text: "UNEXPECTED-FAILURE UNKNOWN X [none] expected=- actual=pass asserts=1/-" },
      { kind: "failure", text: "UNEXPECTED-FAILURE ERROR [none] bun test exited 1 with no failing testcase" },
    ],
    failures: 2,
    passes: 0,
    warnings: 0,
  });

  // bun test exits non-zero with no failing testcase (a Ported Test file throws on import): the harness's ERROR line is an unexpected failure.
  const erroring = makeRoot({
    "conformance/inventory/support.jsonl": inventory([{ id: A }]),
    [SHARD]: shard([{ id: A, status: "pass" }]),
    [TEST_FILE]: `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\n`,
    "packages/support/tests/ported/Support/BrokenTest.test.ts": `throw new Error("import boom");\n`,
    "stories/11.1.md": manifest("11.1", [A]),
  });
  const errored = await runRatchet(erroring, "story/11.1", { env: await env() });
  expect(errored.out).toEqual(["UNEXPECTED-FAILURE ERROR [none] bun test exited 1 with no failing testcase", "RATCHET ref=story/11.1 scope=full failures=1 passes=0 warnings=0"]); // Story 5.7: scope=full suffix
  expect(errored.code).toBe(1);

  // A harness that exits 1 with no counted difference never reads as clean.
  const uncounted = await runRatchet(clean, "main", {
    env: await env(),
    harness: () => Promise.resolve({ code: 1, out: ["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1"], err: [], results: [], differences: [], sample: null, worktree: null, xaravel: null }),
  });
  expect(uncounted.out).toEqual(["UNEXPECTED-FAILURE harness exited 1 with no counted difference", "RATCHET ref=main scope=full failures=1 passes=0 warnings=0"]); // Story 5.7: scope=full suffix
  expect(uncounted.code).toBe(1);

  // A harness precondition failure fails closed with no RATCHET line; so do unreadable manifests.
  const broken = makeRoot({ "conformance/inventory/support.jsonl": inventory([{ id: A }]), [SHARD]: shard([{ id: A, status: "pass" }]), "stories/11.1.md": manifest("11.1", [A]) });
  rmSync(join(broken, "bunfig.toml"));
  const precondition = await runRatchet(broken, "main", { env: await env() });
  expect(precondition.code).toBe(1);
  expect(precondition.out).toEqual([]);
  expect(precondition.err.join("\n")).toContain("the root bunfig.toml does not exist");
  writeFileSync(join(broken, "stories", "11.1.md"), "not a manifest\n");
  const badManifest = await runRatchet(broken, "main", { env: await env() });
  expect(badManifest.code).toBe(1);
  expect(badManifest.err.join("\n")).toContain("the Story manifests could not be read; failing closed: invalid manifest: stories/11.1.md");

  // The CLI: streams, exit codes and the package.json script.
  const cli = Bun.spawnSync([process.execPath, CLI, "run", "--root", dir, "--ref", "story/11.1"], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect(cli.exitCode).toBe(1);
  expect(cli.stdout.toString()).toEndWith("RATCHET ref=story/11.1 scope=full failures=1 passes=2 warnings=0\n"); // Story 5.7: scope=full suffix
  expect(cli.stderr.toString()).toContain("SUMMARY variants=1 run=1 not-run=0 checked=4 differ=3");
  for (const args of [["run"], ["run", "--ref"], ["run", "--ref", "main", "--bogus", "x"], ["overlay", "--base", "."], ["nope"], []]) {
    const usage = Bun.spawnSync([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe" });
    expect([args.join(" "), usage.exitCode]).toEqual([args.join(" "), 2]);
  }
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["ratchet"]).toBe("bun --no-env-file tools/ratchet/ratchet.ts");
}, 120_000);

xaravelTest("XT-conformance-246", "the ratchet workflow runs the PR's code under pull_request_target with the base's grader, read-only, with no secrets, on every alpha Variant's service (FR-3, FR-9.4, AD-16.2, AD-16.3, AD-28.1, AD-28.2)", () => {
  const text = readFileSync(join(root, ".github", "workflows", "ratchet.yml"), "utf8");
  type Step = { uses?: string; if?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string>; "working-directory"?: string; "continue-on-error"?: unknown };
  const workflow = Bun.YAML.parse(text) as {
    on: Record<string, { branches?: string[]; types?: string[] }>;
    permissions: Record<string, string>;
    jobs: Record<string, { if?: unknown; permissions?: unknown; services: Record<string, { image: string }>; env: Record<string, string>; steps: Step[]; "continue-on-error"?: unknown }>;
  };
  // Story 5.7: the merge queue runs the Ratchet too (XT-conformance-120).
  expect(Object.keys(workflow.on)).toEqual(["pull_request_target", "merge_group", "push"]);
  expect(workflow.on["merge_group"]).toEqual({ types: ["checks_requested"] });
  expect(workflow.on["pull_request_target"]).toEqual({ branches: ["main"], types: ["opened", "synchronize", "reopened", "ready_for_review"] });
  expect(workflow.on["push"]).toEqual({ branches: ["main"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(Object.keys(workflow.jobs)).toEqual(["ratchet"]);
  const job = workflow.jobs["ratchet"]!;
  // Retro 5 item 1: no job-level condition; a skipped required check counts as passing.
  expect(job.if).toBeUndefined();
  // Story 5.7: read-only job permissions; `pull-requests: read` only lets the merge-group run read the queued PR's head branch.
  expect(job.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  expect(text).not.toMatch(/secrets\./);
  for (const node of [job, ...job.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
  }
  expect(Object.fromEntries(Object.entries(job.services).map(([name, service]) => [name, service.image]))).toEqual({ postgres: "postgres:18", redis: "redis:8.10.2" });
  expect(job.env).toMatchObject({ CI: "true", PGHOST: "127.0.0.1", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: "postgres", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379" });
  const checkouts = job.steps.filter((step) => (step.uses ?? "").startsWith("actions/checkout@"));
  expect(checkouts.map((step) => step.with)).toEqual([
    { ref: "${{ github.event.pull_request.base.sha || github.sha }}", "persist-credentials": false },
    { repository: "${{ github.event.pull_request.head.repo.full_name }}", ref: "${{ github.event.pull_request.head.sha }}", path: "pr", "persist-credentials": false },
  ]);
  const setup = job.steps.find((step) => (step.uses ?? "").startsWith("oven-sh/setup-bun@"))!;
  expect(setup.with).toEqual({ "bun-version-file": ".bun-version" });
  // Retro 5 item 1: only a same-repository PR's code is checked out or run; a fork PR fails closed.
  const SAME_REPO = "github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository";
  const FORK = "github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name != github.repository";
  expect(checkouts.map((step) => step.if ?? null)).toEqual([null, SAME_REPO]);
  const runs = job.steps.filter((step) => step.run !== undefined).map((step) => [step.if, step.run, step["working-directory"] ?? null]);
  const label = (run: string | null | undefined): string | null | undefined => {
    if ((run ?? "").startsWith("set -euo pipefail")) {
      return "<find the PR>";
    }
    if ((run ?? "").startsWith('echo "::error::')) {
      return "<refuse a fork>";
    }
    return run;
  };
  // Story 5.7: scope before the overlay, the PR graded over its scope, then the Story's tests in full; the merge
  // group's full run; main's full run.
  expect(runs.map(([condition, run, dir]) => [condition, label(run), dir])).toEqual([
    [FORK, "<refuse a fork>", null],
    [SAME_REPO, 'bun tools/ratchet/ratchet.ts scope --base . --head pr --out "$RUNNER_TEMP/ratchet-scope.json"', null],
    [SAME_REPO, "bun tools/ratchet/ratchet.ts overlay --base . --head pr", null],
    [SAME_REPO, "bun install --frozen-lockfile --ignore-scripts", "pr"],
    [SAME_REPO, 'bun tools/ratchet/ratchet.ts run --root pr --ref "$HEAD_REF" --scope "$RUNNER_TEMP/ratchet-scope.json"', null],
    [SAME_REPO, 'bun tools/ratchet/ratchet.ts story --root pr --ref "$HEAD_REF"', null],
    ["github.event_name == 'push' || github.event_name == 'merge_group'", "bun install --frozen-lockfile --ignore-scripts", null],
    ["github.event_name == 'merge_group'", "<find the PR>", null],
    ["github.event_name == 'merge_group'", 'bun tools/ratchet/ratchet.ts run --root . --ref "$HEAD_REF"', null],
    ["github.event_name == 'push'", "bun tools/ratchet/ratchet.ts run --root . --ref main", null],
  ]);
  // The PR's head ref reaches the shell only through env, never interpolated into the script.
  expect(job.steps.find((step) => (step.run ?? "").includes("--root pr"))!.env).toEqual({ HEAD_REF: "${{ github.event.pull_request.head.ref }}" });
  // Story 5.7: so does it for every step that names it.
  for (const step of job.steps.filter((candidate) => (candidate.run ?? "").includes("$HEAD_REF"))) {
    expect(step.run).not.toContain("${{");
    expect(Object.keys(step.env ?? {})).toContain("HEAD_REF");
  }
  // Retro 5 item 1: the refusal comes before every PR-code step, exits 1, and names the fork through env only.
  const refuse = job.steps.find((step) => step.if === FORK)!;
  const firstPrCode = job.steps.findIndex((step) => step.if === SAME_REPO);
  expect(job.steps.indexOf(refuse)).toBeLessThan(firstPrCode);
  expect(refuse.env).toEqual({ HEAD_REPO: "${{ github.event.pull_request.head.repo.full_name }}" });
  expect(refuse.run).not.toContain("${{");
  // The script itself fails and names the fork, or says the fork was deleted (head.repo null).
  for (const [headRepo, named] of [["someone/fork", "someone/fork"], ["", "<deleted fork>"]] as const) {
    const refused = Bun.spawnSync(["bash", "-c", refuse.run!], { env: { HEAD_REPO: headRepo, PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
    const stdout = refused.stdout.toString();
    expect([headRepo, refused.exitCode, stdout.includes("::error::"), stdout.includes(named)]).toEqual([headRepo, 1, true, true]);
  }
  // Every step that checks out `pr/` or runs with `pr` carries the same-repository guard.
  for (const step of job.steps.filter((candidate) => candidate.with?.["path"] === "pr" || candidate["working-directory"] === "pr" || /--(?:head|root) pr\b/.test(candidate.run ?? ""))) {
    expect([step.run ?? step.uses, step.if]).toEqual([step.run ?? step.uses, SAME_REPO]);
  }
});

xaravelTest("XT-conformance-247", "the overlay restores every Protected Path and the sprint status from the base into the PR tree, and leaves the PR's own code (AD-16.2)", () => {
  const list = "/conformance/\n!/conformance/expectations/\n/stories/\n/tools/\n/packages/assert/\n/packages/contracts/ after-phase:1\n/bunfig.toml\n/package.json\n";
  const base = makeRoot({
    "conformance/protected-paths": list,
    "conformance/harness/harness.ts": "base harness\n",
    "conformance/expectations/support/x.jsonl": "base line\n",
    "stories/11.1.md": "base manifest\n",
    "tools/x.ts": "base tool\n",
    "packages/assert/vendor/node_modules/v.js": "base vendored\n",
    "packages/assert/src/a.ts": "base grader\n",
    "packages/contracts/src/c.ts": "base contract\n",
    "packages/support/src/A.ts": "base code\n",
    "package.json": "{}\n",
    "_bmad-output/implementation-artifacts/sprint-status.yaml": "base status\n",
  });
  const head = makeRoot({
    "conformance/protected-paths": "/nothing/\n",
    "conformance/harness/harness.ts": "PR harness\n",
    "conformance/harness/extra.ts": "PR extra\n",
    "conformance/expectations/support/x.jsonl": "PR line\n",
    "stories/11.1.md": "PR manifest\n",
    "tools/evil.ts": "PR tool\n",
    "packages/assert/vendor/node_modules/v.js": "PR vendored\n",
    "packages/assert/src/a.ts": "PR grader\n",
    "packages/contracts/src/c.ts": "PR contract\n",
    "packages/support/src/A.ts": "PR code\n",
    "package.json": '{"scripts":{"test":"evil"}}\n',
    "_bmad-output/implementation-artifacts/sprint-status.yaml": "PR status\n",
  });
  // A symlink the PR planted at a Protected Path is replaced, never written through.
  const outside = join(mkdtempSync(join(tmpdir(), "xt-ratchet-outside-")), "target");
  roots.push(dirname(outside));
  writeFileSync(outside, "outside\n");
  rmSync(join(head, "bunfig.toml"));
  symlinkSync(outside, join(head, "bunfig.toml"));
  // And a symlinked Protected directory.
  rmSync(join(head, "tools"), { recursive: true });
  symlinkSync(dirname(outside), join(head, "tools"));

  const result = overlay(base, head);
  const read = (path: string): string | null => (existsSync(join(head, path)) ? readFileSync(join(head, path), "utf8") : null);
  expect(read("conformance/harness/harness.ts")).toBe("base harness\n");
  expect(read("conformance/harness/extra.ts")).toBeNull();
  expect(read("stories/11.1.md")).toBe("base manifest\n");
  expect(read("tools/x.ts")).toBe("base tool\n");
  expect(read("packages/assert/src/a.ts")).toBe("base grader\n");
  expect(read("package.json")).toBe("{}\n");
  // Only the top-level node_modules is skipped: a committed nested one under a Protected Path is restored.
  expect(read("packages/assert/vendor/node_modules/v.js")).toBe("base vendored\n");
  expect(read("conformance/protected-paths")).toBe(list);
  expect(read("_bmad-output/implementation-artifacts/sprint-status.yaml")).toBe("base status\n");
  expect(read("bunfig.toml")).toBe("env = false\n");
  expect(lstatSync(join(head, "bunfig.toml")).isSymbolicLink()).toBe(false);
  expect(lstatSync(join(head, "tools")).isDirectory()).toBe(true);
  expect(readFileSync(outside, "utf8")).toBe("outside\n");
  // Not Protected (an exclusion, an inactive after-phase entry, a Component's code): the PR's own copy stays.
  expect(read("conformance/expectations/support/x.jsonl")).toBe("PR line\n");
  expect(read("packages/contracts/src/c.ts")).toBe("PR contract\n");
  expect(read("packages/support/src/A.ts")).toBe("PR code\n");
  expect(result.removed).toContain("conformance/harness/extra.ts");
  // The CLI.
  writeFileSync(join(head, "tools", "x.ts"), "PR again\n");
  const proc = Bun.spawnSync([process.execPath, CLI, "overlay", "--base", base, "--head", head], { stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(0);
  expect(proc.stdout.toString()).toMatch(/^Ratchet overlay: \d+ graded file\(s\) restored from the base, \d+ removed from the head\.\n$/);
  expect(read("tools/x.ts")).toBe("base tool\n");
});

// ---------------------------------------------------------------------------
// XT-conformance-118

xaravelTest("XT-conformance-118", "an unexpected pass owned by no open Story warns and exits 0 on main; one owned by another open Story warns in this run and fails that Story's own run (FR-3, AD-16.6)", async () => {
  const dir = makeRoot({
    "conformance/inventory/support.jsonl": inventory([{ id: A }, { id: B }]),
    [SHARD]: shard([
      { id: A, status: "fail-known" },
      { id: B, status: "fail-known" },
    ]),
    [TEST_FILE]: `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });\n`,
    "stories/11.1.md": manifest("11.1", ["T-11.1"]),
    "stories/11.2.md": manifest("11.2", [B], "in-progress", "11-2-x"),
    "_bmad-output/implementation-artifacts/sprint-status.yaml": "development_status:\n  11-2-x: in-progress\n",
  });
  const harnessRun = await runHarness(dir, { env: await env() });
  expect(harnessRun.differences.map((difference) => [difference.id, difference.kind])).toEqual([
    [A, "unexpected-pass"],
    [B, "unexpected-pass"],
  ]);
  const cached = (): Promise<HarnessResult> => Promise.resolve(harnessRun);
  const passA = `UNEXPECTED-PASS ${A} [none] expected=fail-known actual=pass asserts=1/1`;
  const passB = `UNEXPECTED-PASS ${B} [none] expected=fail-known actual=pass asserts=1/1`;

  // On main: both are warnings, exit 0; under GitHub Actions each also gets a ::warning:: annotation.
  const onMain = await runRatchet(dir, "main", { env: await env(), harness: cached });
  expect(onMain.out).toEqual([
    `WARNING ${passA} (owned by no open Story)`,
    `WARNING ${passB} (owned by open Story 11.2; fails that Story's next run)`,
    "RATCHET ref=main scope=full failures=0 passes=0 warnings=2", // Story 5.7: scope=full suffix
  ]);
  expect(onMain.code).toBe(0);
  const annotated = await runRatchet(dir, "main", { env: await env({ GITHUB_ACTIONS: "true" }), harness: cached });
  expect(annotated.out).toEqual([
    `WARNING ${passA} (owned by no open Story)`,
    `::warning::WARNING ${passA} (owned by no open Story)`,
    `WARNING ${passB} (owned by open Story 11.2; fails that Story's next run)`,
    `::warning::WARNING ${passB} (owned by open Story 11.2; fails that Story's next run)`,
    "RATCHET ref=main scope=full failures=0 passes=0 warnings=2", // Story 5.7: scope=full suffix
  ]);
  expect(annotated.code).toBe(0);

  // Story 11.1's run: B belongs to open Story 11.2, so it only warns here.
  const other = await runRatchet(dir, "story/11.1", { env: await env(), harness: cached });
  expect(other.out).toEqual([`WARNING ${passA} (owned by no open Story)`, `WARNING ${passB} (owned by open Story 11.2; fails that Story's next run)`, "RATCHET ref=story/11.1 scope=full failures=0 passes=0 warnings=2"]); // Story 5.7: scope=full suffix
  expect(other.code).toBe(0);
  // Story 11.2's own run fails on it.
  const owner = await runRatchet(dir, "story/11.2", { env: await env(), harness: cached });
  expect(owner.out).toEqual([`WARNING ${passA} (owned by no open Story)`, passB, "RATCHET ref=story/11.2 scope=full failures=0 passes=1 warnings=1"]); // Story 5.7: scope=full suffix
  expect(owner.code).toBe(1);

  // Once sprint status marks Story 11.2 done, nobody open owns B: a warning on its branch too.
  writeFileSync(join(dir, "_bmad-output", "implementation-artifacts", "sprint-status.yaml"), "development_status:\n  11-2-x: done\n");
  const done = await runRatchet(dir, "story/11.2", { env: await env(), harness: cached });
  expect(done.out).toEqual([`WARNING ${passA} (owned by no open Story)`, `WARNING ${passB} (owned by no open Story)`, "RATCHET ref=story/11.2 scope=full failures=0 passes=0 warnings=2"]); // Story 5.7: scope=full suffix
  expect(done.code).toBe(0);

  // The CLI exits 0 on warnings alone; a root it cannot read fails closed.
  const cli = Bun.spawnSync([process.execPath, CLI, "run", "--root", dir, "--ref", "main"], { env: await env(), stdout: "pipe", stderr: "pipe" });
  expect([cli.exitCode, cli.stdout.toString()]).toEqual([0, `WARNING ${passA} (owned by no open Story)\nWARNING ${passB} (owned by no open Story)\nRATCHET ref=main scope=full failures=0 passes=0 warnings=2\n`]); // Story 5.7: scope=full suffix
  expect(await main(["run", "--ref", "main", "--root", join(dir, "missing")])).toBe(1);
}, 120_000);
