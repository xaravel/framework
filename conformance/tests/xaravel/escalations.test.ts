// Xaravel Tests for Story 1.6 (Escalation and decision records).
// These run under plain `bun test` until the harness lands in Epic 5.
import { afterAll, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkRecords,
  DECISIONS_DIR,
  ESCALATIONS_DIR,
  escalationDigest,
  escalationStatus,
  evaluatePr,
  openEscalationWarnings,
  parseDecision,
  parseEscalation,
  parseEscalationId,
  pathsToFetch,
  TRIGGERS,
} from "../../../tools/escalations/escalations";
import { SPRINT_STATUS, STORIES_DIR } from "../../../tools/ownership/ownership";
import type { PrFile } from "../../../tools/protected-paths/protected-paths";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "escalations", "escalations.ts");

interface EscalationFields {
  test_ids?: unknown;
  trigger?: unknown;
  proposed?: unknown;
  evidence?: unknown;
}

/** Frontmatter from `fields` (YAML is a JSON superset), then `body`. */
function recordText(fields: Record<string, unknown>, body = "\n# Escalation\n\nDetails.\n"): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function escalation(overrides: EscalationFields = {}): string {
  return recordText({
    test_ids: ["Illuminate\\Tests\\Support\\SupportStrTest::testIs"],
    trigger: "php-only",
    proposed: "Skip as php-only.",
    evidence: "The test drives a PHP extension.",
    ...overrides,
  });
}

const RULING = "\n# Ruling\n\nApproved: the extension has no Bun equivalent.\n";

/** A decision bound by default to the digest of `escalation()`; `sha: { value: undefined }` omits the field. */
function decision(value: unknown, body = RULING, sha: { value: unknown } = { value: escalationDigest(escalation()) }): string {
  return recordText({ decision: value, decided_by: "Maintainer", escalation_sha256: sha.value }, body);
}

