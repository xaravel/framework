// The entry-script check (ESC-15.3-1, FR-20.2; the spine's Config row:
// "`--no-env-file` in every entry script").
//
//   bun tools/entry-scripts/entry-scripts.ts check [--root <dir>]
//       reads the `scripts` of the root `package.json`, `skeleton/package.json`
//       and every `packages/*/package.json`
//
// Rules: each script value is split on `&&`, `||`, `;` and `|` into commands.
// A command whose first word, after any leading `NAME=value` assignments, is
// `bun` starts a Bun process that would autoload `.env`, so it must carry
// `--no-env-file` among the options before its subcommand or entry file:
// `bun --no-env-file test`, `bun --no-env-file run <script>`,
// `bun --no-env-file --bun <bin>`, `bun --no-env-file <file>`. A command whose
// subcommand is a package-manager one that runs no project code (PM_SUBCOMMANDS)
// is exempt. The split ignores quoting, so a separator inside a quoted argument
// splits too; that only ever adds commands to check.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Violations go to stderr, one line each:
//
//   entry-scripts: <file>: scripts.<name>: bun command lacks --no-env-file (FR-20.2)
//
// The root `package.json` is required; a missing `skeleton/package.json` or
// `packages/` is not a violation. A file that is not valid JSON, a `scripts`
// that is not an object, or a script value that is not a string is one.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FLAG = "--no-env-file";
/** The `bun` subcommands that only manage packages and run no project code, so need no `--no-env-file`. */
export const PM_SUBCOMMANDS = ["install", "add", "remove", "update", "pm", "link", "unlink", "outdated", "patch", "publish"] as const;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The commands of a script value: split on `&&`, `||`, `;` and `|`, trimmed, empty ones dropped. */
export function splitCommands(value: string): string[] {
  return value
    .split(/&&|\|\||;|\|/)
    .map((command) => command.trim())
    .filter((command) => command !== "");
}

/** The words after `bun` when one command's first word, after any leading `NAME=value` assignments, is `bun`; otherwise null. */
function bunArguments(command: string): string[] | null {
  const words = command.split(/\s+/).filter((word) => word !== "");
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) {
    i++;
  }
  return words[i] === "bun" ? words.slice(i + 1) : null;
}

/** Whether one command is a `bun` command that needs `--no-env-file` before its subcommand or entry file and lacks it. */
export function lacksFlag(command: string): boolean {
  const args = bunArguments(command);
  if (args === null) {
    return false;
  }
  for (const word of args) {
    if (word === FLAG) {
      return false;
    }
    if (!word.startsWith("-")) {
      return !(PM_SUBCOMMANDS as readonly string[]).includes(word);
    }
  }
  return true;
}

/** The commands of a script value that lack the flag, in order. */
export function commandsLackingFlag(value: string): string[] {
  return splitCommands(value).filter(lacksFlag);
}

/** The repo-relative `package.json` files the check reads under `root`: the root's, the Skeleton's, then each package's, sorted. */
export function packageFiles(root: string): string[] {
  const files = ["package.json"];
  if (existsSync(join(root, "skeleton", "package.json"))) {
    files.push("skeleton/package.json");
  }
  const packages = join(root, "packages");
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (entry.isDirectory() && existsSync(join(packages, entry.name, "package.json"))) {
        files.push(`packages/${entry.name}/package.json`);
      }
    }
  }
  return files;
}

/** The violations of one `package.json` and the number of `bun` commands in its scripts; `file` is its repo-relative path. */
export function checkPackageJson(file: string, text: string): { commands: number; violations: string[] } {
  const bad = (problem: string): string => `entry-scripts: ${file}: ${problem} (FR-20.2)`;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { commands: 0, violations: [bad(`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)] };
  }
  if (!isObject(data)) {
    return { commands: 0, violations: [bad("is not a JSON object")] };
  }
  const scripts = data["scripts"];
  if (scripts === undefined) {
    return { commands: 0, violations: [] };
  }
  if (!isObject(scripts)) {
    return { commands: 0, violations: [bad("scripts is not an object")] };
  }
  let commands = 0;
  const violations: string[] = [];
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") {
      violations.push(bad(`scripts.${name}: is not a string`));
      continue;
    }
    commands += splitCommands(value).filter((command) => bunArguments(command) !== null).length;
    if (commandsLackingFlag(value).length > 0) {
      violations.push(bad(`scripts.${name}: bun command lacks ${FLAG}`));
    }
  }
  return { commands, violations };
}

/** Checks every entry script under `root`. A root without a `package.json` is a violation (fail closed). */
export function checkEntryScripts(root: string): { files: string[]; commands: number; violations: string[] } {
  if (!existsSync(join(root, "package.json"))) {
    return { files: [], commands: 0, violations: ["entry-scripts: package.json does not exist (FR-20.2)"] };
  }
  const files = packageFiles(root);
  let commands = 0;
  const violations: string[] = [];
  for (const file of files) {
    const result = checkPackageJson(file, readFileSync(join(root, file), "utf8"));
    commands += result.commands;
    violations.push(...result.violations);
  }
  return { files, commands, violations };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/entry-scripts/entry-scripts.ts check [--root <dir>]"].join("\n");

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
    const result = checkEntryScripts(parseRoot(rest));
    if (result.violations.length > 0) {
      process.stderr.write(`${result.violations.join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`Entry scripts OK: ${result.commands} bun command(s) in ${result.files.length} package.json file(s) checked.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`entry-scripts: check failed: ${error instanceof Error ? error.message : String(error)} (FR-20.2)\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
