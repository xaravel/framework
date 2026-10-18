// The grader's Mockery API coverage report (Story 4.6, FR-100, AC 3).
//
//   bun tools/mockery-coverage/coverage.ts [--root <dir>]
//       (`bun run mockery:coverage`) reads <root>/conformance/scans/mockery-api.jsonl
//       and lists every scan name that has no implementation in
//       @xaravel/mockery (<root>/packages/mockery/src/index.ts, imported), then
//       a summary line
//
// A scan line is `{"name", "static", "count"}`. A `static: true` name is
// implemented when `Mockery[name]` is a function. An instance name is
// implemented when it is a Mockery API member of a probe mock
// (`Mockery.mock()`, made inside a fresh run of the
// `Symbol.for('xaravel.mockery.run')` protocol and closed with it), or a
// function on `Expectation.prototype` or `CompositeExpectation.prototype`.
// A probe mock answers any name with a call dispatcher, so an API member is
// told apart by what the mock returns for it: its own method bound to the
// mock (`bound <name>`), not a dispatcher.
//
// `returns`, `throws` and `resolves` are `jasonmccreary/double`'s
// (`JMac\Testing\Double`, used by the ai, mcp and boost suites), not
// Mockery's; until an owner ports Double they are listed as pending
// (ESC-4.6-1 item 6) and do not fail the report.
//
// Lines, on stdout, one per unimplemented name, names sorted, missing first:
//
//   missing mockery: <name>
//   pending ESC-4.6-1: <name> (JMac\Testing\Double)
//
// Exit codes: 0 when nothing is missing (pending names are allowed), 1 when a
// name is missing (or the scan or the grader cannot be read), 2 on a usage
// error. The report is advisory in CI like `assert:coverage` (ESC-4.6-1 item 7).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SCAN = "conformance/scans/mockery-api.jsonl";
const GRADER = "packages/mockery/src/index.ts";

/** The scan names that are `jasonmccreary/double`'s, not Mockery's (ESC-4.6-1 item 6). */
export const DOUBLE_NAMES: ReadonlySet<string> = new Set(["resolves", "returns", "throws"]);

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

export interface ScanName {
  readonly name: string;
  readonly static: boolean;
}

/** The scan's names, in file order. */
export function readScanNames(root: string): ScanName[] {
  const path = join(root, SCAN);
  if (!existsSync(path)) {
    throw new Error(`${SCAN} is missing under ${root}`);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      const parsed = JSON.parse(line) as { name?: unknown; static?: unknown };
      if (typeof parsed.name !== "string" || parsed.name === "") {
        throw new Error(`${SCAN}:${index + 1}: no name`);
      }
      if (typeof parsed.static !== "boolean") {
        throw new Error(`${SCAN}:${index + 1}: no static flag`);
      }
      return { name: parsed.name, static: parsed.static };
    });
}

export interface CoverageLine {
  readonly status: "missing" | "pending";
  readonly name: string;
  readonly text: string;
}

interface Grader {
  Mockery?: unknown;
  Expectation?: { prototype?: unknown };
  CompositeExpectation?: { prototype?: unknown };
}

type RunProtocol = (fn: () => unknown) => Promise<unknown>;

/** The probe mock's Mockery API member names among `names`. */
async function probeMembers(mockery: Record<string, unknown>, names: readonly string[]): Promise<Set<string>> {
  const run = (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.mockery.run")];
  if (typeof run !== "function") {
    throw new Error(`${GRADER} installs no Symbol.for('xaravel.mockery.run') protocol`);
  }
  const found = new Set<string>();
  await (run as RunProtocol)(() => {
    const probe = (mockery["mock"] as () => Record<string, unknown>)();
    for (const name of names) {
      const member = probe[name];
      if (typeof member === "function" && member.name === `bound ${name}`) {
        found.add(name);
      }
    }
  });
  return found;
}

/** Every unimplemented scan name, missing before pending, names sorted. */
export async function coverage(root: string): Promise<{ names: number; lines: CoverageLine[] }> {
  const names = readScanNames(root);
  const grader = (await import(join(root, GRADER))) as Grader;
  const mockery = grader.Mockery as Record<string, unknown> | undefined;
  const expectation = grader.Expectation?.prototype as Record<string, unknown> | undefined;
  const composite = grader.CompositeExpectation?.prototype as Record<string, unknown> | undefined;
  if (typeof mockery !== "function" || typeof expectation !== "object" || expectation === null || typeof composite !== "object" || composite === null) {
    throw new Error(`${GRADER} exports no Mockery, Expectation or CompositeExpectation class`);
  }
  const members = await probeMembers(
    mockery,
    names.filter((entry) => !entry.static).map((entry) => entry.name),
  );
  const lines: CoverageLine[] = [];
  for (const { name, static: isStatic } of names) {
    const implemented = isStatic ? typeof mockery[name] === "function" : members.has(name) || typeof expectation[name] === "function" || typeof composite[name] === "function";
    if (implemented) {
      continue;
    }
    if (!isStatic && DOUBLE_NAMES.has(name)) {
      lines.push({ status: "pending", name, text: `pending ESC-4.6-1: ${name} (JMac\\Testing\\Double)` });
    } else {
      lines.push({ status: "missing", name, text: `missing mockery: ${name}` });
    }
  }
  const order = ["missing", "pending"];
  lines.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: names.length, lines };
}

async function main(argv: readonly string[]): Promise<number> {
  let root: string;
  try {
    ({ root } = parseArgs(argv));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`mockery:coverage: ${error.message}\nusage: bun tools/mockery-coverage/coverage.ts [--root <dir>]\n`);
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
    process.stdout.write(`Mockery API coverage: ${names} scan names; ${names - lines.length} implemented, ${pending} pending, ${missing} missing.\n`);
    return missing === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`mockery:coverage: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
