// The lockstep release tool (Story 1.8, AD-18, FR-13, NFR-11).
//
//   bun tools/release/release.ts stamp [--root <dir>]
//       copies the root `package.json` version into every workspace, then
//       refreshes `bun.lock` (`bun install --lockfile-only`) if any changed
//       or the lock holds a stale workspace version
//   bun tools/release/release.ts check [--root <dir>]
//       fails when any workspace's version, or any `bun.lock` workspace
//       entry's version, differs from the root's, or a public workspace's
//       package.json lacks the `repository` that provenance needs
//   bun tools/release/release.ts gate --tag <tag> --repo <owner/name>
//                                     --sha <commit>
//                                     [--github-output <file>] [--root <dir>]
//       decides whether a pushed tag publishes; appends `publish=…` and
//       `reason=…` to the file and prints the reason. After the tag check it
//       asks the GitHub API (`GITHUB_API_URL`, default https://api.github.com;
//       token from `GH_TOKEN`) to compare `main...<commit>`, and refuses
//       unless the tagged commit is on `main` (`identical` or `behind`). Then
//       it reads the live `release` environment and refuses unless it has
//       required reviewers, every one is the Maintainer, and administrators
//       cannot bypass them (`can_admins_bypass: false`)
//   bun tools/release/release.ts notes --tag <tag> [--root <dir>]
//       prints the release notes, stating the Baseline Pin read from
//       `conformance/baseline-pin`
//   bun tools/release/release.ts pack --out <dir> [--root <dir>]
//       runs `bun pm pack` in each public workspace, in sorted order, and
//       fails when a packed manifest still holds `workspace:`, depends on
//       another workspace at anything but the root version, or lacks the
//       `repository` that provenance needs
//   bun tools/release/release.ts authority [--root <dir>]
//       fails when any workflow other than job `release` of
//       `.github/workflows/release.yml` has `id-token: write` or publishes
//
// Workspaces are the directories matching the root `workspaces` globs that
// hold a `package.json`. Public packages are the workspaces without
// `private: true`; only they are packed and published.
//
// Exit codes: 0 pass (for `gate`: decided, either way), 1 violations or any
// failure (fail closed: nothing is published), 2 usage error.
// Violations go to stderr, one line each:
//
//   version mismatch:   a workspace's (or its bun.lock entry's) version
//                       differs from the root's
//   pack:               a packed manifest holds `workspace:`, an internal
//                       dependency off the root version, or a wrong
//                       `repository`, naming the package and the field
//   release authority:  a workflow outside the release job holds
//                       `id-token: write` or runs a publish command
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MAINTAINER } from "../protected-paths/protected-paths";

/** The only tags that publish: `v0.<n>.<p>`, without leading zeros (AD-18). */
export const PUBLISH_TAG = /^v0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const BASELINE_PIN_FILE = "conformance/baseline-pin";
export const WORKFLOWS_DIR = ".github/workflows";
export const RELEASE_WORKFLOW = ".github/workflows/release.yml";
export const RELEASE_JOB = "release";
export const RELEASE_ENVIRONMENT = "release";
/** The branch a tagged commit must be on to publish; fixed, never read from the API (AD-16). */
export const MAIN_BRANCH = "main";
/** A full commit SHA, as `gate --sha` takes it. */
export const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** The `repository.url` every public manifest needs; `npm publish --provenance` rejects any other. */
export const REPOSITORY_URL = "git+https://github.com/xaravel/framework.git";
/**
 * A step that publishes to a registry: the tool, then any flags (each with at
 * most one value, as in `npm -w x publish` or `npm --registry=r publish`)
 * within one shell command, then `publish`.
 */
