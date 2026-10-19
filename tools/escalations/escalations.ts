// Escalation and decision records (Story 1.6, AD-16, FR-114).
//
//   bun tools/escalations/escalations.ts check [--root <dir>]
//       validates every `conformance/escalations/ESC-*.md` and
//       `decisions/ESC-*.md` in the root (either directory may be absent);
//       on a pass it then prints, on stdout after the OK line, one
//       `warning: open escalation:` line per `ESC-<story-id>-<n>` with no
//       decision file (an invalid or stale decision is a violation, so it
//       exits 1 before any warning) whose Story is done: its manifest
//       `stories/<story-id>.md` is valid and its status, taken from sprint
//       status through `sprint_key` as `ownership:check` does, is `done`.
//       Lines are sorted by file name, so outstanding rulings reach the
//       Maintainer; warnings never change the exit code, and `pr` prints none
//
//   bun tools/escalations/escalations.ts pr --repo <owner/name> --pr <n> [--root <dir>]
//       reads the PR's head branch, head commit and files from the GitHub API
//       (`GITHUB_API_URL`, default https://api.github.com; token from
//       `GH_TOKEN`) as data, checks each added or changed Escalation file
//       belongs to the PR's branch, and validates every added or changed
//       Escalation and decision file's content at the head commit; for each
//       changed Escalation it also reads `decisions/<id>.md` at the head commit
//       and, when one exists, checks it is still bound to that Escalation;
//       for each added or changed `ESC-<story-id>-<n>` it checks every
//       `test_ids` entry is in that Story's manifest `stories/<story-id>.md`
//       read from the root (the base checkout, default the repo root), never
//       the PR's copy, so a PR cannot widen its own Story's Test IDs to pass;
//       `--root` (or, by default, the checkout this script runs from) must be
//       the base branch, as the workflow's base-commit checkout is
//
//   bun tools/escalations/escalations.ts digest <id> [--root <dir>]
//       prints the `escalation_sha256` value a decision on Escalation <id>
//       must carry (exit 1 when the Escalation file does not exist, 2 when the
//       ID is malformed)
//
// A decision file `decisions/ESC-<id>.md` carries `decision: approved |
// rejected`, a rationale body, and `escalation_sha256:`, the lowercase hex
// SHA-256 of the Escalation file's text (CRLF normalised to LF) it rules on.
// The digest binds the ruling to that exact text: once the Escalation file
// changes, the decision is stale and the Escalation counts as open again until
// a new decision (a Protected Path change) re-binds it.
//
// Library: `escalationStatus(id, root?)` answers "open", "approved" or
// "rejected" (open when the decision is missing, invalid or stale), and throws on a malformed or unknown ID (callers fail closed).
// `openEscalationWarnings(root)` returns the warning lines `check` prints; on
// its own it also counts an Escalation with an invalid or stale decision as open.
//
// Exit codes: 0 pass (with or without warnings), 1 violations or any failure (fail closed), 2 usage error.
// Every violation kind the check reports, one line each, on stderr:
//
//   invalid escalation:  an Escalation file name or frontmatter field is
//                        missing or malformed, naming the file and field
//   invalid decision:    a decision file name, its `decision` or
//                        `escalation_sha256` field or its rationale is missing
//                        or malformed
//   stale decision:      a valid decision's `escalation_sha256` does not match
//                        the current content of the Escalation it rules on
//                        (in the root for `check`, at the head commit for `pr`)
//   orphan decision:     `decisions/ESC-<id>.md` has no matching Escalation file
//                        (in the root for `check`, at the head commit for `pr`)
//   wrong story:         a PR adds or changes an Escalation whose ID does not
//                        belong to its branch (`story/<id>` raises
//                        `ESC-<id>-<n>`, `bot/*` raises `ESC-bot-<n>`, any other
//                        branch raises none)
//   missing head file:   a PR file could not be read at the head commit
//   missing manifest:    a PR adds or changes `ESC-<story-id>-<n>` but the
//                        base checkout has no valid `stories/<story-id>.md`
//                        (`pr` only; the check fails closed)
//   unowned test id:     a PR adds or changes `ESC-<story-id>-<n>` listing a
//                        Test ID outside that Story's base manifest `test_ids`
//                        and `xaravel_test_ids` (`pr` only: `check` does not
//                        re-judge merged records, whose manifests may change)
//   truncated file list: the API returned fewer files than the PR's
//                        `changed_files`; the check fails closed
//
// Escalation IDs are `ESC-<story-id>-<n>` or `ESC-bot-<n>`, with `<n>` a
// positive integer without leading zeros. `trigger` takes one slug per FR-114
// trigger, in FR-114 order:
//
//   divergence           a new or changed divergence (DIV) is needed
//   protected-path       a Protected Path change is needed
//   upstream-test-wrong  an Upstream test looks wrong but the Oracle passes it
//   flaky                the test is inconsistent over 3 runs (Quarantine)
//   php-only             a `php-only` skip is proposed
//   open-question        an open question (PRD §9) blocks the work
//   contract             a contract is missing or changed after Phase 1
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applySprintStatus, type Manifest, parseManifest, STORIES_DIR } from "../ownership/ownership";
import { GitHub, type PrFile } from "../protected-paths/protected-paths";

