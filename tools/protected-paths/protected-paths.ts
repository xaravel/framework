// The protected-paths check (Story 1.4, AD-16).
//
//   bun tools/protected-paths/protected-paths.ts codeowners [--check] [--root <dir>]
//       rewrites `.github/CODEOWNERS` from `conformance/protected-paths`, or with
//       `--check` exits 1 when the committed file has drifted
//
//   bun tools/protected-paths/protected-paths.ts pr --repo <owner/name> --pr <n> [--root <dir>]
//       reads the PR's files and reviews from the GitHub API (`GITHUB_API_URL`,
//       default https://api.github.com; token from `GH_TOKEN`) as data, and
//       decides protection from the root's own list (the base checkout)
//
// Exit codes: 0 pass, 1 violations, 2 usage error. Every violation kind the
// check reports, one line each, on stderr:
//
//   protected path:      a PR file (or a renamed file's previous name) matches an
//                        active inclusion, and the Maintainer has not approved
//                        the head commit
//   truncated file list: the API returned fewer files than the PR's
//                        `changed_files`; the check fails closed
//   codeowners drift:    `.github/CODEOWNERS` is not the rendering of the list,
//                        naming the first differing line
//   missing list:        the head commit has no `conformance/protected-paths`
//
// List format: one CODEOWNERS-style pattern per line; `#` comments and blank
// lines are ignored; `!` marks an exclusion; a trailing ` after-phase:<n>` makes
// the entry active only once `decisions/PHASE-<n>-EXIT.md` exists.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The Maintainer, sole Code Owner of every Protected Path (AD-16). */
export const MAINTAINER = "@edanisko";

export const LIST_PATH = "conformance/protected-paths";
export const CODEOWNERS_PATH = ".github/CODEOWNERS";

export interface Entry {
  /** The CODEOWNERS pattern, without the `!` prefix or the `after-phase` marker. */
  pattern: string;
  exclude: boolean;
  /** The Phase whose exit activates the entry, or null when always active. */
  afterPhase: number | null;
}

export interface PrFile {
  filename: string;
  previous_filename?: string | null;
  status?: string;
}

export interface PrReview {
  user: { login: string } | null;
  state: string;
  commit_id: string | null;
}

export interface PrInput {
  files: readonly PrFile[];
  /** The PR's `changed_files` count. */
  changedFiles: number;
  reviews: readonly PrReview[];
  headSha: string;
}

export interface PrResult {
  /** Every protected file the PR touches, sorted. */
  protectedFiles: string[];
  /** Whether the Maintainer's latest decisive review approves the head commit. */
  approved: boolean;
  /** Empty when the check passes. */
  violations: string[];
}

/** The review states that decide approval; `COMMENTED` and `PENDING` do not. */
const DECISIVE_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parses the list. Throws on a malformed line. */
export function parseList(text: string): Entry[] {
  const entries: Entry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length > 2) {
      throw new Error(`${LIST_PATH}:${i + 1}: expected "<pattern>" or "<pattern> after-phase:<n>", got ${JSON.stringify(line)}`);
    }
    let afterPhase: number | null = null;
    if (parts.length === 2) {
      const match = /^after-phase:(\d+)$/.exec(parts[1]!);
      if (match === null) {
        throw new Error(`${LIST_PATH}:${i + 1}: unknown marker ${JSON.stringify(parts[1])}; only after-phase:<n> is allowed`);
      }
      afterPhase = Number(match[1]);
    }
    let pattern = parts[0]!;
    const exclude = pattern.startsWith("!");
    if (exclude) {
      pattern = pattern.slice(1);
    }
    if (pattern === "" || pattern === "/") {
      throw new Error(`${LIST_PATH}:${i + 1}: empty pattern`);
    }
    entries.push({ pattern, exclude, afterPhase });
  }
  return entries;
}

/** The Phases whose `decisions/PHASE-<n>-EXIT.md` exists under `root`. */
export function activePhases(root: string): Set<number> {
  const phases = new Set<number>();
  const dir = join(root, "decisions");
  if (!existsSync(dir)) {
    return phases;
  }
  for (const name of readdirSync(dir)) {
    const match = /^PHASE-(\d+)-EXIT\.md$/.exec(name);
    if (match !== null) {
      phases.add(Number(match[1]));
    }
  }
  return phases;
}

function isActive(entry: Entry, phases: ReadonlySet<number>): boolean {
  return entry.afterPhase === null || phases.has(entry.afterPhase);
}

const regexCache = new Map<string, RegExp>();