export const PUBLISH_COMMAND = /\b(npm|bun|pnpm|yarn)(?:\s+-[^\s;&|]*(?:\s+[^\s;&|-][^\s;&|]*)?)*\s+publish\b/;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function repoRoot(): string {
  return resolve(import.meta.dir, "..", "..");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

// ---------------------------------------------------------------------------
// Versions

export interface Workspace {
  /** Repo-relative directory, e.g. `packages/support`. */
  dir: string;
  name: string | null;
  version: string | null;
  private: boolean;
}

/** The root `package.json` version, the single source; throws when it is missing. */
export function rootVersion(root: string): string {
  const manifest = readJson(join(root, "package.json"));
  const version = isObject(manifest) ? manifest["version"] : undefined;
  if (typeof version !== "string" || version === "") {
    throw new Error("the root package.json has no version");
  }
  return version;
}

/** Every workspace of `root`, sorted by directory. */
export function workspaces(root: string): Workspace[] {
  const manifest = readJson(join(root, "package.json"));
  const globs = isObject(manifest) ? manifest["workspaces"] : undefined;
  if (!Array.isArray(globs) || !globs.every((glob): glob is string => typeof glob === "string")) {
    throw new Error("the root package.json has no workspaces array");
  }
  const dirs = new Set<string>();
  for (const glob of globs) {
    for (const file of new Bun.Glob(`${glob.replace(/\/+$/, "")}/package.json`).scanSync({ cwd: root, onlyFiles: true })) {
      dirs.add(file.replaceAll("\\", "/").replace(/\/package\.json$/, ""));
    }
  }
  return [...dirs].sort(compare).map((dir) => {
    const data = readJson(join(root, dir, "package.json"));
    if (!isObject(data)) {
      throw new Error(`${dir}/package.json is not a JSON object`);
    }
    return {
      dir,
      name: typeof data["name"] === "string" ? data["name"] : null,
      version: typeof data["version"] === "string" ? data["version"] : null,
      private: data["private"] === true,
    };
  });
}

/**
 * The `version` of each `bun.lock` workspace entry that has one, by directory;
 * empty when there is no lockfile. `bun pm pack` rewrites `workspace:` ranges
 * from these, so a stale entry would publish an internal dependency on the
 * previous version.
 */
export function lockedVersions(root: string): Map<string, string> {
  const file = join(root, "bun.lock");
  const out = new Map<string, string>();
  if (!existsSync(file)) {
    return out;
  }
  const lock = Bun.JSONC.parse(readFileSync(file, "utf8")) as unknown;
  const entries = isObject(lock) ? lock["workspaces"] : undefined;
  if (!isObject(entries)) {
    throw new Error("bun.lock has no workspaces object");
  }
  for (const dir of Object.keys(entries).sort(compare)) {
    const entry = entries[dir];
    if (isObject(entry) && typeof entry["version"] === "string") {
      out.set(dir, entry["version"]);
    }
  }
  return out;
}

/** One line per workspace, or `bun.lock` workspace entry, whose version differs from the root's. */
export function versionMismatches(root: string): string[] {
  const version = rootVersion(root);
  const manifests = workspaces(root)
    .filter((workspace) => workspace.version !== version)
    .map((workspace) => `version mismatch: ${workspace.dir}/package.json has ${workspace.version ?? "no version"}, root has ${version}`);
  const locked = [...lockedVersions(root)]
    .filter(([, locked]) => locked !== version)
    .map(([dir, locked]) => `version mismatch: bun.lock workspace ${dir === "" ? "(root)" : dir} has ${locked}, root has ${version}`);
  return [...manifests, ...locked];
}

/**
 * Copies the root version into every workspace; returns the files it rewrote.
 * When it rewrote any, or `bun.lock` holds a stale workspace version, it
 * refreshes `bun.lock` (`bun install --lockfile-only`) so the lockfile carries
 * the new versions. Idempotent.
 */
export function stamp(root: string): string[] {
  const version = rootVersion(root);
  const changed: string[] = [];
  for (const workspace of workspaces(root)) {
    if (workspace.version === version) {
      continue;
    }
    const file = `${workspace.dir}/package.json`;
    const data = readJson(join(root, file)) as Record<string, unknown>;
    data["version"] = version;
    // package.json is plain data, not a framework value, so AD-23 does not apply.
    writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`);
    changed.push(file);
  }
  const staleLock = [...lockedVersions(root).values()].some((locked) => locked !== version);
  if (changed.length > 0 || staleLock) {
    run([process.execPath, "install", "--lockfile-only", "--ignore-scripts"], root);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Gate

export interface Decision {
  publish: boolean;
  reason: string;
}

/** Whether `tag` may publish the root `version`. */
export function tagDecision(tag: string, version: string): Decision {
  if (!PUBLISH_TAG.test(tag)) {
    return { publish: false, reason: `tag ${tag} does not match ${PUBLISH_TAG.source} (v0.<n>.<p>), so nothing is published` };
  }
  if (tag !== `v${version}`) {
    return { publish: false, reason: `tag ${tag} does not equal v${version}, the root package.json version, so nothing is published` };
  }
  return { publish: true, reason: `tag ${tag} matches the root version ${version}` };
}

function sameLogin(login: string, handle: string): boolean {
  return login.toLowerCase() === handle.replace(/^@/, "").toLowerCase();
}

/** Whether the live `release` environment (the API's JSON) requires the Maintainer's approval. */
export function environmentDecision(json: unknown): Decision {
  // `can_admins_bypass` defaults to true: an administrator could then deploy without the reviewer's approval.
  if (!isObject(json) || json["can_admins_bypass"] !== false) {
    return {
      publish: false,
      reason: `in the ${RELEASE_ENVIRONMENT} environment administrators can bypass the protection rules (can_admins_bypass is not false), so the Maintainer's (${MAINTAINER}) approval is not guaranteed and nothing is published`,
    };
  }
  const rules = isObject(json) ? json["protection_rules"] : undefined;
  const reviewers = Array.isArray(rules)
    ? rules.filter((rule) => isObject(rule) && rule["type"] === "required_reviewers").flatMap((rule) => {
        const list = (rule as Record<string, unknown>)["reviewers"];
        return Array.isArray(list) ? list : [];
      })
    : [];
  if (reviewers.length === 0) {
    return {
      publish: false,
      reason: `the ${RELEASE_ENVIRONMENT} environment has no required_reviewers rule naming the Maintainer (${MAINTAINER}), so nothing is published`,
    };
  }
  // Every required reviewer must be the Maintainer as a User: anyone else listed could approve alone.
  for (const entry of reviewers) {
    const reviewer = isObject(entry) && isObject(entry["reviewer"]) ? entry["reviewer"] : null;
    const login = reviewer !== null && typeof reviewer["login"] === "string" ? reviewer["login"] : null;
    if (isObject(entry) && entry["type"] === "User" && login !== null && sameLogin(login, MAINTAINER)) {
      continue;
    }
    const type = isObject(entry) && typeof entry["type"] === "string" ? entry["type"] : "unknown";
    const label = login ?? (reviewer !== null && typeof reviewer["slug"] === "string" ? reviewer["slug"] : "unnamed");
    return {
      publish: false,
      reason: `the ${RELEASE_ENVIRONMENT} environment lists required reviewer ${type} ${label}, but only the Maintainer (${MAINTAINER}) may approve a release, so nothing is published`,
    };
  }
  return { publish: true, reason: `the ${RELEASE_ENVIRONMENT} environment requires the Maintainer's (${MAINTAINER}) approval` };
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "xaravel-release",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Whether commit `sha` is on `main`, from the API's JSON for
 * `GET /repos/<repo>/compare/main...<sha>`: `identical` (it is main's tip) or
 * `behind` (an ancestor of main) publish; `ahead`, `diverged` or anything else
 * refuses, since the commit then holds changes main lacks.
 */
export function mainDecision(sha: string, json: unknown): Decision {
  const compared = `compare ${MAIN_BRANCH}...${sha}`;
  const status = isObject(json) && typeof json["status"] === "string" ? json["status"] : null;
  if (status === null) {
    return { publish: false, reason: `${compared} returned no status, so commit ${sha} cannot be verified to be on ${MAIN_BRANCH} and nothing is published` };
  }
  if (status === "identical" || status === "behind") {
    return { publish: true, reason: `commit ${sha} is on ${MAIN_BRANCH} (${compared}: ${status})` };
  }
  return { publish: false, reason: `commit ${sha} is not on ${MAIN_BRANCH} (${compared}: ${status}), so nothing is published` };
}

/** Asks the API whether the tagged commit is on `main` and decides; any failure refuses. */
async function liveMainDecision(api: string, repo: string, sha: string, token: string | null): Promise<Decision> {
  const unverified = `commit ${sha} cannot be verified to be on ${MAIN_BRANCH} and nothing is published`;
  if (token === null) {
    return { publish: false, reason: `GH_TOKEN is not set, so ${unverified}` };
  }
  // `refs/heads/` so a tag named `main` cannot stand in for the branch.
  const path = `/repos/${repo}/compare/refs/heads/${MAIN_BRANCH}...${sha}`;
  let response: Response;
  try {
    response = await fetch(`${api}${path}`, { headers: apiHeaders(token) });
  } catch (error) {
    return { publish: false, reason: `GET ${path} failed (${error instanceof Error ? error.message : String(error)}), so ${unverified}` };
  }
  if (response.status === 404) {
    return { publish: false, reason: `commit ${sha} is unknown or shares no history with ${MAIN_BRANCH} (GET ${path}: HTTP 404), so nothing is published` };
  }
  if (!response.ok) {
    return { publish: false, reason: `GET ${path}: HTTP ${response.status}, so ${unverified}` };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { publish: false, reason: `GET ${path} did not return JSON, so ${unverified}` };
  }
  return mainDecision(sha, json);
}

/** Reads the live `release` environment and decides; any failure refuses. */
async function liveEnvironmentDecision(api: string, repo: string, token: string | null): Promise<Decision> {
  if (token === null) {
    return { publish: false, reason: `GH_TOKEN is not set, so the ${RELEASE_ENVIRONMENT} environment cannot be verified and nothing is published` };
  }
  const path = `/repos/${repo}/environments/${RELEASE_ENVIRONMENT}`;
  let response: Response;
  try {
    response = await fetch(`${api}${path}`, { headers: apiHeaders(token) });
  } catch (error) {
    return { publish: false, reason: `GET ${path} failed (${error instanceof Error ? error.message : String(error)}), so nothing is published` };
  }
  if (response.status === 404) {
    return { publish: false, reason: `the ${RELEASE_ENVIRONMENT} environment does not exist (GET ${path}: HTTP 404), so nothing is published` };
  }
  if (!response.ok) {
    return { publish: false, reason: `GET ${path}: HTTP ${response.status}, so the ${RELEASE_ENVIRONMENT} environment cannot be verified and nothing is published` };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { publish: false, reason: `GET ${path} did not return JSON, so nothing is published` };
  }
  return environmentDecision(json);
}

// ---------------------------------------------------------------------------
// Notes

/** The release notes: the version, the Baseline Pin and the published packages. */
export function releaseNotes(input: { version: string; pin: string; packages: readonly string[] }): string {
  return [
    `# Xaravel v${input.version}`,
    "",
    `Baseline Pin: laravel/framework ${input.pin}`,
    "",
    `Every package below is published at ${input.version}, with npm provenance.`,
    "",
    "## Packages",
    "",
    ...input.packages.map((name) => `- \`${name}@${input.version}\``),
    "",
  ].join("\n");
}

/** The Baseline Pin, trimmed; throws when the file is missing or empty. */
export function baselinePin(root: string): string {
  const file = join(root, BASELINE_PIN_FILE);
  if (!existsSync(file)) {
    throw new Error(`${BASELINE_PIN_FILE} does not exist`);
  }
  const pin = readFileSync(file, "utf8").trim();
  if (pin === "") {
    throw new Error(`${BASELINE_PIN_FILE} is empty`);
  }
  return pin;
}

/** The public workspaces: the ones packed and published. */
export function publicWorkspaces(root: string): Workspace[] {
  return workspaces(root).filter((workspace) => !workspace.private);
}

// ---------------------------------------------------------------------------
// Pack

/** One line per string value in a packed manifest that still holds `workspace:`. */
export function manifestLeaks(name: string, manifest: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (value.includes("workspace:")) {
        out.push(`pack: ${name} packed package.json field ${path} is ${JSON.stringify(value)}; a published manifest must not hold workspace: (AD-18)`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isObject(value)) {
      for (const key of Object.keys(value)) {
        walk(value[key], path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(manifest, "");
  return out;
}

/** The dependency fields whose internal entries must name the lockstep version. */
export const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"] as const;

/**
 * One line per dependency, peer or optional dependency of a packed manifest on
 * another workspace (`internal` holds their names) whose range is not exactly
 * the root `version` (AD-18: one lockstep version).
 */
export function internalVersionMismatches(name: string, manifest: unknown, internal: ReadonlySet<string>, version: string): string[] {
  const out: string[] = [];
  if (!isObject(manifest)) {
    return out;
  }
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (!isObject(deps)) {
      continue;
    }
    for (const dep of Object.keys(deps).sort(compare)) {
      const range = deps[dep];
      if (internal.has(dep) && range !== version) {
        out.push(
          `pack: ${name} packed package.json field ${field}.${dep} is ${JSON.stringify(range)}; internal dependencies must be the root version ${version} (AD-18)`,
        );
      }
    }
  }
  return out;
}

/** One line per missing or wrong `repository` field; `npm publish --provenance` needs both to match (AD-18). */
export function repositoryProblems(name: string, manifest: unknown, dir: string): string[] {
  const repository = isObject(manifest) ? manifest["repository"] : undefined;
  const fields = isObject(repository) ? repository : {};
  const out: string[] = [];
  for (const [field, expected] of [
    ["url", REPOSITORY_URL],
    ["directory", dir],
  ] as const) {
    const actual = fields[field];
    if (actual !== expected) {
      out.push(
        `pack: ${name} packed package.json field repository.${field} is ${actual === undefined ? "missing" : JSON.stringify(actual)}; provenance needs ${JSON.stringify(expected)} (AD-18)`,
      );
    }
  }
  return out;
}

function run(cmd: string[], cwd: string): string {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} (in ${cwd}) exited ${result.exitCode}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

/** Packs every public workspace into `out`; returns the tarballs and any leaks. */
export function pack(root: string, out: string): { tarballs: string[]; violations: string[] } {
  mkdirSync(out, { recursive: true });
  if (readdirSync(out).some((entry) => entry.endsWith(".tgz"))) {
    throw new Error(`${out} already holds tarballs; pack into an empty directory`);
  }
  const tarballs: string[] = [];
  const violations: string[] = [];
  const version = rootVersion(root);
  const all = workspaces(root);
  const internal = new Set(all.flatMap((workspace) => (workspace.name === null ? [] : [workspace.name])));
  for (const workspace of all.filter((candidate) => !candidate.private)) {
    const name = workspace.name ?? workspace.dir;
    const printed = run([process.execPath, "pm", "pack", "--destination", out, "--ignore-scripts", "--quiet"], join(root, workspace.dir))
      .trim()
      .split("\n")
      .at(-1)
      ?.trim();
    if (printed === undefined || printed === "" || !existsSync(printed)) {
      throw new Error(`bun pm pack in ${workspace.dir} produced no tarball`);
    }
    tarballs.push(printed);
    const manifest = JSON.parse(run(["tar", "-xzOf", printed, "package/package.json"], root)) as unknown;
    violations.push(
      ...manifestLeaks(name, manifest),
      ...internalVersionMismatches(name, manifest, internal, version),
      ...repositoryProblems(name, manifest, workspace.dir),
    );
  }
  return { tarballs, violations };
}

// ---------------------------------------------------------------------------
// Release authority

function writeGrants(permissions: unknown): string[] {
  if (permissions === "write-all") {
    return ["write-all"];
  }
  if (isObject(permissions)) {
    return Object.keys(permissions)
      .filter((scope) => permissions[scope] === "write")
      .sort(compare)
      .map((scope) => `${scope}: write`);
  }
  return [];
}

/** The grants that confer OIDC publishing: `id-token: write` or `write-all`. */
function idTokenGrants(permissions: unknown): string[] {
  return writeGrants(permissions).filter((grant) => grant === "write-all" || grant === "id-token: write");
}

/** The violations across workflow files; each `file` is repo-relative. */
export function authorityViolations(files: readonly { file: string; text: string }[]): string[] {
  const only = `only job ${RELEASE_JOB} of ${RELEASE_WORKFLOW} may (AD-18)`;
  const out: string[] = [];
  for (const { file, text } of files) {
    const bad = (problem: string): string => `release authority: ${file} ${problem}`;
    let data: unknown;
    try {
      data = Bun.YAML.parse(text);
    } catch (error) {
      out.push(bad(`is not valid YAML: ${error instanceof Error ? error.message : String(error)} (AD-18)`));
      continue;
    }
    if (!isObject(data)) {
      out.push(bad("must be a YAML mapping (AD-18)"));
      continue;
    }
    for (const grant of idTokenGrants(data["permissions"])) {
      out.push(bad(`top-level permissions hold ${grant}; ${only}`));
    }
    const jobs = data["jobs"];
    if (!isObject(jobs)) {
      continue;
    }
    for (const id of Object.keys(jobs).sort(compare)) {
      if (file === RELEASE_WORKFLOW && id === RELEASE_JOB) {
        continue;
      }
      const job = jobs[id];
      if (!isObject(job)) {
        continue;
      }
      for (const grant of idTokenGrants(job["permissions"])) {
        out.push(bad(`job ${id} holds ${grant}; ${only}`));
      }
      const steps = Array.isArray(job["steps"]) ? job["steps"] : [];
      steps.forEach((step, i) => {
        const command = isObject(step) && typeof step["run"] === "string" ? PUBLISH_COMMAND.exec(step["run"]) : null;
        if (command !== null) {
          out.push(bad(`job ${id} step ${i + 1} runs \`${command[0]}\`; ${only}`));
        }
      });
    }
  }
  return out;
}

/** Checks every workflow under `root`; a missing or empty workflows directory is a violation. */
export function checkAuthority(root: string): { files: string[]; violations: string[] } {
  const dir = join(root, WORKFLOWS_DIR);
  if (!existsSync(dir)) {
    return { files: [], violations: [`release authority: ${WORKFLOWS_DIR} does not exist (AD-18)`] };
  }
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => `${WORKFLOWS_DIR}/${entry.name}`)
    .sort(compare);
  if (files.length === 0) {
    return { files, violations: [`release authority: ${WORKFLOWS_DIR} has no workflows (AD-18)`] };
  }
  return { files, violations: authorityViolations(files.map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }))) };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

interface Options {
  root: string;
  tag: string | null;
  repo: string | null;
  sha: string | null;
  githubOutput: string | null;
  out: string | null;
}

function parseOptions(argv: readonly string[], allowed: readonly string[]): Options {
  const options: Options = { root: repoRoot(), tag: null, repo: null, sha: null, githubOutput: null, out: null };
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
    } else if (arg === "--tag") {
      options.tag = value;
    } else if (arg === "--repo") {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
        throw new UsageError(`--repo must be <owner/name>, got ${JSON.stringify(value)}`);
      }
      options.repo = value;
    } else if (arg === "--sha") {
      if (!COMMIT_SHA.test(value)) {
        throw new UsageError(`--sha must be a 40-character lowercase hex commit, got ${JSON.stringify(value)}`);
      }
      options.sha = value;
    } else if (arg === "--github-output") {
      options.githubOutput = resolve(value);
    } else if (arg === "--out") {
      options.out = resolve(value);
    }
  }
  return options;
}

