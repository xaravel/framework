// The Upstream snapshot and the Pin record (Story 2.1, FR-1, AD-15).
//
//   bun tools/upstream/upstream.ts sync [--remote <base>] [--root <dir>]
//       for each entry of `conformance/baseline-pin`, shallow-clones
//       `<base>/<repo>.git` (default base https://github.com) at the pinned
//       tag into a temp sibling, verifies the commit and the git tree hash,
//       removes `.git`, clears the write bits and swaps the clone in as
//       `conformance/upstream/<name>/`. A directory whose tree hash already
//       matches the pin is left alone and nothing is fetched for it.
//   bun tools/upstream/upstream.ts check [--root <dir>]
//       recomputes each directory's git tree hash, in pure TypeScript with no
//       git and no network, and fails on a missing directory or any
//       difference from the pin
//
// The pin holds one line per Upstream repository:
//
//   <repo> <tag> <commit> <tree>
//
// `#` comments and blank lines are ignored. The tree hash is git's own
// (`git rev-parse <tag>^{tree}`), so anyone can verify it against GitHub.
//
// The reader API (`upstreamPath`, `readUpstream`) reads only from the snapshot
// and never fetches.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const UPSTREAM_PIN_FILE = "conformance/baseline-pin";
export const UPSTREAM_DIR = "conformance/upstream";
/** The Upstream repositories, in pin order, with each snapshot directory name. */
export const UPSTREAM_REPOS = [
  { repo: "laravel/framework", name: "framework" },
  { repo: "laravel/ai", name: "ai" },
  { repo: "laravel/mcp", name: "mcp" },
  { repo: "laravel/boost", name: "boost" },
] as const;

export type UpstreamName = (typeof UPSTREAM_REPOS)[number]["name"];

export interface PinEntry {
  repo: string;
  name: UpstreamName;
  tag: string;
  commit: string;
  tree: string;
}

const SHA = /^[0-9a-f]{40}$/;
/** A git tag name we accept: no leading `-`, no whitespace, no `..`, nothing git refuses. */
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/;
const MISSING_HINT = "run bun run upstream:sync";
/** A temp clone sibling that a killed sync left behind. */
const STALE_TEMP = /^\.[a-z]+\.tmp-/;

// ---------------------------------------------------------------------------
// Pin

/** Parses the pin text; throws naming the file (and line) on anything malformed. */
export function parsePin(text: string, file: string = UPSTREAM_PIN_FILE): PinEntry[] {
  const found = new Map<string, PinEntry>();
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") {
      return;
    }
    const at = `${file}:${index + 1}`;
    const fields = line.split(/\s+/);
    if (fields.length !== 4) {
      throw new Error(`${at}: expected "<repo> <tag> <commit> <tree>", got ${JSON.stringify(raw.trim())}`);
    }
    const [repo, tag, commit, tree] = fields as [string, string, string, string];
    const known = UPSTREAM_REPOS.find((entry) => entry.repo === repo);
    if (known === undefined) {
      throw new Error(`${at}: unknown repository ${JSON.stringify(repo)}; expected one of ${UPSTREAM_REPOS.map((entry) => entry.repo).join(", ")}`);
    }
    if (found.has(repo)) {
      throw new Error(`${at}: duplicate entry for ${repo}`);
    }
    if (!TAG.test(tag) || tag.includes("..") || tag.endsWith("/") || tag.endsWith(".lock")) {
      throw new Error(`${at}: ${repo} tag ${JSON.stringify(tag)} is not a valid tag name`);
    }
    if (!SHA.test(commit)) {
      throw new Error(`${at}: ${repo} commit ${JSON.stringify(commit)} is not a 40-character lowercase hex SHA`);
    }
    if (!SHA.test(tree)) {
      throw new Error(`${at}: ${repo} tree ${JSON.stringify(tree)} is not a 40-character lowercase hex SHA`);
    }
    found.set(repo, { repo, name: known.name, tag, commit, tree });
  });
  if (found.size === 0) {
    throw new Error(`${file} is empty`);
  }
  const missing = UPSTREAM_REPOS.filter((entry) => !found.has(entry.repo)).map((entry) => entry.repo);
  if (missing.length > 0) {
    throw new Error(`${file}: missing entry for ${missing.join(", ")}`);
  }
  return UPSTREAM_REPOS.map((entry) => found.get(entry.repo)!);
}

