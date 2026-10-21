// The edit-ownership check (Story 1.5, AD-16, AD-21).
//
//   bun tools/ownership/ownership.ts manifests [--root <dir>]
//       validates every `stories/*.md` manifest and fails when two open Stories
//       list the same Test ID. When the root has
//       `_bmad-output/implementation-artifacts/sprint-status.yaml`, it is the
//       authority for whether a Story is open: a manifest with a `sprint_key`
//       takes its status from `development_status[<sprint_key>]`. Without that
//       file, or without a `sprint_key`, the manifest's own `status` is used.
//       It also cross-checks the optional `api_surface_gate: <c>` field
//       against `_bmad-output/planning-artifacts/epics.md` (Epic 6 retro S4,
//       Maintainer ruling on item 8; `checkApiSurfaceGates`): a Story whose
//       acceptance criteria under its `### Story X.Y:` heading say
//       "`api-surface:gate <c>` passes" carries the field naming `<c>`, and
//       no other Story carries it. Such a criterion whose Story has no
//       manifest yet prints a `note:` line on stderr and is not a violation.
//       `story:check` reuses the parser and runs the gate.
//
//   bun tools/ownership/ownership.ts pr --repo <owner/name> --pr <n> [--root <dir>]
//       reads the PR's head branch and files from the GitHub API
//       (`GITHUB_API_URL`, default https://api.github.com; token from
//       `GH_TOKEN`) as data, and judges a `story/<id>` PR against the manifest
//       in the root (the base checkout), never the PR's copy. A Story in
//       Phase 1 or later also passes the Phase 1 gate (./phase-gate.ts)
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Every violation kind the check reports, one line each, on stderr:
//
//   invalid manifest:    a manifest field is missing or malformed, naming the
//                        file and field
//   duplicate test id:   a Test ID listed by two or more open Stories (naming
//                        each), or twice inside one manifest
//   api-surface gate:    a manifest lacks the `api_surface_gate` its Story's
//                        `api-surface:gate <c>` passes criterion needs, names
//                        another component, or carries one with no such
//                        criterion; a Story has criteria for two components;
//                        a criterion is under no Story heading; or epics.md
//                        is missing or unreadable (fail closed)
//   unknown sprint key:  a manifest's `sprint_key` is not in sprint status's
//                        `development_status`
//   invalid sprint status: sprint status is unreadable, not YAML, not a
//                        mapping, has no `development_status` mapping, or maps
//                        a manifest's `sprint_key` to a value outside the
//                        Story statuses; the check fails closed
//   missing manifest:    a `story/<id>` branch has no `stories/<id>.md` on base
//   out of scope:        a PR file (or a renamed file's previous name) outside
//                        the Story's allowed paths
//   planning scope:      a `planning/*` PR file (or a renamed file's previous
//                        name) under `packages/` or `conformance/expectations/`
//                        (in any letter case), or with an empty, `.` or `..`
//                        segment
//   bot scope:           a `bot/*` PR file (or a renamed file's previous name)
//                        outside the paths a bot branch may change, matched
//                        case-sensitively, or with an empty, `.` or `..`
//                        segment
//   bot identity:        a `bot/*` PR not opened by the `xaravel-bot` App
//                        (`user` `{type: "Bot", login: BOT_LOGIN}`) (Story 5.8)
//   bot value:           a `bot/*` PR changes more than an Expectations line's
//                        status triple (`botValueProblems`, below) (Story 5.8)
//   truncated file list: the API returned fewer files than the PR's
//                        `changed_files`; the check fails closed
//   unowned expectation: a `story/<id>` PR changes an Expectations line whose
//                        Test ID its base manifest's `test_ids` do not list
//                        (Story 5.6)
//   unowned ported test: a `story/<id>` PR changes a `portedTest` block whose
//                        Test ID its `test_ids` do not list (Story 5.6)
//   unresolved ported test id: a changed Ported Test file has a `portedTest`
//                        whose id cannot be resolved statically; fails closed
//   pass demoted:        a PR (any branch but `bot/*`) moves an Expectations
//                        entry from `pass` to another status, or removes it,
//                        with no approved Escalation listing that Test ID
//   unreadable content:  a changed file could not be read at the merge base or
//                        the head commit; fails closed
//   unparsable expectation: a changed shard has a line that is not an
//                        Expectations line; fails closed
//   unparsable ported test file: a changed Ported Test file does not lex or
//                        its brackets do not balance; fails closed
//   phase gate:          a `story/<id>` PR whose base manifest's `epic` is in
//                        Phase 1 or later (above `PHASE_0_LAST_EPIC`, 8), while
//                        the base checkout lacks one of FR-8's inputs: naming
//                        the Story, its epic, the input and its problem, and
//                        ending `(FR-8, Story 8.8)` (Story 8.8)
//
// The Phase 1 gate (Story 8.8, FR-8; ./phase-gate.ts). Only `pr` (the CLI path, not
// the synchronous `evaluatePr`) runs it: it re-reads the base manifest's
// `epic` and checks a Phase 1 or later Story against the base checkout,
// never the PR head: it
// needs `PORTING.md` passing `checkPorting`, `decisions/DIV-1.md`..`DIV-12.md`,
// `docs/porting/pilot-report.md` (not blank) and a Maintainer-signed
// `decisions/PHASE-0-EXIT.md` (`decision: approved`, `decided_by: Maintainer`,
// `date: YYYY-MM-DD`, a body line that is not a heading). Every unmet
// condition is one line. The gate has no state: it passes for every later PR
// while `main` keeps those files. `PORTING.md` and `decisions/` are
// Protected, and the required `check` job's `porting:check` and
// `divergence:check` keep them valid; the pilot report is not Protected, so
// removing or blanking it re-closes the gate for later Phase 1 PRs.
// `planning/*`, `bot/*`, other branches and Phase 0 Stories are never gated.
// `checkPorting` is loaded with a dynamic `import()` only then, so the tools
// that import this file never need `oxc-parser`.
//
// Line rules (Story 5.6, AD-16). They diff the PR head against its merge base
// (the compare API's `merge_base_commit`), over the changed files and, for a
// rename, its previous name:
//   - Expectations lines of `conformance/expectations/**/*.jsonl`, keyed by
//     `(id, variant)` across all changed shards combined, so a line moved
//     between shards unchanged is not a change. A key whose lines differ,
//     appear or disappear is changed. On `story/<id>` branches each changed
//     key's id must be owned: `test_ids` lists it, or lists `X` for a dataset
//     row `X#<key>`.
//   - `portedTest` blocks of `packages/*/tests/ported/**/*.test.ts`
//     (./ported-blocks.ts), keyed by id across all changed files combined. On
//     `story/<id>` branches each changed block's id `X` must be owned:
//     `test_ids` lists `X` or a row `X#<key>`. Any `portedTest` whose id is
//     not a string literal or a template of top-level string constants fails.
//   - Pass demotion, on every branch except `bot/*` (the bot value rule below
//     bounds what a bot may change; `planning/*` rejects every Expectations
//     change already): a key whose base lines include `pass` and whose head lines do
//     not (another status, or removed) needs an approved Escalation listing
//     its id (or `X` for a row `X#<key>`): an
//     `conformance/escalations/ESC-<id>.md` on base, or in the PR head when
//     the PR changes it, whose `decisions/ESC-<id>.md` on base is `approved`
//     and bound to that exact text (`escalation_sha256`).
// Content is read only for those files; anything unreadable, unparsable or
// unbalanced is a violation, never a pass.
//
// Allowed paths for `story/<id>` with `component: <c>`: `packages/<c>/**`,
// `conformance/expectations/<c>/**`, `conformance/oracle-requests/<id>.jsonl`
// and `conformance/escalations/ESC-<id>-<n>.md`, plus the signed fixtures the
// Oracle workflow commits to the Story branch for its requests (Story 3.4,
// spine "New inputs"): `conformance/fixtures/<c>/<64 hex>.json`. Those are
// protected by signature, not by path (`bun run oracle:verify-fixtures`).
//
// Non-Story branches (AD-16 as amended by MAINT-2026-10-17 item 15):
//   - `planning/*` may change anything except `packages/**` and
//     `conformance/expectations/**`, which change only through `story/*`
//     branches. The forbidden prefixes match in any letter case, as the
//     protected-paths check matches inclusions.
//   - `bot/*` may change only `conformance/expectations/**` and
//     `conformance/escalations/ESC-bot-<n>.md`. This is the path-level half of
//     AD-16's Expectations-`status`-only rule. Unlike the planning rule, this
//     allowlist matches case-sensitively, and it also rejects any path with an
//     empty, `.` or `..` segment. Then (Story 5.8):
//       - identity: the PR's author must be the `xaravel-bot` App, `user`
//         `{type: "Bot", login: "xaravel-bot[bot]"}` (`BOT_LOGIN`);
//       - values (`botValueProblems`): over the changed `.jsonl` shards, read
//         at the merge base and the head, a bot changes only a line's status
//         triple (`status`, `reason`, `escalation`). No shard is added,
//         removed or renamed; each shard keeps its keys in order; `id`,
//         `variant`, `adapted` and any other field stay; a changed line's
//         status is `pass` or `quarantined` with `reason` null; under `pass`
//         its `escalation` is unchanged, under `quarantined` it is an
//         `ESC-bot-<n>` whose file the PR adds, and only a `pass` or
//         `fail-known` line becomes `quarantined`. Any other changed file
//         under `conformance/expectations/` is a violation, and so is an
//         `ESC-bot-<n>.md` the PR modifies, removes or renames (it may only
//         add one).
//   - Any other branch passes.
// Both rules check a renamed file's previous name and fail closed on a
// truncated file list.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decisionStatus, DECISIONS_DIR, ESCALATIONS_DIR, parseEscalation } from "../escalations/escalations";
import { GitHub, type PrFile } from "../protected-paths/protected-paths";
import { PHASE_0_LAST_EPIC, phaseGateViolations } from "./phase-gate";
import { scanPortedBlocks } from "./ported-blocks";

