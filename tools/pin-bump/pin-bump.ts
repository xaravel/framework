// The Baseline Pin bump tool (Story 2.8, FR-7, UJ-7; decisions/ESC-2.8-1.md).
//
//   bun tools/pin-bump/pin-bump.ts <tag> [--from <rev>] [--apply] [--remote <base>] [--root <dir>]
//                                  [--security-override <decision-file>]
//
// It refuses first, in every mode, while any `epic-<N>` key under
// `development_status` in sprint status is `in-progress`: the Pin moves only
// at a freeze point. The one exception is a security release
// (decisions/OQ-12.md): `--security-override decisions/PIN-SECURITY-<name>.md`
// names a Maintainer-signed decision, committed at HEAD and unchanged in the
// working tree, whose frontmatter `tag` is <tag> and whose `advisory` is a
// GHSA ID, a CVE ID or an https URL (`securityOverrideProblems`). Whenever the
// flag is given it is validated first, before any other file or network work,
// and an invalid decision fails closed. A valid one lifts the freeze-point
// refusal for that tag only (a stderr notice lists the in-flight Epics), and
// is recorded: move mode's printed commit messages and last step carry it,
// and diff mode's report and record header name the advisory and decision.
// Every other step is unchanged. It then works in one of two modes, picked by
// comparing <tag> with the working tree's `laravel/framework` line of
// `conformance/baseline-pin`:
//
//   move mode (the line names another tag)
//       resolves <tag>'s commit with `git ls-remote` (the peeled `^{}` line
//       wins) and its tree with a shallow clone (the commit must match), as
//       docs/ops/upstream.md describes, from `<base>/laravel/framework.git`
//       (default base https://github.com). It rewrites only the framework
//       line, keeping every other byte of the file, runs `upstream:sync` and
//       prints the regeneration steps (`regenerationSteps`): exact commands,
//       with <tag> and the pre-move revision (`git rev-parse HEAD`, taken
//       before the write) substituted, that run in order in one POSIX shell
//       from the repository root. They regenerate the locks, build the
//       Oracle image (whose root-version list comes from the Pin, so the
//       Dockerfile needs no edit), regenerate the Inventory, commit, push and
//       dispatch `baseline.yml` (only on a named branch other than main),
//       replace the Inventory with its `inventory` artifact only after a
//       successful download, commit and push that, then run diff mode with
//       `--from <pre-move revision>`. It writes no record,
//       stubs or Expectations, even with `--apply`.
//   diff mode (the line already names <tag>)
//       reads the old Pin and Inventory with `git show <rev>:<path>` at
//       `--from` (default HEAD) and the new ones from the working tree, and
//       classifies every Test ID as added, changed (same ID, different `hash`),
//       removed or renamed (a removed and an added ID with the same `hash` and
//       `component`, no other removed or added ID sharing that hash). It
//       prints the report and writes the record
//       `conformance/pin-bumps/<old>-to-<new>.jsonl` (`applied:false`). With
//       `--apply` it also edits the Expectations shards in place (changed →
//       skip / not-ported-yet, renamed → new id, removed → deleted, an emptied
//       shard deleted) and writes one backlog stub per Component under
//       `_bmad-output/implementation-artifacts/pin-bump/<new>/`. A record that
//       already has `applied:true` is never overwritten. Diff mode never
//       touches the network.
//
// The tool never edits the ai, mcp or boost Pin lines, never writes
// `stories/*.md` or sprint status, and never runs `oracle:*`, `inventory` or
// `baseline` itself. These are tool data, not framework values, so they are
// written with JSON.stringify (AD-23 covers framework values). All output is
// UTF-8 with LF line endings and deterministic.
//
// Exit codes: 0 success, 1 any failure (fail closed), 2 usage error.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { compareUnits, FOREIGN_COMPONENTS, INVENTORY_DIR, NONDETERMINISM_FILE, parseInventory, UsageError, type InventoryEntry, type Suite } from "../inventory/inventory";
import { parseFrontmatter } from "../boost-framework/src/data";
import { SPRINT_STATUS } from "../ownership/ownership";
import { exitSignatureProblems } from "../ownership/phase-gate";
import { parsePin, readPin, sync, UPSTREAM_PIN_FILE, type PinEntry } from "../upstream/upstream";

