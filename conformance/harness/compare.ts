// The harness's comparison of results with the Expectations File (Story 5.3,
// FR-3, FR-9, FR-113, AD-15). Pure: everything it reads is passed in.
//
// The actual outcome of `(id, variant)` on a run variant, from the junit
// testcase named `id` and the Ported Test report whose `id` is `id`:
//
//   fail            more than one Ported Test report carries the id (a
//                   forged report: the id's result can't be trusted)
//   blocked-by:<c>  the failure's type is `BlockedByComponentError` and its
//                   message starts `BlockedByComponentError(<c>)` (ESC-5.3-1)
//   fail            any other failure
//   late            the test recorded an assertion after it ended
//   skip            a junit `<skipped>`, or a report with a `skipped` key
//                   (ESC-4.4-2 item 1)
//   no-report       bun passed it but there is no report
//   pass            otherwise
//   missing         there is no testcase
//
// `fail`, `late`, `no-report` and `blocked-by:*` are failures. A `pass` is
// below the floor when, for some kind, its report records fewer assertions
// than the Inventory's `assertions` (null Inventory assertions never are);
// that counts as a failure unless the waiver applies (`waived(line)`, below).
//
// Matching, by the line's status: `pass` wants a `pass` within the floor;
// `fail-known` wants a failure or a below-floor pass; `quarantined` takes
// anything; `skip` / `blocked-by:<c>` wants exactly `blocked-by:<c>`; any
// other `skip` wants `skip` or `missing`. Anything else (an unknown status) never
// matches.
//
// A differing pair prints
//   <STATUS> <id> [<variant>] expected=<e> actual=<a> asserts=<n>/<u>
// with STATUS `FLOOR` (below-floor pass), `UNEXPECTED-PASS` (pass), `FAIL` (a
// failure), `SKIPPED` (skip) or `MISSING` (missing); `e` is the status or
// `skip:<reason>`; `n` is the sum of the report's assertions or `-`; `u` is the
// sum of the Inventory's or `-` when null. A Ported Test report whose id has no
// Expectations line on any variant prints
//   UNKNOWN <id> [<variant>] expected=- actual=<a> asserts=<n>/-
import type { JunitCase } from "./junit";

export const BLOCKED_BY_ERROR = "BlockedByComponentError";

/** One Ported Test report, as the preload records it (ESC-4.2-1). */
export interface HarnessReport {
  readonly type: string;
  readonly id: string;
  readonly assertions: Readonly<Record<string, number>>;
  readonly skipped?: unknown;
}

/** The fields of an Expectations line the harness reads. */
export interface HarnessLine {
  readonly id: string;
  readonly variant: string;
  readonly status: string;
  readonly reason: string | null;
  readonly adapted: string | null;
}

/** What one variant's run produced. */
export interface VariantRun {
  readonly junit: ReadonlyMap<string, JunitCase>;
  /** Ported Test reports by id (`type: "xaravel"` reports are not here). */
  readonly reports: ReadonlyMap<string, HarnessReport>;
  /** Ids that recorded an assertion after they ended. */
  readonly late: ReadonlySet<string>;
  /** Ids with more than one Ported Test report. */
  readonly duplicates: ReadonlySet<string>;
}

export type Outcome = "pass" | "fail" | "late" | "no-report" | "skip" | "missing" | `blocked-by:${string}`;

export interface Result {
  readonly id: string;
  readonly variant: string;
  readonly outcome: Outcome;
  readonly belowFloor: boolean;
  /** The sum of the report's assertions, or null without a report. */
  readonly performed: number | null;
  /** The sum of the Inventory's assertions, or null when they are null or unknown. */
  readonly upstream: number | null;
}

/** How a difference counts for the Ratchet (Story 5.6): only `UNEXPECTED-PASS` is a pass; everything else, `UNKNOWN` included, is a failure. */
export type DifferenceKind = "unexpected-pass" | "unexpected-failure";

export interface Difference {
  readonly id: string;
  readonly variant: string;
  readonly kind: DifferenceKind;
  readonly text: string;
  /** Why it differs, for the diagnostics: the junit failure or the kinds below the floor; null when there is nothing to add. */
  readonly detail: string | null;
}

export interface CompareInput {
  readonly variant: string;
  /** The Expectations lines of `variant`. */
  readonly lines: readonly HarnessLine[];
  /** Every id with an Expectations line on any variant. */
  readonly knownIds: ReadonlySet<string>;
  readonly run: VariantRun;
  /** Inventory `assertions` by id. */
  readonly inventory: ReadonlyMap<string, Readonly<Record<string, number>> | null>;
  /** Whether the line's `adapted` DIV clause allows fewer assertions (ESC-5.3-2). */
  readonly waived: (line: HarnessLine) => boolean;
}

export interface CompareOutput {
  readonly results: Result[];
  readonly differences: Difference[];
}

const FAILURES: ReadonlySet<string> = new Set(["fail", "late", "no-report"]);

export function isFailure(outcome: Outcome): boolean {
  return FAILURES.has(outcome) || outcome.startsWith("blocked-by:");
}

/** The component named by a `BlockedByComponentError(<c>)` failure, or null. */
export function blockedComponent(junit: JunitCase): string | null {
  if (junit.type !== BLOCKED_BY_ERROR || junit.message === null) {
    return null;
  }
  const match = /^BlockedByComponentError\(([^()\s]+)\)/.exec(junit.message);
  return match === null ? null : match[1]!;
}

