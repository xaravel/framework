// Xaravel Tests for Story 1.5 (Story manifests and edit-ownership check).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { allowedPath, checkDuplicates, evaluatePr, parseManifest, readManifests, STORIES_DIR, type Manifest } from "../../../tools/ownership/ownership";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "ownership", "ownership.ts");

interface ManifestFields {
  story_id?: unknown;
  epic?: unknown;
  component?: unknown;
  status?: unknown;
  test_ids?: unknown;
  xaravel_test_ids?: unknown;
}

/** Manifest text: frontmatter from `fields` (YAML is a JSON superset), then a body. */
function manifestText(fields: ManifestFields): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n# Story\n`;
}

function story(id: string, overrides: ManifestFields = {}): ManifestFields {
  return { story_id: id, epic: Number(id.split(".")[0]), component: "support", status: "backlog", test_ids: [`T-${id}`], ...overrides };
}

/** A hermetic root holding `stories/<id>.md` for each manifest. */
function fixtureRoot(stories: Record<string, ManifestFields | string> = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), "xaravel-ownership-"));
  mkdirSync(join(tmp, STORIES_DIR), { recursive: true });
  for (const [id, fields] of Object.entries(stories)) {
    writeFileSync(join(tmp, STORIES_DIR, `${id}.md`), typeof fields === "string" ? fields : manifestText(fields));
  }
  return tmp;
}

