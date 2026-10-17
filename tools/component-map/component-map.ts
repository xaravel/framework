// The test-directory → Component map (Story 2.3, FR-1, AD-16).
//
//   bun tools/component-map/component-map.ts check [--root <dir>]
//       validates `conformance/component-map` against the Upstream snapshot:
//       every test file the runners select maps to exactly one Component,
//       every class, interface, trait and enum the snapshot declares resolves
//       to its own Component, and the container aliases match what
//       `Application::registerCoreContainerAliases` and the service providers
//       declare. Prints per-repository counts.
//
// The map holds one JSON record per Component:
//
//   {"component","tests":[{"path","tags":[]}],"namespaces":[],"classes":[],"aliases":[]}
//
// Records are sorted by `component` and every array is sorted; `#` comment
// lines are ignored. A test path is relative to `conformance/upstream/` and is
// an exact file, a directory prefix ending in `/` or a name prefix ending in
// `*`. A file belongs to its most specific matching entry: an exact file
// first, then the longest prefix.
//
// The map is hand-signed data: this tool only reads it. It reads Upstream
// source only from the snapshot and never fetches.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { kebab, readTable } from "../scaffold/table";
import { UPSTREAM_DIR, UPSTREAM_REPOS, type UpstreamName, upstreamPath } from "../upstream/upstream";

export const COMPONENT_MAP_FILE = "conformance/component-map";
const PACKAGES_FILE = "tools/scaffold/packages.jsonl";

export interface TestEntry {
  path: string;
  tags: string[];
}

export interface MapRecord {
  component: string;
  tests: TestEntry[];
  namespaces: string[];
  classes: string[];
  aliases: string[];
  /** The 1-based line of the record in the map file. */
  line: number;
}

export interface ComponentMap {
  records: MapRecord[];
}

export interface TestOwner {
  component: string;
  tags: string[];
}

export interface MapCheckResult {
  /** Test files per Upstream repository, in pin order. */
  counts: Record<string, number>;
  problems: string[];
}

/** The Components every map must hold besides one per `src/Illuminate/<Dir>`. */
const PACKAGE_COMPONENTS: readonly UpstreamName[] = ["ai", "mcp", "boost"];
const RECORD_KEYS = ["component", "tests", "namespaces", "classes", "aliases"];
const TAG = /^deferred:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_SUFFIX = "Test.php";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function strictlySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1]!, value) < 0);
}

// ---------------------------------------------------------------------------
// Parsing

function validPath(path: string): string | null {
  if (!UPSTREAM_REPOS.some((repo) => path.startsWith(`${repo.name}/`))) {
    return `must start with one of ${UPSTREAM_REPOS.map((repo) => `${repo.name}/`).join(", ")}`;
  }
  const body = path.endsWith("*") ? path.slice(0, -1) : path;
  if (body.includes("*")) {
    return "may hold `*` only as its last character";
  }
  if (path.includes("\\") || path.includes("//") || path.split("/").some((part) => part === "." || part === "..")) {
    return "must be a normalised forward-slash path";
  }
  return null;
}

/**
 * Parses the map text; throws `conformance/component-map:<line>: …` on
 * anything malformed. With `components` it also rejects a Component that is
 * not one of them.
 */
