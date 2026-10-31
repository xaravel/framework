// Pinned vendor source for the runtime builtin scan (epic-15-retro-item-7).
//
// `tools/scans/vendor-ports.jsonl` records which vendor libraries each
// Component ports (AD-22's table, each Epic's "Owns port(s)" line, and
// ESC-15.2-4). A Component's vendor packages are its rows, plus its own
// `upstream` when its `kind` is `xaravel` and the lock names that package.
//
// Each package is looked up in the Oracle's committed `composer.lock`
// (`conformance/oracle/locks/<repo>/composer.lock`, `packages` and
// `packages-dev`), and its source is read from
// `.cache/vendor/<package>@<commit>/`, the commit being the lock's
// `source.reference`. The git tree hash recorded on fetch sits beside it in
// `.cache/vendor/<package>@<commit>.tree` and is re-checked on every scan.
//
// Only `syncVendor` touches the network: a shallow fetch of exactly the
// pinned commit into a temp sibling, verified (`HEAD` equals the lock's
// commit, the checkout hashes to `HEAD^{tree}`), made read-only and renamed
// into place. A failure leaves nothing behind.
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compareUnits } from "../oracle/request";
import type { PackageRow } from "../scaffold/table";
import { treeHash } from "../upstream/upstream";
import { phpFiles } from "./php";

export const VENDOR_PORTS_FILE = "tools/scans/vendor-ports.jsonl";
export const VENDOR_CACHE_DIR = ".cache/vendor";
export const LOCKS_DIR = "conformance/oracle/locks";
const GITHUB = "https://github.com";
const SHA = /^[0-9a-f]{40}$/;
const PACKAGE_NAME = /^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*$/;
const STALE_TEMP = /^\.tmp-/;

/** The Components whose lock is their own repository's; every other Component reads the framework lock. */
const OWN_LOCK: readonly string[] = ["ai", "mcp", "boost"];

export interface VendorPort {
  component: string;
  package: string;
  source: string;
}

/** A vendor package as the lock pins it. */
export interface VendorPackage {
  name: string;
  /** The lock file, relative to the root. */
  lock: string;
  url: string;
  commit: string;
  autoload: Autoload;
}

interface Autoload {
  "psr-4"?: Record<string, string | string[]>;
  "psr-0"?: Record<string, string | string[]>;
  classmap?: string[];
  files?: string[];
  "exclude-from-classmap"?: string[];
}

interface LockPackage {
  name?: unknown;
  source?: { url?: unknown; reference?: unknown };
  autoload?: Autoload;
}

/** Reads and validates `vendor-ports.jsonl`; a missing file has no rows. Every row's Component must be in `table`. */
export function readVendorPorts(root: string, table: readonly PackageRow[]): VendorPort[] {
  const path = join(root, VENDOR_PORTS_FILE);
  if (!existsSync(path)) {
    return [];
  }
  const components = new Set(table.map((row) => row.name));
  const rows: VendorPort[] = [];
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line === "") {
        return;
      }
      const where = `${VENDOR_PORTS_FILE}:${i + 1}`;
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        throw new Error(`${where}: not a JSON line`);
      }
      const r = row as Record<string, unknown>;
      const keys = typeof row === "object" && row !== null && !Array.isArray(row) ? Object.keys(r).sort(compareUnits).join(",") : "";
      if (keys !== "component,package,source" || typeof r["component"] !== "string" || typeof r["package"] !== "string" || typeof r["source"] !== "string" || r["source"] === "") {
        throw new Error(`${where}: a row is {"component": <name>, "package": <composer name>, "source": <citation>}`);
      }
      if (!components.has(r["component"])) {
        throw new Error(`${where}: ${JSON.stringify(r["component"])} is not a Component of tools/scaffold/packages.jsonl`);
      }
      if (!PACKAGE_NAME.test(r["package"])) {
        throw new Error(`${where}: ${JSON.stringify(r["package"])} is not a composer package name`);
      }
      rows.push({ component: r["component"], package: r["package"], source: r["source"] });
    });
  return rows;
}

/** The lock file (relative to the root) a Component's vendor packages are pinned in. */
export function lockFor(component: string): string {
  return `${LOCKS_DIR}/${OWN_LOCK.includes(component) ? component : "framework"}/composer.lock`;
}

