// The conformance history (Story 7.1; FR-5.4, FR-5.5).
//
//   bun --no-env-file tools/conformance-report/history.ts [--root <dir>] [--report <file>]
//       [--remote <remote>] [--branch <branch>] [--main-branch <branch>]
//       [--history-out <file>]
//       (`bun run conformance:history`, run by `.github/workflows/dashboard.yml`
//       after `conformance:report` on every push to main) appends one record
//       built from `report.json` (default `<root>/.cache/conformance/report.json`)
//       to `history.jsonl` on `--branch` (default `dashboard-data`) of
//       `--remote` (default `origin`), and pushes it. `--history-out` writes
//       the branch's full `history.jsonl` after the append (or as it already
//       is when the record is already there) to `<file>`, for the dashboard
//       site build (Story 7.2).
//
// A record is `{"commit","pin":{"tag","commit"},"phase","inventory":{"ids",
// "sha256"},"overall":{"pairs","passing"},"alpha":{"applicable","passing"},
// "components":{<c>:{"pairs","passing"}}}`, one JSON line, keyed by (commit,
// pin). `phase` and `inventory` (the report's current Phase and Inventory
// hash) feed the SM-1 target check (target.ts) and the dashboard's Inventory
// diff between Pin series; lines written before they existed lack both and
// stay valid. Appending a key already present is a no-op (`already recorded`,
// exit 0). This is the only place the data-branch mechanics live:
//
// - The branch is fetched from the remote into the local ref
//   `refs/xaravel-history/<branch>` (FETCH_HEAD is not written); when the
//   remote has no such branch, an orphan commit holding only `history.jsonl`
//   creates it.
// - The source guard (`checkSource`, shared with publish.ts) runs on every
//   attempt, after the fetch and before any commit is built: the report's
//   commit must be the `commit` of the last line of `history.jsonl`, a
//   descendant of it (`git merge-base --is-ancestor`), or the current tip of
//   `--main-branch` (default `main`) on the remote (`git ls-remote`, looked up
//   only when the ancestry test fails). Otherwise, e.g. a re-run of an older
//   dashboard run, it refuses (`refusing <source>: …`, exit 1) and pushes
//   nothing. An empty or missing history accepts any commit.
// - The new commit is built with git plumbing (`hash-object`, a temporary
//   index file, `write-tree`, `commit-tree`), so the caller's HEAD, index and
//   working tree are never touched. It is authored by github-actions[bot].
// - The push is a fast-forward of the branch (never forced). A non-fast-forward
//   rejection refetches and re-appends, up to 3 retries.
//
// `git`, `gitOk`, `fetchTip`, `checkSource`, `BOT` and `readReport` are exported for the
// site publish (publish.ts) and the site build (site.ts), Story 7.2.
//
// Exit codes: 0 ok (appended, created or already recorded), 1 data or git
// error or a refused source commit, 2 usage error.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { compareUnits } from "../inventory/inventory";
import { DEFAULT_OUT, type Report } from "./report";

export const DEFAULT_REMOTE = "origin";
export const DEFAULT_BRANCH = "dashboard-data";
export const DEFAULT_MAIN_BRANCH = "main";
export const HISTORY_FILE = "history.jsonl";
/** Retries after a non-fast-forward rejection. */
export const PUSH_RETRIES = 3;
export const BOT = { name: "github-actions[bot]", email: "41898599+github-actions[bot]@users.noreply.github.com" };

export interface HistoryRecord {
  commit: string;
  pin: { tag: string; commit: string };
  /** The Phase at the commit; absent on lines written before it was recorded. */
  phase?: number;
  /** The Inventory's Test ID count and hash; absent on lines written before it was recorded. */
  inventory?: { ids: number; sha256: string };
  overall: { pairs: number; passing: number };
  alpha: { applicable: number; passing: number };
  components: Record<string, { pairs: number; passing: number }>;
}

