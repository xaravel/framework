// Builds the package table `tools/scaffold/packages.jsonl` (Story 1.2, AD-2).
//
//   bun tools/scaffold/table.ts [--root <dir>]
//       prints the table to stdout
//   bun tools/scaffold/table.ts [--root <dir>] --check
//       compares it with the committed table; exits 1 with a diff summary
//
// It reads `laravel/framework` only from the Upstream snapshot,
// `<root>/conformance/upstream/framework` (Story 2.1, FR-1), and never
// fetches; run `bun run upstream:sync` first.
//
// A row's `require` and `suggest` are its Upstream `composer.json` lists
// (Foundation's come from its imports). A row may also carry `uses`: packages
// its Upstream source uses directly but reaches only through its `require`
// graph, each with its reason (`UPSTREAM_USES`, ESC-15.1-1). The scaffold makes
// each a workspace dependency; `usesProblems` rejects one that names no package
// row, is not reachable through `require`, is already a dependency, would close
// a cycle, or has an empty reason.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { upstreamPath } from "../upstream/upstream";

export type Kind = "upstream" | "xaravel" | "grader" | "distribution";

/** A package a row's Upstream source uses directly but reaches only through its `require` graph. */
export interface UpstreamUse {
  package: string;
  reason: string;
}

export interface PackageRow {
  name: string;
  dir: string;
  npm: string;
  phase: number;
  kind: Kind;
  upstream: string | null;
  private: boolean;
  require: string[];
  suggest: string[];
  /** Present only on a row with `UPSTREAM_USES` entries. */
  uses?: UpstreamUse[];
}

/** Phase (PRD §7.3, AD-27) of every Upstream component at the Pin, keyed by its directory under `src/Illuminate/`. */
export const UPSTREAM_PHASES: Readonly<Record<string, number>> = {
  Auth: 8,
  Broadcasting: 8,
  Bus: 3,
  Cache: 5,
  Collections: 1,
  Concurrency: 8,
  Conditionable: 1,
  Config: 1,
  Console: 7,
  Container: 2,
  Contracts: 1,
  Cookie: 6,
  Database: 4,
  Encryption: 3,
  Events: 3,
  Filesystem: 3,
  Foundation: 6,
  Hashing: 3,
  Http: 6,
  Image: 8,
  JsonSchema: 1,
  Log: 3,
  Macroable: 1,
  Mail: 7,
  Notifications: 8,
  Pagination: 5,
  Pipeline: 3,
  Process: 3,
  Queue: 8,
  Redis: 5,
  Reflection: 1,
  Routing: 6,
  Session: 6,
  Support: 2,
  Testing: 7,
  Translation: 3,
  Validation: 5,
  View: 6,
};

/**
 * Packages a row's Upstream source uses directly but reaches only through its
 * `require` graph, keyed by row name. Each becomes a workspace dependency, so
 * the port can import what Upstream's source does; `usesProblems` keeps every
 * such edge on Upstream's composer graph.
 */
export const UPSTREAM_USES: Readonly<Record<string, readonly UpstreamUse[]>> = {
  // ESC-15.1-1.
  config: [
    {
      package: "illuminate/macroable",
      reason: "Illuminate\\Config\\Repository uses Illuminate\\Support\\Traits\\Macroable, reached through illuminate/collections' require",
    },
  ],
};

