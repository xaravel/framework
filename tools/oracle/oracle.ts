// The Oracle container image: locks, tag, build and verification (Story 2.2, FR-6, OQ-9).
//
//   bun tools/oracle/oracle.ts check [--root <dir>]
//       checks each committed lock against its Upstream snapshot, offline:
//       the lock exists, its content-hash is Composer's hash of the snapshot's
//       unmodified composer.json, it was resolved for PHP 8.5.11, every other
//       Upstream package in it is at its own Pin tag and commit, and it holds
//       the test tools (PHPUnit or Pest, Mockery, Orchestra Testbench). It
//       also checks the Dockerfile statically (digest-pinned bases, no
//       `composer update`, its root-version list equal to the Pin), then
//       prints the image tag.
//   bun tools/oracle/oracle.ts tag [--root <dir>]
//       prints the image tag, `<framework tag>-<imagehash>`, offline
//       (the hash covers the locks, the Dockerfile and its dockerignore)
//   bun tools/oracle/oracle.ts lock [--composer <bin>] [--root <dir>]
//       regenerates every lock with `composer update --no-install` in a temp
//       copy of the snapshot's composer.json, for PHP 8.5.11 (set in a temp
//       COMPOSER_HOME, never in composer.json), with the other Upstream
//       packages pinned by `--with`; this one needs the network
//   bun tools/oracle/oracle.ts verify-image <image> [--root <dir>]
//       checks that each snapshot's vendor/composer/installed.json in the
//       image holds exactly its lock's packages, and that the image's PHP is
//       8.5.11; prints the sorted package set
//   bun tools/oracle/oracle.ts build <image> [--root <dir>]
//       builds conformance/oracle/Dockerfile twice (the second time with
//       --no-cache), verifies both builds and fails when their package sets
//       differ. A GITHUB_TOKEN reaches Composer only as a BuildKit secret.
//
// Only `verify-image` and `build` call `docker`; `check` and `tag` need
// neither Docker nor the network. Other tools reach the image only through
// `runInImage` (no network, read-only mounts) and `runInImageNetworked`
// (host network, environment, read-only tool mounts and one read-write
// output mount, as the non-root `IMAGE_USER`; the baseline run, Story 2.6).
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { frameworkTag, readPin, UPSTREAM_DIR, UPSTREAM_REPOS, type PinEntry, type UpstreamName } from "../upstream/upstream";

export const ORACLE_DIR = "conformance/oracle";
export const LOCKS_DIR = `${ORACLE_DIR}/locks`;
export const DOCKERFILE = `${ORACLE_DIR}/Dockerfile`;
/** The image name; CI publishes it as `ghcr.io/<owner>/xaravel-oracle:<tag>`. */
export const IMAGE_NAME = "xaravel-oracle";
/** The Oracle's PHP version (FR-6). */
export const PHP_VERSION = "8.5.11";
/** Where the image holds each snapshot, as `<IMAGE_UPSTREAM_DIR>/<name>/`. */
export const IMAGE_UPSTREAM_DIR = "/oracle/upstream";
/**
 * The user Upstream's tests run as in the image: uid and gid 1001, the GitHub
 * runner's user, never root (the Dockerfile's `USER`). Tests that chmod a file
 * and expect access to be denied pass only for a non-root user.
 */
export const IMAGE_USER = "1001:1001";
/** The test tools each lock must hold, by snapshot. */
export const REQUIRED_PACKAGES: Readonly<Record<UpstreamName, readonly string[]>> = {
  framework: ["phpunit/phpunit", "mockery/mockery", "orchestra/testbench-core"],
  ai: ["phpunit/phpunit", "pestphp/pest", "mockery/mockery", "orchestra/testbench"],
  mcp: ["phpunit/phpunit", "pestphp/pest", "mockery/mockery", "orchestra/testbench"],
  boost: ["phpunit/phpunit", "pestphp/pest", "mockery/mockery", "orchestra/testbench"],
};

const LOCK_HINT = "run bun run oracle:lock";
const SNAPSHOT_HINT = "run bun run upstream:sync";

// ---------------------------------------------------------------------------
// Composer's content-hash

/** A JSON value with object key order and duplicate keys kept, as PHP's json_decode sees them. */
type Json =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; raw: string }
  | { kind: "string"; value: string }
  | { kind: "array"; items: Json[] }
  | { kind: "object"; entries: [string, Json][] };