/** The actual outcome of `id` in `run`. */
export function actualOutcome(id: string, run: VariantRun): Outcome {
  const junit = run.junit.get(id);
  if (junit === undefined) {
    return "missing";
  }
  if (run.duplicates.has(id)) {
    return "fail";
  }
  if (junit.outcome === "failed") {
    const component = blockedComponent(junit);
    return component === null ? "fail" : `blocked-by:${component}`;
  }
  if (run.late.has(id)) {
    return "late";
  }
  if (junit.outcome === "skipped") {
    return "skip";
  }
  const report = run.reports.get(id);
  if (report === undefined) {
    return "no-report";
  }
  return Object.hasOwn(report, "skipped") ? "skip" : "pass";
}

function sum(assertions: Readonly<Record<string, number>> | null | undefined): number | null {
  if (assertions === null || assertions === undefined) {
    return null;
  }
  return Object.values(assertions).reduce((total, count) => total + (typeof count === "number" ? count : 0), 0);
}

/** Whether `report` records fewer assertions of some kind than `upstream`. */
export function belowFloor(report: HarnessReport | undefined, upstream: Readonly<Record<string, number>> | null | undefined): boolean {
  if (report === undefined || upstream === null || upstream === undefined) {
    return false;
  }
  return Object.entries(upstream).some(([kind, count]) => (report.assertions[kind] ?? 0) < count);
}

/** The kinds `report` records fewer of than `upstream`, as `<kind> <n><<u>`, space-separated. */
export function shortfall(report: HarnessReport | undefined, upstream: Readonly<Record<string, number>> | null | undefined): string {
  if (report === undefined || upstream === null || upstream === undefined) {
    return "";
  }
  return Object.entries(upstream)
    .filter(([kind, count]) => (report.assertions[kind] ?? 0) < count)
    .map(([kind, count]) => `${kind} ${report.assertions[kind] ?? 0}<${count}`)
    .join(" ");
}

/** The diagnostic detail of a differing pair, or null. */
function detailOf(id: string, run: VariantRun, outcome: Outcome, floorFailed: boolean, report: HarnessReport | undefined, upstream: Readonly<Record<string, number>> | null | undefined): string | null {
  if (outcome === "pass" && floorFailed) {
    return `below the floor: ${shortfall(report, upstream)}`;
  }
  if (run.duplicates.has(id)) {
    return "more than one Ported Test report carries this id";
  }
  const junit = run.junit.get(id);
  if (isFailure(outcome) && junit !== undefined && junit.outcome === "failed") {
    return `${junit.type ?? "(no type)"}: ${(junit.message ?? "").split("\n")[0]}`;
  }
  return null;
}

/** The `expected=` value of a line. */
export function expectedLabel(line: HarnessLine): string {
  return line.status === "skip" ? `skip:${line.reason ?? ""}` : line.status;
}

/** Whether `outcome` (with `floorFailed`, a pass below an unwaived floor) satisfies `line`. */
export function matches(line: HarnessLine, outcome: Outcome, floorFailed: boolean): boolean {
  switch (line.status) {
    case "pass":
      return outcome === "pass" && !floorFailed;
    case "fail-known":
      return isFailure(outcome) || (outcome === "pass" && floorFailed);
    case "quarantined":
      return true;
    case "skip":
      if (line.reason !== null && line.reason.startsWith("blocked-by:")) {
        return outcome === line.reason;
      }
      return outcome === "skip" || outcome === "missing";
    default:
      return false;
  }
}

function statusWord(outcome: Outcome, floorFailed: boolean): string {
  if (outcome === "pass") {
    return floorFailed ? "FLOOR" : "UNEXPECTED-PASS";
  }
  if (outcome === "skip") {
    return "SKIPPED";
  }
  if (outcome === "missing") {
    return "MISSING";
  }
  return "FAIL";
}

function count(value: number | null): string {
  return value === null ? "-" : String(value);
}

/** Compares one run variant's results with its Expectations lines (see the header). */
export function compare(input: CompareInput): CompareOutput {
  const { variant, run } = input;
  const results: Result[] = [];
  const differences: Difference[] = [];
  for (const line of input.lines) {
    const outcome = actualOutcome(line.id, run);
    const report = run.reports.get(line.id);
    const upstreamAssertions = input.inventory.get(line.id);
    const below = outcome === "pass" && belowFloor(report, upstreamAssertions);
    const floorFailed = below && !input.waived(line);
    const performed = sum(report?.assertions);
    const upstream = sum(upstreamAssertions);
    results.push({ id: line.id, variant, outcome, belowFloor: floorFailed, performed, upstream });
    if (!matches(line, outcome, floorFailed)) {
      const word = statusWord(outcome, floorFailed);
      differences.push({
        id: line.id,
        variant,
        kind: word === "UNEXPECTED-PASS" ? "unexpected-pass" : "unexpected-failure",
        text: `${word} ${line.id} [${variant}] expected=${expectedLabel(line)} actual=${outcome} asserts=${count(performed)}/${count(upstream)}`,
        detail: detailOf(line.id, run, outcome, floorFailed, report, upstreamAssertions),
      });
    }
  }
  for (const [id, report] of run.reports) {
    if (input.knownIds.has(id)) {
      continue;
    }
    const outcome = actualOutcome(id, run);
    differences.push({ id, variant, kind: "unexpected-failure", text: `UNKNOWN ${id} [${variant}] expected=- actual=${outcome} asserts=${count(sum(report.assertions))}/-`, detail: null });
  }
  return { results, differences };
}