/** A hermetic root holding the given repo-relative files. */
function fixtureRoot(files: Record<string, string> = {}): string {
  const tmp = mkdtempSync(join(tmpdir(), "xaravel-escalations-"));
  for (const [path, text] of Object.entries(files)) {
    const full = join(tmp, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return tmp;
}

const STR_IS = "Illuminate\\Tests\\Support\\SupportStrTest::testIs";
const STR_IS_UUID = "Illuminate\\Tests\\Support\\SupportStrTest::testIsUuid";
const story = (id: string): string => `${STORIES_DIR}/${id}.md`;

/** A Story manifest owning the given Test IDs, at `status` (default `in-progress`). */
function manifest(storyId: string, testIds: string[], xaravelTestIds: string[] = [], status = "in-progress"): string {
  return recordText(
    { story_id: storyId, epic: Number(storyId.split(".")[0]), component: "support", status, test_ids: testIds, xaravel_test_ids: xaravelTestIds },
    `\n# Story ${storyId}\n`,
  );
}

/**
 * The base checkout `pr` judges Escalation Test IDs against: Story 9.1 owns
 * `escalation()`'s default Test ID and an XT ID; Story 9.2 also owns
 * `STR_IS_UUID`.
 */
const BASE = fixtureRoot({
  [story("9.1")]: manifest("9.1", [STR_IS], ["XT-support-1"]),
  [story("9.2")]: manifest("9.2", [STR_IS, STR_IS_UUID]),
});
afterAll(() => rmSync(BASE, { recursive: true, force: true }));

/** A root path that does not exist: reading any manifest from it would fail. */
function fixtureRootGone(): string {
  return join(BASE, "absent");
}

async function withRoot(files: Record<string, string>, body: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fixtureRoot(files);
  try {
    await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
  ref: string;
  files: PrFile[];
  changedFiles?: number;
  /** Endpoint paths (relative to the repo) that answer HTTP 500. */
  fail?: string[];
  /** Head contents by path. */
  head?: Record<string, string>;
  /** The base checkout passed as `--root` (default `BASE`). */
  root?: string;
}

const SHA = "a".repeat(40);
const added = (filename: string): PrFile => ({ filename, status: "added" });
const removed = (filename: string): PrFile => ({ filename, status: "removed" });
const esc = (id: string): string => `${ESCALATIONS_DIR}/${id}.md`;
const dec = (id: string): string => `${DECISIONS_DIR}/${id}.md`;

/** Runs `pr` against a `Bun.serve` fake of the GitHub API on port 0. */
async function runPr(pr: FakePr): Promise<{ code: number; stdout: string; stderr: string; refs: string[] }> {
  const refs: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (request.headers.get("authorization") !== "Bearer test-token") {
        return new Response("unauthorized", { status: 401 });
      }
      const base = "/repos/xaravel/framework";
      if ((pr.fail ?? []).some((path) => url.pathname === `${base}/${path}`)) {
        return new Response("boom", { status: 500 });
      }
      if (url.pathname === `${base}/pulls/7`) {
        return Response.json({ number: 7, head: { sha: SHA, ref: pr.ref }, changed_files: pr.changedFiles ?? pr.files.length });
      }
      if (url.pathname === `${base}/pulls/7/files`) {
        const size = Number(url.searchParams.get("per_page") ?? "30");
        const n = Number(url.searchParams.get("page") ?? "1");
        return Response.json(pr.files.slice((n - 1) * size, n * size));
      }
      if (url.pathname.startsWith(`${base}/contents/`)) {
        refs.push(url.searchParams.get("ref") ?? "");
        const content = (pr.head ?? {})[url.pathname.slice(`${base}/contents/`.length)];
        return content === undefined ? new Response("not found", { status: 404 }) : new Response(content);
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const result = await runCli(["pr", "--repo", "xaravel/framework", "--pr", "7", "--root", pr.root ?? BASE], {
      GITHUB_API_URL: `http://localhost:${server.port}`,
      GH_TOKEN: "test-token",
    });
    return { ...result, refs };
  } finally {
    await server.stop(true);
  }
}

/** `evaluatePr` with head contents for every path it asks for, against the base checkout `base`. */
function judge(headRef: string, files: PrFile[], head: Record<string, string>, changedFiles = files.length, base = BASE): string[] {
  const contents = new Map(pathsToFetch(files).map((path) => [path, head[path] ?? null] as const));
  return evaluatePr({ root: base, headRef, files, changedFiles, contents }).violations;
}

xaravelTest("XT-conformance-26", "an Escalation requires test_ids, an FR-114 trigger, proposed and evidence, and a PR whose branch Story ID differs from the file's fails (FR-114.1, AD-16.9)", async () => {
  const check = (text: string, file = esc("ESC-9.1-1")) => parseEscalation(file, text).violations;

  // Valid escalation, for every FR-114 trigger.
  expect(TRIGGERS).toEqual(["divergence", "protected-path", "upstream-test-wrong", "flaky", "php-only", "open-question", "contract"]);
  for (const trigger of TRIGGERS) {
    expect(check(escalation({ trigger }))).toEqual([]);
  }
  const parsed = parseEscalation(esc("ESC-9.1-1"), escalation()).escalation;
  expect(parsed).toMatchObject({ id: { id: "ESC-9.1-1", storyId: "9.1", n: 1 }, trigger: "php-only" });

  // Missing field: each required field is named.
  for (const field of ["test_ids", "trigger", "proposed", "evidence"] as const) {
    const violations = check(escalation({ [field]: undefined }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toStartWith(`invalid escalation: ${esc("ESC-9.1-1")}: ${field} `);
    expect(violations[0]).toEndWith("(AD-16)");
  }
  // Unknown trigger: named, with the slugs listed.
  const unknown = check(escalation({ trigger: "boredom" }));
  expect(unknown).toHaveLength(1);
  expect(unknown[0]).toContain(": trigger must be one of divergence, protected-path, upstream-test-wrong, flaky, php-only, open-question, contract");
  expect(unknown[0]).toContain('got "boredom"');
  // Empty or malformed test_ids, empty proposed/evidence.
  expect(check(escalation({ test_ids: [] }))[0]).toContain(": test_ids must be a non-empty list");
  expect(check(escalation({ test_ids: [" padded"] }))[0]).toContain(": test_ids ");
  expect(check(escalation({ test_ids: "T-1" }))[0]).toContain(": test_ids ");
  expect(check(escalation({ proposed: "  " }))[0]).toContain(": proposed must be a non-empty string");
  expect(check(escalation({ evidence: 3 }))[0]).toContain(": evidence must be a non-empty string");
  // No frontmatter.
  expect(check("# Escalation\n")[0]).toContain(": frontmatter is missing");
  // Bad names.
  expect(check(escalation(), esc("ESC-9.1-0"))[0]).toContain(`invalid escalation: ${esc("ESC-9.1-0")}: file name must be ESC-<story-id>-<n>.md`);
  expect(check(escalation(), `${ESCALATIONS_DIR}/notes.md`)[0]).toContain(": file name ");

  // `check` on a fixture root: valid passes; missing field and bad names fail.
  await withRoot({ [esc("ESC-9.1-1")]: escalation() }, async (dir) => {
    expect(await runCli(["check", "--root", dir])).toMatchObject({ code: 0 });
  });
  await withRoot(
    { [esc("ESC-9.1-1")]: escalation({ evidence: undefined }), [esc("ESC-9.1-0")]: escalation(), [`${ESCALATIONS_DIR}/notes.md`]: escalation() },
    async (dir) => {
      const run = await runCli(["check", "--root", dir]);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(`invalid escalation: ${esc("ESC-9.1-1")}: evidence must be a non-empty string, missing (AD-16)`);
      expect(run.stderr).toContain(`invalid escalation: ${esc("ESC-9.1-0")}: file name`);
      expect(run.stderr).toContain(`invalid escalation: ${ESCALATIONS_DIR}/notes.md: file name`);
    },
  );

  // PR name matching, as a function.
  expect(judge("story/9.1", [added(esc("ESC-9.1-2"))], { [esc("ESC-9.1-2")]: escalation() })).toEqual([]);
  expect(judge("story/9.1", [added(esc("ESC-9.2-1"))], { [esc("ESC-9.2-1")]: escalation() })).toEqual([
    `wrong story: ${esc("ESC-9.2-1")}: branch story/9.1 may raise only ESC-9.1-<n> (AD-16)`,
  ]);
  expect(judge("planning/x", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation() })[0]).toStartWith(
    `wrong story: ${esc("ESC-9.1-1")}: branch planning/x is neither story/<story-id> nor bot/*`,
  );
  expect(judge("story/x", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation() })[0]).toStartWith("wrong story: ");
  expect(judge("story/9.1", [removed(esc("ESC-9.2-1"))], {})).toEqual([]);
  expect(judge("story/9.1", [added(esc("ESC-9.1-0"))], {})[0]).toContain(`invalid escalation: ${esc("ESC-9.1-0")}: file name`);
  expect(judge("story/9.1", [added(`${ESCALATIONS_DIR}/sub/ESC-9.1-1.md`)], {})[0]).toContain("invalid escalation: ");
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], {})).toEqual([
    `missing head file: ${esc("ESC-9.1-1")} could not be read at the PR's head commit; failing closed (AD-16)`,
  ]);
  expect(judge("story/9.1", [], {}, 3)[0]).toStartWith("truncated file list: the API returned 0 of 3 changed files");

  // PR name matching, through the CLI against a fake API.
  const own = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-2")), added("packages/support/src/A.ts")], head: { [esc("ESC-9.1-2")]: escalation() } });
  expect(own).toMatchObject({ code: 0, stdout: "Escalations OK: PR #7: 1 escalation/decision file(s) valid.\n" });
  // The Escalation and its (absent) decision are both read at the head commit.
  expect(own.refs).toEqual([SHA, SHA]);
  const other = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.2-1"))], head: { [esc("ESC-9.2-1")]: escalation() } });
  expect(other.code).toBe(1);
  expect(other.stderr).toContain(`wrong story: ${esc("ESC-9.2-1")}: branch story/9.1 may raise only ESC-9.1-<n> (AD-16)`);
  const planning = await runPr({ ref: "planning/x", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: escalation() } });
  expect(planning.code).toBe(1);
  expect(planning.stderr).toContain("wrong story: ");
  const invalid = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: escalation({ proposed: undefined }) } });
  expect(invalid.code).toBe(1);
  expect(invalid.stderr).toContain(`invalid escalation: ${esc("ESC-9.1-1")}: proposed`);
  const gone = await runPr({ ref: "story/9.1", files: [removed(esc("ESC-9.2-1"))] });
  expect(gone.code).toBe(0);
  expect(gone.refs).toEqual([]);
  const truncated = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], changedFiles: 2, head: { [esc("ESC-9.1-1")]: escalation() } });
  expect(truncated.code).toBe(1);
  expect(truncated.stderr).toContain("truncated file list: the API returned 1 of 2 changed files; failing closed (AD-16)");
  const broken = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], fail: ["pulls/7/files"] });
  expect(broken.code).toBe(1);
  expect(broken.stderr).toContain("Escalation check failed: GET /pulls/7/files?per_page=100&page=1: HTTP 500");
  const usage = await runCli(["pr", "--repo", "xaravel/framework"]);
  expect(usage.code).toBe(2);

  // Test ID ownership: a Story escalates only Test IDs in its base manifest.
  const unowned = (id: string, testId: string, storyId = "9.1"): string =>
    `unowned test id: ${esc(id)}: ${testId} is not in Story ${storyId}'s test_ids or xaravel_test_ids (${story(storyId)} on the base branch) (AD-16)`;
  // Owned through test_ids, xaravel_test_ids, or both.
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation({ test_ids: [STR_IS] }) })).toEqual([]);
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation({ test_ids: ["XT-support-1"] }) })).toEqual([]);
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation({ test_ids: [STR_IS, "XT-support-1"] }) })).toEqual([]);
  // A Test ID another Story owns (or nobody does): one line per ID, in order.
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation({ test_ids: [STR_IS_UUID, STR_IS, "XT-support-9"] }) })).toEqual([
    unowned("ESC-9.1-1", STR_IS_UUID),
    unowned("ESC-9.1-1", "XT-support-9"),
  ]);
  // A repeated unowned ID is reported once.
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation({ test_ids: [STR_IS_UUID, STR_IS_UUID] }) })).toEqual([
    unowned("ESC-9.1-1", STR_IS_UUID),
  ]);
  // Two Escalations from one Story: only the foreign ID is reported.
  expect(
    judge("story/9.1", [added(esc("ESC-9.1-1")), added(esc("ESC-9.1-2"))], {
      [esc("ESC-9.1-1")]: escalation({ test_ids: [STR_IS_UUID] }),
      [esc("ESC-9.1-2")]: escalation(),
    }),
  ).toEqual([unowned("ESC-9.1-1", STR_IS_UUID)]);
  // The raising Story is the Escalation's, even on the wrong branch.
  expect(judge("story/9.1", [added(esc("ESC-9.2-1"))], { [esc("ESC-9.2-1")]: escalation({ test_ids: ["XT-support-1"] }) })).toEqual([
    `wrong story: ${esc("ESC-9.2-1")}: branch story/9.1 may raise only ESC-9.1-<n> (AD-16)`,
    unowned("ESC-9.2-1", "XT-support-1", "9.2"),
  ]);
  // No manifest on base: fail closed.
  expect(judge("story/9.3", [added(esc("ESC-9.3-1"))], { [esc("ESC-9.3-1")]: escalation() })).toEqual([
    `missing manifest: ${esc("ESC-9.3-1")}: Escalation ESC-9.3-1 is raised by Story 9.3, which has no ${story("9.3")} on the base branch (AD-16)`,
  ]);
  // An invalid manifest on base: fail closed, naming its first violation.
  await withRoot({ [story("9.1")]: manifest("9.1", []) }, (dir) => {
    expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation() }, 1, dir)).toEqual([
      `missing manifest: ${esc("ESC-9.1-1")}: Escalation ESC-9.1-1 is raised by Story 9.1, whose ${story("9.1")} on the base branch is invalid: invalid manifest: ${story("9.1")}: test_ids/xaravel_test_ids are both absent or empty; a Story with no assigned tests can't be done (AD-16)`,
    ]);
  });
  // A bot Escalation has no raising Story, so no manifest is read.
  expect(judge("bot/x", [added(esc("ESC-bot-3"))], { [esc("ESC-bot-3")]: escalation({ test_ids: ["anything"] }) }, 1, fixtureRootGone())).toEqual([]);
  // An invalid Escalation reports only its own violations.
  expect(judge("story/9.3", [added(esc("ESC-9.3-1"))], { [esc("ESC-9.3-1")]: escalation({ trigger: "boredom" }) })).toEqual([
    expect.stringMatching(/^invalid escalation: .*: trigger must be one of /),
  ]);
  // A removed Escalation is not judged.
  expect(judge("story/9.3", [removed(esc("ESC-9.3-1"))], {})).toEqual([]);

  // Through the CLI: `--root` is the base checkout, and the PR's own manifest edit does not count.
  const widenedIds = escalation({ test_ids: [STR_IS, STR_IS_UUID] });
  const foreign = await runPr({
    ref: "story/9.1",
    files: [added(esc("ESC-9.1-1")), { filename: story("9.1"), status: "modified" }],
    head: { [esc("ESC-9.1-1")]: widenedIds, [story("9.1")]: manifest("9.1", [STR_IS, STR_IS_UUID]) },
  });
  expect(foreign.code).toBe(1);
  expect(foreign.stderr).toContain(unowned("ESC-9.1-1", STR_IS_UUID));
  expect(foreign.stderr).not.toContain(unowned("ESC-9.1-1", STR_IS));
  // The same Escalation passes against a base whose manifest owns the ID.
  await withRoot({ [story("9.1")]: manifest("9.1", [STR_IS, STR_IS_UUID]) }, async (dir) => {
    const owned = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: widenedIds }, root: dir });
    expect(owned).toMatchObject({ code: 0, stdout: "Escalations OK: PR #7: 1 escalation/decision file(s) valid.\n" });
  });
  await withRoot({}, async (dir) => {
    const bare = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: escalation() }, root: dir });
    expect(bare.code).toBe(1);
    expect(bare.stderr).toContain(`missing manifest: ${esc("ESC-9.1-1")}: Escalation ESC-9.1-1 is raised by Story 9.1, which has no ${story("9.1")} on the base branch (AD-16)`);
  });
  const botPr = await runPr({ ref: "bot/x", files: [added(esc("ESC-bot-3"))], head: { [esc("ESC-bot-3")]: escalation({ test_ids: ["anything"] }) }, root: fixtureRootGone() });
  expect(botPr.code).toBe(0);
});