/** Parses JSON text into an order-preserving tree (JSON.parse reorders integer-like keys). */
function parseJson(text: string): Json {
  let at = 0;
  const fail = (what: string): never => {
    throw new Error(`invalid JSON at offset ${at}: ${what}`);
  };
  const space = (): void => {
    while (at < text.length && " \t\n\r".includes(text[at]!)) {
      at++;
    }
  };
  const value = (): Json => {
    space();
    const char = text[at];
    if (char === "{") {
      at++;
      const entries: [string, Json][] = [];
      space();
      if (text[at] === "}") {
        at++;
        return { kind: "object", entries };
      }
      for (;;) {
        space();
        if (text[at] !== '"') {
          fail("expected a key");
        }
        const key = string();
        space();
        if (text[at++] !== ":") {
          fail("expected ':'");
        }
        entries.push([key, value()]);
        space();
        const next = text[at++];
        if (next === "}") {
          return { kind: "object", entries };
        }
        if (next !== ",") {
          fail("expected ',' or '}'");
        }
      }
    }
    if (char === "[") {
      at++;
      const items: Json[] = [];
      space();
      if (text[at] === "]") {
        at++;
        return { kind: "array", items };
      }
      for (;;) {
        items.push(value());
        space();
        const next = text[at++];
        if (next === "]") {
          return { kind: "array", items };
        }
        if (next !== ",") {
          fail("expected ',' or ']'");
        }
      }
    }
    if (char === '"') {
      return { kind: "string", value: string() };
    }
    for (const [word, json] of [["true", { kind: "bool", value: true }], ["false", { kind: "bool", value: false }], ["null", { kind: "null" }]] as const) {
      if (text.startsWith(word, at)) {
        at += word.length;
        return json;
      }
    }
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(at));
    if (number === null) {
      return fail("unexpected token");
    }
    at += number[0].length;
    return { kind: "number", raw: number[0] };
  };
  const string = (): string => {
    // Find the closing quote, skipping escapes; JSON.parse then validates and decodes the literal.
    let end = at + 1;
    while (end < text.length && text[end] !== '"') {
      end += text[end] === "\\" ? 2 : 1;
    }
    if (end >= text.length) {
      return fail("unterminated string");
    }
    const literal = text.slice(at, end + 1);
    at = end + 1;
    try {
      return JSON.parse(literal) as string;
    } catch {
      return fail("invalid string");
    }
  };
  const result = value();
  space();
  if (at !== text.length) {
    fail("trailing content");
  }
  return result;
}

/** PHP's `json_encode($s, 0)` of a string: `/` escaped, everything beyond ASCII as `\uXXXX`. */
function phpString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const char = value[i]!;
    if (char === '"' || char === "\\" || char === "/") {
      out += `\\${char}`;
    } else if (char === "\b") {
      out += "\\b";
    } else if (char === "\f") {
      out += "\\f";
    } else if (char === "\n") {
      out += "\\n";
    } else if (char === "\r") {
      out += "\\r";
    } else if (char === "\t") {
      out += "\\t";
    } else if (code < 0x20 || code > 0x7f) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += char;
    }
  }
  return `${out}"`;
}

/** PHP's `json_encode` of a number that `json_decode` read: an int stays as written, a float gets PHP's form. */
function phpNumber(raw: string): string {
  if (/^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) {
    return String(Number(raw));
  }
  const value = Number(raw);
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return `${value}.0`;
  }
  // PHP writes a float's mantissa with a `.0` when it is whole: 1.0e+25, where JS writes 1e+25.
  return String(value).replace(/^(-?\d+)e/, "$1.0e");
}

/** PHP's array key for a JSON object key: a canonical decimal integer string becomes an int. */
function phpKey(key: string): string | number {
  if (/^(0|-?[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key))) {
    return Number(key);
  }
  return key;
}

/** PHP's `json_encode($value, 0)` of what `json_decode($text, true)` gave: objects are arrays, and a list-shaped array is a JSON list. */
function phpEncode(value: Json): string {
  switch (value.kind) {
    case "null":
      return "null";
    case "bool":
      return value.value ? "true" : "false";
    case "number":
      return phpNumber(value.raw);
    case "string":
      return phpString(value.value);
    case "array":
      return `[${value.items.map(phpEncode).join(",")}]`;
    case "object": {
      // A later duplicate key overwrites the value in the first key's position.
      const map = new Map<string | number, Json>();
      for (const [key, item] of value.entries) {
        map.set(phpKey(key), item);
      }
      const keys = [...map.keys()];
      if (keys.every((key, index) => key === index)) {
        return `[${[...map.values()].map(phpEncode).join(",")}]`;
      }
      return `{${keys.map((key) => `${phpString(String(key))}:${phpEncode(map.get(key)!)}`).join(",")}}`;
    }
  }
}