/** Rows with no Upstream `composer.json` at the Pin. Their `require`/`suggest` lists are empty. */
const STATIC_ROWS: readonly Omit<PackageRow, "require" | "suggest">[] = [
  { name: "ai", dir: "packages/ai", npm: "@xaravel/ai", phase: 9, kind: "upstream", upstream: "laravel/ai", private: false },
  { name: "assert", dir: "packages/assert", npm: "@xaravel/assert", phase: 0, kind: "grader", upstream: null, private: false },
  { name: "boost", dir: "packages/boost", npm: "@xaravel/boost", phase: 8, kind: "xaravel", upstream: "laravel/boost", private: false },
  { name: "boost-framework", dir: "tools/boost-framework", npm: "@xaravel/boost-framework", phase: 0, kind: "grader", upstream: null, private: true },
  { name: "create-xaravel", dir: "installer", npm: "create-xaravel", phase: 7, kind: "distribution", upstream: null, private: false },
  { name: "finder", dir: "packages/finder", npm: "@xaravel/finder", phase: 3, kind: "xaravel", upstream: "symfony/finder", private: false },
  { name: "framework", dir: "packages/framework", npm: "@xaravel/framework", phase: 7, kind: "distribution", upstream: null, private: false },
  { name: "htmx", dir: "packages/htmx", npm: "@xaravel/htmx", phase: 6, kind: "xaravel", upstream: null, private: false },
  { name: "http-foundation", dir: "packages/http-foundation", npm: "@xaravel/http-foundation", phase: 3, kind: "xaravel", upstream: "symfony/http-foundation", private: false },
  { name: "mcp", dir: "packages/mcp", npm: "@xaravel/mcp", phase: 8, kind: "upstream", upstream: "laravel/mcp", private: false },
  { name: "mime", dir: "packages/mime", npm: "@xaravel/mime", phase: 3, kind: "xaravel", upstream: "symfony/mime", private: false },
  { name: "mockery", dir: "packages/mockery", npm: "@xaravel/mockery", phase: 0, kind: "grader", upstream: null, private: false },
  { name: "runtime", dir: "packages/runtime", npm: "@xaravel/runtime", phase: 1, kind: "xaravel", upstream: null, private: false },
  { name: "serializable-closure", dir: "packages/serializable-closure", npm: "@xaravel/serializable-closure", phase: 3, kind: "xaravel", upstream: "laravel/serializable-closure", private: false },
  { name: "testbench", dir: "packages/testbench", npm: "@xaravel/testbench", phase: 7, kind: "xaravel", upstream: null, private: false },
];

/** `JsonSchema` → `json-schema`. */
export function kebab(component: string): string {
  return component.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function illuminateKeys(section: unknown): string[] {
  if (typeof section !== "object" || section === null) {
    return [];
  }
  return [...new Set(Object.keys(section).filter((key) => key.startsWith("illuminate/")))].sort();
}

function walkPhp(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walkPhp(path, out);
    } else if (entry.endsWith(".php")) {
      out.push(path);
    }
  }
  return out;
}

interface Composer {
  name?: string;
  require?: Record<string, string>;
  suggest?: Record<string, string>;
  autoload?: { "psr-4"?: Record<string, string>; files?: string[] };
}

/**
 * Maps every class and namespaced function declared by an Upstream component
 * to that component's composer name (`illuminate/<x>`), using its PSR-4 and
 * `files` autoload entries.
 */
function symbolIndex(illuminate: string, components: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const component of components) {
    const composer = JSON.parse(readFileSync(join(illuminate, component, "composer.json"), "utf8")) as Composer;
    const owner = composer.name ?? `illuminate/${kebab(component)}`;
    for (const [prefix, path] of Object.entries(composer.autoload?.["psr-4"] ?? {})) {
      const base = join(illuminate, component, path);
      for (const file of walkPhp(base)) {
        const fqcn = prefix + relative(base, file).replace(/\.php$/, "").replaceAll("/", "\\");
        index.set(fqcn, owner);
      }
    }
    for (const file of composer.autoload?.files ?? []) {
      const text = readFileSync(join(illuminate, component, file), "utf8");
      const ns = /^namespace\s+([^;\s]+)\s*;/m.exec(text)?.[1];
      if (ns === undefined) {
        continue;
      }
      for (const match of text.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
        index.set(`${ns}\\${match[1]}`, owner);
      }
    }
  }
  return index;
}

/**
 * Every `Illuminate\<Ns>\…` reference in Foundation's PHP sources, mapped to
 * the composer name of the component that declares it. A reference to a
 * namespace rather than a symbol resolves to the components declaring symbols
 * under it; anything else falls back to the component named by `<Ns>`.
 */
function foundationEdges(illuminate: string, components: readonly string[]): string[] {
  const index = symbolIndex(illuminate, components);
  const byNamespacePrefix = (ref: string): string[] => {
    const owners = new Set<string>();
    for (const [symbol, owner] of index) {
      if (symbol.startsWith(`${ref}\\`)) {
        owners.add(owner);
      }
    }
    return [...owners];
  };
  const edges = new Set<string>();
  const unresolved = new Set<string>();
  for (const file of walkPhp(join(illuminate, "Foundation"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/Illuminate((?:\\{1,2}[A-Za-z_][A-Za-z0-9_]*)+)/g)) {
      const ref = `Illuminate${match[1]!.replaceAll("\\\\", "\\")}`;
      const segment = ref.split("\\")[1]!;
      if (segment === "Foundation") {
        continue;
      }
      const exact = index.get(ref);
      if (exact !== undefined) {
        edges.add(exact);
        continue;
      }
      const owners = byNamespacePrefix(ref);
      if (owners.length > 0) {
        for (const owner of owners) {
          edges.add(owner);
        }
        continue;
      }
      if (segment in UPSTREAM_PHASES && components.includes(segment)) {
        edges.add(`illuminate/${kebab(segment)}`);
      } else {
        unresolved.add(ref);
      }
    }
  }
  if (unresolved.size > 0) {
    throw new Error(`Unresolved Illuminate references in Foundation: ${[...unresolved].sort().join(", ")}`);
  }
  return [...edges].sort();
}

