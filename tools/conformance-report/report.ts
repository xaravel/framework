// The conformance aggregator (Story 7.1; FR-5, SM-1).
//
//   bun --no-env-file tools/conformance-report/report.ts [--root <dir>] [--out <file>]
//       (`bun run conformance:report`) reads the Inventory, the Expectations
//       File, the package table (tools/scaffold/packages.jsonl) and the
//       Baseline Pin, and writes `report.json` (default
//       `<root>/.cache/conformance/report.json`, gitignored). It prints
//       `conformance:report: wrote <path> (<p>/<n> pairs passing; alpha <a>/<b>)`.
//
// This is the only place the SM-1 alpha-gate figure is computed, and the
// reference computation of the Conformance Rate buckets. Boost
// `conformance.rate` (Story 7.3, tools/boost-framework/src/tools.ts) does not
// read `report.json`: it mirrors the bucket code, and XT-boost-1 holds its
// buckets byte-equal to `computeReport`'s; it never computes the alpha gate.
// The dashboard (Story 7.2, site.ts) reads `report.json` and the history
// records, and derives two figures of its own: the history chart's ratios
// (overall passing / pairs and alpha passing / applicable of each record) and
// an Epic's fail-known (the sum of its Components' `failKnown`).
// docs/ops/conformance-report.md documents the schema and every definition:
//
// - A pair is one Expectations line (`id` × `variant`); its Component is the
//   Inventory entry's `component`. `rate = passing / pairs` over every pair
//   (`not-ported-yet` included), `null` when there is no pair; only `pass`
//   passes. Each bucket (overall and per Component) counts every status, every
//   Skip Reason kind (the text before the first `:`) and every full reason,
//   plus `adapted` (a non-null `adapted`) and `failKnown`, which is never a
//   skip.
// - The alpha gate takes the lines on an ALPHA_VARIANTS variant of a
//   Component whose package-table phase is 1–8. A line is applicable unless it
//   is a `skip` whose kind is `php-only`, `upstream-skip`, `deferred` or
//   `out-of-scope`. A Test ID is applicable when it has an applicable alpha
//   line, and passes when every applicable alpha line is `pass`.
//   `noAlphaLine` counts the Test IDs of those Components that have
//   Expectations lines but none on an ALPHA_VARIANTS variant (MySQL-,
//   MariaDB-, SQL Server- or Beanstalkd-only): they are outside the alpha
//   denominator, and the field makes that exclusion visible. It changes no
//   other alpha field.
//
// Exit codes: 0 ok, 1 data error (an unknown Test ID, status or reason kind, a
// duplicate pair, an unreadable input), 2 usage error.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ALPHA_VARIANTS, compareUnits } from "../inventory/inventory";
import { readExpectations, readWorkingInventory } from "../pin-bump/pin-bump";
import { STATUSES } from "../expectations/reasons";
import { TABLE_PATH } from "../scaffold/scaffold";
import { readTable } from "../scaffold/table";
import { readPin } from "../upstream/upstream";

/** The Skip Reason kinds (PRD §3), in vocabulary order. */
export const REASON_KINDS = ["not-ported-yet", "blocked-by", "intentional-divergence", "php-only", "upstream-skip", "deferred", "out-of-scope"] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export type Status = (typeof STATUSES)[number];

/** The reason kinds that make an alpha line not applicable (SM-1). */
export const NOT_APPLICABLE_KINDS: readonly ReasonKind[] = ["php-only", "upstream-skip", "deferred", "out-of-scope"];
/** The SM-1 alpha-gate target. */
export const ALPHA_TARGET = 0.9;
/** The package-table phases the alpha gate covers. */
export const ALPHA_PHASES = { min: 1, max: 8 } as const;
export const DEFAULT_OUT = ".cache/conformance/report.json";

export interface Bucket {
  pairs: number;
  passing: number;
  rate: number | null;
  statuses: Record<Status, number>;
  failKnown: number;
  reasons: Record<ReasonKind, number>;
  /** Keyed by the full reason string, sorted. */
  reasonsDetail: Record<string, number>;
  adapted: number;
}

export interface AlphaGate {
  applicable: number;
  passing: number;
  rate: number | null;
  target: number;
  variants: string[];
  components: string[];
  perVariant: Record<string, { applicable: number; passing: number }>;
  remaining: { "not-ported-yet": number; "blocked-by": number };
  /** Test IDs of a phase 1–8 Component with Expectations lines but none on an alpha variant; outside the denominator. */
  noAlphaLine: number;
  met: boolean;
}

