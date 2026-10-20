// The Story done check (Story 5.9; FR-111, FR-114, FR-115, AD-15, AD-16,
// AD-28): "done" is computed, not claimed.
//
//   bun tools/story-check/story-check.ts <story-id> [--pr <n>] [--root <dir>]
//       (`bun run story:check <story-id>`) reports PASS or FAIL for each
//       clause of the PRD §3 done definition, plus the Differential-fixture
//       clause, as
//         PASS|FAIL <clause>: <detail>
//       in this order, each failing item on its own indented line (at most 20,
//       then `  … <m> more`), and ends with
//         STORY-CHECK <story-id> pass|fail
//
// The clauses:
//   manifest       `stories/<id>.md` parses with no violation (`parseManifest`),
//                  so a manifest with no assigned tests fails;
//   tests          a full `--story` harness run (never fast): each Test ID ×
//                  Variant line of the manifest's `test_ids` (a listed `X`
//                  also takes its dataset rows `X#<key>`, as ownership's
//                  `covers` does) passes when its status is `pass` and it
//                  does not differ, or when it is a `skip` whose reason is
//                  not `not-ported-yet` and `checkLine` accepts it.
//                  `fail-known`, `quarantined`, a difference, a NOT-RUN
//                  Variant and an id with no Expectations line for itself or
//                  a row fail. With no `test_ids` the clause passes as
//                  `none assigned`;
//   xaravel-tests  every `xaravel_test_ids` entry passes in an Xaravel run
//                  filtered to those ids (`--xaravel --id …`); a skip fails;
//   fixtures       every assigned id (`test_ids` ∪ `xaravel_test_ids`, and the
//                  rows `X#<key>` of a listed `X`) that is the `id` of a
//                  committed request (tools/oracle/verify.ts's
//                  `committedRequests`), less the requests listed in
//                  `conformance/oracle/nondeterminism.jsonl`, needs
//                  `conformance/fixtures/<component>/<sha256>.json` that
//                  `verifyFixture` accepts against `oracle.pub`. A fixture whose
//                  `output.error` is not null (an evaluation error at any
//                  stage) fails too, unless the id's Inventory `oracle` map is
//                  non-empty and every outcome in it is `fail`;
//   api-surface    (Epic 6 retro S4, Maintainer ruling on item 8) the
//                  manifest's `api_surface_gate` agrees with the Story's
//                  "`api-surface:gate <c>` passes" acceptance criteria in
//                  `_bmad-output/planning-artifacts/epics.md` (ownership's
//                  `gateCriteria` and `checkApiSurfaceGates`); with no
//                  criterion and no field it passes; otherwise the gate runs
//                  (`bun --no-env-file tools/api-surface/api-surface.ts
//                  --gate --root <root> <c>`) and passes on exit 0. Exit 1
//                  fails on the unexplained items and citation problems the
//                  gate printed; any other exit, or a missing epics.md, fails
//                  as `cannot check`;
//   approvals      (ESC-8.5-1) the Story's spec (the one
//                  `_bmad-output/implementation-artifacts/spec-<a>-<b>-*.md`,
//                  `findStorySpec`) holds two `pass` Fidelity Review
//                  verdicts for the head tree (`reviewTree(root, "head")`,
//                  HEAD without `_bmad-output/`): per reviewer slot the last
//                  record for that tree counts, and reviewer 1 ran on the
//                  other CLI from the loop's or recorded why it fell back
//                  (`fidelityVerdicts`, tools/fidelity-review). It reads no
//                  GitHub review and needs no `GH_TOKEN`. No spec, two specs,
//                  a malformed record or no HEAD commit fails;
//   escalations    no `conformance/escalations/ESC-<id>-<n>.md` is `open`
//                  (`escalationStatus`);
//   full-run       the latest workflow run named `ratchet` for the PR head
//                  (`/actions/runs?head_sha=`), its job `ratchet`
//                  (`/actions/runs/<id>/jobs`): that job's `conclusion` is
//                  `success`; only then is its log read
//                  (`/actions/jobs/<id>/logs`, timestamps removed). Per
//                  ESC-5.9-2 the clause reads the `ratchet story` step: the
//                  log's last `STORY ref=` line, and the last `SUMMARY ` line
//                  between the `RATCHET ` line before it (the `run --scope`
//                  step's end) and it. That SUMMARY satisfies the harness's
//                  `isFullRun`, and the STORY verdict reads `failures=0
//                  passes=0` (warned differences never fail it; SUMMARY's
//                  `differ` is not read). `STORY ref=<r> skipped: no
//                  test_ids` passes; no STORY line, `skipped: not a Story
//                  ref`, a malformed one, or no SUMMARY in that segment fails.
// `tests` and `xaravel-tests` also fail on a run-level ERROR line, and the
// harness runs get the env without `GH_TOKEN` and `GITHUB_TOKEN`.
//
// GitHub: `GITHUB_API_URL` (default https://api.github.com), token `GH_TOKEN`,
// repository `GITHUB_REPOSITORY`, else the `origin` remote of the root; only
// `full-run` reads it (`--pr`, else the most recently updated PR whose head is
// `story/<id>`, in any state; a `--pr` whose head is not `story/<id>` fails).
// With no `GH_TOKEN`, `full-run` FAILs with `cannot check: GH_TOKEN is not
// set`; it never passes silently.
//
// Exit codes: 0 when every clause passes, 1 when any fails, 2 on a usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isFullRun, runHarness, type HarnessOptions, type HarnessResult } from "../../conformance/harness/harness";
import { escalationStatus, ESCALATIONS_DIR, parseEscalationId } from "../escalations/escalations";
import { checkLine, contextFor, type Context } from "../expectations/reasons";
import { compareUnits } from "../inventory/inventory";
import { FIXTURES_DIR, readNondeterminism, verifyFixture } from "../oracle/fixtures";
import { committedRequests, verificationKey } from "../oracle/verify";
import { checkApiSurfaceGates, coveringIds, covers, parseManifest, readGateCriteria, STORIES_DIR, type GateCriterion, type Manifest } from "../ownership/ownership";
import { readExpectations, readWorkingInventory } from "../pin-bump/pin-bump";
import { CHECKLIST_FILE, fidelityVerdicts, findStorySpec, parseChecklist, parseRecords, reviewTree, type ChecklistItem } from "../fidelity-review/fidelity-review";
import { GitHub } from "../protected-paths/protected-paths";