function report(title: string, violations: readonly string[]): void {
  process.stderr.write(`${title}:\n${violations.map((line) => `  ${line}`).join("\n")}\n`);
}

function stampCommand(options: Options): number {
  const changed = stamp(options.root);
  const version = rootVersion(options.root);
  process.stdout.write(`Stamped ${version}: ${changed.length} package.json file(s) changed.\n${changed.map((file) => `  ${file}\n`).join("")}`);
  return 0;
}

function checkCommand(options: Options): number {
  const mismatches = versionMismatches(options.root);
  // The provenance `repository` contract, checked on every PR rather than only at pack time.
  const repositories = publicWorkspaces(options.root).flatMap((workspace) =>
    repositoryProblems(workspace.name ?? workspace.dir, readJson(join(options.root, workspace.dir, "package.json")), workspace.dir).map((line) =>
      line.replace(/^pack: (\S+) packed package\.json/, `repository: $1 ${workspace.dir}/package.json`),
    ),
  );
  if (mismatches.length > 0 || repositories.length > 0) {
    if (mismatches.length > 0) {
      report("Version violations (AD-18); run `bun run release:stamp`", mismatches);
    }
    if (repositories.length > 0) {
      report("Repository violations (AD-18); provenance needs each public package.json's repository", repositories);
    }
    return 1;
  }
  process.stdout.write(`Versions OK: ${workspaces(options.root).length} workspace(s) at ${rootVersion(options.root)}.\n`);
  return 0;
}