export function parseMap(text: string, components: readonly string[] | null = null): ComponentMap {
  if (text.includes("\r")) {
    const line = text.slice(0, text.indexOf("\r")).split("\n").length;
    throw new Error(`${COMPONENT_MAP_FILE}:${line}: line endings must be LF`);
  }
  if (text !== "" && !text.endsWith("\n")) {
    throw new Error(`${COMPONENT_MAP_FILE}: the file must end with a newline`);
  }
  const lines = text.split("\n");
  lines.pop();
  const records: MapRecord[] = [];
  lines.forEach((raw, index) => {
    const line = index + 1;
    const at = `${COMPONENT_MAP_FILE}:${line}`;
    if (raw.startsWith("#")) {
      return;
    }
    if (raw.trim() === "") {
      throw new Error(`${at}: blank line; the map holds one record per line`);
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isObject(data)) {
      throw new Error(`${at}: a record must be a JSON object`);
    }
    const keys = Object.keys(data);
    if (keys.length !== RECORD_KEYS.length || RECORD_KEYS.some((key, i) => keys[i] !== key)) {
      throw new Error(`${at}: a record has exactly the keys ${RECORD_KEYS.join(", ")}, in that order; got ${keys.join(", ")}`);
    }
    const component = data["component"];
    if (typeof component !== "string") {
      throw new Error(`${at}: component must be a string`);
    }
    if (components !== null && !components.includes(component)) {
      throw new Error(`${at}: unknown Component ${JSON.stringify(component)}; it must be a name in ${PACKAGES_FILE}`);
    }
    const tests = data["tests"];
    if (!Array.isArray(tests)) {
      throw new Error(`${at}: ${component} tests must be an array`);
    }
    const entries: TestEntry[] = [];
    for (const entry of tests) {
      if (!isObject(entry) || Object.keys(entry).join(",") !== "path,tags" || typeof entry["path"] !== "string" || !isStringArray(entry["tags"])) {
        throw new Error(`${at}: ${component} has a test entry that is not {"path","tags":[]}: ${JSON.stringify(entry)}`);
      }
      const path = entry["path"];
      const tags = entry["tags"];
      const bad = validPath(path);
      if (bad !== null) {
        throw new Error(`${at}: ${component} test path ${JSON.stringify(path)} ${bad}`);
      }
      for (const tag of tags) {
        if (!TAG.test(tag)) {
          throw new Error(`${at}: ${component} test path ${path} has bad tag ${JSON.stringify(tag)}; a tag is deferred:<item>, <item> kebab-case`);
        }
      }
      if (!strictlySorted(tags)) {
        throw new Error(`${at}: ${component} test path ${path} tags are not sorted and unique`);
      }
      entries.push({ path, tags: [...tags] });
    }
    if (!entries.every((entry, i) => i === 0 || compare(entries[i - 1]!.path, entry.path) < 0)) {
      throw new Error(`${at}: ${component} tests are not sorted and unique by path`);
    }
    const arrays: Record<string, string[]> = {};
    for (const key of ["namespaces", "classes", "aliases"]) {
      const value = data[key];
      if (!isStringArray(value)) {
        throw new Error(`${at}: ${component} ${key} must be an array of strings`);
      }
      if (!strictlySorted(value)) {
        throw new Error(`${at}: ${component} ${key} are not sorted and unique`);
      }
      arrays[key] = [...value];
    }
    for (const ns of arrays["namespaces"]!) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*\\$/.test(ns)) {
        throw new Error(`${at}: ${component} namespace ${JSON.stringify(ns)} must be a PHP namespace ending in \\`);
      }
    }
    for (const fqcn of arrays["classes"]!) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)+$/.test(fqcn)) {
        throw new Error(`${at}: ${component} class ${JSON.stringify(fqcn)} must be a namespaced PHP FQCN with no leading \\`);
      }
    }
    const previous = records.at(-1);
    if (previous !== undefined && compare(previous.component, component) >= 0) {
      throw new Error(`${at}: records are not sorted by component: ${component} follows ${previous.component}`);
    }
    records.push({ component, tests: entries, namespaces: arrays["namespaces"]!, classes: arrays["classes"]!, aliases: arrays["aliases"]!, line });
  });
  return { records };
}

/** The `name` column of `tools/scaffold/packages.jsonl`. */
function componentNames(root: string): string[] {
  const file = join(root, PACKAGES_FILE);
  if (!existsSync(file)) {
    throw new Error(`${PACKAGES_FILE} does not exist`);
  }
  return readTable(file).map((row) => row.name);
}

/** Reads and parses `<root>/conformance/component-map`, checking each Component against the package table. */
export function readMap(root: string): ComponentMap {
  const file = join(root, COMPONENT_MAP_FILE);
  if (!existsSync(file)) {
    throw new Error(`${COMPONENT_MAP_FILE} does not exist`);
  }
  return parseMap(readFileSync(file, "utf8"), componentNames(root));
}

// ---------------------------------------------------------------------------
// Lookups

type MatchKind = "file" | "prefix";

/** An entry's match key: the exact path, or the prefix without its trailing `*`. */
function entryKey(path: string): { kind: MatchKind; key: string } {
  if (path.endsWith("*")) {
    return { kind: "prefix", key: path.slice(0, -1) };
  }
  return { kind: path.endsWith("/") ? "prefix" : "file", key: path };
}