/** The composer.json keys Composer 2's `Locker::getContentHash` hashes, besides `config.platform`. */
const HASHED_KEYS = ["name", "version", "require", "require-dev", "conflict", "replace", "provide", "minimum-stability", "prefer-stable", "repositories", "extra"];

/** Composer 2's content-hash of a composer.json: md5 of json_encode of the relevant keys, ksorted. */
export function contentHash(composerJsonText: string): string {
  const root = parseJson(composerJsonText);
  if (root.kind !== "object") {
    throw new Error("composer.json is not a JSON object");
  }
  const content = new Map<string, Json>();
  for (const [key, item] of root.entries) {
    content.set(key, item);
  }
  const relevant: [string, Json][] = [];
  for (const key of HASHED_KEYS) {
    const item = content.get(key);
    if (item !== undefined) {
      relevant.push([key, item]);
    }
  }
  const config = content.get("config");
  if (config !== undefined && config.kind === "object") {
    const platform = new Map(config.entries).get("platform");
    if (platform !== undefined && platform.kind !== "null") {
      relevant.push(["config", { kind: "object", entries: [["platform", platform]] }]);
    }
  }
  relevant.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("md5").update(phpEncode({ kind: "object", entries: relevant })).digest("hex");
}

// ---------------------------------------------------------------------------
// Locks

/** The absolute path of snapshot `name`'s lock. */
export function lockPath(root: string, name: string): string {
  return join(root, LOCKS_DIR, name, "composer.lock");
}

export interface LockedPackage {
  name: string;
  version: string;
  reference: string | null;
}

interface RawPackage {
  name?: unknown;
  version?: unknown;
  source?: { reference?: unknown } | null;
  dist?: { reference?: unknown } | null;
}

function toPackage(raw: RawPackage, from: string): LockedPackage {
  if (typeof raw.name !== "string" || typeof raw.version !== "string") {
    throw new Error(`${from} has a package without a name or version`);
  }
  const reference = raw.source?.reference ?? raw.dist?.reference ?? null;
  return { name: raw.name, version: raw.version, reference: typeof reference === "string" ? reference : null };
}

