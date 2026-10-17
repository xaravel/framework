// The Test Inventory: PHPUnit for `laravel/framework` (Story 2.4) and Pest
// for `laravel/ai`, `laravel/mcp` and `laravel/boost` (Story 2.5); FR-1, FR-7.
//
//   bun tools/inventory/inventory.ts generate [--suite <framework|ai|mcp|boost|all>] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       runs tools/inventory/lister.php against each suite's snapshot and
//       writes `conformance/inventory/<component>.jsonl`, one entry per test
//       case that the suite's own runner lists. By default the lister runs in
//       the Oracle image (`xaravel-oracle:<oracle tag>`, or `--image <ref>`),
//       through tools/oracle's `runInImage` (`run --rm --network none`, the
//       lister mounted read-only), for every suite (`--suite all`). With
//       `--local <dir>` it runs against a locked install of one suite's
//       snapshot in <dir> (default `framework`), with the local PHP (or
//       `--php <bin>`); every test and source file there must equal the
//       snapshot's copy.
//
// The framework writes one file per framework Component. A Pest suite writes
// only `<suite>.jsonl`, and every entry's Component must be the suite. Pest
// Test IDs are `<suite>/<test file>::<describe> > … > <test name>#<dataset>`.
//
// An entry is one JSON line, keys in this order:
//
//   {"id","component","kind","backends","source","hash"}
//
// Lines are sorted by `id` (UTF-16 code units); the files are UTF-8 with LF
// line endings and a trailing newline. A framework Component's file that is
// no longer generated is deleted; generating the framework never touches the
// ai, mcp and boost files, and generating a Pest suite touches only its own.
// These are tool data, not framework values, so they are written with
// JSON.stringify (AD-23 covers framework values).
//
// The tool reads Upstream source only from the snapshot and never fetches.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { componentForTest, readMap, type ComponentMap } from "../component-map/component-map";
import { imageTag, IMAGE_NAME, IMAGE_UPSTREAM_DIR, PHP_VERSION, runInImage, type ReadOnlyMount } from "../oracle/oracle";
import { UPSTREAM_DIR, upstreamPath } from "../upstream/upstream";

export const INVENTORY_DIR = "conformance/inventory";
/** The lister, relative to the repository root. */
export const LISTER = "tools/inventory/lister.php";
/** Inventory files the framework generation never writes or deletes (the Pest suites' files). */
export const FOREIGN_COMPONENTS: readonly string[] = ["ai", "boost", "mcp"];
/** The Pest suites, in generation order; each is its own Component. */
export const PEST_SUITES = ["ai", "mcp", "boost"] as const;
export type PestSuite = (typeof PEST_SUITES)[number];
export type Suite = "framework" | PestSuite;
/** Every suite, in `--suite all` order. */
export const SUITES: readonly Suite[] = ["framework", ...PEST_SUITES];
/** Where image mode mounts the lister. */
const IMAGE_LISTER = "/xaravel/lister.php";

/** Engine directories under `framework/tests/Integration/Database/`, by driver. */
export const DATABASE_DIRECTORIES: Readonly<Record<string, string>> = {
  MySql: "mysql",
  MariaDb: "mariadb",
  Postgres: "pgsql",
  SqlServer: "sqlsrv",
  Sqlite: "sqlite",
};
/** The `QUEUE_CONNECTION` variants Upstream's queues and redis workflows run `tests/Integration/Queue/` under. */
export const QUEUE_BACKENDS: readonly string[] = ["queue-beanstalkd@beanstalkd", "queue-database@sqlite", "queue-redis@redis", "queue-sync@none"];

export type Kind = "unit" | "integration";

/** One raw line from the lister. Paths are relative to the framework directory. */
export interface RawTest {
  id: string;
  class: string;
  method: string;
  dataset: string | null;
  file: string;
  source: { file: string; start: number; end: number };
  /** Tokens prefixed by kind: `c` code, `w` whitespace, `#` comment. */
  tokens: string[];
  data: string | null;
  requiresDatabase: string[] | null;
  redis: boolean;
}

