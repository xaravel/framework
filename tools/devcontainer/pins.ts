// The devcontainer pin check (Story 5.10; AD-17, AD-28, NFR-7).
//
//   bun --no-env-file tools/devcontainer/pins.ts check [--root <dir>]
//       (`bun run devcontainer:pins`) checks that `.devcontainer/` uses CI's
//       toolchain and backend versions; it only reads files
//   bun --no-env-file tools/devcontainer/pins.ts check runtime [--root <dir>]
//       (`bun run devcontainer:pins runtime`, run inside the container) checks
//       the running workspace: a non-root user, `Bun.version` equal to
//       `.bun-version`, and `redis-server --version` (from PATH) reporting the
//       tag of the Dockerfile's `ARG REDIS_IMAGE`
//
// It compares three pins, each against all of its sources:
//   Bun       `.bun-version`, `ARG BUN_VERSION=` in `.devcontainer/Dockerfile`
//             and the spine's Stack-table `Bun` row (its first token);
//   Postgres  the `postgres` service image in `.devcontainer/compose.yaml`
//             and every job's `postgres` service image in
//             `.github/workflows/*.yml` / `*.yaml`, against the one in
//             `baseline.yml` (which must have one); that image's tag must equal
//             the spine's `PostgreSQL` row;
//   Redis     `ARG REDIS_IMAGE=` in the Dockerfile and every job's `redis`
//             service image in the workflows, against the one in
//             `baseline.yml` (which must have one); its tag must equal the
//             spine's `Redis` row.
// A missing source is a violation (`… not found`): the check fails closed. So
// is a workflow, `compose.yaml` or `devcontainer.json` that does not parse
// (`<file> could not be parsed`), and a `BUN_VERSION` or `REDIS_IMAGE` set in
// the Compose `workspace.build.args` or in `devcontainer.json`, which would
// override the Dockerfile's pinned `ARG` default.
// Each mismatch is one `devcontainer pins: <Bun|Postgres|Redis> …` line that
// names the file and both values.
//
// Exit codes: 0 pass (prints `devcontainer pins: ok`), 1 violations or any
// failure, 2 usage error. Violations go to stderr.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const BUN_VERSION_FILE = ".bun-version";
export const DOCKERFILE = ".devcontainer/Dockerfile";
export const COMPOSE_FILE = ".devcontainer/compose.yaml";
export const DEVCONTAINER_JSON = ".devcontainer/devcontainer.json";
export const PINNED_ARGS: readonly string[] = ["BUN_VERSION", "REDIS_IMAGE"];
export const WORKFLOWS_DIR = ".github/workflows";
export const BASELINE_WORKFLOW = `${WORKFLOWS_DIR}/baseline.yml`;
export const SPINE_FILE = "_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readText(root: string, file: string): string | null {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const UNPARSEABLE = Symbol("unparseable");

function parseYaml(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    return UNPARSEABLE;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return UNPARSEABLE;
  }
}

/** The names of `args`, given as a map or as a list of `NAME=value` / `NAME` strings. */
function argNames(args: unknown): string[] {
  if (Array.isArray(args)) {
    return args.map((arg) => String(arg).split("=")[0]!.trim());
  }
  return isObject(args) ? Object.keys(args) : [];
}

/** Every object key anywhere in a parsed JSON value. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }
  if (!isObject(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => [key, ...allKeys(entry)]);
}

/** The value of `ARG <name>=<value>` in a Dockerfile, or null. */
export function dockerArg(text: string, name: string): string | null {
  for (const line of text.split("\n")) {
    const match = /^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)=(\S+)\s*$/.exec(line);
    if (match !== null && match[1] === name) {
      return match[2]!.replace(/^"(.*)"$/, "$1");
    }
  }
  return null;
}

/** The Stack table of the spine: each row's name cell → version cell. */
export function stackRows(text: string): Map<string, string> {
  const rows = new Map<string, string>();
  let inStack = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      inStack = line.trim() === "## Stack";
      continue;
    }
    if (!inStack || !line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2 || cells[0] === "Name" || /^-+$/.test(cells[0]!)) {
      continue;
    }
    rows.set(cells[0]!, cells[1]!);
  }
  return rows;
}

