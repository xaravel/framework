// The Expectations File and its Variant vocabulary (Story 5.1, FR-3, AD-15;
// decisions/ESC-5.1-1.md).
//
//   bun tools/expectations/expectations.ts init [--root <dir>]
//       adds one line for every Inventory Test ID × Variant pair (a Test ID's
//       Variants are exactly its `backends`) that appears in no shard, to the
//       shard `shardPathFor` names, as `skip` / `not-ported-yet`
//       (`deferred:ai-sdk` when the Component is `ai`), `adapted:null`,
//       `escalation:null`. It is additive and idempotent: it never rewrites or
//       removes an existing line, re-sorts only the shards it touches, and a
//       second run changes nothing. It fails, writing nothing, when the
//       vocabulary is invalid, an Inventory backend is not in it, or an
//       existing shard has a format fault (as `check` decodes it), a line that
//       does not parse, or a pair already on an earlier line. Prints
//       `Expectations init: added <n> line(s) in <m> shard(s).`
//
//   bun tools/expectations/expectations.ts check [--root <dir>]
//       validates `conformance/variants` and every file under
//       `conformance/expectations/` (recursive) against the Inventory, prints
//       one violation per line on stderr and exits 1, or prints
//       `Expectations OK: <lines> line(s) in <shards> shard(s) cover <pairs> Test ID × Variant pair(s).`
//
// `conformance/variants`: UTF-8, LF, one Variant per line, `#` comment lines
// and blank lines ignored, Variant lines sorted by UTF-16 code units and
// unique. A Variant matches `^[a-z0-9]+$` or
// `^[a-z0-9]+(-[a-z0-9]+)*@[a-z0-9]+$`.
//
// A shard is `conformance/expectations/<component>/<Upstream test path>.jsonl`,
// where `<Upstream test path>` is the Inventory `source` without its
// `:<start>-<end>` suffix and `.php` extension; it mirrors
// `packages/<component>/tests/ported/<Upstream test path>.test.ts`. A line is
// `JSON.stringify` of an object with exactly the keys `id`, `variant`,
// `status`, `reason`, `adapted`, `escalation`, in that order (the bytes
// tools/pin-bump writes for these keys). Lines are sorted by `id` then
// `variant`; the file is UTF-8 with no BOM, LF endings, no blank line and
// exactly one final LF. These are tool data, not framework values, so they are
// written with JSON.stringify (AD-23 covers framework values).
//
// Violations `check` reports (file:line where it has one):
//
//   a vocabulary line that is not a valid Variant, unsorted or duplicated;
//   invalid UTF-8, a BOM, a CR, a missing final LF, a blank line, an empty shard;
//   a line that is not a JSON object with exactly the six keys in order, or
//     whose `id` or `variant` is not a string, or that is not byte-identical
//     to `serialiseLine` of itself (`not in canonical form`);
//   a Variant outside the vocabulary; an Inventory backend outside it;
//   an unsorted line within a shard (a duplicated one is a `duplicate:`);
//   `missing: <id> × <variant>`: an Inventory pair with no line;
//   `duplicate: <id> × <variant> in <paths>`: a pair on more than one line;
//   `unknown: <id> × <variant>`: a line whose pair is not an Inventory pair;
//   a line in a shard not under `<component>/` of its id's Inventory Component;
//   a file under the directory that is not `.jsonl`.
//
// Skip Reason rules and status values are Story 5.2's; line ownership is
// tools/ownership's and the Ratchet tools/ratchet's (Story 5.6).
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { compareUnits, type InventoryEntry } from "../inventory/inventory";
import { EXPECTATION_KEYS, EXPECTATIONS_DIR, readWorkingInventory } from "../pin-bump/pin-bump";

/** The closed Variant vocabulary, relative to the repository root. */
export const VARIANTS_FILE = "conformance/variants";
const VARIANT = /^(?:[a-z0-9]+|[a-z0-9]+(?:-[a-z0-9]+)*@[a-z0-9]+)$/;