/** One raw line from the lister's Pest mode. Paths are relative to the suite directory. */
export interface PestRawTest extends RawTest {
  /** The `describe()` descriptions, outermost first. */
  describe: string[];
  /** Pest's description without its describe prefix (`it(…)` keeps its `it `). */
  name: string;
}

export interface InventoryEntry {
  id: string;
  component: string;
  kind: Kind;
  backends: string[];
  source: string;
  hash: string;
}

export { PHP_VERSION };

/** How image mode runs the lister: tools/oracle's `runInImage`, or a test stand-in. */
export type ImageRunner = (image: string, mounts: readonly ReadOnlyMount[], command: readonly string[]) => string;

export interface GenerateOptions {
  /** The suite to generate, or `all`; default `framework`. `all` cannot be combined with `local`. */
  suite?: Suite | "all";
  /** The image to run the lister in; default `xaravel-oracle:<oracle tag>`. */
  image?: string;
  /** A locked install of the suite's snapshot to run the lister against instead. */
  local?: string;
  /** The PHP binary for `local`; default `php`. */
  php?: string;
  /** Runs the lister in the image; default `runInImage`. */
  runner?: ImageRunner;
}

export interface GenerateResult {
  /** Entries per Component, sorted by Component. */
  counts: Record<string, number>;
  total: number;
  written: string[];
  removed: string[];
}

const SNAPSHOT_HINT = "run bun run upstream:sync";
const ENTRY_KEYS = ["id", "component", "kind", "backends", "source", "hash"] as const;
const RAW_KEYS = ["id", "class", "method", "dataset", "file", "source", "tokens", "data", "requiresDatabase", "redis"] as const;
const PEST_RAW_KEYS = ["id", "class", "method", "dataset", "file", "describe", "name", "source", "tokens", "data", "requiresDatabase", "redis"] as const;

function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareUnits);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** A path relative to the framework directory with no absolute part, `..` segment or backslash. */
function isRelativePath(path: string): boolean {
  return path !== "" && !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

// ---------------------------------------------------------------------------
// Raw lines

function rawLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

/** Parses one raw line to an object holding every key in `keys`. */
function rawRecord(line: string, at: string, keys: readonly string[]): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) {
    throw new Error(`${at}: expected a JSON object`);
  }
  for (const key of keys) {
    if (!(key in value)) {
      throw new Error(`${at}: missing field "${key}"`);
    }
  }
  return value;
}

