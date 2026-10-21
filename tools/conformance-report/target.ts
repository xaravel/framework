// The SM-1 target check (Epic 7 retro item 10; PRD SM-1, FR-5.4).
//
//   bun --no-env-file tools/conformance-report/target.ts --history <file>
//       (`bun run conformance:target`, the last step of
//       `.github/workflows/dashboard.yml`) reads a `history.jsonl` and checks
//       SM-1's target: the Conformance Rate never decreases between Phase
//       boundaries under the same Baseline Pin. It prints
//       `conformance:target: ok (<k> Phase boundaries checked across <s> Pin series)`
//       (`boundary` when <k> is 1),
//       or each violation on stderr.
//
// The records split into Pin series as the history chart splits them
// (`pinSeries`: a new series at every record whose (pin tag, pin commit)
// differs from the previous record's). In a series, the reference points are
// its first record and every boundary record: one whose `phase` is higher
// than the `phase` of the nearest earlier record in the series that has one
// (a line written before `phase` was recorded has none, so it never makes the
// next record a boundary). For each scope (overall, and each Component), a
// reference point with pairs must not be lower than the last earlier
// reference point in the series with pairs for that scope, compared exactly
// (`p2·n1 >= p1·n2`); a point with no pair (or without the Component) is
// skipped for that scope. A record whose `phase`
// is lower than an earlier record's in the series is a violation too (`phase
// went back`). `referencePoints` and `targetViolations` are pure, and the
// dashboard (site.ts) renders both; `parseHistory` is shared with it.
//
// Exit codes: 0 the target holds, 1 a violation or a missing or malformed
// history, 2 usage error.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareUnits } from "../inventory/inventory";
import type { HistoryRecord } from "./history";

/** A malformed history: the CLI exits 1. */
export class TargetError extends Error {}