function byName(a: LockedPackage, b: LockedPackage): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function packagesOf(value: unknown, key: string, from: string): RawPackage[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${from}: "${key}" is not a list`);
  }
  return value as RawPackage[];
}

/** The package set a lock installs (`packages` and `packages-dev`), sorted by name. */
export function expectedPackages(lockText: string): LockedPackage[] {
  const lock = JSON.parse(lockText) as Record<string, unknown>;
  return [...packagesOf(lock["packages"], "packages", "composer.lock"), ...packagesOf(lock["packages-dev"], "packages-dev", "composer.lock")]
    .map((raw) => toPackage(raw, "composer.lock"))
    .sort(byName);
}

/** The package set a `vendor/composer/installed.json` records (Composer 2 form, or the older bare list), sorted by name. */
export function installedPackages(installedJsonText: string): LockedPackage[] {
  const installed = JSON.parse(installedJsonText) as unknown;
  const list = Array.isArray(installed) ? installed : packagesOf((installed as Record<string, unknown> | null)?.["packages"], "packages", "installed.json");
  return (list as RawPackage[]).map((raw) => toPackage(raw, "installed.json")).sort(byName);
}

const formatPackage = (entry: LockedPackage): string => `${entry.name} ${entry.version} ${entry.reference ?? "(no reference)"}`;

/** Each difference between two package sets, one line each; empty when they are equal. */
export function diffPackages(expected: readonly LockedPackage[], actual: readonly LockedPackage[], labels: { expected: string; actual: string } = { expected: "the lock", actual: "the image" }): string[] {
  const want = new Map(expected.map((entry) => [entry.name, entry]));
  const have = new Map(actual.map((entry) => [entry.name, entry]));
  const names = [...new Set([...want.keys(), ...have.keys()])].sort();
  const out: string[] = [];
  for (const name of names) {
    const a = want.get(name);
    const b = have.get(name);
    if (a === undefined) {
      out.push(`extra: ${formatPackage(b!)} is in ${labels.actual} but not in ${labels.expected}`);
    } else if (b === undefined) {
      out.push(`missing: ${formatPackage(a)} is in ${labels.expected} but not in ${labels.actual}`);
    } else if (a.version !== b.version || a.reference !== b.reference) {
      out.push(`differs: ${name} is ${a.version} ${a.reference ?? "(no reference)"} in ${labels.expected} but ${b.version} ${b.reference ?? "(no reference)"} in ${labels.actual}`);
    }
  }
  return out;
}

const stripV = (version: string): string => version.replace(/^v(?=\d)/, "");

export interface CheckResult {
  /** One line per current lock. */
  verified: string[];
  /** One line per problem. */
  problems: string[];
}

/** Checks each lock against its snapshot and the Pin; no Docker, no network. */
export function checkLocks(root: string): CheckResult {
  const result: CheckResult = { verified: [], problems: [] };
  const pin = readPin(root);
  const byRepo = new Map<string, PinEntry>(pin.map((entry) => [entry.repo, entry]));
  for (const entry of pin) {
    const lockRel = `${LOCKS_DIR}/${entry.name}/composer.lock`;
    const jsonRel = `${UPSTREAM_DIR}/${entry.name}/composer.json`;
    const problems: string[] = [];
    const lockFile = lockPath(root, entry.name);
    const jsonFile = join(root, jsonRel);
    if (!existsSync(lockFile)) {
      result.problems.push(`${lockRel} is missing; ${LOCK_HINT}`);
      continue;
    }
    let lock: Record<string, unknown>;
    let packages: LockedPackage[];
    try {
      const text = readFileSync(lockFile, "utf8");
      lock = JSON.parse(text) as Record<string, unknown>;
      packages = expectedPackages(text);
    } catch (error) {
      result.problems.push(`${lockRel} cannot be read: ${error instanceof Error ? error.message : String(error)}; ${LOCK_HINT}`);
      continue;
    }
    if (!existsSync(jsonFile)) {
      problems.push(`${jsonRel} is missing; ${SNAPSHOT_HINT}`);
    } else {
      const expected = contentHash(readFileSync(jsonFile, "utf8"));
      const actual = lock["content-hash"];
      if (actual !== expected) {
        problems.push(`${lockRel} is not current for ${jsonRel}: expected content-hash ${expected}, actual ${typeof actual === "string" ? actual : "missing"}; ${LOCK_HINT}`);
      }
    }
    const overrides = lock["platform-overrides"] as Record<string, unknown> | undefined;
    if (overrides?.["php"] !== PHP_VERSION) {
      problems.push(`${lockRel} was not resolved for PHP ${PHP_VERSION}: platform-overrides.php is ${JSON.stringify(overrides?.["php"] ?? null)}; ${LOCK_HINT}`);
    }
    for (const pkg of packages) {
      const pinned = byRepo.get(pkg.name);
      if (pinned === undefined || pinned.repo === entry.repo) {
        continue;
      }
      if (stripV(pkg.version) !== stripV(pinned.tag)) {
        problems.push(`${lockRel} holds ${pkg.name} ${pkg.version}, but its Pin tag is ${pinned.tag}; ${LOCK_HINT}`);
      } else if (pkg.reference !== pinned.commit) {
        problems.push(`${lockRel} holds ${pkg.name} ${pkg.version} at ${pkg.reference ?? "no reference"}, but its Pin commit is ${pinned.commit}; ${LOCK_HINT}`);
      }
    }
    const names = new Set(packages.map((pkg) => pkg.name));
    for (const required of REQUIRED_PACKAGES[entry.name]) {
      if (!names.has(required)) {
        problems.push(`${lockRel} lacks ${required}, which the Oracle needs to run ${entry.repo}'s tests; ${LOCK_HINT}`);
      }
    }
    if (problems.length === 0) {
      result.verified.push(`${lockRel} (${entry.repo} ${entry.tag}) is current: ${packages.length} packages, content-hash ${String(lock["content-hash"])}`);
    } else {
      result.problems.push(...problems);
    }
  }
  result.problems.push(...checkDockerfile(root));
  return result;
}

/**
 * Checks the Dockerfile statically: every base image pinned by digest, no
 * `composer update`, and its root-version list equal to the Pin.
 */