function entryMatches(path: string, file: string): boolean {
  const { kind, key } = entryKey(path);
  return kind === "file" ? file === key : file.startsWith(key);
}

interface Located {
  component: string;
  entry: TestEntry;
}

/** The entries of the most specific match for `file`: exact first, then the longest prefix; empty when unmapped. */
function mostSpecific(map: ComponentMap, file: string): Located[] {
  let best: Located[] = [];
  let bestRank = -1;
  for (const record of map.records) {
    for (const entry of record.tests) {
      if (!entryMatches(entry.path, file)) {
        continue;
      }
      const { kind, key } = entryKey(entry.path);
      const rank = kind === "file" ? Number.MAX_SAFE_INTEGER : key.length;
      if (rank > bestRank) {
        best = [{ component: record.component, entry }];
        bestRank = rank;
      } else if (rank === bestRank) {
        best.push({ component: record.component, entry });
      }
    }
  }
  return best;
}

/**
 * The Component and tags of an Upstream test file (`framework/tests/…`), or
 * null when no entry matches. A doubly mapped file (a check failure) answers
 * with the first Component in map order.
 */
export function componentForTest(map: ComponentMap, path: string): TestOwner | null {
  const found = mostSpecific(map, path)[0];
  return found === undefined ? null : { component: found.component, tags: [...found.entry.tags] };
}

/** The Component owning `fqcn`: an exact class first, then the longest namespace prefix; null when none does. */
export function componentForFqcn(map: ComponentMap, fqcn: string): string | null {
  const name = fqcn.replace(/^\\/, "");
  for (const record of map.records) {
    if (record.classes.includes(name)) {
      return record.component;
    }
  }
  let owner: string | null = null;
  let length = -1;
  for (const record of map.records) {
    for (const ns of record.namespaces) {
      if (name.startsWith(ns) && ns.length > length) {
        owner = record.component;
        length = ns.length;
      }
    }
  }
  return owner;
}

/** The Component owning container alias `alias`, or null when none does. */
export function componentForAlias(map: ComponentMap, alias: string): string | null {
  return map.records.find((record) => record.aliases.includes(alias))?.component ?? null;
}

// ---------------------------------------------------------------------------
// Test files

function walkFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
}

function decodeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`).exec(attrs);
  return match === null ? null : decodeXml(match[2]!);
}

/** `./tests/Unit/` → `tests/Unit`. */
function normaliseRel(rel: string): string {
  return decodeXml(rel.trim())
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+$/, "");
}

/**
 * The test files the repository's `phpunit.xml.dist` testsuites select (Pest
 * reads the same file): every `<directory>` with its suffix (default
 * `Test.php`) and prefix, and every `<file>`, minus each `<exclude>`. Paths
 * are relative to `conformance/upstream/` (`framework/tests/…`), sorted.
 */
export function testFiles(root: string, name: string): string[] {
  const base = upstreamPath(root, name, ".");
  const configPath = join(base, "phpunit.xml.dist");
  if (!existsSync(configPath)) {
    throw new Error(`${UPSTREAM_DIR}/${name}/phpunit.xml.dist does not exist`);
  }
  const xml = readFileSync(configPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const suites = /<testsuites\b[^>]*>([\s\S]*?)<\/testsuites>/.exec(xml)?.[1];
  if (suites === undefined) {
    throw new Error(`${UPSTREAM_DIR}/${name}/phpunit.xml.dist has no <testsuites>`);
  }
  const selected = new Set<string>();
  const excluded: string[] = [];
  for (const match of suites.matchAll(/<(directory|file|exclude)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs, body] = match as unknown as [string, string, string, string];
    const rel = normaliseRel(body);
    if (tag === "exclude") {
      excluded.push(rel);
      continue;
    }
    const path = upstreamPath(root, name, rel);
    if (!existsSync(path)) {
      throw new Error(`${UPSTREAM_DIR}/${name}/phpunit.xml.dist selects ${rel}, which does not exist`);
    }
    if (tag === "file") {
      selected.add(rel);
      continue;
    }
    const suffix = attribute(attrs, "suffix") ?? DEFAULT_SUFFIX;
    const prefix = attribute(attrs, "prefix") ?? "";
    const files: string[] = [];
    walkFiles(path, files);
    for (const file of files) {
      const fileName = file.slice(file.lastIndexOf("/") + 1);
      if (fileName.endsWith(suffix) && fileName.startsWith(prefix)) {
        selected.add(file.slice(base.length + 1));
      }
    }
  }
  return [...selected]
    .filter((rel) => !excluded.some((ex) => rel === ex || rel.startsWith(`${ex}/`)))
    .map((rel) => `${name}/${rel}`)
    .sort(compare);
}

// ---------------------------------------------------------------------------
// FQCN derivation

interface Composer {
  autoload?: { "psr-4"?: Record<string, string | string[]> };
}

function readComposer(path: string): Composer | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Composer) : null;
}

/** The directories under the framework's `src/Illuminate/`, sorted. */
function illuminateDirs(root: string): string[] {
  const illuminate = upstreamPath(root, "framework", "src/Illuminate");
  if (!existsSync(illuminate)) {
    throw new Error(`${UPSTREAM_DIR}/framework/src/Illuminate does not exist`);
  }
  return readdirSync(illuminate, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compare);
}

/** Each scanned source tree: its absolute path and its Component. */
function sourceTrees(root: string): { dir: string; component: string }[] {
  const trees = illuminateDirs(root).map((dir) => ({ dir: upstreamPath(root, "framework", `src/Illuminate/${dir}`), component: kebab(dir) }));
  for (const name of PACKAGE_COMPONENTS) {
    trees.push({ dir: upstreamPath(root, name, "src"), component: name });
  }
  return trees;
}

const DECLARATION = /^[ \t]*(?:(?:abstract|final|readonly)[ \t]+)*(?:class|interface|trait|enum)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/;
const NAMESPACE = /^[ \t]*namespace[ \t]+([A-Za-z_][A-Za-z0-9_\\]*)[ \t]*[;{]/;

/** The FQCNs of the classes, interfaces, traits and enums that `text` declares. */
function declarationsIn(text: string): string[] {
  const out: string[] = [];
  let ns = "";
  for (const line of text.split("\n")) {
    const nsMatch = NAMESPACE.exec(line);
    if (nsMatch !== null) {
      ns = nsMatch[1]!;
      continue;
    }
    const decl = DECLARATION.exec(line);
    if (decl !== null) {
      out.push(ns === "" ? decl[1]! : `${ns}\\${decl[1]!}`);
    }
  }
  return out;
}

/**
 * Every class, interface, trait and enum declared in the PHP files (not Blade
 * templates) of `framework/src/Illuminate/<Dir>/**` and `{ai,mcp,boost}/src/**`, mapped to
 * the Component whose directory declares it, in FQCN order. A FQCN declared
 * by two Components maps to the first; `check` reports it.
 */
export function declaredClasses(root: string): Map<string, string> {
  return scanDeclarations(root).classes;
}

function scanDeclarations(root: string): { classes: Map<string, string>; conflicts: string[] } {
  const found = new Map<string, string>();
  const conflicts: string[] = [];
  for (const tree of sourceTrees(root)) {
    if (!existsSync(tree.dir)) {
      continue;
    }
    const files: string[] = [];
    walkFiles(tree.dir, files);
    // A Blade template is a view, not PHP source, even when it shows a class in a snippet.
    for (const file of files.filter((path) => path.endsWith(".php") && !path.endsWith(".blade.php")).sort(compare)) {
      for (const fqcn of declarationsIn(readFileSync(file, "utf8"))) {
        const owner = found.get(fqcn);
        if (owner === undefined) {
          found.set(fqcn, tree.component);
        } else if (owner !== tree.component) {
          conflicts.push(`fqcn drift: ${fqcn} is declared by both ${owner} and ${tree.component}`);
        }
      }
    }
  }
  return { classes: new Map([...found].sort((a, b) => compare(a[0], b[0]))), conflicts };
}

/**
 * The namespaces and classes each Component must record. A Component owns its
 * composer.json PSR-4 prefixes (Foundation, which has none, owns
 * `Illuminate\Foundation\`). A prefix that several Components share goes to the
 * Component whose directory the namespace names; the others list every
 * declaration of their own.
 */