/** Reads and parses `<root>/conformance/baseline-pin`; throws when it is missing or malformed. */
export function readPin(root: string): PinEntry[] {
  const file = join(root, UPSTREAM_PIN_FILE);
  if (!existsSync(file)) {
    throw new Error(`${UPSTREAM_PIN_FILE} does not exist`);
  }
  return parsePin(readFileSync(file, "utf8"));
}

/** The `laravel/framework` tag: the Baseline Pin named in release notes and READMEs. */
export function frameworkTag(root: string): string {
  return readPin(root).find((entry) => entry.repo === "laravel/framework")!.tag;
}

// ---------------------------------------------------------------------------
// Tree hash

function gitObject(type: "blob" | "tree", body: Buffer): Buffer {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]))
    .digest();
}

function treeOf(dir: Buffer): Buffer {
  const entries: { key: Buffer; bytes: Buffer }[] = [];
  for (const name of readdirSync(dir, { encoding: "buffer" })) {
    const path = Buffer.concat([dir, Buffer.from("/"), name]);
    const stat = lstatSync(path);
    let mode: string;
    let sha: Buffer;
    let key = name;
    if (stat.isSymbolicLink()) {
      mode = "120000";
      sha = gitObject("blob", readlinkSync(path, { encoding: "buffer" }));
    } else if (stat.isDirectory()) {
      mode = "40000";
      sha = treeOf(path);
      // git compares a directory's name as `name/`.
      key = Buffer.concat([name, Buffer.from("/")]);
    } else if (stat.isFile()) {
      mode = (stat.mode & 0o100) !== 0 ? "100755" : "100644";
      sha = gitObject("blob", readFileSync(path));
    } else {
      throw new Error(`${path.toString()} is not a file, directory or symlink`);
    }
    entries.push({ key, bytes: Buffer.concat([Buffer.from(`${mode} `), name, Buffer.from([0]), sha]) });
  }
  entries.sort((a, b) => Buffer.compare(a.key, b.key));
  return gitObject("tree", Buffer.concat(entries.map((entry) => entry.bytes)));
}

/** git's tree hash of `dir`, computed without git: equals `git rev-parse HEAD^{tree}` of a clean checkout. */
export function treeHash(dir: string): string {
  if (!lstatSync(dir).isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
  return treeOf(Buffer.from(resolve(dir))).toString("hex");
}

// ---------------------------------------------------------------------------
// Files

function walk(dir: string, visit: (path: string) => void): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      walk(path, visit);
      visit(path);
    } else if (!stat.isSymbolicLink()) {
      visit(path);
    }
  }
}

/** Clears every write bit on the entries under `dir` (not `dir` itself); symlinks are left alone. */
function clearWriteBitsBelow(dir: string): void {
  walk(dir, (path) => chmodSync(path, lstatSync(path).mode & 0o7555));
}