export function checkDockerfile(root: string): string[] {
  const file = join(root, DOCKERFILE);
  if (!existsSync(file)) {
    return [`${DOCKERFILE} is missing`];
  }
  const problems: string[] = [];
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n").filter((line) => !line.trimStart().startsWith("#"));
  const froms = lines.filter((line) => /^\s*FROM\s/i.test(line));
  if (froms.length === 0) {
    problems.push(`${DOCKERFILE} has no FROM line`);
  }
  for (const from of froms) {
    if (!/^\s*FROM\s+\S+@sha256:[0-9a-f]{64}(\s|$)/i.test(from)) {
      problems.push(`${DOCKERFILE}: base image is not pinned by digest: ${from.trim()}`);
    }
  }
  if (/composer\s+update/.test(lines.join("\n"))) {
    problems.push(`${DOCKERFILE} runs composer update; the image must install only from the committed locks`);
  }
  const expected = readPin(root).map((entry) => `${entry.name}:${stripV(entry.tag)}`).join(" ");
  const loop = /for pair in ([^;]*);/.exec(lines.join("\n"));
  const actual = loop === null ? null : loop[1]!.trim().split(/\s+/).join(" ");
  if (actual !== expected) {
    problems.push(`${DOCKERFILE}: the composer install loop must be "for pair in ${expected};" (each snapshot and its Pin tag without the v), found ${actual === null ? "none" : JSON.stringify(actual)}`);
  }
  if (!existsSync(join(root, `${DOCKERFILE}.dockerignore`))) {
    problems.push(`${DOCKERFILE}.dockerignore is missing`);
  }
  return problems;
}

/**
 * The first 12 hex characters of the SHA-256 of the four locks in pin order,
 * then the Dockerfile, then its dockerignore, so a change to any of them gets
 * a new tag. Each input is hashed as
 * `<repository-relative path>\0<byte length>\0<bytes>`, so no byte can move
 * across a file boundary unnoticed.
 */
export function imageHash(root: string): string {
  const hash = createHash("sha256");
  const add = (relative: string, bytes: Buffer): void => {
    hash.update(`${relative}\0${bytes.length}\0`);
    hash.update(bytes);
  };
  for (const entry of readPin(root)) {
    const relative = `${LOCKS_DIR}/${entry.name}/composer.lock`;
    const file = lockPath(root, entry.name);
    if (!existsSync(file)) {
      throw new Error(`${relative} is missing; ${LOCK_HINT}`);
    }
    add(relative, readFileSync(file));
  }
  for (const relative of [DOCKERFILE, `${DOCKERFILE}.dockerignore`]) {
    const file = join(root, relative);
    if (!existsSync(file)) {
      throw new Error(`${relative} is missing; the image tag hashes it, restore it from git`);
    }
    add(relative, readFileSync(file));
  }
  return hash.digest("hex").slice(0, 12);
}

/** The image tag: `<framework tag>-<imagehash>`. */
export function imageTag(root: string): string {
  return `${frameworkTag(root)}-${imageHash(root)}`;
}