/** Validates the fields framework and Pest raw lines share; the `id` is checked by the caller. */
function rawFields(value: Record<string, unknown>, at: string): RawTest {
  const { id, class: cls, method, dataset, file, source, tokens, data, requiresDatabase, redis } = value;
  const bad = (field: string, expected: string): never => {
    throw new Error(`${at}: field "${field}" must be ${expected}`);
  };
  if (typeof id !== "string" || id === "") bad("id", "a non-empty string");
  if (typeof cls !== "string" || cls === "") bad("class", "a non-empty string");
  if (typeof method !== "string" || method === "") bad("method", "a non-empty string");
  if (dataset !== null && typeof dataset !== "string") bad("dataset", "a string or null");
  if (typeof file !== "string" || !isRelativePath(file)) bad("file", "a relative path");
  if (!isRecord(source) || typeof source["file"] !== "string" || !isRelativePath(source["file"]) || !Number.isInteger(source["start"]) || !Number.isInteger(source["end"])) {
    bad("source", "{file, start, end} with a relative path and integer lines");
  }
  const src = source as { file: string; start: number; end: number };
  if (src.start < 1 || src.end < src.start) bad("source", "a line range with 1 <= start <= end");
  if (!isStringArray(tokens) || tokens.some((token) => !/^[cw#]/.test(token))) bad("tokens", 'an array of "c", "w" or "#" prefixed strings');
  if (data !== null && typeof data !== "string") bad("data", "a string or null");
  if (requiresDatabase !== null && !isStringArray(requiresDatabase)) bad("requiresDatabase", "an array of strings or null");
  if (typeof redis !== "boolean") bad("redis", "a boolean");
  const expectedId = dataset === null ? `${cls as string}::${method as string}` : `${cls as string}::${method as string}#${dataset as string}`;
  if (id !== expectedId) {
    throw new Error(`${at}: id ${JSON.stringify(id)} is not ${JSON.stringify(expectedId)}`);
  }
  return {
    id: id as string,
    class: cls as string,
    method: method as string,
    dataset: dataset as string | null,
    file: file as string,
    source: { file: src.file, start: src.start, end: src.end },
    tokens: tokens as string[],
    data: data as string | null,
    requiresDatabase: requiresDatabase as string[] | null,
    redis: redis as boolean,
  };
}

/** Parses the lister's stdout; throws `raw line <n>: …` on malformed JSON or a missing or mistyped field. */
export function parseRaw(text: string): RawTest[] {
  return rawLines(text).map((line, index) => {
    const at = `raw line ${index + 1}`;
    return rawFields(rawRecord(line, at, RAW_KEYS), at);
  });
}

/** Parses the lister's Pest-mode stdout; throws `raw line <n>: …` on malformed JSON or a missing or mistyped field. */
export function parsePestRaw(text: string): PestRawTest[] {
  return rawLines(text).map((line, index) => {
    const at = `raw line ${index + 1}`;
    const value = rawRecord(line, at, PEST_RAW_KEYS);
    const { describe, name } = value;
    if (!isStringArray(describe) || describe.some((part) => part === "")) {
      throw new Error(`${at}: field "describe" must be an array of non-empty strings`);
    }
    if (typeof name !== "string" || name === "") {
      throw new Error(`${at}: field "name" must be a non-empty string`);
    }
    return { ...rawFields(value, at), describe, name };
  });
}

/** The Pest Test ID: `<suite>/<test file>::<describe> > … > <test name>`, plus `#<dataset>` for a dataset. */
export function pestTestId(suite: PestSuite, raw: Pick<PestRawTest, "file" | "describe" | "name" | "dataset">): string {
  const path = [...raw.describe, raw.name].join(" > ");
  return `${suite}/${raw.file}::${path}${raw.dataset === null ? "" : `#${raw.dataset}`}`;
}

// ---------------------------------------------------------------------------
// Hash, kind and backends

/** The code tokens, in order, without their prefix; whitespace and comment tokens are dropped. */
export function normaliseTokens(tokens: readonly string[]): string[] {
  const code: string[] = [];
  for (const token of tokens) {
    const kind = token[0];
    if (kind === "c") {
      code.push(token.slice(1));
    } else if (kind !== "w" && kind !== "#") {
      throw new Error(`token ${JSON.stringify(token)} has no kind prefix (c, w or #)`);
    }
  }
  return code;
}

/** Lowercase hex SHA-256 over the method's code tokens and the dataset export. */
export function testHash(tokens: readonly string[], data: string | null): string {
  return createHash("sha256").update(JSON.stringify([normaliseTokens(tokens), data])).digest("hex");
}

/** `integration` under `<suite>/tests/Integration/`, otherwise `unit`, for every suite; `file` is relative to the suite directory. */
export function kindFor(file: string): Kind {
  return file.startsWith("tests/Integration/") ? "integration" : "unit";
}

/**
 * The sorted backends of a raw test. When the database sources intersect to nothing, the test keeps the
 * directory's engine, or no database backend at all: Upstream skips it on every engine (decisions/ESC-2.4-1.md).
 */
export function backendsFor(raw: Pick<RawTest, "id" | "file" | "requiresDatabase" | "redis">, suite: Suite = "framework"): string[] {
  if (suite !== "framework") {
    // The framework's engine-directory and queue rules do not apply to the Pest suites.
    const backends = new Set(raw.requiresDatabase ?? []);
    if (raw.redis) {
      backends.add("redis");
    }
    return backends.size === 0 ? ["none"] : sortedUnique(backends);
  }
  const engine = /^tests\/Integration\/Database\/([^/]+)\//.exec(raw.file)?.[1];
  const directory = engine !== undefined && engine in DATABASE_DIRECTORIES ? [DATABASE_DIRECTORIES[engine]!] : null;
  const attribute = raw.requiresDatabase === null ? null : sortedUnique(raw.requiresDatabase);
  let database: string[] = [];
  if (attribute !== null && directory !== null) {
    const both = attribute.filter((driver) => directory.includes(driver));
    database = both.length === 0 ? directory : both;
  } else if (attribute !== null) {
    database = attribute;
  } else if (directory !== null) {
    database = directory;
  }
  const backends = new Set(database);
  if (raw.redis) {
    backends.add("redis");
  }
  if (raw.file.startsWith("tests/Integration/Queue/")) {
    QUEUE_BACKENDS.forEach((backend) => backends.add(backend));
  }
  return backends.size === 0 ? ["none"] : sortedUnique(backends);
}

// ---------------------------------------------------------------------------
// Entries and files

/** One entry per raw test, sorted by id; throws on an unmapped file, a duplicate id, or a source outside `tests/`. */
export function buildEntries(raws: readonly RawTest[], map: ComponentMap): InventoryEntry[] {
  const seen = new Set<string>();
  const entries: InventoryEntry[] = [];
  for (const raw of raws) {
    if (seen.has(raw.id)) {
      throw new Error(`duplicate test id: ${raw.id}`);
    }
    seen.add(raw.id);
    const path = `framework/${raw.file}`;
    const owner = componentForTest(map, path);
    if (owner === null) {
      throw new Error(`unmapped test file: ${path}`);
    }
    if (FOREIGN_COMPONENTS.includes(owner.component)) {
      throw new Error(`${path} maps to ${owner.component}, which is not a framework Component`);
    }
    if (!raw.source.file.startsWith("tests/")) {
      throw new Error(`${raw.id}: source framework/${raw.source.file} is outside framework/tests/`);
    }
    entries.push({
      id: raw.id,
      component: owner.component,
      kind: kindFor(raw.file),
      backends: backendsFor(raw),
      source: `framework/${raw.source.file}:${raw.source.start}-${raw.source.end}`,
      hash: testHash(raw.tokens, raw.data),
    });
  }
  return entries.sort((a, b) => compareUnits(a.id, b.id));
}

/** One entry per raw Pest test, sorted by id; throws on an unmapped file, a file mapped to another Component, a duplicate id, or a source outside `tests/`. */
export function buildPestEntries(suite: PestSuite, raws: readonly PestRawTest[], map: ComponentMap): InventoryEntry[] {
  const seen = new Set<string>();
  const entries: InventoryEntry[] = [];
  for (const raw of raws) {
    const id = pestTestId(suite, raw);
    if (seen.has(id)) {
      throw new Error(`duplicate test id: ${id}`);
    }
    seen.add(id);
    const path = `${suite}/${raw.file}`;
    const owner = componentForTest(map, path);
    if (owner === null) {
      throw new Error(`unmapped test file: ${path}`);
    }
    if (owner.component !== suite) {
      throw new Error(`${path} maps to ${owner.component}, not ${suite}`);
    }
    if (!raw.source.file.startsWith("tests/")) {
      throw new Error(`${id}: source ${suite}/${raw.source.file} is outside ${suite}/tests/`);
    }
    entries.push({
      id,
      component: suite,
      kind: kindFor(raw.file),
      backends: backendsFor(raw, suite),
      source: `${suite}/${raw.source.file}:${raw.source.start}-${raw.source.end}`,
      hash: testHash(raw.tokens, raw.data),
    });
  }
  return entries.sort((a, b) => compareUnits(a.id, b.id));
}

function renderEntry(entry: InventoryEntry): string {
  return JSON.stringify({ id: entry.id, component: entry.component, kind: entry.kind, backends: entry.backends, source: entry.source, hash: entry.hash });
}

/** The file text for each Component, keyed by Component in sorted order. */
export function renderInventory(entries: readonly InventoryEntry[]): Map<string, string> {
  const groups = new Map<string, InventoryEntry[]>();
  for (const entry of [...entries].sort((a, b) => compareUnits(a.id, b.id))) {
    const list = groups.get(entry.component) ?? [];
    list.push(entry);
    groups.set(entry.component, list);
  }
  const files = new Map<string, string>();
  for (const component of [...groups.keys()].sort(compareUnits)) {
    files.set(component, groups.get(component)!.map((entry) => `${renderEntry(entry)}\n`).join(""));
  }
  return files;
}

const SOURCE = /^framework\/tests\/(?:[^/\0]+\/)*[^/\0]+:([1-9][0-9]*)-([1-9][0-9]*)$/;
const SOURCES: Readonly<Record<Suite, RegExp>> = {
  framework: SOURCE,
  ai: /^ai\/tests\/(?:[^/\0]+\/)*[^/\0]+:([1-9][0-9]*)-([1-9][0-9]*)$/,
  mcp: /^mcp\/tests\/(?:[^/\0]+\/)*[^/\0]+:([1-9][0-9]*)-([1-9][0-9]*)$/,
  boost: /^boost\/tests\/(?:[^/\0]+\/)*[^/\0]+:([1-9][0-9]*)-([1-9][0-9]*)$/,
};
const BACKEND = /^(?:none|[a-z]+(?:-[a-z]+)*(?:@[a-z]+)?)$/;

/**
 * Parses and validates an Inventory file of `suite` (default `framework`); throws `<file>:<line>: …` on anything
 * malformed, unsorted or out of key order. A Pest suite's ids must start with `<suite>/tests/` and its
 * Component must be the suite.
 */
export function parseInventory(text: string, file: string, suite: Suite = "framework"): InventoryEntry[] {
  if (text !== "" && !text.endsWith("\n")) {
    throw new Error(`${file}: the file must end with a newline`);
  }
  if (text.includes("\r")) {
    throw new Error(`${file}: the file must use LF line endings`);
  }
  const entries: InventoryEntry[] = [];
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(value) || Object.keys(value).join(",") !== ENTRY_KEYS.join(",")) {
      throw new Error(`${at}: expected the keys ${ENTRY_KEYS.join(", ")} in that order`);
    }
    const { id, component, kind, backends, source, hash } = value;
    if (typeof id !== "string" || !/^[^:\s][^\n]*::[^:#\s][^#\n]*(?:#.*)?$/.test(id) || (suite !== "framework" && !id.startsWith(`${suite}/tests/`))) {
      throw new Error(`${at}: bad id ${JSON.stringify(id)}`);
    }
    if (typeof component !== "string" || !/^[a-z][a-z0-9-]*$/.test(component) || (suite !== "framework" && component !== suite)) {
      throw new Error(`${at}: bad component ${JSON.stringify(component)}`);
    }
    if (kind !== "unit" && kind !== "integration") {
      throw new Error(`${at}: kind must be unit or integration`);
    }
    if (!isStringArray(backends) || backends.length === 0 || backends.some((backend) => !BACKEND.test(backend)) || backends.join("\n") !== sortedUnique(backends).join("\n") || (backends.includes("none") && backends.length > 1)) {
      throw new Error(`${at}: backends must be a sorted, de-duplicated, non-empty array of backend tags`);
    }
    const range = typeof source === "string" ? SOURCES[suite].exec(source) : null;
    if (range === null || Number(range[2]) < Number(range[1]) || (source as string).split(":")[0]!.split("/").includes("..")) {
      throw new Error(`${at}: bad source ${JSON.stringify(source)}`);
    }
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`${at}: hash must be 64 lowercase hex characters`);
    }
    const previous = entries.at(-1);
    if (previous !== undefined && compareUnits(previous.id, id) >= 0) {
      throw new Error(`${at}: ${id} is not sorted after ${previous.id}`);
    }
    entries.push({ id, component, kind, backends, source: source as string, hash });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Generation

/** Every file under `dir`, as `/`-separated paths relative to `base`. */
function walk(base: string, dir: string, out: string[]): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const name of readdirSync(dir).sort(compareUnits)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(base, path, out);
    } else {
      out.push(relative(base, path).split("\\").join("/"));
    }
  }
}