export interface AppendResult {
  outcome: "created" | "appended" | "already recorded";
  /** The branch tip after the run. */
  tip: string;
  /** Push attempts made (0 when already recorded). */
  attempts: number;
  /** The branch's full `history.jsonl` after the run. */
  content: string;
}

/** A data or git error: the CLI exits 1. */
export class HistoryError extends Error {}

/** The history record of `report`, keys in the fixed order; throws when the report has no commit. */
export function historyRecord(report: Report): HistoryRecord {
  if (typeof report.commit !== "string" || report.commit === "") {
    throw new HistoryError("report.json has no commit (it was computed outside git)");
  }
  const components: Record<string, { pairs: number; passing: number }> = {};
  for (const name of Object.keys(report.components).sort(compareUnits)) {
    const bucket = report.components[name]!;
    components[name] = { pairs: bucket.pairs, passing: bucket.passing };
  }
  return {
    commit: report.commit,
    pin: { tag: report.pin.tag, commit: report.pin.commit },
    phase: report.phase,
    inventory: { ids: report.inventory.ids, sha256: report.inventory.sha256 },
    overall: { pairs: report.overall.pairs, passing: report.overall.passing },
    alpha: { applicable: report.alpha.applicable, passing: report.alpha.passing },
    components,
  };
}

/** The `history.jsonl` line of `record` (with its LF). */
export function serialiseRecord(record: HistoryRecord): string {
  return `${JSON.stringify(record)}\n`;
}

