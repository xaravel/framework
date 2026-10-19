// Skip Reason rule checks over the Expectations File (Story 5.2, FR-3, SM-C1;
// conformance/README.md documents the rules and their precedence).
//
//   bun tools/expectations/reasons.ts [check] [--root <dir>]
//       validates every line's `status`, `reason` and `escalation` under
//       `conformance/expectations/`, plus `conformance/deferred-items` and
//       `conformance/non-goals`. Prints one violation per line on stderr and
//       exits 1, or prints `Skip Reasons OK: <n> line(s) checked.`
//
// Status vocabulary (PRD §3): `pass`, `fail-known`, `skip`, `quarantined`.
// A `skip` needs a Skip Reason; every other status needs `reason: null`.
//
// Skip Reason rules (one violation per broken line, naming
// `<shard>:<line>`, the id, the Variant and the rule):
//
//   not-ported-yet                   always valid.
//   blocked-by:<c>                   `<c>` is a `name` in tools/scaffold/packages.jsonl whose `phase`
//                                    is greater than the `phase` of the line's Inventory `component`.
//   intentional-divergence:DIV-<n>   `<n>` matches `[1-9][0-9]*` and `decisions/DIV-<n>.md` exists.
//   php-only                         `escalation` names an approved Escalation with `trigger: php-only`
//                                    whose `test_ids` lists the id.
//   upstream-skip                    the Inventory `oracle[<variant>]` is `skip` or `fail` (absent fails).
//   deferred:<item>                  `<item>` is a member of `conformance/deferred-items`.
//   out-of-scope:<NG-N>              `<NG-N>` is a member of `conformance/non-goals`.
//   anything else (including null, "" and a bare prefix such as `blocked-by:`) is an `unknown reason`.
//
// `quarantined` needs an `escalation` naming an open Escalation whose
// `test_ids` lists the id. On every line, a non-null `escalation` must name a
// known Escalation (`escalationStatus` throwing is a violation, not a crash).
//
// `conformance/deferred-items` and `conformance/non-goals` use the
// `conformance/variants` format: UTF-8, LF, `#` comment lines and blank lines
// ignored, members sorted by UTF-16 code units and unique. A deferred item
// matches `^[a-z0-9]+(-[a-z0-9]+)*$`; a Non-Goal `^NG-[1-9][0-9]*$`. A bad
// member is a violation naming file:line.
//
// The FR-3 precedence order is documentation for agents and reviewers, not a
// mechanical rule here. Shape and coverage are `expectations:check`'s (Story
// 5.1); `adapted` is a later Story's; line ownership (tools/ownership) and the
// Ratchet (tools/ratchet) are Story 5.6's.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { escalationStatus, ESCALATIONS_DIR, parseEscalation, type EscalationStatus, type Trigger } from "../escalations/escalations";
import { compareUnits, INVENTORY_DIR, type InventoryEntry } from "../inventory/inventory";
import { readExpectations, readWorkingInventory, type Shard } from "../pin-bump/pin-bump";
import { TABLE_PATH } from "../scaffold/scaffold";
import { readTable } from "../scaffold/table";
import { UsageError } from "./expectations";

/** The post-alpha items (PRD §7.2) a `deferred:<item>` may name. */
export const DEFERRED_ITEMS_FILE = "conformance/deferred-items";
/** The Non-Goal IDs (PRD §7.1) an `out-of-scope:<NG-N>` may name. */
export const NON_GOALS_FILE = "conformance/non-goals";
/** The Expectations status vocabulary (PRD §3). */
export const STATUSES = ["pass", "fail-known", "skip", "quarantined"] as const;

const DEFERRED_ITEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NON_GOAL = /^NG-[1-9][0-9]*$/;
const DIV = /^DIV-([1-9][0-9]*)$/;

