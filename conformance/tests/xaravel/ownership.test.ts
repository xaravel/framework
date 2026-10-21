// Xaravel Tests for Story 1.5 (Story manifests and edit-ownership check).
// These run under plain `bun test` until the harness lands in Epic 5.
import { expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  allowedPath,
  applySprintStatus,
  BOT_LOGIN,
  botAllowedPath,
  checkApiSurfaceGates,
  checkDuplicates,
  contentReads,
  EPICS,
  evaluatePr,
  gateCriteria,
  parseManifest,
  planningAllowedPath,
  readManifests,
  SPRINT_STATUS,
  STORIES_DIR,
  type ContentRead,
  type Manifest,
} from "../../../tools/ownership/ownership";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";
import { xaravelTest } from "../../../packages/assert/src/index";
import { writeGateInputs } from "./phase-gate-fixtures";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "ownership", "ownership.ts");

interface ManifestFields {
  story_id?: unknown;
  epic?: unknown;
  component?: unknown;
  api_surface_gate?: unknown;
  status?: unknown;
  sprint_key?: unknown;
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

/** A minimal `epics.md`: Stories 9.1 and 9.2, with no `api-surface:gate` acceptance criterion. */
const EPICS_TEXT = "# Epics\n\n### Story 9.1: One\n\n**Then** it works.\n\n### Story 9.2: Two\n\n**Then** it works too.\n";

/**
 * A hermetic root holding `stories/<id>.md` for each manifest, plus sprint status when `sprintStatus` is given, and
 * `epics.md` (`EPICS_TEXT` unless `epics` is given; none when it is null). It also holds the Phase 1 gate's inputs
 * (Story 8.8), so a `pr` run on a Phase 1 Story is judged by the other rules alone.
 */
function fixtureRoot(stories: Record<string, ManifestFields | string> = {}, sprintStatus: string | null = null, epics: string | null = EPICS_TEXT): string {
  const tmp = mkdtempSync(join(tmpdir(), "xaravel-ownership-"));
  writeGateInputs(tmp);
  mkdirSync(join(tmp, STORIES_DIR), { recursive: true });
  if (epics !== null) {
    mkdirSync(dirname(join(tmp, EPICS)), { recursive: true });
    writeFileSync(join(tmp, EPICS), epics);
  }
  for (const [id, fields] of Object.entries(stories)) {
    writeFileSync(join(tmp, STORIES_DIR, `${id}.md`), typeof fields === "string" ? fields : manifestText(fields));
  }
  if (sprintStatus !== null) {
    mkdirSync(dirname(join(tmp, SPRINT_STATUS)), { recursive: true });
    writeFileSync(join(tmp, SPRINT_STATUS), sprintStatus);
  }
  return tmp;
}

/** Sprint status text whose `development_status` maps each key to its value. */
function sprintStatusText(entries: Record<string, string>): string {
  const lines = Object.entries(entries).map(([key, value]) => `  ${key}: ${value}`);
  return `project: xaravel\ndevelopment_status:\n${lines.join("\n")}\n`;
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
  /** Story 5.8: contents at the merge base by path; when given, the PR has a base sha, the compare API answers, and the merge base is served from here. */
  base?: Record<string, string>;
  /** Story 5.8: the PR's `user`. */
  user?: { login: string; type: string };
}

/** An Expectations line of Story 9.1's own Test ID (`story("9.1")` lists `T-9.1`). */
const OWN_LINE = '{"id":"T-9.1","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":null}\n';
/** `OWN_LINE` promoted, the status-only change a bot/* PR may make (Story 5.8). */
const OWN_PASS = '{"id":"T-9.1","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}\n';
/** The xaravel-bot App, the only author a bot/* PR may have (Story 5.8). */
const BOT = { login: BOT_LOGIN, type: "Bot" };

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
        const extra = { ...(pr.base === undefined ? {} : { base: { sha: "c".repeat(40) } }), ...(pr.user === undefined ? {} : { user: pr.user }) };
        return Response.json({ number: 7, head: { sha: "a".repeat(40), ref: pr.ref }, changed_files: pr.changedFiles ?? pr.files.length, ...extra });
      }
      if (pr.base !== undefined && url.pathname === `${base}/compare/${"c".repeat(40)}...${"a".repeat(40)}`) {
        return Response.json({ merge_base_commit: { sha: "b".repeat(40) } });
      }
      if (url.pathname === `${base}/pulls/7/files`) {
        return page(pr.files, url);
      }
      if (url.pathname.startsWith(`${base}/contents/`)) {
        const side = pr.base !== undefined && url.searchParams.get("ref") === "b".repeat(40) ? pr.base : (pr.head ?? {});
        const content = side[url.pathname.slice(`${base}/contents/`.length)];
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

const manifest = (id: string, ids: string[], status: Manifest["status"] = "backlog", xt: string[] = [], sprintKey: string | null = null): Manifest => ({
  file: `${STORIES_DIR}/${id}.md`,
  storyId: id,
  epic: Number(id.split(".")[0]),
  component: "support",
  apiSurfaceGate: null,
  status,
  sprintKey,
  testIds: ids,
  xaravelTestIds: xt,
});

xaravelTest("XT-conformance-22", "every Story manifest requires story_id, epic, component and status, plus a non-empty test_ids or xaravel_test_ids; one without fails; a Story whose epics.md criteria say `api-surface:gate <c>` passes carries api_surface_gate: <c>, cross-checked by manifests (Epic 6 retro S4 ruling) (AD-16.5, AD-21)", async () => {
  // Every committed manifest validates, and `manifests` passes on the repo root.
  const committed = readManifests(root);
  expect(committed.violations).toEqual([]);
  expect(committed.manifests.length).toBe(readdirSync(join(root, STORIES_DIR)).filter((name) => name.endsWith(".md")).length);
  expect(checkDuplicates(committed.manifests)).toEqual([]);
  const own = parseManifest("stories/1.5.md", readFileSync(join(root, STORIES_DIR, "1.5.md"), "utf8"));
  expect(own.violations).toEqual([]);
  expect(own.manifest).toMatchObject({ storyId: "1.5", epic: 1, component: "conformance" });
  expect(own.manifest!.xaravelTestIds).toEqual(["XT-conformance-22", "XT-conformance-23", "XT-conformance-24", "XT-conformance-25"]);
  expect(committed.manifests.every((m) => m.sprintKey !== null)).toBe(true);
  expect(existsSync(join(root, SPRINT_STATUS))).toBe(true);
  const resolved = applySprintStatus(root, committed.manifests);
  expect(resolved.violations).toEqual([]);
  expect(checkDuplicates(resolved.manifests)).toEqual([]);
  const openCount = resolved.manifests.filter((m) => m.status !== "done").length;
  const live = await runCli(["manifests"]);
  expect(live.code).toBe(0);
  expect(live.stdout).toBe(`Ownership OK: ${resolved.manifests.length} manifest(s) valid, ${openCount} open, no duplicate Test IDs.\n`);

  // api_surface_gate (Epic 6 retro S4, Maintainer ruling on item 8): the 36 "`api-surface:gate <c>` passes" criteria
  // of epics.md, each under a Story heading and one component per Story; every manifest agrees with them, and each
  // gate Story with no manifest yet is a stderr note, not a violation.
  const criteria = gateCriteria(readFileSync(join(root, EPICS), "utf8"));
  expect(criteria).toHaveLength(36);
  expect(criteria.every((criterion) => criterion.storyId !== null)).toBe(true);
  expect(new Set(criteria.map((criterion) => criterion.storyId)).size).toBe(36);
  expect(criteria.find((criterion) => criterion.storyId === "10.6")).toMatchObject({ component: "contracts" });
  const gates = checkApiSurfaceGates(committed.manifests, criteria);
  expect(gates.violations).toEqual([]);
  const gated = committed.manifests.filter((m) => m.apiSurfaceGate !== null);
  expect(gated.map((m) => m.storyId)).toEqual(["10.6", "11.1", "12.1", "13.1", "14.8", "15.3", "16.2", "17.4", "24.1", "25.2", "26.1", "27.4", "29.3", "30.2", "39.3", "41.3", "42.5", "44.1", "48.5", "56.5", "57.6", "63.1", "67.2"]);
  expect(gates.notes).toHaveLength(36 - gated.length);
  expect(live.stderr).toBe(gates.notes.map((note) => `${note}\n`).join(""));
  expect(live.stderr).toContain("note: Story 68.3 has an `api-surface:gate mcp` passes acceptance criterion (epics.md:");

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
  // sprint_key is optional; when present it must be a non-empty string.
  expect(parseManifest("stories/9.1.md", manifestText(story("9.1", { sprint_key: "9-1-x" }))).manifest!.sprintKey).toBe("9-1-x");
  expect(parseManifest("stories/9.1.md", manifestText(story("9.1"))).manifest!.sprintKey).toBeNull();
  for (const sprintKey of [7, "", "  ", " 9-1-x", null, ["9-1-x"]]) {
    expect(check(story("9.1", { sprint_key: sprintKey }))).toEqual([
      `invalid manifest: stories/9.1.md: sprint_key must be a non-empty string without surrounding whitespace when present, got ${JSON.stringify(sprintKey)} (AD-16)`,
    ]);
  }
  expect(check("---\n: [\n---\n")[0]).toContain("frontmatter is not valid YAML");
  // api_surface_gate is optional; when present it must be a kebab-case component name.
  expect(parseManifest("stories/9.1.md", manifestText(story("9.1", { api_surface_gate: "json-schema" }))).manifest!.apiSurfaceGate).toBe("json-schema");
  expect(parseManifest("stories/9.1.md", manifestText(story("9.1"))).manifest!.apiSurfaceGate).toBeNull();
  for (const gate of [7, "Contracts", "", null, ["contracts"]]) {
    expect(check(story("9.1", { api_surface_gate: gate }))).toEqual([
      `invalid manifest: stories/9.1.md: api_surface_gate must be a kebab-case component name when present, got ${JSON.stringify(gate)} (AD-16)`,
    ]);
  }

  // gateCriteria: only the exact phrase with a kebab-case name, under the `### Story X.Y:` heading it follows; any
  // other heading of level 1 to 3 ends the Story's section.
  const epicsText = [
    "# Epics", // 1
    "A `api-surface:gate <component>` fails; a manifest whose criteria say \"`api-surface:gate <c>` passes\" carries the field.", // 2
    "### Story 9.1: One", // 3
    "**Then** `api-surface:gate contracts` passes, and `api-surface:gate Config` passes, and `api-surface:gate x`", // 4
    "#### A sub-heading keeps the Story", // 5
    "- `api-surface:gate json-schema` passes;", // 6
    "## Epic 10", // 7
    "`api-surface:gate loose` passes", // 8
  ].join("\r\n");
  expect(gateCriteria(epicsText)).toEqual([
    { storyId: "9.1", component: "contracts", line: 4 },
    { storyId: "9.1", component: "json-schema", line: 6 },
    { storyId: null, component: "loose", line: 8 },
  ]);
  const m91 = { ...manifest("9.1", ["T1"]), apiSurfaceGate: "contracts" };
  expect(checkApiSurfaceGates([m91], [{ storyId: "9.1", component: "contracts", line: 4 }, { storyId: "9.1", component: "contracts", line: 9 }])).toEqual({ violations: [], notes: [] });
  expect(checkApiSurfaceGates([m91], gateCriteria(epicsText)).violations).toEqual([
    `api-surface gate: ${EPICS}:8 says \`api-surface:gate loose\` passes under no ### Story heading (AD-15)`,
    "api-surface gate: Story 9.1 has api-surface:gate acceptance criteria for 2 components, `api-surface:gate contracts` (epics.md:4) and `api-surface:gate json-schema` (epics.md:6); api_surface_gate holds one component (AD-15)",
  ]);

  // The cross-check, through the CLI: each row of the matrix.
  const gateEpics = (component: string): string => `${EPICS_TEXT}\n### Story 9.3: Gate\n\n**Then** \`api-surface:gate ${component}\` passes and the docs are written.\n`;
  await withRoots(
    [
      fixtureRoot({ "9.1": story("9.1"), "9.3": story("9.3", { api_surface_gate: "contracts" }) }, null, gateEpics("contracts")),
      fixtureRoot({ "9.1": story("9.1"), "9.3": story("9.3") }, null, gateEpics("contracts")),
      fixtureRoot({ "9.1": story("9.1"), "9.3": story("9.3", { api_surface_gate: "config" }) }, null, gateEpics("contracts")),
      fixtureRoot({ "9.1": story("9.1", { api_surface_gate: "x" }) }),
      fixtureRoot({ "9.1": story("9.1") }, null, gateEpics("mcp")),
      fixtureRoot({ "9.3": story("9.3", { api_surface_gate: "contracts" }) }, null, `${gateEpics("contracts")}- \`api-surface:gate config\` passes;\n`),
      fixtureRoot({ "9.1": story("9.1", { api_surface_gate: 7 }) }),
      fixtureRoot({ "9.1": story("9.1") }, null, null),
    ],
    async ([matches, missing, different, noCriterion, noManifest, twoComponents, badField, noEpics]) => {
      const ok = "Ownership OK: 2 manifest(s) valid, 2 open, no duplicate Test IDs.\n";
      expect(await runCli(["manifests", "--root", matches!])).toEqual({ code: 0, stdout: ok, stderr: "" });
      const line = EPICS_TEXT.split("\n").length + 3;
      const lacking = await runCli(["manifests", "--root", missing!]);
      expect(lacking).toEqual({
        code: 1,
        stdout: "",
        stderr: `Ownership violations (AD-16):\n  api-surface gate: stories/9.3.md must carry api_surface_gate: contracts (epics.md:${line} says \`api-surface:gate contracts\` passes), got no api_surface_gate (AD-15)\n`,
      });
      expect((await runCli(["manifests", "--root", different!])).stderr).toContain(
        `api-surface gate: stories/9.3.md must carry api_surface_gate: contracts (epics.md:${line} says \`api-surface:gate contracts\` passes), got api_surface_gate: config (AD-15)`,
      );
      const extra = await runCli(["manifests", "--root", noCriterion!]);
      expect(extra.code).toBe(1);
      expect(extra.stderr).toContain("api-surface gate: stories/9.1.md carries api_surface_gate: x but epics.md has no `api-surface:gate x` passes acceptance criterion for Story 9.1 (AD-15)");
      expect(await runCli(["manifests", "--root", noManifest!])).toEqual({
        code: 0,
        stdout: "Ownership OK: 1 manifest(s) valid, 1 open, no duplicate Test IDs.\n",
        stderr: `note: Story 9.3 has an \`api-surface:gate mcp\` passes acceptance criterion (epics.md:${line}) but no stories/9.3.md; its manifest must carry api_surface_gate: mcp\n`,
      });
      const two = await runCli(["manifests", "--root", twoComponents!]);
      expect(two.code).toBe(1);
      expect(two.stderr).toContain(`api-surface gate: Story 9.3 has api-surface:gate acceptance criteria for 2 components, \`api-surface:gate contracts\` (epics.md:${line}) and \`api-surface:gate config\` (epics.md:${line + 1}); api_surface_gate holds one component (AD-15)`);
      const bad = await runCli(["manifests", "--root", badField!]);
      expect(bad.code).toBe(1);
      expect(bad.stderr).toContain("invalid manifest: stories/9.1.md: api_surface_gate must be a kebab-case component name when present, got 7 (AD-16)");
      expect(await runCli(["manifests", "--root", noEpics!])).toEqual({
        code: 1,
        stdout: "",
        stderr: `Ownership violations (AD-16):\n  api-surface gate: cannot check: ${EPICS} does not exist (AD-15)\n`,
      });
    },
  );

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

xaravelTest("XT-conformance-23", "a story/<story-id> PR is judged by the manifest on the base checkout only; a branch with no manifest on base fails, other branches pass (AD-16.5, AD-21.1)", async () => {
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

    // Not a Story branch: planning/* and bot/* PRs within their rules pass (MAINT-2026-10-17 item 15; XT-conformance-180, -181).
    const planning = await runPr({ ref: "planning/x", files: [file("AGENTS.md"), file("tools/x.ts")] }, base!);
    expect(planning).toMatchObject({
      code: 0,
      stdout: "Ownership OK: PR #7: planning/x passed the planning rule; no file is under packages/ or conformance/expectations/.\n",
    });
    // Story 5.8: a bot/* PR now also needs the xaravel-bot App as author and a status-only change of an existing shard.
    expect(evaluatePr(base!, { headRef: "bot/expectations", files: [{ filename: "conformance/expectations/support/x.jsonl", status: "modified" }], changedFiles: 1, author: BOT, content: (_path, side) => (side === "base" ? OWN_LINE : OWN_PASS) })).toEqual({
      storyId: null,
      outOfScope: [],
      violations: [],
    });
  });
});

xaravelTest("XT-conformance-24", "a Story PR changing files outside its four allowed paths exits 1 and lists the out-of-scope paths, sorted (AD-16.2, AD-16.3, AD-21.1)", async () => {
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
        // Story 5.6: the line rules read a changed shard's lines; this one changes only the Story's own Test ID.
        head: { "conformance/expectations/support/x.jsonl": OWN_LINE },
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
    jobs: Record<
      string,
      {
        if?: string;
        permissions?: Record<string, string>;
        "continue-on-error"?: unknown;
        steps: { id?: string; name?: string; uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string>; "continue-on-error"?: unknown }[];
      }
    >;
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
  // A required check: nothing lets it pass past a failure.
  for (const node of [job, ...job.steps]) {
    expect(node["continue-on-error"]).toBeUndefined();
  }
  expect(workflow.jobs["manifests"]!.permissions).toBeUndefined();
  const checkout = { uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } };
  const setupBun = { uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } };
  // The base commit only: the merge group's base, or the PR's base branch (the pull_request_target default).
  expect(job.steps.slice(0, 2)).toEqual([
    { uses: checkout.uses, with: { ref: "${{ github.event.merge_group.base_sha || github.sha }}", "persist-credentials": false } },
    setupBun,
  ]);
  expect(job.steps).toHaveLength(5);
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
  // Story 8.8: the Phase 1 gate's `porting:check` needs `oxc-parser`, so the base checkout's locked dependencies are
  // installed, with no lifecycle scripts, before the check step.
  expect(job.steps[3]).toEqual({ name: "Install from the lockfile", run: "bun install --frozen-lockfile --ignore-scripts" });
  const outputKey = queued.output.slice(0, queued.output.indexOf("="));
  expect(job.steps[4]!.env!["PR_NUMBER"]).toBe(`\${{ steps.${job.steps[2]!.id}.outputs.${outputKey} }}`);
  expect(job.steps[4]!.run).toBe('bun tools/ownership/ownership.ts pr --repo "$REPO" --pr "$PR_NUMBER"');
  expect(job.steps[4]!.env).toEqual({
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
  for (const step of [...job.steps.slice(1).filter((step) => step !== job.steps[3]), ...manifestsJob.steps]) {
    expect(step.with?.["ref"]).toBeUndefined();
    expect(step.run ?? "").not.toContain("${{");
    expect(step.run ?? "").not.toMatch(/\b(install|bun i|bun x|bunx|bun run)\b/);
  }
  expect(text).not.toMatch(/pull_request_review|\bpull_request:|github\.event\.pull_request\.head|github\.head_ref|merge_group\.head_sha|id-token/);
});

xaravelTest("XT-conformance-259", "a story/<id> PR may change its own manifest's status: line to a Story status, modified in place, and add or change its own spec-<id>-*.md; any other manifest edit, another Story's manifest or spec, and an unreadable manifest stay out of scope (Epic 8 retro item 11, MAINT-2026-10-20 item 2, AD-16)", async () => {
  const support = { storyId: "9.1", component: "support" };
  const SPEC = "_bmad-output/implementation-artifacts/spec-9-1-scope-frame.md";
  expect(allowedPath(support, SPEC)).toBe(true);
  expect(allowedPath(support, "_bmad-output/implementation-artifacts/spec-9-1-0-x.md")).toBe(true);
  expect(allowedPath({ storyId: "9.10", component: "support" }, "_bmad-output/implementation-artifacts/spec-9-10-x.md")).toBe(true);
  for (const path of [
    "_bmad-output/implementation-artifacts/spec-9-2-x.md",
    "_bmad-output/implementation-artifacts/spec-9-10-x.md",
    "_bmad-output/implementation-artifacts/spec-9-1.md",
    "_bmad-output/implementation-artifacts/spec-9-1-.md",
    "_bmad-output/implementation-artifacts/sub/spec-9-1-x.md",
    "_bmad-output/implementation-artifacts/spec-9-1-x.txt",
    "_bmad-output/implementation-artifacts/spec-9.1-x.md",
    "_bmad-output/implementation-artifacts/spec-901-x.md",
    "_bmad-output/implementation-artifacts//spec-9-1-x.md",
    "_bmad-output/planning-artifacts/spec-9-1-x.md",
    "_bmad-output/implementation-artifacts/sprint-status.yaml",
    "stories/9.1.md",
  ]) {
    expect([path, allowedPath(support, path)]).toEqual([path, false]);
  }

  const OWN = "stories/9.1.md";
  const baseText = manifestText(story("9.1"));
  const withStatus = (text: string, status: string): string => text.replace('status: "backlog"', `status: ${status}`);
  const modified = (filename: string): PrFile => ({ filename, status: "modified" });
  const scopeLine = (path: string): string => `out of scope: ${path} is outside Story 9.1's allowed paths (component support) (AD-16)`;

  await withRoots([fixtureRoot({ "9.1": story("9.1"), "9.2": story("9.2") })], async ([dir]) => {
    const judge = (files: PrFile[], head: Record<string, string>, base: Record<string, string> = { [OWN]: baseText, "stories/9.2.md": manifestText(story("9.2")) }) =>
      evaluatePr(dir!, {
        headRef: "story/9.1",
        files,
        changedFiles: files.length,
        content: (path, side) => (side === "base" ? base : head)[path] ?? null,
        mergeBase: "b".repeat(40),
        headSha: "a".repeat(40),
      });
    const refused = (result: ReturnType<typeof evaluatePr>, path: string): void => {
      expect(result.outOfScope).toContain(path);
      expect(result.violations).toContain(scopeLine(path));
    };

    // Allowed: the own status line alone, to each Story status, quoted or not; the own spec added or modified; both together.
    for (const status of ["done", '"done"', "review", "in-progress", "ready-for-dev", "blocked"]) {
      expect([status, judge([modified(OWN)], { [OWN]: withStatus(baseText, status) })]).toEqual([status, { storyId: "9.1", outOfScope: [], violations: [] }]);
    }
    expect(judge([file(SPEC)], {})).toEqual({ storyId: "9.1", outOfScope: [], violations: [] });
    expect(judge([modified(SPEC)], {})).toEqual({ storyId: "9.1", outOfScope: [], violations: [] });
    expect(judge([{ filename: "_bmad-output/implementation-artifacts/spec-9-1-x.md", status: "removed" }], {})).toEqual({ storyId: "9.1", outOfScope: [], violations: [] });
    expect(judge([modified(OWN), file(SPEC), file("packages/support/src/A.ts")], { [OWN]: withStatus(baseText, "done") })).toEqual({ storyId: "9.1", outOfScope: [], violations: [] });

    // Refused: another field or the body, with or without the status line.
    const edits = [
      baseText.replace('test_ids: ["T-9.1"]', 'test_ids: ["T-9.1", "T-other"]'),
      baseText.replace('component: "support"', 'component: "container"'),
      baseText.replace("# Story", "# Story renamed"),
      `${baseText}More body.\n`,
      withStatus(baseText.replace('test_ids: ["T-9.1"]', 'test_ids: ["T-other"]'), "done"),
      withStatus(baseText.replace("# Story", "# Done"), "done"),
      withStatus(baseText, "done").replace('status: done', 'status: done\nsprint_key: "9-1-x"'),
      withStatus(baseText, "done").replace("---\nstory_id", "---\n#\nstory_id"),
      withStatus(baseText, "done").replace(/\n/g, "\r\n"),
      baseText,
    ];
    for (const head of edits) {
      refused(judge([modified(OWN)], { [OWN]: head }), OWN);
    }
    // The fixture really carries the status line withStatus rewrites, so no refused case passes vacuously.
    expect(withStatus(baseText, "done")).not.toBe(baseText);
    // Refused: a status: line in the body, or an indented status: inside the frontmatter, changing alone.
    const bodyStatus = `${baseText}status: draft\n`;
    refused(judge([modified(OWN)], { [OWN]: bodyStatus.replace("status: draft", "status: done") }, { [OWN]: bodyStatus }), OWN);
    const nested = baseText.replace('test_ids: ["T-9.1"]', 'test_ids: ["T-9.1"]\nmeta:\n  status: backlog');
    refused(judge([modified(OWN)], { [OWN]: nested.replace("  status: backlog", "  status: done") }, { [OWN]: nested }), OWN);
    // Refused: a status outside the Story statuses, or a status: line that is not the top-level field.
    for (const head of [withStatus(baseText, "finished"), withStatus(baseText, "[done]"), withStatus(baseText, "")]) {
      refused(judge([modified(OWN)], { [OWN]: head }), OWN);
    }
    // Refused: the own manifest added, removed, renamed (either way) or copied, or listed twice.
    const done = { [OWN]: withStatus(baseText, "done") };
    refused(judge([{ filename: OWN, status: "added" }], done), OWN);
    refused(judge([{ filename: OWN, status: "removed" }], done), OWN);
    refused(judge([{ filename: OWN, status: "changed" }], done), OWN);
    refused(judge([{ filename: OWN }], done), OWN);
    refused(judge([{ filename: OWN, previous_filename: "stories/9.3.md", status: "renamed" }], done), OWN);
    refused(judge([{ filename: "stories/9.3.md", previous_filename: OWN, status: "renamed" }], done), OWN);
    refused(judge([{ filename: OWN, previous_filename: "stories/9.2.md", status: "copied" }], done), OWN);
    refused(judge([modified(OWN), { filename: "stories/9.3.md", previous_filename: OWN, status: "copied" }], done), OWN);
    // Refused: another Story's manifest (a status-only change) and other Stories' or misplaced specs.
    refused(judge([modified("stories/9.2.md")], { "stories/9.2.md": withStatus(manifestText(story("9.2")), "done") }), "stories/9.2.md");
    for (const path of [
      "_bmad-output/implementation-artifacts/spec-9-2-x.md",
      "_bmad-output/implementation-artifacts/spec-9-10-x.md",
      "_bmad-output/implementation-artifacts/spec-9-1.md",
      "_bmad-output/implementation-artifacts/sub/spec-9-1-x.md",
      "_bmad-output/implementation-artifacts/spec-9-1-x.txt",
    ]) {
      refused(judge([file(path)], {}), path);
    }

    // Unreadable: no content, a read that throws, or a side that is null; out of scope and unreadable content.
    const noContent = evaluatePr(dir!, { headRef: "story/9.1", files: [modified(OWN)], changedFiles: 1 });
    refused(noContent, OWN);
    expect(noContent.violations).toContain(`unreadable content: ${OWN} at the merge base could not be read; failing closed (AD-16)`);
    const throwing = evaluatePr(dir!, {
      headRef: "story/9.1",
      files: [modified(OWN)],
      changedFiles: 1,
      content: (_path, side) => {
        if (side === "head") {
          throw new Error("HTTP 500");
        }
        return baseText;
      },
      mergeBase: "b".repeat(40),
      headSha: "a".repeat(40),
    });
    refused(throwing, OWN);
    expect(throwing.violations).toContain(`unreadable content: ${OWN} at ${"a".repeat(40)} could not be read; failing closed (AD-16)`);
    const nullBase = judge([modified(OWN)], done, {});
    refused(nullBase, OWN);
    expect(nullBase.violations).toContain(`unreadable content: ${OWN} at ${"b".repeat(40)} could not be read; failing closed (AD-16)`);
    const nullHead = judge([modified(OWN)], {});
    refused(nullHead, OWN);
    expect(nullHead.violations).toContain(`unreadable content: ${OWN} at ${"a".repeat(40)} could not be read; failing closed (AD-16)`);
  });

  // The pr command prefetches both sides of the own manifest, and only when it is modified in place on its own branch.
  const both: ContentRead[] = [
    { path: OWN, side: "base" },
    { path: OWN, side: "head" },
  ];
  expect(contentReads("story/9.1", [{ filename: OWN, status: "modified" }])).toEqual(both);
  expect(contentReads("story/9.1", [{ filename: OWN, status: "modified" }, file(SPEC)])).toEqual(both);
  for (const [ref, files] of [
    ["story/9.1", [file(OWN)]],
    ["story/9.1", [{ filename: OWN, status: "removed" }]],
    ["story/9.1", [file(OWN, "stories/9.3.md")]],
    ["story/9.1", [{ filename: OWN }]],
    ["story/9.2", [{ filename: OWN, status: "modified" }]],
    ["story/9.x", [{ filename: "stories/9.x.md", status: "modified" }]],
    ["planning/x", [{ filename: OWN, status: "modified" }]],
    ["feature/x", [{ filename: OWN, status: "modified" }]],
  ] as [string, PrFile[]][]) {
    expect([ref, files, contentReads(ref, files)]).toEqual([ref, files, []]);
  }

  // Through the CLI: a status-only own manifest change and the own spec pass; another field fails with the waiver's line.
  await withRoots([fixtureRoot({ "9.1": story("9.1") })], async ([dir]) => {
    const files: PrFile[] = [{ filename: OWN, status: "modified" }, file(SPEC)];
    const ok = await runPr({ ref: "story/9.1", files, base: { [OWN]: baseText }, head: { [OWN]: withStatus(baseText, "done") } }, dir!);
    expect(ok).toMatchObject({ code: 0, stdout: "Ownership OK: PR #7: every file is within Story 9.1's allowed paths.\n", stderr: "" });
    expect(ok.paths).toContain(`/repos/xaravel/framework/contents/${OWN}`);
    const other = await runPr({ ref: "story/9.1", files, base: { [OWN]: baseText }, head: { [OWN]: withStatus(baseText.replace('component: "support"', 'component: "http"'), "done") } }, dir!);
    expect(other.code).toBe(1);
    expect(other.stderr).toBe(`Ownership violations (AD-16):\n  ${scopeLine(OWN)}\n`);
    const unreadable = await runPr({ ref: "story/9.1", files, base: { [OWN]: baseText }, head: {} }, dir!);
    expect(unreadable.code).toBe(1);
    expect(unreadable.stderr).toContain(`  unreadable content: ${OWN} at ${"a".repeat(40)} could not be read; failing closed (AD-16)\n`);
    expect(unreadable.stderr).toContain(`  ${scopeLine(OWN)}\n`);
  });
});

xaravelTest("XT-conformance-180", "a planning/* PR may not change packages/** or conformance/expectations/**, in any letter case or through a rename; a truncated list fails closed (AD-16.7, MAINT-2026-10-17 item 15)", async () => {
  const allowed = ["AGENTS.md", "tools/a.ts", "decisions/x.md", "conformance/tests/a.ts", "stories/9.1.md", "packagesx/a", "conformance/expectationsx/a"];
  for (const path of allowed) {
    expect([path, planningAllowedPath(path)]).toEqual([path, true]);
  }
  const forbidden = ["packages/support/src/A.ts", "conformance/expectations/support/x.jsonl", "Packages/a.ts"];
  for (const path of [...forbidden, "PACKAGES/x", "Conformance/Expectations/x.jsonl", "tools/../packages/x.ts", "./packages/x.ts", "tools//x.ts", "/packages/x.ts"]) {
    expect([path, planningAllowedPath(path)]).toEqual([path, false]);
  }
  const scope = (path: string) =>
    `planning scope: ${path} may not change on a planning/* branch; packages/** and conformance/expectations/** change only through story/* branches (AD-16)`;

  await withRoots([fixtureRoot({ "9.1": story("9.1") })], async ([base]) => {
    // Allowed: passes through the function and the CLI.
    expect(evaluatePr(base!, { headRef: "planning/x", files: allowed.map((path) => file(path)), changedFiles: allowed.length })).toEqual({
      storyId: null,
      outOfScope: [],
      violations: [],
    });
    expect(await runPr({ ref: "planning/x", files: allowed.map((path) => file(path)) }, base!)).toMatchObject({
      code: 0,
      stdout: "Ownership OK: PR #7: planning/x passed the planning rule; no file is under packages/ or conformance/expectations/.\n",
      stderr: "",
    });

    // Forbidden: one planning scope line per path, sorted.
    const sorted = [...forbidden].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(evaluatePr(base!, { headRef: "planning/x", files: [file("AGENTS.md"), ...forbidden.map((path) => file(path))], changedFiles: 4 })).toEqual({
      storyId: null,
      outOfScope: sorted,
      violations: sorted.map(scope),
    });
    const failing = await runPr({ ref: "planning/x", files: forbidden.map((path) => file(path)) }, base!);
    expect(failing.code).toBe(1);
    expect(failing.stdout).toBe("");
    expect(failing.stderr).toBe(`Ownership violations (AD-16):\n${sorted.map((path) => `  ${scope(path)}`).join("\n")}\n`);
    // Never matches the orchestrator's `out of scope:` allowance for Story PRs.
    expect(failing.stderr).not.toContain("out of scope:");

    // A rename out of packages lists the previous name only.
    const renamed = await runPr({ ref: "planning/x", files: [file("docs/A.ts", "packages/support/A.ts")] }, base!);
    expect(renamed.code).toBe(1);
    expect(renamed.stderr).toBe(`Ownership violations (AD-16):\n  ${scope("packages/support/A.ts")}\n`);
    // Removing a file under packages is a change to packages.
    const removed = { filename: "packages/support/A.ts", status: "removed" };
    expect(evaluatePr(base!, { headRef: "planning/x", files: [removed], changedFiles: 1 }).violations).toEqual([scope("packages/support/A.ts")]);
    // A rename into packages lists the new name only.
    expect(evaluatePr(base!, { headRef: "planning/x", files: [file("packages/support/B.ts", "docs/B.ts")], changedFiles: 1 }).violations).toEqual([
      scope("packages/support/B.ts"),
    ]);
    // A copy leaves its source untouched.
    const copied = { filename: "docs/A.ts", previous_filename: "packages/support/A.ts", status: "copied" };
    expect(evaluatePr(base!, { headRef: "planning/x", files: [copied], changedFiles: 1 }).violations).toEqual([]);

    // A truncated file list fails closed.
    const truncated = await runPr({ ref: "planning/x", files: [file("AGENTS.md")], changedFiles: 2 }, base!);
    expect(truncated.code).toBe(1);
    expect(truncated.stderr).toContain("truncated file list: the API returned 1 of 2 changed files; failing closed");
  });
});

xaravelTest("XT-conformance-181", "a bot/* PR may change only conformance/expectations/** and conformance/escalations/ESC-bot-<n>.md; other non-Story branches still pass (AD-16.8, MAINT-2026-10-17 item 15)", async () => {
  const allowed = ["conformance/expectations/support/x.jsonl", "conformance/escalations/ESC-bot-3.md"];
  for (const path of [...allowed, "conformance/escalations/ESC-bot-12.md"]) {
    expect([path, botAllowedPath(path)]).toEqual([path, true]);
  }
  const forbidden = ["tools/x.ts", "packages/support/A.ts", "conformance/escalations/ESC-9.1-1.md", "conformance/expectations/../tools/x"];
  for (const path of [
    ...forbidden,
    "conformance/escalations/ESC-bot-0.md",
    "conformance/escalations/ESC-bot-x.md",
    "conformance/escalations/ESC-bot-3.md.bak",
    "Conformance/Expectations/x.jsonl",
    "conformance/expectations",
    "conformance/expectations/",
    "conformance/expectationsx/a",
  ]) {
    expect([path, botAllowedPath(path)]).toEqual([path, false]);
  }
  const scope = (path: string) =>
    `bot scope: ${path} is outside conformance/expectations/** and conformance/escalations/ESC-bot-<n>.md, the only paths a bot/* branch may change (AD-16)`;

  // Story 5.8: the bot value rule rejects an added shard and the identity rule needs the App as author, so the allowed
  // PR modifies an existing shard (a promotion) from the xaravel-bot App.
  const botFiles: PrFile[] = [{ filename: allowed[0]!, status: "modified" }, file(allowed[1]!)];
  const botBase = { [allowed[0]!]: OWN_LINE };
  const botHead = { [allowed[0]!]: OWN_PASS };
  const botContent = (path: string, side: "base" | "head"): string | null => (side === "base" ? botBase : botHead)[path] ?? null;

  await withRoots([fixtureRoot({ "9.1": story("9.1") })], async ([base]) => {
    // Allowed.
    expect(evaluatePr(base!, { headRef: "bot/q", files: botFiles, changedFiles: 2, author: BOT, content: botContent })).toEqual({ storyId: null, outOfScope: [], violations: [] }); // Story 5.8: author and content inputs
    expect(await runPr({ ref: "bot/q", files: botFiles, base: botBase, head: botHead, user: BOT }, base!)).toMatchObject({
      code: 0,
      stdout: "Ownership OK: PR #7: bot/q passed the bot rules (path, identity, status-only values).\n", // Story 5.8: the OK text names the three bot rules
      stderr: "",
    });

    // Forbidden: one bot scope line per path, sorted.
    const sorted = [...forbidden].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(evaluatePr(base!, { headRef: "bot/q", files: forbidden.map((path) => file(path)), changedFiles: 4, author: BOT })).toEqual({ // Story 5.8: author input
      storyId: null,
      outOfScope: sorted,
      violations: sorted.map(scope),
    });
    // Story 5.8: the allowed half is the App's status-only change, so only the path rule fails.
    const failing = await runPr({ ref: "bot/q", files: [...botFiles, ...forbidden.map((path) => file(path))], base: botBase, head: botHead, user: BOT }, base!);
    expect(failing.code).toBe(1);
    expect(failing.stderr).toBe(`Ownership violations (AD-16):\n${sorted.map((path) => `  ${scope(path)}`).join("\n")}\n`);
    expect(failing.stderr).not.toContain("out of scope:");

    // A rename into Expectations still lists the previous name.
    const renamed = evaluatePr(base!, { headRef: "bot/q", files: [file("conformance/expectations/support/x.jsonl", "tools/x.ts")], changedFiles: 1, author: BOT, content: botContent }); // Story 5.8: author and content inputs
    // Story 5.8: the bot value rule also rejects the shard the rename adds.
    expect(renamed.violations).toEqual([
      scope("tools/x.ts"),
      "bot value: conformance/expectations/support/x.jsonl is added (or renamed to); a bot/* branch never adds, removes or renames an Expectations shard (AD-16)",
    ]);
    // Story 5.8: a bot/* PR within the paths but not from the App fails the identity rule.
    expect(evaluatePr(base!, { headRef: "bot/q", files: botFiles, changedFiles: 2, author: { login: "someone", type: "User" }, content: botContent }).violations).toEqual([
      `bot identity: bot/q was opened by someone (type User), not the xaravel-bot App (${BOT_LOGIN}); only its bot/* PRs are exempt (AD-16)`,
    ]);

    // A truncated file list fails closed.
    const truncated = await runPr({ ref: "bot/q", files: [file(allowed[0]!)], changedFiles: 2 }, base!);
    expect(truncated.code).toBe(1);
    expect(truncated.stderr).toContain("truncated file list: the API returned 1 of 2 changed files; failing closed");

    // Any other branch, including a fork's, passes unchanged whatever it touches.
    for (const ref of ["feature/x", "main", "planningx/y", "botx/y"]) {
      expect(evaluatePr(base!, { headRef: ref, files: [file("packages/support/A.ts")], changedFiles: 1 })).toEqual({ storyId: null, outOfScope: [], violations: [] });
    }
    // Story 5.6: the pass-demotion rule reads a changed shard on every branch but bot/*; this added line demotes nothing.
    expect(await runPr({ ref: "feature/x", files: [file("packages/support/A.ts"), file("conformance/expectations/support/x.jsonl")], head: { "conformance/expectations/support/x.jsonl": OWN_LINE } }, base!)).toMatchObject({
      code: 0,
      stdout: "Ownership OK: PR #7: feature/x is not a Story branch.\n",
    });
  });
});

xaravelTest("XT-conformance-25", "a Test ID listed by two open Stories fails, naming both; Stories marked done no longer hold their IDs (AD-16.5, AD-21)", async () => {
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

  // Sprint status is the authority for whether a Story is open, read through sprint_key.
  const apply = (manifests: Manifest[], sprintStatus: string | null) => {
    const dir = fixtureRoot({}, sprintStatus);
    try {
      return applySprintStatus(dir, manifests);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const pair = (firstStatus: Manifest["status"]) => [manifest("9.1", ["T1"], firstStatus, [], "9-1-x"), manifest("9.2", ["T1"])];
  // Sprint says done: the manifest's backlog is overridden, so 9.1 no longer holds T1.
  const sprintDone = apply(pair("backlog"), sprintStatusText({ "9-1-x": "done" }));
  expect(sprintDone.violations).toEqual([]);
  expect(sprintDone.manifests.map((m) => m.status)).toEqual(["done", "backlog"]);
  expect(checkDuplicates(sprintDone.manifests)).toEqual([]);
  // Sprint says open: the manifest's done is overridden, so the duplicate is reported.
  const sprintOpen = apply(pair("done"), sprintStatusText({ "9-1-x": "in-progress" }));
  expect(sprintOpen.violations).toEqual([]);
  expect(checkDuplicates(sprintOpen.manifests)).toEqual(["duplicate test id: T1 is listed by open Story 9.1, Story 9.2 (AD-16)"]);
  // Unknown key.
  expect(apply(pair("backlog"), sprintStatusText({ "9-2-y": "done" })).violations).toEqual([
    `unknown sprint key: stories/9.1.md: sprint_key "9-1-x" is not in ${SPRINT_STATUS} development_status (AD-16)`,
  ]);
  // A value outside the Story statuses.
  expect(apply(pair("backlog"), sprintStatusText({ "9-1-x": "optional" })).violations).toEqual([
    `invalid sprint status: ${SPRINT_STATUS}: development_status.9-1-x must be one of backlog, ready-for-dev, in-progress, review, done, blocked, got "optional" (AD-16)`,
  ]);
  // A bad file fails closed.
  for (const [text, problem] of [
    ["development_status: [\n", "is unreadable or not valid YAML"],
    ["- a\n- b\n", "must be a YAML mapping"],
    ["project: xaravel\n", "development_status must be a mapping, missing"],
    ["development_status: [a]\n", 'development_status must be a mapping, got ["a"]'],
  ] as const) {
    const result = apply(pair("backlog"), text);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toStartWith(`invalid sprint status: ${SPRINT_STATUS}: ${problem}`);
  }
  // No sprint status file: the manifest status is used, as before.
  expect(apply(pair("done"), null)).toEqual({ manifests: pair("done"), violations: [] });
  // No sprint_key with sprint status present: the manifest status is used.
  const keyless = [manifest("9.1", ["T1"], "done"), manifest("9.2", ["T1"])];
  expect(apply(keyless, sprintStatusText({ "9-1-x": "in-progress" }))).toEqual({ manifests: keyless, violations: [] });

  // The same rows through the CLI.
  const keyed = (status: string) => ({ "9.1": story("9.1", { test_ids: ["T1"], status, sprint_key: "9-1-x" }), "9.2": story("9.2", { test_ids: ["T1"] }) });
  await withRoots(
    [
      fixtureRoot(keyed("backlog"), sprintStatusText({ "9-1-x": "done" })),
      fixtureRoot(keyed("done"), sprintStatusText({ "9-1-x": "in-progress" })),
      fixtureRoot(keyed("backlog"), sprintStatusText({ "9-2-y": "done" })),
      fixtureRoot(keyed("backlog"), sprintStatusText({ "9-1-x": "optional" })),
      fixtureRoot(keyed("backlog"), "development_status: [\n"),
      fixtureRoot(keyed("backlog"), "project: xaravel\n"),
      fixtureRoot(keyed("done")),
      fixtureRoot({ "9.1": story("9.1", { test_ids: ["T1"], status: "done" }), "9.2": story("9.2", { test_ids: ["T2"] }) }, sprintStatusText({ "9-1-x": "in-progress" })),
    ],
    async ([sprintDoneRoot, sprintOpenRoot, unknownRoot, badValueRoot, badYamlRoot, noMappingRoot, noFileRoot, noKeyRoot]) => {
      expect(await runCli(["manifests", "--root", sprintDoneRoot!])).toMatchObject({
        code: 0,
        stdout: "Ownership OK: 2 manifest(s) valid, 1 open, no duplicate Test IDs.\n",
      });
      const open = await runCli(["manifests", "--root", sprintOpenRoot!]);
      expect(open.code).toBe(1);
      expect(open.stderr).toBe("Ownership violations (AD-16):\n  duplicate test id: T1 is listed by open Story 9.1, Story 9.2 (AD-16)\n");
      const unknown = await runCli(["manifests", "--root", unknownRoot!]);
      expect(unknown.code).toBe(1);
      expect(unknown.stderr).toContain(`unknown sprint key: stories/9.1.md: sprint_key "9-1-x" is not in ${SPRINT_STATUS} development_status (AD-16)`);
      const badValue = await runCli(["manifests", "--root", badValueRoot!]);
      expect(badValue.code).toBe(1);
      expect(badValue.stderr).toContain(`invalid sprint status: ${SPRINT_STATUS}: development_status.9-1-x must be one of`);
      for (const dir of [badYamlRoot!, noMappingRoot!]) {
        const failing = await runCli(["manifests", "--root", dir]);
        expect(failing.code).toBe(1);
        expect(failing.stderr).toContain(`invalid sprint status: ${SPRINT_STATUS}: `);
      }
      expect(await runCli(["manifests", "--root", noFileRoot!])).toMatchObject({
        code: 0,
        stdout: "Ownership OK: 2 manifest(s) valid, 1 open, no duplicate Test IDs.\n",
      });
      expect(await runCli(["manifests", "--root", noKeyRoot!])).toMatchObject({
        code: 0,
        stdout: "Ownership OK: 2 manifest(s) valid, 1 open, no duplicate Test IDs.\n",
      });
    },
  );
});