export const CLAUSES = ["manifest", "tests", "xaravel-tests", "fixtures", "api-surface", "approvals", "escalations", "full-run"] as const;
export type Clause = (typeof CLAUSES)[number];

/** The most failing items a clause prints. */
export const MAX_ITEMS = 20;
const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;
const NO_TOKEN = "cannot check: GH_TOKEN is not set";

export interface ClauseResult {
  readonly clause: Clause;
  readonly pass: boolean;
  readonly detail: string;
  /** The failing items, one per line. */
  readonly items: readonly string[];
}

function pass(clause: Clause, detail: string): ClauseResult {
  return { clause, pass: true, detail, items: [] };
}

function fail(clause: Clause, detail: string, items: readonly string[] = []): ClauseResult {
  return { clause, pass: false, detail, items };
}

/** The lines of one clause: `PASS|FAIL <clause>: <detail>`, then at most `MAX_ITEMS` indented items and `  … <m> more`. */
export function renderClause(result: ClauseResult): string[] {
  const lines = [`${result.pass ? "PASS" : "FAIL"} ${result.clause}: ${result.detail}`];
  lines.push(...result.items.slice(0, MAX_ITEMS).map((item) => `  ${item}`));
  if (result.items.length > MAX_ITEMS) {
    lines.push(`  … ${result.items.length - MAX_ITEMS} more`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Clauses (pure: everything they read is passed in)

/** `manifest`: the manifest parses with no violation; `text` is null when the file does not exist. */
export function manifestClause(file: string, text: string | null): { result: ClauseResult; manifest: Manifest | null } {
  if (text === null) {
    return { result: fail("manifest", `${file} does not exist`), manifest: null };
  }
  const parsed = parseManifest(file, text);
  if (parsed.manifest === null) {
    return { result: fail("manifest", `${file} is invalid`, parsed.violations), manifest: null };
  }
  const { testIds, xaravelTestIds } = parsed.manifest;
  return { result: pass("manifest", `${file}: ${testIds.length} test_ids, ${xaravelTestIds.length} xaravel_test_ids`), manifest: parsed.manifest };
}

/** One Expectations line of an assigned id, with where it is. */
export interface AssignedLine {
  readonly line: Record<string, unknown>;
  /** `<shard>:<line>`. */
  readonly at: string;
}

function harnessRan(run: HarnessResult): boolean {
  return run.out.some((line) => line.startsWith("SUMMARY "));
}

function harnessFailure(run: HarnessResult): string {
  const last = run.err.filter((line) => line.startsWith("harness")).at(-1);
  return `the harness did not run${last === undefined ? "" : `: ${last}`}`;
}

/**
 * `tests`: `run` is the full `--story` harness run, `lines` the Expectations lines of `testIds` and of their rows
 * `X#<key>` (any Variant), and `context` the Skip Reason rules' context.
 */
export function testsClause(testIds: readonly string[], run: HarnessResult | null, lines: readonly AssignedLine[], context: Context | null): ClauseResult {
  if (testIds.length === 0) {
    return pass("tests", "none assigned");
  }
  if (run === null || !harnessRan(run)) {
    return fail("tests", run === null ? "the harness did not run" : harnessFailure(run));
  }
  if (run.sample !== null) {
    return fail("tests", "the harness run was a fast run; the done check needs a full run");
  }
  const results = new Map<string, HarnessResult["results"][number]>(run.results.map((result) => [`${result.id}\n${result.variant}`, result]));
  const differing = new Map<string, string>();
  for (const difference of run.differences) {
    differing.set(`${difference.id}\n${difference.variant}`, difference.text);
  }
  const items: string[] = [];
  const listed = new Set(testIds);
  /** The listed ids that have a line: the id itself, or a row `X#<key>` of a listed `X` (ownership's `covers`). */
  const withLine = new Set<string>();
  let total = 0;
  for (const { line, at } of lines) {
    const id = String(line["id"]);
    const variant = String(line["variant"]);
    const status = String(line["status"]);
    const reason = typeof line["reason"] === "string" ? line["reason"] : null;
    for (const covering of coveringIds(listed, id)) {
      withLine.add(covering);
    }
    total++;
    const key = `${id}\n${variant}`;
    const result = results.get(key);
    const label = `${id} [${variant}]`;
    if (result === undefined) {
      items.push(`${label}: NOT-RUN`);
      continue;
    }
    const difference = differing.get(key);
    if (difference !== undefined) {
      items.push(`${label}: differs: ${difference}`);
      continue;
    }
    if (status === "pass") {
      if (result.outcome !== "pass") {
        items.push(`${label}: expected pass, actual ${result.outcome}`);
      }
      continue;
    }
    if (status === "skip") {
      if (reason === "not-ported-yet") {
        items.push(`${label}: skip:not-ported-yet never satisfies done`);
        continue;
      }
      const problem = context === null ? "the Skip Reason context is unreadable" : checkLine(context, line, at);
      if (problem !== null) {
        items.push(`${label}: ${problem}`);
      }
      continue;
    }
    items.push(`${label}: ${status} is not done`);
  }
  for (const id of testIds) {
    if (!withLine.has(id)) {
      items.push(`${id}: no Expectations line`);
    }
  }
  // A run-level difference (an ERROR line or a CI NOT-RUN, id `-`) fails the clause however the lines came out.
  for (const difference of run.differences) {
    if (difference.id === "-") {
      items.push(difference.text);
    }
  }
  return items.length === 0 ? pass("tests", `${total} Test ID × Variant line(s) done`) : fail("tests", `${items.length} problem(s) over ${total} Test ID × Variant line(s)`, items);
}

/** `xaravel-tests`: `run` is the Xaravel run filtered to `ids`. */
export function xaravelClause(ids: readonly string[], run: HarnessResult | null): ClauseResult {
  if (ids.length === 0) {
    return pass("xaravel-tests", "none assigned");
  }
  if (run === null || !harnessRan(run) || run.xaravel === null) {
    return fail("xaravel-tests", run === null ? "the harness did not run" : harnessFailure(run));
  }
  const outcomes = new Map(run.xaravel.results.map((result) => [result.id, result.outcome] as const));
  const items = ids.filter((id) => outcomes.get(id) !== "pass").map((id) => `${id}: ${outcomes.get(id) ?? "missing"}`);
  const errors = run.xaravel.lines.filter((line) => line.startsWith("ERROR [xaravel]"));
  if (errors.length > 0) {
    return fail("xaravel-tests", `the Xaravel run crashed${items.length === 0 ? "" : `, and ${items.length} of ${ids.length} Xaravel Test(s) do not pass`}`, [...errors, ...items]);
  }
  return items.length === 0 ? pass("xaravel-tests", `${ids.length} Xaravel Test(s) pass`) : fail("xaravel-tests", `${items.length} of ${ids.length} Xaravel Test(s) do not pass`, items);
}

/** What the `fixtures` clause reads. */
export interface FixturesInput {
  /** `test_ids` ∪ `xaravel_test_ids`. */
  readonly assigned: readonly string[];
  /** Every committed request by `sha256`: its id and Component. */
  readonly requests: ReadonlyMap<string, { readonly id: string; readonly component: string }>;
  /** The `sha256`s listed in `conformance/oracle/nondeterminism.jsonl`. */
  readonly listed: ReadonlySet<string>;
  /** The text of `conformance/fixtures/<component>/<sha256>.json`, or null when it does not exist. */
  readonly fixture: (component: string, sha256: string) => string | null;
  /** The verification key's PEM, or the reason there is none. */
  readonly key: { readonly pem: string } | { readonly error: string };
  /** Inventory `oracle` maps by id. */
  readonly oracle: ReadonlyMap<string, Readonly<Record<string, string>>>;
}

/** `fixtures`: every assigned Differential request has a verified fixture that is not an unexpected error. */
export function fixturesClause(input: FixturesInput): ClauseResult {
  const assigned = new Set(input.assigned);
  const due = [...input.requests]
    .filter(([sha256, request]) => covers(assigned, request.id) && !input.listed.has(sha256))
    .sort(([a, x], [b, y]) => compareUnits(x.id, y.id) || compareUnits(a, b));
  if (due.length === 0) {
    return pass("fixtures", "no assigned Differential Test ID");
  }
  if ("error" in input.key) {
    return fail("fixtures", `cannot verify ${due.length} fixture(s): ${input.key.error}`);
  }
  const items: string[] = [];
  for (const [sha256, { id, component }] of due) {
    const path = `${FIXTURES_DIR}/${component}/${sha256}.json`;
    const text = input.fixture(component, sha256);
    if (text === null) {
      items.push(`${id} ${sha256}: no fixture ${path}`);
      continue;
    }
    const problems = verifyFixture(text, input.key.pem, sha256);
    if (problems.length > 0) {
      items.push(`${id} ${sha256}: ${path} does not verify: ${problems.join("; ")}`);
      continue;
    }
    const error = (JSON.parse(text) as { output?: { error?: { stage?: unknown } | null } }).output?.error;
    if (error !== null && error !== undefined) {
      // An evaluation error is Upstream's expected outcome only when every Inventory outcome of the id is `fail`.
      const outcomes = Object.values(input.oracle.get(id) ?? {});
      if (outcomes.length === 0 || outcomes.some((outcome) => outcome !== "fail")) {
        items.push(`${id} ${sha256}: ${path} is a ${typeof error.stage === "string" ? error.stage : "unknown-stage"} error, which Upstream's outcome does not expect`);
      }
    }
  }
  return items.length === 0 ? pass("fixtures", `${due.length} fixture(s) verified`) : fail("fixtures", `${items.length} of ${due.length} assigned request(s) lack a verified fixture`, items);
}

/** How one `api-surface:gate <c>` subprocess ended: its exit code and output, or the error that kept it from running. */
export type GateRun = { readonly code: number | null; readonly stdout: string; readonly stderr: string } | { readonly error: string };

/** Runs `api-surface:gate <component>` against `root`. */
export type ApiSurfaceGate = (root: string, component: string, env: Readonly<Record<string, string | undefined>>) => GateRun;

const GATE_COUNT = /^api-surface:gate (?:[a-z][a-z0-9-]*: \d+ unexplained|citations: \d+ problem\(s\)) \(AD-15\)$/;

function lines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

/**
 * `api-surface` (Epic 6 retro S4, Maintainer ruling on item 8): the manifest's `api_surface_gate` agrees with the
 * Story's "`api-surface:gate <c>` passes" acceptance criteria in `epics.md` (`criteria`, every criterion of the file),
 * and, when there is one, `gate` (asked only then) passes for `<c>`. Exit 1 with the gate's count line fails on the
 * unexplained items and citation problems it printed; any other exit, or no count line, fails as `cannot check`.
 */
export function apiSurfaceClause(manifest: Manifest, criteria: readonly GateCriterion[], gate: (component: string) => GateRun): ClauseResult {
  const own = criteria.filter((criterion) => criterion.storyId === manifest.storyId);
  const { violations } = checkApiSurfaceGates([manifest], own);
  if (violations.length > 0) {
    return fail("api-surface", `${manifest.file} does not match its api-surface:gate acceptance criteria`, violations);
  }
  const component = manifest.apiSurfaceGate;
  if (component === null) {
    return pass("api-surface", "no api-surface:gate acceptance criterion");
  }
  const run = gate(component);
  if ("error" in run) {
    return fail("api-surface", `cannot check: api-surface:gate ${component}: ${run.error}`);
  }
  const out = lines(run.stdout);
  const countLine = out.find((line) => line.startsWith(`api-surface:gate ${component}: `) && GATE_COUNT.test(line));
  const detail = (line: string): string => line.replace(/ \(AD-15\)$/, "");
  if (run.code === 0 && countLine !== undefined) {
    return pass("api-surface", detail(countLine));
  }
  // Exit 1 is a verdict only when the gate counted something: a non-zero count or a citations line. Otherwise the
  // tool failed after printing its counts (e.g. `checkCitations` threw), so it cannot check.
  const verdict = countLine !== undefined && (!countLine.startsWith(`api-surface:gate ${component}: 0 unexplained`) || out.some((line) => line.startsWith("api-surface:gate citations: ") && GATE_COUNT.test(line)));
  if (run.code === 1 && verdict) {
    const counts = out.filter((line) => GATE_COUNT.test(line)).map(detail);
    return fail("api-surface", counts.join("; "), [...out.filter((line) => !GATE_COUNT.test(line)), ...lines(run.stderr)]);
  }
  return fail("api-surface", `cannot check: api-surface:gate ${component} exited ${run.code ?? "on a signal"}`, lines(run.stderr));
}

/** The API-surface tool beside this one. */
const API_SURFACE_TOOL = resolve(import.meta.dir, "..", "api-surface", "api-surface.ts");

/** The default gate: `bun --no-env-file tools/api-surface/api-surface.ts --gate --root <root> <component>`, from `root`. */
export const runApiSurfaceGate: ApiSurfaceGate = (root, component, env) => {
  try {
    const proc = Bun.spawnSync([process.execPath, "--no-env-file", API_SURFACE_TOOL, "--gate", "--root", root, component], {
      cwd: root,
      env: { ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * `approvals` (ESC-8.5-1): two `pass` Fidelity Review verdicts recorded in the Story's spec for the head tree (HEAD
 * without `_bmad-output/`), counted by `fidelityVerdicts`.
 */
export function approvalsClause(root: string, storyId: string): ClauseResult {
  let spec: string;
  try {
    spec = findStorySpec(root, storyId);
  } catch (error) {
    return fail("approvals", `cannot check: ${error instanceof Error ? error.message : String(error)}`);
  }
  let tree: string;
  try {
    tree = reviewTree(root, "head");
  } catch (error) {
    return fail("approvals", `cannot check: no head tree: ${error instanceof Error ? error.message : String(error)}`);
  }
  let checklist: ChecklistItem[];
  try {
    checklist = parseChecklist(readFileSync(join(root, CHECKLIST_FILE), "utf8"));
  } catch (error) {
    return fail("approvals", `cannot check: ${error instanceof Error ? error.message : String(error)}`);
  }
  const count = fidelityVerdicts(parseRecords(readFileSync(spec, "utf8")), tree, checklist);
  return count.pass ? pass("approvals", count.detail) : fail("approvals", count.detail, count.items);
}

/** `escalations`: each Story Escalation's status, or the error reading it. */
export function escalationsClause(statuses: readonly { readonly id: string; readonly status: string }[]): ClauseResult {
  const items = statuses.filter((entry) => entry.status !== "approved" && entry.status !== "rejected").map((entry) => `${entry.id}: ${entry.status}`);
  if (statuses.length === 0) {
    return pass("escalations", "no Escalations");
  }
  return items.length === 0 ? pass("escalations", `${statuses.length} Escalation(s), none open`) : fail("escalations", `${items.length} of ${statuses.length} Escalation(s) open`, items);
}

/** A job log's lines, each with its leading timestamp and trailing carriage return removed. */
function logLines(log: string): string[] {
  return log.split("\n").map((raw) => raw.replace(/\r$/, "").replace(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z /, ""));
}

/** The last `SUMMARY ` line of a job log, with each line's leading timestamp removed; null when there is none. */
export function lastSummary(log: string): string | null {
  let found: string | null = null;
  for (const line of logLines(log)) {
    if (line.startsWith("SUMMARY ")) {
      found = line;
    }
  }
  return found;
}

const STORY_VERDICT = /^STORY ref=\S+ failures=(\d+) passes=(\d+) warnings=(\d+)$/;
const STORY_NO_TEST_IDS = /^STORY ref=\S+ skipped: no test_ids$/;

/**
 * `full-run` (ESC-5.9-2): the ratchet job concluded `success`, and the `ratchet story` step's verdict passes. That step
 * is the log's last `STORY ref=` line; its SUMMARY is the last one after the preceding `RATCHET ` line (the `run --scope`
 * step's end) and before it, and must be a full run's. The verdict passes on `failures=0 passes=0` (warnings never fail
 * it), or on `skipped: no test_ids`; anything else fails closed.
 */
export function fullRunClause(where: string, conclusion: string | null, log: string): ClauseResult {
  if (conclusion === null) {
    return fail("full-run", `${where}: the ratchet job has not finished`);
  }
  if (conclusion !== "success") {
    return fail("full-run", `${where}: the ratchet job concluded ${conclusion}, not success`);
  }
  const lines = logLines(log);
  let storyAt = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.startsWith("STORY ref=")) {
      storyAt = i;
      break;
    }
  }
  if (storyAt === -1) {
    return fail("full-run", `${where}: the log has no STORY line from the ratchet story step`);
  }
  const story = lines[storyAt]!;
  if (STORY_NO_TEST_IDS.test(story)) {
    return pass("full-run", `${where}: ${story}`);
  }
  const verdict = STORY_VERDICT.exec(story);
  if (verdict === null) {
    return fail("full-run", `${where}: ${story} is not a Story verdict`);
  }
  let summary: string | null = null;
  for (let i = storyAt - 1; i >= 0 && !lines[i]!.startsWith("RATCHET "); i--) {
    if (lines[i]!.startsWith("SUMMARY ")) {
      summary = lines[i]!;
      break;
    }
  }
  if (summary === null) {
    return fail("full-run", `${where}: the ratchet story step printed no SUMMARY line`);
  }
  if (!isFullRun(summary)) {
    return fail("full-run", `${where}: ${summary} was a fast run`);
  }
  return verdict[1] === "0" && verdict[2] === "0" ? pass("full-run", `${where}: ${summary}; ${story}`) : fail("full-run", `${where}: ${story} failed`);
}

// ---------------------------------------------------------------------------
// GitHub

interface PullRequest {
  readonly number: number;
  readonly updated_at: string;
  readonly user: { readonly login: string } | null;
  readonly head: { readonly sha: string; readonly ref: string };
}

interface WorkflowRun {
  readonly id: number;
  readonly name: string | null;
  readonly created_at: string;
}

interface Job {
  readonly id: number;
  readonly name: string;
  /** null (or absent) while the job has not finished. */
  readonly conclusion?: string | null;
}

/** `owner/name` of a GitHub remote URL, or null. */
export function repoFromRemote(url: string): string | null {
  const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`;
}

function repository(root: string, env: Readonly<Record<string, string | undefined>>): string | null {
  const fromEnv = env["GITHUB_REPOSITORY"];
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  const remote = Bun.spawnSync(["git", "-C", root, "remote", "get-url", "origin"], { stdout: "pipe", stderr: "ignore" });
  return remote.exitCode === 0 ? repoFromRemote(remote.stdout.toString()) : null;
}

async function findPr(github: GitHub, repo: string, storyId: string, prNumber: number | null): Promise<PullRequest | null> {
  if (prNumber !== null) {
    return github.json<PullRequest>(`/pulls/${prNumber}`);
  }
  const owner = repo.split("/")[0]!;
  const pulls = await github.json<PullRequest[]>(`/pulls?state=all&head=${encodeURIComponent(`${owner}:story/${storyId}`)}&sort=updated&direction=desc&per_page=100`);
  const mine = pulls.filter((pull) => pull.head.ref === `story/${storyId}`).sort((a, b) => compareUnits(b.updated_at, a.updated_at));
  return mine[0] ?? null;
}

async function fullRunCheck(storyId: string, prNumber: number | null, root: string, env: Readonly<Record<string, string | undefined>>): Promise<ClauseResult> {
  const token = env["GH_TOKEN"];
  if (token === undefined || token === "") {
    return fail("full-run", NO_TOKEN);
  }
  const repo = repository(root, env);
  if (repo === null) {
    return fail("full-run", "cannot check: GITHUB_REPOSITORY is not set and the origin remote is not a GitHub repository");
  }
  const api = (env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  const github = new GitHub(api, repo, token);
  try {
    const pr = await findPr(github, repo, storyId, prNumber);
    if (pr === null) {
      return fail("full-run", `no pull request in ${repo} has head story/${storyId}`);
    }
    if (pr.head.ref !== `story/${storyId}`) {
      return fail("full-run", `PR #${pr.number}'s head is ${pr.head.ref}, not story/${storyId}`);
    }
    const sha = pr.head.sha;
    const runs = (await github.json<{ workflow_runs: WorkflowRun[] }>(`/actions/runs?head_sha=${sha}&per_page=100`)).workflow_runs;
    const ratchet = runs.filter((run) => run.name === "ratchet").sort((a, b) => compareUnits(b.created_at, a.created_at) || b.id - a.id)[0];
    if (ratchet === undefined) {
      return fail("full-run", `PR #${pr.number}: no ratchet workflow run for ${sha}`);
    }
    const jobs = (await github.json<{ jobs: Job[] }>(`/actions/runs/${ratchet.id}/jobs?per_page=100`)).jobs;
    const job = jobs.find((entry) => entry.name === "ratchet");
    return job === undefined ? fail("full-run", `PR #${pr.number}: ratchet run ${ratchet.id} has no ratchet job`) : fullRunClause(`PR #${pr.number} ratchet run ${ratchet.id}`, job.conclusion ?? null, job.conclusion === "success" ? await github.text(`/actions/jobs/${job.id}/logs`) : "");
  } catch (error) {
    return fail("full-run", `cannot check: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// CLI

type Harness = (root: string, options: HarnessOptions) => Promise<HarnessResult>;

export interface StoryCheckOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** The harness (tests may wrap it); default `runHarness`. */
  readonly harness?: Harness;
  /** The `api-surface:gate` runner (tests may replace it); default `runApiSurfaceGate`. */
  readonly apiSurfaceGate?: ApiSurfaceGate;
}

export interface StoryCheckResult {
  readonly code: 0 | 1 | 2;
  readonly out: string[];
  readonly err: string[];
  readonly clauses: ClauseResult[];
}

const USAGE = "Usage: bun tools/story-check/story-check.ts <story-id> [--pr <n>] [--root <dir>]";

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): { storyId: string; pr: number | null; root: string } {
  let root = resolve(import.meta.dir, "..", "..");
  let storyId: string | null = null;
  let pr: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--pr" || arg === "--root") {
      const value = argv[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        throw new UsageError(`${arg} needs a value`);
      }
      if (arg === "--root") {
        root = resolve(value);
      } else {
        if (!/^[1-9]\d*$/.test(value)) {
          throw new UsageError(`--pr must be a pull request number, got ${JSON.stringify(value)}`);
        }
        pr = Number(value);
      }
    } else if (arg.startsWith("--") || storyId !== null) {
      throw new UsageError(`Unknown argument: ${arg}`);
    } else {
      if (!STORY_ID.test(arg)) {
        throw new UsageError(`the Story ID must be of the form <epic>.<story>, got ${JSON.stringify(arg)}`);
      }
      storyId = arg;
    }
  }
  if (storyId === null) {
    throw new UsageError("a Story ID is required");
  }
  return { storyId, pr, root };
}

/** The Expectations lines of `ids` (a listed `X` also takes its rows `X#<key>`), with their `<shard>:<line>`. */
function assignedLines(root: string, ids: readonly string[]): AssignedLine[] {
  const wanted = new Set(ids);
  const out: AssignedLine[] = [];
  for (const shard of readExpectations(root)) {
    shard.lines.forEach((line, index) => {
      if (covers(wanted, String(line["id"]))) {
        out.push({ line, at: `${shard.path}:${index + 1}` });
      }
    });
  }
  return out;
}

function fixturesInput(root: string, assigned: readonly string[]): FixturesInput {
  const committed = committedRequests(root);
  let key: FixturesInput["key"];
  try {
    key = { pem: verificationKey(root).export({ type: "spki", format: "pem" }).toString() };
  } catch (error) {
    key = { error: error instanceof Error ? error.message : String(error) };
  }
  const oracle = new Map<string, Readonly<Record<string, string>>>();
  for (const entry of readWorkingInventory(root)) {
    oracle.set(entry.id, entry.oracle);
  }
  return {
    assigned,
    requests: committed.requests,
    listed: new Set(readNondeterminism(root).map((entry) => entry.sha256)),
    fixture: (component, sha256) => {
      const path = join(root, FIXTURES_DIR, component, `${sha256}.json`);
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    },
    key,
    oracle,
  };
}

function escalationStatuses(root: string, storyId: string): { id: string; status: string }[] {
  const dir = join(root, ESCALATIONS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  const out: { id: string; status: string }[] = [];
  for (const name of readdirSync(dir).sort(compareUnits)) {
    const id = name.endsWith(".md") ? name.slice(0, -".md".length) : null;
    if (id === null || parseEscalationId(id)?.storyId !== storyId) {
      continue;
    }
    try {
      out.push({ id, status: escalationStatus(id, root) });
    } catch (error) {
      out.push({ id, status: `unreadable: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return out;
}

/** Runs every clause for the CLI arguments `argv` (see the header). */
export async function runStoryCheck(argv: readonly string[], options: StoryCheckOptions = {}): Promise<StoryCheckResult> {
  let args: { storyId: string; pr: number | null; root: string };
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      return { code: 2, out: [], err: [error.message, USAGE], clauses: [] };
    }
    throw error;
  }
  const { storyId, root } = args;
  const env = options.env ?? process.env;
  const harness = options.harness ?? runHarness;
  // The tests the harness runs never see a GitHub token.
  const harnessEnv: Record<string, string | undefined> = { ...env };
  delete harnessEnv["GH_TOKEN"];
  delete harnessEnv["GITHUB_TOKEN"];
  const err: string[] = [];
  const clauses: ClauseResult[] = [];
  const guard = (clause: Clause, run: () => ClauseResult): ClauseResult => {
    try {
      return run();
    } catch (error) {
      return fail(clause, `cannot check: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const file = `${STORIES_DIR}/${storyId}.md`;
  const path = join(root, file);
  const { result: manifestResult, manifest } = manifestClause(file, existsSync(path) ? readFileSync(path, "utf8") : null);
  clauses.push(manifestResult);
  const noManifest = (clause: Clause): ClauseResult => fail(clause, `cannot check: ${file} is missing or invalid`);

  if (manifest === null) {
    clauses.push(noManifest("tests"), noManifest("xaravel-tests"), noManifest("fixtures"), noManifest("api-surface"));
  } else {
    let storyRun: HarnessResult | null = null;
    if (manifest.testIds.length > 0) {
      storyRun = await harness(root, { env: harnessEnv, story: storyId });
      err.push(...storyRun.err);
    }
    clauses.push(
      guard("tests", () => {
        const violations: string[] = [];
        const context = manifest.testIds.length === 0 ? null : contextFor(root, violations);
        return testsClause(manifest.testIds, storyRun, manifest.testIds.length === 0 ? [] : assignedLines(root, manifest.testIds), violations.length === 0 ? context : null);
      }),
    );
    let xaravelRun: HarnessResult | null = null;
    if (manifest.xaravelTestIds.length > 0) {
      xaravelRun = await harness(root, { env: harnessEnv, xaravel: { only: true, ids: manifest.xaravelTestIds } });
      err.push(...xaravelRun.err);
    }
    clauses.push(xaravelClause(manifest.xaravelTestIds, xaravelRun));
    clauses.push(guard("fixtures", () => fixturesClause(fixturesInput(root, [...manifest.testIds, ...manifest.xaravelTestIds]))));
    const gate = options.apiSurfaceGate ?? runApiSurfaceGate;
    clauses.push(guard("api-surface", () => apiSurfaceClause(manifest, readGateCriteria(root), (component) => gate(root, component, harnessEnv))));
  }
  clauses.push(guard("approvals", () => approvalsClause(root, storyId)));
  clauses.push(guard("escalations", () => escalationsClause(escalationStatuses(root, storyId))));
  clauses.push(await fullRunCheck(storyId, args.pr, root, env));

  const ok = clauses.every((clause) => clause.pass);
  const out = [...clauses.flatMap(renderClause), `STORY-CHECK ${storyId} ${ok ? "pass" : "fail"}`];
  return { code: ok ? 0 : 1, out, err, clauses };
}

if (import.meta.main) {
  const result = await runStoryCheck(process.argv.slice(2));
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  process.exit(result.code);
}
