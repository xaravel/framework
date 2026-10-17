// Builds the package table `tools/scaffold/packages.jsonl` (Story 1.2, AD-2).
//
//   bun tools/scaffold/table.ts --upstream <laravel/framework checkout at the Pin>
//       prints the table to stdout
//   bun tools/scaffold/table.ts --upstream <dir> --check
//       compares it with the committed table; exits 1 with a diff summary
//
// `--upstream` defaults to $XARAVEL_UPSTREAM. The checkout must be
// `laravel/framework` at the tag in `conformance/baseline-pin`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type Kind = "upstream" | "xaravel" | "grader" | "distribution";

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

export function buildTable(upstream: string): PackageRow[] {
  const illuminate = join(upstream, "src", "Illuminate");
  if (!existsSync(illuminate)) {
    throw new Error(`${illuminate} does not exist; --upstream must be a laravel/framework checkout`);
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
  let upstream: string | null = process.env.XARAVEL_UPSTREAM ?? null;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--upstream") {
      upstream = argv[++i] ?? null;
    } else if (arg === "--check") {
      check = true;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      return 2;
    }
  }
  if (upstream === null || upstream === "") {
    process.stderr.write("Usage: bun tools/scaffold/table.ts --upstream <laravel/framework checkout> [--check]\n");
    return 2;
  }
  const built = serializeTable(buildTable(resolve(upstream)));
  if (!check) {
    process.stdout.write(built);
    return 0;
  }
  const committedPath = join(import.meta.dir, "packages.jsonl");
  const committed = existsSync(committedPath) ? readFileSync(committedPath, "utf8") : "";
  if (committed === built) {
    process.stdout.write("packages.jsonl matches the Upstream checkout.\n");
    return 0;
  }
  const want = new Set(built.split("\n").filter((line) => line !== ""));
  const have = new Set(committed.split("\n").filter((line) => line !== ""));
  const lines = ["packages.jsonl differs from the table built from the Upstream checkout:"];
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
