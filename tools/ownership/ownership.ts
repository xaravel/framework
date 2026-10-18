// The edit-ownership check (Story 1.5, AD-16, AD-21).
//
//   bun tools/ownership/ownership.ts manifests [--root <dir>]
//       validates every `stories/*.md` manifest and fails when two open Stories
//       list the same Test ID. When the root has
//       `_bmad-output/implementation-artifacts/sprint-status.yaml`, it is the
//       authority for whether a Story is open: a manifest with a `sprint_key`
//       takes its status from `development_status[<sprint_key>]`. Without that
//       file, or without a `sprint_key`, the manifest's own `status` is used.
//
//   bun tools/ownership/ownership.ts pr --repo <owner/name> --pr <n> [--root <dir>]
//       reads the PR's head branch and files from the GitHub API
//       (`GITHUB_API_URL`, default https://api.github.com; token from
//       `GH_TOKEN`) as data, and judges a `story/<id>` PR against the manifest
//       in the root (the base checkout), never the PR's copy
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Every violation kind the check reports, one line each, on stderr:
//
//   invalid manifest:    a manifest field is missing or malformed, naming the
//                        file and field
//   duplicate test id:   a Test ID listed by two or more open Stories (naming
//                        each), or twice inside one manifest
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
//   truncated file list: the API returned fewer files than the PR's
//                        `changed_files`; the check fails closed
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
//     AD-16's Expectations-`status`-only rule; the value-level half (only
//     `status` values change) needs the Expectations format and belongs to
//     Story 5.8. Unlike the planning rule, this allowlist matches
//     case-sensitively, and it also rejects any path with an empty, `.` or
//     `..` segment.
//   - Any other branch passes.
// Both rules check a renamed file's previous name and fail closed on a
// truncated file list.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GitHub, type PrFile } from "../protected-paths/protected-paths";

export const STORIES_DIR = "stories";

/** Repo-relative path of sprint status, the authority for whether a Story is open. */
export const SPRINT_STATUS = "_bmad-output/implementation-artifacts/sprint-status.yaml";

export const STATUSES = ["backlog", "ready-for-dev", "in-progress", "review", "done", "blocked"] as const;
export type Status = (typeof STATUSES)[number];

export interface Manifest {
  /** Repo-relative path, e.g. `stories/1.5.md`. */
  file: string;
  storyId: string;
  epic: number;
  component: string;
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

export interface OwnershipPrInput {
  /** The PR's `head.ref`. */
  headRef: string;
  files: readonly PrFile[];
  /** The PR's `changed_files` count. */
  changedFiles: number;
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
    ];
    return { storyId: null, outOfScope, violations };
  }
  if (!pr.headRef.startsWith(STORY_BRANCH)) {
    return { storyId: null, outOfScope: [], violations: [] };
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
  if (violations.length > 0) {
    report(violations);
    return 1;
  }
  const open = result.manifests.filter((manifest) => manifest.status !== "done").length;
  process.stdout.write(`Ownership OK: ${result.manifests.length} manifest(s) valid, ${open} open, no duplicate Test IDs.\n`);
  return 0;
}

async function pr(options: Options): Promise<number> {
  if (options.repo === null || options.pr === null) {
    throw new UsageError("pr needs --repo <owner/name> and --pr <n>");
  }
  const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  const token = process.env["GH_TOKEN"] || null;
  const github = new GitHub(api, options.repo, token);

  const pull = await github.json<{ head: { ref: string }; changed_files: number }>(`/pulls/${options.pr}`);
  const headRef = pull.head.ref;
  if (typeof headRef !== "string" || typeof pull.changed_files !== "number") {
    throw new Error(`GET /pulls/${options.pr}: missing head.ref or changed_files`);
  }
  const files = await github.paged<PrFile>(`/pulls/${options.pr}/files`);
  const result = evaluatePr(options.root, { headRef, files, changedFiles: pull.changed_files });

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
          ? `${headRef} passed the bot path rule (path-level only; Story 5.8 adds the status-only check); every file is under conformance/expectations/ or a conformance/escalations/ESC-bot-<n>.md`
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
