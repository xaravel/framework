// The Ratchet (Story 5.6; FR-3, AD-15, AD-16, AD-28).
//
//   bun tools/ratchet/ratchet.ts run [--root <dir>] --ref <head-ref>
//       (`bun run ratchet run --ref <ref>`) runs the harness over the root in
//       full mode (`runHarness(root, {})`: no filter, no sample) and turns its
//       differences into a verdict for the run of `<head-ref>`:
//
//         UNEXPECTED-FAILURE <difference>   every difference but an unexpected
//                                           pass: FAIL, FLOOR, SKIPPED,
//                                           MISSING, UNKNOWN, ERROR and, with
//                                           CI=true, the NOT-RUN of an alpha
//                                           Variant; on every ref
//         UNEXPECTED-FAILURE harness exited <n> with no counted difference
//                                           the harness exited non-zero but
//                                           counted no difference (fail closed)
//         <difference>                      an `UNEXPECTED-PASS …` line whose
//                                           Test ID the run's own Story owns:
//                                           the ref is `story/<id>` and open
//                                           Story `<id>` owns it
//         WARNING <difference> (<why>)      any other unexpected pass, where
//                                           <why> is `owned by open Story <s>;
//                                           fails that Story's next run` or
//                                           `owned by no open Story`
//
//       then `RATCHET ref=<r> failures=<f> passes=<p> warnings=<w>`, all on
//       stdout. Under `GITHUB_ACTIONS=true` each warning is also printed as a
//       `::warning::` annotation. The harness's own report and diagnostics go
//       to stderr.
//
//       Owners come from the root's manifests (`stories/*.md`): a Story is open
//       when its effective status (`applySprintStatus`) is not `done`, and it
//       owns a Test ID `X#k` when its `test_ids` list `X#k` or `X`. In CI the
//       root's manifests and sprint status are the base branch's (`overlay`).
//       An unowned or foreign unexpected pass is a warning on PR runs too: the
//       ownership check forbids a Story from editing a line outside its
//       `test_ids`, so failing it would leave no legal fix. The owner's next
//       run fails; Story 5.8's promotion bot handles unowned passes.
//
//   bun tools/ratchet/ratchet.ts overlay --base <dir> --head <dir>
//       makes the head tree's grader the base's: for every file present in
//       either tree that the base's Protected Path list matches (`isProtected`
//       with the base's `conformance/protected-paths` and active Phases), and
//       for the base's sprint status (which decides which Stories are open),
//       the head's copy becomes the base's: copied over, or deleted when the
//       base has none. Symlinks are never followed; a head symlink at such a
//       path is removed first. The rest of the head stays PR code. So the
//       check's workflow, tool and Protected Paths come from the base at the
//       start of the run; code a PR's tests run in-process is not contained
//       (as with any test runner): the Ratchet's outcome comparison and review
//       guard that. The top-level `.git` and `node_modules` are skipped.
//
// Exit codes: 0 when nothing fails (warnings never do), 1 when
// failures + passes > 0, the harness failed a precondition (no SUMMARY line) or
// the manifests could not be read, 2 on a usage error.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runHarness, type HarnessResult } from "../../conformance/harness/harness";
import type { Difference } from "../../conformance/harness/compare";
import { compareUnits } from "../inventory/inventory";
import { applySprintStatus, covers, readManifests, SPRINT_STATUS, type Manifest } from "../ownership/ownership";
import { activePhases, isProtected, LIST_PATH, parseList } from "../protected-paths/protected-paths";

const STORY_BRANCH = "story/";
const SKIPPED = new Set([".git", "node_modules"]);

export class UsageError extends Error {}

/** One classified difference. */
export interface RatchetLine {
  readonly kind: "failure" | "pass" | "warning";
  readonly text: string;
}

export interface RatchetVerdict {
  readonly lines: RatchetLine[];
  readonly failures: number;
  readonly passes: number;
  readonly warnings: number;
}