async function withRoots(roots: string[], body: (dirs: string[]) => Promise<void> | void): Promise<void> {
  try {
    await body(roots);
  } finally {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function runCli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: root,
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** Runs a workflow step's `run` text as the runner does (`bash -e`) from the repo root; returns its exit code and `$GITHUB_OUTPUT`. */
async function runStep(run: string, env: Record<string, string>): Promise<{ code: number; output: string }> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-step-"));
  try {
    const output = join(dir, "github-output");
    writeFileSync(output, "");
    const proc = Bun.spawn(["bash", "-e", "-c", run], {
      cwd: root,
      env: { PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`, GITHUB_OUTPUT: output, ...env },
      stdout: "ignore",
      stderr: "ignore",
    });
    const code = await proc.exited;
    return { code, output: readFileSync(output, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface FakePr {
  ref: string;
  files: PrFile[];
  changedFiles?: number;
  /** Endpoint paths (relative to the repo) that answer HTTP 500. */
  fail?: string[];
  /** Head contents by path; served for any ref, to prove the check never asks. */
  head?: Record<string, string>;
}

const file = (filename: string, previous?: string): PrFile =>
  previous === undefined ? { filename, status: "added" } : { filename, previous_filename: previous, status: "renamed" };

/** Runs `pr` against a `Bun.serve` fake of the GitHub API on port 0. */
async function runPr(pr: FakePr, rootDir: string): Promise<{ code: number; stdout: string; stderr: string; paths: string[] }> {
  const paths: string[] = [];
  const page = <T>(items: T[], url: URL): Response => {
    const size = Number(url.searchParams.get("per_page") ?? "30");
    const n = Number(url.searchParams.get("page") ?? "1");
    return Response.json(items.slice((n - 1) * size, n * size));
  };
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      paths.push(url.pathname);
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/xaravel/framework";
      if ((pr.fail ?? []).some((path) => url.pathname === `${base}/${path}`)) {
        return new Response("boom", { status: 500 });
      }
      if (url.pathname === `${base}/pulls/7`) {
        return Response.json({ number: 7, head: { sha: "a".repeat(40), ref: pr.ref }, changed_files: pr.changedFiles ?? pr.files.length });
      }
      if (url.pathname === `${base}/pulls/7/files`) {
        return page(pr.files, url);
      }
      if (url.pathname.startsWith(`${base}/contents/`)) {
        const content = (pr.head ?? {})[url.pathname.slice(`${base}/contents/`.length)];
        return content === undefined ? new Response("not found", { status: 404 }) : new Response(content);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const result = await runCli(["pr", "--repo", "xaravel/framework", "--pr", "7", "--root", rootDir], {
      GITHUB_API_URL: `http://localhost:${server.port}`,
      GH_TOKEN: "test-token",
    });
    return { ...result, paths };
  } finally {
    await server.stop(true);
  }
}

const manifest = (id: string, ids: string[], status: Manifest["status"] = "backlog", xt: string[] = []): Manifest => ({
  file: `${STORIES_DIR}/${id}.md`,
  storyId: id,
  epic: Number(id.split(".")[0]),
  component: "support",
  status,
  testIds: ids,
  xaravelTestIds: xt,
});

test("XT-conformance-22: every Story manifest requires story_id, epic, component and status, plus a non-empty test_ids or xaravel_test_ids; one without fails (AD-16, AD-21)", async () => {
  // Every committed manifest validates, and `manifests` passes on the repo root.
  const committed = readManifests(root);
  expect(committed.violations).toEqual([]);
  expect(committed.manifests.length).toBe(readdirSync(join(root, STORIES_DIR)).filter((name) => name.endsWith(".md")).length);
  expect(checkDuplicates(committed.manifests)).toEqual([]);
  const own = parseManifest("stories/1.5.md", readFileSync(join(root, STORIES_DIR, "1.5.md"), "utf8"));
  expect(own.violations).toEqual([]);
  expect(own.manifest).toMatchObject({ storyId: "1.5", epic: 1, component: "conformance" });
  expect(own.manifest!.xaravelTestIds).toEqual(["XT-conformance-22", "XT-conformance-23", "XT-conformance-24", "XT-conformance-25"]);
  const live = await runCli(["manifests"]);
  expect(live.code).toBe(0);
  expect(live.stdout).toStartWith("Ownership OK: ");

  const check = (fields: ManifestFields | string, name = "stories/9.1.md") =>
    parseManifest(name, typeof fields === "string" ? fields : manifestText(fields)).violations;
  expect(check(story("9.1"))).toEqual([]);
  expect(check(story("9.1", { test_ids: undefined, xaravel_test_ids: ["XT-support-1"] }))).toEqual([]);

  // No tests: both lists absent or empty.
  const noTests = check(story("9.1", { test_ids: [] }));
  expect(noTests).toHaveLength(1);
  expect(noTests[0]).toContain("invalid manifest: stories/9.1.md: test_ids/xaravel_test_ids are both absent or empty");
  expect(check(story("9.1", { test_ids: [], xaravel_test_ids: [] }))).toHaveLength(1);
  expect(check(story("9.1", { test_ids: undefined }))).toHaveLength(1);

  // Each missing required field is one violation naming the file and field.
  for (const field of ["story_id", "epic", "component", "status"] as const) {
    const missing = check(story("9.1", { [field]: undefined }));
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0]).toStartWith(`invalid manifest: stories/9.1.md: ${field} `);
  }
  expect(check(story("9.1", { component: undefined }))).toEqual([
    "invalid manifest: stories/9.1.md: component must be a kebab-case string, missing (AD-16)",
  ]);

  // Malformed values.
  expect(check(story("1.6"), "stories/1.5.md")[0]).toContain('story_id "1.6" must equal the file stem "1.5"');
  expect(check(story("9.1", { story_id: 9.1 }))[0]).toContain("story_id must be a string");
  expect(check(story("9.1", { epic: 8 }))[0]).toContain("epic 8 must equal the epic part of story_id");
  expect(check(story("9.1", { epic: "9" }))[0]).toContain("epic must be an integer");
  expect(check(story("9.1", { component: "Support" }))[0]).toContain("component must be a kebab-case string");
  expect(check(story("9.1", { status: "started" }))[0]).toContain("status must be one of backlog, ready-for-dev, in-progress, review, done, blocked");
  expect(check(story("9.1", { test_ids: "T1" }))[0]).toContain("test_ids must be a list of non-empty strings");
  expect(check(story("9.1", { xaravel_test_ids: [""] }))[0]).toContain("xaravel_test_ids must be a list of non-empty strings");
  expect(check(story("9.1", { test_ids: [" T1"] }))[0]).toContain("test_ids must be a list of non-empty strings without surrounding whitespace");
  expect(check(story("01.5", { epic: 1 }), "stories/01.5.md")[0]).toContain("story_id must be a string matching <epic>.<story>");
  expect(check("# no frontmatter\n")[0]).toContain("frontmatter is missing");
  expect(check("---\n: [\n---\n")[0]).toContain("frontmatter is not valid YAML");

  // The CLI fails, one stderr line per violation.
  await withRoots(
    [fixtureRoot({ "9.1": story("9.1", { test_ids: [] }), "9.2": story("9.2", { component: undefined }) }), fixtureRoot({ "9.1": story("9.1") })],
    async ([bad, good]) => {
      const failing = await runCli(["manifests", "--root", bad!]);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toContain("invalid manifest: stories/9.1.md: test_ids/xaravel_test_ids");
      expect(failing.stderr).toContain("invalid manifest: stories/9.2.md: component");
      expect(await runCli(["manifests", "--root", good!])).toMatchObject({ code: 0 });
      expect((await runCli(["manifests", "--root", join(good!, "missing")])).code).toBe(1);
      expect((await runCli(["manifests", "--bogus"])).code).toBe(2);
      expect((await runCli(["manifests", "--root"])).code).toBe(2);
      expect((await runCli([])).code).toBe(2);
    },
  );
});

