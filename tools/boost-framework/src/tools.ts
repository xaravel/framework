// The six read-only tools of Boost framework mode (Story 7.3; FR-109, UJ-4).
//
// Each handler is pure over the data files: `(root, args) => value`, where
// `value` is a JSON object. It reads the files again on every call and throws
// ToolError for a tool error (a bad argument combination, a missing manifest,
// a malformed DIV ID). `TOOL_DEFINITIONS` holds each tool's name, description
// and JSON input schema; src/server.ts registers them.
//
// Mirrored rules (the workspace cannot import tools/*; the XT file compares
// each with its source):
// - `conformance.rate`: the Bucket of tools/conformance-report/report.ts
//   (`emptyBucket` / `add` / `finish` / `computeReport`), same fields, key order
//   and numbers.
// - `inventory.get` globs: `globToRegExp` of conformance/harness/select.ts.
// - `escalations.open`: `escalationStatus` / `decisionStatus` /
//   `parseDecision` / `escalationDigest` of tools/escalations/escalations.ts.
// - `story.tests`: the fields `parseManifest` of tools/ownership/ownership.ts
//   reads.
import { createHash } from "node:crypto";
import {
  compareUnits,
  DataError,
  DECISIONS_DIR,
  ESCALATIONS_DIR,
  EXPECTATIONS_DIR,
  markdownFiles,
  parseFrontmatter,
  readData,
  readExpectationShards,
  readInventory,
  readOptional,
  STORIES_DIR,
  UPSTREAM_DIR,
  type Frontmatter,
} from "./data";

/** A tool error: the call returns `isError: true` with this message. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ToolArgs = Record<string, unknown>;

function str(args: ToolArgs, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;

function storyId(value: string | null, field: string): string {
  if (value === null || !STORY_ID.test(value)) {
    throw new ToolError(`${field} must be a Story ID <epic>.<story> such as 7.3, got ${JSON.stringify(value)}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// inventory.get

export const INVENTORY_LIMIT = { min: 1, max: 1000, default: 100 } as const;

const GLOB_SYNTAX = /[\^$\\.*+?()[\]{}|/]/;

/** One `*`-free glob segment as RegExp source: `?` one character, the rest literal. */
function globSegmentSource(segment: string): string {
  let source = "";
  for (const char of segment) {
    if (char === "?") {
      source += "[\\s\\S]";
    } else {
      source += GLOB_SYNTAX.test(char) ? `\\${char}` : char;
    }
  }
  return source;
}

/**
 * A whole-string RegExp for `glob`: `*` any run, `?` one character, the rest literal (the harness's `--id`). It
 * mirrors `globSource` of conformance/harness/select.ts: every segment between two `*`s is an atomic lazy search,
 * `(?=([\s\S]*?<seg>))\<n>`, so a match takes time proportional to |glob| × |candidate|, with no exponential
 * backtracking.
 */
export function globToRegExp(glob: string): RegExp {
  const segments = glob.split("*");
  let source = globSegmentSource(segments[0]!);
  let group = 1;
  for (let index = 1; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    if (segment === "") {
      continue;
    }
    // (?:\n) keeps a following literal digit out of the backreference.
    source += `(?=([\\s\\S]*?${globSegmentSource(segment)}))(?:\\${group})`;
    group++;
  }
  if (segments.length > 1) {
    source += `[\\s\\S]*${globSegmentSource(segments.at(-1)!)}`;
  }
  return new RegExp(`^${source}$`, "u");
}

const SOURCE = /^(.+):(\d+)-(\d+)$/;

/** Parses an Inventory `source` (`<path>:<start>-<end>`) into its `conformance/upstream/` path and line range. */
export function parseSource(source: unknown): { path: string; start: number; end: number } | null {
  if (typeof source !== "string") {
    return null;
  }
  const match = SOURCE.exec(source);
  if (match === null) {
    return null;
  }
  return { path: `${UPSTREAM_DIR}/${match[1]!}`, start: Number(match[2]), end: Number(match[3]) };
}

function field(raw: Record<string, unknown>, key: string): JsonValue {
  const value = raw[key];
  return value === undefined ? null : (value as JsonValue);
}

