// Divergence Record and `adapted` marker checks (Story 8.1; FR-8, FR-113,
// AD-15; ESC-5.3-2; docs/ops/divergence.md documents the record shape).
//
//   bun tools/divergence/divergence.ts check [--root <dir>]
//       (`bun run divergence:check`) validates `decisions/DIV-1.md` to
//       `decisions/DIV-12.md`, then every non-null `adapted` in the
//       Expectations File and every `// adapted:` comment in the Ported Tests
//       against them. Prints one violation per line on stderr and exits 1, or
//       prints `Divergence OK: <r> record(s), <c> clause(s); <e> Expectations
//       marker(s), <p> assertion marker(s) checked.`
//
// Record rules (one violation per problem, naming the file):
//   - `decisions/DIV-<n>.md` exists for every n in 1..12
//     (`decisions/DIV-7.md: missing Divergence Record`).
//   - No other `decisions/` entry matches /^div/i (DIV-13.md, DIV-02.md,
//     div-5.md: `<file>: not a Divergence Record name (DIV-1..DIV-12)`).
//   - The `---`-fenced YAML frontmatter parses to a mapping; `div` equals n;
//     `title` is a non-empty string; `cites` and `sources` are lists of strings,
//     and each `sources` item is an existing file.
//   - The body has `## Rationale`, `## Behaviour` and `## Adaptation clauses`.
//   - The clauses, read by Boost's `divergenceClauses`
//     (tools/boost-framework/src/tools.ts), are at least one, carry no
//     duplicate `<k>`, and are numbered 1..m in file order.
//   - `fewer_assertions` (the ESC-5.3-2 floor waiver) is absent or a list; each
//     item is a quoted string `<k>` naming an existing clause. An unquoted
//     number is a violation: YAML reads `2.10` as `2.1`. Boost's
//     `fewerAssertions` reads it; the harness waives only the items it accepts.
//
// Marker rules (a marker names a clause `DIV-<n>.<k>` of an existing record,
// matching /^DIV-([1-9]\d*)\.([1-9]\d*)$/):
//   - Expectations: every non-null `adapted` under `conformance/expectations/`.
//     `<shard>:<line>: <id> × <variant>: adapted <v>: not DIV-<n>.<k>` or
//     `...: clause does not exist`; on a line whose `status` is not `pass`,
//     `...: only a pass line may carry adapted` (conformance/README.md). A shard that does not parse is one
//     violation pointing at `bun run expectations:check`.
//   - Ported Tests (`packages/*/tests/ported/**/*.test.ts`): every `adapted:`
//     in a `//` or `/* */` comment, that is every match of
//     /\badapted:[ \t]*(\S*)/g in the text from the line's first `//` or `/*`
//     on, or in the whole line when it starts inside a `/* */` block opened on
//     an earlier line (`scannedTail` carries the block state across lines; a
//     `/*` after a `//` opens no block); a trailing `*/` is stripped from the
//     token, and the token (empty when nothing follows) must strictly match
//     the marker regex.
//     `<file>:<line>: adapted:<token>: not DIV-<n>.<k>` or
//     `...: clause does not exist`.
//
// The frontmatter, clause and `fewer_assertions` parsers are imported from
// Boost, never copied, so "clause exists" means one thing across Boost, this
// check and the dashboard.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { portedTestFiles } from "../../conformance/harness/harness";
import { parseFrontmatter } from "../boost-framework/src/data";
import { divergenceClauses, fewerAssertions } from "../boost-framework/src/tools";
import { UsageError } from "../expectations/expectations";
import { readExpectations, type Shard } from "../pin-bump/pin-bump";

