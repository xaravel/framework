// The skeleton `assert:coverage` and `mockery:coverage` share (Epic 4 retro
// item 5, finding A2): the `[--root <dir>]` argument, reading a scan's JSONL
// lines, and printing a report with its exit code.
//
// A report prints each line's text on stdout, then
//
//   <label>: <names> scan names; <implemented> implemented, <pending> pending, <missing> missing.
//
// and exits 0 when no line is missing (pending lines are allowed), 1 when one
// is (or the coverage throws: its message goes to stderr), and 2 on a usage
// error (the message and the usage line go to stderr).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export class UsageError extends Error {}

/** `[--root <dir>]`; the root defaults to the repository's. */
export function parseArgs(argv: readonly string[]): { root: string } {
  let root = resolve(import.meta.dir, "..", "..");
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--root") {
      const value = argv[++index];
      if (value === undefined || value === "") {
        throw new UsageError("--root needs a directory");
      }
      root = resolve(value);
    } else {
      throw new UsageError(`unknown argument: ${arg}`);
    }
  }
  return { root };
}

/** Each non-empty line of `<root>/<scan>`, parsed by `parseLine` (given the line's JSON value and its 1-based number). */
export function readJsonl<T>(root: string, scan: string, parseLine: (parsed: Record<string, unknown>, lineNumber: number) => T): T[] {
  const path = join(root, scan);
  if (!existsSync(path)) {
    throw new Error(`${scan} is missing under ${root}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => parseLine(JSON.parse(line) as Record<string, unknown>, index + 1));
}

/** One reported scan name. */
export interface ReportLine {
  readonly status: "missing" | "pending";
  readonly text: string;
}

export interface Report {
  /** The tool's name, prefixed to its stderr messages (`assert:coverage`). */
  readonly tool: string;
  /** The usage line printed after a usage error. */
  readonly usage: string;
  /** The summary line's label (`Assertion coverage`). */
  readonly label: string;
  /** The scan's name count and its unimplemented names, in print order. */
  readonly coverage: (root: string) => Promise<{ names: number; lines: readonly ReportLine[] }>;
}

/** Runs a report for `argv` and returns its exit code. */
export async function runReport(report: Report, argv: readonly string[]): Promise<number> {
  let root: string;
  try {
    ({ root } = parseArgs(argv));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${report.tool}: ${error.message}\nusage: ${report.usage}\n`);
      return 2;
    }
    throw error;
  }
  try {
    const { names, lines } = await report.coverage(root);
    for (const line of lines) {
      process.stdout.write(`${line.text}\n`);
    }
    const missing = lines.filter((line) => line.status === "missing").length;
    const pending = lines.length - missing;
    process.stdout.write(`${report.label}: ${names} scan names; ${names - lines.length} implemented, ${pending} pending, ${missing} missing.\n`);
    return missing === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${report.tool}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