export function inventoryGet(root: string, args: ToolArgs): JsonObject {
  const id = str(args, "id");
  const glob = str(args, "glob");
  if ((id === null) === (glob === null)) {
    throw new ToolError("inventory.get needs exactly one of id and glob");
  }
  const limit = args["limit"] === undefined ? INVENTORY_LIMIT.default : args["limit"];
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < INVENTORY_LIMIT.min || limit > INVENTORY_LIMIT.max) {
    throw new ToolError(`limit must be an integer from ${INVENTORY_LIMIT.min} to ${INVENTORY_LIMIT.max}`);
  }
  const pattern = glob === null ? null : globToRegExp(glob);
  const matches = readInventory(root)
    .filter(({ raw }) => (pattern === null ? raw["id"] === id : pattern.test(raw["id"] as string)))
    .sort((a, b) => compareUnits(a.raw["id"] as string, b.raw["id"] as string));
  const entries: JsonValue[] = matches.slice(0, limit).map(({ file, raw }) => {
    const source = parseSource(raw["source"]);
    if (source === null) {
      throw new DataError(`${file}: ${raw["id"] as string} has an unparseable source ${JSON.stringify(raw["source"] ?? null)}; expected <path>:<start>-<end>`);
    }
    return {
      id: raw["id"] as string,
      component: field(raw, "component"),
      kind: field(raw, "kind"),
      backends: field(raw, "backends"),
      hash: field(raw, "hash"),
      oracle: field(raw, "oracle"),
      assertions: field(raw, "assertions"),
      source,
    };
  });
  return { entries, total: matches.length, truncated: matches.length > limit };
}

// ---------------------------------------------------------------------------
// expectations.status

export function expectationsStatus(root: string, args: ToolArgs): JsonObject {
  const id = str(args, "id");
  if (id === null) {
    throw new ToolError("expectations.status needs id");
  }
  const variant = str(args, "variant");
  const inInventory = readInventory(root).some(({ raw }) => raw["id"] === id);
  const lines: { variant: JsonValue; status: JsonValue; reason: JsonValue; adapted: JsonValue; escalation: JsonValue; shard: string }[] = [];
  for (const shard of readExpectationShards(root)) {
    for (const line of shard.lines) {
      if (line["id"] !== id || (variant !== null && line["variant"] !== variant)) {
        continue;
      }
      lines.push({
        variant: field(line, "variant"),
        status: field(line, "status"),
        reason: field(line, "reason"),
        adapted: field(line, "adapted"),
        escalation: field(line, "escalation"),
        shard: shard.path,
      });
    }
  }
  const key = (value: JsonValue): string => (typeof value === "string" ? value : JSON.stringify(value));
  lines.sort((a, b) => compareUnits(key(a.variant), key(b.variant)) || compareUnits(a.shard, b.shard));
  return { id, inInventory, lines };
}

// ---------------------------------------------------------------------------
// conformance.rate (mirrors tools/conformance-report/report.ts)

export const STATUSES = ["pass", "fail-known", "skip", "quarantined"] as const;
export const REASON_KINDS = ["not-ported-yet", "blocked-by", "intentional-divergence", "php-only", "upstream-skip", "deferred", "out-of-scope"] as const;
type Status = (typeof STATUSES)[number];
type ReasonKind = (typeof REASON_KINDS)[number];