export const STORIES_DIR = "stories";

/** Repo-relative path of sprint status, the authority for whether a Story is open. */
export const SPRINT_STATUS = "_bmad-output/implementation-artifacts/sprint-status.yaml";

/** Repo-relative path of the epics file, whose acceptance criteria say which Stories pass `api-surface:gate <c>`. */
export const EPICS = "_bmad-output/planning-artifacts/epics.md";

export const STATUSES = ["backlog", "ready-for-dev", "in-progress", "review", "done", "blocked"] as const;
export type Status = (typeof STATUSES)[number];

export interface Manifest {
  /** Repo-relative path, e.g. `stories/1.5.md`. */
  file: string;
  storyId: string;
  epic: number;
  component: string;
  /**
   * The manifest's `api_surface_gate`: the Component whose `api-surface:gate` the Story's acceptance criteria say
   * passes (Epic 6 retro S4, Maintainer ruling on item 8), or null when absent.
   */
  apiSurfaceGate: string | null;
  status: Status;
  /** The manifest's `sprint_key` (its entry in sprint status), or null when absent. */
  sprintKey: string | null;
  testIds: string[];
  xaravelTestIds: string[];
}

export interface ManifestResult {
  /** Null when any violation was found. */
  manifest: Manifest | null;
  violations: string[];
}

export interface ManifestsResult {
  manifests: Manifest[];
  violations: string[];
}

/** Which commit a file's content is read at: the PR's merge base or its head. */
export type ContentSide = "base" | "head";

export interface OwnershipPrInput {
  /** The PR's `head.ref`. */
  headRef: string;
  files: readonly PrFile[];
  /** The PR's `changed_files` count. */
  changedFiles: number;
  /**
   * A file's content at the merge base or the head commit, or null when the file does not exist there; throws when
   * it cannot be read. Without it, every read the line rules need is unreadable (fail closed).
   */
  content?: (path: string, side: ContentSide) => string | null;
  /** The merge base's sha, for messages. */
  mergeBase?: string | null;
  /** The head commit's sha, for messages. */
  headSha?: string | null;
  /** The PR's author (`GET /pulls/<n>` `user`), or null when unknown; the bot identity rule needs it (Story 5.8). */
  author?: { login: string; type: string } | null;
}

export interface OwnershipPrResult {
  /** The Story ID from a `story/<id>` branch, or null for any other branch. */
  storyId: string | null;
  /** Every PR path outside the Story's allowed paths, sorted. */
  outOfScope: string[];
  /** Empty when the check passes. */
  violations: string[];
}

const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;
const COMPONENT = /^[a-z][a-z0-9-]*$/;
const STORY_BRANCH = "story/";
const PLANNING_BRANCH = "planning/";
const BOT_BRANCH = "bot/";
/** The login of the `xaravel-bot` GitHub App, the only author a `bot/*` PR may have (Story 5.8). */
export const BOT_LOGIN = "xaravel-bot[bot]";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function describe(value: unknown): string {
  if (value === undefined) {
    return "missing";
  }
  return `got ${JSON.stringify(value)}`;
}

/** The `---`-fenced YAML frontmatter at the top of `text`, or null when there is none. */
function frontmatter(text: string): string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  const end = lines.indexOf("---", 1);
  return end === -1 ? null : lines.slice(1, end).join("\n");
}