export interface Run {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function git(root: string, args: readonly string[], options: { input?: string; env?: Record<string, string> } = {}): Run {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stdin: options.input === undefined ? "ignore" : Buffer.from(options.input),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

export function gitOk(root: string, args: readonly string[], options: { input?: string; env?: Record<string, string> } = {}): string {
  const run = git(root, args, options);
  if (run.exitCode !== 0) {
    throw new HistoryError(`git ${args[0]} failed: ${run.stderr.trim() || `exit ${run.exitCode}`}`);
  }
  return run.stdout;
}

/** Whether `line` holds the (commit, pin) key of `record`. */
function sameKey(line: string, record: HistoryRecord, at: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new HistoryError(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const existing = value as Partial<HistoryRecord> | null;
  return existing !== null && typeof existing === "object" && existing.commit === record.commit && existing.pin?.tag === record.pin.tag && existing.pin?.commit === record.pin.commit;
}

/** The remote branch tip, fetched into `refs/xaravel-history/<branch>`, or null when the remote has no such branch. */
export function fetchTip(root: string, remote: string, branch: string): string | null {
  const ref = `refs/heads/${branch}`;
  const listed = gitOk(root, ["ls-remote", "--heads", remote, ref]).trim();
  if (listed === "") {
    return null;
  }
  gitOk(root, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", remote, `+${ref}:refs/xaravel-history/${branch}`]);
  return gitOk(root, ["rev-parse", "--verify", `refs/xaravel-history/${branch}^{commit}`]).trim();
}

/** The commit `refs/heads/<branch>` points at on `remote`, or null when the remote has no such branch. */
export function remoteTip(root: string, remote: string, branch: string): string | null {
  const ref = `refs/heads/${branch}`;
  for (const line of gitOk(root, ["ls-remote", "--heads", remote, ref]).split("\n")) {
    const [sha, name] = line.split("\t");
    if (name !== undefined && name.trim() === ref && sha !== undefined) {
      return sha.trim();
    }
  }
  return null;
}

/** A full SHA-1 or SHA-256 commit id. */
const COMMIT_ID = /^[0-9a-f]{40,64}$/;

/**
 * The source-commit guard shared by the history append and the site publish:
 * `source` may be recorded only when it is `last` (the last recorded or
 * published source commit), a descendant of it, or the current tip of
 * `mainBranch` on `remote`. A null `last` (a branch tip whose source cannot be
 * read, or one that is not a full commit id) accepts only the `main` tip; a `last` missing from the local object
 * store is not an ancestor. Throws HistoryError (`refusing <source>: …`)
 * otherwise. Callers skip it when there is nothing recorded yet.
 */
export function checkSource(root: string, remote: string, mainBranch: string, source: string, last: string | null): void {
  if (!COMMIT_ID.test(source)) {
    throw new HistoryError(`refusing ${source}: not a commit id`);
  }
  if (last !== null && !COMMIT_ID.test(last)) {
    last = null;
  }
  if (last !== null && (last === source || git(root, ["merge-base", "--is-ancestor", "--end-of-options", last, source]).exitCode === 0)) {
    return;
  }
  const mainTip = remoteTip(root, remote, mainBranch);
  if (mainTip !== null && mainTip === source) {
    return;
  }
  throw new HistoryError(
    `refusing ${source}: it is not a descendant of the last recorded or published source ${last ?? "unknown"}, nor the ${remote} ${mainBranch} tip ${mainTip ?? "missing"} (a re-run of an older run?)`,
  );
}

/** Whether `content` has a non-empty line and, if so, the `commit` of the last one (null when it holds no string commit). */
function lastSource(content: string, at: string): { found: boolean; commit: string | null } {
  const lines = content.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!;
    if (line === "") {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new HistoryError(`${at}:${index + 1}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const commit = value !== null && typeof value === "object" ? (value as { commit?: unknown }).commit : null;
    return { found: true, commit: typeof commit === "string" && commit !== "" ? commit : null };
  }
  return { found: false, commit: null };
}

/** The `history.jsonl` of `tip` (empty when the tip is null or has none). */
function historyAt(root: string, tip: string | null): string {
  if (tip === null || git(root, ["cat-file", "-e", `${tip}:${HISTORY_FILE}`]).exitCode !== 0) {
    return "";
  }
  return gitOk(root, ["cat-file", "blob", `${tip}:${HISTORY_FILE}`]);
}

/** Builds the commit appending `record` on `tip` (an orphan when null), with the resulting content; a null commit when the key is already recorded. */
function buildCommit(root: string, tip: string | null, record: HistoryRecord): { commit: string | null; content: string } {
  let content = historyAt(root, tip);
  if (content !== "" && !content.endsWith("\n")) {
    content += "\n";
  }
  const lines = content === "" ? [] : content.slice(0, -1).split("\n");
  if (lines.some((line, index) => line !== "" && sameKey(line, record, `${HISTORY_FILE}:${index + 1}`))) {
    return { commit: null, content };
  }
  content += serialiseRecord(record);
  const blob = gitOk(root, ["hash-object", "-w", "--stdin"], { input: content }).trim();
  const dir = mkdtempSync(join(tmpdir(), "xaravel-history-"));
  try {
    const env = { GIT_INDEX_FILE: join(dir, "index") };
    if (tip !== null) {
      gitOk(root, ["read-tree", tip], { env });
    }
    gitOk(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${HISTORY_FILE}`], { env });
    const tree = gitOk(root, ["write-tree"], { env }).trim();
    const identity = { GIT_AUTHOR_NAME: BOT.name, GIT_AUTHOR_EMAIL: BOT.email, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email };
    const subject = `conformance history: ${record.commit.slice(0, 12)} at ${record.pin.tag}`;
    const parents = tip === null ? [] : ["-p", tip];
    return { commit: gitOk(root, ["commit-tree", tree, ...parents, "-m", subject], { env: identity }).trim(), content };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A `git push` rejection that a refetch and re-append can fix (non-fast-forward, or the ref moved under us). */
export const REJECTED = /\[rejected\]|non-fast-forward|fetch first|\[remote rejected\].*(?:cannot lock ref|stale info|incorrect old value)/;

/** Appends the record of `report` to `history.jsonl` on `branch` of `remote`, and pushes it. */
export function appendHistory(options: { root: string; remote: string; branch: string; report: Report; mainBranch?: string }): AppendResult {
  const { root, remote, branch } = options;
  const mainBranch = options.mainBranch ?? DEFAULT_MAIN_BRANCH;
  const record = historyRecord(options.report);
  for (let attempt = 1; attempt <= PUSH_RETRIES + 1; attempt++) {
    const tip = fetchTip(root, remote, branch);
    const last = lastSource(historyAt(root, tip), HISTORY_FILE);
    if (last.found) {
      checkSource(root, remote, mainBranch, record.commit, last.commit);
    }
    const { commit, content } = buildCommit(root, tip, record);
    if (commit === null) {
      return { outcome: "already recorded", tip: tip!, attempts: attempt - 1, content };
    }
    const push = git(root, ["push", "--quiet", "--no-verify", remote, `${commit}:refs/heads/${branch}`]);
    if (push.exitCode === 0) {
      return { outcome: tip === null ? "created" : "appended", tip: commit, attempts: attempt, content };
    }
    if (!REJECTED.test(push.stderr)) {
      throw new HistoryError(`git push failed: ${push.stderr.trim() || `exit ${push.exitCode}`}`);
    }
  }
  throw new HistoryError(`git push to ${remote} ${branch} was rejected ${PUSH_RETRIES + 1} times (non-fast-forward)`);
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/conformance-report/history.ts [--root <dir>] [--report <file>] [--remote <remote>] [--branch <branch>] [--main-branch <branch>] [--history-out <file>]";
const FLAGS = ["--root", "--report", "--remote", "--branch", "--main-branch", "--history-out"] as const;

interface Args {
  root: string;
  report: string | null;
  remote: string;
  branch: string;
  mainBranch: string;
  historyOut: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { root: resolve(import.meta.dir, "..", ".."), report: null, remote: DEFAULT_REMOTE, branch: DEFAULT_BRANCH, mainBranch: DEFAULT_MAIN_BRANCH, historyOut: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!(FLAGS as readonly string[]).includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      args.root = resolve(value);
    } else if (arg === "--report") {
      args.report = resolve(value);
    } else if (arg === "--remote") {
      args.remote = value;
    } else if (arg === "--history-out") {
      args.historyOut = resolve(value);
    } else {
      if (git(args.root, ["check-ref-format", `refs/heads/${value}`]).exitCode !== 0) {
        throw new UsageError(`${arg} ${JSON.stringify(value)} is not a valid branch name`);
      }
      if (arg === "--main-branch") {
        args.mainBranch = value;
      } else {
        args.branch = value;
      }
    }
  }
  return args;
}

/** Reads and shape-checks a schema 1 `report.json`; throws HistoryError naming `path`. */
export function readReport(path: string): Report {
  if (!existsSync(path)) {
    throw new HistoryError(`${path} does not exist (run bun run conformance:report first)`);
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new HistoryError(`${path}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const report = value as Partial<Report> | null;
  if (report === null || typeof report !== "object" || report.schema !== 1 || typeof report.pin?.tag !== "string" || typeof report.overall?.pairs !== "number" || typeof report.alpha?.applicable !== "number" || typeof report.components !== "object" || report.components === null) {
    throw new HistoryError(`${path} is not a schema 1 conformance report`);
  }
  if (!Number.isInteger(report.phase) || report.phase! < 0 || typeof report.inventory?.ids !== "number" || typeof report.inventory.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(report.inventory.sha256)) {
    throw new HistoryError(`${path} has no valid phase and inventory (re-run bun run conformance:report)`);
  }
  return report as Report;
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    const report = readReport(args.report ?? join(args.root, DEFAULT_OUT));
    const result = appendHistory({ root: args.root, remote: args.remote, branch: args.branch, report, mainBranch: args.mainBranch });
    if (args.historyOut !== null) {
      mkdirSync(dirname(args.historyOut), { recursive: true });
      writeFileSync(args.historyOut, result.content);
    }
    const key = `${report.commit} (${report.pin.tag} ${report.pin.commit})`;
    if (result.outcome === "already recorded") {
      process.stdout.write(`conformance:history: ${key} already recorded on ${args.remote} ${args.branch}\n`);
    } else {
      process.stdout.write(`conformance:history: ${result.outcome === "created" ? "created" : "appended to"} ${args.remote} ${args.branch} with ${key} at ${result.tip}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`conformance:history: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