function expectedOwnership(root: string, classes: ReadonlyMap<string, string>): { namespaces: Map<string, string[]>; classes: Map<string, string[]>; problems: string[] } {
  const problems: string[] = [];
  const claims = new Map<string, string[]>();
  const claim = (ns: string, component: string): void => {
    const list = claims.get(ns) ?? [];
    if (!list.includes(component)) {
      list.push(component);
    }
    claims.set(ns, list);
  };
  for (const dir of illuminateDirs(root)) {
    const composer = readComposer(upstreamPath(root, "framework", `src/Illuminate/${dir}/composer.json`));
    const prefixes = Object.keys(composer?.autoload?.["psr-4"] ?? {});
    for (const ns of prefixes.length > 0 ? prefixes : [`Illuminate\\${dir}\\`]) {
      claim(ns, kebab(dir));
    }
  }
  for (const name of PACKAGE_COMPONENTS) {
    const composer = readComposer(upstreamPath(root, name, "composer.json"));
    for (const ns of Object.keys(composer?.autoload?.["psr-4"] ?? {})) {
      claim(ns, name);
    }
  }
  const namespaces = new Map<string, string[]>();
  const listed = new Map<string, string[]>();
  for (const [ns, owners] of claims) {
    let owner: string | undefined = owners[0];
    if (owners.length > 1) {
      const named = kebab(ns.replace(/\\$/, "").split("\\").at(-1)!);
      owner = owners.find((component) => component === named);
      if (owner === undefined) {
        problems.push(`fqcn drift: namespace ${ns} is shared by ${owners.join(", ")} and names none of them`);
      }
      for (const other of owners.filter((component) => component !== owner)) {
        const own = [...classes].filter(([, component]) => component === other).map(([fqcn]) => fqcn);
        listed.set(other, [...(listed.get(other) ?? []), ...own].sort(compare));
      }
    }
    if (owner !== undefined) {
      namespaces.set(owner, [...(namespaces.get(owner) ?? []), ns].sort(compare));
    }
  }
  return { namespaces, classes: listed, problems };
}

function checkFqcns(root: string, map: ComponentMap): string[] {
  const { classes, conflicts } = scanDeclarations(root);
  const expected = expectedOwnership(root, classes);
  const problems = [...conflicts, ...expected.problems];
  for (const field of ["namespaces", "classes"] as const) {
    const seen = new Map<string, string>();
    for (const record of map.records) {
      for (const value of record[field]) {
        const first = seen.get(value);
        if (first !== undefined) {
          problems.push(`fqcn drift: ${field === "namespaces" ? "namespace" : "class"} ${value} appears twice (${first}, ${record.component})`);
        } else {
          seen.set(value, record.component);
        }
      }
    }
  }
  for (const record of map.records) {
    const wantNs = expected.namespaces.get(record.component) ?? [];
    for (const ns of record.namespaces.filter((value) => !wantNs.includes(value))) {
      problems.push(`fqcn drift: namespace ${ns} is listed under ${record.component}, but its composer.json PSR-4 owner is ${owners(expected.namespaces, ns)}`);
    }
    const wantClasses = new Set(expected.classes.get(record.component) ?? []);
    for (const fqcn of record.classes.filter((value) => !wantClasses.has(value))) {
      const declared = classes.get(fqcn);
      problems.push(
        declared === undefined
          ? `fqcn drift: class ${fqcn} is listed under ${record.component}, but the snapshot does not declare it`
          : `fqcn drift: class ${fqcn} is listed under ${record.component}, but ${declared} owns it by namespace; remove it`,
      );
    }
  }
  for (const [component, list] of expected.namespaces) {
    const record = map.records.find((candidate) => candidate.component === component);
    for (const ns of list.filter((value) => record === undefined || !record.namespaces.includes(value))) {
      problems.push(`fqcn drift: namespace ${ns} is owned by ${componentOrNone(map, ns)} in the map, expected ${component}`);
    }
  }
  for (const [fqcn, component] of classes) {
    const owner = componentForFqcn(map, fqcn);
    if (owner !== component) {
      problems.push(`fqcn drift: ${fqcn} is owned by ${owner ?? "no Component"}, expected ${component}`);
    }
  }
  return problems;
}

function owners(namespaces: ReadonlyMap<string, string[]>, ns: string): string {
  for (const [component, list] of namespaces) {
    if (list.includes(ns)) {
      return component;
    }
  }
  return "no Component";
}

function componentOrNone(map: ComponentMap, ns: string): string {
  return map.records.find((record) => record.namespaces.includes(ns))?.component ?? "no Component";
}