/** The open Stories owning `id` (sorted by Story ID). */
function ownersOf(open: readonly Manifest[], id: string): string[] {
  return open
    .filter((manifest) => covers(new Set(manifest.testIds), id))
    .map((manifest) => manifest.storyId)
    .sort(compareStoryIds);
}

function compareStoryIds(a: string, b: string): number {
  const [aEpic, aStory] = a.split(".").map(Number) as [number, number];
  const [bEpic, bStory] = b.split(".").map(Number) as [number, number];
  return aEpic - bEpic || aStory - bStory || compareUnits(a, b);
}

/** Classifies the harness differences of a run for `ref`, given the open manifests (see the header). */
export function classify(differences: readonly Difference[], ref: string, open: readonly Manifest[]): RatchetVerdict {
  const story = ref.startsWith(STORY_BRANCH) ? ref.slice(STORY_BRANCH.length) : null;
  const lines: RatchetLine[] = [];
  let failures = 0;
  let passes = 0;
  let warnings = 0;
  for (const difference of differences) {
    if (difference.kind === "unexpected-failure") {
      failures++;
      lines.push({ kind: "failure", text: `UNEXPECTED-FAILURE ${difference.text}` });
      continue;
    }
    const owners = ownersOf(open, difference.id);
    if (story !== null && owners.includes(story)) {
      passes++;
      lines.push({ kind: "pass", text: difference.text });
      continue;
    }
    warnings++;
    const why = owners.length === 0 ? "owned by no open Story" : `owned by open ${owners.map((owner) => `Story ${owner}`).join(", ")}; fails that Story's next run`;
    lines.push({ kind: "warning", text: `WARNING ${difference.text} (${why})` });
  }
  return { lines, failures, passes, warnings };
}

/** The open manifests under `root`; throws naming every problem (fail closed). */
export function openManifests(root: string): Manifest[] {
  const read = readManifests(root);
  const resolved = applySprintStatus(root, read.manifests);
  const problems = [...read.violations, ...resolved.violations];
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
  return resolved.manifests.filter((manifest) => manifest.status !== "done");
}

export interface RatchetRun {
  readonly code: 0 | 1;
  /** Ratchet lines (stdout). */
  readonly out: string[];
  /** The harness report and diagnostics (stderr). */
  readonly err: string[];
}

export interface RatchetOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Runs the harness (internal: tests pass bun args through it); default `runHarness(root, {})` with `env`. */
  readonly harness?: (root: string) => Promise<HarnessResult>;
}

/** Runs the Ratchet over `root` for `ref` (see the header). */
export async function runRatchet(rootArg: string, ref: string, options: RatchetOptions = {}): Promise<RatchetRun> {
  const root = resolve(rootArg);
  const env = options.env ?? process.env;
  const err: string[] = [];
  const out: string[] = [];
  let open: Manifest[];
  try {
    open = openManifests(root);
  } catch (error) {
    err.push(`ratchet: the Story manifests could not be read; failing closed: ${error instanceof Error ? error.message : String(error)}`);
    return { code: 1, out, err };
  }
  const harness = options.harness ?? ((dir: string) => runHarness(dir, { env }));
  const result = await harness(root);
  err.push(...result.out, ...result.err);
  if (!result.out.some((line) => line.startsWith("SUMMARY "))) {
    err.push("ratchet: the harness failed a precondition before it compared anything; failing closed");
    return { code: 1, out, err };
  }
  const verdict = classify(result.differences, ref, open);
  const annotate = env["GITHUB_ACTIONS"] === "true";
  for (const line of verdict.lines) {
    out.push(line.text);
    if (annotate && line.kind === "warning") {
      out.push(`::warning::${line.text}`);
    }
  }
  let failures = verdict.failures;
  // The harness failed but counted no difference at all: never read that as clean. (A run whose only differences are
  // warned passes also exits 1 from the harness; that is the warning case, not this one.)
  if (result.code !== 0 && result.differences.length === 0) {
    failures++;
    out.push(`UNEXPECTED-FAILURE harness exited ${result.code} with no counted difference`);
  }
  out.push(`RATCHET ref=${ref} failures=${failures} passes=${verdict.passes} warnings=${verdict.warnings}`);
  return { code: failures + verdict.passes > 0 ? 1 : 0, out, err };
}

