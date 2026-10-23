// The API-surface export (Story 3.5; FR-6, AD-15, PRD §5.1).
//
//   bun tools/oracle/api-surface.ts [--check] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       runs tools/oracle/api-surface.php (PHP Reflection) twice for each
//       Upstream repository (framework, ai, mcp, boost), over the FQCNs
//       tools/component-map's `declaredClasses` lists for it and every user
//       function its `src/` declares. The two passes must print the same bytes.
//       Every line is re-rendered in its kind's key order, validated against
//       `conformance/api-surface/schema.json#/$defs/surface`, assigned to its
//       Component and sorted; the result is
//       `conformance/api-surface/<component>.jsonl`. Any other `*.jsonl` there
//       is deleted, except the citation files `additions.jsonl` and
//       `exceptions.jsonl`. By default the script runs in the Oracle image
//       (`xaravel-oracle:<oracle tag>`, or `--image <ref>`) through
//       tools/oracle's image runner, with the script and the class lists
//       mounted read-only. With `--local <dir>` it runs with the local PHP (or
//       `--php <bin>`) against `<dir>/{framework,ai,mcp,boost}`, locked
//       installs whose sources equal the snapshot's.
//
//       After the repositories it runs the script twice more for each PSR
//       package AD-22 gives to `@xaravel/contracts/psr` (`PSR_PACKAGES`:
//       psr/container, psr/log, psr/simple-cache; ESC-10.1-4), in its
//       interfaces mode, against the framework install's
//       `vendor/<package>/<PSR-4 dir>`: every interface the package declares,
//       and nothing else. The version and the PSR-4 directory come from the
//       committed `conformance/oracle/locks/framework/composer.lock`
//       (`psrPins`); the script fails unless the installed version is the
//       lock's. A PSR pass that prints a function, or a FQCN outside its
//       package's namespace, fails the run.
//
//   … --check
//       builds the files in memory and compares them byte for byte with the
//       committed ones, one `api surface drift: <file> …` line per difference
//       (it differs, is missing, or is committed but not generated), and
//       validates the citation files (`checkCitations`). It writes nothing.
//
// A class's Component is `componentForFqcn`, whose `PSR_NAMESPACES` fallback
// gives the PSR passes' interfaces to `contracts`. A function's is `kebab(<Dir>)`
// for `framework/src/Illuminate/<Dir>/…`, else the repository name. A FQCN or
// Component the map does not know fails the run, and nothing is written.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { componentForFqcn, declaredClasses, readMap } from "../component-map/component-map";
import { checkLocalCopy, oracleImage, type ImageRunner } from "../inventory/inventory";
import { kebab } from "../scaffold/table";
import { UPSTREAM_DIR, UPSTREAM_REPOS, upstreamPath, type UpstreamName } from "../upstream/upstream";
import { IMAGE_UPSTREAM_DIR, runInImage } from "./oracle";
import { compareUnits, renderJson, schemaErrors, type Json, type JsonObject } from "./request";

export const API_SURFACE_DIR = "conformance/api-surface";
export const API_SURFACE_SCHEMA = `${API_SURFACE_DIR}/schema.json`;
export const API_SURFACE_SCRIPT = "tools/oracle/api-surface.php";
/** The citation files: committed by hand through Maintainer review, never generated or deleted. */
export const CITATION_FILES = { additions: "additions.jsonl", exceptions: "exceptions.jsonl" } as const;
/** Where image mode mounts the script and the class lists. */
const IMAGE_SCRIPT = "/xaravel/api-surface.php";
const IMAGE_CLASSES = "/xaravel/classes";