export const ESCALATIONS_DIR = "conformance/escalations";
export const DECISIONS_DIR = "decisions";

export const TRIGGERS = ["divergence", "protected-path", "upstream-test-wrong", "flaky", "php-only", "open-question", "contract"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const DECISIONS = ["approved", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];

export type EscalationStatus = "open" | Decision;

export interface EscalationId {
  id: string;
  /** The Story ID, or null for a bot-raised `ESC-bot-<n>`. */
  storyId: string | null;
  n: number;
}

export interface Escalation {
  /** Repo-relative path, e.g. `conformance/escalations/ESC-9.1-1.md`. */
  file: string;
  id: EscalationId;
  testIds: string[];
  trigger: Trigger;
  proposed: string;
  evidence: string;
}

export interface EscalationResult {
  /** Null when any violation was found. */
  escalation: Escalation | null;
  violations: string[];
}

export interface DecisionRecord {
  /** Repo-relative path, e.g. `decisions/ESC-9.1-1.md`. */
  file: string;
  id: EscalationId;
  decision: Decision;
  /** The `escalation_sha256` field: the digest of the Escalation text this decision rules on. */
  digest: string;
}

export interface DecisionResult {
  /** Null when any violation was found. */
  decision: DecisionRecord | null;
  violations: string[];
}

export interface EscalationsPrInput {
  /** The base checkout, whose `stories/<story-id>.md` manifests own each Escalation's Test IDs. */
  root: string;
  /** The PR's `head.ref`. */
  headRef: string;
  files: readonly PrFile[];
  /** The PR's `changed_files` count. */
  changedFiles: number;
  /** Head-commit content of each fetched path; null when the API had none. */
  contents: ReadonlyMap<string, string | null>;
}

export interface EscalationsPrResult {
  /** Every path the check fetched and judged, sorted. */
  judged: string[];
  /** Empty when the check passes. */
  violations: string[];
}

const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;
const ESCALATION_ID = /^ESC-(?:([1-9]\d*\.[1-9]\d*)|bot)-([1-9]\d*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
const STORY_BRANCH = "story/";
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

function stemOf(file: string): string {
  return (file.split("/").pop() ?? file).replace(/\.md$/, "");
}

/** Splits `text` into its `---`-fenced YAML frontmatter and the body after it, or null when there is none. */
function frontmatter(text: string): { block: string; body: string } | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  const end = lines.indexOf("---", 1);
  return end === -1 ? null : { block: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

/** Parses the frontmatter mapping, or reports why it can't. */
function mapping(text: string, bad: (field: string, problem: string) => string): { fields: Record<string, unknown>; body: string } | string {
  const parts = frontmatter(text);
  if (parts === null) {
    return bad("frontmatter", "is missing; expected a ---fenced YAML block at the top");
  }
  let data: unknown;
  try {
    data = Bun.YAML.parse(parts.block);
  } catch (error) {
    return bad("frontmatter", `is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return bad("frontmatter", "must be a YAML mapping");
  }
  return { fields: data as Record<string, unknown>, body: parts.body };
}

/** Parses `ESC-<story-id>-<n>` or `ESC-bot-<n>`; null when `id` is neither. */
export function parseEscalationId(id: string): EscalationId | null {
  const match = ESCALATION_ID.exec(id);
  if (match === null) {
    return null;
  }
  return { id, storyId: match[1] ?? null, n: Number(match[2]) };
}

const NAME_PROBLEM = "must be ESC-<story-id>-<n>.md or ESC-bot-<n>.md, with <n> a positive integer without leading zeros";

/** Parses and validates one Escalation file; `file` is its repo-relative path. */
export function parseEscalation(file: string, text: string): EscalationResult {
  const bad = (field: string, problem: string): string => `invalid escalation: ${file}: ${field} ${problem} (AD-16)`;
  const violations: string[] = [];
  const stem = stemOf(file);
  const id = file.endsWith(".md") ? parseEscalationId(stem) : null;
  if (id === null) {
    violations.push(bad("file name", `${NAME_PROBLEM}, got ${JSON.stringify(file.split("/").pop() ?? file)}`));
  }
  const parsed = mapping(text, bad);
  if (typeof parsed === "string") {
    return { escalation: null, violations: [...violations, parsed] };
  }
  const { fields } = parsed;

  const testIds = fields["test_ids"];
  const testIdsOk =
    Array.isArray(testIds) &&
    testIds.length > 0 &&
    testIds.every((item) => typeof item === "string" && item.trim() !== "" && item.trim() === item);
  if (!testIdsOk) {
    violations.push(bad("test_ids", `must be a non-empty list of non-empty strings without surrounding whitespace, ${describe(testIds)}`));
  }

  const trigger = fields["trigger"];
  if (typeof trigger !== "string" || !(TRIGGERS as readonly string[]).includes(trigger)) {
    violations.push(bad("trigger", `must be one of ${TRIGGERS.join(", ")} (FR-114), ${describe(trigger)}`));
  }

  for (const field of ["proposed", "evidence"] as const) {
    const value = fields[field];
    if (typeof value !== "string" || value.trim() === "") {
      violations.push(bad(field, `must be a non-empty string, ${describe(value)}`));
    }
  }

  if (violations.length > 0 || id === null) {
    return { escalation: null, violations };
  }
  return {
    escalation: {
      file,
      id,
      testIds: testIds as string[],
      trigger: trigger as Trigger,
      proposed: fields["proposed"] as string,
      evidence: fields["evidence"] as string,
    },
    violations: [],
  };
}

/** The lowercase hex SHA-256 of an Escalation file's text, with CRLF normalised to LF: a decision's `escalation_sha256`. */
export function escalationDigest(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** The `stale decision:` violation for `decision` when it is not bound to `escalationText` (at `escalationFile`), or null when it is. */
function staleDecision(decision: DecisionRecord, escalationFile: string, escalationText: string): string | null {
  const actual = escalationDigest(escalationText);
  return decision.digest === actual
    ? null
    : `stale decision: ${decision.file}: escalation_sha256 ${decision.digest} does not match ${escalationFile} (sha256 ${actual}); the Escalation changed after its ruling, so it counts as open until a new decision re-binds it (AD-16)`;
}

/** Whether `line` is a Markdown ATX heading. */
function isHeading(line: string): boolean {
  return /^ {0,3}#{1,6}(?:\s|$)/.test(line);
}

/** Parses and validates one decision file; `file` is its repo-relative path. */
export function parseDecision(file: string, text: string): DecisionResult {
  const bad = (field: string, problem: string): string => `invalid decision: ${file}: ${field} ${problem} (AD-16)`;
  const violations: string[] = [];
  const id = file.endsWith(".md") ? parseEscalationId(stemOf(file)) : null;
  if (id === null) {
    violations.push(bad("file name", `${NAME_PROBLEM}, got ${JSON.stringify(file.split("/").pop() ?? file)}`));
  }
  const parsed = mapping(text, bad);
  if (typeof parsed === "string") {
    return { decision: null, violations: [...violations, parsed] };
  }
  const decision = parsed.fields["decision"];
  if (typeof decision !== "string" || !(DECISIONS as readonly string[]).includes(decision)) {
    violations.push(bad("decision", `must be one of ${DECISIONS.join(", ")}, ${describe(decision)}`));
  }
  const digest = parsed.fields["escalation_sha256"];
  if (typeof digest !== "string" || !DIGEST.test(digest)) {
    violations.push(
      bad("escalation_sha256", `must be the 64 lowercase hex character SHA-256 of the Escalation file, as a quoted string (\`digest <id>\` prints it), ${describe(digest)}`),
    );
  }
  if (!parsed.body.split("\n").some((line) => line.trim() !== "" && !isHeading(line))) {
    violations.push(bad("rationale", "is missing; the body after the frontmatter needs at least one line that is neither blank nor a heading"));
  }
  if (violations.length > 0 || id === null) {
    return { decision: null, violations };
  }
  return { decision: { file, id, decision: decision as Decision, digest: digest as string }, violations: [] };
}

function repoRoot(): string {
  return resolve(import.meta.dir, "..", "..");
}

/**
 * The status of Escalation `id` under `root`: `approved` or `rejected` once
 * `decisions/<id>.md` exists, validates and its `escalation_sha256` matches
 * the Escalation file's current content, otherwise `open`. Throws on a
 * malformed ID, or when the Escalation file does not exist (even if a decision
 * file does), so callers fail closed on an unknown Escalation.
 */
export function escalationStatus(id: string, root: string = repoRoot()): EscalationStatus {
  if (parseEscalationId(id) === null) {
    throw new Error(`malformed Escalation ID ${JSON.stringify(id)}; expected ESC-<story-id>-<n> or ESC-bot-<n> (AD-16)`);
  }
  const escalationPath = join(root, ESCALATIONS_DIR, `${id}.md`);
  const decisionPath = join(root, DECISIONS_DIR, `${id}.md`);
  if (!existsSync(escalationPath)) {
    // A decision with no Escalation behind it (an orphan) does not count.
    throw new Error(`unknown Escalation ${id}: ${ESCALATIONS_DIR}/${id}.md does not exist (AD-16)`);
  }
  return decisionStatus(id, readFileSync(escalationPath, "utf8"), existsSync(decisionPath) ? readFileSync(decisionPath, "utf8") : null);
}

/**
 * The status the decision text `decisionText` (null when `decisions/<id>.md` does not exist) gives the Escalation
 * `id` whose text is `escalationText`: `approved` or `rejected` when the decision validates and its
 * `escalation_sha256` binds it to that exact text, otherwise `open`. Pure, so a caller can judge an Escalation that
 * exists only in a PR head against the base's decision (Story 5.6).
 */
export function decisionStatus(id: string, escalationText: string, decisionText: string | null): EscalationStatus {
  if (decisionText === null) {
    return "open";
  }
  const parsed = parseDecision(`${DECISIONS_DIR}/${id}.md`, decisionText);
  if (parsed.decision === null || parsed.decision.id.id !== id) {
    return "open";
  }
  // A decision on different Escalation text (a stale one) does not decide.
  const stale = staleDecision(parsed.decision, `${ESCALATIONS_DIR}/${id}.md`, escalationText);
  return stale === null ? parsed.decision.decision : "open";
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort(compare);
}

/** Validates every Escalation and Escalation decision under `root`. */
export function checkRecords(root: string): { escalations: number; decisions: number; violations: string[] } {
  const violations: string[] = [];
  const escalationNames = markdownFiles(join(root, ESCALATIONS_DIR));
  for (const name of escalationNames) {
    const file = `${ESCALATIONS_DIR}/${name}`;
    violations.push(...parseEscalation(file, readFileSync(join(root, file), "utf8")).violations);
  }
  const known = new Set(escalationNames);
  const decisionNames = markdownFiles(join(root, DECISIONS_DIR)).filter((name) => name.startsWith("ESC-"));
  for (const name of decisionNames) {
    const file = `${DECISIONS_DIR}/${name}`;
    const parsed = parseDecision(file, readFileSync(join(root, file), "utf8"));
    violations.push(...parsed.violations);
    if (parseEscalationId(stemOf(name)) !== null && !known.has(name)) {
      violations.push(`orphan decision: ${file} has no ${ESCALATIONS_DIR}/${name} (AD-16)`);
    } else if (parsed.decision !== null) {
      const escalationFile = `${ESCALATIONS_DIR}/${name}`;
      const stale = staleDecision(parsed.decision, escalationFile, readFileSync(join(root, escalationFile), "utf8"));
      if (stale !== null) {
        violations.push(stale);
      }
    }
  }
  return { escalations: escalationNames.length, decisions: decisionNames.length, violations };
}

/**
 * One `warning: open escalation:` line per `ESC-<story-id>-<n>` under `root`
 * that is open (no, an invalid or a stale decision) while its Story manifest
 * `stories/<story-id>.md` is valid and done, sorted by file name. "Done" is
 * the status after `applySprintStatus`, so sprint status decides it through
 * `sprint_key` as `ownership:check` does. A bot Escalation, or one whose
 * manifest is missing, invalid or not done, gives no line (`ownership:check`
 * owns manifest and sprint status validity).
 */
export function openEscalationWarnings(root: string): string[] {
  const warnings: string[] = [];
  for (const name of markdownFiles(join(root, ESCALATIONS_DIR))) {
    const id = parseEscalationId(stemOf(name));
    if (id === null || id.storyId === null || escalationStatus(id.id, root) !== "open") {
      continue;
    }
    const manifestFile = `${STORIES_DIR}/${id.storyId}.md`;
    const manifestPath = join(root, manifestFile);
    const manifest = existsSync(manifestPath) ? parseManifest(manifestFile, readFileSync(manifestPath, "utf8")).manifest : null;
    if (manifest === null || applySprintStatus(root, [manifest]).manifests[0]?.status !== "done") {
      continue;
    }
    warnings.push(
      `warning: open escalation: ${ESCALATIONS_DIR}/${name} has no ruling, but Story ${id.storyId} (${manifestFile}) is done; it waits on the Maintainer (AD-16)`,
    );
  }
  return warnings;
}

/** The repo paths the `pr` check must fetch at the head commit: non-removed Escalation and Escalation decision files. */
export function prPaths(files: readonly PrFile[]): { escalations: string[]; decisions: string[] } {
  const escalations: string[] = [];
  const decisions: string[] = [];
  for (const prFile of files) {
    if (prFile.status === "removed") {
      continue;
    }
    const path = prFile.filename;
    if (path.startsWith(`${ESCALATIONS_DIR}/`)) {
      escalations.push(path);
    } else if (path.startsWith(`${DECISIONS_DIR}/ESC-`) && path.endsWith(".md")) {
      decisions.push(path);
    }
  }
  return { escalations: escalations.sort(compare), decisions: decisions.sort(compare) };
}

/** The Escalation file a decision path rules on, or null when the decision's name is not a valid ID. */
function escalationFor(decisionPath: string): string | null {
  const rest = decisionPath.slice(DECISIONS_DIR.length + 1);
  return !rest.includes("/") && parseEscalationId(stemOf(rest)) !== null ? `${ESCALATIONS_DIR}/${rest}` : null;
}

/** The decision path ruling on an Escalation path, or null when the Escalation's name is not a valid ID. */
function decisionFor(escalationPath: string): string | null {
  const rest = escalationPath.slice(ESCALATIONS_DIR.length + 1);
  return !rest.includes("/") && rest.endsWith(".md") && parseEscalationId(stemOf(rest)) !== null ? `${DECISIONS_DIR}/${rest}` : null;
}

/**
 * The paths whose head content `evaluatePr` needs: the Escalation behind each
 * decision, and the decision (which may not exist) on each Escalation.
 */
export function pathsToFetch(files: readonly PrFile[]): string[] {
  const { escalations, decisions } = prPaths(files);
  const fetch = new Set<string>();
  for (const path of escalations) {
    const decision = decisionFor(path);
    if (decision !== null) {
      fetch.add(path);
      fetch.add(decision);
    }
  }
  for (const path of decisions) {
    fetch.add(path);
    const escalation = escalationFor(path);
    if (escalation !== null) {
      fetch.add(escalation);
    }
  }
  return [...fetch].sort(compare);
}

/** Decides a PR from its head branch, files and the head content of `pathsToFetch(files)`. */
export function evaluatePr(pr: EscalationsPrInput): EscalationsPrResult {
  const violations: string[] = [];
  if (pr.files.length < pr.changedFiles) {
    violations.push(`truncated file list: the API returned ${pr.files.length} of ${pr.changedFiles} changed files; failing closed (AD-16)`);
  }
  let branchStory: string | null | undefined;
  if (pr.headRef.startsWith(STORY_BRANCH)) {
    const id = pr.headRef.slice(STORY_BRANCH.length);
    branchStory = STORY_ID.test(id) ? id : undefined;
  } else if (pr.headRef.startsWith(BOT_BRANCH)) {
    branchStory = null;
  }

  const judged: string[] = [];
  const content = (path: string): string | null => {
    const text = pr.contents.get(path) ?? null;
    if (text === null) {
      violations.push(`missing head file: ${path} could not be read at the PR's head commit; failing closed (AD-16)`);
    } else {
      judged.push(path);
    }
    return text;
  };

  // Base-checkout manifests by Story ID: the manifest, or why there is none (a
  // `missing manifest:` line's ending).
  const manifests = new Map<string, Manifest | string>();
  const manifestFor = (storyId: string): Manifest | string => {
    const cached = manifests.get(storyId);
    if (cached !== undefined) {
      return cached;
    }
    const file = `${STORIES_DIR}/${storyId}.md`;
    const full = join(pr.root, file);
    let found: Manifest | string;
    if (!existsSync(full)) {
      found = `which has no ${file} on the base branch (AD-16)`;
    } else {
      const parsed = parseManifest(file, readFileSync(full, "utf8"));
      found = parsed.manifest ?? `whose ${file} on the base branch is invalid: ${parsed.violations[0] ?? "unknown error (AD-16)"}`;
    }
    manifests.set(storyId, found);
    return found;
  };

  const { escalations, decisions } = prPaths(pr.files);
  // Decisions the PR changes are judged (once) in the decisions loop below.
  const decided = new Set(decisions);
  for (const path of escalations) {
    const rest = path.slice(ESCALATIONS_DIR.length + 1);
    const id = !rest.includes("/") && rest.endsWith(".md") ? parseEscalationId(stemOf(rest)) : null;
    if (id === null) {
      violations.push(`invalid escalation: ${path}: file name ${NAME_PROBLEM}, got ${JSON.stringify(rest)} (AD-16)`);
      continue;
    }
    if (branchStory === undefined || branchStory !== id.storyId) {
      const expected =
        branchStory === undefined
          ? `branch ${pr.headRef} is neither story/<story-id> nor bot/*, so it may raise no Escalation`
          : branchStory === null
            ? `bot branch ${pr.headRef} may raise only ESC-bot-<n>`
            : `branch ${pr.headRef} may raise only ESC-${branchStory}-<n>`;
      violations.push(`wrong story: ${path}: ${expected} (AD-16)`);
    }
    const text = content(path);
    const parsedEscalation = text === null ? null : parseEscalation(path, text);
    if (parsedEscalation !== null) {
      violations.push(...parsedEscalation.violations);
    }
    // A Story may escalate only the Test IDs its base manifest owns; a bot
    // Escalation has no raising Story.
    const raised = parsedEscalation?.escalation ?? null;
    if (raised !== null && raised.id.storyId !== null) {
      const storyId = raised.id.storyId;
      const manifest = manifestFor(storyId);
      if (typeof manifest === "string") {
        violations.push(`missing manifest: ${path}: Escalation ${raised.id.id} is raised by Story ${storyId}, ${manifest}`);
      } else {
        const owned = new Set([...manifest.testIds, ...manifest.xaravelTestIds]);
        for (const testId of new Set(raised.testIds)) {
          if (!owned.has(testId)) {
            violations.push(
              `unowned test id: ${path}: ${testId} is not in Story ${storyId}'s test_ids or xaravel_test_ids (${manifest.file} on the base branch) (AD-16)`,
            );
          }
        }
      }
    }
    // A changed Escalation that already has a decision at head must still be
    // the text that decision rules on. No decision at head: nothing to bind.
    const decisionPath = decisionFor(path);
    const decisionText = decisionPath === null ? null : (pr.contents.get(decisionPath) ?? null);
    if (decisionPath !== null && decisionText !== null && !decided.has(decisionPath)) {
      judged.push(decisionPath);
      const parsed = parseDecision(decisionPath, decisionText);
      violations.push(...parsed.violations);
      const stale = parsed.decision === null || text === null ? null : staleDecision(parsed.decision, path, text);
      if (stale !== null) {
        violations.push(stale);
      }
    }
  }
  for (const path of decisions) {
    const text = content(path);
    const parsed = text === null ? null : parseDecision(path, text);
    if (parsed !== null) {
      violations.push(...parsed.violations);
    }
    const escalation = escalationFor(path);
    const escalationText = escalation === null ? null : (pr.contents.get(escalation) ?? null);
    if (escalation !== null && escalationText === null) {
      violations.push(`orphan decision: ${path} has no ${escalation} (AD-16)`);
    } else if (escalation !== null && escalationText !== null && parsed !== null && parsed.decision !== null) {
      const stale = staleDecision(parsed.decision, escalation, escalationText);
      if (stale !== null) {
        violations.push(stale);
      }
    }
  }
  return { judged: judged.sort(compare), violations };
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
  const options: Options = { root: repoRoot(), repo: null, pr: null };
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
  process.stderr.write(`Escalation violations (AD-16):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
}

function check(options: Options): number {
  const result = checkRecords(options.root);
  if (result.violations.length > 0) {
    report(result.violations);
    return 1;
  }
  process.stdout.write(`Escalations OK: ${result.escalations} escalation(s) and ${result.decisions} decision(s) valid.\n`);
  for (const warning of openEscalationWarnings(options.root)) {
    process.stdout.write(`${warning}\n`);
  }
  return 0;
}

async function pr(options: Options): Promise<number> {
  if (options.repo === null || options.pr === null) {
    throw new UsageError("pr needs --repo <owner/name> and --pr <n>");
  }
  const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  const token = process.env["GH_TOKEN"] || null;
  const github = new GitHub(api, options.repo, token);

  const pull = await github.json<{ head: { ref: string; sha: string }; changed_files: number }>(`/pulls/${options.pr}`);
  const headRef = pull.head?.ref;
  const headSha = pull.head?.sha;
  if (typeof headRef !== "string" || typeof headSha !== "string" || typeof pull.changed_files !== "number") {
    throw new Error(`GET /pulls/${options.pr}: missing head.ref, head.sha or changed_files`);
  }
  const files = await github.paged<PrFile>(`/pulls/${options.pr}/files`);
  const paths = pathsToFetch(files);
  const fetched = await Promise.all(paths.map(async (path) => [path, await github.contents(path, headSha)] as const));
  const result = evaluatePr({ root: options.root, headRef, files, changedFiles: pull.changed_files, contents: new Map(fetched) });

  if (result.violations.length > 0) {
    report(result.violations);
    return 1;
  }
  process.stdout.write(`Escalations OK: PR #${options.pr}: ${result.judged.length} escalation/decision file(s) valid.\n`);
  return 0;
}

function digest(id: string | undefined, options: Options): number {
  if (id === undefined || id.startsWith("--")) {
    throw new UsageError("digest needs an Escalation ID");
  }
  if (parseEscalationId(id) === null) {
    throw new UsageError(`malformed Escalation ID ${JSON.stringify(id)}; expected ESC-<story-id>-<n> or ESC-bot-<n>`);
  }
  const file = `${ESCALATIONS_DIR}/${id}.md`;
  const path = join(options.root, file);
  if (!existsSync(path)) {
    throw new Error(`unknown Escalation ${id}: ${file} does not exist (AD-16)`);
  }
  process.stdout.write(`${escalationDigest(readFileSync(path, "utf8"))}\n`);
  return 0;
}

const USAGE = [
  "Usage:",
  "  bun tools/escalations/escalations.ts check [--root <dir>]",
  "  bun tools/escalations/escalations.ts pr --repo <owner/name> --pr <n> [--root <dir>]",
  "  bun tools/escalations/escalations.ts digest <id> [--root <dir>]",
].join("\n");

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "check") {
      return check(parseOptions(rest, new Set(["--root"])));
    }
    if (command === "pr") {
      return await pr(parseOptions(rest, new Set(["--repo", "--pr", "--root"])));
    }
    if (command === "digest") {
      const [id, ...flags] = rest;
      return digest(id, parseOptions(flags, new Set(["--root"])));
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    // Anything else (an unreadable directory, an API failure) fails closed.
    process.stderr.write(`Escalation check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