export interface Report {
  schema: 1;
  commit: string | null;
  pin: { tag: string; commit: string };
  overall: Bucket;
  components: Record<string, Bucket>;
  alpha: AlphaGate;
}

/** A data error: the CLI exits 1. */
export class DataError extends Error {}

function rate(passing: number, total: number): number | null {
  return total === 0 ? null : passing / total;
}

function emptyBucket(): Bucket {
  return {
    pairs: 0,
    passing: 0,
    rate: null,
    statuses: Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>,
    failKnown: 0,
    reasons: Object.fromEntries(REASON_KINDS.map((kind) => [kind, 0])) as Record<ReasonKind, number>,
    reasonsDetail: {},
    adapted: 0,
  };
}

interface Line {
  shard: string;
  id: string;
  variant: string;
  status: Status;
  /** The Skip Reason of a `skip`; null otherwise. */
  reason: string | null;
  kind: ReasonKind | null;
  adapted: boolean;
}

function add(bucket: Bucket, line: Line): void {
  bucket.pairs++;
  bucket.statuses[line.status]++;
  if (line.status === "pass") {
    bucket.passing++;
  }
  if (line.status === "fail-known") {
    bucket.failKnown++;
  }
  if (line.reason !== null && line.kind !== null) {
    bucket.reasons[line.kind]++;
    bucket.reasonsDetail[line.reason] = (bucket.reasonsDetail[line.reason] ?? 0) + 1;
  }
  if (line.adapted) {
    bucket.adapted++;
  }
}

