// Mechanical Oracle request extraction (Story 3.1, decisions/ESC-3.1-1.md;
// FR-6, AD-15).
//
//   bun tools/oracle/extract.ts [--check] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       lists the framework suite with tools/inventory/lister.php (the Test
//       IDs and their dataset rows), tokenises each Differential test file of
//       the snapshot with tools/oracle/extract/tokens.php (PHP's own
//       tokenizer), reads every Differential Test ID × dataset through its
//       family module under tools/oracle/extract/, and writes
//       `conformance/oracle/requests/<component>.jsonl`. By default both PHP
//       scripts run in the Oracle image (`xaravel-oracle:<oracle tag>`, or
//       `--image <ref>`) through tools/oracle's `runInImage`, mounted
//       read-only. With `--local <dir>` the lister runs against a locked
//       install of the framework snapshot (every test and source file equal
//       to the snapshot's), and tokens.php reads the snapshot itself, both
//       with the local PHP (or `--php <bin>`).
//
//   … --check
//       builds the files in memory and compares them byte for byte with the
//       committed ones; it writes nothing. Each drifted file is one
//       `oracle requests drift: <file> …` line on stderr: it differs, is
//       missing, or is committed but not generated.
//
// A request that an accepted merged per-Story file
// (`conformance/oracle-requests/<story-id>.jsonl`) holds is left out of the
// batch (Story 5.6 AC5, Epic 3 retro R5): that Story owns it and its fixture.
// Reading those files needs their merge order, so full git history
// (tools/oracle/merge-order.ts).
//
// The Differential set is closed: the `files` of the five family modules
// (str, sql, blade, validation, date). A Test ID × dataset is Differential
// exactly when its family captures at least one input; anything unreadable
// gives no request. The request format is tools/oracle/request.ts and
// conformance/oracle/schema.json.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readMap } from "../component-map/component-map";
import { buildEntries, LISTER, listSuite, oracleImage, type ImageRunner, type RawTest } from "../inventory/inventory";
import { UPSTREAM_DIR, upstreamPath } from "../upstream/upstream";
import { BLADE_BASE, BLADE_FILES, bladeFamily } from "./extract/blade";
import { dateFamily } from "./extract/date";
import { bindingsFor, parseFile, parseTokenLines, PhpReadError, type ExtractTest, type Family, type PhpFile } from "./extract/php";
import { sqlFamily } from "./extract/sql";
import { strFamily } from "./extract/str";
import { validationFamily } from "./extract/validation";
import { storyHeldShas } from "./fixtures";
import { IMAGE_UPSTREAM_DIR, runInImage } from "./oracle";
import { compareUnits, makeRequest, readSchema, renderRequests, REQUESTS_DIR, validateRequest, type InputByKind, type OracleRequest, type RequestKind } from "./request";

/** The tokenizer, relative to the repository root. */
export const TOKENS_SCRIPT = "tools/oracle/extract/tokens.php";
/** Where image mode mounts the tokenizer. */
const IMAGE_TOKENS = "/xaravel/tokens.php";

/** The five family modules, in report order. */
export const FAMILIES: readonly Family<InputByKind[RequestKind]>[] = [strFamily, sqlFamily, bladeFamily, validationFamily, dateFamily] as unknown as readonly Family<InputByKind[RequestKind]>[];

export interface ExtractOptions {
  image?: string;
  local?: string;
  php?: string;
  /** Runs the PHP scripts in the image; default `runInImage`. */
  runner?: ImageRunner;
  check?: boolean;
}

export interface ExtractResult {
  /** Requests per Component, sorted by Component. */
  counts: Record<string, number>;
  /** Requests and Test IDs per family, in FAMILIES order. */
  families: { name: string; requests: number; tests: number }[];
  total: number;
  written: string[];
  removed: string[];
  drift: string[];
}

/** The family owning each Differential test file. */
function familyByFile(): Map<string, Family<InputByKind[RequestKind]>> {
  const out = new Map<string, Family<InputByKind[RequestKind]>>();
  for (const family of FAMILIES) {
    for (const file of family.files) {
      if (out.has(file)) {
        throw new Error(`${file} is in two families`);
      }
      out.set(file, family);
    }
  }
  return out;
}

