// The Ratchet (Stories 5.6 and 5.7; FR-3, AD-2, AD-15, AD-16, AD-28).
//
//   bun tools/ratchet/ratchet.ts run [--root <dir>] --ref <head-ref> [--scope <file>]
//       (`bun run ratchet run --ref <ref>`) runs the harness over the root in
//       full mode (`runHarness(root, {})`: no filter, no sample) and turns its
//       differences into a verdict for the run of `<head-ref>`. With
//       `--scope <file>` (written by `scope`, below) in `components` mode it
//       grades only those Components (`runHarness(root, {components})`); in
//       `none` mode it runs no harness and prints
//       `RATCHET ref=<r> scope=none failures=0 passes=0 warnings=0`, exit 0;
//       in `full` mode, or with no `--scope`, it runs in full. The verdict:
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
//       then `RATCHET ref=<r> scope=<mode> failures=<f> passes=<p> warnings=<w>`,
//       where <mode> is the scope's (`full` with no `--scope`), all on
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
//   bun tools/ratchet/ratchet.ts scope --base <dir> --head <dir> --out <file>
//       (Story 5.7) compares the file contents of the two trees (the top-level
//       `.git`, every `node_modules` at any depth, and either tree nested
//       inside the other, are skipped; symlinks compare by target) and writes to <file>
//       `{"mode":"full"|"components"|"none","components":[…],"reason":"…"}`:
//         packages/<p>/**                      changes package `p`;
//         conformance/expectations/<c>/**,
//         conformance/fixtures/<c>/**          change Component `c`;
//         docs/, _bmad-output/, stories/, conformance/escalations/,
//         conformance/oracle-requests/, .github/ and any root `*.md` but
//         AGENTS.md                            change nothing graded (the
//                                              manifests are read from the
//                                              base, the workflows run from it);
//         any other path                       `full`, and `reason` names the
//                                              first such path, sorted.
//       Otherwise `components` is the AD-2 reverse-dependency closure of the
//       changed packages (`reverseClosure`, tools/graph/graph.ts, over both
//       trees' edges), plus the changed Components, intersected with the
//       directory names under the head's `conformance/expectations/`, sorted;
//       empty, the mode is `none`. It is `full` instead, naming the path, when
//       a changed Component's data has no Expectations directory in the head
//       (a deleted Expectations directory, or fixtures of a Component without
//       one), or when a package in the closure has
//       `packages/<p>/tests/ported/` in the head but no Expectations directory
//       (its Ported Tests would be UNKNOWN, so only a full run grades them).
//       `decisions/` is not data-only: the harness reads `decisions/DIV-<n>.md`
//       for assertion-floor waivers. Comparing the base tip with the head errs
//       toward a larger scope when main has moved on.
//
//   bun tools/ratchet/ratchet.ts story --root <dir> --ref <head-ref>
//       (Story 5.7) for a `story/<id>` ref whose manifest `stories/<id>.md`
//       lists `test_ids`, runs the harness over those IDs in full, never as a
//       sample (`runHarness(root, {story: id})`, inheriting the environment, so
//       `CI=true` makes every alpha Variant run), prints its report and exits
//       with its code. A ref that is not `story/<epic>.<story>` prints
//       `STORY ref=<r> skipped: not a Story ref`, a manifest with no
//       `test_ids` `STORY ref=<r> skipped: no test_ids`, both exit 0; a
//       missing or invalid manifest exits 1.
//
// Exit codes: 0 when nothing fails (warnings never do), 1 when
// failures + passes > 0, the harness failed a precondition (no SUMMARY line),
// the manifests or the scope file could not be read, or any other failure, 2 on
// a usage error.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { runHarness, type HarnessResult } from "../../conformance/harness/harness";
import type { Difference } from "../../conformance/harness/compare";
import { reverseClosure } from "../graph/graph";
import { compareUnits } from "../inventory/inventory";
import { applySprintStatus, covers, parseManifest, readManifests, SPRINT_STATUS, type Manifest } from "../ownership/ownership";
import { activePhases, isProtected, LIST_PATH, parseList } from "../protected-paths/protected-paths";