/** One Expectations line (AD-15). */
export interface ExpectationLine {
  id: string;
  variant: string;
  status: string;
  reason: string | null;
  adapted: string | null;
  escalation: string | null;
}

export interface VariantsResult {
  variants: string[];
  violations: string[];
}

export class UsageError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Decodes strict UTF-8 and checks BOM, CR, final LF and blank lines; returns the lines (no trailing empty one), or null when undecodable. */
function textLines(bytes: Uint8Array, file: string, violations: string[], allowBlank: boolean): string[] | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    violations.push(`${file}: invalid UTF-8`);
    return null;
  }
  if (text.startsWith("\uFEFF")) {
    violations.push(`${file}: starts with a BOM`);
    text = text.slice(1);
  }
  if (text === "") {
    return [];
  }
  if (!text.endsWith("\n")) {
    violations.push(`${file}: missing final LF`);
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.map((line, index) => {
    if (line.includes("\r")) {
      violations.push(`${file}:${index + 1}: CR line ending`);
    }
    if (!allowBlank && line.replace(/\r$/, "") === "") {
      violations.push(`${file}:${index + 1}: blank line`);
    }
    return line.replace(/\r$/, "");
  });
}

/** Parses the vocabulary file's bytes; `violations` is empty when it is valid. */
export function parseVariants(content: Uint8Array | string, file: string = VARIANTS_FILE): VariantsResult {
  const violations: string[] = [];
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const lines = textLines(bytes, file, violations, true);
  const variants: string[] = [];
  (lines ?? []).forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    if (line === "" || line.startsWith("#")) {
      return;
    }
    if (!VARIANT.test(line)) {
      violations.push(`${at}: not a Variant: ${JSON.stringify(line)}`);
      return;
    }
    const previous = variants.at(-1);
    if (previous !== undefined && compareUnits(previous, line) === 0) {
      violations.push(`${at}: duplicate Variant ${line}`);
      return;
    }
    if (previous !== undefined && compareUnits(previous, line) > 0) {
      violations.push(`${at}: Variant ${line} is not sorted after ${previous}`);
    }
    variants.push(line);
  });
  if (lines !== null && variants.length === 0) {
    violations.push(`${file}: lists no Variant`);
  }
  return { variants, violations };
}

/** Reads `conformance/variants` under `root`. */
export function readVariants(root: string): VariantsResult {
  const path = join(root, VARIANTS_FILE);
  if (!existsSync(path)) {
    return { variants: [], violations: [`${VARIANTS_FILE}: does not exist`] };
  }
  return parseVariants(readFileSync(path), VARIANTS_FILE);
}

/** The repo-relative shard path of an Inventory entry. */
export function shardPathFor(entry: Pick<InventoryEntry, "component" | "source">): string {
  const file = entry.source.replace(/:[0-9]+-[0-9]+$/, "").replace(/\.php$/, "");
  return `${EXPECTATIONS_DIR}/${entry.component}/${file}.jsonl`;
}

/** Serialises a line in AD-15 field order, no spaces. */
export function serialiseLine(line: ExpectationLine): string {
  const ordered: Record<string, unknown> = {};
  for (const key of EXPECTATION_KEYS) {
    ordered[key] = line[key];
  }
  return JSON.stringify(ordered);
}

/** The line `init` writes for an Inventory pair. */
export function initialLine(entry: Pick<InventoryEntry, "id" | "component">, variant: string): ExpectationLine {
  return { id: entry.id, variant, status: "skip", reason: entry.component === "ai" ? "deferred:ai-sdk" : "not-ported-yet", adapted: null, escalation: null };
}

/** One violation per Inventory backend outside the vocabulary. */
function backendViolations(inventory: readonly InventoryEntry[], vocabulary: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const entry of inventory) {
    for (const backend of entry.backends) {
      if (!vocabulary.has(backend)) {
        out.push(`unknown backend: ${entry.id} has backend ${backend}, which is not in ${VARIANTS_FILE}`);
      }
    }
  }
  return out;
}