/** The bucket with its rate filled in and its keys in the fixed order. */
function finish(bucket: Bucket): Bucket {
  const detail: Record<string, number> = {};
  for (const key of Object.keys(bucket.reasonsDetail).sort(compareUnits)) {
    detail[key] = bucket.reasonsDetail[key]!;
  }
  return {
    pairs: bucket.pairs,
    passing: bucket.passing,
    rate: rate(bucket.passing, bucket.pairs),
    statuses: bucket.statuses,
    failKnown: bucket.failKnown,
    reasons: bucket.reasons,
    reasonsDetail: detail,
    adapted: bucket.adapted,
  };
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function kindOf(reason: string): ReasonKind | null {
  const colon = reason.indexOf(":");
  const kind = colon === -1 ? reason : reason.slice(0, colon);
  return (REASON_KINDS as readonly string[]).includes(kind) ? (kind as ReasonKind) : null;
}

/** The full SHA of HEAD at `root`, or null outside git. */
function headCommit(root: string): string | null {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const sha = proc.stdout.toString().trim();
    return proc.exitCode === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Computes the report for the repository at `root`; throws DataError on bad data. */
export function computeReport(root: string): Report {
  let componentOf: Map<string, string>;
  let phases: Map<string, number>;
  let pinTag: string;
  let pinCommit: string;
  let shards: ReturnType<typeof readExpectations>;
  try {
    componentOf = new Map(readWorkingInventory(root).map((entry) => [entry.id, entry.component]));
    phases = new Map(readTable(join(root, TABLE_PATH)).map((row) => [row.name, row.phase]));
    const pin = readPin(root).find((entry) => entry.repo === "laravel/framework");
    if (pin === undefined) {
      throw new DataError("conformance/baseline-pin has no laravel/framework line");
    }
    pinTag = pin.tag;
    pinCommit = pin.commit;
    shards = readExpectations(root);
  } catch (error) {
    throw new DataError(message(error));
  }

  const lines: Line[] = [];
  const seen = new Set<string>();
  for (const shard of shards) {
    for (const raw of shard.lines) {
      const id = raw["id"] as string;
      const bad = (problem: string): DataError => new DataError(`${shard.path}: ${problem}`);
      if (!componentOf.has(id)) {
        throw bad(`unknown Test ID ${id}`);
      }
      const variant = raw["variant"];
      if (typeof variant !== "string" || variant === "") {
        throw bad(`${id} has no variant`);
      }
      const key = `${id}\0${variant}`;
      if (seen.has(key)) {
        throw bad(`duplicate pair ${id} × ${variant}`);
      }
      seen.add(key);
      const status = raw["status"];
      if (!isStatus(status)) {
        throw bad(`${id} × ${variant} has unknown status ${JSON.stringify(status ?? null)}`);
      }
      let reason: string | null = null;
      let kind: ReasonKind | null = null;
      if (status === "skip") {
        const value = raw["reason"];
        kind = typeof value === "string" ? kindOf(value) : null;
        if (typeof value !== "string" || kind === null) {
          throw bad(`${id} × ${variant} has unknown Skip Reason ${JSON.stringify(value ?? null)}`);
        }
        reason = value;
      }
      lines.push({ shard: shard.path, id, variant, status, reason, kind, adapted: raw["adapted"] !== null && raw["adapted"] !== undefined });
    }
  }

  // The Conformance Rate buckets.
  const overall = emptyBucket();
  const byComponent = new Map<string, Bucket>();
  for (const line of lines) {
    const component = componentOf.get(line.id)!;
    let bucket = byComponent.get(component);
    if (bucket === undefined) {
      bucket = emptyBucket();
      byComponent.set(component, bucket);
    }
    add(overall, line);
    add(bucket, line);
  }
  const components: Record<string, Bucket> = {};
  for (const component of [...byComponent.keys()].sort(compareUnits)) {
    components[component] = finish(byComponent.get(component)!);
  }

  // The SM-1 alpha gate.
  const alphaComponents = [...phases.entries()]
    .filter(([, phase]) => phase >= ALPHA_PHASES.min && phase <= ALPHA_PHASES.max)
    .map(([name]) => name)
    .sort(compareUnits);
  const inComponents = new Set(alphaComponents);
  const variants = [...ALPHA_VARIANTS].sort(compareUnits);
  const inVariants = new Set(variants);
  /** Test ID to whether every applicable alpha line passes. */
  const ids = new Map<string, boolean>();
  const perVariantIds = new Map<string, Map<string, boolean>>(variants.map((variant) => [variant, new Map()]));
  const remaining = { "not-ported-yet": 0, "blocked-by": 0 };
  /** Test ID of an in-scope Component to whether it has a line on an alpha variant. */
  const hasAlphaLine = new Map<string, boolean>();
  for (const line of lines) {
    if (!inComponents.has(componentOf.get(line.id)!)) {
      continue;
    }
    const onAlpha = inVariants.has(line.variant);
    hasAlphaLine.set(line.id, (hasAlphaLine.get(line.id) ?? false) || onAlpha);
    if (!onAlpha) {
      continue;
    }
    if (line.kind === "not-ported-yet" || line.kind === "blocked-by") {
      remaining[line.kind]++;
    }
    if (line.kind !== null && NOT_APPLICABLE_KINDS.includes(line.kind)) {
      continue;
    }
    const passes = line.status === "pass";
    ids.set(line.id, (ids.get(line.id) ?? true) && passes);
    const forVariant = perVariantIds.get(line.variant)!;
    forVariant.set(line.id, (forVariant.get(line.id) ?? true) && passes);
  }
  const count = (map: ReadonlyMap<string, boolean>): { applicable: number; passing: number } => ({ applicable: map.size, passing: [...map.values()].filter(Boolean).length });
  const totals = count(ids);
  const perVariant: Record<string, { applicable: number; passing: number }> = {};
  for (const variant of variants) {
    perVariant[variant] = count(perVariantIds.get(variant)!);
  }
  const alphaRate = rate(totals.passing, totals.applicable);
  const alpha: AlphaGate = {
    applicable: totals.applicable,
    passing: totals.passing,
    rate: alphaRate,
    target: ALPHA_TARGET,
    variants,
    components: alphaComponents,
    perVariant,
    remaining,
    noAlphaLine: [...hasAlphaLine.values()].filter((has) => !has).length,
    met: alphaRate !== null && alphaRate >= ALPHA_TARGET && remaining["not-ported-yet"] === 0 && remaining["blocked-by"] === 0,
  };

  return { schema: 1, commit: headCommit(root), pin: { tag: pinTag, commit: pinCommit }, overall: finish(overall), components, alpha };
}

/** The report as written: two-space JSON with a final LF. */
export function serialiseReport(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/conformance-report/report.ts [--root <dir>] [--out <file>]";

function parseArgs(argv: readonly string[]): { root: string; out: string | null } {
  let root = resolve(import.meta.dir, "..", "..");
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root" && arg !== "--out") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      root = resolve(value);
    } else {
      out = resolve(value);
    }
  }
  return { root, out };
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    const out = args.out ?? join(args.root, DEFAULT_OUT);
    const report = computeReport(args.root);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, serialiseReport(report));
    process.stdout.write(`conformance:report: wrote ${out} (${report.overall.passing}/${report.overall.pairs} pairs passing; alpha ${report.alpha.passing}/${report.alpha.applicable})\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`conformance:report: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