export type SurfaceKind = "class" | "interface" | "trait" | "enum" | "function" | "case" | "constant" | "property" | "method";
/** The sort rank of each kind within one FQCN. */
const KIND_RANK: Readonly<Record<SurfaceKind, number>> = { class: 0, interface: 0, trait: 0, enum: 0, function: 0, case: 1, constant: 2, property: 3, method: 4 };
const PARAMETER_KEYS = ["name", "type", "nullable", "default", "optional", "variadic", "byRef"] as const;
/** Each kind's key order. */
const KEYS: Readonly<Record<SurfaceKind, readonly string[]>> = {
  class: ["fqcn", "kind", "member", "stubbed"],
  interface: ["fqcn", "kind", "member", "stubbed"],
  trait: ["fqcn", "kind", "member", "stubbed"],
  enum: ["fqcn", "kind", "member", "stubbed"],
  method: ["fqcn", "kind", "member", "static", "parameters", "returns", "nullable"],
  property: ["fqcn", "kind", "member", "static", "type", "nullable"],
  constant: ["fqcn", "kind", "member", "static"],
  case: ["fqcn", "kind", "member", "static"],
  function: ["fqcn", "kind", "member", "static", "parameters", "returns", "nullable"],
};
const CITATION_KEYS = ["component", "fqcn", "member", "citation"] as const;
/** The framework install's lock, which pins the PSR packages. */
export const FRAMEWORK_LOCK = "conformance/oracle/locks/framework/composer.lock";
/** The PSR packages whose interfaces the export adds (ESC-10.1-4), with the PSR-4 prefix each must declare. */
export const PSR_PACKAGES = [
  { package: "psr/container", prefix: "Psr\\Container\\" },
  { package: "psr/log", prefix: "Psr\\Log\\" },
  { package: "psr/simple-cache", prefix: "Psr\\SimpleCache\\" },
] as const;

/** A PSR package as the framework lock pins it: `dir` is its PSR-4 directory, without a trailing slash. */
export interface PsrPin {
  package: string;
  prefix: string;
  version: string;
  dir: string;
}

/** One source the script reflects: an Upstream repository, or a PSR package in interfaces mode. */
type Pass = { label: UpstreamName; repo: UpstreamName; psr: null } | { label: string; repo: null; psr: PsrPin };

export interface SurfaceOptions {
  image?: string;
  local?: string;
  php?: string;
  /** Runs the PHP script in the image; default the Oracle image runner. */
  runner?: ImageRunner;
  check?: boolean;
}

export interface SurfaceResult {
  /** Lines per Component, sorted by Component. */
  counts: Record<string, number>;
  total: number;
  written: string[];
  removed: string[];
  drift: string[];
  /** checkCitations' problems (`--check` only). */
  citations: string[];
}

/** A second pass that printed different bytes. */
export class NondeterminismError extends Error {}

interface Line {
  component: string;
  fqcn: string;
  kind: SurfaceKind;
  member: string | null;
  text: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `conformance/api-surface/schema.json` under `root`. */
export function readSurfaceSchema(root: string): JsonObject {
  const file = join(root, API_SURFACE_SCHEMA);
  if (!existsSync(file)) {
    throw new Error(`${API_SURFACE_SCHEMA} is missing`);
  }
  const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!isObject(value) || !isObject(value["$defs"])) {
    throw new Error(`${API_SURFACE_SCHEMA} is not a JSON object with $defs`);
  }
  return value;
}

/** The errors of `value` against `schema.json#/$defs/<def>`. */
export function defErrors(value: unknown, def: "surface" | "parameter" | "addition" | "exception", schema: JsonObject): string[] {
  return schemaErrors(value, { $ref: `#/$defs/${def}` }, schema);
}

/** The FQCNs to reflect per repository: `declaredClasses`, split by the repository whose `src/` declares each. */
export function classLists(root: string): Map<UpstreamName, string[]> {
  const out = new Map<UpstreamName, string[]>(UPSTREAM_REPOS.map(({ name }) => [name, []]));
  for (const [fqcn, component] of declaredClasses(root)) {
    const repo = UPSTREAM_REPOS.find(({ name }) => name !== "framework" && name === component)?.name ?? "framework";
    out.get(repo)!.push(fqcn);
  }
  return out;
}