const pairKey = (id: string, variant: string): string => `${id}\0${variant}`;

function comparePairs(a: { id: string; variant: string }, b: { id: string; variant: string }): number {
  return compareUnits(a.id, b.id) || compareUnits(a.variant, b.variant);
}

/** Every file under `conformance/expectations/`, repo-relative, sorted. */
function walkFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort(compareUnits)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkFiles(root, path, out);
    } else {
      out.push(relative(root, path).split("\\").join("/"));
    }
  }
}

function expectationFiles(root: string): string[] {
  const dir = join(root, EXPECTATIONS_DIR);
  const out: string[] = [];
  if (existsSync(dir)) {
    walkFiles(root, dir, out);
  }
  return out;
}

export interface Report {
  violations: string[];
  lines: number;
  shards: number;
  pairs: number;
}

/** Validates the vocabulary and every shard under `root` against the Inventory. */
export function check(root: string): Report {
  const violations: string[] = [];
  const vocabulary = readVariants(root);
  violations.push(...vocabulary.violations);
  const known = new Set(vocabulary.variants);
  const inventory = readWorkingInventory(root);
  violations.push(...backendViolations(inventory, known));
  const componentOf = new Map<string, string>();
  const needed = new Map<string, { id: string; variant: string }>();
  for (const entry of inventory) {
    componentOf.set(entry.id, entry.component);
    for (const variant of entry.backends) {
      needed.set(pairKey(entry.id, variant), { id: entry.id, variant });
    }
  }
  const seen = new Map<string, { id: string; variant: string; ats: string[] }>();
  let lineCount = 0;
  let shardCount = 0;
  for (const path of expectationFiles(root)) {
    if (!path.endsWith(".jsonl")) {
      violations.push(`${path}: not a .jsonl shard`);
      continue;
    }
    shardCount++;
    const lines = textLines(readFileSync(join(root, path)), path, violations, false);
    if (lines === null) {
      continue;
    }
    if (lines.length === 0) {
      violations.push(`${path}: empty shard`);
    }
    let previous: { id: string; variant: string } | null = null;
    lines.forEach((line, index) => {
      const at = `${path}:${index + 1}`;
      if (line === "") {
        return;
      }
      lineCount++;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        violations.push(`${at}: malformed JSON: ${message(error)}`);
        return;
      }
      if (!isRecord(value) || Object.keys(value).join(",") !== EXPECTATION_KEYS.join(",")) {
        violations.push(`${at}: expected an object with exactly the keys ${EXPECTATION_KEYS.join(", ")} in that order`);
        return;
      }
      const { id, variant } = value;
      if (typeof id !== "string" || typeof variant !== "string") {
        violations.push(`${at}: id and variant must be strings`);
        return;
      }
      if (line !== serialiseLine(value as unknown as ExpectationLine)) {
        violations.push(`${at}: not in canonical form`);
      }
      if (!known.has(variant)) {
        violations.push(`${at}: Variant ${JSON.stringify(variant)} is not in ${VARIANTS_FILE}`);
      }
      const current = { id, variant };
      if (previous !== null) {
        const order = comparePairs(previous, current);
        // A within-shard duplicate (order 0) is reported once, as `duplicate:` below.
        if (order > 0) {
          violations.push(`${at}: ${id} × ${variant} is not sorted after ${previous.id} × ${previous.variant}`);
        }
      }
      previous = current;
      const key = pairKey(id, variant);
      const occurrences = seen.get(key) ?? { id, variant, ats: [] };
      occurrences.ats.push(at);
      seen.set(key, occurrences);
      const component = componentOf.get(id);
      if (!needed.has(key)) {
        violations.push(`unknown: ${id} × ${variant} (${at}) is not an Inventory pair`);
      }
      if (component !== undefined && !path.startsWith(`${EXPECTATIONS_DIR}/${component}/`)) {
        violations.push(`${at}: ${id} belongs to Component ${component}, but the shard is not under ${EXPECTATIONS_DIR}/${component}/`);
      }
    });
  }
  for (const [key, pair] of needed) {
    if (!seen.has(key)) {
      violations.push(`missing: ${pair.id} × ${pair.variant}`);
    }
  }
  for (const { id, variant, ats } of seen.values()) {
    if (ats.length > 1) {
      violations.push(`duplicate: ${id} × ${variant} in ${ats.join(", ")}`);
    }
  }
  return { violations, lines: lineCount, shards: shardCount, pairs: needed.size };
}