/** Fails naming every test or source file (and phpunit.xml.dist) that differs between the local install and the snapshot. */
function checkLocalCopy(snapshot: string, local: string, suite: Suite): void {
  const files = (base: string): string[] => {
    const out: string[] = [];
    walk(base, join(base, "tests"), out);
    walk(base, join(base, "src"), out);
    if (existsSync(join(base, "phpunit.xml.dist"))) {
      out.push("phpunit.xml.dist");
    }
    return out;
  };
  const ours = files(snapshot);
  const theirs = new Set(files(local));
  const problems: string[] = [];
  for (const file of ours) {
    if (!theirs.has(file)) {
      problems.push(`${join(local, file)} is missing`);
    } else if (!readFileSync(join(snapshot, file)).equals(readFileSync(join(local, file)))) {
      problems.push(`${join(local, file)} differs from ${UPSTREAM_DIR}/${suite}/${file}`);
    }
    theirs.delete(file);
  }
  for (const file of theirs) {
    problems.push(`${join(local, file)} is not in ${UPSTREAM_DIR}/${suite}`);
  }
  if (problems.length > 0) {
    throw new Error(`--local ${local} is not a copy of the snapshot:\n${problems.map((line) => `  ${line}`).join("\n")}`);
  }
}

/** The default image: `xaravel-oracle:<oracle tag>`. */
export function oracleImage(root: string): string {
  return `${IMAGE_NAME}:${imageTag(root)}`;
}