/** Every composer name reached from `start`, itself included, following `edges` of each row (by Upstream name). */
function reachable(rows: readonly PackageRow[], start: readonly string[], edges: (row: PackageRow) => readonly string[]): Set<string> {
  const byUpstream = new Map<string, PackageRow>();
  for (const row of rows) {
    if (row.upstream !== null) {
      byUpstream.set(row.upstream, row);
    }
  }
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    const row = byUpstream.get(next);
    if (row !== undefined) {
      queue.push(...edges(row));
    }
  }
  return seen;
}

/** The well-formed `package` names of a row's `uses`. */
function usePackages(row: PackageRow): string[] {
  if (!Array.isArray(row.uses)) {
    return [];
  }
  return row.uses.flatMap((use: unknown) => {
    const name = typeof use === "object" && use !== null ? (use as Record<string, unknown>)["package"] : null;
    return typeof name === "string" ? [name] : [];
  });
}

/**
 * Every problem with `row`'s `uses` edges, one line each; empty when sound. Each
 * edge must name a package row, not the row itself, be reachable through the
 * `require` graph, not already be a dependency (a direct `require`, or
 * `illuminate/contracts`, which every upstream and xaravel package has), not
 * repeat, not close a cycle over `require` and `uses`, and give a non-empty
 * reason.
 */
export function usesProblems(rows: readonly PackageRow[], row: PackageRow): string[] {
  if (row.uses === undefined) {
    return [];
  }
  const where = `${row.name}: uses`;
  if (!Array.isArray(row.uses) || row.uses.length === 0) {
    return [`${where} must be a non-empty array of { package, reason } (omit it when there is none)`];
  }
  const problems: string[] = [];
  const viaRequire = reachable(rows, row.require, (other) => other.require);
  const seen = new Set<string>();
  for (const use of row.uses as unknown[]) {
    if (typeof use !== "object" || use === null || Array.isArray(use) || Object.keys(use).sort().join(",") !== "package,reason") {
      problems.push(`${where} entry ${JSON.stringify(use)} must have exactly the fields package and reason`);
      continue;
    }
    const { package: name, reason } = use as Record<string, unknown>;
    if (typeof name !== "string" || typeof reason !== "string") {
      problems.push(`${where} entry ${JSON.stringify(use)} must have a string package and a string reason`);
      continue;
    }
    const label = `${where} ${name}`;
    if (reason.trim() === "") {
      problems.push(`${label} has an empty reason`);
    }
    if (seen.has(name)) {
      problems.push(`${label} is listed twice`);
      continue;
    }
    seen.add(name);
    if (!rows.some((other) => other.upstream === name)) {
      problems.push(`${label} names no package row (no row ports ${name})`);
    } else if (name === row.upstream) {
      problems.push(`${label} names the row itself`);
    } else if (row.require.includes(name)) {
      problems.push(`${label} is already a direct require`);
    } else if (name === "illuminate/contracts" && (row.kind === "upstream" || row.kind === "xaravel")) {
      problems.push(`${label} is already a dependency of every upstream and xaravel package (AD-2)`);
    } else if (!viaRequire.has(name)) {
      problems.push(`${label} is not reachable through ${row.name}'s require graph, so the edge would not trace to Upstream's composer graph`);
    } else if (row.upstream !== null && reachable(rows, [name], (other) => [...other.require, ...usePackages(other)]).has(row.upstream)) {
      problems.push(`${label} would create a cycle: ${name} reaches ${row.upstream} through require and uses`);
    }
  }
  return problems;
}