test("XT-conformance-23: a story/<story-id> PR is judged by the manifest on the base checkout only; a branch with no manifest on base fails, other branches pass (AD-16, AD-21)", async () => {
  await withRoots([fixtureRoot({ "9.1": story("9.1"), "9.3": story("9.3", { component: undefined }) })], async ([base]) => {
    // No manifest on base.
    const missing = await runPr({ ref: "story/99.9", files: [file("packages/support/src/A.ts")] }, base!);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("missing manifest: branch story/99.9 has no stories/99.9.md on the base branch");

    // The PR adds its own manifest: still no manifest on base, and the head copy is never fetched.
    const ownManifest = manifestText(story("99.9", { component: "support" }));
    const adds = await runPr(
      { ref: "story/99.9", files: [file("stories/99.9.md"), file("packages/support/src/A.ts")], head: { "stories/99.9.md": ownManifest } },
      base!,
    );
    expect(adds.code).toBe(1);
    expect(adds.stderr).toContain("missing manifest: branch story/99.9 has no stories/99.9.md on the base branch");
    expect(adds.paths.some((path) => path.includes("/contents/"))).toBe(false);
    expect(adds.paths).toEqual(["/repos/xaravel/framework/pulls/7", "/repos/xaravel/framework/pulls/7/files"]);

    // The base manifest decides scope, whatever the PR's copy says.
    const head = { "stories/9.1.md": manifestText(story("9.1", { component: "container" })) };
    const judged = await runPr({ ref: "story/9.1", files: [file("packages/container/src/B.ts")], head }, base!);
    expect(judged.code).toBe(1);
    expect(judged.stderr).toContain("out of scope: packages/container/src/B.ts");

    // An invalid base manifest fails.
    const invalid = await runPr({ ref: "story/9.3", files: [file("packages/support/src/A.ts")] }, base!);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("invalid manifest: stories/9.3.md: component");

    // A branch that is not a Story ID fails; it cannot escape the stories directory.
    expect(evaluatePr(base!, { headRef: "story/../9.1", files: [], changedFiles: 0 }).violations[0]).toContain("missing manifest");

    // Not a Story branch: passes, whatever it touches.
    const planning = await runPr({ ref: "planning/x", files: [file("AGENTS.md"), file("packages/container/src/B.ts")] }, base!);
    expect(planning).toMatchObject({ code: 0, stdout: "Ownership OK: PR #7: planning/x is not a Story branch.\n" });
    expect(evaluatePr(base!, { headRef: "bot/expectations", files: [file("tools/x.ts")], changedFiles: 1 })).toEqual({
      storyId: null,
      outOfScope: [],
      violations: [],
    });
  });
});