/** Every package of a lock file, by name; fails when the lock is missing or malformed. */
export function readLock(root: string, lock: string): Map<string, LockPackage> {
  const path = join(root, lock);
  if (!existsSync(path)) {
    throw new Error(`${lock} does not exist`);
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${lock} is not JSON`);
  }
  const out = new Map<string, LockPackage>();
  for (const key of ["packages", "packages-dev"]) {
    const list = (data as Record<string, unknown>)[key];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const entry of list as LockPackage[]) {
      if (typeof entry.name === "string") {
        out.set(entry.name, entry);
      }
    }
  }
  return out;
}

/** The pinned entry of `name` in `lock`; fails when the lock does not name it or pins no git commit. */
export function lockedPackage(root: string, lock: string, name: string, packages: Map<string, LockPackage> = readLock(root, lock)): VendorPackage {
  const entry = packages.get(name);
  if (entry === undefined) {
    throw new Error(`vendor package ${name} is not in ${lock}`);
  }
  const url = entry.source?.url;
  const commit = entry.source?.reference;
  if (typeof url !== "string" || typeof commit !== "string" || !SHA.test(commit)) {
    throw new Error(`vendor package ${name} has no git source.url and 40-hex source.reference in ${lock}`);
  }
  return { name, lock, url, commit, autoload: entry.autoload ?? {} };
}

/** The vendor packages `component` ports, sorted by name: its rows, plus its own `upstream` for a `kind: xaravel` row the lock names. */
export function vendorPackages(root: string, component: string, table: readonly PackageRow[], ports: readonly VendorPort[], includeOwnUpstream = true): VendorPackage[] {
  const row = table.find((r) => r.name === component);
  const names = ports.filter((p) => p.component === component).map((p) => p.package);
  const lock = lockFor(component);
  const ownUpstream = includeOwnUpstream && row !== undefined && row.kind === "xaravel" && row.upstream !== null && !row.upstream.startsWith("illuminate/");
  if (names.length === 0 && !ownUpstream) {
    return [];
  }
  const packages = readLock(root, lock);
  if (ownUpstream && packages.has(row.upstream!) && !names.includes(row.upstream!)) {
    names.push(row.upstream!);
  }
  return [...new Set(names)].sort(compareUnits).map((name) => lockedPackage(root, lock, name, packages));
}

/** The cache directory of `pkg`, relative to the root. */
export function vendorCacheRel(pkg: Pick<VendorPackage, "name" | "commit">): string {
  return `${VENDOR_CACHE_DIR}/${pkg.name}@${pkg.commit}`;
}

/** The fetch URL of `pkg`: its `source.url`, with `https://github.com` replaced by `remoteBase` when given. */
export function vendorUrl(pkg: VendorPackage, remoteBase: string | null): string {
  if (remoteBase === null) {
    return pkg.url;
  }
  if (!pkg.url.startsWith(`${GITHUB}/`)) {
    throw new Error(`vendor package ${pkg.name}: --remote replaces ${GITHUB}, but ${pkg.lock} gives source.url ${pkg.url}`);
  }
  return `${remoteBase.replace(/\/+$/, "")}${pkg.url.slice(GITHUB.length)}`;
}

export type VendorState = "verified" | "missing" | "modified";

/** Whether `pkg`'s cached source is present, with its tree file, and still hashes to the recorded tree. */
export function verifyVendor(root: string, pkg: VendorPackage): VendorState {
  const dir = join(root, vendorCacheRel(pkg));
  const treeFile = `${dir}.tree`;
  if (!existsSync(dir) || !existsSync(treeFile)) {
    return "missing";
  }
  const recorded = readFileSync(treeFile, "utf8").trim();
  let actual: string | null;
  try {
    actual = treeHash(dir);
  } catch {
    actual = null;
  }
  return actual === recorded ? "verified" : "modified";
}

/** The `.php` files `pkg`'s autoload rules name, relative to the package root, sorted. */
export function autoloadFiles(root: string, pkg: VendorPackage): string[] {
  const base = join(root, vendorCacheRel(pkg));
  const a = pkg.autoload;
  const dirs: string[] = [];
  for (const map of [a["psr-4"], a["psr-0"]]) {
    for (const value of Object.values(map ?? {})) {
      dirs.push(...(Array.isArray(value) ? value : [value]));
    }
  }
  dirs.push(...(a.classmap ?? []));
  const out = new Set<string>();
  const add = (rel: string): void => {
    out.add(rel.split("\\").join("/").replace(/^\.\//, ""));
  };
  for (const dir of dirs) {
    const path = join(base, dir);
    if (!existsSync(path)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      phpFiles(path, base).forEach(add);
    } else if (path.endsWith(".php")) {
      add(dir);
    }
  }
  const excluded = (a["exclude-from-classmap"] ?? []).map((p) => p.replace(/^\/+|\/+$/g, "")).filter((p) => p !== "");
  const kept = [...out].filter((rel) => !excluded.some((segment) => `/${rel}`.includes(`/${segment}/`)));
  for (const file of a.files ?? []) {
    if (existsSync(join(base, file))) {
      kept.push(file.split("\\").join("/").replace(/^\.\//, ""));
    }
  }
  return [...new Set(kept)].sort(compareUnits);
}

// ---------------------------------------------------------------------------
// Fetch (mirrors tools/upstream/upstream.ts's clone-verify-swap)

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

function git(args: readonly string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString().trim();
}

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

function clearWriteBitsBelow(dir: string): void {
  walk(dir, (path) => chmodSync(path, lstatSync(path).mode & 0o7555));
}

/** Removes `path` even when it was made read-only. */
function removeTree(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  if (lstatSync(path).isDirectory()) {
    const open = (dir: string): void => {
      chmodSync(dir, lstatSync(dir).mode | 0o700);
      for (const name of readdirSync(dir)) {
        const child = join(dir, name);
        if (lstatSync(child).isDirectory()) {
          open(child);
        }
      }
    };
    open(path);
  }
  rmSync(path, { recursive: true, force: true });
}

/**
 * Fetches `pkg` at its pinned commit into `.cache/vendor/<package>@<commit>/` and records its tree hash beside it.
 * `remoteBase` replaces the `https://github.com` prefix of the lock's `source.url`. On failure nothing is left behind.
 */
export function syncVendor(root: string, pkg: VendorPackage, options: { remoteBase?: string | null } = {}): void {
  const cache = join(root, VENDOR_CACHE_DIR);
  mkdirSync(cache, { recursive: true });
  for (const name of readdirSync(cache)) {
    if (STALE_TEMP.test(name)) {
      removeTree(join(cache, name));
    }
  }
  const target = join(root, vendorCacheRel(pkg));
  const treeFile = `${target}.tree`;
  const temp = mkdtempSync(join(cache, ".tmp-"));
  const clone = join(temp, "src");
  let createdParent: string | null = null;
  // Set just before the old cache is removed: a failure before then leaves the existing cache as it was.
  let swapping = false;
  try {
    mkdirSync(clone);
    const url = vendorUrl(pkg, options.remoteBase ?? null);
    // No templates and no hooks: the user's git setup runs nothing in the fetched checkout.
    git(["init", "--quiet", "--template="], clone);
    git(["-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", "-c", "core.eol=lf", "fetch", "--quiet", "--depth", "1", "--no-tags", "--", url, pkg.commit], clone);
    git(["-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", "-c", "core.eol=lf", "-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], clone);
    const commit = git(["rev-parse", "HEAD"], clone);
    if (commit !== pkg.commit) {
      throw new Error(`fetched commit ${commit}, but ${pkg.lock} pins ${pkg.commit}`);
    }
    const tree = git(["rev-parse", "HEAD^{tree}"], clone);
    rmSync(join(clone, ".git"), { recursive: true, force: true });
    const checkedOut = treeHash(clone);
    if (checkedOut !== tree) {
      throw new Error(`the checkout hashes to ${checkedOut}, not the commit's tree ${tree}`);
    }
    writeFileSync(join(temp, "tree"), `${tree}\n`);
    clearWriteBitsBelow(clone);
    swapping = true;
    removeTree(target);
    removeTree(treeFile);
    const parent = dirname(target);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
      createdParent = parent;
    }
    renameSync(clone, target);
    renameSync(join(temp, "tree"), treeFile);
    // A directory without its own write bit cannot be renamed on every platform, so the top is cleared last.
    chmodSync(target, 0o555);
    chmodSync(treeFile, 0o444);
    createdParent = null;
  } catch (error) {
    if (swapping) {
      removeTree(target);
      removeTree(treeFile);
    }
    if (createdParent !== null && readdirSync(createdParent).length === 0) {
      rmSync(createdParent, { recursive: true, force: true });
    }
    throw new Error(`vendor package ${pkg.name} at ${pkg.commit}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    removeTree(temp);
  }
}