/** phpunit.xml.dist's `<ini name="…" value="…"/>` settings. */
export function phpunitIni(snapshot: string): Record<string, string> {
  const file = join(snapshot, "phpunit.xml.dist");
  const out: Record<string, string> = {};
  if (!existsSync(file)) {
    return out;
  }
  for (const match of readFileSync(file, "utf8").matchAll(/<ini\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/g)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

function runTokens(root: string, snapshot: string, files: readonly string[], options: ExtractOptions): string {
  const script = resolve(root, TOKENS_SCRIPT);
  if (!existsSync(script)) {
    throw new Error(`${TOKENS_SCRIPT} is missing`);
  }
  if (options.local !== undefined) {
    const proc = Bun.spawnSync([options.php ?? "php", script, snapshot, ...files], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    if (proc.exitCode !== 0) {
      throw new Error(`tokens.php failed (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
    }
    return proc.stdout.toString();
  }
  const run = options.runner ?? runInImage;
  try {
    return run(options.image ?? oracleImage(root), [{ host: script, container: IMAGE_TOKENS }], ["php", IMAGE_TOKENS, `${IMAGE_UPSTREAM_DIR}/framework`, ...files]);
  } catch (error) {
    throw new Error(`tokens.php failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fails, naming each file, when a listed Differential file (other than the test-less AbstractBladeTestCase) is not
 * in the snapshot or has no listed tests, or when the snapshot's `tests/View/Blade/*Test.php` set is not the listed
 * Blade set: the closed set must move with the Pin, never silently.
 */
export function checkClosedSet(snapshot: string, listed: readonly string[], raws: readonly RawTest[]): void {
  const problems: string[] = [];
  const withRaws = new Set(raws.map((raw) => raw.file));
  for (const file of listed) {
    if (file === BLADE_BASE) {
      continue;
    }
    if (!existsSync(join(snapshot, file))) {
      problems.push(`${file} is listed in a family module but is not in ${UPSTREAM_DIR}/framework`);
    } else if (!withRaws.has(file)) {
      problems.push(`${file} is listed in a family module but the lister lists no tests in it`);
    }
  }
  const bladeDir = join(snapshot, "tests", "View", "Blade");
  const inSnapshot = existsSync(bladeDir) ? readdirSync(bladeDir).filter((name) => name.endsWith("Test.php")).map((name) => `tests/View/Blade/${name}`) : [];
  const inList = BLADE_FILES.filter((file) => file.startsWith("tests/View/Blade/") && file.endsWith("Test.php"));
  for (const file of inSnapshot.filter((name) => !inList.includes(name)).sort(compareUnits)) {
    problems.push(`${file} is in ${UPSTREAM_DIR}/framework but not in BLADE_FILES (tools/oracle/extract/blade.ts)`);
  }
  if (problems.length > 0) {
    throw new Error(`the Differential file set does not match the snapshot:\n${problems.map((line) => `  ${line}`).join("\n")}`);
  }
}

/** The family test of one raw line, or null when its method is not declared in its own file's class. */
function testFor(raw: RawTest, file: PhpFile, ini: Record<string, string>): ExtractTest | null {
  if (raw.source.file !== raw.file) {
    return null;
  }
  const cls = file.classes.find((candidate) => candidate.fqcn === raw.class);
  const method = cls?.methods.get(raw.method.toLowerCase());
  if (cls === undefined || method === undefined) {
    return null;
  }
  return { id: raw.id, file: cls.scope, cls, method, bindings: bindingsFor(method.params, raw.data), ini };
}

/** Every request of the snapshot, with its Component. */
export function buildRequests(root: string, options: ExtractOptions = {}): { requests: { component: string; request: OracleRequest; family: string }[] } {
  const snapshot = upstreamPath(root, "framework", ".");
  if (!existsSync(join(snapshot, "tests"))) {
    throw new Error(`${UPSTREAM_DIR}/framework/tests is missing; run bun run upstream:sync`);
  }
  const lister = resolve(root, LISTER);
  if (!existsSync(lister)) {
    throw new Error(`${LISTER} is missing`);
  }
  const families = familyByFile();
  const map = readMap(root);
  const raws = listSuite(root, "framework", snapshot, lister, options) as RawTest[];
  const components = new Map(buildEntries(raws, map).map((entry) => [entry.id, entry.component]));
  checkClosedSet(snapshot, [...families.keys()], raws);
  const selected = raws.filter((raw) => families.has(raw.file));
  const files = [...new Set(selected.map((raw) => raw.file))].sort(compareUnits);
  const models = new Map<string, PhpFile>();
  if (files.length > 0) {
    const tokens = parseTokenLines(runTokens(root, snapshot, files, options));
    for (const file of files) {
      const list = tokens.get(file);
      if (list === undefined) {
        throw new Error(`tokens.php printed no tokens for ${file}`);
      }
      models.set(file, parseFile(file, list));
    }
  }
  const ini = phpunitIni(snapshot);
  const schema = readSchema(root);
  const requests: { component: string; request: OracleRequest; family: string }[] = [];
  for (const raw of selected) {
    const family = families.get(raw.file)!;
    const test = testFor(raw, models.get(raw.file)!, ini);
    if (test === null) {
      continue;
    }
    let inputs: InputByKind[RequestKind][];
    try {
      inputs = family.extract(test);
    } catch (error) {
      if (error instanceof PhpReadError) {
        continue;
      }
      throw error;
    }
    for (const input of inputs) {
      const request = makeRequest(raw.id, family.kind, input);
      const errors = validateRequest(JSON.parse(JSON.stringify(request)) as unknown, schema);
      if (errors.length > 0) {
        throw new Error(`${raw.id}: the extracted ${family.kind} request does not validate: ${errors.join("; ")}`);
      }
      requests.push({ component: components.get(raw.id)!, request, family: family.name });
    }
  }
  return { requests };
}

/** The 1-based line of the first difference between two texts. */
function firstDifference(a: string, b: string): number {
  const left = a.split("\n");
  const right = b.split("\n");
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if (left[i] !== right[i]) {
      return i + 1;
    }
  }
  return length;
}

/** Writes (or with `check`, compares) `conformance/oracle/requests/<component>.jsonl` under `root`. */
export function extract(root: string, options: ExtractOptions = {}): ExtractResult {
  const built = buildRequests(root, options).requests;
  const held = storyHeldShas(root);
  const requests = built.filter((entry) => !held.has(entry.request.sha256));
  const files = renderRequests(requests);
  const result: ExtractResult = { counts: {}, families: [], total: 0, written: [], removed: [], drift: [] };
  for (const family of FAMILIES) {
    const mine = requests.filter((entry) => entry.family === family.name);
    const unique = new Set(mine.map((entry) => entry.request.sha256));
    result.families.push({ name: family.name, requests: unique.size, tests: new Set(mine.map((entry) => entry.request.id)).size });
  }
  const dir = join(root, REQUESTS_DIR);
  const stray = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl") && !files.has(name.slice(0, -".jsonl".length)))
        .sort(compareUnits)
    : [];
  for (const [component, text] of files) {
    const name = `${REQUESTS_DIR}/${component}.jsonl`;
    const count = text.split("\n").length - 1;
    result.counts[component] = count;
    result.total += count;
    result.written.push(name);
  }
  if (options.check === true) {
    for (const [component, text] of files) {
      const file = join(dir, `${component}.jsonl`);
      const name = `${REQUESTS_DIR}/${component}.jsonl`;
      if (!existsSync(file)) {
        result.drift.push(`oracle requests drift: ${name} is missing`);
      } else {
        const committed = readFileSync(file, "utf8");
        if (committed !== text) {
          result.drift.push(`oracle requests drift: ${name} differs from the extracted requests (first difference at line ${firstDifference(committed, text)})`);
        }
      }
    }
    for (const name of stray) {
      result.drift.push(`oracle requests drift: ${REQUESTS_DIR}/${name} is not generated`);
    }
    return result;
  }
  mkdirSync(dir, { recursive: true });
  for (const [component, text] of files) {
    const file = join(dir, `${component}.jsonl`);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      writeFileSync(file, text);
    }
  }
  for (const name of stray) {
    rmSync(join(dir, name));
    result.removed.push(`${REQUESTS_DIR}/${name}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

export class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/oracle/extract.ts [--check] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]"].join("\n");

export function parseOptions(argv: readonly string[]): { root: string } & ExtractOptions {
  const options: { root: string } & ExtractOptions = { root: resolve(import.meta.dir, "..", "..") };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!["--check", "--root", "--image", "--local", "--php"].includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    seen.add(arg);
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
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
  return options;
}

export function main(argv: readonly string[]): number {
  try {
    const { root, ...options } = parseOptions(argv);
    const result = extract(root, options);
    const files = result.written.length;
    if (options.check === true) {
      process.stderr.write(result.drift.map((line) => `${line}\n`).join(""));
      if (result.drift.length > 0) {
        process.stderr.write(`Oracle requests check failed: ${result.drift.length} file(s) differ.\n`);
        return 1;
      }
      process.stdout.write(`Oracle requests check OK: ${result.total} requests in ${files} files are byte-identical.\n`);
      return 0;
    }
    const lines = Object.entries(result.counts).map(([component, count]) => `${component}: ${count} requests`);
    lines.push(...result.families.map((family) => `${family.name}: ${family.requests} requests from ${family.tests} Test IDs`));
    lines.push(...result.removed.map((file) => `removed ${file}`));
    lines.push(`Oracle requests: ${result.total} requests in ${files} files.`);
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Oracle request extraction failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