export interface InitResult {
  added: number;
  shards: string[];
}

/**
 * Adds every missing Inventory pair's line; throws (writing nothing) on an invalid vocabulary, an unknown backend, or
 * an existing shard with a format fault, an unparsable line or a pair already on an earlier line.
 */
export function init(root: string): InitResult {
  const vocabulary = readVariants(root);
  const inventory = readWorkingInventory(root);
  const problems = [...vocabulary.violations, ...backendViolations(inventory, new Set(vocabulary.variants))];
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  // Existing lines, kept as raw text; any fault stops init before anything is written.
  const shards = new Map<string, { id: string; variant: string; text: string }[]>();
  const present = new Map<string, string>();
  const faults: string[] = [];
  for (const path of expectationFiles(root)) {
    if (!path.endsWith(".jsonl")) {
      continue;
    }
    const lines = textLines(readFileSync(join(root, path)), path, faults, false) ?? [];
    const kept: { id: string; variant: string; text: string }[] = [];
    lines.forEach((line, index) => {
      const at = `${path}:${index + 1}`;
      if (line === "") {
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        faults.push(`${at}: malformed JSON: ${message(error)}`);
        return;
      }
      if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["variant"] !== "string") {
        faults.push(`${at}: expected an Expectations object with a string id and variant`);
        return;
      }
      const key = pairKey(value["id"], value["variant"]);
      const earlier = present.get(key);
      if (earlier !== undefined) {
        faults.push(`${at}: ${value["id"]} × ${value["variant"]} is already on ${earlier}`);
        return;
      }
      present.set(key, at);
      kept.push({ id: value["id"], variant: value["variant"], text: line });
    });
    shards.set(path, kept);
  }
  if (faults.length > 0) {
    throw new Error(`${faults.join("\n")}\n(run expectations:check)`);
  }
  const touched = new Set<string>();
  let added = 0;
  for (const entry of inventory) {
    for (const variant of entry.backends) {
      const key = pairKey(entry.id, variant);
      if (present.has(key)) {
        continue;
      }
      present.set(key, "init");
      const path = shardPathFor(entry);
      const lines = shards.get(path) ?? [];
      lines.push({ id: entry.id, variant, text: serialiseLine(initialLine(entry, variant)) });
      shards.set(path, lines);
      touched.add(path);
      added++;
    }
  }
  const written = [...touched].sort(compareUnits);
  for (const path of written) {
    const lines = shards.get(path)!.slice().sort(comparePairs);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), lines.map((line) => `${line.text}\n`).join(""));
  }
  return { added, shards: written };
}

const USAGE = ["Usage:", "  bun tools/expectations/expectations.ts init [--root <dir>]", "  bun tools/expectations/expectations.ts check [--root <dir>]"].join("\n");

function parseRoot(argv: readonly string[]): string {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    if (command === "init") {
      const result = init(parseRoot(rest));
      process.stdout.write(`Expectations init: added ${result.added} line(s) in ${result.shards.length} shard(s).\n`);
      return 0;
    }
    if (command === "check") {
      const report = check(parseRoot(rest));
      if (report.violations.length > 0) {
        process.stderr.write(report.violations.map((violation) => `${violation}\n`).join(""));
        return 1;
      }
      process.stdout.write(`Expectations OK: ${report.lines} line(s) in ${report.shards} shard(s) cover ${report.pairs} Test ID × Variant pair(s).\n`);
      return 0;
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Expectations ${command} failed: ${message(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