/** Throws naming every unsound `uses` edge in `rows` (ESC-15.1-1). */
export function assertUses(rows: readonly PackageRow[]): void {
  const problems = rows.flatMap((row) => usesProblems(rows, row));
  if (problems.length > 0) {
    throw new Error(`Invalid uses in the package table:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
  }
}

export function buildTable(upstream: string): PackageRow[] {
  const illuminate = join(upstream, "src", "Illuminate");
  if (!existsSync(illuminate)) {
    throw new Error(`${illuminate} does not exist; the Upstream must be a laravel/framework tree`);
  }
  const dirs = readdirSync(illuminate)
    .filter((entry) => statSync(join(illuminate, entry)).isDirectory())
    .sort();
  const unknown = dirs.filter((dir) => !(dir in UPSTREAM_PHASES));
  const missing = Object.keys(UPSTREAM_PHASES).filter((dir) => !dirs.includes(dir));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `Upstream components differ from the Phase map: unknown [${unknown.join(", ")}], missing [${missing.join(", ")}]`,
    );
  }
  const withComposer = dirs.filter((dir) => existsSync(join(illuminate, dir, "composer.json")));
  const phaseOf = new Map<string, number>(
    Object.entries(UPSTREAM_PHASES).map(([dir, phase]) => [`illuminate/${kebab(dir)}`, phase]),
  );

  const rows: PackageRow[] = [];
  for (const dir of dirs) {
    const name = kebab(dir);
    const phase = UPSTREAM_PHASES[dir]!;
    let require: string[];
    let suggest: string[];
    if (withComposer.includes(dir)) {
      const composer = JSON.parse(readFileSync(join(illuminate, dir, "composer.json"), "utf8")) as Composer;
      if (composer.name !== `illuminate/${name}`) {
        throw new Error(`${dir}/composer.json is named ${String(composer.name)}, expected illuminate/${name}`);
      }
      require = illuminateKeys(composer.require);
      suggest = illuminateKeys(composer.suggest);
    } else if (dir === "Foundation") {
      // Foundation: edges from code imports. Components of its own or an
      // earlier Phase are static dependencies; later ones are reached by FQCN
      // only (AD-2), so they are optional peers.
      const edges = foundationEdges(illuminate, withComposer);
      require = edges.filter((edge) => (phaseOf.get(edge) ?? Infinity) <= phase);
      suggest = edges.filter((edge) => (phaseOf.get(edge) ?? Infinity) > phase);
    } else {
      throw new Error(`${dir} has no composer.json; only Foundation's edges are derived from imports`);
    }
    rows.push({
      name,
      dir: `packages/${name}`,
      npm: `@xaravel/${name}`,
      phase,
      kind: "upstream",
      upstream: `illuminate/${name}`,
      private: false,
      require,
      suggest,
    });
  }
  for (const row of STATIC_ROWS) {
    rows.push({ ...row, require: [], suggest: [] });
  }
  for (const [name, uses] of Object.entries(UPSTREAM_USES)) {
    const row = rows.find((candidate) => candidate.name === name);
    if (row === undefined) {
      throw new Error(`UPSTREAM_USES names ${name}, which has no package row`);
    }
    row.uses = [...uses].sort((a, b) => (a.package < b.package ? -1 : a.package > b.package ? 1 : 0)).map((use) => ({ ...use }));
  }
  assertUses(rows);
  return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function serializeTable(rows: readonly PackageRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

export function readTable(path: string): PackageRow[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as PackageRow);
}

function main(argv: readonly string[]): number {
  let root = resolve(import.meta.dir, "..", "..");
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i];
      if (value === undefined || value === "") {
        process.stderr.write("Usage: bun tools/scaffold/table.ts [--root <dir>] [--check]\n");
        return 2;
      }
      root = resolve(value);
    } else if (arg === "--check") {
      check = true;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      return 2;
    }
  }
  let upstream: string;
  try {
    upstream = upstreamPath(root, "framework", ".");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const built = serializeTable(buildTable(upstream));
  if (!check) {
    process.stdout.write(built);
    return 0;
  }
  const committedPath = join(import.meta.dir, "packages.jsonl");
  const committed = existsSync(committedPath) ? readFileSync(committedPath, "utf8") : "";
  if (committed === built) {
    process.stdout.write("packages.jsonl matches the Upstream snapshot.\n");
    return 0;
  }
  const want = new Set(built.split("\n").filter((line) => line !== ""));
  const have = new Set(committed.split("\n").filter((line) => line !== ""));
  const lines = ["packages.jsonl differs from the table built from the Upstream snapshot:"];
  for (const line of have) {
    if (!want.has(line)) {
      lines.push(`- ${line}`);
    }
  }
  for (const line of want) {
    if (!have.has(line)) {
      lines.push(`+ ${line}`);
    }
  }
  if (lines.length === 1) {
    lines.push("(same rows, different order or line endings)");
  }
  process.stderr.write(lines.join("\n") + "\n");
  return 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