const STORY_BRANCH = "story/";
const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;
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
  /** Runs the harness (internal: tests pass bun args through it); default `runHarness(root, {})` with `env` and the scope's Components. */
  readonly harness?: (root: string, components: readonly string[] | null) => Promise<HarnessResult>;
  /** The scope (`scope`'s output); null or absent grades in full. */
  readonly scope?: Scope | null;
}

/** Runs the Ratchet over `root` for `ref` (see the header). */
export async function runRatchet(rootArg: string, ref: string, options: RatchetOptions = {}): Promise<RatchetRun> {
  const root = resolve(rootArg);
  const env = options.env ?? process.env;
  const err: string[] = [];
  const out: string[] = [];
  const scope = options.scope ?? null;
  const mode = scope === null ? "full" : scope.mode;
  if (mode === "none") {
    err.push(`ratchet: scope none (${scope?.reason ?? ""}); no harness run`);
    out.push(`RATCHET ref=${ref} scope=none failures=0 passes=0 warnings=0`);
    return { code: 0, out, err };
  }
  const components = mode === "components" ? (scope?.components ?? []) : null;
  if (components !== null) {
    err.push(`ratchet: scope components (${scope?.reason ?? ""}): ${components.join(", ")}`);
  }
  let open: Manifest[];
  try {
    open = openManifests(root);
  } catch (error) {
    err.push(`ratchet: the Story manifests could not be read; failing closed: ${error instanceof Error ? error.message : String(error)}`);
    return { code: 1, out, err };
  }
  const harness = options.harness ?? ((dir: string, selected: readonly string[] | null) => runHarness(dir, selected === null ? { env } : { env, components: selected }));
  const result = await harness(root, components);
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
  out.push(`RATCHET ref=${ref} scope=${mode} failures=${failures} passes=${verdict.passes} warnings=${verdict.warnings}`);
  return { code: failures + verdict.passes > 0 ? 1 : 0, out, err };
}

// ---------------------------------------------------------------------------
// Story

/** Runs the harness over the `test_ids` of the Story `ref` names, in full (see the header). */
export async function runStoryTests(rootArg: string, ref: string, options: Pick<RatchetOptions, "env"> & { readonly harness?: (root: string, story: string) => Promise<HarnessResult> } = {}): Promise<RatchetRun> {
  const root = resolve(rootArg);
  const env = options.env ?? process.env;
  const id = ref.startsWith(STORY_BRANCH) ? ref.slice(STORY_BRANCH.length) : "";
  if (!STORY_ID.test(id)) {
    return { code: 0, out: [`STORY ref=${ref} skipped: not a Story ref`], err: [] };
  }
  const file = `stories/${id}.md`;
  const path = join(root, file);
  if (!existsSync(path)) {
    return { code: 1, out: [], err: [`ratchet story: ${file} does not exist`] };
  }
  const parsed = parseManifest(file, readFileSync(path, "utf8"));
  if (parsed.manifest === null) {
    return { code: 1, out: [], err: [`ratchet story: ${parsed.violations.join("; ")}`] };
  }
  if (parsed.manifest.testIds.length === 0) {
    return { code: 0, out: [`STORY ref=${ref} skipped: no test_ids`], err: [] };
  }
  const harness = options.harness ?? ((dir: string, story: string) => runHarness(dir, { env, story }));
  const result = await harness(root, id);
  return { code: result.code, out: result.out, err: result.err };
}

// ---------------------------------------------------------------------------
// Scope

export type ScopeMode = "full" | "components" | "none";

export interface Scope {
  readonly mode: ScopeMode;
  readonly components: readonly string[];
  readonly reason: string;
}

/** Changed paths that grade nothing: data the base supplies, or that no test reads (see the header). */
const NO_EFFECT = ["docs/", "_bmad-output/", "stories/", "conformance/escalations/", "conformance/oracle-requests/", ".github/"];
const COMPONENT_DATA = ["conformance/expectations/", "conformance/fixtures/"];