export const EXPECTATIONS_DIR = "conformance/expectations";
export const PIN_BUMPS_DIR = "conformance/pin-bumps";
export const STUBS_DIR = "_bmad-output/implementation-artifacts/pin-bump";
const FRAMEWORK_REPO = "laravel/framework";
/** AD-15's Expectations fields, in order. */
export const EXPECTATION_KEYS = ["id", "variant", "status", "reason", "adapted", "escalation"] as const;
/**
 * The regeneration chain the Maintainer runs between move mode and diff mode
 * (ESC-2.8-1), as exact commands for one POSIX shell at the repository root:
 * no placeholder, <tag> and the pre-move revision `fromRev` (a full SHA)
 * substituted. The baseline run needs the CI's services, so it runs as the
 * `baseline.yml` dispatch on the pushed branch; its `merge` job uploads the
 * `inventory` artifact before its committed-equals-output check, so the
 * artifact exists even when that check fails on the not-yet-baselined
 * Inventory. The last step passes `--from`, because HEAD then pins <tag>.
 */
export function regenerationSteps(tag: string, fromRev: string, override: SecurityOverride | null = null): string[] {
  // The advisory sits inside a double-quoted commit message, so the characters the shell expands there are escaped.
  const note = override === null ? "" : `, security override ${override.advisory.replace(/[\\"$`]/g, "\\$&")} (${override.decision})`;
  const flag = override === null ? "" : ` --security-override ${override.decision}`;
  return [
    "bun run oracle:lock",
    'tag="$(bun run --silent oracle:tag)" && bun run oracle:build "xaravel-oracle:$tag"',
    "bun run inventory",
    `b="$(git branch --show-current)" && test -n "$b" && test "$b" != main && git add conformance/baseline-pin conformance/oracle/locks conformance/inventory && git commit -m "pin bump: laravel/framework ${tag}, regenerated locks and Inventory${note}" && git push -u origin HEAD && gh workflow run baseline.yml --ref "$b"`,
    `sleep 15 && run="$(gh run list --workflow baseline.yml --event workflow_dispatch --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId')" && test -n "$run" && gh run watch "$run"`,
    'test -n "$run" && dl="$(mktemp -d)" && gh run download "$run" --name inventory --dir "$dl" && rm -rf conformance/inventory && mv "$dl" conformance/inventory',
    `git add conformance/inventory && git commit -m "pin bump: laravel/framework ${tag}, baselined Inventory${note}" && git push`,
    `bun run pin:bump ${tag} --from ${fromRev}${flag}`,
  ];
}
/** The tag form upstream.ts's pin parser accepts. */
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/;
const SHA = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// git

/** The inherited variables that would point git at another repository. */
const GIT_LOCATION_VARS = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CEILING_DIRECTORIES",
]);

function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !GIT_LOCATION_VARS.has(key)) {
      env[key] = value;
    }
  }
  env["GIT_TERMINAL_PROMPT"] = "0";
  return env;
}

/** Runs git and returns stdout untouched; throws with git's stderr on a non-zero exit. */
function gitRaw(args: readonly string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString();
}

function git(args: readonly string[], cwd: string): string {
  return gitRaw(args, cwd).trim();
}

// ---------------------------------------------------------------------------
// Freeze point

/** The `epic-<N>` keys of sprint status's `development_status` that are `in-progress`, in Epic order; throws when the file is missing or malformed. */
export function inFlightEpics(root: string): string[] {
  const path = join(root, SPRINT_STATUS);
  if (!existsSync(path)) {
    throw new Error(`${SPRINT_STATUS} does not exist, so the freeze point cannot be checked`);
  }
  let data: unknown;
  try {
    data = Bun.YAML.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${SPRINT_STATUS} is not valid YAML: ${message(error)}`);
  }
  const development = isRecord(data) ? data["development_status"] : undefined;
  if (!isRecord(development)) {
    throw new Error(`${SPRINT_STATUS}: development_status must be a mapping`);
  }
  return Object.keys(development)
    .filter((key) => /^epic-[0-9]+$/.test(key) && development[key] === "in-progress")
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)) || compareUnits(a, b));
}

// ---------------------------------------------------------------------------
// Security override (decisions/OQ-12.md)