// ---------------------------------------------------------------------------
// Alias derivation

export interface AliasDerivation {
  /** Each alias and the Component that owns it, in alias order. */
  aliases: Map<string, string>;
  /** Keys bound by two Components' providers, and core keys whose owner cannot be derived. */
  problems: string[];
}

const BINDING = /->\s*(?:singleton|bind|scoped|instance)(?:If)?\s*\(\s*(?:'([^'\\]+)'|"([^"\\$]+)")/g;

/** The keys and first FQCN of each entry of `Application::registerCoreContainerAliases`. */
function coreAliases(root: string): { key: string; first: string }[] {
  const path = upstreamPath(root, "framework", "src/Illuminate/Foundation/Application.php");
  if (!existsSync(path)) {
    throw new Error(`${UPSTREAM_DIR}/framework/src/Illuminate/Foundation/Application.php does not exist`);
  }
  const text = readFileSync(path, "utf8");
  const body = /function\s+registerCoreContainerAliases\s*\([^)]*\)\s*\{([\s\S]*?)\]\s*as\s+\$key\s*=>/.exec(text)?.[1];
  if (body === undefined) {
    throw new Error("Application.php has no registerCoreContainerAliases table");
  }
  const out: { key: string; first: string }[] = [];
  for (const match of body.matchAll(/'([^']+)'\s*=>\s*\[\s*([^,\]\s]+)/g)) {
    const first = match[2]!.replace(/::class$/, "").replace(/^\\/, "");
    out.push({ key: match[1]!, first: first === "self" || first === "static" ? "Illuminate\\Foundation\\Application" : first });
  }
  if (out.length === 0) {
    throw new Error("Application.php registerCoreContainerAliases lists no aliases");
  }
  return out;
}

/** The string-literal keys each Component's `*ServiceProvider.php` files bind. */
function providerBindings(root: string): Map<string, Set<string>> {
  const bound = new Map<string, Set<string>>();
  for (const tree of sourceTrees(root)) {
    if (!existsSync(tree.dir)) {
      continue;
    }
    const files: string[] = [];
    walkFiles(tree.dir, files);
    for (const file of files.filter((path) => path.endsWith("ServiceProvider.php")).sort(compare)) {
      for (const match of readFileSync(file, "utf8").matchAll(BINDING)) {
        const key = match[1] ?? match[2]!;
        const set = bound.get(key) ?? new Set<string>();
        set.add(tree.component);
        bound.set(key, set);
      }
    }
  }
  return bound;
}

/**
 * The container aliases and their owners: the keys of
 * `Application::registerCoreContainerAliases` plus every string-literal key
 * that a `*ServiceProvider.php` binds with singleton, bind, scoped or instance
 * (or their `If` forms). A key a provider binds belongs to that provider's
 * Component; a core key no provider binds belongs to the owner of its first
 * listed FQCN.
 */
export function expectedAliases(root: string): AliasDerivation {
  const problems: string[] = [];
  const aliases = new Map<string, string>();
  const bound = providerBindings(root);
  for (const [key, components] of bound) {
    const list = [...components].sort(compare);
    if (list.length > 1) {
      problems.push(`alias drift: ${key} is bound by providers of ${list.join(" and ")}`);
    }
    aliases.set(key, list[0]!);
  }
  const classes = declaredClasses(root);
  for (const { key, first } of coreAliases(root)) {
    if (aliases.has(key)) {
      continue;
    }
    const owner = classes.get(first);
    if (owner === undefined) {
      problems.push(`alias drift: core alias ${key} is bound by no provider and its first FQCN ${first} is not declared in the snapshot`);
      continue;
    }
    aliases.set(key, owner);
  }
  return { aliases: new Map([...aliases].sort((a, b) => compare(a[0], b[0]))), problems };
}