/** Parses and validates one manifest; `file` is its repo-relative path. */
export function parseManifest(file: string, text: string): ManifestResult {
  const bad = (field: string, problem: string): string => `invalid manifest: ${file}: ${field} ${problem} (AD-16)`;
  const block = frontmatter(text);
  if (block === null) {
    return { manifest: null, violations: [bad("frontmatter", "is missing; expected a ---fenced YAML block at the top")] };
  }
  let data: unknown;
  try {
    data = Bun.YAML.parse(block);
  } catch (error) {
    return { manifest: null, violations: [bad("frontmatter", `is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)] };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { manifest: null, violations: [bad("frontmatter", "must be a YAML mapping")] };
  }
  const fields = data as Record<string, unknown>;
  const violations: string[] = [];
  const stem = (file.split("/").pop() ?? file).replace(/\.md$/, "");

  const storyId = fields["story_id"];
  if (typeof storyId !== "string" || !STORY_ID.test(storyId)) {
    violations.push(bad("story_id", `must be a string matching <epic>.<story>, ${describe(storyId)}`));
  } else if (storyId !== stem) {
    violations.push(bad("story_id", `${JSON.stringify(storyId)} must equal the file stem ${JSON.stringify(stem)}`));
  }

  const epic = fields["epic"];
  if (typeof epic !== "number" || !Number.isInteger(epic)) {
    violations.push(bad("epic", `must be an integer, ${describe(epic)}`));
  } else if (typeof storyId === "string" && STORY_ID.test(storyId) && epic !== Number(storyId.split(".")[0])) {
    violations.push(bad("epic", `${epic} must equal the epic part of story_id ${JSON.stringify(storyId)}`));
  }

  const component = fields["component"];
  if (typeof component !== "string" || !COMPONENT.test(component)) {
    violations.push(bad("component", `must be a kebab-case string, ${describe(component)}`));
  }

  const apiSurfaceGate = fields["api_surface_gate"];
  if (apiSurfaceGate !== undefined && (typeof apiSurfaceGate !== "string" || !COMPONENT.test(apiSurfaceGate))) {
    violations.push(bad("api_surface_gate", `must be a kebab-case component name when present, ${describe(apiSurfaceGate)}`));
  }

  const status = fields["status"];
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    violations.push(bad("status", `must be one of ${STATUSES.join(", ")}, ${describe(status)}`));
  }

  const sprintKey = fields["sprint_key"];
  if (sprintKey !== undefined && (typeof sprintKey !== "string" || sprintKey.trim() === "" || sprintKey !== sprintKey.trim())) {
    violations.push(bad("sprint_key", `must be a non-empty string without surrounding whitespace when present, ${describe(sprintKey)}`));
  }

  const list = (field: string): string[] | null => {
    const value = fields[field];
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "" || item.trim() !== item)) {
      violations.push(bad(field, `must be a list of non-empty strings without surrounding whitespace, ${describe(value)}`));
      return null;
    }
    return value as string[];
  };
  const testIds = list("test_ids");
  const xaravelTestIds = list("xaravel_test_ids");
  if (testIds !== null && xaravelTestIds !== null && testIds.length === 0 && xaravelTestIds.length === 0) {
    violations.push(bad("test_ids/xaravel_test_ids", "are both absent or empty; a Story with no assigned tests can't be done"));
  }

  if (violations.length > 0) {
    return { manifest: null, violations };
  }
  return {
    manifest: {
      file,
      storyId: storyId as string,
      epic: epic as number,
      component: component as string,
      apiSurfaceGate: apiSurfaceGate === undefined ? null : (apiSurfaceGate as string),
      status: status as Status,
      sprintKey: sprintKey === undefined ? null : (sprintKey as string),
      testIds: testIds!,
      xaravelTestIds: xaravelTestIds!,
    },
    violations: [],
  };
}

/** Parses every `stories/*.md` under `root`, sorted by file name. */
export function readManifests(root: string): ManifestsResult {
  const dir = join(root, STORIES_DIR);
  const manifests: Manifest[] = [];
  const violations: string[] = [];
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort(compare);
  for (const name of names) {
    const file = `${STORIES_DIR}/${name}`;
    const result = parseManifest(file, readFileSync(join(dir, name), "utf8"));
    violations.push(...result.violations);
    if (result.manifest !== null) {
      manifests.push(result.manifest);
    }
  }
  return { manifests, violations };
}

/**
 * Resolves each manifest's effective status from sprint status under `root`
 * (`development_status[<sprint_key>]`). Without a sprint status file the
 * manifests are returned unchanged; a manifest without a `sprint_key` keeps its
 * own `status`. A bad file, an unknown key or an invalid value is a violation.
 */
export function applySprintStatus(root: string, manifests: readonly Manifest[]): ManifestsResult {
  const path = join(root, SPRINT_STATUS);
  if (!existsSync(path)) {
    return { manifests: [...manifests], violations: [] };
  }
  const bad = (problem: string): ManifestsResult => ({
    manifests: [...manifests],
    violations: [`invalid sprint status: ${SPRINT_STATUS}: ${problem} (AD-16)`],
  });
  let data: unknown;
  try {
    data = Bun.YAML.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return bad(`is unreadable or not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return bad("must be a YAML mapping");
  }
  const development = (data as Record<string, unknown>)["development_status"];
  if (development === null || typeof development !== "object" || Array.isArray(development)) {
    return bad(`development_status must be a mapping, ${describe(development)}`);
  }
  const entries = development as Record<string, unknown>;
  const resolved: Manifest[] = [];
  const violations: string[] = [];
  for (const manifest of manifests) {
    const key = manifest.sprintKey;
    if (key === null) {
      resolved.push(manifest);
      continue;
    }
    if (!Object.hasOwn(entries, key)) {
      violations.push(`unknown sprint key: ${manifest.file}: sprint_key ${JSON.stringify(key)} is not in ${SPRINT_STATUS} development_status (AD-16)`);
      resolved.push(manifest);
      continue;
    }
    const value = entries[key];
    if (typeof value !== "string" || !(STATUSES as readonly string[]).includes(value)) {
      violations.push(`invalid sprint status: ${SPRINT_STATUS}: development_status.${key} must be one of ${STATUSES.join(", ")}, ${describe(value)} (AD-16)`);
      resolved.push(manifest);
      continue;
    }
    resolved.push({ ...manifest, status: value as Status });
  }
  return { manifests: resolved, violations };
}

/** Fails a Test ID listed by two or more open Stories, or repeated inside one manifest. */
export function checkDuplicates(manifests: readonly Manifest[]): string[] {
  const violations: string[] = [];
  const owners = new Map<string, string[]>();
  for (const manifest of manifests) {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const id of [...manifest.testIds, ...manifest.xaravelTestIds]) {
      if (seen.has(id)) {
        repeated.add(id);
      }
      seen.add(id);
    }
    for (const id of [...repeated].sort(compare)) {
      violations.push(`duplicate test id: ${id} is listed more than once in ${manifest.file} (AD-16)`);
    }
    if (manifest.status === "done") {
      continue;
    }
    for (const id of seen) {
      const stories = owners.get(id) ?? [];
      stories.push(manifest.storyId);
      owners.set(id, stories);
    }
  }
  for (const id of [...owners.keys()].sort(compare)) {
    const stories = owners.get(id)!;
    if (stories.length > 1) {
      const names = [...stories].sort(compareStoryIds).map((story) => `Story ${story}`);
      violations.push(`duplicate test id: ${id} is listed by open ${names.join(", ")} (AD-16)`);
    }
  }
  return violations;
}

/** One "`api-surface:gate <c>` passes" acceptance criterion of `epics.md`. */
export interface GateCriterion {
  /** The Story whose `### Story X.Y:` heading the criterion is under, or null when it is under no Story heading. */
  readonly storyId: string | null;
  readonly component: string;
  /** 1-based line in `epics.md`. */
  readonly line: number;
}

const STORY_HEADING = /^### Story ([1-9]\d*\.[1-9]\d*):/;
/** Any other heading of level 1 to 3 ends a Story's section. */
const SECTION_HEADING = /^#{1,3}\s/;
/** The exact phrase, with a kebab-case component; placeholders such as `<c>` are not criteria. */
const GATE_CRITERION = /`api-surface:gate ([a-z][a-z0-9-]*)` passes/g;

/**
 * Every "`api-surface:gate <c>` passes" acceptance criterion in `text` (`epics.md`), in file order, each with the
 * Story whose `### Story X.Y:` heading it is under (Epic 6 retro S4, Maintainer ruling on item 8).
 */
export function gateCriteria(text: string): GateCriterion[] {
  const out: GateCriterion[] = [];
  let storyId: string | null = null;
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line, index) => {
      const heading = STORY_HEADING.exec(line);
      if (heading !== null) {
        storyId = heading[1]!;
      } else if (SECTION_HEADING.test(line)) {
        storyId = null;
      }
      for (const match of line.matchAll(GATE_CRITERION)) {
        out.push({ storyId, component: match[1]!, line: index + 1 });
      }
    });
  return out;
}

/** The gate criteria of `epics.md` under `root`; throws when the file does not exist or cannot be read (fail closed). */
export function readGateCriteria(root: string): GateCriterion[] {
  const path = join(root, EPICS);
  if (!existsSync(path)) {
    throw new Error(`${EPICS} does not exist`);
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${EPICS} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return gateCriteria(text);
}

export interface GateCheckResult {
  violations: string[];
  /** A gate criterion whose Story has no manifest yet: not a violation (see `checkApiSurfaceGates`). */
  notes: string[];
}

/**
 * Cross-checks each manifest's `api_surface_gate` against the gate criteria of `epics.md`: a Story with such a
 * criterion carries the field naming its component, a Story without one carries no field, and a Story has gate
 * criteria for one component at most. A criterion under no Story heading is a violation. A criterion whose Story has
 * no manifest is a note: that Story cannot be worked or accepted until it has one (ownership's `missing manifest`,
 * story:check's `manifest` clause), and then the field is required.
 */
export function checkApiSurfaceGates(manifests: readonly Manifest[], criteria: readonly GateCriterion[]): GateCheckResult {
  const violations: string[] = [];
  const notes: string[] = [];
  const byStory = new Map<string, GateCriterion[]>();
  for (const criterion of criteria) {
    if (criterion.storyId === null) {
      violations.push(`api-surface gate: ${EPICS}:${criterion.line} says \`api-surface:gate ${criterion.component}\` passes under no ### Story heading (AD-15)`);
      continue;
    }
    const list = byStory.get(criterion.storyId) ?? [];
    list.push(criterion);
    byStory.set(criterion.storyId, list);
  }
  const at = (list: readonly GateCriterion[]): string => list.map((criterion) => `epics.md:${criterion.line}`).join(", ");
  const withManifest = new Set(manifests.map((manifest) => manifest.storyId));
  for (const [storyId, list] of [...byStory].sort(([a], [b]) => compareStoryIds(a, b))) {
    const components = [...new Set(list.map((criterion) => criterion.component))];
    if (components.length > 1) {
      const each = components.map((component) => `\`api-surface:gate ${component}\` (${at(list.filter((criterion) => criterion.component === component))})`);
      violations.push(`api-surface gate: Story ${storyId} has api-surface:gate acceptance criteria for ${components.length} components, ${each.join(" and ")}; api_surface_gate holds one component (AD-15)`);
    } else if (!withManifest.has(storyId)) {
      notes.push(`note: Story ${storyId} has an \`api-surface:gate ${components[0]!}\` passes acceptance criterion (${at(list)}) but no ${STORIES_DIR}/${storyId}.md; its manifest must carry api_surface_gate: ${components[0]!}`);
    }
  }
  for (const manifest of manifests) {
    const list = byStory.get(manifest.storyId) ?? [];
    const components = [...new Set(list.map((criterion) => criterion.component))];
    if (components.length > 1) {
      continue;
    }
    const expected = components[0] ?? null;
    if (expected === null) {
      if (manifest.apiSurfaceGate !== null) {
        violations.push(
          `api-surface gate: ${manifest.file} carries api_surface_gate: ${manifest.apiSurfaceGate} but epics.md has no \`api-surface:gate ${manifest.apiSurfaceGate}\` passes acceptance criterion for Story ${manifest.storyId} (AD-15)`,
        );
      }
    } else if (manifest.apiSurfaceGate !== expected) {
      const got = manifest.apiSurfaceGate === null ? "got no api_surface_gate" : `got api_surface_gate: ${manifest.apiSurfaceGate}`;
      violations.push(`api-surface gate: ${manifest.file} must carry api_surface_gate: ${expected} (${at(list)} says \`api-surface:gate ${expected}\` passes), ${got} (AD-15)`);
    }
  }
  return { violations, notes };
}

function compareStoryIds(a: string, b: string): number {
  const [aEpic, aStory] = a.split(".").map(Number) as [number, number];
  const [bEpic, bStory] = b.split(".").map(Number) as [number, number];
  return aEpic - bEpic || aStory - bStory || compare(a, b);
}

/** Whether `path` has an empty, `.` or `..` segment. */
function hasBadSegment(path: string): boolean {
  return path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `path` is one of the paths a Story may edit (AD-16), or a signed fixture of its own Component. */
export function allowedPath(manifest: Pick<Manifest, "storyId" | "component">, path: string): boolean {
  const { storyId, component } = manifest;
  if (hasBadSegment(path)) {
    return false;
  }
  if (path.startsWith(`packages/${component}/`) || path.startsWith(`conformance/expectations/${component}/`)) {
    return true;
  }
  if (path === `conformance/oracle-requests/${storyId}.jsonl`) {
    return true;
  }
  // generators/ holds the Protected generator reference files, never a Component's fixtures.
  if (component !== "generators" && new RegExp(`^conformance/fixtures/${escapeRegex(component)}/[0-9a-f]{64}\\.json$`).test(path)) {
    return true;
  }
  return new RegExp(`^conformance/escalations/ESC-${escapeRegex(storyId)}-[1-9]\\d*\\.md$`).test(path);
}

/**
 * Whether a `planning/*` branch may change `path` (AD-16, MAINT-2026-10-17 item
 * 15): anything but `packages/**` and `conformance/expectations/**`, matched in
 * any letter case.
 */
export function planningAllowedPath(path: string): boolean {
  if (hasBadSegment(path)) {
    return false;
  }
  const folded = path.toLowerCase();
  return !folded.startsWith("packages/") && !folded.startsWith("conformance/expectations/");
}

/**
 * Whether a `bot/*` branch may change `path` (AD-16): `conformance/expectations/**`
 * or `conformance/escalations/ESC-bot-<n>.md`. Only the path-level half of the
 * Expectations-`status`-only rule; Story 5.8 owns the value-level half.
 */
export function botAllowedPath(path: string): boolean {
  if (hasBadSegment(path)) {
    return false;
  }
  return path.startsWith("conformance/expectations/") || /^conformance\/escalations\/ESC-bot-[1-9]\d*\.md$/.test(path);
}

/** Every PR path (and renamed-from path) `allowed` rejects, sorted. */
function disallowed(files: readonly PrFile[], allowed: (path: string) => boolean): string[] {
  const outside = new Set<string>();
  for (const prFile of files) {
    // Only a rename removes its previous name; a copy leaves its source untouched.
    const previous = prFile.status === "renamed" ? (prFile.previous_filename ?? null) : null;
    for (const candidate of [prFile.filename, previous]) {
      if (candidate !== null && !allowed(candidate)) {
        outside.add(candidate);
      }
    }
  }
  return [...outside].sort(compare);
}

function truncated(pr: OwnershipPrInput): string[] {
  return pr.files.length < pr.changedFiles
    ? [`truncated file list: the API returned ${pr.files.length} of ${pr.changedFiles} changed files; failing closed (AD-16)`]
    : [];
}

// ---------------------------------------------------------------------------
// Line rules (Story 5.6)

const EXPECTATIONS_FILE = /^conformance\/expectations\/.+\.jsonl$/;
const PORTED_FILE = /^packages\/[^/]+\/tests\/ported\/.+\.test\.ts$/;
const ESCALATION_FILE = /^conformance\/escalations\/(ESC-(?:[1-9]\d*\.[1-9]\d*|bot)-[1-9]\d*)\.md$/;

/** One side of a changed file: the path to read and where. */
export interface ContentRead {
  path: string;
  side: ContentSide;
}

/** The base and head paths of a PR file: a rename's base is its previous name; an added or copied file has no base, a removed one no head. */
function sidesOf(prFile: PrFile): { base: string | null; head: string | null } {
  const status = prFile.status ?? "modified";
  const base = status === "added" || status === "copied" ? null : status === "renamed" ? (prFile.previous_filename ?? null) : prFile.filename;
  const head = status === "removed" ? null : prFile.filename;
  return { base, head };
}

/** The reads `evaluatePr`'s line rules need for `headRef` and `files`, in a stable order (the `pr` command prefetches them). */
export function contentReads(headRef: string, files: readonly PrFile[]): ContentRead[] {
  if (headRef.startsWith(PLANNING_BRANCH)) {
    return [];
  }
  if (headRef.startsWith(BOT_BRANCH)) {
    // The bot value rule (Story 5.8) reads each changed shard at the merge base and the head.
    const reads = new Map<string, ContentRead>();
    for (const prFile of files) {
      const { base, head } = sidesOf(prFile);
      for (const [path, side] of [[base, "base"], [head, "head"]] as const) {
        if (path !== null && EXPECTATIONS_FILE.test(path)) {
          reads.set(`${side}\0${path}`, { path, side });
        }
      }
    }
    return [...reads.values()];
  }
  const story = headRef.startsWith(STORY_BRANCH);
  const reads = new Map<string, ContentRead>();
  const add = (path: string | null, side: ContentSide): void => {
    if (path !== null && (EXPECTATIONS_FILE.test(path) || (story && PORTED_FILE.test(path)))) {
      reads.set(`${side}\0${path}`, { path, side });
    }
  };
  let expectations = false;
  for (const prFile of files) {
    const { base, head } = sidesOf(prFile);
    add(base, "base");
    add(head, "head");
    expectations ||= [base, head].some((path) => path !== null && EXPECTATIONS_FILE.test(path));
  }
  // An Escalation the PR adds or changes can approve a demotion; its head text decides.
  if (expectations) {
    for (const prFile of files) {
      const { head } = sidesOf(prFile);
      if (head !== null && ESCALATION_FILE.test(head)) {
        reads.set(`head\0${head}`, { path: head, side: "head" });
      }
    }
  }
  return [...reads.values()];
}

/**
 * The entries of `ids` (a Test ID list) that cover `id`: `id` itself, and each `X` where `id` is a row `X#<key>`
 * (Story 5.6). The one Test ID matcher: ownership, the Ratchet, `harness --story`, `story:check` and `oracle:story`
 * all use it.
 */
export function coveringIds(ids: ReadonlySet<string>, id: string): string[] {
  const out: string[] = [];
  if (ids.has(id)) {
    out.push(id);
  }
  for (let i = id.indexOf("#"); i !== -1; i = id.indexOf("#", i + 1)) {
    const prefix = id.slice(0, i);
    if (ids.has(prefix)) {
      out.push(prefix);
    }
  }
  return out;
}

/** Whether `ids` (a Test ID list) covers `id`: it lists `id`, or `X` where `id` is a row `X#<key>` (Story 5.6). */
export function covers(ids: ReadonlySet<string>, id: string): boolean {
  return coveringIds(ids, id).length > 0;
}

/** Whether `ids` covers the `portedTest` block `id`: it lists `id` or one of its rows `id#<key>`. */
function coversBlock(ids: ReadonlySet<string>, id: string): boolean {
  if (covers(ids, id)) {
    return true;
  }
  for (const listed of ids) {
    if (listed.startsWith(`${id}#`)) {
      return true;
    }
  }
  return false;
}

interface KeyedLine {
  text: string;
  status: string;
  path: string;
}

interface LineContext {
  read: (path: string, side: ContentSide) => string | null;
  violations: string[];
}

class Unreadable extends Error {}

/** Reads every changed file the rules need, recording `unreadable content` for what fails; returns the readable texts. */
function reader(pr: OwnershipPrInput, violations: string[]): (path: string, side: ContentSide) => string | null {
  const reported = new Set<string>();
  return (path, side) => {
    const sha = (side === "base" ? pr.mergeBase : pr.headSha) ?? `the ${side === "base" ? "merge base" : "head commit"}`;
    const fail = (): never => {
      const line = `unreadable content: ${path} at ${sha} could not be read; failing closed (AD-16)`;
      if (!reported.has(line)) {
        reported.add(line);
        violations.push(line);
      }
      throw new Unreadable(line);
    };
    if (pr.content === undefined) {
      return fail();
    }
    let text: string | null;
    try {
      text = pr.content(path, side);
    } catch {
      return fail();
    }
    // A side the file list says exists must be there.
    if (text === null) {
      return fail();
    }
    return text;
  };
}

/** The Expectations lines of the changed shards on one side, by `id [variant]`, or null when a shard was unreadable or unparsable. */
function expectationLines(paths: readonly string[], side: ContentSide, context: LineContext, sha: string): Map<string, KeyedLine[]> | null {
  const keyed = new Map<string, KeyedLine[]>();
  let ok = true;
  for (const path of paths) {
    let text: string;
    try {
      text = context.read(path, side)!;
    } catch {
      ok = false;
      continue;
    }
    const lines = text.split("\n");
    if (lines.at(-1) === "") {
      lines.pop();
    }
    lines.forEach((raw, index) => {
      const line = raw.replace(/\r$/, "");
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        value = null;
      }
      const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
      const id = record?.["id"];
      const variant = record?.["variant"];
      const status = record?.["status"];
      if (record === null || typeof id !== "string" || typeof variant !== "string" || typeof status !== "string") {
        context.violations.push(`unparsable expectation: ${path}:${index + 1} at ${sha} is not an Expectations line with a string id, variant and status; failing closed (AD-16)`);
        ok = false;
        return;
      }
      const key = `${id} [${variant}]`;
      const list = keyed.get(key) ?? [];
      list.push({ text: line, status, path });
      keyed.set(key, list);
    });
  }
  return ok ? keyed : null;
}

/** The `portedTest` blocks of the changed Ported Test files on one side, by id, or null when a file was unreadable or unbalanced. */
function portedBlocks(paths: readonly string[], side: ContentSide, context: LineContext, sha: string): Map<string, { text: string; at: string }[]> | null {
  const keyed = new Map<string, { text: string; at: string }[]>();
  let ok = true;
  for (const path of paths) {
    let text: string;
    try {
      text = context.read(path, side)!;
    } catch {
      ok = false;
      continue;
    }
    const scanned = scanPortedBlocks(text);
    if (scanned.blocks === null) {
      context.violations.push(`unparsable ported test file: ${path} at ${sha}: ${scanned.error}; failing closed (AD-16)`);
      ok = false;
      continue;
    }
    for (const block of scanned.blocks) {
      if (block.id === null) {
        const line = `unresolved ported test id: ${path}:${block.line} has a portedTest whose id is not a string literal or a template of top-level string constants; failing closed (AD-16)`;
        if (!context.violations.includes(line)) {
          context.violations.push(line);
        }
        ok = false;
        continue;
      }
      const list = keyed.get(block.id) ?? [];
      list.push({ text: block.text, at: `${path}:${block.line}` });
      keyed.set(block.id, list);
    }
  }
  return ok ? keyed : null;
}

function sameTexts(a: readonly { text: string }[] | undefined, b: readonly { text: string }[] | undefined): boolean {
  const left = (a ?? []).map((item) => item.text).sort(compare);
  const right = (b ?? []).map((item) => item.text).sort(compare);
  return left.length === right.length && left.every((text, index) => text === right[index]);
}

/** The Test IDs each approved Escalation lists: on base (`root`), or in the PR head when the PR changes it; decisions from base. */
function approvedTestIds(root: string, files: readonly PrFile[], read: (path: string, side: ContentSide) => string | null): { ids: Set<string>; complete: boolean } {
  const texts = new Map<string, string>();
  const dir = join(root, ESCALATIONS_DIR);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort(compare)) {
      const match = ESCALATION_FILE.exec(`${ESCALATIONS_DIR}/${name}`);
      if (match !== null) {
        texts.set(match[1]!, readFileSync(join(dir, name), "utf8"));
      }
    }
  }
  let complete = true;
  for (const prFile of files) {
    const { base, head } = sidesOf(prFile);
    // A PR that removes or renames away an Escalation takes it out of play.
    const removed = base === null ? null : ESCALATION_FILE.exec(base);
    if (removed !== null) {
      texts.delete(removed[1]!);
    }
    const changed = head === null ? null : ESCALATION_FILE.exec(head);
    if (changed !== null) {
      try {
        texts.set(changed[1]!, read(head!, "head")!);
      } catch {
        complete = false;
      }
    }
  }
  const ids = new Set<string>();
  for (const [id, text] of texts) {
    const parsed = parseEscalation(`${ESCALATIONS_DIR}/${id}.md`, text);
    if (parsed.escalation === null) {
      continue;
    }
    const decisionPath = join(root, DECISIONS_DIR, `${id}.md`);
    const decision = existsSync(decisionPath) ? readFileSync(decisionPath, "utf8") : null;
    if (decisionStatus(id, text, decision) === "approved") {
      parsed.escalation.testIds.forEach((testId) => ids.add(testId));
    }
  }
  return { ids, complete };
}

/** The line-rule violations of a PR (see the header); `owned` is the Story's `test_ids`, or null off `story/*` branches. */
function lineRules(root: string, pr: OwnershipPrInput, storyId: string | null, owned: ReadonlySet<string> | null): string[] {
  const violations: string[] = [];
  const read = reader(pr, violations);
  const context: LineContext = { read, violations };
  const baseSha = pr.mergeBase ?? "the merge base";
  const headSha = pr.headSha ?? "the head commit";
  const reads = contentReads(pr.headRef, pr.files);
  const pathsOf = (pattern: RegExp, side: ContentSide): string[] => reads.filter((entry) => entry.side === side && pattern.test(entry.path)).map((entry) => entry.path);

  const shardsBase = pathsOf(EXPECTATIONS_FILE, "base");
  const shardsHead = pathsOf(EXPECTATIONS_FILE, "head");
  if (shardsBase.length > 0 || shardsHead.length > 0) {
    const before = expectationLines(shardsBase, "base", context, baseSha);
    const after = expectationLines(shardsHead, "head", context, headSha);
    if (before !== null && after !== null) {
      const keys = [...new Set([...before.keys(), ...after.keys()])].sort(compare);
      const changed = keys.filter((key) => !sameTexts(before.get(key), after.get(key)));
      const demoted = changed.filter((key) => (before.get(key) ?? []).some((line) => line.status === "pass") && !(after.get(key) ?? []).some((line) => line.status === "pass"));
      const approved = demoted.length > 0 ? approvedTestIds(root, pr.files, read) : { ids: new Set<string>(), complete: true };
      for (const key of changed) {
        const lines = [...(after.get(key) ?? []), ...(before.get(key) ?? [])];
        const shards = [...new Set(lines.map((line) => line.path))].join(", ");
        const id = key.slice(0, key.lastIndexOf(" ["));
        if (owned !== null && !covers(owned, id)) {
          violations.push(`unowned expectation: ${key} changes in ${shards}, but Story ${storyId}'s test_ids do not list it (AD-16)`);
        }
        if (demoted.includes(key) && approved.complete && !covers(approved.ids, id)) {
          const next = after.get(key)?.[0]?.status ?? "removed";
          violations.push(`pass demoted: ${key} changes from pass to ${next} in ${shards} with no approved Escalation listing it (AD-16)`);
        }
      }
    }
  }

  if (owned !== null) {
    const portedBase = pathsOf(PORTED_FILE, "base");
    const portedHead = pathsOf(PORTED_FILE, "head");
    if (portedBase.length > 0 || portedHead.length > 0) {
      const before = portedBlocks(portedBase, "base", context, baseSha);
      const after = portedBlocks(portedHead, "head", context, headSha);
      if (before !== null && after !== null) {
        const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compare);
        for (const id of ids) {
          if (!sameTexts(before.get(id), after.get(id)) && !coversBlock(owned, id)) {
            const at = (after.get(id) ?? before.get(id) ?? [])[0]!.at;
            violations.push(`unowned ported test: ${id} at ${at} changes, but Story ${storyId}'s test_ids do not list it (AD-16)`);
          }
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Bot rules (Story 5.8)

/** The status triple a bot may change; every other field of a line is frozen. */
const STATUS_TRIPLE: ReadonlySet<string> = new Set(["status", "reason", "escalation"]);
const BOT_STATUSES: ReadonlySet<string> = new Set(["pass", "quarantined"]);
const BOT_ESCALATION = /^ESC-bot-[1-9]\d*$/;

interface ParsedShardLine {
  key: string;
  text: string;
  record: Record<string, unknown>;
}

/** The parsed lines of one shard, or the `bot value:` problems that stop it being judged. */
function shardLines(path: string, side: ContentSide, text: string, problems: string[]): ParsedShardLine[] | null {
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const parsed: ParsedShardLine[] = [];
  let ok = true;
  lines.forEach((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      value = null;
    }
    const record = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (record === null || typeof record["id"] !== "string" || typeof record["variant"] !== "string") {
      problems.push(`bot value: ${path}:${index + 1} at the ${side === "base" ? "merge base" : "head"} is not an Expectations line with a string id and variant (AD-16)`);
      ok = false;
      return;
    }
    parsed.push({ key: `${record["id"]} [${record["variant"]}]`, text: line, record });
  });
  return ok ? parsed : null;
}

/** Whether two parsed JSON values are equal. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The `bot value:` violations of a bot change (AD-16, Story 5.8): `base` and `head` map each changed Expectations
 * shard to its text at the merge base and the head (a shard absent on a side is added or removed there), and
 * `addedBotEscalations` holds the `ESC-bot-<n>` IDs whose files the PR adds. A bot changes only the status triple
 * (`status`, `reason`, `escalation`) of existing lines; see the header.
 */
export function botValueProblems(base: ReadonlyMap<string, string>, head: ReadonlyMap<string, string>, addedBotEscalations: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const paths = [...new Set([...base.keys(), ...head.keys()])].sort(compare);
  for (const path of paths) {
    const before = base.get(path);
    const after = head.get(path);
    if (before === undefined) {
      problems.push(`bot value: ${path} is added (or renamed to); a bot/* branch never adds, removes or renames an Expectations shard (AD-16)`);
      continue;
    }
    if (after === undefined) {
      problems.push(`bot value: ${path} is removed (or renamed away); a bot/* branch never adds, removes or renames an Expectations shard (AD-16)`);
      continue;
    }
    const left = shardLines(path, "base", before, problems);
    const right = shardLines(path, "head", after, problems);
    if (left === null || right === null) {
      continue;
    }
    const leftKeys = left.map((line) => line.key);
    const rightKeys = right.map((line) => line.key);
    if (leftKeys.join("\n") !== rightKeys.join("\n")) {
      const rightSet = new Set(rightKeys);
      const leftSet = new Set(leftKeys);
      const removed = leftKeys.filter((key) => !rightSet.has(key));
      const added = rightKeys.filter((key) => !leftSet.has(key));
      const what = removed.length === 0 && added.length === 0 ? "its lines are reordered or repeated" : `its key set differs (added: ${added.join(", ") || "none"}; removed: ${removed.join(", ") || "none"})`;
      problems.push(`bot value: ${path}: ${what}; a bot/* branch never adds, removes or moves a line (AD-16)`);
      continue;
    }
    left.forEach((was, index) => {
      const now = right[index]!;
      if (was.text === now.text) {
        return;
      }
      const at = `${now.key} in ${path}`;
      const fields = [...new Set([...Object.keys(was.record), ...Object.keys(now.record)])].filter((field) => !STATUS_TRIPLE.has(field)).sort(compare);
      for (const field of fields) {
        if (!sameValue(was.record[field], now.record[field])) {
          problems.push(`bot value: ${at}: ${field} changes from ${JSON.stringify(was.record[field] ?? null)} to ${JSON.stringify(now.record[field] ?? null)}; a bot changes only status, reason and escalation (AD-16)`);
        }
      }
      const status = now.record["status"];
      if (typeof status !== "string" || !BOT_STATUSES.has(status)) {
        problems.push(`bot value: ${at}: status ${JSON.stringify(status ?? null)} is neither pass (a promotion) nor quarantined (a quarantine) (AD-16)`);
      }
      if (now.record["reason"] !== null) {
        problems.push(`bot value: ${at}: reason must be null, got ${JSON.stringify(now.record["reason"] ?? null)} (AD-16)`);
      }
      const escalation = now.record["escalation"];
      if (status === "pass" && !sameValue(was.record["escalation"], escalation)) {
        problems.push(`bot value: ${at}: escalation changes from ${JSON.stringify(was.record["escalation"] ?? null)} to ${JSON.stringify(escalation ?? null)} under pass; a promotion keeps it (AD-16)`);
      }
      const previous = was.record["status"];
      if (status === "quarantined" && previous !== "quarantined" && previous !== "pass" && previous !== "fail-known") {
        problems.push(`bot value: ${at}: status changes from ${JSON.stringify(previous ?? null)} to quarantined; a bot quarantines only pass or fail-known lines (AD-16)`);
      }
      if (status === "quarantined" && !(typeof escalation === "string" && BOT_ESCALATION.test(escalation) && addedBotEscalations.has(escalation))) {
        problems.push(`bot value: ${at}: quarantined with escalation ${JSON.stringify(escalation ?? null)}, which is not an ESC-bot-<n> this PR adds (AD-16)`);
      }
    });
  }
  return problems;
}

/** The identity and value violations of a `bot/*` PR (see the header). */
function botRules(pr: OwnershipPrInput): string[] {
  const violations: string[] = [];
  const author = pr.author ?? null;
  if (author === null || author.type !== "Bot" || author.login !== BOT_LOGIN) {
    const who = author === null ? "an unknown author" : `${author.login} (type ${author.type})`;
    violations.push(`bot identity: ${pr.headRef} was opened by ${who}, not the xaravel-bot App (${BOT_LOGIN}); only its bot/* PRs are exempt (AD-16)`);
  }
  for (const prFile of pr.files) {
    const { base, head } = sidesOf(prFile);
    for (const path of [base, head]) {
      if (path !== null && path.startsWith("conformance/expectations/") && !EXPECTATIONS_FILE.test(path) && !hasBadSegment(path)) {
        const line = `bot value: ${path} is not an Expectations shard (.jsonl); a bot/* branch changes only Expectations lines (AD-16)`;
        if (!violations.includes(line)) {
          violations.push(line);
        }
      }
    }
  }
  // A bot only adds Escalations; it never changes, removes or renames one (a rename's new name is not `added`).
  for (const prFile of pr.files) {
    const { base, head } = sidesOf(prFile);
    const status = prFile.status ?? "modified";
    for (const path of [base, head]) {
      if (path !== null && status !== "added" && /^conformance\/escalations\/ESC-bot-[1-9]\d*\.md$/.test(path)) {
        const line = `bot value: ${path} is ${status}; a bot/* branch only adds an ESC-bot-<n>.md, never changes, removes or renames one (AD-16)`;
        if (!violations.includes(line)) {
          violations.push(line);
        }
      }
    }
  }
  const read = reader(pr, violations);
  const base = new Map<string, string>();
  const head = new Map<string, string>();
  let complete = true;
  for (const entry of contentReads(pr.headRef, pr.files)) {
    try {
      (entry.side === "base" ? base : head).set(entry.path, read(entry.path, entry.side)!);
    } catch {
      complete = false;
    }
  }
  if (complete) {
    const added = new Set<string>();
    for (const prFile of pr.files) {
      const match = (prFile.status ?? "modified") === "added" ? /^conformance\/escalations\/(ESC-bot-[1-9]\d*)\.md$/.exec(prFile.filename) : null;
      if (match !== null) {
        added.add(match[1]!);
      }
    }
    violations.push(...botValueProblems(base, head, added));
  }
  return violations;
}

/** Decides a PR from its head branch and files, given the base checkout at `root`. */
export function evaluatePr(root: string, pr: OwnershipPrInput): OwnershipPrResult {
  if (pr.headRef.startsWith(PLANNING_BRANCH)) {
    const outOfScope = disallowed(pr.files, planningAllowedPath);
    const violations = [
      ...truncated(pr),
      ...outOfScope.map(
        (path) =>
          `planning scope: ${path} may not change on a planning/* branch; packages/** and conformance/expectations/** change only through story/* branches (AD-16)`,
      ),
    ];
    // No line rules: the planning rule already rejects every Expectations change, so a demotion cannot pass here.
    return { storyId: null, outOfScope, violations };
  }
  if (pr.headRef.startsWith(BOT_BRANCH)) {
    const outOfScope = disallowed(pr.files, botAllowedPath);
    const violations = [
      ...truncated(pr),
      ...outOfScope.map(
        (path) =>
          `bot scope: ${path} is outside conformance/expectations/** and conformance/escalations/ESC-bot-<n>.md, the only paths a bot/* branch may change (AD-16)`,
      ),
      ...botRules(pr),
    ];
    return { storyId: null, outOfScope, violations };
  }
  if (!pr.headRef.startsWith(STORY_BRANCH)) {
    return { storyId: null, outOfScope: [], violations: lineRules(root, pr, null, null) };
  }
  const storyId = pr.headRef.slice(STORY_BRANCH.length);
  const violations: string[] = truncated(pr);
  if (!STORY_ID.test(storyId)) {
    violations.push(`missing manifest: branch ${pr.headRef} does not name a Story ID <epic>.<story>, so no manifest on base can own it (AD-16)`);
    return { storyId, outOfScope: [], violations };
  }
  const file = `${STORIES_DIR}/${storyId}.md`;
  const path = join(root, file);
  if (!existsSync(path)) {
    violations.push(`missing manifest: branch ${pr.headRef} has no ${file} on the base branch; a manifest the PR adds does not count (AD-16)`);
    return { storyId, outOfScope: [], violations };
  }
  const parsed = parseManifest(file, readFileSync(path, "utf8"));
  if (parsed.manifest === null) {
    violations.push(...parsed.violations);
    return { storyId, outOfScope: [], violations };
  }
  const manifest = parsed.manifest;
  const outOfScope = disallowed(pr.files, (candidate) => allowedPath(manifest, candidate));
  for (const candidate of outOfScope) {
    violations.push(`out of scope: ${candidate} is outside Story ${storyId}'s allowed paths (component ${manifest.component}) (AD-16)`);
  }
  violations.push(...lineRules(root, pr, storyId, new Set(manifest.testIds)));
  return { storyId, outOfScope, violations };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

interface Options {
  root: string;
  repo: string | null;
  pr: number | null;
}

function parseOptions(argv: readonly string[], allowed: ReadonlySet<string>): Options {
  const options: Options = { root: resolve(import.meta.dir, "..", ".."), repo: null, pr: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.has(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      options.root = resolve(value);
    } else if (arg === "--repo") {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
        throw new UsageError(`--repo must be <owner/name>, got ${JSON.stringify(value)}`);
      }
      options.repo = value;
    } else if (arg === "--pr") {
      if (!/^[1-9]\d*$/.test(value)) {
        throw new UsageError(`--pr must be a PR number, got ${JSON.stringify(value)}`);
      }
      options.pr = Number(value);
    }
  }
  return options;
}

function report(violations: readonly string[]): void {
  process.stderr.write(`Ownership violations (AD-16):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
}

function manifests(options: Options): number {
  const read = readManifests(options.root);
  const result = applySprintStatus(options.root, read.manifests);
  const violations = [...read.violations, ...result.violations, ...checkDuplicates(result.manifests)];
  // The api-surface gate cross-check (Epic 6 retro S4) reads epics.md, and fails closed when it cannot.
  let gates: GateCheckResult;
  try {
    gates = checkApiSurfaceGates(read.manifests, readGateCriteria(options.root));
  } catch (error) {
    gates = { violations: [`api-surface gate: cannot check: ${error instanceof Error ? error.message : String(error)} (AD-15)`], notes: [] };
  }
  violations.push(...gates.violations);
  if (gates.notes.length > 0) {
    process.stderr.write(gates.notes.map((note) => `${note}\n`).join(""));
  }
  if (violations.length > 0) {
    report(violations);
    return 1;
  }
  const open = result.manifests.filter((manifest) => manifest.status !== "done").length;
  process.stdout.write(`Ownership OK: ${result.manifests.length} manifest(s) valid, ${open} open, no duplicate Test IDs.\n`);
  return 0;
}

/** The `epic` of Story `storyId`'s valid manifest on the base checkout at `root`, or null when there is none (Story 8.8). */
function baseManifestEpic(root: string, storyId: string | null): number | null {
  if (storyId === null || !STORY_ID.test(storyId)) {
    return null;
  }
  const file = `${STORIES_DIR}/${storyId}.md`;
  const path = join(root, file);
  return existsSync(path) ? (parseManifest(file, readFileSync(path, "utf8")).manifest?.epic ?? null) : null;
}

async function pr(options: Options): Promise<number> {
  if (options.repo === null || options.pr === null) {
    throw new UsageError("pr needs --repo <owner/name> and --pr <n>");
  }
  const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  const token = process.env["GH_TOKEN"] || null;
  const github = new GitHub(api, options.repo, token);

  const pull = await github.json<{ head: { ref: string; sha?: unknown }; base?: { sha?: unknown } | null; changed_files: number; user?: { login?: unknown; type?: unknown } | null }>(
    `/pulls/${options.pr}`,
  );
  const headRef = pull.head.ref;
  if (typeof headRef !== "string" || typeof pull.changed_files !== "number") {
    throw new Error(`GET /pulls/${options.pr}: missing head.ref or changed_files`);
  }
  const files = await github.paged<PrFile>(`/pulls/${options.pr}/files`);
  // The line rules (Story 5.6) read only the files they judge, at the merge base and the head commit.
  const reads = contentReads(headRef, files);
  const headSha = typeof pull.head.sha === "string" ? pull.head.sha : null;
  let mergeBase: string | null = null;
  const fetched = new Map<string, string | null | Error>();
  if (reads.length > 0) {
    if (headSha === null) {
      throw new Error(`GET /pulls/${options.pr}: missing head.sha`);
    }
    if (reads.some((entry) => entry.side === "base")) {
      const baseSha = pull.base?.sha;
      if (typeof baseSha !== "string") {
        throw new Error(`GET /pulls/${options.pr}: missing base.sha`);
      }
      const compared = await github.json<{ merge_base_commit?: { sha?: unknown } | null }>(`/compare/${baseSha}...${headSha}`);
      const sha = compared.merge_base_commit?.sha;
      if (typeof sha !== "string") {
        throw new Error(`GET /compare/${baseSha}...${headSha}: missing merge_base_commit.sha`);
      }
      mergeBase = sha;
    }
    await Promise.all(
      reads.map(async ({ path, side }) => {
        const ref = side === "base" ? mergeBase! : headSha;
        try {
          fetched.set(`${side}\0${path}`, await github.contents(path, ref));
        } catch (error) {
          fetched.set(`${side}\0${path}`, error instanceof Error ? error : new Error(String(error)));
        }
      }),
    );
  }
  const content = (path: string, side: ContentSide): string | null => {
    const value = fetched.get(`${side}\0${path}`);
    if (value === undefined || value instanceof Error) {
      throw value ?? new Error(`${path} was not fetched`);
    }
    return value;
  };
  const user = pull.user ?? null;
  const author = user !== null && typeof user.login === "string" && typeof user.type === "string" ? { login: user.login, type: user.type } : null;
  const result = evaluatePr(options.root, { headRef, files, changedFiles: pull.changed_files, content, mergeBase, headSha, author });
  // The Phase 1 gate (Story 8.8) reads the base checkout only, whatever the PR head holds.
  const epic = baseManifestEpic(options.root, result.storyId);
  if (result.storyId !== null && epic !== null && epic > PHASE_0_LAST_EPIC) {
    result.violations.push(...(await phaseGateViolations(options.root, result.storyId, epic)));
  }

  if (result.violations.length > 0) {
    report(result.violations);
    return 1;
  }
  const summary =
    result.storyId !== null
      ? `every file is within Story ${result.storyId}'s allowed paths`
      : headRef.startsWith(PLANNING_BRANCH)
        ? `${headRef} passed the planning rule; no file is under packages/ or conformance/expectations/`
        : headRef.startsWith(BOT_BRANCH)
          ? `${headRef} passed the bot rules (path, identity, status-only values)`
          : `${headRef} is not a Story branch`;
  process.stdout.write(`Ownership OK: PR #${options.pr}: ${summary}.\n`);
  return 0;
}

const USAGE = [
  "Usage:",
  "  bun tools/ownership/ownership.ts manifests [--root <dir>]",
  "  bun tools/ownership/ownership.ts pr --repo <owner/name> --pr <n> [--root <dir>]",
].join("\n");

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "manifests") {
      return manifests(parseOptions(rest, new Set(["--root"])));
    }
    if (command === "pr") {
      return await pr(parseOptions(rest, new Set(["--repo", "--pr", "--root"])));
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    // Anything else (an unreadable manifest directory, an API failure) fails closed.
    process.stderr.write(`Ownership check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
