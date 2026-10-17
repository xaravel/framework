// The workflow permissions check (Story 1.7, AD-16, AD-28).
//
//   bun tools/workflow-permissions/workflow-permissions.ts check [--root <dir>]
//       parses every `.github/workflows/*.yml` and `*.yaml` in the root
//
// Rules: a workflow's top-level `permissions` must be exactly
// `{contents: read}`. A job may hold a `write` scope, `write-all` or
// `id-token: write` only when `<file base name>#<job id>` is in
// ALLOWED_WRITE_JOBS (an exact match: `release.yaml#release` is not
// `release.yml#release`).
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Violations go to stderr, one `workflow permissions: <file> …` line each.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const WORKFLOWS_DIR = ".github/workflows";
/** The only jobs that may hold a write scope, keyed `<workflow file name>#<job id>` (AD-16, AD-18). */
export const ALLOWED_WRITE_JOBS = ["oracle.yml#oracle", "dashboard.yml#dashboard", "release.yml#release"] as const;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The write grants in a `permissions` value: `write-all`, or each `<scope>: write`. */
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

function validPermissions(permissions: unknown): boolean {
  if (permissions === "read-all" || permissions === "write-all") {
    return true;
  }
  return isObject(permissions) && Object.values(permissions).every((level) => level === "read" || level === "write" || level === "none");
}

/** The violations of one workflow file; `file` is its repo-relative path. */
export function checkWorkflow(file: string, text: string): string[] {
  const bad = (problem: string): string => `workflow permissions: ${file} ${problem} (AD-16)`;
  let data: unknown;
  try {
    data = Bun.YAML.parse(text);
  } catch (error) {
    return [bad(`is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)];
  }
  if (!isObject(data)) {
    return [bad("must be a YAML mapping")];
  }
  const out: string[] = [];
  const name = basename(file);
  const top = data["permissions"];
  const topOk = isObject(top) && Object.keys(top).length === 1 && top["contents"] === "read";
  if (!topOk) {
    out.push(bad(`top-level permissions must be exactly {contents: read}, got ${top === undefined ? "missing" : JSON.stringify(top)}`));
  }
  const jobs = data["jobs"];
  if (!isObject(jobs)) {
    out.push(bad("has no jobs mapping"));
    return out;
  }
  for (const id of Object.keys(jobs).sort(compare)) {
    const job = jobs[id];
    if (!isObject(job) || !("permissions" in job)) {
      continue;
    }
    const permissions = job["permissions"];
    if (!validPermissions(permissions)) {
      out.push(bad(`job ${id} has malformed permissions ${JSON.stringify(permissions)}`));
      continue;
    }
    const grants = writeGrants(permissions);
    if (grants.length > 0 && !(ALLOWED_WRITE_JOBS as readonly string[]).includes(`${name}#${id}`)) {
      out.push(bad(`job ${id} holds ${grants.join(", ")}; write scopes are allowed only in ${ALLOWED_WRITE_JOBS.join(", ")}`));
    }
  }
  return out;
}

/** Checks every workflow under `root`. A root without the workflows directory, or one holding no workflows, is a violation (fail closed). */
export function checkWorkflows(root: string): { files: string[]; violations: string[] } {
  const dir = join(root, WORKFLOWS_DIR);
  if (!existsSync(dir)) {
    return { files: [], violations: [`workflow permissions: ${WORKFLOWS_DIR} does not exist (AD-16)`] };
  }
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => `${WORKFLOWS_DIR}/${entry.name}`)
    .sort(compare);
  if (files.length === 0) {
    return { files, violations: [`workflow permissions: ${WORKFLOWS_DIR} has no workflows (AD-16)`] };
  }
  const violations = files.flatMap((file) => checkWorkflow(file, readFileSync(join(root, file), "utf8")));
  return { files, violations };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/workflow-permissions/workflow-permissions.ts check [--root <dir>]"].join("\n");

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
    const result = checkWorkflows(parseRoot(rest));
    if (result.violations.length > 0) {
      process.stderr.write(`Workflow permissions violations (AD-16):\n${result.violations.map((line) => `  ${line}`).join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`Workflow permissions OK: ${result.files.length} workflow(s) checked.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Workflow permissions check failed: ${error instanceof Error ? error.message : String(error)} (AD-16)\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