/** Parses `history.jsonl` text; throws TargetError naming `file` and the line of a malformed record. */
export function parseHistory(text: string, file: string): HistoryRecord[] {
  const records: HistoryRecord[] = [];
  text.split("\n").forEach((line, index) => {
    if (line === "") {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new TargetError(`${file}:${index + 1}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = value as Partial<HistoryRecord> | null;
    if (
      record === null ||
      typeof record !== "object" ||
      typeof record.commit !== "string" ||
      typeof record.pin?.tag !== "string" ||
      typeof record.pin.commit !== "string" ||
      typeof record.overall?.pairs !== "number" ||
      typeof record.overall.passing !== "number" ||
      typeof record.alpha?.applicable !== "number" ||
      typeof record.alpha.passing !== "number" ||
      (record.components !== undefined && (record.components === null || typeof record.components !== "object")) ||
      (record.phase !== undefined && (!Number.isInteger(record.phase) || record.phase < 0)) ||
      (record.inventory !== undefined && (record.inventory === null || typeof record.inventory.ids !== "number" || typeof record.inventory.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.inventory.sha256)))
    ) {
      throw new TargetError(`${file}:${index + 1}: not a history record`);
    }
    records.push(record as HistoryRecord);
  });
  return records;
}

/** Reads and parses a `history.jsonl`; throws TargetError when it is missing or malformed. */
export function readHistoryFile(file: string): HistoryRecord[] {
  if (!existsSync(file)) {
    throw new TargetError(`${file} does not exist`);
  }
  return parseHistory(readFileSync(file, "utf8"), file);
}

export interface PinSeries {
  pin: { tag: string; commit: string };
  /** The index, across all records, of the series' first record. */
  start: number;
  records: HistoryRecord[];
}

/** Splits `records`, in file order, into one series per run of the same Baseline Pin (as the history chart does). */
export function pinSeries(records: readonly HistoryRecord[]): PinSeries[] {
  const series: PinSeries[] = [];
  records.forEach((record, index) => {
    const last = series.at(-1);
    if (last === undefined || last.pin.tag !== record.pin.tag || last.pin.commit !== record.pin.commit) {
      series.push({ pin: { tag: record.pin.tag, commit: record.pin.commit }, start: index, records: [] });
    }
    series.at(-1)!.records.push(record);
  });
  return series;
}

export interface ReferencePoint {
  record: HistoryRecord;
  /** The index, across all records. */
  index: number;
  /** True for a Phase boundary record; false for the series' first record. */
  boundary: boolean;
}

export interface SeriesPoints {
  pin: { tag: string; commit: string };
  points: ReferencePoint[];
  /** Records whose phase is lower than an earlier record's in the series, each with the earlier record holding the higher phase. */
  wentBack: { from: HistoryRecord; to: HistoryRecord }[];
}

/** The reference points of every Pin series: its first record and every Phase boundary record. */
export function referencePoints(records: readonly HistoryRecord[]): SeriesPoints[] {
  return pinSeries(records).map((series) => {
    const points: ReferencePoint[] = [];
    const wentBack: { from: HistoryRecord; to: HistoryRecord }[] = [];
    /** The nearest earlier record with a phase. */
    let lastPhased: HistoryRecord | null = null;
    /** The earliest record holding the highest phase so far. */
    let highest: HistoryRecord | null = null;
    series.records.forEach((record, i) => {
      const index = series.start + i;
      if (i === 0) {
        points.push({ record, index, boundary: false });
      } else if (record.phase !== undefined && lastPhased !== null && record.phase > lastPhased.phase!) {
        points.push({ record, index, boundary: true });
      }
      if (record.phase !== undefined) {
        if (highest !== null && record.phase < highest.phase!) {
          wentBack.push({ from: highest, to: record });
        }
        if (highest === null || record.phase > highest.phase!) {
          highest = record;
        }
        lastPhased = record;
      }
    });
    return { pin: series.pin, points, wentBack };
  });
}

/** The number of Phase boundary records across `series`. */
export function boundaryCount(series: readonly SeriesPoints[]): number {
  return series.reduce((sum, one) => sum + one.points.filter((point) => point.boundary).length, 0);
}

/** `<k> Phase boundar(y|ies) checked across <s> Pin series`, as the CLI and the dashboard print it. */
export function checkedSummary(series: readonly SeriesPoints[]): string {
  const k = boundaryCount(series);
  return `${k} Phase ${k === 1 ? "boundary" : "boundaries"} checked across ${series.length} Pin series`;
}

function phaseOf(record: HistoryRecord): string {
  return record.phase === undefined ? "unknown" : String(record.phase);
}

function pair(tag: string, from: HistoryRecord, to: HistoryRecord): string {
  return `${tag}: ${from.commit.slice(0, 12)} (phase ${phaseOf(from)}) → ${to.commit.slice(0, 12)} (phase ${phaseOf(to)})`;
}

/** Whether `to` (passing / pairs) is lower than `from`; both have pairs. Exact, by cross-multiplication. */
function decreased(from: { pairs: number; passing: number }, to: { pairs: number; passing: number }): boolean {
  return to.passing * from.pairs < from.passing * to.pairs;
}

/** Every SM-1 target violation in `records`, one line each; empty when the target holds. */
export function targetViolations(records: readonly HistoryRecord[]): string[] {
  const out: string[] = [];
  for (const series of referencePoints(records)) {
    const tag = series.pin.tag;
    for (const { from, to } of series.wentBack) {
      out.push(`${pair(tag, from, to)}: phase went back`);
    }
    // Per scope, the last earlier reference point with pairs for it.
    let lastOverall: HistoryRecord | null = null;
    const lastComponent = new Map<string, HistoryRecord>();
    for (const { record: to } of series.points) {
      if (to.overall.pairs > 0) {
        if (lastOverall !== null && decreased(lastOverall.overall, to.overall)) {
          out.push(`${pair(tag, lastOverall, to)}: overall ${lastOverall.overall.passing}/${lastOverall.overall.pairs} → ${to.overall.passing}/${to.overall.pairs}`);
        }
        lastOverall = to;
      }
      const toComponents = to.components ?? {};
      for (const component of Object.keys(toComponents).sort(compareUnits)) {
        const b = toComponents[component]!;
        if (b.pairs === 0) {
          continue;
        }
        const from = lastComponent.get(component);
        const a = from?.components?.[component];
        if (from !== undefined && a !== undefined && decreased(a, b)) {
          out.push(`${pair(tag, from, to)}: component ${component} ${a.passing}/${a.pairs} → ${b.passing}/${b.pairs}`);
        }
        lastComponent.set(component, to);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/conformance-report/target.ts --history <file>";

function parseArgs(argv: readonly string[]): { history: string } {
  let history: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--history") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    history = resolve(value);
  }
  if (history === null) {
    throw new UsageError("--history is required");
  }
  return { history };
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    const records = readHistoryFile(args.history);
    const violations = targetViolations(records);
    if (violations.length > 0) {
      process.stderr.write(violations.map((line) => `conformance:target: ${line}\n`).join(""));
      return 1;
    }
    process.stdout.write(`conformance:target: ok (${checkedSummary(referencePoints(records))})\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`conformance:target: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
