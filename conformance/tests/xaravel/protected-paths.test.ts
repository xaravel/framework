// Xaravel Tests for Story 1.4 (Protected Paths and the protected-paths check).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  activePhases,
  CODEOWNERS_PATH,
  checkMirror,
  evaluatePr,
  isProtected,
  LIST_PATH,
  MAINTAINER,
  parseList,
  renderCodeowners,
  type PrFile,
  type PrReview,
} from "../../../tools/protected-paths/protected-paths";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "protected-paths", "protected-paths.ts");
const listText = readFileSync(join(root, LIST_PATH), "utf8");
const entries = parseList(listText);
const NONE = new Set<number>();
const PHASE_1 = new Set([1]);
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

/** A hermetic root holding the committed list and its CODEOWNERS rendering, optionally past Phase 1. */
function fixtureRoot(options: { phase1Exit?: boolean } = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), "xaravel-protected-"));
  mkdirSync(join(tmp, "conformance"), { recursive: true });
  mkdirSync(join(tmp, ".github"), { recursive: true });
  writeFileSync(join(tmp, LIST_PATH), listText);
  writeFileSync(join(tmp, CODEOWNERS_PATH), renderCodeowners(entries, NONE));
  if (options.phase1Exit === true) {
    mkdirSync(join(tmp, "decisions"), { recursive: true });
    writeFileSync(join(tmp, "decisions", "PHASE-1-EXIT.md"), "# Phase 1 exit\n");
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

interface FakePr {
  files: PrFile[];
  reviews?: PrReview[];
  changedFiles?: number;
  /** Head contents by path; absent paths answer 404. Defaults to the committed list and its pre-Phase-1 CODEOWNERS. */
  head?: Record<string, string>;
  /** Endpoint paths (relative to the repo) that answer HTTP 500. */
  fail?: string[];
}

const review = (login: string, state: string, commit: string): PrReview => ({ user: { login }, state, commit_id: commit });
const file = (filename: string, previous?: string): PrFile =>
  previous === undefined ? { filename, status: "modified" } : { filename, previous_filename: previous, status: "renamed" };

/** Runs `pr` against a `Bun.serve` fake of the GitHub API on port 0. */
async function runPr(pr: FakePr, rootDir: string): Promise<{ code: number; stdout: string; stderr: string; paths: string[] }> {
  const head = pr.head ?? { [LIST_PATH]: listText, [CODEOWNERS_PATH]: renderCodeowners(entries, NONE) };
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
        return Response.json({ number: 7, head: { sha: HEAD, ref: "story/9.1" }, changed_files: pr.changedFiles ?? pr.files.length });
      }
      if (url.pathname === `${base}/pulls/7/files`) {
        return page(pr.files, url);
      }
      if (url.pathname === `${base}/pulls/7/reviews`) {
        return page(pr.reviews ?? [], url);
      }
      if (url.pathname.startsWith(`${base}/contents/`) && url.searchParams.get("ref") === HEAD) {
        const content = head[url.pathname.slice(`${base}/contents/`.length)];
        if (content === undefined) {
          return new Response("not found", { status: 404 });
        }
        // Raw text only for the raw media type; GitHub's JSON envelope otherwise.
        return request.headers.get("accept") === "application/vnd.github.raw+json"
          ? new Response(content)
          : Response.json({ type: "file", encoding: "base64", content: Buffer.from(content).toString("base64") });
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

test("XT-conformance-17: conformance/protected-paths holds exactly AD-16's globs, including itself, excludes the four conformance subdirectories and marks contracts after-phase:1 (AD-16)", () => {
  const include = (pattern: string, afterPhase: number | null = null) => ({ pattern, exclude: false, afterPhase });
  const exclude = (pattern: string) => ({ pattern, exclude: true, afterPhase: null });
  expect(entries).toEqual([
    include("/conformance/"),
    exclude("/conformance/expectations/"),
    exclude("/conformance/escalations/"),
    exclude("/conformance/oracle-requests/"),
    exclude("/conformance/fixtures/"),
    include("/decisions/"),
    include("/PORTING.md"),
    include("/stories/"),
    include("/.github/"),
    include("/tools/"),
    include("/packages/assert/"),
    include("/packages/mockery/"),
    include("/packages/contracts/", 1),
    include("/package.json"),
    include("/bun.lock"),
    include("/bunfig.toml"),
    include("/tsconfig*.json"),
    include("/tsconfig.base.json"),
    include("/.oxlintrc.json"),
    include("/.gitattributes"),
    include("/AGENTS.md"),
    include("**/CLAUDE.md"),
  ]);

  const protectedNow = (path: string) => isProtected(entries, NONE, path);
  // The list protects itself, and the grader around it.
  for (const path of [
    LIST_PATH,
    "conformance/baseline-pin",
    "conformance/tests/xaravel/graph.test.ts",
    "decisions/ESC-9.1-1.md",
    "PORTING.md",
    "stories/1.4.md",
    ".github/CODEOWNERS",
    ".github/workflows/protected-paths.yml",
    "tools/protected-paths/protected-paths.ts",
    "packages/assert/src/x.ts",
    "packages/mockery/package.json",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
    "tsconfig.build.json",
    "tsconfig.base.json",
    ".oxlintrc.json",
    ".gitattributes",
    "AGENTS.md",
    "CLAUDE.md",
    "packages/x/CLAUDE.md",
    "a/b/c/CLAUDE.md",
  ]) {
    expect([path, protectedNow(path)]).toEqual([path, true]);
  }
  // The four conformance subdirectories, Component code, and nested lookalikes are not.
  for (const path of [
    "conformance/expectations/support.jsonl",
    "conformance/escalations/ESC-9.1-1.md",
    "conformance/oracle-requests/9.1.jsonl",
    "conformance/fixtures/a/b.json",
    "packages/support/src/y.ts",
    "packages/assertions/src/x.ts",
    "packages/contracts/src/a.ts",
    "packages/support/package.json",
    "packages/support/tsconfig.json",
    "skeleton/bunfig.toml",
    "docs/AGENTS.md",
    "packages/x/CLAUDE.md.bak",
    "toolsx/a.ts",
  ]) {
    expect([path, protectedNow(path)]).toEqual([path, false]);
  }
  // Contracts become Protected once Phase 1 exits.
  expect(isProtected(entries, PHASE_1, "packages/contracts/src/a.ts")).toBe(true);
});

test("XT-conformance-18: .github/CODEOWNERS mirrors the list with every protected glob owned by the Maintainer, leaves fixtures unowned, and fails on divergence (AD-16)", async () => {
  // The live repository, at whatever Phase it has reached.
  const phases = activePhases(root);
  const committed = readFileSync(join(root, CODEOWNERS_PATH), "utf8");
  expect(MAINTAINER).toBe("@edanisko");
  expect(committed).toBe(renderCodeowners(entries, phases));
  expect(checkMirror(listText, committed, phases)).toEqual([]);

  const rules = committed.split("\n").filter((line) => line !== "" && !line.startsWith("#"));
  const owned = rules.filter((line) => line.includes(" "));
  expect(owned.length).toBe(entries.filter((entry) => !entry.exclude && (entry.afterPhase === null || phases.has(entry.afterPhase))).length);
  for (const line of owned) {
    expect(line.endsWith(` ${MAINTAINER}`)).toBe(true);
  }
  expect(rules).toContain("/conformance/fixtures/");
  expect(rules.filter((line) => !line.includes(" "))).toEqual([
    "/conformance/expectations/",
    "/conformance/escalations/",
    "/conformance/oracle-requests/",
    "/conformance/fixtures/",
  ]);
  expect(committed.includes("/packages/contracts/ @edanisko\n")).toBe(phases.has(1));

  // Divergence names the first differing line.
  const drifted = committed.replace("/tools/ @edanisko\n", "");
  expect(checkMirror(listText, drifted, phases)).toEqual([
    `codeowners drift: ${CODEOWNERS_PATH} line 13 is "/packages/assert/ @edanisko", expected "/tools/ @edanisko"; run \`bun run protected-paths:codeowners\` (AD-16)`,
  ]);
  const lineCount = committed.trimEnd().split("\n").length;
  expect(checkMirror(listText, committed + "/extra/ @someone\n", phases)[0]).toContain(`line ${lineCount + 1} is "/extra/ @someone", expected end of file`);
  expect(checkMirror(listText, committed.trimEnd(), phases)[0]).toContain(`line ${lineCount} must end with exactly one newline`);

  await withRoots([fixtureRoot(), fixtureRoot(), fixtureRoot({ phase1Exit: true })], async ([clean, drift, exited]) => {
    expect(await runCli(["codeowners", "--check", "--root", clean!])).toMatchObject({ code: 0 });

    writeFileSync(join(drift!, CODEOWNERS_PATH), renderCodeowners(entries, NONE).replace("/tools/ @edanisko\n", ""));
    const failing = await runCli(["codeowners", "--check", "--root", drift!]);
    expect(failing.code).toBe(1);
    expect(failing.stderr).toContain(`codeowners drift: ${CODEOWNERS_PATH} line 13`);

    // Past Phase 1 the committed CODEOWNERS is stale until it lists contracts.
    expect((await runCli(["codeowners", "--check", "--root", exited!])).code).toBe(1);
    expect(await runCli(["codeowners", "--root", exited!])).toMatchObject({ code: 0 });
    const rendered = readFileSync(join(exited!, CODEOWNERS_PATH), "utf8");
    expect(rendered).toContain("/packages/mockery/ @edanisko\n/packages/contracts/ @edanisko\n/package.json @edanisko\n");
    expect(rendered).toBe(renderCodeowners(entries, PHASE_1));
    expect((await runCli(["codeowners", "--check", "--root", exited!])).code).toBe(0);

    expect((await runCli(["codeowners", "--bogus"])).code).toBe(2);
    const missingRoot = await runCli(["codeowners", "--root", "--check"]);
    expect(missingRoot.code).toBe(2);
    expect(missingRoot.stderr).toContain("--root needs a value");
    expect((await runCli([])).code).toBe(2);
  });
});

test("XT-conformance-19: a story/* PR that modifies Protected Paths fails the check, listing each protected file it touches; allowed paths pass (AD-16)", async () => {
  await withRoots([fixtureRoot(), fixtureRoot({ phase1Exit: true })], async ([base, exited]) => {
    // Story touches the grader: only the grader file is listed.
    const grader = await runPr({ files: [file("packages/support/src/y.ts"), file("packages/assert/src/x.ts")] }, base!);
    expect(grader.code).toBe(1);
    expect(grader.stderr).toContain("protected path: packages/assert/src/x.ts needs @edanisko's approving review on the head commit (no Maintainer review)");
    expect(grader.stderr).not.toContain("packages/support/src/y.ts");
    expect(grader.paths).toContain("/repos/xaravel/framework/pulls/7/files");
    expect(grader.paths).toContain("/repos/xaravel/framework/pulls/7/reviews");
    expect(grader.paths).toContain(`/repos/xaravel/framework/contents/${CODEOWNERS_PATH}`);

    // Several protected files are each listed, sorted.
    const many = await runPr({ files: [file("tools/z.ts"), file("packages/x/CLAUDE.md"), file("AGENTS.md")] }, base!);
    expect(many.code).toBe(1);
    const listed = many.stderr.split("\n").filter((line) => line.includes("protected path: ")).map((line) => line.trim().split(" ")[2]);
    expect(listed).toEqual(["AGENTS.md", "packages/x/CLAUDE.md", "tools/z.ts"]);

    // The allowed conformance subdirectories pass.
    const allowed = await runPr(
      {
        files: [
          file("conformance/expectations/support.jsonl"),
          file("conformance/escalations/ESC-9.1-1.md"),
          file("conformance/oracle-requests/9.1.jsonl"),
          file("conformance/fixtures/a.json"),
          file("packages/support/src/y.ts"),
        ],
      },
      base!,
    );
    expect(allowed).toMatchObject({ code: 0, stdout: "Protected Paths OK: PR #7 touches no Protected Path.\n" });

    // Contracts: unprotected before Phase 1 exits, protected after (head CODEOWNERS must list them too).
    expect((await runPr({ files: [file("packages/contracts/src/a.ts")] }, base!)).code).toBe(0);
    const exitedHead = {
      [LIST_PATH]: listText,
      [CODEOWNERS_PATH]: renderCodeowners(entries, PHASE_1),
      "decisions/PHASE-1-EXIT.md": "# Phase 1 exit\n",
    };
    const contracts = await runPr({ files: [file("packages/contracts/src/a.ts")], head: exitedHead }, exited!);
    expect(contracts.code).toBe(1);
    expect(contracts.stderr).toContain("protected path: packages/contracts/src/a.ts");
    expect(contracts.stderr).not.toContain("codeowners drift");
    const staleHead = await runPr({ files: [file("packages/support/src/y.ts")], head: { ...exitedHead, [CODEOWNERS_PATH]: renderCodeowners(entries, NONE) } }, exited!);
    expect(staleHead.code).toBe(1);
    expect(staleHead.stderr).toContain('codeowners drift: .github/CODEOWNERS line 16 is "/package.json @edanisko", expected "/packages/contracts/ @edanisko"');

    // A rename out of a protected directory lists the old name.
    const renamed = await runPr({ files: [file("packages/x/a.ts", "tools/a.ts")] }, base!);
    expect(renamed.code).toBe(1);
    expect(renamed.stderr).toContain("protected path: tools/a.ts");
    expect(renamed.stderr).not.toContain("packages/x/a.ts");

    // A truncated file list fails closed.
    const truncated = await runPr({ files: [file("packages/support/src/y.ts")], changedFiles: 3001 }, base!);
    expect(truncated.code).toBe(1);
    expect(truncated.stderr).toContain("truncated file list: the API returned 1 of 3001 changed files; failing closed");

    // Head CODEOWNERS drift: the PR edits the list without regenerating CODEOWNERS.
    const editedList = listText + "/docs/\n";
    const drift = await runPr(
      { files: [file(LIST_PATH)], reviews: [review("edanisko", "APPROVED", HEAD)], head: { [LIST_PATH]: editedList, [CODEOWNERS_PATH]: renderCodeowners(entries, NONE) } },
      base!,
    );
    expect(drift.code).toBe(1);
    expect(drift.stderr).toContain('codeowners drift: .github/CODEOWNERS line 25 is end of file, expected "/docs/ @edanisko"');

    // A head that deletes the list fails.
    const deleted = await runPr({ files: [file("packages/support/src/y.ts")], head: {} }, base!);
    expect(deleted.code).toBe(1);
    expect(deleted.stderr).toContain(`missing list: the head commit ${HEAD} has no ${LIST_PATH}`);

    // Paging: more than one page of files is read in full.
    const bulk = Array.from({ length: 250 }, (_, i) => file(`packages/support/src/f${String(i).padStart(3, "0")}.ts`));
    const paged = await runPr({ files: [...bulk, file("bun.lock")] }, base!);
    expect(paged.code).toBe(1);
    expect(paged.stderr).toContain("protected path: bun.lock");
    expect(paged.stderr).not.toContain("truncated");

    // API errors fail closed.
    for (const fail of ["pulls/7/files", `contents/${CODEOWNERS_PATH}`]) {
      const broken = await runPr({ files: [file("packages/support/src/y.ts")], fail: [fail] }, base!);
      expect(broken.code).toBe(1);
      expect(broken.stderr).toMatch(/^Protected Paths check failed: .*HTTP 500\n$/);
    }

    // Usage errors exit 2.
    expect((await runCli(["pr", "--repo", "xaravel/framework"])).code).toBe(2);
    expect((await runCli(["pr", "--repo", "bad", "--pr", "7"])).code).toBe(2);
    expect((await runCli(["pr", "--repo", "xaravel/framework", "--pr", "x"])).code).toBe(2);
  });
});

test("XT-conformance-20: the protected-paths workflow triggers only on pull_request_target and merge_group, never checks out or runs PR code, and takes PR data only from the API (AD-16)", () => {
  // A PR changing the workflow itself is a Protected Path change.
  const workflowFile = [file(".github/workflows/protected-paths.yml")];
  const own = (reviews: PrReview[]) => evaluatePr(entries, NONE, { files: workflowFile, changedFiles: 1, reviews, headSha: HEAD });
  const unapproved = own([]);
  expect(unapproved.protectedFiles).toEqual([".github/workflows/protected-paths.yml"]);
  expect(unapproved.violations).toHaveLength(1);
  expect(unapproved.violations[0]).toContain("protected path: .github/workflows/protected-paths.yml");
  expect(own([review("edanisko", "APPROVED", HEAD)]).violations).toEqual([]);

  const text = readFileSync(join(root, ".github", "workflows", "protected-paths.yml"), "utf8");
  const workflow = Bun.YAML.parse(text) as {
    on: Record<string, { types: string[]; branches?: string[] }>;
    permissions: Record<string, string>;
    jobs: Record<string, { permissions: Record<string, string>; steps: { id?: string; uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string> }[] }>;
  };
  // Story 1.7: the required check also reports in the merge queue.
  expect(Object.keys(workflow.on)).toEqual(["pull_request_target", "merge_group"]);
  expect(workflow.on["pull_request_target"]!.types).toEqual(["opened", "edited", "synchronize", "reopened", "ready_for_review"]);
  // Only main's copy of the workflow judges a PR; re-targeting the base (`edited`) re-runs it.
  expect(workflow.on["pull_request_target"]!.branches).toEqual(["main"]);
  expect(workflow.on["merge_group"]).toEqual({ types: ["checks_requested"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(Object.keys(workflow.jobs)).toEqual(["protected-paths"]);
  const job = workflow.jobs["protected-paths"]!;
  expect(job.permissions).toEqual({ contents: "read", "pull-requests": "read" });

  const [checkout, setupBun, findPr, check, ...rest] = job.steps;
  expect(rest).toEqual([]);
  // The base commit only: the merge group's base, or the PR's base branch (the pull_request_target default).
  expect(checkout).toEqual({
    uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    with: { ref: "${{ github.event.merge_group.base_sha || github.sha }}", "persist-credentials": false },
  });
  expect(setupBun).toEqual({ uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } });
  expect(findPr!.id).toBe("pr");
  expect(findPr!.env).toEqual({
    EVENT_NAME: "${{ github.event_name }}",
    EVENT_PR: "${{ github.event.pull_request.number }}",
    QUEUE_REF: "${{ github.event.merge_group.head_ref }}",
  });
  expect(findPr!.run).toContain('bun tools/ruleset/ruleset.ts merge-group-pr "$QUEUE_REF"');
  expect(check!.uses).toBeUndefined();
  expect(check!.run).toBe('bun tools/protected-paths/protected-paths.ts pr --repo "$REPO" --pr "$PR_NUMBER"');
  expect(check!.env).toEqual({
    GH_TOKEN: "${{ github.token }}",
    REPO: "${{ github.repository }}",
    PR_NUMBER: "${{ steps.pr.outputs.number }}",
  });

  for (const step of job.steps.slice(1)) {
    // No later step checks out a ref, installs, or interpolates values into a script.
    expect(step.with?.["ref"]).toBeUndefined();
    expect(step.run ?? "").not.toContain("${{");
    expect(step.run ?? "").not.toMatch(/\b(install|bun i|bun x|bunx|bun run)\b/);
  }
  expect(text).not.toMatch(/pull_request_review|\bpull_request:|github\.event\.pull_request\.head|github\.head_ref|merge_group\.head_sha|id-token/);
});

test("XT-conformance-21: an Infrastructure PR touching Protected Paths passes only with the Maintainer's latest decisive review approving the head commit (AD-16)", async () => {
  const files = [file("tools/graph/graph.ts"), file("stories/1.4.md")];
  const decide = (reviews: PrReview[]) => evaluatePr(entries, NONE, { files, changedFiles: files.length, reviews, headSha: HEAD });

  const approvedHead = decide([review("someone", "COMMENTED", HEAD), review("edanisko", "APPROVED", HEAD)]);
  expect(approvedHead).toEqual({ protectedFiles: ["stories/1.4.md", "tools/graph/graph.ts"], approved: true, violations: [] });
  // A later comment does not undo the approval; login case does not matter.
  expect(decide([review("EdAnisko", "APPROVED", HEAD), review("edanisko", "COMMENTED", HEAD)]).approved).toBe(true);
  // Changes requested after a stale approval, then a fresh approval: passes.
  expect(decide([review("edanisko", "APPROVED", OLD), review("edanisko", "CHANGES_REQUESTED", OLD), review("edanisko", "APPROVED", HEAD)]).approved).toBe(true);

  // Stale approval, another user's approval, changes requested after approval, dismissed approval.
  const stale = decide([review("edanisko", "APPROVED", OLD)]);
  expect(stale.approved).toBe(false);
  expect(stale.violations[0]).toContain(`the Maintainer approved ${OLD}, not the head ${HEAD}`);
  expect(decide([review("someone", "APPROVED", HEAD)]).approved).toBe(false);
  const changes = decide([review("edanisko", "APPROVED", HEAD), review("edanisko", "CHANGES_REQUESTED", HEAD)]);
  expect(changes.approved).toBe(false);
  expect(changes.violations[0]).toContain("the Maintainer's latest review is CHANGES_REQUESTED");
  expect(decide([review("edanisko", "APPROVED", HEAD), review("edanisko", "DISMISSED", HEAD)]).approved).toBe(false);
  expect(decide([{ user: null, state: "APPROVED", commit_id: HEAD }]).approved).toBe(false);
  // Approval never excuses a truncated file list.
  expect(evaluatePr(entries, NONE, { files, changedFiles: 3001, reviews: [review("edanisko", "APPROVED", HEAD)], headSha: HEAD }).violations[0]).toContain(
    "truncated file list",
  );

  await withRoots([fixtureRoot()], async ([base]) => {
    const passing = await runPr({ files, reviews: [review("edanisko", "APPROVED", HEAD)] }, base!);
    expect(passing).toMatchObject({
      code: 0,
      stdout: `Protected Paths OK: PR #7 touches 2 Protected Path(s), approved by @edanisko on ${HEAD}.\n`,
    });
    const failing = await runPr({ files, reviews: [review("edanisko", "APPROVED", OLD)] }, base!);
    expect(failing.code).toBe(1);
    expect(failing.stderr).toContain("protected path: stories/1.4.md");
    expect(failing.stderr).toContain("protected path: tools/graph/graph.ts");
  });
});