// ---------------------------------------------------------------------------
// Overlay

/** Every non-directory entry under `dir` (symlinks not followed), repo-relative, sorted. */
function entries(dir: string): string[] {
  const found: string[] = [];
  const walk = (at: string, prefix: string): void => {
    for (const name of readdirSync(at)) {
      if (prefix === "" && SKIPPED.has(name)) {
        continue;
      }
      const path = join(at, name);
      const rel = prefix === "" ? name : `${prefix}/${name}`;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(path, rel);
      } else {
        found.push(rel);
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir, "");
  }
  return found.sort(compareUnits);
}

/** Makes `head`'s Protected Paths and sprint status equal `base`'s (see the header); returns the paths it changed. */
export function overlay(baseArg: string, headArg: string): { copied: string[]; removed: string[] } {
  const base = resolve(baseArg);
  const head = resolve(headArg);
  const listFile = join(base, LIST_PATH);
  if (!existsSync(listFile)) {
    throw new Error(`the base has no ${LIST_PATH}`);
  }
  const list = parseList(readFileSync(listFile, "utf8"));
  const phases = activePhases(base);
  const graded = (path: string): boolean => path === SPRINT_STATUS || isProtected(list, phases, path);
  const baseFiles = entries(base).filter(graded);
  const headFiles = entries(head).filter(graded);
  const copied: string[] = [];
  const removed: string[] = [];
  const baseSet = new Set(baseFiles);
  // First remove every head entry at such a path (files and symlinks alike), so nothing is written through a link.
  for (const path of headFiles) {
    rmSync(join(head, path), { recursive: true, force: true });
    if (!baseSet.has(path)) {
      removed.push(path);
    }
  }
  for (const path of baseFiles) {
    const source = join(base, path);
    if (lstatSync(source).isSymbolicLink()) {
      continue;
    }
    const target = join(head, path);
    // A parent that is not a real directory (a file, or a symlink the PR planted) goes first.
    const segments = path.split("/").slice(0, -1);
    let at = head;
    for (const segment of segments) {
      at = join(at, segment);
      if (existsSync(at) || isLink(at)) {
        const stat = lstatSync(at);
        if (!stat.isDirectory()) {
          rmSync(at, { recursive: true, force: true });
        }
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied.push(path);
  }
  return { copied, removed };
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = ["Usage:", "  bun tools/ratchet/ratchet.ts run [--root <dir>] --ref <head-ref>", "  bun tools/ratchet/ratchet.ts overlay --base <dir> --head <dir>"].join("\n");

function parseFlags(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (flags.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    flags.set(arg, value);
  }
  return flags;
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "run") {
      const flags = parseFlags(rest, ["--root", "--ref"]);
      const ref = flags.get("--ref");
      if (ref === undefined) {
        throw new UsageError("run needs --ref <head-ref>");
      }
      const root = flags.get("--root") ?? resolve(import.meta.dir, "..", "..");
      const result = await runRatchet(root, ref);
      if (result.err.length > 0) {
        process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
      }
      process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
      return result.code;
    }
    if (command === "overlay") {
      const flags = parseFlags(rest, ["--base", "--head"]);
      const base = flags.get("--base");
      const head = flags.get("--head");
      if (base === undefined || head === undefined) {
        throw new UsageError("overlay needs --base <dir> and --head <dir>");
      }
      const result = overlay(base, head);
      process.stdout.write(`Ratchet overlay: ${result.copied.length} graded file(s) restored from the base, ${result.removed.length} removed from the head.\n`);
      return 0;
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Ratchet failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