/** The first token of the version cell of the Stack row whose name starts with `prefix` (then a space or the end). */
function stackVersion(rows: Map<string, string>, prefix: string): string | null {
  for (const [name, version] of rows) {
    if (name === prefix || name.startsWith(`${prefix} `)) {
      return version.split(/\s+/)[0]!.replace(/`/g, "") || null;
    }
  }
  return null;
}

/** The images of every job's `<service>` service in a workflow. */
function serviceImages(data: unknown, service: string): string[] {
  if (!isObject(data) || !isObject(data["jobs"])) {
    return [];
  }
  const images: string[] = [];
  for (const job of Object.values(data["jobs"])) {
    if (!isObject(job) || !isObject(job["services"])) {
      continue;
    }
    const entry = job["services"][service];
    if (isObject(entry)) {
      images.push(typeof entry["image"] === "string" ? entry["image"] : String(entry["image"]));
    }
  }
  return images;
}

export function tagOf(image: string): string {
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  return colon > slash ? image.slice(colon + 1) : "latest";
}

/** Every violation of the pins under `root` (see the header); empty when they agree. Reads files only. */
export function checkPins(root: string): string[] {
  const out: string[] = [];
  const say = (pin: string, text: string): void => {
    out.push(`devcontainer pins: ${pin} ${text}`);
  };

  // Sources.
  const bunFile = readText(root, BUN_VERSION_FILE);
  const bunPin = bunFile === null ? null : bunFile.trim() || null;
  const dockerfile = readText(root, DOCKERFILE);
  const composeText = readText(root, COMPOSE_FILE);
  const compose = composeText === null ? null : parseYaml(composeText);
  const spineText = readText(root, SPINE_FILE);
  const rows = spineText === null ? new Map<string, string>() : stackRows(spineText);
  const workflowsDir = join(root, WORKFLOWS_DIR);
  const workflowFiles = existsSync(workflowsDir)
    ? readdirSync(workflowsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
        .map((entry) => `${WORKFLOWS_DIR}/${entry.name}`)
        .sort(compare)
    : [];
  const workflows = workflowFiles.map((file) => ({ file, data: parseYaml(readFileSync(join(root, file), "utf8")) }));
  const baseline = workflows.find((flow) => flow.file === BASELINE_WORKFLOW) ?? null;
  const devcontainerText = readText(root, DEVCONTAINER_JSON);
  const devcontainer = devcontainerText === null ? null : parseJson(devcontainerText);

  // Unparseable sources fail closed: they would otherwise yield no images.
  for (const flow of workflows) {
    if (flow.data === UNPARSEABLE) {
      out.push(`devcontainer pins: ${flow.file} could not be parsed`);
    }
  }
  if (compose === UNPARSEABLE) {
    out.push(`devcontainer pins: ${COMPOSE_FILE} could not be parsed`);
  }
  if (devcontainer === UNPARSEABLE) {
    out.push(`devcontainer pins: ${DEVCONTAINER_JSON} could not be parsed`);
  }

  // Build-arg overrides of the pinned ARG defaults.
  const composeServices = isObject(compose) ? compose["services"] : null;
  const workspace = isObject(composeServices) ? composeServices["workspace"] : null;
  const build = isObject(workspace) ? workspace["build"] : null;
  const composeArgs = isObject(build) ? argNames(build["args"]) : [];
  const jsonKeys = allKeys(devcontainer);
  for (const name of PINNED_ARGS) {
    if (composeArgs.includes(name)) {
      out.push(`devcontainer pins: ${COMPOSE_FILE} workspace build.args sets ${name}; the pin is the Dockerfile's ARG ${name}`);
    }
    if (jsonKeys.includes(name)) {
      out.push(`devcontainer pins: ${DEVCONTAINER_JSON} sets ${name}; the pin is the Dockerfile's ARG ${name}`);
    }
  }

  // Bun.
  const bunArg = dockerfile === null ? null : dockerArg(dockerfile, "BUN_VERSION");
  const bunSpine = stackVersion(rows, "Bun");
  if (bunPin === null) {
    say("Bun", `${BUN_VERSION_FILE} not found`);
  }
  if (dockerfile === null) {
    say("Bun", `${DOCKERFILE} not found`);
  } else if (bunArg === null) {
    say("Bun", `ARG BUN_VERSION in ${DOCKERFILE} not found`);
  }
  if (bunSpine === null) {
    say("Bun", `Stack-table Bun row in ${SPINE_FILE} not found`);
  }
  if (bunPin !== null) {
    if (bunArg !== null && bunArg !== bunPin) {
      say("Bun", `${DOCKERFILE} ARG BUN_VERSION is ${bunArg}, but ${BUN_VERSION_FILE} is ${bunPin}`);
    }
    if (bunSpine !== null && bunSpine !== bunPin) {
      say("Bun", `${SPINE_FILE} Stack row is ${bunSpine}, but ${BUN_VERSION_FILE} is ${bunPin}`);
    }
  }

  // Postgres and Redis: the baseline service image is the reference.
  const backend = (pin: "Postgres" | "Redis", service: string, stackName: string, local: { file: string; what: string; image: string | null; missing: string | null }): void => {
    const reference = baseline === null ? null : (serviceImages(baseline.data, service)[0] ?? null);
    const spine = stackVersion(rows, stackName);
    if (reference === null) {
      say(pin, `${service} service image in ${BASELINE_WORKFLOW} not found`);
    }
    if (spine === null) {
      say(pin, `Stack-table ${stackName} row in ${SPINE_FILE} not found`);
    }
    if (local.missing !== null) {
      say(pin, local.missing);
    }
    if (reference === null) {
      return;
    }
    if (spine !== null && tagOf(reference) !== spine) {
      say(pin, `${SPINE_FILE} Stack row is ${spine}, but ${BASELINE_WORKFLOW} has ${reference}`);
    }
    if (local.image !== null && local.image !== reference) {
      say(pin, `${local.file} ${local.what} is ${local.image}, but ${BASELINE_WORKFLOW} has ${reference}`);
    }
    for (const flow of workflows) {
      for (const image of serviceImages(flow.data, service)) {
        if (image !== reference) {
          say(pin, `${flow.file} ${service} service image is ${image}, but ${BASELINE_WORKFLOW} has ${reference}`);
        }
      }
    }
  };

  let pgImage: string | null = null;
  let pgMissing: string | null = null;
  if (composeText === null) {
    pgMissing = `${COMPOSE_FILE} not found`;
  } else {
    const postgres = isObject(composeServices) ? composeServices["postgres"] : null;
    if (isObject(postgres) && typeof postgres["image"] === "string") {
      pgImage = postgres["image"];
    } else {
      pgMissing = `postgres service image in ${COMPOSE_FILE} not found`;
    }
  }
  backend("Postgres", "postgres", "PostgreSQL", { file: COMPOSE_FILE, what: "postgres image", image: pgImage, missing: pgMissing });

  const redisArg = dockerfile === null ? null : dockerArg(dockerfile, "REDIS_IMAGE");
  const redisMissing = dockerfile === null ? `${DOCKERFILE} not found` : redisArg === null ? `ARG REDIS_IMAGE in ${DOCKERFILE} not found` : null;
  backend("Redis", "redis", "Redis", { file: DOCKERFILE, what: "ARG REDIS_IMAGE", image: redisArg, missing: redisMissing });

  return out;
}

// ---------------------------------------------------------------------------
// Runtime (inside the container)

/** A violation when the process runs as root (uid 0), else null. */
export function runtimeUser(uid: number): string | null {
  return uid === 0 ? "devcontainer pins: runtime user is root (uid 0); the workspace must run as a non-root user" : null;
}

/** A violation when the running Bun differs from `.bun-version`, else null. */
export function runtimeBun(version: string, pin: string): string | null {
  return version === pin ? null : `devcontainer pins: runtime Bun is ${version}, but ${BUN_VERSION_FILE} is ${pin}`;
}

/** A violation when `redis-server --version` output does not report the tag of `image`, else null. */
export function runtimeRedis(versionOutput: string | null, image: string): string | null {
  if (versionOutput === null) {
    return "devcontainer pins: runtime redis-server not found on PATH";
  }
  const version = /\bv=(\S+)/.exec(versionOutput)?.[1] ?? null;
  if (version === tagOf(image)) {
    return null;
  }
  return `devcontainer pins: runtime redis-server --version reports ${version ?? JSON.stringify(versionOutput.trim())}, but ${DOCKERFILE} ARG REDIS_IMAGE is ${image}`;
}

/** Every runtime violation of this process and its PATH, against the pins under `root`. */
export function checkRuntime(root: string): string[] {
  const out: string[] = [];
  const add = (violation: string | null): void => {
    if (violation !== null) {
      out.push(violation);
    }
  };
  add(runtimeUser(process.getuid?.() ?? 0));
  const bunFile = readText(root, BUN_VERSION_FILE);
  const bunPin = bunFile === null ? null : bunFile.trim() || null;
  if (bunPin === null) {
    out.push(`devcontainer pins: runtime ${BUN_VERSION_FILE} not found`);
  } else {
    add(runtimeBun(Bun.version, bunPin));
  }
  const dockerfile = readText(root, DOCKERFILE);
  const image = dockerfile === null ? null : dockerArg(dockerfile, "REDIS_IMAGE");
  if (image === null) {
    out.push(`devcontainer pins: runtime ARG REDIS_IMAGE in ${DOCKERFILE} not found`);
  } else {
    const server = Bun.which("redis-server");
    const result = server === null ? null : Bun.spawnSync([server, "--version"], { stdout: "pipe", stderr: "pipe" });
    add(runtimeRedis(result === null || result.exitCode !== 0 ? null : result.stdout.toString(), image));
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun --no-env-file tools/devcontainer/pins.ts check [--root <dir>]", "  bun --no-env-file tools/devcontainer/pins.ts check runtime [--root <dir>]"].join("\n");

function parseRoot(argv: readonly string[]): string {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    if (command !== "check") {
      throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
    const runtime = rest[0] === "runtime";
    const root = parseRoot(runtime ? rest.slice(1) : rest);
    const violations = runtime ? checkRuntime(root) : checkPins(root);
    if (violations.length > 0) {
      process.stderr.write(`${violations.join("\n")}\n`);
      return 1;
    }
    process.stdout.write(runtime ? "devcontainer pins: runtime ok\n" : "devcontainer pins: ok\n");
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`devcontainer pins: check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