export interface ListResult {
  members: string[];
  violations: string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses a list file's bytes (the `conformance/variants` format); `violations` is empty when it is valid. */
export function parseList(content: Uint8Array | string, file: string, member: RegExp): ListResult {
  const violations: string[] = [];
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { members: [], violations: [`${file}: invalid UTF-8`] };
  }
  if (text.startsWith("﻿")) {
    violations.push(`${file}: starts with a BOM`);
    text = text.slice(1);
  }
  if (text !== "" && !text.endsWith("\n")) {
    violations.push(`${file}: missing final LF`);
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const members: string[] = [];
  lines.forEach((raw, index) => {
    const at = `${file}:${index + 1}`;
    if (raw.includes("\r")) {
      violations.push(`${at}: CR line ending`);
    }
    const line = raw.replace(/\r$/, "");
    if (line === "" || line.startsWith("#")) {
      return;
    }
    if (!member.test(line)) {
      violations.push(`${at}: not a valid member: ${JSON.stringify(line)}`);
      return;
    }
    const previous = members.at(-1);
    if (previous !== undefined && compareUnits(previous, line) === 0) {
      violations.push(`${at}: duplicate member ${line}`);
      return;
    }
    if (previous !== undefined && compareUnits(previous, line) > 0) {
      violations.push(`${at}: ${line} is not sorted after ${previous}`);
    }
    members.push(line);
  });
  if (members.length === 0) {
    violations.push(`${file}: lists no member`);
  }
  return { members, violations };
}

/** Reads list `file` under `root`. */
export function readList(root: string, file: string, member: RegExp): ListResult {
  const path = join(root, file);
  if (!existsSync(path)) {
    return { members: [], violations: [`${file}: does not exist`] };
  }
  return parseList(readFileSync(path), file, member);
}

/** A known Escalation's status and `test_ids`, or why it is not usable. */
type EscalationInfo = { status: EscalationStatus; trigger: Trigger; testIds: readonly string[] } | { error: string };

/** What `checkLine` needs to know about the repository. */
export interface Context {
  /** Package table `phase` by `name`. */
  phases: ReadonlyMap<string, number>;
  /** Inventory entries by id. */
  inventory: ReadonlyMap<string, Pick<InventoryEntry, "component" | "oracle">>;
  deferredItems: ReadonlySet<string>;
  nonGoals: ReadonlySet<string>;
  /** Whether `decisions/DIV-<n>.md` exists. */
  divExists: (n: string) => boolean;
  /** Looks up an Escalation by id. */
  escalation: (id: string) => EscalationInfo;
}

/** The repository-backed `Context` for `root`; list violations go to `violations`. */
export function contextFor(root: string, violations: string[]): Context {
  const deferred = readList(root, DEFERRED_ITEMS_FILE, DEFERRED_ITEM);
  const nonGoals = readList(root, NON_GOALS_FILE, NON_GOAL);
  violations.push(...deferred.violations, ...nonGoals.violations);
  const phases = new Map<string, number>();
  try {
    for (const row of readTable(join(root, TABLE_PATH))) {
      phases.set(row.name, row.phase);
    }
  } catch (error) {
    violations.push(`${TABLE_PATH}: unreadable: ${message(error)}`);
  }
  const inventory = new Map<string, Pick<InventoryEntry, "component" | "oracle">>();
  try {
    for (const entry of readWorkingInventory(root)) {
      inventory.set(entry.id, entry);
    }
  } catch (error) {
    violations.push(`${INVENTORY_DIR}: unreadable: ${message(error)}`);
  }
  const escalations = new Map<string, EscalationInfo>();
  return {
    phases,
    inventory,
    deferredItems: new Set(deferred.members),
    nonGoals: new Set(nonGoals.members),
    divExists: (n) => existsSync(join(root, "decisions", `DIV-${n}.md`)),
    escalation: (id) => {
      const cached = escalations.get(id);
      if (cached !== undefined) {
        return cached;
      }
      let info: EscalationInfo;
      try {
        const status = escalationStatus(id, root);
        const file = `${ESCALATIONS_DIR}/${id}.md`;
        const parsed = parseEscalation(file, readFileSync(join(root, file), "utf8"));
        info = parsed.escalation === null ? { error: `Escalation ${id} is invalid: ${parsed.violations.join("; ")}` } : { status, trigger: parsed.escalation.trigger, testIds: parsed.escalation.testIds };
      } catch (error) {
        info = { error: message(error) };
      }
      escalations.set(id, info);
      return info;
    },
  };
}

/** Checks the line's escalation names a known Escalation with `wanted` status (and `trigger`, when given) listing `id`; returns the problem, or null. */
function escalationProblem(context: Context, escalation: string | null, id: string, wanted: EscalationStatus, trigger: Trigger | null = null): string | null {
  if (escalation === null) {
    return `needs an escalation naming an ${wanted} Escalation, got null`;
  }
  const info = context.escalation(escalation);
  if ("error" in info) {
    return info.error;
  }
  if (info.status !== wanted) {
    return `Escalation ${escalation} is ${info.status}, not ${wanted}`;
  }
  if (trigger !== null && info.trigger !== trigger) {
    return `Escalation ${escalation} has trigger ${info.trigger}, not ${trigger}`;
  }
  if (!info.testIds.includes(id)) {
    return `Escalation ${escalation}'s test_ids do not list ${id}`;
  }
  return null;
}

/** The Skip Reason rule a `skip` line breaks, as `<rule>: <problem>`, or null when it is valid. */
function reasonProblem(context: Context, reason: string, id: string, variant: string, escalation: string | null): string | null {
  if (reason === "not-ported-yet") {
    return null;
  }
  if (reason === "php-only") {
    const problem = escalationProblem(context, escalation, id, "approved", "php-only");
    return problem === null ? null : `php-only: ${problem}`;
  }
  if (reason === "upstream-skip") {
    const entry = context.inventory.get(id);
    if (entry === undefined) {
      return `upstream-skip: ${id} is not an Inventory Test ID`;
    }
    const outcome = Object.hasOwn(entry.oracle, variant) ? entry.oracle[variant] : undefined;
    if (outcome === undefined) {
      return `upstream-skip: the Inventory has no oracle outcome for Variant ${variant}`;
    }
    return outcome === "skip" || outcome === "fail" ? null : `upstream-skip: the Inventory oracle outcome for Variant ${variant} is ${outcome}, not skip or fail`;
  }
  const colon = reason.indexOf(":");
  const prefix = colon === -1 ? reason : reason.slice(0, colon);
  const value = colon === -1 ? "" : reason.slice(colon + 1);
  if (colon === -1 || value === "") {
    return `unknown reason: ${JSON.stringify(reason)}`;
  }
  if (prefix === "blocked-by") {
    const entry = context.inventory.get(id);
    if (entry === undefined) {
      return `blocked-by: ${id} is not an Inventory Test ID`;
    }
    const blocker = context.phases.get(value);
    if (blocker === undefined) {
      return `blocked-by: ${value} is not a Component in ${TABLE_PATH}`;
    }
    const own = context.phases.get(entry.component);
    if (own === undefined) {
      return `blocked-by: the test's Component ${entry.component} is not in ${TABLE_PATH}`;
    }
    return blocker > own ? null : `blocked-by: ${value} is in Phase ${blocker}, not later than ${entry.component}'s Phase ${own}`;
  }
  if (prefix === "intentional-divergence") {
    const match = DIV.exec(value);
    if (match === null) {
      return `intentional-divergence: ${JSON.stringify(value)} is not DIV-<n> with <n> a positive integer without leading zeros`;
    }
    return context.divExists(match[1]!) ? null : `intentional-divergence: decisions/${value}.md does not exist`;
  }
  if (prefix === "deferred") {
    return context.deferredItems.has(value) ? null : `deferred: ${value} is not in ${DEFERRED_ITEMS_FILE}`;
  }
  if (prefix === "out-of-scope") {
    return context.nonGoals.has(value) ? null : `out-of-scope: ${value} is not in ${NON_GOALS_FILE}`;
  }
  return `unknown reason: ${JSON.stringify(reason)}`;
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** The violation `line` (at `at`, e.g. `<shard>:<line>`) has, or null when its status, reason and escalation are valid. */
export function checkLine(context: Context, line: Record<string, unknown>, at: string): string | null {
  const id = String(line["id"]);
  const variant = typeof line["variant"] === "string" ? line["variant"] : JSON.stringify(line["variant"] ?? null);
  const fail = (problem: string): string => `${at}: ${id} × ${variant}: ${problem}`;
  const { status, reason, escalation } = line;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    return fail(`unknown status: ${JSON.stringify(status ?? null)}; expected one of ${STATUSES.join(", ")}`);
  }
  if (!isNullableString(reason)) {
    return fail(`unknown reason: ${JSON.stringify(reason)}`);
  }
  if (!isNullableString(escalation)) {
    return fail(`escalation: must be a string or null, got ${JSON.stringify(escalation)}`);
  }
  if (escalation !== null) {
    const info = context.escalation(escalation);
    if ("error" in info) {
      return fail(`escalation: ${info.error}`);
    }
  }
  if (status === "skip") {
    if (reason === null) {
      return fail("unknown reason: a skip needs a Skip Reason, got null");
    }
    const problem = reasonProblem(context, reason, id, variant, escalation);
    return problem === null ? null : fail(problem);
  }
  if (reason !== null) {
    return fail(`unknown reason: status ${status} needs reason null, got ${JSON.stringify(reason)}`);
  }
  if (status === "quarantined") {
    const problem = escalationProblem(context, escalation, id, "open");
    return problem === null ? null : fail(`quarantined: ${problem}`);
  }
  return null;
}

export interface ReasonsReport {
  violations: string[];
  lines: number;
}

/** Checks the lists and every Expectations line under `root`. */
export function checkReasons(root: string): ReasonsReport {
  const violations: string[] = [];
  const context = contextFor(root, violations);
  let shards: Shard[];
  try {
    shards = readExpectations(root);
  } catch (error) {
    violations.push(`${message(error)} (run expectations:check)`);
    return { violations, lines: 0 };
  }
  let lines = 0;
  for (const shard of shards) {
    shard.lines.forEach((line, index) => {
      lines++;
      const violation = checkLine(context, line, `${shard.path}:${index + 1}`);
      if (violation !== null) {
        violations.push(violation);
      }
    });
  }
  return { violations, lines };
}

const USAGE = "Usage: bun tools/expectations/reasons.ts [check] [--root <dir>]";

function parseArgs(argv: readonly string[]): string {
  const rest = argv[0] === "check" ? argv.slice(1) : argv;
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
    const report = checkReasons(parseArgs(argv));
    if (report.violations.length > 0) {
      process.stderr.write(report.violations.map((violation) => `${violation}\n`).join(""));
      return 1;
    }
    process.stdout.write(`Skip Reasons OK: ${report.lines} line(s) checked.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Skip Reasons check failed: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