/** Removes `dir` even when it was made read-only. */
function removeTree(dir: string): void {
  if (!existsSync(dir)) {
    return;
  }
  if (lstatSync(dir).isDirectory()) {
    // Restore the owner's bits from the top down, so each directory can be listed and emptied.
    const open = (path: string): void => {
      chmodSync(path, lstatSync(path).mode | 0o700);
      for (const name of readdirSync(path)) {
        const child = join(path, name);
        if (lstatSync(child).isDirectory()) {
          open(child);
        }
      }
    };
    open(dir);
  }
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Sync

/** The inherited variables that would point git at another repository (a hook's GIT_DIR, say). */
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

/** git's environment without the repository-location variables; everything else (TLS, SSH, config) is kept. */
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

function git(args: readonly string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString().trim();
}

export interface SyncResult {
  /** One line per repository: up to date, or synced. */
  lines: string[];
  /** One line per repository that failed. */
  failures: string[];
}

function syncOne(root: string, base: string, entry: PinEntry): string {
  const parent = join(root, UPSTREAM_DIR);
  const target = join(parent, entry.name);
  const label = `${entry.repo} ${entry.tag}`;
  if (existsSync(target)) {
    let actual: string | null = null;
    try {
      actual = treeHash(target);
    } catch {
      actual = null;
    }
    if (actual === entry.tree) {
      // Content matches; restore read-only in case someone ran `chmod -R u+w` (modes beyond the exec bit are not hashed).
      clearWriteBitsBelow(target);
      chmodSync(target, 0o555);
      return `${label}: ${UPSTREAM_DIR}/${entry.name} is up to date`;
    }
  }
  mkdirSync(parent, { recursive: true });
  // The temp clone is a sibling of the target, so the swap is a rename within one directory.
  const clone = mkdtempSync(join(parent, `.${entry.name}.tmp-`));
  let swapped = false;
  try {
    const url = `${base}/${entry.repo}.git`;
    // core.autocrlf and core.eol are forced so a user's CRLF settings cannot rewrite `text=auto` files on checkout.
    git(["-c", "core.autocrlf=false", "-c", "core.eol=lf", "-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--no-tags", "--branch", entry.tag, "--", url, clone], parent);
    const commit = git(["rev-parse", "HEAD"], clone);
    if (commit !== entry.commit) {
      throw new Error(`tag ${entry.tag} resolves to commit ${commit}, but ${UPSTREAM_PIN_FILE} records ${entry.commit}`);
    }
    const tree = git(["rev-parse", "HEAD^{tree}"], clone);
    if (tree !== entry.tree) {
      throw new Error(`commit ${commit} has tree ${tree}, but ${UPSTREAM_PIN_FILE} records ${entry.tree}`);
    }
    rmSync(join(clone, ".git"), { recursive: true, force: true });
    const checkedOut = treeHash(clone);
    if (checkedOut !== entry.tree) {
      throw new Error(`the checkout hashes to ${checkedOut}, not the pinned tree ${entry.tree}`);
    }
    // A directory without its own write bit cannot be renamed on every platform, so the top is cleared last.
    clearWriteBitsBelow(clone);
    removeTree(target);
    renameSync(clone, target);
    swapped = true;
    // mkdtemp made it 0700; the snapshot is world-readable like any checkout.
    chmodSync(target, 0o555);
  } finally {
    if (!swapped) {
      removeTree(clone);
    }
  }
  return `${label}: synced ${UPSTREAM_DIR}/${entry.name} at ${entry.commit}`;
}

/** Brings every snapshot directory to its pinned tag; a failed repository leaves its old directory as it was. */
export function sync(root: string, options: { remoteBase?: string } = {}): SyncResult {
  const base = (options.remoteBase ?? "https://github.com").replace(/\/+$/, "");
  const pin = readPin(root);
  const parent = join(root, UPSTREAM_DIR);
  // A killed earlier run can leave a temp sibling behind.
  if (existsSync(parent)) {
    for (const name of readdirSync(parent)) {
      if (STALE_TEMP.test(name)) {
        removeTree(join(parent, name));
      }
    }
  }
  const result: SyncResult = { lines: [], failures: [] };
  for (const entry of pin) {
    try {
      result.lines.push(syncOne(root, base, entry));
    } catch (error) {
      result.failures.push(`${entry.repo} ${entry.tag}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Check

export interface CheckResult {
  /** One line per verified directory. */
  verified: string[];
  /** One line per missing or modified directory. */
  problems: string[];
}

/** Verifies every snapshot directory against the pin, with no git and no network. */
export function check(root: string): CheckResult {
  const result: CheckResult = { verified: [], problems: [] };
  const pin = readPin(root);
  // Anything else in the snapshot root is unverified content that a later tool could read.
  const parent = join(root, UPSTREAM_DIR);
  if (existsSync(parent)) {
    const pinned = new Set<string>(pin.map((entry) => entry.name));
    for (const name of readdirSync(parent).sort()) {
      if (pinned.has(name)) {
        continue;
      }
      result.problems.push(
        STALE_TEMP.test(name)
          ? `${UPSTREAM_DIR}/${name} is a stale temp clone; ${MISSING_HINT} to remove it`
          : `${UPSTREAM_DIR}/${name} is not in ${UPSTREAM_PIN_FILE}; remove it`,
      );
    }
  }
  for (const entry of pin) {
    const dir = `${UPSTREAM_DIR}/${entry.name}`;
    const path = join(root, dir);
    if (!existsSync(path)) {
      result.problems.push(`${dir} (${entry.repo} ${entry.tag}) is missing; ${MISSING_HINT}`);
      continue;
    }
    let actual: string;
    try {
      actual = treeHash(path);
    } catch (error) {
      result.problems.push(`${dir} (${entry.repo} ${entry.tag}) cannot be hashed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (actual === entry.tree) {
      result.verified.push(`${dir} (${entry.repo} ${entry.tag}) matches tree ${entry.tree}`);
    } else {
      result.problems.push(`${dir} (${entry.repo} ${entry.tag}) is modified: expected tree ${entry.tree}, actual ${actual}; ${MISSING_HINT} to restore it`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reader

/** The absolute path of `rel` inside snapshot `name`; throws on an unknown name, an escape or a missing snapshot. */
export function upstreamPath(root: string, name: string, rel: string): string {
  if (!UPSTREAM_REPOS.some((entry) => entry.name === name)) {
    throw new Error(`unknown Upstream ${JSON.stringify(name)}; expected one of ${UPSTREAM_REPOS.map((entry) => entry.name).join(", ")}`);
  }
  const dir = resolve(root, UPSTREAM_DIR, name);
  if (!existsSync(dir)) {
    throw new Error(`${UPSTREAM_DIR}/${name} is missing; ${MISSING_HINT}`);
  }
  const path = resolve(dir, rel);
  const inside = (base: string, candidate: string): boolean => {
    const r = relative(base, candidate);
    return r === "" || (!isAbsolute(r) && r !== ".." && !r.startsWith(`..${sep}`));
  };
  if (isAbsolute(rel) || rel.includes("\0") || !inside(dir, path)) {
    throw new Error(`${JSON.stringify(rel)} is outside ${UPSTREAM_DIR}/${name}`);
  }
  if (existsSync(path) && !inside(realpathSync(dir), realpathSync(path))) {
    throw new Error(`${JSON.stringify(rel)} resolves outside ${UPSTREAM_DIR}/${name}`);
  }
  return path;
}

/** Reads `rel` from snapshot `name` as UTF-8; never fetches. */
export function readUpstream(root: string, name: string, rel: string): string {
  return readFileSync(upstreamPath(root, name, rel), "utf8");
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = [
  "Usage:",
  "  bun tools/upstream/upstream.ts sync [--remote <base>] [--root <dir>]",
  "  bun tools/upstream/upstream.ts check [--root <dir>]",
].join("\n");

function parseOptions(argv: readonly string[], allowed: readonly string[]): { root: string; remote: string | null } {
  const options = { root: resolve(import.meta.dir, "..", ".."), remote: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      options.root = resolve(value);
    } else {
      options.remote = value;
    }
  }
  return options;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "sync": {
        const options = parseOptions(rest, ["--remote", "--root"]);
        const result = sync(options.root, options.remote === null ? {} : { remoteBase: options.remote });
        process.stdout.write(result.lines.map((line) => `${line}\n`).join(""));
        if (result.failures.length > 0) {
          process.stderr.write(`Upstream sync failed:\n${result.failures.map((line) => `  ${line}\n`).join("")}`);
          return 1;
        }
        return 0;
      }
      case "check": {
        const options = parseOptions(rest, ["--root"]);
        const result = check(options.root);
        process.stdout.write(result.verified.map((line) => `${line}\n`).join(""));
        if (result.problems.length > 0) {
          process.stderr.write(`Upstream snapshot check failed (FR-1, AD-15):\n${result.problems.map((line) => `  ${line}\n`).join("")}`);
          return 1;
        }
        process.stdout.write(`Upstream snapshot OK: ${result.verified.length} directories verified.\n`);
        return 0;
      }
      default:
        throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Upstream ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