/** The path form of a security-release decision. */
export const SECURITY_DECISION = /^decisions\/PIN-SECURITY-[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
/** A GitHub Security Advisory ID, a CVE ID, or an https URL of printable ASCII with no space, `!` or `"`. */
const ADVISORY = /^(?:GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|CVE-[0-9]{4}-[0-9]{4,}|https:\/\/[\x23-\x7e]+)$/;

/** A validated `--security-override`: the advisory its decision names and the decision's repo-relative path. */
export interface SecurityOverride {
  advisory: string;
  decision: string;
}

/**
 * Validates the `--security-override` decision `path` (repo-relative) for `tag`: the path form, committed at HEAD
 * (`git show HEAD:<path>`), the working-tree copy present and equal to HEAD's, the Maintainer signature
 * (`exitSignatureProblems`), `tag` exactly <tag> and a well-formed `advisory`. Returns the override when there are
 * no problems, else null and every problem.
 */
export function securityOverrideProblems(root: string, path: string, tag: string): { override: SecurityOverride | null; problems: string[] } {
  if (!SECURITY_DECISION.test(path)) {
    return { override: null, problems: [`${JSON.stringify(path)} is not a decisions/PIN-SECURITY-<name>.md path`] };
  }
  const problems: string[] = [];
  let committed: string | null = null;
  try {
    committed = gitRaw(["show", `HEAD:${path}`], root);
  } catch {
    problems.push(`${path} is not committed at HEAD`);
  }
  const file = join(root, path);
  if (!existsSync(file)) {
    problems.push(`${path} is missing from the working tree`);
  } else if (committed !== null && readFileSync(file, "utf8") !== committed) {
    problems.push(`${path} differs from its committed copy at HEAD`);
  }
  if (committed === null) {
    return { override: null, problems };
  }
  problems.push(...exitSignatureProblems(committed).map((problem) => `${path}: ${problem}`));
  const parsed = parseFrontmatter(committed);
  if (parsed === null || typeof parsed === "string") {
    return { override: null, problems };
  }
  const { fields } = parsed;
  if (fields["tag"] !== tag) {
    problems.push(`${path}: tag is ${JSON.stringify(fields["tag"] ?? null)}, not ${JSON.stringify(tag)}`);
  }
  const advisory = fields["advisory"];
  if (typeof advisory !== "string" || !ADVISORY.test(advisory)) {
    problems.push(`${path}: advisory is ${JSON.stringify(advisory ?? null)}, not a GHSA-xxxx-xxxx-xxxx ID, a CVE-YYYY-NNNN ID or an https:// URL`);
  }
  if (problems.length > 0 || typeof advisory !== "string") {
    return { override: null, problems };
  }
  return { override: { advisory, decision: path }, problems: [] };
}

function describeOverride(override: SecurityOverride): string {
  return `${override.advisory} (${override.decision})`;
}

// ---------------------------------------------------------------------------
// Move mode

function checkTag(tag: string): void {
  if (!TAG.test(tag) || tag.includes("..") || tag.endsWith("/") || tag.endsWith(".lock")) {
    throw new UsageError(`${JSON.stringify(tag)} is not a valid tag name`);
  }
}

/** Resolves `<tag>` of `<base>/laravel/framework.git` to its commit (ls-remote, `^{}` wins) and tree (shallow clone); throws on a missing tag or a mismatch. */
export function resolveTag(base: string, tag: string): { commit: string; tree: string } {
  checkTag(tag);
  const url = `${base.replace(/\/+$/, "")}/${FRAMEWORK_REPO}.git`;
  const ref = `refs/tags/${tag}`;
  const listed = new Map<string, string>();
  for (const line of git(["ls-remote", "--", url, ref, `${ref}^{}`], tmpdir()).split("\n")) {
    const [sha, name] = line.split("\t");
    if (sha !== undefined && name !== undefined) {
      listed.set(name, sha);
    }
  }
  const commit = listed.get(`${ref}^{}`) ?? listed.get(ref);
  if (commit === undefined || !SHA.test(commit)) {
    throw new Error(`tag ${tag} was not found at ${url}`);
  }
  const dir = mkdtempSync(join(tmpdir(), "xaravel-pin-bump-"));
  try {
    const clone = join(dir, "framework");
    git(["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--no-tags", "--no-checkout", "--branch", tag, "--", url, clone], dir);
    const [head, tree] = git(["rev-parse", "HEAD", "HEAD^{tree}"], clone).split("\n");
    if (head !== commit) {
      throw new Error(`the clone of ${tag} is at commit ${head}, but ls-remote resolves it to ${commit}`);
    }
    if (tree === undefined || !SHA.test(tree)) {
      throw new Error(`could not read the tree of ${tag}`);
    }
    return { commit, tree };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Replaces only the `laravel/framework` line of the pin text with `laravel/framework <tag> <commit> <tree>`; every other byte is kept. */
export function rewriteFrameworkLine(text: string, tag: string, commit: string, tree: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((raw) => raw.replace(/#.*$/, "").trim().split(/\s+/)[0] === FRAMEWORK_REPO);
  if (index === -1) {
    throw new Error(`${UPSTREAM_PIN_FILE} has no ${FRAMEWORK_REPO} line`);
  }
  const cr = lines[index]!.endsWith("\r") ? "\r" : "";
  lines[index] = `${FRAMEWORK_REPO} ${tag} ${commit} ${tree}${cr}`;
  const result = lines.join("\n");
  // Fails on anything the pin parser would refuse.
  parsePin(result);
  return result;
}

// ---------------------------------------------------------------------------
// Inventory diff

export interface DiffItem {
  id: string;
  component: string;
  hash: string;
}

export interface ChangedItem extends DiffItem {
  previousHash: string;
}

export interface RenamedItem extends DiffItem {
  /** The new Test ID; `id` is the old one. */
  to: string;
}

export interface InventoryDiff {
  added: DiffItem[];
  changed: ChangedItem[];
  removed: DiffItem[];
  renamed: RenamedItem[];
}

function byComponentThenId(a: DiffItem, b: DiffItem): number {
  return compareUnits(a.component, b.component) || compareUnits(a.id, b.id);
}

function indexById(entries: readonly InventoryEntry[], label: string): Map<string, InventoryEntry> {
  const map = new Map<string, InventoryEntry>();
  for (const entry of entries) {
    if (map.has(entry.id)) {
      throw new Error(`${label} Inventory lists ${entry.id} twice`);
    }
    map.set(entry.id, entry);
  }
  return map;
}

/** Classifies every Test ID across all suites; each list is sorted by component, then id. */
export function diffInventories(oldEntries: readonly InventoryEntry[], newEntries: readonly InventoryEntry[]): InventoryDiff {
  const before = indexById(oldEntries, "the old");
  const after = indexById(newEntries, "the new");
  let added: DiffItem[] = [];
  let removed: DiffItem[] = [];
  const changed: ChangedItem[] = [];
  for (const entry of after.values()) {
    const old = before.get(entry.id);
    if (old === undefined) {
      added.push({ id: entry.id, component: entry.component, hash: entry.hash });
    } else if (old.hash !== entry.hash) {
      changed.push({ id: entry.id, component: entry.component, hash: entry.hash, previousHash: old.hash });
    }
  }
  for (const entry of before.values()) {
    if (!after.has(entry.id)) {
      removed.push({ id: entry.id, component: entry.component, hash: entry.hash });
    }
  }
  const count = new Map<string, number>();
  for (const item of [...added, ...removed]) {
    count.set(item.hash, (count.get(item.hash) ?? 0) + 1);
  }
  const renamed: RenamedItem[] = [];
  const renamedFrom = new Set<string>();
  const renamedTo = new Set<string>();
  for (const old of removed) {
    if (count.get(old.hash) !== 2) {
      continue;
    }
    const target = added.find((item) => item.hash === old.hash);
    if (target !== undefined && target.component === old.component) {
      renamed.push({ id: old.id, to: target.id, component: old.component, hash: old.hash });
      renamedFrom.add(old.id);
      renamedTo.add(target.id);
    }
  }
  added = added.filter((item) => !renamedTo.has(item.id));
  removed = removed.filter((item) => !renamedFrom.has(item.id));
  return {
    added: added.sort(byComponentThenId),
    changed: changed.sort(byComponentThenId),
    removed: removed.sort(byComponentThenId),
    renamed: renamed.sort(byComponentThenId),
  };
}

function suiteOf(name: string): Suite {
  const component = name.slice(0, -".jsonl".length);
  return FOREIGN_COMPONENTS.includes(component) ? (component as Suite) : "framework";
}

function inventoryNames(names: readonly string[]): string[] {
  return names.filter((name) => name.endsWith(".jsonl") && name !== NONDETERMINISM_FILE).sort(compareUnits);
}

/** Every Inventory entry in the working tree. */
export function readWorkingInventory(root: string): InventoryEntry[] {
  const dir = join(root, INVENTORY_DIR);
  if (!existsSync(dir)) {
    throw new Error(`${INVENTORY_DIR} does not exist`);
  }
  return inventoryNames(readdirSync(dir)).flatMap((name) => parseInventory(readFileSync(join(dir, name), "utf8"), `${INVENTORY_DIR}/${name}`, suiteOf(name)));
}

/** Every Inventory entry at commit `sha`, read with `git show`. */
export function readInventoryAt(root: string, sha: string): InventoryEntry[] {
  const listing = gitRaw(["ls-tree", "--name-only", sha, "--", `${INVENTORY_DIR}/`], root);
  const names = inventoryNames(listing.split("\n").filter((line) => line !== "").map((path) => path.slice(INVENTORY_DIR.length + 1)));
  if (names.length === 0) {
    throw new Error(`revision ${sha} has no Inventory files in ${INVENTORY_DIR}/`);
  }
  return names.flatMap((name) => {
    const path = `${INVENTORY_DIR}/${name}`;
    return parseInventory(gitRaw(["show", `${sha}:${path}`], root), `${sha.slice(0, 12)}:${path}`, suiteOf(name));
  });
}

// ---------------------------------------------------------------------------
// Expectations

/** An Expectations shard: its repo-relative path and its lines, parsed. */
export interface Shard {
  path: string;
  lines: Record<string, unknown>[];
}

export interface ExpectationRef {
  shard: string;
  variant: unknown;
  status: unknown;
  reason: unknown;
}

function walkJsonl(base: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort(compareUnits)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkJsonl(base, path, out);
    } else if (name.endsWith(".jsonl")) {
      out.push(relative(base, path).split("\\").join("/"));
    }
  }
}

/** Every `.jsonl` shard under `conformance/expectations/`, sorted by path; throws on a line that is not a JSON object with a string `id`. */
export function readExpectations(root: string): Shard[] {
  const dir = join(root, EXPECTATIONS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  const paths: string[] = [];
  walkJsonl(root, dir, paths);
  return paths.map((path) => {
    const text = readFileSync(join(root, path), "utf8");
    const raw = text.endsWith("\n") ? text.slice(0, -1) : text;
    const lines = raw === "" ? [] : raw.split("\n");
    return {
      path,
      lines: lines.map((line, index) => {
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch (error) {
          throw new Error(`${path}:${index + 1}: malformed JSON: ${message(error)}`);
        }
        if (!isRecord(value) || typeof value["id"] !== "string") {
          throw new Error(`${path}:${index + 1}: expected an Expectations object with a string id`);
        }
        return value;
      }),
    };
  });
}

/** The Expectations lines of `id`, sorted by shard then variant. */
export function expectationsFor(shards: readonly Shard[], id: string): ExpectationRef[] {
  const refs: ExpectationRef[] = [];
  for (const shard of shards) {
    for (const line of shard.lines) {
      if (line["id"] === id) {
        refs.push({ shard: shard.path, variant: line["variant"] ?? null, status: line["status"] ?? null, reason: line["reason"] ?? null });
      }
    }
  }
  return refs.sort((a, b) => compareUnits(a.shard, b.shard) || compareUnits(String(a.variant), String(b.variant)));
}

/** Serialises an Expectations line in AD-15 field order. */
function serialiseExpectation(line: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of EXPECTATION_KEYS) {
    ordered[key] = line[key] ?? null;
  }
  for (const [key, value] of Object.entries(line)) {
    if (!(EXPECTATION_KEYS as readonly string[]).includes(key)) {
      ordered[key] = value;
    }
  }
  return JSON.stringify(ordered);
}

/**
 * The shard edits of `--apply`: each touched shard's new text, or null to delete it. Changed IDs are reset to
 * skip / not-ported-yet / null / null, renamed IDs get the new id, removed IDs' lines are deleted. A shard with a
 * renamed line is re-sorted by id then variant in UTF-16 code units (stable), the order `expectations:check`
 * enforces, since a rename can move a line past another; otherwise line order is kept (a change or removal never
 * alters an id). Untouched shards are not returned.
 */
export function applyBump(shards: readonly Shard[], diff: InventoryDiff): Map<string, string | null> {
  const changed = new Set(diff.changed.map((item) => item.id));
  const removed = new Set(diff.removed.map((item) => item.id));
  const renamed = new Map(diff.renamed.map((item) => [item.id, item.to]));
  const edits = new Map<string, string | null>();
  for (const shard of shards) {
    let touched = false;
    let renamedHere = false;
    const out: Record<string, unknown>[] = [];
    for (const line of shard.lines) {
      const id = line["id"] as string;
      if (changed.has(id)) {
        out.push({ ...line, status: "skip", reason: "not-ported-yet", adapted: null, escalation: null });
        touched = true;
      } else if (renamed.has(id)) {
        out.push({ ...line, id: renamed.get(id)! });
        touched = true;
        renamedHere = true;
      } else if (removed.has(id)) {
        touched = true;
      } else {
        out.push(line);
      }
    }
    if (touched) {
      if (renamedHere) {
        // Must match `comparePairs` in tools/expectations/expectations.ts (not imported: it imports this module).
        out.sort((a, b) => compareUnits(String(a["id"]), String(b["id"])) || compareUnits(String(a["variant"]), String(b["variant"])));
      }
      edits.set(shard.path, out.length === 0 ? null : out.map((line) => `${serialiseExpectation(line)}\n`).join(""));
    }
  }
  return edits;
}

// ---------------------------------------------------------------------------
// Output

export interface BumpHeader {
  from: string;
  to: string;
  fromRev: string;
  applied: boolean;
  /** The `--security-override`, or null without the flag. */
  securityOverride: SecurityOverride | null;
}

/** The repo-relative path of the bump record. */
export function recordPath(from: string, to: string): string {
  return `${PIN_BUMPS_DIR}/${from}-to-${to}.jsonl`;
}

/** The stdout report: Added, Changed, Removed and Renamed, each with a count and one ID per line. */
export function renderReport(header: BumpHeader, diff: InventoryDiff): string {
  const section = (title: string, lines: readonly string[]): string => `${title} (${lines.length})\n${lines.map((line) => `  ${line}\n`).join("")}`;
  return [
    `Pin bump ${header.from} -> ${header.to} (from ${header.fromRev})\n`,
    header.securityOverride !== null ? `Security override: ${describeOverride(header.securityOverride)}\n` : "",
    section("Added", diff.added.map((item) => item.id)),
    section("Changed", diff.changed.map((item) => item.id)),
    section("Removed", diff.removed.map((item) => item.id)),
    section("Renamed", diff.renamed.map((item) => `${item.id} -> ${item.to}`)),
  ].join("");
}

/** The bump record: a header line, then one line per ID sorted by change, component and id. */
export function renderRecord(header: BumpHeader, diff: InventoryDiff, shards: readonly Shard[]): string {
  const first: Record<string, unknown> = { from: header.from, to: header.to, from_rev: header.fromRev, applied: header.applied };
  if (header.securityOverride !== null) {
    first["security_override"] = { advisory: header.securityOverride.advisory, decision: header.securityOverride.decision };
  }
  const lines = [JSON.stringify(first)];
  for (const item of diff.added) {
    lines.push(JSON.stringify({ change: "added", id: item.id, component: item.component, hash: item.hash }));
  }
  for (const item of diff.changed) {
    lines.push(JSON.stringify({ change: "changed", id: item.id, component: item.component, hash: item.hash, previous_hash: item.previousHash, expectations: expectationsFor(shards, item.id) }));
  }
  for (const item of diff.removed) {
    lines.push(JSON.stringify({ change: "removed", id: item.id, component: item.component, hash: item.hash, expectations: expectationsFor(shards, item.id) }));
  }
  for (const item of diff.renamed) {
    lines.push(JSON.stringify({ change: "renamed", id: item.id, to: item.to, component: item.component, hash: item.hash, expectations: expectationsFor(shards, item.id) }));
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** One backlog stub per Component with added, changed or renamed IDs, keyed by repo-relative path, sorted by Component. */
export function renderStubs(from: string, to: string, diff: InventoryDiff, shards: readonly Shard[]): Map<string, string> {
  const components = [...new Set([...diff.added, ...diff.changed, ...diff.renamed].map((item) => item.component))].sort(compareUnits);
  const stubs = new Map<string, string>();
  for (const component of components) {
    const mine = <T extends DiffItem>(items: readonly T[]): T[] => items.filter((item) => item.component === component);
    const parts = [`# Pin bump ${from} → ${to}: ${component}\n`];
    const added = mine(diff.added);
    if (added.length > 0) {
      parts.push(`\n## Added\n\nNew Upstream tests to port.\n\n${added.map((item) => `- \`${item.id}\`\n`).join("")}`);
    }
    const changed = mine(diff.changed);
    if (changed.length > 0) {
      const line = (item: ChangedItem): string => {
        const paths = [...new Set(expectationsFor(shards, item.id).map((ref) => ref.shard))];
        return `- \`${item.id}\`: ${paths.length === 0 ? "(no Expectations)" : paths.map((path) => `\`${path}\``).join(", ")}\n`;
      };
      parts.push(`\n## Changed\n\nUpstream changed these tests; re-port them. Their Expectations were reset to \`skip\` / \`not-ported-yet\`.\n\n${changed.map(line).join("")}`);
    }
    const renamed = mine(diff.renamed);
    if (renamed.length > 0) {
      parts.push(`\n## Renamed\n\nUpdate the \`portedTest\` ID of each.\n\n${renamed.map((item) => `- \`${item.id} -> ${item.to}\`\n`).join("")}`);
    }
    stubs.set(`${STUBS_DIR}/${to}/${component}.md`, parts.join(""));
  }
  return stubs;
}

// ---------------------------------------------------------------------------
// Modes

function frameworkEntry(pin: readonly PinEntry[]): PinEntry {
  return pin.find((entry) => entry.repo === FRAMEWORK_REPO)!;
}

function moveMode(root: string, tag: string, remoteBase: string, override: SecurityOverride | null): number {
  const { commit, tree } = resolveTag(remoteBase, tag);
  const file = join(root, UPSTREAM_PIN_FILE);
  const before = frameworkEntry(readPin(root)).tag;
  const fromRev = git(["rev-parse", "--verify", "HEAD^{commit}"], root);
  writeFileSync(file, rewriteFrameworkLine(readFileSync(file, "utf8"), tag, commit, tree));
  process.stdout.write(`${UPSTREAM_PIN_FILE}: ${FRAMEWORK_REPO} ${before} -> ${tag} ${commit} ${tree}\n`);
  const result = sync(root, { remoteBase });
  process.stdout.write(result.lines.map((line) => `${line}\n`).join(""));
  if (result.failures.length > 0) {
    process.stderr.write(`Upstream sync failed (the Pin was moved; re-run bun run upstream:sync):\n${result.failures.map((line) => `  ${line}\n`).join("")}`);
    return 1;
  }
  process.stdout.write(`\nThe Pin moved. Regenerate, then report the diff, by running these lines in order in one shell at the repository root:\n\n${regenerationSteps(tag, fromRev, override).map((step) => `${step}\n`).join("")}`);
  return 0;
}

function diffMode(root: string, tag: string, from: string, apply: boolean, override: SecurityOverride | null): number {
  const fromRev = git(["rev-parse", "--verify", "--end-of-options", `${from}^{commit}`], root);
  const oldPin = parsePin(gitRaw(["show", `${fromRev}:${UPSTREAM_PIN_FILE}`], root), `${from}:${UPSTREAM_PIN_FILE}`);
  const oldTag = frameworkEntry(oldPin).tag;
  if (oldTag === tag) {
    process.stderr.write(`--from ${from} already pins ${tag}; pass the revision before the Pin moved\n`);
    return 1;
  }
  const diff = diffInventories(readInventoryAt(root, fromRev), readWorkingInventory(root));
  const shards = readExpectations(root);
  if (apply && diff.added.length + diff.changed.length + diff.removed.length + diff.renamed.length === 0) {
    process.stderr.write(`the Inventory matches --from ${from}; regenerate it first (the steps move mode printed); nothing was written\n`);
    return 1;
  }
  const record = recordPath(oldTag, tag);
  const recordFile = join(root, record);
  if (existsSync(recordFile)) {
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(readFileSync(recordFile, "utf8").split("\n")[0]!) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`${record}: unreadable header: ${message(error)}`);
    }
    if (existing["applied"] !== false) {
      process.stderr.write(`${record} is already applied; nothing was changed\n`);
      return 1;
    }
    const recorded = existing["security_override"];
    if (isRecord(recorded) && (override === null || recorded["advisory"] !== override.advisory || recorded["decision"] !== override.decision)) {
      const was = `--security-override ${String(recorded["decision"])} (advisory ${String(recorded["advisory"])})`;
      const now = override === null ? "no --security-override" : `--security-override ${override.decision} (advisory ${override.advisory})`;
      process.stderr.write(`${record} was reported with ${was}, but this run has ${now}; pass the same override; nothing was changed\n`);
      return 1;
    }
  }
  const header: BumpHeader = { from: oldTag, to: tag, fromRev, applied: apply, securityOverride: override };
  process.stdout.write(renderReport(header, diff));
  const recordText = renderRecord(header, diff, shards);
  const written: string[] = [];
  if (apply) {
    for (const [path, text] of applyBump(shards, diff)) {
      if (text === null) {
        rmSync(join(root, path));
        written.push(`deleted ${path}`);
      } else {
        writeFileSync(join(root, path), text);
        written.push(`edited ${path}`);
      }
    }
    for (const [path, text] of renderStubs(oldTag, tag, diff, shards)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
      written.push(`wrote ${path}`);
    }
  }
  mkdirSync(dirname(recordFile), { recursive: true });
  writeFileSync(recordFile, recordText);
  written.push(`wrote ${record}`);
  process.stdout.write(`\n${written.map((line) => `${line}\n`).join("")}`);
  return 0;
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = ["Usage:", "  bun tools/pin-bump/pin-bump.ts <tag> [--from <rev>] [--apply] [--remote <base>] [--root <dir>] [--security-override <decision-file>]"].join("\n");

interface Options {
  tag: string;
  from: string;
  apply: boolean;
  remote: string;
  root: string;
  /** The `--security-override` decision path, as given; null without the flag. */
  securityOverride: string | null;
}

export function parseOptions(argv: readonly string[]): Options {
  const options: Partial<Options> & { apply: boolean } = { apply: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      if (options.tag !== undefined) {
        throw new UsageError(`Unexpected argument: ${arg}`);
      }
      checkTag(arg);
      options.tag = arg;
      continue;
    }
    if (!["--from", "--apply", "--remote", "--root", "--security-override"].includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--from") {
      options.from = value;
    } else if (arg === "--remote") {
      options.remote = value;
    } else if (arg === "--security-override") {
      options.securityOverride = value;
    } else {
      options.root = resolve(value);
    }
  }
  if (options.tag === undefined) {
    throw new UsageError("Missing <tag>");
  }
  return {
    tag: options.tag,
    from: options.from ?? "HEAD",
    apply: options.apply,
    remote: options.remote ?? "https://github.com",
    root: options.root ?? resolve(import.meta.dir, "..", ".."),
    securityOverride: options.securityOverride ?? null,
  };
}

export function main(argv: readonly string[]): number {
  try {
    const options = parseOptions(argv);
    let override: SecurityOverride | null = null;
    if (options.securityOverride !== null) {
      const checked = securityOverrideProblems(options.root, options.securityOverride, options.tag);
      if (checked.override === null) {
        process.stderr.write(`pin:bump refused: --security-override ${options.securityOverride} is not a valid security-release decision (decisions/OQ-12.md):\n${checked.problems.map((problem) => `  ${problem}\n`).join("")}`);
        return 1;
      }
      override = checked.override;
    }
    const epics = inFlightEpics(options.root);
    if (epics.length > 0) {
      if (override === null) {
        process.stderr.write(`pin:bump refused: the Pin moves only at a freeze point, and these Epics are in progress (${SPRINT_STATUS}):\n${epics.map((epic) => `  ${epic}\n`).join("")}`);
        return 1;
      }
      process.stderr.write(`pin:bump: freeze point overridden for a security release, ${describeOverride(override)}; in progress: ${epics.join(", ")}\n`);
    }
    const current = frameworkEntry(readPin(options.root)).tag;
    return current === options.tag ? diffMode(options.root, options.tag, options.from, options.apply, override) : moveMode(options.root, options.tag, options.remote, override);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`pin:bump failed: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