function checkAliases(root: string, map: ComponentMap): string[] {
  const derived = expectedAliases(root);
  const problems = [...derived.problems];
  const actual = new Map<string, string>();
  for (const record of map.records) {
    for (const alias of record.aliases) {
      const first = actual.get(alias);
      if (first !== undefined) {
        problems.push(`alias drift: ${alias} appears twice (${first}, ${record.component})`);
      } else {
        actual.set(alias, record.component);
      }
    }
  }
  const keys = [...new Set([...derived.aliases.keys(), ...actual.keys()])].sort(compare);
  for (const key of keys) {
    const want = derived.aliases.get(key);
    const have = actual.get(key);
    if (want !== have) {
      problems.push(`alias drift: ${key} expected ${want ?? "no Component (not an alias)"}, map has ${have ?? "no Component"}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Check

function checkTests(map: ComponentMap, files: readonly string[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const found = mostSpecific(map, file);
    if (found.length === 0) {
      problems.push(`unmapped: ${file}`);
      continue;
    }
    if (found.length > 1) {
      problems.push(`doubly mapped: ${file} (${found.map((located) => located.component).join(", ")})`);
    }
    // ai, mcp and boost own their whole tests/.
    const repo = PACKAGE_COMPONENTS.find((name) => file.startsWith(`${name}/`));
    if (repo !== undefined && found.some((located) => located.component !== repo)) {
      problems.push(`repo ownership: ${file} resolves to ${found.map((located) => located.component).join(", ")}, but every ${repo} test belongs to ${repo}`);
    }
  }
  const all: Located[] = map.records.flatMap((record) => record.tests.map((entry) => ({ component: record.component, entry })));
  for (const located of all) {
    const { entry, component } = located;
    if (!files.some((file) => entryMatches(entry.path, file))) {
      problems.push(`stale: ${entry.path} (${component}) matches no test file`);
      continue;
    }
    // The entry it overrides: the most specific other entry covering this entry's own path.
    const { kind, key } = entryKey(entry.path);
    let overridden: Located | null = null;
    let rank = -1;
    for (const other of all) {
      const target = entryKey(other.entry.path);
      if (other === located || target.kind !== "prefix" || !key.startsWith(target.key)) {
        continue;
      }
      if (kind === "prefix" && target.key.length >= key.length) {
        continue;
      }
      if (target.key.length > rank) {
        overridden = other;
        rank = target.key.length;
      }
    }
    if (overridden !== null && overridden.component === component && overridden.entry.tags.join(",") === entry.tags.join(",")) {
      problems.push(`redundant: ${entry.path} (${component}) overrides ${overridden.entry.path} with the same Component and tags`);
    }
  }
  return problems;
}

/**
 * Validates the map against the snapshot; never fetches. Throws when the
 * snapshot is missing or unreadable (a repository directory, a
 * `phpunit.xml.dist` or a path it selects, `src/Illuminate`, or the core alias
 * table); otherwise returns the counts and every map problem.
 */
export function check(root: string): MapCheckResult {
  const counts: Record<string, number> = {};
  let map: ComponentMap;
  try {
    map = readMap(root);
  } catch (error) {
    return { counts, problems: [error instanceof Error ? error.message : String(error)] };
  }
  const files: string[] = [];
  for (const { name } of UPSTREAM_REPOS) {
    const list = testFiles(root, name);
    counts[name] = list.length;
    files.push(...list);
  }
  const problems: string[] = [];
  const required = [...illuminateDirs(root).map(kebab), ...PACKAGE_COMPONENTS].sort(compare);
  for (const component of required) {
    if (!map.records.some((record) => record.component === component)) {
      problems.push(`${COMPONENT_MAP_FILE}: no record for Upstream Component ${component}`);
    }
  }
  for (const record of map.records.filter((candidate) => !required.includes(candidate.component))) {
    problems.push(`${COMPONENT_MAP_FILE}: ${record.component} is not an Upstream Component`);
  }
  problems.push(...checkTests(map, files), ...checkFqcns(root, map), ...checkAliases(root, map));
  return { counts, problems };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/component-map/component-map.ts check [--root <dir>]"].join("\n");

function parseOptions(argv: readonly string[]): { root: string } {
  const options = { root: resolve(import.meta.dir, "..", "..") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    options.root = resolve(value);
  }
  return options;
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "check": {
        const options = parseOptions(rest);
        const result = check(options.root);
        for (const [name, count] of Object.entries(result.counts)) {
          process.stdout.write(`${name}: ${count} test files\n`);
        }
        if (result.problems.length > 0) {
          process.stderr.write(`Component map check failed (FR-1):\n${result.problems.map((line) => `  ${line}\n`).join("")}`);
          return 1;
        }
        const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
        process.stdout.write(`Component map OK: ${total} test files map to exactly one Component.\n`);
        return 0;
      }
      default:
        throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Component map ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
