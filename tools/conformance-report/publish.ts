// The dashboard publish (Story 7.2; FR-5.5).
//
//   bun --no-env-file tools/conformance-report/publish.ts [--root <dir>] [--dir <dir>]
//       [--remote <remote>] [--branch <branch>]
//       (`bun run conformance:publish`, run by `.github/workflows/dashboard.yml`
//       after `conformance:site`) commits the built site in `--dir` (default
//       `<root>/.cache/conformance/site`) to `--branch` (default `gh-pages`)
//       of `--remote` (default `origin`), which GitHub Pages serves ("Deploy
//       from a branch"), and pushes it.
//
// `--dir` must hold an `index.html`, so an empty or partial build never
// replaces the published site. The commit's tree is exactly the files of `--dir` (mode 100644), built with
// git plumbing in the repository at `--root` (`hash-object`, a temporary index
// file, `write-tree`, `commit-tree`) as github-actions[bot], so the caller's
// HEAD, index and working tree are never touched. Its parent is the remote
// tip (fetched into `refs/xaravel-history/<branch>`, history.ts `fetchTip`),
// or none when the branch is missing (an orphan). When the tip already has the
// identical tree, nothing is committed (`unchanged`). The push is a
// fast-forward, never forced; a non-fast-forward rejection (`REJECTED`)
// refetches and rebuilds, up to `PUSH_RETRIES` retries.
//
// It prints `conformance:publish: <created|updated|unchanged> <remote> <branch> at <tip>`.
//
// Exit codes: 0 ok, 1 data or git error, 2 usage error.
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { compareUnits } from "../inventory/inventory";
import { BOT, fetchTip, git, gitOk, HistoryError, PUSH_RETRIES, REJECTED } from "./history";
import { DEFAULT_SITE_OUT } from "./site";

export const DEFAULT_PAGES_REMOTE = "origin";
export const DEFAULT_PAGES_BRANCH = "gh-pages";

export interface PublishResult {
  outcome: "created" | "updated" | "unchanged";
  /** The branch tip after the run. */
  tip: string;
  /** Push attempts made (0 when unchanged). */
  attempts: number;
}

/** Every file under `dir`, as `/`-separated relative paths, sorted. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        out.push(relative(dir, path).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out.sort(compareUnits);
}

/** The tree object holding exactly the files of `dir`. */
function treeOf(root: string, dir: string): string {
  const files = filesOf(dir);
  const index = mkdtempSync(join(tmpdir(), "xaravel-publish-"));
  try {
    const env = { GIT_INDEX_FILE: join(index, "index") };
    if (files.length === 0) {
      gitOk(root, ["read-tree", "--empty"], { env });
    } else {
      const shas = gitOk(root, ["hash-object", "-w", "--no-filters", "--stdin-paths"], { input: files.map((file) => `${join(dir, file)}\n`).join("") })
        .trim()
        .split("\n");
      if (shas.length !== files.length) {
        throw new HistoryError(`git hash-object returned ${shas.length} objects for ${files.length} files`);
      }
      gitOk(root, ["update-index", "--add", "--index-info"], { env, input: files.map((file, i) => `100644 blob ${shas[i]}\t${file}\n`).join("") });
    }
    return gitOk(root, ["write-tree"], { env }).trim();
  } finally {
    rmSync(index, { recursive: true, force: true });
  }
}

/** Commits the files of `dir` to `branch` of `remote` and pushes it. */
export function publishSite(options: { root: string; remote: string; branch: string; dir: string }): PublishResult {
  const { root, remote, branch, dir } = options;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new HistoryError(`${dir} is not a directory (run bun run conformance:site first)`);
  }
  if (!existsSync(join(dir, "index.html"))) {
    // An empty or partial build would replace the published site.
    throw new HistoryError(`${dir} has no index.html (run bun run conformance:site first); refusing to publish it`);
  }
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const source = head.exitCode === 0 ? head.stdout.trim().slice(0, 12) : "no commit";
  for (let attempt = 1; attempt <= PUSH_RETRIES + 1; attempt++) {
    const tip = fetchTip(root, remote, branch);
    const tree = treeOf(root, dir);
    if (tip !== null && gitOk(root, ["rev-parse", `${tip}^{tree}`]).trim() === tree) {
      return { outcome: "unchanged", tip, attempts: attempt - 1 };
    }
    const identity = { GIT_AUTHOR_NAME: BOT.name, GIT_AUTHOR_EMAIL: BOT.email, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email };
    const parents = tip === null ? [] : ["-p", tip];
    const commit = gitOk(root, ["commit-tree", tree, ...parents, "-m", `conformance site: ${source}`], { env: identity }).trim();
    const push = git(root, ["push", "--quiet", "--no-verify", remote, `${commit}:refs/heads/${branch}`]);
    if (push.exitCode === 0) {
      return { outcome: tip === null ? "created" : "updated", tip: commit, attempts: attempt };
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

const USAGE = "Usage: bun --no-env-file tools/conformance-report/publish.ts [--root <dir>] [--dir <dir>] [--remote <remote>] [--branch <branch>]";
const FLAGS = ["--root", "--dir", "--remote", "--branch"] as const;

interface Args {
  root: string;
  dir: string | null;
  remote: string;
  branch: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { root: resolve(import.meta.dir, "..", ".."), dir: null, remote: DEFAULT_PAGES_REMOTE, branch: DEFAULT_PAGES_BRANCH };
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
    } else if (arg === "--dir") {
      args.dir = resolve(value);
    } else if (arg === "--remote") {
      args.remote = value;
    } else {
      if (git(args.root, ["check-ref-format", `refs/heads/${value}`]).exitCode !== 0) {
        throw new UsageError(`--branch ${JSON.stringify(value)} is not a valid branch name`);
      }
      args.branch = value;
    }
  }
  return args;
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    const result = publishSite({ root: args.root, remote: args.remote, branch: args.branch, dir: args.dir ?? join(args.root, DEFAULT_SITE_OUT) });
    process.stdout.write(`conformance:publish: ${result.outcome} ${args.remote} ${args.branch} at ${result.tip}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`conformance:publish: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