/** A CODEOWNERS pattern as a regular expression over a repo-relative path. */
function patternRegex(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  let body = pattern;
  const dirOnly = body.endsWith("/");
  if (dirOnly) {
    body = body.slice(0, -1);
  }
  // A leading `/`, or a `/` anywhere else, anchors the pattern at the root.
  const anchored = body.startsWith("/") || body.includes("/");
  if (body.startsWith("/")) {
    body = body.slice(1);
  }
  let source = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    if (char === "*" && body[i + 1] === "*") {
      if (body[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  const suffix = dirOnly ? "/.*$" : "(?:/.*)?$";
  const regex = new RegExp(prefix + source + suffix);
  regexCache.set(pattern, regex);
  return regex;
}

/** Whether `path` matches `pattern` under CODEOWNERS semantics. */
export function matches(pattern: string, path: string): boolean {
  return patternRegex(pattern).test(path.replace(/^\/+/, ""));
}

/** Whether the last active entry matching `path` is an inclusion. */
export function isProtected(entries: readonly Entry[], phases: ReadonlySet<number>, path: string): boolean {
  let result = false;
  for (const entry of entries) {
    if (isActive(entry, phases) && matches(entry.pattern, path)) {
      result = !entry.exclude;
    }
  }
  return result;
}

/** `.github/CODEOWNERS`, rendered from the active entries in list order. */
export function renderCodeowners(entries: readonly Entry[], phases: ReadonlySet<number>): string {
  const lines = [
    `# Generated from ${LIST_PATH} (AD-16). Do not edit by hand.`,
    "# Regenerate with: bun run protected-paths:codeowners",
    "# An entry with no owner leaves the path unowned.",
  ];
  for (const entry of entries) {
    if (isActive(entry, phases)) {
      lines.push(entry.exclude ? entry.pattern : `${entry.pattern} ${MAINTAINER}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** `[]` when `codeownersText` is the rendering of `listText`, else one violation naming the first differing line. */
export function checkMirror(listText: string, codeownersText: string, phases: ReadonlySet<number>): string[] {
  let expected: string;
  try {
    expected = renderCodeowners(parseList(listText), phases);
  } catch (error) {
    return [`codeowners drift: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (expected === codeownersText) {
    return [];
  }
  const lines = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
  const want = lines(expected);
  const have = lines(codeownersText);
  const fix = "run `bun run protected-paths:codeowners` (AD-16)";
  const length = Math.max(want.length, have.length);
  for (let i = 0; i < length; i++) {
    if (want[i] !== have[i]) {
      const show = (line: string | undefined): string => (line === undefined ? "end of file" : JSON.stringify(line));
      return [`codeowners drift: ${CODEOWNERS_PATH} line ${i + 1} is ${show(have[i])}, expected ${show(want[i])}; ${fix}`];
    }
  }
  return [`codeowners drift: ${CODEOWNERS_PATH} line ${have.length} must end with exactly one newline; ${fix}`];
}

function sameLogin(login: string, handle: string): boolean {
  return login.toLowerCase() === handle.replace(/^@/, "").toLowerCase();
}

/** Decides a PR from its files and reviews, given the base list. */
export function evaluatePr(entries: readonly Entry[], phases: ReadonlySet<number>, pr: PrInput): PrResult {
  const touched = new Set<string>();
  for (const file of pr.files) {
    for (const path of [file.filename, file.previous_filename ?? null]) {
      if (path !== null && isProtected(entries, phases, path)) {
        touched.add(path);
      }
    }
  }
  const protectedFiles = [...touched].sort(compare);

  // Reviews arrive in chronological order; the latest decisive one counts.
  let latest: PrReview | null = null;
  for (const review of pr.reviews) {
    if (review.user !== null && sameLogin(review.user.login, MAINTAINER) && DECISIVE_STATES.has(review.state)) {
      latest = review;
    }
  }
  const approved = latest !== null && latest.state === "APPROVED" && latest.commit_id === pr.headSha;

  const violations: string[] = [];
  if (pr.files.length < pr.changedFiles) {
    violations.push(
      `truncated file list: the API returned ${pr.files.length} of ${pr.changedFiles} changed files; failing closed (AD-16)`,
    );
  }
  if (protectedFiles.length > 0 && !approved) {
    const why =
      latest === null
        ? "no Maintainer review"
        : latest.state !== "APPROVED"
          ? `the Maintainer's latest review is ${latest.state}`
          : `the Maintainer approved ${latest.commit_id ?? "an unknown commit"}, not the head ${pr.headSha}`;
    for (const path of protectedFiles) {
      violations.push(
        `protected path: ${path} needs ${MAINTAINER}'s approving review on the head commit (${why}); re-run this check after approving (AD-16)`,
      );
    }
  }
  return { protectedFiles, approved, violations };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

interface Options {
  root: string;
  check: boolean;
  repo: string | null;
  pr: number | null;
}

function parseOptions(argv: readonly string[], allowed: ReadonlySet<string>): Options {
  const options: Options = { root: resolve(import.meta.dir, "..", ".."), check: false, repo: null, pr: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.has(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (arg === "--check") {
      options.check = true;
      continue;
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

function readList(root: string): Entry[] {
  return parseList(readFileSync(join(root, LIST_PATH), "utf8"));
}

function codeowners(options: Options): number {
  const listText = readFileSync(join(options.root, LIST_PATH), "utf8");
  const phases = activePhases(options.root);
  const target = join(options.root, CODEOWNERS_PATH);
  if (options.check) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    const violations = checkMirror(listText, current, phases);
    if (violations.length > 0) {
      process.stderr.write(`Protected Paths violations (AD-16):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`${CODEOWNERS_PATH} mirrors ${LIST_PATH}.\n`);
    return 0;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderCodeowners(parseList(listText), phases));
  process.stdout.write(`Wrote ${CODEOWNERS_PATH}.\n`);
  return 0;
}

export class GitHub {
  constructor(
    private readonly api: string,
    private readonly repo: string,
    private readonly token: string | null,
  ) {}

  private async request(path: string, accept: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      "User-Agent": "xaravel-protected-paths",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token !== null) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return fetch(`${this.api}/repos/${this.repo}${path}`, { headers });
  }

  async json<T>(path: string): Promise<T> {
    const response = await this.request(path, "application/vnd.github+json");
    if (!response.ok) {
      throw new Error(`GET ${path}: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async paged<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.json<T[]>(`${path}?per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) {
        return items;
      }
    }
  }

  /** A file's raw content at `ref`, or null when the contents API answers 404. */
  async contents(path: string, ref: string): Promise<string | null> {
    const response = await this.request(`/contents/${path}?ref=${encodeURIComponent(ref)}`, "application/vnd.github.raw+json");
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`GET contents ${path}@${ref}: HTTP ${response.status}`);
    }
    return response.text();
  }
}

async function pr(options: Options): Promise<number> {
  if (options.repo === null || options.pr === null) {
    throw new UsageError("pr needs --repo <owner/name> and --pr <n>");
  }
  const entries = readList(options.root);
  const phases = activePhases(options.root);
  const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
  const token = process.env["GH_TOKEN"] || null;
  const github = new GitHub(api, options.repo, token);

  const pull = await github.json<{ head: { sha: string }; changed_files: number }>(`/pulls/${options.pr}`);
  const headSha = pull.head.sha;
  const [files, reviews, headList, headCodeowners, headExit] = await Promise.all([
    github.paged<PrFile>(`/pulls/${options.pr}/files`),
    github.paged<PrReview>(`/pulls/${options.pr}/reviews`),
    github.contents(LIST_PATH, headSha),
    github.contents(CODEOWNERS_PATH, headSha),
    github.contents("decisions/PHASE-1-EXIT.md", headSha),
  ]);

  const result = evaluatePr(entries, phases, { files, changedFiles: pull.changed_files, reviews, headSha });
  const violations = [...result.violations];
  if (headList === null) {
    violations.push(`missing list: the head commit ${headSha} has no ${LIST_PATH} (AD-16)`);
  } else {
    violations.push(...checkMirror(headList, headCodeowners ?? "", headExit === null ? new Set() : new Set([1])));
  }

  if (violations.length > 0) {
    process.stderr.write(`Protected Paths violations (AD-16):\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
    return 1;
  }
  const summary =
    result.protectedFiles.length === 0
      ? "touches no Protected Path"
      : `touches ${result.protectedFiles.length} Protected Path(s), approved by ${MAINTAINER} on ${headSha}`;
  process.stdout.write(`Protected Paths OK: PR #${options.pr} ${summary}.\n`);
  return 0;
}

const USAGE = [
  "Usage:",
  "  bun tools/protected-paths/protected-paths.ts codeowners [--check] [--root <dir>]",
  "  bun tools/protected-paths/protected-paths.ts pr --repo <owner/name> --pr <n> [--root <dir>]",
].join("\n");

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "codeowners") {
      return codeowners(parseOptions(rest, new Set(["--check", "--root"])));
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
    // Anything else (an unreadable list, an API failure) fails closed.
    process.stderr.write(`Protected Paths check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