/** 7.1's Bucket: the same fields in the same order. */
export interface Bucket {
  pairs: number;
  passing: number;
  rate: number | null;
  statuses: Record<Status, number>;
  failKnown: number;
  reasons: Record<ReasonKind, number>;
  reasonsDetail: Record<string, number>;
  adapted: number;
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

interface RateLine {
  status: Status;
  reason: string | null;
  kind: ReasonKind | null;
  adapted: boolean;
}

function add(bucket: Bucket, line: RateLine): void {
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

function finish(bucket: Bucket): Bucket {
  const detail: Record<string, number> = {};
  for (const key of Object.keys(bucket.reasonsDetail).sort(compareUnits)) {
    detail[key] = bucket.reasonsDetail[key]!;
  }
  return {
    pairs: bucket.pairs,
    passing: bucket.passing,
    rate: bucket.pairs === 0 ? null : bucket.passing / bucket.pairs,
    statuses: bucket.statuses,
    failKnown: bucket.failKnown,
    reasons: bucket.reasons,
    reasonsDetail: detail,
    adapted: bucket.adapted,
  };
}

function kindOf(reason: string): ReasonKind | null {
  const colon = reason.indexOf(":");
  const kind = colon === -1 ? reason : reason.slice(0, colon);
  return (REASON_KINDS as readonly string[]).includes(kind) ? (kind as ReasonKind) : null;
}

/** The overall and per-Component Buckets, as `computeReport(root).overall` / `.components`. Throws DataError on bad data. */
export function computeBuckets(root: string): { overall: Bucket; components: Record<string, Bucket> } {
  const componentOf = new Map<string, string>();
  for (const { raw } of readInventory(root)) {
    componentOf.set(raw["id"] as string, raw["component"] as string);
  }
  const overall = emptyBucket();
  const byComponent = new Map<string, Bucket>();
  const seen = new Set<string>();
  for (const shard of readExpectationShards(root)) {
    for (const raw of shard.lines) {
      const id = raw["id"] as string;
      const bad = (problem: string): DataError => new DataError(`${shard.path}: ${problem}`);
      const component = componentOf.get(id);
      if (component === undefined) {
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
      if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
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
      const line: RateLine = { status: status as Status, reason, kind, adapted: raw["adapted"] !== null && raw["adapted"] !== undefined };
      let bucket = byComponent.get(component);
      if (bucket === undefined) {
        bucket = emptyBucket();
        byComponent.set(component, bucket);
      }
      add(overall, line);
      add(bucket, line);
    }
  }
  const components: Record<string, Bucket> = {};
  for (const component of [...byComponent.keys()].sort(compareUnits)) {
    components[component] = finish(byComponent.get(component)!);
  }
  return { overall: finish(overall), components };
}

export function conformanceRate(root: string, args: ToolArgs): JsonObject {
  const component = str(args, "component");
  const { overall, components } = computeBuckets(root);
  const names = Object.keys(components);
  const bucket = component === null ? overall : Object.hasOwn(components, component) ? components[component]! : null;
  return { scope: component ?? "overall", bucket: bucket as unknown as JsonValue, components: names };
}

// ---------------------------------------------------------------------------
// story.tests

function stringList(fields: Record<string, unknown>, key: string, bad: (problem: string) => ToolError): string[] {
  const value = fields[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "" || item.trim() !== item)) {
    throw bad(`${key} must be a list of non-empty strings`);
  }
  return value as string[];
}

export function storyTests(root: string, args: ToolArgs): JsonObject {
  const story = storyId(str(args, "story"), "story");
  const path = `${STORIES_DIR}/${story}.md`;
  const bad = (problem: string): ToolError => new ToolError(`invalid manifest: ${path}: ${problem}`);
  const text = readOptional(root, path);
  if (text === null) {
    throw new ToolError(`no Story manifest: ${path} does not exist`);
  }
  const parsed = parseFrontmatter(text);
  if (parsed === null) {
    throw bad("frontmatter is missing; expected a ---fenced YAML block at the top");
  }
  if (typeof parsed === "string") {
    throw bad(parsed);
  }
  const { fields } = parsed;
  if (fields["story_id"] !== story) {
    throw bad(`story_id must equal ${JSON.stringify(story)}, got ${JSON.stringify(fields["story_id"] ?? null)}`);
  }
  const epic = fields["epic"];
  if (typeof epic !== "number" || !Number.isInteger(epic) || epic !== Number(story.split(".")[0])) {
    throw bad(`epic must be the integer ${story.split(".")[0]!}, got ${JSON.stringify(epic ?? null)}`);
  }
  const component = fields["component"];
  if (typeof component !== "string" || !/^[a-z][a-z0-9-]*$/.test(component)) {
    throw bad(`component must be a kebab-case string, got ${JSON.stringify(component ?? null)}`);
  }
  const status = fields["status"];
  if (typeof status !== "string") {
    throw bad(`status must be a string, got ${JSON.stringify(status ?? null)}`);
  }
  const title = fields["title"];
  return {
    story,
    epic,
    component,
    title: typeof title === "string" ? title : null,
    status,
    testIds: stringList(fields, "test_ids", bad),
    xaravelTestIds: stringList(fields, "xaravel_test_ids", bad),
  };
}

// ---------------------------------------------------------------------------
// divergence.get

const DIV_ID = /^DIV-([1-9]\d*)(?:\.([1-9]\d*))?$/;
/** A clause start: an optional list marker, heading `#`s or `**`, then `DIV-<n>.<k>` as the first token. */
const CLAUSE_START = /^\s*(?:(?:[-*]|\d+\.)\s+)?(?:#{1,6}\s+)?(?:\*\*)?DIV-([1-9]\d*)\.([1-9]\d*)(?![\w-]|\.\d)/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;

/** The clauses of DIV-`n` in `body`: each runs from its start line to the next clause start or heading. */
export function divergenceClauses(n: string, body: string): { id: string; text: string }[] {
  const clauses: { id: string; lines: string[] }[] = [];
  let current: { id: string; lines: string[] } | null = null;
  for (const line of body.split("\n")) {
    const start = CLAUSE_START.exec(line);
    if (start !== null && start[1] === n) {
      current = { id: `DIV-${n}.${start[2]!}`, lines: [line] };
      clauses.push(current);
      continue;
    }
    if (start !== null || HEADING.test(line)) {
      current = null;
      continue;
    }
    current?.lines.push(line);
  }
  return clauses.map((clause) => {
    const lines = [...clause.lines];
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
      lines.pop();
    }
    return { id: clause.id, text: lines.join("\n") };
  });
}

const FEWER_ITEM = /^[1-9]\d*$/;

/**
 * The `fewer_assertions` floor waiver (ESC-5.3-2) of DIV-`n`, read from its frontmatter `fields` and `body`. `clauses`
 * holds the valid items: each a quoted string `<k>` naming a clause DIV-`n`.`<k>` that `divergenceClauses` finds in
 * `body`. `problems` names every other item, and a value that is not a list; an absent key is no waiver and no
 * problem. tools/divergence/divergence.ts reports `problems` and conformance/harness/harness.ts waives only `clauses`,
 * so the check and the harness read one rule.
 */
export function fewerAssertions(n: string, fields: Record<string, unknown>, body: string): { clauses: Set<string>; problems: string[] } {
  const clauses = new Set<string>();
  const problems: string[] = [];
  const waiver = fields["fewer_assertions"];
  if (waiver === undefined) {
    return { clauses, problems };
  }
  if (!Array.isArray(waiver)) {
    problems.push(`fewer_assertions must be a list, got ${JSON.stringify(waiver)}`);
    return { clauses, problems };
  }
  const existing = new Set(divergenceClauses(n, body).map((clause) => clause.id.slice(`DIV-${n}.`.length)));
  for (const item of waiver as unknown[]) {
    if (typeof item !== "string") {
      problems.push(`fewer_assertions item ${JSON.stringify(item)} must be a quoted string, e.g. ["2"]`);
    } else if (!FEWER_ITEM.test(item) || !existing.has(item)) {
      problems.push(`fewer_assertions item ${JSON.stringify(item)} names no clause DIV-${n}.<k>`);
    } else {
      clauses.add(item);
    }
  }
  return { clauses, problems };
}

export function divergenceGet(root: string, args: ToolArgs): JsonObject {
  const id = str(args, "id");
  const match = id === null ? null : DIV_ID.exec(id);
  if (id === null || match === null) {
    throw new ToolError(`id must be DIV-<n> or DIV-<n>.<k>, got ${JSON.stringify(id)}`);
  }
  const n = match[1]!;
  const clause = match[2] === undefined ? null : id;
  const path = `${DECISIONS_DIR}/DIV-${n}.md`;
  const text = readOptional(root, path);
  if (text === null) {
    const missing: JsonObject = {
      id,
      path,
      exists: false,
      frontmatter: null,
      clauses: [],
      note: `No Divergence Record: ${path} does not exist yet. Story 8.1 writes the Divergence Records.`,
    };
    if (clause === null) {
      missing["text"] = null;
    }
    return missing;
  }
  const parsed = parseFrontmatter(text);
  if (typeof parsed === "string") {
    throw new ToolError(`invalid Divergence Record: ${path}: ${parsed}`);
  }
  const body = parsed === null ? text.replace(/\r\n/g, "\n") : parsed.body;
  const all = divergenceClauses(n, body);
  const clauses = clause === null ? all : all.filter((item) => item.id === clause);
  const value: JsonObject = {
    id,
    path,
    exists: clause === null || clauses.length > 0,
    frontmatter: parsed === null ? null : (parsed.fields as JsonValue),
    clauses,
  };
  if (clause === null) {
    value["text"] = text;
  } else if (clauses.length === 0) {
    value["note"] = `No clause ${clause}: ${path} exists but has no clause ${clause}.`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// escalations.open (mirrors escalationStatus in tools/escalations/escalations.ts)

const ESCALATION_ID = /^ESC-(?:([1-9]\d*\.[1-9]\d*)|bot)-([1-9]\d*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
const DECISIONS = ["approved", "rejected"] as const;
const TRIGGERS = ["divergence", "protected-path", "upstream-test-wrong", "flaky", "php-only", "open-question", "contract"] as const;

/** The SHA-256 a decision's `escalation_sha256` must equal: the Escalation text with CRLF normalised to LF. */
export function escalationDigest(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** `approved` / `rejected` when the decision validates and binds `escalationText`, else `open`. */
export function decisionStatus(id: string, escalationText: string, decisionText: string | null): "open" | "approved" | "rejected" {
  if (decisionText === null) {
    return "open";
  }
  const parsed = parseFrontmatter(decisionText);
  if (parsed === null || typeof parsed === "string") {
    return "open";
  }
  const decision = parsed.fields["decision"];
  const digest = parsed.fields["escalation_sha256"];
  const rationale = parsed.body.split("\n").some((line) => line.trim() !== "" && !HEADING.test(line));
  if (ESCALATION_ID.exec(id) === null || typeof decision !== "string" || !(DECISIONS as readonly string[]).includes(decision) || typeof digest !== "string" || !DIGEST.test(digest) || !rationale) {
    return "open";
  }
  return digest === escalationDigest(escalationText) ? (decision as "approved" | "rejected") : "open";
}

function escalationFields(parsed: Frontmatter | string | null): { trigger: string | null; testIds: string[]; proposed: string | null } {
  if (parsed === null || typeof parsed === "string") {
    return { trigger: null, testIds: [], proposed: null };
  }
  const { fields } = parsed;
  const testIds = fields["test_ids"];
  const testIdsOk = Array.isArray(testIds) && testIds.length > 0 && testIds.every((item) => typeof item === "string" && item.trim() !== "" && item.trim() === item);
  const trigger = fields["trigger"];
  const triggerOk = typeof trigger === "string" && (TRIGGERS as readonly string[]).includes(trigger);
  const valid = (field: string): boolean => typeof fields[field] === "string" && (fields[field] as string).trim() !== "";
  const proposed = valid("proposed") ? (fields["proposed"] as string) : null;
  const parseable = testIdsOk && triggerOk && proposed !== null && valid("evidence");
  return { trigger: parseable ? (trigger as string) : null, testIds: testIdsOk ? (testIds as string[]) : [], proposed };
}

export function escalationsOpen(root: string, args: ToolArgs): JsonObject {
  const story = args["story"] === undefined ? null : storyId(str(args, "story"), "story");
  const escalations: JsonValue[] = [];
  for (const name of markdownFiles(root, ESCALATIONS_DIR)) {
    if (!name.startsWith("ESC-")) {
      continue;
    }
    const id = name.slice(0, -".md".length);
    const parsedId = ESCALATION_ID.exec(id);
    if (story !== null && (parsedId === null || parsedId[1] !== story)) {
      continue;
    }
    const path = `${ESCALATIONS_DIR}/${name}`;
    const text = readData(root, path);
    const decided = parsedId !== null && decisionStatus(id, text, readOptional(root, `${DECISIONS_DIR}/${id}.md`)) !== "open";
    if (decided) {
      continue;
    }
    const fields = parsedId === null ? { trigger: null, testIds: [], proposed: null } : escalationFields(parseFrontmatter(text));
    escalations.push({ id, path, trigger: fields.trigger, testIds: fields.testIds, proposed: fields.proposed });
  }
  escalations.sort((a, b) => compareUnits((a as JsonObject)["id"] as string, (b as JsonObject)["id"] as string));
  return { escalations };
}

// ---------------------------------------------------------------------------
// Definitions

export interface JsonSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (root: string, args: ToolArgs) => JsonObject;
}

const ID_DESCRIPTION = "A Test ID exactly as in the Inventory, e.g. Illuminate\\Tests\\Support\\SupportStrTest::testStringCanBeLimitedByWords; a dataset row is its own id, X#<key>.";

/** The six tools, sorted by name. */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "conformance.rate",
    description:
      "The Conformance Rate bucket (pairs, passing, rate, statuses, failKnown, reasons by kind, reasonsDetail, adapted) overall or for one Component, computed with Story 7.1's definitions from the Inventory and the Expectations File. bucket is null for a Component with no pairs; components lists the Components that have one. The SM-1 alpha-gate figure is not included; run `bun run conformance:report` for it.",
    inputSchema: {
      type: "object",
      properties: { component: { type: "string", description: "A Component name, e.g. support. Omit for the overall bucket." } },
      additionalProperties: false,
    },
    handler: conformanceRate,
  },
  {
    name: "divergence.get",
    description: `A Divergence Record (${DECISIONS_DIR}/DIV-<n>.md): its frontmatter and its numbered clauses (DIV-<n>.<k>), plus the whole text when id has no clause part. exists is false while the record is not written (Story 8.1 writes them), and when id names a clause the record does not have (frontmatter is then the record's, clauses is empty and note names the missing clause).`,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "DIV-<n> or DIV-<n>.<k>, e.g. DIV-3 or DIV-3.2." } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: divergenceGet,
  },
  {
    name: "escalations.open",
    description: `The open Escalations (${ESCALATIONS_DIR}/ESC-*.md without a decision in ${DECISIONS_DIR}/ bound to their current text), with trigger, test IDs and proposed resolution.`,
    inputSchema: {
      type: "object",
      properties: { story: { type: "string", description: "A Story ID such as 7.3: only its ESC-<story>-<n> Escalations." } },
      additionalProperties: false,
    },
    handler: escalationsOpen,
  },
  {
    name: "expectations.status",
    description: `Every Expectations File line (${EXPECTATIONS_DIR}/) of one Test ID, optionally one Variant: variant, status, reason, adapted, escalation and shard path, sorted by variant; inInventory says whether the id is in the Test Inventory.`,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: ID_DESCRIPTION }, variant: { type: "string", description: "A Backend Variant, e.g. none, sqlite, pgsql." } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: expectationsStatus,
  },
  {
    name: "inventory.get",
    description:
      "Test Inventory entries by exact Test ID or by glob (* any run, ? one character, the rest literal, matched against the whole id, as `bun run harness --id`): component, kind, backends, hash, oracle, the Upstream assertion multiset, and the source path in conformance/upstream/ with its line range. Exactly one of id and glob.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: ID_DESCRIPTION },
        glob: { type: "string", description: "A Test ID glob, e.g. *SupportStrTest::*." },
        limit: { type: "integer", minimum: INVENTORY_LIMIT.min, maximum: INVENTORY_LIMIT.max, default: INVENTORY_LIMIT.default, description: "The most entries to return (default 100)." },
      },
      additionalProperties: false,
    },
    handler: inventoryGet,
  },
  {
    name: "story.tests",
    description: `A Story manifest (${STORIES_DIR}/<id>.md): its epic, component, title, status, and assigned Test IDs (testIds) and Xaravel Test IDs (xaravelTestIds).`,
    inputSchema: {
      type: "object",
      properties: { story: { type: "string", description: "A Story ID such as 7.3." } },
      required: ["story"],
      additionalProperties: false,
    },
    handler: storyTests,
  },
];