async function gateCommand(options: Options): Promise<number> {
  if (options.tag === null || options.repo === null || options.sha === null) {
    throw new UsageError("gate needs --tag <tag>, --repo <owner/name> and --sha <commit>");
  }
  // Tag, then main, then environment: a bad tag never reaches the API.
  let decision = tagDecision(options.tag, rootVersion(options.root));
  if (decision.publish) {
    const api = (process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
    const token = process.env["GH_TOKEN"] || null;
    const main = await liveMainDecision(api, options.repo, options.sha, token);
    if (!main.publish) {
      decision = main;
    } else {
      const environment = await liveEnvironmentDecision(api, options.repo, token);
      if (!environment.publish) {
        decision = environment;
      } else {
        decision = { publish: true, reason: `${decision.reason}, ${main.reason}, and ${environment.reason}` };
      }
    }
  }
  const reason = decision.reason.replace(/[\r\n]+/g, " ");
  if (options.githubOutput !== null) {
    appendFileSync(options.githubOutput, `publish=${decision.publish}\nreason=${reason}\n`);
  }
  process.stdout.write(`${decision.publish ? "Publishing" : "Not publishing"}: ${reason}\n`);
  return 0;
}

function notesCommand(options: Options): number {
  if (options.tag === null) {
    throw new UsageError("notes needs --tag <tag>");
  }
  const version = rootVersion(options.root);
  const decision = tagDecision(options.tag, version);
  if (!decision.publish) {
    throw new Error(decision.reason);
  }
  const packages = publicWorkspaces(options.root).map((workspace) => workspace.name ?? workspace.dir);
  process.stdout.write(releaseNotes({ version, pin: baselinePin(options.root), packages }));
  return 0;
}

function packCommand(options: Options): number {
  if (options.out === null) {
    throw new UsageError("pack needs --out <dir>");
  }
  const result = pack(options.root, options.out);
  if (result.violations.length > 0) {
    report("Pack violations (AD-18)", result.violations);
    return 1;
  }
  process.stdout.write(`Packed ${result.tarballs.length} package(s):\n${result.tarballs.map((file) => `  ${file}\n`).join("")}`);
  return 0;
}

function authorityCommand(options: Options): number {
  const result = checkAuthority(options.root);
  if (result.violations.length > 0) {
    report("Release authority violations (AD-18)", result.violations);
    return 1;
  }
  process.stdout.write(`Release authority OK: ${result.files.length} workflow(s) checked.\n`);
  return 0;
}

const USAGE = [
  "Usage:",
  "  bun tools/release/release.ts stamp [--root <dir>]",
  "  bun tools/release/release.ts check [--root <dir>]",
  "  bun tools/release/release.ts gate --tag <tag> --repo <owner/name> --sha <commit> [--github-output <file>] [--root <dir>]",
  "  bun tools/release/release.ts notes --tag <tag> [--root <dir>]",
  "  bun tools/release/release.ts pack --out <dir> [--root <dir>]",
  "  bun tools/release/release.ts authority [--root <dir>]",
].join("\n");

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "stamp":
        return stampCommand(parseOptions(rest, ["--root"]));
      case "check":
        return checkCommand(parseOptions(rest, ["--root"]));
      case "gate":
        return await gateCommand(parseOptions(rest, ["--tag", "--repo", "--sha", "--github-output", "--root"]));
      case "notes":
        return notesCommand(parseOptions(rest, ["--tag", "--root"]));
      case "pack":
        return packCommand(parseOptions(rest, ["--out", "--root"]));
      case "authority":
        return authorityCommand(parseOptions(rest, ["--root"]));
      default:
        throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    // Anything else (an unreadable manifest, a failed pack) fails closed.
    process.stderr.write(`Release ${command} failed: ${error instanceof Error ? error.message : String(error)} (AD-18)\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