/** Regenerates every lock with Composer; needs PHP, Composer and the network. */
export function lock(root: string, options: { composer?: string } = {}): string[] {
  const composer = options.composer ?? "composer";
  const pin = readPin(root);
  const lines: string[] = [];
  for (const entry of pin) {
    const jsonFile = join(root, UPSTREAM_DIR, entry.name, "composer.json");
    if (!existsSync(jsonFile)) {
      throw new Error(`${UPSTREAM_DIR}/${entry.name}/composer.json is missing; ${SNAPSHOT_HINT}`);
    }
    const work = mkdtempSync(join(tmpdir(), `xaravel-oracle-lock-${entry.name}-`));
    try {
      const project = join(work, "project");
      const home = join(work, "home");
      mkdirSync(project);
      mkdirSync(home);
      copyFileSync(jsonFile, join(project, "composer.json"));
      // The platform PHP comes from the temp COMPOSER_HOME, so composer.json stays byte-identical.
      writeFileSync(join(home, "config.json"), `${JSON.stringify({ config: { platform: { php: PHP_VERSION } } }, null, 2)}\n`);
      const withs = pin.filter((other) => other.repo !== entry.repo).flatMap((other) => ["--with", `${other.repo}:${stripV(other.tag)}`]);
      const args = [
        composer,
        "update",
        "--no-install",
        "--no-scripts",
        "--no-plugins",
        "--no-interaction",
        "--no-progress",
        "--ignore-platform-req=ext-*",
        ...withs,
      ];
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && !key.startsWith("COMPOSER")) {
          env[key] = value;
        }
      }
      env["COMPOSER_HOME"] = home;
      env["COMPOSER_ROOT_VERSION"] = stripV(entry.tag);
      if (process.env["COMPOSER_CACHE_DIR"] !== undefined) {
        env["COMPOSER_CACHE_DIR"] = process.env["COMPOSER_CACHE_DIR"];
      }
      if (process.env["COMPOSER_AUTH"] !== undefined) {
        env["COMPOSER_AUTH"] = process.env["COMPOSER_AUTH"];
      }
      const proc = Bun.spawnSync(args, { cwd: project, env, stdout: "pipe", stderr: "pipe" });
      if (proc.exitCode !== 0) {
        throw new Error(`${entry.repo}: composer update failed (exit ${proc.exitCode}):\n${proc.stderr.toString().trim()}`);
      }
      const written = join(project, "composer.lock");
      if (!existsSync(written)) {
        throw new Error(`${entry.repo}: composer update wrote no composer.lock`);
      }
      const target = lockPath(root, entry.name);
      mkdirSync(join(root, LOCKS_DIR, entry.name), { recursive: true });
      copyFileSync(written, target);
      lines.push(`${entry.repo} ${entry.tag}: wrote ${LOCKS_DIR}/${entry.name}/composer.lock`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Docker

const NO_DOCKER = "docker is not on PATH; oracle:build and oracle:verify-image need Docker (oracle:check and oracle:tag do not)";

function requireDocker(): string {
  const docker = Bun.which("docker");
  if (docker === null) {
    throw new Error(NO_DOCKER);
  }
  return docker;
}

function dockerOutput(docker: string, args: readonly string[]): string {
  const proc = Bun.spawnSync([docker, ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`docker ${args.join(" ")} failed (exit ${proc.exitCode}): ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString();
}

/** A host path mounted read-only into a container. */
export interface ReadOnlyMount {
  host: string;
  container: string;
}

/**
 * Runs `command` in `image` with `docker run --rm --network none` and the
 * given read-only mounts, and returns its stdout; throws with its exit code
 * and stderr when it fails. Other tools reach the Oracle image only through
 * this, so Docker stays behind tools/oracle (the Inventory, Story 2.4).
 */
export function runInImage(image: string, mounts: readonly ReadOnlyMount[], command: readonly string[]): string {
  const docker = Bun.which("docker", { PATH: process.env["PATH"] ?? "" });
  if (docker === null) {
    throw new Error("docker is not on PATH; running in the Oracle image needs Docker");
  }
  const args = ["run", "--rm", "--network", "none", ...mounts.flatMap((mount) => ["--volume", `${mount.host}:${mount.container}:ro`]), image, ...command];
  const proc = Bun.spawnSync([docker, ...args], { env: process.env, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  if (proc.exitCode !== 0) {
    throw new Error(`${command.join(" ")} in ${image} failed (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString();
}

/** A networked run in the Oracle image: environment, read-only tool mounts and one read-write output mount. */
export interface NetworkedRun {
  /** Passed with `--env <name>=<value>`, in key order. */
  env: Readonly<Record<string, string>>;
  /** Mounted read-only. */
  mounts: readonly ReadOnlyMount[];
  /** Mounted read-write. */
  output: ReadOnlyMount;
}

/** The `docker run` arguments of a networked run (without the `docker` binary); it runs as `IMAGE_USER`, never root. */
export function networkedRunArgs(image: string, run: NetworkedRun, command: readonly string[]): string[] {
  return [
    "run",
    "--rm",
    "--network",
    "host",
    "--user",
    IMAGE_USER,
    ...Object.keys(run.env)
      .sort()
      .flatMap((name) => ["--env", `${name}=${run.env[name]!}`]),
    ...run.mounts.flatMap((mount) => ["--volume", `${mount.host}:${mount.container}:ro`]),
    "--volume",
    `${run.output.host}:${run.output.container}:rw`,
    image,
    ...command,
  ];
}

/**
 * Runs `command` in `image` with `docker run --rm --network host`, the given
 * environment, read-only mounts and one read-write output mount, and returns
 * its stdout; its stderr streams to ours. Throws with its exit code when it
 * fails. The baseline run (Story 2.6) reaches the CI service containers
 * (Postgres, Redis) on the host network through this.
 */
export function runInImageNetworked(image: string, run: NetworkedRun, command: readonly string[]): string {
  const docker = Bun.which("docker", { PATH: process.env["PATH"] ?? "" });
  if (docker === null) {
    throw new Error("docker is not on PATH; running in the Oracle image needs Docker");
  }
  const proc = Bun.spawnSync([docker, ...networkedRunArgs(image, run, command)], { env: process.env, stdout: "pipe", stderr: "inherit", stdin: "ignore" });
  if (proc.exitCode !== 0) {
    throw new Error(`${command.join(" ")} in ${image} failed (exit ${proc.exitCode ?? "signal"}); its stderr is above`);
  }
  return proc.stdout.toString();
}

function readImageFile(docker: string, image: string, path: string): string {
  return dockerOutput(docker, ["run", "--rm", "--network", "none", "--entrypoint", "cat", image, path]);
}

export interface ImageResult {
  /** The sorted package set, one `<snapshot>: <name> <version> <reference>` line each, and the PHP version. */
  lines: string[];
  /** One line per difference. */
  problems: string[];
  /** Each snapshot's installed package set. */
  packages: Partial<Record<UpstreamName, LockedPackage[]>>;
}

/** Verifies a built image against the locks and the snapshot; calls `docker`. */
export function verifyImage(root: string, image: string): ImageResult {
  const docker = requireDocker();
  const result: ImageResult = { lines: [], problems: [], packages: {} };
  for (const entry of readPin(root)) {
    const lockFile = lockPath(root, entry.name);
    if (!existsSync(lockFile)) {
      result.problems.push(`${LOCKS_DIR}/${entry.name}/composer.lock is missing; ${LOCK_HINT}`);
      continue;
    }
    const dir = `${IMAGE_UPSTREAM_DIR}/${entry.name}`;
    let installed: LockedPackage[];
    try {
      installed = installedPackages(readImageFile(docker, image, `${dir}/vendor/composer/installed.json`));
    } catch (error) {
      result.problems.push(`${image} ${dir}: cannot read vendor/composer/installed.json: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    result.packages[entry.name] = installed;
    const diff = diffPackages(expectedPackages(readFileSync(lockFile, "utf8")), installed, { expected: `${LOCKS_DIR}/${entry.name}/composer.lock`, actual: `${image} ${dir}` });
    result.problems.push(...diff.map((line) => `${entry.name}: ${line}`));
    result.lines.push(...installed.map((pkg) => `${entry.name}: ${formatPackage(pkg)}`));
    const localJson = join(root, UPSTREAM_DIR, entry.name, "composer.json");
    if (!existsSync(localJson)) {
      result.problems.push(`${entry.name}: ${UPSTREAM_DIR}/${entry.name}/composer.json is missing; ${SNAPSHOT_HINT}`);
    } else {
      try {
        if (readImageFile(docker, image, `${dir}/composer.json`) !== readFileSync(localJson, "utf8")) {
          result.problems.push(`${entry.name}: ${image} ${dir}/composer.json differs from ${UPSTREAM_DIR}/${entry.name}/composer.json`);
        }
      } catch (error) {
        result.problems.push(`${entry.name}: ${image} ${dir}/composer.json cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  let php = "";
  try {
    php = dockerOutput(docker, ["run", "--rm", "--network", "none", image, "php", "--version"]).split("\n")[0]!.trim();
  } catch (error) {
    result.problems.push(`${image}: php --version failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (php !== "") {
    if (php.startsWith(`PHP ${PHP_VERSION} `)) {
      result.lines.push(`php: ${php}`);
    } else {
      result.problems.push(`${image}: expected PHP ${PHP_VERSION}, php --version reports ${JSON.stringify(php)}`);
    }
  }
  return result;
}

export interface BuildResult {
  lines: string[];
  problems: string[];
}

function dockerBuild(docker: string, root: string, args: readonly string[]): void {
  const secret = process.env["GITHUB_TOKEN"] !== undefined && process.env["GITHUB_TOKEN"] !== "" ? ["--secret", "id=github_token,env=GITHUB_TOKEN"] : [];
  const full = ["build", "--file", DOCKERFILE, ...secret, ...args, "."];
  const proc = Bun.spawnSync([docker, ...full], { cwd: root, env: { ...process.env, DOCKER_BUILDKIT: "1" }, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`docker ${full.join(" ")} failed (exit ${proc.exitCode})`);
  }
}

/** Builds the image twice, verifies both builds against the locks and compares their package sets; calls `docker`. */
export function build(root: string, image: string): BuildResult {
  const docker = requireDocker();
  const failed = checkLocks(root);
  if (failed.problems.length > 0) {
    return { lines: [], problems: failed.problems };
  }
  const result: BuildResult = { lines: [], problems: [] };
  dockerBuild(docker, root, ["--tag", image]);
  const work = mkdtempSync(join(tmpdir(), "xaravel-oracle-build-"));
  let rebuilt: string;
  try {
    const iidfile = join(work, "iid");
    dockerBuild(docker, root, ["--no-cache", "--iidfile", iidfile]);
    rebuilt = existsSync(iidfile) ? readFileSync(iidfile, "utf8").trim() : "";
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  if (rebuilt === "") {
    return { lines: [], problems: ["docker build --iidfile wrote no image ID for the second build"] };
  }
  const a = verifyImage(root, image);
  const b = verifyImage(root, rebuilt);
  for (const entry of UPSTREAM_REPOS) {
    const diff = diffPackages(a.packages[entry.name] ?? [], b.packages[entry.name] ?? [], { expected: "build A", actual: "build B" });
    result.problems.push(...diff.map((line) => `${entry.name}: two builds differ: ${line}`));
  }
  result.problems.push(...a.problems.map((line) => `build A: ${line}`), ...b.problems.map((line) => `build B: ${line}`));
  result.lines.push(...a.lines);
  if (result.problems.length === 0) {
    result.lines.push(`build A (${image}) and build B (${rebuilt}) installed the same package sets`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = [
  "Usage:",
  "  bun tools/oracle/oracle.ts check [--root <dir>]",
  "  bun tools/oracle/oracle.ts tag [--root <dir>]",
  "  bun tools/oracle/oracle.ts lock [--composer <bin>] [--root <dir>]",
  "  bun tools/oracle/oracle.ts verify-image <image> [--root <dir>]",
  "  bun tools/oracle/oracle.ts build <image> [--root <dir>]",
].join("\n");

interface Options {
  root: string;
  composer: string | null;
  positional: string[];
}

function parseOptions(argv: readonly string[], allowed: readonly string[], positional: number): Options {
  const options: Options = { root: resolve(import.meta.dir, "..", ".."), composer: null, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      options.positional.push(arg);
      continue;
    }
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
      options.composer = value;
    }
  }
  if (options.positional.length !== positional) {
    throw new UsageError(positional === 0 ? `Unexpected argument: ${options.positional[0]}` : "Missing or extra <image> argument");
  }
  return options;
}

const indent = (lines: readonly string[]): string => lines.map((line) => `  ${line}\n`).join("");

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "check": {
        const options = parseOptions(rest, ["--root"], 0);
        const result = checkLocks(options.root);
        process.stdout.write(result.verified.map((line) => `${line}\n`).join(""));
        if (result.problems.length > 0) {
          process.stderr.write(`Oracle lock check failed (FR-6):\n${indent(result.problems)}`);
          return 1;
        }
        process.stdout.write(`Oracle locks OK: ${result.verified.length} locks current. Image tag: ${imageTag(options.root)}\n`);
        return 0;
      }
      case "tag": {
        const options = parseOptions(rest, ["--root"], 0);
        process.stdout.write(`${imageTag(options.root)}\n`);
        return 0;
      }
      case "lock": {
        const options = parseOptions(rest, ["--root", "--composer"], 0);
        const lines = lock(options.root, options.composer === null ? {} : { composer: options.composer });
        process.stdout.write(lines.map((line) => `${line}\n`).join(""));
        const result = checkLocks(options.root);
        if (result.problems.length > 0) {
          process.stderr.write(`Oracle lock check failed after locking (FR-6):\n${indent(result.problems)}`);
          return 1;
        }
        process.stdout.write(`Oracle locks written. Image tag: ${imageTag(options.root)}\n`);
        return 0;
      }
      case "verify-image": {
        const options = parseOptions(rest, ["--root"], 1);
        const image = options.positional[0]!;
        const result = verifyImage(options.root, image);
        process.stdout.write(result.lines.map((line) => `${line}\n`).join(""));
        if (result.problems.length > 0) {
          process.stderr.write(`Oracle image ${image} does not match the locks (FR-6):\n${indent(result.problems)}`);
          return 1;
        }
        process.stdout.write(`Oracle image ${image} OK.\n`);
        return 0;
      }
      case "build": {
        const options = parseOptions(rest, ["--root"], 1);
        const image = options.positional[0]!;
        const result = build(options.root, image);
        process.stdout.write(result.lines.map((line) => `${line}\n`).join(""));
        if (result.problems.length > 0) {
          process.stderr.write(`Oracle build of ${image} failed (FR-6):\n${indent(result.problems)}`);
          return 1;
        }
        process.stdout.write(`Oracle image ${image} built twice and verified.\n`);
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
    process.stderr.write(`Oracle ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