test("XT-conformance-24: a Story PR changing files outside its four allowed paths exits 1 and lists the out-of-scope paths, sorted (AD-16, AD-21)", async () => {
  const support = { storyId: "9.1", component: "support" };
  for (const path of [
    "packages/support/src/A.ts",
    "packages/support/package.json",
    "conformance/expectations/support/x.jsonl",
    "conformance/oracle-requests/9.1.jsonl",
    "conformance/escalations/ESC-9.1-1.md",
    "conformance/escalations/ESC-9.1-12.md",
  ]) {
    expect([path, allowedPath(support, path)]).toEqual([path, true]);
  }
  for (const path of [
    "packages/supporting/src/A.ts",
    "packages/support",
    "packages/support/../container/x.ts",
    "packages/container/src/B.ts",
    "conformance/expectations/support.jsonl",
    "conformance/expectations/supporting/x.jsonl",
    "conformance/oracle-requests/9.2.jsonl",
    "conformance/oracle-requests/9.1.jsonl.bak",
    "conformance/oracle-requests/911.jsonl",
    "conformance/escalations/ESC-9.1-0.md",
    "conformance/escalations/ESC-9.1-x.md",
    "conformance/escalations/ESC-9.2-1.md",
    "conformance/escalations/ESC-901-1.md",
    "decisions/ESC-9.1-1.md",
    "stories/9.1.md",
  ]) {
    expect([path, allowedPath(support, path)]).toEqual([path, false]);
  }

  await withRoots([fixtureRoot({ "9.1": story("9.1") })], async ([base]) => {
    const inScope = await runPr(
      {
        ref: "story/9.1",
        files: [
          file("packages/support/src/A.ts"),
          file("conformance/expectations/support/x.jsonl"),
          file("conformance/oracle-requests/9.1.jsonl"),
          file("conformance/escalations/ESC-9.1-1.md"),
        ],
      },
      base!,
    );
    expect(inScope).toMatchObject({ code: 0, stdout: "Ownership OK: PR #7: every file is within Story 9.1's allowed paths.\n" });

    const outOfScope = await runPr(
      {
        ref: "story/9.1",
        files: [
          file("packages/support/src/A.ts"),
          file("packages/container/src/B.ts"),
          file("conformance/oracle-requests/9.2.jsonl"),
          file("conformance/escalations/ESC-9.2-1.md"),
        ],
      },
      base!,
    );
    expect(outOfScope.code).toBe(1);
    const listed = outOfScope.stderr
      .split("\n")
      .filter((line) => line.includes("out of scope: "))
      .map((line) => line.trim().split(" ")[3]);
    expect(listed).toEqual(["conformance/escalations/ESC-9.2-1.md", "conformance/oracle-requests/9.2.jsonl", "packages/container/src/B.ts"]);
    expect(outOfScope.stderr).not.toContain("packages/support/src/A.ts");

    // A rename into scope still lists the out-of-scope previous name.
    const renamed = await runPr({ ref: "story/9.1", files: [file("packages/support/x.ts", "packages/http/x.ts")] }, base!);
    expect(renamed.code).toBe(1);
    expect(renamed.stderr).toContain("out of scope: packages/http/x.ts");
    expect(renamed.stderr).not.toContain("out of scope: packages/support/x.ts");

    // A copy leaves its source untouched, so the source is not out of scope.
    const copied = await runPr({ ref: "story/9.1", files: [{ filename: "packages/support/x.ts", previous_filename: "packages/http/x.ts", status: "copied" }] }, base!);
    expect(copied.code).toBe(0);

    // Paging: more than one page of files is read in full.
    const bulk = Array.from({ length: 250 }, (_, i) => file(`packages/support/src/f${String(i).padStart(3, "0")}.ts`));
    const paged = await runPr({ ref: "story/9.1", files: [...bulk, file("tools/x.ts")] }, base!);
    expect(paged.code).toBe(1);
    expect(paged.stderr).toContain("out of scope: tools/x.ts");
    expect(paged.stderr).not.toContain("truncated");

    // A truncated file list fails closed.
    const truncated = await runPr({ ref: "story/9.1", files: [file("packages/support/src/A.ts")], changedFiles: 3001 }, base!);
    expect(truncated.code).toBe(1);
    expect(truncated.stderr).toContain("truncated file list: the API returned 1 of 3001 changed files; failing closed");

    // API errors fail closed.
    for (const fail of ["pulls/7", "pulls/7/files"]) {
      const broken = await runPr({ ref: "story/9.1", files: [file("packages/support/src/A.ts")], fail: [fail] }, base!);
      expect(broken.code).toBe(1);
      expect(broken.stderr).toMatch(/^Ownership check failed: .*HTTP 500\n$/);
    }

    // Usage errors exit 2.
    expect((await runCli(["pr", "--repo", "xaravel/framework"])).code).toBe(2);
    expect((await runCli(["pr", "--repo", "bad", "--pr", "7"])).code).toBe(2);
    expect((await runCli(["pr", "--repo", "xaravel/framework", "--pr", "x"])).code).toBe(2);
  });

  // The workflow: pull_request_target, merge_group (Story 1.7) and push to main, base checkout only, PR values through env.
  const text = readFileSync(join(root, ".github", "workflows", "ownership.yml"), "utf8");
  const workflow = Bun.YAML.parse(text) as {
    on: Record<string, { types?: string[]; branches?: string[] }>;
    permissions: Record<string, string>;
    jobs: Record<string, { if?: string; permissions?: Record<string, string>; steps: { id?: string; uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string> }[] }>;
  };
  expect(Object.keys(workflow.on)).toEqual(["pull_request_target", "merge_group", "push"]);
  expect(workflow.on["pull_request_target"]).toEqual({ branches: ["main"], types: ["opened", "edited", "synchronize", "reopened", "ready_for_review"] });
  expect(workflow.on["merge_group"]).toEqual({ types: ["checks_requested"] });
  expect(workflow.on["push"]).toEqual({ branches: ["main"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(Object.keys(workflow.jobs)).toEqual(["ownership", "manifests"]);
  const job = workflow.jobs["ownership"]!;
  expect(job.if).toBe("github.event_name == 'pull_request_target' || github.event_name == 'merge_group'");
  expect(job.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  expect(workflow.jobs["manifests"]!.permissions).toBeUndefined();
  const checkout = { uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } };
  const setupBun = { uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } };
  // The base commit only: the merge group's base, or the PR's base branch (the pull_request_target default).
  expect(job.steps.slice(0, 2)).toEqual([
    { uses: checkout.uses, with: { ref: "${{ github.event.merge_group.base_sha || github.sha }}", "persist-credentials": false } },
    setupBun,
  ]);
  expect(job.steps).toHaveLength(4);
  expect(job.steps[2]!.id).toBe("pr");
  expect(job.steps[2]!.env).toEqual({
    EVENT_NAME: "${{ github.event_name }}",
    EVENT_PR: "${{ github.event.pull_request.number }}",
    QUEUE_REF: "${{ github.event.merge_group.head_ref }}",
  });
  expect(job.steps[2]!.run).toBe(
    [
      'if [ "$EVENT_NAME" = merge_group ]; then',
      '  number="$(bun tools/ruleset/ruleset.ts merge-group-pr "$QUEUE_REF")"',
      "else",
      '  number="$EVENT_PR"',
      "fi",
      'echo "number=$number" >> "$GITHUB_OUTPUT"',
      "",
    ].join("\n"),
  );
  // The step, run as the runner runs it, names the queued PR or the event's PR under the key the check step reads.
  const queued = await runStep(job.steps[2]!.run!, { EVENT_NAME: "merge_group", QUEUE_REF: "refs/heads/gh-readonly-queue/main/pr-12-0123456789abcdef0123456789abcdef01234567", EVENT_PR: "" });
  expect(queued).toEqual({ code: 0, output: "number=12\n" });
  const direct = await runStep(job.steps[2]!.run!, { EVENT_NAME: "pull_request_target", QUEUE_REF: "", EVENT_PR: "34" });
  expect(direct).toEqual({ code: 0, output: "number=34\n" });
  // A queue ref that names no PR fails the step rather than passing an empty number on.
  expect(await runStep(job.steps[2]!.run!, { EVENT_NAME: "merge_group", QUEUE_REF: "refs/heads/main", EVENT_PR: "" })).toEqual({ code: 1, output: "" });
  const outputKey = queued.output.slice(0, queued.output.indexOf("="));
  expect(job.steps[3]!.env!["PR_NUMBER"]).toBe(`\${{ steps.${job.steps[2]!.id}.outputs.${outputKey} }}`);
  expect(job.steps[3]!.run).toBe('bun tools/ownership/ownership.ts pr --repo "$REPO" --pr "$PR_NUMBER"');
  expect(job.steps[3]!.env).toEqual({
    GH_TOKEN: "${{ github.token }}",
    REPO: "${{ github.repository }}",
    PR_NUMBER: "${{ steps.pr.outputs.number }}",
  });
  const manifestsJob = workflow.jobs["manifests"]!;
  // The merge group's own commit is never checked out.
  expect(manifestsJob.if).toBe("github.event_name != 'merge_group'");
  expect(manifestsJob.steps.slice(0, 2)).toEqual([checkout, setupBun]);
  expect(manifestsJob.steps).toHaveLength(3);
  expect(manifestsJob.steps[2]!.run).toBe("bun tools/ownership/ownership.ts manifests");
  for (const step of [...job.steps.slice(1), ...manifestsJob.steps]) {
    expect(step.with?.["ref"]).toBeUndefined();
    expect(step.run ?? "").not.toContain("${{");
    expect(step.run ?? "").not.toMatch(/\b(install|bun i|bun x|bunx|bun run)\b/);
  }
  expect(text).not.toMatch(/pull_request_review|\bpull_request:|github\.event\.pull_request\.head|github\.head_ref|merge_group\.head_sha|id-token/);
});

test("XT-conformance-25: a Test ID listed by two open Stories fails, naming both; Stories marked done no longer hold their IDs (AD-16, AD-21)", async () => {
  // Through the function.
  expect(checkDuplicates([manifest("9.1", ["T1"]), manifest("9.2", ["T1"])])).toEqual([
    "duplicate test id: T1 is listed by open Story 9.1, Story 9.2 (AD-16)",
  ]);
  expect(checkDuplicates([manifest("9.1", ["T1"], "done"), manifest("9.2", ["T1"])])).toEqual([]);
  // Xaravel Test IDs are pooled with Upstream Test IDs, across both lists.
  expect(checkDuplicates([manifest("9.10", [], "in-progress", ["XT-support-1"]), manifest("9.2", [], "blocked", ["XT-support-1"]), manifest("10.1", ["XT-support-1"])])).toEqual([
    "duplicate test id: XT-support-1 is listed by open Story 9.2, Story 9.10, Story 10.1 (AD-16)",
  ]);
  // An ID repeated inside one manifest.
  expect(checkDuplicates([manifest("9.1", ["T1", "T2"], "backlog", ["T1"])])).toEqual([
    "duplicate test id: T1 is listed more than once in stories/9.1.md (AD-16)",
  ]);

  // Through the CLI.
  await withRoots(
    [
      fixtureRoot({ "9.1": story("9.1", { test_ids: ["T1"] }), "9.2": story("9.2", { test_ids: ["T1", "T2"] }) }),
      fixtureRoot({ "9.1": story("9.1", { test_ids: ["T1"], status: "done" }), "9.2": story("9.2", { test_ids: ["T1"] }) }),
    ],
    async ([open, done]) => {
      const failing = await runCli(["manifests", "--root", open!]);
      expect(failing.code).toBe(1);
      expect(failing.stderr).toBe("Ownership violations (AD-16):\n  duplicate test id: T1 is listed by open Story 9.1, Story 9.2 (AD-16)\n");
      expect(await runCli(["manifests", "--root", done!])).toMatchObject({ code: 0 });
    },
  );
});
