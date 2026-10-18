// The grader's assertion coverage report (Story 4.4, FR-116, ESC-4.4-1).
//
//   bun tools/assert-coverage/coverage.ts [--root <dir>]
//       (`bun run assert:coverage`) reads <root>/conformance/scans/phpunit-assertions.jsonl
//       and lists every scan name that has no implementation, grouped by owner,
//       then a summary line
//
// Each scan name has an owner, taken from the Upstream class that declares it
// (ESC-4.4-1):
//
//   assert     PHPUnit\Framework\Assert and PHPUnit\Framework\TestCase: every
//              name the table below does not list. Implemented when
//              @xaravel/assert's `Assert` (<root>/packages/assert/src/index.ts,
//              imported) or `TestCase.prototype` has a function of that name.
//   testing    Illuminate\Foundation\Testing\Concerns\* (Epic 57). The
//              component map gives `Illuminate\Foundation\` to `foundation`,
//              so the AD-3 file is
//              packages/foundation/src/Testing/Concerns/<Trait>.ts (ESC-4.4-2
//              item 5).
//   testbench  Orchestra\Testbench\Concerns\InteractsWithPublishedFiles (Epic
//              59): packages/testbench/src/Concerns/InteractsWithPublishedFiles.ts.
//
// A `testing` or `testbench` name is implemented when its owner's file
// declares a member of that name. While the file is absent the name is
// listed as `pending <owner>: <name> (<FQCN>)` and does not fail the report.
//
// Lines, on stdout, one per unimplemented name, grouped by owner (assert,
// testing, testbench), names sorted:
//
//   missing assert: <name>
//   missing <owner>: <name> (<FQCN>, <file>)
//   pending <owner>: <name> (<FQCN>)
//
// Exit codes: 0 when nothing is missing (pending names are allowed), 1 when an
// `assert` name is missing or an owner's file exists without its name (or the
// scan or the grader cannot be read), 2 on a usage error.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SCAN = "conformance/scans/phpunit-assertions.jsonl";
const GRADER = "packages/assert/src/index.ts";

type Owner = "testing" | "testbench";

interface Declared {
  readonly owner: Owner;
  readonly fqcn: string;
  readonly file: string;
}

const TESTING = "packages/foundation/src/Testing/Concerns";
const TESTBENCH = "packages/testbench/src/Concerns";

function testing(trait: string): Declared {
  return { owner: "testing", fqcn: `Illuminate\\Foundation\\Testing\\Concerns\\${trait}`, file: `${TESTING}/${trait}.ts` };
}

const PUBLISHED_FILES: Declared = { owner: "testbench", fqcn: "Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles", file: `${TESTBENCH}/InteractsWithPublishedFiles.ts` };

/** The 15 scan names PHPUnit does not declare, with the Upstream trait that does (ESC-4.4-1). */
export const NOT_PHPUNIT: ReadonlyMap<string, Declared> = new Map<string, Declared>([
  ["assertDatabaseCount", testing("InteractsWithDatabase")],
  ["assertDatabaseHas", testing("InteractsWithDatabase")],
  ["assertDatabaseMissing", testing("InteractsWithDatabase")],
  ["assertModelMissing", testing("InteractsWithDatabase")],
  ["assertAuthenticated", testing("InteractsWithAuthentication")],
  ["assertGuest", testing("InteractsWithAuthentication")],
  ["assertThrows", testing("InteractsWithExceptionHandling")],
  ["assertFileContains", PUBLISHED_FILES],
  ["assertFileDoesNotContains", PUBLISHED_FILES],
  ["assertFileNotContains", PUBLISHED_FILES],
  ["assertFilenameDoesNotExists", PUBLISHED_FILES],
  ["assertFilenameExists", PUBLISHED_FILES],
  ["assertFilenameNotExists", PUBLISHED_FILES],
  ["assertMigrationFileContains", PUBLISHED_FILES],
  ["assertMigrationFileExists", PUBLISHED_FILES],
]);

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): { root: string } {
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

/** The scan's names, in file order. */
export function readScanNames(root: string): string[] {
  const path = join(root, SCAN);
  if (!existsSync(path)) {
    throw new Error(`${SCAN} is missing under ${root}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      const parsed = JSON.parse(line) as { name?: unknown };
      if (typeof parsed.name !== "string" || parsed.name === "") {
        throw new Error(`${SCAN}:${index + 1}: no name`);
      }
      return parsed.name;
    });
}

/** Whether the TS source declares a class member (method, accessor or property) named `name`. */
export function declaresMember(source: string, name: string): boolean {
  const modifiers = "(?:(?:public|protected|private|static|readonly|override|async|abstract|declare|get|set)\\s+)*";
  return new RegExp(`^\\s*${modifiers}\\*?${name}\\s*[?!]?\\s*[(<:=;]`, "m").test(source);
}

export interface CoverageLine {
  readonly owner: "assert" | Owner;
  readonly status: "missing" | "pending";
  readonly name: string;
  readonly text: string;
}

/** Every unimplemented scan name, grouped by owner (assert, testing, testbench), names sorted. */
export async function coverage(root: string): Promise<{ names: number; lines: CoverageLine[] }> {
  const names = readScanNames(root);
  const grader = (await import(join(root, GRADER))) as { Assert?: unknown; TestCase?: { prototype?: unknown } };
  const assertClass = grader.Assert as Record<string, unknown> | undefined;
  const testCasePrototype = grader.TestCase?.prototype as Record<string, unknown> | undefined;
  if (typeof assertClass !== "function" || typeof testCasePrototype !== "object" || testCasePrototype === null) {
    throw new Error(`${GRADER} exports no Assert class or TestCase class`);
  }
  const lines: CoverageLine[] = [];
  for (const name of names) {
    const declared = NOT_PHPUNIT.get(name);
    if (declared === undefined) {
      if (typeof assertClass[name] !== "function" && typeof testCasePrototype[name] !== "function") {
        lines.push({ owner: "assert", status: "missing", name, text: `missing assert: ${name}` });
      }
      continue;
    }
    const file = join(root, declared.file);
    if (!existsSync(file)) {
      lines.push({ owner: declared.owner, status: "pending", name, text: `pending ${declared.owner}: ${name} (${declared.fqcn})` });
    } else if (!declaresMember(readFileSync(file, "utf8"), name)) {
      lines.push({ owner: declared.owner, status: "missing", name, text: `missing ${declared.owner}: ${name} (${declared.fqcn}, ${declared.file})` });
    }
  }
  const order = ["assert", "testing", "testbench"];
  lines.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: names.length, lines };
}

async function main(argv: readonly string[]): Promise<number> {
  let root: string;
  try {
    ({ root } = parseArgs(argv));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`assert:coverage: ${error.message}\nusage: bun tools/assert-coverage/coverage.ts [--root <dir>]\n`);
      return 2;
    }
    throw error;
  }
  try {
    const { names, lines } = await coverage(root);
    for (const line of lines) {
      process.stdout.write(`${line.text}\n`);
    }
    const missing = lines.filter((line) => line.status === "missing").length;
    const pending = lines.length - missing;
    process.stdout.write(`Assertion coverage: ${names} scan names; ${names - lines.length} implemented, ${pending} pending, ${missing} missing.\n`);
    return missing === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`assert:coverage: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
