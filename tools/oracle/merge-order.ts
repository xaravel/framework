// Merge order of per-Story Oracle request files (Story 5.6 AC5, Epic 3 retro
// R5; FR-6, AD-15, AD-16).
//
// Between two per-Story files that hold the same request, the earlier-merged
// Story owns it, not the one whose file name sorts first. Merge order is the
// first-parent history of `HEAD`: for each file under
// `conformance/oracle-requests/`, the commit that most recently added it
// (`git log --first-parent --diff-filter=A --no-renames`). Older commits come
// first; within one commit, files sort by `compareUnits`. Files with no add
// commit (uncommitted, or the root is not a git tree, or the repository has no
// commit yet) come after every committed file, by name.
//
// A shallow repository cannot answer: its history stops at the graft, so an
// old file would look newly added. `mergeOrder` throws
//   oracle request merge order needs full git history (fetch-depth: 0)
// there (fail closed); CI checkouts that read per-Story files set
// `fetch-depth: 0`.
import { compareUnits } from "./request";

/** The directory whose files are ordered, repo-relative. */
const DIR = "conformance/oracle-requests";

export const SHALLOW_MESSAGE = "oracle request merge order needs full git history (fetch-depth: 0)";

function git(root: string, args: readonly string[]): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["git", "-c", "core.quotePath=false", "-C", root, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/**
 * The commit rank of each file under `conformance/oracle-requests/` that has an add commit in `HEAD`'s first-parent
 * history: 0 for the oldest such commit, rising toward `HEAD`. Null when `root` is not in a git work tree or has no
 * commit. Throws on a shallow repository or a git failure.
 */
export function addCommitRanks(root: string): Map<string, number> | null {
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return null;
  }
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.code !== 0) {
    throw new Error(`git rev-parse --is-shallow-repository failed: ${shallow.stderr.trim()}`);
  }
  if (shallow.stdout.trim() === "true") {
    throw new Error(SHALLOW_MESSAGE);
  }
  if (git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).code !== 0) {
    return null;
  }
  const log = git(root, ["log", "--first-parent", "--diff-filter=A", "--no-renames", "--relative", "--name-only", "--format=@@%H", "--", `${DIR}/`]);
  if (log.code !== 0) {
    throw new Error(`git log over ${DIR}/ failed: ${log.stderr.trim()}`);
  }
  // Newest first: the first commit naming a file is the one that most recently added it.
  const newest = new Map<string, number>();
  let commit = -1;
  for (const line of log.stdout.split("\n")) {
    if (line.startsWith("@@")) {
      commit++;
      continue;
    }
    const path = line.trim();
    if (path === "" || !path.startsWith(`${DIR}/`)) {
      continue;
    }
    const name = path.slice(DIR.length + 1);
    if (!newest.has(name)) {
      newest.set(name, commit);
    }
  }
  const count = commit + 1;
  return new Map([...newest].map(([name, index]) => [name, count - 1 - index] as const));
}

/** `names` (entries of `conformance/oracle-requests/`) in merge order (see the header). */
export function mergeOrder(root: string, names: readonly string[]): string[] {
  if (names.length === 0) {
    return [];
  }
  const ranks = addCommitRanks(root) ?? new Map<string, number>();
  return [...names].sort((a, b) => {
    const ra = ranks.get(a);
    const rb = ranks.get(b);
    if (ra !== undefined && rb !== undefined && ra !== rb) {
      return ra - rb;
    }
    if (ra !== undefined && rb === undefined) {
      return -1;
    }
    if (ra === undefined && rb !== undefined) {
      return 1;
    }
    return compareUnits(a, b);
  });
}