function noEffect(path: string): boolean {
  return NO_EFFECT.some((prefix) => path.startsWith(prefix)) || (!path.includes("/") && path.endsWith(".md") && path !== "AGENTS.md");
}

/** Whether the two entries differ in kind, content or link target. */
function differs(a: string, b: string): boolean {
  const left = lstatSync(a);
  const right = lstatSync(b);
  if (left.isSymbolicLink() || right.isSymbolicLink()) {
    return !(left.isSymbolicLink() && right.isSymbolicLink()) || readlinkSync(a) !== readlinkSync(b);
  }
  if (left.size !== right.size) {
    return true;
  }
  return !readFileSync(a).equals(readFileSync(b));
}

/** The prefix of `inner` inside `outer`, or null when it is not strictly inside. */
function nested(outer: string, inner: string): string | null {
  const rel = relative(outer, inner);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : `${rel.split("\\").join("/")}/`;
}

/** The paths whose contents differ between `base` and `head`, sorted (see the header). */
export function changedPaths(baseArg: string, headArg: string): string[] {
  const base = resolve(baseArg);
  const head = resolve(headArg);
  const inBase = nested(base, head);
  const inHead = nested(head, base);
  const baseFiles = entries(base, true).filter((path) => inBase === null || !path.startsWith(inBase));
  const headFiles = entries(head, true).filter((path) => inHead === null || !path.startsWith(inHead));
  const headSet = new Set(headFiles);
  const changed = new Set<string>();
  for (const path of baseFiles) {
    if (!headSet.has(path) || differs(join(base, path), join(head, path))) {
      changed.add(path);
    }
  }
  const baseSet = new Set(baseFiles);
  for (const path of headFiles) {
    if (!baseSet.has(path)) {
      changed.add(path);
    }
  }
  return [...changed].sort(compareUnits);
}