/** The Divergence Records PRD §5.2 defines: DIV-1..DIV-12. */
export const DIV_COUNT = 12;
export const DECISIONS_DIR = "decisions";
/** A clause reference: `DIV-<n>.<k>`. */
export const MARKER = /^DIV-([1-9]\d*)\.([1-9]\d*)$/;
/** The start of a comment on a Ported Test line: `//` or `/*`. */
export const COMMENT_START = /\/[/*]/;
/** A comment marker; the token is the non-space run after `adapted:` and optional blanks (possibly empty). */
export const COMMENT_MARKER = /\badapted:[ \t]*(\S*)/g;
export const REQUIRED_SECTIONS = ["## Rationale", "## Behaviour", "## Adaptation clauses"] as const;

/** What the block-state walk stops at outside a block: a comment start or a string quote. */
const WALK_TOKEN = /\/[/*]|['"`]/;
const RECORD_NAME = /^DIV-([1-9]|1[0-2])\.md$/;

export interface DivergenceReport {
  violations: string[];
  /** Records that exist (valid or not). */
  records: number;
  /** Clauses across the records that exist. */
  clauses: number;
  expectationMarkers: number;
  assertionMarkers: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Checks one record's text; returns its clause numbers (as `<k>` strings), pushing violations. */
function checkRecord(root: string, n: number, file: string, text: string, violations: string[]): Set<string> {
  const clauseSet = new Set<string>();
  const parsed = parseFrontmatter(text);
  if (parsed === null) {
    violations.push(`${file}: missing YAML frontmatter`);
    return clauseSet;
  }
  if (typeof parsed === "string") {
    violations.push(`${file}: ${parsed}`);
    return clauseSet;
  }
  const { fields, body } = parsed;
  if (fields["div"] !== n) {
    violations.push(`${file}: div must be ${n}, got ${JSON.stringify(fields["div"] ?? null)}`);
  }
  const title = fields["title"];
  if (typeof title !== "string" || title.trim() === "") {
    violations.push(`${file}: title must be a non-empty string`);
  }
  for (const key of ["cites", "sources"]) {
    if (!isStringList(fields[key])) {
      violations.push(`${file}: ${key} must be a list of strings`);
    }
  }
  const sources = fields["sources"];
  if (isStringList(sources)) {
    for (const source of sources) {
      if (!existsSync(join(root, source))) {
        violations.push(`${file}: sources item ${JSON.stringify(source)} does not exist`);
      }
    }
  }
  const lines = body.split("\n").map((line) => line.trimEnd());
  for (const section of REQUIRED_SECTIONS) {
    if (!lines.includes(section)) {
      violations.push(`${file}: missing section ${section}`);
    }
  }
  const ks = divergenceClauses(String(n), body).map((clause) => clause.id.slice(`DIV-${n}.`.length));
  if (ks.length === 0) {
    violations.push(`${file}: no adaptation clause (- **DIV-${n}.<k>** <text>)`);
  }
  for (const k of ks) {
    if (clauseSet.has(k)) {
      violations.push(`${file}: duplicate clause DIV-${n}.${k}`);
    }
    clauseSet.add(k);
  }
  const order = [...new Set(ks)];
  if (!order.every((k, index) => k === String(index + 1))) {
    violations.push(`${file}: clauses must be numbered 1..${order.length} in order, got ${order.join(", ")}`);
  }
  for (const problem of fewerAssertions(String(n), fields, body).problems) {
    violations.push(`${file}: ${problem}`);
  }
  return clauseSet;
}

/** The marker problem, or null when `value` names an existing clause. */
function markerProblem(value: string, clauses: ReadonlyMap<string, ReadonlySet<string>>): string | null {
  const match = MARKER.exec(value);
  if (match === null) {
    return "not DIV-<n>.<k>";
  }
  return clauses.get(match[1]!)?.has(match[2]!) === true ? null : "clause does not exist";
}

/**
 * The part of a Ported Test `line` the marker scan reads, and whether a `/* … *\/` block is still open after it.
 * `inBlock` says whether a block opened on an earlier line is open at the line's start. The tail is the whole line
 * when it starts inside a block, else the text from the line's first `//` or `/*` on (null when there is neither).
 * Walking the line, an open block ends at the next `*\/`; outside one, a `//` makes the rest of the line a line
 * comment (which opens no block) and a `/*` opens a block. The walk skips '…', "…" and `…` string literals on the
 * line (with backslash escapes); an unterminated quote runs to the end of the line and opens no block. The tail start
 * does not skip them, so every text read before block tracking is still read. Regex literals and template literals
 * spanning lines are not parsed: a `//` or `/*` in one can still end the walk early or open a false block.
 */
export function scannedTail(line: string, inBlock: boolean): { tail: string | null; inBlock: boolean } {
  let tail: string | null = null;
  if (inBlock) {
    tail = line;
  } else {
    const start = COMMENT_START.exec(line);
    tail = start === null ? null : line.slice(start.index);
  }
  let open = inBlock;
  let i = 0;
  while (i < line.length) {
    if (open) {
      const close = line.indexOf("*/", i);
      if (close === -1) {
        break;
      }
      open = false;
      i = close + 2;
      continue;
    }
    const start = WALK_TOKEN.exec(line.slice(i));
    if (start === null || start[0] === "//") {
      break;
    }
    i += start.index;
    if (start[0] === "/*") {
      open = true;
      i += 2;
      continue;
    }
    const quote = start[0];
    let j = i + 1;
    while (j < line.length && line[j] !== quote) {
      j += line[j] === "\\" ? 2 : 1;
    }
    if (j >= line.length) {
      break;
    }
    i = j + 1;
  }
  return { tail, inBlock: open };
}

/** Checks the records, the Expectations `adapted` fields and the Ported Test comment markers under `root`. */
export function checkDivergence(root: string): DivergenceReport {
  const violations: string[] = [];
  const clauses = new Map<string, Set<string>>();
  let records = 0;
  let clauseCount = 0;
  const dir = join(root, DECISIONS_DIR);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  for (const name of names) {
    if (/^div/i.test(name) && !RECORD_NAME.test(name)) {
      violations.push(`${DECISIONS_DIR}/${name}: not a Divergence Record name (DIV-1..DIV-${DIV_COUNT})`);
    }
  }
  for (let n = 1; n <= DIV_COUNT; n++) {
    const file = `${DECISIONS_DIR}/DIV-${n}.md`;
    if (!names.includes(`DIV-${n}.md`)) {
      violations.push(`${file}: missing Divergence Record`);
      continue;
    }
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch (error) {
      violations.push(`${file}: unreadable: ${message(error)}`);
      continue;
    }
    records++;
    const set = checkRecord(root, n, file, text, violations);
    clauseCount += set.size;
    clauses.set(String(n), set);
  }

  let expectationMarkers = 0;
  let shards: Shard[] = [];
  try {
    shards = readExpectations(root);
  } catch (error) {
    violations.push(`${message(error)} (run bun run expectations:check)`);
  }
  for (const shard of shards) {
    shard.lines.forEach((line, index) => {
      const adapted = line["adapted"];
      if (adapted === undefined || adapted === null) {
        return;
      }
      expectationMarkers++;
      const variant = typeof line["variant"] === "string" ? line["variant"] : JSON.stringify(line["variant"] ?? null);
      const shown = typeof adapted === "string" ? adapted : JSON.stringify(adapted);
      const problem = line["status"] !== "pass" ? "only a pass line may carry adapted" : typeof adapted === "string" ? markerProblem(adapted, clauses) : "not DIV-<n>.<k>";
      if (problem !== null) {
        violations.push(`${shard.path}:${index + 1}: ${String(line["id"])} × ${variant}: adapted ${shown}: ${problem}`);
      }
    });
  }

  let assertionMarkers = 0;
  for (const file of portedTestFiles(root)) {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch (error) {
      violations.push(`${file}: unreadable: ${message(error)}`);
      continue;
    }
    let inBlock = false;
    text.split("\n").forEach((line, index) => {
      const scan = scannedTail(line, inBlock);
      inBlock = scan.inBlock;
      if (scan.tail === null) {
        return;
      }
      for (const match of scan.tail.matchAll(COMMENT_MARKER)) {
        assertionMarkers++;
        const token = match[1]!.endsWith("*/") ? match[1]!.slice(0, -2) : match[1]!;
        const problem = markerProblem(token, clauses);
        if (problem !== null) {
          violations.push(`${file}:${index + 1}: adapted:${token}: ${problem}`);
        }
      }
    });
  }

  return { violations, records, clauses: clauseCount, expectationMarkers, assertionMarkers };
}

const USAGE = "Usage: bun tools/divergence/divergence.ts check [--root <dir>]";

function parseArgs(argv: readonly string[]): string {
  if (argv[0] !== "check") {
    throw new UsageError(argv[0] === undefined ? "Missing subcommand: check" : `Unknown subcommand: ${argv[0]}`);
  }
  const rest = argv.slice(1);
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = rest[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export function main(argv: readonly string[]): number {
  try {
    const report = checkDivergence(parseArgs(argv));
    if (report.violations.length > 0) {
      process.stderr.write(report.violations.map((violation) => `${violation}\n`).join(""));
      return 1;
    }
    process.stdout.write(
      `Divergence OK: ${report.records} record(s), ${report.clauses} clause(s); ${report.expectationMarkers} Expectations marker(s), ${report.assertionMarkers} assertion marker(s) checked.\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Divergence check failed: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