/** The PSR packages' versions and PSR-4 directories from `conformance/oracle/locks/framework/composer.lock` under `root`. */
export function psrPins(root: string): PsrPin[] {
  const file = join(root, FRAMEWORK_LOCK);
  if (!existsSync(file)) {
    throw new Error(`${FRAMEWORK_LOCK} is missing`);
  }
  const lock = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const packages = isObject(lock) ? [...(Array.isArray(lock["packages"]) ? lock["packages"] : []), ...(Array.isArray(lock["packages-dev"]) ? lock["packages-dev"] : [])] : [];
  return PSR_PACKAGES.map(({ package: name, prefix }) => {
    const entry = packages.find((candidate): candidate is JsonObject => isObject(candidate) && candidate["name"] === name);
    if (entry === undefined) {
      throw new Error(`${FRAMEWORK_LOCK} does not lock ${name}`);
    }
    const version = entry["version"];
    if (typeof version !== "string" || version === "") {
      throw new Error(`${FRAMEWORK_LOCK}: ${name} has no version`);
    }
    const autoload = entry["autoload"];
    const psr4 = isObject(autoload) && isObject(autoload["psr-4"]) ? autoload["psr-4"] : {};
    const prefixes = Object.keys(psr4);
    const dir = psr4[prefix];
    if (prefixes.length !== 1 || typeof dir !== "string") {
      throw new Error(`${FRAMEWORK_LOCK}: ${name}'s PSR-4 prefixes are ${prefixes.length === 0 ? "none" : prefixes.join(", ")}, expected only ${prefix}`);
    }
    const trimmed = dir.replace(/\/+$/, "");
    if (trimmed === "" || trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
      throw new Error(`${FRAMEWORK_LOCK}: ${name}'s PSR-4 directory ${JSON.stringify(dir)} is not a relative path inside the package`);
    }
    return { package: name, prefix, version, dir: trimmed };
  });
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

/**
 * The script's arguments for `pass`, with `upstream` the directory holding the four installs and `classes` the one
 * holding the class lists: a repository's pass reflects `<repo>.txt`; a PSR pass runs the interfaces mode against the
 * framework install's `vendor/<package>/<PSR-4 dir>`.
 */
function passArgs(pass: Pass, upstream: string, classes: string): string[] {
  if (pass.psr !== null) {
    const base = `${upstream}/framework/vendor`;
    return ["--interfaces", pass.psr.package, pass.psr.version, `${base}/autoload.php`, `${base}/${pass.psr.package}/${pass.psr.dir}`];
  }
  return [`${upstream}/${pass.repo}/vendor/autoload.php`, `${upstream}/${pass.repo}/src`, `${classes}/${pass.repo}.txt`];
}

/** One run of the PHP script for `pass`; `dir` holds `<repo>.txt`, each repository's class list. */
function runOnce(root: string, pass: Pass, dir: string, options: SurfaceOptions): string {
  const script = resolve(root, API_SURFACE_SCRIPT);
  if (options.local !== undefined) {
    const proc = Bun.spawnSync([options.php ?? "php", script, ...passArgs(pass, resolve(options.local), dir)], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    if (proc.exitCode !== 0) {
      throw new Error(`api-surface.php failed for ${pass.label} (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
    }
    return proc.stdout.toString();
  }
  const run = options.runner ?? runInImage;
  try {
    return run(
      options.image ?? oracleImage(root),
      [
        { host: script, container: IMAGE_SCRIPT },
        { host: dir, container: IMAGE_CLASSES },
      ],
      ["php", IMAGE_SCRIPT, ...passArgs(pass, IMAGE_UPSTREAM_DIR, IMAGE_CLASSES)],
    );
  } catch (error) {
    throw new Error(`api-surface.php failed for ${pass.label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** The line in its kind's key order (parameters in theirs), without the newline. */
function renderLine(kind: SurfaceKind, value: JsonObject): string {
  const ordered: JsonObject = {};
  for (const key of KEYS[kind]) {
    ordered[key] = key === "parameters" ? (value[key] as JsonObject[]).map((parameter) => Object.fromEntries(PARAMETER_KEYS.map((name) => [name, parameter[name]!]))) : value[key]!;
  }
  return renderJson(ordered);
}

/** Parses one pass into Component-assigned lines; throws naming the pass (repository or PSR package) and line. */
function parsePass(stdout: string, pass: Pass, components: ReadonlySet<string>, map: ReturnType<typeof readMap>, schema: JsonObject): Line[] {
  if (stdout !== "" && !stdout.endsWith("\n")) {
    throw new Error(`${pass.label}: api-surface.php output does not end with a newline`);
  }
  const lines = stdout === "" ? [] : stdout.slice(0, -1).split("\n");
  return lines.map((text, index) => {
    const at = `${pass.label} line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`${at}: not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isObject(value)) {
      throw new Error(`${at}: not a JSON object`);
    }
    let file: string | null = null;
    if (value["kind"] === "function" && pass.psr !== null) {
      const name = value["fqcn"];
      throw new Error(`${at}: a PSR pass exports interfaces only, not function ${typeof name === "string" ? name : renderJson(name ?? null)}`);
    }
    if (value["kind"] === "function") {
      if (typeof value["file"] !== "string") {
        throw new Error(`${at}: a function line needs its "file"`);
      }
      file = value["file"];
      delete value["file"];
    }
    const errors = defErrors(value, "surface", schema);
    if (errors.length > 0) {
      throw new Error(`${at}: fails the surface schema: ${errors.join("; ")}`);
    }
    const kind = value["kind"] as SurfaceKind;
    const fqcn = value["fqcn"] as string;
    if (pass.psr !== null && !fqcn.startsWith(pass.psr.prefix)) {
      throw new Error(`${at}: ${fqcn} is not in ${pass.psr.package}'s namespace ${pass.psr.prefix}`);
    }
    let component: string | null;
    if (file === null) {
      component = componentForFqcn(map, fqcn);
      if (component === null) {
        throw new Error(`${at}: ${fqcn} has no Component in conformance/component-map`);
      }
    } else if (pass.repo === "framework") {
      const dir = /^Illuminate\/([^/]+)\//.exec(file);
      if (dir === null) {
        throw new Error(`${at}: function ${fqcn} is in ${file}, not under src/Illuminate/<Dir>/`);
      }
      component = kebab(dir[1]!);
    } else {
      component = pass.repo!;
    }
    if (!components.has(component)) {
      throw new Error(`${at}: ${fqcn}'s Component ${component} is not in conformance/component-map`);
    }
    return { component, fqcn, kind, member: value["member"] as string | null, text: renderLine(kind, value) };
  });
}

function compareLines(a: Line, b: Line): number {
  return compareUnits(a.fqcn, b.fqcn) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || compareUnits(a.member ?? "", b.member ?? "") || compareUnits(a.kind, b.kind);
}

/**
 * The file text per Component (Components sorted), from two passes per repository and then per PSR package. Throws
 * NondeterminismError when a source's passes differ, and an Error on an unowned FQCN, an unknown Component, a bad or
 * duplicate line, or a PSR package the framework lock does not pin as expected.
 */
export function buildSurface(root: string, options: SurfaceOptions = {}): Map<string, string> {
  const script = resolve(root, API_SURFACE_SCRIPT);
  if (!existsSync(script)) {
    throw new Error(`${API_SURFACE_SCRIPT} is missing`);
  }
  for (const { name } of UPSTREAM_REPOS) {
    if (!existsSync(upstreamPath(root, name, "src"))) {
      throw new Error(`${UPSTREAM_DIR}/${name}/src is missing; run bun run upstream:sync`);
    }
  }
  if (options.local !== undefined) {
    const local = resolve(options.local);
    for (const { name } of UPSTREAM_REPOS) {
      if (!existsSync(join(local, name, "vendor", "autoload.php"))) {
        throw new Error(`--local ${local}/${name} has no vendor/autoload.php; it must be a locked install of the ${name} snapshot`);
      }
      checkLocalCopy(upstreamPath(root, name, "."), join(local, name), name);
    }
  }
  const pins = psrPins(root);
  const schema = readSurfaceSchema(root);
  const map = readMap(root);
  const components = new Set(map.records.map((record) => record.component));
  const lists = classLists(root);
  const lines: Line[] = [];
  const dir = mkdtempSync(join(tmpdir(), "xaravel-api-surface-"));
  try {
    for (const { name } of UPSTREAM_REPOS) {
      writeFileSync(join(dir, `${name}.txt`), lists.get(name)!.map((fqcn) => `${fqcn}\n`).join(""));
      chmodSync(join(dir, `${name}.txt`), 0o644);
    }
    // The image runs as an unprivileged user, which must read the mounted lists.
    chmodSync(dir, 0o755);
    const passes: Pass[] = [...UPSTREAM_REPOS.map(({ name }): Pass => ({ label: name, repo: name, psr: null })), ...pins.map((pin): Pass => ({ label: pin.package, repo: null, psr: pin }))];
    for (const pass of passes) {
      const first = runOnce(root, pass, dir, options);
      const second = runOnce(root, pass, dir, options);
      if (first !== second) {
        throw new NondeterminismError(`api surface not deterministic: ${pass.label} (first difference at line ${firstDifference(first, second)})`);
      }
      lines.push(...parsePass(first, pass, components, map, schema));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  lines.sort(compareLines);
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.fqcn}\0${line.kind}\0${line.member ?? ""}`;
    if (seen.has(key)) {
      throw new Error(`${line.fqcn} (${line.kind}${line.member === null ? "" : ` ${line.member}`}) is exported twice`);
    }
    seen.add(key);
    const group = groups.get(line.component) ?? [];
    group.push(`${line.text}\n`);
    groups.set(line.component, group);
  }
  return new Map([...groups.keys()].sort(compareUnits).map((component) => [component, groups.get(component)!.join("")]));
}

// ---------------------------------------------------------------------------
// Citation files

/** The problems of one citation file's text (`file` names it in each problem). */
export function citationProblems(text: string, file: string, def: "addition" | "exception", schema: JsonObject): string[] {
  const problems: string[] = [];
  if (text !== "" && !text.endsWith("\n")) {
    problems.push(`${file}: the file must end with a newline`);
  }
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  let previous: string[] | null = null;
  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      problems.push(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const errors = defErrors(value, def, schema);
    if (errors.length > 0) {
      problems.push(`${at}: ${errors.join("; ")}`);
      return;
    }
    const record = value as JsonObject;
    const canonical = renderJson(Object.fromEntries(CITATION_KEYS.map((key) => [key, record[key]!])) as Json);
    if (canonical !== line) {
      problems.push(`${at}: the line is not in canonical form (compact JSON, keys component, fqcn, member, citation); expected ${canonical}`);
    }
    const key = [record["component"] as string, record["fqcn"] as string, (record["member"] as string | null) ?? ""];
    if (previous !== null) {
      const order = compareUnits(previous[0]!, key[0]!) || compareUnits(previous[1]!, key[1]!) || compareUnits(previous[2]!, key[2]!);
      if (order === 0) {
        problems.push(`${at}: duplicates the line before it (${key.join(" ").trim()})`);
      } else if (order > 0) {
        problems.push(`${at}: not sorted (by component, fqcn, member)`);
      }
    }
    previous = key;
  });
  return problems;
}

/** The problems of `conformance/api-surface/additions.jsonl` and `exceptions.jsonl` under `root`; empty when both pass. */
export function checkCitations(root: string): string[] {
  const schema = readSurfaceSchema(root);
  const problems: string[] = [];
  for (const [def, name] of [
    ["addition", CITATION_FILES.additions],
    ["exception", CITATION_FILES.exceptions],
  ] as const) {
    const file = `${API_SURFACE_DIR}/${name}`;
    if (!existsSync(join(root, file))) {
      problems.push(`${file} is missing`);
      continue;
    }
    problems.push(...citationProblems(readFileSync(join(root, file), "utf8"), file, def, schema));
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Export

/** Writes (or with `check`, compares) `conformance/api-surface/<component>.jsonl` under `root`. */
export function exportSurface(root: string, options: SurfaceOptions = {}): SurfaceResult {
  const files = buildSurface(root, options);
  const result: SurfaceResult = { counts: {}, total: 0, written: [], removed: [], drift: [], citations: [] };
  const dir = join(root, API_SURFACE_DIR);
  const kept: string[] = Object.values(CITATION_FILES);
  const stray = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl") && !kept.includes(name) && !files.has(name.slice(0, -".jsonl".length)))
        .sort(compareUnits)
    : [];
  for (const [component, text] of files) {
    if (kept.includes(`${component}.jsonl`)) {
      throw new Error(`Component ${component} would overwrite ${API_SURFACE_DIR}/${component}.jsonl`);
    }
    const count = text.split("\n").length - 1;
    result.counts[component] = count;
    result.total += count;
    result.written.push(`${API_SURFACE_DIR}/${component}.jsonl`);
  }
  if (options.check === true) {
    for (const [component, text] of files) {
      const name = `${API_SURFACE_DIR}/${component}.jsonl`;
      const file = join(root, name);
      if (!existsSync(file)) {
        result.drift.push(`api surface drift: ${name} is missing`);
      } else {
        const committed = readFileSync(file, "utf8");
        if (committed !== text) {
          result.drift.push(`api surface drift: ${name} differs from the exported surface (first difference at line ${firstDifference(committed, text)})`);
        }
      }
    }
    for (const name of stray) {
      result.drift.push(`api surface drift: ${API_SURFACE_DIR}/${name} is not generated`);
    }
    result.citations = checkCitations(root);
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
    result.removed.push(`${API_SURFACE_DIR}/${name}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

export class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/oracle/api-surface.ts [--check] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]"].join("\n");

export function parseOptions(argv: readonly string[]): { root: string } & SurfaceOptions {
  const options: { root: string } & SurfaceOptions = { root: resolve(import.meta.dir, "..", "..") };
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

/** What `main` reads from its surroundings: in tests, a stand-in image runner. */
export interface MainDeps {
  runner?: ImageRunner;
}

export function main(argv: readonly string[], deps: MainDeps = {}): number {
  try {
    const { root, ...options } = parseOptions(argv);
    if (deps.runner !== undefined) {
      options.runner = deps.runner;
    }
    const result = exportSurface(root, options);
    const files = result.written.length;
    if (options.check === true) {
      const problems = [...result.drift, ...result.citations];
      process.stderr.write(problems.map((line) => `${line}\n`).join(""));
      if (problems.length > 0) {
        process.stderr.write(`API surface check failed: ${result.drift.length} file(s) drifted, ${result.citations.length} citation problem(s).\n`);
        return 1;
      }
      process.stdout.write(`API surface check OK: ${result.total} lines in ${files} files are byte-identical; the citation files are valid.\n`);
      return 0;
    }
    const lines = Object.entries(result.counts).map(([component, count]) => `${component}: ${count} lines`);
    lines.push(...result.removed.map((file) => `removed ${file}`));
    lines.push(`API surface: ${result.total} lines in ${files} files.`);
    process.stdout.write(lines.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    if (error instanceof NondeterminismError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    process.stderr.write(`API surface export failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