function runLister(command: string[]): string {
  const proc = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  if (proc.exitCode !== 0) {
    throw new Error(`the lister failed (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
  }
  return proc.stdout.toString();
}

/** Runs the lister for one suite and checks every raw source against the snapshot. */
function listSuite(root: string, suite: Suite, snapshot: string, lister: string, options: GenerateOptions): RawTest[] | PestRawTest[] {
  const pest = suite === "framework" ? [] : ["pest"];
  let stdout: string;
  if (options.local !== undefined) {
    const local = resolve(options.local);
    if (!existsSync(local)) {
      throw new Error(`--local ${local} does not exist`);
    }
    checkLocalCopy(snapshot, local, suite);
    stdout = runLister([options.php ?? "php", lister, local, PHP_VERSION, ...pest]);
  } else {
    const image = options.image ?? oracleImage(root);
    const run = options.runner ?? runInImage;
    try {
      stdout = run(image, [{ host: lister, container: IMAGE_LISTER }], ["php", IMAGE_LISTER, `${IMAGE_UPSTREAM_DIR}/${suite}`, PHP_VERSION, ...pest]);
    } catch (error) {
      throw new Error(`the lister failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const raws = suite === "framework" ? parseRaw(stdout) : parsePestRaw(stdout);
  if (raws.length === 0) {
    throw new Error(suite === "framework" ? "the lister listed no tests" : `the lister listed no ${suite} tests`);
  }
  for (const raw of raws) {
    const label = suite === "framework" ? raw.id : pestTestId(suite, raw as PestRawTest);
    const path = join(snapshot, raw.source.file);
    if (!raw.source.file.startsWith("tests/") || !existsSync(path)) {
      throw new Error(`${label}: source ${suite}/${raw.source.file} is not in ${UPSTREAM_DIR}/${suite}/tests/`);
    }
    if (raw.source.end > readFileSync(path, "utf8").split("\n").length) {
      throw new Error(`${label}: source ${suite}/${raw.source.file}:${raw.source.start}-${raw.source.end} is past the end of the file`);
    }
  }
  return raws;
}

/**
 * Runs the lister and writes the Inventory files under `root`: per framework Component for `framework`,
 * `<suite>.jsonl` for a Pest suite, all four for `all`. Every suite is listed and validated before any file
 * is written.
 */
export function generate(root: string, options: GenerateOptions = {}): GenerateResult {
  const selected = options.suite ?? "framework";
  if (selected !== "all" && !SUITES.includes(selected)) {
    throw new Error(`unknown suite ${JSON.stringify(selected)}; expected one of ${[...SUITES, "all"].join(", ")}`);
  }
  const suites: readonly Suite[] = selected === "all" ? SUITES : [selected];
  if (options.local !== undefined && suites.length > 1) {
    throw new Error("--local takes one suite's install, not --suite all");
  }
  const snapshots = new Map<Suite, string>();
  for (const suite of suites) {
    const snapshot = upstreamPath(root, suite, ".");
    if (!existsSync(join(snapshot, "tests"))) {
      throw new Error(`${UPSTREAM_DIR}/${suite}/tests is missing; ${SNAPSHOT_HINT}`);
    }
    snapshots.set(suite, snapshot);
  }
  const map = readMap(root);
  const lister = resolve(root, LISTER);
  if (!existsSync(lister)) {
    throw new Error(`${LISTER} is missing`);
  }
  const generated: { suite: Suite; files: Map<string, string>; total: number }[] = [];
  for (const suite of suites) {
    const raws = listSuite(root, suite, snapshots.get(suite)!, lister, options);
    const entries = suite === "framework" ? buildEntries(raws, map) : buildPestEntries(suite, raws as PestRawTest[], map);
    generated.push({ suite, files: renderInventory(entries), total: entries.length });
  }

  const dir = join(root, INVENTORY_DIR);
  mkdirSync(dir, { recursive: true });
  const result: GenerateResult = { counts: {}, total: 0, written: [], removed: [] };
  for (const { suite, files, total } of generated) {
    result.total += total;
    for (const [component, text] of files) {
      const file = join(dir, `${component}.jsonl`);
      if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
        writeFileSync(file, text);
      }
      result.written.push(`${INVENTORY_DIR}/${component}.jsonl`);
      result.counts[component] = text.split("\n").length - 1;
    }
    if (suite === "framework") {
      for (const name of readdirSync(dir).sort(compareUnits)) {
        const component = name.replace(/\.jsonl$/, "");
        if (name.endsWith(".jsonl") && !files.has(component) && !FOREIGN_COMPONENTS.includes(component)) {
          rmSync(join(dir, name));
          result.removed.push(`${INVENTORY_DIR}/${name}`);
        }
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/inventory/inventory.ts generate [--suite <framework|ai|mcp|boost|all>] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]"].join("\n");

function parseOptions(argv: readonly string[]): { root: string } & GenerateOptions {
  const options: { root: string } & GenerateOptions = { root: resolve(import.meta.dir, "..", "..") };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!["--suite", "--root", "--image", "--local", "--php"].includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--suite") {
      if (value !== "all" && !(SUITES as readonly string[]).includes(value)) {
        throw new UsageError(`Unknown suite: ${value} (expected ${[...SUITES, "all"].join(", ")})`);
      }
      options.suite = value as Suite | "all";
    } else if (arg === "--root") {
      options.root = resolve(value);
    } else if (arg === "--image") {
      options.image = value;
    } else if (arg === "--local") {
      options.local = value;
    } else {
      options.php = value;
    }
  }
  if (options.image !== undefined && options.local !== undefined) {
    throw new UsageError("--image and --local are exclusive");
  }
  if (options.php !== undefined && options.local === undefined) {
    throw new UsageError("--php needs --local");
  }
  // Image mode lists every suite by default; --local holds one suite's install (framework unless --suite says).
  if (options.local !== undefined && options.suite === "all") {
    throw new UsageError("--local takes one suite; --suite all needs image mode");
  }
  options.suite ??= options.local === undefined ? "all" : "framework";
  return options;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    if (command !== "generate") {
      throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
    const { root, ...options } = parseOptions(rest);
    const result = generate(root, options);
    const lines = Object.entries(result.counts).map(([component, count]) => `${component}: ${count} tests`);
    lines.push(...result.removed.map((file) => `removed ${file}`));
    lines.push(`Inventory: ${result.total} tests in ${result.written.length} files.`);
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Inventory ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