xaravelTest("XT-conformance-27", "a decision file requires decision: approved | rejected and a rationale (FR-114.4, AD-16.9)", async () => {
  const check = (text: string, file = dec("ESC-9.1-1")) => parseDecision(file, text).violations;

  // Valid decisions.
  expect(check(decision("approved"))).toEqual([]);
  expect(check(decision("rejected", "\nNot a php-only case.\n"))).toEqual([]);
  expect(parseDecision(dec("ESC-9.1-1"), decision("approved")).decision).toMatchObject({ id: { storyId: "9.1", n: 1 }, decision: "approved" });

  // Bad decisions: field and rationale named.
  const maybe = check(decision("maybe"));
  expect(maybe).toEqual([`invalid decision: ${dec("ESC-9.1-1")}: decision must be one of approved, rejected, got "maybe" (AD-16)`]);
  expect(check(decision(undefined))[0]).toContain(": decision must be one of approved, rejected, missing");
  const headingOnly = check(decision("approved", "\n# Ruling\n\n## Why\n   \n"));
  expect(headingOnly).toHaveLength(1);
  expect(headingOnly[0]).toStartWith(`invalid decision: ${dec("ESC-9.1-1")}: rationale is missing`);
  expect(check(decision("approved", ""))[0]).toContain(": rationale is missing");
  expect(check("no frontmatter\n")[0]).toContain(": frontmatter is missing");
  expect(check(decision("approved"), dec("ESC-9.1-01"))[0]).toContain(": file name ");

  // `check` on a fixture root: valid pair passes; a MAINT decision is ignored.
  const maint = recordText({ decision: "approved", decided_by: "Maintainer" }, "\n# Ruling\n");
  await withRoot(
    { [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision("approved"), [dec("MAINT-2026-10-16-x")]: maint },
    async (dir) => {
      const run = await runCli(["check", "--root", dir]);
      expect(run).toMatchObject({ code: 0, stdout: "Escalations OK: 1 escalation(s) and 1 decision(s) valid.\n" });
      expect(checkRecords(dir).violations).toEqual([]);
    },
  );
  // Bad decisions and an orphan decision fail.
  await withRoot(
    { [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision("maybe"), [dec("ESC-9.1-5")]: decision("approved") },
    async (dir) => {
      const run = await runCli(["check", "--root", dir]);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(`invalid decision: ${dec("ESC-9.1-1")}: decision must be one of approved, rejected`);
      expect(run.stderr).toContain(`orphan decision: ${dec("ESC-9.1-5")} has no ${esc("ESC-9.1-5")} (AD-16)`);
    },
  );
  // Neither directory present: passes.
  await withRoot({}, async (dir) => {
    expect(await runCli(["check", "--root", dir])).toMatchObject({ code: 0, stdout: "Escalations OK: 0 escalation(s) and 0 decision(s) valid.\n" });
  });

  // The repo root passes (its MAINT decision is not an Escalation decision).
  expect(checkRecords(root).violations).toEqual([]);
  const live = await runCli(["check"]);
  expect(live.code).toBe(0);
  expect(live.stdout).toStartWith("Escalations OK: ");

  // A PR's decision content is fetched at head and validated.
  expect(judge("story/9.1", [added(dec("ESC-9.1-1"))], { [dec("ESC-9.1-1")]: decision("approved"), [esc("ESC-9.1-1")]: escalation() })).toEqual([]);
  expect(judge("story/9.1", [added(dec("MAINT-x"))], {})).toEqual([]);
  // A PR decision with no Escalation at head is an orphan.
  expect(judge("story/9.1", [added(dec("ESC-9.1-5"))], { [dec("ESC-9.1-5")]: decision("approved") })).toEqual([
    `orphan decision: ${dec("ESC-9.1-5")} has no ${esc("ESC-9.1-5")} (AD-16)`,
  ]);
  const orphanPr = await runPr({ ref: "planning/x", files: [added(dec("ESC-9.1-5"))], head: { [dec("ESC-9.1-5")]: decision("approved") } });
  expect(orphanPr.code).toBe(1);
  expect(orphanPr.stderr).toContain(`orphan decision: ${dec("ESC-9.1-5")} has no ${esc("ESC-9.1-5")} (AD-16)`);
  expect(orphanPr.refs).toEqual([SHA, SHA]);
  const pairedPr = await runPr({ ref: "planning/x", files: [added(dec("ESC-9.1-1"))], head: { [dec("ESC-9.1-1")]: decision("approved"), [esc("ESC-9.1-1")]: escalation() } });
  expect(pairedPr.code).toBe(0);
  const badPr = await runPr({ ref: "planning/x", files: [added(dec("ESC-9.1-1"))], head: { [dec("ESC-9.1-1")]: decision("yes"), [esc("ESC-9.1-1")]: escalation() } });
  expect(badPr.code).toBe(1);
  expect(badPr.stderr).toContain(`invalid decision: ${dec("ESC-9.1-1")}: decision must be one of approved, rejected, got "yes" (AD-16)`);

  // Binding: escalation_sha256 is required, 64 lowercase hex characters.
  expect(escalationDigest(escalation())).toMatch(/^[0-9a-f]{64}$/);
  expect(escalationDigest(escalation().replace(/\n/g, "\r\n"))).toBe(escalationDigest(escalation()));
  expect(escalationDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(parseDecision(dec("ESC-9.1-1"), decision("approved")).decision?.digest).toBe(escalationDigest(escalation()));
  for (const bad of [undefined, "", "A".repeat(64), "a".repeat(63), "g".repeat(64), 42] as const) {
    const violations = check(decision("approved", RULING, { value: bad }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toStartWith(`invalid decision: ${dec("ESC-9.1-1")}: escalation_sha256 must be `);
    expect(violations[0]).toEndWith("(AD-16)");
  }
  const widened = escalation({ proposed: "Skip every SupportStrTest test as php-only." });
  const staleLine = `stale decision: ${dec("ESC-9.1-1")}: escalation_sha256 ${escalationDigest(escalation())} does not match ${esc("ESC-9.1-1")} (sha256 ${escalationDigest(widened)})`;
  // `check`: an Escalation edited after its ruling makes the decision stale.
  await withRoot({ [esc("ESC-9.1-1")]: widened, [dec("ESC-9.1-1")]: decision("approved") }, async (dir) => {
    const run = await runCli(["check", "--root", dir]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(staleLine);
    expect(checkRecords(dir).violations).toHaveLength(1);
    expect(checkRecords(dir).violations[0]).toStartWith(staleLine);
  });
  // `check`: a decision without escalation_sha256 is invalid.
  await withRoot({ [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision("approved", RULING, { value: undefined }) }, async (dir) => {
    const run = await runCli(["check", "--root", dir]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`invalid decision: ${dec("ESC-9.1-1")}: escalation_sha256 must be `);
  });
  // `pr`: a changed decision bound to other text is stale.
  expect(judge("story/9.1", [added(dec("ESC-9.1-1"))], { [dec("ESC-9.1-1")]: decision("approved"), [esc("ESC-9.1-1")]: widened })[0]).toStartWith(staleLine);
  // `pr`: a PR changing only a decided Escalation reads the decision at head and reports it stale.
  expect(pathsToFetch([added(esc("ESC-9.1-1"))])).toEqual([esc("ESC-9.1-1"), dec("ESC-9.1-1")]);
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: widened, [dec("ESC-9.1-1")]: decision("approved") })).toEqual([
    expect.stringMatching(/^stale decision: /),
  ]);
  expect(judge("story/9.1", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision("approved") })).toEqual([]);
  // `pr`: an unchanged decision at head on a changed Escalation is itself validated.
  const unboundAtHead = judge("story/9.1", [added(esc("ESC-9.1-1"))], {
    [esc("ESC-9.1-1")]: widened,
    [dec("ESC-9.1-1")]: decision("approved", RULING, { value: undefined }),
  });
  expect(unboundAtHead).toHaveLength(1);
  expect(unboundAtHead[0]).toStartWith(`invalid decision: ${dec("ESC-9.1-1")}: escalation_sha256 must be `);
  const stalePr = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: widened, [dec("ESC-9.1-1")]: decision("approved") } });
  expect(stalePr.code).toBe(1);
  expect(stalePr.stderr).toContain(staleLine);
  expect(stalePr.refs).toEqual([SHA, SHA]);
  // `pr`: editing an undecided Escalation passes (no decision at head, nothing to bind).
  const undecidedPr = await runPr({ ref: "story/9.1", files: [added(esc("ESC-9.1-1"))], head: { [esc("ESC-9.1-1")]: widened } });
  expect(undecidedPr).toMatchObject({ code: 0, stdout: "Escalations OK: PR #7: 1 escalation/decision file(s) valid.\n" });
  // `pr`: editing a decided Escalation together with a re-bound decision passes.
  const reboundPr = await runPr({
    ref: "story/9.1",
    files: [added(esc("ESC-9.1-1")), added(dec("ESC-9.1-1"))],
    head: { [esc("ESC-9.1-1")]: widened, [dec("ESC-9.1-1")]: decision("approved", RULING, { value: escalationDigest(widened) }) },
  });
  expect(reboundPr).toMatchObject({ code: 0, stdout: "Escalations OK: PR #7: 2 escalation/decision file(s) valid.\n" });

  // `digest <id>` prints the value to write.
  await withRoot({ [esc("ESC-9.1-1")]: escalation() }, async (dir) => {
    expect(await runCli(["digest", "ESC-9.1-1", "--root", dir])).toMatchObject({ code: 0, stdout: `${escalationDigest(escalation())}\n` });
    const unknown = await runCli(["digest", "ESC-9.1-2", "--root", dir]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("unknown Escalation ESC-9.1-2");
  });
  expect((await runCli(["digest", "ESC-9.1-01"])).code).toBe(2);
  expect((await runCli(["digest"])).code).toBe(2);
});

xaravelTest("XT-conformance-28", "escalationStatus(id) is open with no decision file, and approved or rejected only once a valid decision file exists (FR-114, AD-16.9)", async () => {
  await withRoot(
    {
      [esc("ESC-9.1-1")]: escalation(),
      [esc("ESC-9.1-2")]: escalation(),
      [dec("ESC-9.1-2")]: decision("approved"),
      [esc("ESC-9.1-3")]: escalation(),
      [dec("ESC-9.1-3")]: decision("rejected"),
      [esc("ESC-9.1-4")]: escalation(),
      [dec("ESC-9.1-4")]: decision("yes"),
      [esc("ESC-9.1-6")]: escalation(),
      [dec("ESC-9.1-6")]: decision("approved", "\n# Ruling\n"),
      [dec("ESC-9.1-5")]: decision("approved"),
      [esc("ESC-9.1-7")]: escalation(),
      [dec("ESC-9.1-7")]: decision("approved", RULING, { value: undefined }),
      [esc("ESC-9.1-8")]: escalation(),
      [dec("ESC-9.1-8")]: decision("rejected"),
    },
    (dir) => {
      expect(escalationStatus("ESC-9.1-1", dir)).toBe("open");
      expect(escalationStatus("ESC-9.1-2", dir)).toBe("approved");
      expect(escalationStatus("ESC-9.1-3", dir)).toBe("rejected");
      // An invalid decision file does not decide.
      expect(escalationStatus("ESC-9.1-4", dir)).toBe("open");
      expect(escalationStatus("ESC-9.1-6", dir)).toBe("open");
      // A decision without escalation_sha256 does not decide.
      expect(escalationStatus("ESC-9.1-7", dir)).toBe("open");
      // An Escalation edited after its ruling is open again (fail closed), and re-binding decides it.
      expect(escalationStatus("ESC-9.1-8", dir)).toBe("rejected");
      expect(escalationStatus("ESC-9.1-2", dir)).toBe("approved");
      const widened = escalation({ proposed: "Skip every SupportStrTest test as php-only." });
      writeFileSync(join(dir, esc("ESC-9.1-2")), widened);
      expect(escalationStatus("ESC-9.1-2", dir)).toBe("open");
      writeFileSync(join(dir, esc("ESC-9.1-8")), widened);
      expect(escalationStatus("ESC-9.1-8", dir)).toBe("open");
      writeFileSync(join(dir, dec("ESC-9.1-2")), decision("approved", RULING, { value: escalationDigest(widened) }));
      expect(escalationStatus("ESC-9.1-2", dir)).toBe("approved");
      // CRLF line endings do not change the binding.
      writeFileSync(join(dir, esc("ESC-9.1-2")), widened.replace(/\n/g, "\r\n"));
      expect(escalationStatus("ESC-9.1-2", dir)).toBe("approved");
      // A decision without its Escalation (an orphan) does not count: it throws.
      expect(() => escalationStatus("ESC-9.1-5", dir)).toThrow("unknown Escalation ESC-9.1-5");
      // Unknown or malformed IDs throw, so callers fail closed.
      expect(() => escalationStatus("ESC-9.9-9", dir)).toThrow("unknown Escalation ESC-9.9-9");
      expect(() => escalationStatus("ESC-x", dir)).toThrow("malformed Escalation ID");
      expect(() => escalationStatus("ESC-9.1-01", dir)).toThrow("malformed Escalation ID");
      expect(() => escalationStatus("../ESC-9.1-1", dir)).toThrow("malformed Escalation ID");

      // A decision written later moves the Escalation from open to decided.
      writeFileSync(join(dir, dec("ESC-9.1-1")), decision("rejected"));
      expect(escalationStatus("ESC-9.1-1", dir)).toBe("rejected");
    },
  );
  // The default root is the repository.
  expect(() => escalationStatus("ESC-999.999-999")).toThrow("unknown Escalation");
});

xaravelTest("XT-conformance-29", "bot-raised ESC-bot-<n> Escalations are accepted with no Story ID (FR-114, AD-16.8)", async () => {
  expect(parseEscalationId("ESC-bot-3")).toEqual({ id: "ESC-bot-3", storyId: null, n: 3 });
  expect(parseEscalationId("ESC-9.1-12")).toEqual({ id: "ESC-9.1-12", storyId: "9.1", n: 12 });
  for (const bad of ["ESC-bot-0", "ESC-bot-01", "ESC-bot", "ESC-Bot-1", "ESC-bot-9.1-1", "ESC-0.1-1", "ESC-9.1", "esc-9.1-1", "ESC-9.1-1.md"]) {
    expect(parseEscalationId(bad)).toBeNull();
  }
  expect(parseEscalation(esc("ESC-bot-3"), escalation({ trigger: "flaky" }))).toMatchObject({
    escalation: { id: { id: "ESC-bot-3", storyId: null, n: 3 }, trigger: "flaky" },
    violations: [],
  });

  // `check` and status accept a bot Escalation and its decision.
  await withRoot({ [esc("ESC-bot-3")]: escalation({ trigger: "flaky" }), [esc("ESC-bot-4")]: escalation(), [dec("ESC-bot-4")]: decision("approved") }, async (dir) => {
    expect(await runCli(["check", "--root", dir])).toMatchObject({ code: 0, stdout: "Escalations OK: 2 escalation(s) and 1 decision(s) valid.\n" });
    expect(escalationStatus("ESC-bot-3", dir)).toBe("open");
    expect(escalationStatus("ESC-bot-4", dir)).toBe("approved");
  });

  // A bot/* PR may raise ESC-bot-<n>, but no Story's Escalation.
  const bot = await runPr({ ref: "bot/quarantine-x", files: [added(esc("ESC-bot-3"))], head: { [esc("ESC-bot-3")]: escalation({ trigger: "flaky" }) } });
  expect(bot).toMatchObject({ code: 0 });
  expect(judge("bot/x", [added(esc("ESC-9.1-1"))], { [esc("ESC-9.1-1")]: escalation() })).toEqual([
    `wrong story: ${esc("ESC-9.1-1")}: bot branch bot/x may raise only ESC-bot-<n> (AD-16)`,
  ]);
  // A Story PR may not raise a bot Escalation.
  const story = await runPr({ ref: "story/9.1", files: [added(esc("ESC-bot-1"))], head: { [esc("ESC-bot-1")]: escalation() } });
  expect(story.code).toBe(1);
  expect(story.stderr).toContain(`wrong story: ${esc("ESC-bot-1")}: branch story/9.1 may raise only ESC-9.1-<n> (AD-16)`);
});

xaravelTest("XT-conformance-184", "check warns on stdout, exit 0, for each open ESC-<story-id>-<n> whose Story manifest is done (AD-16.9)", async () => {
  const ok = (escalations: number, decisions: number): string => `Escalations OK: ${escalations} escalation(s) and ${decisions} decision(s) valid.\n`;
  const warning = (id: string, storyId: string): string =>
    `warning: open escalation: ${esc(id)} has no ruling, but Story ${storyId} (${story(storyId)}) is done; it waits on the Maintainer (AD-16)`;
  const done = (storyId: string): string => manifest(storyId, [STR_IS], [], "done");

  // Open, Story done: the OK line, then the warning.
  await withRoot({ [esc("ESC-9.1-1")]: escalation(), [story("9.1")]: done("9.1") }, async (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([warning("ESC-9.1-1", "9.1")]);
    expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: `${ok(1, 0)}${warning("ESC-9.1-1", "9.1")}\n`, stderr: "" });
  });
  // Open, Story not done: only the OK line.
  for (const status of ["in-progress", "review", "blocked"]) {
    await withRoot({ [esc("ESC-9.1-1")]: escalation(), [story("9.1")]: manifest("9.1", [STR_IS], [], status) }, async (dir) => {
      expect(openEscalationWarnings(dir)).toEqual([]);
      expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: ok(1, 0), stderr: "" });
    });
  }
  // Sprint status decides "done" through sprint_key, as ownership:check does.
  const keyed = (status: string): string =>
    recordText({ story_id: "9.1", epic: 9, component: "support", status, sprint_key: "9-1-x", test_ids: [STR_IS], xaravel_test_ids: [] }, "\n# Story 9.1\n");
  const sprint = (status: string): string => `project: xaravel\ndevelopment_status:\n  9-1-x: ${status}\n`;
  await withRoot({ [esc("ESC-9.1-1")]: escalation(), [story("9.1")]: keyed("in-progress"), [SPRINT_STATUS]: sprint("done") }, async (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([warning("ESC-9.1-1", "9.1")]);
    expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: `${ok(1, 0)}${warning("ESC-9.1-1", "9.1")}\n`, stderr: "" });
  });
  await withRoot({ [esc("ESC-9.1-1")]: escalation(), [story("9.1")]: keyed("done"), [SPRINT_STATUS]: sprint("in-progress") }, async (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([]);
    expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: ok(1, 0), stderr: "" });
  });
  // Ruled (approved or rejected, bound to the current text): no warning.
  for (const ruling of ["approved", "rejected"]) {
    await withRoot({ [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision(ruling), [story("9.1")]: done("9.1") }, async (dir) => {
      expect(openEscalationWarnings(dir)).toEqual([]);
      expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: ok(1, 1), stderr: "" });
    });
  }
  // Stale decision: the Escalation counts as open, but check fails with the violation and prints no warning.
  const widened = escalation({ proposed: "Skip every SupportStrTest test as php-only." });
  await withRoot({ [esc("ESC-9.1-1")]: widened, [dec("ESC-9.1-1")]: decision("approved"), [story("9.1")]: done("9.1") }, async (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([warning("ESC-9.1-1", "9.1")]);
    const run = await runCli(["check", "--root", dir]);
    expect(run.code).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain(`stale decision: ${dec("ESC-9.1-1")}: `);
    expect(run.stderr).not.toContain("warning:");
  });
  // An invalid decision also leaves the Escalation open.
  await withRoot({ [esc("ESC-9.1-1")]: escalation(), [dec("ESC-9.1-1")]: decision("yes"), [story("9.1")]: done("9.1") }, (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([warning("ESC-9.1-1", "9.1")]);
  });
  // No manifest, or an invalid or unparseable one: no warning (ownership:check owns manifest validity).
  for (const files of [{}, { [story("9.1")]: manifest("9.1", [], [], "done") }, { [story("9.1")]: "not a manifest\n" }]) {
    await withRoot({ [esc("ESC-9.1-1")]: escalation(), ...files }, async (dir) => {
      expect(openEscalationWarnings(dir)).toEqual([]);
      expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: ok(1, 0), stderr: "" });
    });
  }
  // A bot Escalation has no Story: no warning.
  await withRoot({ [esc("ESC-bot-1")]: escalation({ trigger: "flaky" }), [story("9.1")]: done("9.1") }, async (dir) => {
    expect(openEscalationWarnings(dir)).toEqual([]);
    expect(await runCli(["check", "--root", dir])).toEqual({ code: 0, stdout: ok(1, 0), stderr: "" });
  });
  // Two warnings, sorted by file name; a ruled Escalation of a done Story between them gives none.
  await withRoot(
    {
      [esc("ESC-9.2-1")]: escalation(),
      [esc("ESC-9.1-2")]: escalation(),
      [dec("ESC-9.1-2")]: decision("approved"),
      [esc("ESC-9.1-1")]: escalation(),
      [story("9.2")]: done("9.2"),
      [story("9.1")]: done("9.1"),
    },
    async (dir) => {
      expect(openEscalationWarnings(dir)).toEqual([warning("ESC-9.1-1", "9.1"), warning("ESC-9.2-1", "9.2")]);
      expect(await runCli(["check", "--root", dir])).toEqual({
        code: 0,
        stdout: `${ok(3, 1)}${warning("ESC-9.1-1", "9.1")}\n${warning("ESC-9.2-1", "9.2")}\n`,
        stderr: "",
      });
    },
  );
  // The repository: every warning names an open Escalation of a done Story, and check still exits 0.
  const live = await runCli(["check"]);
  expect(live.code).toBe(0);
  const lines = live.stdout.trimEnd().split("\n");
  expect(lines[0]).toStartWith("Escalations OK: ");
  expect(lines.slice(1)).toEqual(openEscalationWarnings(root));
  for (const line of lines.slice(1)) {
    const id = /conformance\/escalations\/(ESC-[^ ]+)\.md/.exec(line)?.[1] ?? "";
    expect(escalationStatus(id, root)).toBe("open");
  }
});
