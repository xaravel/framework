// The data layer of Boost framework mode (Story 7.3; FR-109, spine l.106).
//
// Every data file the server reads goes through `dataPath`, which resolves a
// repo-relative path under `<root>` and throws `DataScopeError` unless it lies
// inside one of `DATA_DIRS` (`conformance/`, `stories/`, `decisions/`), first
// lexically and then on its real path (`inScope`, src/scope.ts, Story 7.4), so
// a symlink cannot lead a read out of the data scope.
//
// Nothing is cached: each reader reads the files again, so edits made in the
// worktree show up at once. Nothing here writes, spawns or touches git.
//
// The readers mirror rules owned by other tools, which this workspace cannot
// import (its composite tsconfig has `rootDir: .`):
// - the Inventory file filter of `tools/pin-bump/pin-bump.ts`
//   (`readWorkingInventory`: every `conformance/inventory/*.jsonl` except
//   `oracle-nondeterminism.jsonl`);
// - its Expectations walk (`readExpectations`: every `*.jsonl` under
//   `conformance/expectations/`, sorted by path);
// - the frontmatter split of `tools/escalations/escalations.ts` and
//   `tools/ownership/ownership.ts` (a `---` first line, up to the next `---`
//   line, CRLF normalised, parsed with `Bun.YAML.parse`).
// conformance/tests/xaravel/boost-framework.test.ts compares each mirror with
// its source on the real repository and on a fixture.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DATA_DIRS, DataScopeError, inScope } from "./scope";

export { DATA_DIRS, DataScopeError };

export const INVENTORY_DIR = "conformance/inventory";
export const NONDETERMINISM_FILE = "oracle-nondeterminism.jsonl";
export const EXPECTATIONS_DIR = "conformance/expectations";
export const ESCALATIONS_DIR = "conformance/escalations";
export const DECISIONS_DIR = "decisions";
export const STORIES_DIR = "stories";
export const UPSTREAM_DIR = "conformance/upstream";

/** A data file could not be read or parsed. */
export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}

/** Compares by UTF-16 code units (mirrors `compareUnits` in tools/inventory/inventory.ts). */
export function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The absolute path of the repo-relative `rel` under `root`. Throws DataScopeError unless it resolves inside
 * `<root>/conformance/`, `<root>/stories/` or `<root>/decisions/` (or is one of those directories), both lexically
 * and on its real path, so a symlink (or a dangling one) that leads elsewhere is refused.
 */
export function dataPath(root: string, rel: string): string {
  if (typeof rel !== "string" || rel === "" || rel.includes("\0") || isAbsolute(rel)) {
    throw new DataScopeError(String(rel));
  }
  const base = resolve(root);
  const abs = resolve(base, rel);
  const inside = relative(base, abs);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new DataScopeError(rel);
  }
  const top = inside.split(sep)[0]!;
  if (!(DATA_DIRS as readonly string[]).includes(top)) {
    throw new DataScopeError(rel);
  }
  if (!inScope(base, abs)) {
    throw new DataScopeError(rel);
  }
  return abs;
}

/** Whether the data file or directory `rel` exists. */
export function dataExists(root: string, rel: string): boolean {
  return existsSync(dataPath(root, rel));
}

/** The UTF-8 text of the data file `rel`. */
export function readData(root: string, rel: string): string {
  return readFileSync(dataPath(root, rel), "utf8");
}

/** The entry names of the data directory `rel`, sorted by code units; empty when it does not exist. */
function listDir(root: string, rel: string): { name: string; dir: boolean }[] {
  const path = dataPath(root, rel);
  if (!existsSync(path)) {
    return [];
  }
  return readdirSync(path)
    .sort(compareUnits)
    .map((name) => ({ name, dir: statSync(dataPath(root, `${rel}/${name}`)).isDirectory() }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The JSON objects of the JSONL file `rel`, one per line. */
function readJsonl(root: string, rel: string): Record<string, unknown>[] {
  const text = readData(root, rel);
  const raw = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (raw === "") {
    return [];
  }
  return raw.split("\n").map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new DataError(`${rel}:${index + 1}: malformed JSON: ${message(error)}`);
    }
    if (!isRecord(value) || typeof value["id"] !== "string") {
      throw new DataError(`${rel}:${index + 1}: expected a JSON object with a string id`);
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// Inventory

/** An Inventory entry as stored, with the file it came from. */
export interface InventoryRecord {
  file: string;
  raw: Record<string, unknown>;
}

/** The Inventory files: every `conformance/inventory/*.jsonl` except the nondeterminism log, sorted. */
export function inventoryFiles(root: string): string[] {
  return listDir(root, INVENTORY_DIR)
    .filter((entry) => !entry.dir && entry.name.endsWith(".jsonl") && entry.name !== NONDETERMINISM_FILE)
    .map((entry) => `${INVENTORY_DIR}/${entry.name}`);
}

/** Every Inventory entry, in file then line order. */
export function readInventory(root: string): InventoryRecord[] {
  if (!dataExists(root, INVENTORY_DIR)) {
    throw new DataError(`${INVENTORY_DIR} does not exist`);
  }
  return inventoryFiles(root).flatMap((file) => readJsonl(root, file).map((raw) => ({ file, raw })));
}

// ---------------------------------------------------------------------------
// Expectations

/** An Expectations shard: its repo-relative path and its lines. */
export interface Shard {
  path: string;
  lines: Record<string, unknown>[];
}

function walkJsonl(root: string, rel: string, out: string[]): void {
  for (const entry of listDir(root, rel)) {
    const path = `${rel}/${entry.name}`;
    if (entry.dir) {
      walkJsonl(root, path, out);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(path);
    }
  }
}

/** Every `.jsonl` shard under `conformance/expectations/`, sorted by path. */
export function readExpectationShards(root: string): Shard[] {
  const paths: string[] = [];
  walkJsonl(root, EXPECTATIONS_DIR, paths);
  return paths.map((path) => ({ path, lines: readJsonl(root, path) }));
}

// ---------------------------------------------------------------------------
// Frontmatter

export interface Frontmatter {
  fields: Record<string, unknown>;
  body: string;
}

/**
 * Splits `text` into its `---`-fenced YAML frontmatter mapping and the body after it. Returns null when there is no
 * frontmatter block, and a string naming the problem when the block is not a YAML mapping.
 */
export function parseFrontmatter(text: string): Frontmatter | string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return null;
  }
  let data: unknown;
  try {
    data = Bun.YAML.parse(lines.slice(1, end).join("\n"));
  } catch (error) {
    return `frontmatter is not valid YAML: ${message(error)}`;
  }
  if (!isRecord(data)) {
    return "frontmatter must be a YAML mapping";
  }
  return { fields: data, body: lines.slice(end + 1).join("\n") };
}

// ---------------------------------------------------------------------------
// Markdown records

/** The `.md` file names (sorted) in the data directory `rel`. */
export function markdownFiles(root: string, rel: string): string[] {
  return listDir(root, rel)
    .filter((entry) => !entry.dir && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

/** The text of the data file `rel`, or null when it does not exist. */
export function readOptional(root: string, rel: string): string | null {
  return dataExists(root, rel) ? readData(root, rel) : null;
}