/** The Components with an Expectations directory under `root`. */
function expectationComponents(root: string): Set<string> {
  const dir = join(root, "conformance", "expectations");
  if (!existsSync(dir)) {
    return new Set();
  }
  return new Set(
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

/** The scope of the change from `base` to `head` (see the header). */
export function computeScope(baseArg: string, headArg: string): Scope {
  const base = resolve(baseArg);
  const head = resolve(headArg);
  const packages = new Set<string>();
  const data = new Map<string, string>();
  for (const path of changedPaths(base, head)) {
    if (noEffect(path)) {
      continue;
    }
    const parts = path.split("/");
    if (parts[0] === "packages" && parts.length >= 3) {
      packages.add(parts[1]!);
      continue;
    }
    if (COMPONENT_DATA.some((prefix) => path.startsWith(prefix)) && parts.length >= 4) {
      if (!data.has(parts[2]!)) {
        data.set(parts[2]!, path);
      }
      continue;
    }
    return { mode: "full", components: [], reason: path };
  }
  const changed = [...packages].sort(compareUnits);
  const graded = expectationComponents(head);
  // Data of a Component with no Expectations directory in the head (deleted, or never there): only a full run grades it.
  for (const name of [...data.keys()].sort(compareUnits)) {
    if (!graded.has(name)) {
      return { mode: "full", components: [], reason: data.get(name)! };
    }
  }
  const packageClosure = new Set([...reverseClosure(base, changed), ...reverseClosure(head, changed)]);
  // A package with Ported Tests but no Expectations directory: its tests are UNKNOWN, which only a full run reports.
  for (const name of [...packageClosure].sort(compareUnits)) {
    const ported = `packages/${name}/tests/ported/`;
    if (!graded.has(name) && existsSync(join(head, ported))) {
      return { mode: "full", components: [], reason: ported };
    }
  }
  const closure = new Set([...packageClosure, ...data.keys()]);
  const components = [...closure].filter((name) => graded.has(name)).sort(compareUnits);
  const what = [changed.length > 0 ? `packages ${changed.join(", ")}` : null, data.size > 0 ? `Component data ${[...data.keys()].sort(compareUnits).join(", ")}` : null].filter((part) => part !== null);
  if (components.length === 0) {
    return { mode: "none", components: [], reason: what.length === 0 ? "no graded path changed" : `${what.join("; ")} changed; no Component in their closure has Expectations` };
  }
  return { mode: "components", components, reason: `${what.join("; ")} changed; reverse-dependency closure with Expectations` };
}

/** Reads and validates a scope file. */
export function readScope(file: string): Scope {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`the scope file ${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const scope = value as { mode?: unknown; components?: unknown; reason?: unknown };
  if (
    typeof value !== "object" ||
    value === null ||
    !["full", "components", "none"].includes(scope.mode as string) ||
    !Array.isArray(scope.components) ||
    !scope.components.every((name) => typeof name === "string" && /^[a-z][a-z0-9-]*$/.test(name)) ||
    typeof scope.reason !== "string" ||
    (scope.mode === "components" && scope.components.length === 0)
  ) {
    throw new Error(`the scope file ${file} is not {"mode":"full"|"components"|"none","components":[…],"reason":"…"}`);
  }
  return { mode: scope.mode as ScopeMode, components: scope.components as string[], reason: scope.reason };
}

// ---------------------------------------------------------------------------
// Overlay

/**
 * Every non-directory entry under `dir` (symlinks not followed), repo-relative, sorted. The top-level `.git` and
 * `node_modules` are skipped; with `anyNodeModules` (the scope's walk), every `node_modules` is.
 */
function entries(dir: string, anyNodeModules = false): string[] {
  const found: string[] = [];
  const walk = (at: string, prefix: string): void => {
    for (const name of readdirSync(at)) {
      if ((prefix === "" && SKIPPED.has(name)) || (anyNodeModules && name === "node_modules")) {
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

const USAGE = [
  "Usage:",
  "  bun tools/ratchet/ratchet.ts run [--root <dir>] --ref <head-ref> [--scope <file>]",
  "  bun tools/ratchet/ratchet.ts scope --base <dir> --head <dir> --out <file>",
  "  bun tools/ratchet/ratchet.ts story [--root <dir>] --ref <head-ref>",
  "  bun tools/ratchet/ratchet.ts overlay --base <dir> --head <dir>",
].join("\n");

function print(result: RatchetRun): number {
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  return result.code;
}

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
      const flags = parseFlags(rest, ["--root", "--ref", "--scope"]);
      const ref = flags.get("--ref");
      if (ref === undefined) {
        throw new UsageError("run needs --ref <head-ref>");
      }
      const root = flags.get("--root") ?? resolve(import.meta.dir, "..", "..");
      const scopeFile = flags.get("--scope");
      const scope = scopeFile === undefined ? null : readScope(scopeFile);
      return print(await runRatchet(root, ref, { scope }));
    }
    if (command === "story") {
      const flags = parseFlags(rest, ["--root", "--ref"]);
      const ref = flags.get("--ref");
      if (ref === undefined) {
        throw new UsageError("story needs --ref <head-ref>");
      }
      const root = flags.get("--root") ?? resolve(import.meta.dir, "..", "..");
      return print(await runStoryTests(root, ref));
    }
    if (command === "scope") {
      const flags = parseFlags(rest, ["--base", "--head", "--out"]);
      const base = flags.get("--base");
      const head = flags.get("--head");
      const out = flags.get("--out");
      if (base === undefined || head === undefined || out === undefined) {
        throw new UsageError("scope needs --base <dir>, --head <dir> and --out <file>");
      }
      const scope = computeScope(base, head);
      writeFileSync(out, `${JSON.stringify({ mode: scope.mode, components: scope.components, reason: scope.reason })}\n`);
      process.stdout.write(`Ratchet scope: ${scope.mode}${scope.components.length > 0 ? ` (${scope.components.join(", ")})` : ""}: ${scope.reason}\n`);
      return 0;
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
